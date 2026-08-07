'use strict';
// ============================================================================
// Portal Staff — módulo: app-vitrine (Vitrine, o marketplace de produtos
// novos e usados). Administração da PLATAFORMA: moderação de anúncios,
// pedidos, disputas, denúncias, repasses, usuários, categorias e regras
// (comissão). O uso do dia a dia (comprar/vender) fica em /vitrine/app.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const vtBrl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const vtDia = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const vtCard = (rot, n, sub) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(rot)}</div>${sub ? `<div class="obs">${esc(sub)}</div>` : ''}</div>`;
let VT_VISAO = 'moderacao';

async function renderVitrine() {
  conteudo().innerHTML = cabecalho('🛒 Vitrine — plataforma',
    'Marketplace de produtos novos e usados. Aqui: moderação, pedidos, disputas, repasses e regras comerciais. O painel de uso é /vitrine/app.')
    + `<div class="barra">
        <a class="btn secund" href="/vitrine" target="_blank" rel="noopener">🌐 Loja /vitrine</a>
        <a class="btn secund" href="/vitrine/app" target="_blank" rel="noopener">🖥️ Painel do usuário</a>
        <button class="btn secund" id="vt-rotina">⚙ Rodar rotina agora</button>
       </div>
       <div id="vt-cards" class="cards"></div>
       <div class="barra" style="margin-top:12px">
         ${['moderacao', 'pedidos', 'disputas', 'denuncias', 'repasses', 'usuarios', 'categorias', 'regras', 'auditoria']
      .map((v) => `<button class="btn secund vt-nav" data-v="${v}">${{
        moderacao: '🔍 Moderação', pedidos: '📦 Pedidos', disputas: '⚖️ Disputas', denuncias: '🚩 Denúncias',
        repasses: '💸 Repasses', usuarios: '👥 Usuários', categorias: '🗂️ Categorias', regras: '⚙️ Regras', auditoria: '📜 Auditoria',
      }[v]}</button>`).join('')}
       </div>
       <div id="vt-corpo"><p class="vazio">Carregando…</p></div>`;

  $('#vt-rotina').onclick = async () => {
    if (!confirm('Rodar a rotina da Vitrine agora? (expira pedidos não pagos, avança rastreios simulados e conclui pedidos com a janela de devolução vencida)')) return;
    try {
      const r = await api('POST', '/vitrine/rodar-rotina', {});
      alert(`Rotina executada.\n\nExpirados: ${r.expirados}\nRastreios avançados: ${r.rastreios_avancados}\nConcluídos: ${r.concluidos}`);
      vitrineCarregar();
    } catch (e) { alert(e.message); }
  };
  document.querySelectorAll('.vt-nav').forEach((b) => { b.onclick = () => { VT_VISAO = b.dataset.v; vitrineCorpo(); }; });
  vitrineCarregar();
}

async function vitrineCarregar() {
  try {
    const d = await api('GET', '/vitrine/dashboard');
    window._vt = d;
    $('#vt-cards').innerHTML = [
      vtCard('GMV (30 dias)', vtBrl(d.financeiro.gmv_centavos), `${d.pedidos.total} pedido(s)`),
      vtCard('Comissões (concluídas)', vtBrl(d.financeiro.comissao_centavos), `comissão vigente ${d.financeiro.comissao_pct}%`),
      vtCard('Margem líquida', vtBrl(d.financeiro.margem_liquida_centavos), `tarifa do processador ${vtBrl(d.financeiro.tarifa_processador_centavos)}`),
      vtCard('Moderação pendente', d.catalogo.moderacao_pendente, `${d.catalogo.ativos} anúncio(s) ativo(s)`),
      vtCard('Disputas abertas', d.pedidos.em_disputa, `${d.denuncias_abertas} denúncia(s) aberta(s)`),
      vtCard('Usuários', d.usuarios.total, `${d.usuarios.vendedores} vendedor(es) · ${d.usuarios.novos_periodo} novo(s) no período`),
      vtCard('Repasses a pagar', d.repasses_a_pagar, 'fila em 💸 Repasses'),
    ].join('');
    vitrineCorpo();
  } catch (e) { $('#vt-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

async function vitrineCorpo() {
  const cx = $('#vt-corpo');
  cx.innerHTML = '<p class="vazio">Carregando…</p>';
  document.querySelectorAll('.vt-nav').forEach((b) => b.classList.toggle('ativo', b.dataset.v === VT_VISAO));
  try {
    if (VT_VISAO === 'moderacao') return vtModeracao(cx);
    if (VT_VISAO === 'pedidos') return vtPedidos(cx);
    if (VT_VISAO === 'disputas') return vtDisputas(cx);
    if (VT_VISAO === 'denuncias') return vtDenuncias(cx);
    if (VT_VISAO === 'repasses') return vtRepasses(cx);
    if (VT_VISAO === 'usuarios') return vtUsuarios(cx);
    if (VT_VISAO === 'categorias') return vtCategorias(cx);
    if (VT_VISAO === 'regras') return vtRegras(cx);
    if (VT_VISAO === 'auditoria') return vtAuditoria(cx);
  } catch (e) { cx.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

async function vtModeracao(cx) {
  const { fila } = await api('GET', '/vitrine/moderacao');
  cx.innerHTML = `<h2>Anúncios aguardando moderação (${fila.length})</h2>` + (fila.length ? fila.map((p) => `
    <div class="card" style="text-align:left;margin-bottom:10px">
      <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <img src="${esc(p.foto || '')}" alt="" width="72" height="72" style="border-radius:8px;object-fit:cover;background:#eee">
        <div style="flex:1;min-width:220px">
          <b>${esc(p.titulo)}</b> — ${vtBrl(p.preco_centavos)} · ${esc(p.condicao)} · ${p.num_fotos} foto(s)<br>
          <small>${esc(p.loja_nome)} · ${esc(p.cidade)}/${esc(p.uf)} · estoque ${p.quantidade}</small>
          <p style="margin:6px 0;white-space:pre-wrap">${esc(String(p.descricao).slice(0, 400))}</p>
          ${p.condicao !== 'novo' ? `<p style="margin:6px 0"><b>Defeitos declarados:</b> ${esc(p.defeitos)}</p>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <a class="btn secund" href="/vitrine/p/${esc(p.slug)}" target="_blank" rel="noopener">Ver página</a>
          <button class="btn" onclick="vtModerar('${p.id}','aprovar')">✅ Aprovar</button>
          <button class="btn secund" onclick="vtModerar('${p.id}','rejeitar')">❌ Rejeitar</button>
        </div>
      </div>
    </div>`).join('') : '<p class="vazio">Fila limpa. 🎉</p>');
}
async function vtModerar(id, decisao) {
  let motivo = '';
  if (decisao === 'rejeitar') { motivo = prompt('Motivo da rejeição (o vendedor vai ler):'); if (!motivo) return; }
  try { await api('POST', '/vitrine/moderacao/' + id, { decisao, motivo }); vitrineCarregar(); } catch (e) { alert(e.message); }
}

async function vtPedidos(cx) {
  const d = await api('GET', '/vitrine/pedidos');
  cx.innerHTML = `<h2>Pedidos (últimos 200)</h2>
    <p><a class="btn secund" href="/staff/api/vitrine/export/pedidos.csv">⬇ Exportar CSV</a></p>
    ${tabela(['Código', 'Status', 'Comprador', 'Vendedor', 'Total', 'Comissão', 'Criado'],
    d.pedidos.map((p) => [p.codigo, d.status_possiveis[p.status] || p.status, p.comprador, p.loja_nome, vtBrl(p.total_centavos), vtBrl(p.comissao_centavos), vtDia(p.criado_em)]))}`;
}

async function vtDisputas(cx) {
  const { disputas } = await api('GET', '/vitrine/disputas');
  cx.innerHTML = `<h2>Disputas abertas (${disputas.length})</h2>` + (disputas.length ? disputas.map((d) => `
    <div class="card" style="text-align:left;margin-bottom:10px">
      <b>${esc(d.codigo)}</b> — ${vtBrl(d.total_centavos)} · status do pedido: ${esc(d.pedido_status)}<br>
      <small>Comprador: ${esc(d.comprador)} · Loja: ${esc(d.loja_nome)} · aberta em ${vtDia(d.criado_em)}</small>
      <p style="margin:6px 0"><b>Motivo:</b> ${esc(d.motivo)}${d.detalhe ? ' — ' + esc(d.detalhe) : ''}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="vtResolver('${d.order_id}','reembolso_total',0)">💸 Reembolso total</button>
        <button class="btn secund" onclick="vtResolverParcial('${d.order_id}',${d.total_centavos})">Reembolso parcial…</button>
        <button class="btn secund" onclick="vtResolver('${d.order_id}','liberar_vendedor',0)">✅ Liberar o vendedor</button>
      </div>
    </div>`).join('') : '<p class="vazio">Nenhuma disputa aberta.</p>');
}
async function vtResolver(orderId, resolucao, valor) {
  if (!confirm('Confirmar a resolução "' + resolucao + '"? Esta decisão encerra a disputa.')) return;
  try { await api('POST', `/vitrine/disputas/${orderId}/resolver`, { resolucao, valor_centavos: valor }); vitrineCarregar(); } catch (e) { alert(e.message); }
}
async function vtResolverParcial(orderId, total) {
  const v = prompt(`Valor do reembolso parcial em CENTAVOS (total do pedido: ${total}):`);
  if (!v) return;
  vtResolver(orderId, 'reembolso_parcial', parseInt(v, 10) || 0);
}

async function vtDenuncias(cx) {
  const { denuncias } = await api('GET', '/vitrine/denuncias');
  cx.innerHTML = `<h2>Denúncias abertas (${denuncias.length})</h2>` + (denuncias.length ? denuncias.map((d) => `
    <div class="card" style="text-align:left;margin-bottom:8px">
      <b>${esc(d.tipo)}</b> · alvo ${esc(d.alvo_id)} · ${vtDia(d.criado_em)}<br>
      <p style="margin:4px 0">${esc(d.motivo)}${d.detalhe ? ' — ' + esc(d.detalhe) : ''}</p>
      <button class="btn secund" onclick="vtResolverDenuncia('${d.id}')">Resolver</button>
    </div>`).join('') : '<p class="vazio">Nenhuma denúncia aberta.</p>');
}
async function vtResolverDenuncia(id) {
  const r = prompt('Resolução (o que foi feito):');
  if (!r) return;
  try { await api('POST', `/vitrine/denuncias/${id}/resolver`, { resolucao: r }); vitrineCorpo(); } catch (e) { alert(e.message); }
}

async function vtRepasses(cx) {
  const { fila } = await api('GET', '/vitrine/repasses');
  cx.innerHTML = `<h2>Repasses liberados a pagar (${fila.length})</h2>
    <p class="vazio" style="text-align:left">O pagamento é manual (Pix na chave do vendedor). O repasse automático entra na fase 6, junto com o Mercado Pago Split.</p>`
    + (fila.length ? fila.map((p) => `
    <div class="card" style="text-align:left;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div><b>${esc(p.loja_nome)}</b> — pedido ${esc(p.codigo)}<br><small>Pix (${esc(p.pix_tipo || 'chave')}): <code>${esc(p.pix_chave || '—')}</code> · liberado em ${vtDia(p.liberado_em)}</small></div>
      <div style="text-align:right"><b>${vtBrl(p.valor_centavos)}</b><br><button class="btn" onclick="vtPagarRepasse('${p.id}')">Marcar como pago</button></div>
    </div>`).join('') : '<p class="vazio">Nada a pagar. 🎉</p>');
}
async function vtPagarRepasse(id) {
  if (!confirm('Confirma que o Pix deste repasse foi enviado?')) return;
  try { await api('POST', `/vitrine/repasses/${id}/pago`, {}); vitrineCarregar(); } catch (e) { alert(e.message); }
}

async function vtUsuarios(cx) {
  const { usuarios } = await api('GET', '/vitrine/usuarios');
  cx.innerHTML = `<h2>Usuários (${usuarios.length})</h2>
    <p><a class="btn secund" href="/staff/api/vitrine/export/usuarios.csv">⬇ Exportar CSV</a></p>
    ${usuarios.map((u) => `<div class="card" style="text-align:left;margin-bottom:6px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div><b>${esc(u.nome)}</b> ${u.loja_nome ? '· 🏪 ' + esc(u.loja_nome) : ''}<br><small>${esc(u.email)} · ${esc(u.cidade || '')}/${esc(u.uf || '')} · desde ${vtDia(u.criado_em)} · e-mail ${u.email_verificado ? '✅' : '⚠️ não verificado'}</small></div>
      <div>${u.status === 'bloqueado'
        ? `<span class="tag">bloqueado</span> <button class="btn secund" onclick="vtUsuarioAcao('${u.id}','reativar')">Reativar</button>`
        : (u.status === 'excluido' ? '<span class="tag">excluído (LGPD)</span>' : `<button class="btn secund" onclick="vtUsuarioAcao('${u.id}','bloquear')">Bloquear</button>`)}</div>
    </div>`).join('')}`;
}
async function vtUsuarioAcao(id, acao) {
  let corpo = {};
  if (acao === 'bloquear') { const m = prompt('Motivo do bloqueio:'); if (!m) return; corpo = { motivo: m }; }
  try { await api('POST', `/vitrine/usuarios/${id}/${acao}`, corpo); vtUsuarios($('#vt-corpo')); } catch (e) { alert(e.message); }
}

async function vtCategorias(cx) {
  const { categorias } = await api('GET', '/vitrine/categorias');
  const raizes = categorias.filter((c) => !c.parent_id);
  cx.innerHTML = `<h2>Categorias</h2>
    ${raizes.map((r) => `<div class="card" style="text-align:left;margin-bottom:6px"><b>${esc(r.emoji)} ${esc(r.nome)}</b><br>
      <small>${categorias.filter((c) => c.parent_id === r.id).map((c) => esc(c.nome)).join(' · ') || 'sem subcategorias'}</small></div>`).join('')}
    <div class="card" style="text-align:left"><b>Nova categoria</b><br>
      <input id="vt-cat-nome" placeholder="Nome"> <input id="vt-cat-emoji" placeholder="Emoji" style="width:70px">
      <select id="vt-cat-pai"><option value="">(raiz)</option>${raizes.map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select>
      <button class="btn" onclick="vtCatCriar()">Criar</button></div>`;
}
async function vtCatCriar() {
  try {
    await api('POST', '/vitrine/categorias', { nome: $('#vt-cat-nome').value, emoji: $('#vt-cat-emoji').value, parent_id: $('#vt-cat-pai').value });
    vitrineCorpo();
  } catch (e) { alert(e.message); }
}

async function vtRegras(cx) {
  const { config } = await api('GET', '/vitrine/config');
  cx.innerHTML = `<h2>Regras da plataforma</h2>
    <p class="vazio" style="text-align:left">Mudanças valem para os PRÓXIMOS pedidos — pedidos existentes preservam a comissão gravada na compra.</p>
    ${config.map((c) => `<div class="card" style="text-align:left;margin-bottom:6px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
      <div><b>${esc(c.chave)}</b><br><small>${esc(c.descricao)}</small></div>
      <div><input id="vt-cfg-${esc(c.chave)}" value="${esc(c.valor)}" style="width:140px"> <button class="btn secund" onclick="vtCfgSalvar('${esc(c.chave)}')">Salvar</button></div>
    </div>`).join('')}`;
}
async function vtCfgSalvar(chave) {
  try { await api('POST', '/vitrine/config', { chave, valor: $('#vt-cfg-' + chave).value }); alert('Salvo. Vale para os próximos pedidos.'); vitrineCarregar(); } catch (e) { alert(e.message); }
}

async function vtAuditoria(cx) {
  const { auditoria } = await api('GET', '/vitrine/auditoria');
  cx.innerHTML = `<h2>Trilha de auditoria (${auditoria.length})</h2>
    ${tabela(['Quando', 'Quem', 'Ação', 'Entidade', 'Detalhe'],
    auditoria.map((a) => [String(a.quando).replace('T', ' ').slice(0, 16), a.quem, a.acao, a.entidade + (a.entidade_id ? ' ' + a.entidade_id : ''), a.detalhe]))}`;
}
