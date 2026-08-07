// =====================================================================
// Villela Kids — SPA vanilla do app da família (servida em /kids/app.js).
// Rota por hash (#perfis, #missoes, #missao, #portfolio, #pais), sem
// framework — padrão dos outros produtos do grupo. O perfil de criança
// ativo fica em localStorage; o SERVIDOR revalida a posse em toda chamada.
// Onda 1: trilha + registrar criação; o tutor IA entra na onda 2.
// =====================================================================
'use strict';
(function () {
  var raiz = document.getElementById('kids-app');
  var EST = { me: null, crianca: null };

  // ---------- utilitários ----------
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  async function api(metodo, caminho, corpo) {
    var r = await fetch('/kids/api' + caminho, {
      method: metodo, headers: { 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    var d = null; try { d = await r.json(); } catch (_) {}
    if (r.status === 401) { location.href = '/kids/entrar'; throw new Error('sessão'); }
    if (!r.ok) throw new Error((d && d.erro) || 'Algo deu errado. Tente de novo.');
    return d;
  }
  function el(html) { raiz.innerHTML = html; }
  function irPara(hash) { location.hash = hash; }
  function rotaAtual() { return (location.hash || '#perfis').replace(/^#/, '').split('?')[0]; }
  function paramDaRota(nome) {
    var q = (location.hash.split('?')[1] || '');
    var m = q.split('&').map(function (p) { return p.split('='); }).find(function (p) { return p[0] === nome; });
    return m ? decodeURIComponent(m[1] || '') : '';
  }
  function criancaAtiva() {
    var id = localStorage.getItem('kids_crianca');
    return (EST.me && EST.me.criancas || []).find(function (c) { return c.id === id; }) || null;
  }
  var CSS_EXTRA = '\
.kb-topo{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px 0;flex-wrap:wrap}\
.kb-topo .quem{display:flex;gap:8px;align-items:center;font-weight:800;font-size:18px}\
.kb-topo .acoes{display:flex;gap:8px;flex-wrap:wrap}\
.kb-lk{background:none;border:0;color:#6C4DFF;font-weight:700;cursor:pointer;font-size:15px;text-decoration:underline}\
.kb-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin:10px 0 30px}\
.kb-card{background:#fff;border:2px solid #E3E6F5;border-radius:24px;padding:20px;text-align:left}\
.kb-perfil{cursor:pointer;text-align:center;font-size:18px;font-weight:800;border:0;background:#fff;box-shadow:0 2px 0 #E3E6F5;border:2px solid #E3E6F5;border-radius:24px;padding:26px 20px}\
.kb-perfil .av{font-size:44px;display:block;margin-bottom:8px}\
.kb-missao{display:flex;gap:14px;align-items:flex-start;background:#fff;border:2px solid #E3E6F5;border-radius:24px;padding:18px;margin-bottom:12px}\
.kb-missao.bloqueada{opacity:.55;background:#EEF0FC}\
.kb-missao .em{font-size:34px}\
.kb-missao h3{margin:0 0 4px;font-size:18px}\
.kb-missao p{margin:0;color:#6B7280;font-size:14px}\
.kb-tag{display:inline-block;border-radius:999px;padding:3px 12px;font-size:12px;font-weight:800;margin-top:8px}\
.kb-tag.disponivel{background:#ECFDF5;color:#065F46}.kb-tag.em_andamento{background:#FEF3C7;color:#92400E}\
.kb-tag.concluida{background:#EDE9FE;color:#5B21B6}.kb-tag.bloqueada{background:#F3F4F6;color:#6B7280}\
.kb-bt{display:inline-block;background:#6C4DFF;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:800;font-size:16px;cursor:pointer;text-decoration:none}\
.kb-bt.claro{background:#fff;color:#6C4DFF;border:2px solid #6C4DFF}\
.kb-bt[disabled]{opacity:.5;cursor:default}\
.kb-form label{display:block;font-weight:700;margin:12px 0 4px}\
.kb-form input,.kb-form textarea,.kb-form select{width:100%;padding:12px;border:2px solid #E3E6F5;border-radius:10px;font-size:16px;font-family:inherit}\
.kb-erro{color:#B91C1C;font-weight:700;margin-top:10px;min-height:20px}\
.kb-ok{background:#ECFDF5;border:2px solid #A7F3D0;border-radius:14px;padding:14px 18px;margin:12px 0;color:#065F46;font-weight:600}\
.kb-sub{color:#6B7280;margin:0 0 16px}\
h1.kb{font-size:clamp(24px,4vw,34px);margin:6px 0 4px;font-weight:900}\
.kb-criacao pre{white-space:pre-wrap;font-family:inherit;background:#EEF0FC;border-radius:12px;padding:14px;margin:8px 0 0}\
.kb-etapa-topo{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}\
.kb-passos{color:#6B7280;font-weight:700;font-size:14px}\
.kb-texto{background:#fff;border:2px solid #E3E6F5;border-radius:24px;padding:20px;font-size:17px;white-space:pre-wrap}\
.kb-chat{background:#EEF0FC;border:2px dashed #E3E6F5;border-radius:24px;padding:14px;margin-top:14px}\
.kb-chat .titulo-chat{font-weight:800;margin:0 0 8px;font-size:15px}\
.kb-bolhas{max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:10px}\
.kb-bolha{max-width:85%;padding:10px 14px;border-radius:16px;font-size:15px;white-space:pre-wrap}\
.kb-bolha.crianca{align-self:flex-end;background:#6C4DFF;color:#fff;border-bottom-right-radius:4px}\
.kb-bolha.tutor{align-self:flex-start;background:#fff;border:2px solid #E3E6F5;border-bottom-left-radius:4px}\
.kb-chat-linha{display:flex;gap:8px}\
.kb-chat-linha input{flex:1;padding:11px;border:2px solid #E3E6F5;border-radius:999px;font-size:15px}\
.kb-modo{color:#92400E;background:#FEF3C7;border-radius:999px;padding:3px 12px;font-size:12px;font-weight:700}\
.kb-nivel{background:#EDE9FE;color:#5B21B6;border-radius:999px;padding:3px 12px;font-size:13px;font-weight:800;white-space:nowrap}\
.kb-lumi{display:flex;gap:14px;align-items:center;background:#fff;border:2px solid #E3E6F5;border-radius:24px;padding:18px 20px;margin-bottom:14px}\
.kb-lumi svg{flex-shrink:0}\
.kb-lumi p{margin:0}\
.kb-dia{background:#23C7E8;color:#14265C;border:0;border-radius:24px;padding:20px;margin-bottom:14px}\
.kb-dia .rot{font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;opacity:.75}\
.kb-dia h3{margin:4px 0 6px;font-size:22px}\
.kb-dia .kb-bt{background:#14265C;color:#fff;margin-top:8px}\
.kb-prog{background:#fff;border:2px solid #E3E6F5;border-radius:24px;padding:16px 20px;margin-bottom:14px}\
.kb-prog .barra{background:#EEF0FC;border-radius:999px;height:14px;overflow:hidden;margin:8px 0}\
.kb-prog .barra div{background:#A9E34B;height:14px;border-radius:999px}\
.kb-ambs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}\
.kb-amb{border:0;border-radius:24px;padding:18px 14px;color:#fff;font-weight:800;font-size:16px;cursor:pointer;text-align:center;font-family:inherit}\
.kb-amb img{width:44px;height:44px;display:block;margin:0 auto 8px;filter:brightness(0) invert(1)}\
.kb-amb small{display:block;font-weight:600;font-size:12px;opacity:.9;margin-top:2px}\
.kb-amb.lab{background:#23C7E8;color:#14265C}.kb-amb.lab img{filter:none}\
.kb-amb.arena{background:#FF8A34}.kb-amb.studio{background:#F05AA6}.kb-amb.expo{background:#A9E34B;color:#14265C}.kb-amb.expo img{filter:none}\
.kb-amb[disabled]{opacity:.55;cursor:default}';

  // Lumi — a centelha-guia do Invente (versão leve do brand book: sem
  // animação/voz antes da validação com crianças; só boas-vindas e contexto).
  var LUMI_SVG = '<svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">' +
    '<path d="M23 3 L27 18 L42 23 L27 28 L23 43 L19 28 L4 23 L19 18 Z" fill="#6C4DFF"/>' +
    '<circle cx="23" cy="23" r="4.5" fill="#FFFFFF"/><circle cx="36" cy="9" r="2.5" fill="#A9E34B"/></svg>';
  (function () { var s = document.createElement('style'); s.textContent = CSS_EXTRA; document.head.appendChild(s); })();

  function topo(ativo) {
    var c = criancaAtiva();
    return '<div class="kb-topo">' +
      '<div class="quem">' + (c ? '<span style="font-size:30px">' + esc(c.avatar) + '</span> ' + esc(c.apelido) +
        (c.nivel ? ' <span class="kb-nivel">' + esc(c.nivel.emoji + ' ' + c.nivel.nome) + '</span>' : '') : '✨ Invente') + '</div>' +
      '<div class="acoes">' +
      (c ? '<button class="kb-lk" data-ir="#inicio">Início</button><button class="kb-lk" data-ir="#missoes">Missões</button><button class="kb-lk" data-ir="#portfolio">Conquistas</button>' : '') +
      '<button class="kb-lk" data-ir="#perfis">Trocar perfil</button>' +
      '<button class="kb-lk" data-ir="#pais">Área dos pais' + (EST.me && EST.me.nao_lidas ? ' (' + EST.me.nao_lidas + ')' : '') + '</button>' +
      '</div></div>';
  }
  function ligarNavegacao() {
    raiz.querySelectorAll('[data-ir]').forEach(function (b) { b.addEventListener('click', function () { irPara(b.getAttribute('data-ir')); }); });
  }

  // ---------- telas ----------

  // Portal Invente (onda 7): hierarquia do brand book — 1) saudação (Lumi);
  // 2) missão do dia; 3) progresso; 4) ambientes. Lab abre as missões, Expo
  // as conquistas; Studio leva ao Estúdio de Ilustração quando desbloqueado;
  // Arena é honesta: "em preparação" (desafios chegam na fase 2).
  async function vInicio() {
    var c = criancaAtiva();
    if (!c) return irPara('#perfis');
    var d = await api('GET', '/criancas/' + c.id + '/missoes');
    var atual = d.missoes.find(function (m) { return m.status === 'em_andamento'; }) ||
      d.missoes.find(function (m) { return m.status === 'disponivel'; });
    var concl = d.missoes.filter(function (m) { return m.status === 'concluida'; }).length;
    var nivel = d.crianca.nivel || {};
    var m03 = d.missoes.find(function (m) { return m.id === 'm03-estudio-ilustracao'; });
    var lumiFala = concl === 0
      ? 'Oi, ' + esc(c.apelido) + '! Eu sou a <b>Lumi</b>, a centelha do portal. Sua primeira missão está te esperando no Lab — vamos inventar?'
      : (concl >= d.missoes.length
        ? 'UAU, ' + esc(c.apelido) + '! Você atravessou o portal inteiro — as ' + concl + ' missões! Suas conquistas contam essa história.'
        : 'Que bom te ver, ' + esc(c.apelido) + '! Você já concluiu ' + concl + (concl === 1 ? ' missão' : ' missões') + ' — a próxima invenção está pertinho.');

    el(topo() +
      '<h1 class="kb">Olá, ' + esc(c.apelido) + '! Pronto(a) para inventar?</h1>' +
      '<div class="kb-lumi">' + LUMI_SVG + '<p>' + lumiFala + '</p></div>' +
      (atual
        ? '<div class="kb-dia"><span class="rot">' + (atual.status === 'em_andamento' ? 'Continue seu projeto' : 'Missão de hoje') + '</span>' +
          '<h3>' + esc(atual.emoji + ' ' + atual.titulo) + '</h3><p style="margin:0">' + esc(atual.resumo) + '</p>' +
          '<button class="kb-bt" data-ir="#missao?m=' + esc(atual.id) + '">' + (atual.status === 'em_andamento' ? 'Continuar meu projeto' : 'Começar uma missão') + '</button></div>'
        : '') +
      '<div class="kb-prog"><b>Seu progresso</b><div class="barra"><div style="width:' + Math.round((concl / (d.missoes.length || 1)) * 100) + '%"></div></div>' +
      concl + ' de ' + d.missoes.length + ' missões · nível ' + esc((nivel.emoji || '') + ' ' + (nivel.nome || '')) + '</div>' +
      '<div class="kb-ambs">' +
      '<button class="kb-amb lab" data-ir="#missoes"><img src="/assets/brand/villela-kids/invente/icons/lab.svg" alt="">Invente Lab<small>Teste ideias. Descubra possibilidades.</small></button>' +
      '<button class="kb-amb studio" ' + (m03 && m03.status !== 'bloqueada' ? 'data-ir="#missao?m=m03-estudio-ilustracao"' : 'disabled title="Abre com a missão 3"') + '><img src="/assets/brand/villela-kids/invente/icons/studio.svg" alt="">Invente Studio<small>Dê forma e voz às suas ideias.</small></button>' +
      '<button class="kb-amb expo" data-ir="#portfolio"><img src="/assets/brand/villela-kids/invente/icons/expo.svg" alt="">Invente Expo<small>Mostre o que você criou.</small></button>' +
      '<button class="kb-amb arena" disabled title="Em preparação"><img src="/assets/brand/villela-kids/invente/icons/arena.svg" alt="">Invente Arena<small>Desafios em preparação!</small></button>' +
      '</div>');
    ligarNavegacao();
  }

  function vPerfis() {
    var cs = (EST.me.criancas || []);
    el(topo() + '<h1 class="kb">Quem vai inventar hoje?</h1><p class="kb-sub">Escolha o perfil — ou crie um novo (só apelido, nada de dados da criança).</p>' +
      '<div class="kb-grade">' +
      cs.map(function (c) {
        return '<button class="kb-perfil" data-cid="' + esc(c.id) + '"><span class="av">' + esc(c.avatar) + '</span>' + esc(c.apelido) +
          '<br><small style="color:#6B7280;font-weight:400">' + esc(c.faixa) + ' anos</small>' +
          (c.nivel ? '<br><span class="kb-nivel">' + esc(c.nivel.emoji + ' ' + c.nivel.nome) + '</span>' : '') + '</button>';
      }).join('') +
      '<button class="kb-perfil" id="novo"><span class="av">➕</span>Novo perfil</button></div>' +
      '<div id="form-novo" style="display:none" class="kb-card kb-form">' +
      '<h3>Novo inventor / nova inventora</h3>' +
      '<label>Apelido (como a criança quer ser chamada)</label><input id="np-apelido" maxlength="40">' +
      '<label>Idade</label><select id="np-faixa"><option value="7-8">7 a 8 anos</option><option value="9-12" selected>9 a 12 anos</option></select>' +
      '<label>Avatar</label><select id="np-avatar">' + ['🦖', '🦄', '🤖', '🐱', '🦊', '🐼', '🦁', '🐸', '👾', '🌟'].map(function (e) { return '<option>' + e + '</option>'; }).join('') + '</select>' +
      '<div class="kb-erro" id="np-erro"></div>' +
      '<button class="kb-bt" id="np-criar">Criar perfil</button></div>');
    ligarNavegacao();
    raiz.querySelectorAll('[data-cid]').forEach(function (b) {
      b.addEventListener('click', function () { localStorage.setItem('kids_crianca', b.getAttribute('data-cid')); irPara('#inicio'); });
    });
    document.getElementById('novo').addEventListener('click', function () { document.getElementById('form-novo').style.display = ''; });
    document.getElementById('np-criar').addEventListener('click', async function () {
      var e = document.getElementById('np-erro'); e.textContent = '';
      try {
        var d = await api('POST', '/criancas', {
          apelido: document.getElementById('np-apelido').value,
          faixa: document.getElementById('np-faixa').value,
          avatar: document.getElementById('np-avatar').value,
        });
        EST.me.criancas.push(d.crianca);
        localStorage.setItem('kids_crianca', d.crianca.id);
        irPara('#inicio');
      } catch (err) { e.textContent = err.message; }
    });
  }

  async function vMissoes() {
    var c = criancaAtiva();
    if (!c) return irPara('#perfis');
    var d = await api('GET', '/criancas/' + c.id + '/missoes');
    el(topo('missoes') + '<h1 class="kb">Sua trilha de missões</h1><p class="kb-sub">Complete uma missão para abrir a próxima. Cada uma termina com uma criação sua!</p>' +
      d.missoes.map(function (m) {
        var podeAbrir = m.status !== 'bloqueada';
        return '<div class="kb-missao ' + m.status + '">' +
          '<div class="em">' + (m.status === 'concluida' ? '🏆' : m.status === 'bloqueada' ? '🔒' : esc(m.emoji)) + '</div>' +
          '<div style="flex:1"><h3>Missão ' + m.ordem + ' · ' + esc(m.titulo) + '</h3><p>' + esc(m.resumo) + '</p>' +
          '<span class="kb-tag ' + m.status + '">' + { disponivel: 'Pronta para começar', em_andamento: 'Em andamento', concluida: 'Concluída', bloqueada: 'Bloqueada' }[m.status] + '</span>' +
          (m.status === 'concluida' ? ' <a class="kb-lk" target="_blank" rel="noopener" href="/kids/api/criancas/' + esc(c.id) + '/missoes/' + esc(m.id) + '/certificado">🎓 Certificado</a>' : '') + '</div>' +
          (podeAbrir ? '<button class="kb-bt claro" data-mid="' + esc(m.id) + '">Abrir</button>' : '') +
          '</div>';
      }).join(''));
    ligarNavegacao();
    raiz.querySelectorAll('[data-mid]').forEach(function (b) {
      b.addEventListener('click', function () { irPara('#missao?m=' + b.getAttribute('data-mid')); });
    });
  }

  async function vMissao() {
    var c = criancaAtiva();
    if (!c) return irPara('#perfis');
    var mid = paramDaRota('m');
    var d = await api('GET', '/criancas/' + c.id + '/missoes');
    var m = d.missoes.find(function (x) { return x.id === mid; });
    if (!m) return irPara('#missoes');
    // Missão com roteiro em andamento vai direto para o player guiado.
    if (m.tem_roteiro && m.status === 'em_andamento') return vJogo(c, mid);
    var corpo = '<h1 class="kb">' + esc(m.emoji) + ' ' + esc(m.titulo) + '</h1>' +
      '<p class="kb-sub">Missão ' + m.ordem + ' · eixo ' + esc(m.eixo).toUpperCase() + '</p>' +
      '<div class="kb-card"><p style="font-size:17px">' + esc(m.resumo) + '</p>' +
      '<p><b>🎁 O que você vai criar:</b> ' + esc(m.produto_final) + '</p>' +
      '<p><b>👨‍👩‍👧 Momento família:</b> ' + esc(m.momento_familia) + '</p></div>';
    if (m.status === 'disponivel') {
      corpo += '<p style="margin-top:16px"><button class="kb-bt" id="iniciar">Começar a missão!</button></p>';
    } else if (m.status === 'em_andamento') {
      corpo += '<div class="kb-card kb-form" style="margin-top:16px"><h3>Terminou? Registre a sua criação 🏆</h3>' +
        '<p class="kb-sub">Esta missão ainda não tem o modo guiado — faça do seu jeito e cole aqui o resultado.</p>' +
        '<label>Nome da criação</label><input id="cr-titulo" maxlength="140" placeholder="Ex.: Minha história">' +
        '<label>A criação (texto)</label><textarea id="cr-texto" rows="8" placeholder="Cole ou escreva aqui o que você criou…"></textarea>' +
        '<div class="kb-erro" id="cr-erro"></div>' +
        '<button class="kb-bt" id="concluir">Guardar no portfólio e concluir</button></div>';
    } else if (m.status === 'concluida') {
      corpo += '<div class="kb-ok">🏆 Missão concluída! A criação está nas suas <button class="kb-lk" data-ir="#portfolio">conquistas</button>.</div>';
    }
    el(topo() + corpo);
    ligarNavegacao();
    var bi = document.getElementById('iniciar');
    if (bi) bi.addEventListener('click', async function () {
      await api('POST', '/criancas/' + c.id + '/missoes/' + mid + '/iniciar');
      vMissao();
    });
    var bc = document.getElementById('concluir');
    if (bc) bc.addEventListener('click', async function () {
      var e = document.getElementById('cr-erro'); e.textContent = '';
      try {
        var r = await api('POST', '/criancas/' + c.id + '/missoes/' + mid + '/concluir', {
          titulo: document.getElementById('cr-titulo').value,
          conteudo: document.getElementById('cr-texto').value,
        });
        EST.me = await api('GET', '/me'); // atualiza o selo de nível no topo
        if (r.subiu_nivel && r.nivel) alert('🎖️ Você subiu de nível: ' + r.nivel.nome + ' ' + r.nivel.emoji + '!');
        irPara('#missoes');
      } catch (err) { e.textContent = err.message; }
    });
  }

  // ---------- player da missão guiada (onda 2) ----------
  function bolha(h) { return '<div class="kb-bolha ' + (h.de === 'crianca' ? 'crianca' : 'tutor') + '">' + esc(h.texto) + '</div>'; }

  async function vJogo(c, mid) {
    var d = await api('GET', '/criancas/' + c.id + '/missoes/' + mid + '/jogo');
    var g = d.jogo;
    var e = g.etapa;
    var corpo = '<div class="kb-etapa-topo"><h1 class="kb">' + esc(g.missao.emoji) + ' ' + esc(g.missao.titulo) + '</h1>' +
      '<span class="kb-passos">Etapa ' + g.indice + ' de ' + g.total + '</span></div>' +
      '<p class="kb-sub"><b>' + esc(e.titulo) + '</b>' +
      (g.tutor.motor === 'simples' ? ' · <span class="kb-modo">tutor no modo simples</span>' : '') + '</p>' +
      '<div class="kb-texto">' + esc(e.texto) + '</div>';

    if (e.conversa) {
      corpo += '<div class="kb-chat"><p class="titulo-chat">💬 Converse com ' + esc(g.tutor.nome) + '</p>' +
        '<div class="kb-bolhas" id="bolhas">' + g.historico.map(bolha).join('') + '</div>' +
        '<div class="kb-chat-linha"><input id="chat-texto" maxlength="500" placeholder="Escreva para o tutor…">' +
        '<button class="kb-bt" id="chat-enviar">Enviar</button></div></div>';
    }

    if (e.tipo === 'entrada') {
      corpo += '<div class="kb-card kb-form" style="margin-top:14px">' +
        '<label>' + esc(e.entrada.rotulo) + '</label>' +
        (e.entrada.multilinha
          ? '<textarea id="et-entrada" rows="6" placeholder="' + esc(e.entrada.dica) + '"></textarea>'
          : '<input id="et-entrada" placeholder="' + esc(e.entrada.dica) + '">') +
        '<div class="kb-erro" id="et-erro"></div>' +
        (g.ilustrar ? '<p style="margin:10px 0 0"><button class="kb-bt claro" id="et-ilustrar">🎨 Ver esta descrição desenhada</button></p><div id="et-imagem"></div>' : '') +
        '<button class="kb-bt" id="et-avancar" style="margin-top:12px">Próxima etapa ▸</button></div>';
    } else if (e.tipo === 'avancar') {
      corpo += '<div class="kb-erro" id="et-erro"></div>' +
        '<p style="margin-top:14px"><button class="kb-bt" id="et-avancar">Continuar ▸</button></p>';
    } else if (e.tipo === 'concluir') {
      corpo += '<div class="kb-card kb-form kb-criacao" style="margin-top:14px"><h3>Prévia da sua criação</h3>' +
        '<pre>' + esc(g.previa.conteudo) + '</pre>' +
        '<label>Título da criação</label><input id="cc-titulo" maxlength="140" value="' + esc(g.previa.titulo_sugerido) + '">' +
        '<div class="kb-erro" id="et-erro"></div>' +
        '<button class="kb-bt" id="cc-concluir">Guardar no portfólio 🏆</button></div>';
    }

    el(topo() + corpo);
    ligarNavegacao();
    var bolhas = document.getElementById('bolhas');
    if (bolhas) bolhas.scrollTop = bolhas.scrollHeight;

    var bcEnviar = document.getElementById('chat-enviar');
    if (bcEnviar) {
      var enviar = async function () {
        var inp = document.getElementById('chat-texto');
        var txt = inp.value.trim();
        if (!txt) return;
        inp.value = ''; inp.disabled = true; bcEnviar.disabled = true;
        bolhas.insertAdjacentHTML('beforeend', bolha({ de: 'crianca', texto: txt }));
        bolhas.scrollTop = bolhas.scrollHeight;
        try {
          var r = await api('POST', '/criancas/' + c.id + '/missoes/' + mid + '/jogo/responder', { texto: txt });
          bolhas.insertAdjacentHTML('beforeend', bolha({ de: 'tutor', texto: r.resposta }));
        } catch (err) {
          bolhas.insertAdjacentHTML('beforeend', bolha({ de: 'tutor', texto: err.message }));
        }
        inp.disabled = false; bcEnviar.disabled = false;
        bolhas.scrollTop = bolhas.scrollHeight;
        inp.focus();
      };
      bcEnviar.addEventListener('click', enviar);
      document.getElementById('chat-texto').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') enviar(); });
    }

    var bIl = document.getElementById('et-ilustrar');
    if (bIl) bIl.addEventListener('click', async function () {
      var err = document.getElementById('et-erro'); err.textContent = '';
      var caixa = document.getElementById('et-imagem');
      var desc = (document.getElementById('et-entrada') || {}).value || '';
      bIl.disabled = true; bIl.textContent = '🎨 Desenhando…';
      try {
        var r = await api('POST', '/criancas/' + c.id + '/ilustrar', { descricao: desc, titulo: 'Cena: ' + e.titulo });
        caixa.innerHTML = '<p class="kb-ok" style="margin-top:12px">Olha a SUA descrição virando desenho! Guardei no portfólio.' +
          (r.ilustracao.restantes > 0 ? ' (' + r.ilustracao.restantes + ' restantes)' : ' (última do Estúdio — as próximas são no papel!)') + '</p>' +
          '<img src="/kids/api/criancas/' + c.id + '/ilustracoes/' + r.ilustracao.id + '" alt="Ilustração gerada" style="max-width:100%;border-radius:14px;border:2px solid #E3E6F5">';
      } catch (ex) { err.textContent = ex.message; }
      bIl.disabled = false; bIl.textContent = '🎨 Ver esta descrição desenhada';
    });

    var bAv = document.getElementById('et-avancar');
    if (bAv) bAv.addEventListener('click', async function () {
      var err = document.getElementById('et-erro'); err.textContent = '';
      var campo = document.getElementById('et-entrada');
      try {
        await api('POST', '/criancas/' + c.id + '/missoes/' + mid + '/jogo/avancar', campo ? { entrada: campo.value } : {});
        vJogo(c, mid);
      } catch (ex) { err.textContent = ex.message; }
    });

    var bCc = document.getElementById('cc-concluir');
    if (bCc) bCc.addEventListener('click', async function () {
      var err = document.getElementById('et-erro'); err.textContent = '';
      try {
        var r = await api('POST', '/criancas/' + c.id + '/missoes/' + mid + '/jogo/concluir', { titulo: document.getElementById('cc-titulo').value });
        EST.me = await api('GET', '/me'); // atualiza o selo de nível no topo
        if (r.subiu_nivel && r.nivel) alert('🎖️ Você subiu de nível: ' + r.nivel.nome + ' ' + r.nivel.emoji + '!');
        irPara('#missoes');
      } catch (ex) { err.textContent = ex.message; }
    });
  }

  async function vPortfolio() {
    var c = criancaAtiva();
    if (!c) return irPara('#perfis');
    var d = await api('GET', '/criancas/' + c.id + '/portfolio');
    el(topo() + '<h1 class="kb">🏆 Conquistas de ' + esc(c.apelido) + '</h1><p class="kb-sub">Tudo o que você já criou. Isso vale mais que nota.</p>' +
      (d.portfolio.length === 0 ? '<div class="kb-card">Ainda não há criações — complete a primeira missão!</div>' :
        d.portfolio.map(function (p) {
          var corpo = p.tipo === 'imagem'
            ? '<img src="/kids/api/criancas/' + c.id + '/ilustracoes/' + p.id + '" alt="' + esc(p.titulo) + '" style="max-width:100%;border-radius:14px;border:2px solid #E3E6F5;margin-top:8px">' +
              '<pre>Descrição que virou desenho: ' + esc(p.conteudo) + '</pre>'
            : '<pre>' + esc(p.conteudo) + '</pre>';
          return '<div class="kb-card kb-criacao" style="margin-bottom:12px"><h3 style="margin:0">' + esc(p.titulo) + '</h3>' +
            '<small style="color:#6B7280">' + new Date(p.criado_em).toLocaleDateString('pt-BR') + '</small>' + corpo + '</div>';
        }).join('')));
    ligarNavegacao();
  }

  function dataBr(iso) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'; }

  async function vPais() {
    var d = await api('GET', '/notificacoes');
    var painel = (await api('GET', '/painel')).painel;
    var cartoes = painel.map(function (p) {
      var pct = p.progresso.total ? Math.round((p.progresso.concluidas / p.progresso.total) * 100) : 0;
      return '<div class="kb-card" style="margin-bottom:12px">' +
        '<h3 style="margin:0 0 4px">' + esc(p.crianca.avatar) + ' ' + esc(p.crianca.apelido) +
        ' <span class="kb-nivel">' + esc(p.nivel.emoji + ' ' + p.nivel.nome) + '</span></h3>' +
        '<p class="kb-sub" style="margin:0 0 8px">' + p.progresso.concluidas + ' de ' + p.progresso.total + ' missões concluídas</p>' +
        '<div style="background:#F3F4F6;border-radius:999px;height:12px;overflow:hidden"><div style="width:' + pct + '%;background:#6C4DFF;height:12px"></div></div>' +
        (p.progresso.atual ? '<p style="margin:10px 0 0"><b>Missão ' + (p.progresso.atual.status === 'em_andamento' ? 'em andamento' : 'à espera') + ':</b> ' +
          esc(p.progresso.atual.emoji + ' ' + p.progresso.atual.titulo) + '<br><small style="color:#6B7280">👨‍👩‍👧 Momento família: ' + esc(p.progresso.atual.momento_familia) + '</small></p>'
          : '<p style="margin:10px 0 0"><b>🎓 Trilha completa!</b> As 8 missões foram concluídas.</p>') +
        '<p style="margin:10px 0 0"><b>Evidências recentes:</b> ' + (p.criacoes.length === 0 ? 'ainda nenhuma criação' :
          p.criacoes.map(function (cr) { return esc((cr.emoji ? cr.emoji + ' ' : '') + '"' + cr.titulo + '"'); }).join(' · ')) + '</p>' +
        '<p class="kb-sub" style="margin:8px 0 0">Última atividade: ' + dataBr(p.atividade.ultima) +
        ' · ' + p.atividade.dias_ativos + ' dia(s) de atividade · ' + p.atividade.conversas_com_tutor + ' conversa(s) com o tutor</p>' +
        '</div>';
    }).join('');
    el(topo() + '<h1 class="kb">Área dos pais</h1><p class="kb-sub">Conta de ' + esc(EST.me.usuario.nome) + ' (' + esc(EST.me.usuario.email) + ')' +
      (EST.me.usuario.email_verificado ? '' : ' · e-mail ainda não verificado') + '</p>' +
      (cartoes || '<div class="kb-card">Crie o primeiro perfil para acompanhar por aqui.</div>') +
      '<div class="kb-card" style="margin-top:14px"><h3 style="margin-top:0">🔔 Avisos no celular</h3>' +
      '<p class="kb-sub">Receba no seu celular quando uma missão for concluída, quando houver nível novo — e os alertas que merecem a sua escuta. Só para você; a criança não recebe nada.</p>' +
      '<p><button class="kb-bt claro" id="push-ativar">Ativar avisos neste aparelho</button></p>' +
      '<div class="kb-erro" id="push-msg"></div></div>' +
      '<div class="kb-card" style="margin-top:14px"><h3 style="margin-top:0">Últimas novidades</h3>' +
      (d.notificacoes.length === 0 ? '<p class="kb-sub">Nada por aqui ainda.</p>' :
        d.notificacoes.map(function (n) {
          return '<p' + (n.lida_em ? ' style="opacity:.6"' : '') + '><b>' + esc(n.titulo) + '</b><br><small>' + esc(n.texto) + '</small></p>';
        }).join('')) + '</div>' +
      '<div class="kb-card" style="margin-top:14px"><h3 style="margin-top:0">Seus dados (LGPD)</h3>' +
      '<p class="kb-sub">Você pode levar ou apagar tudo, a qualquer momento — inclusive as conversas das crianças com o tutor, que vão na exportação.</p>' +
      '<p><a class="kb-bt claro" href="/kids/api/meus-dados">Exportar os dados da família</a> ' +
      '<button class="kb-bt claro" id="excluir" style="border-color:#B91C1C;color:#B91C1C">Excluir a conta</button></p>' +
      '<div class="kb-erro" id="pais-erro"></div></div>' +
      '<p style="margin-top:18px"><button class="kb-lk" id="sair">Sair da conta</button></p>');
    ligarNavegacao();
    api('POST', '/notificacoes/lidas').then(function () { EST.me.nao_lidas = 0; }).catch(function () {});
    document.getElementById('push-ativar').addEventListener('click', async function () {
      var msg = document.getElementById('push-msg');
      msg.style.color = '';
      msg.textContent = '';
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador não suporta avisos. Instale o app pelo menu do navegador e tente por lá.');
        var ch = await api('GET', '/push/chave');
        if (!ch.disponivel) throw new Error('Os avisos ainda não estão configurados no servidor.');
        var perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error('Permissão de aviso não concedida no navegador.');
        var reg = await navigator.serviceWorker.ready;
        var b64 = ch.chave.replace(/-/g, '+').replace(/_/g, '/');
        var bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
        var chave = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) chave[i] = bin.charCodeAt(i);
        var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
        await api('POST', '/push/inscrever', { assinatura: sub.toJSON() });
        msg.style.color = '#065F46';
        msg.textContent = '✅ Avisos ativados neste aparelho!';
      } catch (err) { msg.textContent = err.message; }
    });
    document.getElementById('sair').addEventListener('click', async function () {
      await api('POST', '/logout'); localStorage.removeItem('kids_crianca'); location.href = '/kids';
    });
    document.getElementById('excluir').addEventListener('click', async function () {
      if (!confirm('Excluir a conta apaga EM DEFINITIVO os perfis, o progresso e todas as criações das crianças. Confirmar?')) return;
      try { await api('POST', '/excluir-conta'); location.href = '/kids'; }
      catch (err) { document.getElementById('pais-erro').textContent = err.message; }
    });
  }

  // ---------- roteador ----------
  var ROTAS = { perfis: vPerfis, inicio: vInicio, missoes: vMissoes, missao: vMissao, portfolio: vPortfolio, pais: vPais };
  async function navegar() {
    try { (ROTAS[rotaAtual()] || vPerfis)(); }
    catch (e) { el('<div class="kb-erro">' + esc(e.message) + '</div>'); }
  }
  window.addEventListener('hashchange', navegar);

  (async function () {
    try { EST.me = await api('GET', '/me'); }
    catch (_) { return; } // 401 já redirecionou para /kids/entrar
    navegar();
  })();
})();
