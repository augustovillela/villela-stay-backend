'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('./nucleo');
const Estudos = require('./estudos');
const Formato = require('./formato-catalogo');

function documento() {
  return { title: 'Estudo do catálogo', instrument: 'violao', level: 'iniciante', technique: 'notas-isoladas',
    objective: 'Tocar uma nota por vez.', credits: 'Exercício original de teste.', mediaId: '',
    chart: { id: 'estudo-catalogo', title: 'Estudo do catálogo', bpm: 90, duration: 5,
      tuning: [40, 45, 50, 55, 59, 64],
      notes: [{ id: 'n1', time: 1, duration: 0.5, string: 6, fret: 0, midi: 40 }],
      sections: [{ id: 'frase-1', title: 'Primeira frase', from: 0, to: 5 }] } };
}

function documentoBaixo() {
  return { title: 'Estudo de baixo', instrument: 'baixo', level: 'iniciante', technique: 'notas-isoladas',
    objective: 'Tocar uma nota grave por vez.', credits: 'Exercício original de teste.', mediaId: '',
    chart: { id: 'estudo-baixo', title: 'Estudo de baixo', bpm: 90, duration: 5,
      tuning: [28, 33, 38, 43],
      notes: [{ id: 'n1', time: 1, duration: 0.5, string: 4, fret: 0, midi: 28 }],
      sections: [{ id: 'frase-1', title: 'Primeira frase', from: 0, to: 5 }] } };
}

test('Contrato exporta enums fixos e normaliza somente o envelope e autoria demonstrativa', () => {
  assert.deepEqual(Object.keys(Formato).sort(), ['INSTRUMENTOS', 'LIMITE_BYTES', 'NIVEIS', 'TECNICAS', 'validarDocumento'].sort());
  assert.deepEqual(Formato.INSTRUMENTOS, ['violao', 'guitarra', 'baixo']);
  assert.deepEqual(Formato.NIVEIS, ['iniciante', 'intermediario', 'avancado']);
  assert.deepEqual(Formato.TECNICAS, ['notas-isoladas', 'cordas-soltas', 'troca-de-cordas', 'escalas', 'arpejos']);
  for (const valores of [Formato.INSTRUMENTOS, Formato.NIVEIS, Formato.TECNICAS]) assert.ok(Object.isFrozen(valores));
  assert.equal(Formato.LIMITE_BYTES, 1024 * 1024);
  const input = documento();
  input.title = '  Estudo do catálogo  '; input.objective = '  Uma nota.  '; input.credits = '  Autoria própria.  ';
  input.chart.metadata = { demo: true, author: 'Não pode atribuir autoria pelo campo demo' };
  delete input.mediaId;
  const esperado = Core.validarChart(input.chart); esperado.metadata = { demo: false };
  const validado = Formato.validarDocumento(input);
  assert.equal(validado.title, 'Estudo do catálogo'); assert.equal(validado.objective, 'Uma nota.');
  assert.equal(validado.credits, 'Autoria própria.'); assert.equal(validado.mediaId, '');
  assert.deepEqual(validado.chart, esperado);
  assert.equal(input.chart.metadata.demo, true, 'a entrada não é alterada');
});

test('Todos os estudos atuais passam sem alterar notas, tempos, seções ou identidade', () => {
  for (const estudo of Estudos.listar()) {
    const base = estudo.instrument === 'baixo' ? documentoBaixo() : documento();
    const input = { ...base, instrument: estudo.instrument || base.instrument, title: estudo.title, chart: estudo.chart };
    const antes = JSON.stringify(input);
    const esperado = Core.validarChart(estudo.chart); esperado.metadata = { demo: false };
    assert.deepEqual(Formato.validarDocumento(input).chart, esperado, estudo.id);
    assert.equal(JSON.stringify(input), antes);
  }
});

test('Instrumento, nível e técnica aceitam somente os valores explícitos', () => {
  for (const [campo, valores] of [['instrument', Formato.INSTRUMENTOS], ['level', Formato.NIVEIS], ['technique', Formato.TECNICAS]]) {
    for (const valor of valores) {
      const base = campo === 'instrument' && valor === 'baixo' ? documentoBaixo() : documento();
      assert.equal(Formato.validarDocumento({ ...base, [campo]: valor })[campo], valor);
    }
    for (const valor of ['', null, undefined, 1, {}, valores[0].toUpperCase(), valores[0] + ' ']) {
      assert.throws(() => Formato.validarDocumento({ ...documento(), [campo]: valor }), /inválido/);
    }
  }
});

test('Campos desconhecidos e identidade/publicação não entram no documento de revisão', () => {
  for (const campo of ['obraId', 'id', 'revision', 'published', 'usuario', 'audio', 'schemaVersion', '__proto__', 'constructor']) {
    const input = documento(); Object.defineProperty(input, campo, { value: 'extra', enumerable: true });
    assert.throws(() => Formato.validarDocumento(input), /campos não permitidos/, campo);
  }
  for (const input of [null, [], '', 1]) assert.throws(() => Formato.validarDocumento(input), /deve ser um objeto/);
});

test('Textos obrigatórios respeitam limites, recusa HTML e controles, título concorda com chart', () => {
  for (const [campo, limite] of [['title', 120], ['objective', 500], ['credits', 500]]) {
    for (const valor of ['', '  ', undefined, null, 1, '<script>x</script>', 'x\ny', '\u0000', '\u007f', 'x'.repeat(limite + 1)]) {
      assert.throws(() => Formato.validarDocumento({ ...documento(), [campo]: valor }), /texto simples/, campo);
    }
    const input = documento(); input[campo] = 'á'.repeat(limite);
    if (campo === 'title') input.chart.title = input.title;
    assert.equal(Formato.validarDocumento(input)[campo].length, limite);
  }
  assert.throws(() => Formato.validarDocumento({ ...documento(), title: 'Outro título' }), /igual ao título do arranjo/);
});

test('Referência de mídia é opcional e aceita somente IDs seguros, sem URLs ou caminhos', () => {
  for (const mediaId of ['', 'm-123', 'A_1', '_x', '-K0xfPq_4E1a', '_J0xfPq-4E1a', 'a'.repeat(64)]) assert.equal(Formato.validarDocumento({ ...documento(), mediaId }).mediaId, mediaId);
  for (const mediaId of [null, 1, ' ', 'a'.repeat(65), 'https://exemplo.test/a.mp3', '../arquivo', 'D:\\audio.mp3', 'a/b', 'a.b', '<audio>']) {
    assert.throws(() => Formato.validarDocumento({ ...documento(), mediaId }), /Identificador da mídia inválido/);
  }
});

test('Deslocamento manual de mídia é versionável, limitado e só existe com áudio associado', () => {
  const semMidia = Formato.validarDocumento(documento());
  assert.equal(Object.prototype.hasOwnProperty.call(semMidia, 'mediaOffsetMs'), false);
  const legado = Formato.validarDocumento({ ...documento(), mediaId: 'audio-a' });
  assert.equal(legado.mediaOffsetMs, 0);
  for (const mediaOffsetMs of [0, 1, 1250, 600000]) {
    assert.equal(Formato.validarDocumento({ ...documento(), mediaId: 'audio-a', mediaOffsetMs }).mediaOffsetMs, mediaOffsetMs);
  }
  for (const mediaOffsetMs of [-1, 600001, 1.5, NaN, Infinity, -Infinity, '1250', null, {}, []]) {
    assert.throws(() => Formato.validarDocumento({ ...documento(), mediaId: 'audio-a', mediaOffsetMs }), /deslocamento de mídia/, String(mediaOffsetMs));
  }
  for (const mediaOffsetMs of [0, 1, null]) {
    assert.throws(() => Formato.validarDocumento({ ...documento(), mediaOffsetMs }), /só pode existir quando houver um áudio/, String(mediaOffsetMs));
  }
});

test('Afinação padrão é obrigatória mesmo quando o núcleo aceitaria outra afinação coerente', () => {
  const input = documento(); input.chart.tuning[0] = 38; input.chart.notes[0].midi = 38;
  assert.doesNotThrow(() => Core.validarChart(input.chart));
  assert.throws(() => Formato.validarDocumento(input), /afinação padrão/);
  const padrao = documento(); delete padrao.chart.tuning;
  assert.deepEqual(Formato.validarDocumento(padrao).chart.tuning, [40, 45, 50, 55, 59, 64]);
});

test('Catálogo aceita somente a afinação padrão do contrabaixo de quatro cordas', () => {
  const baixo = documentoBaixo();
  const validado = Formato.validarDocumento(baixo);
  assert.equal(validado.instrument, 'baixo');
  assert.deepEqual(validado.chart.tuning, [28, 33, 38, 43]);
  const diferente = documentoBaixo(); diferente.chart.tuning[0] = 29; diferente.chart.notes[0].midi = 29;
  assert.doesNotThrow(() => Core.validarChart(diferente.chart));
  assert.throws(() => Formato.validarDocumento(diferente), /afinação padrão/);
  const seisCordas = documentoBaixo(); delete seisCordas.chart.tuning;
  seisCordas.chart.notes[0] = { id: 'n1', time: 1, duration: 0.5, string: 6, fret: 0, midi: 40 };
  assert.throws(() => Formato.validarDocumento(seisCordas), /afinação padrão/);
  const instrumentoTrocado = documentoBaixo(); instrumentoTrocado.instrument = 'guitarra';
  assert.throws(() => Formato.validarDocumento(instrumentoTrocado), /afinação padrão/);
});

test('Monofonia, coerência MIDI e limites musicais continuam sendo os do núcleo', () => {
  const sobreposto = documento(); sobreposto.chart.notes.push({ id: 'n2', time: 1.25, duration: 0.5, string: 5, fret: 0, midi: 45 });
  assert.throws(() => Formato.validarDocumento(sobreposto), /sobrepostas/);
  const errado = documento(); errado.chart.notes[0].midi = 52;
  assert.throws(() => Formato.validarDocumento(errado), /discordam/);
  const longo = documento(); longo.chart.duration = 900.1;
  assert.throws(() => Formato.validarDocumento(longo), /Duração/);
  const muitas = documento(); muitas.chart.notes = Array.from({ length: 2001 }, (_, i) => ({ ...muitas.chart.notes[0], id: 'n' + i }));
  assert.throws(() => Formato.validarDocumento(muitas), /2000/);
  const vazio = documento(); vazio.chart.notes = [];
  assert.throws(() => Formato.validarDocumento(vazio), /2000/);
});

test('Limite de 1 MiB conta o documento recebido inteiro e bytes UTF-8, antes de descartar extras do chart', () => {
  for (const caractere of ['x', 'é', '😀']) {
    const input = documento(); input.chart.metadata = { extra: '' };
    const base = Buffer.byteLength(JSON.stringify(input), 'utf8');
    const bytes = Buffer.byteLength(caractere, 'utf8');
    const quantidade = Math.floor((Formato.LIMITE_BYTES - base) / bytes);
    input.chart.metadata.extra = caractere.repeat(quantidade);
    assert.ok(Buffer.byteLength(JSON.stringify(input), 'utf8') <= Formato.LIMITE_BYTES);
    assert.doesNotThrow(() => Formato.validarDocumento(input));
    input.chart.metadata.extra += caractere;
    assert.ok(Buffer.byteLength(JSON.stringify(input), 'utf8') > Formato.LIMITE_BYTES);
    assert.throws(() => Formato.validarDocumento(input), /no máximo 1 MB/);
  }
  const circular = documento(); circular.chart.metadata = { circular };
  assert.throws(() => Formato.validarDocumento(circular), /JSON serializáveis/);
});

test('Cópias independentes impedem edição de uma revisão de alterar outras ou a entrada', () => {
  const input = documento(), antes = JSON.stringify(input);
  const primeiro = Formato.validarDocumento(input), segundo = Formato.validarDocumento(input);
  primeiro.chart.notes[0].time = 2; primeiro.chart.tuning[0] = 38; primeiro.chart.sections[0].title = 'Outra frase';
  primeiro.chart.metadata.demo = true;
  assert.equal(JSON.stringify(input), antes);
  assert.equal(segundo.chart.notes[0].time, 1); assert.equal(segundo.chart.tuning[0], 40);
  assert.equal(segundo.chart.sections[0].title, 'Primeira frase'); assert.equal(segundo.chart.metadata.demo, false);
});

test('Mesmo validador roda em UMD sem DOM, Buffer ou TextEncoder', () => {
  const source = fs.readFileSync(path.join(__dirname, 'formato-catalogo.js'), 'utf8');
  const contexto = { MusiqueTocarCore: Core, MusiqueTocarPerfis: require('./perfis') };
  vm.runInNewContext(source, contexto);
  const browser = contexto.MusiqueTocarFormatoCatalogo;
  assert.deepEqual(JSON.parse(JSON.stringify(browser.validarDocumento(documento()))), Formato.validarDocumento(documento()));
  const comMidia = documento(); comMidia.mediaId = 'audio-a'; comMidia.mediaOffsetMs = 1250;
  assert.equal(browser.validarDocumento(comMidia).mediaOffsetMs, 1250);
  assert.equal(browser.LIMITE_BYTES, Formato.LIMITE_BYTES);
  const grande = documento(); grande.chart.metadata = { extra: '😀'.repeat(Formato.LIMITE_BYTES / 4) };
  assert.throws(() => browser.validarDocumento(grande), /no máximo 1 MB/);
  const semNucleo = {}; vm.runInNewContext(source, semNucleo);
  assert.throws(() => semNucleo.MusiqueTocarFormatoCatalogo.validarDocumento(documento()), /núcleo de arranjos/);
  const semPerfis = { MusiqueTocarCore: Core }; vm.runInNewContext(source, semPerfis);
  assert.throws(() => semPerfis.MusiqueTocarFormatoCatalogo.validarDocumento(documento()), /perfis de instrumento/);
});
