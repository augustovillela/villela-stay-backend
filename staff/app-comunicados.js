'use strict';
// ============================================================================
// Portal Staff — módulo: app-comunicados (📣 Comunicados aos usuários)
// Central ÚNICA para avisar alunos, assinantes, produtores e clientes de
// TODOS os sistemas do grupo: aviso no app (sino 🔔), e-mail e WhatsApp.
// Fala com /staff/api/comunicados/*. Enviar exige sessão de admin e passa
// por uma confirmação com os números do público.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const COM = { cfg: null, editando: null, previa: null };

const comFmt = (iso) => iso ? dataBr(iso) : '—';
const comStatus = {
  rascunho: ['rascunho', ''], agendado: ['agendado', 'st-andamento'], enviando: ['saindo…', 'st-andamento'],
  enviado: ['enviado', 'st-feito'], cancelado: ['cancelado', 'st-erro'], arquivado: ['arquivado', ''],
};
const comCanalRot = { app: '🔔 Aviso no app', email: '✉️ E-mail', whatsapp: '💬 WhatsApp' };

async function renderComunicados() {
  conteudo().innerHTML = cabecalho('📣 Comunicados aos usuários',
    'Avise alunos, assinantes, produtores e clientes de todos os sistemas do grupo — novidades, melhorias, instabilidades, suporte e dicas. '
    + 'Sai como aviso dentro do app (sino 🔔), por e-mail e por WhatsApp.')
    + '<div id="com-canais" class="cards"></div><div id="com-editor"></div><div id="com-hist"><p class="vazio">Carregando…</p></div>';
  try { COM.cfg = await api('GET', '/comunicados/config'); }
  catch (e) { $('#com-hist').innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  comPintarCanais();
  comEditor(null);
  comHistorico();
}

function comPintarCanais() {
  const c = COM.cfg.canais;
  const card = (rot, ok, det) => `<div class="card"><div class="n" style="font-size:1.1rem">${ok ? '✅' : '⛔'}</div><div class="rot">${rot}<br><span class="obs">${esc(det)}</span></div></div>`;
  $('#com-canais').innerHTML =
    card(comCanalRot.app, true, 'sino nos apps')
    + card(comCanalRot.email, c.email.ok, c.email.ok ? `${c.email.enviados_hoje}/${c.email.teto_dia} hoje · via ${c.email.provedor === 'resend' ? 'Resend' : 'Gmail'}` : c.email.motivo)
    + card(comCanalRot.whatsapp, c.whatsapp.ok, !c.whatsapp.ok ? 'indisponível — ver abaixo'
      : c.whatsapp.modo === 'business' ? `${c.whatsapp.enviados_hoje}/${c.whatsapp.teto_dia} hoje · número business`
        : `pelo SEU número (${c.whatsapp.numero || 'pessoal'}) · teto ${c.whatsapp.teto_dia}/dia`);
}

// ---------------- editor ----------------
function comEditor(c) {
  COM.editando = c ? c.id : null;
  COM.previa = null;
  const cfg = COM.cfg;
  const v = c || { categoria: 'novidade', titulo: '', corpo: '', alvos: [], canais: ['app', 'email'], destaque: false };
  const alvo = (chave) => (v.alvos || []).find(a => a.produto === chave);
  const cats = Object.entries(cfg.categorias).map(([k, x]) =>
    `<option value="${k}" ${v.categoria === k ? 'selected' : ''}>${x.emoji} ${esc(x.rotulo)}${x.operacional ? ' (operacional)' : ''}</option>`).join('');
  const prods = cfg.produtos.map(p => {
    const a = alvo(p.chave);
    const segs = p.segmentos.map(g => `<option value="${esc(g.id)}" ${a && a.segmento === g.id ? 'selected' : ''}>${esc(g.rotulo)}</option>`).join('');
    return `<div class="com-prod" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--linha,#eee)">
      <label style="display:flex;flex-direction:row;align-items:center;gap:8px;min-width:240px;margin:0${p.indisponivel ? ';opacity:.55' : ''}"><input type="checkbox" style="width:auto;margin:0" class="com-p" value="${esc(p.chave)}" ${a && !p.indisponivel ? 'checked' : ''} ${p.indisponivel ? 'disabled' : ''}> ${p.emoji} <b>${esc(p.nome)}</b></label>
      ${p.indisponivel ? `<span class="obs">⛔ ${esc(p.indisponivel)}</span>`
        : `<select class="com-seg" data-p="${esc(p.chave)}" ${a ? '' : 'disabled'} style="max-width:320px">${segs}</select>
      ${p.aviso ? `<span class="obs">${esc(p.aviso)}</span>` : ''}`}</div>`;
  }).join('');
  const canal = (k) => {
    const d = cfg.canais[k]; const ok = k === 'app' || d.ok;
    return `<label style="display:inline-flex;flex-direction:row;align-items:center;gap:6px;margin:2px 18px 2px 0" title="${ok ? '' : esc(d.motivo)}">
      <input type="checkbox" style="width:auto;margin:0" class="com-c" value="${k}" ${(v.canais || []).includes(k) && ok ? 'checked' : ''} ${ok ? '' : 'disabled'}> ${comCanalRot[k]}${ok ? '' : ' <span class="obs">(indisponível)</span>'}</label>`;
  };
  const expira = v.expira_em ? new Date(new Date(v.expira_em).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  $('#com-editor').innerHTML = `<details class="cr-box" ${c || !COM.jaAbriu ? 'open' : ''} id="com-box"><summary class="cr-sum">${c ? '✏️ Editando rascunho' : '➕ Novo comunicado'}</summary>
    <form class="form" id="com-form" style="max-width:860px;margin-top:12px">
      <div class="hi-grid">
        <label>Tipo de aviso <select id="com-cat">${cats}</select></label>
        <label>Título * <input id="com-tit" maxlength="140" value="${esc(v.titulo)}" placeholder="Ex.: Nova área de certificados"></label>
      </div>
      <label>Mensagem * <textarea id="com-corpo" rows="6" maxlength="4000" placeholder="Escreva como falaria com o cliente. Linha em branco separa parágrafos.">${esc(v.corpo)}</textarea></label>
      <div class="hi-grid">
        <label>Link (opcional) <input id="com-link" value="${esc(v.link_url || '')}" placeholder="https://…"></label>
        <label>Texto do botão <input id="com-lrot" maxlength="40" value="${esc(v.link_rotulo || '')}" placeholder="Ex.: Ver novidade"></label>
      </div>
      <fieldset style="border:1px solid var(--linha,#ddd);border-radius:8px;padding:10px;margin:10px 0">
        <legend style="padding:0 6px">Para quem? (sistema e público)</legend>
        <label style="display:flex;flex-direction:row;align-items:center;gap:8px;margin:0 0 6px"><input type="checkbox" id="com-todos" style="width:auto;margin:0"> <span><b>Todos os sistemas</b> <span class="obs">— use para instabilidade geral da plataforma</span></span></label>
        ${prods}
      </fieldset>
      <fieldset style="border:1px solid var(--linha,#ddd);border-radius:8px;padding:10px;margin:10px 0">
        <legend style="padding:0 6px">Por onde?</legend>
        ${canal('app')}${canal('email')}${canal('whatsapp')}
        ${cfg.canais.whatsapp.ok
          ? (cfg.canais.whatsapp.modo === 'pessoal' ? `<p class="obs" style="margin:6px 0 0">⚠️ ${esc(cfg.canais.whatsapp.aviso || '')}</p>` : '')
          : `<p class="obs" style="margin:6px 0 0">💬 ${esc(cfg.canais.whatsapp.motivo)}</p>`}
      </fieldset>
      <div class="hi-grid">
        <label style="display:flex;flex-direction:row;gap:8px;align-items:flex-start"><input type="checkbox" id="com-dest" style="width:auto;margin-top:3px" ${v.destaque ? 'checked' : ''}> Faixa em destaque (fundo âmbar, para instabilidade) <span class="obs">— todo aviso não lido já aparece como faixa no topo do app; isto só muda a cor e o peso</span></label>
        <label>Sai do app em (opcional) <input type="datetime-local" id="com-exp" value="${expira}"></label>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn secund" type="button" id="com-ver">👥 Ver público e prévia</button>
        <button class="btn secund" type="submit">💾 Salvar rascunho</button>
        ${c ? '<button class="btn secund" type="button" id="com-novo">Começar outro</button>' : ''}
      </div>
      <p id="com-msg" class="erro"></p>
    </form>
    <div id="com-previa"></div></details>`;
  COM.jaAbriu = true;

  const syncSeg = () => document.querySelectorAll('.com-p').forEach(cb => { const sel = document.querySelector(`.com-seg[data-p="${cb.value}"]`); if (sel) sel.disabled = !cb.checked; });
  document.querySelectorAll('.com-p').forEach(cb => cb.onchange = () => { if (!cb.checked) $('#com-todos').checked = false; syncSeg(); COM.previa = null; });
  $('#com-todos').onchange = () => { document.querySelectorAll('.com-p:not([disabled])').forEach(cb => cb.checked = $('#com-todos').checked); syncSeg(); };
  // Instabilidade e manutenção pedem faixa no topo e prazo para sumir.
  $('#com-cat').onchange = () => {
    const k = $('#com-cat').value;
    if (k === 'instabilidade' || k === 'manutencao') {
      $('#com-dest').checked = true;
      if (!$('#com-exp').value) $('#com-exp').value = new Date(Date.now() + 48 * 3600e3 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
  };
  $('#com-ver').onclick = () => comPrevia();
  $('#com-form').onsubmit = async (ev) => { ev.preventDefault(); await comSalvar(); };
  if ($('#com-novo')) $('#com-novo').onclick = () => comEditor(null);
}

function comLerForm() {
  const alvos = [...document.querySelectorAll('.com-p')].filter(cb => cb.checked)
    .map(cb => ({ produto: cb.value, segmento: (document.querySelector(`.com-seg[data-p="${cb.value}"]`) || {}).value || 'todos' }));
  const exp = $('#com-exp').value;
  return {
    categoria: $('#com-cat').value, titulo: $('#com-tit').value.trim(), corpo: $('#com-corpo').value.trim(),
    link_url: $('#com-link').value.trim(), link_rotulo: $('#com-lrot').value.trim(),
    alvos, canais: [...document.querySelectorAll('.com-c')].filter(cb => cb.checked).map(cb => cb.value),
    destaque: $('#com-dest').checked, expira_em: exp ? new Date(exp).toISOString() : null,
  };
}

async function comSalvar() {
  const msg = $('#com-msg'); msg.className = 'erro'; msg.textContent = '';
  try {
    const d = comLerForm();
    const r = COM.editando ? await api('PUT', `/comunicados/${COM.editando}`, d) : await api('POST', '/comunicados', d);
    COM.editando = r.comunicado.id;
    msg.className = 'ok'; msg.textContent = 'Rascunho salvo.';
    comHistorico();
    return r.comunicado;
  } catch (e) { msg.textContent = e.message; return null; }
}

async function comPrevia() {
  const box = $('#com-previa'); const msg = $('#com-msg'); msg.textContent = '';
  box.innerHTML = '<p class="vazio">Contando o público em cada sistema…</p>';
  let p;
  try { p = await api('POST', '/comunicados/previa', comLerForm()); }
  catch (e) { box.innerHTML = ''; msg.className = 'erro'; msg.textContent = e.message; return; }
  COM.previa = p;
  const bloco = (k) => {
    const x = p.canais[k]; if (!x) return '';
    const nomeP = (k) => (COM.cfg.produtos.find(y => y.chave === k) || { nome: k }).nome;
    const am = (x.amostra || []).map(a => `<li>${esc(a.nome || '(sem nome)')} <span class="obs">· ${esc(nomeP(a.produto))}${a.destino ? ' · ' + esc(a.destino) : ''}</span></li>`).join('');
    const extra = k === 'whatsapp' ? `<br><span class="obs">≈ ${x.operacoes_make} operações do Make${p.dias_estimados.whatsapp > 1 ? ` · sai em ${p.dias_estimados.whatsapp} dias (teto diário)` : ''}</span>`
      : k === 'email' && p.dias_estimados.email > 1 ? `<br><span class="obs">sai em ${p.dias_estimados.email} dias (teto diário do Gmail)</span>` : '';
    return `<div class="card" style="min-width:220px"><div class="n">${x.total}</div><div class="rot">${comCanalRot[k]}${extra}</div>${am ? `<ul class="obs" style="text-align:left;margin:6px 0 0;padding-left:18px">${am}</ul>` : ''}</div>`;
  };
  const f = p.fora;
  const foraTxt = [
    f.sem_email && `${f.sem_email} sem e-mail`, f.sem_telefone && `${f.sem_telefone} sem telefone`,
    f.descadastrado_email && `${f.descadastrado_email} pediram para não receber e-mail`,
    f.descadastrado_whatsapp && `${f.descadastrado_whatsapp} pediram para não receber WhatsApp`,
    f.repetido && `${f.repetido} repetidos (mesma pessoa em mais de um sistema — recebe uma vez só)`,
  ].filter(Boolean).join(' · ');
  const porProd = (p.por_produto || []).map(x => { const pr = COM.cfg.produtos.find(y => y.chave === x.produto) || {}; return `${pr.emoji || ''} ${esc(pr.nome || x.produto)}: ${x.pessoas}`; }).join(' · ');
  const wa = p.exemplo.whatsapp ? `<div class="cr-box" style="margin-top:10px"><b>💬 WhatsApp (modelo)</b><br><span class="obs">{{1}} ${esc(p.exemplo.whatsapp[0])} · {{2}} ${esc(p.exemplo.whatsapp[1])}</span><br>{{3}} ${esc(p.exemplo.whatsapp[2])}</div>` : '';
  box.innerHTML = `<div class="cr-box" style="margin-top:14px;border-left:4px solid var(--acento,#0E7490)">
    <b>👥 ${p.pessoas} pessoa(s) no público</b><br><span class="obs">${porProd || '—'}</span>
    ${foraTxt ? `<p class="obs" style="margin:6px 0">Fora do envio: ${esc(foraTxt)}</p>` : ''}
    ${(p.erros || []).map(e => `<p class="erro">⚠️ ${esc(e.produto)}: ${esc(e.erro)}</p>`).join('')}
    <div class="cards" style="margin-top:8px">${bloco('app')}${bloco('email')}${bloco('whatsapp')}</div>
    ${p.exemplo.email_html ? `<p style="margin:10px 0 4px"><b>✉️ Prévia do e-mail</b> <span class="obs">— assunto: ${esc(p.exemplo.email_assunto)}</span></p>
      <iframe id="com-if" sandbox="" style="width:100%;max-width:640px;height:460px;border:1px solid var(--linha,#ddd);border-radius:10px;background:#fff"></iframe>` : ''}
    ${wa}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      ${p.canais.email || p.canais.whatsapp ? '<button class="btn secund" id="com-teste">🧪 Enviar teste para mim</button>' : ''}
      <button class="btn" id="com-enviar">📣 Enviar agora</button>
      <label style="display:flex;gap:6px;align-items:center;margin:0">ou agendar <input type="datetime-local" id="com-quando"></label>
      <button class="btn secund" id="com-agendar">🕒 Agendar</button>
    </div><p id="com-msg2" class="erro"></p></div>`;
  if ($('#com-if')) $('#com-if').srcdoc = p.exemplo.email_html;
  if ($('#com-teste')) $('#com-teste').onclick = comTeste;
  $('#com-enviar').onclick = () => comEnviar(null);
  $('#com-agendar').onclick = () => { const q = $('#com-quando').value; if (!q) { $('#com-msg2').textContent = 'Escolha data e hora.'; return; } comEnviar(new Date(q).toISOString()); };
}

async function comTeste() {
  const m = $('#com-msg2') || $('#com-msg'); m.className = 'erro'; m.textContent = '';
  const c = await comSalvar(); if (!c) return;
  const tel = prompt('WhatsApp para o teste (só números, com DDD):', COM.cfg.minha_conta.telefone || '');
  if (tel === null) return;
  const emailApp = prompt('Para VER O AVISO DENTRO DO APP: qual e-mail da SUA conta no sistema escolhido?\n(deixe em branco para pular)', COM.cfg.minha_conta.email || '');
  try {
    const r = await api('POST', `/comunicados/${c.id}/teste`, { email: COM.cfg.minha_conta.email, telefone: tel, email_no_app: emailApp || '' });
    const { lembrete, ...canais } = r.resultado;
    m.className = 'ok';
    m.innerHTML = Object.entries(canais).map(([k, v]) => `${comCanalRot[k] || k}: ${esc(v)}`).join('<br>')
      + (lembrete ? `<br><b>${esc(lembrete)}</b>` : '');
  } catch (e) { m.textContent = e.message; }
}

async function comEnviar(agendarPara) {
  const m = $('#com-msg2') || $('#com-msg'); m.className = 'erro'; m.textContent = '';
  const c = await comSalvar(); if (!c) return;
  await comPrevia();                       // números frescos, do rascunho salvo
  const p = COM.previa; if (!p) return;
  const linhas = Object.entries(p.canais).filter(([, x]) => x).map(([k, x]) => `• ${comCanalRot[k]}: ${x.total}${k === 'whatsapp' ? ` (≈ ${x.operacoes_make} operações do Make)` : ''}`);
  const cat = COM.cfg.categorias[c.categoria];
  const texto = `${agendarPara ? 'AGENDAR' : 'ENVIAR AGORA'} o comunicado:\n\n${cat.emoji} "${c.titulo}"\n\n${linhas.join('\n')}\n\n${p.pessoas} pessoa(s) em ${c.alvos.length} sistema(s).`
    + (agendarPara ? `\nQuando: ${dataBr(agendarPara)}` : '') + '\n\nMensagens a clientes reais não têm volta. Confirmar?';
  if (!confirm(texto)) return;
  try {
    const r = await api('POST', `/comunicados/${c.id}/enviar`, { confirmar: true, agendar_para: agendarPara });
    const $m = $('#com-msg2'); if ($m) { $m.className = 'ok'; $m.textContent = r.comunicado.status === 'agendado' ? 'Agendado.' : 'Enviado para a fila — acompanhe no histórico abaixo.'; }
    comEditor(null); comHistorico();
  } catch (e) { const $m = $('#com-msg2'); if ($m) $m.textContent = e.message; else alert(e.message); }
}

// ---------------- histórico ----------------
async function comHistorico() {
  const box = $('#com-hist'); if (!box) return;
  let lista;
  try { lista = (await api('GET', '/comunicados')).comunicados; }
  catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  const nomeP = (k) => { const p = COM.cfg.produtos.find(x => x.chave === k); return p ? `${p.emoji} ${p.nome}` : k; };
  const segR = (a) => { const p = COM.cfg.produtos.find(x => x.chave === a.produto); const g = p && p.segmentos.find(y => y.id === a.segmento); return g ? g.rotulo : a.segmento; };
  const est = (c) => Object.entries(c.estatisticas || {}).map(([k, x]) => {
    if (k === 'app') return `🔔 ${(x.disponivel || 0) + (x.lido || 0)} · ${x.lidos || 0} leram`;
    const partes = [x.enviado && `${x.enviado} ✓`, x.pendente && `${x.pendente} na fila`, x.erro && `<b class="erro">${x.erro} falha(s)</b>`, x.pulado && `${x.pulado} cancelado(s)`].filter(Boolean);
    return `${k === 'email' ? '✉️' : '💬'} ${partes.join(' · ') || '—'}`;
  }).join('<br>');
  const linhas = lista.map(c => {
    const [st, cls] = comStatus[c.status] || [c.status, ''];
    const cat = COM.cfg.categorias[c.categoria] || { emoji: '', rotulo: c.categoria };
    const temErro = Object.values(c.estatisticas || {}).some(x => x && x.erro);
    const acoes = [
      c.status === 'rascunho' && `<button class="btn peq secund com-ed" data-id="${c.id}">editar / enviar</button><button class="btn peq secund com-del" data-id="${c.id}">excluir</button>`,
      ['agendado', 'enviando'].includes(c.status) && `<button class="btn peq secund com-can" data-id="${c.id}">cancelar</button>`,
      temErro && `<button class="btn peq secund com-err" data-id="${c.id}">ver falhas</button><button class="btn peq secund com-re" data-id="${c.id}">tentar de novo</button>`,
      ['enviado', 'enviando'].includes(c.status) && c.canais.includes('app') && `<button class="btn peq secund com-arq" data-id="${c.id}">tirar do app</button>`,
      c.status !== 'rascunho' && `<button class="btn peq secund com-dup" data-id="${c.id}">duplicar</button>`,
    ].filter(Boolean).join(' ');
    return [
      `${cat.emoji} <b>${esc(c.titulo)}</b><br><span class="obs" title="${esc(c.alvos.map(a => nomeP(a.produto) + ' — ' + segR(a)).join(' · '))}">${esc(cat.rotulo)} · ${c.alvos.length > 3
        ? `${c.alvos.length} sistemas`
        : c.alvos.map(a => esc(nomeP(a.produto)) + ' — ' + esc(segR(a))).join('; ')}${c.publico_total ? ` · ${c.publico_total} pessoa(s)` : ''}</span>`,
      c.canais.map(k => comCanalRot[k]).join('<br>'),
      `<span class="badge ${cls}">${esc(st)}</span><br><span class="obs">${c.status === 'agendado' ? 'para ' + comFmt(c.agendado_para) : comFmt(c.enviado_em || c.criado_em)}</span>`,
      est(c) || '—',
      acoes,
    ];
  });
  box.innerHTML = `<h2 class="titulo" style="font-size:1.05rem;margin-top:22px">Histórico</h2>`
    + (lista.length ? tabela(['Comunicado', 'Canais', 'Situação', 'Entregas', ''], linhas) : '<p class="vazio">Nenhum comunicado ainda.</p>')
    + `<div id="com-falhas"></div>
       <details class="cr-box" style="margin-top:16px"><summary class="cr-sum">🚫 Quem pediu para não receber</summary><div id="com-desc"><p class="vazio">Carregando…</p></div></details>
       <details class="cr-box" style="margin-top:16px"><summary class="cr-sum">💡 Dicas do app ("você sabia?")</summary><div id="com-dicas"><p class="vazio">Carregando…</p></div></details>
       <details class="cr-box" style="margin-top:10px"><summary class="cr-sum">🔒 Privacidade e retenção (LGPD)</summary><div id="com-lgpd"><p class="vazio">Carregando…</p></div></details>
       <details class="cr-box" style="margin-top:10px"><summary class="cr-sum">ℹ️ Como funciona</summary><div class="obs" style="padding:8px 4px;line-height:1.6">
         <p><b>Aviso no app</b>: aparece no sino 🔔 dentro do sistema. "Faixa no topo" mostra o aviso em destaque até a pessoa fechar — use para instabilidade.</p>
         <p><b>E-mail</b>: sai pelo Gmail em ritmo (${COM.cfg.canais.email.teto_dia || 400}/dia). O que passar do teto sai no dia seguinte, sozinho. Todo e-mail leva link de descadastro.</p>
         <p><b>WhatsApp</b>: sai pelo número business, SEMPRE por modelo aprovado pela Meta (fora da janela de 24 h a Meta não entrega texto livre). Cada mensagem custa ~2 operações do Make e uma tarifa da Meta.</p>
         <p><b>Descadastro</b>: quem pede para não receber "novidades e dicas" continua recebendo avisos de instabilidade e manutenção; quem pede "todos" não recebe nada. Nunca envia duas vezes para a mesma pessoa, mesmo que ela esteja em vários sistemas.</p>
       </div></details>`;
  const acha = (id) => lista.find(x => x.id === id);
  box.querySelectorAll('.com-ed').forEach(b => b.onclick = () => { comEditor(acha(b.dataset.id)); $('#com-editor').scrollIntoView({ behavior: 'smooth' }); });
  box.querySelectorAll('.com-dup').forEach(b => b.onclick = () => { const c = acha(b.dataset.id); comEditor({ ...c, id: null, titulo: c.titulo }); COM.editando = null; $('#com-editor').scrollIntoView({ behavior: 'smooth' }); });
  box.querySelectorAll('.com-del').forEach(b => b.onclick = async () => { if (!confirm('Excluir este rascunho?')) return; try { await api('DELETE', `/comunicados/${b.dataset.id}`); comHistorico(); } catch (e) { alert(e.message); } });
  box.querySelectorAll('.com-can').forEach(b => b.onclick = async () => { if (!confirm('Cancelar? O que ainda está na fila não sai mais (o que já saiu, já saiu).')) return; try { await api('POST', `/comunicados/${b.dataset.id}/cancelar`); comHistorico(); } catch (e) { alert(e.message); } });
  box.querySelectorAll('.com-arq').forEach(b => b.onclick = async () => { if (!confirm('Tirar este aviso do sino dos apps?')) return; try { await api('POST', `/comunicados/${b.dataset.id}/arquivar`); comHistorico(); } catch (e) { alert(e.message); } });
  box.querySelectorAll('.com-re').forEach(b => b.onclick = async () => { try { const r = await api('POST', `/comunicados/${b.dataset.id}/reenviar-erros`); alert(`${r.reenfileirados} envio(s) de volta à fila.`); comHistorico(); } catch (e) { alert(e.message); } });
  box.querySelectorAll('.com-err').forEach(b => b.onclick = async () => {
    const r = await api('GET', `/comunicados/${b.dataset.id}/entregas?status=erro`);
    $('#com-falhas').innerHTML = `<div class="cr-box" style="margin-top:12px"><b>Falhas</b>` + tabela(['Canal', 'Pessoa', 'Destino', 'Motivo'],
      r.entregas.map(x => [comCanalRot[x.canal], esc(x.nome || ''), esc(x.destino), esc(x.motivo || '')])) + '</div>';
  });
  comDescadastros();
  comPrivacidade();
  comDicas();
}

// Dicas: o manual servido em pedaços. Uma por abertura do app, sem repetir,
// num post-it acima dos botões flutuantes. Quem quiser ler tudo tem a aba.
const DICAS = { produto: 'academy', editando: null };
async function comDicas() {
  const box = $('#com-dicas'); if (!box) return;
  let r;
  try { r = await api('GET', '/comunicados/dicas?produto=' + encodeURIComponent(DICAS.produto)); }
  catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  const sistemas = r.sistemas || [];
  const d = DICAS.editando || { titulo: '', corpo: '', passos: [], link_url: '', link_rotulo: '', ordem: (r.dicas.length + 1) * 10, ativa: true };
  const linhas = r.dicas.map(x => [
    `<b>${esc(x.titulo)}</b>${x.ativa ? '' : ' <span class="badge">desligada</span>'}${x.curso_id ? ` <span class="badge st-andamento">${esc((r.cursos.find(c => String(c.id) === String(x.curso_id)) || {}).titulo || 'curso')}</span>` : ''}${x.origem === 'semente' ? ' <span class="obs">(inicial)</span>' : ''}
      <br><span class="obs">${esc(x.corpo || '')}</span>${x.passos.length ? `<br><span class="obs">${x.passos.length} passo(s)</span>` : ''}`,
    `${x.vistas} pessoa(s)`,
    `<button class="btn peq secund dc-ed" data-id="${esc(x.id)}">editar</button>
     <button class="btn peq secund dc-on" data-id="${esc(x.id)}">${x.ativa ? 'desligar' : 'ligar'}</button>
     <button class="btn peq secund dc-del" data-id="${esc(x.id)}">excluir</button>`,
  ]);
  box.innerHTML = `<div class="obs" style="padding:6px 4px">Cada vez que a pessoa abre o sistema, aparece <b>uma</b> dica que ela ainda não viu — em post-it, acima dos botões. Escreva o passo a passo: é isso que substitui o manual.</div>
    <label style="max-width:320px">Sistema <select id="dc-prod">${sistemas.map(p => `<option value="${esc(p.chave)}" ${p.chave === DICAS.produto ? 'selected' : ''}>${p.emoji} ${esc(p.nome)}</option>`).join('')}</select></label>
    ${r.dicas.length ? tabela(['Dica', 'Já viram', ''], linhas) : '<p class="vazio">Nenhuma dica neste sistema ainda.</p>'}
    <form class="form" id="dc-form" style="max-width:720px;margin-top:12px">
      <b>${DICAS.editando ? '✏️ Editando dica' : '➕ Nova dica'}</b>
      ${(r.cursos || []).length ? `<label>Curso (opcional) <select id="dc-curso"><option value="">Todo o sistema — qualquer aluno vê</option>${r.cursos.map(c => `<option value="${esc(c.id)}" ${String(d.curso_id || '') === String(c.id) ? 'selected' : ''}>${esc(c.titulo)}</option>`).join('')}</select><span class="obs">Dica de curso só aparece para quem tem esse curso.</span></label>` : ''}
      <label>Título * <input id="dc-tit" maxlength="120" value="${esc(d.titulo)}" placeholder="Você sabia que dá para criar um agente de IA personalizado?"></label>
      <label>Frase de abertura <input id="dc-corpo" maxlength="600" value="${esc(d.corpo || '')}" placeholder="O gerador escreve o prompt master do seu agente."></label>
      <label>Passo a passo (um por linha) <textarea id="dc-passos" rows="5" placeholder="Abra um curso da sua biblioteca&#10;Role até &quot;Minha jornada&quot;&#10;Toque na aba &quot;Ferramentas&quot;">${esc((d.passos || []).join('\n'))}</textarea></label>
      <div class="hi-grid">
        <label>Link (opcional) <input id="dc-link" value="${esc(d.link_url || '')}" placeholder="https://…"></label>
        <label>Texto do link <input id="dc-lrot" maxlength="40" value="${esc(d.link_rotulo || '')}" placeholder="Ver como"></label>
      </div>
      <label style="max-width:160px">Ordem <input id="dc-ordem" type="number" value="${Number(d.ordem) || 100}"></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit">${DICAS.editando ? 'Salvar' : 'Criar dica'}</button>
        ${DICAS.editando ? '<button class="btn secund" type="button" id="dc-cancel">cancelar</button>' : ''}</div>
      <p id="dc-msg" class="erro"></p>
    </form>`;
  $('#dc-prod').onchange = () => { DICAS.produto = $('#dc-prod').value; DICAS.editando = null; comDicas(); };
  $('#dc-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const m = $('#dc-msg'); m.className = 'erro'; m.textContent = '';
    const corpo = {
      produto: DICAS.produto, curso_id: ($('#dc-curso') || {}).value || '', titulo: $('#dc-tit').value, corpo: $('#dc-corpo').value,
      passos: $('#dc-passos').value.split('\n'), link_url: $('#dc-link').value.trim(),
      link_rotulo: $('#dc-lrot').value.trim(), ordem: Number($('#dc-ordem').value) || 100,
    };
    try {
      if (DICAS.editando) await api('PUT', `/comunicados/dicas/${DICAS.editando.id}`, corpo);
      else await api('POST', '/comunicados/dicas', corpo);
      DICAS.editando = null; comDicas();
    } catch (e) { m.textContent = e.message; }
  };
  if ($('#dc-cancel')) $('#dc-cancel').onclick = () => { DICAS.editando = null; comDicas(); };
  box.querySelectorAll('.dc-ed').forEach(b => b.onclick = () => { DICAS.editando = r.dicas.find(x => x.id === b.dataset.id); comDicas(); });
  box.querySelectorAll('.dc-on').forEach(b => b.onclick = async () => {
    const x = r.dicas.find(y => y.id === b.dataset.id);
    try { await api('PUT', `/comunicados/dicas/${x.id}`, { ativa: !x.ativa }); comDicas(); } catch (e) { alert(e.message); }
  });
  box.querySelectorAll('.dc-del').forEach(b => b.onclick = async () => {
    if (!confirm('Excluir esta dica? Quem ainda não viu deixa de vê-la.')) return;
    try { await api('DELETE', `/comunicados/dicas/${b.dataset.id}`); comDicas(); } catch (e) { alert(e.message); }
  });
}

// Estado da LGPD: o que a varredura diária fez, por quanto tempo guardamos e
// onde estão os anexos. O botão roda a varredura na hora (ela é idempotente).
async function comPrivacidade() {
  const box = $('#com-lgpd'); if (!box) return;
  let r;
  try { r = await api('GET', '/comunicados/privacidade'); }
  catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  const u = r.ultima;
  box.innerHTML = `<div class="obs" style="padding:8px 4px;line-height:1.7">
    <p><b>Exclusão de conta:</b> quem exclui a conta em qualquer sistema tem conversas, anexos e leituras apagados daqui, e as entregas viram anônimas (fica só o número de quem recebeu). A varredura roda 1× por dia.</p>
    <p><b>Retenção:</b> conversa encerrada e parada há mais de <b>${Math.round(r.retencao_dias / 365)} ano(s)</b> é apagada com os anexos.</p>
    <p><b>Continua guardado:</b> quem pediu para não receber — apagar isso faria a pessoa voltar a ser contatada.</p>
    <p><b>Anexos:</b> ${r.anexos.no_bucket ? 'no bucket (R2/S3), privados' : `no disco do servidor — ${r.anexos.usado_mb} MB de ${r.anexos.teto_mb} MB`}.</p>
    <p><b>Última varredura:</b> ${u ? `${comFmt(u.quando)} — ${(u.exclusoes && u.exclusoes.esquecidas) || 0} conta(s) esquecida(s), ${(u.retencao && u.retencao.conversas) || 0} conversa(s) vencida(s)${(u.exclusoes && u.exclusoes.produtos_sem_resposta || []).length ? ` · ⚠️ ${u.exclusoes.produtos_sem_resposta.map(x => esc(x.produto)).join(', ')} não respondeu(ram)` : ''}` : 'ainda não rodou nesta execução do servidor'}</p>
    <button class="btn peq secund" id="com-lgpd-rodar">Rodar varredura agora</button> <span id="com-lgpd-msg"></span></div>`;
  $('#com-lgpd-rodar').onclick = async () => {
    const m = $('#com-lgpd-msg'); m.textContent = 'rodando…';
    try { await api('POST', '/comunicados/privacidade/rodar'); comPrivacidade(); } catch (e) { m.textContent = e.message; }
  };
}

async function comDescadastros() {
  const box = $('#com-desc'); if (!box) return;
  try {
    const r = await api('GET', '/comunicados/descadastros');
    box.innerHTML = r.descadastros.length ? tabela(['Contato', 'Canal', 'Não quer', 'Desde', ''], r.descadastros.map(d => [
      esc(d.contato), esc(d.canal), d.escopo === 'tudo' ? 'nenhum aviso' : 'novidades e dicas', comFmt(d.criado_em),
      `<button class="btn peq secund com-rec" data-c="${esc(d.contato)}" data-k="${esc(d.canal)}">desfazer</button>`]))
      : '<p class="vazio">Ninguém pediu para sair.</p>';
    box.querySelectorAll('.com-rec').forEach(b => b.onclick = async () => {
      if (!confirm('Desfazer o descadastro? Faça isso só se a própria pessoa pediu para voltar a receber.')) return;
      await api('POST', '/comunicados/descadastros/remover', { contato: b.dataset.c, canal: b.dataset.k }); comDescadastros();
    });
  } catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
