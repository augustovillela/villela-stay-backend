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
    var apiCru = D.api, esc = D.esc, el = D.el, setView = D.setView;
    var E = { pid: '', titulo: '', slug: '', escopos: [], painel: null, aba: 'hoje', relogio: null };
    // "AINDA ESTOU NESTA TELA?" — um mecanismo só para o Estude inteiro (auditoria de 11/10/2026). Toda tela nova
    // (trocar de aba, abrir outra aula, outro filtro, outro percurso) avança `VEZ`; toda chamada à API guarda a VEZ
    // em que foi feita, e a resposta que chega DEPOIS de o aluno ter saído daquela tela não é entregue a ninguém —
    // nem o resultado, nem o erro. Antes, o painel (a rota mais pesada) chegava atrasado e pintava a aba Hoje por
    // cima da aba Aulas; a aula A pintava sobre a B; o quiz da A entrava na B. Como TODA chamada passa por aqui,
    // tela nova não precisa lembrar de conferir. (Gravar continua gravando: só a resposta é que não volta à tela.)
    var VEZ = 0;
    var PENDENTES = []; // o que ainda está por gravar (campo de texto, fila da prova): sai ao trocar de tela e ao fechar a página
    // Trocar de tela DESPEJA o que estava por gravar (segunda revisão, 11/10/2026, R1): o texto ainda no campo e a
    // resposta de prova ainda na fila saem na hora, sem esperar o temporizador da tela que acabou de fechar.
    function novaTela() {
      VEZ++;
      (PENDENTES || []).slice().forEach(function (f) { if (f.aoTrocar) { try { f.aoTrocar(); } catch (x) { /* a tela já saiu */ } } });
      return VEZ;
    }
    // O 4º argumento é o ACEITE do orçamento (vira o cabeçalho X-IA-Aceite em app-cliente.js): sem repassá-lo, o
    // "Confirmar" do pedido pago ia sem o cabeçalho, voltava 402 e o aluno era perguntado do mesmo valor duas vezes.
    function api(m, p, b, aceite) {
      var v = VEZ;
      if (m !== 'GET') E.painelVelho = true; // algo mudou no servidor: o painel em memória não é reaproveitado sem conferir
      return apiCru(m, p, b, aceite).then(function (d) { return v === VEZ ? d : new Promise(function () {}); },
        function (e) {
          if (v === VEZ) throw e;
          // ESCRITA que falhou depois de o aluno sair da tela: ele precisa saber — antes o erro sumia junto com a tela
          if (m !== 'GET') avisoDeGravacao(e);
          return new Promise(function () {});
        });
    }
    // ESCRITA EM FILA (respostas da prova, tentativa escrita, nota da aula): quem grava em sequência depende da
    // resposta para soltar o próximo envio — esta NUNCA é descartada, esteja o aluno na tela ou não. Quem a usa
    // confere por conta própria se ainda pode pintar.
    function gravar(m, p, b) { return apiCru(m, p, b); }
    // o envio de ÚLTIMA HORA (fechar a aba, F5, trocar de aba do navegador): `keepalive` deixa o navegador concluir
    // o pedido com a página indo embora. Devolve promessa que só resolve quando o servidor confirmou.
    function gravarNaSaida(caminho, corpo) {
      try {
        return fetch('/academy/api' + caminho, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
          .then(function (r) { if (!r.ok) { var e = new Error('erro ' + r.status); e.status = r.status; throw e; } return r.json().catch(function () { return {}; }); });
      } catch (x) { return Promise.reject(x); } // navegador sem keepalive: fica o que já foi salvo
    }
    // aviso discreto, no pé da página, de que uma gravação feita na tela anterior NÃO chegou ao servidor
    function avisoDeGravacao(e) {
      try {
        var a = document.getElementById('es-nao-gravou');
        if (!a) {
          a = document.createElement('div'); a.id = 'es-nao-gravou'; a.className = 'es-nao-gravou'; a.setAttribute('role', 'alert');
          document.body.appendChild(a);
        }
        a.innerHTML = '<span>Uma alteração feita na tela anterior não foi salva' + (e && e.message ? ' (' + esc(e.message) + ')' : '') + '. Volte a ela e confira.</span> <button type="button" class="es-link" aria-label="Fechar o aviso">Fechar</button>';
        a.querySelector('button').onclick = function () { if (a.parentNode) a.parentNode.removeChild(a); };
      } catch (x) { /* sem página, não há a quem avisar */ }
    }

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
    // CHAVE GERAL dos pedidos pagos (servidor: estudo_pedidos): sem `pedidos_disponiveis` no painel, a aba "Escrita e
    // oral" e as entradas "Importar prova" e "Ler edital em PDF" NÃO existem para este aluno. Toda porta para elas
    // passa por aqui — botão, dica ou link que aponte para a aba sem perguntar leva a uma tela que não existe.
    function temPedidos() { return !!(E.painel && E.painel.pedidos_disponiveis); }
    // percurso sem questão nenhuma: o que dizer (e, no percurso particular, o que oferecer)
    function semQuestoes() {
      var part = !!(E.painel && E.painel.escopo.particular) && temPedidos();
      return { particular: part, txt: part ? 'Este percurso ainda não tem questões — importe uma prova em PDF para praticar e fazer simulado.' : E.painel && E.painel.escopo.particular ? 'Este percurso ainda não tem questões.' : 'Este percurso ainda não tem questões de correção automática.',
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
    // SAIR do Estude por qualquer porta (biblioteca, menu do painel, barra do curso): desliga relógio, microfone e a
    // marca "em prova" — o diagnóstico não tem relógio para limpá-la, e a esfera do Tutor sumia nos outros cursos
    function sairDoEstude() { novaTela(); guardarLugar(); pararRelogio(); if (window.AcademyRota && window.AcademyRota.rolagemManual) window.AcademyRota.rolagemManual(false); }
    window.AcademyEstudeSair = sairDoEstude;
    // janela nova barrada pelo navegador: avisar — antes o clique não fazia nada
    function abrirJanela() {
      var w = null;
      try { w = window.open('', '_blank'); } catch (x) { w = null; }
      if (!w) window.alert('O navegador bloqueou a nova janela. Permita pop-ups para este site (o ícone na barra de endereço) e clique de novo.');
      return w;
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
    // cada passo do histórico leva o que a tela LEMBRA (as disciplinas abertas e a rolagem de cada lista; de onde o
    // aluno veio para a aula, para o caderno, para a jornada): é o que sobrevive ao F5 e devolve ao mesmo lugar
    // (`abaAula`: em cada aula, a aba aberta — texto, legislação ou jurisprudência; `acervo`: a aula de onde o acervo foi aberto)
    // (`ancoraLei`: no diploma inteiro, o dispositivo no topo da tela — a volta é por ele, não pelo pixel; ver diplomaNaTela)
    function lembrancas() { return { es: { lugares: LUGAR, veioDe: E.veioDe || '', porta: E.antesDaPorta || null, caderno: E.antesDoCaderno || null, leitor: E.antesDoLeitor || null, abaAula: ABA_AULA, acervo: E.antesDoAcervo || null, ancoraLei: ancoraAtual() } }; }
    function rota(partes, substituir) { if (window.AcademyRota) window.AcademyRota.gravar(partes, substituir, lembrancas()); }
    // fechar a aba ou recarregar: o passo atual guarda a rolagem e as disciplinas abertas deste instante
    function guardarPassoAgora() {
      if (!el('es-corpo') || !window.AcademyRota || !window.AcademyRota.guardar || document.querySelector('.es-an')) return;
      guardarLugar();
      var d = lembrancas(); d.y = rolagem().scrollTop;
      window.AcademyRota.guardar(d);
    }
    window.addEventListener('pagehide', guardarPassoAgora);
    // …e um instante depois de cada rolagem (há navegador que não deixa gravar o histórico com a página indo embora)
    var rolouTimer = null;
    window.addEventListener('scroll', function () { clearTimeout(rolouTimer); rolouTimer = setTimeout(guardarPassoAgora, 700); }, { passive: true });
    // `inicio` = onde abrir (veio do endereço): { aba, arg, extra } — e `substituir` quando a abertura
    // é automática e não deve virar um passo do botão Voltar.
    // `barra` = { html, ligar }: o que o curso oferece além do percurso (audiobook, material, desafio…), montado por
    // quem abre. `html` pode ser função: a barra é refeita a cada abertura, com o que o curso tem NAQUELE momento.
    // `inicio.y` = a rolagem em que o aluno estava quando saiu para uma tela do curso — "voltar para onde estava".
    function abrir(pid, titulo, slug, voltar, inicio, rotuloVoltar, barra) {
      // no Estude quem repõe a rolagem é a tela, depois de carregar (fora dele, é o navegador)
      if (window.AcademyRota && window.AcademyRota.rolagemManual) window.AcademyRota.rolagemManual(true);
      pararRelogio();
      novaTela();
      inicio = inicio || {};
      E.pid = pid; E.titulo = titulo; E.slug = slug; E.voltar = voltar; E.aba = 'hoje'; E.dentro = '';
      E.rotuloVoltar = rotuloVoltar; E.barra = barra; // quem troca de percurso leva junto o "voltar" e a barra do curso
      // o que o passo do histórico lembrava (F5 ou Voltar do navegador): depois de um F5 a memória da página está
      // vazia, e é daqui que voltam as disciplinas abertas; e o "de onde vim" de CADA passo é o daquele passo
      var lembrado = inicio.es || null, ch = chavePercurso(slug);
      if (lembrado && lembrado.lugares && !LUGARES[ch]) LUGARES[ch] = lembrado.lugares;
      if (lembrado) { E.veioDe = lembrado.veioDe || E.veioDe; E.antesDaPorta = lembrado.porta || E.antesDaPorta; E.antesDoCaderno = lembrado.caderno || E.antesDoCaderno; E.antesDoAcervo = lembrado.acervo || E.antesDoAcervo; }
      if (lembrado && lembrado.abaAula) Object.keys(lembrado.abaAula).forEach(function (k) { if (!ABA_AULA[k]) ABA_AULA[k] = lembrado.abaAula[k]; });
      // o leitor reaberto pelo endereço (F5, Voltar) sabe de onde tinha sido aberto — é o que o passo dele lembrava
      E.antesDoLeitor = inicio.aba === 'aulas' && inicio.arg === 'ler' && lembrado && lembrado.leitor ? lembrado.leitor : null;
      LUGAR = LUGARES[ch] || (LUGARES[ch] = {});
      setView('<div class="al es"><a href="#" class="al-volta" id="es-volta">← ' + esc(rotuloVoltar || 'Voltar ao curso') + '</a>' +
        '<div class="es-cab"><p class="al-rotulo">Estude · ' + esc(titulo) + '</p><h2 id="es-titulo">Carregando…</h2><p class="al-sub" id="es-sub"></p><div class="es-troca" id="es-troca"></div>' +
        '<div class="es-curso-barra">' + (barra && barra.html ? (typeof barra.html === 'function' ? barra.html() : barra.html) : '') + '<span class="es-barra-es" id="es-barra-es"></span></div></div>' +
        '<div class="est-abas es-abas" id="es-abas"></div><div class="es-corpo" id="es-corpo"><p class="al-sub">Carregando…</p></div></div>');
      el('es-volta').onclick = function (e) { e.preventDefault(); pararRelogio(); voltar(); };
      if (barra && barra.ligar) barra.ligar();
      window.scrollTo(0, 0);
      trocaDePercurso();
      var pronto = function () {
        abas();
        botoesDaBarra();
        if (inicio.aba === 'aulas' && inicio.arg === 'ler' && inicio.extra) {
          E.aba = 'aulas';
          marcarAba('aulas');
          lerDisciplina(el('es-corpo'), inicio.extra, null, null, true);
        } else {
          // `pelaRota` (F5, Voltar): a tela está sendo REABERTA — o "de onde vim" é o que o passo lembrava, não a aba Hoje
          // o DIPLOMA reaberto volta pela âncora que o passo guardou (o dispositivo no topo da tela) — e, sem ela, pela
          // rolagem; nos dois casos o dispositivo do endereço ("clt~art-477") não puxa a tela para ele (AL-16)
          var anc = inicio.aba === 'lei' && inicio.arg && lembrado && lembrado.ancoraLei && lembrado.ancoraLei.dip === String(inicio.arg).split('~')[0] ? lembrado.ancoraLei : null;
          if (inicio.aba === 'lei' && inicio.arg && (anc || inicio.y > 0)) { E.reposicao = true; E.ancoraRepor = anc; }
          ir(inicio.aba || 'hoje', inicio.arg || undefined, !!inicio.substituir, { reabrindo: !!inicio.pelaRota, primeira: !inicio.pelaRota && !inicio.y });
          if (inicio.y > 0 && !anc) reporRolagem(inicio.aba || 'hoje', inicio.y); // depois do `ir`, que leva ao topo
        }
      };
      // VOLTAR DO NAVEGADOR E F5 (réplica de 11/10/2026, R3-M9): a página é remontada pelo endereço, e o painel (365 KB
      // no curso real) era pedido de novo a cada Voltar. O painel do MESMO percurso, lido há menos de
      // PAINEL_REAPROVEITA_MS e sem resposta nova por contar, é reaproveitado: a tela monta dele, sem pedido.
      if (painelServe()) { pintarCabecalho(E.painel); pronto(); } else carregar(pronto);
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
    // O painel é DADO do percurso: a resposta atualiza `E.painel` mesmo que o aluno já tenha trocado de aba (a lista
    // de aulas precisa do "✓ estudada" novo). O que NÃO acontece fora de hora é pintar: o `depois` só roda se a
    // tela ainda é a que pediu.
    // PAINEL ENXUTO (réplica de 11/10/2026, R3-M9). O painel inteiro só é pedido na PRIMEIRA vez em cada percurso.
    // Depois disso a tela pede o RESUMO (`?resumo=1`: o estado do aluno, sem os enunciados, títulos e o programa, que
    // não mudam com o estudo) e o junta ao painel que já tem. O resumo traz a `assinatura` da parte fixa: se ela for
    // outra (o curso publicou conteúdo), a tela pede o painel inteiro. Responder uma questão não pede painel nenhum:
    // o resumo vem na própria resposta (`questaoNaTela`).
    var PAINEL_LISTAS = ['competencias', 'unidades', 'itens'], PAINEL_REAPROVEITA_MS = 30000;
    function juntarResumo(tenho, r) {
      if (!tenho || !r || !r.resumo || !r.assinatura || r.assinatura !== tenho.assinatura) return null;
      var novo = {}, ok = true, k;
      for (k in r) if (Object.prototype.hasOwnProperty.call(r, k) && k !== 'resumo' && k !== 'fixos' && k !== 'dinamicos' && PAINEL_LISTAS.indexOf(k) < 0) novo[k] = r[k];
      PAINEL_LISTAS.forEach(function (L) {
        var a = tenho[L] || [], b = r[L] || [], fixos = (r.fixos || {})[L], dinamicos = (r.dinamicos || {})[L] || [];
        if (a.length !== b.length) { ok = false; return; }
        novo[L] = a.map(function (x, i) {
          var y = {}, c;
          if (x.codigo !== b[i].codigo) { ok = false; return x; }
          // do que já tenho fica só a parte FIXA; a parte viva é a que chegou
          for (c in x) if (Object.prototype.hasOwnProperty.call(x, c) && (fixos ? fixos.indexOf(c) >= 0 : dinamicos.indexOf(c) < 0)) y[c] = x[c];
          for (c in b[i]) if (Object.prototype.hasOwnProperty.call(b[i], c)) y[c] = b[i][c];
          return y;
        });
      });
      return ok ? novo : null;
    }
    // o painel em memória é DESTE percurso, recente e sem resposta nova por contar?
    function painelServe() { return !!(E.painel && E.painelDe === base() && !E.painelVelho && E.painelEm && Date.now() - E.painelEm < PAINEL_REAPROVEITA_MS); }
    function guardarPainel(p, b) { E.painel = p; E.painelDe = b; E.painelEm = Date.now(); E.painelVelho = false; }
    function pintarCabecalho(p) {
      if (!el('es-titulo')) return;
      el('es-titulo').innerHTML = esc(p.escopo.titulo) + (p.escopo.particular ? ' <span class="marca-rasc">percurso particular — só você vê</span>' : p.escopo.status === 'rascunho' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : '');
      el('es-sub').textContent = [p.escopo.nivel, p.escopo.data_alvo ? 'prova em ' + dataBR(p.escopo.data_alvo) : 'sem prova marcada', p.escopo.particular && !p.escopo.versao ? 'questões importadas por você' : 'programa versão ' + p.escopo.versao + (p.escopo.particular ? ' (do edital que você enviou)' : '')].filter(Boolean).join(' · ');
    }
    function carregar(depois, inteiro) {
      var v = VEZ, b = base();
      var tenho = !inteiro && E.painel && E.painelDe === b && E.painel.assinatura ? E.painel : null;
      apiCru('GET', b + '/painel' + (tenho ? '?resumo=1' : '')).then(function (p) {
        if (b !== base()) return; // o percurso mudou: este painel é de outro
        if (p && p.resumo) {
          var junto = juntarResumo(tenho, p);
          if (!junto) return carregar(depois, true); // o conteúdo do curso mudou: o resumo não fecha com o que a tela tem
          p = junto;
        }
        guardarPainel(p, b);
        if (v !== VEZ) return;
        pintarCabecalho(p);
        if (depois) depois();
      }).catch(function (e) { if (v === VEZ && b === base()) falha(el('es-corpo'), e); });
    }
    // "Legislação" e "Jurisprudência" (ADR-0014) só existem com o acervo aberto a este aluno (painel.lei_juris)
    var ABAS = [['hoje', 'Hoje'], ['aulas', 'Aulas'], ['mapas', 'Mapas'], ['cobrado', 'Mais cobrado'], ['programa', 'Programa'], ['lei', 'Legislação'], ['juris', 'Jurisprudência'], ['praticar', 'Praticar'], ['escrita', 'Escrita e oral'], ['erros', 'Erros'], ['cards', 'Cards'], ['prova', 'Prova'], ['plano', 'Plano']];
    // As abas são ABAS também para o leitor de tela (réplica de 11/10/2026, baixa 4): `role="tablist"`/`"tab"` e
    // `aria-selected` na aba aberta — antes a aba atual só se distinguia pela cor. A aula, o caderno, a jornada e as
    // ferramentas não são abas: com elas na tela, nenhuma aba fica selecionada.
    function abas() {
      var cx = el('es-abas');
      cx.setAttribute('role', 'tablist'); cx.setAttribute('aria-label', 'Seções do percurso');
      cx.innerHTML = ABAS.filter(function (x) { return x[0] !== 'escrita' || temPedidos(); }).filter(function (x) { return (x[0] !== 'lei' && x[0] !== 'juris') || temLeiJuris(x[0]); }).map(function (x) { return '<button type="button" role="tab" aria-selected="false" aria-controls="es-corpo" data-a="' + x[0] + '">' + x[1] + '</button>'; }).join('');
      cada(cx, 'button', function (b) { b.onclick = function () { ir(b.getAttribute('data-a')); }; });
      marcarAba(E.aba);
    }
    function marcarAba(aba) {
      if (!el('es-abas')) return;
      cada(el('es-abas'), 'button', function (b) { var on = b.getAttribute('data-a') === aba; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    }
    // O LUGAR de cada aba: quais disciplinas estavam abertas e onde a página estava rolada. Sem isso, voltar da
    // aula para a lista devolve ao topo, com a primeira disciplina aberta — "volta ao princípio" (Augusto, 10/10/2026).
    var LUGAR = {}, LUGARES = {}, ONDE = {}, LISTAS = { aulas: 1, mapas: 1, programa: 1, cobrado: 1, escrita: 1, lei: 1, juris: 1 }, PORTAS = { jornada: 1, ferramentas: 1 };
    function rolagem() { return document.scrollingElement || document.documentElement; }
    // `E.dentro`: o corpo NÃO é a lista — é o leitor ("Ler a disciplina") ou "Minhas marcações", abertos por cima
    // dela na mesma aba. Guardar o lugar ali gravava o DOM do leitor (nenhuma disciplina aberta, rolagem 0), e
    // fechar o leitor devolvia a lista toda fechada, no topo.
    function guardarLugar() {
      var c = el('es-corpo');
      if (!c || !LISTAS[E.aba] || E.abaArg || E.dentro) return;
      // corpo ainda em "Carregando…" (a lista não chegou a ser pintada): não há lugar para guardar. Era o que fazia o
      // F5 dentro de "Ler a disciplina" + Fechar devolver Aulas no topo, tudo fechado — o leitor reaberto pelo
      // endereço guardava o corpo vazio por cima do lugar que o passo do histórico lembrava (réplica de 11/10/2026).
      if (c.children.length === 1 && /Carregando/.test(c.textContent)) return;
      var abertos = [];
      cada(c, 'details', function (d, i) { if (d.open) abertos.push(i); });
      LUGAR[E.aba] = { abertos: abertos, y: rolagem().scrollTop };
    }
    function reporLugar(aba, alvo, primeira) {
      var L = LUGAR[aba], n = 0, v = VEZ;
      // lista aberta pela primeira vez: começa do começo (antes herdava a rolagem da tela anterior — a aula em 4.000)
      if (!L) { irAoConteudo(primeira); return; }
      (function tentar() {
        if (E.aba !== aba || v !== VEZ) return; // o aluno já foi para outro lugar
        var ds = alvo.querySelectorAll('details');
        // "ainda carregando" = o corpo é só o aviso de carregamento (uma lista pronta também tem .al-sub: não é sinal)
        if (alvo.children.length === 1 && /Carregando/.test(alvo.textContent) && n++ < 60) return setTimeout(tentar, 100);
        Array.prototype.forEach.call(ds, function (d, i) { var abrir = (L.abertos || []).indexOf(i) >= 0; if (d.open !== abrir) d.open = abrir; });
        reporRolagem(aba, L.y || 0); // espera a página ter altura (a disciplina reaberta carrega o conteúdo dela)
      })();
    }
    // CELULAR: o cabeçalho do curso (título, barra do curso e abas) ocupa mais de uma tela. Tocar numa aba trocava
    // o conteúdo lá embaixo, fora da vista — parecia botão que não responde. Em tela estreita, trocar de aba leva a
    // página até as abas, com o conteúdo logo abaixo; em tela larga (e na primeira abertura), ao topo, como antes.
    // A ROLAGEM ESPERA O CONTEÚDO (réplica de 11/10/2026, M2): com a página no topo, tocar em Prova, Cards, Erros,
    // Plano, Programa, Minha jornada, Meu caderno ou em "Começar" a prova deixava tudo onde estava — a rolagem era
    // pedida com o corpo ainda em "Carregando…", a página não tinha altura e o navegador prendia em 0. Agora o pedido
    // é repetido até a página ter altura para chegar lá (como `reporRolagem`), enquanto a tela for a mesma e o aluno
    // não tiver rolado por conta própria; e, no celular, o corpo tem altura mínima de uma tela (estude.css), para a
    // aba de conteúdo curto também subir.
    var LARGURA_CELULAR = 760;
    function irAoConteudo(primeira) {
      var r = rolagem();
      if (primeira || !el('es-abas') || window.innerWidth > LARGURA_CELULAR) { r.scrollTop = 0; return; }
      var v = VEZ, n = 0, deixei = -1;
      (function tentar() {
        var abas = el('es-abas'), r = rolagem();
        if (v !== VEZ || !abas) return;                               // o aluno já foi para outra tela
        if (deixei >= 0 && Math.abs(r.scrollTop - deixei) > 4) return; // …ou rolou por conta própria: não se briga com ele
        var fixo = document.querySelector('header.top'), h = fixo && /sticky|fixed/.test(window.getComputedStyle(fixo).position) ? fixo.offsetHeight : 0;
        var alvo = Math.max(0, abas.getBoundingClientRect().top + r.scrollTop - h - 6);
        r.scrollTop = alvo; deixei = r.scrollTop;
        if (Math.abs(deixei - alvo) > 4 && n++ < 40) setTimeout(tentar, 120); // a página ainda não tem altura: tenta de novo
      })();
    }
    // a rolagem de volta numa tela que ainda está carregando: espera a página ter altura para chegar lá
    function reporRolagem(aba, y) {
      var n = 0, v = VEZ;
      (function tentar() {
        if (E.aba !== aba || v !== VEZ) return;
        var r = rolagem();
        if (r.scrollHeight - window.innerHeight >= y - 4 || n++ > 40) { r.scrollTop = y; return; }
        setTimeout(tentar, 120);
      })();
    }
    // `como.reabrindo`: a tela está sendo reaberta pelo endereço (F5, Voltar do navegador) — o "de onde vim" já veio
    // do passo do histórico e NÃO é regravado (era o que fazia o "voltar para onde eu estava" cair sempre em Hoje).
    // `como.primeira`: a primeira tela ao entrar no curso — começa do topo, com o cabeçalho à vista.
    function ir(aba, arg, substituir, como) {
      como = como || {};
      // o passo que o aluno DEIXA guarda o lugar dele já (rolagem e, no diploma, a âncora): esperar os 700 ms do
      // ouvinte da rolagem fazia o Voltar do navegador cair 1,4 tela acima (auditoria AL, AL-16)
      var ancoraAntes = ancoraAtual();
      if (!como.reabrindo) { clearTimeout(rolouTimer); guardarPassoAgora(); }
      pararRelogio();
      guardarLugar();
      novaTela();
      var yAntes = rolagem().scrollTop, onde = ONDE[chavePercurso(E.slug)] || {};
      // link antigo, favorito ou retorno de pagamento para a aba que este aluno não tem: cai na aba Hoje
      if (aba === 'escrita' && !temPedidos()) { aba = 'hoje'; arg = undefined; }
      if ((aba === 'lei' || aba === 'juris') && !temLeiJuris(aba)) { aba = 'hoje'; arg = undefined; } // acervo fechado (ou link velho)
      if (!como.reabrindo) {
        // (o "← Voltar à aula" do acervo devolve à aula SEM fazer do acervo o "de onde vim" dela: o Voltar da aula
        // continua levando aonde levava antes de o aluno abrir a lei)
        if (aba === 'unidade' && E.aba && E.aba !== 'unidade' && !(como.voltando && (E.aba === 'lei' || E.aba === 'juris'))) {
          E.veioDe = E.aba;
          // dos acervos de legislação e jurisprudência a aula volta ao MESMO lugar: o diploma (ou a página) e a rolagem
          E.veioDeLugar = { aba: E.aba, arg: onde.aba === E.aba ? onde.arg : undefined, y: yAntes, ancora: ancoraAntes };
        }
        // o acervo aberto DE DENTRO DE UMA AULA guarda a aula e a rolagem dela: "← Voltar à aula" devolve lá, na mesma
        // aba (a de Legislação, se foi dela que o aluno saiu). Entrar no acervo por outra aba esquece a aula.
        if ((aba === 'lei' || aba === 'juris') && !como.voltando) {
          if (E.aba === 'unidade') E.antesDoAcervo = { aba: 'unidade', arg: onde.arg, y: yAntes };
          else if (E.aba !== 'lei' && E.aba !== 'juris') E.antesDoAcervo = null;
        }
        // o caderno devolve a quem o abriu — aba, aula e ROLAGEM
        if (aba === 'caderno' && E.aba !== 'caderno') E.antesDoCaderno = { aba: onde.aba || E.aba, arg: onde.arg, y: yAntes };
        // Minha jornada e Ferramentas são PORTAS (não são abas): guardam de onde o aluno veio — aba, aula e rolagem — para devolvê-lo lá
        if (PORTAS[aba] && !PORTAS[E.aba]) E.antesDaPorta = { aba: E.aba, arg: onde.aba === E.aba ? onde.arg : undefined, y: yAntes };
      }
      E.dentro = ''; E.antesDoLeitor = null;
      E.aba = aba; E.abaArg = typeof arg === 'string' && arg ? arg : (arg && typeof arg === 'object' ? 'obj' : '');
      ONDE[chavePercurso(E.slug)] = { aba: aba, arg: typeof arg === 'string' && arg ? arg : undefined }; // para voltar a este percurso onde estava
      rota(['curso', E.pid, 'estude', E.slug, aba].concat(typeof arg === 'string' && arg ? [arg] : []), substituir);
      marcarAba(aba);
      var alvo = el('es-corpo');
      alvo.innerHTML = '<p class="al-sub">Carregando…</p>';
      if (!document.querySelector('.es-kd')) document.documentElement.style.overflow = ''; // o leitor de tela cheia saiu de cena
      ({ hoje: hoje, aulas: aulas, mapas: mapas, cobrado: maisCobrado, programa: programa, lei: acervoLei, juris: acervoJuris, praticar: praticar, escrita: escrita, erros: erros, cards: cards, prova: prova, plano: plano, unidade: unidade, caderno: caderno, jornada: jornada, ferramentas: ferramentas }[aba] || hoje)(alvo, arg);
      if (LISTAS[aba] && !E.abaArg) reporLugar(aba, alvo, como.primeira); else irAoConteudo(como.primeira);
    }
    // volta a um lugar guardado ({ aba, arg, y }): a tela e a rolagem em que o aluno estava
    function voltarPara(lugar) {
      var a = lugar || { aba: 'hoje' };
      // quem abre um diploma num dispositivo não rola até ele: o lugar guardado manda — a âncora (o dispositivo no topo
      // da tela), ou a rolagem quando não há âncora
      var anc = a.aba === 'lei' && a.arg && a.ancora && a.ancora.dip === String(a.arg).split('~')[0] ? a.ancora : null;
      E.reposicao = a.aba === 'lei' && !!a.arg && (a.y > 0 || !!anc);
      E.ancoraRepor = anc;
      ir(a.aba || 'hoje', a.arg, false, { voltando: true });
      if (a.y > 0 && !(LISTAS[a.aba] && !a.arg) && !anc) reporRolagem(a.aba, a.y); // as listas repõem o próprio lugar
    }
    // "Voltar" de dentro da aula: para a tela de onde o aluno veio (lista de aulas, programa, mapas…), no ponto em que estava
    function voltarDaAula() {
      var veio = E.veioDe;
      if ((veio === 'lei' || veio === 'juris') && E.veioDeLugar && E.veioDeLugar.aba === veio) { voltarPara(E.veioDeLugar); return; }
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
    var PAINEL_FRESCO_MS = 4000;
    function hoje(alvo) {
      // a abertura do curso acabou de pedir o painel: a aba Hoje usa o que chegou, em vez de pedir de novo
      if (E.painel && E.painelDe === base() && !E.painelVelho && E.painelEm && Date.now() - E.painelEm < PAINEL_FRESCO_MS) return pintarHoje(alvo);
      carregar(function () { pintarHoje(alvo); });
    }
    // PROVA EM ANDAMENTO: o cartão "continuar" (aba Prova e aba Hoje), com o tempo que resta pelo relógio do servidor
    function tempoQueResta(pa) {
      var s = Math.max(0, Math.floor((Date.parse(pa.prazo_em) - Date.parse(pa.agora) - (Date.now() - (E.painelEm || Date.now()))) / 1000));
      return s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min' : s >= 60 ? Math.floor(s / 60) + ' min' : 'menos de 1 min';
    }
    function cartaoProvaAberta(p) {
      var pa = p && p.prova_aberta;
      if (!pa) return '';
      return '<div class="jr-caixa es-pv-aberta"><p class="al-rotulo">Prova em andamento</p><h3>Você tem ' + (pa.modo === 'simulado' ? 'um simulado' : 'um treino') + ' em andamento — continuar</h3>' +
        '<p class="al-sub"><b>' + pa.respondidas + ' de ' + pa.total + '</b> questões respondidas · tempo restante: <b>' + tempoQueResta(pa) + '</b>. O relógio é o do servidor e continua correndo; o que você já respondeu está salvo.</p>' +
        '<div class="es-linha"><button class="al-bt" data-pv-continuar="' + esc(pa.id) + '">Continuar a prova</button></div></div>';
    }
    function ligarProvaAberta(alvo) {
      cada(alvo, '[data-pv-continuar]', function (b) { b.onclick = function () { b.disabled = true; ir('prova', { continuar: b.getAttribute('data-pv-continuar') }); }; });
    }
    function pintarHoje(alvo) {
      (function () {
        var p = E.painel, c = p.cobertura, px = p.proxima, ac = ACAO[px.tipo], d = p.desempenho;
        if (px.tipo === 'sem_questoes' && (!p.escopo.particular || !temPedidos())) ac = null; // no percurso do curso, quem traz o conteúdo é o curso; sem os pedidos, não há por onde importar
        var jaFez = !!(p.jornada && p.jornada.avaliacao && p.jornada.avaliacao.diagnostico.feito);
        // enquanto o diagnóstico não foi feito, a porta dele vem ANTES da próxima tarefa; depois, vira a ordem sugerida, logo abaixo
        var h = cartaoProvaAberta(p) + retaFinal(p) + (jaFez ? '' : cartaoDiagnostico(p, true)) + '<div class="es-proxima"><p class="al-rotulo">Sua próxima tarefa</p>' +
          '<h3>' + (px.competencia ? esc(nomeComp(px.competencia)) : (px.tipo === 'concluido' ? 'Tudo demonstrado até aqui' : px.tipo === 'sem_questoes' ? 'Faltam questões para praticar' : px.tipo === 'sem_competencias' ? 'Percurso ainda vazio' : 'Recordar')) + '</h3>' +
          '<p class="es-motivo"><b>Por quê:</b> ' + esc(px.motivo) + '</p>' +
          (ac ? '<button class="al-bt" id="es-agir">' + ac[0] + '</button>' : '') +
          ' <button class="al-bt fan" id="es-outra">Escolher outra coisa</button></div>' + (jaFez ? cartaoDiagnostico(p, true) : '') + cartaoJornada(p);
        // percurso particular ainda sem programa: dizer o que falta, e por onde ele chega
        if (p.escopo.particular && !p.escopo.versao && temPedidos()) h += '<div class="jr-caixa"><h3>Este percurso ainda não tem programa</h3><p class="al-sub">Envie o edital do concurso em PDF: o sistema lê o conteúdo programático, e o percurso ganha o programa por disciplina e o plano com a data da prova.</p>' +
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
        ligarProvaAberta(alvo);
      })();
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
          '<div class="es-linha"><button class="al-bt fan" id="es-au-prog">Ver o programa</button>' + (p.escopo.particular && temPedidos() ? '<button class="al-bt fan" id="es-au-imp">Importar prova em PDF</button>' : '') + '</div></div>';
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
                (a.u.estudada ? ' <span class="es-selo verde" title="Você abriu esta aula e leu até o fim, assistiu à videoaula ou respondeu questão dela">✓ estudada</span>' : '') +
                (a.u.status !== 'publicado' ? ' <span class="marca-rasc">' + esc(a.u.status) + '</span>' : '') + '</span>' +
                '<span class="es-aula-bts"><span class="al-fino es-aula-tem">' + [a.u.video ? (a.u.video_assistido ? 'vídeo ✓ assistido' : 'vídeo') : '', (a.u.animada || []).length ? 'aula interativa' : '', a.u.mapa ? 'mapa mental' : ''].filter(Boolean).join(' · ') + '</span>' +
                '<button class="al-bt peq" data-un="' + esc(a.u.codigo) + '">Abrir a aula</button></span></div>';
            }).join('') + '</details>';
        }).join('');
      cada(alvo, '[data-un]', function (b) { b.onclick = function () { ir('unidade', b.getAttribute('data-un')); }; });
      cada(alvo, '[data-ler]', function (b) { b.onclick = function () { lerDisciplina(alvo, b.getAttribute('data-ler')); }; });
      cada(alvo, '[data-animada]', function (b) { b.onclick = function () { aulaAnimada(b.getAttribute('data-animada')); }; });
      if (el('es-au-mt')) el('es-au-mt').onclick = function () { minhasMarcacoes(alvo); };
      cada(alvo, '[data-mapa]', function (b) { b.onclick = function () { abrirMapa(b.getAttribute('data-mapa'), abrirJanela()); }; });
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
    // `pelaRota`: o leitor está sendo REABERTO pelo endereço (F5, Voltar do navegador) — não há lista na tela para
    // guardar o lugar, e o passo do histórico já existe (não se empilha outro).
    function lerDisciplina(alvo, cod, irPara, aoFechar, pelaRota) {
      if (!pelaRota) guardarLugar(); // o lugar da LISTA (disciplinas abertas, rolagem), antes de o leitor tomar o corpo
      // de dentro da aula ("Ler como livro"): fechar o leitor devolve a aula na mesma rolagem
      var yDaAula = E.aba === 'unidade' ? rolagem().scrollTop : 0, abaDaAula = E.aba === 'unidade';
      // DE ONDE o leitor foi aberto (aba, aula e rolagem): vai no passo do histórico, e é para lá que o Fechar volta
      // mesmo depois de um F5 ou de um Voltar do navegador (antes, o livro reaberto assim fechava na lista de Aulas)
      if (!pelaRota) E.antesDoLeitor = { aba: abaDaAula ? 'unidade' : (LISTAS[E.aba] ? E.aba : 'aulas'), arg: abaDaAula ? (ONDE[chavePercurso(E.slug)] || {}).arg : undefined, y: abaDaAula ? yDaAula : 0 };
      var deOnde = E.antesDoLeitor;
      novaTela();
      E.dentro = 'leitor';
      if (abaDaAula && aoFechar) { var fecharAula = aoFechar; aoFechar = function () { fecharAula(); if (yDaAula > 0) reporRolagem('unidade', yDaAula); }; }
      // reaberto pelo endereço: fecha para onde o passo lembrava (a aula, na rolagem em que estava; ou a lista)
      if (!aoFechar && deOnde && deOnde.aba === 'unidade' && deOnde.arg) aoFechar = function () { voltarPara(deOnde); };
      if (!pelaRota) rota(['curso', E.pid, 'estude', E.slug, 'aulas', 'ler', cod]);
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
        comoDialogo(kd, 'Leitura da disciplina ' + (r.nome || ''));
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
          if (depois) return depois(alvo);
          // FECHAR É VOLTAR (réplica de 11/10/2026, baixa 2). O leitor tem um passo próprio no histórico; fechar abrindo
          // a aula (ou a lista) de novo EMPILHAVA outro passo por cima — dois Voltar depois, o livro fechado reabria.
          // Quando o passo do leitor sabe de onde veio (`deOnde`: foi empilhado por esta página, logo há um passo
          // abaixo dele), fechar VOLTA no histórico e pinta a tela de baixo no lugar dela, sem empilhar (o endereço é
          // substituído pelo mesmo). Sem isso (endereço colado noutra aba) — ou se o Voltar não vier —, vale o caminho
          // de sempre.
          var porBaixo = function () { if (aoFechar) aoFechar(); else ir('aulas'); }; // pela aba, para o endereço acompanhar
          if (!deOnde || !window.history || !history.back) return porBaixo();
          var R0 = window.AcademyRota, vez = VEZ, veio = false;
          var aoVoltar = function (e) {
            window.removeEventListener('popstate', aoVoltar, true); veio = true;
            e.stopImmediatePropagation(); // quem pinta a tela de baixo é o Estude, daqui: a página não é remontada
            setTimeout(function () { if (R0 && R0.sobrepostos > 0) R0.sobrepostos--; }, 0);
            if (vez !== VEZ) return;
            ir(deOnde.aba, deOnde.arg, true, { reabrindo: true });
            if (deOnde.y > 0 && deOnde.aba === 'unidade') reporRolagem('unidade', deOnde.y);
          };
          window.addEventListener('popstate', aoVoltar, true);
          if (R0) R0.sobrepostos = (R0.sobrepostos || 0) + 1; // o painel não trata este Voltar (app-cliente.js)
          try { history.back(); } catch (x) { veio = true; window.removeEventListener('popstate', aoVoltar, true); if (R0 && R0.sobrepostos > 0) R0.sobrepostos--; return porBaixo(); }
          setTimeout(function () { if (veio) return; window.removeEventListener('popstate', aoVoltar, true); if (R0 && R0.sobrepostos > 0) R0.sobrepostos--; if (vez === VEZ) porBaixo(); }, 700);
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
          var w = abrirJanela();
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
          // DUAS ABAS (réplica de 11/10/2026, M5): a nota do grifo vai com o `atualizado_em` que esta tela leu. Se a
          // outra aba a alterou, o servidor não grava (409): o campo segue com o que o aluno digitou, o texto de lá
          // aparece ao lado e ele escolhe qual fica.
          function salvar(cor) {
            var campo = el('es-mt-nota'), minha = campo ? campo.value : (k.nota || '');
            api('PUT', base() + '/marcacoes/' + k.id, { cor: cor || k.cor, nota: minha, lido_em: k.atualizado_em || '' }).then(function (x) {
              k.cor = x.marcacao.cor; k.nota = x.marcacao.nota; k.atualizado_em = x.marcacao.atualizado_em || ''; fechar(); redesenhar();
            }).catch(function (er) {
              if (!(er && er.status === 409 && er.dados && er.dados.conflito)) { barra.innerHTML = '<span class="es-msg-erro">' + esc(er.message) + '</span>'; return; }
              var d = er.dados, velho = barra.querySelector('.es-mt-conflito');
              if (velho) velho.parentNode.removeChild(velho);
              var cx = document.createElement('div');
              cx.className = 'es-mt-conflito'; cx.setAttribute('role', 'alert');
              cx.innerHTML = '<span><b>Esta anotação foi alterada em outra aba.</b> O que está salvo: “<i></i>”</span>' +
                '<button type="button" class="al-bt peq" data-c="meu">Ficar com a que digitei</button><button type="button" class="al-bt peq fan" data-c="outro">Ficar com a da outra aba</button>';
              cx.querySelector('i').textContent = d.texto || '(vazia)';
              barra.appendChild(cx);
              cada(cx, '[data-c]', function (b) {
                b.onclick = function () {
                  k.atualizado_em = d.atualizado_em || ''; // agora esta tela conhece a versão do servidor
                  if (b.getAttribute('data-c') === 'outro') { k.nota = d.texto || ''; fechar(); redesenhar(); return; }
                  salvar(cor);
                };
              });
            });
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
      guardarLugar(); // o lugar da lista de aulas, antes de as marcações tomarem o corpo
      novaTela();
      E.dentro = 'marcacoes';
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
        el('es-mm-volta').onclick = function () { ir('aulas'); }; // pela aba: a lista volta com as mesmas disciplinas abertas e a mesma rolagem
        cada(alvo, '[data-ir]', function (b) { b.onclick = function () { lerDisciplina(alvo, disc(b.getAttribute('data-un')), b.getAttribute('data-ir')); }; });
        cada(alvo, '[data-del]', function (b) { b.onclick = function () { api('DELETE', base() + '/marcacoes/' + b.getAttribute('data-del')).then(function () { minhasMarcacoes(alvo); }).catch(function (e) { falha(alvo, e); }); }; });
      }).catch(function (e) { falha(alvo, e); });
    }

    // ================= MAIS COBRADO: o que a banca já pediu, por tema — e as questões dela =================
    // A medida é a única que temos de fato: as questões OFICIAIS deste concurso, classificadas por ponto do
    // edital. É uma prova, não uma série histórica — a tela diz isso, para o ranking não virar promessa.
    function maisCobrado(alvo) {
      // quantas questões oficiais, de quantas PROVAS, de que bancas e anos: vem do servidor (/banco), não do texto da tela
      alvo.innerHTML = '<p class="al-sub">Carregando…</p>';
      var v = VEZ;
      comBanco(function (b) { if (v === VEZ && E.aba === 'cobrado') pintarMaisCobrado(alvo, b.oficiais_resumo || null); });
    }
    function listaE(itens) { return itens.length > 1 ? itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1] : (itens[0] || ''); }
    function pintarMaisCobrado(alvo, of) {
      var p = E.painel, mm = materias(), uns = {}, compDoItem = {}, discs = [], porDisc = {};
      var nProvas = of ? of.provas : 0, uma = nProvas === 1;
      var bancasTxt = of && of.bancas.length ? listaE(of.bancas.map(function (x) { return esc(x.valor) + ' (' + x.n + ')'; })) : '';
      var anosTxt = of && of.ano_de ? (of.ano_de === of.ano_ate ? 'de ' + of.ano_de : 'de ' + of.ano_de + ' a ' + of.ano_ate) : '';
      var baseTxt = of && of.questoes ? '<b>' + of.questoes + '</b> ' + (of.questoes === 1 ? 'questão oficial' : 'questões oficiais') + ' de <b>' + nProvas + '</b> ' + (uma ? 'prova' : 'provas') + (anosTxt ? ' (' + anosTxt + ')' : '') +
        (bancasTxt ? ', de ' + (of.bancas.length === 1 ? 'uma banca: ' : of.bancas.length + ' bancas: ') + bancasTxt : '') : '';
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
        '<p class="al-sub">Os temas já cobrados em prova oficial, do mais ao menos pedido, e as questões dessas provas para treinar. ' +
        'Base: ' + (baseTxt ? baseTxt + ' — ' : '') + '<b>' + total + '</b> classificações por ponto do edital, em <b>' + cobrados.length + '</b> dos ' + temas.length + ' pontos.</p>' +
        '<p class="al-fino">' + (uma ? 'É o retrato de uma prova, não uma estatística de muitos anos: mostra o estilo da banca, mas ponto que não caiu pode cair.' : 'São ' + nProvas + ' provas de bancas e anos diferentes, não só a do seu edital: o ranking mostra o que costuma cair neste cargo, mas ponto que não caiu pode cair — e a banca do seu concurso pode ter preferências próprias (filtre por ela em Praticar).') + ' Use para ordenar o estudo, não para cortar matéria.</p>' +
        (of && of.lista_provas && of.lista_provas.length > 1 ? '<details class="es-fontes"><summary>As ' + nProvas + ' provas da base</summary><ul>' + of.lista_provas.map(function (x) { return '<li>' + esc(x.nome) + ' — ' + x.n + ' questões</li>'; }).join('') + '</ul></details>' : '') +
        '<div class="es-linha"><button class="al-bt" id="es-mc-todas">Treinar só com questões de prova oficial</button></div></div>' +
        '<div class="jr-caixa"><h3>Por disciplina</h3><p class="al-sub">Quanto cada disciplina pesou ' + (uma ? 'na prova' : 'no conjunto das ' + nProvas + ' provas') + ' e quantos dos seus pontos foram cobrados.</p>' +
        discs.slice().sort(function (a, b) { return b.n - a.n; }).map(function (d) {
          return '<div class="es-mc-linha"><span class="es-mc-nome">' + esc(d.nome) + '</span><span class="es-mc-barra"><i style="width:' + (maxD ? Math.round(d.n * 100 / maxD) : 0) + '%"></i></span>' +
            '<b class="es-mc-n">' + d.n + '</b><span class="al-fino es-mc-obs">' + d.cobrados + ' de ' + d.pontos + ' pontos</span></div>';
        }).join('') + '</div>' +
        '<div class="jr-caixa"><h3>Temas mais cobrados</h3><p class="al-sub">Do edital inteiro, em ordem de cobrança' + (uma ? '' : ' (o número é a soma das ' + nProvas + ' provas)') + '. Em cada tema: a aula, o mapa mental e as questões de prova sobre ele.</p>' +
        cobrados.map(function (t, i) {
          return '<div class="es-mc-tema"><span class="es-mc-pos">' + (i + 1) + 'º</span><div class="es-mc-txt"><b>' + esc(t.cod) + '</b> ' + esc(t.titulo) +
            '<span class="al-fino"> · ' + esc(t.disc) + '</span><span class="es-mc-barra fina"><i style="width:' + Math.round(t.n * 100 / maxT) + '%"></i></span></div>' +
            '<span class="es-banca">' + t.n + (uma ? '× na prova' : '× nas ' + nProvas + ' provas') + '</span><span class="es-aula-bts">' +
            (t.un ? '<button class="al-bt peq fan" data-un="' + esc(t.un) + '">Aula</button>' : '') +
            (t.mapa ? '<button class="al-bt peq fan" data-mapa="' + esc(t.un) + '">🧠 Mapa</button>' : '') +
            (t.comp ? '<button class="al-bt peq" data-of="' + esc(t.comp) + '">Questões de prova</button>' : '') + '</span></div>';
        }).join('') +
        '<p class="al-fino">' + (temas.length - cobrados.length) + ' pontos do edital não foram cobrados ' + (uma ? 'nesta prova' : 'em nenhuma das ' + nProvas + ' provas') + '; eles continuam no Programa e nas Aulas.</p></div>';
      el('es-mc-todas').onclick = function () { ir('praticar', { competencia: '', origem: 'oficial' }); };
      cada(alvo, '[data-un]', function (b) { b.onclick = function () { ir('unidade', b.getAttribute('data-un')); }; });
      cada(alvo, '[data-mapa]', function (b) { b.onclick = function () { abrirMapa(b.getAttribute('data-mapa'), abrirJanela()); }; });
      cada(alvo, '[data-of]', function (b) { b.onclick = function () { ir('praticar', { competencia: b.getAttribute('data-of'), origem: 'oficial' }); }; });
    }

    // ================= PROGRAMA: cada item com o seu destino =================
    function programa(alvo) {
      var p = E.painel, uns = {};
      p.unidades.forEach(function (u) { uns[u.codigo] = u; });
      if (!p.itens.length && !p.competencias.length) {
        alvo.innerHTML = '<div class="jr-caixa"><h3>Programa</h3><p class="al-sub">Este percurso ainda não tem programa.' + (p.escopo.particular && temPedidos() ? ' Envie o edital do concurso em PDF: o sistema lê o conteúdo programático e monta o programa por disciplina.' : '') + '</p>' +
          (p.escopo.particular && temPedidos() ? '<div class="es-linha"><button class="al-bt" id="es-pg-edital">Ler edital em PDF</button></div>' : '') + '</div>';
        if (el('es-pg-edital')) el('es-pg-edital').onclick = function () { ir('escrita', 'edital'); };
        return;
      }
      // só o programa (edital lido, sem aula e sem questão): os itens estão aí — falta com o que estudar e praticar
      var soPrograma = p.itens.length && !p.unidades.length && !p.itens.some(function (i) { return i.questoes_revisadas + i.questoes_sugeridas; });
      var h = (soPrograma ? '<div class="es-nota-aba"><b>Este percurso tem o programa, e ainda não tem questões.</b><p>' + (p.escopo.particular
        ? 'Os itens abaixo são os do edital que você enviou. ' + (temPedidos() ? 'Para praticar por disciplina e fazer simulado, importe uma prova em PDF; para organizar o estudo até a prova, monte o plano.' : 'Para organizar o estudo até a prova, monte o plano.')
        : 'As aulas e as questões aparecem aqui, item a item, assim que forem publicadas.') + '</p>' +
        (p.escopo.particular ? '<div class="es-linha">' + (temPedidos() ? '<button class="al-bt peq" id="es-pg-imp">Importar prova em PDF</button>' : '') + '<button class="al-bt peq fan" id="es-pg-plano">Montar o plano</button></div>' : '') + '</div>' : '') +
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
      var w = janela; // quem chama abre a janela no clique, com `abrirJanela()` — que avisa quando o navegador a barra
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
    // O painel NÃO depende da ordem em que o navegador avisa os ouvintes: enquanto `AcademyRota.sobrepostos` é maior
    // que zero, o ouvinte dele não faz nada (em WebKit antigo ele rodava antes deste e remontava a página).
    // A ROLAGEM da página é guardada ao abrir e reposta ao fechar: a tela sobreposta trava a rolagem do documento, e
    // fechar devolvia a aula ao topo.
    // TELA SOBREPOSTA É DIÁLOGO (segunda revisão, 11/10/2026, acessibilidade): `role="dialog"`, `aria-modal`, nome
    // para o leitor de tela, foco levado para dentro ao abrir, Tab PRESO dentro dela (antes o Tab alcançava a página
    // de baixo) e foco devolvido a quem a abriu quando ela sai. O Esc já é de cada tela.
    function comoDialogo(ov, rotulo) {
      var antes = document.activeElement;
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', rotulo); ov.setAttribute('tabindex', '-1');
      function focaveis() {
        return Array.prototype.filter.call(ov.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'), function (x) {
          return !x.disabled && !x.hidden && x.offsetParent !== null;
        });
      }
      ov.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var f = focaveis();
        if (!f.length) { e.preventDefault(); ov.focus(); return; }
        var primeiro = f[0], ultimo = f[f.length - 1], aqui = document.activeElement;
        if (e.shiftKey && (aqui === primeiro || !ov.contains(aqui))) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && (aqui === ultimo || !ov.contains(aqui))) { e.preventDefault(); primeiro.focus(); }
      });
      setTimeout(function () { if (!ov.isConnected || ov.contains(document.activeElement)) return; var f = focaveis(); try { (f[0] || ov).focus({ preventScroll: true }); } catch (x) { /* sem foco */ } }, 0);
      // saiu de cena: o foco volta para o botão que a abriu
      try {
        var mo = new MutationObserver(function () {
          if (ov.isConnected) return;
          mo.disconnect();
          if (antes && antes.isConnected && antes.focus) { try { antes.focus({ preventScroll: true }); } catch (x) { /* sem foco */ } }
        });
        mo.observe(document.body, { childList: true, subtree: true });
      } catch (x) { /* navegador sem observador: só não devolve o foco */ }
    }
    function sobreposto(fechar) {
      var estado = 0; // 0 aberta · 1 fechando pelo botão · 2 encerrada
      var R0 = window.AcademyRota, y0 = rolagem().scrollTop;
      function repor() { rolagem().scrollTop = y0; setTimeout(function () { if (!document.querySelector('.es-an')) rolagem().scrollTop = y0; }, 60); }
      function aoVoltar(e) {
        window.removeEventListener('popstate', aoVoltar, true);
        e.stopImmediatePropagation(); // a rota não mudou: o painel não precisa remontar a página
        var era = estado; estado = 2;
        if (era === 0) fechar();
        repor();
        setTimeout(function () { if (R0 && R0.sobrepostos > 0) R0.sobrepostos--; }, 0); // depois de todos os ouvintes deste Voltar
      }
      try { history.pushState({ esSobreposto: 1 }, '', location.href); } catch (x) { return function () { repor(); }; }
      if (R0) R0.sobrepostos = (R0.sobrepostos || 0) + 1;
      window.addEventListener('popstate', aoVoltar, true);
      return function () { if (estado !== 0) return; estado = 1; repor(); try { history.back(); } catch (x) { /* sem histórico */ } };
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
      // duplo clique: uma camada só (a segunda chegava depois e abria outra por cima)
      if (E.abrindoAnimada || document.querySelector('.es-an')) return;
      E.abrindoAnimada = true;
      setTimeout(function () { E.abrindoAnimada = false; }, 4000); // a resposta descartada (o aluno saiu) não pode travar o botão
      api('GET', base() + '/unidades/' + encodeURIComponent(codigo) + '/animacoes').then(function (r) {
        E.abrindoAnimada = false;
        var tipos = ['fluxo', 'caso', 'erros'].filter(function (t) { return r[t]; });
        if (!tipos.length || document.querySelector('.es-an')) return;
        var ov = document.createElement('div');
        ov.className = 'es-an es-aqv';
        ov.innerHTML = '<header class="es-an-topo"><b>' + esc(r.titulo) + '</b><span class="es-an-acoes">' +
          tipos.map(function (t) { return '<button class="es-kd-bt" data-t="' + t + '">' + NOME_AN[t] + '</button>'; }).join('') +
          '<button class="es-kd-bt" id="es-aq-x" title="Fechar (Esc)">Fechar</button></span></header>' +
          '<div class="es-an-palco"><div class="es-aq-trilho" id="es-aq-trilho"></div></div>' +
          '<footer class="es-an-pe"><p id="es-aq-onde"></p><div class="es-an-bts"><button class="es-kd-bt" id="es-aq-rec">↺ Recomeçar</button><button class="es-kd-bt forte" id="es-aq-prox">Próximo ›</button></div></footer>';
        document.body.appendChild(ov);
        comoDialogo(ov, 'Aula animada: ' + (r.titulo || ''));
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
      }).catch(function (e) { E.abrindoAnimada = false; window.alert(e.message); });
    }
    function animarMapa(titulo, txt) {
      if (document.querySelector('.es-an')) return; // já há uma tela por cima
      estiloDosMapas();
      var ov = document.createElement('div');
      ov.className = 'es-an';
      ov.innerHTML = '<header class="es-an-topo"><b>' + esc(titulo) + '</b><span class="es-an-acoes">' +
        '<button class="es-kd-bt" id="es-an-voz" aria-pressed="false" title="Ler cada ponto em voz alta, com a voz do navegador">🔈 Voz desligada</button>' +
        '<button class="es-kd-bt" id="es-an-rec">↺ Recomeçar</button><button class="es-kd-bt" id="es-an-x" title="Fechar (Esc)">Fechar</button></span></header>' +
        '<div class="es-an-palco" id="es-an-palco"><div class="es-mapa-inline es-an-mapa">' + htmlDoMapa(titulo, txt) + '</div></div>' +
        '<footer class="es-an-pe"><p id="es-an-msg"></p><div class="es-an-bts"><button class="es-kd-bt" id="es-an-auto">⏸ Pausar</button><button class="es-kd-bt forte" id="es-an-prox">Próximo ›</button></div></footer>';
      document.body.appendChild(ov);
      comoDialogo(ov, 'Mapa que se desenha: ' + (titulo || ''));
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
      novaTela();
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
              cada(corpo, '[data-pdf-aula]', function (b) { b.onclick = function () { abrirMapa(b.getAttribute('data-pdf-aula'), abrirJanela()); }; });
              corpo.querySelector('[data-pdf-disc]').onclick = function () {
                var w = abrirJanela();
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
      novaTela(); // trocar o nível (100 · 50 · 25 · 10) repinta a aula: o que foi pedido para a tela anterior não entra nesta
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
          // ADR-0014: ao lado do texto, a LEGISLAÇÃO e a JURISPRUDÊNCIA do item — abas que trocam só o que se lê aqui
          abasDaAula() + '<div id="es-un-p-texto" role="tabpanel">' +
          '<p class="al-rotulo es-un-txt">Texto da aula</p>' + sel +
          u.blocos.map(function (b) {
            return '<section class="es-bloco ' + b.tipo + '"><h4>' + esc(b.titulo || BLOCO[b.tipo]) + '</h4><div class="es-un-ler">' + textoMarcado(b.texto, [], u.destaques) + '</div>' +
              (b.criterio ? '<p class="al-fino"><b>Critério:</b> ' + esc(b.criterio) + '</p>' : '') +
              (acao[b.tipo] ? '<textarea class="es-ta" data-n="' + b.n + '" rows="4" maxlength="8000" placeholder="Escreva a sua tentativa aqui, antes de ver a solução.">' + esc((tent[b.n] || {}).texto || '') + '</textarea>' +
                '<p class="al-fino es-salvo"><span data-salvo="' + b.n + '">' + (tent[b.n] ? 'Guardada no seu caderno em ' + dataBR(String(tent[b.n].atualizado_em).slice(0, 10)) + '.' : 'O que você escrever fica guardado no seu caderno.') + '</span></p>' +
                (b.tem_solucao ? '<div class="es-linha"><button class="al-bt peq fan" data-sol="' + b.n + '">Ver a solução</button><span class="al-fino" data-msg="' + b.n + '">A solução aparece depois da sua tentativa.</span></div><div class="es-sol" data-out="' + b.n + '"></div>' : '') : '') +
              '</section>';
          }).join('') +
          // o fim do TEXTO da aula: quando ele entra na tela, a leitura foi até o fim (`ligarFimDaLeitura`)
          '<span id="es-un-fim" aria-hidden="true"></span></div>' +
          (temLeiJuris() ? '<div id="es-un-p-lei" class="es-un-painel" role="tabpanel" hidden></div><div id="es-un-p-juris" class="es-un-painel" role="tabpanel" hidden></div>' : '') +
          // o quiz mora DENTRO da aula, como nos outros cursos; as questões vêm do banco e são respondidas aqui
          '<section class="es-bloco es-quiz" id="es-un-quiz" data-aula="' + esc(codigo) + '"><h4>Quiz desta aula</h4><div id="es-un-quiz-cx"><p class="al-sub">Procurando as questões desta aula…</p></div></section>' +
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
        // a aba que estava aberta nesta aula volta aberta ("quero voltar para onde estava")
        cada(alvo, '[data-ua]', function (b) { b.onclick = function () { abrirAbaDaAula(codigo, b.getAttribute('data-ua')); }; });
        if (temLeiJuris()) abrirAbaDaAula(codigo, ABA_AULA[codigo] || 'texto');
        ligarCadernoDaAula(alvo, codigo, u);
        ligarFimDaLeitura(codigo, u.lida);
        quizDaAula(el('es-un-quiz-cx'), codigo, u.conta_pela_leitura);
        if (el('es-un-mapa')) el('es-un-mapa').onclick = function () { abrirMapa(codigo, abrirJanela()); };
        cada(alvo, '[data-sol]', function (b) {
          b.onclick = function () {
            var n = b.getAttribute('data-sol'), ta = alvo.querySelector('textarea[data-n="' + n + '"]'), msg = alvo.querySelector('[data-msg="' + n + '"]');
            api('POST', base() + '/unidades/' + encodeURIComponent(codigo) + '/blocos/' + n + '/solucao', { tentativa: ta.value }).then(function (r) {
              alvo.querySelector('[data-out="' + n + '"]').innerHTML = '<h4>Solução comentada</h4><div class="es-un-ler">' + textoMarcado(r.solucao, [], []) + '</div>' + '<p class="al-fino">Compare com o que você escreveu e corrija uma frase da sua tentativa.</p>';
              b.disabled = true; msg.textContent = '';
              if (ta._esLeu) ta._esLeu(r, ta.value === r.texto ? r.texto : undefined); // a solução gravou a tentativa: o salvamento automático passa a partir dela
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
        if (el('es-un-mapa2')) el('es-un-mapa2').onclick = function () { abrirMapa(codigo, abrirJanela()); };
      }).catch(function (e) { falha(alvo, e); });
    }

    // ---- o que a aula ganhou dos outros cursos: a tentativa que fica guardada, a nota da aula, o quiz e o vídeo que lembra onde parou ----
    // salva sozinho: um tempo depois da última tecla e ao sair do campo; `dizer` mostra "Salvando… / ✓ Salvo"
    // `caminho` = a rota do PUT (para o envio de última hora). Três cuidados (auditoria de 11/10/2026):
    //   · um envio por vez: o seguinte só sai quando o anterior voltou — dois PUT não chegam fora de ordem;
    //   · F5 ou fechar a aba: o que ainda não foi enviado sai na hora, com `keepalive` (o navegador conclui o envio
    //     mesmo com a página indo embora) — antes perdia-se o texto dos últimos instantes;
    //   · cada campo se desinscreve quando sai da tela.
    var TENTATIVAS_FORA_DA_PROVA = 8; // quantas vezes a fila da prova insiste depois de o aluno ter saído da tela
    function despejarPendentes() { PENDENTES.slice().forEach(function (f) { f(); }); }
    window.addEventListener('pagehide', despejarPendentes);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') despejarPendentes(); });
    // (segunda revisão, 11/10/2026) `enviar` usa `gravar`: a resposta SEMPRE volta, mesmo com o aluno já em outra
    // tela — é ela que solta a trava `emVoo` e manda o que foi digitado durante o envio. Por isso a trava não cai
    // mais sozinha por tempo (em rede lenta, dois PUT do mesmo campo voltavam a sair em paralelo). E o envio de
    // última hora só marca o texto como salvo quando o servidor confirmou: sem rede naquele instante, o campo
    // continua "por salvar" e é reenviado.
    // DUAS ABAS (réplica de 11/10/2026, M5): cada envio leva o `atualizado_em` que esta tela LEU (`lidoEm`; '' = leu
    // vazio). Se o servidor tiver outro, ele NÃO grava e devolve 409 com o texto de lá: a tela avisa "alterado em
    // outra aba", mostra aquele texto e mantém no campo o que o aluno digitou — ele escolhe (`caixaDeConflito`).
    // Enquanto não escolhe, nada é enviado. O envio de ÚLTIMA HORA (fechar a aba, F5) e o de quem já saiu da tela
    // vão com `ao_sair`: não há a quem perguntar, então o servidor junta os dois textos — nenhum se perde.
    // `enviar(texto, lidoEm, aoSair)` → promessa da resposta do servidor (que traz o `atualizado_em` novo).
    function salvarSozinho(campo, dizer, enviar, caminho, lidoEm) {
      var timer = null, ultimo = campo.value, emVoo = false, saindo = null, lido = lidoEm == null ? '' : String(lidoEm), conflito = false;
      function fora() { return !document.body.contains(campo); }
      function soltar() { if (fora() && !emVoo && saindo === null && campo.value === ultimo) PENDENTES = PENDENTES.filter(function (f) { return f !== naSaida; }); }
      function leu(r) { if (r && typeof r.atualizado_em === 'string') lido = r.atualizado_em; }
      function agora() {
        clearTimeout(timer); timer = null;
        if (conflito && !fora()) return; // esperando o aluno escolher entre os dois textos
        if (emVoo || campo.value === ultimo) return soltar();
        var v = campo.value, semTela = fora(); dizer('Salvando…'); emVoo = true;
        enviar(v, lido, semTela).then(function (r) { emVoo = false; ultimo = v; leu(r); dizer('✓ Salvo'); if (campo.value !== ultimo) agora(); else soltar(); })
          .catch(function (e) {
            emVoo = false;
            if (e && e.status === 409 && e.dados && e.dados.conflito) return emConflito(e.dados, v);
            dizer(e.message); if (fora()) { avisoDeGravacao(e); ultimo = campo.value; soltar(); }
          });
      }
      function emConflito(d, v) {
        // o aluno já saiu desta tela: não há a quem perguntar — o servidor junta os dois textos
        if (fora()) { emVoo = true; return enviar(v, lido, true).then(function (r) { emVoo = false; ultimo = v; leu(r); soltar(); }, function (e) { emVoo = false; avisoDeGravacao(e); ultimo = campo.value; soltar(); }); }
        conflito = true;
        dizer('Não salvou: este texto foi alterado em outra aba. Escolha abaixo.');
        caixaDeConflito(campo, d, function (escolha) {
          conflito = false; lido = d.atualizado_em || '';
          // "ficar com o da outra aba": o campo já é o texto do servidor; nos outros casos, o que está no campo sai agora
          ultimo = d.texto || '';
          if (campo.value === ultimo) { dizer(escolha === 'outro' ? 'Ficou o texto da outra aba.' : '✓ Salvo'); soltar(); } else agora();
        });
      }
      function naSaida() {
        if (campo.value === ultimo || !caminho) return soltar();
        var v = campo.value; clearTimeout(timer);
        if (saindo === v) return; // este texto já está a caminho
        saindo = v;
        gravarNaSaida(caminho, { texto: v, lido_em: lido, ao_sair: true }).then(function (r) {
          if (saindo === v) saindo = null;
          ultimo = v; leu(r);
          // o servidor juntou com o que a outra aba tinha escrito: o campo (se a página continua aqui) mostra o resultado
          if (r && r.juntado && typeof r.texto === 'string' && campo.value === v) { campo.value = r.texto; ultimo = r.texto; dizer('✓ Salvo — junto com o que foi escrito em outra aba'); } else dizer('✓ Salvo');
          soltar();
        }).catch(function () { if (saindo === v) saindo = null; dizer('Não salvou — sem conexão. Tentando de novo…'); if (!fora()) timer = setTimeout(agora, 4000); });
      }
      naSaida.aoTrocar = agora; // trocou de tela dentro do Estude: o que está no campo sai já
      PENDENTES.push(naSaida);
      campo.oninput = function () { clearTimeout(timer); timer = setTimeout(agora, 1200); };
      campo.onblur = agora;
      // quem grava este mesmo texto por outro caminho (o "Ver a solução" guarda a tentativa) avisa o que o servidor devolveu
      campo._esLeu = function (r, texto) { leu(r); if (typeof texto === 'string') ultimo = texto; };
    }
    // O AVISO DE DUAS ABAS: o texto que está no servidor, ao lado do campo (que segue com o que o aluno digitou), e a
    // escolha — juntar os dois, ficar com o daqui ou ficar com o de lá. Nada é descartado sem o aluno mandar.
    function caixaDeConflito(campo, d, aoEscolher) {
      if (campo._esConflito && campo._esConflito.parentNode) campo._esConflito.parentNode.removeChild(campo._esConflito);
      var cx = document.createElement('div'), ancora = campo.parentNode && campo.parentNode.tagName === 'LABEL' ? campo.parentNode : campo;
      cx.className = 'es-conflito'; cx.setAttribute('role', 'alert');
      cx.innerHTML = '<p><b>Esta anotação foi alterada em outra aba</b> (ou em outro aparelho) depois que esta tela foi aberta. Nada se perdeu: o que você digitou aqui continua no campo, e este é o texto que está salvo:</p>' +
        '<blockquote class="es-conflito-txt"></blockquote>' +
        '<div class="es-linha"><button type="button" class="al-bt peq" data-c="juntar">Juntar os dois</button><button type="button" class="al-bt peq fan" data-c="meu">Ficar com o que digitei aqui</button><button type="button" class="al-bt peq fan" data-c="outro">Ficar com o da outra aba</button></div>';
      cx.querySelector('.es-conflito-txt').textContent = d.texto || '(vazio — o texto foi apagado na outra aba)';
      ancora.parentNode.insertBefore(cx, ancora.nextSibling);
      campo._esConflito = cx;
      cada(cx, '[data-c]', function (b) {
        b.onclick = function () {
          var escolha = b.getAttribute('data-c'), meu = campo.value, outro = d.texto || '';
          if (escolha === 'juntar') campo.value = outro && meu && outro !== meu ? outro + '\n\n' + meu : (meu || outro);
          else if (escolha === 'outro') campo.value = outro;
          if (cx.parentNode) cx.parentNode.removeChild(cx);
          campo._esConflito = null;
          aoEscolher(escolha);
        };
      });
    }
    // a anotação da questão (botão "Guardar anotação"): mesmo cuidado — `lido.em` é o `atualizado_em` que a tela leu
    function guardarAnotacao(qid, campo, msg, lido) {
      api('PUT', base() + '/questoes/' + qid + '/anotacao', { texto: campo.value, lido_em: lido.em }).then(function (r) { lido.em = r.atualizado_em || ''; msg.textContent = 'Guardada.'; })
        .catch(function (e) {
          if (!(e && e.status === 409 && e.dados && e.dados.conflito)) { msg.textContent = e.message; return; }
          msg.textContent = 'Não guardou: esta anotação foi alterada em outra aba. Escolha abaixo.';
          caixaDeConflito(campo, e.dados, function (escolha) {
            lido.em = e.dados.atualizado_em || '';
            if (escolha === 'outro') { msg.textContent = 'Ficou o texto da outra aba.'; return; }
            guardarAnotacao(qid, campo, msg, lido);
          });
        });
    }
    // `u` = a aula como veio do servidor: traz o `atualizado_em` de cada tentativa e da nota (o que esta tela LEU)
    function ligarCadernoDaAula(alvo, codigo, u) {
      var un = base() + '/unidades/' + encodeURIComponent(codigo), tent = (u && u.tentativas) || {}, notaLida = (u && u.nota) || {};
      var corpo = function (v, lido, aoSair) { var c = { texto: v, lido_em: lido }; if (aoSair) c.ao_sair = true; return c; };
      cada(alvo, 'textarea[data-n]', function (ta) {
        var n = ta.getAttribute('data-n'), st = alvo.querySelector('[data-salvo="' + n + '"]');
        salvarSozinho(ta, function (m) { if (st) st.textContent = m; }, function (v, lido, aoSair) { return gravar('PUT', un + '/blocos/' + n + '/tentativa', corpo(v, lido, aoSair)); }, un + '/blocos/' + n + '/tentativa', (tent[n] || {}).atualizado_em || '');
      });
      var nota = el('es-un-nota');
      if (nota) salvarSozinho(nota, function (m) { if (el('es-un-nota-st')) el('es-un-nota-st').textContent = m; }, function (v, lido, aoSair) { return gravar('PUT', un + '/nota', corpo(v, lido, aoSair)); }, un + '/nota', notaLida.atualizado_em || '');
      if (el('es-un-cad')) el('es-un-cad').onclick = function () { ir('caderno'); };
    }
    // QUIZ DESTA AULA: até 5 questões do banco, respondidas aqui mesmo — pelas rotas do Praticar
    function quizDaAula(cx, codigo, contaPelaLeitura) {
      if (!cx) return;
      api('GET', base() + '/unidades/' + encodeURIComponent(codigo) + '/quiz').then(function (r) {
        if (!el('es-un-quiz') || el('es-un-quiz').getAttribute('data-aula') !== codigo) return; // o aluno já saiu DESTA aula
        if (!r.total) { cx.innerHTML = '<p class="al-sub">Esta aula ainda não tem questões no banco. Quando houver, elas aparecem aqui. Ela conta como estudada quando você lê o texto até o fim ou assiste à videoaula.</p>'; return; }
        var n = r.questoes.length, i = 0;
        // a régua da aula estudada, dita onde o aluno age: abrir a aula e ler o texto até o fim, assistir à videoaula ou responder uma questão do quiz dela
        cx.innerHTML = '<p class="al-fino">Para a aula contar como estudada: abrir a aula e ler o texto até o fim, assistir à videoaula ou responder uma questão do quiz dela.</p>' +
          '<p class="al-sub">Esta aula tem <b>' + r.total + ' questão(ões)</b> no banco' + (r.ineditas ? ', ' + r.ineditas + ' nova(s) para você' : ', todas já respondidas por você') + '. ' +
          (r.total > n ? 'Aqui vão ' + n + ' — as que você ainda não viu vêm primeiro.' : 'As que você ainda não viu vêm primeiro.') + '</p>' +
          '<div class="es-linha"><button class="al-bt peq fan" id="es-qz-todas">✍️ Praticar todas (' + r.total + ')</button></div><div id="es-qz-q"></div>';
        el('es-qz-todas').onclick = function () { ir('praticar', r.competencia); };
        var out = el('es-qz-q');
        (function mostrar() {
          if (i >= n) {
            out.innerHTML = '<p class="al-sub">Você respondeu ' + (n > 1 ? 'as ' + n + ' questões' : 'a questão') + ' do quiz desta aula.' + (r.total > n ? ' Há mais ' + (r.total - n) + ' no banco.' : '') + ' Acertar de novo a mesma questão não conta como domínio.</p>' +
              '<div class="es-linha">' + (r.total > n ? '<button class="al-bt peq" id="es-qz-mais">Mais questões desta aula</button>' : '') + '<button class="al-bt peq fan" id="es-qz-tudo">Praticar todas</button></div>';
            if (el('es-qz-mais')) el('es-qz-mais').onclick = function () { quizDaAula(cx, codigo, contaPelaLeitura); };
            el('es-qz-tudo').onclick = function () { ir('praticar', r.competencia); };
            return;
          }
          var q = r.questoes[i];
          questaoNaTela(out, q, '<p class="al-fino">Questão ' + (i + 1) + ' de ' + n + (q.ja_vista ? ' · <b>você já respondeu esta</b>' : ' · nova para você') + '</p>',
            i + 1 < n ? 'Próxima questão' : 'Concluir o quiz', function () { i++; mostrar(); if (cx.scrollIntoView) cx.scrollIntoView({ block: 'start' }); });
        })();
      }).catch(function (e) { falha(cx, e); });
    }
    // LEITURA ATÉ O FIM: avisa o servidor, uma vez, quando o fim do texto da aula entra na tela. Só PESA na aula que
    // não tem questão nem card (a régua é do servidor: estudo/aluno.js › aulaEstudada) — nas outras, estudar é responder.
    // O tempo mínimo existe para "abrir" não virar "ler": aula curta cabe inteira na tela logo ao abrir.
    var LEITURA_MIN_MS = 15000;
    function ligarFimDaLeitura(codigo, jaLida) {
      var fim = el('es-un-fim');
      if (!fim || jaLida) return;
      var desde = Date.now(), timer = null;
      function parar() { clearInterval(timer); window.removeEventListener('scroll', ver); }
      function ver() {
        if (el('es-un-fim') !== fim) { parar(); return; } // o aluno saiu desta aula
        if (Date.now() - desde < LEITURA_MIN_MS) return;
        if (!fim.offsetParent && fim.getClientRects().length === 0) return; // o texto está escondido (aba Legislação ou Jurisprudência aberta): não é leitura
        if (fim.getBoundingClientRect().top > (window.innerHeight || document.documentElement.clientHeight)) return; // ainda não chegou ao fim
        parar();
        api('PUT', base() + '/unidades/' + encodeURIComponent(codigo) + '/lida').then(function (x) { if (x.estudada) carregar(); })
          .catch(function () { /* sem o registro a aula segue igual; a próxima abertura tenta de novo */ });
      }
      timer = setInterval(ver, 2000);
      window.addEventListener('scroll', ver, { passive: true });
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
        if (el('es-cad-volta')) el('es-cad-volta').onclick = function () { voltarPara(antes); };
        if (el('es-cad-pdf')) el('es-cad-pdf').onclick = function () { var w = abrirJanela(); if (w) escreverCaderno(w, r); }; // a janela abre no clique
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
        '<p class="al-sub">Curso livre. Certificado emitido pela Villela Academy, sem validade para o MEC. Sai quando você estuda todas as aulas do percurso (em cada uma: abrir a aula e ler até o fim, assistir à videoaula ou responder uma questão do quiz dela) e envia um simulado no formato do edital, com ao menos ' + (k.simulado_pct_respondidas || 80) + ' % das questões respondidas.</p>' +
        '<table class="es-tab"><tr><td>Aulas estudadas</td><td class="n">' + k.estudadas + ' de ' + k.total_aulas + '</td></tr>' +
        '<tr><td>Simulados que contam (no formato do edital, ' + (k.simulado_pct_respondidas || 80) + ' % respondido)</td><td class="n">' + k.provas_enviadas + (k.simulados_enviados > k.provas_enviadas ? ' <span class="al-fino">de ' + k.simulados_enviados + ' enviado(s)</span>' : '') + '</td></tr></table>' +
        (k.certificado ? '<div class="es-linha"><a class="al-bt" href="/academy/certificados/' + esc(k.certificado) + '" target="_blank" rel="noopener">🎓 Ver o meu certificado</a></div>'
          : k.cumprido ? '<div class="es-linha"><button class="al-bt" data-cert="1">🎓 Emitir certificado</button><span class="al-fino" data-cert-msg="1"></span></div>'
          : '<p class="es-aviso">' + (k.total_aulas ? (k.faltam_aulas + k.faltam_provas > 1 ? 'Faltam ' : 'Falta ') + [k.faltam_aulas ? k.faltam_aulas + (k.faltam_aulas > 1 ? ' aulas' : ' aula') : '', k.faltam_provas ? k.faltam_provas + (k.faltam_provas > 1 ? ' simulados' : ' simulado') : ''].filter(Boolean).join(' e ') + '.' : esc(k.falta_txt)) + '</p>' +
            '<div class="es-linha">' + (k.faltam_aulas ? '<button class="al-bt peq fan" data-concl-ir="aulas">Ir para as aulas</button>' : '') + (k.faltam_provas ? '<button class="al-bt peq fan" data-concl-ir="prova">Fazer um simulado</button>' : '') + '</div>') + '</div>';
    }
    function emitirCertificado(bt, msg) {
      var w = window.open('', '_blank'); // no clique, antes da rede — senão o navegador barra como pop-up
      bt.disabled = true;
      apiCru('POST', '/aluno/cursos/' + E.pid + '/certificado').then(function (r) {
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
    // frase que vem do servidor em minúscula e entra DEPOIS de um ponto ("…sem veredito. O bloco I vale…")
    function maiuscula(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
    function voltarDaPorta() { voltarPara(E.antesDaPorta); }
    function botaoVoltarDaPorta() { return '<button class="al-bt fan" data-volta-porta="1">← Voltar para onde eu estava</button>'; }
    function ligarVoltarDaPorta(alvo) { cada(alvo, '[data-volta-porta]', function (b) { b.onclick = voltarDaPorta; }); }
    // começa (ou retoma) o diagnóstico ou o teste final e abre a mesma tela de prova — sem relógio
    function iniciarAvaliacao(tipo, msg, recomecar) {
      api('POST', base() + '/diagnostico', recomecar ? { tipo: tipo, recomecar: true } : { tipo: tipo }).then(function (t) {
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
      if (d.aberto && d.aberto.vencido) h += '<p><b>Diagnóstico não concluído.</b> Você respondeu ' + d.aberto.respondidas + ' de ' + d.aberto.total + ' e não enviou. Nada foi corrigido: retome de onde parou (as respostas estão salvas) ou recomece com outras questões.</p>' +
        '<div class="es-linha"><button class="al-bt" data-aval="diagnostico">Retomar de onde parei</button><button class="al-bt fan" data-aval="diagnostico" data-recomecar="1">Recomeçar do zero</button><span data-aval-msg="1"></span></div>';
      else if (d.aberto) h += '<p>Diagnóstico em andamento: <b>' + d.aberto.respondidas + ' de ' + d.aberto.total + '</b> respondidas. As respostas estão salvas; ele fica aberto até ' + dataBR(String(d.aberto.valido_ate).slice(0, 10)) + '.</p>' +
        '<div class="es-linha"><button class="al-bt" data-aval="diagnostico">Continuar o diagnóstico</button><button class="al-bt fan" data-aval="diagnostico" data-recomecar="1">Recomeçar do zero</button><span data-aval-msg="1"></span></div>';
      else if (!d.feito) h += (d.nao_concluido ? '<p><b>Diagnóstico não concluído.</b> Você começou um diagnóstico e não o enviou: ele não conta como feito. Pode começar de novo quando quiser.</p>' : '') + '<p class="al-sub">Uma prova curta, com até ' + a.por_disciplina + ' questões de cada disciplina do percurso (cerca de ' + n + ' no total). Não tem relógio: responda no seu ritmo, pare quando quiser e continue depois. No fim, você vê como foi em cada disciplina e por onde vale começar.</p>' +
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
      cada(alvo, '[data-aval]', function (b) {
        b.onclick = function () {
          var de_novo = b.getAttribute('data-recomecar') === '1'; // { recomecar: true }: larga a tentativa aberta, sem correção
          if (de_novo && !window.confirm('Recomeçar o diagnóstico do zero? As respostas salvas desta tentativa são descartadas (nada delas foi corrigido).')) return;
          b.disabled = true; iniciarAvaliacao(b.getAttribute('data-aval'), b.parentNode.querySelector('[data-aval-msg]'), de_novo); setTimeout(function () { b.disabled = false; }, 4000);
        };
      });
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
        // "conferida" é etapa de REVISÃO do curso: quem revisa vê a conferência; o aluno vê quantos pontos têm questão para praticar
        (p.revisor ? eixo('Com questão conferida', c.avaliacao.com_questao_revisada, c.folhas, c.avaliacao.so_sugerida ? '+ ' + c.avaliacao.so_sugerida + ' com vínculo ainda a conferir' : 'itens com questão vinculada', 'cinza')
          : eixo('Com questão para praticar', c.avaliacao.com_questao_revisada + c.avaliacao.so_sugerida, c.folhas, 'itens do programa com questão no banco', 'cinza')) +
        eixo('Estudados por você', c.estudo.estudados, c.folhas, 'itens cuja aula você já estudou', 'ambar') +
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
      return '<div class="jr-caixa es-jr-ponto"><p class="al-rotulo">Antes de começar</p><h3>' + (d.aberto && d.aberto.vencido ? 'Diagnóstico não concluído' : d.aberto ? 'Seu diagnóstico está em andamento' : d.nao_concluido ? 'Diagnóstico não concluído — comece de novo' : 'Faça o diagnóstico de entrada') + '</h3>' +
        '<p class="al-sub">' + (d.aberto && d.aberto.vencido ? d.aberto.respondidas + ' de ' + d.aberto.total + ' questões respondidas e nenhum envio: ele não conta como feito. Retome de onde parou (as respostas estão salvas) ou recomece em Minha jornada.'
          : d.aberto ? d.aberto.respondidas + ' de ' + d.aberto.total + ' questões respondidas. As respostas estão salvas: continue de onde parou.'
          : 'Até ' + a.por_disciplina + ' questões de cada disciplina (cerca de ' + (a.por_disciplina * a.disciplinas) + '), sem relógio e em quantas partes você quiser. No fim, você vê por onde vale começar.') + '</p>' +
        '<div class="es-linha"><button class="al-bt" data-aval="diagnostico">' + (d.aberto && d.aberto.vencido ? 'Retomar de onde parei' : d.aberto ? 'Continuar o diagnóstico' : 'Começar o diagnóstico') + '</button>' +
        (d.aberto && d.aberto.vencido ? '<button class="al-bt fan" data-aval="diagnostico" data-recomecar="1">Recomeçar do zero</button>' : '') + '<span data-aval-msg="1"></span></div></div>';
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
      sc.src = '/academy/estude-motores.js?v=3';
      // Os motores chegam em ES5 (réplica de 11/10/2026, R3-B11: estudo/motores-navegador.js): rodam em qualquer
      // navegador que abre o resto do curso. O arquivo que chegou e não rodou é falha de carga, não de navegador.
      sc.onload = function () { if (window.EstudeMotores) feito(window.EstudeMotores); else falha(alvo, new Error('As ferramentas não carregaram por inteiro. Recarregue a página e tente de novo.')); };
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
      // o formato do edital (quando a regra o traz): as questões de cada bloco já vêm preenchidas, e bloco SEM mínimo também entra na conta
      var fmtBlocos = temRegra && norm.formato ? norm.formato.blocos : null;
      if (fmtBlocos) {
        blocos.forEach(function (b) { if (fmtBlocos[b.bloco]) b.questoes = fmtBlocos[b.bloco]; });
        Object.keys(fmtBlocos).forEach(function (nome) { if (!blocos.some(function (b) { return b.bloco === nome; })) blocos.push({ bloco: nome, fixo: true, questoes: fmtBlocos[nome] }); });
      }
      // regra com mínimo só em ALGUNS blocos: a nota era calculada só sobre eles. As demais questões da prova entram por aqui.
      var podeOutras = temRegra && norm.minimos.length > 0 && !fmtBlocos;
      function minimoTxt(m) { return !m ? '' : [m.min_pontos != null ? num(m.min_pontos) + ' ponto(s)' : '', m.min_pct != null ? num(m.min_pct) + ' %' : ''].filter(Boolean).join(' e '); }
      function linhas() {
        return blocos.map(function (b, i) {
          return '<div class="es-form es-fer-bloco" data-bl="' + i + '">' +
            (b.fixo ? '<p class="es-fer-nome"><b>' + (b.outras ? 'Outras questões (sem mínimo de bloco)' : b.bloco ? 'Bloco ' + esc(b.bloco) : 'Prova inteira') + '</b>' + (b.min ? '<span class="al-fino">mínimo do bloco: ' + minimoTxt(b.min) + '</span>' : '') + '</p>'
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
          (podeOutras && !blocos.some(function (b) { return b.outras; }) ? '<div class="es-linha"><button class="al-bt peq fan" id="es-fer-outras">+ questões de bloco sem mínimo</button><span class="al-fino">Se a sua prova tem questões fora destes blocos, inclua: elas contam na nota e no mínimo geral.</span></div>' : '') +
          (temRegra ? '' : '<div class="es-linha"><button class="al-bt peq fan" id="es-fer-mais">+ bloco</button>' + (blocos.length > 1 ? '<button class="al-bt peq fan" id="es-fer-menos">− bloco</button>' : '') + '</div>' +
            '<div class="es-form">' + campoNum('Mínimo geral de acertos', 'max="2000" id="es-fer-geral"', E.ferGeral) + campoNum('Cada quantas erradas anulam 1 certa (0 = não desconta)', 'max="20" id="es-fer-desc"', E.ferDesc || 0) +
            '<label class="es-campo es-fer-check"><input type="checkbox" id="es-fer-branco"' + (E.ferBranco ? ' checked' : '') + '> Questão em branco conta como erro</label></div>') +
          '<div class="es-linha"><button class="al-bt" id="es-fer-calc">Calcular</button></div><div id="es-fer-res"></div></div>';
        if (el('es-fer-mais')) el('es-fer-mais').onclick = function () { ler(); blocos.push({ bloco: String(blocos.length + 1) }); pintar(); };
        if (el('es-fer-outras')) el('es-fer-outras').onclick = function () { ler(); blocos.push({ bloco: 'outras questões', fixo: true, outras: true }); pintar(); };
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
        // "mínimo atingido" sai do MOTOR (`x.atingido`), nunca de "faltam 0": numa prova de 10 questões o mínimo de 1,2 é
        // inalcançável, não há mais questão a acertar (faltam 0) e a tela dizia "mínimo atingido"
        var falta = function (x, onde) {
          if (x.atingido == null) return '';
          if (x.atingido) return '<span class="es-selo verde">mínimo atingido</span>';
          if (!x.possivel) return '<span class="es-selo verm">inalcançável com este número de questões (nem acertando ' + onde + ')</span>';
          return '<span class="es-selo ambar">' + (x.faltam_acertos > 1 ? 'faltam ' + x.faltam_acertos + ' acertos' : 'falta 1 acerto') + '</span>';
        };
        out.innerHTML = '<div class="es-nota"><b>' + num(r.nota_liquida) + '</b><span> de ' + num(r.maximo) + ' · ' + num(r.pct_liquido) + ' %</span></div>' +
          // (a tabela mora numa faixa que rola de lado: no celular ela tinha 408 px num cartão de 297, e a "Situação" saía cortada)
          '<div class="es-tab-rola"><table class="es-tab es-jr-tab es-fer-tab"><tr><th>Bloco</th><th class="n">Acertos</th><th class="n">Pontos</th><th class="n">Mínimo</th><th class="n">Situação</th></tr>' + r.blocos.map(function (b) {
            return '<tr><td>' + (b.bloco === 'outras questões' ? 'Outras questões' : b.bloco ? 'Bloco ' + esc(b.bloco) : 'Prova inteira') + '</td><td class="n">' + b.acertos + ' de ' + b.questoes + '</td><td class="n">' + num(b.pontos) + ' de ' + num(b.maximo) + '</td><td class="n">' + (b.minimo ? minimoTxt(b.minimo) : '—') + '</td><td class="n">' + (falta(b, 'o bloco inteiro') || '<span class="es-fer-nada">—</span>') + '</td></tr>';
          }).join('') + '</table></div>' +
          '<table class="es-tab">' + (r.descontados ? '<tr><td>Pontos brutos</td><td class="n">' + num(r.nota_bruta) + '</td></tr><tr><td>Desconto: ' + r.erros_contados + ' erro(s) pela regra</td><td class="n">− ' + num(r.descontados) + '</td></tr>' : '') +
          '<tr><td><b>Nota líquida</b></td><td class="n"><b>' + num(r.nota_liquida) + '</b></td></tr>' +
          (r.geral ? '<tr><td>Mínimo geral: ' + minimoTxt(r.geral) + '</td><td class="n">' + falta(r.geral, 'tudo o que falta') + '</td></tr>' : '') + '</table>' +
          (r.minimos_sem_bloco.length ? '<p class="es-aviso">A regra tem mínimo para o(s) bloco(s) ' + r.minimos_sem_bloco.map(esc).join(', ') + ', que você não preencheu.</p>' : '') +
          '<p><b>' + (r.minimos_sem_bloco.length ? 'Preencha todos os blocos da regra para saber se atinge os mínimos.' : r.aprovado === null ? 'Sem mínimo geral informado: não há critério para dizer se atinge ou não.' : r.aprovado ? 'Com estes números, você atinge os mínimos ' + (temRegra ? 'cadastrados' : 'que informou') + '.' : 'Com estes números, você não atinge os mínimos ' + (temRegra ? 'cadastrados' : 'que informou') + '.') + '</b></p>' +
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
        el('es-cr-pdf').onclick = function () { var w = abrirJanela(); if (w) escreverCronograma(w, ultimo, F.escopo.titulo); }; // a janela abre no clique; imprimir é outro clique, lá dentro
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
      // a nota de VIGÊNCIA não entra aqui: em parte das questões ela cita a norma da alternativa certa. Ela aparece
      // depois da resposta (Praticar e quiz) e na correção comentada (prova) — `notaDeVigencia`
      return '<p class="es-proc">' + partes.filter(Boolean).map(esc).join(' — ') + '</p>';
    }
    function notaDeVigencia(v) { return v ? '<p class="es-vigencia"><b>Vigência:</b> ' + esc(v) + '</p>' : ''; }
    // o que se escreve ao lado da alternativa depois da resposta (texto + sinal; a cor é só reforço)
    function marcaDaAlternativa(correta, marcada) {
      return correta ? '✔ gabarito' + (marcada ? ' · sua resposta' : '') : (marcada ? '✖ sua resposta' : '');
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
        (q.pistas_disponiveis ? '<button class="al-bt fan" id="es-pista">Pedir uma pista</button><span class="al-fino">Com pista, o acerto conta como prática com apoio.</span>' : '') + '</div><div id="es-fb" role="status" aria-live="polite"></div>';
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
        // `painel: true` — o RESUMO do painel volta na própria resposta (réplica de 11/10/2026, R3-M9): antes, cada
        // questão respondida pedia o painel inteiro de novo (365 KB no curso real)
        var b0 = base(), pedePainel = !!(E.painel && E.painelDe === b0 && E.painel.assinatura);
        api('POST', b0 + '/questoes/' + q.id + '/responder', { resposta: m.value, confianca: cf ? cf.value : '', tempo_seg: Math.round((Date.now() - inicio) / 1000), painel: pedePainel }).then(function (x) {
          // O gabarito e a resposta do aluno vão também em TEXTO e sinal (✔ ✖), não só na cor: quem não distingue
          // verde de vermelho — ou usa leitor de tela — não sabia QUAL era a certa.
          var letrasCertas = [];
          cada(out, '.es-alt', function (l) {
            var a = x.alternativas.filter(function (y) { return y.id === l.getAttribute('data-alt'); })[0];
            var marcou = l.querySelector('input').checked, letra = (l.querySelector('.es-letra') || {}).textContent || '';
            l.classList.add(a.correta ? 'certa' : (marcou ? 'errada' : 'neutra'));
            if (a.correta) letrasCertas.push(letra);
            if (a.correta || marcou) l.querySelector('.es-alt-txt').insertAdjacentHTML('afterend', '<span class="es-alt-marca">' + marcaDaAlternativa(a.correta, marcou) + '</span>');
            l.querySelector('input').disabled = true;
            if (a.explicacao) l.insertAdjacentHTML('beforeend', '<span class="es-expl">' + esc(a.explicacao) + '</span>');
          });
          var ret = Object.keys(x.retomadas || {}).map(function (k) { return x.retomadas[k].vencimento; }).filter(Boolean)[0];
          el('es-fb').innerHTML = '<div class="es-fb ' + (x.acerto ? 'ok' : 'nao') + '"><b>' + (x.acerto ? '✔ Certo.' : '✖ Não foi desta vez.') + '</b>' + (letrasCertas.length ? ' Gabarito: ' + esc(letrasCertas.join(', ')) + '.' : '') + ' Conta como: ' + esc(x.conta_como) + '.' +
            (ret ? ' Retomada marcada para ' + dataBR(ret) + '.' : '') + (x.comentario ? '<p>' + esc(x.comentario) + '</p>' : '') + notaDeVigencia(x.vigencia) + '</div>' +
            '<label class="es-campo es-anot">Sua anotação (fica no caderno de erros)<textarea id="es-anot" rows="3" maxlength="2000" placeholder="Por que errei — ou por que cada alternativa está certa ou errada.">' + esc(x.anotacao || '') + '</textarea></label>' +
            '<div class="es-linha"><button class="al-bt" id="es-prox">' + esc(rotuloProx) + '</button><button class="al-bt fan" id="es-anot-ok">Guardar anotação</button><span class="al-fino" id="es-anot-msg"></span></div>';
          var lidoAnot = { em: x.anotacao_em || '' };
          el('es-anot-ok').onclick = function () { guardarAnotacao(q.id, el('es-anot'), el('es-anot-msg'), lidoAnot); };
          el('es-prox').onclick = aoProxima;
          // o painel novo: do resumo que veio com a resposta; sem ele (ou se o conteúdo do curso mudou), pede
          var junto = x.painel && b0 === base() ? juntarResumo(E.painel, x.painel) : null;
          if (junto) guardarPainel(junto, b0); else carregar();
        }).catch(function (e) { el('es-resp').disabled = false; el('es-fb').innerHTML = '<p class="es-msg-erro">' + esc(e.message) + '</p>'; });
      };
    }
    function praticar(alvo, competencia) {
      novaTela(); // trocar o filtro repinta: a lista do filtro anterior não entra por cima
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
    function erros(alvo, pagina) {
      novaTela();
      pagina = Number(pagina) > 0 ? Number(pagina) : 1;
      api('GET', base() + '/erros?pagina=' + pagina).then(function (r) {
        if (!r.total) { alvo.innerHTML = '<div class="jr-caixa"><h3>Caderno de erros</h3><p class="al-sub">Vazio. Entra aqui a questão em que a sua última resposta foi um erro; sai quando você a acerta de novo.</p></div>'; return; }
        alvo.innerHTML = '<div class="jr-caixa"><h3>Caderno de erros <span class="es-selo ambar">' + r.total + '</span></h3>' +
          '<p class="al-sub">Questão serve para achar lacuna. Leia por que errou, anote com as suas palavras e refaça. Acertar de novo a mesma questão fecha a lacuna, mas não conta como domínio — isso exige questão nova.</p>' +
          '<div class="es-linha"><button class="al-bt" id="es-err-ref">Refazer estas questões</button></div>' +
          // a lista vem em páginas: o total é o do caderno inteiro, e a tela diz qual pedaço está à vista
          (r.paginas > 1 ? '<p class="al-fino es-err-pg">Mostrando ' + ((r.pagina - 1) * r.por_pagina + 1) + ' a ' + ((r.pagina - 1) * r.por_pagina + r.questoes.length) + ' de ' + r.total + ' · página ' + r.pagina + ' de ' + r.paginas + ' ' +
            (r.pagina > 1 ? '<button class="es-link" data-err-pg="' + (r.pagina - 1) + '">← anteriores</button> ' : '') + (r.pagina < r.paginas ? '<button class="es-link" data-err-pg="' + (r.pagina + 1) + '">próximas →</button>' : '') + '</p>' : '') + '</div>' +
          r.questoes.map(function (q) {
            return '<div class="jr-caixa es-erro"><p class="al-fino">' + (q.erros > 1 ? 'errada ' + q.erros + ' vezes' : 'errada 1 vez') + ' · última em ' + dataBR(q.ultima.slice(0, 10)) +
              (q.competencias.length ? ' · ' + esc(String(nomeComp(q.competencias[0])).slice(0, 80)) : '') + '</p><div class="es-enun">' + texto(q.enunciado) + '</div>' +
              '<details><summary>Ver o gabarito comentado</summary>' + q.alternativas.map(function (a) {
                return '<p class="es-alt-lida ' + (a.correta ? 'certa' : '') + '"><b>' + esc(a.id) + ')' + (a.correta ? ' · ✔ gabarito' : '') + '</b> ' + esc(a.texto) + (a.explicacao ? '<span class="es-expl">' + esc(a.explicacao) + '</span>' : '') + '</p>';
              }).join('') + (q.comentario ? '<p>' + esc(q.comentario) + '</p>' : '') + notaDeVigencia(q.vigencia) + '</details>' +
              '<label class="es-campo es-anot">Sua anotação<textarea rows="2" maxlength="2000" data-anot="' + esc(q.id) + '" data-anot-em="' + esc(q.anotacao_em || '') + '" placeholder="Por que errei.">' + esc(q.anotacao || '') + '</textarea></label>' +
              '<div class="es-linha"><button class="al-bt peq fan" data-anot-ok="' + esc(q.id) + '">Guardar anotação</button><span class="al-fino" data-anot-msg="' + esc(q.id) + '"></span></div></div>';
          }).join('') +
          (r.paginas > 1 ? '<div class="jr-caixa"><p class="al-fino">Página ' + r.pagina + ' de ' + r.paginas + ' · ' + r.total + ' questões no caderno. ' +
            (r.pagina > 1 ? '<button class="es-link" data-err-pg="' + (r.pagina - 1) + '">← anteriores</button> ' : '') + (r.pagina < r.paginas ? '<button class="es-link" data-err-pg="' + (r.pagina + 1) + '">próximas →</button>' : '') + '</p></div>' : '');
        cada(alvo, '[data-err-pg]', function (b) { b.onclick = function () { erros(alvo, b.getAttribute('data-err-pg')); irAoConteudo(false); }; });
        el('es-err-ref').onclick = function () { ir('praticar', '__erradas__'); };
        cada(alvo, '[data-anot-ok]', function (b) {
          b.onclick = function () {
            var id = b.getAttribute('data-anot-ok'), msg = alvo.querySelector('[data-anot-msg="' + id + '"]');
            var campo = alvo.querySelector('[data-anot="' + id + '"]');
            if (!campo._esLido) campo._esLido = { em: campo.getAttribute('data-anot-em') || '' };
            guardarAnotacao(id, campo, msg, campo._esLido);
          };
        });
      }).catch(function (e) { falha(alvo, e); });
    }

    // ---- o acervo inteiro, para quem revisa o curso (não agenda nem conta como estudo) ----
    function todosOsCards(alvo) {
      novaTela();
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
      novaTela();
      api('GET', base() + '/cards').then(function (r) {
        var fila = r.vencidos.concat(r.novos), i = 0, lim = r.limites || {};
        // "Card 1 de 5" lido sem explicação parece acervo de cinco cards: a nota
        // diz que é a sessão de hoje, quantos existem e por que chegam aos poucos.
        var nota = !r.total ? '' : '<div class="es-nota-aba"><b>Por que só ' + (fila.length || 'alguns') + ' hoje?</b>' +
          '<p>Esta aba entrega a <b>sessão de hoje</b>, não o acervo inteiro. Este percurso tem <b>' + r.total + ' cards</b>, e todos chegam a você com o tempo.</p>' +
          '<ul><li><b>Cards novos:</b> no máximo ' + (lim.novos_dia || 5) + ' por dia, na ordem do programa' + (r.novos_hoje ? ' — hoje você já começou ' + r.novos_hoje + (r.novos_hoje >= (lim.novos_dia || 5) && r.por_ver ? '; os próximos chegam amanhã' : '') : '') + '.</li>' +
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
    // A aba Prova pergunta ao servidor, A CADA ABERTURA, se há prova em andamento (o painel traz `prova_aberta`):
    // havendo, mostra "continuar" com o tempo que resta — antes, trocar de aba ou dar F5 no meio da prova caía no
    // formulário "Montar a prova", sem aviso, com o relógio correndo.
    function prova(alvo, arg) {
      if (arg && arg.continuar) {
        api('GET', base() + '/tentativas/' + arg.continuar).then(function (t) { t.retomada = true; executar(alvo, t); }).catch(function (e) { falha(alvo, e); });
        return;
      }
      carregar(function () {
        if (E.painel.prova_aberta) {
          alvo.innerHTML = cartaoProvaAberta(E.painel) + '<p class="al-fino">Só dá para montar outra prova depois de enviar esta (ou de o prazo dela terminar).</p>';
          ligarProvaAberta(alvo);
          return;
        }
        montarProva(alvo);
      });
    }
    function montarProva(alvo) {
      var p = E.painel;
      alvo.innerHTML = '<div class="jr-caixa"><h3>Montar a prova</h3>' +
        '<p class="al-sub">A prova é fixada no início: questões, ordem, regra e prazo. O relógio é o do servidor — recarregar a página ou trocar de aparelho não reinicia o tempo, e a aba Prova mostra "continuar" enquanto ela estiver aberta.</p>' +
        '<div class="es-form"><label class="es-campo">Tipo<select id="es-pv-modo"><option value="treino">Treino cronometrado</option><option value="simulado">Simulado (metade de questões reservadas, que não saem no Praticar; metade do banco)</option></select></label>' +
        '<label class="es-campo">Questões<input id="es-pv-n" type="number" min="1" max="200" value="10"></label>' +
        '<label class="es-campo">Duração em minutos<input id="es-pv-dur" type="number" min="0" max="600" placeholder="automática"></label>' +
        '<label class="es-campo">Matéria (disciplina e ponto do edital)<select id="es-pv-comp"><option value="">Todas as matérias</option>' + opcoesComp('') + '</select></label></div>' +
        '<div class="es-form es-eixos" id="es-pv-eixos"></div><p class="al-fino" id="es-pv-eixos-nota"></p>' +
        '<p class="al-fino"><b>Regra de nota deste percurso:</b> ' + esc(regraTxt(p.regra_pontuacao)) + '</p>' +
        '<p class="al-fino" id="es-pv-formato"></p>' +
        '<div class="es-linha"><button class="al-bt" id="es-pv-ir">Começar</button></div><div id="es-pv-msg"></div></div>';
      // SIMULADO NO FORMATO DO EDITAL: os blocos da regra na proporção do edital (o servidor reparte e sorteia por
      // bloco). O veredito "atingiu / não atingiu" só sai de simulado nesse formato; treino e prova curta dão nota.
      var fmt = null, nTocado = false;
      function dizerFormato() {
        var cx = el('es-pv-formato');
        if (!cx) return;
        var sim = el('es-pv-modo').value === 'simulado', comMateria = !!el('es-pv-comp').value, n = Number(el('es-pv-n').value) || 10;
        if (!fmt) { cx.innerHTML = ''; return; }
        if (!sim) { cx.innerHTML = 'Treino é prática com relógio: no fim você vê acertos e nota — <b>sem veredito</b> de "atingiu o critério", que é do simulado no formato do edital.'; return; }
        if (comMateria) { cx.innerHTML = 'Com matéria escolhida o simulado é um recorte: sai a nota, <b>sem veredito</b> (prova fora do formato do edital).'; return; }
        var total = fmt.questoes || n;
        cx.innerHTML = 'Simulado <b>no formato do edital</b>: as questões são repartidas pelos blocos ' + esc(fmt.blocos.join(', ')) + ' na proporção do edital' +
          (fmt.exemplo ? ' (' + fmt.exemplo.map(function (x) { return x.questoes + ' no ' + esc(x.bloco); }).join(', ') + ' em ' + (fmt.questoes || 100) + ')' : '') + '. ' +
          (n < total && fmt.questoes ? 'Com ' + n + ' questões a prova fica menor que a do edital: sai a nota, sem veredito. ' : 'Prova curta demais para os mínimos do edital sai com a nota, sem veredito. ') +
          '<button class="es-link" id="es-pv-completo">Usar ' + (fmt.questoes || 100) + ' questões (simulado completo)</button>';
        if (el('es-pv-completo')) el('es-pv-completo').onclick = function () { el('es-pv-n').value = fmt.questoes || 100; nTocado = true; dizerFormato(); };
      }
      el('es-pv-n').oninput = function () { nTocado = true; dizerFormato(); };
      el('es-pv-comp').onchange = dizerFormato;
      el('es-pv-modo').onchange = function () {
        // escolher "Simulado" já propõe a prova inteira do edital (se o aluno não digitou outro número)
        if (fmt && !nTocado) el('es-pv-n').value = el('es-pv-modo').value === 'simulado' && !el('es-pv-comp').value ? (fmt.questoes || 100) : 10;
        dizerFormato();
      };
      comBanco(function (b) {
        if (!el('es-pv-eixos')) return;
        fmt = b.formato || null; dizerFormato();
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
          .then(function (t) { executar(alvo, t); if (window.innerWidth <= LARGURA_CELULAR) irAoConteudo(false); }) // no celular, "Começar" leva à primeira questão
          .catch(function (e) {
            // faltou questão (no total ou num BLOCO do formato do edital): o servidor diz quantas há; a escolha de reduzir é do aluno
            el('es-pv-msg').innerHTML = '<p class="es-aviso">' + esc(e.message) + '</p>' +
              (/eleg[ií]vel/.test(e.message) ? '<button class="al-bt fan" id="es-pv-menos">Fazer com as questões que existem</button>' +
                (/formato do edital/.test(e.message) ? '<p class="al-fino">Com menos questões num bloco a prova sai do formato do edital: você verá a nota, sem veredito.</p>' : '') : '');
            if (el('es-pv-menos')) el('es-pv-menos').onclick = function () { iniciar(true); };
          });
      }
      el('es-pv-ir').onclick = function () { iniciar(false); };
    }
    function executar(alvo, t) {
      if (t.estado !== 'em_andamento') return resultado(alvo, t);
      var aval = ehAvaliacao(t); // diagnóstico e teste final: mesma tela, sem relógio
      var desvio = Date.parse(t.agora) - Date.now(), prazo = Date.parse(t.prazo_em), resp = t.respostas || {}, marcadas = {}, fila = null, salvando = false;
      // retoma NA QUESTÃO em que o aluno estava (a posição mora no servidor, com as respostas) — não na primeira
      var i = Math.min(Math.max(0, Number(t.posicao) || 0), Math.max(0, t.questoes.length - 1)), posMudou = false, posTimer = null;
      // RESPOSTA DE PROVA NÃO SE PERDE (segunda revisão, 11/10/2026, R1). O salvamento usa `gravar` — a resposta do
      // servidor volta mesmo com o aluno já em outra aba do Estude, e é ela que manda o que ficou na fila. Antes a
      // resposta era descartada na troca de tela e a questão marcada durante um salvamento em voo nunca era enviada.
      // `nestaTela()` separa o que é GRAVAR (sempre) do que é PINTAR (só se a prova ainda está na tela).
      var vezDaProva = VEZ, tentativasFora = 0, encerrada = false;
      var base0 = base(); // o endereço do percurso DESTA prova (o aluno pode trocar de percurso com a fila ainda saindo)
      function nestaTela() { return vezDaProva === VEZ && !!el('es-pv-q'); }
      function devolverAFila(envio) { Object.keys(envio).forEach(function (k) { if (!fila || !(k in fila)) { fila = fila || {}; fila[k] = envio[k]; } }); }
      function soltarProva() { encerrada = true; PENDENTES = PENDENTES.filter(function (f) { return f !== despejarProva; }); }
      // fechar a aba, F5 ou esconder a página com resposta ainda na fila: sai na hora, com `keepalive`
      function despejarProva() {
        if (encerrada) return soltarProva();
        if (!fila && !posMudou) { if (!nestaTela() && !salvando) soltarProva(); return; }
        var envio = fila || {}; fila = null; posMudou = false; clearTimeout(posTimer);
        gravarNaSaida(base0 + '/tentativas/' + t.id + '/respostas', { respostas: envio, posicao: i })
          .then(function (r) { if (r && r.salvo === false) soltarProva(); })
          .catch(function () { devolverAFila(envio); if (!encerrada) setTimeout(salvar, 4000); });
      }
      despejarProva.aoTrocar = function () { clearTimeout(posTimer); salvar(); if (!fila && !posMudou && !salvando) soltarProva(); };
      PENDENTES.push(despejarProva);
      alvo.innerHTML = '<div class="es-prova"><div class="es-pv-topo">' + (aval ? '<div><b>' + TIPO_AVAL[t.modo] + '</b><span class="al-fino"> · sem relógio: responda no seu ritmo, pare quando quiser e continue depois' + (t.retomada ? ' · retomado de onde você parou' : '') + '</span></div>'
          : '<div><b id="es-pv-rel">--:--</b><span class="al-fino"> restantes · ' + (t.modo === 'simulado' ? 'simulado' : 'treino') + (t.retomada ? ' · retomada de onde você parou' : '') + '</span></div>') +
        '<span class="es-salvo" id="es-pv-salvo" role="status">' + (t.salvo_em ? 'Respostas salvas' : 'Nada respondido ainda') + '</span></div>' +
        (!aval && t.sem_veredito ? '<p class="al-fino es-pv-semv">Prova fora do formato do edital (' + esc((t.sem_veredito_motivos || []).join('; ')) + '): no fim você vê acertos e nota, sem veredito.</p>' : '') +
        '<div class="es-pv-nav" id="es-pv-nav"></div><div class="jr-caixa" id="es-pv-q"></div>' +
        '<div class="es-linha"><button class="al-bt fan" id="es-pv-ant">← Anterior</button><button class="al-bt fan" id="es-pv-prox">Próxima →</button><button class="al-bt fan" id="es-pv-marc">Marcar para voltar</button>' +
        (aval ? '<button class="al-bt fan" id="es-pv-sair">Salvar e continuar depois</button>' : '') + '<button class="al-bt ok" id="es-pv-env">' + (aval ? 'Concluir e ver o resultado' : 'Enviar a prova') + '</button></div><div id="es-pv-conf"></div></div>';
      function salvar() {
        if (encerrada || salvando || (!fila && !posMudou)) return;
        var envio = fila || {}, soPosicao = !fila; fila = null; posMudou = false; salvando = true;
        if (!soPosicao && nestaTela() && el('es-pv-salvo')) el('es-pv-salvo').textContent = 'Salvando…';
        E.painelVelho = true; // o cartão "continuar" do painel conta as respondidas: o painel em memória fica por conferir
        gravar('PUT', base0 + '/tentativas/' + t.id + '/respostas', { respostas: envio, posicao: i }).then(function (r) {
          salvando = false; tentativasFora = 0;
          // a prova fechou no servidor (prazo vencido ou já enviada): nada mais a gravar; só repinta quem ainda está nela
          if (!r.salvo) { var aqui = nestaTela(); soltarProva(); if (aqui) { pararRelogio(); executar(alvo, r); } return; }
          if (nestaTela() && el('es-pv-salvo')) { el('es-pv-salvo').textContent = 'Salvo · ' + r.respondidas + ' de ' + r.total + ' respondidas'; el('es-pv-salvo').className = 'es-salvo'; }
          if (fila || posMudou) salvar(); else if (!nestaTela()) soltarProva();
        }).catch(function (e) {
          // o aluno precisa saber que NÃO salvou: a resposta volta para a fila e tenta de novo
          salvando = false;
          devolverAFila(envio);
          if (nestaTela()) {
            if (el('es-pv-salvo')) { el('es-pv-salvo').textContent = 'Não salvou — sem conexão. Tentando de novo…'; el('es-pv-salvo').className = 'es-salvo ruim'; }
          } else if (++tentativasFora >= TENTATIVAS_FORA_DA_PROVA) {
            // já fora da prova e o envio não passa: avisa e para de insistir (o que já foi salvo continua no servidor)
            soltarProva(); avisoDeGravacao(e); return;
          }
          setTimeout(salvar, 4000);
        });
      }
      // mudou de questão sem responder: a posição segue para o servidor um instante depois (junto da próxima resposta, se houver)
      function mudouDeQuestao() { posMudou = true; clearTimeout(posTimer); posTimer = setTimeout(salvar, 1200); }
      function nav() {
        el('es-pv-nav').innerHTML = t.questoes.map(function (q, k) {
          return '<button data-k="' + k + '" class="' + (k === i ? 'on ' : '') + (resp[q.id] ? 'feita ' : '') + (marcadas[q.id] ? 'marc' : '') + '" aria-label="Questão ' + (k + 1) + (resp[q.id] ? ', respondida' : ', sem resposta') + '">' + (k + 1) + '</button>';
        }).join('');
        cada(el('es-pv-nav'), 'button', function (b) { b.onclick = function () { i = Number(b.getAttribute('data-k')); mudouDeQuestao(); pintar(); }; });
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
        var espera = function () { if (salvando || fila) return setTimeout(espera, 300); api('POST', base() + '/tentativas/' + t.id + '/enviar').then(function (r) { soltarProva(); resultado(alvo, r); }).catch(function (e) { falha(el('es-pv-conf'), e); }); };
        if (fila) salvar();
        espera();
      }
      el('es-pv-ant').onclick = function () { i--; mudouDeQuestao(); pintar(); };
      el('es-pv-prox').onclick = function () { i++; mudouDeQuestao(); pintar(); };
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
          encerrarNoPrazo();
        }
      }
      // O PRAZO ZEROU. Quem fecha a prova é o servidor — alguns segundos depois do prazo (a tolerância dele), para a
      // resposta marcada no último instante ainda chegar. Aqui: nada mais se marca, o que está na fila sai, e a tela
      // espera o servidor dizer que fechou (em vez de pedir a prova de novo a cada meio segundo).
      function encerrarNoPrazo() {
        cada(alvo, '.es-prova input, .es-prova button', function (x) { x.disabled = true; });
        if (el('es-pv-salvo')) el('es-pv-salvo').textContent = 'Tempo esgotado — fechando a prova…';
        if (fila) salvar();
        var n = 0;
        (function conferir() {
          if (!nestaTela()) return;
          if (salvando || fila) return setTimeout(conferir, 300);
          api('GET', base() + '/tentativas/' + t.id).then(function (r) {
            if (r.estado === 'em_andamento' && ++n < 10) return setTimeout(conferir, 1500);
            soltarProva(); executar(alvo, r);
          }).catch(function () { if (++n < 10) setTimeout(conferir, 1500); });
        })();
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
      var r = t.resultado, k = 0;
      var linha = function (a, b) { return '<tr><td>' + a + '</td><td class="n">' + b + '</td></tr>'; };
      // O VEREDITO vem do servidor (`r.veredito`): "atingiu / não atingiu" só para simulado no formato da regra do
      // percurso. Treino e prova curta mostram acertos e nota, com a frase "prova fora do formato do edital: sem veredito".
      var veredito = r.veredito === 'atingiu' ? '<p><b>Atingiu o critério cadastrado.</b></p>'
        : r.veredito === 'nao_atingiu' ? '<p><b>Não atingiu o critério cadastrado.</b></p>'
        : r.veredito === 'fora_do_formato' ? '<p class="es-aviso"><b>Prova fora do formato do edital: sem veredito.</b> ' + esc(maiuscula((r.veredito_motivos || []).join('; '))) + '. Aqui valem os acertos e a nota; o "atingiu / não atingiu o critério" só sai de um simulado no formato do edital.</p>'
        : r.veredito ? '<p class="al-fino">Este percurso não tem nota de corte cadastrada — por isso não há "aprovado" ou "reprovado" aqui.</p>'
        // (resultado de antes desta regra, sem o campo: mantém a leitura antiga)
        : r.aprovado === null ? '<p class="al-fino">Este percurso não tem nota de corte cadastrada — por isso não há "aprovado" ou "reprovado" aqui.</p>' : '<p><b>' + (r.aprovado ? 'Atingiu o critério cadastrado.' : 'Não atingiu o critério cadastrado.') + '</b></p>';
      var acertos = r.certas + ' de ' + (r.total || (r.certas + r.erradas + r.em_branco + (r.abstencoes || 0) + (r.anuladas || 0))) + (r.certas === 1 ? ' acerto' : ' acertos');
      alvo.innerHTML = '<div class="jr-caixa"><h3>Resultado' + (r.expirada ? ' — o prazo terminou' : '') + '</h3>' +
        (r.expirada ? '<p class="es-aviso">O tempo acabou antes do envio. Valeram as respostas que já estavam salvas no servidor.</p>' : '') +
        // números sempre com vírgula decimal (antes: "0.3 de 1 · 30%")
        '<div class="es-nota"><b>' + num(r.nota_liquida) + '</b><span> de ' + num(r.maximo) + ' · ' + num(r.pct_liquido) + ' % · ' + acertos + '</span></div>' +
        '<table class="es-tab">' + linha('Certas', r.certas) + linha('Erradas', r.erradas) + linha('Em branco', r.em_branco) + (r.abstencoes ? linha('Marcadas como não respondidas', r.abstencoes) : '') +
        (r.anuladas ? linha('Anuladas', r.anuladas) : '') + linha('Pontos brutos', num(r.nota_bruta)) + (r.descontados ? linha('Desconto: ' + r.erros_contados + ' erro(s) pela regra' + (r.erros_contados > r.erradas ? ' (erradas + em branco)' : ''), '− ' + num(r.descontados)) : '') + linha('<b>Nota líquida</b>', '<b>' + num(r.nota_liquida) + '</b>') + '</table>' +
        ((r.por_bloco || []).length > 1 ? '<table class="es-tab es-jr-tab"><tr><th>Bloco</th><th class="n">Acertos</th><th class="n">Pontos</th></tr>' + r.por_bloco.map(function (b) {
          return '<tr><td>' + (b.bloco ? esc(b.bloco) : 'Sem bloco') + '</td><td class="n">' + b.certas + '</td><td class="n">' + num(b.pontos_brutos) + ' de ' + num(b.maximo) + '</td></tr>';
        }).join('') + '</table>' : '') +
        '<p class="al-fino"><b>Regra aplicada:</b> ' + esc(regraTxt(r.regra)) + '</p>' + veredito +
        '<p class="al-fino">Um resultado em poucas questões mostra como você foi nestas questões, não o domínio do programa inteiro.</p>' +
        '<div class="es-linha"><button class="al-bt" id="es-rs-hj">Ver a próxima tarefa</button><button class="al-bt fan" id="es-rs-nova">Outra prova</button></div></div>' +
        // CORREÇÃO COMENTADA — a prova COMO O ALUNO A VIU: as alternativas na ordem congelada da tentativa, a letra pela
        // posição (a mesma da tela da prova), o texto de cada uma e o enunciado. Nunca o id cru da alternativa: com as
        // alternativas embaralhadas, o "D" do id era outra letra na tela, e o aluno conferia o gabarito na alternativa errada.
        '<div class="jr-caixa"><h3>Correção comentada</h3><p class="al-fino">As alternativas estão na mesma ordem e com as mesmas letras da sua prova.</p>' + r.itens.map(function (it) {
          var rot = { certa: ['Certa', 'ok'], errada: ['Errada', 'nao'], em_branco: ['Em branco', 'neutro'], abstencao: ['Não respondida (marcada)', 'neutro'], anulada: ['Anulada', 'neutro'] }[it.situacao];
          k++;
          var resumo = it.gabarito_letra ? ' · gabarito ' + esc(it.gabarito_letra) + (it.resposta_letra ? ' · você marcou ' + esc(it.resposta_letra) : '') : '';
          return '<details class="es-rev ' + rot[1] + '"><summary>Questão ' + k + ' — ' + rot[0] + resumo + '</summary>' +
            (it.apoio ? '<div class="es-apoio">' + texto(it.apoio) + '</div>' : '') + (it.enunciado ? '<div class="es-enun">' + texto(it.enunciado) + '</div>' : '') +
            it.alternativas.map(function (a, n) {
              // resultado de antes desta regra não traz `letra`: a posição na lista (que já é a ordem da prova) dá a letra
              var letra = a.letra || String.fromCharCode(65 + n), marcada = a.marcada != null ? a.marcada : it.resposta === a.id;
              return '<p class="es-rev-alt' + (a.correta ? ' certa' : (marcada ? ' errada' : '')) + '"><b>' + esc(letra) + ')' + (a.correta ? ' · gabarito' : '') + (marcada ? ' · sua resposta' : '') + '</b> ' + esc(a.texto || '') +
                (a.explicacao ? '<span class="es-expl">' + esc(a.explicacao) + '</span>' : '') + '</p>';
            }).join('') + (it.comentario ? '<p>' + esc(it.comentario) + '</p>' : '') + notaDeVigencia(it.vigencia) + '</details>';
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
        // critérios que ficaram com nível e sem trecho da resposta: dito no alto, antes da lista (a nota os inclui)
        var seg = x.segunda_leitura || null, semTrecho = (x.criterios || []).filter(function (k) { return k.nivel > 0 && !k.trecho; }).length;
        if (semTrecho) h += '<div class="es-aviso es-eo-sem-citacao"><b>' + (semTrecho > 1 ? semTrecho + ' critérios ficaram' : '1 critério ficou') + ' sem trecho localizado.</b> ' +
          'Cada nível deve vir com a frase da sua resposta que o sustenta. ' + (semTrecho > 1 ? 'Nestes critérios' : 'Neste critério') + ' a frase não veio, ou não estava na sua resposta' + (seg && seg.feita ? ', mesmo depois de o sistema pedir de novo' : '') +
          '. A nota acima conta ' + (semTrecho > 1 ? 'esses níveis' : 'esse nível') + ' como ' + (semTrecho > 1 ? 'vieram' : 'veio') + '; se discordar, use “Discordo da correção”.' + (seg && seg.feita ? ' O novo pedido ao corretor não foi cobrado de você.' : '') + '</div>';
        h += (x.criterios || []).map(function (k) {
          return '<div class="es-eo-crit n' + k.nivel + '"><div class="es-eo-crit-cab"><b>' + esc(k.criterio) + '</b><span class="al-fino">peso ' + k.peso + '</span><span class="es-eo-nivel">nível ' + k.nivel + ' de 3</span></div>' +
            // nível acima de zero SEM trecho conferido (pedidos.js › CITAÇÃO POR CRITÉRIO): o servidor pediu o trecho de novo
            // e ele não veio (ou não estava na resposta). O nível fica, e a tela diz que ficou sem lastro
            (k.trecho ? '<blockquote>“' + esc(k.trecho) + '”</blockquote>' : (k.nivel > 0 ? '<p class="al-fino es-eo-sem-trecho"><b>Sem trecho localizado.</b> A correção deu este nível, mas não apontou, na sua resposta, a frase em que se apoiou' + (seg && seg.feita ? ' — nem quando o sistema pediu de novo' : '') + '. O nível foi mantido (ele não foi rebaixado nem revisto), mas está sem lastro: leia este critério com mais desconfiança.</p>' : '<p class="al-fino">A resposta não tratou deste critério.</p>')) +
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
        h += '<div class="jr-caixa es-ip-rodape"><div class="es-linha"><button class="al-bt" id="es-ip-aplicar">Adicionar ao percurso</button><span class="al-fino" id="es-ip-amsg">Adicionar não custa nada. As que ficarem de fora continuam aqui — dá para adicionar depois.</span></div></div>';
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
          bloco('item(ns) que mudam de lugar (o código e o texto ficam)', d.movidos || [], d.movidos_total || 0, function (x) { return '<li><b>' + esc(x.codigo) + '</b> ' + esc(x.texto) + ' — passa a ficar ' + (x.para ? 'dentro de <b>' + esc(x.para) + '</b>' : 'como disciplina') + '</li>'; }) +
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
              ((sm.disciplinas_absorvidas || []).length ? '<p class="al-fino">Disciplina que passa a ser <b>subárea</b> de outra (ela e os tópicos conservam o código; as questões e o seu histórico continuam ligados): ' + sm.disciplinas_absorvidas.map(function (d) { return '<b>' + esc(d.de) + '</b> ' + esc(d.titulo) + ' → dentro de <b>' + esc(d.para) + '</b> ' + esc(d.disciplina); }).join('; ') + '.</p>' : '') +
              (sm.bloqueio ? '<p class="es-aviso" role="alert"><b>Não dá para aplicar assim.</b> ' + esc(sm.bloqueio) + '</p>' : '') +
              diffHtml(v.diff) +
              '<label class="es-ip-marca es-ed-subst"><input type="checkbox" id="es-ed-subst"' + (SUBST ? ' checked' : '') + '> Substituir o programa atual pelo deste pedido (use quando o edital foi relido inteiro)</label>' +
              '<div class="es-linha"><button class="al-bt" id="es-ed-ret"' + (v.diff.mudou && !sm.bloqueio ? '' : ' disabled') + '>Confirmar a retificação</button><button class="al-bt fan" id="es-ed-ret-nao">Voltar à revisão</button></div></div>';
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

    // ================= LEGISLAÇÃO E JURISPRUDÊNCIA (ADR-0014; servidor em estudo/lei-juris.js) =================
    // Na aula: duas abas ao lado do texto — a lei seca e os verbetes que o item do edital cobra, sem comentário.
    // No curso: dois acervos — a legislação inteira (diploma por diploma, navegável) e a jurisprudência (filtros,
    // busca, páginas) —, a busca única nos dois e a marcação de leitura do aluno (lido; grifo amarelo ou verde).
    // "Quero voltar para onde estava": a aula lembra a aba aberta (ABA_AULA) e o acervo aberto de dentro de uma
    // aula lembra a aula e a rolagem (E.antesDoAcervo) — o "← Voltar à aula" e o Voltar da aula devolvem lá.
    var ABA_AULA = {};
    var LJ = { jf: { pagina: 1 }, busca: '', filtroDip: '' };
    function temLeiJuris(qual) {
      var x = E.painel && E.painel.lei_juris;
      if (!x) return false;
      return qual === 'lei' ? !!x.legislacao : qual === 'juris' ? !!x.jurisprudencia : !!(x.legislacao || x.jurisprudencia);
    }
    var SIT_DISP = { revogado: 'Revogado', vetado: 'Vetado', alterado_apos_edital: 'Alterado depois do edital', incluido_apos_edital: 'Incluído depois do edital', revogado_apos_edital: 'Revogado depois do edital',
      inconstitucional: 'Declarado inconstitucional (STF)', inconstitucional_apos_edital: 'Declarado inconstitucional (STF) depois do edital' };
    // a TÉCNICA da decisão do STF sobre o dispositivo (ADR-0014): só a declaração total muda a situação; as outras
    // deixam o texto vigente e a leitura correta depende da decisão
    var TEC_STF = { inconstitucional: 'Declarado inconstitucional', inconstitucional_parcial: 'Declarado inconstitucional em parte', sem_reducao: 'Inconstitucionalidade sem redução de texto',
      interpretacao_conforme: 'Interpretação conforme a Constituição', nao_recepcao: 'Não recepcionado pela Constituição de 1988', execucao_suspensa: 'Execução suspensa pelo Senado Federal' };
    var SIT_JURIS = { vigente: 'Vigente', cancelado: 'Cancelado', convertido: 'Convertido', alterado: 'Alterado', superado: 'Superado', suspenso: 'Suspenso', revogado: 'Revogado',
      julgado: 'Julgado', merito_julgado: 'Mérito julgado', pendente: 'Pendente de julgamento', prejudicado: 'Prejudicado', encerrado: 'Encerrado', extinto: 'Extinto', sem_tese: 'Sem tese',
      incluido_apos_edital: 'Editado depois do edital', alterado_apos_edital: 'Alterado depois do edital', cancelado_apos_edital: 'Cancelado depois do edital', sem_informacao: 'Sem informação', inexistente: 'Não existia' };
    var SIT_JURIS_COR = { vigente: 'verde', merito_julgado: 'verde', julgado: 'verde', cancelado: 'verm', superado: 'verm', revogado: 'verm', cancelado_apos_edital: 'verm', extinto: 'verm', prejudicado: 'verm',
      convertido: 'ambar', alterado: 'ambar', alterado_apos_edital: 'ambar', suspenso: 'ambar', incluido_apos_edital: 'ambar', pendente: 'azul' };
    var TIPO_JURIS = { sumula: 'Súmula', sumula_vinculante: 'Súmula Vinculante', oj: 'Orientação Jurisprudencial', precedente_normativo: 'Precedente Normativo', tema_rg: 'Tema de Repercussão Geral',
      tema_repetitivo: 'Tema Repetitivo', tema_irr: 'Tema de Recurso Repetitivo (IRR)', tema_iac: 'Tema de IAC', tema_irdr: 'Tema de IRDR', irdr: 'IRDR', iac: 'IAC', iuj: 'Uniformização de Jurisprudência (IUJ)',
      arginc: 'Arguição de Inconstitucionalidade', acordao: 'Acórdão' };
    function tipoJuris(t) { return TIPO_JURIS[t] || t; }
    // "em 16/10/2026", "em 10/2026" ou "em 1966": a data da norma que alterou vem com o que a fonte diz
    function dataNorma(d) {
      d = String(d || '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'em ' + dataBR(d);
      if (/^\d{4}-\d{2}$/.test(d)) return 'em ' + d.slice(5, 7) + '/' + d.slice(0, 4);
      return /^\d{4}$/.test(d) ? 'em ' + d : '';
    }
    function pelaNorma(n) { n = String(n || ''); return n ? (/^(decreto|ato|provimento|regimento|tratado|ajuste)/i.test(n) ? 'pelo ' : 'pela ') + n : ''; }
    // A SITUAÇÃO, sempre explícita: "Alterado em 16/10/2026 pela Emenda Constitucional nº 141 — na data do edital: …"
    // (a data e o NOME dela vêm da API, por percurso — ADR-0015: "data do edital" no curso de Juiz, "data de corte da
    // objetiva" no do MPT; sem nome, vale "data do edital")
    function situacaoDoDispositivo(x, dataEdital, rotulo) {
      var sit = x.situacao, ap = x.alterado_por || null;
      if (!sit || sit === 'vigente') return '';
      if (sit === 'revogado' || sit === 'vetado') return '';
      // o declarado inconstitucional tem o aviso na decisão (decisaoDoDispositivo); sem ela, o aviso seco
      if (/^inconstitucional/.test(sit)) return x.decisao_stf && x.decisao_stf.length ? '' : '<p class="es-lj-sit rev" role="note"><b>' + esc(SIT_DISP[sit]) + '</b></p>';
      var quem = [ap ? dataNorma(ap.data) : '', ap ? pelaNorma(ap.norma) : ''].filter(Boolean).join(' ');
      var naRef = rotulo ? 'na ' + esc(rotulo) : 'na data do edital', depois = rotulo ? ' depois da ' + esc(rotulo) : ' depois do edital';
      var ed = x.texto_na_data_do_edital, naData = '';
      if (ed) naData = ' — <span>' + naRef + (dataEdital ? ' (' + dataBR(dataEdital) + ')' : '') + ':</span> <q class="es-lj-ed">' + esc(ed) + '</q>';
      else if (x.edital_indisponivel || x.texto_na_data_do_edital_indisponivel) naData = ' — <span>a redação ' + naRef + ' não está disponível na fonte.</span>';
      if (sit === 'alterado_apos_edital') return '<p class="es-lj-sit alt" role="note"><b>Alterado' + (quem ? ' ' + esc(quem) : depois) + '</b>' + (naData || ' — a redação acima é posterior ' + (rotulo ? 'à ' + esc(rotulo) : 'ao edital') + '.') + '</p>';
      if (sit === 'incluido_apos_edital') return '<p class="es-lj-sit alt" role="note"><b>Incluído' + (quem ? ' ' + esc(quem) : depois) + '</b> — não existia ' + naRef + '.</p>';
      if (sit === 'revogado_apos_edital') return '<p class="es-lj-sit rev" role="note"><b>Revogado' + (quem ? ' ' + esc(quem) : depois) + '</b>' + (naData || ' — vigorava ' + naRef + '.') + '</p>';
      return '';
    }
    function tagDoDispositivo(sit) { return sit && sit !== 'vigente' ? ' <span class="es-lj-tag ' + (/revogado|vetado|inconstitucional/.test(sit) ? 'rev' : 'alt') + '">' + esc(SIT_DISP[sit] || sit) + '</span>' : ''; }
    // A DECISÃO DO STF sobre o dispositivo ou a parte (ADR-0014): técnica, data (e se é posterior à data de referência
    // do percurso), alcance, efeito, o trecho da tese, a modulação, a redação que volta a valer (repristinação) e o
    // botão do verbete. Vermelho quando a situação é a declaração total; âmbar quando o texto continua valendo.
    function decisaoDoDispositivo(x, dataRef, rotulo) {
      var ds = x.decisao_stf || [];
      if (!ds.length) return '';
      var total = /^inconstitucional/.test(x.situacao || '');
      return ds.map(function (d) {
        var depois = dataRef && d.data && d.data > dataRef ? ' — <span>posterior à ' + (rotulo ? esc(rotulo) : 'data do edital') + ' (' + dataBR(dataRef) + '): na data, o texto vigorava.</span>' : '';
        return '<div class="es-lj-sit ' + (total ? 'rev' : 'alt') + ' es-lj-stf" role="note"><p><b>' + esc(TEC_STF[d.tecnica] || d.tecnica) + ' (STF)</b>' + (d.data ? ' em ' + dataBR(d.data) : '') + depois +
          (d.alcance ? ' <span class="al-fino">Alcance: ' + esc(d.alcance) + '.</span>' : '') + (d.efeito ? ' <span>Efeito: ' + esc(d.efeito) + '.</span>' : '') + '</p>' +
          (d.trecho ? '<p><q class="es-lj-ed">' + esc(d.trecho) + '</q></p>' : '') +
          (d.modulacao ? '<p><span>Modulação: ' + esc(d.modulacao) + '</span></p>' : '') +
          (d.texto_repristinado ? '<p><span>Redação que volta a valer:</span> <q class="es-lj-ed">' + esc(d.texto_repristinado) + '</q></p>' : '') +
          (d.verbete ? '<p><button type="button" class="es-link" data-lj-verb="' + esc(d.verbete) + '">Ver a decisão no acervo de jurisprudência →</button></p>' : d.norma ? '<p class="al-fino">' + esc(d.norma) + '</p>' : '') + '</div>';
      }).join('');
    }
    function botoesDeLeitura(m) {
      m = m || {};
      return '<span class="es-lj-marca"><button type="button" class="es-lj-bt' + (m.lido ? ' on' : '') + '" data-lj-lido aria-pressed="' + (m.lido ? 'true' : 'false') + '" title="Marcar como lido">✓ Lido</button>' +
        '<button type="button" class="es-lj-bt cor amarelo' + (m.cor === 'amarelo' ? ' on' : '') + '" data-lj-cor="amarelo" aria-pressed="' + (m.cor === 'amarelo' ? 'true' : 'false') + '" title="Grifar em amarelo" aria-label="Grifar em amarelo"></button>' +
        '<button type="button" class="es-lj-bt cor verde' + (m.cor === 'verde' ? ' on' : '') + '" data-lj-cor="verde" aria-pressed="' + (m.cor === 'verde' ? 'true' : 'false') + '" title="Grifar em verde" aria-label="Grifar em verde"></button></span>';
    }
    function linksDeAulas(aulas, titulos) {
      if (!aulas || !aulas.length) return '';
      return '<span class="es-lj-aulas"><span class="al-fino">Nas aulas:</span> ' + aulas.slice(0, 8).map(function (a) {
        return '<button type="button" class="es-link" data-lj-aula="' + esc(a) + '">📖 ' + esc((titulos && titulos[a]) || a) + '</button>';
      }).join(' ') + (aulas.length > 8 ? ' <span class="al-fino">e mais ' + (aulas.length - 8) + '</span>' : '') + '</span>';
    }
    // um DISPOSITIVO em texto seco: rótulo, caput, partes (as que o item cita, destacadas), a nota oficial e a situação
    function htmlDispositivo(dip, x, marcas, opc) {
      opc = opc || {};
      var ref = dip.id + '|' + x.id, m = (marcas || {})[ref] || {}, citadas = {};
      (x.citadas || []).forEach(function (p) { citadas[p] = 1; });
      // sem texto (ou só "."): revogado, vetado, declarado inconstitucional — ou a fonte não reproduz o texto. Nunca em branco.
      var vazio = function (o) { return /^[\s.]*$/.test(o.texto || ''); };
      var rotuloVazio = function (o) { return SIT_DISP[o.situacao] || 'texto não reproduzido na fonte oficial'; };
      var partes = (x.partes || []).map(function (p) {
        var nivel = Math.max(0, String(p.id).slice(String(x.id).length + 1).split('.').length - 1);
        return '<p class="es-lj-parte n' + Math.min(nivel, 3) + ' sit-' + esc(p.situacao) + (citadas[p.id] ? ' citada' : '') + '"><b>' + esc(p.rotulo || p.caminho) + '</b> ' +
          (vazio(p) ? '<i>(' + esc(rotuloVazio(p)) + ')</i>' : esc(p.texto) + tagDoDispositivo(/revogado|vetado|inconstitucional/.test(p.situacao) ? p.situacao : '')) +
          (p.nota ? ' <span class="es-lj-nota">' + esc(p.nota) + '</span>' : '') + '</p>' + situacaoDoDispositivo(p, dip.data_referencia_edital, dip.rotulo_data_referencia) +
          decisaoDoDispositivo(p, dip.data_referencia_edital, dip.rotulo_data_referencia);
      }).join('');
      var cls = 'es-lj-disp sit-' + esc(x.situacao) + (m.cor ? ' grifo-' + esc(m.cor) : '') + (m.lido ? ' lido' : '') + (opc.acervo && x.cobrado ? ' cobrado' : '');
      return '<article class="' + cls + '" id="lj-' + esc(dip.id) + '-' + esc(x.id) + '" data-lj-tipo="dispositivo" data-lj-ref="' + esc(ref) + '">' +
        (x.epigrafe ? '<p class="es-lj-epi">' + esc(x.epigrafe) + '</p>' : '') +
        '<p class="es-lj-caput"><b class="es-lj-rot">' + esc(x.rotulo) + '</b> ' + (vazio(x) ? (x.partes && x.partes.length && !SIT_DISP[x.situacao] ? '' : '<i>(' + esc(rotuloVazio(x)) + ')</i>') : esc(x.texto) + tagDoDispositivo(x.situacao)) +
        (x.nota ? ' <span class="es-lj-nota">' + esc(x.nota) + '</span>' : '') + '</p>' + situacaoDoDispositivo(x, dip.data_referencia_edital, dip.rotulo_data_referencia) +
        decisaoDoDispositivo(x, dip.data_referencia_edital, dip.rotulo_data_referencia) + partes +
        '<div class="es-lj-acoes">' + botoesDeLeitura(m) +
        (opc.acervo && x.cobrado ? '<span class="es-lj-cob" title="Itens do edital que cobram este dispositivo">Edital: ' + (x.itens || []).map(esc).join(', ') + '</span>' + linksDeAulas(x.aulas, opc.titulos) : '') +
        (opc.doItem ? '<button type="button" class="es-link" data-lj-dip="' + esc(dip.id + '~' + x.id) + '">Ver no diploma inteiro →</button>' : '') +
        '</div></article>';
    }
    // um VERBETE (súmula, OJ, tema, precedente…): o texto oficial, a tese, a situação com a data e a fonte
    function cabecalhoDoVerbete(v) {
      var num = String(v.numero || '');
      // "ADI 5766" já diz o tipo; "1" (súmula 1) não
      var nome = /^[A-Za-z]/.test(num) ? num : tipoJuris(v.tipo) + (num ? ' ' + num : '');
      return esc(v.tribunal) + ' · ' + esc(nome);
    }
    // o incidente PENDENTE, com os processos suspensos, não é "Suspenso" (auditoria AL, AL-03)
    function rotuloSituacao(sit, tipo) {
      if (sit === 'suspenso' && /^(irdr|iac|iuj|tema_)/.test(tipo || '')) return 'Pendente de julgamento (processos suspensos)';
      return SIT_JURIS[sit] || sit;
    }
    // A SITUAÇÃO DO VERBETE e a da DATA DO EDITAL (auditoria AL, AL-04/AL-09/AL-15): o selo de hoje ("Parcialmente
    // cancelada" quando só itens caíram), o selo da data do edital, a RESSALVA ao lado dele ("formalmente vigente, mas
    // sem eficácia desde 11/11/2017") e "não apurado" quando a situação na data do edital foi inferida, não lida na fonte.
    function situacaoDoVerbete(v) {
      var sit = v.situacao || '', ed = v.situacao_na_data_do_edital || '', parcial = !!v.cancelamento_parcial && sit === 'vigente';
      var nota = v.situacao_na_data_do_edital_nota || '', inferida = !!v.situacao_na_data_do_edital_inferida, ressalva = v.ressalva_na_data_do_edital || '';
      var naRef = v.rotulo_data_referencia ? 'Na ' + esc(v.rotulo_data_referencia) + ': ' : 'Na data do edital: ';
      var h = '<span class="es-selo ' + (parcial ? 'ambar' : (SIT_JURIS_COR[sit] || '')) + '">' + esc(parcial ? 'Parcialmente cancelada' : (rotuloSituacao(sit, v.tipo) || 'sem situação')) + '</span>';
      if (inferida && /N[ÃA]O APURAD/i.test(nota)) return h + ' <span class="es-selo es-lj-sed" title="' + esc(nota) + '">' + naRef + 'não apurado</span>';
      if (!ed || (ed === sit && !ressalva && !inferida && !v.texto_na_data_do_edital && !parcial)) return h;
      h += ' <span class="es-selo es-lj-sed">' + naRef + esc(rotuloSituacao(ed, v.tipo)) + '</span>';
      if (inferida) h += ' <span class="es-selo es-lj-sed" title="' + esc(nota) + '">não apurado na fonte (inferido)</span>';
      if (ressalva) h += ' <span class="es-lj-ressalva">— ' + esc(ressalva) + '</span>';
      return h;
    }
    // a REDAÇÃO (e o título, a tese) na data do edital, quando o verbete mudou depois dele — como nos dispositivos
    function redacaoDoEdital(v) {
      if (!v.texto_na_data_do_edital && !v.titulo_na_data_do_edital && !v.tese_na_data_do_edital) return '';
      // a data vem da API (a do percurso — ADR-0015); antes a data do curso de Juiz ficava fixa no texto
      return '<div class="es-lj-sit alt es-lj-ved" role="note"><b>' + (v.rotulo_data_referencia ? 'Na ' + esc(v.rotulo_data_referencia) : 'Na data do edital') +
        (v.data_referencia ? ' (' + dataBR(v.data_referencia) + ')' : '') + ' vigia outra redação:</b>' +
        (v.titulo_na_data_do_edital ? '<p class="es-lj-vt"><b>' + esc(v.titulo_na_data_do_edital) + '</b></p>' : '') +
        (v.texto_na_data_do_edital ? '<div class="es-lj-vtx">' + texto(v.texto_na_data_do_edital) + '</div>' : '') +
        (v.tese_na_data_do_edital ? '<div class="es-lj-tese"><span class="al-rotulo">Tese' + (v.tese_na_data_do_edital_data ? ' (' + dataBR(v.tese_na_data_do_edital_data) + ')' : '') + '</span>' + texto(v.tese_na_data_do_edital) + '</div>' : '') + '</div>';
    }
    // a nota da coleta sobre a data do edital, quando o detalhe oficial ainda não a diz
    function notaDoEdital(v) {
      var n = v.situacao_na_data_do_edital_nota || '';
      if (!n || String(v.situacao_detalhe || '').indexOf(n) >= 0) return '';
      return '<p class="es-lj-nota"><b>' + (v.rotulo_data_referencia ? 'Na ' + esc(v.rotulo_data_referencia) : 'Na data do edital') + ':</b> ' + esc(n) + '</p>';
    }
    function corpoDoVerbete(v, marcas, opc) {
      opc = opc || {};
      // (na lista da jurisprudência o título já está no resumo do item: `semTitulo`)
      return (v.titulo && v.titulo !== v.numero && !opc.semTitulo ? '<p class="es-lj-vt"><b>' + esc(v.titulo) + '</b></p>' : '') +
        (v.texto ? '<div class="es-lj-vtx">' + texto(v.texto) + '</div>' : '') +
        (v.tese ? '<div class="es-lj-tese"><span class="al-rotulo">Tese</span>' + texto(v.tese) + '</div>' : '') + redacaoDoEdital(v) +
        '<p class="es-lj-vsit">' + situacaoDoVerbete(v) + (v.situacao_detalhe ? ' <span class="es-lj-nota">' + esc(v.situacao_detalhe) + '</span>' : '') + '</p>' + notaDoEdital(v) +
        (v.orgao || v.julgamento || v.historico ? '<p class="es-lj-nota">' + [v.orgao, v.julgamento ? 'Julgamento: ' + v.julgamento : '', v.historico].filter(Boolean).map(esc).join(' · ') + '</p>' : '') +
        '<p class="es-lj-nota">' + (v.fonte_url ? '<a href="' + esc(v.fonte_url) + '" target="_blank" rel="noopener">Fonte oficial</a>' : 'Fonte oficial') + (v.consultado_em ? ' — consultada em ' + dataBR(v.consultado_em) : '') + '</p>' +
        '<div class="es-lj-acoes">' + botoesDeLeitura((marcas || {})[v.id]) +
        ((v.itens || []).length ? '<span class="es-lj-cob">Edital: ' + v.itens.map(esc).join(', ') + '</span>' : '') + linksDeAulas(v.aulas, opc.titulos) +
        (opc.doItem ? '<button type="button" class="es-link" data-lj-verb="' + esc(v.id) + '">Abrir no acervo →</button>' : '') + '</div>';
    }
    function htmlVerbete(v, marcas, opc) {
      var m = (marcas || {})[v.id] || {};
      return '<article class="es-lj-verb' + (m.cor ? ' grifo-' + esc(m.cor) : '') + (m.lido ? ' lido' : '') + ' sit-' + esc(v.situacao) + '" id="lj-v-' + esc(v.id) + '" data-lj-tipo="verbete" data-lj-ref="' + esc(v.id) + '">' +
        '<h5 class="es-lj-vcab">' + cabecalhoDoVerbete(v) + '</h5>' + corpoDoVerbete(v, marcas, opc) + '</article>';
    }
    // um ouvinte só por tela: marcar lido/grifo, abrir a aula, o diploma, o verbete
    function ligarLeiJuris(alvo, marcas) {
      alvo.onclick = function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
        if (!b || !alvo.contains(b)) return;
        if (b.hasAttribute('data-lj-aula')) { ir('unidade', b.getAttribute('data-lj-aula')); return; }
        if (b.hasAttribute('data-lj-dip')) { ir('lei', b.getAttribute('data-lj-dip')); return; }
        if (b.hasAttribute('data-lj-verb')) { ir('juris', b.getAttribute('data-lj-verb')); return; }
        if (!b.hasAttribute('data-lj-lido') && !b.hasAttribute('data-lj-cor')) return;
        var art = b.closest('[data-lj-ref]'); if (!art) return;
        var tipo = art.getAttribute('data-lj-tipo'), ref = art.getAttribute('data-lj-ref'), m = marcas[ref] || { lido: false, cor: '' };
        var corpo = { tipo: tipo, ref: ref };
        if (b.hasAttribute('data-lj-lido')) corpo.lido = !m.lido; else { var cor = b.getAttribute('data-lj-cor'); corpo.cor = m.cor === cor ? '' : cor; }
        b.disabled = true;
        api('PUT', base() + '/lei-juris/marcas', corpo).then(function (r) {
          b.disabled = false;
          marcas[ref] = { lido: r.marca.lido, cor: r.marca.cor };
          art.classList.toggle('lido', !!r.marca.lido);
          ['amarelo', 'verde'].forEach(function (c) { art.classList.toggle('grifo-' + c, r.marca.cor === c); });
          var cx = art.querySelector('.es-lj-marca');
          if (cx) cx.outerHTML = botoesDeLeitura(marcas[ref]);
        }).catch(function (e) { b.disabled = false; b.title = e.message; window.alert(e.message); });
      };
    }
    function itensDoTopo(r) {
      return (r.itens || []).length ? '<p class="es-ler-item">' + r.itens.map(function (x) { return '<b>' + esc(x.codigo) + '</b> ' + esc(x.texto); }).join(' · ') + '</p>' : '';
    }
    // ---- na AULA: as abas "Texto da aula", "Legislação" e "Jurisprudência" ----
    function abasDaAula() {
      if (!temLeiJuris()) return '';
      return '<div class="es-un-abas" role="tablist" aria-label="O que ler nesta aula"><button type="button" role="tab" data-ua="texto">📄 Texto da aula</button>' +
        (temLeiJuris('lei') ? '<button type="button" role="tab" data-ua="lei">⚖️ Legislação</button>' : '') +
        (temLeiJuris('juris') ? '<button type="button" role="tab" data-ua="juris">🏛️ Jurisprudência</button>' : '') + '</div>';
    }
    function abrirAbaDaAula(codigo, qual) {
      if (!el('es-un-p-texto')) return;
      if (qual !== 'lei' && qual !== 'juris') qual = 'texto';
      if (qual !== 'texto' && !temLeiJuris(qual)) qual = 'texto';
      ABA_AULA[codigo] = qual;
      ['texto', 'lei', 'juris'].forEach(function (k) { var p = el('es-un-p-' + k); if (p) p.hidden = k !== qual; });
      cada(document, '.es-un-abas [data-ua]', function (b) { var on = b.getAttribute('data-ua') === qual; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      var cx = el('es-un-p-' + qual);
      if (qual === 'texto' || !cx || cx.getAttribute('data-carregado') === codigo) return;
      cx.setAttribute('data-carregado', codigo);
      (qual === 'lei' ? leiDaAula : jurisDaAula)(cx, codigo);
    }
    // o diploma que o ITEM cita sem artigo ("Lei de Execuções Fiscais"): "O item cobra também: …" (auditoria AL, AL-14)
    function citadosDoItem(r) {
      var cs = (r.citados_no_edital || []).filter(function (d) { return !d.na_aba; });
      if (!cs.length) return '';
      return '<p class="es-lj-citados"><b>O item cobra também:</b> ' + cs.map(function (d) {
        return '<button type="button" class="es-link" data-lj-dip="' + esc(d.id) + '">' + esc(d.nome) + (d.norma && d.norma !== d.nome ? ' (' + esc(d.norma) + ')' : '') + ' — abrir no acervo</button>';
      }).join(' · ') + '</p>';
    }
    function leiDaAula(cx, codigo) {
      cx.innerHTML = '<p class="al-sub">Carregando a legislação desta aula…</p>';
      api('GET', base() + '/legislacao/vinculada?unidade=' + encodeURIComponent(codigo)).then(function (r) {
        if (!document.body.contains(cx)) return;
        if (!r.diplomas.length) {
          cx.innerHTML = '<div class="es-ler es-lj">' + itensDoTopo(r) + citadosDoItem(r) + '<p class="al-sub">Nenhum dispositivo de lei está ligado a este item do edital ainda. A legislação inteira está no acervo.</p>' +
            '<div class="es-linha"><button type="button" class="al-bt peq fan" data-lj-acervo="lei">⚖️ Abrir o acervo de legislação</button></div></div>';
        } else {
          cx.innerHTML = '<div class="es-ler es-lj"><p class="es-lj-intro">A lei seca que este item do edital cobra, no texto da fonte oficial, sem comentário. O que o item cita fica destacado; o que mudou depois do edital traz a redação da data do edital ao lado.</p>' + itensDoTopo(r) + citadosDoItem(r) +
            r.diplomas.map(function (d) {
              return '<section class="es-lj-dip"><h3>' + esc(d.nome) + '</h3><p class="es-ler-sub">' + esc(d.norma) + (d.fonte_url ? ' · <a href="' + esc(d.fonte_url) + '" target="_blank" rel="noopener">fonte oficial</a>' : '') + (d.consultado_em ? ' — consultada em ' + dataBR(d.consultado_em) : '') + '</p>' +
                d.dispositivos.map(function (x) { return htmlDispositivo(d, x, r.marcas, { doItem: true }); }).join('') + '</section>';
            }).join('') + '</div>';
        }
        ligarLeiJuris(cx, r.marcas || {});
        cada(cx, '[data-lj-acervo]', function (b) { b.onclick = function (ev) { ev.stopPropagation(); ir(b.getAttribute('data-lj-acervo')); }; });
      }).catch(function (e) { cx.removeAttribute('data-carregado'); falha(cx, e); });
    }
    function jurisDaAula(cx, codigo) {
      cx.innerHTML = '<p class="al-sub">Carregando a jurisprudência desta aula…</p>';
      api('GET', base() + '/jurisprudencia/vinculada?unidade=' + encodeURIComponent(codigo)).then(function (r) {
        if (!document.body.contains(cx)) return;
        if (!r.tribunais.length) {
          cx.innerHTML = '<div class="es-ler es-lj">' + itensDoTopo(r) + '<p class="al-sub">Nenhum verbete está ligado a este item do edital ainda. A jurisprudência inteira do curso está no acervo.</p>' +
            '<div class="es-linha"><button type="button" class="al-bt peq fan" data-lj-acervo="juris">🏛️ Abrir o acervo de jurisprudência</button></div></div>';
        } else {
          cx.innerHTML = '<div class="es-ler es-lj"><p class="es-lj-intro">Súmulas, orientações, precedentes, temas e julgados que este item do edital cobra, como o tribunal os publicou, com a situação de cada um.</p>' + itensDoTopo(r) +
            r.tribunais.map(function (t) {
              return '<section class="es-lj-dip"><h3>' + esc(t.tribunal) + '</h3>' + t.tipos.map(function (g) {
                return '<h4 class="es-lj-sec">' + esc(tipoJuris(g.tipo)) + '</h4>' + g.verbetes.map(function (v) { return htmlVerbete(v, r.marcas, { doItem: true }); }).join('');
              }).join('') + '</section>';
            }).join('') + '</div>';
        }
        ligarLeiJuris(cx, r.marcas || {});
        cada(cx, '[data-lj-acervo]', function (b) { b.onclick = function (ev) { ev.stopPropagation(); ir(b.getAttribute('data-lj-acervo')); }; });
      }).catch(function (e) { cx.removeAttribute('data-carregado'); falha(cx, e); });
    }
    // ---- os ACERVOS ----
    function voltarAAula() { return E.antesDoAcervo ? '<button type="button" class="al-bt peq fan" id="es-lj-volta-aula">← Voltar à aula</button>' : ''; }
    function ligarVoltarAAula() { if (el('es-lj-volta-aula')) el('es-lj-volta-aula').onclick = function () { voltarPara(E.antesDoAcervo); }; }
    function caixaDeBusca() {
      return '<form class="es-lj-busca" id="es-lj-bf" role="search"><input type="search" id="es-lj-bq" maxlength="200" placeholder="Buscar na legislação e na jurisprudência (ex.: aviso prévio proporcional)" aria-label="Buscar nos dois acervos" value="' + esc(LJ.busca) + '">' +
        '<button type="submit" class="al-bt peq">Buscar nos dois acervos</button></form><div id="es-lj-res"></div>';
    }
    function trechoAchado(t) { return esc(t || '').replace(/\u0002/g, '<mark>').replace(/\u0003/g, '</mark>'); }
    // por que o resultado está ali (auditoria AL, AL-08): o número pedido, ou o item do edital que trata do assunto
    function pelaBusca(x) {
      if (x.exato) return ' <span class="es-lj-pelo">o número pedido</span>';
      return x.pelo_item && x.pelo_item.length ? ' <span class="es-lj-pelo">cobrado no item ' + x.pelo_item.slice(0, 3).map(esc).join(', ') + (x.pelo_item.length > 3 ? '…' : '') + ' do edital</span>' : '';
    }
    function ligarBusca() {
      var f = el('es-lj-bf'); if (!f) return;
      var pg = 1;
      function buscar(mais) {
        var q = el('es-lj-bq').value.trim(), out = el('es-lj-res');
        LJ.busca = q;
        if (q.length < 2) { out.innerHTML = q ? '<p class="al-fino">Digite ao menos duas letras.</p>' : ''; return; }
        pg = mais ? pg + 1 : 1;
        if (!mais) out.innerHTML = '<p class="al-sub">Buscando…</p>';
        api('GET', base() + '/lei-juris/busca?q=' + encodeURIComponent(q) + '&pagina=' + pg).then(function (r) {
          var lei = r.lei.map(function (x) {
            return '<li><button type="button" class="es-link" data-lj-dip="' + esc(x.diploma_id + '~' + x.id) + '"><b>' + esc(x.sigla || x.nome) + ' — ' + esc(x.rotulo) + '</b></button>' + tagDoDispositivo(x.situacao) + pelaBusca(x) + '<span class="es-lj-trecho">' + trechoAchado(x.trecho) + '</span></li>';
          }).join('');
          var jur = r.juris.map(function (x) {
            return '<li><button type="button" class="es-link" data-lj-verb="' + esc(x.id) + '"><b>' + cabecalhoDoVerbete(x) + '</b></button> ' + situacaoDoVerbete(x) + pelaBusca(x) + '<span class="es-lj-trecho">' + trechoAchado(x.trecho) + '</span></li>';
          }).join('');
          if (mais) {
            var ul1 = out.querySelector('[data-res="lei"]'), ul2 = out.querySelector('[data-res="juris"]');
            if (ul1) ul1.insertAdjacentHTML('beforeend', lei);
            if (ul2) ul2.insertAdjacentHTML('beforeend', jur);
          } else {
            out.innerHTML = '<div class="es-lj-resultados"><div><h4>Legislação <span class="al-fino">(' + r.total_lei + ')</span></h4><ul data-res="lei">' + (lei || '<li class="al-fino">Nada encontrado.</li>') + '</ul></div>' +
              '<div><h4>Jurisprudência <span class="al-fino">(' + r.total_juris + ')</span></h4><ul data-res="juris">' + (jur || '<li class="al-fino">Nada encontrado.</li>') + '</ul></div></div><div class="es-linha" id="es-lj-mais-cx"></div>';
          }
          var resta = Math.max(r.total_lei, r.total_juris) > pg * r.por_pagina;
          el('es-lj-mais-cx').innerHTML = resta ? '<button type="button" class="al-bt peq fan" id="es-lj-mais">Mais resultados</button>' : '';
          if (el('es-lj-mais')) el('es-lj-mais').onclick = function () { buscar(true); };
        }).catch(function (e) { falha(out, e); });
      }
      f.onsubmit = function (e) { e.preventDefault(); buscar(false); };
      // os resultados (data-lj-dip, data-lj-verb) são atendidos pelo ouvinte da tela inteira (acervoLei › ligarLeiJuris)
      if (LJ.busca.length >= 2) buscar(false); // voltou de um resultado: a busca reaparece
    }
    function acervoLei(alvo, arg) {
      if (arg) return diplomaNaTela(alvo, arg);
      api('GET', base() + '/legislacao').then(function (r) {
        alvo.innerHTML = '<div class="jr-caixa es-lj-topo"><div class="es-linha">' + voltarAAula() + '</div><h3>⚖️ Legislação</h3><p class="al-sub">A lei seca de tudo o que o edital cobra: ' + r.total + ' diploma(s), no texto compilado da fonte oficial, sem comentário. ' +
          'O que mudou depois do edital vem marcado, com a redação da data do edital ao lado. Em cada diploma, os dispositivos que o edital cobra aparecem destacados, com o link para as aulas que os usam.</p>' + caixaDeBusca() + '</div>' +
          '<div class="jr-caixa"><label class="es-lj-filtro"><span class="al-fino">Procurar diploma pelo nome</span><input type="search" id="es-lj-fd" maxlength="120" value="' + esc(LJ.filtroDip) + '" placeholder="ex.: CLT, Código Civil, 8.036"></label><div id="es-lj-dips"></div></div>';
        function pintar() {
          var t = (el('es-lj-fd').value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
          LJ.filtroDip = el('es-lj-fd').value;
          var lista = r.diplomas.filter(function (d) { return !t || (d.nome + ' ' + d.norma + ' ' + d.sigla + ' ' + d.id).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(t) >= 0; });
          el('es-lj-dips').innerHTML = lista.length ? lista.map(function (d) {
            return '<button type="button" class="es-lj-dcard" data-lj-dip="' + esc(d.id) + '"><b>' + esc(d.nome) + '</b>' + (d.sigla ? ' <span class="al-fino">(' + esc(d.sigla) + ')</span>' : '') +
              '<span class="al-fino">' + esc(d.norma) + '</span><span class="es-lj-dnum">' + d.artigos + ' dispositivo(s)' + (d.abrangencia === 'trechos' ? ' (trechos)' : '') +
              (d.cobrados ? ' · <b>' + d.cobrados + ' cobrado(s) pelo edital</b>' : '') + (d.alterados_apos_edital ? ' · <span class="es-lj-tag alt">' + d.alterados_apos_edital + ' alterado(s) depois do edital</span>' : '') + '</span></button>';
          }).join('') : '<p class="al-sub">Nenhum diploma com esse nome.</p>';
        }
        el('es-lj-fd').oninput = pintar;
        pintar();
        ligarVoltarAAula();
        ligarBusca();
        ligarLeiJuris(alvo, {});
      }).catch(function (e) { falha(alvo, e); });
    }
    // os títulos, capítulos e seções que um dispositivo abre (só os níveis que mudaram desde o anterior)
    function cabecalhosDaEstrutura(antes, agora) {
      var a = String(antes || '').split(' > '), b = String(agora || '').split(' > '), i = 0, out = '';
      if (!agora) return '';
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      for (; i < b.length; i++) if (b[i]) out += '<h4 class="es-lj-sec n' + Math.min(i, 3) + '">' + esc(b[i]) + '</h4>';
      return out;
    }
    // O DIPLOMA INTEIRO, DESENHADO SOB DEMANDA (auditoria AL de 17/10/2026, AL-10). O CC tem ~2 mil artigos: desenhar o
    // diploma num innerHTML só punha 26 mil elementos na página (0,5 s na máquina de teste, 2 a 3 s num celular), e o
    // filtro "Só o que o edital cobra" desenhava tudo de novo. Agora o diploma é dividido em BLOCOS (uma seção da
    // estrutura, até BLOCO_MAX dispositivos), que nascem vazios com a altura estimada e são desenhados quando chegam
    // perto da tela (rolagem contínua), quando o "Ir para…" ou a procura levam até eles, ou na volta ao lugar. O filtro
    // só liga uma classe: o CSS esconde o que o edital não cobra e troca os cabeçalhos (os de cada modo vêm prontos).
    // A VOLTA AO LUGAR é por ÂNCORA — o dispositivo no topo da tela e a distância dele ao topo —, não por pixel: com os
    // blocos ainda estimados, o pixel não diz mais onde o aluno estava (auditoria AL, AL-16).
    var BLOCO_MAX = 25, MARGEM_DESENHO = 1200;
    function blocosDoDiploma(lista) {
      var out = [], cur = null, antes = null, antesCob = null;
      lista.forEach(function (x, i) {
        var est = x.estrutura || '';
        if (!cur || cur.est !== est || cur.fim - cur.ini >= BLOCO_MAX) { cur = { ini: i, fim: i, est: est, cob: false }; out.push(cur); }
        cur.fim = i + 1;
        if (x.cobrado) cur.cob = true;
      });
      // os cabeçalhos (título, capítulo, seção) que o bloco abre: um par para o diploma todo, outro para "só o cobrado"
      out.forEach(function (b) {
        b.hTodos = cabecalhosDaEstrutura(antes, b.est); antes = b.est;
        b.hCob = b.cob ? cabecalhosDaEstrutura(antesCob, b.est) : ''; if (b.cob) antesCob = b.est;
      });
      return out;
    }
    // a altura de um bloco ainda não desenhado (para a barra de rolagem e a rolagem contínua não pularem)
    function alturaEstimada(lista, b, soCobrado, cpl) {
      var h = b.hTodos ? 44 : 0;
      for (var i = b.ini; i < b.fim; i++) {
        var x = lista[i], n = (x.texto || '').length + (x.epigrafe || '').length + 20;
        if (soCobrado && !x.cobrado) continue;
        (x.partes || []).forEach(function (p) { n += (p.texto || '').length + (p.nota || '').length + 12; });
        h += 70 + Math.ceil(n / cpl) * 27 + (x.partes || []).length * 6;
      }
      return h;
    }
    // o dispositivo no topo da tela (o primeiro desenhado e visível cujo fim passa do topo) e a distância dele ao topo
    function ancoraDoTexto(tx) {
      if (!tx) return null;
      var bs = tx.children;
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i];
        if (b.hasAttribute('data-pend') || !b.offsetParent) continue;
        if (b.getBoundingClientRect().bottom <= 0) continue;
        var arts = b.querySelectorAll('.es-lj-disp');
        for (var k = 0; k < arts.length; k++) {
          if (!arts[k].offsetParent) continue;
          var r = arts[k].getBoundingClientRect();
          if (r.bottom > 0) return { dip: tx.getAttribute('data-dip'), id: String(arts[k].getAttribute('data-lj-ref')).split('|')[1], dy: Math.round(r.top) };
        }
      }
      return null;
    }
    // a âncora da tela atual, se ela for um diploma (o passo do histórico e a volta da aula a guardam)
    function ancoraAtual() {
      var tx = el('es-lj-texto');
      if (!tx || E.aba !== 'lei' || !E.abaArg || tx.getAttribute('data-dip') !== String(E.abaArg).split('~')[0]) return null;
      return ancoraDoTexto(tx);
    }
    function diplomaNaTela(alvo, arg) {
      var partes = String(arg).split('~'), dip = partes[0], alvoDisp = partes[1] || '';
      var repor = !!E.reposicao; E.reposicao = false; // voltando de uma aula com a rolagem guardada: a rolagem manda, não o dispositivo
      var ancora = E.ancoraRepor && E.ancoraRepor.dip === dip ? E.ancoraRepor : null; E.ancoraRepor = null;
      api('GET', base() + '/legislacao/' + encodeURIComponent(dip)).then(function (r) {
        var d = r.diploma, lista = r.dispositivos, soCobrados = false, achados = [], ia = -1;
        var secoes = [], ult = null, indice = {};
        lista.forEach(function (x, i) { indice[x.id] = i; if (x.estrutura && x.estrutura !== ult) { secoes.push({ est: x.estrutura, id: x.id }); } ult = x.estrutura; });
        alvo.innerHTML = '<div class="jr-caixa es-lj-topo"><div class="es-linha">' + voltarAAula() + '<button type="button" class="al-bt peq fan" id="es-lj-todos">← Todos os diplomas</button></div>' +
          '<h3>' + esc(d.nome) + '</h3><p class="es-ler-sub">' + esc(d.norma) + (d.fonte_url ? ' · <a href="' + esc(d.fonte_url) + '" target="_blank" rel="noopener">fonte oficial (texto compilado)</a>' : '') + (d.consultado_em ? ' — consultada em ' + dataBR(d.consultado_em) : '') +
          (d.rotulo_data_referencia ? ' · versão de referência (' + esc(d.rotulo_data_referencia) + '): ' : ' · versão de referência do edital: ') + dataBR(d.data_referencia_edital) + '</p>' +
          '<p class="al-fino">' + lista.length + ' dispositivo(s)' + (d.abrangencia === 'trechos' ? ' — só os trechos que o curso usa' : '') + ' · <b>' + r.cobrados + ' cobrado(s) pelo edital</b> (destacados)' + (d.alterados_apos_edital ? ' · ' + d.alterados_apos_edital + ' alterado(s) depois do edital' : '') + '</p>' +
          '<div class="es-lj-ferr">' + (secoes.length > 1 ? '<select id="es-lj-ir" aria-label="Ir para o título ou capítulo"><option value="">Ir para…</option>' + secoes.map(function (s2) {
            var seg = s2.est.split(' > '); return '<option value="' + esc(s2.id) + '">' + new Array(seg.length).join('  ') + esc(seg[seg.length - 1].slice(0, 90)) + '</option>';
          }).join('') + '</select>' : '') +
          (r.cobrados ? '<label class="es-lj-chk"><input type="checkbox" id="es-lj-so"> Só o que o edital cobra</label>' : '') +
          '<span class="es-lj-proc"><input type="search" id="es-lj-pq" maxlength="120" placeholder="Procurar neste diploma" aria-label="Procurar neste diploma"><button type="button" class="al-bt peq fan" id="es-lj-pb">Procurar</button><span class="al-fino" id="es-lj-pn"></span></span></div></div>' +
          '<div class="es-ler es-lj es-lj-diploma" id="es-lj-texto" data-dip="' + esc(d.id) + '"></div>';
        var tx = el('es-lj-texto'), blocos = blocosDoDiploma(lista), blocoDe = {};
        var cpl = Math.max(28, Math.floor((tx.clientWidth || 340) / 8.6));
        blocos.forEach(function (b, n) { for (var i = b.ini; i < b.fim; i++) blocoDe[lista[i].id] = n; });
        tx.innerHTML = blocos.length ? blocos.map(function (b, n) {
          return '<div class="es-lj-bloco' + (b.cob ? '' : ' sem-cob') + '" data-b="' + n + '" data-pend="1" style="--h:' + alturaEstimada(lista, b, false, cpl) + 'px;--hc:' + (b.cob ? alturaEstimada(lista, b, true, cpl) : 0) + 'px"></div>';
        }).join('') : '<p class="al-sub">Nada a mostrar.</p>';
        var nos = tx.children;
        // desenha um bloco; se ele estava inteiro ACIMA da tela, a rolagem compensa a diferença de altura (o que o aluno
        // está lendo não pula)
        function desenhar(n) {
          var bx = nos[n], b = blocos[n];
          if (!bx || !b || !bx.hasAttribute('data-pend')) return;
          var r0 = bx.getBoundingClientRect(), acima = r0.height > 0 && r0.bottom <= 0;
          bx.innerHTML = (b.hTodos ? '<div class="h-todos">' + b.hTodos + '</div>' : '') + (b.hCob ? '<div class="h-cob">' + b.hCob + '</div>' : '') +
            lista.slice(b.ini, b.fim).map(function (x) { return htmlDispositivo(d, x, r.marcas, { acervo: true, titulos: r.aulas }); }).join('');
          bx.removeAttribute('data-pend');
          if (acima) { var dh = bx.getBoundingClientRect().height - r0.height; if (dh) rolagem().scrollTop += dh; }
        }
        // a ROLAGEM CONTÍNUA: desenha os blocos que estão na tela ou a até MARGEM_DESENHO dela
        var vivo = true;
        function encher() {
          if (!vivo) return;
          if (!document.body.contains(tx)) { vivo = false; window.removeEventListener('scroll', aoRolar); return; }
          var topo = -MARGEM_DESENHO, fundo = window.innerHeight + MARGEM_DESENHO;
          for (var n = 0; n < nos.length; n++) {
            if (!nos[n].hasAttribute('data-pend') || !nos[n].offsetParent) continue;
            var rr = nos[n].getBoundingClientRect();
            if (rr.bottom < topo) continue;
            if (rr.top > fundo) break;
            desenhar(n);
          }
        }
        var tRolar = null;
        function aoRolar() { clearTimeout(tRolar); tRolar = setTimeout(encher, 60); }
        window.addEventListener('scroll', aoRolar, { passive: true });
        function irPara(id, piscar, dy) {
          var n = blocoDe[id];
          if (n == null) return false;
          desenhar(n); if (n > 0) desenhar(n - 1);
          var a = el('lj-' + d.id + '-' + id);
          if (!a || !a.offsetParent) return false;
          if (dy == null) a.scrollIntoView({ block: 'start' }); else rolagem().scrollTop += a.getBoundingClientRect().top - dy;
          encher();
          if (piscar) { a.classList.add('pisca'); setTimeout(function () { a.classList.remove('pisca'); }, 2500); }
          return true;
        }
        function filtrar(sim) {
          var a = ancoraDoTexto(tx);
          soCobrados = sim; achados = []; ia = -1; el('es-lj-pn').textContent = '';
          if (el('es-lj-so')) el('es-lj-so').checked = sim;
          tx.classList.toggle('so-cob', sim); // esconder e mostrar, sem desenhar de novo
          var x = a && el('lj-' + d.id + '-' + a.id);
          if (x && x.offsetParent) { rolagem().scrollTop += x.getBoundingClientRect().top - a.dy; encher(); return; }
          // o que o aluno lia saiu de vista (não é cobrado): vai ao próximo cobrado depois dele
          for (var i = a ? indice[a.id] : lista.length; i < lista.length; i++) if (lista[i].cobrado) { irPara(lista[i].id, false, a.dy); return; }
          if (tx.getBoundingClientRect().top < 0) tx.scrollIntoView({ block: 'start' });
          encher();
        }
        el('es-lj-todos').onclick = function () { ir('lei'); };
        if (el('es-lj-ir')) el('es-lj-ir').onchange = function () {
          var id = this.value; if (!id) return;
          if (soCobrados && !lista[indice[id]].cobrado) {
            // com o filtro ligado, vai ao primeiro dispositivo cobrado da seção; seção sem nenhum desliga o filtro
            var est = lista[indice[id]].estrutura || '', achou = '';
            for (var i = indice[id]; i < lista.length && String(lista[i].estrutura || '').indexOf(est) === 0; i++) if (lista[i].cobrado) { achou = lista[i].id; break; }
            if (achou) id = achou; else filtrar(false);
          }
          irPara(id, false); this.value = '';
        };
        if (el('es-lj-so')) el('es-lj-so').onchange = function () { filtrar(this.checked); };
        function procurar() {
          var t = semAcentoLJ(el('es-lj-pq').value.trim());
          if (t.length < 2) { el('es-lj-pn').textContent = 'Digite ao menos duas letras.'; return; }
          if (achados.t !== t) {
            achados = lista.filter(function (x) {
              if (soCobrados && !x.cobrado) return false;
              return semAcentoLJ([x.rotulo, x.epigrafe, x.texto].concat((x.partes || []).map(function (p) { return p.rotulo + ' ' + p.texto; })).join(' ')).indexOf(t) >= 0;
            }).map(function (x) { return x.id; });
            achados.t = t; ia = -1;
          }
          if (!achados.length) { el('es-lj-pn').textContent = 'Nada encontrado.'; return; }
          ia = (ia + 1) % achados.length;
          irPara(achados[ia], true);
          el('es-lj-pn').textContent = (ia + 1) + ' de ' + achados.length + (achados.length > 1 ? ' — Procurar de novo vai ao próximo' : '');
        }
        el('es-lj-pb').onclick = procurar;
        el('es-lj-pq').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); procurar(); } };
        ligarVoltarAAula();
        ligarLeiJuris(tx, r.marcas || {});
        // onde abrir: a âncora guardada (Voltar, F5, volta da aula), o dispositivo pedido, ou o começo
        if (ancora && blocoDe[ancora.id] != null) irPara(ancora.id, false, ancora.dy);
        else if (alvoDisp && !repor && blocoDe[alvoDisp] != null) setTimeout(function () { irPara(alvoDisp, true); }, 30);
        encher();
        [150, 600, 1500].forEach(function (ms) { setTimeout(encher, ms); }); // a rolagem reposta depois (por pixel) também desenha o que está na tela
      }).catch(function (e) { falha(alvo, e); });
    }
    function semAcentoLJ(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function acervoJuris(alvo, arg) {
      if (arg) return verbeteNaTela(alvo, arg);
      var f = LJ.jf, qs = ['tribunal', 'colecao', 'tipo', 'situacao', 'disciplina', 'q', 'pagina'].filter(function (k) { return f[k]; }).map(function (k) { return k + '=' + encodeURIComponent(f[k]); }).join('&');
      api('GET', base() + '/jurisprudencia' + (qs ? '?' + qs : '')).then(function (r) {
        var fc = r.facetas, sel = function (k, rot, ops) {
          return '<label class="es-lj-filtro"><span class="al-fino">' + rot + '</span><select data-jf="' + k + '"><option value="">Todos</option>' + ops.map(function (o) {
            return '<option value="' + esc(o.valor) + '"' + (String(f[k] || '') === String(o.valor) ? ' selected' : '') + '>' + esc(o.rot) + ' (' + o.n + ')</option>';
          }).join('') + '</select></label>';
        };
        var filtrado = ['tribunal', 'colecao', 'tipo', 'situacao', 'disciplina', 'q'].some(function (k) { return f[k]; });
        alvo.innerHTML = '<div class="jr-caixa es-lj-topo"><div class="es-linha">' + voltarAAula() + '</div><h3>🏛️ Jurisprudência</h3><p class="al-sub">Súmulas, orientações jurisprudenciais, precedentes normativos, teses e temas do TST, do TRT da 10ª Região, do STF e do STJ pertinentes ao curso, e os julgados que as aulas citam — como o tribunal os publicou, sem comentário, com a situação de cada um.</p>' +
          '<form class="es-lj-filtros" id="es-jf">' +
          sel('tribunal', 'Tribunal', fc.tribunais.map(function (o) { return { valor: o.valor, rot: o.valor, n: o.n }; })) +
          sel('colecao', 'Coleção', fc.colecoes.map(function (o) { return { valor: o.valor, rot: o.nome, n: o.n }; })) +
          sel('tipo', 'Tipo', fc.tipos.map(function (o) { return { valor: o.valor, rot: tipoJuris(o.valor), n: o.n }; })) +
          sel('situacao', 'Situação', fc.situacoes.map(function (o) { return { valor: o.valor, rot: SIT_JURIS[o.valor] || o.valor || 'sem situação', n: o.n }; })) +
          sel('disciplina', 'Disciplina', fc.disciplinas.map(function (o) { return { valor: o.valor, rot: o.valor + ' ' + o.nome, n: o.n }; })) +
          '<label class="es-lj-filtro es-lj-q"><span class="al-fino">Texto</span><input type="search" data-jf="q" maxlength="200" value="' + esc(f.q || '') + '" placeholder="Palavras no texto, na tese ou no número"></label>' +
          '<div class="es-linha"><button type="submit" class="al-bt peq">Filtrar</button>' + (filtrado ? '<button type="button" class="al-bt peq fan" id="es-jf-limpa">Limpar os filtros</button>' : '') +
          '<button type="button" class="al-bt peq fan" id="es-jf-busca">Buscar também na legislação</button></div></form></div>' +
          '<div class="jr-caixa"><p class="al-fino" id="es-jf-total">' + r.total + ' verbete(s)' + (filtrado ? ' com estes filtros' : '') + (r.paginas > 1 ? ' · página ' + r.pagina + ' de ' + r.paginas : '') + '</p>' +
          '<div class="es-ler es-lj" id="es-jf-lista">' + (r.itens.length ? r.itens.map(function (v) {
            var m = r.marcas[v.id] || {};
            return '<details class="es-lj-det' + (m.cor ? ' grifo-' + esc(m.cor) : '') + (m.lido ? ' lido' : '') + '" data-lj-tipo="verbete" data-lj-ref="' + esc(v.id) + '"><summary><span class="es-lj-vcab">' + cabecalhoDoVerbete(v) + '</span> ' + situacaoDoVerbete(v) +
              (v.titulo && v.titulo !== v.numero ? '<span class="es-lj-vres">' + esc(v.titulo.slice(0, 220)) + '</span>' : '') + '</summary>' + corpoDoVerbete(v, r.marcas, { titulos: r.aulas, semTitulo: v.titulo.length <= 220 }) + '</details>';
          }).join('') : '<p class="al-sub">Nenhum verbete com estes filtros.</p>') + '</div>' +
          (r.paginas > 1 ? '<div class="es-linha es-lj-pag"><button type="button" class="al-bt peq fan" data-jf-pg="' + (r.pagina - 1) + '"' + (r.pagina > 1 ? '' : ' disabled') + '>← Anterior</button><span class="al-fino">Página ' + r.pagina + ' de ' + r.paginas + '</span><button type="button" class="al-bt peq fan" data-jf-pg="' + (r.pagina + 1) + '"' + (r.pagina < r.paginas ? '' : ' disabled') + '>Próxima →</button></div>' : '') + '</div>';
        function recarregar(p) {
          LJ.jf.pagina = p || 1;
          LUGAR.juris = null; // filtro novo: as disciplinas abertas e a rolagem de antes não valem mais
          novaTela(); alvo.innerHTML = '<p class="al-sub">Carregando…</p>';
          acervoJuris(alvo);
          if (el('es-abas')) el('es-abas').scrollIntoView({ block: 'start' });
        }
        el('es-jf').onsubmit = function (e) {
          e.preventDefault();
          cada(el('es-jf'), '[data-jf]', function (c) { LJ.jf[c.getAttribute('data-jf')] = c.value.trim(); });
          recarregar(1);
        };
        cada(el('es-jf'), 'select[data-jf]', function (c) { c.onchange = function () { el('es-jf').onsubmit({ preventDefault: function () {} }); }; });
        if (el('es-jf-limpa')) el('es-jf-limpa').onclick = function () { LJ.jf = { pagina: 1 }; recarregar(1); };
        el('es-jf-busca').onclick = function () { LJ.busca = (LJ.jf.q || '').trim(); ir('lei'); };
        cada(alvo, '[data-jf-pg]', function (b) { b.onclick = function () { recarregar(Number(b.getAttribute('data-jf-pg'))); }; });
        ligarVoltarAAula();
        ligarLeiJuris(el('es-jf-lista'), r.marcas || {});
      }).catch(function (e) { falha(alvo, e); });
    }
    function verbeteNaTela(alvo, id) {
      api('GET', base() + '/jurisprudencia/verbete/' + encodeURIComponent(id)).then(function (r) {
        alvo.innerHTML = '<div class="jr-caixa es-lj-topo"><div class="es-linha">' + voltarAAula() + '<button type="button" class="al-bt peq fan" id="es-lj-todos">← Toda a jurisprudência</button></div></div>' +
          '<div class="es-ler es-lj" id="es-lj-v1">' + htmlVerbete(r.verbete, r.marcas, { titulos: r.aulas }) + '</div>';
        el('es-lj-todos').onclick = function () { ir('juris'); };
        ligarVoltarAAula();
        ligarLeiJuris(el('es-lj-v1'), r.marcas || {});
      }).catch(function (e) { falha(alvo, e); });
    }

    // `guardarLugar`: quem tira o aluno do Estude para uma tela do curso (audiobook, desafio, material…) chama
    // antes de sair — as disciplinas abertas e a rolagem ficam guardadas para a volta.
    return { cartao: cartao, abrir: abrir, guardarLugar: guardarLugar, sair: sairDoEstude };
  };
})();
