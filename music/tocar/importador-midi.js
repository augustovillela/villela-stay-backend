// Leitura local de Standard MIDI Files para o editor de Tocar junto.
// Este módulo não abre arquivos, não usa DOM e nunca envia os bytes recebidos.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nucleo'), require('./perfis'));
  else root.MusiqueTocarImportadorMidi = factory(root.MusiqueTocarCore, root.MusiqueTocarPerfis);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (Core, Perfis) {
  'use strict';

  var LIMITE_BYTES = 512 * 1024;
  var LIMITE_NOTAS = 2000;
  var LIMITE_DURACAO = 900;
  var LIMITE_TEMPOS = 512;
  var BPM_MINIMO = 20;
  var BPM_MAXIMO = 300;
  var EPS = 1e-9;
  var analises = new WeakMap();

  function falhar(mensagem) { throw new Error('MIDI inválido: ' + mensagem); }
  function exigir(condicao, mensagem) { if (!condicao) throw new Error(mensagem); }
  function possui(objeto, chave) { return Object.prototype.hasOwnProperty.call(objeto, chave); }
  function objeto(valor) { return valor && typeof valor === 'object' && !Array.isArray(valor); }

  function perfilPorId(id) {
    exigir(Perfis && typeof Perfis.obter === 'function', 'Carregue MusiqueTocarPerfis antes de importar MIDI.');
    exigir(typeof id === 'string', 'Informe um perfil de instrumento válido.');
    var origem = Perfis.obter(id);
    exigir(origem, 'Perfil de instrumento desconhecido.');
    if (origem.layout === 'drums') return { id: origem.id, layout: 'drums', drums: origem.drums.slice(), minMidi: 0, maxMidi: 127 };
    if (origem.layout === 'piano') return { id: origem.id, layout: 'piano', minMidi: origem.minMidi, maxMidi: origem.maxMidi };
    exigir(Array.isArray(origem.tuning), 'Perfil de instrumento inválido.');
    exigir(Number.isInteger(origem.strings) && origem.strings >= 1 && origem.strings <= 6 && origem.tuning.length === origem.strings,
      'Perfil de instrumento inválido.');
    exigir(Number.isInteger(origem.frets) && origem.frets >= 0 && origem.frets <= 24, 'Perfil de instrumento inválido.');
    var tuning = origem.tuning.slice();
    tuning.forEach(function (midi, indice) {
      exigir(Number.isInteger(midi) && midi >= 0 && midi <= 103, 'Perfil de instrumento inválido.');
      if (indice && origem.id !== 'ukulele') exigir(midi > tuning[indice - 1], 'Perfil de instrumento inválido.');
    });
    return { id: origem.id, tuning: tuning, strings: origem.strings, frets: origem.frets,
      minMidi: tuning[0], maxMidi: tuning[tuning.length - 1] + origem.frets };
  }
  function perfilDaAnalise(opcoes) {
    if (opcoes === undefined) return perfilPorId('violao');
    if (typeof opcoes === 'string') return perfilPorId(opcoes);
    exigir(objeto(opcoes) && Object.keys(opcoes).length === 1 && possui(opcoes, 'perfil'),
      'Informe somente perfil para analisar o MIDI.');
    return perfilPorId(opcoes.perfil);
  }
  function mesmoPerfil(a, b) {
    if (a.layout === 'drums' || b.layout === 'drums') return a.layout === b.layout && a.id === b.id;
    return a.strings === b.strings && a.frets === b.frets && a.tuning.length === b.tuning.length &&
      a.tuning.every(function (midi, indice) { return midi === b.tuning[indice]; });
  }
  function perfilDaCriacao(opcoes, perfilDaOrigem) {
    if (!possui(opcoes, 'perfil')) return perfilDaOrigem;
    var solicitado = perfilPorId(opcoes.perfil);
    exigir(mesmoPerfil(solicitado, perfilDaOrigem),
      'O perfil do arranjo deve ser o mesmo perfil usado na análise MIDI.');
    return perfilDaOrigem;
  }
  function nomeMidi(midi) {
    return ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'][midi % 12] + (Math.floor(midi / 12) - 1);
  }
  function descricaoExtensao(perfil) { return nomeMidi(perfil.minMidi) + '–' + nomeMidi(perfil.maxMidi); }
  function nomeDoInstrumento(perfil) { return perfil.id === 'cavaquinho' ? 'cavaquinho' : perfil.id === 'ukulele' ? 'ukulele' : perfil.id === 'bandolim-5' ? 'bandolim' : perfil.strings === 4 ? 'baixo' : 'guitarra'; }

  function copiarTempo(evento) {
    return { time: evento.time, beat: evento.beat, bpm: evento.bpm };
  }
  function copiarMapa(eventos) { return eventos.map(copiarTempo); }

  function bytesDaEntrada(entrada) {
    var tag = Object.prototype.toString.call(entrada);
    var origem;
    if (tag === '[object Uint8Array]') origem = entrada;
    else if (tag === '[object ArrayBuffer]') origem = new Uint8Array(entrada);
    else falhar('forneça um ArrayBuffer ou Uint8Array.');
    if (origem.byteLength > LIMITE_BYTES) falhar('o arquivo excede o limite de 512 KiB.');
    // A cópia impede que uma alteração externa durante a análise mude o resultado.
    return new Uint8Array(origem);
  }

  function inteiro16(bytes, posicao) {
    return bytes[posicao] * 256 + bytes[posicao + 1];
  }
  function inteiro32(bytes, posicao) {
    return ((bytes[posicao] * 0x1000000) + (bytes[posicao + 1] * 0x10000) +
      (bytes[posicao + 2] * 0x100) + bytes[posicao + 3]);
  }
  function assinatura(bytes, posicao, texto) {
    for (var i = 0; i < texto.length; i++) if (bytes[posicao + i] !== texto.charCodeAt(i)) return false;
    return true;
  }
  function lerVLQ(bytes, cursor, fim) {
    var valor = 0, byte;
    for (var i = 0; i < 4; i++) {
      if (cursor >= fim) falhar('VLQ truncada.');
      byte = bytes[cursor++];
      valor = valor * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return { value: valor, cursor: cursor };
    }
    falhar('VLQ usa mais de quatro bytes.');
  }
  function lerDado(bytes, estado) {
    if (estado.cursor >= estado.fim) falhar('evento MIDI truncado.');
    var dado = bytes[estado.cursor++];
    if (dado & 0x80) falhar('byte de dados MIDI com bit de status ativo.');
    return dado;
  }
  function textoDaFaixa(bytes) {
    var partes = [];
    for (var i = 0; i < bytes.length; i++) {
      var codigo = bytes[i];
      // Metadados de texto MIDI não têm codificação universal; caracteres
      // ASCII ficam legíveis e os demais não viram controles na interface.
      partes.push(codigo >= 32 && codigo !== 127 ? String.fromCharCode(codigo) : ' ');
    }
    return partes.join('').replace(/\s+/g, ' ').trim().slice(0, 120);
  }
  function novoCanal() {
    return { notas: [], ativas: [], totalNotas: 0, minMidi: null, maxMidi: null,
      pitchBend: false, notaOrfa: false, ultimoTick: 0 };
  }
  function canalDaFaixa(faixa, canal) {
    if (!faixa.canais[canal]) faixa.canais[canal] = novoCanal();
    return faixa.canais[canal];
  }
  function registrarNotaAtiva(canal, midi, tick, velocity) {
    canal.totalNotas++;
    canal.minMidi = canal.minMidi === null ? midi : Math.min(canal.minMidi, midi);
    canal.maxMidi = canal.maxMidi === null ? midi : Math.max(canal.maxMidi, midi);
    canal.ultimoTick = Math.max(canal.ultimoTick, tick);
    canal.ativas.push({ midi: midi, tick: tick, velocity: velocity });
  }
  function encerrarNota(canal, midi, tick) {
    canal.ultimoTick = Math.max(canal.ultimoTick, tick);
    var indice = canal.ativas.findIndex(function (nota) { return nota.midi === midi; });
    if (indice < 0) { canal.notaOrfa = true; return; }
    var inicio = canal.ativas.splice(indice, 1)[0];
    canal.notas.push({ midi: midi, inicioTick: inicio.tick, fimTick: tick, velocity: inicio.velocity });
  }

  function lerFaixa(bytes, inicio, fim, indiceFaixa, tempos) {
    var estado = { cursor: inicio, fim: fim }, tick = 0, statusCorrente = null, fimDeclarado = false;
    var faixa = { indice: indiceFaixa, nome: '', canais: [], ultimoTick: 0 };
    while (estado.cursor < fim) {
      var delta = lerVLQ(bytes, estado.cursor, fim);
      estado.cursor = delta.cursor;
      tick += delta.value;
      if (!Number.isSafeInteger(tick)) falhar('posição temporal fora do limite seguro.');
      faixa.ultimoTick = Math.max(faixa.ultimoTick, tick);
      if (estado.cursor >= fim) falhar('evento sem status MIDI.');

      var primeiro = bytes[estado.cursor], status, dado1, dado2, tinhaStatus = primeiro >= 0x80;
      if (tinhaStatus) {
        status = primeiro;
        estado.cursor++;
      } else {
        if (statusCorrente === null) falhar('running status sem status de canal anterior.');
        status = statusCorrente;
      }

      if (status >= 0x80 && status <= 0xef) {
        statusCorrente = status;
        var tipo = status & 0xf0, numeroCanal = status & 0x0f;
        var canal = canalDaFaixa(faixa, numeroCanal);
        if (tinhaStatus) dado1 = lerDado(bytes, estado);
        else { dado1 = primeiro; estado.cursor++; }
        if (tipo !== 0xc0 && tipo !== 0xd0) dado2 = lerDado(bytes, estado);
        if (tipo === 0x90 && dado2 !== 0) registrarNotaAtiva(canal, dado1, tick, dado2);
        else if (tipo === 0x80 || (tipo === 0x90 && dado2 === 0)) encerrarNota(canal, dado1, tick);
        else if (tipo === 0xe0) canal.pitchBend = true;
        continue;
      }

      // System Exclusive e Meta Events não mantêm running status em SMF.
      statusCorrente = null;
      if (status === 0xf0 || status === 0xf7) {
        var tamanhoSysEx = lerVLQ(bytes, estado.cursor, fim);
        estado.cursor = tamanhoSysEx.cursor;
        if (tamanhoSysEx.value > fim - estado.cursor) falhar('evento SysEx truncado.');
        estado.cursor += tamanhoSysEx.value;
        continue;
      }
      if (status !== 0xff) falhar('evento de sistema não permitido em SMF.');
      if (estado.cursor >= fim) falhar('metaevento sem tipo.');
      var tipoMeta = bytes[estado.cursor++];
      var tamanhoMeta = lerVLQ(bytes, estado.cursor, fim);
      estado.cursor = tamanhoMeta.cursor;
      if (tamanhoMeta.value > fim - estado.cursor) falhar('metaevento truncado.');
      var dadosInicio = estado.cursor;
      estado.cursor += tamanhoMeta.value;
      if (tipoMeta === 0x51) {
        if (tamanhoMeta.value !== 3) falhar('Set Tempo deve ter três bytes.');
        var micros = bytes[dadosInicio] * 65536 + bytes[dadosInicio + 1] * 256 + bytes[dadosInicio + 2];
        if (micros === 0) falhar('Set Tempo não pode ser zero.');
        tempos.push({ tick: tick, micros: micros });
      } else if (tipoMeta === 0x03) {
        var nome = textoDaFaixa(bytes.subarray(dadosInicio, dadosInicio + tamanhoMeta.value));
        if (nome) faixa.nome = nome;
      } else if (tipoMeta === 0x2f) {
        if (tamanhoMeta.value !== 0) falhar('fim de faixa deve ter comprimento zero.');
        fimDeclarado = true;
        if (estado.cursor !== fim) falhar('dados após o fim da faixa.');
      }
    }
    if (!fimDeclarado) falhar('faixa sem metaevento de fim.');
    return faixa;
  }

  function construirMapa(tempos, ppqn) {
    tempos.sort(function (a, b) { return a.tick - b.tick || a.micros - b.micros; });
    var grupos = [], i = 0;
    while (i < tempos.length) {
      var tick = tempos[i].tick, micros = tempos[i].micros;
      i++;
      while (i < tempos.length && tempos[i].tick === tick) {
        if (tempos[i].micros !== micros) falhar('Set Tempo conflitante no tick ' + tick + '.');
        i++;
      }
      var bpm = 60000000 / micros;
      if (!Number.isFinite(bpm) || bpm < BPM_MINIMO - EPS || bpm > BPM_MAXIMO + EPS) {
        falhar('BPM fora do intervalo de 20 a 300.');
      }
      grupos.push({ tick: tick, bpm: bpm });
    }

    var mapa = [{ tick: 0, time: 0, beat: 0, bpm: 120 }];
    grupos.forEach(function (evento) {
      if (evento.tick === 0) { mapa[0].bpm = evento.bpm; return; }
      var anterior = mapa[mapa.length - 1];
      var time = anterior.time + (evento.tick - anterior.tick) * 60 / anterior.bpm / ppqn;
      mapa.push({ tick: evento.tick, time: time, beat: evento.tick / ppqn, bpm: evento.bpm });
    });
    if (mapa.length > LIMITE_TEMPOS) falhar('o mapa de andamento tem mais de 512 eventos.');
    return mapa;
  }
  function segundosNoTick(tick, mapa, ppqn) {
    var evento = mapa[0];
    for (var i = 1; i < mapa.length; i++) {
      if (mapa[i].tick > tick) break;
      evento = mapa[i];
    }
    return evento.time + (tick - evento.tick) * 60 / evento.bpm / ppqn;
  }
  function motivoDoCanal(canal, numeroCanal, mapa, ppqn, perfil) {
    if (perfil.layout === 'drums') {
      if (numeroCanal !== 9) return 'A bateria MIDI deve estar no canal 10.';
      if (canal.totalNotas === 0) return 'A linha não contém golpes MIDI para importar.';
      if (canal.pitchBend) return 'A linha usa pitch bend, que não é representado neste arranjo.';
      if (canal.notaOrfa) return 'A linha contém note-off sem note-on correspondente.';
      if (canal.ativas.length) return 'A linha contém golpe sem note-off.';
      var aceitos = Object.create(null);
      perfil.drums.forEach(function (drum) { aceitos[drum.midi] = true; });
      if (canal.notas.some(function (nota) { return !aceitos[nota.midi]; })) return 'A linha contém peças fora do mapeamento de bateria aceito.';
      if (canal.totalNotas > LIMITE_NOTAS) return 'A linha tem mais de 2.000 golpes.';
      var maxFim = 0, invalida = false;
      canal.notas.forEach(function (nota) {
        var duracaoDrum = segundosNoTick(nota.fimTick, mapa, ppqn) - segundosNoTick(nota.inicioTick, mapa, ppqn);
        maxFim = Math.max(maxFim, nota.fimTick);
        if (duracaoDrum < 0.02 - EPS || duracaoDrum > 60 + EPS) invalida = true;
      });
      if (invalida || segundosNoTick(maxFim, mapa, ppqn) > LIMITE_DURACAO + EPS) return 'A linha excede os limites de duração.';
      return null;
    }
    if (numeroCanal === 9) return 'Canal 10 é reservado para percussão.';
    if (canal.totalNotas === 0) return 'A linha não contém notas MIDI para importar.';
    if (canal.pitchBend) return 'A linha usa pitch bend, que não é representado neste arranjo.';
    if (canal.notaOrfa) return 'A linha contém note-off sem note-on correspondente.';
    if (canal.ativas.length) return 'A linha contém nota sem note-off.';
    if (canal.minMidi < perfil.minMidi || canal.maxMidi > perfil.maxMidi) {
      return 'A linha contém notas fora da extensão ' + descricaoExtensao(perfil) + '.';
    }
    if (canal.totalNotas > LIMITE_NOTAS) return 'A linha tem mais de 2.000 notas.';
    var notas = canal.notas.slice().sort(function (a, b) { return a.inicioTick - b.inicioTick || a.fimTick - b.fimTick; });
    var fimAnterior = -Infinity;
    for (var i = 0; i < notas.length; i++) {
      var nota = notas[i];
      if (nota.inicioTick < fimAnterior) return 'A linha contém notas sobrepostas.';
      fimAnterior = Math.max(fimAnterior, nota.fimTick);
      var duracao = segundosNoTick(nota.fimTick, mapa, ppqn) - segundosNoTick(nota.inicioTick, mapa, ppqn);
      if (duracao < 0.04 - EPS || duracao > 60 + EPS) {
        return 'A linha contém duração de nota fora do intervalo de 0,04 a 60 segundos.';
      }
    }
    var duracaoLinha = segundosNoTick(canal.ultimoTick, mapa, ppqn);
    if (duracaoLinha > LIMITE_DURACAO + EPS) return 'A linha excede a duração máxima de 900 segundos.';
    return null;
  }
  function resumoDoCanal(faixa, numeroCanal, mapa, ppqn, perfil) {
    var canal = faixa.canais[numeroCanal];
    var motivo = motivoDoCanal(canal, numeroCanal, mapa, ppqn, perfil);
    return { id: 't' + faixa.indice + '-c' + numeroCanal, track: faixa.indice, channel: numeroCanal,
      name: faixa.nome, noteCount: canal.totalNotas, minMidi: canal.minMidi, maxMidi: canal.maxMidi,
      duration: segundosNoTick(canal.ultimoTick, mapa, ppqn), valid: motivo === null, reason: motivo };
  }

  function analisar(entrada, opcoes) {
    var perfil = perfilDaAnalise(opcoes);
    var bytes = bytesDaEntrada(entrada);
    if (bytes.length < 14 || !assinatura(bytes, 0, 'MThd')) falhar('cabeçalho MThd ausente ou truncado.');
    var tamanhoCabecalho = inteiro32(bytes, 4);
    if (tamanhoCabecalho !== 6) falhar('cabeçalho MThd deve ter seis bytes.');
    if (8 + tamanhoCabecalho > bytes.length) falhar('cabeçalho MThd truncado.');
    var formato = inteiro16(bytes, 8), numeroFaixas = inteiro16(bytes, 10), divisao = inteiro16(bytes, 12);
    if (formato !== 0 && formato !== 1) falhar('aceitamos somente MIDI formato 0 ou 1.');
    if ((formato === 0 && numeroFaixas !== 1) || numeroFaixas === 0) falhar('quantidade de faixas incompatível com o formato MIDI.');
    if (divisao & 0x8000) falhar('divisão SMPTE não é aceita; use PPQN.');
    if (divisao === 0) falhar('PPQN deve ser maior que zero.');

    var posicao = 14, tempos = [], faixas = [], ultimoTick = 0;
    for (var i = 0; i < numeroFaixas; i++) {
      if (posicao + 8 > bytes.length || !assinatura(bytes, posicao, 'MTrk')) falhar('chunk MTrk ausente ou truncado.');
      var tamanhoFaixa = inteiro32(bytes, posicao + 4);
      posicao += 8;
      if (tamanhoFaixa > bytes.length - posicao) falhar('chunk MTrk truncado.');
      var fim = posicao + tamanhoFaixa;
      var faixa = lerFaixa(bytes, posicao, fim, i, tempos);
      faixas.push(faixa);
      ultimoTick = Math.max(ultimoTick, faixa.ultimoTick);
      posicao = fim;
    }
    if (posicao !== bytes.length) falhar('há dados ou chunks extras após as faixas declaradas.');

    var mapaInterno = construirMapa(tempos, divisao);
    var candidatos = [];
    faixas.forEach(function (faixa) {
      for (var canal = 0; canal < faixa.canais.length; canal++) {
        if (faixa.canais[canal]) candidatos.push(resumoDoCanal(faixa, canal, mapaInterno, divisao, perfil));
      }
    });
    var analise = { format: formato, ppqn: divisao, duration: segundosNoTick(ultimoTick, mapaInterno, divisao),
      tempoMap: copiarMapa(mapaInterno), candidates: candidatos };
    var privados = { perfil: perfil, ppqn: divisao, tempoMap: mapaInterno.map(function (evento) {
      return { tick: evento.tick, time: evento.time, beat: evento.beat, bpm: evento.bpm };
    }), candidates: Object.create(null) };
    faixas.forEach(function (faixa) {
      for (var canal = 0; canal < faixa.canais.length; canal++) {
        if (faixa.canais[canal]) privados.candidates['t' + faixa.indice + '-c' + canal] = faixa.canais[canal];
      }
    });
    analises.set(analise, privados);
    return analise;
  }

  function posicaoSugerida(midi, perfil) {
    var opcoes = [];
    for (var corda = perfil.strings; corda >= 1; corda--) {
      var fret = midi - perfil.tuning[perfil.strings - corda];
      if (fret >= 0 && fret <= perfil.frets) opcoes.push({ string: corda, fret: fret });
    }
    opcoes.sort(function (a, b) { return a.fret - b.fret || b.string - a.string; });
    if (!opcoes.length) throw new Error('Não há posição de ' + nomeDoInstrumento(perfil) + ' para MIDI ' + midi + '.');
    return opcoes[0];
  }
  function mapaRelevante(mapa, duracao) {
    var relevantes = mapa.filter(function (evento) { return evento.time < duracao - EPS; });
    // Uma nota válida dura ao menos 0,04 s, portanto o evento inicial sempre cabe.
    if (!relevantes.length) relevantes.push(mapa[0]);
    return relevantes.map(copiarTempo);
  }
  function criarChart(analise, candidateId, opcoes) {
    exigir(Core && typeof Core.validarChart === 'function', 'Carregue MusiqueTocarCore antes de criar um arranjo MIDI.');
    exigir(typeof candidateId === 'string', 'Informe a linha MIDI a importar.');
    exigir(objeto(opcoes) && Object.keys(opcoes).every(function (chave) { return chave === 'id' || chave === 'title' || chave === 'perfil'; }),
      'Informe somente id, title e perfil para criar o arranjo MIDI.');
    var privado = analises.get(analise);
    exigir(privado, 'A análise MIDI não pertence a este importador. Analise o arquivo novamente.');
    var candidatoPublico = analise.candidates.find(function (candidato) { return candidato.id === candidateId; });
    var canal = privado.candidates[candidateId];
    exigir(candidatoPublico && canal, 'A linha MIDI escolhida não existe nesta análise.');
    exigir(candidatoPublico.valid, candidatoPublico.reason || 'Esta linha MIDI não pode ser importada.');
    var perfil = perfilDaCriacao(opcoes, privado.perfil);

    var notas = canal.notas.slice().sort(function (a, b) { return a.inicioTick - b.inicioTick || a.midi - b.midi || a.fimTick - b.fimTick; }).map(function (nota, indice) {
      var inicio = segundosNoTick(nota.inicioTick, privado.tempoMap, privado.ppqn);
      var fim = segundosNoTick(nota.fimTick, privado.tempoMap, privado.ppqn);
      if (perfil.layout === 'drums') {
        var drum = perfil.drums.find(function (item) { return item.midi === nota.midi; });
        return { id: 'midi-' + (indice + 1), time: inicio, duration: fim - inicio, drum: drum.id, midi: nota.midi, velocity: nota.velocity };
      }
      var posicao = posicaoSugerida(nota.midi, perfil);
      return { id: 'midi-' + (indice + 1), time: inicio, duration: fim - inicio,
        string: posicao.string, fret: posicao.fret, midi: nota.midi };
    });
    var duracao = segundosNoTick(canal.ultimoTick, privado.tempoMap, privado.ppqn);
    var tempos = mapaRelevante(privado.tempoMap, duracao);
    var bruto = perfil.layout === 'drums'
      ? { id: opcoes.id, title: opcoes.title, bpm: tempos[0].bpm, duration: duracao,
          profile: 'bateria-midi', layout: 'drums', notes: notas, metadata: { demo: false } }
      : { id: opcoes.id, title: opcoes.title, bpm: tempos[0].bpm, duration: duracao,
          tuning: perfil.tuning.slice(), notes: notas, metadata: { demo: false } };
    if (tempos.length > 1) bruto.tempoMap = { version: 1, events: tempos };
    var chart = Core.validarChart(bruto);
    // Enquanto clientes antigos ainda ignoram tempoMap, não descartamos a
    // informação importada. O núcleo novo a normaliza antes da publicação.
    if (bruto.tempoMap && !possui(chart, 'tempoMap')) chart.tempoMap = { version: 1, events: copiarMapa(tempos) };
    return chart;
  }

  return { analisar: analisar, criarChart: criarChart, LIMITE_BYTES: LIMITE_BYTES };
});
