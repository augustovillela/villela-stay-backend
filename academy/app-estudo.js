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
      var itens = {}, titulo = {}, mm = {}, comItem = {};
      (p.itens || []).forEach(function (i) { itens[i.codigo] = i; (i.competencias || []).forEach(function (k) { comItem[k.codigo] = true; }); });
      (p.unidades || []).forEach(function (u) { (u.competencias || []).forEach(function (k) { if (!titulo[k]) titulo[k] = u.titulo; }); });
      // competência de DISCIPLINA (uma por disciplina: nasce da prova importada ou do edital lido em PDF): o nome que o
      // aluno reconhece é o da disciplina — e não o do primeiro item que ela cobre. Vem antes dos itens, de propósito.
      (p.competencias || []).forEach(function (c) {
        var imp = RE_DISCIPLINA.exec(c.resultado || '');
        if (imp) mm[c.codigo] = { item: '', cod: '', disciplina: comItem[c.codigo] ? 'Disciplinas do edital' : 'Provas importadas', grupo: imp[1], titulo: imp[1] };
      });
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
        if (mm[c.codigo]) return;
        mm[c.codigo] = { item: '', cod: '', disciplina: 'Método de estudo', titulo: titulo[c.codigo] || c.resultado };
      });
      E._mm = mm; E._mmDe = p;
      return mm;
    }
    var RE_DISCIPLINA = /^Diante de questões de prova de (.+), o candidato identifica a resposta correta sem apoio.$/;
    // percurso sem questão nenhuma: o que dizer (e, no percurso particular, o que oferecer)
    function semQuestoes() {
      var part = !!(E.painel && E.painel.escopo.particular);
      return { particular: part, txt: part ? 'Este percurso ainda não tem questões — importe uma prova em PDF para praticar e fazer simulado.' : 'Este percurso ainda não tem questões de correção automática.',
        botao: function (idBt) { return part ? '<div class="es-linha"><button class="al-bt" id="' + idBt + '">Importar prova em PDF</button></div>' : ''; },
        ligar: function (idBt) { if (el(idBt)) el(idBt).onclick = function () { ir('escrita', 'importar'); }; } };
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
    // `E.aoSair`: a tela que abriu microfone ou consulta periódica (Escrita e oral) deixa aqui como se desliga
    function pararRelogio() {
      if (E.relogio) { clearInterval(E.relogio); E.relogio = null; }
      if (E.aoSair) { var sair = E.aoSair; E.aoSair = null; try { sair(); } catch (x) { /* a tela já saiu */ } }
      document.body.classList.remove('es-em-prova');
    }

    // ---------------- cartão no cabeçalho do estúdio ----------------
    function cartao(alvo, pid, r, abrirFn) {
      if (!alvo) return;
      if (!r || !r.acesso || !(r.escopos || []).length) { alvo.innerHTML = ''; return; }
      alvo.innerHTML = '<div class="es-cartao"><div class="es-cartao-txt"><p class="al-rotulo">Estude</p>' +
        '<b>O conteúdo de estudo está aqui</b><span class="al-fino">Aulas, questões, cards, simulado com correção explicada e o plano que cabe no seu tempo.</span></div>' +
        '<div class="es-cartao-bts">' + r.escopos.map(function (e) {
          // percurso particular (questões que o próprio aluno importou): só ele o recebe nesta lista
          if (e.particular) return '<button class="al-bt fan" data-es="' + esc(e.slug) + '">🗂️ Meu percurso — ' + esc(e.titulo) + '</button>';
          return '<button class="al-bt" data-es="' + esc(e.slug) + '">' + (e.tipo === 'edital' ? '📜 ' : '📘 ') + 'Abrir o conteúdo — ' + esc(e.titulo) +
            (e.status === 'rascunho' ? ' <span class="marca-rasc">rascunho</span>' : '') + '</button>';
        }).join('') + '</div></div>';
      cada(alvo, '[data-es]', function (b) { b.onclick = function () { abrirFn(b.getAttribute('data-es')); }; });
    }

    // ---------------- casca ----------------
    function rota(partes, substituir) { if (window.AcademyRota) window.AcademyRota.gravar(partes, substituir); }
    // `inicio` = onde abrir (veio do endereço): { aba, arg, extra } — e `substituir` quando a abertura
    // é automática e não deve virar um passo do botão Voltar.
    // `barra` = { html, ligar }: o que o curso oferece além do percurso (audiobook, material, desafio…), montado por
    // quem abre. `html` pode ser função: a barra é refeita a cada abertura, com o que o curso tem NAQUELE momento.
    // `inicio.y` = a rolagem em que o aluno estava quando saiu para uma tela do curso — "voltar para onde estava".
    function abrir(pid, titulo, slug, voltar, inicio, rotuloVoltar, barra) {
      pararRelogio();
      inicio = inicio || {};
      E.pid = pid; E.titulo = titulo; E.slug = slug; E.voltar = voltar; E.aba = 'hoje';
      E.rotuloVoltar = rotuloVoltar; E.barra = barra; // quem troca de percurso leva junto o "voltar" e a barra do curso
      LUGAR = LUGARES[chavePercurso(slug)] || (LUGARES[chavePercurso(slug)] = {});
      setView('<div class="al es"><a href="#" class="al-volta" id="es-volta">← ' + esc(rotuloVoltar || 'Voltar ao curso') + '</a>' +
        '<div class="es-cab"><p class="al-rotulo">Estude · ' + esc(titulo) + '</p><h2 id="es-titulo">Carregando…</h2><p class="al-sub" id="es-sub"></p><div class="es-troca" id="es-troca"></div>' +
        '<div class="es-curso-barra">' + (barra && barra.html ? (typeof barra.html === 'function' ? barra.html() : barra.html) : '') + '<span class="es-barra-es" id="es-barra-es"></span></div></div>' +
        '<div class="est-abas es-abas" id="es-abas"></div><div class="es-corpo" id="es-corpo"><p class="al-sub">Carregando…</p></div></div>');
      el('es-volta').onclick = function (e) { e.preventDefault(); pararRelogio(); voltar(); };
      if (barra && barra.ligar) barra.ligar();
      window.scrollTo(0, 0);
      trocaDePercurso();
      carregar(function () {
        abas();
        botoesDaBarra();
        if (inicio.aba === 'aulas' && inicio.arg === 'ler' && inicio.extra) {
          E.aba = 'aulas';
          cada(el('es-abas'), 'button', function (b) { b.classList.toggle('on', b.getAttribute('data-a') === 'aulas'); });
          lerDisciplina(el('es-corpo'), inicio.extra);
        } else {
          ir(inicio.aba || 'hoje', inicio.arg || undefined, !!inicio.substituir);
          if (inicio.y > 0) reporRolagem(inicio.aba || 'hoje', inicio.y); // depois do `ir`, que leva ao topo
        }
      });
    }
    // TROCA DE PERCURSO: quem tem o percurso do curso e um particular (ou vários) passa de um para o outro AQUI, sem
    // voltar à página do curso. Cada percurso lembra a aba em que estava, e o "voltar" do topo continua o mesmo.
    function chavePercurso(slug) { return E.pid + '/' + slug; }
    function abrirPercurso(slug, inicio) { abrir(E.pid, E.titulo, slug, E.voltar, inicio || ONDE[chavePercurso(slug)] || {}, E.rotuloVoltar, E.barra); }
    function trocaDePercurso() {
      var pid = E.pid, slug = E.slug;
      api('GET', '/aluno/cursos/' + pid + '/estudo').then(function (r) {
        var alvo = el('es-troca'), lista = (r && r.escopos) || [];
        if (!alvo || E.pid !== pid || E.slug !== slug) return;
        E.escopos = lista;
        if (lista.length < 2) { alvo.innerHTML = ''; return; }
        alvo.innerHTML = '<span class="al-fino">Seus percursos neste curso:</span>' + lista.map(function (e) {
          return '<button data-troca="' + esc(e.slug) + '"' + (e.slug === slug ? ' class="on" aria-current="true"' : '') + '>' + (e.particular ? '🗂️ Meu percurso — ' : e.tipo === 'edital' ? '📜 ' : '📘 ') + esc(e.titulo) + '</button>';
        }).join('');
        cada(alvo, '[data-troca]', function (b) { b.onclick = function () { var s2 = b.getAttribute('data-troca'); if (s2 !== E.slug) abrirPercurso(s2); }; });
      }).catch(function () { /* sem a lista, o percurso segue igual */ });
    }
    function carregar(depois) {
      api('GET', base() + '/painel').then(function (p) {
        E.painel = p;
        if (el('es-titulo')) {
          el('es-titulo').innerHTML = esc(p.escopo.titulo) + (p.escopo.particular ? ' <span class="marca-rasc">percurso particular — só você vê</span>' : p.escopo.status === 'rascunho' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : '');
          el('es-sub').textContent = [p.escopo.nivel, p.escopo.data_alvo ? 'prova em ' + dataBR(p.escopo.data_alvo) : 'sem prova marcada', p.escopo.particular && !p.escopo.versao ? 'questões importadas por você' : 'programa versão ' + p.escopo.versao + (p.escopo.particular ? ' (do edital que você enviou)' : '')].filter(Boolean).join(' · ');
        }
        if (depois) depois();
      }).catch(function (e) { falha(el('es-corpo'), e); });
    }
    var ABAS = [['hoje', 'Hoje'], ['aulas', 'Aulas'], ['mapas', 'Mapas'], ['cobrado', 'Mais cobrado'], ['programa', 'Programa'], ['praticar', 'Praticar'], ['escrita', 'Escrita e oral'], ['erros', 'Erros'], ['cards', 'Cards'], ['prova', 'Prova'], ['plano', 'Plano']];
    function abas() {
      el('es-abas').innerHTML = ABAS.map(function (x) { return '<button data-a="' + x[0] + '">' + x[1] + '</button>'; }).join('');
      cada(el('es-abas'), 'button', function (b) { b.onclick = function () { ir(b.getAttribute('data-a')); }; });
    }
    // O LUGAR de cada aba: quais disciplinas estavam abertas e onde a página estava rolada. Sem isso, voltar da
    // aula para a lista devolve ao topo, com a primeira disciplina aberta — "volta ao princípio" (Augusto, 10/10/2026).
    var LUGAR = {}, LUGARES = {}, ONDE = {}, LISTAS = { aulas: 1, mapas: 1, programa: 1, cobrado: 1, escrita: 1 }, PORTAS = { jornada: 1, ferramentas: 1 };
    function rolagem() { return document.scrollingElement || document.documentElement; }
    function guardarLugar() {
      var c = el('es-corpo');
      if (!c || !LISTAS[E.aba] || E.abaArg) return;
      var abertos = [];
      cada(c, 'details', function (d, i) { if (d.open) abertos.push(i); });
      LUGAR[E.aba] = { abertos: abertos, y: rolagem().scrollTop };
    }
    function reporLugar(aba, alvo) {
      var L = LUGAR[aba], n = 0;
      if (!L) return;
      (function tentar() {
        if (E.aba !== aba) return; // o aluno já foi para outro lugar
        var ds = alvo.querySelectorAll('details');
        if (!ds.length && alvo.querySelector('.al-sub') && n++ < 40) return setTimeout(tentar, 100); // ainda carregando
        Array.prototype.forEach.call(ds, function (d, i) { var abrir = L.abertos.indexOf(i) >= 0; if (d.open !== abrir) d.open = abrir; });
        rolagem().scrollTop = L.y;
        setTimeout(function () { if (E.aba === aba) rolagem().scrollTop = L.y; }, 300); // depois de a disciplina reabrir
      })();
    }
    // a rolagem de volta numa tela que ainda está carregando: espera a página ter altura para chegar lá
    function reporRolagem(aba, y) {
      var n = 0;
      (function tentar() {
        if (E.aba !== aba) return;
        var r = rolagem();
        if (r.scrollHeight - window.innerHeight >= y - 4 || n++ > 40) { r.scrollTop = y; return; }
        setTimeout(tentar, 120);
      })();
    }
    function ir(aba, arg, substituir) {
      pararRelogio();
      guardarLugar();
      if (aba === 'unidade' && E.aba && E.aba !== 'unidade') E.veioDe = E.aba;
      if (aba === 'caderno' && E.aba !== 'caderno') E.antesDoCaderno = ONDE[chavePercurso(E.slug)] || { aba: E.aba }; // o caderno devolve a quem o abriu
      // Minha jornada e Ferramentas são PORTAS (não são abas): guardam de onde o aluno veio — aba, aula e rolagem — para devolvê-lo lá
      if (PORTAS[aba] && !PORTAS[E.aba]) { var veioDe = ONDE[chavePercurso(E.slug)] || {}; E.antesDaPorta = { aba: E.aba, arg: veioDe.aba === E.aba ? veioDe.arg : undefined, y: rolagem().scrollTop }; }
      E.aba = aba; E.abaArg = typeof arg === 'string' && arg ? arg : (arg && typeof arg === 'object' ? 'obj' : '');
      ONDE[chavePercurso(E.slug)] = { aba: aba, arg: typeof arg === 'string' && arg ? arg : undefined }; // para voltar a este percurso onde estava
      rota(['curso', E.pid, 'estude', E.slug, aba].concat(typeof arg === 'string' && arg ? [arg] : []), substituir);
      cada(el('es-abas'), 'button', function (b) { b.classList.toggle('on', b.getAttribute('data-a') === aba); });
      var alvo = el('es-corpo');
      alvo.innerHTML = '<p class="al-sub">Carregando…</p>';
      if (!document.querySelector('.es-kd')) document.documentElement.style.overflow = ''; // o leitor de tela cheia saiu de cena
      ({ hoje: hoje, aulas: aulas, mapas: mapas, cobrado: maisCobrado, programa: programa, praticar: praticar, escrita: escrita, erros: erros, cards: cards, prova: prova, plano: plano, unidade: unidade, caderno: caderno, jornada: jornada, ferramentas: ferramentas }[aba] || hoje)(alvo, arg);
      if (LISTAS[aba] && !E.abaArg) reporLugar(aba, alvo); else rolagem().scrollTop = 0;
    }
    // "Voltar" de dentro da aula: para a tela de onde o aluno veio (lista de aulas, programa, mapas…), no ponto em que estava
    function voltarDaAula() {
      var veio = E.veioDe;
      if (veio && veio !== 'unidade') ir(veio); else ir('aulas');
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
      aguardar_retencao: ['Fazer um simulado', function () { ir('prova'); }],
      // percurso só com o programa (edital lido, ainda sem prova importada): a tarefa é trazer questões
      sem_questoes: ['Importar uma prova em PDF', function () { ir('escrita', 'importar'); }]
    };
    function eixo(titulo, num, den, legenda, cor) {
      var pct = den ? Math.round(num * 100 / den) : 0;
      return '<div class="es-eixo"><small>' + titulo + '</small><b>' + num + '<i> de ' + den + '</i></b>' +
        '<div class="es-barra ' + cor + '"><i style="width:' + pct + '%"></i></div><span class="al-fino">' + legenda + '</span></div>';
    }
    function hoje(alvo) {
      carregar(function () {
        var p = E.painel, c = p.cobertura, px = p.proxima, ac = ACAO[px.tipo], d = p.desempenho;
        if (px.tipo === 'sem_questoes' && !p.escopo.particular) ac = null; // no percurso do curso, quem traz o conteúdo é o curso
        var jaFez = !!(p.jornada && p.jornada.avaliacao && p.jornada.avaliacao.diagnostico.feito);
        // enquanto o diagnóstico não foi feito, a porta dele vem ANTES da próxima tarefa; depois, vira a ordem sugerida, logo abaixo
        var h = retaFinal(p) + (jaFez ? '' : cartaoDiagnostico(p, true)) + '<div class="es-proxima"><p class="al-rotulo">Sua próxima tarefa</p>' +
          '<h3>' + (px.competencia ? esc(nomeComp(px.competencia)) : (px.tipo === 'concluido' ? 'Tudo demonstrado até aqui' : px.tipo === 'sem_questoes' ? 'Faltam questões para praticar' : px.tipo === 'sem_competencias' ? 'Percurso ainda vazio' : 'Recordar')) + '</h3>' +
          '<p class="es-motivo"><b>Por quê:</b> ' + esc(px.motivo) + '</p>' +
          (ac ? '<button class="al-bt" id="es-agir">' + ac[0] + '</button>' : '') +
          ' <button class="al-bt fan" id="es-outra">Escolher outra coisa</button></div>' + (jaFez ? cartaoDiagnostico(p, true) : '') + cartaoJornada(p);
        // percurso particular ainda sem programa: dizer o que falta, e por onde ele chega
        if (p.escopo.particular && !p.escopo.versao) h += '<div class="jr-caixa"><h3>Este percurso ainda não tem programa</h3><p class="al-sub">Envie o edital do concurso em PDF: o sistema lê o conteúdo programático, e o percurso ganha o programa por disciplina e o plano com a data da prova.</p>' +
          '<button class="al-bt fan" id="es-hj-edital">Ler edital em PDF</button></div>';
        h += '<div class="jr-caixa"><h3>Onde você está no programa</h3>' +
          '<p class="al-sub">São quatro medidas diferentes, cada uma com a sua contagem. Ter a aula pronta não é ter estudado, e ter estudado não é ter demonstrado.</p>' +
          caixaEixos(p) + (c.pendentes_de_leitura ? '<p class="es-aviso">' + c.pendentes_de_leitura + ' item(ns) do programa com leitura pendente de conferência — não contam como cobertos.</p>' : '') + '</div>';
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
        ligarAvaliacao(alvo);
        if (el('es-hj-jr')) el('es-hj-jr').onclick = function () { ir('jornada'); };
        cada(alvo, '[data-ir-jr]', function (b) { b.onclick = function () { ir('jornada', 'avaliacao'); }; });
        if (el('es-hj-edital')) el('es-hj-edital').onclick = function () { ir('escrita', 'edital'); };
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
      if (!p.unidades.length) {
        // percurso sem aula (o particular nunca tem): dizer por quê e o que há no lugar — nunca "0 aulas em 0 disciplinas"
        alvo.innerHTML = '<div class="jr-caixa"><h3>Aulas</h3><p class="al-sub">' + (p.escopo.particular
          ? 'Percurso particular não tem aulas: ele reúne o programa do edital que você leu e as questões das provas que você importou. As aulas ficam no percurso do curso — troque de percurso no alto da página.'
          : 'Este percurso ainda não tem aulas publicadas.') + '</p>' +
          '<div class="es-linha"><button class="al-bt fan" id="es-au-prog">Ver o programa</button>' + (p.escopo.particular ? '<button class="al-bt fan" id="es-au-imp">Importar prova em PDF</button>' : '') + '</div></div>';
        el('es-au-prog').onclick = function () { ir('programa'); };
        if (el('es-au-imp')) el('es-au-imp').onclick = function () { ir('escrita', 'importar'); };
        return;
      }
      p.unidades.forEach(function (u) {
        var m = mm[(u.competencias || [])[0]] || { disciplina: 'Método de estudo', item: '', cod: '' };
        var cod = m.cod || '_metodo'; // o mesmo agrupamento do servidor: sem disciplina-mãe no programa, a aula fica no grupo geral
        var g = por[cod];
        if (!g) { g = por[cod] = { cod: cod, nome: m.disciplina, aulas: [] }; grupos.push(g); }
        g.aulas.push({ u: u, item: m.item });
      });
      var comVideo = p.unidades.filter(function (u) { return u.video; }).length;
      alvo.innerHTML = '<div class="jr-caixa"><h3>Aulas</h3><p class="al-sub">' + p.unidades.length + ' aulas em ' + grupos.length + ' disciplinas, na ordem do edital' + (comVideo ? ' · <b>' + comVideo + ' com videoaula</b> (🎬)' : '') + '. ' +
        '<b>Abrir a aula</b> leva a tudo o que a aula tem, numa página só: a videoaula, a aula interativa (o fluxo passo a passo, um caso para você decidir e os erros que a banca planta), o mapa mental, o texto com os resumos de 50, 25 e 10 % e a prática. <b>Ler a disciplina</b> junta a teoria em texto corrido, como num leitor de livros: uma página por vez, do tamanho da tela, com tamanho de letra, fundo claro, sépia ou escuro, busca, marca-texto e PDF. A leitura volta na página em que você parou.</p>' +
        '<div class="es-linha"><button class="al-bt peq fan" id="es-au-mt">🖍️ Minhas marcações</button></div></div>' +
        grupos.map(function (g, n) {
          return '<details class="es-acervo"' + (n === 0 ? ' open' : '') + '><summary><b>' + esc(g.nome) + '</b><span class="al-fino"> · ' + g.aulas.length + ' aula(s)</span></summary>' +
            '<div class="es-linha"><button class="al-bt peq" data-ler="' + esc(g.cod) + '">📄 Ler a disciplina (texto corrido / PDF)</button></div>' +
            g.aulas.map(function (a) {
              return '<div class="es-aula-linha"><span>' + (a.u.video ? '<span class="es-tem-video" title="Esta aula tem videoaula">🎬</span> ' : '') + (a.item ? '<b>' + esc(a.item) + '</b> ' : '') + esc(a.u.titulo) + (a.u.tempo_min ? '<span class="al-fino"> · ' + horas(a.u.tempo_min) + '</span>' : '') +
                (a.u.estudada ? ' <span class="es-selo verde" title="Você já respondeu questão ou card desta aula">✓ estudada</span>' : '') +
                (a.u.status !== 'publicado' ? ' <span class="marca-rasc">' + esc(a.u.status) + '</span>' : '') + '</span>' +
                '<span class="es-aula-bts"><span class="al-fino es-aula-tem">' + [a.u.video ? (a.u.video_assistido ? 'vídeo ✓ assistido' : 'vídeo') : '', (a.u.animada || []).length ? 'aula interativa' : '', a.u.mapa ? 'mapa mental' : ''].filter(Boolean).join(' · ') + '</span>' +
                '<button class="al-bt peq" data-un="' + esc(a.u.codigo) + '">Abrir a aula</button></span></div>';
            }).join('') + '</details>';
        }).join('');
      cada(alvo, '[data-un]', function (b) { b.onclick = function () { ir('unidade', b.getAttribute('data-un')); }; });
      cada(alvo, '[data-ler]', function (b) { b.onclick = function () { lerDisciplina(alvo, b.getAttribute('data-ler')); }; });
      cada(alvo, '[data-animada]', function (b) { b.onclick = function () { aulaAnimada(b.getAttribute('data-animada')); }; });
      if (el('es-au-mt')) el('es-au-mt').onclick = function () { minhasMarcacoes(alvo); };
      cada(alvo, '[data-mapa]', function (b) { b.onclick = function () { abrirMapa(b.getAttribute('data-mapa'), window.open('', '_blank')); }; });
    }
    // ---- MARCA-TEXTO na leitura: o que o aluno grifa fica salvo na conta dele ----
    // A marcação é ancorada no texto CRU do bloco (aula, bloco, início, fim). Por
    // isso cada parágrafo carrega `data-o` — a posição onde ele começa no texto
    // cru — e o HTML só pode ter o texto, <br>, <mark> e <b>: tirando as tags tem
    // de sobrar o texto cru, senão a conta da seleção sai errada.
    var COR_MARCA = { amarelo: 'Amarelo', verde: 'Verde', azul: 'Azul', rosa: 'Rosa' };
    function textoMarcado(cru, marcas, destaques) { return paragrafosMarcados(cru, marcas, destaques).map(function (p) { return p.html; }).join(''); }
    // O que vai em negrito na leitura: a referência normativa — é o que o candidato
    // procura ao reler (artigo, súmula, OJ, tema, ação, lei). Só ela: negrito em
    // tudo é o mesmo que negrito em nada.
    var RE_NORMA = /(?:Súmulas?(?: Vinculantes?)?|SV|OJs?(?: Transitórias?)?|Temas?|Precedentes? Normativos?|ADIs?|ADCs?|ADPFs?|ADOs?|AREs?|REs?|REsp|EREsp|IRDR|IAC)\s+(?:n[ºo.]\s*)?\d+(?:\.\d+)*(?:[-\/][0-9A-Z]+)?|\barts?\.\s*\d+(?:\.\d+)*(?:[ºª°]|-[A-Z]\b)?|(?:Leis?(?: Complementar)?|Decretos?(?:-Lei)?|LC|EC|MP|Convenç(?:ão|ões)|Resoluç(?:ão|ões)|IN)\s+(?:n[ºo.]\s*)?\d+(?:\.\d+)*(?:\/\d{4})?/g;
    // um parágrafo curto, de uma linha só, sem ponto final (ou numerado: "3. Evolução histórica") é subtítulo
    function ehSubtitulo(t) {
      t = t.trim();
      if (!t || t.indexOf('\n') >= 0 || t.length > 90) return false;
      // numerado só é subtítulo se for uma frase só ("3. Evolução histórica"); "2. Efeitos. O primeiro…" é parágrafo
      return /^\d+(\.\d+)*[.)]\s+[^.]+\.?$/.test(t) || (t.length <= 70 && !/[.;:!?,]$/.test(t));
    }
    function paragrafosMarcados(cru, marcas, destaques) {
      cru = String(cru || ''); marcas = marcas || []; destaques = destaques || [];
      var pars = [], re = /\n{2,}/g, ini = 0, m;
      while ((m = re.exec(cru))) { pars.push([ini, m.index]); ini = m.index + m[0].length; }
      pars.push([ini, cru.length]);
      return pars.map(function (p) {
        var a = p[0], z = p[1], txt = cru.slice(a, z), sub = ehSubtitulo(txt), fortes = [], cortes = [a, z], x;
        if (!sub) {
          // título de seção colado no parágrafo ("2. Efeitos. O primeiro efeito…") também é título
          var colado = /^\d+(?:\.\d+)*[.)]\s+[^.\n]{2,70}\.(?=\s)/.exec(txt);
          var apos = colado ? colado[0].length : 0;
          if (colado) fortes.push([a, a + apos]);
          // Com destaques do autor, o negrito é o que ELE escolheu (a frase que importa); sem eles, fica o
          // automático da referência normativa. Os dois juntos voltariam a encher a página de negrito.
          if (destaques.length) {
            destaques.forEach(function (d) {
              for (var em = txt.indexOf(d, apos); d && em >= 0; em = txt.indexOf(d, em + d.length)) fortes.push([a + em, a + em + d.length]);
            });
          } else {
            RE_NORMA.lastIndex = apos;
            while ((x = RE_NORMA.exec(txt))) fortes.push([a + x.index, a + x.index + x[0].length]);
          }
        }
        fortes.forEach(function (f) { cortes.push(f[0], f[1]); });
        marcas.forEach(function (k) { if (k.inicio > a && k.inicio < z) cortes.push(k.inicio); if (k.fim > a && k.fim < z) cortes.push(k.fim); });
        cortes.sort(function (i, j) { return i - j; });
        var h = '';
        for (var i = 0; i < cortes.length - 1; i++) {
          var de = cortes[i], ate = cortes[i + 1];
          if (ate <= de) continue;
          var dona = null, forte = false;
          marcas.forEach(function (k) { if (k.inicio <= de && k.fim >= ate) dona = k; }); // a mais recente por cima
          fortes.forEach(function (f) { if (f[0] <= de && f[1] >= ate) forte = true; });
          var t = esc(cru.slice(de, ate)).replace(/\n/g, '<br>');
          if (forte) t = '<b>' + t + '</b>';
          h += dona ? '<mark class="mt-' + esc(dona.cor) + (dona.nota ? ' nota' : '') + '" data-mt="' + esc(dona.id) + '"' + (dona.nota ? ' title="' + esc(dona.nota) + '"' : '') + '>' + t + '</mark>' : t;
        }
        return { o: a, fim: z, sub: sub, html: '<p data-o="' + a + '"' + (sub ? ' class="es-ler-st"' : '') + '>' + h + '</p>' };
      });
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
    // o inverso de posicaoCrua: do deslocamento no texto cru ao ponto (nó de texto, deslocamento) no DOM
    function pontoNoDom(bloco, des) {
      var ps = bloco.querySelectorAll('p[data-o]'), p = null, i;
      for (i = 0; i < ps.length; i++) if (Number(ps[i].getAttribute('data-o')) <= des) p = ps[i];
      if (!p) return null;
      var resta = des - Number(p.getAttribute('data-o')), achado = null;
      (function anda(x) {
        if (achado) return;
        if (x.nodeType === 3) { if (resta <= x.nodeValue.length) achado = [x, resta]; else resta -= x.nodeValue.length; return; }
        if (x.nodeName === 'BR') { resta -= 1; return; }
        for (var f = x.firstChild; f && !achado; f = f.nextSibling) anda(f);
      })(p);
      return achado;
    }
    function blocoDe(no) { var x = no && (no.nodeType === 1 ? no : no.parentNode); while (x && !(x.classList && x.classList.contains('es-ler-bl'))) x = x.parentNode; return x || null; }

    // ---- a leitura como num leitor de livros: uma página por vez, do tamanho da tela ----
    // A aula inteira fica num fluxo de COLUNAS da largura da janela; cada coluna é
    // uma página, e virar a página é deslocar o fluxo. É o navegador que quebra o
    // texto — por isso a página sempre cabe na tela, em qualquer tamanho de letra,
    // e o texto no DOM continua sendo o cru (o marca-texto depende disso).
    var NOME_TEMA = { claro: 'Claro', sepia: 'Sépia', escuro: 'Escuro' };
    var OPC_KD = {
      fonte: { serif: ['Serifada', "Georgia,'Times New Roman',serif"], sans: ['Sem serifa', "Inter,system-ui,-apple-system,'Segoe UI',sans-serif"], classica: ['Clássica', "'Palatino Linotype','Book Antiqua',Palatino,serif"] },
      esp: { compacto: ['Compacto', 1.45], normal: ['Normal', 1.7], amplo: ['Amplo', 1.95] },
      marg: { estreita: ['Estreitas', 860], normal: ['Normais', 720], larga: ['Largas', 580] }
    };
    var TEMAS_KD = ['claro', 'sepia', 'escuro'], TAM_KD = [15, 16, 17, 18, 19, 20, 22, 24, 26], VAO_KD = 56;
    function lerDisciplina(alvo, cod, irPara, aoFechar) {
      rota(['curso', E.pid, 'estude', E.slug, 'aulas', 'ler', cod]);
      alvo.innerHTML = '<p class="al-sub">Carregando a leitura…</p>';
      Promise.all([api('GET', base() + '/leitura?disciplina=' + encodeURIComponent(cod)), api('GET', base() + '/marcacoes')]).then(function (rs) {
        var r = rs[0], marcas = rs[1].marcacoes.filter(function (k) { return !k.solta; }), crus = {}, pesos = [], totalCar = 0;
        r.aulas.forEach(function (a) {
          var n = 0;
          a.blocos.forEach(function (b) { crus[a.codigo + '|' + b.n] = b.texto; n += b.texto.length; });
          pesos.push(n); totalCar += n;
        });
        if (!r.aulas.length || !totalCar) { alvo.innerHTML = '<div class="jr-caixa"><p class="al-sub">Esta disciplina ainda não tem texto para leitura.</p></div>'; return; }
        var chave = 'es-ler:' + E.pid + ':' + E.slug + ':' + cod, chavePref = 'es-ler-pref';
        var ia = 0, pg = 0, total = 1, larg = 0, fracInicial = 0, pref = { tam: 19, tema: 'claro', fonte: 'serif', esp: 'normal', marg: 'normal' };
        try { var g0 = JSON.parse(localStorage.getItem(chave) || '{}') || {}; if (g0.ia >= 0 && g0.ia < r.aulas.length) { ia = g0.ia; fracInicial = Number(g0.fr) || 0; } } catch (e) { ia = 0; }
        try { var p0 = JSON.parse(localStorage.getItem(chavePref) || '{}') || {}; if (TAM_KD.indexOf(p0.tam) >= 0) pref.tam = p0.tam; if (TEMAS_KD.indexOf(p0.tema) >= 0) pref.tema = p0.tema; ['fonte', 'esp', 'marg'].forEach(function (k) { if (OPC_KD[k][p0[k]]) pref[k] = p0[k]; }); } catch (e) { /* fica no padrão */ }
        if (irPara && irPara.unidade) { // aberto de dentro de uma aula: começa nela
          r.aulas.forEach(function (a, i) { if (a.codigo === irPara.unidade) { ia = i; fracInicial = 0; } });
          irPara = null;
        }
        if (irPara) {
          var km = marcas.filter(function (x) { return x.id === irPara; })[0];
          if (km) { r.aulas.forEach(function (a, i) { if (a.codigo === km.unidade) ia = i; }); fracInicial = 0; } else irPara = null;
        }
        function doBloco(un, n) { return marcas.filter(function (k) { return k.unidade === un && k.bloco === n && k.cor !== 'marcador'; }); }
        function htmlDaAula(i) {
          var a = r.aulas[i];
          return '<h2>' + esc(a.titulo) + '</h2>' +
            (a.itens.length ? '<p class="es-ler-item">' + a.itens.map(function (x) { return '<b>' + esc(x.codigo) + '</b> ' + esc(x.texto); }).join(' · ') + '</p>' : '') +
            a.blocos.map(function (b) {
              var rot = NOME_BLOCO[b.tipo] ? NOME_BLOCO[b.tipo] + (b.titulo ? ' — ' + b.titulo : '') : (b.titulo || '');
              return (rot ? '<h3>' + esc(rot) + '</h3>' : '') + '<div class="es-ler-bl" data-un="' + esc(a.codigo) + '" data-bl="' + b.n + '" data-fim="' + b.texto.length + '">' +
                textoMarcado(b.texto, doBloco(a.codigo, b.n), a.destaques) + '</div>';
            }).join('') +
            (a.fontes.length ? '<p class="es-ler-fontes"><b>Fontes:</b> ' + a.fontes.map(function (f) { return esc(f.titulo); }).join('; ') + '</p>' : '');
        }

        var kd = document.createElement('div');
        kd.className = 'es-kd'; kd.setAttribute('data-tema', pref.tema);
        kd.innerHTML = '<header class="es-kd-topo"><button class="es-kd-bt" id="es-kd-sair" title="Fechar a leitura (Esc)">← Fechar</button>' +
          '<select class="es-kd-sel" id="es-kd-sel" aria-label="Ir para a aula">' + r.aulas.map(function (a, i) {
            return '<option value="' + i + '">' + (i + 1) + '. ' + esc(String(a.titulo).slice(0, 90)) + '</option>';
          }).join('') + '</select><span class="es-kd-acoes">' +
          '<button class="es-kd-bt" id="es-kd-aa" title="Letra, fonte, espaçamento, margens e fundo" aria-label="Aparência do texto">Aa</button>' +
          '<button class="es-kd-bt" id="es-kd-mk" title="Marcar esta página" aria-label="Marcar esta página">🔖</button>' +
          '<button class="es-kd-bt" id="es-kd-busca" title="Procurar na disciplina" aria-label="Procurar na disciplina">🔎</button>' +
          '<button class="es-kd-bt" id="es-kd-mt" title="Marcações desta disciplina" aria-label="Marcações desta disciplina">🖍️</button>' +
          '<button class="es-kd-bt" id="es-kd-pdf" title="Imprimir ou salvar em PDF" aria-label="Imprimir ou salvar em PDF">🖨️</button></span></header>' +
          '<div class="es-kd-buscar" id="es-kd-buscar" hidden><input id="es-kd-q" maxlength="80" placeholder="Procurar nesta disciplina…" aria-label="Procurar nesta disciplina">' +
          '<button class="es-kd-bt" id="es-kd-q-ir">Próxima ocorrência</button><span class="es-kd-q-msg" id="es-kd-q-msg"></span></div>' +
          '<div class="es-kd-palco"><button class="es-kd-lado" id="es-kd-ant" aria-label="Página anterior">‹</button>' +
          '<div class="es-kd-janela" id="es-kd-janela"><article class="es-ler es-kd-fluxo" id="es-ler-art"></article></div>' +
          '<button class="es-kd-lado" id="es-kd-prox" aria-label="Próxima página">›</button></div>' +
          '<footer class="es-kd-pe"><div class="es-ler-barra"><i id="es-kd-barra"></i></div><div class="es-kd-onde" id="es-kd-onde"></div></footer>' +
          '<div class="es-kd-aa" id="es-kd-aapn" hidden></div>' +
          '<aside class="es-kd-painel" id="es-kd-painel" hidden aria-label="Marcações desta disciplina"></aside>' +
          '<div class="es-mt-barra" id="es-mt" hidden></div>';
        alvo.innerHTML = ''; alvo.appendChild(kd);
        var rolagemAntes = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden'; // a página é a tela: nada rola por trás
        var art = el('es-ler-art'), barra = el('es-mt'), jan = el('es-kd-janela');

        function mostrar() {
          art.style.transform = 'translateX(' + (-(pg * (larg + VAO_KD))) + 'px)';
          var antes = 0, i;
          for (i = 0; i < ia; i++) antes += pesos[i];
          var pct = Math.min(100, Math.round((antes + pesos[ia] * (pg + 1) / total) * 100 / totalCar));
          el('es-kd-barra').style.width = pct + '%';
          el('es-kd-onde').innerHTML = '<span>' + esc(r.nome) + ' · aula ' + (ia + 1) + ' de ' + r.aulas.length + '</span><b>página ' + (pg + 1) + ' de ' + total + '</b><span>' + pct + '% da disciplina</span>';
          el('es-kd-ant').disabled = !ia && !pg;
          el('es-kd-prox').disabled = ia === r.aulas.length - 1 && pg === total - 1;
          el('es-kd-sel').value = String(ia);
          pintarMarcador();
          try { localStorage.setItem(chave, JSON.stringify({ ia: ia, fr: pg / total })); } catch (e) { /* sem armazenamento, só não lembra onde parou */ }
        }
        // mede as páginas da aula que está no fluxo; `frac` (0 a 1) reposiciona quando o tamanho da página muda
        function medir(frac) {
          jan.style.maxWidth = OPC_KD.marg[pref.marg][1] + 'px';
          larg = jan.clientWidth;
          art.style.fontSize = pref.tam + 'px';
          art.style.fontFamily = OPC_KD.fonte[pref.fonte][1];
          art.style.lineHeight = String(OPC_KD.esp[pref.esp][1]);
          art.style.columnWidth = larg + 'px'; art.style.columnGap = VAO_KD + 'px';
          total = Math.max(1, Math.round((art.scrollWidth + VAO_KD) / (larg + VAO_KD)));
          if (frac != null) pg = Math.floor(frac * total + 1e-6);
          pg = Math.min(total - 1, Math.max(0, pg));
          mostrar();
        }
        function semAnimar(fn) { art.style.transition = 'none'; fn(); void art.offsetWidth; art.style.transition = ''; }
        function abrirAula(i, onde) {
          ia = i; fechar();
          semAnimar(function () { art.innerHTML = htmlDaAula(i); pg = 0; medir(onde === 'fim' ? 1 : (onde || 0)); if (onde === 'fim') { pg = total - 1; mostrar(); } });
        }
        function redesenhar() { semAnimar(function () { art.innerHTML = htmlDaAula(ia); medir(null); }); }
        function virar(d) {
          fechar();
          if (pg + d >= 0 && pg + d < total) { pg += d; mostrar(); }
          else if (d > 0 && ia < r.aulas.length - 1) abrirAula(ia + 1, 0);
          else if (d < 0 && ia > 0) abrirAula(ia - 1, 'fim');
        }
        function guardarPref() { try { localStorage.setItem(chavePref, JSON.stringify(pref)); } catch (e) { /* preferência não guardada */ } }
        function sair(depois) {
          document.removeEventListener('keydown', tecla); window.removeEventListener('resize', aoRedimensionar); document.removeEventListener('mousedown', foraDaBarra);
          document.documentElement.style.overflow = rolagemAntes;
          if (depois) depois(alvo); else if (aoFechar) aoFechar(); else ir('aulas'); // pela aba, para o endereço acompanhar
        }

        el('es-kd-sair').onclick = function () { sair(); };
        el('es-kd-ant').onclick = function () { virar(-1); };
        el('es-kd-prox').onclick = function () { virar(1); };
        el('es-kd-sel').onchange = function (e) { abrirAula(Number(e.target.value), 0); e.target.blur(); };
        // "Aa": tamanho, fonte, espaçamento, margens e fundo — tudo o que muda a página, num lugar só
        var aapn = el('es-kd-aapn');
        function aplicarPref() { kd.setAttribute('data-tema', pref.tema); guardarPref(); semAnimar(function () { medir(pg / total); }); desenharAa(); }
        function desenharAa() {
          function grupo(rot, k) {
            return '<div class="es-kd-aa-g"><span>' + rot + '</span>' + Object.keys(OPC_KD[k]).map(function (v) {
              return '<button class="es-kd-bt' + (pref[k] === v ? ' on' : '') + '" data-pf="' + k + '" data-v="' + v + '">' + OPC_KD[k][v][0] + '</button>';
            }).join('') + '</div>';
          }
          aapn.innerHTML = '<div class="es-kd-aa-g"><span>Tamanho</span><button class="es-kd-bt" data-tam="-1" aria-label="Diminuir a letra">A−</button><b>' + pref.tam + '</b>' +
            '<button class="es-kd-bt" data-tam="1" aria-label="Aumentar a letra">A+</button></div>' + grupo('Fonte', 'fonte') + grupo('Espaçamento', 'esp') + grupo('Margens', 'marg') +
            '<div class="es-kd-aa-g"><span>Fundo</span>' + TEMAS_KD.map(function (t) { return '<button class="es-kd-bt' + (pref.tema === t ? ' on' : '') + '" data-tema="' + t + '">' + NOME_TEMA[t] + '</button>'; }).join('') + '</div>';
          cada(aapn, '[data-tam]', function (b) { b.onclick = function () { var i = TAM_KD.indexOf(pref.tam) + Number(b.getAttribute('data-tam')); if (i >= 0 && i < TAM_KD.length) { pref.tam = TAM_KD[i]; aplicarPref(); } }; });
          cada(aapn, '[data-pf]', function (b) { b.onclick = function () { pref[b.getAttribute('data-pf')] = b.getAttribute('data-v'); aplicarPref(); }; });
          cada(aapn, '[data-tema]', function (b) { b.onclick = function () { pref.tema = b.getAttribute('data-tema'); aplicarPref(); }; });
        }
        el('es-kd-aa').onclick = function () { fechar(); fecharPainel(); aapn.hidden = !aapn.hidden; if (!aapn.hidden) desenharAa(); };

        // MARCADOR DE PÁGINA: prende-se ao parágrafo que abre a página (texto, não número de página — a página
        // muda com a letra e a tela; o parágrafo, não). Fica salvo na conta, como os grifos.
        function paginaDe(x) { return Math.floor(x.offsetLeft / (larg + VAO_KD)); }
        function paragrafoDaPagina() {
          var ps = art.querySelectorAll('.es-ler-bl p[data-o]'), ach = null, i, pp;
          for (i = 0; i < ps.length; i++) { pp = paginaDe(ps[i]); if (pp === pg) return ps[i]; if (pp < pg) ach = ps[i]; }
          return ach; // nenhum parágrafo começa aqui: vale o que atravessa a página
        }
        function paragrafoDoMarcador(k) { return art.querySelector('.es-ler-bl[data-un="' + k.unidade + '"][data-bl="' + k.bloco + '"] p[data-o="' + k.inicio + '"]'); }
        function marcadorDaPagina() {
          var p = paragrafoDaPagina(), un = r.aulas[ia].codigo, ach = null;
          if (p) marcas.forEach(function (k) { if (k.cor === 'marcador' && k.unidade === un && paragrafoDoMarcador(k) === p) ach = k; });
          return ach;
        }
        function pintarMarcador() {
          var b = el('es-kd-mk'), tem = !!marcadorDaPagina();
          b.classList.toggle('on', tem);
          b.title = tem ? 'Tirar o marcador desta página' : 'Marcar esta página';
        }
        el('es-kd-mk').onclick = function () {
          var k = marcadorDaPagina(), avisar = function (e) { el('es-kd-onde').textContent = e.message; };
          if (k) { api('DELETE', base() + '/marcacoes/' + k.id).then(function () { marcas = marcas.filter(function (x) { return x.id !== k.id; }); pintarMarcador(); }).catch(avisar); return; }
          var p = paragrafoDaPagina();
          if (!p) return;
          var bl = blocoDe(p), un = bl.getAttribute('data-un'), n = Number(bl.getAttribute('data-bl')), ini = Number(p.getAttribute('data-o')), cru = crus[un + '|' + n];
          var fimP = cru.indexOf('\n\n', ini);
          if (fimP < 0) fimP = cru.length;
          api('POST', base() + '/marcacoes', { unidade: un, bloco: n, inicio: ini, fim: Math.min(fimP, ini + 140), cor: 'marcador' })
            .then(function (x) { marcas.push(x.marcacao); pintarMarcador(); }).catch(avisar);
        };
        // A caneta abre as marcações DESTA disciplina sem sair da página que está sendo lida: quem está
        // estudando quer rever o que grifou e voltar ao mesmo ponto, não procurar a aula de novo na lista.
        var painel = el('es-kd-painel');
        function irParaMarca(id) {
          var k = marcas.filter(function (x) { return x.id === id; })[0];
          if (!k) return;
          var i = -1;
          r.aulas.forEach(function (a, n) { if (a.codigo === k.unidade) i = n; });
          if (i < 0) return;
          if (i !== ia) abrirAula(i, 0);
          var destino = k.cor === 'marcador' ? paragrafoDoMarcador(k) : art.querySelector('mark[data-mt="' + id + '"]');
          if (!destino) return;
          semAnimar(function () { pg = Math.min(total - 1, Math.max(0, Math.floor(destino.offsetLeft / (larg + VAO_KD)))); mostrar(); });
          destino.classList.add('pisca');
          setTimeout(function () { destino.classList.remove('pisca'); }, 2500);
        }
        function fecharPainel() { painel.hidden = true; painel.innerHTML = ''; }
        function abrirPainel() {
          var ordem = {}, grupos = [], por = {};
          r.aulas.forEach(function (a, n) { ordem[a.codigo] = n; });
          var marcadores = marcas.filter(function (k) { return ordem[k.unidade] != null && k.cor === 'marcador'; })
            .sort(function (a, b) { return ordem[a.unidade] - ordem[b.unidade] || a.bloco - b.bloco || a.inicio - b.inicio; });
          marcas.filter(function (k) { return ordem[k.unidade] != null && k.cor !== 'marcador'; })
            .sort(function (a, b) { return ordem[a.unidade] - ordem[b.unidade] || a.bloco - b.bloco || a.inicio - b.inicio; })
            .forEach(function (k) {
              var g = por[k.unidade];
              if (!g) { g = por[k.unidade] = { titulo: r.aulas[ordem[k.unidade]].titulo, n: ordem[k.unidade], marcas: [] }; grupos.push(g); }
              g.marcas.push(k);
            });
          var qtd = grupos.reduce(function (s, g) { return s + g.marcas.length; }, 0);
          painel.innerHTML = '<div class="es-kd-pn-topo"><b>Marcações desta disciplina</b><button class="es-kd-bt" id="es-kd-pn-x" aria-label="Fechar as marcações">Fechar</button></div>' +
            (qtd ? '<p class="es-kd-pn-sub">' + qtd + ' trecho(s) grifado(s) em ' + esc(r.nome) + '. Toque num trecho para ir até ele.</p>'
              : '<p class="es-kd-pn-sub">Você ainda não grifou nada em ' + esc(r.nome) + '. Selecione um trecho do texto e escolha a cor.</p>') +
            (marcadores.length ? '<h4>🔖 Marcadores de página</h4>' + marcadores.map(function (k) {
              return '<div class="es-kd-pn-item"><button class="es-kd-pn-trecho es-kd-pn-mk" data-ir="' + esc(k.id) + '"><b>Aula ' + (ordem[k.unidade] + 1) + '</b> — ' + esc(k.texto.slice(0, 110)) + '…</button>' +
                '<button class="es-link" data-del="' + esc(k.id) + '">tirar o marcador</button></div>';
            }).join('') : '') +
            grupos.map(function (g) {
              return '<h4>' + (g.n + 1) + '. ' + esc(g.titulo) + '</h4>' + g.marcas.map(function (k) {
                return '<div class="es-kd-pn-item"><button class="es-kd-pn-trecho mt-' + esc(k.cor) + '" data-ir="' + esc(k.id) + '">' + esc(k.texto.length > 260 ? k.texto.slice(0, 260) + '…' : k.texto) + '</button>' +
                  (k.nota ? '<p class="es-kd-pn-nota">✎ ' + esc(k.nota) + '</p>' : '') +
                  '<button class="es-link" data-del="' + esc(k.id) + '">apagar</button></div>';
              }).join('');
            }).join('') +
            '<p class="es-kd-pn-sub"><button class="es-link" id="es-kd-pn-todas">Ver as marcações de todas as disciplinas (fecha a leitura)</button></p>';
          painel.hidden = false;
          el('es-kd-pn-x').onclick = fecharPainel;
          el('es-kd-pn-todas').onclick = function () { sair(minhasMarcacoes); };
          cada(painel, '[data-ir]', function (b) { b.onclick = function () { var id = b.getAttribute('data-ir'); fecharPainel(); irParaMarca(id); }; });
          cada(painel, '[data-del]', function (b) {
            b.onclick = function () {
              var id = b.getAttribute('data-del');
              api('DELETE', base() + '/marcacoes/' + id).then(function () {
                marcas = marcas.filter(function (x) { return x.id !== id; });
                redesenhar(); abrirPainel();
              }).catch(function (e) { painel.insertAdjacentHTML('afterbegin', '<p class="es-msg-erro">' + esc(e.message) + '</p>'); });
            };
          });
        }
        el('es-kd-mt').onclick = function () { fechar(); if (painel.hidden) abrirPainel(); else fecharPainel(); };
        // busca na disciplina inteira: da página atual em diante, dando a volta; o achado fica selecionado
        function semAcento(t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
        var achado = null, indice = null;
        function procurar() {
          var q = semAcento(el('es-kd-q').value.trim()), msg = el('es-kd-q-msg');
          if (q.length < 2) { msg.textContent = 'Digite pelo menos duas letras.'; return; }
          if (!indice) { indice = []; r.aulas.forEach(function (a, i) { a.blocos.forEach(function (b) { indice.push({ i: i, n: b.n, un: a.codigo, t: semAcento(b.texto) }); }); }); }
          var mesma = achado && achado.q === q, ini = 0, k;
          if (mesma) ini = achado.k; else for (k = 0; k < indice.length; k++) if (indice[k].i === ia) { ini = k; break; }
          for (var v = 0; v <= indice.length; v++) {
            k = (ini + v) % indice.length;
            var o = indice[k].t.indexOf(q, v === 0 && mesma ? achado.o + 1 : 0);
            if (o < 0) continue;
            achado = { q: q, k: k, o: o }; msg.textContent = '';
            if (indice[k].i !== ia) abrirAula(indice[k].i, 0);
            var bl = art.querySelector('.es-ler-bl[data-un="' + indice[k].un + '"][data-bl="' + indice[k].n + '"]');
            var a = bl && pontoNoDom(bl, o), z = bl && pontoNoDom(bl, o + q.length);
            if (!a || !z) return;
            var g = document.createRange(); g.setStart(a[0], a[1]); g.setEnd(z[0], z[1]);
            var onde = g.getBoundingClientRect().left - art.getBoundingClientRect().left;
            semAnimar(function () { pg = Math.min(total - 1, Math.max(0, Math.floor(onde / (larg + VAO_KD)))); mostrar(); });
            var s = window.getSelection(); s.removeAllRanges(); s.addRange(g);
            return;
          }
          msg.textContent = 'Não encontrei "' + el('es-kd-q').value.trim() + '" nesta disciplina.';
        }
        el('es-kd-busca').onclick = function () { var b = el('es-kd-buscar'); b.hidden = !b.hidden; if (!b.hidden) el('es-kd-q').focus(); semAnimar(function () { medir(pg / total); }); };
        el('es-kd-q-ir').onclick = procurar;
        el('es-kd-q').onkeydown = function (e) { if (e.key === 'Enter') procurar(); else if (e.key === 'Escape') { el('es-kd-buscar').hidden = true; semAnimar(function () { medir(pg / total); }); } };
        el('es-kd-pdf').onclick = function () {
          var w = window.open('', '_blank');
          if (!w) return;
          // o PDF sai com a disciplina inteira, corrida, com os grifos
          var tudo = '<h1>' + esc(r.nome) + '</h1><p class="es-ler-sub">' + esc(r.escopo) + ' · ' + r.aulas.length + ' aulas</p>' + r.aulas.map(function (a, i) { return '<section>' + htmlDaAula(i) + '</section>'; }).join('');
          w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(r.nome) + '</title><style>' +
            '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font:12pt/1.55 Georgia,serif;color:#111;max-width:720px;margin:24px auto;padding:0 20px}h1{font-size:22pt;margin:0 0 4px}' +
            'h2{font-size:16pt;margin:30px 0 4px;page-break-after:avoid;border-bottom:1.5px solid #1B2A4A;padding-bottom:4px}h3{font-size:12pt;margin:16px 0 4px;page-break-after:avoid}' +
            'p{margin:0 0 9px;text-align:justify}p.es-ler-st{font-weight:700;font-size:12.5pt;margin:16px 0 5px;text-align:left;page-break-after:avoid}' +
            '.es-ler-sub,.es-ler-item,.es-ler-fontes{font-size:10pt;color:#444;text-align:left}section{page-break-inside:auto}' +
            'mark{color:inherit;border-radius:2px}.mt-amarelo{background:#fff3a3}.mt-verde{background:#c9f2d0}.mt-azul{background:#cfe6ff}.mt-rosa{background:#ffd3e2}' +
            '</style></head><body>' + tudo + '</body></html>');
          w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
        };
        // teclado: setas, PageUp/PageDown e espaço viram a página; Esc fecha. Fora dos campos de digitar.
        function tecla(e) {
          if (!kd.isConnected) { document.removeEventListener('keydown', tecla); return; }
          var t = e.target && e.target.tagName;
          if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
          if (!painel.hidden && e.key !== 'Escape') return; // com as marcações abertas, a página não vira por trás
          if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); virar(1); }
          else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); virar(-1); }
          else if (e.key === 'Escape') { if (!aapn.hidden) aapn.hidden = true; else if (!painel.hidden) fecharPainel(); else if (!barra.hidden) fechar(); else sair(); }
        }
        var espera = 0;
        function aoRedimensionar() {
          if (!kd.isConnected) { window.removeEventListener('resize', aoRedimensionar); return; }
          clearTimeout(espera); espera = setTimeout(function () { semAnimar(function () { medir(pg / total); }); }, 120);
        }
        document.addEventListener('keydown', tecla);
        window.addEventListener('resize', aoRedimensionar);
        // dedo: arrastar para o lado vira a página (sem atrapalhar quem está selecionando texto)
        var toqueX = null;
        jan.addEventListener('touchstart', function (e) { toqueX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
        jan.addEventListener('touchend', function (e) {
          var s = window.getSelection();
          if (toqueX == null || (s && !s.isCollapsed)) { toqueX = null; return; }
          var dx = e.changedTouches[0].clientX - toqueX; toqueX = null;
          if (Math.abs(dx) > 60) virar(dx < 0 ? 1 : -1);
        }, { passive: true });

        function fechar() { barra.hidden = true; barra.innerHTML = ''; }
        function mostrarBarra(ret, html) {
          barra.innerHTML = html; barra.hidden = false;
          var lb = barra.offsetWidth || 240, alt = barra.offsetHeight || 44;
          var x = Math.max(8, Math.min(window.innerWidth - lb - 8, ret.left + ret.width / 2 - lb / 2));
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
          var fim = blocoDe(g.endContainer) === bl ? posicaoCrua(bl, g.endContainer, g.endOffset) : Number(bl.getAttribute('data-fim'));
          if (ini == null || fim == null) return;
          while (ini < fim && /\s/.test(cru.charAt(ini))) ini++;
          while (fim > ini && /\s/.test(cru.charAt(fim - 1))) fim--;
          if (fim - ini < 2) return;
          // palavra ou expressão curta: além de grifar, dá para consultar o dicionário ou procurá-la na disciplina
          var trecho = cru.slice(ini, fim), curto = trecho.length <= 40 && trecho.split(/\s+/).length <= 3;
          mostrarBarra(g.getBoundingClientRect(), '<span class="al-fino">Grifar:</span>' + cores('') +
            (curto ? '<button class="al-bt peq fan" id="es-mt-dic" title="Abre o dicionário Priberam em outra aba">📖 Dicionário</button><button class="al-bt peq fan" id="es-mt-proc">🔎 Na disciplina</button>' : ''));
          if (curto) {
            el('es-mt-dic').onmousedown = function (e) { e.preventDefault(); };
            el('es-mt-dic').onclick = function () { window.open('https://dicionario.priberam.org/' + encodeURIComponent(trecho.toLowerCase()), '_blank', 'noopener'); fechar(); };
            el('es-mt-proc').onmousedown = function (e) { e.preventDefault(); };
            el('es-mt-proc').onclick = function () { fechar(); el('es-kd-buscar').hidden = false; el('es-kd-q').value = trecho; achado = null; semAnimar(function () { medir(pg / total); }); procurar(); };
          }
          cada(barra, '[data-cor]', function (b) {
            b.onmousedown = function (e) { e.preventDefault(); }; // não desfaz a seleção antes do clique
            b.onclick = function () {
              api('POST', base() + '/marcacoes', { unidade: un, bloco: n, inicio: ini, fim: fim, cor: b.getAttribute('data-cor') }).then(function (x) {
                marcas.push(x.marcacao); window.getSelection().removeAllRanges(); fechar(); redesenhar();
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
              k.cor = x.marcacao.cor; k.nota = x.marcacao.nota; fechar(); redesenhar();
            }).catch(function (er) { barra.innerHTML = '<span class="es-msg-erro">' + esc(er.message) + '</span>'; });
          }
          cada(barra, '[data-cor]', function (b) { b.onclick = function () { salvar(b.getAttribute('data-cor')); }; });
          el('es-mt-ok').onclick = function () { salvar(); };
          el('es-mt-nota').onkeydown = function (ev) { if (ev.key === 'Enter') salvar(); };
          el('es-mt-del').onclick = function () {
            api('DELETE', base() + '/marcacoes/' + k.id).then(function () {
              marcas.splice(marcas.indexOf(k), 1); fechar(); redesenhar();
            }).catch(function (er) { barra.innerHTML = '<span class="es-msg-erro">' + esc(er.message) + '</span>'; });
          };
        });
        function foraDaBarra(e) {
          if (!kd.isConnected) { document.removeEventListener('mousedown', foraDaBarra); return; }
          if (!barra.hidden && !barra.contains(e.target) && !(e.target.closest && e.target.closest('mark[data-mt]'))) fechar();
          if (!aapn.hidden && !aapn.contains(e.target) && e.target.id !== 'es-kd-aa') aapn.hidden = true;
        }
        document.addEventListener('mousedown', foraDaBarra);

        abrirAula(ia, fracInicial);
        if (irPara) {
          var destino = art.querySelector('mark[data-mt="' + irPara + '"]');
          if (destino) { semAnimar(function () { pg = Math.min(total - 1, Math.max(0, Math.floor(destino.offsetLeft / (larg + VAO_KD)))); mostrar(); }); destino.classList.add('pisca'); }
        }
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

    // ================= MAIS COBRADO: o que a banca já pediu, por tema — e as questões dela =================
    // A medida é a única que temos de fato: as questões OFICIAIS deste concurso, classificadas por ponto do
    // edital. É uma prova, não uma série histórica — a tela diz isso, para o ranking não virar promessa.
    function maisCobrado(alvo) {
      var p = E.painel, mm = materias(), uns = {}, compDoItem = {}, discs = [], porDisc = {};
      p.unidades.forEach(function (u) { (u.competencias || []).forEach(function (k) { if (!uns[k]) uns[k] = u; }); });
      var temas = p.itens.filter(function (i) { return i.folha; }).map(function (i) {
        var comp = (i.competencias[0] || {}).codigo || '', m = mm[comp] || { disciplina: 'Programa' }, u = uns[comp];
        compDoItem[i.codigo] = comp;
        var nomeD = m.grupo || m.disciplina, d = porDisc[nomeD];
        if (!d) { d = porDisc[nomeD] = { nome: nomeD, n: 0, pontos: 0, cobrados: 0 }; discs.push(d); }
        d.n += i.oficiais || 0; d.pontos++; if (i.oficiais) d.cobrados++;
        return { cod: i.codigo, n: i.oficiais || 0, titulo: (u && u.titulo) || i.texto, comp: comp, un: u && u.codigo, mapa: u && u.mapa, disc: nomeD };
      });
      var total = temas.reduce(function (s, t) { return s + t.n; }, 0);
      var cobrados = temas.filter(function (t) { return t.n; }).sort(function (a, b) { return b.n - a.n || (a.cod < b.cod ? -1 : 1); });
      if (!total) {
        alvo.innerHTML = '<div class="jr-caixa"><h3>O que mais cai</h3><p class="al-sub">Este percurso ainda não tem questões de prova oficial classificadas por tema. Assim que houver, o ranking aparece aqui.</p></div>';
        return;
      }
      var maxD = Math.max.apply(null, discs.map(function (d) { return d.n; })), maxT = cobrados[0].n;
      alvo.innerHTML = '<div class="jr-caixa"><h3>O que mais cai</h3>' +
        '<p class="al-sub">Os temas que a banca já cobrou, do mais ao menos pedido, e as questões da própria prova para treinar. ' +
        'Base: <b>' + total + '</b> classificações de questões oficiais deste concurso em <b>' + cobrados.length + '</b> dos ' + temas.length + ' pontos do edital.</p>' +
        '<p class="al-fino">É o retrato de uma prova, não uma estatística de muitos anos: mostra o estilo e as preferências da banca, mas ponto que não caiu pode cair. Use para ordenar o estudo, não para cortar matéria.</p>' +
        '<div class="es-linha"><button class="al-bt" id="es-mc-todas">Treinar só com questões de prova oficial</button></div></div>' +
        '<div class="jr-caixa"><h3>Por disciplina</h3><p class="al-sub">Quanto cada disciplina pesou na prova e quantos dos seus pontos foram cobrados.</p>' +
        discs.slice().sort(function (a, b) { return b.n - a.n; }).map(function (d) {
          return '<div class="es-mc-linha"><span class="es-mc-nome">' + esc(d.nome) + '</span><span class="es-mc-barra"><i style="width:' + (maxD ? Math.round(d.n * 100 / maxD) : 0) + '%"></i></span>' +
            '<b class="es-mc-n">' + d.n + '</b><span class="al-fino es-mc-obs">' + d.cobrados + ' de ' + d.pontos + ' pontos</span></div>';
        }).join('') + '</div>' +
        '<div class="jr-caixa"><h3>Temas mais cobrados</h3><p class="al-sub">Do edital inteiro, em ordem de cobrança. Em cada tema: a aula, o mapa mental e as questões da prova sobre ele.</p>' +
        cobrados.map(function (t, i) {
          return '<div class="es-mc-tema"><span class="es-mc-pos">' + (i + 1) + 'º</span><div class="es-mc-txt"><b>' + esc(t.cod) + '</b> ' + esc(t.titulo) +
            '<span class="al-fino"> · ' + esc(t.disc) + '</span><span class="es-mc-barra fina"><i style="width:' + Math.round(t.n * 100 / maxT) + '%"></i></span></div>' +
            '<span class="es-banca">' + t.n + '× na prova</span><span class="es-aula-bts">' +
            (t.un ? '<button class="al-bt peq fan" data-un="' + esc(t.un) + '">Aula</button>' : '') +
            (t.mapa ? '<button class="al-bt peq fan" data-mapa="' + esc(t.un) + '">🧠 Mapa</button>' : '') +
            (t.comp ? '<button class="al-bt peq" data-of="' + esc(t.comp) + '">Questões da prova</button>' : '') + '</span></div>';
        }).join('') +
        '<p class="al-fino">' + (temas.length - cobrados.length) + ' pontos do edital não foram cobrados nesta prova; eles continuam no Programa e nas Aulas.</p></div>';
      el('es-mc-todas').onclick = function () { ir('praticar', { competencia: '', origem: 'oficial' }); };
      cada(alvo, '[data-un]', function (b) { b.onclick = function () { ir('unidade', b.getAttribute('data-un')); }; });
      cada(alvo, '[data-mapa]', function (b) { b.onclick = function () { abrirMapa(b.getAttribute('data-mapa'), window.open('', '_blank')); }; });
      cada(alvo, '[data-of]', function (b) { b.onclick = function () { ir('praticar', { competencia: b.getAttribute('data-of'), origem: 'oficial' }); }; });
    }

    // ================= PROGRAMA: cada item com o seu destino =================
    function programa(alvo) {
      var p = E.painel, uns = {};
      p.unidades.forEach(function (u) { uns[u.codigo] = u; });
      if (!p.itens.length && !p.competencias.length) {
        alvo.innerHTML = '<div class="jr-caixa"><h3>Programa</h3><p class="al-sub">Este percurso ainda não tem programa.' + (p.escopo.particular ? ' Envie o edital do concurso em PDF: o sistema lê o conteúdo programático e monta o programa por disciplina.' : '') + '</p>' +
          (p.escopo.particular ? '<div class="es-linha"><button class="al-bt" id="es-pg-edital">Ler edital em PDF</button></div>' : '') + '</div>';
        if (el('es-pg-edital')) el('es-pg-edital').onclick = function () { ir('escrita', 'edital'); };
        return;
      }
      // só o programa (edital lido, sem aula e sem questão): os itens estão aí — falta com o que estudar e praticar
      var soPrograma = p.itens.length && !p.unidades.length && !p.itens.some(function (i) { return i.questoes_revisadas + i.questoes_sugeridas; });
      var h = (soPrograma ? '<div class="es-nota-aba"><b>Este percurso tem o programa, e ainda não tem questões.</b><p>' + (p.escopo.particular
        ? 'Os itens abaixo são os do edital que você enviou. Para praticar por disciplina e fazer simulado, importe uma prova em PDF; para organizar o estudo até a prova, monte o plano.'
        : 'As aulas e as questões aparecem aqui, item a item, assim que forem publicadas.') + '</p>' +
        (p.escopo.particular ? '<div class="es-linha"><button class="al-bt peq" id="es-pg-imp">Importar prova em PDF</button><button class="al-bt peq fan" id="es-pg-plano">Montar o plano</button></div>' : '') + '</div>' : '') +
        '<div class="jr-caixa"><h3>Programa</h3><p class="al-sub">O texto de cada item é o original. Ao lado, o que já existe para ele e o que você demonstrou.</p><div class="es-prog">' +
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
      if (el('es-pg-imp')) el('es-pg-imp').onclick = function () { ir('escrita', 'importar'); };
      if (el('es-pg-plano')) el('es-pg-plano').onclick = function () { ir('plano'); };
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
      'footer{margin-top:8px;font-size:7.5pt;color:#777}@media screen{body{max-width:1120px;margin:20px auto}}' +
      '.barra-mapa{position:sticky;top:0;z-index:5;display:flex;gap:8px;justify-content:flex-end;padding:10px 0;background:#fff;border-bottom:1px solid #dde2ec;margin-bottom:12px}' +
      '.barra-mapa button{font:600 11pt Arial,sans-serif;padding:8px 14px;border-radius:8px;border:1.5px solid #1B2A4A;background:#1B2A4A;color:#fff;cursor:pointer}' +
      '.barra-mapa button.fan{background:#fff;color:#1B2A4A}@media print{.barra-mapa{display:none}}';
    // uma página do PDF: o mapa de UMA aula para UM foco de prova
    function paginaDoMapa(titulo, foco, txt, versao) {
      return '<section class="pag"><header><h1>' + esc(titulo) + '</h1><span>Mapa mental · ' + esc(FOCO[foco] || foco) + ' · ' + esc(E.titulo || '') + '</span></header>' +
        htmlDoMapa(titulo, txt) + '<footer>Villela Academy · mapa da versão ' + versao + ' da aula. Confira a vigência de leis e súmulas antes da prova.</footer></section>';
    }
    function escreverMapas(w, titulo, pags) {
      w.document.open();
      w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(titulo) + '</title><style>' + CSS_MAPA + '</style></head><body>' +
        // o mapa abre para LER; imprimir é um botão (pedido do Augusto, 11/10/2026) — a barra não sai no papel
        (pags ? '<div class="barra-mapa"><button id="mp-imprimir">🖨️ Imprimir ou salvar em PDF</button><button id="mp-fechar" class="fan">Fechar</button></div>' : '') +
        (pags || '<p>Ainda não há mapa mental aqui.</p>') + '</body></html>');
      w.document.close(); w.focus();
      // os cliques são ligados daqui: script escrito dentro da janela seria barrado pela política da página
      var bi = w.document.getElementById('mp-imprimir'), bf = w.document.getElementById('mp-fechar');
      if (bi) bi.onclick = function () { w.print(); };
      if (bf) bf.onclick = function () { w.close(); };
    }
    // a janela é aberta no clique (antes do fetch), senão o navegador a bloqueia como pop-up
    function abrirMapa(codigo, janela) {
      var w = janela || window.open('', '_blank');
      if (!w) return;
      w.document.write('<p style="font:14px Arial">Montando o mapa mental…</p>');
      api('GET', base() + '/unidades/' + encodeURIComponent(codigo)).then(function (u) {
        var pags = ['objetiva', 'escrita', 'oral'].filter(function (f) { return u.vespera && u.vespera[f] && u.vespera[f].mapa; })
          .map(function (f) { return paginaDoMapa(u.titulo, f, u.vespera[f].mapa, u.versao); }).join('');
        escreverMapas(w, 'Mapa mental — ' + u.titulo, pags);
      }).catch(function (e) { w.document.open(); w.document.write('<p>' + esc(e.message) + '</p>'); w.document.close(); });
    }

    // ================= MAPA QUE SE DESENHA (formato A do estudo das aulas em vídeo) =================
    // Animação feita do mapa mental que a aula já tem, sem custo de produção: os nós aparecem um a um e,
    // ao fim de cada ramo, ele some e o aluno tem de lembrar o que havia ali antes de ver de novo.
    // A voz é a do próprio navegador (opcional, começa desligada).
    // Tela por cima da página (aula interativa, mapa animado): o Voltar do navegador FECHA a tela e deixa o aluno
    // exatamente onde estava. Sem isto, o Voltar pulava para a página anterior com a tela ainda aberta.
    function sobreposto(fechar) {
      var estado = 0; // 0 aberta · 1 fechando pelo botão · 2 encerrada
      function aoVoltar(e) {
        window.removeEventListener('popstate', aoVoltar, true);
        e.stopImmediatePropagation(); // a rota não mudou: o painel não precisa remontar a página
        var era = estado; estado = 2;
        if (era === 0) fechar();
      }
      try { history.pushState({ esSobreposto: 1 }, '', location.href); } catch (x) { return function () {}; }
      window.addEventListener('popstate', aoVoltar, true);
      return function () { if (estado !== 0) return; estado = 1; try { history.back(); } catch (x) { /* sem histórico */ } };
    }
    // ---- AULA ANIMADA (formatos sem avatar): fluxo com paradas, caso para decidir e erro da banca ----
    // Um quadro por vez. A animação PERGUNTA: nas paradas, o botão vira "Ver a resposta" — o aluno
    // responde de cabeça antes de abrir. Nada toca sozinho: quem avança é ele.
    var NOME_AN = { fluxo: '🧭 Passo a passo', caso: '⚖️ Caso para decidir', erros: '🎯 Erro da banca' };
    function quadrosDe(tipo, r) {
      var q = [];
      if (tipo === 'fluxo') {
        var f = r.fluxo;
        q.push({ h: '<div class="es-aq es-aq-abre"><p class="al-rotulo">Fluxo</p><h3>' + esc(f.titulo || r.titulo) + '</h3><p>' + f.etapas.length + ' etapas, na ordem. Em ' + f.paradas.length + ' ponto(s) a aula para e pergunta: responda de cabeça antes de abrir a resposta.</p></div>', bt: 'Começar ›' });
        f.etapas.forEach(function (e, k) {
          q.push({ h: '<div class="es-aq es-aq-etapa"><span class="es-aq-n">' + (k + 1) + '</span><div><h4>' + esc(e.ato) + '</h4>' +
            '<p class="es-aq-meta">' + [e.quem ? '<b>Quem:</b> ' + esc(e.quem) : '', e.prazo ? '<b>Prazo:</b> ' + esc(e.prazo) : '', e.fonte ? '<b>Fonte:</b> ' + esc(e.fonte) : ''].filter(Boolean).join(' · ') + '</p>' +
            (e.nota ? '<p class="es-aq-nota">' + esc(e.nota) + '</p>' : '') + '</div></div>' });
          f.paradas.filter(function (p) { return p.depois_da_etapa === k + 1; }).forEach(function (p) {
            q.push({ h: '<div class="es-aq es-aq-pergunta"><p class="al-rotulo">Pare e responda</p><p>' + esc(p.pergunta) + '</p></div>', bt: 'Ver a resposta' });
            q.push({ h: '<div class="es-aq es-aq-resposta"><p class="al-rotulo">Resposta</p><p>' + esc(p.resposta) + '</p></div>' });
          });
        });
      } else if (tipo === 'caso') {
        var c = r.caso;
        q.push({ h: '<div class="es-aq es-aq-abre"><p class="al-rotulo">Caso para decidir</p><p class="es-aq-caso">' + esc(c.narrativa) + '</p></div>' });
        q.push({ h: '<div class="es-aq es-aq-pergunta"><p class="al-rotulo">Decida antes de abrir</p><p>' + esc(c.pergunta) + '</p></div>', bt: 'Ver a solução, passo a passo' });
        c.passos.forEach(function (p) { q.push({ h: '<div class="es-aq es-aq-passo"><p class="al-rotulo">' + esc(p.rotulo || 'Passo') + '</p><p>' + esc(p.texto) + '</p></div>' }); });
      } else {
        r.erros.forEach(function (e, k) {
          q.push({ h: '<div class="es-aq es-aq-pergunta"><p class="al-rotulo">Afirmação ' + (k + 1) + ' de ' + r.erros.length + ' — está errada. Ache o erro antes de abrir.</p><p class="es-aq-caso">' + esc(e.afirmacao) + '</p></div>', bt: 'Ver onde está o erro' });
          q.push({ h: '<div class="es-aq es-aq-resposta">' + (e.por_que_parece_certa ? '<p class="al-rotulo">Por que parece certa</p><p>' + esc(e.por_que_parece_certa) + '</p>' : '') +
            '<p class="al-rotulo">Onde está o erro</p><p>' + esc(e.onde_esta_o_erro) + '</p>' + (e.fonte ? '<p class="es-aq-meta"><b>Fonte:</b> ' + esc(e.fonte) + '</p>' : '') + '</div>' });
        });
      }
      return q;
    }
    function aulaAnimada(codigo, tipoInicial) {
      api('GET', base() + '/unidades/' + encodeURIComponent(codigo) + '/animacoes').then(function (r) {
        var tipos = ['fluxo', 'caso', 'erros'].filter(function (t) { return r[t]; });
        if (!tipos.length) return;
        var ov = document.createElement('div');
        ov.className = 'es-an es-aqv';
        ov.innerHTML = '<header class="es-an-topo"><b>' + esc(r.titulo) + '</b><span class="es-an-acoes">' +
          tipos.map(function (t) { return '<button class="es-kd-bt" data-t="' + t + '">' + NOME_AN[t] + '</button>'; }).join('') +
          '<button class="es-kd-bt" id="es-aq-x" title="Fechar (Esc)">Fechar</button></span></header>' +
          '<div class="es-an-palco"><div class="es-aq-trilho" id="es-aq-trilho"></div></div>' +
          '<footer class="es-an-pe"><p id="es-aq-onde"></p><div class="es-an-bts"><button class="es-kd-bt" id="es-aq-rec">↺ Recomeçar</button><button class="es-kd-bt forte" id="es-aq-prox">Próximo ›</button></div></footer>';
        document.body.appendChild(ov);
        var antes = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        var trilho = ov.querySelector('#es-aq-trilho'), bProx = ov.querySelector('#es-aq-prox'), onde = ov.querySelector('#es-aq-onde'), quadros = [], i = -1, tipo = '';
        function avancar() {
          if (i >= quadros.length - 1) {
            var prox = tipos[tipos.indexOf(tipo) + 1];
            if (prox) abrir(prox); else fechar();
            return;
          }
          var qd = quadros[++i], d = document.createElement('div');
          d.innerHTML = qd.h;
          var no = d.firstChild;
          no.classList.add('entra');
          trilho.appendChild(no);
          if (no.scrollIntoView) no.scrollIntoView({ block: 'end', behavior: 'smooth' });
          setTimeout(function () { no.classList.remove('entra'); }, 30);
          var ultimo = i >= quadros.length - 1, seguinte = tipos[tipos.indexOf(tipo) + 1];
          bProx.textContent = ultimo ? (seguinte ? 'Ir para: ' + NOME_AN[seguinte] + ' ›' : 'Concluir') : (qd.bt || 'Próximo ›');
          onde.textContent = NOME_AN[tipo] + ' · ' + (i + 1) + ' de ' + quadros.length;
        }
        function abrir(t) {
          tipo = t; quadros = quadrosDe(t, r); i = -1; trilho.innerHTML = '';
          cada(ov, '[data-t]', function (b) { b.classList.toggle('forte', b.getAttribute('data-t') === t); });
          avancar();
        }
        function tecla(e) {
          if (e.key === 'Escape') fechar();
          else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avancar(); }
        }
        function tirar() { document.removeEventListener('keydown', tecla, true); document.documentElement.style.overflow = antes; if (ov.parentNode) ov.parentNode.removeChild(ov); }
        var soltar = sobreposto(tirar);
        function fechar() { tirar(); soltar(); }
        cada(ov, '[data-t]', function (b) { b.onclick = function () { abrir(b.getAttribute('data-t')); }; });
        bProx.onclick = avancar;
        ov.querySelector('#es-aq-rec').onclick = function () { abrir(tipo); };
        ov.querySelector('#es-aq-x').onclick = fechar;
        document.addEventListener('keydown', tecla, true);
        abrir(tipos.indexOf(tipoInicial) >= 0 ? tipoInicial : tipos[0]);
      }).catch(function (e) { window.alert(e.message); });
    }
    function animarMapa(titulo, txt) {
      estiloDosMapas();
      var ov = document.createElement('div');
      ov.className = 'es-an';
      ov.innerHTML = '<header class="es-an-topo"><b>' + esc(titulo) + '</b><span class="es-an-acoes">' +
        '<button class="es-kd-bt" id="es-an-voz" aria-pressed="false" title="Ler cada ponto em voz alta, com a voz do navegador">🔈 Voz desligada</button>' +
        '<button class="es-kd-bt" id="es-an-rec">↺ Recomeçar</button><button class="es-kd-bt" id="es-an-x" title="Fechar (Esc)">Fechar</button></span></header>' +
        '<div class="es-an-palco" id="es-an-palco"><div class="es-mapa-inline es-an-mapa">' + htmlDoMapa(titulo, txt) + '</div></div>' +
        '<footer class="es-an-pe"><p id="es-an-msg"></p><div class="es-an-bts"><button class="es-kd-bt" id="es-an-auto">⏸ Pausar</button><button class="es-kd-bt forte" id="es-an-prox">Próximo ›</button></div></footer>';
      document.body.appendChild(ov);
      var rolagemAntes = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      var passos = [], i = -1, auto = true, voz = false, timer = 0, fala = window.speechSynthesis || null;
      cada(ov, '.ramo', function (ramo) {
        var nos = ramo.querySelectorAll('.no');
        Array.prototype.forEach.call(nos, function (n) { n.classList.add('esc'); passos.push({ t: 'no', el: n }); });
        if (nos.length > 1) passos.push({ t: 'lembrar', ramo: ramo, nome: nos[0].querySelector('.rot').textContent }, { t: 'mostrar', ramo: ramo });
      });
      var msg = ov.querySelector('#es-an-msg'), bProx = ov.querySelector('#es-an-prox'), bAuto = ov.querySelector('#es-an-auto'), bVoz = ov.querySelector('#es-an-voz');
      function calar() { clearTimeout(timer); if (fala) { try { fala.cancel(); } catch (e) { /* sem voz */ } } }
      function agendar(ms) { clearTimeout(timer); if (auto) timer = setTimeout(avancar, ms); }
      function dizer(texto, depois) {
        if (!voz || !fala || !window.SpeechSynthesisUtterance) { agendar(Math.min(5200, 1100 + texto.length * 42)); return; }
        var u = new window.SpeechSynthesisUtterance(texto);
        u.lang = 'pt-BR'; u.rate = 1.05;
        u.onend = function () { agendar(depois || 450); };
        u.onerror = function () { agendar(1500); };
        fala.speak(u);
      }
      function avancar() {
        calar();
        if (i >= passos.length - 1) { fim(); return; }
        var p = passos[++i];
        bProx.textContent = 'Próximo ›';
        if (p.t === 'no') {
          p.el.classList.remove('esc');
          var rot = p.el.querySelector('.rot');
          if (rot.scrollIntoView) rot.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
          msg.textContent = rot.textContent;
          dizer(rot.textContent);
        } else if (p.t === 'lembrar') {
          var f = p.ramo.querySelector('.filhos');
          if (f) f.classList.add('apagado');
          msg.innerHTML = '<b>Sem olhar:</b> o que havia em “' + esc(p.nome) + '”? Diga em voz alta e toque em <b>Mostrar</b>.';
          bProx.textContent = 'Mostrar';
          if (voz && fala && window.SpeechSynthesisUtterance) { var u = new window.SpeechSynthesisUtterance('Sem olhar: o que havia em ' + p.nome + '?'); u.lang = 'pt-BR'; fala.speak(u); }
          // aqui a animação ESPERA: lembrar é o ponto, e ninguém lembra no ritmo de um cronômetro
        } else {
          var g = p.ramo.querySelector('.filhos');
          if (g) g.classList.remove('apagado');
          msg.textContent = 'Confira o que você lembrou.';
          agendar(2600);
        }
      }
      function fim() {
        msg.innerHTML = '<b>Mapa completo.</b> Feche e tente refazê-lo no papel, de memória — é assim que ele fica.';
        bProx.disabled = true; bAuto.disabled = true;
      }
      function recomecar() {
        calar(); i = -1; auto = true; bAuto.textContent = '⏸ Pausar'; bProx.disabled = false; bAuto.disabled = false;
        cada(ov, '.no', function (n) { n.classList.add('esc'); });
        cada(ov, '.filhos', function (f) { f.classList.remove('apagado'); });
        ov.querySelector('#es-an-palco').scrollTop = 0;
        avancar();
      }
      var soltarAnim = sobreposto(function () { fecharAnim(true); });
      function fecharAnim(peloVoltar) {
        if (peloVoltar !== true) soltarAnim();
        calar(); document.removeEventListener('keydown', tecla);
        document.documentElement.style.overflow = rolagemAntes;
        if (ov.parentNode) ov.parentNode.removeChild(ov);
      }
      function tecla(e) {
        if (!ov.isConnected) { document.removeEventListener('keydown', tecla); return; }
        if (e.key === 'Escape') fecharAnim();
        else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); avancar(); }
      }
      bProx.onclick = avancar;
      bAuto.onclick = function () { auto = !auto; bAuto.textContent = auto ? '⏸ Pausar' : '▶ Continuar sozinho'; if (auto) agendar(400); else calar(); };
      bVoz.onclick = function () {
        voz = !voz && !!fala; bVoz.setAttribute('aria-pressed', voz ? 'true' : 'false');
        bVoz.textContent = voz ? '🔊 Voz ligada' : (fala ? '🔈 Voz desligada' : '🔇 Este navegador não tem voz');
        if (!voz) { calar(); agendar(700); } // calar derruba o temporizador: a animação segue sem a voz
      };
      ov.querySelector('#es-an-rec').onclick = recomecar;
      ov.querySelector('#es-an-x').onclick = fecharAnim;
      document.addEventListener('keydown', tecla);
      avancar();
    }

    // ================= MAPAS: todos os mapas mentais num lugar só, por disciplina =================
    // O mesmo desenho do PDF, agora dentro da página. As regras do mapa são as de
    // CSS_MAPA (uma fonte só): aqui elas entram prefixadas, para não vazar nomes
    // curtos como .no e .rot para o resto do painel.
    function estiloDosMapas() {
      if (document.getElementById('es-mapa-css')) return;
      var ini = CSS_MAPA.indexOf('.mapa{'), fim = CSS_MAPA.indexOf('footer{');
      var regras = CSS_MAPA.slice(ini, fim).split('}').filter(function (r) { return r.indexOf('{') > 0; })
        .map(function (r) { return '.es-mapa-inline ' + r + '}'; }).join('');
      var st = document.createElement('style');
      st.id = 'es-mapa-css';
      st.textContent = '.es-mapa-inline{font:9.5pt/1.3 Arial,Helvetica,sans-serif;color:#111;overflow-x:auto;padding:6px 0 10px}' + regras + '.es-mapa-inline .mapa{zoom:.86}';
      document.head.appendChild(st);
    }
    function mapas(alvo) {
      estiloDosMapas();
      alvo.innerHTML = '<p class="al-sub">Carregando os mapas…</p>';
      api('GET', base() + '/mapas').then(function (r) {
        var foco = E.focoMapa || 'objetiva', comMapa = 0, aulas = 0;
        r.disciplinas.forEach(function (d) { comMapa += d.com_mapa; aulas += d.aulas; });
        alvo.innerHTML = '<div class="jr-caixa"><h3>Mapas mentais</h3>' +
          '<p class="al-sub">Todos os mapas do percurso, por disciplina e ponto do edital. <b>' + comMapa + '</b> de ' + aulas + ' aulas já têm mapa' +
          (comMapa < aulas ? '; os que faltam aparecem aqui assim que ficam prontos' : '') + '. Cada aula tem três versões, uma por tipo de prova.</p>' +
          '<div class="es-linha"><span class="al-fino">Ver os mapas para: </span>' + ['objetiva', 'escrita', 'oral'].map(function (f) {
            return '<button class="al-bt peq' + (f === foco ? '' : ' fan') + '" data-foco="' + f + '">' + FOCO[f] + '</button>';
          }).join('') + '</div></div>' +
          r.disciplinas.map(function (d) {
            return '<details class="es-acervo" data-disc="' + esc(d.codigo || '_metodo') + '"><summary><b>' + esc((d.codigo ? d.codigo + ' ' : '') + d.nome) + '</b><span class="al-fino"> · ' +
              (d.com_mapa ? d.com_mapa + ' mapa(s)' + (d.com_mapa < d.aulas ? ' de ' + d.aulas + ' aulas' : '') : 'mapas em preparação') + '</span></summary>' +
              '<div class="es-mp-corpo">' + (d.com_mapa ? '<p class="al-sub">Abrindo…</p>' : '<p class="al-fino">Os mapas desta disciplina ainda estão em preparação.</p>') + '</div></details>';
          }).join('');
        cada(alvo, '[data-foco]', function (b) { b.onclick = function () { E.focoMapa = b.getAttribute('data-foco'); mapas(alvo); }; });
        cada(alvo, 'details[data-disc]', function (dt) {
          dt.addEventListener('toggle', function () {
            if (!dt.open || dt.getAttribute('data-ok')) return;
            dt.setAttribute('data-ok', '1');
            var corpo = dt.querySelector('.es-mp-corpo'), cod = dt.getAttribute('data-disc');
            if (!corpo.querySelector('.al-sub')) return; // disciplina ainda sem mapa
            api('GET', base() + '/mapas?disciplina=' + encodeURIComponent(cod)).then(function (x) {
              var com = x.aulas.filter(function (a) { return a.mapas[foco]; });
              corpo.innerHTML = '<div class="es-linha"><button class="al-bt peq" data-pdf-disc="1">🖨️ PDF com os ' + com.length + ' mapas desta disciplina (' + FOCO[foco].toLowerCase() + ')</button></div>' +
                x.aulas.map(function (a) {
                  var item = a.itens.length ? '<b>' + esc(a.itens[0].codigo) + '</b> ' : '';
                  if (!a.mapas[foco]) return '<div class="es-mp-aula"><h4>' + item + esc(a.titulo) + '</h4><p class="al-fino">mapa em preparação</p></div>';
                  return '<div class="es-mp-aula"><div class="es-mp-cab"><h4>' + item + esc(a.titulo) + '</h4><span class="es-aula-bts">' +
                    '<button class="al-bt peq" data-anim="' + esc(a.codigo) + '">▶ Ver o mapa se desenhar</button>' +
                    '<button class="al-bt peq fan" data-pdf-aula="' + esc(a.codigo) + '">🧠 PDF (3 versões)</button>' +
                    '<button class="al-bt peq fan" data-un="' + esc(a.codigo) + '">Abrir a aula</button></span></div>' +
                    '<div class="es-mapa-inline">' + htmlDoMapa(a.titulo, a.mapas[foco]) + '</div></div>';
                }).join('');
              cada(corpo, '[data-un]', function (b) { b.onclick = function () { ir('unidade', b.getAttribute('data-un')); }; });
              cada(corpo, '[data-anim]', function (b) {
                b.onclick = function () {
                  var a = x.aulas.filter(function (y) { return y.codigo === b.getAttribute('data-anim'); })[0];
                  if (a && a.mapas[foco]) animarMapa(a.titulo, a.mapas[foco]);
                };
              });
              cada(corpo, '[data-pdf-aula]', function (b) { b.onclick = function () { abrirMapa(b.getAttribute('data-pdf-aula'), window.open('', '_blank')); }; });
              corpo.querySelector('[data-pdf-disc]').onclick = function () {
                var w = window.open('', '_blank');
                if (!w) return;
                escreverMapas(w, 'Mapas mentais — ' + x.nome + ' — ' + FOCO[foco], com.map(function (a) { return paginaDoMapa(a.titulo, foco, a.mapas[foco], a.versao); }).join(''));
              };
            }).catch(function (e) { falha(corpo, e); });
          });
        });
      }).catch(function (e) { falha(alvo, e); });
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
      // `aberta=1`: é a tela da aula que conta como "abriu a aula" (o Continuar da biblioteca volta a ela)
      api('GET', base() + '/unidades/' + encodeURIComponent(codigo) + '?aberta=1' + (nivel ? '&nivel=' + nivel : '')).then(function (u) {
        var acao = { pratica: 1, aplicacao: 1, desafio: 1, recordacao: 1 }, tent = u.tentativas || {};
        // ADR-0005: o seletor só aparece quando a aula tem algum nível além do 100
        var sel = u.niveis && u.niveis.length > 1 ? '<p class="es-niveis"><span class="al-fino">Quanto ler: </span>' + u.niveis.map(function (n) {
          return '<button class="al-bt peq' + (n.nivel === u.nivel ? '' : ' fan') + '" data-nv="' + n.nivel + '"' + (n.disponivel ? '' : ' disabled') + ' title="' + (n.desatualizado ? 'resumo de versão anterior da aula' : '') + '">' + n.nivel + ' %</button>';
        }).join(' ') + (u.nivel_motivo ? '<span class="al-fino"> ' + esc(u.nivel_motivo) + '</span>' : '') + '</p>' : '';
        alvo.innerHTML = '<div class="jr-caixa es-aula"><p class="al-rotulo">Aula ativa' + (u.tempo_min ? ' · cerca de ' + horas(u.tempo_min) : '') + (u.nivel !== 100 ? ' · versão ' + u.nivel + ' %' : '') + '</p><h3>' + esc(u.titulo) +
          (u.status === 'rascunho' ? ' <span class="marca-rasc">rascunho</span>' : '') + '</h3>' +
          // a videoaula abre a aula (decisão do Augusto): primeiro o vídeo, depois o desafio e o texto
          (u.video ? '<div class="es-video" id="es-un-video"><p class="al-fino">Carregando a videoaula…</p></div>' : '') +
          '<div class="es-un-barra"><span class="al-rotulo">Nesta aula</span>' +
          ((u.animada || []).length ? '<button class="al-bt" id="es-un-anim">🧭 Aula interativa — passo a passo, caso e erros da banca</button>' : '') +
          (u.vespera && u.vespera.objetiva && u.vespera.objetiva.mapa ? '<button class="al-bt fan" id="es-un-mapa2">🧠 Mapa mental</button>' : '') +
          '<button class="al-bt fan" id="es-un-livro">📖 Ler como livro</button>' +
          '<button class="al-bt fan" id="es-un-pr2">✍️ Praticar esta matéria</button>' +
          '<button class="al-bt fan" id="es-un-vt2">← Voltar</button></div>' +
          '<p class="al-rotulo es-un-txt">Texto da aula</p>' + sel +
          u.blocos.map(function (b) {
            return '<section class="es-bloco ' + b.tipo + '"><h4>' + esc(b.titulo || BLOCO[b.tipo]) + '</h4><div class="es-un-ler">' + textoMarcado(b.texto, [], u.destaques) + '</div>' +
              (b.criterio ? '<p class="al-fino"><b>Critério:</b> ' + esc(b.criterio) + '</p>' : '') +
              (acao[b.tipo] ? '<textarea class="es-ta" data-n="' + b.n + '" rows="4" maxlength="8000" placeholder="Escreva a sua tentativa aqui, antes de ver a solução.">' + esc((tent[b.n] || {}).texto || '') + '</textarea>' +
                '<p class="al-fino es-salvo"><span data-salvo="' + b.n + '">' + (tent[b.n] ? 'Guardada no seu caderno em ' + dataBR(String(tent[b.n].atualizado_em).slice(0, 10)) + '.' : 'O que você escrever fica guardado no seu caderno.') + '</span></p>' +
                (b.tem_solucao ? '<div class="es-linha"><button class="al-bt peq fan" data-sol="' + b.n + '">Ver a solução</button><span class="al-fino" data-msg="' + b.n + '">A solução aparece depois da sua tentativa.</span></div><div class="es-sol" data-out="' + b.n + '"></div>' : '') : '') +
              '</section>';
          }).join('') +
          // o quiz mora DENTRO da aula, como nos outros cursos; as questões vêm do banco e são respondidas aqui
          '<section class="es-bloco es-quiz" id="es-un-quiz"><h4>Quiz desta aula</h4><div id="es-un-quiz-cx"><p class="al-sub">Procurando as questões desta aula…</p></div></section>' +
          '<section class="es-bloco es-nota-aula"><h4>Minhas anotações desta aula</h4>' +
          '<textarea class="es-ta" id="es-un-nota" rows="4" maxlength="6000" placeholder="O que você quer lembrar desta aula. Salva sozinho.">' + esc((u.nota || {}).texto || '') + '</textarea>' +
          '<div class="es-linha"><span class="al-fino" id="es-un-nota-st">' + ((u.nota || {}).texto ? 'Salva em ' + dataBR(String(u.nota.atualizado_em).slice(0, 10)) + '.' : 'Fica no seu caderno, com as tentativas e as marcações.') + '</span>' +
          '<button class="al-bt peq fan" id="es-un-cad">📓 Abrir o meu caderno</button></div></section>' +

          (u.fontes.length ? '<details class="es-fontes"><summary>Fontes</summary><ul>' + u.fontes.map(function (f) {
            return '<li>' + esc(f.titulo) + (f.consultado_em ? ' — consultado em ' + dataBR(f.consultado_em) : '') + '</li>';
          }).join('') + '</ul></details>' : '') + vespera(u) +
          '<div class="es-linha">' + (u.vespera && u.vespera.objetiva && u.vespera.objetiva.mapa ? '<button class="al-bt fan" id="es-un-mapa">🧠 Mapa mental</button>' : '') + '<button class="al-bt" id="es-un-pr">Praticar esta matéria</button><button class="al-bt fan" id="es-un-vt">← Voltar</button></div></div>';
        if (u.video && el('es-un-video')) {
          api('GET', '/media/' + encodeURIComponent(u.video.media_id) + '/link').then(function (r) {
            var cx = el('es-un-video');
            if (!cx) return; // o aluno já saiu da aula
            cx.innerHTML = '<video controls playsinline preload="metadata" src="' + esc(r.url) + '"></video>' +
              '<p class="al-fino">Videoaula' + (u.video.duracao_seg ? ' · ' + Math.round(u.video.duracao_seg / 60) + ' min' : '') + '<span id="es-un-visto">' + (u.video.assistido ? ' · <b>✓ assistida</b>' : u.video.posicao_seg > 10 ? ' · continua de onde você parou' : '') + '</span> · a aula para e pergunta: responda antes de ouvir a resposta.</p>';
            ligarVideoDaAula(cx, codigo, u.video);
          }).catch(function (e) { var cx = el('es-un-video'); if (cx) cx.innerHTML = '<p class="al-fino">Não foi possível carregar a videoaula: ' + esc(e.message) + '</p>'; });
        }
        cada(alvo, '[data-nv]', function (b) { b.onclick = function () { unidade(alvo, codigo, b.getAttribute('data-nv')); }; });
        ligarCadernoDaAula(alvo, codigo);
        quizDaAula(el('es-un-quiz-cx'), codigo);
        if (el('es-un-mapa')) el('es-un-mapa').onclick = function () { abrirMapa(codigo, window.open('', '_blank')); };
        cada(alvo, '[data-sol]', function (b) {
          b.onclick = function () {
            var n = b.getAttribute('data-sol'), ta = alvo.querySelector('textarea[data-n="' + n + '"]'), msg = alvo.querySelector('[data-msg="' + n + '"]');
            api('POST', base() + '/unidades/' + encodeURIComponent(codigo) + '/blocos/' + n + '/solucao', { tentativa: ta.value }).then(function (r) {
              alvo.querySelector('[data-out="' + n + '"]').innerHTML = '<h4>Solução comentada</h4><div class="es-un-ler">' + textoMarcado(r.solucao, [], []) + '</div>' + '<p class="al-fino">Compare com o que você escreveu e corrija uma frase da sua tentativa.</p>';
              b.disabled = true; msg.textContent = '';
              var st = alvo.querySelector('[data-salvo="' + n + '"]'); if (st) st.textContent = '✓ Tentativa guardada no seu caderno.';
            }).catch(function (e) { msg.textContent = e.message; msg.className = 'es-msg-erro'; });
          };
        });
        el('es-un-pr').onclick = function () { ir('praticar', u.competencias[0]); };
        el('es-un-vt').onclick = voltarDaAula;
        el('es-un-vt2').onclick = voltarDaAula;
        el('es-un-pr2').onclick = function () { ir('praticar', u.competencias[0]); };
        if (el('es-un-anim')) el('es-un-anim').onclick = function () { aulaAnimada(codigo); };
        el('es-un-livro').onclick = function () {
          var m = materias()[(u.competencias || [])[0]];
          lerDisciplina(alvo, (m && m.cod) || '_metodo', { unidade: codigo }, function () { ir('unidade', codigo); });
        };
        if (el('es-un-mapa2')) el('es-un-mapa2').onclick = function () { abrirMapa(codigo, window.open('', '_blank')); };
      }).catch(function (e) { falha(alvo, e); });
    }

    // ---- o que a aula ganhou dos outros cursos: a tentativa que fica guardada, a nota da aula, o quiz e o vídeo que lembra onde parou ----
    // salva sozinho: um tempo depois da última tecla e ao sair do campo; `dizer` mostra "Salvando… / ✓ Salvo"
    function salvarSozinho(campo, dizer, enviar) {
      var timer = null, ultimo = campo.value;
      function agora() {
        clearTimeout(timer); timer = null;
        if (campo.value === ultimo) return;
        var v = campo.value; dizer('Salvando…');
        enviar(v).then(function () { ultimo = v; dizer('✓ Salvo'); }).catch(function (e) { dizer(e.message); });
      }
      campo.oninput = function () { clearTimeout(timer); timer = setTimeout(agora, 1200); };
      campo.onblur = agora;
    }
    function ligarCadernoDaAula(alvo, codigo) {
      var un = base() + '/unidades/' + encodeURIComponent(codigo);
      cada(alvo, 'textarea[data-n]', function (ta) {
        var n = ta.getAttribute('data-n'), st = alvo.querySelector('[data-salvo="' + n + '"]');
        salvarSozinho(ta, function (m) { if (st) st.textContent = m; }, function (v) { return api('PUT', un + '/blocos/' + n + '/tentativa', { texto: v }); });
      });
      var nota = el('es-un-nota');
      if (nota) salvarSozinho(nota, function (m) { if (el('es-un-nota-st')) el('es-un-nota-st').textContent = m; }, function (v) { return api('PUT', un + '/nota', { texto: v }); });
      if (el('es-un-cad')) el('es-un-cad').onclick = function () { ir('caderno'); };
    }
    // QUIZ DESTA AULA: até 5 questões do banco, respondidas aqui mesmo — pelas rotas do Praticar
    function quizDaAula(cx, codigo) {
      if (!cx) return;
      api('GET', base() + '/unidades/' + encodeURIComponent(codigo) + '/quiz').then(function (r) {
        if (!el('es-un-quiz')) return; // o aluno já saiu da aula
        if (!r.total) { cx.innerHTML = '<p class="al-sub">Esta aula ainda não tem questões no banco. Quando houver, elas aparecem aqui.</p>'; return; }
        var n = r.questoes.length, i = 0;
        cx.innerHTML = '<p class="al-sub">Esta aula tem <b>' + r.total + ' questão(ões)</b> no banco' + (r.ineditas ? ', ' + r.ineditas + ' nova(s) para você' : ', todas já respondidas por você') + '. ' +
          (r.total > n ? 'Aqui vão ' + n + ' — as que você ainda não viu vêm primeiro.' : 'As que você ainda não viu vêm primeiro.') + '</p>' +
          '<div class="es-linha"><button class="al-bt peq fan" id="es-qz-todas">✍️ Praticar todas (' + r.total + ')</button></div><div id="es-qz-q"></div>';
        el('es-qz-todas').onclick = function () { ir('praticar', r.competencia); };
        var out = el('es-qz-q');
        (function mostrar() {
          if (i >= n) {
            out.innerHTML = '<p class="al-sub">Você respondeu ' + (n > 1 ? 'as ' + n + ' questões' : 'a questão') + ' do quiz desta aula.' + (r.total > n ? ' Há mais ' + (r.total - n) + ' no banco.' : '') + ' Acertar de novo a mesma questão não conta como domínio.</p>' +
              '<div class="es-linha">' + (r.total > n ? '<button class="al-bt peq" id="es-qz-mais">Mais questões desta aula</button>' : '') + '<button class="al-bt peq fan" id="es-qz-tudo">Praticar todas</button></div>';
            if (el('es-qz-mais')) el('es-qz-mais').onclick = function () { quizDaAula(cx, codigo); };
            el('es-qz-tudo').onclick = function () { ir('praticar', r.competencia); };
            return;
          }
          var q = r.questoes[i];
          questaoNaTela(out, q, '<p class="al-fino">Questão ' + (i + 1) + ' de ' + n + (q.ja_vista ? ' · <b>você já respondeu esta</b>' : ' · nova para você') + '</p>',
            i + 1 < n ? 'Próxima questão' : 'Concluir o quiz', function () { i++; mostrar(); if (cx.scrollIntoView) cx.scrollIntoView({ block: 'start' }); });
        })();
      }).catch(function (e) { falha(cx, e); });
    }
    // VÍDEO: retoma do ponto em que parou e registra "assistiu" — a posição mora no servidor, por aula
    function ligarVideoDaAula(cx, codigo, video) {
      var v = cx.querySelector('video'); if (!v) return;
      var ultimo = -99, marcou = !!video.assistido, pediu90 = false;
      function gravar(pos) {
        api('PUT', base() + '/unidades/' + encodeURIComponent(codigo) + '/video', { posicao_seg: Math.floor(pos || 0), duracao_seg: Math.floor(v.duration || 0) }).then(function (x) {
          if (x.assistido && !marcou) { marcou = true; if (el('es-un-visto')) el('es-un-visto').innerHTML = ' · <b>✓ assistida</b>'; carregar(); }
        }).catch(function () { /* a posição é conveniência: sem ela a aula segue igual */ });
      }
      v.addEventListener('loadedmetadata', function () {
        var p = Number(video.posicao_seg) || 0;
        if (p > 10 && (!v.duration || p < v.duration - 15)) { try { v.currentTime = p; } catch (e) { /* o navegador recusou: começa do início */ } }
      });
      v.addEventListener('timeupdate', function () {
        if (!v.duration) return;
        if (Math.abs(v.currentTime - ultimo) > 10) { ultimo = v.currentTime; gravar(v.currentTime); }
        else if (!marcou && !pediu90 && v.currentTime / v.duration >= 0.9) { pediu90 = true; gravar(v.currentTime); }
      });
      v.addEventListener('pause', function () { if (v.currentTime > 1) gravar(v.currentTime); });
      v.addEventListener('ended', function () { gravar(v.duration); });
    }

    // ================= MEU CADERNO: tudo o que o aluno escreveu no percurso, por disciplina e aula =================
    // Tentativas dos blocos, a nota de cada aula, as marcações com nota e as anotações do caderno de erros.
    // A busca filtra na tela; a versão para imprimir abre para LER (mesmo padrão do mapa mental): o botão
    // "Imprimir ou salvar em PDF" é do aluno — a página nunca chama a impressão sozinha.
    var NOME_TENT = { desafio: 'Desafio', recordacao: 'Recordar', pratica: 'Prática', aplicacao: 'Aplicação' };
    function aulaDoCaderno(a, paraPapel) {
      var h = '';
      if (a.nota) h += '<div class="cad-item"><p class="cad-rot">Minhas anotações desta aula</p><div class="cad-meu">' + texto(a.nota.texto) + '</div></div>';
      h += a.tentativas.map(function (t) {
        return '<div class="cad-item"><p class="cad-rot">' + esc(NOME_TENT[t.tipo] || 'Tentativa') + (t.titulo ? ' — ' + esc(t.titulo) : '') + ' · ' + dataBR(String(t.em).slice(0, 10)) + '</p>' +
          (t.enunciado ? '<div class="cad-enun">' + texto(t.enunciado) + '</div>' : '') + '<div class="cad-meu">' + texto(t.texto) + '</div></div>';
      }).join('');
      h += a.marcacoes.map(function (m) {
        return '<div class="cad-item"><p class="cad-rot">Marcação na leitura · ' + dataBR(String(m.em).slice(0, 10)) + '</p><blockquote class="mt-' + esc(m.cor) + '">' + esc(m.texto) + '</blockquote><div class="cad-meu">✎ ' + esc(m.nota) + '</div></div>';
      }).join('');
      h += a.anotacoes.map(function (q) {
        return '<div class="cad-item"><p class="cad-rot">Anotação do caderno de erros · ' + dataBR(String(q.em).slice(0, 10)) + '</p><div class="cad-enun">' + texto(q.enunciado) + '</div><div class="cad-meu">' + texto(q.texto) + '</div></div>';
      }).join('');
      return paraPapel ? '<section class="cad-aula"><h3>' + esc(a.titulo) + '</h3>' + h + '</section>'
        : '<div class="jr-caixa es-cad-aula"><div class="es-linha"><h4>' + esc(a.titulo) + '</h4>' + (a.codigo ? '<button class="es-link" data-un="' + esc(a.codigo) + '">abrir a aula</button>' : '') + '</div>' + h + '</div>';
    }
    var CSS_CADERNO = '@page{size:A4 portrait;margin:14mm}body{font:11pt/1.5 Georgia,"Times New Roman",serif;color:#1d2433;max-width:820px;margin:20px auto;padding:0 18px}' +
      'header{border-bottom:3px solid #1B2A4A;padding-bottom:10px;margin-bottom:18px}header p{margin:0;font:600 9pt Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#B45309}' +
      'h1{font:700 20pt Arial,sans-serif;color:#1B2A4A;margin:4px 0}h2{font:700 13pt Arial,sans-serif;color:#1B2A4A;border-bottom:1px solid #d9dee8;padding-bottom:4px;margin:22px 0 8px}' +
      'h3{font:700 11.5pt Arial,sans-serif;margin:14px 0 6px}.cad-aula{break-inside:auto}.cad-item{margin:0 0 10px;break-inside:avoid}' +
      '.cad-rot{font:700 8pt Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#159A78;margin:8px 0 3px}' +
      '.cad-enun{color:#5b6474;font-size:10pt;border-left:3px solid #d9dee8;padding-left:9px}.cad-enun p,.cad-meu p{margin:0 0 5px}' +
      '.cad-meu{border:1px dashed #b9c1d0;border-radius:6px;padding:7px 10px;background:#fbfcfe}blockquote{margin:0 0 5px;padding:5px 9px;background:#fff7d6;border-radius:4px}' +
      '.barra-mapa{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:10px 0;background:#fff;border-bottom:1px solid #dde2ec;margin-bottom:12px}' +
      '.barra-mapa button{font:600 11pt Arial,sans-serif;padding:8px 14px;border-radius:8px;border:1.5px solid #1B2A4A;background:#1B2A4A;color:#fff;cursor:pointer}' +
      '.barra-mapa button.fan{background:#fff;color:#1B2A4A}@media print{.barra-mapa{display:none}body{margin:0;padding:0}}';
    function escreverCaderno(w, r) {
      var corpo = r.disciplinas.map(function (d) { return '<h2>' + esc(d.nome) + '</h2>' + d.aulas.map(function (a) { return aulaDoCaderno(a, true); }).join(''); }).join('') +
        (r.avulsas.length ? '<h2>Outras questões</h2>' + aulaDoCaderno({ titulo: 'Anotações de questões sem aula', tentativas: [], marcacoes: [], anotacoes: r.avulsas }, true) : '');
      w.document.open();
      w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Meu caderno — ' + esc(r.escopo) + '</title><style>' + CSS_CADERNO + '</style></head><body>' +
        '<div class="barra-mapa"><button id="cd-imprimir">🖨️ Imprimir ou salvar em PDF</button><button id="cd-fechar" class="fan">Fechar</button></div>' +
        '<header><p>Villela Academy · Meu caderno</p><h1>' + esc(r.escopo) + '</h1><div>' + esc(r.aluno) + ' · ' + new Date().toLocaleDateString('pt-BR') + '</div></header>' +
        (corpo || '<p>O caderno ainda está em branco.</p>') + '</body></html>');
      w.document.close(); w.focus();
      // os cliques são ligados daqui (script escrito dentro da janela seria barrado pela política da página)
      var bi = w.document.getElementById('cd-imprimir'), bf = w.document.getElementById('cd-fechar');
      if (bi) bi.onclick = function () { w.print(); };
      if (bf) bf.onclick = function () { w.close(); };
    }
    function caderno(alvo) {
      var antes = E.antesDoCaderno;
      api('GET', base() + '/caderno').then(function (r) {
        var t = r.total, n = t.tentativas + t.notas + t.marcacoes + t.anotacoes;
        alvo.innerHTML = '<div class="jr-caixa"><p class="al-rotulo">Para rever e imprimir</p><h3>Meu caderno</h3>' +
          '<p class="al-sub">' + (n ? 'Tudo o que você escreveu neste percurso: ' + t.tentativas + ' tentativa(s) nos exercícios das aulas, ' + t.notas + ' aula(s) com anotação, ' + t.marcacoes + ' marcação(ões) com nota e ' + t.anotacoes + ' anotação(ões) do caderno de erros. Só você vê.'
            : 'O caderno ainda está em branco. Ele se enche sozinho: com o que você escreve nos exercícios de cada aula (antes de ver a solução), com "Minhas anotações desta aula", com as marcações da leitura que têm nota e com as anotações do caderno de erros.') + '</p>' +
          '<div class="es-linha">' + (n ? '<label class="es-campo es-cad-busca">Buscar no caderno<input type="search" id="es-cad-busca" placeholder="uma palavra, um artigo, uma súmula…"></label>' +
            '<button class="al-bt fan" id="es-cad-pdf">🖨️ Abrir para imprimir ou salvar em PDF</button>' : '') +
          (antes && antes.aba && antes.aba !== 'caderno' ? '<button class="al-bt fan" id="es-cad-volta">← Voltar para onde eu estava</button>' : '') + '</div><p class="al-fino" id="es-cad-achou"></p></div>' +
          r.disciplinas.map(function (d) {
            return '<div class="es-cad-disc"><h3 class="es-cad-h">' + esc(d.nome) + '</h3>' + d.aulas.map(function (a) { return aulaDoCaderno(a); }).join('') + '</div>';
          }).join('') +
          (r.avulsas.length ? '<div class="es-cad-disc"><h3 class="es-cad-h">Outras questões</h3>' + aulaDoCaderno({ titulo: 'Anotações de questões sem aula', tentativas: [], marcacoes: [], anotacoes: r.avulsas }) + '</div>' : '');
        cada(alvo, '[data-un]', function (b) { b.onclick = function () { ir('unidade', b.getAttribute('data-un')); }; });
        if (el('es-cad-volta')) el('es-cad-volta').onclick = function () { ir(antes.aba, antes.arg); };
        if (el('es-cad-pdf')) el('es-cad-pdf').onclick = function () { var w = window.open('', '_blank'); if (w) escreverCaderno(w, r); }; // a janela abre no clique
        if (el('es-cad-busca')) el('es-cad-busca').oninput = function () {
          var f = this.value.toLowerCase().trim(), achou = 0;
          cada(alvo, '.es-cad-aula', function (cx) { var ok = !f || cx.textContent.toLowerCase().indexOf(f) >= 0; cx.style.display = ok ? '' : 'none'; if (ok) achou++; });
          cada(alvo, '.es-cad-disc', function (d) { d.style.display = d.querySelector('.es-cad-aula:not([style*="none"])') ? '' : 'none'; });
          el('es-cad-achou').textContent = f ? (achou ? achou + ' aula(s) com "' + this.value.trim() + '".' : 'Nada no caderno com "' + this.value.trim() + '".') : '';
        };
      }).catch(function (e) { falha(alvo, e); });
    }

    // ================= CONCLUSÃO DO CURSO: o que falta para o certificado, e a emissão =================
    // O critério é do servidor (estudo/aluno.js › conclusao): todas as aulas do percurso estudadas e um simulado
    // completo enviado. A aula-casca do curso não conta. É certificado de CONCLUSÃO, de curso livre.
    // ETAPA 2 (nível e selos do Estude): o cartão de nível entra ao lado desta caixa e na barra do curso —
    // `botoesDaBarra` é o ponto de extensão; o XP da jornada comum (por aula do curso) não vale aqui.
    function caixaConclusao() {
      var k = E.painel && E.painel.conclusao;
      if (!k) return '';
      return '<div class="jr-caixa es-concl"><h3>Certificado de conclusão</h3>' +
        '<p class="al-sub">Curso livre. Certificado emitido pela Villela Academy, sem validade para o MEC. Sai quando você estuda todas as aulas do percurso (responde ao menos uma questão ou um card de cada) e envia um simulado completo.</p>' +
        '<table class="es-tab"><tr><td>Aulas estudadas</td><td class="n">' + k.estudadas + ' de ' + k.total_aulas + '</td></tr>' +
        '<tr><td>Simulados completos enviados</td><td class="n">' + k.provas_enviadas + '</td></tr></table>' +
        (k.certificado ? '<div class="es-linha"><a class="al-bt" href="/academy/certificados/' + esc(k.certificado) + '" target="_blank" rel="noopener">🎓 Ver o meu certificado</a></div>'
          : k.cumprido ? '<div class="es-linha"><button class="al-bt" data-cert="1">🎓 Emitir certificado</button><span class="al-fino" data-cert-msg="1"></span></div>'
          : '<p class="es-aviso">' + (k.total_aulas ? (k.faltam_aulas + k.faltam_provas > 1 ? 'Faltam ' : 'Falta ') + [k.faltam_aulas ? k.faltam_aulas + (k.faltam_aulas > 1 ? ' aulas' : ' aula') : '', k.faltam_provas ? k.faltam_provas + (k.faltam_provas > 1 ? ' simulados' : ' simulado') : ''].filter(Boolean).join(' e ') + '.' : esc(k.falta_txt)) + '</p>' +
            '<div class="es-linha">' + (k.faltam_aulas ? '<button class="al-bt peq fan" data-concl-ir="aulas">Ir para as aulas</button>' : '') + (k.faltam_provas ? '<button class="al-bt peq fan" data-concl-ir="prova">Fazer um simulado</button>' : '') + '</div>') + '</div>';
    }
    function emitirCertificado(bt, msg) {
      var w = window.open('', '_blank'); // no clique, antes da rede — senão o navegador barra como pop-up
      bt.disabled = true;
      api('POST', '/aluno/cursos/' + E.pid + '/certificado').then(function (r) {
        if (w) w.location = r.url; else location.href = r.url;
        carregar(function () { botoesDaBarra(); });
      }).catch(function (e) { if (w) w.close(); bt.disabled = false; if (msg) msg.textContent = e.message; else alert(e.message); });
    }
    function ligarConclusao(alvo) {
      cada(alvo, '[data-cert]', function (b) { b.onclick = function () { emitirCertificado(b, alvo.querySelector('[data-cert-msg]')); }; });
      cada(alvo, '[data-concl-ir]', function (b) { b.onclick = function () { ir(b.getAttribute('data-concl-ir')); }; });
    }
    // os botões que o próprio Estude põe na barra do curso (os do PRODUTO — audiobook, material, desafio… — vêm de quem abre)
    function botoesDaBarra() {
      var cx = el('es-barra-es'), k = E.painel && E.painel.conclusao;
      if (!cx) return;
      cx.innerHTML = '<button class="al-bt peq fan" id="es-bar-jr">🏅 Minha jornada</button><button class="al-bt peq fan" id="es-bar-fer">🧰 Ferramentas</button><button class="al-bt peq fan" id="es-bar-cad">📓 Meu caderno</button>' +
        (k && k.certificado ? '<a class="al-bt peq fan" href="/academy/certificados/' + esc(k.certificado) + '" target="_blank" rel="noopener">🎓 Meu certificado</a>'
          : k && k.cumprido ? '<button class="al-bt peq" id="es-bar-cert">🎓 Emitir certificado</button>' : '');
      el('es-bar-cad').onclick = function () { ir('caderno'); };
      el('es-bar-jr').onclick = function () { ir('jornada'); };
      el('es-bar-fer').onclick = function () { ir('ferramentas'); };
      if (el('es-bar-cert')) el('es-bar-cert').onclick = function () { emitirCertificado(el('es-bar-cert')); };
    }

    // ================= MINHA JORNADA (etapa 2): nível, selos, medalhas, diagnóstico × teste final =================
    // Tudo vem pronto do servidor (estudo/jornada-estude.js), derivado das evidências: aqui só se mostra. O nível
    // mede o que foi DEMONSTRADO — a tela diz isso com todas as letras, e diz o que falta em número de competências.
    // Os eixos do programa continuam separados, cada um com a sua contagem: nenhum percentual único.
    var GRAU = { ouro: ['🥇', 'Ouro'], prata: ['🥈', 'Prata'], bronze: ['🥉', 'Bronze'], '': ['○', 'Ainda sem selo'] };
    var LEITURA_COR = { comece_por_aqui: 'ambar', base_razoavel: 'azul', ponto_forte: 'verde', sem_questoes: 'cinza' };
    var TIPO_AVAL = { diagnostico: 'Diagnóstico de entrada', teste_final: 'Teste final' };
    function ehAvaliacao(t) { return !!t && (t.modo === 'diagnostico' || t.modo === 'teste_final'); }
    function num(x) { return String(Math.round(Number(x) * 1000) / 1000).replace('.', ','); }
    function voltarDaPorta() {
      var a = E.antesDaPorta || { aba: 'hoje' };
      ir(a.aba, a.arg);
      if (a.y > 0 && !(LISTAS[a.aba] && !a.arg)) reporRolagem(a.aba, a.y); // as listas repõem o próprio lugar
    }
    function botaoVoltarDaPorta() { return '<button class="al-bt fan" data-volta-porta="1">← Voltar para onde eu estava</button>'; }
    function ligarVoltarDaPorta(alvo) { cada(alvo, '[data-volta-porta]', function (b) { b.onclick = voltarDaPorta; }); }
    // começa (ou retoma) o diagnóstico ou o teste final e abre a mesma tela de prova — sem relógio
    function iniciarAvaliacao(tipo, msg) {
      api('POST', base() + '/diagnostico', { tipo: tipo }).then(function (t) {
        ir('jornada', { tentativa: t }); // a prova abre DENTRO da jornada: é para lá que o F5 e o "continuar depois" devolvem
      }).catch(function (e) { if (msg) msg.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; else alert(e.message); });
    }
    function linhasDeLeitura(ds) {
      return '<table class="es-tab es-jr-tab">' + ds.map(function (d) {
        return '<tr><td>' + esc(d.nome) + '</td><td class="n">' + (d.total ? d.acertos + ' de ' + d.total : '—') + '</td><td class="n"><span class="es-selo ' + (LEITURA_COR[d.leitura] || 'cinza') + '">' + esc(d.leitura_txt) + '</span></td></tr>';
      }).join('') + '</table>';
    }
    function ordemSugeridaTxt(ordem) {
      return '<ol class="es-jr-ordem">' + ordem.map(function (d) { return '<li>' + esc(d.nome) + ' <span class="al-fino">· ' + (d.total ? d.acertos + ' de ' + d.total + ' · ' : '') + esc(d.leitura_txt.toLowerCase()) + '</span></li>'; }).join('') + '</ol>';
    }
    // a caixa do diagnóstico e do teste final, com o antes × depois
    function caixaAvaliacao(a) {
      if (!a || !a.disponivel) return '';
      var d = a.diagnostico, f = a.teste_final, n = a.por_disciplina * a.disciplinas;
      var h = '<div class="jr-caixa es-jr-aval" id="es-jr-aval"><p class="al-rotulo">Diagnóstico × teste final</p><h3>Por onde começar, e quanto você evoluiu</h3>';
      if (d.aberto) h += '<p>Diagnóstico em andamento: <b>' + d.aberto.respondidas + ' de ' + d.aberto.total + '</b> respondidas. As respostas estão salvas; ele fica aberto até ' + dataBR(String(d.aberto.valido_ate).slice(0, 10)) + '.</p>' +
        '<div class="es-linha"><button class="al-bt" data-aval="diagnostico">Continuar o diagnóstico</button><span data-aval-msg="1"></span></div>';
      else if (!d.feito) h += '<p class="al-sub">Uma prova curta, com até ' + a.por_disciplina + ' questões de cada disciplina do percurso (cerca de ' + n + ' no total). Não tem relógio: responda no seu ritmo, pare quando quiser e continue depois. No fim, você vê como foi em cada disciplina e por onde vale começar.</p>' +
        '<p class="al-fino">As respostas contam como qualquer resposta sua (entram no seu desempenho e no caderno de erros). O diagnóstico é feito uma vez; no fim do percurso, o teste final repete o molde com outras questões, para comparar.</p>' +
        '<div class="es-linha"><button class="al-bt" data-aval="diagnostico">Começar o diagnóstico</button><span data-aval-msg="1"></span></div>';
      else {
        h += '<h4>Diagnóstico de entrada · ' + dataBR(String(d.resultado.enviado_em).slice(0, 10)) + ' · ' + d.resultado.acertos + ' de ' + d.resultado.total + '</h4>' + linhasDeLeitura(d.resultado.disciplinas) +
          '<h4>Ordem sugerida de estudo</h4>' + ordemSugeridaTxt(d.ordem_sugerida) +
          '<p class="al-fino">Com ' + a.por_disciplina + ' questões por disciplina, o diagnóstico aponta por onde começar — não mede o domínio da disciplina. A ordem é uma sugestão: o seu Plano continua como você o montou.</p>';
      }
      h += '<h4>Teste final</h4>';
      if (f.aberto) h += '<p>Teste final em andamento: <b>' + f.aberto.respondidas + ' de ' + f.aberto.total + '</b> respondidas.</p><div class="es-linha"><button class="al-bt" data-aval="teste_final">Continuar o teste final</button><span data-aval-msg="1"></span></div>';
      else if (!f.liberado) h += '<p class="al-sub">Abre quando você tiver estudado ' + f.pct_exigido + ' % das aulas do percurso: até aqui, ' + f.aulas_estudadas + ' de ' + f.total_aulas + ' (' + (f.faltam_aulas > 1 ? 'faltam ' + f.faltam_aulas + ' aulas' : 'falta 1 aula') + '). É o mesmo molde do diagnóstico, com outras questões.</p>';
      else h += (f.resultado ? '<p>Último teste final em ' + dataBR(String(f.resultado.enviado_em).slice(0, 10)) + ': <b>' + f.resultado.acertos + ' de ' + f.resultado.total + '</b>.</p>' : '<p class="al-sub">Liberado: você já estudou ' + f.pct_aulas + ' % das aulas. Mesmo molde do diagnóstico, com outras questões sempre que houver.</p>') +
        (f.pode_refazer ? '<div class="es-linha"><button class="al-bt' + (f.resultado ? ' fan' : '') + '" data-aval="teste_final">' + (f.resultado ? 'Refazer o teste final' : 'Fazer o teste final') + '</button><span data-aval-msg="1"></span></div>'
          : '<p class="al-fino">Para refazer, espere até ' + dataBR(f.pode_refazer_em) + ' (intervalo de ' + f.intervalo_dias + ' dias entre um teste final e outro).</p>');
      if (a.evolucao.length) h += '<h4>Antes × depois, por disciplina</h4><table class="es-tab es-jr-tab"><tr><th>Disciplina</th><th class="n">Diagnóstico</th><th class="n">Teste final</th><th class="n">Variação</th></tr>' + a.evolucao.map(function (x) {
        var v = x.variacao_pp;
        return '<tr><td>' + esc(x.nome) + '</td><td class="n">' + (x.antes.total ? x.antes.acertos + ' de ' + x.antes.total : '—') + '</td><td class="n">' + (x.depois && x.depois.total ? x.depois.acertos + ' de ' + x.depois.total : '—') + '</td>' +
          '<td class="n">' + (v == null ? '—' : '<span class="es-selo ' + (v > 0 ? 'verde' : v < 0 ? 'ambar' : 'cinza') + '">' + (v > 0 ? '+' : '') + v + ' p.p.</span>') + '</td></tr>';
      }).join('') + '</table><p class="al-fino">São poucas questões por disciplina: leia a variação como um sinal, não como nota.</p>';
      else if (f.resultado && !d.feito) h += '<p class="al-fino">Você não fez o diagnóstico de entrada: não há um "antes" para comparar.</p>' + linhasDeLeitura(f.resultado.disciplinas);
      return h + '</div>';
    }
    function ligarAvaliacao(alvo) {
      cada(alvo, '[data-aval]', function (b) { b.onclick = function () { b.disabled = true; iniciarAvaliacao(b.getAttribute('data-aval'), b.parentNode.querySelector('[data-aval-msg]')); setTimeout(function () { b.disabled = false; }, 4000); }; });
    }
    function caixaNivel(nv) {
      var k = nv.competencias, px = nv.proximo;
      var linha = function (a, b) { return '<tr><td>' + a + '</td><td class="n">' + b + '</td></tr>'; };
      return '<div class="jr-caixa es-jr-nivel"><p class="al-rotulo">Minha jornada · nível pelo domínio demonstrado</p><h3>Nível ' + nv.n + ' de ' + nv.de + ' — ' + esc(nv.nome) + '</h3>' +
        '<div class="es-jr-escada">' + nv.escada.map(function (x) {
          return '<div class="es-jr-degrau' + (x.n === nv.n ? ' on' : x.n < nv.n ? ' feito' : '') + '"><b>' + x.n + '</b><span>' + esc(x.nome) + '</span><small>' + (x.n === 1 ? 'ponto de partida' : x.demonstradas + ' demonstrada' + (x.demonstradas === 1 ? '' : 's') + (x.retidas ? ' · ' + x.retidas + ' retida' + (x.retidas === 1 ? '' : 's') : '')) + '</small></div>';
        }).join('') + '</div>' +
        '<p class="es-jr-falta">' + (px ? esc(px.texto) : (k.total ? 'Você está no nível mais alto. Ele se mantém enquanto as competências continuarem demonstradas e retidas.' : 'Este percurso ainda não tem competências para demonstrar.')) + '</p>' +
        '<table class="es-tab es-jr-tab">' + linha('Competências do percurso', k.total) + linha('<b>Demonstradas sem apoio</b> (questão nova, sem pista)', '<b>' + k.demonstradas + '</b>') + linha('— das quais com retenção confirmada', k.retidas) +
        linha('Acertadas só com apoio (pista, questão repetida ou card)', k.com_apoio) + linha('Em prática (o último resultado sem apoio foi erro)', k.em_pratica) + linha('Ainda não avaliadas', k.nao_avaliadas) + '</table>' +
        (k.sem_questao ? '<p class="es-aviso">' + k.sem_questao + ' competência(s) ainda não têm questão para você demonstrar: elas contam no total, e o nível sobe quando o conteúdo delas chegar.</p>' : '') +
        '<p class="al-fino">O nível sai só do que você demonstrou: acertar, sem pista, uma questão que ainda não tinha visto. Assistir, ler e abrir aula não mudam o nível — e ele pode descer: um erro sem apoio reabre a competência. Nível não é previsão de resultado em prova.</p></div>';
    }
    function caixaEixos(p) {
      var c = p.cobertura;
      return '<div class="es-eixos">' +
        eixo('Com aula pronta', c.material.com, c.folhas, 'itens do programa com material', 'cinza') +
        eixo('Com questão conferida', c.avaliacao.com_questao_revisada, c.folhas, c.avaliacao.so_sugerida ? '+ ' + c.avaliacao.so_sugerida + ' com vínculo ainda a conferir' : 'itens com questão vinculada', 'cinza') +
        eixo('Estudados por você', c.estudo.estudados, c.folhas, 'itens em que você já respondeu algo', 'ambar') +
        eixo('Demonstrados sem apoio', c.dominio.sem_apoio + c.dominio.retidos, c.folhas, c.dominio.retidos + ' com retenção confirmada', 'verde') + '</div>';
    }
    // o cartão compacto da aba Hoje: nível, o que falta e a porta para a tela inteira
    function cartaoJornada(p) {
      var jn = p.jornada;
      if (!jn || !jn.nivel) return '';
      var nv = jn.nivel;
      return '<div class="jr-caixa es-jr-mini"><div class="es-linha"><div><p class="al-rotulo">Minha jornada</p><h3>Nível ' + nv.n + ' de ' + nv.de + ' — ' + esc(nv.nome) + '</h3></div>' +
        '<button class="al-bt fan" id="es-hj-jr">🏅 Abrir a minha jornada</button></div>' +
        '<p class="al-sub">' + (nv.proximo ? esc(nv.proximo.texto) : nv.competencias.total ? 'Nível mais alto: todas as faixas de domínio cumpridas.' : 'O percurso ainda não tem competências para demonstrar.') +
        ' <span class="al-fino">' + nv.competencias.demonstradas + ' de ' + nv.competencias.total + ' competências demonstradas sem apoio.</span></p></div>';
    }
    // o cartão do diagnóstico na aba Hoje: enquanto não foi feito, a porta; depois, a ordem sugerida como ponto de partida
    function cartaoDiagnostico(p, compacto) {
      var a = p.jornada && p.jornada.avaliacao;
      if (!a || !a.disponivel) return '';
      var d = a.diagnostico;
      if (d.feito) return '<div class="jr-caixa es-jr-ponto"><p class="al-rotulo">Ponto de partida · pelo seu diagnóstico</p><h3>Ordem sugerida de estudo</h3>' + ordemSugeridaTxt(compacto ? d.ordem_sugerida.slice(0, 5) : d.ordem_sugerida) +
        '<p class="al-fino">' + (compacto && d.ordem_sugerida.length > 5 ? 'As cinco primeiras de ' + d.ordem_sugerida.length + ' disciplinas. ' : '') + 'É uma sugestão a partir de poucas questões por disciplina — o Plano não foi alterado por ela.' +
        (a.teste_final.liberado && !a.teste_final.feitos ? ' O teste final já está liberado.' : '') + ' <button class="es-link" data-ir-jr="1">ver o diagnóstico completo</button></p></div>';
      return '<div class="jr-caixa es-jr-ponto"><p class="al-rotulo">Antes de começar</p><h3>' + (d.aberto ? 'Seu diagnóstico está em andamento' : 'Faça o diagnóstico de entrada') + '</h3>' +
        '<p class="al-sub">' + (d.aberto ? d.aberto.respondidas + ' de ' + d.aberto.total + ' questões respondidas. As respostas estão salvas: continue de onde parou.'
          : 'Até ' + a.por_disciplina + ' questões de cada disciplina (cerca de ' + (a.por_disciplina * a.disciplinas) + '), sem relógio e em quantas partes você quiser. No fim, você vê por onde vale começar.') + '</p>' +
        '<div class="es-linha"><button class="al-bt" data-aval="diagnostico">' + (d.aberto ? 'Continuar o diagnóstico' : 'Começar o diagnóstico') + '</button><span data-aval-msg="1"></span></div></div>';
    }
    function jornada(alvo, arg) {
      // veio de "Começar/Continuar o diagnóstico": a tela é a da prova (sem relógio), não a da jornada — e nada é buscado por baixo dela
      if (arg && arg.tentativa) return executar(alvo, arg.tentativa);
      api('GET', base() + '/jornada').then(function (r) {
        var h = '<div class="es-linha es-jr-topo">' + botaoVoltarDaPorta() + '<button class="al-bt fan" data-jr-fer="1">🧰 Ferramentas do concurseiro</button></div>' + caixaNivel(r.nivel) + caixaAvaliacao(r.avaliacao);
        h += '<div class="jr-caixa"><p class="al-rotulo">Selos por disciplina</p><h3>Um selo para cada disciplina do edital</h3>' +
          '<p class="al-sub"><b>Bronze</b>: todas as aulas da disciplina estudadas. <b>Prata</b>: ' + r.criterios.selo_prata_pct + ' % das competências dela demonstradas sem apoio. <b>Ouro</b>: todas demonstradas sem apoio.</p>' +
          (r.selos.length ? '<div class="es-jr-selos">' + r.selos.map(function (s) {
            var g = GRAU[s.grau] || GRAU[''];
            return '<div class="es-jr-selo ' + (s.grau || 'sem') + '"><span class="es-jr-ico" aria-hidden="true">' + g[0] + '</span><div><b>' + esc(s.nome) + '</b><small>' + g[1] + ' · aulas ' + s.aulas_estudadas + ' de ' + s.aulas + ' · competências ' + s.demonstradas + ' de ' + s.competencias + '</small>' +
              (s.falta ? '<span class="al-fino">' + esc(s.falta) + '</span>' : '') + '</div></div>';
          }).join('') + '</div>' : '<p class="al-sub">Este percurso ainda não tem aulas por disciplina.</p>') + '</div>';
        h += '<div class="jr-caixa"><p class="al-rotulo">Medalhas</p><h3>Marcos do percurso</h3><div class="es-jr-meds">' + r.medalhas.map(function (m) {
          return '<div class="es-jr-med' + (m.ok ? ' ok' : '') + '"><span class="es-jr-ico" aria-hidden="true">' + m.icone + '</span><div><b>' + esc(m.nome) + '</b><small>' + (m.ok ? 'Conquistada' : 'Ainda não') + '</small><span class="al-fino">' + esc(m.desc) + (m.detalhe ? ' · ' + esc(m.detalhe) : '') + '</span></div></div>';
        }).join('') + '</div><p class="al-fino">As medalhas saem do que já está registrado no seu percurso (respostas, provas, pedidos, desafio). Ouvir o audiobook não entra: não há registro confiável de escuta.</p></div>';
        h += '<div class="jr-caixa"><p class="al-rotulo">Onde você está no programa</p><h3>Quatro medidas, cada uma com a sua contagem</h3>' +
          '<p class="al-sub">Ter a aula pronta não é ter estudado, e ter estudado não é ter demonstrado. Por isso estes números não viram um percentual só.</p>' + caixaEixos(E.painel) + '</div>' + caixaConclusao() +
          '<div class="es-linha">' + botaoVoltarDaPorta() + '</div>';
        alvo.innerHTML = h;
        ligarVoltarDaPorta(alvo); ligarAvaliacao(alvo); ligarConclusao(alvo);
        cada(alvo, '[data-jr-fer]', function (b) { b.onclick = function () { ir('ferramentas'); }; });
        if (arg === 'avaliacao' && el('es-jr-aval')) el('es-jr-aval').scrollIntoView(); // quem acabou de concluir o diagnóstico cai no resultado
      }).catch(function (e) { falha(alvo, e); });
    }

    // ================= FERRAMENTAS DO CONCURSEIRO: pontuação da prova, prazo e cronograma =================
    // Rodam no navegador, sem IA e sem custo — com os MOTORES do servidor (estudo/pontuacao.js, plano.js, prazo.js,
    // calculadora.js, cronograma.js), que chegam em /academy/estude-motores.js. Nenhuma conta é refeita aqui: a tela
    // lê os campos, chama o motor e mostra. Do servidor vêm só os dados do percurso (regra com fonte, data, aulas).
    var FERRAMENTAS = [['pontuacao', '🧮 Pontuação da prova'], ['prazo', '📅 Contador de prazo'], ['cronograma', '🗓️ Cronograma']];
    function comMotores(alvo, feito) {
      if (window.EstudeMotores) return feito(window.EstudeMotores);
      var sc = document.createElement('script');
      sc.src = '/academy/estude-motores.js?v=1';
      sc.onload = function () { if (window.EstudeMotores) feito(window.EstudeMotores); else falha(alvo, new Error('As ferramentas não carregaram. Recarregue a página.')); };
      sc.onerror = function () { falha(alvo, new Error('Não foi possível carregar as ferramentas. Confira a conexão e tente de novo.')); };
      document.head.appendChild(sc);
    }
    function ferramentas(alvo, qual) {
      qual = FERRAMENTAS.some(function (x) { return x[0] === qual; }) ? qual : 'pontuacao';
      alvo.innerHTML = '<div class="es-linha es-jr-topo">' + botaoVoltarDaPorta() + '<button class="al-bt fan" data-fer-jr="1">🏅 Minha jornada</button></div>' +
        '<div class="jr-caixa"><p class="al-rotulo">Ferramentas do concurseiro</p><h3>Contas que você faz toda semana</h3>' +
        '<p class="al-sub">Rodam aqui no seu navegador, sem IA e sem custo. São calculadoras: o resultado vale para os números que você informar.</p>' +
        '<div class="es-linha es-fer-nav">' + FERRAMENTAS.map(function (x) { return '<button class="al-bt peq' + (x[0] === qual ? '' : ' fan') + '" data-fer="' + x[0] + '"' + (x[0] === qual ? ' aria-current="true"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div></div>' +
        '<div id="es-fer-corpo"><p class="al-sub">Carregando…</p></div>';
      ligarVoltarDaPorta(alvo);
      cada(alvo, '[data-fer]', function (b) { b.onclick = function () { ir('ferramentas', b.getAttribute('data-fer')); }; });
      cada(alvo, '[data-fer-jr]', function (b) { b.onclick = function () { ir('jornada'); }; });
      var cx = el('es-fer-corpo');
      comMotores(cx, function (M) {
        api('GET', base() + '/ferramentas').then(function (F) {
          if (!el('es-fer-corpo')) return;
          ({ pontuacao: ferPontuacao, prazo: ferPrazo, cronograma: ferCronograma }[qual])(cx, M, F);
        }).catch(function (e) { falha(cx, e); });
      });
    }
    function campoNum(rotulo, attrs, valor) { return '<label class="es-campo">' + rotulo + '<input type="number" min="0" ' + attrs + ' value="' + (valor == null ? '' : valor) + '"></label>'; }

    // ---- 1. calculadora de pontuação: a regra do percurso (com a fonte) ou os números que o aluno informar ----
    function ferPontuacao(cx, M, F) {
      var regra = F.regra_pontuacao, temRegra = !!regra, norm = temRegra ? M.pontuacao.normalizarRegra(regra) : null;
      var desconta = temRegra ? !!(norm.desconto || norm.em_branco_conta_erro) : true;
      var blocos = temRegra ? (norm.minimos.length ? norm.minimos.map(function (m) { return { bloco: m.bloco, fixo: true, min: m }; }) : [{ bloco: '', fixo: true }]) : [{ bloco: 'I' }, { bloco: 'II' }, { bloco: 'III' }];
      function minimoTxt(m) { return !m ? '' : [m.min_pontos != null ? num(m.min_pontos) + ' ponto(s)' : '', m.min_pct != null ? num(m.min_pct) + ' %' : ''].filter(Boolean).join(' e '); }
      function linhas() {
        return blocos.map(function (b, i) {
          return '<div class="es-form es-fer-bloco" data-bl="' + i + '">' +
            (b.fixo ? '<p class="es-fer-nome"><b>' + (b.bloco ? 'Bloco ' + esc(b.bloco) : 'Prova inteira') + '</b>' + (b.min ? '<span class="al-fino">mínimo do bloco: ' + minimoTxt(b.min) + '</span>' : '') + '</p>'
              : '<label class="es-campo">Nome do bloco<input type="text" maxlength="40" data-c="bloco" value="' + esc(b.bloco) + '"></label>') +
            campoNum('Questões do bloco', 'max="500" data-c="questoes"', b.questoes) +
            (b.fixo ? '' : campoNum('Mínimo de acertos do bloco', 'max="500" data-c="minimo"', b.minimo)) +
            campoNum('Seus acertos', 'max="500" data-c="acertos"', b.acertos) +
            (desconta ? campoNum('Seus erros', 'max="500" data-c="erros"', b.erros) : '') + '</div>';
        }).join('');
      }
      function pintar() {
        cx.innerHTML = '<div class="jr-caixa"><h3>Calculadora de pontuação da prova</h3>' +
          (temRegra ? '<p class="al-sub"><b>Regra deste percurso:</b> ' + esc(regraTxt(regra)) + '</p>' +
              '<p class="al-fino">A regra é a cadastrada para este percurso, com a fonte indicada — a mesma que a aba Prova aplica. Informe quantas questões cada bloco tem na sua prova e quantas você acertou' + (desconta ? ' e errou (o que sobrar é contado como em branco)' : '') + '.</p>'
            : '<p class="es-aviso">Este percurso não tem a regra de pontuação cadastrada. Informe os números do SEU edital — questões e mínimo de cada bloco, e o mínimo geral. O resultado vale para os números que você informou, não para os do edital.</p>') +
          '<div id="es-fer-blocos">' + linhas() + '</div>' +
          (temRegra ? '' : '<div class="es-linha"><button class="al-bt peq fan" id="es-fer-mais">+ bloco</button>' + (blocos.length > 1 ? '<button class="al-bt peq fan" id="es-fer-menos">− bloco</button>' : '') + '</div>' +
            '<div class="es-form">' + campoNum('Mínimo geral de acertos', 'max="2000" id="es-fer-geral"', E.ferGeral) + campoNum('Cada quantas erradas anulam 1 certa (0 = não desconta)', 'max="20" id="es-fer-desc"', E.ferDesc || 0) +
            '<label class="es-campo es-fer-check"><input type="checkbox" id="es-fer-branco"' + (E.ferBranco ? ' checked' : '') + '> Questão em branco conta como erro</label></div>') +
          '<div class="es-linha"><button class="al-bt" id="es-fer-calc">Calcular</button></div><div id="es-fer-res"></div></div>';
        if (el('es-fer-mais')) el('es-fer-mais').onclick = function () { ler(); blocos.push({ bloco: String(blocos.length + 1) }); pintar(); };
        if (el('es-fer-menos')) el('es-fer-menos').onclick = function () { ler(); blocos.pop(); pintar(); };
        el('es-fer-calc').onclick = calcular;
      }
      function ler() {
        cada(cx, '[data-bl]', function (linha) {
          var b = blocos[Number(linha.getAttribute('data-bl'))];
          cada(linha, '[data-c]', function (i) { var k = i.getAttribute('data-c'); b[k] = k === 'bloco' ? i.value.trim() : (i.value === '' ? '' : Number(i.value)); });
        });
        if (el('es-fer-geral')) { E.ferGeral = el('es-fer-geral').value; E.ferDesc = el('es-fer-desc').value; E.ferBranco = el('es-fer-branco').checked; }
      }
      function calcular() {
        ler();
        var r, out = el('es-fer-res');
        try {
          r = M.calculadora.calcular(temRegra ? regra : M.calculadora.regraInformada({ blocos: blocos, minimo_geral: E.ferGeral, desconto_a_cada: E.ferDesc, em_branco_conta_erro: E.ferBranco }), blocos);
        } catch (e) { out.innerHTML = '<p class="es-aviso">' + esc(e.message) + '</p>'; return; }
        var falta = function (x, onde) { return x.faltam_acertos == null ? '' : x.faltam_acertos === 0 ? '<span class="es-selo verde">mínimo atingido</span>' : x.possivel ? '<span class="es-selo ambar">faltam ' + x.faltam_acertos + ' acerto' + (x.faltam_acertos > 1 ? 's' : '') + '</span>' : '<span class="es-selo verm">não alcança nem acertando ' + onde + '</span>'; };
        out.innerHTML = '<div class="es-nota"><b>' + num(r.nota_liquida) + '</b><span> de ' + num(r.maximo) + ' · ' + num(r.pct_liquido) + ' %</span></div>' +
          '<table class="es-tab es-jr-tab"><tr><th>Bloco</th><th class="n">Acertos</th><th class="n">Pontos</th><th class="n">Mínimo</th><th class="n">Situação</th></tr>' + r.blocos.map(function (b) {
            return '<tr><td>' + (b.bloco ? 'Bloco ' + esc(b.bloco) : 'Prova inteira') + '</td><td class="n">' + b.acertos + ' de ' + b.questoes + '</td><td class="n">' + num(b.pontos) + ' de ' + num(b.maximo) + '</td><td class="n">' + (b.minimo ? minimoTxt(b.minimo) : '—') + '</td><td class="n">' + (falta(b, 'o bloco inteiro') || '—') + '</td></tr>';
          }).join('') + '</table>' +
          '<table class="es-tab">' + (r.descontados ? '<tr><td>Pontos brutos</td><td class="n">' + num(r.nota_bruta) + '</td></tr><tr><td>Desconto: ' + r.erros_contados + ' erro(s) pela regra</td><td class="n">− ' + num(r.descontados) + '</td></tr>' : '') +
          '<tr><td><b>Nota líquida</b></td><td class="n"><b>' + num(r.nota_liquida) + '</b></td></tr>' +
          (r.geral ? '<tr><td>Mínimo geral: ' + minimoTxt(r.geral) + '</td><td class="n">' + falta(r.geral, 'tudo o que falta') + '</td></tr>' : '') + '</table>' +
          (r.minimos_sem_bloco.length ? '<p class="es-aviso">A regra tem mínimo para o(s) bloco(s) ' + r.minimos_sem_bloco.map(esc).join(', ') + ', que você não preencheu.</p>' : '') +
          '<p><b>' + (r.aprovado === null ? 'Sem mínimo geral informado: não há critério para dizer se atinge ou não.' : r.aprovado ? 'Com estes números, você atinge os mínimos ' + (temRegra ? 'cadastrados' : 'que informou') + '.' : 'Com estes números, você não atinge os mínimos ' + (temRegra ? 'cadastrados' : 'que informou') + '.') + '</b></p>' +
          '<p class="al-fino">"Faltam N acertos" troca primeiro questões erradas por certas e, depois, as em branco. ' + (temRegra ? 'Regra aplicada: ' + esc(regraTxt(r.regra)) + '.' : 'São os números que você informou, não os do edital.') + ' É uma conta, não um resultado oficial nem uma previsão.</p>';
      }
      pintar();
    }

    // ---- 2. contador de prazo: uma calculadora de datas, com o passo a passo ----
    function ferPrazo(cx, M, F) {
      var z = M.prazo;
      cx.innerHTML = '<div class="jr-caixa"><h3>Contador de prazo</h3>' +
        '<p class="es-aviso">Esta ferramenta só conta datas. Confira no edital ou na lei qual é o prazo e se ele corre em dias úteis ou corridos — e o calendário do seu tribunal ou órgão.</p>' +
        '<div class="es-form"><label class="es-campo">Dia do começo (não entra na contagem)<input type="date" id="es-pz-ini" value="' + esc(F.hoje) + '"></label>' +
        campoNum('Quantidade de dias', 'max="' + z.MAX_DIAS + '" id="es-pz-dias"', 15) +
        '<label class="es-campo">Contagem<select id="es-pz-modo"><option value="uteis">Dias úteis</option><option value="corridos">Dias corridos</option></select></label></div>' +
        '<label class="es-campo es-fer-check"><input type="checkbox" id="es-pz-fac" checked> Tratar Carnaval (segunda e terça) e Corpus Christi como dias sem expediente (costumam ser ponto facultativo)</label>' +
        '<label class="es-campo es-fer-check"><input type="checkbox" id="es-pz-util"> Em dias corridos, começar a contar só no primeiro dia útil depois do dia do começo</label>' +
        '<label class="es-campo">Feriados locais, recessos e suspensões de expediente (uma data por linha, como 08/12/2026; ou um período, como 20/12/2026 a 06/01/2027)<textarea id="es-pz-extras" rows="3" placeholder="08/12/2026 - feriado local&#10;20/12/2026 a 06/01/2027 - recesso"></textarea></label>' +
        '<div class="es-linha"><button class="al-bt" id="es-pz-ok">Contar</button></div><div id="es-pz-res"></div></div>';
      el('es-pz-ok').onclick = function () {
        var out = el('es-pz-res'), lidas = z.lerDatas(el('es-pz-extras').value), r;
        try { r = z.contar({ inicio: el('es-pz-ini').value, dias: el('es-pz-dias').value, modo: el('es-pz-modo').value, extras: lidas.datas, facultativos: el('es-pz-fac').checked, comeco_em_dia_util: el('es-pz-util').checked }); }
        catch (e) { out.innerHTML = '<p class="es-aviso">' + esc(e.message) + '</p>'; return; }
        var anos = {}, lista = [];
        r.passos.forEach(function (p) { anos[p.data.slice(0, 4)] = 1; });
        Object.keys(anos).forEach(function (a) { lista = lista.concat(z.feriadosDoAno(Number(a), { facultativos: el('es-pz-fac').checked })); });
        out.innerHTML = '<div class="es-nota es-pz-venc"><b>' + dataBR(r.vencimento) + '</b><span> · ' + esc(r.semana) + ' · vencimento</span></div>' +
          '<p>' + r.dias + ' dia' + (r.dias > 1 ? 's' : '') + ' ' + (r.modo === 'uteis' ? (r.dias > 1 ? 'úteis' : 'útil') : 'corrido' + (r.dias > 1 ? 's' : '')) + ' a partir de ' + dataBR(r.inicio) + ': o último dia contado é ' + dataBR(r.ultimo_dia_contado) +
          (r.prorrogado ? ', que caiu em dia sem expediente — o vencimento passa para o primeiro dia útil seguinte.' : '.') + '</p>' +
          (lidas.ignoradas.length ? '<p class="es-aviso">Não entendi como data e deixei de fora: ' + lidas.ignoradas.map(esc).join(' · ') + '</p>' : '') +
          '<table class="es-tab es-jr-tab es-pz-passos"><tr><th>Data</th><th>Dia</th><th class="n">Conta</th><th>Observação</th></tr>' + r.passos.map(function (p) {
            return '<tr class="' + (p.conta ? 'conta' : 'pula') + (p.data === r.vencimento ? ' venc' : '') + '"><td>' + dataBR(p.data) + '</td><td>' + esc(p.semana) + '</td><td class="n">' + (p.conta ? p.n + 'º' : '—') + '</td><td>' + esc(p.motivo) + (p.data === r.vencimento && p.conta ? (p.motivo ? ' · ' : '') + 'vencimento' : '') + '</td></tr>';
          }).join('') + '</table>' +
          '<details class="es-fontes"><summary>Feriados embutidos no período (' + Object.keys(anos).join(', ') + ')</summary><ul>' + lista.map(function (f) { return '<li>' + dataBR(f.data) + ' — ' + esc(f.nome) + (f.movel ? ' <span class="al-fino">(calculado a partir da Páscoa' + (f.facultativo ? '; ponto facultativo' : '') + ')</span>' : '') + '</li>'; }).join('') + '</ul>' +
          '<p class="al-fino">Só os feriados nacionais. Feriado estadual, municipal, recesso e suspensão de expediente entram no campo acima.</p></details>';
      };
    }

    // ---- 3. cronograma: uma visão de calendário do MESMO plano (motor de estudo/plano.js) ----
    var CSS_CRONO = '@page{size:A4 portrait;margin:14mm}body{font:10.5pt/1.45 Arial,sans-serif;color:#1d2433;max-width:820px;margin:20px auto;padding:0 18px}' +
      'header{border-bottom:3px solid #1B2A4A;padding-bottom:10px;margin-bottom:14px}header p{margin:0;font:600 9pt Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#B45309}' +
      'h1{font:700 18pt Arial,sans-serif;color:#1B2A4A;margin:4px 0}h2{font:700 11.5pt Arial,sans-serif;color:#1B2A4A;margin:0 0 4px}.sem{border:1px solid #d9dee8;border-radius:8px;padding:9px 12px;margin:0 0 9px;break-inside:avoid}' +
      '.sem ul{margin:4px 0 0 18px;padding:0}.sem li{margin:1px 0}.fino{color:#5b6474;font-size:9pt}.aviso{border-left:4px solid #B45309;background:#fff7e6;padding:8px 12px;margin:0 0 12px}' +
      '.barra-mapa{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:10px 0;background:#fff;border-bottom:1px solid #dde2ec;margin-bottom:12px}' +
      '.barra-mapa button{font:600 11pt Arial,sans-serif;padding:8px 14px;border-radius:8px;border:1.5px solid #1B2A4A;background:#1B2A4A;color:#fff;cursor:pointer}' +
      '.barra-mapa button.fan{background:#fff;color:#1B2A4A}@media print{.barra-mapa{display:none}body{margin:0;padding:0}}';
    function semanaDoCrono(w, classe) {
      var itens = w.disciplinas.map(function (d) { return '<li><b>' + esc(d.nome || 'Método de estudo') + '</b> — ' + horas(d.minutos) + ' · ' + d.aulas.length + ' aula' + (d.aulas.length > 1 ? 's' : '') + '</li>'; });
      if (w.revisao_min) itens.push('<li>Retomadas (revisões, cards, caderno de erros) — ' + horas(w.revisao_min) + '</li>');
      if (w.simulado_min) itens.push('<li>Simulado — ' + horas(w.simulado_min) + '</li>');
      if (w.vespera_min) itens.push('<li>Véspera de prova: só o que já foi estudado — ' + horas(w.vespera_min) + '</li>');
      return '<div class="' + classe + '"><h2>Semana de ' + dataBR(w.inicio).slice(0, 5) + ' a ' + dataBR(w.fim).slice(0, 5) + ' · ' + horas(w.minutos) + '</h2><ul>' + itens.join('') + '</ul></div>';
    }
    function resumoDoCrono(r) {
      return (r.cabe ? 'Cabe: ' + r.aulas + ' aula(s), ' + horas(r.esforco_min) + ' no nível ' + r.nivel + ' %' + (r.conclusao_estimada ? ', com a última aula por volta de ' + dataBR(r.conclusao_estimada) : '') + '.' : r.aviso) +
        ' De cada dia de estudo: ' + r.reservas.margem_pct + ' % de margem para imprevistos; do que sobra, ' + r.reservas.revisao_pct + ' % para retomadas e ' + r.reservas.simulado_pct + ' % para simulado.';
    }
    function escreverCronograma(w, r, titulo) {
      w.document.open();
      w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cronograma — ' + esc(titulo) + '</title><style>' + CSS_CRONO + '</style></head><body>' +
        '<div class="barra-mapa"><button id="cr-imprimir">🖨️ Imprimir ou salvar em PDF</button><button id="cr-fechar" class="fan">Fechar</button></div>' +
        '<header><p>Villela Academy · Cronograma de estudo</p><h1>' + esc(titulo) + '</h1><div>' + (r.data_alvo ? 'Prova em ' + dataBR(r.data_alvo) + ' · ' : '') + 'montado em ' + dataBR(r.hoje) + ' · leitura no nível ' + r.nivel + ' %</div></header>' +
        '<p class="' + (r.cabe ? 'fino' : 'aviso') + '">' + esc(resumoDoCrono(r)) + '</p>' + r.semanas.map(function (s) { return semanaDoCrono(s, 'sem'); }).join('') +
        '<p class="fino">Visão de calendário do plano de estudo: usa as horas que você informou e não promete resultado. Refaça quando a sua rotina mudar.</p></body></html>');
      w.document.close(); w.focus();
      var bi = w.document.getElementById('cr-imprimir'), bf = w.document.getElementById('cr-fechar');
      if (bi) bi.onclick = function () { w.print(); };
      if (bf) bf.onclick = function () { w.close(); };
    }
    function ferCronograma(cx, M, F) {
      var pl = F.plano, disp = (pl && pl.disponibilidade) || [0, 0, 0, 0, 0, 0, 0], fixa = F.escopo.data_alvo, ultimo = null;
      var faltam = [], porDisc = 0, total = 0;
      F.disciplinas.forEach(function (d) {
        var n = 0;
        d.aulas.forEach(function (a) { if (!a.estudada) { n++; total += a.tempo_min; faltam.push({ codigo: a.codigo, titulo: a.titulo, disciplina: d.codigo, disciplina_nome: d.nome, tempo_min: a.tempo_min }); } });
        if (n) porDisc++;
      });
      cx.innerHTML = '<div class="jr-caixa"><h3>Montador de cronograma</h3>' +
        '<p class="al-sub">Uma visão de calendário do seu <b>Plano</b>: o mesmo motor distribui as horas, com a mesma margem para imprevistos e a mesma reta final (revisão geral e véspera). A diferença é a unidade — aqui a conta é por <b>aula que você ainda não estudou</b>, no nível de leitura escolhido; na aba Plano é por item do edital. Se mudar as horas aqui, leve-as ao Plano pelo botão, para os dois continuarem dizendo a mesma coisa.</p>' +
        '<p><b>' + faltam.length + ' aula(s) ainda não estudada(s)</b> em ' + porDisc + ' disciplina(s) · ' + horas(total) + ' no nível 100 %.' + (faltam.length ? '' : ' Tudo estudado: o cronograma fica só com retomadas e simulados.') + '</p>' +
        '<div class="es-semana">' + DIAS.map(function (d, k) {
          return '<label class="es-campo">' + d[1] + '<input type="number" min="0" max="16" step="0.5" data-crh="' + d[0] + '" value="' + (disp[k] ? Math.round(disp[k] / 6) / 10 : 0) + '" aria-label="Horas de estudo de ' + d[1] + '"></label>';
        }).join('') + '</div><p class="al-fino">Horas de estudo em cada dia da semana' + (pl ? ' (vieram do seu Plano)' : '') + '.</p>' +
        '<div class="es-form">' + (fixa ? '<p class="al-fino">Data da prova: ' + dataBR(fixa) + ' (do edital).</p>' : '<label class="es-campo">Data da prova (se já souber)<input type="date" id="es-cr-dt" value="' + esc((pl && pl.data_alvo) || '') + '"></label>') +
        '<label class="es-campo">Quanto ler de cada aula<select id="es-cr-nv">' + F.niveis.map(function (n) { return '<option value="' + n + '">' + n + ' %' + (n === 100 ? ' — a aula completa' : '') + '</option>'; }).join('') + '</select></label></div>' +
        '<div class="es-linha"><button class="al-bt" id="es-cr-ok">Montar o cronograma</button></div><div id="es-cr-res"></div></div>';
      function minutos() { var d = {}; cada(cx, '[data-crh]', function (i) { d[i.getAttribute('data-crh')] = Math.round((Number(i.value) || 0) * 60); }); return d; }
      el('es-cr-ok').onclick = function () {
        var out = el('es-cr-res'), r, alvo = fixa || (el('es-cr-dt') ? el('es-cr-dt').value : '');
        try {
          r = M.cronograma.montar({ hoje: F.hoje, data_alvo: alvo, disponibilidade: minutos(), indisponiveis: (pl && pl.indisponiveis) || [], margem_pct: pl && pl.margem_pct != null ? pl.margem_pct : F.reservas.margem_pct, nivel: Number(el('es-cr-nv').value), aulas: faltam,
            vespera_dias: alvo ? F.reta_final.vespera_dias : 0, revisao_geral_dias: alvo ? F.reta_final.revisao_geral_dias : 0, foco: F.reta_final.foco });
        } catch (e) { out.innerHTML = '<p class="es-aviso">' + esc(e.message) + '</p>'; return; }
        ultimo = r;
        out.innerHTML = '<p class="' + (r.cabe ? 'es-nivel-rec' : 'es-aviso') + '">' + esc(resumoDoCrono(r)) + '</p>' +
          (r.pendentes.length ? '<p><b>Ficam de fora neste ritmo:</b> ' + r.pendentes.map(function (x) { return esc(x.nome || 'Método de estudo') + ' (' + x.aulas + ' aula' + (x.aulas > 1 ? 's' : '') + ', ' + horas(x.minutos) + ')'; }).join(' · ') + '</p>' : '') +
          (r.sem_estimativa.length ? '<p class="al-fino">' + r.sem_estimativa.length + ' aula(s) sem tempo estimado ficaram fora da conta.</p>' : '') +
          '<div class="es-linha"><button class="al-bt fan" id="es-cr-pdf">🖨️ Abrir para imprimir ou salvar em PDF</button><button class="al-bt fan" id="es-cr-plano">Usar estas horas no meu Plano</button><span id="es-cr-msg"></span></div>' +
          '<div class="es-crono">' + r.semanas.map(function (s) { return semanaDoCrono(s, 'es-crono-sem'); }).join('') + '</div>' +
          (r.semanas_total > r.semanas.length ? '<p class="al-fino">Mostrando ' + r.semanas.length + ' de ' + r.semanas_total + ' semanas.</p>' : '');
        el('es-cr-pdf').onclick = function () { var w = window.open('', '_blank'); if (w) escreverCronograma(w, ultimo, F.escopo.titulo); }; // a janela abre no clique; imprimir é outro clique, lá dentro
        el('es-cr-plano').onclick = function () {
          api('PUT', base() + '/plano', { disponibilidade: minutos(), margem_pct: pl && pl.margem_pct != null ? pl.margem_pct : F.reservas.margem_pct, data_alvo: alvo, motivo: 'horas levadas do cronograma das Ferramentas' })
            .then(function () { el('es-cr-msg').textContent = 'Plano atualizado com estas horas.'; })
            .catch(function (e) { el('es-cr-msg').innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
        };
      };
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
    // ADR-0009 — filtros por banca, órgão, cargo e ano. O banco diz o que existe; eixo sem opção não aparece.
    var EIXOS = [['banca', 'bancas', 'Banca examinadora', 'Todas as bancas'], ['orgao', 'orgaos', 'Órgão', 'Todos os órgãos'], ['cargo', 'cargos', 'Cargo', 'Todos os cargos'], ['ano_de', 'anos', 'A partir do ano', 'Qualquer ano']];
    function comBanco(feito) {
      if (E.banco && E.bancoDe === base()) return feito(E.banco);
      api('GET', base() + '/banco').then(function (b) { E.banco = b; E.bancoDe = base(); feito(b); }).catch(function () { feito({ bancas: [], orgaos: [], cargos: [], anos: [] }); });
    }
    function seletoresDeEixo(b, prefixo, atual) {
      return EIXOS.map(function (x) {
        var ops = b[x[1]] || [];
        if (!ops.length) return '';
        return '<label class="es-campo">' + x[2] + '<select id="' + prefixo + x[0] + '"><option value="">' + x[3] + '</option>' + ops.map(function (o) {
          return '<option value="' + esc(o.valor) + '"' + (String(atual[x[0]] || '') === String(o.valor) ? ' selected' : '') + '>' + esc(o.valor) + (x[0] === 'ano_de' ? '' : ' (' + o.n + ')') + (x[0] === 'banca' && b.banca_do_edital === o.valor ? ' — banca do seu edital' : '') + '</option>';
        }).join('') + '</select></label>';
      }).join('');
    }
    function eixosEscolhidos(prefixo) {
      var r = {};
      EIXOS.forEach(function (x) { var c = el(prefixo + x[0]); if (c && c.value) r[x[0]] = c.value; });
      return r;
    }
    function eixosNaUrl(f) { return EIXOS.map(function (x) { return f[x[0]] ? '&' + x[0] + '=' + encodeURIComponent(f[x[0]]) : ''; }).join(''); }
    // UMA QUESTÃO NA TELA — a mesma do Praticar e do "Quiz desta aula": pista (quem conta é o servidor),
    // resposta, gabarito comentado e anotação. Nada se corrige aqui: quem corrige e registra é o servidor.
    function questaoNaTela(out, q, cabecalho, rotuloProx, aoProxima) {
      var inicio = Date.now();
      out.innerHTML = cabecalho +
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
            '<div class="es-linha"><button class="al-bt" id="es-prox">' + esc(rotuloProx) + '</button><button class="al-bt fan" id="es-anot-ok">Guardar anotação</button><span class="al-fino" id="es-anot-msg"></span></div>';
          el('es-anot-ok').onclick = function () {
            api('PUT', base() + '/questoes/' + q.id + '/anotacao', { texto: el('es-anot').value }).then(function () { el('es-anot-msg').textContent = 'Guardada.'; })
              .catch(function (e) { el('es-anot-msg').textContent = e.message; });
          };
          el('es-prox').onclick = aoProxima;
          carregar();
        }).catch(function (e) { el('es-resp').disabled = false; el('es-fb').innerHTML = '<p class="es-msg-erro">' + esc(e.message) + '</p>'; });
      };
    }
    function praticar(alvo, competencia) {
      var origem = '', eixo = {};
      if (competencia && typeof competencia === 'object') { origem = competencia.origem || ''; eixo = competencia.eixo || {}; competencia = competencia.competencia || ''; }
      var comps = E.painel.competencias, erradas = competencia === '__erradas__';
      competencia = erradas ? '' : (competencia || '');
      alvo.innerHTML = '<div class="jr-caixa"><div class="es-linha"><label class="es-campo">Matéria (disciplina e ponto do edital)<select id="es-pr-comp"><option value="">Todas as matérias</option>' +
        opcoesComp(competencia) +
        '</select></label><label class="es-campo es-pr-of"><input type="checkbox" id="es-pr-of"' + (origem === 'oficial' ? ' checked' : '') + '> Só questões de prova oficial</label></div><div class="es-linha es-eixos" id="es-pr-eixos"></div><div id="es-pr"></div></div>';
      var denovo = function () { praticar(alvo, { competencia: el('es-pr-comp').value, origem: el('es-pr-of').checked ? 'oficial' : '', eixo: eixosEscolhidos('es-pr-x-') }); };
      el('es-pr-comp').onchange = denovo; el('es-pr-of').onchange = denovo;
      if (competencia !== '__erradas__') comBanco(function (b) {
        if (!el('es-pr-eixos')) return;
        el('es-pr-eixos').innerHTML = seletoresDeEixo(b, 'es-pr-x-', eixo);
        cada(el('es-pr-eixos'), 'select', function (c) { c.onchange = denovo; });
      });
      var out = el('es-pr');
      if (erradas) el('es-pr-comp').parentNode.parentNode.innerHTML = '<p class="al-rotulo">Refazendo o caderno de erros</p>';
      api('GET', base() + '/praticar?n=20&competencia=' + encodeURIComponent(competencia) + (erradas ? '&erradas=1' : '') + (origem ? '&origem=' + encodeURIComponent(origem) : '') + eixosNaUrl(eixo)).then(function (r) {
        // o percurso inteiro sem questão (só o programa): dizer o que falta e oferecer o caminho
        if (!r.questoes.length && !r.elegiveis && !erradas && !competencia && !origem && !eixosNaUrl(eixo)) {
          var sq = semQuestoes();
          out.innerHTML = '<p class="al-sub">' + sq.txt + '</p>' + sq.botao('es-pr-imp');
          sq.ligar('es-pr-imp');
          return;
        }
        if (!r.questoes.length) { out.innerHTML = '<p class="al-sub">' + (erradas ? 'O caderno de erros está vazio.' : eixosNaUrl(eixo) ? 'Não há questão com esses filtros de banca, órgão, cargo ou ano nesta matéria. Tire um deles para ampliar.' : origem === 'oficial' ? 'A prova oficial não trouxe questão sobre esta matéria. Desmarque o filtro para treinar com as demais.' : 'Ainda não há questões de correção automática para esta matéria.') + '</p>'; return; }
        var i = 0;
        function mostrar() {
          if (i >= r.questoes.length) {
            out.innerHTML = '<p class="al-sub">Você passou por todas as ' + r.questoes.length + ' questões disponíveis aqui. Acertar de novo a mesma questão não conta como domínio — o próximo passo é o simulado, que usa questões reservadas.</p>' +
              '<div class="es-linha"><button class="al-bt" id="es-pr-sim">Ir para a prova</button><button class="al-bt fan" id="es-pr-hj">Ver a próxima tarefa</button></div>';
            el('es-pr-sim').onclick = function () { ir('prova'); }; el('es-pr-hj').onclick = function () { ir('hoje'); };
            return;
          }
          var q = r.questoes[i];
          questaoNaTela(out, q, '<p class="al-fino">Questão ' + (i + 1) + ' de ' + r.questoes.length + ' · ' + r.ineditas + ' nova(s) para você' + (q.ja_vista ? ' · <b>você já respondeu esta</b>' : '') + '</p>',
            'Próxima questão', function () { i++; mostrar(); window.scrollTo(0, 0); });
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
          alvo.innerHTML = '<div class="jr-caixa"><h3>Cards</h3><p class="al-sub">' + (r.total ? 'Nada para recordar hoje. Os próximos voltam na data marcada.' : 'Este percurso ainda não tem cards.' + (E.painel.escopo.particular ? ' Os cards vêm com as aulas do curso; no percurso particular, a recordação é pelas questões das provas que você importar (aba Praticar).' : '')) + '</p></div>' + nota;
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
      // a regra INTEIRA, como está cadastrada: quanto vale o acerto, o desconto, o mínimo de cada bloco e o mínimo geral
      // (antes, uma regra de 0,1 por acerto com mínimos por bloco era lida como "1 ponto por acerto, sem desconto")
      var r = regra || {}, t = [], v = r.valor_certa == null ? 1 : Number(r.valor_certa), desconta = !!(r.desconto && r.desconto.a_cada);
      var pts = function (n) { return num(n) + (Math.abs(Number(n)) < 2 ? ' ponto' : ' pontos'); }; // 0,9 ponto · 1,2 ponto · 6 pontos
      if (v !== 1) t.push(pts(v) + ' por acerto');
      if (desconta) t.push('cada ' + r.desconto.a_cada + ' erradas descontam 1 certa');
      if (r.em_branco_conta_erro) t.push('questão em branco conta como erro');
      (r.minimos || []).forEach(function (m) {
        var x = [m.min_pontos != null ? pts(m.min_pontos) : '', m.min_pct != null ? num(m.min_pct) + '%' : ''].filter(Boolean).join(' e ');
        if (x) t.push('mínimo no bloco ' + m.bloco + ': ' + x);
      });
      if (r.aprovacao && r.aprovacao.min_pct != null) t.push('mínimo de ' + r.aprovacao.min_pct + '%');
      if (r.aprovacao && r.aprovacao.min_pontos != null) t.push('mínimo geral de ' + pts(r.aprovacao.min_pontos));
      if (!t.length) t.push('1 ponto por acerto, sem desconto');
      else if (!desconta) t.splice(v !== 1 ? 1 : 0, 0, 'sem desconto por erro');
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
        '<div class="es-form es-eixos" id="es-pv-eixos"></div><p class="al-fino" id="es-pv-eixos-nota"></p>' +
        '<p class="al-fino"><b>Regra de nota deste percurso:</b> ' + esc(regraTxt(p.regra_pontuacao)) + '</p>' +
        '<div class="es-linha"><button class="al-bt" id="es-pv-ir">Começar</button></div><div id="es-pv-msg"></div></div>';
      comBanco(function (b) {
        if (!el('es-pv-eixos')) return;
        el('es-pv-eixos').innerHTML = seletoresDeEixo(b, 'es-pv-x-', {});
        if (el('es-pv-eixos').innerHTML) el('es-pv-eixos-nota').textContent = 'Escolha a banca do seu edital para fazer a prova só com questões dela. Banca, órgão, cargo e ano são das questões de prova oficial: com um deles marcado, as questões autorais ficam de fora.';
        // percurso sem questão: não há prova a montar — dizer isso antes de o aluno apertar "Começar"
        if (!b.total && el('es-pv-msg')) {
          var sq = semQuestoes();
          el('es-pv-msg').innerHTML = '<p class="es-aviso">' + sq.txt + '</p>' + sq.botao('es-pv-imp');
          sq.ligar('es-pv-imp');
          el('es-pv-ir').disabled = true;
        }
      });
      function iniciar(aceitar) {
        var comp = el('es-pv-comp').value, fe = eixosEscolhidos('es-pv-x-');
        api('POST', base() + '/tentativas', { banca: fe.banca || '', orgao: fe.orgao || '', cargo: fe.cargo || '', ano_de: Number(fe.ano_de) || 0, modo: el('es-pv-modo').value, n: Number(el('es-pv-n').value) || 10, duracao_min: Number(el('es-pv-dur').value) || 0, competencias: comp ? [comp] : [], aceitar_menos: !!aceitar })
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
      var aval = ehAvaliacao(t); // diagnóstico e teste final: mesma tela, sem relógio
      var desvio = Date.parse(t.agora) - Date.now(), prazo = Date.parse(t.prazo_em), resp = t.respostas || {}, marcadas = {}, i = 0, fila = null, salvando = false;
      alvo.innerHTML = '<div class="es-prova"><div class="es-pv-topo">' + (aval ? '<div><b>' + TIPO_AVAL[t.modo] + '</b><span class="al-fino"> · sem relógio: responda no seu ritmo, pare quando quiser e continue depois' + (t.retomada ? ' · retomado de onde você parou' : '') + '</span></div>'
          : '<div><b id="es-pv-rel">--:--</b><span class="al-fino"> restantes · ' + (t.modo === 'simulado' ? 'simulado' : 'treino') + (t.retomada ? ' · retomada de onde você parou' : '') + '</span></div>') +
        '<span class="es-salvo" id="es-pv-salvo" role="status">' + (t.salvo_em ? 'Respostas salvas' : 'Nada respondido ainda') + '</span></div>' +
        '<div class="es-pv-nav" id="es-pv-nav"></div><div class="jr-caixa" id="es-pv-q"></div>' +
        '<div class="es-linha"><button class="al-bt fan" id="es-pv-ant">← Anterior</button><button class="al-bt fan" id="es-pv-prox">Próxima →</button><button class="al-bt fan" id="es-pv-marc">Marcar para voltar</button>' +
        (aval ? '<button class="al-bt fan" id="es-pv-sair">Salvar e continuar depois</button>' : '') + '<button class="al-bt ok" id="es-pv-env">' + (aval ? 'Concluir e ver o resultado' : 'Enviar a prova') + '</button></div><div id="es-pv-conf"></div></div>';
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
        el('es-pv-conf').innerHTML = '<div class="es-aviso">' + (faltam ? faltam + ' questão(ões) sem resposta. ' + (aval ? 'Elas contam como não acertadas — se quiser respondê-las depois, use "Salvar e continuar depois". ' : '') : 'Todas respondidas. ') + 'Depois de enviar não dá para alterar.' +
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
      if (el('es-pv-sair')) el('es-pv-sair').onclick = function sair() { if (salvando || fila) { if (fila) salvar(); return setTimeout(sair, 300); } ir('jornada', 'avaliacao'); };
      if (!aval) E.relogio = setInterval(tique, 500); // o diagnóstico não tem prazo na tela: o que vale é o que está salvo
      document.body.classList.add('es-em-prova');
      if (!aval) tique();
      pintar();
    }
    function resultado(alvo, t) {
      pararRelogio();
      // diagnóstico e teste final: o resultado é por disciplina e mora em Minha jornada (com a ordem sugerida e o antes × depois)
      if (ehAvaliacao(t)) { carregar(function () { botoesDaBarra(); ir('jornada', 'avaliacao'); }); return; }
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
      h += cartaoDiagnostico(E.painel, false);
      h += '<div class="jr-caixa"><h3>Meu caderno</h3><p class="al-sub">As suas tentativas nos exercícios, as anotações de cada aula, as marcações com nota e as anotações do caderno de erros — num lugar só, com busca e versão para imprimir.</p>' +
        '<div class="es-linha"><button class="al-bt fan" id="es-pl-cad">📓 Abrir o meu caderno</button></div></div>' + caixaConclusao();
      alvo.innerHTML = h;
      el('es-pl-cad').onclick = function () { ir('caderno'); };
      ligarConclusao(alvo);
      ligarAvaliacao(alvo);
      cada(alvo, '[data-ir-jr]', function (b) { b.onclick = function () { ir('jornada', 'avaliacao'); }; });
      el('es-pl-ok').onclick = function () {
        var d = {};
        cada(alvo, '[data-dia]', function (i) { d[i.getAttribute('data-dia')] = Number(i.value) || 0; });
        api('PUT', base() + '/plano', { disponibilidade: d, margem_pct: Number(el('es-pl-mg').value), data_alvo: el('es-pl-dt') ? el('es-pl-dt').value : '', motivo: r.plano ? 'disponibilidade alterada pelo aluno' : '' })
          .then(function (x) { pintarPlano(alvo, x); })
          .catch(function (e) { el('es-pl-msg').innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
      };
    }

    // ================= ESCRITA E ORAL (ADR-0010): questões abertas e a correção paga por IA =================
    // O aluno escreve (ou grava), pede a correção, VÊ O VALOR e só então confirma. O servidor reserva o teto,
    // corrige em segundo plano e a tela acompanha. A nota é ESTIMATIVA — dito sempre, junto do número.
    // Nada disto mora no navegador: o texto vai no pedido; o rascunho em memória só sobrevive à troca de aba.
    var TIPO_ABERTA = { curta: 'Resposta curta', discursiva: 'Discursiva', peca: 'Peça prática', oral: 'Arguição oral' };
    var ESTADO_PED = {
      orcado: ['aguardando a sua confirmação', 'cinza'], processando: ['corrigindo…', 'azul'], pronto: ['corrigida', 'verde'], aplicado: ['corrigida', 'verde'],
      falhou: ['não concluída — valor devolvido', 'verm'], cancelado: ['cancelado', 'cinza']
    };
    var RASCUNHO = {};          // questão → texto que o aluno estava escrevendo (só nesta visita)
    var CONSULTAS_MAX = 80;     // 80 consultas de 3 em 3 segundos = 4 minutos; depois a tela para e oferece "Atualizar"
    function seloPedido(p) {
      var x = ESTADO_PED[p.estado] || [p.estado, 'cinza'];
      if (p.estado === 'orcado' && p.aguardando_pagamento) x = ['aguardando o pagamento', 'ambar'];
      return '<span class="es-selo ' + x[1] + '">' + x[0] + '</span>';
    }
    function notaCurta(p) { return p && p.nota != null && (p.estado === 'pronto' || p.estado === 'aplicado') ? ' · nota estimada ' + p.nota + '/100' : ''; }
    function relogioTxt(seg) { seg = Math.max(0, Math.round(seg)); return Math.floor(seg / 60) + ':' + ('0' + (seg % 60)).slice(-2); }
    function milhar(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

    // A aba tem quatro telas: Escrita e oral (a lista) · Importar prova · Ler edital em PDF · Meus pedidos. O argumento
    // da rota diz qual: vazio = a lista; "importar"; "edital"; "pedidos"; "prova.<id>" e "edital.<id>" = um pedido;
    // qualquer outro = a questão aberta.
    function escrita(alvo, questaoId) {
      if (questaoId === 'edital') return lerEdital(alvo);
      if (typeof questaoId === 'string' && questaoId.indexOf('edital.') === 0) return telaEdital(alvo, questaoId.slice(7));
      if (questaoId === 'importar') return importarProva(alvo);
      if (questaoId === 'pedidos') return telaMeusPedidos(alvo);
      if (typeof questaoId === 'string' && questaoId.indexOf('prova.') === 0) return telaProva(alvo, questaoId.slice(6));
      api('GET', base() + '/abertas').then(function (r) {
        if (typeof questaoId === 'string' && questaoId) {
          var q = r.questoes.filter(function (x) { return x.id === questaoId; })[0];
          if (q) return abrirAberta(alvo, r, q);
        }
        listaAbertas(alvo, r);
      }).catch(function (e) { falha(alvo, e); });
    }
    function listaAbertas(alvo, r) {
      var h = subnav('') + '<div class="jr-caixa"><h3>Escrita e oral</h3>' +
        '<p class="al-sub">Questões discursivas, peças e arguição oral. Escreva (ou grave) a sua resposta e peça a correção por IA: ela lê a resposta contra os critérios da questão e mostra, critério a critério, o trecho em que se apoiou e o que faltou.</p>' +
        '<p class="al-sub"><b>A correção é paga com o seu saldo de IA.</b> Antes de corrigir você vê o valor máximo e confirma; depois paga só o que foi usado. A nota é uma <b>estimativa</b> — apoio de estudo, não a correção da banca.</p>' +
        (r.disponivel ? '' : '<p class="es-aviso">' + esc(r.motivo_indisponivel) + ' Você pode ler as questões e os critérios.</p>') + '</div>';
      if (!r.questoes.length) {
        alvo.innerHTML = h + '<div class="jr-caixa"><p class="al-sub">Este percurso ainda não tem questões discursivas, peças ou arguições.</p></div>';
        ligarSubnav(alvo);
        return;
      }
      var grupos = [], por = {};
      r.questoes.forEach(function (q) {
        var nome = q.disciplina || 'Geral', g = por[nome];
        if (!g) { g = por[nome] = { nome: nome, qs: [] }; grupos.push(g); }
        g.qs.push(q);
      });
      h += grupos.map(function (g, i) {
        return '<details class="es-acervo es-eo-grupo"' + (i === 0 ? ' open' : '') + '><summary><b>' + esc(g.nome) + '</b><span class="al-fino"> · ' + g.qs.length + ' questão(ões)</span></summary>' +
          g.qs.map(function (q) {
            var u = q.ultimo_pedido;
            return '<div class="es-eo-item"><p class="al-fino"><span class="es-selo ' + (q.tipo === 'oral' ? 'azul' : 'cinza') + '">' + esc(TIPO_ABERTA[q.tipo] || q.tipo) + '</span> ' +
              (u ? seloPedido(u) + esc(notaCurta(u)) : 'ainda sem correção') + '</p>' +
              '<p class="es-eo-enun">' + esc(String(q.enunciado).slice(0, 220)) + (q.enunciado.length > 220 ? '…' : '') + '</p>' +
              '<button class="al-bt peq" data-ab="' + esc(q.id) + '">' + (q.tipo === 'oral' ? '🎙️ Abrir e gravar' : '✍️ Abrir e escrever') + '</button></div>';
          }).join('') + '</details>';
      }).join('');
      alvo.innerHTML = h;
      ligarSubnav(alvo);
      cada(alvo, '[data-ab]', function (b) { b.onclick = function () { ir('escrita', b.getAttribute('data-ab')); }; });
    }
    function meusPedidos(out) {
      out.innerHTML = '<p class="al-sub">Carregando…</p>';
      api('GET', base() + '/pedidos').then(function (r) {
        if (!r.pedidos.length) { out.innerHTML = '<p class="al-sub">Nenhum pedido ainda.</p>'; return; }
        out.innerHTML = '<table class="es-tab es-eo-tab">' + r.pedidos.map(function (p) {
          var ehProva = p.tipo === 'prova', ehEdital = p.tipo === 'edital', rs = ehProva && p.prova && p.prova.resumo, re = ehEdital && p.edital && p.edital.resumo;
          return '<tr><td>' + dataBR(p.criado_em.slice(0, 10)) + '</td><td><a href="#" ' + (ehEdital ? 'data-pe="' + esc(p.id) : ehProva ? 'data-pp="' + esc(p.id) : 'data-pq="' + esc(p.questao_id)) + '">' + esc(String(p.questao || 'questão').slice(0, 90)) + '</a><br>' +
            (ehEdital ? seloEdital(p) + '<span class="al-fino">' + (re ? ' · ' + re.itens + ' itens em ' + re.disciplinas + ' disciplina(s)' + (re.pendentes ? ', ' + re.pendentes + ' a conferir' : '') : '') + '</span>'
              : ehProva ? seloProva(p) + '<span class="al-fino">' + (rs ? ' · ' + rs.lidas + ' questões lidas, ' + rs.aplicadas + ' no percurso' : '') + '</span>'
              : seloPedido(p) + '<span class="al-fino">' + esc(notaCurta(p)) + (p.tipo === 'oral' ? ' · oral · ' + audioCurto(p) : '') + '</span>') + '</td>' +
            '<td class="n">' + (p.estado === 'pronto' || p.estado === 'aplicado' ? esc(p.cobrado) : p.estado === 'orcado' || p.estado === 'processando' ? 'até ' + esc(p.orcamento) : '—') + '</td></tr>';
        }).join('') + '</table>';
        cada(out, '[data-pq]', function (a) { a.onclick = function (e) { e.preventDefault(); ir('escrita', a.getAttribute('data-pq')); }; });
        cada(out, '[data-pp]', function (a) { a.onclick = function (e) { e.preventDefault(); ir('escrita', 'prova.' + a.getAttribute('data-pp')); }; });
        cada(out, '[data-pe]', function (a) { a.onclick = function (e) { e.preventDefault(); ir('escrita', 'edital.' + a.getAttribute('data-pe')); }; });
      }).catch(function (e) { falha(out, e); });
    }

    // ---- o ÁUDIO da resposta oral: guardado por 6 meses, com download; depois do prazo, a tela diz quando foi apagado ----
    function audioCurto(p) {
      var a = p.audio || {};
      return a.apagado_em ? 'áudio apagado em ' + dataBR(String(a.apagado_em).slice(0, 10)) : a.ate ? 'áudio disponível até ' + dataBR(String(a.ate).slice(0, 10)) : 'áudio';
    }
    function avisoDoAudio(p) {
      var a = p.audio;
      if (p.tipo !== 'oral' || !a) return '';
      if (a.apagado_em) return '<p class="al-fino es-eo-audio">Áudio apagado em ' + dataBR(String(a.apagado_em).slice(0, 10)) + ' (prazo de 6 meses). A transcrição e a correção continuam aqui.</p>';
      return '<div class="es-nota-aba es-eo-audio"><b>Guardamos este áudio por 6 meses, até ' + dataBR(String(a.ate).slice(0, 10)) + '.</b> Se quiser mantê-lo, baixe agora.' +
        (a.disponivel ? '<div class="es-linha"><button class="al-bt peq fan" id="es-eo-baixar">⬇️ Baixar o áudio</button><span class="al-fino" id="es-eo-baixar-msg"></span></div>' : '') + '</div>';
    }
    // o endereço do arquivo é temporário e só o servidor o dá — e só a quem fez o pedido
    function ligarAudio(cx, p) {
      var b = el('es-eo-baixar');
      if (!b) return;
      b.onclick = function () {
        b.disabled = true;
        api('GET', base() + '/pedidos/' + p.id + '/audio').then(function (r) {
          b.disabled = false;
          var a = document.createElement('a');
          a.href = r.url; a.download = r.nome || 'resposta-oral'; a.target = '_blank'; a.rel = 'noopener';
          document.body.appendChild(a); a.click(); a.remove();
        }).catch(function (e) { b.disabled = false; el('es-eo-baixar-msg').textContent = e.message; });
      };
    }

    // ---- gravador (resposta oral): grava, mostra o tempo, deixa ouvir antes de enviar e regravar ----
    function gravador(caixa, maxSeg, aoMudar) {
      var G = { rec: null, stream: null, partes: [], blob: null, seg: 0, t0: 0, timer: null, url: '', fim: false };
      function soltarMicrofone() { if (G.stream) { G.stream.getTracks().forEach(function (t) { t.stop(); }); G.stream = null; } }
      function limpar() {
        if (G.timer) { clearInterval(G.timer); G.timer = null; }
        if (G.rec && G.rec.state !== 'inactive') { G.rec.onstop = null; try { G.rec.stop(); } catch (e) { /* já parou */ } }
        G.rec = null; soltarMicrofone();
        if (G.url) { URL.revokeObjectURL(G.url); G.url = ''; }
      }
      // sair da tela: além de limpar, o gravador fica ENCERRADO — o pedido de permissão que ainda estiver aberto não abre o microfone depois
      function encerrar() { G.fim = true; limpar(); }
      function tipoAceito() {
        var t = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
        for (var i = 0; i < t.length; i++) if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(t[i])) return t[i];
        return '';
      }
      function pintar(msg) {
        if (G.rec) {
          caixa.innerHTML = '<div class="es-eo-grav on"><span class="es-eo-ponto"></span><b id="es-eo-tempo">0:00</b><span class="al-fino"> de ' + relogioTxt(maxSeg) + '</span>' +
            '<button class="al-bt peq" id="es-eo-parar">■ Parar</button></div>';
          el('es-eo-parar').onclick = parar;
        } else if (G.blob) {
          caixa.innerHTML = '<div class="es-eo-grav"><audio controls src="' + G.url + '"></audio><span class="al-fino">' + relogioTxt(G.seg) + ' gravados — ouça antes de enviar.</span>' +
            '<button class="al-bt peq fan" id="es-eo-regravar">Regravar</button></div>';
          el('es-eo-regravar').onclick = function () { limpar(); G.blob = null; G.seg = 0; pintar(); aoMudar(); };
        } else {
          caixa.innerHTML = '<div class="es-eo-grav"><button class="al-bt" id="es-eo-gravar">🎙️ Gravar a resposta</button><span class="al-fino">Até ' + Math.round(maxSeg / 60) + ' minutos. O navegador vai pedir o microfone.</span></div>' +
            (msg ? '<p class="es-msg-erro">' + esc(msg) + '</p>' : '');
          el('es-eo-gravar').onclick = iniciar;
        }
      }
      function iniciar() {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          // o aluno saiu antes de responder ao pedido de permissão: solta o microfone na hora e não grava
          if (G.fim || !caixa.isConnected) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
          var tipo = tipoAceito();
          G.stream = stream; G.partes = [];
          // 32 kbps em mono é voz clara e deixa 5 minutos em pouco mais de 1 MB
          G.rec = new window.MediaRecorder(stream, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
          G.rec.ondataavailable = function (e) { if (e.data && e.data.size) G.partes.push(e.data); };
          G.rec.onstop = function () {
            var tipoFinal = (G.rec && G.rec.mimeType) || tipo || 'audio/webm';
            G.seg = Math.min(maxSeg, Math.max(1, Math.round((Date.now() - G.t0) / 1000)));
            G.blob = new Blob(G.partes, { type: tipoFinal });
            G.url = URL.createObjectURL(G.blob);
            G.rec = null; soltarMicrofone();
            if (G.timer) { clearInterval(G.timer); G.timer = null; }
            pintar(); aoMudar();
          };
          G.t0 = Date.now();
          G.rec.start(1000);
          pintar();
          G.timer = setInterval(function () {
            var s = (Date.now() - G.t0) / 1000, t = el('es-eo-tempo');
            if (t) t.textContent = relogioTxt(s);
            if (s >= maxSeg) parar(); // o teto é do servidor também: passou de 5 minutos, ele recusa
          }, 500);
        }).catch(function () { if (!G.fim && caixa.isConnected) pintar('Não foi possível usar o microfone. Confira a permissão do navegador para este site.'); });
      }
      function parar() { if (G.rec && G.rec.state !== 'inactive') G.rec.stop(); }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        caixa.innerHTML = '<p class="es-aviso">Este navegador não grava áudio. Abra esta página no Chrome, no Edge, no Firefox ou no Safari atualizado.</p>';
      } else pintar();
      return { blob: function () { return G.blob; }, seg: function () { return G.seg; }, gravando: function () { return !!G.rec; }, limpar: limpar, encerrar: encerrar };
    }
    function emBase64(blob) {
      return new Promise(function (ok, erro) {
        var fr = new FileReader();
        fr.onload = function () { ok(String(fr.result).split(',')[1] || ''); };
        fr.onerror = function () { erro(new Error('Não foi possível ler a gravação.')); };
        fr.readAsDataURL(blob);
      });
    }

    function abrirAberta(alvo, r, q) {
      var oral = q.pede === 'oral', grav = null, consulta = null;
      alvo.innerHTML = '<div class="es-linha"><button class="al-bt peq fan" id="es-eo-volta">← Voltar às questões</button></div>' +
        '<div class="jr-caixa es-eo-q"><p class="al-fino"><span class="es-selo ' + (oral ? 'azul' : 'cinza') + '">' + esc(TIPO_ABERTA[q.tipo] || q.tipo) + '</span>' + (q.disciplina ? ' ' + esc(q.disciplina) : '') + '</p>' +
        procedencia(q) + (q.apoio ? '<div class="es-apoio">' + texto(q.apoio) + '</div>' : '') + '<div class="es-enun">' + texto(q.enunciado) + '</div>' +
        '<div class="es-eo-rub"><b>Como a resposta é avaliada</b><ul>' + q.rubrica_publica.map(function (c) { return '<li>' + esc(c.criterio) + ' <span class="al-fino">· peso ' + c.peso + '</span></li>'; }).join('') + '</ul>' +
        '<p class="al-fino">Cada critério recebe de 0 a 3. O que vale o nível máximo de cada um não aparece antes: é o que a correção mede.</p></div></div>' +
        '<div class="jr-caixa"><h3>' + (oral ? 'Sua resposta falada' : 'Sua resposta') + '</h3>' +
        (oral ? '<p class="al-sub">Responda em voz alta, como na arguição. A gravação é transcrita e a transcrição é corrigida pelos critérios acima — você vê as duas.</p>' +
          '<p class="es-aviso es-eo-guarda">Guardamos o áudio da sua resposta por 6 meses (' + (r.limites.audio_retencao_dias || 183) + ' dias) e depois ele é apagado. A transcrição e a correção continuam com você. Se quiser manter o áudio, baixe-o na página do resultado.</p><div id="es-eo-grav"></div>'
          : '<textarea class="es-ta es-eo-ta" id="es-eo-ta" rows="' + (q.tipo === 'peca' ? 22 : 12) + '" maxlength="' + q.limite_caracteres + '" placeholder="Escreva a sua resposta inteira, como escreveria na prova."></textarea>' +
            '<p class="al-fino" id="es-eo-cont"></p>') +
        '<div class="es-linha"><button class="al-bt" id="es-eo-pedir"' + (r.disponivel && (!oral || r.transcricao) ? '' : ' disabled') + '>Pedir correção</button><span class="al-fino" id="es-eo-msg"></span></div>' +
        (r.disponivel ? (oral && !r.transcricao ? '<p class="es-aviso">A correção de resposta oral está indisponível no momento.</p>' : '') : '<p class="es-aviso">' + esc(r.motivo_indisponivel) + '</p>') +
        '</div><div id="es-eo-ped"></div><div class="jr-caixa"><h3>Correções anteriores desta questão</h3><div id="es-eo-hist"><p class="al-sub">Carregando…</p></div></div>';
      var ped = el('es-eo-ped'), msg = el('es-eo-msg'), bt = el('es-eo-pedir'), ta = el('es-eo-ta');
      function parar() { if (consulta) { clearTimeout(consulta); consulta = null; } }
      E.aoSair = function () { parar(); if (grav) grav.encerrar(); };
      function aqui() { return E.aba === 'escrita' && el('es-eo-ped') === ped; } // a tela ainda é esta
      el('es-eo-volta').onclick = function () { ir('escrita'); };
      if (ta) {
        ta.value = RASCUNHO[q.id] || '';
        var contar = function () {
          RASCUNHO[q.id] = ta.value;
          el('es-eo-cont').textContent = milhar(ta.value.length) + ' de ' + milhar(q.limite_caracteres) + ' caracteres' + (ta.value.length < r.limites.minimo_caracteres ? ' · escreva a resposta inteira para pedir a correção' : '');
        };
        ta.oninput = contar; contar();
      } else grav = gravador(el('es-eo-grav'), r.limites.oral_max_seg, function () { msg.textContent = ''; });

      // ---- pedir: cria o pedido e mostra o orçamento. Nada é cobrado aqui. ----
      bt.onclick = function () {
        var criar;
        msg.textContent = '';
        if (oral) {
          if (grav.gravando()) { msg.textContent = 'Pare a gravação antes de enviar.'; return; }
          if (!grav.blob()) { msg.textContent = 'Grave a sua resposta primeiro.'; return; }
          bt.disabled = true; msg.textContent = 'Enviando a gravação…';
          criar = emBase64(grav.blob()).then(function (b64) {
            return api('POST', base() + '/pedidos/arquivo', { nome: 'resposta-oral', mime: grav.blob().type, conteudo_base64: b64 });
          }).then(function (m) { return api('POST', base() + '/pedidos', { tipo: 'oral', questao_id: q.id, media_id: m.media_id, duracao_seg: grav.seg() }); });
        } else {
          bt.disabled = true; msg.textContent = 'Calculando o orçamento…';
          criar = api('POST', base() + '/pedidos', { tipo: 'correcao', questao_id: q.id, resposta: ta.value });
        }
        criar.then(function (x) { if (!aqui()) return; bt.disabled = false; msg.textContent = ''; orcamento(x); })
          .catch(function (e) { bt.disabled = false; msg.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
      };

      // ---- orçamento: o valor máximo, o saldo, e confirmar (ou pagar o que falta) ----
      function orcamento(x) {
        var p = x.pedido, o = x.orcamento, h = '<div class="jr-caixa es-eo-orc"><p class="al-rotulo">Orçamento da correção</p>';
        if (!o.disponivel) { ped.innerHTML = h + '<p class="es-aviso">' + esc(o.motivo_indisponivel) + '</p></div>'; return; }
        if (o.cobranca === 'isento') h += '<p>Sua conta é isenta de cobrança de IA.</p><div class="es-linha"><button class="al-bt" id="es-eo-ok">Corrigir agora</button>';
        else {
          h += '<p class="es-eo-valor">até ' + esc(o.orcamento) + '</p>' +
            '<p class="al-sub">É o valor máximo. Depois de corrigir, você paga só o que foi usado e a diferença volta ao saldo. Se a correção não sair, você não paga nada. Seu saldo de IA: <b>' + esc(o.saldo) + '</b>.</p>';
          if (o.saldo_suficiente) h += '<div class="es-linha"><button class="al-bt" id="es-eo-ok">Confirmar e corrigir</button>';
          else {
            h += '<p class="es-aviso">Faltam <b>' + esc(o.falta) + '</b> de saldo para esta correção.</p>' +
              (o.pagamento_online ? '<p class="al-sub">Será cobrado <b>' + esc(o.recarga) + '</b> no Mercado Pago (é o que falta, arredondado para cima, com o mínimo da recarga). O valor entra como saldo de IA; a correção começa sozinha quando o pagamento for confirmado, e o que sobrar fica como saldo de IA na sua conta.</p>' +
                '<div class="es-linha"><button class="al-bt" id="es-eo-pagar">Pagar ' + esc(o.recarga) + ' e corrigir</button>'
                : '<p class="al-sub">A recarga online está indisponível no momento.</p><div class="es-linha">');
          }
        }
        h += '<button class="al-bt fan" id="es-eo-nao">Cancelar</button><span class="al-fino" id="es-eo-omsg"></span></div></div>';
        ped.innerHTML = h;
        var omsg = el('es-eo-omsg');
        var erroNoOrcamento = function (e) {
          // o valor ou o saldo mudou desde que o orçamento foi mostrado: mostra o de agora, com o motivo
          api('GET', base() + '/pedidos/' + p.id).then(function (y) {
            if (!aqui()) return;
            if (y.pedido.estado === 'orcado' && y.orcamento) { orcamento(y); if (el('es-eo-omsg')) el('es-eo-omsg').innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; }
            else acompanhar(p.id);
          }).catch(function () { if (omsg) omsg.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
        };
        el('es-eo-nao').onclick = function () { api('POST', base() + '/pedidos/' + p.id + '/cancelar').catch(function () {}); ped.innerHTML = ''; };
        if (el('es-eo-ok')) el('es-eo-ok').onclick = function () {
          this.disabled = true;
          // o aceite é DESTE valor, o que está na tela: vai no cabeçalho, e o servidor recusa se o orçamento passou dele
          api('POST', base() + '/pedidos/' + p.id + '/confirmar', null, o.orcamento_milesimos || 1).then(function () { if (aqui()) acompanhar(p.id); }).catch(erroNoOrcamento);
        };
        if (el('es-eo-pagar')) el('es-eo-pagar').onclick = function () {
          var btPagar = this;
          btPagar.disabled = true; omsg.textContent = 'Abrindo o pagamento…';
          api('POST', base() + '/pedidos/' + p.id + '/recarga', { aceite_milesimos: o.orcamento_milesimos }).then(function (x2) {
            if (x2.init_point) location.href = x2.init_point; // volta para esta questão; o crédito entra pela confirmação do Mercado Pago
            else { btPagar.disabled = false; omsg.innerHTML = '<span class="es-msg-erro">O pagamento não pôde ser aberto. Tente de novo.</span>'; }
          }).catch(erroNoOrcamento);
        };
      }

      // ---- acompanhar: consulta de 3 em 3 segundos, e PARA (sai da tela, terminou ou passou do limite) ----
      function acompanhar(id, n) {
        parar();
        n = n || 0;
        api('GET', base() + '/pedidos/' + id).then(function (x) {
          if (!aqui()) return;
          var p = x.pedido;
          if (p.estado === 'pronto' || p.estado === 'aplicado') { resultado(p); historico(); if (window.AcademyCarteiraUI) window.AcademyCarteiraUI.depois(); return; }
          if (p.estado === 'falhou') {
            ped.innerHTML = '<div class="jr-caixa"><p class="al-rotulo">Correção não concluída</p><p class="es-aviso">' + esc(p.erro || 'A correção não foi concluída. O valor reservado voltou ao seu saldo.') + '</p>' +
              '<p class="al-sub">Nada foi cobrado. A sua resposta continua aí em cima: é só pedir de novo.</p></div>';
            return;
          }
          if (p.estado === 'cancelado') { ped.innerHTML = ''; return; }
          if (p.estado === 'orcado' && !p.aguardando_pagamento) { orcamento(x); return; }
          var esperaPagamento = p.estado === 'orcado';
          if (n >= CONSULTAS_MAX) {
            ped.innerHTML = '<div class="jr-caixa"><p class="al-rotulo">' + (esperaPagamento ? 'Aguardando o pagamento' : 'Ainda corrigindo') + '</p><p class="al-sub">' +
              (esperaPagamento ? 'O Mercado Pago ainda não confirmou o pagamento. Assim que confirmar, a correção começa sozinha — você pode sair desta página.' : 'Está demorando mais que o normal. O pedido continua rodando; se não sair, o valor volta sozinho ao saldo.') +
              '</p><div class="es-linha"><button class="al-bt peq" id="es-eo-atual">Atualizar</button>' + (esperaPagamento ? '<button class="al-bt peq fan" id="es-eo-desiste">Cancelar o pedido</button>' : '') + '</div></div>';
            el('es-eo-atual').onclick = function () { acompanhar(id, 0); };
            if (el('es-eo-desiste')) el('es-eo-desiste').onclick = function () { api('POST', base() + '/pedidos/' + id + '/cancelar').then(function () { ped.innerHTML = ''; historico(); }).catch(function () {}); };
            return;
          }
          if (!n || !el('es-eo-and')) ped.innerHTML = '<div class="jr-caixa" id="es-eo-and"><p class="al-rotulo">' + (esperaPagamento ? 'Aguardando o pagamento' : 'Corrigindo a sua resposta') + '</p>' +
            '<p class="al-sub"><span class="es-eo-gira"></span> ' + (esperaPagamento ? 'A correção começa sozinha quando o Mercado Pago confirmar o pagamento.' : (oral ? 'Transcrevendo a gravação e corrigindo pelos critérios. ' : 'Lendo a resposta contra cada critério. ') + 'Costuma levar menos de um minuto.') + '</p></div>';
          consulta = setTimeout(function () { acompanhar(id, n + 1); }, 3000);
        }).catch(function (e) { if (aqui()) falha(ped, e); });
      }

      // ---- resultado: a nota (estimativa), critério a critério com o trecho citado e o que faltou ----
      function resultado(p) {
        var x = p.resultado || {}, c = p.contestacao;
        var h = '<div class="jr-caixa es-eo-resultado"><p class="al-rotulo">Correção por IA · ' + dataBR(p.criado_em.slice(0, 10)) + '</p>' +
          '<div class="es-eo-nota"><b>' + (x.nota == null ? '—' : x.nota) + '</b><i>/100</i> <span class="es-selo ambar">estimativa</span></div>' +
          '<p class="al-fino">' + esc(x.aviso || 'Nota estimada por IA: apoio de estudo, não a correção da banca.') + '</p>';
        if (x.transcricao) h += '<details class="es-fontes" open><summary>O que foi ouvido na sua gravação' + (x.duracao_seg ? ' (' + relogioTxt(x.duracao_seg) + ')' : '') + '</summary><div class="es-apoio">' + texto(x.transcricao) + '</div>' +
          '<p class="al-fino">Transcrição automática: pode trocar uma palavra ou outra. A correção foi feita sobre este texto.</p></details>';
        else if (p.entrada && p.entrada.resposta) h += '<details class="es-fontes"><summary>A resposta que foi corrigida</summary><div class="es-apoio">' + texto(p.entrada.resposta) + '</div></details>';
        h += avisoDoAudio(p);
        h += (x.criterios || []).map(function (k) {
          return '<div class="es-eo-crit n' + k.nivel + '"><div class="es-eo-crit-cab"><b>' + esc(k.criterio) + '</b><span class="al-fino">peso ' + k.peso + '</span><span class="es-eo-nivel">nível ' + k.nivel + ' de 3</span></div>' +
            (k.trecho ? '<blockquote>“' + esc(k.trecho) + '”</blockquote>' : (k.nivel > 0 ? '<p class="al-fino">A correção não apontou, na sua resposta, um trecho que sustente este nível — leia este critério com mais desconfiança.</p>' : '<p class="al-fino">A resposta não tratou deste critério.</p>')) +
            (k.faltou ? '<p><b>O que faltou:</b> ' + esc(k.faltou) + '</p>' : '') + '</div>';
        }).join('');
        if ((x.erros_criticos || []).length) h += '<div class="es-aviso"><b>Erros críticos encontrados</b><ul>' + x.erros_criticos.map(function (e) {
          return '<li>' + esc(e.erro) + (e.trecho ? ' — “' + esc(e.trecho) + '”' : '') + '</li>';
        }).join('') + '</ul></div>';
        if (x.comentario) h += '<div class="es-eo-coment"><b>Para a próxima tentativa</b>' + texto(x.comentario) + '</div>';
        h += '<p class="al-fino">Cobrado: ' + esc(p.cobrado) + ' (o orçamento era de até ' + esc(p.orcamento) + '). Esta correção não muda o seu painel de competências.</p>';
        h += c ? '<div class="es-nota-aba rev"><b>Você discordou desta correção em ' + dataBR(String(c.em).slice(0, 10)) + '.</b><p>' + esc(c.motivo) + '</p>' +
            (c.resposta ? '<p><b>Resposta da equipe:</b> ' + esc(c.resposta) + '</p>' : '<p class="al-fino">A equipe do curso vê a sua discordância. Não há devolução automática.</p>') + '</div>'
          : '<div class="es-linha"><button class="al-bt peq fan" id="es-eo-disc">Discordo da correção</button></div><div id="es-eo-disc-cx"></div>';
        h += '</div>';
        ped.innerHTML = h;
        ligarAudio(ped, p);
        if (el('es-eo-disc')) el('es-eo-disc').onclick = function () {
          el('es-eo-disc-cx').innerHTML = '<label class="es-campo es-anot">Em que ponto a correção errou?<textarea class="es-ta" id="es-eo-mot" rows="3" maxlength="1000" placeholder="Ex.: o critério 2 foi tratado no terceiro parágrafo."></textarea></label>' +
            '<div class="es-linha"><button class="al-bt peq" id="es-eo-mot-ok">Registrar a discordância</button><span class="al-fino" id="es-eo-mot-msg">Fica registrado e a equipe do curso vê. Não há devolução automática.</span></div>';
          el('es-eo-mot-ok').onclick = function () {
            api('POST', base() + '/pedidos/' + p.id + '/contestar', { motivo: el('es-eo-mot').value }).then(function (y) { if (aqui()) resultado(y.pedido); })
              .catch(function (e) { el('es-eo-mot-msg').innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
          };
        };
      }

      // ---- histórico da questão; ao abrir, retoma o pedido em curso ou mostra a última correção ----
      function historico(aoAbrir) {
        api('GET', base() + '/pedidos?questao=' + encodeURIComponent(q.id)).then(function (y) {
          if (!aqui()) return;
          var out = el('es-eo-hist'), prontos = y.pedidos.filter(function (p) { return p.estado === 'pronto' || p.estado === 'aplicado'; });
          out.innerHTML = prontos.length ? '<table class="es-tab es-eo-tab">' + prontos.map(function (p) {
            return '<tr><td>' + dataBR(p.criado_em.slice(0, 10)) + '</td><td><a href="#" data-ver="' + esc(p.id) + '">nota estimada ' + p.nota + '/100</a>' + (p.contestado ? ' <span class="al-fino">· você discordou</span>' : '') + '</td><td class="n">' + esc(p.cobrado) + '</td></tr>';
          }).join('') + '</table>' : '<p class="al-sub">Nenhuma correção desta questão ainda.</p>';
          cada(out, '[data-ver]', function (a) {
            a.onclick = function (e) {
              e.preventDefault(); parar();
              api('GET', base() + '/pedidos/' + a.getAttribute('data-ver')).then(function (z) { if (aqui()) { resultado(z.pedido); ped.scrollIntoView({ block: 'start' }); } }).catch(function (er) { falha(ped, er); });
            };
          });
          if (!aoAbrir) return;
          var u = y.pedidos.filter(function (p) { return p.estado !== 'cancelado'; })[0];
          if (!u) return;
          if (u.estado === 'processando' || (u.estado === 'orcado' && u.aguardando_pagamento)) acompanhar(u.id);
          if (u.estado === 'processando' || u.estado === 'orcado' || u.estado === 'falhou') {
            // o texto do pedido em aberto volta à caixa (o aluno foi ao Mercado Pago e voltou; a página recarregou)
            if (ta && !ta.value) api('GET', base() + '/pedidos/' + u.id).then(function (z) { if (aqui() && !ta.value && z.pedido.entrada.resposta) { ta.value = z.pedido.entrada.resposta; ta.oninput(); } }).catch(function () {});
          } else if (prontos.length) api('GET', base() + '/pedidos/' + prontos[0].id).then(function (z) { if (aqui() && !ped.innerHTML) resultado(z.pedido); }).catch(function () {});
        }).catch(function (e) { if (aqui()) falha(el('es-eo-hist'), e); });
      }
      historico(true);
    }

    // ================= IMPORTAR PROVA EM PDF (ADR-0010, fase 3) =================
    // O usuário envia o caderno e o gabarito, diz de onde é a prova e para onde vão as questões. O servidor lê o
    // PDF sem cobrar e mostra o ORÇAMENTO (páginas, quantas são escaneadas, lotes, valor máximo). Confirmado, a
    // leitura roda em segundo plano, lote a lote. O resultado é uma lista para CONFERIR: as prontas já vêm
    // marcadas; as "a revisar" só entram confirmadas ou editadas, uma a uma. Adicionar ao percurso não custa nada.
    var ESTADO_PROVA = { orcado: ['aguardando a sua confirmação', 'cinza'], processando: ['lendo…', 'azul'], pronto: ['lida — falta adicionar', 'ambar'], aplicado: ['adicionada ao percurso', 'verde'],
      falhou: ['não concluída — valor devolvido', 'verm'], cancelado: ['cancelado', 'cinza'] };
    var FORM_PROVA = {};        // o que o usuário digitou no formulário (só nesta visita; os arquivos não ficam)
    var CONSULTAS_PROVA = 120;  // 120 consultas de 5 em 5 segundos = 10 minutos sem o lote avançar; depois, "Atualizar"
    function subnav(atual) {
      return '<div class="es-eo-sub">' + [['', 'Escrita e oral'], ['importar', 'Importar prova'], ['edital', 'Ler edital em PDF'], ['pedidos', 'Meus pedidos']].map(function (x) {
        return '<button data-sub="' + x[0] + '"' + (x[0] === atual ? ' class="on"' : '') + '>' + x[1] + '</button>';
      }).join('') + '</div>';
    }
    function ligarSubnav(alvo) { cada(alvo, '[data-sub]', function (b) { b.onclick = function () { ir('escrita', b.getAttribute('data-sub') || undefined); }; }); }
    function megas(n) { return (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace('.', ',') + ' MB'; }
    function seloProva(p) {
      var x = ESTADO_PROVA[p.estado] || [p.estado, 'cinza'];
      if (p.estado === 'orcado' && p.aguardando_pagamento) x = ['aguardando o pagamento', 'ambar'];
      return '<span class="es-selo ' + x[1] + '">' + x[0] + '</span>';
    }

    function telaMeusPedidos(alvo) {
      alvo.innerHTML = subnav('pedidos') + '<div class="jr-caixa"><h3>Meus pedidos</h3><p class="al-sub">Tudo o que você pediu neste percurso — correções, provas importadas e editais lidos —, com o estado e o valor cobrado.</p><div id="es-eo-meus"></div></div>';
      ligarSubnav(alvo);
      meusPedidos(el('es-eo-meus'));
    }

    // ---- envio do PDF: direto ao armazenamento (URL assinada, com progresso); sem ele, ou se o navegador
    // não conseguir, pelo caminho pequeno (até o limite do corpo da requisição) ----
    function enviarPdf(arq, o, aoProgresso) {
      if (!/\.pdf$/i.test(arq.name) && arq.type !== 'application/pdf') return Promise.reject(new Error('"' + arq.name + '" não é um PDF.'));
      if (arq.size > o.limites.pdf_max_bytes) return Promise.reject(new Error('"' + arq.name + '" tem ' + megas(arq.size) + ' — o limite é de ' + megas(o.limites.pdf_max_bytes) + '.'));
      var pequeno = function () {
        if (arq.size > o.limites.base64_max_bytes) return Promise.reject(new Error('Não foi possível enviar "' + arq.name + '" (' + megas(arq.size) + '). O envio de arquivo acima de ' + megas(o.limites.base64_max_bytes) + ' está indisponível no momento.'));
        aoProgresso(-1);
        return emBase64(arq).then(function (b64) { return api('POST', base() + '/pedidos/arquivo', { nome: arq.name, mime: 'application/pdf', conteudo_base64: b64 }); }).then(function (m) { return m.media_id; });
      };
      if (!o.envio_grande) return pequeno();
      return api('POST', base() + '/pedidos/arquivo-grande', { nome: arq.name, mime: 'application/pdf', tamanho: arq.size }).then(function (u) {
        return new Promise(function (ok, erro) {
          var x = new XMLHttpRequest();
          x.open('PUT', u.upload_url);
          x.setRequestHeader('Content-Type', 'application/pdf');
          x.upload.onprogress = function (ev) { if (ev.lengthComputable) aoProgresso(ev.loaded / ev.total); };
          x.onload = function () { if (x.status >= 200 && x.status < 300) ok(u); else erro(new Error('O armazenamento recusou o arquivo (' + x.status + ').')); };
          x.onerror = function () { erro(new Error('O envio do arquivo foi interrompido.')); };
          x.send(arq);
        });
      }).then(function (u) { return api('POST', base() + '/pedidos/arquivo-grande/' + u.media_id + '/confirmar'); })
        .then(function (m) { return m.media_id; })
        .catch(function (e) { if (arq.size <= o.limites.base64_max_bytes) return pequeno(); throw e; });
    }

    function importarProva(alvo) {
      api('GET', base() + '/pedidos/prova/opcoes').then(function (o) {
        var F = FORM_PROVA, v = function (k) { return esc(F[k] || ''); };
        var h = subnav('importar') + '<div class="jr-caixa"><h3>Importar prova em PDF</h3>' +
          '<p class="al-sub">Envie o caderno de uma prova e o gabarito. O sistema separa as questões, casa cada uma com a letra do gabarito e confere o texto com a página. Você revisa a lista e escolhe o que entra no seu percurso — para praticar e fazer simulado como com qualquer questão.</p>' +
          '<p class="al-sub"><b>A leitura é paga com o seu saldo de IA.</b> Antes de ler você vê o valor máximo e confirma; depois paga só o que foi usado. Adicionar as questões ao percurso não custa nada.</p>' +
          (o.disponivel ? '' : '<p class="es-aviso">' + esc(o.motivo_indisponivel) + '</p>') + '</div>';
        if (!o.disponivel) { alvo.innerHTML = h; ligarSubnav(alvo); return; }
        var destinos = o.destinos.map(function (d) {
          return '<option value="' + esc(d.slug) + '"' + (F.destino === d.slug ? ' selected' : '') + '>' + (d.particular ? 'Meu percurso: ' : 'Curso (entra em rascunho): ') + esc(d.titulo) + '</option>';
        }).join('') + (o.pode_novo ? '<option value="+"' + (F.destino === '+' || !o.destinos.length ? ' selected' : '') + '>➕ Novo percurso particular…</option>' : '');
        h += '<div class="jr-caixa es-ip"><h3>1. Os arquivos</h3>' +
          '<label class="es-campo">Caderno da prova (PDF, até ' + megas(o.limites.pdf_max_bytes) + ')<input type="file" id="es-ip-cad" accept="application/pdf,.pdf"></label>' +
          '<p class="al-fino">Cada pedido lê até ' + o.limites.paginas_max + ' páginas; num PDF maior você escolhe a faixa depois. Página escaneada (imagem) também é lida, e custa mais.</p>' +
          '<div class="es-ip-gab"><b>Gabarito</b> <label><input type="radio" name="es-ip-g" value="pdf"' + (F.gabModo === 'texto' ? '' : ' checked') + '> PDF</label> <label><input type="radio" name="es-ip-g" value="texto"' + (F.gabModo === 'texto' ? ' checked' : '') + '> colar o texto</label></div>' +
          '<label class="es-campo" id="es-ip-gab-pdf">Gabarito (PDF, até ' + o.limites.gabarito_paginas_max + ' páginas)<input type="file" id="es-ip-gab" accept="application/pdf,.pdf"></label>' +
          '<label class="es-campo" id="es-ip-gab-txt">Gabarito (cole a tabela de respostas)<textarea class="es-ta" id="es-ip-gabt" rows="5" maxlength="' + o.limites.gabarito_texto_max + '" placeholder="1-A  2-C  3-anulada  4-E …">' + v('gabTexto') + '</textarea></label>' +
          '<label class="es-campo">O gabarito é<select id="es-ip-sit"><option value="definitivo"' + (F.sit === 'preliminar' ? '' : ' selected') + '>definitivo</option><option value="preliminar"' + (F.sit === 'preliminar' ? ' selected' : '') + '>preliminar</option></select></label>' +
          '<h3>2. De onde é a prova</h3><p class="al-fino">Questão de prova entra com a procedência — é ela que permite filtrar por banca, órgão e ano. Banca ou órgão, concurso e ano são obrigatórios.</p>' +
          '<div class="es-ip-grade">' +
          '<label class="es-campo">Banca<input id="es-ip-banca" maxlength="80" value="' + v('banca') + '" placeholder="FGV, FCC, Cebraspe…"></label>' +
          '<label class="es-campo">Órgão<input id="es-ip-orgao" maxlength="120" value="' + v('orgao') + '" placeholder="TRT-10, TJDFT…"></label>' +
          '<label class="es-campo">Concurso *<input id="es-ip-concurso" maxlength="160" value="' + v('concurso') + '" placeholder="Analista Judiciário — área judiciária"></label>' +
          '<label class="es-campo">Ano *<input id="es-ip-ano" type="number" min="1950" max="2100" value="' + v('ano') + '"></label>' +
          '<label class="es-campo">Cargo<input id="es-ip-cargo" maxlength="120" value="' + v('cargo') + '"></label>' +
          '<label class="es-campo">Tipo de caderno<input id="es-ip-caderno" maxlength="40" value="' + v('caderno') + '" placeholder="Tipo 1 — branca"></label>' +
          '<label class="es-campo">Etapa<input id="es-ip-etapa" maxlength="60" value="' + v('etapa') + '" placeholder="Prova objetiva"></label>' +
          '<label class="es-campo">Fonte (de onde você baixou)<input id="es-ip-fonte" maxlength="400" value="' + v('fonte') + '" placeholder="endereço da página da banca"></label>' +
          '</div><p class="al-fino">Informe o tipo de caderno quando o gabarito trouxer mais de um: só o do seu caderno é lido.</p>' +
          '<h3>3. Para onde vão as questões</h3>' +
          '<label class="es-campo">Destino<select id="es-ip-dest">' + destinos + '</select></label>' +
          '<label class="es-campo" id="es-ip-novo-cx">Nome do percurso novo<input id="es-ip-novo" maxlength="120" value="' + v('novo') + '" placeholder="Provas do TRT — FCC"></label>' +
          '<p class="al-fino">O percurso particular é só seu: ninguém mais vê, nem as questões que você puser nele.</p>' +
          '<div class="es-linha"><button class="al-bt" id="es-ip-ok">Enviar e calcular o orçamento</button><span class="al-fino" id="es-ip-msg">Nada é cobrado nesta etapa.</span></div>' +
          '<div class="es-barra es-ip-barra" id="es-ip-barra" hidden><i style="width:0"></i></div></div>';
        alvo.innerHTML = h;
        ligarSubnav(alvo);
        var msg = el('es-ip-msg'), bt = el('es-ip-ok'), barra = el('es-ip-barra');
        function modoGab() { var r = alvo.querySelector('input[name="es-ip-g"]:checked'); return r ? r.value : 'pdf'; }
        function mostrar() {
          el('es-ip-gab-pdf').hidden = modoGab() !== 'pdf'; el('es-ip-gab-txt').hidden = modoGab() !== 'texto';
          el('es-ip-novo-cx').hidden = el('es-ip-dest').value !== '+';
        }
        function guardar() {
          F.gabModo = modoGab(); F.gabTexto = el('es-ip-gabt').value; F.sit = el('es-ip-sit').value; F.destino = el('es-ip-dest').value; F.novo = el('es-ip-novo').value;
          ['banca', 'orgao', 'concurso', 'ano', 'cargo', 'caderno', 'etapa', 'fonte'].forEach(function (k) { F[k] = el('es-ip-' + k).value; });
        }
        cada(alvo, 'input[name="es-ip-g"]', function (r) { r.onchange = mostrar; });
        el('es-ip-dest').onchange = mostrar;
        cada(alvo, '.es-ip input, .es-ip textarea, .es-ip select', function (c) { if (c.type !== 'file') c.addEventListener('input', guardar); });
        mostrar();
        function aqui() { return E.aba === 'escrita' && el('es-ip-ok') === bt; }
        function progresso(rotulo) {
          return function (fr) {
            if (!aqui()) return;
            barra.hidden = false;
            barra.firstChild.style.width = (fr < 0 ? 100 : Math.round(fr * 100)) + '%';
            msg.textContent = rotulo + (fr < 0 ? '…' : ' — ' + Math.round(fr * 100) + '%');
          };
        }
        bt.onclick = function () {
          guardar();
          var cad = el('es-ip-cad').files[0], gab = modoGab() === 'pdf' ? el('es-ip-gab').files[0] : null;
          var erroForm = !cad ? 'Escolha o PDF do caderno.' : modoGab() === 'pdf' && !gab ? 'Escolha o PDF do gabarito (ou cole o texto).' : modoGab() === 'texto' && F.gabTexto.replace(/\s/g, '').length < 3 ? 'Cole o gabarito.'
            : !(F.banca || F.orgao) ? 'Informe a banca ou o órgão.' : !F.concurso ? 'Informe o concurso.' : !Number(F.ano) ? 'Informe o ano da prova.' : F.destino === '+' && F.novo.trim().length < 3 ? 'Dê um nome ao percurso novo.' : !F.destino ? 'Escolha o destino.' : '';
          if (erroForm) { msg.innerHTML = '<span class="es-msg-erro">' + esc(erroForm) + '</span>'; return; }
          bt.disabled = true;
          var ids = {};
          enviarPdf(cad, o, progresso('Enviando o caderno')).then(function (id) {
            ids.caderno = id;
            return gab ? enviarPdf(gab, o, progresso('Enviando o gabarito')) : '';
          }).then(function (id) {
            ids.gabarito = id;
            if (aqui()) { barra.firstChild.style.width = '100%'; msg.textContent = 'Lendo o PDF e calculando o orçamento…'; }
            return api('POST', base() + '/pedidos', { tipo: 'prova', caderno_media_id: ids.caderno, gabarito_media_id: ids.gabarito || undefined, gabarito_texto: gab ? undefined : F.gabTexto,
              procedencia: { banca: F.banca, orgao: F.orgao, concurso: F.concurso, ano: Number(F.ano), cargo: F.cargo, caderno: F.caderno, etapa: F.etapa, fonte: F.fonte },
              gabarito_situacao: F.sit, destino: F.destino === '+' ? { novo: { titulo: F.novo } } : { escopo: F.destino } });
          }).then(function (x) { if (aqui()) ir('escrita', 'prova.' + x.pedido.id); })
            .catch(function (e) { if (!aqui()) return; bt.disabled = false; barra.hidden = true; msg.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
        };
      }).catch(function (e) { falha(alvo, e); });
    }

    // ---- um pedido de prova: orçamento → leitura (lote a lote) → lista para conferir → adicionar ----
    function telaProva(alvo, id) {
      var consulta = null, EDICAO = {}, MARCA = {}, FILTRO = 'todas';
      alvo.innerHTML = subnav('') + '<div class="es-linha"><button class="al-bt peq fan" id="es-ip-volta">← Meus pedidos</button></div><div id="es-ip-ped"><p class="al-sub">Carregando…</p></div>';
      ligarSubnav(alvo);
      var ped = el('es-ip-ped');
      el('es-ip-volta').onclick = function () { ir('escrita', 'pedidos'); };
      function parar() { if (consulta) { clearTimeout(consulta); consulta = null; } }
      E.aoSair = parar;
      function aqui() { return E.aba === 'escrita' && el('es-ip-ped') === ped; }
      function cab(p) { return '<p class="al-rotulo">Prova em PDF · ' + esc(p.prova.titulo) + '</p><p class="al-fino">' + esc(p.prova.arquivo) + ' ' + seloProva(p) + '</p>'; }
      function carregar() {
        api('GET', base() + '/pedidos/' + id).then(function (x) { if (aqui()) pintar(x); }).catch(function (e) { if (aqui()) falha(ped, e); });
      }
      function pintar(x) {
        var p = x.pedido;
        parar();
        if (p.tipo !== 'prova') { ir('escrita', p.tipo === 'edital' ? 'edital.' + p.id : p.questao_id); return; }
        if (p.estado === 'orcado' && !p.aguardando_pagamento) return orcamento(x);
        if (p.estado === 'orcado' || p.estado === 'processando') return acompanhar(x, 0, '');
        if (p.estado === 'pronto' || p.estado === 'aplicado') return resultado(p);
        ped.innerHTML = '<div class="jr-caixa">' + cab(p) + (p.estado === 'falhou' ? '<p class="es-aviso">' + esc(p.erro || 'A leitura não foi concluída. O valor reservado voltou ao seu saldo.') + '</p><p class="al-sub">Nada foi cobrado.</p>' : '<p class="al-sub">Pedido cancelado.</p>') +
          '<div class="es-linha"><button class="al-bt peq" id="es-ip-de-novo">Importar outra prova</button></div></div>';
        el('es-ip-de-novo').onclick = function () { ir('escrita', 'importar'); };
      }

      // o orçamento: o que será lido, o valor máximo e o saldo. A faixa de páginas é ajustável (reorça).
      function orcamento(x) {
        var p = x.pedido, o = x.orcamento, d = o.detalhe || p.prova, h = '<div class="jr-caixa es-eo-orc">' + cab(p) + '<p class="al-rotulo">Orçamento da leitura</p>';
        if (!o.disponivel) { ped.innerHTML = h + '<p class="es-aviso">' + esc(o.motivo_indisponivel) + '</p></div>'; return; }
        h += '<ul class="es-ip-det"><li>O PDF tem <b>' + d.total_paginas + '</b> página(s); serão lidas <b>' + d.paginas + '</b> (da ' + d.de + ' à ' + d.ate + ').</li>' +
          '<li>' + (d.escaneadas ? '<b>' + d.escaneadas + '</b> página(s) escaneada(s) — imagem, sem texto copiável: são lidas como imagem, custam mais e o texto delas não tem como ser conferido automaticamente (as questões vêm marcadas para você conferir).' : 'Todas as páginas têm texto copiável: o texto de cada questão é conferido com a página.') + '</li>' +
          '<li>A leitura é feita em <b>' + d.lotes + '</b> lote(s) de até ' + d.paginas_por_lote + ' páginas, mais a leitura do gabarito.</li></ul>' +
          '<div class="es-ip-faixa"><label class="es-campo">Da página<input type="number" id="es-ip-de" min="1" max="' + d.total_paginas + '" value="' + d.de + '"></label>' +
          '<label class="es-campo">até a página<input type="number" id="es-ip-ate" min="1" max="' + d.total_paginas + '" value="' + d.ate + '"></label>' +
          '<button class="al-bt peq fan" id="es-ip-reorcar">Recalcular</button></div>' +
          '<p class="al-fino">Tire a capa, as instruções e as folhas de rascunho para pagar menos. Cada pedido lê até ' + d.max_paginas + ' páginas.</p>';
        if (o.cobranca === 'isento') h += '<p>Sua conta é isenta de cobrança de IA.</p><div class="es-linha"><button class="al-bt" id="es-ip-conf">Ler agora</button>';
        else {
          h += '<p class="es-eo-valor">até ' + esc(o.orcamento) + '</p>' +
            '<p class="al-sub">É o valor máximo. Terminada a leitura, você paga só o que foi usado e a diferença volta ao saldo. Se a leitura não sair, você não paga nada. Seu saldo de IA: <b>' + esc(o.saldo) + '</b>.</p>';
          if (o.saldo_suficiente) h += '<div class="es-linha"><button class="al-bt" id="es-ip-conf">Confirmar e ler a prova</button>';
          else {
            h += '<p class="es-aviso">Faltam <b>' + esc(o.falta) + '</b> de saldo para esta leitura.</p>' +
              (o.pagamento_online ? '<p class="al-sub">Será cobrado <b>' + esc(o.recarga) + '</b> no Mercado Pago (é o que falta, arredondado para cima, com o mínimo da recarga). O valor entra como saldo de IA; a leitura começa sozinha quando o pagamento for confirmado, e o que sobrar fica como saldo de IA na sua conta.</p>' +
                '<div class="es-linha"><button class="al-bt" id="es-ip-pagar">Pagar ' + esc(o.recarga) + ' e ler a prova</button>'
                : '<p class="al-sub">A recarga online está indisponível no momento.</p><div class="es-linha">');
          }
        }
        h += '<button class="al-bt fan" id="es-ip-nao">Cancelar</button><span class="al-fino" id="es-ip-omsg"></span></div></div>';
        ped.innerHTML = h;
        var omsg = el('es-ip-omsg');
        var deNovo = function (e) {
          // o valor ou o saldo mudou desde que o orçamento foi mostrado: mostra o de agora, com o motivo
          api('GET', base() + '/pedidos/' + id).then(function (y) {
            if (!aqui()) return;
            pintar(y);
            if (el('es-ip-omsg')) el('es-ip-omsg').innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>';
          }).catch(function () { if (omsg) omsg.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
        };
        el('es-ip-reorcar').onclick = function () {
          this.disabled = true; omsg.textContent = 'Recalculando…';
          api('POST', base() + '/pedidos/' + id + '/paginas', { paginas: [Number(el('es-ip-de').value), Number(el('es-ip-ate').value)] }).then(function (y) { if (aqui()) orcamento(y); }).catch(deNovo);
        };
        el('es-ip-nao').onclick = function () { api('POST', base() + '/pedidos/' + id + '/cancelar').then(function () { if (aqui()) ir('escrita', 'importar'); }).catch(deNovo); };
        if (el('es-ip-conf')) el('es-ip-conf').onclick = function () {
          this.disabled = true;
          // o aceite é DESTE valor, o que está na tela: o servidor recusa se o orçamento passou dele
          api('POST', base() + '/pedidos/' + id + '/confirmar', null, o.orcamento_milesimos || 1).then(function () { if (aqui()) carregar(); }).catch(deNovo);
        };
        if (el('es-ip-pagar')) el('es-ip-pagar').onclick = function () {
          var btPagar = this;
          btPagar.disabled = true; omsg.textContent = 'Abrindo o pagamento…';
          api('POST', base() + '/pedidos/' + id + '/recarga', { aceite_milesimos: o.orcamento_milesimos }).then(function (x2) {
            if (x2.init_point) location.href = x2.init_point; // volta para este pedido; o crédito entra pela confirmação do Mercado Pago
            else { btPagar.disabled = false; omsg.innerHTML = '<span class="es-msg-erro">O pagamento não pôde ser aberto. Tente de novo.</span>'; }
          }).catch(deNovo);
        };
      }

      // a leitura em curso: consulta de 5 em 5 segundos; o contador recomeça quando o lote avança, e a tela PARA
      // (saiu da tela, terminou, ou ficou tempo demais sem avançar)
      function acompanhar(x, n, visto) {
        var p = x.pedido, pg = p.prova.progresso, espera = p.estado === 'orcado';
        var marca = pg ? pg.etapa + ':' + pg.feito : '';
        if (marca !== visto) n = 0;
        if (n >= CONSULTAS_PROVA) {
          ped.innerHTML = '<div class="jr-caixa">' + cab(p) + '<p class="al-sub">' + (espera ? 'O Mercado Pago ainda não confirmou o pagamento. Assim que confirmar, a leitura começa sozinha — você pode sair desta página.' : 'Está demorando mais que o normal. O pedido continua rodando; se não sair, o valor volta sozinho ao saldo.') + '</p>' +
            '<div class="es-linha"><button class="al-bt peq" id="es-ip-atual">Atualizar</button>' + (espera ? '<button class="al-bt peq fan" id="es-ip-desiste">Cancelar o pedido</button>' : '') + '</div></div>';
          el('es-ip-atual').onclick = carregar;
          if (el('es-ip-desiste')) el('es-ip-desiste').onclick = function () { api('POST', base() + '/pedidos/' + id + '/cancelar').then(function () { if (aqui()) carregar(); }).catch(function () {}); };
          return;
        }
        var pct = pg && pg.total ? Math.round(pg.feito * 100 / pg.total) : 0;
        var etapa = espera ? 'A leitura começa sozinha quando o Mercado Pago confirmar o pagamento.'
          : !pg ? 'Abrindo o PDF…' : pg.etapa === 'gabarito' ? 'Lendo o gabarito…' : pg.etapa === 'conferencia' ? 'Conferindo o texto com as páginas…' : 'Lendo as páginas: lote ' + Math.min(pg.feito + 1, p.prova.lotes) + ' de ' + p.prova.lotes + '.';
        ped.innerHTML = '<div class="jr-caixa">' + cab(p) + '<p class="al-rotulo">' + (espera ? 'Aguardando o pagamento' : 'Lendo a prova') + '</p>' +
          '<p class="al-sub"><span class="es-eo-gira"></span> ' + etapa + '</p>' + (espera ? '' : '<div class="es-barra verde es-ip-barra"><i style="width:' + pct + '%"></i></div>' +
          '<p class="al-fino">Leva de meio minuto a um minuto por lote. Você pode sair desta página: o pedido continua, e o resultado fica em Meus pedidos.</p>') + '</div>';
        consulta = setTimeout(function () {
          api('GET', base() + '/pedidos/' + id).then(function (y) {
            if (!aqui()) return;
            if (y.pedido.estado === 'orcado' && y.pedido.aguardando_pagamento || y.pedido.estado === 'processando') acompanhar(y, n + 1, marca);
            else { if ((y.pedido.estado === 'pronto' || y.pedido.estado === 'falhou') && window.AcademyCarteiraUI) window.AcademyCarteiraUI.depois(); pintar(y); }
          }).catch(function (e) { if (aqui()) falha(ped, e); });
        }, 5000);
      }

      // o resultado: a lista para conferir. As prontas vêm marcadas; as "a revisar" só entram confirmadas ou editadas.
      function resultado(p) {
        var r = p.resultado || {}, qs = r.questoes || [], s = r.resumo || {}, ap = r.aplicacao;
        qs.forEach(function (q) { if (!(q.n in MARCA)) MARCA[q.n] = q.estado === 'ok' && !q.aplicada; });
        var visiveis = qs.filter(function (q) { return FILTRO === 'todas' || (FILTRO === 'revisar' ? q.estado === 'revisar' && !q.aplicada : FILTRO === 'ok' ? q.estado === 'ok' && !q.aplicada : q.aplicada); });
        function escolhidas() { return qs.filter(function (q) { return MARCA[q.n] && !q.aplicada; }); }
        var h = '<div class="jr-caixa es-ip-res">' + cab(p) +
          '<p><b>' + s.lidas + '</b> questão(ões) lida(s): <b>' + s.ok + '</b> pronta(s) · <b>' + s.a_revisar + '</b> a revisar · ' + s.sem_gabarito + ' sem gabarito · ' + s.anuladas + ' anulada(s) · ' + s.com_figura + ' com figura' + (s.aplicadas ? ' · <b>' + s.aplicadas + '</b> já no percurso' : '') + '.</p>' +
          '<p class="al-fino">' + esc(r.aviso || '') + ' Cobrado: ' + esc(p.cobrado) + ' (o orçamento era de até ' + esc(p.orcamento) + ').</p>' +
          (ap ? '<p class="es-nota-aba rev"><b>' + (ap.novas + ap.atualizadas) + ' questão(ões) adicionada(s)</b> a “' + esc(ap.titulo) + '”' + (ap.duplicadas ? ' (' + ap.duplicadas + ' já estavam lá e não foram duplicadas)' : '') + (ap.particular ? '.' : ', em rascunho — publique pelo fluxo de sempre.') +
            ' <button class="al-bt peq" id="es-ip-abrir">Abrir o percurso e praticar</button></p>' : '') +
          '<div class="es-eo-sub es-ip-filtros">' + [['todas', 'Todas (' + qs.length + ')'], ['revisar', 'A revisar'], ['ok', 'Prontas'], ['feitas', 'Já no percurso']].map(function (f) { return '<button data-filtro="' + f[0] + '"' + (FILTRO === f[0] ? ' class="on"' : '') + '>' + f[1] + '</button>'; }).join('') + '</div></div>';
        h += visiveis.map(function (q) {
          var ed = EDICAO[q.n], alts = ed ? ed.alternativas : q.alternativas, gab = ed ? ed.gabarito : q.gabarito;
          var cabQ = '<p class="al-fino"><b>Questão ' + esc(q.numero || '?') + '</b> · p. ' + q.paginas[0] + (q.paginas[1] !== q.paginas[0] ? '–' + q.paginas[1] : '') + (q.disciplina ? ' · ' + esc(ed && ed.disciplina != null ? ed.disciplina : q.disciplina) : '') + ' ' +
            (q.aplicada ? '<span class="es-selo verde">já no percurso</span>' : ed ? '<span class="es-selo azul">editada por você</span>' : q.estado === 'ok' ? '<span class="es-selo verde">pronta</span>' : '<span class="es-selo ambar">a revisar</span>') + '</p>' +
            (q.estado === 'revisar' && !q.aplicada && !ed ? '<p class="es-aviso es-ip-motivo">' + esc(q.motivo) + '</p>' : '');
          var corpo = (q.apoio ? '<details class="es-fontes"><summary>Texto de apoio</summary><div class="es-apoio">' + texto(q.apoio) + '</div></details>' : '') +
            '<div class="es-enun">' + texto(ed ? ed.enunciado : q.enunciado) + '</div>' +
            (alts.length ? '<ol class="es-ip-alts">' + alts.map(function (a) { return '<li' + (a.letra === gab ? ' class="certa"' : '') + '><b>' + esc(a.letra) + ')</b> ' + esc(a.texto) + (a.letra === gab ? ' <span class="es-selo verde">gabarito</span>' : '') + '</li>'; }).join('') + '</ol>' : '') +
            (gab === 'anulada' ? '<p class="al-fino">Questão <b>anulada</b>: entra para leitura, fora da correção automática.</p>' : (!gab && q.tipo !== 'discursiva' ? '<p class="al-fino">Sem gabarito: edite e marque a alternativa correta para poder adicionar.</p>' : ''));
          var acoes = q.aplicada ? '' : '<div class="es-linha"><label class="es-ip-marca"><input type="checkbox" data-marca="' + q.n + '"' + (MARCA[q.n] ? ' checked' : '') + '> ' + (q.estado === 'revisar' && !ed ? 'Conferi com o caderno e quero adicionar' : 'Adicionar') + '</label>' +
            (q.tipo === 'discursiva' ? '' : '<button class="al-bt peq fan" data-editar="' + q.n + '">Editar</button>') + '</div><div data-form="' + q.n + '"></div>';
          return '<div class="jr-caixa es-ip-q' + (q.estado === 'revisar' && !q.aplicada && !ed ? ' rev' : '') + '">' + cabQ + corpo + acoes + '</div>';
        }).join('') || '<div class="jr-caixa"><p class="al-sub">Nenhuma questão neste filtro.</p></div>';
        h += '<div class="jr-caixa es-ip-rodape"><div class="es-linha"><button class="al-bt" id="es-ip-aplicar"></button><span class="al-fino" id="es-ip-amsg">Adicionar não custa nada. As que ficarem de fora continuam aqui — dá para adicionar depois.</span></div></div>';
        ped.innerHTML = h;
        var btA = el('es-ip-aplicar');
        function rotulo() { var n = escolhidas().length; btA.textContent = 'Adicionar ' + n + ' questão(ões) ao ' + (p.prova.destino && p.prova.destino.novo ? 'percurso “' + p.prova.destino.novo.titulo + '”' : 'percurso escolhido'); btA.disabled = !n; }
        rotulo();
        cada(ped, '[data-filtro]', function (b) { b.onclick = function () { FILTRO = b.getAttribute('data-filtro'); resultado(p); }; });
        cada(ped, '[data-marca]', function (c) { c.onchange = function () { MARCA[c.getAttribute('data-marca')] = c.checked; rotulo(); }; });
        cada(ped, '[data-editar]', function (b) { b.onclick = function () { editar(p, Number(b.getAttribute('data-editar'))); }; });
        if (el('es-ip-abrir')) el('es-ip-abrir').onclick = function () { abrirPercurso(ap.escopo, { aba: 'praticar' }); };
        btA.onclick = function () {
          var envio = escolhidas().map(function (q) {
            var ed = EDICAO[q.n];
            return { n: q.n, confirmada: true, edicao: ed ? { enunciado: ed.enunciado, disciplina: ed.disciplina, alternativas: q.tipo === 'objetiva' ? ed.alternativas.map(function (a) { return { texto: a.texto }; }) : undefined,
              anulada: ed.gabarito === 'anulada', correta: ed.gabarito && ed.gabarito !== 'anulada' ? ed.alternativas.map(function (a) { return a.letra; }).indexOf(ed.gabarito) : undefined } : undefined };
          });
          btA.disabled = true; el('es-ip-amsg').textContent = 'Adicionando…';
          api('POST', base() + '/pedidos/' + id + '/aplicar', { questoes: envio }).then(function (y) {
            if (!aqui()) return;
            EDICAO = {}; MARCA = {}; FILTRO = 'todas';
            resultado(y.pedido);
            rolagem().scrollTop = 0;
          }).catch(function (e) { btA.disabled = false; el('es-ip-amsg').innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
        };
      }
      // edição simples, na própria lista: enunciado, alternativas, gabarito e matéria. Fica nesta tela até adicionar.
      function editar(p, n) {
        var q = (p.resultado.questoes || []).filter(function (x) { return x.n === n; })[0], cx = ped.querySelector('[data-form="' + n + '"]');
        if (!q || !cx) return;
        var ed = EDICAO[n] || { enunciado: q.enunciado, disciplina: q.disciplina || '', gabarito: q.gabarito || '', alternativas: q.alternativas.map(function (a) { return { letra: a.letra, texto: a.texto }; }) };
        cx.innerHTML = '<div class="es-ip-edit"><label class="es-campo">Enunciado<textarea class="es-ta" data-e="enun" rows="5" maxlength="12000">' + esc(ed.enunciado) + '</textarea></label>' +
          (q.tipo === 'objetiva' ? ed.alternativas.map(function (a, k) { return '<label class="es-campo">Alternativa ' + esc(a.letra) + '<textarea class="es-ta" data-e="alt" data-k="' + k + '" rows="2" maxlength="3000">' + esc(a.texto) + '</textarea></label>'; }).join('') : '') +
          '<div class="es-ip-grade"><label class="es-campo">Gabarito<select data-e="gab"><option value="">— sem gabarito —</option>' + ed.alternativas.map(function (a) { return '<option value="' + esc(a.letra) + '"' + (ed.gabarito === a.letra ? ' selected' : '') + '>' + esc(a.letra) + (q.tipo === 'certo_errado' ? ' — ' + esc(a.texto) : '') + '</option>'; }).join('') +
          '<option value="anulada"' + (ed.gabarito === 'anulada' ? ' selected' : '') + '>anulada</option></select></label>' +
          '<label class="es-campo">Matéria<input data-e="disc" maxlength="80" value="' + esc(ed.disciplina) + '"></label></div>' +
          '<p class="al-fino">Copie do caderno o que estiver errado. O gabarito é o do documento oficial — não o que você acha certo.</p>' +
          '<div class="es-linha"><button class="al-bt peq" data-e="ok">Guardar a edição</button><button class="al-bt peq fan" data-e="nao">Desfazer</button></div></div>';
        cx.querySelector('[data-e="ok"]').onclick = function () {
          var nova = { enunciado: cx.querySelector('[data-e="enun"]').value, disciplina: cx.querySelector('[data-e="disc"]').value, gabarito: cx.querySelector('[data-e="gab"]').value, alternativas: ed.alternativas.map(function (a) { return { letra: a.letra, texto: a.texto }; }) };
          cada(cx, '[data-e="alt"]', function (t) { nova.alternativas[Number(t.getAttribute('data-k'))].texto = t.value; });
          EDICAO[n] = nova; MARCA[n] = true;
          resultado(p);
        };
        cx.querySelector('[data-e="nao"]').onclick = function () { delete EDICAO[n]; MARCA[n] = q.estado === 'ok'; resultado(p); };
      }
      carregar();
    }

    // ================= LER EDITAL EM PDF (ADR-0010, fase 4) =================
    // O usuário envia o edital e diz para onde vai o programa. O servidor lê o PDF sem cobrar, SUGERE as páginas do
    // conteúdo programático (e as dos dados do concurso) e mostra o orçamento — as faixas são dele para ajustar.
    // Confirmado, a leitura roda em segundo plano, lote a lote. O resultado é a ÁRVORE do programa para rever
    // (disciplina → tópico → subitem, com os itens de leitura incerta marcados) e os dados do concurso para
    // confirmar. Aplicar não custa nada; em percurso que já tem programa, mostra ANTES o que muda (retificação).
    // A regra de pontuação não passa por aqui: não é lida nem enviada.
    var ESTADO_EDITAL = { orcado: ['aguardando a sua confirmação', 'cinza'], processando: ['lendo…', 'azul'], pronto: ['lido — falta aplicar', 'ambar'], aplicado: ['aplicado ao percurso', 'verde'],
      falhou: ['não concluída — valor devolvido', 'verm'], cancelado: ['cancelado', 'cinza'] };
    var NATUREZA = [['objetiva', 'objetiva'], ['discursiva', 'discursiva'], ['sentenca', 'sentença'], ['oral', 'oral'], ['titulos', 'títulos'], ['outra', 'outra']];
    var FORM_EDITAL = {};       // destino e nome escolhidos no formulário (só nesta visita; o arquivo não fica)
    function seloEdital(p) {
      var x = ESTADO_EDITAL[p.estado] || [p.estado, 'cinza'];
      if (p.estado === 'orcado' && p.aguardando_pagamento) x = ['aguardando o pagamento', 'ambar'];
      return '<span class="es-selo ' + x[1] + '">' + x[0] + '</span>';
    }
    // "1-2, 4-6" ↔ [[1, 2], [4, 6]] — o usuário escreve as faixas como falaria delas
    function faixasTxt(faixas) { return (faixas || []).map(function (f) { return f[0] === f[1] ? String(f[0]) : f[0] + '-' + f[1]; }).join(', '); }
    function faixasDoTexto(t) {
      var partes = String(t || '').split(/[,;]+/).filter(function (x) { return x.trim(); }), r = [];
      for (var k = 0; k < partes.length; k++) {
        var m = /^\s*(\d+)\s*(?:(?:-|–|a|até)\s*(\d+))?\s*$/.exec(partes[k]);
        if (!m) return null;
        r.push([Number(m[1]), Number(m[2] || m[1])]);
      }
      return r;
    }
    function faixasDasPaginas(ns) {
      var r = [];
      ns.slice().sort(function (a, b) { return a - b; }).forEach(function (n) { var u = r[r.length - 1]; if (u && n === u[1] + 1) u[1] = n; else r.push([n, n]); });
      return r;
    }

    function lerEdital(alvo) {
      api('GET', base() + '/pedidos/edital/opcoes').then(function (o) {
        var F = FORM_EDITAL;
        var h = subnav('edital') + '<div class="jr-caixa"><h3>Ler edital em PDF</h3>' +
          '<p class="al-sub">Envie o edital do seu concurso. O sistema localiza as páginas do conteúdo programático, lê o programa disciplina por disciplina e confere cada item com a página. Você revê a árvore, confirma os dados do concurso e aplica: o percurso ganha o programa, uma matéria por disciplina e o plano com a data da prova.</p>' +
          '<p class="al-sub"><b>A leitura é paga com o seu saldo de IA.</b> Antes de ler você vê as páginas e o valor máximo, e confirma; depois paga só o que foi usado. Aplicar o programa ao percurso não custa nada. <b>A regra de pontuação não é lida</b>: ela exige a fonte, e é você quem informa.</p>' +
          (o.disponivel ? '' : '<p class="es-aviso">' + esc(o.motivo_indisponivel) + '</p>') + '</div>';
        if (!o.disponivel) { alvo.innerHTML = h; ligarSubnav(alvo); return; }
        var destinos = o.destinos.map(function (d) {
          return '<option value="' + esc(d.slug) + '"' + (F.destino === d.slug ? ' selected' : '') + '>' + (d.particular ? 'Meu percurso: ' : 'Curso: ') + esc(d.titulo) + (d.tem_programa ? ' (já tem programa — será retificado)' : '') + '</option>';
        }).join('') + (o.pode_novo ? '<option value="+"' + (F.destino === '+' || (!F.destino && !o.destinos.length) ? ' selected' : '') + '>➕ Novo percurso particular…</option>' : '') +
          (o.pode_novo_no_curso ? '<option value="+curso"' + (F.destino === '+curso' ? ' selected' : '') + '>➕ Novo percurso do curso (nasce em rascunho)…</option>' : '');
        h += '<div class="jr-caixa es-ip es-ed"><h3>1. O arquivo</h3>' +
          '<label class="es-campo">Edital (PDF, até ' + megas(o.limites.pdf_max_bytes) + ')<input type="file" id="es-ed-arq" accept="application/pdf,.pdf"></label>' +
          '<p class="al-fino">O edital inteiro pode ser longo; só as páginas do conteúdo programático (e as dos dados do concurso) precisam ser lidas. O sistema sugere quais, e você ajusta antes de pagar. Cada pedido lê até ' + o.limites.paginas_max + ' páginas. Página escaneada (imagem) também é lida: custa mais, e os itens dela vêm marcados para você conferir.</p>' +
          '<h3>2. Para onde vai o programa</h3>' +
          '<label class="es-campo">Destino<select id="es-ed-dest">' + destinos + '</select></label>' +
          '<label class="es-campo" id="es-ed-novo-cx">Nome do percurso novo<input id="es-ed-novo" maxlength="120" value="' + esc(F.novo || '') + '" placeholder="TRT-10 — Analista Judiciário"></label>' +
          '<p class="al-fino">O percurso particular é só seu: ninguém mais vê. Ele fica ao lado do percurso do curso — você troca de um para o outro no alto da página.</p>' +
          '<div class="es-linha"><button class="al-bt" id="es-ed-ok">Enviar e ver as páginas</button><span class="al-fino" id="es-ed-msg">Nada é cobrado nesta etapa.</span></div>' +
          '<div class="es-barra es-ip-barra" id="es-ed-barra" hidden><i style="width:0"></i></div></div>';
        alvo.innerHTML = h;
        ligarSubnav(alvo);
        var msg = el('es-ed-msg'), bt = el('es-ed-ok'), barra = el('es-ed-barra'), dest = el('es-ed-dest');
        function mostrar() { el('es-ed-novo-cx').hidden = dest.value.charAt(0) !== '+'; F.destino = dest.value; F.novo = el('es-ed-novo').value; }
        dest.onchange = mostrar; el('es-ed-novo').oninput = mostrar;
        mostrar();
        function aqui() { return E.aba === 'escrita' && el('es-ed-ok') === bt; }
        bt.onclick = function () {
          mostrar();
          var arq = el('es-ed-arq').files[0], novo = F.destino.charAt(0) === '+';
          var erroForm = !arq ? 'Escolha o PDF do edital.' : !F.destino ? 'Escolha o destino.' : novo && F.novo.trim().length < 3 ? 'Dê um nome ao percurso novo.' : '';
          if (erroForm) { msg.innerHTML = '<span class="es-msg-erro">' + esc(erroForm) + '</span>'; return; }
          bt.disabled = true;
          enviarPdf(arq, o, function (fr) {
            if (!aqui()) return;
            barra.hidden = false;
            barra.firstChild.style.width = (fr < 0 ? 100 : Math.round(fr * 100)) + '%';
            msg.textContent = 'Enviando o edital' + (fr < 0 ? '…' : ' — ' + Math.round(fr * 100) + '%');
          }).then(function (mediaId) {
            if (aqui()) { barra.firstChild.style.width = '100%'; msg.textContent = 'Lendo o PDF e procurando o conteúdo programático…'; }
            return api('POST', base() + '/pedidos', { tipo: 'edital', edital_media_id: mediaId,
              destino: novo ? { novo: F.destino === '+curso' ? { titulo: F.novo, curso: true } : { titulo: F.novo } } : { escopo: F.destino } });
          }).then(function (x) { if (aqui()) ir('escrita', 'edital.' + x.pedido.id); })
            .catch(function (e) { if (!aqui()) return; bt.disabled = false; barra.hidden = true; msg.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
        };
      }).catch(function (e) { falha(alvo, e); });
    }

    // ---- um pedido de edital: páginas e orçamento → leitura (lote a lote) → árvore para rever → aplicar ----
    function telaEdital(alvo, id) {
      var consulta = null, EXCL = {}, TXT = {}, ABERTAS = {}, DC = null, INICIADO = false, SUBST = false;
      alvo.innerHTML = subnav('') + '<div class="es-linha"><button class="al-bt peq fan" id="es-ed-volta">← Meus pedidos</button></div><div id="es-ed-ped"><p class="al-sub">Carregando…</p></div>';
      ligarSubnav(alvo);
      var ped = el('es-ed-ped');
      el('es-ed-volta').onclick = function () { ir('escrita', 'pedidos'); };
      function parar() { if (consulta) { clearTimeout(consulta); consulta = null; } }
      E.aoSair = parar;
      function aqui() { return E.aba === 'escrita' && el('es-ed-ped') === ped; }
      function cab(p) { return '<p class="al-rotulo">Edital em PDF</p><p class="al-fino">' + esc(p.edital.arquivo) + ' ' + seloEdital(p) + '</p>'; }
      function carregar() {
        api('GET', base() + '/pedidos/' + id).then(function (x) { if (aqui()) pintar(x); }).catch(function (e) { if (aqui()) falha(ped, e); });
      }
      function pintar(x) {
        var p = x.pedido;
        parar();
        if (p.tipo !== 'edital') { ir('escrita', p.tipo === 'prova' ? 'prova.' + p.id : p.questao_id); return; }
        if (p.estado === 'orcado' && !p.aguardando_pagamento) return orcamento(x);
        if (p.estado === 'orcado' || p.estado === 'processando') return acompanhar(x, 0, '');
        if (p.estado === 'pronto' || p.estado === 'aplicado') return resultado(p);
        ped.innerHTML = '<div class="jr-caixa">' + cab(p) + (p.estado === 'falhou' ? '<p class="es-aviso">' + esc(p.erro || 'A leitura não foi concluída. O valor reservado voltou ao seu saldo.') + '</p><p class="al-sub">Nada foi cobrado.</p>' : '<p class="al-sub">Pedido cancelado.</p>') +
          '<div class="es-linha"><button class="al-bt peq" id="es-ed-de-novo">Ler outro edital</button></div></div>';
        el('es-ed-de-novo').onclick = function () { ir('escrita', 'edital'); };
      }

      // as páginas detectadas e o orçamento: a faixa sugerida vem marcada; o usuário marca, desmarca ou escreve as faixas e recalcula
      function orcamento(x) {
        var p = x.pedido, o = x.orcamento, d = o.detalhe || p.edital, pags = d.paginas_detectadas || [], sg = d.sugestao || { faixas: [], dados_paginas: [] };
        var h = '<div class="jr-caixa es-eo-orc es-ed-orc">' + cab(p) + '<p class="al-rotulo">Páginas e orçamento da leitura</p>';
        if (!o.disponivel) { ped.innerHTML = h + '<p class="es-aviso">' + esc(o.motivo_indisponivel) + '</p></div>'; return; }
        h += '<p>O PDF tem <b>' + d.total_paginas + '</b> página(s)' + (d.sem_texto ? ', <b>' + d.sem_texto + '</b> sem texto copiável (escaneadas)' : '') + '. ' +
          (sg.faixas.length ? 'O conteúdo programático parece estar nas páginas <b>' + esc(faixasTxt(sg.faixas)) + '</b>' + (sg.dados_paginas.length ? ', e os dados do concurso (cargo, banca, data da prova, etapas) nas páginas <b>' + esc(sg.dados_paginas.join(', ')) + '</b>' : '') + '. Confira pelos trechos abaixo e ajuste se preciso.'
            : '<span class="es-aviso">Não foi possível localizar o conteúdo programático automaticamente (edital escaneado, ou com um formato fora do comum). Marque abaixo as páginas que trazem o programa.</span>') + '</p>';
        // a faixa é sugerida por uma leitura automática do texto: quando ela não se sustenta, isso é DITO antes do valor
        if (sg.faixas.length && sg.confianca === 'baixa') h += '<p class="es-aviso"><b>Sugestão de confiança baixa</b>: ' + esc(sg.motivo || 'o programa não foi localizado com segurança') + '. Por isso nenhuma página veio marcada e nada foi orçado. Abra o edital, confira onde começa e onde termina o conteúdo programático, marque as páginas abaixo e recalcule — você só paga pelas páginas que escolher.</p>';
        else if (sg.faixas.length && sg.confianca === 'media') h += '<p class="es-aviso"><b>Confira a faixa antes de pagar</b>: ' + esc(sg.motivo || 'a sugestão é automática') + '. Veja pelos trechos se as páginas marcadas são mesmo as do conteúdo programático e ajuste o que for preciso.</p>';
        function linhaPag(g) {
          return '<label class="es-ed-pag' + (g.selecionada ? ' on' : '') + '"><input type="checkbox" data-pag="' + g.n + '"' + (g.selecionada ? ' checked' : '') + '><b>p. ' + g.n + '</b>' +
            (g.sugerida === 'programa' ? '<span class="es-selo verde">programa</span>' : g.sugerida === 'dados' ? '<span class="es-selo azul">dados do concurso</span>' : '') +
            (g.sem_texto ? '<span class="es-selo ambar">escaneada</span>' : '') +
            '<span class="es-ed-trecho">' + (g.sem_texto ? 'página em imagem — sem texto para mostrar' : esc(g.trecho) + '…') + '</span></label>';
        }
        var principais = pags.filter(function (g) { return g.sugerida || g.selecionada; }), outras = pags.filter(function (g) { return !g.sugerida && !g.selecionada; });
        h += '<div class="es-ed-pags">' + principais.map(linhaPag).join('') + '</div>' +
          (outras.length ? '<details class="es-fontes"' + (principais.length ? '' : ' open') + '><summary>As outras ' + outras.length + ' página(s) do PDF</summary><div class="es-ed-pags">' + outras.map(linhaPag).join('') + '</div></details>' : '') +
          '<div class="es-ip-faixa"><label class="es-campo es-ed-faixas">Páginas a ler (ex.: 1-2, 30-41)<input id="es-ed-faixas" value="' + esc(faixasTxt(d.faixas)) + '" inputmode="numeric" autocomplete="off"></label>' +
          '<button class="al-bt peq fan" id="es-ed-reorcar">Recalcular</button></div>' +
          '<p class="al-fino">Leia só o que precisa: as páginas do programa e, se quiser as sugestões de cargo, banca e data, as dos dados do concurso. Cada pedido lê até ' + d.max_paginas + ' páginas.</p>';
        var temPaginas = d.paginas > 0;
        if (temPaginas) h += '<ul class="es-ip-det"><li>Serão lidas <b>' + d.paginas + '</b> página(s) (' + esc(faixasTxt(d.faixas)) + '), em <b>' + d.lotes + '</b> lote(s) de até ' + d.paginas_por_lote + ' páginas.</li>' +
          '<li>' + (d.escaneadas ? '<b>' + d.escaneadas + '</b> página(s) escaneada(s): são lidas como imagem, custam mais e os itens delas vêm marcados para conferir.' : 'Todas têm texto copiável: cada item do programa é conferido com a página.') + '</li></ul>';
        h += '<div id="es-ed-pagar">';
        if (!temPaginas) h += '<p class="es-aviso">Nenhuma página escolhida ainda — marque as páginas e recalcule. Nada foi cobrado.</p><div class="es-linha">';
        else if (o.cobranca === 'isento') h += '<p>Sua conta é isenta de cobrança de IA.</p><div class="es-linha"><button class="al-bt" id="es-ed-conf">Ler agora</button>';
        else {
          h += '<p class="es-eo-valor">até ' + esc(o.orcamento) + '</p>' +
            '<p class="al-sub">É o valor máximo. Terminada a leitura, você paga só o que foi usado e a diferença volta ao saldo. Se a leitura não sair, você não paga nada. Seu saldo de IA: <b>' + esc(o.saldo) + '</b>.</p>';
          if (o.saldo_suficiente) h += '<div class="es-linha"><button class="al-bt" id="es-ed-conf">Confirmar e ler o edital</button>';
          else {
            h += '<p class="es-aviso">Faltam <b>' + esc(o.falta) + '</b> de saldo para esta leitura.</p>' +
              (o.pagamento_online ? '<p class="al-sub">Será cobrado <b>' + esc(o.recarga) + '</b> no Mercado Pago (é o que falta, arredondado para cima, com o mínimo da recarga). O valor entra como saldo de IA; a leitura começa sozinha quando o pagamento for confirmado, e o que sobrar fica como saldo de IA na sua conta.</p>' +
                '<div class="es-linha"><button class="al-bt" id="es-ed-pagar-bt">Pagar ' + esc(o.recarga) + ' e ler o edital</button>'
                : '<p class="al-sub">A recarga online está indisponível no momento.</p><div class="es-linha">');
          }
        }
        h += '<button class="al-bt fan" id="es-ed-nao">Cancelar</button><span class="al-fino" id="es-ed-omsg"></span></div></div></div>';
        ped.innerHTML = h;
        var omsg = el('es-ed-omsg'), campo = el('es-ed-faixas');
        var deNovo = function (e) {
          // o valor, o saldo ou as faixas mudaram desde que o orçamento foi mostrado: mostra o de agora, com o motivo
          api('GET', base() + '/pedidos/' + id).then(function (y) {
            if (!aqui()) return;
            pintar(y);
            if (el('es-ed-omsg')) el('es-ed-omsg').innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>';
          }).catch(function () { if (omsg) omsg.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
        };
        // mexeu nas páginas: o valor na tela deixou de valer — só confirma depois de recalcular
        function mudou() {
          ['es-ed-conf', 'es-ed-pagar-bt'].forEach(function (k) { if (el(k)) el(k).disabled = true; });
          omsg.textContent = 'As páginas mudaram: recalcule para ver o valor.';
        }
        cada(ped, '[data-pag]', function (c) {
          c.onchange = function () {
            var ns = [];
            cada(ped, '[data-pag]', function (k) { if (k.checked) ns.push(Number(k.getAttribute('data-pag'))); k.parentNode.classList.toggle('on', k.checked); });
            campo.value = faixasTxt(faixasDasPaginas(ns));
            mudou();
          };
        });
        campo.oninput = mudou;
        el('es-ed-reorcar').onclick = function () {
          var faixas = faixasDoTexto(campo.value);
          if (!faixas || !faixas.length) { omsg.innerHTML = '<span class="es-msg-erro">Escreva as páginas assim: 1-2, 30-41.</span>'; return; }
          this.disabled = true; omsg.textContent = 'Recalculando…';
          api('POST', base() + '/pedidos/' + id + '/paginas', { paginas: faixas }).then(function (y) { if (aqui()) orcamento(y); })
            .catch(function (e) { if (!aqui()) return; el('es-ed-reorcar').disabled = false; omsg.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; });
        };
        el('es-ed-nao').onclick = function () { api('POST', base() + '/pedidos/' + id + '/cancelar').then(function () { if (aqui()) ir('escrita', 'edital'); }).catch(deNovo); };
        if (el('es-ed-conf')) el('es-ed-conf').onclick = function () {
          this.disabled = true;
          // o aceite é DESTE valor, o que está na tela: o servidor recusa se o orçamento passou dele
          api('POST', base() + '/pedidos/' + id + '/confirmar', null, o.orcamento_milesimos || 1).then(function () { if (aqui()) carregar(); }).catch(deNovo);
        };
        if (el('es-ed-pagar-bt')) el('es-ed-pagar-bt').onclick = function () {
          var btPagar = this;
          btPagar.disabled = true; omsg.textContent = 'Abrindo o pagamento…';
          api('POST', base() + '/pedidos/' + id + '/recarga', { aceite_milesimos: o.orcamento_milesimos }).then(function (x2) {
            if (x2.init_point) location.href = x2.init_point; // volta para este pedido; o crédito entra pela confirmação do Mercado Pago
            else { btPagar.disabled = false; omsg.innerHTML = '<span class="es-msg-erro">O pagamento não pôde ser aberto. Tente de novo.</span>'; }
          }).catch(deNovo);
        };
      }

      // a leitura em curso: consulta de 5 em 5 segundos; o contador recomeça quando o lote avança, e a tela PARA
      function acompanhar(x, n, visto) {
        var p = x.pedido, pg = p.edital.progresso, espera = p.estado === 'orcado';
        var marca = pg ? pg.etapa + ':' + pg.feito : '';
        if (marca !== visto) n = 0;
        if (n >= CONSULTAS_PROVA) {
          ped.innerHTML = '<div class="jr-caixa">' + cab(p) + '<p class="al-sub">' + (espera ? 'O Mercado Pago ainda não confirmou o pagamento. Assim que confirmar, a leitura começa sozinha — você pode sair desta página.' : 'Está demorando mais que o normal. O pedido continua rodando; se não sair, o valor volta sozinho ao saldo.') + '</p>' +
            '<div class="es-linha"><button class="al-bt peq" id="es-ed-atual">Atualizar</button>' + (espera ? '<button class="al-bt peq fan" id="es-ed-desiste">Cancelar o pedido</button>' : '') + '</div></div>';
          el('es-ed-atual').onclick = carregar;
          if (el('es-ed-desiste')) el('es-ed-desiste').onclick = function () { api('POST', base() + '/pedidos/' + id + '/cancelar').then(function () { if (aqui()) carregar(); }).catch(function () {}); };
          return;
        }
        var pct = pg && pg.total ? Math.round(pg.feito * 100 / pg.total) : 0;
        var etapa = espera ? 'A leitura começa sozinha quando o Mercado Pago confirmar o pagamento.'
          : !pg ? 'Abrindo o PDF…' : pg.etapa === 'conferencia' ? 'Conferindo cada item com a página…' : 'Lendo o edital: lote ' + Math.min(pg.feito + 1, pg.total) + ' de ' + pg.total + '.';
        ped.innerHTML = '<div class="jr-caixa">' + cab(p) + '<p class="al-rotulo">' + (espera ? 'Aguardando o pagamento' : 'Lendo o edital') + '</p>' +
          '<p class="al-sub"><span class="es-eo-gira"></span> ' + etapa + '</p>' + (espera ? '' : '<div class="es-barra verde es-ip-barra"><i style="width:' + pct + '%"></i></div>' +
          '<p class="al-fino">Leva de meio minuto a um minuto por lote. Você pode sair desta página: o pedido continua, e o resultado fica em Meus pedidos.</p>') + '</div>';
        consulta = setTimeout(function () {
          api('GET', base() + '/pedidos/' + id).then(function (y) {
            if (!aqui()) return;
            if (y.pedido.estado === 'orcado' && y.pedido.aguardando_pagamento || y.pedido.estado === 'processando') acompanhar(y, n + 1, marca);
            else { if ((y.pedido.estado === 'pronto' || y.pedido.estado === 'falhou') && window.AcademyCarteiraUI) window.AcademyCarteiraUI.depois(); pintar(y); }
          }).catch(function (e) { if (aqui()) falha(ped, e); });
        }, 5000);
      }

      // os dados do concurso como estão na tela: os já confirmados (pedido reaberto) ou a primeira sugestão de cada campo
      function dadosIniciais(r, dest, ap) {
        var c = r.dados_confirmados, sg = r.dados || {};
        function um(lista) { return lista && lista.length ? lista[0].valor : ''; }
        if (c) return { titulo: ap ? ap.titulo : '', orgao: c.orgao || '', banca: c.banca || '', cargo: c.cargo || '', data_prova: c.data_prova || '',
          etapas: (c.etapas || []).map(function (e) { return { nome: e.nome, natureza: e.tipo }; }), questoes: (c.questoes_por_bloco || []).slice() };
        return { titulo: dest.novo ? dest.novo.titulo : '', orgao: um(sg.orgao), banca: um(sg.banca), cargo: (sg.cargo || []).length === 1 ? sg.cargo[0].valor : '', data_prova: um(sg.data_prova),
          etapas: (sg.etapas || []).map(function (e) { return { nome: e.nome, natureza: e.natureza }; }), questoes: (sg.questoes || []).map(function (q) { return { bloco: q.bloco, quantidade: q.quantidade }; }) };
      }
      function diffHtml(d) {
        function bloco(titulo, lista, total, fn) {
          return total ? '<details class="es-fontes"' + (total <= 12 ? ' open' : '') + '><summary><b>' + total + '</b> ' + titulo + '</summary><ul class="es-ed-diff">' + lista.map(fn).join('') +
            (total > lista.length ? '<li class="al-fino">… e mais ' + (total - lista.length) + '</li>' : '') + '</ul></details>' : '';
        }
        return bloco('item(ns) novo(s)', d.adicionados, d.adicionados_total, function (x) { return '<li class="mais"><b>' + esc(x.codigo) + '</b> ' + esc(x.texto) + '</li>'; }) +
          bloco('item(ns) que saem do programa', d.removidos, d.removidos_total, function (x) { return '<li class="menos"><b>' + esc(x.codigo) + '</b> ' + esc(x.texto) + '</li>'; }) +
          bloco('item(ns) com a redação alterada', d.alterados, d.alterados_total, function (x) { return '<li><b>' + esc(x.codigo) + '</b> <s>' + esc(x.antes) + '</s><br>' + esc(x.depois) + '</li>'; }) +
          '<p class="al-fino">' + d.iguais + ' item(ns) ficam como estão.</p>';
      }

      // o resultado: a árvore para rever e os dados do concurso para confirmar
      function resultado(p) {
        var r = p.resultado || {}, itens = r.itens || [], rs = r.resumo || {}, ap = r.aplicacao, dest = p.edital.destino || {}, sg = r.dados || {};
        if (!INICIADO) { INICIADO = true; EXCL = {}; itens.forEach(function (i) { if (i.excluido) EXCL[i.n] = true; }); DC = dadosIniciais(r, dest, ap); }
        var por = {}, filhos = {}, raizes = [];
        itens.forEach(function (i) { por[i.codigo] = i; if (i.raiz) raizes.push(i); else (filhos[i.disciplina] = filhos[i.disciplina] || []).push(i); });
        // fora = excluído por ele mesmo ou por quem está acima dele (a disciplina leva os itens; o tópico, os subitens)
        function fora(i) { for (var x = i, k = 0; x && k < 12; x = por[x.pai], k++) if (EXCL[x.n]) return true; return false; }
        function aConferir(i) { return !!i.pendente && TXT[i.n] == null; }
        function linha(i, ehRaiz) {
          var nivel = ehRaiz ? 0 : Math.max(0, i.codigo.split('.').length - 2), f = fora(i), ed = TXT[i.n];
          return '<div class="es-ed-item' + (f ? ' fora' : '') + (aConferir(i) ? ' pend' : '') + '" style="--n:' + nivel + '">' +
            (ehRaiz ? '' : '<label class="es-ip-marca" title="Incluir este item"><input type="checkbox" data-inc="' + i.n + '"' + (EXCL[i.n] ? '' : ' checked') + (i.pai && por[i.pai] && fora(por[i.pai]) ? ' disabled' : '') + '></label>') +
            '<div class="es-ed-txt">' + (ehRaiz ? '<span class="al-fino">Título da disciplina: </span>' : '<b>' + esc(i.codigo) + '</b> ') + esc(ed != null ? ed : i.texto) + ' <span class="al-fino">' + esc(i.localizacao) + '</span>' +
            (ed != null ? ' <span class="es-selo azul">conferido por você</span>' : i.pendente ? '<span class="es-pend">' + esc(i.pendente) + '</span>' : '') +
            (i.pendente && !f ? ' <button class="es-link" data-conf="' + i.n + '">' + (ed != null ? 'Editar de novo' : 'Conferir e corrigir o texto') + '</button>' : '') + '<div data-edit="' + i.n + '"></div></div></div>';
        }
        var vivos = itens.filter(function (i) { return !fora(i); }), pendentes = vivos.filter(aConferir).length;
        var destinoTxt = dest.novo ? (dest.novo.curso ? 'percurso novo do curso' : 'percurso novo') + ' “' + (DC.titulo || dest.novo.titulo) + '”' : 'percurso “' + ((ap && ap.titulo) || dest.escopo || '') + '”';
        var h = '<div class="jr-caixa es-ip-res">' + cab(p) +
          '<p><b>' + rs.itens + '</b> item(ns) em <b>' + rs.disciplinas + '</b> disciplina(s) · <b>' + rs.pendentes + '</b> de leitura incerta, a conferir' + (rs.excluidos ? ' · ' + rs.excluidos + ' excluído(s) por você' : '') + '.</p>' +
          '<p class="al-fino">' + esc(r.aviso || '') + ' Cobrado: ' + esc(p.cobrado) + ' (o orçamento era de até ' + esc(p.orcamento) + ').</p>' +
          (ap ? '<p class="es-nota-aba rev"><b>Programa aplicado</b> a “' + esc(ap.titulo) + '”: versão ' + ap.versao + (ap.sem_mudanca ? ' (o texto não mudou)' : ap.retificacao ? ' — retificação: ' + ap.adicionados + ' novo(s), ' + ap.removidos + ' removido(s), ' + ap.alterados + ' alterado(s)' : '') +
            ', ' + ap.itens + ' itens em ' + ap.disciplinas + ' disciplina(s)' + (ap.pendentes ? ', ' + ap.pendentes + ' ainda a conferir' : '') + (ap.particular ? '.' : ' — percurso do curso, em ' + esc(ap.status) + '.') +
            (ap.aviso_data ? ' ' + esc(ap.aviso_data) : '') + ' <button class="al-bt peq" id="es-ed-abrir">Abrir o meu percurso</button></p>' : '') + '</div>';

        // ---- dados do concurso ----
        function fonte(lista) {
          var vistos = {}; // duas etapas costumam sair da mesma frase: o trecho aparece uma vez
          return (lista || []).filter(function (x) { var k = x.pagina + '|' + x.trecho; if (vistos[k]) return false; vistos[k] = 1; return true; }).slice(0, 2).map(function (x) { return '<span class="al-fino es-ed-fonte">p. ' + x.pagina + ' — “' + esc(String(x.trecho).slice(0, 140)) + '”</span>'; }).join('');
        }
        function campo(rotulo, chave, max, lista) {
          return '<label class="es-campo">' + rotulo + '<input data-d="' + chave + '" maxlength="' + max + '" value="' + esc(DC[chave] || '') + '"' + (lista && lista.length > 1 ? ' list="es-ed-l-' + chave + '"' : '') + '>' +
            (lista && lista.length > 1 ? '<datalist id="es-ed-l-' + chave + '">' + lista.map(function (x) { return '<option value="' + esc(x.valor) + '">'; }).join('') + '</datalist>' : '') + fonte(lista) + '</label>';
        }
        h += '<div class="jr-caixa es-ed-dados"><h3>Dados do concurso</h3>' +
          '<p class="al-sub">Sugestões tiradas do edital, cada uma com a página e o trecho de onde saiu. Confirme ou corrija — é o que fica no perfil do percurso e o que dá a data ao seu plano.' + ((sg.cargo || []).length > 1 ? ' O edital traz mais de um cargo: escolha o seu.' : '') + '</p>' +
          '<div class="es-ip-grade">' + (dest.novo ? campo('Nome do percurso', 'titulo', 120) : '') + campo('Órgão', 'orgao', 160, sg.orgao) + campo('Banca', 'banca', 120, sg.banca) + campo('Cargo', 'cargo', 160, sg.cargo) +
          '<label class="es-campo">Data da prova objetiva<input type="date" data-d="data_prova" value="' + esc(DC.data_prova || '') + '">' + fonte(sg.data_prova) + '</label></div>' +
          '<p class="es-ed-sub"><b>Etapas</b> <span class="al-fino">(a primeira define o foco da reta final do plano)</span></p>' +
          DC.etapas.map(function (e, k) {
            return '<div class="es-ed-etapa"><input data-et="' + k + '" maxlength="120" value="' + esc(e.nome) + '" aria-label="Nome da etapa"><select data-en="' + k + '" aria-label="Natureza da etapa">' +
              NATUREZA.map(function (n) { return '<option value="' + n[0] + '"' + (e.natureza === n[0] ? ' selected' : '') + '>' + n[1] + '</option>'; }).join('') + '</select><button class="es-link" data-er="' + k + '">remover</button></div>';
          }).join('') + '<div class="es-linha"><button class="al-bt peq fan" id="es-ed-mais-etapa">＋ etapa</button></div>' + fonte(sg.etapas) +
          (DC.questoes.length ? '<p class="es-ed-sub"><b>Questões por bloco</b> <span class="al-fino">(como o edital traz — é informação, não regra de nota)</span></p>' +
            DC.questoes.map(function (q, k) { return '<div class="es-ed-etapa"><span>' + esc(q.bloco) + ': <b>' + q.quantidade + '</b> questões</span><button class="es-link" data-qr="' + k + '">remover</button></div>'; }).join('') : '') +
          '<p class="es-aviso es-ed-regra"><b>Regra de pontuação</b> (desconto por erro, nota mínima, pesos): não é lida do edital nem gravada por aqui. Ela muda a sua nota e exige a fonte — informe-a depois, com o item do edital.</p></div>';

        // ---- a árvore ----
        h += '<div class="jr-caixa es-ed-arvore"><h3>Programa</h3><p class="al-sub">O texto de cada item é o do edital, conferido com a página. Desmarque a disciplina ou o item que não é do seu cargo. ' +
          (pendentes ? '<b>' + pendentes + ' item(ns) de leitura incerta</b>: entram marcados como pendentes (fora da conta de cobertura) até você conferir com o edital.' : 'Nenhum item de leitura incerta.') + '</p>' +
          raizes.map(function (d, k) {
            var fs = filhos[d.codigo] || [], pend = fs.concat([d]).filter(function (i) { return aConferir(i) && !fora(i); }).length, dFora = fora(d);
            var aberta = ABERTAS[d.codigo] != null ? ABERTAS[d.codigo] : (k === 0 || pend > 0);
            return '<details class="es-acervo es-ed-disc' + (dFora ? ' fora' : '') + '" data-disc="' + esc(d.codigo) + '"' + (aberta ? ' open' : '') + '><summary><label class="es-ip-marca" title="Incluir a disciplina"><input type="checkbox" data-inc="' + d.n + '"' + (dFora ? '' : ' checked') + '></label> ' +
              '<b>' + esc(d.codigo) + '</b> ' + esc(TXT[d.n] != null ? TXT[d.n] : d.texto) + '<span class="al-fino"> · ' + fs.length + ' item(ns) · ' + esc(d.localizacao) + '</span>' + (pend && !dFora ? ' <span class="es-selo ambar">' + pend + ' a conferir</span>' : '') + (dFora ? ' <span class="es-selo cinza">fora</span>' : '') + '</summary>' +
              (d.pendente ? linha(d, true) : '') + fs.map(function (i) { return linha(i, false); }).join('') + '</details>';
          }).join('') + '</div>';
        h += '<div class="jr-caixa es-ip-rodape"><div class="es-linha"><button class="al-bt" id="es-ed-aplicar">' + (ap ? 'Aplicar de novo: ' : 'Aplicar ') + vivos.length + ' item(ns) ao ' + esc(destinoTxt) + '</button>' +
          '<span class="al-fino" id="es-ed-amsg">Aplicar não custa nada. Dá para reabrir este pedido e aplicar de novo depois.</span></div><div id="es-ed-previa"></div></div>';
        ped.innerHTML = h;

        function repintar() { var y = rolagem().scrollTop; resultado(p); rolagem().scrollTop = y; }
        cada(ped, 'details[data-disc]', function (d) { d.addEventListener('toggle', function () { ABERTAS[d.getAttribute('data-disc')] = d.open; }); });
        cada(ped, '[data-inc]', function (c) {
          c.onclick = function (ev) { ev.stopPropagation(); }; // a caixa mora no título da disciplina: marcar não abre nem fecha
          c.onchange = function () { EXCL[c.getAttribute('data-inc')] = !c.checked; repintar(); };
        });
        cada(ped, '[data-conf]', function (b) {
          b.onclick = function () {
            var n = b.getAttribute('data-conf'), i = itens.filter(function (x) { return String(x.n) === n; })[0], cx = ped.querySelector('[data-edit="' + n + '"]');
            cx.innerHTML = '<div class="es-ip-edit"><label class="es-campo">Texto do item, como está no edital (' + esc(i.localizacao) + ')<textarea class="es-ta" rows="3" maxlength="4000">' + esc(TXT[n] != null ? TXT[n] : i.texto) + '</textarea></label>' +
              '<p class="al-fino">Compare com o edital e copie dele o que estiver diferente. Guardado, o item deixa de ser pendente.</p>' +
              '<div class="es-linha"><button class="al-bt peq" data-e="ok">Conferi: guardar o texto</button><button class="al-bt peq fan" data-e="nao">Desfazer</button></div></div>';
            cx.querySelector('[data-e="ok"]').onclick = function () {
              var t = cx.querySelector('textarea').value.replace(/\s+/g, ' ').trim();
              if (!t) return;
              TXT[n] = t; repintar();
            };
            cx.querySelector('[data-e="nao"]').onclick = function () { delete TXT[n]; repintar(); };
          };
        });
        cada(ped, '[data-d]', function (c) { c.oninput = function () { DC[c.getAttribute('data-d')] = c.value; }; });
        cada(ped, '[data-et]', function (c) { c.oninput = function () { DC.etapas[Number(c.getAttribute('data-et'))].nome = c.value; }; });
        cada(ped, '[data-en]', function (c) { c.onchange = function () { DC.etapas[Number(c.getAttribute('data-en'))].natureza = c.value; }; });
        cada(ped, '[data-er]', function (b) { b.onclick = function () { DC.etapas.splice(Number(b.getAttribute('data-er')), 1); repintar(); }; });
        cada(ped, '[data-qr]', function (b) { b.onclick = function () { DC.questoes.splice(Number(b.getAttribute('data-qr')), 1); repintar(); }; });
        el('es-ed-mais-etapa').onclick = function () { DC.etapas.push({ nome: '', natureza: 'objetiva' }); repintar(); };
        if (el('es-ed-abrir')) el('es-ed-abrir').onclick = function () { abrirPercurso(ap.escopo, { aba: 'programa' }); };

        // o corpo do aplicar (e da prévia): o que foi excluído, os textos conferidos e os dados confirmados. Sem regra de pontuação.
        function corpo(confirmar) {
          return { titulo: dest.novo ? DC.titulo : undefined, excluir: Object.keys(EXCL).filter(function (k) { return EXCL[k]; }).map(Number), textos: TXT, confirmar_retificacao: confirmar || undefined, substituir: SUBST || undefined,
            dados: { orgao: DC.orgao, banca: DC.banca, cargo: DC.cargo, data_prova: DC.data_prova, etapas: DC.etapas.filter(function (e) { return e.nome.trim(); }), questoes: DC.questoes } };
        }
        var btA = el('es-ed-aplicar'), amsg = el('es-ed-amsg');
        function erroA(e) { if (!aqui()) return; btA.disabled = false; amsg.innerHTML = '<span class="es-msg-erro">' + esc(e.message) + '</span>'; }
        function aplicarAgora(confirmar) {
          btA.disabled = true; amsg.textContent = 'Aplicando…';
          api('POST', base() + '/pedidos/' + id + '/aplicar', corpo(confirmar)).then(function (y) {
            if (!aqui()) return;
            TXT = {}; INICIADO = false; // o que foi revisto agora está no pedido: a tela recomeça dele
            resultado(y.pedido);
            rolagem().scrollTop = 0;
            trocaDePercurso(); // o percurso novo passa a aparecer na troca, no alto
          }).catch(erroA);
        }
        // a PRÉVIA: em percurso que já tem programa, o que este pedido traz SOMA ao que há (dá para ler o edital em
        // mais de um pedido). O diff aparece antes, e só passa confirmado; substituir o programa inteiro é escolha expressa.
        function previaAgora() {
          btA.disabled = true; amsg.textContent = 'Conferindo o que muda…';
          api('POST', base() + '/pedidos/' + id + '/previa', corpo(false)).then(function (v) {
            if (!aqui()) return;
            if (!(v.retificacao && v.diff && v.diff.mudou) && !SUBST) return aplicarAgora(false);
            btA.disabled = false; amsg.textContent = '';
            var sm = v.soma || {};
            el('es-ed-previa').innerHTML = '<div class="es-nota-aba es-ed-ret"><b>Este percurso já tem programa (versão ' + v.destino.versao + ').</b>' +
              (SUBST ? '<p>Você pediu para <b>substituir</b> o programa atual pelo deste pedido: o que não está neste pedido SAI do programa. A versão atual continua guardada. O que muda:</p>'
                : '<p>O que este pedido leu <b>soma</b> ao programa que já existe: nada do que está lá sai. Aplicar cria uma versão nova — uma retificação —, e a atual continua guardada. O que muda:</p>') +
              ((sm.disciplinas_somadas || []).length ? '<p class="al-fino">Disciplinas que já existem e recebem os itens deste pedido: ' + sm.disciplinas_somadas.map(function (d) { return '<b>' + esc(d.codigo) + '</b> ' + esc(d.titulo); }).join('; ') + '.</p>' : '') +
              ((sm.siglas_trocadas || []).length ? '<p class="al-fino">Sigla que já era de outra disciplina do percurso: ' + sm.siglas_trocadas.map(function (d) { return esc(d.titulo) + ' entra como <b>' + esc(d.para) + '</b>'; }).join('; ') + '.</p>' : '') +
              diffHtml(v.diff) +
              '<label class="es-ip-marca es-ed-subst"><input type="checkbox" id="es-ed-subst"' + (SUBST ? ' checked' : '') + '> Substituir o programa atual pelo deste pedido (use quando o edital foi relido inteiro)</label>' +
              '<div class="es-linha"><button class="al-bt" id="es-ed-ret"' + (v.diff.mudou ? '' : ' disabled') + '>Confirmar a retificação</button><button class="al-bt fan" id="es-ed-ret-nao">Voltar à revisão</button></div></div>';
            el('es-ed-ret').onclick = function () { this.disabled = true; aplicarAgora(true); };
            el('es-ed-ret-nao').onclick = function () { SUBST = false; el('es-ed-previa').innerHTML = ''; };
            el('es-ed-subst').onchange = function () { SUBST = this.checked; previaAgora(); };
            el('es-ed-previa').scrollIntoView({ block: 'nearest' });
          }).catch(erroA);
        }
        btA.onclick = previaAgora;
      }
      carregar();
    }

    // `guardarLugar`: quem tira o aluno do Estude para uma tela do curso (audiobook, desafio, material…) chama
    // antes de sair — as disciplinas abertas e a rolagem ficam guardadas para a volta.
    return { cartao: cartao, abrir: abrir, guardarLugar: guardarLugar };
  };
})();
