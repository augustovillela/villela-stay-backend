// =====================================================================
// Musique Cifras — MOTOR · áudio. Puro e isomórfico: roda no navegador
// (onde o áudio está) e no Node (onde os testes usam sinal SINTÉTICO).
// Nada aqui abre microfone nem baixa arquivo — recebe números, devolve
// números. É o que permite testar e explicar (mesma régua da avaliação).
//
// Três usos:
//   1. SEGUIR PELO MICROFONE — a cifra já diz qual acorde vem a seguir;
//      o seguidor só confirma pelo som que a banda passou para ele.
//      EXPERIMENTAL: banda alta, bateria e voz atrapalham, e a tela diz.
//   2. TRANSCREVER UMA GRAVAÇÃO — croma por quadro + Viterbi sobre os
//      24 acordes maiores/menores (+ "sem acorde"). Sai RASCUNHO com a
//      confiança de cada trecho; o músico revisa no editor.
//   3. MUDAR O TOM do áudio de referência sem mudar a velocidade —
//      WSOLA (estica o tempo preservando a altura) + reamostragem.
//
// Por que não uma rede neural: exigiria modelo, servidor e custo. Croma +
// Viterbi é o método clássico, explicável, e bom o bastante para
// RASCUNHO de acordes de violão/piano; ruim para mixagem densa — e a
// confiança baixa DIZ isso.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./nota'), require('./acorde'), require('./harmonia'));
  else { var M = raiz.MusiqueMotor = raiz.MusiqueMotor || {}; M.audio = fabrica(M.nota, M.acorde, M.harmonia); }
})(typeof self !== 'undefined' ? self : this, function (N, A, H) {
  'use strict';

  // ---------------------------------------------------------------
  // FFT (radix-2, in place)
  // ---------------------------------------------------------------
  function fft(re, im) {
    var n = re.length, i, j, k;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var a = i + k, b = a + len / 2;
          var xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  var _janelas = {};
  function hann(n) {
    if (_janelas[n]) return _janelas[n];
    var w = new Float32Array(n);
    for (var i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    return (_janelas[n] = w);
  }

  /** Magnitude do espectro de um quadro (tamanho potência de 2). */
  function magnitudes(quadro) {
    var n = quadro.length, w = hann(n);
    var re = new Float64Array(n), im = new Float64Array(n);
    for (var i = 0; i < n; i++) re[i] = quadro[i] * w[i];
    fft(re, im);
    var m = new Float32Array(n / 2);
    for (i = 0; i < n / 2; i++) m[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    return m;
  }

  // ---------------------------------------------------------------
  // Croma: quanto de cada uma das 12 notas há no som
  // ---------------------------------------------------------------
  var _mapas = {};
  function mapaDeBins(nBins, taxa, fftN, fmin, fmax) {
    var chave = [nBins, taxa, fftN, fmin, fmax].join(':');
    if (_mapas[chave]) return _mapas[chave];
    var pcs = new Int8Array(nBins);
    for (var k = 0; k < nBins; k++) {
      var f = k * taxa / fftN;
      pcs[k] = f < fmin || f > fmax ? -1 : N.mod12(Math.round(12 * Math.log(f / 440) / Math.LN2) + 69);
    }
    return (_mapas[chave] = pcs);
  }

  /**
   * Croma normalizada (soma 1) + energia do quadro. `mags` pode vir da
   * nossa FFT ou do AnalyserNode (convertido de dB para linear).
   */
  function croma(mags, taxa, fftN, opcoes) {
    var o = opcoes || {};
    var pcs = mapaDeBins(mags.length, taxa, fftN, o.fmin || 65, o.fmax || 2100);
    var c = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], energia = 0;
    // Piso de ruído do quadro: só PICOS acima dele contam como nota. Ruído
    // (plateia, ar-condicionado, chiado) espalha energia por todos os bins
    // e, somado, parece um acorde com todas as notas.
    var soma = 0, cont = 0;
    for (var q = 1; q < mags.length; q++) if (pcs[q] >= 0) { soma += mags[q]; cont++; }
    var piso = cont ? (soma / cont) * (o.piso || 2.5) : 0;
    for (var k = 1; k < mags.length - 1; k++) {
      if (pcs[k] < 0) continue;
      energia += mags[k] * mags[k];
      var m = mags[k];
      if (m <= piso || m < mags[k - 1] || m < mags[k + 1]) continue;
      // compressão logarítmica: harmônico forte não abafa a terça
      c[pcs[k]] += Math.log(1 + 20 * (m - piso));
    }
    var s = c.reduce(function (a, b) { return a + b; }, 0) || 1;
    return { croma: c.map(function (x) { return x / s; }), energia: Math.sqrt(energia) };
  }

  // ---------------------------------------------------------------
  // Modelos de acorde e semelhança
  // ---------------------------------------------------------------
  function modelo(cifra) {
    var ac = typeof cifra === 'string' ? A.ler(cifra) : cifra;
    if (!ac) return null;
    // Modelo que CONTA OS HARMÔNICOS: cada nota tocada também soa a sua
    // quinta (3º harmônico) e a sua terça maior (5º harmônico). Sem isso o
    // harmônico da terça (mi → si) faz dó maior parecer mi menor — o erro
    // clássico de confundir o acorde com o relativo.
    var v = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    A.notas(ac).forEach(function (pc) {
      var w = pc === ac.raiz.pc ? 1.25 : 1;
      v[pc] += w; v[N.mod12(pc + 7)] += 0.33 * w; v[N.mod12(pc + 4)] += 0.2 * w;
    });
    return v;
  }
  function cosseno(a, b) {
    var ab = 0, aa = 0, bb = 0;
    for (var i = 0; i < 12; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
    return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
  }

  // ---------------------------------------------------------------
  // 1. SEGUIDOR (score following) para o microfone
  // ---------------------------------------------------------------
  /**
   * `acordes` = sequência da cifra na ordem tocada. O seguidor não tenta
   * "adivinhar" o acorde entre 24: compara SÓ o atual com os próximos
   * dois. Avança quando o próximo vence o atual com folga, por alguns
   * quadros seguidos, e com som acima do ruído. Nunca volta sozinho.
   */
  function Seguidor(acordes, opcoes) {
    var o = opcoes || {};
    var mod = (acordes || []).map(function (a) { return modelo(a); });
    var self = {
      indice: 0, confianca: 0, ouvido: '',
      folga: o.folga || 0.03, quadros: o.quadros || 3, piso: o.piso || 0.02,
    };
    var ganhando = 0, candidato = -1, hist = [];
    self.passo = function (c) {
      if (!c || c.energia < self.piso) { ganhando = 0; self.confianca = 0; return { indice: self.indice, avancou: false, silencio: true }; }
      hist.push(c.croma); if (hist.length > 4) hist.shift();
      var media = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      hist.forEach(function (h) { for (var i = 0; i < 12; i++) media[i] += h[i] / hist.length; });
      var atual = mod[self.indice] ? cosseno(media, mod[self.indice]) : 0;
      var melhor = -1, melhorV = atual;
      for (var d = 1; d <= 2 && self.indice + d < mod.length; d++) {
        var v = mod[self.indice + d] ? cosseno(media, mod[self.indice + d]) : 0;
        if (v > melhorV + self.folga) { melhor = self.indice + d; melhorV = v; }
      }
      self.confianca = Math.round(Math.max(atual, melhorV) * 100) / 100;
      if (melhor >= 0) {
        ganhando = candidato === melhor ? ganhando + 1 : 1;
        candidato = melhor;
        if (ganhando >= self.quadros) {
          self.indice = melhor; ganhando = 0; candidato = -1; hist = [];
          self.ouvido = acordes[melhor];
          return { indice: self.indice, avancou: true, confianca: self.confianca };
        }
      } else { ganhando = 0; candidato = -1; }
      return { indice: self.indice, avancou: false, confianca: self.confianca };
    };
    self.irPara = function (i) { self.indice = Math.max(0, Math.min(mod.length - 1, i)); hist = []; ganhando = 0; };
    return self;
  }

  // ---------------------------------------------------------------
  // 2. TRANSCRIÇÃO de uma gravação (rascunho)
  // ---------------------------------------------------------------
  var VOCAB = (function () {
    var out = [];
    for (var pc = 0; pc < 12; pc++) {
      out.push(N.nome(pc) ); out.push(N.nome(pc) + 'm');
    }
    return out;
  })();

  /**
   * Croma de todo o áudio (mono), quadro a quadro. Devolve também a
   * força de ataque (fluxo espectral), usada para o BPM.
   */
  function cromagrama(amostras, taxa, opcoes) {
    var o = opcoes || {};
    var n = o.fft || 4096, salto = o.salto || 2048;
    var quadros = [], fluxo = [], ant = null;
    for (var ini = 0; ini + n <= amostras.length; ini += salto) {
      var m = magnitudes(amostras.subarray ? amostras.subarray(ini, ini + n) : amostras.slice(ini, ini + n));
      quadros.push(croma(m, taxa, n));
      if (ant) { var f = 0; for (var k = 0; k < m.length; k++) { var dlt = m[k] - ant[k]; if (dlt > 0) f += dlt; } fluxo.push(f); } else fluxo.push(0);
      ant = m;
    }
    return { quadros: quadros, fluxo: fluxo, passo_s: salto / taxa };
  }

  /** BPM pela autocorrelação do fluxo espectral (60–180). */
  function estimarBpm(fluxo, passo_s) {
    if (!fluxo || fluxo.length < 40) return { bpm: 0, confianca: 0 };
    var media = fluxo.reduce(function (a, b) { return a + b; }, 0) / fluxo.length;
    var x = fluxo.map(function (v) { return Math.max(0, v - media); });
    var melhor = 0, melhorLag = 0, soma = 0, n = 0;
    var lagMin = Math.max(1, Math.round(60 / 180 / passo_s)), lagMax = Math.round(60 / 60 / passo_s);
    for (var lag = lagMin; lag <= lagMax; lag++) {
      var r = 0;
      for (var i = 0; i + lag < x.length; i++) r += x[i] * x[i + lag];
      soma += r; n++;
      if (r > melhor) { melhor = r; melhorLag = lag; }
    }
    if (!melhorLag) return { bpm: 0, confianca: 0 };
    var bpm = 60 / (melhorLag * passo_s);
    return { bpm: Math.round(bpm), confianca: Math.round(Math.min(1, melhor / (soma / n || 1) / 3) * 100) / 100 };
  }

  /**
   * Viterbi sobre o vocabulário (24 acordes + "N" = sem acorde). A
   * transição favorece FICAR no mesmo acorde — é o que tira o
   * "pisca-pisca" de quadro a quadro.
   */
  function transcrever(crom, opcoes) {
    var o = opcoes || {};
    var vocab = o.vocab || VOCAB;
    var mods = vocab.map(function (c) { return modelo(c); });
    var S = vocab.length + 1;                   // último = sem acorde
    var ficar = Math.log(o.ficar || 0.92), trocar = Math.log((1 - (o.ficar || 0.92)) / (S - 1));
    var beta = o.beta || 14;
    var q = crom.quadros;
    if (!q.length) return { segmentos: [], confianca: 0 };
    var energias = q.map(function (x) { return x.energia; }).sort(function (a, b) { return a - b; });
    // Silêncio = bem abaixo do volume típico da gravação (mediana), não
    // um percentil fixo: música de volume constante não tem "10% mais baixo".
    var piso = energias[Math.floor(energias.length / 2)] * 0.08 + 1e-9;
    var emis = function (t, s) {
      if (s === S - 1) return q[t].energia < piso ? 0 : -beta * 0.35;
      return q[t].energia < piso ? -beta : beta * (cosseno(q[t].croma, mods[s]) - 1);
    };
    var dp = new Float64Array(S), volta = [];
    for (var s = 0; s < S; s++) dp[s] = emis(0, s);
    for (var t = 1; t < q.length; t++) {
      var nd = new Float64Array(S), ptr = new Int16Array(S);
      var melhorAnt = 0;
      for (s = 1; s < S; s++) if (dp[s] > dp[melhorAnt]) melhorAnt = s;
      for (s = 0; s < S; s++) {
        var vFicar = dp[s] + ficar, vTrocar = dp[melhorAnt] + trocar;
        if (vFicar >= vTrocar) { nd[s] = vFicar; ptr[s] = s; } else { nd[s] = vTrocar; ptr[s] = melhorAnt; }
        nd[s] += emis(t, s);
      }
      volta.push(ptr); dp = nd;
    }
    var fim = 0; for (s = 1; s < S; s++) if (dp[s] > dp[fim]) fim = s;
    var caminho = new Int16Array(q.length); caminho[q.length - 1] = fim;
    for (t = q.length - 1; t > 0; t--) caminho[t - 1] = volta[t - 1][caminho[t]];
    // segmentos, com a confiança média (semelhança) de cada um
    var segs = [], ini = 0;
    for (t = 1; t <= q.length; t++) {
      if (t === q.length || caminho[t] !== caminho[ini]) {
        var st = caminho[ini];
        var sim = 0;
        for (var z = ini; z < t; z++) sim += st === S - 1 ? 0 : cosseno(q[z].croma, mods[st]);
        segs.push({ inicio_s: +(ini * crom.passo_s).toFixed(2), fim_s: +(t * crom.passo_s).toFixed(2),
          acorde: st === S - 1 ? '' : vocab[st], confianca: st === S - 1 ? 0 : Math.round(sim / (t - ini) * 100) / 100 });
        ini = t;
      }
    }
    // trecho curto demais é tremida: funde no vizinho
    var minimo = o.minimo_s || 0.45;
    var limpos = [];
    segs.forEach(function (sg) {
      var ult = limpos[limpos.length - 1];
      if (ult && (sg.fim_s - sg.inicio_s < minimo || sg.acorde === ult.acorde)) { ult.fim_s = sg.fim_s; return; }
      limpos.push(Object.assign({}, sg));
    });
    var comAcorde = limpos.filter(function (x) { return x.acorde; });
    var dur = comAcorde.reduce(function (a, x) { return a + (x.fim_s - x.inicio_s); }, 0) || 1;
    var conf = comAcorde.reduce(function (a, x) { return a + x.confianca * (x.fim_s - x.inicio_s); }, 0) / dur;
    return { segmentos: limpos, confianca: Math.round(conf * 100) / 100 };
  }

  function mmss(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  /**
   * Rascunho de cifra (ChordPro) a partir dos segmentos: uma linha de
   * acordes a cada ~4 trocas, com o tempo de início de cada linha como
   * instrução — é o que alinha a cifra ao áudio depois.
   */
  function paraChordPro(res, meta) {
    var m = meta || {};
    var segs = res.segmentos.filter(function (x) { return x.acorde; });
    var tons = H.detectarTom(segs.map(function (x) { return x.acorde; }));
    var out = [];
    if (m.titulo) out.push('{title: ' + m.titulo + '}');
    if (m.artista) out.push('{artist: ' + m.artista + '}');
    if (tons[0]) out.push('{key: ' + tons[0].nome + '}');
    if (m.bpm) out.push('{tempo: ' + m.bpm + '}');
    out.push('{comment: Rascunho gerado pelo áudio — confiança ' + Math.round((res.confianca || 0) * 100) + '%. Confira acorde por acorde.}');
    out.push('');
    for (var i = 0; i < segs.length; i += 4) {
      var grupo = segs.slice(i, i + 4);
      out.push('{ci: ' + mmss(grupo[0].inicio_s) + '}');
      out.push(grupo.map(function (g) { return '[' + g.acorde + ']' + (g.confianca < 0.75 ? '?' : '') + '     '; }).join('').replace(/\s+$/, ''));
    }
    return { chordpro: out.join('\n'), tom: tons[0] || null };
  }

  // ---------------------------------------------------------------
  // 3. MUDAR O TOM sem mudar a velocidade (WSOLA + reamostragem)
  // ---------------------------------------------------------------
  /**
   * Estica o tempo por `fator` (>1 = mais longo) preservando a altura.
   * WSOLA: cada quadro de saída é o trecho de entrada, perto da posição
   * nominal, que MAIS se parece com a continuação natural do anterior —
   * é o que evita o "chiado de engrenagem" do corta-e-cola cego.
   * `aoProgresso(0..1)` permite ao navegador não congelar (em fatias).
   */
  function esticar(entrada, fator, opcoes) {
    var o = opcoes || {};
    var N0 = o.quadro || 2048, salto = N0 / 2, busca = o.busca || 384, passoBusca = o.passo || 3;
    var w = hann(N0);
    var nSaida = Math.floor(entrada.length * fator);
    var saida = new Float32Array(nSaida + N0), peso = new Float32Array(nSaida + N0);
    var posEntradaAnt = 0;
    for (var posSaida = 0; posSaida < nSaida; posSaida += salto) {
      var nominal = Math.round(posSaida / fator);
      var melhor = nominal;
      if (posSaida > 0) {
        // o que o quadro anterior "pediria" para continuar
        var alvo = posEntradaAnt + salto, melhorC = -Infinity;
        for (var d = -busca; d <= busca; d += passoBusca) {
          var p = nominal + d;
          if (p < 0 || p + N0 >= entrada.length) continue;
          var cc = 0;
          for (var k = 0; k < salto; k += 4) cc += entrada[p + k] * entrada[alvo + k] || 0;
          if (cc > melhorC) { melhorC = cc; melhor = p; }
        }
      }
      if (melhor + N0 >= entrada.length) break;
      for (var i = 0; i < N0; i++) { saida[posSaida + i] += entrada[melhor + i] * w[i]; peso[posSaida + i] += w[i]; }
      posEntradaAnt = melhor;
      if (o.aoProgresso && (posSaida / salto) % 200 === 0) o.aoProgresso(posSaida / nSaida);
    }
    for (var j = 0; j < nSaida; j++) saida[j] = peso[j] > 1e-3 ? saida[j] / peso[j] : 0;
    return saida.subarray(0, nSaida);
  }

  /** Reamostra linearmente para `n` amostras. */
  function reamostrar(x, n) {
    var y = new Float32Array(n), r = (x.length - 1) / Math.max(1, n - 1);
    for (var i = 0; i < n; i++) { var p = i * r, a = Math.floor(p), f = p - a; y[i] = x[a] * (1 - f) + (x[Math.min(x.length - 1, a + 1)] || 0) * f; }
    return y;
  }

  /**
   * Muda a ALTURA em `semitons` mantendo a DURAÇÃO: estica o tempo pelo
   * fator e reamostra de volta ao tamanho original.
   */
  function mudarTom(amostras, semitons, opcoes) {
    var s = Math.max(-12, Math.min(12, Number(semitons) || 0));
    if (!s) return amostras;
    var fator = Math.pow(2, s / 12);
    var esticado = esticar(amostras, fator, opcoes);
    return reamostrar(esticado, amostras.length);
  }

  /** Frequência dominante (para teste e para conferência): pico da FFT. */
  function frequenciaDominante(amostras, taxa) {
    var n = 1; while (n * 2 <= Math.min(amostras.length, 65536)) n *= 2;
    var m = magnitudes(amostras.subarray ? amostras.subarray(0, n) : amostras.slice(0, n));
    var k = 1; for (var i = 2; i < m.length; i++) if (m[i] > m[k]) k = i;
    var y0 = m[k - 1] || 0, y1 = m[k], y2 = m[k + 1] || 0;
    var ajuste = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
    return (k + ajuste) * taxa / n;
  }

  // ---------------------------------------------------------------
  // 5. ALINHAR a cifra a uma gravação (karaokê / Smart Play)
  // ---------------------------------------------------------------
  /**
   * Em que momento da gravação começa cada acorde da cifra? Programação
   * dinâmica da esquerda para a direita (a música só anda para frente):
   * em cada quadro o estado FICA no acorde atual, AVANÇA um (troca normal)
   * ou pula um (acorde escrito que a gravação não tocou), com custo. A
   * pontuação de cada quadro é a semelhança entre o croma ouvido e o
   * modelo do acorde — o mesmo modelo harmônico da transcrição. Silêncio
   * pontua neutro: não puxa nem empurra.
   *
   * Entrada: `quadros` do cromagrama e a sequência de acordes na ordem da
   * cifra. Saída: o quadro/segundo de início de cada acorde e a confiança
   * (média da semelhança no caminho escolhido). É ESTIMATIVA — a tela
   * deixa corrigir marcando à mão.
   */
  function alinhar(crom, acordes, opcoes) {
    var o = opcoes || {};
    var quadros = crom.quadros || crom, passo = crom.passo_s || o.passo_s || 0;
    var mods = (acordes || []).map(function (a) { return modelo(a); });
    var S = mods.length, T = quadros.length;
    if (!S || !T) return { inicios_s: [], inicios: [], confianca: 0 };
    var piso = o.piso || 0.02, custo1 = o.custoAvancar || 0.04, custo2 = o.custoPular || 0.6;
    var emite = function (t, s) {
      var q = quadros[t];
      if (!q || q.energia < piso || !mods[s]) return 0.5;
      return cosseno(q.croma, mods[s]);
    };
    var NEG = -1e12;
    var prev = new Float64Array(S), cur = new Float64Array(S);
    for (var s0 = 0; s0 < S; s0++) prev[s0] = NEG;
    prev[0] = emite(0, 0);
    var volta = new Uint8Array(T * S);        // 0 = ficou, 1 = avançou um, 2 = pulou um
    for (var t = 1; t < T; t++) {
      for (var s = 0; s < S; s++) {
        var melhor = prev[s], de = 0;
        if (s >= 1 && prev[s - 1] - custo1 > melhor) { melhor = prev[s - 1] - custo1; de = 1; }
        if (s >= 2 && prev[s - 2] - custo2 > melhor) { melhor = prev[s - 2] - custo2; de = 2; }
        cur[s] = melhor <= NEG / 2 ? NEG : melhor + emite(t, s);
        volta[t * S + s] = de;
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    // Termina no último acorde (a gravação pode seguir num final sem cifra: ele absorve).
    var fim = S - 1;
    if (prev[fim] <= NEG / 2) { fim = 0; for (var k = 1; k < S; k++) if (prev[k] > prev[fim]) fim = k; }
    var estados = new Int32Array(T), st = fim, soma = 0;
    for (var t2 = T - 1; t2 >= 0; t2--) {
      estados[t2] = st; soma += emite(t2, st);
      if (t2 > 0) st -= volta[t2 * S + st];
    }
    var inicios = []; for (var i = 0; i < S; i++) inicios.push(-1);
    for (var t3 = T - 1; t3 >= 0; t3--) inicios[estados[t3]] = t3;
    // Acorde pulado herda o início do seguinte (fica sem duração, mas em ordem).
    for (var j = S - 2; j >= 0; j--) if (inicios[j] < 0) inicios[j] = inicios[j + 1] >= 0 ? inicios[j + 1] : T - 1;
    if (inicios[S - 1] < 0) inicios[S - 1] = T - 1;
    // O acorde começa no primeiro SOM do seu trecho: silêncio da introdução
    // (ou uma pausa) não pode antecipar o destaque da linha.
    for (var a = 0; a < S; a++) {
      var ate = a + 1 < S ? inicios[a + 1] : T;
      var q0 = inicios[a];
      while (q0 < ate - 1 && quadros[q0] && quadros[q0].energia < piso) q0++;
      inicios[a] = q0;
    }
    return {
      inicios: inicios,
      inicios_s: inicios.map(function (q) { return Math.round(q * passo * 100) / 100; }),
      confianca: Math.round((soma / T) * 100) / 100,
    };
  }

  return {
    alinhar: alinhar,
    fft: fft, magnitudes: magnitudes, croma: croma, modelo: modelo, cosseno: cosseno,
    Seguidor: Seguidor, cromagrama: cromagrama, estimarBpm: estimarBpm, transcrever: transcrever, paraChordPro: paraChordPro,
    esticar: esticar, reamostrar: reamostrar, mudarTom: mudarTom, frequenciaDominante: frequenciaDominante, VOCAB: VOCAB,
  };
});
