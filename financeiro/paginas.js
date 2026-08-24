// =====================================================================
// Villela Finance — landing pública em /finance.
//
// Server-rendered, autocontida, sem build — padrão de `vsm/paginas.js`.
//
// A página NÃO tem botão de assinar. A cobrança recorrente ainda não está
// ligada, e um botão que leva a lugar nenhum é pior do que a ausência
// dele: o que ela capta é INTERESSE, e diz isso com todas as letras.
//
// A seção "o que este sistema não faz" é deliberada. Num produto
// financeiro, o que ele se recusa a fazer é informação comercial tão
// relevante quanto a lista de recursos — e é o que separa esta página de
// uma landing genérica de ERP.
// =====================================================================
'use strict';
const { db, novoId, nowISO } = require('./db');
const entitlements = require('./entitlements');

const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
const s = (v, max = 400) => String(v == null ? '' : v).trim().slice(0, max);

const BRAND = '/assets/brand/villela-finance';
const ACENTO = '#159A78';   // Finance Jade — Brand Book oficial v1.0

const CSS = `:root{--navy:#1B2A4A;--navy2:#24365C;--gold:#C9A227;--ice:#F8F9FA;--graf:#1F2933;--acento:${ACENTO};--acento2:#0F7A5E;--jade:#159A78;--mint:#45D3A2;--borda:#E2E6EC}
*{box-sizing:border-box}body{font-family:'Inter',system-ui,'Segoe UI',Arial,sans-serif;margin:0;color:var(--graf);background:var(--ice);line-height:1.55}
h1,h2,h3{font-family:'Lora',Georgia,serif;line-height:1.2}
a{color:var(--acento)}.wrap{max-width:1060px;margin:0 auto;padding:0 18px}
header.top{background:var(--navy2);color:#fff}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:16px 18px}
header.top a{color:#E8ECF4;text-decoration:none}header.top nav{display:flex;gap:18px;flex-wrap:wrap}
.marca{height:52px;width:auto;display:block}
.hero{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#f4f6f9;padding:66px 0 74px}
.hero p.tagline{color:var(--mint);font-weight:600;letter-spacing:.02em;margin:0;font-size:1rem}
.hero h1{font-size:2.5rem;margin:.4rem 0;max-width:720px}.hero p{font-size:1.15rem;max-width:620px;color:#cfd8e6}
.badge{display:inline-block;background:var(--gold);color:var(--navy);font-weight:700;padding:4px 13px;border-radius:20px;font-size:.82rem}
.btn{display:inline-block;background:var(--acento);color:#fff;font-weight:700;border:0;border-radius:26px;padding:13px 28px;cursor:pointer;font-size:1rem;text-decoration:none}
.btn:hover{background:var(--acento2)}.btn.o{background:transparent;border:2px solid #f4f6f9;color:#f4f6f9}
.sec{padding:56px 0}.sec.alt{background:#fff;border-top:1px solid var(--borda);border-bottom:1px solid var(--borda)}
.sec h2{font-size:1.75rem;color:var(--navy);text-align:center;margin-bottom:8px}
.sub{text-align:center;color:#5b6b70;max-width:660px;margin:0 auto 34px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}
.card{background:#fff;border:1px solid var(--borda);border-radius:14px;padding:22px}
.card h3{margin:.1rem 0 .5rem;font-size:1.06rem;color:var(--navy)}
.card p{margin:0;font-size:.95rem;color:#4a5560}
.i{font-size:1.5rem;display:block;margin-bottom:6px}
.nao{background:#fff;border:1px solid var(--borda);border-left:4px solid #B91C1C;border-radius:10px;padding:16px 18px;margin:10px 0}
.nao b{color:#7F1D1D}
.passos{counter-reset:p;list-style:none;padding:0;max-width:760px;margin:0 auto}
.passos li{counter-increment:p;position:relative;padding:14px 0 14px 54px;border-bottom:1px solid var(--borda)}
.passos li::before{content:counter(p);position:absolute;left:0;top:12px;width:34px;height:34px;border-radius:50%;background:var(--acento);color:#fff;font-weight:700;display:grid;place-items:center}
.planos{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:16px;align-items:stretch}
.plano{background:#fff;border:1px solid var(--borda);border-radius:16px;padding:22px;display:flex;flex-direction:column}
.plano.dest{border:2px solid var(--gold)}
.plano h3{margin:.2rem 0;color:var(--navy)}.preco{font-size:1.85rem;font-weight:800;color:var(--navy)}
.preco small{font-size:.85rem;font-weight:400;color:#7a8890}
.plano ul{list-style:none;padding:0;margin:14px 0 0;flex:1}
.plano li{padding:5px 0;border-bottom:1px solid var(--borda);font-size:.9rem}
.form{max-width:520px;margin:0 auto;background:#fff;padding:26px;border-radius:14px;border:1px solid var(--borda)}
input,select,textarea{width:100%;padding:11px;border:1px solid #ccc;border-radius:9px;font:inherit;margin:5px 0 12px}
.aviso{background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 16px;color:#7C5E10;font-size:.94rem}
footer{background:var(--navy);color:#c3cbd9;padding:32px 0;text-align:center;font-size:.9rem}
footer a{color:#9FC5E8}
@media(max-width:640px){.hero h1{font-size:1.85rem}header.top nav{display:none}}`;

const HEAD = (titulo, descricao) => `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/svg+xml" href="${BRAND}/favicon.svg">
<meta name="theme-color" content="#1B2A4A">
<style>${CSS}</style></head><body>`;

const MARCA = `<img class="marca" src="${BRAND}/logo-negativo.svg" alt="Villela Finance" width="260" height="60">`;

const TOPO = `<header class="top"><div class="wrap">
  <a href="/finance">${MARCA}</a>
  <nav>
    <a href="#como">Como funciona</a>
    <a href="#nao">O que não faz</a>
    <a href="#planos">Planos</a>
    <a href="#avise">Quero ser avisado</a>
    <a href="/finance/app">Entrar</a>
  </nav>
</div></header>`;

const RODAPE = `<footer><div class="wrap">
  <p><strong>Villela Finance</strong> — uma empresa do Grupo Villela Stay · CNPJ 56.776.526/0001-12</p>
  <p style="opacity:.8;font-size:.86rem;max-width:720px;margin:10px auto">
    O sistema organiza a contabilidade gerencial; não substitui contador, advogado nem norma vigente.
    O plano de contas que acompanha o produto é ponto de partida — o enquadramento fiscal é do contador
    de cada empresa.</p>
  <p><a href="https://villelastay.com.br/sistemas.html">Outros sistemas do grupo</a></p>
</div></footer></body></html>`;

/** Landing. Recebe o estado real do módulo para não prometer o que não há. */
function landingHTML() {
  const planos = entitlements.PLANOS_SEMENTE.filter(p => p.publico !== false);
  const modulos = Object.fromEntries(entitlements.MODULOS.map(m => [m.id, m.nome]));

  const cartaoPlano = (p, destaque) => `
  <div class="plano${destaque ? ' dest' : ''}">
    <h3>${esc(p.nome)}</h3>
    <div class="preco">${brl(p.precoCents)}<small>/mês</small></div>
    <ul>
      <li><strong>${p.limites.entidades}</strong> empresa(s) · <strong>${p.limites.usuarios}</strong> usuários</li>
      <li><strong>${p.limites.contas_bancarias}</strong> contas bancárias</li>
      <li>${p.limites.lancamentos_mes.toLocaleString('pt-BR')} lançamentos/mês</li>
      ${p.modulos.slice(0, 6).map(m => `<li>${esc(modulos[m] || m)}</li>`).join('')}
      ${p.modulos.length > 6 ? `<li>+ ${p.modulos.length - 6} módulo(s)</li>` : ''}
    </ul>
  </div>`;

  return HEAD(
    'Villela Finance — ERP financeiro com razão de partida dobrada',
    'O número que fecha, e explica de onde veio. Extrato conciliado, contas a pagar e receber, fechamento e previsão de caixa para PMEs brasileiras.'
  ) + TOPO + `
<section class="hero"><div class="wrap">
  <span class="badge">Em produção · antes do lançamento comercial</span>
  <p class="tagline">Finanças sob controle. Decisões com inteligência.</p>
  <h1>O número que fecha, e explica de onde veio.</h1>
  <p>ERP financeiro construído sobre um razão de partida dobrada. Cada indicador abre a fórmula,
     as contas que o compõem e a linha do extrato que o originou.</p>
  <p style="margin-top:26px">
    <a class="btn" href="#avise">Quero ser avisado da abertura</a>
    <a class="btn o" href="#como" style="margin-left:8px">Ver como funciona</a>
  </p>
</div></section>

<section class="sec" id="por-que"><div class="wrap">
  <h2>O problema não é falta de planilha</h2>
  <p class="sub">É que o número da planilha não sabe de onde veio. Quando alguém pergunta
     “por que a despesa subiu?”, a resposta costuma ser uma segunda planilha.</p>
  <div class="grid">
    <div class="card"><span class="i">📗</span><h3>O razão é a fonte, não o painel</h3>
      <p>Nenhuma tela soma tabela solta para achar saldo. Débitos e créditos são iguais em todo
         lançamento — e o sistema recusa gravar quando não são, dizendo a diferença.</p></div>
    <div class="card"><span class="i">🔒</span><h3>Lançamento não se apaga</h3>
      <p>Contabilizado, vira imutável. Correção é estorno, com os dois ligados nos dois sentidos.
         Quem garante não é a boa intenção do código: são travas no próprio banco.</p></div>
    <div class="card"><span class="i">🪙</span><h3>Dinheiro em centavos inteiros</h3>
      <p>Nunca em ponto flutuante. Meio centavo de erro não “arredonda”: desbalanceia o lote e
         trava o fechamento. Melhor recusar na entrada.</p></div>
    <div class="card"><span class="i">👁️</span><h3>Ação material com dois pares de olhos</h3>
      <p>Pagamento, mudança de dado bancário do favorecido, fechamento e estorno exigem que quem
         pede não seja quem aprova — com alçada por valor.</p></div>
  </div>
</div></section>

<section class="sec alt" id="como"><div class="wrap">
  <h2>Do extrato ao relatório, sem digitar duas vezes</h2>
  <p class="sub">O caminho inteiro, do arquivo do banco ao indicador que você lê.</p>
  <ol class="passos">
    <li><strong>Importe o extrato.</strong> CSV ou OFX. Reimportar o mesmo arquivo não duplica nada,
        e duas compras iguais no mesmo dia continuam sendo duas. Linha ilegível é rejeitada
        <em>com o motivo</em>, não engolida.</li>
    <li><strong>Veja a sugestão — e o porquê dela.</strong> “A descrição contém <em>neoenergia</em>
        (regra Energia elétrica), confiança 85%”. Você aceita, corrige ou ensina; a regra aprende
        com a correção.</li>
    <li><strong>O lançamento nasce balanceado</strong>, com o imóvel no centro de custo. Entrada
        debita o banco e credita a receita; saída faz o inverso.</li>
    <li><strong>O cockpit abre.</strong> Clique no indicador e desça até a fórmula, às contas que o
        compõem, ao lançamento e à linha do arquivo importado.</li>
    <li><strong>Feche o mês</strong> com um checklist que calcula os bloqueadores: razão balanceado,
        extrato conciliado, balanço que fecha. Fechado, o período trava.</li>
  </ol>
</div></section>

<section class="sec"><div class="wrap">
  <h2>Feito para quem aluga por temporada — e serve a qualquer PME</h2>
  <p class="sub">O vertical de hospedagem já vem aberto no plano de contas.</p>
  <div class="grid">
    <div class="card"><span class="i">🏠</span><h3>Resultado por imóvel</h3>
      <p>Cada propriedade é um centro de custo. A conta de luz do compound se divide entre as casas
         no rateio, e o resultado por imóvel deixa de ser estimativa.</p></div>
    <div class="card"><span class="i">🔗</span><h3>Reservas viram receita sozinhas</h3>
      <p>Integração com a Stays.net: a reserva vira receita, comissão de canal e recebível. Valor
         alterado lança só a diferença; cancelada, o inverso. E há um botão que confere o razão
         contra a própria Stays, imóvel a imóvel.</p></div>
    <div class="card"><span class="i">💳</span><h3>Comissão é dedução, não despesa</h3>
      <p>A comissão do Booking abate a receita, como manda a leitura contábil — e “receita líquida”
         passa a significar o que você entende por receita líquida.</p></div>
    <div class="card"><span class="i">📅</span><h3>Previsão em três cenários</h3>
      <p>Com a premissa de cada um escrita. A taxa do cenário base vem do seu próprio histórico de
         recebimento; sem amostra suficiente, o sistema <em>diz</em> que está usando o padrão.</p></div>
  </div>
</div></section>

<section class="sec alt" id="nao"><div class="wrap">
  <h2>O que este sistema não faz</h2>
  <p class="sub">Num produto financeiro, o que ele se recusa a fazer importa tanto quanto a lista de
     recursos. Nada aqui é “em breve”: é decisão.</p>
  <div style="max-width:780px;margin:0 auto">
    <div class="nao"><b>Não executa pagamento.</b> Registra a ordem, com aprovação e alçada, e gera o
      lançamento de que o pagamento foi feito. Quem move o dinheiro é uma pessoa, no banco.</div>
    <div class="nao"><b>Não emite nota fiscal nem transmite obrigação acessória.</b> Ampliaria o
      risco do produto sem necessidade; integra-se a provedor especializado.</div>
    <div class="nao"><b>Não dá recomendação de investimento nem participa de leilão.</b> São ações
      recusadas pelo código, não desencorajadas — exigiriam habilitação regulatória que este
      produto não tem.</div>
    <div class="nao"><b>Não deixa a IA escrever no razão.</b> As anomalias vêm de regras que você
      pode ler e discordar. Cada constatação traz os fatos que a acionaram e o que a invalidaria.</div>
    <div class="nao"><b>Não retém o seu dado se você sair.</b> Exportação integral do razão, dos
      lançamentos e dos documentos, em formato aberto, a qualquer momento — inclusive com a
      assinatura suspensa.</div>
  </div>
</div></section>

<section class="sec" id="planos"><div class="wrap">
  <h2>Planos</h2>
  <p class="sub">Preços de lançamento, ainda <strong>não cobrados</strong>: a cobrança recorrente
     será ligada antes da abertura comercial.</p>
  <div class="planos">
    ${planos.map((p, i) => cartaoPlano(p, i === 2)).join('')}
  </div>
  <p class="sub" style="margin-top:26px">Conta suspensa por inadimplência perde o direito de lançar,
     mas <strong>continua vendo e exportando o próprio razão</strong>. Dado contábil retido é
     problema jurídico, não alavanca comercial.</p>
</div></section>

<section class="sec alt" id="avise"><div class="wrap">
  <h2>Quero ser avisado da abertura</h2>
  <p class="sub">Sem botão de assinar porque a cobrança ainda não está ligada — e um botão que leva a
     lugar nenhum é pior do que a ausência dele.</p>
  <form class="form" id="f">
    <label>Seu nome<input name="nome" maxlength="120" autocomplete="name"></label>
    <label>E-mail *<input name="email" type="email" required maxlength="180" autocomplete="email"></label>
    <label>Empresa<input name="empresa" maxlength="140" autocomplete="organization"></label>
    <label>Porte
      <select name="porte">
        <option value="">Prefiro não dizer</option>
        <option>Autônomo / MEI</option>
        <option>Até 10 pessoas</option>
        <option>11 a 50 pessoas</option>
        <option>Mais de 50 pessoas</option>
      </select>
    </label>
    <label>O que você mais precisa resolver?<textarea name="mensagem" rows="3" maxlength="600"></textarea></label>
    <button class="btn" type="submit">Avise-me</button>
    <p id="msg" style="margin:14px 0 0;font-size:.92rem"></p>
    <p style="font-size:.82rem;color:#7a8890;margin:14px 0 0">
      Guardamos apenas o que você escreveu aqui, para avisar da abertura. Peça a exclusão quando
      quiser, pelo mesmo e-mail.</p>
  </form>
</div></section>

<script>
document.getElementById('f').addEventListener('submit', async function (e) {
  e.preventDefault();
  var msg = document.getElementById('msg');
  var dados = Object.fromEntries(new FormData(e.target).entries());
  msg.textContent = 'Enviando…'; msg.style.color = '#5b6b70';
  try {
    var r = await fetch('/finance/api/interesse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
    });
    var j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Não consegui registrar.');
    msg.style.color = '#166534';
    msg.textContent = j.jaHavia ? 'Você já estava na lista — avisaremos.' : 'Pronto. Avisaremos você.';
    e.target.reset();
  } catch (err) {
    msg.style.color = '#B91C1C';
    msg.textContent = err.message + ' Se persistir, escreva para augusto.villela@gmail.com.';
  }
});
</script>` + RODAPE;
}

/** Registra interesse. Idempotente por e-mail: reenviar não duplica. */
function registrarInteresse(d, ip) {
  const email = s(d.email, 180).toLowerCase();
  if (!email.includes('@') || email.length < 5) {
    throw Object.assign(new Error('Informe um e-mail válido.'), { status: 400 });
  }
  const ja = db.prepare('SELECT id FROM fin_interessados WHERE email = ?').get(email);
  if (ja) return { ok: true, jaHavia: true };
  db.prepare(
    `INSERT INTO fin_interessados (id, nome, email, empresa, porte, mensagem, plano, origem, criado_em, ip)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(novoId(), s(d.nome, 120), email, s(d.empresa, 140), s(d.porte, 40),
    s(d.mensagem, 600), s(d.plano, 40), 'landing', nowISO(), s(ip, 45));
  return { ok: true, jaHavia: false };
}

const listarInteressados = (limite = 200) => db.prepare(
  'SELECT * FROM fin_interessados ORDER BY criado_em DESC LIMIT ?').all(Math.min(limite, 500));

/**
 * Casca da aplicação do assinante. O corpo inteiro é montado pelo
 * `app-cliente.js`; aqui só vai o esqueleto e o design system do grupo.
 * `noindex` porque é área logada — o robots.txt já bloqueia, mas quem
 * chega por link direto não passa pelo robots.
 */
const appHTML = () => `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Villela Finance — entrar</title>
<meta name="robots" content="noindex,nofollow">
<link rel="icon" type="image/svg+xml" href="${BRAND}/favicon.svg">
<meta name="theme-color" content="#1B2A4A">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7">
<link rel="stylesheet" href="/assets/brand/villela-saas.css?v=7">
<link rel="manifest" href="/finance/manifest.webmanifest">
<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/finance/sw.js').catch(function(){})})}</script>
</head><body class="vx" data-vertical="finance"><main id="app"><p style="padding:32px;text-align:center">Carregando…</p></main>
<script src="/finance/app.js?v=1"></script></body></html>`;

function registrarPaginas(app, { express }) {
  app.get('/finance', (_req, res) => res.type('html').send(landingHTML()));
  app.get('/finance/app', (_req, res) => res.type('html').send(appHTML()));
  app.get('/finance/app.js', (_req, res) =>
    res.type('application/javascript; charset=utf-8').sendFile(require('path').join(__dirname, 'app-cliente.js')));
  app.post('/finance/api/interesse', express.json({ limit: '32kb' }), (req, res) => {
    try { res.json(registrarInteresse(req.body || {}, req.ip)); }
    catch (e) { res.status(e.status || 500).json({ erro: e.message }); }
  });
  // Robots: a landing é pública; o app e a API, não.
  app.get('/finance/robots.txt', (_req, res) => res.type('text/plain').send(
    'User-agent: *\nAllow: /finance\nDisallow: /finance/api\nDisallow: /finance/app\n'));
}

module.exports = { registrarPaginas, landingHTML, appHTML, registrarInteresse, listarInteressados };
