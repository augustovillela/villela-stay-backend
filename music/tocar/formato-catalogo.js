// Documento de uma revisão do catálogo. Não acessa DOM, banco ou rede.
// Identidade estável, obra, publicação e número da revisão ficam no servidor.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nucleo'), require('./perfis'));
  else root.MusiqueTocarFormatoCatalogo = factory(root.MusiqueTocarCore, root.MusiqueTocarPerfis);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, Perfis) {
  'use strict';
  var INSTRUMENTOS = Object.freeze(['violao', 'guitarra', 'baixo', 'cavaquinho', 'ukulele', 'bandolim', 'bateria', 'piano']);
  var NIVEIS = Object.freeze(['iniciante', 'intermediario', 'avancado']);
  var TECNICAS = Object.freeze(['notas-isoladas', 'cordas-soltas', 'troca-de-cordas', 'escalas', 'arpejos']);
  var LIMITE_BYTES = 1048576;
  var CAMPOS = ['title', 'instrument', 'level', 'technique', 'objective', 'credits', 'mediaId', 'mediaOffsetMs', 'chart'];

  function exigir(ok, mensagem) { if (!ok) throw new Error(mensagem); }
  function objeto(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function texto(v, nome, maximo) {
    exigir(typeof v === 'string' && v.trim().length > 0 && v.length <= maximo &&
      !/[<>\u0000-\u001f\u007f]/.test(v), nome + ' deve ser texto simples de 1 a ' + maximo + ' caracteres, sem HTML ou caracteres de controle.');
    return v.trim();
  }
  function escolha(v, valores, nome) {
    exigir(valores.indexOf(v) !== -1, nome + ' inválido. Valores aceitos: ' + valores.join(', ') + '.');
    return v;
  }
  // O limite é em bytes UTF-8, inclusive no navegador sem Buffer/TextEncoder.
  // JSON.stringify já escapa os substitutos Unicode isolados.
  function bytesUTF8(s) {
    var total = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) total++;
      else if (c < 0x800) total += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length &&
          s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { total += 4; i++; }
      else total += 3;
      if (total > LIMITE_BYTES) return total;
    }
    return total;
  }

  function validarDocumento(input) {
    exigir(Core && typeof Core.validarChart === 'function', 'O núcleo de arranjos precisa estar carregado.');
    exigir(Perfis && typeof Perfis.obter === 'function', 'Os perfis de instrumento precisam estar carregados.');
    exigir(objeto(input), 'O documento do catálogo deve ser um objeto.');
    exigir(!Object.keys(input).some(function (campo) { return CAMPOS.indexOf(campo) === -1; }),
      'O documento contém campos não permitidos.');
    var serializado;
    try { serializado = JSON.stringify(input); }
    catch (_) { throw new Error('O documento deve conter somente dados JSON serializáveis.'); }
    exigir(typeof serializado === 'string', 'O documento deve conter somente dados JSON serializáveis.');
    exigir(bytesUTF8(serializado) <= LIMITE_BYTES, 'O documento do catálogo deve ter no máximo 1 MB em UTF-8.');

    var title = texto(input.title, 'Título', 120);
    var instrument = escolha(input.instrument, INSTRUMENTOS, 'Instrumento');
    var level = escolha(input.level, NIVEIS, 'Nível');
    var technique = escolha(input.technique, TECNICAS, 'Técnica');
    var objective = texto(input.objective, 'Objetivo', 500);
    var credits = texto(input.credits, 'Créditos', 500);
    var mediaId = input.mediaId === undefined ? '' : input.mediaId;
    exigir(typeof mediaId === 'string' && (mediaId === '' || /^[a-zA-Z0-9_-]{1,64}$/.test(mediaId)),
      'Identificador da mídia inválido: deixe vazio ou use até 64 letras, números, _ ou -.');
    var temMidia = mediaId !== '';
    var temDeslocamento = Object.prototype.hasOwnProperty.call(input, 'mediaOffsetMs');
    var mediaOffsetMs;
    if (!temMidia) exigir(!temDeslocamento, 'O deslocamento de mídia só pode existir quando houver um áudio associado.');
    else {
      mediaOffsetMs = temDeslocamento ? input.mediaOffsetMs : 0;
      exigir(Number.isSafeInteger(mediaOffsetMs) && mediaOffsetMs >= 0 && mediaOffsetMs <= 600000,
        'O deslocamento de mídia deve ser um número inteiro de 0 a 600000 ms.');
    }
    var perfil = Perfis.obter(instrument);
    exigir(perfil && (perfil.layout === 'drums' || perfil.layout === 'piano' || Array.isArray(perfil.tuning)), 'Perfil do instrumento inválido.');
    var chart = Core.validarChart(input.chart);
    exigir(chart.title === title, 'O título do documento deve ser igual ao título do arranjo (chart.title).');
    if (perfil.layout === 'drums' || perfil.layout === 'piano') {
      exigir(chart.profile === perfil.id && chart.layout === perfil.layout, 'O catálogo aceita somente arranjos MIDI no perfil declarado.');
    } else {
      exigir(chart.tuning.length === perfil.tuning.length && chart.tuning.every(function (midi, i) { return midi === perfil.tuning[i]; }),
        'O catálogo aceita ' + perfil.rotulo.toLowerCase() + ' em afinação padrão.');
    }
    // Importar para o catálogo não atribui a autoria do estudo ao Musique.
    // Todo dado musical normalizado pelo núcleo permanece intacto.
    chart.metadata = { demo: false };
    var documento = { title: title, instrument: instrument, level: level, technique: technique,
      objective: objective, credits: credits, mediaId: mediaId };
    if (temMidia) documento.mediaOffsetMs = mediaOffsetMs;
    documento.chart = chart;
    return documento;
  }

  return { validarDocumento: validarDocumento, INSTRUMENTOS: INSTRUMENTOS,
    NIVEIS: NIVEIS, TECNICAS: TECNICAS, LIMITE_BYTES: LIMITE_BYTES };
});
