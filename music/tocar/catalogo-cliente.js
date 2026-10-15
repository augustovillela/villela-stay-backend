(function (root) {
  'use strict';
  var BASE = '/music/api/tocar';
  function node(tag, text, attrs) {
    var n = document.createElement(tag);
    if (text !== null) n.textContent = text;
    Object.keys(attrs || {}).forEach(function (key) { n.setAttribute(key, attrs[key]); });
    return n;
  }
  async function requisicao(path, options) {
    var response = await fetch(BASE + path, Object.assign({ credentials: 'same-origin' }, options || {}));
    var data = await response.json();
    if (!response.ok) {
      var error = new Error(data.erro || 'Não foi possível carregar o catálogo.');
      error.status = response.status; throw error;
    }
    return data;
  }
  function montar(container, options) {
    var ticket = 0, offset = 0, total = 0, locked = false, buttons = [];
    container.innerHTML = '<div class="tj-catalog-heading"><h2>Catálogo para tocar</h2><a href="/music/tocar/gerenciar">Gerenciar meus arranjos</a></div>' +
      '<p>Arranjos publicados de obras às quais sua conta tem acesso. Os estudos originais continuam disponíveis abaixo.</p>' +
      '<div class="tj-catalog-filters"><label>Buscar<input id="tc-q" type="search" maxlength="120" placeholder="Título ou artista"></label>' +
      '<label>Instrumento<select id="tc-instrument"><option value="">Todos</option><option value="violao">Violão</option><option value="guitarra">Guitarra</option></select></label>' +
      '<label>Nível<select id="tc-level"><option value="">Todos</option><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></label>' +
      '<label>Técnica<select id="tc-technique"><option value="">Todas</option><option value="notas-isoladas">Notas isoladas</option><option value="cordas-soltas">Cordas soltas</option><option value="troca-de-cordas">Troca de cordas</option><option value="escalas">Escalas</option><option value="arpejos">Arpejos</option></select></label>' +
      '<button id="tc-search" type="button">Buscar</button></div><p id="tc-status" role="status"></p><ul id="tc-results" class="tj-catalog-results"></ul>' +
      '<div class="tj-catalog-pages"><button id="tc-previous" type="button" disabled>Anterior</button><span id="tc-page"></span><button id="tc-next" type="button" disabled>Próxima</button></div>';
    function $(id) { return document.getElementById(id); }
    function status(message) { $('tc-status').textContent = message; }
    function lock(value) { locked = value; buttons.forEach(function (b) { b.disabled = locked; }); }
    async function carregar(nextOffset) {
      offset = nextOffset; var current = ++ticket;
      status('Carregando catálogo…');
      var query = new URLSearchParams({ limit: '12', offset: String(offset) });
      [['q', 'tc-q'], ['instrument', 'tc-instrument'], ['level', 'tc-level'], ['technique', 'tc-technique']].forEach(function (pair) {
        if ($(pair[1]).value.trim()) query.set(pair[0], $(pair[1]).value.trim());
      });
      try {
        var data = await requisicao('/catalogo?' + query.toString());
        if (current !== ticket) return;
        total = Number(data.total) || 0; buttons = []; $('tc-results').replaceChildren();
        (data.arranjos || []).forEach(function (item) {
          var button = node('button', 'Abrir arranjo', { type: 'button', 'aria-label': 'Abrir ' + item.title });
          button.disabled = locked;
          button.addEventListener('click', function () { if (!locked) return options.onSelect(item); });
          buttons.push(button);
          var li = node('li', null);
          li.appendChild(node('strong', item.title));
          li.appendChild(node('span', [item.obra && item.obra.artista, item.instrument, item.level, 'versão ' + item.versionNumber].filter(Boolean).join(' · ')));
          li.appendChild(node('p', item.objective)); li.appendChild(button); $('tc-results').appendChild(li);
        });
        status(total ? total + ' arranjo(s) disponível(is).' : 'Nenhum arranjo encontrado. Experimente outro filtro ou escolha um estudo abaixo.');
        $('tc-previous').disabled = offset === 0; $('tc-next').disabled = offset + 12 >= total;
        $('tc-page').textContent = total ? (offset + 1) + '–' + Math.min(offset + 12, total) + ' de ' + total : '';
      } catch (e) {
        if (current !== ticket) return;
        $('tc-results').replaceChildren(); buttons = []; $('tc-previous').disabled = true; $('tc-next').disabled = true;
        status(e.status === 401 ? 'Entre na sua conta para abrir o catálogo. Os estudos abaixo continuam disponíveis.' : e.status === 402 ? 'Seu acesso ao catálogo requer assinatura ativa. Você pode continuar com os estudos abaixo.' : e.message + ' Os estudos abaixo continuam disponíveis.');
        $('tc-page').textContent='';
        if(e.status===401||e.status===402){var access=node('li',null);access.appendChild(node('a',e.status===401?'Entrar no Musique':'Ver assinatura',{href:e.status===401?'/music/entrar?voltar=%2Fmusic%2Ftocar':'/music/app#conta'}));$('tc-results').appendChild(access);}
      }
    }
    $('tc-search').addEventListener('click', function () { return carregar(0); });
    $('tc-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); return carregar(0); } });
    $('tc-previous').addEventListener('click', function () { return carregar(Math.max(0, offset - 12)); });
    $('tc-next').addEventListener('click', function () { return carregar(offset + 12); });
    if (options.loggedIn) carregar(0);
    else {
      status('Entre na sua conta para acessar o catálogo. Os estudos originais abaixo são abertos.');
      var guest=node('li',null);guest.appendChild(node('a', 'Entrar no Musique', { href: '/music/entrar?voltar=%2Fmusic%2Ftocar' }));$('tc-results').appendChild(guest);
    }
    return { bloquear: lock, recarregar: function () { return carregar(0); } };
  }
  root.MusiqueTocarCatalogo = { montar: montar, requisicao: requisicao };
})(window);
