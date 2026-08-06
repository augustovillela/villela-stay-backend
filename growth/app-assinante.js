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
      const semDestino = {};
      for (const c of d.catalogo || []) if (!c.executavel) semDestino[c.acao] = c.motivo;

      const historico = (d.historico || []).length ? `<h3 style="margin:22px 0 8px">Decididas recentemente</h3>
        <div class="card"><table><thead><tr><th>Ação</th><th>Decisão</th><th>Desfecho</th><th>Quando</th></tr></thead><tbody>
        ${d.historico.map((h) => `<tr><td>${esc(h.titulo || h.acao)}</td>
          <td><span class="chip ${h.status === 'rejeitada' ? 'frio' : ''}">${esc(h.status)}</span></td>
          <td>${esc(h.resultado || (h.status === 'aprovada' ? 'na fila' : '—'))}</td>
          <td>${esc(dataHora(h.decidido_em || h.criado_em))}</td></tr>`).join('')}
        </tbody></table></div>` : '';

      if (!d.pendentes.length) {
        tela('<h2 style="margin:.2rem 0">Aprovações</h2>' + vazio('Nada esperando por você',
          'Ações de risco propostas por agentes ou automações aparecem aqui antes de acontecer.') + historico);
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
          ${semDestino[p.acao] ? `<div class="vx-alerta vx-alerta--warn" style="margin:8px 0 0">
            <span class="vx-alerta-ico" aria-hidden="true">⚠️</span>
            <div><b>Aprovar aqui autoriza, mas não executa.</b>
            <p class="vx-mb0">Esta ação ainda não tem execução automática: ${esc(semDestino[p.acao])}.</p></div></div>` : ''}
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn peq" data-aprovar="${esc(p.id)}">Aprovar</button>
            <button class="btn peq secund" data-rejeitar="${esc(p.id)}">Rejeitar</button>
          </div></div>`).join('')}
        ${historico}`);

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

  // ----------------------------------------------------------- CONEXÕES
  async function vConexoes() {
    carregando();
    try {
      const r = await api('/conexoes');
      if (!r.atual()) return;
      const d = r.dados;

      const cartao = (c) => {
        const cred = (c.credenciais || [])[0];
        const alerta = cred && cred.vencido ? 'muito-quente' : (cred && cred.chave_antiga ? 'quente' : '');
        return `<div class="card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
            <div><b>${esc(c.nome || c.integracao)}</b>
              <div style="font-size:.85rem;color:#5b6b70">${esc(CANAL[c.canal] || c.canal)} ·
                <span class="chip ${c.status === 'ativa' ? '' : 'frio'}">${esc(c.status)}</span>
                ${c.verificado_em ? `· verificada em ${esc(dataHora(c.verificado_em))}`
                  : '· <b>nunca verificada</b>'}</div></div>
            <button class="btn peq secund" data-saude="${esc(c.id)}">Testar conexão</button>
          </div>
          ${cred ? `<p style="margin:8px 0 0;font-size:.9rem">Credencial <code>${esc(cred.chave)}</code>
            ${cred.rotacionado_em ? `· trocada em ${esc(dataHora(cred.rotacionado_em))}` : '· nunca trocada'}
            ${cred.expira_em ? `· expira em ${esc(cred.expira_em)}` : ''}
            ${alerta ? `<span class="chip ${alerta}">${cred.vencido ? 'vencida' : 'na chave antiga'}</span>` : ''}</p>`
            : '<p style="margin:8px 0 0;font-size:.9rem;color:#5b6b70">Sem credencial guardada.</p>'}
          <details style="margin-top:10px"><summary style="cursor:pointer">Trocar credencial</summary>
            <div style="margin-top:8px;display:grid;gap:8px;max-width:520px">
              <input data-campo="chave" data-conexao="${esc(c.id)}" placeholder="nome da chave (ex.: access_token)" value="${esc((cred && cred.chave) || 'access_token')}">
              <input data-campo="valor" data-conexao="${esc(c.id)}" type="password" autocomplete="off" placeholder="cole aqui a credencial nova">
              <input data-campo="expira" data-conexao="${esc(c.id)}" placeholder="expira em (AAAA-MM-DD, opcional)" value="${esc((cred && cred.expira_em) || '')}">
              <div><button class="btn peq" data-trocar="${esc(c.id)}">Guardar e testar</button></div>
              <p style="font-size:.85rem;color:#5b6b70;margin:0">A credencial vai cifrada para o cofre e não volta para esta tela nunca mais — nem para nós.</p>
            </div></details></div>`;
      };

      tela(`<h2 style="margin:.2rem 0">Conexões</h2>
        ${d.vencendo.length ? `<div class="aviso"><b>${d.vencendo.length}</b> credencial(is) vencendo nos próximos 15 dias.</div>` : ''}
        ${d.conexoes.length ? d.conexoes.map(cartao).join('')
          : vazio('Nenhum canal conectado', 'Conecte um canal para receber mensagens, publicar conteúdo ou importar métricas.')}
        <h3 style="margin:22px 0 8px">Integrações disponíveis</h3>
        <div class="card"><table><thead><tr><th>Integração</th><th>Situação</th><th>Verificada</th></tr></thead><tbody>
        ${(d.integracoes || []).map((i) => `<tr><td>${esc(i.nome || i.chave)}</td>
          <td><span class="chip ${i.status === 'ativa' ? '' : 'frio'}">${esc(i.status)}</span></td>
          <td>${esc(i.verificado_em || '—')}</td></tr>`).join('')}
        </tbody></table>
        <p style="font-size:.85rem;color:#5b6b70;margin:10px 0 0">Integração em <b>planejada</b> não tem endpoint implementado: o contrato está declarado, mas nada é enviado.</p></div>`);

      const valor = (id, campo) => {
        const el = document.querySelector(`#tela [data-campo="${campo}"][data-conexao="${id}"]`);
        return el ? el.value : '';
      };
      document.querySelectorAll('#tela [data-trocar]').forEach((b) => {
        b.onclick = async () => {
          const id = b.dataset.trocar;
          if (!valor(id, 'valor').trim()) { alert('Cole a credencial nova.'); return; }
          b.disabled = true;
          try {
            const r2 = await api('/conexoes/' + encodeURIComponent(id) + '/credencial', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ chave: valor(id, 'chave'), valor: valor(id, 'valor'), expiraEm: valor(id, 'expira') }),
            });
            const s = r2.dados.saude;
            alert(s && s.ok ? 'Credencial guardada e conexão respondeu.'
              : `Credencial guardada, mas a conexão não respondeu: ${(s && (s.motivo || s.erro)) || 'sem detalhe'}.`);
            vConexoes();
          } catch (e) { b.disabled = false; alert(e.message); }
        };
      });
      document.querySelectorAll('#tela [data-saude]').forEach((b) => {
        b.onclick = async () => {
          b.disabled = true;
          try {
            const r2 = await api('/conexoes/' + encodeURIComponent(b.dataset.saude) + '/saude', { method: 'POST' });
            alert(r2.dados.ok ? 'Conexão respondeu.' : `Não respondeu: ${r2.dados.motivo || 'sem detalhe'}.`);
          } catch (e) { alert(e.message); }
          b.disabled = false;
        };
      });
    } catch (e) { erro(e); }
  }

  // --------------------------------------------------------- SEGURANÇA
  const listaCodigos = (codigos) => `<div class="vx-alerta vx-alerta--warn" style="margin-top:12px">
    <span class="vx-alerta-ico" aria-hidden="true">🔑</span>
    <div><b>Guarde estes códigos agora.</b>
      <p>Cada um serve UMA vez, para entrar sem o celular. Eles não voltam a aparecer.</p>
      <p style="font-family:ui-monospace,monospace;line-height:1.9;margin:0">${codigos.map((c) => esc(c)).join('<br>')}</p>
    </div></div>`;

  async function vSeguranca() {
    carregando();
    try {
      const r = await api('/mfa');
      if (!r.atual()) return;
      const d = r.dados;

      if (!d.cofre_ok) {
        tela(`<h2 style="margin:.2rem 0">Segurança</h2>
          <div class="vx-alerta vx-alerta--danger"><span class="vx-alerta-ico" aria-hidden="true">⚠️</span>
          <div><b>Segundo fator indisponível</b><p class="vx-mb0">O cofre de credenciais não está configurado no servidor, e sem ele o segredo do seu autenticador não pode ser guardado com segurança.</p></div></div>`);
        return;
      }

      if (d.ativo) {
        tela(`<h2 style="margin:.2rem 0">Segurança</h2>
          <div class="card"><h3 style="margin:.2rem 0">Segundo fator <span class="chip">ativo</span></h3>
            <p>Ligado em ${esc(dataHora(d.ativado_em))} · <b>${d.recuperacao_restantes}</b> código(s) de recuperação sem uso.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
              <button class="btn peq secund" id="mfa-novos">Gerar novos códigos de recuperação</button>
            </div>
            <details style="margin-top:14px"><summary style="cursor:pointer">Desligar o segundo fator</summary>
              <div style="margin-top:8px;display:grid;gap:8px;max-width:420px">
                <input id="mfa-senha" type="password" autocomplete="current-password" placeholder="confirme sua senha">
                <div><button class="btn peq secund" id="mfa-off">Desligar</button></div>
              </div></details>
            <div id="mfa-saida"></div></div>`);

        $('#mfa-novos').onclick = async () => {
          try {
            const r2 = await api('/mfa/recuperacao', { method: 'POST' });
            $('#mfa-saida').innerHTML = listaCodigos(r2.dados.recuperacao);
          } catch (e) { alert(e.message); }
        };
        $('#mfa-off').onclick = async () => {
          try {
            await api('/mfa/desativar', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ senha: $('#mfa-senha').value }),
            });
            vSeguranca();
          } catch (e) { alert(e.message); }
        };
        return;
      }

      tela(`<h2 style="margin:.2rem 0">Segurança</h2>
        <div class="card"><h3 style="margin:.2rem 0">Segundo fator <span class="chip frio">desligado</span></h3>
          <p class="sub" style="text-align:left">Com ele, sua senha sozinha não abre a conta: falta um código que só existe no seu celular.</p>
          <button class="btn peq" id="mfa-on" style="margin-top:8px">Ativar</button>
          <div id="mfa-saida"></div></div>`);

      $('#mfa-on').onclick = async () => {
        try {
          const r2 = await api('/mfa/iniciar', { method: 'POST' });
          const s = r2.dados;
          $('#mfa-saida').innerHTML = `<div style="margin-top:14px;max-width:520px">
            <p><b>1.</b> No seu autenticador (Google Authenticator, Authy, 1Password…), escolha
              <i>inserir chave manualmente</i> e cole:</p>
            <p style="font-family:ui-monospace,monospace;font-size:1.1rem;word-break:break-all;background:#f3f5f8;padding:10px;border-radius:8px">${esc(s.segredo)}</p>
            <p style="font-size:.85rem;color:#5b6b70">Ou abra este link no celular: <a href="${esc(s.uri)}">${esc(s.uri.slice(0, 60))}…</a></p>
            <p><b>2.</b> Digite o código de 6 dígitos que aparecer:</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input id="mfa-cod" inputmode="numeric" maxlength="6" placeholder="000000" style="max-width:140px">
              <button class="btn peq" id="mfa-conf">Confirmar</button>
            </div><div id="mfa-fim"></div></div>`;
          $('#mfa-conf').onclick = async () => {
            try {
              const r3 = await api('/mfa/confirmar', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ codigo: $('#mfa-cod').value.trim() }),
              });
              $('#mfa-fim').innerHTML = listaCodigos(r3.dados.recuperacao) +
                '<p style="margin-top:10px">Pronto. Da próxima vez que entrar, o código será pedido.</p>';
            } catch (e) { alert(e.message); }
          };
        } catch (e) { alert(e.message); }
      };
    } catch (e) { erro(e); }
  }

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
      ['gx_conexoes', '', 'Governança', '🔌', 'Conexões', ''],
      ['gx_seguranca', '', 'Conta', '🔒', 'Segurança', ''],
      ['gx_assinatura', '', 'Conta', '💳', 'Plano e uso', ''],
    ],
    vistas: {
      gx_visao: vVisao, gx_inbox: vInbox, gx_reunioes: vReunioes,
      gx_automacoes: vAutomacoes, gx_conteudo: vConteudo, gx_anuncios: vAtribuicao,
      gx_reputacao: vReputacao, gx_agentes: vAgentes, gx_aprovacoes: vAprovacoes,
      gx_conexoes: vConexoes, gx_seguranca: vSeguranca, gx_assinatura: vAssinatura,
    },
  };
})();
