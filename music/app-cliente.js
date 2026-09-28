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
// ⚠️ Acentos do português são permitidos neste arquivo. Só caractere
// fora do plano básico (emoji, o glifo da clave de sol...) entra como
// escape `\u{...}` — ele foi ASCII puro até 28/09/2026, quando a tela
// aparecia sem til, circunflexo e cedilha.
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
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
        if (r.status === 401) { location.href = '/music/entrar?voltar=' + encodeURIComponent(location.pathname + location.hash); throw new Error('sessao'); }
        // 402: o teste acabou e não há assinatura. Vai para Minha conta, onde está o Assinar.
        if (r.status === 402) { estado.semAcesso = true; var fx = $('#faixa-teste'); if (fx) fx.remove(); if (estado.aba !== 'conta') ir('conta'); throw new Error('assinatura'); }
        if (!r.ok) { var e = new Error((d && d.erro) || ('Erro ' + r.status)); e.dados = d; throw e; }
        return d;
      });
    }).catch(function (e) {
      // Rede caida nao e erro do servidor. Dizer "falhou" sem dizer o que
      // falhou e o que faz o usuario achar que o produto quebrou.
      if (e instanceof TypeError) throw new Error('Não consegui falar com o servidor. Verifique a conexão.');
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
    if (msg === 'sessao' || msg === 'assinatura') return;   // já redirecionou: nada de erro técnico na tela
    var c = $('#corpo');
    var caixa = el('div', { class: 'alerta ruim', txt: msg });
    c.insertBefore(caixa, c.firstChild);
    caixa.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function () { caixa.remove(); }, 9000);
  }
  function carregando() { $('#corpo').innerHTML = '<p class="vazio">Carregando...</p>'; }

  // ---- icones e cores (28/09/2026: "a pagina de trilhas esta sem cor") ----
  // Cada familia de exercicio tem icone e cor proprios, usados na trilha,
  // no Praticar e na revisao - a mesma cor para a mesma coisa em todo lugar.
  var FAMILIAS = {
    intervalo: { ico: '\u{1F4D0}', fundo: '#E0F2FE', cor: '#0369A1' },
    acorde:    { ico: '\u{1F3B8}', fundo: '#FCE7F3', cor: '#BE185D' },
    escala:    { ico: '\u{1F3B9}', fundo: '#EDE9FE', cor: '#6D28D9' },
    leitura:   { ico: '\u{1F3BC}', fundo: '#FEF3C7', cor: '#B45309' },
    ditado:    { ico: '\u{270D}\u{FE0F}', fundo: '#E0E7FF', cor: '#4338CA' },
    harmonia:  { ico: '\u{1F3B6}', fundo: '#DCFCE7', cor: '#15803D' },
    afinacao:  { ico: '\u{1F3A4}', fundo: '#FFE4E6', cor: '#BE123C' },
    ritmo:     { ico: '\u{1F941}', fundo: '#FFEDD5', cor: '#C2410C' },
    melodia:   { ico: '\u{1F3B5}', fundo: '#CCFBF1', cor: '#0F766E' },
    geral:     { ico: '\u{1F3B5}', fundo: '#F1F5F9', cor: '#1B2A4A' },
  };
  // Aceita familia ('ritmo') ou tipo ('percepcao.intervalo', 'harmonia.grau').
  function familiaDe(s) {
    s = String(s || '');
    var ks = Object.keys(FAMILIAS);
    for (var i = 0; i < ks.length; i++) if (s.indexOf(ks[i]) >= 0) return FAMILIAS[ks[i]];
    return FAMILIAS.geral;
  }
  var TRILHAS_VISUAL = {
    'primeiros-passos':       { ico: '\u{1F331}', fundo: '#DCFCE7', cor: '#15803D' },
    'ouvido-intervalos':      { ico: '\u{1F442}', fundo: '#E0F2FE', cor: '#0369A1' },
    'ritmo-e-pulso':          { ico: '\u{1F941}', fundo: '#FFEDD5', cor: '#C2410C' },
    'harmonia-basica':        { ico: '\u{1F3B8}', fundo: '#FCE7F3', cor: '#BE185D' },
    'canto-afinado':          { ico: '\u{1F3A4}', fundo: '#FFE4E6', cor: '#BE123C' },
    'leitura-primeira-vista': { ico: '\u{1F3BC}', fundo: '#FEF3C7', cor: '#B45309' },
  };
  function visualTrilha(t) { return TRILHAS_VISUAL[t.slug] || familiaDe(t.slug); }
  function icone(v, grande) {
    return '<span class="ico' + (grande ? ' g' : '') + '" style="background:' + v.fundo + ';color:' + v.cor + '" aria-hidden="true">' + v.ico + '</span>';
  }
  var ICONES_ABA = {
    estudar: '\u{1F4DA}', cifras: '\u{1F3B8}', praticar: '\u{1F3AF}', biblioteca: '\u{1F4D6}',
    repertorios: '\u{1F5C2}\u{FE0F}', tarefas: '\u{1F4DD}', progresso: '\u{1F4C8}',
    minhas_turmas: '\u{1F465}', professor: '\u{1F9D1}\u{200D}\u{1F3EB}', escola: '\u{1F3EB}', conta: '\u{1F464}',
    cursos: '\u{1F393}',
  };

  // ---- navegacao -------------------------------------------------
  var ABAS = [
    ['estudar', 'Estudar'], ['cifras', 'Cifras'], ['praticar', 'Praticar'],
    ['biblioteca', 'Biblioteca'], ['repertorios', 'Repertórios'],
    ['tarefas', 'Tarefas'], ['progresso', 'Meu progresso'], ['cursos', 'Cursos'],
    ['minhas_turmas', 'Minhas turmas'], ['professor', 'Professor'], ['escola', 'Escola'],
    ['conta', 'Minha conta'],
  ];
  function pintarMenu() {
    $('#menu').innerHTML = '';
    ABAS.forEach(function (a) {
      // Aba que nao serve para a pessoa nao aparece. Mostrar "Escola"
      // para quem nao trabalha em nenhuma so renderia uma tela vazia.
      if (a[0] === 'professor' && !(estado.eu && estado.eu.sou_professor)) return;
      // A aba de escola aparece para quem JA tem escola e para quem da
      // aula: alguem precisa ter por onde criar a primeira. Para o aluno
      // puro ela nao aparece — abriria vazia, e aba vazia parece defeito.
      if (a[0] === 'escola' && !(estado.eu
        && (estado.eu.trabalha_em_escola || estado.eu.sou_professor))) return;
      if (a[0] === 'minhas_turmas' && !(estado.eu && estado.eu.estuda_em_escola)) return;
      $('#menu').appendChild(el('button', {
        class: 'aba' + (estado.aba === a[0] ? ' on' : ''), txt: (ICONES_ABA[a[0]] ? ICONES_ABA[a[0]] + ' ' : '') + a[1],
        'aria-current': estado.aba === a[0] ? 'page' : 'false',
        onclick: function () { ir(a[0]); },
      }));
    });
  }
  // A aba vai para o endereço (#praticar, #tarefas...): F5 e link copiado
  // reabrem nela. As Cifras cuidam do proprio endereço (#cifras/acordes,
  // #cifra=ID), por isso aqui só se garante o prefixo.
  function gravarAba(aba) {
    var h = '#' + aba;
    if (aba === 'cifras' && /^#(cifras|cifra=|musica=|banda=|setlist=|convite=|vivo=)/.test(location.hash)) return;
    try { if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h); } catch (_) {}
  }
  function ir(aba) {
    estado.aba = aba; gravarAba(aba); pintarMenu(); carregando();
    var telas = {
      estudar: verEstudar, praticar: verPraticar, tarefas: verTarefas,
      progresso: verProgresso, professor: verProfessor,
      // Biblioteca e repertório vivem em /music/biblioteca.js: são a Fase
      // 2 inteira, e caberiam mal num arquivo que já é grande.
      biblioteca: function () { window.MusiqueBiblioteca.verBiblioteca(); },
      repertorios: function () { window.MusiqueBiblioteca.verRepertorios(); },
      // Cifras (28/09/2026) vivem em /music/cifras.js: acervo, editor,
      // setlists de palco, bandas e sessão ao vivo.
      cifras: function () { window.MusiqueCifras.abrir(); },
      // Escola e turma vivem em /music/escolas.js — a Fase 3 inteira.
      escola: function () { window.MusiqueEscolas.verEscolas(); },
      minhas_turmas: function () { window.MusiqueEscolas.verMinhasTurmas(); },
      conta: verConta, cursos: verCursos,
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
        cartao(seq, seq === 1 ? 'dia seguido' : 'dias seguidos', seq ? 'continue amanhã para não zerar' : 'comece hoje', '\u{1F525}') +
        cartao(d.estatisticas.minutos_praticados, 'minutos em 30 dias', d.estatisticas.sessoes + ' sessão(ões)', '\u{23F1}\u{FE0F}') +
        cartao(d.estatisticas.tentativas, 'exercícios feitos', d.estatisticas.acertos + ' certos', '\u{2705}') +
        cartao(d.tarefas, 'tarefa(s) do professor', d.tarefas ? 'veja em Tarefas' : 'nenhuma pendente', '\u{1F4DD}')
      }));

      if (!d.calibracao.calibrado) {
        c.appendChild(el('div', { class: 'alerta', html:
          '<b>Calibre o microfone.</b> ' + esc(d.calibracao.motivo) +
          ' Sem isso, exercícios de canto, afinação e ritmo continuam funcionando, mas o resultado sai como ' +
          '<b>indicação</b>, não como nota. <button class="btn peq" id="b-calibrar">Calibrar agora</button>' }));
        $('#b-calibrar').onclick = calibrar;
      }

      if (d.revisar_hoje.length) {
        c.appendChild(el('h2', { txt: '\u{1F501} Para revisar hoje' }));
        c.appendChild(el('p', { class: 'sub', txt:
          'A revisão volta no intervalo em que você tende a esquecer - é o que faz o estudo render mais do que repetir tudo todo dia.' }));
        var lista = el('div', { class: 'grade' });
        d.revisar_hoje.forEach(function (r) {
          var tipo = r.tipos[0], v = familiaDe(r.familia);
          lista.appendChild(el('button', {
            class: 'item com-ico', onclick: function () { praticarTipo(tipo); },
            style: 'border-left:4px solid ' + v.cor,
            html: '<div class="topo-item">' + icone(v) + '<b>' + esc(nomeFamilia(r.familia)) + '</b></div><span>nível ' + r.nivel + ' - toque para praticar</span>',
          }));
        });
        c.appendChild(lista);
      }

      c.appendChild(el('h2', { txt: '\u{1F9ED} Trilhas' }));
      var g = el('div', { class: 'grade' });
      d.trilhas.forEach(function (t) {
        var pc = t.progresso.total ? Math.round(100 * t.progresso.item_atual / t.progresso.total) : 0;
        var v = visualTrilha(t);
        // Cada etapa vira um icone: feita, a atual (destacada) e as travadas.
        var passos = (t.itens || []).map(function (it) {
          var f = familiaDe(it.tipo);
          return '<span class="passo ' + esc(it.estado) + '" title="' + esc(it.titulo || nomeFamilia(it.familia)) +
            (it.estado === 'concluido' ? ' (feito)' : it.estado === 'atual' ? ' (agora)' : ' (depois)') + '"' +
            ' style="background:' + f.fundo + ';border-color:' + f.cor + '">' + f.ico + '</span>';
        }).join('');
        g.appendChild(el('button', {
          class: 'item trilha com-ico', onclick: function () { abrirTrilha(t); },
          style: 'border-top:4px solid ' + v.cor,
          html: '<div class="topo-item">' + icone(v, true) + '<b>' + esc(t.titulo) + '</b></div>' +
            '<span>' + esc(t.descricao) + '</span>' +
            (passos ? '<div class="passos">' + passos + '</div>' : '') +
            '<div class="barra"><i style="width:' + pc + '%;background:' + v.cor + '"></i></div>' +
            '<span class="peq">' + (t.progresso.concluida_em ? '\u{1F3C6} concluída' : t.progresso.item_atual + ' de ' + t.progresso.total + ' etapas') + '</span>',
        }));
      });
      c.appendChild(g);
      pintarCursos(c, d.trilhas);
    }).catch(function (e) { $('#corpo').innerHTML = ''; erro(e.message); });
  }

  // Cursos da Academia (ADR-0011): o UNICO elo entre os dois sistemas do
  // lado do aluno. O curso ligado a uma trilha vem primeiro, com o motivo;
  // depois os de musica publicados. A compra e as aulas ficam na Academia,
  // com a conta de la - por isso o link abre em outra aba.
  function pintarCursos(c, trilhas) {
    var ligados = [];
    (trilhas || []).forEach(function (t) {
      if (t.curso_academia) ligados.push({ curso: t.curso_academia, motivo: 'Complementa a trilha ' + t.titulo });
    });
    api('GET', '/cursos').catch(function () { return { cursos: [] }; }).then(function (r) {
      var vistos = {};
      var todos = ligados.concat((r.cursos || []).map(function (x) { return { curso: x, motivo: '' }; }))
        .filter(function (x) { if (vistos[x.curso.slug]) return false; vistos[x.curso.slug] = 1; return true; });
      if (!todos.length) return;
      c.appendChild(el('h2', { txt: '\u{1F393} Cursos na Academia Villela' }));
      c.appendChild(el('p', { class: 'sub', txt: 'Os cursos ficam na Academia, que tem conta própria. Abrem em outra aba.' }));
      var g = el('div', { class: 'grade' });
      todos.forEach(function (x) {
        var a = el('a', { class: 'item com-ico', href: x.curso.url, target: '_blank', rel: 'noopener',
          style: 'border-left:4px solid #C9A227',
          html: '<div class="topo-item">' + icone({ ico: '\u{1F393}', fundo: '#FDF6E3', cor: '#8A6D12' }) + '<b>' + esc(x.curso.titulo) + '</b></div>' +
            '<span>' + esc(x.motivo || x.curso.subtitulo || '') + '</span>' +
            (x.curso.produtor ? '<span class="peq">com ' + esc(x.curso.produtor) + '</span>' : '') });
        g.appendChild(a);
      });
      c.appendChild(g);
    });
  }

  // =================================================================
  // CURSOS: os cursos de música publicados na Academia Villela (ADR-0011:
  // o curso é o elo entre os dois sistemas). Compra e aulas ficam lá, com
  // a conta de lá; aqui o Musique mostra, indica e liga à trilha.
  // =================================================================
  // ---- ASSINATURA: o que mostrar, nos dois lugares (Cursos e Minha conta) ----
  function reais(c) { return 'R$ ' + (c / 100).toFixed(2).replace('.', ','); }
  function dataBR(iso) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : ''; }
  function assinar() {
    api('POST', '/assinatura/assinar').then(function (r) { location.href = r.link; }).catch(function (e) { erro(e.message); });
  }
  function cartaoAssinatura(st, onde) {
    var box = el('div', { class: onde === 'conta' ? 'cartao-conta' : 'card assin-card' });
    var a = st.assinatura, preco = reais(st.plano.preco_cents);
    var titulo = '<h3>\u{1F4B3} Assinatura Musique</h3>';
    if (a && a.status === 'cortesia') {
      box.innerHTML = titulo + '<p class="sub"><b>Cortesia' + (a.origem === 'dono' ? ' vitalícia' : '') + '.</b> Os cursos de música da Academia estão incluídos, sem cobrança.</p>';
    } else if (a && a.status === 'ativa') {
      box.innerHTML = titulo + '<p class="sub"><b>\u{2705} Ativa</b> desde ' + dataBR(a.desde) + ' · ' + reais(a.preco_cents || st.plano.preco_cents) + '/mês' +
        (a.ultimo_pagamento_em ? ' · último pagamento em ' + dataBR(a.ultimo_pagamento_em) : '') + '.</p>';
      if (onde === 'conta') box.appendChild(el('button', { class: 'btn peq sec', txt: 'Cancelar a assinatura', onclick: function () {
        if (!confirm('Cancelar a assinatura? Não haverá novas cobranças; você usa o Musique e os cursos da Academia até o fim do mês já pago.')) return;
        api('POST', '/assinatura/cancelar').then(function () { aviso('Assinatura cancelada.'); verConta(); }).catch(function (e) { erro(e.message); });
      } }));
    } else if (a && a.status === 'inadimplente') {
      box.innerHTML = titulo + '<p class="sub"><b>\u{26A0}\u{FE0F} Pagamento não confirmado.</b> ' + (st.acesso
        ? 'Os cursos continuam liberados por ' + st.plano.carencia_dias + ' dias enquanto o Mercado Pago tenta de novo. Confira o cartão cadastrado lá.'
        : 'O prazo de tolerância acabou e os cursos saíram da sua conta da Academia. Assine de novo para voltar.') + '</p>';
      if (!st.acesso) box.appendChild(el('button', { class: 'btn peq', txt: 'Assinar de novo', onclick: assinar }));
    } else if (a && a.status === 'pendente') {
      box.innerHTML = titulo + '<p class="sub"><b>\u{23F3} Aguardando o pagamento no Mercado Pago.</b> Assim que ele confirmar, os cursos chegam na sua conta da Academia.</p>';
      if (a.link) box.appendChild(el('a', { class: 'btn peq', href: a.link, txt: 'Continuar o pagamento' }));
    } else {
      var u = st.uso || {};
      box.innerHTML = titulo +
        (u.motivo === 'teste' ? '<p class="alerta" style="margin:0 0 10px">\u{1F381} Teste grátis: faltam <b>' + u.teste.dias_restantes + ' dia(s)</b>.</p>' : '') +
        (u.motivo === 'pago_ate' ? '<p class="alerta" style="margin:0 0 10px">Assinatura cancelada: você usa até <b>' + dataBR(u.ate) + '</b>.</p>' : '') +
        (!u.acesso ? '<p class="alerta ruim" style="margin:0 0 10px"><b>O seu teste grátis terminou.</b> Assine para continuar usando o Musique. Os seus dados continuam guardados.</p>' : '') +
        '<p class="sub">O Musique custa <b>' + preco + '/mês</b> e inclui <b>todos os cursos de música da Academia Villela</b>, que chegam na conta da Academia com o seu e-mail. Cancele quando quiser: você usa até o fim do mês pago.</p>';
      if (!st.email_verificado) box.appendChild(el('p', { class: 'peq', txt: 'Para assinar, confirme primeiro o seu e-mail: é por ele que os cursos chegam na Academia.' }));
      else if (!st.cobranca_ligada) box.appendChild(el('p', { class: 'peq', txt: 'O pagamento online está temporariamente indisponível.' }));
      else box.appendChild(el('button', { class: 'btn', txt: 'Assinar por ' + preco + '/mês', onclick: assinar }));
    }
    if (st.cortesia_academia && st.acesso) {
      box.appendChild(el('p', { class: 'peq', html: '\u{1F393} Na Academia, entre com <b>' + esc(st.cortesia_academia.email) + '</b>: ' +
        st.cortesia_academia.cursos + ' curso(s) de música liberado(s). <a href="https://academia.villelastay.com.br/academy/app" target="_blank" rel="noopener">Abrir a Academia</a>' }));
    }
    return box;
  }

  function verCursos() {
    Promise.all([api('GET', '/cursos'), api('GET', '/estudo').catch(function () { return { trilhas: [] }; }),
      api('GET', '/assinatura').catch(function () { return null; })]).then(function (rs) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: '\u{1F393} Cursos de música' }));
      c.appendChild(el('p', { class: 'sub', txt: 'Cursos em vídeo da Academia Villela, escolhidos para quem estuda no Musique. ' +
        'As aulas acontecem na Academia, que tem conta própria; os links abrem em outra aba.' }));
      if (rs[2]) c.appendChild(cartaoAssinatura(rs[2], 'cursos'));
      var incluido = !!(rs[2] && rs[2].acesso);
      var ligados = {};
      (rs[1].trilhas || []).forEach(function (t) { if (t.curso_academia) ligados[t.curso_academia.slug] = t.titulo; });
      var cursos = rs[0].cursos || [];
      if (!cursos.length) {
        c.appendChild(el('div', { class: 'card vazio-card', html:
          '<div class="vazio-ico">\u{1F393}</div><h3>Nenhum curso de música publicado ainda</h3>' +
          '<p class="sub">Assim que a Academia publicar um curso na categoria Música, ele aparece aqui, com a trilha do Musique que ele complementa.</p>' +
          '<a class="btn sec" href="https://academia.villelastay.com.br/academy" target="_blank" rel="noopener">Conhecer a Academia Villela</a>' }));
        return;
      }
      var g = el('div', { class: 'grade' });
      cursos.forEach(function (k) {
        var preco = k.preco_centavos ? 'R$ ' + (k.preco_centavos / 100).toFixed(2).replace('.', ',') : '';
        g.appendChild(el('a', { class: 'item com-ico', href: k.url, target: '_blank', rel: 'noopener', style: 'border-left:4px solid #C9A227',
          html: '<div class="topo-item">' + icone({ ico: '\u{1F393}', fundo: '#FDF6E3', cor: '#8A6D12' }) + '<b>' + esc(k.titulo) + '</b></div>' +
            (k.subtitulo ? '<span>' + esc(k.subtitulo) + '</span>' : '') +
            (ligados[k.slug] ? '<span class="chip">\u{1F9ED} complementa a trilha ' + esc(ligados[k.slug]) + '</span>' : '') +
            '<span class="peq">' + [k.produtor ? 'com ' + esc(k.produtor) : '', incluido ? '\u{2705} incluído na sua assinatura' : preco].filter(Boolean).join(' · ') + '</span>' }));
      });
      c.appendChild(g);
    }).catch(function (e) { $('#corpo').innerHTML = ''; erro(e.message); });
  }

  // =================================================================
  // MINHA CONTA (ADR-0011): conta propria do Musique
  // =================================================================
  function verConta() {
    api('GET', '/conta').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: '\u{1F464} Minha conta' }));
      c.appendChild(el('p', { class: 'sub', txt: d.conta.nome + ' - ' + d.conta.email }));

      var em = el('div', { class: 'cartao-conta' });
      if (d.conta.email_verificado) {
        em.innerHTML = '<h3>\u{2709}\u{FE0F} E-mail</h3><p class="sub">Confirmado. Você pode receber convites de banda, professor e escola.</p>';
      } else {
        em.innerHTML = '<h3>\u{2709}\u{FE0F} Confirme o seu e-mail</h3><p class="sub">Enviamos um link para ' + esc(d.conta.email) +
          '. Enquanto não confirmar, ninguém consegue te convidar para banda, tarefa ou escola.</p>' +
          '<button class="btn peq" id="em-reenviar">Mandar o link de novo</button>';
      }
      c.appendChild(em);
      if ($('#em-reenviar')) $('#em-reenviar').onclick = function () {
        api('POST', '/conta/reenviar-verificacao').then(function () { aviso('Link enviado. Confira também a caixa de spam.'); })
          .catch(function (e) { erro(e.message); });
      };

      var assinBox = el('div'); c.appendChild(assinBox);
      api('GET', '/assinatura').then(function (st) { assinBox.appendChild(cartaoAssinatura(st, 'conta')); }).catch(function () {});

      var fa = el('div', { class: 'cartao-conta' });
      c.appendChild(fa);
      pintar2fa(fa, d.dois_fatores);

      var fs = el('div', { class: 'cartao-conta' });
      fs.innerHTML = '<h3>\u{1F511} Trocar a senha</h3>' +
        '<label>Senha atual<input type="password" id="ct-atual" autocomplete="current-password"></label>' +
        '<label>Senha nova (8 ou mais caracteres)<input type="password" id="ct-nova" autocomplete="new-password"></label>' +
        '<button class="btn peq" id="ct-trocar">Trocar a senha</button>';
      c.appendChild(fs);
      $('#ct-trocar').onclick = function () {
        api('POST', '/conta/senha', { senha_atual: $('#ct-atual').value, senha_nova: $('#ct-nova').value })
          .then(function () { $('#ct-atual').value = ''; $('#ct-nova').value = ''; aviso('Senha trocada. As outras sessões abertas foram encerradas.'); })
          .catch(function (e) { erro(e.message); });
      };

      if (d.academia.disponivel) {
        var ac = el('div', { class: 'cartao-conta' });
        if (d.academia.vinculada) {
          ac.innerHTML = '<h3>\u{1F393} Professor pela Academia</h3><p class="sub">Sua conta de produtor da Academia está vinculada' +
            (d.academia.produtor ? ' e aprovada: a área de Professor está liberada.' : ', mas o perfil de produtor não está aprovado agora.') + '</p>' +
            '<button class="btn peq sec" id="ac-desv">Desfazer o vínculo</button>';
        } else {
          ac.innerHTML = '<h3>\u{1F393} Dá aula e vende curso na Academia?</h3>' +
            '<p class="sub">Vincule a sua conta de PRODUTOR da Academia para liberar a área de Professor. A senha é conferida lá e não fica guardada aqui. Para estudar, não precisa.</p>' +
            '<label>E-mail da Academia<input type="email" id="ac-email"></label>' +
            '<label>Senha da Academia<input type="password" id="ac-senha" autocomplete="off"></label>' +
            '<label>Código do autenticador (só se usar na Academia)<input type="text" id="ac-cod" inputmode="numeric" autocomplete="off"></label>' +
            '<button class="btn peq" id="ac-vinc">Vincular</button>';
        }
        c.appendChild(ac);
        if ($('#ac-vinc')) $('#ac-vinc').onclick = function () {
          api('POST', '/conta/vincular-academia', { email: $('#ac-email').value, senha: $('#ac-senha').value, codigo: $('#ac-cod').value })
            .then(function () { location.reload(); }).catch(function (e) { erro(e.message); });
        };
        if ($('#ac-desv')) $('#ac-desv').onclick = function () {
          api('DELETE', '/conta/vincular-academia').then(function () { location.reload(); }).catch(function (e) { erro(e.message); });
        };
      }

      var sair = el('button', { class: 'btn sec', txt: '\u{1F6AA} Sair do Musique', onclick: function () {
        fetch('/music/api/conta/sair', { method: 'POST' }).then(function () { location.href = '/music'; });
      } });
      c.appendChild(el('div', { class: 'cartao-conta' }, [sair]));
    }).catch(function (e) { $('#corpo').innerHTML = ''; erro(e.message); });
  }

  // Duas etapas: opcional, recomendada para professor e escola.
  function pintar2fa(caixa, df) {
    if (df.ativo) {
      caixa.innerHTML = '<h3>\u{1F6E1}\u{FE0F} Verificação em duas etapas: ligada</h3>' +
        '<p class="sub">Ao entrar, além da senha, o Musique pede o código do aplicativo autenticador. Códigos de recuperação ainda válidos: <b>' + df.codigos_restantes + '</b>.</p>' +
        '<label>Senha<input type="password" id="fa-senha" autocomplete="current-password"></label>' +
        '<label>Código do aplicativo (ou de recuperação)<input type="text" id="fa-cod" inputmode="numeric" autocomplete="one-time-code"></label>' +
        '<button class="btn peq sec" id="fa-desligar">Desligar</button>';
      $('#fa-desligar').onclick = function () {
        api('POST', '/conta/2fa/desativar', { senha: $('#fa-senha').value, codigo: $('#fa-cod').value })
          .then(function () { aviso('Verificação em duas etapas desligada.'); verConta(); }).catch(function (e) { erro(e.message); });
      };
      return;
    }
    caixa.innerHTML = '<h3>\u{1F6E1}\u{FE0F} Verificação em duas etapas</h3>' +
      '<p class="sub">Opcional. Protege a conta mesmo que alguém descubra a sua senha. Você vai precisar de um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password...).</p>' +
      '<label>Senha atual, para ligar<input type="password" id="fa-senha" autocomplete="current-password"></label>' +
      '<button class="btn peq" id="fa-iniciar">Ligar</button>';
    $('#fa-iniciar').onclick = function () {
      api('POST', '/conta/2fa/iniciar', { senha: $('#fa-senha').value }).then(function (r) {
        caixa.innerHTML = '<h3>Leia o QR no aplicativo autenticador</h3>' +
          '<div class="qr-2fa">' + r.qr_svg + '</div>' +
          '<p class="sub">Sem câmera? Digite esta chave no aplicativo: <code>' + esc(r.segredo) + '</code></p>' +
          '<label>Código de 6 dígitos que apareceu no aplicativo<input type="text" id="fa-cod" inputmode="numeric" autocomplete="one-time-code"></label>' +
          '<button class="btn peq" id="fa-ativar">Confirmar e ligar</button>';
        $('#fa-ativar').onclick = function () {
          api('POST', '/conta/2fa/ativar', { codigo: $('#fa-cod').value }).then(function (r2) {
            caixa.innerHTML = '<h3>Ligada. Guarde os códigos de recuperação</h3>' +
              '<p class="sub">Cada código abre a conta UMA vez se você perder o celular. Guarde num lugar seguro: eles não aparecem de novo.</p>' +
              '<pre class="codigos-rec">' + r2.codigos_recuperacao.map(esc).join('<br>') + '</pre>' +
              '<button class="btn peq" id="fa-ok">Já guardei</button>';
            $('#fa-ok').onclick = verConta;
          }).catch(function (e) { erro(e.message); });
        };
      }).catch(function (e) { erro(e.message); });
    };
  }

  // Faixa do teste grátis: quantos dias faltam, com o caminho para assinar.
  function faixaTeste() {
    api('GET', '/assinatura').then(function (st) {
      var u = st.uso || {};
      if (u.motivo !== 'teste' || $('#faixa-teste')) return;
      var f = el('div', { class: 'alerta', id: 'faixa-teste', html:
        '\u{1F381} <b>Teste grátis:</b> faltam ' + u.teste.dias_restantes + ' dia(s). Depois, o Musique custa ' + reais(st.plano.preco_cents) +
        '/mês, com os cursos de música da Academia incluídos. <button class="btn peq" id="fx-assinar">Assinar</button>' });
      var m = $('#menu'); m.parentNode.insertBefore(f, m);
      $('#fx-assinar').onclick = function () { ir('conta'); };
    }).catch(function () {});
  }

  // Faixa no topo enquanto o e-mail nao for confirmado.
  function faixaEmail() {
    api('GET', '/conta').then(function (d) {
      if (d.conta.email_verificado || $('#faixa-email')) return;
      var f = el('div', { class: 'alerta', id: 'faixa-email', html:
        '<b>Confirme o seu e-mail.</b> Enviamos um link para ' + esc(d.conta.email) +
        '. Sem isso, ninguém consegue te convidar para banda, tarefa ou escola. <button class="btn peq" id="fx-conta">Ver em Minha conta</button>' });
      var m = $('#menu'); m.parentNode.insertBefore(f, m);
      $('#fx-conta').onclick = function () { ir('conta'); };
    }).catch(function () {});
  }

  function cartao(n, rot, obs, ico) {
    return '<div class="kpi">' + (ico ? '<div class="kpi-ico" aria-hidden="true">' + ico + '</div>' : '') +
      '<div class="n">' + esc(n) + '</div><div class="rot">' + esc(rot) + '</div>' +
      (obs ? '<div class="obs">' + esc(obs) + '</div>' : '') + '</div>';
  }
  function nomeFamilia(f) {
    return ({ intervalo: 'Intervalos', acorde: 'Acordes', escala: 'Escalas', leitura: 'Leitura',
      ritmo: 'Ritmo', afinacao: 'Afinação', ditado: 'Ditado', harmonia: 'Harmonia',
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
    c.appendChild(el('h2', { txt: '\u{1F399}\u{FE0F} Calibrar o microfone' }));
    c.appendChild(el('p', { class: 'sub', txt:
      'Fique em silêncio por 3 segundos. Vou medir o ruído do seu ambiente para saber se dá para medir o seu som com confiança.' }));
    var estadoTxt = el('div', { class: 'alerta', txt: 'Pronto para começar.' });
    c.appendChild(estadoTxt);
    var b = el('button', { class: 'btn', txt: 'Medir agora' });
    c.appendChild(b);
    b.onclick = function () {
      b.disabled = true;
      estadoTxt.textContent = 'Medindo... fique em silêncio.';
      A.medirRuido(3000).then(function (r) {
        return api('POST', '/calibracao', { ruido_db: r.db });
      }).then(function (d) {
        estadoTxt.className = 'alerta ' + (d.calibracao.microfone_ok ? 'bom' : 'ruim');
        estadoTxt.textContent = d.calibracao.microfone_ok
          ? 'Pronto: ruído de ' + d.calibracao.ruido_db + ' dB. Seus exercícios com microfone podem valer nota.'
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
      c.appendChild(el('h2', { txt: '\u{1F3AF} Praticar' }));
      c.appendChild(el('p', { class: 'sub', txt: 'Escolha o que treinar. O nível se ajusta ao seu desempenho.' }));
      var g = el('div', { class: 'grade' });
      d.tipos.forEach(function (t) {
        var v = familiaDe(t.familia || t.id);
        g.appendChild(el('button', {
          class: 'item com-ico', onclick: function () { praticarTipo(t.id); },
          style: 'border-left:4px solid ' + v.cor,
          html: '<div class="topo-item">' + icone(v) + '<b>' + esc(t.pt) + '</b></div><span>' + esc(t.contrato.mede) + '</span>' +
            (t.mic ? '<span class="chip">precisa de microfone</span>' : '') +
            (t.contrato.pode_valer_nota ? '' : '<span class="chip alerta">só indicação</span>'),
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
      '<span class="chip" style="background:' + familiaDe(it.familia).fundo + ';color:' + familiaDe(it.familia).cor + '">' +
      familiaDe(it.familia).ico + ' ' + esc(nomeFamilia(it.familia)) + ' - nível ' + it.nivel + '</span>' }));
    c.appendChild(el('h2', { class: 'enunciado', txt: it.enunciado }));
    if (it.dica) c.appendChild(el('p', { class: 'sub', txt: it.dica }));

    // O CONTRATO da medida, ANTES de responder (decisao Q5).
    var ct = it.contrato;
    c.appendChild(el('div', { class: 'contrato', html:
      '<b>O que vai ser medido</b><p>' + esc(ct.mede) + '</p>' +
      '<p class="peq">' + esc(ct.tolerancia_texto) + '</p>' +
      '<p class="peq">' + (ct.pode_valer_nota
        ? 'Este exercício pode valer nota.'
        : 'Este exercício vale como treino, não como nota.') +
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
    var titulo = r.acerto ? 'Acertou' : 'Ainda não';
    var html = '<div class="alerta ' + classe + '"><b>' + titulo + '</b><p>' + esc(r.explicacao) + '</p></div>';

    if (!r.vale_nota) {
      html += '<div class="alerta"><b>Isto foi uma indicação, não uma nota.</b><ul>' +
        (r.ressalvas || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }
    html += '<details class="criterio"><summary>Como foi medido</summary>' +
      '<p>' + esc(r.criterio) + '</p>' +
      '<pre>' + esc(JSON.stringify(r.medida, null, 1)) + '</pre>' +
      '<p class="peq">Confiança da medida: ' + Math.round(r.confianca * 100) + '%</p></details>';
    if (r.proxima_revisao_dias > 0) {
      html += '<p class="peq">Volto a te perguntar isto em ' + r.proxima_revisao_dias + ' dia(s).</p>';
    }
    alvo.innerHTML = html;

    var acoes = el('div', { class: 'linha', style: 'margin-top:14px' });
    acoes.appendChild(el('button', { class: 'btn', txt: 'Próximo',
      onclick: function () { estado.trilhaSlug = null; praticarTipo(estado.item.tipo); } }));
    acoes.appendChild(el('button', { class: 'btn sec', txt: 'Parar por hoje', onclick: encerrarSessao }));
    if (!r.acerto) {
      acoes.appendChild(el('button', { class: 'btn sec', txt: 'Discordo da correção',
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
    var motivo = prompt('O que você acha que ficou errado na correção?');
    if (!motivo) return;
    api('POST', '/contestacoes', { tentativa_id: tentativaId, motivo: motivo })
      .then(function () { aviso('Contestação registrada. Um professor vai revisar.'); })
      .catch(function (e) { erro(e.message); });
  }

  // =================================================================
  // TAREFAS (aluno)
  // =================================================================
  function verTarefas() {
    api('GET', '/tarefas').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: '\u{1F4DD} Tarefas do professor' }));
      if (!d.tarefas.length) {
        c.appendChild(el('p', { class: 'vazio', txt:
          'Nenhuma tarefa por enquanto. Tarefas aparecem aqui quando um professor atribui uma a você.' }));
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
    var VIS = { enviada: ['\u{23F3}', '#B45309'], avaliada: ['\u{2705}', '#15803D'], devolvida: ['\u{1F501}', '#BE123C'] };
    var vis = VIS[sub && sub.status] || ['\u{1F195}', '#0369A1'];
    box.style.borderLeft = '4px solid ' + vis[1];
    box.innerHTML = '<h3>' + vis[0] + ' ' + esc(t.titulo) + '</h3>' +
      (t.prazo ? '<span class="chip">até ' + esc(t.prazo) + '</span>' : '') +
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
    var txt = el('textarea', { rows: '2', placeholder: 'Um comentário para o professor (opcional)' });
    if (sub && sub.texto) txt.value = sub.texto;
    caixa.appendChild(txt);

    var mediaId = (sub && sub.media_id) || '';
    var info = el('div', { class: 'micinfo', txt: mediaId ? 'gravação enviada' : '' });
    var bGravar = el('button', { class: 'btn sec', txt: t.exige_audio ? 'Gravar' : 'Gravar (opcional)' });
    var bEnviar = el('button', { class: 'btn', txt: sub ? 'Reenviar' : 'Enviar' });
    var pararGravacao = null;

    bGravar.onclick = function () {
      if (pararGravacao) { pararGravacao(); return; }
      info.textContent = 'Gravando... clique em Parar quando terminar (limite de 30 s).';
      bGravar.textContent = 'Parar';
      gravarArquivo(info, function (fn) { pararGravacao = fn; }).then(function (id) {
        mediaId = id; pararGravacao = null;
        info.textContent = 'Gravação pronta.';
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
        ? 'A permissão do microfone foi negada.' : (e.message || 'Não consegui gravar.'));
    });
  }

  function verFeedback(submissaoId) {
    api('GET', '/submissoes/' + submissaoId).then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: '\u{1F4AC} Retorno do professor' }));
      d.feedbacks.forEach(function (f) {
        c.appendChild(el('div', { class: 'card', html:
          (f.nota != null ? '<div class="nota">' + esc(f.nota) + '</div>' : '') +
          '<p>' + esc(f.texto || '') + '</p>' +
          '<p class="peq">' + (f.origem === 'revisao' ? 'revisão de contestação' : 'professor') +
          ' - ' + esc((f.criado_em || '').slice(0, 10)) + '</p>' }));
      });
      c.appendChild(el('button', { class: 'btn sec', txt: 'Discordo da nota', onclick: function () {
        var motivo = prompt('Explique por que você discorda:');
        if (!motivo) return;
        api('POST', '/contestacoes', { submissao_id: submissaoId, motivo: motivo })
          .then(function () { aviso('Contestação registrada.'); })
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
      c.appendChild(el('h2', { txt: '\u{1F4C8} Meu progresso' }));
      c.appendChild(el('div', { class: 'kpis', html:
        cartao(e.tentativas, 'exercícios em 90 dias', '', '\u{1F3AF}') +
        cartao(e.acertos, 'acertos', e.tentativas ? Math.round(100 * e.acertos / e.tentativas) + '%' : '', '\u{2705}') +
        cartao(e.valeram_nota, 'valeram nota', (e.tentativas - e.valeram_nota) + ' foram indicação', '\u{1F3C5}') +
        cartao(e.minutos_praticados, 'minutos de prática', '', '\u{23F1}\u{FE0F}')
      }));

      var fams = Object.keys(e.por_familia);
      if (fams.length) {
        c.appendChild(el('h3', { txt: '\u{1F9E9} Por habilidade' }));
        var tab = el('table', { class: 'tab' });
        tab.innerHTML = '<thead><tr><th>Habilidade</th><th>Nível</th><th>Acertos</th><th>Valeram nota</th></tr></thead><tbody>' +
          fams.map(function (f) {
            var x = e.por_familia[f];
            var v = familiaDe(f), pc = x.total ? Math.round(100 * x.acertos / x.total) : 0;
            return '<tr><td><span class="ico-mini" style="background:' + v.fundo + '">' + v.ico + '</span> ' + esc(nomeFamilia(f)) + '</td><td>' + x.nivel + '</td><td>' +
              '<div class="barra" style="max-width:140px"><i style="width:' + pc + '%;background:' + v.cor + '"></i></div>' +
              x.acertos + '/' + x.total + '</td><td>' + x.com_nota + '</td></tr>';
          }).join('') + '</tbody>';
        c.appendChild(tab);
      }

      c.appendChild(el('h3', { txt: '\u{1F558} Últimos exercícios' }));
      if (!h.length) { c.appendChild(el('p', { class: 'vazio', txt: 'Nada por aqui ainda.' })); return; }
      var t2 = el('table', { class: 'tab' });
      t2.innerHTML = '<thead><tr><th>Quando</th><th>Exercício</th><th>Resultado</th></tr></thead><tbody>' +
        h.map(function (x) {
          return '<tr><td>' + esc((x.criado_em || '').slice(0, 10)) + '</td>' +
            '<td>' + esc(x.enunciado) + '</td>' +
            '<td>' + (x.acerto ? '\u{2705} certo' : '\u{274C} errado') +
            (x.vale_nota ? '' : ' <span class="chip alerta">indicação</span>') + '</td></tr>';
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
      c.appendChild(el('h2', { txt: '\u{1F9D1}\u{200D}\u{1F3EB} Minhas tarefas' }));
      if (d.contestacoes_abertas) {
        c.appendChild(el('div', { class: 'alerta', html:
          '<b>' + d.contestacoes_abertas + ' contestação(ões) esperando você.</b> ' +
          '<button class="btn peq" id="b-cont">Ver</button>' }));
        $('#b-cont').onclick = verContestacoes;
      }
      c.appendChild(el('button', { class: 'btn', txt: '\u{2795} Nova tarefa', onclick: novaTarefa }));

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
    c.appendChild(el('h2', { txt: '\u{2795} Nova tarefa' }));
    var tit = el('input', { type: 'text', placeholder: 'Título (ex.: Escala de dó em duas oitavas)' });
    var desc = el('textarea', { rows: '2', placeholder: 'Descrição curta' });
    var inst = el('textarea', { rows: '3', placeholder: 'Instruções para o aluno' });
    var nota = el('input', { type: 'number', value: '10', min: '1', max: '100', step: '0.5' });
    var audio = el('input', { type: 'checkbox' }); audio.checked = true;
    var prazo = el('input', { type: 'date' });
    c.appendChild(campo('Título', tit));
    c.appendChild(campo('Descrição', desc));
    c.appendChild(campo('Instruções', inst));
    c.appendChild(campo('Nota máxima', nota));
    c.appendChild(campo('Prazo', prazo));
    c.appendChild(el('label', { class: 'check' }, [audio, el('span', { txt: ' exige gravação de áudio' })]));
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
    var emails = prompt('E-mails dos alunos, separados por vírgula:');
    if (!emails) return;
    api('POST', '/prof/tarefas/' + t.id + '/alunos', { emails: emails.split(/[,;\\s]+/).filter(Boolean) })
      .then(function (d) {
        // "Atribui 3 de 4" e informacao que o professor PRECISA ver -
        // errar um e-mail e comum, e o silencio faria o aluno sumir.
        var msg = d.atribuidos + ' aluno(s) atribuído(s).';
        if (d.nao_encontrados && d.nao_encontrados.length) {
          msg += ' Não achei conta para: ' + d.nao_encontrados.join(', ') +
            '. Confira o e-mail, ou peça para a pessoa criar a conta primeiro.';
        }
        verProfessor();
        setTimeout(function () { aviso(msg); }, 60);
      }).catch(function (e) { erro(e.message); });
  }

  function arquivar(t) {
    if (!confirm('Arquivar "' + t.titulo + '"?\\n\\nVocê deixa de ver os envios desta tarefa. Os alunos continuam vendo o próprio trabalho e a nota.')) return;
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
          ' - ' + esc(sub.status) + '</p><p>' + esc(sub.texto || '(sem comentário)') + '</p>';
        if (sub.media_id) {
          box.appendChild(el('button', { class: 'btn sec', txt: 'Ouvir a gravação', onclick: function () {
            api('GET', '/midias/' + sub.media_id).then(function (m) {
              if (!m.url) return erro('A gravação ainda está sendo processada. Tente em instantes.');
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
      c.appendChild(el('h2', { txt: '\u{2696}\u{FE0F} Contestações' }));
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
  // "Minha conta" no topo da pagina e um link para #conta: com o app ja
  // aberto, so o hashchange percebe o clique.
  function abaDoHash() {
    var h = String(location.hash || '').replace(/^#/, '');
    if (/^(cifras|cifra=|musica=|banda=|setlist=|convite=|vivo=)/.test(h)) return 'cifras';
    return ABAS.some(function (a) { return a[0] === h; }) ? h : '';
  }
  function porHash() {
    var a = abaDoHash();
    if (!a || a === estado.aba) return false;
    if (a === 'cifras') { estado.aba = 'cifras'; pintarMenu(); if (window.MusiqueCifras) window.MusiqueCifras.abrir(); return true; }
    ir(a); return true;
  }
  window.addEventListener('hashchange', porHash);
  var inicial = abaDoHash();
  if (inicial === 'cifras') { estado.aba = 'cifras'; pintarMenu(); carregando(); }  // as Cifras abrem sozinhas pelo endereço
  else ir(inicial || 'estudar');
  // Professor, escola e turmas só aparecem no menu para quem tem o papel:
  // vindo direto por F5, o papel ainda não foi lido — busca e repinta.
  if (inicial && inicial !== 'estudar') api('GET', '/estudo').then(function (d) { estado.eu = d; pintarMenu(); }).catch(function () {});
  faixaEmail();
  faixaTeste();
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
