'use strict';
// ============================================================================
// Casca do WORKSPACE JURÍDICO do ASSINANTE (painel /juridico/app/juridico).
// Reproduz o contrato mínimo que o app-legal.js (reusado do Portal Staff) espera
// — api, esc, conteudo, cabecalho, tabela, arquivoParaBase64, ESTADO — porém com
// a base de API em /juridico/api (cookie jur_saas), NÃO /staff/api. Assim o
// MESMO SPA jurídico roda para o assinante, escopado no banco do escritório dele
// pela ponte (/juridico/api/legal). Carregada ANTES do app-legal.js.
// ============================================================================
const LEGAL_HREF_BASE = '/juridico/api/legal'; // base dos links diretos (download/export) do SPA
const ESTADO = { me: { nome: '' } };           // usado pelo app-legal.js (validado_por de prazos)
const $ = (sel) => document.querySelector(sel);

async function api(metodo, caminho, corpo) {
  const opt = { method: metodo, credentials: 'same-origin', headers: {} };
  if (corpo !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(corpo); }
  const r = await fetch('/juridico/api' + caminho, opt);
  let dados = null; try { dados = await r.json(); } catch (_) {}
  if (r.status === 401) { location.href = '/juridico/app'; throw new Error('sessão expirada'); }
  if (!r.ok) throw Object.assign(new Error((dados && dados.erro) || ('Erro ' + r.status)), { status: r.status, dados });
  return dados;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const conteudo = () => $('#conteudo');
function cabecalho(titulo, sub) { return `<h1 class="titulo">${esc(titulo)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}`; }
function tabela(cols, linhas) {
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.9rem">
    <thead><tr>${cols.map(c => `<th style="text-align:left;border-bottom:2px solid #ddd;padding:.4rem">${c}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map(c => `<td style="border-bottom:1px solid #eee;padding:.4rem">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function arquivoParaBase64(file) {
  return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(file); });
}
async function sairLegal() { try { await fetch('/juridico/api/logout', { method: 'POST' }); } catch (_) {} location.href = '/juridico/app'; }

// bootstrap: chamado DEPOIS do app-legal.js (quando LG já existe)
async function bootLegal() {
  try {
    const me = await api('GET', '/me');
    ESTADO.me.nome = (me.usuario && (me.usuario.nome || me.usuario.email)) || '';
    const el = document.getElementById('esc-nome'); if (el) el.textContent = (me.escritorio && me.escritorio.nome) || 'Meu escritório';
  } catch (_) { /* 401 já redirecionou; outros erros o SPA mostra */ }
  if (typeof LG !== 'undefined') LG.abrir();
  else conteudo().innerHTML = '<div class="card">Não foi possível carregar o módulo jurídico. Recarregue a página.</div>';
}
