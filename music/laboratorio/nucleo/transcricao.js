// =====================================================================
// Musique · Laboratório — NÚCLEO · TRANSCRIÇÃO de áudio (29/09/2026).
//
// Lê uma gravação e devolve: tom provável, andamento, batidas, acordes
// por compasso e a linha de melodia predominante. PURO e determinístico:
// roda igual no navegador (arquivo do aluno ou escuta ao vivo) e no teste
// (sinais sintéticos com a resposta conhecida).
//
// Nada aqui é "IA": é processamento de sinal clássico, explicável —
//   · espectro por FFT (janela de Hann);
//   · CROMA (energia das 12 classes de altura) e croma do GRAVE (raiz);
//   · acorde = molde mais parecido (cosseno) + raiz no grave, suavizado
//     por Viterbi (trocar de acorde custa; ficar é de graça);
//   · tom = perfis de Krumhansl–Kessler sobre o croma da música inteira;
//   · batidas = fluxo espectral + programação dinâmica (Ellis 2007);
//   · melodia = saliência harmônica (soma dos harmônicos de cada nota
//     candidata), só onde há voz/instrumento predominante.
//
// ⚠️ É INDICAÇÃO DE ESTUDO (Q5 do Musique): polifonia nunca vale nota. A
// harmonia costuma sair boa em música popular; a melodia numa gravação
// com banda inteira é APROXIMADA — a tela diz isso. O áudio nunca sai do
// aparelho: a análise é local.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'), require('./acordes'), require('./escalas'));
  else { var L = raiz.MusiqueLab = raiz.MusiqueLab || {}; L.transcricao = fabrica(L.notas, L.acordes, L.escalas); }
})(typeof self !== 'undefined' ? self : this, function (N, A, E) {
  'use strict';

  // ------------------------------------------------------------ FFT
  function fft(re, im) {
    var n = re.length, i, j, k, len, t;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), meio = len >> 1;
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < meio; k++) {
          var a = i + k, b = a + meio;
          var xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  function pot2(x) { var p = 1; while (p * 1.5 < x) p <<= 1; return p; }   // potência de 2 MAIS PRÓXIMA
  var MIDI = function (f) { return 69 + 12 * Math.log(f / 440) / Math.LN2; };
  var FREQ = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  var MEL_MIN = 52, MEL_MAX = 88;   // mi3 a mi6: onde mora a melodia (voz e solistas)

  /**
   * Prepara o analisador para uma taxa de amostragem. `n` ≈ 186 ms (4096
   * a 22 050 Hz): resolução de ~5 Hz, o bastante para separar dó2 de dó♯2.
   */
  function criar(taxa, opcoes) {
    var o = opcoes || {};
    var n = o.n || pot2(0.15 * taxa), hop = o.hop || n / 4;   // 4096 a 22 050 Hz, 8192 a 44,1/48 kHz
    var janela = new Float32Array(n), re = new Float64Array(n), im = new Float64Array(n), mag = new Float64Array(n / 2 + 1);
    for (var i = 0; i < n; i++) janela[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    // tabela bin → classe de altura (e peso pela proximidade do centro do semitom)
    var binPc = new Int8Array(n / 2 + 1).fill(-1);   // -1 = fora da faixa do croma
    for (var k = 1; k <= n / 2; k++) {
      var f = k * taxa / n;
      if (f < 50 || f > 2100) continue;
      var m = MIDI(f), r = Math.round(m), dv = m - r;
      binPc[k] = ((r % 12) + 12) % 12;
    }
    // melodia: bins de cada harmônico de cada nota candidata
    var cand = [];
    for (var mm = MEL_MIN; mm <= MEL_MAX; mm++) {
      var hs = [];
      for (var h = 1; h <= 6; h++) { var fb = FREQ(mm) * h * n / taxa; if (fb < n / 2 - 1) hs.push([Math.round(fb), Math.pow(0.84, h - 1)]); }
      cand.push({ midi: mm, hs: hs });
    }
    // ataques: janela CURTA (~46 ms) no centro do quadro — a longa borra o
    // ataque e deixa os tempos fracos quase invisíveis
    var nc = pot2(0.046 * taxa), jc = new Float32Array(nc), rc = new Float64Array(nc), ic = new Float64Array(nc);
    for (i = 0; i < nc; i++) jc[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (nc - 1));
    var anteriorLog = null;

    /** Um quadro: `amostras` (≥ n valores a partir de `inicio`). */
    function quadro(amostras, inicio) {
      var i0 = inicio || 0, e = 0, i;
      for (i = 0; i < n; i++) { var v = amostras[i0 + i] || 0; e += v * v; re[i] = v * janela[i]; im[i] = 0; }
      fft(re, im);
      for (i = 0; i <= n / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      var croma = new Float32Array(12), grave = new Float32Array(12), fluxo = 0, lg = new Float32Array(nc / 2 + 1);
      var c0 = i0 + n / 2 - nc / 2;
      for (i = 0; i < nc; i++) { rc[i] = (amostras[c0 + i] || 0) * jc[i]; ic[i] = 0; }
      fft(rc, ic);
      for (i = 1; i <= nc / 2; i++) {
        lg[i] = Math.log(1 + 100 * Math.sqrt(rc[i] * rc[i] + ic[i] * ic[i]));
        if (anteriorLog) { var dfl = lg[i] - anteriorLog[i]; if (dfl > 0) fluxo += dfl; }
      }
      // croma por PICOS com interpolação parabólica: nos graves a distância
      // entre semitons (~4 Hz no dó2) é menor que o bin (~5–6 Hz), e somar
      // todos os bins espalhava o baixo para os semitons vizinhos (o dó2
      // 'virava' si♭ e o C, C7). Cada pico conta uma vez, na frequência dele.
      for (i = 2; i < n / 2; i++) {
        if (binPc[i] < 0 || mag[i] <= mag[i - 1] || mag[i] < mag[i + 1]) continue;
        var la = Math.log(mag[i - 1] + 1e-12), lb = Math.log(mag[i] + 1e-12), lc = Math.log(mag[i + 1] + 1e-12);
        var den = la - 2 * lb + lc, p = den ? 0.5 * (la - lc) / den : 0;
        var fp = (i + p) * taxa / n, mp = MIDI(fp), rp = Math.round(mp), dvp = mp - rp;
        var c = Math.exp(lb - 0.25 * (la - lc) * p) * Math.pow(Math.cos(Math.PI * dvp), 2), pcp = ((rp % 12) + 12) % 12;
        croma[pcp] += c; if (fp < 220) grave[pcp] += c;
      }
      anteriorLog = lg;
      // melodia: nota candidata com maior soma de harmônicos
      var melhor = -1, melhorS = 0, soma = 0, segundo = 0;
      for (var q = 0; q < cand.length; q++) {
        var s = 0, hs = cand[q].hs;
        for (var z = 0; z < hs.length; z++) { var b = hs[z][0]; s += hs[z][1] * Math.max(mag[b - 1] || 0, mag[b], mag[b + 1] || 0); }
        soma += s;
        if (s > melhorS) { segundo = melhorS; melhorS = s; melhor = cand[q].midi; } else if (s > segundo) segundo = s;
      }
      var media = soma / cand.length;
      return { energia: Math.sqrt(e / n), croma: croma, grave: grave, fluxo: fluxo, mel: melhor, melS: melhorS, melConf: melhorS > 0 ? (melhorS - media) / melhorS : 0 };
    }
    function reiniciar() { anteriorLog = null; }
    return { n: n, hop: hop, taxa: taxa, quadro: quadro, reiniciar: reiniciar };
  }

  // ------------------------------------------------------- utilidades
  function mediana(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }
  function normaliza(v) { var s = 0, i; for (i = 0; i < v.length; i++) s += v[i] * v[i]; s = Math.sqrt(s) || 1; var o = new Float32Array(v.length); for (i = 0; i < v.length; i++) o[i] = v[i] / s; return o; }
  function mod12(x) { return ((x % 12) + 12) % 12; }

  // ------------------------------------------------------------ tom
  // Perfis de Krumhansl–Kessler (1982): quanto cada grau "pertence" ao tom.
  var KK_MAIOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var KK_MENOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function correl(a, b) {
    var ma = 0, mb = 0, i; for (i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; } ma /= 12; mb /= 12;
    var s = 0, sa = 0, sb = 0; for (i = 0; i < 12; i++) { var x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; }
    return s / (Math.sqrt(sa * sb) || 1);
  }
  function tomDoCroma(croma) {
    var res = [];
    for (var t = 0; t < 12; t++) {
      var rot = []; for (var i = 0; i < 12; i++) rot.push(croma[mod12(i + t)]);
      res.push({ pc: t, modo: 'maior', r: correl(rot, KK_MAIOR) }, { pc: t, modo: 'menor', r: correl(rot, KK_MENOR) });
    }
    res.sort(function (a, b) { return b.r - a.r; });
    return { pc: res[0].pc, modo: res[0].modo, r: res[0].r, margem: res[0].r - res[1].r, alternativa: { pc: res[1].pc, modo: res[1].modo } };
  }
  // grafia dos tons usuais (sem 6 acidentes quando há opção mais simples)
  var TONICA_MAIOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var TONICA_MENOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  function tonicaGrafada(pc, modo) { return N.ler((modo === 'menor' ? TONICA_MENOR : TONICA_MAIOR)[mod12(pc)]); }
  /** pc → nota grafada no tom (fá♯ em sol maior; si♭ em fá maior). */
  function grafiaDoTom(pc, modo) {
    var t = tonicaGrafada(pc, modo), g = {};
    var add = function (id) { (E.notas(t, id) || []).forEach(function (x) { var k = N.pc(x); if (!g[k]) g[k] = N.semOitava(x); }); };
    add(modo === 'menor' ? 'menor-natural' : 'maior'); if (modo === 'menor') add('menor-harmonica');
    // fora da escala: tom com bemóis na armadura grafa com bemol; os outros, com sustenido
    var relMaior = modo === 'menor' ? N.ler(TONICA_MAIOR[mod12(pc + 3)]) : t;
    var bemol = ['F', 'Bb', 'Eb', 'Ab', 'Db'].indexOf(N.nome(relMaior)) >= 0;
    for (var k = 0; k < 12; k++) if (!g[k]) g[k] = N.deClasse(k, { bemol: bemol });
    return g;
  }

  // --------------------------------------------------------- acordes
  var TIPOS = [
    { id: 'maior', iv: [0, 4, 7], peso: 1 },
    { id: 'menor', iv: [0, 3, 7], peso: 1 },
    { id: '7', iv: [0, 4, 7, 10], peso: 0.985 },
    { id: 'm7', iv: [0, 3, 7, 10], peso: 0.985 },
    { id: '7M', iv: [0, 4, 7, 11], peso: 0.96 },   // o 3º harmônico da terça cai na 7ª maior: sem desconto, toda tríade maior viraria 7M
    { id: 'dim', iv: [0, 3, 6], peso: 0.96 },
    { id: 'sus4', iv: [0, 5, 7], peso: 0.955 },
  ];
  var MOLDES = [];
  for (var r0 = 0; r0 < 12; r0++) TIPOS.forEach(function (tp) {
    var v = new Float32Array(12); tp.iv.forEach(function (x, j) { v[mod12(r0 + x)] = j === 0 ? 1.15 : (x === 10 || x === 11 ? 0.8 : 1); });
    MOLDES.push({ raiz: r0, id: tp.id, peso: tp.peso, v: normaliza(v), setima: tp.iv.length === 4 ? mod12(r0 + tp.iv[3]) : -1, triade: tp.iv.slice(0, 3).map(function (x) { return mod12(r0 + x); }) });
  });

  /** Nota de cada molde para um croma (+ bônus quando a raiz está no grave). */
  function pontuar(croma, grave) {
    var c = normaliza(croma), gmax = 0, i;
    for (i = 0; i < 12; i++) gmax = Math.max(gmax, grave[i]);
    return MOLDES.map(function (m) {
      var s = 0; for (i = 0; i < 12; i++) s += c[i] * m.v[i];
      var bonus = gmax > 0 ? 0.12 * grave[m.raiz] / gmax : 0;
      // a 7ª só vale se tiver energia PRÓPRIA: o 7º harmônico de qualquer
      // nota (metais, cordas, dente de serra) cai na 7ª menor da fundamental,
      // e o 3º harmônico da terça, na 7ª maior — sem isso, todo C vira C7
      var fator = 1;
      if (m.setima >= 0) { var tri = (c[m.triade[0]] + c[m.triade[1]] + c[m.triade[2]]) / 3; fator = Math.max(0.97, Math.min(1, 0.97 + 0.03 * (c[m.setima] / (tri || 1)) / 0.25)); }
      return (s + bonus) * m.peso * fator;
    });
  }

  /**
   * Viterbi sobre as batidas: estado = molde (ou "sem acorde"). Mudar de
   * acorde custa `troca`; acorde do tom ganha um pouco (`diatonico`).
   */
  function viterbi(pontos, silencio, o) {
    var S = MOLDES.length, T = pontos.length, troca = o.troca == null ? 0.1 : o.troca;
    if (!T) return [];
    var bonusTom = MOLDES.map(function (m) { return o.diatonicos && o.diatonicos[m.raiz + ':' + m.id] ? (o.diatonico || 0.03) : 0; });
    var ant = new Float64Array(S + 1), atu = new Float64Array(S + 1), de = [];
    function emis(t, s) { return s === S ? (silencio[t] ? 1 : 0.2) : (silencio[t] ? 0 : pontos[t][s] + bonusTom[s]); }
    for (var s = 0; s <= S; s++) ant[s] = emis(0, s);
    for (var t = 1; t < T; t++) {
      var melhorI = 0; for (s = 1; s <= S; s++) if (ant[s] > ant[melhorI]) melhorI = s;
      var bt = new Int16Array(S + 1);
      for (s = 0; s <= S; s++) {
        var fica = ant[s], muda = ant[melhorI] - troca;
        if (fica >= muda) { atu[s] = fica + emis(t, s); bt[s] = s; } else { atu[s] = muda + emis(t, s); bt[s] = melhorI; }
      }
      de.push(bt); var tmp = ant; ant = atu; atu = tmp;
    }
    var fim = 0; for (s = 1; s <= S; s++) if (ant[s] > ant[fim]) fim = s;
    var cam = [fim];
    for (t = de.length - 1; t >= 0; t--) { fim = de[t][fim]; cam.unshift(fim); }
    return cam.map(function (x) { return x === S ? null : MOLDES[x]; });
  }

  // --------------------------------------------------------- batidas
  /**
   * Batidas por programação dinâmica (Ellis 2007): cada batida recebe a
   * força do ataque mais a melhor batida anterior a ~1 período dela.
   */
  function batidas(fluxo, dt, o) {
    var T = fluxo.length; if (T < 8) return { bpm: 0, batidas: [] };
    // envelope de ataque: tira a média local (1 s) e fica só com o que sobe
    var w = Math.max(1, Math.round(0.5 / dt)), env = new Float64Array(T), i;
    for (i = 0; i < T; i++) { var s = 0, c = 0; for (var j = Math.max(0, i - w); j <= Math.min(T - 1, i + w); j++) { s += fluxo[j]; c++; } env[i] = Math.max(0, fluxo[i] - s / c); }
    var dp = 0; for (i = 0; i < T; i++) dp += env[i] * env[i]; dp = Math.sqrt(dp / T) || 1;
    for (i = 0; i < T; i++) env[i] /= dp;
    // andamento: autocorrelação com lag fracionário, preferência suave por ~110 BPM
    var bpmMin = (o && o.bpmMin) || 60, bpmMax = (o && o.bpmMax) || 180, melhor = null;
    var interp = function (x) { var a = Math.floor(x), f = x - a; return a + 1 < T ? env[a] * (1 - f) + env[a + 1] * f : 0; };
    var acf = function (bpm) {
      var L = 60 / bpm / dt, sc = 0, nt = 0;
      for (var i2 = 0; i2 + 2 * L < T; i2++) { sc += env[i2] * (interp(i2 + L) + 0.5 * interp(i2 + 2 * L)); nt++; }
      return sc / (nt || 1);   // média, não soma: lag longo tem menos termos e perderia sempre
    };
    for (var bpm = bpmMin; bpm <= bpmMax; bpm += 0.5) {
      var sc = acf(bpm) * Math.exp(-0.5 * Math.pow(Math.log(bpm / 110) / Math.LN2 / 1.2, 2));
      if (!melhor || sc > melhor.sc) melhor = { bpm: bpm, sc: sc };
    }
    // erro de oitava do andamento: se o DOBRO também tem ataque em quase
    // todo tempo, o pulso real é o dobro (128 não vira 64). No contratempo
    // de verdade não há ataque, e o dobro fica bem abaixo.
    var bruto = acf(melhor.bpm);
    for (var d2 = -1; d2 <= 1; d2 += 0.5) { var cand2 = melhor.bpm * 2 + d2; if (cand2 <= bpmMax + 20 && acf(cand2) >= 0.42 * bruto) { melhor = { bpm: cand2, sc: acf(cand2) }; break; } }
    var P = 60 / melhor.bpm / dt, alfa = (o && o.alfa) || 100;
    var C = new Float64Array(T), prev = new Int32Array(T).fill(-1);
    for (i = 0; i < T; i++) {
      var ini = Math.max(0, Math.round(i - 2 * P)), fim = Math.round(i - P / 2), m = 0, mi = -1;
      for (var k = ini; k <= fim; k++) {
        var pen = Math.log((i - k) / P); var v = C[k] - alfa * pen * pen;
        if (mi < 0 || v > m) { m = v; mi = k; }
      }
      C[i] = env[i] + (mi >= 0 ? Math.max(0, m) : 0); prev[i] = mi >= 0 && m > 0 ? mi : -1;
    }
    // termina na melhor batida do último período e volta
    var ult = T - 1; for (i = Math.max(0, Math.round(T - P)); i < T; i++) if (C[i] > C[ult]) ult = i;
    var bs = [ult]; while (prev[bs[0]] >= 0) bs.unshift(prev[bs[0]]);
    // completa para trás e para frente pelo período (introdução sem ataque)
    while (bs[0] - P >= -P * 0.5) bs.unshift(Math.max(0, Math.round(bs[0] - P)));
    if (bs.length > 1 && bs[0] === bs[1]) bs.shift();
    while (bs[bs.length - 1] + P < T) bs.push(Math.round(bs[bs.length - 1] + P));
    // andamento final = mediana dos intervalos
    // andamento final = inclinação da reta (batida nº × quadro): usa TODAS as
    // batidas, sem o degrau de 1 quadro que a mediana dos intervalos teria
    var nB = bs.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (i = 0; i < nB; i++) { sx += i; sy += bs[i]; sxx += i * i; sxy += i * bs[i]; }
    var incl = nB > 1 ? (nB * sxy - sx * sy) / (nB * sxx - sx * sx) : P;
    return { bpm: Math.round(60 / (incl * dt) * 2) / 2, batidas: bs };
  }

  // ------------------------------------------------------- melodia
  function melodia(quadros, dt, o) {
    var en = quadros.map(function (q) { return q.energia; }), limiar = mediana(en) * 0.25;
    var conf = (o && o.melConf) || 0.55;
    var bruto = quadros.map(function (q) { return q.energia > limiar && q.melConf >= conf ? q.mel : 0; });
    // mediana de 5 quadros (tira os saltos isolados)
    var suave = bruto.map(function (v, i) { var w = bruto.slice(Math.max(0, i - 2), i + 3).filter(Boolean); return w.length >= 3 ? mediana(w) : 0; });
    var notas = [], ini = -1, atual = 0;
    function fecha(fim) { if (atual && fim - ini >= 3) notas.push({ t: ini * dt, dur: (fim - ini) * dt, midi: atual }); }
    for (var i = 0; i <= suave.length; i++) {
      var v = i < suave.length ? suave[i] : 0;
      if (v !== atual) { fecha(i); ini = i; atual = v; }
    }
    // oitava do detector: salto > 9 semitons para nota curta vira a oitava mais próxima da vizinha
    for (i = 1; i < notas.length; i++) {
      var d = notas[i].midi - notas[i - 1].midi;
      if (Math.abs(d) > 9 && notas[i].dur < 0.4) { var alt = notas[i].midi - 12 * Math.round(d / 12); if (alt >= MEL_MIN - 12 && alt <= MEL_MAX) notas[i].midi = alt; }
    }
    return notas;
  }

  /**
   * Do conjunto de quadros ao resultado. o: { taxa, hop, compasso (3|4),
   * troca }. Devolve tom, bpm, batidas (s), acordes por compasso e melodia.
   */
  function analisar(quadros, o) {
    var dt = o.hop / o.taxa, compasso = o.compasso === 3 ? 3 : 4;
    // o quadro i descreve o som em torno do CENTRO da janela: i·dt + n/2
    var t0 = (o.n || o.hop * 4) / 2 / o.taxa;
    var energias = quadros.map(function (q) { return q.energia; }), emed = mediana(energias);
    // tom (croma de toda a música, cada quadro com peso igual)
    var total = new Float32Array(12);
    quadros.forEach(function (q) { if (q.energia > emed * 0.1) { var c = normaliza(q.croma); for (var i = 0; i < 12; i++) total[i] += c[i]; } });
    var tom = tomDoCroma(total);
    var g = grafiaDoTom(tom.pc, tom.modo);
    var tonica = tonicaGrafada(tom.pc, tom.modo);
    // batidas
    var bt = batidas(quadros.map(function (q) { return q.fluxo; }), dt, o);
    var bs = bt.batidas.length ? bt.batidas : [0];
    // croma e grave por batida
    var pontos = [], silencio = [], i;
    for (var b = 0; b < bs.length; b++) {
      var de = bs[b], ate = b + 1 < bs.length ? bs[b + 1] : Math.min(quadros.length, de + (bs[1] - bs[0] || 10));
      var cr = new Float32Array(12), gr = new Float32Array(12), e = 0, n = 0;
      for (i = de; i < ate && i < quadros.length; i++) { for (var k = 0; k < 12; k++) { cr[k] += quadros[i].croma[k]; gr[k] += quadros[i].grave[k]; } e += quadros[i].energia; n++; }
      silencio.push(!n || e / n < emed * 0.08);
      pontos.push(pontuar(cr, gr));
    }
    // acordes do campo harmônico ganham um pouco
    var diat = {};
    var escala = E.notas(tonica, tom.modo === 'menor' ? 'menor-harmonica' : 'maior') || [];
    var TRI = tom.modo === 'menor' ? ['menor', 'dim', 'maior', 'menor', 'maior', 'maior', 'dim'] : ['maior', 'menor', 'menor', 'maior', 'maior', 'menor', 'dim'];
    escala.forEach(function (x, j) { var p = N.pc(x); diat[p + ':' + TRI[j]] = 1; if (TRI[j] === 'maior' && j === 4) diat[p + ':7'] = 1; });
    if (tom.modo === 'menor') diat[N.pc(escala[2] || tonica) + ':maior'] = 1;
    var cam = viterbi(pontos, silencio, { troca: o.troca, diatonicos: diat });
    var simb = function (m) { if (!m) return null; var f = g[m.raiz]; return { simbolo: A.simbolo(f, m.id), fundamental: N.nome(f, { oitava: false }), id: m.id, raiz: m.raiz }; };
    var porBatida = cam.map(simb);
    // cabeça do compasso: a fase em que mais trocas de acorde caem no 1º tempo
    var melhorF = 0, melhorC = -1;
    for (var f = 0; f < compasso; f++) {
      var cnt = 0; for (b = 1; b < porBatida.length; b++) if ((b - f) % compasso === 0 && chave(porBatida[b]) !== chave(porBatida[b - 1])) cnt++;
      if (cnt > melhorC) { melhorC = cnt; melhorF = f; }
    }
    var compassos = [];
    var vazio = function (c) { return c.acordes.every(function (a) { return !a.acorde; }); };
    for (b = melhorF - compasso; b < porBatida.length; b += compasso) {
      var acs = [];
      for (var j = 0; j < compasso; j++) {
        var x = b + j; if (x < 0 || x >= porBatida.length) continue;
        var s = porBatida[x], ul = acs[acs.length - 1];
        if (ul && chave(ul.acorde) === chave(s)) ul.tempos++; else acs.push({ acorde: s, tempos: 1 });
      }
      // mesma raiz, tríade e a sua tétrade no mesmo compasso (a 7ª só soa
      // quando a melodia passa por ela): a cifra escreve o compasso inteiro
      // com a 7ª — é o acorde do compasso
      for (var z = acs.length - 1; z > 0; z--) {
        var ea = acs[z - 1].acorde, eb = acs[z].acorde;
        if (ea && eb && ea.raiz === eb.raiz && (EXTENDE[ea.id] === eb.id || EXTENDE[eb.id] === ea.id)) {
          var fica = EXTENDE[ea.id] === eb.id ? eb : ea;
          acs[z - 1] = { acorde: fica, tempos: acs[z - 1].tempos + acs[z].tempos }; acs.splice(z, 1);
        }
      }
      if (!acs.length) continue;
      var ti = bs[Math.max(0, b)] * dt + t0, tf = (bs[Math.min(bs.length - 1, b + compasso)] || bs[bs.length - 1]) * dt + t0;
      compassos.push({ inicio: +ti.toFixed(3), fim: +tf.toFixed(3), acordes: acs });
    }
    while (compassos.length && vazio(compassos[0])) compassos.shift();
    while (compassos.length && vazio(compassos[compassos.length - 1])) compassos.pop();
    // último compasso com metade ou menos dos tempos = rabo do som (reverberação), não compasso
    var tempos = function (c) { return c.acordes.reduce(function (s, a) { return s + (a.acorde ? a.tempos : 0); }, 0); };
    if (compassos.length > 1 && tempos(compassos[compassos.length - 1]) <= compasso / 2) compassos.pop();
    if (compassos.length > 1 && tempos(compassos[0]) <= compasso / 2) compassos.shift();   // anacruse/começo cortado
    if (compassos.length) {   // pedaço de silêncio nas pontas não vira "—"
      var pri = compassos[0].acordes, ult = compassos[compassos.length - 1].acordes;
      while (pri.length > 1 && !pri[0].acorde) pri.shift();
      while (ult.length > 1 && !ult[ult.length - 1].acorde) ult.pop();
    }
    // maior × relativa menor (mesmas notas): decide pelo acorde que abre e
    // pelo que fecha a música — é onde a tônica costuma estar
    var alt = tom.alternativa, rel = alt.modo !== tom.modo && mod12(alt.pc - tom.pc) === (tom.modo === 'maior' ? 9 : 3);
    if (rel && compassos.length) {
      var ehTonica = function (a, pc, modo) { return a && a.raiz === pc && (modo === 'menor' ? /^m(?!aj)|^menor/.test(a.id) : ['maior', '7M', '7', 'sus4'].indexOf(a.id) >= 0); };
      var pontas = [compassos[0].acordes[0].acorde, compassos[compassos.length - 1].acordes[compassos[compassos.length - 1].acordes.length - 1].acorde];
      var votosAlt = pontas.filter(function (a) { return ehTonica(a, alt.pc, alt.modo); }).length, votosTom = pontas.filter(function (a) { return ehTonica(a, tom.pc, tom.modo); }).length;
      if (votosAlt > votosTom) { var tmpT = { pc: tom.pc, modo: tom.modo }; tom = { pc: alt.pc, modo: alt.modo, r: tom.r, margem: 0, alternativa: tmpT }; tonica = tonicaGrafada(tom.pc, tom.modo); }
    }
    // melodia com a grafia do tom, posicionada nas batidas (¼ de tempo)
    var mel = melodia(quadros, dt, o).map(function (nt) {
      var fb = frac(bs, nt.t / dt);
      var nome = g[mod12(nt.midi)];
      var nota = N.comOitava(nome, Math.floor((nt.midi - N.LETRA_PC[nome.li] - nome.alt) / 12) - 1);
      return { t: +(nt.t + t0).toFixed(3), dur: +nt.dur.toFixed(3), midi: nt.midi, nota: N.nome(nota), batida: Math.round(fb * 4) / 4 };
    });
    return {
      duracao: +(quadros.length * dt).toFixed(2), bpm: bt.bpm, compasso: compasso,
      tom: { pc: tom.pc, modo: tom.modo, nome: N.nome(tonica, { notacao: 'pt', glifo: true, oitava: false }) + ' ' + tom.modo, cifra: N.nome(tonica) + (tom.modo === 'menor' ? 'm' : ''), confianca: +Math.max(0, Math.min(1, tom.margem * 8)).toFixed(2),
        alternativa: N.nome(tonicaGrafada(tom.alternativa.pc, tom.alternativa.modo)) + (tom.alternativa.modo === 'menor' ? 'm' : '') },
      batidas: bs.map(function (x) { return +(x * dt + t0).toFixed(3); }),
      acordes: porBatida, compassos: compassos, melodia: mel,
    };
  }
  var EXTENDE = { maior: '7', menor: 'm7' };   // tríade → tétrade que a contém (7M fica de fora: é cor, não função)
  function chave(s) { return s ? s.raiz + ':' + s.id : '-'; }
  function frac(bs, q) {   // índice fracionário de batida para um quadro
    if (q <= bs[0]) return bs.length > 1 ? (q - bs[0]) / (bs[1] - bs[0]) : 0;
    for (var i = 1; i < bs.length; i++) if (q < bs[i]) return i - 1 + (q - bs[i - 1]) / (bs[i] - bs[i - 1]);
    return bs.length - 1 + (bs.length > 1 ? (q - bs[bs.length - 1]) / (bs[bs.length - 1] - bs[bs.length - 2]) : 0);
  }

  /** Um acorde para um trecho curto (escuta ao vivo). */
  function acordeAgora(croma, grave, tomPc, tomModo) {
    var ps = pontuar(croma, grave), mi = 0;
    for (var i = 1; i < ps.length; i++) if (ps[i] > ps[mi]) mi = i;
    var m = MOLDES[mi], g = grafiaDoTom(tomPc == null ? 0 : tomPc, tomModo || 'maior');
    return { simbolo: A.simbolo(g[m.raiz], m.id), raiz: m.raiz, id: m.id, forca: +ps[mi].toFixed(3) };
  }

  /** Texto em cifra por compasso: "| C | G | Am | F G |". */
  function cifraTexto(r, porLinha) {
    var pl = porLinha || 4, linhas = [], atual = [];
    r.compassos.forEach(function (c) {
      atual.push(' ' + c.acordes.map(function (a) { return a.acorde ? a.acorde.simbolo : '—'; }).join(' ') + ' ');
      if (atual.length === pl) { linhas.push('|' + atual.join('|') + '|'); atual = []; }
    });
    if (atual.length) linhas.push('|' + atual.join('|') + '|');
    return linhas.join('\n');
  }

  return { fft: fft, criar: criar, analisar: analisar, tomDoCroma: tomDoCroma, grafiaDoTom: grafiaDoTom, pontuar: pontuar, viterbi: viterbi,
    batidas: batidas, melodia: melodia, acordeAgora: acordeAgora, cifraTexto: cifraTexto, TIPOS: TIPOS, MEL_MIN: MEL_MIN, MEL_MAX: MEL_MAX };
});
