'use strict';
// =====================================================================
// Villela Finance — aplicação do ASSINANTE (/finance/app).
//
// Onda 1, deliberadamente pequena: entrar, trocar a própria senha, ligar
// o segundo fator e ver os números — cockpit, DRE e o razão conta a
// conta. Lançar, importar extrato e contas a pagar/receber continuam só
// na API por enquanto (76 rotas), e virão na próxima onda.
//
// Duas coisas que esta tela faz de propósito, e que não são enfeite:
//
//   • **Todo número mostra de onde veio.** A API devolve `origem` com a
//     fórmula e a fonte em cada KPI e em cada linha do DRE; a tela
//     imprime isso embaixo do valor. Um ERP que mostra um número sem
//     origem está pedindo confiança em vez de prová-la.
//   • **A saúde do razão fica na primeira dobra.** Se o razão não fecha
//     ou a auditoria foi adulterada, isso aparece antes de qualquer
//     indicador bonito — porque nesse caso os indicadores não valem.
//
// Script clássico, sem build e sem dependência: o backend serve este
// arquivo direto. Design system do grupo (`villela-saas.css`, classe
// `vx`), sem vertical própria — navy institucional.
// =====================================================================

const F = {
  eu: null,
  competencia: new Date().toISOString().slice(0, 7),
  tab: 'cockpit',

  // -------------------------------------------------------- utilidades
  async api(metodo, caminho, corpo, { mfa } = {}) {
    const opt = { method: metodo, credentials: 'same-origin', headers: {} };
    if (corpo !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(corpo);
    }
    // O segundo fator viaja no cabeçalho, por ação — não é estado de sessão.
    // Sessão que "está com MFA" transforma um código de 30 s em passe do dia.
    if (mfa) opt.headers['x-mfa'] = String(mfa);
    const r = await fetch('/finance/api' + caminho, opt);
    let dados = null;
    try { dados = await r.json(); } catch (_) { /* nem toda resposta é JSON */ }
    if (r.status === 401 && F.eu) { F.eu = null; F.telaLogin('Sua sessão expirou. Entre de novo.'); throw new Error('sessão expirada'); }
    if (!r.ok) throw Object.assign(new Error((dados && dados.erro) || ('Erro ' + r.status)), { status: r.status, dados });
    return dados;
  },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  },
  brl(cents) {
    return 'R$ ' + (Number(cents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  },
  dt(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'; },
  el(id) { return document.getElementById(id); },
  raiz() { return F.el('app'); },

  /** Fórmula e fonte embaixo do número. É o contrato do produto. */
  origem(o) {
    if (!o) return '';
    const partes = [o.formula, o.fonte, o.periodo].filter(Boolean).map(F.esc);
    return partes.length ? `<div class="sub" style="font-size:.78rem;margin-top:2px">${partes.join(' · ')}</div>` : '';
  },

  // ------------------------------------------------------------- boot
  async iniciar() {
    try {
      F.eu = await F.api('GET', '/eu');
      F.telaApp();
    } catch (e) {
      F.telaLogin();
    }
  },

  // ------------------------------------------------------------ login
  telaLogin(aviso) {
    F.raiz().innerHTML = `
      <div class="cx" style="max-width:440px">
        <h1 style="margin:0 0 4px">Villela Finance</h1>
        <p class="sub" style="margin:0 0 20px">Entre com o e-mail e a senha da sua conta.</p>
        ${aviso ? `<div class="aviso">${F.esc(aviso)}</div>` : ''}
        <form class="form" id="f-login">
          <label>E-mail <input id="f-email" type="email" autocomplete="username" required></label>
          <label style="margin-top:10px">Senha <input id="f-senha" type="password" autocomplete="current-password" required></label>
          <p style="margin:16px 0 0"><button class="btn" type="submit" id="f-entrar">Entrar</button></p>
          <p id="f-erro" class="erro" style="margin-top:10px"></p>
        </form>
        <p class="sub" style="margin-top:18px"><a href="/finance">← Voltar</a></p>
      </div>`;
    F.el('f-login').onsubmit = async (ev) => {
      ev.preventDefault();
      const erro = F.el('f-erro'); erro.textContent = '';
      F.el('f-entrar').disabled = true;
      try {
        await F.api('POST', '/login', { email: F.el('f-email').value, senha: F.el('f-senha').value });
        F.eu = await F.api('GET', '/eu');
        F.telaApp();
      } catch (e) {
        erro.textContent = e.message;
        F.el('f-entrar').disabled = false;
      }
    };
  },

  // -------------------------------------------------------- moldura
  telaApp() {
    const e = F.eu;
    const abas = [['cockpit', 'Painel'], ['extrato', 'Extrato'], ['titulos', 'Pagar/Receber'], ['lancamentos', 'Lançamentos'], ['fechamento', 'Fechamento'], ['cfo', 'CFO'], ['dre', 'DRE'], ['relatorios', 'Relatórios'], ['razao', 'Razão'], ['conta', 'Minha conta']];
    const empresas = e.empresas.length > 1
      ? `<select id="f-empresa" style="width:auto;min-width:200px">${e.empresas.map((x) =>
          `<option value="${F.esc(x.id)}"${x.id === e.empresa.id ? ' selected' : ''}>${F.esc(x.nome)}</option>`).join('')}</select>`
      : `<span class="sub">${F.esc(e.empresa.nome)}</span>`;

    F.raiz().innerHTML = `
      <div class="cx" style="max-width:1080px">
        <header style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div>
            <h1 style="margin:0;font-size:1.4rem">Villela Finance</h1>
            <p class="sub" style="margin:2px 0 0">${F.esc(e.conta.nome)} · ${empresas}</p>
          </div>
          <div style="text-align:right">
            <div class="sub">${F.esc(e.usuario.nome || e.usuario.email)} · ${F.esc(e.perfil ? e.perfil.nome : e.usuario.perfil)}</div>
            <button class="btn-ghost btn" style="padding:6px 14px;min-height:0;margin-top:4px" onclick="F.sair()">Sair</button>
          </div>
        </header>
        ${F.avisoDaConta()}
        <div class="menu">${abas.map(([id, rot]) =>
          `<button class="btn ${F.tab === id ? '' : 'btn-ghost'}" onclick="F.ir('${id}')">${rot}</button>`).join('')}</div>
        <div id="f-corpo"><p class="sub">Carregando…</p></div>
      </div>`;
    const sel = F.el('f-empresa');
    if (sel) sel.onchange = () => { F.empresaId = sel.value; F.pintar(); };
    F.pintar();
  },

  /** Conta suspensa não some da tela: ela diz o que perdeu e o que não perdeu. */
  avisoDaConta() {
    const p = F.eu.plano;
    if (!p.bloqueiaEscrita) return '';
    return `<div class="aviso"><b>Esta conta está ${F.esc(F.eu.conta.status)}.</b>
      Lançar, importar e conciliar estão bloqueados. <b>A leitura e a exportação continuam liberadas</b> —
      os seus dados contábeis não ficam retidos. Para voltar a lançar, regularize a assinatura.</div>`;
  },

  ir(t) { F.tab = t; F.telaApp(); },
  corpo() { return F.el('f-corpo'); },

  /**
   * Monta a query. A empresa é opcional — sem ela a API usa a primeira da
   * conta; com várias, o seletor do cabeçalho manda. Montar isto num lugar
   * só evita o `?` grudado com `&` que aparece quando cada chamada
   * concatena a query à mão.
   */
  url(caminho, params) {
    const q = new URLSearchParams();
    if (F.empresaId) q.set('empresa', F.empresaId);
    for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') q.set(k, v);
    const s = q.toString();
    return caminho + (s ? '?' + s : '');
  },

  async pintar() {
    const telas = { cockpit: F.vCockpit, extrato: F.vExtrato, titulos: F.vTitulos, lancamentos: F.vLancamentos, fechamento: F.vFechamento, cfo: F.vCfo, dre: F.vDre, relatorios: F.vRelatorios, razao: F.vRazao, conta: F.vConta };
    try { await telas[F.tab](); }
    catch (e) { if (e.message !== 'sessão expirada') F.corpo().innerHTML = `<div class="card"><p class="erro">${F.esc(e.message)}</p></div>`; }
  },

  async sair() {
    try { await F.api('POST', '/logout'); } catch (_) { /* sair é sempre possível */ }
    F.eu = null;
    F.telaLogin('Você saiu.');
  },

  seletorMes(aoMudar) {
    return `<label style="display:inline-block;width:auto;margin:0 0 14px">
      <span class="sub">Competência</span>
      <input type="month" id="f-comp" value="${F.esc(F.competencia)}" style="width:auto" onchange="${aoMudar}">
    </label>`;
  },
  lerMes() { const i = F.el('f-comp'); if (i && i.value) F.competencia = i.value; },

  // ---------------------------------------------------------- COCKPIT
  async vCockpit() {
    const c = await F.api('GET', F.url('/cockpit', { competencia: F.competencia }));

    // Saúde primeiro: se o razão não fecha, os indicadores não valem.
    const s = c.saude;
    const saude = `<div class="card" style="margin-bottom:14px${s.razaoBalanceado ? '' : ';border-color:var(--vx-danger)'}">
      <h3 style="margin:0 0 8px">Posso confiar nestes números?</h3>
      <p style="margin:0">
        Razão: <b>${s.razaoBalanceado ? 'fecha (débito = crédito)' : 'NÃO FECHA — diferença de ' + F.esc(F.brl(s.diferencaCents))}</b>
        ${s.taxaConciliacao == null ? '' : ` · conciliação automática: <b>${s.taxaConciliacao}%</b>`}
        ${s.transacoesAConciliar ? ` · <b>${s.transacoesAConciliar}</b> transação(ões) do extrato ainda sem classificação` : ''}
      </p>${F.origem(s.origem)}</div>`;

    const atencao = (c.exigeAtencao || []).length
      ? `<div class="aviso"><b>Exige atenção</b><ul style="margin:6px 0 0;padding-left:20px">${
          c.exigeAtencao.map((a) => `<li>${F.esc(a.texto)}</li>`).join('')}</ul></div>`
      : '';

    const kpis = c.kpis.map((k) => `
      <div class="card" style="flex:1;min-width:210px${k.alerta && k.valorCents ? ';border-color:var(--vx-warn)' : ''}">
        <div class="sub">${F.esc(k.rotulo)}</div>
        <div style="font-size:1.5rem;font-weight:700;font-variant-numeric:tabular-nums">${F.esc(k.valor)}</div>
        ${F.origem(k.origem)}
      </div>`).join('');

    F.corpo().innerHTML = F.seletorMes('F.lerMes();F.pintar()') + saude + atencao +
      `<div style="display:flex;flex-wrap:wrap;gap:12px">${kpis}</div>
       <p class="sub" style="margin-top:14px">Cada número acima sai do razão. Abra a aba <b>DRE</b> para ver a
       composição, ou <b>Razão</b> para descer até o lançamento.</p>`;
  },

  // ---------------------------------------------------------- EXTRATO
  // A tela que faz o razão contar a história inteira. Sem ela, as reservas
  // entram como receita e nenhum recebimento é baixado — e o aging de
  // contas a receber acusa inadimplência que não existe.

  /** Contas analíticas e centros, carregados uma vez por empresa. */
  async cadastros() {
    const chave = F.empresaId || 'padrao';
    if (F._cad && F._cad.chave === chave) return F._cad;
    const [c, cc] = await Promise.all([
      F.api('GET', F.url('/contas', { analiticas: '1' })),
      F.api('GET', F.url('/centros-custo')),
    ]);
    F._cad = { chave, contas: c.contas, centros: cc.centros };
    return F._cad;
  },

  async vExtrato() {
    const { contas } = await F.api('GET', F.url('/bancos'));
    if (!contas.length) {
      F.corpo().innerHTML = `<div class="card">
        <h3 style="margin:0 0 6px">Nenhuma conta bancária cadastrada</h3>
        <p class="sub" style="margin:0 0 12px">O extrato só vira contabilidade depois que a conta existe aqui e está
        ligada a uma conta do razão. O saldo inicial é informado uma vez e não muda depois sem aprovação.</p>
        ${F.formNovoBanco()}</div>`;
      F.ligarFormBanco();
      return;
    }
    if (!F.bancoId || !contas.some((c) => c.id === F.bancoId)) F.bancoId = contas[0].id;

    const seletor = contas.map((c) =>
      `<option value="${F.esc(c.id)}"${c.id === F.bancoId ? ' selected' : ''}>${F.esc(c.nome)}${c.banco ? ' — ' + F.esc(c.banco) : ''}</option>`).join('');

    F.corpo().innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:12px">
        <label style="width:auto;min-width:260px;margin:0"><span class="sub">Conta bancária</span>
          <select id="f-banco">${seletor}</select></label>
        <button class="btn btn-ghost" onclick="F.reprocessar()">Reprocessar sugestões</button>
      </div>
      <div id="f-concil"></div>
      <details class="card" style="margin:12px 0"><summary style="cursor:pointer;font-weight:600">Importar extrato</summary>
        <p class="sub" style="margin:10px 0">CSV do banco (o sistema descobre as colunas sozinho) ou JSON.
        Reimportar o mesmo arquivo <b>não duplica</b> — a dedupe é por linha, e duas compras iguais no mesmo dia continuam sendo duas.</p>
        <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
          <label>Arquivo <input type="file" id="f-arq" accept=".csv,.txt,.json"></label>
          <label>Origem (para a auditoria) <input id="f-fonte" placeholder="extrato C6 agosto/2026"></label>
        </div>
        <p style="margin:12px 0 0"><button class="btn" onclick="F.importar()">Importar arquivo</button></p>
        <div id="f-imp-msg" style="margin-top:10px"></div>

        <hr style="margin:18px 0;border:0;border-top:1px solid var(--vx-border)">
        <h4 style="margin:0 0 6px">Mercado Pago — direto pela API</h4>
        <p class="sub" style="margin:0 0 10px">Sem arquivo: puxa os pagamentos recebidos no período.
        Comece pela <b>prévia</b> — ela mostra o que viria sem gravar nada.</p>
        <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
          <label>De <input id="f-mp-de" type="date"></label>
          <label>Até <input id="f-mp-ate" type="date"></label>
        </div>
        <p style="margin:12px 0 0">
          <button class="btn btn-ghost" onclick="F.mercadoPago(true)">Ver prévia</button>
          <button class="btn" onclick="F.mercadoPago(false)">Importar do Mercado Pago</button></p>
        <div id="f-mp-msg" style="margin-top:10px"></div>
      </details>
      <div id="f-trans"><p class="sub">Carregando transações…</p></div>`;

    F.el('f-banco').onchange = (ev) => { F.bancoId = ev.target.value; F.pintar(); };
    await Promise.all([F.pintarConciliacao(), F.pintarTransacoes()]);
  },

  formNovoBanco() {
    return `<form class="form" id="f-banco-form" style="max-width:100%;padding:0;border:0;box-shadow:none">
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
        <label>Nome * <input id="f-b-nome" required placeholder="C6 — conta corrente"></label>
        <label>Banco <input id="f-b-banco" placeholder="C6 Bank"></label>
        <label>Agência <input id="f-b-ag"></label>
        <label>Número <input id="f-b-num"></label>
        <label>Saldo inicial (R$) <input id="f-b-saldo" inputmode="decimal" placeholder="0,00"></label>
        <label>Data do saldo inicial <input id="f-b-data" type="date"></label>
      </div>
      <p style="margin:14px 0 0"><button class="btn" type="submit">Cadastrar conta</button></p>
      <p id="f-b-msg" class="erro"></p></form>`;
  },

  ligarFormBanco() {
    const f = F.el('f-banco-form');
    if (!f) return;
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = F.el('f-b-msg'); msg.className = 'erro'; msg.textContent = '';
      try {
        await F.api('POST', F.url('/bancos'), {
          nome: F.el('f-b-nome').value, banco: F.el('f-b-banco').value,
          agencia: F.el('f-b-ag').value, numero: F.el('f-b-num').value,
          saldoInicialCents: F.centavos(F.el('f-b-saldo').value),
          saldoInicialData: F.el('f-b-data').value,
        });
        F.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
  },

  /** "1.234,56" e "1234.56" viram 123456. Vazio vira 0, nunca NaN. */
  centavos(txt) {
    const limpo = String(txt || '').trim().replace(/\s|R\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    if (!limpo) return 0;
    return Math.round(Number(limpo) * 100) || 0;
  },

  async pintarConciliacao() {
    const alvo = F.el('f-concil');
    if (!alvo) return;
    try {
      const c = await F.api('GET', F.url(`/bancos/${encodeURIComponent(F.bancoId)}/conciliacao`));
      alvo.innerHTML = `<div class="card"${c.conciliado ? '' : ' style="border-color:var(--vx-warn)"'}>
        <h3 style="margin:0 0 6px">Conciliação</h3>
        <p style="margin:0"><b>${F.esc(c.explicacao)}</b></p>
        <p class="sub" style="margin:6px 0 0">
          extrato ${F.esc(F.brl(c.saldoExtratoCents))} · razão ${F.esc(F.brl(c.saldoRazaoCents))} ·
          por conciliar ${c.pendentesQtd} (${F.esc(F.brl(c.pendentesCents))}) ·
          diferença ${F.esc(F.brl(c.diferencaCents))}</p></div>`;
    } catch (e) { alvo.innerHTML = `<p class="erro">${F.esc(e.message)}</p>`; }
  },

  async pintarTransacoes() {
    const alvo = F.el('f-trans');
    if (!alvo) return;
    const [{ transacoes, contagem }, cad] = await Promise.all([
      F.api('GET', F.url('/transacoes', { banco: F.bancoId, status: F.statusTrans || '', limite: 300 })),
      F.cadastros(),
    ]);
    const porStatus = Object.fromEntries((contagem || []).map((c) => [c.status, c.n]));
    const filtros = [['', 'todas'], ['nova', 'sem sugestão'], ['sugerida', 'com sugestão'], ['conciliada', 'conciliadas'], ['ignorada', 'ignoradas']];

    const opcoesConta = cad.contas.map((c) => `<option value="${F.esc(c.id)}">${F.esc(c.codigo)} ${F.esc(c.nome)}</option>`).join('');
    const opcoesCentro = '<option value="">— sem centro —</option>' +
      cad.centros.map((c) => `<option value="${F.esc(c.id)}">${F.esc(c.codigo)} ${F.esc(c.nome)}</option>`).join('');

    const linhas = transacoes.map((t) => {
      const sug = t.sugestao;
      // A sugestão SEMPRE vem com o motivo. Sugestão sem porquê é palpite,
      // e palpite não entra no razão de ninguém.
      const blocoSug = sug
        ? `<div class="sub" style="margin-top:4px">Sugerido: <b>${F.esc(sug.contaCodigo)} ${F.esc(sug.contaNome)}</b>
             — ${F.esc(sug.motivo)} (confiança ${sug.confianca}%${sug.alta ? ', alta' : ', exige confirmação'})</div>`
        : (t.status === 'conciliada' ? '' : '<div class="sub" style="margin-top:4px">Sem sugestão — escolha a conta.</div>');
      const acoes = t.status === 'conciliada'
        ? '<span class="sub">no razão</span>'
        : t.status === 'ignorada'
          ? '<span class="sub">ignorada</span>'
          : `<select data-conta="${F.esc(t.id)}" style="min-width:190px"><option value="">${sug ? 'usar a sugestão' : 'escolha a conta…'}</option>${opcoesConta}</select>
             <select data-centro="${F.esc(t.id)}" style="min-width:150px;margin-top:4px">${opcoesCentro}</select>
             <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
               <button class="btn" style="padding:6px 12px;min-height:0" onclick="F.conciliar('${F.esc(t.id)}')">Conciliar</button>
               <button class="btn btn-ghost" style="padding:6px 12px;min-height:0" onclick="F.ignorar('${F.esc(t.id)}')">Ignorar</button>
             </div>`;
      return `<tr>
        <td>${F.dt(t.data)}</td>
        <td style="white-space:normal">${F.esc(t.descricao)}${t.contraparte ? `<div class="sub">${F.esc(t.contraparte)}</div>` : ''}${blocoSug}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums${t.valorCents < 0 ? ';color:var(--vx-danger)' : ''}">${F.esc(t.valor)}</td>
        <td style="white-space:normal">${acoes}</td>
      </tr>`;
    }).join('');

    alvo.innerHTML = `
      <div class="menu" style="margin:14px 0 10px">${filtros.map(([v, rot]) =>
        `<button class="btn ${(F.statusTrans || '') === v ? '' : 'btn-ghost'}" style="padding:7px 14px;min-height:0"
          onclick="F.filtrarTrans('${v}')">${rot}${porStatus[v] ? ` (${porStatus[v]})` : ''}</button>`).join('')}</div>
      ${transacoes.length
        ? `<div class="tab-wrap"><table>
             <thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right">Valor</th><th>Classificação</th></tr></thead>
             <tbody>${linhas}</tbody></table></div>`
        : '<div class="card"><p class="sub" style="margin:0">Nenhuma transação neste filtro.</p></div>'}
      <p id="f-tr-msg" class="sub" style="margin-top:10px"></p>`;
  },

  filtrarTrans(v) { F.statusTrans = v; F.pintarTransacoes(); },

  async conciliar(id) {
    const msg = F.el('f-tr-msg'); msg.className = 'sub'; msg.textContent = 'Conciliando…';
    const conta = document.querySelector(`[data-conta="${id}"]`);
    const centro = document.querySelector(`[data-centro="${id}"]`);
    try {
      await F.api('POST', F.url(`/transacoes/${encodeURIComponent(id)}/conciliar`), {
        contaId: (conta && conta.value) || '',
        centroCustoId: (centro && centro.value) || '',
        // Classificação manual vira regra: é o que faz a taxa automática subir.
        aprender: !!(conta && conta.value),
      });
      msg.textContent = '';
      await Promise.all([F.pintarConciliacao(), F.pintarTransacoes()]);
    } catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  },

  async ignorar(id) {
    const motivo = prompt('Por que ignorar esta transação? (vai para a auditoria)', 'não é movimento contábil');
    if (!motivo) return;
    const msg = F.el('f-tr-msg'); msg.className = 'sub'; msg.textContent = 'Ignorando…';
    try {
      await F.api('POST', F.url(`/transacoes/${encodeURIComponent(id)}/ignorar`), { motivo });
      msg.textContent = '';
      await F.pintarTransacoes();
    } catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  },

  async reprocessar() {
    try {
      const r = await F.api('POST', F.url('/classificacao/reprocessar'), {});
      alert(`Reprocessado: ${r.sugeridas || 0} transação(ões) ganharam sugestão.`);
      F.pintar();
    } catch (e) { alert(e.message); }
  },

  async mercadoPago(dryRun) {
    const msg = F.el('f-mp-msg');
    const de = F.el('f-mp-de').value, ate = F.el('f-mp-ate').value;
    if (!de || !ate) { msg.innerHTML = '<p class="erro">Informe o período.</p>'; return; }
    msg.innerHTML = `<p class="sub">${dryRun ? 'Consultando o Mercado Pago…' : 'Importando…'}</p>`;
    try {
      const r = await F.api('POST', F.url(`/bancos/${encodeURIComponent(F.bancoId)}/importar-mercadopago`),
        { desde: de, ate, dryRun });
      const res = r.resumoMp || r.resumo || {};
      const cabeca = r.dryRun
        ? `<b>Prévia — nada foi gravado.</b> ${r.aprovados} pagamento(s) aprovado(s).`
        : (r.importado
            ? `<b>Importado.</b> ${r.resumo.novas} nova(s) · ${r.resumo.duplicadas} já existia(m).`
            : `<b>${F.esc(r.motivo || 'Nada a importar.')}</b>`);
      // O aviso de escopo vai SEMPRE junto: sem ele, a diferença que a
      // conciliação vai acusar pareceria defeito do sistema.
      msg.innerHTML = `<div class="aviso" style="margin:0">${cabeca}
        ${res.bruto ? `<div style="margin-top:6px">bruto ${F.esc(res.bruto)} · tarifas ${F.esc(res.tarifas)} · líquido <b>${F.esc(res.liquido)}</b></div>` : ''}
        <div class="sub" style="margin-top:8px">${F.esc(r.aviso || '')}</div></div>`;
      if (!r.dryRun) await Promise.all([F.pintarConciliacao(), F.pintarTransacoes()]);
    } catch (e) { msg.innerHTML = `<p class="erro">${F.esc(e.message)}</p>`; }
  },

  async importar() {
    const msg = F.el('f-imp-msg');
    const arq = F.el('f-arq');
    if (!arq.files || !arq.files[0]) { msg.innerHTML = '<p class="erro">Escolha o arquivo do extrato.</p>'; return; }
    msg.innerHTML = '<p class="sub">Lendo o arquivo…</p>';
    try {
      const conteudo = await arq.files[0].text();
      const formato = /\.json$/i.test(arq.files[0].name) ? 'json' : 'csv';
      const r = await F.api('POST', F.url(`/bancos/${encodeURIComponent(F.bancoId)}/importar`), {
        conteudo, formato, fonte: F.el('f-fonte').value || arq.files[0].name,
      });
      const s = r.resumo;
      msg.innerHTML = `<div class="aviso" style="margin:0">
        <b>${r.reimportacao ? 'Arquivo já importado antes.' : 'Importado.'}</b>
        ${s.lidas} linha(s) lida(s) · <b>${s.novas}</b> nova(s) · ${s.duplicadas} já existia(m) · ${s.rejeitadas} rejeitada(s).
        ${(r.rejeitos || []).length ? `<div class="sub" style="margin-top:6px">${r.rejeitos.slice(0, 5).map((x) => F.esc(x.erro || String(x))).join('<br>')}</div>` : ''}
      </div>`;
      await Promise.all([F.pintarConciliacao(), F.pintarTransacoes()]);
    } catch (e) { msg.innerHTML = `<p class="erro">${F.esc(e.message)}</p>`; }
  },

  // -------------------------------------------------- CONTAS A PAGAR/RECEBER
  // Título ≠ parcela ≠ liquidação: o título provisiona pela competência, a
  // liquidação é o caixa. A tela mantém essa distinção à vista, porque
  // confundi-las é o que faz o DRE e o extrato divergirem.

  async vTitulos() {
    const especie = F.especie || 'receber';
    const [aging, { titulos }] = await Promise.all([
      F.api('GET', F.url('/aging', { especie })),
      F.api('GET', F.url('/titulos', { especie, status: F.statusTitulo || '', limite: 300 })),
    ]);

    const faixas = aging.faixas.filter((f) => f.quantidade).map((f) => `
      <div class="card" style="flex:1;min-width:150px${f.chave !== 'a_vencer' && f.chave !== 'vence_hoje' && f.totalCents ? ';border-color:var(--vx-warn)' : ''}">
        <div class="sub">${F.esc(f.rotulo)}</div>
        <div style="font-size:1.15rem;font-weight:700;font-variant-numeric:tabular-nums">${F.esc(f.total)}</div>
        <div class="sub">${f.quantidade} parcela(s)</div>
      </div>`).join('');

    const filtros = [['', 'todos'], ['aberto', 'em aberto'], ['parcial', 'parciais'], ['liquidado', 'liquidados'], ['cancelado', 'cancelados']];

    const linhas = titulos.map((t) => `<tr>
      <td>${F.dt(t.proximoVencimento)}</td>
      <td style="white-space:normal"><b>${F.esc(t.contraparte || '—')}</b>
        <div class="sub">${F.esc(t.descricao || '')}${t.documento ? ' · doc ' + F.esc(t.documento) : ''} · competência ${F.esc(t.competencia)}</div></td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(t.valorCents))}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums"><b>${F.esc(t.saldo)}</b></td>
      <td><span class="sub">${F.esc(t.status)}</span><br>
        <button class="btn btn-ghost" style="padding:6px 12px;min-height:0;margin-top:4px" onclick="F.abrirTitulo('${F.esc(t.id)}')">Abrir</button></td>
    </tr>`).join('');

    F.corpo().innerHTML = `
      <div class="menu" style="margin-bottom:12px">
        <button class="btn ${especie === 'receber' ? '' : 'btn-ghost'}" onclick="F.trocarEspecie('receber')">A receber</button>
        <button class="btn ${especie === 'pagar' ? '' : 'btn-ghost'}" onclick="F.trocarEspecie('pagar')">A pagar</button>
      </div>

      <div class="card" style="margin-bottom:12px">
        <h3 style="margin:0 0 4px">Em aberto: ${F.esc(aging.totalAberto)} · vencido: <b>${F.esc(aging.totalVencido)}</b> (${aging.percentualVencido}%)</h3>
        ${F.origem(aging.origem)}
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px">${faixas || '<p class="sub" style="margin:0">Nada em aberto.</p>'}</div>
      </div>

      <details class="card" style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600">Novo título a ${F.esc(especie)}</summary>
        <div id="f-novo-titulo" style="margin-top:12px"><p class="sub">Carregando cadastros…</p></div>
      </details>

      <div class="menu" style="margin-bottom:10px">${filtros.map(([v, rot]) =>
        `<button class="btn ${(F.statusTitulo || '') === v ? '' : 'btn-ghost'}" style="padding:7px 14px;min-height:0"
          onclick="F.filtrarTitulo('${v}')">${rot}</button>`).join('')}</div>

      ${titulos.length
        ? `<div class="tab-wrap"><table>
             <thead><tr><th>Vencimento</th><th>${especie === 'pagar' ? 'Fornecedor' : 'Cliente'}</th>
             <th style="text-align:right">Valor</th><th style="text-align:right">Saldo</th><th></th></tr></thead>
             <tbody>${linhas}</tbody></table></div>`
        : '<div class="card"><p class="sub" style="margin:0">Nenhum título neste filtro.</p></div>'}
      <div id="f-titulo-det" style="margin-top:16px"></div>`;

    F.montarNovoTitulo(especie);
  },

  trocarEspecie(e) { F.especie = e; F.statusTitulo = ''; F.pintar(); },
  filtrarTitulo(v) { F.statusTitulo = v; F.pintar(); },

  async montarNovoTitulo(especie) {
    const alvo = F.el('f-novo-titulo');
    if (!alvo) return;
    const [cad, { contrapartes }] = await Promise.all([
      F.cadastros(),
      F.api('GET', F.url('/contrapartes', { tipo: especie === 'pagar' ? 'fornecedor' : 'cliente' })),
    ]);
    // Natureza esperada do rateio: despesa quando se paga, receita quando se
    // recebe. O serviço aceita outra e avisa; a tela já oferece a certa.
    const prefixo = especie === 'pagar' ? '4.' : '3.';
    const contas = cad.contas.filter((c) => c.codigo.startsWith(prefixo));

    alvo.innerHTML = `<form class="form" id="f-tit-form" style="max-width:100%;padding:0;border:0;box-shadow:none">
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
        <label>${especie === 'pagar' ? 'Fornecedor' : 'Cliente'} *
          <select id="f-t-cp" required><option value="">escolha…</option>${
            contrapartes.map((c) => `<option value="${F.esc(c.id)}">${F.esc(c.nome)}</option>`).join('')}</select></label>
        <label>Documento <input id="f-t-doc" placeholder="NF 1234"></label>
        <label>Descrição <input id="f-t-desc" placeholder="energia de agosto"></label>
        <label>Valor (R$) * <input id="f-t-valor" inputmode="decimal" required placeholder="0,00"></label>
        <label>1º vencimento * <input id="f-t-venc" type="date" required></label>
        <label>Parcelas <input id="f-t-parc" type="number" min="1" max="360" value="1"></label>
        <label>Conta contábil * <select id="f-t-conta" required>${
          contas.map((c) => `<option value="${F.esc(c.id)}">${F.esc(c.codigo)} ${F.esc(c.nome)}</option>`).join('')}</select></label>
        <label>Centro de custo <select id="f-t-centro"><option value="">— sem centro —</option>${
          cad.centros.map((c) => `<option value="${F.esc(c.id)}">${F.esc(c.codigo)} ${F.esc(c.nome)}</option>`).join('')}</select></label>
      </div>
      <p class="sub" style="margin:10px 0 0">O título provisiona pela <b>competência</b> — o caixa só se move na liquidação.
      Parcelamento não perde centavo: a sobra vai na primeira parcela.</p>
      <p style="margin:12px 0 0"><button class="btn" type="submit">Criar título</button></p>
      <p id="f-t-msg" class="erro"></p></form>`;

    F.el('f-tit-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = F.el('f-t-msg'); msg.className = 'erro'; msg.textContent = '';
      const valorCents = F.centavos(F.el('f-t-valor').value);
      try {
        await F.api('POST', F.url('/titulos'), {
          especie,
          contraparteId: F.el('f-t-cp').value,
          documento: F.el('f-t-doc').value,
          descricao: F.el('f-t-desc').value,
          valorCents,
          vencimento: F.el('f-t-venc').value,
          parcelas: { quantidade: Number(F.el('f-t-parc').value) || 1 },
          rateio: [{ contaId: F.el('f-t-conta').value, centroCustoId: F.el('f-t-centro').value, valorCents }],
        });
        F.pintar();
      } catch (e) {
        // Duplicata devolve `podeForcar`: a tela oferece confirmar, em vez de
        // travar quem realmente tem duas notas iguais.
        const d = e.dados && e.dados.detalhe;
        msg.textContent = e.message + (d && d.podeForcar ? ' — se for mesmo outro título, marque "confirmar duplicata".' : '');
        if (d && d.podeForcar && !F.el('f-t-forcar')) {
          msg.insertAdjacentHTML('afterend',
            '<label style="margin-top:8px"><input type="checkbox" id="f-t-forcar" style="width:auto"> confirmar duplicata e criar assim mesmo</label>');
        }
      }
    };
  },

  async abrirTitulo(id) {
    const alvo = F.el('f-titulo-det');
    alvo.innerHTML = '<p class="sub">Carregando…</p>';
    try {
      const t = await F.api('GET', F.url('/titulos/' + encodeURIComponent(id)));
      const { contas: bancos } = await F.api('GET', F.url('/bancos'));

      const parcelas = t.parcelas.map((p) => {
        const saldo = p.saldoCents;
        // Liquidação estornada continua na lista: ela é histórico, não some.
        const liqs = (t.liquidacoesPorParcela[p.id] || []).map((l) =>
          `<div class="sub"${l.estornada ? ' style="text-decoration:line-through;opacity:.65"' : ''}>${F.dt(l.data)} · ${F.esc(F.brl(l.valorCents))}${l.meio ? ' · ' + F.esc(l.meio) : ''}
            ${l.estornada
              ? '<span> — estornada</span>'
              : `<button class="btn btn-ghost" style="padding:3px 8px;min-height:0;font-size:.8rem"
                   onclick="F.estornarLiquidacao('${F.esc(l.id)}','${F.esc(id)}')">estornar</button>`}</div>`).join('');
        return `<tr>
          <td>${p.numero}/${t.parcelas.length}</td>
          <td>${F.dt(p.vencimento)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(p.valorCents))}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(saldo))}</td>
          <td style="white-space:normal"><span class="sub">${F.esc(p.status)}</span>${liqs}
            ${saldo > 0 && t.status !== 'cancelado'
              ? `<button class="btn" style="padding:6px 12px;min-height:0;margin-top:6px"
                   onclick="F.formLiquidar('${F.esc(p.id)}','${F.esc(id)}',${saldo})">Liquidar</button>`
              : ''}</td>
        </tr>`;
      }).join('');

      const rateio = (t.rateio || []).map((r) =>
        `<div class="lin"><code>${F.esc(r.contaCodigo)}</code> ${F.esc(r.contaNome)}
          ${r.centroCodigo ? `· centro ${F.esc(r.centroCodigo)}` : ''} — ${F.esc(F.brl(r.valorCents))}</div>`).join('');

      F._bancos = bancos;
      alvo.innerHTML = `
        <div class="card">
          <h3 style="margin:0 0 4px">${F.esc(t.contraparte ? t.contraparte.nome : '—')} · ${F.esc(t.valor)}</h3>
          <p class="sub" style="margin:0">${F.esc(t.descricao || '')}${t.documento ? ' · doc ' + F.esc(t.documento) : ''} ·
            competência ${F.esc(t.competencia)} · saldo <b>${F.esc(t.saldo)}</b> · ${F.esc(t.status)}
            ${t.origem ? ' · origem ' + F.esc(t.origem) : ''}</p>
          ${t.canceladoEm ? `<div class="aviso" style="margin-top:10px">Cancelado em ${F.dt(t.canceladoEm)} — ${F.esc(t.canceladoMotivo || '')}</div>` : ''}
          <h4 style="margin:14px 0 6px">Parcelas</h4>
          <div class="tab-wrap"><table>
            <thead><tr><th>#</th><th>Vencimento</th><th style="text-align:right">Valor</th><th style="text-align:right">Saldo</th><th>Situação</th></tr></thead>
            <tbody>${parcelas}</tbody></table></div>
          <h4 style="margin:14px 0 6px">Rateio</h4>${rateio || '<p class="sub">—</p>'}
          <div id="f-liq-area" style="margin-top:12px"></div>
          ${t.status !== 'cancelado'
            ? `<p style="margin:14px 0 0"><button class="btn btn-ghost" onclick="F.cancelarTitulo('${F.esc(id)}')">Cancelar título</button>
               <span class="sub"> — cancelar estorna a provisão; não apaga nada.</span></p>` : ''}
        </div>`;
    } catch (e) {
      if (e.message !== 'sessão expirada') alvo.innerHTML = `<p class="erro">${F.esc(e.message)}</p>`;
    }
  },

  formLiquidar(parcelaId, tituloId, saldoCents) {
    const bancos = (F._bancos || []).map((b) => `<option value="${F.esc(b.id)}">${F.esc(b.nome)}</option>`).join('');
    F.el('f-liq-area').innerHTML = `
      <div class="card" style="background:var(--vx-surface-2)">
        <h4 style="margin:0 0 8px">Liquidar parcela</h4>
        <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
          <label>Data * <input id="f-l-data" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
          <label>Valor (R$) * <input id="f-l-valor" inputmode="decimal" value="${(saldoCents / 100).toFixed(2).replace('.', ',')}"></label>
          <label>Juros (R$) <input id="f-l-juros" inputmode="decimal" placeholder="0,00"></label>
          <label>Multa (R$) <input id="f-l-multa" inputmode="decimal" placeholder="0,00"></label>
          <label>Desconto (R$) <input id="f-l-desc" inputmode="decimal" placeholder="0,00"></label>
          <label>Conta bancária <select id="f-l-banco"><option value="">— não informar —</option>${bancos}</select></label>
          <label>Meio <input id="f-l-meio" placeholder="pix, boleto, transferência"></label>
        </div>
        <p class="sub" style="margin:10px 0 0">Juros, multa e desconto vão para contas próprias — juro pago não incha a conta de despesa.
        Baixa parcial é permitida; valor acima do saldo é recusado.</p>
        <p style="margin:12px 0 0">
          <button class="btn" onclick="F.liquidar('${F.esc(parcelaId)}','${F.esc(tituloId)}')">Confirmar liquidação</button>
          <button class="btn btn-ghost" onclick="F.el('f-liq-area').innerHTML=''">Cancelar</button></p>
        <p id="f-l-msg" class="erro"></p>
      </div>`;
  },

  async liquidar(parcelaId, tituloId) {
    const msg = F.el('f-l-msg'); msg.className = 'erro'; msg.textContent = '';
    try {
      await F.api('POST', F.url(`/parcelas/${encodeURIComponent(parcelaId)}/liquidar`), {
        data: F.el('f-l-data').value,
        valorCents: F.centavos(F.el('f-l-valor').value),
        jurosCents: F.centavos(F.el('f-l-juros').value),
        multaCents: F.centavos(F.el('f-l-multa').value),
        descontoCents: F.centavos(F.el('f-l-desc').value),
        contaBancariaId: F.el('f-l-banco').value,
        meio: F.el('f-l-meio').value,
      });
      F.el('f-liq-area').innerHTML = '';
      await F.abrirTitulo(tituloId);
    } catch (e) { msg.textContent = e.message; }
  },

  async estornarLiquidacao(liquidacaoId, tituloId) {
    const motivo = prompt('Motivo do estorno (vai para a auditoria):', '');
    if (!motivo) return;
    try {
      await F.api('POST', F.url(`/liquidacoes/${encodeURIComponent(liquidacaoId)}/estornar`), { motivo });
      await F.abrirTitulo(tituloId);
    } catch (e) { alert(e.message); }
  },

  async cancelarTitulo(id) {
    const motivo = prompt('Motivo do cancelamento (vai para a auditoria):', '');
    if (!motivo) return;
    try {
      await F.api('POST', F.url(`/titulos/${encodeURIComponent(id)}/cancelar`), { motivo });
      F.pintar();
    } catch (e) { alert(e.message); }
  },

  // ------------------------------------------- LANÇAMENTOS E APROVAÇÕES
  // Lançar é partida dobrada de verdade: a tela soma débitos e créditos ao
  // vivo e só libera o botão quando fecham. Corrigir é por ESTORNO — e
  // estorno é ação material, então vira solicitação, não acontece no clique.

  async vLancamentos() {
    const [{ lotes }, { aprovacoes }] = await Promise.all([
      F.api('GET', F.url('/lancamentos', { competencia: F.competencia, limite: 200 })),
      F.api('GET', F.url('/aprovacoes', { status: 'pendente' })),
    ]);

    const pend = aprovacoes.length
      ? `<div class="card" style="margin-bottom:12px;border-color:var(--vx-warn)">
          <h3 style="margin:0 0 8px">${aprovacoes.length} solicitação(ões) aguardando decisão</h3>
          ${aprovacoes.map((a) => F.cartaoAprovacao(a)).join('')}
        </div>`
      : '';

    const linhas = lotes.map((l) => `<tr>
      <td>${l.numero}</td>
      <td>${F.dt(l.data)}</td>
      <td style="white-space:normal">${F.esc(l.memo || '')}<div class="sub">${F.esc(l.origem || 'manual')} · ${F.esc(l.competencia)}</div></td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(l.total_cents))}</td>
      <td><span class="sub">${F.esc(l.status)}</span><br>
        <button class="btn btn-ghost" style="padding:6px 12px;min-height:0;margin-top:4px" onclick="F.abrirLote('${F.esc(l.id)}')">Abrir</button></td>
    </tr>`).join('');

    F.corpo().innerHTML = F.seletorMes('F.lerMes();F.pintar()') + pend + `
      <details class="card" style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600">Novo lançamento manual</summary>
        <div id="f-novo-lote" style="margin-top:12px"><p class="sub">Carregando contas…</p></div>
      </details>
      ${lotes.length
        ? `<div class="tab-wrap"><table>
             <thead><tr><th>Nº</th><th>Data</th><th>Histórico</th><th style="text-align:right">Total</th><th></th></tr></thead>
             <tbody>${linhas}</tbody></table></div>`
        : '<div class="card"><p class="sub" style="margin:0">Nenhum lançamento nesta competência.</p></div>'}
      <div id="f-lote-det" style="margin-top:16px"></div>`;

    F.montarNovoLote();
  },

  cartaoAprovacao(a) {
    const previa = Object.entries(a.previa || {})
      .map(([k, v]) => `${F.esc(k)}: <b>${F.esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</b>`).join(' · ');
    return `<div class="lin">
      <div><b>${F.esc(a.acao)}</b> · ${F.esc(a.valor)} · pedido por ${F.esc(a.solicitante)} em ${F.dt(a.solicitadoEm)}</div>
      <div class="sub">${previa || '—'}${a.motivo ? ' · motivo: ' + F.esc(a.motivo) : ''}</div>
      ${a.posso.pode
        ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
             <button class="btn" style="padding:6px 12px;min-height:0" onclick="F.aprovar('${F.esc(a.id)}')">Aprovar</button>
             <button class="btn btn-ghost" style="padding:6px 12px;min-height:0" onclick="F.recusar('${F.esc(a.id)}')">Recusar</button>
           </div>`
        // Dizer POR QUE não pode vale mais que esconder o botão: quase sempre
        // é segregação de funções, e quem pediu precisa saber que é normal.
        : `<div class="sub" style="margin-top:6px">Você não pode decidir esta: ${F.esc(a.posso.motivo)}</div>`}
    </div>`;
  },

  async aprovar(id) {
    const codigo = prompt('Código do segundo fator (6 dígitos). Ação material exige MFA:', '');
    if (codigo === null) return;
    try {
      const r = await F.api('POST', F.url(`/aprovacoes/${encodeURIComponent(id)}/aprovar`),
        { motivo: 'aprovado no painel' }, { mfa: codigo });
      alert(r && r.resultado ? 'Aprovado e executado.' : 'Aprovado.');
      F.pintar();
    } catch (e) { alert(e.message); }
  },

  async recusar(id) {
    const motivo = prompt('Motivo da recusa (obrigatório, vai para a auditoria):', '');
    if (!motivo) return;
    try {
      await F.api('POST', F.url(`/aprovacoes/${encodeURIComponent(id)}/recusar`), { motivo });
      F.pintar();
    } catch (e) { alert(e.message); }
  },

  async montarNovoLote() {
    const alvo = F.el('f-novo-lote');
    if (!alvo) return;
    const cad = await F.cadastros();
    F._linhasLote = F._linhasLote || [{}, {}];
    const opcoes = cad.contas.map((c) => `<option value="${F.esc(c.id)}">${F.esc(c.codigo)} ${F.esc(c.nome)}</option>`).join('');
    const centros = '<option value="">—</option>' +
      cad.centros.map((c) => `<option value="${F.esc(c.id)}">${F.esc(c.codigo)}</option>`).join('');

    const linhas = F._linhasLote.map((_, i) => `<tr>
      <td><select data-ll-conta="${i}" style="min-width:200px"><option value="">escolha…</option>${opcoes}</select></td>
      <td><select data-ll-centro="${i}" style="min-width:110px">${centros}</select></td>
      <td><input data-ll-deb="${i}" inputmode="decimal" placeholder="0,00" style="min-width:110px" oninput="F.somarLote()"></td>
      <td><input data-ll-cred="${i}" inputmode="decimal" placeholder="0,00" style="min-width:110px" oninput="F.somarLote()"></td>
    </tr>`).join('');

    alvo.innerHTML = `
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <label>Data * <input id="f-ll-data" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>Histórico * <input id="f-ll-memo" placeholder="o que este lançamento registra"></label>
      </div>
      <div class="tab-wrap" style="margin-top:10px"><table>
        <thead><tr><th>Conta</th><th>Centro</th><th>Débito</th><th>Crédito</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>
      <p style="margin:10px 0 0">
        <button class="btn btn-ghost" style="padding:6px 12px;min-height:0" onclick="F.maisLinha()">+ linha</button>
        <span id="f-ll-soma" class="sub" style="margin-left:10px"></span></p>
      <p style="margin:12px 0 0"><button class="btn" id="f-ll-ok" onclick="F.lancar()" disabled>Contabilizar</button></p>
      <p id="f-ll-msg" class="erro"></p>`;
    F.somarLote();
  },

  maisLinha() { F._linhasLote.push({}); F.montarNovoLote(); },

  /**
   * Soma ao vivo e só libera o botão quando débito = crédito. A trava do
   * banco já recusaria, mas descobrir isso depois de preencher tudo é a
   * diferença entre um aviso e uma irritação.
   */
  somarLote() {
    let deb = 0, cred = 0;
    for (let i = 0; i < F._linhasLote.length; i++) {
      const d = document.querySelector(`[data-ll-deb="${i}"]`);
      const c = document.querySelector(`[data-ll-cred="${i}"]`);
      deb += F.centavos(d && d.value);
      cred += F.centavos(c && c.value);
    }
    const soma = F.el('f-ll-soma');
    const ok = F.el('f-ll-ok');
    const fecha = deb === cred && deb > 0;
    if (soma) {
      soma.textContent = `débitos ${F.brl(deb)} · créditos ${F.brl(cred)}` +
        (fecha ? ' · fecha' : ` · diferença ${F.brl(deb - cred)}`);
      soma.className = fecha ? 'sub' : 'erro';
    }
    if (ok) ok.disabled = !fecha;
    return { deb, cred, fecha };
  },

  async lancar() {
    const msg = F.el('f-ll-msg'); msg.textContent = '';
    const linhas = [];
    for (let i = 0; i < F._linhasLote.length; i++) {
      const conta = document.querySelector(`[data-ll-conta="${i}"]`);
      if (!conta || !conta.value) continue;
      const centro = document.querySelector(`[data-ll-centro="${i}"]`);
      const deb = F.centavos((document.querySelector(`[data-ll-deb="${i}"]`) || {}).value);
      const cred = F.centavos((document.querySelector(`[data-ll-cred="${i}"]`) || {}).value);
      if (!deb && !cred) continue;
      linhas.push({ contaId: conta.value, centroCustoId: (centro && centro.value) || '', debitoCents: deb, creditoCents: cred });
    }
    try {
      await F.api('POST', F.url('/lancamentos'), {
        data: F.el('f-ll-data').value, memo: F.el('f-ll-memo').value, linhas,
      });
      F._linhasLote = [{}, {}];
      F.pintar();
    } catch (e) { msg.textContent = e.message; }
  },

  async abrirLote(id) {
    const alvo = F.el('f-lote-det');
    alvo.innerHTML = '<p class="sub">Carregando…</p>';
    try {
      const d = await F.api('GET', F.url('/lancamentos/' + encodeURIComponent(id)));
      const l = d.lote;
      const linhas = d.linhas.map((x) => `<tr>
        <td><code>${F.esc(x.conta_codigo)}</code> ${F.esc(x.conta_nome)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${x.debito_cents ? F.esc(F.brl(x.debito_cents)) : ''}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${x.credito_cents ? F.esc(F.brl(x.credito_cents)) : ''}</td>
        <td class="sub" style="white-space:normal">${F.esc(x.memo || '')}</td>
      </tr>`).join('');

      // Vínculo do estorno nos DOIS sentidos: o original aponta para o
      // espelho e o espelho aponta para o original.
      const vinculo = d.estorno
        ? `<div class="aviso" style="margin-top:10px">Estornado pelo lançamento nº ${d.estorno.numero} de ${F.dt(d.estorno.data)}. O original permanece — estorno compensa, não apaga.</div>`
        : d.estornoDe
          ? `<div class="aviso" style="margin-top:10px">Este é o estorno do lançamento nº ${d.estornoDe.numero}.</div>`
          : '';

      alvo.innerHTML = `<div class="card">
        <h3 style="margin:0 0 4px">Lançamento nº ${l.numero} · ${F.esc(F.brl(l.total_cents))}</h3>
        <p class="sub" style="margin:0">${F.dt(l.data)} · competência ${F.esc(l.competencia)} · ${F.esc(l.status)} · origem ${F.esc(l.origem || 'manual')}</p>
        <p style="margin:8px 0 0">${F.esc(l.memo || '')}</p>
        ${vinculo}
        <div class="tab-wrap" style="margin-top:12px"><table>
          <thead><tr><th>Conta</th><th style="text-align:right">Débito</th><th style="text-align:right">Crédito</th><th>Memo</th></tr></thead>
          <tbody>${linhas}</tbody></table></div>
        ${d.origemDetalhe
          ? `<p class="sub" style="margin-top:10px">Veio do extrato: ${F.dt(d.origemDetalhe.data)} · ${F.esc(d.origemDetalhe.descricao)} · ${F.esc(F.brl(d.origemDetalhe.valor_cents))}</p>`
          : ''}
        ${l.status === 'contabilizado' && !d.estorno
          ? `<p style="margin:14px 0 0"><button class="btn btn-ghost" onclick="F.pedirEstorno('${F.esc(id)}')">Solicitar estorno</button>
             <span class="sub"> — estorno é ação material: precisa da aprovação de outra pessoa com alçada.</span></p>`
          : ''}
      </div>`;
    } catch (e) {
      if (e.message !== 'sessão expirada') alvo.innerHTML = `<p class="erro">${F.esc(e.message)}</p>`;
    }
  },

  async pedirEstorno(id) {
    const motivo = prompt('Motivo do estorno (obrigatório, vai para a auditoria):', '');
    if (!motivo) return;
    try {
      const r = await F.api('POST', F.url(`/lancamentos/${encodeURIComponent(id)}/estornar`), { motivo });
      alert(r.aviso || 'Solicitação registrada.');
      F.pintar();
    } catch (e) { alert(e.message); }
  },

  // ------------------------------------------------------- FECHAMENTO
  // O checklist é a tela inteira: cada item diz o que confere, se passou e
  // o que exatamente falta. Botão de fechar que só diz "não deu" obriga a
  // adivinhar — aqui o bloqueador vem escrito, com o número.

  async vFechamento() {
    const [chk, { periodos: lista }, prev] = await Promise.all([
      F.api('GET', F.url('/fechamento/' + F.competencia)),
      F.api('GET', F.url('/periodos')),
      F.api('GET', F.url('/apuracao/' + F.competencia)).catch(() => null),
    ]);

    const itens = chk.itens.map((i) => `<div class="lin">
      <b style="color:${i.ok ? 'var(--vx-ok, #1B7F4B)' : (i.bloqueia ? 'var(--vx-danger)' : 'var(--vx-warn)')}">${i.ok ? '✓' : (i.bloqueia ? '✗' : '!')}</b>
      ${F.esc(i.titulo)}${i.bloqueia ? '' : ' <span class="sub">(não bloqueia)</span>'}
      <div class="sub">${F.esc(i.detalhe)}</div>
    </div>`).join('');

    const p = (lista || []).find((x) => x.competencia === F.competencia);
    const situacao = p && p.status === 'fechado'
      ? `<div class="aviso"><b>${F.esc(F.competencia)} está FECHADA</b> desde ${F.dt(p.fechado_em)}${p.fechado_por ? ' por ' + F.esc(p.fechado_por) : ''}.
          Nenhum lançamento entra nesta competência — o gatilho do banco recusa. Reabrir é ação material e exige motivo.
          <p style="margin:10px 0 0"><button class="btn btn-ghost" onclick="F.pedirReabertura()">Solicitar reabertura</button></p></div>`
      : `<p style="margin:0 0 12px" class="sub">Competência aberta.</p>`;

    const apur = prev ? `
      <div class="card" style="margin-top:12px">
        <h3 style="margin:0 0 6px">Apuração do resultado</h3>
        <p style="margin:0">${F.esc(prev.tipo)} de <b>${F.esc(prev.resultado)}</b> · ${prev.contas.length} conta(s) de resultado a zerar
          <span class="sub">(${F.esc(prev.desde)} a ${F.esc(prev.ate)})</span></p>
        <div class="aviso" style="margin-top:10px">${F.esc(prev.aviso)}</div>
        <p style="margin:12px 0 0"><button class="btn btn-ghost" onclick="F.pedirApuracao()">Solicitar apuração</button>
          <span class="sub"> — ação material: precisa de aprovação.</span></p>
      </div>` : '';

    F.corpo().innerHTML = F.seletorMes('F.lerMes();F.pintar()') + situacao + `
      <div class="card">
        <h3 style="margin:0 0 10px">Checklist de ${F.esc(F.competencia)}</h3>
        ${itens}
        <p style="margin:14px 0 0">
          ${chk.pode
            ? '<button class="btn" onclick="F.pedirFechamento(false)">Solicitar fechamento</button>'
            : `<button class="btn btn-ghost" onclick="F.pedirFechamento(true)">Solicitar fechamento mesmo assim</button>
               <span class="sub"> — ${chk.bloqueadores.length} bloqueador(es): ${F.esc(chk.bloqueadores.join(' · '))}</span>`}
        </p>
        <p class="sub" style="margin:8px 0 0">Fechar é ação material: vira solicitação e depende da aprovação de outra pessoa com alçada.</p>
      </div>
      ${apur}
      <div class="card" style="margin-top:12px">
        <h3 style="margin:0 0 8px">Competências</h3>
        ${(lista || []).length
          ? `<div class="tab-wrap"><table><thead><tr><th>Competência</th><th>Situação</th><th>Quando</th></tr></thead><tbody>${
              lista.map((x) => `<tr><td>${F.esc(x.competencia)}</td><td>${F.esc(x.status)}</td>
                <td class="sub">${x.fechado_em ? 'fechada ' + F.dt(x.fechado_em) : ''}${x.reaberto_em ? ' · reaberta ' + F.dt(x.reaberto_em) : ''}</td></tr>`).join('')
            }</tbody></table></div>`
          : '<p class="sub" style="margin:0">Nenhuma competência registrada ainda.</p>'}
      </div>`;
  },

  async pedirFechamento(forcar) {
    const motivo = prompt(forcar
      ? 'Há bloqueadores. Justifique o fechamento assim mesmo (vai para a auditoria):'
      : 'Motivo/observação do fechamento (vai para a auditoria):', '');
    if (motivo === null) return;
    try {
      const r = await F.api('POST', F.url('/fechamento/' + F.competencia), { forcar: !!forcar, motivo });
      alert(`Solicitação registrada${r.checklist && !r.checklist.pode ? ' COM bloqueadores — quem aprovar vai vê-los na prévia.' : '.'}`);
      F.pintar();
    } catch (e) { alert(e.message); }
  },

  async pedirReabertura() {
    const motivo = prompt('Reabrir permite lançar em competência já reportada. Motivo (obrigatório):', '');
    if (!motivo) return;
    try { await F.api('POST', F.url(`/periodos/${F.competencia}/reabrir`), { motivo }); F.pintar(); }
    catch (e) { alert(e.message); }
  },

  async pedirApuracao() {
    const motivo = prompt('Motivo da apuração (vai para a auditoria):', `apuração de ${F.competencia}`);
    if (!motivo) return;
    try { await F.api('POST', F.url('/apuracao/' + F.competencia), { motivo }); F.pintar(); }
    catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------------- CFO
  // Nenhuma constatação vem de modelo estatístico nem de IA: todas são
  // determinísticas, a partir do razão. Por isso cada uma mostra os FATOS
  // que a acionaram e — o que quase nenhum painel faz — o que a INVALIDARIA.

  async vCfo() {
    const [b, c] = await Promise.all([
      F.api('GET', F.url('/cfo/briefing', { competencia: F.competencia })),
      F.api('GET', F.url('/conselho', { competencia: F.competencia })).catch(() => null),
    ]);

    const cor = { critica: 'var(--vx-danger)', alta: 'var(--vx-warn)', media: 'var(--vx-border-strong)', informativa: 'var(--vx-border)' };
    const fatos = (o) => Object.entries(o || {})
      .filter(([, v]) => typeof v !== 'object')
      .map(([k, v]) => `<div class="sub">${F.esc(k.replace(/([A-Z])/g, ' $1').toLowerCase())}: <b>${F.esc(String(v))}</b></div>`).join('');

    const constatacoes = b.constatacoes.length
      ? b.constatacoes.map((x) => `
          <div class="card" style="margin-bottom:10px;border-color:${cor[x.gravidade] || 'var(--vx-border)'}">
            <div class="sub" style="text-transform:uppercase;letter-spacing:.05em">${F.esc(x.gravidade)} · confiança ${x.confianca}%</div>
            <h4 style="margin:4px 0 8px">${F.esc(x.titulo)}</h4>
            ${fatos(x.fatos)}
            ${x.acao ? `<p style="margin:8px 0 0"><b>Ação sugerida:</b> ${F.esc(x.acao)}</p>` : ''}
            ${x.invalidaSe ? `<div class="aviso" style="margin:10px 0 0"><b>Isto deixa de valer se:</b> ${F.esc(x.invalidaSe)}</div>` : ''}
          </div>`).join('')
      : '<div class="card"><p class="sub" style="margin:0">Nenhuma constatação neste mês. Detector sem fato não inventa achado.</p></div>';

    const falhas = (b.falhasDeDeteccao || []).length
      ? `<div class="aviso"><b>${b.falhasDeDeteccao.length} detector(es) falharam</b> e por isso este briefing está incompleto:
          ${F.esc(b.falhasDeDeteccao.map((f) => `${f.detector}: ${f.erro}`).join(' · '))}</div>`
      : '';

    const conselhos = c && c.conselhos.length
      ? c.conselhos.map((x) => `
          <div class="card" style="margin-bottom:10px">
            <h4 style="margin:0 0 4px">${F.esc(x.autor)} — ${F.esc(x.principio)}</h4>
            <p style="margin:0"><b>Por que apareceu:</b> ${F.esc(x.contexto)}</p>
            <p style="margin:6px 0 0"><b>Conselho:</b> ${F.esc(x.conselho)}</p>
            ${x.acaoSugerida ? `<p style="margin:6px 0 0"><b>Ação:</b> ${F.esc(x.acaoSugerida)}</p>` : ''}
            <div class="sub" style="margin-top:8px">Origem: ${F.esc(x.dominioDeOrigem)} · conferir em ${F.esc(x.fonte.comoConferir)}</div>
            <div class="sub"><b>Limites:</b> ${F.esc(x.limitacoes)}</div>
            ${x.contraArgumento ? `<div class="sub"><b>Contra-argumento:</b> ${F.esc(x.contraArgumento)}</div>` : ''}
            ${(x.divergencia || []).map((d) => `<div class="aviso" style="margin-top:8px">${F.esc(d.tensao)} — ${F.esc(d.autor)}: ${F.esc(d.principio)}</div>`).join('')}
          </div>`).join('')
      : '<div class="card"><p class="sub" style="margin:0">Nenhum princípio acionado. Princípio sem fato não aparece — é o comportamento correto.</p></div>';

    F.corpo().innerHTML = F.seletorMes('F.lerMes();F.pintar()') + `
      <div class="card" style="margin-bottom:12px">
        <h3 style="margin:0 0 6px">Resultado de ${F.esc(b.competencia)}</h3>
        <p style="margin:0">receita líquida ${F.esc(b.resultado.receitaLiquida)} · despesas ${F.esc(b.resultado.despesas)} ·
          resultado <b>${F.esc(b.resultado.resultado)}</b>${b.resultado.margem == null ? '' : ` · margem ${b.resultado.margem}%`}</p>
        <p class="sub" style="margin:8px 0 0">${F.esc(b.natureza)}</p>
      </div>
      ${falhas}
      <h3 style="margin:16px 0 8px">Constatações (${b.constatacoes.length})</h3>
      ${constatacoes}
      <h3 style="margin:22px 0 4px">Conselho dos Mestres</h3>
      ${c ? `<p class="sub" style="margin:0 0 10px">${F.esc(c.aviso)}</p>` : ''}
      ${conselhos}`;
  },

  // -------------------------------------------------------- RELATÓRIOS
  // Balanço, fluxo de caixa, previsão, resultado por imóvel e orçado ×
  // realizado. Todos já existiam na API e nenhum tinha tela.

  async vRelatorios() {
    const sub = F.subRelatorio || 'balanco';
    const abas = [['balanco', 'Balanço'], ['fluxo', 'Fluxo de caixa'], ['previsao', 'Previsão'],
      ['centros', 'Por imóvel'], ['orcado', 'Orçado × realizado']];
    F.corpo().innerHTML = F.seletorMes('F.lerMes();F.pintar()') + `
      <div class="menu" style="margin-bottom:12px">${abas.map(([id, rot]) =>
        `<button class="btn ${sub === id ? '' : 'btn-ghost'}" style="padding:7px 14px;min-height:0"
          onclick="F.irRelatorio('${id}')">${rot}</button>`).join('')}</div>
      <div id="f-rel"><p class="sub">Carregando…</p></div>`;
    const telas = { balanco: F.rBalanco, fluxo: F.rFluxo, previsao: F.rPrevisao, centros: F.rCentros, orcado: F.rOrcado };
    try { await telas[sub](); }
    catch (e) { if (e.message !== 'sessão expirada') F.el('f-rel').innerHTML = `<p class="erro">${F.esc(e.message)}</p>`; }
  },

  irRelatorio(s) { F.subRelatorio = s; F.pintar(); },

  /** Bloco de contas com total — usado pelos dois lados do balanço. */
  blocoContas(titulo, g) {
    const linhas = (g.contas || []).map((c) =>
      `<div class="lin"><code>${F.esc(c.codigo)}</code> ${F.esc(c.nome)}
        <span style="float:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(c.valorCents))}</span></div>`).join('');
    return `<h4 style="margin:12px 0 4px">${F.esc(titulo)} — ${F.esc(F.brl(g.totalCents))}</h4>${linhas || '<p class="sub">—</p>'}`;
  },

  async rBalanco() {
    const b = await F.api('GET', F.url('/balanco'));
    F.el('f-rel').innerHTML = `
      <div class="card"${b.fecha ? '' : ' style="border-color:var(--vx-danger)"'}>
        <h3 style="margin:0 0 4px">${b.fecha ? 'Balanço fecha' : 'Balanço NÃO fecha — diferença de ' + F.esc(F.brl(b.diferencaCents))}</h3>
        <p class="sub" style="margin:0">ativo ${F.esc(b.ativo.total)} = passivo ${F.esc(b.passivo.total)} + PL ${F.esc(b.patrimonioLiquido.total)} · posição em ${F.dt(b.ate)}</p>
        ${F.origem(b.origem)}
        ${b.origem.observacao ? `<div class="aviso" style="margin-top:10px">${F.esc(b.origem.observacao)}</div>` : ''}
      </div>
      <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:12px">
        <div class="card"><h3 style="margin:0">Ativo — ${F.esc(b.ativo.total)}</h3>
          ${F.blocoContas('Circulante', b.ativo.circulante)}${F.blocoContas('Não circulante', b.ativo.naoCirculante)}</div>
        <div class="card"><h3 style="margin:0">Passivo + PL</h3>
          ${F.blocoContas('Passivo circulante', b.passivo.circulante)}${F.blocoContas('Passivo não circulante', b.passivo.naoCirculante)}
          <h4 style="margin:12px 0 4px">Patrimônio líquido — ${F.esc(b.patrimonioLiquido.total)}</h4>
          ${(b.patrimonioLiquido.contas || []).map((c) => `<div class="lin"><code>${F.esc(c.codigo)}</code> ${F.esc(c.nome)}
            <span style="float:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(c.valorCents))}</span></div>`).join('')}
          <div class="lin"><b>Resultado do exercício</b> <span class="sub">(linha calculada)</span>
            <span style="float:right;font-variant-numeric:tabular-nums"><b>${F.esc(b.patrimonioLiquido.resultadoDoExercicio)}</b></span></div>
        </div>
      </div>`;
  },

  async rFluxo() {
    const metodo = F.metodoFluxo || 'direto';
    const f = await F.api('GET', F.url('/fluxo-caixa', { competencia: F.competencia, metodo }));
    const grupos = (f.grupos || []).map((g) => `<tr>
      <td>${F.esc(g.grupo)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(g.entradasCents || 0))}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(g.saidasCents || 0))}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums"><b>${F.esc(g.liquido || F.brl(g.liquidoCents))}</b></td>
    </tr>`).join('');
    F.el('f-rel').innerHTML = `
      <div class="menu" style="margin-bottom:10px">
        <button class="btn ${metodo === 'direto' ? '' : 'btn-ghost'}" style="padding:6px 12px;min-height:0" onclick="F.trocarMetodo('direto')">Direto</button>
        <button class="btn ${metodo === 'indireto' ? '' : 'btn-ghost'}" style="padding:6px 12px;min-height:0" onclick="F.trocarMetodo('indireto')">Indireto</button>
      </div>
      <div class="card">
        <h3 style="margin:0 0 4px">Fluxo ${F.esc(f.metodo)} · ${F.dt(f.desde)} a ${F.dt(f.ate)}</h3>
        ${f.saldoFinal ? `<p style="margin:0">saldo inicial ${F.esc(F.brl(f.saldoInicialCents || 0))} · variação ${F.esc(F.brl(f.variacaoCents || 0))} · <b>saldo final ${F.esc(f.saldoFinal)}</b></p>` : ''}
        ${F.origem(f.origem)}
        ${f.conciliacao
          ? `<div class="aviso" style="margin-top:10px"><b>Conciliação com o método direto:</b> ${F.esc(
              typeof f.conciliacao === 'string' ? f.conciliacao : JSON.stringify(f.conciliacao))}</div>`
          : ''}
        ${grupos ? `<div class="tab-wrap" style="margin-top:12px"><table>
          <thead><tr><th>Grupo</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saídas</th><th style="text-align:right">Líquido</th></tr></thead>
          <tbody>${grupos}</tbody></table></div>` : ''}
        ${(f.linhas || []).length ? `<div class="tab-wrap" style="margin-top:12px"><table>
          <thead><tr><th>Linha</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${f.linhas.map((l) => `<tr><td>${F.esc(l.rotulo || l.grupo || '')}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(l.valor || F.brl(l.valorCents))}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>`;
  },

  trocarMetodo(m) { F.metodoFluxo = m; F.pintar(); },

  async rPrevisao() {
    const p = await F.api('GET', F.url('/previsao-caixa', { dias: 90 }));
    const cenarios = p.cenarios.map((c) => `
      <div class="card" style="flex:1;min-width:230px${c.faltaCaixa ? ';border-color:var(--vx-danger)' : ''}">
        <div class="sub">${F.esc(c.rotulo)}</div>
        <div style="font-size:1.3rem;font-weight:700;font-variant-numeric:tabular-nums">${F.esc(c.saldoFinal)}</div>
        <div class="sub">menor saldo ${F.esc(c.menorSaldo)} em ${F.dt(c.menorSaldoEm)}</div>
        <div class="sub" style="margin-top:6px">${F.esc(c.premissa)}</div>
      </div>`).join('');
    F.el('f-rel').innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <h3 style="margin:0 0 4px">${F.esc(p.veredito)}</h3>
        <p class="sub" style="margin:0">saldo hoje ${F.esc(p.saldoHoje)} · ${p.parcelasConsideradas} parcela(s) na agenda · horizonte de ${p.horizonteDias} dias</p>
        ${F.origem(p.origem)}
        <div class="aviso" style="margin-top:10px">${F.esc(p.origem.natureza)}</div>
        ${(p.alerta || []).map((a) => `<div class="aviso" style="margin-top:8px">${F.esc(a)}</div>`).join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px">${cenarios}</div>`;
  },

  async rCentros() {
    const r = await F.api('GET', F.url('/resultado-por-centro', { competencia: F.competencia }));
    const linhas = r.linhas.map((l) => `<tr>
      <td><code>${F.esc(l.codigo)}</code> ${F.esc(l.nome)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(l.receitaCents))}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(l.despesaCents))}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums"><b>${F.esc(F.brl(l.resultadoCents))}</b></td>
      <td style="text-align:right">${l.margem == null ? '—' : l.margem + '%'}</td>
    </tr>`).join('');
    F.el('f-rel').innerHTML = `<div class="card">
      <h3 style="margin:0 0 4px">Resultado por imóvel · ${F.esc(r.competencia)}</h3>
      ${F.origem(r.origem)}
      ${r.aviso ? `<div class="aviso" style="margin-top:10px">${F.esc(r.aviso)}</div>` : ''}
      ${r.linhas.length ? `<div class="tab-wrap" style="margin-top:12px"><table>
        <thead><tr><th>Centro</th><th style="text-align:right">Receita</th><th style="text-align:right">Despesa</th>
        <th style="text-align:right">Resultado</th><th style="text-align:right">Margem</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td><b>Total</b></td>
          <td style="text-align:right"><b>${F.esc(F.brl(r.total.receitaCents))}</b></td>
          <td style="text-align:right"><b>${F.esc(F.brl(r.total.despesaCents))}</b></td>
          <td style="text-align:right"><b>${F.esc(F.brl(r.total.resultadoCents))}</b></td><td></td></tr></tfoot>
        </table></div>` : '<p class="sub" style="margin-top:10px">Nenhum movimento com centro de custo nesta competência.</p>'}
    </div>`;
  },

  async rOrcado() {
    const { orcamentos } = await F.api('GET', F.url('/orcamentos'));
    if (!orcamentos.length) {
      F.el('f-rel').innerHTML = `<div class="card"><h3 style="margin:0 0 6px">Nenhum orçamento cadastrado</h3>
        <p class="sub" style="margin:0">Sem orçamento aprovado não há desvio a medir — e o CFO diz isso em vez de inventar uma meta.</p></div>`;
      return;
    }
    let r;
    try { r = await F.api('GET', F.url('/orcado-realizado', { competencia: F.competencia })); }
    catch (e) {
      F.el('f-rel').innerHTML = `<div class="card"><p class="sub" style="margin:0">${F.esc(e.message)}</p></div>`;
      return;
    }
    const linhas = (r.linhas || []).map((l) => `<tr>
      <td><code>${F.esc(l.contaCodigo)}</code> ${F.esc(l.contaNome)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(l.orcadoCents))}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(l.realizadoCents))}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;color:${l.favoravel ? 'inherit' : 'var(--vx-danger)'}">
        ${F.esc(l.desvio || F.brl(l.desvioCents))}${l.percentual == null ? '' : ` (${l.percentual}%)`}</td>
    </tr>`).join('');
    F.el('f-rel').innerHTML = `<div class="card">
      <h3 style="margin:0 0 4px">${F.esc(r.orcamento.nome)} · ${F.esc(r.orcamento.cenario)} · versão ${r.orcamento.versao} <span class="sub">(${F.esc(r.orcamento.status)})</span></h3>
      <p class="sub" style="margin:0">competência ${F.esc(r.competencia)} · resultado orçado ${F.esc(F.brl(r.resumo.resultadoOrcadoCents))} ·
        realizado ${F.esc(F.brl(r.resumo.resultadoRealizadoCents))} · desvio <b>${F.esc(F.brl(r.resumo.desvioResultadoCents))}</b></p>
      ${linhas ? `<div class="tab-wrap" style="margin-top:12px"><table>
        <thead><tr><th>Conta</th><th style="text-align:right">Orçado</th><th style="text-align:right">Realizado</th><th style="text-align:right">Desvio</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>` : '<p class="sub" style="margin-top:10px">Sem linhas nesta competência.</p>'}
      <p class="sub" style="margin-top:10px">O sinal do desvio segue a natureza da conta: gastar menos que o orçado é favorável; receber menos, não.</p>
    </div>`;
  },

  // -------------------------------------------------------------- DRE
  async vDre() {
    const d = await F.api('GET', F.url('/dre', { competencia: F.competencia }));
    const linhas = d.linhas.map((l) => `
      <tr${l.destaque ? ' style="font-weight:700"' : ''}>
        <td>${F.esc(l.rotulo)}${F.origem(l.origem)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(l.valor)}</td>
        <td class="sub">${(l.contas || []).map((c) => F.esc(c.codigo)).join(' · ') || ''}</td>
      </tr>`).join('');

    F.corpo().innerHTML = F.seletorMes('F.lerMes();F.pintar()') + `
      <div class="tab-wrap"><table>
        <thead><tr><th>Linha</th><th style="text-align:right">Valor</th><th>Contas</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
      <p class="sub" style="margin-top:12px">Período de ${F.dt(d.desde)} a ${F.dt(d.ate)} ·
      margem: ${d.resumo.margem == null ? '—' : d.resumo.margem + '%'} ·
      apurado sobre lotes contabilizados do razão, nunca sobre tabela auxiliar.</p>`;
  },

  // ------------------------------------------------------------ RAZÃO
  async vRazao() {
    const { arvore } = await F.api('GET', F.url('/plano-contas'));
    const linhas = [];
    const percorrer = (no, nivel) => {
      const analitica = no.analitica;
      linhas.push(`<tr>
        <td style="padding-left:${8 + nivel * 16}px;white-space:normal">
          ${analitica
            ? `<a href="#" onclick="F.abrirRazao('${F.esc(no.id)}');return false"><code>${F.esc(no.codigo)}</code> ${F.esc(no.nome)}</a>`
            : `<code>${F.esc(no.codigo)}</code> ${F.esc(no.nome)}`}
        </td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(F.brl(no.saldoCents))}</td>
      </tr>`);
      for (const f of no.filhos) percorrer(f, nivel + 1);
    };
    for (const r of arvore) percorrer(r, 0);

    F.corpo().innerHTML = `
      <p class="sub">Saldo de conta sintética é a soma dos filhos. Clique numa conta analítica para ver o razão, lançamento a lançamento.</p>
      <div class="tab-wrap"><table>
        <thead><tr><th>Conta</th><th style="text-align:right">Saldo</th></tr></thead>
        <tbody>${linhas.join('')}</tbody>
      </table></div>
      <div id="f-razao" style="margin-top:16px"></div>`;
  },

  async abrirRazao(contaId) {
    const alvo = F.el('f-razao');
    alvo.innerHTML = '<p class="sub">Carregando o razão…</p>';
    try {
      const r = await F.api('GET', F.url('/razao/' + encodeURIComponent(contaId)));
      if (!r.linhas.length) {
        alvo.innerHTML = `<div class="card"><h3 style="margin:0">${F.esc(r.conta.codigo)} ${F.esc(r.conta.nome)}</h3>
          <p class="sub" style="margin:6px 0 0">Nenhum lançamento nesta conta.</p></div>`;
        return;
      }
      const linhas = r.linhas.map((l) => `<tr>
        <td>${F.dt(l.data)}</td>
        <td style="white-space:normal">${F.esc(l.memo || '')}<div class="sub">lote ${F.esc(String(l.numero))}${l.origem ? ' · ' + F.esc(l.origem) : ''}</div></td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${l.debitoCents ? F.esc(F.brl(l.debitoCents)) : ''}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${l.creditoCents ? F.esc(F.brl(l.creditoCents)) : ''}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums"><b>${F.esc(l.saldoFormatado)}</b></td>
      </tr>`).join('');
      alvo.innerHTML = `
        <h3 style="margin:0 0 8px">${F.esc(r.conta.codigo)} ${F.esc(r.conta.nome)}</h3>
        <div class="tab-wrap"><table>
          <thead><tr><th>Data</th><th>Histórico</th><th style="text-align:right">Débito</th><th style="text-align:right">Crédito</th><th style="text-align:right">Saldo</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>`;
      alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      if (e.message !== 'sessão expirada') alvo.innerHTML = `<p class="erro">${F.esc(e.message)}</p>`;
    }
  },

  // ------------------------------------------------------- MINHA CONTA
  async vConta() {
    const m = await F.api('GET', F.url('/mfa'));
    const e = F.eu;

    F.corpo().innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin:0 0 6px">Acesso</h3>
        <p class="sub" style="margin:0">${F.esc(e.usuario.email)} · perfil ${F.esc(e.perfil ? e.perfil.nome : e.usuario.perfil)} ·
        plano ${F.esc(e.plano.nome)}${e.plano.cortesia ? ' (cortesia)' : ''}</p>
      </div>

      <div class="card" style="margin-bottom:14px">
        <h3 style="margin:0 0 10px">Trocar a senha</h3>
        <form class="form" id="f-senha-form" style="max-width:100%;padding:0;border:0;box-shadow:none">
          <label>Senha atual <input id="f-s-atual" type="password" autocomplete="current-password" required></label>
          <label style="margin-top:10px">Senha nova (mínimo 10 caracteres) <input id="f-s-nova" type="password" autocomplete="new-password" required minlength="10"></label>
          <p style="margin:14px 0 0"><button class="btn" type="submit">Trocar senha</button></p>
          <p id="f-s-msg" class="sub" style="margin-top:8px"></p>
        </form>
      </div>

      <div id="f-assinatura"><p class="sub">Carregando assinatura…</p></div>

      <div class="card">
        <h3 style="margin:0 0 6px">Segundo fator (TOTP)</h3>
        ${F.blocoMfa(m)}
        <div id="f-mfa-area"></div>
      </div>`;

    F.blocoAssinatura();

    F.el('f-senha-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = F.el('f-s-msg'); msg.className = 'sub'; msg.textContent = 'Trocando…';
      try {
        await F.api('POST', '/senha', { senhaAtual: F.el('f-s-atual').value, senhaNova: F.el('f-s-nova').value });
        msg.textContent = 'Senha trocada. A anterior não vale mais — se ela ainda estiver guardada em algum lugar, apague.';
        F.el('f-senha-form').reset();
      } catch (err) { msg.className = 'erro'; msg.textContent = err.message; }
    };
  },

  /** Assinatura e portabilidade, dentro de "Minha conta". */
  async blocoAssinatura() {
    const alvo = F.el('f-assinatura');
    if (!alvo) return;
    const [a, inv] = await Promise.all([
      F.api('GET', F.url('/assinatura')),
      F.api('GET', F.url('/exportar')),
    ]);

    const faturas = a.faturas.length
      ? `<div class="tab-wrap" style="margin-top:10px"><table>
          <thead><tr><th>Competência</th><th style="text-align:right">Valor</th><th>Situação</th></tr></thead>
          <tbody>${a.faturas.map((f) => `<tr><td>${F.esc(f.competencia)}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums">${F.esc(f.valor)}</td>
            <td>${F.esc(f.status)}${f.pagoEm ? ' em ' + F.dt(f.pagoEm) : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="sub" style="margin:10px 0 0">Nenhuma fatura ainda.</p>';

    const planos = a.planosDisponiveis.map((p) =>
      `<option value="${F.esc(p.slug)}"${a.plano && p.slug === a.plano.slug ? ' selected' : ''}>${F.esc(p.nome)} — ${F.esc(p.preco)}/mês</option>`).join('');

    const acao = a.conta.cortesia
      ? '<p class="sub" style="margin:10px 0 0">Conta de cortesia do grupo — sem cobrança.</p>'
      : a.assinatura && a.assinatura.status === 'ativa'
        ? `<p style="margin:12px 0 0"><button class="btn btn-ghost" onclick="F.cancelarAssinatura()">Cancelar assinatura</button></p>`
        : a.pagamentoOnline
          ? `<p style="margin:12px 0 0">
              <label style="width:auto;display:inline-block">Plano <select id="f-as-plano" style="width:auto">${planos}</select></label>
              <button class="btn" onclick="F.assinar()">Assinar</button></p>`
          : '<div class="aviso" style="margin-top:10px">O pagamento online ainda não está ligado. Fale com o suporte para receber a cobrança por Pix ou boleto.</div>';

    alvo.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin:0 0 6px">Assinatura</h3>
        <p style="margin:0">Conta <b>${F.esc(a.conta.status)}</b>${a.plano ? ` · plano ${F.esc(a.plano.nome)} (${F.esc(a.plano.preco)}/mês)` : ''}
          ${a.assinatura ? ` · assinatura ${F.esc(a.assinatura.status)}${a.assinatura.recorrenciaOnline ? ', recorrente' : ''}` : ''}
          ${a.conta.trialAte ? ` · avaliação até ${F.dt(a.conta.trialAte)}` : ''}</p>
        <div class="aviso" style="margin-top:10px">
          Escrita: <b>${F.esc(a.consequencias.escrita)}</b>. Leitura e exportação: <b>${F.esc(a.consequencias.leituraEExportacao)}</b>.
          Suspensão só depois de ${F.esc(a.consequencias.prazoAteSuspender)}.
        </div>
        ${acao}
        ${faturas}
        <p id="f-as-msg" class="sub" style="margin-top:8px"></p>
      </div>

      <div class="card">
        <h3 style="margin:0 0 6px">Seus dados, seus</h3>
        <p class="sub" style="margin:0">${F.esc(inv.aviso)}</p>
        <p style="margin:8px 0 0">${inv.lotes} lançamento(s) · ${inv.linhas} linha(s) · ${inv.contas} conta(s) ·
          ${inv.titulos} título(s) · ${inv.transacoesBanco} transação(ões) de extrato · ${inv.periodos} competência(s)</p>
        <p style="margin:12px 0 0">
          <a class="btn btn-ghost" href="/finance/api/exportar/razao.csv${F.empresaId ? '?empresa=' + encodeURIComponent(F.empresaId) : ''}">Baixar o razão (CSV)</a>
          <a class="btn btn-ghost" href="/finance/api/exportar/completo.json${F.empresaId ? '?empresa=' + encodeURIComponent(F.empresaId) : ''}">Baixar tudo (JSON)</a></p>
        <p class="sub" style="margin:8px 0 0">O pacote JSON traz a <b>conferência embutida</b>: quem recebe soma as linhas e compara,
        sem precisar confiar em nós. Dado bancário de favorecido não vai junto.</p>
      </div>`;
  },

  async assinar() {
    const msg = F.el('f-as-msg'); msg.className = 'sub'; msg.textContent = 'Falando com o Mercado Pago…';
    try {
      const r = await F.api('POST', F.url('/assinatura'), { plano: F.el('f-as-plano').value });
      msg.innerHTML = `Assinatura criada. <a href="${F.esc(r.link)}">Concluir o pagamento no Mercado Pago</a> —
        a conta é ativada quando o Mercado Pago confirmar, não ao clicar.`;
    } catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  },

  async cancelarAssinatura() {
    const motivo = prompt('Cancelar a assinatura. Motivo (vai para a auditoria):', '');
    if (!motivo) return;
    const msg = F.el('f-as-msg'); msg.className = 'sub'; msg.textContent = 'Cancelando…';
    try {
      const r = await F.api('POST', F.url('/assinatura/cancelar'), { motivo });
      msg.textContent = `${r.aviso || 'Assinatura cancelada.'} ${r.leitura}`;
      F.eu = await F.api('GET', F.url('/eu'));
      F.vConta();
    } catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  },

  blocoMfa(m) {
    if (!m.configurado) return `<div class="aviso">${F.esc(m.aviso || 'O segundo fator não está disponível neste servidor.')}</div>`;
    if (m.ativo) {
      return `<p style="margin:0 0 10px">Ativo desde ${F.dt(m.ativadoEm)}. Ações materiais (pagamento, fechamento, estorno) exigem o código.</p>
        <label style="max-width:220px">Código de 6 dígitos para desativar <input id="f-mfa-off" inputmode="numeric" maxlength="6"></label>
        <p style="margin:10px 0 0"><button class="btn btn-ghost" onclick="F.desativarMfa()">Desativar</button></p>
        <p id="f-mfa-msg" class="sub"></p>`;
    }
    return `<p style="margin:0 0 10px">Ainda não está ativo. Sem ele, as ações materiais são recusadas.</p>
      <p style="margin:0"><button class="btn" onclick="F.iniciarMfa()">Ativar segundo fator</button></p>
      <p id="f-mfa-msg" class="sub"></p>`;
  },

  async iniciarMfa() {
    const msg = F.el('f-mfa-msg'); msg.className = 'sub'; msg.textContent = 'Gerando…';
    try {
      const r = await F.api('POST', '/mfa/iniciar', {});
      msg.textContent = '';
      // Sem imagem de QR: gerar QR exigiria uma dependência nova, e o
      // módulo não aceita dependência sem ADR. A entrada manual do
      // segredo funciona em todos os aplicativos autenticadores.
      F.el('f-mfa-area').innerHTML = `
        <div class="aviso" style="margin-top:12px">
          <p style="margin:0 0 8px"><b>1.</b> No seu aplicativo autenticador, escolha <i>inserir chave manualmente</i> e use:</p>
          <p style="margin:0 0 4px">Conta: <code>Villela Finance:${F.esc(F.eu.usuario.email)}</code></p>
          <p style="margin:0 0 8px">Chave: <code style="font-size:1.05rem;letter-spacing:.06em">${F.esc(r.segredo)}</code></p>
          <p style="margin:0 0 10px" class="sub">Este segredo não será mostrado de novo. Em celular, este link também funciona:
            <a href="${F.esc(r.uri)}">abrir no autenticador</a>.</p>
          <p style="margin:0 0 6px"><b>2.</b> Confirme com o código atual:</p>
          <label style="max-width:220px"><input id="f-mfa-cod" inputmode="numeric" maxlength="6" placeholder="000000"></label>
          <p style="margin:10px 0 0"><button class="btn" onclick="F.confirmarMfa()">Confirmar e ativar</button></p>
        </div>`;
    } catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  },

  async confirmarMfa() {
    const msg = F.el('f-mfa-msg'); msg.className = 'sub'; msg.textContent = 'Conferindo…';
    try {
      await F.api('POST', '/mfa/confirmar', { codigo: F.el('f-mfa-cod').value });
      F.vConta();
    } catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  },

  async desativarMfa() {
    const msg = F.el('f-mfa-msg'); msg.className = 'sub'; msg.textContent = 'Desativando…';
    try {
      await F.api('POST', '/mfa/desativar', { codigo: F.el('f-mfa-off').value });
      F.vConta();
    } catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  },
};

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => F.iniciar());
