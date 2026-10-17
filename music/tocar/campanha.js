// Campanha autoral do Musique: progressão local, determinística e independente da UI.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./estudos'));
  else root.MusiqueTocarCampanha = factory(root.MusiqueTocarEstudos);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Estudos) {
  'use strict';
  if (!Estudos || typeof Estudos.listar !== 'function' || typeof Estudos.obter !== 'function') throw new Error('Carregue MusiqueTocarEstudos antes da campanha.');
  var VERSION = 1;
  var ORDEM = Object.freeze({
    violao: ['primeiro-riff-v1', 'cordas-soltas-v1', 'cordas-vizinhas-v1', 'primeiras-casas-v1', 'pentatonica-mi-v1', 'saltos-entre-cordas-v1', 'frase-de-revisao-v1'],
    guitarra: ['primeiro-riff-v1', 'cordas-soltas-v1', 'cordas-vizinhas-v1', 'primeiras-casas-v1', 'pentatonica-mi-v1', 'saltos-entre-cordas-v1', 'frase-de-revisao-v1'],
    baixo: ['baixo-pulsacao-v1'], cavaquinho: ['cavaquinho-pulsacao-v1'], ukulele: ['ukulele-pulsacao-v1'],
    bandolim: ['bandolim-pulsacao-v1'], bateria: ['bateria-pulsacao-v1'], piano: ['piano-pulsacao-v1']
  });
  function copiar(valor) { return JSON.parse(JSON.stringify(valor)); }
  function instrumento(valor) { return ORDEM[valor] ? valor : 'violao'; }
  function idsDa(valor) { return ORDEM[instrumento(valor)].slice(); }
  function catalogo() { return new Map(Estudos.listar().map(function (estudo) { return [estudo.id, estudo]; })); }
  function desafio(estudo, index) {
    var layout = estudo.chart && estudo.chart.layout;
    var nivel = index + 1;
    var acao = layout === 'piano' ? 'Toque todas as teclas e acordes do arranjo.' : layout === 'drums' ? 'Mantenha bumbo, caixa e chimbal no pulso.' : 'Toque cada nota indicada com ataque claro.';
    return { id: estudo.id + '-desafio', level: 'Nível ' + nivel, objective: acao, target: 'Concluir o arranjo completo', metric: 'conclusao' };
  }
  function recompensa(estudo, index, completed) {
    return { id: 'distintivo-' + estudo.id, title: index === 0 ? 'Primeiro passo' : 'Etapa ' + (index + 1) + ' dominada', description: 'Conclua esta etapa da trilha para desbloquear o distintivo.', unlocked: !!completed };
  }
  function registroInicial() { return { status: 'locked', position: 0, attempts: 0, bestAccuracy: null }; }
  function estadoBase(input) {
    input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    var inst = instrumento(input.instrument), progress = {}, origem = input.progress && typeof input.progress === 'object' && !Array.isArray(input.progress) ? input.progress : {};
    idsDa(inst).forEach(function (id) {
      var valor = origem[id] && typeof origem[id] === 'object' ? origem[id] : {};
      progress[id] = Object.assign(registroInicial(), { status: valor.status === 'completed' || valor.status === 'in_progress' ? valor.status : 'locked', position: Number.isFinite(valor.position) && valor.position >= 0 ? valor.position : 0, attempts: Number.isInteger(valor.attempts) && valor.attempts >= 0 ? valor.attempts : 0, bestAccuracy: Number.isFinite(valor.bestAccuracy) && valor.bestAccuracy >= 0 && valor.bestAccuracy <= 100 ? valor.bestAccuracy : null });
    });
    return { version: VERSION, instrument: inst, progress: progress };
  }
  function recalcular(state) {
    var base = estadoBase(state), ids = idsDa(base.instrument);
    for (var i = 0; i < ids.length; i++) {
      var item = base.progress[ids[i]];
      if (item.status === 'completed') continue;
      item.status = i === 0 || base.progress[ids[i - 1]].status === 'completed' ? item.status === 'in_progress' ? 'in_progress' : 'available' : 'locked';
    }
    return base;
  }
  function criar(input) { return recalcular(input); }
  function listar(state, wantedInstrument) {
    var base = recalcular(state || { instrument: wantedInstrument }), porId = catalogo();
    return idsDa(base.instrument).map(function (id, index) {
      var estudo = porId.get(id), item = copiar(estudo);
      item.order = index + 1; item.status = base.progress[id].status; item.progress = copiar(base.progress[id]); item.unlocked = item.status === 'available' || item.status === 'in_progress'; item.challenge = desafio(item, index); item.reward = recompensa(item, index, item.status === 'completed');
      return item;
    });
  }
  function atualizar(state, id, patch) {
    var base = recalcular(state);
    if (!base.progress[id]) throw new Error('Estudo não pertence à campanha selecionada.');
    patch = patch && typeof patch === 'object' ? patch : {};
    var item = base.progress[id];
    if (item.status === 'locked') throw new Error('Estudo bloqueado; conclua a etapa anterior.');
    item.status = patch.completed === true ? 'completed' : 'in_progress';
    var chart = Estudos.obter(id);
    if (Number.isFinite(patch.position)) item.position = Math.max(0, Math.min(chart.duration, patch.position));
    if (Number.isInteger(patch.attempts) && patch.attempts >= 0) item.attempts = patch.attempts; else item.attempts += 1;
    if (Number.isFinite(patch.accuracy) && patch.accuracy >= 0 && patch.accuracy <= 100) item.bestAccuracy = item.bestAccuracy == null ? patch.accuracy : Math.max(item.bestAccuracy, patch.accuracy);
    if (item.status === 'completed') item.position = chart.duration;
    return recalcular(base);
  }
  function iniciar(state, id) { return atualizar(state, id, { position: state && state.progress && state.progress[id] ? state.progress[id].position : 0, attempts: 0 }); }
  function retomar(state, id) {
    var base = recalcular(state), alvo = id || idsDa(base.instrument).find(function (item) { return base.progress[item].status === 'in_progress'; }) || idsDa(base.instrument).find(function (item) { return base.progress[item].status === 'available'; });
    if (!alvo) return null;
    var estudo = Estudos.listar().find(function (item) { return item.id === alvo; });
    return { id: alvo, title: estudo.title, position: base.progress[alvo].position, status: base.progress[alvo].status };
  }
  function proximo(state) { var base = recalcular(state), id = idsDa(base.instrument).find(function (item) { return base.progress[item].status !== 'completed'; }); return id ? retomar(base, id) : null; }
  function resumo(state) {
    var base = recalcular(state), ids = idsDa(base.instrument), concluidas = ids.filter(function (id) { return base.progress[id].status === 'completed'; });
    return { instrument: base.instrument, total: ids.length, completed: concluidas.length, available: ids.filter(function (id) { return base.progress[id].status === 'available' || base.progress[id].status === 'in_progress'; }).length, attempts: ids.reduce(function (total, id) { return total + base.progress[id].attempts; }, 0), badges: concluidas.length, percent: Math.round(concluidas.length / ids.length * 100) };
  }
  return { VERSION: VERSION, instrumentos: function () { return Object.keys(ORDEM); }, criar: criar, listar: listar, iniciar: iniciar, atualizar: atualizar, retomar: retomar, proximo: proximo, resumo: resumo };
});
