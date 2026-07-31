/* =====================================================================
 * Villela Stay Manager — ONDA LIVRO · extensão da SPA do assinante.
 *
 * Carregada DEPOIS de app-cliente.js e ANTES de bootGestao(). Não altera o
 * arquivo original: empurra abas em VSM.TABS e um grupo em VSM.ORDEM_GRUPOS.
 * render() reconstrói MAPA_VIEWS a partir de TABS a cada montagem, então o
 * núcleo não precisa saber que esta extensão existe.
 *
 * Cada tela cita o capítulo que a justifica — é o que faz o livro e o
 * sistema se explicarem um ao outro.
 * ===================================================================== */
(function () {
  'use strict';
  if (typeof window.VSM === 'undefined') return; // sem o SPA base não há o que estender
  var V = window.VSM;
  var esc = V.esc, brl = V.brl, dt = V.dt, el = V.el, val = V.val, setView = V.setView, erroBox = V.erroBox;
  var app = V.app;
  var api = function (m, p, b) { return app(m, '/livro' + p, b); };

  // ------------------------------------------------------------ helpers
  function n(id) { var e = el(id); return e ? Number(String(e.value).replace(/\./g, '').replace(',', '.')) || 0 : 0; }
  function cent(id) { return Math.round(n(id) * 100); }
  function chk(id) { var e = el(id); return !!(e && e.checked); }
  function pct(x) { return (Number(x || 0)).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
  function livro(txt) {
    return '<div class="vx-alerta vx-alerta--info"><span class="vx-alerta-ico" aria-hidden="true">📘</span><div><p class="vx-mb0">' + txt + '</p></div></div>';
  }
  function tag(t, v) { return '<span class="vx-badge' + (v ? ' vx-badge--' + v : '') + '">' + esc(String(t == null ? '—' : t).replace(/_/g, ' ')) + '</span>'; }
  function card(titulo, corpo, sub) {
    return '<div class="card"><h3>' + titulo + '</h3>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + corpo + '</div>';
  }
  function vazio(t) { return '<p class="sub">' + esc(t) + '</p>'; }
  function acc(titulo, campos, rotulo, id) {
    return '<details class="vx-acc"><summary>' + esc(titulo) + '</summary><div class="vx-acc-corpo">' +
      '<div class="vx-form-grid">' + campos + '</div>' +
      '<div class="vx-btn-row" style="margin-top:14px"><button type="button" class="vx-btn" id="' + id + '">' + esc(rotulo || 'Salvar') + '</button></div></div></details>';
  }
  function campo(id, rot, tipo, extra) {
    return '<div class="vx-campo"><label for="' + id + '">' + esc(rot) + '</label>' +
      (tipo === 'textarea' ? '<textarea id="' + id + '" rows="3"></textarea>'
        : tipo === 'check' ? '<input id="' + id + '" type="checkbox">'
          : '<input id="' + id + '" type="' + (tipo || 'text') + '"' + (extra || '') + '>') + '</div>';
  }
  function sel(id, rot, opcoes) {
    return '<div class="vx-campo"><label for="' + id + '">' + esc(rot) + '</label><select id="' + id + '">' +
      opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
  }
  function ligar(id, fn) { var b = el(id); if (b) b.onclick = fn; }
  function ligarTodos(attr, fn) {
    Array.prototype.forEach.call(document.querySelectorAll('[' + attr + ']'), function (b) {
      b.onclick = function () { fn(b.getAttribute(attr), b); };
    });
  }
  function falha(e) { alert(e && e.message ? e.message : 'Não foi possível concluir.'); }
  var IMOVEIS = [];
  function carregarImoveis() {
    return app('GET', '/imoveis').then(function (d) { IMOVEIS = d.imoveis || []; return IMOVEIS; }).catch(function () { return []; });
  }
  function opcoesImoveis(incluirVazio) {
    return (incluirVazio ? [['', '(todas as unidades)']] : []).concat(IMOVEIS.map(function (i) { return [i.id, i.nome]; }));
  }
  var hojeISO = new Date().toISOString().slice(0, 10);

  // ===================================================================
  // Cap. 39 · PAINEL DO DIA — as cinco perguntas da manhã
  // ===================================================================
  function vDia() {
    api('GET', '/painel-do-dia').then(function (d) {
      var p = d.painel;
      var aviso = p.parcial
        ? '<div class="vx-alerta vx-alerta--danger"><span class="vx-alerta-ico">⚠️</span><div><b>' + esc(p.veredito) + '</b>' +
          p.fontes_indisponiveis.map(function (f) { return '<p class="vx-mb0">' + esc(f.fonte) + ' — ' + esc(f.motivo) + '</p>'; }).join('') + '</div></div>'
        : '';
      var pend = function (lista, cls, rot) {
        if (!lista.length) return '';
        return '<div class="vx-alerta vx-alerta--' + cls + '"><span class="vx-alerta-ico">' + (cls === 'danger' ? '🔴' : cls === 'warn' ? '🟠' : 'ℹ️') + '</span><div><b>' + rot + '</b>' +
          lista.map(function (x) { return '<p class="vx-mb0">' + esc(x.texto) + '</p>'; }).join('') + '</div></div>';
      };
      var chegadas = p.chegadas.length ? p.chegadas.map(function (c) {
        var pr = (p.prontidao || []).filter(function (x) { return x.reserva_id === c.id; })[0];
        return '<div class="lin"><b>' + esc(c.imovel) + '</b> · ' + dt(c.quando) + ' · ' + esc(c.hospede || '—') + ' (' + c.hospedes_qtd + ') ' + tag(c.canal) +
          (pr ? ' ' + (pr.limpeza_confirmada ? tag('limpeza confirmada', 'ok') : tag('limpeza NÃO confirmada', 'danger')) +
            (pr.unidade_liberada ? ' ' + tag('liberada', 'ok') : '') +
            (pr.saldo_recebido ? '' : ' ' + tag('saldo pendente', 'warn')) +
            ' ' + tag('acesso: envio manual', 'accent') : '') + '</div>';
      }).join('') : vazio('Nenhuma chegada hoje ou amanhã.');
      var saidas = p.saidas.length ? p.saidas.map(function (c) { return '<div class="lin">' + esc(c.imovel) + ' · ' + dt(c.quando) + ' · ' + esc(c.hospede || '—') + '</div>'; }).join('') : vazio('Nenhuma saída.');
      var rotinas = p.rotinas.map(function (r) {
        var v = r.situacao === 'ok' ? 'ok' : r.situacao === 'sem_sinal' ? 'danger' : r.situacao === 'falha' ? 'warn' : '';
        return '<div class="lin">' + esc(r.nome.replace(/_/g, ' ')) + ' ' + tag(r.situacao, v) + ' <span class="sub">' + (r.ultima_execucao ? dt(r.ultima_execucao) : 'ainda não executou') + '</span></div>';
      }).join('');
      var bloq = p.bloqueios.length ? p.bloqueios.map(function (b) {
        return '<div class="lin">' + esc(b.imovel_nome) + ' · ' + dt(b.de) + ' → ' + dt(b.ate) + ' ' + tag(b.motivo) + (b.expira_em ? ' <span class="sub">prazo ' + dt(b.expira_em) + '</span>' : '') + '</div>';
      }).join('') : vazio('Nenhuma unidade bloqueada.');

      setView(
        livro('<b>Cap. 39 — o painel do dia.</b> Cinco perguntas, todas as manhãs. Se alguma fonte não pôde ser lida, o painel é declarado PARCIAL: ausência de erro não é evidência de acerto.') +
        aviso +
        pend(p.criticos, 'danger', 'Críticos') + pend(p.altos, 'warn', 'Altos') + pend(p.informativos, 'info', 'Informativos') +
        card('1 · Quem chega e quem sai', chegadas + '<h4 style="margin-top:10px">Saídas</h4>' + saidas) +
        card('2 · Escala de hoje', '<div class="lin">Faxinas: <b>' + p.escala.totais.faxinas + '</b> · Viradas: <b>' + p.escala.totais.viradas + '</b> · Preparações: <b>' + p.escala.totais.preparacoes + '</b></div>' +
          '<div class="lin">Riscos de janela: ' + (p.escala.riscos ? tag(p.escala.riscos, 'danger') : tag(0, 'ok')) + ' · Sem responsável: ' + (p.escala.sem_responsavel ? tag(p.escala.sem_responsavel, 'danger') : tag(0, 'ok')) + '</div>' +
          '<div class="vx-btn-row" style="margin-top:10px"><button class="vx-btn vx-btn--sec vx-btn--sm" id="b-escala">Abrir a escala</button></div>') +
        card('4 · Bloqueios', bloq) +
        card('5 · Rotinas e integrações', rotinas + (p.auditoria ? '<div class="lin">Última auditoria de canais: ' + dt(p.auditoria.quando) + ' ' + (p.auditoria.parcial ? tag('parcial', 'danger') : tag('completa', 'ok')) + ' — ' + esc(p.auditoria.resumo.veredito || '') + '</div>' : '<div class="lin">' + tag('auditoria nunca executada', 'danger') + '</div>') +
          '<div class="vx-btn-row" style="margin-top:10px"><button class="vx-btn vx-btn--sec vx-btn--sm" id="b-aud">Abrir a auditoria</button></div>')
      );
      ligar('b-escala', function () { V.ir('lv_escala'); });
      ligar('b-aud', function () { V.ir('lv_auditoria'); });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 20 · AUDITORIA DE SINCRONIZAÇÃO
  // ===================================================================
  function vAuditoria() {
    api('GET', '/auditoria').then(function (d) {
      var u = d.ultima;
      var risco = { critico: 'danger', alto: 'warn', medio: '', baixo: '' };
      var corpo = !u ? vazio('Nenhuma auditoria executada ainda.') : (
        (u.parcial ? '<div class="vx-alerta vx-alerta--danger"><span class="vx-alerta-ico">⚠️</span><div><b>Relatório PARCIAL.</b>' +
          u.fontes_indisponiveis.map(function (f) { return '<p class="vx-mb0">' + esc(f.fonte) + ' — ' + esc(f.motivo) + '</p>'; }).join('') + '</div></div>' : '') +
        '<div class="lin">Executada em <b>' + dt(u.quando) + '</b> · janela de ' + (u.resumo.janela_dias || 90) + ' dias · veredito: <b>' + esc(u.resumo.veredito || '') + '</b></div>' +
        '<div class="lin">Críticas ' + tag(u.resumo.criticas || 0, u.resumo.criticas ? 'danger' : 'ok') + ' · Altas ' + tag(u.resumo.altas || 0) + ' · Médias ' + tag(u.resumo.medias || 0) + '</div>' +
        (u.divergencias.length ? u.divergencias.map(function (x) {
          return '<div class="lin">' + tag(x.risco, risco[x.risco] || '') + ' <b>' + esc(x.unidade) + '</b> · ' + esc(x.texto) +
            (x.valor_a ? '<br><span class="sub">' + esc(x.valor_a) + ' × ' + esc(x.valor_b) + '</span>' : '') + '</div>';
        }).join('') : '<p class="sub">Nenhuma divergência nas fontes que puderam ser lidas.</p>')
      );
      setView(
        livro('<b>Cap. 20 — a auditoria diária.</b> Ela foi construída para <b>duvidar</b>, não para confirmar: compara fontes independentes, verifica as interligações nas duas direções e <b>falha alto</b> quando não consegue ler alguma fonte. O sistema detecta e classifica; a correção é sua.') +
        card('Última auditoria', corpo) +
        '<div class="vx-btn-row"><button class="vx-btn" id="b-rodar">Rodar a auditoria agora</button></div>' +
        card('Histórico', (d.historico || []).map(function (h) {
          return '<div class="lin">' + dt(h.quando) + ' ' + (h.parcial ? tag('parcial', 'danger') : tag('completa', 'ok')) + ' · ' + esc((h.resumo && h.resumo.veredito) || '') + '</div>';
        }).join('') || vazio('Sem histórico.'))
      );
      ligar('b-rodar', function () {
        el('b-rodar').disabled = true; el('b-rodar').textContent = 'Comparando as fontes…';
        api('POST', '/auditoria/rodar', {}).then(vAuditoria).catch(function (e) { falha(e); vAuditoria(); });
      });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 35 · ESCALA DO DIA + evidência, liberação e inspeção
  // ===================================================================
  function vEscala() {
    var data = hojeISO;
    function pintar() {
      Promise.all([api('GET', '/escala?data=' + data), api('GET', '/inspecoes')]).then(function (r) {
        var e = r[0].escala, insp = r[1];
        var linha = function (t) {
          return '<div class="lin"><b>' + esc(t.imovel) + '</b> ' + tag(t.tipo, t.tipo === 'virada' ? 'accent' : '') +
            (t.risco ? ' ' + tag('RISCO de janela', 'danger') : '') +
            (t.reserva_nova_24h ? ' ' + tag('reserva nova 24h', 'warn') : '') +
            '<br><span class="sub">' + (t.saida_em ? 'saída ' + esc(t.saida_em) : '') + (t.chegada_em ? ' · chegada ' + esc(t.chegada_em) : '') +
            (t.janela_min !== null ? ' · janela ' + t.janela_min + ' min (preparo real ' + t.preparacao_min + ' min)' : '') + '</span><br>' +
            (t.responsavel ? 'Responsável: ' + esc(t.responsavel) : tag('SEM RESPONSÁVEL', 'danger')) + ' · ' +
            (t.confirmada_em ? tag('confirmada', 'ok') : tag('não confirmada', 'warn')) + ' · ' +
            (t.liberada ? tag('liberada', 'ok') : tag('não liberada', '')) +
            (t.limpeza_id ? '<div class="vx-btn-row" style="margin-top:6px">' +
              '<button class="vx-btn vx-btn--sec vx-btn--sm" data-conf="' + t.limpeza_id + '">Confirmar com evidência</button>' +
              '<button class="vx-btn vx-btn--sec vx-btn--sm" data-lib="' + t.limpeza_id + '">Liberar unidade</button></div>' : '') +
            (t.manutencao_aberta.length ? '<div class="sub">Manutenção aberta: ' + t.manutencao_aberta.map(function (m) { return esc(m.titulo); }).join(' · ') + '</div>' : '') +
            '</div>';
        };
        setView(
          livro('<b>Cap. 35 — saber que a mensagem foi enviada não é saber que o trabalho foi feito.</b> A escala nasce do calendário; o valor está na segunda metade: a confirmação de volta, com evidência, e a <b>liberação</b> formal da unidade. E o painel distingue <b>não confirmado</b> de <b>não feito</b>.') +
          '<div class="vx-campo" style="max-width:220px"><label for="esc-data">Dia</label><input id="esc-data" type="date" value="' + data + '"></div>' +
          card('Escala de ' + dt(e.data), (e.tarefas.length ? e.tarefas.map(linha).join('') : vazio('Nenhuma faxina ou preparação neste dia.')),
            'Faxinas ' + e.totais.faxinas + ' · viradas ' + e.totais.viradas + ' · preparações ' + e.totais.preparacoes) +
          card('Inspeção por amostragem <span class="sub">(Cap. 38 — feita por outra pessoa, sobre o procedimento)</span>',
            '<div class="vx-btn-row"><button class="vx-btn vx-btn--sec vx-btn--sm" id="b-sortear">Sortear unidade da semana</button></div>' +
            acc('➕ Registrar inspeção', sel('in-im', 'Unidade', opcoesImoveis(false)) + campo('in-insp', 'Quem inspecionou', 'text') + campo('in-exec', 'Quem executou a limpeza', 'text') +
              campo('in-desv', 'Desvios encontrados (um por linha)', 'textarea') + sel('in-cls', 'Classificação predominante', [['procedimento', 'Procedimento mal escrito'], ['material', 'Material'], ['treinamento', 'Treinamento'], ['pontual', 'Pontual']]), 'Registrar', 'b-insp') +
            (insp.qualidade.itens.length ? '<h4 style="margin-top:12px">Desvios por item</h4>' + insp.qualidade.itens.map(function (i) {
              return '<div class="lin">' + esc(i.item) + ' · ' + i.ocorrencias + ' ocorrência(s) em ' + i.unidades + ' unidade(s) ' + (i.sistemico ? tag('SISTÊMICO — revisar o POP', 'danger') : '') + '</div>';
            }).join('') : vazio('Sem inspeções registradas nos últimos 6 meses.')) +
            '<p class="sub" style="margin-top:8px">' + esc(insp.qualidade.nota) + '</p>')
        );
        el('esc-data').onchange = function () { data = el('esc-data').value || hojeISO; pintar(); };
        ligarTodos('data-conf', function (id) {
          var ev = prompt('Evidências (descrição ou link), separadas por vírgula — quarto, banheiro, cozinha, área externa:');
          if (ev === null) return;
          var exec = prompt('Quem executou?') || '';
          api('POST', '/limpezas/' + id + '/confirmar', { evidencias: ev.split(',').map(function (x) { return x.trim(); }).filter(Boolean), executor: exec }).then(pintar).catch(falha);
        });
        ligarTodos('data-lib', function (id) { api('POST', '/limpezas/' + id + '/liberar', {}).then(pintar).catch(falha); });
        ligar('b-sortear', function () {
          api('POST', '/inspecoes/sortear', {}).then(function (r) { alert('Unidade sorteada: ' + r.sorteio.imovel + '\nUse o checklist E5.'); }).catch(falha);
        });
        ligar('b-insp', function () {
          var linhas = (el('in-desv').value || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          api('POST', '/inspecoes', {
            imovel_id: val('in-im'), inspetor: val('in-insp'), executor: val('in-exec'),
            desvios: linhas.map(function (x) { return { item: x, classificacao: val('in-cls') }; }),
          }).then(pintar).catch(falha);
        });
      }).catch(erroBox);
    }
    carregarImoveis().then(pintar);
  }

  // ===================================================================
  // Cap. 6 · CADASTRO MESTRE + interligações + bloqueios
  // ===================================================================
  function vFicha() {
    Promise.all([carregarImoveis(), api('GET', '/ficha'), api('GET', '/interligacoes'), api('GET', '/bloqueios')]).then(function (r) {
      var pan = r[1].panorama, inter = r[2].interligacoes, bl = r[3];
      var incompletas = pan.filter(function (p) { return !p.completa; });
      setView(
        livro('<b>Cap. 6 — a fonte da verdade.</b> A régua de mensagens, a escala e o manual do hóspede saem daqui. Cadastro incompleto não vira mensagem inventada: vira <b>FALTA DADO</b>. A senha do wi-fi e o código de acesso <b>não moram aqui</b> (Cap. 32).') +
        (incompletas.length ? '<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico">📋</span><div><b>' + incompletas.length + ' unidade(s) com cadastro incompleto.</b>' +
          incompletas.map(function (p) { return '<p class="vx-mb0">' + esc(p.nome) + ' — falta: ' + esc(p.faltando.join(', ')) + '</p>'; }).join('') + '</div></div>' : '') +
        card('Cadastro por unidade', pan.map(function (p) {
          return '<div class="lin"><b>' + esc(p.nome) + '</b> ' + (p.completa ? tag('completo', 'ok') : tag('incompleto', 'warn')) +
            ' <span class="sub">preparo ' + (p.preparacao_min || '—') + ' min · piso ' + (p.tarifa_minima_centavos ? brl(p.tarifa_minima_centavos) : 'não definido') + '</span> ' +
            '<button class="vx-btn vx-btn--ghost vx-btn--sm" data-ficha="' + p.imovel_id + '">Editar</button></div>';
        }).join('') || vazio('Cadastre um imóvel primeiro.')) +
        '<div id="ficha-form"></div>' +
        card('Interligações <span class="sub">(Cap. 13 — ocupar um bloqueia o outro, nas duas direções)</span>',
          (inter.length ? inter.map(function (i) {
            return '<div class="lin"><b>' + esc(i.nome_a) + '</b> ↔ <b>' + esc(i.nome_b) + '</b> <button class="vx-btn vx-btn--ghost vx-btn--sm" data-delint="' + i.id + '">remover</button></div>';
          }).join('') : vazio('Nenhuma interligação declarada. Se você vende o mesmo espaço como casa inteira e como quartos, declare aqui — é a camada 2 do anti-overbooking.')) +
          acc('➕ Interligar dois anúncios', sel('it-a', 'Anúncio A', opcoesImoveis(false)) + sel('it-b', 'Anúncio B', opcoesImoveis(false)) + campo('it-obs', 'Observação', 'text'), 'Interligar', 'b-int')) +
        card('Bloqueios de calendário <span class="sub">(saem das noites disponíveis — Apêndice F)</span>',
          (bl.vencidos.length ? '<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico">⏳</span><div><b>Data segurada vencida e não solta.</b>' +
            bl.vencidos.map(function (b) { return '<p class="vx-mb0">' + esc(b.imovel_nome) + ' ' + dt(b.de) + '→' + dt(b.ate) + ' (prazo ' + dt(b.expira_em) + ')</p>'; }).join('') + '</div></div>' : '') +
          (bl.bloqueios.length ? bl.bloqueios.map(function (b) {
            return '<div class="lin">' + esc(b.imovel_nome) + ' · ' + dt(b.de) + ' → ' + dt(b.ate) + ' ' + tag(b.motivo) + (b.expira_em ? ' <span class="sub">prazo ' + dt(b.expira_em) + '</span>' : '') +
              ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-delbl="' + b.id + '">soltar</button></div>';
          }).join('') : vazio('Nenhum bloqueio.')) +
          acc('➕ Bloquear período', sel('bl-im', 'Unidade', opcoesImoveis(false)) + campo('bl-de', 'De', 'date') + campo('bl-ate', 'Até (exclusivo)', 'date') +
            sel('bl-mot', 'Motivo', [['manutencao', 'Manutenção'], ['reforma', 'Reforma'], ['proprietario', 'Uso do proprietário'], ['reserva_segurada', 'Data segurada (exige prazo)']]) +
            campo('bl-exp', 'Prazo de validade (data segurada)', 'date') + campo('bl-resp', 'Responsável por soltar', 'text'), 'Bloquear', 'b-bloq'))
      );
      ligarTodos('data-ficha', abrirFicha);
      ligar('b-int', function () { api('POST', '/interligacoes', { imovel_a: val('it-a'), imovel_b: val('it-b'), obs: val('it-obs') }).then(vFicha).catch(falha); });
      ligarTodos('data-delint', function (id) { api('DELETE', '/interligacoes/' + id).then(vFicha).catch(falha); });
      ligar('b-bloq', function () {
        api('POST', '/bloqueios', { imovel_id: val('bl-im'), de: val('bl-de'), ate: val('bl-ate'), motivo: val('bl-mot'), expira_em: val('bl-exp'), responsavel: val('bl-resp') }).then(vFicha).catch(falha);
      });
      ligarTodos('data-delbl', function (id) { api('DELETE', '/bloqueios/' + id).then(vFicha).catch(falha); });
    }).catch(erroBox);
  }

  function abrirFicha(imovelId) {
    api('GET', '/ficha/' + imovelId).then(function (d) {
      var f = d.ficha;
      var nome = (IMOVEIS.filter(function (i) { return i.id === imovelId; })[0] || {}).nome || '';
      el('ficha-form').innerHTML = card('Cadastro mestre — ' + esc(nome),
        '<div class="vx-form-grid">' +
        campo('fc-conf', 'Capacidade confortável (é a que se anuncia)', 'number') + campo('fc-max', 'Capacidade máxima', 'number') +
        campo('fc-prep', 'Tempo REAL de preparação (min, cronometrado)', 'number') + campo('fc-jan', 'Janela mínima entre estadias (min)', 'number') +
        campo('fc-ci', 'Check-in', 'time') + campo('fc-co', 'Check-out', 'time') +
        campo('fc-est', 'Estacionamento', 'text') + campo('fc-wifi', 'Nome da rede wi-fi (a senha NUNCA entra aqui)', 'text') +
        campo('fc-min', 'Tarifa mínima por noite (R$) — o piso que nenhum desconto cruza', 'text') +
        campo('fc-fixo', 'Custo fixo mensal da unidade (R$)', 'text') +
        campo('fc-acesso', 'Particularidades de acesso (sem senha/código)', 'textarea') +
        campo('fc-naotem', 'O que a casa NÃO tem (um por linha)', 'textarea') +
        campo('fc-com', 'Comodidades verificadas na vistoria (uma por linha)', 'textarea') +
        campo('fc-regras', 'Regras da casa', 'textarea') +
        '</div><div class="vx-btn-row" style="margin-top:14px"><button class="vx-btn" id="b-ficha">Salvar cadastro</button></div>');
      el('fc-conf').value = f.capacidade_confortavel || ''; el('fc-max').value = f.capacidade_maxima || '';
      el('fc-prep').value = f.preparacao_min || ''; el('fc-jan').value = f.janela_minima_min || '';
      el('fc-ci').value = f.checkin_hora || '15:00'; el('fc-co').value = f.checkout_hora || '11:00';
      el('fc-est').value = f.estacionamento || ''; el('fc-wifi').value = f.wifi_rede || '';
      el('fc-min').value = f.tarifa_minima_centavos ? (f.tarifa_minima_centavos / 100).toFixed(2) : '';
      el('fc-fixo').value = f.custo_fixo_mes_centavos ? (f.custo_fixo_mes_centavos / 100).toFixed(2) : '';
      el('fc-acesso').value = f.acesso_particularidades || '';
      el('fc-naotem').value = (f.nao_tem || []).join('\n');
      el('fc-com').value = (f.comodidades_verificadas || []).join('\n');
      el('fc-regras').value = f.regras || '';
      var linhas = function (id) { return (el(id).value || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
      ligar('b-ficha', function () {
        api('PUT', '/ficha/' + imovelId, {
          capacidade_confortavel: n('fc-conf'), capacidade_maxima: n('fc-max'), preparacao_min: n('fc-prep'), janela_minima_min: n('fc-jan'),
          checkin_hora: val('fc-ci'), checkout_hora: val('fc-co'), estacionamento: val('fc-est'), wifi_rede: val('fc-wifi'),
          tarifa_minima_centavos: cent('fc-min'), custo_fixo_mes_centavos: cent('fc-fixo'),
          acesso_particularidades: val('fc-acesso'), nao_tem: linhas('fc-naotem'), comodidades_verificadas: linhas('fc-com'), regras: val('fc-regras'),
        }).then(vFicha).catch(falha);
      });
      el('ficha-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }).catch(falha);
  }

  // ===================================================================
  // Cap. 37 · PREVENTIVA + fornecedores
  // ===================================================================
  function vPreventiva() {
    Promise.all([carregarImoveis(), api('GET', '/preventiva'), api('GET', '/fornecedores')]).then(function (r) {
      var it = r[1].itens, pl = r[1].plano, fo = r[2];
      var bloco = function (titulo, lista, cls) {
        if (!lista.length) return '';
        return '<h4 style="margin-top:12px">' + titulo + '</h4>' + lista.map(function (x) {
          return '<div class="lin">' + tag(cls || '', cls) + ' <b>' + esc(x.imovel) + '</b> · ' + esc(x.equipamento) +
            (x.vence_em ? ' <span class="sub">vence ' + dt(x.vence_em) + '</span>' : '') +
            (x.janelas && x.janelas.length ? '<br><span class="sub">Janelas sem hóspede: ' + x.janelas.map(function (j) { return dt(j.de) + '→' + dt(j.ate); }).join(' · ') + '</span>' : '') +
            ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-exec="' + x.id + '">marcar executada</button></div>';
        }).join('');
      };
      setView(
        livro('<b>Cap. 37 — preventiva custa uma fração da corretiva e não acontece com hóspede dentro.</b> O sistema cruza o vencimento com o calendário e propõe janelas sem hóspede. Ele <b>não</b> bloqueia calendário, <b>não</b> aciona técnico e <b>não</b> autoriza despesa: as três são decisão sua.') +
        (pl.criticos.length ? '<div class="vx-alerta vx-alerta--danger"><span class="vx-alerta-ico">🔴</span><div><b>Crítico</b>' +
          pl.criticos.map(function (c) { return '<p class="vx-mb0">' + esc(c.imovel) + ': "' + esc(c.chamado) + '" com check-in em ' + dt(c.checkin) + '</p>'; }).join('') + '</div></div>' : '') +
        card('Plano do mês', bloco('Vencidas', pl.vencidas, 'danger') + bloco('Vencem em 30 dias', pl.do_mes, 'warn') +
          bloco('SEM JANELA disponível', pl.sem_janela, 'danger') + bloco('SEM REGISTRO de última execução', pl.sem_registro, '') +
          (pl.reincidentes.length ? '<h4 style="margin-top:12px">Equipamentos reincidentes (3+ chamados em 12 meses)</h4>' +
            pl.reincidentes.map(function (x) { return '<div class="lin">' + esc(x.imovel) + ' · ' + esc(x.equipamento) + ' — <b>' + x.ocorrencias + '</b> chamados. <span class="sub">O número, sem recomendação: trocar ou continuar consertando é decisão sua.</span></div>'; }).join('') : '') +
          '<p class="sub" style="margin-top:10px">' + esc(pl.nota) + '</p>') +
        card('Itens do plano', (it.length ? it.map(function (x) {
          return '<div class="lin"><b>' + esc(x.imovel) + '</b> · ' + esc(x.equipamento) + ' · a cada ' + x.periodicidade_dias + ' dias · ' +
            (x.ultima_execucao ? 'última ' + dt(x.ultima_execucao) : tag('SEM REGISTRO', 'warn')) +
            ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-delprev="' + x.id + '">remover</button></div>';
        }).join('') : vazio('Nenhum equipamento no plano. Comece por uma unidade: climatização, água quente, piscina, caixa de gordura.')) +
          acc('➕ Equipamento no plano', sel('pv-im', 'Unidade', opcoesImoveis(false)) + campo('pv-eq', 'Equipamento', 'text') +
            campo('pv-per', 'Periodicidade (dias)', 'number') + campo('pv-ult', 'Última execução', 'date') + campo('pv-dur', 'Duração (horas)', 'number'), 'Adicionar', 'b-prev')) +
        card('Fornecedores <span class="sub">(dois para cada especialidade crítica)</span>',
          fo.cobertura.map(function (c) { return '<div class="lin">' + esc(c.especialidade.replace(/_/g, ' ')) + ': <b>' + c.quantidade + '</b> ' + (c.alerta ? tag('fornecedor único — problema sem saída numa sexta de feriado', 'warn') : tag('ok', 'ok')) + '</div>'; }).join('') +
          (fo.fornecedores.length ? '<h4 style="margin-top:10px">Cadastrados</h4>' + fo.fornecedores.map(function (f) {
            return '<div class="lin"><b>' + esc(f.nome) + '</b> ' + tag(f.especialidade) + ' <span class="sub">' + esc(f.contato) + (f.prazo_resposta ? ' · prazo ' + esc(f.prazo_resposta) : '') + '</span> <button class="vx-btn vx-btn--ghost vx-btn--sm" data-delforn="' + f.id + '">remover</button></div>';
          }).join('') : '') +
          acc('➕ Fornecedor', sel('fn-esp', 'Especialidade', [['piscina', 'Piscina'], ['ar_condicionado', 'Ar-condicionado'], ['eletrica', 'Elétrica'], ['hidraulica', 'Hidráulica'], ['chaveiro', 'Chaveiro'], ['enxoval', 'Enxoval'], ['limpeza', 'Limpeza'], ['outro', 'Outro']]) +
            campo('fn-nome', 'Nome', 'text') + campo('fn-cont', 'Contato', 'text') + campo('fn-prazo', 'Prazo de resposta combinado', 'text'), 'Cadastrar', 'b-forn'))
      );
      ligar('b-prev', function () {
        api('POST', '/preventiva', { imovel_id: val('pv-im'), equipamento: val('pv-eq'), periodicidade_dias: n('pv-per') || 180, ultima_execucao: val('pv-ult'), duracao_horas: n('pv-dur') || 4 }).then(vPreventiva).catch(falha);
      });
      ligarTodos('data-exec', function (id) { api('POST', '/preventiva/' + id + '/executada', { data: hojeISO }).then(vPreventiva).catch(falha); });
      ligarTodos('data-delprev', function (id) { api('DELETE', '/preventiva/' + id).then(vPreventiva).catch(falha); });
      ligar('b-forn', function () {
        api('POST', '/fornecedores', { especialidade: val('fn-esp'), nome: val('fn-nome'), contato: val('fn-cont'), prazo_resposta: val('fn-prazo') }).then(vPreventiva).catch(falha);
      });
      ligarTodos('data-delforn', function (id) { api('DELETE', '/fornecedores/' + id).then(vPreventiva).catch(falha); });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 36 · SUPRIMENTOS E ENXOVAL
  // ===================================================================
  function vSuprimentos() {
    Promise.all([carregarImoveis(), api('GET', '/suprimentos')]).then(function (r) {
      var p = r[1].previsao, enx = r[1].enxoval;
      setView(
        livro('<b>Cap. 36 — compre por previsão, não por falta.</b> A projeção sai do <b>calendário de reservas</b>, nunca de média de mercado. E consumo fora do padrão é <b>sinalizado</b>, não corrigido em silêncio: variação é informação.') +
        (p.criticos.length ? '<div class="vx-alerta vx-alerta--danger"><span class="vx-alerta-ico">🔴</span><div><b>Itens críticos — abaixo do mínimo com reserva nos próximos 7 dias</b>' +
          p.criticos.map(function (i) { return '<p class="vx-mb0">' + esc(i.nome) + ': ' + i.estoque + ' em estoque, mínimo ' + i.minimo + '</p>'; }).join('') + '</div></div>' : '') +
        card('Lista de compras — próximos ' + p.periodo_dias + ' dias',
          '<p class="sub">' + p.reservas_previstas + ' reserva(s) confirmada(s) no período · margem de segurança de ' + p.margem_seguranca_pct + '%</p>' +
          (p.lista.length ? p.lista.map(function (i) {
            return '<div class="lin"><b>' + esc(i.nome) + '</b> · comprar <b>' + i.comprar + ' ' + esc(i.unidade) + '</b> <span class="sub">estoque ' + i.estoque + ' · consumo previsto ' + i.consumo_previsto + ' · mínimo ' + i.minimo + '</span></div>';
          }).join('') : vazio('Nada a comprar pela previsão atual.')) +
          '<p class="sub" style="margin-top:8px">' + esc(p.nota) + '</p>') +
        (p.atipicos.length ? card('Consumo atípico', p.atipicos.map(function (a) {
          return '<div class="lin">' + tag('investigar', 'warn') + ' <b>' + esc(a.item) + '</b> · média histórica ' + a.media_historica + ' × recente ' + a.media_recente + '<br><span class="sub">' + esc(a.nota) + '</span></div>';
        }).join('')) : '') +
        card('Enxoval por lote <span class="sub">(vida útil — a peça velha não avisa: vai ficando cinza)</span>',
          (p.enxoval_a_aposentar.length ? '<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico">🧺</span><div><b>Lotes que atingiram a vida útil</b>' +
            p.enxoval_a_aposentar.map(function (e) { return '<p class="vx-mb0">' + esc(e.item) + ' (lote ' + esc(e.lote || '—') + ', entrada ' + dt(e.entrada_em) + ')</p>'; }).join('') + '</div></div>' : '') +
          (enx.length ? enx.map(function (e) {
            return '<div class="lin"><b>' + esc(e.item) + '</b> · ' + e.qtd + ' un · lote ' + esc(e.lote || '—') + ' · entrada ' + dt(e.entrada_em) + ' · vida útil ' + e.vida_util_meses + ' meses' +
              (e.aposentado_em ? ' ' + tag('aposentado → ' + e.destino, '') : (e.vence_em && e.vence_em <= hojeISO ? ' ' + tag('vencido', 'warn') + ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-apos="' + e.id + '">aposentar</button>' : '')) + '</div>';
          }).join('') : vazio('Nenhum lote registrado. Sem data de entrada, ninguém aposenta nada até o hóspede comentar.')) +
          acc('➕ Lote de enxoval', sel('ex-im', 'Unidade', opcoesImoveis(true)) + campo('ex-item', 'Item (ex.: lençol casal branco)', 'text') +
            campo('ex-lote', 'Lote', 'text') + campo('ex-qtd', 'Quantidade', 'number') + campo('ex-ent', 'Data de entrada', 'date') + campo('ex-vida', 'Vida útil (meses)', 'number'), 'Registrar', 'b-enx'))
      );
      ligar('b-enx', function () {
        api('POST', '/enxoval', { imovel_id: val('ex-im'), item: val('ex-item'), lote: val('ex-lote'), qtd: n('ex-qtd'), entrada_em: val('ex-ent'), vida_util_meses: n('ex-vida') || 18 }).then(vSuprimentos).catch(falha);
      });
      ligarTodos('data-apos', function (id) {
        var d = prompt('Destino da peça aposentada (pano de limpeza, doação…):');
        if (!d) return;
        api('POST', '/enxoval/' + id + '/aposentar', { destino: d }).then(vSuprimentos).catch(falha);
      });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 23 · CRM
  // ===================================================================
  function vCrm() {
    Promise.all([carregarImoveis(), api('GET', '/crm/oportunidades'), api('GET', '/crm/contatos'), api('GET', '/crm/pauta'), api('GET', '/catalogos')]).then(function (r) {
      var ops = r[1].oportunidades, fun = r[1].funil, cts = r[2].contatos, pauta = r[3].pauta, cat = r[4].catalogos;
      var linhaOp = function (o) {
        return '<div class="lin"><b>' + esc(o.contato) + '</b> ' + tag(o.estagio, o.estagio === 'ganho' ? 'ok' : o.estagio === 'perdido' ? '' : 'accent') +
          (o.sem_proxima_acao ? ' ' + tag('SEM PRÓXIMA AÇÃO', 'danger') : '') + (o.atrasada ? ' ' + tag('atrasada', 'warn') : '') +
          '<br><span class="sub">' + (o.imovel ? esc(o.imovel) + ' · ' : '') + (o.datas_de ? dt(o.datas_de) + '→' + dt(o.datas_ate) : 'sem datas') +
          (o.hospedes_qtd ? ' · ' + o.hospedes_qtd + ' pessoas' : '') + (o.finalidade ? ' · ' + esc(o.finalidade) : '') +
          (o.visitantes ? ' · ' + o.visitantes + ' visitantes' : '') + (o.valor_cotado_centavos ? ' · ' + brl(o.valor_cotado_centavos) : '') + '</span>' +
          (o.proxima_acao ? '<br>Próxima ação: <b>' + esc(o.proxima_acao) + '</b> em ' + dt(o.proxima_acao_em) : '') +
          (o.motivo_perda ? '<br>Motivo da perda: ' + tag(o.motivo_perda) : '') +
          (o.aberta ? '<div class="vx-btn-row" style="margin-top:6px"><button class="vx-btn vx-btn--sec vx-btn--sm" data-conv="' + o.id + '">Converter em reserva</button>' +
            '<button class="vx-btn vx-btn--ghost vx-btn--sm" data-perd="' + o.id + '">Perder</button></div>' : '') + '</div>';
      };
      setView(
        livro('<b>Cap. 23 — o seu sistema de reservas sabe tudo sobre quem reservou; nada sobre quem quase reservou.</b> Duas regras fazem o funil funcionar e o sistema exige as duas: toda oportunidade aberta tem <b>próxima ação com data</b>, e toda perda tem <b>motivo em categoria fechada</b>.') +
        card('Funil', cat.estagios_funil.map(function (e) { return '<span class="tag" style="margin:2px">' + esc(e) + ': <b>' + (fun.por_estagio[e] || 0) + '</b></span>'; }).join(' ') +
          '<div class="lin" style="margin-top:8px">Abertas: <b>' + fun.abertas + '</b> · sem próxima ação: ' + (fun.sem_proxima_acao ? tag(fun.sem_proxima_acao, 'danger') : tag(0, 'ok')) + ' · conversão ' + pct(fun.conversao) + '</div>') +
        card('Pauta da semana', (pauta.sem_proxima_acao.length ? '<h4>Prioridade 1 — sem próxima ação</h4>' + pauta.sem_proxima_acao.map(function (o) { return '<div class="lin">' + esc(o.contato) + ' · ' + esc(o.estagio) + '</div>'; }).join('') : '') +
          (pauta.atrasadas.length ? '<h4 style="margin-top:10px">Ações atrasadas</h4>' + pauta.atrasadas.map(function (o) { return '<div class="lin">' + esc(o.contato) + ' — ' + esc(o.proxima_acao) + ' (venceu ' + dt(o.proxima_acao_em) + ')</div>'; }).join('') : '') +
          (pauta.datas_livres.length ? '<h4 style="margin-top:10px">Datas liberadas por cancelamento × quem consultou aquele período</h4>' +
            pauta.datas_livres.map(function (d) {
              return '<div class="lin"><b>' + esc(d.imovel) + '</b> ' + dt(d.de) + '→' + dt(d.ate) + '<br><span class="sub">' + d.contatos.map(function (c) { return esc(c.contato) + ' (perdeu por ' + esc(c.motivo_perda) + ')'; }).join(' · ') + '</span></div>';
            }).join('') : '') +
          (pauta.reativacao.length ? '<h4 style="margin-top:10px">Listas de reativação</h4>' + pauta.reativacao.map(function (l) {
            return '<div class="lin"><b>' + esc(l.criterio) + '</b><br><span class="sub">' + (l.contatos.length ? l.contatos.map(function (c) { return esc(c.nome); }).join(' · ') : 'nenhum contato neste critério') + '</span></div>';
          }).join('') : '') +
          '<div class="lin" style="margin-top:10px"><b>Motivos de perda:</b> ' + esc(pauta.leitura) + '</div>' +
          '<p class="sub">' + esc(pauta.nota) + '</p>') +
        card('Oportunidades', (ops.length ? ops.map(linhaOp).join('') : vazio('Nenhuma oportunidade registrada.')) +
          acc('➕ Nova oportunidade', sel('op-ct', 'Contato', cts.map(function (c) { return [c.id, c.nome + ' (' + c.tipo + ')']; })) +
            sel('op-im', 'Unidade de interesse', opcoesImoveis(true)) + campo('op-de', 'Data de entrada pretendida', 'date') + campo('op-ate', 'Data de saída', 'date') +
            campo('op-qtd', 'Quantas pessoas ao todo', 'number') + campo('op-fin', 'Finalidade da viagem (a pergunta mais valiosa)', 'text') +
            campo('op-vis', 'Visitantes que NÃO dormem na casa', 'number') + campo('op-val', 'Valor cotado (R$)', 'text') +
            sel('op-est', 'Estágio', [['novo', 'Novo'], ['qualificado', 'Qualificado'], ['cotado', 'Cotado'], ['negociacao', 'Em negociação']]) +
            campo('op-acao', 'Próxima ação', 'text') + campo('op-quando', 'Quando', 'date') + campo('op-resp', 'Responsável', 'text'), 'Registrar', 'b-op')) +
        card('Contatos', (cts.length ? cts.map(function (c) {
          return '<div class="lin"><b>' + esc(c.nome) + '</b> ' + tag(c.tipo) + (c.opt_out ? ' ' + tag('não contatar', 'danger') : '') +
            ' <span class="sub">' + esc(c.origem || 'origem não registrada') + (c.ultima_estadia ? ' · última estadia ' + dt(c.ultima_estadia) : '') + (c.finalidade ? ' · ' + esc(c.finalidade) : '') + '</span>' +
            (c.opt_out ? '' : ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-opt="' + c.id + '">pediu p/ não contatar</button>') + '</div>';
        }).join('') : vazio('Nenhum contato. Antes de otimizar o funil, garanta que as pessoas entram nele.')) +
          acc('➕ Novo contato', campo('ct-nome', 'Nome', 'text') + sel('ct-tipo', 'Tipo', [['lead', 'Lead'], ['hospede', 'Hóspede'], ['proprietario', 'Proprietário']]) +
            campo('ct-tel', 'Telefone', 'text') + campo('ct-mail', 'E-mail', 'email') + campo('ct-orig', 'Origem (sem ela não entra em reativação)', 'text') +
            campo('ct-fin', 'Finalidade típica', 'text'), 'Cadastrar', 'b-ct'))
      );
      ligar('b-ct', function () {
        api('POST', '/crm/contatos', { nome: val('ct-nome'), tipo: val('ct-tipo'), telefone: val('ct-tel'), email: val('ct-mail'), origem: val('ct-orig'), finalidade: val('ct-fin') }).then(vCrm).catch(falha);
      });
      ligarTodos('data-opt', function (id) { api('POST', '/crm/contatos/' + id + '/opt-out', {}).then(vCrm).catch(falha); });
      ligar('b-op', function () {
        api('POST', '/crm/oportunidades', {
          contato_id: val('op-ct'), imovel_id: val('op-im'), datas_de: val('op-de'), datas_ate: val('op-ate'),
          hospedes_qtd: n('op-qtd'), finalidade: val('op-fin'), visitantes: n('op-vis'), valor_cotado_centavos: cent('op-val'),
          estagio: val('op-est'), proxima_acao: val('op-acao'), proxima_acao_em: val('op-quando'), responsavel: val('op-resp'),
        }).then(function (r2) { if (r2.oportunidade && r2.oportunidade.aviso) alert(r2.oportunidade.aviso); vCrm(); }).catch(falha);
      });
      ligarTodos('data-perd', function (id) {
        var m = prompt('Motivo da perda — categoria fechada:\n' + cat.motivos_perda.map(function (x) { return x.chave + ' = ' + x.rotulo; }).join('\n'));
        if (!m) return;
        api('POST', '/crm/oportunidades/' + id + '/perder', { motivo: m.trim() }).then(vCrm).catch(falha);
      });
      ligarTodos('data-conv', function (id) {
        if (!confirm('Converter em reserva? Ela passa pelo anti-overbooking e pela regra de interligação.')) return;
        api('POST', '/crm/oportunidades/' + id + '/converter', {}).then(vCrm).catch(falha);
      });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 21 · DATAS ESPECIAIS E REVISÃO SEMANAL
  // ===================================================================
  function vRevenue() {
    Promise.all([carregarImoveis(), api('GET', '/revenue')]).then(function (r) {
      var datas = r[1].datas, rev = r[1].revisao;
      setView(
        livro('<b>Cap. 21 — recomendação automática, publicação humana.</b> Uma tarifa de Réveillon publicada por engano ao preço de terça comum vira reserva confirmada que você vai ter que honrar. O sistema propõe; quem publica no canal é você — e o botão "já publiquei" existe só para registrar isso.') +
        card('Revisão da semana', (rev.silencio
          ? '<div class="vx-alerta vx-alerta--info"><span class="vx-alerta-ico">🤫</span><div><p class="vx-mb0">' + esc(rev.nota) + '</p></div></div>'
          : rev.itens.map(function (i) {
            return '<div class="lin"><b>' + esc(i.unidade) + '</b> · ' + esc(i.periodo) + ' ' + tag(i.situacao, 'warn') +
              '<br>' + esc(i.acao) + (i.receita_em_risco_centavos ? '<br><span class="sub">Receita em risco: ' + brl(i.receita_em_risco_centavos) + '</span>' : '') + '</div>';
          }).join('') + '<p class="sub">' + esc(rev.nota) + '</p>')) +
        card('Calendário de datas especiais',
          (datas.length ? datas.map(function (d) {
            return '<div class="lin"><b>' + esc(d.nome) + '</b> · ' + esc(d.imovel) + ' · ' + dt(d.de) + '→' + dt(d.ate) +
              '<br><span class="sub">tarifa proposta ' + (d.tarifa_proposta_centavos ? brl(d.tarifa_proposta_centavos) : '—') + ' · estadia mínima ' + d.estadia_minima + ' noites' +
              (d.revisar_em ? ' · revisar até ' + dt(d.revisar_em) : '') + '</span> ' +
              (d.aplicada ? tag('publicada por uma pessoa', 'ok') : '<button class="vx-btn vx-btn--sec vx-btn--sm" data-apl="' + d.id + '">marcar como publicada</button>') +
              ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-deldt="' + d.id + '">remover</button>' +
              (d.justificativa ? '<br><span class="sub">' + esc(d.justificativa) + '</span>' : '') + '</div>';
          }).join('') : vazio('Nenhuma data especial definida. É a tarefa com melhor relação entre esforço e receita — e a que praticamente todo mundo adia até a véspera.')) +
          acc('➕ Data especial', campo('de-nome', 'Nome (Réveillon, Carnaval, congresso…)', 'text') + sel('de-im', 'Unidade', opcoesImoveis(true)) +
            campo('de-de', 'De', 'date') + campo('de-ate', 'Até', 'date') + campo('de-tar', 'Tarifa proposta por noite (R$)', 'text') +
            campo('de-min', 'Estadia mínima (noites)', 'number') + campo('de-rev', 'Revisar até', 'date') + campo('de-just', 'Justificativa apoiada no histórico', 'textarea'), 'Registrar', 'b-dtesp'))
      );
      ligar('b-dtesp', function () {
        api('POST', '/revenue/datas', { nome: val('de-nome'), imovel_id: val('de-im'), de: val('de-de'), ate: val('de-ate'), tarifa_proposta_centavos: cent('de-tar'), estadia_minima: n('de-min') || 1, revisar_em: val('de-rev'), justificativa: val('de-just') }).then(vRevenue).catch(falha);
      });
      ligarTodos('data-apl', function (id) {
        if (!confirm('Confirma que a tarifa e a estadia mínima foram publicadas no canal por você?')) return;
        api('POST', '/revenue/datas/' + id + '/aplicada', {}).then(vRevenue).catch(falha);
      });
      ligarTodos('data-deldt', function (id) { api('DELETE', '/revenue/datas/' + id).then(vRevenue).catch(falha); });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 25/30 · DOCUMENTAÇÃO, CONFERÊNCIA E RISCO
  // ===================================================================
  function vDoc() {
    Promise.all([api('GET', '/documentacao/conferencia'), api('GET', '/documentacao/politica')]).then(function (r) {
      var c = r[0].conferencia, pol = r[1].politica;
      var linha = function (l) {
        return '<div class="lin"><b>' + esc(l.imovel) + '</b> · ' + esc(l.hospede || '—') + ' · check-in ' + dt(l.checkin) +
          ' (' + l.dias_ate_checkin + ' dia(s)) · ' + brl(l.valor_centavos) + (l.critico ? ' ' + tag('crítico', 'danger') : '') +
          '<br><span class="sub">Falta: ' + esc(l.falta.join(' · ')) + '</span>' +
          ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-doc="' + l.reserva_id + '">documentar</button></div>';
      };
      setView(
        livro('<b>Caps. 25 e 30 — uma reserva bem fechada é um documento, não uma conversa.</b> Esta conferência não impede o erro: <b>encontra o erro antes do hóspede</b>. E ausência de registro nunca é lida como cumprimento.') +
        card('Conferência das reservas', (c.criticas.length ? '<h4>Críticas</h4>' + c.criticas.map(linha).join('') : '') +
          (c.demais.length ? '<h4 style="margin-top:10px">Demais pendências</h4>' + c.demais.map(linha).join('') : '') +
          (!c.total ? vazio('Nenhuma pendência encontrada nas reservas ativas.') : '') +
          '<p class="sub" style="margin-top:8px">' + esc(c.nota) + '</p>') +
        '<div id="doc-form"></div>' +
        card('Política de documentação por faixa de valor',
          pol.map(function (f) {
            return '<div class="lin">' + brl(f.de_centavos) + ' → ' + (f.ate_centavos ? brl(f.ate_centavos) : 'sem teto') +
              ' · sinal ' + f.sinal_pct + '%' + (f.exige_identificacao ? ' · ' + tag('identificação') : '') + (f.exige_contrato ? ' ' + tag('contrato') : '') + (f.exige_caucao ? ' ' + tag('caução') : '') +
              ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-delpol="' + f.id + '">remover</button></div>';
          }).join('') +
          acc('➕ Faixa', campo('pl-de', 'De (R$)', 'text') + campo('pl-ate', 'Até (R$, 0 = sem teto)', 'text') + campo('pl-sin', 'Sinal (%)', 'number') +
            campo('pl-id', 'Exige identificação', 'check') + campo('pl-ct', 'Exige contrato', 'check') + campo('pl-cc', 'Exige caução', 'check'), 'Adicionar', 'b-pol'))
      );
      ligarTodos('data-doc', abrirDoc);
      ligar('b-pol', function () {
        api('POST', '/documentacao/politica', { de_centavos: cent('pl-de'), ate_centavos: cent('pl-ate'), sinal_pct: n('pl-sin'), exige_identificacao: chk('pl-id'), exige_contrato: chk('pl-ct'), exige_caucao: chk('pl-cc') }).then(vDoc).catch(falha);
      });
      ligarTodos('data-delpol', function (id) { api('DELETE', '/documentacao/politica/' + id).then(vDoc).catch(falha); });
    }).catch(erroBox);
  }

  function abrirDoc(reservaId) {
    api('GET', '/documentacao/' + reservaId).then(function (d) {
      var doc = d.documentacao || {}, risco = d.risco;
      el('doc-form').innerHTML = card('Documentação da reserva',
        (risco.pontos_de_atencao.length ? '<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico">🔍</span><div><b>Pontos de atenção</b>' +
          risco.pontos_de_atencao.map(function (p) { return '<p class="vx-mb0">' + esc(p.fato) + '</p>'; }).join('') +
          '<p class="vx-mb0"><b>' + esc(risco.conclusao) + '</b></p><p class="vx-mb0 sub">' + esc(risco.aviso) + '</p></div></div>' : '') +
        (risco.documentacao_pendente.length ? '<div class="lin">A política desta faixa exige: <b>' + esc(risco.documentacao_pendente.join(', ')) + '</b></div>' : '') +
        '<div class="vx-form-grid">' + campo('dc-tit', 'Titular responsável', 'text') + campo('dc-fin', 'Finalidade declarada', 'text') +
        campo('dc-vis', 'Visitantes que não se hospedam', 'number') + campo('dc-sin', 'Sinal recebido (R$)', 'text') +
        campo('dc-cau', 'Caução (R$)', 'text') + campo('dc-venc', 'Saldo vence em', 'date') +
        campo('dc-id', 'Identificação conferida', 'check') + campo('dc-ct', 'Contrato assinado', 'check') +
        campo('dc-sr', 'Saldo recebido', 'check') + campo('dc-reg', 'Regras aceitas em', 'date') + campo('dc-conf', 'Confirmação (8 informações) enviada em', 'date') +
        '</div><div class="vx-btn-row" style="margin-top:14px"><button class="vx-btn" id="b-doc">Salvar</button></div>');
      el('dc-tit').value = doc.titular || ''; el('dc-fin').value = doc.finalidade || ''; el('dc-vis').value = doc.visitantes || '';
      el('dc-sin').value = doc.sinal_centavos ? (doc.sinal_centavos / 100).toFixed(2) : '';
      el('dc-cau').value = doc.caucao_centavos ? (doc.caucao_centavos / 100).toFixed(2) : '';
      el('dc-venc').value = doc.saldo_vence_em || ''; el('dc-id').checked = !!doc.identificacao_ok;
      el('dc-ct').checked = !!doc.contrato_ok; el('dc-sr').checked = !!doc.saldo_recebido;
      el('dc-reg').value = (doc.regras_aceitas_em || '').slice(0, 10); el('dc-conf').value = (doc.confirmacao_enviada_em || '').slice(0, 10);
      ligar('b-doc', function () {
        api('PUT', '/documentacao/' + reservaId, {
          titular: val('dc-tit'), finalidade: val('dc-fin'), visitantes: n('dc-vis'), sinal_centavos: cent('dc-sin'), caucao_centavos: cent('dc-cau'),
          saldo_vence_em: val('dc-venc'), identificacao_ok: chk('dc-id'), contrato_ok: chk('dc-ct'), saldo_recebido: chk('dc-sr'),
          regras_aceitas_em: val('dc-reg'), confirmacao_enviada_em: val('dc-conf'),
        }).then(vDoc).catch(falha);
      });
      el('doc-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }).catch(falha);
  }

  // ===================================================================
  // Cap. 31/34 · RÉGUA DE MENSAGENS
  // ===================================================================
  function vRegua() {
    api('GET', '/regua').then(function (d) {
      var mods = d.modelos.filter(function (m) { return m.idioma === 'pt'; });
      var fila = d.fila;
      var cor = { preparada: 'accent', aprovada: 'ok', enviada: 'ok', contato_pessoal: 'danger', falta_dado: 'warn', descartada: '' };
      setView(
        livro('<b>Caps. 31 e 34 — a régua prepara; quem envia é uma pessoa.</b> Três regras do livro viraram código: a régua <b>sabe o estado da reserva</b>; estadia com problema vira <b>CONTATO PESSOAL</b>, nunca mensagem automática; e cadastro incompleto vira <b>FALTA DADO</b>, em vez de mensagem inventada. Dado de acesso nunca entra no texto (Cap. 32).') +
        '<div class="vx-btn-row"><button class="vx-btn" id="b-prep">Preparar as mensagens dos próximos 7 dias</button></div>' +
        card('Fila para conferência', (fila.length ? fila.map(function (m) {
          return '<div class="lin">' + tag(m.situacao, cor[m.situacao] || '') + ' <b>' + esc(m.modelo) + '</b> · ' + esc(m.hospede || '—') + ' · ' + esc(m.imovel || '') +
            (m.exige_insercao ? ' ' + tag('exige inserção manual do acesso', 'warn') : '') +
            (m.motivo ? '<br><span class="sub">' + esc(m.motivo) + '</span>' : '') +
            (m.texto ? '<pre style="white-space:pre-wrap;font-size:13px;margin:6px 0;padding:8px;background:var(--vx-fundo-2,#f7f7f7);border-radius:8px">' + esc(m.texto) + '</pre>' : '') +
            (m.situacao === 'preparada' ? '<div class="vx-btn-row"><button class="vx-btn vx-btn--sec vx-btn--sm" data-env="' + m.id + '">Marcar como enviada</button>' +
              '<button class="vx-btn vx-btn--ghost vx-btn--sm" data-desc="' + m.id + '">Descartar</button></div>' : '') + '</div>';
        }).join('') : vazio('Fila vazia. Clique acima para preparar as mensagens dos próximos dias.'))) +
        card('Modelos (Apêndice D — quatro idiomas)', mods.map(function (m) {
          return '<div class="lin"><b>' + esc(m.titulo) + '</b> ' + tag(m.gatilho + (m.gatilho === 'dias_antes' ? ' ' + m.dias + 'd' : '')) +
            '<br><span class="sub">' + esc(String(m.texto).slice(0, 220)) + '…</span>' +
            ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-mod="' + esc(m.chave) + '">editar</button></div>';
        }).join('')) +
        '<div id="mod-form"></div>'
      );
      ligar('b-prep', function () {
        el('b-prep').disabled = true; el('b-prep').textContent = 'Preparando…';
        api('POST', '/regua/preparar', { horizonteDias: 7 }).then(function (r) {
          var res = r.resultado;
          alert('Preparadas: ' + res.preparadas.length + '\nContato pessoal: ' + res.contato_pessoal.length + '\nFalta dado: ' + res.falta_dado.length + '\nExceções: ' + res.excecoes.length + '\n\n' + res.nota);
          vRegua();
        }).catch(function (e) { falha(e); vRegua(); });
      });
      ligarTodos('data-env', function (id) { api('POST', '/regua/fila/' + id, { situacao: 'enviada' }).then(vRegua).catch(falha); });
      ligarTodos('data-desc', function (id) { api('POST', '/regua/fila/' + id, { situacao: 'descartada' }).then(vRegua).catch(falha); });
      ligarTodos('data-mod', function (chave) {
        var m = mods.filter(function (x) { return x.chave === chave; })[0];
        if (!m) return;
        el('mod-form').innerHTML = card('Editar modelo — ' + esc(m.titulo),
          '<div class="vx-form-grid">' + campo('md-tit', 'Título', 'text') + campo('md-txt', 'Texto', 'textarea') + '</div>' +
          '<p class="sub">Use ' + esc(d.marcador || '[DADO DE ACESSO — INSERIR NO ENVIO]') + ' onde o acesso entraria. O sistema recusa modelo com senha escrita.</p>' +
          '<div class="vx-btn-row" style="margin-top:14px"><button class="vx-btn" id="b-mod">Salvar modelo</button></div>');
        el('md-tit').value = m.titulo; el('md-txt').value = m.texto;
        el('md-txt').rows = 10;
        ligar('b-mod', function () {
          api('POST', '/regua/modelos', { chave: m.chave, idioma: 'pt', gatilho: m.gatilho, dias: m.dias, titulo: val('md-tit'), texto: val('md-txt') }).then(vRegua).catch(falha);
        });
        el('mod-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 31/33 · MANUAL DO HÓSPEDE
  // ===================================================================
  function vManual() {
    carregarImoveis().then(function () {
      if (!IMOVEIS.length) return setView(vazio('Cadastre um imóvel primeiro.'));
      var atual = IMOVEIS[0].id;
      function pintar() {
        api('GET', '/manual/' + atual).then(function (d) {
          setView(
            livro('<b>Caps. 31 e 33 — o hóspede não quer falar com você; ele quer resolver.</b> O manual é buscável por assunto, sai do cadastro mestre e <b>nunca</b> guarda senha ou código de acesso. É também a fonte autorizada do concierge: o que não está aqui, ele escala.') +
            '<div class="vx-campo" style="max-width:320px"><label for="mn-im">Unidade</label><select id="mn-im">' +
            IMOVEIS.map(function (i) { return '<option value="' + esc(i.id) + '"' + (i.id === atual ? ' selected' : '') + '>' + esc(i.nome) + '</option>'; }).join('') + '</select></div>' +
            card('Link público do manual', '<div class="lin"><a href="' + esc(d.link.url) + '" target="_blank" rel="noopener">' + esc(d.link.url) + '</a></div>' +
              '<p class="sub">Sem login, sem dado pessoal, sem acesso. Coloque um QR code dentro da casa.</p>' +
              '<div class="vx-btn-row"><button class="vx-btn vx-btn--ghost vx-btn--sm" id="b-regen">Gerar novo link (invalida o antigo)</button></div>') +
            card('Seções', (d.secoes.length ? d.secoes.map(function (s2) {
              return '<div class="lin"><b>' + esc(s2.assunto) + '</b><br><span class="sub">' + esc(String(s2.corpo).slice(0, 200)) + '</span> <button class="vx-btn vx-btn--ghost vx-btn--sm" data-delmn="' + s2.id + '">remover</button></div>';
            }).join('') : vazio('Nenhuma seção. O controle do ar-condicionado é a dúvida número um do setor — comece por ela.')) +
              acc('➕ Nova seção', campo('mn-ass', 'Assunto', 'text') + campo('mn-corpo', 'Conteúdo', 'textarea') + campo('mn-ord', 'Ordem', 'number'), 'Adicionar', 'b-mn'))
          );
          el('mn-im').onchange = function () { atual = el('mn-im').value; pintar(); };
          ligar('b-mn', function () {
            api('POST', '/manual', { imovel_id: atual, assunto: val('mn-ass'), corpo: val('mn-corpo'), ordem: n('mn-ord') }).then(pintar).catch(falha);
          });
          ligarTodos('data-delmn', function (id) { api('DELETE', '/manual/' + id).then(pintar).catch(falha); });
          ligar('b-regen', function () {
            if (!confirm('Gerar um novo link? O antigo deixa de funcionar.')) return;
            api('POST', '/manual/' + atual + '/regerar-link', {}).then(pintar).catch(falha);
          });
        }).catch(erroBox);
      }
      pintar();
    });
  }

  // ===================================================================
  // Cap. 33 · CONCIERGE
  // ===================================================================
  function vConcierge() {
    api('GET', '/concierge').then(function (d) {
      var porCat = {};
      d.gatilhos.forEach(function (g) { (porCat[g.categoria] = porCat[g.categoria] || []).push(g); });
      setView(
        livro('<b>Cap. 33 — a máquina resolve o que é informação e para no que é situação.</b> A verificação de escalonamento roda <b>antes</b> de qualquer tentativa de resposta: um agente que primeiro tenta responder vai, mais cedo ou mais tarde, dar uma resposta educada a uma emergência.') +
        card('Testar uma mensagem de hóspede',
          '<div class="vx-form-grid">' + campo('cg-msg', 'Mensagem recebida', 'textarea') + '</div>' +
          '<div class="vx-btn-row" style="margin-top:12px"><button class="vx-btn" id="b-triar">Triar</button></div><div id="cg-out"></div>') +
        card('Plantão <span class="sub">(escalonar para ninguém não é escalonar)</span>',
          (d.plantao.length ? d.plantao.map(function (p) {
            return '<div class="lin"><b>' + esc(p.faixa) + '</b> · ' + esc(p.responsavel || '—') + ' · ' + esc(p.contato || '') + ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-delpl="' + p.id + '">remover</button></div>';
          }).join('') : '<div class="vx-alerta vx-alerta--danger"><span class="vx-alerta-ico">⚠️</span><div><p class="vx-mb0">Nenhum plantão definido. Sem isto, nenhum concierge automatizado deveria ser ligado.</p></div></div>') +
          acc('➕ Faixa de plantão', campo('pl-faixa', 'Faixa (ex.: 08:00-20:00)', 'text') + campo('pl-resp', 'Responsável', 'text') + campo('pl-cont', 'Contato', 'text'), 'Adicionar', 'b-plant')) +
        card('Gatilhos de escalonamento <span class="sub">(por assunto, nunca por sentimento)</span>',
          Object.keys(porCat).map(function (c) {
            return '<div class="lin"><b>' + esc(c) + '</b><br>' + porCat[c].map(function (g) {
              return '<span class="tag" style="margin:2px">' + esc(g.termo) + ' <a href="#" data-delgat="' + g.id + '" style="text-decoration:none">×</a></span>';
            }).join(' ') + '</div>';
          }).join('') +
          acc('➕ Gatilho', campo('gt-termo', 'Termo', 'text') + sel('gt-cat', 'Categoria', [['emergencia', 'Emergência'], ['seguranca', 'Segurança'], ['acesso', 'Acesso'], ['dinheiro', 'Dinheiro'], ['reserva', 'Reserva'], ['insatisfacao', 'Insatisfação'], ['pessoa', 'Pedido de pessoa']]), 'Adicionar', 'b-gat')) +
        (d.assuntos.length ? card('Dúvidas sem fonte no manual <span class="sub">(viram seção — Cap. 33)</span>',
          d.assuntos.map(function (a) { return '<div class="lin">' + esc(a.termo) + ' · ' + a.ocorrencias + ' vez(es) <span class="sub">' + esc(a.acao) + '</span></div>'; }).join('')) : '') +
        card('Triagens registradas', (d.triagens.length ? d.triagens.slice(0, 20).map(function (t) {
          return '<div class="lin">' + tag(t.decisao, t.decisao === 'escalonar' ? 'danger' : t.decisao === 'responder' ? 'ok' : 'warn') + ' ' + dt(t.quando) +
            '<br><span class="sub">' + esc(String(t.mensagem).slice(0, 160)) + '</span></div>';
        }).join('') : vazio('Nenhuma triagem ainda.')))
      );
      ligar('b-triar', function () {
        api('POST', '/concierge/triar', { mensagem: val('cg-msg') }).then(function (r) {
          var t = r.triagem;
          el('cg-out').innerHTML = '<div class="vx-alerta vx-alerta--' + (t.decisao === 'escalonar' ? 'danger' : t.decisao === 'responder' ? 'ok' : 'warn') + '">' +
            '<span class="vx-alerta-ico">' + (t.decisao === 'escalonar' ? '🚨' : t.decisao === 'responder' ? '💬' : '❓') + '</span><div>' +
            '<b>' + esc(t.decisao.toUpperCase()) + '</b><p class="vx-mb0">' + esc(t.motivo) + '</p>' +
            (t.resposta ? '<p class="vx-mb0" style="margin-top:8px">' + esc(t.resposta) + '</p><p class="vx-mb0 sub">Fonte: ' + esc(t.fonte) + '</p>' : '') +
            (t.alerta_plantao ? '<p class="vx-mb0"><b>' + esc(t.alerta_plantao) + '</b></p>' : '') +
            '<p class="vx-mb0 sub">' + esc(t.sempre_oferecer_pessoa) + '</p></div></div>';
        }).catch(falha);
      });
      ligar('b-plant', function () { api('POST', '/concierge/plantao', { faixa: val('pl-faixa'), responsavel: val('pl-resp'), contato: val('pl-cont') }).then(vConcierge).catch(falha); });
      ligarTodos('data-delpl', function (id) { api('DELETE', '/concierge/plantao/' + id).then(vConcierge).catch(falha); });
      ligar('b-gat', function () { api('POST', '/concierge/gatilhos', { termo: val('gt-termo'), categoria: val('gt-cat') }).then(vConcierge).catch(falha); });
      ligarTodos('data-delgat', function (id) { api('DELETE', '/concierge/gatilhos/' + id).then(vConcierge).catch(falha); });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 29 · REPUTAÇÃO
  // ===================================================================
  function vReputacao() {
    Promise.all([carregarImoveis(), api('GET', '/reputacao')]).then(function (r) {
      var d = r[1], dg = d.diagnostico;
      setView(
        livro('<b>Cap. 29 — uma crítica é uma opinião; três críticas sobre a mesma coisa são um relatório de manutenção que você recebeu de graça.</b> Agrupe por assunto, classifique em físico, processo ou expectativa, e ordene por impacto. Comece por <b>expectativa</b>: resolve no anúncio, sem gastar nada.') +
        card('Diagnóstico', '<div class="lin">' + dg.avaliacoes + ' avaliação(ões) nos últimos ' + dg.periodo_meses + ' meses · nota média <b>' + (dg.nota_media || '—') + '</b></div>' +
          (dg.itens.length ? dg.itens.map(function (i) {
            return '<div class="lin"><b>' + esc(i.assunto) + '</b> ' + tag(i.classe, i.classe === 'expectativa' ? 'ok' : i.classe === 'fisico' ? 'warn' : '') +
              ' · ' + i.mencoes + ' menção(ões) · nota quando citado ' + i.nota_media_quando_citado + ' · impacto <b>' + i.impacto + '</b>' +
              ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-corr="' + esc(i.assunto) + '|' + esc(i.classe) + '">registrar correção</button></div>';
          }).join('') : vazio('Nenhum assunto classificado ainda. Ao registrar uma avaliação, marque o assunto concreto: chuveiro, barulho, wi-fi, limpeza, chegada.')) +
          '<p class="sub" style="margin-top:8px">' + esc(dg.nota) + '</p>') +
        card('O ciclo se fechou?', (d.ciclo.length ? d.ciclo.map(function (c) {
          var v = c.status === 'RESOLVIDO' ? 'ok' : c.status === 'PERSISTENTE' ? 'danger' : 'warn';
          return '<div class="lin"><b>' + esc(c.assunto) + '</b> ' + tag(c.status, v) + ' <span class="sub">corrigido em ' + dt(c.corrigido_em) + ' · ' + c.mencoes_antes + ' menções antes → ' + c.mencoes_depois + ' depois · ' + c.estadias_avaliadas_depois + ' avaliações desde então</span>' +
            (c.observacao ? '<br><span class="sub">' + esc(c.observacao) + '</span>' : '') + '</div>';
        }).join('') : vazio('Nenhuma correção registrada. Diagnóstico que não vira ação é entretenimento.'))) +
        card('Avaliações', (d.avaliacoes.length ? d.avaliacoes.slice(0, 30).map(function (a) {
          return '<div class="lin"><b>' + (a.nota || '—') + '</b> ' + tag(a.canal) + ' ' + dt(a.data) + ' · ' + esc(a.imovel || '') +
            '<br><span class="sub">' + esc(String(a.texto).slice(0, 220)) + '</span>' +
            (a.assuntos.length ? '<br>' + a.assuntos.map(function (x) { return tag(x.assunto + ' / ' + x.classe); }).join(' ') : '') +
            (a.respondida_em ? ' ' + tag('respondida', 'ok') : ' <button class="vx-btn vx-btn--ghost vx-btn--sm" data-resp="' + a.id + '">rascunhar resposta</button>') + '</div>';
        }).join('') : vazio('Nenhuma avaliação registrada.')) +
          acc('➕ Registrar avaliação', sel('av-im', 'Unidade', opcoesImoveis(true)) + campo('av-canal', 'Canal', 'text') + campo('av-nota', 'Nota (0–5)', 'number') +
            campo('av-data', 'Data', 'date') + campo('av-texto', 'Texto', 'textarea') +
            campo('av-ass', 'Assuntos concretos (um por linha)', 'textarea') +
            sel('av-cls', 'Classe predominante', [['fisico', 'Físico — resolve com manutenção'], ['processo', 'Processo — resolve com POP'], ['expectativa', 'Expectativa — resolve no anúncio']]), 'Registrar', 'b-av'))
      );
      ligar('b-av', function () {
        var ass = (el('av-ass').value || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        api('POST', '/reputacao/avaliacoes', {
          imovel_id: val('av-im'), canal: val('av-canal') || 'direto', nota: n('av-nota'), data: val('av-data') || hojeISO, texto: val('av-texto'),
          assuntos: ass.map(function (a) { return { assunto: a, classe: val('av-cls') }; }),
        }).then(vReputacao).catch(falha);
      });
      ligarTodos('data-resp', function (id) {
        var t = prompt('Resposta pública. Lembre: o destinatário real é o PRÓXIMO hóspede, e nada do hóspede atual pode ser exposto.');
        if (!t) return;
        api('POST', '/reputacao/avaliacoes/' + id + '/responder', { resposta: t }).then(vReputacao).catch(falha);
      });
      ligarTodos('data-corr', function (v) {
        var p = v.split('|');
        api('POST', '/reputacao/correcoes', { assunto: p[0], classe: p[1], corrigido_em: hojeISO }).then(vReputacao).catch(falha);
      });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 22 + Apêndice F · INDICADORES
  // ===================================================================
  function vMetricas() {
    var agora = new Date(), ano = agora.getUTCFullYear(), mes = agora.getUTCMonth() + 1;
    function pintar() {
      api('GET', '/metricas?ano=' + ano + '&mes=' + mes).then(function (d) {
        var m = d.metricas, va = m.variacao_anual;
        // ocupação varia em PONTOS (é um percentual); o resto varia em %
        var seta = function (x, unidade) {
          if (x === 0) return 'igual ao';
          return (x > 0 ? '▲ ' : '▼ ') + Math.abs(x) + (unidade || '%') + ' vs. o';
        };
        var kpi = function (rot, valor, varia, unidade) {
          return '<div class="lin"><span class="sub">' + rot + '</span><br><b style="font-size:20px">' + valor + '</b>' +
            (varia !== undefined ? ' <span class="sub">' + seta(varia, unidade) + ' mesmo mês do ano anterior</span>' : '') + '</div>';
        };
        setView(
          livro('<b>Cap. 22 — a maior parte das discussões sobre números não é sobre os números; é sobre definições.</b> Por isso todo relatório aqui declara a convenção que usa, no cabeçalho.') +
          card('Convenções deste relatório', Object.keys(m.convencoes).filter(function (k) { return k !== 'reconhecimento_configurado'; }).map(function (k) {
            return '<div class="lin"><b>' + esc(k.replace(/_/g, ' ')) + ':</b> ' + esc(m.convencoes[k]) + '</div>';
          }).join('')) +
          '<div class="vx-btn-row"><button class="vx-btn vx-btn--ghost vx-btn--sm" id="b-ant">◀ mês anterior</button><span class="tag">' + mes + '/' + ano + '</span><button class="vx-btn vx-btn--ghost vx-btn--sm" id="b-prox">mês seguinte ▶</button></div>' +
          card('Os seis do painel', kpi('Ocupação', pct(m.total.ocupacao), va.ocupacao, ' pontos') + kpi('ADR (diária média, sem taxa de limpeza)', brl(m.total.adr_centavos), va.adr) +
            kpi('RevPAR', brl(m.total.revpar_centavos), va.revpar) + kpi('Receita líquida', brl(m.total.receita_liquida_centavos), va.receita_liquida) +
            kpi('Reservas', m.total.reservas, va.reservas) + kpi('Nota média', m.total.nota_media == null ? '—' : m.total.nota_media),
            esc(m.comparacao)) +
          card('Por espaço físico', m.por_espaco.map(function (l) {
            return '<div class="lin"><b>' + esc(l.unidades.join(' + ')) + '</b>' + (l.interligado ? ' ' + tag('interligado — conta uma vez', 'accent') : '') +
              '<br><span class="sub">ocupação ' + pct(l.ocupacao) + ' · ADR ' + brl(l.adr_centavos) + ' · RevPAR ' + brl(l.revpar_centavos) +
              ' · líquida ' + brl(l.receita_liquida_centavos) + ' · ' + l.reservas + ' reserva(s) · estadia média ' + l.estadia_media + ' noites' +
              (l.noites_bloqueadas ? ' · ' + l.noites_bloqueadas + ' noite(s) bloqueada(s)' : '') + '</span></div>';
          }).join('') || vazio('Sem dados no período.')) +
          card('Alertas <span class="sub">(raros de propósito)</span>', (d.alertas.alertas.length ? d.alertas.alertas.map(function (a) {
            return '<div class="lin">' + tag(a.nivel, a.nivel === 'alto' ? 'warn' : '') + ' ' + esc(a.texto) + '</div>';
          }).join('') : vazio('Nenhum alerta.')) + '<p class="sub">' + esc(d.alertas.nota) + '</p>') +
          card('Dicionário de métricas <span class="sub">(uma definição, um lugar)</span>', m.dicionario.map(function (x) {
            return '<div class="lin"><b>' + esc(x.nome) + '</b> = <code>' + esc(x.formula) + '</code><br><span class="sub">' + esc(x.nota) + '</span></div>';
          }).join(''))
        );
        ligar('b-ant', function () { mes--; if (mes < 1) { mes = 12; ano--; } pintar(); });
        ligar('b-prox', function () { mes++; if (mes > 12) { mes = 1; ano++; } pintar(); });
      }).catch(erroBox);
    }
    pintar();
  }

  // ===================================================================
  // Cap. 40 · DRE POR UNIDADE
  // ===================================================================
  function vDre() {
    var agora = new Date(), ano = agora.getUTCFullYear(), mes = agora.getUTCMonth() + 1;
    function pintar() {
      Promise.all([api('GET', '/dre?ano=' + ano + '&mes=' + mes), api('GET', '/financeiro/config')]).then(function (r) {
        var d = r[0].dre, cfg = r[1].config;
        var l = function (rot, v, forte) { return '<div class="lin"' + (forte ? ' style="font-weight:600"' : '') + '><span>' + rot + '</span> <b style="float:right">' + brl(v) + '</b></div>'; };
        setView(
          livro('<b>Cap. 40 — financeiro de hospedagem não se faz no consolidado. Se faz por imóvel.</b> Uma unidade ruim dentro de um portfólio bom é invisível até você separar as contas.') +
          '<div class="vx-btn-row"><button class="vx-btn vx-btn--ghost vx-btn--sm" id="b-ant">◀</button><span class="tag">' + mes + '/' + ano + ' · visão ' + esc(d.visao) + '</span><button class="vx-btn vx-btn--ghost vx-btn--sm" id="b-prox">▶</button></div>' +
          d.linhas.map(function (x) {
            return card(esc(x.nome) + ' <span class="sub">' + x.reservas + ' reserva(s) · ' + x.noites_ocupadas + ' noite(s)</span>',
              l('Receita de hospedagem', x.receita_hospedagem_centavos) +
              l('+ Taxas e serviços (reembolso de custo)', x.taxas_extras_e_servicos_centavos) +
              l('= Receita bruta', x.receita_bruta_centavos, true) +
              l('− Comissões de canal', -x.comissoes_centavos) +
              l('= Receita líquida', x.receita_liquida_centavos, true) +
              l('− Custos variáveis', -x.custos_variaveis_centavos) +
              l('= Margem de contribuição', x.margem_contribuicao_centavos, true) +
              l('− Custos fixos da unidade (com rateio)', -x.custos_fixos_centavos) +
              l('− Provisões (manutenção, reposição, vacância)', -x.provisoes_centavos) +
              l('= Resultado da unidade', x.resultado_unidade_centavos, true) +
              (x.remuneracao_administradora_centavos ? l('− Remuneração da administradora', -x.remuneracao_administradora_centavos) + l('= Resultado do proprietário', x.resultado_proprietario_centavos, true) : '') +
              '<div class="lin" style="margin-top:8px"><span class="sub">Margem operacional ' + pct(x.margem_operacional) + ' · lucro por reserva ' + brl(x.lucro_por_reserva_centavos) + '</span></div>' +
              (x.alerta_margem_contribuicao ? '<div class="vx-alerta vx-alerta--danger"><span class="vx-alerta-ico">⚠️</span><div><p class="vx-mb0">' + esc(x.alerta_margem_contribuicao) + '</p></div></div>' : ''));
          }).join('') +
          (d.a_conferir.length ? card('A conferir <span class="sub">(nunca classificado por suposição)</span>', d.a_conferir.map(function (x) {
            return '<div class="lin">' + esc(x.descricao || '(sem descrição)') + ' · ' + brl(x.valor_centavos) + '<br><span class="sub">' + esc(x.motivo) + '</span></div>';
          }).join('')) : '') +
          card('Caução em posse', '<div class="lin">' + brl(d.caucao) + '</div><p class="sub">' + esc(d.nota_caucao) + '</p>') +
          card('Convenções e configuração',
            '<div class="lin">Rateio de custos comuns: <b>' + esc(d.rateio.criterio) + '</b> · total comum no mês ' + brl(d.rateio.total_comum_centavos) + '<br><span class="sub">' + esc(d.rateio.nota) + '</span></div>' +
            '<div class="vx-form-grid" style="margin-top:12px">' +
            sel('cf-rat', 'Critério de rateio', [['receita', 'Por receita'], ['unidades', 'Por número de unidades'], ['noites', 'Por noites ocupadas']]) +
            campo('cf-man', 'Provisão de manutenção (%)', 'number') + campo('cf-rep', 'Provisão de reposição (%)', 'number') +
            campo('cf-vac', 'Provisão de vacância (%)', 'number') + campo('cf-com', 'Comissão padrão do canal (%)', 'number') +
            '</div><div class="vx-btn-row" style="margin-top:12px"><button class="vx-btn" id="b-cfg">Salvar</button></div>')
        );
        el('cf-rat').value = cfg.rateio_criterio; el('cf-man').value = cfg.provisao_manutencao_pct;
        el('cf-rep').value = cfg.provisao_reposicao_pct; el('cf-vac').value = cfg.provisao_vacancia_pct; el('cf-com').value = cfg.comissao_padrao_pct;
        ligar('b-ant', function () { mes--; if (mes < 1) { mes = 12; ano--; } pintar(); });
        ligar('b-prox', function () { mes++; if (mes > 12) { mes = 1; ano++; } pintar(); });
        ligar('b-cfg', function () {
          api('PUT', '/financeiro/config', { rateio_criterio: val('cf-rat'), provisao_manutencao_pct: n('cf-man'), provisao_reposicao_pct: n('cf-rep'), provisao_vacancia_pct: n('cf-vac'), comissao_padrao_pct: n('cf-com') }).then(pintar).catch(falha);
        });
      }).catch(erroBox);
    }
    pintar();
  }

  // ===================================================================
  // Cap. 12 · PROPRIETÁRIOS
  // ===================================================================
  function vProprietarios() {
    Promise.all([carregarImoveis(), api('GET', '/proprietarios')]).then(function (r) {
      var ps = r[1].proprietarios;
      setView(
        livro('<b>Cap. 12 — administradora não perde imóvel por ocupação baixa. Perde por silêncio.</b> A prestação de contas é o produto que você vende ao proprietário. E a compartimentação é garantida por <b>arquitetura</b>: cada relatório só alcança as unidades daquele proprietário — nem comparação anonimizada.') +
        card('Proprietários', (ps.length ? ps.map(function (p) {
          return '<div class="lin"><b>' + esc(p.nome) + '</b> · ' + p.remuneracao_pct + '% sobre o ' + esc(p.base_calculo) +
            (p.fundo_manutencao_pct ? ' · fundo ' + p.fundo_manutencao_pct + '%' : '') + ' · repasse dia ' + p.repasse_dia +
            (p.dias_sem_contato != null ? ' ' + tag(p.dias_sem_contato + ' dias sem contato', p.dias_sem_contato > 60 ? 'warn' : '') : ' ' + tag('nunca contatado', 'warn')) +
            '<br><span class="sub">Imóveis: ' + (p.imoveis.map(function (i) { return esc(i.nome); }).join(', ') || 'nenhum vinculado') + '</span>' +
            '<div class="vx-btn-row" style="margin-top:6px">' +
            '<button class="vx-btn vx-btn--sec vx-btn--sm" data-rel="' + p.id + '">Prestação de contas</button>' +
            '<button class="vx-btn vx-btn--ghost vx-btn--sm" data-port="' + p.id + '">' + (p.tem_portal ? 'Ver link do portal' : 'Criar portal') + '</button>' +
            '<button class="vx-btn vx-btn--ghost vx-btn--sm" data-cont="' + p.id + '">Registrei contato hoje</button></div></div>';
        }).join('') : vazio('Nenhum proprietário. Vale montar mesmo quando o proprietário é você — foi assim que eu descobri que uma casa dava prejuízo.')) +
          acc('➕ Proprietário', campo('pr-nome', 'Nome', 'text') + campo('pr-cont', 'Contato', 'text') + campo('pr-mail', 'E-mail', 'email') +
            campo('pr-rem', 'Remuneração (%)', 'number') + sel('pr-base', 'Base de cálculo (literal no contrato)', [['liquido', 'Sobre a receita LÍQUIDA'], ['bruto', 'Sobre a receita BRUTA']]) +
            campo('pr-fundo', 'Fundo de manutenção (%)', 'number') + campo('pr-aut', 'Limite de autonomia para gasto (R$)', 'text') +
            campo('pr-eme', 'Limite de emergência (R$)', 'text') + campo('pr-dia', 'Dia do repasse', 'number'), 'Cadastrar', 'b-prop')) +
        card('Vincular imóvel a proprietário',
          '<div class="vx-form-grid">' + sel('vi-im', 'Imóvel', opcoesImoveis(false)) + sel('vi-pr', 'Proprietário', ps.map(function (p) { return [p.id, p.nome]; })) + '</div>' +
          '<div class="vx-btn-row" style="margin-top:12px"><button class="vx-btn" id="b-vinc">Vincular</button></div>') +
        '<div id="prop-rel"></div>'
      );
      ligar('b-prop', function () {
        api('POST', '/proprietarios', {
          nome: val('pr-nome'), contato: val('pr-cont'), email: val('pr-mail'), remuneracao_pct: n('pr-rem') || 20, base_calculo: val('pr-base'),
          fundo_manutencao_pct: n('pr-fundo'), limite_autonomia_centavos: cent('pr-aut'), limite_emergencia_centavos: cent('pr-eme'), repasse_dia: n('pr-dia') || 10,
        }).then(vProprietarios).catch(falha);
      });
      ligar('b-vinc', function () { api('POST', '/proprietarios/vincular', { imovel_id: val('vi-im'), proprietario_id: val('vi-pr') }).then(vProprietarios).catch(falha); });
      ligarTodos('data-port', function (id) {
        api('POST', '/proprietarios/' + id + '/portal', {}).then(function (r2) {
          prompt('Link do portal do proprietário (só as unidades dele):', location.origin + r2.url);
        }).catch(falha);
      });
      ligarTodos('data-cont', function (id) { api('POST', '/proprietarios/' + id + '/contato', {}).then(vProprietarios).catch(falha); });
      ligarTodos('data-rel', function (id) {
        var agora = new Date();
        api('GET', '/proprietarios/' + id + '/relatorio?ano=' + agora.getUTCFullYear() + '&mes=' + (agora.getUTCMonth() + 1)).then(function (r2) {
          var rel = r2.relatorio;
          el('prop-rel').innerHTML = card('Prestação de contas — ' + esc(rel.proprietario.nome) + ' <span class="sub">' + rel.periodo.mes + '/' + rel.periodo.ano + '</span>',
            '<p class="sub">' + esc(rel.compartimentacao) + '</p>' +
            rel.blocos.map(function (b) {
              return '<h4 style="margin-top:14px">' + esc(b.imovel) + '</h4>' +
                (b.resultado ? '<div class="lin">Receita bruta <b style="float:right">' + brl(b.resultado.receita_bruta_centavos) + '</b></div>' +
                  '<div class="lin">− Comissões <b style="float:right">' + brl(-b.resultado.comissoes_centavos) + '</b></div>' +
                  '<div class="lin">= Receita líquida <b style="float:right">' + brl(b.resultado.receita_liquida_centavos) + '</b></div>' +
                  '<div class="lin">− Remuneração <b style="float:right">' + brl(-b.resultado.remuneracao_administradora_centavos) + '</b></div>' +
                  '<div class="lin"><b>= Repasse</b> <b style="float:right">' + brl(b.resultado.repasse_centavos) + '</b></div>' : '') +
                '<div class="lin"><span class="sub">Ocupação ' + pct(b.operacao.ocupacao) + ' (ano anterior ' + pct(b.operacao.ocupacao_ano_anterior) + ') · ADR ' + brl(b.operacao.adr_centavos) + ' · ' + b.operacao.reservas + ' reserva(s)</span></div>' +
                (b.avaliacoes.nota_media != null ? '<div class="lin"><span class="sub">Nota média ' + b.avaliacoes.nota_media + '</span></div>' : '') +
                (b.hipoteses.length ? b.hipoteses.map(function (h) { return '<div class="lin">' + tag('hipótese a conferir', 'warn') + ' ' + esc(h) + '</div>'; }).join('') : '');
            }).join('') +
            (rel.exigem_autorizacao.length ? '<h4 style="margin-top:12px">Precisa da autorização dele</h4>' + rel.exigem_autorizacao.map(function (x) { return '<div class="lin">' + esc(x) + '</div>'; }).join('') : '') +
            '<div class="vx-alerta vx-alerta--warn" style="margin-top:12px"><span class="vx-alerta-ico">✋</span><div><p class="vx-mb0">' + esc(rel.aviso_envio) + '</p></div></div>');
          el('prop-rel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }).catch(falha);
      });
    }).catch(erroBox);
  }

  // ===================================================================
  // Cap. 8 · GOVERNANÇA
  // ===================================================================
  function vGovernanca() {
    api('GET', '/governanca').then(function (d) {
      var rv = d.revisao;
      var nivel = function (x) { return x === 'le_escreve' ? '<b>lê e escreve</b>' : x === 'le' ? 'lê' : '—'; };
      setView(
        livro('<b>Cap. 8 — governança de informação é o que impede que a sua automação faça, em três segundos, algo que você levaria dez minutos decidindo não fazer.</b> Agente entra na matriz como se fosse pessoa, com uma diferença: <b>a permissão dele é sempre mais estreita</b>.') +
        (rv.alertas.length ? '<div class="vx-alerta vx-alerta--warn"><span class="vx-alerta-ico">🔍</span><div><b>Revisão de acessos</b>' +
          rv.alertas.map(function (a) { return '<p class="vx-mb0">' + esc(a.papel) + ': ' + esc(a.texto) + '</p>'; }).join('') + '</div></div>' : '') +
        card('As sete decisões que nunca são automáticas', rv.decisoes_humanas.map(function (x) {
          return '<div class="lin"><b>' + x.n + '. ' + esc(x.titulo) + '</b><br><span class="sub">' + esc(x.detalhe) + '</span></div>';
        }).join('') +
          '<h4 style="margin-top:12px">E o que a máquina PODE fazer sozinha</h4><p>' + rv.pode_sozinha.map(function (x) { return '<span class="tag" style="margin:2px">' + esc(x) + '</span>'; }).join(' ') + '</p>' +
          '<p class="sub">Se essa segunda lista não for generosa, ninguém usa o sistema — e um sistema que ninguém usa não protege nada.</p>') +
        card('Matriz de permissões',
          '<div style="overflow-x:auto"><table class="vx-tabela"><thead><tr><th>Papel</th><th>Hóspede</th><th>Operação</th><th>Financeiro</th><th>Proprietário</th><th>Contratos</th></tr></thead><tbody>' +
          rv.papeis.map(function (p) {
            return '<tr><td>' + esc(p.papel.replace(/_/g, ' ')) + (p.eh_agente ? ' ' + tag('agente', 'accent') : '') + '</td><td>' + nivel(p.hospede) + '</td><td>' + nivel(p.operacao) + '</td><td>' + nivel(p.financeiro) + '</td><td>' + nivel(p.proprietario) + '</td><td>' + nivel(p.contratos) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          acc('➕ Papel', campo('pm-papel', 'Papel', 'text') +
            sel('pm-h', 'Hóspede (identificação)', [['', '—'], ['le', 'lê'], ['le_escreve', 'lê e escreve']]) +
            sel('pm-o', 'Reserva/operação', [['', '—'], ['le', 'lê'], ['le_escreve', 'lê e escreve']]) +
            sel('pm-f', 'Financeiro', [['', '—'], ['le', 'lê'], ['le_escreve', 'lê e escreve']]) +
            sel('pm-p', 'Proprietário', [['', '—'], ['le', 'lê'], ['le_escreve', 'lê e escreve']]) +
            sel('pm-c', 'Contratos', [['', '—'], ['le', 'lê'], ['le_escreve', 'lê e escreve']]) +
            campo('pm-ag', 'É um agente (permissão mais estreita)', 'check'), 'Salvar papel', 'b-perm')) +
        card('Trilha de auditoria <span class="sub">(o que era antes, quem mudou, e quando)</span>',
          (d.auditoria.length ? d.auditoria.slice(0, 60).map(function (a) {
            return '<div class="lin">' + dt(a.quando) + ' · <b>' + esc(a.acao) + '</b> · ' + esc(a.entidade) + ' ' + esc(a.entidade_id) + ' <span class="sub">' + esc(a.quem || 'sistema') + '</span></div>';
          }).join('') : vazio('Sem registros.')))
      );
      ligar('b-perm', function () {
        api('POST', '/governanca/permissoes', {
          papel: val('pm-papel'), hospede: val('pm-h'), operacao: val('pm-o'), financeiro: val('pm-f'),
          proprietario: val('pm-p'), contratos: val('pm-c'), eh_agente: chk('pm-ag'),
        }).then(vGovernanca).catch(falha);
      });
    }).catch(erroBox);
  }

  // ===================================================================
  // Apêndices A/E + Caps. 39/47/49 · BIBLIOTECA DO LIVRO
  // ===================================================================
  function vBiblioteca() {
    Promise.all([api('GET', '/pops'), api('GET', '/prompts'), api('GET', '/catalogos')]).then(function (r) {
      var pops = r[0].pops, crises = r[0].crises, prompts = r[1].prompts, cat = r[2].catalogos;
      var porArea = {};
      prompts.forEach(function (p) { (porArea[p.area] = porArea[p.area] || []).push(p); });
      setView(
        livro('<b>O livro, dentro do sistema.</b> Os onze checklists do Apêndice E, o catálogo de crises do Cap. 39 e a biblioteca de prompts dos capítulos — tudo editável, porque é material de partida, não configuração.') +
        card('Roteiro de adoção <span class="sub">(Cap. 49 — a ordem importa: frequência × custo do erro × clareza da fonte)</span>',
          [1, 2, 3].map(function (nv) {
            var itens = cat.roteiro_adocao.filter(function (x) { return x.nivel === nv; });
            return '<h4 style="margin-top:10px">Nível ' + nv + ' — ' + (nv === 1 ? 'os que rodam todo dia' : nv === 2 ? 'os que organizam o negócio' : 'os que dão cara de empresa') + '</h4>' +
              itens.map(function (x) {
                return '<div class="lin"><b>' + esc(x.titulo) + '</b> <span class="sub">' + esc(x.capitulo) + '</span> <button class="vx-btn vx-btn--ghost vx-btn--sm" data-ir="' + esc(x.aba) + '">abrir</button>' +
                  '<br><span class="sub">' + esc(x.porque) + '</span></div>';
              }).join('');
          }).join('') +
          '<h4 style="margin-top:14px">O que NÃO construir</h4>' +
          cat.nao_construir.map(function (x) { return '<div class="lin"><b>' + esc(x.item) + '</b><br><span class="sub">' + esc(x.porque) + '</span></div>'; }).join('')) +
        card('Checklists (Apêndice E)', pops.map(function (p) {
          return '<details class="vx-acc"><summary>' + esc(p.titulo) + '</summary><div class="vx-acc-corpo">' +
            p.blocos.map(function (b) {
              return '<h4>' + esc(b.titulo) + '</h4><ul>' + b.itens.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
            }).join('') + '</div></details>';
        }).join('')) +
        card('Catálogo de crises (Cap. 39)', crises.map(function (c) {
          return '<details class="vx-acc"><summary>' + esc(c.titulo) + '</summary><div class="vx-acc-corpo">' +
            '<p><b>Como se detecta:</b> ' + esc(c.deteccao) + '</p>' +
            '<p><b>Quem decide:</b> ' + esc(c.quem_decide) + '</p>' +
            '<p><b>Primeiras 2 horas:</b> ' + esc(c.primeiras_2h) + '</p>' +
            '<p><b>O que se diz ao hóspede:</b> ' + esc(c.o_que_dizer) + '</p>' +
            '<p><b>Quem paga:</b> ' + esc(c.quem_paga) + '</p></div></details>';
        }).join('')) +
        card('Biblioteca de prompts', Object.keys(porArea).map(function (a) {
          return '<h4 style="margin-top:10px">' + esc(a) + '</h4>' + porArea[a].map(function (p) {
            return '<details class="vx-acc"><summary>' + esc(p.titulo) + ' <span class="sub">' + esc(p.capitulo) + '</span></summary><div class="vx-acc-corpo">' +
              '<pre style="white-space:pre-wrap;font-size:13px">' + esc(p.corpo) + '</pre>' +
              '<div class="vx-btn-row"><button class="vx-btn vx-btn--sec vx-btn--sm" data-copy="' + esc(p.chave) + '">Copiar</button></div></div></details>';
          }).join('');
        }).join(''))
      );
      ligarTodos('data-ir', function (aba) { V.ir(aba); });
      ligarTodos('data-copy', function (chave) {
        var p = prompts.filter(function (x) { return x.chave === chave; })[0];
        if (!p) return;
        if (navigator.clipboard) navigator.clipboard.writeText(p.corpo).then(function () { alert('Prompt copiado.'); }, function () {});
      });
    }).catch(erroBox);
  }

  // ===================================================================
  // registro das abas — [navId, módulo, rótulo, view, grupo, ícone, curto]
  // ===================================================================
  var GRUPO_HOSPEDE = 'Hóspede';
  var i = V.ORDEM_GRUPOS.indexOf('Financeiro');
  if (V.ORDEM_GRUPOS.indexOf(GRUPO_HOSPEDE) < 0) V.ORDEM_GRUPOS.splice(i < 0 ? V.ORDEM_GRUPOS.length : i, 0, GRUPO_HOSPEDE);

  [
    ['lv_dia', 'reservas', '☀️ Painel do dia', vDia, 'Visão geral', '☀️', 'Painel do dia'],
    ['lv_ficha', 'imoveis', '🗂️ Cadastro mestre', vFicha, 'Operação', '🗂️', 'Cadastro mestre'],
    ['lv_escala', 'limpeza', '🧭 Escala do dia', vEscala, 'Operação', '🧭', 'Escala do dia'],
    ['lv_auditoria', 'canais', '🔎 Auditoria de canais', vAuditoria, 'Operação', '🔎', 'Auditoria de canais'],
    ['lv_preventiva', 'manutencao', '🩺 Preventiva', vPreventiva, 'Operação', '🩺', 'Preventiva'],
    ['lv_suprimentos', 'estoque', '🧺 Enxoval e compras', vSuprimentos, 'Operação', '🧺', 'Enxoval e compras'],
    ['lv_crm', 'crm', '🤝 CRM', vCrm, 'Comercial', '🤝', 'CRM'],
    ['lv_revenue', 'precificacao', '📈 Datas e revenue', vRevenue, 'Comercial', '📈', 'Datas e revenue'],
    ['lv_doc', 'reservas', '🛡️ Documentação e risco', vDoc, 'Comercial', '🛡️', 'Documentação e risco'],
    ['lv_regua', 'mensagens', '✉️ Régua de mensagens', vRegua, GRUPO_HOSPEDE, '✉️', 'Régua de mensagens'],
    ['lv_manual', 'hospede', '📖 Manual do hóspede', vManual, GRUPO_HOSPEDE, '📖', 'Manual do hóspede'],
    ['lv_concierge', 'hospede', '🛎️ Concierge', vConcierge, GRUPO_HOSPEDE, '🛎️', 'Concierge'],
    ['lv_reputacao', 'reputacao', '⭐ Reputação', vReputacao, GRUPO_HOSPEDE, '⭐', 'Reputação'],
    ['lv_metricas', 'relatorios', '📊 Indicadores', vMetricas, 'Financeiro', '📊', 'Indicadores'],
    ['lv_dre', 'financeiro', '🧾 DRE por unidade', vDre, 'Financeiro', '🧾', 'DRE por unidade'],
    ['lv_proprietarios', 'proprietarios', '🏛️ Proprietários', vProprietarios, 'Financeiro', '🏛️', 'Proprietários'],
    ['lv_governanca', 'governanca', '🔐 Governança', vGovernanca, 'Conta', '🔐', 'Governança'],
    ['lv_biblioteca', 'reservas', '📘 Livro e checklists', vBiblioteca, 'Conta', '📘', 'Livro e checklists'],
  ].forEach(function (t) { V.TABS.push(t); });
})();
