/* =====================================================================
   Comunicados — botão de avisos e suporte dentro dos apps do Grupo
   Villela Stay. Um arquivo só para todos os produtos: cada app inclui
     <script src="<base do app>/comunicados.js" defer></script>
   e o widget descobre a própria base pelo endereço do script, então fala
   com a API do MESMO produto, com a sessão dele.

   Três abas: Avisos (comunicados), Suporte (chat com a equipe) e
   Preferências (o que a pessoa quer receber por e-mail/WhatsApp).
   data-sino="nao": o app já tem central de avisos própria (o comunicado
   entra nela) — aqui ficam só Suporte, Preferências e a faixa de destaque.
   Sem sessão (visitante) o widget não desenha nada.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__vsComunicados) return;
  window.__vsComunicados = true;
  var eu = document.currentScript;
  if (!eu || !eu.src) return;
  var base = eu.src.replace(/\/comunicados\.js(\?.*)?$/, '');
  var cor = eu.getAttribute('data-cor') || '#1B2A4A';
  // Canto inferior DIREITO por padrão: é onde as pessoas procuram chat. Ficava
  // à esquerda e o Augusto — dono da plataforma — não achou o botão; aluno
  // nenhum acharia. data-lado="esquerda" muda, se algum app precisar.
  var lado = eu.getAttribute('data-lado') === 'esquerda' ? 'left' : 'right';
  var comAvisos = eu.getAttribute('data-sino') !== 'nao';
  var E = { itens: [], suporteNaoLidas: 0, aberto: false, aba: comAvisos ? 'avisos' : 'suporte', conversa: null, produto: '' };
  var timerConversa = null;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function paragrafos(t) { return String(t || '').split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }
  function quando(iso) { try { var d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
  function linkSeguro(u) { return /^https:\/\//i.test(String(u || '')) ? u : ''; }

  var css = '' +
    '.vsc-bt{position:fixed;bottom:18px;' + lado + ':18px;z-index:2147483000;min-height:48px;padding:0 18px 0 14px;border-radius:26px;border:0;background:' + cor + ';color:#fff;font:700 15px/1 Inter,system-ui,Arial,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.28);display:flex;align-items:center;gap:8px}' +
    '.vsc-bt:hover{filter:brightness(1.08)}.vsc-bt .vsc-ico{font-size:20px}' +
    '@media (max-width:480px){.vsc-bt{padding:0 16px 0 13px;font-size:14px}}' +
    '.vsc-dica{position:fixed;bottom:76px;' + lado + ':18px;z-index:2147483000;max-width:min(280px,calc(100vw - 36px));background:#1F2933;color:#fff;border-radius:12px;padding:12px 14px;font:14px/1.45 Inter,system-ui,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)}' +
    '.vsc-dica button{background:none;border:0;color:#F5B301;font-weight:700;cursor:pointer;padding:6px 0 0;font:inherit;text-decoration:underline}' +
    '.vsc-bt:focus-visible,.vsc-pn button:focus-visible,.vsc-pn textarea:focus-visible,.vsc-pn input:focus-visible{outline:3px solid #F5B301;outline-offset:2px}' +
    '.vsc-n{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#D92D20;color:#fff;font:700 12px/20px system-ui,Arial,sans-serif;text-align:center}' +
    '.vsc-pn{position:fixed;bottom:78px;' + lado + ':18px;z-index:2147483000;width:min(390px,calc(100vw - 32px));height:min(72vh,600px);display:flex;flex-direction:column;background:#fff;color:#1F2933;border:1px solid #E2E6EC;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.2);font:14px/1.5 Inter,system-ui,Arial,sans-serif;overflow:hidden}' +
    '.vsc-hd{display:flex;justify-content:space-between;align-items:center;padding:10px 12px 0;font-weight:700}' +
    '.vsc-hd button{background:none;border:0;color:#4B5563;cursor:pointer;font-size:16px;padding:4px 8px}' +
    '.vsc-tabs{display:flex;gap:4px;padding:8px 10px 0;border-bottom:1px solid #EEF0F3}' +
    '.vsc-tab{flex:1;background:none;border:0;border-bottom:3px solid transparent;padding:8px 4px;font:600 13px system-ui,Arial,sans-serif;color:#4B5563;cursor:pointer}' +
    '.vsc-tab[aria-selected=true]{color:' + cor + ';border-bottom-color:' + cor + '}' +
    '.vsc-tab b{background:#D92D20;color:#fff;border-radius:9px;padding:0 6px;font-size:11px;margin-left:4px}' +
    '.vsc-corpo{flex:1;overflow:auto}' +
    '.vsc-it{padding:12px 14px;border-bottom:1px solid #F1F3F6}.vsc-it.nl{background:#F7F9FC}' +
    '.vsc-it h4{margin:2px 0 4px;font-size:14px;color:#111827}.vsc-it p{margin:0 0 6px}.vsc-cat{font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.05em}' +
    '.vsc-it a{color:' + cor + ';font-weight:700}.vsc-vz{padding:22px 14px;color:#6B7280;text-align:center}' +
    '.vsc-conv{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid #F1F3F6;padding:11px 14px;cursor:pointer;font:inherit;color:inherit}' +
    '.vsc-conv:hover{background:#F7F9FC}.vsc-conv small{display:block;color:#6B7280}' +
    '.vsc-st{display:inline-block;white-space:nowrap;font-size:11px;font-weight:700;border-radius:9px;padding:1px 7px;margin-left:6px;background:#EEF0F3;color:#374151}.vsc-st.r{background:#DCFCE7;color:#166534}.vsc-st.a{background:#FEF3C7;color:#92400E}' +
    '.vsc-msgs{padding:12px;display:flex;flex-direction:column;gap:8px}' +
    '.vsc-m{max-width:85%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}' +
    '.vsc-m.u{align-self:flex-end;background:' + cor + ';color:#fff;border-bottom-right-radius:4px}' +
    '.vsc-m.s{align-self:flex-start;background:#F1F3F6;border-bottom-left-radius:4px}' +
    '.vsc-m small{display:block;font-size:11px;opacity:.75;margin-top:3px}' +
    '.vsc-form{padding:10px 12px;border-top:1px solid #EEF0F3;display:flex;flex-direction:column;gap:8px}' +
    '.vsc-form input,.vsc-form textarea{width:100%;box-sizing:border-box;border:1px solid #D1D5DB;border-radius:10px;padding:8px 10px;font:inherit;resize:vertical}' +
    '.vsc-bp{background:' + cor + ';color:#fff;border:0;border-radius:20px;padding:9px 18px;font-weight:700;cursor:pointer;align-self:flex-end}' +
    '.vsc-bs{background:none;border:0;color:' + cor + ';font-weight:700;cursor:pointer;padding:10px 14px;text-align:left}' +
    '.vsc-erro{color:#B42318;font-size:13px;margin:0}.vsc-ok{color:#166534;font-size:13px;margin:0}' +
    '.vsc-anx{display:flex!important;gap:6px;align-items:center;font-size:12px!important;color:#4B5563!important;padding:2px 0!important}' +
    '.vsc-anx input[type=file]{font-size:12px!important;flex:1;min-width:0;width:auto!important;border:0!important;padding:0!important;background:none!important}' +
    '.vsc-m img{display:block;max-width:100%;border-radius:8px;margin:6px 0 2px}' +
    '.vsc-m .vsc-arq{display:inline-block;margin:4px 0;font-weight:700;text-decoration:underline}' +
    '.vsc-m.u .vsc-arq{color:#fff}.vsc-m.s .vsc-arq{color:' + cor + '}' +
    '.vsc-pref{padding:14px}.vsc-pref fieldset{border:1px solid #E5E7EB;border-radius:10px;padding:10px 12px;margin:0 0 12px}.vsc-pref legend{font-weight:700;padding:0 4px}' +
    '.vsc-pref label{display:flex;flex-direction:row;gap:8px;align-items:flex-start;margin:6px 0;cursor:pointer}.vsc-pref input{margin-top:3px;width:auto}' +
    '.vsc-fx{position:relative;z-index:2147483001;background:#FFF4E5;color:#7A3E00;border-bottom:1px solid #F5C27A;padding:10px 44px 10px 16px;font:14px/1.45 Inter,system-ui,Arial,sans-serif}' +
    '.vsc-fx.info{background:#EEF4FF;color:#1B2A4A;border-bottom-color:#C7D7FE}.vsc-fx.info a,.vsc-fx.info button{color:#1B2A4A}' +
    '.vsc-fx .vsc-mais{background:none;border:0;text-decoration:underline;font:inherit;cursor:pointer;padding:0 0 0 6px;position:static}' +
    '.vsc-fx b{margin-right:6px}.vsc-fx a{color:#7A3E00;font-weight:700}.vsc-fx button{position:absolute;right:8px;top:6px;background:none;border:0;font-size:20px;cursor:pointer;color:#7A3E00}' +
    // Blindagem: cada app tem CSS próprio para label/input/button, e ele vaza aqui dentro.
    '.vsc-pn,.vsc-pn *{box-sizing:border-box;letter-spacing:normal;text-transform:none}' +
    '.vsc-pn label{display:flex!important;flex-direction:row!important;align-items:center!important;gap:8px;margin:4px 0!important;padding:4px 0!important;min-height:0!important;font-weight:400!important;font-size:14px!important;line-height:1.4!important;color:#1F2933!important}' +
    '.vsc-pn input[type=radio]{flex:0 0 auto;width:16px!important;height:16px!important;margin:0!important;padding:0!important;box-shadow:none!important}' +
    '.vsc-pn fieldset{min-width:0}.vsc-pn legend{float:none;width:auto;font-size:14px!important}' +
    '.vsc-pn button{text-transform:none;min-height:0;box-shadow:none}' +
    '.vsc-pn textarea,.vsc-pn input[type=text],.vsc-pn input:not([type]){margin:0!important;min-height:0;font-size:14px!important;color:#1F2933;background:#fff}' +
    '@media print{.vsc-bt,.vsc-pn,.vsc-fx{display:none!important}}';

  function api(metodo, caminho, corpo) {
    var op = { method: metodo, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (corpo !== undefined) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo); }
    return fetch(base + '/api/comunicados' + caminho, op).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.erro || ('Erro ' + r.status)); return d; });
    });
  }
  function silencioso(p) { return p.catch(function () { return null; }); }

  // Anexos: lidos como base64 no navegador (sem multipart). O limite de
  // tamanho é conferido aqui E no servidor — aqui só para avisar antes de
  // subir 5 MB à toa.
  var MAX_ANEXO = 5 * 1024 * 1024, MAX_ARQUIVOS = 3;
  function lerArquivos(input) {
    var fs = input && input.files ? Array.prototype.slice.call(input.files) : [];
    if (!fs.length) return Promise.resolve([]);
    if (fs.length > MAX_ARQUIVOS) return Promise.reject(new Error('No máximo ' + MAX_ARQUIVOS + ' arquivos.'));
    var grande = fs.filter(function (f) { return f.size > MAX_ANEXO; })[0];
    if (grande) return Promise.reject(new Error('"' + grande.name + '" tem mais de 5 MB.'));
    return Promise.all(fs.map(function (f) {
      return new Promise(function (ok, nao) {
        var r = new FileReader();
        r.onload = function () { ok({ nome: f.name, dados: String(r.result) }); };
        r.onerror = function () { nao(new Error('Não consegui ler "' + f.name + '".')); };
        r.readAsDataURL(f);
      });
    }));
  }
  var campoAnexo = '<label class="vsc-anx">📎 <input type="file" name="arquivos" multiple accept="image/*,application/pdf" aria-label="Anexar imagem ou PDF"></label>';
  function htmlAnexos(m) {
    return (m.anexos || []).map(function (a) {
      var u = base + '/api/comunicados/suporte/anexo/' + encodeURIComponent(a.id);
      return /^image\//.test(a.mime)
        ? '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="' + esc(a.nome) + '" loading="lazy"></a>'
        : '<a class="vsc-arq" href="' + esc(u) + '" target="_blank" rel="noopener">📄 ' + esc(a.nome) + '</a>';
    }).join('');
  }

  var bt, pn, fx, estilo = false;
  function garantirEstilo() { if (!estilo) { estilo = true; var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); } }
  function montarBase() {
    garantirEstilo();
    if (bt) return;
    bt = document.createElement('button');
    bt.className = 'vsc-bt'; bt.type = 'button'; bt.setAttribute('aria-haspopup', 'dialog'); bt.setAttribute('aria-expanded', 'false');
    bt.onclick = function () { E.aberto ? fechar() : abrir(); };
    document.body.appendChild(bt);
    posicionar(); observarVizinhos();
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && E.aberto) { fechar(); if (bt) bt.focus(); } });
  }
  // Dica de primeira visita: some para sempre depois de vista/fechada. Se o
  // navegador bloquear o armazenamento (aba anônima), a dica só não aparece.
  var CHAVE_DICA = 'vs-comunicados-dica';
  function mostrarDica() {
    var ja; try { ja = localStorage.getItem(CHAVE_DICA); } catch (_) { ja = '1'; }
    if (ja || !bt || document.querySelector('.vsc-dica')) return;   // uma dica, uma vez só
    var d = document.createElement('div');
    d.className = 'vsc-dica'; d.setAttribute('role', 'status');
    d.innerHTML = 'Precisa de ajuda ou quer ver os avisos? É por aqui. 👇<br><button type="button">entendi</button>';
    document.body.appendChild(d);
    var fechar = function () { try { localStorage.setItem(CHAVE_DICA, '1'); } catch (_) {} d.remove(); };
    d.querySelector('button').onclick = fechar;
    bt.addEventListener('click', fechar, { once: true });
    setTimeout(fechar, 12000);
  }

  // ---------------- empilhar, nunca sobrepor ----------------
  // Cada app tem os seus botões flutuantes (Tutor Villela na Academy, mini
  // player do audiobook, etc.). Em vez de disputar o canto, o nosso sobe e
  // fica ACIMA do que já está lá — e se abrirem um painel que toma a tela
  // (a gaveta do Tutor), ele some enquanto aquilo estiver aberto.
  var BASE = 18, reposicionar = null;
  function vizinhos() {
    var meus = [bt, pn, fx, document.querySelector('.vsc-dica')], out = [];
    var filhos = document.body ? document.body.children : [];
    for (var i = 0; i < filhos.length; i++) {
      var e = filhos[i];
      if (meus.indexOf(e) >= 0) continue;
      var cs;
      try { cs = getComputedStyle(e); } catch (_) { continue; }
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || cs.pointerEvents === 'none') continue;
      var r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.bottom < innerHeight - 300) continue;                       // não está no rodapé
      var meuIni = lado === 'right' ? innerWidth - 280 : 0, meuFim = lado === 'right' ? innerWidth : 280;
      if (r.right < meuIni || r.left > meuFim) continue;                // não cruza a minha coluna
      out.push(r);
    }
    return out;
  }
  function posicionar() {
    if (!bt) return;
    var obst = vizinhos(), topo = innerHeight - BASE, tomaTela = false;
    obst.forEach(function (r) {
      if (r.height > innerHeight * 0.6 && r.width > innerWidth * 0.2) { tomaTela = true; return; }
      topo = Math.min(topo, r.top);
    });
    bt.style.display = tomaTela ? 'none' : 'flex';
    var b = Math.max(BASE, Math.round(innerHeight - topo) + 12);
    bt.style.bottom = b + 'px';
    var alturaBt = bt.offsetHeight || 48;
    if (pn) pn.style.bottom = (b + alturaBt + 10) + 'px';
    var dica = document.querySelector('.vsc-dica');
    if (dica) dica.style.bottom = (b + alturaBt + 10) + 'px';
  }
  function observarVizinhos() {
    if (reposicionar) return;
    reposicionar = function () { clearTimeout(reposicionar._t); reposicionar._t = setTimeout(posicionar, 250); };
    window.addEventListener('resize', reposicionar);
    try { new MutationObserver(reposicionar).observe(document.body, { childList: true, attributes: true, attributeFilter: ['style', 'class'] }); } catch (_) {}
    // Botão de outro app que aparece depois (o Tutor só monta dentro da aula).
    [800, 2500, 6000].forEach(function (ms) { setTimeout(posicionar, ms); });
  }

  function naoLidosAvisos() { return comAvisos ? E.itens.filter(function (x) { return !x.lido; }).length : 0; }
  function pintarBotao() {
    if (!bt) return;
    var n = naoLidosAvisos() + E.suporteNaoLidas;
    // Texto no botão: "Ajuda" é o que a pessoa procura quando precisa de nós.
    posicionar();
    bt.innerHTML = '<span class="vsc-ico" aria-hidden="true">💬</span><span>Ajuda</span>' +
      (n ? '<span class="vsc-n">' + (n > 9 ? '9+' : n) + '</span>' : '');
    var rot = comAvisos ? 'Ajuda e avisos' : 'Ajuda';
    bt.setAttribute('aria-label', n ? rot + ': ' + n + ' novidade' + (n > 1 ? 's' : '') : rot);
    bt.title = comAvisos ? 'Falar com a equipe e ver avisos' : 'Falar com a equipe';
  }
  // Todo aviso não lido aparece como FAIXA no topo, não só o de destaque:
  // depender de a pessoa reparar num sino é depender de sorte. A faixa mostra
  // um de cada vez (o mais novo) e só sai quando ela fecha — aí vem o próximo.
  function pintarFaixa() {
    var d = E.itens.filter(function (x) { return !x.lido; })[0];
    if (!d) { if (fx) { fx.remove(); fx = null; } return; }
    garantirEstilo();
    if (!fx) { fx = document.createElement('div'); fx.className = 'vsc-fx'; fx.setAttribute('role', 'status'); document.body.insertBefore(fx, document.body.firstChild); }
    var l = linkSeguro(d.link_url);
    fx.className = 'vsc-fx' + (d.destaque ? '' : ' info');
    fx.innerHTML = '<b>' + esc(d.emoji + ' ' + d.titulo) + '</b>' + esc(String(d.corpo).split('\n')[0].slice(0, 220)) +
      (l ? ' <a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(d.link_rotulo || 'Saiba mais') + '</a>' : '') +
      (String(d.corpo).length > 220 ? '<button type="button" class="vsc-mais">ler tudo</button>' : '') +
      '<button type="button" aria-label="Fechar aviso" title="Fechar">×</button>';
    var mais = fx.querySelector('.vsc-mais');
    if (mais) mais.onclick = function () { E.aba = 'avisos'; abrir(); };
    fx.querySelector('[aria-label="Fechar aviso"]').onclick = function () { lido(d.id); };
  }

  // ---------------- painel ----------------
  function abrir() {
    E.aberto = true;
    if (!pn) { pn = document.createElement('div'); pn.className = 'vsc-pn'; pn.setAttribute('role', 'dialog'); pn.setAttribute('aria-label', 'Avisos e suporte'); document.body.appendChild(pn); }
    pn.style.display = 'flex';
    bt.setAttribute('aria-expanded', 'true');
    pintarPainel();
  }
  function fechar() { E.aberto = false; pararConversa(); if (pn) pn.style.display = 'none'; if (bt) bt.setAttribute('aria-expanded', 'false'); }
  function pintarPainel() {
    if (!pn) return;
    var abas = (comAvisos ? [['avisos', 'Avisos', naoLidosAvisos()]] : []).concat([['suporte', 'Suporte', E.suporteNaoLidas], ['pref', 'Preferências', 0]]);
    pn.innerHTML = '<div class="vsc-hd"><span>' + esc(E.produto || 'Central') + '</span><button type="button" data-a="fechar" aria-label="Fechar">✕</button></div>' +
      '<div class="vsc-tabs" role="tablist">' + abas.map(function (a) {
        return '<button type="button" role="tab" class="vsc-tab" data-aba="' + a[0] + '" aria-selected="' + (E.aba === a[0]) + '">' + a[1] + (a[2] ? '<b>' + a[2] + '</b>' : '') + '</button>';
      }).join('') + '</div><div class="vsc-corpo" role="tabpanel"></div>';
    pn.querySelector('[data-a="fechar"]').onclick = fechar;
    Array.prototype.forEach.call(pn.querySelectorAll('.vsc-tab'), function (b) {
      b.onclick = function () { E.aba = b.getAttribute('data-aba'); E.conversa = null; pararConversa(); pintarPainel(); };
    });
    var corpo = pn.querySelector('.vsc-corpo');
    if (E.aba === 'avisos') pintarAvisos(corpo);
    else if (E.aba === 'suporte') { if (E.conversa) pintarConversa(corpo); else pintarListaSuporte(corpo); }
    else pintarPreferencias(corpo);
  }

  // ---------------- avisos ----------------
  function pintarAvisos(corpo) {
    corpo.innerHTML = (E.itens.some(function (x) { return !x.lido; }) ? '<button type="button" class="vsc-bs" data-a="todos">Marcar todos como lidos</button>' : '') +
      (E.itens.length ? E.itens.map(function (x) {
        var l = linkSeguro(x.link_url);
        return '<div class="vsc-it' + (x.lido ? '' : ' nl') + '"><div class="vsc-cat">' + esc(x.emoji + ' ' + x.categoria_rotulo) + ' · ' + esc(quando(x.quando)) + '</div>' +
          '<h4>' + esc(x.titulo) + '</h4>' + paragrafos(x.corpo) +
          (l ? '<a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(x.link_rotulo || 'Saiba mais') + ' →</a>' : '') + '</div>';
      }).join('') : '<div class="vsc-vz">Nenhum aviso por enquanto.</div>');
    var t = corpo.querySelector('[data-a="todos"]'); if (t) t.onclick = function () { lido('todos'); };
    // Ver a lista conta como leitura do que está à vista (a faixa só some ao fechar).
    // Ver a lista conta como leitura só do que NÃO está na faixa (a faixa é
    // fechada pela pessoa; senão o aviso sumiria antes de ser lido).
    var naFaixa = E.itens.filter(function (x) { return !x.lido; })[0];
    E.itens.forEach(function (x) { if (!x.lido && (!naFaixa || x.id !== naFaixa.id)) lido(x.id, true); });
  }
  function lido(id, sil) {
    E.itens.forEach(function (x) { if (id === 'todos' || x.id === id) x.lido = true; });
    silencioso(api('POST', '/' + encodeURIComponent(id) + '/lido'));
    pintarBotao(); pintarFaixa(); if (!sil && E.aberto) pintarPainel();
  }

  // ---------------- suporte ----------------
  var ROT_ST = { aberta: ['aguardando resposta', 'a'], respondida: ['respondida', 'r'], resolvida: ['resolvida', ''] };
  function pintarListaSuporte(corpo) {
    corpo.innerHTML = '<div class="vsc-vz">Carregando…</div>';
    api('GET', '/suporte').then(function (r) {
      var cs = r.conversas || [];
      corpo.innerHTML = '<form class="vsc-form" data-f="nova" style="border-top:0;border-bottom:1px solid #EEF0F3">' +
        '<b>Fale com a equipe</b>' +
        '<input name="assunto" maxlength="120" placeholder="Assunto (ex.: não consigo abrir a aula 3)" aria-label="Assunto">' +
        '<textarea name="texto" rows="3" maxlength="2000" required placeholder="Conte o que aconteceu. Respondemos por aqui e por e-mail." aria-label="Mensagem"></textarea>' +
        campoAnexo +
        '<p class="vsc-erro" aria-live="polite"></p><button class="vsc-bp" type="submit">Enviar</button></form>' +
        cs.map(function (c) {
          var st = ROT_ST[c.status] || [c.status, ''];
          return '<button type="button" class="vsc-conv" data-id="' + esc(c.id) + '"><b>' + esc(c.assunto) + '</b>' +
            '<span class="vsc-st ' + st[1] + '">' + esc(st[0]) + '</span>' + (c.nao_lidas_usuario ? ' <span class="vsc-n" style="position:static;display:inline-block">' + Number(c.nao_lidas_usuario) + '</span>' : '') +
            '<small>' + esc(String(c.ultima || '').slice(0, 90)) + ' · ' + esc(quando(c.atualizado_em)) + '</small></button>';
        }).join('');
      var f = corpo.querySelector('[data-f="nova"]');
      f.onsubmit = function (ev) {
        ev.preventDefault();
        var er = f.querySelector('.vsc-erro'), b = f.querySelector('button');
        er.textContent = ''; b.disabled = true;
        lerArquivos(f.arquivos)
          .then(function (anexos) { return api('POST', '/suporte', { assunto: f.assunto.value, texto: f.texto.value, anexos: anexos, pagina: location.pathname + location.hash }); })
          .then(function (d) { E.conversa = d.conversa; pintarPainel(); })
          .catch(function (e) { er.textContent = e.message; b.disabled = false; });
      };
      Array.prototype.forEach.call(corpo.querySelectorAll('.vsc-conv'), function (b) {
        b.onclick = function () { abrirConversa(b.getAttribute('data-id')); };
      });
    }).catch(function (e) { corpo.innerHTML = '<div class="vsc-vz">' + esc(e.message) + '</div>'; });
  }
  function abrirConversa(id) {
    return api('GET', '/suporte/' + encodeURIComponent(id)).then(function (d) {
      E.conversa = d.conversa; atualizar(); pintarPainel();
    });
  }
  function pintarConversa(corpo) {
    var c = E.conversa, st = ROT_ST[c.status] || [c.status, ''];
    corpo.innerHTML = '<button type="button" class="vsc-bs" data-a="voltar">← Conversas</button>' +
      '<div style="padding:0 14px"><b>' + esc(c.assunto) + '</b><span class="vsc-st ' + st[1] + '">' + esc(st[0]) + '</span></div>' +
      '<div class="vsc-msgs">' + c.mensagens.map(function (m) {
        return '<div class="vsc-m ' + (m.autor === 'staff' ? 's' : 'u') + '">' + esc(m.texto) + htmlAnexos(m) +
          '<small>' + esc(m.autor === 'staff' ? (m.autor_nome || 'Equipe') : 'Você') + ' · ' + esc(quando(m.criado_em)) + '</small></div>';
      }).join('') + '</div>' +
      '<form class="vsc-form" data-f="resp"><textarea name="texto" rows="2" maxlength="2000" required placeholder="Escreva uma resposta…" aria-label="Resposta"></textarea>' +
      campoAnexo + '<p class="vsc-erro" aria-live="polite"></p><button class="vsc-bp" type="submit">Enviar</button></form>';
    corpo.scrollTop = corpo.scrollHeight;
    corpo.querySelector('[data-a="voltar"]').onclick = function () { E.conversa = null; pararConversa(); pintarPainel(); };
    var f = corpo.querySelector('[data-f="resp"]');
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var er = f.querySelector('.vsc-erro'), b = f.querySelector('button');
      er.textContent = ''; b.disabled = true;
      lerArquivos(f.arquivos)
        .then(function (anexos) { return api('POST', '/suporte/' + encodeURIComponent(c.id), { texto: f.texto.value, anexos: anexos }); })
        .then(function (d) { E.conversa = d.conversa; pintarPainel(); })
        .catch(function (e) { er.textContent = e.message; b.disabled = false; });
    };
    // Com a conversa aberta, busca resposta nova a cada 20 s (sem apagar o que a pessoa digita).
    pararConversa();
    timerConversa = setInterval(function () {
      if (document.hidden || !E.conversa) return;
      silencioso(api('GET', '/suporte/' + encodeURIComponent(E.conversa.id))).then(function (d) {
        if (!d || !E.conversa || d.conversa.mensagens.length === E.conversa.mensagens.length) return;
        var ta0 = pn && pn.querySelector('[data-f="resp"] textarea'), rascunho = ta0 ? ta0.value : '';
        E.conversa = d.conversa; pintarPainel();
        var ta = pn && pn.querySelector('[data-f="resp"] textarea'); if (ta) ta.value = rascunho;
      });
    }, 20000);
  }
  function pararConversa() { if (timerConversa) { clearInterval(timerConversa); timerConversa = null; } }

  // ---------------- preferências ----------------
  var OPC = [['tudo', 'Tudo: novidades, dicas e avisos importantes'], ['importantes', 'Só avisos importantes (instabilidade, manutenção, suporte)'], ['nada', 'Nada']];
  function pintarPreferencias(corpo) {
    corpo.innerHTML = '<div class="vsc-vz">Carregando…</div>';
    api('GET', '/preferencias').then(function (r) {
      var p = r.preferencias || {};
      var bloco = function (k, titulo) {
        var x = p[k]; if (!x) return '';
        return '<fieldset><legend>' + titulo + ' <small style="font-weight:400;color:#6B7280">' + esc(x.contato) + '</small></legend>' +
          OPC.map(function (o) { return '<label><input type="radio" name="' + k + '" value="' + o[0] + '"' + (x.valor === o[0] ? ' checked' : '') + '> ' + esc(o[1]) + '</label>'; }).join('') + '</fieldset>';
      };
      var html = bloco('email', '✉️ E-mail') + bloco('whatsapp', '💬 WhatsApp');
      corpo.innerHTML = '<form class="vsc-pref">' + (html || '<p>Não há e-mail nem WhatsApp cadastrados nesta conta.</p>') +
        '<p style="color:#6B7280;font-size:12px;margin:0 0 10px">Os avisos dentro do app continuam aparecendo aqui. E-mails da sua conta (senha, compra, pagamento) e as respostas do suporte chegam sempre.</p>' +
        (html ? '<p class="vsc-ok" aria-live="polite"></p><button class="vsc-bp" type="submit">Salvar</button>' : '') + '</form>';
      var f = corpo.querySelector('form');
      f.onsubmit = function (ev) {
        ev.preventDefault();
        var ok = f.querySelector('.vsc-ok'), sel = function (n) { var i = f.querySelector('input[name="' + n + '"]:checked'); return i ? i.value : undefined; };
        ok.className = 'vsc-ok'; ok.textContent = '';
        api('POST', '/preferencias', { email: sel('email'), whatsapp: sel('whatsapp') })
          .then(function () { ok.textContent = 'Preferências salvas.'; })
          .catch(function (e) { ok.className = 'vsc-erro'; ok.textContent = e.message; });
      };
    }).catch(function (e) { corpo.innerHTML = '<div class="vsc-vz">' + esc(e.message) + '</div>'; });
  }

  // ---------------- ciclo ----------------
  function atualizar() {
    return silencioso(api('GET', '')).then(function (r) {
      if (!r || r.anonimo) { if (bt) { bt.remove(); bt = null; } if (pn) { pn.remove(); pn = null; E.aberto = false; } if (fx) { fx.remove(); fx = null; } return; }
      E.itens = r.itens || []; E.suporteNaoLidas = Number(r.suporte_nao_lidas || 0); E.produto = r.produto || '';
      montarBase(); pintarBotao(); pintarFaixa(); mostrarDica();
    });
  }
  function iniciar() {
    atualizar();
    setInterval(function () { if (!document.hidden) atualizar(); }, 2 * 60 * 1000);
    // Apps de página única fazem login sem recarregar: olha de novo quando a aba volta ao foco.
    document.addEventListener('visibilitychange', function () { if (!document.hidden) atualizar(); });
    window.addEventListener('vs:sessao', atualizar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
