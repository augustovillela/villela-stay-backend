// =====================================================================
// Musique — PULSO DE TEMPO DE USO, servido em /music/uso-cliente.js.
//
// A cada 30 s, SÓ com a aba visível E a pessoa mexendo (clique, tecla,
// toque, rolagem), avisa o servidor que ela está usando o Musique e em
// qual ÁREA. Quanto tempo isso vale quem decide é o servidor
// (music/uso-tempo.js): pulso mais rápido soma menos, nunca mais.
//
// Diferente da telemetria técnica (anônima), este pulso vai com a SESSÃO
// da pessoa — é o que alimenta o relatório "Alunos do Musique" do staff.
// O que sai: só a área ("cifras", "tocar"…). Nada do que foi tocado,
// escrito ou ouvido.
//
// Tocar junto e Laboratório: a pessoa pratica com o instrumento, não
// com o mouse — a janela de "ainda está aqui" lá é maior (10 min).
// Sem sessão (401/402/403) o pulso para de vez na página.
// =====================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (root && !root.MusiqueUso) {
    root.MusiqueUso = factory().criar({ janela: root, documento: root.document });
    root.MusiqueUso.instalar();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var URL_PULSO = '/music/api/uso/pulso';
  var PERIODO_MS = 30000;
  var OCIOSO_MS = 120000;
  var OCIOSO_PRATICA_MS = 600000;

  /** Área a partir do endereço. O servidor revalida contra a allowlist dele. */
  function areaDe(pathname, hash) {
    var p = String(pathname || '');
    var h = String(hash || '').replace(/^#/, '');
    if (/^\/music\/tocar/.test(p)) return 'tocar';
    if (/laboratorio/.test(p)) return 'laboratorio';
    if (/^\/music\/app/.test(p)) {
      if (/^(cifras|cifra=|musica=|banda=|setlist=|convite=|vivo=)/.test(h)) return 'cifras';
      if (/^palco/.test(h)) return 'palco';
      if (h === '' || h === 'estudar') return 'academia';
      if (/^biblioteca/.test(h)) return 'biblioteca';
      if (/^(escolas?|turmas?)/.test(h)) return 'escolas';
      if (/^conta/.test(h)) return 'conta';
    }
    return 'app';
  }

  function criar(o) {
    o = o || {};
    var w = o.janela || {};
    var doc = o.documento || w.document || {};
    var agora = typeof o.agora === 'function' ? o.agora : function () { return Date.now(); };
    var ultimaAcao = agora();
    var parado = false;
    var timer = null;

    function area() { return areaDe(w.location && w.location.pathname, w.location && w.location.hash); }
    function praticando() { var a = area(); return a === 'tocar' || a === 'laboratorio'; }
    function visivel() { return doc.visibilityState === undefined || doc.visibilityState === 'visible'; }
    function marcar() { ultimaAcao = agora(); }

    function enviar(corpo) {
      if (typeof o.enviar === 'function') return o.enviar(corpo);
      try {
        if (typeof w.fetch !== 'function') return;
        var p = w.fetch(URL_PULSO, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        if (p && p.then) p.then(function (r) { if (r && (r.status === 401 || r.status === 402 || r.status === 403)) parar(); }).catch(function () {});
      } catch (_) { /* sem rede, sem pulso */ }
    }

    /** Devolve o corpo enviado (para teste) ou null quando nada saiu. */
    function pulsar() {
      if (parado || !visivel()) return null;
      var limite = praticando() ? OCIOSO_PRATICA_MS : OCIOSO_MS;
      if (agora() - ultimaAcao > limite) return null;
      var corpo = { area: area() };
      enviar(corpo);
      return corpo;
    }

    function parar() { parado = true; if (timer && w.clearInterval) w.clearInterval(timer); }

    function instalar() {
      if (!w.addEventListener) return;
      ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(function (e) {
        w.addEventListener(e, marcar, { passive: true, capture: true });
      });
      timer = w.setInterval(pulsar, PERIODO_MS);
    }

    return { pulsar: pulsar, instalar: instalar, parar: parar, marcar: marcar, area: area };
  }

  return { criar: criar, areaDe: areaDe, PERIODO_MS: PERIODO_MS, OCIOSO_MS: OCIOSO_MS, OCIOSO_PRATICA_MS: OCIOSO_PRATICA_MS };
});
