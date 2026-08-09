'use strict';
// ============================================================================
// Portal Staff — módulo: app-origena (Origena, memória e legado familiar).
//
// O QUE ESTA TELA MOSTRA — E O QUE ELA NÃO MOSTRA. A Origena guarda o acervo
// de famílias inteiras: fotos de gente morta, certidões, histórias contadas
// na mesa. O staff da plataforma NÃO é dono disso (SECURITY.md T12), e a API
// daqui devolve só AGREGADO — contagem, bytes, saldo, saúde. Não existe rota
// que abra foto, história ou documento de família, e esta tela não tem para
// onde clicar que leve a uma.
//
// A operação real que sobra é: ver se está de pé, ver se a família está
// crescendo, creditar uma compra enquanto o gateway não existe, ligar/desligar
// um provedor de IA e, no fim do contrato, purgar.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const ogGB = (b) => (Number(b || 0) / 1073741824).toFixed(2) + ' GB';
const ogBrl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const ogCard = (rot, n, sub) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(rot)}</div>${sub ? `<div class="obs">${esc(sub)}</div>` : ''}</div>`;
let OG_VISAO = 'familias';

async function renderOrigena() {
  conteudo().innerHTML = cabecalho('🌳 Origena — plataforma',
    'Memória, história e legado familiar. Aqui só agregados: o acervo é da família, e o staff não abre foto, história nem documento de ninguém.')
    + `<div class="barra">
        <a class="btn secund" href="https://origena.villelastay.com.br" target="_blank" rel="noopener">🌐 Landing</a>
        <a class="btn secund" href="/origena/app" target="_blank" rel="noopener">🖥️ App da família</a>
        <button class="btn secund" id="og-saude">🩺 Testar a saúde agora</button>
       </div>
       <div id="og-alertas"></div>
       <div id="og-cards" class="cards"></div>
       <div class="barra" style="margin-top:12px">
         ${['familias', 'precos', 'saude', 'ia'].map((v) => `<button class="btn secund og-nav" data-v="${v}">${{
    familias: '👪 Famílias', precos: '💳 Preços', saude: '🩺 Saúde', ia: '🤖 Provedores de IA',
  }[v]}</button>`).join('')}
       </div>
       <div id="og-corpo"><p class="vazio">Carregando…</p></div>`;

  // O /saude faz o teste SINTÉTICO de storage (PUT/GET/DELETE no R2 de
  // verdade). Fica num botão, e não no carregamento, porque custa 3 chamadas
  // ao R2 — a lição é a de sempre: heartbeat verde com a fonte caída não vale
  // nada, mas também não se paga por ele a cada abertura de tela.
  $('#og-saude').onclick = async () => {
    const b = $('#og-saude'); b.disabled = true; b.textContent = '🩺 Testando…';
    try { OG_VISAO = 'saude'; window._ogSaude = await api('GET', '/origena/saude'); ogCorpo(); }
    catch (e) { alert(e.message); }
    finally { b.disabled = false; b.textContent = '🩺 Testar a saúde agora'; }
  };
  document.querySelectorAll('.og-nav').forEach((b) => { b.onclick = () => { OG_VISAO = b.dataset.v; ogCorpo(); }; });
  ogCarregar();
}

async function ogCarregar() {
  try {
    const d = await api('GET', '/origena/resumo');
    window._og = d;
    const soma = (campo) => (d.por_familia || []).reduce((s, f) => s + Number(f[campo] || 0), 0);
    const mpc = soma('mpc');
    const bytes = soma('bytes');
    const abertas = (d.por_familia || []).reduce((s, f) => s + Number((f.missoes || {}).abertas || 0), 0);
    $('#og-cards').innerHTML = [
      ogCard('Famílias', d.familias, `${d.usuarios} conta(s) no total`),
      ogCard('Pessoas no acervo', soma('pessoas'), `${soma('midias')} mídia(s) · ${ogGB(bytes)}`),
      // §80: a métrica que o produto quer premiar. Subir 5.000 fotos sem
      // contexto aumenta o armazenamento e NÃO move este número.
      ogCard('Memória preservada (MPC)', mpc, 'item com pessoa, data, lugar, autoria e fonte'),
      ogCard('Perguntas abertas', abertas, 'lacunas que o Historiador achou'),
      ogCard('Fila', `${d.fila.na_fila || 0}`, `${d.fila.processando || 0} processando · DLQ ${d.fila.dlq || 0}`),
      ogCard('Custo de IA', ogBrl(soma('custo_ia_centavos')), `${soma('claims')} fato(s) com proveniência`),
    ].join('');
    $('#og-alertas').innerHTML = (d.alertas || []).length
      ? `<p class="erro">⚠️ ${d.alertas.map(esc).join('<br>⚠️ ')}</p>` : '';
    ogCorpo();
  } catch (e) { $('#og-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

function ogCorpo() {
  const cx = $('#og-corpo');
  document.querySelectorAll('.og-nav').forEach((b) => b.classList.toggle('ativo', b.dataset.v === OG_VISAO));
  try {
    if (OG_VISAO === 'familias') return ogFamilias(cx);
    if (OG_VISAO === 'precos') return ogPrecos(cx);
    if (OG_VISAO === 'saude') return ogSaude(cx);
    if (OG_VISAO === 'ia') return ogIA(cx);
  } catch (e) { cx.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------------------------------------------------------------- famílias
function ogFamilias(cx) {
  const d = window._og || { por_familia: [] };
  if (!d.por_familia.length) { cx.innerHTML = '<p class="vazio">Nenhuma família ainda.</p>'; return; }
  cx.innerHTML = `<h2>Famílias (${d.por_familia.length})</h2>
    <p class="vazio" style="text-align:left">Números, não conteúdo. Para entrar num acervo é preciso ser convidado pela própria família — inclusive você.</p>`
    + d.por_familia.map((f) => {
      const m = f.mpc_por_tipo || {};
      const mi = f.missoes || {};
      return `<div class="card" style="text-align:left;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
          <div style="flex:1;min-width:240px">
            <b>${esc(f.nome)}</b> ${f.reconciliacao && !f.reconciliacao.ok ? '<span class="tag">saldo ≠ ledger</span>' : ''}<br>
            <small>${f.pessoas} pessoa(s) · ${f.midias} mídia(s) (${ogGB(f.bytes)}) · ${f.historias} história(s) · ${f.claims} fato(s)</small><br>
            <small><b>MPC ${f.mpc}</b> = ${m.midia || 0} mídia + ${m.historia || 0} história + ${m.tradicao || 0} tradição
              · ${mi.abertas || 0} pergunta(s) aberta(s), ${mi.fechadas || 0} fechada(s)</small><br>
            <small>Créditos: <b>${f.saldo}</b> · IA: ${(f.ia || {}).jobs || 0} job(s), ${(f.ia || {}).presos || 0} preso(s), custo ${ogBrl(f.custo_ia_centavos)}</small>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn" onclick="ogCreditar('${f.id}','${esc(f.nome)}')">➕ Creditar</button>
            <button class="btn secund" onclick="ogPurgar('${f.id}','${esc(f.nome)}')">🗑️ Purgar…</button>
          </div>
        </div>
      </div>`;
    }).join('');
}

/**
 * Crédito manual — o gateway do Mercado Pago só entra depois que o Augusto
 * definir os preços (Q7). A REFERÊNCIA é obrigatória e torna a operação
 * idempotente: confirmar duas vezes não credita duas vezes.
 */
async function ogCreditar(id, nome) {
  const q = prompt(`Quantos créditos lançar para "${nome}"?`);
  if (!q) return;
  const ref = prompt('Referência (comprovante, pedido, "cortesia beta"…). É ela que impede creditar duas vezes:');
  if (!ref) return;
  try {
    const r = await api('POST', `/origena/familias/${id}/creditos`, {
      creditos: parseInt(q, 10) || 0, referencia: ref, motivo: 'crédito manual pelo Portal Staff' });
    alert(r.creditado ? 'Creditado.' : 'Esta referência já havia sido creditada — nada foi lançado de novo.');
    ogCarregar();
  } catch (e) { alert(e.message); }
}

/**
 * PURGA (§66, LGPD). Apaga linhas E binários, de verdade e para sempre. A
 * API exige o nome da família por extenso; a tela pede duas vezes, porque um
 * clique errado aqui não tem desfazer nem backup por família.
 */
async function ogPurgar(id, nome) {
  if (!confirm(`PURGAR "${nome}"?\n\nIsto apaga TUDO desta família — pessoas, fotos, documentos, histórias e os arquivos no storage. É irreversível e não existe lixeira depois.\n\nSó faça isto no encerramento do contrato ou a pedido do titular.`)) return;
  const digitado = prompt(`Para confirmar, digite o nome exato da família:\n\n${nome}`);
  if (!digitado) return;
  try {
    const r = await api('POST', `/origena/familias/${id}/purgar`, { confirmar_nome: digitado });
    const linhas = Object.entries(r.purgado.linhas || {}).filter(([, n]) => n > 0)
      .map(([t, n]) => `${t}: ${n}`).join('\n');
    alert(`Família purgada.\n\nBinários apagados: ${r.purgado.binarios}\n\n${linhas}`);
    ogCarregar();
  } catch (e) { alert(e.message); }
}

// ------------------------------------------------------------------ preços
// O preço não mora em código (§97) — mora no banco e se edita aqui. Ao lado
// de cada plano aparece o PISO DE CUSTO com o plano CHEIO: um plano só é
// sustentável se o preço cobre o cliente que usa tudo, não o cliente médio.
const ogPct = (bp) => (bp == null ? '—' : (bp / 100).toFixed(0) + '%');

async function ogPrecos(cx) {
  cx.innerHTML = '<p class="vazio">Carregando…</p>';
  const d = await api('GET', '/origena/precos');
  window._ogPrecos = d;
  const cfg = (chave) => (d.config[chave] || {}).valor || '—';

  cx.innerHTML = `<h2>Preços</h2>
    <p class="vazio" style="text-align:left">Definidos em 09/08/2026 como <b>ponto de partida</b>:
      no patamar da concorrência (MyHeritage começa em R$&nbsp;389/ano no Brasil; Storyworth
      US$&nbsp;59–199/ano; Remento US$&nbsp;99) e acima do piso de custo com o plano cheio.
      Mudança aqui vale para as PRÓXIMAS cobranças — assinatura em curso mantém o preço contratado.</p>

    <h3>Planos</h3>
    ${d.planos.map((p) => `<div class="card" style="text-align:left;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:230px">
          <b>${esc(p.nome)}</b> ${p.ativo ? '' : '<span class="tag">desligado</span>'}<br>
          <small>${p.storage_gb} GB · ${p.creditos_mes} crédito(s)/mês · ${p.familias} família(s)</small><br>
          <small>Piso de custo com o plano CHEIO: <b>${ogBrl(p.piso_centavos)}</b>
            (${ogBrl(p.custo_storage_centavos)} de storage + ${ogBrl(p.custo_creditos_centavos)} de IA)
            · margem <b>${ogPct(p.margem_bp)}</b>${p.margem_bp != null && p.margem_bp < 0 ? ' ⚠️ NO PREJUÍZO' : ''}</small>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <label style="font-size:.8rem">mês R$<input id="og-pm-${p.id}" value="${(p.preco_centavos / 100).toFixed(2)}" style="width:80px"></label>
          <label style="font-size:.8rem">ano R$<input id="og-pa-${p.id}" value="${(p.preco_anual_centavos / 100).toFixed(2)}" style="width:90px"></label>
          <label style="font-size:.8rem">GB<input id="og-gb-${p.id}" value="${p.storage_gb}" style="width:70px"></label>
          <label style="font-size:.8rem">créd.<input id="og-cr-p-${p.id}" value="${p.creditos_mes}" style="width:70px"></label>
          <button class="btn secund" onclick="ogSalvarPlano('${p.id}')">Salvar</button>
        </div>
      </div></div>`).join('')}

    <h3 style="margin-top:22px">Pacotes de crédito</h3>
    ${d.produtos.map((p) => `<div class="card" style="text-align:left;margin-bottom:6px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
      <div><b>${esc(p.nome)}</b><br><small>${ogBrl(p.preco_centavos)} · ${(p.centavos_por_credito / 100).toFixed(3).replace('.', ',')} por crédito</small></div>
      <div style="display:flex;gap:6px;align-items:center">
        <label style="font-size:.8rem">R$<input id="og-pp-${p.id}" value="${(p.preco_centavos / 100).toFixed(2)}" style="width:90px"></label>
        <button class="btn secund" onclick="ogSalvarProduto('${p.id}')">Salvar</button>
      </div></div>`).join('')}

    <h3 style="margin-top:22px">Custo por operação de IA</h3>
    <p class="vazio" style="text-align:left">A estimativa é hipótese; o <b>medido</b> vem do ledger de custo.
      Quando os dois divergem, é o provedor que mudou de preço — e é isso que este quadro existe para pegar.</p>
    ${tabela(['Capacidade', 'Modelo', 'Cobra', 'Receita', 'Custo est.', 'Margem'],
    d.capacidades.map((c) => [esc(c.capability), `<code>${esc(c.model)}</code>`,
      c.creditos + ' cr', ogBrl(c.receita_centavos), ogBrl(c.custo_estimado_centavos),
      ogPct(c.margem_bp) + (c.ativo ? '' : ' <span class="tag">off</span>')]))}
    <p class="sub">Medido: ${d.medido.operacoes} operação(ões) · custo ${ogBrl(d.medido.custo_centavos)} ·
      margem média ${ogPct(d.medido.margem_bp_media)}</p>

    <h3 style="margin-top:22px">Parâmetros</h3>
    ${Object.entries(d.config).map(([chave, c]) => `<div class="card" style="text-align:left;margin-bottom:6px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:220px"><b>${esc(chave)}</b><br><small>${esc(c.descricao)}</small></div>
      <div><input id="og-cfg-${esc(chave)}" value="${esc(c.valor)}" style="width:110px">
        <button class="btn secund" onclick="ogSalvarConfig('${esc(chave)}')">Salvar</button></div>
    </div>`).join('')}
    <p class="sub">O dólar está em <b>${esc(cfg('fx_usd_brl'))}</b> nesta conta. Quando ele mudar,
      atualize aqui — senão a margem que aparece acima é ficção.</p>`;
}

const ogCent = (id) => Math.round(parseFloat(String(($('#' + id) || {}).value).replace(',', '.')) * 100);
const ogInt = (id) => parseInt(($('#' + id) || {}).value, 10);

async function ogSalvarPlano(id) {
  try {
    await api('PATCH', `/origena/planos/${id}`, {
      preco_centavos: ogCent('og-pm-' + id), preco_anual_centavos: ogCent('og-pa-' + id),
      storage_gb: ogInt('og-gb-' + id), creditos_mes: ogInt('og-cr-p-' + id) });
    ogPrecos($('#og-corpo'));
  } catch (e) { alert(e.message); }
}
async function ogSalvarProduto(id) {
  try {
    await api('PATCH', `/origena/produtos/${id}`, { preco_centavos: ogCent('og-pp-' + id) });
    ogPrecos($('#og-corpo'));
  } catch (e) { alert(e.message); }
}
async function ogSalvarConfig(chave) {
  try {
    await api('PATCH', `/origena/config/${chave}`, { valor: $('#og-cfg-' + chave).value });
    ogPrecos($('#og-corpo'));
  } catch (e) { alert(e.message); }
}

// ------------------------------------------------------------------ saúde
function ogSaude(cx) {
  const s = window._ogSaude;
  const d = window._og || {};
  if (!s) {
    cx.innerHTML = `<h2>Saúde</h2>
      <p class="vazio" style="text-align:left">O teste completo escreve, lê e apaga um objeto no R2 de verdade — por isso fica no botão <b>🩺 Testar a saúde agora</b>, lá em cima, e não no carregamento da tela.</p>
      ${tabela(['Fila', 'Valor'], [
    ['Na fila', d.fila ? d.fila.na_fila : '—'], ['Processando', d.fila ? d.fila.processando : '—'],
    ['Fila cara', d.fila ? d.fila.cara_na_fila : '—'], ['Mais velho (s)', d.fila ? d.fila.idade_mais_velho_seg : '—'],
    ['DLQ (jobs mortos)', d.fila ? d.fila.dlq : '—'],
  ])}`;
    return;
  }
  const selo = (ok) => ok ? '✅' : '❌';
  const w = s.worker || {};
  cx.innerHTML = `<h2>Saúde ${selo(s.ok)}</h2>
    ${tabela(['O quê', 'Estado', 'Detalhe'], [
    ['Banco', selo(s.banco && s.banco.ok), s.banco ? `schema ${esc(s.banco.schema)} · ${s.banco.ms} ms` : '—'],
    ['Storage (R2)', selo(s.storage && s.storage.ok), s.storage && s.storage.pulado ? 'teste pulado' : 'PUT/GET/DELETE reais'],
    ['Worker', selo(w.ok), `bateu há ${w.idade_seg == null ? '—' : w.idade_seg}s · commit <code>${esc(w.commit || '?')}</code>${w.motivo ? ' · ' + esc(w.motivo) : ''}`],
    ['Handlers do worker', (w.faltando || []).length ? '❌' : '✅', esc((w.handlers || []).join(', ') || '—') + ((w.faltando || []).length ? ` · FALTANDO: ${esc(w.faltando.join(', '))}` : '')],
    ['Fila', (s.fila && s.fila.dlq) ? '⚠️' : '✅', s.fila ? `${s.fila.na_fila} na fila · ${s.fila.processando} processando · DLQ ${s.fila.dlq}` : '—'],
  ])}
    <p class="vazio" style="text-align:left">O <code>commit</code> acima é a única prova de que o worker está rodando o código que você acabou de publicar: o painel do Render diz "live" mesmo quando ele não redeployou.</p>`;
}

// ------------------------------------------------------- provedores de IA
async function ogIA(cx) {
  cx.innerHTML = '<p class="vazio">Carregando…</p>';
  const { registry } = await api('GET', '/origena/registry');
  cx.innerHTML = `<h2>Provedores de IA (${registry.length})</h2>
    <p class="vazio" style="text-align:left">Trocar de modelo aqui é <b>UPDATE, não deploy</b> (ADR-0004). Capability sem nenhuma linha ativa some do app da família — a tela nunca oferece botão para o que não existe.</p>`
    + registry.map((l) => `<div class="card" style="text-align:left;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div style="flex:1;min-width:240px">
          <b>${esc(l.capability)}</b> — ${esc(l.provider)} / <code>${esc(l.model)}</code><br>
          <small>prioridade ${l.prioridade} · cobra ${l.creditos} crédito(s) · custo estimado ${ogBrl(l.custo_estimado_centavos)}</small>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input id="og-cr-${l.id}" value="${l.creditos}" style="width:70px" title="créditos cobrados da família">
          <button class="btn secund" onclick="ogRegistrySalvar('${l.id}')">Salvar</button>
          <button class="btn ${l.ativo ? '' : 'secund'}" onclick="ogRegistryAtivo('${l.id}',${!l.ativo})">${l.ativo ? '✅ Ativo' : '⛔ Desligado'}</button>
        </div>
      </div>`).join('');
}
async function ogRegistrySalvar(id) {
  try {
    await api('PATCH', `/origena/registry/${id}`, { creditos: parseInt($('#og-cr-' + id).value, 10) || 0 });
    ogIA($('#og-corpo'));
  } catch (e) { alert(e.message); }
}
async function ogRegistryAtivo(id, ativo) {
  try { await api('PATCH', `/origena/registry/${id}`, { ativo }); ogIA($('#og-corpo')); } catch (e) { alert(e.message); }
}
