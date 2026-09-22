/* =====================================================================
 * Villela Academy — área do aluno: biblioteca e ESTÚDIO DE AULA.
 * Servido em /academy/aluno.js e montado por app-cliente.js, que injeta
 * as dependências (api, esc, ME...) — este arquivo não fala com o DOM
 * de outras abas nem conhece produtor/afiliado/admin.
 *
 * O estúdio é a tela onde o aluno passa o tempo dele: vídeo grande,
 * grade do curso navegável ao lado, material complementar em destaque e
 * navegação explícita entre aulas (anterior / concluir e avançar).
 * JS clássico (var/function), sem build — igual ao resto do painel.
 * ===================================================================== */
(function () {
  'use strict';

  window.AcademyAluno = function (D) {
    var api = D.api, esc = D.esc, el = D.el, brl = D.brl, setView = D.setView, erroBox = D.erroBox;
    var C = null; // estado do curso aberto: {pid, d, aulas[], pa, i}

    // ---------------- ícones (SVG: nítido em qualquer tela, ao contrário do emoji) ----------------
    var P = {
      play: 'M8 5v14l11-7z', check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
      lock: 'M12 1a5 5 0 0 0-5 5v3H5v13h14V9h-2V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 1 1 6 0z',
      doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z',
      som: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3z', elo: 'M3.9 12a5 5 0 0 1 5-5h3v-2h-3a7 7 0 0 0 0 14h3v-2h-3a5 5 0 0 1-5-5zm4.1 1h8v-2H8zm5-8v2h3a5 5 0 0 1 0 10h-3v2h3a7 7 0 0 0 0-14z',
      baixar: 'M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z', seta: 'M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z',
      esq: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z', dir: 'M8.6 16.6 13.2 12 8.6 7.4 10 6l6 6-6 6z',
      relogio: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.6V7h-2v6.4l5 3 1-1.7z',
      lupa: 'M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
      chapeu: 'M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8z',
      texto: 'M3 5h18v2H3zm0 6h18v2H3zm0 6h12v2H3z', img: 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.9 13.1l2 2.4 3-3.9 3.9 5.2H6z',
      zip: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-2 16h-2v-2h2zm0-4h-2v-2h2zm0-4h-2V8h2zm0-4h-2V4h2z',
      estrela: 'm12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.1-.6L12 2 9.1 8.7 2 9.3l5.4 4.7-1.6 7z',
      pausa: 'M6 5h4v14H6zm8 0h4v14h-4z', ant: 'M6 6h2v12H6zm3.5 6 8.5 6V6z', prox: 'M6 18l8.5-6L6 6zm10-12h2v12h-2z',
      volta: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z', avanca: 'M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z',
      fone: 'M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h3v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h3a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z',
      lua: 'M12.3 2a10 10 0 1 0 9.7 12.5A8 8 0 0 1 12.3 2z'
    };
    function ico(n, tam) { // <svg> inline: herda a cor do texto (currentColor)
      return '<svg viewBox="0 0 24 24" width="' + (tam || 18) + '" height="' + (tam || 18) + '" fill="currentColor" aria-hidden="true"><path d="' + P[n] + '"/></svg>';
    }

    // ---------------- formatos ----------------
    function dur(seg) {
      seg = Number(seg || 0); if (!seg) return '';
      if (seg < 60) return seg + ' s';            // aula curta virava "0 min"
      var m = Math.round(seg / 60);
      return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '') : m + ' min';
    }
    function tam(b) {
      b = Number(b || 0); if (!b) return '';
      return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    }
    function barra(pct, cls) { return '<div class="al-barra ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, Number(pct) || 0)) + '%"></i></div>'; }
    function capaCss(p) { return p && p.capa_media_id ? 'background-image:url(/academy/api/media/' + esc(p.capa_media_id) + ')' : ''; }
    function capaPub(p) { return p && p.capa_media_id ? 'background-image:url(/academy/capa/' + esc(p.id) + '?v=' + esc(p.capa_media_id) + ')' : ''; }
    var ICO_TIPO = { video: 'play', pdf: 'doc', audio: 'som', arquivo: 'baixar', link: 'elo', texto: 'texto' };
    function icoMaterial(m) {
      var mi = String(m.mime || '');
      if (mi.indexOf('pdf') >= 0) return ['pdf', 'doc', 'PDF'];
      if (mi.indexOf('zip') >= 0) return ['zip', 'zip', 'ZIP'];
      if (mi.indexOf('image') === 0) return ['img', 'img', 'Imagem'];
      if (mi.indexOf('audio') === 0) return ['som', 'som', 'Áudio'];
      return ['', 'doc', 'Arquivo'];
    }
    // preferência local (não é dado do servidor): avanço automático ao fim do vídeo
    function pref(k, v) {
      try { if (v === undefined) return localStorage.getItem('al-' + k); localStorage.setItem('al-' + k, v); } catch (e) { return null; }
    }

    // ================= BIBLIOTECA =================
    function biblioteca() {
      limparTutor();
      document.body.classList.remove('aluno-amplo');
      api('GET', '/aluno/biblioteca').then(function (d) {
        var cursos = d.cursos || [];
        var h = '<div class="al">';
        // o cabeçalho do painel já diz "Meus cursos": aqui vai só o contexto
        h += cursos.length
          ? '<div class="al-topo"><p class="al-sub">' + cursos.length + ' curso' + (cursos.length > 1 ? 's' : '') + ' na sua biblioteca</p></div>'
          : '';

        if (d.continuar) {
          h += '<div class="al-retomar"><div class="capa" style="' + capaCss(d.continuar) + '"></div><div class="txt">' +
            '<p class="al-rotulo">Continuar de onde parou</p>' +
            '<h3>' + esc(d.continuar.produto_titulo) + '</h3>' +
            '<p class="aula">' + ico('play', 15) + ' ' + esc(d.continuar.aula_titulo) + '</p>' +
            '<button class="al-bt" data-curso="' + esc(d.continuar.product_id) + '" data-aula="' + esc(d.continuar.lesson_id || '') + '">' +
            ico('play') + ' Retomar a aula</button></div></div>';
        }

        if (!cursos.length) {
          h += '<div class="al-vazio">' + ico('chapeu', 34) + '<h3 style="margin:10px 0 6px">Sua biblioteca está esperando o primeiro curso</h3>' +
            '<p class="al-sub">Aqui ficam os cursos que você comprou ou recebeu de cortesia.</p>' +
            '<p style="margin-top:14px"><a class="al-bt" href="/academy/marketplace">Ver os cursos disponíveis</a></p>' +
            (D.me() && (D.me().papeis_ativos || []).indexOf('produtor') >= 0
              ? '<p class="al-fino" style="margin-top:12px">Curso que <b>você criou</b> não aparece aqui — ele fica em 🎬 Produtor → Meus produtos.</p>' : '') + '</div>';
        } else {
          h += '<div class="al-grade">' + cursos.map(function (c) {
            var p = c.progresso || { pct: 0, concluidas: 0, total_aulas: 0 };
            return '<div class="al-curso" data-curso="' + esc(c.product_id) + '">' +
              '<div class="capa" style="' + capaCss(c) + '">' + (c.capa_media_id ? '' : '<span class="vazia">' + ico('chapeu', 40) + '</span>') +
              (c.origem === 'cortesia' ? '<span class="selo">🎁 cortesia</span>' : (p.pct === 100 ? '<span class="selo">✓ concluído</span>' : '')) + '</div>' +
              '<div class="corpo"><h4>' + esc(c.titulo) + '</h4>' +
              '<p class="al-fino">' + p.concluidas + ' de ' + p.total_aulas + ' conteúdos</p>' +
              barra(p.pct, 'fina') +
              '<div class="rod"><span class="al-pct">' + p.pct + '%</span>' +
              '<span class="al-bt peq">' + (p.pct > 0 ? 'Continuar' : 'Começar') + ' ' + ico('dir', 15) + '</span></div></div></div>';
          }).join('') + '</div>';
        }

        if ((d.assinaturas || []).length) {
          h += '<div class="al-secao"><h3>Minhas assinaturas</h3></div><div class="al-caixa" style="padding:6px 18px">' +
            d.assinaturas.map(function (a) {
              return '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid var(--al-borda2)">' +
                '<b>' + esc(a.produto_titulo) + '</b><span class="al-fino">' + brl(a.valor_centavos) + '/mês · ' + esc(D.STATUS_ASSINATURA[a.status] || a.status) + '</span>' +
                (a.status === 'ativa' ? '<span style="margin-left:auto;display:flex;gap:8px">' +
                  '<button class="al-bt peq" data-curso="' + esc(a.product_id) + '">Abrir clube</button>' +
                  '<button class="al-bt peq fan" data-cancsub="' + esc(a.id) + '">Cancelar</button></span>' : '') + '</div>';
            }).join('') + '</div>';
        }
        h += '<div id="al-recs"></div></div>';
        setView(h);
        ligarCartoes();
        Array.prototype.forEach.call(document.querySelectorAll('[data-cancsub]'), function (b) {
          b.onclick = function () {
            if (!confirm('Cancelar a assinatura? O acesso ao clube termina agora.')) return;
            api('POST', '/assinaturas/' + b.getAttribute('data-cancsub') + '/cancelar').then(biblioteca).catch(function (e) { alert(e.message); });
          };
        });
        recomendados('', 'al-recs', cursos.length ? 'Continue sua formação' : 'Comece por aqui');
        if (D.aoMontarBiblioteca) D.aoMontarBiblioteca();
      }).catch(erroBox);
    }

    function ligarCartoes(raiz) {
      Array.prototype.forEach.call((raiz || document).querySelectorAll('[data-curso]'), function (b) {
        b.onclick = function (e) { e.preventDefault(); abrirCurso(b.getAttribute('data-curso'), b.getAttribute('data-aula') || ''); };
      });
    }

    // recomendações: cursos parecidos com o que o aluno já tem (ou com o curso aberto)
    function recomendados(pid, alvoId, titulo) {
      api('GET', '/aluno/recomendados' + (pid ? '?product_id=' + encodeURIComponent(pid) : '')).then(function (r) {
        var alvo = el(alvoId); if (!alvo || !(r.cursos || []).length) return;
        alvo.innerHTML = '<div class="al-secao"><h3>' + esc(titulo) + '</h3>' +
          '<a class="al-fino" href="/academy/marketplace" style="color:var(--al-ambar2)">ver o marketplace →</a></div>' +
          '<div class="al-rec">' + r.cursos.map(function (c) {
            var preco = c.preco_promo_centavos
              ? '<s>' + brl(c.preco_centavos) + '</s>' + brl(c.preco_promo_centavos)
              : (c.preco_centavos ? brl(c.preco_centavos) : 'Grátis');
            return '<a href="/academy/cursos/' + esc(c.slug) + '"><div class="capa" style="' + capaPub(c) + '"></div>' +
              '<div class="corpo"><span class="motivo">' + esc(c.motivo) + '</span>' +
              '<h4 style="font-size:1rem;font-family:Lora,serif;color:var(--al-navy)">' + esc(c.titulo) + '</h4>' +
              '<p class="al-fino">' + esc(c.descricao_curta || c.subtitulo || '') + '</p>' +
              '<span class="al-preco">' + preco + '</span></div></a>';
          }).join('') + '</div>';
      }).catch(function () { /* recomendação é extra: falhar aqui não pode derrubar a tela */ });
    }

    // ================= ESTÚDIO =================
    function abrirCurso(pid, aulaId) {
      if (!C || C.pid !== pid) limparTutor();
      api('GET', '/aluno/cursos/' + pid).then(function (d) {
        C = estadoDoCurso(pid, d);
        var aulas = C.aulas;
        carregarInterativo(pid);
        document.body.classList.add('aluno-amplo');
        pintarEstudio();
        var alvo = -1;
        if (aulaId) alvo = indiceDe(aulaId);
        if (alvo < 0) { // primeira não concluída e liberada; senão, a primeira liberada
          for (var k = 0; k < aulas.length; k++) {
            var x = aulas[k].a;
            if (x.liberada && !(C.pa[x.id] && C.pa[x.id].concluida)) { alvo = k; break; }
          }
        }
        if (alvo < 0) for (var j = 0; j < aulas.length; j++) if (aulas[j].a.liberada) { alvo = j; break; }
        if (alvo >= 0) irParaAula(alvo, true);
      }).catch(erroBox);
    }

    function estadoDoCurso(pid, d) {
      var aulas = [];
      (d.estrutura || []).forEach(function (m) {
        (m.aulas || []).forEach(function (a) { aulas.push({ a: a, mod: m }); });
      });
      return { pid: pid, d: d, aulas: aulas, pa: d.progresso_aulas || {}, i: -1 };
    }
    function indiceDe(id) {
      for (var k = 0; k < C.aulas.length; k++) if (C.aulas[k].a.id === id) return k;
      return -1;
    }
    function concluida(a) { return !!(C.pa[a.id] && C.pa[a.id].concluida); }
    function proximaLiberada(de, passo) {
      for (var k = de + passo; k >= 0 && k < C.aulas.length; k += passo) if (C.aulas[k].a.liberada) return k;
      return -1;
    }

    function pintarEstudio() {
      var d = C.d, p = d.produto, pr = d.progresso || { pct: 0, concluidas: 0, total_aulas: 0 };
      var totalSeg = 0;
      C.aulas.forEach(function (x) { totalSeg += Number(x.a.duracao_seg || 0); });
      var h = '<div class="al">' +
        '<a href="#" class="al-volta" id="al-volta">' + ico('esq', 16) + ' Minha biblioteca</a>' +
        '<div class="est-cab"><p class="al-rotulo">' + esc(D.TIPOS_PROD[p.tipo] ? D.TIPOS_PROD[p.tipo].replace(/^\S+\s/, '') : p.tipo) + '</p>' +
        '<h2>' + esc(p.titulo) + '</h2>' +
        '<div class="meta">' +
        (p.produtor_nome ? '<span>' + ico('chapeu', 15) + ' ' + esc(p.produtor_nome) + '</span>' : '') +
        '<span>' + ico('texto', 15) + ' ' + C.d.estrutura.length + ' aulas</span>' +
        (C.aulas.length > C.d.estrutura.length ? '<span>' + ico('play', 15) + ' ' + C.aulas.length + ' conteúdos</span>' : '') +
        (totalSeg ? '<span>' + ico('relogio', 15) + ' ' + dur(totalSeg) + ' de conteúdo</span>' : '') +
        '</div>' + botaoAudiobook(d.audiobook) + '<div id="al-extras"></div></div>' +
        (d.matriculado ? '' : '<div class="aviso">Você não está matriculado — só as aulas de degustação estão liberadas. ' +
          '<a href="/academy/cursos/' + esc(p.slug || '') + '">Ver a página do curso →</a></div>') +
        '<div class="est"><div class="est-palco">' +
        '<div class="palco"><div class="quadro" id="al-quadro"></div><div class="legenda" id="al-legenda"></div></div>' +
        '<div class="est-nav" id="al-nav"></div></div>' +
        '<aside class="grade">' +
        '<div class="grade-cab"><h4>' + esc(p.titulo) + '</h4>' + barra(pr.pct, 'esc') +
        '<div class="nums"><span id="al-prog-txt">' + pr.concluidas + ' de ' + pr.total_aulas + ' conteúdos</span><b id="al-prog-pct" style="color:#fff">' + pr.pct + '%</b></div></div>' +
        '<div class="grade-busca">' + ico('lupa', 15) + ' <input id="al-busca" placeholder="Buscar aula neste curso" style="display:inline-block;width:calc(100% - 26px);margin-left:4px"></div>' +
        '<div class="grade-corpo" id="al-grade"></div></aside>' +
        '<div class="est-baixo"><div class="est-abas" id="al-abas"></div><div class="est-painel" id="al-painel"></div>' +
        '<div id="al-fim"></div></div></div></div>';
      setView(h);
      el('al-volta').onclick = function (e) { e.preventDefault(); biblioteca(); };
      if (el('al-ab')) el('al-ab').onclick = function () { abrirAudiobook(); };
      el('al-busca').oninput = function () { pintarGrade(this.value); };
      pintarGrade('');
      ligarTeclado();
      pintarExtras();
      montarTutor();
    }

    function pintarGrade(filtro) {
      var f = String(filtro || '').toLowerCase().trim();
      var h = C.d.estrutura.map(function (m, im) {
        var aulas = (m.aulas || []).filter(function (a) { return !f || a.titulo.toLowerCase().indexOf(f) >= 0; });
        if (!aulas.length) return '';
        var feitas = (m.aulas || []).filter(concluida).length;
        var aberto = f || !C.aulas[C.i] || C.aulas[C.i].mod.id === m.id || true; // módulos abertos por padrão
        return '<div class="mod' + (aberto ? '' : ' fechado') + '" data-mod="' + im + '">' +
          '<button class="mod-cab">' + ico('seta', 16) + '<span>' + esc(m.titulo) + '</span>' +
          '<span class="qt">' + feitas + '/' + (m.aulas || []).length + '</span></button>' +
          '<div class="mod-aulas">' + aulas.map(function (a) {
            var k = indiceDe(a.id), fez = concluida(a), ativa = k === C.i;
            var icone = !a.liberada ? 'lock' : (fez ? 'check' : (ICO_TIPO[a.tipo] || 'doc'));
            return '<button class="aula' + (fez ? ' feita' : '') + (ativa ? ' ativa' : '') + (a.liberada ? '' : ' travada') + '" data-i="' + k + '"' + (a.liberada ? '' : ' disabled') + '>' +
              '<span class="ic">' + ico(icone, 17) + '</span>' +
              '<span class="tit">' + esc(a.titulo) +
              (a.gratuita && !C.d.matriculado ? '<span class="marca">degustação</span>' : '') +
              ((a.materiais || []).length ? ' <span class="al-fino">· ' + a.materiais.length + (a.materiais.length > 1 ? ' materiais' : ' material') + '</span>' : '') +
              '</span>' + (a.duracao_seg ? '<span class="dur">' + dur(a.duracao_seg) + '</span>' : '') + '</button>' +
              (a.liberada && (a.materiais || []).length ? '<div class="aula-mats">' + a.materiais.map(function (m, km) {
                var t = icoMaterial(m);
                return '<button class="aula-mat" data-i="' + k + '" data-m="' + km + '" title="' + esc(m.nome) + '">' + ico(t[1], 14) +
                  '<span>' + esc(rotuloCurto(m.nome)) + '</span><em>' + t[2] + '</em></button>';
              }).join('') + '</div>' : '');
          }).join('') + '</div></div>';
      }).join('');
      el('al-grade').innerHTML = h || '<p class="al-fino" style="padding:14px">Nenhuma aula com esse termo.</p>';
      Array.prototype.forEach.call(el('al-grade').querySelectorAll('.mod-cab'), function (b) {
        b.onclick = function () { b.parentNode.classList.toggle('fechado'); };
      });
      Array.prototype.forEach.call(el('al-grade').querySelectorAll('.aula[data-i]'), function (b) {
        b.onclick = function () { irParaAula(Number(b.getAttribute('data-i')), false); };
      });
      Array.prototype.forEach.call(el('al-grade').querySelectorAll('.aula-mat'), function (b) {
        b.onclick = function () {
          var x = C.aulas[Number(b.getAttribute('data-i'))];
          abrirMaterial(x, x.a.materiais[Number(b.getAttribute('data-m'))]);
        };
      });
    }

    function irParaAula(i, primeira) {
      if (i < 0 || i >= C.aulas.length) return;
      C.i = i;
      var a = C.aulas[i].a;
      pintarPalco(a);
      pintarNav(i);
      pintarAbas(a);
      pintarGrade(el('al-busca') ? el('al-busca').value : '');
      var ativo = el('al-grade').querySelector('.aula.ativa');
      if (ativo && ativo.scrollIntoView) ativo.scrollIntoView({ block: 'nearest' });
      if (!primeira) {
        var topo = document.querySelector('.est-palco');
        if (topo && topo.scrollIntoView) topo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // ---- palco: vídeo nativo (URL assinada), embed, PDF inline, áudio, arquivo, link ----
    function pintarPalco(a) {
      var q = el('al-quadro'), lg = el('al-legenda');
      var media = a.media_id ? '/academy/api/media/' + a.media_id : '';
      lg.innerHTML = '';
      if (a.tipo === 'video' && a.media_id) {
        q.innerHTML = '<div class="vazio">' + ico('play', 30) + '<p>Carregando o vídeo…</p></div>';
        api('GET', '/media/' + a.media_id + '/link').then(function (r) {
          if (C.aulas[C.i].a.id !== a.id) return; // o aluno já trocou de aula
          q.innerHTML = '<video id="al-video" controls playsinline preload="metadata" src="' + esc(r.url) + '"></video>';
          ligarVideo(a);
        }).catch(function (e) { q.innerHTML = '<div class="vazio"><p>' + esc(e.message) + '</p></div>'; });
        legendaVideo();
      } else if (a.tipo === 'video') {
        var emb = embedDe(a.url_externa);
        q.innerHTML = emb ? '<iframe src="' + esc(emb) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>'
          : (a.url_externa ? '<div class="vazio">' + ico('play', 30) + '<p><a class="al-bt" href="' + esc(a.url_externa) + '" target="_blank" rel="noopener">Assistir ao vídeo</a></p></div>'
            : '<div class="vazio">' + ico('play', 30) + '<p>O vídeo desta aula ainda está sendo publicado.</p></div>');
        if (emb) legendaVideo();
      } else if (a.tipo === 'pdf' && media) {
        q.innerHTML = '<iframe class="doc" src="' + media + '#view=FitH"></iframe>';
        lg.innerHTML = '<span>' + ico('doc', 14) + ' Documento da aula</span>' +
          '<a class="al-bt peq esc" href="' + media + '" target="_blank" rel="noopener">' + ico('baixar', 15) + ' Abrir em tela cheia</a>';
      } else if (a.tipo === 'audio' && media) {
        q.innerHTML = '<div class="vazio" style="aspect-ratio:auto;padding:38px 20px">' + ico('som', 30) +
          '<audio id="al-video" controls style="width:100%;max-width:560px" src="' + media + '"></audio></div>';
        ligarVideo(a);
      } else if (a.tipo === 'arquivo' && media) {
        q.innerHTML = '<div class="vazio">' + ico('baixar', 30) + '<p><a class="al-bt" href="' + media + '" target="_blank" rel="noopener">Abrir o arquivo da aula</a></p></div>';
      } else if (a.tipo === 'link' && a.url_externa) {
        q.innerHTML = '<div class="vazio">' + ico('elo', 30) + '<p><a class="al-bt" href="' + esc(a.url_externa) + '" target="_blank" rel="noopener">Abrir o conteúdo</a></p></div>';
      } else {
        q.innerHTML = '<div class="vazio">' + ico('texto', 30) + '<p>Aula de leitura — o conteúdo está logo abaixo.</p></div>';
      }
    }
    function legendaVideo() {
      var auto = pref('auto') !== '0';
      el('al-legenda').innerHTML = '<label><input type="checkbox" id="al-auto"' + (auto ? ' checked' : '') + '> Avançar para a próxima aula automaticamente</label>' +
        '<span class="al-fino" style="color:#93A3BE">O link do vídeo é temporário e pessoal</span>';
      el('al-auto').onchange = function () { pref('auto', this.checked ? '1' : '0'); };
    }
    function embedDe(url) {
      var m = String(url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,20})/);
      if (m) return 'https://www.youtube.com/embed/' + m[1];
      m = String(url || '').match(/vimeo\.com\/(\d+)/);
      if (m) return 'https://player.vimeo.com/video/' + m[1];
      return null;
    }
    // retoma do ponto em que parou, conclui sozinho perto do fim e avança quando termina
    function ligarVideo(a) {
      var v = el('al-video'); if (!v) return;
      var chave = 'pos-' + a.id, ultimo = 0, marcou = false;
      var pos = Number(pref(chave) || 0);
      if (pos > 10) v.currentTime = pos;
      v.addEventListener('play', function () { if (AB.audio && !AB.audio.paused) AB.audio.pause(); }); // um som de cada vez
      v.ontimeupdate = function () {
        if (!v.duration) return;
        if (v.currentTime - ultimo > 5) { ultimo = v.currentTime; pref(chave, v.currentTime < v.duration - 15 ? String(Math.floor(v.currentTime)) : '0'); }
        if (!marcou && v.currentTime / v.duration > 0.92 && !concluida(a)) { marcou = true; marcar(a, true, false); }
      };
      v.onended = function () {
        pref(chave, '0');
        if (!concluida(a)) marcar(a, true, false);
        var p = proximaLiberada(C.i, 1);
        if (p >= 0 && (!el('al-auto') || el('al-auto').checked)) irParaAula(p, false);
      };
    }

    // ---- navegação entre aulas ----
    function pintarNav(i) {
      var ant = proximaLiberada(i, -1), pro = proximaLiberada(i, 1), a = C.aulas[i].a, fez = concluida(a);
      var podeMarcar = C.d.matriculado || a.gratuita;
      var h = ant >= 0
        ? '<a href="#" class="pula" id="al-ant">' + ico('esq', 18) + '<span><small>Anterior</small><b>' + esc(C.aulas[ant].a.titulo) + '</b></span></a>'
        : '<span class="pula vazia"></span>';
      h += '<span>' + (podeMarcar
        ? '<button class="al-bt ' + (fez ? 'fan' : 'ok') + '" id="al-feito">' + (fez ? ico('check', 16) + ' Aula concluída' : ico('check', 16) + ' Concluir' + (pro >= 0 ? ' e avançar' : '')) + '</button>'
        : '') + '</span>';
      h += '<span class="dir">' + (pro >= 0
        ? '<a href="#" class="pula" id="al-pro"><span><small>Próxima aula</small><b>' + esc(C.aulas[pro].a.titulo) + '</b></span>' + ico('dir', 18) + '</a>'
        : '<span class="pula vazia"></span>') + '</span>';
      el('al-nav').innerHTML = h;
      if (el('al-ant')) el('al-ant').onclick = function (e) { e.preventDefault(); irParaAula(ant, false); };
      if (el('al-pro')) el('al-pro').onclick = function (e) { e.preventDefault(); irParaAula(pro, false); };
      if (el('al-feito')) el('al-feito').onclick = function () { marcar(a, !fez, !fez); };
    }

    // marca/desmarca a aula. `avancar` só no clique humano — o auto-marcar do vídeo
    // não pode arrastar o aluno para outra aula no meio da que ele está vendo.
    function marcar(a, valor, avancar) {
      api('POST', '/aluno/aulas/' + a.id + '/progresso', { concluida: valor }).then(function () {
        C.pa[a.id] = C.pa[a.id] || {};
        C.pa[a.id].concluida = valor ? 1 : 0;
        var feitas = 0;
        C.aulas.forEach(function (x) { if (concluida(x.a)) feitas++; });
        var pct = C.aulas.length ? Math.round(feitas * 100 / C.aulas.length) : 0;
        C.d.progresso = { concluidas: feitas, total_aulas: C.aulas.length, pct: pct };
        var bt = document.querySelector('.grade-cab .al-barra i'); if (bt) bt.style.width = pct + '%';
        if (el('al-prog-txt')) el('al-prog-txt').textContent = feitas + ' de ' + C.aulas.length + ' conteúdos';
        if (el('al-prog-pct')) el('al-prog-pct').textContent = pct + '%';
        pintarGrade(el('al-busca') ? el('al-busca').value : '');
        pintarNav(C.i);
        pintarFim();
        if (avancar) { var p = proximaLiberada(C.i, 1); if (p >= 0) irParaAula(p, false); }
      }).catch(function (e) { alert(e.message); });
    }

    // ---- abas: visão geral · material complementar · tutor ----
    function pintarAbas(a) {
      var mats = materiaisDaAula(a);
      var abas = [['geral', 'Visão geral', 0], ['mat', 'Material complementar', mats.length]];
      var I = C.int || {};
      if (aulaComExtra(a, 'quiz')) abas.push(['quiz', 'Quiz', 0]);
      if (aulaComExtra(a, 'caderno')) abas.push(['caderno', 'Caderno de trabalho', 0]);
      if (I.prompts) abas.push(['prompts', 'Prompts do curso', I.prompts]);
      abas.push(['ia', 'Tutor Villela', 0]);
      el('al-abas').innerHTML = abas.map(function (x, k) {
        return '<button data-aba="' + x[0] + '"' + (k === 0 ? ' class="on"' : '') + '>' + esc(x[1]) +
          (x[2] ? '<span class="cont">' + x[2] + '</span>' : '') + '</button>';
      }).join('');
      Array.prototype.forEach.call(el('al-abas').querySelectorAll('button'), function (b) {
        b.onclick = function () {
          Array.prototype.forEach.call(el('al-abas').querySelectorAll('button'), function (o) { o.classList.remove('on'); });
          b.classList.add('on');
          painel(b.getAttribute('data-aba'), a);
        };
      });
      painel('geral', a);
      pintarFim();
    }

    function cartaoMaterial(m, origem) {
      var t = icoMaterial(m), u = '/academy/api/media/' + esc(m.media_id);
      return '<a class="mat" href="' + u + '" target="_blank" rel="noopener" download>' +
        '<span class="ic ' + t[0] + '">' + ico(t[1], 22) + '</span>' +
        '<span class="nm"><b>' + esc(m.nome) + '</b><span>' + t[2] + (tam(m.tamanho) ? ' · ' + tam(m.tamanho) : '') +
        (origem ? ' · ' + esc(origem) : '') + '</span></span>' +
        '<span class="baixar">' + ico('baixar', 20) + '</span></a>';
    }
    function materiaisDoCurso() {
      var fora = [];
      C.aulas.forEach(function (x) {
        (x.a.materiais || []).forEach(function (m) { fora.push({ nome: m.nome, media_id: m.media_id, mime: m.mime, tamanho: m.tamanho, aula: x.a.titulo }); });
      });
      return fora;
    }

    function painel(aba, a) {
      var alvo = el('al-painel');
      if (aba === 'geral') {
        alvo.innerHTML = '<h3 style="font-size:1.18rem;margin-bottom:10px">' + esc(a.titulo) + '</h3>' +
          (a.conteudo ? '<div style="white-space:pre-wrap">' + esc(a.conteudo) + '</div>'
            : '<p class="al-sub">Esta aula não tem texto de apoio. Use o material complementar e o tutor para aprofundar.</p>') +
          '<p class="al-dica" style="margin-top:18px">Atalhos: <kbd>←</kbd> <kbd>→</kbd> trocam de aula · <kbd>C</kbd> conclui</p>';
        return;
      }
      if (aba === 'quiz') return painelQuiz(alvo, a);
      if (aba === 'caderno') return painelCaderno(alvo, a);
      if (aba === 'prompts') return painelPrompts(alvo);
      if (aba === 'ia') { alvo.innerHTML = ''; abrirTutor(); return; }
      if (aba === 'mat') {
        var mats = materiaisDaAula(a), todos = materiaisDoCurso();
        var h = mats.length
          ? '<p class="al-sub" style="margin-bottom:14px">' + mats.length + ' arquivo' + (mats.length > 1 ? 's' : '') + ' desta aula — artigo, slides e o que mais acompanha o vídeo. Abra aqui ou baixe para estudar.</p>' +
            '<div class="mats">' + mats.map(cartaoMaterial).join('') + '</div>'
          : '<div class="mats-vazio">' + ico('doc', 26) + '<p style="margin:8px 0 0">Esta aula não tem material próprio.</p></div>';
        // A biblioteca do curso resolve a pergunta que toda plataforma deixa sem resposta:
        // "onde estava aquele PDF?". Todos os arquivos do curso, com a aula de origem.
        if (todos.length) {
          h += '<div class="al-secao" style="margin:26px 0 10px"><h3 style="font-size:1.05rem">Biblioteca do curso</h3>' +
            '<button class="al-bt peq fan" id="al-bib-bt">' + todos.length + ' arquivos · mostrar</button></div>' +
            '<div id="al-bib" style="display:none"></div>';
        }
        alvo.innerHTML = h;
        if (el('al-bib-bt')) el('al-bib-bt').onclick = function () {
          var cx = el('al-bib'), aberto = cx.style.display !== 'none';
          cx.style.display = aberto ? 'none' : 'block';
          this.textContent = todos.length + ' arquivos · ' + (aberto ? 'mostrar' : 'esconder');
          if (!aberto && !cx.innerHTML) {
            cx.innerHTML = '<div class="mats">' + todos.map(function (m) {
              return cartaoMaterial(m, m.aula);
            }).join('') + '</div>';
          }
        };
        return;
      }
    }

    // ================= EXPERIÊNCIA DE APRENDIZAGEM =================
    // Material da AULA = o de todos os itens do mesmo módulo. Nos cursos da casa o
    // vídeo (N.1) não tem arquivo próprio: artigo, slides e .pptx ficam no item N.2 —
    // e o aluno, parado no vídeo, via a aba vazia e achava que não havia slides.
    function materiaisDaAula(a) {
      var x = C.aulas[indiceDe(a.id)], vistos = {}, out = [];
      var irmas = x ? (x.mod.aulas || []) : [a];
      irmas.forEach(function (b) {
        if (!b.liberada) return;
        (b.materiais || []).forEach(function (m) {
          if (vistos[m.media_id]) return;
          vistos[m.media_id] = 1; out.push(m);
        });
      });
      return out;
    }
    function rotuloCurto(nome) { // "Slides da aula 3 — Prompts… (PDF)" → "Slides"
      var n = String(nome || '');
      if (/^apresenta[cç][aã]o edit/i.test(n)) return 'Apresentação editável';
      var m = n.match(/^(Artigo|Slides|Resumo|Checklist|Caderno|Mapa|Guia|Livro|Planilha|Modelo)/i);
      var extra = /revisad/i.test(n) ? ' (revisado)' : '';
      return (m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : n.replace(/\s*\([^)]*\)\s*$/, '').slice(0, 40)) + extra;
    }
    // abre um material no palco (PDF inline); o resto baixa
    function abrirMaterial(x, m) {
      if (!x || !m) return;
      var u = '/academy/api/media/' + m.media_id, t = icoMaterial(m);
      if (t[0] !== 'pdf') { window.open(u, '_blank', 'noopener'); return; }
      if (C.i !== indiceDe(x.a.id)) irParaAula(indiceDe(x.a.id), false);
      el('al-quadro').innerHTML = '<iframe class="doc" src="' + u + '#view=FitH" title="' + esc(m.nome) + '"></iframe>';
      el('al-legenda').innerHTML = '<span>' + ico('doc', 14) + ' ' + esc(m.nome) + '</span>' +
        '<a class="al-bt peq esc" href="' + u + '" target="_blank" rel="noopener">' + ico('baixar', 15) + ' Abrir em tela cheia</a>';
      var topo = document.querySelector('.est-palco');
      if (topo && topo.scrollIntoView) topo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // quiz/caderno são por AULA (módulo): vale o que estiver em qualquer item dele
    function aulaComExtra(a, tipo) {
      var I = C.int || {}, mapa = I[tipo] || {}, x = C.aulas[indiceDe(a.id)];
      if (mapa[a.id]) return a.id;
      var irmas = x ? (x.mod.aulas || []) : [];
      for (var k = 0; k < irmas.length; k++) if (mapa[irmas[k].id]) return irmas[k].id;
      return '';
    }
    function carregarInterativo(pid) {
      api('GET', '/aluno/cursos/' + pid + '/interativo').then(function (r) {
        if (!C || C.pid !== pid) return;
        C.int = r;
        pintarExtras();
        if (C.i >= 0) pintarAbas(C.aulas[C.i].a);
        montarTutor();
      }).catch(function () { /* sem a camada interativa o curso segue igual */ });
    }
    function selo(st) { return st === 'rascunho' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : ''; }

    // ---- extras do curso: "em breve" / disponível (ex.: VERIDICA Cases) ----
    function pintarExtras() {
      var alvo = el('al-extras'); if (!alvo) return;
      var I = C.int || {}, ex = I.extras || [], h = '';
      if (I.prompts || aulaAlgumaCom('caderno')) {
        h += '<div class="int-atalhos">' +
          (I.prompts ? '<button class="al-bt peq fan" id="al-prompts-bt">' + ico('texto', 15) + ' Biblioteca de prompts · ' + I.prompts + '</button>' : '') +
          (aulaAlgumaCom('caderno') ? '<a class="al-bt peq fan" href="/academy/aluno/caderno/' + esc(C.pid) + '" target="_blank" rel="noopener">' + ico('doc', 15) + ' Meu caderno de trabalho</a>' : '') +
          '</div>';
      }
      if (ex.length) {
        h += '<div class="int-extras">' + ex.map(function (x) {
          var breve = x.status !== 'disponivel';
          var corpo = '<span class="ex-selo">' + (breve ? 'Em breve' : 'Disponível') + '</span><b>' + esc(x.titulo) + '</b>' +
            (x.descricao ? '<span>' + esc(x.descricao) + '</span>' : '');
          return breve || !x.url ? '<div class="ex' + (breve ? ' breve' : '') + '">' + corpo + '</div>'
            : '<a class="ex" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + corpo + '</a>';
        }).join('') + '</div>';
      }
      alvo.innerHTML = h;
      if (el('al-prompts-bt')) el('al-prompts-bt').onclick = function () {
        var b = el('al-abas') && el('al-abas').querySelector('[data-aba="prompts"]');
        if (b) { b.click(); var y = el('al-abas'); if (y.scrollIntoView) y.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      };
    }
    function aulaAlgumaCom(tipo) { var m = (C.int || {})[tipo] || {}; for (var k in m) if (m.hasOwnProperty(k)) return true; return false; }

    // ---- QUIZ: responde tudo, o servidor corrige e explica cada alternativa ----
    var TIPO_Q = { conhecimento: 'Conhecimento', aplicacao: 'Aplicação', decisao: 'Decisão' };
    function painelQuiz(alvo, a) {
      var lid = aulaComExtra(a, 'quiz');
      alvo.innerHTML = '<p class="al-sub">Carregando o quiz…</p>';
      api('GET', '/aluno/aulas/' + lid + '/quiz').then(function (q) {
        var esc2 = {};
        var h = '<div class="qz-cab"><div><h3 style="font-size:1.15rem">Quiz da aula' + selo(q.status) + '</h3>' +
          '<p class="al-sub">' + q.questoes.length + ' questões: entender, aplicar e decidir. Depois de responder você vê o porquê de cada alternativa.</p></div>' +
          (q.tentativas && q.tentativas.length ? '<span class="qz-melhor">Última: ' + q.tentativas[0].acertos + '/' + q.tentativas[0].total + '</span>' : '') + '</div>' +
          q.questoes.map(function (x, i) {
            return '<fieldset class="qz" data-q="' + esc(x.id) + '"><legend><span class="qz-tipo ' + esc(x.tipo) + '">' + (TIPO_Q[x.tipo] || x.tipo) + '</span> ' +
              (i + 1) + '. ' + esc(x.enunciado) + '</legend>' +
              x.alternativas.map(function (t, k) {
                return '<label class="qz-alt"><input type="radio" name="qz-' + esc(x.id) + '" value="' + k + '"><span>' + esc(t) + '</span></label>' +
                  '<div class="qz-exp" data-exp="' + esc(x.id) + '-' + k + '"></div>';
              }).join('') + '</fieldset>';
          }).join('') +
          '<div class="qz-rodape"><button class="al-bt" id="qz-enviar">Corrigir</button><span id="qz-res" class="qz-res"></span></div>';
        alvo.innerHTML = h;
        el('qz-enviar').onclick = function () {
          var resp = {}, falta = 0;
          q.questoes.forEach(function (x) {
            var m = alvo.querySelector('input[name="qz-' + x.id + '"]:checked');
            if (m) resp[x.id] = Number(m.value); else falta++;
          });
          if (falta) { el('qz-res').innerHTML = '<span class="erro">Falta' + (falta > 1 ? 'm ' : ' ') + falta + ' questão' + (falta > 1 ? 'ões' : '') + '.</span>'; return; }
          this.disabled = true;
          api('POST', '/aluno/aulas/' + lid + '/quiz', { respostas: resp }).then(function (r) {
            r.correcao.forEach(function (c) {
              var fs = alvo.querySelector('fieldset[data-q="' + c.id + '"]');
              Array.prototype.forEach.call(fs.querySelectorAll('.qz-alt'), function (lb, k) {
                lb.classList.toggle('certa', k === c.correta);
                lb.classList.toggle('errada', k === c.escolhida && !c.acertou);
                lb.querySelector('input').disabled = true;
              });
              c.explicacoes.forEach(function (ex, k) {
                var d = fs.querySelector('[data-exp="' + c.id + '-' + k + '"]');
                if (d && (k === c.correta || k === c.escolhida)) d.innerHTML = (k === c.correta ? '✔ ' : '✖ ') + esc(ex);
              });
              fs.classList.add(c.acertou ? 'ok' : 'nok');
            });
            var msg = r.pct === 100 ? 'Gabaritou! ' : (r.pct >= 70 ? 'Muito bem. ' : 'Vale rever a aula e tentar de novo. ');
            el('qz-res').innerHTML = '<b>' + r.acertos + ' de ' + r.total + '</b> (' + r.pct + '%) · ' + msg +
              '<button class="al-bt peq fan" id="qz-refazer">Refazer</button>';
            el('qz-refazer').onclick = function () { painelQuiz(alvo, a); };
            if (C.int && C.int.quiz && C.int.quiz[lid]) C.int.quiz[lid].melhor_pct = Math.max(C.int.quiz[lid].melhor_pct || 0, r.pct);
          }).catch(function (e) { el('qz-enviar').disabled = false; el('qz-res').innerHTML = '<span class="erro">' + esc(e.message) + '</span>'; });
        };
      }).catch(function (e) { alvo.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
    }

    // ---- CADERNO: Aprendi → Pratiquei → Apliquei → Resultado, salvo enquanto escreve ----
    function painelCaderno(alvo, a) {
      var lid = aulaComExtra(a, 'caderno');
      alvo.innerHTML = '<p class="al-sub">Carregando o caderno…</p>';
      api('GET', '/aluno/aulas/' + lid + '/caderno').then(function (d) {
        var c = d.caderno || {}, r = d.respostas || {};
        var ap = c.aprendi || {}, pr = c.pratiquei || {}, ae = c.apliquei || {}, rs = c.resultado || {};
        var campo = function (id, ph) {
          return '<textarea class="cd-campo" data-campo="' + id + '" rows="3" placeholder="' + esc(ph || 'Escreva aqui…') + '">' + esc(r[id] || '') + '</textarea>';
        };
        var h = '<div class="qz-cab"><div><h3 style="font-size:1.15rem">Caderno de trabalho' + selo(d.status) + '</h3>' +
          '<p class="al-sub">O que você aprendeu, praticou e aplicou nesta aula. Fica salvo enquanto você escreve.</p></div>' +
          '<a class="al-bt peq fan" href="/academy/aluno/caderno/' + esc(C.pid) + '" target="_blank" rel="noopener">' + ico('baixar', 15) + ' Caderno completo (PDF)</a></div>' +
          '<ol class="cd-etapas">' +
          '<li class="cd-e"><h4>1 · Aprendi</h4>' + (ap.resumo ? '<p>' + esc(ap.resumo) + '</p>' : '') +
          ((ap.pontos || []).length ? '<ul>' + ap.pontos.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</li>' +
          '<li class="cd-e"><h4>2 · Pratiquei</h4>' +
          ((pr.checklist || []).length ? '<div class="cd-chk">' + pr.checklist.map(function (x, i) {
            var id = 'check_' + (i + 1);
            return '<label><input type="checkbox" data-campo="' + id + '"' + (r[id] === '1' ? ' checked' : '') + '> ' + esc(x) + '</label>';
          }).join('') + '</div>' : '') +
          (pr.exercicio ? '<p><b>Exercício.</b> ' + esc(pr.exercicio) + '</p>' + campo('exercicio') : '') +
          (pr.prompt_modelo ? '<div class="cd-prompt"><div class="cd-prompt-cab"><b>Prompt modelo</b><button class="al-bt peq fan" data-copiar="1">Copiar</button></div><pre>' + esc(pr.prompt_modelo) + '</pre></div>' : '') + '</li>' +
          '<li class="cd-e"><h4>3 · Apliquei</h4>' + (ae.tarefas || []).map(function (t, i) {
            return '<p><b>Tarefa ' + (i + 1) + '.</b> ' + esc(t) + '</p>' + campo('tarefa_' + (i + 1));
          }).join('') + (ae.desafio ? '<p><b>Desafio.</b> ' + esc(ae.desafio) + '</p>' + campo('desafio') : '') + '</li>' +
          '<li class="cd-e"><h4>4 · Resultado</h4>' + (rs.esperado ? '<p class="al-sub"><b>O que se espera:</b> ' + esc(rs.esperado) + '</p>' : '') +
          campo('resultado', 'O que você conseguiu, o que mudou no seu trabalho, o que ainda falta…') + '</li></ol>' +
          '<p class="al-fino" id="cd-salvo" style="margin-top:8px"></p>';
        alvo.innerHTML = h;
        var timers = {};
        var salvar = function (id, texto) {
          el('cd-salvo').textContent = 'Salvando…';
          api('PUT', '/aluno/aulas/' + lid + '/caderno', { campo: id, texto: texto })
            .then(function () { el('cd-salvo').textContent = '✓ Salvo'; })
            .catch(function (e) { el('cd-salvo').textContent = e.message; });
        };
        Array.prototype.forEach.call(alvo.querySelectorAll('textarea[data-campo]'), function (t) {
          t.oninput = function () {
            var id = t.getAttribute('data-campo');
            clearTimeout(timers[id]);
            timers[id] = setTimeout(function () { salvar(id, t.value); }, 900);
          };
        });
        Array.prototype.forEach.call(alvo.querySelectorAll('input[type=checkbox][data-campo]'), function (t) {
          t.onchange = function () { salvar(t.getAttribute('data-campo'), t.checked ? '1' : ''); };
        });
        var cp = alvo.querySelector('[data-copiar]');
        if (cp) cp.onclick = function () { copiar(pr.prompt_modelo, cp); };
      }).catch(function (e) { alvo.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
    }
    function copiar(texto, bt) {
      var ok = function () { var t = bt.textContent; bt.textContent = '✓ Copiado'; setTimeout(function () { bt.textContent = t; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, function () { prompt('Copie o texto:', texto); });
      else prompt('Copie o texto:', texto);
    }

    // ---- BIBLIOTECA DE PROMPTS: Objetivo → Prompt → Exemplo → Como personalizar ----
    function painelPrompts(alvo) {
      alvo.innerHTML = '<p class="al-sub">Carregando a biblioteca…</p>';
      api('GET', '/aluno/cursos/' + C.pid + '/prompts').then(function (r) {
        var lista = r.prompts || [], cats = [];
        lista.forEach(function (p) { if (p.categoria && cats.indexOf(p.categoria) < 0) cats.push(p.categoria); });
        alvo.innerHTML = '<div class="qz-cab"><div><h3 style="font-size:1.15rem">Biblioteca de prompts</h3>' +
          '<p class="al-sub">' + lista.length + ' prompts do curso, prontos para copiar e adaptar.</p></div></div>' +
          '<div class="pr-filtros"><input id="pr-busca" placeholder="Buscar prompt…"><select id="pr-cat"><option value="">Todas as categorias</option>' +
          cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div><div id="pr-lista"></div>';
        var pinta = function () {
          var f = el('pr-busca').value.toLowerCase(), cat = el('pr-cat').value;
          var vis = lista.filter(function (p) {
            return (!cat || p.categoria === cat) && (!f || (p.titulo + ' ' + p.objetivo + ' ' + p.prompt).toLowerCase().indexOf(f) >= 0);
          });
          el('pr-lista').innerHTML = vis.map(function (p, i) {
            return '<details class="pr"' + (i === 0 && vis.length < 4 ? ' open' : '') + '><summary><span class="pr-cat">' + esc(p.categoria || 'Geral') + '</span><b>' + esc(p.titulo) + '</b>' + selo(p.status) + '</summary>' +
              (p.objetivo ? '<p><b>Objetivo.</b> ' + esc(p.objetivo) + '</p>' : '') +
              '<div class="cd-prompt"><div class="cd-prompt-cab"><b>Prompt</b><button class="al-bt peq fan" data-cp="' + esc(p.id) + '">Copiar</button></div><pre>' + esc(p.prompt) + '</pre></div>' +
              (p.exemplo ? '<p><b>Exemplo.</b> ' + esc(p.exemplo) + '</p>' : '') +
              (p.personalizar ? '<p><b>Como personalizar.</b> ' + esc(p.personalizar) + '</p>' : '') +
              (p.aula_ref ? '<p class="al-fino">Da aula: ' + esc(p.aula_ref) + '</p>' : '') + '</details>';
          }).join('') || '<p class="al-fino">Nenhum prompt com esse filtro.</p>';
          Array.prototype.forEach.call(el('pr-lista').querySelectorAll('[data-cp]'), function (b) {
            b.onclick = function (e) {
              e.preventDefault();
              var p = lista.filter(function (x) { return x.id === b.getAttribute('data-cp'); })[0];
              if (p) copiar(p.prompt, b);
            };
          });
        };
        el('pr-busca').oninput = pinta; el('pr-cat').onchange = pinta; pinta();
      }).catch(function (e) { alvo.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
    }

    // ================= TUTOR VILLELA =================
    // Esfera flutuante (a mesma linguagem visual da Eva no staff) + gaveta de conversa.
    // Aparece em toda a tela do curso; quem não comprou vê o convite e, na aula de
    // degustação, já conversa sobre ela.
    var T = { aberto: false, carregou: false, ocupado: false };
    function limparTutor() {
      ['tv-fab', 'tv-gaveta'].forEach(function (id) { var x = el(id); if (x && x.parentNode) x.parentNode.removeChild(x); });
      document.body.classList.remove('tv-aberto');
      T = { aberto: false, carregou: false, ocupado: false };
    }
    function montarTutor() {
      if (!C) return;
      if (!el('tv-fab')) {
        var b = document.createElement('button');
        b.id = 'tv-fab'; b.className = 'tv-fab'; b.setAttribute('aria-label', 'Abrir o Tutor Villela');
        b.innerHTML = '<span class="tv-halo"></span><span class="tv-orbe"><svg viewBox="0 0 24 24" width="26" height="26" fill="#fff" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.6 21l4.1-2.2c1 .3 2.1.4 3.3.4 5.5 0 10-3.6 10-8.1S17.5 3 12 3zm-4 9.3a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z"/></svg></span>' +
          '<span class="tv-rotulo"><b>Tutor Villela</b><small>Tire dúvidas da aula</small></span>';
        b.onclick = function () { T.aberto ? fecharTutor() : abrirTutor(); };
        document.body.appendChild(b);
        // o rótulo aparece aberto nas primeiras visitas e depois recolhe — chama atenção sem incomodar
        var vezes = Number(pref('tv-vezes') || 0);
        if (vezes < 3) { b.classList.add('convite'); pref('tv-vezes', String(vezes + 1)); setTimeout(function () { b.classList.remove('convite'); }, 9000); }
      }
    }
    function abrirTutor() {
      montarTutor();
      var g = el('tv-gaveta');
      if (!g) {
        g = document.createElement('aside');
        g.id = 'tv-gaveta'; g.className = 'tv-gaveta'; g.setAttribute('aria-label', 'Tutor Villela');
        g.innerHTML = '<div class="tv-cab"><span class="tv-orbe peq"></span><div><b>Tutor Villela</b><small id="tv-sub">Conhece as aulas, o livro e os materiais deste curso</small></div>' +
          '<button class="tv-x" id="tv-fechar" aria-label="Fechar">×</button></div>' +
          '<div class="tv-fita" id="tv-fita" aria-live="polite"></div>' +
          '<div class="tv-sug" id="tv-sug"></div>' +
          '<form class="tv-form" id="tv-form"><textarea id="tv-txt" rows="2" placeholder="Pergunte sobre a aula…"></textarea>' +
          '<button class="tv-env" aria-label="Enviar">' + ico('dir', 20) + '</button></form>' +
          '<p class="tv-rod" id="tv-rod">O tutor responde com base no curso e mostra de onde tirou. Confira sempre o que for usar em trabalho real.</p>';
        document.body.appendChild(g);
        el('tv-fechar').onclick = fecharTutor;
        el('tv-form').onsubmit = function (e) { e.preventDefault(); perguntarTutor(el('tv-txt').value); };
        el('tv-txt').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntarTutor(el('tv-txt').value); } };
      }
      T.aberto = true;
      document.body.classList.add('tv-aberto');
      if (!T.carregou) carregarConversa();
      else sugestoesIniciais();
      setTimeout(function () { if (el('tv-txt')) el('tv-txt').focus(); }, 60);
    }
    function fecharTutor() { T.aberto = false; document.body.classList.remove('tv-aberto'); }
    function aulaAtual() { return C && C.i >= 0 ? C.aulas[C.i].a : null; }
    function podeUsarTutor() {
      var a = aulaAtual();
      return !!(C && (C.d.matriculado || (C.int && C.int.revisor) || (a && a.gratuita)));
    }
    function carregarConversa() {
      T.carregou = true;
      var fita = el('tv-fita');
      if (!podeUsarTutor()) {
        fita.innerHTML = '<div class="tv-msg ele">Olá! Eu sou o Tutor Villela. Explico de novo qualquer aula, crio exemplos para a sua realidade e faço exercícios para você testar o que aprendeu.<br><br>' +
          'Eu atendo quem tem acesso ao curso — e já converso sobre as aulas de degustação.' +
          (C.d.produto.slug ? '<br><br><a class="al-bt peq" href="/academy/cursos/' + esc(C.d.produto.slug) + '">Ver o curso</a>' : '') + '</div>';
        el('tv-sug').innerHTML = '';
        return;
      }
      api('GET', '/aluno/tutor/' + C.pid + '/conversa').then(function (r) {
        fita.innerHTML = '<div class="tv-msg ele">Olá! Eu sou o <b>Tutor Villela</b>. Posso explicar de novo um ponto da aula, criar um exemplo para a sua realidade ou fazer um exercício para você testar o que aprendeu.</div>';
        (r.conversa || []).forEach(function (c) { bolha('eu', esc(c.pergunta)); bolha('ele', formatar(c.resposta), c.fontes); });
        if (!r.ativo) bolha('sis', 'O tutor está temporariamente indisponível.');
        rodape(r.restantes);
        sugestoesIniciais();
        fita.scrollTop = fita.scrollHeight;
      }).catch(function (e) { bolha('sis', esc(e.message)); });
    }
    function sugestoesIniciais() {
      var a = aulaAtual();
      var s = a ? ['Explique de novo o ponto principal desta aula', 'Crie um exemplo aplicado à minha profissão', 'Faça um exercício para eu testar se entendi']
        : ['Por onde eu começo o curso?', 'Resuma o curso em cinco pontos'];
      mostrarSugestoes(s);
    }
    function mostrarSugestoes(lista) {
      el('tv-sug').innerHTML = (lista || []).map(function (x) { return '<button type="button">' + esc(x) + '</button>'; }).join('');
      Array.prototype.forEach.call(el('tv-sug').querySelectorAll('button'), function (b) { b.onclick = function () { perguntarTutor(b.textContent); }; });
    }
    function rodape(restantes) {
      if (restantes == null || !el('tv-rod')) return;
      el('tv-rod').textContent = 'O tutor responde com base no curso e mostra de onde tirou. ' + restantes + ' pergunta' + (restantes === 1 ? '' : 's') + ' restante' + (restantes === 1 ? '' : 's') + ' hoje.';
    }
    function formatar(t) { // parágrafos e listas "• " (texto puro, escapado)
      return esc(t).replace(/\[(\d{1,2})\]/g, '<sup>$1</sup>').replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
    }
    function bolha(quem, html, fontes) {
      var d = document.createElement('div');
      d.className = 'tv-msg ' + quem;
      d.innerHTML = html + (fontes && fontes.length ? '<div class="tv-fontes">' + fontes.map(function (f) {
        var rot = f.rotulo || f.aula || f.fonte;
        var ir = f.lesson_id && indiceDe(f.lesson_id) >= 0;
        return '<button type="button" class="tv-fonte"' + (ir ? ' data-l="' + esc(f.lesson_id) + '" data-t="' + (f.ini_seg || 0) + '"' : ' disabled') + '>' +
          '<sup>' + f.n + '</sup> ' + (f.fonte === 'livro' ? '📖 ' : (f.fonte === 'transcricao' ? '▶ ' : '')) + esc(rot) + '</button>';
      }).join('') + '</div>' : '');
      el('tv-fita').appendChild(d);
      Array.prototype.forEach.call(d.querySelectorAll('.tv-fonte[data-l]'), function (b) {
        b.onclick = function () { // leva o aluno ao ponto do vídeo de onde a resposta saiu
          var lid = b.getAttribute('data-l'), t = Number(b.getAttribute('data-t') || 0);
          if (t > 0) pref('pos-' + lid, String(Math.max(11, t - 3)));
          if (window.innerWidth < 900) fecharTutor();
          if (C.i === indiceDe(lid) && el('al-video') && t > 0) { el('al-video').currentTime = Math.max(0, t - 3); el('al-video').play && el('al-video').play(); }
          else irParaAula(indiceDe(lid), false);
        };
      });
      el('tv-fita').scrollTop = el('tv-fita').scrollHeight;
      return d;
    }
    function perguntarTutor(texto) {
      texto = String(texto || '').trim();
      if (!texto || T.ocupado) return;
      if (!podeUsarTutor()) { carregarConversa(); return; }
      T.ocupado = true;
      el('tv-txt').value = '';
      el('tv-sug').innerHTML = '';
      bolha('eu', esc(texto));
      var pensando = bolha('ele pensando', '<span class="tv-pontos"><i></i><i></i><i></i></span>');
      var fab = el('tv-fab'); if (fab) fab.classList.add('pensando');
      var a = aulaAtual();
      api('POST', '/aluno/tutor/perguntar', { product_id: C.pid, lesson_id: a ? a.id : '', pergunta: texto }).then(function (r) {
        pensando.parentNode.removeChild(pensando);
        bolha('ele', formatar(r.resposta) + (r.nao_encontrado ? '<p class="tv-nao">Não encontrei isso no conteúdo do curso.</p>' : ''), r.fontes);
        mostrarSugestoes(r.sugestoes && r.sugestoes.length ? r.sugestoes : []);
        rodape(r.restantes);
      }).catch(function (e) {
        pensando.parentNode.removeChild(pensando);
        bolha('sis', esc(e.message));
      }).then(function () { T.ocupado = false; if (fab) fab.classList.remove('pensando'); });
    }

    // ---- fim do curso: certificado, avaliação e próximos cursos ----
    function pintarFim() {
      var alvo = el('al-fim'); if (!alvo) return;
      var pr = C.d.progresso || { pct: 0 }, h = '';
      if (C.d.matriculado && pr.pct === 100) {
        h += '<div class="al-conquista" style="margin-top:26px"><span class="med">🎓</span>' +
          '<div style="flex:1;min-width:200px"><h3 style="font-size:1.15rem">Curso concluído</h3>' +
          '<p class="al-sub">Você terminou todo o conteúdo. Emita o seu certificado.</p></div>' +
          '<button class="al-bt" id="al-cert">Emitir certificado</button></div>';
      }
      if (C.d.matriculado) {
        h += '<div class="al-caixa" style="margin-top:20px;padding:18px"><h4 style="font-size:1.05rem;margin-bottom:10px">Avaliar este curso</h4>' +
          '<div class="al-nota"><select id="al-nota"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select>' +
          '<input type="text" id="al-avtxt" placeholder="Conte como foi (opcional)">' +
          '<button class="al-bt peq" id="al-avbt">Enviar avaliação</button></div><p id="al-avmsg" class="erro"></p></div>';
      }
      h += '<div id="al-recs-curso"></div>' +
        '<p class="al-fino" style="margin-top:22px"><a href="#" id="al-denuncia" style="color:var(--al-tinta3)">Denunciar conteúdo irregular</a></p>';
      alvo.innerHTML = h;
      if (el('al-cert')) el('al-cert').onclick = function () {
        api('POST', '/aluno/cursos/' + C.pid + '/certificado').then(function (r) { window.open(r.url, '_blank'); }).catch(function (e) { alert(e.message); });
      };
      if (el('al-avbt')) el('al-avbt').onclick = function () {
        api('POST', '/aluno/cursos/' + C.pid + '/avaliar', { nota: el('al-nota').value, texto: el('al-avtxt').value })
          .then(function () { D.okMsg('al-avmsg', '✅ Obrigado pela avaliação!'); }).catch(function (e) { D.falha('al-avmsg', e); });
      };
      if (el('al-denuncia')) el('al-denuncia').onclick = function (e) {
        e.preventDefault();
        var motivo = prompt('Motivo (direitos-autorais, enganoso, ilegal, adulto, outro):', 'outro');
        if (motivo == null) return;
        var texto = prompt('Descreva o problema:') || '';
        api('POST', '/denunciar', { product_id: C.pid, motivo: motivo, texto: texto })
          .then(function () { alert('Denúncia registrada. Obrigado.'); }).catch(function (er) { alert(er.message); });
      };
      if (!alvo.getAttribute('data-recs')) { // as recomendações do curso carregam uma vez só
        alvo.setAttribute('data-recs', '1');
        recomendados(C.pid, 'al-recs-curso', 'Quem estuda isto também faz');
      }
    }

    // ---- teclado: ← → trocam de aula, C conclui (fora de campos de texto) ----
    function ligarTeclado() {
      if (window.__alTeclado) document.removeEventListener('keydown', window.__alTeclado);
      window.__alTeclado = function (e) {
        if (!C || !document.querySelector('.est')) return;
        var t = (e.target && e.target.tagName) || '';
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key === 'ArrowRight') { var p = proximaLiberada(C.i, 1); if (p >= 0) { e.preventDefault(); irParaAula(p, false); } }
        else if (e.key === 'ArrowLeft') { var a = proximaLiberada(C.i, -1); if (a >= 0) { e.preventDefault(); irParaAula(a, false); } }
        else if (e.key === 'c' || e.key === 'C') { if (el('al-feito')) { e.preventDefault(); el('al-feito').click(); } }
      };
      document.addEventListener('keydown', window.__alTeclado);
    }

    // ================= AUDIOBOOK =================
    // O curso em áudio, capítulo a capítulo, para ouvir no carro ou com o celular no
    // bolso. Um <audio> ÚNICO, pendurado no <body> (fora da view): trocar de tela no
    // painel não interrompe o som, e o mini-player segue embaixo. Os controles do
    // sistema (tela bloqueada, fone, volante do carro) vêm da Media Session API.
    // O arquivo só chega por URL assinada de 30 min, pedida capítulo a capítulo —
    // não há botão de baixar nem rota que entregue o áudio fora do player.
    var AB = { pid: '', produto: null, faixas: [], i: -1, audio: null, links: {}, sono: null, tentou: 0 };
    var VELOCIDADES = [0.75, 1, 1.25, 1.5, 1.75, 2];

    function botaoAudiobook(fx) {
      fx = fx || [];
      if (!fx.length) return '';
      var seg = 0; fx.forEach(function (f) { seg += Number(f.duracao_seg || 0); });
      return '<button class="al-bt ab-abrir" id="al-ab">' + ico('fone', 18) + ' Ouvir como audiobook' +
        '<span class="ab-abrir-n">' + fx.length + ' capítulos' + (seg ? ' · ' + dur(seg) : '') + '</span></button>';
    }
    function mmss(seg) {
      seg = Math.max(0, Math.floor(Number(seg) || 0));
      var h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
      return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    function faixa() { return AB.faixas[AB.i] || null; }
    function proximaFaixa(de, passo) {
      for (var k = de + passo; k >= 0 && k < AB.faixas.length; k += passo) if (AB.faixas[k].liberada) return k;
      return -1;
    }
    function ouvido(f) { return pref('ab-ok-' + f.id) === '1'; }

    function garantirAudio() {
      if (AB.audio) return AB.audio;
      var a = document.createElement('audio');
      a.id = 'ab-audio'; a.preload = 'metadata';
      a.setAttribute('controlslist', 'nodownload');
      a.style.display = 'none';
      document.body.appendChild(a);
      AB.audio = a;
      // qualquer tela do painel pode trocar a view (outra aba, biblioteca…) sem passar
      // por aqui: sem o mini-player o som seguiria tocando sem controle nenhum.
      setInterval(function () {
        if (a.src && !el('ab-lista') && !document.getElementById('ab-mini')) pintarMini();
      }, 1000);
      var ultimo = 0;
      a.addEventListener('timeupdate', function () {
        var f = faixa(); if (!f || !a.duration) return;
        if (Math.abs(a.currentTime - ultimo) > 5) {
          ultimo = a.currentTime;
          pref('ab-pos-' + f.id, a.currentTime < a.duration - 20 ? String(Math.floor(a.currentTime)) : '0');
          if (a.currentTime / a.duration > 0.92) pref('ab-ok-' + f.id, '1');
          posicaoNoSistema();
        }
        if (AB.sono && AB.sono.ate && Date.now() >= AB.sono.ate) { AB.sono = null; a.pause(); pintarSono(); }
        pintarTempo();
      });
      a.addEventListener('play', function () { AB.tentou = 0; pintarBotoes(); pintarMini(); if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing'; });
      a.addEventListener('pause', function () { pintarBotoes(); pintarMini(); if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused'; });
      a.addEventListener('loadedmetadata', function () { pintarTempo(); posicaoNoSistema(); });
      a.addEventListener('ended', function () {
        var f = faixa(); if (f) { pref('ab-pos-' + f.id, '0'); pref('ab-ok-' + f.id, '1'); }
        if (AB.sono && AB.sono.fim) { AB.sono = null; pintarSono(); pintarLista(); return; } // "até o fim do capítulo"
        var p = proximaFaixa(AB.i, 1);
        if (p >= 0) tocar(p, true, 0); else pintarLista();
      });
      // URL assinada venceu numa pausa longa (carro parado, celular no bolso): pede
      // outra e continua do mesmo segundo, sem o aluno perceber.
      a.addEventListener('error', function () {
        var f = faixa(); if (!f || AB.tentou >= 2) return;
        AB.tentou++;
        var pos = a.currentTime || Number(pref('ab-pos-' + f.id) || 0), tocava = !a.paused || AB.querTocar;
        delete AB.links[f.id];
        tocar(AB.i, tocava, pos);
      });
      if (navigator.mediaSession) {
        var ms = navigator.mediaSession, acao = function (n, fn) { try { ms.setActionHandler(n, fn); } catch (e) { /* ação não suportada */ } };
        acao('play', function () { a.play(); });
        acao('pause', function () { a.pause(); });
        acao('previoustrack', function () { anterior(); });
        acao('nexttrack', function () { proxima(); });
        acao('seekbackward', function (d) { pular(-((d && d.seekOffset) || 15)); });
        acao('seekforward', function (d) { pular((d && d.seekOffset) || 30); });
        acao('seekto', function (d) { if (d && d.seekTime != null) { a.currentTime = d.seekTime; posicaoNoSistema(); } });
      }
      return a;
    }
    function posicaoNoSistema() {
      var a = AB.audio;
      if (!a || !navigator.mediaSession || !navigator.mediaSession.setPositionState || !a.duration || !isFinite(a.duration)) return;
      try { navigator.mediaSession.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: a.playbackRate || 1 }); } catch (e) { /* ignora */ }
    }
    function metadadosNoSistema(f) {
      if (!navigator.mediaSession || !window.MediaMetadata) return;
      var capa = AB.produto && AB.produto.capa_media_id ? location.origin + '/academy/api/media/' + AB.produto.capa_media_id : '';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Cap. ' + f.ordem + ' — ' + f.titulo,
        artist: (AB.produto && AB.produto.produtor_nome) || 'Villela Academy',
        album: (AB.produto && AB.produto.titulo) || 'Audiobook',
        artwork: capa ? [{ src: capa, sizes: '512x512', type: 'image/jpeg' }] : [{ src: '/assets/brand/villela-academy/icon-pwa.png', sizes: '512x512', type: 'image/png' }],
      });
    }

    // link do capítulo: do cache se ainda vale por mais 2 min; senão pede ao servidor
    function linkDe(f) {
      var c = AB.links[f.id];
      if (c && c.expira_epoch * 1000 - Date.now() > 120000) return c;
      return null;
    }
    function buscarLink(f) {
      return api('GET', '/aluno/audiobook/' + f.id + '/link').then(function (r) { AB.links[f.id] = r; return r; });
    }
    function preBuscarProxima() {
      var p = proximaFaixa(AB.i, 1);
      if (p >= 0 && !linkDe(AB.faixas[p])) buscarLink(AB.faixas[p]).catch(function () { /* tenta de novo na hora */ });
    }

    // troca o capítulo. Com o link já em mãos a troca é SÍNCRONA — é o que deixa o
    // próximo capítulo começar sozinho com a tela bloqueada (o iOS barra play()
    // que chega depois de uma espera de rede fora de um toque do usuário).
    function tocar(i, tocarJa, pos) {
      var f = AB.faixas[i]; if (!f || !f.liberada) return;
      var a = garantirAudio();
      AB.i = i; AB.querTocar = !!tocarJa;
      pref('ab-ult-' + AB.pid, f.id);
      metadadosNoSistema(f);
      pintarAtual(); pintarLista(); pintarMini();
      var inicio = pos != null ? pos : Number(pref('ab-pos-' + f.id) || 0);
      var aplicar = function (r) {
        if (AB.faixas[AB.i] !== f) return; // o aluno já escolheu outro capítulo
        a.src = r.url;
        a.playbackRate = Number(pref('ab-vel') || 1);
        if (inicio > 3) {
          var ir = function () { a.removeEventListener('loadedmetadata', ir); try { a.currentTime = inicio; } catch (e) { /* ignora */ } };
          a.addEventListener('loadedmetadata', ir);
        }
        if (tocarJa) { var pr = a.play(); if (pr && pr.catch) pr.catch(function () { pintarBotoes(); }); }
        preBuscarProxima();
      };
      var c = linkDe(f);
      if (c) aplicar(c);
      else buscarLink(f).then(aplicar).catch(function (e) { alert(e.message); });
    }
    function tocarPausar() {
      var a = garantirAudio();
      if (!a.src) { tocar(AB.i >= 0 ? AB.i : 0, true); return; }
      if (a.paused) a.play(); else a.pause();
    }
    function pular(seg) {
      var a = AB.audio; if (!a || !a.duration) return;
      a.currentTime = Math.max(0, Math.min(a.duration - 1, a.currentTime + seg));
      posicaoNoSistema();
    }
    function anterior() {
      var a = AB.audio;
      if (a && a.currentTime > 5) { a.currentTime = 0; return; } // 1º toque volta ao início, como em todo player
      var p = proximaFaixa(AB.i, -1); if (p >= 0) tocar(p, a ? !a.paused : false, 0);
    }
    function proxima() {
      var p = proximaFaixa(AB.i, 1); if (p >= 0) tocar(p, AB.audio ? !AB.audio.paused : false, 0);
    }

    function abrirAudiobook() {
      if (!C || !(C.d.audiobook || []).length) return;
      if (AB.pid !== C.pid) { // outro curso: o que tocava antes para aqui
        AB.i = -1; AB.links = {};
        if (AB.audio) { AB.audio.pause(); AB.audio.removeAttribute('src'); AB.audio.load(); }
      }
      AB.pid = C.pid; AB.produto = C.d.produto; AB.faixas = C.d.audiobook; AB.matriculado = C.d.matriculado;
      document.body.classList.remove('aluno-amplo');
      pintarAudiobook();
      if (AB.i < 0) { // retoma o último capítulo ouvido; senão, o primeiro liberado
        var ult = pref('ab-ult-' + AB.pid), alvo = -1;
        for (var k = 0; k < AB.faixas.length; k++) if (AB.faixas[k].id === ult && AB.faixas[k].liberada) alvo = k;
        if (alvo < 0) alvo = proximaFaixa(-1, 1);
        if (alvo >= 0) tocar(alvo, false);
      } else { pintarAtual(); pintarTempo(); pintarBotoes(); }
    }

    function pintarAudiobook() {
      var p = AB.produto, seg = 0, livres = 0;
      AB.faixas.forEach(function (f) { seg += Number(f.duracao_seg || 0); if (f.liberada) livres++; });
      var h = '<div class="al ab">' +
        '<a href="#" class="al-volta" id="ab-volta">' + ico('esq', 16) + ' Voltar ao curso</a>' +
        '<div class="ab-player">' +
        '<div class="ab-capa" style="' + capaCss(p) + '">' + (p.capa_media_id ? '' : ico('fone', 56)) + '</div>' +
        '<div class="ab-corpo">' +
        '<p class="al-rotulo" style="color:#F4B860">Audiobook · ' + esc(p.titulo) + '</p>' +
        '<h2 id="ab-titulo">Escolha um capítulo</h2><p class="ab-cap" id="ab-cap"></p>' +
        '<input type="range" id="ab-barra" min="0" max="1000" value="0" aria-label="Posição no capítulo">' +
        '<div class="ab-tempos"><span id="ab-t1">0:00</span><span id="ab-t2">0:00</span></div>' +
        '<div class="ab-ctrl">' +
        '<button id="ab-ant" aria-label="Capítulo anterior">' + ico('ant', 26) + '</button>' +
        '<button id="ab-v15" aria-label="Voltar 15 segundos" class="ab-salto">' + ico('volta', 28) + '<i>15</i></button>' +
        '<button id="ab-play" class="ab-play" aria-label="Tocar">' + ico('play', 34) + '</button>' +
        '<button id="ab-a30" aria-label="Avançar 30 segundos" class="ab-salto">' + ico('avanca', 28) + '<i>30</i></button>' +
        '<button id="ab-pro" aria-label="Próximo capítulo">' + ico('prox', 26) + '</button></div>' +
        '<div class="ab-extras"><button id="ab-vel" class="ab-chip" aria-label="Velocidade">1×</button>' +
        '<button id="ab-sono" class="ab-chip">' + ico('lua', 15) + ' <span id="ab-sono-txt">Timer</span></button></div>' +
        '</div></div>' +
        (AB.matriculado ? '' : '<div class="aviso">Você está ouvindo a amostra. Os outros capítulos ficam liberados para quem é aluno do curso. ' +
          '<a href="/academy/cursos/' + esc(p.slug || '') + '">Ver a página do curso →</a></div>') +
        '<div class="al-secao"><h3>Capítulos</h3><span class="al-fino">' + AB.faixas.length + ' capítulos' + (seg ? ' · ' + dur(seg) : '') +
        (livres < AB.faixas.length ? ' · ' + livres + ' liberado' + (livres > 1 ? 's' : '') : '') + '</span></div>' +
        '<ol class="ab-lista" id="ab-lista"></ol>' +
        '<p class="al-fino" style="margin-top:18px">Continua tocando com a tela bloqueada e nos controles do fone e do carro. ' +
        'O app lembra onde você parou em cada capítulo.</p></div>';
      setView(h);
      var raiz = document.querySelector('.ab');
      raiz.oncontextmenu = function (e) { e.preventDefault(); };
      el('ab-volta').onclick = function (e) {
        e.preventDefault();
        if (C && C.pid === AB.pid) { document.body.classList.add('aluno-amplo'); pintarEstudio(); irParaAula(C.i >= 0 ? C.i : 0, true); }
        else abrirCurso(AB.pid);
        pintarMini();
      };
      el('ab-play').onclick = tocarPausar;
      el('ab-ant').onclick = anterior;
      el('ab-pro').onclick = proxima;
      el('ab-v15').onclick = function () { pular(-15); };
      el('ab-a30').onclick = function () { pular(30); };
      el('ab-barra').oninput = function () {
        var a = AB.audio; if (!a || !a.duration) return;
        a.currentTime = a.duration * Number(this.value) / 1000; pintarTempo(); posicaoNoSistema();
      };
      el('ab-vel').onclick = function () {
        var v = Number(pref('ab-vel') || 1), k = VELOCIDADES.indexOf(v);
        v = VELOCIDADES[(k + 1) % VELOCIDADES.length];
        pref('ab-vel', String(v));
        if (AB.audio) AB.audio.playbackRate = v;
        pintarBotoes(); posicaoNoSistema();
      };
      el('ab-sono').onclick = function () {
        // ciclo: desligado → 15 → 30 → 45 → 60 min → fim do capítulo → desligado
        var passos = [15, 30, 45, 60, 'fim', null], atual = AB.sono ? (AB.sono.fim ? 'fim' : AB.sono.min) : null;
        var prox = passos[(passos.indexOf(atual) + 1) % passos.length];
        AB.sono = prox === null ? null : (prox === 'fim' ? { fim: true } : { min: prox, ate: Date.now() + prox * 60000 });
        pintarSono();
      };
      pintarLista(); pintarBotoes(); pintarSono(); pintarMini();
    }

    function pintarLista() {
      var ol = el('ab-lista'); if (!ol) return;
      ol.innerHTML = AB.faixas.map(function (f, k) {
        var ativa = k === AB.i, fez = ouvido(f);
        var pos = Number(pref('ab-pos-' + f.id) || 0), pct = f.duracao_seg && pos ? Math.min(100, Math.round(pos * 100 / f.duracao_seg)) : 0;
        return '<li><button class="ab-f' + (ativa ? ' ativa' : '') + (fez ? ' feita' : '') + (f.liberada ? '' : ' travada') + '" data-k="' + k + '"' + (f.liberada ? '' : ' aria-disabled="true"') + '>' +
          '<span class="n">' + (ativa && AB.audio && !AB.audio.paused ? '<span class="ab-eq"><i></i><i></i><i></i></span>' : (f.liberada ? (fez ? ico('check', 16) : f.ordem) : ico('lock', 15))) + '</span>' +
          '<span class="t"><b>' + esc(f.titulo) + '</b>' +
          (f.amostra && !AB.matriculado ? '<span class="marca">amostra</span>' : '') +
          (pct > 2 && !fez ? '<span class="ab-mini-barra"><i style="width:' + pct + '%"></i></span>' : '') + '</span>' +
          '<span class="d">' + (f.duracao_seg ? mmss(f.duracao_seg) : '') + '</span></button></li>';
      }).join('');
      Array.prototype.forEach.call(ol.querySelectorAll('.ab-f'), function (b) {
        b.onclick = function () {
          var k = Number(b.getAttribute('data-k')), f = AB.faixas[k];
          if (!f.liberada) { alert('Este capítulo fica liberado para quem é aluno do curso.'); return; }
          // "destrava" o <audio> no próprio toque (exigência do iOS) antes de ir à rede
          var a = garantirAudio();
          if (k === AB.i && a.src) { tocarPausar(); return; }
          if (a.src && a.paused) { var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); }
          tocar(k, true);
        };
      });
    }
    function pintarAtual() {
      var f = faixa(); if (!f || !el('ab-titulo')) return;
      el('ab-titulo').textContent = f.titulo;
      el('ab-cap').textContent = 'Capítulo ' + f.ordem + ' de ' + AB.faixas.length;
    }
    function pintarTempo() {
      var a = AB.audio; if (!a || !el('ab-t1')) return;
      var d = a.duration && isFinite(a.duration) ? a.duration : ((faixa() || {}).duracao_seg || 0);
      el('ab-t1').textContent = mmss(a.currentTime);
      el('ab-t2').textContent = '-' + mmss(Math.max(0, d - a.currentTime));
      if (document.activeElement !== el('ab-barra')) el('ab-barra').value = d ? Math.round(a.currentTime * 1000 / d) : 0;
      var mb = document.querySelector('#ab-mini .ab-mini-prog i'); if (mb && d) mb.style.width = (a.currentTime * 100 / d) + '%';
    }
    function pintarBotoes() {
      var a = AB.audio, tocando = a && !a.paused;
      if (el('ab-play')) { el('ab-play').innerHTML = ico(tocando ? 'pausa' : 'play', 34); el('ab-play').setAttribute('aria-label', tocando ? 'Pausar' : 'Tocar'); }
      if (el('ab-vel')) el('ab-vel').textContent = String(Number(pref('ab-vel') || 1)).replace('.', ',') + '×';
      if (el('ab-ant')) el('ab-ant').disabled = proximaFaixa(AB.i, -1) < 0 && !(a && a.currentTime > 5);
      if (el('ab-pro')) el('ab-pro').disabled = proximaFaixa(AB.i, 1) < 0;
      if (el('ab-lista')) pintarLista();
    }
    function pintarSono() {
      var t = el('ab-sono-txt'); if (!t) return;
      t.textContent = !AB.sono ? 'Timer' : (AB.sono.fim ? 'Fim do capítulo' : AB.sono.min + ' min');
      el('ab-sono').classList.toggle('on', !!AB.sono);
    }
    // mini-player: aparece quando o aluno sai da tela do audiobook com algo carregado
    function pintarMini() {
      var f = faixa(), naTela = !!el('ab-lista');
      var mini = document.getElementById('ab-mini');
      if (!f || naTela || !AB.audio || !AB.audio.src) {
        if (mini) mini.remove();
        document.body.classList.remove('ab-com-mini');
        return;
      }
      if (!mini) {
        mini = document.createElement('div'); mini.id = 'ab-mini';
        document.body.appendChild(mini);
      }
      var tocando = !AB.audio.paused;
      mini.innerHTML = '<div class="ab-mini-prog"><i></i></div>' +
        '<button class="ab-mini-abrir" id="ab-mini-abrir">' + ico('fone', 18) + '<span><small>Audiobook · cap. ' + f.ordem + '</small><b>' + esc(f.titulo) + '</b></span></button>' +
        '<button class="ab-mini-bt" id="ab-mini-play" aria-label="' + (tocando ? 'Pausar' : 'Tocar') + '">' + ico(tocando ? 'pausa' : 'play', 24) + '</button>' +
        '<button class="ab-mini-bt" id="ab-mini-fechar" aria-label="Fechar o audiobook">×</button>';
      document.body.classList.add('ab-com-mini');
      document.getElementById('ab-mini-play').onclick = tocarPausar;
      document.getElementById('ab-mini-abrir').onclick = function () {
        if (C && C.pid === AB.pid) abrirAudiobook();
        else api('GET', '/aluno/cursos/' + AB.pid).then(function (d) { C = estadoDoCurso(AB.pid, d); abrirAudiobook(); }).catch(erroBox);
      };
      document.getElementById('ab-mini-fechar').onclick = function () {
        AB.i = -1; // antes de esvaziar: o 'error' do src vazio não pode religar o capítulo
        AB.audio.pause(); AB.audio.removeAttribute('src'); AB.audio.load(); pintarMini();
      };
      pintarTempo();
    }

    return { biblioteca: biblioteca, curso: abrirCurso };
  };
})();
