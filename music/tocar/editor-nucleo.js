// Edição de charts sem DOM, banco, áudio ou persistência. O núcleo musical
// continua sendo a fonte da validação; não há quantização implícita.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nucleo'), root);
  else root.MusiqueTocarEditorCore = factory(root.MusiqueTocarCore, root);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (Core, root) {
  'use strict';

  if (!Core || typeof Core.validarChart !== 'function') throw new Error('Carregue MusiqueTocarCore antes do editor.');
  var LIMITE_HISTORICO = 80, sequenciaChart = 0;
  var has = function (o, key) { return Object.prototype.hasOwnProperty.call(o, key); };
  function exigir(ok, mensagem) { if (!ok) throw new Error(mensagem); }
  function objeto(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function campos(o, permitidos, obrigatorios, nome) {
    exigir(objeto(o), nome + ' deve ser um objeto.');
    exigir(Object.keys(o).every(function (key) { return permitidos.indexOf(key) !== -1; }), nome + ' contém campos não permitidos.');
    (obrigatorios || []).forEach(function (key) { exigir(has(o, key), nome + ': falta o campo ' + key + '.'); });
  }
  function copiar(chart) {
    var c = { id: chart.id, title: chart.title, bpm: chart.bpm, duration: chart.duration,
      tuning: chart.tuning.slice(), notes: chart.notes.map(function (n) { return Object.assign({}, n); }) };
    if (has(chart, 'sections')) c.sections = chart.sections.map(function (s) { return Object.assign({}, s); });
    // O mapa de andamento é parte da música importada. Notas, frases e
    // duração podem mudar sem apagar a relação de batidas do MIDI original.
    if (has(chart, 'tempoMap')) c.tempoMap = { version: chart.tempoMap.version,
      events: chart.tempoMap.events.map(function (event) { return Object.assign({}, event); }) };
    if (has(chart, 'metadata')) c.metadata = Object.assign({}, chart.metadata);
    return c;
  }
  function iguais(a, b) {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    var keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(function (key) { return has(b, key) && iguais(a[key], b[key]); });
  }
  function alterar(alvo, alteracoes, permitidos, nome) {
    campos(alteracoes, permitidos, [], nome);
    exigir(Object.keys(alteracoes).length > 0, nome + ' deve indicar ao menos um campo.');
    Object.keys(alteracoes).forEach(function (key) { alvo[key] = alteracoes[key]; });
  }
  function localizar(lista, id, nome) {
    exigir(typeof id === 'string', 'Informe o ID da ' + nome + '.');
    var indice = lista.findIndex(function (item) { return item.id === id; });
    exigir(indice >= 0, 'A ' + nome + ' selecionada não existe neste arranjo.');
    return indice;
  }
  function atualizarMidi(nota, chart) { nota.midi = chart.tuning[6 - nota.string] + nota.fret; }

  // A identidade nova não tem significado musical nem é usada como permissão.
  // O segundo argumento permite identidade explícita em importadores/testes.
  // Uma vez criado, o ID não é regenerado ao editar ou desfazer.
  function novoChart(title, id) {
    if (id === undefined) {
      sequenciaChart++;
      id = 'arranjo-' + (root.crypto && typeof root.crypto.randomUUID === 'function'
        ? root.crypto.randomUUID() : Date.now().toString(36) + '-' + sequenciaChart.toString(36) + '-' + Math.random().toString(36).slice(2, 12));
    }
    return Core.validarChart({ id: id, title: title === undefined ? 'Novo arranjo' : title, bpm: 90, duration: 16,
      tuning: [40, 45, 50, 55, 59, 64], notes: [{ id: 'nota-editor-1', time: 0, duration: 0.5, string: 6, fret: 0, midi: 40 }],
      sections: [], metadata: { demo: false } });
  }

  function criar(input) {
    var atual = Core.validarChart(input), passados = [], futuros = [], contador = 0;
    var usados = Object.create(null);
    usados[atual.id] = true;
    atual.notes.concat(atual.sections || []).forEach(function (item) { usados[item.id] = true; });
    function empilhar(pilha, chart) {
      pilha.push(chart);
      if (pilha.length > LIMITE_HISTORICO) pilha.shift();
    }
    function executar(op) {
      exigir(objeto(op) && typeof op.tipo === 'string' && has(op, 'tipo'), 'Informe uma operação válida do editor.');
      var candidato = copiar(atual), indice, afetado = null, proximo = contador, novoId = null;
      function gerarId(prefixo) {
        do { proximo++; novoId = prefixo + '-' + proximo; } while (usados[novoId]);
        return novoId;
      }
      switch (op.tipo) {
        case 'criarNota':
          campos(op, ['tipo', 'nota'], ['nota'], 'Criar nota');
          campos(op.nota, ['time', 'duration', 'string', 'fret'], ['time', 'duration', 'string', 'fret'], 'Nota');
          afetado = gerarId('nota-editor');
          var nota = { id: afetado, time: op.nota.time, duration: op.nota.duration, string: op.nota.string, fret: op.nota.fret };
          atualizarMidi(nota, candidato); candidato.notes.push(nota);
          break;
        case 'editarNota':
          campos(op, ['tipo', 'id', 'alteracoes'], ['id', 'alteracoes'], 'Editar nota');
          indice = localizar(candidato.notes, op.id, 'nota'); afetado = op.id;
          alterar(candidato.notes[indice], op.alteracoes, ['time', 'duration', 'string', 'fret'], 'Alterações da nota');
          atualizarMidi(candidato.notes[indice], candidato);
          break;
        case 'excluirNota':
          campos(op, ['tipo', 'id'], ['id'], 'Excluir nota');
          indice = localizar(candidato.notes, op.id, 'nota');
          exigir(candidato.notes.length > 1, 'O arranjo precisa manter ao menos uma nota. Crie outra nota antes de excluir a última.');
          afetado = op.id; candidato.notes.splice(indice, 1);
          break;
        case 'duplicarNota':
          campos(op, ['tipo', 'id', 'time'], ['id', 'time'], 'Duplicar nota');
          indice = localizar(candidato.notes, op.id, 'nota'); afetado = gerarId('nota-editor');
          candidato.notes.push(Object.assign({}, candidato.notes[indice], { id: afetado, time: op.time }));
          break;
        case 'editarChart':
          campos(op, ['tipo', 'alteracoes'], ['alteracoes'], 'Editar arranjo');
          alterar(candidato, op.alteracoes, ['title', 'bpm', 'duration'], 'Alterações do arranjo');
          break;
        case 'criarFrase':
          campos(op, ['tipo', 'frase'], ['frase'], 'Criar frase');
          campos(op.frase, ['title', 'from', 'to'], ['title', 'from', 'to'], 'Frase');
          afetado = gerarId('frase-editor');
          if (!candidato.sections) candidato.sections = [];
          candidato.sections.push({ id: afetado, title: op.frase.title, from: op.frase.from, to: op.frase.to });
          break;
        case 'editarFrase':
          campos(op, ['tipo', 'id', 'alteracoes'], ['id', 'alteracoes'], 'Editar frase');
          indice = localizar(candidato.sections || [], op.id, 'frase'); afetado = op.id;
          alterar(candidato.sections[indice], op.alteracoes, ['title', 'from', 'to'], 'Alterações da frase');
          break;
        case 'excluirFrase':
          campos(op, ['tipo', 'id'], ['id'], 'Excluir frase');
          indice = localizar(candidato.sections || [], op.id, 'frase'); afetado = op.id;
          candidato.sections.splice(indice, 1);
          break;
        default:
          throw new Error('Operação do editor desconhecida: ' + op.tipo + '.');
      }
      // Validação antes de mudar estado, pilhas ou sequência de IDs. Não basta
      // validar só o evento: mover uma nota pode sobrepor outra ou sair do chart.
      var validado = Core.validarChart(candidato);
      if (!iguais(atual, validado)) {
        empilhar(passados, atual); futuros = []; atual = validado;
        contador = proximo;
        if (novoId) usados[novoId] = true;
      }
      return { chart: copiar(atual), id: afetado };
    }
    function desfazer() {
      if (!passados.length) return null;
      empilhar(futuros, atual); atual = passados.pop();
      return copiar(atual);
    }
    function refazer() {
      if (!futuros.length) return null;
      empilhar(passados, atual); atual = futuros.pop();
      return copiar(atual);
    }
    return { obter: function () { return copiar(atual); }, executar: executar, desfazer: desfazer, refazer: refazer,
      podeDesfazer: function () { return passados.length > 0; }, podeRefazer: function () { return futuros.length > 0; } };
  }
  return { criar: criar, novoChart: novoChart, LIMITE_HISTORICO: LIMITE_HISTORICO };
});
