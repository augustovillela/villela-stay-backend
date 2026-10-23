// Pista vertical de bateria: posições visuais não alteram o MIDI nem o julgamento.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MusiqueTocarBateria = factory();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var ANTECIPACAO = 4.5, RASTRO = 0.35;
  // Vista do baterista. Os pratos ficam acima dos tambores dentro do kit,
  // deixando a parte superior da tela disponível para acompanhar as notas.
  var PECAS = [
    { id: 'crash', label: 'Crash', lines: ['Crash'], x: .075, y: .69, rx: .055, ry: .031, shape: 'cymbal', color: '#efd18a' },
    { id: 'chimbal', label: 'Chimbal', lines: ['Chimbal'], x: .19, y: .75, rx: .055, ry: .032, shape: 'hihat', color: '#e5c16f' },
    { id: 'caixa', label: 'Caixa', lines: ['Caixa'], x: .315, y: .86, rx: .046, ry: .065, shape: 'drum', color: '#efab98' },
    { id: 'bumbo', label: 'Bumbo', lines: ['Bumbo'], x: .455, y: .875, rx: .059, ry: .088, shape: 'kick', color: '#7dd9c4' },
    { id: 'tom-alto', label: 'Tom alto', lines: ['Tom', 'alto'], x: .57, y: .79, rx: .04, ry: .056, shape: 'drum', color: '#91b9ed' },
    { id: 'tom-medio', label: 'Tom médio', lines: ['Tom', 'médio'], x: .675, y: .79, rx: .04, ry: .056, shape: 'drum', color: '#aaa7ec' },
    { id: 'tom-baixo', label: 'Tom baixo', lines: ['Tom', 'baixo'], x: .78, y: .79, rx: .04, ry: .056, shape: 'drum', color: '#c49fd9' },
    { id: 'surdo-baixo', label: 'Surdo baixo', lines: ['Surdo', 'baixo'], x: .88, y: .875, rx: .041, ry: .068, shape: 'drum', color: '#82c8dc' },
    { id: 'ride', label: 'Ride', lines: ['Ride'], x: .94, y: .69, rx: .047, ry: .031, shape: 'cymbal', color: '#dab77c' }
  ];
  var DESTINOS = [
    { midi: 49, id: 'crash', physical: 'crash', symbol: 'Cr' },
    { midi: 42, id: 'chimbal-fechado', physical: 'chimbal', offset: -.017, symbol: '×', variant: 'closed' },
    { midi: 46, id: 'chimbal-aberto', physical: 'chimbal', offset: .017, symbol: '○', variant: 'open' },
    { midi: 38, id: 'caixa', physical: 'caixa', symbol: 'C' },
    { midi: 36, id: 'bumbo', physical: 'bumbo', symbol: 'B' },
    { midi: 50, id: 'tom-alto', physical: 'tom-alto', symbol: 'A' },
    { midi: 47, id: 'tom-medio', physical: 'tom-medio', symbol: 'M' },
    { midi: 45, id: 'tom-baixo', physical: 'tom-baixo', symbol: 'B' },
    { midi: 41, id: 'surdo-baixo', physical: 'surdo-baixo', symbol: 'S' },
    { midi: 51, id: 'ride', physical: 'ride', symbol: 'R' }
  ];
  function finito(n) { return typeof n === 'number' && Number.isFinite(n); }
  function geometria(opcoes) {
    var w = opcoes && opcoes.w, h = opcoes && opcoes.h;
    if (!finito(w) || !finito(h) || w <= 0 || h <= 0) throw new Error('Informe largura e altura positivas para a pista de bateria.');
    var d = finito(opcoes.d) && opcoes.d > 0 ? opcoes.d : 1;
    var font = Math.max(8 * d, Math.min(11 * d, w * .018));
    var pieces = PECAS.map(function (peca) {
      return { id: peca.id, label: peca.label, lines: peca.lines.slice(), x: w * peca.x, y: h * peca.y,
        rx: Math.min(w * peca.rx, h * (peca.shape === 'kick' ? .093 : peca.shape === 'drum' ? .077 : .12)),
        ry: h * peca.ry, shape: peca.shape, color: peca.color };
    });
    var targets = DESTINOS.map(function (destino) {
      var peca = pieces.find(function (item) { return item.id === destino.physical; });
      return { midi: destino.midi, id: destino.id, physical: peca.id, label: destino.variant ? 'Chimbal ' + (destino.variant === 'open' ? 'aberto' : 'fechado') : peca.label,
        symbol: destino.symbol, variant: destino.variant || '', color: peca.color,
        x: peca.x + (destino.offset || 0) * w, y: peca.y };
    });
    return { w: w, h: h, d: d, top: h * .145, font: font, radius: Math.min(13 * d, w * .013, h * .029),
      pieces: pieces, targets: targets, ahead: ANTECIPACAO, trail: RASTRO };
  }
  function projetarTempo(tempo, position, target, geo) {
    var dt = tempo - position;
    return { x: target.x, y: geo.top + (target.y - geo.top) * (1 - dt / geo.ahead), delta: dt };
  }
  // Função pura compartilhada pelos testes e pelo desenho. Uma nota usa o
  // destino da sua peça exata, inclusive os dois estados do mesmo chimbal.
  function projetarNota(nota, opcoes) {
    var geo = opcoes.geometria, position = finito(opcoes.position) ? opcoes.position : 0;
    var from = finito(opcoes.from) ? opcoes.from : 0, to = finito(opcoes.to) ? opcoes.to : Infinity;
    if (!nota || !finito(nota.time) || nota.time < from || nota.time >= to) return null;
    var target = geo.targets.find(function (item) { return item.midi === nota.midi && (!nota.drum || item.id === nota.drum); });
    if (!target) return null;
    var point = projetarTempo(nota.time, position, target, geo);
    if (point.delta < -geo.trail || point.delta > geo.ahead) return null;
    return { id: nota.id, midi: nota.midi, target: target, x: point.x, y: point.y,
      delta: point.delta, alpha: point.delta < 0 ? Math.max(0, 1 + point.delta / geo.trail) : 1,
      status: opcoes.statuses && opcoes.statuses[nota.id] || 'pending' };
  }
  function elipse(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
  function linha(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  function pad(g, peca, geo) {
    var d = geo.d;
    if (peca.shape === 'cymbal' || peca.shape === 'hihat') {
      // Suporte e borda dupla identificam pratos mesmo sem perceber a cor.
      g.strokeStyle = '#91a7ba60'; g.lineWidth = d;
      linha(g, peca.x, peca.y + peca.ry, peca.x, Math.min(geo.h * .95, peca.y + geo.h * .14));
      elipse(g, peca.x, peca.y + 3 * d, peca.rx, peca.ry); g.fillStyle = '#665b38'; g.fill();
      elipse(g, peca.x, peca.y, peca.rx, peca.ry); g.fillStyle = '#554d35'; g.fill(); g.strokeStyle = peca.color; g.lineWidth = 1.5 * d; g.stroke();
      elipse(g, peca.x, peca.y, peca.rx * .75, peca.ry * .65); g.strokeStyle = peca.color + '70'; g.lineWidth = d; g.stroke();
      if (peca.shape === 'hihat') {
        g.fillStyle = '#e2e9ed'; g.font = '600 ' + geo.font + 'px system-ui';
        g.fillText('Chimbal', peca.x, peca.y + peca.ry + geo.font * 1.05, peca.rx * 2.1);
        g.font = '500 ' + Math.max(7 * d, geo.font * .8) + 'px system-ui'; g.fillStyle = '#c5cfda';
        g.fillText('× fechado · ○ aberto', peca.x, peca.y + peca.ry + geo.font * 2.2, peca.rx * 2.25);
      }
    } else {
      elipse(g, peca.x, peca.y + 4 * d, peca.rx, peca.ry); g.fillStyle = '#0c1725'; g.fill();
      elipse(g, peca.x, peca.y, peca.rx, peca.ry); g.fillStyle = '#1c3043'; g.fill(); g.strokeStyle = peca.color; g.lineWidth = 2 * d; g.stroke();
      elipse(g, peca.x, peca.y, peca.rx * .85, peca.ry * .82); g.strokeStyle = peca.color + '65'; g.lineWidth = d; g.stroke();
      if (peca.shape === 'kick') {
        g.fillStyle = peca.color + '65'; g.fillRect(peca.x - peca.rx * .12, peca.y + peca.ry * .65, peca.rx * .24, peca.ry * .28);
      }
    }
    if (peca.shape !== 'hihat') {
      g.fillStyle = '#e8edf2'; g.font = '600 ' + geo.font + 'px system-ui';
      peca.lines.forEach(function (label, index) {
        g.fillText(label, peca.x, peca.y + (index - (peca.lines.length - 1) / 2) * geo.font * 1.12, peca.rx * 1.65);
      });
    }
  }
  function marcador(g, point, geo) {
    var target = point.target, radius = geo.radius, d = geo.d;
    var acertou = point.status === 'hit', perdeu = point.status === 'miss' || point.status === 'skipped';
    g.globalAlpha = point.alpha;
    g.fillStyle = acertou ? '#7ad7ac' : perdeu ? '#c18489' : target.color;
    g.strokeStyle = '#e8edf2'; g.lineWidth = 1.2 * d;
    g.beginPath();
    if (target.variant === 'open') {
      g.arc(point.x, point.y, radius, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(point.x, point.y, radius * .55, 0, Math.PI * 2); g.fillStyle = '#17273a'; g.fill();
    } else {
      g.roundRect(point.x - radius, point.y - radius * .8, radius * 2, radius * 1.6, radius * .32); g.fill();
    }
    if (acertou || perdeu || target.variant !== 'open') {
      g.fillStyle = '#17273a'; g.font = '800 ' + Math.min(12 * d, radius * 1.25) + 'px system-ui';
      g.fillText(acertou ? '✓' : perdeu ? '−' : target.symbol, point.x, point.y + .5 * d, radius * 1.7);
    }
    g.globalAlpha = 1;
  }
  function desenhar(g, opcoes) {
    var geo = geometria(opcoes), w = geo.w, h = geo.h, d = geo.d;
    var position = finito(opcoes.position) ? opcoes.position : 0;
    var statuses = opcoes.statuses || {};
    if (Array.isArray(statuses)) { var mapa = Object.create(null); statuses.forEach(function (s) { mapa[s.id] = s.status; }); statuses = mapa; }
    var params = { geometria: geo, position: position, from: opcoes.from, to: opcoes.to, statuses: statuses };
    g.save();
    g.clearRect(0, 0, w, h);
    var fundo = g.createLinearGradient(0, 0, 0, h); fundo.addColorStop(0, '#111c2d'); fundo.addColorStop(1, '#1d3042');
    g.fillStyle = fundo; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#bfceda'; g.font = '600 ' + Math.min(11 * d, w * .024) + 'px system-ui';
    g.fillText(!opcoes.running && opcoes.mode === 'idle' ? 'AS BATIDAS DESCEM ATÉ CADA PEÇA' : 'TOQUE QUANDO A NOTA ALCANÇAR A PEÇA', w / 2, h * .065, w * .9);

    // Corredores contínuos terminam nos próprios tambores e pratos.
    geo.targets.forEach(function (target) {
      g.fillStyle = target.color + '08'; g.fillRect(target.x - geo.radius * 1.35, geo.top, geo.radius * 2.7, target.y - geo.top);
      g.strokeStyle = target.color + '30'; g.lineWidth = d;
      linha(g, target.x, geo.top, target.x, target.y);
    });
    g.save(); g.beginPath(); g.rect(0, geo.top - geo.radius, w, h - geo.top + geo.radius); g.clip();
    (opcoes.beats || []).slice(0, 64).forEach(function (tempo) {
      if (!finito(tempo) || tempo < position || tempo > position + geo.ahead || (finito(opcoes.from) && tempo < opcoes.from) || (finito(opcoes.to) && tempo >= opcoes.to)) return;
      g.strokeStyle = '#d5e4ec20'; g.lineWidth = d;
      geo.targets.forEach(function (target) {
        var pt = projetarTempo(tempo, position, target, geo);
        linha(g, pt.x - geo.radius, pt.y, pt.x + geo.radius, pt.y);
      });
    });
    geo.pieces.forEach(function (peca) { pad(g, peca, geo); });
    geo.targets.filter(function (target) { return target.variant; }).forEach(function (target) {
      g.strokeStyle = target.color; g.lineWidth = 1.5 * d;
      g.beginPath(); g.arc(target.x, target.y, geo.radius * .72, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#f3e0b3'; g.font = '700 ' + Math.min(12 * d, geo.radius * 1.35) + 'px system-ui';
      g.fillText(target.symbol, target.x, target.y + .4 * d);
    });
    var notes = opcoes.chart && Array.isArray(opcoes.chart.notes) ? opcoes.chart.notes : [];
    notes.slice().reverse().forEach(function (nota) {
      var point = projetarNota(nota, params); if (!point) return;
      if (point.status === 'hit' && point.delta <= .08 && point.delta >= -.18) {
        g.strokeStyle = '#7ad7ac'; g.lineWidth = 2 * d; g.globalAlpha = Math.max(0, 1 + Math.min(0, point.delta) / .18);
        elipse(g, point.target.x, point.target.y, geo.radius * 1.8, geo.radius * 1.3); g.stroke(); g.globalAlpha = 1;
      }
      marcador(g, point, geo);
    });
    g.restore(); g.restore();
    return geo;
  }
  return { geometria: geometria, projetarNota: projetarNota, desenhar: desenhar };
});
