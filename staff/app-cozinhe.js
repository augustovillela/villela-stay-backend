'use strict';
// ============================================================================
// Portal Staff — módulo: app-cozinhe (Cozinhe, por Villela Table).
// Administração do produto: painel, fila de validação editorial, receitas,
// contas e auditoria. O uso do dia a dia (cozinhar) fica em cozinhe.villelastay.com.br.
//
// ⚠️ O Cozinhe roda em OUTRO serviço no Render. Esta tela não fala com ele
// direto: chama `/staff/api/cozinhe/*`, que o backend repassa injetando a chave
// compartilhada (nucleo/cozinhe-proxy.js). Quem autentica o humano é o Portal;
// o Cozinhe confia só na chave. Por isso não há um segundo login aqui.
//
// Enquanto a chave não estiver nas duas pontas, o proxy responde 503 com
// `configuracao_pendente` — e a tela explica o que falta em vez de mostrar
// "erro". Foi de propósito: falta de variável de ambiente é a causa mais
// provável de a tela não abrir, e a mais fácil de diagnosticar errado.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const CZ_SITE = 'https://cozinhe.villelastay.com.br';
const czDia = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const czCard = (rot, n, sub) => `<div class="card"><div class="n">${n == null ? '—' : n}</div><div class="rot">${esc(rot)}</div>${sub ? `<div class="obs">${esc(sub)}</div>` : ''}</div>`;
let CZ_VISAO = 'validacao';

async function renderCozinhe() {
  conteudo().innerHTML = cabecalho('🍲 Cozinhe · por Villela Table',
    'Receitas com rendimento transparente: cada ingrediente escala pela própria regra, dentro de uma faixa testada. Aqui: validação editorial, receitas, contas e auditoria.')
    + `<div class="barra">
        <a class="btn secund" href="${CZ_SITE}" target="_blank" rel="noopener">🌐 Site do Cozinhe</a>
        <a class="btn secund" href="${CZ_SITE}/admin" target="_blank" rel="noopener">🔐 Painel do Cozinhe</a>
       </div>
       <div id="cz-cards" class="cards"></div>
       <div class="barra" style="margin-top:12px">
         ${['validacao', 'receitas', 'contas', 'auditoria'].map((v) => `<button class="btn secund cz-nav" data-v="${v}">${{
           validacao: '📋 Validação editorial', receitas: '🍲 Receitas', contas: '👥 Contas', auditoria: '📜 Auditoria',
         }[v]}</button>`).join('')}
       </div>
       <div id="cz-corpo"><p class="vazio">Carregando…</p></div>`;
  document.querySelectorAll('.cz-nav').forEach((b) => { b.onclick = () => { CZ_VISAO = b.dataset.v; czCorpo(); }; });
  czCarregar();
}

// Erro do proxy vira explicação, não código. O caso que mais vai acontecer é a
// chave ainda não configurada — e nesse caso o operador precisa saber que a
// pendência é de AMBIENTE, não de permissão dele nem de bug.
function czErro(e) {
  const pendente = e && e.dados && e.dados.configuracao_pendente;
  return `<div class="aviso" style="padding:14px 16px;border:1px solid #E2E6EC;border-left:3px solid ${pendente ? '#C9A227' : '#B3261E'};border-radius:10px;background:${pendente ? '#FDF6E3' : '#FCEEED'}">
      <b>${pendente ? 'Falta ligar a chave entre os dois serviços' : 'Não deu para carregar'}</b>
      <p style="margin:6px 0 0">${esc((e && e.message) || 'erro desconhecido')}</p>
      ${pendente ? `<p class="obs" style="margin-top:8px">O mesmo valor precisa estar em <code>COZINHE_ADMIN_KEY</code> (backend Villela) e <code>VILLELA_STAFF_KEY</code> (serviço do Cozinhe), no Render. A chave não passa por aqui nem pelo código.</p>` : ''}
    </div>`;
}

async function czCarregar() {
  try {
    const d = await api('GET', '/cozinhe/dashboard?dias=30');
    window._cz = d;
    const r = d.receitas || {}, v = d.validacao || {}, s = d.saude || {}, u = d.uso || {};
    $('#cz-cards').innerHTML = [
      czCard('Receitas publicadas', r.publicadas, `${r.total ?? '—'} no total`),
      czCard('Na fila de validação', v.na_fila, v.mais_antiga_dias != null ? `mais antiga: ${v.mais_antiga_dias} dia(s)` : ''),
      czCard('Sem revisão humana', v.sem_revisao_humana, 'não podem publicar'),
      czCard('Alertas perdidos entre versões', s.alertas_perdidos_entre_versoes,
        s.alertas_perdidos_entre_versoes ? '⚠️ conferir antes de publicar' : 'nenhum'),
      czCard('Contas', u.contas, u.novas_no_periodo != null ? `+${u.novas_no_periodo} em 30 dias` : ''),
    ].join('');
    czCorpo();
  } catch (e) {
    $('#cz-cards').innerHTML = '';
    $('#cz-corpo').innerHTML = czErro(e);
  }
}

async function czCorpo() {
  const alvo = $('#cz-corpo');
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    if (CZ_VISAO === 'validacao') return czFila(alvo);
    if (CZ_VISAO === 'receitas') return czReceitas(alvo);
    if (CZ_VISAO === 'contas') return czContas(alvo);
    return czAuditoria(alvo);
  } catch (e) { alvo.innerHTML = czErro(e); }
}

// A fila é a tela que importa: o produto inteiro está travado nela (as receitas
// nascem carimbadas como demonstrativas e não publicam sem revisão humana).
async function czFila(alvo) {
  const d = await api('GET', '/cozinhe/validacao/fila');
  const fila = d.fila || d.itens || [];
  if (!fila.length) { alvo.innerHTML = '<p class="vazio">Nada esperando validação.</p>'; return; }
  alvo.innerHTML = `<table class="tab"><thead><tr>
      <th>Receita</th><th>Na fila</th><th>O que impede a publicação</th><th></th></tr></thead><tbody>
    ${fila.map((i) => `<tr>
      <td><b>${esc(i.titulo || i.id)}</b></td>
      <td>${i.dias_na_fila != null ? i.dias_na_fila + ' dia(s)' : '—'}</td>
      <td>${(i.impedimentos || []).length
        ? (i.impedimentos || []).map((im) => `<div class="obs">• ${esc(im.texto || im.codigo)}</div>`).join('')
        : '<span class="obs">nenhum — pode publicar</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn peq cz-ok" data-id="${esc(i.id)}">Aprovar</button>
        <button class="btn peq secund cz-no" data-id="${esc(i.id)}">Recusar</button>
      </td></tr>`).join('')}
  </tbody></table>
  <p class="obs" style="margin-top:10px">Aprovar e recusar são ações de administrador. Recusa exige motivo — ele vai para a auditoria do Cozinhe.</p>`;
  alvo.querySelectorAll('.cz-ok').forEach((b) => { b.onclick = () => czDecidir(b.dataset.id, 'aprovar'); });
  alvo.querySelectorAll('.cz-no').forEach((b) => { b.onclick = () => czDecidir(b.dataset.id, 'recusar'); });
}

async function czDecidir(id, acao) {
  const motivo = acao === 'recusar' ? prompt('Motivo da recusa (obrigatório):') : prompt('Observação (opcional):') || '';
  if (acao === 'recusar' && !(motivo || '').trim()) { alert('A recusa exige motivo.'); return; }
  try {
    await api('POST', `/cozinhe/validacao/${encodeURIComponent(id)}/${acao}`,
      acao === 'recusar' ? { motivo } : { observacao: motivo });
    czCarregar();
  } catch (e) { alert(e.message); }
}

async function czReceitas(alvo) {
  const d = await api('GET', '/cozinhe/receitas?limit=50');
  const rs = d.receitas || [];
  if (!rs.length) { alvo.innerHTML = '<p class="vazio">Nenhuma receita.</p>'; return; }
  alvo.innerHTML = `<table class="tab"><thead><tr>
      <th>Receita</th><th>Situação</th><th>Versão</th><th>Rendimento</th><th>Revisão humana</th><th>Atualizada</th></tr></thead><tbody>
    ${rs.map((r) => `<tr>
      <td><b>${esc(r.titulo || r.id)}</b>${r.cozinha ? `<div class="obs">${esc(r.cozinha)}</div>` : ''}</td>
      <td>${esc(r.status || '—')}</td>
      <td>${esc(r.versao || '—')}</td>
      <td>${r.rendimento_base != null ? r.rendimento_base + ' porções' : '—'}
          ${Array.isArray(r.faixa_testada) ? `<div class="obs">faixa testada ${r.faixa_testada[0]}–${r.faixa_testada[1]}</div>` : '<div class="obs">⚠️ sem faixa testada</div>'}</td>
      <td>${r.revisado_por_humano ? '✓ ' + esc(r.revisado_por || 'sim') : '— não'}</td>
      <td>${czDia(r.atualizado_em)}</td></tr>`).join('')}
  </tbody></table>${d.total != null ? `<p class="obs" style="margin-top:8px">${rs.length} de ${d.total}.</p>` : ''}`;
}

async function czContas(alvo) {
  const d = await api('GET', '/cozinhe/contas?limit=50');
  const cs = d.contas || [];
  if (!cs.length) { alvo.innerHTML = '<p class="vazio">Nenhuma conta.</p>'; return; }
  alvo.innerHTML = `<table class="tab"><thead><tr>
      <th>Conta</th><th>Criada</th><th>Receitas salvas</th><th>Último acesso</th></tr></thead><tbody>
    ${cs.map((c) => `<tr><td>${esc(c.email_mascarado || c.email || '—')}</td>
      <td>${czDia(c.criado_em)}</td><td>${c.receitas_salvas ?? '—'}</td>
      <td>${czDia(c.ultimo_acesso)}</td></tr>`).join('')}
  </tbody></table>
  <p class="obs" style="margin-top:8px">O e-mail vem mascarado do próprio Cozinhe: o painel administra a plataforma, não expõe o usuário.</p>`;
}

async function czAuditoria(alvo) {
  const d = await api('GET', '/cozinhe/auditoria?limit=50');
  const es = d.eventos || [];
  if (!es.length) { alvo.innerHTML = '<p class="vazio">Nada registrado ainda.</p>'; return; }
  alvo.innerHTML = `<table class="tab"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
    ${es.map((e) => `<tr><td>${dataBr(e.quando)}</td><td>${esc(e.quem || '—')}</td>
      <td>${esc(e.acao || '—')}</td><td class="obs">${esc(e.detalhe || '')}</td></tr>`).join('')}
  </tbody></table>`;
}
