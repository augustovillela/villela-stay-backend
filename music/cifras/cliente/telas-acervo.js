// =====================================================================
// Musique Cifras — CLIENTE · telas do acervo: início, biblioteca,
// detalhe da música, VISUALIZAÇÃO da cifra (a tela central), histórico,
// comparação, prática, comentários, exportar/compartilhar, acordes e
// preferências.
// =====================================================================
(function (global) {
  'use strict';
  var C = global.MusiqueCifras;
  var M = C.M, el = C.el, esc = C.esc, R = C.R, api = C.api;
  var T = C.telas;
  var TONS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var ROT_INST = { violao: 'Violão', guitarra: 'Guitarra', cavaquinho: 'Cavaquinho', ukulele: 'Ukulele', piano: 'Piano', baixo: 'Baixo' };

  function sel(opcoes, valor, onchange, rotulo) {
    var s = el('select', { 'aria-label': rotulo || '' });
    opcoes.forEach(function (o) {
      var op = el('option', { value: String(o[0]), txt: o[1] });
      if (String(o[0]) === String(valor)) op.selected = true;
      s.appendChild(op);
    });
    s.onchange = function () { onchange(s.value); };
    return s;
  }
  C.sel = sel;
  function grupo(rotulo, filhos) { var g = el('div', { class: 'cf-grupo', role: 'group', 'aria-label': rotulo }); g.appendChild(el('span', { txt: rotulo })); filhos.forEach(function (f) { g.appendChild(f); }); return g; }
  function bt(txt, fn, titulo) { var b = el('button', { type: 'button', txt: txt, title: titulo || txt, 'aria-label': titulo || txt }); b.onclick = fn; return b; }
  C.bt = bt;
  function tag(txt, cls) { return el('span', { class: 'cf-tag ' + (cls || ''), txt: txt }); }
  C.tag = tag;
  function tagStatus(st) { return tag({ importada: 'importada', comunitaria: 'comunitária', revisada: 'revisada', verificada: 'verificada', rascunho: 'rascunho' }[st] || st, st === 'verificada' || st === 'revisada' ? 'ok' : st === 'rascunho' ? 'av' : ''); }
  C.tagStatus = tagStatus;

  // =================================================================
  // INÍCIO (dashboard musical)
  // =================================================================
  T.inicio = function () {
    C.recarregarInicio().then(function () {
      var d = C.estado.inicio || {};
      var c = C.limpar();
      c.appendChild(el('h2', { txt: 'Cifras' }));
      if (d._offline) c.appendChild(el('div', { class: 'cf-offline', txt: 'Sem internet: mostrando a última cópia guardada (' + new Date(d._copia_de).toLocaleString('pt-BR') + ').' }));
      // Barra de comando: busca, ou linguagem natural quando a IA estiver ligada
      var q = el('input', { type: 'search', placeholder: C.temIA('comando') ? 'Busque ou peça: "abrir Wave em Ré", "transpor para G"' : 'Buscar música, artista ou trecho da letra', 'aria-label': 'Buscar' });
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter' && q.value.trim()) comando(q.value.trim()); });
      c.appendChild(el('div', { class: 'cf-barra' }, [q, C.botao('Buscar', function () { if (q.value.trim()) comando(q.value.trim()); }),
        C.botao('+ Encontrar ou importar', function () { C.ir('importar'); }, 'sec')]));
      if (d.flags && d.flags['cifras.vivo'] !== false) {
        var cod = el('input', { type: 'text', placeholder: 'Código da sessão', maxlength: '8', 'aria-label': 'Código da sessão ao vivo', style: 'max-width:180px;text-transform:uppercase' });
        c.appendChild(el('div', { class: 'cf-barra' }, [cod, C.botao('Entrar na sessão ao vivo', function () { if (cod.value.trim()) C.ir('vivo_entrar', cod.value.trim()); }, 'sec')]));
      }
      // Atalhos: cada funcionalidade com ícone e cor — o Início é a porta de
      // entrada, e uma lista de nomes sem imagem não dizia o que tem aqui.
      var ATALHOS = [
        ['importar', 'Encontrar ou importar', 'Cifra por link, arquivo, foto ou busca'],
        ['biblioteca', 'Minha biblioteca', (d.total || 0) + ' música(s) no acervo'],
        ['acordes', 'Acordes', 'Dicionário dos acordes das suas músicas'],
        ['setlists', 'Setlists', 'Monte o repertório do show'],
        ['bandas', 'Bandas', 'Cifras compartilhadas com o grupo'],
        ['vivo', 'Ao vivo', 'Modo Maestro: a banda segue você'],
      ];
      var atal = el('div', { class: 'cf-atalhos' });
      ATALHOS.forEach(function (a, k) {
        if (a[0] === 'vivo' && d.flags && d.flags['cifras.vivo'] === false) return;
        var v = C.ICONES[a[0]] || {};
        var b = el('button', { class: 'cf-atalho', type: 'button', style: '--cf-cor:' + v.cor + ';animation-delay:' + (k * 45) + 'ms' }, [
          el('span', { class: 'cf-atalho-ico', style: 'background:' + v.fundo, txt: v.ico }),
          el('b', { txt: a[1] }), el('span', { class: 'm', txt: a[2] })]);
        b.onclick = function () { C.ir(a[0]); };
        atal.appendChild(b);
      });
      c.appendChild(atal);
      if (!d.total && !(d.recentes || []).length) {
        c.appendChild(C.estadoVazio('Sua biblioteca de cifras está vazia', 'Cole uma cifra, envie um arquivo, busque pelo nome da música ou escreva do zero.',
          C.botao('Começar', function () { C.ir('importar'); })));
      }
      secaoLista(c, '▶️ Continuar tocando', d.recentes, function (x) { return { t: x.titulo, m: [x.artista, x.tom].filter(Boolean).join(' · '), fn: function () { C.ir('cifra', x.cifra_id); } }; });
      secaoLista(c, '⭐ Favoritas', d.favoritas, function (x) { return { t: x.titulo, m: x.artista, fn: function () { abrirMusica(x); } }; });
      secaoLista(c, '🔥 Mais tocadas', d.mais_tocadas, function (x) { return { t: x.titulo, m: x.vezes + ' vez(es)', fn: function () { C.ir('cifra', x.cifra_id); } }; });
      secaoLista(c, '📡 Sessões ao vivo agora', d.sessoes, function (x) { return { t: x.setlist, m: 'código ' + x.codigo + (x.sou_maestro ? ' · você conduz' : ''), fn: function () { C.ir('vivo_entrar', x.codigo); } }; });
      secaoLista(c, '📋 Setlists', d.setlists, function (x) { return { t: x.nome, m: [C.data(x.data), (x.itens || 0) + ' músicas', x.status].filter(Boolean).join(' · '), fn: function () { C.ir('setlist', x.id); } }; });
      secaoLista(c, '👥 Bandas', d.bandas, function (x) { return { t: x.nome, m: x.rotulo || x.papel, fn: function () { C.ir('banda', x.id); } }; });
      if ((d.notificacoes || []).length) {
        c.appendChild(el('h3', { txt: '🔔 Avisos' }));
        var ul = el('div', { class: 'cf-lista' });
        d.notificacoes.forEach(function (n) {
          ul.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: n.titulo }), el('span', { class: 'm', txt: C.data(n.criado_em) })]),
            n.link ? C.botao('Abrir', function () { location.hash = n.link.split('#')[1] || ''; C.rotearHash(); }, 'sec peq') : null]));
        });
        c.appendChild(ul);
        c.appendChild(C.botao('Marcar todos como lidos', function () { api('POST', '/notificacoes/lidas').then(T.inicio); }, 'sec peq'));
      }
    });
  };

  function secaoLista(c, titulo, itens, mapa) {
    if (!itens || !itens.length) return;
    c.appendChild(el('h3', { txt: titulo }));
    var g = el('div', { class: 'cf-grid' });
    itens.forEach(function (x, k) {
      var m = mapa(x);
      var b = el('button', { class: 'cf-cartao', type: 'button', style: 'animation-delay:' + Math.min(k, 12) * 35 + 'ms' }, [el('b', { txt: m.t }), el('span', { class: 'm', txt: m.m || '' })]);
      b.onclick = m.fn;
      g.appendChild(b);
    });
    c.appendChild(g);
  }

  /** Comando: com IA, vira ação; sem IA, é busca. Ação sempre com prévia. */
  function comando(texto) {
    if (!C.temIA('comando')) return C.ir('biblioteca', null, { q: texto });
    api('POST', '/ia/comando', { texto: texto }).then(function (r) {
      var a = r.dados || {}, p = a.parametros || {};
      var desc = (a.explicacao || a.acao) + (r.confianca ? ' (confiança ' + Math.round(r.confianca * 100) + '%)' : '');
      C.modal('Entendi assim', desc, [{ txt: 'Só buscar', fn: function () { C.ir('biblioteca', null, { q: texto }); } }, { txt: 'Fazer', fn: function () {
        if (a.acao === 'buscar') C.ir('biblioteca', null, { q: p.q || texto, artista: p.artista, tom: p.tom });
        else if (a.acao === 'abrir' && p.titulo) C.ir('biblioteca', null, { q: p.titulo, abrirPrimeira: true, tom: p.tom });
        else if (a.acao === 'criar_setlist') C.ir('setlists', null, { novo: p.nome || 'Novo setlist', musicas: p.musicas || [] });
        else C.ir('biblioteca', null, { q: texto });
      } }]);
    }).catch(function () { C.ir('biblioteca', null, { q: texto }); });
  }

  // =================================================================
  // BIBLIOTECA
  // =================================================================
  T.biblioteca = function (arg, f) {
    f = Object.assign({ ordem: 'titulo' }, f || {});
    var c = C.limpar();
    c.appendChild(el('h2', { txt: f.lixeira ? 'Lixeira' : 'Biblioteca de músicas' }));
    var q = el('input', { type: 'search', placeholder: 'Título, artista, compositor, tag ou trecho da letra', value: f.q || '', 'aria-label': 'Buscar na biblioteca' });
    var lista = el('div', { class: 'cf-lista', 'aria-live': 'polite' });
    var filtros = el('div', { class: 'cf-barra' });
    var buscar = function () { f.q = q.value; f.cursor = null; carregar(true); };
    q.addEventListener('input', C.debounce(buscar, 280));
    c.appendChild(el('div', { class: 'cf-barra' }, [q, C.botao('+ Nova música', novaMusica, 'sec'), C.botao('Encontrar ou importar', function () { C.ir('importar'); }, 'sec')]));
    c.appendChild(filtros);
    c.appendChild(lista);
    var mais = C.botao('Carregar mais', function () { carregar(false); }, 'sec');
    mais.style.display = 'none';
    c.appendChild(mais);
    document.addEventListener('keydown', function atalho(e) {
      if (!document.body.contains(q)) { document.removeEventListener('keydown', atalho); return; }
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); q.focus(); }
    });

    api('GET', '/facetas', null, { cache: 'facetas' }).then(function (fa) {
      var bandas = (C.estado.inicio && C.estado.inicio.bandas) || [];
      filtros.appendChild(sel([['', 'Tudo que vejo'], ['minhas', 'Só as minhas']].concat(bandas.map(function (b) { return ['banda:' + b.id, 'Banda: ' + b.nome]; })),
        f.banda ? 'banda:' + f.banda : (f.escopo || ''), function (v) { f.escopo = v === 'minhas' ? 'minhas' : ''; f.banda = v.indexOf('banda:') === 0 ? v.slice(6) : ''; carregar(true); }, 'Escopo'));
      var faceta = function (nome, lista2, rot) {
        filtros.appendChild(sel([['', rot]].concat((lista2 || []).map(function (x) { return [x.v, x.v + ' (' + x.n + ')']; })), f[nome] || '', function (v) { f[nome] = v; carregar(true); }, rot));
      };
      faceta('artista', fa.artistas, 'Artista'); faceta('genero', fa.generos, 'Gênero'); faceta('tom', fa.tons, 'Tom'); faceta('dificuldade', fa.dificuldades, 'Dificuldade');
      filtros.appendChild(sel([['', 'Qualquer status'], ['verificada', 'Verificada'], ['revisada', 'Revisada'], ['comunitaria', 'Comunitária'], ['importada', 'Importada'], ['rascunho', 'Rascunho']], f.status || '', function (v) { f.status = v; carregar(true); }, 'Status'));
      filtros.appendChild(sel([['titulo', 'A–Z'], ['artista', 'Por artista'], ['recentes', 'Recentes'], ['mais_tocadas', 'Mais tocadas'], ['atualizadas', 'Atualizadas']], f.ordem, function (v) { f.ordem = v; carregar(true); }, 'Ordenar'));
      var fav = el('label', { class: 'check', style: 'margin:0' }, [el('input', { type: 'checkbox' }), el('span', { txt: 'Favoritas' })]);
      fav.firstChild.checked = !!f.favoritas; fav.firstChild.onchange = function () { f.favoritas = fav.firstChild.checked; carregar(true); };
      filtros.appendChild(fav);
      filtros.appendChild(C.botao(f.lixeira ? 'Voltar à biblioteca' : 'Lixeira', function () { C.ir('biblioteca', null, { lixeira: !f.lixeira }); }, 'sec peq'));
    }).catch(function () {});

    function carregar(limpar) {
      if (limpar) { lista.innerHTML = ''; lista.appendChild(C.esqueleto(5)); f.cursor = null; }
      var p = ['limite=30', 'ordem=' + encodeURIComponent(f.ordem || 'titulo')];
      ['q', 'escopo', 'banda', 'artista', 'genero', 'tom', 'dificuldade', 'status', 'cursor'].forEach(function (k) { if (f[k]) p.push(k + '=' + encodeURIComponent(f[k])); });
      if (f.favoritas) p.push('favoritas=1');
      if (f.lixeira) p.push('lixeira=1');
      var chaveCache = limpar && !f.q && !f.cursor ? 'bib:' + p.join('&') : null;
      api('GET', '/musicas?' + p.join('&'), null, { cache: chaveCache }).then(function (d) {
        if (limpar) lista.innerHTML = '';
        if (d._offline) lista.appendChild(el('div', { class: 'cf-offline', txt: 'Sem internet: lista guardada neste aparelho.' }));
        if (!d.itens.length && limpar) {
          lista.appendChild(f.q ? C.estadoVazio('Nada encontrado para "' + f.q + '"', 'Tente outra grafia — ou procure fora do seu acervo.', C.botao('Procurar e importar "' + f.q + '"', function () { C.ir('importar', null, { q: f.q }); }))
            : C.estadoVazio(f.lixeira ? 'A lixeira está vazia' : 'Nenhuma música aqui ainda', f.lixeira ? '' : 'Importe ou crie a primeira.', f.lixeira ? null : C.botao('Encontrar ou importar', function () { C.ir('importar'); })));
        }
        d.itens.forEach(function (x) { lista.appendChild(itemMusica(x, f)); });
        f.cursor = d.proximo; mais.style.display = d.proximo ? '' : 'none';
        if (f.abrirPrimeira && d.itens[0]) { f.abrirPrimeira = false; abrirMusica(d.itens[0], { tom: f.tomAlvo || f.tom }); }
      }).catch(function (e) { lista.innerHTML = ''; lista.appendChild(C.estadoErro(e, function () { carregar(true); })); });
    }
    carregar(true);
  };

  function itemMusica(x, f) {
    var linha = el('div', { class: 'cf-linha-item' });
    var info = el('div', { class: 'cresce' }, [el('b', { txt: x.titulo }), el('span', { class: 'm', txt: [x.artista, x.tom ? 'tom ' + x.tom : '', x.cifras + ' versão(ões)'].filter(Boolean).join(' · ') })]);
    linha.appendChild(el('button', { type: 'button', class: 'cf-bt', 'aria-label': x.favorita ? 'Desfavoritar' : 'Favoritar', txt: x.favorita ? '★' : '☆', onclick: function (ev) {
      ev.stopPropagation();
      api('POST', '/musicas/' + x.id + '/favorito').then(function (r) { ev.target.textContent = r.favorita ? '★' : '☆'; }).catch(C.erro);
    } }));
    linha.appendChild(info);
    if (!x.minha) linha.appendChild(tag(x.visibilidade === 'publica' ? 'pública' : 'da banda'));
    else if (x.visibilidade === 'publica') linha.appendChild(tag('pública', 'ok'));
    if (x.qualidade) linha.appendChild(tag('Q ' + x.qualidade, x.qualidade >= 75 ? 'ok' : x.qualidade < 45 ? 'av' : ''));
    if (f && f.lixeira) linha.appendChild(C.botao('Restaurar', function () { api('POST', '/musicas/' + x.id + '/restaurar').then(function () { C.ir('biblioteca', null, { lixeira: true }); }).catch(C.erro); }, 'sec peq'));
    else {
      linha.appendChild(C.botao('Detalhes', function () { C.ir('musica', x.id); }, 'sec peq'));
      if (x.cifra_principal) linha.appendChild(C.botao('Tocar', function () { C.ir('cifra', x.cifra_principal); }, 'peq'));
    }
    info.style.cursor = 'pointer';
    info.onclick = function () { abrirMusica(x); };
    return linha;
  }

  function abrirMusica(x, extra) {
    if (x.cifra_principal) C.ir('cifra', x.cifra_principal, extra); else C.ir('musica', x.id);
  }

  function novaMusica() {
    var f = el('div', { class: 'cf-form' });
    var tit = el('input', { type: 'text', placeholder: 'Título' }), art = el('input', { type: 'text', placeholder: 'Artista' });
    f.appendChild(el('label', {}, [el('span', { txt: 'Título' }), tit]));
    f.appendChild(el('label', {}, [el('span', { txt: 'Artista' }), art]));
    C.modal('Nova música (cifra em branco)', f, [{ txt: 'Cancelar' }, { txt: 'Criar e editar', fn: function () {
      criarMusica({ titulo: tit.value, artista: art.value }).then(function (r) { if (r && r.cifra) C.ir('editor', r.cifra.id); });
    } }]);
  }

  /** Cria música tratando a DUPLICATA com as quatro opções. */
  function criarMusica(dados) {
    return api('POST', '/musicas', dados).catch(function (e) {
      if (e.status !== 409 || !e.dados || e.dados.codigo !== 'DUPLICATA') { C.erro(e); throw e; }
      return new Promise(function (ok) {
        var dup = e.dados.duplicatas[0].obra;
        var box = el('div', {}, [el('p', { txt: 'Já existe "' + dup.titulo + '"' + (dup.artista ? ' de ' + dup.artista : '') + ' no acervo que você vê. O que prefere?' })]);
        C.modal('Parece que esta música já existe', box, [
          { txt: 'Abrir a existente', fn: function () { ok(null); C.ir('musica', dup.id); } },
          { txt: 'Criar nova versão nela', fn: function () { api('POST', '/musicas/' + dup.id + '/cifras', { texto: dados.texto, chordpro: dados.chordpro }).then(function (r) { ok({ cifra: r.cifra }); }).catch(C.erro); } },
          { txt: 'Salvar separada', fn: function () { api('POST', '/musicas', Object.assign({}, dados, { separada: true })).then(ok).catch(C.erro); } },
        ]);
      });
    });
  }
  C.criarMusica = criarMusica;

  // =================================================================
  // DETALHE DA MÚSICA
  // =================================================================
  T.musica = function (id) {
    api('GET', '/musicas/' + id, null, { cache: 'musica:' + id }).then(function (d) {
      var c = C.limpar();
      var m = d.musica;
      c.appendChild(C.botao('← Biblioteca', function () { C.ir('biblioteca'); }, 'sec peq'));
      c.appendChild(el('h2', { txt: m.titulo }));
      c.appendChild(el('p', { class: 'sub', txt: [m.artista, m.compositor ? 'de ' + m.compositor : '', m.album, m.ano || '', m.genero, m.tom_original ? 'tom original ' + m.tom_original : ''].filter(Boolean).join(' · ') }));
      var tags = el('div', { class: 'linha' });
      tags.appendChild(tag({ propria: 'obra própria', dominio_publico: 'domínio público', licenciada: 'licenciada', terceiro_privado: 'obra de terceiro' }[m.titularidade] || m.titularidade));
      if (d.pela_banda) tags.appendChild(tag('compartilhada pela banda'));
      if (d.removida) tags.appendChild(tag('na lixeira', 'er'));
      (m.tags || []).forEach(function (t) { tags.appendChild(tag('#' + t)); });
      tags.appendChild(tag(m.visibilidade === 'publica' ? 'pública' : 'privada', m.visibilidade === 'publica' ? 'ok' : ''));
      c.appendChild(tags);
      // Privada ⇄ pública com um clique. Quem decide se PODE é o servidor
      // (direitos.definirVisibilidade): obra de terceiro só fica pública se a
      // política do acervo estiver ligada no staff — e a recusa diz isso.
      if (d.sou_dono && !d.removida) {
        var publica = m.visibilidade === 'publica';
        c.appendChild(el('div', { class: 'linha' }, [
          C.botao(publica ? 'Tornar privada' : 'Tornar pública', function () {
            C.api('POST', '/music/api/obras/' + id + '/visibilidade', { visibilidade: publica ? 'privada' : 'publica' }, { cru: true })
              .then(function () { C.aviso(publica ? 'Agora só você (e suas bandas) veem esta música.' : 'Pública: qualquer pessoa do Musique encontra e toca esta música.'); T.musica(id); })
              .catch(C.erro);
          }, publica ? 'sec' : ''),
          el('span', { class: 'peq', txt: publica ? 'Todos os usuários do Musique encontram esta música na busca.'
            : (d.permissoes.publicar.pode ? 'Só você e as bandas com que você compartilhou veem.' : d.permissoes.publicar.motivo) }),
        ]));
      }
      var acoes = el('div', { class: 'cf-barra' });
      if (d.cifras[0]) acoes.appendChild(C.botao('Tocar', function () { C.ir('cifra', d.cifras[0].id); }));
      acoes.appendChild(C.botao(d.favorita ? '★ Favorita' : '☆ Favoritar', function () { api('POST', '/musicas/' + id + '/favorito').then(function () { T.musica(id); }); }, 'sec'));
      acoes.appendChild(C.botao('+ Nova versão', function () { C.ir('importar', null, { obra_id: id, titulo: m.titulo, artista: m.artista }); }, 'sec'));
      if (d.sou_dono) {
        acoes.appendChild(C.botao('Editar dados', function () { editarDados(d); }, 'sec'));
        acoes.appendChild(C.botao('Compartilhar com banda', function () { compartilharComBanda(d); }, 'sec'));
        acoes.appendChild(C.botao(d.removida ? 'Restaurar' : 'Mover para a lixeira', function () {
          if (d.removida) return api('POST', '/musicas/' + id + '/restaurar').then(function () { T.musica(id); });
          C.confirmar('Mover para a lixeira?', 'A música sai da biblioteca (e dos setlists ela continua marcada). Dá para restaurar depois.', 'Mover').then(function (s) {
            if (s) api('DELETE', '/musicas/' + id).then(function () { C.ir('biblioteca'); }).catch(C.erro);
          });
        }, 'sec'));
      }
      c.appendChild(acoes);

      // Versões
      c.appendChild(el('h3', { txt: 'Versões da cifra (' + d.cifras.length + ')' }));
      var sels = [];
      var lv = el('div', { class: 'cf-lista' });
      d.cifras.forEach(function (x) {
        var cb = el('input', { type: 'checkbox', 'aria-label': 'Selecionar para comparar' });
        sels.push({ cb: cb, id: x.id });
        var av = x.avaliacoes && x.avaliacoes.n ? ' · precisão ' + x.avaliacoes.precisao + '/5 (' + x.avaliacoes.n + ')' : '';
        lv.appendChild(el('div', { class: 'cf-linha-item' }, [cb, el('div', { class: 'cresce' }, [el('b', { txt: x.nome || 'Versão' }),
          el('span', { class: 'm', txt: ['tom ' + (x.tom || '?'), x.capo ? 'capo ' + x.capo : '', 'rev. ' + x.revisao_atual, 'qualidade ' + x.qualidade + av].filter(Boolean).join(' · ') })]),
        tagStatus(x.status), C.botao('Abrir', function () { C.ir('cifra', x.id); }, 'peq')]));
      });
      if (!d.cifras.length) lv.appendChild(C.estadoVazio('Nenhuma versão ainda', 'Importe ou escreva a cifra.'));
      c.appendChild(lv);
      if (d.cifras.length > 1) {
        c.appendChild(el('div', { class: 'linha' }, [C.botao('Comparar selecionadas', function () {
          var ids = sels.filter(function (s) { return s.cb.checked; }).map(function (s) { return s.id; });
          if (ids.length < 2) return C.aviso('Marque ao menos duas versões.');
          C.ir('comparar', null, { ids: ids });
        }, 'sec')]));
      }
      if (d.arranjos.length) {
        c.appendChild(el('h3', { txt: 'Arranjos' }));
        var la = el('div', { class: 'cf-lista' });
        d.arranjos.forEach(function (a) {
          la.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: a.nome }), el('span', { class: 'm', txt: ['tom ' + a.tom, a.capo ? 'capo ' + a.capo : '', a.bpm ? a.bpm + ' bpm' : '', a.vocalista].filter(Boolean).join(' · ') })]),
            tag(a.status === 'aprovado' ? 'aprovado' : a.status === 'em_revisao' ? 'em revisão' : 'rascunho', a.status === 'aprovado' ? 'ok' : 'av'),
            C.botao('Abrir', function () { C.ir('cifra', a.cifra_id, { arranjo: a.id }); }, 'peq')]));
        });
        c.appendChild(la);
      }
      // Mídia de referência
      c.appendChild(el('h3', { txt: 'Áudio e vídeo de referência' }));
      var lm = el('div', { class: 'cf-lista' });
      d.midias.forEach(function (x) {
        lm.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: x.titulo || x.tipo }), el('span', { class: 'm', txt: x.url ? x.url.replace(/^https:\/\//, '').slice(0, 60) : 'arquivo enviado' })]),
          x.url ? el('a', { class: 'btn sec peq', href: x.url, target: '_blank', rel: 'noopener noreferrer', txt: 'Abrir' }) : null,
          C.botao('Remover', function () { api('DELETE', '/midias/' + x.id).then(function () { T.musica(id); }).catch(C.erro); }, 'sec peq')]));
      });
      c.appendChild(lm);
      var url = el('input', { type: 'url', placeholder: 'https://… (YouTube, Spotify, áudio)', 'aria-label': 'Link' }), tit = el('input', { type: 'text', placeholder: 'Nome (ex.: gravação original)', 'aria-label': 'Nome' });
      var tipoMidia = sel([['audio', 'Áudio'], ['video', 'Vídeo'], ['playback', 'Playback']], 'audio', function () {}, 'Tipo');
      c.appendChild(el('div', { class: 'cf-barra' }, [url, tit, tipoMidia,
        C.botao('Adicionar link', function () {
          api('POST', '/musicas/' + id + '/midias', { url: url.value, titulo: tit.value, tipo: tipoMidia.value }).then(function () { T.musica(id); }).catch(C.erro);
        }, 'sec')]));
      // Procedência
      if (d.fontes.length) {
        c.appendChild(el('h3', { txt: 'Procedência' }));
        var lf = el('div', { class: 'cf-lista' });
        d.fontes.forEach(function (x) {
          lf.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: ({ texto: 'Texto colado', arquivo: 'Arquivo', url: 'Página da web', busca: 'Busca externa', manual: 'Escrita à mão' }[x.tipo] || x.tipo) + (x.adaptador ? ' · ' + x.adaptador : '') }),
            el('span', { class: 'm', txt: [C.data(x.importado_em), x.metodo, 'confiança ' + Math.round((x.confianca || 0) * 100) + '%', x.url].filter(Boolean).join(' · ') })])]));
        });
        c.appendChild(lf);
      }
      if (d.sou_dono) {
        c.appendChild(el('h3', { txt: 'Titularidade' }));
        c.appendChild(el('p', { class: 'peq', txt: 'Declare de quem é a obra. Obra de terceiro fica no seu acervo e nas suas bandas; o que é seu ou está em domínio público pode ser publicado.' }));
        c.appendChild(el('div', { class: 'linha' }, [sel([['terceiro_privado', 'Obra de terceiro'], ['propria', 'Obra minha'], ['dominio_publico', 'Domínio público'], ['licenciada', 'Tenho licença']], m.titularidade, function (v) {
          C.api('POST', '/music/api/obras/' + id + '/titularidade', { tipo: v }, { cru: true }).then(function () { C.aviso('Titularidade registrada.'); }).catch(C.erro);
        }, 'Titularidade')]));
      }
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, function () { T.musica(id); })); });
  };

  function editarDados(d) {
    var m = d.musica;
    var f = el('div', { class: 'cf-form' });
    var campos = {};
    [['titulo', 'Título'], ['artista', 'Artista'], ['compositor', 'Compositor(es)'], ['album', 'Álbum'], ['ano', 'Ano'], ['genero', 'Gênero'], ['subgenero', 'Subgênero'],
      ['idioma', 'Idioma'], ['tom_original', 'Tom original'], ['andamento_bpm', 'BPM'], ['compasso', 'Compasso (ex. 4/4)'], ['duracao_s', 'Duração (s)'], ['afinacao', 'Afinação'], ['capo_sugerido', 'Capo sugerido']]
      .forEach(function (x) { var i = el('input', { type: 'text', value: m[x[0]] === undefined || m[x[0]] === 0 ? '' : m[x[0]] }); campos[x[0]] = i; f.appendChild(el('label', {}, [el('span', { txt: x[1] }), i])); });
    var dif = sel([['', '—'], ['iniciante', 'Iniciante'], ['intermediario', 'Intermediário'], ['avancado', 'Avançado']], m.dificuldade, function () {}, 'Dificuldade');
    f.appendChild(el('label', {}, [el('span', { txt: 'Dificuldade' }), dif]));
    var tags = el('input', { type: 'text', value: (m.tags || []).join(', ') });
    f.appendChild(el('label', {}, [el('span', { txt: 'Tags (vírgula)' }), tags]));
    var alias = el('input', { type: 'text', value: (d.aliases || []).join(', ') });
    f.appendChild(el('label', {}, [el('span', { txt: 'Títulos alternativos' }), alias]));
    C.modal('Dados da música', f, [{ txt: 'Cancelar' }, { txt: 'Salvar', fn: function () {
      var dados = {};
      Object.keys(campos).forEach(function (k) { dados[k] = campos[k].value; });
      dados.dificuldade = dif.value;
      dados.tags = tags.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      dados.aliases = alias.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      api('PATCH', '/musicas/' + m.id, dados).then(function () { T.musica(m.id); }).catch(C.erro);
    } }]);
  }

  function compartilharComBanda(d) {
    var bandas = (C.estado.inicio && C.estado.inicio.bandas) || [];
    if (!bandas.length) return C.modal('Você ainda não tem banda', 'Crie uma banda (aba Bandas) e convide quem toca com você.', [{ txt: 'Ir para Bandas', fn: function () { C.ir('bandas'); } }]);
    var s = sel(bandas.map(function (b) { return [b.id, b.nome]; }), bandas[0].id, function () {}, 'Banda');
    var box = el('div', {}, [el('p', { txt: 'Os membros da banda vão ver e tocar esta música, cada um no seu instrumento. Quem não é da banda continua sem acesso.' }), s]);
    if (d.compartilhada_com.length) box.appendChild(el('p', { class: 'peq', txt: 'Já compartilhada com: ' + d.compartilhada_com.map(function (b) { return b.nome; }).join(', ') }));
    C.modal('Compartilhar com a banda', box, [{ txt: 'Cancelar' }, { txt: 'Compartilhar', fn: function () {
      api('POST', '/bandas/' + s.value + '/musicas', { obra_id: d.musica.id }).then(function () { C.aviso('Compartilhada.'); T.musica(d.musica.id); }).catch(C.erro);
    } }]);
  }

  // =================================================================
  // VISUALIZAÇÃO DA CIFRA
  // =================================================================
  T.cifra = function (id, extra) {
    extra = extra || {};
    var arranjoId = extra.arranjo || '';
    api('GET', '/cifras/' + id + (arranjoId ? '?arranjo=' + arranjoId : ''), null, { cache: 'cifra:' + id + ':' + arranjoId }).then(function (d) {
      api('POST', '/cifras/' + id + '/uso').catch(function () {});
      montarVisualizacao(d, extra);
    }).catch(function (e) {
      // Sem rede e sem cache: tenta nos pacotes de setlist baixados.
      if (e.semRede) return C.buscarNosPacotes(id).then(function (m) {
        if (!m) return C.limpar().appendChild(C.estadoErro(e));
        montarVisualizacao({ cifra: { id: id, versao: 0, revisao_atual: m.revisao, tom: m.tom_soando }, musica: { titulo: m.titulo, artista: m.artista }, documento: m.documento,
          arranjos: [], visao: null, preferencias: C.estado.prefs, pode: { editar: false }, nao_reconhecidos: [], tons: [], _offline: true }, extra);
      });
      C.limpar().appendChild(C.estadoErro(e, function () { T.cifra(id, extra); }));
    });
  };

  function visaoInicial(d, extra) {
    var p = d.preferencias || C.estado.prefs || {};
    var ex = p.exibicao || {};
    var vv = d.visao || {};
    var vx = vv.exibicao || {};
    var v = {
      instrumento: vv.instrumento || p.instrumento || 'violao', afinacao: vv.afinacao || p.afinacao || 'padrao',
      semitons: vv.transposicao || 0, tom: '', capo: vv.capo >= 0 && vv.capo !== undefined ? vv.capo : (d.cifra.capo || 0),
      simplificacao: vv.simplificacao || 0, grafia: p.grafia || 'auto', estilo: p.estilo_acorde || 'original',
      modo: vx.modo || ex.modo || 'letra_cifra', graus: vx.graus || ex.graus || '', fonte: vx.fonte || ex.fonte || 18,
      familia: vx.familia || ex.familia || 'mono', tema: vx.tema || ex.tema || 'claro', colunas: vx.colunas || ex.colunas || 1,
      espacamento: vx.espacamento || ex.espacamento || 1.35, largura: vx.largura || ex.largura || 100,
      diagramas: vx.diagramas !== undefined ? vx.diagramas : (ex.diagramas !== undefined ? ex.diagramas : true),
      canhoto: !!p.canhoto, ocultacao: 0, rolagem: Object.assign({ modo: 'manual', velocidade: 30 }, p.rolagem || {}, vv.rolagem || {}),
    };
    if (d.arranjo && d.arranjo.tom) v.tom = d.arranjo.tom;
    if (extra.tom) v.tom = extra.tom;
    return v;
  }

  function montarVisualizacao(d, extra) {
    var c = C.limpar();
    var v = visaoInicial(d, extra);
    var docCru = d.documento;
    var estado = { d: d, v: v, meus: [], comentarios: new Set() };
    C.estado.cifraAtual = estado;

    var cab = el('div', {});
    cab.appendChild(el('div', { class: 'linha' }, [C.botao('← Música', function () { C.ir('musica', d.cifra.obra_id || (d.musica && d.musica.id)); }, 'sec peq'),
      el('span', { class: 'peq', txt: (d.cifra.nome || '') + (d.arranjo ? ' · arranjo: ' + d.arranjo.nome : '') + ' · revisão ' + d.cifra.revisao_atual })]));
    cab.appendChild(el('h2', { txt: (d.musica && d.musica.titulo) || docCru.meta.titulo || 'Cifra' }));
    var sub = el('p', { class: 'sub' });
    cab.appendChild(sub);
    if (d._offline) cab.appendChild(el('div', { class: 'cf-offline', txt: 'Sem internet: cifra do pacote offline (' + (d.cifra.tom || '') + ').' }));
    if ((d.nao_reconhecidos || []).length) cab.appendChild(el('div', { class: 'alerta', txt: 'O motor não reconheceu ' + d.nao_reconhecidos.length + ' acorde(s): ' + d.nao_reconhecidos.join(', ') + '. Eles aparecem sublinhados e transpõem só pela nota fundamental.' }));
    if (d.rascunho) cab.appendChild(el('div', { class: 'alerta', html: 'Você tem um rascunho não salvo desta cifra (' + esc(C.data(d.rascunho.atualizado_em)) + ').' }, [C.botao('Continuar editando', function () { C.ir('editor', d.cifra.id); }, 'sec peq')]));
    c.appendChild(cab);

    var ferr = el('div', { class: 'cf-ferr', role: 'toolbar', 'aria-label': 'Ferramentas da cifra' });
    c.appendChild(ferr);
    var areaDiag = el('div');
    c.appendChild(areaDiag);
    var areaDoc = el('div', { 'aria-live': 'off' });
    c.appendChild(areaDoc);
    var painel = el('div', { style: 'margin-top:16px' });
    c.appendChild(painel);

    var rolagem = new C.Rolagem(global, { velocidade: v.rolagem.velocidade, modo: v.rolagem.modo === 'pagina' ? 'pagina' : 'manual',
      aoMudar: function () { pintarFerramentas(); } });

    var salvarVisao = C.debounce(function () {
      if (d._offline) return;
      api('PUT', '/cifras/' + d.cifra.id + '/visao', { arranjo_id: d.arranjo ? d.arranjo.id : '', instrumento: v.instrumento, afinacao: v.afinacao,
        transposicao: v.semitons, capo: v.capo, simplificacao: v.simplificacao,
        exibicao: { fonte: v.fonte, familia: v.familia, tema: v.tema, colunas: v.colunas, modo: v.modo, espacamento: v.espacamento, largura: v.largura, diagramas: v.diagramas, graus: v.graus },
        rolagem: { modo: v.rolagem.modo, velocidade: rolagem.velocidade } }, { fila: true }).catch(function () {});
    }, 900);

    function atual() { return R.aplicarVisao(docCru, v); }

    function pintar() {
      var r = atual();
      estado.r = r;
      sub.textContent = [(d.musica && d.musica.artista) || docCru.meta.artista, 'soa em ' + (r.tom_soando || '?') + (r.tom_estimado ? ' (estimado)' : ''),
        r.capo ? 'capo na ' + r.capo + 'ª: formas de ' + r.tom_formas : '', docCru.meta.bpm ? docCru.meta.bpm + ' bpm' : '', docCru.meta.compasso].filter(Boolean).join(' · ');
      areaDiag.innerHTML = '';
      if (v.diagramas && v.modo !== 'letra') {
        areaDiag.appendChild(R.diagramas(r.doc, v.instrumento, { afinacao: v.afinacao, canhoto: v.canhoto, meus: estado.meus,
          aoEscolherForma: function (acorde, f) { escolherForma(acorde, f); } }));
      }
      areaDoc.innerHTML = '';
      areaDoc.appendChild(R.cifra(r.doc, { modo: v.modo, graus: v.graus, familia: v.familia, fonte: v.fonte, espacamento: v.espacamento, colunas: v.colunas,
        tema: v.tema, largura: v.largura, ocultacao: v.ocultacao, comentarios: estado.comentarios,
        aoClicarAcorde: function (ac, l, elm) {
          tocarAcorde(ac);
          // Clique no acorde: notas, grau e função no campo harmônico do tom, e o desenho.
          if (C.SmartPlay) C.SmartPlay.detalheAcorde(ac, elm, { tom: (estado.r || {}).tom_soando, instrumento: v.instrumento, afinacao: v.afinacao, canhoto: v.canhoto, tocar: tocarAcorde });
          if (estado.mic) estado.mic.irPara(elm);
        } }));
      if (estado.mic) estado.mic.recomecar();
      pintarFerramentas();
    }
    estado.pintar = pintar;
    // Seguir pelo microfone (experimental): acompanha os acordes COMO ESTÃO
    // desenhados (já no tom da tela) e rola a linha para o centro.
    estado.mic = C.Escuta.botaoSeguir(function () { return areaDoc; },
      function (linha) { linha.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, function () {});

    function tocarAcorde(ac) {
      var f = M.instrumentos.INSTRUMENTOS[v.instrumento];
      if (f && f.tipo === 'trastes') {
        var r = M.instrumentos.formas(ac, v.instrumento, { afinacao: v.afinacao, quantas: 1 });
        if (r.formas[0]) R.tocar(r.formas[0].casas.map(function (x, i) { return x < 0 ? null : r.cordas[i] + x; }).filter(function (x) { return x !== null; }));
      } else { var t = M.instrumentos.teclado(ac); if (t.mao_direita) R.tocar(t.mao_esquerda.concat(t.mao_direita)); }
    }

    function mudar(fn) { fn(); pintar(); salvarVisao(); }

    function pintarFerramentas() {
      ferr.innerHTML = '';
      var r = estado.r || atual();
      var tomAtual = r.tom_soando || '?';
      var ehMenor = /m$/.test(tomAtual);
      ferr.appendChild(grupo('Tom', [bt('−', function () { mudar(function () { v.semitons--; }); }, 'Meio tom abaixo'),
        sel([['', tomAtual]].concat(TONS.map(function (t) { return [t + (ehMenor ? 'm' : ''), t + (ehMenor ? 'm' : '')]; })), '', function (x) { mudar(function () { v.tom = x; v.semitons = 0; }); }, 'Tom de destino'),
        bt('+', function () { mudar(function () { v.semitons++; }); }, 'Meio tom acima')]));
      var cap = [bt('−', function () { mudar(function () { v.capo = Math.max(0, v.capo - 1); }); }, 'Capo uma casa abaixo'), el('b', { txt: String(v.capo) }),
        bt('+', function () { mudar(function () { v.capo = Math.min(11, v.capo + 1); }); }, 'Capo uma casa acima'), bt('?', sugerirCapo, 'Sugerir capotraste')];
      if ((M.instrumentos.INSTRUMENTOS[v.instrumento] || {}).tipo === 'trastes') ferr.appendChild(grupo('Capo', cap));
      var inst = C.estado.instrumentos && C.estado.instrumentos.length ? C.estado.instrumentos : M.instrumentos.catalogo();
      var afins = ((inst.filter(function (x) { return x.id === v.instrumento; })[0] || {}).afinacoes || []);
      ferr.appendChild(grupo('Instr.', [sel(inst.map(function (x) { return [x.id, x.nome]; }), v.instrumento, function (x) { mudar(function () { v.instrumento = x; v.afinacao = 'padrao'; }); }, 'Instrumento'),
        afins.length > 1 ? sel(afins.map(function (a) { return [a.id, a.nome.replace(/\s*\(.*\)$/, '')]; }), v.afinacao, function (x) { mudar(function () { v.afinacao = x; }); }, 'Afinação') : null].filter(Boolean)));
      ferr.appendChild(grupo('Simpl.', [sel([[0, 'original'], [1, 'sem tensões'], [2, 'tríades'], [3, 'básico']], v.simplificacao, function (x) { mudar(function () { v.simplificacao = Number(x); }); }, 'Simplificar acordes')]));
      ferr.appendChild(grupo('Fonte', [bt('A−', function () { mudar(function () { v.fonte = Math.max(12, v.fonte - 2); }); }, 'Diminuir fonte'),
        bt('A+', function () { mudar(function () { v.fonte = Math.min(56, v.fonte + 2); }); }, 'Aumentar fonte')]));
      ferr.appendChild(grupo('Rolar', [bt(rolagem.ativa() ? '⏸' : '▶', function () { rolagem.duracao_s = C.duracaoDaRolagem(docCru, v.rolagem); rolagem.alternar(v.rolagem.atraso_s || 0); }, rolagem.ativa() ? 'Pausar rolagem' : 'Iniciar rolagem'),
        bt('−', function () { rolagem.ajustar(-5); salvarVisao(); }, 'Mais devagar'), el('b', { txt: String(rolagem.velocidade) }), bt('+', function () { rolagem.ajustar(5); salvarVisao(); }, 'Mais rápido'), estado.mic]));
      var mais = el('div', { class: 'cf-mais linha', style: 'margin:0' });
      if (d.pode && d.pode.editar) mais.appendChild(C.botao('✏️ Editar cifra', function () { C.ir('editor', d.cifra.id); }, 'peq'));
      mais.appendChild(C.botao('🎧 Smart Play', function () { if (C.SmartPlay.ativo()) { C.SmartPlay.player(true); C.SmartPlay.tocar(); } else C.aviso('Esta música ainda não tem áudio: use o player embaixo para procurar no YouTube ou adicionar um MP3.'); }, 'peq'));
      mais.appendChild(C.botao('Palco', function () { C.palcoUmaMusica(estado); }, 'sec peq'));
      mais.appendChild(sel([['', 'Mais…'], ['exibicao', 'Exibição'], ['historico', 'Histórico de versões'], ['praticar', 'Praticar'], ['comentarios', 'Comentários e notas'],
        ['exportar', 'Exportar / imprimir'], ['compartilhar', 'Link e QR Code'], ['arranjo', 'Arranjos'], ['setlist', 'Adicionar a setlist'], ['original', 'Ver original importado'],
        ['avaliar', 'Avaliar / propor correção']].concat(C.temIA('revisar_harmonia') ? [['ia_harmonia', 'IA: revisar harmonia']] : []).concat(C.temIA('guia_instrumento') ? [['ia_guia', 'IA: guia do instrumento']] : []),
      '', function (x) { abrirPainel(x); }, 'Mais ações'));
      ferr.appendChild(mais);
    }

    function sugerirCapo() {
      var r = R.aplicarVisao(docCru, Object.assign({}, v, { capo: 0 }));
      var lista = M.instrumentos.sugerirCapotraste(M.documento.acordesEmOrdem(r.doc), { instrumento: v.instrumento, afinacao: v.afinacao });
      var box = el('div', { class: 'cf-lista' });
      lista.forEach(function (s) {
        box.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: s.capo ? 'Capo na ' + s.capo + 'ª casa' : 'Sem capotraste' }),
          el('span', { class: 'm', txt: s.formas.slice(0, 8).map(function (f) { return f.para; }).join(' ') + ' · ' + s.faceis + '/' + s.total + ' formas fáceis' })]),
        C.botao('Usar', function () { m.fechar(); mudar(function () { v.capo = s.capo; }); }, 'peq')]));
      });
      var m = C.modal('Capotraste: o som fica igual, muda a forma da mão', box, [{ txt: 'Fechar' }]);
    }

    function escolherForma(acorde, f) {
      var box = el('div', { class: 'cf-diags' });
      f.formas.forEach(function (forma) {
        var d2 = el('div', { class: 'cf-diag' }, [el('b', { txt: forma.desenho }), R.diagramaTrastes(forma, f.cordas, { canhoto: v.canhoto }), el('div', { class: 'm', txt: forma.nivel })]);
        d2.onclick = function () {
          api('PUT', '/voicings', { instrumento: v.instrumento, afinacao: v.afinacao, acorde: acorde, casas: forma.casas }).then(function () {
            estado.meus = estado.meus.filter(function (x) { return x.acorde !== acorde; }).concat([{ acorde: acorde, afinacao: v.afinacao, casas: forma.casas }]);
            mm.fechar(); pintar();
          }).catch(C.erro);
        };
        box.appendChild(d2);
      });
      var mm = C.modal('Escolha a sua forma de ' + acorde, box, [{ txt: 'Fechar' }]);
    }

    function abrirPainel(qual) {
      painel.innerHTML = '';
      if (!qual) return;
      var P = C.paineis[qual];
      if (P) P(painel, estado, { mudar: mudar, rolagem: rolagem, v: v, d: d, docCru: docCru });
      painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    estado.abrirPainel = abrirPainel;

    // voicings fixados e âncoras de comentário
    if (!d._offline) {
      api('GET', '/acordes?instrumento=' + v.instrumento + '&c=C').then(function (x) { estado.meus = x.meus || []; pintar(); }).catch(function () {});
      api('GET', '/comentarios?alvo_tipo=cifra&alvo_id=' + d.cifra.id).then(function (x) {
        (x.comentarios || []).forEach(function (cm) { if (cm.ancora && cm.ancora.linha_id) estado.comentarios.add(cm.ancora.linha_id); });
        pintar();
      }).catch(function () {});
    }
    // atalhos de teclado da leitura
    document.addEventListener('keydown', function atalho(e) {
      if (!document.body.contains(areaDoc)) { document.removeEventListener('keydown', atalho); rolagem.parar(); if (estado.mic) estado.mic.parar(); return; }
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === '+' || e.key === '=') mudar(function () { v.semitons++; });
      else if (e.key === '-') mudar(function () { v.semitons--; });
      else if (e.key === ' ') { e.preventDefault(); rolagem.duracao_s = C.duracaoDaRolagem(docCru, v.rolagem); rolagem.alternar(); }
      else if (e.key === 'p' || e.key === 'P') C.palcoUmaMusica(estado);
      else if ((e.key === 'e' || e.key === 'E') && d.pode && d.pode.editar) C.ir('editor', d.cifra.id);
    });
    pintar();
    // Ações que os comandos de voz usam (mesmas dos botões).
    estado.acoes = {
      transpor: function (n) { mudar(function () { v.semitons += n; }); },
      tom: function (t) { mudar(function () { v.tom = t; v.semitons = 0; }); },
      tomOriginal: function () { mudar(function () { v.tom = ''; v.semitons = 0; }); },
      fonte: function (p) { mudar(function () { v.fonte = Math.max(12, Math.min(56, v.fonte + 2 * p)); }); },
      rolar: function (ligar) { if (ligar === rolagem.ativa()) return; rolagem.duracao_s = C.duracaoDaRolagem(docCru, v.rolagem); rolagem.alternar(ligar ? v.rolagem.atraso_s || 0 : 0); },
      velocidade: function (p) { rolagem.ajustar(5 * p); salvarVisao(); },
    };
    // Smart Play: player fixo (MP3/YouTube), karaokê e rolagem junto com a música.
    if (C.SmartPlay && !d._offline) C.SmartPlay.anexar(estado, { areaDoc: areaDoc, docCru: docCru, obraId: d.cifra.obra_id || (d.musica && d.musica.id), cifraId: d.cifra.id });
  }

  // =================================================================
  // PAINÉIS da visualização
  // =================================================================
  C.paineis = {};
  C.paineis.exibicao = function (p, estado, x) {
    var v = x.v;
    p.appendChild(el('h3', { txt: 'Exibição' }));
    var f = el('div', { class: 'cf-form' });
    var campo = function (rot, s) { f.appendChild(el('label', {}, [el('span', { txt: rot }), s])); };
    campo('Modo', sel([['letra_cifra', 'Letra e cifra'], ['letra', 'Só letra'], ['acordes', 'Só acordes'], ['mapa', 'Mapa da música']], v.modo, function (y) { x.mudar(function () { v.modo = y; }); }));
    campo('Tema', sel([['claro', 'Claro'], ['escuro', 'Escuro'], ['sepia', 'Sépia'], ['preto', 'Preto (alto contraste)']], v.tema, function (y) { x.mudar(function () { v.tema = y; }); }));
    campo('Fonte', sel([['mono', 'Monoespaçada'], ['sans', 'Sem serifa'], ['serif', 'Serifada'], ['legivel', 'Alta legibilidade']], v.familia, function (y) { x.mudar(function () { v.familia = y; }); }));
    campo('Colunas', sel([[1, '1'], [2, '2'], [3, '3']], v.colunas, function (y) { x.mudar(function () { v.colunas = Number(y); }); }));
    campo('Espaçamento', sel([[1.15, 'Compacto'], [1.35, 'Normal'], [1.6, 'Amplo'], [2, 'Muito amplo']], v.espacamento, function (y) { x.mudar(function () { v.espacamento = Number(y); }); }));
    campo('Largura', sel([[100, 'Total'], [85, '85%'], [70, '70%'], [55, '55%']], v.largura, function (y) { x.mudar(function () { v.largura = Number(y); }); }));
    campo('Graus', sel([['', 'Não mostrar'], ['romano', 'Romanos (I, IV, V)'], ['nashville', 'Nashville (1, 4, 5)']], v.graus, function (y) { x.mudar(function () { v.graus = y; }); }));
    campo('Grafia', sel([['auto', 'Pelo tom'], ['sustenido', 'Sustenidos'], ['bemol', 'Bemóis']], v.grafia, function (y) { x.mudar(function () { v.grafia = y; }); }));
    campo('Acordes', sel([['original', 'Como escritos'], ['br', 'Padrão brasileiro (C7M)'], ['internacional', 'Internacional (Cmaj7)']], v.estilo, function (y) { x.mudar(function () { v.estilo = y; }); }));
    campo('Diagramas', sel([['1', 'Mostrar'], ['0', 'Esconder']], v.diagramas ? '1' : '0', function (y) { x.mudar(function () { v.diagramas = y === '1'; }); }));
    campo('Rolagem', sel([['manual', 'Velocidade manual'], ['duracao', 'Duração da música'], ['bpm', 'Pelo BPM'], ['pagina', 'Virar página']], v.rolagem.modo, function (y) {
      x.mudar(function () { v.rolagem.modo = y; x.rolagem.modo = y === 'pagina' ? 'pagina' : 'manual'; });
    }));
    campo('Atraso inicial (s)', (function () { var i = el('input', { type: 'number', min: '0', max: '60', value: v.rolagem.atraso_s || 0 }); i.onchange = function () { x.mudar(function () { v.rolagem.atraso_s = Number(i.value) || 0; }); }; return i; })());
    p.appendChild(f);
    p.appendChild(el('p', { class: 'peq', txt: 'Isto é só seu: muda a sua visão desta cifra, não a da banda nem o arquivo guardado.' }));
  };

  C.paineis.historico = function (p, estado) {
    var d = estado.d;
    p.appendChild(el('h3', { txt: 'Histórico de versões' }));
    var lista = el('div', { class: 'cf-lista' }); p.appendChild(lista);
    var area = el('div'); p.appendChild(area);
    api('GET', '/cifras/' + d.cifra.id + '/revisoes').then(function (r) {
      var marcadas = [];
      r.revisoes.forEach(function (rv) {
        var cb = el('input', { type: 'checkbox', 'aria-label': 'Comparar revisão ' + rv.numero });
        cb.onchange = function () { if (cb.checked) marcadas.push(rv.numero); else marcadas = marcadas.filter(function (n) { return n !== rv.numero; }); };
        var res = rv.resumo || {};
        lista.appendChild(el('div', { class: 'cf-linha-item' }, [cb, el('div', { class: 'cresce' }, [el('b', { txt: 'Revisão ' + rv.numero + ' · ' + ({ criacao: 'criação', edicao: 'edição', restauracao: 'restauração', importacao: 'importação', fusao: 'fusão', correcao: 'correção' }[rv.tipo] || rv.tipo) }),
          el('span', { class: 'm', txt: [rv.autor_nome, new Date(rv.criado_em).toLocaleString('pt-BR'), rv.descricao, res.acordes ? res.acordes + ' acorde(s)' : '', res.adicionadas ? '+' + res.adicionadas + ' linha(s)' : '', res.removidas ? '−' + res.removidas : ''].filter(Boolean).join(' · ') })]),
        rv.numero !== d.cifra.revisao_atual && d.pode && d.pode.editar ? C.botao('Restaurar', function () {
          C.confirmar('Restaurar a revisão ' + rv.numero + '?', 'Vira uma revisão NOVA com esse conteúdo. Nada do histórico se perde.', 'Restaurar').then(function (ok) {
            if (ok) api('POST', '/cifras/' + d.cifra.id + '/restaurar', { numero: rv.numero }).then(function () { C.ir('cifra', d.cifra.id); }).catch(C.erro);
          });
        }, 'sec peq') : tag('atual', 'ok')]));
      });
      p.insertBefore(el('div', { class: 'linha' }, [C.botao('Comparar as duas marcadas', function () {
        if (marcadas.length !== 2) return C.aviso('Marque exatamente duas revisões.');
        var a = Math.min.apply(null, marcadas), b = Math.max.apply(null, marcadas);
        api('GET', '/cifras/' + d.cifra.id + '/comparar?a=' + a + '&b=' + b).then(function (x) {
          area.innerHTML = '';
          area.appendChild(el('h3', { txt: 'Da revisão ' + a + ' para a ' + b }));
          if (C.temIA('resumir_mudancas')) area.appendChild(C.botao('IA: resumir as mudanças', function () {
            api('POST', '/ia/resumir_mudancas', { cifra_id: d.cifra.id, a: a, b: b }).then(function (r2) { area.insertBefore(el('div', { class: 'alerta', txt: 'Sugestão da IA: ' + (r2.dados.resumo || '') }), area.children[1]); }).catch(C.erro);
          }, 'sec peq'));
          area.appendChild(C.renderDiff(x.diff));
        }).catch(C.erro);
      }, 'sec')]), lista);
    }).catch(function (e) { lista.appendChild(C.estadoErro(e)); });
  };

  /** Diferenças legíveis (usado no histórico, comparador e conflito). */
  C.renderDiff = function (diff) {
    var box = el('div', { class: 'cf-diff' });
    if (diff.estrutura && diff.estrutura.mudou) box.appendChild(el('div', { class: 'alerta', txt: 'A estrutura mudou: ' + diff.estrutura.antes.join(' → ') + '  ⇒  ' + diff.estrutura.depois.join(' → ') }));
    Object.keys(diff.meta || {}).forEach(function (k) { box.appendChild(el('div', { class: 'op acordes' }, [el('span', { class: 'rot', txt: 'dado: ' + k }), el('span', { txt: (diff.meta[k].antes || '—') + '  →  ' + (diff.meta[k].depois || '—') })])); });
    var mudancas = (diff.operacoes || []).filter(function (o) { return o.op !== 'igual'; });
    if (!mudancas.length && !Object.keys(diff.meta || {}).length) box.appendChild(C.estadoVazio('Nenhuma diferença', 'As duas versões são iguais.'));
    mudancas.forEach(function (o) {
      var txt = function (x) { return x ? (x.acordes ? x.acordes.replace(/\s+$/, '') + '\n' : '') + (x.letra || x.texto || '') : ''; };
      var rot = { adicionada: 'linha nova', removida: 'linha removida', acordes: 'acordes mudaram', grafia: 'só a grafia mudou' }[o.op] || o.op;
      box.appendChild(el('div', { class: 'op ' + o.op }, [el('span', { class: 'rot', txt: o.secao + ' · ' + rot }),
        el('span', { txt: o.op === 'acordes' || o.op === 'grafia' ? (o.acordes_antes + '  →  ' + o.acordes_depois + '\n' + ((o.depois && o.depois.letra) || '')) : txt(o.depois || o.antes) })]));
    });
    return box;
  };

  T.comparar = function (arg, extra) {
    var ids = (extra && extra.ids) || [];
    api('POST', '/cifras/comparar', { ids: ids }).then(function (r) {
      var c = C.limpar();
      c.appendChild(C.botao('← Voltar', function () { history.back(); T.biblioteca(); }, 'sec peq'));
      c.appendChild(el('h2', { txt: 'Comparar versões' }));
      r.comparacoes.forEach(function (cp) {
        c.appendChild(el('h3', { txt: 'Base × ' + (cp.nome || 'versão') + ' — ' + cp.diff.resumo.acordes + ' acorde(s), +' + cp.diff.resumo.adicionadas + ' / −' + cp.diff.resumo.removidas + ' linha(s)' }));
        c.appendChild(C.renderDiff(cp.diff));
      });
      c.appendChild(C.botao('Criar melhor versão (prévia da fusão)', function () {
        api('POST', '/cifras/fundir', { base: ids[0], outras: ids.slice(1) }).then(function (f) {
          var box = el('div', {});
          box.appendChild(el('p', { class: 'peq', txt: f.aviso }));
          f.divergencias.forEach(function (dv) { box.appendChild(el('div', { class: 'alerta ' + (dv.aplicado ? 'bom' : ''), txt: dv.secao + ': "' + dv.linha + '" — ' + (dv.aplicado ? 'trocado ' + dv.de + ' por ' + dv.escolhido + ' (maioria)' : 'empate: ' + dv.opcoes.map(function (o) { return o.acorde + ' (' + o.n + ')'; }).join(' × ') + ' — ficou ' + dv.escolhido) })); });
          box.appendChild(el('pre', { class: 'cf-doc mono', txt: f.texto }));
          C.modal('Prévia da melhor versão', box, [{ txt: 'Descartar' }, { txt: 'Salvar como revisão da base', fn: function () {
            api('PUT', '/cifras/' + ids[0], { documento: f.documento, versao: f.versao_base, tipo: 'fusao', descricao: 'Fusão de ' + ids.length + ' versões' })
              .then(function () { C.ir('cifra', ids[0]); }).catch(C.erro);
          } }]);
        }).catch(C.erro);
      }));
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e)); });
  };

  C.paineis.comentarios = function (p, estado) {
    var d = estado.d;
    p.appendChild(el('h3', { txt: 'Comentários da banda e notas privadas' }));
    var notas = el('textarea', { rows: '3', placeholder: 'Suas notas privadas desta música (só você vê)' });
    notas.value = (d.visao && d.visao.notas_privadas) || '';
    p.appendChild(notas);
    p.appendChild(C.botao('Salvar notas', function () { api('PUT', '/cifras/' + d.cifra.id + '/visao', { arranjo_id: d.arranjo ? d.arranjo.id : '', notas_privadas: notas.value }, { fila: true }).then(function (r) { C.aviso(r._enfileirado ? 'Sem internet: salvo no aparelho, sobe quando voltar.' : 'Notas salvas.'); }).catch(C.erro); }, 'sec peq'));
    var lista = el('div', { class: 'cf-lista' }); p.appendChild(lista);
    var ancora = {};
    var dica = el('p', { class: 'peq', txt: 'Toque numa linha da cifra para prender o comentário nela.' });
    p.appendChild(dica);
    document.querySelectorAll('.cf-l').forEach(function (l) {
      l.style.cursor = 'pointer';
      l.addEventListener('click', function () {
        ancora = { linha_id: l.getAttribute('data-linha'), secao_id: (l.closest('.cf-secao') || {}).getAttribute ? l.closest('.cf-secao').getAttribute('data-secao') : '' };
        dica.textContent = 'Comentário preso na linha: "' + l.textContent.trim().slice(0, 60) + '"';
      });
    });
    var bandas = (C.estado.inicio && C.estado.inicio.bandas) || [];
    var destino = sel([['', 'Nota privada (só eu)']].concat(bandas.map(function (b) { return [b.id, 'Banda: ' + b.nome]; })), '', function () {}, 'Destino');
    var txt = el('textarea', { rows: '2', placeholder: 'Escreva… use @nome para chamar alguém da banda' });
    p.appendChild(txt);
    p.appendChild(el('div', { class: 'linha' }, [destino, C.botao('Comentar', function () {
      api('POST', '/comentarios', { alvo_tipo: 'cifra', alvo_id: d.cifra.id, banda_id: destino.value, texto: txt.value, ancora: ancora }, { fila: true })
        .then(function (r) { txt.value = ''; if (r._enfileirado) C.aviso('Sem internet: o comentário sobe quando a conexão voltar.'); carregar(); }).catch(C.erro);
    })]));
    function carregar() {
      api('GET', '/comentarios?alvo_tipo=cifra&alvo_id=' + d.cifra.id).then(function (r) {
        lista.innerHTML = '';
        if (!r.comentarios.length) lista.appendChild(C.estadoVazio('Nenhum comentário', ''));
        r.comentarios.forEach(function (cm) {
          lista.appendChild(el('div', { class: 'cf-linha-item', style: cm.resolvido_em ? 'opacity:.6' : '' }, [el('div', { class: 'cresce' }, [el('b', { txt: (cm.autor_nome || 'Alguém') + (cm.banda_id ? '' : ' · nota privada') + (cm.ancora && cm.ancora.acorde ? ' · no ' + cm.ancora.acorde : '') }),
            el('span', { class: 'm', txt: cm.texto })]), C.botao(cm.resolvido_em ? 'Reabrir' : 'Resolver', function () { api('POST', '/comentarios/' + cm.id + '/resolver').then(carregar); }, 'sec peq'),
          cm.meu ? C.botao('Apagar', function () { api('DELETE', '/comentarios/' + cm.id).then(carregar); }, 'sec peq') : null]));
        });
      }).catch(function (e) { lista.innerHTML = ''; lista.appendChild(C.estadoErro(e)); });
    }
    carregar();
  };

  C.paineis.exportar = function (p, estado) {
    var d = estado.d, v = estado.v;
    p.appendChild(el('h3', { txt: 'Exportar e imprimir' }));
    var op = { diagramas: true, notas: false, metadados: true, usarVisao: true };
    var f = el('div', { class: 'cf-form' });
    [['usarVisao', 'Na visão atual (tom, capo, simplificação)'], ['diagramas', 'Incluir diagramas'], ['notas', 'Incluir minhas notas'], ['metadados', 'Incluir cabeçalho']].forEach(function (x) {
      var cb = el('input', { type: 'checkbox' }); cb.checked = op[x[0]]; cb.onchange = function () { op[x[0]] = cb.checked; };
      f.appendChild(el('label', { class: 'check', style: 'flex-direction:row' }, [cb, el('span', { txt: x[1] })]));
    });
    p.appendChild(f);
    function url(fmt) {
      var q = ['instrumento=' + v.instrumento, 'afinacao=' + v.afinacao, 'modo=' + v.modo, 'estilo=' + v.estilo];
      if (op.usarVisao) { var r = estado.r; q.push('semitons=' + (r.semitons || 0), 'capo=' + (v.capo || 0), 'simplificacao=' + (v.simplificacao || 0)); }
      if (op.diagramas) q.push('diagramas=1'); if (op.notas) q.push('notas=1'); if (!op.metadados) q.push('metadados=0');
      if (d.arranjo) q.push('arranjo=' + d.arranjo.id);
      return '/music/api/cifras/cifras/' + d.cifra.id + '/exportar/' + fmt + '?' + q.join('&');
    }
    p.appendChild(el('div', { class: 'linha' }, [['pdf', 'PDF'], ['txt', 'TXT'], ['chordpro', 'ChordPro'], ['json', 'JSON']].map(function (x) {
      var a = el('a', { class: 'btn sec', href: '#', txt: x[1] }); a.onclick = function (ev) { ev.preventDefault(); location.href = url(x[0]); }; return a;
    }).concat([C.botao('Imprimir esta tela', function () { global.print(); }, 'sec')])));
  };

  C.paineis.compartilhar = function (p, estado) {
    var d = estado.d, v = estado.v;
    p.appendChild(el('h3', { txt: 'Link compartilhável e QR Code' }));
    p.appendChild(el('p', { class: 'peq', txt: 'O link abre só a visão escolhida, tem validade e pode ser revogado. Para a banda, prefira compartilhar a música com a banda (cada um vê no seu instrumento).' }));
    var dias = sel([[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '1 ano']], 30, function () {}, 'Validade');
    var saida = el('div');
    p.appendChild(el('div', { class: 'linha' }, [dias, C.botao('Criar link', function () {
      api('POST', '/links', { alvo_tipo: 'cifra', alvo_id: d.cifra.id, dias: Number(dias.value), opcoes: { tom: estado.r.tom_soando, capo: v.capo, instrumento: v.instrumento, diagramas: v.diagramas, modo: v.modo } })
        .then(function (r) { mostrarLink(saida, location.origin + r.url); carregar(); }).catch(C.erro);
    })]));
    p.appendChild(saida);
    var lista = el('div', { class: 'cf-lista' }); p.appendChild(lista);
    function carregar() {
      api('GET', '/links?alvo_tipo=cifra&alvo_id=' + d.cifra.id).then(function (r) {
        lista.innerHTML = '';
        r.links.forEach(function (l) {
          lista.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: l.ativo ? 'Ativo até ' + C.data(l.expira_em) : 'Inativo' }), el('span', { class: 'm', txt: l.acessos + ' acesso(s) · criado ' + C.data(l.criado_em) })]),
            l.ativo ? C.botao('Revogar', function () { api('DELETE', '/links/' + l.id).then(carregar); }, 'sec peq') : null]));
        });
      }).catch(function () {});
    }
    carregar();
  };

  /** Mostra URL + QR + copiar. */
  C.mostrarLink = mostrarLink;
  function mostrarLink(box, url) {
    box.innerHTML = '';
    var i = el('input', { type: 'text', value: url, readonly: 'readonly', style: 'width:100%' });
    box.appendChild(el('div', { class: 'linha' }, [i, C.botao('Copiar', function () {
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { C.aviso('Link copiado.'); }, function () { i.select(); document.execCommand('copy'); });
    }, 'sec'), navigator.share ? C.botao('Enviar…', function () { navigator.share({ url: url }).catch(function () {}); }, 'sec') : null]));
    var qr = el('div', { class: 'cf-qr', 'aria-label': 'QR Code do link' });
    box.appendChild(qr);
    fetch('/music/api/cifras/qr?texto=' + encodeURIComponent(url)).then(function (r) { return r.text(); }).then(function (s) {
      // SVG gerado pelo nosso servidor (biblioteca qrcode), não conteúdo externo.
      qr.innerHTML = s;
    }).catch(function () {});
  }

  C.paineis.arranjo = function (p, estado) {
    var d = estado.d;
    p.appendChild(el('h3', { txt: 'Arranjos desta cifra' }));
    p.appendChild(el('p', { class: 'peq', txt: 'Arranjo é a leitura de uma banda: tom, capotraste, ordem das seções e notas. Ele aponta para a cifra — correção de acorde chega a todos.' }));
    var lista = el('div', { class: 'cf-lista' });
    (d.arranjos || []).forEach(function (a) {
      lista.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: a.nome }), el('span', { class: 'm', txt: ['tom ' + a.tom, a.capo ? 'capo ' + a.capo : '', a.status].filter(Boolean).join(' · ') })]),
        C.botao('Usar', function () { C.ir('cifra', d.cifra.id, { arranjo: a.id }); }, 'peq'),
        C.botao('Editar', function () { editarArranjo(d, a); }, 'sec peq')]));
    });
    p.appendChild(lista);
    p.appendChild(C.botao('+ Novo arranjo', function () { editarArranjo(d, null); }, 'sec'));
  };

  function editarArranjo(d, a) {
    var doc = d.documento;
    var bandas = (C.estado.inicio && C.estado.inicio.bandas) || [];
    var f = el('div', { class: 'cf-form' });
    var nome = el('input', { type: 'text', value: a ? a.nome : '' }), tom = el('input', { type: 'text', value: a ? a.tom : (d.cifra.tom || '') });
    var capo = el('input', { type: 'number', min: '0', max: '11', value: a ? a.capo : 0 }), bpm = el('input', { type: 'number', min: '0', max: '400', value: a ? a.bpm : (doc.meta.bpm || '') });
    var voc = el('input', { type: 'text', value: a ? a.vocalista : '' });
    var banda = sel([['', 'Pessoal (só meu)']].concat(bandas.map(function (b) { return [b.id, b.nome]; })), a ? a.banda_id : '', function () {}, 'Banda');
    [['Nome', nome], ['Tom', tom], ['Capotraste', capo], ['BPM', bpm], ['Vocalista', voc], ['Banda', banda]].forEach(function (x) { f.appendChild(el('label', {}, [el('span', { txt: x[0] }), x[1]])); });
    if (a) banda.disabled = true;
    var notas = el('textarea', { rows: '3', placeholder: 'Notas da banda (virada, quem começa, final)' }); notas.value = a ? a.notas_banda : '';
    var est = (a && a.estrutura && a.estrutura.length ? a.estrutura : doc.secoes.map(function (s) { return { secao_id: s.id, repetir: 1 }; })).slice();
    var lista = el('div', { class: 'cf-lista' });
    function pintarEst() {
      lista.innerHTML = '';
      est.forEach(function (x, i) {
        var s = doc.secoes.filter(function (y) { return y.id === x.secao_id; })[0];
        var rep = el('input', { type: 'number', min: '1', max: '16', value: x.repetir, style: 'width:64px', 'aria-label': 'Repetições' });
        rep.onchange = function () { x.repetir = Number(rep.value) || 1; };
        lista.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: s ? (s.rotulo || M.documento.ROTULO_PADRAO[s.tipo]) : x.secao_id })]), rep,
          bt('↑', function () { if (i) { est.splice(i - 1, 0, est.splice(i, 1)[0]); pintarEst(); } }, 'Subir'),
          bt('↓', function () { if (i < est.length - 1) { est.splice(i + 1, 0, est.splice(i, 1)[0]); pintarEst(); } }, 'Descer'),
          bt('⧉', function () { est.splice(i + 1, 0, { secao_id: x.secao_id, repetir: 1 }); pintarEst(); }, 'Repetir a seção'),
          bt('×', function () { est.splice(i, 1); pintarEst(); }, 'Tirar')]));
      });
    }
    pintarEst();
    var box = el('div', {}, [f, el('h3', { txt: 'Ordem tocada' }), lista, notas]);
    C.modal(a ? 'Editar arranjo' : 'Novo arranjo', box, [{ txt: 'Cancelar' }].concat(a && a.banda_id ? [{ txt: 'Aprovar', fn: function () { api('POST', '/arranjos/' + a.id + '/aprovar').then(function () { C.aviso('Arranjo aprovado.'); C.ir('cifra', d.cifra.id, { arranjo: a.id }); }).catch(C.erro); } }] : []).concat([{ txt: 'Salvar', fn: function () {
      var dados = { nome: nome.value, tom: tom.value, capo: Number(capo.value) || 0, bpm: Number(bpm.value) || 0, vocalista: voc.value, estrutura: est, notas_banda: notas.value };
      var req = a ? api('PATCH', '/arranjos/' + a.id, Object.assign(dados, { versao: a.versao })) : api('POST', '/cifras/' + d.cifra.id + '/arranjos', Object.assign(dados, { banda_id: banda.value }));
      req.then(function (r) { C.ir('cifra', d.cifra.id, { arranjo: r.arranjo.id }); }).catch(C.erro);
    } }]));
  }

  C.paineis.setlist = function (p, estado) {
    p.appendChild(el('h3', { txt: 'Adicionar a um setlist' }));
    api('GET', '/setlists').then(function (r) {
      if (!r.setlists.length) return p.appendChild(C.estadoVazio('Nenhum setlist ainda', '', C.botao('Criar setlist', function () { C.ir('setlists'); })));
      var s = sel(r.setlists.map(function (x) { return [x.id, x.nome]; }), r.setlists[0].id, function () {}, 'Setlist');
      p.appendChild(el('div', { class: 'linha' }, [s, C.botao('Adicionar (no tom ' + (estado.r.tom_soando || '') + ')', function () {
        api('POST', '/setlists/' + s.value + '/itens', { cifra_id: estado.d.cifra.id, cifra_arranjo_id: estado.d.arranjo ? estado.d.arranjo.id : '', tom_execucao: estado.r.tom_soando, capotraste: estado.v.capo })
          .then(function () { C.aviso('Adicionada ao setlist.'); }).catch(C.erro);
      })]));
    }).catch(C.erro);
  };

  C.paineis.original = function (p, estado) {
    api('GET', '/cifras/' + estado.d.cifra.id + '/original').then(function (r) {
      p.appendChild(el('h3', { txt: 'Original importado (' + (r.formato || '—') + ')' }));
      p.appendChild(r.original ? el('pre', { class: 'cf-doc mono', txt: r.original }) : C.estadoVazio('Sem original guardado', 'Esta cifra foi escrita no editor.'));
    }).catch(C.erro);
  };

  C.paineis.avaliar = function (p, estado) {
    var d = estado.d;
    p.appendChild(el('h3', { txt: 'Avaliar esta cifra' }));
    var pr = sel([[5, '5 — perfeita'], [4, '4'], [3, '3'], [2, '2'], [1, '1 — muito errada']], 5, function () {}, 'Precisão');
    var fa = sel([[5, '5 — fácil'], [4, '4'], [3, '3'], [2, '2'], [1, '1 — difícil']], 3, function () {}, 'Facilidade');
    var cm = el('input', { type: 'text', placeholder: 'Comentário útil (opcional)' });
    p.appendChild(el('div', { class: 'cf-barra' }, [el('label', {}, [el('span', { txt: 'Precisão ' }), pr]), el('label', {}, [el('span', { txt: 'Facilidade ' }), fa]), cm,
      C.botao('Enviar avaliação', function () { api('POST', '/cifras/' + d.cifra.id + '/avaliacao', { precisao: Number(pr.value), facilidade: Number(fa.value), comentario: cm.value }).then(function (r) { C.aviso('Obrigado! Média de precisão: ' + r.precisao); }).catch(C.erro); })]));
    if (!(d.pode && d.pode.editar)) {
      p.appendChild(el('h3', { txt: 'Achou um erro?' }));
      p.appendChild(el('p', { class: 'peq', txt: 'Você não edita esta cifra, mas pode PROPOR a correção: quem cuida dela recebe, compara e aceita ou recusa.' }));
      p.appendChild(C.botao('Propor correção no editor', function () { C.ir('editor', d.cifra.id, { proposta: true }); }, 'sec'));
    } else {
      api('GET', '/cifras/' + d.cifra.id + '/propostas').then(function (r) {
        var abertas = r.propostas.filter(function (x) { return x.status === 'aberta'; });
        if (!abertas.length) return;
        p.appendChild(el('h3', { txt: 'Propostas de correção (' + abertas.length + ')' }));
        abertas.forEach(function (pp) {
          p.appendChild(el('div', { class: 'cf-painel' }, [el('b', { txt: (pp.autor_nome || 'Alguém') + ': ' + (pp.descricao || '') }), C.renderDiff(pp.diff),
            el('div', { class: 'linha' }, [C.botao('Aceitar', function () { api('POST', '/propostas/' + pp.id + '/decidir', { aceitar: true }).then(function () { C.ir('cifra', d.cifra.id); }).catch(C.erro); }),
              C.botao('Recusar', function () { api('POST', '/propostas/' + pp.id + '/decidir', { aceitar: false }).then(function () { C.ir('cifra', d.cifra.id); }).catch(C.erro); }, 'sec')])]));
        });
      }).catch(function () {});
    }
    p.appendChild(el('p', {}, [C.botao('Denunciar conteúdo', function () {
      var m = el('input', { type: 'text', placeholder: 'Motivo' });
      C.modal('Denunciar', m, [{ txt: 'Cancelar' }, { txt: 'Enviar', fn: function () { api('POST', '/denuncias', { alvo_tipo: 'cifra', alvo_id: d.cifra.id, motivo: m.value }).then(function () { C.aviso('Denúncia enviada à moderação.'); }).catch(C.erro); } }]);
    }, 'sec peq')]));
  };

  C.paineis.ia_harmonia = function (p, estado) {
    p.appendChild(el('h3', { txt: 'IA: revisar a harmonia' }));
    p.appendChild(el('p', { class: 'peq', txt: 'São SUGESTÕES. Nada muda na cifra sem você aplicar no editor.' }));
    api('POST', '/ia/revisar_harmonia', { cifra_id: estado.d.cifra.id }).then(function (r) {
      var s = (r.dados && r.dados.sugestoes) || [];
      if (!s.length) return p.appendChild(C.estadoVazio('Nada a sugerir', 'A IA não achou acorde suspeito.'));
      s.forEach(function (x) { p.appendChild(el('div', { class: 'alerta' }, [el('b', { txt: x.de + ' → ' + x.para + ' (' + Math.round((x.confianca || 0) * 100) + '%)' }), el('span', { txt: ' ' + (x.motivo || '') })])); });
    }).catch(function (e) { p.appendChild(C.estadoErro(e)); });
  };
  C.paineis.ia_guia = function (p, estado) {
    p.appendChild(el('h3', { txt: 'IA: guia de estudo (' + (ROT_INST[estado.v.instrumento] || '') + ')' }));
    api('POST', '/ia/guia_instrumento', { cifra_id: estado.d.cifra.id, instrumento: estado.v.instrumento }).then(function (r) {
      p.appendChild(el('div', { class: 'alerta', txt: 'Rascunho da IA — confira com o seu professor.' }));
      p.appendChild(el('p', { txt: (r.dados && r.dados.guia) || '' }));
      ((r.dados && r.dados.pontos_dificeis) || []).forEach(function (x) { p.appendChild(el('div', { class: 'cf-linha-item', txt: x })); });
    }).catch(function (e) { p.appendChild(C.estadoErro(e)); });
  };

  // =================================================================
  // PRATICAR: áudio de referência, loop A/B, velocidade, metrônomo,
  // contagem, gravação de ensaio e memorização
  // =================================================================
  C.paineis.praticar = function (p, estado, x) {
    var d = estado.d, v = x.v;
    var inicioSessao = Date.now();
    var met = new C.Metronomo();
    met.bpm = Number(d.documento.meta.bpm) || 90;
    p.appendChild(el('h3', { txt: 'Praticar' }));
    var player = el('div', { class: 'cf-player cf-painel' });
    p.appendChild(player);
    // Metrônomo e contagem
    var bpm = el('input', { type: 'number', min: '30', max: '300', value: met.bpm, style: 'width:80px', 'aria-label': 'BPM' });
    bpm.onchange = function () { met.bpm = Number(bpm.value) || 90; };
    var tap = C.tapTempo();
    var contador = el('b', { txt: '' });
    player.appendChild(el('div', { class: 'linha' }, [el('span', { txt: 'BPM' }), bpm, C.botao('Tap', function () { var b = tap(); if (b) { met.bpm = b; bpm.value = b; } }, 'sec peq'),
      C.botao('Metrônomo', function (ev) { if (met.ativo) { met.desligar(); ev.target.textContent = 'Metrônomo'; } else if (met.ligar()) ev.target.textContent = 'Parar metrônomo'; }, 'sec peq'),
      C.botao('Contar e rolar', function () { met.contar(met.compasso, function () { x.rolagem.velocidade = x.rolagem.velocidade; x.rolagem.iniciar(); }, function (n) { contador.textContent = n ? String(n) : ''; }); }, 'sec peq'),
      contador, el('a', { class: 'btn sec peq', href: '/music/ferramentas', target: '_blank', txt: 'Afinador' })]));
    // Memorização
    player.appendChild(el('div', { class: 'linha' }, [el('span', { txt: 'Memorizar' }), sel([[0, 'Tudo visível'], [1, 'Esconder metade dos acordes'], [2, 'Esconder todos os acordes'], [3, 'Esconder acordes e parte da letra']], v.ocultacao, function (y) { x.mudar(function () { v.ocultacao = Number(y); }); }, 'Memorização')]));
    // Áudio de referência
    var areaAudio = el('div');
    player.appendChild(areaAudio);
    api('GET', '/musicas/' + (d.cifra.obra_id || '')).then(function (m) {
      var tocaveis = m.midias.filter(function (y) { return y.media_id || /\.(mp3|m4a|ogg|wav|aac|opus)(\?|$)/i.test(y.url); });
      var externos = m.midias.filter(function (y) { return tocaveis.indexOf(y) < 0; });
      externos.forEach(function (y) { areaAudio.appendChild(el('a', { class: 'btn sec peq', href: y.url, target: '_blank', rel: 'noopener noreferrer', txt: 'Abrir referência: ' + (y.titulo || y.tipo) })); });
      if (!tocaveis.length) { areaAudio.appendChild(el('p', { class: 'peq', txt: 'Sem áudio tocável aqui. Adicione um link de arquivo de áudio (https) ou grave o ensaio abaixo.' })); return; }
      var escolha = sel(tocaveis.map(function (y) { return [y.id, y.titulo || y.tipo]; }), tocaveis[0].id, function (id2) { carregarAudio(tocaveis.filter(function (y) { return y.id === id2; })[0]); }, 'Áudio');
      areaAudio.appendChild(escolha);
      var audio = el('audio', { controls: 'controls', preload: 'metadata' });
      audio.preservesPitch = true; audio.mozPreservesPitch = true; audio.webkitPreservesPitch = true;
      areaAudio.appendChild(audio);
      var loop = { a: null, b: null };
      var vel = sel([[0.5, '50%'], [0.6, '60%'], [0.75, '75%'], [0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%']], 1, function (y) { audio.playbackRate = Number(y); }, 'Velocidade');
      var info = el('span', { class: 'peq' });
      areaAudio.appendChild(el('div', { class: 'linha' }, [el('span', { txt: 'Velocidade (tom mantido)' }), vel,
        C.botao('A', function () { loop.a = audio.currentTime; info.textContent = 'A ' + C.minutos(Math.round(loop.a)); }, 'sec peq'),
        C.botao('B', function () { loop.b = audio.currentTime; info.textContent += ' → B ' + C.minutos(Math.round(loop.b)); }, 'sec peq'),
        C.botao('Sem loop', function () { loop.a = loop.b = null; info.textContent = ''; }, 'sec peq'), info]));
      // Tom do áudio: o som muda de altura e a velocidade fica a mesma
      // (WSOLA no Web Worker, neste aparelho). A posição e a velocidade de
      // estudo são mantidas ao trocar.
      var tomAudio = 0, urlOriginal = '';
      var rotTom = el('b', { txt: '0' }), estadoTom = el('span', { class: 'peq', 'aria-live': 'polite' });
      var aplicarTom = function (delta) {
        var novo = Math.max(-6, Math.min(6, tomAudio + delta));
        if (novo === tomAudio || !urlOriginal) return;
        var pos = audio.currentTime, vel2 = audio.playbackRate, tocando = !audio.paused;
        var usar = function (u) {
          tomAudio = novo; rotTom.textContent = (novo > 0 ? '+' : '') + novo; estadoTom.textContent = novo ? 'tom mudado; mesma velocidade' : '';
          audio.src = u; audio.addEventListener('loadedmetadata', function f() { audio.removeEventListener('loadedmetadata', f); audio.currentTime = pos; audio.playbackRate = vel2; if (tocando) audio.play().catch(function () {}); });
        };
        if (novo === 0) return usar(urlOriginal);
        C.Escuta.audioNoTom(urlOriginal, novo, function (f) { estadoTom.textContent = f; }).then(usar)
          .catch(function (e) { estadoTom.textContent = ''; C.erro(e); });
      };
      areaAudio.appendChild(el('div', { class: 'linha' }, [el('span', { txt: 'Tom do áudio' }),
        C.botao('−½', function () { aplicarTom(-1); }, 'sec peq'), rotTom, C.botao('+½', function () { aplicarTom(1); }, 'sec peq'), estadoTom,
        C.botao('Tirar os acordes deste áudio', function () {
          if (urlOriginal) C.ir('importar', null, { aba: 'audio', url: urlOriginal, titulo: (d.musica && d.musica.titulo) || '', obra_id: d.cifra.obra_id });
        }, 'sec peq')]));
      var marcasBox = el('div', { class: 'cf-marcas' });
      areaAudio.appendChild(el('p', { class: 'peq', txt: 'Marque onde cada seção começa: a cifra acompanha o áudio.' }));
      areaAudio.appendChild(marcasBox);
      var atual = null;
      function carregarAudio(midia) {
        atual = midia;
        api('GET', '/midias/' + midia.id + '/url').then(function (r) { urlOriginal = r.url; tomAudio = 0; rotTom.textContent = '0'; estadoTom.textContent = ''; audio.src = r.url; }).catch(C.erro);
        pintarMarcas();
      }
      function pintarMarcas() {
        marcasBox.innerHTML = '';
        d.documento.secoes.forEach(function (s) {
          var mk = (atual.marcadores || []).filter(function (z) { return z.secao_id === s.id; })[0];
          var b = C.botao((s.rotulo || M.documento.ROTULO_PADRAO[s.tipo] || 'Parte') + (mk ? ' ' + C.minutos(Math.round(mk.inicio_ms / 1000)) : ' ·'), function () {
            if (mk) { audio.currentTime = mk.inicio_ms / 1000; return; }
            atual.marcadores = (atual.marcadores || []).filter(function (z) { return z.secao_id !== s.id; }).concat([{ secao_id: s.id, inicio_ms: Math.round(audio.currentTime * 1000) }]);
            api('PUT', '/midias/' + atual.id + '/marcadores', { marcadores: atual.marcadores }).catch(C.erro);
            pintarMarcas();
          }, 'sec peq');
          marcasBox.appendChild(b);
        });
      }
      audio.addEventListener('timeupdate', function () {
        if (loop.a !== null && loop.b !== null && audio.currentTime >= loop.b) audio.currentTime = loop.a;
        var ms = audio.currentTime * 1000, sec = null;
        (atual.marcadores || []).forEach(function (z) { if (z.inicio_ms <= ms && (!sec || z.inicio_ms > sec.inicio_ms)) sec = z; });
        if (sec && sec.secao_id !== estado.secaoAtual) {
          estado.secaoAtual = sec.secao_id;
          document.querySelectorAll('.cf-secao').forEach(function (n) { n.classList.toggle('atual', n.getAttribute('data-secao') === sec.secao_id); });
          var alvo = document.querySelector('.cf-secao[data-secao="' + sec.secao_id + '"]');
          if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      carregarAudio(tocaveis[0]);
    }).catch(function () {});
    // Gravação de ensaio
    var gravar = C.botao('Gravar ensaio', function () { C.gravarEnsaio(d.cifra.obra_id, gravar); }, 'sec peq');
    player.appendChild(el('div', { class: 'linha' }, [gravar, el('span', { class: 'peq', txt: 'A gravação fica privada, na música (e a banda ouve se a música for da banda).' })]));
    // Sessão de prática
    player.appendChild(el('div', { class: 'linha' }, [C.botao('Encerrar sessão de prática', function () {
      var dur = Math.round((Date.now() - inicioSessao) / 1000);
      api('POST', '/cifras/' + d.cifra.id + '/pratica', { duracao_s: dur, bpm: met.bpm, ocultacao: v.ocultacao }).then(function (r) {
        C.aviso('Sessão registrada: ' + Math.round(dur / 60) + ' min. Total: ' + r.minutos + ' min em ' + r.dias_praticados + ' dia(s) — ' + r.etapa + '.');
        inicioSessao = Date.now();
      }).catch(C.erro);
    }, 'peq')]));
    api('GET', '/cifras/' + d.cifra.id + '/pratica').then(function (r) {
      player.appendChild(el('p', { class: 'peq', txt: 'Seu progresso: ' + r.sessoes + ' sessão(ões), ' + r.minutos + ' min, ' + r.dias_praticados + ' dia(s) · etapa: ' + r.etapa }));
    }).catch(function () {});
  };

  /** Grava pelo microfone e envia ao R2 pelo fluxo de upload do app. */
  C.gravarEnsaio = function (obraId, botao) {
    if (!global.MediaRecorder || !navigator.mediaDevices) return C.aviso('Este navegador não grava áudio.');
    if (C._gravador) { C._gravador.stop(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var partes = [];
      var rec = new MediaRecorder(stream);
      C._gravador = rec;
      botao.textContent = 'Parar e enviar';
      rec.ondataavailable = function (e) { if (e.data.size) partes.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        C._gravador = null; botao.textContent = 'Gravar ensaio';
        var blob = new Blob(partes, { type: rec.mimeType || 'audio/webm' });
        var ext = /ogg/.test(blob.type) ? 'ogg' : /mp4/.test(blob.type) ? 'm4a' : 'webm';
        C.api('POST', '/music/api/midias/upload', { tipo: 'gravacoes', ext: ext, mime: blob.type, bytes: blob.size }, { cru: true }).then(function (u) {
          return fetch(u.url, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } }).then(function (r) {
            if (!r.ok) throw new Error('O envio ao armazenamento falhou.');
            return C.api('POST', '/music/api/midias/' + u.midia_id + '/confirmar', {}, { cru: true });
          }).then(function () {
            return api('POST', '/musicas/' + obraId + '/midias', { media_id: u.midia_id, tipo: 'audio', titulo: 'Ensaio ' + new Date().toLocaleDateString('pt-BR') });
          });
        }).then(function () { C.aviso('Gravação enviada. Ela aparece no painel Praticar em instantes.'); }).catch(C.erro);
      };
      rec.start();
    }).catch(function () { C.aviso('Sem permissão para o microfone.'); });
  };

  // =================================================================
  // ACORDES (biblioteca de acordes)
  // =================================================================
  T.acordes = function (acordeInicial) {
    var p = C.estado.prefs || {};
    var st = { acorde: typeof acordeInicial === 'string' && acordeInicial ? acordeInicial : 'C', inst: p.instrumento || 'violao', afin: p.afinacao || 'padrao', canhoto: !!p.canhoto, tom: 'C' };
    var c = C.limpar();
    c.appendChild(el('h2', { txt: 'Biblioteca de acordes' }));
    c.appendChild(el('p', { class: 'sub', txt: 'As formas são CALCULADAS da teoria — qualquer acorde, em qualquer afinação. Clique para ouvir; clique com o botão direito (ou segure) para fixar como a sua forma.' }));
    var i = el('input', { type: 'text', value: st.acorde, 'aria-label': 'Acorde', style: 'max-width:200px' });
    var area = el('div');
    var ondeAparece = el('p', { class: 'peq' });

    // ---- ACORDES DAS SUAS MÚSICAS: o que está no seu acervo, do mais usado
    // para o menos usado. Um clique mostra as formas logo abaixo.
    var meus = el('div', { class: 'cf-meus-acordes' });
    c.appendChild(meus);
    var filtro = { artista: '', ordem: 'dicionario' };
    // Ordem de dicionário: pela nota fundamental (C, C#/Db, D… B) e, dentro
    // dela, do acorde mais simples para o mais longo.
    var NOTAS_DIC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
    var ROTULO_DIC = ['C', 'C# / Db', 'D', 'D# / Eb', 'E', 'F', 'F# / Gb', 'G', 'G# / Ab', 'A', 'A# / Bb', 'B'];
    function raizDic(a) { var m = /^([A-G])([#b]?)/.exec(a); if (!m) return 99; var v = NOTAS_DIC[m[1] + m[2]]; return v === undefined ? NOTAS_DIC[m[1]] : v; }
    function ordenar(lista) {
      var l = lista.slice();
      if (filtro.ordem === 'dicionario') l.sort(function (a, b) { return raizDic(a.acorde) - raizDic(b.acorde) || a.acorde.length - b.acorde.length || a.acorde.localeCompare(b.acorde); });
      else if (filtro.ordem === 'entrada') l.sort(function (a, b) { return String(a.primeira_vez).localeCompare(String(b.primeira_vez)) || b.n_musicas - a.n_musicas; });
      return l;   // 'uso': o servidor já manda do mais usado para o menos usado
    }
    function pintarMeus() {
      meus.innerHTML = '<p class="peq">Lendo os acordes das suas cifras…</p>';
      api('GET', '/acordes/do-acervo' + (filtro.artista ? '?artista=' + encodeURIComponent(filtro.artista) : '')).then(function (d) {
        meus.innerHTML = '';
        if (!d.musicas) {
          meus.appendChild(C.estadoVazio('Sem cifras no acervo ainda', 'Importe ou escreva uma cifra: os acordes dela aparecem aqui, dos mais usados para os menos usados.'));
          return;
        }
        var topo = el('div', { class: 'cf-barra' }, [el('h3', { txt: 'Acordes das suas músicas', style: 'margin:0' })]);
        if (d.artistas && d.artistas.length > 1) {
          topo.appendChild(sel([['', 'Todo o acervo']].concat(d.artistas.map(function (a) { return [a.artista, a.artista + ' (' + a.n + ')']; })),
            filtro.artista, function (x) { filtro.artista = x; pintarMeus(); }, 'Artista'));
        }
        topo.appendChild(sel([['dicionario', 'Dicionário (por nota)'], ['uso', 'Mais usados primeiro'], ['entrada', 'Ordem em que entraram']],
          filtro.ordem, function (x) { filtro.ordem = x; pintarMeus(); }, 'Ordem'));
        meus.appendChild(topo);
        meus.appendChild(el('p', { class: 'peq', txt: d.acordes.length + ' acordes em ' + d.musicas + ' música(s)' + (filtro.artista ? ' de ' + filtro.artista : '') +
          '. O dicionário cresce sozinho: cada cifra nova que entra no acervo traz os acordes dela para cá.' }));
        var chips = el('div', { class: 'cf-chips-acordes' });
        var grupoAtual = -1;
        ordenar(d.acordes).forEach(function (a) {
          if (filtro.ordem === 'dicionario') {
            var g = raizDic(a.acorde);
            if (g !== grupoAtual) {
              grupoAtual = g;
              chips = el('div', { class: 'cf-chips-acordes' });
              var bloco = el('div', { class: 'cf-dic-grupo' }, [el('div', { class: 'cf-dic-letra', txt: ROTULO_DIC[g] || '?' }), chips]);
              meus.appendChild(bloco);
            }
          }
          var b = el('button', { class: 'cf-chip-acorde', type: 'button', title: 'Aparece em ' + a.n_musicas + ' música(s)' }, [
            el('b', { txt: a.acorde }), el('span', { txt: String(a.n_musicas) })]);
          b.onclick = function () {
            i.value = a.acorde; st.acorde = a.acorde; pintar();
            var nomes = a.musicas.map(function (m) { return m.titulo; });
            ondeAparece.textContent = 'Aparece em ' + a.n_musicas + ' música(s): ' + nomes.slice(0, 12).join(', ') + (nomes.length > 12 ? '…' : '') + '.';
            area.scrollIntoView({ behavior: 'smooth', block: 'start' });
          };
          chips.appendChild(b);
        });
        if (filtro.ordem !== 'dicionario') meus.appendChild(chips);
      }).catch(function (e) { meus.innerHTML = ''; C.erro(e); });
    }
    pintarMeus();
    c.appendChild(el('h3', { txt: 'Procurar qualquer acorde' }));
    var inst = M.instrumentos.catalogo();
    var barra = el('div', { class: 'cf-barra' });
    function desenharBarra() {
      barra.innerHTML = '';
      barra.appendChild(i);
      barra.appendChild(sel(inst.map(function (x) { return [x.id, x.nome]; }), st.inst, function (x) { st.inst = x; st.afin = 'padrao'; desenharBarra(); pintar(); }, 'Instrumento'));
      var af = (inst.filter(function (x) { return x.id === st.inst; })[0] || {}).afinacoes || [];
      if (af.length > 1) barra.appendChild(sel(af.map(function (a) { return [a.id, a.nome]; }), st.afin, function (x) { st.afin = x; pintar(); }, 'Afinação'));
      var cb = el('label', { class: 'check', style: 'margin:0' }, [el('input', { type: 'checkbox' }), el('span', { txt: 'Canhoto' })]);
      cb.firstChild.checked = st.canhoto; cb.firstChild.onchange = function () { st.canhoto = cb.firstChild.checked; pintar(); };
      barra.appendChild(cb);
    }
    i.addEventListener('input', C.debounce(function () { st.acorde = i.value.trim(); ondeAparece.textContent = ''; pintar(); }, 250));
    desenharBarra();
    c.appendChild(barra);
    c.appendChild(ondeAparece);
    c.appendChild(area);
    var campo = el('div');
    c.appendChild(el('h3', { txt: 'Campo harmônico' }));
    c.appendChild(el('div', { class: 'linha' }, [sel(TONS.map(function (t) { return [t, t]; }).concat(TONS.map(function (t) { return [t + 'm', t + 'm']; })), st.tom, function (x) { st.tom = x; pintarCampo(); }, 'Tom')]));
    c.appendChild(campo);
    function pintar() {
      area.innerHTML = '';
      var ac = M.acorde.ler(st.acorde);
      if (!ac) return area.appendChild(C.estadoVazio('Não reconheci "' + st.acorde + '"', 'Tente C, Am7, D/F#, G7(13), Bbm7(b5)…'));
      area.appendChild(el('p', { txt: 'Notas: ' + M.acorde.notas(ac).map(function (pc) { return M.nota.nome(pc); }).join(' – ') + ' · ' + ac.intervalos.map(function (x) { return x.papel; }).join(', ') + (ac.ambiguidades.length ? ' · ' + ac.ambiguidades[0] : '') }));
      var tipo = (M.instrumentos.INSTRUMENTOS[st.inst] || {}).tipo;
      if (tipo === 'trastes') {
        var f = M.instrumentos.formas(st.acorde, st.inst, { afinacao: st.afin, quantas: 8 });
        if (!f.formas.length) return area.appendChild(C.estadoVazio('Sem forma', f.motivo));
        var box = el('div', { class: 'cf-diags', style: 'flex-wrap:wrap' });
        f.formas.forEach(function (forma) {
          var dg = el('div', { class: 'cf-diag', tabindex: '0' }, [el('b', { txt: forma.desenho }), R.diagramaTrastes(forma, f.cordas, { canhoto: st.canhoto }), el('div', { class: 'm', txt: forma.nivel + (forma.pestana ? ' · pestana na ' + forma.pestana.casa + 'ª' : '') })]);
          dg.onclick = function () { R.tocar(forma.casas.map(function (x, k) { return x < 0 ? null : f.cordas[k] + x; }).filter(function (x) { return x !== null; })); };
          dg.oncontextmenu = function (ev) { ev.preventDefault(); api('PUT', '/voicings', { instrumento: st.inst, afinacao: st.afin, acorde: st.acorde, casas: forma.casas }).then(function () { C.aviso('Forma fixada: ela aparece nas suas cifras.'); }).catch(C.erro); };
          box.appendChild(dg);
        });
        area.appendChild(box);
      } else if (tipo === 'teclado') {
        var t = M.instrumentos.teclado(st.acorde);
        var bx = el('div', { class: 'cf-diags', style: 'flex-wrap:wrap' });
        t.inversoes.forEach(function (inv) {
          var dg = el('div', { class: 'cf-diag' }, [el('b', { txt: inv.inversao ? inv.inversao + 'ª inversão' : 'Fundamental' }), R.teclado({ mao_direita: inv.notas, mao_esquerda: t.mao_esquerda }), el('div', { class: 'm', txt: inv.nomes.join(' ') })]);
          dg.onclick = function () { R.tocar(t.mao_esquerda.concat(inv.notas)); };
          bx.appendChild(dg);
        });
        area.appendChild(bx);
      } else {
        var b = M.instrumentos.baixo(st.acorde, { afinacao: st.afin });
        area.appendChild(el('div', { class: 'cf-diag', style: 'display:inline-block' }, [el('b', { txt: 'Baixo: ' + b.nota_do_baixo }), R.bracoBaixo(b, { canhoto: st.canhoto })]));
        area.appendChild(el('p', { txt: 'Arpejo: ' + b.arpejo.map(function (x) { return x.grau + ' ' + x.nota; }).join(' · ') }));
      }
    }
    function pintarCampo() {
      campo.innerHTML = '';
      var tom = M.nota.lerTom(st.tom);
      var g = el('div', { class: 'cf-grid' });
      R.sugestoesDoTom(tom).forEach(function (a) {
        var b = el('button', { class: 'cf-cartao', type: 'button' }, [el('b', { txt: a }), el('span', { class: 'm', txt: (M.harmonia.grau(a, tom) || {}).texto || '' })]);
        b.onclick = function () { i.value = a; st.acorde = a; pintar(); };
        g.appendChild(b);
      });
      campo.appendChild(g);
    }
    pintar(); pintarCampo();
  };

  // =================================================================
  // PREFERÊNCIAS
  // =================================================================
  T.preferencias = function () {
    api('GET', '/preferencias').then(function (p) {
      var c = C.limpar();
      c.appendChild(el('h2', { txt: 'Preferências musicais' }));
      var f = el('div', { class: 'cf-form' });
      var ex = p.exibicao || {}, ro = p.rolagem || {};
      var inst = M.instrumentos.catalogo();
      var cmp = {};
      var campo = function (k, rot, s) { cmp[k] = s; f.appendChild(el('label', {}, [el('span', { txt: rot }), s])); };
      campo('instrumento', 'Instrumento principal', sel(inst.map(function (x) { return [x.id, x.nome]; }), p.instrumento, function () {}));
      campo('afinacao', 'Afinação', sel(((inst.filter(function (x) { return x.id === p.instrumento; })[0] || {}).afinacoes || []).map(function (a) { return [a.id, a.nome]; }), p.afinacao, function () {}));
      campo('canhoto', 'Canhoto', sel([['0', 'Não'], ['1', 'Sim']], p.canhoto ? '1' : '0', function () {}));
      campo('grafia', 'Sustenido ou bemol', sel([['auto', 'Pelo tom (recomendado)'], ['sustenido', 'Sempre sustenido'], ['bemol', 'Sempre bemol']], p.grafia, function () {}));
      campo('notacao', 'Notação', sel([['internacional', 'Letras (C D E)'], ['latina', 'Sílabas (Dó Ré Mi)']], p.notacao, function () {}));
      campo('estilo_acorde', 'Grafia dos acordes', sel([['original', 'Como escritos'], ['br', 'Brasileira (C7M)'], ['internacional', 'Internacional (Cmaj7)']], p.estilo_acorde, function () {}));
      campo('fonte', 'Tamanho da fonte', sel([[14, '14'], [16, '16'], [18, '18'], [22, '22'], [26, '26'], [32, '32']], ex.fonte || 18, function () {}));
      campo('tema', 'Tema de leitura', sel([['claro', 'Claro'], ['escuro', 'Escuro'], ['sepia', 'Sépia'], ['preto', 'Preto (alto contraste)']], ex.tema || 'claro', function () {}));
      campo('familia', 'Família da fonte', sel([['mono', 'Monoespaçada'], ['sans', 'Sem serifa'], ['serif', 'Serifada'], ['legivel', 'Alta legibilidade']], ex.familia || 'mono', function () {}));
      campo('modo', 'Modo padrão', sel([['letra_cifra', 'Letra e cifra'], ['letra', 'Só letra'], ['acordes', 'Só acordes']], ex.modo || 'letra_cifra', function () {}));
      campo('rolagem', 'Rolagem padrão', sel([['manual', 'Manual'], ['duracao', 'Duração'], ['bpm', 'BPM'], ['pagina', 'Página']], ro.modo || 'manual', function () {}));
      campo('velocidade', 'Velocidade padrão', sel([[15, 'Lenta'], [30, 'Média'], [50, 'Rápida']], ro.velocidade || 30, function () {}));
      c.appendChild(f);
      c.appendChild(C.botao('Salvar preferências', function () {
        api('PUT', '/preferencias', { instrumento: cmp.instrumento.value, afinacao: cmp.afinacao.value, canhoto: cmp.canhoto.value === '1', grafia: cmp.grafia.value,
          notacao: cmp.notacao.value, estilo_acorde: cmp.estilo_acorde.value,
          exibicao: { fonte: Number(cmp.fonte.value), tema: cmp.tema.value, familia: cmp.familia.value, modo: cmp.modo.value },
          rolagem: { modo: cmp.rolagem.value, velocidade: Number(cmp.velocidade.value) } }).then(function (np) { C.estado.prefs = np; C.aviso('Preferências salvas.'); }).catch(C.erro);
      }));
      api('GET', '/reputacao').then(function (r) {
        c.appendChild(el('h3', { txt: 'Sua contribuição' }));
        c.appendChild(el('p', { txt: r.nivel + ' · ' + r.pontos + ' ponto(s) · ' + r.correcoes_aceitas + ' correção(ões) aceita(s) · ' + r.avaliacoes_recebidas + ' avaliação(ões) recebida(s)' }));
      }).catch(function () {});
      c.appendChild(el('h3', { txt: 'Seus dados (LGPD)' }));
      c.appendChild(el('div', { class: 'linha' }, [el('a', { class: 'btn sec', href: '/music/api/cifras/meus-dados', txt: 'Baixar todos os meus dados' }),
        C.botao('Excluir todas as minhas cifras', function () {
          var i = el('input', { type: 'text', placeholder: 'EXCLUIR MINHAS CIFRAS' });
          C.modal('Excluir de verdade', el('div', {}, [el('p', { txt: 'Isto apaga todas as músicas, cifras, revisões, arranjos e setlists que são SEUS. Não dá para desfazer. Baixe os seus dados antes. Digite a frase:' }), i]),
            [{ txt: 'Cancelar' }, { txt: 'Excluir', fn: function () { api('POST', '/meus-dados/excluir', { confirmacao: i.value }).then(function (r) { C.aviso(r.musicas_excluidas + ' música(s) excluída(s).'); C.ir('inicio'); }).catch(C.erro); } }]);
        }, 'sec')]));
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, T.preferencias)); });
  };
})(window);
