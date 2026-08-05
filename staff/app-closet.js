'use strict';
// ============================================================================
// Portal Staff — módulo: app-closet (Closet Club, o marketplace de aluguel de
// roupas). Administração da PLATAFORMA: moderação do acervo, reservas em
// escrow, disputas, fila de repasses Pix, comissão/políticas, cupons,
// parceiros, usuários e leads. O uso do dia a dia fica em /closet/app.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const ccBrl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const ccDia = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
// mesmo formato de cartão dos outros módulos do staff (valor grande + rótulo + observação)
const ccCard = (rot, n, sub) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(rot)}</div>${sub ? `<div class="obs">${esc(sub)}</div>` : ''}</div>`;
let CC_VISAO = 'moderacao';

async function renderCloset() {
  conteudo().innerHTML = cabecalho('👗 Closet Club — plataforma',
    'Marketplace de aluguel de roupas. Aqui: moderação, escrow, disputas, repasses e regras comerciais. O painel de uso é /closet/app.')
    + `<div class="barra">
        <a class="btn secund" href="/closet" target="_blank" rel="noopener">🌐 Vitrine /closet</a>
        <a class="btn secund" href="/closet/app" target="_blank" rel="noopener">🖥️ Painel do usuário</a>
        <button class="btn secund" id="cc-ciclo">⚙ Rodar ciclo agora</button>
       </div>
       <div id="cc-cards" class="cards"></div>
       <div class="barra" style="margin-top:12px">
         ${['moderacao', 'reservas', 'disputas', 'repasses', 'usuarios', 'financeiro', 'campanhas', 'blog', 'parceiros', 'crescimento', 'regras', 'leads']
      .map((v) => `<button class="btn secund cc-nav" data-v="${v}">${{
        moderacao: '🔍 Moderação', reservas: '📦 Reservas', disputas: '⚖️ Disputas', repasses: '💸 Repasses',
        usuarios: '👥 Usuários', financeiro: '📊 Financeiro', campanhas: '📣 Campanhas', blog: '📝 Blog',
        parceiros: '🤝 Parceiros', crescimento: '📈 Crescimento', regras: '⚙️ Regras', leads: '📩 Leads',
      }[v]}</button>`).join('')}
       </div>
       <div id="cc-corpo"><p class="vazio">Carregando…</p></div>`;

  $('#cc-ciclo').onclick = async () => {
    if (!confirm('Rodar o ciclo do Closet Club agora? (expira Pix vencido, estorna quem não confirmou e conclui vistorias vencidas)')) return;
    try {
      const r = await api('POST', '/closet/rodar-ciclo', {});
      alert(`Ciclo executado.\n\nExpiradas: ${r.expiradas}\nNão confirmadas (estornadas): ${r.nao_confirmadas}\nConcluídas: ${r.concluidas}\nPremium vencidos: ${r.premium_vencidos}`);
      closetCarregar();
    } catch (e) { alert(e.message); }
  };
  document.querySelectorAll('.cc-nav').forEach((b) => { b.onclick = () => { CC_VISAO = b.dataset.v; closetCorpo(); }; });
  closetCarregar();
}

async function closetCarregar() {
  try {
    const d = await api('GET', '/closet/dashboard');
    window._cc = d;
    $('#cc-cards').innerHTML = [
      ccCard('Peças na vitrine', d.acervo.pecas, d.acervo.moderacao_pendente ? `${d.acervo.moderacao_pendente} aguardando moderação` : 'nada pendente'),
      ccCard('Reservas abertas', d.reservas.abertas, `${d.reservas.aguardando_confirmacao} aguardando o dono confirmar`),
      ccCard('Receita do mês', ccBrl(d.financeiro.receita_total_centavos), `comissão ${ccBrl(d.financeiro.receita_comissao_centavos)} · assinatura ${ccBrl(d.financeiro.receita_assinatura_centavos)}`),
      ccCard('Repasses a pagar', d.financeiro.repasses_a_pagar, d.reservas.em_disputa ? `⚠️ ${d.reservas.em_disputa} em disputa` : 'sem disputas'),
      ccCard('Usuários', d.usuarios.total, `${d.usuarios.premium} Premium · ${d.usuarios.bloqueados} bloqueado(s)`),
      ccCard('Volume transacionado', ccBrl(d.financeiro.volume_transacionado_centavos), `${d.reservas.mes} reserva(s) no mês`),
    ].join('');
    closetCorpo();
  } catch (e) { $('#cc-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

async function closetCorpo() {
  const cx = $('#cc-corpo');
  cx.innerHTML = '<p class="vazio">Carregando…</p>';
  document.querySelectorAll('.cc-nav').forEach((b) => b.classList.toggle('ativo', b.dataset.v === CC_VISAO));
  try {
    if (CC_VISAO === 'moderacao') return closetModeracao(cx);
    if (CC_VISAO === 'reservas') return closetReservas(cx);
    if (CC_VISAO === 'disputas') return closetDisputas(cx);
    if (CC_VISAO === 'repasses') return closetRepasses(cx);
    if (CC_VISAO === 'usuarios') return closetUsuarios(cx);
    if (CC_VISAO === 'financeiro') return closetFinanceiro(cx);
    if (CC_VISAO === 'campanhas') return closetCampanhas(cx);
    if (CC_VISAO === 'blog') return closetBlog(cx);
    if (CC_VISAO === 'parceiros') return closetParceiros(cx);
    if (CC_VISAO === 'crescimento') return closetCrescimento(cx);
    if (CC_VISAO === 'regras') return closetRegras(cx);
    if (CC_VISAO === 'leads') return closetLeads(cx);
  } catch (e) { cx.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

/* ------------------------------- moderação -------------------------------- */
async function closetModeracao(cx) {
  const d = await api('GET', '/closet/moderacao');
  if (!d.pecas.length && !d.looks.length) { cx.innerHTML = '<p class="vazio">Nada aguardando moderação. ✅</p>'; return; }
  cx.innerHTML = (d.pecas.length ? `<h3>Peças (${d.pecas.length})</h3>` + d.pecas.map((p) => `
    <div class="card" style="margin-bottom:10px">
      <b>${esc(p.titulo)}</b> — ${esc(p.categoria)}${p.tamanho ? ' · ' + esc(p.tamanho) : ''}${p.marca ? ' · ' + esc(p.marca) : ''}
      <div class="sub">${ccBrl(p.preco_diaria_centavos)}/dia · caução ${ccBrl(p.caucao_centavos)} · ${esc((p.proprietario || {}).nome || '')}
        ${(p.proprietario || {}).verificado ? ' ✅' : ''} · ${esc(p.cidade || '')}</div>
      <div class="sub">Fotos: ${p.fotos.length} · qualidade ${p.qualidade_fotos.score}/100 (${esc(p.qualidade_fotos.nivel)})
        ${p.qualidade_fotos.problemas.length ? '<br>⚠️ ' + p.qualidade_fotos.problemas.map(esc).join('<br>⚠️ ') : ''}</div>
      ${p.descricao ? `<div class="sub" style="margin-top:6px">${esc(p.descricao.slice(0, 260))}</div>` : ''}
      <div class="barra" style="margin-top:8px">
        <a class="btn secund" href="/closet/peca/${esc(p.slug)}" target="_blank" rel="noopener">Ver</a>
        <button class="btn" onclick="closetModerarPeca('${p.id}',true)">✅ Aprovar</button>
        <button class="btn secund" onclick="closetModerarPeca('${p.id}',false)">✋ Reprovar</button>
      </div></div>`).join('') : '')
    + (d.looks.length ? `<h3 style="margin-top:16px">Looks (${d.looks.length})</h3>` + d.looks.map((l) => `
    <div class="card" style="margin-bottom:10px"><b>${esc(l.titulo)}</b> — ${l.itens.length} peças de ${l.donos} dono(s)
      <div class="sub">${esc(l.ocasiao || '')} · desconto ${l.desconto_pct}% (bancado pela comissão) · ${ccBrl(l.preco_diaria_look_centavos)}/dia</div>
      <div class="sub">${l.itens.map((i) => esc(i.titulo)).join(' + ')}</div>
      <div class="barra" style="margin-top:8px">
        <button class="btn" onclick="closetModerarLook('${l.id}',true)">✅ Aprovar</button>
        <button class="btn secund" onclick="closetModerarLook('${l.id}',false)">✋ Reprovar</button>
      </div></div>`).join('') : '');
}
async function closetModerarPeca(id, aprovado) {
  const nota = aprovado ? '' : prompt('O que a pessoa precisa ajustar? (vai para ela como notificação)');
  if (!aprovado && nota === null) return;
  try { await api('POST', `/closet/pecas/${id}/moderar`, { aprovado, nota }); closetCarregar(); } catch (e) { alert(e.message); }
}
async function closetModerarLook(id, aprovado) {
  try { await api('POST', `/closet/looks/${id}/moderar`, { aprovado }); closetCarregar(); } catch (e) { alert(e.message); }
}

/* -------------------------------- reservas -------------------------------- */
async function closetReservas(cx) {
  const d = await api('GET', '/closet/reservas');
  if (!d.reservas.length) { cx.innerHTML = '<p class="vazio">Nenhuma reserva ainda.</p>'; return; }
  cx.innerHTML = `<table><thead><tr><th>Código</th><th>Período</th><th>Peças</th><th>Total</th><th>Comissão</th><th>Situação</th><th></th></tr></thead><tbody>
    ${d.reservas.map((b) => `<tr>
      <td><b>${esc(b.codigo)}</b></td>
      <td>${ccDia(b.data_retirada)} → ${ccDia(b.data_devolucao)}</td>
      <td>${b.itens.length}</td><td>${ccBrl(b.total_centavos)}</td><td>${ccBrl(b.comissao_centavos)}</td>
      <td>${esc(b.status_rotulo)}</td>
      <td style="white-space:nowrap">
        ${b.status === 'aguardando_pagamento' ? `<button class="btn secund" onclick="closetMarcarPago('${b.id}')">Marcar pago</button>` : ''}
        ${['pago_bloqueado', 'confirmado'].includes(b.status) ? `<button class="btn secund" onclick="closetCancelar('${b.id}')">Cancelar</button>` : ''}
        ${b.status === 'devolvido' ? `<button class="btn secund" onclick="closetConcluir('${b.id}')">Concluir</button>` : ''}
      </td></tr>`).join('')}</tbody></table>`;
}
async function closetMarcarPago(id) {
  const mp = prompt('ID do pagamento no Mercado Pago (deixe vazio se recebeu por fora):', '');
  if (mp === null) return;
  try { await api('POST', `/closet/reservas/${id}/marcar-pago`, { mp_payment_id: mp }); closetCarregar(); } catch (e) { alert(e.message); }
}
async function closetCancelar(id) {
  const motivo = prompt('Motivo do cancelamento pela plataforma:');
  if (!motivo) return;
  try { await api('POST', `/closet/reservas/${id}/cancelar`, { motivo }); closetCarregar(); } catch (e) { alert(e.message); }
}
async function closetConcluir(id) {
  if (!confirm('Concluir a reserva? Isso libera o repasse ao proprietário e devolve a caução ao cliente.')) return;
  try { await api('POST', `/closet/reservas/${id}/concluir`, {}); closetCarregar(); } catch (e) { alert(e.message); }
}

/* -------------------------------- disputas -------------------------------- */
async function closetDisputas(cx) {
  const d = await api('GET', '/closet/disputas');
  if (!d.disputas.length) { cx.innerHTML = '<p class="vazio">Nenhuma disputa. 🎉</p>'; return; }
  cx.innerHTML = d.disputas.map((x) => `<div class="card" style="margin-bottom:10px">
    <b>${esc((x.reserva || {}).codigo || x.booking_id)}</b> — ${esc(x.motivo)} · <i>${esc(x.status)}</i>
    <div class="sub">${esc(x.descricao || '')}</div>
    <div class="sub">Pedido: ${ccBrl(x.valor_pedido_centavos)} · aberta em ${ccDia(x.criado_em)}</div>
    ${x.decisao ? `<div class="sub">Decisão: ${esc(x.decisao)} — retido ${ccBrl(x.valor_retido_centavos)}</div>` : `
    <div class="barra" style="margin-top:8px">
      <button class="btn" onclick="closetResolver('${x.id}','proprietario')">Favorecer proprietário</button>
      <button class="btn secund" onclick="closetResolver('${x.id}','cliente')">Favorecer cliente (reembolso total)</button>
    </div>`}</div>`).join('');
}
async function closetResolver(id, favor) {
  let valor = 0;
  if (favor === 'proprietario') {
    const v = prompt('Quanto reter da caução como indenização (R$)?', '0');
    if (v === null) return;
    valor = Math.round(Number(v || 0) * 100);
  } else if (!confirm('Reembolsar o cliente integralmente e dar strike no proprietário?')) return;
  const decisao = prompt('Fundamento da decisão (fica na auditoria e é visível às partes):') || '';
  try { await api('POST', `/closet/disputas/${id}/resolver`, { favor, valor_retido_centavos: valor, decisao }); closetCarregar(); } catch (e) { alert(e.message); }
}

/* -------------------------------- repasses -------------------------------- */
async function closetRepasses(cx) {
  const d = await api('GET', '/closet/repasses');
  const tabela = (lista, titulo, comBotao) => !lista.length ? '' : `<h3 style="margin-top:14px">${titulo} (${lista.length})</h3>
    <table><thead><tr><th>Reserva</th><th>Proprietário</th><th>Chave Pix</th><th>Valor</th><th></th></tr></thead><tbody>
    ${lista.map((p) => `<tr><td>${esc(p.codigo)}</td><td>${esc(p.proprietario)}</td>
      <td>${p.chave ? esc(p.chave) : '<span class="erro">sem chave Pix</span>'}</td>
      <td><b>${ccBrl(p.valor_centavos)}</b></td>
      <td>${comBotao && p.chave ? `<button class="btn" onclick="closetPagarRepasse('${p.id}')">Marcar pago</button>` : (p.motivo ? esc(p.motivo) : '')}</td>
    </tr>`).join('')}</tbody></table>`;
  const total = d.liberados.reduce((t, p) => t + p.valor_centavos, 0);
  cx.innerHTML = (d.liberados.length ? `<p class="sub">Total a enviar por Pix: <b>${ccBrl(total)}</b></p>` : '')
    + tabela(d.liberados, '💸 Liberados — enviar o Pix', true)
    + tabela(d.retidos, '⏸️ Retidos (disputa ou cancelamento)', false)
    + tabela(d.pagos, '✅ Pagos (últimos 50)', false)
    + (!d.liberados.length && !d.retidos.length && !d.pagos.length ? '<p class="vazio">Nenhum repasse ainda.</p>' : '');
}
async function closetPagarRepasse(id) {
  if (!confirm('Confirmar que o Pix foi enviado a esta pessoa?')) return;
  try { await api('POST', `/closet/repasses/${id}/marcar-pago`, {}); closetCorpo(); } catch (e) { alert(e.message); }
}

/* -------------------------------- usuários -------------------------------- */
async function closetUsuarios(cx) {
  const d = await api('GET', '/closet/usuarios');
  cx.innerHTML = `<table><thead><tr><th>Pessoa</th><th>Cidade</th><th>Plano</th><th>Reputação</th><th>Strikes</th><th>Situação</th><th></th></tr></thead><tbody>
    ${d.usuarios.map((u) => `<tr>
      <td><b>${esc(u.nome)}</b>${u.verificado ? ' ✅' : ''}<br><span class="sub">${esc(u.email)}</span></td>
      <td>${esc(u.cidade || '')}${u.uf ? '/' + esc(u.uf) : ''}</td>
      <td>${esc(u.plano)}</td>
      <td>${u.nota_media ? '★ ' + u.nota_media.toFixed(1) : '—'} · ${u.num_alugueis} loc.</td>
      <td>${u.strikes ? '<span class="erro">' + u.strikes + '</span>' : '0'}</td>
      <td>${esc(u.status)}</td>
      <td style="white-space:nowrap">
        ${u.status === 'ativo' ? `<button class="btn secund" onclick="closetBloquear('${u.id}')">Bloquear</button>`
      : `<button class="btn secund" onclick="closetDesbloquear('${u.id}')">Reativar</button>`}
        ${!u.verificado ? `<button class="btn secund" onclick="closetVerificar('${u.id}')">Verificar</button>` : ''}
        <button class="btn secund" onclick="closetPremium('${u.id}')">Premium</button>
      </td></tr>`).join('')}</tbody></table>`;
}
async function closetBloquear(id) {
  const motivo = prompt('Motivo do bloqueio (fica registrado):');
  if (!motivo) return;
  try { await api('POST', `/closet/usuarios/${id}/status`, { status: 'bloqueado', motivo }); closetCorpo(); } catch (e) { alert(e.message); }
}
async function closetDesbloquear(id) {
  try { await api('POST', `/closet/usuarios/${id}/status`, { status: 'ativo', motivo: 'reativada' }); closetCorpo(); } catch (e) { alert(e.message); }
}
async function closetVerificar(id) {
  if (!confirm('Marcar esta pessoa como verificada? (só após conferir documento)')) return;
  try { await api('POST', `/closet/usuarios/${id}/verificar`, { aprovado: true }); closetCorpo(); } catch (e) { alert(e.message); }
}
async function closetPremium(id) {
  const dias = prompt('Conceder Premium por quantos dias?', '30');
  if (!dias) return;
  try { await api('POST', `/closet/usuarios/${id}/premium`, { dias: Number(dias) }); closetCorpo(); } catch (e) { alert(e.message); }
}

/* ------------------------------- financeiro ------------------------------- */
async function closetFinanceiro(cx) {
  const d = await api('GET', '/closet/financeiro');
  cx.innerHTML = `<div class="cards">
      ${ccCard('Comissão', ccBrl(d.receita_comissao_centavos), 'no mês ' + d.competencia)}
      ${ccCard('Assinaturas', ccBrl(d.receita_assinatura_centavos), 'Premium')}
      ${ccCard('Serviços', ccBrl(d.receita_servicos_centavos), 'parceiros')}
      ${ccCard('Campanhas', ccBrl(d.receita_campanhas_centavos), 'destaque patrocinado')}
      ${ccCard('Receita total', ccBrl(d.receita_total_centavos), 'as 4 fontes somadas')}
      ${ccCard('Volume', ccBrl(d.volume_transacionado_centavos), 'transacionado (GMV)')}
      ${ccCard('Repasses', ccBrl(d.repasses_centavos), 'saíram para proprietários')}
    </div>
    <h3 style="margin-top:16px">Receita por mês</h3>
    <table><thead><tr><th>Competência</th><th>Receita da plataforma</th></tr></thead><tbody>
      ${d.serie.map((m) => `<tr><td>${esc(m.competencia)}</td><td>${ccBrl(m.receita)}</td></tr>`).join('')}
    </tbody></table>
    <p class="sub" style="margin-top:10px">Reembolsos no mês: ${ccBrl(d.reembolsos_centavos)} · cauções devolvidas: ${ccBrl(d.caucoes_devolvidas_centavos)}</p>`;
}

/* --------------------------------- regras --------------------------------- */
async function closetRegras(cx) {
  const d = await api('GET', '/closet/config');
  cx.innerHTML = `<p class="sub">Estas regras valem para toda a plataforma e passam a valer na próxima cotação.</p>
    <table><thead><tr><th>Regra</th><th>Valor</th><th>O que faz</th><th></th></tr></thead><tbody>
    ${d.config.map((c) => `<tr><td><code>${esc(c.chave)}</code></td>
      <td><input id="cfg-${esc(c.chave)}" value="${esc(c.valor)}" style="width:100%"></td>
      <td class="sub">${esc(c.descricao)}</td>
      <td><button class="btn secund" onclick="closetSalvarConfig('${esc(c.chave)}')">Salvar</button></td></tr>`).join('')}
    </tbody></table>
    <h3 style="margin-top:18px">Cupons</h3>
    <div id="cc-cupons"><p class="vazio">Carregando…</p></div>
    <div class="barra" style="margin-top:8px"><button class="btn" onclick="closetNovoCupom()">+ Novo cupom</button></div>`;
  const cup = await api('GET', '/closet/cupons');
  $('#cc-cupons').innerHTML = cup.cupons.length
    ? `<table><thead><tr><th>Código</th><th>Desconto</th><th>Usos</th><th>Validade</th></tr></thead><tbody>
       ${cup.cupons.map((c) => `<tr><td><b>${esc(c.codigo)}</b></td>
         <td>${c.tipo === 'pct' ? c.valor + '%' : ccBrl(c.valor)}</td>
         <td>${c.usos}${c.usos_max ? '/' + c.usos_max : ''}</td>
         <td>${c.valido_ate ? ccDia(c.valido_ate) : 'sem prazo'}</td></tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Nenhum cupom.</p>';
}
async function closetSalvarConfig(chave) {
  const valor = $('#cfg-' + chave).value;
  try { await api('PATCH', '/closet/config', { [chave]: valor }); alert('Salvo. Vale a partir da próxima cotação.'); } catch (e) { alert(e.message); }
}
async function closetNovoCupom() {
  const codigo = prompt('Código do cupom (ex.: PRIMEIRA10):');
  if (!codigo) return;
  const valor = prompt('Desconto em % (o cupom sai da comissão, não do repasse do dono):', '10');
  if (valor === null) return;
  try { await api('POST', '/closet/cupons', { codigo, tipo: 'pct', valor: Number(valor) }); closetCorpo(); } catch (e) { alert(e.message); }
}

/* -------------------------------- campanhas ------------------------------- */
async function closetCampanhas(cx) {
  const d = await api('GET', '/closet/campanhas');
  cx.innerHTML = `<div class="cards">
      ${ccCard('Campanhas ativas', d.resumo.ativas, `${d.resumo.aguardando} aguardando pagamento`)}
      ${ccCard('Receita de campanhas', ccBrl(d.resumo.receita_centavos), `${ccBrl(d.resumo.preco_dia_centavos)}/dia`)}
      ${ccCard('Exibições', d.resumo.impressoes, `${d.resumo.cliques} clique(s)`)}
      ${ccCard('Taxa de clique', d.resumo.impressoes ? (Math.round((d.resumo.cliques / d.resumo.impressoes) * 1000) / 10) + '%' : '—', 'peças patrocinadas')}
    </div>
    <p class="sub" style="margin-top:12px">Destaque muda a ORDEM da vitrine, nunca o conteúdo — a peça patrocinada
    continua sujeita a moderação, disponibilidade e avaliação real, e aparece marcada como "Destaque" para o visitante.</p>
    ${d.campanhas.length ? `<table><thead><tr><th>Peça</th><th>Anunciante</th><th>Período</th><th>Valor</th><th>Desempenho</th><th>Situação</th><th></th></tr></thead><tbody>
      ${d.campanhas.map((c) => `<tr>
        <td>${esc((c.peca || {}).titulo || '—')}</td>
        <td>${esc(c.anunciante || '')}</td>
        <td>${c.dias} dia(s)${c.fim ? '<br><span class="obs">até ' + ccDia(c.fim) + '</span>' : ''}</td>
        <td>${ccBrl(c.preco_centavos)}</td>
        <td class="obs">${c.impressoes} exib. · ${c.cliques} cliques</td>
        <td><span class="badge ${c.status === 'ativa' ? 'st-feito' : c.status === 'aguardando_pagamento' ? 'st-pendente' : 'st-erro'}">${esc(c.status)}</span></td>
        <td>${c.status === 'aguardando_pagamento' ? `<button class="btn" onclick="closetAtivarCampanha('${c.id}')">Marcar paga</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Nenhuma campanha ainda.</p>'}`;
}
async function closetAtivarCampanha(id) {
  if (!confirm('Confirmar o pagamento desta campanha e colocá-la no ar?')) return;
  try { await api('POST', `/closet/campanhas/${id}/ativar`, {}); closetCorpo(); } catch (e) { alert(e.message); }
}

/* ----------------------------- blog / conteúdo ---------------------------- */
async function closetBlog(cx) {
  const d = await api('GET', '/closet/posts');
  window._ccBlog = d;
  cx.innerHTML = `<div class="barra"><button class="btn" onclick="closetFormPost()">+ Novo texto</button>
      <a class="btn secund" href="/closet/blog" target="_blank" rel="noopener">🌐 Ver o blog</a></div>
    <p class="sub">Cada texto liga a uma ocasião e leva o leitor direto para as peças daquela ocasião — é o que transforma leitura em reserva.</p>
    ${d.posts.length ? `<table><thead><tr><th>Título</th><th>Categoria</th><th>Ocasião</th><th>Situação</th><th>Leituras</th><th></th></tr></thead><tbody>
      ${d.posts.map((p) => `<tr>
        <td><b>${esc(p.titulo)}</b><br><span class="obs">/closet/blog/${esc(p.slug)}</span></td>
        <td>${esc((d.categorias.find((c) => c.slug === p.categoria) || {}).nome || p.categoria)}</td>
        <td>${esc(p.ocasiao || '—')}</td>
        <td><span class="badge ${p.status === 'publicado' ? 'st-feito' : 'st-pendente'}">${esc(p.status)}</span></td>
        <td>${p.visualizacoes}</td>
        <td style="white-space:nowrap"><button class="btn secund" onclick="closetFormPost('${p.id}')">Editar</button>
          <button class="btn secund" onclick="closetRemoverPost('${p.id}')">Excluir</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="vazio">Nenhum texto ainda.</p>'}`;
}
function closetFormPost(id) {
  const d = window._ccBlog || { posts: [], categorias: [], ocasioes: [] };
  const p = d.posts.find((x) => x.id === id) || { categoria: 'guia', status: 'rascunho', tags: [] };
  const html = `<h3>${id ? 'Editar texto' : 'Novo texto'}</h3>
    <label>Título</label><input id="po-titulo" value="${esc(p.titulo || '')}" style="width:100%">
    <label>Resumo (aparece na listagem e no Google)</label><textarea id="po-resumo" rows="2" style="width:100%">${esc(p.resumo || '')}</textarea>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:150px"><label>Categoria</label><select id="po-cat" style="width:100%">
        ${d.categorias.map((c) => `<option value="${c.slug}"${p.categoria === c.slug ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div style="flex:1;min-width:150px"><label>Ocasião</label><select id="po-oc" style="width:100%"><option value="">— nenhuma —</option>
        ${d.ocasioes.map((o) => `<option value="${o.slug}"${p.ocasiao === o.slug ? ' selected' : ''}>${esc(o.nome)}</option>`).join('')}</select></div>
      <div style="flex:1;min-width:120px"><label>Situação</label><select id="po-status" style="width:100%">
        <option value="rascunho"${p.status === 'rascunho' ? ' selected' : ''}>rascunho</option>
        <option value="publicado"${p.status === 'publicado' ? ' selected' : ''}>publicado</option></select></div>
    </div>
    <label>Capa (URL)</label><input id="po-capa" value="${esc(p.capa || '')}" style="width:100%">
    <label>Texto — markdown leve: ## título, **negrito**, - lista, > citação, [link](/closet/vitrine)</label>
    <textarea id="po-corpo" rows="14" style="width:100%;font-family:ui-monospace,monospace;font-size:.85rem">${esc(p.corpo || '')}</textarea>
    <p id="po-msg" class="erro"></p>
    <div class="barra"><button class="btn" onclick="closetSalvarPost(${id ? `'${id}'` : 'null'})">Salvar</button></div>`;
  // o Portal Staff não tem modal: o editor abre no lugar da lista, como nos
  // outros módulos, com botão de voltar
  $('#cc-corpo').innerHTML = `<div class="barra"><button class="btn secund" onclick="closetCorpo()">← Voltar</button></div>` + html;
}
async function closetSalvarPost(id) {
  const v = (i) => (document.getElementById(i) ? document.getElementById(i).value : '');
  try {
    await api('POST', '/closet/posts', {
      id: id || '', titulo: v('po-titulo'), resumo: v('po-resumo'), corpo: v('po-corpo'),
      capa: v('po-capa'), categoria: v('po-cat'), ocasiao: v('po-oc'), status: v('po-status'),
    });
    closetCorpo();
  } catch (e) { const m = document.getElementById('po-msg'); if (m) m.textContent = e.message; else alert(e.message); }
}
async function closetRemoverPost(id) {
  if (!confirm('Excluir este texto? O endereço sai do ar e o Google vai devolver 404.')) return;
  try { await api('DELETE', `/closet/posts/${id}`); closetCorpo(); } catch (e) { alert(e.message); }
}

/* -------------------------------- parceiros ------------------------------- */
async function closetParceiros(cx) {
  const d = await api('GET', '/closet/parceiros');
  window._ccParc = d;
  cx.innerHTML = `<div class="cards">
      ${ccCard('Parceiros ativos', d.resumo.ativos, `${d.resumo.em_analise} em análise`)}
      ${ccCard('Serviços', d.resumo.servicos, `${d.resumo.contratados} já contratados`)}
      ${ccCard('Receita de serviços', ccBrl(d.resumo.receita_servicos_centavos), 'comissão sobre parceiros')}
    </div>
    <h3 style="margin-top:16px">Parceiros</h3>
    ${d.parceiros.length ? `<table><thead><tr><th>Parceiro</th><th>Tipo</th><th>Cidade</th><th>Serviços</th><th>Situação</th><th></th></tr></thead><tbody>
      ${d.parceiros.map((p) => `<tr><td><b>${esc(p.nome)}</b><br><span class="obs">${esc(p.email || '')} ${esc(p.telefone || '')}</span></td>
        <td>${esc(p.tipo)}</td><td>${esc(p.cidade || '')}</td>
        <td>${p.servicos.length}${p.servicos.length ? '<br><span class="obs">' + p.servicos.slice(0, 3).map((s2) => esc(s2.nome)).join(', ') + '</span>' : ''}</td>
        <td><span class="badge ${p.status === 'ativo' ? 'st-feito' : p.status === 'analise' ? 'st-pendente' : 'st-erro'}">${esc(p.status)}</span></td>
        <td style="white-space:nowrap">${p.status === 'analise'
    ? `<button class="btn" onclick="closetAprovarParceiro('${p.id}',true)">Aprovar</button>
       <button class="btn secund" onclick="closetAprovarParceiro('${p.id}',false)">Recusar</button>`
    : p.status === 'ativo' ? '✓' : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Nenhum parceiro ainda.</p>'}
    <h3 style="margin-top:20px">Zonas de entrega</h3>
    <p class="sub">Sem zona cadastrada, a entrega não é oferecida no checkout — melhor não oferecer do que cobrar um valor que não dá para honrar.</p>
    ${d.zonas.length ? `<table><thead><tr><th>Cidade</th><th>Bairro</th><th>Preço</th><th>Prazo</th><th></th></tr></thead><tbody>
      ${d.zonas.map((z) => `<tr><td>${esc(z.cidade)}${z.uf ? '/' + esc(z.uf) : ''}</td><td>${esc(z.bairro || 'toda a cidade')}</td>
        <td>${ccBrl(z.preco_centavos)}</td><td>${z.prazo_h}h</td>
        <td><button class="btn secund" onclick="closetRemoverZona('${z.id}')">Remover</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Nenhuma zona — a entrega está desligada.</p>'}
    <div class="barra" style="margin-top:8px"><button class="btn" onclick="closetNovaZona()">+ Nova zona</button></div>`;
}
async function closetAprovarParceiro(id, aprovado) {
  if (aprovado && !confirm('Aprovar? A conta ligada vira "parceiro" e os serviços passam a aparecer no checkout.')) return;
  try { await api('POST', `/closet/parceiros/${id}/aprovar`, { aprovado }); closetCorpo(); } catch (e) { alert(e.message); }
}
async function closetNovaZona() {
  const cidade = prompt('Cidade:'); if (!cidade) return;
  const bairro = prompt('Bairro (vazio = toda a cidade):', '') || '';
  const preco = prompt('Preço da entrega (R$):', '25'); if (preco === null) return;
  const prazo = prompt('Prazo em horas:', '24') || '24';
  try {
    await api('POST', '/closet/zonas', { cidade, bairro, preco_centavos: Math.round(Number(preco) * 100), prazo_h: Number(prazo) });
    closetCorpo();
  } catch (e) { alert(e.message); }
}
async function closetRemoverZona(id) {
  if (!confirm('Remover esta zona de entrega?')) return;
  try { await api('DELETE', `/closet/zonas/${id}`); closetCorpo(); } catch (e) { alert(e.message); }
}

/* ------------------------------- crescimento ------------------------------ */
async function closetCrescimento(cx) {
  const d = await api('GET', '/closet/crescimento');
  const fotosLocal = (d.fotos.find((f) => f.storage === 'local') || { c: 0, b: 0 });
  const fotosS3 = (d.fotos.find((f) => f.storage === 's3') || { c: 0, b: 0 });
  cx.innerHTML = `<div class="cards">
      ${ccCard('Convites', d.indicacoes.convites, `${d.indicacoes.premiados} viraram aluguel`)}
      ${ccCard('Crédito concedido', ccBrl(d.indicacoes.credito_concedido_centavos), `${ccBrl(d.indicacoes.credito_usado_centavos)} já usado`)}
      ${ccCard('Crédito em aberto', ccBrl(d.creditos_abertos_centavos), 'passivo da plataforma')}
      ${ccCard('Chaves de API', d.api.chaves_ativas, `${d.api.chamadas} chamada(s)`)}
      ${ccCard('Fotos', fotosLocal.c + fotosS3.c, `${Math.round(((fotosLocal.b + fotosS3.b) / 1048576) * 10) / 10} MB · ${fotosS3.c ? 'S3/R2' : 'disco local'}`)}
    </div>
    <h3 style="margin-top:16px">Últimas indicações</h3>
    ${d.ultimos.length ? `<table><thead><tr><th>Quem indicou</th><th>Quem entrou</th><th>Situação</th><th>Prêmio</th><th>Quando</th></tr></thead><tbody>
      ${d.ultimos.map((r) => `<tr><td>${esc(r.padrinho || '—')}</td><td>${esc(r.convidado || '—')}</td>
        <td><span class="badge ${r.status === 'premiado' ? 'st-feito' : 'st-pendente'}">${esc(r.status)}</span></td>
        <td>${ccBrl(r.premio_centavos)}</td><td>${ccDia(r.criado_em)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Nenhuma indicação ainda.</p>'}
    <p class="sub" style="margin-top:12px">⚠️ Crédito em aberto é dinheiro que a plataforma vai bancar em desconto futuro — ele sai da comissão, nunca do repasse do proprietário.</p>`;
}

/* ---------------------------------- leads --------------------------------- */
async function closetLeads(cx) {
  const d = await api('GET', '/closet/leads');
  cx.innerHTML = d.leads.length
    ? `<table><thead><tr><th>Quando</th><th>Pessoa</th><th>Quer</th><th>Cidade</th><th>Situação</th></tr></thead><tbody>
       ${d.leads.map((l) => `<tr><td>${ccDia(l.criado_em)}</td>
         <td><b>${esc(l.nome)}</b><br><span class="sub">${esc(l.email)} ${esc(l.telefone || '')}</span></td>
         <td>${esc(l.perfil)}</td><td>${esc(l.cidade || '')}</td><td>${esc(l.status)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="vazio">Nenhum lead ainda.</p>';
}
