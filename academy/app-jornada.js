/* =====================================================================
 * Villela Academy — JORNADA DO ALUNO (fases 2 e 3), montada pelo estúdio
 * (app-aluno.js), que injeta as dependências. Tudo que é do CURSO inteiro:
 * nível e XP, selos, diagnóstico e teste final, Villela Lab, desafio,
 * simulações, ferramentas (Prompt Builder, gerador de agentes) e recursos.
 * O gabarito e as consequências ficam no servidor — aqui só se pergunta,
 * responde e mostra. JS clássico (var/function), sem build.
 * ===================================================================== */
(function () {
  'use strict';

  window.AcademyJornada = function (D) {
    var api = D.api, esc = D.esc, el = D.el, setView = D.setView, erroBox = D.erroBox, copiar = D.copiar;
    var J = { pid: '', titulo: '', painel: null, aba: 'visao' };

    function pref(k, v) { // rascunho local das ferramentas (conveniência; o navegador pode negar)
      try { if (v === undefined) return localStorage.getItem('jr-' + k); localStorage.setItem('jr-' + k, v); } catch (e) { return null; }
    }
    function barra(pct) { return '<div class="jr-barra"><i style="width:' + Math.max(0, Math.min(100, Number(pct) || 0)) + '%"></i></div>'; }
    function falha(alvo, e) { alvo.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
    var NIVEL_COR = ['', '#64748b', '#0e7490', '#159A78', '#B45309', '#7c3aed'];

    // ---------------- cartão no cabeçalho do estúdio ----------------
    function cartao(alvo, pid, painel, abrir) {
      if (!alvo) return;
      // só aparece quando o curso tem jornada PUBLICADA (ou para o dono, que revisa o rascunho)
      if (!painel || !painel.acesso || !Object.keys(painel.secoes || {}).length) { alvo.innerHTML = ''; return; }
      var p = painel, pctProx = p.proximo ? Math.round((p.xp - (p.niveis[p.nivel.n - 1] || { xp: 0 }).xp) * 100 / Math.max(1, p.proximo.xp - (p.niveis[p.nivel.n - 1] || { xp: 0 }).xp)) : 100;
      var botoes = [['visao', '🏅 Minha jornada']];
      if (p.secoes.avaliacao) botoes.push(['avaliacao', p.avaliacao && p.avaliacao.diagnostico ? '📈 Teste final' : '🧭 Diagnóstico']);
      if (p.secoes.lab) botoes.push(['lab', '🧪 Villela Lab']);
      if (p.secoes.desafio) botoes.push(['desafio', '🔥 ' + (p.desafio ? p.desafio.titulo : 'Desafio')]);
      if (p.secoes.simulacoes) botoes.push(['simulacoes', '🎯 Simulações']);
      botoes.push(['ferramentas', '🛠️ Ferramentas']);
      if (p.secoes.recursos) botoes.push(['recursos', '📄 Cheat sheets e templates']);
      var selos = p.selos || [], conq = selos.filter(function (x) { return x.conquistado; }).length;
      alvo.innerHTML = '<div class="jr-cartao">' +
        '<button class="jr-nivel" data-jr="visao" style="--cor:' + NIVEL_COR[p.nivel.n] + '"><span class="jr-anel"><b>' + p.nivel.n + '</b></span>' +
        '<span class="jr-nv-txt"><small>Nível ' + p.nivel.n + '</small><b>' + esc(p.nivel.nome) + '</b>' +
        '<span class="jr-xp">' + p.xp + ' XP' + (p.proximo ? ' · faltam ' + Math.max(0, p.proximo.xp - p.xp) + ' para ' + esc(p.proximo.nome) : ' · nível máximo') + '</span>' +
        barra(pctProx) + '</span></button>' +
        (selos.length ? '<div class="jr-selos-mini" title="Selos de competência">' + selos.map(function (x) {
          return '<span class="jr-sm' + (x.conquistado ? ' on' : '') + '" title="' + esc(x.nome + (x.conquistado ? ' — conquistado' : ' — ' + x.feitos + '/' + x.total + ' quizzes')) + '">' + esc(x.icone || '★') + '</span>';
        }).join('') + '<small>' + conq + '/' + selos.length + ' selos</small></div>' : '') +
        '<div class="jr-atalhos">' + botoes.map(function (b) { return '<button class="al-bt peq fan" data-jr="' + b[0] + '">' + esc(b[1]) + '</button>'; }).join('') + '</div>' +
        (p.revisor && Object.keys(p.secoes).some(function (k) { return p.secoes[k] === 'rascunho'; }) ? '<p class="jr-rasc">Algumas seções estão em rascunho — só você vê.</p>' : '') +
        '</div>';
      Array.prototype.forEach.call(alvo.querySelectorAll('[data-jr]'), function (b) { b.onclick = function () { abrir(b.getAttribute('data-jr')); }; });
    }

    // ---------------- tela da jornada ----------------
    function abrir(pid, titulo, aba, voltar, irAula) {
      J.pid = pid; J.titulo = titulo; J.voltar = voltar; J.irAula = irAula; J.aba = aba || 'visao';
      setView('<div class="al jr"><a href="#" class="al-volta" id="jr-volta">← Voltar às aulas</a>' +
        '<div class="jr-cab"><p class="al-rotulo">Jornada do curso</p><h2>' + esc(titulo) + '</h2></div>' +
        '<div class="est-abas jr-abas" id="jr-abas"></div><div class="jr-corpo" id="jr-corpo"><p class="al-sub">Carregando…</p></div></div>');
      el('jr-volta').onclick = function (e) { e.preventDefault(); voltar(); };
      window.scrollTo(0, 0);
      api('GET', '/aluno/cursos/' + pid + '/jornada').then(function (p) {
        J.painel = p;
        if (!p.acesso) { el('jr-corpo').innerHTML = '<p class="al-sub">A jornada é para quem tem acesso ao curso.</p>'; return; }
        abas();
        ir(J.aba);
      }).catch(function (e) { falha(el('jr-corpo'), e); });
    }
    function abas() {
      var p = J.painel, s = p.secoes, lista = [['visao', 'Minha jornada']];
      if (s.avaliacao) lista.push(['avaliacao', 'Diagnóstico e teste final']);
      if (s.lab) lista.push(['lab', 'Villela Lab']);
      if (s.desafio) lista.push(['desafio', p.desafio ? p.desafio.titulo : 'Desafio']);
      if (s.simulacoes) lista.push(['simulacoes', 'Simulações']);
      lista.push(['ferramentas', 'Ferramentas']);
      if (s.recursos) lista.push(['recursos', 'Cheat sheets e templates']);
      el('jr-abas').innerHTML = lista.map(function (x) {
        return '<button data-a="' + x[0] + '"' + (x[0] === J.aba ? ' class="on"' : '') + '>' + esc(x[1]) +
          (s[x[0]] === 'rascunho' ? ' <span class="marca-rasc">rascunho</span>' : '') + '</button>';
      }).join('');
      Array.prototype.forEach.call(el('jr-abas').querySelectorAll('button'), function (b) { b.onclick = function () { ir(b.getAttribute('data-a')); }; });
    }
    function ir(aba) {
      J.aba = aba;
      Array.prototype.forEach.call(el('jr-abas').querySelectorAll('button'), function (b) { b.classList.toggle('on', b.getAttribute('data-a') === aba); });
      var alvo = el('jr-corpo');
      alvo.innerHTML = '<p class="al-sub">Carregando…</p>';
      ({ visao: visao, avaliacao: avaliacao, lab: lab, desafio: desafio, simulacoes: simulacoes, ferramentas: ferramentas, recursos: recursos }[aba] || visao)(alvo);
    }
    function recarregarPainel(depois) {
      api('GET', '/aluno/cursos/' + J.pid + '/jornada').then(function (p) { J.painel = p; if (depois) depois(); }).catch(function () {});
    }

    // ================= VISÃO: nível, XP, selos, medalhas, antes/depois =================
    function visao(alvo) {
      var p = J.painel;
      var ant = p.niveis[p.nivel.n - 1] || { xp: 0 };
      var pct = p.proximo ? Math.round((p.xp - ant.xp) * 100 / Math.max(1, p.proximo.xp - ant.xp)) : 100;
      var h = '<div class="jr-topo"><div class="jr-nivel grande" style="--cor:' + NIVEL_COR[p.nivel.n] + '"><span class="jr-anel"><b>' + p.nivel.n + '</b></span>' +
        '<span class="jr-nv-txt"><small>Seu nível</small><b>' + esc(p.nivel.nome) + '</b><span class="jr-xp">' + p.xp + ' de ' + p.xp_max + ' XP possíveis</span>' + barra(pct) +
        '<span class="al-fino">' + (p.proximo ? 'Faltam ' + Math.max(0, p.proximo.xp - p.xp) + ' XP para ' + esc(p.proximo.nome) : 'Você chegou ao nível máximo. 🎉') + '</span></span></div>' +
        '<ol class="jr-trilha">' + p.niveis.map(function (n) {
          return '<li class="' + (n.n <= p.nivel.n ? 'feito' : '') + '"><b>' + n.n + '</b><span>' + esc(n.nome) + '</span><small>' + n.xp + ' XP</small></li>';
        }).join('') + '</ol></div>';
      if (p.avaliacao && (p.avaliacao.diagnostico || p.avaliacao.final)) {
        var d = p.avaliacao.diagnostico, f = p.avaliacao.final;
        h += '<div class="jr-caixa"><h3>Sua evolução</h3><div class="jr-antes-depois">' +
          '<div><small>Antes do curso</small><b>' + (d ? d.pct + '/100' : '—') + '</b><span>' + (d ? esc(d.nivel) : 'faça o diagnóstico') + '</span>' + barra(d ? d.pct : 0) + '</div>' +
          '<div class="dep"><small>Depois do curso</small><b>' + (f ? f.pct + '/100' : '—') + '</b><span>' + (f ? esc(f.nivel) : 'teste final ainda não feito') + '</span>' + barra(f ? f.pct : 0) + '</div>' +
          (d && f ? '<div class="ganho"><b>' + (f.pct - d.pct >= 0 ? '+' : '') + (f.pct - d.pct) + '</b><small>pontos</small></div>' : '') + '</div></div>';
      }
      if ((p.selos || []).length) {
        h += '<div class="jr-caixa"><h3>Selos de competência</h3><p class="al-sub">Cada selo sai quando você é aprovado (70% ou mais) em todos os quizzes das aulas daquela competência. Os selos conquistados aparecem no seu certificado.</p><div class="jr-selos">' +
          p.selos.map(function (x) {
            return '<div class="jr-selo' + (x.conquistado ? ' on' : '') + '"><span class="ic">' + esc(x.icone || '★') + '</span><b>' + esc(x.nome) + '</b>' +
              (x.descricao ? '<small>' + esc(x.descricao) + '</small>' : '') +
              '<span class="st">' + (x.conquistado ? 'Conquistado' : x.feitos + ' de ' + x.total + ' quizzes') + '</span>' + (x.conquistado ? '' : barra(x.total ? x.feitos * 100 / x.total : 0)) + '</div>';
          }).join('') + '</div></div>';
      }
      if ((p.medalhas || []).length) {
        h += '<div class="jr-caixa"><h3>Medalhas</h3><div class="jr-medalhas">' + p.medalhas.map(function (m) {
          return '<div class="jr-med' + (m.ok ? ' on' : '') + '"><span>' + (m.ok ? '🏅' : '🔒') + '</span><b>' + esc(m.nome) + '</b><small>' + esc(m.desc) + '</small></div>';
        }).join('') + '</div></div>';
      }
      h += '<div class="jr-caixa"><h3>De onde vem o seu XP</h3><table class="jr-fontes">' + p.fontes.map(function (f) {
        return '<tr><td>' + esc(f.nome) + '</td><td>' + barra(f.max ? f.xp * 100 / f.max : 0) + '</td><td class="n">' + f.xp + ' / ' + f.max + '</td></tr>';
      }).join('') + '</table></div>';
      alvo.innerHTML = h;
    }

    // ================= AVALIAÇÃO: diagnóstico e teste final =================
    function avaliacao(alvo) {
      api('GET', '/aluno/cursos/' + J.pid + '/avaliacao').then(function (r) {
        var e = r.estado;
        if (!e) { alvo.innerHTML = '<p class="al-sub">Este curso ainda não tem a avaliação.</p>'; return; }
        var h = '<div class="jr-caixa"><h3>' + esc(e.titulo) + (e.status === 'rascunho' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : '') + '</h3>' +
          (e.descricao ? '<p class="al-sub">' + esc(e.descricao) + '</p>' : '') +
          '<div class="jr-dois">' +
          '<div class="jr-passo' + (e.diagnostico ? ' feito' : '') + '"><small>1 · Antes do curso</small><b>Diagnóstico</b>' +
          (e.diagnostico ? '<p><span class="jr-num">' + e.diagnostico.pct + '/100</span> · ' + esc(e.diagnostico.nivel) + '</p>'
            : '<p class="al-sub">' + e.questoes + ' perguntas, uns 10 minutos. Mostra o seu ponto de partida e as aulas que mais vão ajudar você. Faz-se uma vez.</p><button class="al-bt" id="jr-diag">Começar o diagnóstico</button>') + '</div>' +
          '<div class="jr-passo' + (e.final ? ' feito' : '') + '"><small>2 · Depois do curso</small><b>Teste final</b>' +
          (e.final ? '<p><span class="jr-num">' + e.final.pct + '/100</span> · ' + esc(e.final.nivel) + '</p>' : '') +
          (e.final_liberado ? '<button class="al-bt' + (e.final ? ' fan' : '') + '" id="jr-final">' + (e.final ? 'Refazer o teste final' : 'Fazer o teste final') + '</button>'
            : '<p class="al-sub">Abre quando você concluir ' + e.final_exige_pct + '% das aulas. Você está em ' + e.progresso_pct + '%.</p>' + barra(e.progresso_pct * 100 / e.final_exige_pct)) + '</div>' +
          '</div></div><div id="jr-aval"></div>';
        alvo.innerHTML = h;
        if (el('jr-diag')) el('jr-diag').onclick = function () { prova('diagnostico'); };
        if (el('jr-final')) el('jr-final').onclick = function () { prova('final'); };
      }).catch(function (e) { falha(alvo, e); });
    }
    var TIPO_Q = { conhecimento: 'Conhecimento', aplicacao: 'Aplicação', decisao: 'Decisão' };
    function prova(momento) {
      var alvo = el('jr-aval');
      alvo.innerHTML = '<p class="al-sub">Carregando…</p>';
      api('GET', '/aluno/cursos/' + J.pid + '/avaliacao/' + momento).then(function (q) {
        alvo.innerHTML = '<div class="jr-caixa"><h3>' + (momento === 'final' ? 'Teste final' : 'Diagnóstico') + '</h3><p class="al-sub">Responda com sinceridade — é para medir, não para passar.</p>' +
          q.questoes.map(function (x, i) {
            return '<fieldset class="qz" data-q="' + esc(x.id) + '"><legend><span class="qz-tipo ' + esc(x.tipo) + '">' + (TIPO_Q[x.tipo] || x.tipo) + '</span> ' + (i + 1) + '. ' + esc(x.enunciado) + '</legend>' +
              x.alternativas.map(function (t, k) {
                return '<label class="qz-alt"><input type="radio" name="av-' + esc(x.id) + '" value="' + k + '"><span>' + esc(t) + '</span></label><div class="qz-exp" data-exp="' + esc(x.id) + '-' + k + '"></div>';
              }).join('') + '</fieldset>';
          }).join('') + '<div class="qz-rodape"><button class="al-bt" id="av-enviar">Ver o meu resultado</button><span id="av-res" class="qz-res"></span></div></div>';
        if (alvo.scrollIntoView) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el('av-enviar').onclick = function () {
          var resp = {}, falta = 0, bt = this;
          q.questoes.forEach(function (x) { var m = alvo.querySelector('input[name="av-' + x.id + '"]:checked'); if (m) resp[x.id] = Number(m.value); else falta++; });
          if (falta) { el('av-res').innerHTML = '<span class="erro">Faltam ' + falta + '.</span>'; return; }
          bt.disabled = true;
          api('POST', '/aluno/cursos/' + J.pid + '/avaliacao/' + momento, { respostas: resp }).then(function (r) {
            r.correcao.forEach(function (c) {
              var fs = alvo.querySelector('fieldset[data-q="' + c.id + '"]');
              Array.prototype.forEach.call(fs.querySelectorAll('.qz-alt'), function (lb, k) {
                lb.classList.toggle('certa', k === c.correta); lb.classList.toggle('errada', k === c.escolhida && !c.acertou);
                lb.querySelector('input').disabled = true;
              });
              c.explicacoes.forEach(function (ex, k) {
                var d = fs.querySelector('[data-exp="' + c.id + '-' + k + '"]');
                if (d && (k === c.correta || k === c.escolhida)) d.innerHTML = (k === c.correta ? '✔ ' : '✖ ') + esc(ex);
              });
              fs.classList.add(c.acertou ? 'ok' : 'nok');
            });
            bt.style.display = 'none'; el('av-res').innerHTML = '';
            resultado(alvo, r);
            recarregarPainel();
          }).catch(function (e) { bt.disabled = false; el('av-res').innerHTML = '<span class="erro">' + esc(e.message) + '</span>'; });
        };
      }).catch(function (e) { falha(alvo, e); });
    }
    function resultado(alvo, r) {
      var comps = (J.painel && J.painel.selos) || [];
      var nome = function (id) { for (var k = 0; k < comps.length; k++) if (comps[k].id === id) return comps[k].nome; return id === '_geral' ? 'Geral' : id; };
      var box = document.createElement('div');
      box.className = 'jr-caixa jr-resultado';
      box.innerHTML = '<h3>' + (r.momento === 'final' ? 'Resultado do teste final' : 'O seu ponto de partida') + '</h3>' +
        '<div class="jr-placar"><span class="jr-num grande">' + r.pct + '<small>/100</small></span><span><b>' + esc(r.nivel) + '</b><small>' + r.acertos + ' de ' + r.total + ' acertos</small></span>' +
        (r.antes ? '<span class="jr-ganho"><small>Antes: ' + r.antes.pct + '/100</small><b>' + (r.pct - r.antes.pct >= 0 ? '+' : '') + (r.pct - r.antes.pct) + ' pontos</b></span>' : '') + '</div>' +
        '<h4>Por competência</h4><table class="jr-fontes">' + Object.keys(r.por_competencia).map(function (k) {
          var c = r.por_competencia[k];
          return '<tr><td>' + esc(nome(k)) + '</td><td>' + barra(c.pct) + '</td><td class="n">' + c.pct + '%</td></tr>';
        }).join('') + '</table>' +
        ((r.recomendacao || []).length ? '<h4>Sua trilha recomendada</h4><p class="al-sub">Comece por estas aulas — é onde o curso mais vai somar para você.</p>' +
          r.recomendacao.map(function (x) {
            return '<div class="jr-rec"><b>' + esc(x.nome) + '</b> <small>(' + x.pct + '%)</small><div>' + x.aulas.map(function (a) {
              return '<button class="al-bt peq fan" data-aula="' + esc(a.id) + '">▶ ' + esc(a.titulo) + '</button>';
            }).join('') + '</div></div>';
          }).join('') : '<p class="al-sub">Você foi bem em todas as competências. Siga o curso na ordem e aproveite o Lab e as simulações.</p>');
      alvo.insertBefore(box, alvo.firstChild);
      Array.prototype.forEach.call(box.querySelectorAll('[data-aula]'), function (b) { b.onclick = function () { J.irAula(b.getAttribute('data-aula')); }; });
      if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ================= VILLELA LAB =================
    function lab(alvo) {
      api('GET', '/aluno/cursos/' + J.pid + '/lab').then(function (r) {
        var ms = r.missoes || [], en = r.entregas || {};
        var estado = function (m) { var e = en[m.id]; return !e ? ['Não iniciada', ''] : (e.feedback ? ['Avaliada pelo mentor', 'ok'] : (e.entregue_em ? ['Entregue', 'ok'] : ['Em andamento', 'and'])); };
        var cardM = function (m) {
          var st = estado(m);
          return '<button class="jr-missao' + (m.tipo === 'projeto' ? ' projeto' : '') + '" data-m="' + esc(m.id) + '"><span class="jr-m-tipo">' + (m.tipo === 'projeto' ? '🏆 Projeto final' : '🧪 Missão') + '</span>' +
            '<b>' + esc(m.titulo) + '</b><small>' + esc(m.objetivo || '') + '</small><span class="jr-st ' + st[1] + '">' + st[0] + (m.tempo ? ' · ' + esc(m.tempo) : '') + '</span></button>';
        };
        alvo.innerHTML = '<div class="jr-caixa"><h3>Villela Lab' + (r.status === 'rascunho' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : '') + '</h3>' +
          '<p class="al-sub">Aqui você não assiste: executa. Cada missão é um trabalho real, com o que entregar e como se avaliar. O mentor de IA lê a sua entrega pela rubrica e aponta o que melhorar.</p>' +
          '<div class="jr-missoes">' + ms.filter(function (m) { return m.tipo !== 'projeto'; }).map(cardM).join('') + '</div>' +
          (ms.some(function (m) { return m.tipo === 'projeto'; }) ? '<h4 style="margin-top:18px">Projeto final</h4><div class="jr-missoes">' + ms.filter(function (m) { return m.tipo === 'projeto'; }).map(cardM).join('') + '</div>' : '') +
          '</div><div id="jr-missao"></div>';
        Array.prototype.forEach.call(alvo.querySelectorAll('[data-m]'), function (b) {
          b.onclick = function () { var m = ms.filter(function (x) { return x.id === b.getAttribute('data-m'); })[0]; missao(m, en[m.id] || null); };
        });
      }).catch(function (e) { falha(alvo, e); });
    }
    function missao(m, e) {
      var alvo = el('jr-missao'), resp = (e && e.respostas) || {};
      var AV = { atende: ['✔', 'Atende'], parcial: ['◐', 'Parcial'], nao_atende: ['✖', 'Ainda não'] };
      var fbHtml = function (fb) {
        if (!fb) return '';
        return '<div class="jr-mentor"><h4>🧭 Avaliação do mentor <small>(indicação para você melhorar — não é nota)</small></h4>' +
          (fb.resumo ? '<p>' + esc(fb.resumo) + '</p>' : '') +
          '<ul class="jr-crit">' + (fb.criterios || []).map(function (c) {
            var a = AV[c.avaliacao] || AV.parcial;
            return '<li class="' + c.avaliacao + '"><span>' + a[0] + '</span><b>' + esc(c.criterio) + '</b> — ' + a[1] + '<br><small>' + esc(c.comentario) + '</small></li>';
          }).join('') + '</ul>' +
          ((fb.pontos_fortes || []).length ? '<p><b>Pontos fortes:</b> ' + fb.pontos_fortes.map(esc).join(' · ') + '</p>' : '') +
          ((fb.melhorias || []).length ? '<p><b>Para melhorar:</b></p><ul>' + fb.melhorias.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
          (fb.proximo_passo ? '<p><b>Próximo passo:</b> ' + esc(fb.proximo_passo) + '</p>' : '') + '</div>';
      };
      alvo.innerHTML = '<div class="jr-caixa jr-m-det"><p class="al-rotulo">' + (m.tipo === 'projeto' ? 'Projeto final' : 'Missão') + (m.aula_ref ? ' · ' + esc(m.aula_ref) : '') + '</p><h3>' + esc(m.titulo) + '</h3>' +
        (m.contexto ? '<p>' + esc(m.contexto) + '</p>' : '') + (m.objetivo ? '<p><b>Objetivo.</b> ' + esc(m.objetivo) + '</p>' : '') +
        ((m.passos || []).length ? '<h4>Passo a passo</h4><ol>' + m.passos.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '') +
        '<h4>Sua entrega</h4>' + m.entregaveis.map(function (x) {
          return '<label class="jr-ent"><b>' + esc(x.rotulo) + '</b>' + (x.dica ? '<small>' + esc(x.dica) + '</small>' : '') +
            '<textarea rows="5" data-e="' + esc(x.id) + '">' + esc(resp[x.id] || '') + '</textarea></label>';
        }).join('') +
        '<h4>Rubrica — como a entrega é avaliada</h4><ul class="jr-rub">' + m.rubrica.map(function (r) { return '<li><b>' + esc(r.criterio) + '</b>' + (r.descricao ? ' — ' + esc(r.descricao) : '') + '</li>'; }).join('') + '</ul>' +
        '<div class="qz-rodape"><button class="al-bt" id="jr-entregar">' + (e && e.entregue_em ? '✓ Entregue — salvar alterações' : 'Entregar') + '</button>' +
        '<button class="al-bt fan" id="jr-mentor"' + (e && e.entregue_em ? '' : ' disabled title="Entregue primeiro"') + '>🧭 Pedir avaliação do mentor</button>' +
        '<span id="jr-m-msg" class="al-fino"></span></div>' +
        '<p class="al-fino">Não coloque dados pessoais de clientes ou terceiros (CPF, telefone, nome): anonimize.</p>' +
        '<div id="jr-fb">' + fbHtml(e && e.feedback) + '</div></div>';
      if (alvo.scrollIntoView) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var timer = null;
      var coletar = function () { var r = {}; Array.prototype.forEach.call(alvo.querySelectorAll('textarea[data-e]'), function (t) { r[t.getAttribute('data-e')] = t.value; }); return r; };
      var salvar = function () {
        el('jr-m-msg').textContent = 'Salvando…';
        return api('PUT', '/aluno/cursos/' + J.pid + '/lab/' + m.id, { respostas: coletar() }).then(function () { el('jr-m-msg').textContent = '✓ Salvo'; });
      };
      Array.prototype.forEach.call(alvo.querySelectorAll('textarea[data-e]'), function (t) {
        t.oninput = function () { clearTimeout(timer); timer = setTimeout(function () { salvar().catch(function (er) { el('jr-m-msg').textContent = er.message; }); }, 1000); };
      });
      el('jr-entregar').onclick = function () {
        clearTimeout(timer);
        salvar().then(function () { return api('POST', '/aluno/cursos/' + J.pid + '/lab/' + m.id + '/entregar'); }).then(function () {
          el('jr-m-msg').textContent = '✓ Missão entregue. Peça a avaliação do mentor para ver o que melhorar.';
          el('jr-entregar').textContent = '✓ Entregue — salvar alterações';
          el('jr-mentor').disabled = false; el('jr-mentor').removeAttribute('title');
          recarregarPainel();
        }).catch(function (er) { el('jr-m-msg').innerHTML = '<span class="erro">' + esc(er.message) + '</span>'; });
      };
      el('jr-mentor').onclick = function () {
        var bt = this; bt.disabled = true; el('jr-m-msg').textContent = 'O mentor está lendo a sua entrega…';
        clearTimeout(timer);
        salvar().then(function () { return api('POST', '/aluno/cursos/' + J.pid + '/lab/' + m.id + '/mentor'); }).then(function (r) {
          el('jr-fb').innerHTML = fbHtml(r.feedback);
          el('jr-m-msg').textContent = r.restantes + ' consulta(s) de IA restante(s) hoje.';
        }).catch(function (er) { el('jr-m-msg').innerHTML = '<span class="erro">' + esc(er.message) + '</span>'; }).then(function () { bt.disabled = false; });
      };
    }

    // ================= DESAFIO =================
    function desafio(alvo, focoDia) {
      api('GET', '/aluno/cursos/' + J.pid + '/desafio').then(function (d) { pintarDesafio(alvo, d, focoDia); }).catch(function (e) { falha(alvo, e); });
    }
    function pintarDesafio(alvo, d, focoDia) {
      var rasc = d.status === 'rascunho' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : '';
      if (!d.iniciado_em) {
        alvo.innerHTML = '<div class="jr-caixa jr-des-intro"><h3>🔥 ' + esc(d.titulo) + rasc + '</h3>' + (d.descricao ? '<p>' + esc(d.descricao) + '</p>' : '') +
          '<p class="al-sub">Uma tarefa curta por dia, ' + d.total + ' dias. Cada dia abre no dia seguinte ao anterior — é assim que vira hábito.</p>' +
          '<ol class="jr-des-prev">' + d.dias.slice(0, 5).map(function (x) { return '<li><b>Dia ' + x.dia + '</b> ' + esc(x.titulo) + '</li>'; }).join('') + '<li>…</li></ol>' +
          '<button class="al-bt" id="jr-des-ini">Começar hoje</button></div>';
        el('jr-des-ini').onclick = function () { api('POST', '/aluno/cursos/' + J.pid + '/desafio/iniciar').then(function (x) { pintarDesafio(alvo, x); recarregarPainel(); }).catch(function (e) { falha(alvo, e); }); };
        return;
      }
      var foco = focoDia || null;
      if (!foco) { for (var k = 0; k < d.dias.length; k++) if (d.dias[k].liberado && !d.dias[k].feito) { foco = d.dias[k].dia; break; } }
      if (!foco) foco = Math.max(1, Math.min(d.dia_atual, d.total));
      var dia = d.dias[foco - 1];
      alvo.innerHTML = '<div class="jr-caixa"><h3>🔥 ' + esc(d.titulo) + rasc + '</h3><p class="al-sub">Começou em ' + d.iniciado_em.split('-').reverse().join('/') + ' · ' + d.feitos + ' de ' + d.total + ' dias feitos</p>' + barra(d.feitos * 100 / d.total) +
        '<div class="jr-dias">' + d.dias.map(function (x) {
          return '<button class="jr-dia' + (x.feito ? ' feito' : '') + (x.liberado ? '' : ' trav') + (x.dia === foco ? ' foco' : '') + '" data-d="' + x.dia + '"' + (x.liberado ? '' : ' disabled') + '>' +
            (x.feito ? '✓' : (x.liberado ? x.dia : '🔒')) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="jr-caixa jr-hoje"><p class="al-rotulo">Dia ' + dia.dia + ' de ' + d.total + (dia.aula_ref ? ' · ' + esc(dia.aula_ref) : '') + '</p><h3>' + esc(dia.titulo) + '</h3><p>' + esc(dia.tarefa) + '</p>' +
        (dia.dica ? '<p class="al-sub"><b>Dica.</b> ' + esc(dia.dica) + '</p>' : '') +
        '<label class="jr-ent"><b>O que você fez hoje?</b><textarea id="jr-nota" rows="3" placeholder="Uma ou duas frases: o que você fez e o que aprendeu.">' + esc(dia.feito ? dia.feito.nota : '') + '</textarea></label>' +
        '<div class="qz-rodape"><button class="al-bt" id="jr-feito">' + (dia.feito ? 'Atualizar' : '✓ Marcar o dia ' + dia.dia + ' como feito') + '</button><span id="jr-d-msg" class="al-fino"></span></div></div>';
      Array.prototype.forEach.call(alvo.querySelectorAll('.jr-dia[data-d]'), function (b) { b.onclick = function () { pintarDesafio(alvo, d, Number(b.getAttribute('data-d'))); }; });
      el('jr-feito').onclick = function () {
        api('POST', '/aluno/cursos/' + J.pid + '/desafio/checkin', { dia: dia.dia, nota: el('jr-nota').value }).then(function (x) {
          recarregarPainel();
          pintarDesafio(alvo, x, x.feitos >= x.total ? dia.dia : null);
          if (x.feitos >= x.total) el('jr-d-msg').textContent = '🎉 Desafio completo!';
        }).catch(function (e) { el('jr-d-msg').innerHTML = '<span class="erro">' + esc(e.message) + '</span>'; });
      };
    }

    // ================= SIMULAÇÕES =================
    var DESF = { otimo: ['🏆', 'Desfecho ótimo'], bom: ['👍', 'Bom desfecho'], ruim: ['⚠️', 'Desfecho ruim'] };
    function simulacoes(alvo) {
      api('GET', '/aluno/cursos/' + J.pid + '/simulacoes').then(function (r) {
        alvo.innerHTML = '<div class="jr-caixa"><h3>Simulações' + (r.status === 'rascunho' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : '') + '</h3>' +
          '<p class="al-sub">Um caso real, você decide. Cada escolha tem consequência e leva a uma nova situação. No fim, você vê o caminho inteiro e o porquê de cada resultado.</p>' +
          '<div class="jr-missoes">' + r.itens.map(function (x) {
            return '<button class="jr-missao" data-s="' + esc(x.id) + '"><span class="jr-m-tipo">🎯 Simulação' + (x.papel ? ' · ' + esc(x.papel) : '') + '</span><b>' + esc(x.titulo) + '</b><small>' + esc(x.resumo || '') + '</small>' +
              '<span class="jr-st' + (x.melhor != null ? ' ok' : '') + '">' + (x.melhor != null ? 'Melhor: ' + x.melhor + '/' + x.pontos_max + ' pontos' : 'Não jogada') + '</span></button>';
          }).join('') + '</div></div><div id="jr-sim"></div>';
        Array.prototype.forEach.call(alvo.querySelectorAll('[data-s]'), function (b) { b.onclick = function () { jogar(b.getAttribute('data-s')); }; });
      }).catch(function (e) { falha(alvo, e); });
    }
    function jogar(simId) {
      var alvo = el('jr-sim');
      alvo.innerHTML = '<p class="al-sub">Preparando o caso…</p>';
      api('POST', '/aluno/cursos/' + J.pid + '/simulacoes/' + simId + '/iniciar').then(function (r) {
        alvo.innerHTML = '<div class="jr-caixa jr-sim"><p class="al-rotulo">Simulação' + (r.papel ? ' · você é ' + esc(r.papel) : '') + '</p><h3>' + esc(r.titulo) + '</h3>' +
          (r.contexto ? '<p class="jr-ctx">' + esc(r.contexto) + '</p>' : '') + '<div id="jr-sim-fita"></div></div>';
        if (alvo.scrollIntoView) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        cena(r.partida, r.no, simId);
      }).catch(function (e) { falha(alvo, e); });
    }
    function cena(partida, no, simId) {
      var fita = el('jr-sim-fita'), d = document.createElement('div');
      d.className = 'jr-cena';
      d.innerHTML = '<p>' + esc(no.texto).replace(/\n/g, '<br>') + '</p>' + (no.opcoes.length ? '<div class="jr-ops">' + no.opcoes.map(function (t, k) {
        return '<button class="jr-op" data-o="' + k + '"><span>' + String.fromCharCode(65 + k) + '</span>' + esc(t) + '</button>';
      }).join('') + '</div>' : '');
      fita.appendChild(d);
      Array.prototype.forEach.call(d.querySelectorAll('[data-o]'), function (b) {
        b.onclick = function () {
          Array.prototype.forEach.call(d.querySelectorAll('[data-o]'), function (o) { o.disabled = true; });
          b.classList.add('escolhida');
          api('POST', '/aluno/cursos/' + J.pid + '/simulacoes/partidas/' + partida, { opcao: Number(b.getAttribute('data-o')) }).then(function (r) {
            var f = document.createElement('div');
            f.className = 'jr-conseq';
            f.innerHTML = '<b>Consequência</b> <small>+' + r.pontos_escolha + ' ponto(s)</small><p>' + esc(r.feedback) + '</p>';
            d.appendChild(f);
            if (r.terminou) fim(r, simId); else cena(partida, r.no, simId);
            var ult = fita.lastChild; if (ult && ult.scrollIntoView) ult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }).catch(function (e) { alert(e.message); Array.prototype.forEach.call(d.querySelectorAll('[data-o]'), function (o) { o.disabled = false; }); });
        };
      });
    }
    function fim(r, simId) {
      var fita = el('jr-sim-fita'), d = document.createElement('div'), ds = DESF[r.no.final.desfecho] || DESF.bom;
      d.className = 'jr-final ' + r.no.final.desfecho;
      d.innerHTML = '<p>' + esc(r.no.texto).replace(/\n/g, '<br>') + '</p>' +
        '<div class="jr-placar"><span class="jr-num grande">' + r.pontos + '<small>/' + r.pontos_max + '</small></span><span><b>' + ds[0] + ' ' + ds[1] + '</b><small>pontos nesta partida</small></span></div>' +
        (r.no.final.licao ? '<p class="jr-licao"><b>A lição.</b> ' + esc(r.no.final.licao) + '</p>' : '') +
        '<details class="jr-debrief"><summary>Rever o caminho, decisão por decisão</summary><ol>' + (r.caminho || []).map(function (c) {
          return '<li><p class="al-fino">' + esc(c.texto.slice(0, 220)) + (c.texto.length > 220 ? '…' : '') + '</p><p><b>Você escolheu:</b> ' + esc(c.escolha) + ' <small>(+' + c.pontos + ')</small></p><p>' + esc(c.feedback) + '</p></li>';
        }).join('') + '</ol></details>' +
        '<p><button class="al-bt" id="jr-sim-de-novo">Jogar de novo</button> <button class="al-bt fan" id="jr-sim-lista">Outras simulações</button></p>';
      fita.appendChild(d);
      el('jr-sim-de-novo').onclick = function () { jogar(simId); };
      el('jr-sim-lista').onclick = function () { ir('simulacoes'); };
      recarregarPainel();
    }

    // ================= FERRAMENTAS: Prompt Builder e gerador de agentes =================
    var PB = [
      ['funcao', 'Função — quem a IA deve ser', 'Ex.: copywriter de hospedagens de luxo; assistente jurídico de um escritório de família'],
      ['objetivo', 'Objetivo — o que você quer', 'Ex.: criar um anúncio para WhatsApp que gere pedidos de orçamento'],
      ['publico', 'Público ou destinatário', 'Ex.: famílias que querem passar o feriado em Brasília'],
      ['contexto', 'Contexto — o que a IA precisa saber', 'Ex.: casa com piscina, 12 hóspedes, a 15 min do centro; já temos 4,9 de nota'],
      ['regras', 'Regras e limites', 'Ex.: não prometa o que não está no texto; não use gírias; no máximo 120 palavras'],
      ['estilo', 'Estilo e tom', 'Ex.: elegante, caloroso, direto'],
      ['formato', 'Formato da resposta', 'Ex.: 3 versões, cada uma com título e texto; ou uma tabela com as colunas…'],
      ['criterio', 'Considere pronto quando…', 'Ex.: cada versão terminar pedindo datas e número de hóspedes'],
      ['exemplo', 'Exemplo de um bom resultado (opcional)', 'Cole um exemplo que você gosta'],
    ];
    var AG = [
      ['nome', 'Nome do agente', 'Ex.: Agente financeiro'],
      ['missao', 'Missão principal', 'Ex.: conciliar receitas e despesas e alertar sobre pendências'],
      ['area', 'Área e negócio', 'Ex.: hospedagem por temporada, 4 casas, Brasília'],
      ['fontes', 'Fontes e ferramentas que ele usa', 'Ex.: extrato do banco, planilha de reservas, notas fiscais (uma por linha)'],
      ['rotina', 'Rotina — o que ele faz, em ordem', 'Ex.: conferir entradas; conferir saídas; conciliar; listar pendências (uma por linha)'],
      ['categorias', 'Categorias fixas (opcional)', 'Ex.: receita de reserva, limpeza, manutenção, impostos (uma por linha)'],
      ['alertas', 'Níveis de alerta com exemplo', 'Ex.: Crítico: reserva próxima sem pagamento; Médio: despesa sem nota (uma por linha)'],
      ['confirmar', 'Ações que exigem sua confirmação', 'Ex.: enviar mensagem a cliente, mudar preço, pagar algo (uma por linha)'],
      ['nunca', 'O que ele nunca faz', 'Ex.: nunca inventa número; nunca expõe dado pessoal de terceiros (uma por linha)'],
      ['relatorio', 'Formato do relatório', 'Ex.: tabela com data, item, valor, status + uma frase de conclusão'],
    ];
    function linhas(t) { return String(t || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }
    function montarPrompt(v) {
      var b = [];
      if (v.funcao) b.push('Função: você é ' + v.funcao + '.');
      if (v.objetivo) b.push('Objetivo: ' + v.objetivo + '.');
      if (v.publico) b.push('Público: ' + v.publico + '.');
      if (v.contexto) b.push('Contexto:\n' + v.contexto);
      if (v.regras) b.push('Regras:\n' + linhas(v.regras).map(function (x) { return '- ' + x; }).join('\n'));
      if (v.estilo) b.push('Estilo e tom: ' + v.estilo + '.');
      if (v.formato) b.push('Formato da resposta: ' + v.formato + '.');
      if (v.exemplo) b.push('Exemplo de um bom resultado:\n"""\n' + v.exemplo + '\n"""');
      if (v.criterio) b.push('Considere pronto quando: ' + v.criterio + '.');
      b.push('Se faltar alguma informação importante, faça até 3 perguntas antes de começar.');
      return b.join('\n\n');
    }
    function montarAgente(v) {
      var L = function (t, pre) { var x = linhas(t); return x.map(function (y, i) { return (pre ? (i + 1) + '. ' : '- ') + y; }).join('\n'); };
      var sec = []; // [título, corpo] — numerados no fim: campo opcional vazio não deixa buraco na numeração
      sec.push(['Missão', 'Você é o ' + (v.nome || '[nome do agente]') + (v.area ? ' de ' + v.area : '') + '. Sua missão: ' + (v.missao || '[missão principal]') + '.']);
      if (v.fontes) sec.push(['Fontes e ferramentas', 'Trabalhe só com estas fontes; se precisar de outra, peça:\n' + L(v.fontes)]);
      if (v.categorias) sec.push(['Categorias (lista fechada — não improvise)', L(v.categorias)]);
      if (v.rotina) sec.push(['Rotina (nesta ordem)', L(v.rotina, true)]);
      if (v.alertas) sec.push(['Níveis de alerta', L(v.alertas) + '\nUm agente que trata tudo como urgente é tão inútil quanto um que não avisa nada.']);
      sec.push(['Limites', (v.confirmar ? 'Peça minha confirmação ANTES de:\n' + L(v.confirmar) + '\n' : '') +
        (v.nunca ? 'Nunca:\n' + L(v.nunca) + '\n' : '') + 'Leitura e análise são livres. Se não souber, diga que não sabe — não invente.']);
      if (v.relatorio) sec.push(['Formato do relatório', v.relatorio]);
      return ['# PROMPT MASTER — ' + (v.nome || '[NOME DO AGENTE]')].concat(sec.map(function (x, i) { return '## ' + (i + 1) + '. ' + x[0] + '\n' + x[1]; })).join('\n\n');
    }
    function ferramentas(alvo) {
      alvo.innerHTML = '<div class="jr-caixa"><h3>Ferramentas</h3><p class="al-sub">Monte o texto preenchendo os campos — ele se forma ao lado, pronto para copiar. Se quiser, a IA lapida e explica o que mudou.</p>' +
        '<div class="jr-sub-abas"><button class="on" data-f="prompt">✍️ Prompt Builder</button><button data-f="agente">🤖 Gerador de agentes</button></div><div id="jr-ferr"></div></div>';
      var abre = function (f) {
        Array.prototype.forEach.call(alvo.querySelectorAll('[data-f]'), function (b) { b.classList.toggle('on', b.getAttribute('data-f') === f); });
        ferramenta(el('jr-ferr'), f);
      };
      Array.prototype.forEach.call(alvo.querySelectorAll('[data-f]'), function (b) { b.onclick = function () { abre(b.getAttribute('data-f')); }; });
      abre('prompt');
    }
    function ferramenta(alvo, tipo) {
      var campos = tipo === 'agente' ? AG : PB, montar = tipo === 'agente' ? montarAgente : montarPrompt;
      var salvo = {}; try { salvo = JSON.parse(pref(tipo) || '{}') || {}; } catch (e) { salvo = {}; }
      alvo.innerHTML = '<div class="jr-ferr"><div class="jr-form">' + campos.map(function (c) {
        var longo = /contexto|regras|exemplo|fontes|rotina|categorias|alertas|confirmar|nunca/.test(c[0]);
        return '<label><b>' + esc(c[1]) + '</b>' + (longo ? '<textarea rows="3" data-c="' + c[0] + '" placeholder="' + esc(c[2]) + '">' + esc(salvo[c[0]] || '') + '</textarea>'
          : '<input data-c="' + c[0] + '" placeholder="' + esc(c[2]) + '" value="' + esc(salvo[c[0]] || '') + '">') + '</label>';
      }).join('') + '<button class="al-bt peq fan" id="jr-f-limpa">Limpar campos</button></div>' +
        '<div class="jr-saida"><div class="cd-prompt-cab"><b>' + (tipo === 'agente' ? 'Prompt master do agente' : 'Seu prompt') + '</b>' +
        '<span><button class="al-bt peq fan" id="jr-f-copia">Copiar</button> <button class="al-bt peq" id="jr-f-ia">✨ Lapidar com IA</button></span></div>' +
        '<pre id="jr-f-txt"></pre><div id="jr-f-ia-res"></div></div></div>';
      var valores = function () { var v = {}; Array.prototype.forEach.call(alvo.querySelectorAll('[data-c]'), function (x) { v[x.getAttribute('data-c')] = x.value.trim(); }); return v; };
      var atualiza = function () { var v = valores(); el('jr-f-txt').textContent = montar(v); pref(tipo, JSON.stringify(v)); };
      Array.prototype.forEach.call(alvo.querySelectorAll('[data-c]'), function (x) { x.oninput = atualiza; });
      atualiza();
      el('jr-f-limpa').onclick = function () { Array.prototype.forEach.call(alvo.querySelectorAll('[data-c]'), function (x) { x.value = ''; }); atualiza(); el('jr-f-ia-res').innerHTML = ''; };
      el('jr-f-copia').onclick = function () { copiar(el('jr-f-txt').textContent, this); };
      el('jr-f-ia').onclick = function () {
        var bt = this, res = el('jr-f-ia-res');
        bt.disabled = true; res.innerHTML = '<p class="al-sub">Lapidando…</p>';
        api('POST', '/aluno/cursos/' + J.pid + '/ferramentas/refinar', { tipo: tipo, texto: el('jr-f-txt').textContent }).then(function (r) {
          res.innerHTML = '<div class="cd-prompt" style="margin-top:12px"><div class="cd-prompt-cab"><b>Versão lapidada</b><button class="al-bt peq fan" id="jr-f-copia2">Copiar</button></div><pre>' + esc(r.texto) + '</pre></div>' +
            ((r.mudancas || []).length ? '<p><b>O que mudou:</b></p><ul>' + r.mudancas.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
            '<p class="al-fino">' + r.restantes + ' consulta(s) de IA restante(s) hoje. Revise antes de usar.</p>';
          el('jr-f-copia2').onclick = function () { copiar(r.texto, this); };
        }).catch(function (e) { res.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }).then(function () { bt.disabled = false; });
      };
    }

    // ================= RECURSOS: cheat sheets e templates =================
    function recursos(alvo) {
      api('GET', '/aluno/cursos/' + J.pid + '/recursos').then(function (r) {
        var cs = r.itens.filter(function (x) { return x.tipo === 'cheatsheet'; }), tp = r.itens.filter(function (x) { return x.tipo === 'template'; });
        var url = function (x) { return '/academy/aluno/recursos/' + esc(J.pid) + '/' + esc(x.id); };
        alvo.innerHTML = '<div class="jr-caixa"><h3>Cheat sheets e templates' + (r.status === 'rascunho' ? ' <span class="marca-rasc">rascunho — só você vê</span>' : '') + '</h3>' +
          '<p class="al-sub">Folhas de uma página para ter à mão e modelos prontos para você não começar do zero.</p>' +
          (cs.length ? '<h4>Cheat sheets</h4><div class="jr-missoes">' + cs.map(function (x) {
            return '<a class="jr-missao" href="' + url(x) + '" target="_blank" rel="noopener"><span class="jr-m-tipo">📄 Cheat sheet' + (x.categoria ? ' · ' + esc(x.categoria) : '') + '</span><b>' + esc(x.titulo) + '</b><small>' + esc(x.descricao || '') + '</small><span class="jr-st">Abrir e imprimir →</span></a>';
          }).join('') + '</div>' : '') +
          (tp.length ? '<h4 style="margin-top:18px">Templates</h4>' + tp.map(function (x) {
            return '<details class="pr"><summary><span class="pr-cat">' + esc(x.categoria || 'Template') + '</span><b>' + esc(x.titulo) + '</b></summary>' +
              (x.descricao ? '<p>' + esc(x.descricao) + '</p>' : '') + (x.como_usar ? '<p><b>Como usar.</b> ' + esc(x.como_usar) + '</p>' : '') +
              '<div class="cd-prompt"><div class="cd-prompt-cab"><b>Modelo</b><span><button class="al-bt peq fan" data-cp="' + esc(x.id) + '">Copiar</button> <a class="al-bt peq fan" href="' + url(x) + '" target="_blank" rel="noopener">Imprimir</a></span></div><pre>' + esc(x.corpo) + '</pre></div></details>';
          }).join('') : '') + '</div>';
        Array.prototype.forEach.call(alvo.querySelectorAll('[data-cp]'), function (b) {
          b.onclick = function (e) { e.preventDefault(); var x = tp.filter(function (y) { return y.id === b.getAttribute('data-cp'); })[0]; if (x) copiar(x.corpo, b); };
        });
      }).catch(function (e) { falha(alvo, e); });
    }

    return { cartao: cartao, abrir: abrir, montarPrompt: montarPrompt, montarAgente: montarAgente };
  };
})();
