'use strict';
// ============================================================================
// Portal Staff — módulo: app-finance (Villela Finance, o ERP financeiro).
//
// Administração da PLATAFORMA: contas assinantes, planos, cobrança e a
// saúde contábil de todas elas. O uso do sistema (razão, extrato, contas a
// pagar) fica no painel do assinante, em /finance.
//
// ⚠️ Não confundir com a seção "💰 Contas a pagar" e as outras telas do
// financeiro LEGADO deste portal (`/staff/api/financeiro/*`). Este painel
// fala com `/staff/api/finance/*` — produto separado, banco separado.
//
// A aba 🩺 Saúde é a razão de este painel existir: ela responde "posso
// confiar nos números?" para TODAS as contas de uma vez — razão fechando,
// cadeia de auditoria íntegra e diário replicado. Um ERP que não mostra
// isso pede confiança em vez de prová-la.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================

const FIN = {
  tab: 'saude',
  _planos: null,

  api(m, c, b) { return api(m, '/finance' + c, b); },
  brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); },
  dt(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'; },
  dth(s) { return s ? new Date(s).toLocaleString('pt-BR') : '—'; },
  sel(s) {
    const cor = { ativa: 'st-feito', trial: 'st-pendente', inadimplente: 'st-pendente' }[s] || 'st-erro';
    return `<span class="badge ${cor}">${esc(s || '—')}</span>`;
  },
  sim(v, rotOk = 'ok', rotNao = 'FALHA') { return v ? `<span class="badge st-feito">${rotOk}</span>` : `<span class="badge st-erro">${rotNao}</span>`; },

  abas() {
    return [['saude', '🩺 Saúde'], ['contas', '🏢 Contas'], ['cobranca', '💰 Cobrança'],
      ['planos', '💳 Planos'], ['diario', '📜 Diário & risco']];
  },

  abrir() { FIN.render(); },
  ir(t) { FIN.tab = t; FIN.render(); },
  corpo() { return document.getElementById('fin-corpo'); },

  render() {
    const abas = FIN.abas().map(([id, r]) =>
      `<button class="btn ${FIN.tab === id ? '' : 'secund'} peq" onclick="FIN.ir('${id}')">${r}</button>`).join(' ');
    conteudo().innerHTML = cabecalho('💰 Villela Finance — plataforma',
      'ERP financeiro vendido a PMEs: razão de partida dobrada, conciliação bancária, contas a pagar e receber, fechamento. Esta é a administração; o uso fica em /finance.')
      + `<div class="barra">
          <a class="btn secund" href="/finance" target="_blank" rel="noopener">🌐 Landing /finance</a>
          <a class="btn secund" href="/finance" target="_blank" rel="noopener">🖥️ Painel do assinante</a>
         </div>
         <div class="card" style="display:flex;flex-wrap:wrap;gap:.4rem">${abas}</div>
         <div id="fin-corpo"><p class="sub">Carregando…</p></div>`;
    FIN.pintar();
  },

  async pintar() {
    const telas = { saude: FIN.vSaude, contas: FIN.vContas, cobranca: FIN.vCobranca, planos: FIN.vPlanos, diario: FIN.vDiario };
    try { await telas[FIN.tab](); }
    catch (e) { FIN.corpo().innerHTML = `<div class="card"><p class="erro">${esc(e.message)}</p></div>`; }
  },

  // ------------------------------------------------------------- SAÚDE
  async vSaude() {
    const s = await FIN.api('GET', '/saude');
    const card = (n, rot, alerta) => `<div class="card" style="min-width:150px;flex:1${alerta ? ';border-color:var(--alerta)' : ''}">
      <div class="sub">${esc(rot)}</div><div style="font-size:1.5rem;font-weight:700">${n}</div></div>`;
    const razaoRuim = s.resumo.total - s.resumo.razaoOk;
    const audRuim = s.resumo.total - s.resumo.auditoriaOk;

    // O diário é o RPO: sem réplica, o pior caso de perda volta a ser o
    // snapshot diário. Dizer isso aqui evita a promessa vazia de "backup ok".
    const d = s.diario || {};
    const replica = d.configurada
      ? `<span class="badge st-feito">replicando</span> última: ${FIN.dth(d.ultimaReplica && d.ultimaReplica.quando)}`
      : '<span class="badge st-erro">LOCAL</span> defina FINANCE_S3_* para replicar';

    let h = `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${card(s.resumo.total, 'Contas')}
      ${card(`${s.resumo.razaoOk}/${s.resumo.total}`, 'Razão fechando', razaoRuim > 0)}
      ${card(`${s.resumo.auditoriaOk}/${s.resumo.total}`, 'Auditoria íntegra', audRuim > 0)}
      ${card(esc(String(d.meses || 0)), 'Meses no diário')}</div>`;

    h += `<div class="card"><h3>📜 Diário append-only (o RPO)</h3><p>${replica}</p>
      ${d.veredito ? `<p class="sub">${esc(d.veredito)}</p>` : ''}
      <p><button class="btn secund peq" onclick="FIN.replicar()">▶️ Replicar agora</button></p></div>`;

    h += `<div class="card"><h3>Por conta</h3>${tabela(
      ['Conta', 'Status', 'Razão', 'Auditoria', 'Empresas'],
      s.contas.map(c => [
        `<b>${esc(c.nome)}</b><br><span class="obs">${esc(c.tenant)}</span>`,
        FIN.sel(c.status),
        FIN.sim(c.razaoOk, 'fecha', 'NÃO FECHA') + (c.razaoOk ? '' :
          `<br><span class="obs">${esc(c.empresas.filter(e => !e.ok).map(e => `${e.empresa}: ${e.diferencaCents} centavos`).join(' · '))}</span>`),
        FIN.sim(c.auditoria.ok, 'íntegra', 'ADULTERADA') + (c.auditoria.ok ? '' :
          `<br><span class="obs">quebra no seq ${esc(String(c.auditoria.quebra && c.auditoria.quebra.seq))}</span>`),
        c.empresas.map(e => esc(e.empresa)).join(', ') || '—',
      ]))}
      <p class="sub">Isolamento: ${esc(s.isolamento.modelo)} · RLS: ${s.isolamento.rls ? 'sim' : 'não'} · provado por <code>${esc(s.isolamento.testado)}</code>.</p></div>`;
    FIN.corpo().innerHTML = h;
  },

  async replicar() {
    try { const r = await FIN.api('POST', '/diario/replicar'); alert(`Réplica: ${(r.enviados || []).length} arquivo(s), ${(r.falhas || []).length} falha(s).${r.motivo ? ' ' + r.motivo : ''}`); FIN.pintar(); }
    catch (e) { alert(e.message); }
  },

  // ------------------------------------------------------------ CONTAS
  async vContas() {
    const { tenants } = await FIN.api('GET', '/tenants');
    await FIN.carregarPlanos();
    let h = `<details class="cr-box"><summary class="cr-sum">➕ Nova conta assinante</summary>
      <form class="form" id="fin-nova" style="max-width:680px;margin-top:12px">
        <div class="hi-grid">
          <label>Nome da conta * <input id="fin-nome" required maxlength="200"></label>
          <label>CNPJ <input id="fin-doc" maxlength="20"></label>
          <label>E-mail de contato <input id="fin-email" type="email"></label>
          <label>Plano <select id="fin-plano">${FIN.opcoesPlano('trial')}</select></label>
          <label>Empresa (razão social) <input id="fin-emp" maxlength="200" placeholder="igual ao nome da conta, se vazio"></label>
        </div>
        <button class="btn" type="submit">Provisionar</button>
        <p class="sub">A conta nasce com plano de contas brasileiro, período aberto e regras de classificação. O acesso do dono é criado depois, na própria conta.</p>
        <p id="fin-nova-msg" class="erro"></p></form></details>`;

    h += `<div class="card">${tenants.length ? tabela(
      ['Conta', 'Plano', 'Status', 'Empresas', 'Criada', ''],
      tenants.map(t => [
        `<b>${esc(t.nome)}</b><br><span class="obs">${esc(t.slug)}${t.contatoEmail ? ' · ' + esc(t.contatoEmail) : ''}${t.interno ? ' · <b>cortesia do grupo</b>' : ''}</span>`,
        esc(t.plano.nome),
        FIN.sel(t.status) + (t.trialAte ? `<br><span class="obs">até ${FIN.dt(t.trialAte)}</span>` : ''),
        t.empresas,
        FIN.dt(t.criadoEm),
        `<select class="peq" onchange="FIN.trocarPlano('${t.id}', this.value)" style="width:auto">
           <option value="">plano…</option>${FIN.opcoesPlano('')}</select>`,
      ])) : '<p class="vazio">Nenhuma conta ainda.</p>'}</div>`;
    FIN.corpo().innerHTML = h;

    const f = document.getElementById('fin-nova');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById('fin-nova-msg'); msg.textContent = '';
      try {
        await FIN.api('POST', '/tenants', {
          nome: document.getElementById('fin-nome').value,
          documento: document.getElementById('fin-doc').value,
          contatoEmail: document.getElementById('fin-email').value,
          planoSlug: document.getElementById('fin-plano').value,
          empresa: { nome: document.getElementById('fin-emp').value || undefined },
        });
        FIN.vContas();
      } catch (e) { msg.textContent = e.message; }
    };
  },

  async carregarPlanos() {
    if (!FIN._planos) FIN._planos = (await FIN.api('GET', '/planos')).planos;
    return FIN._planos;
  },
  opcoesPlano(sel) {
    return (FIN._planos || []).map(p =>
      `<option value="${esc(p.slug)}"${p.slug === sel ? ' selected' : ''}>${esc(p.nome)}${p.precoCents ? ' — ' + esc(p.preco) : ''}</option>`).join('');
  },
  async trocarPlano(id, slug) {
    if (!slug) return;
    try { await FIN.api('PATCH', '/tenants/' + id, { planoSlug: slug, motivo: 'troca de plano pelo painel da plataforma' }); FIN.vContas(); }
    catch (e) { alert(e.message); }
  },

  // ---------------------------------------------------------- COBRANÇA
  async vCobranca() {
    const { resumo: r, faturas } = await FIN.api('GET', '/billing');
    const card = (n, rot, alerta) => `<div class="card" style="min-width:140px;flex:1${alerta ? ';border-color:var(--alerta)' : ''}">
      <div class="sub">${esc(rot)}</div><div style="font-size:1.5rem;font-weight:700">${n}</div></div>`;

    let h = `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${card(esc(r.mrr), 'MRR')}${card(esc(r.arr), 'ARR')}${card(esc(r.emRisco), 'Em risco', r.por.inadimplentes > 0)}
      ${card(r.por.pagantes, 'Pagantes')}${card(r.por.trial, 'Em avaliação')}
      ${card(r.por.inadimplentes, 'Inadimplentes', r.por.inadimplentes > 0)}
      ${card(r.por.suspensas, 'Suspensas')}${card(r.por.cortesia, 'Cortesia')}</div>`;

    h += `<div class="card"><p>Pagamento online: ${FIN.sim(r.pagamentoOnline, 'Mercado Pago ligado', 'MANUAL (sem MP_ACCESS_TOKEN)')}
      · régua: inadimplente há mais de <b>${r.diasAteSuspender} dias</b> → suspensa.
      <button class="btn secund peq" onclick="FIN.rodarCiclo()">▶️ Rodar a régua agora</button></p>
      <p class="sub">Suspensa não lança — mas <b>continua lendo e exportando o próprio razão</b>. Reter contabilidade de terceiro para forçar pagamento é problema jurídico, não alavanca comercial.</p></div>`;

    h += `<div class="card"><h3>Contas</h3>${tabela(
      ['Conta', 'Plano', 'Status', 'Mensalidade', 'Ações'],
      r.contas.map(c => [
        `<b>${esc(c.nome)}</b><br><span class="obs">${esc(c.slug)}${c.contatoEmail ? ' · ' + esc(c.contatoEmail) : ''}</span>`,
        esc(c.planoNome),
        FIN.sel(c.status) + (c.interno ? ' <span class="obs">cortesia</span>' : ''),
        c.pagante ? esc(c.preco) : `<span class="obs">${esc(c.preco)} (não contabilizado)</span>`,
        c.interno ? '<span class="obs">conta do grupo — fora da cobrança</span>' : `
          <button class="btn peq secund" onclick="FIN.marcarPago('${c.id}','${esc(c.nome)}')">💵 Registrar pagamento</button>
          <button class="btn peq secund" onclick="FIN.mudarStatus('${c.id}','${esc(c.nome)}')">⚙️ Status</button>`,
      ]))}</div>`;

    h += `<div class="card"><h3>Faturas (todas as contas)</h3>${faturas.length ? tabela(
      ['Quando', 'Conta', 'Competência', 'Valor', 'Status'],
      faturas.map(f => [FIN.dt(f.criadoEm), esc(f.conta), esc(f.competencia), esc(f.valor),
        `<span class="badge ${f.status === 'paga' ? 'st-feito' : 'st-pendente'}">${esc(f.status)}</span>`]))
      : '<p class="vazio">Nenhuma fatura ainda.</p>'}</div>`;
    FIN.corpo().innerHTML = h;
  },

  async marcarPago(id, nome) {
    // Pix, boleto, transferência: como um contrato B2B costuma pagar antes
    // de existir recorrência. O motivo é obrigatório porque vai à auditoria.
    const motivo = prompt(`Registrar pagamento de "${nome}".\n\nMeio e referência (vai para a auditoria da conta):`, 'Pix recebido — comprovante no e-mail');
    if (!motivo) return;
    const valor = prompt('Valor em reais (vazio = mensalidade do plano):', '');
    try {
      const corpo = { motivo };
      if (valor) corpo.valorCents = Math.round(Number(String(valor).replace(',', '.')) * 100);
      const r = await FIN.api('POST', `/billing/${id}/pago`, corpo);
      alert(`✅ Pagamento registrado (${FIN.brl(r.fatura.valor_cents)}) e conta reativada.`);
      FIN.vCobranca();
    } catch (e) { alert(e.message); }
  },

  async mudarStatus(id, nome) {
    const status = prompt(`Status comercial de "${nome}":\nativa · inadimplente · suspensa · cancelada`, 'ativa');
    if (!status) return;
    const motivo = prompt('Motivo (vai para a auditoria da conta):', '');
    if (!motivo) return;
    try { await FIN.api('POST', `/billing/${id}/status`, { status: status.trim(), motivo }); FIN.vCobranca(); }
    catch (e) { alert(e.message); }
  },

  async rodarCiclo() {
    try {
      const r = await FIN.api('POST', '/billing/ciclo');
      alert(`Régua: ${r.trialsVencidos.length} avaliação(ões) encerrada(s), ${r.suspensas.length} conta(s) suspensa(s).`);
      FIN.vCobranca();
    } catch (e) { alert(e.message); }
  },

  // ------------------------------------------------------------ PLANOS
  async vPlanos() {
    const { planos, catalogoModulos, limitesConhecidos } = await FIN.api('GET', '/planos');
    FIN._planos = planos;
    const nomeModulo = (id) => { const m = catalogoModulos.find(x => x.id === id); return m ? m.nome : id; };

    let h = `<div class="card"><h3>Planos</h3>${tabela(
      ['Plano', 'Preço/mês', 'Módulos', 'Limites', 'Vitrine'],
      planos.map(p => [
        `<b>${esc(p.nome)}</b><br><span class="obs">${esc(p.slug)}</span>`,
        `${esc(p.preco)}<br><button class="btn peq secund" onclick="FIN.mudarPreco('${esc(p.slug)}', ${p.precoCents})">alterar</button>`,
        `<span class="obs">${esc(p.modulos.map(nomeModulo).join(' · ')) || '—'}</span>`,
        `<span class="obs">${esc(limitesConhecidos.map(l => `${l.replace(/_/g, ' ')}: ${p.limites[l] === 0 || p.limites[l] == null ? '∞' : p.limites[l]}`).join(' · '))}</span>`,
        p.publico ? '<span class="badge st-feito">pública</span>' : '<span class="obs">interna</span>',
      ]))}
      <p class="sub">Limite <b>0</b> = sem limite. Alterar preço não muda assinatura já ativa no Mercado Pago — a recorrência é criada com o valor do dia; para trocar, o assinante cancela e reassina.</p></div>`;

    h += `<div class="card"><h3>Catálogo de módulos</h3>${tabela(['Módulo', 'Chave', 'Essencial'],
      catalogoModulos.map(m => [esc(m.nome), `<code>${esc(m.id)}</code>`, m.essencial ? 'sim' : '—']))}</div>`;
    FIN.corpo().innerHTML = h;
  },

  async mudarPreco(slug, atual) {
    const v = prompt(`Novo preço mensal do plano "${slug}", em reais:`, String((atual / 100).toFixed(2)));
    if (v == null) return;
    try {
      await FIN.api('PATCH', '/planos/' + slug, { precoCents: Math.round(Number(String(v).replace(',', '.')) * 100) });
      FIN._planos = null; FIN.vPlanos();
    } catch (e) { alert(e.message); }
  },

  // ------------------------------------------------------ DIÁRIO & RISCO
  async vDiario() {
    const mes = (document.getElementById('fin-mes') || {}).value || new Date().toISOString().slice(0, 7);
    const [conf, cat] = await Promise.all([
      FIN.api('GET', '/diario/conferir/' + mes),
      FIN.api('GET', '/catalogo'),
    ]);
    const porNivel = {};
    for (const a of cat.acoes) (porNivel[a.nivelMinimo] = porNivel[a.nivelMinimo] || []).push(a);

    let h = `<div class="card"><h3>Conferência do diário contra o banco</h3>
      <p><label>Competência <input id="fin-mes" type="month" value="${esc(mes)}" onchange="FIN.vDiario()"></label></p>
      ${tabela(['Conta', 'Conferidos', 'Divergências'], conf.contas.map(c => [
        esc(c.tenant), c.conferidos,
        c.divergencias.length ? `<span class="badge st-erro">${c.divergencias.length}</span> <span class="obs">${esc(JSON.stringify(c.divergencias).slice(0, 200))}</span>` : '<span class="badge st-feito">nenhuma</span>',
      ]))}
      <p class="sub">O diário é gravado <b>depois</b> do commit: falhar ali não desfaz o lançamento — esta conferência é quem acusa a falta.</p></div>`;

    h += `<div class="card"><h3>Níveis de risco das ações</h3>
      <p class="sub">Nível 3 é material: exige segundo par de olhos, alçada e segundo fator. Nível 4 é recusa com motivo escrito — não aviso.</p>
      ${(cat.niveis ? Object.entries(cat.niveis) : []).map(([nome, n]) => `
        <h4 style="margin:.8rem 0 .2rem">${n} — ${esc(nome.toLowerCase())}</h4>
        <p class="obs">${(porNivel[n] || []).map(a => `<code>${esc(a.id)}</code>`).join(' · ') || '—'}</p>
        ${(porNivel[n] || []).filter(a => a.motivo).map(a => `<p class="sub">🚫 <code>${esc(a.id)}</code>: ${esc(a.motivo)}</p>`).join('')}
      `).join('')}</div>`;

    h += `<div class="card"><h3>Perfis</h3>${tabela(['Perfil', 'O que faz', 'Permissões', 'Alçada'],
      cat.perfis.map(p => [esc(p.nome), `<span class="obs">${esc(p.descricao)}</span>`,
        `<span class="obs">${esc((p.permissoes || []).join(' · '))}</span>`,
        p.alcadaCents === -1 ? 'sem teto' : (p.alcadaCents ? FIN.brl(p.alcadaCents) : '—')]))}</div>`;
    FIN.corpo().innerHTML = h;
  },
};

function renderFinance() { FIN.abrir(); }
