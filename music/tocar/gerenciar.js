(function () {
  'use strict';
  var app = document.getElementById('tocar-gestao');
  if (!app) return;
  var Core = window.MusiqueTocarCore, Formato = window.MusiqueTocarFormatoCatalogo, Estudos = window.MusiqueTocarEstudos, Editor = window.MusiqueTocarEditor, ImportadorMidi = window.MusiqueTocarImportadorMidi, ImportadorMusicXML = window.MusiqueTocarImportadorMusicXML, WaveformCliente = window.MusiqueTocarWaveformCliente, Perfis = window.MusiqueTocarPerfis;
  if (!Core || !Formato || !Estudos || !Editor || !ImportadorMidi || !ImportadorMusicXML || !WaveformCliente || !Perfis) { app.textContent = 'Não foi possível carregar a gestão. Recarregue a página.'; return; }
  var boot = JSON.parse(app.getAttribute('data-estado') || '{}');
  if (!boot.logado) { app.innerHTML='<h1>Gerenciar seus arranjos</h1><p>Entre na sua conta Musique para criar arranjos das obras do seu acervo.</p><a href="/music/entrar?voltar=%2Fmusic%2Ftocar%2Fgerenciar">Entrar ou criar conta</a><p><a href="/music/tocar">Voltar aos estudos abertos</a></p>';return; }
  var current = null, chart = null, dirty = false, busy = false, conflict = false, editor = null, editorPending = false, waveform = null;
  var importacao = null;
  var detailTicket = 0, mediaTicket = 0, importTicket = 0, worksTicket = 0, listTicket = 0, waveformTicket = 0;
  var worksOffset = 0, listOffset = 0, works = [], arrangements = [];
  var mediaItems=[],mediaOffset=0,mediaWork='',waveformSource='';
  var BASE = '/music/api/tocar/gestao';
  var initialWork = new URLSearchParams(window.location ? window.location.search : '').get('obra');
  var workChoice = 0;
  function $(id) { return document.getElementById(id); }
  function node(tag, text, attrs) {
    var n = document.createElement(tag); if (text !== null) n.textContent = text;
    Object.keys(attrs || {}).forEach(function (key) { n.setAttribute(key, attrs[key]); }); return n;
  }
  function message(value, error) { $('tg-status').textContent = value; $('tg-status').classList.toggle('tj-error', !!error); }
  async function api(path, method, body) {
    var options = { credentials: 'same-origin', method: method || 'GET' };
    if (body !== undefined) { options.headers = { 'Content-Type': 'application/json' }; options.body = JSON.stringify(body); }
    var response = await fetch(BASE + path, options), data = await response.json();
    if (!response.ok) { var e = new Error(data.erro || 'Não foi possível concluir a operação.'); e.status = response.status; e.revision=data.revision;
      if(response.status===402)$('tg-access').hidden=false;
      if(response.status===401)$('tg-login').hidden=false;
      throw e; }
    return data;
  }
  var fields = ['tg-work', 'tg-title', 'tg-instrument', 'tg-level', 'tg-technique', 'tg-objective', 'tg-credits', 'tg-media', 'tg-media-offset', 'tg-json', 'tg-midi', 'tg-musicxml', 'tg-example', 'tg-use-example'];
  function importacaoPendente() { return !!importacao; }
  function rotuloImportacao(item) { return item && item.tipo === 'musicxml' ? 'MusicXML/MXL' : 'MIDI'; }
  function motivoWaveform() {
    if (!current) return 'Salve um rascunho com áudio associado para abrir a referência visual.';
    if (busy) return 'Aguarde a operação atual antes de abrir a referência visual.';
    if (conflict) return 'Recarregue a revisão salva antes de abrir a referência visual.';
    if (editorPending) return 'Aplique ou cancele os campos pendentes do editor antes de abrir a referência visual.';
    if (importacaoPendente()) return 'Confirme ou cancele a importação pendente antes de abrir a referência visual.';
    if (dirty) return 'Salve o rascunho antes de abrir a referência visual do áudio.';
    if (!current.documento || !current.documento.mediaId) return 'Associe um áudio autorizado e salve o rascunho para abrir a referência visual.';
    return '';
  }
  function chaveWaveform() {
    if (motivoWaveform()) return '';
    return current.id + ':' + current.revision + ':' + current.documento.mediaId;
  }
  function atualizarWaveform() {
    if (!waveform) return;
    waveform.setOffset(Number($('tg-media-offset').value) || 0);
    waveform.bloquear(busy || importacaoPendente());
    var chave = chaveWaveform();
    if (!chave) {
      if (waveformSource) { waveformSource = ''; ++waveformTicket; waveform.limpar(motivoWaveform()); }
      return;
    }
    if (chave === waveformSource) return;
    waveformSource = chave;
    var ticket = ++waveformTicket, id = current.id, revision = current.revision;
    (async function () {
      try {
        var data = await api('/arranjos/' + encodeURIComponent(id) + '/audio?revision=' + encodeURIComponent(revision));
        if (ticket !== waveformTicket || chave !== chaveWaveform()) return;
        waveform.carregar(data);
      } catch (e) {
        if (ticket !== waveformTicket || chave !== chaveWaveform()) return;
        waveform.falhar('Não foi possível abrir o áudio para alinhamento: ' + e.message);
      }
    })();
  }
  function render() {
    var pendente = importacaoPendente();
    fields.forEach(function (id) { $(id).disabled = busy || pendente || (id === 'tg-work' && !!current) || (editorPending && ['tg-json','tg-midi','tg-musicxml','tg-example','tg-use-example'].includes(id)); });
    var temMidia = !!$('tg-media').value;
    if (!temMidia) $('tg-media-offset').value = '0';
    $('tg-media-offset').disabled = $('tg-media-offset').disabled || !temMidia;
    $('tg-media-offset-help').textContent = temMidia
      ? 'Informe o ponto do áudio que corresponde ao 0:00 do arranjo. A introdução anterior não entra na pista.'
      : 'Escolha um áudio autorizado para ajustar o ponto correspondente ao início do arranjo.';
    if (editor) editor.bloquear(busy || pendente);
    $('tg-save').disabled = busy || !chart || !$('tg-work').value || conflict || editorPending || pendente;
    $('tg-publish').disabled = busy || !current || dirty || conflict || editorPending || pendente;
    $('tg-withdraw').disabled = busy || !current || !current.publishedVersionId || dirty || conflict || editorPending || pendente;
    $('tg-new').disabled = busy || pendente; $('tg-reload').disabled = busy || !current || pendente;
    $('tg-download').disabled = busy || editorPending || pendente;
    $('tg-preview').hidden = !current || dirty || conflict || busy || editorPending || pendente;
    $('tg-preview').setAttribute('href', current ? '/music/tocar?previa=' + encodeURIComponent(current.id) + '&revisao=' + current.revision : '#');
    $('tg-new').textContent = dirty || editorPending ? 'Descartar alterações e criar outro' : 'Novo arranjo';
    $('tg-version').textContent = (current ? 'Revisão de trabalho ' + current.revision + ' · ' + (current.publishedVersionId ? 'há uma versão publicada' : 'sem versão publicada') : 'Novo rascunho') + (dirty ? ' · alterações não salvas' : '') + (editorPending ? ' · aplique ou cancele os campos do editor' : '') + (pendente ? ' · confirme ou cancele a importação ' + rotuloImportacao(importacao) : '');
    var perfil = chart && perfilDoChart(chart);
    $('tg-chart-info').textContent = chart ? chart.notes.length + ' notas · ' + (chart.sections || []).length + ' frases · ' + chart.bpm + ' BPM · ' + chart.duration.toFixed(2) + ' s · ' + (perfil ? perfil.rotulo.toLowerCase() + (perfil.layout === 'drums' || perfil.layout === 'piano' ? '' : ' em afinação padrão') : 'perfil incompatível') : 'Crie as notas no editor visual, importe um arranjo JSON ou escolha um estudo como ponto de partida.';
    var selected = works.find(function (w) { return w.id === $('tg-work').value; }) || (current && current.obra);
    $('tg-visibility').textContent = selected ? 'Obra: ' + selected.titulo + ' · visibilidade ' + (selected.visibilidade || 'conforme o acervo') + '. Publicar o arranjo mantém o acesso definido no acervo; não torna a obra pública.' : 'Escolha uma obra sua. As permissões continuam sendo as do acervo.';
    renderImportacaoPreview();
    atualizarWaveform();
  }
  function changed() {
    ++importTicket; ++waveformTicket; waveformSource = ''; dirty = true;
    if (waveform) waveform.limpar('Salve o rascunho antes de continuar o alinhamento visual.');
    render();
  }
  function option(select, value, label) { select.appendChild(node('option', label, { value: value })); }
  function perfilSelecionado() { return Perfis.obter($('tg-instrument').value); }
  function perfilDoChart(valor) { return valor && (Perfis.porChart ? Perfis.porChart(valor) : Perfis.porAfinacao(valor.tuning)); }
  function instrumentoDoPerfil(perfil, preferido) {
    if (preferido && Perfis.obter(preferido) && Perfis.obter(preferido).id === perfil.id) return preferido;
    return perfil.id === 'baixo' ? 'baixo' : perfil.id === 'cavaquinho' ? 'cavaquinho' : perfil.id === 'ukulele' ? 'ukulele' : perfil.id === 'bandolim-5' ? 'bandolim' : perfil.id === 'piano-midi' ? 'piano' : perfil.id === 'bateria-midi' ? 'bateria' : 'violao';
  }
  function instrumentoDoChart(valor, preferido) {
    var perfil = perfilDoChart(valor);
    if (!perfil) throw new Error('O arranjo precisa usar uma afinação padrão ou perfil MIDI compatível com o Musique.');
    return instrumentoDoPerfil(perfil, preferido || $('tg-instrument').value);
  }
  function mesmaMusica(a, b) {
    if (!a || !b) return false;
    return ['id','bpm','duration','profile','layout','tuning','notes','sections','tempoMap'].every(function (key) { return JSON.stringify(a[key]) === JSON.stringify(b[key]); });
  }
  function candidatoAtual() {
    if (!importacao || importacao.status !== 'review' || !Array.isArray(importacao.analysis.candidates)) return null;
    var id = $('tg-midi-candidates').value;
    return importacao.analysis.candidates.find(function (candidate) { return candidate && candidate.id === id && candidate.valid === true; }) || null;
  }
  function textoCandidatoMidi(candidate) {
    var faixa = Number.isInteger(candidate.track) ? candidate.track + 1 : '?';
    var canal = Number.isInteger(candidate.channel) ? candidate.channel + 1 : '?';
    var nome = typeof candidate.name === 'string' && candidate.name.trim() ? ' · ' + candidate.name.trim() : '';
    var notas = Number.isInteger(candidate.noteCount) ? candidate.noteCount + ' notas' : 'notas não disponíveis';
    var extensao = Number.isInteger(candidate.minMidi) && Number.isInteger(candidate.maxMidi) ? ' · MIDI ' + candidate.minMidi + '–' + candidate.maxMidi : '';
    return 'Faixa ' + faixa + ' · canal ' + canal + nome + ' · ' + notas + extensao;
  }
  function textoCandidatoMusicXML(candidate) {
    var parte = Number.isInteger(candidate.part) ? candidate.part : '?';
    var pauta = Number.isInteger(candidate.staff) ? candidate.staff : '?';
    var voz = candidate.voice == null ? '?' : String(candidate.voice);
    var nome = typeof candidate.name === 'string' && candidate.name.trim() ? ' · ' + candidate.name.trim() : '';
    var notas = Number.isInteger(candidate.noteCount) ? candidate.noteCount + ' notas' : 'notas não disponíveis';
    var extensao = Number.isInteger(candidate.minMidi) && Number.isInteger(candidate.maxMidi) ? ' · MIDI ' + candidate.minMidi + '–' + candidate.maxMidi : '';
    return 'Parte ' + parte + ' · pauta ' + pauta + ' · voz ' + voz + nome + ' · ' + notas + extensao;
  }
  function textoCandidato(candidate) {
    return importacao && importacao.tipo === 'musicxml' ? textoCandidatoMusicXML(candidate) : textoCandidatoMidi(candidate);
  }
  function descricaoImportacao(analysis) {
    var tempos = Array.isArray(analysis && analysis.tempoMap) ? analysis.tempoMap : [];
    var mudancas = Math.max(0, tempos.length - 1);
    var duracao = analysis && typeof analysis.duration === 'number' && Number.isFinite(analysis.duration) ? analysis.duration.toFixed(2) + ' s' : 'duração não disponível';
    var tipo = rotuloImportacao(importacao);
    var formato = importacao && importacao.tipo === 'musicxml' ? (analysis && analysis.format === 'mxl' ? 'MXL' : 'MusicXML ' + (analysis && analysis.version || '')) : 'formato ' + (analysis && analysis.format);
    var navegacao = importacao && importacao.tipo === 'musicxml' ? ' Repetições, voltas e codas ficam somente na ordem escrita.' : '';
    return 'Arquivo ' + tipo + ' analisado localmente · ' + formato + ' · ' + duracao + ' · ' + (mudancas ? mudancas + ' mudança' + (mudancas === 1 ? '' : 's') + ' de andamento preservada' + (mudancas === 1 ? '' : 's') : 'andamento constante') + '.' + navegacao;
  }
  function renderImportacaoPreview() {
    var preview = $('tg-midi-preview');
    if (!preview) return;
    preview.hidden = !importacao;
    if (!importacao) return;
    var select = $('tg-midi-candidates'), candidate = candidatoAtual(), tipo = rotuloImportacao(importacao);
    $('tg-import-line-label').textContent = importacao.tipo === 'musicxml' ? 'Linha MusicXML' : 'Linha MIDI';
    $('tg-midi-cancel').textContent = 'Cancelar importação ' + tipo;
    if (importacao.status === 'reading') {
      select.disabled = true; $('tg-midi-confirm').disabled = true; $('tg-midi-cancel').disabled = busy;
      $('tg-midi-info').textContent = 'Lendo ' + tipo + ' somente neste navegador…';
      $('tg-midi-detail').textContent = 'O rascunho continua preservado enquanto o arquivo é analisado.';
      return;
    }
    select.disabled = busy;
    $('tg-midi-confirm').disabled = busy || !candidate;
    $('tg-midi-cancel').disabled = busy;
    $('tg-midi-info').textContent = descricaoImportacao(importacao.analysis);
    if (!candidate) {
      var unavailable = (importacao.analysis.candidates || []).filter(function (item) { return item && item.valid !== true; });
      $('tg-midi-detail').textContent = unavailable.length ? 'Escolha uma linha disponível. As linhas indisponíveis mostram o motivo abaixo.' : 'Nenhuma linha ' + tipo + ' foi encontrada neste arquivo.';
    } else {
      $('tg-midi-detail').textContent = textoCandidato(candidate) + ' · pronta para importar. A posição sugerida de cada nota poderá ser ajustada no editor.';
    }
  }
  function mostrarAnaliseImportacao(tipo, importador, analysis, fileName) {
    var perfil = importacao && importacao.perfil;
    importacao = { tipo: tipo, importador: importador, analysis: analysis, fileName: fileName || '', perfil: perfil, status: 'review' };
    var select = $('tg-midi-candidates');
    select.replaceChildren(node('option', 'Escolha uma linha ' + (tipo === 'musicxml' ? 'MusicXML' : 'MIDI') + ' disponível', { value: '' }));
    // A seleção anterior nunca pode confirmar uma nova análise sem uma escolha explícita.
    select.value = '';
    (analysis.candidates || []).forEach(function (candidate) {
      if (!candidate || typeof candidate.id !== 'string') return;
      var label = textoCandidato(candidate);
      if (candidate.valid !== true) label += ' · indisponível: ' + (candidate.reason || 'linha incompatível');
      var item = node('option', label, { value: candidate.id });
      if (candidate.valid !== true) { item.disabled = true; item.setAttribute('disabled', ''); }
      select.appendChild(item);
    });
  }
  function limparImportacao() {
    importacao = null;
    var preview = $('tg-midi-preview');
    if (preview) preview.hidden = true;
    if ($('tg-midi')) $('tg-midi').value = '';
    if ($('tg-musicxml')) $('tg-musicxml').value = '';
    if ($('tg-midi-candidates')) $('tg-midi-candidates').value = '';
  }
  function tituloImportacaoSeguro(fileName, tipo, tituloDaFonte) {
    var fonte = String(tituloDaFonte || '').replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (fonte) return fonte.slice(0, 120).trim();
    var base = String(fileName || '').replace(/\.[^.]*$/, '').replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    var padrao = tipo === 'musicxml' ? 'Arranjo importado de MusicXML' : 'Arranjo importado de MIDI';
    if (!base) return padrao;
    return base.slice(0, 120).trim() || padrao;
  }
  function tituloPodeVirDaImportacao() {
    var title = $('tg-title').value.trim();
    return !title || title === 'Novo arranjo';
  }
  function fillDocument(d, preserveEditor) {
    var keepHistory = preserveEditor && d && mesmaMusica(chart, d.chart);
    var next = d ? Core.validarChart(d.chart) : null;
    var instrument = next ? instrumentoDoChart(next, d && d.instrument) : 'violao';
    // O editor pode recusar um arranjo que o contrato geral aceitou. Só troque
    // o formulário após sua validação para nunca salvar notas diferentes da tela.
    if (editor && !keepHistory) editor.carregar(next);
    chart = next;
    $('tg-title').value = d ? d.title : '';
    $('tg-instrument').value = instrument;
    $('tg-level').value = d ? d.level : 'iniciante';
    $('tg-technique').value = d ? d.technique : 'notas-isoladas';
    $('tg-objective').value = d ? d.objective : ''; $('tg-credits').value = d ? d.credits : '';
    $('tg-media').replaceChildren(node('option', 'Sem áudio associado · usar demonstração sintetizada', { value: '' }));
    if (d && d.mediaId) option($('tg-media'), d.mediaId, 'Mídia vinculada');
    $('tg-media').value = d ? d.mediaId : '';
    $('tg-media-offset').value = d && d.mediaId && Number.isSafeInteger(d.mediaOffsetMs) ? String(d.mediaOffsetMs) : '0';
  }
  function readDocument() {
    if (editorPending) throw new Error('Aplique ou cancele os campos pendentes do editor antes de salvar ou baixar.');
    if (importacaoPendente()) throw new Error('Confirme ou cancele a importação pendente antes de salvar ou baixar.');
    if (!chart) throw new Error('Crie ou importe as notas do arranjo antes de salvar.');
    var copied = Core.validarChart(chart); copied.title = $('tg-title').value.trim();
    var mediaId = $('tg-media').value;
    var documento = { title: copied.title, instrument: $('tg-instrument').value, level: $('tg-level').value,
      technique: $('tg-technique').value, objective: $('tg-objective').value.trim(), credits: $('tg-credits').value.trim(), mediaId: mediaId, chart: copied };
    if (mediaId) {
      var deslocamento = $('tg-media-offset').value;
      documento.mediaOffsetMs = deslocamento === '' ? null : Number(deslocamento);
    }
    return Formato.validarDocumento(documento);
  }
  async function loadMedia(workId, selected, offset) {
    var ticket = ++mediaTicket;
    offset=offset||0;
    if(!offset){mediaItems=[];mediaOffset=0;mediaWork=workId;$('tg-media-more').hidden=true;}
    if (!workId) return;
    $('tg-media-more').disabled=true;
    try {
      var data = await api('/obras/' + encodeURIComponent(workId) + '/midias?limit=50&offset='+offset);
      if (ticket !== mediaTicket || $('tg-work').value !== workId) return;
      // O formulário pode ter sido alterado enquanto a lista de mídias chegava.
      var keep = $('tg-media').value;
      (data.midias||[]).forEach(function(m){if(!mediaItems.some(function(old){return old.id===m.id;}))mediaItems.push(m);});
      mediaOffset=offset+50;
      var hasMore=mediaOffset<Number(data.total||0);
      $('tg-media').replaceChildren(node('option', 'Sem áudio associado · usar demonstração sintetizada', { value: '' }));
      mediaItems.forEach(function (m) { option($('tg-media'), m.id, m.titulo || 'Áudio da obra'); });
      if (keep && !mediaItems.some(function (m) { return m.id === keep; })) option($('tg-media'), keep, hasMore?'Áudio associado · carregue mais para localizar':'Mídia vinculada indisponível · revise antes de publicar');
      $('tg-media').value = keep;
      $('tg-media-more').hidden=!hasMore;
    } catch (e) { if (ticket === mediaTicket) message('Não foi possível listar os áudios: ' + e.message, true); }
    finally{if(ticket===mediaTicket)$('tg-media-more').disabled=false;}
  }
  async function loadWorks(offset) {
    worksOffset = offset; var ticket = ++worksTicket;
    try {
      var query = new URLSearchParams({ limit: '50', offset: String(offset), q: $('tg-work-q').value.trim() });
      var data = await api('/obras?' + query.toString()); if (ticket !== worksTicket) return;
      works = data.obras || []; var selected = $('tg-work').value;
      $('tg-work').replaceChildren(node('option', 'Selecione uma obra do seu acervo', { value: '' }));
      works.forEach(function (w) { option($('tg-work'), w.id, w.titulo + (w.artista ? ' · ' + w.artista : '')); });
      if (selected && !works.some(function (w) { return w.id === selected; })) option($('tg-work'), selected, current && current.obra ? current.obra.titulo : 'Obra selecionada');
      $('tg-work').value = selected;
      $('tg-work-empty').hidden = works.length > 0;
      $('tg-work-prev').disabled = offset === 0; $('tg-work-next').disabled = offset + 50 >= Number(data.total || 0);
      render();
    } catch (e) { if (ticket === worksTicket) message(e.status === 401 ? 'Entre na sua conta Musique para gerenciar o acervo.' : e.status === 402 ? 'A gestão requer acesso ativo ao Musique.' : e.message, true); }
  }
  async function loadList(offset) {
    listOffset = offset; var ticket = ++listTicket;
    try {
      var query = new URLSearchParams({ limit: '20', offset: String(offset), q: $('tg-list-q').value.trim() });
      var data = await api('/arranjos?' + query.toString()); if (ticket !== listTicket) return;
      arrangements = data.arranjos || []; $('tg-list').replaceChildren();
      arrangements.forEach(function (a) {
        var row = node('li', null), open = node('button', 'Editar', { type: 'button' });
        row.appendChild(node('strong', a.title)); row.appendChild(node('span', (a.obra && a.obra.titulo || '') + ' · ' + (a.publishedVersionId ? 'Publicado' : 'Rascunho')));
        open.addEventListener('click', function () { return loadDetail(a.id, false); }); row.appendChild(open); $('tg-list').appendChild(row);
      });
      if (!arrangements.length) $('tg-list').appendChild(node('li', 'Nenhum arranjo encontrado. Crie um rascunho abaixo.'));
      $('tg-list-prev').disabled = offset === 0; $('tg-list-next').disabled = offset + 20 >= Number(data.total || 0);
    } catch (e) { if (ticket === listTicket) message(e.message, true); }
  }
  function accept(a, preserveEditor) {
    fillDocument(a.documento, preserveEditor); current = a; dirty = false; conflict = false;
    if (!Array.prototype.some.call($('tg-work').children, function (n) { return n.value === a.obra.id; })) option($('tg-work'), a.obra.id, a.obra.titulo);
    $('tg-work').value = a.obra.id; render();
    $('tg-versions').replaceChildren();
    (a.versions || []).forEach(function (v) { $('tg-versions').appendChild(node('li', 'Versão ' + v.number + ' · ' + new Date(v.publishedAt).toLocaleString('pt-BR') + (v.id === a.publishedVersionId ? ' · publicada agora' : ' · preservada no histórico'))); });
    loadMedia(a.obra.id, a.documento.mediaId);
  }
  async function loadDetail(id, discard) {
    if (busy) return;
    if ((dirty || editorPending || importacaoPendente()) && !discard) { message('Há alterações não salvas ou uma importação pendente. Confirme ou cancele a importação e salve, ou use “Descartar alterações e criar outro” antes de mudar de arranjo.', true); return; }
    var ticket = ++detailTicket; ++importTicket; busy = true; render();
    try { var data = await api('/arranjos/' + encodeURIComponent(id)); if (ticket === detailTicket) { accept(data.arranjo); message('Rascunho carregado. Alterar o conteúdo não muda a versão já publicada.'); } }
    catch (e) { if (ticket === detailTicket) message(e.message, true); }
    finally { if (ticket === detailTicket) { busy = false; render(); } }
  }
  async function mutate(action) {
    if (busy || conflict) return;
    if (editorPending) { message('Aplique ou cancele os campos pendentes do editor antes de continuar.', true); return; }
    if (importacaoPendente()) { message('Confirme ou cancele a importação pendente antes de continuar.', true); return; }
    var id = current && current.id, method = 'POST', path = '/arranjos', body;
    try {
      if (action === 'save') {
        var doc = readDocument();
        if (!$('tg-work').value) throw new Error('Escolha uma obra do seu acervo.');
        if (id) { path += '/' + encodeURIComponent(id); method = 'PUT'; body = { revision: current.revision, documento: doc }; }
        else body = { obraId: $('tg-work').value, documento: doc };
      } else {
        if (!current || dirty) throw new Error('Salve e revise o rascunho antes de publicar ou retirar.');
        path += '/' + encodeURIComponent(id) + (action === 'publish' ? '/publicar' : '/retirar'); body = { revision: current.revision };
      }
      busy = true; ++importTicket; render();
      var data = await api(path, method, body); accept(data.arranjo, true);
      message(action === 'save' ? 'Rascunho salvo. Abra a prévia e revise antes de publicar.' : action === 'publish' ? 'Nova versão publicada para quem pode acessar a obra.' : 'Publicação retirada. Versões e sessões anteriores foram preservadas.');
      loadList(listOffset);
    } catch (e) {
      if (e.status === 409 && Number.isInteger(e.revision) && current && e.revision!==current.revision) { conflict = true; message('A revisão mudou em outra sessão. Suas alterações continuam no formulário. Copie o JSON antes de recarregar a revisão salva.', true); }
      else message(e.message, true);
    } finally { busy = false; render(); }
  }
  function newDraft() {
    if (busy || importacaoPendente()) return;
    ++detailTicket; ++mediaTicket; ++importTicket; ++workChoice; current = null; dirty = false; conflict = false;
    mediaItems=[];mediaOffset=0;mediaWork='';$('tg-media-more').hidden=true;
    limparImportacao(); fillDocument(null); $('tg-work').value = ''; $('tg-versions').replaceChildren(); render(); message('Escolha a obra e crie ou importe as notas do novo arranjo.');
  }
  app.innerHTML = '<div class="tj-heading"><div><p class="tj-eyebrow">MUSIQUE / SEU ACERVO</p><h1>Gerenciar arranjos</h1><p class="tj-intro">Prepare uma versão, revise na pista e publique para quem pode acessar a obra.</p></div><a href="/music/tocar">Voltar à prática</a></div>' +
    '<p id="tg-status" class="tj-status" role="status"></p><p id="tg-login" hidden>Sua sessão terminou. <a href="/music/entrar?voltar=%2Fmusic%2Ftocar%2Fgerenciar">Entrar no Musique</a></p><p id="tg-access" hidden>Seu acesso ao Musique precisa estar ativo. <a href="/music/app#conta">Ver assinatura</a></p><div class="tg-layout"><section class="tj-panel"><h2>Seus arranjos</h2><div class="tg-search"><label>Buscar arranjo<input id="tg-list-q" type="search"></label><button id="tg-list-search" type="button">Buscar</button></div><ul id="tg-list" class="tj-catalog-results"></ul><div class="tj-catalog-pages"><button id="tg-list-prev" disabled>Anterior</button><button id="tg-list-next" disabled>Próxima</button></div><button id="tg-new" type="button">Novo arranjo</button></section>' +
    '<section class="tj-panel"><h2>Rascunho e publicação</h2><p id="tg-version"></p><div class="tg-search"><label>Buscar obra própria<input id="tg-work-q" type="search"></label><button id="tg-work-search">Buscar obra</button></div><label class="tj-field">Obra do seu acervo<select id="tg-work"><option value="">Selecione uma obra do seu acervo</option></select></label><div class="tj-catalog-pages"><button id="tg-work-prev" disabled>Anterior</button><button id="tg-work-next" disabled>Próxima</button></div><p id="tg-work-empty" hidden>Nenhuma obra encontrada. <a href="/music/app#biblioteca">Abra o acervo para cadastrar uma obra.</a></p><p id="tg-visibility" class="tj-small"></p>' +
    '<div class="tg-grid"><label class="tj-field">Título do arranjo<input id="tg-title" maxlength="120"></label><label class="tj-field">Instrumento<select id="tg-instrument"></select></label><label class="tj-field">Nível<select id="tg-level"></select></label><label class="tj-field">Técnica<select id="tg-technique"></select></label></div>' +
    '<label class="tj-field">Objetivo do estudo<input id="tg-objective" maxlength="500"></label><label class="tj-field">Autoria, créditos e procedência<input id="tg-credits" maxlength="500"></label><label class="tj-field">Áudio já vinculado à obra<select id="tg-media"><option value="">Sem áudio associado · usar demonstração sintetizada</option></select></label><label class="tj-field">O 0:00 do arranjo ocorre em (ms)<input id="tg-media-offset" type="number" min="0" max="600000" step="1" inputmode="numeric" value="0" aria-describedby="tg-media-offset-help"></label><p id="tg-media-offset-help" class="tj-small"></p><button id="tg-media-more" type="button" hidden>Carregar mais áudios desta obra</button><div id="tg-waveform"></div>' +
    '<p class="tj-small">Arquivos de áudio são geridos no acervo. Crie notas para instrumentos de cordas, piano MIDI ou bateria eletrônica. MP3 sozinho não cria um arranjo.</p><label class="tj-field">Importar arranjo JSON (até 1 MiB)<input id="tg-json" type="file" accept=".json,application/json"></label><label class="tj-field">Importar MIDI (até 512 KiB, lido somente neste navegador)<input id="tg-midi" type="file" accept=".mid,.midi,audio/midi,audio/x-midi"></label><label class="tj-field">Importar MusicXML ou MXL (até 2 MiB, lido somente neste navegador)<input id="tg-musicxml" type="file" accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,application/xml,text/xml"></label><section id="tg-midi-preview" class="tj-field" aria-live="polite" hidden><p id="tg-midi-info"></p><label><span id="tg-import-line-label">Linha MIDI</span><select id="tg-midi-candidates"><option value="">Escolha uma linha MIDI disponível</option></select></label><p id="tg-midi-detail" class="tj-small"></p><div class="tg-actions"><button id="tg-midi-confirm" type="button" disabled>Importar esta linha</button><button id="tg-midi-cancel" type="button">Cancelar importação MIDI</button></div></section>' +
    '<div class="tg-search"><label>Começar de um estudo original<select id="tg-example"></select></label><button id="tg-use-example" type="button">Usar cópia do estudo</button></div><p id="tg-chart-info"></p>' +
    '<div id="tg-editor"></div>' +
    '<div class="tg-actions"><button id="tg-save" type="button">Salvar rascunho</button><a id="tg-preview" target="_blank" rel="noopener" hidden>Revisar na pista ↗</a><button id="tg-publish" type="button" disabled>Publicar nova versão</button><button id="tg-withdraw" type="button" disabled>Retirar publicação</button><button id="tg-reload" type="button" disabled>Recarregar revisão salva (descarta alterações)</button><button id="tg-download" type="button">Baixar JSON do formulário</button></div><p class="tj-small">Publicar cria uma versão preservada. Editar depois prepara outro rascunho; retirar não apaga o histórico.</p><h3>Versões publicadas</h3><ul id="tg-versions"></ul></section></div>';
  waveform = WaveformCliente.montar($('tg-waveform'), {
    fetch: fetch,
    onUsePosition: function (offsetMs) {
      if (busy || conflict || importacaoPendente() || editorPending || !$('tg-media').value) return;
      $('tg-media-offset').value = String(offsetMs);
      changed();
      message('O ponto atual do áudio foi copiado para o rascunho. Salve e revise antes de publicar.');
    },
  });
  editor = Editor.montar($('tg-editor'), {
    perfilAtual: function () { return $('tg-instrument').value; },
    onChange: function (next) {
      ++importTicket;
      if (!chart || !$('tg-title').value.trim()) $('tg-title').value = next.title;
      chart = Core.validarChart(next); changed();
    },
    onPending: function (pending) { editorPending = pending; if (pending) ++importTicket; render(); },
  });
  Formato.INSTRUMENTOS.forEach(function (v) { option($('tg-instrument'), v, v === 'violao' ? 'Violão' : v === 'guitarra' ? 'Guitarra' : v === 'baixo' ? 'Contrabaixo de 4 cordas' : v === 'cavaquinho' ? 'Cavaquinho' : v === 'ukulele' ? 'Ukulele' : v === 'bandolim' ? 'Bandolim de 5 cordas' : v === 'piano' ? 'Piano MIDI' : 'Bateria eletrônica'); });
  Formato.NIVEIS.forEach(function (v) { option($('tg-level'), v, v); });
  Formato.TECNICAS.forEach(function (v) { option($('tg-technique'), v, v.replace(/-/g, ' ')); });
  Estudos.listar().forEach(function (s) { option($('tg-example'), s.id, s.title); });
  ['tg-title', 'tg-objective', 'tg-credits'].forEach(function (id) { $(id).addEventListener('input', changed); });
  $('tg-instrument').addEventListener('change', function () {
    var selecionado = perfilSelecionado(), atual = chart && perfilDoChart(chart);
    if (!selecionado) { this.value = 'violao'; message('Instrumento inválido.', true); return; }
    if (atual && atual.id !== selecionado.id) {
      this.value = instrumentoDoPerfil(atual, current && current.documento && current.documento.instrument);
      message('Este arranjo já usa ' + atual.rotulo.toLowerCase() + '. Crie ou importe um novo arranjo para trocar de instrumento.', true);
      render(); return;
    }
    changed();
  });
  ['tg-level', 'tg-technique'].forEach(function (id) { $(id).addEventListener('change', changed); });
  $('tg-media').addEventListener('change', function () { $('tg-media-offset').value = '0'; changed(); });
  $('tg-media-offset').addEventListener('input', changed);
  $('tg-work').addEventListener('change', function () { if (importacaoPendente()) return; ++workChoice; $('tg-media').replaceChildren(node('option','Sem áudio associado · usar demonstração sintetizada',{value:''})); $('tg-media-offset').value = '0'; changed(); return loadMedia(this.value, ''); });
  $('tg-media-more').addEventListener('click',function(){if(!busy&&!importacaoPendente()&&mediaWork===$('tg-work').value)return loadMedia(mediaWork,undefined,mediaOffset);});
  $('tg-json').addEventListener('change', async function () {
    if (busy || editorPending || importacaoPendente()) return;
    var file = this.files[0]; if (!file) return; var ticket = ++importTicket;
    try {
      if (file.size > Formato.LIMITE_BYTES) throw new Error('O arquivo deve ter no máximo 1 MiB.');
      var parsed = JSON.parse(await file.text()); if (ticket !== importTicket) return;
      if (parsed.chart) { var doc=Formato.validarDocumento(parsed); fillDocument(doc);++mediaTicket;loadMedia($('tg-work').value,doc.mediaId); }
      else {
        var proximoChart = Core.validarChart(parsed);
        var proximoInstrumento = instrumentoDoChart(proximoChart);
        editor.carregar(proximoChart);
        chart = proximoChart; $('tg-title').value = chart.title; $('tg-instrument').value = proximoInstrumento;
      }
      limparImportacao();
      dirty = true; render(); message('Notas importadas. Confira objetivo, créditos, áudio e prévia antes de publicar.');
    } catch (e) { if (ticket === importTicket) message('Arranjo inválido: ' + e.message, true); }
    this.value = '';
  });
  async function iniciarImportacao(tipo, file, importador, limite) {
    if (busy || editorPending || importacaoPendente() || !file) return;
    var ticket = ++importTicket, rotulo = tipo === 'musicxml' ? 'MusicXML/MXL' : 'MIDI', limiteTexto = limite === 512 * 1024 ? '512 KiB' : '2 MiB';
    var perfil = $('tg-instrument').value;
    importacao = { tipo: tipo, importador: importador, analysis: null, fileName: file.name || '', perfil: perfil, status: 'reading' };
    render();
    try {
      if (!Number.isFinite(file.size) || file.size < 0 || file.size > limite) throw new Error('O arquivo ' + rotulo + ' deve ter no máximo ' + limiteTexto + '.');
      if (typeof file.arrayBuffer !== 'function') throw new Error('Não foi possível ler este arquivo ' + rotulo + ' no navegador.');
      var bytes = new Uint8Array(await file.arrayBuffer()); if (ticket !== importTicket) return;
      var analysis = await importador.analisar(bytes, { perfil: perfil }); if (ticket !== importTicket) return;
      if (!analysis || !Array.isArray(analysis.candidates)) throw new Error('O arquivo ' + rotulo + ' não trouxe linhas para revisar.');
      mostrarAnaliseImportacao(tipo, importador, analysis, file.name || ''); render();
      message(rotulo + ' analisado localmente. Escolha uma linha disponível e confirme a importação; o rascunho ainda não foi alterado.');
    } catch (e) {
      if (ticket === importTicket) { limparImportacao(); render(); message(rotulo + ' inválido: ' + e.message, true); }
    }
  }
  $('tg-midi').addEventListener('change', function () {
    var file = this.files[0]; this.value = '';
    return iniciarImportacao('midi', file, ImportadorMidi, ImportadorMidi.LIMITE_BYTES || 512 * 1024);
  });
  $('tg-musicxml').addEventListener('change', function () {
    var file = this.files[0]; this.value = '';
    return iniciarImportacao('musicxml', file, ImportadorMusicXML, ImportadorMusicXML.LIMITE_BYTES || 2 * 1024 * 1024);
  });
  $('tg-midi-candidates').addEventListener('change', function () { renderImportacaoPreview(); });
  $('tg-midi-cancel').addEventListener('click', function () {
    if (busy || !importacaoPendente()) return;
    var rotulo = rotuloImportacao(importacao);
    ++importTicket; limparImportacao(); render(); message('Importação ' + rotulo + ' cancelada. O rascunho anterior foi preservado.');
  });
  $('tg-midi-confirm').addEventListener('click', function () {
    if (busy || editorPending || !importacao || importacao.status !== 'review') return;
    var candidate = candidatoAtual(), pendente = importacao, rotulo = rotuloImportacao(importacao);
    if (!candidate) { message('Escolha uma linha ' + rotulo + ' disponível antes de importar.', true); return; }
    try {
      var usarTitulo = tituloPodeVirDaImportacao();
      var title = usarTitulo ? tituloImportacaoSeguro(pendente.fileName, pendente.tipo, pendente.analysis.title) : $('tg-title').value.trim();
      var novoId = pendente.tipo === 'musicxml' ? 'musicxml-importado' : 'midi-importado';
      var next = Core.validarChart(pendente.importador.criarChart(pendente.analysis, candidate.id, { id: chart && chart.id ? chart.id : novoId, title: title, perfil: pendente.perfil }));
      editor.carregar(next); ++importTicket; chart = next;
      if (usarTitulo) $('tg-title').value = title;
      limparImportacao(); dirty = true; render();
      message('Linha ' + rotulo + ' importada. Revise as posições no editor, salve o rascunho e confira na pista antes de publicar.');
    } catch (e) { message('Não foi possível importar esta linha ' + rotulo + ': ' + e.message, true); }
  });
  $('tg-use-example').addEventListener('click', function () {
    if (busy || editorPending || importacaoPendente()) return;
    ++importTicket;
    var s = Estudos.listar().find(function (item) { return item.id === $('tg-example').value; }); if (!s) return;
    var instrument = instrumentoDoChart(s.chart, s.instrument); editor.carregar(s.chart);
    chart = s.chart; $('tg-instrument').value = instrument; $('tg-title').value = s.title; $('tg-objective').value = s.objective; $('tg-credits').value = 'Estudo original Musique';
    limparImportacao(); $('tg-level').value = 'iniciante'; dirty = true; render(); message('Cópia do estudo carregada. A biblioteca original continua preservada.');
  });
  $('tg-save').addEventListener('click', function () { return mutate('save'); });
  $('tg-publish').addEventListener('click', function () { return mutate('publish'); });
  $('tg-withdraw').addEventListener('click', function () { return mutate('withdraw'); });
  $('tg-new').addEventListener('click', newDraft);
  $('tg-reload').addEventListener('click', function () { if (current) return loadDetail(current.id, true); });
  $('tg-list-search').addEventListener('click', function () { return loadList(0); });
  $('tg-list-prev').addEventListener('click', function () { return loadList(Math.max(0, listOffset - 20)); });
  $('tg-list-next').addEventListener('click', function () { return loadList(listOffset + 20); });
  $('tg-work-search').addEventListener('click', function () { return loadWorks(0); });
  $('tg-work-prev').addEventListener('click', function () { return loadWorks(Math.max(0, worksOffset - 50)); });
  $('tg-work-next').addEventListener('click', function () { return loadWorks(worksOffset + 50); });
  $('tg-download').addEventListener('click', function () {
    try { var url = URL.createObjectURL(new Blob([JSON.stringify(readDocument(), null, 2)], { type: 'application/json' })); node('a', null, { href: url, download: 'musique-rascunho.json' }).click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
    catch (e) { message(e.message, true); }
  });
  async function selectInitialWork() {
    if(!initialWork)return;var choice=workChoice;
    try{var data=await api('/obras/'+encodeURIComponent(initialWork));if(choice!==workChoice||current||importacaoPendente())return;
      var w=data.obra;if(!w||w.id!==initialWork)throw new Error('Obra não encontrada no seu acervo.');
      if(!works.some(function(item){return item.id===w.id;}))works.push(w);
      if(!Array.prototype.some.call($('tg-work').children,function(n){return n.value===w.id;}))option($('tg-work'),w.id,w.titulo);
      $('tg-work').value=w.id;render();await loadMedia(w.id,'');
    }catch(e){if(choice===workChoice)message('Não foi possível selecionar a obra: '+e.message,true);}
  }
  window.addEventListener('beforeunload', function (event) { if (dirty || editorPending || importacaoPendente()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', function () { ++waveformTicket; waveformSource = ''; if (waveform) waveform.destruir(); });
  newDraft(); loadWorks(0); loadList(0); selectInitialWork();
})();
