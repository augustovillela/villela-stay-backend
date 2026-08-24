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
  async api(metodo, caminho, corpo) {
    const opt = { method: metodo, credentials: 'same-origin', headers: {} };
    if (corpo !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(corpo);
    }
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
    const abas = [['cockpit', 'Painel'], ['dre', 'DRE'], ['razao', 'Razão'], ['conta', 'Minha conta']];
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
    const telas = { cockpit: F.vCockpit, dre: F.vDre, razao: F.vRazao, conta: F.vConta };
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

      <div class="card">
        <h3 style="margin:0 0 6px">Segundo fator (TOTP)</h3>
        ${F.blocoMfa(m)}
        <div id="f-mfa-area"></div>
      </div>`;

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
