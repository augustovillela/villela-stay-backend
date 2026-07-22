/* =====================================================================
 * Villela Stay Manager — SPA do assinante (app de gestão real).
 * Servido em /gestao/app.js e inicializado por bootGestao() no shell do
 * painel (paginas.js). Fala com /gestao/api (control plane) e
 * /gestao/api/app (mini-PMS multi-tenant). Sem build, JS clássico.
 * ===================================================================== */
(function () {
  'use strict';
  var ME = null;
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
  function dt(t) { return t ? String(t).slice(0, 10).split('-').reverse().join('/') : '—'; }
  function centavos(v) { return Math.round(Number(String(v).replace(',', '.') || 0) * 100); }
  function el(id) { return document.getElementById(id); }
  function val(id) { var e = el(id); return e ? e.value : ''; }

  function api(m, p, b) {
    return fetch('/gestao/api' + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d && d.erro || ('erro ' + r.status)); return d; }); });
  }
  var app = function (m, p, b) { return api(m, '/app' + p, b); };

  var root = function () { return el('app'); };
  var view = function () { return el('c'); };
  function setView(html) { var v = view(); if (v) v.innerHTML = html; }

  // catálogo de abas do app: [navId, módulo do plano, rótulo, view]
  var TABS = [
    ['imoveis', 'imoveis', '🏠 Imóveis', vImoveis],
    ['consultas', 'reservas', '📨 Consultas', vConsultas],
    ['reservas', 'reservas', '📅 Reservas', vReservas],
    ['canais', 'canais', '🔗 Canais', vCanais],
    ['limpeza', 'limpeza', '🧹 Limpezas', vLimpezas],
    ['manutencao', 'manutencao', '🛠️ Manutenção', vManutencao],
    ['financeiro', 'financeiro', '💰 Financeiro', vFinanceiro],
    ['precificacao', 'precificacao', '💲 Preços', vPrecificacao],
    ['hospede', 'hospede', '👥 Hóspedes', vHospedes],
    ['estoque', 'estoque', '📦 Estoque', vEstoque],
  ];

  // ---------------- login / boot ----------------
  function bootGestao() {
    api('GET', '/me').then(render).catch(renderLogin);
  }
  function renderLogin() {
    root().innerHTML = '<div class="card"><h3>Entrar</h3>' +
      '<input id="em" type="email" placeholder="E-mail"><input id="sn" type="password" placeholder="Senha">' +
      '<button class="btn" id="b-entrar">Entrar</button><p id="msg" class="erro"></p>' +
      '<p class="sub">Novo por aqui? <a href="/gestao/assinar?plano=trial">Teste grátis</a>.</p></div>';
    el('b-entrar').onclick = function () {
      el('msg').textContent = '';
      api('POST', '/login', { email: val('em'), senha: val('sn') }).then(bootGestao).catch(function (e) { el('msg').textContent = e.message; });
    };
  }
  function sair() { api('POST', '/logout').catch(function () {}).then(function () { location.reload(); }); }

  function render(me) {
    ME = me; var ent = me.entitlements; var st = me.operacao.status;
    var liberado = !!(ent && ent.acesso_liberado); // usa o flag do backend (cobre trial/ativa/cortesia)
    var alerta = !liberado
      ? '<div class="aviso">⚠️ Sua conta está <b>' + esc(st) + '</b>. Regularize a cobrança para voltar a usar o sistema.</div>'
      : (st === 'trial' ? '<div class="aviso">🎁 Período de teste até <b>' + dt(ent.trial_expira_em) + '</b>. Assine para continuar sem interrupção.</div>' : '');
    var tabs = liberado ? TABS.filter(function (t) { return ent.modulos.indexOf(t[1]) >= 0; }) : [];
    var nav = '<button class="btn g peq" data-nav="painel">📊 Painel</button>' +
      tabs.map(function (t) { return '<button class="btn g peq" data-nav="' + t[0] + '">' + t[2] + '</button>'; }).join('') +
      '<button class="btn g peq" data-nav="plano">💳 Plano</button><button class="btn g peq" data-nav="uso">📈 Uso</button>' +
      (liberado ? '<button class="btn g peq" data-nav="integracoes">🔌 API</button>' : '') +
      '<button class="btn g peq" data-nav="suporte">🎧 Suporte</button>';
    root().innerHTML = '<div class="card"><h3>' + esc(me.operacao.nome) + ' <span class="tag">' + esc(ent.plano || '—') + '</span></h3>' + alerta +
      '<div class="menu" id="nav">' + nav + '</div>' +
      '<p class="sub">Olá, ' + esc(me.usuario.nome || me.usuario.email) + ' · <button class="btn secund peq" id="pwa-btn" style="display:none" title="Instalar o Villela Stay Manager como app no celular">📲 Instalar app</button> <button class="btn secund peq" id="push-btn" style="display:none" title="Receber avisos de novas reservas no celular">🔔 Avisos</button> <a href="#" id="b-sair">sair</a></p></div><div id="c"></div>';
    el('b-sair').onclick = function (e) { e.preventDefault(); sair(); };
    pintarBotaoPush();
    pintarBotaoInstalar();
    var map = { painel: vPainel, plano: vPlano, uso: vUso, suporte: vSuporte, integracoes: vIntegracoes };
    TABS.forEach(function (t) { map[t[0]] = t[3]; });
    Array.prototype.forEach.call(document.querySelectorAll('#nav [data-nav]'), function (b) {
      b.onclick = function () { (map[b.getAttribute('data-nav')] || vPainel)(); };
    });
    (liberado ? vPainel : vPlano)();
  }

  // ---- instalar como app (PWA) — prompt no Android/Chrome, instrução no iPhone ----
  var PWA_EVT = null; // beforeinstallprompt pode disparar antes de render() montar o painel
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); PWA_EVT = e; pintarBotaoInstalar(); });
  function emModoApp() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  function ehIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  function pintarBotaoInstalar() {
    var btn = el('pwa-btn');
    if (!btn) return;
    if (emModoApp()) { btn.style.display = 'none'; return; }
    if (PWA_EVT || ehIOS()) { btn.style.display = ''; btn.onclick = instalarApp; }
  }
  function instalarApp() {
    if (PWA_EVT) {
      PWA_EVT.prompt();
      PWA_EVT.userChoice.catch(function () { return null; }).then(function (r) {
        if (r && r.outcome === 'accepted') { PWA_EVT = null; pintarBotaoInstalar(); }
      });
      return;
    }
    alert('Para instalar no iPhone:\n1. Toque em Compartilhar (o quadrado com a seta ↑)\n2. Escolha "Adicionar à Tela de Início"');
  }

  // ---- notificações push do painel (PWA) — avisos de novas reservas no celular ----
  function pushOk() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
  function b64ParaU8(b) {
    var pad = '='.repeat((4 - b.length % 4) % 4);
    var s = (b + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(s); var a = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
    return a;
  }
  function pushAssinado() {
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).catch(function () { return null; });
  }
  function pintarBotaoPush() {
    var btn = el('push-btn');
    if (!btn || !pushOk()) return;
    pushAssinado().then(function (sub) {
      btn.style.display = '';
      btn.textContent = sub ? '🔔 Avisos ✓' : '🔔 Avisos';
      btn.title = sub ? 'Notificações ativadas — toque para desativar' : 'Receber avisos de novas reservas no celular';
      btn.onclick = function () { alternarPush(); };
    });
  }
  function alternarPush() {
    pushAssinado().then(function (sub) {
      if (sub) {
        return app('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(function () {})
          .then(function () { return sub.unsubscribe(); });
      }
      return app('GET', '/push/chave').then(function (d) {
        if (!d.publicKey) { alert('As notificações ainda não estão disponíveis. Tente mais tarde.'); return; }
        return Notification.requestPermission().then(function (perm) {
          if (perm !== 'granted') { alert('Permissão negada. Libere as notificações deste site nas configurações do navegador.'); return; }
          return navigator.serviceWorker.ready.then(function (reg) {
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaU8(d.publicKey) });
          }).then(function (nova) { return app('POST', '/push/subscribe', { subscription: nova.toJSON() }); });
        });
      });
    }).catch(function (e) { alert(e.message); }).then(function () { pintarBotaoPush(); });
  }

  function erroBox(e) { setView('<div class="card erro">' + esc(e.message || e) + '</div>'); }
  function imovelOptions(imoveis, sel) {
    return imoveis.map(function (i) { return '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.nome) + '</option>'; }).join('');
  }

  // ---------------- painel ----------------
  function vPainel() {
    app('GET', '/painel').then(function (d) {
      var p = d.painel, f = p.financeiro_mes;
      var kpi = function (r, v) { return '<div class="kpi"><div class="sub">' + r + '</div><div style="font-size:1.4rem;font-weight:700">' + v + '</div></div>'; };
      setView('<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin:.4rem 0">' +
        kpi('Imóveis', p.imoveis) + kpi('Consultas abertas', p.consultas_abertas || 0) + kpi('Reservas ativas', p.reservas_ativas) + kpi('Check-ins 7d', p.checkins_7d) +
        kpi('Check-outs 7d', p.checkouts_7d) + kpi('Limpezas pendentes', p.limpezas_pendentes) + kpi('Manutenção aberta', p.manutencao_aberta) +
        kpi('Etapas pendentes 7d', p.etapas_pendentes || 0) + kpi('Estoque em falta', p.estoque_em_falta || 0) +
        kpi('Receita do mês', brl(f.receita_centavos)) + kpi('Resultado do mês', brl(f.resultado_centavos)) + '</div>' +
        '<div class="card"><h3>Próximas reservas</h3>' + (p.proximas.length
          ? '<table><tr><th>Imóvel</th><th>Hóspede</th><th>Check-in</th><th>Check-out</th><th></th></tr>' +
            p.proximas.map(function (r) { return '<tr><td>' + esc(r.imovel_nome || '—') + '</td><td>' + esc(r.hospede_nome || '—') + '</td><td>' + dt(r.checkin) + '</td><td>' + dt(r.checkout) + '</td><td><span class="tag">' + esc(r.status) + '</span></td></tr>'; }).join('') + '</table>'
          : '<p class="sub">Sem reservas futuras. Cadastre imóveis e lance reservas nas abas acima.</p>') + '</div>');
    }).catch(erroBox);
  }

  // ---------------- imóveis ----------------
  function vImoveis() {
    app('GET', '/imoveis').then(function (d) {
      var linhas = d.imoveis.map(function (i) {
        return '<tr><td>' + esc(i.nome) + (i.ativo ? '' : ' <span class="tag">inativo</span>') + '</td><td>' + esc(i.tipo) + '</td><td>' + i.capacidade + '</td><td>' + brl(i.tarifa_base_centavos) + '</td>' +
          '<td><button class="btn secund peq" data-tg="' + i.id + '" data-at="' + (i.ativo ? 0 : 1) + '">' + (i.ativo ? 'Desativar' : 'Ativar') + '</button> <button class="btn secund peq" data-rm="' + i.id + '">Excluir</button></td></tr>';
      }).join('');
      setView('<div class="card"><h3>Novo imóvel</h3><div class="hi-grid">' +
        '<label>Nome <input id="im-nome"></label><label>Tipo <select id="im-tipo"><option>casa</option><option>apartamento</option><option>flat</option><option>quarto</option><option>chale</option><option>pousada</option></select></label>' +
        '<label>Quartos <input id="im-q" type="number" value="1"></label><label>Capacidade <input id="im-cap" type="number" value="2"></label>' +
        '<label>Tarifa base (R$/noite) <input id="im-tar" type="number" step="0.01"></label></div>' +
        '<button class="btn" id="b-im">Cadastrar</button><p id="im-msg" class="erro"></p></div>' +
        '<div class="card"><h3>Imóveis (' + d.imoveis.length + ')</h3>' + (d.imoveis.length ? '<table><tr><th>Nome</th><th>Tipo</th><th>Cap.</th><th>Tarifa</th><th></th></tr>' + linhas + '</table>' : '<p class="sub">Nenhum imóvel ainda.</p>') + '</div>');
      el('b-im').onclick = function () {
        el('im-msg').textContent = '';
        app('POST', '/imoveis', { nome: val('im-nome'), tipo: val('im-tipo'), quartos: val('im-q'), capacidade: val('im-cap'), tarifa_base_centavos: centavos(val('im-tar')) })
          .then(vImoveis).catch(function (e) { el('im-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-tg]'), function (b) { b.onclick = function () { app('PATCH', '/imoveis/' + b.getAttribute('data-tg'), { ativo: b.getAttribute('data-at') === '1' }).then(vImoveis).catch(function (e) { alert(e.message); }); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-rm]'), function (b) { b.onclick = function () { if (confirm('Excluir este imóvel?')) app('DELETE', '/imoveis/' + b.getAttribute('data-rm')).then(vImoveis).catch(function (e) { alert(e.message); }); }; });
    }).catch(erroBox);
  }

  // ---------------- consultas (mini-funil pré-reserva) ----------------
  var cvAberta = null; // consulta com o painel de conversão aberto
  function vConsultas() {
    Promise.all([app('GET', '/consultas'), app('GET', '/imoveis')]).then(function (rs) {
      var consultas = rs[0].consultas, imoveis = rs[1].imoveis;
      var corSt = { nova: '#e6f1f4', respondida: '#fdf3d7', pendencia: '#fde9d7', convertida: '#e1f5e4', perdida: '#f1f1f1' };
      var linhas = consultas.map(function (c) {
        var acoes = '';
        if (c.status !== 'convertida' && c.status !== 'perdida') {
          if (c.status === 'nova') acoes += '<button class="btn secund peq" data-st="' + c.id + '" data-to="respondida">✉️ Respondida</button> ';
          if (c.status !== 'pendencia') acoes += '<button class="btn secund peq" data-st="' + c.id + '" data-to="pendencia">⏳ Pendência</button> ';
          acoes += '<button class="btn secund peq" data-cv="' + c.id + '">✅ Converter</button> <button class="btn secund peq" data-st="' + c.id + '" data-to="perdida">✖ Perdida</button>';
        } else if (c.status === 'convertida') acoes = '🎉';
        return '<tr><td>' + esc(c.hospede_nome) + (c.contato ? '<br><span class="sub" style="margin:0">' + esc(c.contato) + '</span>' : '') + '</td>' +
          '<td>' + esc(c.imovel_nome || '—') + '</td><td>' + (c.checkin ? dt(c.checkin) + '→' + dt(c.checkout) : '—') + '</td>' +
          '<td>' + (c.valor_cotado_centavos ? brl(c.valor_cotado_centavos) : '—') + '</td><td><span class="tag">' + esc(c.canal) + '</span></td>' +
          '<td><span class="tag" style="background:' + (corSt[c.status] || '#eee') + '">' + esc(c.status) + '</span></td><td>' + acoes + '</td></tr>';
      }).join('');
      setView('<div class="card"><h3>Nova consulta</h3>' +
        '<p class="sub" style="text-align:left;margin:0 0 8px">Interessado que ainda não fechou (Airbnb, WhatsApp, Instagram…). O funil: nova → respondida → pendência → convertida em reserva.</p>' +
        '<div class="hi-grid"><label>Nome do interessado <input id="cv-nome"></label>' +
        '<label>Contato (tel/e-mail/perfil) <input id="cv-cont"></label>' +
        '<label>Canal <select id="cv-can"><option>airbnb</option><option>booking</option><option>direto</option><option>instagram</option><option>outro</option></select></label>' +
        '<label>Imóvel (se já souber) <select id="cv-im"><option value="">(a definir)</option>' + imovelOptions(imoveis) + '</select></label>' +
        '<label>Check-in <input id="cv-ci" type="date"></label><label>Check-out <input id="cv-co" type="date"></label>' +
        '<label>Valor cotado (R$) <input id="cv-val" type="number" step="0.01"></label></div>' +
        '<label>Observações <input id="cv-obs" placeholder="o que o interessado perguntou / combinado"></label>' +
        '<button class="btn" id="b-cv">Registrar consulta</button><p id="cv-msg" class="erro"></p></div>' +
        '<div id="cv-panel"></div>' +
        '<div class="card"><h3>Consultas (' + consultas.length + ')</h3>' + (consultas.length
          ? '<table><tr><th>Interessado</th><th>Imóvel</th><th>Datas</th><th>Cotação</th><th>Canal</th><th>Status</th><th></th></tr>' + linhas + '</table>'
          : '<p class="sub">Nenhuma consulta. Registre aqui cada interessado antes de virar reserva — nada se perde no caminho.</p>') + '</div>');
      el('b-cv').onclick = function () {
        el('cv-msg').textContent = '';
        app('POST', '/consultas', { hospede_nome: val('cv-nome'), contato: val('cv-cont'), canal: val('cv-can'), imovel_id: val('cv-im'), checkin: val('cv-ci'), checkout: val('cv-co'), valor_cotado_centavos: centavos(val('cv-val')), obs: val('cv-obs') })
          .then(vConsultas).catch(function (e) { el('cv-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-st]'), function (b) {
        b.onclick = function () { app('POST', '/consultas/' + b.getAttribute('data-st') + '/status', { status: b.getAttribute('data-to') }).then(vConsultas).catch(function (e) { alert(e.message); }); };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-cv]'), function (b) {
        b.onclick = function () { var id = b.getAttribute('data-cv'); cvAberta = (cvAberta === id) ? null : id; pintarConversao(imoveis, consultas); };
      });
      pintarConversao(imoveis, consultas);
    }).catch(erroBox);
  }
  function pintarConversao(imoveis, consultas) {
    var box = el('cv-panel');
    if (!box) return;
    if (!cvAberta) { box.innerHTML = ''; return; }
    var c = null;
    consultas.forEach(function (x) { if (x.id === cvAberta) c = x; });
    if (!c) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="card"><h3>✅ Converter em reserva — ' + esc(c.hospede_nome) + '</h3>' +
      '<div class="hi-grid"><label>Imóvel <select id="cx-im">' + imovelOptions(imoveis, c.imovel_id) + '</select></label>' +
      '<label>Check-in <input id="cx-ci" type="date" value="' + esc(c.checkin || '') + '"></label>' +
      '<label>Check-out <input id="cx-co" type="date" value="' + esc(c.checkout || '') + '"></label>' +
      '<label>Valor total (R$) <input id="cx-val" type="number" step="0.01" value="' + (c.valor_cotado_centavos ? (c.valor_cotado_centavos / 100) : '') + '"></label>' +
      '<label>Status <select id="cx-st"><option value="confirmada">confirmada</option><option value="pendente">pendente</option></select></label></div>' +
      '<button class="btn" id="b-cx">Criar a reserva</button><p id="cx-msg" class="erro"></p>' +
      '<p class="sub" style="text-align:left;margin:0">A reserva nasce com anti-overbooking, limpeza de check-out, receita e checklist de etapas.</p></div>';
    el('b-cx').onclick = function () {
      el('cx-msg').textContent = '';
      app('POST', '/consultas/' + c.id + '/converter', { imovel_id: val('cx-im'), checkin: val('cx-ci'), checkout: val('cx-co'), valor_centavos: centavos(val('cx-val')), status: val('cx-st') })
        .then(function () { cvAberta = null; vConsultas(); }).catch(function (e) { el('cx-msg').textContent = e.message; });
    };
  }

  // ---------------- precificação assistida ----------------
  function vPrecificacao() {
    app('GET', '/imoveis').then(function (d) {
      var imoveis = d.imoveis.filter(function (i) { return i.ativo; });
      if (!imoveis.length) { setView('<div class="card"><p class="aviso">Cadastre um imóvel primeiro (aba Imóveis).</p></div>'); return; }
      setView('<div class="card"><h3>💲 Preço mínimo com lucro</h3>' +
        '<p class="sub" style="text-align:left;margin:0 0 8px">Fórmula: (custos fixos da estadia ÷ noites + custo por noite) ÷ (1 − comissão − imposto − margem). O imposto (DARF/DAS — confirme a alíquota com seu contador) entra DENTRO do preço: sem susto no fim do mês.</p>' +
        '<div class="hi-grid"><label>Imóvel <select id="pr-im">' + imovelOptions(imoveis) + '</select></label>' +
        '<label>Faxina (R$/estadia) <input id="pr-fx" type="number" step="0.01"></label>' +
        '<label>Lavanderia (R$/estadia) <input id="pr-lv" type="number" step="0.01"></label>' +
        '<label>Kit/insumos (R$/estadia) <input id="pr-in" type="number" step="0.01"></label>' +
        '<label>Custo por noite (R$) <input id="pr-cn" type="number" step="0.01" title="luz, gás, internet rateados"></label>' +
        '<label>Comissão do canal (%) <input id="pr-cm" type="number" step="0.1"></label>' +
        '<label>Imposto (%) <input id="pr-ip" type="number" step="0.1" title="alíquota efetiva — confirme com o contador"></label>' +
        '<label>Margem de lucro (%) <input id="pr-mg" type="number" step="0.1"></label>' +
        '<label>Noites da simulação <input id="pr-nt" type="number" value="2" min="1"></label></div>' +
        '<button class="btn" id="b-pr">Salvar e simular</button><p id="pr-msg" class="erro"></p></div>' +
        '<div id="pr-out"></div>');
      function carregar() {
        app('GET', '/precificacao/' + val('pr-im')).then(function (r) {
          var p = r.parametros;
          el('pr-fx').value = p.faxina_centavos / 100; el('pr-lv').value = p.lavanderia_centavos / 100;
          el('pr-in').value = p.insumos_centavos / 100; el('pr-cn').value = p.custo_noite_centavos / 100;
          el('pr-cm').value = p.comissao_pct; el('pr-ip').value = p.imposto_pct; el('pr-mg').value = p.margem_pct;
          simular();
        }).catch(function (e) { el('pr-msg').textContent = e.message; });
      }
      function simular() {
        app('GET', '/precificacao/' + val('pr-im') + '/simular?noites=' + (val('pr-nt') || 2)).then(function (r) {
          var s = r.simulacao;
          el('pr-out').innerHTML = '<div class="card"><h3>' + esc(s.imovel_nome) + ' — estadia de ' + s.noites + ' noite(s)</h3>' +
            '<div class="lin">Custos fixos da estadia: <b>' + brl(s.custos_fixos_estadia_centavos) + '</b></div>' +
            '<div class="lin">Custo total por noite: <b>' + brl(s.custo_por_noite_centavos) + '</b></div>' +
            '<div class="lin" style="font-size:1.15rem">Preço mínimo por noite: <b>' + brl(s.preco_minimo_noite_centavos) + '</b> · estadia: <b>' + brl(s.preco_minimo_estadia_centavos) + '</b></div>' +
            '<div class="lin">Tarifa base atual: <b>' + brl(s.tarifa_base_centavos) + '</b> ' + (s.tarifa_base_cobre ? '<span class="tag" style="background:#e1f5e4">✅ cobre o mínimo</span>' : '<span class="tag" style="background:#fde2e2;color:#b00020">⚠️ ABAIXO do mínimo — prejuízo</span>') + '</div>' +
            (!s.tarifa_base_cobre ? '<p style="margin-top:8px"><button class="btn peq" id="b-apl">Aplicar o mínimo como tarifa base</button></p>' : '') + '</div>';
          if (el('b-apl')) el('b-apl').onclick = function () {
            app('PATCH', '/imoveis/' + s.imovel_id, { tarifa_base_centavos: s.preco_minimo_noite_centavos }).then(simular).catch(function (e) { alert(e.message); });
          };
        }).catch(function (e) { el('pr-out').innerHTML = '<div class="card erro">' + esc(e.message) + '</div>'; });
      }
      el('pr-im').onchange = carregar;
      el('b-pr').onclick = function () {
        el('pr-msg').textContent = '';
        app('PUT', '/precificacao/' + val('pr-im'), {
          faxina_centavos: centavos(val('pr-fx')), lavanderia_centavos: centavos(val('pr-lv')), insumos_centavos: centavos(val('pr-in')),
          custo_noite_centavos: centavos(val('pr-cn')), comissao_pct: val('pr-cm'), imposto_pct: val('pr-ip'), margem_pct: val('pr-mg'),
        }).then(simular).catch(function (e) { el('pr-msg').textContent = e.message; });
      };
      carregar();
    }).catch(erroBox);
  }

  // ---------------- reservas (com checklist de etapas) ----------------
  var ckAberta = null; // reserva com o checklist expandido
  function vReservas() {
    Promise.all([app('GET', '/reservas'), app('GET', '/imoveis')]).then(function (rs) {
      var reservas = rs[0].reservas, imoveis = rs[1].imoveis;
      var linhas = reservas.map(function (r) {
        var prog = (r.checklist_feitas || 0) + '/' + (r.checklist_total || 10);
        var completo = r.checklist_feitas >= r.checklist_total;
        return '<tr><td>' + esc(r.imovel_nome || '—') + '</td><td>' + esc(r.hospede_nome || '—') + '</td><td>' + dt(r.checkin) + '→' + dt(r.checkout) + '</td><td>' + brl(r.valor_centavos) + '</td><td><span class="tag">' + esc(r.canal) + '</span></td>' +
          '<td><span class="tag">' + esc(r.status) + '</span></td>' +
          '<td><button class="btn secund peq" data-ck="' + r.id + '" title="Etapas da reserva">' + (completo ? '✅ ' : '☑️ ') + prog + '</button></td>' +
          '<td>' + (r.status !== 'cancelada' && r.status !== 'concluida' ? '<button class="btn secund peq" data-cc="' + r.id + '">Concluir</button> <button class="btn secund peq" data-cx="' + r.id + '">Cancelar</button>' : '') + '</td></tr>';
      }).join('');
      setView('<div class="card"><h3>Nova reserva</h3>' + (imoveis.length ? '' : '<p class="aviso">Cadastre um imóvel primeiro (aba Imóveis).</p>') +
        '<div class="hi-grid"><label>Imóvel <select id="rv-im">' + imovelOptions(imoveis) + '</select></label>' +
        '<label>Hóspede <input id="rv-hosp" placeholder="Nome do hóspede"></label>' +
        '<label>Check-in <input id="rv-ci" type="date"></label><label>Check-out <input id="rv-co" type="date"></label>' +
        '<label>Valor total (R$) <input id="rv-val" type="number" step="0.01"></label>' +
        '<label>Canal <select id="rv-can"><option>direto</option><option>airbnb</option><option>booking</option><option>vrbo</option><option>decolar</option><option>outro</option></select></label></div>' +
        '<button class="btn" id="b-rv">Lançar reserva</button><p id="rv-msg" class="erro"></p><p class="sub">Anti-overbooking automático por imóvel.</p></div>' +
        '<div id="ck-panel"></div>' +
        '<div class="card"><h3>Reservas (' + reservas.length + ')</h3>' + (reservas.length ? '<table><tr><th>Imóvel</th><th>Hóspede</th><th>Período</th><th>Valor</th><th>Canal</th><th>Status</th><th>Etapas</th><th></th></tr>' + linhas + '</table>' : '<p class="sub">Nenhuma reserva ainda.</p>') + '</div>');
      el('b-rv').onclick = function () {
        el('rv-msg').textContent = '';
        app('POST', '/reservas', { imovel_id: val('rv-im'), hospede_nome: val('rv-hosp'), checkin: val('rv-ci'), checkout: val('rv-co'), valor_centavos: centavos(val('rv-val')), canal: val('rv-can') })
          .then(vReservas).catch(function (e) { el('rv-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-cc]'), function (b) { b.onclick = function () { app('POST', '/reservas/' + b.getAttribute('data-cc') + '/status', { status: 'concluida' }).then(vReservas).catch(function (e) { alert(e.message); }); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-cx]'), function (b) { b.onclick = function () { if (confirm('Cancelar a reserva?')) app('POST', '/reservas/' + b.getAttribute('data-cx') + '/status', { status: 'cancelada' }).then(vReservas).catch(function (e) { alert(e.message); }); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-ck]'), function (b) {
        b.onclick = function () { var id = b.getAttribute('data-ck'); ckAberta = (ckAberta === id) ? null : id; pintarChecklist(); };
      });
      pintarChecklist();
    }).catch(erroBox);
  }
  // card do checklist da reserva selecionada ("já executei esta operação?")
  function pintarChecklist() {
    var box = el('ck-panel');
    if (!box) return;
    if (!ckAberta) { box.innerHTML = ''; return; }
    app('GET', '/reservas/' + ckAberta).then(function (d) {
      var r = d.reserva;
      var itens = (r.checklist || []).map(function (e, i) {
        return '<div class="lin"><label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin:0">' +
          '<input type="checkbox" style="width:auto;margin:0" data-et="' + e.chave + '"' + (e.feito ? ' checked' : '') + '> ' +
          '<span>' + (i + 1) + '. ' + esc(e.rotulo) + (e.feito && e.em ? ' <span class="sub" style="margin:0">✓ ' + dt(e.em) + '</span>' : '') + '</span></label></div>';
      }).join('');
      box.innerHTML = '<div class="card"><h3>☑️ Etapas — ' + esc(r.hospede_nome || 'reserva') + ' · ' + esc(r.imovel_nome || '') + ' (' + dt(r.checkin) + '→' + dt(r.checkout) + ') <span class="tag">' + r.checklist_feitas + '/' + r.checklist_total + '</span></h3>' +
        '<p class="sub" style="text-align:left;margin:0 0 8px">Marque cada etapa ao executá-la — o sistema lembra por você o que ainda falta.</p>' + itens + '</div>';
      Array.prototype.forEach.call(box.querySelectorAll('[data-et]'), function (c) {
        c.onchange = function () {
          app('POST', '/reservas/' + r.id + '/checklist', { etapa: c.getAttribute('data-et'), feito: c.checked })
            .then(vReservas).catch(function (e) { alert(e.message); vReservas(); });
        };
      });
    }).catch(function (e) { box.innerHTML = '<div class="card erro">' + esc(e.message) + '</div>'; });
  }

  // ---------------- limpezas ----------------
  function vLimpezas() {
    Promise.all([app('GET', '/limpezas'), app('GET', '/imoveis')]).then(function (rs) {
      var limpezas = rs[0].limpezas, imoveis = rs[1].imoveis;
      var linhas = limpezas.map(function (l) {
        return '<tr><td>' + dt(l.data) + '</td><td>' + esc(l.imovel_nome || '—') + '</td><td><span class="tag">' + esc(l.tipo) + '</span></td><td>' + esc(l.responsavel || '—') + '</td><td><span class="tag">' + esc(l.status) + '</span></td>' +
          '<td>' + (l.status === 'pendente' ? '<button class="btn secund peq" data-ok="' + l.id + '">Concluir</button>' : '✅') + '</td></tr>';
      }).join('');
      setView('<div class="card"><h3>Nova limpeza</h3><div class="hi-grid"><label>Imóvel <select id="lp-im">' + imovelOptions(imoveis) + '</select></label>' +
        '<label>Data <input id="lp-data" type="date"></label><label>Tipo <select id="lp-tipo"><option>checkout</option><option>checkin</option><option>periodica</option></select></label>' +
        '<label>Responsável <input id="lp-resp"></label></div><button class="btn" id="b-lp">Agendar</button><p id="lp-msg" class="erro"></p></div>' +
        '<div class="card"><h3>Limpezas</h3>' + (limpezas.length ? '<table><tr><th>Data</th><th>Imóvel</th><th>Tipo</th><th>Resp.</th><th>Status</th><th></th></tr>' + linhas + '</table>' : '<p class="sub">Nenhuma limpeza. Reservas confirmadas geram a faxina de check-out automaticamente.</p>') + '</div>');
      el('b-lp').onclick = function () {
        el('lp-msg').textContent = '';
        app('POST', '/limpezas', { imovel_id: val('lp-im'), data: val('lp-data'), tipo: val('lp-tipo'), responsavel: val('lp-resp') }).then(vLimpezas).catch(function (e) { el('lp-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-ok]'), function (b) { b.onclick = function () { app('POST', '/limpezas/' + b.getAttribute('data-ok') + '/concluir', {}).then(vLimpezas).catch(function (e) { alert(e.message); }); }; });
    }).catch(erroBox);
  }

  // ---------------- manutenção ----------------
  function vManutencao() {
    Promise.all([app('GET', '/manutencao'), app('GET', '/imoveis')]).then(function (rs) {
      var chs = rs[0].chamados, imoveis = rs[1].imoveis;
      var linhas = chs.map(function (m) {
        var prox = m.status === 'aberto' ? 'em_andamento' : (m.status === 'em_andamento' ? 'resolvido' : '');
        return '<tr><td>' + esc(m.titulo) + '</td><td>' + esc(m.imovel_nome || '—') + '</td><td><span class="tag">' + esc(m.prioridade) + '</span></td><td><span class="tag">' + esc(m.status) + '</span></td>' +
          '<td>' + (prox ? '<button class="btn secund peq" data-st="' + m.id + '" data-to="' + prox + '">→ ' + prox + '</button>' : '✅') + '</td></tr>';
      }).join('');
      setView('<div class="card"><h3>Novo chamado</h3><div class="hi-grid"><label>Título <input id="mn-tit"></label>' +
        '<label>Imóvel <select id="mn-im"><option value="">(geral)</option>' + imovelOptions(imoveis) + '</select></label>' +
        '<label>Prioridade <select id="mn-pri"><option>media</option><option>alta</option><option>baixa</option></select></label></div>' +
        '<label>Descrição <input id="mn-desc"></label><button class="btn" id="b-mn">Abrir chamado</button><p id="mn-msg" class="erro"></p></div>' +
        '<div class="card"><h3>Chamados</h3>' + (chs.length ? '<table><tr><th>Título</th><th>Imóvel</th><th>Prioridade</th><th>Status</th><th></th></tr>' + linhas + '</table>' : '<p class="sub">Nenhum chamado.</p>') + '</div>');
      el('b-mn').onclick = function () {
        el('mn-msg').textContent = '';
        app('POST', '/manutencao', { titulo: val('mn-tit'), imovel_id: val('mn-im'), prioridade: val('mn-pri'), descricao: val('mn-desc') }).then(vManutencao).catch(function (e) { el('mn-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-st]'), function (b) { b.onclick = function () { app('POST', '/manutencao/' + b.getAttribute('data-st') + '/status', { status: b.getAttribute('data-to') }).then(vManutencao).catch(function (e) { alert(e.message); }); }; });
    }).catch(erroBox);
  }

  // ---------------- financeiro ----------------
  function vFinanceiro() {
    Promise.all([app('GET', '/financeiro'), app('GET', '/imoveis')]).then(function (rs) {
      var d = rs[0], imoveis = rs[1].imoveis, r = d.resumo;
      var linhas = d.lancamentos.map(function (l) {
        return '<tr><td>' + dt(l.data) + '</td><td><span class="tag">' + esc(l.tipo) + '</span></td><td>' + esc(l.categoria || '—') + '</td><td>' + esc(l.descricao || '—') + '</td><td style="color:' + (l.tipo === 'despesa' ? '#b00020' : 'inherit') + '">' + brl(l.valor_centavos) + '</td></tr>';
      }).join('');
      setView('<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin:.4rem 0"><div class="kpi"><div class="sub">Receita do mês</div><div style="font-size:1.3rem;font-weight:700">' + brl(r.receita_centavos) + '</div></div>' +
        '<div class="kpi"><div class="sub">Despesa do mês</div><div style="font-size:1.3rem;font-weight:700">' + brl(r.despesa_centavos) + '</div></div>' +
        '<div class="kpi"><div class="sub">Resultado</div><div style="font-size:1.3rem;font-weight:700;color:' + (r.resultado_centavos < 0 ? '#b00020' : 'inherit') + '">' + brl(r.resultado_centavos) + '</div></div></div>' +
        '<div class="card"><h3>Novo lançamento</h3><div class="hi-grid"><label>Tipo <select id="fi-tipo"><option value="receita">receita</option><option value="despesa">despesa</option></select></label>' +
        '<label>Categoria <input id="fi-cat" placeholder="hospedagem/limpeza/..."></label><label>Valor (R$) <input id="fi-val" type="number" step="0.01"></label>' +
        '<label>Data <input id="fi-data" type="date"></label><label>Imóvel <select id="fi-im"><option value="">(nenhum)</option>' + imovelOptions(imoveis) + '</select></label></div>' +
        '<label>Descrição <input id="fi-desc"></label><button class="btn" id="b-fi">Lançar</button><p id="fi-msg" class="erro"></p></div>' +
        '<div class="card"><h3>Lançamentos</h3>' + (d.lancamentos.length ? '<table><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr>' + linhas + '</table>' : '<p class="sub">Nenhum lançamento. Reservas com valor geram receita automaticamente.</p>') + '</div>');
      el('b-fi').onclick = function () {
        el('fi-msg').textContent = '';
        app('POST', '/financeiro', { tipo: val('fi-tipo'), categoria: val('fi-cat'), valor_centavos: centavos(val('fi-val')), data: val('fi-data'), descricao: val('fi-desc'), imovel_id: val('fi-im') })
          .then(vFinanceiro).catch(function (e) { el('fi-msg').textContent = e.message; });
      };
    }).catch(erroBox);
  }

  // ---------------- hóspedes ----------------
  function vHospedes() {
    app('GET', '/hospedes').then(function (d) {
      var linhas = d.hospedes.map(function (h) { return '<tr><td>' + esc(h.nome) + '</td><td>' + esc(h.email || '—') + '</td><td>' + esc(h.telefone || '—') + '</td></tr>'; }).join('');
      setView('<div class="card"><h3>Novo hóspede</h3><div class="hi-grid"><label>Nome <input id="hp-nome"></label>' +
        '<label>E-mail <input id="hp-email"></label><label>Telefone <input id="hp-tel"></label></div><button class="btn" id="b-hp">Cadastrar</button><p id="hp-msg" class="erro"></p></div>' +
        '<div class="card"><h3>Hóspedes (' + d.hospedes.length + ')</h3>' + (d.hospedes.length ? '<table><tr><th>Nome</th><th>E-mail</th><th>Telefone</th></tr>' + linhas + '</table>' : '<p class="sub">Nenhum hóspede.</p>') + '</div>');
      el('b-hp').onclick = function () {
        el('hp-msg').textContent = '';
        app('POST', '/hospedes', { nome: val('hp-nome'), email: val('hp-email'), telefone: val('hp-tel') }).then(vHospedes).catch(function (e) { el('hp-msg').textContent = e.message; });
      };
    }).catch(erroBox);
  }

  // ---------------- canais (Stays.net) ----------------
  function vCanais() {
    app('GET', '/stays').then(function (d) {
      var c = d.conta;
      if (c && c.conectada) {
        setView('<div class="card"><h3>Stays.net conectada ✅</h3>' +
          '<p class="sub">Conta: <b>' + esc(c.base_url) + '</b> · client_id ' + esc(c.client_id) + (c.status === 'erro' ? ' · <span style="color:#b00020">erro</span>' : '') + '</p>' +
          '<p>Última sincronização: <b>' + (c.ultimo_sync ? dt(c.ultimo_sync) : 'nunca') + '</b> · anúncios: <b>' + (c.imoveis_sync || 0) + '</b> · reservas: <b>' + (c.reservas_sync || 0) + '</b></p>' +
          (c.ultimo_erro ? '<p class="aviso">Último erro: ' + esc(c.ultimo_erro) + '</p>' : '') +
          '<button class="btn" id="b-sync">🔄 Sincronizar agora</button> <button class="btn secund peq" id="b-desc">Desconectar</button><p id="cn-msg" class="sub"></p></div>' +
          '<div class="card"><p class="sub">A sincronização importa seus <b>anúncios</b> e <b>reservas</b> da Stays (que já integra Airbnb, Booking, Decolar, Vrbo, Expedia, Google e reservas diretas) para as abas Imóveis e Reservas.</p></div>');
        el('b-sync').onclick = function () {
          el('cn-msg').textContent = 'Sincronizando…';
          app('POST', '/stays/sincronizar', {}).then(function (r) { el('cn-msg').textContent = '✅ ' + r.imoveis + ' anúncio(s), ' + r.reservas_novas + ' nova(s) e ' + r.reservas_atualizadas + ' atualizada(s).'; setTimeout(vCanais, 1400); }).catch(function (e) { el('cn-msg').textContent = '❌ ' + e.message; });
        };
        el('b-desc').onclick = function () { if (confirm('Desconectar a conta Stays? Os dados já importados continuam no sistema.')) app('POST', '/stays/desconectar', {}).then(vCanais).catch(function (e) { alert(e.message); }); };
      } else {
        setView('<div class="card"><h3>Conectar sua conta Stays.net</h3>' +
          '<p class="sub">O Villela Stay Manager se integra ao seu channel manager <b>Stays.net</b> — que já sincroniza Airbnb, Booking, Decolar, Vrbo, Expedia, Google Rentals e reservas diretas. Você precisa ter uma conta Stays.net com API habilitada.</p>' +
          '<label>URL da sua conta <input id="st-base" placeholder="ex.: minhaconta.stays.com.br"></label>' +
          '<label>Client ID <input id="st-id" placeholder="client_id da API Stays"></label>' +
          '<label>Secret <input id="st-sec" type="password" placeholder="secret da API Stays"></label>' +
          '<button class="btn" id="b-con">Conectar e validar</button><p id="cn-msg" class="erro"></p>' +
          '<p class="sub">Suas credenciais ficam guardadas com segurança e nunca são exibidas de volta.</p></div>');
        el('b-con').onclick = function () {
          el('cn-msg').textContent = 'Validando…';
          app('POST', '/stays/conectar', { base_url: val('st-base'), client_id: val('st-id'), secret: val('st-sec') }).then(vCanais).catch(function (e) { el('cn-msg').textContent = e.message; });
        };
      }
    }).catch(erroBox);
  }

  // ---------------- estoque ----------------
  function vEstoque() {
    app('GET', '/estoque').then(function (d) {
      var linhas = d.itens.map(function (i) {
        return '<tr' + (i.em_falta ? ' style="background:#fff3f3"' : '') + '><td>' + esc(i.nome) + (i.em_falta ? ' <span class="tag" style="background:#fde2e2;color:#b00020">em falta</span>' : '') + '</td>' +
          '<td><span class="tag">' + esc(i.categoria) + '</span></td><td><b>' + i.quantidade + '</b> ' + esc(i.unidade) + '</td><td>' + i.minimo + '</td><td>' + i.por_reserva + '</td>' +
          '<td><button class="btn secund peq" data-in="' + i.id + '">＋ Entrada</button> <button class="btn secund peq" data-out="' + i.id + '">− Baixa</button> <button class="btn secund peq" data-rm="' + i.id + '">Excluir</button></td></tr>';
      }).join('');
      setView('<div class="card"><h3>Novo item de estoque</h3><div class="hi-grid">' +
        '<label>Nome <input id="es-nome" placeholder="Papel higiênico, café, sabão..."></label>' +
        '<label>Categoria <select id="es-cat"><option>limpeza</option><option>pessoal</option><option>outro</option></select></label>' +
        '<label>Quantidade <input id="es-qt" type="number" value="0"></label>' +
        '<label>Mínimo (alerta) <input id="es-min" type="number" value="0"></label>' +
        '<label>Consumo por reserva <input id="es-pr" type="number" value="0" title="Quanto baixa a cada reserva (baixa padrão)"></label></div>' +
        '<button class="btn" id="b-es">Cadastrar</button><p id="es-msg" class="erro"></p>' +
        '<p class="sub">Itens com "consumo por reserva" entram na baixa padrão a cada reserva; abaixo do mínimo o item fica <b>em falta</b> (vira lista de compras).</p></div>' +
        '<div class="card"><h3>Itens (' + d.itens.length + ')</h3>' + (d.itens.length ? '<table><tr><th>Item</th><th>Categoria</th><th>Qtde</th><th>Mín.</th><th>Por reserva</th><th></th></tr>' + linhas + '</table>' : '<p class="sub">Nenhum item ainda. Cadastre os insumos de limpeza e bens pessoais que você repõe a cada hóspede.</p>') + '</div>');
      el('b-es').onclick = function () {
        el('es-msg').textContent = '';
        app('POST', '/estoque', { nome: val('es-nome'), categoria: val('es-cat'), quantidade: val('es-qt'), minimo: val('es-min'), por_reserva: val('es-pr') })
          .then(vEstoque).catch(function (e) { el('es-msg').textContent = e.message; });
      };
      function mov(id, sinal) {
        var q = prompt(sinal > 0 ? 'Quantidade que ENTROU (compra):' : 'Quantidade que SAIU (baixa/perda):');
        if (!q) return;
        app('POST', '/estoque/' + id + '/mov', { delta: sinal * Math.abs(Number(q) || 0), motivo: sinal > 0 ? 'compra' : 'ajuste' }).then(vEstoque).catch(function (e) { alert(e.message); });
      }
      Array.prototype.forEach.call(document.querySelectorAll('[data-in]'), function (b) { b.onclick = function () { mov(b.getAttribute('data-in'), 1); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-out]'), function (b) { b.onclick = function () { mov(b.getAttribute('data-out'), -1); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-rm]'), function (b) { b.onclick = function () { if (confirm('Excluir este item?')) app('DELETE', '/estoque/' + b.getAttribute('data-rm')).then(vEstoque).catch(function (e) { alert(e.message); }); }; });
    }).catch(erroBox);
  }

  // ---------------- integrações (tokens de API + webhooks) ----------------
  function vIntegracoes() {
    Promise.all([api('GET', '/tokens'), app('GET', '/webhooks')]).then(function (rs) {
      var tk = rs[0], wh = rs[1];
      if (!tk.api_publica) {
        setView('<div class="card"><h3>🔌 API e webhooks</h3><p class="aviso">A <b>API pública</b> não está no seu plano. Faça upgrade (aba Plano) para integrar o sistema aos seus scripts, planilhas e assistentes (Claude, etc.).</p></div>');
        return;
      }
      var tks = tk.tokens.map(function (t) {
        return '<div class="lin"><b>' + esc(t.nome) + '</b> <code>' + esc(t.prefixo) + '</code> <span class="sub">criado ' + dt(t.criado_em) + (t.ultimo_uso ? ' · último uso ' + dt(t.ultimo_uso) : ' · nunca usado') + '</span> <button class="btn secund peq" data-rvg="' + t.id + '">Revogar</button></div>';
      }).join('');
      var whs = wh.webhooks.map(function (w) {
        return '<div class="lin"><code>' + esc(w.url) + '</code> ' + (w.ativo ? '<span class="tag">ativo</span>' : '<span class="tag" style="background:#fde2e2;color:#b00020">desativado</span>') +
          ' <span class="sub">' + (w.eventos.length ? w.eventos.join(', ') : 'todos os eventos') + (w.ultimo_erro ? ' · erro: ' + esc(w.ultimo_erro) : '') + '</span>' +
          ' <button class="btn secund peq" data-wt="' + w.id + '">Testar</button> <button class="btn secund peq" data-wr="' + w.id + '">Remover</button></div>';
      }).join('');
      setView('<div class="card"><h3>🔑 Tokens de API</h3>' +
        '<p class="sub" style="text-align:left;margin:0 0 8px">Use nos seus scripts e integrações: header <code>Authorization: Bearer vsm_…</code> nas rotas <code>/gestao/api/app/*</code>. O token não expira (revogue quando quiser).</p>' +
        (tks || '<p class="sub">Nenhum token ativo.</p>') +
        '<div class="hi-grid" style="margin-top:8px"><label>Nome do token <input id="tk-nome" placeholder="ex.: Claude Code do escritório"></label></div>' +
        '<button class="btn" id="b-tk">Gerar token</button><p id="tk-novo" class="sub" style="text-align:left;word-break:break-all"></p></div>' +
        '<div class="card"><h3>🪝 Webhooks</h3>' +
        '<p class="sub" style="text-align:left;margin:0 0 8px">Receba um POST assinado (HMAC no header <code>X-VSM-Assinatura</code>) a cada evento: ' + wh.eventos.join(' · ') + '.</p>' +
        (whs || '<p class="sub">Nenhum webhook.</p>') +
        '<div class="hi-grid" style="margin-top:8px"><label>URL <input id="wh-url" placeholder="https://minha-integracao.com/webhook"></label>' +
        '<label>Eventos (vazio = todos) <input id="wh-evs" placeholder="reserva.criada, reserva.confirmada"></label></div>' +
        '<button class="btn" id="b-wh">Cadastrar webhook</button><p id="wh-novo" class="sub" style="text-align:left;word-break:break-all"></p></div>');
      el('b-tk').onclick = function () {
        api('POST', '/tokens', { nome: val('tk-nome') }).then(function (r) {
          el('tk-novo').innerHTML = '⚠️ Guarde agora (não aparece de novo):<br><code>' + esc(r.token) + '</code>';
        }).catch(function (e) { alert(e.message); });
      };
      el('b-wh').onclick = function () {
        var evs = val('wh-evs').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        app('POST', '/webhooks', { url: val('wh-url'), eventos: evs }).then(function (r) {
          el('wh-novo').innerHTML = '✅ Webhook cadastrado. ⚠️ Segredo do HMAC (guarde agora, não aparece de novo):<br><code>' + esc(r.webhook.segredo) + '</code><br>Recarregue a aba 🔌 API para ver a lista atualizada.';
        }).catch(function (e) { alert(e.message); });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-rvg]'), function (b) { b.onclick = function () { if (confirm('Revogar este token? As integrações que o usam vão parar.')) api('DELETE', '/tokens/' + b.getAttribute('data-rvg')).then(vIntegracoes).catch(function (e) { alert(e.message); }); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-wr]'), function (b) { b.onclick = function () { if (confirm('Remover este webhook?')) app('DELETE', '/webhooks/' + b.getAttribute('data-wr')).then(vIntegracoes).catch(function (e) { alert(e.message); }); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-wt]'), function (b) { b.onclick = function () { app('POST', '/webhooks/' + b.getAttribute('data-wt') + '/testar', {}).then(function (r) { alert(r.entregue ? '✅ Entregue!' : '❌ Falhou — veja o último erro na lista.'); vIntegracoes(); }).catch(function (e) { alert(e.message); }); }; });
    }).catch(erroBox);
  }

  // ---------------- plano / uso / suporte (control plane) ----------------
  function vPlano() {
    api('GET', '/cobranca').then(function (d) {
      setView('<div class="card"><h3>Plano e cobrança</h3><p>Plano atual: <b>' + esc(d.plano ? d.plano.nome : '—') + '</b> · assinatura: <span class="tag">' + esc(d.assinatura ? d.assinatura.status : '—') + '</span>' + (d.assinatura && d.assinatura.proximo_venc ? ' · próx. venc. ' + dt(d.assinatura.proximo_venc) : '') + '</p>' +
        '<h3 style="margin-top:12px">Planos</h3>' + d.planos_disponiveis.map(function (p) { return '<div class="lin"><b>' + esc(p.nome) + '</b> — ' + (p.preco_centavos ? brl(p.preco_centavos) + '/mês' : 'sob consulta') + (p.preco_centavos ? ' <button class="btn g peq" data-as="' + p.slug + '">Assinar</button>' : '') + '</div>'; }).join('') +
        (d.mp_ativo ? '' : '<p class="aviso">Pagamento online em configuração — fale com o suporte para ativar seu plano.</p>') +
        (d.assinatura && d.assinatura.recorrencia_mp ? '<p style="margin-top:12px"><button class="btn g peq" id="b-canc">Cancelar assinatura</button></p>' : '') + '</div>');
      Array.prototype.forEach.call(document.querySelectorAll('[data-as]'), function (b) { b.onclick = function () { api('POST', '/cobranca/assinar', { plano: b.getAttribute('data-as') }).then(function (r) { location.href = r.link; }).catch(function (e) { alert(e.message); }); }; });
      if (el('b-canc')) el('b-canc').onclick = function () { if (confirm('Cancelar a assinatura?')) api('POST', '/cobranca/cancelar').then(vPlano).catch(function (e) { alert(e.message); }); };
    }).catch(erroBox);
  }
  function vUso() {
    api('GET', '/me').then(function (me) {
      var ent = me.entitlements, u = me.uso;
      var linhas = Object.keys(ent.limites).map(function (k) { return '<div class="lin">' + esc(k.replace(/_/g, ' ')) + ': <b>' + (u[k] || 0) + '</b> / ' + ((ent.limites[k] || 0) === 0 ? 'ilimitado' : ent.limites[k]) + '</div>'; }).join('');
      setView('<div class="card"><h3>Uso do mês</h3>' + linhas + '<h3 style="margin-top:14px">Módulos do seu plano</h3><p>' + ent.modulos.map(function (m) { return '<span class="tag" style="margin:2px">' + esc(m.replace(/_/g, ' ')) + '</span>'; }).join(' ') + '</p></div>');
    }).catch(erroBox);
  }
  function vSuporte() {
    api('GET', '/tickets').then(function (d) {
      setView('<div class="card"><h3>Suporte</h3>' + (d.tickets.length ? d.tickets.map(function (t) { return '<div class="lin"><b>' + esc(t.assunto) + '</b> <span class="tag">' + esc(t.status) + '</span> <span class="sub">' + dt(t.criado_em) + '</span></div>'; }).join('') : '<p class="sub">Nenhum chamado.</p>') +
        '<h3 style="margin-top:12px">Abrir chamado</h3><input id="tk-a" placeholder="Assunto"><textarea id="tk-t" rows="3" placeholder="Descreva sua dúvida"></textarea><button class="btn" id="b-tk">Enviar</button></div>');
      el('b-tk').onclick = function () { if (val('tk-a') && val('tk-t')) api('POST', '/tickets', { assunto: val('tk-a'), texto: val('tk-t') }).then(vSuporte).catch(function (e) { alert(e.message); }); };
    }).catch(erroBox);
  }

  window.bootGestao = bootGestao;
})();
