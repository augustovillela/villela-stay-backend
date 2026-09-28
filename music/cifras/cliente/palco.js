// =====================================================================
// Musique Cifras — CLIENTE · SETLISTS, MODO PALCO, OFFLINE e AO VIVO.
//
// A tela que decide o produto é o PALCO: em pé, pouca luz, mãos
// ocupadas, internet ruim. Por isso:
//   · o palco toca SEMPRE do pacote guardado no aparelho (IndexedDB),
//     conferido por hash — a rede só atualiza, nunca é pré-requisito;
//   · wake lock, tela cheia, trava de toque, parada de emergência;
//   · pedal Bluetooth (ele manda PageDown/setas), teclado, MIDI e swipe;
//   · a posição de cada música é lembrada, e girar o celular não perde
//     o ponto (fração do conteúdo, não pixel);
//   · na sessão ao vivo, cair a conexão NÃO trava a cifra: o integrante
//     continua tocando do pacote e a tela diz que está sem o maestro.
// =====================================================================
(function (global) {
  'use strict';
  var C = global.MusiqueCifras;
  var M = C.M, el = C.el, R = C.R, api = C.api;
  var D = M.documento;
  var T = C.telas;
  var STATUS = [['rascunho', 'Rascunho'], ['em_revisao', 'Em revisão'], ['aprovada', 'Aprovada'], ['em_ensaio', 'Em ensaio'], ['pronta', 'Pronta'], ['arquivada', 'Arquivada']];

  // =================================================================
  // PACOTES OFFLINE
  // =================================================================
  /** Baixa o pacote do setlist e guarda no aparelho. */
  C.baixarPacote = function (repId) {
    return api('GET', '/setlists/' + repId + '/pacote').then(function (p) {
      return C.guardar('pacotes', repId, { hash: p.hash, bytes: p.bytes, pacote: p.pacote, baixado_em: Date.now() }).then(function () { return p; });
    });
  };
  /** Pacote guardado; se houver rede, confere se ainda é o atual. */
  C.pacoteLocal = function (repId) { return C.ler('pacotes', repId); };
  C.conferirPacote = function (repId) {
    return C.pacoteLocal(repId).then(function (loc) {
      if (!loc) return { valido: false, sem_pacote: true };
      return api('POST', '/setlists/' + repId + '/pacote/conferir', { hash: loc.hash }).catch(function () { return { valido: null, offline: true }; });
    });
  };
  /** Procura uma cifra nos pacotes guardados (para abrir sem rede). */
  C.buscarNosPacotes = function (cifraId) {
    return C.todos('pacotes').then(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        var m = (lista[i].valor.pacote.musicas || []).filter(function (x) { return x.cifra_id === cifraId; })[0];
        if (m) return m;
      }
      return null;
    }).catch(function () { return null; });
  };

  // =================================================================
  // SETLISTS
  // =================================================================
  T.setlists = function (arg, extra) {
    api('GET', '/setlists', null, { cache: 'setlists' }).then(function (r) {
      var c = C.limpar();
      c.appendChild(el('h2', { txt: 'Setlists e repertórios' }));
      if (r._offline) c.appendChild(el('div', { class: 'cf-offline', txt: 'Sem internet: lista guardada. Os setlists baixados abrem no palco normalmente.' }));
      c.appendChild(el('div', { class: 'cf-barra' }, [C.botao('+ Novo setlist', function () { novoSetlist(extra); })]));
      var modelos = r.setlists.filter(function (x) { return x.modelo; });
      var ativos = r.setlists.filter(function (x) { return !x.modelo && x.status !== 'arquivada'; });
      var arq = r.setlists.filter(function (x) { return !x.modelo && x.status === 'arquivada'; });
      if (!r.setlists.length) c.appendChild(C.estadoVazio('Nenhum setlist ainda', 'Monte o repertório do próximo show, culto ou ensaio.', C.botao('Criar o primeiro', function () { novoSetlist(); })));
      [[ativos, 'Próximos e em andamento'], [modelos, 'Modelos'], [arq, 'Arquivados']].forEach(function (g) {
        if (!g[0].length) return;
        c.appendChild(el('h3', { txt: g[1] }));
        var grid = el('div', { class: 'cf-grid' });
        g[0].forEach(function (x) {
          var b = el('button', { class: 'cf-cartao', type: 'button' }, [el('b', { txt: x.nome }), el('span', { class: 'm', txt: [C.data(x.data), x.local, x.itens + ' itens', x.duracao ? Math.round(x.duracao.total_s / 60) + ' min' : '', (STATUS.filter(function (s) { return s[0] === x.status; })[0] || ['', ''])[1]].filter(Boolean).join(' · ') })]);
          b.onclick = function () { C.ir('setlist', x.id); };
          grid.appendChild(b);
        });
        c.appendChild(grid);
      });
      if (extra && extra.novo) novoSetlist(extra);
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, T.setlists)); });
  };

  function novoSetlist(extra) {
    extra = extra || {};
    var bandas = (C.estado.inicio && C.estado.inicio.bandas) || [];
    var f = el('div', { class: 'cf-form' }), cmp = {};
    [['nome', 'Nome', extra.novo || ''], ['data', 'Data', ''], ['local', 'Local', ''], ['evento', 'Evento', '']].forEach(function (k) {
      var i = el('input', { type: k[0] === 'data' ? 'date' : 'text', value: k[2] }); cmp[k[0]] = i; f.appendChild(el('label', {}, [el('span', { txt: k[1] }), i]));
    });
    var dur = el('input', { type: 'number', min: '0', placeholder: 'min' }); f.appendChild(el('label', {}, [el('span', { txt: 'Duração planejada (min)' }), dur]));
    var banda = C.sel([['', 'Pessoal']].concat(bandas.map(function (b) { return [b.id, b.nome]; })), '', function () {}, 'Banda');
    f.appendChild(el('label', {}, [el('span', { txt: 'Da banda' }), banda]));
    C.modal('Novo setlist', f, [{ txt: 'Cancelar' }, { txt: 'Criar', fn: function () {
      api('POST', '/setlists', { nome: cmp.nome.value, data: cmp.data.value, local: cmp.local.value, evento: cmp.evento.value, banda_id: banda.value,
        duracao_planejada_s: (Number(dur.value) || 0) * 60 }).then(function (r) {
        var ids = r.repertorio.id;
        var musicas = extra.musicas || [];
        return musicas.reduce(function (p, t) {
          return p.then(function () { return api('GET', '/musicas?limite=1&q=' + encodeURIComponent(t)).then(function (m) { var x = m.itens[0]; if (x && x.cifra_principal) return api('POST', '/setlists/' + ids + '/itens', { cifra_id: x.cifra_principal }); }); });
        }, Promise.resolve()).then(function () { C.ir('setlist', ids); });
      }).catch(C.erro);
    } }]);
  }

  T.setlist = function (id) {
    api('GET', '/setlists/' + id, null, { cache: 'setlist:' + id }).then(function (s) {
      var c = C.limpar();
      var rep = s.repertorio;
      c.appendChild(C.botao('← Setlists', function () { C.ir('setlists'); }, 'sec peq'));
      c.appendChild(el('h2', { txt: rep.nome }));
      c.appendChild(el('p', { class: 'sub', txt: [C.data(rep.data), rep.local, rep.evento, s.banda ? 'banda: ' + s.banda.nome : 'pessoal', 'total ' + Math.round((s.duracao.total_com_intervalos_s || 0) / 60) + ' min' + (s.duracao.confiavel ? '' : ' (tem estimativa)'),
        s.duracao.planejada_s ? 'planejado ' + Math.round(s.duracao.planejada_s / 60) + ' min' : ''].filter(Boolean).join(' · ') }));
      if (s._offline) c.appendChild(el('div', { class: 'cf-offline', txt: 'Sem internet: cópia guardada. Para editar, conecte-se; para tocar, use o palco.' }));
      // ações
      var acoes = el('div', { class: 'cf-barra' });
      acoes.appendChild(C.botao('▶ Palco', function () { abrirPalcoDoSetlist(id, 0); }));
      acoes.appendChild(C.botao('Baixar para offline', function () { C.baixarPacote(id).then(function (p) { C.aviso('Pacote guardado: ' + p.pacote.musicas.length + ' itens, ' + Math.round(p.bytes / 1024) + ' KB.'); T.setlist(id); }).catch(C.erro); }, 'sec'));
      acoes.appendChild(C.botao('Verificar pacote', function () {
        C.conferirPacote(id).then(function (v) {
          C.modal('Pacote offline', v.sem_pacote ? 'Este aparelho ainda não tem o pacote. Baixe antes do show.' : v.offline ? 'Sem internet para conferir. O pacote guardado abre normalmente.'
            : v.valido ? 'Tudo certo: o pacote deste aparelho é o atual.' : 'Desatualizado: ' + (v.setlist_mudou ? 'o setlist mudou' : '') + (v.desatualizados && v.desatualizados.length ? ' · cifras alteradas: ' + v.desatualizados.join(', ') : '') + '. Baixe de novo.');
        });
      }, 'sec'));
      if (s.pode_conduzir && C.estado.flags['cifras.vivo'] !== false) acoes.appendChild(C.botao('Iniciar sessão ao vivo', function () { api('POST', '/vivo', { repertorio_id: id }).then(function (x) { C.ir('maestro', x.sessao.id); }).catch(C.erro); }, 'sec'));
      acoes.appendChild(C.sel([['', 'Mais…'], ['pdf', 'Exportar PDF'], ['txt', 'Exportar TXT'], ['json', 'Exportar pacote (JSON)'], ['link', 'Link e QR Code'], ['duplicar', 'Duplicar'], ['modelo', rep.modelo ? 'Deixar de ser modelo' : 'Usar como modelo'], ['historico', 'Histórico'], ['excluir', 'Excluir']], '', function (v) {
        if (v === 'pdf' || v === 'txt' || v === 'json') location.href = '/music/api/cifras/setlists/' + id + '/exportar/' + v + (v === 'pdf' ? '?diagramas=1' : '');
        else if (v === 'link') api('POST', '/links', { alvo_tipo: 'setlist', alvo_id: id, dias: 30 }).then(function (r) { var b = el('div'); C.mostrarLink(b, location.origin + r.url); C.modal('Link do setlist', b); }).catch(C.erro);
        else if (v === 'duplicar') api('POST', '/setlists/' + id + '/duplicar', {}).then(function (r) { C.ir('setlist', r.repertorio.id); }).catch(C.erro);
        else if (v === 'modelo') api('PATCH', '/setlists/' + id, { modelo: !rep.modelo }).then(function () { T.setlist(id); }).catch(C.erro);
        else if (v === 'historico') api('GET', '/setlists/' + id + '/historico').then(function (h) {
          var l = el('div', { class: 'cf-lista' });
          h.historico.forEach(function (x) { l.appendChild(el('div', { class: 'cf-linha-item', txt: new Date(x.criado_em).toLocaleString('pt-BR') + ' · ' + (x.autor_nome || '') + ' · ' + x.acao })); });
          C.modal('Histórico do setlist', l);
        });
        else if (v === 'excluir') C.confirmar('Excluir o setlist?', 'As músicas continuam no acervo.', 'Excluir').then(function (ok) { if (ok) api('DELETE', '/setlists/' + id).then(function () { C.ir('setlists'); }).catch(C.erro); });
      }, 'Mais ações do setlist'));
      c.appendChild(acoes);
      if (s.pacote) c.appendChild(el('p', { class: 'peq', txt: 'Último download (neste login): ' + new Date(s.pacote.gerado_em).toLocaleString('pt-BR') + ' · ' + s.pacote.itens + ' itens.' }));
      // alertas
      if (s.alertas.length) {
        var ul = el('ul', { class: 'cf-alertas alerta' });
        s.alertas.forEach(function (a) { ul.appendChild(el('li', { txt: (a.nivel === 'erro' ? '⛔ ' : a.nivel === 'aviso' ? '⚠️ ' : 'ℹ️ ') + a.texto })); });
        c.appendChild(ul);
      }
      // dados
      if (s.pode_editar) c.appendChild(formDados(s));
      // itens por bloco
      var lista = el('div', { 'aria-label': 'Músicas do setlist' });
      c.appendChild(lista);
      pintarItens(lista, s);
      if (s.pode_editar) {
        c.appendChild(el('div', { class: 'cf-barra' }, [C.botao('+ Música', function () { adicionarMusica(s); }), C.botao('+ Intervalo', function () {
          api('POST', '/setlists/' + id + '/itens', { intervalo: true, titulo_livre: 'Intervalo', duracao_s: 900 }).then(function () { T.setlist(id); }).catch(C.erro);
        }, 'sec'), C.botao('+ Bloco', function () {
          var n = el('input', { type: 'text', placeholder: 'Ex.: Cerimônia, 1º ato' });
          var tp = C.sel([['ato', 'Ato / bloco'], ['bis', 'Bis'], ['intervalo', 'Intervalo']], 'ato', function () {}, 'Tipo');
          C.modal('Novo bloco', el('div', {}, [n, tp]), [{ txt: 'Cancelar' }, { txt: 'Criar', fn: function () { api('POST', '/setlists/' + id + '/blocos', { nome: n.value, tipo: tp.value }).then(function () { T.setlist(id); }).catch(C.erro); } }]);
        }, 'sec')]));
      }
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, function () { T.setlist(id); })); });
  };

  function formDados(s) {
    var rep = s.repertorio;
    var det = el('details', { class: 'cf-painel' }, [el('summary', { txt: 'Dados do setlist' })]);
    var f = el('div', { class: 'cf-form' }), cmp = {};
    [['nome', 'Nome', 'text'], ['data', 'Data', 'date'], ['local', 'Local', 'text'], ['evento', 'Evento', 'text']].forEach(function (k) {
      var i = el('input', { type: k[2], value: rep[k[0]] || '' }); cmp[k[0]] = i; f.appendChild(el('label', {}, [el('span', { txt: k[1] }), i]));
    });
    var dur = el('input', { type: 'number', min: '0', value: rep.duracao_planejada_s ? Math.round(rep.duracao_planejada_s / 60) : '' });
    f.appendChild(el('label', {}, [el('span', { txt: 'Duração planejada (min)' }), dur]));
    var st = C.sel(STATUS, rep.status, function () {}, 'Status');
    f.appendChild(el('label', {}, [el('span', { txt: 'Status' }), st]));
    det.appendChild(f);
    det.appendChild(C.botao('Salvar dados', function () {
      api('PATCH', '/setlists/' + rep.id, { nome: cmp.nome.value, data: cmp.data.value, local: cmp.local.value, evento: cmp.evento.value,
        duracao_planejada_s: (Number(dur.value) || 0) * 60, status: st.value, versao: rep.versao }).then(function () { T.setlist(rep.id); })
        .catch(function (e) { if (e.status === 409) C.aviso('Outra pessoa mudou o setlist. Recarregando.'); else C.erro(e); if (e.status === 409) T.setlist(rep.id); });
    }, 'sec'));
    return det;
  }

  function pintarItens(lista, s) {
    lista.innerHTML = '';
    var arrastado = null;
    var grupos = [{ id: '', nome: 'Sem bloco', tipo: 'ato' }].concat(s.blocos);
    var n = 0;
    grupos.forEach(function (b) {
      var itens = s.itens.filter(function (it) { return (it.bloco_id || '') === b.id; });
      if (!b.id && !itens.length && s.blocos.length) return;
      var cab = el('div', { class: 'cf-bloco', 'data-bloco': b.id }, [el('span', { txt: b.nome + (b.tipo === 'bis' ? ' (bis)' : '') }),
        b.id && s.pode_editar ? C.bt('×', function () { api('DELETE', '/blocos/' + b.id).then(function () { T.setlist(s.repertorio.id); }); }, 'Remover bloco (as músicas ficam)') : null]);
      cab.ondragover = function (e) { e.preventDefault(); };
      cab.ondrop = function (e) { e.preventDefault(); if (arrastado) soltar(arrastado, null, b.id); };
      lista.appendChild(cab);
      itens.forEach(function (it) {
        n++;
        var linha = el('div', { class: 'cf-set-item', draggable: s.pode_editar ? 'true' : 'false', 'data-id': it.id });
        linha.appendChild(el('span', { class: 'alca', 'aria-hidden': 'true', txt: s.pode_editar ? '⋮⋮' : '' }));
        linha.appendChild(el('span', { class: 'num', txt: it.intervalo ? '—' : String(n) }));
        var alertasItem = s.alertas.filter(function (a) { return a.item === it.id; });
        linha.appendChild(el('div', { class: 'cresce', style: 'flex:1;min-width:0' }, [el('b', { txt: it.titulo + (it.bis ? ' (bis)' : '') + (it.medley ? ' [medley ' + it.medley + ']' : '') }),
          el('span', { class: 'm', style: 'display:block;font-size:13px;color:var(--suave)', txt: it.intervalo ? 'intervalo · ' + C.minutos(it.duracao_s) : [it.tom_execucao ? 'tom ' + it.tom_execucao + (it.tom_confirmado ? ' ✓' : ' (a confirmar)') : '', it.capotraste ? 'capo ' + it.capotraste : '', it.bpm ? it.bpm + ' bpm' : '', it.vocalista, it.duracao_s ? C.minutos(it.duracao_s) + (it.duracao_estimada ? '~' : '') : '', it.arranjo ? 'arranjo ' + it.arranjo.nome + (it.arranjo.status !== 'aprovado' ? ' (não aprovado)' : '') : ''].filter(Boolean).join(' · ') })]));
        if (alertasItem.length) linha.appendChild(el('span', { title: alertasItem.map(function (a) { return a.texto; }).join('\n'), txt: '⚠️' }));
        if (s.pode_editar) {
          linha.appendChild(C.bt('↑', function () { moverRelativo(it, -1); }, 'Subir'));
          linha.appendChild(C.bt('↓', function () { moverRelativo(it, 1); }, 'Descer'));
          linha.appendChild(C.bt('✎', function () { editarItem(s, it); }, 'Editar item'));
        }
        if (it.cifra) linha.appendChild(C.botao('Abrir', function () { C.ir('cifra', it.cifra.id, { tom: it.tom_execucao, arranjo: it.arranjo ? it.arranjo.id : '' }); }, 'sec peq'));
        linha.ondragstart = function () { arrastado = it; linha.classList.add('arrastando'); };
        linha.ondragend = function () { linha.classList.remove('arrastando'); };
        linha.ondragover = function (e) { e.preventDefault(); linha.classList.add('sobre'); };
        linha.ondragleave = function () { linha.classList.remove('sobre'); };
        linha.ondrop = function (e) { e.preventDefault(); linha.classList.remove('sobre'); if (arrastado && arrastado.id !== it.id) soltar(arrastado, it, it.bloco_id || ''); };
        lista.appendChild(linha);
      });
    });
    function ordemAtual() { return s.itens.map(function (x) { return { id: x.id, bloco_id: x.bloco_id || '' }; }); }
    function enviar(ordem) { api('PUT', '/setlists/' + s.repertorio.id + '/ordem', { ordem: ordem }).then(function () { T.setlist(s.repertorio.id); }).catch(C.erro); }
    function soltar(mov, antesDe, bloco) {
      var ordem = ordemAtual().filter(function (x) { return x.id !== mov.id; });
      var pos = antesDe ? ordem.findIndex(function (x) { return x.id === antesDe.id; }) : ordem.length;
      ordem.splice(pos < 0 ? ordem.length : pos, 0, { id: mov.id, bloco_id: bloco });
      enviar(ordem);
    }
    function moverRelativo(it, delta) {
      var ordem = ordemAtual();
      var i = ordem.findIndex(function (x) { return x.id === it.id; });
      var j = i + delta;
      if (j < 0 || j >= ordem.length) return;
      var x = ordem.splice(i, 1)[0];
      x.bloco_id = ordem[Math.min(j, ordem.length - 1)] ? ordem[Math.min(j, ordem.length - 1)].bloco_id : x.bloco_id;
      ordem.splice(j, 0, x);
      enviar(ordem);
    }
  }

  function editarItem(s, it) {
    var f = el('div', { class: 'cf-form' }), cmp = {};
    [['tom_execucao', 'Tom do show', it.tom_execucao], ['capotraste', 'Capo', it.capotraste], ['bpm', 'BPM', it.bpm || ''], ['contagem', 'Contagem (ex.: 1-2-3-4)', it.contagem],
      ['vocalista', 'Vocalista', it.vocalista], ['medley', 'Medley (mesmo nome junta)', it.medley], ['duracao_s', 'Duração (s)', it.duracao_s || '']].forEach(function (k) {
      var i = el('input', { type: 'text', value: k[2] === undefined || k[2] === null ? '' : k[2] }); cmp[k[0]] = i; f.appendChild(el('label', {}, [el('span', { txt: k[1] }), i]));
    });
    var bloco = C.sel([['', 'Sem bloco']].concat(s.blocos.map(function (b) { return [b.id, b.nome]; })), it.bloco_id || '', function () {}, 'Bloco');
    f.appendChild(el('label', {}, [el('span', { txt: 'Bloco' }), bloco]));
    var bis = el('input', { type: 'checkbox' }); bis.checked = !!it.bis;
    var conf = el('input', { type: 'checkbox' }); conf.checked = !!it.tom_confirmado;
    var nota = el('textarea', { rows: '2', placeholder: 'Nota de palco (aparece em destaque)' }); nota.value = it.nota_palco || '';
    var box = el('div', {}, [f, el('label', { class: 'check' }, [bis, el('span', { txt: 'É bis' })]), el('label', { class: 'check' }, [conf, el('span', { txt: 'Tom confirmado com a banda' })]), nota]);
    C.modal('Item: ' + it.titulo, box, [{ txt: 'Remover do setlist', fn: function () { api('DELETE', '/itens/' + it.id).then(function () { T.setlist(s.repertorio.id); }).catch(C.erro); } },
      { txt: 'Cancelar' }, { txt: 'Salvar', fn: function () {
        api('PATCH', '/itens/' + it.id, { tom_execucao: cmp.tom_execucao.value, capotraste: Number(cmp.capotraste.value) || 0, bpm: Number(cmp.bpm.value) || 0, contagem: cmp.contagem.value,
          vocalista: cmp.vocalista.value, medley: cmp.medley.value, duracao_s: Number(cmp.duracao_s.value) || 0, bloco_id: bloco.value, bis: bis.checked, tom_confirmado: conf.checked, nota_palco: nota.value })
          .then(function () { T.setlist(s.repertorio.id); }).catch(C.erro);
      } }]);
  }

  function adicionarMusica(s) {
    var q = el('input', { type: 'search', placeholder: 'Buscar no acervo' });
    var res = el('div', { class: 'cf-lista', style: 'max-height:50vh;overflow:auto' });
    var buscar = C.debounce(function () {
      api('GET', '/musicas?limite=20&q=' + encodeURIComponent(q.value) + (s.repertorio.banda_id ? '&banda=' + s.repertorio.banda_id : '')).then(function (r) {
        res.innerHTML = '';
        if (!r.itens.length) res.appendChild(el('p', { class: 'vazio', txt: s.repertorio.banda_id ? 'Nada na biblioteca da banda. Compartilhe a música com a banda primeiro.' : 'Nada encontrado.' }));
        r.itens.forEach(function (x) {
          res.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: x.titulo }), el('span', { class: 'm', txt: [x.artista, x.tom].filter(Boolean).join(' · ') })]),
            x.cifra_principal ? C.botao('Adicionar', function () {
              api('POST', '/setlists/' + s.repertorio.id + '/itens', { cifra_id: x.cifra_principal, tom_execucao: x.tom }).then(function () { C.aviso('"' + x.titulo + '" adicionada.'); }).catch(C.erro);
            }, 'peq') : el('span', { class: 'm', txt: 'sem cifra' })]));
        });
      }).catch(function (e) { res.innerHTML = ''; res.appendChild(C.estadoErro(e)); });
    }, 250);
    q.oninput = buscar; buscar();
    C.modal('Adicionar músicas', el('div', {}, [q, res]), [{ txt: 'Concluir', fn: function () { T.setlist(s.repertorio.id); } }]);
  }

  function abrirPalcoDoSetlist(id, indice, sessao) {
    var usar = function (loc, offline) { C.abrirPalco(loc.pacote, { indice: indice, offline: offline, baixado_em: loc.baixado_em, hash: loc.hash, sessao: sessao }); };
    if (!navigator.onLine) return C.pacoteLocal(id).then(function (loc) { if (loc) usar(loc, true); else C.aviso('Sem internet e sem pacote neste aparelho.'); });
    C.baixarPacote(id).then(function () { return C.pacoteLocal(id); }).then(function (loc) { usar(loc, false); })
      .catch(function () { C.pacoteLocal(id).then(function (loc) { if (loc) usar(loc, true); else C.aviso('Não consegui baixar o setlist.'); }); });
  }
  C.abrirPalcoDoSetlist = abrirPalcoDoSetlist;

  /** Palco de UMA música (a que está aberta na visualização). */
  C.palcoUmaMusica = function (estado) {
    var r = estado.r;
    var pacote = { setlist: { id: 'avulsa', nome: 'Música avulsa' }, musicas: [{ item_id: 'avulsa', cifra_id: estado.d.cifra.id, titulo: (estado.d.musica && estado.d.musica.titulo) || '',
      tom_soando: r.tom_soando, tom_formas: r.tom_formas, capo: r.capo, bpm: Number(estado.docCru ? estado.docCru.meta.bpm : 0) || 0, documento: r.doc,
      exibicao: { fonte: Math.max(24, estado.v.fonte + 6), tema: 'escuro', modo: estado.v.modo, familia: estado.v.familia, colunas: estado.v.colunas },
      rolagem: { modo: estado.v.rolagem.modo, velocidade: estado.v.rolagem.velocidade } }] };
    C.abrirPalco(pacote, { indice: 0 });
  };

  // =================================================================
  // MODO PALCO
  // =================================================================
  C.abrirPalco = function (pacote, op) {
    op = op || {};
    var idx = Math.max(0, Math.min((pacote.musicas || []).length - 1, op.indice || 0));
    var musicas = pacote.musicas || [];
    if (!musicas.length) return C.aviso('O setlist está vazio.');
    var prefs = C.estado.prefs || {};
    var ex0 = Object.assign({ fonte: 26, tema: 'escuro', modo: 'letra_cifra', colunas: 1, familia: 'mono', brilho: 100 }, prefs.exibicao || {});
    var st = { tema: ex0.tema === 'claro' ? 'escuro' : ex0.tema, fonte: Math.max(ex0.fonte, 22), colunas: ex0.colunas || 1, modo: ex0.modo, familia: ex0.familia, brilho: 100,
      travado: false, inicioMusica: Date.now(), seguirMaestro: true, tomVivo: {} };
    var tela = el('div', { class: 'cf-palco', role: 'dialog', 'aria-label': 'Modo palco' });
    var topo = el('div', { class: 'cf-palco-topo' });
    var aviso = el('div', { class: 'cf-palco-aviso', style: 'display:none', role: 'status' });
    var nota = el('div', { class: 'cf-palco-aviso', style: 'display:none;background:#152238;color:#CFE0FF' });
    var corpo = el('div', { class: 'cf-palco-corpo', tabindex: '0' });
    var brilho = el('div', { class: 'cf-palco-brilho', style: 'opacity:0' });
    var parar = el('button', { class: 'cf-parar', type: 'button', txt: 'PARAR', 'aria-label': 'Parar a rolagem', style: 'display:none' });
    tela.appendChild(topo); tela.appendChild(aviso); tela.appendChild(nota); tela.appendChild(corpo); tela.appendChild(brilho); tela.appendChild(parar);
    document.body.appendChild(tela);
    document.body.classList.add('cf-em-palco');
    var rolagem = new C.Rolagem(corpo, { velocidade: 30, aoMudar: function (e) { parar.style.display = rolagem.ativa() ? '' : 'none'; if (e === 'fim' && op.autoAvancar) proxima(); pintarTopo(); } });
    parar.onclick = function () { rolagem.parar(); met.desligar(); };
    var met = new C.Metronomo();

    // wake lock: celular que apaga no meio do refrão é pior que papel.
    var trava = null;
    function pedirWakeLock() { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { trava = w; }).catch(function () {}); }
    pedirWakeLock();
    var aoVisivel = function () { if (!document.hidden) pedirWakeLock(); };
    document.addEventListener('visibilitychange', aoVisivel);
    try { if (tela.requestFullscreen && op.telaCheia !== false) tela.requestFullscreen().catch(function () {}); } catch (_) { /* sem tela cheia */ }

    if (op.offline) { aviso.style.display = ''; aviso.textContent = 'Sem internet: pacote guardado em ' + new Date(op.baixado_em).toLocaleString('pt-BR') + '.'; }

    function doc() {
      var m = musicas[idx];
      if (!m.documento) return null;
      var semi = st.tomVivo[m.item_id] || 0;
      return semi ? D.transpor(m.documento, semi) : m.documento;
    }
    function chavePos() { return (pacote.setlist.id || 'x') + ':' + musicas[idx].item_id; }
    function salvarPosicao() { try { C.guardar('posicoes', chavePos(), rolagem.fracao()); } catch (_) { /* sem IDB */ } }

    function pintarTopo() {
      topo.innerHTML = '';
      var m = musicas[idx], prox = musicas[idx + 1];
      var decorrido = Math.round((Date.now() - st.inicioMusica) / 1000);
      topo.appendChild(el('div', { class: 'tit' }, [el('span', { txt: (idx + 1) + '/' + musicas.length + '  ' + m.titulo }),
        el('div', { class: 'prox', txt: [m.tom_soando ? 'tom ' + m.tom_soando + (st.tomVivo[m.item_id] ? ' → ' + M.nota.escreverTom({ pc: (M.nota.lerTom(m.tom_soando) || { pc: 0 }).pc + st.tomVivo[m.item_id], menor: /m$/.test(m.tom_soando) }) : '') : '',
          m.capo ? 'capo ' + m.capo + ' (formas de ' + m.tom_formas + ')' : '', m.bpm ? m.bpm + ' bpm' : '', m.vocalista ? 'voz: ' + m.vocalista : '',
          C.minutos(decorrido) + (m.duracao_s ? ' / ' + C.minutos(m.duracao_s) : ''), prox ? 'próxima: ' + prox.titulo : 'última'].filter(Boolean).join(' · ') })]));
      if (op.sessao) topo.appendChild(el('span', { class: 'cf-conexao ' + (op.sessao.status || ''), txt: '' }, [el('i'), el('span', { txt: op.sessao.rotulo || '' })]));
      var b = function (t, fn, rot) { var x = el('button', { type: 'button', txt: t, 'aria-label': rot || t, title: rot || t }); x.onclick = fn; topo.appendChild(x); };
      b('◀', anterior, 'Música anterior'); b(rolagem.ativa() ? '⏸' : '▶', alternarRolagem, 'Rolar / pausar (espaço)'); b('▶▶', proxima, 'Próxima música');
      b('−', function () { rolagem.ajustar(-5); }, 'Rolagem mais lenta'); b('+', function () { rolagem.ajustar(5); }, 'Rolagem mais rápida');
      b('A−', function () { st.fonte = Math.max(14, st.fonte - 2); pintar(true); }, 'Fonte menor'); b('A+', function () { st.fonte = Math.min(72, st.fonte + 2); pintar(true); }, 'Fonte maior');
      b('◐', function () { var t = ['escuro', 'preto', 'sepia', 'claro']; st.tema = t[(t.indexOf(st.tema) + 1) % t.length]; pintar(true); }, 'Tema');
      b('☰', function () { var md = ['letra_cifra', 'letra', 'acordes', 'mapa']; st.modo = md[(md.indexOf(st.modo) + 1) % md.length]; pintar(true); }, 'Letra / cifra / acordes / mapa');
      b('▥', function () { st.colunas = st.colunas % 3 + 1; pintar(true); }, 'Colunas');
      b('☀', function () { st.brilho = st.brilho <= 30 ? 100 : st.brilho - 20; brilho.style.opacity = String((100 - st.brilho) / 100 * 0.85); }, 'Brilho');
      b('⏱', function () { met.bpm = m.bpm || 90; met.contar(4, function () { rolagem.iniciar(); }, contagemVisual); }, 'Contar 4 e rolar');
      b('🔒', travar, 'Travar toques');
      if (navigator.requestMIDIAccess) b('MIDI', conectarMidi, 'Pedal / controlador MIDI');
      b('✕', fechar, 'Sair do palco (Esc)');
    }

    function pintar(manterPosicao) {
      var f = manterPosicao ? rolagem.fracao() : null;
      tela.className = 'cf-palco t-' + st.tema;
      corpo.innerHTML = '';
      var m = musicas[idx];
      nota.style.display = m.nota_palco || m.notas_banda ? '' : 'none';
      nota.textContent = [m.nota_palco, m.notas_banda].filter(Boolean).join('  ·  ');
      var d = doc();
      if (!d) corpo.appendChild(el('p', { style: 'font:600 22px Inter,sans-serif;opacity:.8', txt: m.intervalo ? 'Intervalo' + (m.duracao_s ? ' · ' + C.minutos(m.duracao_s) : '') : 'Sem cifra para este item.' }));
      else corpo.appendChild(R.cifra(d, { modo: st.modo, familia: st.familia, fonte: st.fonte, colunas: st.colunas, tema: st.tema, espacamento: 1.4, secaoAtual: st.secaoAtual }));
      rolagem.velocidade = (m.rolagem && m.rolagem.velocidade) || rolagem.velocidade;
      rolagem.duracao_s = m.rolagem && (m.rolagem.modo === 'duracao' || m.rolagem.modo === 'bpm') ? (m.duracao_s || D.duracaoEstimada(m.documento || { secoes: [], meta: {} }) || 0) : 0;
      pintarTopo();
      if (f !== null) setTimeout(function () { rolagem.irPara(f); }, 0);
    }

    function irPara(i, deOndeVeio) {
      if (i < 0 || i >= musicas.length) return;
      salvarPosicao();
      rolagem.parar();
      idx = i; st.inicioMusica = Date.now(); st.secaoAtual = '';
      pintar(false);
      C.ler('posicoes', chavePos()).then(function (fr) { if (fr && !deOndeVeio) rolagem.irPara(fr); else corpo.scrollTop = 0; }).catch(function () { corpo.scrollTop = 0; });
      if (op.aoMudarMusica && deOndeVeio !== 'maestro') op.aoMudarMusica(idx);
    }
    function proxima() { irPara(idx + 1); }
    function anterior() { irPara(idx - 1); }
    function alternarRolagem() { rolagem.alternar(); pintarTopo(); }
    function contagemVisual(n) {
      var ov = tela.querySelector('.cf-palco-conta');
      if (!n) { if (ov) ov.remove(); return; }
      if (!ov) { ov = el('div', { class: 'cf-palco-conta', 'aria-live': 'assertive' }); tela.appendChild(ov); }
      ov.textContent = String(n);
    }

    function travar() {
      st.travado = true;
      var cap = el('div', { class: 'cf-palco-trava' });
      var bt = el('button', { type: 'button', txt: 'Segure para destravar' });
      var t = 0;
      bt.addEventListener('pointerdown', function () { t = setTimeout(function () { cap.remove(); st.travado = false; }, 1200); });
      ['pointerup', 'pointerleave'].forEach(function (ev) { bt.addEventListener(ev, function () { clearTimeout(t); }); });
      cap.appendChild(bt);
      cap.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
      tela.appendChild(cap);
    }

    // Pedal (PageDown/setas), teclado e números
    function tecla(e) {
      if (st.travado && e.key !== 'Escape') return;
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) return;
      var k = e.key;
      if (k === 'Escape') { fechar(); return; }
      if (k === ' ' ) { e.preventDefault(); alternarRolagem(); return; }
      if (k === 'PageDown' || k === 'ArrowDown') { e.preventDefault(); rolagem.interromper(); if (corpo.scrollTop >= corpo.scrollHeight - corpo.clientHeight - 2) proxima(); else corpo.scrollTop += corpo.clientHeight * 0.85; return; }
      if (k === 'PageUp' || k === 'ArrowUp') { e.preventDefault(); rolagem.interromper(); if (corpo.scrollTop <= 1) anterior(); else corpo.scrollTop -= corpo.clientHeight * 0.85; return; }
      if (k === 'ArrowRight' || k === 'n' || k === 'N') { e.preventDefault(); proxima(); return; }
      if (k === 'ArrowLeft' || k === 'p' || k === 'P') { e.preventDefault(); anterior(); return; }
      if (/^[1-9]$/.test(k)) { irPara(Number(k) - 1); return; }
      if (k === 's' || k === 'S') { rolagem.parar(); met.desligar(); }
    }
    document.addEventListener('keydown', tecla);

    // Swipe lateral troca de música; vertical é rolagem normal.
    var x0 = null, y0 = null;
    corpo.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    corpo.addEventListener('touchend', function (e) {
      if (x0 === null || st.travado) return;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) proxima(); else anterior(); }
      x0 = null;
    }, { passive: true });

    // MIDI: o primeiro controle apertado vira "próxima", o segundo "anterior".
    var midiMapa = [];
    function conectarMidi() {
      navigator.requestMIDIAccess().then(function (acc) {
        C.aviso('Aperte o controle para PRÓXIMA e depois o de ANTERIOR.');
        acc.inputs.forEach(function (inp) {
          inp.onmidimessage = function (ev) {
            var tipo = ev.data[0] & 0xf0, num = ev.data[1], val = ev.data[2];
            if (!((tipo === 0x90 && val > 0) || (tipo === 0xb0 && val > 63))) return;
            var chave = tipo + ':' + num;
            if (midiMapa.length < 2 && midiMapa.indexOf(chave) < 0) { midiMapa.push(chave); C.aviso(midiMapa.length === 1 ? 'Próxima: ok. Agora o de ANTERIOR.' : 'Pedal MIDI pronto.'); return; }
            if (chave === midiMapa[0]) proxima(); else if (chave === midiMapa[1]) anterior();
          };
        });
      }).catch(function () { C.aviso('MIDI indisponível neste navegador.'); });
    }

    // Girar/redimensionar mantém o ponto.
    var fracaoAntes = 0;
    var aoRedim = C.debounce(function () { rolagem.irPara(fracaoAntes); }, 120);
    var redim = function () { fracaoAntes = rolagem.fracao(); aoRedim(); };
    global.addEventListener('resize', redim);
    var relogio = setInterval(function () { if (!rolagem.ativa()) pintarTopo(); }, 5000);

    function fechar() {
      salvarPosicao();
      rolagem.parar(); met.desligar();
      clearInterval(relogio);
      document.removeEventListener('keydown', tecla);
      document.removeEventListener('visibilitychange', aoVisivel);
      global.removeEventListener('resize', redim);
      if (trava && trava.release) trava.release().catch(function () {});
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) { /* nada */ }
      document.body.classList.remove('cf-em-palco');
      tela.remove();
      if (op.aoFechar) op.aoFechar();
    }

    var api2 = {
      irPara: irPara, idx: function () { return idx; }, fechar: fechar, rolagem: rolagem, pintar: pintar,
      /** Aplica o estado do maestro (sessão ao vivo). */
      aplicarEstado: function (e, evento) {
        if (!e) return;
        if (e.tom && e.tom.item_id) { st.tomVivo[e.tom.item_id] = e.tom.semitons; }
        if (st.seguirMaestro) {
          var i = musicas.findIndex(function (m) { return m.item_id === e.item_id; });
          if (i >= 0 && i !== idx) irPara(i, 'maestro');
          if (e.secao_id !== st.secaoAtual) {
            st.secaoAtual = e.secao_id;
            pintar(true);
            var alvo = corpo.querySelector('.cf-secao[data-secao="' + e.secao_id + '"]');
            if (alvo) corpo.scrollTop = alvo.offsetTop - 60;
          } else if (evento && evento.tipo === 'tom_emergencia') pintar(true);
          if (e.rolagem) { if (e.rolagem.ativa && !rolagem.ativa()) { rolagem.velocidade = e.rolagem.velocidade || rolagem.velocidade; rolagem.iniciar(); } else if (!e.rolagem.ativa && rolagem.ativa()) rolagem.parar(); }
        }
        if (evento && evento.tipo === 'cue' && e.cue) {
          var cue = el('div', { class: 'cf-palco-cue', role: 'alert', txt: e.cue.texto });
          tela.appendChild(cue); setTimeout(function () { cue.remove(); }, 4500);
        }
        if (evento && evento.tipo === 'contagem' && e.contagem) { met.bpm = e.contagem.bpm; met.contar(e.contagem.tempos, null, contagemVisual); }
        if (e.pausado) { aviso.style.display = ''; aviso.textContent = 'PAUSA — aguarde o maestro'; } else if (!op.offline) aviso.style.display = 'none';
        pintarTopo();
      },
      seguir: function (sim) { st.seguirMaestro = sim; },
      conexao: function (status, rotulo) { if (op.sessao) { op.sessao.status = status; op.sessao.rotulo = rotulo; pintarTopo(); } },
    };
    pintar(false);
    C.ler('posicoes', chavePos()).then(function (fr) { if (fr) rolagem.irPara(fr); }).catch(function () {});
    corpo.focus();
    C.palcoAtual = api2;
    return api2;
  };

  // =================================================================
  // CENTRAL OFFLINE
  // =================================================================
  T.downloads = function () {
    var c = C.limpar();
    c.appendChild(el('h2', { txt: 'Offline: o que está neste aparelho' }));
    c.appendChild(el('p', { class: 'sub', txt: 'Setlist baixado abre no palco sem internet. Antes do show, confira: o pacote certo é o de hash igual ao do servidor.' }));
    var info = el('p', { class: 'peq' });
    c.appendChild(info);
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (e) { info.textContent = 'Espaço usado pelo app: ' + Math.round((e.usage || 0) / 1048576) + ' MB de ' + Math.round((e.quota || 0) / 1048576) + ' MB disponíveis.'; });
    }
    if (navigator.storage && navigator.storage.persist) {
      c.appendChild(C.botao('Proteger os dados offline (o navegador não apaga sozinho)', function () {
        navigator.storage.persist().then(function (ok) { C.aviso(ok ? 'Pronto: o navegador vai manter os pacotes.' : 'O navegador não concedeu. Instale o app para mais garantia.'); });
      }, 'sec peq'));
    }
    var lista = el('div', { class: 'cf-lista' });
    c.appendChild(el('h3', { txt: 'Setlists baixados' }));
    c.appendChild(lista);
    C.todos('pacotes').then(function (ps) {
      if (!ps.length) lista.appendChild(C.estadoVazio('Nenhum setlist baixado', 'Abra um setlist e toque em "Baixar para offline".'));
      ps.forEach(function (p) {
        var v = p.valor, st = el('span', { class: 'm', txt: '' });
        lista.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: v.pacote.setlist.nome }),
          el('span', { class: 'm', txt: v.pacote.musicas.length + ' itens · ' + Math.round(v.bytes / 1024) + ' KB · baixado ' + new Date(v.baixado_em).toLocaleString('pt-BR') + ' · hash ' + String(v.hash).slice(0, 10) }), st]),
        C.botao('Palco', function () { C.abrirPalco(v.pacote, { offline: !navigator.onLine, baixado_em: v.baixado_em }); }, 'peq'),
        C.botao('Conferir', function () { st.textContent = 'conferindo…'; C.conferirPacote(p.chave).then(function (r) { st.textContent = r.offline ? ' · sem internet para conferir' : r.valido ? ' · ✓ atual' : ' · ⚠️ desatualizado'; }); }, 'sec peq'),
        C.botao('Atualizar', function () { C.baixarPacote(p.chave).then(T.downloads).catch(C.erro); }, 'sec peq'),
        C.botao('Remover', function () { C.apagar('pacotes', p.chave).then(T.downloads); }, 'sec peq')]));
      });
    }).catch(function (e) { lista.appendChild(C.estadoErro(e)); });
    // fila
    c.appendChild(el('h3', { txt: 'Alterações esperando internet' }));
    var fila = el('div', { class: 'cf-lista' });
    c.appendChild(fila);
    C.todos('fila').then(function (it) {
      if (!it.length) fila.appendChild(el('p', { class: 'vazio', txt: 'Nada pendente.' }));
      it.forEach(function (x) {
        fila.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: x.valor.metodo + ' ' + x.valor.url.replace('/music/api/cifras', '') }),
          el('span', { class: 'm', txt: new Date(x.valor.em).toLocaleString('pt-BR') + (x.valor.erro ? ' · recusado: ' + x.valor.erro : '') })]),
        C.botao('Descartar', function () { C.confirmar('Descartar esta alteração?', 'Ela não será enviada.', 'Descartar').then(function (ok) { if (ok) C.apagar('fila', x.chave).then(T.downloads); }); }, 'sec peq')]));
      });
      if (it.length) fila.appendChild(C.botao('Enviar agora', function () { C.sincronizar().then(T.downloads); }, 'sec'));
    });
    // backup
    c.appendChild(el('h3', { txt: 'Cópia de segurança deste aparelho' }));
    var arq = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
    arq.onchange = function () {
      var f = arq.files[0]; if (!f) return;
      f.text().then(function (t) {
        var b = JSON.parse(t);
        if (b.formato !== 'musique.offline') throw new Error('Arquivo não é uma cópia do Musique.');
        return Promise.all((b.pacotes || []).map(function (p) { return C.guardar('pacotes', p.chave, p.valor); }).concat((b.fila || []).map(function (p) { return C.guardar('fila', p.chave, p.valor); })));
      }).then(function () { C.aviso('Cópia restaurada.'); T.downloads(); }).catch(C.erro);
    };
    c.appendChild(el('div', { class: 'linha' }, [C.botao('Baixar cópia (pacotes + pendências)', function () {
      Promise.all([C.todos('pacotes'), C.todos('fila')]).then(function (r) {
        var blob = new Blob([JSON.stringify({ formato: 'musique.offline', em: Date.now(), pacotes: r[0], fila: r[1] })], { type: 'application/json' });
        var a = el('a', { href: URL.createObjectURL(blob), download: 'musique-offline.json' }); document.body.appendChild(a); a.click(); a.remove();
      });
    }, 'sec'), C.botao('Restaurar cópia', function () { arq.click(); }, 'sec'), arq]));
  };

  // =================================================================
  // AO VIVO — lista, entrada, console do maestro e tela do integrante
  // =================================================================
  T.vivo = function () {
    api('GET', '/vivo').then(function (r) {
      var c = C.limpar();
      c.appendChild(el('h2', { txt: 'Sessão ao vivo (Modo Maestro)' }));
      c.appendChild(el('p', { class: 'sub', txt: 'O maestro conduz a banda: todos veem a mesma música e a mesma seção — cada um no seu instrumento, na sua fonte, no seu tom autorizado.' }));
      var cod = el('input', { type: 'text', placeholder: 'Código (ex.: K7Q2MX)', maxlength: '8', style: 'text-transform:uppercase;max-width:220px', 'aria-label': 'Código da sessão' });
      c.appendChild(el('div', { class: 'cf-barra' }, [cod, C.botao('Entrar', function () { if (cod.value.trim()) C.ir('vivo_entrar', cod.value.trim()); })]));
      c.appendChild(el('h3', { txt: 'Sessões ativas das suas bandas' }));
      if (!r.sessoes.length) c.appendChild(el('p', { class: 'vazio', txt: 'Nenhuma agora. Para conduzir, abra um setlist e toque em "Iniciar sessão ao vivo".' }));
      r.sessoes.forEach(function (x) {
        c.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: x.setlist }), el('span', { class: 'm', txt: 'código ' + x.codigo })]),
          x.sou_maestro ? C.botao('Console do maestro', function () { C.ir('maestro', x.id); }, 'peq') : C.botao('Entrar', function () { C.ir('vivo_entrar', x.codigo); }, 'peq')]));
      });
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, T.vivo)); });
  };

  /** Conecta ao fluxo SSE; reconecta sozinho e mede latência. */
  function conectarFluxo(sessaoId, aoEstado, aoEvento, aoStatus) {
    var es = null, fechado = false, ultimoSeq = 0;
    var abrir = function () {
      es = new EventSource('/music/api/cifras/vivo/' + sessaoId + '/fluxo' + (ultimoSeq ? '?desde=' + ultimoSeq : ''));
      es.addEventListener('estado', function (m) { var d = JSON.parse(m.data); ultimoSeq = d.seq; aoStatus('on', 'conectado'); aoEstado(d); });
      es.addEventListener('comando', function (m) { var d = JSON.parse(m.data); ultimoSeq = Math.max(ultimoSeq, d.seq); aoEvento(d); });
      es.addEventListener('presenca', function (m) { aoEvento({ tipo: '_presenca', dados: JSON.parse(m.data) }); });
      es.addEventListener('encerrada', function () { aoStatus('off', 'sessão encerrada'); fechado = true; es.close(); });
      es.onerror = function () { if (!fechado) aoStatus('off', 'reconectando…'); };
      es.onopen = function () { aoStatus('on', 'conectado'); };
    };
    abrir();
    var ping = setInterval(function () {
      var t0 = Date.now();
      fetch('/music/api/cifras/vivo/' + sessaoId + '/relogio').then(function () { var ms = Date.now() - t0; aoStatus(ms > 600 ? 'lenta' : 'on', ms + ' ms'); }).catch(function () { aoStatus('off', 'sem rede'); });
    }, 15000);
    return { fechar: function () { fechado = true; clearInterval(ping); if (es) es.close(); } };
  }

  /** Comando do maestro: reenvia com a MESMA chave se a rede falhar (idempotente). */
  function comandar(sessaoId, tipo, payload) {
    var chave = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var tentar = function (n) {
      return api('POST', '/vivo/' + sessaoId + '/comando', { tipo: tipo, payload: payload || {}, chave_idem: chave }).catch(function (e) {
        if (e.semRede && n < 4) return new Promise(function (ok) { setTimeout(ok, 500 * n); }).then(function () { return tentar(n + 1); });
        throw e;
      });
    };
    return tentar(1);
  }

  T.vivo_entrar = function (codigo) {
    api('POST', '/vivo/entrar', { codigo: codigo, instrumento: (C.estado.prefs || {}).instrumento }).then(function (s) {
      if (s.sou_maestro) return C.ir('maestro', s.sessao.id);
      var repId = s.sessao.repertorio_id;
      var sessao = { status: 'on', rotulo: 'conectado' };
      var abrirComPacote = function (loc, offline) {
        var palco = C.abrirPalco(loc.pacote, { indice: 0, offline: offline, baixado_em: loc.baixado_em, sessao: sessao, telaCheia: true,
          aoFechar: function () { fluxo.fechar(); C.ir('vivo'); } });
        palco.aplicarEstado(s.estado);
        var fluxo = conectarFluxo(s.sessao.id, function (snap) { palco.aplicarEstado(snap.estado); }, function (ev) {
          if (ev.tipo === '_presenca') return;
          if (ev.estado) palco.aplicarEstado(ev.estado, ev);
          else api('GET', '/vivo/' + s.sessao.id).then(function (snap) { palco.aplicarEstado(snap.estado, ev); }).catch(function () {});
        }, function (st, rot) { palco.conexao(st, rot); });
      };
      C.baixarPacote(repId).then(function () { return C.pacoteLocal(repId); }).then(function (loc) { abrirComPacote(loc, false); })
        .catch(function () { C.pacoteLocal(repId).then(function (loc) { if (loc) abrirComPacote(loc, true); else C.aviso('Não consegui baixar o setlist da sessão.'); }); });
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, function () { T.vivo_entrar(codigo); })); });
  };

  T.maestro = function (sessaoId) {
    api('GET', '/vivo/' + sessaoId).then(function (snap) {
      var c = C.limpar();
      var estado = snap.estado;
      var pacote = null;
      c.appendChild(el('h2', { txt: 'Console do maestro' }));
      var conexao = el('span', { class: 'cf-conexao on' }, [el('i'), el('span', { txt: 'conectado' })]);
      var urlEntrar = location.origin + '/music/app#vivo=' + snap.sessao.codigo;
      var qr = el('div', { class: 'cf-qr' });
      c.appendChild(el('div', { class: 'cf-2col' }, [el('div', {}, [el('p', { class: 'peq', txt: 'Código para a banda entrar:' }), el('div', { class: 'cf-codigo', txt: snap.sessao.codigo }), conexao,
        el('p', { class: 'peq', txt: 'Ou aponte a câmera para o QR:' })]), qr]));
      fetch('/music/api/cifras/qr?texto=' + encodeURIComponent(urlEntrar)).then(function (r) { return r.text(); }).then(function (s) { qr.innerHTML = s; }).catch(function () {});
      var presenca = el('div', { class: 'cf-presenca', 'aria-live': 'polite' });
      c.appendChild(presenca);
      var atualBox = el('div', { class: 'cf-painel' });
      c.appendChild(atualBox);
      var grade = el('div', { class: 'cf-maestro-grid' });
      c.appendChild(grade);
      var secoes = el('div', { class: 'cf-maestro-grid' });
      c.appendChild(el('h3', { txt: 'Seções da música atual' }));
      c.appendChild(secoes);
      var lista = el('div', { class: 'cf-lista' });
      c.appendChild(el('h3', { txt: 'Setlist' }));
      c.appendChild(lista);

      function pintarPresenca(ps) {
        presenca.innerHTML = '';
        (ps || []).forEach(function (p) { presenca.appendChild(el('span', { class: p.online ? 'on' : '' }, [el('i'), el('span', { txt: (p.instrumento || 'integrante') + (p.online ? '' : ' (fora)') })])); });
      }
      function cmd(tipo, payload) {
        return comandar(sessaoId, tipo, payload).then(function (r) { if (r.estado) { estado = r.estado; pintar(); } }).catch(C.erro);
      }
      function pintar() {
        var m = pacote ? pacote.musicas[estado.item_idx] : null;
        atualBox.innerHTML = '';
        atualBox.appendChild(el('h3', { txt: 'Agora: ' + (m ? (estado.item_idx + 1) + '. ' + m.titulo : '—') }));
        atualBox.appendChild(el('p', { class: 'peq', txt: [m && m.tom_soando ? 'tom ' + m.tom_soando : '', estado.tom && estado.tom.semitons ? 'tom mudado ' + (estado.tom.semitons > 0 ? '+' : '') + estado.tom.semitons : '',
          estado.rolagem && estado.rolagem.ativa ? 'rolagem sincronizada ligada' : '', estado.pausado ? 'PAUSA' : '', (estado.concluidas || []).length + ' concluída(s)'].filter(Boolean).join(' · ') }));
        grade.innerHTML = '';
        [['◀ Anterior', function () { cmd('anterior'); }], ['Próxima ▶', function () { cmd('proximo'); }, 'forte'], ['Contar 4', function () { cmd('contagem', { tempos: 4, bpm: (m && m.bpm) || 90 }); }],
          [estado.rolagem && estado.rolagem.ativa ? 'Parar rolagem' : 'Rolar todos', function () { cmd('rolagem', { ativa: !(estado.rolagem && estado.rolagem.ativa), velocidade: (m && m.rolagem && m.rolagem.velocidade) || 30 }); }],
          ['Tom −½', function () { cmd('tom_emergencia', { item_id: estado.item_id, semitons: ((estado.tom && estado.tom.item_id === estado.item_id ? estado.tom.semitons : 0) - 1) }); }],
          ['Tom +½', function () { cmd('tom_emergencia', { item_id: estado.item_id, semitons: ((estado.tom && estado.tom.item_id === estado.item_id ? estado.tom.semitons : 0) + 1) }); }],
          ['Repete o refrão', function () { cmd('cue', { texto: 'Repete o refrão' }); }], ['Final!', function () { cmd('cue', { texto: 'Final!' }); }], ['Solo', function () { cmd('cue', { texto: 'Solo' }); }],
          ['Para tudo', function () { cmd('cue', { texto: 'PARA' }); }], [estado.pausado ? 'Retomar' : 'Pausa', function () { cmd(estado.pausado ? 'retomar' : 'pausar'); }],
          ['✓ Concluída', function () { cmd('concluir_item'); }], ['Cue livre…', function () {
            var i = el('input', { type: 'text', maxlength: '80', placeholder: 'Ex.: 2x a ponte' });
            C.modal('Mensagem para a banda', i, [{ txt: 'Cancelar' }, { txt: 'Enviar', fn: function () { cmd('cue', { texto: i.value }); } }]);
          }], ['Abrir meu palco', function () {
            var palco = C.abrirPalco(pacote, { indice: estado.item_idx, aoMudarMusica: function (i) { cmd('ir_item', { idx: i }); } });
            palco.aplicarEstado(estado);
          }], ['Encerrar sessão', function () { C.confirmar('Encerrar a sessão?', 'A banda deixa de receber comandos (a cifra continua na tela de cada um).', 'Encerrar').then(function (ok) { if (ok) api('POST', '/vivo/' + sessaoId + '/encerrar').then(function () { fluxo.fechar(); C.ir('vivo'); }); }); }],
        ].forEach(function (b) { var x = el('button', { type: 'button', class: b[2] || '', txt: b[0] }); x.onclick = b[1]; grade.appendChild(x); });
        secoes.innerHTML = '';
        if (m && m.documento) m.documento.secoes.forEach(function (s) {
          var x = el('button', { type: 'button', class: estado.secao_id === s.id ? 'forte' : '', txt: s.rotulo || D.ROTULO_PADRAO[s.tipo] || 'Parte' });
          x.onclick = function () { cmd('secao', { secao_id: s.id }); };
          secoes.appendChild(x);
        });
        lista.innerHTML = '';
        if (pacote) pacote.musicas.forEach(function (mm, i) {
          lista.appendChild(el('div', { class: 'cf-linha-item', style: i === estado.item_idx ? 'border-color:var(--navy);border-width:2px' : '' }, [el('div', { class: 'cresce' }, [el('b', { txt: (i + 1) + '. ' + mm.titulo + ((estado.concluidas || []).indexOf(mm.item_id) >= 0 ? ' ✓' : '') }), el('span', { class: 'm', txt: mm.tom_soando || '' })]),
            C.botao('Ir', function () { cmd('ir_item', { idx: i }); }, 'sec peq')]));
        });
      }
      var fluxo = conectarFluxo(sessaoId, function (s) { estado = s.estado; pintarPresenca(s.participantes); pintar(); }, function (ev) {
        if (ev.tipo === '_presenca') return pintarPresenca(ev.dados.participantes);
        if (ev.estado) { estado = ev.estado; pintar(); }
      }, function (st, rot) { conexao.className = 'cf-conexao ' + st; conexao.lastChild.textContent = rot; });
      C.baixarPacote(snap.sessao.repertorio_id).then(function (p) { pacote = p.pacote; pintar(); }).catch(function () {
        C.pacoteLocal(snap.sessao.repertorio_id).then(function (loc) { if (loc) { pacote = loc.pacote; pintar(); } });
      });
      pintarPresenca(snap.participantes);
      pintar();
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, function () { T.maestro(sessaoId); })); });
  };
})(window);
