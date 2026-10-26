// =====================================================================
// Musique · Laboratório — CLIENTE · base. Sem build, sem framework
// (padrão da casa). O núcleo (window.MusiqueLab) já está carregado.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab;
  var C = L.cliente = { ferramentas: {} };
  var N = L.notas;

  C.el = function (tag, a, filhos) {
    var e = d.createElement(tag);
    Object.keys(a || {}).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'txt') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;            // só SVG/HTML gerado pelo núcleo (escapado lá)
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (filhos || []).forEach(function (f) { if (f != null && f !== false) e.appendChild(typeof f === 'string' ? d.createTextNode(f) : f); });
    return e;
  };
  C.$ = function (s, r) { return (r || d).querySelector(s); };
  C.$$ = function (s, r) { return [].slice.call((r || d).querySelectorAll(s)); };
  C.limpar = function (e) { while (e.firstChild) e.removeChild(e.firstChild); return e; };

  var jornadaSyncTimer = null;
  C.guardar = function (k, v) {
    try { localStorage.setItem('musique-lab:' + k, JSON.stringify(v)); } catch (_) { /* sem armazenamento: tudo bem */ }
    var sincronizaveis = { 'jornada-guitarra': 1, 'jornada-guitarra-favoritos': 1, 'curso-bateria-concluidas-v1': 1, 'curso-contrabaixo-concluidas-v1': 1, 'curso-guitarra-perfil': 1, 'curso-guitarra-plano': 1, 'curso-guitarra-diario': 1, 'curso-guitarra-aulas-v1': 1, 'acordes-guitarra-progresso': 1, 'laboratorio-batidas-progresso': 1, 'tecnicas-guitarra-progresso': 1, 'improvisacao-guitarra-progresso': 1, 'repertorio-checkpoints': 1, 'aquecimento-guitarra-sessoes': 1, 'temporizador-estudo-sessoes': 1, 'checkin-semanal-guitarra': 1, 'painel-estudos-guitarra': 1, 'registro-sessoes-guitarra': 1 };
    if (sincronizaveis[k] && C.Jornada && !C.Jornada._aplicando && C.Jornada.sync) {
      clearTimeout(jornadaSyncTimer); jornadaSyncTimer = setTimeout(function () { C.Jornada.sync(false).catch(function () {}); }, 700);
    }
  };
  C.lerLocal = function (k, padrao) { try { var v = localStorage.getItem('musique-lab:' + k); return v == null ? padrao : JSON.parse(v); } catch (_) { return padrao; } };

  /** API do Musique. 401/402 viram erro com mensagem legível. */
  C.api = function (metodo, url, corpo) {
    return fetch(url, { method: metodo, credentials: 'same-origin', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.erro || ('Erro ' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
  };

  // Estado prático do aluno: cópia local para uso offline + snapshot na
  // conta para retomar a jornada em qualquer dispositivo autenticado.
  C.Jornada = {
    snapshot: function () {
      var teoria = {};
      try { teoria = JSON.parse(w.localStorage.getItem('musique-curso-teoria-concluidas-v1') || '{}') || {}; } catch (_) { teoria = {}; }
      return {
        jornada: C.lerLocal('jornada-guitarra', {}),
        favoritos: C.lerLocal('jornada-guitarra-favoritos', {}),
        curso: {
          perfil: C.lerLocal('curso-guitarra-perfil', null),
          plano: C.lerLocal('curso-guitarra-plano', null),
          diario: C.lerLocal('curso-guitarra-diario', []),
          aulas: C.lerLocal('curso-guitarra-aulas-v1', {})
        },
        repertorio: C.lerLocal('repertorio-checkpoints', []),
        aquecimentos: Number(C.lerLocal('aquecimento-guitarra-sessoes', 0)) || 0,
        sessoes_focadas: Number(C.lerLocal('temporizador-estudo-sessoes', 0)) || 0,
        checkin: C.lerLocal('checkin-semanal-guitarra', {}),
        curso_teoria: teoria,
        curso_bateria: C.lerLocal('curso-bateria-concluidas-v1', {}),
        acordes_guitarra: C.lerLocal('acordes-guitarra-progresso', {}),
        laboratorio_batidas: C.lerLocal('laboratorio-batidas-progresso', {}),
        tecnicas_guitarra: C.lerLocal('tecnicas-guitarra-progresso', {}),
        improvisacao_guitarra: C.lerLocal('improvisacao-guitarra-progresso', {}),
        registro_sessoes: C.lerLocal('registro-sessoes-guitarra', [])
      };
    },
    aplicar: function (p) {
      if (!p || typeof p !== 'object') return;
      this._aplicando = true;
      if (p.jornada && typeof p.jornada === 'object') C.guardar('jornada-guitarra', p.jornada);
      if (p.favoritos && typeof p.favoritos === 'object') C.guardar('jornada-guitarra-favoritos', p.favoritos);
      var curso = p.curso && typeof p.curso === 'object' ? p.curso : {};
      if (curso.perfil) C.guardar('curso-guitarra-perfil', curso.perfil);
      if (curso.plano) C.guardar('curso-guitarra-plano', curso.plano);
      if (Array.isArray(curso.diario)) C.guardar('curso-guitarra-diario', curso.diario);
      if (curso.aulas && typeof curso.aulas === 'object') C.guardar('curso-guitarra-aulas-v1', curso.aulas);
      if (p.acordes_guitarra && typeof p.acordes_guitarra === 'object') C.guardar('acordes-guitarra-progresso', p.acordes_guitarra);
      if (p.laboratorio_batidas && typeof p.laboratorio_batidas === 'object') C.guardar('laboratorio-batidas-progresso', p.laboratorio_batidas);
      if (p.tecnicas_guitarra && typeof p.tecnicas_guitarra === 'object') C.guardar('tecnicas-guitarra-progresso', p.tecnicas_guitarra);
      if (p.improvisacao_guitarra && typeof p.improvisacao_guitarra === 'object') C.guardar('improvisacao-guitarra-progresso', p.improvisacao_guitarra);
      if (Array.isArray(p.registro_sessoes)) C.guardar('registro-sessoes-guitarra', p.registro_sessoes);
      if (Array.isArray(p.repertorio)) C.guardar('repertorio-checkpoints', p.repertorio);
      if (p.aquecimentos != null) C.guardar('aquecimento-guitarra-sessoes', Number(p.aquecimentos) || 0);
      if (p.sessoes_focadas != null) C.guardar('temporizador-estudo-sessoes', Number(p.sessoes_focadas) || 0);
      if (p.checkin && typeof p.checkin === 'object') C.guardar('checkin-semanal-guitarra', p.checkin);
      if (p.curso_teoria && typeof p.curso_teoria === 'object') {
        try { w.localStorage.setItem('musique-curso-teoria-concluidas-v1', JSON.stringify(p.curso_teoria)); } catch (_) {}
      }
      if (p.curso_bateria && typeof p.curso_bateria === 'object') C.guardar('curso-bateria-concluidas-v1', p.curso_bateria);
      this._aplicando = false;
    },
    sync: function (avisar) {
      var self = this;
      return C.api('PUT', '/music/api/lab/jornada-guitarra', self.snapshot()).then(function (r) {
        try { w.localStorage.setItem('musique-jornada-sync-em', r.atualizado_em || new Date().toISOString()); } catch (_) {}
        if (avisar) C.aviso('Progresso sincronizado na sua conta.');
        return r;
      }).catch(function (e) {
        // Sem login/assinatura ou sem rede, o snapshot local continua válido.
        if (avisar) C.aviso(e.status === 401 ? 'Entre na sua conta para sincronizar o progresso.' : e.status === 402 ? 'A sincronização da jornada faz parte da assinatura.' : 'Sem conexão: o progresso continua salvo neste navegador.', 'erro');
        throw e;
      });
    },
    carregar: function () {
      var self = this;
      return C.api('GET', '/music/api/lab/jornada-guitarra').then(function (r) {
        if (r.progresso) self.aplicar(r.progresso);
        try { w.localStorage.setItem('musique-jornada-sync-em', r.atualizado_em || ''); } catch (_) {}
        return r;
      });
    }
  };

  var avisoT = null;
  C.aviso = function (msg, tipo) {
    var a = C.$('#lab-aviso');
    if (!a) { a = C.el('div', { id: 'lab-aviso', class: 'lab-aviso', role: 'status', 'aria-live': 'polite' }); d.body.appendChild(a); }
    a.textContent = msg; a.className = 'lab-aviso on ' + (tipo || '');
    clearTimeout(avisoT); avisoT = setTimeout(function () { a.className = 'lab-aviso'; }, 5000);
  };

  // ---- nomes e seletores comuns ----
  C.notacao = C.lerLocal('notacao', 'pt');
  C.nomeNota = function (n, oitava) { return N.nome(n, { notacao: C.notacao === 'cifra' ? 'cifra' : 'pt', glifo: true, oitava: !!oitava }); };
  C.TONICAS = (function () {
    var out = [];
    [0, 1, 2, 3, 4, 5, 6].forEach(function (li) { [0, 1, -1].forEach(function (alt) { out.push({ li: li, alt: alt, oitava: null }); }); });
    return out;
  })();

  C.select = function (id, rotulo, opcoes, valor, aoMudar) {
    var s = C.el('select', { id: id, onchange: function () { aoMudar(s.value); } }, opcoes.map(function (o) {
      return C.el('option', { value: o.valor, selected: String(o.valor) === String(valor) ? true : null, txt: o.rotulo });
    }));
    return C.el('div', { class: 'lab-campo' }, [C.el('label', { for: id, txt: rotulo }), s]);
  };
  C.selTonica = function (valor, aoMudar, id) {
    return C.select(id || 'lab-tonica', 'Tônica', C.TONICAS.map(function (n) { return { valor: N.slug(n), rotulo: N.nomeDuplo(n) }; }), valor, aoMudar);
  };
  C.selEscala = function (valor, aoMudar, comVazio) {
    var ops = L.escalas.CATALOGO.map(function (e) { return { valor: e.id, rotulo: e.nome }; });
    if (comVazio) ops.unshift({ valor: '', rotulo: '— nenhuma —' });
    return C.select('lab-escala', 'Escala / modo', ops, valor, aoMudar);
  };
  C.selAcorde = function (valor, aoMudar, comVazio) {
    var ops = L.acordes.CATALOGO.map(function (c) { return { valor: c.id, rotulo: (c.simbolos[0] || 'maior') + ' — ' + c.nome }; });
    if (comVazio) ops.unshift({ valor: '', rotulo: '— nenhum —' });
    return C.select('lab-acorde', 'Acorde', ops, valor, aoMudar);
  };
  C.selNotacao = function (aoMudar) {
    return C.select('lab-notacao', 'Nomes', [{ valor: 'pt', rotulo: 'dó ré mi' }, { valor: 'cifra', rotulo: 'C D E' }], C.notacao, function (v) { C.notacao = v; C.guardar('notacao', v); aoMudar(v); });
  };

  /** Deep link: guarda o estado de TEORIA na URL (nunca dado pessoal). */
  C.gravarUrl = function (st) {
    try {
      var q = new URLSearchParams();
      if (st.tonica) q.set('t', st.tonica);
      if (st.escala) q.set('e', st.escala);
      if (st.acorde) q.set('a', st.acorde);
      if (st.instrumento && st.instrumento !== 'violao') q.set('i', st.instrumento);
      if (st.afinacao && st.afinacao !== 'padrao') q.set('af', st.afinacao);
      if (st.canhoto) q.set('canhoto', '1');
      if (st.clave && st.clave !== 'sol') q.set('c', st.clave);
      if (st.modo === 'menor') q.set('m', 'menor');
      var s = q.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
    } catch (_) { /* sem history: segue */ }
  };

  C.carregarScript = function (src) {
    return new Promise(function (ok, falha) {
      if (C.$('script[src="' + src + '"]')) return ok();
      var s = d.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { falha(new Error('Não carregou ' + src)); }; d.head.appendChild(s);
    });
  };

  C.salvarJson = function (nome, dados) {
    var valor = dados;
    try { valor = typeof dados === 'string' ? JSON.parse(dados) : dados; } catch (_) { return Promise.reject(new Error('JSON inválido.')); }
    try { localStorage.setItem('musique-lab-json:' + nome, JSON.stringify(valor)); } catch (_) { /* cópia local opcional */ }
    return C.api('PUT', '/music/api/lab/arquivos-json', { nome: nome, dados: valor });
  };
  C.baixar = function (nome, tipo, dados) {
    var ehJson = /json/i.test(tipo || '') || /\.json$/i.test(nome || '');
    if (ehJson && C.salvarJson) {
      C.salvarJson(nome, dados).then(function () { C.aviso('JSON salvo na sua conta e baixado.'); }).catch(function (e) {
        C.aviso(e.status === 401 ? 'JSON baixado. Entre na sua conta para também guardá-lo no Musique.' : e.status === 402 ? 'JSON baixado. A cópia na conta faz parte da assinatura.' : 'JSON baixado; a cópia na conta não pôde ser atualizada.', 'erro');
      });
    }
    var b = new Blob([dados], { type: tipo }); var u = URL.createObjectURL(b);
    var a = C.el('a', { href: u, download: nome }); d.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  };

  /** Converte um SVG gerado pelo laboratório em PNG no navegador. */
  C.baixarPng = function (nome, svgTexto, largura, altura) {
    try {
      var b = new Blob([svgTexto], { type: 'image/svg+xml;charset=utf-8' });
      var u = URL.createObjectURL(b), img = new Image();
      img.onload = function () {
        var c = d.createElement('canvas'); c.width = largura || img.naturalWidth || 1200; c.height = altura || img.naturalHeight || 800;
        var ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (png) { if (png) C.baixar(nome, 'image/png', png); else C.aviso('O navegador não conseguiu criar o PNG.', 'erro'); URL.revokeObjectURL(u); }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(u); C.aviso('Não consegui converter a visualização para PNG.', 'erro'); };
      img.src = u;
    } catch (e) { C.aviso('Não consegui exportar PNG: ' + e.message, 'erro'); }
  };

  // ---- delegação global: qualquer botão .lab-ouvir toca ----
  d.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.lab-ouvir');
    if (!b || !C.Som) return;
    ev.preventDefault();
    try {
      if (b.dataset.hz) return C.Som.tocarHz([Number(b.dataset.hz)], { dur: 1.6 });
      if (b.dataset.sequencia) return C.Som.sequencia(JSON.parse(b.dataset.sequencia), { dur: 1.1 });
      var ms = JSON.parse(b.dataset.midis || '[]');
      C.Som.tocar(ms, { modo: b.dataset.modo || 'melodico', dur: b.dataset.dur ? Number(b.dataset.dur) : undefined, passo: b.dataset.passo ? Number(b.dataset.passo) : undefined, vel: b.dataset.vel ? Number(b.dataset.vel) : undefined });
    } catch (e) { C.aviso('Não consegui tocar: ' + e.message, 'erro'); }
  });

  // ---- busca com sugestões ao digitar (hub) ----
  function buscaViva() {
    var q = C.$('#lab-q'); var ul = C.$('#lab-sugestoes');
    if (!q || !ul) return;
    var t = null;
    q.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        C.limpar(ul);
        var r = q.value.trim() ? L.catalogo.buscar(q.value, { limite: 8 }) : [];
        r.forEach(function (x) { ul.appendChild(C.el('li', {}, [C.el('a', { href: x.url }, [C.el('strong', { txt: x.titulo }), ' ', C.el('small', { txt: x.grupo })])])); });
      }, 120);
    });
  }

  // ---- favoritos (assinatura): o botão aparece em toda página ----
  function botaoFavorito() {
    var m = C.$('.lab-migalhas');
    if (!m || /\/(buscar|atividade)/.test(location.pathname)) return;
    var b = C.el('button', { type: 'button', class: 'lab-fav', 'aria-pressed': 'false', txt: '☆ Favoritar' });
    b.onclick = function () {
      var on = b.getAttribute('aria-pressed') === 'true';
      C.api(on ? 'DELETE' : 'POST', '/music/api/lab/favoritos', { url: location.pathname, titulo: (C.$('h1') || {}).textContent || d.title })
        .then(function () { b.setAttribute('aria-pressed', on ? 'false' : 'true'); b.textContent = on ? '☆ Favoritar' : '★ Favorito'; C.aviso(on ? 'Removido dos favoritos.' : 'Guardado nos favoritos.'); })
        .catch(function (e) { C.aviso(e.status === 401 ? 'Entre na sua conta para guardar favoritos.' : e.status === 402 ? 'Favoritos fazem parte da assinatura do Musique.' : e.message, 'erro'); });
    };
    m.appendChild(b);
    C.api('GET', '/music/api/lab/favoritos').then(function (r) {
      if ((r.favoritos || []).some(function (f) { return f.url === location.pathname; })) { b.setAttribute('aria-pressed', 'true'); b.textContent = '★ Favorito'; }
    }).catch(function () { /* sem conta: o botão fica, e explica ao clicar */ });
  }

  // ---- modo aula: tela cheia, letra e desenhos grandes, para projetar ----
  function botaoAula() {
    var m = C.$('.lab-migalhas');
    if (!m || !(C.$('#lab-ferramenta') || C.$('.lab-licao') || C.$('.lab-fig'))) return;
    var b = C.el('button', { type: 'button', class: 'lab-fav', 'aria-pressed': 'false', txt: '⛶ Modo aula' });
    var alternar = function (on) {
      d.body.classList.toggle('lab-aula', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? '✕ Sair do modo aula' : '⛶ Modo aula';
      try { if (on && d.documentElement.requestFullscreen) d.documentElement.requestFullscreen(); else if (!on && d.fullscreenElement) d.exitFullscreen(); } catch (_) { /* sem tela cheia: só amplia */ }
    };
    b.onclick = function () { alternar(!d.body.classList.contains('lab-aula')); };
    d.addEventListener('fullscreenchange', function () { if (!d.fullscreenElement && d.body.classList.contains('lab-aula')) alternar(false); });
    m.appendChild(b);
  }

  // ---- progresso local dos cursos editoriais ----
  function progressoCurso() {
    var cursoId = /\/curso-bateria(?:\/|$)/.test(w.location.pathname) ? 'curso-bateria' : /\/curso-contrabaixo(?:\/|$)/.test(w.location.pathname) ? 'curso-contrabaixo' : 'curso-teoria';
    var chave = 'musique-' + cursoId + '-concluidas-v1', concluidas = {};
    try { concluidas = JSON.parse(w.localStorage.getItem(chave) || '{}') || {}; } catch (_) { concluidas = {}; }
    function salvar() { try { w.localStorage.setItem(chave, JSON.stringify(concluidas)); } catch (_) { /* armazenamento indisponível */ } if (C.Jornada && C.Jornada.sync) C.Jornada.sync(false).catch(function () {}); }
    function atualizar() {
      var links = C.$$('.curso-modulo a[data-curso-slug]'), total = links.length, feitos = 0;
      links.forEach(function (a) { var ok = !!concluidas[a.getAttribute('data-curso-slug')]; a.classList.toggle('curso-feito', ok); var li = a.closest('li'); if (li) li.classList.toggle('curso-item-feito', ok); if (ok) feitos++; });
      var painel = C.$('#curso-progresso'); if (painel) painel.textContent = total ? 'Progresso neste navegador: ' + feitos + ' de ' + total + ' lições concluídas (' + Math.round(feitos / total * 100) + '%).' : 'As primeiras lições serão adicionadas em breve.';
      C.$$('.curso-nivel[data-curso-nivel]').forEach(function (nivel) { var ls = nivel.querySelectorAll('a[data-curso-slug]'), n = 0; Array.prototype.forEach.call(ls, function (a) { if (concluidas[a.getAttribute('data-curso-slug')]) n++; }); var p = nivel.querySelector('[data-curso-nivel-progresso]'); if (p) p.textContent = ls.length ? n + '/' + ls.length + ' · ' + Math.round(n / ls.length * 100) + '%' : 'sem lições publicadas'; });
      var proxima = C.$('#curso-proxima'); if (proxima) { var n = links.length && Array.prototype.find.call(links, function (a) { return !concluidas[a.getAttribute('data-curso-slug')]; }); if (n) { proxima.innerHTML = '<strong>Próxima lição recomendada:</strong> '; proxima.appendChild(C.el('a', { href: n.href, txt: n.textContent })); } else proxima.textContent = total ? 'Curso concluído neste navegador. Revise qualquer nível quando quiser.' : ''; }
      var b = C.$('.curso-concluir'); if (b) { var slug = b.getAttribute('data-curso-licao'), ok = !!concluidas[slug]; b.setAttribute('aria-pressed', ok ? 'true' : 'false'); b.textContent = ok ? '✓ Lição concluída — desfazer' : 'Marcar lição como concluída'; }
    }
    var botao = C.$('.curso-concluir'); if (botao) botao.onclick = function () { var slug = botao.getAttribute('data-curso-licao'); if (concluidas[slug]) delete concluidas[slug]; else concluidas[slug] = new Date().toISOString(); salvar(); atualizar(); C.aviso(concluidas[slug] ? 'Lição concluída neste navegador.' : 'Lição reaberta.'); };
    C.Jornada.carregar().then(function () { try { concluidas = JSON.parse(w.localStorage.getItem(chave) || '{}') || {}; } catch (_) {} atualizar(); }).catch(function () { atualizar(); });
  }

  function filtrosCurso() {
    var botoes = C.$$('.curso-filtro'); if (!botoes.length) return;
    var itens = C.$$('.curso-modulo li[data-curso-trilhas]'), status = C.$('#curso-filtro-status');
    var nomes = { todos: 'Todas', conhecer: 'Conhecer', ouvir: 'Ouvir e reconhecer', aplicar: 'Aplicar' };
    function aplicar(filtro) {
      var visiveis = 0;
      itens.forEach(function (item) { var mostra = filtro === 'todos' || item.getAttribute('data-curso-trilhas').split(' ').indexOf(filtro) >= 0; item.hidden = !mostra; if (mostra) visiveis++; });
      botoes.forEach(function (x) { var id = x.getAttribute('data-curso-filtro'); x.classList.toggle('ativo', id === filtro); x.setAttribute('aria-selected', id === filtro ? 'true' : 'false'); });
      if (status) status.textContent = (nomes[filtro] || filtro) + ': ' + visiveis + (visiveis === 1 ? ' lição visível.' : ' lições visíveis.') + (filtro === 'todos' ? ' Escolha uma trilha para filtrar.' : ' Clique em “Todas” para voltar a ver o curso inteiro.');
    }
    botoes.forEach(function (b) { b.onclick = function () { aplicar(b.getAttribute('data-curso-filtro')); }; });
    aplicar('todos');
  }

  function painelBateria() {
    var alvo = C.$('[data-bateria-dashboard]'); if (!alvo) return;
    C.api('GET', '/music/api/lab/bateria/painel').then(function (r) {
      var concl = Object.keys(r.capitulos || {}).length, p = r.progresso || [], dominados = p.filter(function (x) { return x.concluido && x.repeticoes_limpas >= 3; }).length;
      C.limpar(alvo); alvo.appendChild(C.el('div', { class: 'curso-dashboard-cards' }, [C.el('div', {}, [C.el('strong', { txt: Math.round(concl / 26 * 100) + '%' }), C.el('span', { txt: 'curso concluído' })]), C.el('div', {}, [C.el('strong', { txt: concl + '/26' }), C.el('span', { txt: 'capítulos' })]), C.el('div', {}, [C.el('strong', { txt: dominados + '/40' }), C.el('span', { txt: 'rudimentos consolidados' })]), C.el('div', {}, [C.el('strong', { txt: String((r.revisao_hoje || []).length) }), C.el('span', { txt: 'revisões hoje' })])]));
      var t = C.el('table', { class: 'lab-tabela' }, [C.el('caption', { txt: 'Evolução por rudimento' }), C.el('thead', {}, [C.el('tr', {}, ['Rudimento', 'BPM', 'Repetições limpas', 'Diagnóstico', 'Próxima revisão'].map(function (x) { return C.el('th', { scope: 'col', txt: x }); }))]), C.el('tbody', {}, p.map(function (x) { return C.el('tr', {}, [C.el('th', { scope: 'row', txt: String(x.rudimento) }), C.el('td', { txt: String(x.bpm || 0) }), C.el('td', { txt: String(x.repeticoes_limpas || 0) }), C.el('td', { txt: x.diagnostico || '—' }), C.el('td', { txt: x.proxima_revisao || '—' })]); }))]);
      alvo.appendChild(C.el('div', { class: 'lab-tabela-rolagem' }, [t]));
      var recentes = p.filter(function (x) { return x.ultima_pratica; }).sort(function (a, b) { return String(b.ultima_pratica).localeCompare(String(a.ultima_pratica)); }).slice(0, 5);
      alvo.appendChild(C.el('section', { class: 'curso-dashboard-recentes', 'aria-labelledby': 'bateria-recentes' }, [C.el('h2', { id: 'bateria-recentes', txt: 'Últimas práticas' }), recentes.length ? C.el('ul', { class: 'lab-resultados' }, recentes.map(function (x) { return C.el('li', {}, [C.el('strong', { txt: 'Rudimento ' + x.rudimento }), ' · ' + String(x.ultima_pratica).replace('T', ' ').replace('Z', '') + ' · BPM ' + (x.bpm || 0) + ' · ' + (x.repeticoes_limpas || 0) + ' repetição(ões) limpas']); })) : C.el('p', { class: 'lab-dica', txt: 'Ainda não há práticas registradas no servidor.' })]));
      alvo.appendChild(C.el('p', { class: 'lab-dica', txt: 'O histórico detalhado fica salvo na sua conta. Pratique um rudimento, registre a evidência e volte quando a revisão estiver pendente.' }));
    }).catch(function (e) { C.limpar(alvo); alvo.appendChild(C.el('p', { class: 'lab-erro', txt: e.status === 401 ? 'Entre na sua conta para ver o progresso.' : e.message })); });
  }

  function painelProfessorBateria() {
    var alvo = C.$('[data-bateria-professor-dashboard]'); if (!alvo) return;
    C.api('GET', '/music/api/lab/prof/bateria/alunos').then(function (r) {
      C.limpar(alvo); var alunos = r.alunos || [], sel = C.el('select', {}, [C.el('option', { value: '', txt: 'Selecione um aluno' })].concat(alunos.map(function (a) { return C.el('option', { value: a.aluno, txt: a.aluno + ' · ' + a.rudimentos_registrados + ' rudimento(s) · BPM ' + (a.melhor_bpm || 0) }); }))), detalhe = C.el('div', {});
      function carregar() { if (!sel.value) { C.limpar(detalhe); return; } C.api('GET', '/music/api/lab/prof/bateria/aluno/' + encodeURIComponent(sel.value) + '/progresso').then(function (d) { C.limpar(detalhe); detalhe.appendChild(C.el('h2', { txt: 'Evolução de ' + sel.value })); detalhe.appendChild(C.el('table', { class: 'lab-tabela' }, [C.el('thead', {}, [C.el('tr', {}, ['Rudimento', 'BPM', 'Repetições', 'Diagnóstico', 'Revisão'].map(function (x) { return C.el('th', { scope: 'col', txt: x }); }))]), C.el('tbody', {}, (d.progresso || []).map(function (x) { return C.el('tr', {}, [C.el('th', { scope: 'row', txt: String(x.rudimento) }), C.el('td', { txt: String(x.bpm) }), C.el('td', { txt: String(x.repeticoes_limpas) }), C.el('td', { txt: x.diagnostico || '—' }), C.el('td', { txt: x.proxima_revisao || '—' })]); }))])); var texto = C.el('textarea', { rows: 4, maxlength: 2000, placeholder: 'Escreva a devolutiva para este aluno.' }); detalhe.appendChild(C.el('div', { class: 'lab-campo lab-campo-largo' }, [C.el('label', { txt: 'Observação do professor' }), texto])); detalhe.appendChild(C.el('button', { type: 'button', class: 'btn', txt: 'Salvar devolutiva', onclick: function () { C.api('POST', '/music/api/lab/prof/bateria/observacoes', { aluno: sel.value, texto: texto.value }).then(function () { C.aviso('Devolutiva registrada.'); texto.value = ''; }).catch(function (e) { C.aviso(e.message, 'erro'); }); } })); if ((d.observacoes || []).length) detalhe.appendChild(C.el('ul', { class: 'lab-resultados' }, d.observacoes.map(function (x) { return C.el('li', {}, [C.el('strong', { txt: x.criado_em }), ' — ' + x.texto]); }))); }).catch(function (e) { C.limpar(detalhe); detalhe.appendChild(C.el('p', { class: 'lab-erro', txt: e.message })); }); }
      sel.addEventListener('change', carregar); alvo.appendChild(C.el('div', { class: 'lab-campo' }, [C.el('label', { txt: 'Aluno' }), sel])); var tipo = C.el('select', {}, [C.el('option', { value: 'rudimento', txt: 'Rudimento' }), C.el('option', { value: 'capitulo', txt: 'Capítulo' })]), alvoN = C.el('input', { type: 'number', min: 1, max: 40, value: 1 }), bpm = C.el('input', { type: 'number', min: 0, max: 300, value: 50 }), emails = C.el('input', { type: 'text', placeholder: 'e-mail do aluno' }), inst = C.el('textarea', { rows: 3, placeholder: 'Instruções e meta da prática' }); alvo.appendChild(C.el('fieldset', {}, [C.el('legend', { txt: 'Nova tarefa de bateria' }), C.el('div', { class: 'lab-controles' }, [C.el('label', { txt: 'Tipo' }, [tipo]), C.el('label', { txt: 'Número' }, [alvoN]), C.el('label', { txt: 'BPM meta' }, [bpm])]), C.el('label', { txt: 'E-mail do aluno' }, [emails]), C.el('label', { txt: 'Instruções' }, [inst]), C.el('button', { type: 'button', class: 'btn sec', txt: 'Atribuir tarefa', onclick: function () { C.api('POST', '/music/api/lab/prof/bateria/tarefas', { tipo: tipo.value, alvo: alvoN.value, bpm: bpm.value, emails: emails.value, instrucoes: inst.value }).then(function (x) { C.aviso('Tarefa criada e atribuída a ' + x.atribuidos + ' aluno(s).'); }).catch(function (e) { C.aviso(e.message, 'erro'); }); } })])); alvo.appendChild(detalhe); if (!alunos.length) alvo.appendChild(C.el('p', { class: 'lab-dica', txt: 'Ainda não há registros de prática de alunos.' }));
    }).catch(function (e) { C.limpar(alvo); alvo.appendChild(C.el('p', { class: 'lab-erro', txt: e.status === 403 ? 'Esta área é exclusiva para professores.' : e.message })); });
  }

  function painelProfessorContrabaixo() {
    var alvo = C.$('[data-contrabaixo-professor-dashboard]'); if (!alvo) return;
    C.api('GET', '/music/api/lab/prof/contrabaixo/alunos').then(function (r) {
      C.limpar(alvo);
      var alunos = r.alunos || [], tabela = C.el('table', { class: 'lab-tabela' }, [C.el('caption', { txt: 'Progresso dos alunos de contrabaixo' }), C.el('thead', {}, [C.el('tr', {}, ['Aluno', 'Capítulos', 'Percentual'].map(function (x) { return C.el('th', { scope: 'col', txt: x }); }))]), C.el('tbody', {}, alunos.map(function (a) { return C.el('tr', {}, [C.el('th', { scope: 'row', txt: a.aluno }), C.el('td', { txt: a.total + '/43' }), C.el('td', { txt: a.percentual + '%' })]); }))]);
      alvo.appendChild(C.el('div', { class: 'lab-tabela-rolagem' }, [tabela]));
      var aluno = C.el('select', {}, [C.el('option', { value: '', txt: 'Selecione um aluno' })].concat(alunos.map(function (a) { return C.el('option', { value: a.aluno, txt: a.aluno }); }))), capitulo = C.el('input', { type: 'number', min: 0, max: 43, value: 0, 'aria-label': 'Capítulo relacionado' }), texto = C.el('textarea', { rows: 3, maxlength: 2000, placeholder: 'Escreva uma observação ou devolutiva.' });
      alvo.appendChild(C.el('fieldset', {}, [C.el('legend', { txt: 'Registrar devolutiva' }), C.el('div', { class: 'lab-controles' }, [C.el('label', { txt: 'Aluno' }, [aluno]), C.el('label', { txt: 'Capítulo' }, [capitulo])]), C.el('label', { txt: 'Observação' }, [texto]), C.el('button', { type: 'button', class: 'btn', txt: 'Salvar devolutiva', onclick: function () { C.api('POST', '/music/api/lab/prof/contrabaixo/observacoes', { aluno: aluno.value, capitulo: capitulo.value, texto: texto.value }).then(function () { C.aviso('Devolutiva registrada.'); texto.value = ''; }).catch(function (e) { C.aviso(e.message, 'erro'); }); } })]));
      var emails = C.el('input', { type: 'text', placeholder: 'e-mail do aluno' }), bpm = C.el('input', { type: 'number', min: 0, max: 300, value: 80 }), instrucoes = C.el('textarea', { rows: 3, maxlength: 4000, placeholder: 'Meta e instruções da prática.' });
      alvo.appendChild(C.el('fieldset', {}, [C.el('legend', { txt: 'Atribuir tarefa' }), C.el('div', { class: 'lab-controles' }, [C.el('label', { txt: 'E-mail do aluno' }, [emails]), C.el('label', { txt: 'Meta de BPM' }, [bpm])]), C.el('label', { txt: 'Instruções' }, [instrucoes]), C.el('button', { type: 'button', class: 'btn sec', txt: 'Atribuir capítulo', onclick: function () { C.api('POST', '/music/api/lab/prof/contrabaixo/tarefas', { capitulo: capitulo.value, bpm: bpm.value, emails: emails.value, instrucoes: instrucoes.value }).then(function (x) { C.aviso('Tarefa atribuída a ' + x.atribuidos + ' aluno(s).'); }).catch(function (e) { C.aviso(e.message, 'erro'); }); } })]));
      var detalhe = C.el('section', { class: 'curso-dashboard-recentes' }), alunoDetalhe = C.el('select', {}, [C.el('option', { value: '', txt: 'Selecione um aluno' })].concat(alunos.map(function (a) { return C.el('option', { value: a.aluno, txt: a.aluno }); })));
      alunoDetalhe.addEventListener('change', function () { if (!alunoDetalhe.value) { C.limpar(detalhe); return; } C.api('GET', '/music/api/lab/prof/contrabaixo/aluno/' + encodeURIComponent(alunoDetalhe.value) + '/progresso').then(function (x) { C.limpar(detalhe); detalhe.appendChild(C.el('h2', { txt: 'Detalhes de ' + alunoDetalhe.value })); detalhe.appendChild(C.el('p', { class: 'lab-dica', txt: x.progresso.total + '/43 capítulos concluídos (' + x.progresso.percentual + '%).' })); detalhe.appendChild(C.el('ul', { class: 'lab-resultados' }, (x.progresso.concluidas || []).map(function (c) { return C.el('li', {}, [C.el('strong', { txt: c.slug }), ' · ' + String(c.concluido_em || '')]); }))); if ((x.observacoes || []).length) detalhe.appendChild(C.el('ul', { class: 'lab-resultados' }, x.observacoes.map(function (o) { return C.el('li', {}, [C.el('strong', { txt: o.criado_em }), ' · capítulo ' + o.capitulo + ' · ' + o.texto]); }))); }).catch(function (e) { C.limpar(detalhe); detalhe.appendChild(C.el('p', { class: 'lab-erro', txt: e.message })); }); });
      alvo.appendChild(C.el('div', { class: 'lab-campo' }, [C.el('label', { txt: 'Abrir detalhe do aluno' }), alunoDetalhe])); alvo.appendChild(detalhe);
      if (!alunos.length) alvo.appendChild(C.el('p', { class: 'lab-dica', txt: 'Ainda não há progresso de alunos sincronizado.' }));
    }).catch(function (e) { C.limpar(alvo); alvo.appendChild(C.el('p', { class: 'lab-erro', txt: e.status === 403 ? 'Esta área é exclusiva para professores.' : e.message })); });
  }

  // ---- barra de rolagem também EM CIMA das tabelas largas (atlas) ----
  // Uma faixa fina acima da tabela, do mesmo comprimento, rola junto com a
  // de baixo: dá para ir para os lados sem descer até o fim da tabela.
  function barraDeCima() {
    C.$$('.lab-tabela-rolagem').forEach(function (caixa) {
      if (caixa.previousElementSibling && caixa.previousElementSibling.classList.contains('lab-rolagem-topo')) return;
      var topo = C.el('div', { class: 'lab-rolagem-topo', 'aria-hidden': 'true' }, [C.el('div')]);
      caixa.parentNode.insertBefore(topo, caixa);
      var ajustar = function () {
        topo.firstChild.style.width = caixa.scrollWidth + 'px';
        topo.hidden = caixa.scrollWidth <= caixa.clientWidth + 1;
      };
      var mexendo = false;
      topo.addEventListener('scroll', function () { if (mexendo) return; mexendo = true; caixa.scrollLeft = topo.scrollLeft; mexendo = false; });
      caixa.addEventListener('scroll', function () { if (mexendo) return; mexendo = true; topo.scrollLeft = caixa.scrollLeft; mexendo = false; });
      ajustar();
      w.addEventListener('resize', ajustar);
    });
  }
  C.barraDeCima = barraDeCima;

  // Expõe o estado de cada etapa da jornada para estilos e tecnologias assistivas.
  // A ferramenta monta os cartões de forma assíncrona (após carregar o progresso),
  // portanto observamos o painel até que os cartões estejam disponíveis.
  function aprimorarJornada(slug, alvo) {
    if (slug !== 'jornada-guitarra' || !alvo) return;
    var aplicar = function () {
      var cards = alvo.querySelectorAll('.lab-tendencias-lista .lab-tendencia-card');
      if (!cards.length) return;
      Array.prototype.forEach.call(cards, function (card) {
        var dica = card.querySelector('.lab-dica');
        var texto = (dica && dica.textContent || '').toLowerCase();
        var status = texto.indexOf('conclu') >= 0 ? 'concluida' : texto.indexOf('estude') >= 0 ? 'atual' : 'proxima';
        card.setAttribute('data-status', status);
        card.setAttribute('aria-label', (card.querySelector('strong') || {}).textContent || 'Etapa da jornada');
        if (dica) { dica.classList.add('lab-jornada-status'); dica.setAttribute('role', 'status'); }
        var estudo = card.querySelector('a');
        if (estudo) estudo.classList.add('lab-jornada-estudo');
        var concluir = card.querySelector('button');
        if (concluir) {
          concluir.classList.add('lab-jornada-concluir');
          concluir.setAttribute('aria-pressed', status === 'concluida' ? 'true' : 'false');
        }
        if (status === 'atual') card.setAttribute('aria-current', 'step');
        else card.removeAttribute('aria-current');
      });
    };
    aplicar();
    if (w.MutationObserver) new MutationObserver(aplicar).observe(alvo, { childList: true, subtree: true });
    else w.setTimeout(aplicar, 250);
  }

  d.addEventListener('DOMContentLoaded', function () {
    barraDeCima();
    // tabelas que as ferramentas montam depois (matriz, relatórios) também ganham a barra
    if (w.MutationObserver && C.$('#lab-main')) { var tmo = null; new MutationObserver(function () { clearTimeout(tmo); tmo = setTimeout(barraDeCima, 120); }).observe(C.$('#lab-main'), { childList: true, subtree: true }); }
    buscaViva();
    botaoFavorito();
    botaoAula();
    progressoCurso();
    filtrosCurso();
    painelBateria();
    painelProfessorBateria();
    painelProfessorContrabaixo();
    var main = C.$('#lab-main');
    if (!main) return;
    var slug = main.getAttribute('data-ferramenta');
    var estado = {};
    try { estado = JSON.parse(main.getAttribute('data-estado') || '{}'); } catch (_) { estado = {}; }
    C.estado = estado;
    if (C.antesDeMontar) C.antesDeMontar(estado);
    var alvo = C.$('#lab-ferramenta');
    var f = C.ferramentas[slug];
    if (f && alvo) {
      try { f(alvo, estado); } catch (e) { alvo.appendChild(C.el('p', { class: 'lab-erro', txt: 'A ferramenta não abriu: ' + e.message })); if (w.console) console.error(e); }
    }
    aprimorarJornada(slug, alvo);
  });
})(window, document);
