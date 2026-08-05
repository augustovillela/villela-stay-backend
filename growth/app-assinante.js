// =====================================================================
// Villela Growth OS — extensão do painel do assinante (/crm/app).
//
// Carregado DEPOIS de app-cliente.js e registra abas novas por
// `window.GX_EXT`. O núcleo do painel tem só três ganchos; toda a lógica
// das telas do Growth OS vive aqui.
//
// Regra que este arquivo obedece, e que vem do §13.2/§25 do prompt: a aba
// de um recurso que o plano NÃO inclui não aparece — nem desabilitada.
// O gating é pela flag do plano, avaliada pelo próprio núcleo.
// =====================================================================
/* global GX_EXT */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const dataHora = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso || ''; } };

  // Cada resposta atrasada carimba a tela de origem: resposta que chega
  // depois de o usuário mudar de aba não pinta a tela nova.
  let SEQ = 0;
  async function api(caminho, opts) {
    const meu = ++SEQ;
    const r = await fetch('/crm/api/growth' + caminho, Object.assign({ credentials: 'same-origin' }, opts));
    let d = null;
    try { d = await r.json(); } catch (_) { d = null; }
    if (!r.ok) { const e = new Error((d && d.erro) || 'Não consegui carregar.'); e.status = r.status; throw e; }
    return { dados: d, atual: () => meu === SEQ };
  }

  const tela = (html) => { const t = $('#tela'); if (t) t.innerHTML = html; };
  const carregando = () => tela('<div class="vx-skel vx-skel--linha"></div><div class="vx-skel vx-skel--linha"></div><div class="vx-skel vx-skel--bloco"></div>');
  const erro = (e) => tela(`<div class="vx-alerta vx-alerta--danger" role="alert"><span class="vx-alerta-ico" aria-hidden="true">⚠️</span>
    <div><b>Não foi possível carregar esta tela</b><p class="vx-mb0">${esc(e && e.message ? e.message : 'Erro inesperado.')}</p></div></div>`);

  const vazio = (titulo, texto, acao) => `<div class="card" style="text-align:center;padding:34px">
    <h3 style="margin:.2rem 0">${esc(titulo)}</h3><p class="sub" style="margin:6px auto 14px">${esc(texto)}</p>${acao || ''}</div>`;

  const kpi = (n, r) => `<div class="kpi"><div class="n">${esc(String(n))}</div><div class="r">${esc(r)}</div></div>`;

  /** Envolve a view: carrega, checa se ainda é a tela atual, pinta. */
  const view = (caminho, pintar) => async () => {
    carregando();
    try {
      const r = await api(caminho);
      if (!r.atual()) return;
      tela(pintar(r.dados));
    } catch (e) { erro(e); }
  };

  // ------------------------------------------------------- VISÃO GERAL
  function pintarVisao(d) {
    const ob = d.onboarding || { passos: [], concluido_pct: 0 };
    const acoes = Object.entries(d.exige_acao || {}).filter(([, v]) => v > 0);

    const listaPassos = ob.passos.map((p) => {
      const ico = p.status === 'feito' ? '✅' : (p.status === 'dispensado' ? '—' : '⬜');
      const risco = p.status === 'pendente' ? ' style="font-weight:600"' : ' style="color:#5b6b70"';
      return `<li${risco}>${ico} ${esc(p.titulo)}
        ${p.status === 'pendente' ? `<button class="btn peq secund" data-dispensar="${esc(p.chave)}" style="margin-left:8px">Não se aplica</button>` : ''}</li>`;
    }).join('');

    return `<h2 style="margin:.2rem 0">Visão geral</h2>
      <div class="hi-grid" style="margin:14px 0">
        ${kpi(d.numeros.contatos, 'contatos')}
        ${kpi(d.numeros.conversas_abertas, 'conversas abertas')}
        ${kpi(d.numeros.automacoes, 'automações no ar')}
        ${kpi(d.numeros.agendamentos, 'reuniões marcadas')}
      </div>

      ${acoes.length ? `<div class="card" style="margin-bottom:14px">
        <h3 style="margin:.2rem 0">Precisa de você hoje</h3>
        <ul style="margin:10px 0 0;padding-left:18px">
          ${acoes.map(([k, v]) => `<li><b>${v}</b> ${esc(RÓTULOS_ACAO[k] || k)}</li>`).join('')}
        </ul></div>` : `<div class="aviso">Nada exigindo ação agora.</div>`}

      <div class="card">
        <h3 style="margin:.2rem 0">Primeiros passos <span class="tag">${ob.concluido_pct}% concluído</span></h3>
        <ul style="list-style:none;padding:0;margin:12px 0 0;line-height:2">${listaPassos}</ul>
      </div>`;
  }

  const RÓTULOS_ACAO = {
    conversas_sem_resposta: 'conversa(s) sem primeira resposta',
    sla_em_risco: 'conversa(s) com SLA vencendo',
    aprovacoes_pendentes: 'ação(ões) aguardando sua aprovação',
    duplicatas: 'possível(is) contato(s) duplicado(s) para revisar',
    lgpd_vencidas: 'solicitação(ões) de titular fora do prazo',
    conteudo_aguardando: 'conteúdo(s) aguardando revisão',
    avaliacoes_sem_resposta: 'avaliação(ões) negativa(s) sem resposta',
  };

  async function vVisao() {
    carregando();
    try {
      const r = await api('/visao');
      if (!r.atual()) return;
      tela(pintarVisao(r.dados));
      document.querySelectorAll('#tela [data-dispensar]').forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          try { await api('/onboarding/' + encodeURIComponent(b.dataset.dispensar) + '/dispensar', { method: 'POST' }); vVisao(); }
          catch (e) { b.disabled = false; alert(e.message); }
        };
      });
    } catch (e) { erro(e); }
  }

  // ------------------------------------------------------------- INBOX
  const vInbox = view('/inbox', (d) => {
    if (!d.conversas.length) {
      return `<h2 style="margin:.2rem 0">Inbox</h2>` + vazio('Nenhuma conversa aberta',
        d.canais.length ? 'Quando alguém escrever por um canal conectado, a conversa aparece aqui.'
          : 'Conecte um canal em Integrações para começar a receber mensagens.');
    }
    const linhas = d.conversas.map((c) => `<tr>
      <td>${esc(CANAL[c.canal] || c.canal)}</td>
      <td>${esc(c.assunto || c.chave_externa)}</td>
      <td>${esc(c.responsavel || '—')}</td>
      <td>${c.nao_lidas ? `<span class="chip quente">${c.nao_lidas}</span>` : ''}</td>
      <td>${esc(dataHora(c.ultima_em))}</td>
      <td>${c.sla_estourado ? '<span class="chip muito-quente">SLA estourado</span>' : ''}</td></tr>`).join('');
    return `<h2 style="margin:.2rem 0">Inbox</h2>
      ${d.sla_em_risco.length ? `<div class="aviso"><b>${d.sla_em_risco.length}</b> conversa(s) com SLA de primeira resposta vencendo.</div>` : ''}
      <div class="card"><table><thead><tr><th>Canal</th><th>Conversa</th><th>Responsável</th><th>Novas</th><th>Última</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
  });

  const CANAL = { chat_site: 'Chat do site', whatsapp: 'WhatsApp', email: 'E-mail', instagram: 'Instagram', facebook: 'Facebook', sms: 'SMS' };

  // -------------------------------------------------------- APROVAÇÕES
  async function vAprovacoes() {
    carregando();
    try {
      const r = await api('/aprovacoes');
      if (!r.atual()) return;
      const d = r.dados;
      if (!d.pendentes.length) {
        tela('<h2 style="margin:.2rem 0">Aprovações</h2>' + vazio('Nada esperando por você',
          'Ações de risco propostas por agentes ou automações aparecem aqui antes de acontecer.'));
        return;
      }
      tela(`<h2 style="margin:.2rem 0">Aprovações</h2>
        <p class="sub" style="text-align:left;margin:0 0 12px">Nada nesta lista aconteceu ainda. Só acontece se você aprovar.</p>
        ${d.pendentes.map((p) => `<div class="card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div><b>${esc(p.titulo || p.acao)}</b>
              <div class="r" style="font-size:.85rem;color:#5b6b70">${esc(p.origem_tipo)} · nível ${p.nivel} · ${esc(dataHora(p.criado_em))}</div></div>
            ${p.custo_centavos ? `<div class="kpi"><div class="n">${brl(p.custo_centavos)}</div><div class="r">impacto</div></div>` : ''}
          </div>
          ${p.justificativa ? `<p style="margin:8px 0 0">${esc(p.justificativa)}</p>` : ''}
          ${p.impacto ? `<p class="aviso" style="margin:8px 0 0">${esc(p.impacto)}</p>` : ''}
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn peq" data-aprovar="${esc(p.id)}">Aprovar</button>
            <button class="btn peq secund" data-rejeitar="${esc(p.id)}">Rejeitar</button>
          </div></div>`).join('')}`);

      const decidir = async (id, decisao) => {
        try { await api('/aprovacoes/' + encodeURIComponent(id) + '/decidir', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decisao }),
        }); vAprovacoes(); } catch (e) { alert(e.message); }
      };
      document.querySelectorAll('#tela [data-aprovar]').forEach((b) => { b.onclick = () => decidir(b.dataset.aprovar, 'aprovar'); });
      document.querySelectorAll('#tela [data-rejeitar]').forEach((b) => { b.onclick = () => decidir(b.dataset.rejeitar, 'rejeitar'); });
    } catch (e) { erro(e); }
  }

  // -------------------------------------------------------- AUTOMAÇÕES
  const vAutomacoes = view('/automacoes', (d) => {
    if (!d.automacoes.length) {
      return '<h2 style="margin:.2rem 0">Automações</h2>' + vazio('Nenhuma automação ainda',
        'Automação aqui é um fluxo versionado: você publica uma versão e pode voltar atrás quando quiser.');
    }
    return `<h2 style="margin:.2rem 0">Automações</h2>
      <div class="card"><table><thead><tr><th>Nome</th><th>Gatilho</th><th>Situação</th><th>Execuções</th><th>Falhas</th></tr></thead><tbody>
      ${d.automacoes.map((a) => `<tr><td><b>${esc(a.nome)}</b></td>
        <td>${esc(d.gatilhos[a.gatilho_tipo] || a.gatilho_tipo)}</td>
        <td>${a.status === 'publicado' ? `<span class="chip">no ar · v${a.versao_publicada}</span>` : `<span class="chip frio">${esc(a.status)}</span>`}</td>
        <td>${a.execucoes}</td><td>${a.falhas ? `<span class="chip quente">${a.falhas}</span>` : '0'}</td></tr>`).join('')}
      </tbody></table></div>`;
  });

  // ------------------------------------------------------------ AGENTES
  const vAgentes = view('/agentes', (d) => `<h2 style="margin:.2rem 0">Agentes de IA</h2>
    <div class="aviso">${d.llm_disponivel
      ? 'Modelo de linguagem disponível. Agentes em modo <b>llm</b> usam o modelo; em modo <b>regras</b>, o motor determinístico.'
      : 'Sem chave de modelo configurada: os agentes rodam no <b>motor de regras</b>, e cada execução registra isso.'}</div>
    <div class="card"><table><thead><tr><th>Agente</th><th>Situação</th><th>Motor</th><th>Autonomia</th><th>Execuções (mês)</th><th>Com fonte</th><th>Bloqueadas</th></tr></thead><tbody>
    ${d.agentes.map((a) => `<tr><td><b>${esc(a.nome)}</b></td>
      <td>${a.ativo ? '<span class="chip">ligado</span>' : '<span class="chip frio">desligado</span>'}</td>
      <td>${esc(a.motor)}</td><td>nível ${a.nivel}</td><td>${a.mes.execucoes || 0}</td>
      <td>${a.mes.pct_fundamentadas == null ? '—' : a.mes.pct_fundamentadas + '%'}</td>
      <td>${a.acoes.bloqueadas ? `<span class="chip quente">${a.acoes.bloqueadas}</span>` : '0'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="sub" style="text-align:left;margin-top:10px">“Com fonte” é a fatia de respostas fundamentadas em documento aprovado da base. O resto o agente disse sem citar origem.</p>`);

  // ----------------------------------------------------------- CONTEÚDO
  const vConteudo = view('/conteudo', (d) => {
    const disp = d.disponibilidade || {};
    const redesLigadas = Object.entries(disp).filter(([, v]) => v.conectado).map(([r]) => r);
    return `<h2 style="margin:.2rem 0">Conteúdo</h2>
      ${redesLigadas.length ? '' : `<div class="aviso">Nenhuma rede social conectada ainda. Você pode planejar, escrever e aprovar normalmente — a publicação fica disponível quando conectar uma conta.</div>`}
      <div class="hi-grid" style="margin:12px 0">
        ${Object.entries(d.resumo || {}).filter(([, n]) => n > 0).map(([s, n]) => kpi(n, s)).join('') || kpi(0, 'itens')}
      </div>
      ${d.itens.length ? `<div class="card"><table><thead><tr><th>Título</th><th>Formato</th><th>Situação</th><th>Agendado</th><th>Publicações</th></tr></thead><tbody>
        ${d.itens.map((c) => `<tr><td><b>${esc(c.titulo)}</b></td><td>${esc(c.formato)}</td>
          <td><span class="chip ${c.status === 'erro' ? 'muito-quente' : 'frio'}">${esc(c.status)}</span></td>
          <td>${esc(c.agendado_para ? dataHora(c.agendado_para) : '—')}</td>
          <td>${(c.publicacoes || []).map((p) => `<span class="chip ${p.status === 'bloqueada' ? 'quente' : 'frio'}" title="${esc(p.motivo || '')}">${esc(p.rede)}: ${esc(p.status)}</span>`).join(' ') || '—'}</td></tr>`).join('')}
      </tbody></table></div>` : vazio('Nada no calendário ainda', 'Crie uma ideia e ela caminha até virar publicação.')}`;
  });

  // ---------------------------------------------------------- REPUTAÇÃO
  const vReputacao = view('/reputacao', (d) => {
    const i = d.indicadores || {};
    return `<h2 style="margin:.2rem 0">Reputação</h2>
      <div class="hi-grid" style="margin:12px 0">
        ${kpi(i.nps == null ? '—' : i.nps, 'NPS')}
        ${kpi(i.csat == null ? '—' : i.csat + '%', 'CSAT')}
        ${kpi(i.total || 0, 'respostas')}
        ${kpi(d.sem_resposta || 0, 'avaliações sem resposta')}
      </div>
      ${(d.problemas_recorrentes || []).length ? `<div class="card" style="margin-bottom:12px">
        <h3 style="margin:.2rem 0">O que mais aparece nas críticas</h3>
        <ul style="margin:8px 0 0;padding-left:18px">${d.problemas_recorrentes.map((p) => `<li><b>${esc(p.tema)}</b> — ${p.ocorrencias} menção(ões)</li>`).join('')}</ul>
      </div>` : ''}
      ${(d.por_unidade || []).length ? `<div class="card"><h3 style="margin:.2rem 0">Por unidade</h3>
        <table><thead><tr><th>Unidade</th><th>NPS</th><th>Respostas</th></tr></thead><tbody>
        ${d.por_unidade.map((u) => `<tr><td>${esc(u.unidade)}</td><td>${u.nps == null ? '—' : u.nps}</td><td>${u.total}</td></tr>`).join('')}
        </tbody></table></div>` : vazio('Sem respostas ainda', 'Publique uma pesquisa e os indicadores aparecem aqui.')}`;
  });

  // ----------------------------------------------------------- REUNIÕES
  const vReunioes = view('/reunioes', (d) => {
    const i = d.indicadores || {};
    return `<h2 style="margin:.2rem 0">Reuniões</h2>
      <div class="hi-grid" style="margin:12px 0">
        ${kpi(i.confirmados || 0, 'confirmadas')}${kpi(i.realizados || 0, 'realizadas')}
        ${kpi(i.no_show || 0, 'no-show')}${kpi(i.taxa_no_show_pct == null ? '—' : i.taxa_no_show_pct + '%', 'taxa de no-show')}
      </div>
      ${d.agenda.length ? `<div class="card"><table><thead><tr><th>Quando</th><th>Tipo</th><th>Convidado</th><th>Responsável</th><th>Situação</th></tr></thead><tbody>
        ${d.agenda.map((a) => `<tr><td>${esc(dataHora(a.inicio))}</td>
          <td>${esc((d.tipos.find((t) => t.id === a.tipo_id) || {}).nome || '—')}</td>
          <td>${esc(a.nome_convidado || a.email_convidado || '—')}</td><td>${esc(a.responsavel || '—')}</td>
          <td><span class="chip ${a.status === 'no_show' ? 'quente' : 'frio'}">${esc(a.status)}</span></td></tr>`).join('')}
      </tbody></table></div>` : vazio('Nenhuma reunião marcada', 'Crie um tipo de reunião e compartilhe o link público de marcação.')}`;
  });

  // ---------------------------------------------------------- ATRIBUIÇÃO
  const vAtribuicao = view('/atribuicao', (d) => `<h2 style="margin:.2rem 0">Atribuição</h2>
    ${d.funil.length ? `<div class="card"><table><thead><tr><th>Origem</th><th>Leads</th><th>Oportunidades</th><th>Ganhas</th><th>Receita</th><th>Conversão</th></tr></thead><tbody>
      ${d.funil.map((l) => `<tr><td><b>${esc(l.origem)}</b></td><td>${l.leads}</td><td>${l.oportunidades}</td>
        <td>${l.ganhas}</td><td>${brl(l.receita)}</td><td>${l.conversao_pct}%</td></tr>`).join('')}
    </tbody></table></div>` : vazio('Ainda sem conversão atribuída', 'Quando uma oportunidade for ganha, a origem dela aparece aqui.')}
    <div class="aviso" style="margin-top:12px"><b>O que este cálculo não enxerga:</b>
      <ul style="margin:6px 0 0;padding-left:18px">${(d.limitacoes || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`);

  // --------------------------------------------------------- ASSINATURA
  const vAssinatura = view('/assinatura', (d) => `<h2 style="margin:.2rem 0">Seu plano</h2>
    <div class="card" style="margin-bottom:12px">
      <h3 style="margin:.2rem 0">${esc((d.plano && d.plano.nome) || 'Sem plano')}</h3>
      ${d.plano && d.plano.preco_centavos ? `<div class="preco" style="font-size:1.4rem">${brl(d.plano.preco_centavos)}<small>/mês</small></div>` : ''}
    </div>
    <div class="card" style="margin-bottom:12px"><h3 style="margin:.2rem 0">Uso</h3>
      <table><thead><tr><th>Recurso</th><th>Usado</th><th>Limite</th></tr></thead><tbody>
      ${d.uso.map((u) => `<tr><td>${esc(u.recurso)}</td><td>${u.incluido === false ? '—' : u.usado}</td>
        <td>${u.incluido === false ? '<span class="chip frio">não incluído</span>' : (u.ilimitado ? 'ilimitado' : u.limite)}${u.estourado ? ' <span class="chip muito-quente">no limite</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div>
    ${d.recursos_bloqueados.length ? `<div class="card"><h3 style="margin:.2rem 0">Não incluído no seu plano</h3>
      <p>${d.recursos_bloqueados.map((r) => `<span class="chip frio">${esc(r)}</span>`).join(' ')}</p></div>` : ''}`);

  // ------------------------------------------------------------ registro
  window.GX_EXT = {
    grupos: ['Atendimento', 'Crescimento', 'Governança'],
    // [id, módulo(legado), grupo, ícone, rótulo, flag do plano]
    menu: [
      ['gx_visao', '', 'Visão geral', '🧭', 'Visão geral', ''],
      ['gx_inbox', '', 'Atendimento', '💬', 'Inbox', 'inbox'],
      ['gx_reunioes', '', 'Atendimento', '📅', 'Reuniões', 'reunioes'],
      ['gx_automacoes', '', 'Crescimento', '⚙️', 'Automações', 'automacoes'],
      ['gx_conteudo', '', 'Crescimento', '📣', 'Conteúdo', 'redes_sociais'],
      ['gx_anuncios', '', 'Crescimento', '📈', 'Atribuição', ''],
      ['gx_reputacao', '', 'Crescimento', '⭐', 'Reputação', 'reputacao'],
      ['gx_agentes', '', 'Inteligência', '🧠', 'Agentes', 'ia'],
      ['gx_aprovacoes', '', 'Governança', '✋', 'Aprovações', ''],
      ['gx_assinatura', '', 'Conta', '💳', 'Plano e uso', ''],
    ],
    vistas: {
      gx_visao: vVisao, gx_inbox: vInbox, gx_reunioes: vReunioes,
      gx_automacoes: vAutomacoes, gx_conteudo: vConteudo, gx_anuncios: vAtribuicao,
      gx_reputacao: vReputacao, gx_agentes: vAgentes, gx_aprovacoes: vAprovacoes,
      gx_assinatura: vAssinatura,
    },
  };
})();
