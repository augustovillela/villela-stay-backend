// =====================================================================
// Musique — TELAS DE ENTRADA (/music/entrar e /music/redefinir-senha).
//
// Conta PRÓPRIA do Musique (ADR-0011, 28/09/2026): estas telas falam só
// com /music/api/conta/*. A Academia não aparece no caminho de entrada;
// ela só surge quando a pessoa ESCOLHE ir aos cursos.
//
// O script de cada página é JS de verdade servido à parte — nada de
// lógica dentro de template literal, onde a barra invertida some.
// =====================================================================
'use strict';

// Só caminhos do próprio Musique viram destino depois de entrar:
// "voltar" livre seria redirecionamento aberto.
function destinoSeguro(v) {
  const s = String(v || '');
  if (s.startsWith('//') || s.includes('..') || /[\s:\\]/.test(s)) return '/music/app';
  if (s === '/music' || s.startsWith('/music/') || s.startsWith('/music#')) return s;
  return '/music/app';
}

const JS_ENTRAR = [
  '(function () {',
  "  'use strict';",
  "  var $ = function (id) { return document.getElementById(id); };",
  '  ' + destinoSeguro.toString(),
  "  var voltar = destinoSeguro(new URLSearchParams(location.search).get('voltar') || '/music/app');",
  '  function ir() { location.replace(voltar); }',
  "  function msg(t, bom) { var m = $('msg'); m.textContent = t || ''; m.className = bom ? 'bom' : ''; }",
  '  function post(url, corpo) {',
  "    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })",
  "      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.erro || 'Não deu certo.'); return d; }); },",
  "        function () { throw new Error('Sem conexão com a internet.'); });",
  '  }',
  "  fetch('/music/api/me').then(function (r) { if (r.ok) ir(); }).catch(function () {});",
  '  function modo(m) {',
  "    $('f-entrar').style.display = m === 'entrar' ? '' : 'none';",
  "    $('f-criar').style.display = m === 'criar' ? '' : 'none';",
  "    $('t-entrar').className = 'aba' + (m === 'entrar' ? ' on' : '');",
  "    $('t-criar').className = 'aba' + (m === 'criar' ? ' on' : '');",
  "    msg('');",
  '  }',
  "  $('t-entrar').onclick = function () { modo('entrar'); };",
  "  $('t-criar').onclick = function () { modo('criar'); };",
  "  $('f-entrar').onsubmit = function (ev) {",
  "    ev.preventDefault(); msg(''); $('b-entrar').disabled = true;",
  "    post('/music/api/conta/entrar', { email: $('em').value.trim(), senha: $('sn').value }).then(ir)",
  "      .catch(function (e) { msg(e.message); }).then(function () { $('b-entrar').disabled = false; });",
  '  };',
  "  $('f-criar').onsubmit = function (ev) {",
  "    ev.preventDefault(); msg('');",
  "    if (!$('ac').checked) return msg('Para criar a conta, aceite os Termos e a Política de Privacidade.');",
  "    $('b-criar').disabled = true;",
  "    post('/music/api/conta/cadastrar', { nome: $('cn').value.trim(), email: $('ce').value.trim(), senha: $('cs').value,",
  "      telefone: $('ct').value.trim(), aceite_termos: true, marketing: $('mk').checked }).then(ir)",
  "      .catch(function (e) { msg(e.message); }).then(function () { $('b-criar').disabled = false; });",
  '  };',
  "  $('esqueci').onclick = function (ev) {",
  '    ev.preventDefault();',
  "    var em = $('em').value.trim();",
  "    if (!em) { msg('Escreva o seu e-mail no campo acima e clique de novo em Esqueci minha senha.'); $('em').focus(); return; }",
  "    post('/music/api/conta/senha/esquecer', { email: em })",
  "      .then(function () { msg('Se este e-mail tiver conta no Musique, o link para criar uma senha nova chega em instantes.', true); })",
  '      .catch(function (e) { msg(e.message); });',
  '  };',
  "  modo(location.hash === '#criar' ? 'criar' : 'entrar');",
  '})();',
].join('\n');

const JS_REDEFINIR = [
  '(function () {',
  "  'use strict';",
  "  var $ = function (id) { return document.getElementById(id); };",
  "  var token = new URLSearchParams(location.search).get('token') || '';",
  "  $('f').onsubmit = function (ev) {",
  '    ev.preventDefault();',
  "    var m = $('msg');",
  "    if ($('s1').value !== $('s2').value) { m.className = ''; m.textContent = 'As duas senhas não são iguais.'; return; }",
  "    fetch('/music/api/conta/senha/redefinir', { method: 'POST', headers: { 'Content-Type': 'application/json' },",
  "      body: JSON.stringify({ token: token, senha: $('s1').value }) })",
  '      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.erro); }); })',
  "      .then(function () { m.className = 'bom'; m.innerHTML = 'Senha criada. <a href=\"/music/entrar\">Entrar agora</a>.'; $('f').style.display = 'none'; })",
  "      .catch(function (e) { m.className = ''; m.textContent = e.message || 'Não deu certo.'; });",
  '  };',
  '})();',
].join('\n');

const CSS = `
.entrar-box{max-width:440px;margin:40px auto 60px;background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:26px 24px}
.entrar-box h1{font-size:28px;margin:0 0 6px}
.entrar-box p.sub{color:var(--suave);margin:0 0 18px;font-size:15px}
.entrar-box form{display:flex;flex-direction:column;gap:10px}
.entrar-box label{font-size:14px;font-weight:600;display:flex;flex-direction:column;gap:5px}
.entrar-box input[type=email],.entrar-box input[type=password],.entrar-box input[type=text],.entrar-box input[type=tel]{border:1px solid var(--borda);border-radius:10px;padding:11px 12px;font:16px Inter,sans-serif}
.entrar-box label.check{flex-direction:row;align-items:flex-start;font-weight:400;color:var(--suave);gap:8px}
.entrar-box .abas{display:flex;gap:8px;margin:0 0 16px;flex-wrap:wrap}
.entrar-box .aba{background:transparent;border:1px solid var(--borda);border-radius:999px;padding:9px 18px;font:600 15px Inter,sans-serif;color:var(--graphite);cursor:pointer}
.entrar-box .aba.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.entrar-box button.btn{border:0;cursor:pointer;font:600 16px Inter,sans-serif}
#msg{color:#B3261E;min-height:20px;font-size:14px;margin:8px 0 0}
#msg.bom{color:#0F7A45}
.entrar-box .rodape{font-size:13px;color:var(--suave);margin-top:14px}
`;

const caixa = (dentro) => `<style>${CSS}</style><div class="wrap"><div class="entrar-box">${dentro}</div></div>`;

function paginaEntrar(layout) {
  return layout('Entrar · Musique', caixa(`
  <h1>Entrar no Musique</h1>
  <p class="sub">Cifras, estudo, setlists e palco — com a sua conta do Musique.</p>
  <div class="abas"><button type="button" class="aba on" id="t-entrar">Entrar</button><button type="button" class="aba" id="t-criar">Criar conta grátis</button></div>
  <form id="f-entrar">
    <label>E-mail<input id="em" type="email" autocomplete="username" required></label>
    <label>Senha<input id="sn" type="password" autocomplete="current-password" required></label>
    <button class="btn" id="b-entrar" type="submit">Entrar</button>
    <a href="#" id="esqueci" style="font-size:14px">Esqueci minha senha</a>
  </form>
  <form id="f-criar" style="display:none">
    <label>Nome<input id="cn" type="text" autocomplete="name" required></label>
    <label>E-mail<input id="ce" type="email" autocomplete="email" required></label>
    <label>Senha (8 ou mais caracteres)<input id="cs" type="password" autocomplete="new-password" minlength="8" required></label>
    <label>Celular (opcional)<input id="ct" type="tel" autocomplete="tel"></label>
    <label class="check"><input id="ac" type="checkbox"><span>Li e aceito os <a href="/music/termos" target="_blank">Termos de uso</a> e a <a href="/music/privacidade" target="_blank">Política de Privacidade</a> do Musique.</span></label>
    <label class="check"><input id="mk" type="checkbox"><span>Quero receber novidades do Musique por e-mail (opcional).</span></label>
    <button class="btn" id="b-criar" type="submit">Criar conta e entrar</button>
  </form>
  <p id="msg" role="alert"></p>
  <p class="rodape">Procurando cursos de música? Eles ficam na <a href="https://academia.villelastay.com.br/academy" target="_blank" rel="noopener">Academia Villela</a>, que tem conta própria.</p>
  `) + '<script src="/music/entrar.js"></script>', { descricao: 'Entre no Musique ou crie a sua conta grátis.', caminho: '/music/entrar' });
}

function paginaRedefinir(layout) {
  return layout('Senha nova · Musique', caixa(`
  <h1>Criar uma senha nova</h1>
  <p class="sub">Para a sua conta do Musique.</p>
  <form id="f">
    <label>Senha nova (8 ou mais caracteres)<input id="s1" type="password" autocomplete="new-password" minlength="8" required></label>
    <label>Repita a senha nova<input id="s2" type="password" autocomplete="new-password" minlength="8" required></label>
    <button class="btn" type="submit">Salvar a senha</button>
  </form>
  <p id="msg" role="alert"></p>
  `) + '<script src="/music/redefinir-senha.js"></script>', { descricao: 'Crie uma senha nova para o Musique.', caminho: '/music/redefinir-senha' });
}

function registrar(app, layout) {
  const html = (res) => res.set('Content-Type', 'text/html; charset=utf-8').set('X-Robots-Tag', 'noindex');
  const js = (res) => res.set('Content-Type', 'application/javascript; charset=utf-8').set('Cache-Control', 'no-cache');
  app.get('/music/entrar', (req, res) => html(res).send(paginaEntrar(layout)));
  app.get('/music/entrar.js', (req, res) => js(res).send(JS_ENTRAR));
  // Referrer-Policy no-referrer: o token do link não pode vazar para
  // nenhum recurso de terceiro carregado pela página (fontes).
  app.get('/music/redefinir-senha', (req, res) => html(res).set('Referrer-Policy', 'no-referrer').send(paginaRedefinir(layout)));
  app.get('/music/redefinir-senha.js', (req, res) => js(res).send(JS_REDEFINIR));
}

module.exports = { registrar, destinoSeguro, JS_ENTRAR, JS_REDEFINIR };
