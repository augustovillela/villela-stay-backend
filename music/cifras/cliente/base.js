// =====================================================================
// Musique Cifras — CLIENTE · base. Servido (concatenado com os outros
// arquivos de cliente/) em /music/cifras.js. Arquivo JS DE VERDADE, lido
// do disco — não mora dentro de template literal, então crase e barra
// invertida não quebram nada (lição das Fases 1 e 2).
//
// O QUE ESTA BASE GARANTE:
//   · API com cache: leitura que falha por falta de rede cai para a
//     última cópia guardada (IndexedDB) e a tela DIZ que é cópia;
//   · FILA de alterações: o que o músico muda sem rede (visão, notas,
//     comentários) entra numa fila e sobe quando a rede volta — e NADA
//     local é descartado em silêncio: o que o servidor recusar fica na
//     fila, visível, para a pessoa decidir;
//   · navegação por âncora (#cifra=, #musica=, #banda=, #convite=,
//     #vivo=, #setlist=), para link direto e QR Code.
// =====================================================================
(function (global) {
  'use strict';
  var U = global.MusiqueUI;
  var M = global.MusiqueMotor;
  var $ = U.$, el = U.el, esc = U.esc;
  var BASE = '/music/api/cifras';

  var C = global.MusiqueCifras = global.MusiqueCifras || {};
  C.M = M; C.U = U; C.el = el; C.esc = esc; C.$ = $;
  C.estado = { tela: 'inicio', inicio: null, prefs: null, flags: {}, ia: { capabilities: [] }, online: navigator.onLine };

  // ---------------------------------------------------------------
  // IndexedDB (sem biblioteca): pacotes, cache de leitura e fila
  // ---------------------------------------------------------------
  var _db = null;
  function idb() {
    if (_db) return _db;
    _db = new Promise(function (ok, falha) {
      if (!global.indexedDB) return falha(new Error('Este navegador não guarda dados offline.'));
      var r = global.indexedDB.open('musique-cifras', 2);
      r.onupgradeneeded = function () {
        var d = r.result;
        ['pacotes', 'cache', 'fila', 'posicoes'].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { falha(r.error); };
    });
    return _db;
  }
  function tx(loja, modo, fn) {
    return idb().then(function (d) {
      return new Promise(function (ok, falha) {
        var t = d.transaction(loja, modo);
        var s = t.objectStore(loja);
        var r = fn(s);
        t.oncomplete = function () { ok(r && r.result !== undefined ? r.result : undefined); };
        t.onerror = function () { falha(t.error); };
        t.onabort = function () { falha(t.error || new Error('Armazenamento cheio ou bloqueado.')); };
      });
    });
  }
  C.guardar = function (loja, chave, valor) { return tx(loja, 'readwrite', function (s) { return s.put(valor, chave); }); };
  C.ler = function (loja, chave) { return tx(loja, 'readonly', function (s) { return s.get(chave); }); };
  C.apagar = function (loja, chave) { return tx(loja, 'readwrite', function (s) { return s.delete(chave); }); };
  C.todos = function (loja) {
    return idb().then(function (d) {
      return new Promise(function (ok, falha) {
        var out = [];
        var c = d.transaction(loja, 'readonly').objectStore(loja).openCursor();
        c.onsuccess = function () { var cur = c.result; if (cur) { out.push({ chave: cur.key, valor: cur.value }); cur.continue(); } else ok(out); };
        c.onerror = function () { falha(c.error); };
      });
    });
  };

  // ---------------------------------------------------------------
  // API
  // ---------------------------------------------------------------
  function api(metodo, caminho, corpo, op) {
    op = op || {};
    var url = (op.cru ? '' : BASE) + caminho;
    return fetch(url, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401) { location.href = '/music/entrar?voltar=' + encodeURIComponent(location.pathname + location.hash); throw new Error('sessao'); }
          if (r.status === 402) { location.hash = '#conta'; throw new Error('assinatura'); }   // teste acabou: Minha conta tem o Assinar
          if (!r.ok) { var e = new Error((d && d.erro) || ('Erro ' + r.status)); e.status = r.status; e.dados = d; throw e; }
          if (metodo === 'GET' && op.cache) C.guardar('cache', op.cache, { em: Date.now(), dados: d }).catch(function () {});
          return d;
        });
      }, function () {
        // Rede caída não é erro do servidor.
        if (metodo === 'GET' && op.cache) {
          return C.ler('cache', op.cache).then(function (c) {
            if (!c) throw semRede();
            var d = c.dados; d._offline = true; d._copia_de = c.em; return d;
          });
        }
        if (op.fila) return enfileirar(metodo, url, corpo).then(function () { return { _enfileirado: true }; });
        throw semRede();
      });
  }
  function semRede() { var e = new Error('Sem conexão com a internet.'); e.semRede = true; return e; }
  C.api = api;

  // ---------------------------------------------------------------
  // Fila de alterações offline
  // ---------------------------------------------------------------
  function enfileirar(metodo, url, corpo) {
    var chave = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    return C.guardar('fila', chave, { metodo: metodo, url: url, corpo: corpo, em: Date.now(), tentativas: 0 }).then(atualizarSelo);
  }
  var sincronizando = false;
  C.sincronizar = function () {
    if (sincronizando || !navigator.onLine) return Promise.resolve();
    sincronizando = true;
    return C.todos('fila').then(function (itens) {
      itens.sort(function (a, b) { return a.chave < b.chave ? -1 : 1; });
      return itens.reduce(function (p, it) {
        return p.then(function () {
          var v = it.valor;
          return fetch(v.url, { method: v.metodo, headers: { 'Content-Type': 'application/json' }, body: v.corpo ? JSON.stringify(v.corpo) : undefined })
            .then(function (r) {
              if (r.ok) return C.apagar('fila', it.chave);
              // Recusado pelo servidor: NÃO some. Fica na fila marcado, e a
              // tela de downloads mostra para a pessoa decidir.
              return r.json().catch(function () { return {}; }).then(function (d) {
                v.tentativas++; v.erro = (d && d.erro) || ('Erro ' + r.status);
                return C.guardar('fila', it.chave, v);
              });
            }, function () { /* ainda sem rede */ });
        });
      }, Promise.resolve());
    }).catch(function () {}).then(function () { sincronizando = false; atualizarSelo(); });
  };
  function atualizarSelo() {
    return C.todos('fila').then(function (l) { C.estado.pendentes = l.length; pintarSub(); }).catch(function () {});
  }
  global.addEventListener('online', function () { C.estado.online = true; pintarAvisoRede(); C.sincronizar(); });
  global.addEventListener('offline', function () { C.estado.online = false; pintarAvisoRede(); });
  function pintarAvisoRede() {
    var a = $('#cf-rede');
    if (a) a.style.display = navigator.onLine ? 'none' : 'block';
  }

  // ---------------------------------------------------------------
  // Utilidades de tela
  // ---------------------------------------------------------------
  C.aviso = function (m) { U.aviso(m); };
  C.erro = function (e) { U.erro(e && e.message ? e.message : String(e)); };
  C.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  C.data = function (iso) { return iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''; };
  C.minutos = function (s) { s = Number(s) || 0; return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
  C.esqueleto = function (n) { var d = el('div'); for (var i = 0; i < (n || 4); i++) d.appendChild(el('div', { class: 'cf-skel', 'aria-hidden': 'true' })); return d; };
  C.estadoVazio = function (titulo, texto, acao) {
    var d = el('div', { class: 'cf-estado', role: 'status' }, [el('b', { txt: titulo }), el('span', { txt: texto || '' })]);
    if (acao) d.appendChild(el('div', { style: 'margin-top:10px' }, [acao]));
    return d;
  };
  C.estadoErro = function (e, tentar) {
    var t = e && e.status === 403 ? 'Acesso negado' : e && e.status === 404 ? 'Não encontrado' : e && e.status === 410 ? 'Conteúdo removido' : e && e.semRede ? 'Sem conexão' : 'Algo deu errado';
    return C.estadoVazio(t, e && e.message ? e.message : '', tentar ? el('button', { class: 'btn sec', txt: 'Tentar de novo', onclick: tentar }) : null);
  };
  C.corpo = function () { var c = $('#cf-corpo'); if (!c) { telaBase(); c = $('#cf-corpo'); } return c; };
  C.limpar = function () { var c = C.corpo(); c.innerHTML = ''; return c; };
  C.botao = function (txt, fn, cls, extra) { var b = el('button', Object.assign({ class: 'btn ' + (cls || ''), txt: txt, type: 'button' }, extra || {})); b.onclick = fn; return b; };

  /** Modal acessível (foco preso, Esc fecha). Devolve { fechar, caixa }. */
  C.modal = function (titulo, conteudo, botoes) {
    var fundo = el('div', { style: 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px' });
    var caixa = el('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo,
      style: 'background:#fff;border-radius:16px;max-width:760px;width:100%;max-height:88vh;overflow:auto;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.25)' });
    caixa.appendChild(el('h3', { txt: titulo, style: 'margin:0 0 10px' }));
    if (typeof conteudo === 'string') caixa.appendChild(el('p', { txt: conteudo })); else if (conteudo) caixa.appendChild(conteudo);
    var linha = el('div', { class: 'linha', style: 'justify-content:flex-end;margin-top:14px' });
    var fechar = function () { document.removeEventListener('keydown', tecla); fundo.remove(); if (volta && volta.focus) volta.focus(); };
    (botoes || [{ txt: 'Fechar' }]).forEach(function (b) {
      linha.appendChild(C.botao(b.txt, function () { var r = b.fn ? b.fn() : null; if (r !== false) fechar(); }, b.cls || (b.fn ? '' : 'sec')));
    });
    caixa.appendChild(linha);
    fundo.appendChild(caixa);
    var volta = document.activeElement;
    var tecla = function (ev) { if (ev.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    fundo.addEventListener('click', function (ev) { if (ev.target === fundo) fechar(); });
    document.body.appendChild(fundo);
    var foco = caixa.querySelector('input,textarea,select,button');
    if (foco) foco.focus();
    return { fechar: fechar, caixa: caixa };
  };
  C.confirmar = function (titulo, texto, rotulo) {
    return new Promise(function (ok) {
      C.modal(titulo, texto, [{ txt: 'Cancelar', fn: function () { ok(false); } }, { txt: rotulo || 'Confirmar', fn: function () { ok(true); } }]);
    });
  };

  // ---------------------------------------------------------------
  // Casca: sub-navegação das Cifras
  // ---------------------------------------------------------------
  var TELAS = [
    ['inicio', 'Início'], ['biblioteca', 'Biblioteca'], ['importar', 'Encontrar ou importar'], ['setlists', 'Setlists'],
    ['bandas', 'Bandas'], ['vivo', 'Ao vivo'], ['acordes', 'Acordes'], ['downloads', 'Offline'], ['importacoes', 'Importações'],
    ['preferencias', 'Preferências'],
  ];
  // Ícone e cor de cada funcionalidade: os mesmos no menu e nos atalhos do Início.
  C.ICONES = {
    inicio: { ico: '🏠', fundo: '#EEF2F7', cor: '#1B2A4A' },
    biblioteca: { ico: '📚', fundo: '#EDE9FE', cor: '#6D28D9' },
    importar: { ico: '🔎', fundo: '#E0F2FE', cor: '#0369A1' },
    setlists: { ico: '📋', fundo: '#FFEDD5', cor: '#C2410C' },
    bandas: { ico: '👥', fundo: '#FCE7F3', cor: '#BE185D' },
    vivo: { ico: '📡', fundo: '#FFE4E6', cor: '#BE123C' },
    acordes: { ico: '🎸', fundo: '#DCFCE7', cor: '#15803D' },
    downloads: { ico: '📴', fundo: '#F1F5F9', cor: '#334155' },
    importacoes: { ico: '📦', fundo: '#FEF3C7', cor: '#B45309' },
    preferencias: { ico: '⚙️', fundo: '#F1F5F9', cor: '#334155' },
  };
  C.telas = {};
  function telaBase() {
    var c = $('#corpo'); c.innerHTML = '';
    c.appendChild(el('div', { id: 'cf-rede', class: 'cf-offline', role: 'status', style: navigator.onLine ? 'display:none' : '',
      txt: 'Sem internet: você está vendo o que está guardado neste aparelho. As mudanças sobem quando a conexão voltar.' }));
    c.appendChild(el('nav', { id: 'cf-sub', class: 'cf-sub', 'aria-label': 'Cifras' }));
    c.appendChild(el('div', { id: 'cf-corpo' }));
    pintarSub();
  }
  function pintarSub() {
    var n = $('#cf-sub'); if (!n) return;
    n.innerHTML = '';
    TELAS.forEach(function (t) {
      if (t[0] === 'vivo' && C.estado.flags['cifras.vivo'] === false) return;
      var b = el('button', { type: 'button', class: C.estado.tela === t[0] ? 'on' : '', 'aria-current': C.estado.tela === t[0] ? 'page' : 'false',
        txt: (C.ICONES[t[0]] ? C.ICONES[t[0]].ico + ' ' : '') + t[1] });
      if (t[0] === 'downloads' && C.estado.pendentes) b.appendChild(el('span', { class: 'badge', txt: String(C.estado.pendentes) }));
      b.onclick = function () { C.ir(t[0]); };
      n.appendChild(b);
    });
    // Comandos de voz: "abrir Tempo Perdido", "subir meio tom", "pausar"…
    if (C.Voz) n.appendChild(C.Voz.botao());
  }
  C.pintarSub = pintarSub;

  /** Vai para uma tela das Cifras. `arg` = id (cifra, banda...). */
  C.ir = function (tela, arg, extra) {
    // Saiu da cifra: o player fixo do Smart Play fecha junto.
    if (tela !== 'cifra' && C.SmartPlay) C.SmartPlay.fechar();
    if (!$('#cf-sub')) telaBase();
    C.estado.tela = ['cifra', 'musica', 'editor', 'setlist', 'banda', 'comparar', 'previa'].indexOf(tela) >= 0
      ? ({ cifra: 'biblioteca', musica: 'biblioteca', editor: 'biblioteca', comparar: 'biblioteca', previa: 'importar', setlist: 'setlists', banda: 'bandas' })[tela] : tela;
    pintarSub();
    var fn = C.telas[tela];
    if (!fn) fn = C.telas.inicio;
    C.corpo().innerHTML = '';
    C.corpo().appendChild(C.esqueleto(3));
    try { fn(arg, extra); } catch (e) { C.limpar().appendChild(C.estadoErro(e)); }
    try { global.scrollTo(0, 0); } catch (_) { /* sem janela (teste) */ }
    C.gravarNoEndereco(tela, arg);
  };

  // O endereço da página guarda ONDE a pessoa está, para o F5 (e o link
  // copiado) reabrir no mesmo lugar: #cifras/acordes, #cifra=ID, #setlist=ID…
  // replaceState, e não pushState: não enche o "voltar" do navegador.
  var COM_ID = { cifra: 'cifra', musica: 'musica', banda: 'banda', setlist: 'setlist' };
  C.gravarNoEndereco = function (tela, arg) {
    var h;
    if (COM_ID[tela] && arg && typeof arg === 'string') h = '#' + COM_ID[tela] + '=' + arg;
    else if (TELAS.some(function (t) { return t[0] === tela; })) h = tela === 'inicio' ? '#cifras' : '#cifras/' + tela;
    else return;                               // editor, prévia, convite, maestro: telas de passagem
    try { if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h); } catch (_) { /* teste */ }
  };

  /** Entrada pela aba "Cifras" do app. */
  C.abrir = function () {
    telaBase();
    carregarInicio().then(function () {
      if (!rotearHash()) C.ir('inicio');
    });
  };

  function carregarInicio() {
    return api('GET', '/inicio', null, { cache: 'inicio' }).then(function (d) {
      C.estado.inicio = d; C.estado.prefs = d.preferencias; C.estado.flags = d.flags || {}; C.estado.ia = d.ia || { capabilities: [] };
      C.estado.instrumentos = d.instrumentos || []; C.estado.offlineInicio = !!d._offline;
      pintarSub();
      return d;
    }).catch(function () { C.estado.prefs = C.estado.prefs || { instrumento: 'violao', afinacao: 'padrao', grafia: 'auto', exibicao: {}, rolagem: {} }; });
  }
  C.recarregarInicio = carregarInicio;
  C.temIA = function (cap) { return C.estado.ia && (C.estado.ia.capabilities || []).indexOf('cifra.' + cap) >= 0; };

  function rotearHash() {
    var h = String(location.hash || '').replace(/^#/, '');
    var sub = h.match(/^cifras\/([a-z_]+)$/);
    if (sub && C.telas[sub[1]]) { C.ir(sub[1]); return true; }
    var m = h.match(/^(cifra|musica|banda|convite|vivo|setlist)=([\w-]+)/);
    if (!m) return false;
    history.replaceState(null, '', location.pathname + location.search);
    var mapa = { cifra: 'cifra', musica: 'musica', banda: 'banda', convite: 'convite', vivo: 'vivo_entrar', setlist: 'setlist' };
    C.ir(mapa[m[1]], m[2]);
    return true;
  }
  C.rotearHash = rotearHash;

  // Quem chega por link direto (#cifra=..., #convite=...) cai nas Cifras.
  function entradaDireta() {
    if (/^#(cifra|musica|banda|convite|vivo|setlist)=/.test(location.hash) && U.ir) U.ir('cifras');
    else if (/^#cifras(\/[a-z_]+)?$/.test(location.hash) && U.ir) U.ir('cifras');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', entradaDireta); else setTimeout(entradaDireta, 0);
  setTimeout(function () { C.sincronizar(); }, 1500);
  // (O service worker é registrado pela página do produto — pwa.js.)
})(window);
