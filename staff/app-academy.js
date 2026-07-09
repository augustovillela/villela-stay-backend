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
      ['moderacao', '🚩 Moderação'], ['leads', '📩 Leads'], ['config', '⚙️ Config'], ['logs', '📜 Logs']];
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
        config: ACAD.vConfig, logs: ACAD.vLogs }[ACAD.tab])();
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
    const [{ denuncias }, { avaliacoes }] = await Promise.all([ACAD.api('GET', '/denuncias'), ACAD.api('GET', '/avaliacoes?n=50')]);
    ACAD.body().innerHTML = `<div class="card"><h3>🚩 Denúncias abertas</h3>
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
