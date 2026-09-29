// =====================================================================
// Musique · Laboratório — NÚCLEO · o tutor de braço: avaliação e
// orientação. PURO e determinístico.
//
// O que o tutor MEDE (e só isto): a altura de cada nota tocada (uma de
// cada vez — monofônico) e o momento em que ela começou, comparados com
// o exercício no andamento. É código, não IA: o mesmo toque dá sempre a
// mesma medida, e a medida é explicável ("a nota 7 saiu meio tom alta").
//
// ⚠️ É INDICAÇÃO DE TREINO, não nota (decisão Q5 do Musique). A latência
// do microfone varia por aparelho; por isso o tempo é medido RELATIVO à
// média da própria rodada (regularidade e tendência de correr/atrasar),
// e não em milissegundos absolutos.
//
// A IA (quando ligada no staff) só CONVERSA a partir destes números —
// nunca mede nem corrige.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'));
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).tutor = fabrica(raiz.MusiqueLab.notas);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  /**
   * Transforma quadros de altura [{ t (s), hz, conf, rms }] em NOTAS
   * tocadas [{ t, midi, dur }]: uma nota começa quando aparece uma altura
   * estável nova (ou volta depois de silêncio) e dura pelo menos 50 ms.
   */
  function segmentar(quadros, opcoes) {
    var o = opcoes || {}, minDur = o.minDur || 0.05, minConf = o.minConf || 0.6;   // a confiança do detector cai nos graves (mi2 ≈ 0,67 numa janela curta)
    var out = [], atual = null, ultimoT = -1;
    (quadros || []).forEach(function (q) {
      var valido = q.hz > 0 && q.conf >= minConf;
      var m = valido ? N.midiDeFreq(q.hz) : null;
      var mr = m == null ? null : Math.round(m);
      var silencioLongo = atual && q.t - ultimoT > 0.12;
      if (mr == null) { if (atual && q.t - ultimoT > 0.06) { fechar(); } return; }
      if (!atual || silencioLongo || Math.abs(m - atual.soma / atual.n) > 0.6) {
        fechar();
        atual = { t: q.t, soma: m, n: 1, fim: q.t };
      } else { atual.soma += m; atual.n++; atual.fim = q.t; }
      ultimoT = q.t;
    });
    fechar();
    function fechar() {
      if (atual && atual.fim - atual.t >= minDur) {
        var mm = atual.soma / atual.n;
        out.push({ t: atual.t, midi: Math.round(mm), cents: Math.round((mm - Math.round(mm)) * 100), dur: atual.fim - atual.t });
      }
      atual = null;
    }
    return out;
  }

  /**
   * Casa as notas tocadas com as esperadas. esperados: [{ t (s), midi,
   * corda, casa, dedo }]. Cada esperada procura a tocada mais próxima no
   * tempo (janela de meio passo para cada lado). Altura certa = mesma
   * classe de altura (o detector às vezes erra a oitava; isso se registra
   * à parte, sem culpar o aluno).
   */
  function avaliar(esperados, tocadas, opcoes) {
    var o = opcoes || {};
    var passo = o.passo_s || (esperados.length > 1 ? esperados[1].t - esperados[0].t : 0.5);
    var janela = Math.max(0.09, passo * 0.5);
    var usadas = {};
    // latência: mediana da diferença das notas com altura certa
    var difs = [];
    esperados.forEach(function (e) {
      var melhor = null;
      tocadas.forEach(function (t, j) { var d = t.t - e.t; if (Math.abs(d) <= janela + 0.25 && N.mod(t.midi, 12) === N.mod(e.midi, 12) && (!melhor || Math.abs(d) < Math.abs(melhor.d))) melhor = { d: d, j: j }; });
      if (melhor) difs.push(melhor.d);
    });
    difs.sort(function (a, b) { return a - b; });
    var lat = difs.length ? difs[Math.floor(difs.length / 2)] : 0;
    var itens = esperados.map(function (e, i) {
      var melhor = null;
      tocadas.forEach(function (t, j) {
        if (usadas[j]) return;
        var d = t.t - lat - e.t;
        if (Math.abs(d) <= janela && (!melhor || Math.abs(d) < Math.abs(melhor.d))) melhor = { d: d, j: j, t: t };
      });
      if (!melhor) return { i: i, esperado: e, tocou: false, certo: false };
      usadas[melhor.j] = true;
      var pcOk = N.mod(melhor.t.midi, 12) === N.mod(e.midi, 12);
      return { i: i, esperado: e, tocou: true, certo: pcOk, oitava: pcOk && melhor.t.midi !== e.midi, midi: melhor.t.midi,
        semitons: pcOk ? 0 : ((melhor.t.midi - e.midi) % 12 + 18) % 12 - 6, tempo_ms: Math.round(melhor.d * 1000) };
    });
    var certos = itens.filter(function (x) { return x.certo; });
    var tempos = certos.map(function (x) { return x.tempo_ms; });
    var medio = tempos.length ? Math.round(tempos.reduce(function (a, b) { return a + b; }, 0) / tempos.length) : 0;
    var abs = tempos.length ? Math.round(tempos.reduce(function (a, b) { return a + Math.abs(b); }, 0) / tempos.length) : 0;
    // tendência: a segunda metade corre ou atrasa em relação à primeira?
    var meio = Math.floor(certos.length / 2), m1 = media(certos.slice(0, meio).map(tm)), m2 = media(certos.slice(meio).map(tm));
    var porCorda = {};
    itens.forEach(function (x) { var c = x.esperado.corda; var p = porCorda[c] || (porCorda[c] = { total: 0, certos: 0 }); p.total++; if (x.certo) p.certos++; });
    return {
      itens: itens, total: itens.length, certos: certos.length, faltaram: itens.filter(function (x) { return !x.tocou; }).length,
      erradas: itens.filter(function (x) { return x.tocou && !x.certo; }).length, extras: tocadas.length - Object.keys(usadas).length,
      precisao: itens.length ? Math.round(100 * certos.length / itens.length) : 0,
      desvio_medio_ms: abs, tendencia_ms: medio, deriva_ms: Math.round(m2 - m1), latencia_ms: Math.round(lat * 1000),
      por_corda: porCorda, oitavas: itens.filter(function (x) { return x.oitava; }).length,
    };
    function tm(x) { return x.tempo_ms; }
  }
  function media(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }

  /** Próximo andamento, por regra LEGÍVEL (a tela mostra a regra). */
  function proximoBpm(r, bpm) {
    if (r.precisao >= 95 && r.desvio_medio_ms <= 35) return { bpm: Math.min(300, bpm + (bpm < 80 ? 4 : 6)), motivo: 'limpo e no tempo: subir um pouco' };
    if (r.precisao >= 85 && r.desvio_medio_ms <= 60) return { bpm: bpm, motivo: 'quase lá: repetir no mesmo andamento' };
    return { bpm: Math.max(30, bpm - (bpm > 80 ? 8 : 5)), motivo: 'descer o andamento até sair limpo' };
  }

  function nomeCorda(c, nCordas) { return (nCordas - c) + 'ª corda'; }

  /**
   * A fala do tutor sobre a rodada: elogio honesto + o ponto mais
   * importante a corrigir + o próximo passo. `semente` varia as frases
   * sem aleatoriedade (mesma rodada, mesma fala).
   */
  function orientar(r, ctx) {
    var c = ctx || {}, nC = c.nCordas || 6, semente = c.semente || 0;
    var pick = function (lista) { return lista[Math.abs(semente) % lista.length]; };
    var falas = [];
    if (r.precisao >= 95) falas.push(pick(['Muito bem! Rodada limpa.', 'Excelente: praticamente tudo certo.', 'Isso! Notas limpas do começo ao fim.']));
    else if (r.precisao >= 80) falas.push(pick(['Boa rodada, falta pouco.', 'Bom trabalho — dá para limpar os detalhes.', 'Está saindo! Vamos acertar alguns pontos.']));
    else if (r.precisao >= 50) falas.push(pick(['Vamos com calma: a velocidade vem depois da precisão.', 'Metade do caminho. Devagar e bem feito rende mais.']));
    else falas.push(r.certos === 0 && r.faltaram === r.total ? 'Não ouvi as notas. Chegue o instrumento mais perto do microfone, sem fone, e toque uma nota por vez.' : 'Esse andamento ainda está rápido. Vamos baixar e firmar cada nota.');
    // o erro mais frequente
    var erradas = r.itens.filter(function (x) { return x.tocou && !x.certo; });
    if (erradas.length) {
      var e = erradas[0];
      var sent = e.semitons > 0 ? 'meio tom acima' : e.semitons < 0 ? 'meio tom abaixo' : 'outra nota';
      if (Math.abs(e.semitons) > 1) sent = Math.abs(e.semitons) + ' semitons ' + (e.semitons > 0 ? 'acima' : 'abaixo');
      falas.push('Na nota ' + (e.i + 1) + ' (' + nomeCorda(e.esperado.corda, nC) + ', casa ' + e.esperado.casa + (e.esperado.dedo ? ', dedo ' + e.esperado.dedo : ', solta') + ') saiu ' + sent + ': confira a casa' + (e.esperado.dedo ? ' e deixe o dedo ' + e.esperado.dedo + ' pronto antes' : '') + '.');
    }
    // corda com mais problema
    var pior = null;
    Object.keys(r.por_corda).forEach(function (k) { var p = r.por_corda[k]; var taxa = p.certos / p.total; if (p.total >= 2 && taxa < 0.7 && (!pior || taxa < pior.taxa)) pior = { c: Number(k), taxa: taxa }; });
    if (pior && (!erradas.length || erradas[0].esperado.corda !== pior.c)) falas.push('A ' + nomeCorda(pior.c, nC) + ' está pedindo atenção: toque só ela algumas vezes, devagar.');
    if (r.faltaram > r.total * 0.25 && r.certos > 0) falas.push('Algumas notas não soaram: mantenha o dedo firme até a próxima nota (sem abafar).');
    // tempo
    if (r.certos >= 4) {
      if (r.deriva_ms < -40) falas.push('Você foi acelerando ao longo do exercício: segure o pulso no clique.');
      else if (r.deriva_ms > 40) falas.push('Você foi atrasando no fim: provavelmente a mão cansou — respire e solte os ombros.');
      else if (r.desvio_medio_ms > 60) falas.push('O tempo oscilou (~' + r.desvio_medio_ms + ' ms): conte a subdivisão e mire no clique.');
      else if (r.precisao >= 85) falas.push(pick(['O tempo está regular. 👏', 'Ótima regularidade no tempo.']));
    }
    if (r.oitavas > 0) falas.push('(Ouvi ' + r.oitavas + ' nota(s) numa oitava diferente — pode ser o microfone; contei como certas.)');
    var prox = proximoBpm(r, c.bpm || 80);
    falas.push(prox.bpm > (c.bpm || 80) ? 'Próximo passo: ' + prox.bpm + ' BPM.' : prox.bpm < (c.bpm || 80) ? 'Próximo passo: descer para ' + prox.bpm + ' BPM e firmar.' : 'Próximo passo: repetir em ' + prox.bpm + ' BPM.');
    return { falas: falas, proximo: prox };
  }

  return { segmentar: segmentar, avaliar: avaliar, proximoBpm: proximoBpm, orientar: orientar };
});
