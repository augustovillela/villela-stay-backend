// =====================================================================
// Musique — app do músico (/music/app), servido em /music/app.js.
// SPA sem build, padrão da casa.
//
// A TELA QUE IMPORTA É A DE PRATICAR, e ela obedece à decisão Q5 do
// Augusto em três momentos visíveis:
//
//   ANTES  · o cartão do exercício mostra O QUE vai ser medido e com que
//            tolerância, e se aquilo pode valer nota;
//   DEPOIS · o resultado traz o critério, a medida e a explicação — não
//            um "certo/errado" seco;
//   SEMPRE · quando a confiança não sustenta nota, a tela diz que aquilo
//            é INDICAÇÃO, com o motivo e o caminho para resolver.
//
// O cliente MEDE (Web Audio) e o servidor JULGA. O gabarito só chega
// depois de responder — por isso não existe "resposta certa" em lugar
// nenhum deste arquivo.
//
// ⚠️ Este arquivo é ASCII de propósito. Caractere fora do plano básico
// (o glifo da clave de sol, por exemplo) entra como escape `\u{...}`.
// Foi assim que virou depois de um script de edição truncar o arquivo
// ao falhar na codificação de um par surrogado — e `node --check` passar
// no arquivo vazio, porque arquivo vazio é JavaScript válido.
// =====================================================================
'use strict';

const JS = `
(function () {
  'use strict';
  var A = window.MusiqueAudio;
  var estado = { aba: 'estudar', item: null, sessao: null, inicioItem: 0, tipos: [], eu: null };

  var $ = function (s, raiz) { return (raiz || document).querySelector(s); };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var el = function (tag, attrs, dentro) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'onclick') n.onclick = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'txt') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (dentro || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  };

  // ---- API -------------------------------------------------------
  function api(metodo, caminho, corpo) {
    return fetch('/music/api' + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) { location.href = (d && d.entrar) || '/academy/app'; throw new Error('sessao'); }
        if (!r.ok) { var e = new Error((d && d.erro) || ('Erro ' + r.status)); e.dados = d; throw e; }
        return d;
      });
    }).catch(function (e) {
      // Rede caida nao e erro do servidor. Dizer "falhou" sem dizer o que
      // falhou e o que faz o usuario achar que o produto quebrou.
      if (e instanceof TypeError) throw new Error('Nao consegui falar com o servidor. Verifique a conexao.');
      throw e;
    });
  }

  function aviso(msg) {
    var c = $('#corpo');
    var caixa = el('div', { class: 'alerta', txt: msg });
    c.insertBefore(caixa, c.firstChild);
    caixa.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function () { caixa.remove(); }, 9000);
  }
  function erro(msg) {
    var c = $('#corpo');
    var caixa = el('div', { class: 'alerta ruim', txt: msg });
    c.insertBefore(caixa, c.firstChild);
    caixa.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function () { caixa.remove(); }, 9000);
  }
  function carregando() { $('#corpo').innerHTML = '<p class="vazio">Carregando...</p>'; }

  // ---- navegacao -------------------------------------------------
  var ABAS = [
    ['estudar', 'Estudar'], ['praticar', 'Praticar'],
    ['biblioteca', 'Biblioteca'], ['repertorios', 'Repertórios'],
    ['tarefas', 'Tarefas'], ['progresso', 'Meu progresso'], ['professor', 'Professor'],
  ];
  function pintarMenu() {
    $('#menu').innerHTML = '';
    ABAS.forEach(function (a) {
      if (a[0] === 'professor' && !(estado.eu && estado.eu.sou_professor)) return;
      $('#menu').appendChild(el('button', {
        class: 'aba' + (estado.aba === a[0] ? ' on' : ''), txt: a[1],
        'aria-current': estado.aba === a[0] ? 'page' : 'false',
        onclick: function () { ir(a[0]); },
      }));
    });
  }
  function ir(aba) {
    estado.aba = aba; pintarMenu(); carregando();
    var telas = {
      estudar: verEstudar, praticar: verPraticar, tarefas: verTarefas,
      progresso: verProgresso, professor: verProfessor,
      // Biblioteca e repertório vivem em /music/biblioteca.js: são a Fase
      // 2 inteira, e caberiam mal num arquivo que já é grande.
      biblioteca: function () { window.MusiqueBiblioteca.verBiblioteca(); },
      repertorios: function () { window.MusiqueBiblioteca.verRepertorios(); },
    };
    (telas[aba] || verEstudar)();
  }

  // =================================================================
  // ESTUDAR
  // =================================================================
  function verEstudar() {
    api('GET', '/estudo').then(function (d) {
      estado.eu = d; pintarMenu();
      var c = $('#corpo'); c.innerHTML = '';

      var seq = d.estatisticas.sequencia_dias;
      c.appendChild(el('div', { class: 'kpis', html:
        cartao(seq, seq === 1 ? 'dia seguido' : 'dias seguidos', seq ? 'continue amanha para nao zerar' : 'comece hoje') +
        cartao(d.estatisticas.minutos_praticados, 'minutos em 30 dias', d.estatisticas.sessoes + ' sessao(oes)') +
        cartao(d.estatisticas.tentativas, 'exercicios feitos', d.estatisticas.acertos + ' certos') +
        cartao(d.tarefas, 'tarefa(s) do professor', d.tarefas ? 'veja em Tarefas' : 'nenhuma pendente')
      }));

      if (!d.calibracao.calibrado) {
        c.appendChild(el('div', { class: 'alerta', html:
          '<b>Calibre o microfone.</b> ' + esc(d.calibracao.motivo) +
          ' Sem isso, exercicios de canto, afinacao e ritmo continuam funcionando, mas o resultado sai como ' +
          '<b>indicacao</b>, nao como nota. <button class="btn peq" id="b-calibrar">Calibrar agora</button>' }));
        $('#b-calibrar').onclick = calibrar;
      }

      if (d.revisar_hoje.length) {
        c.appendChild(el('h2', { txt: 'Para revisar hoje' }));
        c.appendChild(el('p', { class: 'sub', txt:
          'A revisao volta no intervalo em que voce tende a esquecer - e o que faz o estudo render mais do que repetir tudo todo dia.' }));
        var lista = el('div', { class: 'grade' });
        d.revisar_hoje.forEach(function (r) {
          var tipo = r.tipos[0];
          lista.appendChild(el('button', {
            class: 'item', onclick: function () { praticarTipo(tipo); },
            html: '<b>' + esc(nomeFamilia(r.familia)) + '</b><span>nivel ' + r.nivel + ' - toque para praticar</span>',
          }));
        });
        c.appendChild(lista);
      }

      c.appendChild(el('h2', { txt: 'Trilhas' }));
      var g = el('div', { class: 'grade' });
      d.trilhas.forEach(function (t) {
        var pc = t.progresso.total ? Math.round(100 * t.progresso.item_atual / t.progresso.total) : 0;
        g.appendChild(el('button', {
          class: 'item trilha', onclick: function () { abrirTrilha(t); },
          html: '<b>' + esc(t.titulo) + '</b><span>' + esc(t.descricao) + '</span>' +
            '<div class="barra"><i style="width:' + pc + '%"></i></div>' +
            '<span class="peq">' + t.progresso.item_atual + ' de ' + t.progresso.total +
            (t.progresso.concluida_em ? ' - concluida' : '') + '</span>',
        }));
      });
      c.appendChild(g);
    }).catch(function (e) { $('#corpo').innerHTML = ''; erro(e.message); });
  }

  function cartao(n, rot, obs) {
    return '<div class="kpi"><div class="n">' + esc(n) + '</div><div class="rot">' + esc(rot) + '</div>' +
      (obs ? '<div class="obs">' + esc(obs) + '</div>' : '') + '</div>';
  }
  function nomeFamilia(f) {
    return ({ intervalo: 'Intervalos', acorde: 'Acordes', escala: 'Escalas', leitura: 'Leitura',
      ritmo: 'Ritmo', afinacao: 'Afinacao', ditado: 'Ditado', harmonia: 'Harmonia',
      melodia: 'Melodia' })[f] || f;
  }

  function abrirTrilha(t) {
    var atual = t.itens.filter(function (i) { return i.estado === 'atual'; })[0] || t.itens[0];
    if (!atual) return;
    estado.trilhaSlug = t.slug;
    praticarTipo(atual.tipo, atual.nivel);
  }

  // =================================================================
  // CALIBRACAO
  // =================================================================
  function calibrar() {
    var c = $('#corpo'); c.innerHTML = '';
    c.appendChild(el('h2', { txt: 'Calibrar o microfone' }));
    c.appendChild(el('p', { class: 'sub', txt:
      'Fique em silencio por 3 segundos. Vou medir o ruido do seu ambiente para saber se da para medir o seu som com confianca.' }));
    var estadoTxt = el('div', { class: 'alerta', txt: 'Pronto para comecar.' });
    c.appendChild(estadoTxt);
    var b = el('button', { class: 'btn', txt: 'Medir agora' });
    c.appendChild(b);
    b.onclick = function () {
      b.disabled = true;
      estadoTxt.textContent = 'Medindo... fique em silencio.';
      A.medirRuido(3000).then(function (r) {
        return api('POST', '/calibracao', { ruido_db: r.db });
      }).then(function (d) {
        estadoTxt.className = 'alerta ' + (d.calibracao.microfone_ok ? 'bom' : 'ruim');
        estadoTxt.textContent = d.calibracao.microfone_ok
          ? 'Pronto: ruido de ' + d.calibracao.ruido_db + ' dB. Seus exercicios com microfone podem valer nota.'
          : d.calibracao.aviso;
        b.disabled = false; b.textContent = 'Medir de novo';
      }).catch(function (e) {
        estadoTxt.className = 'alerta ruim'; estadoTxt.textContent = e.message;
        b.disabled = false;
      });
    };
  }

  // =================================================================
  // PRATICAR
  // =================================================================
  function verPraticar() {
    api('GET', '/exercicios/tipos').then(function (d) {
      estado.tipos = d.tipos;
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: 'Praticar' }));
      c.appendChild(el('p', { class: 'sub', txt: 'Escolha o que treinar. O nivel se ajusta ao seu desempenho.' }));
      var g = el('div', { class: 'grade' });
      d.tipos.forEach(function (t) {
        g.appendChild(el('button', {
          class: 'item', onclick: function () { praticarTipo(t.id); },
          html: '<b>' + esc(t.pt) + '</b><span>' + esc(t.contrato.mede) + '</span>' +
            (t.mic ? '<span class="chip">precisa de microfone</span>' : '') +
            (t.contrato.pode_valer_nota ? '' : '<span class="chip alerta">so indicacao</span>'),
        }));
      });
      c.appendChild(g);
    }).catch(function (e) { erro(e.message); });
  }

  function praticarTipo(tipo, nivel) {
    estado.aba = 'praticar'; pintarMenu(); carregando();
    var pedido = { tipo: tipo };
    if (nivel) pedido.nivel = nivel;
    if (estado.trilhaSlug) pedido.trilha_id = estado.trilhaSlug;
    (estado.sessao ? Promise.resolve({ sessao: estado.sessao })
      : api('POST', '/sessoes', { meta: 'pratica livre' }))
      .then(function (s) { estado.sessao = s.sessao; return api('POST', '/exercicios/proximo', pedido); })
      .then(function (d) { estado.item = d.item; estado.inicioItem = Date.now(); pintarItem(); })
      .catch(function (e) { $('#corpo').innerHTML = ''; erro(e.message); });
  }

  function pintarItem() {
    var it = estado.item, c = $('#corpo');
    c.innerHTML = '';

    c.appendChild(el('div', { class: 'cabec-ex', html:
      '<span class="chip">' + esc(nomeFamilia(it.familia)) + ' - nivel ' + it.nivel + '</span>' }));
    c.appendChild(el('h2', { class: 'enunciado', txt: it.enunciado }));
    if (it.dica) c.appendChild(el('p', { class: 'sub', txt: it.dica }));

    // O CONTRATO da medida, ANTES de responder (decisao Q5).
    var ct = it.contrato;
    c.appendChild(el('div', { class: 'contrato', html:
      '<b>O que vai ser medido</b><p>' + esc(ct.mede) + '</p>' +
      '<p class="peq">' + esc(ct.tolerancia_texto) + '</p>' +
      '<p class="peq">' + (ct.pode_valer_nota
        ? 'Este exercicio pode valer nota.'
        : 'Este exercicio vale como treino, nao como nota.') +
      (ct.aviso_calibracao ? ' <b>' + esc(ct.aviso_calibracao) + '</b>' : '') + '</p>' }));

    if (it.tocar) {
      var bt = el('button', { class: 'btn', txt: 'Ouvir' });
      bt.onclick = function () {
        bt.disabled = true;
        var d = A.tocar(it.tocar);
        setTimeout(function () { bt.disabled = false; }, d * 1000 + 200);
      };
      c.appendChild(bt);
    }
    if (it.partitura) c.appendChild(pauta(it.partitura));

    c.appendChild(respostaUI(it));
    c.appendChild(el('div', { id: 'resultado' }));
  }

  /**
   * Pauta em SVG. Este desenho NAO calcula posicao: \`y\`, as linhas e as
   * suplementares vem PRONTOS do servidor (teoria.posicaoNaPauta), onde a
   * geometria e pura e testada nota por nota.
   *
   * Ficou assim depois de a versao que calculava aqui desenhar a nota um
   * grau ACIMA do lugar: o exercicio de leitura reprovava quem lia certo,
   * e nenhum teste de servidor podia ver isso. Geometria que o usuario LE
   * e regra de dominio, nao detalhe de desenho.
   *
   * A clave aparece como glifo E como legenda escrita: U+1D11E nao existe
   * em toda fonte, e um quadradinho vazio numa tela que ensina LEITURA e
   * pior do que uma legenda honesta.
   */
  function pauta(p) {
    var linhas = (p.linhas || []).map(function (y) {
      return '<line x1="20" y1="' + y + '" x2="262" y2="' + y + '" stroke="#1F2933" stroke-width="1.2"/>';
    }).join('');
    var supl = (p.suplementares || []).map(function (y) {
      return '<line x1="128" y1="' + y + '" x2="164" y2="' + y + '" stroke="#1F2933" stroke-width="1.2"/>';
    }).join('');
    // O ACIDENTE vem antes da cabeca, e nao e enfeite: nota alterada
    // ocupa a MESMA linha da natural, e so o sinal distingue fa# de fa.
    // Desenhar a cabeca sem ele fazia o aluno ler "fa", responder "fa" e
    // ser reprovado pelo gabarito "fa sustenido".
    var acidente = p.acidente_glifo
      ? '<text x="118" y="' + (p.y + 7) + '" font-size="26" font-family="serif" fill="#1F2933">' +
        p.acidente_glifo + '</text>'
      : '';
    // A caixa acompanha a nota. Com altura fixa, uma nota grave (do3, no
    // nivel 5) caia FORA do desenho e por cima da legenda — a tela
    // simplesmente nao mostrava o que estava perguntando.
    var topo = Math.min(58, p.y - 24);
    var base = Math.max(150, p.y + 24);
    var altura = base - topo + 26;
    return el('div', { class: 'pauta', html:
      '<svg viewBox="0 ' + topo + ' 280 ' + altura + '" width="280" height="' + Math.round(altura) + '" ' +
        'role="img" aria-label="Uma nota escrita na pauta, em clave de sol">' +
      linhas + supl + acidente +
      '<text x="26" y="134" font-size="78" font-family="Bravura, Noto Music, serif" aria-hidden="true">\\u{1D11E}</text>' +
      '<ellipse cx="146" cy="' + p.y + '" rx="9.5" ry="6.8" fill="#1F2933" transform="rotate(-18 146 ' + p.y + ')"/>' +
      '<text x="20" y="' + (base + 16) + '" font-size="12" fill="#5B6478" font-family="Inter,sans-serif">clave de sol</text>' +
      '</svg>' });
  }

  function respostaUI(it) {
    var caixa = el('div', { class: 'resposta' });

    if (it.opcoes && it.opcoes.length) {
      var g = el('div', { class: 'opcoes' });
      it.opcoes.forEach(function (o) {
        g.appendChild(el('button', { class: 'opc', txt: o.rotulo,
          onclick: function () { responder({ valor: o.valor }); } }));
      });
      caixa.appendChild(g);
      return caixa;
    }

    if (it.modo === 'texto' || it.modo === 'escolha') {
      var inp = el('input', { type: 'text', id: 'r-texto', placeholder: 'Escreva a resposta', autocomplete: 'off' });
      var b = el('button', { class: 'btn', txt: 'Responder', onclick: function () { responder({ valor: inp.value }); } });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') b.click(); });
      caixa.appendChild(el('div', { class: 'linha' }, [inp, b]));
      return caixa;
    }

    // modos por microfone
    var info = el('div', { class: 'micinfo', txt: '' });
    var bg = el('button', { class: 'btn', txt: 'Gravar' });
    bg.onclick = function () { gravarResposta(it, bg, info); };
    caixa.appendChild(el('div', { class: 'linha' }, [bg]));
    caixa.appendChild(info);
    return caixa;
  }

  function gravarResposta(it, botao, info) {
    botao.disabled = true;
    var duracao = it.modo === 'sustentada' ? 3500 : 8000;

    info.textContent = 'Gravando...';
    var aoVivo = function (r) {
      if (r && r.hz > 0) info.textContent = 'ouvindo: ' + Math.round(r.hz) + ' Hz';
      else if (typeof r === 'number') info.textContent = r + ' ataque(s)';
    };

    var captura = it.modo === 'sustentada' ? A.capturarSustentada(duracao, aoVivo)
      : it.modo === 'palma' ? A.capturarOnsets(duracao, aoVivo)
      : A.capturarMelodia(duracao, aoVivo);

    captura.then(function (dados) {
      info.textContent = 'Enviando...';
      var resposta = it.modo === 'sustentada' ? { amostras: dados }
        : it.modo === 'palma' ? { onsets: dados } : { eventos: dados };
      return responder(resposta);
    }).catch(function (e) {
      botao.disabled = false; info.textContent = '';
      erro(e.message);
    });
  }

  function responder(resposta) {
    var it = estado.item;
    return api('POST', '/exercicios/responder', {
      tipo: it.tipo, nivel: it.nivel, semente: it.semente, resposta: resposta,
      sessao_id: estado.sessao && estado.sessao.id, trilha_id: it.trilha_id || '',
      ms_gasto: Date.now() - estado.inicioItem,
    }).then(pintarResultado).catch(function (e) { erro(e.message); });
  }

  function pintarResultado(r) {
    var alvo = $('#resultado');
    [].slice.call(document.querySelectorAll('.resposta button, .resposta input'))
      .forEach(function (b) { b.disabled = true; });

    var classe = r.acerto ? 'bom' : 'ruim';
    var titulo = r.acerto ? 'Acertou' : 'Ainda nao';
    var html = '<div class="alerta ' + classe + '"><b>' + titulo + '</b><p>' + esc(r.explicacao) + '</p></div>';

    if (!r.vale_nota) {
      html += '<div class="alerta"><b>Isto foi uma indicacao, nao uma nota.</b><ul>' +
        (r.ressalvas || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }
    html += '<details class="criterio"><summary>Como foi medido</summary>' +
      '<p>' + esc(r.criterio) + '</p>' +
      '<pre>' + esc(JSON.stringify(r.medida, null, 1)) + '</pre>' +
      '<p class="peq">Confianca da medida: ' + Math.round(r.confianca * 100) + '%</p></details>';
    if (r.proxima_revisao_dias > 0) {
      html += '<p class="peq">Volto a te perguntar isto em ' + r.proxima_revisao_dias + ' dia(s).</p>';
    }
    alvo.innerHTML = html;

    var acoes = el('div', { class: 'linha', style: 'margin-top:14px' });
    acoes.appendChild(el('button', { class: 'btn', txt: 'Proximo',
      onclick: function () { estado.trilhaSlug = null; praticarTipo(estado.item.tipo); } }));
    acoes.appendChild(el('button', { class: 'btn sec', txt: 'Parar por hoje', onclick: encerrarSessao }));
    if (!r.acerto) {
      acoes.appendChild(el('button', { class: 'btn sec', txt: 'Discordo da correcao',
        onclick: function () { contestar(r.tentativa_id); } }));
    }
    alvo.appendChild(acoes);
  }

  function encerrarSessao() {
    if (!estado.sessao) return ir('estudar');
    api('POST', '/sessoes/' + estado.sessao.id + '/encerrar', {})
      .then(function () { estado.sessao = null; ir('estudar'); })
      .catch(function (e) { erro(e.message); });
  }

  function contestar(tentativaId) {
    var motivo = prompt('O que voce acha que ficou errado na correcao?');
    if (!motivo) return;
    api('POST', '/contestacoes', { tentativa_id: tentativaId, motivo: motivo })
      .then(function () { aviso('Contestacao registrada. Um professor vai revisar.'); })
      .catch(function (e) { erro(e.message); });
  }

  // =================================================================
  // TAREFAS (aluno)
  // =================================================================
  function verTarefas() {
    api('GET', '/tarefas').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: 'Tarefas do professor' }));
      if (!d.tarefas.length) {
        c.appendChild(el('p', { class: 'vazio', txt:
          'Nenhuma tarefa por enquanto. Tarefas aparecem aqui quando um professor atribui uma a voce.' }));
        return;
      }
      d.tarefas.forEach(function (t) { c.appendChild(cartaoTarefa(t)); });
    }).catch(function (e) { erro(e.message); });
  }

  function cartaoTarefa(t) {
    var sub = t.minha_submissao;
    var box = el('div', { class: 'card' });
    var estados = { enviada: 'enviada, aguardando o professor', avaliada: 'avaliada',
      devolvida: 'o professor pediu para refazer' };
    box.innerHTML = '<h3>' + esc(t.titulo) + '</h3>' +
      (t.prazo ? '<span class="chip">ate ' + esc(t.prazo) + '</span>' : '') +
      '<p>' + esc(t.descricao || '') + '</p>' +
      (t.instrucoes ? '<p class="sub">' + esc(t.instrucoes) + '</p>' : '') +
      (sub ? '<p class="peq">Estado: <b>' + esc(estados[sub.status] || sub.status) + '</b></p>' : '');

    if (sub && sub.status === 'avaliada') {
      box.appendChild(el('button', { class: 'btn sec', txt: 'Ver o retorno',
        onclick: function () { verFeedback(sub.id); } }));
    }
    if (!sub || sub.status !== 'avaliada') box.appendChild(envioUI(t, sub));
    return box;
  }

  function envioUI(t, sub) {
    var caixa = el('div', { class: 'envio' });
    var txt = el('textarea', { rows: '2', placeholder: 'Um comentario para o professor (opcional)' });
    if (sub && sub.texto) txt.value = sub.texto;
    caixa.appendChild(txt);

    var mediaId = (sub && sub.media_id) || '';
    var info = el('div', { class: 'micinfo', txt: mediaId ? 'gravacao enviada' : '' });
    var bGravar = el('button', { class: 'btn sec', txt: t.exige_audio ? 'Gravar' : 'Gravar (opcional)' });
    var bEnviar = el('button', { class: 'btn', txt: sub ? 'Reenviar' : 'Enviar' });
    var pararGravacao = null;

    bGravar.onclick = function () {
      if (pararGravacao) { pararGravacao(); return; }
      info.textContent = 'Gravando... clique em Parar quando terminar (limite de 30 s).';
      bGravar.textContent = 'Parar';
      gravarArquivo(info, function (fn) { pararGravacao = fn; }).then(function (id) {
        mediaId = id; pararGravacao = null;
        info.textContent = 'Gravacao pronta.';
        bGravar.textContent = 'Regravar';
      }).catch(function (e) {
        pararGravacao = null;
        bGravar.textContent = 'Gravar';
        info.textContent = ''; erro(e.message);
      });
    };
    bEnviar.onclick = function () {
      bEnviar.disabled = true;
      api('POST', '/tarefas/' + t.id + '/enviar', { texto: txt.value, media_id: mediaId })
        .then(function () { verTarefas(); })
        .catch(function (e) { bEnviar.disabled = false; erro(e.message); });
    };
    caixa.appendChild(el('div', { class: 'linha' }, [bGravar, bEnviar]));
    caixa.appendChild(info);
    return caixa;
  }

  /**
   * Grava com MediaRecorder e sobe DIRETO ao bucket por URL presignada.
   * O byte nao passa pelo nosso servidor (ADR-0003).
   */
  function gravarArquivo(info, entregarParada) {
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var rec = new MediaRecorder(stream);
      var pedacos = [];
      rec.ondataavailable = function (e) { if (e.data.size) pedacos.push(e.data); };
      return new Promise(function (resolve, reject) {
        var parar = function () { try { rec.stop(); } catch (e) {} };
        var limite = setTimeout(parar, 30000);
        entregarParada(parar);
        rec.onstop = function () {
          clearTimeout(limite);
          stream.getTracks().forEach(function (t) { t.stop(); });
          var blob = new Blob(pedacos, { type: rec.mimeType || 'audio/webm' });
          info.textContent = 'Enviando ' + Math.round(blob.size / 1024) + ' KB...';
          api('POST', '/midias/upload', { ext: 'webm', mime: blob.type, bytes: blob.size, tipo: 'tarefas' })
            .then(function (d) {
              return fetch(d.url, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob })
                .then(function (r) {
                  if (!r.ok) throw new Error('O armazenamento recusou o arquivo (' + r.status + ').');
                  return api('POST', '/midias/' + d.midia_id + '/confirmar', {});
                })
                .then(function () { resolve(d.midia_id); });
            }).catch(reject);
        };
        rec.start();
      });
    }).catch(function (e) {
      throw new Error(e && e.name === 'NotAllowedError'
        ? 'A permissao do microfone foi negada.' : (e.message || 'Nao consegui gravar.'));
    });
  }

  function verFeedback(submissaoId) {
    api('GET', '/submissoes/' + submissaoId).then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: 'Retorno do professor' }));
      d.feedbacks.forEach(function (f) {
        c.appendChild(el('div', { class: 'card', html:
          (f.nota != null ? '<div class="nota">' + esc(f.nota) + '</div>' : '') +
          '<p>' + esc(f.texto || '') + '</p>' +
          '<p class="peq">' + (f.origem === 'revisao' ? 'revisao de contestacao' : 'professor') +
          ' - ' + esc((f.criado_em || '').slice(0, 10)) + '</p>' }));
      });
      c.appendChild(el('button', { class: 'btn sec', txt: 'Discordo da nota', onclick: function () {
        var motivo = prompt('Explique por que voce discorda:');
        if (!motivo) return;
        api('POST', '/contestacoes', { submissao_id: submissaoId, motivo: motivo })
          .then(function () { aviso('Contestacao registrada.'); })
          .catch(function (e) { erro(e.message); });
      } }));
      c.appendChild(el('button', { class: 'btn', txt: 'Voltar', onclick: verTarefas }));
    }).catch(function (e) { erro(e.message); });
  }

  // =================================================================
  // PROGRESSO
  // =================================================================
  function verProgresso() {
    Promise.all([api('GET', '/estatisticas?dias=90'), api('GET', '/historico?n=30')]).then(function (rs) {
      var e = rs[0].estatisticas, h = rs[1].tentativas;
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: 'Meu progresso' }));
      c.appendChild(el('div', { class: 'kpis', html:
        cartao(e.tentativas, 'exercicios em 90 dias', '') +
        cartao(e.acertos, 'acertos', e.tentativas ? Math.round(100 * e.acertos / e.tentativas) + '%' : '') +
        cartao(e.valeram_nota, 'valeram nota', (e.tentativas - e.valeram_nota) + ' foram indicacao') +
        cartao(e.minutos_praticados, 'minutos de pratica', '')
      }));

      var fams = Object.keys(e.por_familia);
      if (fams.length) {
        c.appendChild(el('h3', { txt: 'Por habilidade' }));
        var tab = el('table', { class: 'tab' });
        tab.innerHTML = '<thead><tr><th>Habilidade</th><th>Nivel</th><th>Acertos</th><th>Valeram nota</th></tr></thead><tbody>' +
          fams.map(function (f) {
            var x = e.por_familia[f];
            return '<tr><td>' + esc(nomeFamilia(f)) + '</td><td>' + x.nivel + '</td><td>' +
              x.acertos + '/' + x.total + '</td><td>' + x.com_nota + '</td></tr>';
          }).join('') + '</tbody>';
        c.appendChild(tab);
      }

      c.appendChild(el('h3', { txt: 'Ultimos exercicios' }));
      if (!h.length) { c.appendChild(el('p', { class: 'vazio', txt: 'Nada por aqui ainda.' })); return; }
      var t2 = el('table', { class: 'tab' });
      t2.innerHTML = '<thead><tr><th>Quando</th><th>Exercicio</th><th>Resultado</th></tr></thead><tbody>' +
        h.map(function (x) {
          return '<tr><td>' + esc((x.criado_em || '').slice(0, 10)) + '</td>' +
            '<td>' + esc(x.enunciado) + '</td>' +
            '<td>' + (x.acerto ? 'certo' : 'errado') +
            (x.vale_nota ? '' : ' <span class="chip alerta">indicacao</span>') + '</td></tr>';
        }).join('') + '</tbody>';
      c.appendChild(t2);
    }).catch(function (e) { erro(e.message); });
  }

  // =================================================================
  // PROFESSOR
  // =================================================================
  function verProfessor() {
    api('GET', '/prof/tarefas').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: 'Minhas tarefas' }));
      if (d.contestacoes_abertas) {
        c.appendChild(el('div', { class: 'alerta', html:
          '<b>' + d.contestacoes_abertas + ' contestacao(oes) esperando voce.</b> ' +
          '<button class="btn peq" id="b-cont">Ver</button>' }));
        $('#b-cont').onclick = verContestacoes;
      }
      c.appendChild(el('button', { class: 'btn', txt: 'Nova tarefa', onclick: novaTarefa }));

      if (!d.tarefas.length) {
        c.appendChild(el('p', { class: 'vazio', txt: 'Nenhuma tarefa ativa.' }));
        return;
      }
      d.tarefas.forEach(function (t) {
        var box = el('div', { class: 'card' });
        box.innerHTML = '<h3>' + esc(t.titulo) + '</h3>' +
          '<p class="peq">' + t.alunos + ' aluno(s) - ' + t.enviadas + ' envio(s) para corrigir</p>' +
          '<p>' + esc(t.descricao || '') + '</p>';
        var linha = el('div', { class: 'linha' });
        linha.appendChild(el('button', { class: 'btn sec', txt: 'Atribuir alunos',
          onclick: function () { atribuir(t); } }));
        linha.appendChild(el('button', { class: 'btn sec', txt: 'Ver envios',
          onclick: function () { verEnvios(t); } }));
        linha.appendChild(el('button', { class: 'btn sec', txt: 'Arquivar',
          onclick: function () { arquivar(t); } }));
        box.appendChild(linha);
        c.appendChild(box);
      });
    }).catch(function (e) { erro(e.message); });
  }

  function novaTarefa() {
    var c = $('#corpo'); c.innerHTML = '';
    c.appendChild(el('h2', { txt: 'Nova tarefa' }));
    var tit = el('input', { type: 'text', placeholder: 'Titulo (ex.: Escala de do em duas oitavas)' });
    var desc = el('textarea', { rows: '2', placeholder: 'Descricao curta' });
    var inst = el('textarea', { rows: '3', placeholder: 'Instrucoes para o aluno' });
    var nota = el('input', { type: 'number', value: '10', min: '1', max: '100', step: '0.5' });
    var audio = el('input', { type: 'checkbox' }); audio.checked = true;
    var prazo = el('input', { type: 'date' });
    c.appendChild(campo('Titulo', tit));
    c.appendChild(campo('Descricao', desc));
    c.appendChild(campo('Instrucoes', inst));
    c.appendChild(campo('Nota maxima', nota));
    c.appendChild(campo('Prazo', prazo));
    c.appendChild(el('label', { class: 'check' }, [audio, el('span', { txt: ' exige gravacao de audio' })]));
    c.appendChild(el('button', { class: 'btn', txt: 'Criar', onclick: function () {
      api('POST', '/prof/tarefas', { titulo: tit.value, descricao: desc.value, instrucoes: inst.value,
        nota_maxima: Number(nota.value), prazo: prazo.value, exige_audio: audio.checked })
        .then(verProfessor).catch(function (e) { erro(e.message); });
    } }));
    c.appendChild(el('button', { class: 'btn sec', txt: 'Cancelar', onclick: verProfessor }));
  }

  function campo(rot, ctrl) {
    return el('div', { class: 'campo' }, [el('label', { txt: rot }), ctrl]);
  }

  function atribuir(t) {
    var emails = prompt('E-mails dos alunos, separados por virgula:');
    if (!emails) return;
    api('POST', '/prof/tarefas/' + t.id + '/alunos', { emails: emails.split(/[,;\\s]+/).filter(Boolean) })
      .then(function (d) {
        // "Atribui 3 de 4" e informacao que o professor PRECISA ver -
        // errar um e-mail e comum, e o silencio faria o aluno sumir.
        var msg = d.atribuidos + ' aluno(s) atribuido(s).';
        if (d.nao_encontrados && d.nao_encontrados.length) {
          msg += ' Nao achei conta para: ' + d.nao_encontrados.join(', ') +
            '. Confira o e-mail, ou peca para a pessoa criar a conta primeiro.';
        }
        verProfessor();
        setTimeout(function () { aviso(msg); }, 60);
      }).catch(function (e) { erro(e.message); });
  }

  function arquivar(t) {
    if (!confirm('Arquivar "' + t.titulo + '"?\\n\\nVoce deixa de ver os envios desta tarefa. Os alunos continuam vendo o proprio trabalho e a nota.')) return;
    api('POST', '/prof/tarefas/' + t.id + '/arquivar', {}).then(verProfessor).catch(function (e) { erro(e.message); });
  }

  function verEnvios(t) {
    api('GET', '/prof/tarefas/' + t.id + '/submissoes').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: 'Envios - ' + t.titulo }));
      if (!d.submissoes.length) c.appendChild(el('p', { class: 'vazio', txt: 'Nenhum envio ainda.' }));
      d.submissoes.forEach(function (sub) {
        var box = el('div', { class: 'card' });
        box.innerHTML = '<p class="peq">' + esc((sub.enviada_em || '').slice(0, 16).replace('T', ' ')) +
          ' - ' + esc(sub.status) + '</p><p>' + esc(sub.texto || '(sem comentario)') + '</p>';
        if (sub.media_id) {
          box.appendChild(el('button', { class: 'btn sec', txt: 'Ouvir a gravacao', onclick: function () {
            api('GET', '/midias/' + sub.media_id).then(function (m) {
              if (!m.url) return erro('A gravacao ainda esta sendo processada. Tente em instantes.');
              box.appendChild(el('audio', { controls: 'controls', src: m.url }));
            }).catch(function (e) { erro(e.message); });
          } }));
        }
        (sub.feedbacks || []).forEach(function (f) {
          box.appendChild(el('div', { class: 'alerta', html:
            (f.nota != null ? '<b>Nota ' + esc(f.nota) + '</b> ' : '') + esc(f.texto || '') }));
        });
        var txt = el('textarea', { rows: '2', placeholder: 'Retorno para o aluno' });
        var nota = el('input', { type: 'number', placeholder: 'Nota', min: '0',
          max: String(t.nota_maxima || 10), step: '0.5' });
        var linha = el('div', { class: 'linha' }, [nota,
          el('button', { class: 'btn', txt: 'Enviar retorno', onclick: function () {
            api('POST', '/prof/submissoes/' + sub.id + '/feedback',
              { texto: txt.value, nota: nota.value === '' ? null : Number(nota.value) })
              .then(function () { verEnvios(t); }).catch(function (e) { erro(e.message); });
          } }),
          el('button', { class: 'btn sec', txt: 'Pedir para refazer', onclick: function () {
            api('POST', '/prof/submissoes/' + sub.id + '/feedback', { texto: txt.value, devolver: true })
              .then(function () { verEnvios(t); }).catch(function (e) { erro(e.message); });
          } })]);
        box.appendChild(txt); box.appendChild(linha);
        c.appendChild(box);
      });
      c.appendChild(el('button', { class: 'btn sec', txt: 'Voltar', onclick: verProfessor }));
    }).catch(function (e) { erro(e.message); });
  }

  function verContestacoes() {
    api('GET', '/prof/contestacoes').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: 'Contestacoes' }));
      if (!d.contestacoes.length) c.appendChild(el('p', { class: 'vazio', txt: 'Nenhuma aberta.' }));
      d.contestacoes.forEach(function (x) {
        var box = el('div', { class: 'card', html: '<p>' + esc(x.motivo) + '</p><p class="peq">' +
          esc((x.criado_em || '').slice(0, 10)) + '</p>' });
        var resp = el('textarea', { rows: '2', placeholder: 'Sua resposta ao aluno' });
        var nova = el('input', { type: 'number', placeholder: 'Nota nova (opcional)', step: '0.5' });
        box.appendChild(resp);
        box.appendChild(el('div', { class: 'linha' }, [nova,
          el('button', { class: 'btn', txt: 'Acolher', onclick: function () {
            api('POST', '/prof/contestacoes/' + x.id, { acolher: true, resposta: resp.value,
              nota_nova: nova.value === '' ? null : Number(nova.value) })
              .then(verContestacoes).catch(function (e) { erro(e.message); });
          } }),
          el('button', { class: 'btn sec', txt: 'Manter a nota', onclick: function () {
            api('POST', '/prof/contestacoes/' + x.id, { acolher: false, resposta: resp.value })
              .then(verContestacoes).catch(function (e) { erro(e.message); });
          } })]));
        c.appendChild(box);
      });
      c.appendChild(el('button', { class: 'btn sec', txt: 'Voltar', onclick: verProfessor }));
    }).catch(function (e) { erro(e.message); });
  }

  // ---- o que as outras telas do app reusam ------------------------
  // Um só lugar para \`api\`, \`el\` e as caixas de aviso: duas
  // implementações de "mostrar erro" acabariam divergindo, e o usuário
  // veria dois comportamentos para a mesma coisa.
  window.MusiqueUI = {
    $: $, el: el, esc: esc, api: api, erro: erro, aviso: aviso,
    carregando: carregando, ir: ir,
  };

  // ---- boot ------------------------------------------------------
  ir('estudar');
})();
`;

function registrar(app) {
  app.get('/music/app.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .send(JS);
  });
}

module.exports = { registrar, JS };
