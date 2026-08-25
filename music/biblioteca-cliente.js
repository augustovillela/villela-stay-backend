// =====================================================================
// Musique — BIBLIOTECA, REPERTÓRIO e MODO PALCO no cliente.
// Servido em /music/biblioteca.js. SPA sem build, padrão da casa.
//
// A TELA QUE DECIDE O PRODUTO É O MODO PALCO. Ela é usada em pé, com
// pouca luz, mãos ocupadas e internet ruim — e por isso é a única deste
// arquivo com regras próprias:
//
//   · o setlist inteiro é baixado DE UMA VEZ e guardado no aparelho;
//     pedir uma requisição por música é garantir que a terceira não abra;
//   · a tela pede WAKE LOCK: celular que apaga no meio do refrão é pior
//     do que não ter aplicativo nenhum;
//   · fonte grande, alto contraste e rolagem automática com controle
//     manual sempre por perto;
//   · quando abre do cache, DIZ que está offline e de quando é a cópia —
//     subir no palco com um setlist de três semanas atrás é o acidente
//     que o cache silencioso causa.
//
// ⚠️ ASCII no fonte, como o resto do módulo: caractere fora do plano
// básico já truncou um arquivo servido aqui uma vez.
// =====================================================================
'use strict';

const JS = `
(function () {
  'use strict';
  var U = window.MusiqueUI;
  var A = window.MusiqueAudio;
  var $ = U.$, el = U.el, esc = U.esc, api = U.api, erro = U.erro, aviso = U.aviso;

  var CHAVE_PALCO = 'musique.palco.';       // + id do repertorio
  var estado = { pastaAtual: null, obra: null, tom: 0, capo: 0, instrumento: 'do' };

  // =================================================================
  // BIBLIOTECA
  // =================================================================
  function verBiblioteca(filtro) {
    var f = filtro || {};
    var q = [];
    if (f.q) q.push('q=' + encodeURIComponent(f.q));
    if (f.pasta !== undefined && f.pasta !== null) q.push('pasta=' + encodeURIComponent(f.pasta));
    if (f.tag) q.push('tag=' + encodeURIComponent(f.tag));

    Promise.all([api('GET', '/acervo' + (q.length ? '?' + q.join('&') : '')), api('GET', '/pastas')])
      .then(function (rs) {
        var d = rs[0], arv = rs[1];
        var c = $('#corpo'); c.innerHTML = '';
        c.appendChild(el('h2', { txt: 'Minha biblioteca' }));
        c.appendChild(el('p', { class: 'sub', txt:
          'O que esta aqui e seu e fica privado. Busque pelo titulo, pelo compositor, por etiqueta - ou por um trecho da LETRA.' }));

        // busca
        var busca = el('input', { type: 'search', placeholder: 'Buscar (ex.: "o sol na janela")', value: f.q || '' });
        busca.addEventListener('keydown', function (e) { if (e.key === 'Enter') verBiblioteca({ q: busca.value }); });
        c.appendChild(el('div', { class: 'linha' }, [
          busca,
          el('button', { class: 'btn', txt: 'Buscar', onclick: function () { verBiblioteca({ q: busca.value }); } }),
          el('button', { class: 'btn sec', txt: '+ Musica', onclick: novaObra }),
          el('button', { class: 'btn sec', txt: '+ Pasta', onclick: function () { novaPasta(); } }),
        ]));

        // pastas
        if (arv.raiz.length) {
          var chips = el('div', { class: 'linha' });
          chips.appendChild(el('button', { class: 'chip-b' + (f.pasta === undefined ? ' on' : ''),
            txt: 'Tudo', onclick: function () { verBiblioteca({}); } }));
          chips.appendChild(el('button', { class: 'chip-b' + (f.pasta === '' ? ' on' : ''),
            txt: 'Sem pasta (' + arv.sem_pasta + ')', onclick: function () { verBiblioteca({ pasta: '' }); } }));
          (function pintar(nos, nivel) {
            nos.forEach(function (p) {
              chips.appendChild(el('button', { class: 'chip-b' + (f.pasta === p.id ? ' on' : ''),
                txt: (nivel ? '\\u21b3 ' : '') + p.nome + ' (' + p.obras + ')',
                onclick: function () { verBiblioteca({ pasta: p.id }); } }));
              if (p.filhas.length) pintar(p.filhas, nivel + 1);
            });
          })(arv.raiz, 0);
          c.appendChild(chips);
        }

        // etiquetas
        if (d.tags.length) {
          var tg = el('div', { class: 'linha' });
          d.tags.forEach(function (x) {
            tg.appendChild(el('button', { class: 'chip-b' + (f.tag === x.tag ? ' on' : ''),
              txt: '#' + x.tag + ' (' + x.n + ')', onclick: function () { verBiblioteca({ tag: x.tag }); } }));
          });
          c.appendChild(tg);
        }

        if (!d.obras.length) {
          c.appendChild(el('p', { class: 'vazio', txt: f.q
            ? 'Nada encontrado para "' + f.q + '".'
            : 'Sua biblioteca esta vazia. Comece guardando uma cifra sua.' }));
          return;
        }

        var g = el('div', { class: 'grade' });
        d.obras.forEach(function (o) {
          g.appendChild(el('button', {
            class: 'item', onclick: function () { abrirObra(o.id); },
            html: '<b>' + esc(o.titulo) + '</b>' +
              (o.compositor ? '<span>' + esc(o.compositor) + '</span>' : '') +
              '<span class="peq">' + (o.tom_original ? 'tom ' + esc(o.tom_original) + ' - ' : '') +
              (o.formatos.length ? o.formatos.join(', ') : 'sem partitura') + '</span>' +
              (o.titularidade === 'terceiro_privado'
                ? '<span class="chip alerta">acervo pessoal</span>' : ''),
          }));
        });
        c.appendChild(g);
      }).catch(function (e) { erro(e.message); });
  }

  function novaPasta(paiId) {
    var nome = prompt('Nome da pasta:');
    if (!nome) return;
    api('POST', '/pastas', { nome: nome, pai_id: paiId || '' })
      .then(function () { verBiblioteca(); }).catch(function (e) { erro(e.message); });
  }

  function novaObra() {
    var c = $('#corpo'); c.innerHTML = '';
    c.appendChild(el('h2', { txt: 'Guardar uma musica' }));
    var tit = el('input', { type: 'text', placeholder: 'Titulo' });
    var comp = el('input', { type: 'text', placeholder: 'Compositor (opcional)' });
    var tom = el('input', { type: 'text', placeholder: 'Tom (ex.: C, Am, Solm)' });
    var tags = el('input', { type: 'text', placeholder: 'Etiquetas separadas por virgula' });
    var titul = el('select');
    [['propria', 'E minha (composicao ou arranjo meu)'],
     ['dominio_publico', 'Esta em dominio publico'],
     ['licenciada', 'Tenho licenca de uso'],
     ['terceiro_privado', 'E de outro autor - fica so no meu acervo']].forEach(function (o) {
      titul.appendChild(el('option', { value: o[0], txt: o[1] }));
    });
    titul.value = 'terceiro_privado';

    [['Titulo', tit], ['Compositor', comp], ['Tom', tom], ['Etiquetas', tags], ['De quem e', titul]]
      .forEach(function (p) { c.appendChild(el('div', { class: 'campo' }, [el('label', { txt: p[0] }), p[1]])); });

    c.appendChild(el('div', { class: 'alerta', html:
      '<b>Por que perguntamos de quem e a musica.</b> Obra de outro autor fica no seu acervo pessoal: ' +
      'nao e publicada, nao e sugerida a mais ninguem e nao vai para servicos de IA. ' +
      'A Musique nao distribui obra de terceiro.' }));

    c.appendChild(el('div', { class: 'linha' }, [
      el('button', { class: 'btn', txt: 'Guardar', onclick: function () {
        api('POST', '/obras', {
          titulo: tit.value, compositor: comp.value, tomOriginal: tom.value,
          titularidade: titul.value,
          tags: tags.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean),
        }).then(function (r) { abrirObra(r.obra.id); }).catch(function (e) { erro(e.message); });
      } }),
      el('button', { class: 'btn sec', txt: 'Cancelar', onclick: function () { verBiblioteca(); } }),
    ]));
  }

  // =================================================================
  // OBRA
  // =================================================================
  function abrirObra(id) {
    api('GET', '/obras/' + id).then(function (d) {
      estado.obra = d;
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('button', { class: 'btn sec peq', txt: '< Biblioteca', onclick: function () { verBiblioteca(); } }));
      c.appendChild(el('h2', { txt: d.obra.titulo }));
      if (d.obra.compositor) c.appendChild(el('p', { class: 'sub', txt: d.obra.compositor }));

      if (d.obra.titularidade === 'terceiro_privado') {
        c.appendChild(el('div', { class: 'alerta', html:
          '<b>Acervo pessoal.</b> Esta obra esta registrada como de outro autor: fica so para voce. ' +
          '<button class="btn peq" id="b-titul">E minha</button>' }));
        $('#b-titul').onclick = function () {
          api('POST', '/obras/' + id + '/titularidade', { tipo: 'propria', evidencia: 'declarado pelo autor' })
            .then(function () { abrirObra(id); }).catch(function (e) { erro(e.message); });
        };
      }

      if (!d.arranjos.length) {
        c.appendChild(el('p', { class: 'vazio', txt: 'Nenhum arranjo ainda.' }));
      }
      d.arranjos.forEach(function (a) {
        var box = el('div', { class: 'card' });
        box.innerHTML = '<h3>' + esc(a.nome || 'Arranjo') + '</h3>';
        if (!a.partituras.length) box.appendChild(el('p', { class: 'peq', txt: 'sem partitura' }));
        a.partituras.forEach(function (p) {
          var linha = el('div', { class: 'linha' });
          linha.appendChild(el('span', { class: 'chip', txt: p.formato + ' - versao ' + p.versao }));
          if (p.capacidades.transpoe) {
            linha.appendChild(el('button', { class: 'btn sec peq', txt: 'Abrir',
              onclick: function () { abrirPartitura(p.id, p.formato); } }));
          } else {
            linha.appendChild(el('span', { class: 'peq', txt: 'anexo - nao transpoe nem toca' }));
          }
          box.appendChild(linha);
        });
        (a.anotacoes || []).forEach(function (an) {
          box.appendChild(el('p', { class: 'peq', txt: '- ' + (an.ancora ? an.ancora + ': ' : '') + an.texto }));
        });
        box.appendChild(el('div', { class: 'linha' }, [
          el('button', { class: 'btn sec peq', txt: '+ Cifra',
            onclick: function () { novaCifra(a.id, id); } }),
          el('button', { class: 'btn sec peq', txt: '+ Anotacao', onclick: function () {
            var txt = prompt('Anotacao (dedilhado, entrada, aviso de palco):');
            if (!txt) return;
            api('POST', '/arranjos/' + a.id + '/anotacoes', { texto: txt })
              .then(function () { abrirObra(id); }).catch(function (e) { erro(e.message); });
          } }),
        ]));
        c.appendChild(box);
      });

      c.appendChild(el('button', { class: 'btn sec', txt: '+ Arranjo', onclick: function () {
        var nome = prompt('Nome do arranjo (ex.: voz e violao):') || '';
        api('POST', '/obras/' + id + '/arranjos', { nome: nome })
          .then(function () { abrirObra(id); }).catch(function (e) { erro(e.message); });
      } }));
    }).catch(function (e) { erro(e.message); });
  }

  function novaCifra(arranjoId, obraId) {
    var c = $('#corpo'); c.innerHTML = '';
    c.appendChild(el('h2', { txt: 'Guardar a cifra' }));
    c.appendChild(el('div', { class: 'alerta', html:
      '<b>O acorde vai entre colchetes, colado na silaba onde ele entra.</b><br>' +
      '<code>Vou pela [C]estrada sem [Am]pressa</code><br>' +
      'E isso que faz a cifra transpor sem desalinhar a letra - o problema numero 1 de cifra guardada em bloco de notas.' }));
    var ta = el('textarea', { rows: '16', placeholder: '{title: Minha musica}\\n{key: C}\\n\\nVou pela [C]estrada...' });
    ta.style.fontFamily = 'ui-monospace, monospace';
    c.appendChild(ta);
    c.appendChild(el('div', { class: 'linha' }, [
      el('button', { class: 'btn', txt: 'Guardar', onclick: function () {
        api('POST', '/arranjos/' + arranjoId + '/partituras', { formato: 'chordpro', conteudo: ta.value })
          .then(function () { abrirObra(obraId); }).catch(function (e) { erro(e.message); });
      } }),
      el('button', { class: 'btn sec', txt: 'Cancelar', onclick: function () { abrirObra(obraId); } }),
    ]));
  }

  // =================================================================
  // VISUALIZADOR DE CIFRA
  // =================================================================
  function abrirPartitura(id, formato) {
    estado.tom = 0; estado.capo = 0; estado.instrumento = 'do';
    estado.partitura = { id: id, formato: formato };
    recarregarPartitura();
  }

  function recarregarPartitura() {
    var p = estado.partitura;
    var q = '?semitons=' + estado.tom + '&capotraste=' + estado.capo + '&instrumento=' + estado.instrumento;
    api('GET', '/partituras/' + p.id + q).then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('button', { class: 'btn sec peq', txt: '< Musica',
        onclick: function () { abrirObra(d.obra.id); } }));
      c.appendChild(el('h2', { txt: d.obra.titulo }));

      if (d.aviso) c.appendChild(el('div', { class: 'alerta', txt: d.aviso }));

      if (p.formato !== 'chordpro') {
        c.appendChild(el('div', { class: 'card', html:
          '<p class="peq">' + esc(p.formato.toUpperCase()) + ' - ' +
          (d.resumo ? esc(JSON.stringify(d.resumo.tom || d.resumo.bpm || '')) : '') + '</p>' +
          '<p>' + ((d.notas && (d.notas.eventos || d.notas).length) || 0) + ' nota(s) lidas.</p>' }));
        c.appendChild(controlesTom());
        if (d.notas) {
          var evs = d.notas.eventos || d.notas;
          c.appendChild(el('button', { class: 'btn', txt: 'Tocar', onclick: function () {
            A.tocar({ tipo: 'sequencia', midi: evs.slice(0, 60).map(function (e) { return e.midi; }),
              dur_ms: 350, gap_ms: 20 });
          } }));
        }
        return;
      }

      // ---- controles ----
      c.appendChild(controlesTom(d));

      // ---- cifra: acorde ACIMA da silaba ----
      var pal = el('div', { class: 'cifra' });
      d.documento.linhas.forEach(function (l) {
        if (l.tipo === 'vazia') { pal.appendChild(el('div', { class: 'cf-vazia' })); return; }
        if (l.tipo === 'comentario') { pal.appendChild(el('div', { class: 'cf-com', txt: l.texto })); return; }
        if (l.tipo === 'secao') { pal.appendChild(el('div', { class: 'cf-sec', txt: rotuloSecao(l.secao) })); return; }
        if (l.tipo !== 'letra') return;
        var linha = el('div', { class: 'cf-linha' });
        l.partes.forEach(function (parte) {
          linha.appendChild(el('span', { class: 'cf-par', html:
            '<span class="cf-ac">' + (parte.cifra ? esc(parte.cifra) : '') + '</span>' +
            '<span class="cf-tx">' + esc(parte.texto || '') + '</span>' }));
        });
        pal.appendChild(linha);
      });
      c.appendChild(pal);

      // ---- diagramas ----
      if (d.acordes && d.acordes.length) {
        var box = el('div', { id: 'diagramas' });
        box.appendChild(el('h3', { txt: 'Acordes desta cifra' }));
        c.appendChild(box);
        var grade = el('div', { class: 'diagramas' });
        box.appendChild(grade);
        d.acordes.forEach(function (a) {
          api('GET', '/acordes/' + encodeURIComponent(a.cifra) + '?n=1').then(function (r) {
            grade.appendChild(diagrama(a.cifra, r.formas[0], r.motivo));
          }).catch(function () {});
        });
      }
    }).catch(function (e) { erro(e.message); });
  }

  function controlesTom(d) {
    var caixa = el('div', { class: 'controles' });
    var info = el('div', { class: 'peq' });
    if (d) {
      info.innerHTML = 'Soando em <b>' + esc(d.tom_soando || d.tom_original || '?') + '</b>' +
        (estado.capo ? ' - com capotraste na ' + estado.capo + 'a casa voce toca as formas de <b>' +
          esc(d.tom_das_formas) + '</b>' : '');
    }
    var menos = el('button', { class: 'btn sec peq', txt: '- meio tom',
      onclick: function () { estado.tom--; recarregarPartitura(); } });
    var mais = el('button', { class: 'btn sec peq', txt: '+ meio tom',
      onclick: function () { estado.tom++; recarregarPartitura(); } });
    var zerar = el('button', { class: 'btn sec peq', txt: 'Tom original',
      onclick: function () { estado.tom = 0; estado.capo = 0; recarregarPartitura(); } });

    var capo = el('select');
    for (var i = 0; i <= 7; i++) capo.appendChild(el('option', { value: String(i), txt: i ? 'capo ' + i : 'sem capo' }));
    capo.value = String(estado.capo);
    capo.onchange = function () { estado.capo = Number(capo.value); recarregarPartitura(); };

    var inst = el('select');
    [['do', 'instrumento em do'], ['sib', 'em si bemol (trompete, clarinete)'],
     ['mib', 'em mi bemol (sax alto)'], ['fa', 'em fa (trompa)']].forEach(function (o) {
      inst.appendChild(el('option', { value: o[0], txt: o[1] }));
    });
    inst.value = estado.instrumento;
    inst.onchange = function () { estado.instrumento = inst.value; recarregarPartitura(); };

    caixa.appendChild(el('div', { class: 'linha' }, [menos, mais, zerar, capo, inst]));
    caixa.appendChild(info);
    return caixa;
  }

  var rotuloSecao = function (s) {
    return ({ verso: 'Verso', refrao: 'Refrao', ponte: 'Ponte', tablatura: 'Tablatura' })[s] || s;
  };

  /** Diagrama do acorde em SVG. 6 cordas x 5 casas. */
  function diagrama(cifra, forma, motivo) {
    if (!forma) {
      return el('div', { class: 'diag', html: '<b>' + esc(cifra) + '</b>' +
        '<p class="peq">' + esc(motivo || 'sem desenho') + '</p>' });
    }
    var base = forma.posicao > 1 ? forma.posicao : 1;
    var L = 22, T0 = 26, W = L * 5, H = 20 * 5;
    var partes = [];
    for (var i = 0; i < 6; i++) partes.push('<line x1="' + (10 + i * L) + '" y1="' + T0 + '" x2="' + (10 + i * L) + '" y2="' + (T0 + H) + '" stroke="#1F2933"/>');
    for (var j = 0; j <= 5; j++) partes.push('<line x1="10" y1="' + (T0 + j * 20) + '" x2="' + (10 + W) + '" y2="' + (T0 + j * 20) + '" stroke="#1F2933" stroke-width="' + (j === 0 && base === 1 ? 3 : 1) + '"/>');
    if (forma.pestana) {
      var y = T0 + (forma.pestana - base) * 20 + 10;
      partes.push('<rect x="6" y="' + (y - 6) + '" width="' + (W + 8) + '" height="12" rx="6" fill="#1F2933" opacity=".85"/>');
    }
    forma.casas.forEach(function (casa, i) {
      var x = 10 + i * L;
      if (casa < 0) partes.push('<text x="' + x + '" y="' + (T0 - 8) + '" font-size="13" text-anchor="middle" fill="#8A8F98">x</text>');
      else if (casa === 0) partes.push('<circle cx="' + x + '" cy="' + (T0 - 12) + '" r="4.5" fill="none" stroke="#1F2933"/>');
      else if (casa !== forma.pestana) partes.push('<circle cx="' + x + '" cy="' + (T0 + (casa - base) * 20 + 10) + '" r="7" fill="#1F2933"/>');
    });
    if (base > 1) partes.push('<text x="' + (W + 18) + '" y="' + (T0 + 14) + '" font-size="12" fill="#5B6478">' + base + 'a</text>');
    return el('div', { class: 'diag', html:
      '<b>' + esc(cifra) + '</b>' +
      '<svg viewBox="0 0 ' + (W + 40) + ' ' + (H + 40) + '" width="150" role="img" aria-label="Digitacao de ' + esc(cifra) + ': ' + esc(forma.desenho) + '">' +
      partes.join('') + '</svg>' +
      '<span class="peq">' + esc(forma.desenho) + (forma.pestana ? ' - pestana' : '') + '</span>' });
  }

  // =================================================================
  // REPERTORIOS
  // =================================================================
  function verRepertorios() {
    Promise.all([api('GET', '/repertorios'), api('GET', '/bandas')]).then(function (rs) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: 'Repertorios' }));
      c.appendChild(el('div', { class: 'linha' }, [
        el('button', { class: 'btn', txt: '+ Repertorio', onclick: function () { novoRepertorio(rs[1].bandas); } }),
        el('button', { class: 'btn sec', txt: '+ Banda', onclick: function () {
          var nome = prompt('Nome da banda:');
          if (!nome) return;
          api('POST', '/bandas', { nome: nome }).then(verRepertorios).catch(function (e) { erro(e.message); });
        } }),
        el('button', { class: 'btn sec', txt: 'Montar por duracao', onclick: sugerir }),
      ]));

      if (rs[1].bandas.length) {
        c.appendChild(el('h3', { txt: 'Minhas bandas' }));
        rs[1].bandas.forEach(function (b) {
          c.appendChild(el('div', { class: 'card', html:
            '<b>' + esc(b.nome) + '</b><p class="peq">' + b.membros.length + ' integrante(s)</p>' }));
          var ultimo = c.lastChild;
          ultimo.appendChild(el('button', { class: 'btn sec peq', txt: 'Convidar', onclick: function () {
            var emails = prompt('E-mails dos integrantes, separados por virgula:');
            if (!emails) return;
            api('POST', '/bandas/' + b.id + '/membros',
              { emails: emails.split(/[,;\\s]+/).filter(Boolean) })
              .then(function (r) {
                verRepertorios();
                var msg = r.entraram + ' integrante(s) adicionado(s).';
                if (r.nao_encontrados && r.nao_encontrados.length) {
                  msg += ' Nao achei conta para: ' + r.nao_encontrados.join(', ') + '.';
                }
                setTimeout(function () { aviso(msg); }, 60);
              }).catch(function (e) { erro(e.message); });
          } }));
        });
      }

      c.appendChild(el('h3', { txt: 'Setlists' }));
      if (!rs[0].repertorios.length) {
        c.appendChild(el('p', { class: 'vazio', txt: 'Nenhum repertorio ainda.' }));
        return;
      }
      rs[0].repertorios.forEach(function (r) {
        var box = el('div', { class: 'card' });
        box.innerHTML = '<h3>' + esc(r.nome) + '</h3>' +
          '<p class="peq">' + r.itens + ' musica(s) - ' + r.duracao.total_min + ' min' +
          (r.duracao.confiavel ? '' : ' (com estimativas)') +
          (r.banda_id ? ' - da banda' : '') + '</p>';
        box.appendChild(el('div', { class: 'linha' }, [
          el('button', { class: 'btn', txt: 'Modo palco', onclick: function () { abrirPalco(r.id, r.nome); } }),
          el('button', { class: 'btn sec', txt: 'Editar', onclick: function () { abrirRepertorio(r.id); } }),
        ]));
        c.appendChild(box);
      });
    }).catch(function (e) { erro(e.message); });
  }

  function novoRepertorio(bandas) {
    var c = $('#corpo'); c.innerHTML = '';
    c.appendChild(el('h2', { txt: 'Novo repertorio' }));
    var nome = el('input', { type: 'text', placeholder: 'Ex.: Sexta no bar' });
    var ocasiao = el('input', { type: 'text', placeholder: 'bar, casamento, culto, ensaio...' });
    var data = el('input', { type: 'date' });
    var banda = el('select');
    banda.appendChild(el('option', { value: '', txt: 'so meu' }));
    (bandas || []).forEach(function (b) { banda.appendChild(el('option', { value: b.id, txt: 'banda: ' + b.nome })); });
    [['Nome', nome], ['Ocasiao', ocasiao], ['Data', data], ['De quem e', banda]]
      .forEach(function (p) { c.appendChild(el('div', { class: 'campo' }, [el('label', { txt: p[0] }), p[1]])); });
    c.appendChild(el('div', { class: 'linha' }, [
      el('button', { class: 'btn', txt: 'Criar', onclick: function () {
        api('POST', '/repertorios', { nome: nome.value, ocasiao: ocasiao.value, data: data.value, banda_id: banda.value })
          .then(function (r) { abrirRepertorio(r.repertorio.id); }).catch(function (e) { erro(e.message); });
      } }),
      el('button', { class: 'btn sec', txt: 'Cancelar', onclick: verRepertorios }),
    ]));
  }

  function abrirRepertorio(id) {
    Promise.all([api('GET', '/repertorios/' + id), api('GET', '/acervo')]).then(function (rs) {
      var d = rs[0], acervo = rs[1].obras;
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('button', { class: 'btn sec peq', txt: '< Repertorios', onclick: verRepertorios }));
      c.appendChild(el('h2', { txt: d.repertorio.nome }));

      var dur = d.duracao;
      c.appendChild(el('div', { class: 'alerta' + (dur.confiavel ? ' bom' : ''), html:
        '<b>' + dur.total_min + ' minutos</b>' +
        (dur.confiavel ? ' (durações informadas por você).'
          : ' - <b>com estimativas</b>. ' + Math.round(dur.estimado_s / 60) + ' min vieram de estimativa a partir do tamanho da cifra' +
            (dur.sem_duracao ? ' e ' + dur.sem_duracao + ' musica(s) estao sem duracao' : '') +
            '. Confira antes de combinar horario com quem contratou.') }));

      c.appendChild(el('div', { class: 'linha' }, [
        el('button', { class: 'btn', txt: 'Modo palco', onclick: function () { abrirPalco(id, d.repertorio.nome); } }),
      ]));

      d.itens.forEach(function (it, i) {
        var box = el('div', { class: 'card' });
        box.innerHTML = '<b>' + (i + 1) + '. ' + esc(it.titulo) + '</b>' +
          '<p class="peq">' + (it.tom_execucao ? 'tom ' + esc(it.tom_execucao) : 'tom nao definido') +
          (it.capotraste ? ' - capo ' + it.capotraste : '') +
          ' - ' + Math.round(it.duracao_s / 60) + ' min' + (it.duracao_estimada ? ' (estimado)' : '') + '</p>' +
          (it.nota_palco ? '<p class="peq">' + esc(it.nota_palco) + '</p>' : '');
        var linha = el('div', { class: 'linha' });
        if (i > 0) linha.appendChild(el('button', { class: 'btn sec peq', txt: 'subir',
          onclick: function () { mover(id, d.itens, i, -1); } }));
        if (i < d.itens.length - 1) linha.appendChild(el('button', { class: 'btn sec peq', txt: 'descer',
          onclick: function () { mover(id, d.itens, i, 1); } }));
        linha.appendChild(el('button', { class: 'btn sec peq', txt: 'editar', onclick: function () {
          var tom = prompt('Tom de execucao:', it.tom_execucao || '');
          if (tom === null) return;
          var capo = prompt('Capotraste (0 = sem):', String(it.capotraste || 0));
          var min = prompt('Duracao em minutos (vazio = manter):', it.duracao_s ? String(Math.round(it.duracao_s / 60)) : '');
          var corpo = { tom_execucao: tom, capotraste: Number(capo) || 0 };
          if (min) corpo.duracao_s = Number(min) * 60;
          api('PATCH', '/itens/' + it.id, corpo)
            .then(function () { abrirRepertorio(id); }).catch(function (e) { erro(e.message); });
        } }));
        linha.appendChild(el('button', { class: 'btn sec peq', txt: 'remover', onclick: function () {
          api('DELETE', '/itens/' + it.id).then(function () { abrirRepertorio(id); })
            .catch(function (e) { erro(e.message); });
        } }));
        box.appendChild(linha);
        c.appendChild(box);
      });

      // adicionar do acervo
      c.appendChild(el('h3', { txt: 'Adicionar' }));
      var sel = el('select');
      sel.appendChild(el('option', { value: '', txt: 'escolha uma musica do acervo' }));
      acervo.forEach(function (o) { sel.appendChild(el('option', { value: o.id, txt: o.titulo })); });
      c.appendChild(el('div', { class: 'linha' }, [
        sel,
        el('button', { class: 'btn', txt: 'Adicionar', onclick: function () {
          if (!sel.value) return;
          api('POST', '/repertorios/' + id + '/itens', { obra_id: sel.value })
            .then(function () { abrirRepertorio(id); }).catch(function (e) { erro(e.message); });
        } }),
        el('button', { class: 'btn sec', txt: '+ Item livre (intervalo, fala)', onclick: function () {
          var t = prompt('Nome do item:');
          if (!t) return;
          var m = prompt('Duracao em minutos:', '10');
          api('POST', '/repertorios/' + id + '/itens', { titulo_livre: t, duracao_s: (Number(m) || 0) * 60 })
            .then(function () { abrirRepertorio(id); }).catch(function (e) { erro(e.message); });
        } }),
      ]));
    }).catch(function (e) { erro(e.message); });
  }

  function mover(repId, itens, i, delta) {
    var ids = itens.map(function (x) { return x.id; });
    var j = i + delta;
    var tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
    api('POST', '/repertorios/' + repId + '/ordem', { ids: ids })
      .then(function () { abrirRepertorio(repId); }).catch(function (e) { erro(e.message); });
  }

  function sugerir() {
    var min = prompt('Quantos minutos de show?', '45');
    if (!min) return;
    api('POST', '/repertorios/sugerir', { minutos: Number(min) }).then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      c.appendChild(el('h2', { txt: 'Sugestao para ' + Math.round(d.alvo_s / 60) + ' minutos' }));
      c.appendChild(el('div', { class: 'alerta', txt: d.aviso }));
      if (!d.itens.length) { c.appendChild(el('button', { class: 'btn sec', txt: 'Voltar', onclick: verRepertorios })); return; }
      c.appendChild(el('p', { class: 'sub', txt: 'Total sugerido: ' + Math.round(d.total_s / 60) + ' min' }));
      d.itens.forEach(function (i) {
        c.appendChild(el('div', { class: 'card', html:
          '<b>' + esc(i.titulo) + '</b><p class="peq">' + Math.round(i.duracao_s / 60) + ' min (estimado)</p>' }));
      });
      c.appendChild(el('button', { class: 'btn sec', txt: 'Voltar', onclick: verRepertorios }));
    }).catch(function (e) { erro(e.message); });
  }

  // =================================================================
  // MODO PALCO
  // =================================================================
  function abrirPalco(id, nome) {
    var salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(CHAVE_PALCO + id) || 'null'); } catch (e) {}

    api('GET', '/repertorios/' + id + '/palco')
      .then(function (d) {
        try { localStorage.setItem(CHAVE_PALCO + id, JSON.stringify(d)); } catch (e) {}
        pintarPalco(d, false);
      })
      .catch(function (e) {
        // Sem rede: usa a copia guardada e DIZ que e copia, com a data.
        // Cache silencioso e o que faz o musico subir no palco com o
        // setlist da semana passada sem saber.
        if (salvo) return pintarPalco(salvo, true);
        erro(e.message + ' E nao ha copia guardada deste setlist neste aparelho.');
      });
  }

  function pintarPalco(d, offline) {
    var idx = 0;
    var wake = null;
    var rolando = false, rafId = null;

    var tela = el('div', { class: 'palco' });
    document.body.appendChild(tela);
    document.body.classList.add('em-palco');

    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {});
    }

    function sair() {
      pararRolagem();
      if (wake) { try { wake.release(); } catch (e) {} }
      document.body.classList.remove('em-palco');
      tela.remove();
      window.removeEventListener('keydown', teclas);
    }
    function teclas(e) {
      if (e.key === 'Escape') sair();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') pular(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') pular(-1);
      else if (e.key === ' ') { e.preventDefault(); alternarRolagem(); }
    }
    window.addEventListener('keydown', teclas);

    function pular(n) { idx = Math.max(0, Math.min(d.itens.length - 1, idx + n)); pararRolagem(); pintar(); }

    /** Mensagem curta DENTRO do palco. */
    function recado(txt) {
      var antigo = tela.querySelector('.palco-recado');
      if (antigo) antigo.remove();
      var d = el('div', { class: 'palco-recado', txt: txt });
      tela.insertBefore(d, tela.querySelector('.palco-corpo'));
      setTimeout(function () { d.remove(); }, 5000);
    }

    function alternarRolagem() { rolando ? pararRolagem() : iniciarRolagem(); }

    function iniciarRolagem() {
      var alvo = tela.querySelector('.palco-corpo');
      // Musica que ja cabe na tela nao tem o que rolar. Sem este aviso o
      // musico aperta "Rolar", nada acontece, e ele conclui que o
      // aplicativo travou — bem na hora em que menos pode parar para
      // investigar.
      if (alvo.scrollHeight - alvo.clientHeight < 20) {
        // ATENCAO: o aviso tem de sair DENTRO do palco. A funcao aviso()
        // do app escreve no corpo da pagina, que esta ATRAS deste
        // overlay — a mensagem existiria e ninguem veria, o que e pior
        // do que nao avisar. (Sem crase neste arquivo: ele inteiro mora
        // dentro de um template literal.)
        recado('Esta musica ja cabe inteira na tela: nao ha o que rolar.');
        return;
      }
      rolando = true;
      var ultimo = performance.now();
      // O acumulador e FRACIONARIO de proposito: \`scrollTop\` so aceita
      // inteiro, e somar 0,5 px por quadro seria truncado para zero — a
      // rolagem lenta simplesmente nunca sairia do lugar.
      var pos = alvo.scrollTop;
      (function ciclo(agora) {
        if (!rolando) return;
        var passo = Number(tela.querySelector('#p-vel').value) || 30;   // px por segundo
        pos += (passo * (agora - ultimo)) / 1000;
        ultimo = agora;
        alvo.scrollTop = pos;
        // Chegou ao fim: para sozinha, em vez de ficar consumindo quadro
        // e bateria ate alguem perceber.
        if (alvo.scrollTop >= alvo.scrollHeight - alvo.clientHeight - 1) return pararRolagem();
        rafId = requestAnimationFrame(ciclo);
      })(performance.now());
      atualizarBotaoRolagem();
    }
    function pararRolagem() {
      rolando = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      atualizarBotaoRolagem();
    }
    function atualizarBotaoRolagem() {
      var b = tela.querySelector('#p-rolar');
      if (b) b.textContent = rolando ? 'Parar rolagem' : 'Rolar';
    }

    function pintar() {
      var it = d.itens[idx];
      var linhas = '';
      if (it.cifra) {
        it.cifra.forEach(function (l) {
          if (l.tipo === 'vazia') { linhas += '<div class="cf-vazia"></div>'; return; }
          if (l.tipo === 'comentario') { linhas += '<div class="cf-com">' + esc(l.texto) + '</div>'; return; }
          if (l.tipo === 'secao') { linhas += '<div class="cf-sec">' + esc(rotuloSecao(l.secao)) + '</div>'; return; }
          if (l.tipo !== 'letra') return;
          linhas += '<div class="cf-linha">' + l.partes.map(function (p) {
            return '<span class="cf-par"><span class="cf-ac">' + (p.cifra ? esc(p.cifra) : '') +
              '</span><span class="cf-tx">' + esc(p.texto || '') + '</span></span>';
          }).join('') + '</div>';
        });
      } else {
        linhas = '<p class="palco-sem">' + (it.tem_acervo === false
          ? 'Item do setlist sem cifra.'
          : 'Esta musica nao tem cifra guardada, ou o acervo dela nao e seu.') + '</p>';
      }

      tela.innerHTML =
        '<div class="palco-topo">' +
          '<div><b>' + esc(it.titulo) + '</b>' +
            '<span class="palco-tom">' + (it.tom_soando ? 'soa em ' + esc(it.tom_soando) : '') +
            (it.capotraste ? ' - capo ' + it.capotraste + ' (formas de ' + esc(it.tom_das_formas || '') + ')' : '') +
            '</span></div>' +
          '<div class="palco-nav">' +
            '<span class="palco-pos">' + (idx + 1) + '/' + d.itens.length + '</span>' +
            '<button class="btn sec peq" id="p-ant">Anterior</button>' +
            '<button class="btn sec peq" id="p-rolar">Rolar</button>' +
            '<input type="range" id="p-vel" min="10" max="120" value="30" title="velocidade da rolagem">' +
            '<button class="btn sec peq" id="p-prox">Proxima</button>' +
            '<button class="btn peq" id="p-sair">Sair</button>' +
          '</div>' +
        '</div>' +
        (offline ? '<div class="palco-offline">Sem internet: mostrando a copia guardada neste aparelho, de ' +
          esc((d.gerado_em || '').slice(0, 16).replace('T', ' ')) + '.</div>' : '') +
        (it.nota_palco ? '<div class="palco-nota">' + esc(it.nota_palco) + '</div>' : '') +
        '<div class="palco-corpo">' + linhas + '</div>';

      tela.querySelector('#p-ant').onclick = function () { pular(-1); };
      tela.querySelector('#p-prox').onclick = function () { pular(1); };
      tela.querySelector('#p-rolar').onclick = alternarRolagem;
      tela.querySelector('#p-sair').onclick = sair;
      atualizarBotaoRolagem();
    }
    pintar();
  }

  window.MusiqueBiblioteca = {
    verBiblioteca: verBiblioteca, verRepertorios: verRepertorios,
    abrirObra: abrirObra, abrirPalco: abrirPalco,
  };
})();
`;

function registrar(app) {
  app.get('/music/biblioteca.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .send(JS);
  });
}

module.exports = { registrar, JS };
