// =====================================================================
// Musique Cifras — CLIENTE · EDITOR.
//
// Duas formas de editar a MESMA coisa (o documento estruturado):
//   · VISUAL — a letra aparece letra a letra; tocar numa sílaba põe o
//     acorde nela, arrastar o acorde muda de sílaba, e cada seção tem
//     tipo, rótulo, modulação e repetição;
//   · TEXTO/ChordPro — para quem prefere digitar.
// Cada linha também pode ser editada como "acordes em cima + letra",
// em duas caixas monoespaçadas: é o jeito natural de colar e ajustar
// sem perder o alinhamento.
//
// Segurança do trabalho: desfazer/refazer, rascunho automático (no
// servidor e, sem rede, no aparelho), e CONFLITO resolvido com o diff
// na tela — nunca "a última gravação ganha" em silêncio.
// =====================================================================
(function (global) {
  'use strict';
  var C = global.MusiqueCifras;
  var M = C.M, el = C.el, R = C.R, api = C.api;
  var D = M.documento;

  // Linha de letra ⇄ (texto, marcas de acorde por índice de caractere)
  function paraCaracteres(l) {
    var texto = '', marcas = [];
    l.segmentos.forEach(function (sg) { if (sg.acorde) marcas.push({ i: texto.length, acorde: sg.acorde }); texto += sg.texto; });
    return { texto: texto, marcas: marcas };
  }
  function deCaracteres(texto, marcas) {
    var m = marcas.slice().sort(function (a, b) { return a.i - b.i; });
    var t = texto;
    if (m.length && m[m.length - 1].i >= t.length) t += new Array(m[m.length - 1].i - t.length + 2).join(' ');
    var segs = [];
    if (!m.length || m[0].i > 0) segs.push({ acorde: null, texto: t.slice(0, m.length ? m[0].i : t.length) });
    m.forEach(function (x, k) { segs.push({ acorde: x.acorde, texto: t.slice(x.i, k + 1 < m.length ? m[k + 1].i : t.length) }); });
    var ult = segs[segs.length - 1];
    if (ult) ult.texto = ult.texto.replace(/\s+$/, '');
    return segs.length ? segs : [{ acorde: null, texto: '' }];
  }
  C.editorUtil = { paraCaracteres: paraCaracteres, deCaracteres: deCaracteres };

  C.telas.editor = function (id, extra) {
    extra = extra || {};
    Promise.all([api('GET', '/cifras/' + id), api('GET', '/cifras/' + id + '/rascunho').catch(function () { return { rascunho: null }; }),
      C.ler('cache', 'rascunho:' + id).catch(function () { return null; })]).then(function (rs) {
      var d = rs[0], rasc = rs[1].rascunho, local = rs[2];
      var proposta = !!extra.proposta || !(d.pode && d.pode.editar);
      var comecar = function (doc, origem) { abrirEditor(d, doc, proposta, origem); };
      var maisNovo = local && (!rasc || local.em > Date.parse(rasc.atualizado_em)) ? { documento: local.documento, atualizado_em: new Date(local.em).toISOString(), local: true } : rasc;
      if (maisNovo && !proposta) {
        C.modal('Rascunho encontrado', 'Há um rascunho ' + (maisNovo.local ? 'guardado NESTE aparelho' : 'salvo') + ' de ' + new Date(maisNovo.atualizado_em).toLocaleString('pt-BR') + ', não publicado. Continuar de onde parou?',
          [{ txt: 'Começar da versão publicada', fn: function () { comecar(d.documento, 'publicada'); } }, { txt: 'Continuar o rascunho', fn: function () { comecar(maisNovo.documento, 'rascunho'); } }]);
      } else comecar(d.documento, 'publicada');
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, function () { C.telas.editor(id, extra); })); });
  };

  function abrirEditor(d, docInicial, proposta, origem) {
    var doc = D.clonar(docInicial);
    var desfazer = [], refazer = [];
    var recentes = [];
    var armado = null;                 // acorde "na mão" para colocar com um toque
    var sujo = origem === 'rascunho';
    var ultimoRascunho = '';
    var c = C.limpar();
    var cid = d.cifra.id;

    // ---------------- cabeçalho ----------------
    var status = el('span', { class: 'cf-status', 'aria-live': 'polite', txt: proposta ? 'Modo proposta: você sugere, quem cuida da cifra decide.' : '' });
    var descricao = el('input', { type: 'text', placeholder: proposta ? 'O que você corrigiu?' : 'Descrição da revisão (opcional)', 'aria-label': 'Descrição' });
    c.appendChild(el('div', { class: 'linha' }, [C.botao('← Voltar', sair, 'sec peq'), el('h2', { txt: 'Editar: ' + ((d.musica && d.musica.titulo) || ''), style: 'margin:0;flex:1' })]));
    var barra = el('div', { class: 'cf-ferr', role: 'toolbar', 'aria-label': 'Editor' });
    c.appendChild(barra);
    var barraAcordes = el('div', { class: 'cf-barra', 'aria-label': 'Acordes à mão' });
    c.appendChild(barraAcordes);
    var corpo = el('div');
    c.appendChild(corpo);
    var previa = el('div', { style: 'margin-top:18px' });
    c.appendChild(previa);
    var modoTexto = false;

    function pintarBarra() {
      barra.innerHTML = '';
      barra.appendChild(C.botao(proposta ? 'Enviar proposta' : 'Salvar (Ctrl+S)', salvar, 'peq'));
      barra.appendChild(descricao);
      barra.appendChild(C.bt('↶', fazerDesfazer, 'Desfazer (Ctrl+Z)'));
      barra.appendChild(C.bt('↷', fazerRefazer, 'Refazer (Ctrl+Y)'));
      barra.appendChild(C.botao(modoTexto ? 'Editor visual' : 'Texto / ChordPro', function () { modoTexto = !modoTexto; pintarTudo(); }, 'sec peq'));
      barra.appendChild(C.botao('Dados', editarMeta, 'sec peq'));
      barra.appendChild(C.botao('Buscar e trocar', buscarTrocar, 'sec peq'));
      barra.appendChild(C.botao('Transpor', transporDoc, 'sec peq'));
      barra.appendChild(C.botao('Pré-visualizar', pintarPrevia, 'sec peq'));
      if (C.temIA('interpretar')) barra.appendChild(C.botao('IA: organizar', organizarIA, 'sec peq'));
      barra.appendChild(status);
    }

    function pintarAcordes() {
      barraAcordes.innerHTML = '';
      var tom = D.tomDe(doc).tom;
      var sug = R.sugestoesDoTom(tom, recentes);
      barraAcordes.appendChild(el('span', { class: 'peq', txt: armado ? 'Toque na sílaba para pôr ' + armado + ' (Esc cancela):' : 'Toque num acorde e depois na sílaba:' }));
      sug.forEach(function (a) {
        var b = el('button', { type: 'button', class: 'chip-b' + (armado === a ? ' on' : ''), txt: a, 'aria-pressed': armado === a ? 'true' : 'false' });
        b.onclick = function () { armado = armado === a ? null : a; pintarAcordes(); };
        barraAcordes.appendChild(b);
      });
      var livre = el('input', { type: 'text', placeholder: 'outro…', style: 'width:90px', 'aria-label': 'Outro acorde' });
      livre.onkeydown = function (e) { if (e.key === 'Enter' && livre.value.trim()) { armado = livre.value.trim(); pintarAcordes(); } };
      barraAcordes.appendChild(livre);
    }

    // ---------------- histórico de edição ----------------
    function mudar(fn, semRedesenho) {
      desfazer.push(JSON.stringify(doc));
      if (desfazer.length > 150) desfazer.shift();
      refazer = [];
      fn();
      D.renumerar(doc);
      sujo = true;
      agendarRascunho();
      if (!semRedesenho) pintarTudo();
    }
    function fazerDesfazer() { if (!desfazer.length) return; refazer.push(JSON.stringify(doc)); doc = JSON.parse(desfazer.pop()); sujo = true; agendarRascunho(); pintarTudo(); }
    function fazerRefazer() { if (!refazer.length) return; desfazer.push(JSON.stringify(doc)); doc = JSON.parse(refazer.pop()); sujo = true; agendarRascunho(); pintarTudo(); }

    var agendarRascunho = C.debounce(function () {
      var txt = JSON.stringify(doc);
      if (txt === ultimoRascunho || proposta) return;
      ultimoRascunho = txt;
      C.guardar('cache', 'rascunho:' + cid, { em: Date.now(), documento: doc }).catch(function () {});
      api('PUT', '/cifras/' + cid + '/rascunho', { documento: doc, base_revisao: d.cifra.revisao_atual })
        .then(function () { status.textContent = 'Rascunho salvo às ' + new Date().toLocaleTimeString('pt-BR').slice(0, 5) + '.'; })
        .catch(function (e) { status.textContent = e.semRede ? 'Sem internet: rascunho guardado neste aparelho.' : 'Rascunho não salvo: ' + e.message; });
    }, 2500);

    // ---------------- desenho ----------------
    function pintarTudo() {
      pintarBarra(); pintarAcordes();
      corpo.innerHTML = '';
      if (modoTexto) return pintarModoTexto();
      doc.secoes.forEach(function (s, si) { corpo.appendChild(desenharSecao(s, si)); });
      corpo.appendChild(el('div', { class: 'linha' }, [C.botao('+ Seção', function () { mudar(function () { doc.secoes.push({ tipo: 'verso', rotulo: '', linhas: [{ tipo: 'letra', segmentos: [{ acorde: null, texto: '' }] }] }); }); }, 'sec'),
        C.botao('Colar texto cifrado aqui', colarTexto, 'sec')]));
      if (previa.childNodes.length) pintarPrevia();
    }

    function desenharSecao(s, si) {
      var box = el('section', { class: 'cf-ed-sec', 'aria-label': 'Seção ' + (si + 1) });
      var tipo = C.sel(D.TIPOS_SECAO.map(function (t) { return [t, t === 'sem_secao' ? '(sem marca)' : D.ROTULO_PADRAO[t]]; }), s.tipo, function (v) { mudar(function () { s.tipo = v; }); }, 'Tipo da seção');
      var rot = el('input', { type: 'text', value: s.rotulo || '', placeholder: D.ROTULO_PADRAO[s.tipo] || 'Rótulo', 'aria-label': 'Rótulo' });
      rot.onchange = function () { mudar(function () { s.rotulo = rot.value.trim(); }, true); };
      var tom = el('input', { type: 'text', value: s.tom || '', placeholder: 'modula p/', style: 'width:84px', 'aria-label': 'Tom da seção (modulação)' });
      tom.onchange = function () { mudar(function () { if (tom.value.trim() && M.nota.lerTom(tom.value.trim())) s.tom = tom.value.trim(); else delete s.tom; }); };
      var rep = el('input', { type: 'number', min: '1', max: '16', value: s.repetir || 1, style: 'width:60px', 'aria-label': 'Repetir quantas vezes' });
      rep.onchange = function () { mudar(function () { var n = Number(rep.value) || 1; if (n > 1) s.repetir = n; else delete s.repetir; }, true); };
      var ops = el('div', { class: 'cf-ed-ops' }, [
        C.bt('↑', function () { if (si) mudar(function () { doc.secoes.splice(si - 1, 0, doc.secoes.splice(si, 1)[0]); }); }, 'Subir seção'),
        C.bt('↓', function () { if (si < doc.secoes.length - 1) mudar(function () { doc.secoes.splice(si + 1, 0, doc.secoes.splice(si, 1)[0]); }); }, 'Descer seção'),
        C.bt('⧉', function () { mudar(function () { doc.secoes.splice(si + 1, 0, D.clonar(s)); }); }, 'Duplicar seção'),
        C.bt('⎘', function () { copiar(D.paraTexto({ meta: {}, secoes: [s] }, { cabecalho: false })); }, 'Copiar seção como texto'),
        C.bt('🗑', function () { C.confirmar('Excluir a seção?', 'Dá para desfazer com Ctrl+Z.', 'Excluir').then(function (ok) { if (ok) mudar(function () { doc.secoes.splice(si, 1); }); }); }, 'Excluir seção'),
      ]);
      box.appendChild(el('div', { class: 'cf-ed-cab' }, [tipo, rot, tom, el('span', { class: 'peq', txt: '×' }), rep, ops]));
      s.linhas.forEach(function (l, li) { box.appendChild(desenharLinha(s, l, li)); });
      box.appendChild(el('div', { class: 'cf-ed-linha' }, [el('div', { class: 'linha', style: 'margin:4px 0' }, [
        C.botao('+ letra', function () { mudar(function () { s.linhas.push({ tipo: 'letra', segmentos: [{ acorde: null, texto: '' }] }); }); }, 'sec peq'),
        C.botao('+ só acordes', function () { mudar(function () { s.linhas.push({ tipo: 'letra', segmentos: [{ acorde: 'C', texto: '    ' }] }); }); }, 'sec peq'),
        C.botao('+ instrução', function () { mudar(function () { s.linhas.push({ tipo: 'instrucao', texto: '2x' }); }); }, 'sec peq'),
        C.botao('+ comentário', function () { mudar(function () { s.linhas.push({ tipo: 'comentario', texto: '' }); }); }, 'sec peq'),
        C.botao('+ tab', function () { mudar(function () { s.linhas.push({ tipo: 'tab', texto: 'e|-----------------|' }); }); }, 'sec peq'),
        C.botao('+ espaço', function () { mudar(function () { s.linhas.push({ tipo: 'vazia' }); }); }, 'sec peq')])]));
      return box;
    }

    function opsLinha(s, li) {
      return el('div', { class: 'cf-ed-ops' }, [
        C.bt('↑', function () { if (li) mudar(function () { s.linhas.splice(li - 1, 0, s.linhas.splice(li, 1)[0]); }); }, 'Subir linha'),
        C.bt('↓', function () { if (li < s.linhas.length - 1) mudar(function () { s.linhas.splice(li + 1, 0, s.linhas.splice(li, 1)[0]); }); }, 'Descer linha'),
        C.bt('⧉', function () { mudar(function () { s.linhas.splice(li + 1, 0, D.clonar(s.linhas[li])); }); }, 'Duplicar linha'),
        C.bt('×', function () { mudar(function () { s.linhas.splice(li, 1); }); }, 'Excluir linha'),
      ]);
    }

    function desenharLinha(s, l, li) {
      var row = el('div', { class: 'cf-ed-linha' });
      if (l.tipo === 'vazia') { row.appendChild(el('div', { class: 'cf-ed-corpo peq', txt: '— espaço —' })); row.appendChild(opsLinha(s, li)); return row; }
      if (l.tipo !== 'letra') {
        var i = el('input', { type: 'text', value: l.texto || '', style: 'width:100%;font-family:ui-monospace,monospace', 'aria-label': l.tipo });
        i.onchange = function () { mudar(function () { l.texto = i.value; }, true); };
        row.appendChild(el('div', { class: 'cf-ed-corpo' }, [el('span', { class: 'peq', txt: { comentario: 'comentário', instrucao: 'instrução', tab: 'tablatura', diretiva: 'diretiva' }[l.tipo] + ' ' }), i]));
        row.appendChild(opsLinha(s, li));
        return row;
      }
      var cc = paraCaracteres(l);
      var area = el('div', { class: 'cf-ed-corpo', role: 'group', 'aria-label': 'Linha: ' + cc.texto });
      var n = Math.max(cc.texto.length, cc.marcas.length ? cc.marcas[cc.marcas.length - 1].i + 1 : 0) + 2;
      for (var k = 0; k < n; k++) {
        (function (k) {
          var ch = el('span', { class: 'ch', 'data-i': String(k) });
          var marcasAqui = cc.marcas.filter(function (x) { return x.i === k; });
          var i1 = el('i');
          marcasAqui.forEach(function (mk, z) {
            var chip = el('span', { draggable: 'true', tabindex: '0', role: 'button', 'aria-label': 'Acorde ' + mk.acorde + ' (arraste ou Enter para editar)', txt: (z ? ' ' : '') + mk.acorde });
            chip.ondragstart = function (e) { e.dataTransfer.setData('text/plain', JSON.stringify({ i: mk.i, acorde: mk.acorde })); };
            chip.onclick = function (e) { e.stopPropagation(); editarAcorde(ch, l, cc, mk); };
            chip.onkeydown = function (e) {
              if (e.key === 'Enter') { e.preventDefault(); editarAcorde(ch, l, cc, mk); }
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); mover(l, cc, mk, e.key === 'ArrowRight' ? 1 : -1); }
              if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); mudar(function () { cc.marcas.splice(cc.marcas.indexOf(mk), 1); l.segmentos = deCaracteres(cc.texto, cc.marcas); }); }
            };
            i1.appendChild(chip);
          });
          if (!marcasAqui.length) i1.textContent = ' ';
          ch.appendChild(i1);
          ch.appendChild(el('u', { txt: cc.texto[k] !== undefined ? cc.texto[k] : ' ' }));
          ch.onclick = function () {
            if (armado) { var a = armado; mudar(function () { cc.marcas.push({ i: k, acorde: a }); l.segmentos = deCaracteres(cc.texto, cc.marcas); lembrar(a); }); return; }
            inserirAcorde(ch, l, cc, k);
          };
          ch.ondragover = function (e) { e.preventDefault(); ch.classList.add('alvo'); };
          ch.ondragleave = function () { ch.classList.remove('alvo'); };
          ch.ondrop = function (e) {
            e.preventDefault(); ch.classList.remove('alvo');
            var x; try { x = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (_) { return; }
            mudar(function () {
              var mk = cc.marcas.filter(function (m) { return m.i === x.i && m.acorde === x.acorde; })[0];
              if (mk) mk.i = k;
              l.segmentos = deCaracteres(cc.texto, cc.marcas);
            });
          };
          area.appendChild(ch);
        })(k);
      }
      row.appendChild(area);
      var ops = opsLinha(s, li);
      ops.insertBefore(C.bt('✎', function () { editarComoTexto(l); }, 'Editar a linha como texto (acordes em cima)'), ops.firstChild);
      row.appendChild(ops);
      return row;
    }

    function mover(l, cc, mk, delta) {
      mudar(function () { mk.i = Math.max(0, mk.i + delta); l.segmentos = deCaracteres(cc.texto, cc.marcas); });
    }

    function lembrar(a) { recentes = [a].concat(recentes.filter(function (x) { return x !== a; })).slice(0, 8); }

    function popover(ancora, conteudo) {
      fecharPopover();
      var r = ancora.getBoundingClientRect();
      var p = el('div', { class: 'cf-pop', role: 'dialog', 'aria-label': 'Acorde' });
      p.style.left = Math.max(8, Math.min(global.innerWidth - 260, r.left + global.scrollX)) + 'px';
      p.style.top = (r.bottom + global.scrollY + 6) + 'px';
      p.appendChild(conteudo);
      document.body.appendChild(p);
      C._pop = p;
      var i = p.querySelector('input'); if (i) { i.focus(); i.select(); }
      return p;
    }
    function fecharPopover() { if (C._pop) { C._pop.remove(); C._pop = null; } }

    function campoAcorde(valor, aoConfirmar) {
      var box = el('div');
      var i = el('input', { type: 'text', value: valor || '', placeholder: 'ex.: Am7(9)', 'aria-label': 'Acorde', style: 'width:100%' });
      var info = el('div', { class: 'peq' });
      var validar = function () {
        var a = M.acorde.ler(i.value.trim(), { latina: doc.meta.notacao === 'latina' });
        info.textContent = !i.value.trim() ? '' : !a ? 'Não parece acorde.' : !a.reconhecido ? 'Não reconheço o sufixo: vai ficar marcado para revisão.' : M.acorde.notas(a).map(function (pc) { return M.nota.nome(pc); }).join(' ') + (a.ambiguidades[0] ? ' · ' + a.ambiguidades[0] : '');
      };
      i.oninput = validar;
      i.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); aoConfirmar(i.value.trim()); } if (e.key === 'Escape') fecharPopover(); };
      box.appendChild(i); box.appendChild(info);
      var sug = el('div', { class: 'sug' });
      R.sugestoesDoTom(D.tomDe(doc).tom, recentes).forEach(function (a) { sug.appendChild(el('button', { type: 'button', txt: a, onclick: function () { aoConfirmar(a); } })); });
      box.appendChild(sug);
      validar();
      return box;
    }

    function inserirAcorde(ch, l, cc, k) {
      popover(ch, campoAcorde('', function (a) {
        fecharPopover();
        if (!a) return;
        mudar(function () { cc.marcas.push({ i: k, acorde: a }); l.segmentos = deCaracteres(cc.texto, cc.marcas); lembrar(a); });
      }));
    }
    function editarAcorde(ch, l, cc, mk) {
      var p = popover(ch, campoAcorde(mk.acorde, function (a) {
        fecharPopover();
        mudar(function () { if (a) { mk.acorde = a; lembrar(a); } else cc.marcas.splice(cc.marcas.indexOf(mk), 1); l.segmentos = deCaracteres(cc.texto, cc.marcas); });
      }));
      p.appendChild(el('div', { class: 'linha', style: 'margin-top:6px' }, [C.botao('Remover acorde', function () { fecharPopover(); mudar(function () { cc.marcas.splice(cc.marcas.indexOf(mk), 1); l.segmentos = deCaracteres(cc.texto, cc.marcas); }); }, 'sec peq')]));
    }

    /** A linha como DUAS caixas monoespaçadas (acordes / letra). */
    function editarComoTexto(l) {
      var r = D.renderizarPar(l.segmentos);
      var so = D.soAcordes(l);
      var a = el('input', { type: 'text', value: r.acordes, style: 'width:100%;font-family:ui-monospace,monospace', 'aria-label': 'Linha de acordes' });
      var t = el('input', { type: 'text', value: so ? '' : r.letra, style: 'width:100%;font-family:ui-monospace,monospace', 'aria-label': 'Letra' });
      C.modal('Editar linha (o acorde fica em cima da letra)', el('div', {}, [el('label', {}, [el('span', { class: 'peq', txt: 'Acordes' }), a]), el('label', {}, [el('span', { class: 'peq', txt: 'Letra' }), t])]),
        [{ txt: 'Cancelar' }, { txt: 'Aplicar', fn: function () {
          var r2 = D.deTexto(a.value + '\n' + (t.value || ' '), { notacao: doc.meta.notacao === 'latina' ? 'latina' : 'internacional' });
          var nova = r2.documento.secoes[0] && r2.documento.secoes[0].linhas[0];
          if (!nova || nova.tipo !== 'letra') { C.aviso('Não consegui ler a linha: confira os acordes.'); return false; }
          mudar(function () { l.segmentos = nova.segmentos; });
        } }]);
    }

    function colarTexto() {
      var ta = el('textarea', { rows: '10', placeholder: 'Cole aqui (acordes em cima da letra, ou ChordPro)' });
      C.modal('Colar texto cifrado no fim', ta, [{ txt: 'Cancelar' }, { txt: 'Inserir', fn: function () {
        var novo = /\{|\[[A-G]/.test(ta.value) && /\{/.test(ta.value) ? D.deChordPro(ta.value) : D.deTexto(ta.value).documento;
        mudar(function () { novo.secoes.forEach(function (s) { doc.secoes.push(s); }); });
      } }]);
    }

    function copiar(txt) {
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { C.aviso('Copiado (com o alinhamento).'); }, function () { C.aviso('Não consegui copiar.'); });
    }

    function pintarModoTexto() {
      var ta = el('textarea', { rows: '24', style: 'font-family:ui-monospace,monospace;font-size:15px', 'aria-label': 'ChordPro' });
      ta.value = D.paraChordPro(doc);
      var info = el('p', { class: 'peq', txt: 'ChordPro: acordes entre colchetes antes da sílaba ([C]Olha). Seções com {start_of_chorus} … {end_of_chorus}. Ou cole "acordes em cima da letra" e use o segundo botão.' });
      corpo.appendChild(info);
      corpo.appendChild(ta);
      corpo.appendChild(el('div', { class: 'linha' }, [C.botao('Aplicar ChordPro', function () {
        var novo = D.deChordPro(ta.value);
        var v = D.validar(novo);
        if (!v.ok) return C.aviso('Não dá para aplicar: ' + v.erros[0]);
        mudar(function () { doc = novo; });
        modoTexto = false; pintarTudo();
      }), C.botao('Aplicar como texto (acordes em cima)', function () {
        var r = D.deTexto(ta.value);
        mudar(function () { var meta = doc.meta; doc = r.documento; doc.meta = Object.assign({}, meta, r.documento.meta); });
        if (r.ambiguidades.length) C.aviso(r.ambiguidades.length + ' trecho(s) ambíguo(s): confira as linhas marcadas.');
        modoTexto = false; pintarTudo();
      }, 'sec')]));
    }

    function pintarPrevia() {
      previa.innerHTML = '';
      var p = C.estado.prefs || {};
      var inst = p.instrumento || 'violao';
      var s = C.sel(M.instrumentos.catalogo().map(function (x) { return [x.id, x.nome]; }), inst, function (x) { inst = x; desenhar(); }, 'Instrumento da prévia');
      var area = el('div');
      previa.appendChild(el('div', { class: 'linha' }, [el('h3', { txt: 'Prévia', style: 'margin:0' }), s, C.botao('Fechar prévia', function () { previa.innerHTML = ''; }, 'sec peq')]));
      previa.appendChild(area);
      function desenhar() { area.innerHTML = ''; area.appendChild(R.diagramas(doc, inst, { afinacao: 'padrao' })); area.appendChild(R.cifra(doc, { fonte: 16 })); }
      desenhar();
    }

    function editarMeta() {
      var f = el('div', { class: 'cf-form' }), cmp = {};
      [['titulo', 'Título'], ['artista', 'Artista'], ['compositor', 'Compositor'], ['tom', 'Tom'], ['capo', 'Capo'], ['bpm', 'BPM'], ['compasso', 'Compasso'], ['afinacao', 'Afinação'], ['duracao', 'Duração']].forEach(function (x) {
        var i = el('input', { type: 'text', value: doc.meta[x[0]] || '' }); cmp[x[0]] = i; f.appendChild(el('label', {}, [el('span', { txt: x[1] }), i]));
      });
      var tons = M.harmonia.detectarTom(D.acordesEmOrdem(doc));
      var box = el('div', {}, [f]);
      if (tons[0] && !doc.meta.tom) box.appendChild(el('p', { class: 'peq', txt: 'Tom provável: ' + tons[0].nome + ' (confiança ' + Math.round(tons[0].confianca * 100) + '%) — ' + tons[0].motivo }));
      C.modal('Dados da cifra', box, [{ txt: 'Cancelar' }, { txt: 'Aplicar', fn: function () {
        mudar(function () { Object.keys(cmp).forEach(function (k) { var v = cmp[k].value.trim(); if (v) doc.meta[k] = v; else delete doc.meta[k]; }); });
      } }]);
    }

    function buscarTrocar() {
      var de = el('input', { type: 'text', placeholder: 'Buscar' }), para = el('input', { type: 'text', placeholder: 'Trocar por' });
      var onde = C.sel([['acordes', 'Nos acordes (exato)'], ['letra', 'Na letra']], 'acordes', function () {}, 'Onde');
      var info = el('p', { class: 'peq' });
      var contar = function () {
        var n = 0;
        doc.secoes.forEach(function (s) { s.linhas.forEach(function (l) { if (l.tipo !== 'letra') return; l.segmentos.forEach(function (g) {
          if (onde.value === 'acordes' && g.acorde === de.value) n++;
          if (onde.value === 'letra' && de.value && g.texto.indexOf(de.value) >= 0) n++;
        }); }); });
        info.textContent = de.value ? n + ' ocorrência(s).' : '';
      };
      de.oninput = contar; onde.onchange = contar;
      C.modal('Buscar e trocar', el('div', {}, [de, para, onde, info]), [{ txt: 'Fechar' }, { txt: 'Trocar tudo', fn: function () {
        if (!de.value) return false;
        mudar(function () {
          doc.secoes.forEach(function (s) { s.linhas.forEach(function (l) { if (l.tipo !== 'letra') return; l.segmentos.forEach(function (g) {
            if (onde.value === 'acordes' && g.acorde === de.value) g.acorde = para.value || null;
            if (onde.value === 'letra') g.texto = g.texto.split(de.value).join(para.value);
          }); }); });
        });
      } }]);
    }

    function transporDoc() {
      var semi = el('input', { type: 'number', min: '-11', max: '11', value: '0' });
      C.modal('Transpor a cifra guardada', el('div', {}, [el('p', { txt: 'Isto MUDA a cifra (vira revisão). Para só ler em outro tom, use o seletor de tom da leitura — ele não mexe no arquivo.' }), semi]),
        [{ txt: 'Cancelar' }, { txt: 'Transpor', fn: function () { var n = Number(semi.value) || 0; if (n) mudar(function () { doc = D.transpor(doc, n); }); } }]);
    }

    function organizarIA() {
      var texto = D.paraTexto(doc, { cabecalho: false });
      api('POST', '/ia/interpretar', { texto: texto, titulo: doc.meta.titulo || '' }).then(function (r) {
        var novo = D.deTexto((r.dados && r.dados.texto) || '').documento;
        var box = el('div', {}, [el('div', { class: 'alerta', txt: 'Sugestão da IA (confiança ' + Math.round((r.confianca || 0) * 100) + '%). ' + ((r.dados && r.dados.observacoes) || '') }), C.renderDiff(D.diff(doc, novo, { soMudancas: true }))]);
        C.modal('Aplicar a organização sugerida?', box, [{ txt: 'Descartar' }, { txt: 'Aplicar (dá para desfazer)', fn: function () { mudar(function () { var meta = doc.meta; doc = novo; doc.meta = meta; }); } }]);
      }).catch(C.erro);
    }

    // ---------------- salvar ----------------
    function salvar() {
      fecharPopover();
      var v = D.validar(doc);
      if (!v.ok) return C.aviso('Não dá para salvar: ' + v.erros[0]);
      if (proposta) {
        return api('POST', '/cifras/' + cid + '/propostas', { documento: doc, descricao: descricao.value }).then(function () {
          sujo = false; C.aviso('Proposta enviada. Quem cuida da cifra vai comparar e decidir.'); C.ir('cifra', cid);
        }).catch(C.erro);
      }
      status.textContent = 'Salvando…';
      api('PUT', '/cifras/' + cid, { documento: doc, versao: d.cifra.versao, descricao: descricao.value }).then(function (r) {
        sujo = false; C.apagar('cache', 'rascunho:' + cid).catch(function () {});
        d.cifra = r.cifra;
        status.textContent = r.sem_mudancas ? 'Nada mudou.' : 'Revisão ' + r.cifra.revisao_atual + ' salva.';
        descricao.value = '';
      }).catch(function (e) {
        if (e.status === 409 && e.dados && e.dados.codigo === 'CONFLITO') return conflito(e.dados);
        if (e.semRede) { status.textContent = 'Sem internet: sua edição está guardada neste aparelho como rascunho. Salve quando a conexão voltar.'; C.guardar('cache', 'rascunho:' + cid, { em: Date.now(), documento: doc }).catch(function () {}); return; }
        C.erro(e); status.textContent = '';
      });
    }

    /** Conflito: mostra o que a outra pessoa mudou; NADA se perde em nenhuma escolha. */
    function conflito(x) {
      var box = el('div', {}, [el('p', { txt: 'Outra pessoa salvou esta cifra (revisão ' + x.revisao_atual + ') depois que você abriu. Abaixo, o que muda da versão dela para a sua:' }),
        C.renderDiff(x.diff)]);
      C.modal('Conflito de edição', box, [
        { txt: 'Guardar a minha como rascunho e abrir a dela', fn: function () {
          C.guardar('cache', 'rascunho:' + cid, { em: Date.now(), documento: doc }).catch(function () {});
          sujo = false; C.ir('cifra', cid);
        } },
        { txt: 'Publicar a minha por cima (a dela fica no histórico)', fn: function () {
          d.cifra.versao = x.versao_atual; d.cifra.revisao_atual = x.revisao_atual; salvar();
        } },
      ]);
    }

    function sair() {
      if (!sujo) return C.ir('cifra', cid);
      C.confirmar('Sair do editor?', 'A edição não publicada fica como rascunho (neste aparelho e no servidor) e você continua depois.', 'Sair').then(function (ok) { if (ok) C.ir('cifra', cid); });
    }

    // atalhos
    document.addEventListener('keydown', function atalho(e) {
      if (!document.body.contains(corpo)) { document.removeEventListener('keydown', atalho); fecharPopover(); return; }
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); salvar(); }
      else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); fazerDesfazer(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); fazerRefazer(); }
      else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); buscarTrocar(); }
      else if (e.key === 'Escape') { fecharPopover(); if (armado) { armado = null; pintarAcordes(); } }
    });
    global.addEventListener('beforeunload', function avisar(e) { if (!document.body.contains(corpo)) { global.removeEventListener('beforeunload', avisar); return; } if (sujo) { e.preventDefault(); e.returnValue = ''; } });
    pintarTudo();
  }
})(window);
