// =====================================================================
// PULSO DE TEMPO DE USO dos produtos do grupo — servido em /uso-produto.js
// e injetado pelo servidor nas páginas HTML dos produtos medidos
// (ver nucleo/uso-produtos.js).
//
// A cada 30 s, SÓ com a aba visível E a pessoa mexendo (clique, tecla,
// toque, rolagem), avisa o servidor em `/<produto>/api/uso/pulso`. Sem
// sessão (401/403) o pulso para de vez na página. Quanto vale cada pulso
// quem decide é o servidor — pulso mais rápido soma MENOS, nunca mais.
//
// O que sai: só a ÁREA (um rótulo curto tirado do endereço). Nada do que
// a pessoa digitou, viu ou fez.
// =====================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (root && !root.VillelaUso) {
    root.VillelaUso = factory().criar({ janela: root, documento: root.document });
    root.VillelaUso.instalar();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var PERIODO_MS = 30000;
  var OCIOSO_MS = 120000;

  /** { prefixo: "/finance", area: "app" } a partir de pathname e hash. */
  function ondeEstou(pathname, hash) {
    var seg = String(pathname || '/').split('/').filter(Boolean);
    if (!seg.length) return null;
    var prefixo = '/' + seg[0];
    var area = seg[1] || String(hash || '').replace(/^#\/?/, '').split(/[/?=&]/)[0] || 'inicio';
    area = area.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'inicio';
    return { prefixo: prefixo, area: area };
  }

  function criar(o) {
    o = o || {};
    var w = o.janela || {};
    var doc = o.documento || w.document || {};
    var agora = typeof o.agora === 'function' ? o.agora : function () { return Date.now(); };
    var ultimaAcao = agora();
    var parado = false;
    var timer = null;

    function visivel() { return doc.visibilityState === undefined || doc.visibilityState === 'visible'; }
    function marcar() { ultimaAcao = agora(); }
    function parar() { parado = true; if (timer && w.clearInterval) w.clearInterval(timer); }

    function enviar(url, corpo) {
      if (typeof o.enviar === 'function') return o.enviar(url, corpo);
      try {
        if (typeof w.fetch !== 'function') return;
        var p = w.fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        if (p && p.then) p.then(function (r) { if (r && (r.status === 401 || r.status === 403 || r.status === 404)) parar(); }).catch(function () {});
      } catch (_) { /* sem rede, sem pulso */ }
    }

    /** Devolve { url, corpo } enviado (para teste) ou null quando nada saiu. */
    function pulsar() {
      if (parado || !visivel()) return null;
      if (agora() - ultimaAcao > OCIOSO_MS) return null;
      var onde = ondeEstou(w.location && w.location.pathname, w.location && w.location.hash);
      if (!onde) return null;
      var url = onde.prefixo + '/api/uso/pulso';
      var corpo = { area: onde.area };
      enviar(url, corpo);
      return { url: url, corpo: corpo };
    }

    function instalar() {
      if (!w.addEventListener) return;
      ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(function (e) {
        w.addEventListener(e, marcar, { passive: true, capture: true });
      });
      timer = w.setInterval(pulsar, PERIODO_MS);
    }

    return { pulsar: pulsar, instalar: instalar, parar: parar, marcar: marcar };
  }

  return { criar: criar, ondeEstou: ondeEstou, PERIODO_MS: PERIODO_MS, OCIOSO_MS: OCIOSO_MS };
});
