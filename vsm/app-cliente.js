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

  // catálogo de abas do app: módulo → {rot, fn}
  var TABS = [
    ['imoveis', '🏠 Imóveis', vImoveis], ['reservas', '📅 Reservas', vReservas],
    ['limpeza', '🧹 Limpezas', vLimpezas], ['manutencao', '🛠️ Manutenção', vManutencao],
    ['financeiro', '💰 Financeiro', vFinanceiro], ['hospede', '👥 Hóspedes', vHospedes],
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
    var liberado = st === 'ativa' || st === 'trial';
    var alerta = !liberado
      ? '<div class="aviso">⚠️ Sua conta está <b>' + esc(st) + '</b>. Regularize a cobrança para voltar a usar o sistema.</div>'
      : (st === 'trial' ? '<div class="aviso">🎁 Período de teste até <b>' + dt(ent.trial_expira_em) + '</b>. Assine para continuar sem interrupção.</div>' : '');
    var tabs = liberado ? TABS.filter(function (t) { return ent.modulos.indexOf(t[0]) >= 0; }) : [];
    var nav = '<button class="btn g peq" data-nav="painel">📊 Painel</button>' +
      tabs.map(function (t) { return '<button class="btn g peq" data-nav="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '<button class="btn g peq" data-nav="plano">💳 Plano</button><button class="btn g peq" data-nav="uso">📈 Uso</button><button class="btn g peq" data-nav="suporte">🎧 Suporte</button>';
    root().innerHTML = '<div class="card"><h3>' + esc(me.operacao.nome) + ' <span class="tag">' + esc(ent.plano || '—') + '</span></h3>' + alerta +
      '<div class="menu" id="nav">' + nav + '</div>' +
      '<p class="sub">Olá, ' + esc(me.usuario.nome || me.usuario.email) + ' · <a href="#" id="b-sair">sair</a></p></div><div id="c"></div>';
    el('b-sair').onclick = function (e) { e.preventDefault(); sair(); };
    var map = { painel: vPainel, plano: vPlano, uso: vUso, suporte: vSuporte };
    TABS.forEach(function (t) { map[t[0]] = t[2]; });
    Array.prototype.forEach.call(document.querySelectorAll('#nav [data-nav]'), function (b) {
      b.onclick = function () { (map[b.getAttribute('data-nav')] || vPainel)(); };
    });
    (liberado ? vPainel : vPlano)();
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
        kpi('Imóveis', p.imoveis) + kpi('Reservas ativas', p.reservas_ativas) + kpi('Check-ins 7d', p.checkins_7d) +
        kpi('Check-outs 7d', p.checkouts_7d) + kpi('Limpezas pendentes', p.limpezas_pendentes) + kpi('Manutenção aberta', p.manutencao_aberta) +
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

  // ---------------- reservas ----------------
  function vReservas() {
    Promise.all([app('GET', '/reservas'), app('GET', '/imoveis')]).then(function (rs) {
      var reservas = rs[0].reservas, imoveis = rs[1].imoveis;
      var linhas = reservas.map(function (r) {
        return '<tr><td>' + esc(r.imovel_nome || '—') + '</td><td>' + esc(r.hospede_nome || '—') + '</td><td>' + dt(r.checkin) + '→' + dt(r.checkout) + '</td><td>' + brl(r.valor_centavos) + '</td><td><span class="tag">' + esc(r.canal) + '</span></td>' +
          '<td><span class="tag">' + esc(r.status) + '</span></td><td>' + (r.status !== 'cancelada' && r.status !== 'concluida' ? '<button class="btn secund peq" data-cc="' + r.id + '">Concluir</button> <button class="btn secund peq" data-cx="' + r.id + '">Cancelar</button>' : '') + '</td></tr>';
      }).join('');
      setView('<div class="card"><h3>Nova reserva</h3>' + (imoveis.length ? '' : '<p class="aviso">Cadastre um imóvel primeiro (aba Imóveis).</p>') +
        '<div class="hi-grid"><label>Imóvel <select id="rv-im">' + imovelOptions(imoveis) + '</select></label>' +
        '<label>Hóspede <input id="rv-hosp" placeholder="Nome do hóspede"></label>' +
        '<label>Check-in <input id="rv-ci" type="date"></label><label>Check-out <input id="rv-co" type="date"></label>' +
        '<label>Valor total (R$) <input id="rv-val" type="number" step="0.01"></label>' +
        '<label>Canal <select id="rv-can"><option>direto</option><option>airbnb</option><option>booking</option><option>vrbo</option><option>decolar</option><option>outro</option></select></label></div>' +
        '<button class="btn" id="b-rv">Lançar reserva</button><p id="rv-msg" class="erro"></p><p class="sub">Anti-overbooking automático por imóvel.</p></div>' +
        '<div class="card"><h3>Reservas (' + reservas.length + ')</h3>' + (reservas.length ? '<table><tr><th>Imóvel</th><th>Hóspede</th><th>Período</th><th>Valor</th><th>Canal</th><th>Status</th><th></th></tr>' + linhas + '</table>' : '<p class="sub">Nenhuma reserva ainda.</p>') + '</div>');
      el('b-rv').onclick = function () {
        el('rv-msg').textContent = '';
        app('POST', '/reservas', { imovel_id: val('rv-im'), hospede_nome: val('rv-hosp'), checkin: val('rv-ci'), checkout: val('rv-co'), valor_centavos: centavos(val('rv-val')), canal: val('rv-can') })
          .then(vReservas).catch(function (e) { el('rv-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-cc]'), function (b) { b.onclick = function () { app('POST', '/reservas/' + b.getAttribute('data-cc') + '/status', { status: 'concluida' }).then(vReservas).catch(function (e) { alert(e.message); }); }; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-cx]'), function (b) { b.onclick = function () { if (confirm('Cancelar a reserva?')) app('POST', '/reservas/' + b.getAttribute('data-cx') + '/status', { status: 'cancelada' }).then(vReservas).catch(function (e) { alert(e.message); }); }; });
    }).catch(erroBox);
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
