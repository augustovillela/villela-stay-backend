// =====================================================================
// Musique · Laboratório — CLIENTE · base. Sem build, sem framework
// (padrão da casa). O núcleo (window.MusiqueLab) já está carregado.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab;
  var C = L.cliente = { ferramentas: {} };
  var N = L.notas;

  C.el = function (tag, a, filhos) {
    var e = d.createElement(tag);
    Object.keys(a || {}).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'txt') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;            // só SVG/HTML gerado pelo núcleo (escapado lá)
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (filhos || []).forEach(function (f) { if (f != null && f !== false) e.appendChild(typeof f === 'string' ? d.createTextNode(f) : f); });
    return e;
  };
  C.$ = function (s, r) { return (r || d).querySelector(s); };
  C.$$ = function (s, r) { return [].slice.call((r || d).querySelectorAll(s)); };
  C.limpar = function (e) { while (e.firstChild) e.removeChild(e.firstChild); return e; };

  C.guardar = function (k, v) { try { localStorage.setItem('musique-lab:' + k, JSON.stringify(v)); } catch (_) { /* sem armazenamento: tudo bem */ } };
  C.lerLocal = function (k, padrao) { try { var v = localStorage.getItem('musique-lab:' + k); return v == null ? padrao : JSON.parse(v); } catch (_) { return padrao; } };

  /** API do Musique. 401/402 viram erro com mensagem legível. */
  C.api = function (metodo, url, corpo) {
    return fetch(url, { method: metodo, credentials: 'same-origin', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.erro || ('Erro ' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
  };

  var avisoT = null;
  C.aviso = function (msg, tipo) {
    var a = C.$('#lab-aviso');
    if (!a) { a = C.el('div', { id: 'lab-aviso', class: 'lab-aviso', role: 'status', 'aria-live': 'polite' }); d.body.appendChild(a); }
    a.textContent = msg; a.className = 'lab-aviso on ' + (tipo || '');
    clearTimeout(avisoT); avisoT = setTimeout(function () { a.className = 'lab-aviso'; }, 5000);
  };

  // ---- nomes e seletores comuns ----
  C.notacao = C.lerLocal('notacao', 'pt');
  C.nomeNota = function (n, oitava) { return N.nome(n, { notacao: C.notacao === 'cifra' ? 'cifra' : 'pt', glifo: true, oitava: !!oitava }); };
  C.TONICAS = (function () {
    var out = [];
    [0, 1, 2, 3, 4, 5, 6].forEach(function (li) { [0, 1, -1].forEach(function (alt) { out.push({ li: li, alt: alt, oitava: null }); }); });
    return out;
  })();

  C.select = function (id, rotulo, opcoes, valor, aoMudar) {
    var s = C.el('select', { id: id, onchange: function () { aoMudar(s.value); } }, opcoes.map(function (o) {
      return C.el('option', { value: o.valor, selected: String(o.valor) === String(valor) ? true : null, txt: o.rotulo });
    }));
    return C.el('div', { class: 'lab-campo' }, [C.el('label', { for: id, txt: rotulo }), s]);
  };
  C.selTonica = function (valor, aoMudar, id) {
    return C.select(id || 'lab-tonica', 'Tônica', C.TONICAS.map(function (n) { return { valor: N.slug(n), rotulo: N.nomeDuplo(n) }; }), valor, aoMudar);
  };
  C.selEscala = function (valor, aoMudar, comVazio) {
    var ops = L.escalas.CATALOGO.map(function (e) { return { valor: e.id, rotulo: e.nome }; });
    if (comVazio) ops.unshift({ valor: '', rotulo: '— nenhuma —' });
    return C.select('lab-escala', 'Escala / modo', ops, valor, aoMudar);
  };
  C.selAcorde = function (valor, aoMudar, comVazio) {
    var ops = L.acordes.CATALOGO.map(function (c) { return { valor: c.id, rotulo: (c.simbolos[0] || 'maior') + ' — ' + c.nome }; });
    if (comVazio) ops.unshift({ valor: '', rotulo: '— nenhum —' });
    return C.select('lab-acorde', 'Acorde', ops, valor, aoMudar);
  };
  C.selNotacao = function (aoMudar) {
    return C.select('lab-notacao', 'Nomes', [{ valor: 'pt', rotulo: 'dó ré mi' }, { valor: 'cifra', rotulo: 'C D E' }], C.notacao, function (v) { C.notacao = v; C.guardar('notacao', v); aoMudar(v); });
  };

  /** Deep link: guarda o estado de TEORIA na URL (nunca dado pessoal). */
  C.gravarUrl = function (st) {
    try {
      var q = new URLSearchParams();
      if (st.tonica) q.set('t', st.tonica);
      if (st.escala) q.set('e', st.escala);
      if (st.acorde) q.set('a', st.acorde);
      if (st.instrumento && st.instrumento !== 'violao') q.set('i', st.instrumento);
      if (st.afinacao && st.afinacao !== 'padrao') q.set('af', st.afinacao);
      if (st.canhoto) q.set('canhoto', '1');
      if (st.clave && st.clave !== 'sol') q.set('c', st.clave);
      if (st.modo === 'menor') q.set('m', 'menor');
      var s = q.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
    } catch (_) { /* sem history: segue */ }
  };

  C.carregarScript = function (src) {
    return new Promise(function (ok, falha) {
      if (C.$('script[src="' + src + '"]')) return ok();
      var s = d.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { falha(new Error('Não carregou ' + src)); }; d.head.appendChild(s);
    });
  };

  C.baixar = function (nome, tipo, dados) {
    var b = new Blob([dados], { type: tipo }); var u = URL.createObjectURL(b);
    var a = C.el('a', { href: u, download: nome }); d.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  };

  // ---- delegação global: qualquer botão .lab-ouvir toca ----
  d.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.lab-ouvir');
    if (!b || !C.Som) return;
    ev.preventDefault();
    try {
      if (b.dataset.hz) return C.Som.tocarHz([Number(b.dataset.hz)], { dur: 1.6 });
      if (b.dataset.sequencia) return C.Som.sequencia(JSON.parse(b.dataset.sequencia), { dur: 1.1 });
      var ms = JSON.parse(b.dataset.midis || '[]');
      C.Som.tocar(ms, { modo: b.dataset.modo || 'melodico', dur: b.dataset.dur ? Number(b.dataset.dur) : undefined, passo: b.dataset.passo ? Number(b.dataset.passo) : undefined, vel: b.dataset.vel ? Number(b.dataset.vel) : undefined });
    } catch (e) { C.aviso('Não consegui tocar: ' + e.message, 'erro'); }
  });

  // ---- busca com sugestões ao digitar (hub) ----
  function buscaViva() {
    var q = C.$('#lab-q'); var ul = C.$('#lab-sugestoes');
    if (!q || !ul) return;
    var t = null;
    q.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        C.limpar(ul);
        var r = q.value.trim() ? L.catalogo.buscar(q.value, { limite: 8 }) : [];
        r.forEach(function (x) { ul.appendChild(C.el('li', {}, [C.el('a', { href: x.url }, [C.el('strong', { txt: x.titulo }), ' ', C.el('small', { txt: x.grupo })])])); });
      }, 120);
    });
  }

  // ---- favoritos (assinatura): o botão aparece em toda página ----
  function botaoFavorito() {
    var m = C.$('.lab-migalhas');
    if (!m || /\/(buscar|atividade)/.test(location.pathname)) return;
    var b = C.el('button', { type: 'button', class: 'lab-fav', 'aria-pressed': 'false', txt: '☆ Favoritar' });
    b.onclick = function () {
      var on = b.getAttribute('aria-pressed') === 'true';
      C.api(on ? 'DELETE' : 'POST', '/music/api/lab/favoritos', { url: location.pathname, titulo: (C.$('h1') || {}).textContent || d.title })
        .then(function () { b.setAttribute('aria-pressed', on ? 'false' : 'true'); b.textContent = on ? '☆ Favoritar' : '★ Favorito'; C.aviso(on ? 'Removido dos favoritos.' : 'Guardado nos favoritos.'); })
        .catch(function (e) { C.aviso(e.status === 401 ? 'Entre na sua conta para guardar favoritos.' : e.status === 402 ? 'Favoritos fazem parte da assinatura do Musique.' : e.message, 'erro'); });
    };
    m.appendChild(b);
    C.api('GET', '/music/api/lab/favoritos').then(function (r) {
      if ((r.favoritos || []).some(function (f) { return f.url === location.pathname; })) { b.setAttribute('aria-pressed', 'true'); b.textContent = '★ Favorito'; }
    }).catch(function () { /* sem conta: o botão fica, e explica ao clicar */ });
  }

  // ---- modo aula: tela cheia, letra e desenhos grandes, para projetar ----
  function botaoAula() {
    var m = C.$('.lab-migalhas');
    if (!m || !(C.$('#lab-ferramenta') || C.$('.lab-licao') || C.$('.lab-fig'))) return;
    var b = C.el('button', { type: 'button', class: 'lab-fav', 'aria-pressed': 'false', txt: '⛶ Modo aula' });
    var alternar = function (on) {
      d.body.classList.toggle('lab-aula', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? '✕ Sair do modo aula' : '⛶ Modo aula';
      try { if (on && d.documentElement.requestFullscreen) d.documentElement.requestFullscreen(); else if (!on && d.fullscreenElement) d.exitFullscreen(); } catch (_) { /* sem tela cheia: só amplia */ }
    };
    b.onclick = function () { alternar(!d.body.classList.contains('lab-aula')); };
    d.addEventListener('fullscreenchange', function () { if (!d.fullscreenElement && d.body.classList.contains('lab-aula')) alternar(false); });
    m.appendChild(b);
  }

  // ---- barra de rolagem também EM CIMA das tabelas largas (atlas) ----
  // Uma faixa fina acima da tabela, do mesmo comprimento, rola junto com a
  // de baixo: dá para ir para os lados sem descer até o fim da tabela.
  function barraDeCima() {
    C.$$('.lab-tabela-rolagem').forEach(function (caixa) {
      if (caixa.previousElementSibling && caixa.previousElementSibling.classList.contains('lab-rolagem-topo')) return;
      var topo = C.el('div', { class: 'lab-rolagem-topo', 'aria-hidden': 'true' }, [C.el('div')]);
      caixa.parentNode.insertBefore(topo, caixa);
      var ajustar = function () {
        topo.firstChild.style.width = caixa.scrollWidth + 'px';
        topo.hidden = caixa.scrollWidth <= caixa.clientWidth + 1;
      };
      var mexendo = false;
      topo.addEventListener('scroll', function () { if (mexendo) return; mexendo = true; caixa.scrollLeft = topo.scrollLeft; mexendo = false; });
      caixa.addEventListener('scroll', function () { if (mexendo) return; mexendo = true; topo.scrollLeft = caixa.scrollLeft; mexendo = false; });
      ajustar();
      w.addEventListener('resize', ajustar);
    });
  }
  C.barraDeCima = barraDeCima;

  d.addEventListener('DOMContentLoaded', function () {
    barraDeCima();
    // tabelas que as ferramentas montam depois (matriz, relatórios) também ganham a barra
    if (w.MutationObserver && C.$('#lab-main')) { var tmo = null; new MutationObserver(function () { clearTimeout(tmo); tmo = setTimeout(barraDeCima, 120); }).observe(C.$('#lab-main'), { childList: true, subtree: true }); }
    buscaViva();
    botaoFavorito();
    botaoAula();
    var main = C.$('#lab-main');
    if (!main) return;
    var slug = main.getAttribute('data-ferramenta');
    var estado = {};
    try { estado = JSON.parse(main.getAttribute('data-estado') || '{}'); } catch (_) { estado = {}; }
    C.estado = estado;
    if (C.antesDeMontar) C.antesDeMontar(estado);
    var alvo = C.$('#lab-ferramenta');
    var f = C.ferramentas[slug];
    if (f && alvo) {
      try { f(alvo, estado); } catch (e) { alvo.appendChild(C.el('p', { class: 'lab-erro', txt: 'A ferramenta não abriu: ' + e.message })); if (w.console) console.error(e); }
    }
  });
})(window, document);
