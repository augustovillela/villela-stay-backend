'use strict';
// ============================================================================
// Portal Staff — módulo: app-kids (Villela Kids, o clube de missões para
// crianças). Administração do BETA da fase 1: famílias, funil das 8 missões
// e últimas criações — o dado que decide a fase 2 é onde o interesse cai.
// O uso do dia a dia (criança/família) fica em /kids/app.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const kdDia = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const kdCard = (rot, n, sub) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(rot)}</div>${sub ? `<div class="obs">${esc(sub)}</div>` : ''}</div>`;
let KD_VISAO = 'funil';

async function renderKids() {
  conteudo().innerHTML = cabecalho('🧒 Invente · Villela Kids — plataforma',
    'Plataforma de aprendizagem criativa (7–12): beta fechado da fase 1. Aqui: famílias, funil das missões e criações. O app da família é /kids/app.')
    + `<div class="barra">
        <a class="btn secund" href="/kids" target="_blank" rel="noopener">🌐 Landing /kids</a>
        <a class="btn secund" href="/kids/app" target="_blank" rel="noopener">🖥️ App da família</a>
       </div>
       <div id="kd-cards" class="cards"></div>
       <div class="barra" style="margin-top:12px">
         ${['funil', 'familias', 'missoes', 'auditoria']
      .map((v) => `<button class="btn secund kd-nav" data-v="${v}">${{
        funil: '📊 Funil do beta', familias: '👨‍👩‍👧 Famílias', missoes: '⭐ Missões', auditoria: '📜 Auditoria',
      }[v]}</button>`).join('')}
       </div>
       <div id="kd-corpo"><p class="vazio">Carregando…</p></div>`;
  document.querySelectorAll('.kd-nav').forEach((b) => { b.onclick = () => { KD_VISAO = b.dataset.v; kidsCorpo(); }; });
  kidsCarregar();
}

async function kidsCarregar() {
  try {
    const d = await api('GET', '/kids/dashboard');
    window._kd = d;
    $('#kd-cards').innerHTML = [
      kdCard('Famílias', d.familias, `${d.criancas} criança(s) com perfil`),
      kdCard('Missões concluídas', d.missoes_concluidas, `${d.missoes_iniciadas} iniciada(s)`),
      kdCard('Criações no portfólio', d.criacoes, 'evidência > nota'),
    ].join('');
    kidsCorpo();
  } catch (e) { $('#kd-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

async function kidsCorpo() {
  const cx = $('#kd-corpo');
  cx.innerHTML = '<p class="vazio">Carregando…</p>';
  document.querySelectorAll('.kd-nav').forEach((b) => b.classList.toggle('ativo', b.dataset.v === KD_VISAO));
  try {
    if (KD_VISAO === 'funil') return kdFunil(cx);
    if (KD_VISAO === 'familias') return kdFamilias(cx);
    if (KD_VISAO === 'missoes') return kdMissoes(cx);
    if (KD_VISAO === 'auditoria') return kdAuditoria(cx);
  } catch (e) { cx.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

async function kdFunil(cx) {
  const d = window._kd || await api('GET', '/kids/dashboard');
  cx.innerHTML = `<h2>Funil das 8 missões</h2>
    <p class="sub">Onde o interesse cai é o dado que decide a fase 2 (critério do PROMPT_MASTER §7).</p>`
    + tabela(['#', 'Missão', 'Iniciadas', 'Concluídas', 'Conversão'],
      d.funil.map((m) => [m.ordem, `${m.emoji} ${esc(m.titulo)}`, m.iniciadas, m.concluidas,
        m.iniciadas ? Math.round((m.concluidas / m.iniciadas) * 100) + '%' : '—']))
    + `<h2 style="margin-top:18px">Últimas criações</h2>`
    + (d.ultimas_criacoes.length ? tabela(['Quando', 'Criança', 'Missão', 'Criação'],
      d.ultimas_criacoes.map((c) => [kdDia(c.criado_em), `${esc(c.avatar)} ${esc(c.apelido)}`, esc(c.missao || '—'), esc(c.titulo)]))
      : '<p class="vazio">Nenhuma criação ainda.</p>');
}

async function kdFamilias(cx) {
  const { familias } = await api('GET', '/kids/familias');
  cx.innerHTML = `<h2>Famílias do beta (${familias.length})</h2>`
    + tabela(['Responsável', 'E-mail', 'Crianças', 'Status', 'Desde', ''],
      familias.map((f) => [esc(f.nome), esc(f.email), f.criancas,
        f.status === 'ativo' ? '🟢 ativa' : (f.status === 'bloqueado' ? '🔴 bloqueada' : '⚪ excluída'), kdDia(f.criado_em),
        f.status === 'ativo'
          ? `<button class="btn secund" onclick="kdBloquear('${f.id}')">Bloquear</button>`
          : (f.status === 'bloqueado' ? `<button class="btn secund" onclick="kdReativar('${f.id}')">Reativar</button>` : '')]));
}

async function kdMissoes(cx) {
  const { missoes } = await api('GET', '/kids/missoes');
  cx.innerHTML = `<h2>Catálogo curado (${missoes.length})</h2>
    <p class="sub">O currículo mora em código (missoes-catalogo.js) — aqui só se publica/despublica. Alterar texto é deploy, de propósito.</p>`
    + tabela(['#', 'Missão', 'Produto final', 'No ar', ''],
      missoes.map((m) => [m.ordem, `${m.emoji} ${esc(m.titulo)}`, esc(m.produto_final), m.ativa ? '🟢' : '⚪',
        `<button class="btn secund" onclick="kdAtivar('${m.id}', ${m.ativa ? 'false' : 'true'})">${m.ativa ? 'Despublicar' : 'Publicar'}</button>`]));
}

async function kdAuditoria(cx) {
  const { auditoria } = await api('GET', '/kids/auditoria');
  cx.innerHTML = '<h2>Auditoria</h2>' + (auditoria.length
    ? tabela(['Quando', 'Quem', 'Ação', 'Entidade', 'Detalhe'],
      auditoria.map((a) => [kdDia(a.quando), esc(a.quem), esc(a.acao), esc(a.entidade + ' ' + a.entidade_id), esc(a.detalhe)]))
    : '<p class="vazio">Nada registrado.</p>');
}

async function kdBloquear(id) {
  const motivo = prompt('Motivo do bloqueio (fica na auditoria):');
  if (motivo == null) return;
  try { await api('POST', `/kids/familias/${id}/bloquear`, { motivo }); kidsCarregar(); KD_VISAO = 'familias'; }
  catch (e) { alert(e.message); }
}
async function kdReativar(id) {
  try { await api('POST', `/kids/familias/${id}/reativar`, {}); kidsCarregar(); KD_VISAO = 'familias'; }
  catch (e) { alert(e.message); }
}
async function kdAtivar(id, ativa) {
  try { await api('PATCH', `/kids/missoes/${id}`, { ativa }); KD_VISAO = 'missoes'; kidsCorpo(); }
  catch (e) { alert(e.message); }
}
