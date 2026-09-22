/* =====================================================================
 * Villela Academy — ECOSSISTEMA do aluno: Trilhas, Villela Express e
 * Faça comigo (bibliotecas por formato), Lives e Comunidade. Montado por
 * app-cliente.js, que injeta as dependências. JS clássico, sem build.
 * Todo texto de aluno entra por esc() — a comunidade é conteúdo de terceiros.
 * ===================================================================== */
(function () {
  'use strict';

  window.AcademyEcossistema = function (D) {
    var api = D.api, esc = D.esc, el = D.el, setView = D.setView, erroBox = D.erroBox, brl = D.brl;
    var abrirAula = D.abrirAula; // (productId, lessonId) → estúdio do curso naquela aula

    function dur(seg) { seg = Number(seg || 0); if (!seg) return ''; if (seg < 60) return seg + ' s'; var m = Math.round(seg / 60); return m + ' min'; }
    function dataHora(iso) {
      try { return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
      catch (e) { return iso; }
    }
    function quando(iso) {
      var d = (Date.now() - Date.parse(iso)) / 1000;
      if (d < 60) return 'agora'; if (d < 3600) return Math.floor(d / 60) + ' min';
      if (d < 86400) return Math.floor(d / 3600) + ' h'; return Math.floor(d / 86400) + ' d';
    }
    // texto de aluno: escapa e só então transforma quebra de linha e link https em <a rel="nofollow ugc">
    function textoRico(t) {
      return esc(t).replace(/(https:\/\/[^\s<]+)/g, function (u) { return '<a href="' + u + '" target="_blank" rel="nofollow ugc noopener">' + u + '</a>'; })
        .replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
    }
    function falha(alvo, e) { alvo.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
    function barra(pct) { return '<div class="jr-barra"><i style="width:' + Math.max(0, Math.min(100, Number(pct) || 0)) + '%"></i></div>'; }

    // ================= TRILHAS =================
    function trilhas() {
      setView('<div class="al ec"><p class="al-sub">Carregando as trilhas…</p></div>');
      api('GET', '/aluno/trilhas').then(function (r) {
        var ts = r.trilhas || [];
        var h = '<div class="al ec"><p class="al-sub">Caminhos completos por área: comece pelo primeiro curso e avance na ordem. Os cursos marcados "em breve" entram na trilha assim que forem lançados.</p>';
        if (!ts.length) h += '<div class="al-caixa" style="padding:20px"><p>As trilhas estão sendo montadas. Em breve aparecem aqui.</p></div>';
        h += '<div class="ec-trilhas">' + ts.map(function (t) {
          return '<button class="ec-trilha" data-t="' + esc(t.slug) + '"><span class="ec-t-ico">' + esc(t.icone || '🧭') + '</span>' +
            '<b>' + esc(t.titulo) + (t.status !== 'publicada' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : '') + '</b>' +
            '<small>' + esc(t.subtitulo || '') + '</small>' +
            '<span class="ec-t-num">' + t.cursos + ' curso' + (t.cursos === 1 ? '' : 's') + (t.em_breve ? ' · ' + t.em_breve + ' em breve' : '') + '</span>' +
            (t.progresso_pct != null ? barra(t.progresso_pct) : '') + '</button>';
        }).join('') + '</div></div>';
        setView(h);
        Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (b) { b.onclick = function () { trilha(b.getAttribute('data-t')); }; });
      }).catch(erroBox);
    }
    function trilha(slug) {
      api('GET', '/aluno/trilhas/' + encodeURIComponent(slug)).then(function (r) {
        var t = r.trilha;
        var h = '<div class="al ec"><a href="#" class="al-volta" id="ec-volta">← Todas as trilhas</a>' +
          '<div class="ec-t-cab"><span class="ec-t-ico grande">' + esc(t.icone || '🧭') + '</span><div><p class="al-rotulo">Trilha</p><h2>' + esc(t.titulo) + '</h2>' +
          (t.subtitulo ? '<p class="al-sub">' + esc(t.subtitulo) + '</p>' : '') + '</div></div>' +
          (t.descricao ? '<p>' + esc(t.descricao) + '</p>' : '') + (t.publico ? '<p class="al-fino"><b>Para quem:</b> ' + esc(t.publico) + '</p>' : '') +
          (t.clube ? '<div class="ec-clube">' + (t.clube.assinante ? '✅ Você é assinante de <b>' + esc(t.clube.titulo) + '</b>: a trilha inteira está liberada.'
            : '🔁 <b>Assine e libere a trilha inteira</b> — ' + esc(t.clube.titulo) + (t.clube.preco_centavos ? ' · ' + brl(t.clube.preco_centavos) + '/mês' : '') +
              ' <a class="al-bt peq" href="/academy/cursos/' + esc(t.clube.slug) + '">Ver a assinatura</a>') + '</div>' : '') +
          '<ol class="ec-passos">' + t.itens.map(function (x, i) {
            if (x.status !== 'disponivel') return '<li class="breve"><span class="n">' + (i + 1) + '</span><div><b>' + esc(x.titulo) + '</b> <span class="ec-breve">em breve</span>' +
              (x.descricao ? '<p class="al-fino">' + esc(x.descricao) + '</p>' : '') + '</div></li>';
            return '<li><span class="n">' + (i + 1) + '</span><div><b>' + esc(x.titulo) + '</b>' + (x.descricao ? '<p class="al-fino">' + esc(x.descricao) + '</p>' : '') +
              (x.acesso ? barra(x.progresso_pct || 0) + '<button class="al-bt peq" data-c="' + esc(x.produto_id) + '">' + (x.progresso_pct ? 'Continuar' : 'Começar') + ' · ' + (x.progresso_pct || 0) + '%</button>'
                : '<a class="al-bt peq fan" href="/academy/cursos/' + esc(x.slug) + '">Conhecer o curso' + (x.preco_centavos ? ' · ' + brl(x.preco_centavos) : '') + '</a>') + '</div></li>';
          }).join('') + '</ol></div>';
        setView(h);
        el('ec-volta').onclick = function (e) { e.preventDefault(); trilhas(); };
        Array.prototype.forEach.call(document.querySelectorAll('[data-c]'), function (b) { b.onclick = function () { abrirAula(b.getAttribute('data-c'), ''); }; });
      }).catch(erroBox);
    }

    // ================= VILLELA EXPRESS e FAÇA COMIGO =================
    var FORMATO = {
      express: { titulo: 'Villela Express', ico: '⚡', intro: 'Vídeos curtos, de até 3 minutos, para consultar na hora: como anexar um PDF, criar um projeto, melhorar um prompt. A sua biblioteca de consulta rápida.' },
      'faca-comigo': { titulo: 'Faça comigo', ico: '🛠️', intro: 'Sessões práticas de tela: eu executo, você executa junto. Cada vídeo tem os passos marcados — clique num passo para ir ao ponto exato.' },
    };
    function formato(f) {
      var F = FORMATO[f];
      setView('<div class="al ec"><p class="al-sub">Carregando…</p></div>');
      api('GET', '/aluno/formato/' + f).then(function (r) {
        var lista = r.aulas || [], cursos = [];
        lista.forEach(function (a) { if (cursos.indexOf(a.produto) < 0) cursos.push(a.produto); });
        var h = '<div class="al ec"><p class="al-sub">' + esc(F.intro) + '</p>';
        if (!lista.length) h += '<div class="al-caixa" style="padding:20px"><p>' + F.ico + ' Os primeiros vídeos de ' + esc(F.titulo) + ' estão em produção. Assim que forem publicados, aparecem aqui — de todos os seus cursos, num lugar só.</p></div>';
        else h += '<div class="pr-filtros"><input id="ec-busca" placeholder="Buscar (ex.: PDF, projeto, prompt)…"><select id="ec-curso"><option value="">Todos os cursos</option>' +
          cursos.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div><div class="ec-grade" id="ec-lista"></div>';
        h += '</div>';
        setView(h);
        if (!lista.length) return;
        var pinta = function () {
          var q = el('ec-busca').value.toLowerCase(), c = el('ec-curso').value;
          var vis = lista.filter(function (a) { return (!c || a.produto === c) && (!q || (a.titulo + ' ' + a.resumo).toLowerCase().indexOf(q) >= 0); });
          el('ec-lista').innerHTML = vis.map(function (a) {
            return '<button class="ec-card' + (a.liberada ? '' : ' trav') + '" data-p="' + esc(a.produto_id) + '" data-l="' + esc(a.id) + '"' + (a.liberada ? '' : ' disabled') + '>' +
              '<span class="ec-fmt">' + F.ico + ' ' + esc(F.titulo) + (a.duracao_seg ? ' · ' + dur(a.duracao_seg) : '') + '</span>' +
              '<b>' + esc(a.titulo) + '</b>' + (a.resumo ? '<small>' + esc(a.resumo) + '</small>' : '') +
              '<span class="al-fino">' + esc(a.produto) + (a.passos ? ' · ' + a.passos + ' passos' : '') + (a.liberada ? '' : ' · 🔒 do curso') + '</span></button>';
          }).join('') || '<p class="al-fino">Nada com esse filtro.</p>';
          Array.prototype.forEach.call(el('ec-lista').querySelectorAll('[data-l]'), function (b) {
            b.onclick = function () { abrirAula(b.getAttribute('data-p'), b.getAttribute('data-l')); };
          });
        };
        el('ec-busca').oninput = pinta; el('ec-curso').onchange = pinta; pinta();
      }).catch(erroBox);
    }

    // ================= LIVES =================
    function lives() {
      setView('<div class="al ec"><p class="al-sub">Carregando a agenda…</p></div>');
      api('GET', '/aluno/lives').then(function (r) {
        var ls = r.lives || [], agora = Date.now();
        var fim = function (l) { return Date.parse(l.inicio_em) + l.duracao_min * 60e3; };
        var proximas = ls.filter(function (l) { return l.status !== 'cancelada' && l.status !== 'encerrada' && fim(l) > agora; })
          .sort(function (a, b) { return Date.parse(a.inicio_em) - Date.parse(b.inicio_em); });
        var passadas = ls.filter(function (l) { return proximas.indexOf(l) < 0 && l.status !== 'cancelada'; });
        var h = '<div class="al ec"><p class="al-sub">Uma vez por mês, ao vivo: novidades, ferramentas, casos, dúvidas e projetos de alunos. A gravação entra no curso depois.</p>';
        h += '<h3 class="ec-h">Próximas</h3>' + (proximas.length ? proximas.map(cartaoLive).join('') : '<div class="al-caixa" style="padding:18px"><p>📡 A próxima live ainda vai ser marcada. Quando for, você recebe o aviso aqui.</p></div>');
        if (passadas.length) h += '<h3 class="ec-h">Gravações e o que mudou em cada mês</h3>' + passadas.map(cartaoLive).join('');
        h += '</div>';
        setView(h);
        ligarLives(ls);
      }).catch(erroBox);
    }
    function cartaoLive(l) {
      var ao = l.status === 'ao_vivo';
      return '<div class="ec-live' + (ao ? ' ao' : '') + '" id="lv-' + esc(l.id) + '"><div class="ec-l-cab"><span class="ec-l-data">' + (ao ? '🔴 AO VIVO' : '📅 ' + esc(dataHora(l.inicio_em))) + '</span>' +
        (!l.publicada ? '<span class="marca-rasc">rascunho — só você vê</span>' : '') + '</div>' +
        '<h4>' + esc(l.titulo) + '</h4>' + (l.descricao ? '<p>' + textoRico(l.descricao) + '</p>' : '') +
        '<div class="ec-l-acoes">' +
        (l.link ? '<a class="al-bt" href="' + esc(l.link) + '" target="_blank" rel="noopener">▶ Entrar na live</a>' : '') +
        (l.gravacao_url ? '<a class="al-bt fan" href="' + esc(l.gravacao_url) + '" target="_blank" rel="noopener">▶ Ver a gravação</a>' : '') +
        (l.status === 'agendada' ? '<button class="al-bt peq ' + (l.inscrito ? 'ok' : 'fan') + '" data-insc="' + esc(l.id) + '" data-sim="' + (l.inscrito ? '0' : '1') + '">' + (l.inscrito ? '✓ Inscrito — vou te lembrar 1h antes' : '🔔 Quero ser lembrado') + '</button>' : '') +
        '<span class="al-fino">' + l.inscritos + ' inscrito' + (l.inscritos === 1 ? '' : 's') + (l.link || l.status !== 'agendada' ? '' : ' · o link aparece 30 min antes') + '</span></div>' +
        ((l.novidades || []).length ? '<details class="ec-novidades"><summary>📰 O que mudou este mês (' + l.novidades.length + ')</summary><ul>' + l.novidades.map(function (n) {
          return '<li><b>' + esc(n.titulo) + '</b>' + (n.texto ? ' — ' + esc(n.texto) : '') + (n.fonte ? ' <a href="' + esc(n.fonte) + '" target="_blank" rel="noopener">fonte</a>' : '') + '</li>';
        }).join('') + '</ul></details>' : '') +
        (l.status !== 'cancelada' ? '<details class="ec-perg" data-perg="' + esc(l.id) + '"><summary>🙋 Perguntas para a live</summary><div class="ec-perg-corpo"></div></details>' : '') + '</div>';
    }
    function ligarLives(ls) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-insc]'), function (b) {
        b.onclick = function () {
          api('POST', '/aluno/lives/' + b.getAttribute('data-insc') + '/inscricao', { sim: b.getAttribute('data-sim') === '1' }).then(lives).catch(function (e) { alert(e.message); });
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-perg]'), function (d) {
        d.addEventListener('toggle', function () { if (d.open) carregarPerguntas(d); });
      });
    }
    function carregarPerguntas(d) {
      var id = d.getAttribute('data-perg'), corpo = d.querySelector('.ec-perg-corpo');
      corpo.innerHTML = '<p class="al-fino">Carregando…</p>';
      api('GET', '/aluno/lives/' + id + '/perguntas').then(function (r) { pintarPerguntas(d, r.perguntas); }).catch(function (e) { falha(corpo, e); });
    }
    function pintarPerguntas(d, ps) {
      var id = d.getAttribute('data-perg'), corpo = d.querySelector('.ec-perg-corpo');
      corpo.innerHTML = '<p class="al-fino">Mande a sua pergunta antes (até 3) e vote nas dos colegas — as mais votadas abrem a live.</p>' +
        '<div class="ec-nova"><textarea rows="2" placeholder="A sua pergunta…"></textarea><button class="al-bt peq">Enviar</button></div><p class="erro ec-msg"></p>' +
        (ps.length ? ps.map(function (q) {
          return '<div class="ec-q' + (q.status === 'respondida' ? ' resp' : '') + (q.status === 'oculta' ? ' oc' : '') + '"><button class="ec-voto' + (q.votei ? ' on' : '') + '" data-v="' + esc(q.id) + '"' + (q.minha ? ' disabled title="A sua pergunta"' : '') + '>▲ ' + q.votos + '</button>' +
            '<div><p>' + esc(q.texto) + '</p><small>' + esc(q.autor) + (q.status === 'respondida' ? ' · ✓ respondida' : '') + (q.status === 'oculta' ? ' · oculta' : '') + '</small></div></div>';
        }).join('') : '<p class="al-fino">Ainda não há perguntas. Seja a primeira pessoa.</p>');
      var bt = corpo.querySelector('.ec-nova button'), tx = corpo.querySelector('.ec-nova textarea');
      bt.onclick = function () {
        api('POST', '/aluno/lives/' + id + '/perguntas', { texto: tx.value }).then(function (r) { pintarPerguntas(d, r.perguntas); })
          .catch(function (e) { corpo.querySelector('.ec-msg').textContent = e.message; });
      };
      Array.prototype.forEach.call(corpo.querySelectorAll('[data-v]'), function (b) {
        b.onclick = function () { api('POST', '/aluno/lives/perguntas/' + b.getAttribute('data-v') + '/voto').then(function (r) { pintarPerguntas(d, r.perguntas); }).catch(function (e) { alert(e.message); }); };
      });
    }

    // ================= COMUNIDADE =================
    var CM = { casa: null, area: '', busca: '' };
    function comunidade() {
      setView('<div class="al ec"><p class="al-sub">Carregando a comunidade…</p></div>');
      api('GET', '/aluno/ecossistema').then(function (r) {
        if (!r.casas.length) {
          setView('<div class="al ec"><div class="al-caixa" style="padding:22px"><h3>💬 Comunidade Villela Academy</h3><p>A comunidade é o lugar dos alunos: dúvidas, prompts, projetos e oportunidades. ' +
            'Ela abre para você assim que você se matricular em um curso.</p></div></div>');
          return;
        }
        CM.casa = r.casas[0].producer_id;
        listar();
      }).catch(erroBox);
    }
    function listar() {
      var q = '?area=' + encodeURIComponent(CM.area) + '&busca=' + encodeURIComponent(CM.busca);
      api('GET', '/aluno/comunidade/' + CM.casa + q).then(function (r) {
        var h = '<div class="al ec"><div class="ec-com">' +
          '<aside class="ec-areas"><button class="' + (CM.area ? '' : 'on') + '" data-a="">🏠 Tudo</button>' + r.areas.map(function (a) {
            return '<button class="' + (CM.area === a.id ? 'on' : '') + '" data-a="' + a.id + '" title="' + esc(a.desc) + '">' + a.icone + ' ' + esc(a.nome) + (a.topicos ? ' <span class="n">' + a.topicos + '</span>' : '') + '</button>';
          }).join('') + (r.moderador ? '<button data-den="1">🚩 Denúncias</button>' : '') +
          '<details class="ec-regras"><summary>Regras da comunidade</summary><ol>' + r.regras.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></details></aside>' +
          '<section class="ec-lista"><div class="ec-barra"><input id="ec-cbusca" placeholder="Buscar na comunidade…" value="' + esc(CM.busca) + '"><button class="al-bt" id="ec-novo">+ Novo tópico</button></div>' +
          '<div id="ec-form"></div>' +
          (r.topicos.length ? r.topicos.map(function (t) {
            var area = r.areas.filter(function (a) { return a.id === t.area; })[0] || {};
            return '<button class="ec-top' + (t.fixado ? ' fix' : '') + (t.status !== 'visivel' ? ' oc' : '') + '" data-top="' + esc(t.id) + '">' +
              '<span class="ec-top-area">' + (t.fixado ? '📌 ' : '') + (area.icone || '') + ' ' + esc(area.nome || t.area) + (t.produto ? ' · ' + esc(t.produto) : '') + (t.status !== 'visivel' ? ' · ' + esc(t.status) : '') + '</span>' +
              '<b>' + esc(t.titulo) + (t.resolvido ? ' <span class="ec-ok">✓ resolvido</span>' : '') + '</b><small>' + esc(t.resumo) + '</small>' +
              '<span class="al-fino">' + esc(t.autor) + ' · ' + quando(t.ultimo_em) + ' · 💬 ' + t.respostas + ' · ♥ ' + t.curtidas + '</span></button>';
          }).join('') : '<div class="al-caixa" style="padding:18px"><p>Nenhum tópico aqui ainda. Que tal abrir o primeiro?</p></div>') +
          '</section></div></div>';
        setView(h);
        Array.prototype.forEach.call(document.querySelectorAll('.ec-areas [data-a]'), function (b) { b.onclick = function () { CM.area = b.getAttribute('data-a'); listar(); }; });
        var den = document.querySelector('[data-den]'); if (den) den.onclick = denuncias;
        var tb; el('ec-cbusca').oninput = function () { var v = this.value; clearTimeout(tb); tb = setTimeout(function () { CM.busca = v; listar(); }, 450); };
        el('ec-novo').onclick = function () { formNovo(r.areas); };
        Array.prototype.forEach.call(document.querySelectorAll('[data-top]'), function (b) { b.onclick = function () { abrirTopico(b.getAttribute('data-top')); }; });
      }).catch(erroBox);
    }
    function formNovo(areas) {
      el('ec-form').innerHTML = '<div class="al-caixa ec-novo-top"><select id="ec-na">' + areas.map(function (a) { return '<option value="' + a.id + '"' + (a.id === (CM.area || 'duvidas') ? ' selected' : '') + '>' + a.icone + ' ' + esc(a.nome) + '</option>'; }).join('') + '</select>' +
        '<input id="ec-nt" placeholder="Título: a pergunta ou o assunto em uma linha"><textarea id="ec-nx" rows="6" placeholder="Conte o contexto. Anonimize dados de clientes. Em Novidades de IA, inclua o link da fonte."></textarea>' +
        '<div class="qz-rodape"><button class="al-bt" id="ec-pub">Publicar</button><button class="al-bt fan" id="ec-canc">Cancelar</button><span class="erro" id="ec-nmsg"></span></div></div>';
      el('ec-canc').onclick = function () { el('ec-form').innerHTML = ''; };
      el('ec-pub').onclick = function () {
        api('POST', '/aluno/comunidade/' + CM.casa + '/topicos', { area: el('ec-na').value, titulo: el('ec-nt').value, texto: el('ec-nx').value })
          .then(function (r) { mostrarTopico(r.topico); }).catch(function (e) { el('ec-nmsg').textContent = e.message; });
      };
      el('ec-nt').focus();
    }
    function abrirTopico(id) { api('GET', '/aluno/comunidade/topicos/' + id).then(function (r) { mostrarTopico(r.topico); }).catch(erroBox); }
    function acoesItem(tipo, x, t) {
      var h = '<span class="ec-acoes"><button class="ec-mini' + (x.curtidas.minha ? ' on' : '') + '" data-curtir="' + tipo + ':' + esc(x.id) + '">♥ ' + x.curtidas.n + '</button>';
      if (!x.minha) h += '<button class="ec-mini" data-denunciar="' + tipo + ':' + esc(x.id) + '">🚩</button>';
      if (x.minha) h += '<button class="ec-mini" data-apagar="' + tipo + ':' + esc(x.id) + '">apagar</button>';
      if (t.moderador) h += '<button class="ec-mini" data-mod="' + tipo + ':' + esc(x.id) + ':' + (x.status === 'visivel' ? 'ocultar' : 'mostrar') + '">' + (x.status === 'visivel' ? 'ocultar' : 'mostrar') + '</button>' +
        (tipo === 'topico' ? '<button class="ec-mini" data-mod="topico:' + esc(x.id) + ':' + (t.fixado ? 'desafixar' : 'fixar') + '">' + (t.fixado ? 'desafixar' : '📌 fixar') + '</button>' : '');
      return h + '</span>';
    }
    function mostrarTopico(t) {
      var h = '<div class="al ec"><a href="#" class="al-volta" id="ec-voltar">← Comunidade</a><article class="ec-post"><p class="al-rotulo">' + esc(t.area) + (t.produto ? ' · ' + esc(t.produto) : '') + (t.status !== 'visivel' ? ' · ' + esc(t.status) : '') + '</p>' +
        '<h2>' + esc(t.titulo) + '</h2><p class="al-fino">' + esc(t.autor) + (t.autor_equipe ? ' <span class="ec-equipe">equipe</span>' : '') + ' · ' + quando(t.criado_em) + '</p>' +
        '<div class="ec-texto">' + textoRico(t.texto) + '</div>' + acoesItem('topico', { id: t.id, curtidas: t.curtidas, minha: t.minha, status: t.status }, t) + '</article>' +
        '<h3 class="ec-h">' + t.respostas.length + ' resposta' + (t.respostas.length === 1 ? '' : 's') + '</h3>' +
        t.respostas.map(function (r) {
          return '<div class="ec-resp' + (r.solucao ? ' sol' : '') + (r.status !== 'visivel' ? ' oc' : '') + '">' + (r.solucao ? '<span class="ec-ok">✓ Resolveu</span>' : '') +
            '<p class="al-fino">' + esc(r.autor) + (r.equipe ? ' <span class="ec-equipe">equipe</span>' : '') + ' · ' + quando(r.criado_em) + '</p><div class="ec-texto">' + textoRico(r.texto) + '</div>' +
            acoesItem('resposta', r, t) + ((t.minha || t.moderador) && !r.solucao ? ' <button class="ec-mini" data-sol="' + esc(r.id) + '">✓ marcar como solução</button>' : '') + '</div>';
        }).join('') +
        (t.status === 'visivel' ? '<div class="al-caixa ec-novo-top"><textarea id="ec-rx" rows="4" placeholder="A sua resposta…"></textarea><div class="qz-rodape"><button class="al-bt" id="ec-resp">Responder</button><span class="erro" id="ec-rmsg"></span></div></div>' : '') +
        '</div>';
      setView(h);
      window.scrollTo(0, 0);
      el('ec-voltar').onclick = function (e) { e.preventDefault(); listar(); };
      if (el('ec-resp')) el('ec-resp').onclick = function () {
        api('POST', '/aluno/comunidade/topicos/' + t.id + '/respostas', { texto: el('ec-rx').value }).then(function (r) { mostrarTopico(r.topico); })
          .catch(function (e) { el('ec-rmsg').textContent = e.message; });
      };
      var ate = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
      ate('[data-curtir]', function (b) { b.onclick = function () { var p = b.getAttribute('data-curtir').split(':'); api('POST', '/aluno/comunidade/curtir', { tipo: p[0], id: p[1] }).then(function (c) { b.classList.toggle('on', c.minha); b.textContent = '♥ ' + c.n; }).catch(function (e) { alert(e.message); }); }; });
      ate('[data-denunciar]', function (b) { b.onclick = function () {
        var m = prompt('Por que este conteúdo deve ser revisto? (ex.: dado pessoal, ofensa, spam)'); if (m == null) return;
        var p = b.getAttribute('data-denunciar').split(':'); api('POST', '/aluno/comunidade/denunciar', { tipo: p[0], id: p[1], motivo: m }).then(function () { alert('Obrigado. A moderação vai revisar.'); }).catch(function (e) { alert(e.message); });
      }; });
      ate('[data-apagar]', function (b) { b.onclick = function () {
        if (!confirm('Apagar o que você escreveu? Não dá para desfazer.')) return;
        var p = b.getAttribute('data-apagar').split(':'); api('POST', '/aluno/comunidade/apagar', { tipo: p[0], id: p[1] }).then(function () { p[0] === 'topico' ? listar() : abrirTopico(t.id); }).catch(function (e) { alert(e.message); });
      }; });
      ate('[data-mod]', function (b) { b.onclick = function () {
        var p = b.getAttribute('data-mod').split(':'); api('POST', '/aluno/comunidade/moderar', { tipo: p[0], id: p[1], acao: p[2] }).then(function () { abrirTopico(t.id); }).catch(function (e) { alert(e.message); });
      }; });
      ate('[data-sol]', function (b) { b.onclick = function () { api('POST', '/aluno/comunidade/topicos/' + t.id + '/solucao', { resposta_id: b.getAttribute('data-sol') }).then(function (r) { mostrarTopico(r.topico); }).catch(function (e) { alert(e.message); }); }; });
    }
    function denuncias() {
      api('GET', '/aluno/comunidade/' + CM.casa + '/denuncias').then(function (r) {
        setView('<div class="al ec"><a href="#" class="al-volta" id="ec-voltar">← Comunidade</a><h2>🚩 Denúncias abertas</h2>' +
          (r.denuncias.length ? r.denuncias.map(function (d) {
            return '<div class="al-caixa ec-den"><p><b>' + d.n + ' denúncia(s)</b> · ' + esc(d.alvo_tipo) + ' · status: ' + esc(d.status || '') + '</p><p><b>' + esc(d.titulo || '') + '</b></p><p class="al-fino">' + esc(d.trecho) + '</p>' +
              (d.motivos.length ? '<p class="al-fino">Motivos: ' + d.motivos.map(esc).join(' · ') + '</p>' : '') +
              '<button class="al-bt peq fan" data-ver="' + esc(d.topico_id) + '">Abrir</button></div>';
          }).join('') : '<p>Nenhuma denúncia aberta. 🎉</p>') + '</div>');
        el('ec-voltar').onclick = function (e) { e.preventDefault(); listar(); };
        Array.prototype.forEach.call(document.querySelectorAll('[data-ver]'), function (b) { b.onclick = function () { abrirTopico(b.getAttribute('data-ver')); }; });
      }).catch(erroBox);
    }

    return { trilhas: trilhas, express: function () { formato('express'); }, facaComigo: function () { formato('faca-comigo'); }, lives: lives, comunidade: comunidade };
  };
})();
