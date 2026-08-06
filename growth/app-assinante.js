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

  // ------------------------------------------------ helpers de edição
  const POST = (caminho, corpo) => api(caminho, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo || {}),
  });
  const PUT = (caminho, corpo) => api(caminho, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo || {}),
  });

  /** Erro de escrita não pode virar tela em branco: avisa e mantém o que estava. */
  const tentar = async (fn, aoDarCerto) => {
    try { const r = await fn(); if (aoDarCerto) aoDarCerto(r); return r; }
    catch (e) { alert(e.status === 402 ? `${e.message}` : e.message); return null; }
  };

  const val = (sel) => { const el = $(sel); return el ? el.value.trim() : ''; };
  const num = (sel) => Number(String(val(sel)).replace(',', '.')) || 0;

  const campo = (id, rotulo, extra = '') =>
    `<div class="vx-campo"><label for="${id}">${esc(rotulo)}</label><input id="${id}" ${extra}></div>`;
  const area = (id, rotulo, valor = '', linhas = 5) =>
    `<div class="vx-campo"><label for="${id}">${esc(rotulo)}</label><textarea id="${id}" rows="${linhas}">${esc(valor)}</textarea></div>`;
  const select = (id, rotulo, opcoes, atual = '') =>
    `<div class="vx-campo"><label for="${id}">${esc(rotulo)}</label><select id="${id}">${
      opcoes.map(([v, t]) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(t)}</option>`).join('')
    }</select></div>`;
  // Voltar: o HTML é gerado por `linkVoltar` e ligado por `ligarVoltar`
  // DEPOIS de pintar — o elemento ainda não existe na hora de montar a string.
  const linkVoltar = (texto = '← voltar') => `<p style="margin:0 0 10px"><a href="#" id="gx-voltar">${esc(texto)}</a></p>`;
  const ligarVoltar = (fn) => { const a = $('#gx-voltar'); if (a) a.onclick = (ev) => { ev.preventDefault(); fn(); }; };
  const aoClicar = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };

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
  async function vAutomacoes() {
    carregando();
    try {
      const r = await api('/automacoes');
      if (!r.atual()) return;
      const d = r.dados;

      const linhas = d.automacoes.map((a) => `<tr>
        <td><a href="#" data-abrir="${esc(a.id)}"><b>${esc(a.nome)}</b></a></td>
        <td>${esc(d.gatilhos[a.gatilho_tipo] || a.gatilho_tipo)}</td>
        <td>${a.status === 'publicado' ? `<span class="chip">no ar · v${a.versao_publicada}</span>` : `<span class="chip frio">${esc(a.status)}</span>`}</td>
        <td>${a.execucoes}</td><td>${a.falhas ? `<span class="chip quente">${a.falhas}</span>` : '0'}</td></tr>`).join('');

      tela(`<h2 style="margin:.2rem 0">Automações</h2>
        <div class="card" style="margin-bottom:14px"><h3 style="margin:.2rem 0">Nova automação</h3>
          <div style="display:grid;gap:8px;max-width:520px;margin-top:8px">
            ${campo('au-nome', 'Nome', 'placeholder="Ex.: Boas-vindas ao lead novo"')}
            ${select('au-gatilho', 'Quando isto acontecer', Object.entries(d.gatilhos))}
            <div><button class="btn peq" id="au-criar">Criar rascunho</button></div>
          </div></div>
        ${d.automacoes.length ? `<div class="card"><table><thead><tr><th>Nome</th><th>Gatilho</th><th>Situação</th><th>Execuções</th><th>Falhas</th></tr></thead>
          <tbody>${linhas}</tbody></table></div>`
          : vazio('Nenhuma automação ainda', 'Automação aqui é um fluxo versionado: você publica uma versão e pode voltar atrás quando quiser.')}`);

      aoClicar('#au-criar', async () => {
        if (!val('#au-nome')) { alert('Dê um nome à automação.'); return; }
        await tentar(() => POST('/automacoes', { nome: val('#au-nome'), gatilhoTipo: val('#au-gatilho') }),
          (res) => editarAutomacao(res.dados.id));
      });
      document.querySelectorAll('#tela [data-abrir]').forEach((a) => {
        a.onclick = (ev) => { ev.preventDefault(); editarAutomacao(a.dataset.abrir); };
      });
    } catch (e) { erro(e); }
  }

  /**
   * Editor de fluxo. É LINEAR de propósito: a esmagadora maioria das
   * automações reais é uma sequência. Ramificação e retorno existem no
   * motor e continuam editáveis pelo JSON abaixo — nada foi tirado, só
   * não se tentou desenhar um editor de grafo numa tela de painel.
   */
  async function editarAutomacao(id) {
    carregando();
    try {
      const [r, meta] = [await api('/automacoes/' + encodeURIComponent(id)), await api('/automacoes')];
      if (!r.atual() && !meta.atual()) { /* segue: a última leitura manda */ }
      const wf = r.dados.workflow;
      const acoes = meta.dados.acoes || {};
      let nos = (r.dados.rascunho.nos || []).slice();

      const desenhar = () => {
        const passos = nos.map((n, i) => `<div class="card" style="margin-bottom:8px;padding:12px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div><b>${i + 1}. ${esc(rotuloNo(n, acoes))}</b>
              <div style="font-size:.85rem;color:#5b6b70">${esc(n.id)}${n.proximo ? ` → ${esc(n.proximo)}` : ' → fim'}</div></div>
            <div style="display:flex;gap:6px">
              ${i > 0 ? `<button class="btn peq secund" data-sobe="${i}">↑</button>` : ''}
              <button class="btn peq secund" data-remove="${i}">remover</button>
            </div></div>
          ${n.tipo === 'espera' ? `<p style="margin:8px 0 0;font-size:.9rem">Espera ${esc(String(n.minutos || n.horas || '?'))} ${n.horas ? 'hora(s)' : 'minuto(s)'}.</p>` : ''}
          ${n.tipo === 'condicao' ? `<p style="margin:8px 0 0;font-size:.9rem">Se <code>${esc(JSON.stringify(n.condicoes || n.condicao || {}))}</code> — senão o fluxo para.</p>` : ''}
          ${n.tipo === 'acao' ? `<p style="margin:8px 0 0;font-size:.9rem"><code>${esc(JSON.stringify(n.config || {}))}</code></p>` : ''}
        </div>`).join('');

        tela(`${linkVoltar('← todas as automações')}
          <h2 style="margin:.2rem 0">${esc(wf.nome)}
            ${wf.status === 'publicado' ? `<span class="chip">no ar · v${wf.versao_publicada}</span>` : `<span class="chip frio">${esc(wf.status)}</span>`}</h2>
          <p class="sub" style="text-align:left;margin:0 0 14px">Dispara em: <b>${esc(meta.dados.gatilhos[wf.gatilho_tipo] || wf.gatilho_tipo)}</b> ·
            rascunho v${wf.versao_rascunho}</p>

          <h3 style="margin:16px 0 8px">Passos</h3>
          ${passos || '<div class="aviso">Sem passos ainda. Acrescente o primeiro abaixo.</div>'}

          <div class="card" style="margin-top:12px"><h3 style="margin:.2rem 0">Acrescentar passo</h3>
            <div style="display:grid;gap:8px;max-width:560px;margin-top:8px">
              ${select('no-tipo', 'Tipo', [['acao', 'Fazer alguma coisa'], ['espera', 'Esperar'], ['condicao', 'Só continuar se…']])}
              <div id="no-detalhe"></div>
              <div><button class="btn peq" id="no-add">Acrescentar</button></div>
            </div></div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
            <button class="btn peq" id="au-salvar">Salvar rascunho</button>
            <button class="btn peq secund" id="au-simular">Simular (não executa)</button>
            <button class="btn peq" id="au-publicar">Publicar v${wf.versao_rascunho}</button>
            ${wf.status === 'publicado' ? '<button class="btn peq secund" id="au-pausar">Pausar</button>' : ''}
          </div>
          <div id="au-saida" style="margin-top:12px"></div>

          <details style="margin-top:18px"><summary style="cursor:pointer">Editar o fluxo como JSON (ramificações, retornos)</summary>
            <p class="sub" style="text-align:left;margin:8px 0">O editor acima monta sequências. Fluxos com ramificação
              (<code>seVerdadeiro</code>/<code>seFalso</code>) e retorno com espera se escrevem aqui — a validação é a mesma.</p>
            ${area('au-json', 'Definição', JSON.stringify({ nos }, null, 2), 14)}
            <button class="btn peq secund" id="au-json-usar">Usar este JSON</button>
          </details>

          ${(r.dados.versoes || []).filter((v) => v.publicada_em).length ? `<h3 style="margin:22px 0 8px">Versões publicadas</h3>
            <div class="card"><table><thead><tr><th>Versão</th><th>Publicada</th><th></th></tr></thead><tbody>
            ${r.dados.versoes.filter((v) => v.publicada_em).map((v) => `<tr><td>v${v.versao}</td>
              <td>${esc(dataHora(v.publicada_em))}</td>
              <td>${Number(v.versao) === Number(wf.versao_publicada) ? '<span class="chip">em uso</span>'
                : `<button class="btn peq secund" data-reverter="${v.versao}">voltar para esta</button>`}</td></tr>`).join('')}
            </tbody></table></div>` : ''}

          ${(r.dados.execucoes || []).length ? `<h3 style="margin:22px 0 8px">Últimas execuções</h3>
            <div class="card"><table><thead><tr><th>Início</th><th>Situação</th><th>Motivo</th></tr></thead><tbody>
            ${r.dados.execucoes.slice(0, 15).map((x) => `<tr><td>${esc(dataHora(x.iniciada_em))}</td>
              <td><span class="chip ${x.status === 'falhou' ? 'muito-quente' : 'frio'}">${esc(x.status)}</span></td>
              <td>${esc(x.erro || x.motivo || '')}</td></tr>`).join('')}
            </tbody></table></div>` : ''}`);

        ligarVoltar(vAutomacoes);
        detalheDoTipo();
        $('#no-tipo').onchange = detalheDoTipo;

        aoClicar('#no-add', () => { nos = nos.concat(montarNo()); religar(); });
        document.querySelectorAll('#tela [data-remove]').forEach((b) => {
          b.onclick = () => { nos.splice(Number(b.dataset.remove), 1); religar(); };
        });
        document.querySelectorAll('#tela [data-sobe]').forEach((b) => {
          b.onclick = () => { const i = Number(b.dataset.sobe); const t = nos[i - 1]; nos[i - 1] = nos[i]; nos[i] = t; religar(); };
        });
        aoClicar('#au-json-usar', () => {
          try {
            const def = JSON.parse(val('#au-json'));
            nos = Array.isArray(def.nos) ? def.nos : [];
            religar();
          } catch (e) { alert('JSON inválido: ' + e.message); }
        });

        aoClicar('#au-salvar', () => salvar());
        aoClicar('#au-simular', async () => {
          await salvar(true);
          const s = await tentar(() => POST(`/automacoes/${encodeURIComponent(id)}/simular`, { contexto: {} }));
          if (!s) return;
          const cam = (s.dados.caminho || s.dados.passos || []);
          $('#au-saida').innerHTML = `<div class="card"><b>Caminho simulado</b>
            <p style="margin:8px 0 0">${cam.length ? cam.map((p) => esc(typeof p === 'string' ? p : (p.no || p.id || JSON.stringify(p)))).join(' → ')
              : 'Nada percorrido — confira o gatilho e as condições.'}</p>
            <p style="font-size:.85rem;color:#5b6b70;margin:8px 0 0">Simulação não envia mensagem, não cria tarefa e não gasta orçamento.</p></div>`;
        });
        aoClicar('#au-publicar', async () => {
          await salvar(true);
          await tentar(() => POST(`/automacoes/${encodeURIComponent(id)}/publicar`, { notas: '' }),
            () => editarAutomacao(id));
        });
        aoClicar('#au-pausar', () => tentar(() => POST(`/automacoes/${encodeURIComponent(id)}/pausar`), () => editarAutomacao(id)));
        document.querySelectorAll('#tela [data-reverter]').forEach((b) => {
          b.onclick = () => tentar(() => POST(`/automacoes/${encodeURIComponent(id)}/reverter`, { versao: Number(b.dataset.reverter) }),
            () => editarAutomacao(id));
        });
      };

      // encadeia cada passo no seguinte: é o que faz a sequência ser sequência
      const religar = () => {
        nos.forEach((n, i) => { n.proximo = nos[i + 1] ? nos[i + 1].id : ''; });
        desenhar();
      };

      const detalheDoTipo = () => {
        const t = val('#no-tipo');
        const alvo = $('#no-detalhe');
        if (!alvo) return;
        if (t === 'acao') {
          alvo.innerHTML = select('no-acao', 'O que fazer', Object.entries(acoes)) +
            area('no-config', 'Configuração (JSON)', '{}', 3);
        } else if (t === 'espera') {
          alvo.innerHTML = campo('no-min', 'Esperar quantos minutos', 'type="number" min="1" value="60"');
        } else {
          alvo.innerHTML = area('no-cond', 'Condições (JSON)', '{"campo":"","igual":""}', 3) +
            '<p class="sub" style="text-align:left;margin:0">Se não bater, o fluxo para aqui.</p>';
        }
      };

      const montarNo = () => {
        const t = val('#no-tipo');
        const base = { id: `n${Date.now().toString(36)}${nos.length}`, tipo: t };
        if (t === 'acao') {
          let config = {};
          try { config = JSON.parse(val('#no-config') || '{}'); } catch (_) { alert('Configuração não é um JSON válido — vai vazia.'); }
          return Object.assign(base, { acao: val('#no-acao'), config });
        }
        if (t === 'espera') return Object.assign(base, { minutos: num('#no-min') || 60 });
        let cond = {};
        try { cond = JSON.parse(val('#no-cond') || '{}'); } catch (_) { alert('Condição não é um JSON válido — vai vazia.'); }
        return Object.assign(base, { condicoes: cond });
      };

      const salvar = (silencioso) => tentar(
        () => PUT(`/automacoes/${encodeURIComponent(id)}/rascunho`, { definicao: { nos } }),
        () => { if (!silencioso) $('#au-saida').innerHTML = '<div class="aviso">Rascunho salvo.</div>'; }
      );

      religar();
    } catch (e) { erro(e); }
  }

  const rotuloNo = (n, acoes) => {
    if (n.tipo === 'acao') return acoes[n.acao] || n.acao || 'Ação';
    if (n.tipo === 'espera') return 'Esperar';
    if (n.tipo === 'condicao') return 'Só continuar se…';
    return n.tipo;
  };

  // ------------------------------------------------------------ AGENTES
  async function vAgentes() {
    carregando();
    try {
      const r = await api('/agentes');
      if (!r.atual()) return;
      const d = r.dados;

      tela(`<h2 style="margin:.2rem 0">Agentes de IA</h2>
        <div class="aviso">${d.llm_disponivel
          ? 'Modelo de linguagem disponível. Agentes em modo <b>llm</b> usam o modelo; em modo <b>regras</b>, o motor determinístico.'
          : 'Sem chave de modelo configurada: os agentes rodam no <b>motor de regras</b>, e cada execução registra isso.'}</div>

        ${d.agentes.length ? `<div class="card"><table><thead><tr><th>Agente</th><th>Situação</th><th>Motor</th><th>Autonomia</th><th>Execuções (mês)</th><th>Com fonte</th><th>Bloqueadas</th></tr></thead><tbody>
          ${d.agentes.map((a) => `<tr><td><a href="#" data-agente="${esc(a.agente)}"><b>${esc(a.nome)}</b></a></td>
            <td>${a.ativo ? '<span class="chip">ligado</span>' : '<span class="chip frio">desligado</span>'}</td>
            <td>${esc(a.motor)}</td><td>nível ${a.nivel}</td><td>${a.mes.execucoes || 0}</td>
            <td>${a.mes.pct_fundamentadas == null ? '—' : a.mes.pct_fundamentadas + '%'}</td>
            <td>${a.acoes.bloqueadas ? `<span class="chip quente">${a.acoes.bloqueadas}</span>` : '0'}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="sub" style="text-align:left;margin-top:10px">“Com fonte” é a fatia de respostas fundamentadas em documento aprovado da base. O resto o agente disse sem citar origem.</p>`
          : vazio('Nenhum agente provisionado', 'Provisionar cria os agentes do catálogo desligados, no nível mais conservador. Ligar é decisão sua, um a um.',
            '<button class="btn" id="ag-prov">Provisionar agentes</button>')}

        ${d.agentes.length ? '<p style="margin-top:12px"><button class="btn peq secund" id="ag-prov">Provisionar agentes que faltam</button></p>' : ''}

        <h3 style="margin:22px 0 8px">Base de conhecimento</h3>
        <p class="sub" style="text-align:left;margin:0 0 10px">O agente só cita documento <b>aprovado</b> e dentro da validade. O resto ele responde sem fonte — e a métrica acima mostra quanto.</p>
        <div class="card">
          <div style="display:grid;gap:8px;max-width:560px">
            ${campo('co-titulo', 'Título do documento')}
            ${area('co-texto', 'Conteúdo', '', 4)}
            <div><button class="btn peq" id="co-criar">Acrescentar</button></div>
          </div>
          ${(d.conhecimento || []).length ? `<table style="margin-top:12px"><thead><tr><th>Documento</th><th>Situação</th><th></th></tr></thead><tbody>
            ${d.conhecimento.map((c) => `<tr><td>${esc(c.titulo)}</td>
              <td><span class="chip ${c.status === 'aprovado' ? '' : 'frio'}">${esc(c.status)}</span></td>
              <td>${c.status === 'aprovado' ? '' : `<button class="btn peq secund" data-aprovar-doc="${esc(c.id)}">aprovar</button>`}</td></tr>`).join('')}
            </tbody></table>` : ''}
        </div>`);

      aoClicar('#ag-prov', () => tentar(() => POST('/agentes/provisionar'), vAgentes));
      aoClicar('#co-criar', async () => {
        if (!val('#co-titulo')) { alert('Dê um título ao documento.'); return; }
        await tentar(() => POST('/conhecimento', { titulo: val('#co-titulo'), corpo: val('#co-texto') }), vAgentes);
      });
      document.querySelectorAll('#tela [data-aprovar-doc]').forEach((b) => {
        b.onclick = () => tentar(() => POST('/conhecimento/' + encodeURIComponent(b.dataset.aprovarDoc) + '/aprovar'), vAgentes);
      });
      document.querySelectorAll('#tela [data-agente]').forEach((a) => {
        a.onclick = (ev) => { ev.preventDefault(); editarAgente(a.dataset.agente, d); };
      });
    } catch (e) { erro(e); }
  }

  async function editarAgente(chave, meta) {
    carregando();
    try {
      const r = await api('/agentes/' + encodeURIComponent(chave));
      if (!r.atual()) return;
      const ag = r.dados.agente;
      const m = r.dados.metricas;
      const versao = r.dados.versao;

      tela(`${linkVoltar('← todos os agentes')}
        <h2 style="margin:.2rem 0">${esc(ag.nome)} ${ag.ativo ? '<span class="chip">ligado</span>' : '<span class="chip frio">desligado</span>'}</h2>
        <p class="sub" style="text-align:left;margin:0 0 14px">${esc(ag.descricao || '')}</p>

        <div class="card"><h3 style="margin:.2rem 0">Como ele se comporta</h3>
          <div style="display:grid;gap:8px;max-width:560px;margin-top:8px">
            ${select('ag-ativo', 'Situação', [['1', 'Ligado'], ['0', 'Desligado']], ag.ativo ? '1' : '0')}
            ${select('ag-motor', 'Motor', [['regras', 'Regras (determinístico, sempre disponível)'], ['llm', 'Modelo de linguagem']], ag.motor)}
            ${select('ag-nivel', 'Autonomia', Object.entries(meta.niveis || {})
              .filter(([n]) => Number(n) <= 3)
              .map(([n, t]) => [n, `${n} — ${t}`]), String(ag.nivel_autonomia))}
            ${campo('ag-orc', 'Orçamento de tokens por mês', `type="number" min="0" value="${esc(String(ag.orcamento_tokens_mes || 0))}"`)}
            <div><button class="btn peq" id="ag-salvar">Salvar</button></div>
          </div>
          <p class="sub" style="text-align:left;margin:10px 0 0">Nível 4 (ação proibida) não aparece porque o serviço recusa antes da tela.
            No nível 3, tudo que ele propuser passa pela sua aprovação.</p>
        </div>

        <div class="card" style="margin-top:12px"><h3 style="margin:.2rem 0">Instruções (prompt)</h3>
          <p class="sub" style="text-align:left;margin:4px 0 8px">Publicar cria uma versão nova — a anterior fica no histórico.
            ${versao ? `Em uso: v${versao.versao}.` : 'Nenhuma versão publicada ainda.'}</p>
          ${area('ag-prompt', 'O que ele deve fazer, e o que nunca deve', (versao && versao.prompt) || '', 8)}
          <button class="btn peq" id="ag-prompt-pub">Publicar instruções</button>
        </div>

        <div class="hi-grid" style="margin:16px 0">
          ${kpi(m.mes.execucoes || 0, 'execuções no mês')}
          ${kpi(m.mes.pct_fundamentadas == null ? '—' : m.mes.pct_fundamentadas + '%', 'com fonte citada')}
          ${kpi(m.acoes.sugeridas || 0, 'ações sugeridas')}
          ${kpi(m.acoes.bloqueadas || 0, 'ações bloqueadas')}
        </div>

        ${(r.dados.execucoes || []).length ? `<h3 style="margin:16px 0 8px">Últimas execuções</h3>
          <div class="card"><table><thead><tr><th>Quando</th><th>Motor</th><th>Fonte</th><th>Resumo</th></tr></thead><tbody>
          ${r.dados.execucoes.slice(0, 15).map((x) => `<tr><td>${esc(dataHora(x.criado_em))}</td>
            <td>${esc(x.motor || '')}</td>
            <td>${Number(x.fundamentada) ? '<span class="chip">sim</span>' : '<span class="chip frio">não</span>'}</td>
            <td>${esc(String(x.saida || '').slice(0, 90))}</td></tr>`).join('')}
          </tbody></table></div>` : ''}`);

      ligarVoltar(vAgentes);
      aoClicar('#ag-salvar', () => tentar(() => PUT('/agentes/' + encodeURIComponent(chave), {
        ativo: val('#ag-ativo') === '1',
        motor: val('#ag-motor'),
        nivelAutonomia: Number(val('#ag-nivel')),
        orcamentoTokensMes: num('#ag-orc'),
      }), () => editarAgente(chave, meta)));
      aoClicar('#ag-prompt-pub', () => tentar(() => POST('/agentes/' + encodeURIComponent(chave) + '/prompt',
        { prompt: val('#ag-prompt') }), () => editarAgente(chave, meta)));
    } catch (e) { erro(e); }
  }

  // ----------------------------------------------------------- CONTEÚDO
  async function vConteudo() {
    carregando();
    try {
      const r = await api('/conteudo');
      if (!r.atual()) return;
      const d = r.dados;
      const disp = d.disponibilidade || {};
      const redesLigadas = Object.entries(disp).filter(([, v]) => v.conectado).map(([x]) => x);

      tela(`<h2 style="margin:.2rem 0">Conteúdo</h2>
        ${redesLigadas.length ? '' : `<div class="aviso">Nenhuma rede social conectada ainda. Você pode planejar, escrever e aprovar normalmente — publicar fica disponível quando conectar uma conta em <b>Conexões</b>.</div>`}

        <div class="card" style="margin-bottom:14px"><h3 style="margin:.2rem 0">Nova ideia</h3>
          <div style="display:grid;gap:8px;max-width:560px;margin-top:8px">
            ${campo('ct-titulo', 'Título interno', 'placeholder="Ex.: Bastidores da casa nova"')}
            ${select('ct-formato', 'Formato', (d.formatos || []).map((f) => [f, f]))}
            <div><button class="btn peq" id="ct-criar">Criar</button></div>
          </div></div>

        <div class="hi-grid" style="margin:12px 0">
          ${Object.entries(d.resumo || {}).filter(([, n]) => n > 0).map(([st, n]) => kpi(n, st)).join('') || kpi(0, 'itens')}
        </div>

        ${d.itens.length ? `<div class="card"><table><thead><tr><th>Título</th><th>Formato</th><th>Situação</th><th>Agendado</th><th>Publicações</th></tr></thead><tbody>
          ${d.itens.map((c) => `<tr><td><a href="#" data-conteudo="${esc(c.id)}"><b>${esc(c.titulo)}</b></a></td><td>${esc(c.formato)}</td>
            <td><span class="chip ${c.status === 'erro' ? 'muito-quente' : 'frio'}">${esc(c.status)}</span></td>
            <td>${esc(c.agendado_para ? dataHora(c.agendado_para) : '—')}</td>
            <td>${(c.publicacoes || []).map((p) => `<span class="chip ${p.status === 'bloqueada' ? 'quente' : 'frio'}" title="${esc(p.motivo || '')}">${esc(p.rede)}: ${esc(p.status)}</span>`).join(' ') || '—'}</td></tr>`).join('')}
        </tbody></table></div>` : vazio('Nada no calendário ainda', 'Crie uma ideia e ela caminha até virar publicação.')}`);

      aoClicar('#ct-criar', async () => {
        if (!val('#ct-titulo')) { alert('Dê um título ao conteúdo.'); return; }
        await tentar(() => POST('/conteudo', { titulo: val('#ct-titulo'), formato: val('#ct-formato') }),
          (res) => editarConteudo(res.dados.id, d));
      });
      document.querySelectorAll('#tela [data-conteudo]').forEach((a) => {
        a.onclick = (ev) => { ev.preventDefault(); editarConteudo(a.dataset.conteudo, d); };
      });
    } catch (e) { erro(e); }
  }

  async function editarConteudo(id, meta) {
    carregando();
    try {
      const r = await api('/conteudo/' + encodeURIComponent(id));
      if (!r.atual()) return;
      const c = r.dados.conteudo;
      const disp = r.dados.disponibilidade || {};
      const variacoes = r.dados.variacoes || [];
      const limites = meta.limite_legenda || {};

      // Só oferece rede cuja CONEXÃO aceita o formato — §13.2: não mostrar
      // botão que a conta não pode apertar.
      const redesOk = Object.entries(disp).filter(([, v]) => v.conectado && v.formatos.includes(c.formato)).map(([x]) => x);
      const redesTodas = Object.keys(disp);

      tela(`${linkVoltar('← calendário')}
        <h2 style="margin:.2rem 0">${esc(c.titulo)} <span class="chip ${c.status === 'erro' ? 'muito-quente' : 'frio'}">${esc(c.status)}</span></h2>

        <div class="card"><h3 style="margin:.2rem 0">Texto base</h3>
          <div style="display:grid;gap:8px;margin-top:8px">
            ${campo('ct-t', 'Título', `value="${esc(c.titulo)}"`)}
            ${area('ct-corpo', 'Legenda base', c.legenda || '', 6)}
            <div><button class="btn peq" id="ct-salvar">Salvar</button></div>
          </div></div>

        ${r.dados.problemas && r.dados.problemas.length ? `<div class="vx-alerta vx-alerta--warn" style="margin-top:12px">
          <span class="vx-alerta-ico" aria-hidden="true">⚠️</span><div><b>Antes de aprovar</b>
          <ul style="margin:6px 0 0;padding-left:18px">${r.dados.problemas.map((p) => `<li>${esc(typeof p === 'string' ? p : p.mensagem || JSON.stringify(p))}</li>`).join('')}</ul></div></div>` : ''}

        <div class="card" style="margin-top:12px"><h3 style="margin:.2rem 0">Versão por rede</h3>
          <p class="sub" style="text-align:left;margin:4px 0 10px">Cada rede tem limite e jeito próprios. Sem variação, a rede usa o texto base.</p>
          <div style="display:grid;gap:8px;max-width:640px">
            ${select('ct-rede', 'Rede', redesTodas.map((x) => [x, `${x}${disp[x].conectado ? '' : ' (não conectada)'}`]))}
            ${area('ct-var', 'Legenda para esta rede', '', 5)}
            <div><button class="btn peq" id="ct-var-salvar">Guardar versão</button>
              <span id="ct-contador" style="margin-left:10px;font-size:.85rem;color:#5b6b70"></span></div>
          </div>
          ${variacoes.length ? `<table style="margin-top:12px"><thead><tr><th>Rede</th><th>Caracteres</th><th>Prévia</th></tr></thead><tbody>
            ${variacoes.map((v) => `<tr><td>${esc(v.rede)}</td>
              <td>${String(v.legenda || '').length}${limites[v.rede] ? ` / ${limites[v.rede]}` : ''}</td>
              <td>${esc(String(v.legenda || '').slice(0, 70))}</td></tr>`).join('')}
            </tbody></table>` : ''}
        </div>

        <div class="card" style="margin-top:12px"><h3 style="margin:.2rem 0">Publicar</h3>
          ${redesOk.length ? `<p class="sub" style="text-align:left;margin:4px 0 10px">Redes que aceitam <b>${esc(c.formato)}</b> nesta conta:</p>
            <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px">
              ${redesOk.map((x) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-rede="${esc(x)}" style="width:auto"> ${esc(x)}</label>`).join('')}
            </div>
            ${campo('ct-quando', 'Quando (deixe vazio para agora)', 'type="datetime-local"')}`
            : '<div class="aviso">Nenhuma conexão aceita este formato hoje. Conecte uma conta em <b>Conexões</b> — o conteúdo continua guardado.</div>'}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            ${c.status !== 'aprovado' ? '<button class="btn peq secund" id="ct-revisao">Enviar para revisão</button>' : ''}
            <button class="btn peq secund" id="ct-aprovar">Aprovar</button>
            ${redesOk.length ? '<button class="btn peq" id="ct-agendar">Agendar publicação</button>' : ''}
          </div>
          <div id="ct-saida" style="margin-top:10px"></div>
        </div>

        ${(r.dados.publicacoes || []).length ? `<h3 style="margin:22px 0 8px">Publicações</h3>
          <div class="card"><table><thead><tr><th>Rede</th><th>Situação</th><th>Quando</th><th>Motivo</th></tr></thead><tbody>
          ${r.dados.publicacoes.map((p) => `<tr><td>${esc(p.rede)}</td>
            <td><span class="chip ${p.status === 'bloqueada' || p.status === 'erro' ? 'quente' : 'frio'}">${esc(p.status)}</span></td>
            <td>${esc(p.agendada_para ? dataHora(p.agendada_para) : '—')}</td>
            <td>${esc(p.motivo || p.erro || '')}</td></tr>`).join('')}
          </tbody></table></div>` : ''}`);

      ligarVoltar(vConteudo);

      const contar = () => {
        const rede = val('#ct-rede');
        const lim = limites[rede];
        const n = (($('#ct-var') || {}).value || '').length;
        const el = $('#ct-contador');
        if (el) el.textContent = lim ? `${n} / ${lim} caracteres` : `${n} caracteres`;
        if (el && lim && n > lim) el.style.color = '#B0185A'; else if (el) el.style.color = '#5b6b70';
      };
      const carregarVar = () => {
        const v = variacoes.find((x) => x.rede === val('#ct-rede'));
        if ($('#ct-var')) $('#ct-var').value = (v && v.legenda) || '';
        contar();
      };
      if ($('#ct-rede')) { $('#ct-rede').onchange = carregarVar; carregarVar(); }
      if ($('#ct-var')) $('#ct-var').oninput = contar;

      aoClicar('#ct-salvar', () => tentar(() => PUT('/conteudo/' + encodeURIComponent(id),
        { titulo: val('#ct-t'), legenda: val('#ct-corpo') }), () => editarConteudo(id, meta)));
      aoClicar('#ct-var-salvar', () => tentar(() => POST('/conteudo/' + encodeURIComponent(id) + '/variacao',
        { rede: val('#ct-rede'), legenda: val('#ct-var') }), () => editarConteudo(id, meta)));
      aoClicar('#ct-revisao', () => tentar(() => POST('/conteudo/' + encodeURIComponent(id) + '/mover',
        { status: 'revisao' }), () => editarConteudo(id, meta)));
      aoClicar('#ct-aprovar', () => tentar(() => POST('/conteudo/' + encodeURIComponent(id) + '/aprovar'),
        () => editarConteudo(id, meta)));
      aoClicar('#ct-agendar', async () => {
        const redes = [...document.querySelectorAll('#tela [data-rede]')].filter((x) => x.checked).map((x) => x.dataset.rede);
        if (!redes.length) { alert('Escolha pelo menos uma rede.'); return; }
        const quando = val('#ct-quando');
        const res = await tentar(() => POST('/conteudo/' + encodeURIComponent(id) + '/agendar',
          { redes, quando: quando ? new Date(quando).toISOString() : null }));
        if (!res) return;
        const rr = res.dados.publicacoes || [];
        $('#ct-saida').innerHTML = `<div class="card">${rr.map((x) => `<div>${esc(x.rede)}:
          <span class="chip ${x.status === 'bloqueada' ? 'quente' : 'frio'}">${esc(x.status)}</span>
          ${x.motivo ? esc(x.motivo) : ''}</div>`).join('')}</div>`;
      });
    } catch (e) { erro(e); }
  }

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

  // ------------------------------------------------------------ ANÚNCIOS
  async function vAnuncios() {
    carregando();
    try {
      const r = await api('/anuncios');
      if (!r.atual()) return;
      const d = r.dados;
      const contas = d.contas || [];
      const campanhas = d.campanhas || [];

      tela(`<h2 style="margin:.2rem 0">Anúncios</h2>
        <div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico" aria-hidden="true">💸</span>
          <div><b>Nada aqui gasta dinheiro sozinho.</b>
          <p class="vx-mb0">Nenhuma plataforma de anúncio está conectada de verdade (todas dependem de aprovação de terceiros).
            Contas e campanhas são registradas para controle e atribuição; toda alteração de orçamento passa pela sua aprovação.</p></div></div>

        ${(d.alertas || []).length ? `<div class="aviso" style="margin-top:12px"><b>Atenção</b><ul style="margin:6px 0 0;padding-left:18px">
          ${d.alertas.map((a) => `<li>${esc(a.mensagem || a.titulo || JSON.stringify(a))}</li>`).join('')}</ul></div>` : ''}

        <div class="card" style="margin-top:14px"><h3 style="margin:.2rem 0">Registrar conta de anúncio</h3>
          <div style="display:grid;gap:8px;max-width:560px;margin-top:8px">
            ${select('an-plat', 'Plataforma', Object.entries(d.plataformas || {}))}
            ${campo('an-nome', 'Nome da conta')}
            ${campo('an-ext', 'ID da conta na plataforma (opcional)')}
            <div><button class="btn peq" id="an-criar">Registrar</button></div>
          </div></div>

        ${contas.length ? `<h3 style="margin:22px 0 8px">Contas</h3>
          ${contas.map((c) => `<div class="card" style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div><b>${esc(c.nome)}</b> <span class="chip frio">${esc(c.plataforma)}</span>
                <div style="font-size:.85rem;color:#5b6b70">
                  Teto diário: ${c.teto_diario_cent ? brl(c.teto_diario_cent) : 'sem teto'} ·
                  mensal: ${c.teto_mensal_cent ? brl(c.teto_mensal_cent) : 'sem teto'}</div></div>
            </div>
            <details style="margin-top:10px"><summary style="cursor:pointer">Definir teto de gasto</summary>
              <div style="display:grid;gap:8px;max-width:420px;margin-top:8px">
                ${campo(`teto-d-${c.id}`, 'Teto diário (R$)', `type="number" min="0" step="0.01" value="${(Number(c.teto_diario_cent || 0) / 100)}"`)}
                ${campo(`teto-m-${c.id}`, 'Teto mensal (R$)', `type="number" min="0" step="0.01" value="${(Number(c.teto_mensal_cent || 0) / 100)}"`)}
                <div><button class="btn peq" data-teto="${esc(c.id)}">Salvar teto</button></div>
                <p class="sub" style="text-align:left;margin:0">O teto é trava, não sugestão: pedido que estoure é recusado antes de virar aprovação.</p>
              </div></details>
            <details style="margin-top:8px"><summary style="cursor:pointer">Registrar campanha</summary>
              <div style="display:grid;gap:8px;max-width:420px;margin-top:8px">
                ${campo(`cam-n-${c.id}`, 'Nome da campanha')}
                ${campo(`cam-o-${c.id}`, 'Orçamento diário (R$)', 'type="number" min="0" step="0.01" value="0"')}
                <div><button class="btn peq" data-campanha="${esc(c.id)}">Registrar</button></div>
              </div></details>
          </div>`).join('')}` : vazio('Nenhuma conta de anúncio', 'Registre uma conta para acompanhar gasto, teto e atribuição.')}

        ${campanhas.length ? `<h3 style="margin:22px 0 8px">Campanhas</h3>
          <div class="card"><table><thead><tr><th>Campanha</th><th>Situação</th><th>Orçamento/dia</th><th></th></tr></thead><tbody>
          ${campanhas.map((c) => `<tr><td><b>${esc(c.nome)}</b></td>
            <td><span class="chip frio">${esc(c.status)}</span></td>
            <td>${brl(c.orcamento_cent || 0)} <span style="font-size:.8rem;color:#5b6b70">/ ${esc(c.orcamento_tipo || 'diario')}</span></td>
            <td><button class="btn peq secund" data-orc="${esc(c.id)}" data-atual="${Number(c.orcamento_cent || 0) / 100}">Pedir alteração</button></td></tr>`).join('')}
          </tbody></table></div>` : ''}

        ${(d.alteracoes || []).length ? `<h3 style="margin:22px 0 8px">Alterações de orçamento</h3>
          <div class="card"><table><thead><tr><th>Quando</th><th>De</th><th>Para</th><th>Situação</th></tr></thead><tbody>
          ${d.alteracoes.map((a) => `<tr><td>${esc(dataHora(a.criado_em))}</td>
            <td>${brl(a.de_cent)}</td><td>${brl(a.para_cent)}</td>
            <td><span class="chip ${a.status === 'aplicada' ? '' : 'frio'}">${esc(a.status)}</span></td></tr>`).join('')}
          </tbody></table></div>` : ''}

        <div id="an-saida" style="margin-top:12px"></div>`);

      aoClicar('#an-criar', async () => {
        if (!val('#an-nome')) { alert('Dê um nome à conta.'); return; }
        await tentar(() => POST('/anuncios/contas', {
          plataforma: val('#an-plat'), nome: val('#an-nome'), contaExternaId: val('#an-ext'),
        }), vAnuncios);
      });
      document.querySelectorAll('#tela [data-teto]').forEach((b) => {
        b.onclick = () => tentar(() => PUT('/anuncios/contas/' + encodeURIComponent(b.dataset.teto) + '/teto', {
          diarioCent: Math.round(num(`#teto-d-${b.dataset.teto}`) * 100),
          mensalCent: Math.round(num(`#teto-m-${b.dataset.teto}`) * 100),
        }), vAnuncios);
      });
      document.querySelectorAll('#tela [data-campanha]').forEach((b) => {
        b.onclick = () => {
          const nome = val(`#cam-n-${b.dataset.campanha}`);
          if (!nome) { alert('Dê um nome à campanha.'); return; }
          tentar(() => POST('/anuncios/campanhas', {
            contaId: b.dataset.campanha, nome,
            orcamentoCent: Math.round(num(`#cam-o-${b.dataset.campanha}`) * 100),
          }), vAnuncios);
        };
      });
      document.querySelectorAll('#tela [data-orc]').forEach((b) => {
        b.onclick = async () => {
          const novo = prompt(`Novo orçamento diário, em reais (atual: ${b.dataset.atual}):`, b.dataset.atual);
          if (novo === null) return;
          const just = prompt('Por que esta alteração? (fica registrado na aprovação)') || '';
          const res = await tentar(() => POST('/anuncios/orcamento', {
            campanhaId: b.dataset.orc,
            paraCent: Math.round(Number(String(novo).replace(',', '.')) * 100),
            justificativa: just,
          }));
          if (!res) return;
          $('#an-saida').innerHTML = `<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico" aria-hidden="true">✋</span>
            <div><b>Pedido registrado, nada mudou ainda.</b>
            <p class="vx-mb0">A alteração só vale depois de aprovada em <b>Aprovações</b>.</p></div></div>`;
        };
      });
    } catch (e) { erro(e); }
  }

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
      ['gx_anuncios', '', 'Crescimento', '💸', 'Anúncios', 'anuncios'],
      ['gx_atribuicao', '', 'Crescimento', '📈', 'Atribuição', ''],
      ['gx_reputacao', '', 'Crescimento', '⭐', 'Reputação', 'reputacao'],
      ['gx_agentes', '', 'Inteligência', '🧠', 'Agentes', 'ia'],
      ['gx_aprovacoes', '', 'Governança', '✋', 'Aprovações', ''],
      ['gx_conexoes', '', 'Governança', '🔌', 'Conexões', ''],
      ['gx_seguranca', '', 'Conta', '🔒', 'Segurança', ''],
      ['gx_assinatura', '', 'Conta', '💳', 'Plano e uso', ''],
    ],
    vistas: {
      gx_visao: vVisao, gx_inbox: vInbox, gx_reunioes: vReunioes,
      gx_automacoes: vAutomacoes, gx_conteudo: vConteudo,
      gx_anuncios: vAnuncios, gx_atribuicao: vAtribuicao,
      gx_reputacao: vReputacao, gx_agentes: vAgentes, gx_aprovacoes: vAprovacoes,
      gx_conexoes: vConexoes, gx_seguranca: vSeguranca, gx_assinatura: vAssinatura,
    },
  };
})();
