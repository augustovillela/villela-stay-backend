// =====================================================================
// Musique Cifras — CLIENTE · BANDAS E EQUIPES: papéis, convites (e-mail,
// link e QR Code), biblioteca compartilhada, arranjos, tarefas e
// atividade. O que cada papel pode vem do SERVIDOR (`poderes`): a tela
// só esconde o botão — quem recusa é a API.
// =====================================================================
(function (global) {
  'use strict';
  var C = global.MusiqueCifras;
  var el = C.el, api = C.api;
  var T = C.telas;

  T.bandas = function () {
    api('GET', '/bandas').then(function (r) {
      var c = C.limpar();
      c.appendChild(el('h2', { txt: 'Bandas e equipes' }));
      c.appendChild(el('p', { class: 'sub', txt: 'Na banda, a mesma música aparece para cada integrante no instrumento dele. Quem não é da banda não vê nada.' }));
      var nome = el('input', { type: 'text', placeholder: 'Nome da banda, ministério ou equipe', 'aria-label': 'Nome da banda' });
      c.appendChild(el('div', { class: 'cf-barra' }, [nome, C.botao('Criar banda', function () {
        if (!nome.value.trim()) return;
        api('POST', '/bandas', { nome: nome.value.trim() }).then(function (b) { C.recarregarInicio(); C.ir('banda', b.banda.id); }).catch(C.erro);
      })]));
      if (!r.bandas.length) c.appendChild(C.estadoVazio('Você ainda não está em nenhuma banda', 'Crie uma, ou peça o link de convite a quem já tem.'));
      var g = el('div', { class: 'cf-grid' });
      r.bandas.forEach(function (b) {
        var x = el('button', { class: 'cf-cartao', type: 'button' }, [el('b', { txt: b.nome }), el('span', { class: 'm', txt: b.rotulo })]);
        x.onclick = function () { C.ir('banda', b.id); };
        g.appendChild(x);
      });
      c.appendChild(g);
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, T.bandas)); });
  };

  T.banda = function (id, extra) {
    api('GET', '/bandas/' + id).then(function (d) {
      var pode = function (p) { return d.poderes.indexOf(p) >= 0; };
      var c = C.limpar();
      c.appendChild(C.botao('← Bandas', function () { C.ir('bandas'); }, 'sec peq'));
      c.appendChild(el('h2', { txt: d.banda.nome }));
      c.appendChild(el('p', { class: 'sub', txt: 'Seu papel: ' + ((d.papeis.filter(function (p) { return p.id === d.meu_papel; })[0] || {}).rotulo || d.meu_papel) }));
      var abas = el('div', { class: 'cf-sub', role: 'tablist' });
      var area = el('div');
      c.appendChild(abas); c.appendChild(area);
      var atual = (extra && extra.aba) || 'musicas';
      var ABAS = [['musicas', 'Músicas'], ['membros', 'Integrantes'], ['arranjos', 'Arranjos'], ['tarefas', 'Tarefas'], ['atividade', 'Atividade']];
      function pintarAbas() {
        abas.innerHTML = '';
        ABAS.forEach(function (a) {
          var b = el('button', { type: 'button', role: 'tab', class: atual === a[0] ? 'on' : '', 'aria-selected': atual === a[0] ? 'true' : 'false', txt: a[1] });
          b.onclick = function () { atual = a[0]; pintarAbas(); pintar(); };
          abas.appendChild(b);
        });
      }
      function pintar() { area.innerHTML = ''; area.appendChild(C.esqueleto(3)); ({ musicas: musicas, membros: membros, arranjos: arranjos, tarefas: tarefas, atividade: atividade })[atual](); }

      function musicas() {
        api('GET', '/bandas/' + id + '/biblioteca').then(function (r) {
          area.innerHTML = '';
          area.appendChild(el('div', { class: 'cf-barra' }, [C.botao('+ Compartilhar música minha', compartilhar), C.botao('Setlist da banda', function () { C.ir('setlists', null, { novo: 'Setlist ' + d.banda.nome }); }, 'sec')]));
          if (!r.musicas.length) area.appendChild(C.estadoVazio('A banda ainda não tem músicas', 'Cada integrante compartilha as músicas dele com a banda.'));
          var l = el('div', { class: 'cf-lista' });
          r.musicas.forEach(function (m) {
            l.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: m.titulo }), el('span', { class: 'm', txt: [m.artista, m.tom_original].filter(Boolean).join(' · ') })]),
              C.botao('Abrir', function () { C.ir('musica', m.id); }, 'peq'),
              pode('gerir_membros') ? C.botao('Tirar da banda', function () { api('DELETE', '/bandas/' + id + '/musicas/' + m.id).then(musicas).catch(C.erro); }, 'sec peq') : null]));
          });
          area.appendChild(l);
        }).catch(function (e) { area.innerHTML = ''; area.appendChild(C.estadoErro(e)); });
      }
      function compartilhar() {
        var q = el('input', { type: 'search', placeholder: 'Buscar nas MINHAS músicas' });
        var res = el('div', { class: 'cf-lista', style: 'max-height:50vh;overflow:auto' });
        var buscar = C.debounce(function () {
          api('GET', '/musicas?escopo=minhas&limite=20&q=' + encodeURIComponent(q.value)).then(function (r) {
            res.innerHTML = '';
            r.itens.forEach(function (m) {
              res.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: m.titulo }), el('span', { class: 'm', txt: m.artista || '' })]),
                C.botao('Compartilhar', function (ev) { api('POST', '/bandas/' + id + '/musicas', { obra_id: m.id }).then(function () { ev.target.textContent = '✓'; ev.target.disabled = true; }).catch(C.erro); }, 'peq')]));
            });
          });
        }, 250);
        q.oninput = buscar; buscar();
        C.modal('Compartilhar com ' + d.banda.nome, el('div', {}, [q, res]), [{ txt: 'Concluir', fn: musicas }]);
      }

      function membros() {
        area.innerHTML = '';
        var l = el('div', { class: 'cf-lista' });
        d.membros.forEach(function (m) {
          var eu = m.usuario === (C.estado.inicio && C.estado.inicio.eu && C.estado.inicio.eu.id);
          var papel = pode('gerir_membros') && m.papel !== 'proprietario' && !eu
            ? C.sel(d.papeis.filter(function (p) { return p.id !== 'proprietario'; }).map(function (p) { return [p.id, p.rotulo]; }), m.papel, function (v) {
              api('PATCH', '/bandas/' + id + '/membros/' + m.usuario, { papel: v }).then(function () { C.aviso('Papel alterado.'); }).catch(function (e) { C.erro(e); T.banda(id, { aba: 'membros' }); });
            }, 'Papel') : C.tag((d.papeis.filter(function (p) { return p.id === m.papel; })[0] || {}).rotulo || m.papel);
          l.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: (m.nome || 'Integrante') + (eu ? ' (você)' : '') }), el('span', { class: 'm', txt: [m.instrumento, 'desde ' + C.data(m.entrou_em)].filter(Boolean).join(' · ') })]),
            papel,
            pode('transferir') && !eu ? C.botao('Passar a banda', function () { C.confirmar('Transferir a propriedade?', 'Você vira administrador e ' + (m.nome || 'essa pessoa') + ' passa a ser a dona da banda.', 'Transferir').then(function (ok) { if (ok) api('POST', '/bandas/' + id + '/transferir', { para: m.usuario }).then(function () { T.banda(id, { aba: 'membros' }); }).catch(C.erro); }); }, 'sec peq') : null,
            (pode('gerir_membros') && m.papel !== 'proprietario' && !eu) || (eu && m.papel !== 'proprietario') ? C.botao(eu ? 'Sair da banda' : 'Remover', function () {
              C.confirmar(eu ? 'Sair da banda?' : 'Remover da banda?', 'O acesso às músicas da banda acaba na hora.', eu ? 'Sair' : 'Remover').then(function (ok) {
                if (ok) api('DELETE', '/bandas/' + id + '/membros/' + m.usuario).then(function () { if (eu) C.ir('bandas'); else T.banda(id, { aba: 'membros' }); }).catch(C.erro);
              });
            }, 'sec peq') : null]));
        });
        area.appendChild(l);
        var inst = C.sel([['', 'Meu instrumento na banda…']].concat(C.M.instrumentos.catalogo().map(function (x) { return [x.nome, x.nome]; })).concat([['Voz', 'Voz'], ['Bateria', 'Bateria'], ['Percussão', 'Percussão'], ['Sopro', 'Sopro']]), '', function (v) {
          api('PUT', '/bandas/' + id + '/instrumento', { instrumento: v }).then(function () { C.aviso('Instrumento registrado.'); }).catch(C.erro);
        }, 'Meu instrumento');
        area.appendChild(el('div', { class: 'linha' }, [inst]));
        if (pode('gerir_membros')) area.appendChild(convites());
        if (pode('excluir_banda')) area.appendChild(el('p', {}, [C.botao('Excluir a banda', function () {
          C.confirmar('Excluir a banda?', 'As músicas continuam com quem as guardou; o que é da banda (arranjos, convites) some.', 'Excluir').then(function (ok) { if (ok) api('DELETE', '/bandas/' + id).then(function () { C.recarregarInicio(); C.ir('bandas'); }).catch(C.erro); });
        }, 'sec peq')]));
      }

      function convites() {
        var box = el('div', { class: 'cf-painel' });
        box.appendChild(el('h3', { txt: 'Convidar' }));
        var emails = el('input', { type: 'text', placeholder: 'e-mails separados por vírgula', 'aria-label': 'E-mails' });
        var papel = C.sel(d.papeis.filter(function (p) { return p.id !== 'proprietario'; }).map(function (p) { return [p.id, p.rotulo]; }), 'musico', function () {}, 'Papel');
        var saida = el('div');
        box.appendChild(el('div', { class: 'cf-barra' }, [emails, papel, C.botao('Convidar por e-mail', function () {
          api('POST', '/bandas/' + id + '/convites', { emails: emails.value, papel: papel.value }).then(function (r) {
            saida.innerHTML = '';
            if (r.entraram.length) saida.appendChild(el('p', { txt: 'Entraram agora (já tinham conta): ' + r.entraram.join(', ') }));
            r.pendentes.forEach(function (p) { if (p.url) { saida.appendChild(el('p', { class: 'peq', txt: p.email + ' ainda não tem conta — envie este link:' })); var b = el('div'); C.mostrarLink(b, location.origin + p.url); saida.appendChild(b); } else saida.appendChild(el('p', { class: 'peq', txt: p.email + ': ' + p.erro })); });
          }).catch(C.erro);
        })]));
        var usos = C.sel([[1, '1 pessoa'], [5, 'até 5'], [20, 'até 20']], 1, function () {}, 'Usos');
        var dias = C.sel([[1, '1 dia'], [7, '7 dias'], [30, '30 dias']], 7, function () {}, 'Validade');
        box.appendChild(el('div', { class: 'cf-barra' }, [el('span', { class: 'peq', txt: 'Ou um link/QR Code:' }), usos, dias, C.botao('Gerar link e QR', function () {
          api('POST', '/bandas/' + id + '/convites', { link: true, papel: papel.value, usos: Number(usos.value), dias: Number(dias.value) }).then(function (r) {
            saida.innerHTML = ''; C.mostrarLink(saida, location.origin + r.link.url);
            saida.appendChild(el('p', { class: 'peq', txt: 'Vale até ' + new Date(r.link.expira_em).toLocaleString('pt-BR') + ' para ' + usos.value + ' pessoa(s), como ' + papel.options[papel.selectedIndex].text + '.' }));
          }).catch(C.erro);
        }, 'sec')]));
        box.appendChild(saida);
        if (d.convites.length) {
          box.appendChild(el('h4', { txt: 'Convites abertos' }));
          d.convites.forEach(function (cv) {
            box.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: cv.email || 'Link (' + cv.usos + '/' + cv.usos_max + ' usos)' }), el('span', { class: 'm', txt: cv.papel + ' · até ' + C.data(cv.expira_em) })]),
              C.botao('Revogar', function () { api('DELETE', '/bandas/' + id + '/convites/' + cv.id).then(function () { T.banda(id, { aba: 'membros' }); }); }, 'sec peq')]));
          });
        }
        return box;
      }

      function arranjos() {
        api('GET', '/bandas/' + id + '/arranjos').then(function (r) {
          area.innerHTML = '';
          if (!r.arranjos.length) area.appendChild(C.estadoVazio('Nenhum arranjo da banda', 'Abra uma música da banda e crie o arranjo (tom, capo, ordem das seções).'));
          var l = el('div', { class: 'cf-lista' });
          r.arranjos.forEach(function (a) {
            l.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: a.titulo + ' — ' + a.nome }), el('span', { class: 'm', txt: ['tom ' + a.tom, a.capo ? 'capo ' + a.capo : '', a.vocalista].filter(Boolean).join(' · ') })]),
              C.tag(a.status === 'aprovado' ? 'aprovado' : a.status === 'em_revisao' ? 'em revisão' : 'rascunho', a.status === 'aprovado' ? 'ok' : 'av'),
              pode('aprovar') && a.status !== 'aprovado' ? C.botao('Aprovar', function () { api('POST', '/arranjos/' + a.id + '/aprovar').then(arranjos).catch(C.erro); }, 'peq') : null,
              C.botao('Abrir', function () { C.ir('cifra', a.cifra_id, { arranjo: a.id }); }, 'sec peq')]));
          });
          area.appendChild(l);
        }).catch(function (e) { area.innerHTML = ''; area.appendChild(C.estadoErro(e)); });
      }

      function tarefas() {
        api('GET', '/bandas/' + id + '/tarefas').then(function (r) {
          area.innerHTML = '';
          if (pode('criar_tarefa')) {
            var t = el('input', { type: 'text', placeholder: 'Ex.: Confirmar tom de Wave' });
            var resp = C.sel([['', 'Para alguém…']].concat(d.membros.map(function (m) { return [m.usuario, m.nome || m.papel]; })), '', function () {}, 'Responsável');
            var prazo = el('input', { type: 'date', 'aria-label': 'Prazo' });
            area.appendChild(el('div', { class: 'cf-barra' }, [t, resp, prazo, C.botao('Criar tarefa', function () {
              api('POST', '/bandas/' + id + '/tarefas', { titulo: t.value, responsavel: resp.value, prazo: prazo.value, alvo_tipo: 'banda', alvo_id: id }).then(tarefas).catch(C.erro);
            })]));
          }
          if (!r.tarefas.length) area.appendChild(C.estadoVazio('Nenhuma tarefa', ''));
          r.tarefas.forEach(function (x) {
            var resp2 = d.membros.filter(function (m) { return m.usuario === x.responsavel; })[0];
            area.appendChild(el('div', { class: 'cf-linha-item', style: x.status !== 'aberta' ? 'opacity:.6' : '' }, [el('div', { class: 'cresce' }, [el('b', { txt: x.titulo }), el('span', { class: 'm', txt: [resp2 ? resp2.nome : '', x.prazo ? 'até ' + C.data(x.prazo) : '', x.status].filter(Boolean).join(' · ') })]),
              x.status === 'aberta' ? C.botao('Feita', function () { api('PATCH', '/tarefas/' + x.id, { status: 'feita' }).then(tarefas).catch(C.erro); }, 'peq') : C.botao('Reabrir', function () { api('PATCH', '/tarefas/' + x.id, { status: 'aberta' }).then(tarefas).catch(C.erro); }, 'sec peq')]));
          });
        }).catch(function (e) { area.innerHTML = ''; area.appendChild(C.estadoErro(e)); });
      }

      function atividade() {
        api('GET', '/bandas/' + id + '/atividade').then(function (r) {
          area.innerHTML = '';
          var ROT = { 'banda.criada': 'criou a banda', 'banda.convidou': 'convidou', 'banda.entrou': 'entrou', 'banda.saiu': 'saiu', 'banda.removeu': 'removeu alguém', 'banda.papel': 'mudou um papel',
            'musica.compartilhada': 'compartilhou uma música', 'musica.retirada': 'tirou uma música', 'arranjo.criado': 'criou um arranjo', 'arranjo.editado': 'editou um arranjo', 'arranjo.aprovado': 'aprovou um arranjo',
            'cifra.revisao': 'publicou uma revisão', comentario: 'comentou', 'tarefa.criada': 'criou uma tarefa', 'tarefa.feita': 'concluiu uma tarefa', 'setlist.criado': 'criou um setlist', 'banda.transferida': 'transferiu a banda' };
          if (!r.atividade.length) area.appendChild(C.estadoVazio('Sem atividade ainda', ''));
          r.atividade.forEach(function (a) {
            area.appendChild(el('div', { class: 'cf-linha-item' }, [el('div', { class: 'cresce' }, [el('b', { txt: (a.ator_nome || 'Alguém') + ' ' + (ROT[a.acao] || a.acao) + (a.detalhe && a.detalhe.titulo ? ': ' + a.detalhe.titulo : '') }),
              el('span', { class: 'm', txt: new Date(a.criado_em).toLocaleString('pt-BR') })])]));
          });
        }).catch(function (e) { area.innerHTML = ''; area.appendChild(C.estadoErro(e)); });
      }
      pintarAbas(); pintar();
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e, function () { T.banda(id); })); });
  };

  /** Convite por link/QR: mostra a banda e o papel ANTES de aceitar. */
  T.convite = function (token) {
    api('GET', '/convites/' + token).then(function (cv) {
      var c = C.limpar();
      c.appendChild(el('h2', { txt: 'Convite para a banda' }));
      c.appendChild(el('div', { class: 'cf-painel' }, [el('p', { txt: 'Você foi convidado para "' + cv.banda + '" como ' + cv.rotulo + '.' }),
        el('p', { class: 'peq', txt: 'Ao entrar, você passa a ver as músicas e os setlists que a banda compartilhar. O convite vale até ' + new Date(cv.expira_em).toLocaleString('pt-BR') + '.' }),
        el('div', { class: 'linha' }, [C.botao('Entrar na banda', function () { api('POST', '/convites/' + token + '/aceitar').then(function (r) { C.recarregarInicio(); C.ir('banda', r.banda_id); }).catch(C.erro); }),
          C.botao('Agora não', function () { C.ir('inicio'); }, 'sec')])]));
    }).catch(function (e) { C.limpar().appendChild(C.estadoErro(e)); });
  };
})(window);
