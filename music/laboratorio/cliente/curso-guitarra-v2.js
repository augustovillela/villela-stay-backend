// Musique · Curso de guitarra v2 · fonte editorial de 49 capítulos.
(function (w) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas, el = C.el;
  function ferramentasPara(c) {
    var texto = JSON.stringify(c.secoes || []).toLowerCase();
    var links = [];
    function add(url, label) { if (!links.some(function (x) { return x.url === url; })) links.push({ url: url, label: label }); }
    if (/tablatura|riff|palhet|hammer|pull-off|bend|vibrato|slide/.test(texto)) add('/music/criar/tecnicas-guitarra?curso=curso-guitarra-v2&capitulo=' + encodeURIComponent(c.id), 'Praticar técnica');
    if (/escala|arpejo|improvisa|pentatônica|pentatonica|modo/.test(texto)) add('/music/tutor-braco?instrumento=guitarra&curso=curso-guitarra-v2&capitulo=' + encodeURIComponent(c.id), 'Abrir tutor de braço');
    if (/acorde|power chord|voicing|harmoni/.test(texto)) add('/music/criar/acordes-guitarra?curso=curso-guitarra-v2&capitulo=' + encodeURIComponent(c.id), 'Praticar acordes');
    if (/ritmo|pulso|metrônomo|metronomo|bpm|semicolcheia/.test(texto)) add('/music/criar/metronomo-progressivo?curso=curso-guitarra-v2&capitulo=' + encodeURIComponent(c.id), 'Treinar com metrônomo');
    add('/music/criar/registro-sessao-guitarra?curso=curso-guitarra-v2&capitulo=' + encodeURIComponent(c.id), 'Registrar prática');
    return links;
  }
  function metaDoCapitulo(c) {
    var texto = JSON.stringify(c.secoes || []).toLowerCase();
    var foco = /timbre|amplificador|pedal|distor/.test(texto) ? 'timbre e controle de ruído' : /escala|arpejo|improvisa|solo/.test(texto) ? 'vocabulário melódico e fraseado' : /acorde|harmoni|power chord/.test(texto) ? 'clareza harmônica e troca de formas' : /riff|ritmo|pulso|groove/.test(texto) ? 'pulso, ataque e consistência' : 'postura, escuta e clareza do som';
    var bpm = /semicolcheia|velocidade|palhetada alternada|tremolo/.test(texto) ? 100 : /riff|ritmo|pulso|groove/.test(texto) ? 80 : 60;
    return { foco: foco, bpm: bpm, evidencia: '3 repetições limpas, sem tensão, com o pulso estável' };
  }
  F['curso-guitarra-v2'] = function (alvo, st) {
    C.limpar(alvo);
    var concluidas = C.lerLocal('curso-guitarra-v2-concluidas', {});
    alvo.appendChild(el('header', { class: 'lab-cab curso-livro-cab' }, [
      el('h2', { txt: 'Guitarra: do zero ao avançado' }),
      el('p', { class: 'lab-lead', txt: '49 capítulos editoriais com riffs, técnicas, escalas, timbres, equipamentos, improvisação e gravação.' }),
    ]));
    var estado = el('p', { class: 'lab-dica', txt: 'Carregando conteúdo editorial…' });
    alvo.appendChild(estado);
    fetch('/music/criar/curso-guitarra-v2.json', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (livro) {
      var feitos = livro.capitulos.filter(function (c) { return concluidas[c.id]; }).length;
      estado.textContent = feitos + ' de ' + livro.capitulos.length + ' capítulos concluídos (' + Math.round(feitos / livro.capitulos.length * 100) + '%).';
      alvo.appendChild(el('div', { class: 'curso-numeros' }, [el('span', {}, [el('strong', { txt: String(livro.partes) }), ' partes']), el('span', {}, [el('strong', { txt: String(livro.capitulos.length) }), ' capítulos']), el('span', {}, [el('strong', { txt: String(livro.paginas_pdf) }), ' páginas'])]));
      alvo.appendChild(el('div', { class: 'lab-acoes' }, [
        el('a', { class: 'btn', href: livro.pdf, target: '_blank', rel: 'noopener', txt: '📄 Abrir livro em PDF' }),
        el('a', { class: 'btn sec', href: '/music/criar/progresso-guitarra?curso=curso-guitarra-v2', txt: '📈 Meu progresso' }),
        el('a', { class: 'btn sec', href: '/music/app#tarefas', txt: '📝 Minhas tarefas' }),
        el('a', { class: 'btn sec', href: '/music/ensinar?curso=curso-guitarra-v2', txt: '👨‍🏫 Acompanhamento docente' })
      ]));
      var indice = el('nav', { class: 'curso-livro-indice', 'aria-label': 'Índice do livro' });
      livro.capitulos.forEach(function (c, i) { indice.appendChild(el('a', { href: '#guitarra-v2-' + c.id, txt: String(i + 1).padStart(2, '0') + ' · ' + c.titulo })); });
      alvo.appendChild(indice);
      livro.capitulos.forEach(function (c, i) {
        var secoes = c.secoes.map(function (s) { return el('section', { class: 'curso-livro-secao' }, [el('h4', { txt: s.titulo }), el('div', {}, s.conteudo.map(function (p) { return el('p', { txt: p }); }))]); });
        var links = ferramentasPara(c);
        var meta = metaDoCapitulo(c);
        var pratica = el('section', { class: 'curso-pratica-guitarra', 'aria-labelledby': 'pratica-' + c.id }, [
          el('h4', { id: 'pratica-' + c.id, txt: 'Prática orientada deste capítulo' }),
          el('p', { class: 'lab-dica', txt: 'Meta: ' + meta.foco + ' · começar em ' + meta.bpm + ' BPM · evidência: ' + meta.evidencia + '.' }),
          el('div', { class: 'lab-acoes' }, links.map(function (x) { return el('a', { class: 'btn sec', href: x.url, txt: x.label }); }))
        ]);
        var marcar = el('button', { type: 'button', class: 'btn sec', txt: concluidas[c.id] ? '✓ Capítulo concluído — desfazer' : 'Marcar capítulo como concluído' });
        marcar.onclick = function () { if (concluidas[c.id]) delete concluidas[c.id]; else concluidas[c.id] = new Date().toISOString(); C.guardar('curso-guitarra-v2-concluidas', concluidas); location.hash = 'guitarra-v2-' + c.id; location.reload(); };
        alvo.appendChild(el('article', { id: 'guitarra-v2-' + c.id, class: 'curso-livro-capitulo' }, [el('div', { class: 'curso-livro-capitulo-meta', txt: 'Parte ' + c.parte + ' · Capítulo ' + (i + 1) }), el('h3', { txt: c.titulo }), secoes, pratica, marcar]));
      });
    }).catch(function () { estado.textContent = 'Não foi possível carregar o conteúdo editorial agora.'; });
  };
})(window);
