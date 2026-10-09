/* =====================================================================
 * Villela Academy — ESTUDE (academy\estudo\), montado pelo estúdio
 * (app-aluno.js), que injeta as dependências. Do assunto ou do edital à
 * aprendizagem demonstrada: hoje, programa, aula ativa, prática, cards,
 * prova com relógio e plano.
 * Gabarito, explicação, pista e solução ficam no servidor — aqui só se
 * pergunta, responde e mostra. O relógio da prova é o do servidor.
 * JS clássico (var/function), sem build.
 * ===================================================================== */
(function () {
  'use strict';

  window.AcademyEstude = function (D) {
    var api = D.api, esc = D.esc, el = D.el, setView = D.setView;
    var E = { pid: '', titulo: '', slug: '', escopos: [], painel: null, aba: 'hoje', relogio: null };

    var ESTADO = {
      nao_avaliada: ['Ainda não avaliada', 'cinza'], em_pratica: ['Em prática', 'ambar'],
      demonstrada_com_apoio: ['Acertou com apoio', 'azul'], demonstrada_sem_apoio: ['Demonstrada', 'verde'],
      retida: ['Retida', 'forte'], sem_competencia: ['Sem competência ligada', 'cinza']
    };
    var ORIGEM = { oficial: 'Questão oficial', adaptada: 'Adaptada de prova', autoral: 'Autoral do curso', relato: 'Relato de candidato' };
    var DIAS = [['dom', 'Dom'], ['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb']];
    var BLOCO = { desafio: 'Desafio', explicacao: 'Explicação', exemplo: 'Exemplo resolvido', recordacao: 'Recordar sem consultar', pratica: 'Prática', aplicacao: 'Aplicação independente', sintese: 'Síntese' };
    var MIDIA = { planejado: 'planejado', roteirizado: 'roteiro pronto, ainda sem arquivo', gerado: 'gerado, sem revisão', revisado: 'revisado', publicado: 'disponível' };

    function base() { return '/aluno/cursos/' + E.pid + '/estudo/' + E.slug; }
    function falha(alvo, e) { if (alvo) alvo.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
    function texto(t) { return String(t || '').split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }
    function horas(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m || !h ? m + ' min' : ''); }
    function dataBR(d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + (d.length >= 10 ? '/' + d.slice(0, 4) : '') : ''; }
    function selo(estado) { var x = ESTADO[estado] || ESTADO.nao_avaliada; return '<span class="es-selo ' + x[1] + '">' + x[0] + '</span>'; }
    function cada(alvo, sel, fn) { Array.prototype.forEach.call(alvo.querySelectorAll(sel), fn); }
    // A competência é escrita como resultado ("Diante de…, o candidato…"), bom
    // para medir e ruim para escolher: numa lista, todas começam igual. Quem
    // escolhe o que praticar pensa em MATÉRIA — disciplina, ponto do edital,
    // título da aula. O mapa sai do painel (itens do programa + aulas).
    function materias() {
      var p = E.painel || {};
      if (E._mm && E._mmDe === p) return E._mm;
      var itens = {}, titulo = {}, mm = {};
      (p.itens || []).forEach(function (i) { itens[i.codigo] = i; });
      (p.unidades || []).forEach(function (u) { (u.competencias || []).forEach(function (k) { if (!titulo[k]) titulo[k] = u.titulo; }); });
      (p.itens || []).forEach(function (i) {
        if (!i.folha) return;
        var partes = i.codigo.split('.'), disc = itens[partes.slice(0, 2).join('.')];
        (i.competencias || []).forEach(function (k) {
          if (mm[k.codigo]) return;
          mm[k.codigo] = { item: i.codigo, cod: disc && disc !== i ? partes.slice(0, 2).join('.') : '', disciplina: disc && disc !== i ? partes.slice(0, 2).join('.') + ' ' + disc.texto : 'Programa',
            titulo: titulo[k.codigo] || i.texto };
        });
      });
      (p.competencias || []).forEach(function (c) {
        if (!mm[c.codigo]) mm[c.codigo] = { item: '', cod: '', disciplina: 'Método de estudo', titulo: titulo[c.codigo] || c.resultado };
      });
      E._mm = mm; E._mmDe = p;
      return mm;
    }
    function nomeComp(codigo) {
      var m = materias()[codigo];
      return m ? (m.item ? m.item + ' — ' : '') + m.titulo : codigo;
    }
    // <option>s agrupados por disciplina, na ordem do programa
    function opcoesComp(sel) {
      var mm = materias(), grupos = [], por = {};
      ((E.painel || {}).competencias || []).forEach(function (c) {
        var m = mm[c.codigo], g = por[m.disciplina];
        if (!g) { g = por[m.disciplina] = { nome: m.disciplina, ops: [] }; grupos.push(g); }
        g.ops.push('<option value="' + esc(c.codigo) + '"' + (c.codigo === sel ? ' selected' : '') + '>' + esc(String(nomeComp(c.codigo)).slice(0, 110)) + '</option>');
      });
      return grupos.map(function (g) { return '<optgroup label="' + esc(g.nome.slice(0, 90)) + '">' + g.ops.join('') + '</optgroup>'; }).join('');
    }
    function nomeItem(codigo) {
      var i = ((E.painel || {}).itens || []).filter(function (x) { return x.codigo === codigo; })[0];
      return i ? (i.texto.length > 46 ? i.texto.slice(0, 44) + '…' : i.texto) : '';
    }
    // durante a prova o Tutor some: ajuda aberta ao lado de um simulado desfaz a medida
    function pararRelogio() { if (E.relogio) { clearInterval(E.relogio); E.relogio = null; } document.body.classList.remove('es-em-prova'); }

    // ---------------- cartão no cabeçalho do estúdio ----------------
    function cartao(alvo, pid, r, abrirFn) {
      if (!alvo) return;
      if (!r || !r.acesso || !(r.escopos || []).length) { alvo.innerHTML = ''; return; }
      alvo.innerHTML = '<div class="es-cartao"><div class="es-cartao-txt"><p class="al-rotulo">Estude</p>' +
        '<b>O conteúdo de estudo está aqui</b><span class="al-fino">Aulas, questões, cards, simulado com correção explicada e o plano que cabe no seu tempo.</span></div>' +
        '<div class="es-cartao-bts">' + r.escopos.map(function (e) {
          return '<button class="al-bt" data-es="' + esc(e.slug) + '">' + (e.tipo === 'edital' ? '📜 ' : '📘 ') + 'Abrir o conteúdo — ' + esc(e.titulo) +
            (e.status === 'rascunho' ? ' <span class="marca-rasc">rascunho</span>' : '') + '</button>';
        }).join('') + '</div></div>';
      cada(alvo, '[data-es]', function (b) { b.onclick = function () { abrirFn(b.getAttribute('data-es')); }; });
    }

    // ---------------- casca ----------------
    function abrir(pid, titulo, slug, voltar) {
      pararRelogio();
      E.pid = pid; E.titulo = titulo; E.slug = slug; E.voltar = voltar; E.aba = 'hoje';
      setView('<div class="al es"><a href="#" class="al-volta" id="es-volta">← Voltar às aulas</a>' +
        '<div class="es-cab"><p class="al-rotulo">Estude · ' + esc(titulo) + '</p><h2 id="es-titulo">Carregando…</h2><p class="al-sub" id="es-sub"></p></div>' +
        '<div class="est-abas es-abas" id="es-abas"></div><div class="es-corpo" id="es-corpo"><p class="al-sub">Carregando…</p></div></div>');
      el('es-volta').onclick = function (e) { e.preventDefault(); pararRelogio(); voltar(); };
      window.scrollTo(0, 0);
      carregar(function () { abas(); ir('hoje'); });
    }
    function carregar(depois) {
      api('GET', base() + '/painel').then(function (p) {
        E.painel = p;
        if (el('es-titulo')) {
          el('es-titulo').innerHTML = esc(p.escopo.titulo) + (p.escopo.status === 'rascunho' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : '');
          el('es-sub').textContent = [p.escopo.nivel, p.escopo.data_alvo ? 'prova em ' + dataBR(p.escopo.data_alvo) : 'sem prova marcada', 'programa versão ' + p.escopo.versao].filter(Boolean).join(' · ');
        }
        if (depois) depois();
      }).catch(function (e) { falha(el('es-corpo'), e); });
    }
    var ABAS = [['hoje', 'Hoje'], ['aulas', 'Aulas'], ['programa', 'Programa'], ['praticar', 'Praticar'], ['erros', 'Erros'], ['cards', 'Cards'], ['prova', 'Prova'], ['plano', 'Plano']];
    function abas() {
      el('es-abas').innerHTML = ABAS.map(function (x) { return '<button data-a="' + x[0] + '">' + x[1] + '</button>'; }).join('');
      cada(el('es-abas'), 'button', function (b) { b.onclick = function () { ir(b.getAttribute('data-a')); }; });
    }
    function ir(aba, arg) {
      pararRelogio();
      E.aba = aba;
      cada(el('es-abas'), 'button', function (b) { b.classList.toggle('on', b.getAttribute('data-a') === aba); });
      var alvo = el('es-corpo');
      alvo.innerHTML = '<p class="al-sub">Carregando…</p>';
      ({ hoje: hoje, aulas: aulas, programa: programa, praticar: praticar, erros: erros, cards: cards, prova: prova, plano: plano, unidade: unidade }[aba] || hoje)(alvo, arg);
    }

    // ================= HOJE: a próxima tarefa e os três eixos =================
    var ACAO = {
      revisao: ['Fazer a retomada', function (p) { ir('praticar', p.competencia); }],
      cards: ['Recordar os cards', function () { ir('cards'); }],
      pre_requisito: ['Retomar a base', function (p) { p.unidade ? ir('unidade', p.unidade) : ir('praticar', p.competencia); }],
      mudar_estrategia: ['Voltar à explicação', function (p) { p.unidade ? ir('unidade', p.unidade) : ir('programa'); }],
      intervencao: ['Rever e tentar outra', function (p) { p.unidade ? ir('unidade', p.unidade) : ir('praticar', p.competencia); }],
      pratica_sem_apoio: ['Praticar sem apoio', function (p) { ir('praticar', p.competencia); }],
      aprender: ['Começar', function (p) { p.unidade ? ir('unidade', p.unidade) : ir('praticar', p.competencia); }],
      aguardar_retencao: ['Fazer um simulado', function () { ir('prova'); }]
    };
    function eixo(titulo, num, den, legenda, cor) {
      var pct = den ? Math.round(num * 100 / den) : 0;
      return '<div class="es-eixo"><small>' + titulo + '</small><b>' + num + '<i> de ' + den + '</i></b>' +
        '<div class="es-barra ' + cor + '"><i style="width:' + pct + '%"></i></div><span class="al-fino">' + legenda + '</span></div>';
    }
    function hoje(alvo) {
      carregar(function () {
        var p = E.painel, c = p.cobertura, px = p.proxima, ac = ACAO[px.tipo], d = p.desempenho;
        var h = retaFinal(p) + '<div class="es-proxima"><p class="al-rotulo">Sua próxima tarefa</p>' +
          '<h3>' + (px.competencia ? esc(nomeComp(px.competencia)) : (px.tipo === 'concluido' ? 'Tudo demonstrado até aqui' : 'Recordar')) + '</h3>' +
          '<p class="es-motivo"><b>Por quê:</b> ' + esc(px.motivo) + '</p>' +
          (ac ? '<button class="al-bt" id="es-agir">' + ac[0] + '</button>' : '') +
          ' <button class="al-bt fan" id="es-outra">Escolher outra coisa</button></div>';
        h += '<div class="jr-caixa"><h3>Onde você está no programa</h3>' +
          '<p class="al-sub">São quatro medidas diferentes, cada uma com a sua contagem. Ter a aula pronta não é ter estudado, e ter estudado não é ter demonstrado.</p>' +
          '<div class="es-eixos">' +
          eixo('Com aula pronta', c.material.com, c.folhas, 'itens do programa com material', 'cinza') +
          eixo('Com questão conferida', c.avaliacao.com_questao_revisada, c.folhas, c.avaliacao.so_sugerida ? '+ ' + c.avaliacao.so_sugerida + ' com vínculo ainda a conferir' : 'itens com questão vinculada', 'cinza') +
          eixo('Estudados por você', c.estudo.estudados, c.folhas, 'itens em que você já respondeu algo', 'ambar') +
          eixo('Demonstrados sem apoio', c.dominio.sem_apoio + c.dominio.retidos, c.folhas, c.dominio.retidos + ' com retenção confirmada', 'verde') +
          '</div>' + (c.pendentes_de_leitura ? '<p class="es-aviso">' + c.pendentes_de_leitura + ' item(ns) do programa com leitura pendente de conferência — não contam como cobertos.</p>' : '') + '</div>';
        h += '<div class="es-duas"><div class="jr-caixa"><h3>Retomadas</h3><p class="es-num">' + p.revisoes.hoje + '</p><p class="al-sub">para hoje' +
          (p.revisoes.adiadas ? ' · ' + p.revisoes.adiadas + ' ficaram para depois, para a fila caber no dia' : '') + '</p></div>' +
          '<div class="jr-caixa"><h3>Seu desempenho</h3>' + (d.respostas ? '<table class="es-tab">' +
            '<tr><td>Em questões novas para você</td><td class="n">' + d.acertos_ineditas + ' de ' + d.ineditas + '</td></tr>' +
            '<tr><td>Sem pista nem apoio</td><td class="n">' + d.acertos_sem_apoio + ' de ' + d.sem_apoio + '</td></tr>' +
            '<tr><td>Tudo, incluindo repetidas e com pista</td><td class="n">' + d.acertos + ' de ' + d.respostas + '</td></tr></table>'
            : '<p class="al-sub">Ainda sem respostas. Os números aparecem depois da primeira questão.</p>') + '</div></div>';
        if (p.erros_pendentes) h += '<div class="jr-caixa"><h3>Caderno de erros</h3><p class="al-sub">' + p.erros_pendentes + ' questão(ões) em que a sua última resposta foi um erro. Refazer não conta como domínio, mas fecha a lacuna.</p>' +
          '<button class="al-bt fan" id="es-hj-err">Abrir o caderno</button></div>';
        alvo.innerHTML = h;
        if (el('es-hj-err')) el('es-hj-err').onclick = function () { ir('erros'); };
        if (el('es-agir')) el('es-agir').onclick = function () { ac[1](px); };
        el('es-outra').onclick = function () { ir('programa'); };
      });
    }

    // RETA FINAL (ADR-0007): o que muda perto da prova, dito na tela — e os checklists de véspera e do dia
    var FOCO_PROVA = { objetiva: 'prova objetiva', escrita: 'provas escritas', oral: 'prova oral' };
    function lista(itens) { return '<ul class="es-check">' + itens.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
    function retaFinal(p) {
      var r = p.reta_final;
      if (!r || !r.fase) return '';
      var semDesconto = !(p.regra_pontuacao && p.regra_pontuacao.desconto), foco = FOCO_PROVA[r.foco] || 'prova';
      if (r.fase === 'revisao_geral') return '<div class="jr-caixa es-reta"><p class="al-rotulo">Reta final · faltam ' + r.dias + ' dias</p><h3>Revisão geral</h3>' +
        '<p>A partir de agora, a maior parte de cada sessão é do que você já estudou: retomadas, cards, caderno de erros e simulado. Matéria nova fica com a menor fatia do dia.</p></div>';
      if (r.fase === 'vespera') return '<div class="jr-caixa es-reta"><p class="al-rotulo">Reta final · faltam ' + r.dias + ' dias</p><h3>Sem matéria nova — ' + esc(foco) + '</h3>' +
        '<p>Nestes últimos dias, só o que já foi visto: abra a "Véspera de prova" das aulas estudadas (fichas, slides e mapa), refaça o caderno de erros e faça um simulado com o tempo real.</p></div>';
      if (r.fase === 'vespera_imediata') return '<div class="jr-caixa es-reta"><p class="al-rotulo">A prova é amanhã</p><h3>Véspera</h3>' + lista([
        'Só resumos, fichas e provas anteriores. Nada novo hoje.',
        'Confira o local e o horário; separe documento, caneta e o que o edital exige.',
        'Deixe comida leve e água prontas; roupa confortável e um casaco para o ar-condicionado.',
        'Evite discussões, novidades e dormir tarde. O sono de hoje faz parte da prova.']) + '</div>';
      return '<div class="jr-caixa es-reta"><p class="al-rotulo">Hoje é o dia da prova</p><h3>Na prova</h3>' + lista([
        'Sente-se, respire e leia as instruções com calma.',
        'Responda exatamente o que foi perguntado; atenção também às questões fáceis.',
        'Divida o tempo pelos blocos e reserve o fim para o cartão de respostas.',
        semDesconto ? 'Nesta prova o erro não desconta: não deixe questão em branco.' : 'Nesta prova o erro desconta: só marque quando conseguir eliminar alternativas.',
        'O objetivo é passar, não acertar tudo. Questão travada fica para a segunda volta.']) + '</div>';
    }

    // ================= AULAS: tudo por disciplina — a aula ativa e a leitura corrida (ADR-0008) =================
    var NOME_BLOCO = { explicacao: '', exemplo: 'Exemplo', sintese: 'Síntese' };
    function aulas(alvo, disc) {
      if (disc != null) return lerDisciplina(alvo, disc);
      var p = E.painel, mm = materias(), grupos = [], por = {};
      p.unidades.forEach(function (u) {
        var m = mm[(u.competencias || [])[0]] || { disciplina: 'Método de estudo', item: '', cod: '' };
        var cod = m.cod || '_metodo'; // o mesmo agrupamento do servidor: sem disciplina-mãe no programa, a aula fica no grupo geral
        var g = por[cod];
        if (!g) { g = por[cod] = { cod: cod, nome: m.disciplina, aulas: [] }; grupos.push(g); }
        g.aulas.push({ u: u, item: m.item });
      });
      alvo.innerHTML = '<div class="jr-caixa"><h3>Aulas</h3><p class="al-sub">' + p.unidades.length + ' aulas em ' + grupos.length + ' disciplinas, na ordem do edital. ' +
        '<b>Abrir a aula</b> leva à aula ativa (desafio, explicação, prática e os resumos de 50, 25 e 10 %). <b>Mapa mental</b> abre o mapa da aula pronto para imprimir ou salvar em PDF. <b>Ler a disciplina</b> junta a teoria em texto corrido, para ler de uma vez, grifar com marca-texto, imprimir ou salvar em PDF.</p>' +
        '<div class="es-linha"><button class="al-bt peq fan" id="es-au-mt">🖍️ Minhas marcações</button></div></div>' +
        grupos.map(function (g, n) {
          return '<details class="es-acervo"' + (n === 0 ? ' open' : '') + '><summary><b>' + esc(g.nome) + '</b><span class="al-fino"> · ' + g.aulas.length + ' aula(s)</span></summary>' +
            '<div class="es-linha"><button class="al-bt peq" data-ler="' + esc(g.cod) + '">📄 Ler a disciplina (texto corrido / PDF)</button></div>' +
            g.aulas.map(function (a) {
              return '<div class="es-aula-linha"><span>' + (a.item ? '<b>' + esc(a.item) + '</b> ' : '') + esc(a.u.titulo) + (a.u.tempo_min ? '<span class="al-fino"> · ' + horas(a.u.tempo_min) + '</span>' : '') +
                (a.u.status !== 'publicado' ? ' <span class="marca-rasc">' + esc(a.u.status) + '</span>' : '') + '</span>' +
                '<span class="es-aula-bts">' + (a.u.mapa ? '<button class="al-bt peq fan" data-mapa="' + esc(a.u.codigo) + '">🧠 Mapa mental (PDF)</button>' : '<span class="al-fino">mapa em preparação</span>') +
                '<button class="al-bt peq fan" data-un="' + esc(a.u.codigo) + '">Abrir a aula</button></span></div>';
            }).join('') + '</details>';
        }).join('');
      cada(alvo, '[data-un]', function (b) { b.onclick = function () { ir('unidade', b.getAttribute('data-un')); }; });
      cada(alvo, '[data-ler]', function (b) { b.onclick = function () { lerDisciplina(alvo, b.getAttribute('data-ler')); }; });
      if (el('es-au-mt')) el('es-au-mt').onclick = function () { minhasMarcacoes(alvo); };
      cada(alvo, '[data-mapa]', function (b) { b.onclick = function () { abrirMapa(b.getAttribute('data-mapa'), window.open('', '_blank')); }; });
    }
    // ---- MARCA-TEXTO na leitura: o que o aluno grifa fica salvo na conta dele ----
    // A marcação é ancorada no texto CRU do bloco (aula, bloco, início, fim). Por
    // isso cada parágrafo carrega `data-o` — a posição onde ele começa no texto
    // cru — e o HTML não pode ter nada além do texto, <br> e <mark>, senão a conta
    // do deslocamento a partir da seleção sai errada.
    var COR_MARCA = { amarelo: 'Amarelo', verde: 'Verde', azul: 'Azul', rosa: 'Rosa' };
    function textoMarcado(cru, marcas) {
      cru = String(cru || '');
      var pars = [], re = /\n{2,}/g, ini = 0, m;
      while ((m = re.exec(cru))) { pars.push([ini, m.index]); ini = m.index + m[0].length; }
      pars.push([ini, cru.length]);
      return pars.map(function (p) {
        var a = p[0], z = p[1], cortes = [a, z];
        marcas.forEach(function (k) { if (k.inicio > a && k.inicio < z) cortes.push(k.inicio); if (k.fim > a && k.fim < z) cortes.push(k.fim); });
        cortes.sort(function (x, y) { return x - y; });
        var h = '';
        for (var i = 0; i < cortes.length - 1; i++) {
          var x = cortes[i], y = cortes[i + 1];
          if (y <= x) continue;
          var dona = null;
          marcas.forEach(function (k) { if (k.inicio <= x && k.fim >= y) dona = k; }); // a mais recente por cima
          var t = esc(cru.slice(x, y)).replace(/\n/g, '<br>');
          h += dona ? '<mark class="mt-' + esc(dona.cor) + (dona.nota ? ' nota' : '') + '" data-mt="' + esc(dona.id) + '"' + (dona.nota ? ' title="' + esc(dona.nota) + '"' : '') + '>' + t + '</mark>' : t;
        }
        return '<p data-o="' + a + '">' + h + '</p>';
      }).join('');
    }
    // posição no texto cru de um ponto (nó, deslocamento) da seleção, dentro do bloco
    function posicaoCrua(bloco, no, des) {
      var p = no.nodeType === 1 ? no : no.parentNode;
      while (p && p !== bloco && !(p.getAttribute && p.getAttribute('data-o') != null)) p = p.parentNode;
      if (!p || p === bloco) return null;
      var total = Number(p.getAttribute('data-o')), achou = false;
      function tam(x) { if (x.nodeType === 3) return x.nodeValue.length; if (x.nodeName === 'BR') return 1; var n = 0; for (var c = x.firstChild; c; c = c.nextSibling) n += tam(c); return n; }
      (function anda(x) {
        if (achou) return;
        if (x === no) {
          if (x.nodeType === 3) total += des; else { var c = x.firstChild; for (var i = 0; i < des && c; i++, c = c.nextSibling) total += tam(c); }
          achou = true; return;
        }
        if (x.nodeType === 3) { total += x.nodeValue.length; return; }
        if (x.nodeName === 'BR') { total += 1; return; }
        for (var f = x.firstChild; f && !achou; f = f.nextSibling) anda(f);
      })(p);
      return achou ? total : null;
    }
    function blocoDe(no) { var x = no && (no.nodeType === 1 ? no : no.parentNode); while (x && !(x.classList && x.classList.contains('es-ler-bl'))) x = x.parentNode; return x || null; }

    function lerDisciplina(alvo, cod, irPara) {
      alvo.innerHTML = '<p class="al-sub">Carregando a leitura…</p>';
      Promise.all([api('GET', base() + '/leitura?disciplina=' + encodeURIComponent(cod)), api('GET', base() + '/marcacoes')]).then(function (rs) {
        var r = rs[0], marcas = rs[1].marcacoes.filter(function (k) { return !k.solta; }), crus = {};
        function doBloco(un, n) { return marcas.filter(function (k) { return k.unidade === un && k.bloco === n; }); }
        var corpo = '<h1>' + esc(r.nome) + '</h1><p class="es-ler-sub">' + esc(r.escopo) + ' · ' + r.aulas.length + ' aulas</p>' +
          r.aulas.map(function (a) {
            return '<section><h2>' + esc(a.titulo) + '</h2>' +
              (a.itens.length ? '<p class="es-ler-item">' + a.itens.map(function (i) { return '<b>' + esc(i.codigo) + '</b> ' + esc(i.texto); }).join(' · ') + '</p>' : '') +
              a.blocos.map(function (b) {
                crus[a.codigo + '|' + b.n] = b.texto;
                return (NOME_BLOCO[b.tipo] ? '<h3>' + NOME_BLOCO[b.tipo] + (b.titulo ? ' — ' + esc(b.titulo) : '') + '</h3>' : (b.titulo ? '<h3>' + esc(b.titulo) + '</h3>' : '')) +
                  '<div class="es-ler-bl" data-un="' + esc(a.codigo) + '" data-bl="' + b.n + '">' + textoMarcado(b.texto, doBloco(a.codigo, b.n)) + '</div>';
              }).join('') +
              (a.fontes.length ? '<p class="es-ler-fontes"><b>Fontes:</b> ' + a.fontes.map(function (f) { return esc(f.titulo); }).join('; ') + '</p>' : '') + '</section>';
          }).join('');
        alvo.innerHTML = '<div class="jr-caixa"><div class="es-linha"><button class="al-bt peq fan" id="es-ler-volta">← Todas as aulas</button>' +
          '<button class="al-bt peq fan" id="es-ler-mt">🖍️ Minhas marcações</button>' +
          '<button class="al-bt peq" id="es-ler-pdf">🖨️ Imprimir ou salvar em PDF</button></div>' +
          '<p class="al-fino">🖍️ Para grifar, selecione um trecho do texto e escolha a cor. As marcações ficam salvas na sua conta; toque numa marcação para anotar, trocar a cor ou apagar.</p></div>' +
          '<article class="es-ler" id="es-ler-art">' + corpo + '</article><div class="es-mt-barra" id="es-mt" hidden></div>';
        var art = el('es-ler-art'), barra = el('es-mt');
        el('es-ler-volta').onclick = function () { fechar(); aulas(alvo); };
        el('es-ler-mt').onclick = function () { fechar(); minhasMarcacoes(alvo); };
        el('es-ler-pdf').onclick = function () {
          var w = window.open('', '_blank');
          if (!w) return;
          w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(r.nome) + '</title><style>' +
            '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font:12pt/1.55 Georgia,serif;color:#111;max-width:720px;margin:24px auto;padding:0 20px}h1{font-size:22pt;margin:0 0 4px}h2{font-size:15pt;margin:28px 0 4px;page-break-after:avoid}' +
            'h3{font-size:12pt;margin:16px 0 4px}p{margin:0 0 9px;text-align:justify}.es-ler-sub,.es-ler-item,.es-ler-fontes{font-size:10pt;color:#444;text-align:left}section{page-break-inside:auto}' +
            'mark{color:inherit;border-radius:2px}.mt-amarelo{background:#fff3a3}.mt-verde{background:#c9f2d0}.mt-azul{background:#cfe6ff}.mt-rosa{background:#ffd3e2}' +
            '</style></head><body>' + art.innerHTML + '</body></html>'); // sai com os grifos
          w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
        };

        function fechar() { barra.hidden = true; barra.innerHTML = ''; }
        function redesenha(un, n) {
          var b = art.querySelector('.es-ler-bl[data-un="' + un + '"][data-bl="' + n + '"]');
          if (b) b.innerHTML = textoMarcado(crus[un + '|' + n], doBloco(un, n));
        }
        function mostrarBarra(ret, html) {
          barra.innerHTML = html; barra.hidden = false;
          var larg = barra.offsetWidth || 240, alt = barra.offsetHeight || 44;
          var x = Math.max(8, Math.min(window.innerWidth - larg - 8, ret.left + ret.width / 2 - larg / 2));
          var y = ret.top - alt - 8; if (y < 8) y = ret.bottom + 8;
          barra.style.left = x + 'px'; barra.style.top = y + 'px';
        }
        function cores(sel) {
          return Object.keys(COR_MARCA).map(function (c) { return '<button class="mt-cor mt-' + c + (c === sel ? ' on' : '') + '" data-cor="' + c + '" title="' + COR_MARCA[c] + '" aria-label="Marcar em ' + COR_MARCA[c].toLowerCase() + '"></button>'; }).join('');
        }
        // seleção nova → barra de cores
        function aoSelecionar() {
          var s = window.getSelection();
          if (!s || s.isCollapsed || !s.rangeCount) return;
          var g = s.getRangeAt(0), bl = blocoDe(g.startContainer);
          if (!bl || !art.contains(bl)) return;
          var un = bl.getAttribute('data-un'), n = Number(bl.getAttribute('data-bl')), cru = crus[un + '|' + n];
          var ini = posicaoCrua(bl, g.startContainer, g.startOffset);
          // seleção que atravessa para outro trecho fica só com a parte deste
          var fim = blocoDe(g.endContainer) === bl ? posicaoCrua(bl, g.endContainer, g.endOffset) : cru.length;
          if (ini == null || fim == null) return;
          while (ini < fim && /\s/.test(cru.charAt(ini))) ini++;
          while (fim > ini && /\s/.test(cru.charAt(fim - 1))) fim--;
          if (fim - ini < 2) return;
          mostrarBarra(g.getBoundingClientRect(), '<span class="al-fino">Grifar:</span>' + cores(''));
          cada(barra, '[data-cor]', function (b) {
            b.onmousedown = function (e) { e.preventDefault(); }; // não desfaz a seleção antes do clique
            b.onclick = function () {
              api('POST', base() + '/marcacoes', { unidade: un, bloco: n, inicio: ini, fim: fim, cor: b.getAttribute('data-cor') }).then(function (x) {
                marcas.push(x.marcacao); window.getSelection().removeAllRanges(); fechar(); redesenha(un, n);
              }).catch(function (e) { barra.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
            };
          });
        }
        art.addEventListener('mouseup', function () { setTimeout(aoSelecionar, 10); });
        art.addEventListener('touchend', function () { setTimeout(aoSelecionar, 250); });
        // toque numa marcação existente → anotar, trocar a cor, apagar
        art.addEventListener('click', function (e) {
          var mk = e.target.closest ? e.target.closest('mark[data-mt]') : null;
          var s = window.getSelection();
          if (!mk || (s && !s.isCollapsed)) return;
          var k = marcas.filter(function (x) { return x.id === mk.getAttribute('data-mt'); })[0];
          if (!k) return;
          mostrarBarra(mk.getBoundingClientRect(), cores(k.cor) + '<input id="es-mt-nota" maxlength="500" placeholder="Anotação (opcional)" value="' + esc(k.nota || '') + '">' +
            '<button class="al-bt peq" id="es-mt-ok">Salvar</button><button class="al-bt peq fan" id="es-mt-del">Apagar</button>');
          function salvar(cor) {
            api('PUT', base() + '/marcacoes/' + k.id, { cor: cor || k.cor, nota: el('es-mt-nota').value }).then(function (x) {
              k.cor = x.marcacao.cor; k.nota = x.marcacao.nota; fechar(); redesenha(k.unidade, k.bloco);
            }).catch(function (er) { barra.innerHTML = '<span class="es-msg-erro">' + esc(er.message) + '</span>'; });
          }
          cada(barra, '[data-cor]', function (b) { b.onclick = function () { salvar(b.getAttribute('data-cor')); }; });
          el('es-mt-ok').onclick = function () { salvar(); };
          el('es-mt-nota').onkeydown = function (ev) { if (ev.key === 'Enter') salvar(); };
          el('es-mt-del').onclick = function () {
            api('DELETE', base() + '/marcacoes/' + k.id).then(function () {
              marcas.splice(marcas.indexOf(k), 1); fechar(); redesenha(k.unidade, k.bloco);
            }).catch(function (er) { barra.innerHTML = '<span class="es-msg-erro">' + esc(er.message) + '</span>'; });
          };
        });
        document.addEventListener('mousedown', function (e) { if (barra.isConnected && !barra.hidden && !barra.contains(e.target) && !(e.target.closest && e.target.closest('mark[data-mt]'))) fechar(); });
        window.addEventListener('scroll', function () { if (barra.isConnected && !barra.hidden && !barra.querySelector('input')) fechar(); }, { passive: true });

        if (irPara) {
          var destino = art.querySelector('mark[data-mt="' + irPara + '"]');
          if (destino) { destino.scrollIntoView({ block: 'center' }); destino.classList.add('pisca'); return; }
        }
        window.scrollTo(0, 0);
      }).catch(function (e) { falha(alvo, e); });
    }

    // ---- rever: tudo o que foi grifado, por aula, com a anotação ----
    function minhasMarcacoes(alvo) {
      alvo.innerHTML = '<p class="al-sub">Carregando as marcações…</p>';
      api('GET', base() + '/marcacoes').then(function (r) {
        var mm = materias(), comp = {}, grupos = [], por = {};
        (E.painel.unidades || []).forEach(function (u) { comp[u.codigo] = (u.competencias || [])[0]; });
        r.marcacoes.forEach(function (k) {
          var g = por[k.unidade];
          if (!g) { g = por[k.unidade] = { un: k.unidade, titulo: k.titulo || k.unidade, marcas: [] }; grupos.push(g); }
          g.marcas.push(k);
        });
        function disc(un) { var m = mm[comp[un]]; return (m && m.cod) || '_metodo'; }
        alvo.innerHTML = '<div class="jr-caixa"><p class="al-rotulo">Para rever</p><h3>Minhas marcações</h3>' +
          '<p class="al-sub">' + (r.marcacoes.length ? r.marcacoes.length + ' trecho(s) grifado(s) em ' + grupos.length + ' aula(s).' : 'Você ainda não grifou nada. Abra uma disciplina em "Ler a disciplina", selecione um trecho e escolha a cor.') + '</p>' +
          '<div class="es-linha"><button class="al-bt peq fan" id="es-mm-volta">← Todas as aulas</button></div></div>' +
          grupos.map(function (g) {
            return '<div class="jr-caixa"><h4>' + esc(g.titulo) + '</h4>' + g.marcas.map(function (k) {
              return '<div class="es-mm"><blockquote class="mt-' + esc(k.cor) + '">' + esc(k.texto) + '</blockquote>' +
                (k.nota ? '<p class="es-mm-nota">✎ ' + esc(k.nota) + '</p>' : '') +
                '<p class="al-fino">' + dataBR(String(k.criado_em).slice(0, 10)) + (k.solta ? ' · <b>a aula foi reescrita e este trecho mudou de lugar</b>' : '') + ' · ' +
                (k.solta ? '' : '<button class="es-link" data-ir="' + esc(k.id) + '" data-un="' + esc(k.unidade) + '">ver no texto</button> · ') +
                '<button class="es-link" data-del="' + esc(k.id) + '">apagar</button></p></div>';
            }).join('') + '</div>';
          }).join('');
        el('es-mm-volta').onclick = function () { aulas(alvo); };
        cada(alvo, '[data-ir]', function (b) { b.onclick = function () { lerDisciplina(alvo, disc(b.getAttribute('data-un')), b.getAttribute('data-ir')); }; });
        cada(alvo, '[data-del]', function (b) { b.onclick = function () { api('DELETE', base() + '/marcacoes/' + b.getAttribute('data-del')).then(function () { minhasMarcacoes(alvo); }).catch(function (e) { falha(alvo, e); }); }; });
      }).catch(function (e) { falha(alvo, e); });
    }

    // ================= PROGRAMA: cada item com o seu destino =================
    function programa(alvo) {
      var p = E.painel, uns = {};
      p.unidades.forEach(function (u) { uns[u.codigo] = u; });
      var h = '<div class="jr-caixa"><h3>Programa</h3><p class="al-sub">O texto de cada item é o original. Ao lado, o que já existe para ele e o que você demonstrou.</p><div class="es-prog">' +
        p.itens.map(function (i) {
          var nivel = i.codigo.split('.').length - 1;
          if (!i.folha) return '<div class="es-item pai" style="--n:' + nivel + '"><b>' + esc(i.codigo) + '</b> ' + esc(i.texto) + '</div>';
          var q = i.questoes_revisadas + i.questoes_sugeridas;
          return '<div class="es-item" style="--n:' + nivel + '"><div class="es-item-txt"><b>' + esc(i.codigo) + '</b> ' + esc(i.texto) +
            (i.pendente ? '<span class="es-pend">leitura a conferir: ' + esc(i.pendente) + '</span>' : '') +
            (i.oficiais ? '<span class="es-banca" title="Questões oficiais desta banca vinculadas a este ponto">cobrado ' + i.oficiais + '× em prova oficial</span>' : '') + '</div>' +
            '<div class="es-item-st">' + selo(i.dominio) +
            (i.unidades.length ? i.unidades.map(function (u) { return '<button class="es-link" data-un="' + esc(u) + '">📖 ' + esc((uns[u] || {}).titulo || 'Aula') + '</button>'; }).join('') : '<span class="es-falta">sem aula ainda</span>') +
            (q ? '<span class="al-fino">' + q + ' questão(ões)</span>' : '<span class="es-falta">sem questão ainda</span>') + '</div></div>';
        }).join('') + '</div></div>';
      h += '<div class="jr-caixa"><h3>Competências</h3><p class="al-sub">O que você precisa saber fazer. "Demonstrada" exige acerto sem pista em questão que você ainda não tinha visto; "retida", um novo acerto dias depois.</p>' +
        p.competencias.map(function (c) {
          return '<div class="es-comp"><div><p class="es-comp-mat"><b>' + esc(nomeComp(c.codigo)) + '</b><span class="al-fino"> · ' + esc(materias()[c.codigo].disciplina) + '</span></p><p>' + esc(c.resultado) + '</p><span class="al-fino">' + c.tentativas + ' resposta(s) · ' + c.acertos + ' acerto(s)' +
            (c.depende_de.length ? ' · depende de: ' + c.depende_de.map(esc).join(', ') : '') + (c.estagnada ? ' · <b>várias tentativas sem acerto — volte à explicação</b>' : '') + '</span></div>' +
            '<div class="es-comp-st">' + selo(c.estado) + '<button class="al-bt peq fan" data-pr="' + esc(c.codigo) + '">Praticar</button></div></div>';
        }).join('') + '</div>';
      alvo.innerHTML = h;
      cada(alvo, '[data-un]', function (b) { b.onclick = function () { ir('unidade', b.getAttribute('data-un')); }; });
      cada(alvo, '[data-pr]', function (b) { b.onclick = function () { ir('praticar', b.getAttribute('data-pr')); }; });
    }

    // ================= MAPA MENTAL (um por aula, em PDF) =================
    // A árvore vem do material de véspera ("- item", dois espaços por nível). Vira
    // mapa de ramos coloridos, uma página por foco, numa janela própria — o PDF sai pelo
    // "salvar como PDF" do navegador, sem servidor e sem biblioteca.
    function arvoreDoMapa(txt) {
      var raiz = { t: '', f: [] }, pilha = [{ n: -1, no: raiz }];
      String(txt || '').split('\n').forEach(function (l) {
        var m = /^(\s*)-\s+(.*\S)\s*$/.exec(l);
        if (!m) return;
        var n = Math.floor(m[1].length / 2), no = { t: m[2], f: [] };
        while (pilha.length > 1 && pilha[pilha.length - 1].n >= n) pilha.pop();
        pilha[pilha.length - 1].no.f.push(no);
        pilha.push({ n: n, no: no });
      });
      return raiz;
    }
    var CORES_MAPA = ['#1B2A4A', '#B45309', '#12805C', '#7C3AED', '#BE123C', '#0E7490', '#4D7C0F', '#9D174D'];
    function htmlDoMapa(titulo, txt) {
      var raiz = arvoreDoMapa(txt);
      if (!raiz.f.length) return '';
      // se a árvore já tem um tronco só, ele é o centro; senão o centro é o título da aula
      var centro = raiz.f.length === 1 && raiz.f[0].f.length ? raiz.f[0] : { t: titulo, f: raiz.f };
      function no(x, nivel) {
        return '<div class="no' + (x.f.length ? ' tem' : '') + ' n' + Math.min(nivel, 3) + '"><div class="rot">' + esc(x.t) + '</div>' +
          (x.f.length ? '<div class="filhos">' + x.f.map(function (y) { return no(y, nivel + 1); }).join('') + '</div>' : '') + '</div>';
      }
      return '<div class="mapa"><div class="centro">' + esc(centro.t) + '</div><div class="ramos">' +
        centro.f.map(function (r, i) { return '<div class="ramo" style="--c:' + CORES_MAPA[i % CORES_MAPA.length] + '">' + no(r, 1) + '</div>'; }).join('') + '</div></div>';
    }
    var CSS_MAPA = '@page{size:A4 portrait;margin:9mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'body{font:9.5pt/1.3 Arial,Helvetica,sans-serif;color:#111;margin:14px}' +
      'header{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-bottom:2px solid #1B2A4A;padding-bottom:5px;margin-bottom:10px}' +
      'header h1{font:700 14pt Georgia,serif;margin:0;color:#1B2A4A}header span{font-size:8.5pt;color:#555;text-align:right}' +
      '.pag{page-break-after:always}.pag:last-child{page-break-after:auto}' +
      '.mapa{display:flex;align-items:center;zoom:.74}' +
      '.centro{flex:0 0 150px;background:#1B2A4A;color:#fff;font:700 11pt/1.25 Georgia,serif;padding:12px 10px;border-radius:14px;text-align:center}' +
      '.ramos{display:flex;flex-direction:column;gap:6px;margin-left:18px;padding-left:14px;border-left:3px solid #1B2A4A}' +
      '.ramo{page-break-inside:avoid}.no{display:flex;align-items:center}' +
      '.rot{position:relative;border:1.5px solid var(--c);border-radius:9px;padding:3px 8px;margin:2px 0;background:#fff;max-width:420px}' +
      '.n1>.rot{background:var(--c);color:#fff;font-weight:700;font-size:10pt;flex:0 0 150px;max-width:150px}' +
      '.n2>.rot{color:var(--c);max-width:600px}.n2.tem>.rot{font-weight:700;flex:0 0 190px;max-width:190px}.n3>.rot{border-style:dashed;border-width:1px;font-size:8.5pt}' +
      '.tem>.rot::after{content:"";position:absolute;left:100%;top:50%;width:12px;border-top:1.5px solid var(--c)}' +
      '.filhos{display:flex;flex-direction:column;margin-left:12px;border-left:1.5px solid var(--c)}' +
      '.filhos>.no{position:relative;padding-left:12px}.filhos>.no::before{content:"";position:absolute;left:0;top:50%;width:12px;border-top:1.5px solid var(--c)}' +
      'footer{margin-top:8px;font-size:7.5pt;color:#777}@media screen{body{max-width:1120px;margin:20px auto}}';
    // a janela é aberta no clique (antes do fetch), senão o navegador a bloqueia como pop-up
    function abrirMapa(codigo, janela) {
      var w = janela || window.open('', '_blank');
      if (!w) return;
      w.document.write('<p style="font:14px Arial">Montando o mapa mental…</p>');
      api('GET', base() + '/unidades/' + encodeURIComponent(codigo)).then(function (u) {
        var focos = ['objetiva', 'escrita', 'oral'].filter(function (f) { return u.vespera && u.vespera[f] && u.vespera[f].mapa; });
        var pags = focos.map(function (f) {
          return '<section class="pag"><header><h1>' + esc(u.titulo) + '</h1><span>Mapa mental · ' + esc(FOCO[f] || f) + ' · ' + esc(E.titulo || '') + '</span></header>' +
            htmlDoMapa(u.titulo, u.vespera[f].mapa) + '<footer>Villela Academy · Estude · mapa da versão ' + u.versao + ' da aula. Confira a vigência de leis e súmulas antes da prova.</footer></section>';
        }).join('');
        w.document.open();
        w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Mapa mental — ' + esc(u.titulo) + '</title><style>' + CSS_MAPA + '</style></head><body>' +
          (pags || '<p>Esta aula ainda não tem mapa mental.</p>') + '</body></html>');
        w.document.close(); w.focus();
        if (pags) setTimeout(function () { w.print(); }, 400);
      }).catch(function (e) { w.document.open(); w.document.write('<p>' + esc(e.message) + '</p>'); w.document.close(); });
    }

    // ================= AULA ATIVA =================
    var FOCO = { objetiva: 'Prova objetiva', escrita: 'Provas escritas', oral: 'Prova oral' };
    function vespera(u) {
      var focos = Object.keys(u.vespera || {});
      if (!focos.length) return '';
      return '<details class="es-vespera"><summary>Véspera de prova — fichas, slides e mapa</summary>' + focos.map(function (f) {
        var p = u.vespera[f];
        return '<section class="es-foco"><h4>' + esc(FOCO[f] || f) + (p.desatualizado ? ' <span class="marca-rasc">desatualizado</span>' : '') + '</h4>' +
          (p.fichas.length ? '<ul class="es-fichas">' + p.fichas.map(function (x) { return '<li><b>' + esc(x.frente) + '</b> — ' + esc(x.verso) + '</li>'; }).join('') + '</ul>' : '') +
          (p.slides.length ? p.slides.map(function (sl) { return '<div class="es-slide"><b>' + esc(sl.titulo) + '</b><ul>' + sl.topicos.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>'; }).join('') : '') +
          (p.mapa ? '<pre class="es-mapa">' + esc(p.mapa) + '</pre>' : '') + '</section>';
      }).join('') + '</details>';
    }
    function unidade(alvo, codigo, nivel) {
      api('GET', base() + '/unidades/' + encodeURIComponent(codigo) + (nivel ? '?nivel=' + nivel : '')).then(function (u) {
        var acao = { pratica: 1, aplicacao: 1, desafio: 1, recordacao: 1 };
        // ADR-0005: o seletor só aparece quando a aula tem algum nível além do 100
        var sel = u.niveis && u.niveis.length > 1 ? '<p class="es-niveis"><span class="al-fino">Quanto ler: </span>' + u.niveis.map(function (n) {
          return '<button class="al-bt peq' + (n.nivel === u.nivel ? '' : ' fan') + '" data-nv="' + n.nivel + '"' + (n.disponivel ? '' : ' disabled') + ' title="' + (n.desatualizado ? 'resumo de versão anterior da aula' : '') + '">' + n.nivel + ' %</button>';
        }).join(' ') + (u.nivel_motivo ? '<span class="al-fino"> ' + esc(u.nivel_motivo) + '</span>' : '') + '</p>' : '';
        alvo.innerHTML = '<div class="jr-caixa es-aula"><p class="al-rotulo">Aula ativa' + (u.tempo_min ? ' · cerca de ' + horas(u.tempo_min) : '') + (u.nivel !== 100 ? ' · versão ' + u.nivel + ' %' : '') + '</p><h3>' + esc(u.titulo) +
          (u.status === 'rascunho' ? ' <span class="marca-rasc">rascunho</span>' : '') + '</h3>' + sel +
          u.blocos.map(function (b) {
            return '<section class="es-bloco ' + b.tipo + '"><h4>' + esc(b.titulo || BLOCO[b.tipo]) + '</h4>' + texto(b.texto) +
              (b.criterio ? '<p class="al-fino"><b>Critério:</b> ' + esc(b.criterio) + '</p>' : '') +
              (acao[b.tipo] ? '<textarea class="es-ta" data-n="' + b.n + '" rows="4" placeholder="Escreva a sua tentativa aqui, antes de ver a solução."></textarea>' +
                (b.tem_solucao ? '<div class="es-linha"><button class="al-bt peq fan" data-sol="' + b.n + '">Ver a solução</button><span class="al-fino" data-msg="' + b.n + '">A solução aparece depois da sua tentativa.</span></div><div class="es-sol" data-out="' + b.n + '"></div>' : '') : '') +
              '</section>';
          }).join('') +
          (u.midias.length ? '<p class="al-fino">Formatos desta aula: ' + u.midias.map(function (m) { return esc(m.tipo) + ' (' + (MIDIA[m.estado] || esc(m.estado)) + ')'; }).join(' · ') + '</p>' : '') +
          (u.fontes.length ? '<details class="es-fontes"><summary>Fontes</summary><ul>' + u.fontes.map(function (f) {
            return '<li>' + esc(f.titulo) + (f.consultado_em ? ' — consultado em ' + dataBR(f.consultado_em) : '') + '</li>';
          }).join('') + '</ul></details>' : '') + vespera(u) +
          '<div class="es-linha">' + (u.vespera && u.vespera.objetiva && u.vespera.objetiva.mapa ? '<button class="al-bt fan" id="es-un-mapa">🧠 Mapa mental (PDF)</button>' : '') + '<button class="al-bt" id="es-un-pr">Praticar esta matéria</button><button class="al-bt fan" id="es-un-vt">Voltar ao programa</button></div></div>';
        cada(alvo, '[data-nv]', function (b) { b.onclick = function () { unidade(alvo, codigo, b.getAttribute('data-nv')); }; });
        if (el('es-un-mapa')) el('es-un-mapa').onclick = function () { abrirMapa(codigo, window.open('', '_blank')); };
        cada(alvo, '[data-sol]', function (b) {
          b.onclick = function () {
            var n = b.getAttribute('data-sol'), ta = alvo.querySelector('textarea[data-n="' + n + '"]'), msg = alvo.querySelector('[data-msg="' + n + '"]');
            api('POST', base() + '/unidades/' + encodeURIComponent(codigo) + '/blocos/' + n + '/solucao', { tentativa: ta.value }).then(function (r) {
              alvo.querySelector('[data-out="' + n + '"]').innerHTML = '<h4>Solução comentada</h4>' + texto(r.solucao) + '<p class="al-fino">Compare com o que você escreveu e corrija uma frase da sua tentativa.</p>';
              b.disabled = true; msg.textContent = '';
            }).catch(function (e) { msg.textContent = e.message; msg.className = 'es-msg-erro'; });
          };
        });
        el('es-un-pr').onclick = function () { ir('praticar', u.competencias[0]); };
        el('es-un-vt').onclick = function () { ir('programa'); };
        window.scrollTo(0, 0);
      }).catch(function (e) { falha(alvo, e); });
    }

    // ================= PRATICAR =================
    function procedencia(q) {
      var p = q.procedencia || {}, partes = [ORIGEM[q.origem] || q.origem];
      if (q.origem === 'oficial' || q.origem === 'adaptada') partes.push([p.banca, p.orgao, p.concurso, p.ano || '', p.caderno, p.numero_original ? 'nº ' + p.numero_original : ''].filter(Boolean).join(' · '));
      if (q.origem === 'autoral' && q.gerada_por_ia) partes.push('escrita com IA');
      if (p.inspirada_em) partes.push('inspirada em ' + p.inspirada_em);
      if (q.vigencia) partes.push(q.vigencia);
      return '<p class="es-proc">' + partes.filter(Boolean).map(esc).join(' — ') + '</p>';
    }
    function alternativas(q, nome, marcada) {
      return '<div class="es-alts">' + q.alternativas.map(function (a, k) {
        return '<label class="es-alt" data-alt="' + a.id + '"><input type="radio" name="' + nome + '" value="' + a.id + '"' + (marcada === a.id ? ' checked' : '') + '>' +
          '<span class="es-letra">' + String.fromCharCode(65 + k) + '</span><span class="es-alt-txt">' + esc(a.texto) + '</span></label>';
      }).join('') + '</div>';
    }
    function praticar(alvo, competencia) {
      var comps = E.painel.competencias, erradas = competencia === '__erradas__';
      competencia = erradas ? '' : (competencia || '');
      alvo.innerHTML = '<div class="jr-caixa"><div class="es-linha"><label class="es-campo">Matéria (disciplina e ponto do edital)<select id="es-pr-comp"><option value="">Todas as matérias</option>' +
        opcoesComp(competencia) +
        '</select></label></div><div id="es-pr"></div></div>';
      el('es-pr-comp').onchange = function () { praticar(alvo, el('es-pr-comp').value); };
      var out = el('es-pr');
      if (erradas) el('es-pr-comp').parentNode.parentNode.innerHTML = '<p class="al-rotulo">Refazendo o caderno de erros</p>';
      api('GET', base() + '/praticar?n=20&competencia=' + encodeURIComponent(competencia) + (erradas ? '&erradas=1' : '')).then(function (r) {
        if (!r.questoes.length) { out.innerHTML = '<p class="al-sub">' + (erradas ? 'O caderno de erros está vazio.' : 'Ainda não há questões de correção automática para esta matéria.') + '</p>'; return; }
        var i = 0, inicio = 0;
        function mostrar() {
          if (i >= r.questoes.length) {
            out.innerHTML = '<p class="al-sub">Você passou por todas as ' + r.questoes.length + ' questões disponíveis aqui. Acertar de novo a mesma questão não conta como domínio — o próximo passo é o simulado, que usa questões reservadas.</p>' +
              '<div class="es-linha"><button class="al-bt" id="es-pr-sim">Ir para a prova</button><button class="al-bt fan" id="es-pr-hj">Ver a próxima tarefa</button></div>';
            el('es-pr-sim').onclick = function () { ir('prova'); }; el('es-pr-hj').onclick = function () { ir('hoje'); };
            return;
          }
          var q = r.questoes[i];
          inicio = Date.now();
          out.innerHTML = '<p class="al-fino">Questão ' + (i + 1) + ' de ' + r.questoes.length + ' · ' + r.ineditas + ' nova(s) para você' + (q.ja_vista ? ' · <b>você já respondeu esta</b>' : '') + '</p>' +
            procedencia(q) + (q.apoio ? '<div class="es-apoio">' + texto(q.apoio) + '</div>' : '') + '<div class="es-enun">' + texto(q.enunciado) + '</div>' + alternativas(q, 'es-q') +
            '<div class="es-linha es-conf"><span class="al-fino">Sua confiança:</span>' + [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']].map(function (c) {
              return '<label><input type="radio" name="es-conf" value="' + c[0] + '"> ' + c[1] + '</label>';
            }).join('') + '</div>' +
            '<div id="es-pistas"></div><div class="es-linha"><button class="al-bt" id="es-resp">Responder</button>' +
            (q.pistas_disponiveis ? '<button class="al-bt fan" id="es-pista">Pedir uma pista</button><span class="al-fino">Com pista, o acerto conta como prática com apoio.</span>' : '') + '</div><div id="es-fb"></div>';
          if (el('es-pista')) el('es-pista').onclick = function () {
            api('POST', base() + '/questoes/' + q.id + '/pista').then(function (x) {
              el('es-pistas').innerHTML += '<p class="es-pista-txt">💡 ' + esc(x.pista) + '</p>';
              if (!x.restantes) el('es-pista').disabled = true;
            }).catch(function (e) { el('es-pista').disabled = true; el('es-pistas').innerHTML += '<p class="al-fino">' + esc(e.message) + '</p>'; });
          };
          el('es-resp').onclick = function () {
            var m = out.querySelector('input[name="es-q"]:checked'), cf = out.querySelector('input[name="es-conf"]:checked');
            if (!m) { el('es-fb').innerHTML = '<p class="es-msg-erro">Escolha uma alternativa.</p>'; return; }
            el('es-resp').disabled = true;
            api('POST', base() + '/questoes/' + q.id + '/responder', { resposta: m.value, confianca: cf ? cf.value : '', tempo_seg: Math.round((Date.now() - inicio) / 1000) }).then(function (x) {
              cada(out, '.es-alt', function (l) {
                var a = x.alternativas.filter(function (y) { return y.id === l.getAttribute('data-alt'); })[0];
                l.classList.add(a.correta ? 'certa' : (l.querySelector('input').checked ? 'errada' : 'neutra'));
                l.querySelector('input').disabled = true;
                if (a.explicacao) l.insertAdjacentHTML('beforeend', '<span class="es-expl">' + esc(a.explicacao) + '</span>');
              });
              var ret = Object.keys(x.retomadas || {}).map(function (k) { return x.retomadas[k].vencimento; }).filter(Boolean)[0];
              el('es-fb').innerHTML = '<div class="es-fb ' + (x.acerto ? 'ok' : 'nao') + '"><b>' + (x.acerto ? 'Certo.' : 'Não foi desta vez.') + '</b> Conta como: ' + esc(x.conta_como) + '.' +
                (ret ? ' Retomada marcada para ' + dataBR(ret) + '.' : '') + (x.comentario ? '<p>' + esc(x.comentario) + '</p>' : '') + '</div>' +
                '<label class="es-campo es-anot">Sua anotação (fica no caderno de erros)<textarea id="es-anot" rows="3" maxlength="2000" placeholder="Por que errei — ou por que cada alternativa está certa ou errada.">' + esc(x.anotacao || '') + '</textarea></label>' +
                '<div class="es-linha"><button class="al-bt" id="es-prox">Próxima questão</button><button class="al-bt fan" id="es-anot-ok">Guardar anotação</button><span class="al-fino" id="es-anot-msg"></span></div>';
              el('es-anot-ok').onclick = function () {
                api('PUT', base() + '/questoes/' + q.id + '/anotacao', { texto: el('es-anot').value }).then(function () { el('es-anot-msg').textContent = 'Guardada.'; })
                  .catch(function (e) { el('es-anot-msg').textContent = e.message; });
              };
              el('es-prox').onclick = function () { i++; mostrar(); window.scrollTo(0, 0); };
              carregar();
            }).catch(function (e) { el('es-resp').disabled = false; el('es-fb').innerHTML = '<p class="es-msg-erro">' + esc(e.message) + '</p>'; });
          };
        }
        mostrar();
      }).catch(function (e) { falha(out, e); });
    }

    // ================= CADERNO DE ERROS =================
    function erros(alvo) {
      api('GET', base() + '/erros').then(function (r) {
        if (!r.total) { alvo.innerHTML = '<div class="jr-caixa"><h3>Caderno de erros</h3><p class="al-sub">Vazio. Entra aqui a questão em que a sua última resposta foi um erro; sai quando você a acerta de novo.</p></div>'; return; }
        alvo.innerHTML = '<div class="jr-caixa"><h3>Caderno de erros <span class="es-selo ambar">' + r.total + '</span></h3>' +
          '<p class="al-sub">Questão serve para achar lacuna. Leia por que errou, anote com as suas palavras e refaça. Acertar de novo a mesma questão fecha a lacuna, mas não conta como domínio — isso exige questão nova.</p>' +
          '<div class="es-linha"><button class="al-bt" id="es-err-ref">Refazer estas questões</button></div></div>' +
          r.questoes.map(function (q) {
            return '<div class="jr-caixa es-erro"><p class="al-fino">' + (q.erros > 1 ? 'errada ' + q.erros + ' vezes' : 'errada 1 vez') + ' · última em ' + dataBR(q.ultima.slice(0, 10)) +
              (q.competencias.length ? ' · ' + esc(String(nomeComp(q.competencias[0])).slice(0, 80)) : '') + '</p><div class="es-enun">' + texto(q.enunciado) + '</div>' +
              '<details><summary>Ver o gabarito comentado</summary>' + q.alternativas.map(function (a) {
                return '<p class="es-alt-lida ' + (a.correta ? 'certa' : '') + '"><b>' + esc(a.id) + ')</b> ' + esc(a.texto) + (a.explicacao ? '<span class="es-expl">' + esc(a.explicacao) + '</span>' : '') + '</p>';
              }).join('') + (q.comentario ? '<p>' + esc(q.comentario) + '</p>' : '') + '</details>' +
              '<label class="es-campo es-anot">Sua anotação<textarea rows="2" maxlength="2000" data-anot="' + esc(q.id) + '" placeholder="Por que errei.">' + esc(q.anotacao || '') + '</textarea></label>' +
              '<div class="es-linha"><button class="al-bt peq fan" data-anot-ok="' + esc(q.id) + '">Guardar anotação</button><span class="al-fino" data-anot-msg="' + esc(q.id) + '"></span></div></div>';
          }).join('');
        el('es-err-ref').onclick = function () { ir('praticar', '__erradas__'); };
        cada(alvo, '[data-anot-ok]', function (b) {
          b.onclick = function () {
            var id = b.getAttribute('data-anot-ok'), msg = alvo.querySelector('[data-anot-msg="' + id + '"]');
            api('PUT', base() + '/questoes/' + id + '/anotacao', { texto: alvo.querySelector('[data-anot="' + id + '"]').value }).then(function () { msg.textContent = 'Guardada.'; })
              .catch(function (e) { msg.textContent = e.message; });
          };
        });
      }).catch(function (e) { falha(alvo, e); });
    }

    // ---- o acervo inteiro, para quem revisa o curso (não agenda nem conta como estudo) ----
    function todosOsCards(alvo) {
      alvo.innerHTML = '<p class="al-sub">Carregando o acervo…</p>';
      api('GET', base() + '/cards/todos').then(function (r) {
        alvo.innerHTML = '<div class="jr-caixa"><p class="al-rotulo">Revisão do acervo</p><h3>' + r.total + ' cards em ' + r.grupos.length + ' aulas</h3>' +
          '<p class="al-sub">Só você, que revisa o curso, vê esta lista. Ler aqui não agenda retomada nem conta como estudo.</p>' +
          '<div class="es-linha"><button class="al-bt peq fan" id="es-cd-volta">← Voltar à sessão de hoje</button></div></div>' +
          r.grupos.map(function (g) {
            return '<details class="es-acervo"><summary><b>' + esc(g.titulo) + '</b><span class="al-fino"> · ' + esc(g.competencia) + ' · ' + g.cards.length + ' card(s)</span></summary>' +
              g.cards.map(function (k) {
                return '<div class="es-acervo-card"><p class="al-fino">' + esc(k.codigo) + (k.status !== 'publicado' ? ' · <span class="marca-rasc">' + esc(k.status) + '</span>' : '') + '</p>' +
                  '<div class="es-card-frente">' + texto(k.frente) + '</div><div class="es-card-verso">' + texto(k.verso) +
                  (k.explicacao ? '<p class="al-sub">' + esc(k.explicacao) + '</p>' : '') + (k.fonte ? '<p class="al-fino">Fonte: ' + esc(k.fonte) + '</p>' : '') + '</div></div>';
              }).join('') + '</details>';
          }).join('');
        el('es-cd-volta').onclick = function () { cards(alvo); };
      }).catch(function (e) { falha(alvo, e); });
    }

    // ================= CARDS =================
    function cards(alvo) {
      api('GET', base() + '/cards').then(function (r) {
        var fila = r.vencidos.concat(r.novos), i = 0, lim = r.limites || {};
        // "Card 1 de 5" lido sem explicação parece acervo de cinco cards: a nota
        // diz que é a sessão de hoje, quantos existem e por que chegam aos poucos.
        var nota = !r.total ? '' : '<div class="es-nota-aba"><b>Por que só ' + (fila.length || 'alguns') + ' hoje?</b>' +
          '<p>Esta aba entrega a <b>sessão de hoje</b>, não o acervo inteiro. Este percurso tem <b>' + r.total + ' cards</b>, e todos chegam a você com o tempo.</p>' +
          '<ul><li><b>Cards novos:</b> no máximo ' + (lim.novos_dia || 5) + ' por dia, na ordem do programa.</li>' +
          '<li><b>Retomadas:</b> os cards que você já viu voltam na data marcada, até ' + (lim.revisoes_dia || 20) + ' revisões por dia.</li></ul>' +
          '<p>É a repetição espaçada: recordar um pouco por dia, e de novo quando está prestes a esquecer, fixa mais do que ver tudo de uma vez. ' +
          '“Card 1 de ' + (fila.length || lim.novos_dia || 5) + '” é o primeiro dos de hoje.</p></div>' +
          (r.revisor ? '<div class="es-nota-aba rev"><b>Você revisa este curso.</b><p>Para ler o acervo inteiro, com frente e verso abertos, sem fila e sem contar como estudo:</p>' +
            '<button class="al-bt peq" id="es-cd-todos">Ver todos os ' + r.total + ' cards</button></div>' : '');
        function ligarNota() { if (el('es-cd-todos')) el('es-cd-todos').onclick = function () { todosOsCards(alvo); }; }
        if (!fila.length) {
          alvo.innerHTML = '<div class="jr-caixa"><h3>Cards</h3><p class="al-sub">' + (r.total ? 'Nada para recordar hoje. Os próximos voltam na data marcada.' : 'Este percurso ainda não tem cards.') + '</p></div>' + nota;
          ligarNota();
          return;
        }
        function mostrar() {
          if (i >= fila.length) {
            alvo.innerHTML = '<div class="jr-caixa"><h3>Cards de hoje feitos</h3><p class="al-sub">' + fila.length + ' card(s) recordado(s).' + (r.adiados ? ' ' + r.adiados + ' ficaram para depois.' : '') + '</p>' +
              '<button class="al-bt" id="es-cd-hj">Ver a próxima tarefa</button></div>' + nota;
            el('es-cd-hj').onclick = function () { ir('hoje'); };
            ligarNota();
            return;
          }
          var k = fila[i];
          alvo.innerHTML = '<div class="jr-caixa es-card"><p class="al-fino">Card ' + (i + 1) + ' de ' + fila.length + ' de hoje' + (k.novo ? ' · novo' : ' · retomada') + '</p>' +
            '<div class="es-card-frente">' + texto(k.frente) + '</div><p class="al-sub">Responda de memória — em voz alta ou por escrito — antes de virar.</p>' +
            '<div class="es-linha"><button class="al-bt" id="es-cd-ver">Mostrar a resposta</button></div><div id="es-cd-verso"></div></div>' + nota;
          ligarNota();
          el('es-cd-ver').onclick = function () {
            api('POST', base() + '/cards/' + k.id + '/revelar').then(function (v) {
              el('es-cd-ver').disabled = true;
              el('es-cd-verso').innerHTML = '<div class="es-card-verso">' + texto(v.verso) + (v.explicacao ? '<p class="al-sub">' + esc(v.explicacao) + '</p>' : '') + (v.fonte ? '<p class="al-fino">Fonte: ' + esc(v.fonte) + '</p>' : '') + '</div>' +
                '<p class="al-sub">Como foi?</p><div class="es-linha">' +
                '<button class="al-bt fan" data-r="erro">Não lembrei</button><button class="al-bt fan" data-r="acerto_com_ajuda">Lembrei em parte</button><button class="al-bt ok" data-r="acerto">Lembrei</button></div>';
              cada(el('es-cd-verso'), '[data-r]', function (b) {
                b.onclick = function () {
                  api('POST', base() + '/cards/' + k.id + '/avaliar', { resultado: b.getAttribute('data-r') }).then(function () { i++; mostrar(); }).catch(function (e) { falha(el('es-cd-verso'), e); });
                };
              });
            }).catch(function (e) { falha(el('es-cd-verso'), e); });
          };
        }
        mostrar();
      }).catch(function (e) { falha(alvo, e); });
    }

    // ================= PROVA =================
    function regraTxt(regra) {
      var r = regra || {}, t = [];
      if (r.desconto && r.desconto.a_cada) t.push('cada ' + r.desconto.a_cada + ' erradas descontam 1 certa');
      if (r.em_branco_conta_erro) t.push('questão em branco conta como erro');
      if (r.aprovacao && r.aprovacao.min_pct != null) t.push('mínimo de ' + r.aprovacao.min_pct + '%');
      if (!t.length) t.push('1 ponto por acerto, sem desconto');
      return t.join('; ') + (r.fonte ? ' (fonte: ' + r.fonte + ')' : '');
    }
    function prova(alvo) {
      var p = E.painel;
      alvo.innerHTML = '<div class="jr-caixa"><h3>Montar a prova</h3>' +
        '<p class="al-sub">A prova é fixada no início: questões, ordem, regra e prazo. O relógio é o do servidor — recarregar a página ou trocar de aparelho não reinicia o tempo.</p>' +
        '<div class="es-form"><label class="es-campo">Tipo<select id="es-pv-modo"><option value="treino">Treino cronometrado</option><option value="simulado">Simulado (usa questões reservadas)</option></select></label>' +
        '<label class="es-campo">Questões<input id="es-pv-n" type="number" min="1" max="200" value="10"></label>' +
        '<label class="es-campo">Duração em minutos<input id="es-pv-dur" type="number" min="0" max="600" placeholder="automática"></label>' +
        '<label class="es-campo">Matéria (disciplina e ponto do edital)<select id="es-pv-comp"><option value="">Todas as matérias</option>' + opcoesComp('') + '</select></label></div>' +
        '<p class="al-fino"><b>Regra de nota deste percurso:</b> ' + esc(regraTxt(p.regra_pontuacao)) + '</p>' +
        '<div class="es-linha"><button class="al-bt" id="es-pv-ir">Começar</button></div><div id="es-pv-msg"></div></div>';
      function iniciar(aceitar) {
        var comp = el('es-pv-comp').value;
        api('POST', base() + '/tentativas', { modo: el('es-pv-modo').value, n: Number(el('es-pv-n').value) || 10, duracao_min: Number(el('es-pv-dur').value) || 0, competencias: comp ? [comp] : [], aceitar_menos: !!aceitar })
          .then(function (t) { executar(alvo, t); })
          .catch(function (e) {
            // faltou questão: o servidor diz quantas há; a escolha de reduzir é do aluno
            el('es-pv-msg').innerHTML = '<p class="es-aviso">' + esc(e.message) + '</p>' +
              (/eleg[ií]vel/.test(e.message) ? '<button class="al-bt fan" id="es-pv-menos">Fazer com as questões que existem</button>' : '');
            if (el('es-pv-menos')) el('es-pv-menos').onclick = function () { iniciar(true); };
          });
      }
      el('es-pv-ir').onclick = function () { iniciar(false); };
    }
    function executar(alvo, t) {
      if (t.estado !== 'em_andamento') return resultado(alvo, t);
      var desvio = Date.parse(t.agora) - Date.now(), prazo = Date.parse(t.prazo_em), resp = t.respostas || {}, marcadas = {}, i = 0, fila = null, salvando = false;
      alvo.innerHTML = '<div class="es-prova"><div class="es-pv-topo"><div><b id="es-pv-rel">--:--</b><span class="al-fino"> restantes · ' + (t.modo === 'simulado' ? 'simulado' : 'treino') + (t.retomada ? ' · retomada de onde você parou' : '') + '</span></div>' +
        '<span class="es-salvo" id="es-pv-salvo" role="status">' + (t.salvo_em ? 'Respostas salvas' : 'Nada respondido ainda') + '</span></div>' +
        '<div class="es-pv-nav" id="es-pv-nav"></div><div class="jr-caixa" id="es-pv-q"></div>' +
        '<div class="es-linha"><button class="al-bt fan" id="es-pv-ant">← Anterior</button><button class="al-bt fan" id="es-pv-prox">Próxima →</button><button class="al-bt fan" id="es-pv-marc">Marcar para voltar</button>' +
        '<button class="al-bt ok" id="es-pv-env">Enviar a prova</button></div><div id="es-pv-conf"></div></div>';
      function salvar() {
        if (salvando || !fila) return;
        var envio = fila; fila = null; salvando = true;
        el('es-pv-salvo').textContent = 'Salvando…';
        api('PUT', base() + '/tentativas/' + t.id + '/respostas', { respostas: envio }).then(function (r) {
          salvando = false;
          if (!r.salvo) { pararRelogio(); return executar(alvo, r); }
          if (el('es-pv-salvo')) { el('es-pv-salvo').textContent = 'Salvo · ' + r.respondidas + ' de ' + r.total + ' respondidas'; el('es-pv-salvo').className = 'es-salvo'; }
          if (fila) salvar();
        }).catch(function () {
          // o aluno precisa saber que NÃO salvou: a resposta volta para a fila e tenta de novo
          salvando = false;
          Object.keys(envio).forEach(function (k) { if (!fila || !(k in fila)) { fila = fila || {}; fila[k] = envio[k]; } });
          if (el('es-pv-salvo')) { el('es-pv-salvo').textContent = 'Não salvou — sem conexão. Tentando de novo…'; el('es-pv-salvo').className = 'es-salvo ruim'; }
          setTimeout(salvar, 4000);
        });
      }
      function nav() {
        el('es-pv-nav').innerHTML = t.questoes.map(function (q, k) {
          return '<button data-k="' + k + '" class="' + (k === i ? 'on ' : '') + (resp[q.id] ? 'feita ' : '') + (marcadas[q.id] ? 'marc' : '') + '" aria-label="Questão ' + (k + 1) + (resp[q.id] ? ', respondida' : ', sem resposta') + '">' + (k + 1) + '</button>';
        }).join('');
        cada(el('es-pv-nav'), 'button', function (b) { b.onclick = function () { i = Number(b.getAttribute('data-k')); pintar(); }; });
      }
      function pintar() {
        var q = t.questoes[i];
        el('es-pv-q').innerHTML = '<p class="al-fino">Questão ' + (i + 1) + ' de ' + t.questoes.length + '</p>' + procedencia(q) +
          (q.apoio ? '<div class="es-apoio">' + texto(q.apoio) + '</div>' : '') + '<div class="es-enun">' + texto(q.enunciado) + '</div>' + alternativas(q, 'es-pv-' + i, resp[q.id]) +
          (resp[q.id] ? '<button class="es-link" id="es-pv-limpa">Limpar a resposta</button>' : '');
        cada(el('es-pv-q'), 'input[type=radio]', function (r) {
          r.onchange = function () { resp[q.id] = r.value; fila = fila || {}; fila[q.id] = r.value; salvar(); nav(); pintar(); };
        });
        if (el('es-pv-limpa')) el('es-pv-limpa').onclick = function () { delete resp[q.id]; fila = fila || {}; fila[q.id] = ''; salvar(); nav(); pintar(); };
        el('es-pv-ant').disabled = i === 0; el('es-pv-prox').disabled = i === t.questoes.length - 1;
        el('es-pv-marc').textContent = marcadas[q.id] ? 'Desmarcar' : 'Marcar para voltar';
        nav();
      }
      function finalizar() {
        pararRelogio();
        var espera = function () { if (salvando || fila) return setTimeout(espera, 300); api('POST', base() + '/tentativas/' + t.id + '/enviar').then(function (r) { resultado(alvo, r); }).catch(function (e) { falha(el('es-pv-conf'), e); }); };
        if (fila) salvar();
        espera();
      }
      el('es-pv-ant').onclick = function () { i--; pintar(); };
      el('es-pv-prox').onclick = function () { i++; pintar(); };
      el('es-pv-marc').onclick = function () { var id = t.questoes[i].id; marcadas[id] = !marcadas[id]; pintar(); };
      el('es-pv-env').onclick = function () {
        var faltam = t.questoes.filter(function (q) { return !resp[q.id]; }).length;
        el('es-pv-conf').innerHTML = '<div class="es-aviso">' + (faltam ? faltam + ' questão(ões) sem resposta. ' : 'Todas respondidas. ') + 'Depois de enviar não dá para alterar.' +
          '<div class="es-linha"><button class="al-bt ok" id="es-pv-sim">Enviar agora</button><button class="al-bt fan" id="es-pv-nao">Continuar respondendo</button></div></div>';
        el('es-pv-sim').onclick = finalizar;
        el('es-pv-nao').onclick = function () { el('es-pv-conf').innerHTML = ''; };
      };
      pararRelogio();
      function tique() {
        var rel = el('es-pv-rel');
        if (!rel) return pararRelogio(); // saiu da tela: o prazo continua correndo no servidor
        var falta = Math.max(0, prazo - (Date.now() + desvio)), s = Math.floor(falta / 1000);
        rel.textContent = (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + ('0' + Math.floor(s % 3600 / 60)).slice(-2) + ':' + ('0' + s % 60).slice(-2);
        rel.className = s < 300 ? 'fim' : '';
        if (!falta) {
          pararRelogio();
          // quem fecha a prova é o servidor: valem as respostas que chegaram a ele
          api('GET', base() + '/tentativas/' + t.id).then(function (r) { executar(alvo, r); }).catch(function () {});
        }
      }
      E.relogio = setInterval(tique, 500);
      document.body.classList.add('es-em-prova');
      tique(); pintar();
    }
    function resultado(alvo, t) {
      pararRelogio();
      var r = t.resultado, pos = {}, k = 0;
      var linha = function (a, b) { return '<tr><td>' + a + '</td><td class="n">' + b + '</td></tr>'; };
      alvo.innerHTML = '<div class="jr-caixa"><h3>Resultado' + (r.expirada ? ' — o prazo terminou' : '') + '</h3>' +
        (r.expirada ? '<p class="es-aviso">O tempo acabou antes do envio. Valeram as respostas que já estavam salvas no servidor.</p>' : '') +
        '<div class="es-nota"><b>' + r.nota_liquida + '</b><span> de ' + r.maximo + ' · ' + r.pct_liquido + '%</span></div>' +
        '<table class="es-tab">' + linha('Certas', r.certas) + linha('Erradas', r.erradas) + linha('Em branco', r.em_branco) + (r.abstencoes ? linha('Marcadas como não respondidas', r.abstencoes) : '') +
        (r.anuladas ? linha('Anuladas', r.anuladas) : '') + linha('Pontos brutos', r.nota_bruta) + (r.descontados ? linha('Desconto: ' + r.erros_contados + ' erro(s) pela regra' + (r.erros_contados > r.erradas ? ' (erradas + em branco)' : ''), '− ' + r.descontados) : '') + linha('<b>Nota líquida</b>', '<b>' + r.nota_liquida + '</b>') + '</table>' +
        '<p class="al-fino"><b>Regra aplicada:</b> ' + esc(regraTxt(r.regra)) + '</p>' +
        (r.aprovado === null ? '<p class="al-fino">Este percurso não tem nota de corte cadastrada — por isso não há "aprovado" ou "reprovado" aqui.</p>' : '<p><b>' + (r.aprovado ? 'Atingiu o critério cadastrado.' : 'Não atingiu o critério cadastrado.') + '</b></p>') +
        '<p class="al-fino">Um resultado em poucas questões mostra como você foi nestas questões, não o domínio do programa inteiro.</p>' +
        '<div class="es-linha"><button class="al-bt" id="es-rs-hj">Ver a próxima tarefa</button><button class="al-bt fan" id="es-rs-nova">Outra prova</button></div></div>' +
        '<div class="jr-caixa"><h3>Correção comentada</h3>' + r.itens.map(function (it) {
          var rot = { certa: ['Certa', 'ok'], errada: ['Errada', 'nao'], em_branco: ['Em branco', 'neutro'], abstencao: ['Não respondida (marcada)', 'neutro'], anulada: ['Anulada', 'neutro'] }[it.situacao];
          k++; pos[it.id] = k;
          return '<details class="es-rev ' + rot[1] + '"><summary>Questão ' + k + ' — ' + rot[0] + '</summary>' +
            it.alternativas.map(function (a) {
              return '<p class="es-rev-alt' + (a.correta ? ' certa' : (it.resposta === a.id ? ' errada' : '')) + '"><b>' + a.id.toUpperCase() + (a.correta ? ' · gabarito' : '') + (it.resposta === a.id ? ' · sua resposta' : '') + '</b> ' + esc(a.explicacao || '') + '</p>';
            }).join('') + (it.comentario ? '<p>' + esc(it.comentario) + '</p>' : '') + '</details>';
        }).join('') + '</div>';
      el('es-rs-hj').onclick = function () { ir('hoje'); };
      el('es-rs-nova').onclick = function () { ir('prova'); };
      carregar();
      window.scrollTo(0, 0);
    }

    // ================= PLANO =================
    function plano(alvo) {
      api('GET', base() + '/plano').then(function (r) { pintarPlano(alvo, r); }).catch(function (e) { falha(alvo, e); });
    }
    function pintarPlano(alvo, r) {
      var ent = r.entrada || {}, disp = ent.disponibilidade || [0, 0, 0, 0, 0, 0, 0], temData = !!E.painel.escopo.data_alvo;
      var h = '<div class="jr-caixa"><h3>Quanto tempo você tem</h3><p class="al-sub">Informe os minutos de estudo de cada dia da semana. O plano usa só esse tempo — não inventa hora.</p>' +
        '<div class="es-semana">' + DIAS.map(function (d, k) {
          return '<label class="es-campo">' + d[1] + '<input type="number" min="0" max="960" step="5" data-dia="' + d[0] + '" value="' + (disp[k] || 0) + '" aria-label="Minutos de estudo de ' + d[1] + '"></label>';
        }).join('') + '</div>' +
        '<div class="es-form"><label class="es-campo">Margem para imprevistos (%)<input id="es-pl-mg" type="number" min="0" max="50" value="' + (ent.margem_pct == null ? 15 : ent.margem_pct) + '"></label>' +
        (temData ? '<p class="al-fino">Data da prova: ' + dataBR(E.painel.escopo.data_alvo) + ' (do edital).</p>'
          : '<label class="es-campo">Quero terminar até (opcional)<input id="es-pl-dt" type="date" value="' + esc(ent.data_alvo || '') + '"></label>') + '</div>' +
        '<div class="es-linha"><button class="al-bt" id="es-pl-ok">' + (r.plano ? 'Refazer o plano' : 'Montar o plano') + '</button><span id="es-pl-msg"></span></div></div>';
      if (r.plano) {
        var p = r.plano, v = p.viabilidade, sit = { cabe: ['Cabe no seu tempo', 'ok'], apertado: ['Apertado', 'ambar'], nao_cabe: ['Não cabe inteiro', 'nao'], sem_prazo: ['Sem prazo', 'ok'] }[v.situacao];
        h += '<div class="jr-caixa"><h3>Viabilidade <span class="es-selo ' + (sit[1] === 'ok' ? 'verde' : sit[1] === 'nao' ? 'verm' : 'ambar') + '">' + sit[0] + '</span></h3>' +
          (v.situacao === 'sem_prazo'
            ? '<p>No ritmo informado, o programa com estimativa (' + horas(v.esforco_min[0]) + ' a ' + horas(v.esforco_min[1]) + ') termina por volta de <b>' + (dataBR(p.conclusao_estimada) || '—') + '</b>.</p>'
            : '<table class="es-tab"><tr><td>Tempo que você declarou até a prova</td><td class="n">' + horas(v.capacidade_bruta_min) + '</td></tr>' +
              '<tr><td>Reservado para imprevistos</td><td class="n">' + horas(v.margem_min) + '</td></tr>' +
              '<tr><td>Esforço estimado do programa</td><td class="n">' + horas(v.esforco_min[0]) + ' a ' + horas(v.esforco_min[1]) + '</td></tr>' +
              (v.deficit_min[1] ? '<tr><td><b>Faltam</b></td><td class="n"><b>' + (v.deficit_min[0] ? horas(v.deficit_min[0]) + ' a ' : 'até ') + horas(v.deficit_min[1]) + '</b></td></tr>' : '') + '</table>') +
          (v.situacao === 'nao_cabe' || v.situacao === 'apertado' ? '<p class="es-aviso">O programa não cabe inteiro no tempo informado. Nada foi tirado em silêncio: os itens abaixo ficam de fora deste plano. Você pode aumentar a disponibilidade ou aceitar a prioridade.</p>' : '') +
          (p.pendentes.length ? '<p><b>Ficam de fora (' + p.pendentes.length + '):</b> ' + p.pendentes.map(function (x) { return esc(x.codigo) + ' (' + horas(x.faltam_min) + ')'; }).join(' · ') + '</p>' : '') +
          ((v.sem_estimativa || []).length ? '<p class="al-fino">Sem estimativa de tempo, por isso fora da conta: ' + v.sem_estimativa.map(esc).join(', ') + '.</p>' : '') +
          (p.prioridade ? '<p class="es-nivel-rec"><b>Prioridade pelo padrão da banca.</b> ' + esc(p.prioridade.motivo) + '</p>' : '') +
          (p.nivel_recomendado ? '<p class="es-nivel-rec"><b>Quanto ler de cada aula: ' + p.nivel_recomendado.nivel + ' %.</b> ' + esc(p.nivel_recomendado.motivo) + ' <span class="al-fino">Na aula, o seletor "Quanto ler" troca o nível quando ele existir.</span></p>' : '') + '</div>';
        h += '<div class="jr-caixa"><h3>Próximas sessões</h3>' + (p.proximas.length ? '<div class="es-sessoes">' + p.proximas.map(function (s) {
          return '<div class="es-sessao' + (s.vespera ? ' vespera' : '') + '"><b>' + dataBR(s.data).slice(0, 5) + '</b><span>' + horas(s.minutos) + '</span><p>' +
            (s.vespera ? '<b>Véspera · ' + esc(FOCO[s.vespera] || s.vespera) + '</b> — fichas, slides e mapa das aulas já estudadas; nada de matéria nova.' :
            (s.fase === 'revisao_geral' ? '<b>Revisão geral</b><br>' : '') + (s.estudo.length ? s.estudo.map(function (e) { return '<b class="es-cod">' + esc(e.codigo) + '</b> ' + esc(nomeItem(e.codigo)) + ' · ' + horas(e.minutos); }).join('<br>') : 'só retomadas') + (s.revisao_min ? '<br><i>retomadas · ' + horas(s.revisao_min) + '</i>' : '')) + '</p></div>';
        }).join('') + '</div>' : '<p class="al-sub">Nenhuma sessão nos próximos dias com a disponibilidade informada.</p>') +
          '<p class="al-fino">' + p.sessoes_total + ' sessão(ões) no plano inteiro · versão ' + r.versao + '</p></div>';
        if ((r.historico || []).length > 1) h += '<details class="jr-caixa es-fontes"><summary>O que mudou no plano</summary><ul>' + r.historico.slice().reverse().map(function (x) {
          return '<li>' + dataBR(x.em.slice(0, 10)) + ' — ' + esc(x.motivo) + ' · ' + esc(x.situacao) + (x.pendentes ? ' · ' + x.pendentes + ' item(ns) de fora' : '') + '</li>';
        }).join('') + '</ul></details>';
      }
      alvo.innerHTML = h;
      el('es-pl-ok').onclick = function () {
        var d = {};
        cada(alvo, '[data-dia]', function (i) { d[i.getAttribute('data-dia')] = Number(i.value) || 0; });
        api('PUT', base() + '/plano', { disponibilidade: d, margem_pct: Number(el('es-pl-mg').value), data_alvo: el('es-pl-dt') ? el('es-pl-dt').value : '', motivo: r.plano ? 'disponibilidade alterada pelo aluno' : '' })
          .then(function (x) { pintarPlano(alvo, x); })
          .catch(function (e) { el('es-pl-msg').innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
      };
    }

    return { cartao: cartao, abrir: abrir };
  };
})();
