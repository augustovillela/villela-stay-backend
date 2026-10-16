// Editor visual local. Persistência, permissões e reprodução pertencem ao gestor.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./editor-nucleo'));
  else root.MusiqueTocarEditor = factory(root.MusiqueTocarEditorCore);
})(typeof window !== 'undefined' ? window : globalThis, function (Core) {
  'use strict';
  var instances = 0, MAX_VISIBLE = 120;
  var NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
  function montar(container, options) {
    if (!Core) throw new Error('O núcleo do editor não foi carregado.');
    options = options || {};
    var doc = container.ownerDocument || document;
    var prefix = ++instances === 1 ? 'te-' : 'te' + instances + '-';
    var model = null, chart = null, selectedId = null, sectionId = null;
    var locked = false, pendingGroup = null, noteDraft = false, sectionDraft = false;
    var viewStart = 0, viewSpan = 8, controls = [], noteButtons = [];
    function $(id) { return doc.getElementById(prefix + id); }
    function node(tag, text, attrs) {
      var n = doc.createElement(tag);
      if (text !== null) n.textContent = text;
      Object.keys(attrs || {}).forEach(function (key) { n.setAttribute(key, attrs[key]); });
      return n;
    }
    function on(id, event, callback) { $(id).addEventListener(event, callback); }
    function message(value, error) {
      $('status').textContent = value;
      $('status').classList.toggle('te-error', !!error);
    }
    function pending(group) {
      var before = !!pendingGroup;
      pendingGroup = group;
      if (before !== !!group && options.onPending) options.onPending(!!group);
      renderControls();
    }
    function name(midi) { return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); }
    function stringCount() { return chart && Array.isArray(chart.tuning) ? chart.tuning.length : 0; }
    function stringsLabel() {
      var total = stringCount();
      return total + ' ' + (total === 1 ? 'corda' : 'cordas');
    }
    function stringLabel(string) {
      return string + ' · ' + name(chart.tuning[stringCount() - string]);
    }
    function defaultString() { return stringCount() || 6; }
    function renderStrings() {
      var labels = $('string-labels'), select = $('note-string'), timeline = $('timeline');
      labels.replaceChildren(); select.replaceChildren();
      if (!chart) {
        $('instrument-description').textContent = 'Uma nota por vez. Abra ou crie um arranjo para ver as cordas e a afinação.';
        timeline.setAttribute('aria-label', 'Linha do tempo do arranjo');
        $('timeline-inner').style.height = '344px'; $('notes').style.height = '276px';
        return;
      }
      for (var string = 1; string <= stringCount(); string++) {
        labels.appendChild(node('span', stringLabel(string)));
        select.appendChild(node('option', stringLabel(string), { value: String(string) }));
      }
      $('instrument-description').textContent = 'Uma nota por vez, em ' + stringsLabel() + '. Edite e aplique os campos antes de salvar o rascunho.';
      timeline.setAttribute('aria-label', 'Linha do tempo com ' + stringsLabel());
      $('timeline-inner').style.height = (65 + stringCount() * 46 + 3) + 'px';
      $('notes').style.height = (stringCount() * 46) + 'px';
    }
    function selectedNote() { return chart && chart.notes.find(function (n) { return n.id === selectedId; }); }
    function selectedSection() { return chart && (chart.sections || []).find(function (s) { return s.id === sectionId; }); }
    function tempoEvents() {
      return chart && chart.tempoMap ? chart.tempoMap.events : chart ? [{ time: 0, beat: 0, bpm: chart.bpm }] : [];
    }
    function tempoVariavel() { return !!(chart && chart.tempoMap && chart.tempoMap.events.length > 1); }
    function beatAt(time) {
      var eventos = tempoEvents(), atual = eventos[0];
      eventos.forEach(function (evento) { if (evento.time <= time) atual = evento; });
      return atual.beat + (time - atual.time) * atual.bpm / 60;
    }
    function timeAt(beat) {
      var eventos = tempoEvents(), atual = eventos[0], i;
      if (beat < atual.beat) return atual.time + (beat - atual.beat) * 60 / atual.bpm;
      for (i = 1; i < eventos.length; i++) {
        if (beat < eventos[i].beat) return atual.time + (beat - atual.beat) * 60 / atual.bpm;
        atual = eventos[i];
      }
      return atual.time + (beat - atual.beat) * 60 / atual.bpm;
    }
    function firstBeatAtOrAfter(time, step) {
      return Math.ceil((beatAt(time) - 1e-7) / step) * step;
    }
    function gradeLabel() {
      if (!tempoVariavel()) return 'grade de ' + chart.bpm + ' BPM';
      var mudancas = chart.tempoMap.events.length - 1;
      return 'grade por batidas · andamento variável importado (' + mudancas + ' ' + (mudancas === 1 ? 'mudança' : 'mudanças') + ')';
    }
    function number(id) {
      var raw = $(id).value.trim();
      if (!raw || !Number.isFinite(Number(raw))) throw new Error('Preencha os campos numéricos com valores válidos.');
      return Number(raw);
    }
    function pitch() {
      var s = Number($('note-string').value), f = Number($('note-fret').value);
      $('note-pitch').textContent = chart && Number.isInteger(s) && s >= 1 && s <= stringCount() && Number.isInteger(f) && f >= 0 && f <= 24 && $('note-fret').value !== ''
        ? name(chart.tuning[stringCount() - s] + f) + ' · MIDI ' + (chart.tuning[stringCount() - s] + f) : 'Preencha corda e casa válidas.';
    }
    function fields(group, ids) {
      ids.forEach(function (id) {
        controls.push({ id: id, group: group });
        on(id, 'input', function () {
          if (locked || !chart || (pendingGroup && pendingGroup !== group)) return;
          pending(group); if (group === 'note') pitch();
        });
        if ($(id).tagName === 'SELECT') on(id, 'change', function () {
          if (locked || !chart || (pendingGroup && pendingGroup !== group)) return;
          pending(group); if (group === 'note') pitch();
        });
      });
    }
    function renderControls() {
      controls.forEach(function (control) {
        $(control.id).disabled = locked || !chart || (pendingGroup && pendingGroup !== control.group) ||
          (control.group === 'section' && !sectionId && !sectionDraft);
      });
      // O mapa vindo do MIDI contém a relação completa entre segundos e
      // batidas. Reescrever só seu primeiro BPM corromperia essa relação.
      if (tempoVariavel()) $('bpm').disabled = true;
      $('new').disabled = locked || !!pendingGroup;
      $('new').hidden = !!chart;
      $('undo').disabled = locked || !!pendingGroup || !model || !model.podeDesfazer();
      $('redo').disabled = locked || !!pendingGroup || !model || !model.podeRefazer();
      ['apply-meta', 'apply-note', 'apply-section'].forEach(function (id) {
        $(id).disabled = locked || !chart || pendingGroup !== id.slice(6);
      });
      ['add', 'duplicate', 'delete', 'add-section', 'section', 'prev', 'next'].forEach(function (id) {
        $(id).disabled = locked || !chart || !!pendingGroup;
      });
      var index = chart ? chart.notes.findIndex(function (n) { return n.id === selectedId; }) : -1;
      $('prev').disabled = $('prev').disabled || index <= 0;
      $('next').disabled = $('next').disabled || !chart || index >= chart.notes.length - 1;
      $('duplicate').disabled = $('duplicate').disabled || !selectedNote();
      $('delete').disabled = $('delete').disabled || !selectedNote() || chart.notes.length <= 1;
      $('delete-section').disabled = locked || !sectionId || !!pendingGroup;
      ['window-start', 'zoom', 'apply-window', 'window-prev', 'window-next'].forEach(function (id) { $(id).disabled = locked || !chart; });
      $('window-prev').disabled = $('window-prev').disabled || viewStart <= 0;
      $('window-next').disabled = $('window-next').disabled || !chart || viewStart + viewSpan >= chart.duration;
      $('discard').disabled = locked || !pendingGroup;
      $('pending').hidden = !pendingGroup;
      $('workspace').hidden = !chart;
      noteButtons.forEach(function (b) { b.disabled = locked || !!pendingGroup; });
    }
    function fillNote(n) {
      $('note-time').value = n ? n.time : '';
      $('note-duration').value = n ? n.duration : '';
      $('note-string').value = n ? n.string : defaultString();
      $('note-fret').value = n ? n.fret : 0;
      $('apply-note').textContent = noteDraft ? 'Adicionar esta nota' : 'Aplicar alteração da nota';
      $('note-label').textContent = noteDraft ? 'Nova nota · ainda não aplicada' : n ? 'Nota ' + (chart.notes.findIndex(function (item) { return item.id === n.id; }) + 1) + ' de ' + chart.notes.length : 'Escolha uma nota';
      pitch();
    }
    function fillSection(s) {
      $('section-title').value = s ? s.title : '';
      $('section-from').value = s ? s.from : '';
      $('section-to').value = s ? s.to : '';
      $('apply-section').textContent = sectionDraft ? 'Adicionar esta frase' : 'Aplicar alteração da frase';
    }
    function fitWindow() {
      if (!chart) return;
      viewStart = Math.max(0, Math.min(viewStart, Math.max(0, chart.duration - viewSpan)));
      $('window-start').value = viewStart;
      $('window-start').max = Math.max(0, chart.duration - viewSpan);
      $('zoom').value = viewSpan;
    }
    function showSelected() {
      var n = selectedNote();
      if (n && (n.time < viewStart || n.time >= viewStart + viewSpan)) viewStart = Math.floor(n.time / viewSpan) * viewSpan;
      fitWindow();
    }
    function renderTimeline() {
      var grid = $('grid'), notes = $('notes'), phrases = $('phrases');
      grid.replaceChildren(); notes.replaceChildren(); phrases.replaceChildren(); noteButtons = [];
      if (!chart) return;
      fitWindow();
      var end = Math.min(chart.duration, viewStart + viewSpan), width = end - viewStart;
      $('window-label').textContent = viewStart.toFixed(2) + ' s a ' + end.toFixed(2) + ' s · ' + gradeLabel();
      var spanBeats = Math.max(0, beatAt(end) - beatAt(viewStart));
      var step = Math.max(1, Math.ceil(spanBeats / 60)), first = firstBeatAtOrAfter(viewStart, step), linhas = 0;
      for (var k = first; linhas < 61; k += step) {
        var t = timeAt(k);
        if (t > end + 1e-7) break;
        if (t < viewStart - 1e-7) continue;
        var line = node('span', null, { class: 'te-beat', 'aria-hidden': 'true', 'data-beat': String(k) });
        line.style.left = ((t - viewStart) / width * 100) + '%';
        line.appendChild(node('span', t.toFixed(2) + ' s')); grid.appendChild(line);
        linhas++;
      }
      for (var string = 1; string <= stringCount(); string++) {
        var lane = node('span', null, { class: 'te-string', 'aria-hidden': 'true' });
        lane.style.top = ((string - 1) * 46 + 23) + 'px'; notes.appendChild(lane);
      }
      var visible = chart.notes.filter(function (n) { return n.time < end && n.time + n.duration > viewStart; });
      var displayed = visible.slice(0, MAX_VISIBLE), selected = visible.find(function (n) { return n.id === selectedId; });
      if (selected && !displayed.some(function (n) { return n.id === selected.id; })) displayed[displayed.length - 1] = selected;
      displayed.forEach(function (n) {
        var label = 'Corda ' + n.string + ', casa ' + n.fret + ', ' + name(n.midi) + ', início ' + n.time + ' segundos, duração ' + n.duration + ' segundos';
        var button = node('button', String(n.fret), { type: 'button', class: 'te-note', 'data-note-id': n.id, 'aria-label': label, 'aria-pressed': String(n.id === selectedId) });
        var start = Math.max(viewStart, n.time), finish = Math.min(end, n.time + n.duration);
        button.style.left = ((start - viewStart) / width * 100) + '%';
        button.style.width = ((finish - start) / width * 100) + '%';
        button.style.top = ((n.string - 1) * 46 + 5) + 'px';
        button.addEventListener('click', function () { selectNote(n.id, true); });
        notes.appendChild(button); noteButtons.push(button);
      });
      (chart.sections || []).filter(function (s) { return s.from < end && s.to > viewStart; }).forEach(function (s) {
        var band = node('span', s.title, { class: 'te-phrase', title: s.title + ' · ' + s.from + '–' + s.to + ' s' });
        band.style.left = ((Math.max(viewStart, s.from) - viewStart) / width * 100) + '%';
        band.style.width = ((Math.min(end, s.to) - Math.max(viewStart, s.from)) / width * 100) + '%';
        phrases.appendChild(band);
      });
      $('visible').textContent = visible.length > MAX_VISIBLE
        ? 'Mostrando ' + MAX_VISIBLE + ' de ' + visible.length + ' notas nesta janela. Aproxime o zoom ou use Nota anterior e Próxima nota para alcançar todas.'
        : visible.length + ' nota(s) nesta janela · ' + chart.notes.length + ' no arranjo. Corda 1 é a mais aguda; casa 0 é corda solta.';
      renderControls();
    }
    function renderChart() {
      if (!chart) { renderStrings(); renderControls(); return; }
      $('bpm').value = chart.bpm; $('duration').value = chart.duration;
      $('apply-meta').textContent = tempoVariavel() ? 'Aplicar duração' : 'Aplicar tempo';
      $('tempo-help').textContent = tempoVariavel()
        ? 'O andamento variável veio do MIDI. O BPM único não pode ser alterado; a duração total continua editável.'
        : 'Alterar BPM muda a grade; os tempos das notas não mudam automaticamente.';
      var sections = chart.sections || [];
      if (!sections.some(function (s) { return s.id === sectionId; })) sectionId = sections.length ? sections[0].id : null;
      renderStrings();
      $('section').replaceChildren(node('option', 'Escolha uma frase', { value: '' }));
      sections.forEach(function (s) { $('section').appendChild(node('option', s.title + ' · ' + s.from + '–' + s.to + ' s', { value: s.id })); });
      $('section').value = sectionId || '';
      fillNote(selectedNote()); fillSection(selectedSection()); renderTimeline(); renderControls();
    }
    function selectNote(id, focus) {
      if (locked || pendingGroup || !chart || !chart.notes.some(function (n) { return n.id === id; })) return;
      selectedId = id; noteDraft = false; showSelected(); fillNote(selectedNote()); renderTimeline();
      if (focus) { var button = noteButtons.find(function (b) { return b.getAttribute('data-note-id') === id; }); if (button && button.focus) button.focus(); }
    }
    function moveSelection(delta, focus) {
      if (!chart) return;
      var index = chart.notes.findIndex(function (n) { return n.id === selectedId; });
      var next = chart.notes[Math.max(0, Math.min(chart.notes.length - 1, index + delta))];
      if (next) selectNote(next.id, focus);
    }
    function changed() { if (options.onChange) options.onChange(model.obter()); }
    function execute(op, group) {
      if (locked || !model || (pendingGroup && pendingGroup !== group)) return;
      try {
        var result = model.executar(op); chart = result.chart;
        if (op.tipo === 'criarNota' || op.tipo === 'editarNota' || op.tipo === 'duplicarNota') selectedId = result.id;
        if (!selectedNote()) selectedId = chart.notes[0].id;
        if (op.tipo === 'criarFrase' || op.tipo === 'editarFrase') sectionId = result.id;
        noteDraft = false; sectionDraft = false; pending(null); showSelected(); renderChart(); changed();
        message('Alteração aplicada ao rascunho. Salve e use “Revisar na pista” para conferir.');
      } catch (e) { message(e.message, true); renderControls(); }
    }
    function history(redo) {
      if (locked || pendingGroup || !model) return;
      var next = redo ? model.refazer() : model.desfazer(); if (!next) return;
      chart = next;
      if (!selectedNote()) selectedId = chart.notes[0].id;
      showSelected(); renderChart(); changed(); message(redo ? 'Alteração refeita.' : 'Alteração desfeita.');
    }
    function draftNote(copy) {
      if (locked || !chart || pendingGroup) return;
      var n = selectedNote(); noteDraft = true;
      fillNote({ time: n ? n.time + n.duration : viewStart, duration: copy && n ? n.duration : 0.5, string: copy && n ? n.string : defaultString(), fret: copy && n ? n.fret : 0 });
      pending('note'); message(copy ? 'Cópia preparada. Ajuste o início e aplique para criar uma nova nota.' : 'Preencha a nova nota e aplique. Se necessário, aumente antes a duração do arranjo.');
    }
    function updateWindow() {
      if (locked || !chart) return;
      try {
        var start = number('window-start'), span = number('zoom');
        if (start < 0 || start >= chart.duration || [2, 4, 8, 16, 32, 64].indexOf(span) < 0) throw new Error('Escolha uma janela dentro da duração do arranjo.');
        viewStart = start; viewSpan = span; fitWindow(); renderTimeline();
      } catch (e) { message(e.message, true); }
    }
    container.classList.add ? container.classList.add('te-editor') : container.setAttribute('class', 'te-editor');
    container.innerHTML = ('<div class="te-heading"><div><h3>Editor de notas</h3><p id="__instrument-description">Uma nota por vez. Abra ou crie um arranjo para ver as cordas e a afinação.</p></div><button id="__new" type="button">Novo arranjo visual</button></div>' +
      '<p id="__status" class="te-status" role="status">Abra um arranjo, importe JSON ou crie um novo aqui.</p><div id="__pending" class="te-pending" hidden><p>Há campos ainda não aplicados. Aplique a alteração ou descarte os campos para salvar e revisar na pista.</p><button id="__discard" type="button">Descartar campos não aplicados</button></div>' +
      '<div id="__workspace" hidden><div class="te-toolbar"><button id="__undo" type="button">Desfazer</button><button id="__redo" type="button">Refazer</button><span>Desfazer afeta notas, tempo e frases; objetivo e créditos ficam na gestão. O histórico é local desta edição e reinicia ao carregar um arranjo.</span></div>' +
      '<fieldset class="te-meta"><legend>Tempo do arranjo</legend><label>BPM<input id="__bpm" type="number" min="20" max="300" step="any"></label><label>Duração total (s)<input id="__duration" type="number" min="0.04" max="900" step="any"></label><button id="__apply-meta" type="button">Aplicar tempo</button><p id="__tempo-help">Alterar BPM muda a grade; os tempos das notas não mudam automaticamente.</p></fieldset>' +
      '<div class="te-view"><label>Janela a partir de (s)<input id="__window-start" type="number" min="0" step="any" value="0"></label><label>Zoom · segundos na janela<select id="__zoom"><option value="2">2 s</option><option value="4">4 s</option><option value="8" selected>8 s</option><option value="16">16 s</option><option value="32">32 s</option><option value="64">64 s</option></select></label><button id="__apply-window" class="te-show-window" type="button">Mostrar janela</button><button id="__window-prev" type="button" aria-label="Janela anterior">← Janela</button><button id="__window-next" type="button" aria-label="Próxima janela">Janela →</button></div>' +
      '<p id="__window-label" class="te-caption"></p><div id="__timeline" class="te-timeline" tabindex="0" role="group" aria-label="Linha do tempo do arranjo" aria-describedby="__visible"><div id="__timeline-inner" class="te-timeline-inner"><div id="__string-labels" class="te-string-labels" aria-hidden="true"></div><div class="te-track"><div id="__phrases" class="te-phrases"></div><div id="__grid" class="te-grid"></div><div id="__notes" class="te-notes"></div></div></div></div><p id="__visible" class="te-caption"></p>' +
      '<div class="te-editor-columns"><fieldset><legend id="__note-label">Nota selecionada</legend><div class="te-actions"><button id="__prev" type="button">Nota anterior</button><button id="__next" type="button">Próxima nota</button></div><div class="te-fields"><label>Início (s)<input id="__note-time" type="number" min="0" max="900" step="any"></label><label>Duração (s)<input id="__note-duration" type="number" min="0.04" max="60" step="any"></label><label>Corda<select id="__note-string"></select></label><label>Casa<input id="__note-fret" type="number" min="0" max="24" step="1"></label></div><p id="__note-pitch" class="te-pitch" aria-live="polite"></p><button id="__apply-note" type="button">Aplicar alteração da nota</button><div class="te-actions"><button id="__add" type="button">Adicionar nota</button><button id="__duplicate" type="button">Duplicar nota</button><button id="__delete" type="button">Excluir nota</button></div></fieldset>' +
      '<fieldset><legend>Frases para praticar</legend><label>Frase<select id="__section"><option value="">Escolha uma frase</option></select></label><label>Título da frase<input id="__section-title" type="text" maxlength="80"></label><div class="te-fields"><label>De (s)<input id="__section-from" type="number" min="0" step="any"></label><label>Até (s)<input id="__section-to" type="number" min="0" step="any"></label></div><button id="__apply-section" type="button">Aplicar alteração da frase</button><div class="te-actions"><button id="__add-section" type="button">Adicionar frase</button><button id="__delete-section" type="button">Excluir frase</button></div></fieldset></div><p class="te-caption">Clique numa nota para selecioná-la. Use as setas na pista ou os botões anterior e próxima. Ctrl/Cmd+Z e Ctrl/Cmd+Y funcionam aqui fora dos campos de texto; dentro dos campos, os atalhos continuam nativos.</p></div>').replace(/__/g, prefix);
    fields('meta', ['bpm', 'duration']);
    fields('note', ['note-time', 'note-duration', 'note-string', 'note-fret']);
    fields('section', ['section-title', 'section-from', 'section-to']);
    on('new', 'click', function () {
      if (locked || pendingGroup || chart) return;
      try {
        var perfil = typeof options.perfilAtual === 'function' ? options.perfilAtual() : undefined;
        carregar(Core.novoChart(undefined, undefined, perfil)); changed();
        message('Novo arranjo com a primeira nota ' + name(chart.notes[0].midi) + ' criada. Complete título, objetivo e créditos na gestão.');
      } catch (e) { message(e.message, true); }
    });
    on('discard', 'click', function () {
      if (locked || !pendingGroup) return;
      noteDraft = false; sectionDraft = false; pending(null); renderChart(); message('Campos não aplicados descartados. O arranjo aplicado foi preservado.');
    });
    on('apply-meta', 'click', function () {
      try {
        var alteracoes = { duration: number('duration') };
        if (!tempoVariavel()) alteracoes.bpm = number('bpm');
        execute({ tipo: 'editarChart', alteracoes: alteracoes }, 'meta');
      } catch (e) { message(e.message, true); }
    });
    on('apply-note', 'click', function () {
      try {
        var values = { time: number('note-time'), duration: number('note-duration'), string: number('note-string'), fret: number('note-fret') };
        execute(noteDraft ? { tipo: 'criarNota', nota: values } : { tipo: 'editarNota', id: selectedId, alteracoes: values }, 'note');
      } catch (e) { message(e.message, true); }
    });
    on('add', 'click', function () { draftNote(false); }); on('duplicate', 'click', function () { draftNote(true); });
    on('delete', 'click', function () { execute({ tipo: 'excluirNota', id: selectedId }); });
    on('prev', 'click', function () { moveSelection(-1, false); }); on('next', 'click', function () { moveSelection(1, false); });
    on('section', 'change', function () { if (locked || pendingGroup) return; sectionId = this.value || null; sectionDraft = false; fillSection(selectedSection()); renderControls(); });
    on('add-section', 'click', function () {
      if (locked || !chart || pendingGroup) return;
      sectionDraft = true; fillSection({ title: 'Nova frase', from: viewStart, to: Math.min(chart.duration, viewStart + viewSpan) }); pending('section'); message('Ajuste o título e os limites, depois adicione a frase.');
    });
    on('apply-section', 'click', function () {
      try {
        var values = { title: $('section-title').value, from: number('section-from'), to: number('section-to') };
        execute(sectionDraft ? { tipo: 'criarFrase', frase: values } : { tipo: 'editarFrase', id: sectionId, alteracoes: values }, 'section');
      } catch (e) { message(e.message, true); }
    });
    on('delete-section', 'click', function () { execute({ tipo: 'excluirFrase', id: sectionId }); });
    on('undo', 'click', function () { history(false); }); on('redo', 'click', function () { history(true); });
    on('apply-window', 'click', updateWindow);
    on('window-prev', 'click', function () { if (locked || !chart) return; viewStart = Math.max(0, viewStart - viewSpan); renderTimeline(); });
    on('window-next', 'click', function () { if (locked || !chart) return; viewStart += viewSpan; renderTimeline(); });
    container.addEventListener('keydown', function (e) {
      var target = e.target, nativeField = target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
      if (nativeField || locked || pendingGroup || e.altKey) return;
      var key = String(e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) { e.preventDefault(); history(key === 'y' || !!e.shiftKey); }
      else if (!e.ctrlKey && !e.metaKey && (key === 'arrowleft' || key === 'arrowright') && (target === $('timeline') || target.getAttribute('data-note-id'))) { e.preventDefault(); moveSelection(key === 'arrowleft' ? -1 : 1, true); }
    });
    function carregar(value) {
      var next = value === null ? null : Core.criar(value);
      model = next; chart = next ? next.obter() : null;
      selectedId = chart ? chart.notes[0].id : null; sectionId = null;
      noteDraft = false; sectionDraft = false; viewStart = 0; pending(null); renderChart();
      message(chart ? 'Arranjo carregado sem alterar seus tempos. Selecione uma nota para editar.' : 'Abra um arranjo, importe JSON ou crie um novo aqui.');
    }
    renderControls();
    return {
      carregar: carregar,
      bloquear: function (value) { locked = !!value; renderControls(); },
      obter: function () { if (pendingGroup) throw new Error('Aplique ou descarte os campos pendentes do editor antes de salvar.'); return model ? model.obter() : null; }
    };
  }
  return { montar: montar };
});
