/* Livraria Villela — "Minha conta" (cliente). Servido em /minha-conta/app.js.
 * Sem dependências. Todo texto vindo do servidor passa por esc() antes de entrar
 * em innerHTML (título de livro, nome, endereço…). */
(function () {
  'use strict';
  var raiz = document.getElementById('mc');
  var API = '/livraria/api/conta';
  var estado = { perfil: null, pedidos: [], aba: 'pedidos', email: '', msg: null };

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function $(sel, ctx) { return (ctx || raiz).querySelector(sel); }
  function data(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (e) { return ''; } }

  function api(metodo, caminho, corpo) {
    return fetch(API + caminho, {
      method: metodo, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, json: j }; });
    }).catch(function () { return { status: 0, ok: false, json: { erro: 'Sem conexão. Tente de novo.' } }; });
  }
  function aviso(tipo, texto) { return texto ? '<div class="aviso mc-aviso ' + tipo + '" role="status">' + esc(texto) + '</div>' : ''; }
  function campo(id, rotulo, tipo, valor, extra) {
    return '<div class="campo"><label for="' + id + '">' + esc(rotulo) + '</label><input id="' + id + '" name="' + id + '" type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '" ' + (extra || '') + '></div>';
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function marcado(id) { var e = document.getElementById(id); return !!(e && e.checked); }
  function ocupado(btn, sim) { if (btn) { btn.disabled = !!sim; } }
  function falha(r, fallback) { return (r.json && r.json.erro) || fallback || 'Não foi possível concluir. Tente de novo.'; }

  // ------------------------------------------------------------ telas de entrada
  function telaEntrar(msg) {
    raiz.innerHTML = '<div class="mc-caixa">' +
      '<h1>Minha conta</h1><p class="muted">Veja seus pedidos, baixe seus livros e cuide dos seus dados. Sem senha: enviamos um código de 6 dígitos para o seu e-mail.</p>' +
      aviso('erro', msg && msg.erro) + aviso('ok', msg && msg.ok) +
      '<form id="f-entrar" novalidate>' + campo('e-email', 'E-mail', 'email', estado.email, 'autocomplete="email" required') +
      '<button class="btn btn-ouro" type="submit">Enviar o código</button></form>' +
      '<hr class="mc-hr"><p>Primeira vez aqui? <a href="#" id="l-criar"><strong>Criar conta</strong></a></p>' +
      '<p class="muted mc-peq">Já comprou como visitante? Use o <strong>mesmo e-mail</strong> da compra — seus pedidos aparecem aqui depois de confirmar o código.</p>' +
      '</div>';
    $('#f-entrar').addEventListener('submit', function (ev) {
      ev.preventDefault(); estado.email = val('e-email');
      var b = $('#f-entrar button'); ocupado(b, true);
      api('POST', '/codigo', { email: estado.email }).then(function (r) {
        ocupado(b, false);
        if (r.ok) return telaCodigo('entrar', r.json.mensagem);
        telaEntrar({ erro: falha(r) });
      });
    });
    $('#l-criar').addEventListener('click', function (ev) { ev.preventDefault(); estado.email = val('e-email'); telaCriar(); });
  }

  function telaCriar(msg) {
    raiz.innerHTML = '<div class="mc-caixa"><h1>Criar conta</h1>' +
      '<p class="muted">Enviaremos um código de 6 dígitos ao seu e-mail para confirmar que ele é seu. Não precisa de senha.</p>' + aviso('erro', msg && msg.erro) +
      '<form id="f-criar" novalidate>' + campo('c-nome', 'Nome', 'text', '', 'autocomplete="name" required') +
      campo('c-email', 'E-mail', 'email', estado.email, 'autocomplete="email" required') +
      '<label class="mc-chk"><input type="checkbox" id="c-aceite"> Li e aceito os <a href="/termos-de-uso" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="/politica-de-privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</label>' +
      '<label class="mc-chk"><input type="checkbox" id="c-mkt"> Quero receber novidades e lançamentos de livros por e-mail (opcional).</label>' +
      '<button class="btn btn-ouro" type="submit">Enviar o código</button></form>' +
      '<p class="mc-links"><a href="#" id="l-voltar">Já tenho conta</a></p></div>';
    $('#f-criar').addEventListener('submit', function (ev) {
      ev.preventDefault(); estado.email = val('c-email'); var b = $('#f-criar button'); ocupado(b, true);
      api('POST', '/cadastro', { nome: val('c-nome'), email: val('c-email'), aceite: marcado('c-aceite'), marketing: marcado('c-mkt') }).then(function (r) {
        ocupado(b, false);
        if (r.ok) return telaCodigo('cadastro', r.json.mensagem);
        telaCriar({ erro: falha(r) });
      });
    });
    $('#l-voltar').addEventListener('click', function (ev) { ev.preventDefault(); telaEntrar(); });
  }

  // finalidade: cadastro | entrar
  function telaCodigo(finalidade, mensagem, erro) {
    raiz.innerHTML = '<div class="mc-caixa"><h1>Digite o código</h1>' +
      '<p class="muted">' + esc(mensagem || '') + ' Enviado para <strong>' + esc(estado.email) + '</strong>. Confira também o spam.</p>' + aviso('erro', erro) +
      '<form id="f-conf" novalidate>' +
      campo('k-cod', 'Código de 6 dígitos', 'text', '', 'inputmode="numeric" autocomplete="one-time-code" maxlength="8" required class="mc-cod"') +
      '<button class="btn btn-ouro" type="submit">' + (finalidade === 'cadastro' ? 'Confirmar e criar a conta' : 'Entrar') + '</button></form>' +
      '<p class="mc-links"><a href="#" id="l-reenviar">Reenviar o código</a> · <a href="#" id="l-voltar">Voltar</a></p></div>';
    var rota = finalidade === 'cadastro' ? '/cadastro/confirmar' : '/entrar-codigo';
    $('#f-conf').addEventListener('submit', function (ev) {
      ev.preventDefault(); var b = $('#f-conf button'); ocupado(b, true);
      api('POST', rota, { email: estado.email, codigo: val('k-cod') }).then(function (r) {
        ocupado(b, false);
        if (!r.ok) return telaCodigo(finalidade, mensagem, falha(r));
        estado.aviso = '';
        abrirPainel();
      });
    });
    $('#l-reenviar').addEventListener('click', function (ev) {
      ev.preventDefault();
      if (finalidade === 'cadastro') return telaCriar({ erro: 'Preencha de novo para receber outro código (o reenvio tem um intervalo de 45 segundos).' });
      api('POST', '/codigo', { email: estado.email }).then(function () { telaCodigo('entrar', 'Se o e-mail estiver correto, enviamos outro código.'); });
    });
    $('#l-voltar').addEventListener('click', function (ev) { ev.preventDefault(); telaEntrar(); });
  }

  // ------------------------------------------------------------ painel
  function abrirPainel() {
    return api('GET', '/eu').then(function (r) {
      if (!r.ok) return telaEntrar(r.status === 401 ? null : { erro: falha(r) });
      estado.perfil = r.json.perfil; estado.pedidos = r.json.pedidos || [];
      painel();
    });
  }

  function painel(msg) {
    var p = estado.perfil;
    var abas = [['pedidos', 'Meus pedidos'], ['dados', 'Meus dados'], ['seguranca', 'Segurança'], ['privacidade', 'Privacidade']];
    raiz.innerHTML = '<div class="mc-topo"><div><h1>Olá, ' + esc((p.nome || '').split(' ')[0]) + '</h1><p class="muted">' + esc(p.email) + '</p></div>' +
      '<button class="btn btn-ghost" id="b-sair" type="button">Sair</button></div>' +
      (estado.aviso ? aviso('ok', estado.aviso) : '') + aviso(msg && msg.tipo, msg && msg.texto) +
      '<nav class="mc-abas" role="tablist">' + abas.map(function (a) {
        return '<button type="button" role="tab" data-aba="' + a[0] + '" class="' + (estado.aba === a[0] ? 'on' : '') + '" aria-selected="' + (estado.aba === a[0]) + '">' + a[1] + '</button>';
      }).join('') + '</nav><div id="mc-aba" class="mc-aba"></div>';
    $('#b-sair').addEventListener('click', function () { api('POST', '/sair').then(function () { estado.perfil = null; estado.aviso = ''; telaEntrar({ ok: 'Você saiu da conta.' }); }); });
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-aba]'), function (b) {
      b.addEventListener('click', function () { estado.aba = b.getAttribute('data-aba'); estado.aviso = ''; painel(); });
    });
    ({ pedidos: abaPedidos, dados: abaDados, seguranca: abaSeguranca, privacidade: abaPrivacidade })[estado.aba]();
  }

  function abaPedidos() {
    var alvo = $('#mc-aba');
    if (!estado.pedidos.length) {
      alvo.innerHTML = '<div class="mc-vazio"><p>Você ainda não tem pedidos nesta conta.</p><p class="muted">Se comprou antes de criar a conta, use o <strong>mesmo e-mail</strong> da compra.</p><p><a class="btn btn-ouro" href="/livros">Ver os livros</a></p></div>';
      return;
    }
    alvo.innerHTML = estado.pedidos.map(function (o) {
      var itens = o.itens.map(function (it) {
        var acao = '';
        if (it.download) acao = '<a class="btn btn-ouro" href="' + esc(it.download) + '">Baixar PDF</a>';
        else if (it.novo_link) acao = '<button type="button" class="btn btn-ghost" data-novo="' + esc(o.id) + '">Gerar novo link</button>';
        else if (it.tipo === 'impresso') acao = '<span class="muted">Impresso</span>';
        return '<div class="mc-item"><div><strong>' + esc(it.titulo) + '</strong><br><span class="muted">' + esc(it.tipo.toUpperCase()) + (it.quantidade > 1 ? ' × ' + it.quantidade : '') + '</span></div><div>' + acao + '</div></div>';
      }).join('');
      var imp = o.impressos.map(function (i) {
        return '<div class="mc-imp">📦 <strong>' + esc(i.titulo) + '</strong> — ' + esc(i.rotulo) +
          (i.rastreio ? ' · rastreio <code>' + esc(i.rastreio) + '</code>' : '') + (i.previsao ? ' · previsão ' + esc(data(i.previsao)) : '') + '</div>';
      }).join('');
      return '<article class="mc-pedido"><header><div><strong>Pedido ' + esc(o.id) + '</strong><br><span class="muted">' + esc(data(o.criado_em)) + ' · ' + esc(o.valor_texto) + (o.cupom ? ' · cupom ' + esc(o.cupom) : '') + '</span></div>' +
        '<span class="mc-st mc-st-' + esc(o.status) + '">' + esc(o.rotulo) + '</span></header>' + itens + imp + '</article>';
    }).join('') + '<p class="muted mc-peq">Os links de PDF são pessoais e têm validade. Se um expirar, gere outro aqui mesmo. Algum problema? <a href="/suporte-livros">Fale com o suporte</a>.</p>';
    Array.prototype.forEach.call(alvo.querySelectorAll('[data-novo]'), function (b) {
      b.addEventListener('click', function () {
        ocupado(b, true);
        api('POST', '/pedidos/' + encodeURIComponent(b.getAttribute('data-novo')) + '/novo-link').then(function (r) {
          if (r.ok) { estado.pedidos = r.json.pedidos; return painel({ tipo: 'ok', texto: 'Link novo gerado. Ele vale por 72 horas.' }); }
          ocupado(b, false); painel({ tipo: 'erro', texto: falha(r) });
        });
      });
    });
  }

  function abaDados() {
    var p = estado.perfil, e = p.endereco || {};
    $('#mc-aba').innerHTML = '<form id="f-dados" novalidate class="mc-form">' +
      campo('d-nome', 'Nome completo', 'text', p.nome, 'autocomplete="name"') +
      campo('d-whats', 'WhatsApp', 'tel', p.whatsapp, 'autocomplete="tel"') +
      campo('d-doc', 'CPF ou CNPJ (opcional — usado para nota e entrega)', 'text', p.doc, 'inputmode="numeric"') +
      '<h3>Endereço de entrega</h3>' +
      campo('d-cep', 'CEP', 'text', e.cep, 'autocomplete="postal-code"') +
      campo('d-log', 'Rua / logradouro', 'text', e.logradouro, 'autocomplete="address-line1"') +
      campo('d-num', 'Número', 'text', e.numero) + campo('d-comp', 'Complemento', 'text', e.compl) +
      campo('d-bairro', 'Bairro', 'text', e.bairro) + campo('d-cidade', 'Cidade', 'text', p.cidade, 'autocomplete="address-level2"') +
      campo('d-estado', 'Estado (UF)', 'text', p.estado, 'maxlength="40" autocomplete="address-level1"') +
      '<label class="mc-chk"><input type="checkbox" id="d-mkt"' + (p.marketing ? ' checked' : '') + '> Receber novidades e lançamentos por e-mail.</label>' +
      '<button class="btn btn-ouro" type="submit">Salvar alterações</button></form>' +
      '<h3 style="margin-top:28px">E-mail da conta</h3><p class="muted">Atual: <strong>' + esc(p.email) + '</strong></p>' +
      '<form id="f-email" novalidate class="mc-form">' + campo('m-novo', 'Novo e-mail', 'email', '', 'autocomplete="off"') +
      '<button class="btn btn-ghost" type="submit">Enviar código para o novo e-mail</button></form><div id="m-conf"></div>';
    $('#f-dados').addEventListener('submit', function (ev) {
      ev.preventDefault(); var b = $('#f-dados button'); ocupado(b, true);
      api('PATCH', '/eu', {
        nome: val('d-nome'), whatsapp: val('d-whats'), doc: val('d-doc'), cidade: val('d-cidade'), estado: val('d-estado'), marketing: marcado('d-mkt'),
        endereco: { cep: val('d-cep'), logradouro: val('d-log'), numero: val('d-num'), compl: val('d-comp'), bairro: val('d-bairro') }
      }).then(function (r) {
        if (r.ok) { estado.perfil = r.json.perfil; return painel({ tipo: 'ok', texto: 'Dados salvos.' }); }
        ocupado(b, false); painel({ tipo: 'erro', texto: falha(r) });
      });
    });
    $('#f-email').addEventListener('submit', function (ev) {
      ev.preventDefault(); var novo = val('m-novo'); var b = $('#f-email button'); ocupado(b, true);
      api('POST', '/email/pedir', { novo_email: novo }).then(function (r) {
        ocupado(b, false);
        if (!r.ok) return painel({ tipo: 'erro', texto: falha(r) });
        $('#m-conf').innerHTML = aviso('ok', r.json.mensagem) + '<form id="f-econf" novalidate class="mc-form">' + campo('m-cod', 'Código recebido no novo e-mail', 'text', '', 'inputmode="numeric" maxlength="8"') +
          '<button class="btn btn-ouro" type="submit">Confirmar o novo e-mail</button></form>';
        $('#f-econf').addEventListener('submit', function (e2) {
          e2.preventDefault();
          api('POST', '/email/confirmar', { novo_email: novo, codigo: val('m-cod') }).then(function (r2) {
            if (r2.ok) { estado.perfil = r2.json.perfil; return painel({ tipo: 'ok', texto: 'E-mail atualizado.' }); }
            painel({ tipo: 'erro', texto: falha(r2) });
          });
        });
      });
    });
  }

  function abaSeguranca() {
    $('#mc-aba').innerHTML = '<h3>Como você entra</h3><p class="muted">Sua conta não tem senha: cada acesso novo é confirmado por um código enviado para <strong>' + esc(estado.perfil.email) + '</strong>. Só quem tem acesso a esse e-mail entra.</p>' +
      '<h3 style="margin-top:24px">Aparelhos conectados</h3><p class="muted">Perdeu um celular ou usou um computador emprestado? Encerre a sessão em todos os aparelhos, inclusive neste.</p>' +
      '<p><button type="button" class="btn btn-ghost" id="b-todos">Sair de todos os aparelhos</button></p>';
    $('#b-todos').addEventListener('click', function () {
      api('POST', '/sair-todos').then(function () { estado.perfil = null; telaEntrar({ ok: 'Você saiu de todos os aparelhos.' }); });
    });
  }

  function abaPrivacidade() {
    $('#mc-aba').innerHTML = '<h3>Baixar meus dados</h3><p class="muted">Uma cópia dos seus dados pessoais e pedidos, em arquivo JSON (LGPD, art. 18).</p>' +
      '<p><a class="btn btn-ghost" href="' + API + '/dados" download>Baixar meus dados</a></p>' +
      '<h3 style="margin-top:28px">Excluir minha conta</h3>' +
      '<p class="muted">Apagamos seu nome, e-mail, telefone, CPF e endereço, e desativamos os links de download. Os registros fiscais dos pedidos permanecem, sem identificar você. Não dá para desfazer.</p>' +
      '<div id="x-area"><button type="button" class="btn btn-ghost mc-perigo" id="x-ini">Quero excluir minha conta</button></div>';
    $('#x-ini').addEventListener('click', function () {
      api('POST', '/excluir/pedir').then(function (r) {
        if (!r.ok) return painel({ tipo: 'erro', texto: falha(r) });
        $('#x-area').innerHTML = aviso('ok', r.json.mensagem) + '<form id="f-excl" novalidate class="mc-form">' +
          campo('x-cod', 'Código recebido por e-mail', 'text', '', 'inputmode="numeric" maxlength="8"') +
          campo('x-conf', 'Digite EXCLUIR para confirmar', 'text', '', 'autocomplete="off"') +
          '<button class="btn mc-perigo-cheio" type="submit">Excluir definitivamente</button></form>';
        $('#f-excl').addEventListener('submit', function (ev) {
          ev.preventDefault();
          api('POST', '/excluir', { codigo: val('x-cod'), confirmacao: val('x-conf') }).then(function (r2) {
            if (r2.ok) { estado.perfil = null; return telaEntrar({ ok: 'Sua conta foi excluída. Enviamos a confirmação por e-mail.' }); }
            painel({ tipo: 'erro', texto: falha(r2) });
          });
        });
      });
    });
  }

  abrirPainel();
})();
