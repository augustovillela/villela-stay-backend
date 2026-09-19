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
      estrela: 'm12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.1-.6L12 2 9.1 8.7 2 9.3l5.4 4.7-1.6 7z'
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
      api('GET', '/aluno/cursos/' + pid).then(function (d) {
        var aulas = [];
        (d.estrutura || []).forEach(function (m) {
          (m.aulas || []).forEach(function (a) { aulas.push({ a: a, mod: m }); });
        });
        C = { pid: pid, d: d, aulas: aulas, pa: d.progresso_aulas || {}, i: -1 };
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
        '</div></div>' +
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
      el('al-busca').oninput = function () { pintarGrade(this.value); };
      pintarGrade('');
      ligarTeclado();
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
              '</span>' + (a.duracao_seg ? '<span class="dur">' + dur(a.duracao_seg) + '</span>' : '') + '</button>';
          }).join('') + '</div></div>';
      }).join('');
      el('al-grade').innerHTML = h || '<p class="al-fino" style="padding:14px">Nenhuma aula com esse termo.</p>';
      Array.prototype.forEach.call(el('al-grade').querySelectorAll('.mod-cab'), function (b) {
        b.onclick = function () { b.parentNode.classList.toggle('fechado'); };
      });
      Array.prototype.forEach.call(el('al-grade').querySelectorAll('.aula[data-i]'), function (b) {
        b.onclick = function () { irParaAula(Number(b.getAttribute('data-i')), false); };
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
      var mats = a.materiais || [];
      var abas = [['geral', 'Visão geral', 0], ['mat', 'Material complementar', mats.length]];
      if (C.d.matriculado) abas.push(['ia', 'Tutor IA', 0]);
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
      if (aba === 'mat') {
        var mats = a.materiais || [], todos = materiaisDoCurso();
        var h = mats.length
          ? '<p class="al-sub" style="margin-bottom:14px">' + mats.length + ' arquivo' + (mats.length > 1 ? 's' : '') + ' desta aula, para baixar e usar enquanto estuda.</p>' +
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
      alvo.innerHTML = '<p class="al-sub" style="margin-bottom:12px">Pergunte sobre o conteúdo deste curso. O tutor responde com base nas aulas — quando não encontra, ele diz.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="al-ia" placeholder="Ex.: como aplico isso no meu caso?" style="flex:1;min-width:240px;margin:0">' +
        '<button class="al-bt" id="al-ia-bt">Perguntar</button></div><div id="al-ia-out" style="margin-top:14px"></div>';
      el('al-ia-bt').onclick = function () {
        var pergunta = el('al-ia').value;
        if (!pergunta) return;
        el('al-ia-out').innerHTML = '<p class="al-sub">⏳ pensando…</p>';
        api('POST', '/ia/aluno/perguntar', { product_id: C.pid, pergunta: pergunta }).then(function (r) {
          el('al-ia-out').innerHTML = '<div class="al-caixa" style="padding:16px;line-height:1.6">' + esc(r.resposta || '') +
            (r.aula_referencia ? '<p class="al-fino" style="margin:10px 0 0">📚 ' + esc(r.aula_referencia) + '</p>' : '') +
            (r.nao_encontrado ? '<p class="al-fino" style="margin:10px 0 0">Não achei isso no conteúdo — vale perguntar ao produtor.</p>' : '') + '</div>';
        }).catch(function (e) { el('al-ia-out').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
      };
      el('al-ia').onkeydown = function (e) { if (e.key === 'Enter') el('al-ia-bt').click(); };
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

    return { biblioteca: biblioteca, curso: abrirCurso };
  };
})();
