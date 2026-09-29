// =====================================================================
// Musique · Laboratório — CLIENTE · Praticar, Jogar e Atividade.
//
// Um executor só para os três: a questão vem do MESMO motor (semente),
// a explicação também. Diferenças:
//   · demonstração (sem assinatura): N questões, corrige aqui, não grava;
//   · assinante: o servidor corrige de novo e grava (a correção que vale
//     é a do servidor); o nível sobe pela regra do currículo;
//   · atividade do professor: as questões vêm do servidor SEM gabarito,
//     e só o servidor corrige;
//   · jogo: relógio, sequência de acertos e melhor marca — privada.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas;
  var N = L.notas, D = L.desenho, R = L.ritmo, X = L.exercicios, INS = L.instrumentos;
  var el = C.el;

  function visualDe(q, aoPiano) {
    var v = q.visual || { tipo: 'nenhum' };
    if (v.tipo === 'pauta') return el('div', { class: 'lab-svgbox lab-q-visual', html: D.pauta({ clave: v.clave, acorde: v.acorde, armadura: v.armadura || 0, notas: v.notas || [], titulo: 'Questão' }) });
    if (v.tipo === 'piano') {
      var box = el('div', { class: 'lab-svgbox lab-q-visual', html: D.piano({ de: v.de || 48, ate: v.ate || 71, interativo: true, rotulos: 'nenhum', titulo: 'Toque a resposta' }) });
      box.addEventListener('click', function (e) { var k = e.target.closest('[data-midi]'); if (k && aoPiano) { C.Som.tocar([Number(k.dataset.midi)], { dur: 0.6 }); aoPiano(Number(k.dataset.midi)); } });
      box.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.midi && aoPiano) { e.preventDefault(); aoPiano(Number(e.target.dataset.midi)); } });
      return box;
    }
    if (v.tipo === 'braco') {
      var af = INS.afinacao(v.instrumento || 'violao', 'padrao');
      return el('div', { class: 'lab-svgbox lab-q-visual lab-rola', html: D.braco({ afinacao: af, casas: v.casas || 7, destaques: v.destaques || [], titulo: 'Questão no braço' }) });
    }
    if (v.tipo === 'ritmo') {
      var desc = 'Compasso ' + v.compasso + ': ' + (v.figuras || []).map(function (f) { return R.FIG[f.figura].nome + (f.pontos ? ' pontuada' : ''); }).join(', ') + '; falta completar';
      return el('div', { class: 'lab-svgbox lab-q-visual', html: D.ritmo({ compasso: v.compasso, figuras: v.figuras, descricao: desc }) });
    }
    return null;
  }

  /**
   * Entradas que não são "escolher uma opção":
   *   · sequencia-piano: toca N notas no teclado (a melodia lida);
   *   · toque: toca o ritmo num botão grande (ou Espaço);
   *   · braco: marca casas no braço e confere.
   */
  function entradaEspecial(q, area, responder) {
    if (q.entrada === 'sequencia-piano') {
      var tocadas = [];
      var lista = el('p', { class: 'lab-info', 'aria-live': 'polite', txt: 'Toque ' + q.tamanho + ' notas.' });
      var t = q.teclado || { de: 55, ate: 84 };
      var box = el('div', { class: 'lab-svgbox lab-q-visual', html: D.piano({ de: t.de, ate: t.ate, interativo: true, rotulos: 'nenhum', titulo: 'Teclado para responder' }) });
      var pintar = function () { lista.textContent = tocadas.length ? tocadas.map(function (m) { return C.nomeNota(N.deMidi(m)); }).join(' – ') + (tocadas.length < q.tamanho ? '  (' + (q.tamanho - tocadas.length) + ' a tocar)' : '') : 'Toque ' + q.tamanho + ' notas.'; };
      var tocar = function (m) { if (tocadas.length >= q.tamanho) return; C.Som.tocar([m], { dur: 0.5 }); tocadas.push(m); pintar(); if (tocadas.length === q.tamanho) setTimeout(function () { responder(tocadas.join(',')); }, 350); };
      box.addEventListener('click', function (e) { var k = e.target.closest('[data-midi]'); if (k) tocar(Number(k.dataset.midi)); });
      box.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.midi) { e.preventDefault(); tocar(Number(e.target.dataset.midi)); } });
      area.appendChild(box); area.appendChild(lista);
      area.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: 'Apagar a última', onclick: function () { tocadas.pop(); pintar(); } })]));
    }
    if (q.entrada === 'toque') {
      var toques = [], inicioT = null;
      var info = el('p', { class: 'lab-info', 'aria-live': 'polite', txt: 'Ouça (com a contagem) e toque o ritmo aqui. Espaço também vale.' });
      var botao = el('button', { type: 'button', class: 'lab-botao-toque', txt: 'Toque o ritmo' });
      var marcar = function () { var agora = performance.now(); if (inicioT == null) inicioT = agora; toques.push(Math.round(agora - inicioT)); C.Som.bateria.caixa(C.Som.audio().currentTime + 0.001, 0.6); info.textContent = toques.length + ' toque(s).'; };
      botao.addEventListener('pointerdown', function (e) { e.preventDefault(); marcar(); });
      var tecla = function (e) { if (e.key === ' ' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); marcar(); } };
      d.addEventListener('keydown', tecla);
      area.appendChild(botao); area.appendChild(info);
      area.appendChild(el('div', { class: 'lab-acoes' }, [
        el('button', { type: 'button', class: 'btn', txt: 'Conferir', onclick: function () { d.removeEventListener('keydown', tecla); responder(toques.join(',')); } }),
        el('button', { type: 'button', class: 'btn sec', txt: 'Recomeçar', onclick: function () { toques = []; inicioT = null; info.textContent = 'Toque de novo.'; } })]));
    }
    if (q.entrada === 'braco') {
      var v = q.visual, af = INS.afinacao(v.instrumento || 'violao', 'padrao'), sel = {};
      var bx = el('div', { class: 'lab-svgbox lab-q-visual lab-rola' });
      var desenhar = function () {
        var dest = Object.keys(sel).map(function (k) { var p = k.split(':'); return { corda: Number(p[0]), casa: Number(p[1]), rotulo: '●', tipo: 'nota' }; });
        bx.innerHTML = D.braco({ afinacao: af, casas: v.casas, destaques: dest, interativo: true, titulo: 'Marque as casas' });
      };
      bx.addEventListener('click', function (e) { var c = e.target.closest('[data-corda]'); if (!c) return; var k = c.dataset.corda + ':' + c.dataset.casa; if (sel[k]) delete sel[k]; else { sel[k] = Number(c.dataset.midi); C.Som.tocar([Number(c.dataset.midi)], { modo: 'dedilhado', dur: 0.8 }); } desenhar(); });
      desenhar();
      area.appendChild(bx);
      area.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn', txt: 'Conferir', onclick: function () { responder(Object.keys(sel).map(function (k) { return N.mod(sel[k], 12); }).join(',')); } }),
        el('button', { type: 'button', class: 'btn sec', txt: 'Limpar', onclick: function () { sel = {}; desenhar(); } })]));
    }
  }

  function tocarQuestao(q) {
    if (!q.audio) return;
    if (q.audio.sequencia) return C.Som.sequencia(q.audio.sequencia, { dur: q.audio.dur || 1 });
    if (q.audio.ritmo) {
      // 4 tempos de contagem e depois o ritmo, no relógio do áudio
      var a = C.Som.audio(), t0 = a.currentTime + 0.1, tempo = 60 / q.audio.bpm, sem = tempo / 4;
      for (var k = 0; k < 4; k++) C.Som.bateria.clique(t0 + k * tempo, 0.7, k === 0);
      q.audio.ritmo.forEach(function (p) { C.Som.bateria.caixa(t0 + 4 * tempo + p * sem, 0.8); });
      return;
    }
    if (q.audio.modo === 'harmonico' && !q.audio.arpejo) C.Som.tocar(q.audio.midis, { modo: 'harmonico', dur: 1.6 });
    else if (q.audio.arpejo) { C.Som.tocar(q.audio.midis, { dur: 0.45 }); setTimeout(function () { C.Som.tocar(q.audio.midis, { modo: 'harmonico', dur: 1.4 }); }, q.audio.midis.length * 450 + 150); }
    else C.Som.tocar(q.audio.midis, { dur: 0.7 });
  }

  /**
   * Executor. o: { alvo, fonte(i) → Promise<questão>, total, tempo_s, jogo, sessao,
   * corrigirNoServidor, gravar, aoFim(resumo) }
   */
  function executar(o) {
    var i = 0, acertos = 0, seq = 0, melhorSeq = 0, pontos = 0, erros = [], inicio = Date.now(), fimJogo = o.tempo_s ? Date.now() + o.tempo_s * 1000 : 0, relogio = null, respondendo = false;
    var alvo = o.alvo;
    var topo = el('div', { class: 'lab-q-topo', 'aria-live': 'off' });
    var area = el('div', { class: 'lab-q' });
    C.limpar(alvo); alvo.appendChild(topo); alvo.appendChild(area);
    function placar() {
      var rest = fimJogo ? Math.max(0, Math.ceil((fimJogo - Date.now()) / 1000)) : null;
      topo.textContent = (o.total ? 'Questão ' + Math.min(i + 1, o.total) + ' de ' + o.total + ' · ' : '') + acertos + ' acerto(s)' + (o.jogo ? ' · sequência ' + seq + ' · ' + pontos + ' pontos' : '') + (rest != null ? ' · ' + rest + ' s' : '');
      if (fimJogo && rest === 0 && !respondendo) terminar();
    }
    if (fimJogo) relogio = setInterval(placar, 250);
    function terminar() {
      clearInterval(relogio); relogio = null;
      var res = { total: i, acertos: acertos, pontos: pontos, melhorSeq: melhorSeq, erros: erros, segundos: Math.round((Date.now() - inicio) / 1000) };
      C.limpar(area);
      area.appendChild(el('div', { class: 'lab-resumo-final' }, [el('h2', { tabindex: '-1', txt: o.jogo ? pontos + ' pontos' : acertos + ' de ' + i }),
        el('p', { txt: acertos + ' acerto(s) em ' + i + ' questão(ões) · ' + res.segundos + ' s' + (o.jogo ? ' · melhor sequência ' + melhorSeq : '') })]));
      if (erros.length) area.appendChild(el('details', { class: 'lab-det', open: true }, [el('summary', { txt: 'Revise os erros (' + erros.length + ')' }),
        el('ul', {}, erros.slice(0, 12).map(function (e) { return el('li', {}, [el('strong', { txt: e.enunciado }), el('br'), 'Você: ' + e.recebido + ' · Certo: ' + e.esperado, el('br'), el('small', { txt: e.explicacao }), e.revisar ? el('span', {}, [' ', el('a', { href: e.revisar.url, txt: 'Revisar: ' + e.revisar.rotulo })]) : null]); }))]));
      if (o.aoFim) o.aoFim(res, area);
      var h2 = C.$('h2', area); if (h2) h2.focus();
    }
    function proxima() {
      if ((o.total && i >= o.total) || (fimJogo && Date.now() >= fimJogo)) return terminar();
      placar();
      Promise.resolve(o.fonte(i)).then(mostrar).catch(function (e) { area.textContent = e.message; });
    }
    function mostrar(q) {
      C.limpar(area);
      var t0 = Date.now(); respondendo = false;
      area.appendChild(el('p', { class: 'lab-q-enunciado', tabindex: '-1', txt: q.enunciado }));
      var vis = q.entrada === 'braco' ? null : visualDe(q, function (m) { responder(String(m)); });
      if (vis) area.appendChild(vis);
      entradaEspecial(q, area, function (v) { responder(v); });
      if (q.audio) {
        area.appendChild(el('button', { type: 'button', class: 'btn sec lab-q-ouvir', txt: q.auditivo ? '🔊 Ouvir de novo' : '▶ Ouvir', onclick: function () { tocarQuestao(q); } }));
        if (q.auditivo) tocarQuestao(q);
      }
      var ops = null;
      if (q.opcoes) {
        ops = el('div', { class: 'lab-opcoes', role: 'group', 'aria-label': 'Respostas' }, q.opcoes.map(function (op, k) {
          return el('button', { type: 'button', class: 'lab-opcao', 'data-valor': op.valor, onclick: function () { responder(op.valor); } }, [el('span', { class: 'lab-tecla', 'aria-hidden': 'true', txt: String(k + 1) }), op.rotulo]);
        }));
        area.appendChild(ops);
      }
      var fb = el('div', { class: 'lab-feedback', 'aria-live': 'assertive' });
      area.appendChild(fb);
      var foco = C.$('.lab-q-enunciado', area); if (foco) foco.focus();
      function teclas(e) {
        if (respondendo || !q.opcoes) return;
        if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        var n = Number(e.key); if (n >= 1 && n <= q.opcoes.length) { e.preventDefault(); responder(q.opcoes[n - 1].valor); }
      }
      d.addEventListener('keydown', teclas);
      function responder(valor) {
        if (respondendo) return; respondendo = true;
        d.removeEventListener('keydown', teclas);
        var ms = Date.now() - t0;
        var local = q.resposta != null ? X.corrigir(X.gerar(q.tipo, { nivel: q.nivel, semente: q.semente, params: q.params }), valor) : null;
        var p = (o.corrigirNoServidor || o.gravar) ? C.api('POST', '/music/api/lab/responder', { tipo: q.tipo, nivel: q.nivel, semente: q.semente, params: q.params || {}, resposta: valor, ms: ms, sessao: o.sessao || '' })
          .catch(function (e) { if (local) { if (e.status === 402 || e.status === 401) C.aviso('O progresso não foi guardado: ' + e.message); return local; } throw e; }) : Promise.resolve(local);
        p.then(function (c) { mostrarFeedback(c, valor, ms); }).catch(function (e) { fb.textContent = 'Não consegui corrigir: ' + e.message; respondendo = false; });
      }
      function mostrarFeedback(c, valor, ms) {
        i++;
        if (c.certo) { acertos++; seq++; melhorSeq = Math.max(melhorSeq, seq); pontos += 10 + Math.min(10, seq) + (ms < 3000 ? 5 : 0); }
        else { seq = 0; erros.push({ enunciado: q.enunciado, recebido: c.recebido, esperado: c.esperado, explicacao: c.explicacao, revisar: c.revisar }); }
        if (ops) C.$$('.lab-opcao', ops).forEach(function (b) {
          b.disabled = true;
          if (b.dataset.valor === String(valor)) b.classList.add(c.certo ? 'certo' : 'errado');
          if (!c.certo && c.esperado && b.textContent.indexOf(c.esperado) >= 0) b.classList.add('era');
        });
        C.limpar(fb);
        fb.className = 'lab-feedback ' + (c.certo ? 'ok' : 'nao');
        fb.appendChild(el('p', { class: 'lab-fb-t' }, [el('strong', { txt: c.certo ? '✓ Certo!' : '✗ Não foi dessa vez.' }), c.certo ? '' : ' Você respondeu ' + c.recebido + '; o certo é ' + c.esperado + '.']));
        if (!o.jogo || !c.certo) fb.appendChild(el('p', { txt: c.explicacao }));
        if (c.mostrar && c.mostrar.tipo === 'ritmo') fb.appendChild(el('div', { class: 'lab-svgbox', html: D.ritmo({ compasso: c.mostrar.compasso, figuras: c.mostrar.figuras, completo: true, descricao: 'O ritmo certo' }) }));
        if (c.mostrar && c.mostrar.tipo === 'piano') {
          var dd = {}; c.mostrar.midis.forEach(function (m) { dd[m] = { rotulo: C.nomeNota(N.deMidi(m)), tipo: 'nota' }; });
          fb.appendChild(el('details', { class: 'lab-det' }, [el('summary', { txt: 'Ver no teclado' }), el('div', { class: 'lab-svgbox', html: D.piano({ de: Math.min.apply(null, c.mostrar.midis) - 5, ate: Math.max.apply(null, c.mostrar.midis) + 5, destaques: dd, titulo: 'As notas tocadas' }) })]));
        }
        var acoes = el('div', { class: 'lab-acoes' });
        if (!c.certo && c.revisar) acoes.appendChild(el('a', { href: c.revisar.url, target: '_blank', rel: 'noopener', txt: 'Revisar: ' + c.revisar.rotulo }));
        if (c.proxima_revisao_dias != null) acoes.appendChild(el('small', { txt: ' Revisão agendada em ' + c.proxima_revisao_dias + ' dia(s).' }));
        var prox = el('button', { type: 'button', class: 'btn', txt: (o.total && i >= o.total) ? 'Ver resultado' : 'Próxima →', onclick: proxima });
        acoes.insertBefore(prox, acoes.firstChild);
        fb.appendChild(acoes);
        placar();
        if (o.jogo && c.certo) setTimeout(function () { if (respondendo && area.contains(prox)) proxima(); }, 650);
        else prox.focus();
      }
    }
    proxima();
    return { parar: function () { clearInterval(relogio); } };
  }

  // ------------------------------------------------------------------
  // Praticar
  // ------------------------------------------------------------------
  F.praticar = function (alvo, st) {
    if (st.atividade) return atividade(alvo, st);
    var nivel = st.nivel || 1;
    var params = C.lerLocal('params:' + st.tipo, {});
    var ROT = { clave: 'Clave', extensao: 'Extensão', instrumento: 'Instrumento' };
    var ROT_V = { sol: 'sol', fa: 'fá', do3: 'dó (3ª linha)', do4: 'dó (4ª linha)', pauta: 'só dentro da pauta', suplementares: 'com linhas suplementares',
      violao: 'violão', ukulele: 'ukulele', cavaquinho: 'cavaquinho', baixo: 'contrabaixo' };
    function inicio() {
      C.limpar(alvo);
      var sel = C.select('lab-nivel', 'Nível', st.niveis.map(function (n, k) { return { valor: k + 1, rotulo: (k + 1) + ' — ' + n }; }), nivel, function (v) { nivel = Number(v); });
      var extras = Object.keys(st.params || {}).map(function (k) {
        return C.select('lab-p-' + k, ROT[k] || k, [{ valor: '', rotulo: 'variar' }].concat(st.params[k].map(function (v) { return { valor: v, rotulo: ROT_V[v] || v }; })), params[k] || '', function (v) { if (v) params[k] = v; else delete params[k]; C.guardar('params:' + st.tipo, params); });
      });
      alvo.appendChild(el('div', { class: 'lab-controles' }, [sel].concat(extras).concat([el('button', { type: 'button', class: 'btn', txt: st.demo ? 'Começar (' + st.demo + ' questões)' : 'Começar', onclick: comecar })])));
      if (st.completo) {
        C.api('GET', '/music/api/lab/nivel/' + st.tipo).then(function (r) { if (r.nivel && r.nivel !== nivel) { nivel = r.nivel; var s = C.$('#lab-nivel'); if (s) s.value = String(nivel); alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Nível sugerido pelo seu histórico: ' + nivel + '.' })); } }).catch(function () { /* sem histórico */ });
      }
    }
    function comecar() {
      executar({ alvo: alvo, total: st.demo || 10, gravar: st.completo,
        fonte: function () { return X.publica(X.gerar(st.tipo, { nivel: nivel, semente: Math.floor(Math.random() * 1e9), params: params })); },
        aoFim: function (res, area) {
          area.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn', txt: 'Outra sessão', onclick: comecar }), el('button', { type: 'button', class: 'btn sec', txt: 'Mudar o nível', onclick: inicio })]));
          if (st.demo) area.appendChild(el('p', { class: 'lab-nota-convencao' }, ['Gostou? Na assinatura, o Musique guarda o seu progresso, sobe o nível sozinho e agenda revisões das habilidades em que você erra. ', el('a', { href: st.logado ? '/music/app#conta' : '/music/entrar', txt: st.logado ? 'Assinar' : 'Começar o teste grátis' })]));
        } });
    }
    inicio();
  };

  function atividade(alvo, st) {
    C.api('GET', '/music/api/lab/atividades/' + encodeURIComponent(st.atividade) + '/questoes').then(function (r) {
      var h1 = C.$('h1'); if (h1) h1.textContent = r.titulo;
      executar({ alvo: alvo, total: r.questoes.length, corrigirNoServidor: true, sessao: r.sessao, tempo_s: r.config.tempo_s || 0,
        fonte: function (i) { return r.questoes[i]; },
        aoFim: function (res, area) { area.appendChild(el('p', { class: 'lab-nota-convencao', txt: 'Pronto: o resultado chegou ao seu professor. Agora envie a tarefa no seu espaço do Musique — a nota, se houver, é dada por ele.' })); area.appendChild(el('a', { class: 'btn', href: '/music/app', txt: 'Ir para as minhas tarefas' })); } });
    }).catch(function (e) { alvo.textContent = e.message; });
  }

  // ------------------------------------------------------------------
  // Jogar
  // ------------------------------------------------------------------
  F.jogar = function (alvo, st) {
    if (st.especial === 'pulso') return pulso(alvo, st);
    var chave = 'recorde:' + st.jogo;
    function inicio() {
      C.limpar(alvo);
      var rec = C.lerLocal(chave, 0);
      var nivel = 1;
      var tipos = st.tipos;
      var maxN = Math.min.apply(null, tipos.map(function (t) { return X.TIPOS[t].niveis.length; }));
      alvo.appendChild(el('p', { txt: st.diario ? 'Desafio de ' + st.dia.split('-').reverse().join('/') + ': dez questões, as mesmas para todo mundo hoje.' : '60 segundos. Cada acerto vale 10 pontos, mais bônus de sequência e de rapidez.' }));
      if (rec) alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Sua melhor marca neste aparelho: ' + rec + ' pontos.' }));
      alvo.appendChild(el('div', { class: 'lab-controles' }, [st.diario ? null : C.select('lab-nivel', 'Nível', Array.apply(null, { length: maxN }).map(function (_, k) { return { valor: k + 1, rotulo: String(k + 1) }; }), 1, function (v) { nivel = Number(v); }),
        el('button', { type: 'button', class: 'btn', txt: 'Jogar', onclick: function () { jogar(nivel); } })]));
    }
    function jogar(nivel) {
      var semBase = st.diario ? 'dia:' + st.dia : null;
      executar({ alvo: alvo, jogo: true, total: st.diario ? 10 : 0, tempo_s: st.diario ? 0 : 60, gravar: false,
        fonte: function (i) {
          var tipo = st.diario ? st.tipos[X.prng(semBase + ':' + i)() * st.tipos.length | 0] : st.tipos[Math.floor(Math.random() * st.tipos.length)];
          var nv = st.diario ? 1 + (i > 3 ? 1 : 0) + (i > 7 ? 1 : 0) : nivel;
          nv = Math.min(nv, X.TIPOS[tipo].niveis.length);
          return X.publica(X.gerar(tipo, { nivel: nv, semente: st.diario ? semBase + ':' + i : Math.floor(Math.random() * 1e9) }));
        },
        aoFim: function (res, area) {
          var rec = C.lerLocal(chave, 0);
          if (res.pontos > rec) { C.guardar(chave, res.pontos); area.appendChild(el('p', { class: 'lab-dica', txt: '🏅 Nova melhor marca neste aparelho!' })); }
          if (st.historico) C.api('POST', '/music/api/lab/jogos', { jogo: st.jogo, dia: st.dia, pontos: res.pontos, acertos: res.acertos, total: res.total }).then(function (r) { area.appendChild(el('p', { txt: 'Melhor marca guardada na sua conta: ' + r.melhor + ' pontos (' + r.dias + ' dia(s) jogados).' })); }).catch(function () { /* segue local */ });
          area.appendChild(el('button', { type: 'button', class: 'btn', txt: 'Jogar de novo', onclick: inicio }));
        } });
    }
    inicio();
  };

  // "Mantenha o pulso": o metrônomo toca 8 tempos e some; a pessoa continua.
  function pulso(alvo) {
    var bpm = 90;
    function inicio() {
      C.limpar(alvo);
      alvo.appendChild(el('p', { txt: 'O metrônomo toca 8 tempos e silencia. Continue tocando no mesmo andamento (Espaço, T ou o botão) por mais 16 tempos. Medimos o seu desvio em milissegundos.' }));
      var i = el('input', { id: 'lab-bpm', type: 'number', min: 50, max: 180, value: bpm, oninput: function () { bpm = Number(i.value) || 90; } });
      alvo.appendChild(el('div', { class: 'lab-controles' }, [el('div', { class: 'lab-campo' }, [el('label', { for: 'lab-bpm', txt: 'BPM' }), i]), el('button', { type: 'button', class: 'btn', txt: 'Começar', onclick: comecar })]));
    }
    function comecar() {
      var a = C.Som.audio(), per = 60 / bpm, t0 = a.currentTime + 0.3, toques = [], fim = false;
      for (var k = 0; k < 8; k++) C.Som.bateria.clique(t0 + k * per, 0.9, k % 4 === 0);
      C.limpar(alvo);
      var st = el('p', { class: 'lab-grande', 'aria-live': 'polite', txt: 'Ouça…' });
      var b = el('button', { type: 'button', class: 'lab-botao-toque', txt: 'Toque no pulso', onclick: toque });
      alvo.appendChild(st); alvo.appendChild(b);
      function toque() { if (fim) return; toques.push(a.currentTime); var n = toques.length; st.textContent = n + ' / 24'; if (n >= 24) terminar(); }
      function tecla(e) { if (e.key === ' ' || e.key === 't' || e.key === 'T') { e.preventDefault(); toque(); } }
      d.addEventListener('keydown', tecla);
      setTimeout(function () { st.textContent = 'Agora com você!'; }, (8 * per + 0.3) * 1000);
      function terminar() {
        fim = true; d.removeEventListener('keydown', tecla);
        // grade ideal a partir do 1º clique do metrônomo; só os toques depois do silêncio contam
        var silencio = t0 + 8 * per;
        var depois = toques.filter(function (t) { return t >= silencio - per / 2; }).map(function (t) { return t * 1000; });
        var dv = depois.length >= 4 ? R.desvioDoPulso([t0 * 1000].concat(depois), bpm) : null;
        C.limpar(alvo);
        if (!dv) { alvo.appendChild(el('p', { txt: 'Poucos toques depois do silêncio. Tente de novo.' })); }
        else {
          var ds = dv.desvios_ms.slice(1);
          var deriva = ds.length > 3 ? Math.round((ds.slice(-3).reduce(function (x, y) { return x + y; }, 0) / 3) - (ds.slice(0, 3).reduce(function (x, y) { return x + y; }, 0) / 3)) : 0;
          alvo.appendChild(el('div', { class: 'lab-resumo-final' }, [el('h2', { txt: 'Desvio médio: ' + dv.medio_ms + ' ms' }),
            el('p', { txt: 'Pior toque: ' + dv.pior_ms + ' ms · adiantados: ' + dv.adiantado + ' · atrasados: ' + dv.atrasado + (Math.abs(deriva) > 20 ? ' · você ' + (deriva < 0 ? 'ACELEROU' : 'DESACELEROU') + ' ~' + Math.abs(deriva) + ' ms ao longo do trecho' : ' · andamento estável') }),
            el('p', { class: 'lab-dica', txt: 'Abaixo de ~20 ms é muito regular; 20–50 ms é bom; acima disso, pratique com a subdivisão (conte "1-e-2-e").' })]));
        }
        alvo.appendChild(el('button', { type: 'button', class: 'btn', txt: 'De novo', onclick: inicio }));
      }
    }
    inicio();
  }

  // progresso do assinante na página de Praticar (sem conta: fica oculto)
  d.addEventListener('DOMContentLoaded', function () {
    if (location.pathname !== '/music/praticar') return;
    var main = C.$('#lab-main'); if (!main) return;
    C.api('GET', '/music/api/lab/progresso').then(function (r) {
      var tipos = Object.keys(r.por_tipo || {});
      var box = el('section', { class: 'lab-progresso' }, [el('h2', { txt: 'Seu progresso' })]);
      if (r.revisar_hoje && r.revisar_hoje.length) box.appendChild(el('p', {}, ['Para revisar hoje: '].concat(r.revisar_hoje.map(function (x) { return el('a', { href: '/music/praticar/' + (x.tipos[0] || ''), txt: x.habilidade + ' ' }); }))));
      if (!tipos.length) box.appendChild(el('p', { txt: 'Ainda sem tentativas guardadas. Comece por qualquer exercício.' }));
      else box.appendChild(el('ul', { class: 'lab-dominio' }, tipos.map(function (k) { var x = r.por_tipo[k]; return el('li', { class: 'dom-' + x.dominio }, [el('a', { href: '/music/praticar/' + k, txt: (X.TIPOS[k] || { nome: k }).nome }), ' — ' + x.dominio + ' (' + x.taxa_recente + '% nas últimas 10; nível ' + x.nivel + ')']); })));
      main.insertBefore(box, main.children[2] || null);
    }).catch(function () { /* sem conta ou sem assinatura: não mostra */ });
  });

  C.executar = executar;
  C.visualDaQuestao = visualDe;
})(window, document);
