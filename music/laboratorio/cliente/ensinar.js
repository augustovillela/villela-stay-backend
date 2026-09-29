// =====================================================================
// Musique · Laboratório — CLIENTE · Ensinar (professor). Monta a
// atividade (do zero, de um modelo ou de uma atividade pronta), mostra a
// PRÉVIA idêntica à do aluno, atribui por e-mail ou à turma inteira,
// imprime (PDF pelo navegador) e lê o relatório. A nota é do professor,
// pela tarefa — aqui só evidência.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas, X = L.exercicios;
  var el = C.el;
  var ROT_V = { sol: 'sol', fa: 'fá', do3: 'dó (3ª linha)', do4: 'dó (4ª linha)', pauta: 'só dentro da pauta', suplementares: 'com linhas suplementares',
    violao: 'violão', ukulele: 'ukulele', cavaquinho: 'cavaquinho', baixo: 'contrabaixo' };
  var ROT_P = { clave: 'Clave', extensao: 'Extensão', instrumento: 'Instrumento' };

  F.ensinar = function (alvo) {
    var turmas = [];
    C.api('GET', '/music/api/lab/turmas').then(function (r) { turmas = r.turmas || []; }).catch(function () { turmas = []; });

    function lista() {
      C.limpar(alvo);
      alvo.appendChild(el('p', { txt: 'Carregando as suas atividades…' }));
      C.api('GET', '/music/api/lab/atividades').then(function (r) {
        C.limpar(alvo);
        alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn', txt: '+ Nova atividade', onclick: function () { nova(); } }),
          el('button', { type: 'button', class: 'btn sec', txt: 'Atividades prontas', onclick: prontas })]));
        if (!r.atividades.length) alvo.appendChild(el('p', { txt: 'Nenhuma atividade ainda. Comece de uma pronta ou monte a sua.' }));
        else alvo.appendChild(el('ul', { class: 'lab-resultados' }, r.atividades.map(function (a) {
          return el('li', {}, [el('strong', { txt: a.titulo }), ' — ' + a.config.questoes + ' questões · nível ' + a.config.nivel + ' · ' + a.alunos + ' aluno(s)', el('br'),
            el('div', { class: 'lab-acoes' }, [
              el('button', { type: 'button', class: 'btn sec', txt: 'Relatório', onclick: function () { relatorio(a.id); } }),
              el('button', { type: 'button', class: 'btn sec', txt: 'Usar como modelo', onclick: function () { nova({ titulo: a.titulo + ' (cópia)', config: a.config }); } }),
              el('button', { type: 'button', class: 'btn sec', txt: 'Atribuir a mais alunos', onclick: function () { atribuirMais(a); } }),
              el('a', { class: 'btn sec', href: '/music/atividade/' + a.id + '/imprimir', target: '_blank', rel: 'noopener', txt: 'Imprimir / PDF' })]),
            el('small', { txt: 'Link para o aluno: ' + location.origin + '/music/atividade/' + a.id })]);
        })));
      }).catch(function (e) { C.limpar(alvo); alvo.appendChild(el('p', { class: 'lab-erro', txt: e.message })); });
    }

    function atribuirMais(a) {
      C.limpar(alvo);
      var em = el('textarea', { id: 'am-e', rows: 3, class: 'lab-textarea', placeholder: 'aluno1@exemplo.com, aluno2@exemplo.com' });
      var sel = el('select', { id: 'am-t' }, [el('option', { value: '', txt: '— nenhuma —' })].concat(turmas.map(function (t) { return el('option', { value: t.id, txt: t.nome + ' · ' + t.escola + ' (' + t.alunos + ')' }); })));
      alvo.appendChild(el('h2', { txt: 'Atribuir: ' + a.titulo }));
      alvo.appendChild(el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'am-e', txt: 'E-mails' }), em]));
      if (turmas.length) alvo.appendChild(el('div', { class: 'lab-campo' }, [el('label', { for: 'am-t', txt: 'Ou a turma inteira' }), sel]));
      alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn', txt: 'Atribuir', onclick: function () {
        var ps = [];
        if (em.value.trim()) ps.push(C.api('POST', '/music/api/lab/atividades/' + a.id + '/atribuir', { emails: em.value }).then(function (x) { return x.atribuidos + ' por e-mail' + (x.nao_encontrados.length ? ' (não encontrei: ' + x.nao_encontrados.join(', ') + ')' : ''); }));
        if (sel.value) ps.push(C.api('POST', '/music/api/lab/atividades/' + a.id + '/turma', { turma_id: sel.value }).then(function (x) { return x.atribuidos + ' da turma'; }));
        Promise.all(ps).then(function (r) { C.aviso('Atribuído: ' + (r.join('; ') || 'nada a atribuir') + '.'); lista(); }).catch(function (e) { C.aviso(e.message, 'erro'); });
      } }), el('button', { type: 'button', class: 'btn sec', txt: 'Voltar', onclick: lista })]));
    }

    function prontas() {
      C.limpar(alvo);
      alvo.appendChild(el('h2', { txt: 'Atividades prontas' }));
      alvo.appendChild(el('p', { class: 'lab-dica', txt: 'Pontos de partida montados pela equipe do Musique. Escolha uma, ajuste o que quiser e atribua.' }));
      C.api('GET', '/music/api/lab/biblioteca').then(function (r) {
        alvo.appendChild(el('ul', { class: 'lab-resultados' }, r.atividades.map(function (a) {
          return el('li', {}, [el('strong', { txt: a.titulo }), ' — ' + a.questoes + ' questões: ' + a.tipos.map(function (t) { return (X.TIPOS[t] || { nome: t }).nome; }).join(', ') + ' ',
            el('button', { type: 'button', class: 'btn sec', txt: 'Usar', onclick: function () { nova({ titulo: a.titulo, config: a }); } })]);
        })));
        alvo.appendChild(el('button', { type: 'button', class: 'btn sec', txt: '← Voltar', onclick: lista }));
      }).catch(function (e) { alvo.appendChild(el('p', { class: 'lab-erro', txt: e.message })); });
    }

    function nova(base) {
      base = base || {}; var cfg = base.config || {};
      C.limpar(alvo);
      var titulo = el('input', { id: 'at-t', type: 'text', maxlength: 120, value: base.titulo || '', placeholder: 'Ex.: Intervalos — semana 3' });
      var checks = X.LISTA.map(function (x) { return el('label', { class: 'lab-check' }, [el('input', { type: 'checkbox', value: x.id, checked: (cfg.tipos || []).indexOf(x.id) >= 0 ? true : null, onchange: pintarParams }), ' ' + x.nome + (x.auditivo ? ' (auditivo)' : '')]); });
      var nivel = el('select', { id: 'at-n' }, [1, 2, 3].map(function (n) { return el('option', { value: n, selected: Number(cfg.nivel) === n ? true : null, txt: String(n) }); }));
      var qtd = el('input', { id: 'at-q', type: 'number', min: 3, max: 40, value: cfg.questoes || 10 });
      var tempo = el('input', { id: 'at-tempo', type: 'number', min: 0, max: 3600, value: cfg.tempo_s || 0 });
      var fixa = el('input', { id: 'at-f', type: 'checkbox', checked: cfg.semente_fixa === false ? null : true });
      var prazo = el('input', { id: 'at-p', type: 'date' });
      var emails = el('textarea', { id: 'at-e', rows: 3, class: 'lab-textarea', placeholder: 'aluno1@exemplo.com, aluno2@exemplo.com' });
      var turma = el('select', { id: 'at-turma' }, [el('option', { value: '', txt: '— nenhuma —' })].concat(turmas.map(function (t) { return el('option', { value: t.id, txt: t.nome + ' · ' + t.escola + ' (' + t.alunos + ' aluno(s))' }); })));
      var params = JSON.parse(JSON.stringify(cfg.params || {}));
      var caixaParams = el('div', { class: 'lab-controles' });
      var previa = el('div', { class: 'lab-previa' });
      function tiposMarcados() { return checks.map(function (c) { return C.$('input', c); }).filter(function (i) { return i.checked; }).map(function (i) { return i.value; }); }
      function pintarParams() {
        C.limpar(caixaParams);
        var decl = {};
        tiposMarcados().forEach(function (t) { var p = X.TIPOS[t].params || {}; Object.keys(p).forEach(function (k) { decl[k] = p[k]; }); });
        Object.keys(decl).forEach(function (k) {
          caixaParams.appendChild(C.select('at-p-' + k, ROT_P[k] || k, [{ valor: '', rotulo: 'variar' }].concat(decl[k].map(function (v) { return { valor: v, rotulo: ROT_V[v] || v }; })), params[k] || '', function (v) { if (v) params[k] = v; else delete params[k]; }));
        });
        caixaParams.hidden = !Object.keys(decl).length;
      }
      function dados() {
        return { titulo: titulo.value, tipos: tiposMarcados(), nivel: Number(nivel.value), questoes: Number(qtd.value), tempo_s: Number(tempo.value),
          semente_fixa: fixa.checked, prazo: prazo.value, emails: emails.value, turma_id: turma.value, params: params };
      }
      alvo.appendChild(el('form', { class: 'lab-form', onsubmit: function (e) { e.preventDefault(); } }, [
        el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'at-t', txt: 'Título' }), titulo]),
        el('fieldset', {}, [el('legend', { txt: 'Exercícios (até 6)' })].concat(checks)),
        caixaParams,
        el('div', { class: 'lab-controles' }, [el('div', { class: 'lab-campo' }, [el('label', { for: 'at-n', txt: 'Nível' }), nivel]), el('div', { class: 'lab-campo' }, [el('label', { for: 'at-q', txt: 'Questões' }), qtd]),
          el('div', { class: 'lab-campo' }, [el('label', { for: 'at-tempo', txt: 'Tempo limite (s; 0 = sem)' }), tempo]), el('div', { class: 'lab-campo' }, [el('label', { for: 'at-p', txt: 'Prazo' }), prazo])]),
        el('label', { class: 'lab-check' }, [fixa, ' Todos recebem as mesmas questões (desmarque para cada aluno receber questões próprias)']),
        turmas.length ? el('div', { class: 'lab-campo' }, [el('label', { for: 'at-turma', txt: 'Atribuir à turma inteira' }), turma]) : null,
        el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'at-e', txt: 'E-mails dos alunos (conta do Musique)' }), emails]),
        el('div', { class: 'lab-acoes' }, [
          el('button', { type: 'button', class: 'btn sec', txt: 'Pré-visualizar', onclick: function () { C.api('POST', '/music/api/lab/atividades/previa', dados()).then(function (r) { C.limpar(previa); previa.appendChild(el('h3', { txt: 'Prévia — exatamente o que o aluno verá' })); r.questoes.forEach(function (q, i) { var v = C.visualDaQuestao(q); previa.appendChild(el('div', { class: 'lab-previa-q' }, [el('p', {}, [el('strong', { txt: (i + 1) + '. ' }), q.enunciado]), v, q.opcoes ? el('p', { class: 'lab-dica', txt: 'Opções: ' + q.opcoes.map(function (o) { return o.rotulo; }).join(' · ') }) : null])); }); }).catch(function (e) { C.aviso(e.message, 'erro'); }); } }),
          el('button', { type: 'button', class: 'btn', txt: 'Criar e atribuir', onclick: function () { C.api('POST', '/music/api/lab/atividades', dados()).then(function (r) { C.aviso('Atividade criada: ' + r.atribuidos + ' aluno(s)' + (r.nao_encontrados.length ? '. Não encontrei: ' + r.nao_encontrados.join(', ') : '.')); lista(); }).catch(function (e) { C.aviso(e.message, 'erro'); }); } }),
          el('button', { type: 'button', class: 'btn sec', txt: 'Cancelar', onclick: lista })])]));
      alvo.appendChild(previa);
      pintarParams();
      titulo.focus();
    }

    function relatorio(id) {
      C.limpar(alvo);
      C.api('GET', '/music/api/lab/atividades/' + id + '/relatorio').then(function (r) {
        alvo.appendChild(el('h2', { txt: r.atividade.titulo }));
        alvo.appendChild(el('p', { class: 'lab-nota-convencao', txt: r.aviso }));
        var hab = Object.keys(r.por_habilidade);
        if (hab.length) alvo.appendChild(el('div', { class: 'lab-barras' }, hab.map(function (h) { var x = r.por_habilidade[h]; var p = Math.round(100 * x.acertos / Math.max(1, x.total)); return el('div', { class: 'lab-barra' }, [el('span', { txt: h }), el('span', { class: 'lab-barra-fundo' }, [el('span', { class: 'lab-barra-cheia', style: 'width:' + p + '%' })]), el('span', { txt: p + '% (' + x.acertos + '/' + x.total + ')' })]); })));
        var t = el('table', { class: 'lab-tabela' }, [el('caption', { txt: 'Por aluno' }), el('thead', {}, [el('tr', {}, ['Aluno', 'Respondidas', 'Acertos', 'Tempo médio', 'Erros por exercício'].map(function (c) { return el('th', { scope: 'col', txt: c }); }))]),
          el('tbody', {}, r.alunos.map(function (a) { return el('tr', {}, [el('th', { scope: 'row', txt: a.aluno }), el('td', { txt: String(a.respondidas) }), el('td', { txt: String(a.acertos) }), el('td', { txt: a.tempo_medio_s + ' s' }),
            el('td', { txt: Object.keys(a.erros_por_exercicio).map(function (k) { return (X.TIPOS[k] || { nome: k }).nome + ': ' + a.erros_por_exercicio[k]; }).join('; ') || '—' })]); }))]);
        alvo.appendChild(el('div', { class: 'lab-tabela-rolagem' }, [t]));
        alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn sec', txt: '← Voltar', onclick: lista }),
          el('button', { type: 'button', class: 'btn sec', txt: 'Exportar CSV', onclick: function () { var linhas = [['aluno', 'respondidas', 'acertos', 'tempo_medio_s']].concat(r.alunos.map(function (a) { return [a.aluno, a.respondidas, a.acertos, a.tempo_medio_s]; })); C.baixar('relatorio-atividade.csv', 'text/csv', linhas.map(function (l) { return l.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n')); } }),
          el('a', { href: '/music/app', txt: 'Dar nota pela tarefa →' })]));
      }).catch(function (e) { alvo.appendChild(el('p', { class: 'lab-erro', txt: e.message })); });
    }
    lista();
  };
})(window, document);
