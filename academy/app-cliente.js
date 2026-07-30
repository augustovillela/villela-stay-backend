/* =====================================================================
 * Villela Academy — SPA do painel (aluno/produtor/afiliado/admin).
 * Servido em /academy/app.js e inicializado por bootAcademy() no shell
 * (paginas.js). Fala com /academy/api. Sem build, JS clássico.
 * FASE 2: biblioteca+player do aluno, builder do produtor, moderação.
 * ===================================================================== */
(function () {
  'use strict';
  var ME = null;
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
  function dt(t) { return t ? String(t).slice(0, 10).split('-').reverse().join('/') : '—'; }
  function centavos(v) { return Math.round(Number(String(v).replace(',', '.') || 0) * 100); }
  function el(id) { return document.getElementById(id); }
  function val(id) { var e = el(id); return e ? e.value : ''; }

  // SEQ cresce a cada troca de aba: leitura que volta depois de o usuário já
  // ter mudado de aba não pinta por cima da aba nova.
  var SEQ = 0;
  function api(m, p, b) {
    var meu = SEQ;
    return fetch('/academy/api' + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d && d.erro || ('erro ' + r.status)); return d; }); })
      .then(function (d) { return (m === 'GET' && meu !== SEQ) ? new Promise(function () {}) : d; });
  }
  var root = function () { return el('app'); };
  var view = function () { return el('c'); };
  function setView(html) { var v = view(); if (v) v.innerHTML = html; }
  function esqueleto() {
    return '<div class="vx-skel vx-skel--linha"></div><div class="vx-skel vx-skel--linha"></div>' +
      '<div class="vx-skel vx-skel--bloco"></div>';
  }
  function erroBox(e) {
    setView('<div class="vx-alerta vx-alerta--danger" role="alert">' +
      '<span class="vx-alerta-ico" aria-hidden="true">⚠️</span>' +
      '<div><b>Não foi possível carregar esta tela</b>' +
      '<p class="vx-mb0">' + esc(e && e.message ? e.message : 'Erro inesperado.') + '</p>' +
      '<button class="vx-btn vx-btn--sec vx-btn--sm" id="ac-retry" style="margin-top:8px">Tentar novamente</button></div></div>');
    var b = el('ac-retry');
    if (b) b.onclick = function () { irPara(ABA); };
  }

  var STATUS_PERFIL = { em_analise: '⏳ em análise', aprovado: '✅ aprovado', rejeitado: '❌ rejeitado', suspenso: '⚠️ suspenso', bloqueado: '🚫 bloqueado' };
  var STATUS_PRODUTO = { rascunho: '📝 rascunho', em_revisao: '⏳ em revisão', aprovado: '✅ aprovado', rejeitado: '❌ rejeitado', publicado: '🟢 publicado', pausado: '⏸️ pausado', suspenso: '⚠️ suspenso', removido: '🗑️ removido' };
  var TIPOS_PROD = { curso: '🎓 Curso', ebook: '📖 E-book', pdf: '📄 PDF', audio: '🎧 Áudio', pacote: '📦 Pacote', mentoria: '🧭 Mentoria', clube: '🔁 Clube' };
  var STATUS_ASSINATURA = { pendente: '⏳ aguardando pagamento', ativa: '🟢 ativa', pausada: '⚠️ pausada (pagamento)', cancelada: '🚫 cancelada' };
  var barra = function (pct) {
    return '<div style="background:#E2E6EC;border-radius:8px;height:10px;overflow:hidden"><div style="background:#D97706;height:10px;width:' + (pct || 0) + '%"></div></div>';
  };

  // ---------------- login / cadastro / boot ----------------
  function bootAcademy() {
    api('GET', '/me').then(render).catch(function () {
      (location.hash === '#cadastro' ? renderCadastro : renderLogin)();
    });
  }
  function renderLogin() {
    root().innerHTML = '<div class="card" style="max-width:420px"><h3 style="margin-bottom:14px">Entrar</h3>' +
      '<div class="vx-campo"><label for="em">E-mail</label>' +
      '<input id="em" type="email" autocomplete="username" autocapitalize="off" spellcheck="false"></div>' +
      '<div class="vx-campo"><label for="sn">Senha</label>' +
      '<input id="sn" type="password" autocomplete="current-password"></div>' +
      '<div id="fa-box" style="display:none"><div class="vx-campo"><label for="fa-cod">Código do app autenticador (2FA)</label>' +
      '<input id="fa-cod" inputmode="numeric" autocomplete="one-time-code"></div></div>' +
      '<button class="vx-btn" id="b-entrar">Entrar</button><p id="msg" class="erro" role="alert"></p>' +
      '<p class="sub" style="text-align:left">Novo por aqui? <a href="#cadastro" id="b-cad">Crie sua conta grátis</a> · <a href="#" id="b-esqueci">Esqueci minha senha</a></p></div>';
    el('b-entrar').onclick = function () {
      el('msg').textContent = '';
      var corpo = { email: val('em'), senha: val('sn') };
      if (val('fa-cod')) corpo.codigo = val('fa-cod');
      fetch('/academy/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) { var e = new Error(d.erro || 'erro'); e.precisa_2fa = d.precisa_2fa; throw e; } }); })
        .then(bootAcademy)
        .catch(function (e) { if (e.precisa_2fa) el('fa-box').style.display = ''; el('msg').textContent = e.message; });
    };
    el('b-cad').onclick = function (e) { e.preventDefault(); renderCadastro(); };
    el('b-esqueci').onclick = function (e) {
      e.preventDefault();
      var em = prompt('Qual o seu e-mail de cadastro?', val('em'));
      if (!em) return;
      api('POST', '/senha/esquecer', { email: em })
        .then(function () { alert('Se este e-mail tiver conta, o link de redefinição chega em instantes.'); })
        .catch(function (er) { alert(er.message); });
    };
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
  // [id, grupo do menu, ícone, rótulo, view] — o papel do usuário decide quais entram
  var ABA = 'aluno';
  var MAPA_VIEWS = {};
  var ORDEM_GRUPOS = ['Aprender', 'Vender', 'Administração', 'Conta'];
  var NAV_COLAPSADA = (function () { try { return localStorage.getItem('vx-nav') === 'colapsada'; } catch (_) { return false; } })();

  function tabsDoUsuario(me) {
    var papeis = me.papeis_ativos || [];
    var tabs = [['aluno', 'Aprender', '🎓', 'Meus cursos', vAluno]];
    if (papeis.indexOf('produtor') >= 0) tabs.push(['produtor', 'Vender', '🎬', 'Produtor', vProdutor]);
    if (papeis.indexOf('afiliado') >= 0) tabs.push(['afiliado', 'Vender', '🤝', 'Afiliado', vAfiliado]);
    if (papeis.indexOf('admin') >= 0) tabs.push(['admin', 'Administração', '🛠️', 'Admin', vAdmin]);
    tabs.push(['conta', 'Conta', '👤', 'Conta e pagamentos', vConta]);
    return tabs;
  }
  function montarNav(me) {
    var tabs = tabsDoUsuario(me), html = '';
    ORDEM_GRUPOS.forEach(function (g) {
      var doGrupo = tabs.filter(function (t) { return t[1] === g; });
      if (!doGrupo.length) return;
      html += '<div class="vx-nav-grupo">' + esc(g) + '</div>';
      doGrupo.forEach(function (t) {
        html += '<button type="button" class="vx-nav-item" data-nav="' + t[0] + '" title="' + esc(t[3]) + '"' +
          (ABA === t[0] ? ' aria-current="page"' : '') + '>' +
          '<span class="vx-nav-ico" aria-hidden="true">' + t[2] + '</span>' +
          '<span class="vx-nav-rot">' + esc(t[3]) + '</span></button>';
      });
    });
    html += '<hr class="vx-sep" style="margin:8px 4px">' +
      '<button type="button" class="vx-nav-item vx-nav-toggle" data-colapsar="1" aria-label="' +
      (NAV_COLAPSADA ? 'Expandir menu' : 'Recolher menu') + '">' +
      '<span class="vx-nav-ico" aria-hidden="true">' + (NAV_COLAPSADA ? '»' : '«') + '</span>' +
      '<span class="vx-nav-rot">Recolher menu</span></button>';
    return html;
  }
  function ligarNav(me) {
    Array.prototype.forEach.call(document.querySelectorAll('#ac-nav [data-nav]'), function (b) {
      b.onclick = function () { irPara(b.getAttribute('data-nav')); };
    });
    var t = document.querySelector('#ac-nav [data-colapsar]');
    if (t) t.onclick = function () { alternarNav(me); };
  }
  function alternarNav(me) {
    NAV_COLAPSADA = !NAV_COLAPSADA;
    try { localStorage.setItem('vx-nav', NAV_COLAPSADA ? 'colapsada' : 'aberta'); } catch (_) {}
    var a = el('ac-app'); if (a) a.setAttribute('data-nav', NAV_COLAPSADA ? 'colapsada' : 'aberta');
    var nav = el('ac-nav'); if (nav) { nav.innerHTML = montarNav(me); ligarNav(me); }
  }
  function ctxDaAba() {
    var achado = null;
    tabsDoUsuario(ME).forEach(function (t) { if (t[0] === ABA) achado = t; });
    return achado || ['aluno', 'Aprender', '🎓', 'Meus cursos', vAluno];
  }
  function pintarCabecalho() {
    var c = ctxDaAba(), h = el('ac-head');
    if (!h) return;
    h.innerHTML = '<div class="vx-crumb"><span>Villela Academy</span>' +
      '<span aria-hidden="true">›</span><span>' + esc(c[1]) + '</span></div>' +
      '<h1>' + c[2] + ' ' + esc(c[3]) + '</h1>';
  }
  function irPara(id) {
    ABA = MAPA_VIEWS[id] ? id : 'aluno';
    SEQ++;
    Array.prototype.forEach.call(document.querySelectorAll('#ac-nav [data-nav]'), function (b) {
      if (b.getAttribute('data-nav') === ABA) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    pintarCabecalho();
    setView(esqueleto());
    (MAPA_VIEWS[ABA] || vAluno)();
  }

  function render(me) {
    ME = me;
    var papeis = me.papeis_ativos || [];
    var tabs = tabsDoUsuario(me);
    MAPA_VIEWS = {};
    tabs.forEach(function (t) { MAPA_VIEWS[t[0]] = t[4]; });
    ABA = 'aluno';
    var bannerVerif = me.usuario.email_verificado ? '' :
      '<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico" aria-hidden="true">📧</span>' +
      '<div><b>Confirme seu e-mail</b><p class="vx-mb0">É por ele que chegam os avisos de compra e de acesso. ' +
      '<a href="#" id="b-reenv">Reenviar link</a> <span id="rv-msg"></span></p></div></div>';
    root().innerHTML =
      '<div class="vx-app" id="ac-app" data-nav="' + (NAV_COLAPSADA ? 'colapsada' : 'aberta') + '">' +
        '<nav class="vx-nav" id="ac-nav" aria-label="Seções do painel">' + montarNav(me) + '</nav>' +
        '<div class="vx-main">' +
          '<div class="vx-page-head">' +
            '<div id="ac-head"></div>' +
            '<div class="vx-acoes">' +
              papeis.map(function (p) { return '<span class="vx-badge">' + esc(p) + '</span>'; }).join('') +
              '<button class="vx-btn vx-btn--ghost vx-btn--sm" id="b-sino" title="Notificações">🔔<span id="sino-n" class="vx-badge vx-badge--accent" style="display:none;margin-left:6px"></span></button>' +
              '<button class="vx-btn vx-btn--sec vx-btn--sm" id="pwa-btn" style="display:none" title="Instalar a Villela Academy como app no celular">📲 Instalar app</button>' +
              '<button class="vx-btn vx-btn--sec vx-btn--sm" id="push-btn" style="display:none" title="Receber avisos no celular">🔔 Avisos</button>' +
              '<button class="vx-btn vx-btn--ghost vx-btn--sm" id="b-sair">Sair</button>' +
            '</div>' +
          '</div>' +
          '<p class="vx-hint">Conectado como ' + esc(me.usuario.nome) + ' · ' + esc(me.usuario.email) + '</p>' +
          bannerVerif + '<div id="sino-box" style="display:none"></div>' +
          '<div id="c"></div>' +
        '</div>' +
      '</div>';
    el('b-sair').onclick = function (e) { e.preventDefault(); sair(); };
    if (el('b-reenv')) el('b-reenv').onclick = function (e) {
      e.preventDefault();
      api('POST', '/me/reenviar-verificacao').then(function () { el('rv-msg').textContent = '✅ enviado!'; }).catch(function (er) { el('rv-msg').textContent = er.message; });
    };
    // sininho (F8)
    api('GET', '/notificacoes').then(function (d) {
      if (d.nao_lidas > 0) { var b = el('sino-n'); b.style.display = ''; b.textContent = d.nao_lidas; }
      el('b-sino').onclick = function (e) {
        e.preventDefault();
        var box = el('sino-box');
        if (box.style.display !== 'none') { box.style.display = 'none'; return; }
        box.style.display = '';
        box.innerHTML = d.itens.length
          ? d.itens.map(function (n) {
            return '<div class="lin"' + (n.lida ? ' style="opacity:.6"' : '') + '><b>' + esc(n.titulo) + '</b><br><span class="sub" style="text-align:left;margin:0">' + esc(n.texto) + ' · ' + dt(n.criado_em) + '</span></div>';
          }).join('')
          : '<p class="sub" style="text-align:left">Nenhuma notificação.</p>';
        if (d.nao_lidas > 0) api('POST', '/notificacoes/lidas').then(function () { el('sino-n').style.display = 'none'; d.nao_lidas = 0; }).catch(function () {});
      };
    }).catch(function () {});
    ligarNav(me);
    pintarBotaoPush();
    pintarBotaoInstalar();
    irPara(ABA);
  }

  // ---- instalar como app (PWA) — prompt no Android/Chrome, instrução no iPhone ----
  var PWA_EVT = null; // beforeinstallprompt pode disparar antes do render()
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
      PWA_EVT.userChoice
        .then(function (r) { if (r && r.outcome === 'accepted') { PWA_EVT = null; pintarBotaoInstalar(); } })
        .catch(function () {});
      return;
    }
    alert('Para instalar no iPhone:\n1. Toque em Compartilhar (o quadrado com a seta ↑)\n2. Escolha "Adicionar à Tela de Início"');
  }

  // ---- notificações push do painel (PWA) — espelham o sininho no celular ----
  function pushOk() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
  function b64ParaU8(b) {
    var pad = '='.repeat((4 - b.length % 4) % 4);
    var s = (b + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(s); var a = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
    return a;
  }
  function pushAssinado() {
    return navigator.serviceWorker.ready
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .catch(function () { return null; });
  }
  function pintarBotaoPush() {
    var btn = el('push-btn');
    if (!btn || !pushOk()) return;
    pushAssinado().then(function (sub) {
      btn.style.display = '';
      btn.textContent = sub ? '🔔 Avisos ✓' : '🔔 Avisos';
      btn.title = sub ? 'Notificações ativadas — toque para desativar' : 'Receber os avisos do sininho no celular';
      btn.onclick = alternarPush;
    });
  }
  function alternarPush() {
    pushAssinado().then(function (sub) {
      if (sub) {
        return api('POST', '/push/unsubscribe', { endpoint: sub.endpoint })
          .catch(function () {})
          .then(function () { return sub.unsubscribe(); });
      }
      return api('GET', '/push/chave').then(function (d) {
        if (!d.publicKey) { alert('As notificações ainda não estão disponíveis. Tente mais tarde.'); return; }
        return Notification.requestPermission().then(function (perm) {
          if (perm !== 'granted') { alert('Permissão negada. Libere as notificações deste site nas configurações do navegador.'); return; }
          return navigator.serviceWorker.ready.then(function (reg) {
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaU8(d.publicKey) });
          }).then(function (nova) { return api('POST', '/push/subscribe', { subscription: nova.toJSON() }); });
        });
      });
    }).catch(function (e) { alert(e.message); }).then(pintarBotaoPush);
  }

  // ================= ALUNO: biblioteca + curso + player =================
  function vAluno() {
    api('GET', '/aluno/biblioteca').then(function (d) {
      var html = '';
      if (d.continuar) {
        html += '<div class="card"><b>▶️ Continuar de onde parou:</b> ' + esc(d.continuar.produto_titulo) + ' — ' + esc(d.continuar.aula_titulo) +
          ' <button class="btn peq" data-curso="' + d.continuar.product_id + '">Continuar</button></div>';
      }
      html += '<div class="card"><h3>🎓 Minha biblioteca</h3>';
      if (!d.cursos.length) {
        html += '<div class="aviso">Você ainda não tem cursos. O marketplace público abre na FASE 3 — enquanto isso, um produtor pode liberar acesso de cortesia para o seu e-mail.</div>';
      } else {
        html += d.cursos.map(function (c) {
          return '<div class="lin"><b>' + esc(c.titulo) + '</b> <span class="chip">' + (TIPOS_PROD[c.tipo] || esc(c.tipo)) + '</span>' +
            '<div style="max-width:340px;margin:6px 0">' + barra(c.progresso.pct) + '</div>' +
            '<span class="sub" style="text-align:left;margin:0">' + c.progresso.concluidas + '/' + c.progresso.total_aulas + ' aulas (' + c.progresso.pct + '%)</span> ' +
            '<button class="btn peq" data-curso="' + c.product_id + '">' + (c.progresso.pct > 0 ? 'Continuar' : 'Começar') + '</button></div>';
        }).join('');
      }
      html += '</div>';
      if ((d.assinaturas || []).length) {
        html += '<div class="card"><h3>🔁 Minhas assinaturas</h3>' + d.assinaturas.map(function (a) {
          return '<div class="lin"><b>' + esc(a.produto_titulo) + '</b> · ' + brl(a.valor_centavos) + '/mês · ' + (STATUS_ASSINATURA[a.status] || esc(a.status)) +
            (a.status === 'ativa' ? ' <button class="btn peq" data-curso="' + a.product_id + '">Abrir clube</button> <button class="btn peq secund" data-cancsub="' + a.id + '">Cancelar</button>' : '') + '</div>';
        }).join('') + '</div>';
      }
      html += cartaoVireProdutorAfiliado();
      setView(html);
      Array.prototype.forEach.call(document.querySelectorAll('[data-curso]'), function (b) {
        b.onclick = function () { vCurso(b.getAttribute('data-curso')); };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-cancsub]'), function (b) {
        b.onclick = function () {
          if (!confirm('Cancelar a assinatura? O acesso ao clube termina agora.')) return;
          api('POST', '/assinaturas/' + b.getAttribute('data-cancsub') + '/cancelar').then(vAluno).catch(function (e) { alert(e.message); });
        };
      });
      ligarOnboarding();
    }).catch(erroBox);
  }

  function embedDe(url) { // YouTube/Vimeo → iframe; outros → link
    var m = String(url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,20})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = String(url || '').match(/vimeo\.com\/(\d+)/);
    if (m) return 'https://player.vimeo.com/video/' + m[1];
    return null;
  }

  function vCurso(pid) {
    api('GET', '/aluno/cursos/' + pid).then(function (d) {
      var pa = d.progresso_aulas || {};
      var html = '<div class="card"><p><a href="#" id="b-volta">← biblioteca</a></p><h3>' + esc(d.produto.titulo) + '</h3>' +
        (d.produto.subtitulo ? '<p class="sub" style="text-align:left">' + esc(d.produto.subtitulo) + '</p>' : '') +
        (d.matriculado ? '<div style="max-width:340px">' + barra(d.progresso.pct) + '</div><p class="sub" style="text-align:left;margin:4px 0 0">' + d.progresso.concluidas + '/' + d.progresso.total_aulas + ' aulas concluídas' +
          (d.progresso.pct === 100 ? ' · <a href="#" id="b-cert">🎓 Emitir certificado</a>' : '') + '</p>'
          : '<div class="aviso">Você não está matriculado — só as aulas de degustação estão liberadas.</div>') + '</div>';
      if ((d.incluidos || []).length) {
        html += '<div class="card"><b>🎁 Incluído na sua assinatura</b>' + d.incluidos.map(function (i) {
          return '<div class="lin">' + (TIPOS_PROD[i.tipo] || '') + ' <a href="#" data-curso-inc="' + i.product_id + '">' + esc(i.titulo) + '</a></div>';
        }).join('') + '</div>';
      }
      html += d.estrutura.map(function (mo) {
        return '<div class="card"><b>📚 ' + esc(mo.titulo) + '</b>' + mo.aulas.map(function (a) {
          var feito = pa[a.id] && pa[a.id].concluida;
          return '<div class="lin">' + (a.liberada
            ? '<a href="#" data-aula="' + a.id + '" data-pid="' + pid + '">' + (feito ? '✅' : '▫️') + ' ' + esc(a.titulo) + '</a>' + (a.gratuita ? ' <span class="chip">degustação</span>' : '')
            : '🔒 <span style="color:#888">' + esc(a.titulo) + '</span>') + '</div>';
        }).join('') + '</div>';
      }).join('');
      if (d.matriculado) {
        html += '<div class="card"><b>⭐ Avaliar este produto</b><br>' +
          '<select id="av-nota" style="max-width:90px"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select> ' +
          '<input id="av-texto" placeholder="Conte como foi (opcional)" style="max-width:380px"> ' +
          '<button class="btn peq" id="b-avaliar">Enviar</button> <span id="av-msg" class="erro"></span></div>';
      }
      if (d.matriculado) {
        html += '<div class="card"><b>🤖 Tirar dúvida com o tutor IA</b><br>' +
          '<input id="ia-perg" placeholder="Pergunte algo sobre o conteúdo deste curso" style="max-width:420px"> ' +
          '<button class="btn peq" id="b-ia-perg">Perguntar</button> <span id="ia-perg-msg" class="erro"></span>' +
          '<div id="ia-perg-out"></div></div>';
      }
      html += '<p class="sub" style="text-align:left"><a href="#" id="b-denunciar">🚩 Denunciar conteúdo irregular</a></p>';
      html += '<div id="player"></div>';
      setView(html);
      el('b-volta').onclick = function (e) { e.preventDefault(); vAluno(); };
      Array.prototype.forEach.call(document.querySelectorAll('[data-curso-inc]'), function (lk) {
        lk.onclick = function (e) { e.preventDefault(); vCurso(lk.getAttribute('data-curso-inc')); };
      });
      if (el('b-cert')) el('b-cert').onclick = function (e) {
        e.preventDefault();
        api('POST', '/aluno/cursos/' + pid + '/certificado').then(function (r) {
          window.open(r.url, '_blank');
        }).catch(function (er) { alert(er.message); });
      };
      if (el('b-ia-perg')) el('b-ia-perg').onclick = function () {
        el('ia-perg-msg').textContent = '⏳ pensando…';
        api('POST', '/ia/aluno/perguntar', { product_id: pid, pergunta: val('ia-perg') }).then(function (d) {
          el('ia-perg-msg').textContent = '';
          el('ia-perg-out').innerHTML = '<div class="aviso">' + esc(d.resposta || '') +
            (d.aula_referencia ? '<br><span class="chip">📚 ' + esc(d.aula_referencia) + '</span>' : '') +
            (d.nao_encontrado ? '<br><i>Não achei isso no conteúdo — vale perguntar ao produtor.</i>' : '') + '</div>';
        }).catch(function (e) { el('ia-perg-msg').textContent = e.message; });
      };
      if (el('b-avaliar')) el('b-avaliar').onclick = function () {
        api('POST', '/aluno/cursos/' + pid + '/avaliar', { nota: val('av-nota'), texto: val('av-texto') })
          .then(function () { el('av-msg').textContent = '✅ obrigado!'; }).catch(function (e) { el('av-msg').textContent = e.message; });
      };
      el('b-denunciar').onclick = function (e) {
        e.preventDefault();
        var motivo = prompt('Motivo (direitos-autorais, enganoso, ilegal, adulto, outro):', 'outro');
        if (motivo == null) return;
        var texto = prompt('Descreva o problema:') || '';
        api('POST', '/denunciar', { product_id: pid, motivo: motivo, texto: texto })
          .then(function () { alert('Denúncia registrada. Obrigado.'); }).catch(function (er) { alert(er.message); });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-aula]'), function (lk) {
        lk.onclick = function (e) {
          e.preventDefault();
          var aula = null;
          d.estrutura.forEach(function (mo) { mo.aulas.forEach(function (a) { if (a.id === lk.getAttribute('data-aula')) aula = a; }); });
          abrirAula(pid, aula, pa, d.matriculado);
        };
      });
    }).catch(erroBox);
  }

  function abrirAula(pid, a, pa, matriculado) {
    if (!a) return;
    var corpo = '';
    var media = a.media_id ? '/academy/api/media/' + a.media_id : '';
    if (a.tipo === 'video') {
      if (a.media_id) { // vídeo nativo (F7): player com URL assinada temporária
        corpo = '<div id="vd-box"><p class="sub">Carregando vídeo…</p></div>';
        setTimeout(function () {
          api('GET', '/media/' + a.media_id + '/link').then(function (d) {
            var vb = el('vd-box');
            if (vb) vb.innerHTML = '<video controls playsinline style="width:100%;border-radius:10px;background:#000" src="' + esc(d.url) + '"></video>' +
              '<p class="sub" style="text-align:left">Link do vídeo é temporário e pessoal.</p>';
          }).catch(function (e) { var vb = el('vd-box'); if (vb) vb.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
        }, 0);
      } else {
        var emb = embedDe(a.url_externa);
        corpo = emb ? '<iframe src="' + emb + '" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px" allowfullscreen></iframe>'
          : (a.url_externa ? '<p><a class="btn peq" href="' + esc(a.url_externa) + '" target="_blank" rel="noopener">▶️ Assistir vídeo</a></p>' : '<p class="sub">Vídeo ainda não configurado.</p>');
      }
    } else if (a.tipo === 'pdf' && media) {
      corpo = '<iframe src="' + media + '" style="width:100%;height:70vh;border:1px solid #E2E6EC;border-radius:10px"></iframe>';
    } else if (a.tipo === 'audio' && media) {
      corpo = '<audio controls style="width:100%" src="' + media + '"></audio>';
    } else if (a.tipo === 'arquivo' && media) {
      corpo = '<p><a class="btn peq" href="' + media + '" target="_blank">⬇️ Abrir arquivo</a></p>';
    } else if (a.tipo === 'link' && a.url_externa) {
      corpo = '<p><a class="btn peq" href="' + esc(a.url_externa) + '" target="_blank" rel="noopener">🔗 Abrir link</a></p>';
    }
    if (a.conteudo) corpo += '<div style="white-space:pre-wrap;margin-top:10px">' + esc(a.conteudo) + '</div>';
    var mats = (a.materiais || []).map(function (m) {
      return '<div class="lin">📎 <a href="/academy/api/media/' + m.media_id + '" target="_blank">' + esc(m.nome) + '</a></div>';
    }).join('');
    var feito = pa[a.id] && pa[a.id].concluida;
    el('player').innerHTML = '<div class="card"><h3>' + esc(a.titulo) + '</h3>' + corpo +
      (mats ? '<p style="margin-top:12px"><b>Materiais</b></p>' + mats : '') +
      (matriculado || a.gratuita ? '<p style="margin-top:14px"><button class="btn peq ' + (feito ? 'secund' : '') + '" id="b-feito">' +
        (feito ? '↩️ Desmarcar conclusão' : '✅ Marcar como concluída') + '</button></p>' : '') + '</div>';
    el('player').scrollIntoView({ behavior: 'smooth' });
    var bf = el('b-feito');
    if (bf) bf.onclick = function () {
      api('POST', '/aluno/aulas/' + a.id + '/progresso', { concluida: !feito }).then(function () { vCurso(pid); }).catch(function (e) { alert(e.message); });
    };
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

  // ================= PRODUTOR: produtos + builder + alunos =================
  function vProdutor() {
    Promise.all([api('GET', '/produtor/dashboard'), api('GET', '/produtor/produtos')]).then(function (rs) {
      var db = rs[0].dashboard, lp = rs[1];
      var html = '<div class="card"><h3>🎬 Painel do produtor</h3>' +
        '<span class="kpi"><b>' + db.produtos + '</b>produtos</span>' +
        '<span class="kpi"><b>' + db.publicados + '</b>publicados</span>' +
        '<span class="kpi"><b>' + db.alunos + '</b>alunos</span>' +
        '<span class="kpi"><b>' + brl(db.vendas_mes_centavos) + '</b>líquido no mês</span></div>';
      html += '<div class="card"><h3>💵 Vendas</h3><div id="pd-vendas"><p class="sub">Carregando…</p></div></div>';
      html += '<div class="card"><h3>➕ Novo produto</h3>' +
        '<input id="np-titulo" placeholder="Título *" style="max-width:420px"> ' +
        '<select id="np-tipo" style="max-width:180px">' + Object.keys(TIPOS_PROD).map(function (t) { return '<option value="' + t + '">' + TIPOS_PROD[t] + '</option>'; }).join('') + '</select> ' +
        '<button class="btn peq" id="b-np">Criar rascunho</button> <span id="np-msg" class="erro"></span></div>';
      html += '<div class="card"><h3>📦 Meus produtos</h3>' + (lp.produtos.length
        ? '<table><tr><th>Produto</th><th>Tipo</th><th>Preço</th><th>Status</th><th></th></tr>' + lp.produtos.map(function (p) {
          return '<tr><td>' + esc(p.titulo) + '</td><td>' + (TIPOS_PROD[p.tipo] || esc(p.tipo)) + '</td><td>' + brl(p.preco_centavos) +
            '</td><td>' + (STATUS_PRODUTO[p.status] || esc(p.status)) + (p.status === 'rejeitado' && p.motivo_status ? '<br><span class="sub" style="text-align:left;margin:0">' + esc(p.motivo_status) + '</span>' : '') +
            '</td><td><button class="btn peq" data-abre="' + p.id + '">Abrir</button></td></tr>';
        }).join('') + '</table>' : '<p class="sub" style="text-align:left">Nenhum produto ainda — crie o primeiro acima.</p>') + '</div>';
      setView(html);
      el('b-np').onclick = function () {
        api('POST', '/produtor/produtos', { titulo: val('np-titulo'), tipo: val('np-tipo') })
          .then(function (r) { vProduto(r.produto.id); }).catch(function (e) { el('np-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-abre]'), function (b) {
        b.onclick = function () { vProduto(b.getAttribute('data-abre')); };
      });
      api('GET', '/produtor/vendas').then(function (dv) {
        el('pd-vendas').innerHTML = dv.vendas.length
          ? '<table><tr><th>Produto</th><th>Comprador</th><th>Valor</th><th>Seu líquido</th><th>Status</th><th>Data</th></tr>' + dv.vendas.map(function (o) {
            return '<tr><td>' + esc(o.produto_titulo) + '</td><td>' + esc(o.comprador_nome) + '</td><td>' + brl(o.valor_centavos) +
              '</td><td>' + brl(o.liquido_produtor_centavos) + '</td><td>' + (STATUS_PEDIDO[o.status] || esc(o.status)) + '</td><td>' + dt(o.criado_em) + '</td></tr>';
          }).join('') + '</table>'
          : '<p class="sub" style="text-align:left">Nenhuma venda ainda. Publique e divulgue a página do seu produto.</p>';
      }).catch(function (e) { el('pd-vendas').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
    }).catch(erroBox);
  }

  function upload(inputEl) { // lê o <input type=file> e sobe via base64; retorna Promise<media_id>
    return new Promise(function (resolve, reject) {
      var f = inputEl.files && inputEl.files[0];
      if (!f) return reject(new Error('Escolha um arquivo.'));
      if (String(f.type).indexOf('video/') === 0) return resolve(uploadGrande(f)); // vídeo → direto ao bucket
      if (f.size > 10 * 1024 * 1024) return reject(new Error('Arquivo acima de 10 MB (vídeos vão pelo upload direto).'));
      var rd = new FileReader();
      rd.onload = function () {
        var b64 = String(rd.result).split(',')[1] || '';
        api('POST', '/produtor/upload', { nome: f.name, mime: f.type, conteudo_base64: b64 })
          .then(function (r) { resolve(r.id); }).catch(reject);
      };
      rd.onerror = function () { reject(new Error('Falha ao ler o arquivo.')); };
      rd.readAsDataURL(f);
    });
  }
  // F7: vídeo sobe DIRETO ao storage (presigned PUT), sem passar pelo servidor
  function uploadGrande(f) {
    var mediaId;
    return api('POST', '/produtor/upload-grande', { nome: f.name, mime: f.type, tamanho: f.size })
      .then(function (r) {
        mediaId = r.id;
        return fetch(r.upload_url, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f });
      })
      .then(function (r) { if (!r.ok) throw new Error('Falha ao enviar o vídeo ao storage (' + r.status + ').'); })
      .then(function () { return api('POST', '/produtor/upload-grande/' + mediaId + '/confirmar'); })
      .then(function () { return mediaId; });
  }

  function vProduto(pid) {
    api('GET', '/produtor/produtos/' + pid).then(function (d) {
      var p = d.produto;
      var acoes = { rascunho: [['em_revisao', '📤 Enviar para revisão']], rejeitado: [['em_revisao', '📤 Reenviar para revisão']], aprovado: [['publicado', '🟢 Publicar']], publicado: [['pausado', '⏸️ Pausar']], pausado: [['publicado', '🟢 Republicar']] }[p.status] || [];
      var html = '<div class="card"><p><a href="#" id="b-volta">← meus produtos</a></p>' +
        '<h3>' + esc(p.titulo) + ' <span class="chip">' + (TIPOS_PROD[p.tipo] || esc(p.tipo)) + '</span> ' + (STATUS_PRODUTO[p.status] || esc(p.status)) + '</h3>' +
        (p.status === 'rejeitado' && p.motivo_status ? '<div class="aviso">Motivo da rejeição: ' + esc(p.motivo_status) + '</div>' : '') +
        '<label>Título</label><input id="e-titulo" value="' + esc(p.titulo) + '">' +
        '<label>Subtítulo</label><input id="e-sub" value="' + esc(p.subtitulo) + '">' +
        '<label>Descrição curta (vitrine)</label><input id="e-curta" value="' + esc(p.descricao_curta) + '">' +
        '<label>Descrição longa</label><textarea id="e-longa" rows="4">' + esc(p.descricao_longa) + '</textarea>' +
        '<label>Preço (R$)</label><input id="e-preco" value="' + (p.preco_centavos / 100).toFixed(2).replace('.', ',') + '" style="max-width:140px">' +
        '<label>Comissão do afiliado % (vazio = padrão da plataforma; 0 = sem afiliados)</label><input id="e-afpct" value="' + (p.afiliado_pct == null ? '' : p.afiliado_pct) + '" style="max-width:140px">' +
        '<p><button class="btn peq" id="b-salvar">💾 Salvar</button> ' +
        acoes.map(function (a) { return '<button class="btn peq secund" data-st="' + a[0] + '">' + a[1] + '</button>'; }).join(' ') +
        ' <span id="e-msg" class="erro"></span></p></div>';

      // builder
      html += '<div class="card"><h3>🧱 Conteúdo</h3><div id="builder">' + d.estrutura.map(function (mo) {
        return '<div class="lin"><b>📚 ' + esc(mo.titulo) + '</b> <button class="btn peq secund" data-delmod="' + mo.id + '">🗑️</button>' +
          mo.aulas.map(function (a) {
            return '<div style="margin:4px 0 4px 18px">' + (a.gratuita ? '🎁' : '▫️') + ' ' + esc(a.titulo) + ' <span class="chip">' + esc(a.tipo) + '</span> ' +
              '<button class="btn peq secund" data-delaula="' + a.id + '">🗑️</button>' +
              (a.materiais.length ? '<span class="sub" style="text-align:left;margin:0"> · ' + a.materiais.length + ' material(is)</span>' : '') + '</div>';
          }).join('') +
          '<div style="margin:8px 0 0 18px;background:#f7f4fd;border-radius:9px;padding:8px">' +
          '<input class="na-titulo" data-mod="' + mo.id + '" placeholder="Título da nova aula" style="max-width:280px"> ' +
          '<select class="na-tipo" data-mod="' + mo.id + '" style="max-width:120px">' + d.tipos_aula.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select> ' +
          '<input class="na-url" data-mod="' + mo.id + '" placeholder="URL (vídeo/link)" style="max-width:220px"> ' +
          '<input class="na-file" data-mod="' + mo.id + '" type="file" style="max-width:220px"> ' +
          '<label style="display:inline;font-weight:400"><input class="na-gratis" data-mod="' + mo.id + '" type="checkbox" style="width:auto"> degustação</label> ' +
          '<button class="btn peq" data-addaula="' + mo.id + '">+ Aula</button></div></div>';
      }).join('') + '</div>' +
        '<p style="margin-top:10px"><input id="nm-titulo" placeholder="Título do novo módulo" style="max-width:300px"> ' +
        '<button class="btn peq" id="b-addmod">+ Módulo</button> <span id="bl-msg" class="erro"></span></p></div>';

      // clube (FASE 6): produtos incluídos na assinatura
      if (p.tipo === 'clube') {
        html += '<div class="card"><h3>🔁 Produtos incluídos no clube</h3><div id="cl-box"><p class="sub">Carregando…</p></div></div>';
      }

      // IA do produtor (FASE 9)
      html += '<div class="card"><h3>🤖 IA do produtor</h3>' +
        '<p><button class="btn peq" id="ia-estr">🧱 Estruturar curso</button> ' +
        '<button class="btn peq" id="ia-copy">✍️ Gerar página de venda</button> ' +
        '<button class="btn peq" id="ia-ped">🎓 Sugestões pedagógicas</button> <span id="ia-msg" class="erro"></span></p>' +
        '<p class="sub" style="text-align:left;margin:0">A IA sugere — você revisa e aplica. Nada é publicado sozinho.</p>' +
        '<div id="ia-out"></div></div>';

      // capa + página de venda (FASE 3)
      html += '<div class="card"><h3>🖼️ Capa</h3>' +
        (p.capa_media_id ? '<p class="sub" style="text-align:left">Capa atual definida.' + (p.status === 'publicado' ? ' <a href="/academy/capa/' + p.id + '" target="_blank">ver</a>' : '') + '</p>' : '<p class="sub" style="text-align:left">Sem capa — imagens 16:9 (jpg/png/webp) até 10 MB.</p>') +
        '<input id="capa-file" type="file" accept="image/*" style="max-width:280px"> <button class="btn peq" id="b-capa">Enviar capa</button> <span id="capa-msg" class="erro"></span></div>';
      html += '<div class="card"><h3>🛍️ Página de venda</h3><div id="pv-box"><p class="sub">Carregando…</p></div></div>';

      // alunos
      html += '<div class="card"><h3>👥 Alunos</h3><div id="pd-alunos"><p class="sub">Carregando…</p></div>' +
        '<p><input id="mt-email" type="email" placeholder="e-mail do aluno (conta já criada)" style="max-width:300px"> ' +
        '<button class="btn peq" id="b-mt">🎁 Matricular cortesia</button> <span id="mt-msg" class="erro"></span></p></div>';

      setView(html);
      el('b-volta').onclick = function (e) { e.preventDefault(); vProdutor(); };
      el('b-salvar').onclick = function () {
        api('PATCH', '/produtor/produtos/' + pid, { titulo: val('e-titulo'), subtitulo: val('e-sub'), descricao_curta: val('e-curta'), descricao_longa: val('e-longa'), preco_centavos: centavos(val('e-preco')), afiliado_pct: val('e-afpct') })
          .then(function () { vProduto(pid); }).catch(function (e) { el('e-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-st]'), function (b) {
        b.onclick = function () {
          api('POST', '/produtor/produtos/' + pid + '/status', { status: b.getAttribute('data-st') })
            .then(function () { vProduto(pid); }).catch(function (e) { el('e-msg').textContent = e.message; });
        };
      });
      el('b-addmod').onclick = function () {
        api('POST', '/produtor/produtos/' + pid + '/modulos', { titulo: val('nm-titulo') })
          .then(function () { vProduto(pid); }).catch(function (e) { el('bl-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-delmod]'), function (b) {
        b.onclick = function () { if (confirm('Remover módulo e suas aulas?')) api('DELETE', '/produtor/produtos/' + pid + '/modulos/' + b.getAttribute('data-delmod')).then(function () { vProduto(pid); }).catch(function (e) { alert(e.message); }); };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-delaula]'), function (b) {
        b.onclick = function () { if (confirm('Remover aula?')) api('DELETE', '/produtor/produtos/' + pid + '/aulas/' + b.getAttribute('data-delaula')).then(function () { vProduto(pid); }).catch(function (e) { alert(e.message); }); };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-addaula]'), function (b) {
        b.onclick = function () {
          var mid = b.getAttribute('data-addaula');
          var q = function (cls) { return document.querySelector('.' + cls + '[data-mod="' + mid + '"]'); };
          var corpo = { titulo: q('na-titulo').value, tipo: q('na-tipo').value, url_externa: q('na-url').value, gratuita: q('na-gratis').checked };
          var fileEl = q('na-file');
          var fluxo = (fileEl.files && fileEl.files[0])
            ? upload(fileEl).then(function (mediaId) { corpo.media_id = mediaId; })
            : Promise.resolve();
          fluxo.then(function () { return api('POST', '/produtor/produtos/' + pid + '/modulos/' + mid + '/aulas', corpo); })
            .then(function () { vProduto(pid); }).catch(function (e) { el('bl-msg').textContent = e.message; });
        };
      });
      api('GET', '/produtor/produtos/' + pid + '/alunos').then(function (da) {
        el('pd-alunos').innerHTML = da.alunos.length
          ? '<table><tr><th>Nome</th><th>E-mail</th><th>Origem</th><th>Status</th><th>Desde</th><th></th></tr>' + da.alunos.map(function (a) {
            return '<tr><td>' + esc(a.nome) + '</td><td>' + esc(a.email) + '</td><td>' + esc(a.origem) + '</td><td>' + esc(a.status) + '</td><td>' + dt(a.criado_em) +
              '</td><td>' + (a.status === 'ativa' ? '<button class="btn peq secund" data-rev="' + a.id + '">Revogar</button>' : '') + '</td></tr>';
          }).join('') + '</table>' : '<p class="sub" style="text-align:left">Nenhum aluno ainda.</p>';
        Array.prototype.forEach.call(document.querySelectorAll('[data-rev]'), function (b) {
          b.onclick = function () { api('POST', '/produtor/produtos/' + pid + '/matriculas/' + b.getAttribute('data-rev') + '/revogar').then(function () { vProduto(pid); }).catch(function (e) { alert(e.message); }); };
        });
      });
      el('b-mt').onclick = function () {
        api('POST', '/produtor/produtos/' + pid + '/matricular', { email: val('mt-email') })
          .then(function () { vProduto(pid); }).catch(function (e) { el('mt-msg').textContent = e.message; });
      };
      el('b-capa').onclick = function () {
        upload(el('capa-file')).then(function (mediaId) {
          return api('PATCH', '/produtor/produtos/' + pid, { capa_media_id: mediaId });
        }).then(function () { vProduto(pid); }).catch(function (e) { el('capa-msg').textContent = e.message; });
      };
      editorPaginaVenda(pid);
      if (p.tipo === 'clube') gestorClube(pid);
      ligarIAProdutor(pid);
    }).catch(erroBox);
  }

  function ligarIAProdutor(pid) {
    var out = function (html) { el('ia-out').innerHTML = html; };
    var ocupado = function (b) { el('ia-msg').textContent = b ? '⏳ pensando…' : ''; };
    el('ia-estr').onclick = function () {
      var tema = prompt('Tema/foco do curso (vazio = usar o título):') || '';
      ocupado(true);
      api('POST', '/ia/produtor/estruturar', { product_id: pid, tema: tema }).then(function (d) {
        ocupado(false);
        var e = d.estrutura;
        out('<div class="aviso"><b>Estrutura sugerida:</b>' + (e.modulos || []).map(function (m) {
          return '<br><b>📚 ' + esc(m.titulo) + '</b>' + (m.aulas || []).map(function (a) {
            return '<br>&nbsp;&nbsp;▫️ ' + esc(a.titulo) + ' <span class="chip">' + esc(a.tipo || 'texto') + '</span>' + (a.objetivo ? ' — ' + esc(a.objetivo) : '');
          }).join('');
        }).join('') + (e.observacoes ? '<br><i>' + esc(e.observacoes) + '</i>' : '') +
          '<p><button class="btn peq" id="ia-aplicar">✅ Aplicar (cria módulos/aulas rascunho)</button></p></div>');
        el('ia-aplicar').onclick = function () {
          api('POST', '/ia/produtor/estruturar/aplicar', { product_id: pid, estrutura: e })
            .then(function (r) { alert(r.modulos + ' módulo(s) e ' + r.aulas + ' aula(s) criados.'); vProduto(pid); })
            .catch(function (er) { alert(er.message); });
        };
      }).catch(function (e) { ocupado(false); el('ia-msg').textContent = e.message; });
    };
    el('ia-copy').onclick = function () {
      ocupado(true);
      api('POST', '/ia/produtor/copy', { product_id: pid }).then(function (d) {
        ocupado(false);
        var sc = d.secoes;
        out('<div class="aviso"><b>Página de venda sugerida:</b><br><b>' + esc(sc.headline || '') + '</b><br>' + esc(sc.subheadline || '') +
          '<br>' + esc(sc.promessa || '') + '<br>✅ ' + (sc.beneficios || []).map(esc).join(' · ') +
          (sc.observacoes ? '<br><i>' + esc(sc.observacoes) + '</i>' : '') +
          '<p><button class="btn peq" id="ia-copy-apl">✅ Aplicar na página de venda</button></p></div>');
        el('ia-copy-apl').onclick = function () {
          api('PUT', '/produtor/produtos/' + pid + '/pagina', sc)
            .then(function () { alert('Página de venda atualizada — revise no editor abaixo.'); vProduto(pid); })
            .catch(function (er) { alert(er.message); });
        };
      }).catch(function (e) { ocupado(false); el('ia-msg').textContent = e.message; });
    };
    el('ia-ped').onclick = function () {
      ocupado(true);
      api('POST', '/ia/produtor/pedagogico', { product_id: pid }).then(function (d) {
        ocupado(false);
        out('<div class="aviso"><b>Avaliação pedagógica:</b> ' + esc(d.avaliacao || '') +
          '<br><b>Sugestões:</b> ' + (d.sugestoes || []).map(esc).join(' · ') +
          ((d.quiz || []).length ? '<br><b>Quiz sugerido:</b>' + d.quiz.map(function (q, i) {
            return '<br>' + (i + 1) + '. ' + esc(q.pergunta) + ' <span class="chip">' + esc(q.aula || '') + '</span>';
          }).join('') : '') + '</div>');
      }).catch(function (e) { ocupado(false); el('ia-msg').textContent = e.message; });
    };
  }

  function gestorClube(pid) {
    api('GET', '/produtor/produtos/' + pid + '/clube').then(function (d) {
      var itens = d.itens.map(function (i) {
        return '<div class="lin">' + (TIPOS_PROD[i.tipo] || '') + ' ' + esc(i.titulo) +
          ' <button class="btn peq secund" data-clrm="' + i.product_id + '">Remover</button></div>';
      }).join('') || '<p class="sub" style="text-align:left">Nenhum produto incluído ainda.</p>';
      var opts = d.candidatos.filter(function (c) { return !d.itens.some(function (i) { return i.product_id === c.id; }); })
        .map(function (c) { return '<option value="' + c.id + '">' + esc(c.titulo) + '</option>'; }).join('');
      el('cl-box').innerHTML = itens +
        (opts ? '<p style="margin-top:10px"><select id="cl-add" style="max-width:320px">' + opts + '</select> <button class="btn peq" id="b-cladd">+ Incluir no clube</button> <span id="cl-msg" class="erro"></span></p>'
          : '<p class="sub" style="text-align:left">Publique outros produtos seus para poder incluí-los.</p>') +
        '<p class="sub" style="text-align:left">Assinantes ativos têm acesso a tudo que está incluído + ao conteúdo próprio do clube.</p>';
      if (el('b-cladd')) el('b-cladd').onclick = function () {
        api('POST', '/produtor/produtos/' + pid + '/clube/itens', { product_id: val('cl-add') })
          .then(function () { gestorClube(pid); }).catch(function (e) { el('cl-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(document.querySelectorAll('[data-clrm]'), function (b) {
        b.onclick = function () {
          api('DELETE', '/produtor/produtos/' + pid + '/clube/itens/' + b.getAttribute('data-clrm'))
            .then(function () { gestorClube(pid); }).catch(function (e) { alert(e.message); });
        };
      });
    }).catch(function (e) { el('cl-box').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
  }

  // editor da página de venda: listas em textarea (1 item por linha);
  // depoimentos "Nome | texto" e FAQ "Pergunta | Resposta"
  function editorPaginaVenda(pid) {
    api('GET', '/produtor/produtos/' + pid + '/pagina').then(function (d) {
      var sp = d.secoes || {};
      var linhas = function (arr) { return (arr || []).join('\n'); };
      var pares = function (arr, a, b) { return (arr || []).map(function (x) { return (x[a] || '') + ' | ' + (x[b] || ''); }).join('\n'); };
      el('pv-box').innerHTML =
        (d.url_publica ? '<p class="sub" style="text-align:left">🌐 Página pública: <a href="' + d.url_publica + '" target="_blank">' + d.url_publica + '</a></p>'
          : '<p class="sub" style="text-align:left">A página pública aparece no marketplace quando o produto for publicado.</p>') +
        '<label>Headline</label><input id="pv-head" value="' + esc(sp.headline || '') + '">' +
        '<label>Sub-headline</label><input id="pv-sub" value="' + esc(sp.subheadline || '') + '">' +
        '<label>Vídeo de vendas (YouTube/Vimeo)</label><input id="pv-video" value="' + esc(sp.video_url || '') + '">' +
        '<label>Promessa</label><textarea id="pv-prom" rows="2">' + esc(sp.promessa || '') + '</textarea>' +
        '<label>Benefícios (1 por linha)</label><textarea id="pv-benef" rows="3">' + esc(linhas(sp.beneficios)) + '</textarea>' +
        '<label>Para quem é (1 por linha)</label><textarea id="pv-quem" rows="2">' + esc(linhas(sp.para_quem)) + '</textarea>' +
        '<label>O que vai aprender (1 por linha)</label><textarea id="pv-apr" rows="3">' + esc(linhas(sp.aprender)) + '</textarea>' +
        '<label>Bônus (1 por linha)</label><textarea id="pv-bonus" rows="2">' + esc(linhas(sp.bonus)) + '</textarea>' +
        '<label>Depoimentos (Nome | texto — 1 por linha)</label><textarea id="pv-dep" rows="3">' + esc(pares(sp.depoimentos, 'nome', 'texto')) + '</textarea>' +
        '<label>FAQ (Pergunta | Resposta — 1 por linha)</label><textarea id="pv-faq" rows="3">' + esc(pares(sp.faq, 'p', 'r')) + '</textarea>' +
        '<label>Texto da garantia</label><input id="pv-gar" value="' + esc(sp.garantia_texto || '') + '">' +
        '<p><button class="btn peq" id="pv-salvar">💾 Salvar página de venda</button> <span id="pv-msg" class="erro"></span></p>';
      var deLinhas = function (id) { return val(id).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
      var dePares = function (id, a, b) {
        return val(id).split('\n').map(function (x) {
          var i = x.indexOf('|'); if (i < 0) return null;
          var o = {}; o[a] = x.slice(0, i).trim(); o[b] = x.slice(i + 1).trim(); return o;
        }).filter(Boolean);
      };
      el('pv-salvar').onclick = function () {
        api('PUT', '/produtor/produtos/' + pid + '/pagina', {
          headline: val('pv-head'), subheadline: val('pv-sub'), video_url: val('pv-video'), promessa: val('pv-prom'),
          beneficios: deLinhas('pv-benef'), para_quem: deLinhas('pv-quem'), aprender: deLinhas('pv-apr'), bonus: deLinhas('pv-bonus'),
          depoimentos: dePares('pv-dep', 'nome', 'texto'), faq: dePares('pv-faq', 'p', 'r'), garantia_texto: val('pv-gar'),
        }).then(function () { el('pv-msg').textContent = '✅ salvo'; }).catch(function (e) { el('pv-msg').textContent = e.message; });
      };
    }).catch(function (e) { el('pv-box').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
  }

  // ================= AFILIADO =================
  var STATUS_COMISSAO = { pendente: '⏳ pendente (garantia)', disponivel: '💵 disponível', paga: '✅ paga', cancelada: '🚫 cancelada (reembolso)' };
  function vAfiliado() {
    Promise.all([api('GET', '/afiliado/dashboard'), api('GET', '/afiliado/links'), api('GET', '/afiliado/produtos'), api('GET', '/afiliado/extrato')]).then(function (rs) {
      var db = rs[0].dashboard, links = rs[1].links, prods = rs[2].produtos, ext = rs[3];
      var base = location.origin;
      var html = '<div class="card"><h3>🤝 Painel do afiliado</h3>' +
        '<span class="kpi"><b>' + db.cliques + '</b>cliques</span>' +
        '<span class="kpi"><b>' + db.conversoes + '</b>vendas</span>' +
        '<span class="kpi"><b>' + brl(ext.saldos.pendente_centavos) + '</b>pendente</span>' +
        '<span class="kpi"><b>' + brl(ext.saldos.disponivel_centavos) + '</b>disponível</span>' +
        '<span class="kpi"><b>' + brl(ext.saldos.paga_centavos) + '</b>recebido</span>' +
        '<p class="sub" style="text-align:left">Cookie de atribuição: ' + rs[2].cookie_dias + ' dias · comissão pendente libera quando a garantia do produto vence.</p></div>';
      html += '<div class="card"><h3>🔗 Meus links</h3>' + (links.length
        ? '<table><tr><th>Produto</th><th>Link</th><th>Cliques</th><th>Vendas</th></tr>' + links.map(function (l) {
          var url = base + '/academy/cursos/' + l.slug + '?ref=' + l.id;
          return '<tr><td>' + esc(l.titulo) + '</td><td><input readonly value="' + esc(url) + '" style="max-width:280px;margin:0" onclick="this.select()"> ' +
            '<button class="btn peq secund" data-copia="' + esc(url) + '">copiar</button></td><td>' + l.cliques + '</td><td>' + l.conversoes + '</td></tr>';
        }).join('') + '</table>' : '<p class="sub" style="text-align:left">Nenhum link ainda — gere abaixo.</p>') + '</div>';
      html += '<div class="card"><h3>🛍️ Produtos para divulgar</h3>' + (prods.length
        ? '<table><tr><th>Produto</th><th>Produtor</th><th>Preço</th><th>Sua comissão</th><th></th></tr>' + prods.map(function (p) {
          var v = p.preco_promo_centavos || p.preco_centavos;
          return '<tr><td>' + esc(p.titulo) + '</td><td>' + esc(p.produtor_nome) + '</td><td>' + brl(v) + '</td><td>' + p.pct_efetivo + '% (' + brl(Math.round(v * p.pct_efetivo / 100)) + ')' +
            '</td><td><button class="btn peq" data-gera="' + p.id + '">Gerar link</button></td></tr>';
        }).join('') + '</table>' : '<p class="sub" style="text-align:left">Nenhum produto afiliável publicado ainda.</p>') + '</div>';
      html += '<div class="card"><h3>💰 Extrato de comissões</h3>' + (ext.comissoes.length
        ? '<table><tr><th>Produto</th><th>Valor</th><th>%</th><th>Status</th><th>Data</th></tr>' + ext.comissoes.map(function (cm) {
          return '<tr><td>' + esc(cm.produto_titulo) + '</td><td>' + brl(cm.valor_centavos) + '</td><td>' + cm.pct + '%</td><td>' +
            (STATUS_COMISSAO[cm.status] || esc(cm.status)) + '</td><td>' + dt(cm.criado_em) + '</td></tr>';
        }).join('') + '</table><p class="sub" style="text-align:left">O repasse do saldo disponível é feito pela plataforma (Pix) e marcado como pago aqui.</p>'
        : '<p class="sub" style="text-align:left">Nenhuma comissão ainda — divulgue seus links!</p>') + '</div>';
      setView(html);
      Array.prototype.forEach.call(document.querySelectorAll('[data-gera]'), function (b) {
        b.onclick = function () {
          api('POST', '/afiliado/links', { product_id: b.getAttribute('data-gera') }).then(vAfiliado).catch(function (e) { alert(e.message); });
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-copia]'), function (b) {
        b.onclick = function () {
          (navigator.clipboard ? navigator.clipboard.writeText(b.getAttribute('data-copia')) : Promise.reject())
            .then(function () { b.textContent = '✅'; }).catch(function () { alert(b.getAttribute('data-copia')); });
        };
      });
    }).catch(erroBox);
  }

  // ================= ADMIN =================
  function vAdmin() {
    Promise.all([api('GET', '/admin/dashboard'), api('GET', '/admin/produtos?status=em_revisao')]).then(function (rs) {
      var d = rs[0], r = d.dashboard, pend = d.pendentes, prods = rs[1].produtos;
      var linhaPerfil = function (tipo, p) {
        return '<tr><td>' + esc(p.nome) + '<br><span class="sub" style="text-align:left;margin:0">' + esc(p.email) + '</span></td>' +
          '<td>' + tipo + '</td><td>' + esc(p.nome_publico || '') + '</td><td>' + dt(p.criado_em) + '</td>' +
          '<td><button class="btn peq" data-ap="' + tipo + ':' + p.user_id + '">Aprovar</button> ' +
          '<button class="btn peq secund" data-rj="' + tipo + ':' + p.user_id + '">Rejeitar</button></td></tr>';
      };
      var pendentes = (pend.produtores || []).map(function (p) { return linhaPerfil('produtor', p); })
        .concat((pend.afiliados || []).map(function (p) { return linhaPerfil('afiliado', p); })).join('');
      var html = '<div class="card"><h3>🛠️ Plataforma</h3>' +
        '<span class="kpi"><b>' + r.usuarios + '</b>usuários</span>' +
        '<span class="kpi"><b>' + r.produtores_aprovados + '</b>produtores</span>' +
        '<span class="kpi"><b>' + r.afiliados_aprovados + '</b>afiliados</span>' +
        '<span class="kpi"><b>' + r.produtos + '</b>produtos</span>' +
        '<span class="kpi"><b>' + r.cursos_publicados + '</b>publicados</span>' +
        '<span class="kpi"><b>' + r.matriculas_ativas + '</b>matrículas</span>' +
        '<span class="kpi"><b>' + r.perfis_em_analise + '</b>perfis em análise</span>' +
        '<span class="kpi"><b>' + r.produtos_em_revisao + '</b>produtos em revisão</span>' +
        '<span class="kpi"><b>' + r.leads_novos + '</b>leads novos</span>' +
        '<span class="kpi"><b>' + brl(r.gmv_centavos) + '</b>GMV</span>' +
        '<span class="kpi"><b>' + brl(r.receita_plataforma_centavos) + '</b>receita plataforma</span>' +
        '<span class="kpi"><b>' + r.vendas + '</b>vendas</span>' +
        '<span class="kpi"><b>' + r.reembolsos + '</b>reembolsos</span>' +
        '<span class="kpi"><b>' + r.assinaturas_ativas + '</b>assinaturas</span>' +
        '<span class="kpi"><b>' + brl(r.mrr_centavos) + '</b>MRR</span></div>';
      html += '<div class="card"><h3>🔁 Assinaturas</h3><div id="adm-subs"><p class="sub">Carregando…</p></div></div>';
      html += '<div class="card"><h3>📈 Relatórios (6 meses)</h3><div id="adm-rep"><p class="sub">Carregando…</p></div></div>' +
        '<div class="card"><h3>🎧 Tickets de suporte</h3><div id="adm-tk"><p class="sub">Carregando…</p></div></div>';
      html += '<div class="card"><h3>🤖 Relatório executivo (IA)</h3>' +
        '<p><button class="btn peq" id="ia-rel">Gerar relatório</button> <span id="ia-rel-msg" class="erro"></span></p><div id="ia-rel-out"></div></div>';
      html += '<div class="card"><h3>🧾 Pedidos</h3><div id="adm-ped"><p class="sub">Carregando…</p></div></div>' +
        '<div class="card"><h3>💸 Comissões de afiliados</h3><div id="adm-com"><p class="sub">Carregando…</p></div></div>';
      html += '<div class="card"><h3>🧐 Produtos aguardando revisão</h3>' + (prods.length
        ? '<table><tr><th>Produto</th><th>Produtor</th><th>Tipo</th><th>Preço</th><th></th></tr>' + prods.map(function (p) {
          return '<tr><td>' + esc(p.titulo) + '</td><td>' + esc(p.produtor_nome) + '</td><td>' + (TIPOS_PROD[p.tipo] || esc(p.tipo)) + '</td><td>' + brl(p.preco_centavos) +
            '</td><td><button class="btn peq" data-pap="' + p.id + '">Aprovar</button> <button class="btn peq secund" data-prj="' + p.id + '">Rejeitar</button></td></tr>';
        }).join('') + '</table>' : '<p class="sub" style="text-align:left">Nada aguardando revisão.</p>') + '</div>';
      html += '<div class="card"><h3>⏳ Perfis pendentes</h3>' +
        (pendentes ? '<table><tr><th>Quem</th><th>Tipo</th><th>Nome público</th><th>Desde</th><th></th></tr>' + pendentes + '</table>' : '<p class="sub" style="text-align:left">Nada pendente.</p>') + '</div>' +
        '<div class="card"><h3>🚩 Denúncias abertas</h3><div id="adm-den"><p class="sub">Carregando…</p></div></div>' +
        '<div class="card"><h3>⭐ Avaliações (moderação)</h3><div id="adm-rev"><p class="sub">Carregando…</p></div></div>' +
        '<div class="card"><h3>👥 Usuários</h3><div id="adm-users"><p class="sub">Carregando…</p></div></div>' +
        '<div class="card"><h3>📜 Auditoria (últimos eventos)</h3><div id="adm-audit"><p class="sub">Carregando…</p></div></div>';
      setView(html);
      api('GET', '/admin/pedidos?n=50').then(function (dp) {
        el('adm-ped').innerHTML = dp.pedidos.length
          ? '<table><tr><th>Produto</th><th>Comprador</th><th>Valor</th><th>Status</th><th>Data</th><th></th></tr>' + dp.pedidos.map(function (o) {
            return '<tr><td>' + esc(o.produto_titulo) + '</td><td>' + esc(o.comprador_email) + '</td><td>' + (o.valor_centavos ? brl(o.valor_centavos) : 'grátis') +
              '</td><td>' + (STATUS_PEDIDO[o.status] || esc(o.status)) + '</td><td>' + dt(o.criado_em) +
              '</td><td>' + (o.status === 'paga' && o.valor_centavos ? '<button class="btn peq secund" data-reemb="' + o.id + '">↩️ Reembolsar</button>' : '') + '</td></tr>';
          }).join('') + '</table>'
          : '<p class="sub" style="text-align:left">Nenhum pedido ainda.</p>';
        Array.prototype.forEach.call(document.querySelectorAll('[data-reemb]'), function (b) {
          b.onclick = function () {
            var motivo = prompt('Motivo do reembolso (o comprador perde o acesso):');
            if (motivo == null) return;
            api('POST', '/admin/pedidos/' + b.getAttribute('data-reemb') + '/reembolsar', { motivo: motivo }).then(vAdmin).catch(function (e) { alert(e.message); });
          };
        });
      }).catch(function (e) { el('adm-ped').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
      api('GET', '/admin/relatorios').then(function (dr) {
        el('adm-rep').innerHTML = '<table><tr><th>Mês</th><th>GMV</th><th>Receita</th><th>Vendas</th><th>Novos usuários</th><th>Matrículas</th></tr>' +
          dr.serie_mensal.map(function (m) {
            return '<tr><td>' + esc(m.mes) + '</td><td>' + brl(m.gmv_centavos) + '</td><td>' + brl(m.receita_centavos) + '</td><td>' + m.vendas + '</td><td>' + m.novos_usuarios + '</td><td>' + m.novas_matriculas + '</td></tr>';
          }).join('') + '</table>' +
          '<p class="sub" style="text-align:left">Conversão de pedidos: <b>' + (dr.conversao.pct == null ? '—' : dr.conversao.pct + '%') + '</b> (' + dr.conversao.pagos + '/' + dr.conversao.pedidos + ')' +
          ' · Churn do mês: <b>' + (dr.churn.pct == null ? '—' : dr.churn.pct + '%') + '</b>' +
          ' · Tickets abertos: <b>' + dr.tickets_abertos + '</b> · Certificados: <b>' + dr.certificados_emitidos + '</b></p>';
      }).catch(function (e) { el('adm-rep').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
      function carregarTicketsAdm() {
        api('GET', '/admin/tickets?n=30').then(function (dt2) {
          el('adm-tk').innerHTML = dt2.tickets.length
            ? '<table><tr><th>Assunto</th><th>Quem</th><th>Categoria</th><th>Status</th><th></th></tr>' + dt2.tickets.map(function (t) {
              return '<tr><td>' + esc(t.assunto) + '</td><td>' + esc(t.email) + '</td><td>' + esc(t.categoria) + '</td><td>' + esc(t.status) +
                '</td><td><button class="btn peq" data-tka="' + t.id + '">Responder</button> ' +
                (t.status !== 'fechado' ? '<button class="btn peq secund" data-tkf="' + t.id + '">Fechar</button>' : '') + '</td></tr>';
            }).join('') + '</table>'
            : '<p class="sub" style="text-align:left">Nenhum ticket.</p>';
          Array.prototype.forEach.call(document.querySelectorAll('[data-tka]'), function (b) {
            b.onclick = function () {
              api('GET', '/admin/tickets/' + b.getAttribute('data-tka')).then(function (r) {
                var msgs = r.ticket.mensagens.map(function (m) { return (m.lado === 'plataforma' ? '🎧 ' : '🙋 ') + esc(m.texto); }).join('\n\n');
                var resp = prompt(msgs + '\n\nResposta da plataforma:');
                if (resp) api('POST', '/admin/tickets/' + r.ticket.id + '/responder', { texto: resp }).then(carregarTicketsAdm).catch(function (e) { alert(e.message); });
              }).catch(function (e) { alert(e.message); });
            };
          });
          Array.prototype.forEach.call(document.querySelectorAll('[data-tkf]'), function (b) {
            b.onclick = function () {
              api('POST', '/admin/tickets/' + b.getAttribute('data-tkf') + '/status', { status: 'fechado' }).then(carregarTicketsAdm).catch(function (e) { alert(e.message); });
            };
          });
        }).catch(function (e) { el('adm-tk').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
      }
      carregarTicketsAdm();
      el('ia-rel').onclick = function () {
        el('ia-rel-msg').textContent = '⏳ analisando…';
        api('POST', '/ia/admin/relatorio').then(function (d) {
          el('ia-rel-msg').textContent = '';
          el('ia-rel-out').innerHTML = '<div class="aviso">' + esc(d.resumo || '') +
            ((d.destaques || []).length ? '<br><b>Destaques:</b> ' + d.destaques.map(esc).join(' · ') : '') +
            ((d.alertas || []).length ? '<br><b>⚠️ Alertas:</b> ' + d.alertas.map(esc).join(' · ') : '') +
            ((d.recomendacoes || []).length ? '<br><b>👉 Recomendações:</b> ' + d.recomendacoes.map(esc).join(' · ') : '') + '</div>';
        }).catch(function (e) { el('ia-rel-msg').textContent = e.message; });
      };
      api('GET', '/admin/assinaturas?n=50').then(function (ds) {
        el('adm-subs').innerHTML = ds.assinaturas.length
          ? '<table><tr><th>Clube</th><th>Assinante</th><th>Mensalidade</th><th>Status</th><th>Desde</th><th></th></tr>' + ds.assinaturas.map(function (a) {
            return '<tr><td>' + esc(a.produto_titulo) + '</td><td>' + esc(a.assinante_email) + '</td><td>' + brl(a.valor_centavos) +
              '</td><td>' + (STATUS_ASSINATURA[a.status] || esc(a.status)) + '</td><td>' + dt(a.criado_em) +
              '</td><td>' + (['ativa', 'pausada', 'pendente'].indexOf(a.status) >= 0 ? '<button class="btn peq secund" data-subcanc="' + a.id + '">Cancelar</button>' : '') + '</td></tr>';
          }).join('') + '</table>'
          : '<p class="sub" style="text-align:left">Nenhuma assinatura ainda.</p>';
        Array.prototype.forEach.call(document.querySelectorAll('[data-subcanc]'), function (b) {
          b.onclick = function () {
            if (!confirm('Cancelar esta assinatura? O assinante perde o acesso.')) return;
            api('POST', '/admin/assinaturas/' + b.getAttribute('data-subcanc') + '/cancelar').then(vAdmin).catch(function (e) { alert(e.message); });
          };
        });
      }).catch(function (e) { el('adm-subs').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
      api('GET', '/admin/comissoes?n=50').then(function (dc) {
        el('adm-com').innerHTML = dc.comissoes.length
          ? '<table><tr><th>Afiliado</th><th>Produto</th><th>Valor</th><th>Status</th><th>Libera em</th><th></th></tr>' + dc.comissoes.map(function (cm) {
            return '<tr><td>' + esc(cm.afiliado_nome) + '<br><span class="sub" style="text-align:left;margin:0">' + esc(cm.afiliado_email) + '</span></td><td>' + esc(cm.produto_titulo) +
              '</td><td>' + brl(cm.valor_centavos) + ' (' + cm.pct + '%)</td><td>' + (STATUS_COMISSAO[cm.status] || esc(cm.status)) + '</td><td>' + dt(cm.disponivel_em) +
              '</td><td>' + (cm.status === 'disponivel' ? '<button class="btn peq" data-cpag="' + cm.id + '">💸 Marcar paga</button>' : '') + '</td></tr>';
          }).join('') + '</table><p class="sub" style="text-align:left">Repasse manual (Pix) — marque como paga após transferir.</p>'
          : '<p class="sub" style="text-align:left">Nenhuma comissão ainda.</p>';
        Array.prototype.forEach.call(document.querySelectorAll('[data-cpag]'), function (b) {
          b.onclick = function () {
            if (!confirm('Confirma que o repasse já foi transferido ao afiliado?')) return;
            api('POST', '/admin/comissoes/' + b.getAttribute('data-cpag') + '/pagar').then(vAdmin).catch(function (e) { alert(e.message); });
          };
        });
      }).catch(function (e) { el('adm-com').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
      api('GET', '/admin/denuncias').then(function (dd) {
        el('adm-den').innerHTML = dd.denuncias.length
          ? '<table><tr><th>Produto</th><th>Motivo</th><th>Descrição</th><th></th></tr>' + dd.denuncias.map(function (x) {
            return '<tr><td>' + esc(x.produto_titulo) + '</td><td>' + esc(x.motivo) + '</td><td>' + esc(x.texto || '') +
              '</td><td><button class="btn peq" data-denr="' + x.id + '">Resolver</button> <button class="btn peq secund" data-dend="' + x.id + '">Descartar</button></td></tr>';
          }).join('') + '</table>'
          : '<p class="sub" style="text-align:left">Nenhuma denúncia aberta.</p>';
        var acaoDen = function (attr, status) {
          Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (b) {
            b.onclick = function () {
              var res = prompt('Resolução (registrada na denúncia):') || '';
              api('POST', '/admin/denuncias/' + b.getAttribute('data-' + attr) + '/resolver', { status: status, resolucao: res }).then(vAdmin).catch(function (e) { alert(e.message); });
            };
          });
        };
        acaoDen('denr', 'resolvida'); acaoDen('dend', 'descartada');
      }).catch(function (e) { el('adm-den').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
      api('GET', '/admin/avaliacoes?n=30').then(function (dr) {
        el('adm-rev').innerHTML = dr.avaliacoes.length
          ? '<table><tr><th>Produto</th><th>Aluno</th><th>Nota</th><th>Texto</th><th>Status</th><th></th></tr>' + dr.avaliacoes.map(function (r) {
            return '<tr><td>' + esc(r.produto_titulo) + '</td><td>' + esc(r.nome) + '</td><td>' + r.nota + '★</td><td>' + esc(r.texto || '') + '</td><td>' + esc(r.status) +
              '</td><td><button class="btn peq secund" data-mod="' + r.id + ':' + (r.status === 'publicada' ? 'oculta' : 'publicada') + '">' + (r.status === 'publicada' ? 'Ocultar' : 'Republicar') + '</button></td></tr>';
          }).join('') + '</table>'
          : '<p class="sub" style="text-align:left">Nenhuma avaliação ainda.</p>';
        Array.prototype.forEach.call(document.querySelectorAll('[data-mod]'), function (b) {
          b.onclick = function () {
            var kv = b.getAttribute('data-mod').split(':');
            api('POST', '/admin/avaliacoes/' + kv[0] + '/moderar', { status: kv[1] }).then(vAdmin).catch(function (e) { alert(e.message); });
          };
        });
      }).catch(function (e) { el('adm-rev').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
      var decidirPerfil = function (attr, status) {
        Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (b) {
          b.onclick = function () {
            var kv = b.getAttribute('data-' + attr).split(':');
            var motivo = status === 'rejeitado' ? (prompt('Motivo da rejeição (o solicitante vê):') || '') : '';
            api('POST', '/admin/perfis/' + kv[0] + '/' + kv[1] + '/decidir', { status: status, motivo: motivo }).then(vAdmin).catch(function (e) { alert(e.message); });
          };
        });
      };
      decidirPerfil('ap', 'aprovado'); decidirPerfil('rj', 'rejeitado');
      var decidirProduto = function (attr, status) {
        Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (b) {
          b.onclick = function () {
            var motivo = status === 'rejeitado' ? (prompt('Motivo da rejeição (o produtor vê):') || '') : '';
            api('POST', '/admin/produtos/' + b.getAttribute('data-' + attr) + '/decidir', { status: status, motivo: motivo }).then(vAdmin).catch(function (e) { alert(e.message); });
          };
        });
      };
      decidirProduto('pap', 'aprovado'); decidirProduto('prj', 'rejeitado');
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

  var STATUS_PEDIDO = { pendente: '⏳ pendente', paga: '✅ paga', recusada: '❌ recusada', cancelada: '🚫 cancelada', reembolsada: '↩️ reembolsada', expirada: '⌛ expirada' };

  // ================= CONTA (dados, compras, senha, LGPD) =================
  function vConta() {
    var u = ME.usuario;
    setView('<div class="card"><h3>🧾 Minhas compras</h3><div id="c-compras"><p class="sub">Carregando…</p></div></div>' +
      '<div class="card"><h3>🎓 Meus certificados</h3><div id="c-certs"><p class="sub">Carregando…</p></div></div>' +
      '<div class="card"><h3>🎧 Suporte</h3><div id="c-tickets"><p class="sub">Carregando…</p></div>' +
      '<p><input id="tk-assunto" placeholder="Assunto" style="max-width:260px"> ' +
      '<select id="tk-cat" style="max-width:140px"><option value="geral">Geral</option><option value="pagamento">Pagamento</option><option value="conteudo">Conteúdo</option><option value="conta">Conta</option></select></p>' +
      '<textarea id="tk-texto" rows="2" placeholder="Descreva sua dúvida ou problema"></textarea>' +
      '<button class="btn peq" id="b-ticket">Abrir ticket</button> <span id="tk-msg" class="erro"></span></div>' +
      '<div class="card"><h3>🔐 Autenticação em 2 fatores (2FA)</h3><div id="c-2fa">' +
      (u.totp_ativo
        ? '<p>2FA está <b>ativo</b>. <input id="fa-des" placeholder="Código p/ desativar" style="max-width:180px"> <button class="btn peq secund" id="b-2fa-des">Desativar</button> <span id="fa-msg" class="erro"></span></p>'
        : '<p class="sub" style="text-align:left">Proteja sua conta exigindo um código do app autenticador no login.</p><button class="btn peq" id="b-2fa-ger">Ativar 2FA</button> <span id="fa-msg" class="erro"></span><div id="fa-setup"></div>') +
      '</div></div>' +
      '<div class="card"><h3>👤 Meus dados</h3>' +
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
    api('GET', '/aluno/certificados').then(function (d) {
      el('c-certs').innerHTML = d.certificados.length
        ? d.certificados.map(function (c) {
          return '<div class="lin">🎓 <a href="/academy/certificados/' + esc(c.id) + '" target="_blank">' + esc(c.produto_titulo) + '</a> <span class="chip">' + esc(c.id) + '</span> · ' + dt(c.emitido_em) + '</div>';
        }).join('')
        : '<p class="sub" style="text-align:left">Conclua 100% de um curso para emitir o certificado.</p>';
    }).catch(function () { el('c-certs').innerHTML = ''; });
    function carregarTickets() {
      api('GET', '/tickets').then(function (d) {
        el('c-tickets').innerHTML = d.tickets.length
          ? d.tickets.map(function (t) {
            return '<div class="lin"><b>' + esc(t.assunto) + '</b> <span class="chip">' + esc(t.status) + '</span> · ' + dt(t.atualizado_em) +
              ' <button class="btn peq secund" data-tk="' + t.id + '">Ver</button></div>';
          }).join('')
          : '<p class="sub" style="text-align:left">Nenhum ticket. Precisa de ajuda? Abra um abaixo.</p>';
        Array.prototype.forEach.call(document.querySelectorAll('[data-tk]'), function (b) {
          b.onclick = function () {
            api('GET', '/tickets/' + b.getAttribute('data-tk')).then(function (r) {
              var msgs = r.ticket.mensagens.map(function (m) { return (m.lado === 'plataforma' ? '🎧 ' : '🙋 ') + esc(m.texto); }).join('\n\n');
              var resp = prompt(msgs + '\n\nResponder (vazio = só fechar a janela):');
              if (resp) api('POST', '/tickets/' + r.ticket.id + '/responder', { texto: resp }).then(carregarTickets).catch(function (e) { alert(e.message); });
            }).catch(function (e) { alert(e.message); });
          };
        });
      }).catch(function () { el('c-tickets').innerHTML = ''; });
    }
    carregarTickets();
    el('b-ticket').onclick = function () {
      api('POST', '/tickets', { assunto: val('tk-assunto'), categoria: val('tk-cat'), texto: val('tk-texto') })
        .then(function () { el('tk-msg').textContent = '✅ aberto!'; carregarTickets(); })
        .catch(function (e) { el('tk-msg').textContent = e.message; });
    };
    if (el('b-2fa-ger')) el('b-2fa-ger').onclick = function () {
      api('POST', '/me/2fa/gerar').then(function (d) {
        el('fa-setup').innerHTML = '<div class="aviso">1) Adicione no app autenticador (Google Authenticator, 1Password...):<br>' +
          '<b style="word-break:break-all">' + esc(d.secret) + '</b><br><span class="sub" style="text-align:left;margin:0;word-break:break-all">' + esc(d.otpauth) + '</span><br>' +
          '2) Digite o código gerado: <input id="fa-cod-atv" placeholder="000000" style="max-width:120px"> <button class="btn peq" id="b-2fa-atv">Confirmar</button></div>';
        el('b-2fa-atv').onclick = function () {
          api('POST', '/me/2fa/ativar', { codigo: val('fa-cod-atv') })
            .then(function () { alert('2FA ativado! O código será pedido no próximo login.'); bootAcademy(); })
            .catch(function (e) { el('fa-msg').textContent = e.message; });
        };
      }).catch(function (e) { el('fa-msg').textContent = e.message; });
    };
    if (el('b-2fa-des')) el('b-2fa-des').onclick = function () {
      api('POST', '/me/2fa/desativar', { codigo: val('fa-des') })
        .then(function () { alert('2FA desativado.'); bootAcademy(); })
        .catch(function (e) { el('fa-msg').textContent = e.message; });
    };
    api('GET', '/pedidos').then(function (d) {
      el('c-compras').innerHTML = d.pedidos.length
        ? '<table><tr><th>Produto</th><th>Valor</th><th>Status</th><th>Data</th></tr>' + d.pedidos.map(function (o) {
          return '<tr><td>' + esc(o.produto_titulo) + '</td><td>' + (o.valor_centavos ? brl(o.valor_centavos) : 'grátis') +
            '</td><td>' + (STATUS_PEDIDO[o.status] || esc(o.status)) + '</td><td>' + dt(o.criado_em) + '</td></tr>';
        }).join('') + '</table>'
        : '<p class="sub" style="text-align:left">Nenhuma compra ainda — explore o <a href="/academy/marketplace">marketplace</a>.</p>';
    }).catch(function (e) { el('c-compras').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
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
