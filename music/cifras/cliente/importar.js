// =====================================================================
// Musique Cifras — CLIENTE · ENCONTRAR OU IMPORTAR CIFRA.
//
// Uma porta só para todas as entradas (nome da música, texto colado,
// arquivo, URL, criar do zero). O fluxo é sempre o mesmo e sempre com
// PRÉVIA: nada entra no acervo antes de o músico ver, corrigir e
// escolher o destino (música nova, versão de uma existente ou mescla).
// =====================================================================
(function (global) {
  'use strict';
  var C = global.MusiqueCifras;
  var M = C.M, el = C.el, R = C.R, api = C.api;
  var D = M.documento;

  C.telas.importar = function (arg, extra) {
    extra = extra || {};
    var c = C.limpar();
    c.appendChild(el('h2', { txt: extra.obra_id ? 'Nova versão de "' + extra.titulo + '"' : 'Encontrar ou importar cifra' }));
    c.appendChild(el('p', { class: 'sub', txt: 'Procure pelo nome, cole a cifra, envie um arquivo (TXT, ChordPro, DOCX, PDF, foto) ou traga de uma página. Você revisa tudo antes de salvar.' }));
    var abas = el('div', { class: 'cf-sub', role: 'tablist' });
    var area = el('div');
    c.appendChild(abas); c.appendChild(area);
    var ABAS = [['buscar', 'Buscar pelo nome'], ['colar', 'Colar texto'], ['arquivo', 'Arquivo ou foto'], ['url', 'Página da web'], ['zero', 'Criar do zero']];
    var atual = extra.q ? 'buscar' : (extra.aba || 'buscar');
    function pintarAbas() {
      abas.innerHTML = '';
      ABAS.forEach(function (a) {
        if (a[0] === 'url' && C.estado.flags['cifras.importar.url'] === false) return;
        var b = el('button', { type: 'button', role: 'tab', 'aria-selected': atual === a[0] ? 'true' : 'false', class: atual === a[0] ? 'on' : '', txt: a[1] });
        b.onclick = function () { atual = a[0]; pintarAbas(); pintar(); };
        abas.appendChild(b);
      });
    }
    function pintar() { area.innerHTML = ''; ({ buscar: abaBuscar, colar: abaColar, arquivo: abaArquivo, url: abaUrl, zero: abaZero })[atual](area, extra); }
    pintarAbas(); pintar();
  };

  // ---------------------------------------------------------------
  function abaBuscar(area, extra) {
    var tit = el('input', { type: 'text', placeholder: 'Nome da música', value: extra.titulo || (extra.q || '').split(/\s+[-–—]\s+/)[0] || '', 'aria-label': 'Nome da música' });
    var art = el('input', { type: 'text', placeholder: 'Artista (ajuda a achar fora do acervo)', value: extra.artista || (extra.q || '').split(/\s+[-–—]\s+/)[1] || '', 'aria-label': 'Artista' });
    var res = el('div', { 'aria-live': 'polite' });
    var ir = function () {
      if (!tit.value.trim()) return;
      res.innerHTML = ''; res.appendChild(C.esqueleto(3));
      api('POST', '/importar/buscar', { titulo: tit.value.trim(), artista: art.value.trim() }).then(function (r) {
        res.innerHTML = '';
        res.appendChild(el('h3', { txt: 'No seu acervo e nas suas bandas' }));
        if (!r.internos.length) res.appendChild(el('p', { class: 'vazio', txt: 'Nada no acervo com esse nome.' }));
        var li = el('div', { class: 'cf-lista' });
        r.internos.forEach(function (x) {
          li.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: x.titulo }), el('span', { class: 'm', txt: [x.artista, x.tom, x.cifras + ' versão(ões)'].filter(Boolean).join(' · ') })]),
            C.botao('Abrir', function () { C.ir(x.cifra_principal ? 'cifra' : 'musica', x.cifra_principal || x.id); }, 'peq')]));
        });
        res.appendChild(li);
        if (!r.busca_externa) { res.appendChild(el('p', { class: 'peq', txt: 'A busca em sites de cifra está desligada no momento.' })); return; }
        if (r.precisa_artista) { res.appendChild(el('p', { class: 'peq', txt: 'Para procurar fora do acervo, informe também o artista.' })); return; }
        var ext = el('div');
        res.appendChild(el('h3', { txt: 'Em sites de cifra' }));
        res.appendChild(ext);
        acompanhar(r.tarefa.importacao.id, ext, function (d) { mostrarCandidatos(d, ext, extra); });
      }).catch(function (e) { res.innerHTML = ''; res.appendChild(C.estadoErro(e, ir)); });
    };
    tit.onkeydown = art.onkeydown = function (e) { if (e.key === 'Enter') ir(); };
    area.appendChild(el('div', { class: 'cf-barra' }, [tit, art, C.botao('Procurar', ir)]));
    area.appendChild(res);
    if (tit.value) ir();
  }

  /** Acompanha uma importação assíncrona até pronta/falhou, com progresso. */
  function acompanhar(id, box, aoPronto) {
    var barra = el('div', { class: 'barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, [el('i', { style: 'width:5%' })]);
    var msg = el('p', { class: 'peq', txt: 'Procurando…' });
    box.innerHTML = ''; box.appendChild(msg); box.appendChild(barra);
    var tentativas = 0;
    (function perguntar() {
      api('GET', '/importar/' + id).then(function (d) {
        var st = d.importacao.status;
        barra.firstChild.style.width = (d.importacao.progresso || 5) + '%';
        barra.setAttribute('aria-valuenow', String(d.importacao.progresso || 5));
        if (st === 'pronta' || st === 'salva') return aoPronto(d);
        if (st === 'falhou') { box.innerHTML = ''; box.appendChild(C.estadoVazio('Não deu certo', d.importacao.erro || '')); return; }
        if (++tentativas > 120) { msg.textContent = 'Está demorando. Você pode sair: a importação continua e aparece em Importações.'; return; }
        setTimeout(perguntar, tentativas < 10 ? 700 : 1500);
      }).catch(function (e) { box.innerHTML = ''; box.appendChild(C.estadoErro(e)); });
    })();
  }

  function mostrarCandidatos(d, box, extra) {
    box.innerHTML = '';
    var r = d.resultado || {};
    (r.falhas || []).forEach(function (f) { box.appendChild(el('p', { class: 'peq', txt: f.fonte + ': ' + f.erro })); });
    if (!(r.candidatos || []).length) { box.appendChild(C.estadoVazio('Nenhuma cifra encontrada nos sites', 'Tente colar a cifra ou enviar um arquivo.')); return; }
    var marcados = [];
    var li = el('div', { class: 'cf-lista' });
    d.candidatos.forEach(function (cand, i) {
      var cb = el('input', { type: 'checkbox', 'aria-label': 'Selecionar para comparar' });
      cb.onchange = function () { if (cb.checked) marcados.push(cand.id); else marcados = marcados.filter(function (x) { return x !== cand.id; }); };
      var rk = cand.ranking || {};
      li.appendChild(el('div', { class: 'cf-linha-item' }, [cb, el('div', { class: 'cresce' }, [el('b', { txt: (i + 1) + '. ' + (cand.titulo || '') + ' — ' + (cand.artista || '') }),
        el('span', { class: 'm', txt: cand.fonte + ' · nota ' + (rk.score || 0) + ' · qualidade ' + (rk.qualidade || 0) + ' · semelhança ' + Math.round((rk.semelhanca || 0) * 100) + '%' })]),
      C.botao('Ver e revisar', function () {
        api('GET', '/importar/' + d.importacao.id + '/candidatos/' + cand.id).then(function (x) {
          C.ir('previa', null, { importacao: d.importacao.id, candidato: cand.id, documento: x.documento, texto_original: x.texto, fonte: { tipo: 'busca', url: x.url, adaptador: x.fonte }, destino: extra });
        }).catch(C.erro);
      }, 'peq')]));
    });
    box.appendChild(li);
    box.appendChild(el('div', { class: 'linha' }, [C.botao('Comparar selecionadas', function () {
      if (marcados.length < 2) return C.aviso('Marque duas ou mais.');
      api('POST', '/importar/' + d.importacao.id + '/comparar', { ids: marcados }).then(function (x) {
        var b = el('div');
        x.comparacoes.forEach(function (cp) { b.appendChild(el('h4', { txt: 'Base × ' + cp.fonte })); b.appendChild(C.renderDiff(cp.diff)); });
        C.modal('Diferenças entre as versões encontradas', b);
      }).catch(C.erro);
    }, 'sec'), C.botao('Criar melhor versão', function () {
      if (marcados.length < 2) return C.aviso('Marque duas ou mais.');
      api('POST', '/importar/' + d.importacao.id + '/melhor', { ids: marcados }).then(function (x) {
        C.ir('previa', null, { importacao: d.importacao.id, documento: x.documento, fusao: x.divergencias, texto_original: x.texto, fonte: { tipo: 'busca', metodo: 'fusao' }, destino: extra });
      }).catch(C.erro);
    }, 'sec')]));
  }

  // ---------------------------------------------------------------
  function abaColar(area, extra) {
    var ta = el('textarea', { rows: '16', placeholder: 'Cole a cifra aqui (acordes em cima da letra, ou ChordPro).', style: 'font-family:ui-monospace,monospace', 'aria-label': 'Texto da cifra' });
    area.appendChild(ta);
    area.appendChild(el('div', { class: 'linha' }, [C.botao('Ver prévia', function () {
      if (!ta.value.trim()) return;
      api('POST', '/importar/texto', { texto: ta.value, titulo: extra.titulo, artista: extra.artista }).then(function (d) { abrirPrevia(d, extra); }).catch(C.erro);
    }), C.temIA('interpretar') ? C.botao('Está bagunçado: organizar com IA', function () {
      api('POST', '/ia/interpretar', { texto: ta.value }).then(function (r) {
        ta.value = (r.dados && r.dados.texto) || ta.value;
        C.aviso('Texto reorganizado pela IA (confiança ' + Math.round((r.confianca || 0) * 100) + '%). Confira e veja a prévia.');
      }).catch(C.erro);
    }, 'sec') : null]));
  }

  function abaArquivo(area, extra) {
    var zona = el('div', { class: 'cf-estado', tabindex: '0', role: 'button', 'aria-label': 'Escolher arquivos', style: 'cursor:pointer' },
      [el('b', { txt: 'Arraste arquivos aqui ou toque para escolher' }), el('span', { txt: 'TXT, ChordPro, DOCX, PDF ou foto (vários = importação em lote). Até 8 MB cada.' })]);
    var input = el('input', { type: 'file', multiple: 'multiple', accept: '.txt,.cho,.chopro,.chordpro,.crd,.pro,.docx,.pdf,image/*', style: 'display:none' });
    var saida = el('div');
    zona.onclick = function () { input.click(); };
    zona.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') input.click(); };
    zona.ondragover = function (e) { e.preventDefault(); zona.style.borderColor = 'var(--navy)'; };
    zona.ondragleave = function () { zona.style.borderColor = ''; };
    zona.ondrop = function (e) { e.preventDefault(); zona.style.borderColor = ''; enviar(e.dataTransfer.files); };
    input.onchange = function () { enviar(input.files); };
    area.appendChild(zona); area.appendChild(input); area.appendChild(saida);
    if (!(C.temIA('ler_imagem'))) area.appendChild(el('p', { class: 'peq', txt: 'Leitura de FOTO e de PDF escaneado depende da IA, que está desligada agora. PDF com texto, DOCX e TXT funcionam normalmente.' }));

    function lerBase64(f) {
      return new Promise(function (ok, falha) {
        var r = new FileReader();
        r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
        r.onerror = function () { falha(r.error); };
        r.readAsDataURL(f);
      });
    }
    function enviar(lista) {
      var arqs = Array.prototype.slice.call(lista || []);
      if (!arqs.length) return;
      if (arqs.some(function (f) { return f.size > 8 * 1024 * 1024; })) return C.aviso('Há arquivo acima de 8 MB.');
      saida.innerHTML = ''; saida.appendChild(C.esqueleto(arqs.length));
      Promise.all(arqs.map(function (f) { return lerBase64(f).then(function (b) { return { nome: f.name, base64: b }; }); })).then(function (itens) {
        if (itens.length === 1) {
          return api('POST', '/importar/arquivo', itens[0]).then(function (d) {
            if (d.importacao.status === 'pronta') return abrirPrevia(d, extra);
            acompanhar(d.importacao.id, saida, function (x) { abrirPrevia(x, extra); });
          });
        }
        return api('POST', '/importar/lote', { itens: itens }).then(function (r) {
          saida.innerHTML = '';
          saida.appendChild(el('p', { txt: r.itens.length + ' arquivo(s) no lote. Cada um tem a sua prévia em Importações.' }));
          saida.appendChild(C.botao('Ver importações', function () { C.ir('importacoes'); }));
        });
      }).catch(function (e) { saida.innerHTML = ''; saida.appendChild(C.estadoErro(e)); });
    }
  }

  function abaUrl(area, extra) {
    var u = el('input', { type: 'url', placeholder: 'https://…', 'aria-label': 'Endereço da página' });
    var saida = el('div');
    area.appendChild(el('p', { class: 'peq', txt: 'Cole o endereço de uma página pública com a cifra. O site precisa permitir leitura automática (robots.txt); endereços internos são recusados.' }));
    area.appendChild(el('div', { class: 'cf-barra' }, [u, C.botao('Trazer', function () {
      if (!u.value.trim()) return;
      api('POST', '/importar/url', { url: u.value.trim() }).then(function (d) { acompanhar(d.importacao.id, saida, function (x) { abrirPrevia(x, extra); }); }).catch(C.erro);
    })]));
    area.appendChild(saida);
  }

  function abaZero(area, extra) {
    area.appendChild(el('p', { txt: 'Começa uma cifra em branco e abre o editor.' }));
    var tit = el('input', { type: 'text', placeholder: 'Título', value: extra.titulo || '' }), art = el('input', { type: 'text', placeholder: 'Artista', value: extra.artista || '' });
    area.appendChild(el('div', { class: 'cf-barra' }, [tit, art, C.botao('Criar e editar', function () {
      if (extra.obra_id) return api('POST', '/musicas/' + extra.obra_id + '/cifras', { documento: D.novoDocumento({ titulo: extra.titulo }), status: 'rascunho', nome: 'Nova versão' }).then(function (r) { C.ir('editor', r.cifra.id); }).catch(C.erro);
      C.criarMusica({ titulo: tit.value, artista: art.value }).then(function (r) { if (r && r.cifra) C.ir('editor', r.cifra.id); });
    })]));
  }

  // ---------------------------------------------------------------
  // PRÉVIA
  // ---------------------------------------------------------------
  function abrirPrevia(d, extra) {
    var r = d.resultado || {};
    C.ir('previa', null, { importacao: d.importacao.id, documento: r.documento, texto_original: r.texto_original, fonte: r.fonte, resultado: r, destino: extra });
  }

  C.telas.previa = function (arg, x) {
    x = x || {};
    var doc = D.clonar(x.documento);
    var r = x.resultado || {};
    var c = C.limpar();
    c.appendChild(el('h2', { txt: 'Revise antes de salvar' }));
    var conf = r.confianca !== undefined ? r.confianca : null;
    c.appendChild(el('div', { class: 'linha' }, [conf !== null ? C.tag('confiança da leitura ' + Math.round(conf * 100) + '%', conf >= 0.85 ? 'ok' : conf < 0.6 ? 'er' : 'av') : null,
      r.qualidade ? C.tag('qualidade ' + r.qualidade.nota, r.qualidade.nota >= 75 ? 'ok' : 'av') : null,
      x.fonte && x.fonte.tipo ? C.tag('fonte: ' + ({ texto: 'texto colado', arquivo: 'arquivo', url: 'página', busca: 'busca' }[x.fonte.tipo] || x.fonte.tipo) + (x.fonte.adaptador ? ' · ' + x.fonte.adaptador : '')) : null].filter(Boolean)));
    if (r.observacoes_ia) c.appendChild(el('div', { class: 'alerta', txt: 'Observação da leitura por IA: ' + r.observacoes_ia }));
    (x.fusao || []).forEach(function (dv) { c.appendChild(el('div', { class: 'alerta ' + (dv.aplicado ? 'bom' : ''), txt: dv.secao + ': "' + dv.linha + '" — ' + (dv.aplicado ? 'usado ' + dv.escolhido + ' (maioria)' : 'empate — ficou ' + dv.escolhido) })); });
    (r.ambiguidades || []).forEach(function (a) { c.appendChild(el('div', { class: 'alerta', txt: (a.linha ? 'Linha ' + a.linha + ': ' : '') + a.motivo + (a.texto ? ' "' + a.texto.trim().slice(0, 60) + '"' : '') })); });
    if ((r.nao_reconhecidos || []).length) c.appendChild(el('div', { class: 'alerta ruim', txt: 'Acordes não reconhecidos (vão ficar marcados): ' + r.nao_reconhecidos.join(', ') + '. Corrija no editor da prévia ou depois de salvar.' }));
    if (r.qualidade && r.qualidade.motivos && r.qualidade.motivos.length) c.appendChild(el('p', { class: 'peq', txt: 'O que baixa a qualidade: ' + r.qualidade.motivos.join('; ') + '.' }));

    // Metadados
    var f = el('div', { class: 'cf-form' }), cmp = {};
    [['titulo', 'Título'], ['artista', 'Artista'], ['compositor', 'Compositor'], ['tom', 'Tom'], ['bpm', 'BPM'], ['compasso', 'Compasso'], ['capo', 'Capo']].forEach(function (k) {
      var i = el('input', { type: 'text', value: doc.meta[k[0]] || '' }); cmp[k[0]] = i;
      f.appendChild(el('label', {}, [el('span', { txt: k[1] }), i]));
    });
    c.appendChild(f);
    if (r.tom_sugerido && !doc.meta.tom) {
      c.appendChild(el('p', { class: 'peq' }, [el('span', { txt: 'Tom provável: ' + r.tom_sugerido.nome + ' (' + Math.round(r.tom_sugerido.confianca * 100) + '%) — ' + r.tom_sugerido.motivo + ' ' }),
        C.botao('Usar ' + r.tom_sugerido.nome, function () { cmp.tom.value = r.tom_sugerido.nome; }, 'sec peq')]));
    }
    if (r.dificuldade && r.dificuldade.nivel) c.appendChild(el('p', { class: 'peq', txt: 'Dificuldade estimada: ' + r.dificuldade.nivel + ' (' + r.dificuldade.motivo + ')' }));
    if (C.temIA('metadados')) c.appendChild(C.botao('IA: sugerir dados', function () {
      api('POST', '/ia/metadados', { texto: D.paraTexto(doc, { cabecalho: false }).slice(0, 6000), titulo: cmp.titulo.value, artista: cmp.artista.value }).then(function (res) {
        var m = res.dados || {};
        var box = el('div', {}, [el('p', { txt: 'Sugestão (confiança ' + Math.round((res.confianca || 0) * 100) + '%). Aplico nos campos vazios?' }), el('pre', { txt: JSON.stringify(m, null, 2) })]);
        C.modal('Dados sugeridos pela IA', box, [{ txt: 'Não' }, { txt: 'Aplicar nos vazios', fn: function () {
          ['titulo', 'artista', 'compositor', 'compasso'].forEach(function (k) { if (!cmp[k].value && m[k]) cmp[k].value = m[k]; });
          if (!cmp.bpm.value && m.bpm_estimado) cmp.bpm.value = m.bpm_estimado;
        } }]);
      }).catch(C.erro);
    }, 'sec peq'));

    // Lado a lado
    var duas = el('div', { class: 'cf-2col' });
    duas.appendChild(el('div', {}, [el('h3', { txt: 'Como chegou' }), el('pre', { class: 'cf-doc mono', style: 'max-height:60vh;overflow:auto', txt: x.texto_original || r.texto_original || '' })]));
    var direita = el('div');
    duas.appendChild(direita);
    c.appendChild(duas);
    function pintarDireita() {
      direita.innerHTML = '';
      direita.appendChild(el('div', { class: 'linha' }, [el('h3', { txt: 'Como vai ficar', style: 'margin:0' }), C.botao('Corrigir o texto', corrigir, 'sec peq')]));
      var box = R.cifra(doc, { fonte: 15 });
      box.style.maxHeight = '60vh'; box.style.overflow = 'auto';
      direita.appendChild(box);
    }
    function corrigir() {
      var ta = el('textarea', { rows: '18', style: 'font-family:ui-monospace,monospace' });
      ta.value = D.paraTexto(doc, { cabecalho: false });
      C.modal('Corrigir antes de salvar', ta, [{ txt: 'Cancelar' }, { txt: 'Aplicar', fn: function () {
        var meta = doc.meta; doc = D.deTexto(ta.value).documento; doc.meta = Object.assign({}, meta, doc.meta); pintarDireita();
      } }]);
    }
    pintarDireita();

    // Destino e duplicata
    c.appendChild(el('h3', { txt: 'Onde salvar' }));
    var destino = x.destino && x.destino.obra_id ? 'nova_versao' : 'nova_musica';
    var dups = r.duplicatas || [];
    var opc = [['nova_musica', 'Como música nova']];
    if (x.destino && x.destino.obra_id) opc.unshift(['nova_versao', 'Nova versão de "' + x.destino.titulo + '"']);
    dups.forEach(function (dp) { opc.push(['versao:' + dp.obra.id, 'Nova versão de "' + dp.obra.titulo + '" (já existe)']); opc.push(['mesclar:' + dp.obra.id, 'Mesclar dados e criar versão em "' + dp.obra.titulo + '"']); });
    if (dups.length) {
      destino = 'versao:' + dups[0].obra.id;
      c.appendChild(el('div', { class: 'alerta', txt: 'Parece que "' + dups[0].obra.titulo + '" já está no seu acervo (' + dups[0].motivo + '). Escolha como salvar.' }));
      opc.push(['separada', 'Salvar separada mesmo assim']);
    }
    var sd = C.sel(opc, destino, function (v) { destino = v; }, 'Destino');
    var tit = C.sel([['terceiro_privado', 'Obra de terceiro (fica no meu acervo e nas minhas bandas)'], ['propria', 'Obra minha'], ['dominio_publico', 'Domínio público']], 'terceiro_privado', function () {}, 'Titularidade');
    c.appendChild(el('div', { class: 'cf-barra' }, [sd, tit]));
    c.appendChild(el('div', { class: 'linha' }, [C.botao('Salvar no acervo', salvar), C.botao('Descartar', function () {
      if (x.importacao) api('DELETE', '/importar/' + x.importacao).catch(function () {});
      C.ir('importar');
    }, 'sec')]));

    function salvar() {
      var meta = {};
      Object.keys(cmp).forEach(function (k) { if (cmp[k].value.trim()) meta[k] = cmp[k].value.trim(); });
      doc.meta = Object.assign({}, doc.meta, meta);
      var corpo = { documento: doc, meta: meta, titularidade: tit.value, candidato_id: x.candidato || undefined };
      if (destino === 'nova_versao') { corpo.destino = 'nova_versao'; corpo.obra_id = x.destino.obra_id; }
      else if (destino.indexOf('versao:') === 0) { corpo.destino = 'nova_versao'; corpo.obra_id = destino.slice(7); }
      else if (destino.indexOf('mesclar:') === 0) { corpo.destino = 'mesclar'; corpo.obra_id = destino.slice(8); }
      else { corpo.destino = 'nova_musica'; corpo.separada = destino === 'separada'; }
      if (!meta.titulo && corpo.destino === 'nova_musica') return C.aviso('Dê um título à música.');
      api('POST', '/importar/' + x.importacao + '/salvar', corpo).then(function (res) {
        C.aviso('Salva no acervo.');
        C.ir('cifra', res.cifra_id);
      }).catch(function (e) {
        if (e.status === 409 && e.dados && e.dados.codigo === 'DUPLICATA') {
          var dp = e.dados.duplicatas[0].obra;
          C.modal('Esta música já existe', 'Existe "' + dp.titulo + '". Salvar como nova versão dela?', [{ txt: 'Salvar separada', fn: function () { destino = 'separada'; salvar(); } },
            { txt: 'Nova versão dela', fn: function () { destino = 'versao:' + dp.id; salvar(); } }]);
          return;
        }
        C.erro(e);
      });
    }
  };

  // ---------------------------------------------------------------
  // IMPORTAÇÕES (lista e reprocessamento)
  // ---------------------------------------------------------------
  C.telas.importacoes = function () {
    api('GET', '/importar').then(function (r) {
      var c = C.limpar();
      c.appendChild(el('h2', { txt: 'Importações' }));
      if (!r.importacoes.length) return c.appendChild(C.estadoVazio('Nenhuma importação ainda', '', C.botao('Encontrar ou importar', function () { C.ir('importar'); })));
      var li = el('div', { class: 'cf-lista' });
      r.importacoes.forEach(function (x) {
        var st = { pronta: ['pronta para revisar', 'av'], salva: ['salva', 'ok'], falhou: ['falhou', 'er'], processando: ['processando', ''], pendente: ['na fila', ''], descartada: ['descartada', ''] }[x.status] || [x.status, ''];
        li.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: x.entrada_resumo || x.tipo_entrada }),
          el('span', { class: 'm', txt: [x.tipo_entrada, new Date(x.criado_em).toLocaleString('pt-BR'), x.erro].filter(Boolean).join(' · ') })]), C.tag(st[0], st[1]),
        x.status === 'pronta' ? C.botao('Revisar', function () { api('GET', '/importar/' + x.id).then(function (d) {
          if (d.candidatos && d.candidatos.length) { var box = C.limpar(); box.appendChild(el('h2', { txt: 'Resultados da busca' })); var b = el('div'); box.appendChild(b); mostrarCandidatos(d, b, {}); }
          else abrirPrevia(d, {});
        }).catch(C.erro); }, 'peq') : null,
        x.status === 'salva' && x.cifra_id ? C.botao('Abrir', function () { C.ir('cifra', x.cifra_id); }, 'sec peq') : null,
        ['pronta', 'falhou'].indexOf(x.status) >= 0 ? C.botao('Descartar', function () { api('DELETE', '/importar/' + x.id).then(C.telas.importacoes); }, 'sec peq') : null]));
      });
      c.appendChild(li);
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, C.telas.importacoes)); });
  };
})(window);
