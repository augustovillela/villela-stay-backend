// =====================================================================
// Musique · Laboratório — NÚCLEO · SEPARAÇÃO DE TRILHAS (30/09/2026).
//
// O modelo é o HT-Demucs de 6 fontes (Meta, licença MIT), exportado para
// ONNX e rodado NO NAVEGADOR do aluno (onnxruntime-web, WebGPU ou CPU):
// o áudio não sai do aparelho e não há custo por uso.
//
// O modelo recebe trechos fixos de 7,8 s em estéreo a 44,1 kHz
// (`mix [1, 2, 343980]`) e devolve as 6 fontes (`stems [1, 6, 2, 343980]`).
// Este arquivo é a parte PURA em volta dele — e por isso testável sem o
// modelo: o plano de trechos com sobreposição de 1/4, a janela de
// transição, a soma ponderada (overlap-add), a mixagem com volume, mudo e
// solo, e o WAV para baixar.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).separacao = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAXA = 44100, TRECHO = 343980, SOBRE = Math.floor(TRECHO / 4), PASSO = TRECHO - SOBRE;
  // Ordem das fontes na SAÍDA do modelo (não mudar sem mudar o modelo).
  var FONTES = [
    { id: 'drums', nome: 'Bateria', icone: '🥁' },
    { id: 'bass', nome: 'Baixo', icone: '🎸' },
    { id: 'other', nome: 'Outros (sopros, cordas, teclados, efeitos)', curto: 'Outros', icone: '🎺' },
    { id: 'vocals', nome: 'Voz', icone: '🎤' },
    { id: 'guitar', nome: 'Guitarra e violão', curto: 'Guitarra', icone: '🎸' },
    { id: 'piano', nome: 'Piano', icone: '🎹' },
  ];
  var MODELO = {
    // Fixado num COMMIT: o arquivo não muda sem mudarmos este endereço.
    url: 'https://huggingface.co/kramp/htdemucs-6s-webgpu-onnx/resolve/0c850a01007f48d94900b21b49a0d0ae1a17239f/htdemucs_6s.onnx',
    bytes: 284797240, nome: 'HT-Demucs 6 fontes (Meta, MIT; ONNX para WebGPU por kramp, MIT)', entrada: 'mix', saida: 'stems',
  };

  // Receitas prontas: o que TOCA (1) e o que sai (0), na ordem de FONTES.
  var RECEITAS = [
    { id: 'tudo', nome: 'Música completa', ganhos: [1, 1, 1, 1, 1, 1] },
    { id: 'sem-voz', nome: 'Sem voz (karaokê)', ganhos: [1, 1, 1, 0, 1, 1] },
    { id: 'sem-bateria', nome: 'Sem bateria', ganhos: [0, 1, 1, 1, 1, 1] },
    { id: 'sem-baixo', nome: 'Sem baixo', ganhos: [1, 0, 1, 1, 1, 1] },
    { id: 'sem-guitarra', nome: 'Sem guitarra', ganhos: [1, 1, 1, 1, 0, 1] },
    { id: 'sem-piano', nome: 'Sem piano', ganhos: [1, 1, 1, 1, 1, 0] },
    { id: 'sem-outros', nome: 'Sem sopros e cordas', ganhos: [1, 1, 0, 1, 1, 1] },
    { id: 'so-voz', nome: 'Só a voz', ganhos: [0, 0, 0, 1, 0, 0] },
    { id: 'cozinha', nome: 'Só bateria e baixo', ganhos: [1, 1, 0, 0, 0, 0] },
  ];

  /** Trechos que cobrem `total` amostras: início a cada PASSO, 1/4 sobreposto. */
  function plano(total) {
    var n = Math.max(1, Math.ceil(Math.max(0, total - SOBRE) / PASSO)), out = [];
    for (var i = 0; i < n; i++) { var ini = i * PASSO; out.push({ ini: ini, fim: Math.min(ini + TRECHO, total) }); }
    return out;
  }

  /** Janela trapezoidal: sobe e desce linearmente na sobreposição. */
  var _janela = null;
  function janela() {
    if (_janela) return _janela;
    _janela = new Float32Array(TRECHO);
    for (var i = 0; i < TRECHO; i++) {
      var a = i < SOBRE ? (i + 1) / (SOBRE + 1) : 1, b = i >= TRECHO - SOBRE ? (TRECHO - i) / (SOBRE + 1) : 1;
      _janela[i] = Math.min(a, b);
    }
    return _janela;
  }

  /**
   * Separa `esq`/`dir` (Float32Array, 44,1 kHz). `modelo(mixPlano)` recebe
   * Float32Array [2 × TRECHO] (canal a canal) e devolve (ou promete)
   * Float32Array [6 × 2 × TRECHO]. Devolve [fonte][canal] Float32Array.
   * `aoProgresso(i, n)` a cada trecho. o.pausaMs: folga ENTRE trechos
   * (o aparelho respira: a tela e o resto do sistema seguem respondendo).
   * o.parar(): se devolver true, a separação para no próximo trecho.
   */
  function separar(esq, dir, modelo, aoProgresso, o) {
    o = o || {};
    var total = esq.length, p = plano(total), w = janela(), nF = FONTES.length;
    var saida = FONTES.map(function () { return [new Float32Array(total), new Float32Array(total)]; });
    var peso = new Float32Array(total), i = 0;
    function passo() {
      if (i >= p.length) {
        for (var f = 0; f < nF; f++) for (var c = 0; c < 2; c++) { var s = saida[f][c]; for (var k = 0; k < total; k++) if (peso[k] > 0) s[k] /= peso[k]; }
        return Promise.resolve(saida);
      }
      if (o.parar && o.parar()) return Promise.reject(Object.assign(new Error('Separação interrompida.'), { parado: true }));
      var t = p[i], len = t.fim - t.ini, mix = new Float32Array(2 * TRECHO);
      mix.set(esq.subarray(t.ini, t.fim), 0); mix.set(dir.subarray(t.ini, t.fim), TRECHO);
      return Promise.resolve(modelo(mix)).then(function (st) {
        // a janela nunca é zero; dividir pelo peso acumulado no fim deixa a
        // soma exata também nas pontas da música (onde não há vizinho)
        for (var k = 0; k < len; k++) {
          var wk = w[k];
          peso[t.ini + k] += wk;
          for (var f = 0; f < nF; f++) for (var c = 0; c < 2; c++) saida[f][c][t.ini + k] += st[(f * 2 + c) * TRECHO + k] * wk;
        }
        i++; if (aoProgresso) aoProgresso(i, p.length);
        if (!o.pausaMs || i >= p.length) return passo();
        return new Promise(function (ok) { setTimeout(ok, o.pausaMs); }).then(passo);
      });
    }
    return passo();
  }

  /** Mistura as fontes com os ganhos (0–1). Devolve [esq, dir]. */
  function mixar(fontes, ganhos, ini, fim) {
    var n = fontes[0][0].length, a = ini || 0, b = fim == null ? n : Math.min(n, fim), L = new Float32Array(b - a), R = new Float32Array(b - a);
    fontes.forEach(function (fc, f) { var g = ganhos[f] || 0; if (!g) return; for (var k = a; k < b; k++) { L[k - a] += fc[0][k] * g; R[k - a] += fc[1][k] * g; } });
    return [L, R];
  }

  /** Ganhos efetivos: solo vence mudo; volume 0–1 por fonte. */
  function ganhosEfetivos(estado) {
    var algumSolo = estado.some(function (e) { return e.solo; });
    return estado.map(function (e) { return (algumSolo ? e.solo : !e.mudo) ? Math.max(0, Math.min(1.5, e.volume == null ? 1 : e.volume)) : 0; });
  }

  /** WAV PCM 16 bits estéreo (limitado a ±1 sem estourar). */
  function wav(L, R, taxa) {
    var n = L.length, ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab), i;
    var s = function (o, t) { for (var j = 0; j < t.length; j++) dv.setUint8(o + j, t.charCodeAt(j)); };
    s(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); s(8, 'WAVE'); s(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, taxa, true); dv.setUint32(28, taxa * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); s(36, 'data'); dv.setUint32(40, n * 4, true);
    var pico = 0; for (i = 0; i < n; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
    var k = pico > 0.99 ? 0.99 / pico : 1, o = 44;
    for (i = 0; i < n; i++) { dv.setInt16(o, Math.round(L[i] * k * 32767), true); dv.setInt16(o + 2, Math.round(R[i] * k * 32767), true); o += 4; }
    return new Uint8Array(ab);
  }

  // -------------------------------------------------------------------
  // APARELHO (lição de 30/09/2026: a separação congelou um notebook com
  // Intel Iris Xe INTEGRADA — a placa que desenha a tela ficava ocupada
  // 25–45 s por trecho). Placa de vídeo só quando é das que aguentam;
  // em todo o resto, processador com METADE dos núcleos (o PC segue
  // respondendo). Pura: recebe o que o navegador informa e decide.
  // -------------------------------------------------------------------
  var LIMITES = { maxMinutos: 5, minMemoriaGB: 4, pausaCpuMs: 300, pausaGpuMs: 150, gpuMaxMsTrecho: 8000 };

  /**
   * a: { gpu: { vendor, architecture, description } | null, nucleos,
   *      memoriaGB (navigator.deviceMemory, pode faltar), celular, isolado }
   * Devolve { pode, motor ('webgpu'|'wasm'), threads, maxMinutos, pausaMs,
   *           placa: 'dedicada'|'integrada'|'nenhuma', motivo, avisos[] }.
   */
  function aparelho(a) {
    a = a || {};
    var g = a.gpu, v = String(g && g.vendor || '').toLowerCase(), arq = String(g && g.architecture || '').toLowerCase(), desc = String(g && g.description || '').toLowerCase();
    var placa = 'nenhuma';
    if (g) {
      var intelDedicada = v === 'intel' && (/xe-hpg|xe2-hpg|alchemist|battlemage/.test(arq) || /\barc\b/.test(desc));
      var amdDedicada = v === 'amd' && /radeon (rx|pro)|\brx ?\d{3,4}/.test(desc) && !/graphics$|vega \d+ graphics|radeon\(tm\) graphics/.test(desc);
      placa = v === 'nvidia' || v === 'apple' || intelDedicada || amdDedicada ? 'dedicada' : 'integrada';
    }
    var memoria = Number(a.memoriaGB) || 0, nucleos = Math.max(1, Number(a.nucleos) || 2), avisos = [];
    var r = { pode: true, motor: 'wasm', threads: a.isolado ? Math.max(1, Math.min(4, Math.floor(nucleos / 2))) : 1, maxMinutos: LIMITES.maxMinutos, pausaMs: LIMITES.pausaCpuMs, placa: placa, motivo: '', avisos: avisos };
    if (a.celular) { r.pode = false; r.motivo = 'No celular a separação é pesada demais: use um computador.'; return r; }
    if (memoria && memoria < LIMITES.minMemoriaGB) { r.pode = false; r.motivo = 'Este aparelho tem pouca memória (' + memoria + ' GB) para separar trilhas com segurança.'; return r; }
    if (placa === 'dedicada') { r.motor = 'webgpu'; r.pausaMs = LIMITES.pausaGpuMs; }
    else {
      if (placa === 'integrada') avisos.push('A placa de vídeo deste computador é integrada (divide a memória e desenha a tela): a separação roda no processador, com metade dos núcleos, para o computador continuar respondendo.');
      if (r.threads === 1) avisos.push('Sem o isolamento de página, o processador trabalha com um núcleo só: fica lento, mas seguro.');
      avisos.push('No processador é lento: a etapa de teste mostra quanto a música inteira vai levar.');
    }
    if (memoria && memoria < 8) { r.maxMinutos = 2; avisos.push('Com ' + memoria + ' GB de memória, o limite é de 2 minutos de música.'); }
    return r;
  }

  /** Quantos trechos, e quanto tempo levaria a música inteira. */
  function estimar(totalAmostras, msPorTrecho, pausaMs) {
    var n = plano(totalAmostras).length;
    return { trechos: n, ms: n * msPorTrecho + Math.max(0, n - 1) * (pausaMs || 0) };
  }

  /** O trecho de TESTE: 7,8 s perto de 1/3 da música (costuma ter todos os instrumentos). */
  function trechoDeTeste(totalAmostras) {
    var ini = Math.max(0, Math.min(totalAmostras - TRECHO, Math.floor(totalAmostras / 3)));
    return { ini: ini, fim: Math.min(totalAmostras, ini + TRECHO) };
  }

  return { LIMITES: LIMITES, aparelho: aparelho, estimar: estimar, trechoDeTeste: trechoDeTeste, TAXA: TAXA, TRECHO: TRECHO, SOBRE: SOBRE, PASSO: PASSO, FONTES: FONTES, MODELO: MODELO, RECEITAS: RECEITAS,
    plano: plano, janela: janela, separar: separar, mixar: mixar, ganhosEfetivos: ganhosEfetivos, wav: wav };
});
