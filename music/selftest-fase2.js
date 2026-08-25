// =====================================================================
// Musique — testes da FASE 2 (biblioteca, repertório e palco).
// Rodam dentro do `selftest.js`, reusando o servidor e o harness dele.
//
// O QUE ESTES TESTES PROTEGEM:
//
//   · IDA E VOLTA SEM PERDA nos três formatos simbólicos. É a promessa
//     central da biblioteca: o arquivo que o músico guardou tem de sair
//     igual ao que entrou, e transpor e voltar não pode mudar nada.
//   · A GRAFIA do acorde segue o tom de destino (Mib, não Ré#).
//   · O CANAL 10 DO MIDI não é transposto — transpor bateria troca o
//     instrumento, e o usuário só descobre ao ouvir.
//   · Digitação de violão é TOCÁVEL: sem pestana com corda solta por
//     baixo, sem mais de quatro dedos, sem corda muda no meio.
//   · O que o produto NÃO SABE, ele diz: PDF não transpõe, e cifra não
//     permite conferir o tom pela extensão vocal.
// =====================================================================
'use strict';

const T = require('./teoria');
const chordpro = require('./chordpro');
const musicxml = require('./musicxml');
const midiLib = require('./midi');
const violao = require('./violao');
const biblioteca = require('./biblioteca');
const repertorio = require('./repertorio');
const repo = require('./repo');
const { db } = require('./db');

const CIFRA = [
  '{title: Cancao de estrada}',
  '{key: C}',
  '{artist: Fulano de Tal}',
  '',
  '{start_of_verse}',
  'Vou pela [C]estrada sem [Am]pressa nenhuma',
  'o [F]sol na janela, o [G]tempo passou',
  '{end_of_verse}',
  '',
  '{comment: solo}',
  '[C/G]  [F]  [G7]  [C]',
].join('\n');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Estudo</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
      </attributes>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <lyric number="1"><text>Vou</text></lyric>
      </note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration>
        <notations><articulations><staccato/></articulations></notations></note>
    </measure>
  </part>
</score-partwise>`;

/** Monta um SMF de verdade: melodia no canal 1 e bateria no canal 10. */
function midiExemplo() {
  const varint = (n) => { const b = []; do { b.unshift(n & 0x7f); n >>= 7; } while (n); for (let i = 0; i < b.length - 1; i++) b[i] |= 0x80; return Buffer.from(b); };
  const faixa = (evs) => {
    const corpo = Buffer.concat(evs.flatMap((e) => [varint(e.dt), Buffer.from(e.bytes)]));
    const cab = Buffer.alloc(8); cab.write('MTrk', 0, 'ascii'); cab.writeUInt32BE(corpo.length, 4);
    return Buffer.concat([cab, corpo]);
  };
  const hdr = Buffer.alloc(14);
  hdr.write('MThd', 0, 'ascii'); hdr.writeUInt32BE(6, 4);
  hdr.writeUInt16BE(1, 8); hdr.writeUInt16BE(2, 10); hdr.writeUInt16BE(480, 12);
  const t1 = faixa([
    { dt: 0, bytes: [0xff, 0x03, 0x07, ...Buffer.from('Melodia')] },
    { dt: 0, bytes: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] },
    { dt: 0, bytes: [0x90, 60, 100] },
    { dt: 480, bytes: [64, 100] },              // running status
    { dt: 0, bytes: [0x80, 60, 0] },
    { dt: 480, bytes: [0x90, 64, 0] },          // note-on vel 0 = note-off
    { dt: 0, bytes: [0xff, 0x2f, 0x00] },
  ]);
  const t2 = faixa([
    { dt: 0, bytes: [0xff, 0x03, 0x07, ...Buffer.from('Bateria')] },
    { dt: 0, bytes: [0x99, 36, 120] }, { dt: 240, bytes: [0x89, 36, 0] },
    { dt: 0, bytes: [0x99, 38, 110] }, { dt: 240, bytes: [0x89, 38, 0] },
    { dt: 0, bytes: [0xff, 0x2f, 0x00] },
  ]);
  return Buffer.concat([hdr, t1, t2]);
}

async function rodar({ t, secao, req, assert }) {
  // ===================================================================
  secao('Fase 2 · cifra (ChordPro)');

  const doc = chordpro.analisar(CIFRA);

  await t('ida e volta é IDÊNTICA, inclusive nas diretivas que não entende', async () => {
    assert.equal(chordpro.serializar(doc), CIFRA);
    const comEstranha = CIFRA + '\n{capo: 3}\n{x_editor_qualquer: valor}';
    assert.equal(chordpro.serializar(chordpro.analisar(comEstranha)), comEstranha,
      'descartar o que não se entende é como se perde o trabalho de quem colou uma cifra de outro lugar');
  });

  await t('transpor mantém a letra ONDE ESTAVA', async () => {
    const t2 = chordpro.transpor(doc, 2);
    assert.equal(chordpro.somenteLetra(t2), chordpro.somenteLetra(doc),
      'a letra não pode mudar de lugar quando o tom muda — é o defeito nº 1 de cifra em .txt');
  });

  await t('a GRAFIA segue o tom de destino: mi bemol, não ré sustenido', async () => {
    const texto = chordpro.serializar(chordpro.transpor(doc, 3));
    assert.ok(texto.includes('[Eb]'), texto);
    assert.ok(!texto.includes('[D#]'), 'ninguém toca em "ré sustenido maior"');
    assert.ok(texto.includes('{key: Eb}'), 'a diretiva de tom acompanha');
    // e para cima, onde a grafia certa é sustenido
    const sus = chordpro.serializar(chordpro.transpor(doc, 2));
    assert.ok(sus.includes('[D]') && sus.includes('[Bm]'), sus);
  });

  await t('transpor e voltar devolve o mesmo documento', async () => {
    const ida = chordpro.transpor(doc, 5);
    const volta = chordpro.transpor(ida, -5);
    assert.equal(chordpro.serializar(volta), CIFRA);
  });

  await t('acorde com baixo (C/G) transpõe as DUAS partes', async () => {
    const t2 = chordpro.serializar(chordpro.transpor(doc, 2));
    assert.ok(t2.includes('[D/A]'), t2);
  });

  await t('colchete que não é acorde passa intacto', async () => {
    const d = chordpro.analisar('la[intro]la [C]la');
    assert.equal(chordpro.serializar(chordpro.transpor(d, 4)), 'la[intro]la [E]la',
      'inventar acorde onde não há estragaria a letra sem o usuário saber');
  });

  await t('CAPOTRASTE mostra a forma e diz o tom que soa', async () => {
    const cap = chordpro.comCapotraste(doc, 2);
    assert.equal(cap.tom_soando, 'C');
    assert.equal(cap.tom_das_formas, 'Bb', 'com capo na 2ª casa, a forma de si bemol soa dó');
    assert.ok(chordpro.serializar(cap.documento).includes('[Bb]'));
  });

  await t('instrumento transpositor: sax alto lê em lá para soar em dó', async () => {
    const sax = chordpro.paraInstrumento(doc, 'mib');
    assert.equal(sax.tom_soando, 'C');
    assert.equal(sax.tom_escrito, 'A');
    const trompete = chordpro.paraInstrumento(doc, 'sib');
    assert.equal(trompete.tom_escrito, 'D');
  });

  await t('lista os acordes usados, sem repetir', async () => {
    assert.deepEqual(chordpro.acordesUsados(doc).map((a) => a.cifra), ['C', 'Am', 'F', 'G', 'C/G', 'G7']);
  });

  await t('a letra sai limpa, sem os espaços entre acordes', async () => {
    const letra = chordpro.somenteLetra(doc);
    assert.ok(letra.includes('Vou pela estrada'));
    assert.ok(!/^\s+$/m.test(letra), 'linha só de acordes não pode virar linha de espaços');
  });

  // ===================================================================
  secao('Fase 2 · MusicXML');

  await t('ida e volta é BYTE A BYTE, e nada fora de <pitch> é tocado', async () => {
    const volta = musicxml.transpor(musicxml.transpor(XML, 5), -5);
    assert.equal(volta, XML, 'remontar o XML perderia articulação, letra e layout');
    const up = musicxml.transpor(XML, 3);
    for (const marca of ['<lyric number="1">', '<staccato/>', '<part-name>Piano</part-name>', '<work-title>Estudo</work-title>']) {
      assert.ok(up.includes(marca), 'perdeu ' + marca);
    }
  });

  await t('preserva o FORMATO do arquivo (uma linha continua uma linha)', async () => {
    const up = musicxml.transpor(XML, 2);
    assert.ok(/<pitch><step>[A-G]<\/step><octave>\d<\/octave><\/pitch>/.test(up),
      'o <pitch> que estava numa linha só tem de voltar numa linha só');
    assert.ok(/<pitch>\n\s+<step>/.test(up), 'e o que estava quebrado continua quebrado');
  });

  await t('a armadura acompanha a transposição', async () => {
    assert.equal(musicxml.armadura(XML).tom, 'C');
    assert.equal(musicxml.armadura(musicxml.transpor(XML, 3)).tom, 'Eb');
    assert.equal(musicxml.armadura(musicxml.transpor(XML, 2)).tom, 'D');
  });

  await t('as notas transpõem certo', async () => {
    const antes = musicxml.notas(XML).eventos.map((e) => e.midi);
    const depois = musicxml.notas(musicxml.transpor(XML, 3)).eventos.map((e) => e.midi);
    assert.deepEqual(depois, antes.map((m) => m + 3));
  });

  await t('diz o que ignorou em vez de fingir que leu tudo', async () => {
    const n = musicxml.notas(XML);
    assert.ok(Array.isArray(n.ignorado));
    assert.ok(n.divisions === 4);
  });

  await t('arquivo que não é MusicXML é recusado com instrução', async () => {
    assert.throws(() => musicxml.transpor('não sou xml', 2), /MusicXML/);
  });

  // ===================================================================
  secao('Fase 2 · MIDI');

  const mid = midiExemplo();

  await t('lê cabeçalho, andamento, nome de faixa e canais', async () => {
    const r = midiLib.resumo(mid);
    assert.equal(r.formato, 1);
    assert.equal(r.bpm, 120);
    assert.equal(r.ticks_por_semininima, 480);
    assert.deepEqual(r.nomes_de_faixa, ['Melodia', 'Bateria']);
    assert.ok(r.tem_percussao);
  });

  await t('entende STATUS CONTINUADO e note-on com velocidade zero', async () => {
    const notas = midiLib.notas(mid).filter((n) => !n.percussao);
    assert.equal(notas.length, 2, 'running status e note-on vel 0 fazem parser ingênuo se perder');
    assert.deepEqual(notas.map((n) => n.midi), [60, 64]);
    assert.ok(notas.every((n) => n.duracao_ticks === 480));
  });

  await t('O CANAL 10 NÃO É TRANSPOSTO — lá o número é o instrumento', async () => {
    const up = midiLib.transpor(mid, 3);
    const notas = midiLib.notas(up);
    const perc = notas.filter((n) => n.percussao).map((n) => n.midi);
    const mel = notas.filter((n) => !n.percussao).map((n) => n.midi);
    assert.deepEqual(perc, [36, 38], 'transpor bateria troca bumbo por caixa e destrói o arranjo');
    assert.deepEqual(mel, [63, 67]);
  });

  await t('quem quiser transpor a percussão precisa PEDIR', async () => {
    const up = midiLib.transpor(mid, 2, { transporPercussao: true });
    assert.deepEqual(midiLib.notas(up).filter((n) => n.percussao).map((n) => n.midi), [38, 40]);
  });

  await t('ida e volta é BYTE A BYTE', async () => {
    assert.ok(midiLib.transpor(midiLib.transpor(mid, 7), -7).equals(mid));
  });

  await t('nota que sairia da faixa 0–127 faz RECUSAR, não grudar no limite', async () => {
    let erro = null;
    try { midiLib.transpor(mid, 80); } catch (e) { erro = e; }
    assert.ok(erro, 'grudar no limite mudaria a música em silêncio');
    assert.equal(erro.notasForaDaFaixa, 4);
    assert.ok(erro.podeForcar);
    // e quem insiste consegue, sabendo o que está fazendo
    assert.ok(midiLib.transpor(mid, 80, { permitirLimite: true }));
  });

  // ===================================================================
  secao('Fase 2 · digitações de violão');

  await t('gera as formas canônicas dos acordes que todo mundo toca', async () => {
    const CANONICO = { C: 'x32010', G: '320003', D: 'xx0232', Am: 'x02210', Em: '022000',
      Dm: 'xx0231', A: 'x02220', E: '022100', G7: '320001', A7: 'x02020', E7: '020100',
      Dm7: 'xx0211', Am7: 'x02010', F: '133211', Bm: 'x24432' };
    for (const [cifra, esperado] of Object.entries(CANONICO)) {
      const r = violao.formas(cifra, { quantas: 4 });
      assert.ok(r.formas.some((f) => f.desenho === esperado),
        `${cifra}: esperava ${esperado} entre as formas, veio ${r.formas.map((f) => f.desenho).join(' ')}`);
    }
  });

  await t('nenhuma forma tem PESTANA com corda solta por baixo dela', async () => {
    // Foi o defeito da primeira versão: desenhava "pestana na 2ª casa com
    // a 5ª corda solta", que a mão simplesmente não faz.
    for (const cifra of ['C', 'F', 'Bm', 'F#m', 'Bb', 'Gm', 'C#m7', 'Ab', 'Eb7']) {
      for (const f of violao.formas(cifra, { quantas: 4 }).formas) {
        if (!f.pestana) continue;
        const idx = f.casas.map((c, i) => (c === f.pestana ? i : -1)).filter((i) => i >= 0);
        for (let i = idx[0]; i <= idx[idx.length - 1]; i++) {
          assert.ok(f.casas[i] >= f.pestana,
            `${cifra} ${f.desenho}: pestana na casa ${f.pestana} com a corda ${i + 1} em ${f.casas[i]}`);
        }
      }
    }
  });

  await t('nenhuma forma pede mais de quatro dedos nem corda muda no meio', async () => {
    for (const cifra of ['C', 'G', 'F', 'Bm', 'D7', 'Am7', 'Cmaj7', 'F#m7']) {
      for (const f of violao.formas(cifra, { quantas: 4 }).formas) {
        assert.ok(f.dedos <= 4, `${cifra} ${f.desenho} pede ${f.dedos} dedos`);
        const soando = f.casas.map((c, i) => (c >= 0 ? i : -1)).filter((i) => i >= 0);
        for (let i = soando[0]; i <= soando[soando.length - 1]; i++) {
          assert.ok(f.casas[i] >= 0, `${cifra} ${f.desenho} tem corda muda no meio`);
        }
      }
    }
  });

  await t('todas as notas do acorde aparecem, e o baixo é a fundamental', async () => {
    for (const cifra of ['C', 'Am7', 'G7', 'F']) {
      const r = violao.formas(cifra, { quantas: 3 });
      const esperadas = new Set(violao.notasDoAcorde(chordpro.lerAcorde(cifra)));
      for (const f of r.formas) {
        const pcs = new Set(f.casas.map((c, i) => (c >= 0 ? (violao.CORDAS_PADRAO[i] + c) % 12 : null)).filter((x) => x !== null));
        for (const pc of esperadas) assert.ok(pcs.has(pc), `${cifra} ${f.desenho} não tem todas as notas`);
      }
    }
  });

  await t('C/G põe o SOL no baixo', async () => {
    const r = violao.formas('C/G', { quantas: 3 });
    for (const f of r.formas) {
      const primeira = f.casas.findIndex((c) => c >= 0);
      assert.equal((violao.CORDAS_PADRAO[primeira] + f.casas[primeira]) % 12, 7, f.desenho);
    }
  });

  await t('acorde que ele não sabe desenhar DIZ isso, e não devolve forma errada', async () => {
    const r = violao.formas('C13(#11)', { quantas: 2 });
    assert.equal(r.formas.length, 0);
    assert.ok(/ainda não sei montar o desenho/.test(r.motivo), r.motivo);
    assert.ok(/transposição.*continuam funcionando/i.test(r.motivo),
      'não saber desenhar não pode parecer "a música quebrou"');
  });

  await t('cifra escrita de outros jeitos funciona igual', async () => {
    for (const c of ['Cmaj7', 'C7M', 'Solm', 'C-']) {
      assert.ok(violao.formas(c, { quantas: 1 }).formas.length > 0, c);
    }
  });

  // ===================================================================
  secao('Fase 2 · biblioteca pela API');

  let pastaId, obraId, arranjoId, cifraId, xmlId, midiId;

  await t('cria pasta e ela aparece na árvore', async () => {
    const r = await req('POST', '/music/api/pastas', { como: 'ana', corpo: { nome: 'Bar do Zé' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    pastaId = r.json.pasta.id;
    const a = await req('GET', '/music/api/pastas', { como: 'ana' });
    assert.ok(a.json.raiz.some((p) => p.id === pastaId));
  });

  await t('subpasta entra debaixo da pasta certa', async () => {
    const r = await req('POST', '/music/api/pastas', { como: 'ana', corpo: { nome: 'Primeira parte', pai_id: pastaId } });
    assert.equal(r.status, 200);
    const a = await req('GET', '/music/api/pastas', { como: 'ana' });
    const pai = a.json.raiz.find((p) => p.id === pastaId);
    assert.equal(pai.filhas.length, 1);
    assert.equal(pai.filhas[0].nome, 'Primeira parte');
  });

  await t('pasta com conteúdo NÃO é excluída em silêncio', async () => {
    const r = await req('DELETE', `/music/api/pastas/${pastaId}`, { como: 'ana' });
    assert.equal(r.status, 400);
    assert.ok(/subpasta/i.test(r.json.erro), r.json.erro);
  });

  await t('guarda uma música com cifra, e a cifra é validada antes de gravar', async () => {
    const o = await req('POST', '/music/api/obras', { como: 'ana',
      corpo: { titulo: 'Canção de estrada', compositor: 'Ana', tomOriginal: 'C', tags: ['bar', 'autoral'] } });
    obraId = o.json.obra.id;
    await req('POST', `/music/api/obras/${obraId}/titularidade`, { como: 'ana', corpo: { tipo: 'propria' } });
    const a = await req('POST', `/music/api/obras/${obraId}/arranjos`, { como: 'ana', corpo: { nome: 'voz e violão' } });
    arranjoId = a.json.arranjo.id;

    const ruim = await req('POST', `/music/api/arranjos/${arranjoId}/partituras`,
      { como: 'ana', corpo: { formato: 'chordpro', conteudo: '{title: nada}' } });
    assert.equal(ruim.status, 400, 'cifra sem letra nenhuma não pode entrar');

    const p = await req('POST', `/music/api/arranjos/${arranjoId}/partituras`,
      { como: 'ana', corpo: { formato: 'chordpro', conteudo: CIFRA } });
    assert.equal(p.status, 200, JSON.stringify(p.json));
    cifraId = p.json.partitura.id;
    assert.equal(p.json.capacidades.transpoe, true);
  });

  await t('MusicXML e MIDI entram, e arquivo que mente sobre o formato é recusado', async () => {
    const x = await req('POST', `/music/api/arranjos/${arranjoId}/partituras`,
      { como: 'ana', corpo: { formato: 'musicxml', conteudo: XML } });
    assert.equal(x.status, 200, JSON.stringify(x.json));
    xmlId = x.json.partitura.id;

    const m = await req('POST', `/music/api/arranjos/${arranjoId}/partituras`,
      { como: 'ana', corpo: { formato: 'midi', conteudo: mid.toString('base64') } });
    assert.equal(m.status, 200, JSON.stringify(m.json));
    midiId = m.json.partitura.id;

    const mentira = await req('POST', `/music/api/arranjos/${arranjoId}/partituras`,
      { como: 'ana', corpo: { formato: 'musicxml', conteudo: 'só um texto' } });
    assert.equal(mentira.status, 400);
    assert.ok(/MusicXML/.test(mentira.json.erro), 'a recusa tem de dizer o que fazer: ' + mentira.json.erro);
  });

  await t('ler a cifra em outro tom NÃO muda o que está guardado', async () => {
    const r = await req('GET', `/music/api/partituras/${cifraId}?semitons=2`, { como: 'ana' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.texto.includes('[D]'));
    const original = db.prepare('SELECT conteudo FROM partituras WHERE id = ?').get(cifraId).conteudo;
    assert.equal(original, CIFRA, 'transposição é PARÂMETRO de leitura, não estado guardado');
  });

  await t('capotraste e instrumento compõem com o tom pedido', async () => {
    const r = await req('GET', `/music/api/partituras/${cifraId}?semitons=2&capotraste=2`, { como: 'ana' });
    assert.equal(r.json.tom_soando, 'D');
    assert.equal(r.json.tom_das_formas, 'C', 'ré com capo na 2ª casa se toca com as formas de dó');
    assert.ok(r.json.acordes.length);
  });

  await t('fixar o tom cria uma VERSÃO, e a anterior continua lá', async () => {
    const r = await req('POST', `/music/api/partituras/${cifraId}/transpor`, { como: 'ana', corpo: { semitons: 3 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.partitura.versao > 1);
    assert.ok(/continua guardada/.test(r.json.aviso));
    const todas = db.prepare('SELECT * FROM partituras WHERE arranjo_id = ? AND formato = ?').all(arranjoId, 'chordpro');
    assert.equal(todas.length, 2);
    assert.ok(todas.some((p) => p.conteudo === CIFRA), 'transpor nunca apaga o original');
  });

  await t('PDF diz que não transpõe, em vez de mostrar um seletor que não faz nada', async () => {
    const a2 = await req('POST', `/music/api/obras/${obraId}/arranjos`, { como: 'ana', corpo: { nome: 'scan' } });
    const p = await req('POST', `/music/api/arranjos/${a2.json.arranjo.id}/partituras`,
      { como: 'ana', corpo: { formato: 'pdf', media_id: 'md-pdf' } });
    assert.equal(p.status, 200, JSON.stringify(p.json));
    assert.equal(p.json.capacidades.transpoe, false);
    const v = await req('GET', `/music/api/partituras/${p.json.partitura.id}?semitons=3`, { como: 'ana' });
    assert.ok(/não dá para transpor/i.test(v.json.aviso), v.json.aviso);
  });

  await t('MIDI lido em outro tom avisa sobre a percussão', async () => {
    const r = await req('GET', `/music/api/partituras/${midiId}?semitons=2`, { como: 'ana' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(/percussão não foi transposta/i.test(r.json.aviso), r.json.aviso);
    const perc = r.json.notas.filter((n) => n.percussao).map((n) => n.midi);
    assert.deepEqual(perc, [36, 38]);
  });

  await t('BUSCA acha pela LETRA, não só pelo título', async () => {
    const r = await req('GET', '/music/api/acervo?q=janela', { como: 'ana' });
    assert.equal(r.status, 200);
    assert.ok(r.json.obras.some((o) => o.id === obraId),
      'o músico lembra do verso, não do título');
    const t2 = await req('GET', '/music/api/acervo?q=bar', { como: 'ana' });
    assert.ok(t2.json.obras.some((o) => o.id === obraId), 'e pela tag');
    const nada = await req('GET', '/music/api/acervo?q=zzzznaoexiste', { como: 'ana' });
    assert.equal(nada.json.obras.length, 0);
  });

  await t('busca é do PRÓPRIO acervo: não alcança o de outra pessoa', async () => {
    const r = await req('GET', '/music/api/acervo?q=janela', { como: 'bruno' });
    assert.equal(r.json.obras.length, 0);
  });

  await t('mover para pasta e filtrar por pasta', async () => {
    await req('POST', `/music/api/obras/${obraId}/pasta`, { como: 'ana', corpo: { pasta_id: pastaId } });
    const r = await req('GET', `/music/api/acervo?pasta=${pastaId}`, { como: 'ana' });
    assert.ok(r.json.obras.some((o) => o.id === obraId));
  });

  await t('a tela da obra traz arranjos, formatos e o que cada um permite', async () => {
    const r = await req('GET', `/music/api/obras/${obraId}`, { como: 'ana' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.arranjos.length >= 2);
    const formatos = r.json.arranjos.flatMap((a) => a.partituras.map((p) => p.formato));
    assert.ok(['chordpro', 'musicxml', 'midi', 'pdf'].every((f) => formatos.includes(f)));
  });

  await t('anotação de palco fica no arranjo e é só de quem escreveu', async () => {
    const r = await req('POST', `/music/api/arranjos/${arranjoId}/anotacoes`,
      { como: 'ana', corpo: { texto: 'entra o sax no 2º refrão', ancora: 'refrão' } });
    assert.equal(r.status, 200);
    const minha = await req('GET', `/music/api/obras/${obraId}`, { como: 'ana' });
    assert.equal(minha.json.arranjos.find((a) => a.id === arranjoId).anotacoes.length, 1);
  });

  // ===================================================================
  secao('Fase 2 · repertório, banda e palco');

  let repId, bandaId;

  await t('cria repertório e adiciona a música com tom de execução', async () => {
    const r = await req('POST', '/music/api/repertorios',
      { como: 'ana', corpo: { nome: 'Sexta no bar', ocasiao: 'bar', data: '2026-09-04' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    repId = r.json.repertorio.id;
    const it = await req('POST', `/music/api/repertorios/${repId}/itens`,
      { como: 'ana', corpo: { obra_id: obraId, tom_execucao: 'D', capotraste: 2, nota_palco: 'começa sem bateria' } });
    assert.equal(it.status, 200, JSON.stringify(it.json));
    assert.equal(it.json.item.tom_execucao, 'D');
  });

  await t('o tom de execução é do ITEM, não da obra', async () => {
    const o = repo.Obras.porId(obraId);
    assert.equal(o.tom_original, 'C', 'gravar o tom na obra apagaria a versão do outro cantor');
  });

  await t('item sem duração ganha ESTIMATIVA, e ela vem MARCADA como estimativa', async () => {
    const r = await req('GET', `/music/api/repertorios/${repId}`, { como: 'ana' });
    const it = r.json.itens[0];
    assert.ok(it.duracao_s > 0);
    assert.equal(it.duracao_estimada, 1);
    assert.equal(r.json.duracao.confiavel, false,
      'somar estimativas e chamar de duração faz o músico estourar o horário do contratante');
    assert.ok(r.json.duracao.estimado_s > 0);
  });

  await t('informar a duração à mão tira a marca de estimativa', async () => {
    const r0 = await req('GET', `/music/api/repertorios/${repId}`, { como: 'ana' });
    const id = r0.json.itens[0].id;
    await req('PATCH', `/music/api/itens/${id}`, { como: 'ana', corpo: { duracao_s: 245 } });
    const r = await req('GET', `/music/api/repertorios/${repId}`, { como: 'ana' });
    assert.equal(r.json.itens[0].duracao_s, 245);
    assert.equal(r.json.itens[0].duracao_estimada, 0);
    assert.equal(r.json.duracao.confiavel, true);
  });

  await t('item livre (intervalo, fala) entra sem estar no acervo', async () => {
    const r = await req('POST', `/music/api/repertorios/${repId}/itens`,
      { como: 'ana', corpo: { titulo_livre: 'Intervalo', duracao_s: 900 } });
    assert.equal(r.status, 200);
    const c = await req('GET', `/music/api/repertorios/${repId}`, { como: 'ana' });
    assert.equal(c.json.itens.length, 2);
    assert.equal(c.json.itens[1].tem_acervo, false);
  });

  await t('reordenar NÃO pode perder item', async () => {
    const c = await req('GET', `/music/api/repertorios/${repId}`, { como: 'ana' });
    const ids = c.json.itens.map((i) => i.id);
    const parcial = await req('POST', `/music/api/repertorios/${repId}/ordem`,
      { como: 'ana', corpo: { ids: [ids[0]] } });
    assert.equal(parcial.status, 400);
    assert.ok(/todos os itens/i.test(parcial.json.erro));
    const ok = await req('POST', `/music/api/repertorios/${repId}/ordem`,
      { como: 'ana', corpo: { ids: [ids[1], ids[0]] } });
    assert.equal(ok.status, 200);
    const depois = await req('GET', `/music/api/repertorios/${repId}`, { como: 'ana' });
    assert.equal(depois.json.itens[0].id, ids[1]);
  });

  await t('repertório pessoal não é visto por outra pessoa', async () => {
    const r = await req('GET', `/music/api/repertorios/${repId}`, { como: 'bruno' });
    assert.equal(r.status, 403);
  });

  await t('banda: o integrante vê o repertório da banda, quem não é não vê', async () => {
    const b = await req('POST', '/music/api/bandas', { como: 'ana', corpo: { nome: 'Trio da Esquina' } });
    bandaId = b.json.banda.id;
    const conv = await req('POST', `/music/api/bandas/${bandaId}/membros`,
      { como: 'ana', corpo: { emails: ['bruno@t', 'naoexiste@t'] } });
    assert.equal(conv.json.entraram, 1);
    assert.deepEqual(conv.json.nao_encontrados, ['naoexiste@t'],
      'errar um e-mail é comum, e o silêncio faria o integrante sumir');

    const rb = await req('POST', '/music/api/repertorios',
      { como: 'ana', corpo: { nome: 'Show do trio', banda_id: bandaId } });
    const visto = await req('GET', `/music/api/repertorios/${rb.json.repertorio.id}`, { como: 'bruno' });
    assert.equal(visto.status, 200, 'integrante da banda tem de ver');
    const forasteiro = await req('GET', `/music/api/repertorios/${rb.json.repertorio.id}`, { como: 'prof' });
    assert.equal(forasteiro.status, 403);
  });

  await t('integrante EDITA o setlist da banda — na passagem de som não dá para depender do dono', async () => {
    const lista = await req('GET', '/music/api/repertorios', { como: 'bruno' });
    const daBanda = lista.json.repertorios.find((r) => r.banda_id === bandaId);
    assert.ok(daBanda);
    const it = await req('POST', `/music/api/repertorios/${daBanda.id}/itens`,
      { como: 'bruno', corpo: { titulo_livre: 'Abertura', duracao_s: 180 } });
    assert.equal(it.status, 200, JSON.stringify(it.json));
  });

  await t('sugerir por duração usa SÓ o acervo de quem pede, e avisa que é estimativa', async () => {
    const r = await req('POST', '/music/api/repertorios/sugerir', { como: 'ana', corpo: { minutos: 30 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(/ESTIMATIVAS/i.test(r.aviso || r.json.aviso), JSON.stringify(r.json.aviso));
    const vazio = await req('POST', '/music/api/repertorios/sugerir', { como: 'prof', corpo: { minutos: 30 } });
    assert.equal(vazio.json.itens.length, 0);
    assert.ok(vazio.json.aviso);
  });

  await t('CONFERIR O TOM diz "não sei" quando só há cifra', async () => {
    // A obra tem MusicXML e MIDI, então SABE. Uma obra só com cifra, não.
    const o2 = await req('POST', '/music/api/obras', { como: 'ana', corpo: { titulo: 'Só cifra', titularidade: 'propria' } });
    const a2 = await req('POST', `/music/api/obras/${o2.json.obra.id}/arranjos`, { como: 'ana', corpo: {} });
    await req('POST', `/music/api/arranjos/${a2.json.arranjo.id}/partituras`,
      { como: 'ana', corpo: { formato: 'chordpro', conteudo: CIFRA } });
    const r = await req('POST', `/music/api/obras/${o2.json.obra.id}/conferir-tom`,
      { como: 'ana', corpo: { extensao: { grave: 'E3', agudo: 'C5' } } });
    assert.equal(r.json.sabe, false);
    assert.ok(/cifra traz os acordes, não a melodia/i.test(r.json.motivo), r.json.motivo);
  });

  await t('com melodia, confere e SUGERE um tom que caiba', async () => {
    const apertada = await req('POST', `/music/api/obras/${obraId}/conferir-tom`,
      { como: 'ana', corpo: { extensao: { grave: 'C3', agudo: 'D3' } } });
    assert.equal(apertada.json.sabe, true);
    assert.equal(apertada.json.cabe, false);
    assert.ok(apertada.json.motivo);
    const folgada = await req('POST', `/music/api/obras/${obraId}/conferir-tom`,
      { como: 'ana', corpo: { extensao: { grave: 'C2', agudo: 'C6' } } });
    assert.equal(folgada.json.cabe, true);
  });

  await t('MODO PALCO devolve o setlist inteiro, já no tom da apresentação', async () => {
    const r = await req('GET', `/music/api/repertorios/${repId}/palco`, { como: 'ana' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const musica = r.json.itens.find((i) => i.cifra);
    assert.ok(musica, 'a música do acervo tem de vir com a cifra embutida');
    assert.equal(musica.tom_soando, 'D', 'o tom da APRESENTAÇÃO, não o da obra');
    assert.equal(musica.tom_das_formas, 'C', 'com capotraste 2, as formas são de dó');
    assert.ok(musica.acordes.includes('C'));
    assert.ok(r.json.validade_horas,
      'a tela guarda isto no celular; sem validade o músico sobe no palco com setlist velho');
    assert.ok(r.json.itens.every((i) => i.nota_palco !== undefined));
  });

  await t('o palco NÃO transpõe duas vezes quando a cifra já é uma versão transposta', async () => {
    // Defeito real, achado por este teste: o palco escolhia a versão MAIS
    // NOVA da cifra (que aqui está em mi bemol, porque o usuário fixou um
    // tom) e transpunha a partir do tom da OBRA (dó). Resultado: fá em vez
    // de ré. O tom de partida tem de ser o da CIFRA escolhida.
    const versoes = db.prepare("SELECT * FROM partituras WHERE arranjo_id = ? AND formato = 'chordpro' ORDER BY versao DESC")
      .all(arranjoId);
    assert.ok(versoes.length >= 2, 'o cenário exige uma versão transposta guardada');
    assert.ok(versoes[0].conteudo.includes('{key: Eb}'), 'a versão mais nova está em mi bemol');
    assert.equal(repo.Obras.porId(obraId).tom_original, 'C', 'e a obra continua registrada em dó');

    const r = await req('GET', `/music/api/repertorios/${repId}/palco`, { como: 'ana' });
    const musica = r.json.itens.find((i) => i.cifra);
    assert.equal(musica.tom_soando, 'D',
      'partir do tom da obra transporia duas vezes — e o erro só apareceria no palco');
  });

  await t('as telas da Fase 2 são servidas INTEIRAS', async () => {
    const b = await req('GET', '/music/biblioteca.js', { cru: true });
    assert.equal(b.status, 200);
    assert.ok(b.texto.length > 12000, 'biblioteca.js veio com ' + b.texto.length + ' bytes');
    for (const tela of ['verBiblioteca', 'verRepertorios', 'abrirPalco', 'pintarPalco', 'diagrama', 'controlesTom']) {
      assert.ok(b.texto.includes(tela), 'faltou ' + tela);
    }
    const pag = await req('GET', '/music/app', { cru: true });
    for (const src of ['/music/audio.js', '/music/app.js', '/music/biblioteca.js']) {
      assert.ok(pag.texto.includes(src), 'a página não carrega ' + src);
    }
  });

  await t('todo script servido ao navegador é JavaScript VÁLIDO', async () => {
    // Os scripts do cliente moram dentro de template literals no
    // servidor. Uma crase perdida num comentário de CSS ou de código
    // fecha a string e produz um erro de sintaxe LONGE da causa — já
    // aconteceu duas vezes. `new Function` compila sem executar, e é o
    // jeito barato de provar que o que sai pela rede abre no navegador.
    for (const caminho of ['/music/audio.js', '/music/app.js', '/music/biblioteca.js']) {
      const r = await req('GET', caminho, { cru: true });
      assert.equal(r.status, 200, caminho);
      try { new Function(r.texto); }
      catch (e) { throw new Error(`${caminho} não é JavaScript válido: ${e.message}`); }
    }
  });

  await t('o MODO PALCO tem o que o palco exige: tela acesa, offline e teclado', async () => {
    const b = await req('GET', '/music/biblioteca.js', { cru: true });
    assert.ok(/wakeLock/.test(b.texto), 'celular que apaga no meio do refrão é pior que não ter app');
    assert.ok(/localStorage/.test(b.texto), 'o setlist tem de caber no aparelho');
    assert.ok(/copia guardada neste aparelho/.test(b.texto),
      'cache silencioso faz o músico subir no palco com setlist velho');
    assert.ok(/addEventListener\('keydown'/.test(b.texto), 'no palco não dá para mirar em botão pequeno');
    const pag = await req('GET', '/music/app', { cru: true });
    assert.ok(/\.palco-corpo/.test(pag.texto) && /body\.em-palco/.test(pag.texto), 'faltou o estilo do palco');
  });

  await t('a Musique é instalável (manifest + service worker no escopo /music/)', async () => {
    const pag = await req('GET', '/music/app', { cru: true });
    assert.ok(pag.texto.includes('/music/manifest.webmanifest'));
    assert.ok(pag.texto.includes("serviceWorker"), 'sem SW, a casca não abre offline');
    const m = await req('GET', '/music/manifest.webmanifest', { cru: true });
    assert.equal(m.status, 200);
    const j = JSON.parse(m.texto);
    assert.equal(j.name, 'Musique');
    assert.equal(j.scope, '/music/');
    const sw = await req('GET', '/music/sw.js', { cru: true });
    assert.equal(sw.status, 200);
    assert.ok(/\/api/.test(sw.texto), 'o SW não pode cachear API — dado vivo não se guarda');
  });

  await t('o palco não vaza obra que o solicitante não pode ver', async () => {
    const rb = (await req('GET', '/music/api/repertorios', { como: 'bruno' })).json.repertorios
      .find((x) => x.banda_id === bandaId);
    const it = await req('POST', `/music/api/repertorios/${rb.id}/itens`,
      { como: 'ana', corpo: { obra_id: obraId } });
    assert.equal(it.status, 200);
    const palco = await req('GET', `/music/api/repertorios/${rb.id}/palco`, { como: 'bruno' });
    const daAna = palco.json.itens.find((i) => i.titulo === 'Canção de estrada');
    assert.ok(daAna, 'o item aparece no setlist da banda');
    assert.equal(daAna.cifra, null,
      'mas a cifra é do acervo PRIVADO da Ana — o setlist compartilha a ordem, não o acervo');
  });
}

module.exports = { rodar, CIFRA, XML, midiExemplo };
