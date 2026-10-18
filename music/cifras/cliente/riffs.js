// Musique Cifras — acervo de riffs e tablaturas.
(function (global) {
  'use strict';
  var C = global.MusiqueCifras, el = C.el, api = C.api, R = C.R, D = C.M.documento;
  var T = C.telas;
  function campo(rotulo, tipo, valor, extra) {
    var i = el('input', Object.assign({ type: tipo || 'text', value: valor || '', placeholder: rotulo, 'aria-label': rotulo }, extra || {}));
    return el('label', { class: 'cf-campo' }, [el('span', { txt: rotulo }), i]);
  }
  function select(rotulo, opcoes, valor) {
    var s = el('select', { 'aria-label': rotulo }); opcoes.forEach(function (o) { var x = el('option', { value: o[0], txt: o[1] }); if (o[0] === valor) x.selected = true; s.appendChild(x); });
    return el('label', { class: 'cf-campo' }, [el('span', { txt: rotulo }), s]);
  }
  function textoTab(doc) { return (doc && doc.secoes || []).map(function (s) { return (s.linhas || []).map(function (l) { return l.tipo === 'tab' ? l.texto : ''; }).filter(Boolean).join('\n'); }).filter(Boolean).join('\n\n'); }
  function cartao(r, onOpen) {
    var b = el('button', { type: 'button', class: 'cf-linha-item', style: 'text-align:left;width:100%;cursor:pointer' }, [el('div', { class: 'cresce' }, [el('b', { txt: r.titulo }), el('span', { class: 'm', txt: [r.artista, r.instrumento, r.dificuldade].filter(Boolean).join(' · ') })]), el('span', { class: 'cf-tag', txt: 'v' + (r.versao ? r.versao.numero : 1) })]);
    b.onclick = onOpen; return b;
  }
  T.riffs = function (id) {
    var c = C.limpar();
    if (id) return abrir(id, c);
    c.appendChild(el('h2', { txt: 'Riffs e tablaturas' }));
    c.appendChild(el('p', { class: 'cf-ajuda', txt: 'Guarde riffs autorais, de domínio público ou com licença compatível. A tablatura usa o mesmo visual das cifras e pode abrir no Tocar junto.' }));
    c.appendChild(C.botao('+ Novo riff', function () { novo(c); }));
    var lista = el('div', { class: 'cf-lista', style: 'margin-top:12px' }); c.appendChild(lista); lista.appendChild(C.esqueleto(3));
    api('GET', '/riffs', null, { cache: 'riffs' }).then(function (d) { lista.innerHTML = ''; if (!d.itens || !d.itens.length) lista.appendChild(C.estadoVazio('Nenhum riff guardado', 'Cole a primeira tablatura para começar.', C.botao('+ Novo riff', function () { novo(c); }))); else d.itens.forEach(function (r) { lista.appendChild(cartao(r, function () { abrir(r.id, c); })); });
      var catalogo = el('div', { class: 'cf-lista', style: 'margin-top:22px' }); c.appendChild(el('h3', { txt: 'Catálogo de referência · 100 riffs' })); c.appendChild(el('p', { class: 'cf-ajuda', txt: 'Escolha um título para importar uma tablatura própria ou autorizada. O catálogo não substitui o conteúdo da sua versão.' })); c.appendChild(catalogo);
      return api('GET', '/riffs-catalogo').then(function (x) { (x.itens || []).forEach(function (item) { catalogo.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: item.titulo }), el('span', { class: 'm', txt: item.artista + ' · ' + item.dificuldade })]), el('span', { class: 'cf-tag', txt: 'Importar' })])); }); });
    }).catch(function (e) { lista.replaceChildren(C.estadoErro(e)); });
  };
  function novo(c) {
    c.innerHTML = ''; c.appendChild(el('h2', { txt: 'Novo riff' }));
    var titulo = campo('Título', 'text'), artista = campo('Artista (opcional)', 'text');
    var inst = select('Instrumento', [['guitarra','Guitarra'],['violao','Violão'],['baixo','Baixo'],['cavaquinho','Cavaquinho'],['ukulele','Ukulele'],['bandolim','Bandolim']], 'guitarra');
    var af = campo('Afinação', 'text', 'padrao'), bpm = campo('BPM (opcional)', 'number', '', { min: 0, max: 300 });
    var dif = select('Dificuldade', [['iniciante','Iniciante'],['intermediario','Intermediário'],['avancado','Avançado']], 'iniciante');
    var origem = select('Origem', [['manual','Fornecido por mim'],['proprio','Obra própria'],['dominio_publico','Domínio público'],['licenciado','Licença compatível'],['terceiro_privado','Uso privado']], 'manual');
    var lic = campo('Licença ou referência (opcional)', 'text');
    var ta = el('textarea', { rows: 10, placeholder: 'e|--0--2--3--2--0--|\nB|--1--3--0--3--1--|', 'aria-label': 'Tablatura' });
    var preview = el('div', { class: 'cf-doc', style: 'margin-top:12px' });
    function pintar() { preview.innerHTML = ''; try { var d = D.deTexto('[Tablatura]\n' + ta.value).documento; preview.appendChild(R.cifra(d, { fonte: 16 })); } catch (_) {} }
    ta.addEventListener('input', pintar);
    var salvar = C.botao('Salvar riff', function () { salvar.disabled = true; api('POST', '/riffs', { titulo: titulo.querySelector('input').value, artista: artista.querySelector('input').value, instrumento: inst.querySelector('select').value, afinacao: af.querySelector('input').value, bpm: bpm.querySelector('input').value, dificuldade: dif.querySelector('select').value, origem: origem.querySelector('select').value, licenca: lic.querySelector('input').value, texto: ta.value }).then(function (x) { C.aviso('Riff salvo.'); abrir(x.riff.id, c); }).catch(function (e) { C.erro(e); }).finally(function () { salvar.disabled = false; }); });
    c.appendChild(el('div', { class: 'cf-form-grid' }, [titulo, artista, inst, af, bpm, dif, origem, lic])); c.appendChild(el('label', { class: 'cf-campo', style: 'display:block;margin-top:12px' }, [el('span', { txt: 'Tablatura' }), ta])); c.appendChild(el('div', { class: 'linha' }, [salvar, C.botao('Cancelar', function () { T.riffs(); }, 'sec')])); c.appendChild(el('h3', { txt: 'Prévia' })); c.appendChild(preview); pintar();
  }
  function abrir(id, c) {
    c.innerHTML = ''; c.appendChild(C.esqueleto(4));
    api('GET', '/riffs/' + encodeURIComponent(id), null, { cache: 'riff-' + id }).then(function (d) {
      c.innerHTML = ''; var r = d.riff; c.appendChild(el('h2', { txt: r.titulo })); c.appendChild(el('p', { class: 'cf-ajuda', txt: [r.artista, r.instrumento, r.afinacao, r.bpm ? r.bpm + ' BPM' : '', r.dificuldade].filter(Boolean).join(' · ') }));
      var barra = el('div', { class: 'linha' }, [C.botao('← Riffs', function () { T.riffs(); }, 'sec'), el('a', { class: 'cf-bt', href: '/music/tocar?riff=' + encodeURIComponent(r.id), txt: '▶️ Abrir no Tocar junto' }), C.botao('+ Nova versão', function () { editarVersao(r, d.documento, c); })]); c.appendChild(barra);
      c.appendChild(R.cifra(d.documento, { fonte: 18 }));
      c.appendChild(el('p', { class: 'cf-ajuda', txt: 'Origem: ' + r.origem + (r.licenca ? ' · ' + r.licenca : '') }));
    }).catch(function (e) { c.replaceChildren(C.estadoErro(e, function () { abrir(id, c); })); });
  }
  function editarVersao(r, doc, c) {
    var ta = el('textarea', { rows: 12, style: 'width:100%', value: textoTab(doc), 'aria-label': 'Nova tablatura' });
    C.modal('Nova versão de ' + r.titulo, el('div', {}, [el('p', { txt: 'Cole a tablatura revisada.' }), ta]), [{ txt: 'Cancelar' }, { txt: 'Salvar', fn: function () { return api('POST', '/riffs/' + encodeURIComponent(r.id) + '/versoes', { texto: ta.value }).then(function () { abrir(r.id, c); }).catch(function (e) { C.erro(e); return false; }); } }]);
  }
})(window);
