// =====================================================================
// Musique · Laboratório — CLIENTE · Ensinar (professor). Monta a
// atividade, mostra a PRÉVIA idêntica à do aluno, atribui por e-mail e
// lê o relatório. Nota é do professor, pela tarefa — aqui só evidência.
// =====================================================================
(function (w, d) {
  'use strict';
  var L = w.MusiqueLab, C = L.cliente, F = C.ferramentas, X = L.exercicios;
  var el = C.el;

  F.ensinar = function (alvo) {
    function lista() {
      C.limpar(alvo);
      alvo.appendChild(el('p', { txt: 'Carregando as suas atividades…' }));
      C.api('GET', '/music/api/lab/atividades').then(function (r) {
        C.limpar(alvo);
        alvo.appendChild(el('div', { class: 'lab-acoes' }, [el('button', { type: 'button', class: 'btn', txt: '+ Nova atividade', onclick: nova })]));
        if (!r.atividades.length) alvo.appendChild(el('p', { txt: 'Nenhuma atividade ainda.' }));
        else alvo.appendChild(el('ul', { class: 'lab-resultados' }, r.atividades.map(function (a) {
          return el('li', {}, [el('strong', { txt: a.titulo }), ' — ' + a.config.questoes + ' questões · nível ' + a.config.nivel + ' · ' + a.alunos + ' aluno(s) ',
            el('button', { type: 'button', class: 'btn sec', txt: 'Relatório', onclick: function () { relatorio(a.id); } }),
            el('button', { type: 'button', class: 'btn sec', txt: 'Atribuir a mais alunos', onclick: function () { var e = w.prompt('E-mails dos alunos (separados por vírgula):'); if (e) C.api('POST', '/music/api/lab/atividades/' + a.id + '/atribuir', { emails: e }).then(function (x) { C.aviso(x.atribuidos + ' atribuído(s)' + (x.nao_encontrados.length ? '; não encontrei: ' + x.nao_encontrados.join(', ') : '')); lista(); }).catch(function (er) { C.aviso(er.message, 'erro'); }); } }),
            el('br'), el('small', { txt: 'Link para o aluno: ' + location.origin + '/music/atividade/' + a.id })]);
        })));
      }).catch(function (e) { C.limpar(alvo); alvo.appendChild(el('p', { class: 'lab-erro', txt: e.message })); });
    }

    function nova() {
      C.limpar(alvo);
      var titulo = el('input', { id: 'at-t', type: 'text', maxlength: 120, placeholder: 'Ex.: Intervalos — semana 3' });
      var checks = X.LISTA.map(function (x) { return el('label', { class: 'lab-check' }, [el('input', { type: 'checkbox', value: x.id }), ' ' + x.nome + (x.auditivo ? ' (auditivo)' : '')]); });
      var nivel = el('select', { id: 'at-n' }, [1, 2, 3].map(function (n) { return el('option', { value: n, txt: String(n) }); }));
      var qtd = el('input', { id: 'at-q', type: 'number', min: 3, max: 40, value: 10 });
      var tempo = el('input', { id: 'at-tempo', type: 'number', min: 0, max: 3600, value: 0 });
      var fixa = el('input', { id: 'at-f', type: 'checkbox', checked: true });
      var prazo = el('input', { id: 'at-p', type: 'date' });
      var emails = el('textarea', { id: 'at-e', rows: 3, class: 'lab-textarea', placeholder: 'aluno1@exemplo.com, aluno2@exemplo.com' });
      var previa = el('div', { class: 'lab-previa' });
      function dados() {
        return { titulo: titulo.value, tipos: checks.map(function (c) { return C.$('input', c); }).filter(function (i) { return i.checked; }).map(function (i) { return i.value; }),
          nivel: Number(nivel.value), questoes: Number(qtd.value), tempo_s: Number(tempo.value), semente_fixa: fixa.checked, prazo: prazo.value, emails: emails.value };
      }
      alvo.appendChild(el('form', { class: 'lab-form', onsubmit: function (e) { e.preventDefault(); } }, [
        el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'at-t', txt: 'Título' }), titulo]),
        el('fieldset', {}, [el('legend', { txt: 'Exercícios (até 6)' })].concat(checks)),
        el('div', { class: 'lab-controles' }, [el('div', { class: 'lab-campo' }, [el('label', { for: 'at-n', txt: 'Nível' }), nivel]), el('div', { class: 'lab-campo' }, [el('label', { for: 'at-q', txt: 'Questões' }), qtd]),
          el('div', { class: 'lab-campo' }, [el('label', { for: 'at-tempo', txt: 'Tempo limite (s; 0 = sem)' }), tempo]), el('div', { class: 'lab-campo' }, [el('label', { for: 'at-p', txt: 'Prazo' }), prazo])]),
        el('label', { class: 'lab-check' }, [fixa, ' Todos recebem as mesmas questões (desmarque para cada aluno receber questões próprias)']),
        el('div', { class: 'lab-campo lab-campo-largo' }, [el('label', { for: 'at-e', txt: 'E-mails dos alunos (conta do Musique)' }), emails]),
        el('div', { class: 'lab-acoes' }, [
          el('button', { type: 'button', class: 'btn sec', txt: 'Pré-visualizar', onclick: function () { C.api('POST', '/music/api/lab/atividades/previa', dados()).then(function (r) { C.limpar(previa); previa.appendChild(el('h3', { txt: 'Prévia — exatamente o que o aluno verá' })); r.questoes.forEach(function (q, i) { var v = C.visualDaQuestao(q); previa.appendChild(el('div', { class: 'lab-previa-q' }, [el('p', {}, [el('strong', { txt: (i + 1) + '. ' }), q.enunciado]), v, q.opcoes ? el('p', { class: 'lab-dica', txt: 'Opções: ' + q.opcoes.map(function (o) { return o.rotulo; }).join(' · ') }) : null])); }); }).catch(function (e) { C.aviso(e.message, 'erro'); }); } }),
          el('button', { type: 'button', class: 'btn', txt: 'Criar e atribuir', onclick: function () { C.api('POST', '/music/api/lab/atividades', dados()).then(function (r) { C.aviso('Atividade criada: ' + r.atribuidos + ' aluno(s)' + (r.nao_encontrados.length ? '. Não encontrei: ' + r.nao_encontrados.join(', ') : '.')); lista(); }).catch(function (e) { C.aviso(e.message, 'erro'); }); } }),
          el('button', { type: 'button', class: 'btn sec', txt: 'Cancelar', onclick: lista })])]));
      alvo.appendChild(previa);
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
