// node --test music/tocar/test-importador-musicxml.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const Importador = require('./importador-musicxml');
const Core = require('./nucleo');
const Perfis = require('./perfis');

const encoder = new TextEncoder();
const bytes = texto => encoder.encode(texto);
const xml = partes => '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<score-partwise version="4.0"><work><work-title>Estudo &amp; teste</work-title></work>'
  + '<part-list><score-part id="P1"><part-name>Guitarra</part-name></score-part></part-list>'
  + '<part id="P1">' + partes + '</part></score-partwise>';
const nota = ({ step = 'E', octave = 2, duration = 4, voice = 1, staff = 1, extra = '' } = {}) =>
  '<note>' + extra + '<pitch><step>' + step + '</step><octave>' + octave + '</octave></pitch>'
  + '<duration>' + duration + '</duration><voice>' + voice + '</voice><staff>' + staff + '</staff></note>';
const medida = (conteudo, numero = 1) => '<measure number="' + numero + '">' + conteudo + '</measure>';
const atributos = extra => '<attributes><divisions>4</divisions>' + (extra || '') + '</attributes>';

function u16(n) { return Uint8Array.from([n & 255, (n >>> 8) & 255]); }
function u32(n) { return Uint8Array.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
function ler16LE(dados, posicao) { return dados[posicao] + dados[posicao + 1] * 256; }
function ler32LE(dados, posicao) { return dados[posicao] + dados[posicao + 1] * 256 + dados[posicao + 2] * 0x10000 + dados[posicao + 3] * 0x1000000; }
function escrever32LE(dados, posicao, valor) {
  dados[posicao] = valor & 255; dados[posicao + 1] = (valor >>> 8) & 255;
  dados[posicao + 2] = (valor >>> 16) & 255; dados[posicao + 3] = (valor >>> 24) & 255;
}
function juntar(partes) {
  const tamanho = partes.reduce((total, parte) => total + parte.length, 0), resultado = new Uint8Array(tamanho);
  let cursor = 0; partes.forEach(parte => { resultado.set(parte, cursor); cursor += parte.length; }); return resultado;
}
function crc32(dados) {
  let crc = -1;
  for (const byte of dados) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function zip(entries, compactar = false) {
  let offset = 0;
  const locais = [], centrais = [];
  for (const entry of entries) {
    const nome = bytes(entry.name), original = typeof entry.data === 'string' ? bytes(entry.data) : entry.data;
    const dados = compactar && entry.compress !== false ? new Uint8Array(zlib.deflateRawSync(original)) : original;
    const method = dados === original ? 0 : 8, crc = crc32(original), descriptor = !!entry.descriptor;
    const flags = (entry.flags || 0) | (descriptor ? 0x0008 : 0);
    const rodape = descriptor ? juntar([
      ...(entry.descriptorSignature === false ? [] : [u32(0x08074b50)]), u32(crc), u32(dados.length), u32(original.length),
    ]) : new Uint8Array();
    const local = juntar([u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(descriptor ? 0 : crc), u32(descriptor ? 0 : dados.length), u32(descriptor ? 0 : original.length), u16(nome.length), u16(0), nome, dados, rodape]);
    locais.push(local);
    centrais.push(juntar([u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(dados.length), u32(original.length), u16(nome.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nome]));
    offset += local.length;
  }
  const diretorio = juntar(centrais);
  return juntar([...locais, diretorio, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(diretorio.length), u32(offset), u16(0)]);
}
function mxl(score, compactar, descriptor, descriptorSignature) {
  const container = '<?xml version="1.0" encoding="UTF-8"?><container version="1.0">'
    + '<rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>';
  return zip([{ name: 'META-INF/container.xml', data: container, descriptor, descriptorSignature }, { name: 'score.musicxml', data: score, descriptor, descriptorSignature }], compactar);
}
function entradaCentral(arquivo, nomeProcurado) {
  for (let posicao = 0; posicao + 46 <= arquivo.length; posicao++) {
    if (ler32LE(arquivo, posicao) !== 0x02014b50) continue;
    const nome = new TextDecoder().decode(arquivo.subarray(posicao + 46, posicao + 46 + ler16LE(arquivo, posicao + 28)));
    if (nome === nomeProcurado) return { central: posicao, local: ler32LE(arquivo, posicao + 42) };
  }
  return null;
}

test('importa score-partwise simples localmente e sugere posição na guitarra', async () => {
  const analysis = await Importador.analisar(bytes(xml(medida(atributos() + '<direction><sound tempo="120"/></direction>' + nota()))));
  assert.equal(analysis.format, 'musicxml');
  assert.equal(analysis.version, '4.0');
  assert.equal(analysis.title, 'Estudo & teste');
  assert.deepEqual(analysis.tempoMap, [{ time: 0, beat: 0, bpm: 120 }]);
  assert.deepEqual(analysis.candidates, [{
    id: 'p1-s1-v1', part: 1, partId: 'P1', staff: 1, voice: '1', name: 'Guitarra',
    noteCount: 1, minMidi: 40, maxMidi: 40, duration: 0.5, valid: true, reason: null,
  }]);
  const chart = Importador.criarChart(analysis, 'p1-s1-v1', { id: 'xml-basico', title: 'XML básico' });
  assert.equal(chart.duration, 0.5);
  assert.deepEqual(chart.notes, [{ id: 'musicxml-1', time: 0, duration: 0.5, string: 6, fret: 0, midi: 40 }]);
  assert.equal('tempoMap' in chart, false);
});

test('mantém pausas, backup, forward e candidatos separados por pauta e voz', async () => {
  const partitura = medida(atributos()
    + '<note><rest/><duration>4</duration><voice>1</voice><staff>1</staff></note>'
    + nota({ step: 'E', octave: 2, voice: 1 })
    + '<backup><duration>8</duration></backup>'
    + nota({ step: 'A', octave: 2, voice: 2 })
    + '<forward><duration>4</duration></forward>');
  const analysis = await Importador.analisar(bytes(xml(partitura)));
  assert.equal(analysis.candidates.length, 2);
  const primeira = analysis.candidates.find(c => c.id === 'p1-s1-v1');
  const segunda = analysis.candidates.find(c => c.id === 'p1-s1-v2');
  assert.equal(primeira.valid, true);
  assert.equal(segunda.valid, true);
  assert.equal(Importador.criarChart(analysis, primeira.id, { id: 'pausa', title: 'Pausa' }).notes[0].time, 0.5);
  assert.equal(Importador.criarChart(analysis, segunda.id, { id: 'voz', title: 'Voz' }).notes[0].midi, 45);
});

test('preserva transposição, TAB consistente, ties lineares e mudança de andamento', async () => {
  const tab = '<notations><technical><string>6</string><fret>0</fret></technical></notations>';
  const primeira = medida(atributos('<transpose><chromatic>-12</chromatic></transpose>')
    + '<direction><sound tempo="120"/></direction>'
    + nota({ step: 'E', octave: 3, extra: '<tie type="start"/>' + tab }), 1);
  const segunda = medida('<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type></direction>'
    + nota({ step: 'E', octave: 3, extra: '<tie type="stop"/>' }), 2);
  const analysis = await Importador.analisar(bytes(xml(primeira + segunda)));
  const candidate = analysis.candidates[0];
  assert.equal(candidate.valid, true);
  assert.equal(candidate.noteCount, 1);
  assert.deepEqual(analysis.tempoMap, [{ time: 0, beat: 0, bpm: 120 }, { time: 0.5, beat: 1, bpm: 60 }]);
  const chart = Importador.criarChart(analysis, candidate.id, { id: 'tie', title: 'Tie' });
  assert.equal(chart.notes.length, 1);
  assert.deepEqual(chart.notes[0], { id: 'musicxml-1', time: 0, duration: 1.5, string: 6, fret: 0, midi: 40 });
  assert.deepEqual(chart.tempoMap, { version: 1, events: [{ time: 0, beat: 0, bpm: 120 }, { time: 0.5, beat: 1, bpm: 60 }] });
});

test('marca acordes e tipos musicais sem suporte sem achatar a linha', async () => {
  const acorde = medida(atributos()
    + nota({ step: 'E', octave: 2 })
    + nota({ step: 'G', octave: 2, extra: '<chord/>' }));
  const analysis = await Importador.analisar(bytes(xml(acorde)));
  assert.equal(analysis.candidates.length, 1);
  assert.equal(analysis.candidates[0].valid, false);
  assert.match(analysis.candidates[0].reason, /sobrepostas|acordes/);
  assert.throws(() => Importador.criarChart(analysis, analysis.candidates[0].id, { id: 'nao', title: 'Não' }), /sobrepostas|acordes/);
});

test('TAB inconsistente recorre à posição sugerida na afinação padrão', async () => {
  const tabInvalida = '<notations><technical><string>5</string><fret>0</fret></technical></notations>';
  const analysis = await Importador.analisar(bytes(xml(medida(atributos() + nota({ step: 'E', octave: 2, extra: tabInvalida })))));
  const candidate = analysis.candidates[0];
  assert.equal(candidate.valid, true);
  const chart = Importador.criarChart(analysis, candidate.id, { id: 'fallback-tab', title: 'Fallback TAB' });
  assert.deepEqual(chart.notes[0], { id: 'musicxml-1', time: 0, duration: 0.5, string: 6, fret: 0, midi: 40 });
});

test('perfil baixo aceita Mi1 em MusicXML e MXL e preserva TAB de quatro cordas', async () => {
  const tabBaixo = '<notations><technical><string>4</string><fret>5</fret></technical></notations>';
  const partitura = medida(atributos()
    + nota({ step: 'E', octave: 1 })
    + nota({ step: 'A', octave: 1, extra: tabBaixo })
    + nota({ step: 'G', octave: 2 })
    + nota({ step: 'G', octave: 4 }));
  const origem = bytes(xml(partitura));
  const seisCordas = await Importador.analisar(origem);
  assert.equal(seisCordas.candidates[0].valid, false);
  assert.match(seisCordas.candidates[0].reason, /Mi2–Mi6/);

  const baixo = await Importador.analisar(origem, { perfil: 'baixo' });
  assert.equal(baixo.candidates[0].valid, true);
  const chart = Importador.criarChart(baixo, baixo.candidates[0].id, { id: 'baixo-xml', title: 'Baixo XML', perfil: 'baixo' });
  assert.deepEqual(chart.tuning, [28, 33, 38, 43]);
  assert.deepEqual(chart.notes.map(notaImportada => [notaImportada.midi, notaImportada.string, notaImportada.fret]), [
    [28, 4, 0], [33, 4, 5], [43, 1, 0], [67, 1, 24],
  ]);
  assert.deepEqual(Core.validarChart(chart), chart);
  assert.throws(() => Importador.criarChart(baixo, baixo.candidates[0].id, { id: 'perfil-trocado', title: 'Perfil trocado', perfil: 'guitarra' }), /mesmo perfil/);

  const analiseMxl = await Importador.analisar(mxl(xml(partitura), true), { perfil: 'baixo' });
  assert.equal(analiseMxl.format, 'mxl');
  assert.equal(analiseMxl.candidates[0].valid, true);
  await assert.rejects(() => Importador.analisar(origem, { perfil: 'piano' }), /Perfil de instrumento desconhecido/);
});

test('repetições permanecem uma vez na ordem escrita, sem expansão automática', async () => {
  const primeira = medida(atributos() + nota({ step: 'E', octave: 2 }) + '<barline location="right"><repeat direction="backward"/></barline>', 1);
  const segunda = medida(nota({ step: 'A', octave: 2 }), 2);
  const analysis = await Importador.analisar(bytes(xml(primeira + segunda)));
  const chart = Importador.criarChart(analysis, analysis.candidates[0].id, { id: 'escrita', title: 'Ordem escrita' });
  assert.deepEqual(chart.notes.map(notaImportada => [notaImportada.time, notaImportada.midi]), [[0, 40], [0.5, 45]]);
});

test('atributos de transposição seguem o tempo musical mesmo após backup entre vozes', async () => {
  const partitura = medida(atributos()
    + nota({ step: 'E', octave: 3, voice: 1 })
    + '<backup><duration>4</duration></backup>'
    + '<attributes><transpose><chromatic>-12</chromatic></transpose></attributes>'
    + nota({ step: 'E', octave: 3, voice: 2 }));
  const analysis = await Importador.analisar(bytes(xml(partitura)));
  const primeira = analysis.candidates.find(candidate => candidate.id === 'p1-s1-v1');
  const segunda = analysis.candidates.find(candidate => candidate.id === 'p1-s1-v2');
  assert.equal(primeira.valid, true);
  assert.equal(segunda.valid, true);
  assert.equal(Importador.criarChart(analysis, primeira.id, { id: 'voz-1', title: 'Voz 1' }).notes[0].midi, 40);
  assert.equal(Importador.criarChart(analysis, segunda.id, { id: 'voz-2', title: 'Voz 2' }).notes[0].midi, 40);
});

test('recusa mudança de divisions dentro do compasso depois de backup', async () => {
  const partitura = medida(atributos()
    + nota({ step: 'E', octave: 2, voice: 1 })
    + '<backup><duration>4</duration></backup>'
    + '<attributes><divisions>8</divisions></attributes>'
    + nota({ step: 'A', octave: 2, voice: 2 }));
  await assert.rejects(() => Importador.analisar(bytes(xml(partitura))), /mudança de divisions dentro de um compasso/);
});

test('aceita identificador textual seguro para voice', async () => {
  const conteudo = medida(atributos() + nota({ voice: 'lead' }));
  const analysis = await Importador.analisar(bytes(xml(conteudo)));
  assert.equal(analysis.candidates[0].id, 'p1-s1-vlead');
  assert.equal(analysis.candidates[0].voice, 'lead');
  assert.equal(Importador.criarChart(analysis, 'p1-s1-vlead', { id: 'lead', title: 'Lead' }).notes[0].midi, 40);
});

test('rejeita XML estruturalmente inseguro e não confia em análise pública adulterada', async () => {
  await assert.rejects(() => Importador.analisar(bytes('<!DOCTYPE score-partwise [<!ENTITY x "boom">]><score-partwise version="4.0"/>')), /DOCTYPE|entidade/);
  await assert.rejects(() => Importador.analisar(bytes('<score-timewise version="4.0"/>')), /score-partwise/);
  await assert.rejects(() => Importador.analisar(bytes('<?xml version="1.0"?><score-partwise version="4.0"><?hack?></score-partwise>')), /instrução XML/);
  const analysis = await Importador.analisar(bytes(xml(medida(atributos() + '<note><unpitched/><duration>4</duration><voice>1</voice><staff>1</staff></note>'))));
  assert.equal(analysis.candidates[0].valid, false);
  analysis.candidates[0].valid = true; analysis.candidates[0].reason = null;
  assert.throws(() => Importador.criarChart(analysis, analysis.candidates[0].id, { id: 'x', title: 'X' }), /não afinada|percussão/);
});

test('aceita MXL armazenado e DEFLATE usando o container.xml, sem precisar de mimetype', async () => {
  const score = xml(medida(atributos() + nota()));
  for (const compactar of [false, true]) {
    const analysis = await Importador.analisar(mxl(score, compactar));
    assert.equal(analysis.format, 'mxl');
    assert.equal(analysis.candidates[0].valid, true);
    assert.equal(Importador.criarChart(analysis, analysis.candidates[0].id, { id: compactar ? 'deflate' : 'stored', title: 'MXL' }).notes[0].midi, 40);
  }
});

test('aceita MXL streaming com descritor ZIP assinado ou sem assinatura', async () => {
  const score = xml(medida(atributos() + nota()));
  for (const compactar of [false, true]) {
    for (const assinatura of [false, true]) {
      const analysis = await Importador.analisar(mxl(score, compactar, true, assinatura));
      assert.equal(analysis.format, 'mxl');
      assert.equal(analysis.candidates[0].valid, true);
    }
  }
});

test('recusa MXL com CRC, caminho ou diretório inseguros', async () => {
  const score = xml(medida(atributos() + nota()));
  const crcInvalido = mxl(score, false);
  crcInvalido[14] ^= 1; // CRC do primeiro cabeçalho local.
  await assert.rejects(() => Importador.analisar(crcInvalido), /CRC|cabeçalho/);
  const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="../score.musicxml"/></rootfiles></container>';
  await assert.rejects(() => Importador.analisar(zip([{ name: 'META-INF/container.xml', data: container }, { name: '../score.musicxml', data: score }])), /caminho|pacote/);
});

test('recusa descritor ZIP divergente e campos locais não zerados', async () => {
  const score = xml(medida(atributos() + nota()));
  const divergente = mxl(score, true, true, true);
  const entrada = entradaCentral(divergente, 'score.musicxml');
  assert.ok(entrada);
  const inicioDados = entrada.local + 30 + ler16LE(divergente, entrada.local + 26) + ler16LE(divergente, entrada.local + 28);
  divergente[inicioDados + ler32LE(divergente, entrada.central + 20) + 4] ^= 1;
  await assert.rejects(() => Importador.analisar(divergente), /descritor ZIP/);

  const camposLocais = mxl(score, false, true, true);
  const outra = entradaCentral(camposLocais, 'score.musicxml');
  assert.ok(outra);
  camposLocais[outra.local + 14] = 1;
  await assert.rejects(() => Importador.analisar(camposLocais), /descritor precisa usar tamanhos zerados/);
});

test('interrompe DEFLATE quando os tamanhos ZIP declaram menos do que o fluxo produz', async () => {
  const score = xml(medida(atributos() + nota())) + ' '.repeat(128 * 1024);
  const arquivo = mxl(score, true);
  const entrada = entradaCentral(arquivo, 'score.musicxml');
  assert.ok(entrada);
  escrever32LE(arquivo, entrada.central + 24, 1);
  escrever32LE(arquivo, entrada.local + 22, 1);
  await assert.rejects(() => Importador.analisar(arquivo), /expandiu além do tamanho declarado/);
});

test('o UMD analisa MusicXML no navegador sem CommonJS', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'importador-musicxml.js'), 'utf8');
  const sandbox = {
    window: { MusiqueTocarCore: Core, MusiqueTocarPerfis: Perfis, TextDecoder },
    Uint8Array, ArrayBuffer, WeakMap, Number, Object, Math, Error,
  };
  vm.runInNewContext(source, sandbox);
  const web = sandbox.window.MusiqueTocarImportadorMusicXML;
  assert.equal(typeof web.analisar, 'function');
  const analysis = await web.analisar(bytes(xml(medida(atributos() + nota()))));
  assert.equal(analysis.format, 'musicxml');
  assert.equal(analysis.candidates[0].id, 'p1-s1-v1');
  const analysisMxl = await web.analisar(mxl(xml(medida(atributos() + nota())), false));
  assert.equal(analysisMxl.format, 'mxl');
  assert.equal(analysisMxl.candidates[0].id, 'p1-s1-v1');
});
