// =====================================================================
// Editor de portais do tour 360 — carregado SÓ com /tour.html?editor=1.
//
// Serve para descobrir o yaw/pitch de uma porta sem ir por tentativa: gire até
// a porta, clique nela, escolha para onde leva. O portal aparece na hora, na
// posição exata em que vai ficar para o visitante.
//
// O trabalho fica salvo no navegador (localStorage), então dá para fazer em
// várias sessões. No fim, "Exportar tudo" gera o JSON de todas as cenas para
// colar no cenas.json (ou mandar para o Claude aplicar).
//
// Nada aqui roda para o visitante comum: o visualizador só busca este arquivo
// quando o parâmetro está na URL.
// =====================================================================
(function () {
  'use strict';

  var RAD = Math.PI / 180;
  var CHAVE = 'tour360-editor';

  function esperarViewer(tentativas, ok) {
    if (window.__tour360 && window.__tour360.gl && window.__tour360.cenaAtual) return ok(window.__tour360);
    if (tentativas <= 0) return;
    setTimeout(function () { esperarViewer(tentativas - 1, ok); }, 120);
  }

  function carregar() {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (e) { return {}; }
  }
  function salvar(d) {
    try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch (e) {}
  }

  esperarViewer(80, function (v) {
    var dados = carregar();

    // Já havia trabalho salvo? aplica nas cenas em memória para o autor ver o que fez.
    for (var i = 0; i < v.cenas.length; i++) {
      if (dados[v.cenas[i].id]) v.cenas[i].hotspots = dados[v.cenas[i].id];
    }
    v.desenharHotspots(v.cenaAtual);

    // ---------------------------------------------------------------- UI
    var caixa = document.createElement('div');
    caixa.className = 't360-ed';
    caixa.innerHTML = [
      '<header>Editor de portais <button type="button" class="t360-ed-min" title="Encolher">—</button></header>',
      '<div class="t360-ed-corpo">',
      '  <p class="t360-ed-cena"></p>',
      '  <p class="t360-ed-vista"></p>',
      '  <button type="button" class="t360-ed-marcar">Marcar portal: clique na porta</button>',
      '  <div class="t360-ed-form" hidden>',
      '    <label>Leva para<select class="t360-ed-destino"></select></label>',
      '    <label>Texto do botão<input class="t360-ed-texto" placeholder="Ir para a cozinha"></label>',
      '    <label><input type="checkbox" class="t360-ed-info"> só informação (não navega)</label>',
      '    <div class="t360-ed-acoes"><button type="button" class="t360-ed-add">Adicionar</button>',
      '    <button type="button" class="t360-ed-cancel">Cancelar</button></div>',
      '  </div>',
      '  <ul class="t360-ed-lista"></ul>',
      '  <div class="t360-ed-rodape">',
      '    <button type="button" class="t360-ed-exportar">Exportar tudo</button>',
      '    <button type="button" class="t360-ed-limpar">Limpar cena</button>',
      '  </div>',
      '  <textarea class="t360-ed-saida" readonly hidden></textarea>',
      '</div>'
    ].join('');
    document.body.appendChild(caixa);

    var q = function (s) { return caixa.querySelector(s); };
    var elCena = q('.t360-ed-cena'), elVista = q('.t360-ed-vista'), elLista = q('.t360-ed-lista');
    var elForm = q('.t360-ed-form'), elDestino = q('.t360-ed-destino'), elTexto = q('.t360-ed-texto');
    var elInfo = q('.t360-ed-info'), elSaida = q('.t360-ed-saida'), btnMarcar = q('.t360-ed-marcar');
    var pendente = null, armado = false;

    q('.t360-ed-min').addEventListener('click', function () {
      caixa.classList.toggle('t360-ed-encolhido');
    });

    // Lista de destinos: todas as cenas, com a casa no rótulo para não confundir homônimos.
    for (var k = 0; k < v.cenas.length; k++) {
      var o = document.createElement('option');
      o.value = v.cenas[k].id;
      o.textContent = (v.cenas[k].casa ? v.cenas[k].casa + ' · ' : '') + v.cenas[k].titulo;
      elDestino.appendChild(o);
    }

    function hotspotsDaCena() {
      var id = v.cenaAtual.id;
      if (!dados[id]) dados[id] = (v.cenaAtual.hotspots || []).slice();
      return dados[id];
    }

    function aplicar() {
      v.cenaAtual.hotspots = hotspotsDaCena();
      v.desenharHotspots(v.cenaAtual);
      salvar(dados);
      renderLista();
    }

    function renderLista() {
      var hs = hotspotsDaCena();
      elCena.innerHTML = '<strong>' + v.cenaAtual.id + '</strong>';
      if (!hs.length) { elLista.innerHTML = '<li class="t360-ed-vazio">nenhum portal nesta cena</li>'; return; }
      elLista.innerHTML = '';
      hs.forEach(function (h, idx) {
        var li = document.createElement('li');
        li.innerHTML = '<span>' + (h.tipo === 'info' ? 'ℹ ' : '↗ ') + (h.texto || '(sem texto)') +
          '<small>yaw ' + h.yaw + '° · pitch ' + h.pitch + '°' + (h.destino ? ' → ' + h.destino : '') + '</small></span>';
        var x = document.createElement('button');
        x.type = 'button'; x.textContent = '✕'; x.title = 'Remover';
        x.addEventListener('click', function () { hs.splice(idx, 1); aplicar(); });
        li.appendChild(x);
        elLista.appendChild(li);
      });
    }

    // ---- clique na cena -> yaw/pitch --------------------------------------
    // Inverte a projeção do visualizador: pixel -> raio da câmera -> direção no mundo.
    function anguloDoClique(ev) {
      var c = v.canvas, r = c.getBoundingClientRect();
      var ndcX = ((ev.clientX - r.left) / r.width) * 2 - 1;
      var ndcY = 1 - ((ev.clientY - r.top) / r.height) * 2;
      var tan = Math.tan(v.fov * RAD / 2), aspect = r.width / r.height;
      var vx = ndcX * tan * aspect, vy = ndcY * tan, vz = -1;
      var n = Math.sqrt(vx * vx + vy * vy + vz * vz);
      vx /= n; vy /= n; vz /= n;
      var m = v.rot;  // matriz da câmera, em ordem de coluna
      var dx = m[0] * vx + m[3] * vy + m[6] * vz;
      var dy = m[1] * vx + m[4] * vy + m[7] * vz;
      var dz = m[2] * vx + m[5] * vy + m[8] * vz;
      return {
        yaw: Math.round(Math.atan2(dx, -dz) / RAD),
        pitch: Math.round(Math.asin(Math.max(-1, Math.min(1, dy))) / RAD)
      };
    }

    // Distinguir clique de arrasto: o canvas já usa pointer events para girar a cena.
    var partiuDe = null;
    v.canvas.addEventListener('pointerdown', function (e) { partiuDe = { x: e.clientX, y: e.clientY }; });
    v.canvas.addEventListener('click', function (e) {
      if (!armado || !partiuDe) return;
      if (Math.abs(e.clientX - partiuDe.x) > 5 || Math.abs(e.clientY - partiuDe.y) > 5) return; // foi arrasto
      pendente = anguloDoClique(e);
      armado = false;
      btnMarcar.classList.remove('t360-ed-armado');
      btnMarcar.textContent = 'Marcar portal: clique na porta';
      elForm.hidden = false;
      elTexto.value = '';
      elTexto.focus();
      elVista.textContent = 'ponto marcado: yaw ' + pendente.yaw + '° · pitch ' + pendente.pitch + '°';
    });

    btnMarcar.addEventListener('click', function () {
      armado = !armado;
      btnMarcar.classList.toggle('t360-ed-armado', armado);
      btnMarcar.textContent = armado ? 'Clique na porta… (esc cancela)' : 'Marcar portal: clique na porta';
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && armado) { armado = false; btnMarcar.classList.remove('t360-ed-armado'); btnMarcar.textContent = 'Marcar portal: clique na porta'; }
    });

    q('.t360-ed-add').addEventListener('click', function () {
      if (!pendente) return;
      var h = { yaw: pendente.yaw, pitch: pendente.pitch, tipo: elInfo.checked ? 'info' : 'cena', texto: elTexto.value.trim() || 'Ver' };
      if (!elInfo.checked) h.destino = elDestino.value;
      hotspotsDaCena().push(h);
      pendente = null; elForm.hidden = true;
      aplicar();
    });
    q('.t360-ed-cancel').addEventListener('click', function () { pendente = null; elForm.hidden = true; });

    q('.t360-ed-limpar').addEventListener('click', function () {
      if (!confirm('Apagar os portais desta cena?')) return;
      dados[v.cenaAtual.id] = [];
      aplicar();
    });

    q('.t360-ed-exportar').addEventListener('click', function () {
      var saida = {};
      Object.keys(dados).forEach(function (id) { if (dados[id] && dados[id].length) saida[id] = dados[id]; });
      elSaida.hidden = false;
      elSaida.value = JSON.stringify(saida, null, 2);
      elSaida.select();
      try { document.execCommand('copy'); } catch (e) {}
    });

    // ---- atualiza o painel a cada quadro ---------------------------------
    var ultimaCena = null;
    setInterval(function () {
      if (!v.cenaAtual) return;
      if (v.cenaAtual !== ultimaCena) {
        ultimaCena = v.cenaAtual;
        v.cenaAtual.hotspots = hotspotsDaCena();
        renderLista();
        pendente = null; elForm.hidden = true;
      }
      if (!pendente) {
        elVista.textContent = 'olhando para: yaw ' + Math.round(v.yaw / RAD) % 360 +
          '° · pitch ' + Math.round(v.pitch / RAD) + '° · fov ' + Math.round(v.fov) + '°';
      }
    }, 150);

    v.autoRotate = false;
    renderLista();
    console.log('[tour360] editor ativo. Trabalho salvo no navegador; use "Exportar tudo" ao terminar.');
  });
})();
