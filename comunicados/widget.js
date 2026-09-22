/* =====================================================================
   Comunicados — sino de avisos dentro dos apps do Grupo Villela Stay.
   Um arquivo só para todos os produtos: cada app inclui
     <script src="<base do app>/comunicados.js" defer></script>
   e o widget descobre a própria base pelo endereço do script, então fala
   com a API do MESMO produto, com a sessão dele.
   Sem sessão (visitante) o widget não desenha nada.
   Aviso com destaque (instabilidade) vira faixa no topo até ser fechado.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__vsComunicados) return;
  window.__vsComunicados = true;
  var eu = document.currentScript;
  if (!eu || !eu.src) return;
  var base = eu.src.replace(/\/comunicados\.js(\?.*)?$/, '');
  var cor = eu.getAttribute('data-cor') || '#1B2A4A';
  var lado = eu.getAttribute('data-lado') === 'direita' ? 'right' : 'left';
  // data-sino="nao": o app já tem central de avisos própria (o comunicado
  // entra nela); aqui só a faixa de destaque, para instabilidade.
  var comSino = eu.getAttribute('data-sino') !== 'nao';
  var estado = { itens: [], aberto: false };

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function paragrafos(t) { return String(t || '').split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }
  function quando(iso) { try { var d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
  function linkSeguro(u) { return /^https:\/\//i.test(String(u || '')) ? u : ''; }

  var css = '' +
    '.vsc-bt{position:fixed;bottom:18px;' + lado + ':18px;z-index:2147483000;width:48px;height:48px;border-radius:50%;border:0;background:' + cor + ';color:#fff;font-size:22px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center}' +
    '.vsc-bt:focus-visible{outline:3px solid #F5B301;outline-offset:2px}' +
    '.vsc-n{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#D92D20;color:#fff;font:700 12px/20px system-ui,Arial,sans-serif;text-align:center}' +
    '.vsc-pn{position:fixed;bottom:76px;' + lado + ':18px;z-index:2147483000;width:min(380px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;background:#fff;color:#1F2933;border:1px solid #E2E6EC;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.2);font:14px/1.5 Inter,system-ui,Arial,sans-serif}' +
    '.vsc-hd{position:sticky;top:0;background:#fff;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #EEF0F3;font-weight:700}' +
    '.vsc-hd button{background:none;border:0;color:#4B5563;cursor:pointer;font:600 12px system-ui,Arial,sans-serif;padding:4px 6px}' +
    '.vsc-it{padding:12px 14px;border-bottom:1px solid #F1F3F6}.vsc-it.nl{background:#F7F9FC}' +
    '.vsc-it h4{margin:2px 0 4px;font-size:14px;color:#111827}.vsc-it p{margin:0 0 6px}.vsc-cat{font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.05em}' +
    '.vsc-it a{color:' + cor + ';font-weight:700}.vsc-vz{padding:22px 14px;color:#6B7280;text-align:center}' +
    '.vsc-fx{position:relative;z-index:2147483001;background:#FFF4E5;color:#7A3E00;border-bottom:1px solid #F5C27A;padding:10px 44px 10px 16px;font:14px/1.45 Inter,system-ui,Arial,sans-serif}' +
    '.vsc-fx b{margin-right:6px}.vsc-fx a{color:#7A3E00;font-weight:700}.vsc-fx button{position:absolute;right:8px;top:6px;background:none;border:0;font-size:20px;cursor:pointer;color:#7A3E00}' +
    '@media print{.vsc-bt,.vsc-pn,.vsc-fx{display:none!important}}';

  function api(metodo, caminho) {
    return fetch(base + caminho, { method: metodo, credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  var bt, pn, fx;
  var estilo = false;
  function montarBase() {
    if (!estilo) { estilo = true; var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }
    if (bt || !comSino) return;
    bt = document.createElement('button');
    bt.className = 'vsc-bt'; bt.type = 'button'; bt.setAttribute('aria-haspopup', 'dialog');
    bt.onclick = function () { estado.aberto ? fechar() : abrir(); };
    document.body.appendChild(bt);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && estado.aberto) { fechar(); bt.focus(); } });
  }
  function pintarBotao() {
    if (!bt) return;
    var n = estado.itens.filter(function (x) { return !x.lido; }).length;
    bt.innerHTML = '🔔' + (n ? '<span class="vsc-n">' + (n > 9 ? '9+' : n) + '</span>' : '');
    bt.setAttribute('aria-label', n ? ('Avisos: ' + n + ' não lido' + (n > 1 ? 's' : '')) : 'Avisos');
    bt.title = bt.getAttribute('aria-label');
  }
  function pintarFaixa() {
    var d = estado.itens.filter(function (x) { return x.destaque && !x.lido; })[0];
    if (!d) { if (fx) { fx.remove(); fx = null; } return; }
    if (!fx) { fx = document.createElement('div'); fx.className = 'vsc-fx'; fx.setAttribute('role', 'status'); document.body.insertBefore(fx, document.body.firstChild); }
    var l = linkSeguro(d.link_url);
    fx.innerHTML = '<b>' + esc(d.emoji + ' ' + d.titulo) + '</b>' + esc(String(d.corpo).split('\n')[0].slice(0, 220)) +
      (l ? ' <a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(d.link_rotulo || 'Saiba mais') + '</a>' : '') +
      '<button type="button" aria-label="Fechar aviso">×</button>';
    fx.querySelector('button').onclick = function () { lido(d.id); };
  }
  function abrir() {
    estado.aberto = true;
    if (!pn) { pn = document.createElement('div'); pn.className = 'vsc-pn'; pn.setAttribute('role', 'dialog'); pn.setAttribute('aria-label', 'Avisos'); document.body.appendChild(pn); }
    pn.style.display = 'block';
    pintarPainel();
    bt.setAttribute('aria-expanded', 'true');
  }
  function fechar() { estado.aberto = false; if (pn) pn.style.display = 'none'; bt.setAttribute('aria-expanded', 'false'); }
  function pintarPainel() {
    if (!pn) return;
    var temNaoLido = estado.itens.some(function (x) { return !x.lido; });
    pn.innerHTML = '<div class="vsc-hd"><span>🔔 Avisos</span><span>' +
      (temNaoLido ? '<button type="button" data-a="todos">Marcar todos como lidos</button>' : '') +
      '<button type="button" data-a="fechar" aria-label="Fechar">✕</button></span></div>' +
      (estado.itens.length ? estado.itens.map(function (x) {
        var l = linkSeguro(x.link_url);
        return '<div class="vsc-it' + (x.lido ? '' : ' nl') + '" data-id="' + esc(x.id) + '">' +
          '<div class="vsc-cat">' + esc(x.emoji + ' ' + x.categoria_rotulo) + ' · ' + esc(quando(x.quando)) + '</div>' +
          '<h4>' + esc(x.titulo) + '</h4>' + paragrafos(x.corpo) +
          (l ? '<a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(x.link_rotulo || 'Saiba mais') + ' →</a>' : '') + '</div>';
      }).join('') : '<div class="vsc-vz">Nenhum aviso por enquanto.</div>');
    pn.querySelector('[data-a="fechar"]').onclick = fechar;
    var t = pn.querySelector('[data-a="todos"]'); if (t) t.onclick = function () { lido('todos'); };
    // Abrir o painel conta como leitura do que está à vista.
    estado.itens.forEach(function (x) { if (!x.lido && !x.destaque) lido(x.id, true); });
  }
  function lido(id, silencioso) {
    estado.itens.forEach(function (x) { if (id === 'todos' || x.id === id) x.lido = true; });
    api('POST', '/api/comunicados/' + encodeURIComponent(id) + '/lido');
    pintarBotao(); pintarFaixa(); if (!silencioso && estado.aberto) pintarPainel();
  }
  function carregar() {
    api('GET', '/api/comunicados').then(function (r) {
      if (!r || r.anonimo) { if (bt) { bt.remove(); bt = null; } if (fx) { fx.remove(); fx = null; } return; }
      estado.itens = r.itens || [];
      // Sem aviso nenhum, o app fica como sempre foi: o sino só aparece
      // quando há o que ler (muitos apps já têm um botão "🔔 Avisos" de push).
      if (!estado.itens.length && !bt) return;
      montarBase(); pintarBotao(); pintarFaixa(); if (estado.aberto) pintarPainel();
    });
  }
  function iniciar() {
    carregar();
    setInterval(function () { if (!document.hidden) carregar(); }, 5 * 60 * 1000);
    // Apps de página única fazem login sem recarregar: olha de novo quando a aba volta ao foco.
    document.addEventListener('visibilitychange', function () { if (!document.hidden) carregar(); });
    window.addEventListener('vs:sessao', carregar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
