'use strict';
// ============================================================================
// Portal Staff — 🔑 Tokens de API (só admin). Emite token TEMPORÁRIO para um
// agente externo (ex.: Codex) usar a API de UM sistema, com escopo e prazo.
// Mecanismo e regras: nucleo/tokens-api.js. API: /staff/api/tokens-api.
// O token aparece UMA vez, logo após emitir; depois só o prefixo.
// ============================================================================

const TOK = { dados: null };

async function renderTokensApi() {
  conteudo().innerHTML = cabecalho('🔑 Tokens de API',
    'Acesso temporário para agentes externos (ex.: Codex) na API de um sistema — com escopo, prazo e registro de cada uso. '
    + 'Mais estreito que a chave de publicação: vale só para o sistema e as rotas escolhidas, e vence sozinho. '
    + 'O código e as páginas do site não passam por aqui: vão ao ar por commit no GitHub.')
    + `<details class="cr-box" open><summary class="cr-sum">➕ Novo token</summary>
         <form class="form" id="tk-form" style="max-width:760px;margin-top:12px">
           <div class="hi-grid">
             <label>Sistema * <select id="tk-sistema"></select></label>
             <label>Nome * <input id="tk-nome" maxlength="60" placeholder="Ex.: Codex — importar curso"></label>
             <label id="tk-dono-lbl">Em nome de <input id="tk-dono"></label>
             <label>Validade <select id="tk-horas">
               <option value="1">1 hora</option><option value="8">8 horas</option><option value="24" selected>24 horas</option>
               <option value="72">3 dias</option><option value="168">7 dias</option><option value="720">30 dias</option>
             </select></label>
           </div>
           <fieldset style="border:1px solid var(--linha,#ddd);border-radius:8px;padding:10px;margin:10px 0">
             <legend style="padding:0 6px">Escopos</legend><div id="tk-escopos"></div>
           </fieldset>
           <details style="margin-bottom:10px"><summary class="obs">Rotas que este sistema libera ao token</summary><div id="tk-rotas" class="obs"></div></details>
           <button class="btn" type="submit">Emitir token</button><p id="tk-msg" class="erro"></p>
         </form>
       </details>
       <div id="tk-novo"></div>
       <div id="tk-lista"><p class="vazio">Carregando…</p></div>`;
  try { TOK.dados = await api('GET', '/tokens-api'); } catch (e) { $('#tk-lista').innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; return; }
  const sel = $('#tk-sistema');
  sel.innerHTML = TOK.dados.sistemas.map(s => `<option value="${esc(s.id)}">${esc(s.rotulo)}</option>`).join('');
  sel.onchange = tokPintarSistema;
  tokPintarSistema();
  $('#tk-form').onsubmit = tokEmitir;
  tokPintarLista();
}

function tokSistema() { return TOK.dados.sistemas.find(s => s.id === $('#tk-sistema').value); }

function tokPintarSistema() {
  const s = tokSistema(); if (!s) return;
  const lbl = $('#tk-dono-lbl'), dono = $('#tk-dono');
  lbl.style.display = s.dono ? '' : 'none';
  if (s.dono) { lbl.firstChild.textContent = s.dono.rotulo + ' * '; dono.value = s.dono.padrao || ''; }
  $('#tk-escopos').innerHTML = Object.entries(s.escopos).map(([id, d], i) =>
    `<label style="display:block;margin:4px 0"><input type="checkbox" class="tk-esc" value="${esc(id)}"${i === 0 ? ' checked' : ''}> <b>${esc(id)}</b> — <span class="obs">${esc(d)}</span></label>`).join('');
  $('#tk-rotas').innerHTML = s.rotas.map(r => `<code>${esc(r.metodo)} ${esc(r.caminho)}</code> · ${esc(r.escopo)}`).join('<br>');
}

async function tokEmitir(ev) {
  ev.preventDefault();
  const msg = $('#tk-msg'); msg.textContent = '';
  const s = tokSistema();
  const corpo = {
    sistema: s.id, nome: $('#tk-nome').value.trim(), horas: Number($('#tk-horas').value),
    escopos: [...document.querySelectorAll('.tk-esc:checked')].map(x => x.value),
  };
  if (s.dono) corpo.dono = $('#tk-dono').value.trim();
  const btn = $('#tk-form').querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const r = await api('POST', '/tokens-api', corpo);
    const g = r.registro;
    $('#tk-novo').innerHTML = `<div class="card" style="border-color:var(--alerta)">
      <h3>✅ Token emitido — copie agora</h3>
      <p class="sub">Ele não será mostrado de novo. Entregue ao agente por variável de ambiente, nunca colado em chat ou commit.</p>
      <p><code id="tk-bruto" style="word-break:break-all">${esc(r.token)}</code></p>
      <button class="btn peq" id="tk-copiar">📋 Copiar token</button>
      <p class="obs" style="margin-top:10px">${esc(g.sistema_rotulo)} · ${esc(g.escopos.join(' + '))}${g.dono ? ' · em nome de ' + esc(g.dono) : ''} · vence ${new Date(g.expira_em).toLocaleString('pt-BR')}<br>
      Uso: cabeçalho <code>Authorization: Bearer &lt;token&gt;</code> (ou <code>x-api-token</code>)${s.dono ? `, sempre com <code>${esc(s.dono.campo)}=${esc(g.dono)}</code> no pedido` : ''}.</p></div>`;
    $('#tk-copiar').onclick = async (e) => { try { await navigator.clipboard.writeText(r.token); e.target.textContent = 'copiado ✓'; } catch (_) {} };
    $('#tk-nome').value = '';
    TOK.dados = await api('GET', '/tokens-api');
    tokPintarLista();
  } catch (e) { msg.textContent = e.message; }
  btn.disabled = false;
}

function tokPintarLista() {
  const ts = TOK.dados.tokens;
  const sit = { ativo: 'st-feito', vencido: 'st-pendente', revogado: 'st-erro' };
  const quando = (x) => x ? new Date(x).toLocaleString('pt-BR') : '—';
  $('#tk-lista').innerHTML = `<div class="card"><h3>Tokens emitidos</h3>${ts.length ? tabela(['Token', 'Sistema / escopo', 'Situação', 'Vence', 'Uso', ''],
    ts.map(t => [
      `<b>${esc(t.nome)}</b><br><span class="obs"><code>${esc(t.prefixo)}…</code> · por ${esc(t.criado_por)}</span>`,
      `${esc(t.sistema_rotulo)}<br><span class="obs">${esc(t.escopos.join(' + '))}${t.dono ? ' · ' + esc(t.dono) : ''}</span>`,
      `<span class="badge ${sit[t.situacao] || ''}">${esc(t.situacao)}</span>`,
      quando(t.expira_em),
      `${t.usos} · ${quando(t.ultimo_uso_em)}`,
      `<button class="btn peq secund" onclick="tokUsos('${esc(t.id)}')">usos</button>`
        + (t.situacao === 'ativo' ? ` <button class="btn peq secund" onclick="tokRevogar('${esc(t.id)}')">revogar</button>` : ''),
    ])) : '<p class="vazio">Nenhum token emitido.</p>'}<div id="tk-usos"></div></div>`;
}

async function tokRevogar(id) {
  if (!confirm('Revogar este token? Ele para de funcionar na hora.')) return;
  try { await api('POST', `/tokens-api/${encodeURIComponent(id)}/revogar`); TOK.dados = await api('GET', '/tokens-api'); tokPintarLista(); }
  catch (e) { alert(e.message); }
}

async function tokUsos(id) {
  try {
    const { usos } = await api('GET', `/tokens-api/${encodeURIComponent(id)}/usos`);
    $('#tk-usos').innerHTML = `<h3 style="margin-top:14px">Últimos usos</h3>${usos.length ? tabela(['Quando', 'Pedido', 'Resposta', 'IP'],
      usos.map(u => [new Date(u.quando).toLocaleString('pt-BR'), `<code>${esc(u.metodo)} ${esc(u.caminho)}</code>`, esc(String(u.status)), esc(u.ip || '')])) : '<p class="vazio">Ainda não foi usado.</p>'}`;
  } catch (e) { alert(e.message); }
}
