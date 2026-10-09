'use strict';
// ============================================================================
// Portal Staff — Villela Academy (administração do marketplace de cursos).
// Painel, aprovações (perfis + produtos), pedidos/reembolso, assinaturas,
// comissões de afiliados, suporte, moderação, leads, config e logs.
// Mesmo padrão de sub-app do Stay Manager. API: /staff/api/academy/*.
// Site público: academia.villelastay.com(.br) → /academy.
// ============================================================================

const ACAD = {
  tab: 'painel',
  api(m, c, b) { return api(m, '/academy' + c, b); },
  brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); },
  dt(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'; },
  chip(t) { return `<span class="chip">${esc(String(t || '—').replace(/_/g, ' '))}</span>`; },

  async abrir() { ACAD.render(); },
  abas() {
    return [['painel', '📊 Painel'], ['aprovacoes', '✅ Aprovações'], ['pedidos', '🧾 Pedidos'],
      ['assinaturas', '🔁 Assinaturas'], ['comissoes', '💸 Comissões'], ['tickets', '🎧 Suporte'],
      ['moderacao', '🚩 Moderação'], ['leads', '📩 Leads'], ['ia', '🤖 Créditos de IA'], ['config', '⚙️ Config'], ['logs', '📜 Logs']];
  },
  render() {
    const abas = ACAD.abas().map(([id, r]) => `<button class="btn ${ACAD.tab === id ? '' : 'secund'} peq" onclick="ACAD.ir('${id}')">${r}</button>`).join(' ');
    conteudo().innerHTML = cabecalho('🎓 Villela Academy', 'Marketplace de cursos e produtos digitais — comissão 10% plataforma / 10% afiliado. Site: academia.villelastay.com.br')
      + `<div class="card" style="display:flex;flex-wrap:wrap;gap:.4rem">${abas}</div><div id="acad-body"><p class="sub">Carregando…</p></div>`;
    ACAD.pintar();
  },
  ir(t) { ACAD.tab = t; ACAD.render(); },
  body() { return document.getElementById('acad-body'); },
  async pintar() {
    try {
      await ({ painel: ACAD.vPainel, aprovacoes: ACAD.vAprovacoes, pedidos: ACAD.vPedidos, assinaturas: ACAD.vAssinaturas,
        comissoes: ACAD.vComissoes, tickets: ACAD.vTickets, moderacao: ACAD.vModeracao, leads: ACAD.vLeads,
        ia: ACAD.vIA, config: ACAD.vConfig, logs: ACAD.vLogs }[ACAD.tab])();
    } catch (e) { ACAD.body().innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  },

  // -------------------------------------------------------- PAINEL
  async vPainel() {
    const [{ resumo: r }, rel] = await Promise.all([ACAD.api('GET', '/dashboard'), ACAD.api('GET', '/relatorios')]);
    const kpi = (rot, val, alerta) => `<div class="card" style="min-width:140px;flex:1${alerta && val ? ';border-color:var(--alerta)' : ''}"><div class="sub">${rot}</div><div style="font-size:1.5rem;font-weight:700">${val}</div></div>`;
    ACAD.body().innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('GMV', ACAD.brl(r.gmv_centavos))}${kpi('Receita plataforma', ACAD.brl(r.receita_plataforma_centavos))}${kpi('MRR', ACAD.brl(r.mrr_centavos))}
      ${kpi('Vendas', r.vendas)}${kpi('Assinaturas ativas', r.assinaturas_ativas)}${kpi('Matrículas ativas', r.matriculas_ativas)}
      ${kpi('Usuários', r.usuarios)}${kpi('Produtores', r.produtores_aprovados)}${kpi('Afiliados', r.afiliados_aprovados)}
      ${kpi('Produtos publicados', r.cursos_publicados)}${kpi('Em revisão', r.produtos_em_revisao, true)}${kpi('Perfis em análise', r.perfis_em_analise, true)}
      ${kpi('Reembolsos', r.reembolsos, true)}${kpi('Tickets abertos', rel.tickets_abertos, true)}${kpi('Leads novos', r.leads_novos, true)}</div>
      <div class="card"><h3>📈 Últimos 6 meses</h3>${tabela(['Mês', 'GMV', 'Receita', 'Vendas', 'Novos usuários', 'Matrículas'],
        rel.serie_mensal.map(m => [esc(m.mes), ACAD.brl(m.gmv_centavos), ACAD.brl(m.receita_centavos), m.vendas, m.novos_usuarios, m.novas_matriculas]))}
      <p class="sub">Conversão de pedidos: <b>${rel.conversao.pct == null ? '—' : rel.conversao.pct + '%'}</b> (${rel.conversao.pagos}/${rel.conversao.pedidos})
        · Churn do mês: <b>${rel.churn.pct == null ? '—' : rel.churn.pct + '%'}</b>
        · Certificados emitidos: <b>${rel.certificados_emitidos}</b></p></div>
      <div class="card"><p class="sub">🌐 <a href="https://academia.villelastay.com.br" target="_blank">academia.villelastay.com.br</a>
        · marketplace público em /academy/marketplace · painel do usuário em /academy/app</p></div>`;
  },

  // -------------------------------------------------------- APROVAÇÕES (perfis + produtos)
  async vAprovacoes() {
    const [pend, { produtos }] = await Promise.all([ACAD.api('GET', '/pendentes'), ACAD.api('GET', '/produtos?status=em_revisao')]);
    const linhaPerfil = (tipo, p) => [esc(p.nome), esc(p.email), tipo, esc(p.nome_publico || '—'), ACAD.dt(p.criado_em),
      `<button class="btn peq" onclick="ACAD.decidirPerfil('${tipo}','${p.user_id}','aprovado')">Aprovar</button>
       <button class="btn secund peq" onclick="ACAD.decidirPerfil('${tipo}','${p.user_id}','rejeitado')">Rejeitar</button>`];
    const perfis = [...pend.produtores.map(p => linhaPerfil('produtor', p)), ...pend.afiliados.map(p => linhaPerfil('afiliado', p))];
    ACAD.body().innerHTML = `<div class="card"><h3>👥 Perfis aguardando análise</h3>
      ${perfis.length ? tabela(['Nome', 'E-mail', 'Tipo', 'Nome público', 'Desde', ''], perfis) : '<p class="vazio">Nada pendente.</p>'}</div>
      <div class="card"><h3>📦 Produtos aguardando revisão editorial</h3>
      ${produtos.length ? tabela(['Produto', 'Produtor', 'Tipo', 'Preço', ''], produtos.map(p => [
        esc(p.titulo), esc(p.produtor_nome), ACAD.chip(p.tipo), ACAD.brl(p.preco_centavos),
        `<button class="btn peq" onclick="ACAD.decidirProduto('${p.id}','aprovado')">Aprovar</button>
         <button class="btn secund peq" onclick="ACAD.decidirProduto('${p.id}','rejeitado')">Rejeitar</button>`,
      ])) : '<p class="vazio">Nada em revisão.</p>'}</div>`;
  },
  async decidirPerfil(tipo, userId, status) {
    const motivo = status === 'rejeitado' ? (prompt('Motivo da rejeição (o solicitante vê):') || '') : '';
    try { await ACAD.api('POST', `/perfis/${tipo}/${userId}/decidir`, { status, motivo }); ACAD.vAprovacoes(); } catch (e) { alert(e.message); }
  },
  async decidirProduto(id, status) {
    const motivo = status === 'rejeitado' ? (prompt('Motivo da rejeição (o produtor vê):') || '') : '';
    try { await ACAD.api('POST', `/produtos/${id}/decidir`, { status, motivo }); ACAD.vAprovacoes(); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- PEDIDOS
  async vPedidos() {
    const { pedidos, kpis } = await ACAD.api('GET', '/pedidos?n=100');
    ACAD.body().innerHTML = `<div class="card"><p class="sub">GMV ${ACAD.brl(kpis.gmv_centavos)} · receita ${ACAD.brl(kpis.receita_plataforma_centavos)} · ${kpis.vendas} venda(s) · ${kpis.pedidos_pendentes} pendente(s) · ${kpis.reembolsos} reembolso(s)</p>
      ${pedidos.length ? tabela(['Produto', 'Comprador', 'Valor', 'Tipo', 'Status', 'Data', ''], pedidos.map(o => [
        esc(o.produto_titulo), esc(o.comprador_email), o.valor_centavos ? ACAD.brl(o.valor_centavos) : 'grátis',
        ACAD.chip(o.tipo || 'avulsa'), ACAD.chip(o.status), ACAD.dt(o.criado_em),
        o.status === 'paga' && o.valor_centavos ? `<button class="btn secund peq" onclick="ACAD.reembolsar('${o.id}')">↩️ Reembolsar</button>` : '',
      ])) : '<p class="vazio">Nenhum pedido.</p>'}</div>`;
  },
  async reembolsar(id) {
    const motivo = prompt('Motivo do reembolso (estorna no MP e revoga o acesso):');
    if (motivo == null) return;
    try { await ACAD.api('POST', `/pedidos/${id}/reembolsar`, { motivo }); ACAD.vPedidos(); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- ASSINATURAS
  async vAssinaturas() {
    const { assinaturas, kpis } = await ACAD.api('GET', '/assinaturas?n=100');
    ACAD.body().innerHTML = `<div class="card"><p class="sub">${kpis.assinaturas_ativas} ativa(s) · MRR ${ACAD.brl(kpis.mrr_centavos)}</p>
      ${assinaturas.length ? tabela(['Clube', 'Assinante', 'Mensalidade', 'Status', 'Desde', ''], assinaturas.map(a => [
        esc(a.produto_titulo), esc(a.assinante_email), ACAD.brl(a.valor_centavos), ACAD.chip(a.status), ACAD.dt(a.criado_em),
        ['ativa', 'pausada', 'pendente'].includes(a.status) ? `<button class="btn secund peq" onclick="ACAD.cancelarSub('${a.id}')">Cancelar</button>` : '',
      ])) : '<p class="vazio">Nenhuma assinatura.</p>'}</div>`;
  },
  async cancelarSub(id) {
    if (!confirm('Cancelar esta assinatura? O assinante perde o acesso agora.')) return;
    try { await ACAD.api('POST', `/assinaturas/${id}/cancelar`); ACAD.vAssinaturas(); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- COMISSÕES
  async vComissoes() {
    const { comissoes } = await ACAD.api('GET', '/comissoes?n=100');
    ACAD.body().innerHTML = `<div class="card"><p class="sub">Ciclo: pendente (garantia) → disponível → paga (repasse manual via Pix) · cancelada em reembolso.</p>
      ${comissoes.length ? tabela(['Afiliado', 'Produto', 'Valor', 'Status', 'Libera em', ''], comissoes.map(c => [
        `${esc(c.afiliado_nome)}<br><span class="sub">${esc(c.afiliado_email)}</span>`, esc(c.produto_titulo),
        `${ACAD.brl(c.valor_centavos)} (${c.pct}%)`, ACAD.chip(c.status), ACAD.dt(c.disponivel_em),
        c.status === 'disponivel' ? `<button class="btn peq" onclick="ACAD.pagarComissao('${c.id}')">💸 Marcar paga</button>` : '',
      ])) : '<p class="vazio">Nenhuma comissão.</p>'}</div>`;
  },
  async pagarComissao(id) {
    if (!confirm('Confirma que o Pix do repasse já foi transferido ao afiliado?')) return;
    try { await ACAD.api('POST', `/comissoes/${id}/pagar`); ACAD.vComissoes(); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- SUPORTE
  async vTickets() {
    const { tickets } = await ACAD.api('GET', '/tickets?n=100');
    ACAD.body().innerHTML = `<div class="card">${tickets.length ? tabela(['Assunto', 'Quem', 'Categoria', 'Status', 'Atualizado', ''], tickets.map(t => [
      esc(t.assunto), `${esc(t.nome)}<br><span class="sub">${esc(t.email)}</span>`, ACAD.chip(t.categoria), ACAD.chip(t.status), ACAD.dt(t.atualizado_em),
      `<button class="btn secund peq" onclick="ACAD.verTicket('${t.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhum ticket.</p>'}</div>`;
  },
  async verTicket(id) {
    const { ticket: t } = await ACAD.api('GET', '/tickets/' + id);
    ACAD.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="ACAD.vTickets()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">${esc(t.assunto)} ${ACAD.chip(t.status)} ${ACAD.chip(t.categoria)}</h3>
      ${t.mensagens.map(m => `<div class="lin"><b>${m.lado === 'plataforma' ? '🏢 Plataforma' : '🙋 ' + esc(m.autor)}</b> <span class="sub">${ACAD.dt(m.criado_em)}</span><br>${esc(m.texto)}</div>`).join('')}
      <form class="form" id="acad-tk-form" style="margin-top:12px"><textarea id="acad-tk-txt" rows="3" placeholder="Responder ao usuário (ele recebe no sininho)"></textarea>
        <button class="btn peq" type="submit">Responder</button>
        <button class="btn secund peq" type="button" onclick="ACAD.ticketStatus('${id}','fechado')">Fechar ticket</button></form></div>`;
    document.getElementById('acad-tk-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await ACAD.api('POST', `/tickets/${id}/responder`, { texto: document.getElementById('acad-tk-txt').value });
      ACAD.verTicket(id);
    };
  },
  async ticketStatus(id, st) { await ACAD.api('POST', `/tickets/${id}/status`, { status: st }); ACAD.vTickets(); },

  // -------------------------------------------------------- MODERAÇÃO
  async vModeracao() {
    const [{ denuncias }, { avaliacoes }, cats] = await Promise.all([
      ACAD.api('GET', '/denuncias'), ACAD.api('GET', '/avaliacoes?n=50'), ACAD.vCategorias(),
    ]);
    ACAD.body().innerHTML = cats + `<div class="card"><h3>🚩 Denúncias abertas</h3>
      ${denuncias.length ? tabela(['Produto', 'Motivo', 'Descrição', ''], denuncias.map(d => [
        esc(d.produto_titulo), ACAD.chip(d.motivo), esc(d.texto || ''),
        `<button class="btn peq" onclick="ACAD.resolverDenuncia('${d.id}','resolvida')">Resolver</button>
         <button class="btn secund peq" onclick="ACAD.resolverDenuncia('${d.id}','descartada')">Descartar</button>`,
      ])) : '<p class="vazio">Nenhuma denúncia aberta.</p>'}</div>
      <div class="card"><h3>⭐ Avaliações</h3>
      ${avaliacoes.length ? tabela(['Produto', 'Aluno', 'Nota', 'Texto', 'Status', ''], avaliacoes.map(a => [
        esc(a.produto_titulo), esc(a.nome), a.nota + '★', esc(a.texto || ''), ACAD.chip(a.status),
        `<button class="btn secund peq" onclick="ACAD.moderarAvaliacao('${a.id}','${a.status === 'publicada' ? 'oculta' : 'publicada'}')">${a.status === 'publicada' ? 'Ocultar' : 'Republicar'}</button>`,
      ])) : '<p class="vazio">Nenhuma avaliação.</p>'}</div>`;
  },
  async vCategorias() {
    const { categorias } = await ACAD.api('GET', '/categorias');
    const linhas = categorias.map(c => [
      esc(c.rotulo), `<code>${esc(c.slug)}</code>`, ACAD.chip(c.origem),
      esc(c.criador_nome || (c.origem === 'sistema' ? '—' : '')),
      `${c.produtos} (${c.publicados} publicado${c.publicados === 1 ? '' : 's'})`,
      `<button class="btn secund peq" onclick="ACAD.renomearCategoria('${c.slug}','${esc(c.rotulo).replace(/'/g, "\\'")}')">Renomear</button>` +
      (c.origem === 'produtor' && !c.produtos
        ? ` <button class="btn secund peq" onclick="ACAD.removerCategoria('${c.slug}')">Remover</button>` : ''),
    ]);
    return `<div class="card"><h3>🏷️ Categorias do marketplace</h3>
      <p class="sub">Renomear muda só o rótulo — o endereço e os produtos já classificados continuam valendo.
      Só dá para remover categoria criada por produtor que ninguém está usando; se estiver em uso, renomeie.
      Categoria de produtor só aparece no filtro público quando tem produto publicado.</p>
      ${tabela(['Rótulo', 'Endereço', 'Origem', 'Criada por', 'Produtos', ''], linhas)}</div>`;
  },
  async renomearCategoria(slug, atual) {
    const rotulo = prompt('Novo rótulo da categoria (o endereço não muda):', atual);
    if (!rotulo || rotulo === atual) return;
    try { await ACAD.api('PATCH', `/categorias/${encodeURIComponent(slug)}`, { rotulo }); ACAD.vModeracao(); } catch (e) { alert(e.message); }
  },
  async removerCategoria(slug) {
    if (!confirm(`Remover a categoria "${slug}"? Só funciona se nenhum produto a estiver usando.`)) return;
    try { await ACAD.api('DELETE', `/categorias/${encodeURIComponent(slug)}`); ACAD.vModeracao(); } catch (e) { alert(e.message); }
  },
  async resolverDenuncia(id, status) {
    const resolucao = prompt('Resolução (fica registrada):') || '';
    try { await ACAD.api('POST', `/denuncias/${id}/resolver`, { status, resolucao }); ACAD.vModeracao(); } catch (e) { alert(e.message); }
  },
  async moderarAvaliacao(id, status) {
    try { await ACAD.api('POST', `/avaliacoes/${id}/moderar`, { status }); ACAD.vModeracao(); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- LEADS
  async vLeads() {
    const { leads } = await ACAD.api('GET', '/leads');
    ACAD.body().innerHTML = `<div class="card">${leads.length ? tabela(['Quando', 'Nome', 'E-mail', 'Interesse', 'Mensagem', 'Status'], leads.map(l => [
      ACAD.dt(l.criado_em), esc(l.nome), esc(l.email), ACAD.chip(l.interesse), esc(l.mensagem || ''), ACAD.chip(l.status),
    ])) : '<p class="vazio">Nenhum lead ainda.</p>'}</div>`;
  },

  // -------------------------------------------------------- CRÉDITOS DE IA (carteira-ia.js)
  // Todo uso de provedor de IA sai do saldo do usuário (regra de 08/10/2026). Aqui o dono liga a
  // cobrança, dá crédito de cortesia a quem quiser e vê quanto entrou, quanto foi consumido e o custo.
  async vIA() {
    const p = await ACAD.api('GET', '/ia/carteiras');
    const c = p.config, t = p.total;
    const kpi = (rot, val) => `<div class="card" style="min-width:150px;flex:1"><div class="sub">${rot}</div><div style="font-size:1.4rem;font-weight:700">${val}</div></div>`;
    const local = c.virada_em ? new Date(c.virada_em).toLocaleString('pt-BR') : '';
    ACAD.body().innerHTML = `
      <div class="card" style="${c.ativa ? '' : 'border-color:var(--alerta)'}"><h3>${c.ativa ? '🟢 Cobrança de IA ligada' : '⚪ Cobrança de IA desligada'}</h3>
        <p class="sub">${c.ativa
          ? 'Tutor, mentor, lapidar e ferramentas do produtor saem do saldo de quem usa. Antes de gerar, o usuário vê o valor máximo e confirma; paga só o que foi usado.'
          : 'Enquanto desligada, vale o limite diário antigo e ninguém paga pelo uso. Para ligar é preciso informar o câmbio.'}</p>
        <form class="form" id="acad-ia-cfg"><div class="hi-grid">
          <label>Câmbio (R$ por US$) <input id="aia-cambio" type="number" step="0.01" min="0" value="${c.cambio_brl_usd || ''}" placeholder="ex.: 5.60"></label>
          <label>Margem sobre o custo (%) <input id="aia-margem" type="number" step="1" min="0" value="${c.margem_pct}"></label>
          <label>Pacotes de recarga (R$, separados por vírgula) <input id="aia-pacotes" value="${c.pacotes_centavos.map(v => v / 100).join(', ')}"></label>
          <label>Isentos (e-mails, separados por vírgula) <input id="aia-isentos" value="${esc(c.isentos.join(', '))}" placeholder="a sua conta"></label></div>
          <p class="sub">Virada: ${local ? '<b>' + esc(local) + '</b> — quem tinha matrícula antes disso mantém as consultas grátis do dia naquele curso; matrícula posterior paga tudo.' : 'será gravada no momento em que você ligar a cobrança. Quem já tiver matrícula até lá mantém as consultas grátis do dia naquele curso.'}</p>
          <label style="display:flex;gap:.5rem;align-items:center"><input id="aia-ativa" type="checkbox" style="width:auto" ${c.ativa ? 'checked' : ''}> Cobrança ligada</label>
          <button class="btn peq" type="submit">Salvar</button><p id="aia-msg" class="sub"></p></form></div>
      <div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
        ${kpi('Saldo em aberto', t.saldo)}${kpi('Carregado (pago)', t.carregado)}${kpi('Cortesia dada', t.cortesia)}${kpi('Consumido', t.consumido)}${kpi('Custo no provedor', 'US$ ' + Number(t.custo_provedor_usd).toFixed(2))}</div>
      <div class="card"><h3>🎁 Dar crédito a um usuário</h3>
        <form class="form" id="acad-ia-cred"><div class="hi-grid">
          <label>E-mail da conta na Academy <input id="acr-email" type="email" required></label>
          <label>Valor (R$) <input id="acr-valor" type="number" step="0.01" required placeholder="ex.: 20"></label>
          <label>Tipo <select id="acr-tipo"><option value="cortesia">Cortesia (crédito)</option><option value="ajuste">Ajuste (aceita valor negativo)</option></select></label>
          <label>Motivo (aparece no extrato do usuário) <input id="acr-motivo" required maxlength="200"></label></div>
          <button class="btn peq" type="submit">Creditar</button><p id="acr-msg" class="sub"></p></form></div>
      <div class="card"><h3>👛 Carteiras</h3>${p.carteiras.length ? tabela(['Usuário', 'E-mail', 'Saldo', 'Carregado', 'Cortesia', 'Consumido', 'Último movimento'],
        p.carteiras.map(x => [esc(x.nome || '—'), esc(x.email || '—'), '<b>' + esc(x.saldo_txt) + '</b>', esc(x.carregado_txt), esc(x.cortesia_txt), esc(x.consumido_txt), new Date(x.ultimo).toLocaleString('pt-BR')])) : '<p class="vazio">Ninguém tem movimento ainda.</p>'}</div>
      <div class="card"><h3>📝 Créditos manuais</h3>${p.creditos_manuais.length ? tabela(['Quando', 'E-mail', 'Tipo', 'Valor', 'Motivo', 'Quem'],
        p.creditos_manuais.map(x => [new Date(x.criado_em).toLocaleString('pt-BR'), esc(x.email || '—'), ACAD.chip(x.tipo), esc(x.valor), esc(x.detalhe), esc(x.quem)])) : '<p class="vazio">Nenhum crédito manual.</p>'}</div>`;
    const lista = (id) => document.getElementById(id).value.split(',').map(x => x.trim()).filter(Boolean);
    document.getElementById('acad-ia-cfg').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById('aia-msg');
      const ativa = document.getElementById('aia-ativa').checked;
      const cambio = Number(document.getElementById('aia-cambio').value) || 0;
      if (ativa && !cambio) { msg.textContent = 'Informe o câmbio para ligar a cobrança.'; return; }
      if (ativa && !c.ativa && !confirm('Ligar a cobrança de IA agora?\n\nA partir deste momento, quem se matricular paga pelo uso do Tutor e das ferramentas de IA. Quem já tem matrícula mantém as consultas grátis do dia no curso que já tinha.')) return;
      try {
        await ACAD.api('POST', '/config', { chave: 'ia_cobranca', valor: {
          ativa, cambio_brl_usd: cambio, margem_pct: Number(document.getElementById('aia-margem').value),
          pacotes_centavos: lista('aia-pacotes').map(v => Math.round(Number(v.replace(',', '.')) * 100)).filter(v => v > 0),
          isentos: lista('aia-isentos'),
          // a virada é o instante em que a cobrança foi ligada pela primeira vez — e não muda mais
          virada_em: c.virada_em || (ativa ? new Date().toISOString() : '') } });
        ACAD.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
    document.getElementById('acad-ia-cred').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById('acr-msg');
      const email = document.getElementById('acr-email').value.trim(), valor = Number(document.getElementById('acr-valor').value);
      if (!confirm(`Creditar R$ ${valor.toFixed(2)} para ${email}?`)) return;
      try {
        const r = await ACAD.api('POST', '/ia/creditos', { email, valor_centavos: Math.round(valor * 100), motivo: document.getElementById('acr-motivo').value, tipo: document.getElementById('acr-tipo').value });
        alert(`Feito. Saldo de ${r.email}: ${r.saldo}`);
        ACAD.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
  },

  // -------------------------------------------------------- CONFIG
  async vConfig() {
    const { comissoes } = await ACAD.api('GET', '/config');
    ACAD.body().innerHTML = `<div class="card"><h3>Comissões (números comerciais oficiais)</h3>
      <form class="form" id="acad-cfg-form" style="max-width:480px"><div class="hi-grid">
        <label>Plataforma (%) <input id="acfg-plat" type="number" min="0" max="100" value="${comissoes.plataforma_pct ?? 10}"></label>
        <label>Afiliado padrão (%) <input id="acfg-afil" type="number" min="0" max="90" value="${comissoes.afiliado_padrao_pct ?? 10}"></label>
        <label>Cookie de atribuição (dias) <input id="acfg-cook" type="number" min="1" max="365" value="${comissoes.cookie_dias ?? 30}"></label></div>
        <button class="btn peq" type="submit">Salvar</button><p id="acfg-msg" class="sub"></p></form>
      <p class="sub">Vigentes: plataforma 10% / afiliado 10% (decisão 08/07/2026 — regras/regras-negocio.md). Pedidos antigos guardam o % da época.</p></div>
      <div class="card"><h3>Rotinas</h3><p><button class="btn secund peq" onclick="ACAD.rodarAbandonados()">▶️ Processar pedidos abandonados agora</button></p></div>`;
    document.getElementById('acad-cfg-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById('acfg-msg');
      try {
        await ACAD.api('POST', '/config', { chave: 'comissoes', valor: {
          plataforma_pct: Number(document.getElementById('acfg-plat').value), afiliado_padrao_pct: Number(document.getElementById('acfg-afil').value), cookie_dias: Number(document.getElementById('acfg-cook').value) } });
        msg.textContent = '✅ salvo';
      } catch (e) { msg.textContent = e.message; }
    };
  },
  async rodarAbandonados() {
    try { const r = await ACAD.api('POST', '/pedidos-abandonados/processar'); alert(`${r.lembretes_enviados} lembrete(s) enviado(s).`); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- LOGS
  async vLogs() {
    const [{ eventos: aud }, com, ia] = await Promise.all([
      ACAD.api('GET', '/auditoria?n=40'), ACAD.api('GET', '/comunicacoes-log?n=40'), ACAD.api('GET', '/ia-logs?n=40')]);
    ACAD.body().innerHTML = `<div class="card"><h3>📜 Auditoria</h3>${aud.length ? tabela(['Quando', 'Quem', 'Ação', 'Detalhe'],
        aud.map(a => [new Date(a.quando).toLocaleString('pt-BR'), esc(a.quem), esc(a.acao), esc(a.detalhe || '')])) : '<p class="vazio">—</p>'}</div>
      <div class="card"><h3>📨 Comunicações (e-mail/webhook/interna)</h3>${com.eventos.length ? tabela(['Quando', 'Canal', 'Destino', 'Template', 'Status'],
        com.eventos.map(e => [new Date(e.quando).toLocaleString('pt-BR'), ACAD.chip(e.canal), esc(e.destino), esc(e.template), esc(e.status)])) : '<p class="vazio">—</p>'}</div>
      <div class="card"><h3>🤖 IA (${ia.consultas} consulta(s) · custo estimado ${ACAD.brl(ia.custo_centavos_usd)} USD)</h3>
      ${ia.eventos.length ? tabela(['Quando', 'Agente', 'Modelo', 'Tokens', 'Status'],
        ia.eventos.map(e => [new Date(e.quando).toLocaleString('pt-BR'), ACAD.chip(e.agente), esc(e.modelo), `${e.input_tokens}/${e.output_tokens}`, esc(e.status)])) : '<p class="vazio">—</p>'}</div>`;
  },
};

function renderAcademy() { ACAD.abrir(); }
