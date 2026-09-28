// =====================================================================
// Musique Cifras — testes do SMART PLAY (28/09/2026): alinhador do motor,
// função harmônica, comandos de voz, sincronia no servidor, busca do
// YouTube (API simulada), Worker e as funções puras do cliente.
// =====================================================================
'use strict';

async function rodar({ t, secao, req, assert }) {
  const Au = require('./motor/audio');
  const A = require('./motor/acorde');
  const H = require('./motor/harmonia');
  const N = require('./motor/nota');
  const Cmd = require('./motor/comandos');
  const { db } = require('../db');
  const acervo = require('./acervo');
  secao('Cifras · Smart Play, karaokê, acorde em detalhe e voz');

  const taxa = 22050;
  const gerar = (c, dur) => {
    const pcs = A.notas(A.ler(c)); const n = Math.round(dur * taxa); const x = new Float32Array(n);
    pcs.forEach((pc, i) => { const f = 440 * Math.pow(2, (48 + pc + (i ? 12 : 0) - 69) / 12);
      for (let h = 1; h <= 5; h++) for (let k = 0; k < n; k++) x[k] += Math.sin(2 * Math.PI * f * h * k / taxa) / (h * h) * 0.2; });
    return x;
  };
  const juntar = (ps) => { const n = ps.reduce((a, p) => a + p.length, 0); const o = new Float32Array(n); let k = 0; ps.forEach((p) => { o.set(p, k); k += p.length; }); return o; };

  await t('ALINHADOR: acha o início de cada acorde da cifra numa gravação (erro < 0,3 s), com introdução em silêncio', async () => {
    const SEQ = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C']; const durs = [2, 1.5, 3, 2, 2, 1, 2.5, 2];
    const audio = juntar([new Float32Array(taxa * 1.5)].concat(SEQ.map((c, i) => gerar(c, durs[i]))));
    const r = Au.alinhar(Au.cromagrama(audio, taxa), SEQ);
    let t0 = 1.5; const esperado = durs.map((d) => { const v = t0; t0 += d; return v; });
    r.inicios_s.forEach((x, i) => assert.ok(Math.abs(x - esperado[i]) < 0.3, `acorde ${i} (${SEQ[i]}): ${x} ≠ ${esperado[i]}`));
    assert.ok(r.confianca > 0.8, 'confiança ' + r.confianca);
  });

  await t('ALINHADOR: acorde escrito que a gravação não toca é pulado sem desalinhar o resto', async () => {
    const tocado = ['C', 'G', 'F', 'C'];            // a cifra tem um Am que não foi tocado
    const audio = juntar(tocado.map((c) => gerar(c, 2)));
    const r = Au.alinhar(Au.cromagrama(audio, taxa), ['C', 'G', 'Am', 'F', 'C']);
    assert.ok(Math.abs(r.inicios_s[3] - 4) < 0.4, 'o F depois do Am pulado continua em ~4 s: ' + r.inicios_s[3]);
    assert.ok(Math.abs(r.inicios_s[4] - 6) < 0.4);
  });

  await t('FUNÇÃO HARMÔNICA no campo: V7 dominante, IV subdominante, vi relativa da tônica; fora do campo é dito', async () => {
    const C = N.lerTom('C'), Am = N.lerTom('Am');
    assert.equal(H.grau('G7', C).funcao, 'dominante');
    assert.equal(H.grau('F', C).funcao, 'subdominante');
    assert.equal(H.grau('Am', C).funcao, 'tônica (relativa)');
    assert.match(H.grau('Bb', C).funcao, /fora do campo/);
    assert.equal(H.grau('E7', Am).funcao, 'dominante');
    assert.equal(H.grau('C', Am).funcao, 'tônica (relativa)');
  });

  await t('COMANDOS DE VOZ: frases do dia a dia viram ação; o que não entende volta com o texto', async () => {
    const casos = {
      'Abrir Tempo Perdido': { acao: 'abrir', q: 'tempo perdido' }, 'tocar Será': { acao: 'abrir', q: 'sera' },
      'tocar': { acao: 'tocar' }, 'Pausar': { acao: 'pausar' }, 'subir meio tom': { acao: 'transpor', semitons: 1 },
      'baixar um tom': { acao: 'transpor', semitons: -2 }, 'transpor para ré menor': { acao: 'tom', tom: 'Dm' },
      'tom de lá bemol': { acao: 'tom', tom: 'Ab' }, 'buscar legião urbana': { acao: 'buscar', q: 'legiao urbana' },
      'parar rolagem': { acao: 'rolar', ligar: false }, 'mais devagar': { acao: 'velocidade', passo: -1 },
      'aumentar a letra': { acao: 'fonte', passo: 1 }, 'karaokê': { acao: 'karaoke' }, 'minimizar o player': { acao: 'player', aberto: false },
      'Musique, abrir Pais e Filhos': { acao: 'abrir', q: 'pais e filhos' },
    };
    Object.keys(casos).forEach((frase) => {
      const r = Cmd.interpretar(frase); const e = casos[frase];
      Object.keys(e).forEach((k) => assert.equal(r[k], e[k], `"${frase}" → ${JSON.stringify(r)}`));
    });
    const d = Cmd.interpretar('qualquer coisa sem sentido');
    assert.equal(d.acao, 'desconhecido'); assert.equal(d.texto, 'qualquer coisa sem sentido');
  });

  // --- servidor: sincronia e YouTube ---
  const m = acervo.Musicas.criar('u-ana', { titulo: 'Smart Play do Teste', artista: 'Banda do Teste', titularidade: 'propria', separada: true });
  const c = acervo.Cifras.criar('u-ana', m.id, { texto: 'Tom: C\n\n[Verso]\nC        G\nprimeira linha\nAm       F\nsegunda linha' });
  const cifraId = c.cifra.id;
  const mid = (await req('POST', `/music/api/cifras/musicas/${m.id}/midias`, { como: 'ana', corpo: { url: 'https://exemplo.com/musica.mp3', titulo: 'MP3' } })).json.midia;

  await t('SINCRONIA: grava e lê as linhas no tempo; mídia de outra música é recusada; quem não vê a cifra não mexe', async () => {
    const linhas = JSON.parse(db.prepare('SELECT documento FROM cifras WHERE id = ?').get(cifraId).documento)
      .secoes.flatMap((s) => s.linhas.filter((l) => l.tipo === 'letra').map((l) => l.id));
    const marcas = [{ linha: linhas[1], t_ms: 4000 }, { linha: linhas[0], t_ms: 500 }];
    const r = await req('PUT', `/music/api/cifras/cifras/${cifraId}/sincronia`, { como: 'ana', corpo: { midia_id: mid.id, marcas, origem: 'auto', confianca: 0.9 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const g = await req('GET', `/music/api/cifras/cifras/${cifraId}/sincronia?midia=${mid.id}`, { como: 'ana' });
    assert.deepEqual(g.json.sincronia.marcas.map((x) => x.t_ms), [500, 4000], 'as marcas voltam em ordem de tempo');
    assert.equal(g.json.sincronia.origem, 'auto');
    const outra = acervo.Musicas.criar('u-ana', { titulo: 'Outra do Teste', separada: true });
    const mo = (await req('POST', `/music/api/cifras/musicas/${outra.id}/midias`, { como: 'ana', corpo: { url: 'https://exemplo.com/b.mp3' } })).json.midia;
    assert.equal((await req('PUT', `/music/api/cifras/cifras/${cifraId}/sincronia`, { como: 'ana', corpo: { midia_id: mo.id, marcas } })).status, 404);
    assert.equal((await req('GET', `/music/api/cifras/cifras/${cifraId}/sincronia?midia=${mid.id}`, { como: 'bruno' })).status, 403);
  });

  await t('YOUTUBE: sem chave, devolve a busca pronta; com chave, acha, guarda na música, não repete e para na cota', async () => {
    const YT = require('./youtube');
    delete process.env.YOUTUBE_API_KEY;
    const sem = await req('POST', `/music/api/cifras/musicas/${m.id}/youtube`, { como: 'ana' });
    assert.equal(sem.json.resultado, 'sem-chave');
    assert.match(sem.json.busca, /^https:\/\/www\.youtube\.com\/results\?search_query=Smart%20Play%20do%20Teste%20Banda%20do%20Teste$/);
    process.env.YOUTUBE_API_KEY = 'chave-de-teste';
    const pedidos = [];
    YT._transporte(async (u) => {
      pedidos.push(u);
      return { ok: true, status: 200, json: async () => ({ items: [
        { id: { videoId: 'aulaAAAAAAA' }, snippet: { title: 'Como tocar Smart Play do Teste (aula)', channelTitle: 'Canal de aulas' } },
        { id: { videoId: 'oficialBBBB' }, snippet: { title: 'Smart Play do Teste', channelTitle: 'Banda do Teste' } }] }) };
    });
    try {
      const r = await req('POST', `/music/api/cifras/musicas/${m.id}/youtube`, { como: 'ana' });
      assert.equal(r.json.resultado, 'adicionado', JSON.stringify(r.json));
      assert.equal(r.json.video.id, 'oficialBBBB', 'prefere o vídeo da banda à aula');
      assert.ok(pedidos[0].includes('key=chave-de-teste') && pedidos[0].includes('type=video'));
      const midias = db.prepare('SELECT url FROM obra_midias WHERE obra_id = ?').all(m.id).map((x) => x.url);
      assert.ok(midias.includes('https://www.youtube.com/watch?v=oficialBBBB'));
      assert.equal((await YT.garantirParaObra(m.id, 'u-ana')).resultado, 'ja-tem', 'a música já tem vídeo: não gasta cota');
      assert.equal((await req('POST', `/music/api/cifras/musicas/${m.id}/youtube`, { como: 'bruno' })).status, 403, 'só o dono procura');
      // Cota esgotada: o lote para na hora, sem martelar a API.
      YT._transporte(async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) }));
      acervo.Musicas.criar('u-ana', { titulo: 'Sem vídeo 1', separada: true }); acervo.Musicas.criar('u-ana', { titulo: 'Sem vídeo 2', separada: true });
      const lote = await YT.acervoSemVideo('u-ana');
      assert.equal(lote.cota, true); assert.equal(lote.adicionados, 0);
    } finally { delete process.env.YOUTUBE_API_KEY; YT._transporte((...a) => fetch(...a)); }
  });

  await t('WORKER: o pedido "alinhar" roda o motor fora da tela e devolve o início de cada acorde', async () => {
    const w = await req('GET', '/music/cifras-trabalhador.js', { cru: true });
    const motor = (await req('GET', '/music/motor-cifras.js', { cru: true })).texto;
    assert.ok(motor.includes('interpretar') && motor.includes('alinhar'), 'o motor servido traz comandos e alinhador');
    const escopo = { saida: [] }; escopo.self = escopo;
    new Function('self', 'importScripts', 'postMessage', w.texto + '\nself.onmessage = onmessage;')(escopo, () => new Function('self', motor)(escopo), (x) => escopo.saida.push(x));
    const audio = juntar(['C', 'G', 'Am'].map((x) => gerar(x, 1.5)));
    escopo.onmessage({ data: { id: 9, tipo: 'alinhar', amostras: audio, taxa, acordes: ['C', 'G', 'Am'] } });
    const r = escopo.saida[0];
    assert.ok(r.ok, JSON.stringify(r)); assert.ok(Math.abs(r.resultado.inicios_s[1] - 1.5) < 0.3);
  });

  await t('CLIENTE: linhas no tempo a partir dos acordes (linha sem acorde fica entre as vizinhas) e o Smart Play está ligado à cifra', async () => {
    const motor = (await req('GET', '/music/motor-cifras.js', { cru: true })).texto;
    const cliente = (await req('GET', '/music/cifras.js', { cru: true })).texto;
    assert.ok(cliente.includes('C.SmartPlay.anexar(estado') && cliente.includes('detalheAcorde(ac, elm'), 'a tela da cifra liga o player e o detalhe do acorde');
    assert.ok(cliente.includes("'✏️ Editar cifra'"), 'o Editar fica à vista na cifra');
    const janela = { MusiqueUI: { $: () => null, el: () => ({}), esc: (x) => x, api: () => Promise.resolve({}), aviso() {}, erro() {}, ir() {} },
      addEventListener() {}, removeEventListener() {}, requestAnimationFrame() {}, cancelAnimationFrame() {} };
    new Function('self', motor)(janela);
    new Function('window', 'document', 'navigator', 'location', 'history', cliente)(janela,
      { readyState: 'complete', addEventListener() {}, removeEventListener() {} }, { onLine: true }, { hash: '', pathname: '/music/app', search: '' }, { replaceState() {} });
    const SP = janela.MusiqueCifras.SmartPlay;
    const doc = janela.MusiqueMotor.documento.deChordPro('[C]um [G]dois\nlinha sem acorde\n[Am]tres [F]quatro');
    const seq = SP._acordesComLinha(doc);
    assert.deepEqual(seq.map((x) => x.acorde), ['C', 'G', 'Am', 'F']);
    const marcas = SP._marcasDasLinhas(doc, seq, [1, 2, 9, 10]);
    assert.deepEqual(marcas.map((x) => x.t_ms), [1000, 5000, 9000], 'a linha sem acorde cai no meio (5 s)');
  });
}

module.exports = { rodar };
