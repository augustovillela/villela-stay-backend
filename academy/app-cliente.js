/* =====================================================================
 * Villela Academy — SPA do painel (aluno/produtor/afiliado/admin).
 * Servido em /academy/app.js e inicializado por bootAcademy() no shell
 * (paginas.js). Fala com /academy/api. Sem build, JS clássico.
 * ===================================================================== */
(function () {
  'use strict';
  var ME = null;
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
  function dt(t) { return t ? String(t).slice(0, 10).split('-').reverse().join('/') : '—'; }
  function el(id) { return document.getElementById(id); }
  function val(id) { var e = el(id); return e ? e.value : ''; }

  function api(m, p, b) {
    return fetch('/academy/api' + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d && d.erro || ('erro ' + r.status)); return d; }); });
  }
  var root = function () { return el('app'); };
  var view = function () { return el('c'); };
  function setView(html) { var v = view(); if (v) v.innerHTML = html; }
  function erroBox(e) { setView('<div class="card erro">' + esc(e.message || e) + '</div>'); }

  var STATUS_PERFIL = { em_analise: '⏳ em análise', aprovado: '✅ aprovado', rejeitado: '❌ rejeitado', suspenso: '⚠️ suspenso', bloqueado: '🚫 bloqueado' };

  // ---------------- login / cadastro / boot ----------------
  function bootAcademy() {
    api('GET', '/me').then(render).catch(function () {
      (location.hash === '#cadastro' ? renderCadastro : renderLogin)();
    });
  }
  function renderLogin() {
    root().innerHTML = '<div class="card" style="max-width:420px"><h3>Entrar</h3>' +
      '<input id="em" type="email" placeholder="E-mail"><input id="sn" type="password" placeholder="Senha">' +
      '<button class="btn" id="b-entrar">Entrar</button><p id="msg" class="erro"></p>' +
      '<p class="sub" style="text-align:left">Novo por aqui? <a href="#cadastro" id="b-cad">Crie sua conta grátis</a>.</p></div>';
    el('b-entrar').onclick = function () {
      el('msg').textContent = '';
      api('POST', '/login', { email: val('em'), senha: val('sn') }).then(bootAcademy).catch(function (e) { el('msg').textContent = e.message; });
    };
    el('b-cad').onclick = function (e) { e.preventDefault(); renderCadastro(); };
  }
  function renderCadastro() {
    root().innerHTML = '<div class="card" style="max-width:460px"><h3>Criar conta</h3>' +
      '<input id="nm" placeholder="Seu nome *"><input id="em" type="email" placeholder="E-mail *">' +
      '<input id="sn" type="password" placeholder="Senha (8+ caracteres) *"><input id="tl" placeholder="Telefone/WhatsApp (opcional)">' +
      '<label style="font-weight:400"><input type="checkbox" id="tm" style="width:auto;margin-right:6px">Li e aceito os <a href="/academy/termos" target="_blank">Termos</a> e a <a href="/academy/privacidade" target="_blank">Privacidade</a> *</label>' +
      '<label style="font-weight:400"><input type="checkbox" id="mk" style="width:auto;margin-right:6px">Quero receber novidades por e-mail/WhatsApp</label>' +
      '<p style="margin-top:12px"><button class="btn" id="b-criar">Criar conta</button></p><p id="msg" class="erro"></p>' +
      '<p class="sub" style="text-align:left">Já tem conta? <a href="#" id="b-log">Entrar</a>.</p></div>';
    el('b-criar').onclick = function () {
      el('msg').textContent = '';
      api('POST', '/signup', { nome: val('nm'), email: val('em'), senha: val('sn'), telefone: val('tl'), aceite_termos: el('tm').checked, marketing: el('mk').checked })
        .then(bootAcademy).catch(function (e) { el('msg').textContent = e.message; });
    };
    el('b-log').onclick = function (e) { e.preventDefault(); renderLogin(); };
  }
  function sair() { api('POST', '/logout').catch(function () {}).then(function () { location.hash = ''; location.reload(); }); }

  // ---------------- shell autenticado ----------------
  function render(me) {
    ME = me;
    var papeis = me.papeis_ativos || [];
    var tabs = [['aluno', '🎓 Aluno', vAluno]];
    if (papeis.indexOf('produtor') >= 0) tabs.push(['produtor', '🎬 Produtor', vProdutor]);
    if (papeis.indexOf('afiliado') >= 0) tabs.push(['afiliado', '🤝 Afiliado', vAfiliado]);
    if (papeis.indexOf('admin') >= 0) tabs.push(['admin', '🛠️ Admin', vAdmin]);
    tabs.push(['conta', '👤 Conta', vConta]);
    var nav = tabs.map(function (t) { return '<button class="btn g peq" data-nav="' + t[0] + '">' + t[1] + '</button>'; }).join('');
    root().innerHTML = '<div class="card"><h3>Olá, ' + esc(me.usuario.nome) + ' ' +
      papeis.map(function (p) { return '<span class="chip">' + esc(p) + '</span>'; }).join(' ') + '</h3>' +
      '<div class="menu" id="nav">' + nav + '</div>' +
      '<p class="sub" style="text-align:left;margin:0">' + esc(me.usuario.email) + ' · <a href="#" id="b-sair">sair</a></p></div><div id="c"></div>';
    el('b-sair').onclick = function (e) { e.preventDefault(); sair(); };
    var map = {};
    tabs.forEach(function (t) { map[t[0]] = t[2]; });
    Array.prototype.forEach.call(document.querySelectorAll('#nav [data-nav]'), function (b) {
      b.onclick = function () { (map[b.getAttribute('data-nav')] || vAluno)(); };
    });
    vAluno();
  }

  // ---------------- dashboard do ALUNO ----------------
  function vAluno() {
    api('GET', '/aluno/dashboard').then(function (d) {
      var db = d.dashboard;
      var html = '<div class="card"><h3>🎓 Minha biblioteca</h3>' +
        '<span class="kpi"><b>' + db.cursos.length + '</b>cursos</span>' +
        '<span class="kpi"><b>' + db.certificados.length + '</b>certificados</span>' +
        '<span class="kpi"><b>' + db.compras.length + '</b>compras</span>';
      html += db.cursos.length ? '' : '<div class="aviso">Você ainda não tem cursos. O marketplace abre na FASE 3 — em breve você encontra aqui os primeiros cursos da Villela Academy.</div>';
      html += '</div>' + cartaoVireProdutorAfiliado();
      setView(html);
      ligarOnboarding();
    }).catch(erroBox);
  }

  function cartaoVireProdutorAfiliado() {
    var pp = ME.perfil_produtor, pa = ME.perfil_afiliado, h = '';
    h += '<div class="card"><h3>🎬 Vender na Academy</h3>';
    if (!pp) {
      h += '<p class="sub" style="text-align:left">Publique cursos, e-books e mentorias. Cadastre-se como produtor:</p>' +
        '<input id="pp-nome" placeholder="Nome público / marca *"><input id="pp-doc" placeholder="CPF ou CNPJ">' +
        '<input id="pp-site" placeholder="Site ou rede social"><textarea id="pp-bio" rows="2" placeholder="O que você ensina?"></textarea>' +
        '<button class="btn peq" id="b-prod">Quero ser produtor</button><p id="pp-msg" class="erro"></p>';
    } else h += '<p>Cadastro de produtor: <b>' + (STATUS_PERFIL[pp.status] || esc(pp.status)) + '</b>' + (pp.status === 'aprovado' ? ' — use a aba 🎬 Produtor.' : ' — você será avisado quando a análise terminar.') + '</p>';
    h += '</div><div class="card"><h3>🤝 Divulgar e ganhar comissão</h3>';
    if (!pa) {
      h += '<p class="sub" style="text-align:left">Indique cursos com seus links e receba comissão por venda:</p>' +
        '<input id="pa-nome" placeholder="Nome público *"><input id="pa-canais" placeholder="Onde divulga? (Instagram, YouTube, lista...)">' +
        '<button class="btn peq" id="b-afil">Quero ser afiliado</button><p id="pa-msg" class="erro"></p>';
    } else h += '<p>Cadastro de afiliado: <b>' + (STATUS_PERFIL[pa.status] || esc(pa.status)) + '</b>' + (pa.status === 'aprovado' ? ' — use a aba 🤝 Afiliado.' : ' — você será avisado quando a análise terminar.') + '</p>';
    return h + '</div>';
  }
  function ligarOnboarding() {
    if (el('b-prod')) el('b-prod').onclick = function () {
      api('POST', '/tornar-se-produtor', { nome_publico: val('pp-nome'), documento: val('pp-doc'), site: val('pp-site'), bio: val('pp-bio') })
        .then(bootAcademy).catch(function (e) { el('pp-msg').textContent = e.message; });
    };
    if (el('b-afil')) el('b-afil').onclick = function () {
      api('POST', '/tornar-se-afiliado', { nome_publico: val('pa-nome'), canais: val('pa-canais') })
        .then(bootAcademy).catch(function (e) { el('pa-msg').textContent = e.message; });
    };
  }

  // ---------------- dashboard do PRODUTOR ----------------
  function vProdutor() {
    api('GET', '/produtor/dashboard').then(function (d) {
      var db = d.dashboard;
      setView('<div class="card"><h3>🎬 Painel do produtor <span class="chip">' + esc((d.perfil || {}).nome_publico || '') + '</span></h3>' +
        '<span class="kpi"><b>' + db.produtos.length + '</b>produtos</span>' +
        '<span class="kpi"><b>' + brl(db.vendas_mes_centavos) + '</b>vendas no mês</span>' +
        '<span class="kpi"><b>' + db.alunos + '</b>alunos</span>' +
        '<div class="aviso">🚧 O construtor de cursos e produtos chega na FASE 2. Seu cadastro já está aprovado — você será o primeiro a saber.</div></div>');
    }).catch(erroBox);
  }

  // ---------------- dashboard do AFILIADO ----------------
  function vAfiliado() {
    api('GET', '/afiliado/dashboard').then(function (d) {
      var db = d.dashboard;
      setView('<div class="card"><h3>🤝 Painel do afiliado</h3>' +
        '<span class="kpi"><b>' + db.links.length + '</b>links</span>' +
        '<span class="kpi"><b>' + db.cliques + '</b>cliques</span>' +
        '<span class="kpi"><b>' + db.conversoes + '</b>vendas</span>' +
        '<span class="kpi"><b>' + brl(db.comissao_pendente_centavos) + '</b>comissão pendente</span>' +
        '<div class="aviso">🚧 Links rastreáveis e comissões chegam na FASE 5, junto com o checkout. Seu cadastro já está aprovado.</div></div>');
    }).catch(erroBox);
  }

  // ---------------- dashboard do ADMIN ----------------
  function vAdmin() {
    api('GET', '/admin/dashboard').then(function (d) {
      var r = d.dashboard, pend = d.pendentes;
      var linhaPerfil = function (tipo, p) {
        return '<tr><td>' + esc(p.nome) + '<br><span class="sub" style="text-align:left;margin:0">' + esc(p.email) + '</span></td>' +
          '<td>' + tipo + '</td><td>' + esc(p.nome_publico || '') + '</td><td>' + dt(p.criado_em) + '</td>' +
          '<td><button class="btn peq" data-ap="' + tipo + ':' + p.user_id + '">Aprovar</button> ' +
          '<button class="btn peq secund" data-rj="' + tipo + ':' + p.user_id + '">Rejeitar</button></td></tr>';
      };
      var pendentes = (pend.produtores || []).map(function (p) { return linhaPerfil('produtor', p); })
        .concat((pend.afiliados || []).map(function (p) { return linhaPerfil('afiliado', p); })).join('');
      setView('<div class="card"><h3>🛠️ Plataforma</h3>' +
        '<span class="kpi"><b>' + r.usuarios + '</b>usuários</span>' +
        '<span class="kpi"><b>' + r.produtores_aprovados + '</b>produtores</span>' +
        '<span class="kpi"><b>' + r.afiliados_aprovados + '</b>afiliados</span>' +
        '<span class="kpi"><b>' + r.perfis_em_analise + '</b>em análise</span>' +
        '<span class="kpi"><b>' + r.leads_novos + '</b>leads novos</span>' +
        '<span class="kpi"><b>' + brl(r.gmv_centavos) + '</b>GMV</span></div>' +
        '<div class="card"><h3>⏳ Aprovações pendentes</h3>' +
        (pendentes ? '<table><tr><th>Quem</th><th>Tipo</th><th>Nome público</th><th>Desde</th><th></th></tr>' + pendentes + '</table>' : '<p class="sub" style="text-align:left">Nada pendente.</p>') + '</div>' +
        '<div class="card"><h3>👥 Usuários</h3><div id="adm-users"><p class="sub">Carregando…</p></div></div>' +
        '<div class="card"><h3>📜 Auditoria (últimos eventos)</h3><div id="adm-audit"><p class="sub">Carregando…</p></div></div>');
      var decidir = function (attr, status) {
        Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (b) {
          b.onclick = function () {
            var kv = b.getAttribute('data-' + attr).split(':');
            var motivo = status === 'rejeitado' ? (prompt('Motivo da rejeição (o solicitante vê):') || '') : '';
            api('POST', '/admin/perfis/' + kv[0] + '/' + kv[1] + '/decidir', { status: status, motivo: motivo }).then(vAdmin).catch(function (e) { alert(e.message); });
          };
        });
      };
      decidir('ap', 'aprovado'); decidir('rj', 'rejeitado');
      api('GET', '/admin/usuarios?n=50').then(function (du) {
        el('adm-users').innerHTML = '<table><tr><th>Nome</th><th>E-mail</th><th>Papéis</th><th>Status</th><th>Criado</th></tr>' +
          du.usuarios.map(function (u) {
            return '<tr><td>' + esc(u.nome) + '</td><td>' + esc(u.email) + '</td><td>' + (u.papeis || []).map(function (p) { return '<span class="chip">' + esc(p) + '</span>'; }).join(' ') +
              '</td><td>' + esc(u.status) + '</td><td>' + dt(u.criado_em) + '</td></tr>';
          }).join('') + '</table>';
      }).catch(function (e) { el('adm-users').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
      api('GET', '/admin/auditoria?n=30').then(function (da) {
        el('adm-audit').innerHTML = '<table><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr>' +
          da.eventos.map(function (ev) {
            return '<tr><td>' + esc(String(ev.quando).slice(0, 16).replace('T', ' ')) + '</td><td>' + esc(ev.quem) + '</td><td>' + esc(ev.acao) + '</td><td>' + esc(ev.detalhe || '') + '</td></tr>';
          }).join('') + '</table>';
      }).catch(function (e) { el('adm-audit').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
    }).catch(erroBox);
  }

  // ---------------- conta (dados, senha, LGPD) ----------------
  function vConta() {
    var u = ME.usuario;
    setView('<div class="card"><h3>👤 Meus dados</h3>' +
      '<label>Nome</label><input id="c-nome" value="' + esc(u.nome) + '"><label>Telefone</label><input id="c-tel" value="' + esc(u.telefone || '') + '">' +
      '<button class="btn peq" id="b-salvar">Salvar</button> <span id="c-msg" class="erro"></span></div>' +
      '<div class="card"><h3>🔑 Trocar senha</h3>' +
      '<input id="s-atual" type="password" placeholder="Senha atual"><input id="s-nova" type="password" placeholder="Nova senha (8+)">' +
      '<button class="btn peq" id="b-senha">Trocar senha</button> <span id="s-msg" class="erro"></span>' +
      '<p class="sub" style="text-align:left">Por segurança, trocar a senha desconecta todos os dispositivos.</p></div>' +
      '<div class="card"><h3>🛡️ Meus dados (LGPD)</h3>' +
      '<p><a class="btn peq secund" href="/academy/api/me/exportar">⬇️ Exportar meus dados (JSON)</a></p>' +
      '<p class="sub" style="text-align:left">Excluir a conta anonimiza seus dados pessoais de forma irreversível.</p>' +
      '<input id="x-senha" type="password" placeholder="Confirme sua senha para excluir" style="max-width:320px">' +
      '<button class="btn peq" style="background:#b00020;color:#fff" id="b-excluir">Excluir minha conta</button> <span id="x-msg" class="erro"></span></div>');
    el('b-salvar').onclick = function () {
      api('PATCH', '/me', { nome: val('c-nome'), telefone: val('c-tel') }).then(bootAcademy).catch(function (e) { el('c-msg').textContent = e.message; });
    };
    el('b-senha').onclick = function () {
      api('POST', '/me/senha', { senha_atual: val('s-atual'), senha_nova: val('s-nova') })
        .then(function () { alert('Senha trocada. Entre de novo.'); location.reload(); })
        .catch(function (e) { el('s-msg').textContent = e.message; });
    };
    el('b-excluir').onclick = function () {
      if (!confirm('Tem certeza? Esta ação é irreversível.')) return;
      api('POST', '/me/excluir', { senha: val('x-senha') })
        .then(function () { alert('Conta excluída.'); location.href = '/academy'; })
        .catch(function (e) { el('x-msg').textContent = e.message; });
    };
  }

  window.bootAcademy = bootAcademy;
})();
