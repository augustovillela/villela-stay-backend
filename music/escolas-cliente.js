// =====================================================================
// Musique — telas de ESCOLA (Fase 3), servidas em /music/escolas.js.
//
// Duas portas, porque são duas pessoas diferentes:
//
//   ESCOLA        · quem trabalha nela — gestor, professor, secretaria.
//                   Turmas, matrículas, aulas, chamada e boletim.
//   MINHAS TURMAS · quem estuda nela, e o responsável pelo menor.
//                   Só o que é dele: a turma, o material e o boletim.
//
// TRÊS COISAS QUE ESTA TELA NÃO FAZ, de propósito:
//
//   1. Não inventa nota. Não existe campo "nota do boletim": nota vem de
//      uma correção com autor e data (a tela de Professor), ou não
//      existe. O boletim aqui só MOSTRA — e mostra de onde veio.
//   2. Não trata aula sem chamada como falta. A tela diz "sem chamada",
//      separado, porque a diferença é do professor, não do aluno.
//   3. Não mostra lista de colegas para aluno. Numa escola com menor de
//      idade, quem estuda ali é dado de terceiro (o servidor já recusa;
//      a tela não pede).
//
// ⚠️ ASCII de propósito, como o resto do app: um script de edição já
// truncou arquivo daqui ao falhar na codificação de caractere fora do
// plano básico. E nada de crase dentro do template — nem em comentario.
// =====================================================================
'use strict';

const JS = `
(function () {
  'use strict';
  var U = window.MusiqueUI;
  var $ = U.$, el = U.el, api = U.api, erro = U.erro, aviso = U.aviso, carregando = U.carregando;

  var ESTADOS = [['presente', 'Presente'], ['falta', 'Falta'], ['justificada', 'Justificada']];
  var PAPEIS = [['professor', 'Professor'], ['secretaria', 'Secretaria'], ['gestor', 'Gestao']];
  var rotulo = function (lista, v) {
    for (var i = 0; i < lista.length; i++) if (lista[i][0] === v) return lista[i][1];
    return v || '';
  };
  var data = function (iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  };
  var hoje = function () { return new Date().toISOString().slice(0, 10); };
  var titulo = function (c, txt, sub) {
    c.appendChild(el('h2', { txt: txt }));
    if (sub) c.appendChild(el('p', { class: 'sub', txt: sub }));
  };
  var voltar = function (c, fn, txt) {
    c.appendChild(el('p', {}, [el('button', { class: 'btn sec', txt: txt || 'Voltar', onclick: fn })]));
  };

  // =================================================================
  // ESCOLA — a lista de escolas em que a pessoa trabalha
  // =================================================================
  function verEscolas() {
    carregando();
    api('GET', '/escolas').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      titulo(c, 'Escolas', 'Onde voce da aula, coordena ou faz a secretaria.');

      if (!d.trabalho.length) {
        c.appendChild(el('div', { class: 'nota', html:
          '<b>Voce ainda nao faz parte de nenhuma escola.</b><br>' +
          'Crie a sua abaixo, ou peca a quem coordena para convidar voce pelo e-mail da sua conta.' }));
      }

      d.trabalho.forEach(function (e) {
        var uso = e.uso || {};
        var box = el('div', { class: 'item' }, [
          el('h3', { txt: e.nome }),
          el('p', { class: 'sub', txt: rotulo(PAPEIS, e.papel) + ' \\u00b7 ' +
            (uso.turmas || 0) + ' turma(s) \\u00b7 ' + (uso.alunos || 0) + ' aluno(s)' +
            (e.assentos ? ' de ' + e.assentos + ' assento(s)' : '') }),
        ]);
        box.onclick = function () { verEscola(e.id); };
        c.appendChild(box);
      });

      // ---- criar escola ----
      var nome = el('input', { class: 'campo', placeholder: 'Nome da escola', maxlength: '160' });
      var tipo = el('select', { class: 'campo' });
      [['escola', 'Escola de musica'], ['estudio', 'Estudio'], ['igreja', 'Igreja'],
       ['projeto', 'Projeto social']].forEach(function (o) {
        tipo.appendChild(el('option', { value: o[0], txt: o[1] }));
      });
      c.appendChild(el('details', { class: 'criterio' }, [
        el('summary', { txt: 'Criar uma escola' }),
        el('p', { class: 'sub', txt: 'Voce entra como gestao e convida o resto da equipe depois.' }),
        nome, tipo,
        el('p', {}, [el('button', { class: 'btn', txt: 'Criar', onclick: function () {
          if (!nome.value.trim()) return erro('A escola precisa de um nome.');
          api('POST', '/escolas', { nome: nome.value, tipo: tipo.value })
            .then(function (r) { verEscola(r.escola.id); }).catch(function (e) { erro(e.message); });
        } })]),
      ]));
    }).catch(function (e) { erro(e.message); });
  }

  // ---- uma escola: equipe e turmas ----
  function verEscola(id) {
    carregando();
    api('GET', '/escolas/' + id).then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      voltar(c, verEscolas, 'Todas as escolas');
      titulo(c, d.escola.nome, 'Voce esta aqui como ' + rotulo(PAPEIS, d.papel).toLowerCase() + '.');

      // ---- turmas ----
      c.appendChild(el('h3', { txt: 'Turmas' }));
      var ativas = d.turmas.filter(function (t) { return t.status === 'ativa'; });
      if (!ativas.length) c.appendChild(el('p', { class: 'vazio', txt: 'Nenhuma turma ativa.' }));
      ativas.forEach(function (t) {
        var box = el('div', { class: 'item' }, [
          el('h3', { txt: t.nome }),
          el('p', { class: 'sub', txt: [t.instrumento, t.nivel, t.horario, t.periodo]
            .filter(Boolean).join(' \\u00b7 ') || 'Sem detalhes' }),
        ]);
        box.onclick = function () { verTurma(t.id); };
        c.appendChild(box);
      });

      if (d.papel === 'gestor' || d.papel === 'professor') {
        var tn = el('input', { class: 'campo', placeholder: 'Nome da turma (ex.: Violao iniciante)' });
        var ti = el('input', { class: 'campo', placeholder: 'Instrumento' });
        var tv = el('input', { class: 'campo', placeholder: 'Nivel (iniciante, intermediario...)' });
        var th = el('input', { class: 'campo', placeholder: 'Horario (ex.: ter e qui, 19h)' });
        var tp = el('input', { class: 'campo', placeholder: 'Periodo (ex.: 2026.2)' });
        c.appendChild(el('details', { class: 'criterio' }, [
          el('summary', { txt: 'Criar turma' }), tn, ti, tv, th, tp,
          el('p', {}, [el('button', { class: 'btn', txt: 'Criar turma', onclick: function () {
            api('POST', '/escolas/' + id + '/turmas', { nome: tn.value, instrumento: ti.value,
              nivel: tv.value, horario: th.value, periodo: tp.value })
              .then(function (r) { verTurma(r.turma.id); }).catch(function (e) { erro(e.message); });
          } })]),
        ]));
      }

      // ---- equipe ----
      c.appendChild(el('h3', { txt: 'Equipe' }));
      d.membros.forEach(function (m) {
        var linha = el('div', { class: 'item' }, [
          el('p', { html: '<b>' + U.esc(m.nome) + '</b> \\u00b7 ' + U.esc(rotulo(PAPEIS, m.papel)) }),
        ]);
        if (d.papel === 'gestor' && m.usuario !== (d.escola.criado_por || '')) {
          linha.appendChild(el('button', { class: 'btn sec', txt: 'Remover', onclick: function () {
            api('DELETE', '/escolas/' + id + '/membros/' + m.usuario)
              .then(function () { verEscola(id); }).catch(function (e) { erro(e.message); });
          } }));
        }
        c.appendChild(linha);
      });

      if (d.papel === 'gestor') {
        var em = el('input', { class: 'campo', placeholder: 'E-mails, separados por virgula' });
        var pp = el('select', { class: 'campo' });
        PAPEIS.forEach(function (o) { pp.appendChild(el('option', { value: o[0], txt: o[1] })); });
        c.appendChild(el('details', { class: 'criterio' }, [
          el('summary', { txt: 'Convidar para a equipe' }),
          el('p', { class: 'sub', txt: 'A pessoa precisa ter conta na plataforma. '
            + 'Quem nao tiver aparece na lista de nao encontrados.' }),
          em, pp,
          el('p', {}, [el('button', { class: 'btn', txt: 'Convidar', onclick: function () {
            api('POST', '/escolas/' + id + '/membros', {
              emails: em.value.split(','), papel: pp.value,
            }).then(function (r) {
              if (r.nao_encontrados && r.nao_encontrados.length) {
                aviso('Sem conta na plataforma: ' + r.nao_encontrados.join(', '));
              }
              verEscola(id);
            }).catch(function (e) { erro(e.message); });
          } })]),
        ]));
      }
    }).catch(function (e) { erro(e.message); });
  }

  // =================================================================
  // TURMA — alunos, aulas, material e boletim
  // =================================================================
  function verTurma(id) {
    carregando();
    api('GET', '/turmas/' + id).then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      var membro = d.como === 'membro';
      voltar(c, membro ? function () { verEscola(d.organizacao.id); } : verMinhasTurmas,
        membro ? d.organizacao.nome : 'Minhas turmas');
      titulo(c, d.turma.nome, d.organizacao.nome + (d.professor_nome ? ' \\u00b7 ' + d.professor_nome : '')
        + (d.turma.horario ? ' \\u00b7 ' + d.turma.horario : ''));
      if (d.turma.status !== 'ativa') {
        c.appendChild(el('div', { class: 'alerta', txt: 'Esta turma esta encerrada. '
          + 'O historico continua aqui; nada novo entra.' }));
      }

      // ---- aulas ----
      c.appendChild(el('h3', { txt: 'Aulas' }));
      if (!d.aulas.length) c.appendChild(el('p', { class: 'vazio', txt: 'Nenhuma aula registrada ainda.' }));
      d.aulas.forEach(function (a) {
        var box = el('div', { class: 'item' }, [
          el('p', { html: '<b>' + U.esc(data(a.data) || 'Sem data') + '</b> \\u00b7 '
            + U.esc(a.tema || 'Sem tema') }),
        ]);
        if (a.link) box.appendChild(el('p', {}, [el('a', { href: a.link, target: '_blank',
          rel: 'noopener', txt: 'Entrar na sala' })]));
        if (membro) {
          box.appendChild(el('button', { class: 'btn sec', txt: 'Chamada', onclick: function () {
            verChamada(a.id, id);
          } }));
        }
        c.appendChild(box);
      });

      if (membro && (d.papel === 'gestor' || d.papel === 'professor')) {
        var ad = el('input', { class: 'campo', type: 'date', value: hoje() });
        var at = el('input', { class: 'campo', placeholder: 'Tema da aula' });
        var al = el('input', { class: 'campo', placeholder: 'Link da sala (opcional)' });
        c.appendChild(el('details', { class: 'criterio' }, [
          el('summary', { txt: 'Marcar aula' }),
          el('p', { class: 'sub', txt: 'A sala de video e externa por enquanto: cole aqui o link '
            + 'que voce ja usa, e ele aparece para a turma.' }),
          ad, at, al,
          el('p', {}, [el('button', { class: 'btn', txt: 'Marcar', onclick: function () {
            api('POST', '/turmas/' + id + '/aulas', { data: ad.value, tema: at.value, link: al.value })
              .then(function () { verTurma(id); }).catch(function (e) { erro(e.message); });
          } })]),
        ]));
      }

      // ---- material da turma ----
      c.appendChild(el('h3', { txt: 'Material da turma' }));
      if (!d.biblioteca.length) {
        c.appendChild(el('p', { class: 'vazio', txt: 'Nada compartilhado ainda.' }));
      }
      d.biblioteca.forEach(function (b) {
        c.appendChild(el('div', { class: 'item' }, [
          el('p', { html: '<b>' + U.esc(b.titulo) + '</b>'
            + (b.compositor ? ' \\u00b7 ' + U.esc(b.compositor) : '') }),
          b.nota ? el('p', { class: 'sub', txt: b.nota }) : null,
        ]));
      });
      if (membro && (d.papel === 'gestor' || d.papel === 'professor')) {
        c.appendChild(el('div', { class: 'nota', html:
          '<b>So entra musica que e sua.</b> Cifra e partitura de terceiro nao vao para a turma: '
          + 'distribuir para trinta alunos e distribuir. Compartilhe pela Biblioteca, no botao '
          + '"Compartilhar com a escola" da musica.' }));
      }

      // ---- alunos ----
      if (membro) {
        c.appendChild(el('h3', { txt: 'Alunos (' + d.alunos.length + ')' }));
        if (!d.alunos.length) c.appendChild(el('p', { class: 'vazio', txt: 'Ninguem matriculado ainda.' }));
        d.alunos.forEach(function (a) {
          var linha = el('div', { class: 'item' }, [
            el('p', { html: '<b>' + U.esc(a.nome) + '</b>' + (a.menor ? ' \\u00b7 menor de idade' : '') }),
          ]);
          linha.appendChild(el('button', { class: 'btn sec', txt: 'Boletim', onclick: function () {
            verBoletim(id, a.aluno);
          } }));
          c.appendChild(linha);
        });

        c.appendChild(el('p', {}, [el('button', { class: 'btn sec', txt: 'Boletim da turma',
          onclick: function () { verBoletimTurma(id); } })]));

        if (d.papel === 'gestor' || d.papel === 'secretaria') {
          var me = el('input', { class: 'campo', placeholder: 'E-mails dos alunos, separados por virgula' });
          var mm = el('input', { type: 'checkbox', id: 'ehmenor' });
          var mr = el('input', { class: 'campo', placeholder: 'E-mail do responsavel' });
          mr.style.display = 'none';
          mm.onchange = function () { mr.style.display = mm.checked ? '' : 'none'; };
          c.appendChild(el('details', { class: 'criterio' }, [
            el('summary', { txt: 'Matricular alunos' }),
            me,
            el('label', { class: 'sub' }, [mm, el('span', { txt: ' Aluno menor de idade' })]),
            el('p', { class: 'sub', txt: 'Aluno menor de idade precisa de um responsavel com conta '
              + 'na plataforma (LGPD, art. 14). A conta continua sendo a do aluno; o responsavel '
              + 'acompanha o boletim.' }),
            mr,
            el('p', {}, [el('button', { class: 'btn', txt: 'Matricular', onclick: function () {
              api('POST', '/turmas/' + id + '/matriculas', { emails: me.value.split(','),
                menor: mm.checked, responsavel_email: mr.value })
                .then(function (r) {
                  if (r.nao_encontrados && r.nao_encontrados.length) {
                    aviso('Sem conta na plataforma: ' + r.nao_encontrados.join(', '));
                  }
                  if (r.ja_estavam && r.ja_estavam.length) {
                    aviso('Ja estavam na turma: ' + r.ja_estavam.join(', '));
                  }
                  verTurma(id);
                }).catch(function (e) { erro(e.message); });
            } })]),
          ]));
        }
      }
    }).catch(function (e) { erro(e.message); });
  }

  // =================================================================
  // CHAMADA — a lista inteira vai de uma vez
  // =================================================================
  function verChamada(aulaId, turmaId) {
    carregando();
    api('GET', '/aulas/' + aulaId + '/chamada').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      voltar(c, function () { verTurma(turmaId); }, 'Voltar para a turma');
      titulo(c, 'Chamada \\u00b7 ' + (data(d.aula.data) || 'sem data'),
        d.turma.nome + (d.aula.tema ? ' \\u00b7 ' + d.aula.tema : ''));

      var jaMarcado = {};
      d.presencas.forEach(function (p) { jaMarcado[p.aluno] = p; });
      var quemMarcou = d.presencas.length ? d.presencas[0] : null;
      if (quemMarcou && quemMarcou.registrado_por) {
        c.appendChild(el('p', { class: 'sub', txt: 'Chamada ja registrada em '
          + data(quemMarcou.registrado_em) + '. Salvar de novo CORRIGE o que esta aqui, nao duplica.' }));
      }

      if (!d.alunos.length) {
        c.appendChild(el('p', { class: 'vazio', txt: 'Ninguem matriculado nesta turma ainda.' }));
        return;
      }

      var escolhas = {};
      d.alunos.forEach(function (a) {
        var atual = (jaMarcado[a.aluno] || {}).estado || 'presente';
        escolhas[a.aluno] = atual;
        var botoes = el('div', { class: 'chips' });
        ESTADOS.forEach(function (e) {
          var b = el('button', {
            class: 'chip-b' + (atual === e[0] ? ' on' : ''), txt: e[1],
            onclick: function () {
              escolhas[a.aluno] = e[0];
              Array.prototype.forEach.call(botoes.children, function (x) { x.className = 'chip-b'; });
              b.className = 'chip-b on';
            },
          });
          botoes.appendChild(b);
        });
        c.appendChild(el('div', { class: 'item' }, [
          el('p', { html: '<b>' + U.esc(a.nome) + '</b>' }), botoes,
        ]));
      });

      c.appendChild(el('p', {}, [el('button', { class: 'btn', txt: 'Salvar chamada', onclick: function () {
        var marcacoes = d.alunos.map(function (a) {
          return { aluno: a.aluno, estado: escolhas[a.aluno] };
        });
        api('POST', '/aulas/' + aulaId + '/chamada', { marcacoes: marcacoes })
          .then(function (r) {
            aviso(r.marcados + ' aluno(s) marcados.');
            verTurma(turmaId);
          }).catch(function (e) { erro(e.message); });
      } })]));
    }).catch(function (e) { erro(e.message); });
  }

  // =================================================================
  // BOLETIM
  // =================================================================
  function verBoletimTurma(turmaId) {
    carregando();
    api('GET', '/turmas/' + turmaId + '/boletim').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      voltar(c, function () { verTurma(turmaId); }, 'Voltar para a turma');
      titulo(c, 'Boletim da turma', 'Media das tarefas, presenca e exercicios de cada aluno.');
      if (!d.boletim.length) {
        c.appendChild(el('p', { class: 'vazio', txt: 'Ninguem matriculado.' }));
        return;
      }
      d.boletim.forEach(function (b) {
        var linha = el('div', { class: 'item' }, [
          el('p', { html: '<b>' + U.esc(b.nome) + '</b>' + (b.menor ? ' \\u00b7 menor' : '') }),
          el('p', { class: 'sub', txt:
            'Media: ' + (b.media_geral == null ? 'sem nota ainda' : b.media_geral)
            + ' \\u00b7 Presenca: ' + (b.presenca == null ? 'sem chamada' : b.presenca + '%')
            + ' \\u00b7 ' + b.exercicios + ' exercicio(s)' }),
        ]);
        linha.onclick = function () { verBoletim(turmaId, b.aluno); };
        c.appendChild(linha);
      });
    }).catch(function (e) { erro(e.message); });
  }

  function verBoletim(turmaId, aluno, deOnde) {
    carregando();
    api('GET', '/turmas/' + turmaId + '/boletim/' + aluno).then(function (b) {
      var c = $('#corpo'); c.innerHTML = '';
      voltar(c, deOnde || function () { verTurma(turmaId); }, 'Voltar');
      titulo(c, 'Boletim \\u00b7 ' + (b.aluno_nome || ''), b.turma.nome);

      c.appendChild(el('div', { class: 'kpis', html:
        '<div class="card"><div class="nota">'
        + (b.media_geral == null ? '\\u2014' : b.media_geral)
        + '</div><div class="sub">Media das tarefas</div></div>'
        + '<div class="card"><div class="nota">'
        + (b.presenca.percentual == null ? '\\u2014' : b.presenca.percentual + '%')
        + '</div><div class="sub">Presenca</div></div>'
        + '<div class="card"><div class="nota">' + b.pratica.exercicios
        + '</div><div class="sub">Exercicios feitos</div></div>' }));

      // ---- notas ----
      c.appendChild(el('h3', { txt: 'Notas' }));
      if (!b.notas.length) {
        c.appendChild(el('p', { class: 'vazio', txt: 'Nenhuma tarefa corrigida ainda. '
          + 'Nota so aparece aqui depois de uma correcao com autor e data.' }));
      }
      b.notas.forEach(function (n) {
        c.appendChild(el('div', { class: 'item' }, [
          el('p', { html: '<b>' + U.esc(n.tarefa) + '</b> \\u00b7 ' + n.nota + ' de ' + n.de }),
          el('p', { class: 'sub', txt: 'Corrigido em ' + data(n.em)
            + (n.origem === 'revisao' ? ' \\u00b7 revisao de contestacao' : '') }),
        ]));
      });
      if (b.historico_de_notas > b.notas.length) {
        c.appendChild(el('p', { class: 'sub', txt: 'Vale a nota mais recente de cada tarefa. '
          + 'O historico guarda as ' + b.historico_de_notas + ' correcoes, inclusive as substituidas.' }));
      }

      // ---- presenca ----
      c.appendChild(el('h3', { txt: 'Presenca' }));
      var p = b.presenca;
      c.appendChild(el('div', { class: 'item' }, [
        el('p', { txt: p.presentes + ' presenca(s), ' + p.faltas + ' falta(s), '
          + p.justificadas + ' justificada(s), em ' + p.chamadas_do_aluno + ' chamada(s).' }),
        p.sem_chamada ? el('p', { class: 'sub', txt: p.sem_chamada + ' aula(s) sem chamada. '
          + 'Elas NAO contam como falta: a chamada e do professor, nao do aluno.' }) : null,
      ]));

      // ---- de onde vem cada numero ----
      c.appendChild(el('details', { class: 'criterio' }, [
        el('summary', { txt: 'De onde vem cada numero' }),
        el('p', { class: 'sub', txt: 'Media: ' + b.procedencia.media }),
        el('p', { class: 'sub', txt: 'Presenca: ' + b.procedencia.presenca }),
        el('p', { class: 'sub', txt: 'Pratica: ' + b.procedencia.pratica }),
        el('p', { class: 'sub', txt: 'Discorda de uma nota? A contestacao fica na tarefa, '
          + 'na aba Tarefas — e a revisao substitui a nota sem apagar a anterior.' }),
      ]));
    }).catch(function (e) { erro(e.message); });
  }

  // =================================================================
  // MINHAS TURMAS — a porta do aluno e do responsavel
  // =================================================================
  function verMinhasTurmas() {
    carregando();
    api('GET', '/minhas-turmas').then(function (d) {
      var c = $('#corpo'); c.innerHTML = '';
      var deps = d.dependentes || [];
      titulo(c, 'Minhas turmas', deps.length
        ? 'Onde voce estuda, e quem voce acompanha.' : 'Onde voce estuda.');
      if (!d.matriculas.length && !deps.length) {
        c.appendChild(el('div', { class: 'nota', html:
          '<b>Voce nao esta matriculado em nenhuma turma.</b><br>'
          + 'Quem matricula e a secretaria da escola, pelo e-mail da sua conta.' }));
        return;
      }

      // ---- quem eu acompanho (responsavel por menor de idade) ----
      if (deps.length) {
        c.appendChild(el('h3', { txt: 'Quem eu acompanho' }));
        deps.forEach(function (m) {
          c.appendChild(el('div', { class: 'item' }, [
            el('p', { html: '<b>' + U.esc(m.nome) + '</b> · ' + U.esc(m.turma_nome) }),
            el('p', { class: 'sub', txt: m.escola_nome }),
            el('button', { class: 'btn sec', txt: 'Ver o boletim', onclick: function () {
              verBoletim(m.turma_id, m.aluno, verMinhasTurmas);
            } }),
          ]));
        });
        if (d.matriculas.length) c.appendChild(el('h3', { txt: 'Onde eu estudo' }));
      }

      d.matriculas.forEach(function (m) {
        var box = el('div', { class: 'item' }, [
          el('h3', { txt: m.turma_nome }),
          el('p', { class: 'sub', txt: m.escola_nome
            + ' \\u00b7 desde ' + data(m.matriculado_em) }),
        ]);
        box.onclick = function () { verTurma(m.turma_id); };
        var b = el('button', { class: 'btn sec', txt: 'Meu boletim', onclick: function (ev) {
          ev.stopPropagation();
          verBoletim(m.turma_id, m.aluno, verMinhasTurmas);
        } });
        box.appendChild(b);
        c.appendChild(box);
      });
    }).catch(function (e) { erro(e.message); });
  }

  window.MusiqueEscolas = {
    verEscolas: verEscolas, verEscola: verEscola, verTurma: verTurma,
    verChamada: verChamada, verBoletim: verBoletim, verMinhasTurmas: verMinhasTurmas,
  };
})();
`;

function registrar(app) {
  app.get('/music/escolas.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .send(JS);
  });
}

module.exports = { registrar, JS };
