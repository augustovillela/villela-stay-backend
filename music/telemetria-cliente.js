// =====================================================================
// Musique — emissor de TELEMETRIA TÉCNICA anônima, servido em
// /music/telemetria-cliente.js e embutido no bundle do Laboratório.
//
// Um arquivo só para o app (/music/app), o Tocar junto (/music/tocar) e o
// Laboratório: três cópias do emissor divergiriam na allowlist e no
// limite de volume.
//
// O QUE SAI: evento (só da allowlist), rota (só o pathname, com trechos
// que parecem identificador trocados por ":id"), navegador e sistema em
// família ("chrome", "windows"), versão do app, tempo desde a abertura da
// página e um CÓDIGO curto de máquina ("NotAllowedError", "api_500").
//
// O QUE NUNCA SAI: mensagem de erro, pilha, query string, hash, URL
// assinada, e-mail, conta, token, áudio ou conteúdo musical. O código é
// recusado se não for um identificador curto — mensagem de exceção pode
// carregar texto do usuário.
//
// Volume: cada evento+código sai uma vez por página e no máximo TETO
// eventos por sessão do navegador. Falha de envio é engolida: telemetria
// quebrada não pode quebrar a prática.
// =====================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (root && !root.MusiqueTelemetria) {
    root.MusiqueTelemetria = factory().criar({ janela: root });
    root.MusiqueTelemetria.instalar();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Espelho de EVENTOS em music/telemetria.js (o teste compara os dois).
  var EVENTOS = ['js_error', 'audio_load_error', 'audio_decode_error', 'microphone_denied',
    'browser_unsupported', 'upload_error', 'worker_error', 'route_error'];
  var URL_ENVIO = '/music/api/telemetria';
  var VERSAO = '2026.10';
  var TETO = 20;
  var CHAVE_SESSAO = 'musique-telemetria-enviados';
  var CODIGO = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;

  function navegadorDe(ua) {
    ua = String(ua || '');
    return /Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /SamsungBrowser\//.test(ua) ? 'samsung'
      : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'outro';
  }
  function sistemaDe(ua) {
    ua = String(ua || '');
    return /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Windows/.test(ua) ? 'windows'
      : /Mac OS X|Macintosh/.test(ua) ? 'macos' : /CrOS/.test(ua) ? 'chromeos' : /Linux/.test(ua) ? 'linux' : 'outro';
  }
  /** Só o pathname; trechos com cara de id/token viram ":id". */
  function rotaDe(caminho) {
    var p = String(caminho || '/').split(/[?#]/)[0];
    return p.split('/').map(function (s) {
      return /\d{3,}/.test(s) || /^[A-Za-z0-9_-]{20,}$/.test(s) || /@|%40/.test(s) ? ':id' : s;
    }).join('/').slice(0, 180) || '/';
  }
  function codigoDe(v) {
    var c = String(v == null ? '' : v);
    return CODIGO.test(c) ? c : (c ? 'outro' : '');
  }

  function criar(opcoes) {
    var o = opcoes || {};
    var w = o.janela || {};
    var nav = o.navigator || w.navigator || {};
    var inicio = typeof o.agora === 'function' ? o.agora() : Date.now();
    var agora = typeof o.agora === 'function' ? o.agora : function () { return Date.now(); };
    var vistos = {};
    var enviadosNaPagina = 0;

    function contagemSessao(somar) {
      try {
        var s = w.sessionStorage; if (!s) return enviadosNaPagina;
        var n = Number(s.getItem(CHAVE_SESSAO)) || 0;
        if (somar) s.setItem(CHAVE_SESSAO, String(n + 1));
        return n;
      } catch (_) { return enviadosNaPagina; }
    }

    function enviar(corpo) {
      if (typeof o.enviar === 'function') return o.enviar(corpo);
      var json = JSON.stringify(corpo);
      try {
        if (nav.sendBeacon && typeof w.Blob === 'function' &&
          nav.sendBeacon(URL_ENVIO, new w.Blob([json], { type: 'application/json' }))) return;
      } catch (_) { /* cai para o fetch */ }
      try {
        if (typeof w.fetch === 'function') {
          var p = w.fetch(URL_ENVIO, { method: 'POST', keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: json });
          if (p && p.catch) p.catch(function () {});
        }
      } catch (_) { /* sem rede, sem telemetria */ }
    }

    /** Devolve o corpo enviado (para teste) ou null quando nada saiu. */
    function emitir(evento, codigo) {
      try {
        if (EVENTOS.indexOf(evento) < 0) return null;
        var c = codigoDe(codigo);
        var chave = evento + '|' + c;
        if (vistos[chave]) return null;
        if (enviadosNaPagina >= TETO || contagemSessao(false) >= TETO) return null;
        vistos[chave] = true;
        enviadosNaPagina++;
        contagemSessao(true);
        var ua = nav.userAgent;
        var corpo = {
          evento: evento,
          rota: rotaDe(w.location && w.location.pathname),
          navegador: navegadorDe(ua),
          sistema: sistemaDe(ua),
          versao_app: VERSAO,
          duracao_ms: Math.max(0, Math.min(600000, Math.round(agora() - inicio))),
          codigo: c,
        };
        enviar(corpo);
        return corpo;
      } catch (_) { return null; }
    }

    /** Erro de getUserMedia/decodificação/worker → evento da allowlist. */
    function erroDeMidia(e, padrao) {
      var nome = e && e.name;
      if (e && e.telemetria && e.telemetria.evento) return emitir(e.telemetria.evento, e.telemetria.codigo);
      if (nome === 'NotAllowedError' || nome === 'SecurityError' || nome === 'PermissionDeniedError') return emitir('microphone_denied', nome);
      if (padrao) return emitir(padrao, e && e.name);
      return null;
    }

    var instalado = false;
    function instalar() {
      if (instalado || !w.addEventListener) return;
      instalado = true;
      w.addEventListener('error', function (ev) {
        // Falha de carga de <script>/<audio> não borbulha; aqui só chega erro de JS.
        emitir('js_error', ev && ev.error && ev.error.name ? ev.error.name : 'window_error');
      });
      w.addEventListener('unhandledrejection', function (ev) {
        var r = ev && ev.reason;
        emitir('js_error', r && r.name ? 'rejection_' + r.name : 'unhandled_rejection');
      });
    }

    return { emitir: emitir, erroDeMidia: erroDeMidia, instalar: instalar };
  }

  return { EVENTOS: EVENTOS, TETO: TETO, criar: criar, rotaDe: rotaDe, codigoDe: codigoDe, navegadorDe: navegadorDe, sistemaDe: sistemaDe };
});
