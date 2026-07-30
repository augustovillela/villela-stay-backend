'use strict';
// ============================================================================
// Villela Legal — SHELL DA APLICAÇÃO (redesign profissional)
//
// Substitui a faixa de 26 botões por navegação lateral AGRUPADA e reconstrói o
// painel como central de comando. Carregado DEPOIS de app-legal.js e
// app-legal-livro.js: sobrescreve `LG.render`, envelopa `LG.pintar` e troca
// `LG.vPainel`. Os arquivos originais ficam intactos — desligar o redesign é
// remover uma linha do index.html.
//
// Regras que este arquivo respeita:
//  · não cria aba nova sem rota existente (nada de funcionalidade fictícia);
//  · aba que não estiver no catálogo abaixo continua aparecendo (em "Outros"),
//    então um módulo novo nunca desaparece do menu por esquecimento;
//  · toda permissão continua vindo de LG.perm (calculado no servidor).
// ============================================================================

(function () {
  if (typeof LG === 'undefined') return;

  // NOTA: a melhoria das tabelas (wrapper, cabecalho fixo, data-rot, modo card
  // no celular) foi promovida para o helper `tabela()` de app-core.js quando o
  // design system passou a valer para todos os modulos. Nao ha mais wrapper
  // especifico do juridico aqui.

  // ---- catálogo de navegação: aba -> grupo + ícone + rótulo curto ----------
  // A ordem dos grupos segue o fluxo de trabalho do escritório (item 6.1 do
  // briefing), não a ordem em que os módulos foram construídos.
  const GRUPOS = [
    ['Visão geral', [
      ['painel', '📊', 'Painel'],
    ]],
    ['Contencioso', [
      ['processos', '⚖️', 'Processos'],
      ['prazos', '⏰', 'Prazos'],
      ['agenda', '📅', 'Agenda'],
      ['audiencias', '🏛️', 'Audiências'],
      ['publicacoes', '📰', 'Publicações'],
      ['matrizes', '🧩', 'Estratégia e provas'],
    ]],
    ['Relacionamento', [
      ['clientes', '👥', 'Clientes'],
      ['crm', '🤝', 'CRM jurídico'],
      ['portalcliente', '🪟', 'Portal do cliente'],
    ]],
    ['Conhecimento', [
      ['pesquisa', '🔎', 'Pesquisa'],
      ['ia', '🤖', 'IA jurídica'],
    ]],
    ['Contratos e documentos', [
      ['ciclo', '📜', 'Ciclo contratual'],
      ['contratos', '📑', 'Minutas e análise'],
      ['pecas', '📝', 'Peças'],
      ['documentos', '📂', 'Documentos'],
    ]],
    ['Financeiro', [
      ['financeiro', '💰', 'Lançamentos'],
      ['financeiro2', '💼', 'Honorários e horas'],
    ]],
    ['Governança', [
      ['controladoria', '🎛️', 'Controladoria'],
      ['compliance', '🛡️', 'Compliance e LGPD'],
      ['agentes', '🤖', 'Central de agentes'],
      ['auditoria', '📜', 'Auditoria'],
    ]],
    ['Escritório', [
      ['interno', '🏛️', 'Portal interno'],
      ['tarefas', '✅', 'Tarefas'],
      ['conteudo', '📣', 'Conteúdo'],
      ['relatorios', '📊', 'Relatórios'],
      ['equipe', '⚙️', 'Equipe'],
    ]],
  ];

  // pendências que merecem um contador no menu (vem do /dashboard, sem chamada extra)
  const PINOS = {
    prazos: (r) => (r.prazos_hoje || 0) + (r.prazos_sem_validacao || 0),
    publicacoes: (r) => r.publicacoes_novas || 0,
    tarefas: (r) => r.tarefas_atrasadas || 0,
    pecas: (r) => r.pecas_em_revisao || 0,
    ia: (r) => (r.ia_pendentes || 0) + (r.ia_sem_revisao || 0),
  };

  LG.resumo = null;                        // último /dashboard, reusado pelos pinos
  LG.navColapsada = (() => { try { return localStorage.getItem('vx-nav') === 'colapsada'; } catch (_) { return false; } })();

  // ---------------------------------------------------------------- NAV
  function montarNav() {
    const disponiveis = new Map(LG.abas().map(([id, rot]) => [id, rot]));
    const usadas = new Set();
    const r = LG.resumo || {};
    let html = '';
    for (const [grupo, itens] of GRUPOS) {
      const visiveis = itens.filter(([id]) => disponiveis.has(id));
      if (!visiveis.length) continue;
      html += `<div class="vx-nav-grupo">${esc(grupo)}</div>`;
      for (const [id, ico, rot] of visiveis) {
        usadas.add(id);
        const ativo = LG.tab === id;
        const n = PINOS[id] ? PINOS[id](r) : 0;
        html += `<button type="button" class="vx-nav-item" onclick="LG.ir('${id}')"
          ${ativo ? 'aria-current="page"' : ''} title="${esc(rot)}">
          <span class="vx-nav-ico" aria-hidden="true">${ico}</span>
          <span class="vx-nav-rot">${esc(rot)}</span>
          ${n ? `<span class="vx-nav-pino" aria-label="${n} pendência(s)">${n > 99 ? '99+' : n}</span>` : ''}
        </button>`;
      }
    }
    // qualquer aba fora do catálogo continua acessível
    const sobras = [...disponiveis.entries()].filter(([id]) => !usadas.has(id));
    if (sobras.length) {
      html += `<div class="vx-nav-grupo">Outros</div>`;
      for (const [id, rot] of sobras) {
        html += `<button type="button" class="vx-nav-item" onclick="LG.ir('${id}')"
          ${LG.tab === id ? 'aria-current="page"' : ''}><span class="vx-nav-rot">${esc(rot)}</span></button>`;
      }
    }
    html += `<hr class="vx-sep" style="margin:8px 4px">
      <button type="button" class="vx-nav-item vx-nav-toggle" onclick="LG.alternarNav()"
        aria-label="${LG.navColapsada ? 'Expandir menu' : 'Recolher menu'}">
        <span class="vx-nav-ico" aria-hidden="true">${LG.navColapsada ? '»' : '«'}</span>
        <span class="vx-nav-rot">Recolher menu</span></button>`;
    return html;
  }

  LG.alternarNav = function () {
    LG.navColapsada = !LG.navColapsada;
    try { localStorage.setItem('vx-nav', LG.navColapsada ? 'colapsada' : 'aberta'); } catch (_) {}
    const app = document.getElementById('vx-app');
    if (app) app.setAttribute('data-nav', LG.navColapsada ? 'colapsada' : 'aberta');
    const nav = document.getElementById('vx-nav');
    if (nav) nav.innerHTML = montarNav();
  };

  // rótulo do grupo + da aba corrente, para o cabeçalho de página e o breadcrumb
  function contexto(tab) {
    for (const [grupo, itens] of GRUPOS) {
      const it = itens.find(([id]) => id === tab);
      if (it) return { grupo, ico: it[1], rot: it[2] };
    }
    const rot = (LG.abas().find(([id]) => id === tab) || [tab, tab])[1];
    return { grupo: 'Outros', ico: '•', rot: String(rot).replace(/^[^\wÀ-ÿ]+\s*/, '') };
  }

  // -------------------------------------------------------------- RENDER
  LG.render = function () {
    const ctx = contexto(LG.tab);
    conteudo().innerHTML = `<div class="vx" data-vertical="legal">
      <div class="vx-app" id="vx-app" data-nav="${LG.navColapsada ? 'colapsada' : 'aberta'}">
        <nav class="vx-nav" id="vx-nav" aria-label="Seções do Villela Legal">${montarNav()}</nav>
        <div class="vx-main">
          <div class="vx-page-head">
            <div>
              <div class="vx-crumb"><span>Villela Legal</span><span aria-hidden="true">›</span><span>${esc(ctx.grupo)}</span></div>
              <h1>${ctx.ico} ${esc(ctx.rot)}</h1>
              <p class="vx-muted vx-mb0">Perfil: <strong>${esc(LG.nomePerfil || '—')}</strong> · conteúdo gerado por IA é sempre <strong>minuta</strong>, com revisão de advogado obrigatória.</p>
            </div>
          </div>
          <div id="lg-body">${LGUI.skeleton('kpis', 4)}</div>
        </div>
      </div></div>`;
    LG.pintar();
  };

  // ------------------------------------------- PINTAR (esqueleto + erro)
  const pintarAtual = LG.pintar.bind(LG);
  LG.pintar = async function () {
    const alvo = LG.body();
    if (alvo && !alvo.dataset.pintando) {
      alvo.dataset.pintando = '1';
      alvo.innerHTML = LGUI.skeleton('linha', 4);
    }
    try {
      await pintarAtual();
    } catch (e) {
      if (LG.body()) {
        LG.body().innerHTML = LGUI.erro({
          titulo: 'Não foi possível carregar esta seção',
          texto: e && e.message ? e.message : 'Falha inesperada.',
          acao: `<p class="vx-mb0" style="margin-top:8px"><button type="button" class="vx-btn vx-btn--sec vx-btn--sm" onclick="LG.pintar()">Tentar novamente</button></p>`,
        });
      }
    } finally {
      if (LG.body()) delete LG.body().dataset.pintando;
    }
  };

  // ------------------------------------------------------------- PAINEL
  // Central de comando: o que exige ação primeiro, agrupado por urgência, com
  // cada indicador levando à tela que resolve o número. Nenhum dado inventado —
  // tudo vem de /dashboard (+ controladoria e contratos quando o perfil permite).
  LG.vPainel = async function () {
    const [dash, ctrl, contr] = await Promise.all([
      LG.api('GET', '/dashboard'),
      LG.perm.ver_controladoria ? LG.api('GET', '/controladoria').catch(() => null) : null,
      LG.perm.gerir_contratos ? LG.api('GET', '/contratos-ciclo?dias=60').catch(() => null) : null,
    ]);
    const r = dash.resumo || {};
    LG.resumo = r;
    const nav = document.getElementById('vx-nav');
    if (nav) nav.innerHTML = montarNav();          // pinos do menu já com os números do dia

    const kpi = (rot, val, ctx, tom, aba) => {
      const corpo = `<span class="vx-kpi-rot">${esc(rot)}</span>
        <span class="vx-kpi-val">${val}</span>
        ${ctx ? `<span class="vx-kpi-ctx">${esc(ctx)}</span>` : ''}`;
      return aba
        ? `<button type="button" class="vx-kpi" data-tom="${tom || ''}" onclick="LG.ir('${aba}')">${corpo}</button>`
        : `<div class="vx-kpi" data-tom="${tom || ''}">${corpo}</div>`;
    };
    const secao = (titulo, sub, conteudoHtml) => `<section class="vx-card">
      <div class="vx-card-head"><div><h2>${esc(titulo)}</h2>
      ${sub ? `<p class="vx-hint vx-mb0">${esc(sub)}</p>` : ''}</div></div>${conteudoHtml}</section>`;

    // ---- 1. exige ação hoje ----
    const criticos = [];
    if (r.prazos_hoje) criticos.push(kpi('Prazos até hoje', r.prazos_hoje, 'vencem hoje ou já passaram', 'critico', 'prazos'));
    if (r.prazos_sem_validacao) criticos.push(kpi('Prazos sem validação humana', r.prazos_sem_validacao, 'cálculo sugerido pela máquina', 'critico', 'prazos'));
    if (r.publicacoes_novas) criticos.push(kpi('Publicações novas', r.publicacoes_novas, 'sem triagem', 'atencao', 'publicacoes'));
    if (r.tarefas_atrasadas) criticos.push(kpi('Tarefas atrasadas', r.tarefas_atrasadas, 'passaram do prazo', 'atencao', 'tarefas'));
    const achados = ctrl && ctrl.achados ? ctrl.achados.length : 0;
    const achadosCriticos = ctrl && ctrl.achados ? ctrl.achados.filter(a => a.gravidade === 'critica').length : 0;
    if (achados) criticos.push(kpi('Achados da controladoria', achados, achadosCriticos ? `${achadosCriticos} crítico(s)` : 'conferência independente', achadosCriticos ? 'critico' : 'atencao', 'controladoria'));

    let html = '';
    if (criticos.length) {
      html += secao('Exige ação', 'Conferido agora, a partir dos dados — não de status preenchido à mão.',
        `<div class="vx-kpis">${criticos.join('')}</div>`);
    } else {
      html += secao('Exige ação', 'Conferido agora, a partir dos dados.', LGUI.vazio({
        ico: '✓', titulo: 'Nada pendente no momento',
        texto: 'Nenhum prazo vencendo hoje, publicação sem triagem, tarefa atrasada ou achado aberto de controladoria.',
      }));
    }

    // ---- 2. agenda dos próximos dias ----
    html += secao('Próximos dias', 'Janela de 7 dias.', `<div class="vx-kpis">
      ${kpi('Prazos em 7 dias', r.prazos_7dias || 0, 'com data fatal', r.prazos_7dias ? 'atencao' : 'ok', 'prazos')}
      ${kpi('Audiências em 7 dias', r.audiencias_7dias || 0, 'agendadas', '', 'audiencias')}
      ${kpi('Tarefas abertas', r.tarefas_abertas || 0, 'na fila da equipe', '', 'tarefas')}
    </div>`);

    // ---- 3. revisão humana pendente (as travas do sistema) ----
    html += secao('Aguardando revisão humana', 'O sistema não libera nada disso sozinho.', `<div class="vx-kpis">
      ${kpi('Peças em revisão', r.pecas_em_revisao || 0, 'minutas a revisar', r.pecas_em_revisao ? 'atencao' : 'ok', 'pecas')}
      ${kpi('Documentos em revisão', r.docs_em_revisao || 0, 'aguardando aprovação', '', 'documentos')}
      ${LG.perm.usar_ia ? kpi('Respostas de IA sem revisão', r.ia_sem_revisao || 0, 'em rascunho', r.ia_sem_revisao ? 'atencao' : 'ok', 'ia') : ''}
      ${LG.perm.usar_ia ? kpi('Consultas de IA na fila', r.ia_pendentes || 0, 'aguardando processamento', '', 'ia') : ''}
    </div>`);

    // ---- 4. carteira ----
    html += secao('Carteira', 'Situação geral do escritório.', `<div class="vx-kpis">
      ${kpi('Processos ativos', r.processos_ativos || 0, '', '', 'processos')}
      ${kpi('Clientes ativos', r.clientes_ativos || 0, '', '', LG.perm.gerir_clientes ? 'clientes' : '')}
    </div>`);

    // ---- 5. contratos com prazo (só quem gere contratos) ----
    if (contr && contr.alertas) {
      const ren = (contr.alertas.renovacoes || []).length;
      const atr = (contr.alertas.atrasadas || []).length;
      if (ren || atr) {
        html += secao('Contratos com data', 'Renovação automática e obrigações vencidas.', `<div class="vx-kpis">
          ${kpi('Vigências vencendo (60 dias)', ren, 'conferir janela de denúncia', ren ? 'atencao' : 'ok', 'ciclo')}
          ${kpi('Obrigações atrasadas', atr, 'passaram da data limite', atr ? 'critico' : 'ok', 'ciclo')}
        </div>`);
      }
    }

    LG.body().innerHTML = html;
  };

  // ------------------------------------ PORTAL DO CLIENTE (rotas já existiam)
  // As rotas de tradução de andamento, pendências e avaliação foram criadas na
  // onda do livro sem tela própria. Esta aba expõe o que já existe na API.
  const abasAtuais = LG.abas.bind(LG);
  LG.abas = function () {
    const t = abasAtuais();
    if (LG.perm.ver_processos && !t.some(([id]) => id === 'portalcliente')) t.push(['portalcliente', '🪟 Portal do cliente']);
    return t;
  };

  LG.vPortalCliente = async function () {
    const [trad, pend, sat] = await Promise.all([
      LG.api('GET', '/portal/traducoes?status=rascunho'),
      LG.perm.gerir_clientes ? LG.api('GET', '/portal/pendencias?status=pendente').catch(() => ({ pendencias: [] })) : { pendencias: [] },
      LG.api('GET', '/portal/satisfacao').catch(() => ({ resumo: null, respostas: [] })),
    ]);
    const podeAprovar = !!LG.perm.aprovar_documentos;
    let h = `<div class="vx-alerta vx-alerta--livro"><span class="vx-alerta-ico" aria-hidden="true">📘</span>
      <div><b>Protótipo 47.2 do livro.</b><p class="vx-mb0">A tradução do andamento em linguagem simples
      só fica visível ao cliente depois que uma pessoa aprova — e evento marcado como sensível espera a
      comunicação pessoal antes de publicar.</p></div></div>`;

    // traduções aguardando aprovação
    h += `<section class="vx-card"><div class="vx-card-head"><div>
      <h2>Traduções aguardando aprovação</h2>
      <p class="vx-hint vx-mb0">${trad.traducoes.length} em rascunho.</p></div></div>`;
    h += trad.traducoes.length ? `<div class="vx-tabela-wrap"><table class="vx-tabela--cards">
      <thead><tr><th>Andamento (texto do tribunal)</th><th>Tradução proposta</th><th>Origem</th><th>Sensível</th><th class="vx-acoes-col">Ações</th></tr></thead>
      <tbody>${trad.traducoes.map(t => `<tr>
        <td data-rot="Andamento"><span class="vx-td-trunc" title="${esc(t.movimento || '')}">${esc(t.movimento || '—')}</span></td>
        <td data-rot="Tradução">${esc(t.texto_simples)}</td>
        <td data-rot="Origem"><span class="vx-badge">${esc(t.origem)}</span></td>
        <td data-rot="Sensível">${t.sensivel ? '<span class="vx-badge vx-badge--warn">sensível</span>' : '<span class="vx-badge">não</span>'}</td>
        <td class="vx-acoes-col" data-rot="Ações">
          ${podeAprovar ? `<button type="button" class="vx-btn vx-btn--sm" onclick="LG.tradAprovar('${t.id}')">Aprovar</button>
          <button type="button" class="vx-btn vx-btn--sec vx-btn--sm" onclick="LG.tradReprovar('${t.id}')">Reprovar</button>`
        : '<span class="vx-hint">sem permissão</span>'}
        </td></tr>`).join('')}</tbody></table></div>`
      : LGUI.vazio({ ico: '🪟', titulo: 'Nenhuma tradução em rascunho', texto: 'Quando a IA (ou alguém da equipe) propuser uma tradução de andamento, ela aparece aqui para aprovação.' });
    h += `</section>`;

    // pendências do cliente
    if (LG.perm.gerir_clientes) {
      h += `<section class="vx-card"><div class="vx-card-head"><div>
        <h2>Pendências solicitadas ao cliente</h2>
        <p class="vx-hint vx-mb0">Documento, informação, assinatura ou pagamento em aberto.</p></div></div>`;
      h += pend.pendencias.length ? `<div class="vx-tabela-wrap"><table class="vx-tabela--cards">
        <thead><tr><th>Cliente</th><th>Pendência</th><th>Tipo</th><th>Prazo</th><th class="vx-acoes-col">Ações</th></tr></thead>
        <tbody>${pend.pendencias.map(p => `<tr>
          <td data-rot="Cliente">${esc(p.cliente || p.client_id)}</td>
          <td data-rot="Pendência">${esc(p.titulo)}</td>
          <td data-rot="Tipo"><span class="vx-badge">${esc(p.tipo)}</span></td>
          <td data-rot="Prazo">${LG.dt(p.prazo)}</td>
          <td class="vx-acoes-col" data-rot="Ações">
            <button type="button" class="vx-btn vx-btn--sec vx-btn--sm" onclick="LG.pendAtender('${p.id}')">Marcar atendida</button>
          </td></tr>`).join('')}</tbody></table></div>`
        : LGUI.vazio({ ico: '✓', titulo: 'Nenhuma pendência aberta', texto: 'Nada aguardando o cliente neste momento.' });
      h += `</section>`;
    }

    // satisfação
    const rs = sat.resumo;
    if (rs && rs.respostas) {
      h += `<section class="vx-card"><div class="vx-card-head"><div>
        <h2>Avaliação do atendimento</h2><p class="vx-hint vx-mb0">Últimos 180 dias.</p></div></div>
        <div class="vx-kpis">
          <div class="vx-kpi"><span class="vx-kpi-rot">Respostas</span><span class="vx-kpi-val">${rs.respostas}</span></div>
          <div class="vx-kpi"><span class="vx-kpi-rot">Nota média</span><span class="vx-kpi-val">${rs.media}</span><span class="vx-kpi-ctx">de 0 a 10</span></div>
          <div class="vx-kpi" data-tom="${rs.nps < 0 ? 'critico' : (rs.nps >= 50 ? 'ok' : '')}"><span class="vx-kpi-rot">NPS</span><span class="vx-kpi-val">${rs.nps}</span><span class="vx-kpi-ctx">promotores − detratores</span></div>
        </div></section>`;
    }
    LG.body().innerHTML = h;
  };

  LG.tradAprovar = async function (id) {
    try { await LG.api('POST', `/portal/traducoes/${id}/aprovar`, {}); LGUI.toast('Tradução aprovada.', 'ok'); LG.pintar(); }
    catch (e) { LGUI.toast('Não foi possível aprovar', 'erro', e.message); }
  };
  LG.tradReprovar = async function (id) {
    if (!await LGUI.confirmar({ titulo: 'Reprovar tradução', texto: 'A tradução volta para quem escreveu e não fica visível ao cliente.', rotuloOk: 'Reprovar' })) return;
    try { await LG.api('POST', `/portal/traducoes/${id}/reprovar`, {}); LGUI.toast('Tradução reprovada.', 'ok'); LG.pintar(); }
    catch (e) { LGUI.toast('Não foi possível reprovar', 'erro', e.message); }
  };
  LG.pendAtender = async function (id) {
    try { await LG.api('PATCH', `/portal/pendencias/${id}`, { status: 'atendida' }); LGUI.toast('Pendência marcada como atendida.', 'ok'); LG.pintar(); }
    catch (e) { LGUI.toast('Não foi possível atualizar', 'erro', e.message); }
  };

  // registra a view nova no dispatcher (envelopa o que já existia)
  const pintarBase2 = LG.pintar.bind(LG);
  LG.pintar = async function () {
    if (LG.tab === 'portalcliente') {
      const alvo = LG.body();
      if (alvo) alvo.innerHTML = LGUI.skeleton('linha', 4);
      try { await LG.vPortalCliente(); }
      catch (e) {
        if (LG.body()) LG.body().innerHTML = LGUI.erro({ titulo: 'Não foi possível carregar o portal do cliente', texto: e.message });
      }
      return;
    }
    return pintarBase2();
  };
})();
