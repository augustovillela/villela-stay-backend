// =====================================================================
// ORIGENA — páginas server-rendered, sem build.
//
// TODO texto vem do catálogo i18n (§86) — zero string em componente. O
// servidor injeta o catálogo do idioma do visitante no HTML, e o JS do
// navegador só lê `T['chave']`. Trocar de idioma é trocar o JSON.
//
// IDENTIDADE PROVISÓRIA, DE PROPÓSITO: a marca da Origena depende do
// brand book do grupo, ainda em preparação (memória
// "brand-book-em-preparacao"), e da busca INPI. Nada aqui é decisão de
// marca — os tokens estão num bloco só, para trocar de uma vez.
// =====================================================================
'use strict';
const i18n = require('./i18n');
const db = require('./db');

// Página pública nunca pode cair por causa de uma consulta: o "catch" de
// cada rota assíncrona vive aqui.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const escHtml = (s) => String(s == null ? '' : s)
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// PALETA E TIPOGRAFIA (12/08/2026). Os nomes dos tokens são os de sempre
// (--fundo, --tema, --borda…) para que nenhuma regra existente precise ser
// reescrita; o que mudou foram os VALORES, mais os quatro tokens novos de
// cor com significado. Vocabulário: Papel, Tinta, Floresta, Argila,
// Madeira, Ouro velho — ver docs\frontend\migration-plan.md.
const CSS = `
:root{--fundo:#FAF7F1;--tinta:#292724;--suave:#6B655C;--card:#FFFDFC;--borda:#DED7CC;
--tema:#234238;--tema-suave:#E8EEE9;--acento:#A65F45;--heranca:#826247;--destaque:#C39A58;
--raio:16px;--raio-ctrl:12px;--sombra:0 4px 18px rgb(41 39 36 / 7%);--transicao:180ms ease;
--foco:#2C6E9B}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);
font:16px/1.65 Inter,system-ui,'Segoe UI',Roboto,sans-serif}
h1,h2,h3{font-family:Newsreader,Lora,Georgia,'Times New Roman',serif;font-weight:600;letter-spacing:-.01em}
/* Foco visível em tudo o que recebe teclado (WCAG 2.2 AA). O anel é de
   cor própria: contorno que depende da cor do tema some no botão do tema. */
:focus-visible{outline:3px solid var(--foco);outline-offset:2px;border-radius:6px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
/* Só para leitor de tela: texto que existe para ser ouvido, nunca visto.
   Recorte em vez de display:none — o que some da tela some do leitor. */
.so-leitor{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
clip-path:inset(50%);white-space:nowrap;border:0}
/* Pular para o conteúdo: primeiro item do Tab, invisível até receber foco.
   Sem ele, quem navega por teclado atravessa o menu inteiro em cada tela. */
.pular{position:absolute;left:8px;top:-60px;z-index:60;background:var(--tema);color:#fff;
padding:12px 18px;border-radius:0 0 12px 12px;text-decoration:none;transition:var(--transicao)}
.pular:focus{top:0}
main:focus{outline:none}
.wrap{max-width:820px;margin:0 auto;padding:0 22px}
.hero{padding:64px 0 40px;text-align:center}
.hero h1{font-size:clamp(38px,7vw,62px);margin:0 0 10px;letter-spacing:-.02em}
.hero .anel{color:var(--tema);line-height:0;margin:6px 0 18px}
.assinatura{color:var(--suave);font-size:19px;margin:0 0 14px}
/* A promessa em serifa, tamanho de leitura: é a frase que explica por que
   o produto existe, não uma linha de apoio. */
.promessa{font-family:Newsreader,Georgia,serif;font-size:clamp(19px,2.6vw,24px);
line-height:1.5;color:var(--tinta);max-width:30ch;margin:0 auto 8px}
.selo{display:inline-block;background:#F6EEDD;border:1px solid #E4D2AE;color:#6E5417;
border-radius:999px;padding:6px 15px;font-weight:600;font-size:14px;margin-bottom:22px}
.card{background:var(--card);border:1px solid var(--borda);border-radius:var(--raio);
padding:26px;margin:18px 0;text-align:left;box-shadow:var(--sombra)}
.card h2{font-size:20px;margin:0 0 10px}
.card p{margin:0 0 10px;color:var(--suave)}
.card p:last-child{margin-bottom:0}
footer{color:var(--suave);font-size:14px;text-align:center;padding:34px 0 50px}
/* Escuro: mesma família de cores, não uma paleta paralela — o verde clareia
   para ter contraste sobre fundo escuro, e o papel vira noite quente. */
@media(prefers-color-scheme:dark){
:root{--fundo:#161816;--tinta:#EDEAE3;--suave:#A8A196;--card:#1E211E;--borda:#31352F;
--tema:#8FC0A9;--tema-suave:#24312A;--acento:#E0937A;--heranca:#C4A184;--destaque:#DDBB7C;
--sombra:0 4px 18px rgb(0 0 0 / 28%);--foco:#8FC5E8}
.selo{background:#332A12;border-color:#5A4A20;color:#E8D08A}}
`;

// O mesmo anel do app, maior, para a página pública. Marcador de lugar —
// a marca definitiva espera o brand book e o INPI.
// Anel pequeno para o cabeçalho das páginas públicas. O `ANEL` que já
// existia vive DENTRO do app (template literal) e não alcança daqui.
const ANEL_PEQUENO = '<svg width="30" height="30" viewBox="0 0 26 26" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
  '<circle cx="13" cy="13" r="10.6" stroke-dasharray="58 8"></circle>' +
  '<circle cx="13" cy="13" r="6.8" stroke-dasharray="36 6"></circle>' +
  '<circle cx="13" cy="13" r="2.6"></circle></svg>';

const ANEL_GRANDE = '<svg width="72" height="72" viewBox="0 0 26 26" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.1" stroke-linecap="round">' +
  '<circle cx="13" cy="13" r="11.2" stroke-dasharray="62 9"></circle>' +
  '<circle cx="13" cy="13" r="8.2" stroke-dasharray="44 8"></circle>' +
  '<circle cx="13" cy="13" r="5.2" stroke-dasharray="28 6"></circle>' +
  '<circle cx="13" cy="13" r="2.2"></circle></svg>';

// Cabeça compartilhada. "pwa" liga manifest + service worker (o módulo
// central pwa.js serve os dois em /origena/manifest.webmanifest e /origena/sw.js).
function pagina(idioma, titulo, corpo, { pwa = false, css = '' } = {}) {
  return `<!doctype html>
<html lang="${idioma}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#234238">
<title>${titulo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600;6..72,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
${pwa ? '<link rel="manifest" href="/origena/manifest.webmanifest">'
      + '<link rel="apple-touch-icon" href="/assets/brand/villela-origena/apple-touch-icon.png">' : ''}
<link rel="icon" href="/assets/brand/villela-origena/favicon.svg" type="image/svg+xml">
<style>${CSS}${css}</style>
</head><body>${corpo}
${pwa ? `<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/origena/sw.js',{scope:'/origena/'}).catch(()=>{});</script>` : ''}
</body></html>`;
}

function registrarPaginas(app) {
  // ------------------------------------------------ SITE INSTITUCIONAL
  // Uma página só, com seções ancoradas: quem chega precisa entender em um
  // minuto o que é, como funciona, o que custa e por que ainda não pode
  // entrar. Sem marca definitiva (ela espera o brand book e o INPI) — o
  // que existe aqui é ESTRUTURA e TEXTO, que não dependem do logotipo.
  //
  // Os PREÇOS saem do banco, do mesmo lugar que a cobrança usa: preço na
  // vitrine diferente do preço cobrado é o defeito mais caro que uma
  // página dessas pode ter. Se o banco não responder, a seção de planos
  // some — a página nunca quebra por causa dela.
  app.get('/origena', h(async (req, res) => {
    const idioma = req.idioma || i18n.PADRAO;
    const t = (c, v) => i18n.t(idioma, c, v);
    const brl = (centavos) => 'R$ ' + (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    let planos = [];
    try {
      planos = await db.todas(
        `SELECT codigo, nome, preco_centavos, preco_anual_centavos, storage_gb, creditos_mes
           FROM plans WHERE ativo ORDER BY ordem, preco_centavos`);
    } catch (_) { planos = []; }

    const secao = (id, titulo, corpo) =>
      `<section id="${id}" class="secao"><h2>${t(titulo)}</h2>${corpo}</section>`;
    const passos = ['guardar', 'contar', 'ligar', 'criar'].map((p, i) =>
      `<div class="passo"><b>${i + 1}. ${t('site.passo_' + p + '_t')}</b>
        <p>${t('site.passo_' + p)}</p></div>`).join('');
    const recursos = ['proveniencia', 'midia', 'entrevistas', 'tradicoes', 'busca', 'capsula',
      'guardioes', 'livro', 'privacidade', 'saida'].map((r) =>
      `<div class="recurso"><b>${t('site.rec_' + r + '_t')}</b><p>${t('site.rec_' + r)}</p></div>`).join('');

    res.type('html').send(pagina(idioma,
      `${t('produto.nome')} — ${t('produto.assinatura')}`, `
<header class="faixa-topo">
 <div class="wrap-largo">
  <nav class="menu-site" aria-label="${t('site.nav')}">
    <!-- A MARCA NO CABEÇALHO. Ele era só uma fileira de links: quem
         chegava por um link interno não via de quem era o site até rolar
         até o hero. O slogan vai logo abaixo do nome, na mesma coluna —
         é a assinatura da marca, não um item de menu. -->
    <a class="marca-site" href="/origena">
      <span class="anel">${ANEL_PEQUENO}</span>
      <span class="nomes"><b>${t('produto.nome')}</b>
        <small>${t('produto.assinatura')}</small></span>
    </a>
    <span class="links">
    <a href="#como">${t('site.como_t')}</a>
    <a href="#recursos">${t('site.recursos_t')}</a>
    <a href="#familia">${t('site.familia_t')}</a>
    <a href="#criacoes">${t('site.criacoes_t')}</a>
    ${planos.length ? `<a href="#planos">${t('site.planos_t')}</a>` : ''}
    <a class="btn mini" href="/origena/app">${t('acao.entrar')}</a>
    </span>
  </nav>
  ${seletorIdioma(idioma, '/origena')}
 </div>
</header>
<div class="wrap">

  <div class="hero">
    <div class="selo">${t('landing.selo')}</div>
    <div class="anel">${ANEL_GRANDE}</div>
    <h1>${t('produto.nome')}</h1>
    <p class="assinatura">${t('produto.assinatura')}</p>
    <p class="promessa">${t('landing.promessa')}</p>
    <p><a class="btn" href="/origena/app">${t('acao.entrar')}</a></p>
  </div>

  <div class="card">
    <h2>${t('landing.titulo')}</h2>
    <p>${t('landing.p1')}</p>
    <p>${t('landing.p2')}</p>
  </div>

  ${secao('como', 'site.como_t', `<p class="sub">${t('site.como_p')}</p>
    <div class="passos">${passos}</div>`)}

  ${secao('recursos', 'site.recursos_t', `<p class="sub">${t('site.recursos_p')}</p>
    <div class="recursos">${recursos}</div>`)}

  ${secao('familia', 'site.familia_t', `<p>${t('site.familia_p1')}</p>
    <p>${t('site.familia_p2')}</p>
    <p class="sub">${t('site.familia_p3')}</p>`)}

  ${secao('criacoes', 'site.criacoes_t', `<p>${t('site.criacoes_p')}</p>
    <ul class="lista">
      <li>${t('site.criacao_livro')}</li>
      <li>${t('site.criacao_pessoa')}</li>
      <li>${t('site.criacao_album')}</li>
      <li>${t('site.criacao_ano')}</li>
      <li>${t('site.criacao_capsula')}</li>
    </ul>
    <p class="sub">${t('site.criacoes_nota')}</p>`)}

  ${planos.length ? secao('planos', 'site.planos_t', `<p class="sub">${t('site.planos_p')}</p>
    <div class="planos">${planos.map((p) => `<div class="plano">
      <b>${escHtml(p.nome)}</b>
      <p class="preco">${p.preco_centavos ? brl(p.preco_centavos) + t('site.por_mes') : t('site.gratis')}</p>
      <p class="sub">${t('site.plano_linha', {
        gb: p.storage_gb,
        creditos: p.creditos_mes ? t('site.creditos_mes', { n: p.creditos_mes }) : t('site.sem_creditos'),
      })}</p>
      ${p.preco_anual_centavos ? `<p class="sub">${t('site.ou_ano', { valor: brl(p.preco_anual_centavos) })}</p>` : ''}
    </div>`).join('')}</div>
    <p class="sub">${t('site.planos_nota')}</p>`) : ''}

  <div class="card">
    <h2>${t('landing.fechado_titulo')}</h2>
    <p>${t('landing.fechado_p')}</p>
    <!-- A PORTA. Esta página dizia "em construção" e não oferecia caminho
         nenhum para entrar: quem já tinha conta chegava aqui e não achava
         como usar o próprio acervo. Beta fechado é sobre QUEM pode entrar,
         não sobre esconder a porta de quem pode. -->
    <p><a class="btn" href="/origena/app">${t('acao.entrar')}</a>
       &nbsp; <a href="/origena/ajuda">${t('ajuda.titulo')}</a></p>
  </div>
  <footer>${t('produto.grupo')}</footer>
</div>`, { css: CSS_PUBLICO }));
  }));

  // ------------------------------------------------- central de ajuda
  // O MANUAL DA CASA. A Origena toma decisões que surpreendem quem chega:
  // o dado que não se apaga, a divergência que não se resolve sozinha, a
  // cápsula que nem o dono abre. Sem um lugar que explique isso, cada
  // dúvida vira uma pergunta ao Augusto — e o beta passa a medir a
  // paciência dele em vez de medir o produto.
  //
  // O texto mora no CATÁLOGO (§86), não aqui: fica traduzível e sai do
  // código junto com o resto das mensagens.
  app.get('/origena/ajuda', (req, res) => {
    const idioma = req.idioma || i18n.PADRAO;
    const t = (c) => i18n.t(idioma, c);
    // Ordem em que a dúvida APARECE, não ordem de importância conceitual:
    // quem abre a ajuda quer primeiro saber como andar pelo app, e só
    // depois por que a Origena guarda a origem de cada informação.
    const artigos = ['navegar', 'acervo', 'fluxo', 'selo', 'divergencia', 'privacidade', 'conta',
      'enviar', 'album', 'excluir', 'fotos', 'datas', 'entrevistas',
      'capsula', 'guardioes', 'livros', 'creditos', 'erro'];
    const paragrafos = (a) => String(t(`ajuda.${a}_c`) || '')
      .split('\n\n').map((p) => `<p>${p.split('\n').join('<br>')}</p>`).join('');

    res.type('html').send(pagina(idioma, `${t('ajuda.titulo')} — ${t('produto.nome')}`, `
<div class="wrap">
  ${seletorIdioma(idioma, '/origena/ajuda')}
  <p class="sub"><a href="/origena">&larr; ${t('ajuda.voltar')}</a></p>
  <div class="hero">
    <h1>${t('ajuda.titulo')}</h1>
    <p class="assinatura">${t('ajuda.intro')}</p>
  </div>
  <nav class="card"><p>${artigos
    .map((a) => `<a href="#${a}">${t(`ajuda.${a}_t`)}</a>`).join(' · ')}</p></nav>
  ${artigos.map((a) => `<div class="card" id="${a}">
    <h2>${t(`ajuda.${a}_t`)}</h2>
    ${paragrafos(a)}
  </div>`).join('')}
  <div class="card">
    <p>${t('ajuda.duvida')}</p>
    <p><a class="btn" href="/origena/app">${t('acao.entrar')}</a></p>
  </div>
  <footer>${t('produto.grupo')}</footer>
</div>`, { css: CSS_PUBLICO }));
  });

  /**
   * Trocar de idioma. Guarda a ESCOLHA num cookie de um ano e devolve a
   * pessoa para a mesma página — trocar de língua não pode custar o lugar
   * onde ela estava.
   *
   * `para` é validado como caminho interno: aceitar URL solta aqui seria
   * um redirecionador aberto de graça, e este é o tipo de rota que ninguém
   * revisa depois.
   */
  app.get('/origena/idioma', (req, res) => {
    const alvo = i18n.normalizar(req.query.l);
    res.cookie(i18n.COOKIE_IDIOMA, alvo, {
      httpOnly: false, sameSite: 'lax', maxAge: 365 * 24 * 3600 * 1000, path: '/',
    });
    const bruto = String(req.query.para || '/origena/app');
    const para = /^\/origena(\/|$)/.test(bruto) && !bruto.startsWith('//') ? bruto : '/origena/app';
    res.redirect(302, para);
  });

  app.get('/origena/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /origena\n');
  });

  // ------------------------------------------------------ app da família
  app.get('/origena/app', (req, res) => {
    const idioma = req.idioma || i18n.PADRAO;
    const corpo = CORPO_APP
      .replace('__CATALOGO__', JSON.stringify(i18n.catalogo(idioma)))
      .replace('__IDIOMA__', JSON.stringify(idioma))
      // O link de pular é o PRIMEIRO foco da página e precisa existir já no
      // HTML servido: quem navega por teclado não pode depender de o
      // script ter rodado para conseguir sair do menu.
      .replace('__PULAR__', i18n.t(idioma, 'acesso.pular'));
    res.type('html').send(pagina(idioma, i18n.t(idioma, 'produto.nome'), corpo, { pwa: true, css: CSS_APP }));
  });

  // Aterrissagem dos links de e-mail. Entregam o token ao app.
  for (const rota of ['/origena/verificar', '/origena/convite', '/origena/nova-senha']) {
    app.get(rota, (req, res) => res.redirect(302,
      `/origena/app#${rota.split('/').pop()}?token=${encodeURIComponent(req.query.token || '')}`));
  }
}

// A landing e a ajuda não carregam o CSS do app. Sem isto o botão de
// entrar vira texto solto no meio do cartão — que foi exatamente como a
// porta deixou de existir para quem chegava.
/**
 * Seletor de idioma. Cada língua aparece NO PRÓPRIO NOME — quem só lê
 * espanhol não encontraria "Espanhol" escrito em português.
 *
 * O francês fica de fora de propósito: o catálogo dele está vazio e cair
 * no português seria oferecer uma porta que não leva a lugar nenhum. Ele
 * volta à lista no dia em que for traduzido.
 */
const IDIOMAS_PRONTOS = [['pt-BR', 'Português'], ['en-US', 'English'], ['es', 'Español']];
const seletorIdioma = (idiomaAtual, caminho) =>
  '<p class="idiomas">' + IDIOMAS_PRONTOS.map(([cod, nome]) => (cod === idiomaAtual
    ? '<strong>' + nome + '</strong>'
    : '<a href="/origena/idioma?l=' + cod + '&para=' + encodeURIComponent(caminho) + '">' + nome + '</a>'
  )).join(' · ') + '</p>';

const CSS_PUBLICO = `
.idiomas{text-align:right;font-size:13px;color:var(--suave);margin:0 0 10px}
.idiomas strong{color:var(--tinta)}
.btn{display:inline-block;background:var(--tema);color:#fff;border-radius:12px;
padding:12px 20px;font-weight:600;text-decoration:none;line-height:22px}
.card a{color:var(--tema)}
/* A regra ".card a" tem especificidade MAIOR que ".btn" e vinha depois:
   o texto do botão virava marrom sobre marrom — botão invisível. Precisa
   vencer explicitamente, não por ordem. */
.card a.btn{color:#fff}
nav.card p{margin:0;line-height:2.1}
/* Site institucional: barra de âncoras, seções e as grades de conteúdo. */
/* O cabecalho tem faixa PROPRIA, mais larga que o corpo do texto: marca a
   esquerda e links a direita cabem numa linha so — inclusive em ingles e
   espanhol, onde os rotulos sao mais longos. Espremer os dois em 820px
   funcionava em portugues e quebrava nos outros dois. */
.faixa-topo{border-bottom:1px solid var(--borda)}
.wrap-largo{max-width:1120px;margin:0 auto;padding:0 22px}
.menu-site{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;
padding:18px 0;font-size:15px}
.menu-site .links{display:flex;flex-wrap:wrap;gap:11px;align-items:center;font-size:14px;
justify-content:flex-end}
/* A marca: anel + nome, com a assinatura embaixo na mesma coluna. */
.marca-site{display:flex;align-items:center;gap:11px;text-decoration:none;color:var(--tinta)}
.marca-site .anel{color:var(--tema);display:flex}
.marca-site .nomes{display:flex;flex-direction:column;line-height:1.15}
.marca-site b{font-family:Newsreader,Lora,Georgia,serif;font-size:24px;font-weight:600;
letter-spacing:-.01em}
.marca-site small{color:var(--suave);font-size:11.5px;letter-spacing:.01em;white-space:nowrap}
.marca-site:hover b{color:var(--tema)}
/* No celular a marca fica sozinha na primeira linha e os links embaixo —
   espremer os dois some com a assinatura, que e justamente o que da
   identidade ao cabecalho. */
@media(max-width:620px){
  .menu-site{justify-content:center}
  .marca-site{width:100%;justify-content:center}
  .marca-site .nomes{align-items:center;text-align:center}
}
.menu-site a{color:var(--tinta);text-decoration:none;padding:6px 2px}
.menu-site a:hover{color:var(--tema);text-decoration:underline}
.menu-site a.btn{color:#fff;text-decoration:none;padding:8px 16px;font-size:14px}
.secao{padding:40px 0 8px;border-top:1px solid var(--borda);margin-top:8px}
.secao h2{font-size:clamp(24px,4vw,32px);margin:0 0 8px}
.passos,.recursos,.planos{display:grid;gap:16px;margin:22px 0}
.passos{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.recursos{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.planos{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.passo,.recurso,.plano{background:var(--card);border:1px solid var(--borda);
border-radius:var(--raio);padding:18px}
.passo b,.recurso b,.plano b{font-family:Newsreader,Georgia,serif;font-size:18px;display:block;margin-bottom:6px}
.passo p,.recurso p{margin:0;color:var(--suave);font-size:15px;line-height:1.55}
.plano .preco{font-family:Newsreader,Georgia,serif;font-size:26px;margin:2px 0 6px;color:var(--tema)}
.lista{padding-left:20px;line-height:1.9;color:var(--suave)}
.lista li{margin:0}
@media(prefers-color-scheme:dark){.menu-site a{color:var(--tinta)}}
`;

const CSS_APP = `
.arquivo-grande{text-align:center;padding:34px 18px}
.arquivo-grande .icone{font-size:56px;display:block;margin-bottom:14px}

/* Arquivo que nao e foto: icone grande e legivel no lugar da miniatura. */
.ph.arquivo{display:flex;align-items:center;justify-content:center;background:var(--card)}
.ph.arquivo .icone{font-size:34px;line-height:1}

/* Filtros, selecao e periodo. Alvo de toque de 44px (§85): a caixa de
   marcar vai ser usada por avo no celular tanto quanto por neto. */
.filtros{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.filtros select{min-height:44px;font-size:15px;max-width:46vw}
.periodo{margin:22px 0 8px;font-size:17px;border-bottom:1px solid var(--borda);padding-bottom:5px}
.cel{position:relative}
.marca-sel{position:absolute;top:4px;left:4px;z-index:2;padding:10px;cursor:pointer}
.marca-sel input{width:22px;height:22px}
.paginacao{display:flex;align-items:center;gap:12px;justify-content:center;margin:22px 0}

/* Seletor de idioma no cabecalho: discreto, mas com alvo de toque de 44px
   (§85) — vai ser usado por avo no celular tanto quanto por neto. */
.topo .idiomas{display:inline-flex;gap:2px;margin-left:10px}
.topo .idiomas a,.topo .idiomas strong{min-width:34px;min-height:44px;display:inline-flex;
align-items:center;justify-content:center;font-size:13px;font-weight:600;letter-spacing:.02em}
.topo .idiomas strong{color:var(--tema)}

.wrap{max-width:760px;padding-bottom:84px}
.topo{display:flex;justify-content:space-between;align-items:center;gap:14px;
padding:14px 0;border-bottom:1px solid var(--borda);flex-wrap:wrap}
.marca{font-family:Newsreader,Lora,Georgia,serif;font-size:22px;font-weight:600;
color:var(--tinta);text-decoration:none;display:inline-flex;align-items:center;gap:9px}
/* O anel do marcador de marca, desenhado em SVG inline: um caractere não
   diria "camadas de memória", e imagem externa atrasaria o primeiro
   desenho da tela. Marca DEFINITIVA continua esperando o brand book. */
.marca svg{flex:0 0 auto}
.topo-dir{display:flex;align-items:center;gap:12px;font-size:14px;color:var(--suave);flex-wrap:wrap}
/* Alvo de toque: link de NAVEGAÇÃO não é link no meio de um parágrafo, e
   não vale a exceção de alvo pequeno da WCAG 2.2 (2.5.8). Um respiro
   vertical resolve sem mudar o desenho. */
.topo-dir a{color:var(--suave);padding:4px 2px;display:inline-block}
p.sub a{padding:4px 0;display:inline-block}
.familia-atual{font-weight:600;color:var(--tema);text-decoration:none}

/* NAVEGAÇÃO AGRUPADA (Acervo · Explorar · Criar · Cuidar do legado).
   Eram ~20 links numa fileira separada por "·": tudo no mesmo nível, nada
   encontrável. Cada grupo é um <details>, que abre e fecha sem uma linha
   de JavaScript e funciona no teclado de graça. */
.nav{display:flex;gap:8px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--borda)}
.nav details{position:relative}
.nav summary{list-style:none;cursor:pointer;padding:9px 14px;border-radius:999px;
font-size:14px;font-weight:600;color:var(--tinta);background:transparent;
border:1px solid transparent;transition:var(--transicao);min-height:40px;
display:inline-flex;align-items:center;gap:6px}
.nav summary::-webkit-details-marker{display:none}
.nav summary:hover{background:var(--tema-suave)}
.nav details[open] summary{background:var(--tema-suave);border-color:var(--borda);color:var(--tema)}
.nav details.aqui summary{color:var(--tema);box-shadow:inset 0 -2px 0 var(--tema)}
.nav .itens a.aqui{background:var(--tema-suave);color:var(--tema);font-weight:600}
.nav .itens{position:absolute;z-index:30;top:calc(100% + 6px);left:0;min-width:212px;
background:var(--card);border:1px solid var(--borda);border-radius:var(--raio);
box-shadow:var(--sombra);padding:8px;display:flex;flex-direction:column}
.nav .itens a{padding:11px 13px;border-radius:var(--raio-ctrl);color:var(--tinta);
text-decoration:none;font-size:15px;min-height:44px;display:flex;align-items:center}
.nav .itens a:hover{background:var(--tema-suave);color:var(--tema)}
@media(max-width:640px){.nav .itens{position:static;box-shadow:none;border:0;padding:6px 0 2px}}

/* Barra de baixo no celular: as cinco portas que o plano define. Vive
   FORA de #app, então sobrevive a cada redesenho de tela. */
.barra{position:fixed;left:0;right:0;bottom:0;z-index:40;display:none;
background:var(--card);border-top:1px solid var(--borda);
padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
.barra a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
padding:6px 2px;min-height:52px;justify-content:center;
font-size:11px;color:var(--suave);text-decoration:none;border-radius:var(--raio-ctrl)}
.barra a svg{flex:0 0 auto}
.barra a.ativo{color:var(--tema);background:var(--tema-suave);font-weight:600}
@media(max-width:640px){.barra.ver{display:flex}}
/* §85: alvo de toque de 48px e texto de 16px+. A Origena vai ser usada
   por avós no celular — controle apertado aqui não é detalhe estético.
   16px no input também evita o zoom automático do iOS ao focar. */
input,select{width:100%;min-height:48px;padding:12px 14px;border:1px solid var(--borda);
border-radius:10px;font:16px Inter,system-ui,sans-serif;background:var(--card);
color:var(--tinta);margin:6px 0 14px}
input[type=checkbox]{min-height:22px;width:22px;height:22px;vertical-align:-4px}
label{font-size:15px;font-weight:600;display:block;margin-top:6px}
/* Hierarquia de botões: primário = Floresta; claro = secundário; e o
   "emocional" = Argila, reservado para contar, gravar e convidar — a cor
   que pede uma ação afetiva não pode ser a mesma de "Salvar". */
/* BOTÕES. Eram pílulas de 48 px de altura, 26 px de folga e peso 600 —
   volume de anúncio, não de ferramenta —, e sem margem nenhuma: três
   deles numa linha (Livro da família) encostavam um no outro. Agora:
   canto de 12 px como o resto do sistema, altura confortável mas sem
   inchaço, e margem própria, para que qualquer par tenha respiro mesmo
   fora de um grupo. */
.btn{background:var(--tema);color:#fff;border:1px solid transparent;border-radius:var(--raio-ctrl);
padding:10px 18px;min-height:44px;font-weight:600;font-size:15px;line-height:1.25;cursor:pointer;
display:inline-flex;align-items:center;justify-content:center;gap:8px;
margin:0 8px 8px 0;transition:var(--transicao);text-align:center}
.btn:hover{filter:brightness(1.06)}
.btn:active{transform:translateY(1px)}
.acoes .btn,.linha .btn{margin:0}
/* A classe "sec" era usada em 13 botões e NÃO EXISTIA no CSS: todos
   apareciam como primário, e telas com quatro ações viravam quatro botões
   verdes gritando juntos. É a ação de apoio — presente, sem disputar.
   "claro" era o secundário antigo; fica como apelido para não quebrar
   nada que ainda o use. */
.btn.sec,.btn.claro{background:var(--card);color:var(--tinta);border:1px solid var(--borda);font-weight:500}
.btn.sec:hover,.btn.claro:hover{background:var(--tema-suave);border-color:var(--tema);color:var(--tema);filter:none}
.btn.emocional{background:var(--acento)}
.btn.mini{min-height:36px;padding:7px 13px;font-size:14px;font-weight:500;border-radius:10px}
/* Grupo de ações: uma linha que quebra sozinha, com respiro igual entre
   os itens — o lugar certo para duas ou mais ações vizinhas. */
.acoes{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 6px;align-items:center}
a{text-decoration-thickness:1px;text-underline-offset:3px;color:var(--tema)}
.btn:disabled{opacity:.5;cursor:wait}
.linha{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;
border-bottom:1px solid var(--borda);flex-wrap:wrap}
.papel{font-size:12px;font-weight:700;letter-spacing:.04em;background:var(--tema-suave);
color:var(--tema);border-radius:999px;padding:3px 10px}
/* Painel de envio: uma linha por arquivo, com barra de progresso real. */
.envio-item{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;
padding:7px 0;border-bottom:1px solid var(--borda);font-size:14px}
.envio-nome{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.envio-estado{color:var(--suave);font-size:13px}
.envio-barra{grid-column:1/-1;height:5px;border-radius:999px;background:var(--borda);overflow:hidden}
.envio-barra i{display:block;height:100%;background:var(--tema);transition:width 120ms linear}
/* Estados de tela. O esqueleto pulsa devagar de propósito: em rede lenta
   ele fica visível por segundos, e piscar rápido cansa. */
.esqueleto i{display:block;height:15px;border-radius:8px;background:var(--borda);
margin:14px 0;animation:pulso 1.6s ease-in-out infinite}
.esqueleto i:nth-child(2){width:78%}.esqueleto i:nth-child(3){width:56%}
@keyframes pulso{0%,100%{opacity:.35}50%{opacity:.75}}
.vazio{border:1px dashed var(--borda);border-radius:var(--raio);background:var(--card);
padding:26px 22px;margin:18px 0;text-align:center}
.vazio p{margin:0 0 8px}
.vazio p:last-child{margin-bottom:0}
/* Leitura: medida de linha curta e corpo maior. Dossiê, história e memória
   são para LER, não para operar. */
.editorial{max-width:64ch}
.editorial p{font-size:17px;line-height:1.78}
/* Cartões de entrada da tela inicial da família. */
.portas{display:grid;grid-template-columns:repeat(auto-fit,minmax(216px,1fr));gap:14px;margin:18px 0}
.porta{background:var(--card);border:1px solid var(--borda);border-radius:var(--raio);
padding:18px;text-decoration:none;color:var(--tinta);display:block;transition:var(--transicao)}
.porta:hover{box-shadow:var(--sombra);border-color:var(--tema)}
.porta b{display:flex;align-items:center;gap:9px;font-family:Newsreader,Georgia,serif;font-size:18px;margin-bottom:4px}
.porta .ico{color:var(--tema);line-height:0;flex:0 0 auto}
.porta span{color:var(--suave);font-size:14px;line-height:1.45}
.porta .abre{margin-top:10px;display:block;font-size:14px;color:var(--tema);font-weight:600}
.erro{background:#FDECEC;border:1px solid #F5C2C2;color:#8A2020;padding:11px 14px;border-radius:10px;margin:12px 0}
.ok{background:#E9F5EC;border:1px solid #BFE0C8;color:#1F5C33;padding:11px 14px;border-radius:10px;margin:12px 0}
.sub{color:var(--suave);font-size:14px}
/* Grade da galeria. A proporcao fixa evita o salto de layout enquanto
   cada miniatura ainda esta pedindo a propria URL assinada. */
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:16px;margin:20px 0}
/* O navegador não desenha o que está fora da tela; o tamanho reservado
   impede a barra de rolagem de pular quando ele desenha. */
.cel{margin:0;cursor:pointer;content-visibility:auto;contain-intrinsic-size:auto 210px}
.cel .ph{aspect-ratio:1;border-radius:var(--raio-ctrl);background:var(--borda) center/cover no-repeat;
box-shadow:var(--sombra);transition:var(--transicao)}
.cel:hover .ph{transform:translateY(-2px)}
.cel figcaption{font-size:13px;color:var(--suave);margin-top:8px;line-height:1.4}
.cel .ordem{display:inline-flex;gap:6px;align-items:center;margin-top:6px}
.cel .ordem .btn{margin:0;min-width:36px;padding:5px 9px}
.cel .ordem .btn:disabled{opacity:.35}
/* A foto é o assunto da própria página: sem moldura, sobre fundo neutro
   que não some com margem clara de foto antiga. */
.foto{margin:16px 0 0;background:#1C1A17;border-radius:var(--raio);padding:10px;text-align:center}
.foto img{border-radius:8px;max-height:70vh;width:auto}
.foto figcaption{color:#CFC8BC;font-size:14px;padding:10px 6px 4px;text-align:left}
img{max-width:100%;height:auto}
.tl{border-left:2px solid var(--borda);padding-left:18px;margin:14px 0}
.tl-ano{font-family:Newsreader,Lora,Georgia,serif;font-size:17px;margin:20px 0 6px;color:var(--tema)}
.tl-item{display:flex;gap:10px;padding:8px 0;align-items:flex-start}
.tl-ico{flex:0 0 auto}
/* No escuro o tema CLAREIA para ter contraste com o fundo — e aí texto
   branco sobre ele fica ilegível (medido: 2,04:1, contra os 4,5 exigidos).
   O botão preenchido passa a ter tinta escura. */
@media(prefers-color-scheme:dark){.papel{background:var(--tema-suave);color:var(--tema)}
.btn{color:#12201A}.btn.emocional{color:#2A140C}
.erro{background:#3A1E1E;border-color:#5C2C2C;color:#F0B4B4}.ok{background:#1C3324;border-color:#2C5C3A;color:#A8DDB8}
.foto{background:#0F0E0C}}
`;

const CORPO_APP = `
<a class="pular" href="#conteudo">__PULAR__</a>
<div class="wrap" id="app"></div>
<div id="anuncio" class="so-leitor" role="status" aria-live="polite"></div>
<script>const T=__CATALOGO__, IDIOMA=__IDIOMA__;
const API = '/origena/api/v1';
let EU = null, FAM = null, PERM = [];
// Desenhar a tela, reavaliar a barra de baixo (ela vive fora de #app) e
// fazer o que um site de várias páginas faz de graça e um app de uma página
// só precisa fazer à mão: mudar o TÍTULO da aba, ANUNCIAR a tela nova para
// quem usa leitor de tela, e levar o FOCO para o conteúdo — senão o teclado
// continua parado no menu e o leitor não diz que a página mudou.
let NAVEGOU = false;
const $ = (h) => {
  document.getElementById('app').innerHTML = h;
  montarBarra();
  const titulo = document.querySelector('#app h2');
  const nome = titulo ? titulo.textContent.trim() : '';
  document.title = (nome ? nome + ' · ' : '') + t('produto.nome');
  const anuncio = document.getElementById('anuncio');
  if (anuncio && nome) anuncio.textContent = nome;
  // O esqueleto NÃO consome a navegação: mandar o foco para ele e redesenhar
  // logo depois joga o foco de volta ao body, e o teclado fica sem lugar —
  // que é pior do que não ter movido o foco nenhuma vez.
  if (NAVEGOU && !document.querySelector('#app .esqueleto')) {
    NAVEGOU = false;
    const alvo = document.getElementById('conteudo');
    if (alvo) alvo.focus({ preventScroll: true });
  }
};
const esc = (t) => String(t==null?'':t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pode = (p) => PERM.includes(p);
// Toda string da tela vem do catálogo: nenhuma frase mora aqui (§86).
const t = (chave, vars) => { let s = T[chave]; if (s == null) return chave;
  return vars ? String(s).replace(/\\{(\\w+)\\}/g, (m,k) => vars[k]==null?m:vars[k]) : s; };
const dataHora = (v) => new Date(v).toLocaleString(IDIOMA);

async function api(metodo, caminho, corpo) {
  try {
    const r = await fetch(API + caminho, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, ...(j || {}) };
  } catch (_) {
    // Rede caiu: mensagem útil, nunca uma tela em branco (§118).
    return { status: 0, erro: t('erro.generico') };
  }
}
const aviso = (m, tipo) => '<div class="' + (tipo||'erro') + '">' + esc(m || t('erro.generico')) + '</div>';
const papelNome = (p) => t('papel.' + p) || p;

// ------------------------------------------------- os estados de uma tela
// Toda lista termina de cinco jeitos, e o app só desenhava dois: "tem
// conteúdo" e "não tem". ERRO virava lista vazia — foi assim que o Augusto
// achou que tinha perdido sete parentes (11/08/2026) — e SEM PERMISSÃO
// virava vazio também, o que faz o parente novo concluir que a família não
// guardou nada. Aqui cada um tem forma própria e diz o que fazer.
// FALHA DE REDE NÃO É 400. O api() devolve status ZERO quando o fetch nem
// completa (celular sem sinal, wi-fi caindo, servidor fora do ar), e testar
// só por 400 ou mais deixa esse caso passar direto para "lista vazia" — que
// é exatamente o defeito que estes estados existem para matar. Nas telas de
// GRAVAR era pior: sem rede, o app dizia que tinha guardado. Pego no
// navegador, derrubando a rede de propósito; nenhum teste de Node veria.
const deuErro = (r) => !r || r.status === 0 || r.status >= 400;

const carregando = () => '<div class="esqueleto" aria-busy="true"><i></i><i></i><i></i></div>';

const vazio = (titulo, convite, acao) =>
  '<div class="vazio"><p><strong>' + esc(titulo) + '</strong></p>' +
  (convite ? '<p class="sub">' + esc(convite) + '</p>' : '') + (acao || '') + '</div>';

const semPermissao = () => vazio(t('estado.sem_permissao'), t('estado.sem_permissao_p'));

// Status zero é o que o api() devolve quando a rede caiu: mensagem de
// conexão, não de defeito — e sempre com caminho de volta.
const falhou = (r, retomar) => {
  const semRede = (r && r.status === 0) || !navigator.onLine;
  return '<div class="erro"><p style="margin:0 0 6px"><strong>' +
    esc(t(semRede ? 'estado.offline' : 'estado.falhou')) + '</strong></p>' +
  '<p style="margin:0 0 10px;font-size:14px">' +
    esc(semRede ? t('estado.offline_p') : ((r && r.erro) || t('estado.falhou_p'))) + '</p>' +
  (retomar ? '<button class="btn mini claro" onclick="' + retomar + '">' +
    esc(t('estado.tentar')) + '</button>' : '') + '</div>';
};

// Esqueleto imediato enquanto a resposta não chega. Em rede de celular
// lenta, a alternativa é a tela anterior congelada — que parece travada.
const aguarde = (titulo) => $(topo() + voltarFamilia() + '<h2>' + esc(titulo) + '</h2>' + carregando());

// TEMPLATE DE COLEÇÃO: voltar + título + intro + ação + corpo. É o mesmo
// esqueleto de Pessoas, Memórias, Histórias, Tradições, Objetos e
// Entrevistas — antes cada uma montava o seu à mão, e nenhuma igual.
const colecao = (titulo, corpo, opc) => {
  const o = opc || {};
  return topo() + (o.voltar || voltarFamilia()) +
    '<h2>' + esc(titulo) + '</h2>' +
    (o.intro ? '<p class="sub">' + esc(o.intro) + '</p>' : '') +
    (o.filtros || '') + (o.acao || '') + corpo;
};

// A AJUDA MORA NO TOPO, EM TODA TELA. Ela existia e não tinha link em
// lugar nenhum: só chegava quem soubesse o endereço de cor — que é o
// mesmo que não existir.
// Anel concêntrico com uma abertura: camadas de memória e uma história que
// não se fechou. MARCADOR DE LUGAR — a marca definitiva espera o brand book
// do grupo e a busca do INPI (assets\brand\villela-origena\LEIA-ME.md).
const ANEL = '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' +
  '<circle cx="13" cy="13" r="10.2" stroke-dasharray="56 8"></circle>' +
  '<circle cx="13" cy="13" r="6.4" stroke-dasharray="34 6"></circle>' +
  '<circle cx="13" cy="13" r="2.6"></circle></svg>';

// A marca main abre aqui e o navegador fecha sozinha no fim do fragmento: como
// toda tela começa por topo(), isso dá landmark de conteúdo a TODAS elas
// sem tocar em nenhuma. O tabindex negativo existe para o link "pular" e
// para o foco ir ao conteúdo a cada troca de tela.
const topo = () => '<header class="topo">' +
  '<a class="marca" href="#" onclick="' + (EU ? 'inicio()' : 'telaEntrar()') + ';return false">' +
    ANEL + esc(t('produto.nome')) + '</a>' +
  '<span class="topo-dir">' +
  (FAM ? '<a class="familia-atual" href="#" onclick="abrir(FAM.id);return false">' + esc(FAM.nome) + '</a>' : '') +
  (EU ? '<a href="#" onclick="telaConta();return false">' + esc(EU.nome) + '</a>' +
        '<a href="#" onclick="sair();return false">' + esc(t('acao.sair')) + '</a>' : '') +
  '<a href="/origena/ajuda" target="_blank" rel="noopener">' + esc(t('ajuda.titulo')) +
    ' <span class="so-leitor">' + esc(t('acesso.nova_aba')) + '</span></a>' +
  // IDIOMA. Cada língua no PRÓPRIO nome — quem só lê espanhol não acha
  // "Espanhol" escrito em português. O francês fica fora porque o
  // catálogo dele está vazio: oferecer a porta seria cair em português.
  // A troca recarrega a página; o estado da tela vive no endereço.
  '<span class="idiomas">' + ['pt-BR:PT', 'en-US:EN', 'es:ES'].map(function (par) {
    var cod = par.split(':')[0], rot = par.split(':')[1];
    return cod === IDIOMA ? '<strong>' + rot + '</strong>'
      : '<a href="/origena/idioma?l=' + cod + '&para=' + encodeURIComponent('/origena/app' + location.hash) + '">' + rot + '</a>';
  }).join('') + '</span></span>' +
  '</header>' + navPrincipal() + '<main id="conteudo" tabindex="-1">';

// A NAVEGAÇÃO É A MESMA EM TODA TELA. Antes ela existia só na tela da
// família, como uma fileira de ~20 links separados por "·" — para ir de
// Memórias a Histórias era preciso voltar ao começo, e nada dizia que o
// resto existia. Como todas as telas chamam topo(), basta esta função.
const NAV = [
  ['nav.acervo', [
    ['pessoa.titulo', 'pessoas()'], ['familia.memorias', 'memorias()'],
    ['familia.historias', 'telaHistorias()'], ['familia.tradicoes', 'telaTradicoes()'],
    ['familia.reliquias', 'telaReliquias()'], ['entrevista.titulo', 'telaEntrevistas()'],
    ['album.titulo', 'telaAlbuns()'],
  ]],
  ['nav.explorar', [
    ['familia.linha_do_tempo', 'telaTimeline()'], ['mapa.titulo', 'telaMapa()'],
    ['familia.procurar', 'telaBusca()'], ['ia.perguntar_titulo', 'telaPerguntar()'],
  ]],
  ['nav.criar', [
    ['livro.titulo', 'telaLivros()'], ['capsula.titulo', 'telaCapsulas()', 'capsulas.ver'],
  ]],
  ['nav.legado', [
    ['familia.missoes', 'telaMissoes()', 'contribuir'],
    ['historiador.titulo', 'telaHistoriador()', 'contribuir'],
    ['familia.indice_memoria', 'telaIndice()', 'contribuir'],
    ['familia.ver_divergencias', 'divergencias()', 'contribuir'],
    ['guardiao.titulo', 'telaGuardioes()', 'capsulas.ver'],
    ['familia.pessoas', 'abrir(FAM.id)'],
    ['familia.ver_historico', 'auditoria()', 'auditoria.ver'],
    ['lixeira.titulo', 'telaLixeira()', 'restaurar'],
    ['familia.notificacoes', 'telaAvisos()', 'contribuir'],
    ['familia.planos', 'telaPlanos()'],
  ]],
];

function navPrincipal() {
  if (!EU || !FAM) return '';
  // A tela em que se está fica marcada no grupo a que ela pertence — para
  // o leitor de tela ("aria-current") e para quem enxerga (grifo).
  const aqui = location.hash.split('/')[2] || '';
  return '<nav class="nav" aria-label="' + esc(t('acesso.nav_principal')) + '">' + NAV.map(g => {
    const itens = g[1].filter(i => !i[2] || pode(i[2]));
    if (!itens.length) return '';
    const noGrupo = itens.some(i => (TELAS[aqui] || [''])[0] + '()' === i[1]);
    return '<details' + (noGrupo ? ' class="aqui"' : '') + '><summary' +
      (noGrupo ? ' aria-current="true"' : '') + '>' + esc(t(g[0])) + ' ▾</summary><div class="itens">' +
      itens.map(i => {
        const ehAqui = (TELAS[aqui] || [''])[0] + '()' === i[1];
        return '<a href="#"' + (ehAqui ? ' aria-current="page" class="aqui"' : '') +
          ' onclick="' + i[1] + ';return false">' + esc(t(i[0])) + '</a>';
      }).join('') +
      '</div></details>';
  }).join('') + '</nav>';
}

// ÍCONES PRÓPRIOS, não emoji. Emoji muda de desenho em cada aparelho — o
// mesmo app fica com outra cara no iPhone, no Android e no computador, e
// nenhum deles combina com o resto da tela. Estes são traçados no mesmo
// peso do anel da marca e herdam a cor do link (currentColor), então
// acendem junto com o item ativo.
const ico = (d) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true" ' +
  'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICONES = {
  casa: ico('<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.5V19h11v-8.5"/><path d="M10 19v-4.5h4V19"/>'),
  foto: ico('<rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2.4"/><circle cx="9" cy="10" r="1.6"/>' +
    '<path d="M4 16.5l4.2-3.6 3.4 2.7 3-2.4 5.4 4.2"/>'),
  mais: ico('<circle cx="12" cy="12" r="8.4"/><path d="M12 8.4v7.2M8.4 12h7.2"/>'),
  bussola: ico('<circle cx="12" cy="12" r="8.4"/><path d="M14.8 9.2 13.4 13.4 9.2 14.8l1.4-4.2z"/>'),
  familia: ico('<circle cx="8.6" cy="9" r="2.6"/><circle cx="16" cy="9.6" r="2"/>' +
    '<path d="M3.8 18.4c0-2.6 2.1-4.4 4.8-4.4s4.8 1.8 4.8 4.4"/><path d="M15 14.2c2.4 0 4.2 1.6 4.2 3.9"/>'),
  livro: ico('<path d="M4 5.4h5.6c1.4 0 2.4.9 2.4 2v11c0-1-1-1.8-2.4-1.8H4z"/>' +
    '<path d="M20 5.4h-5.6c-1.4 0-2.4.9-2.4 2v11c0-1 1-1.8 2.4-1.8H20z"/>'),
  microfone: ico('<rect x="9.4" y="3.4" width="5.2" height="10.4" rx="2.6"/>' +
    '<path d="M6 11.6a6 6 0 0 0 12 0"/><path d="M12 17.6V20.4"/>'),
  panela: ico('<path d="M4.6 10h14.8v3.4a5.4 5.4 0 0 1-5.4 5.4h-4a5.4 5.4 0 0 1-5.4-5.4z"/>' +
    '<path d="M3 10h18"/><path d="M9 6.6c0-1 1.2-1.4 1.2-2.6"/><path d="M14 6.6c0-1 1.2-1.4 1.2-2.6"/>'),
  objeto: ico('<path d="M12 3.6 20 8v8L12 20.4 4 16V8z"/><path d="M4 8l8 4.4L20 8"/><path d="M12 12.4v8"/>'),
};

// Barra de baixo do celular. Mora FORA de #app justamente para não ser
// varrida a cada redesenho — é o único pedaço de tela que persiste.
const BARRA = [
  ['casa', 'nav.inicio', 'inicio()', 'inicio'],
  ['foto', 'familia.memorias', 'memorias()', 'memorias'],
  ['mais', 'nav.adicionar', 'telaAdicionar()', 'adicionar'],
  ['bussola', 'nav.explorar', 'telaBusca()', 'busca'],
  ['familia', 'nav.familia', 'abrir(FAM.id)', 'familia'],
];
function montarBarra() {
  let b = document.getElementById('barra');
  if (!b) {
    b = document.createElement('nav');
    b.id = 'barra'; b.className = 'barra';
    document.body.appendChild(b);
  }
  if (!EU || !FAM) { b.className = 'barra'; b.innerHTML = ''; return; }
  b.className = 'barra ver';
  // "aria-current" marca onde se está: sem isso, o leitor de tela lê cinco
  // links iguais e quem enxerga depende só de uma diferença de cor.
  const aqui = (location.hash.split('/')[2] || 'inicio');
  b.innerHTML = BARRA.map(i => {
    const ativo = i[3] === aqui;
    return '<a href="#" class="' + (ativo ? 'ativo' : '') + '"' +
      (ativo ? ' aria-current="page"' : '') + ' onclick="' + i[2] + ';return false">' +
      ICONES[i[0]] + esc(t(i[1])) + '</a>';
  }).join('');
}

// ------------------------------------------------------------------ entrar
function telaEntrar(msg, tipo) {
  $(topo() + '<h2>' + esc(t('conta.entrar_titulo')) + '</h2>' + (msg ? aviso(msg, tipo) : '') +
    '<label for="e">' + esc(t('campo.email')) + '</label><input id="e" type="email" autocomplete="email">' +
    '<label for="s">' + esc(t('campo.senha')) + '</label><input id="s" type="password" autocomplete="current-password">' +
    '<div id="mfa" style="display:none"><label for="c">' + esc(t('campo.codigo')) + '</label>' +
      '<input id="c" inputmode="numeric" autocomplete="one-time-code" placeholder="000000"></div>' +
    '<button class="btn" onclick="entrar()">' + esc(t('acao.entrar')) + '</button>' +
    '<p class="sub" style="margin-top:20px">' + esc(t('conta.sem_conta')) +
      ' <a href="#" onclick="telaCadastrar();return false">' + esc(t('acao.criar_conta')) + '</a></p>');
}
async function entrar() {
  const r = await api('POST', '/conta/entrar', {
    email: document.getElementById('e').value, senha: document.getElementById('s').value,
    codigo: (document.getElementById('c')||{}).value });
  if (r.mfa_necessario && r.status === 200) { document.getElementById('mfa').style.display = 'block'; return; }
  if (r.status !== 200) return telaEntrar(r.erro || t('erro.nao_entrei'));
  // Volta para o endereço que a pessoa pediu antes de entrar — inclusive o
  // convite que veio por e-mail, que antes se perdia no login.
  rotaDoHash();
}
function telaCadastrar(msg) {
  $(topo() + '<h2>' + esc(t('conta.criar_titulo')) + '</h2>' + (msg ? aviso(msg) : '') +
    '<label for="n">' + esc(t('campo.seu_nome')) + '</label><input id="n">' +
    '<label for="e">' + esc(t('campo.email')) + '</label><input id="e" type="email">' +
    '<label for="s">' + esc(t('campo.senha')) + '</label><input id="s" type="password" autocomplete="new-password">' +
    '<p class="sub"><label style="display:inline"><input type="checkbox" id="t" style="width:auto"> ' +
      esc(t('campo.aceito_termos')) + '</label></p>' +
    '<button class="btn" onclick="cadastrar()">' + esc(t('acao.criar_conta')) + '</button>' +
    '<p class="sub" style="margin-top:20px"><a href="#" onclick="telaEntrar();return false">' +
      esc(t('acao.ja_tenho_conta')) + '</a></p>');
}
async function cadastrar() {
  const r = await api('POST', '/conta/cadastrar', {
    nome: document.getElementById('n').value, email: document.getElementById('e').value,
    senha: document.getElementById('s').value, aceito_termos: document.getElementById('t').checked });
  if (deuErro(r)) return telaCadastrar(r.erro);
  $(topo() + '<h2>' + esc(t('conta.confirme_titulo')) + '</h2>' + aviso(r.mensagem, 'ok') +
    '<p class="sub">' + esc(t('conta.confirme_p')) + '</p>');
}
const sair = async () => {
  await api('POST', '/conta/sair');
  EU = null; FAM = null; PERM = [];
  history.replaceState(null, '', '/origena/app');   // o endereço não sobrevive à saída
  telaEntrar();
};

// ------------------------------------------------------------- sua conta
// A ÁREA DE CONTA EXISTIA SÓ NO MOTOR. As rotas de MFA estavam prontas e
// testadas desde o 1.0 e não havia tela nenhuma: o nome no topo era texto.
// Como convidar exige MFA (428), o dono da família travava na primeira
// coisa que queria fazer — chamar a família. Recurso pronto no motor sem
// porta na tela é recurso que não existe.
async function telaConta(msg, tipo) {
  const eu = await api('GET', '/conta/eu');
  if (eu.status !== 200) return telaEntrar();
  EU = eu.usuario;
  const ativa = !!EU.mfa_ativo;
  $(topo() + '<p class="sub"><a href="#" onclick="inicio();return false">' + esc(t('acao.voltar_familias')) + '</a></p>' +
    '<h2>' + esc(t('conta.titulo')) + '</h2>' +
    (msg ? aviso(msg, tipo || 'ok') : '') +
    '<div class="linha"><span><strong>' + esc(EU.nome) + '</strong><br><span class="sub">' + esc(EU.email) + '</span></span>' +
      '<span class="papel">' + esc(t(ativa ? 'conta.mfa_selo_on' : 'conta.mfa_selo_off')) + '</span></div>' +
    '<h3 style="margin-top:26px">' + esc(t('conta.seguranca')) + '</h3>' +
    (eu.mfa_disponivel === false
      ? '<p class="sub">' + esc(t('erro.mfa_indisponivel')) + '</p>'
      : '<p>' + esc(t(ativa ? 'conta.mfa_ativa' : 'conta.mfa_inativa')) + '</p>' +
        '<p><button class="btn' + (ativa ? ' claro' : '') + '" onclick="' + (ativa ? 'mfaDesligar' : 'mfaIniciar') + '()">' +
          esc(t(ativa ? 'acao.desativar_mfa' : 'acao.ativar_mfa')) + '</button></p>') +
    '<h3 style="margin-top:26px">' + esc(t('conta.sessoes_titulo')) + '</h3>' +
    '<p class="sub">' + esc(t('conta.sessoes_p')) + '</p>' +
    '<p><button class="btn sec" onclick="sairDeTodos()">' + esc(t('acao.sair_de_todos')) + '</button></p>');
}

async function mfaIniciar() {
  const r = await api('POST', '/conta/mfa/iniciar');
  if (deuErro(r)) return telaConta(r.erro, 'erro');
  // O QR vem desenhado do servidor; se não vier, o segredo digitado à mão
  // resolve — nenhum dos dois caminhos depende de rede de fora.
  $(topo() + '<p class="sub"><a href="#" onclick="telaConta();return false">← ' + esc(t('conta.titulo')) + '</a></p>' +
    '<h2>' + esc(t('conta.mfa_ligar_titulo')) + '</h2>' +
    '<p>' + esc(t('conta.mfa_passo1')) + '</p>' +
    (r.qr_svg ? '<div style="max-width:220px;background:#fff;padding:10px;border-radius:12px;margin:14px 0">' + r.qr_svg + '</div>' : '') +
    '<p class="sub">' + esc(t('conta.mfa_passo2')) + '</p>' +
    '<p style="font-family:ui-monospace,Menlo,monospace;font-size:18px;word-break:break-all">' + esc(r.segredo) + '</p>' +
    '<label for="mfc">' + esc(t('conta.mfa_passo3')) + '</label>' +
    '<input id="mfc" inputmode="numeric" autocomplete="one-time-code" placeholder="000000">' +
    '<p><button class="btn" onclick="mfaConfirmar()">' + esc(t('acao.confirmar')) + '</button></p>');
}

async function mfaConfirmar() {
  const r = await api('POST', '/conta/mfa/confirmar', { codigo: val('mfc') });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  // Os códigos de backup aparecem UMA vez: o banco guarda só o hash. Por
  // isso esta tela não tem "voltar" — tem "guardei".
  $(topo() + '<h2>' + esc(t('conta.mfa_backup_titulo')) + '</h2>' +
    '<p>' + esc(t('conta.mfa_backup_p')) + '</p>' +
    '<p style="font-family:ui-monospace,Menlo,monospace;font-size:18px;line-height:2.1">' +
      (r.codigos_backup || []).map(esc).join('<br>') + '</p>' +
    '<p><button class="btn" onclick="telaConta(t(\\'conta.mfa_ligada\\'))">' +
      esc(t('acao.guardei_codigos')) + '</button></p>');
}

async function mfaDesligar() {
  if (!confirm(t('conta.mfa_confirmar_desligar'))) return;
  const senha = prompt(t('conta.mfa_desligar_p'));
  if (!senha) return;
  const r = await api('POST', '/conta/mfa/desativar', { senha });
  if (deuErro(r)) return telaConta(r.erro, 'erro');
  telaConta(t('conta.mfa_desligada'));
}

async function sairDeTodos() {
  if (!confirm(t('conta.sessoes_confirmar'))) return;
  await api('POST', '/conta/sair-de-todos');
  EU = null; FAM = null; PERM = [];
  history.replaceState(null, '', '/origena/app');
  telaEntrar(t('conta.sessoes_encerradas'), 'ok');
}

// ------------------------------------------------------------------ famílias
async function inicio() {
  const eu = await api('GET', '/conta/eu');
  if (eu.status !== 200) return telaEntrar();
  EU = eu.usuario;
  const fams = eu.familias || [];
  $(topo() + '<h2>' + esc(t('familia.minhas')) + '</h2>' +
    (fams.length ? fams.map(f =>
      '<div class="linha"><span><strong>' + esc(f.nome) + '</strong> <span class="papel">' + esc(papelNome(f.papel)) + '</span></span>' +
      '<button class="btn mini" onclick="abrir(\\'' + f.id + '\\')">' + esc(t('acao.abrir')) + '</button></div>').join('')
      : vazio(t('familia.nenhuma'), t('familia.nenhuma_p'))) +
    '<h3 style="margin-top:28px">' + esc(t('familia.criar_titulo')) + '</h3>' +
    '<label for="nf">' + esc(t('campo.nome_familia')) + '</label>' +
    '<input id="nf" placeholder="' + esc(t('familia.placeholder_nome')) + '">' +
    '<button class="btn" onclick="criarFamilia()">' + esc(t('acao.criar')) + '</button>');
}
async function criarFamilia() {
  const r = await api('POST', '/familias', { nome: document.getElementById('nf').value });
  if (deuErro(r)) { $(document.getElementById('app').innerHTML + aviso(r.erro)); return; }
  abrir(r.familia.id);
}

async function abrir(id) {
  const f = await api('GET', '/familias/' + id);
  if (f.status !== 200) return inicio();
  FAM = f.familia; PERM = f.permissoes || [];
  const m = await api('GET', '/familias/' + id + '/membros');
  const convites = pode('membros.convidar') ? await api('GET', '/familias/' + id + '/convites') : { convites: [] };
  const papeisConvidaveis = ['CONTRIBUTOR','FAMILY_MEMBER','EDITOR','HISTORIAN','ADMIN','GUEST'];
  // AS QUATRO PORTAS. A tela da família era uma fileira de ~20 links
  // separados por "·" — tudo no mesmo peso, nada dizendo o que fazer
  // primeiro. Agora cada seção se apresenta, e a lista completa continua
  // a um clique no menu do topo.
  const portas = [
    ['nav.acervo', 'nav.acervo_d', 'memorias()'],
    ['nav.explorar', 'nav.explorar_d', 'telaTimeline()'],
    ['nav.criar', 'nav.criar_d', 'telaLivros()'],
    ['nav.legado', 'nav.legado_d', pode('contribuir') ? 'telaMissoes()' : 'telaGuardioes()'],
  ];
  $(topo() + '<p class="sub"><a href="#" onclick="inicio();return false">' + esc(t('acao.voltar_familias')) + '</a></p>' +
    '<h2>' + esc(FAM.nome) + '</h2><p class="sub">' + t('familia.voce_e', { papel: esc(papelNome(f.papel)) }) + '</p>' +
    '<div class="portas">' + portas.map(p =>
      '<a class="porta" href="#" onclick="' + p[2] + ';return false"><b>' + esc(t(p[0])) + '</b>' +
      '<span>' + esc(t(p[1])) + '</span><span class="abre">' + esc(t('nav.entrar')) + '</span></a>').join('') +
    '</div>' +
    '<h3 style="margin-top:26px">' + esc(t('familia.pessoas')) + '</h3>' +
    (m.membros || []).map(x =>
      '<div class="linha"><span>' + esc(x.nome) + (x.email ? ' <span class="sub">' + esc(x.email) + '</span>' : '') +
      ' <span class="papel">' + esc(papelNome(x.papel)) + '</span></span>' +
      (pode('membros.gerenciar') && x.papel !== 'OWNER'
        ? '<button class="btn mini claro" onclick="remover(\\'' + x.user_id + '\\')">' + esc(t('acao.remover')) + '</button>' : '') +
      '</div>').join('') +
    (pode('membros.convidar')
      ? '<h3 style="margin-top:26px">' + esc(t('familia.convidar_titulo')) + '</h3>' +
        // O 428 chegava DEPOIS do clique, e sem dizer para onde ir. O aviso
        // vem antes, com o link — quem administra descobre a trava lendo, e
        // não tentando.
        (EU && !EU.mfa_ativo
          ? '<div class="erro">' + esc(t('mfa.exigido_convite')) +
            ' <a href="#" onclick="telaConta();return false">' + esc(t('acao.ativar_agora')) + '</a></div>'
          : '') +
        '<label for="ce">' + esc(t('campo.email')) + '</label><input id="ce" type="email">' +
        '<label for="cp">' + esc(t('campo.papel')) + '</label><select id="cp">' +
        papeisConvidaveis.map(p => '<option value="' + p + '">' + esc(t('papel.desc_' + p)) + '</option>').join('') +
        '</select>' +
        '<button class="btn" onclick="convidar()">' + esc(t('acao.enviar_convite')) + '</button>' +
        ((convites.convites || []).filter(c => !c.aceito_em && !c.revogado_em).map(c =>
          '<div class="linha"><span class="sub">' + esc(c.email) + ' · ' + esc(papelNome(c.papel)) +
          ' · ' + esc(t('familia.aguardando')) + '</span></div>').join(''))
      : '') +
    (pode('contribuir')
      ? '<p style="margin-top:26px"><button class="btn emocional" onclick="telaAdicionar()">' +
        esc(t('nav.adicionar_algo')) + '</button></p>' : ''));
}
async function convidar() {
  const r = await api('POST', '/familias/' + FAM.id + '/convites',
    { email: document.getElementById('ce').value, papel: document.getElementById('cp').value });
  if (r.status === 428) {
    return $(document.getElementById('app').innerHTML +
      '<div class="erro">' + esc(t('mfa.exigido_convite')) +
      ' <a href="#" onclick="telaConta();return false">' + esc(t('acao.ativar_agora')) + '</a></div>');
  }
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  abrir(FAM.id);
}
async function remover(userId) {
  if (!confirm(t('familia.confirmar_remocao'))) return;
  const r = await api('DELETE', '/familias/' + FAM.id + '/membros/' + userId);
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  abrir(FAM.id);
}
// "Adicionar" existia espalhado: cada formulário morava no fim da lista do
// próprio tipo, e quem chegava com uma foto na mão precisava adivinhar por
// onde começar. Esta tela é uma porta só, que leva a cada caminho.
function telaAdicionar() {
  // Os mesmos traços da barra do celular, não emoji: o desenho de "foto" e
  // de "pessoa" tem que ser o mesmo aqui e lá embaixo.
  const tipos = [
    ['foto', 'midia.enviar', 'nav.add_memoria_d', 'memorias()', 'contribuir'],
    ['familia', 'pessoa.nova', 'nav.add_pessoa_d', 'pessoas()', 'pessoas.criar'],
    ['livro', 'familia.historias', 'nav.add_historia_d', 'telaHistorias()', 'contribuir'],
    ['microfone', 'entrevista.nova', 'nav.add_entrevista_d', 'telaEntrevistas()', 'contribuir'],
    ['panela', 'tradicao.nova', 'nav.add_tradicao_d', 'telaTradicoes()', 'contribuir'],
    ['objeto', 'reliquia.nova', 'nav.add_reliquia_d', 'telaReliquias()', 'contribuir'],
  ].filter(x => pode(x[4]));
  $(colecao(t('nav.adicionar_titulo'),
    '<div class="portas">' + tipos.map(x =>
      '<a class="porta" href="#" onclick="' + x[3] + ';return false">' +
      '<b><span class="ico">' + (ICONES[x[0]] || '') + '</span> ' + esc(t(x[1])) + '</b>' +
      '<span>' + esc(t(x[2])) + '</span></a>').join('') +
    '</div>',
    { intro: t('nav.adicionar_intro') }));
}

async function auditoria() {
  if (!pode('auditoria.ver')) return $(colecao(t('familia.historico_titulo'), semPermissao()));
  aguarde(t('familia.historico_titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/auditoria');
  if (deuErro(r)) return $(colecao(t('familia.historico_titulo'), falhou(r, 'auditoria()')));
  $(colecao(t('familia.historico_titulo'),
    (r.eventos || []).length
      ? (r.eventos || []).map(e => '<div class="linha"><span>' + esc(t('auditoria.' + e.acao) || e.acao) +
          '<br><span class="sub">' + esc(e.ator_nome || t('auditoria.sistema')) + ' · ' +
          dataHora(e.created_at) + '</span></span></div>').join('')
      : vazio(t('familia.historico_vazio'), t('familia.historico_vazio_p'))));
}

// ------------------------------------------------------------------ pessoas
const anos = (p) => {
  const a = p.nascimento_valor || '?', b = p.falecimento_valor;
  return b ? a + ' – ' + b : (p.vitalidade === 'falecida' ? a + ' – ?' : a);
};

// Corrigir a ficha de alguém. Só manda o que MUDOU: o servidor usa
// COALESCE, então campo vazio significaria "apaga" se fosse enviado.
async function editarPessoa(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id);
  if (deuErro(r)) return alert(r.erro);
  const p = r.pessoa;
  const corpo = {};
  const nome = prompt(t('pessoa.nome'), p.nome_exibicao || '');
  if (nome === null) return;
  if (nome && nome !== p.nome_exibicao) corpo.nome_exibicao = nome;
  const nasc = prompt(t('pessoa.nascimento'), p.nascimento_valor || '');
  if (nasc !== null && nasc !== (p.nascimento_valor || '')) corpo.nascimento = nasc;
  const local = prompt(t('pessoa.local_nascimento'), p.local_nascimento || '');
  if (local !== null && local !== (p.local_nascimento || '')) corpo.local_nascimento = local;
  if (confirm(t('pessoa.menor_explica'))) corpo.eh_menor = true;

  if (!Object.keys(corpo).length) return;
  const s = await api('PATCH', '/familias/' + FAM.id + '/pessoas/' + id, corpo);
  if (deuErro(s)) return alert(s.erro);
  alert(corpo.eh_menor ? t('pessoa.menor_ligado') : t('pessoa.salvo'));
  dossie(id);
}

// Arquivar é SOFT DELETE (§66): some da lista e da árvore, continua no
// banco e na Lixeira. O texto do aviso diz isso — quem clica precisa
// saber que não está apagando o que a pessoa contribuiu.
async function arquivarPessoa(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id);
  if (deuErro(r)) return alert(r.erro);
  if (!confirm(t('pessoa.arquivar_confirmar', { nome: r.pessoa.nome_exibicao }))) return;
  const d = await api('DELETE', '/familias/' + FAM.id + '/pessoas/' + id);
  if (deuErro(d)) return alert(d.erro);
  alert(t('pessoa.arquivada'));
  pessoas();
}

async function pessoas() {
  aguarde(t('pessoa.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/pessoas');
  // ERRO NÃO PODE PARECER LISTA VAZIA. Sem esta checagem, uma falha na
  // requisição caía no mesmo texto de "nenhuma pessoa ainda" — e quem
  // tinha sete parentes cadastrados via a família em branco e concluía
  // que o acervo havia sido apagado. Aconteceu (11/08/2026).
  if (deuErro(r)) return $(colecao(t('pessoa.titulo'), falhou(r, 'pessoas()')));
  $(colecao(t('pessoa.titulo'),
    (r.ocultas ? '<p class="sub">' + esc(t('pessoa.ocultas', { n: r.ocultas })) + '</p>' : '') +
    ((r.pessoas || []).length
      ? (r.pessoas || []).map(p =>
          '<div class="linha"><span><a href="#" onclick="dossie(\\'' + p.id + '\\');return false"><strong>' +
          esc(p.nome_exibicao) + '</strong></a> <span class="sub">' + esc(anos(p)) + '</span>' +
          (p.eh_menor ? ' <span class="papel">' + esc(t('pessoa.eh_menor')) + '</span>' : '') + '</span>' +
          '<button class="btn mini claro" onclick="verArvore(\\'' + p.id + '\\')">' + esc(t('familia.arvore')) + '</button></div>').join('')
      : vazio(t('pessoa.sem_pessoas'), t('pessoa.sem_pessoas_p'))) +
    (pode('pessoas.criar') ? formPessoa() : semPermissaoParaCriar())));
}

// Quem não pode acrescentar precisa saber POR QUE o formulário não está
// ali — senão a tela parece quebrada, e a pessoa acha que o sistema é que
// não deixa ninguém contribuir.
const semPermissaoParaCriar = () =>
  '<p class="sub" style="margin-top:22px">' + esc(t('estado.so_leitura')) + '</p>';

const formPessoa = () =>
  '<h3 style="margin-top:28px">' + esc(t('pessoa.nova')) + '</h3>' +
  '<label for="pn">' + esc(t('pessoa.nome')) + '</label><input id="pn">' +
  '<label for="pnasc">' + esc(t('pessoa.nascimento')) + '</label><input id="pnasc" placeholder="1921">' +
  '<label for="pfal">' + esc(t('pessoa.falecimento')) + '</label><input id="pfal">' +
  '<p class="sub">' + esc(t('pessoa.ajuda_data')) + '</p>' +
  '<label style="font-weight:400"><input type="checkbox" id="pmenor" style="width:auto"> ' +
    esc(t('pessoa.eh_menor')) + '</label>' +
  '<p><button class="btn" onclick="criarPessoa()">' + esc(t('acao.criar')) + '</button></p>';

async function criarPessoa() {
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas', {
    nome: document.getElementById('pn').value,
    nascimento: document.getElementById('pnasc').value,
    falecimento: document.getElementById('pfal').value,
    eh_menor: document.getElementById('pmenor').checked });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  pessoas();
}

async function dossie(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id);
  if (deuErro(r)) return $(colecao(t('pessoa.titulo'), falhou(r, 'pessoas()')));
  const p = r.pessoa, f = r.familia;
  const fatos = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id + '/fatos');
  const contribs = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id + '/contribuicoes');
  const bio = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id + '/biografia');
  r.biografia_html = '';
  if (bio.biografia) {
    // A biografia é o texto mais longo do dossiê: entra em leitura
    // editorial, não em cartão de lista.
    r.biografia_html = '<h3 style="margin-top:26px">' + esc(t('ia.biografia_titulo')) + '</h3>' +
      '<div class="editorial"><p style="white-space:pre-wrap">' + esc(bio.biografia.corpo) + '</p></div>' +
      '<p class="sub">' + esc(t('ia.selo_ia')) + ' · ' +
      esc(t('ia.gerada_em', { data: new Date(bio.biografia.created_at).toLocaleDateString(IDIOMA),
        n: (bio.biografia.fontes || []).length })) +
      (bio.biografia.contribuicoes_desde
        ? '<br>' + esc(t('ia.contribuicoes_desde', { n: bio.biografia.contribuicoes_desde })) : '') + '</p>' +
      (pode('ia.usar') ? '<p><button class="btn mini claro" onclick="gerarBiografia(\\'' + id + '\\')">' +
        esc(t('ia.atualizar_biografia')) + '</button></p>' : '');
  } else if (pode('ia.usar')) {
    r.biografia_html = '<p style="margin-top:20px"><button class="btn mini claro" ' +
      'onclick="gerarBiografia(\\'' + id + '\\')">' + esc(t('ia.gerar_biografia')) + '</button></p>';
  }
  // O que já se preservou desta pessoa e — o que importa — o que falta.
  // Sem comparação com ninguém: é o retrato dela, não um placar (§31).
  const idx = await api('GET', '/familias/' + FAM.id + '/pessoas/' + id + '/indice-memoria');
  r.indice_html = idx.indice
    ? '<h3 style="margin-top:26px">' + esc(t('indice.titulo')) + '</h3>' +
      '<p>' + barra(idx.indice.score) + ' <span class="sub">' +
        esc(t('indice.score', { n: idx.indice.score })) + '</span></p>' +
      '<p class="sub">' + ((idx.indice.lacunas || []).length
        ? esc(t('indice.falta')) + ': ' + idx.indice.lacunas.map(l => esc(t('indice.dim_' + l))).join(', ')
        : esc(t('indice.nada_falta'))) + '</p>' +
      ((idx.quem_sabe || []).length
        ? '<p class="sub"><strong>' + esc(t('indice.quem_sabe')) + ':</strong> ' +
          idx.quem_sabe.map(q => esc(q.nome)).join(', ') + '<br>' +
          esc(t('indice.quem_sabe_intro')) + '</p>'
        : '')
    : '';
  const grupo = (titulo, lista, extra) => lista.length
    ? '<h3 style="margin-top:22px">' + esc(titulo) + '</h3>' + lista.map(x =>
        '<div class="linha"><span><a href="#" onclick="dossie(\\'' + x.id + '\\');return false">' +
        esc(x.nome_exibicao) + '</a> <span class="sub">' + esc(anos(x)) + '</span>' +
        (extra ? extra(x) : '') + '</span></div>').join('')
    : '';
  // Vinculo errado precisa ter saida pela tela: sem isto, quem registrou
  // o lado trocado ficava com o pai listado como filho e nada a fazer.
  // Irmao DERIVADO nao tem aresta propria (rel_id nulo) — desfaz-se
  // desligando o ascendente comum.
  const desfazer = (x) => pode('parentesco.editar') && x.rel_id
    ? ' <button class="btn mini claro" onclick="desligar(\\'' + x.rel_id + '\\',\\'' + p.id +
      '\\')">' + esc(t('familia.desligar')) + '</button>' : '';
  const selo = (x) => (x.natureza && x.natureza !== 'biologico'
      ? ' <span class="papel">' + esc(t('parentesco.' + x.natureza)) + '</span>' : '')
    + (x.meio ? ' <span class="papel">' + esc(t('familia.meio_irmao')) + '</span>' : '')
    + desfazer(x);

  // FICHA EDITORIAL: o nome grande, a vida em uma linha, e as ações logo
  // abaixo — em vez de quatro botões primários disputando a atenção com o
  // nome da pessoa.
  $(topo() + '<p class="sub"><a href="#" onclick="pessoas();return false">← ' + esc(t('pessoa.titulo')) + '</a></p>' +
    '<h2 style="font-size:clamp(26px,5vw,34px);margin:0 0 6px">' + esc(p.nome_exibicao) + '</h2>' +
    '<p class="sub" style="margin:0">' + esc(anos(p)) + (p.local_nascimento ? ' · ' + esc(p.local_nascimento) : '') +
      (p.profissao ? ' · ' + esc(p.profissao) : '') +
      (p.eh_menor ? ' · <span class="papel">' + esc(t('pessoa.eh_menor')) + '</span>' : '') + '</p>' +
    '<div class="acoes"><button class="btn mini sec" onclick="verArvore(\\'' + p.id + '\\')">' + esc(t('familia.ver_arvore')) + '</button>' +
      '<button class="btn mini sec" onclick="telaGrafo(\\'person\\',\\'' + p.id + '\\')">' +
      esc(t('grafo.titulo')) + '</button>' +
      // EDITAR E ARQUIVAR existiam na API e não existiam na TELA: quem
      // errava um nome ou esquecia de marcar o filho como menor não tinha
      // caminho nenhum. Recurso sem porta é recurso que não existe.
      (pode('pessoas.editar')
        ? '<button class="btn mini sec" onclick="editarPessoa(\\'' + p.id + '\\')">' +
          esc(t('acao.editar')) + '</button>' : '') +
      (pode('excluir')
        ? '<button class="btn mini sec" onclick="arquivarPessoa(\\'' + p.id + '\\')">' +
          esc(t('pessoa.arquivar')) + '</button>' : '') +
      '</div>' +
    grupo(t('familia.pais'), f.pais, selo) +
    grupo(t('familia.unioes'), f.unioes, selo) +
    grupo(t('familia.irmaos'), f.irmaos, selo) +
    grupo(t('familia.filhos'), f.filhos, selo) +
    (f.pais.length + f.filhos.length + f.unioes.length + f.irmaos.length === 0
      ? vazio(t('familia.sem_parentes'), t('familia.sem_parentes_p')) : '') +

    // Biografia viva (§18): versão atual + selo de IA + quantas
    // contribuições chegaram desde que ela foi escrita.
    (r.biografia_html || '') +
    (r.indice_html || '') +
    // O que sabemos — cada fato com o selo e o caminho de volta (§5).
    '<h3 style="margin-top:26px">' + esc(t('fato.titulo')) + '</h3>' +
    ((fatos.fatos || []).length
      ? (fatos.fatos || []).map(x => linhaFato(x, p.id)).join('')
      : vazio(t('fato.sem_fatos'), t('fato.sem_fatos_p'))) +
    (pode('claims.criar') ? formFato(p.id) : '') +

    // O que a família contou — cru, com autor e data, nunca apagado (§15).
    '<h3 style="margin-top:26px">' + esc(t('contribuicao.titulo')) + '</h3>' +
    ((contribs.contribuicoes || []).length
      ? (contribs.contribuicoes || []).map(c =>
          '<div class="card" style="padding:16px' + (c.status === 'revisada' ? ';opacity:.65' : '') + '">' +
            '<p style="margin:0 0 6px">' + esc(c.corpo) + '</p>' +
            '<p class="sub" style="margin:0">' + esc(t('contribuicao.por')) + ' <strong>' +
              esc(c.autor_nome || t('auditoria.sistema')) + '</strong> · ' +
              esc(new Date(c.created_at).toLocaleDateString(IDIOMA)) +
              (c.status === 'revisada' ? ' · ' + esc(t('contribuicao.revisada')) : '') + '</p>' +
          '</div>').join('')
      : vazio(t('contribuicao.sem_contribuicoes'), t('contribuicao.sem_contribuicoes_p'))) +
    (pode('contribuir')
      ? '<label for="cc">' + esc(t('contribuicao.nova')) + '</label>' +
    '<input id="cc" placeholder="' + esc(t('contribuicao.placeholder')) + '">' +
        '<p><button class="btn" onclick="contar(\\'' + p.id + '\\')">' + esc(t('acao.salvar')) + '</button></p>'
      : '') +

    (pode('parentesco.editar') ? formParentesco(p.id) : ''));
  if (pode('parentesco.editar')) preencherPessoas(p.id);
}

// Filiacao e UMA aresta lida dos dois lados. Sem o lado de ca so da para
// registrar o filho a partir da ficha do pai — e quem esta na propria
// ficha acaba virando pai de quem queria chamar de filho. Mandamos o
// verbo escolhido como veio; quem normaliza a aresta e o servidor.
function formParentesco(id) {
  // Sem <script> no innerHTML: navegador nenhum executa script inserido
  // assim. O select e preenchido depois, por preencherPessoas().
  const opcoes = (chaves) => chaves.map(x =>
    '<option value="' + x + '">' + esc(t('parentesco.' + x)) + '</option>').join('');
  return '<h3 style="margin-top:26px">' + esc(t('familia.ligar')) + '</h3>' +
    '<label for="rt">' + esc(t('parentesco.tipo')) + '</label><select id="rt">' +
      opcoes(['PARENT_OF','CHILD_OF','SPOUSE_OF','PARTNER_OF','SIBLING_OF',
        'GUARDIAN_OF','WARD_OF']) + '</select>' +
    '<label for="rn">' + esc(t('parentesco.natureza')) + '</label><select id="rn">' +
      opcoes(['biologico','adotivo','socioafetivo','enteado','desconhecido']) + '</select>' +
    '<label for="rp">' + esc(t('parentesco.pessoa')) + '</label><select id="rp"></select>' +
    '<p><button class="btn" onclick="ligar(\\'' + id + '\\')">' + esc(t('familia.ligar')) + '</button></p>';
}

async function preencherPessoas(exceto) {
  const sel = document.getElementById('rp');
  if (!sel) return;
  const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
  sel.innerHTML = (l.pessoas || []).filter(x => x.id !== exceto)
    .map(x => '<option value="' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
}

async function ligar(id, confirmando) {
  const alvo = document.getElementById('rp').value;
  // person_a e sempre quem esta na tela: a frase e "esta pessoa e <tipo>
  // de <alvo>". Em "filho(a) de" o servidor inverte para guardar a
  // aresta canonica, com o ascendente em person_a.
  const corpo = { person_a: id, person_b: alvo, tipo: document.getElementById('rt').value,
    natureza: document.getElementById('rn').value, confirmo_mesmo_assim: !!confirmando };
  const r = await api('POST', '/familias/' + FAM.id + '/parentescos', corpo);
  // 422 = aviso de sanidade: a família tem a última palavra sobre a
  // própria história, então perguntamos em vez de barrar.
  if (r.status === 422) {
    if (confirm(r.erro + '\\n\\n' + t('parentesco.confirmo'))) return ligar(id, true);
    return;
  }
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  dossie(id);
}

async function desligar(relId, pessoaId) {
  if (!confirm(t('familia.confirmar_desligar'))) return;
  const r = await api('DELETE', '/familias/' + FAM.id + '/parentescos/' + relId);
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  dossie(pessoaId);
}

/** A fila do historiador: onde a família ainda não concorda (§17). */
async function divergencias() {
  aguarde(t('familia.divergencias'));
  const r = await api('GET', '/familias/' + FAM.id + '/divergencias');
  if (deuErro(r)) return $(colecao(t('familia.divergencias'), falhou(r, 'divergencias()')));
  $(colecao(t('familia.divergencias'),
    ((r.divergencias || []).length
      ? (r.divergencias || []).map(d =>
          '<div class="linha"><span><strong>' + esc(d.nome_exibicao) + '</strong> · ' +
          esc(t('predicado.' + d.predicado)) + '<br><span class="sub">' +
          esc((d.valores || []).join('  \u00d7  ')) + '</span></span>' +
          '<button class="btn mini claro" onclick="deOndeVeio(\\'' + d.sujeito_id + '\\',\\'' + d.predicado +
          '\\')">' + esc(t('fato.comparar')) + '</button></div>').join('')
      // "\u2014" era tudo o que aparecia quando n\u00e3o havia diverg\u00eancia: quem abria
      // n\u00e3o sabia se estava tudo certo ou se a tela tinha falhado.
      : vazio(t('familia.divergencias_vazio'), t('familia.divergencias_vazio_p'))),
    { intro: t('familia.divergencias_intro') }));
}

// ------------------------------------------------------------ proveniência
// A palavra "claim" não aparece em lugar nenhum daqui para baixo (§82):
// o usuário responde "o que você sabe" e "como você sabe disso".
const selo = (st) => t('status.selo_' + st) + ' ' + t('status.' + st);

function linhaFato(f, pessoaId) {
  const rotulo = t('predicado.' + f.predicado);
  return '<div class="linha"><span><strong>' + esc(rotulo) + ':</strong> ' + esc(f.valor) +
    ' <span class="papel" title="' + esc(t('status.' + f.status)) + '">' + esc(selo(f.status)) + '</span>' +
    (f.em_divergencia ? ' <span class="papel" style="background:#FBE3C7;color:#8A4B12">' +
      esc(t('status.selo_DISPUTED') + ' ' + t('fato.divergencia')) + '</span>' : '') +
    '</span><button class="btn mini claro" onclick="deOndeVeio(\\'' + pessoaId + '\\',\\'' +
      f.predicado + '\\')">' + esc(t('fato.de_onde_veio')) + '</button></div>';
}

/**
 * A tela que o §44 pede: "Quem informou que Antônio nasceu em 1921?"
 * Mostra TODAS as versões — inclusive as que a família não aceitou.
 */
async function deOndeVeio(pessoaId, predicado) {
  const r = await api('GET', '/familias/' + FAM.id + '/pessoas/' + pessoaId + '/fatos/' + predicado);
  if (deuErro(r)) return $(topo() + aviso(r.erro));
  const podeResolver = pode('claims.resolver');
  $(topo() + '<p class="sub"><a href="#" onclick="dossie(\\'' + pessoaId + '\\');return false">← ' +
      esc(t('acao.voltar_familias')) + '</a></p>' +
    '<h2>' + esc(t('predicado.' + predicado)) + '</h2>' +
    '<p class="sub">' + esc(t('fato.versoes')) + '</p>' +
    (r.versoes || []).map(v =>
      '<div class="card" style="padding:18px">' +
        '<p style="margin:0 0 6px"><strong style="font-size:19px">' + esc(v.valor) + '</strong> ' +
          '<span class="papel">' + esc(selo(v.status)) + '</span>' +
          (v.aceito ? ' <span class="papel" style="background:#DCEFE0;color:#1F5C33">' +
            esc(t('fato.aceita')) + '</span>' : '') + '</p>' +
        '<p class="sub" style="margin:0 0 10px">' + esc(t('fato.informado_por')) + ' <strong>' +
          esc(v.informado_por || t('auditoria.sistema')) + '</strong> ' + esc(t('fato.em')) + ' ' +
          esc(new Date(v.created_at).toLocaleDateString(IDIOMA)) + '</p>' +
        ((v.evidencias || []).length
          ? '<p class="sub" style="margin:0">' + esc(t('fato.fontes')) + ': ' +
            v.evidencias.map(e => (e.posicao === 'CONTRADIZ' ? '⚠ ' + esc(t('fato.contradiz')) + ' — ' : '') +
              esc(t('fonte.' + e.fonte_tipo)) + (e.fonte_titulo ? ': ' + esc(e.fonte_titulo) : '') +
              (e.fonte_referencia ? ' <em>(' + esc(e.fonte_referencia) + ')</em>' : '') +
              (e.trecho ? '<br><span style="border-left:3px solid var(--borda);padding-left:10px;display:inline-block;margin-top:6px">“' +
                esc(e.trecho) + '”</span>' : '')).join('<br>') + '</p>'
          : '<p class="sub" style="margin:0">' + esc(t('fato.nenhuma_fonte')) + '</p>') +
        (v.created_by_kind === 'ai' && podeResolver
          ? '<p style="margin:12px 0 0"><button class="btn mini" onclick="confirmarIA(\\'' + v.id + '\\',\\'' +
            pessoaId + '\\',\\'' + predicado + '\\')">' + esc(t('fato.confirmar_ia')) + '</button></p>' : '') +
        (podeResolver && !v.aceito && v.created_by_kind !== 'ai'
          ? '<p style="margin:12px 0 0"><button class="btn mini claro" onclick="aceitarVersao(\\'' + v.id +
            '\\',\\'' + pessoaId + '\\',\\'' + predicado + '\\')">' + esc(t('fato.aceitar')) + '</button></p>' : '') +
      '</div>').join('') +
    '<p class="sub">' + esc(t('fato.preservadas')) + '</p>');
}

async function aceitarVersao(claimId, pessoaId, predicado) {
  const motivo = prompt(t('fato.motivo'));
  if (!motivo) return;
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas/' + pessoaId +
    '/fatos/' + predicado + '/resolver', { claim_id: claimId, motivo });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  deOndeVeio(pessoaId, predicado);
}

async function confirmarIA(claimId, pessoaId, predicado) {
  const r = await api('POST', '/familias/' + FAM.id + '/fatos/' + claimId + '/confirmar', {});
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  deOndeVeio(pessoaId, predicado);
}

function formFato(pessoaId) {
  const preds = ['nome','data_nascimento','data_falecimento','local_nascimento','profissao'];
  const fontes = ['RELATO','DOCUMENTO','REGISTRO_OFICIAL','MIDIA','PUBLICACAO'];
  return '<h3 style="margin-top:26px">' + esc(t('fato.acrescentar')) + '</h3>' +
    '<label for="fp">' + esc(t('fato.campo')) + '</label><select id="fp">' +
      preds.map(x => '<option value="' + x + '">' + esc(t('predicado.' + x)) + '</option>').join('') + '</select>' +
    '<label for="fv">' + esc(t('fato.valor')) + '</label><input id="fv">' +
    '<label for="ft">' + esc(t('fato.como_sabe')) + '</label><select id="ft">' +
      fontes.map(x => '<option value="' + x + '">' + esc(t('fonte.' + x)) + '</option>').join('') + '</select>' +
    '<label for="fq">' + esc(t('fato.fonte_titulo')) + '</label><input id="fq">' +
    '<label for="fr">' + esc(t('fato.fonte_referencia')) + '</label><input id="fr">' +
    '<p><button class="btn" onclick="guardarFato(\\'' + pessoaId + '\\')">' + esc(t('acao.salvar')) + '</button></p>';
}

async function guardarFato(pessoaId) {
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas/' + pessoaId + '/fatos', {
    predicado: document.getElementById('fp').value, valor: document.getElementById('fv').value,
    fonte_tipo: document.getElementById('ft').value,
    fonte_titulo: document.getElementById('fq').value,
    fonte_referencia: document.getElementById('fr').value });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  dossie(pessoaId);
}

async function contar(pessoaId) {
  const corpo = document.getElementById('cc').value;
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas/' + pessoaId + '/contribuicoes', { corpo });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  dossie(pessoaId);
}

// ------------------------------------------------------------------ árvore
async function verArvore(id, modo, geracoes) {
  MODO = modo || MODO || 'ambos'; GERACOES = geracoes || GERACOES || 4;
  const r = await api('GET', '/familias/' + FAM.id + '/arvore/' + id + '?modo=' + MODO + '&geracoes=' + GERACOES);
  if (deuErro(r)) return $(topo() + aviso(r.erro));
  const botao = (m, rot) => '<button class="btn mini ' + (MODO === m ? '' : 'claro') +
    '" onclick="verArvore(\\'' + id + '\\',\\'' + m + '\\')">' + esc(rot) + '</button> ';
  $(topo() + '<p class="sub"><a href="#" onclick="dossie(\\'' + id + '\\');return false">← ' +
      esc(t('acao.voltar_familias')) + '</a></p>' +
    '<h2>' + esc(t('familia.arvore')) + '</h2>' +
    '<p>' + botao('ancestral', t('familia.modo_ancestral')) + botao('ambos', t('familia.modo_ambos')) +
      botao('descendentes', t('familia.modo_descendentes')) +
      '<button class="btn mini claro" onclick="window.print()">' + esc(t('familia.imprimir')) + '</button></p>' +
    '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">' + svgArvore(r) + '</div>');
}

/**
 * Layout por baricentro: as gerações viram linhas e cada nó é puxado para
 * a média dos x de quem se liga a ele. Três passadas bastam para os laços
 * pararem de se cruzar em famílias reais — e é o suficiente para uma
 * árvore que precisa ser legível, não perfeita.
 */
function svgArvore(dados) {
  const L = 150, A = 96, MARGEM = 24;
  const gs = [...new Set(dados.nos.map(n => n.geracao))].sort((a,b) => a-b);
  const linhas = new Map(gs.map(g => [g, dados.nos.filter(n => n.geracao === g)]));
  const pos = new Map();
  linhas.forEach((lista, g) => lista.forEach((n, i) => pos.set(n.id, { x: i, y: gs.indexOf(g) })));

  const vizinhos = new Map(dados.nos.map(n => [n.id, []]));
  dados.arestas.forEach(e => {
    if (vizinhos.has(e.person_a) && vizinhos.has(e.person_b)) {
      vizinhos.get(e.person_a).push(e.person_b); vizinhos.get(e.person_b).push(e.person_a);
    }
  });
  for (let passada = 0; passada < 3; passada++) {
    linhas.forEach((lista) => {
      lista.forEach(n => {
        const vs = vizinhos.get(n.id).map(v => pos.get(v)).filter(Boolean);
        if (vs.length) pos.get(n.id).x = vs.reduce((s,v) => s + v.x, 0) / vs.length;
      });
      // desempata mantendo a ordem e afastando quem colidiu
      lista.map(n => ({ n, p: pos.get(n.id) })).sort((a,b) => a.p.x - b.p.x)
        .forEach((it, i, arr) => { if (i > 0 && it.p.x - arr[i-1].p.x < 1) it.p.x = arr[i-1].p.x + 1; });
    });
  }
  const xs = [...pos.values()].map(p => p.x);
  const min = Math.min(...xs), largura = (Math.max(...xs) - min) * L + 2 * MARGEM + L;
  const altura = gs.length * A + 2 * MARGEM;
  const X = (id) => MARGEM + (pos.get(id).x - min) * L + L/2;
  const Y = (id) => MARGEM + pos.get(id).y * A + 26;

  const linhasSvg = dados.arestas.map(e => {
    if (!pos.has(e.person_a) || !pos.has(e.person_b)) return '';
    const tracejado = e.natureza && e.natureza !== 'biologico' ? ' stroke-dasharray="5 4"' : '';
    const cor = e.tipo === 'PARENT_OF' ? 'var(--tema)' : 'var(--suave)';
    return '<line x1="' + X(e.person_a) + '" y1="' + Y(e.person_a) + '" x2="' + X(e.person_b) +
      '" y2="' + Y(e.person_b) + '" stroke="' + cor + '" stroke-width="1.6"' + tracejado + ' opacity=".75"/>';
  }).join('');

  const nosSvg = dados.nos.map(n => {
    const x = X(n.id), y = Y(n.id);
    const rotulo = n.nome_exibicao.length > 18 ? n.nome_exibicao.slice(0,17) + '…' : n.nome_exibicao;
    const per = [n.ano_nascimento, n.ano_falecimento].filter(Boolean).join('–');
    return '<g style="cursor:pointer" onclick="dossie(\\'' + n.id + '\\')">' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (n.id === dados.raiz ? 9 : 6) + '" fill="var(--tema)"' +
        (n.id === dados.raiz ? ' stroke="var(--tinta)" stroke-width="2"' : '') + '/>' +
      '<text x="' + x + '" y="' + (y + 24) + '" text-anchor="middle" font-size="13" ' +
        'font-weight="' + (n.id === dados.raiz ? 700 : 500) + '" fill="var(--tinta)">' + esc(rotulo) + '</text>' +
      (per ? '<text x="' + x + '" y="' + (y + 40) + '" text-anchor="middle" font-size="11" fill="var(--suave)">' +
        esc(per) + '</text>' : '') + '</g>';
  }).join('');

  return '<svg viewBox="0 0 ' + Math.max(largura, 320) + ' ' + altura + '" width="' + Math.max(largura, 320) +
    '" height="' + altura + '" role="img" aria-label="' + esc(t('familia.arvore')) + '">' +
    linhasSvg + nosSvg + '</svg>';
}
let MODO = 'ambos', GERACOES = 4;

// ------------------------------------------------------------------ mídia
// O arquivo vai do navegador DIRETO para o storage. O servidor assina a
// URL e guarda o metadado; o byte nunca passa por ele.
const MIDIA_CACHE = {};

async function hashDoArquivo(file) {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Miniatura feita aqui, no canvas. O servidor não processa imagem (o
 * grupo não usa dependência nativa) e o navegador já tem o arquivo
 * aberto. O ORIGINAL sobe intacto e tem o hash conferido no worker.
 */
function miniatura(file, lado) {
  return new Promise((resolve) => {
    if (!/^image\\//.test(file.type)) return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * escala));
      c.height = Math.max(1, Math.round(img.height * escala));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b ? { blob: b, largura: c.width, altura: c.height } : null), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

const tipoDoArquivo = (f) => /^image\\//.test(f.type) ? 'FOTO'
  : /^video\\//.test(f.type) ? 'VIDEO' : /^audio\\//.test(f.type) ? 'AUDIO' : 'DOCUMENTO';

// ------------------------------------------------------------ ENVIO (§15)
// O envio era uma caixa-preta: "enviando 3 de 12", nenhuma barra, nada de
// cancelar, e um erro no fim sem dizer o que sobrou. Numa foto de celular
// (5–10 MB) em rede ruim, isso é meio minuto de tela parada por arquivo.
//
// Aqui: progresso REAL por arquivo (fetch não reporta progresso de envio —
// só XMLHttpRequest reporta), cancelar a qualquer momento, e retomar o que
// falhou sem escolher os arquivos de novo. "Retomar" é reenviar o arquivo
// inteiro: a URL assinada do R2 é um PUT único, não aceita continuar do
// meio. O que não se repete é o REGISTRO — a linha da mídia é a mesma, e
// por isso reenviar não cria memória duplicada.
let ENVIO = { itens: [], xhr: null, cancelado: false, rodando: false };

function envioPut(url, corpo, mime, aoProgresso) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    ENVIO.xhr = x;
    x.open('PUT', url, true);
    x.setRequestHeader('Content-Type', mime || 'application/octet-stream');
    x.upload.onprogress = (e) => { if (e.lengthComputable && aoProgresso) aoProgresso(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300)
      ? resolve() : reject(new Error('HTTP ' + x.status));
    x.onerror = () => reject(new Error('rede'));
    x.onabort = () => reject(Object.assign(new Error('cancelado'), { cancelado: true }));
    x.send(corpo);
  });
}

function pintarEnvio() {
  const painel = document.getElementById('envio');
  if (!painel) return;
  const itens = ENVIO.itens;
  if (!itens.length) { painel.innerHTML = ''; return; }
  const prontos = itens.filter(i => i.estado === 'pronto' || i.estado === 'duplicado').length;
  const falhos = itens.filter(i => i.estado === 'falhou').length;
  painel.innerHTML =
    '<p class="sub" style="margin:0 0 6px">' +
      esc(t('midia.enviando_n', { prontos, total: itens.length })) +
      (falhos ? ' · ' + esc(t('midia.falharam', { n: falhos })) : '') + '</p>' +
    itens.map(i =>
      '<div class="envio-item"><span class="envio-nome">' + esc(i.nome) + '</span>' +
      '<span class="envio-estado">' + esc(t('midia.est_' + i.estado)) + '</span>' +
      '<span class="envio-barra"><i style="width:' + Math.round((i.pct || 0) * 100) + '%"></i></span></div>').join('') +
    '<p class="acoes">' +
      (ENVIO.rodando
        ? '<button class="btn mini sec" onclick="cancelarEnvio()">' + esc(t('midia.cancelar')) + '</button>'
        : (falhos
            ? '<button class="btn mini" onclick="retomarEnvio()">' +
              esc(t('midia.retomar', { n: falhos })) + '</button>' : '')) +
    '</p>';
}

function cancelarEnvio() {
  ENVIO.cancelado = true;
  if (ENVIO.xhr) { try { ENVIO.xhr.abort(); } catch (_) {} }
}

const retomarEnvio = () => enviarArquivos(null, true);

/**
 * lista: arquivos escolhidos (vazio quando é retomada).
 * retomando: reaproveita os que falharam, sem escolher de novo.
 */
async function enviarArquivos(lista, retomando) {
  if (!retomando) {
    ENVIO.itens = [...(lista || [])].map(f => ({ arquivo: f, nome: f.name, estado: 'esperando', pct: 0 }));
  } else {
    for (const i of ENVIO.itens) if (i.estado === 'falhou') { i.estado = 'esperando'; i.pct = 0; }
  }
  if (!ENVIO.itens.length) return;
  ENVIO.cancelado = false; ENVIO.rodando = true;
  pintarEnvio();

  let duplicadas = 0;
  for (const item of ENVIO.itens) {
    if (ENVIO.cancelado) { if (item.estado === 'esperando') item.estado = 'cancelado'; continue; }
    if (item.estado !== 'esperando') continue;
    const file = item.arquivo;
    item.estado = 'enviando'; pintarEnvio();
    try {
      const sha = await hashDoArquivo(file);
      const prep = await api('POST', '/familias/' + FAM.id + '/midias/preparar', {
        nome: file.name, bytes: file.size, sha256: sha, mime: file.type, tipo: tipoDoArquivo(file) });
      if (deuErro(prep)) { item.estado = 'falhou'; item.erro = prep.erro; pintarEnvio(); continue; }
      if (prep.duplicado) { item.estado = 'duplicado'; item.pct = 1; duplicadas++; pintarEnvio(); continue; }

      // Este PUT sai do NAVEGADOR direto para o bucket — é o único trecho
      // do envio que não passa pelo nosso servidor, e por isso o único que
      // depende do CORS do bucket.
      await envioPut(prep.url_envio, file, file.type, (p) => { item.pct = p * 0.9; pintarEnvio(); });
      await api('POST', '/familias/' + FAM.id + '/midias/' + prep.media_id + '/confirmar');

      // miniatura: derivado, não original
      const mini = await miniatura(file, 512);
      if (mini) {
        const mBuf = await mini.blob.arrayBuffer();
        const mHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', mBuf))]
          .map(b => b.toString(16).padStart(2, '0')).join('');
        const d = await api('POST', '/familias/' + FAM.id + '/midias/' + prep.media_id + '/derivados', {
          papel: 'THUMB', sha256: mHash, bytes: mini.blob.size, mime: 'image/jpeg',
          largura: mini.largura, altura: mini.altura });
        if (d.url_envio) await envioPut(d.url_envio, mini.blob, 'image/jpeg');
      }
      item.estado = 'pronto'; item.pct = 1; pintarEnvio();
    } catch (e) {
      item.estado = (e && e.cancelado) ? 'cancelado' : 'falhou';
      item.erro = e && e.message;
      pintarEnvio();
    }
  }
  ENVIO.rodando = false; ENVIO.xhr = null;
  const falhos = ENVIO.itens.filter(i => i.estado === 'falhou').length;
  const cancelados = ENVIO.itens.filter(i => i.estado === 'cancelado').length;
  const pendentes = ENVIO.itens.filter(i => i.estado === 'falhou' || i.estado === 'cancelado');
  // A galeria se refaz, mas o painel do envio SOBREVIVE: é onde está o
  // "retomar", e quem teve arquivo falhando não pode perder a lista.
  await memorias();
  ENVIO.itens = pendentes.map(i => ({ ...i, estado: 'falhou' }));
  pintarEnvio();
  if (!falhos && !cancelados && duplicadas) {
    const p = document.getElementById('envio');
    if (p) p.innerHTML = aviso(t('midia.duplicada'), 'ok');
  }
}

// Arquivar é SOFT DELETE: sai da galeria e da busca, continua na Lixeira
// e pode voltar inteira. O texto do aviso diz isso — quem clica precisa
// saber o que está fazendo, e que dá para desfazer.
async function arquivarMidia(id) {
  if (!confirm(t('midia.arquivar_confirmar'))) return;
  const r = await api('DELETE', '/familias/' + FAM.id + '/midias/' + id);
  if (deuErro(r)) return alert(r.erro);
  alert(r.aviso || t('midia.arquivada'));
  memorias();
}

// ---------------------------------------------------------------- lixeira
// Contraparte obrigatória do arquivar: excluir sem lugar para onde voltar
// não é lixeira, é destruição.
async function telaLixeira() {
  const r = await api('GET', '/familias/' + FAM.id + '/lixeira');
  if (deuErro(r)) return $(colecao(t('lixeira.titulo'), falhou(r, 'telaLixeira()')));
  const grupos = [['pessoa', r.pessoas], ['midia', r.midias], ['historia', r.historias],
    ['tradicao', r.tradicoes], ['reliquia', r.reliquias]];
  const vazia = grupos.every(g => !(g[1] || []).length);
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('lixeira.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('lixeira.intro')) + '</p>' +
    (vazia ? vazio(t('lixeira.vazia'), t('lixeira.vazia_p'))
      : grupos.filter(g => (g[1] || []).length).map(g =>
        '<h3 style="margin-top:24px">' + esc(t('lixeira.tipo_' + g[0])) + '</h3>' +
        g[1].map(x => '<div class="linha"><span>' + esc(x.titulo || t('lixeira.sem_titulo')) +
          '<br><span class="sub">' + esc(t('lixeira.arquivado_em', { data: new Date(x.deleted_at).toLocaleDateString(IDIOMA) })) +
          '</span></span>' +
          (pode('restaurar')
            ? '<button class="btn mini" onclick="restaurarItem(\\'' + g[0] + '\\',\\'' + x.id + '\\')">' +
              esc(t('lixeira.restaurar')) + '</button>' : '') +
          '</div>').join('')).join('')));
}

async function restaurarItem(tipo, id) {
  const r = await api('POST', '/familias/' + FAM.id + '/lixeira/' + tipo + '/' + id + '/restaurar');
  if (deuErro(r)) return alert(r.erro);
  telaLixeira();
}

// ----------------------------------------------------------------- álbuns
// Álbuns existiam na API desde o 1.0 — criar, listar e pôr foto dentro — e
// nenhuma tela chamava. Resultado: o scrapbook, que é UM DOS PRODUTOS do
// Origena Criar, pedia um álbum que era impossível montar. Motor pronto sem
// porta é motor que não existe.
async function telaAlbuns() {
  aguarde(t('album.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/albuns');
  if (deuErro(r)) return $(colecao(t('album.titulo'), falhou(r, 'telaAlbuns()')));
  const lista = r.albuns || [];
  $(colecao(t('album.titulo'),
    (lista.length
      ? lista.map(a => '<div class="linha"><span>' +
          '<a href="#" onclick="verAlbum(\\'' + a.id + '\\');return false"><strong>' + esc(a.titulo) + '</strong></a>' +
          '<br><span class="sub">' + esc(t('album.n_fotos', { n: a.itens || 0 })) +
          (a.descricao ? ' · ' + esc(a.descricao) : '') + '</span></span>' +
          '<button class="btn mini sec" onclick="verAlbum(\\'' + a.id + '\\')">' + esc(t('acao.abrir')) + '</button>' +
          '</div>').join('')
      : vazio(t('album.nenhum'), t('album.nenhum_p'))) +
    (pode('contribuir')
      ? '<h3 style="margin-top:26px">' + esc(t('album.novo')) + '</h3>' +
        '<label for="al_t">' + esc(t('album.nome')) + '</label>' +
        '<input id="al_t" placeholder="' + esc(t('album.placeholder')) + '">' +
        '<label for="al_d">' + esc(t('album.descricao')) + '</label><input id="al_d">' +
        '<p><button class="btn" onclick="criarAlbum()">' + esc(t('acao.criar')) + '</button></p>'
      : semPermissaoParaCriar()),
    { intro: t('album.intro') }));
}

async function criarAlbum() {
  const r = await api('POST', '/familias/' + FAM.id + '/albuns',
    { titulo: val('al_t'), descricao: val('al_d') });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verAlbum(r.album.id);
}

async function verAlbum(id) {
  aguarde(t('album.titulo'));
  const [alb, fotos] = await Promise.all([
    api('GET', '/familias/' + FAM.id + '/albuns'),
    api('GET', '/familias/' + FAM.id + '/midias?limite=200&album=' + encodeURIComponent(id)),
  ]);
  if (deuErro(alb) || deuErro(fotos)) return $(colecao(t('album.titulo'), falhou(fotos, 'telaAlbuns()')));
  const a = (alb.albuns || []).find(x => x.id === id);
  if (!a) return telaAlbuns();
  const itens = fotos.midias || [];
  $(topo() + '<p class="sub"><a href="#" onclick="telaAlbuns();return false">← ' + esc(t('album.titulo')) + '</a></p>' +
    '<h2>' + esc(a.titulo) + '</h2>' +
    (a.descricao ? '<p class="sub">' + esc(a.descricao) + '</p>' : '') +
    (itens.length
      ? '<div class="grade">' + itens.map((m, i) =>
          '<figure class="cel" data-thumb="' + (m.thumb_id || m.id) + '">' +
          '<div class="ph" onclick="verMidia(\\'' + m.id + '\\')"></div>' +
          '<figcaption>' + esc(t('album.pagina', { n: i + 1 })) +
          (m.titulo ? ' · ' + esc(m.titulo) : '') +
          (pode('contribuir')
            // Trocar de lugar com o vizinho, não arrastar: funciona no dedo,
            // no teclado e no leitor de tela, sem biblioteca nenhuma.
            ? '<br><span class="ordem">' +
              '<button class="btn mini sec" ' + (i === 0 ? 'disabled ' : '') +
                'aria-label="' + esc(t('album.subir')) + '" ' +
                'onclick="moverNoAlbum(\\'' + id + '\\',\\'' + m.id + '\\',\\'subir\\')">↑</button>' +
              '<button class="btn mini sec" ' + (i === itens.length - 1 ? 'disabled ' : '') +
                'aria-label="' + esc(t('album.descer')) + '" ' +
                'onclick="moverNoAlbum(\\'' + id + '\\',\\'' + m.id + '\\',\\'descer\\')">↓</button>' +
              '<a href="#" onclick="tirarDoAlbum(\\'' + id + '\\',\\'' + m.id + '\\');return false">' +
              esc(t('album.tirar')) + '</a></span>' : '') +
          '</figcaption></figure>').join('') + '</div>' +
        (pode('contribuir') ? '<p class="sub">' + esc(t('album.ordem_explica')) + '</p>' : '')
      : vazio(t('album.vazio'), t('album.vazio_p'))) +
    '<p class="sub">' + esc(t('album.como_por')) + '</p>' +
    '<div class="acoes"><button class="btn sec" onclick="memorias()">' + esc(t('familia.memorias')) + '</button>' +
    (itens.length && pode('exportar')
      ? '<button class="btn" onclick="novoLivro({tipo:\\'album\\',album:\\'' + id + '\\'})">' +
        esc(t('livro.gerar_album')) + '</button>' : '') + '</div>');
  carregarMiniaturasVisiveis();
}

async function tirarDoAlbum(albumId, mediaId) {
  const r = await api('DELETE', '/familias/' + FAM.id + '/albuns/' + albumId + '/itens/' + mediaId);
  if (deuErro(r)) return alert(r.erro);
  verAlbum(albumId);
}

async function moverNoAlbum(albumId, mediaId, direcao) {
  const r = await api('PATCH', '/familias/' + FAM.id + '/albuns/' + albumId + '/itens/' + mediaId, { direcao });
  if (deuErro(r)) return alert(r.erro);
  verAlbum(albumId);
}

// ESCOLHER ÁLBUM SEM CAIXA NUMERADA. Era uma caixa do navegador pedindo "digite o
// número": funciona e é o oposto de refinado — some no celular, não dá para
// ler com o dedo, e obriga a decorar uma lista para digitar um algarismo.
// Agora é uma tela com os álbuns em botões, e a saída de criar um novo.
async function telaEscolherAlbum(paraQue, mediaId) {
  aguarde(t('album.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/albuns');
  if (deuErro(r)) return $(colecao(t('album.titulo'), falhou(r, 'telaAlbuns()')));
  // Para o scrapbook só serve álbum COM foto dentro — um álbum vazio não
  // vira livro nenhum, e oferecê-lo seria oferecer um beco.
  const lista = (r.albuns || []).filter(a => paraQue !== 'livro' || a.itens > 0);
  $(colecao(t(paraQue === 'livro' ? 'album.escolher_livro' : 'album.escolher'),
    (lista.length
      ? lista.map(a => '<div class="linha"><span><strong>' + esc(a.titulo) + '</strong>' +
          '<br><span class="sub">' + esc(t('album.n_fotos', { n: a.itens || 0 })) + '</span></span>' +
          '<button class="btn mini" onclick="' +
            (paraQue === 'livro'
              ? 'novoLivro({tipo:\\'album\\',album:\\'' + a.id + '\\'})'
              : 'guardarNoAlbum(\\'' + a.id + '\\',\\'' + mediaId + '\\')') +
          '">' + esc(t(paraQue === 'livro' ? 'livro.gerar_album' : 'album.guardar_aqui')) + '</button>' +
          '</div>').join('')
      : vazio(t('album.nenhum'), t(paraQue === 'livro' ? 'album.nenhum_com_foto_p' : 'album.nenhum_p'))) +
    '<div class="acoes"><button class="btn sec" onclick="telaAlbuns()">' +
      esc(t('album.novo')) + '</button></div>',
    { voltar: '<p class="sub"><a href="#" onclick="' +
      (mediaId ? 'verMidia(\\'' + mediaId + '\\')' : 'telaLivros()') +
      ';return false">' + esc(t('acao.voltar')) + '</a></p>' }));
}

const porNoAlbum = (mediaId) => telaEscolherAlbum('foto', mediaId);

async function guardarNoAlbum(albumId, mediaId) {
  const p = await api('POST', '/familias/' + FAM.id + '/albuns/' + albumId + '/itens', { media_id: mediaId });
  if (deuErro(p)) return alert(p.erro);
  verAlbum(albumId);
}

async function urlDe(id) {
  if (MIDIA_CACHE[id]) return MIDIA_CACHE[id];
  const r = await api('GET', '/familias/' + FAM.id + '/midias/' + id + '/url');
  if (deuErro(r)) return null;
  MIDIA_CACHE[id] = r.url;
  return r.url;
}

// HISTÓRICO DESTA TELA, em duas correções. Primeiro, "carregar mais"
// TROCAVA a página: as 60 primeiras sumiam e não havia caminho de volta.
// A correção foi acumular — e ela criou o problema seguinte, apontado no
// uso: depois de cinco cliques a página ficava enorme e o celular travava
// de novo. Agora são PÁGINAS: tamanho fixo, com Anterior e Próxima.
// Filtro corrente e selecao. Ficam FORA de memorias() porque "carregar
// mais" recarrega a funcao: se morassem dentro, cada pagina nova perderia
// o filtro e a selecao — que e exatamente o momento em que a pessoa esta
// juntando fotos para um album.
let FILTRO = { pessoa: '', album: '', tipo: '' };
const POR_PAGINA = 60;
// Pilha de cursores ja visitados. A API pagina por cursor, entao voltar e
// DESEMPILHAR — nao existe "pular para a pagina 5".
let PAG = { pilha: [null], n: 1, proximo: null };
let ESCOLHIDAS = new Set();
let LISTAS = { pessoas: null, albuns: null };

const qsFiltro = () => (FILTRO.pessoa ? '&pessoa=' + FILTRO.pessoa : '') +
  (FILTRO.album ? '&album=' + FILTRO.album : '') +
  (FILTRO.tipo ? '&tipo=' + FILTRO.tipo : '');

/** Troca um filtro e recomeca a lista: paginacao velha nao vale para outro recorte. */
function filtrar(campo, valor) {
  FILTRO[campo] = valor || '';
  PAG = { pilha: [null], n: 1, proximo: null };
  ESCOLHIDAS = new Set();
  memorias();
}

function limparFiltro() { FILTRO = { pessoa: '', album: '', tipo: '' }; filtrar('tipo', ''); }

function marcar(id, marcado) {
  if (marcado) ESCOLHIDAS.add(id); else ESCOLHIDAS.delete(id);
  const b = document.getElementById('barra-selecao');
  if (b) b.innerHTML = barraSelecao();
}

/** ANO da foto, para agrupar. Sem data nao se inventa: vai para o fim, rotulado. */
function anoDaMidia(m) {
  const v = m.capturada_ini || m.capturada_valor || '';
  const a = String(v).match(/\d{4}/);
  return a ? a[0] : null;
}

async function adicionarAoAlbum() {
  if (!ESCOLHIDAS.size) return;
  if (!LISTAS.albuns) {
    const r = await api('GET', '/familias/' + FAM.id + '/albuns');
    LISTAS.albuns = deuErro(r) ? [] : (r.albuns || []);
  }
  if (!LISTAS.albuns.length) return alert(t('midia.sem_album_ainda'));
  const nomes = LISTAS.albuns.map((a, i) => (i + 1) + ') ' + a.titulo).join('\\n');
  const escolha = prompt(t('midia.para_qual_album') + '\\n\\n' + nomes);
  const alvo = LISTAS.albuns[Number(escolha) - 1];
  if (!alvo) return;
  let ok = 0;
  for (const id of ESCOLHIDAS) {
    const r = await api('POST', '/familias/' + FAM.id + '/albuns/' + alvo.id + '/itens',
      { media_id: id });
    if (!deuErro(r)) ok += 1;
  }
  alert(t('midia.adicionadas', { n: ok, album: alvo.titulo }));
  ESCOLHIDAS = new Set();
  memorias();
}

function barraSelecao() {
  if (!ESCOLHIDAS.size) return '';
  return '<span class="sub">' + esc(t('midia.escolhidas', { n: ESCOLHIDAS.size })) + '</span> ' +
    '<button class="btn mini" onclick="adicionarAoAlbum()">' + esc(t('midia.para_album')) + '</button> ' +
    '<button class="btn mini sec" onclick="ESCOLHIDAS=new Set();memorias()">' +
    esc(t('acao.cancelar')) + '</button>';
}

async function memorias(direcao) {
  aguarde(t('midia.titulo'));
  // Listas dos filtros: buscadas UMA vez. São rótulos, não mudam a cada página.
  if (!LISTAS.pessoas) {
    const [rp, ra] = await Promise.all([
      api('GET', '/familias/' + FAM.id + '/pessoas'),
      api('GET', '/familias/' + FAM.id + '/albuns'),
    ]);
    LISTAS.pessoas = deuErro(rp) ? [] : (rp.pessoas || []);
    LISTAS.albuns = deuErro(ra) ? [] : (ra.albuns || []);
  }

  // PÁGINAS DE VERDADE, não rolagem infinita. Acumular resolvia o defeito
  // antigo ("carregar mais" fazia as 60 primeiras sumirem sem caminho de
  // volta), mas trocava por outro: depois de cinco cliques a página ficava
  // enorme e o celular travava de novo. Com Anterior/Próxima existe o
  // caminho de volta E a página fica do mesmo tamanho sempre.
  //
  // A API pagina por CURSOR, então "pular para a página 5" não existe: o
  // que se guarda é a PILHA de cursores já visitados, e voltar é
  // desempilhar.
  if (direcao === 'prox' && PAG.proximo) { PAG.pilha.push(PAG.proximo); PAG.n += 1; }
  else if (direcao === 'ant' && PAG.pilha.length > 1) { PAG.pilha.pop(); PAG.n -= 1; }
  const cursor = PAG.pilha[PAG.pilha.length - 1];

  const r = await api('GET', '/familias/' + FAM.id + '/midias?limite=' + POR_PAGINA + qsFiltro() +
    (cursor ? '&antes_de=' + encodeURIComponent(cursor) : ''));
  // ERRO NÃO PODE PARECER GALERIA VAZIA (a mesma lição da lista de pessoas).
  if (deuErro(r)) return $(colecao(t('midia.titulo'), falhou(r, 'memorias()')));
  const itens = r.midias || [];
  PAG.proximo = r.proximo_cursor || null;

  // AGRUPADO POR ANO. Acervo de família não é uma lista: são camadas de
  // tempo. Quem tem 300 fotos procura "os anos 80", não a foto 147. O que
  // não tem data vai para o FIM, rotulado — a Origena não inventa data
  // para caber numa gaveta.
  const porAno = {};
  for (const m of itens) { const a = anoDaMidia(m) || ''; (porAno[a] = porAno[a] || []).push(m); }
  const grupos = Object.entries(porAno).sort(function (x, y) {
    return x[0] === '' ? 1 : y[0] === '' ? -1 : Number(y[0]) - Number(x[0]); });

  const temFiltro = !!(FILTRO.pessoa || FILTRO.album || FILTRO.tipo);
  const opcao = function (valor, rotulo, atual) {
    return '<option value="' + valor + '"' + (atual === valor ? ' selected' : '') + '>' +
      esc(rotulo) + '</option>'; };

  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">&larr; ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(t('midia.titulo')) + '</h2>' +
    // FILTROS. A API sabia filtrar por pessoa, álbum e tipo desde a Fase 4;
    // a tela nunca ofereceu. Sem isto o acervo real vira rolagem infinita,
    // e montar um álbum fica impraticável.
    '<p class="filtros">' +
      '<select onchange="filtrar(\\'pessoa\\', this.value)" aria-label="' + esc(t('midia.todas_pessoas')) + '">' +
        opcao('', t('midia.todas_pessoas'), FILTRO.pessoa) +
        (LISTAS.pessoas || []).map(function (p) {
          return opcao(p.id, p.nome_exibicao, FILTRO.pessoa); }).join('') +
      '</select> ' +
      '<select onchange="filtrar(\\'album\\', this.value)" aria-label="' + esc(t('midia.todos_albuns')) + '">' +
        opcao('', t('midia.todos_albuns'), FILTRO.album) +
        (LISTAS.albuns || []).map(function (a) {
          return opcao(a.id, a.titulo, FILTRO.album); }).join('') +
      '</select> ' +
      '<select onchange="filtrar(\\'tipo\\', this.value)" aria-label="' + esc(t('midia.todos_tipos')) + '">' +
        opcao('', t('midia.todos_tipos'), FILTRO.tipo) +
        ['FOTO', 'VIDEO', 'AUDIO', 'DOCUMENTO'].map(function (x) {
          return opcao(x, t('midia.tipo_' + x.toLowerCase()), FILTRO.tipo); }).join('') +
      '</select>' +
      (temFiltro
        ? ' <button class="btn mini sec" onclick="limparFiltro()">' + esc(t('midia.limpar_filtro')) + '</button>'
        : '') +
    '</p>' +
    '<p id="barra-selecao" class="sub">' + barraSelecao() + '</p>' +
    (r.ocultas ? '<p class="sub">' + esc(t('midia.ocultas', { n: r.ocultas })) + '</p>' : '') +
    (pode('contribuir')
      ? '<p><input type="file" id="arqs" multiple accept="image/*,video/*,audio/*,.pdf"> ' +
        '<button class="btn" onclick="enviarArquivos(document.getElementById(\\'arqs\\').files)">' +
        esc(t('midia.enviar')) + '</button></p><p class="sub" id="envio"></p>' : '<p id="envio"></p>') +
    (itens.some(function (m) { return m.status === 'aguardando'; })
      ? '<p class="sub">' + esc(t('midia.aguardando_explica')) + '</p>' : '') +
    (pode('restaurar')
      ? '<p class="sub"><a href="#" onclick="telaLixeira();return false">' + esc(t('lixeira.titulo')) + '</a></p>' : '') +
    (itens.length
      ? grupos.map(function (par) {
          const ano = par[0], doAno = par[1];
          return '<h3 class="periodo">' + esc(ano || t('midia.sem_data')) +
            ' <span class="sub">' + doAno.length + '</span></h3>' +
            '<div class="grade">' + doAno.map(function (m) {
              // SO FOTO TEM MINIATURA. Pedir imagem para um PDF ou um
              // video devolvia uma celula cinza; com o titulo vazio (que e
              // o normal nesses arquivos), a legenda tambem sumia — e o
              // item ficava indistinguivel de NADA na tela. Quem enviou
              // concluiu, com razao, que o envio nao tinha funcionado.
              const ehFoto = m.tipo === 'FOTO';
              const icone = m.tipo === 'VIDEO' ? '\u{1F3AC}' : m.tipo === 'AUDIO' ? '\u{1F3B5}'
                : m.tipo === 'DOCUMENTO' ? '\u{1F4C4}' : '\u{1F5BC}';
              const rotulo = m.titulo || m.nome_original || t('midia.tipo_' + m.tipo.toLowerCase());
              return '<figure class="cel"' +
                (ehFoto ? ' data-thumb="' + (m.thumb_id || m.id) + '"' : '') + '>' +
                '<label class="marca-sel"><input type="checkbox"' +
                  (ESCOLHIDAS.has(m.id) ? ' checked' : '') +
                  ' onchange="marcar(\\'' + m.id + '\\', this.checked)" aria-label="' +
                  esc(t('midia.escolher')) + '"></label>' +
                '<div class="ph' + (ehFoto ? '' : ' arquivo') + '" onclick="verMidia(\\'' + m.id + '\\')">' +
                  (ehFoto ? '' : '<span class="icone">' + icone + '</span>') + '</div>' +
                '<figcaption>' + esc(rotulo) +
                (m.status !== 'pronta' ? '<br><span class="papel">' + esc(t('midia.' +
                  (m.status === 'quarentena' ? 'quarentena' : m.status === 'falhou' ? 'falhou'
                    : m.status === 'aguardando' ? 'aguardando' : 'processando'))) + '</span>' : '') +
                (m.pessoas ? '<br><span class="sub">' + m.pessoas + ' 👤</span>' : '') +
                '</figcaption></figure>'; }).join('') + '</div>'; }).join('') +
        // Paginação: sempre do mesmo tamanho, sempre com caminho de volta.
        '<p class="paginacao">' +
          (PAG.pilha.length > 1
            ? '<button class="btn sec" onclick="memorias(\\'ant\\')">&larr; ' + esc(t('midia.anterior')) + '</button> '
            : '') +
          '<span class="sub">' + esc(t('midia.pagina', { n: PAG.n })) + '</span>' +
          (PAG.proximo
            ? ' <button class="btn sec" onclick="memorias(\\'prox\\')">' + esc(t('midia.proxima')) + ' &rarr;</button>'
            : '') +
        '</p>'
      : vazio(t(temFiltro ? 'midia.nada_no_filtro' : 'midia.sem_midias'),
          t(temFiltro ? 'midia.nada_no_filtro_p' : 'midia.sem_midias_p'),
          temFiltro
            ? '<p><button class="btn" onclick="limparFiltro()">' + esc(t('midia.limpar_filtro')) + '</button></p>'
            : (pode('contribuir')
              ? '<p><button class="btn emocional" onclick="document.getElementById(\\'arqs\\').click()">' +
                esc(t('midia.enviar')) + '</button></p>' : ''))));
  carregarMiniaturasVisiveis();
}

// VIRTUALIZAÇÃO DA GALERIA. Antes, cada célula desenhada pedia a PRÓPRIA
// URL assinada assim que a grade aparecia: 300 fotos = 300 requisições e
// 300 imagens baixadas de uma vez, a maioria fora da tela. Com o acervo de
// uma família inteira isso trava o celular.
//
// Duas medidas nativas, sem biblioteca nenhuma:
//   1. content-visibility no CSS: o navegador PULA a renderização do que
//      está fora da tela (o tamanho reservado evita a barra de rolagem
//      pulando);
//   2. este observador: a URL assinada e a imagem só são pedidas quando a
//      célula chega perto da janela — e cada célula é observada uma vez só.
// TRÊS CAMINHOS DE PROPÓSITO. O observador é o eficiente, mas ele depende
// do navegador estar desenhando quadros — e há situações em que não está.
// Uma galeria que aposta só nele mostra a grade INTEIRA em cinza se ele
// não disparar, e isso é pior do que baixar demais. Então: as primeiras
// células pintam sempre, o observador cuida do resto, e a rolagem serve de
// rede — nenhuma delas sozinha decide se a foto aparece.
let OBSERVADOR = null, ROLAGEM_LIGADA = false;
const PRIMEIRAS = 30;

function carregarMiniaturasVisiveis() {
  if (OBSERVADOR) { OBSERVADOR.disconnect(); OBSERVADOR = null; }
  const celulas = [...document.querySelectorAll('.cel[data-thumb]')];
  if (!celulas.length) return;

  celulas.slice(0, PRIMEIRAS).forEach(pintarMiniatura);          // 1. o que cabe na tela
  const resto = celulas.slice(PRIMEIRAS);
  if (!resto.length) return;

  if ('IntersectionObserver' in window) {                        // 2. o eficiente
    OBSERVADOR = new IntersectionObserver((entradas, obs) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        obs.unobserve(e.target);
        pintarMiniatura(e.target);
      }
    }, { rootMargin: '500px' });
    for (const cel of resto) OBSERVADOR.observe(cel);
  }

  if (!ROLAGEM_LIGADA) {                                         // 3. a rede
    ROLAGEM_LIGADA = true;
    let agendado = false;
    addEventListener('scroll', () => {
      if (agendado) return;
      agendado = true;
      setTimeout(() => {
        agendado = false;
        for (const cel of document.querySelectorAll('.cel[data-thumb]:not([data-pintada])')) {
          const r = cel.getBoundingClientRect();
          if (r.top < innerHeight + 500 && r.bottom > -500) pintarMiniatura(cel);
        }
      }, 150);
    }, { passive: true });
  }
}

function pintarMiniatura(cel) {
  if (cel.dataset.pintada) return;
  cel.dataset.pintada = '1';
  urlDe(cel.dataset.thumb).then(u => {
    const ph = cel.querySelector('.ph');
    if (u && ph) ph.style.backgroundImage = 'url(' + u + ')';
  });
}

async function verMidia(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/midias/' + id);
  if (deuErro(r)) return $(colecao(t('midia.titulo'), falhou(r, 'memorias()')));
  const m = r.midia;
  // CADA TIPO SE ABRE DO SEU JEITO. Foto pede miniatura; video e audio
  // pedem o proprio arquivo com controles; documento pede um caminho para
  // ABRIR. Mandar tudo para uma tag <img> deixava PDF e video invisiveis —
  // guardados no acervo e inalcancaveis na tela.
  const ehFoto = m.tipo === 'FOTO';
  const u = await urlDe(ehFoto
    ? ((r.derivados.find(d => d.papel === 'THUMB') || {}).id || id)
    : id);
  const legenda = m.descricao ? '<figcaption>' + esc(m.descricao) + '</figcaption>' : '';
  const visor = !u ? ''
    : ehFoto
      ? '<figure class="foto"><img src="' + u + '" alt="' + esc(m.titulo || t('midia.sem_legenda')) + '">' + legenda + '</figure>'
      : m.tipo === 'VIDEO'
        ? '<figure class="foto"><video src="' + u + '" controls playsinline style="max-width:100%"></video>' + legenda + '</figure>'
        : m.tipo === 'AUDIO'
          ? '<figure class="foto"><audio src="' + u + '" controls style="width:100%"></audio>' + legenda + '</figure>'
          : '<figure class="foto arquivo-grande"><span class="icone">\u{1F4C4}</span>' +
            '<p><a class="btn" href="' + u + '" target="_blank" rel="noopener">' +
            esc(t('midia.abrir_arquivo')) + '</a></p>' + legenda + '</figure>';

  // A FOTO É O ASSUNTO da página: ela vem primeiro, sem moldura pesada, e
  // a legenda embaixo como numa página de álbum. Fundo escuro atrás porque
  // foto antiga costuma ter margem clara e some no papel.
  $(topo() + '<p class="sub"><a href="#" onclick="memorias();return false">← ' + esc(t('midia.titulo')) + '</a></p>' +
    visor +
    '<h2 style="margin:18px 0 4px">' + esc(m.titulo || m.nome_original || t('midia.titulo')) + '</h2>' +
    '<p class="sub" style="margin:0 0 6px">' +
      [m.capturada_valor, m.local_texto].filter(Boolean).map(esc).join(' · ') + '</p>' +
    '<h3>' + esc(t('midia.quem_aparece')) + '</h3>' +
    ((r.pessoas || []).length
      ? r.pessoas.map(x => '<div class="linha"><span>' +
          (x.origem === 'IA_SUGERIDA'
            ? esc(t('midia.possivelmente', { nome: x.nome_exibicao, pct: x.confianca || '?' }))
            : '<a href="#" onclick="dossie(\\'' + x.person_id + '\\');return false">' + esc(x.nome_exibicao) + '</a>') +
          (x.confirmado_em ? ' <span class="sub">' + esc(t('midia.confirmada_por',
            { nome: x.confirmado_por_nome || '', data: new Date(x.confirmado_em).toLocaleDateString(IDIOMA) })) + '</span>' : '') +
          '</span>' + (x.origem === 'IA_SUGERIDA' && pode('contribuir')
            ? '<button class="btn mini" onclick="confirmarPessoa(\\'' + x.id + '\\',\\'' + id + '\\')">' +
              esc(t('midia.confirmar')) + '</button>' : '') + '</div>').join('')
      : vazio(t('midia.sem_pessoas'), t('midia.sem_pessoas_p'))) +
    ((r.contribuicoes || []).length
      ? '<h3>' + esc(t('contribuicao.titulo')) + '</h3>' + r.contribuicoes.map(c =>
          '<div class="card" style="padding:16px"><p style="margin:0 0 6px">' + esc(c.corpo) + '</p>' +
          '<p class="sub" style="margin:0">' + esc(t('contribuicao.por')) + ' <strong>' +
          esc(c.autor_nome || '') + '</strong> · ' + esc(new Date(c.created_at).toLocaleDateString(IDIOMA)) +
          '</p></div>').join('')
      : '') +
    (m.tipo === 'DOCUMENTO' ? '<div id="doc-ia"></div>' : '') +
    (m.tipo === 'FOTO' && !m.derivado_de ? '<div id="estudio"></div>' : '') +
    (pode('contribuir') ? formHistoria(id) : '') +
    '<p class="sub" style="margin-top:20px">' + esc(t('midia.original_intacto')) + '</p>' +
    // ARREPENDIMENTO É CASO NORMAL. A rota de arquivar existe desde o 1.0
    // e nenhuma tela chamava: quem mandou a foto errada não tinha saída.
    '<div class="acoes">' +
    (pode('contribuir')
      ? '<button class="btn sec" onclick="porNoAlbum(\\'' + id + '\\')">' +
        esc(t('album.por_nesta')) + '</button>' : '') +
    (pode('excluir')
      ? '<button class="btn sec" onclick="arquivarMidia(\\'' + id + '\\')">' +
        esc(t('midia.arquivar')) + '</button>' : '') + '</div>');
  if (m.tipo === 'DOCUMENTO') carregarAchados(id);
  if (m.tipo === 'FOTO' && !m.derivado_de) carregarEstudio(id);
  if (pode('contribuir')) {
    const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
    const sel = document.getElementById('hq');
    if (sel) sel.innerHTML = (l.pessoas || []).map(x =>
      '<option value="' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
  }
}

function formHistoria(id) {
  const campo = (chave, idc, dica) => '<label for="' + idc + '">' + esc(t('historia.' + chave)) + '</label>' +
    '<input id="' + idc + '"' + (dica ? ' placeholder="' + esc(dica) + '"' : '') + '>';
  return '<h3 style="margin-top:26px">' + esc(t('historia.titulo')) + '</h3>' +
    '<p class="sub">' + esc(t('historia.intro')) + '</p>' +
    '<label for="hq">' + esc(t('historia.quem')) + '</label><select id="hq" multiple size="4"></select>' +
    campo('quando', 'hw', t('pessoa.ajuda_data')) +
    campo('onde', 'ho') +
    campo('titulo_curto', 'ht') +
    campo('ocasiao', 'hc') +
    campo('aconteceu', 'ha') +
    campo('porque_importa', 'hp') +
    '<p><button class="btn" onclick="guardarHistoria(\\'' + id + '\\')">' + esc(t('historia.guardar')) + '</button></p>';
}

async function guardarHistoria(id) {
  const sel = document.getElementById('hq');
  const r = await api('POST', '/familias/' + FAM.id + '/midias/' + id + '/historia', {
    pessoas: [...sel.selectedOptions].map(o => o.value),
    quando: document.getElementById('hw').value, onde: document.getElementById('ho').value,
    titulo: document.getElementById('ht').value, ocasiao: document.getElementById('hc').value,
    aconteceu: document.getElementById('ha').value,
    porque_importa: document.getElementById('hp').value });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verMidia(id);
}

// ------------------------------------------ Guardiões do legado (3.3b)
// A tela explica as barreiras ANTES de o primeiro guardião existir. Quem
// não entende que nada acontece sozinho ou não indica ninguém (e o acervo
// fica sem sucessão) ou indica com medo do que não vai acontecer.
async function telaGuardioes() {
  aguarde(t('guardiao.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/guardioes');
  if (deuErro(r)) return $(colecao(t('guardiao.titulo'), falhou(r, 'telaGuardioes()')));
  const dt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('guardiao.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('guardiao.intro')) + '</p>' +
    '<p class="sub"><strong>' + esc(t('guardiao.nada_automatico')) + '</strong></p>' +
    '<p class="sub">' + esc(t('guardiao.voce_e_avisado')) + '</p>' +
    (pode('guardioes.gerenciar')
      ? '<p><button class="btn" onclick="novoGuardiao()">' + esc(t('guardiao.novo')) + '</button></p>'
      : '') +
    ((r.guardioes || []).length
      ? r.guardioes.map(g => '<div class="linha"><span>' +
          '<strong>' + esc(g.nome_conta || g.nome || g.email) + '</strong><br>' +
          '<span class="sub">' + esc(g.email) + ' · ' +
            esc(t('guardiao.' + (g.status === 'ativo' ? 'ativo' : 'convidado'))) + '</span></span>' +
          '<span>' +
            (g.status === 'convidado'
              ? '<button class="btn mini" onclick="aceitarGuardiao(\\'' + g.id + '\\')">' +
                esc(t('guardiao.aceitar')) + '</button> ' : '') +
            (pode('guardioes.gerenciar')
              ? '<button class="btn mini" onclick="removerGuardiao(\\'' + g.id + '\\')">' +
                esc(t('guardiao.remover')) + '</button>' : '') +
          '</span></div>').join('')
      : vazio(t('guardiao.nenhum'), t('guardiao.nenhum_p'))) +
    '<h3>' + esc(t('guardiao.pedidos')) + '</h3>' +
    ((r.pedidos || []).length
      ? r.pedidos.map(p => '<div class="linha"><span>' +
          '<strong>' + esc(t('guardiao.st_' + p.status) || p.status) + '</strong> ' +
          '<span class="sub">' + esc(t('guardiao.sobre', { nome: p.sobre_nome || '' })) + '</span><br>' +
          '<span class="sub">' +
            esc(t('guardiao.confirmam', { n: p.confirmam, quorum: p.quorum_necessario })) +
            (p.contesta_ate ? ' · ' + esc(t('guardiao.prazo', { data: dt(p.contesta_ate) })) : '') +
          '</span></span>' +
          (['aguardando_quorum', 'aguardando_revisao', 'em_contestacao'].includes(p.status)
            ? '<span><button class="btn mini" onclick="derrubarSucessao(\\'' + p.id + '\\')">' +
              esc(t('guardiao.derrubar')) + '</button></span>' : '<span></span>') +
          '</div>').join('')
      : vazio(t('guardiao.nenhum_pedido'), t('guardiao.nenhum_pedido_p'))));
}

async function novoGuardiao() {
  const email = prompt(t('guardiao.email'));
  if (!email) return;
  const r = await api('POST', '/familias/' + FAM.id + '/guardioes', { email });
  if (deuErro(r)) return alert(r.erro);
  telaGuardioes();
}

async function aceitarGuardiao(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/guardioes/' + id + '/aceitar');
  if (deuErro(r)) return alert(r.erro);
  telaGuardioes();
}

async function removerGuardiao(id) {
  const r = await api('DELETE', '/familias/' + FAM.id + '/guardioes/' + id);
  if (deuErro(r)) return alert(r.erro);
  telaGuardioes();
}

async function derrubarSucessao(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/sucessoes/' + id + '/contestar', {});
  if (deuErro(r)) return alert(r.erro);
  telaGuardioes();
}

// --------------------------------------------- Cápsula do tempo (3.3)
// A tela diz o que a cápsula É antes de existir a primeira: quem não
// entende que ninguém pode ler antes da hora escreve a carta errada.
async function telaCapsulas() {
  aguarde(t('capsula.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/capsulas');
  if (deuErro(r)) return $(colecao(t('capsula.titulo'), falhou(r, 'telaCapsulas()')));
  const dt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('capsula.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('capsula.intro')) + '</p>' +
    '<p class="sub"><strong>' + esc(t('capsula.lacre')) + '</strong> ' + esc(t('capsula.chave')) + '</p>' +
    (pode('capsulas.criar')
      ? '<p><button class="btn" onclick="novaCapsula()">' + esc(t('capsula.nova')) + '</button></p>'
      : '') +
    ((r.capsulas || []).length
      ? r.capsulas.map(c => '<div class="linha"><span>' +
          '<strong>' + esc(c.titulo) + '</strong> ' +
          '<span class="sub">' + esc(t('capsula.de', { autor: c.autor || '' })) + '</span><br>' +
          '<span class="sub">' + esc(c.recado || '') + (c.recado ? ' · ' : '') +
            esc(c.status === 'aberta' ? t('capsula.aberta', { data: dt(c.aberta_em) })
              : c.motivo ? t('erro.' + c.motivo)
                : c.condicao === 'IDADE'
                  ? t('capsula.abre_idade', { pessoa: c.para || '', idade: c.abre_na_idade })
                  : t('capsula.abre_em', { data: dt(c.abre_em) })) + '</span></span>' +
          '<span>' +
            (c.pode_abrir || c.status === 'aberta'
              ? '<button class="btn mini" onclick="abrirCapsula(\\'' + c.id + '\\')">' +
                esc(t('capsula.abrir')) + '</button> ' : '') +
            (c.status === 'lacrada'
              ? '<button class="btn mini" onclick="cancelarCapsula(\\'' + c.id + '\\')">' +
                esc(t('capsula.cancelar')) + '</button>' : '') +
          '</span></div>').join('')
      : vazio(t('capsula.nenhuma'), t('capsula.nenhuma_p'))));
}

async function novaCapsula() {
  const titulo = prompt(t('capsula.campo_titulo'));
  if (!titulo) return;
  const corpo = prompt(t('capsula.campo_corpo'));
  if (!corpo) return;
  const data = prompt(t('capsula.quando') + ' — ' + t('capsula.por_data') + ' (AAAA-MM-DD)');
  if (!data) return;
  const r = await api('POST', '/familias/' + FAM.id + '/capsulas',
    { titulo, corpo, condicao: 'DATA', abre_em: data, recado: '' });
  if (deuErro(r)) return alert(r.erro);
  telaCapsulas();
}

async function abrirCapsula(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/capsulas/' + id + '/abrir');
  if (deuErro(r)) return alert(r.erro);
  $(topo() + '<p><a href="#" onclick="telaCapsulas();return false">&larr; ' +
    esc(t('capsula.titulo')) + '</a></p>' +
    '<h2>' + esc(r.titulo) + '</h2>' +
    (r.recado ? '<p class="sub">' + esc(r.recado) + '</p>' : '') +
    '<p>' + esc(r.corpo).replace(/\\n/g, '<br>') + '</p>');
}

async function cancelarCapsula(id) {
  if (!confirm(t('capsula.confirmar_cancelar'))) return;
  const r = await api('DELETE', '/familias/' + FAM.id + '/capsulas/' + id);
  if (deuErro(r)) return alert(r.erro);
  telaCapsulas();
}

// ------------------------------------------------ Origena Criar (3.2)
// O livro é um RECORTE do acervo, feito por alguém. A tela diz isso antes
// de o primeiro PDF existir — senão a família conclui que o livro é "tudo".
async function telaLivros() {
  aguarde(t('livro.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/livros');
  if (deuErro(r)) return $(colecao(t('livro.titulo'), falhou(r, 'telaLivros()')));
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('livro.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('livro.intro')) + '</p>' +
    '<p class="sub">' + esc(t('livro.recorte')) + '</p>' +
    // Três formatos DIFERENTES, não três ações do mesmo peso: cada um é
    // uma escolha, e a escolha se apresenta antes de o botão aparecer.
    (pode('exportar')
      ? '<div class="portas">' +
        [['livro.gerar', 'livro.d_familia', 'pedirLivro()'],
          ['livro.gerar_album', 'livro.d_album', 'pedirScrapbook()'],
          ['livro.gerar_ano', 'livro.d_ano', 'pedirRetrospectiva()']].map(x =>
          '<div class="porta"><b>' + esc(t(x[1] + '_t')) + '</b><span>' + esc(t(x[1])) + '</span>' +
          '<div class="acoes"><button class="btn mini" onclick="' + x[2] + '">' +
          esc(t(x[0])) + '</button></div></div>').join('') +
        '</div>' +
        '<p class="sub">' + esc(t('livro.so_com_data')) + '</p>'
      : '') +
    ((r.livros || []).length
      ? r.livros.map(l => '<div class="linha"><span>' +
          '<span class="sub">' + esc(t('livro.t_' + l.tipo,
            { album: l.album || '', ano: l.ano || '' }) || l.tipo) + '</span><br>' +
          '<strong>' + esc(l.status === 'pronto'
            ? t('livro.pronto', { n: l.paginas, kb: Math.round(l.bytes / 1024) })
            : l.status === 'falhou' ? t('livro.falhou', { motivo: l.erro || '' })
              : t('livro.gerando')) + '</strong><br>' +
          '<span class="sub">' + esc(t('livro.conteudo', {
            pessoas: (l.conteudo || {}).pessoas || 0, historias: (l.conteudo || {}).historias || 0,
            tradicoes: (l.conteudo || {}).tradicoes || 0, fotos: (l.conteudo || {}).fotos || 0 })) +
            ' · ' + esc(t('livro.pedido_por', { nome: l.pedido_por || '' })) + '</span></span>' +
          (l.status === 'pronto'
            ? '<span><button class="btn mini" onclick="baixarLivro(\\'' + l.id + '\\')">' +
              esc(t('livro.baixar')) + '</button></span>' : '<span></span>') +
          '</div>').join('')
      : vazio(t('livro.nenhum'), t('livro.nenhum_p'))));
}

async function pedirLivro(pessoaId) {
  return novoLivro(pessoaId ? { tipo: 'pessoa', pessoa: pessoaId } : { tipo: 'familia' });
}

// O scrapbook é de UM álbum: sem álbum montado não há o que imprimir, e
// dizer isso é melhor que abrir uma lista vazia.
// Escolher o álbum do scrapbook é a MESMA pergunta de "em qual álbum guardo
// esta foto", vista do outro lado — e por isso usa a mesma tela.
const pedirScrapbook = () => telaEscolherAlbum('livro');

async function pedirRetrospectiva() {
  const ano = prompt(t('livro.escolher_ano'), String(new Date().getFullYear()));
  if (!ano) return;
  return novoLivro({ tipo: 'retrospectiva', ano: Number(ano) });
}

async function novoLivro(corpo) {
  const r = await api('POST', '/familias/' + FAM.id + '/livros', corpo);
  if (deuErro(r)) return alert(r.erro);
  alert(t('livro.na_fila'));
  telaLivros();
}

async function baixarLivro(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/livros/' + id);
  if (deuErro(r) || !r.url) return alert(t('livro.gerando'));
  window.open(r.url, '_blank', 'noopener');
}

// ------------------------------------------------------ grafo e mapa (2.5)
// O grafo se explica sozinho porque toda aresta traz o MOTIVO: "aparece
// na" foto tal, "aprendeu" a receita tal. Uma bolinha ligada a outra sem
// dizer por quê seria adivinhação com cara de dado.
const noRotulo = (n) => (t('grafo.t_' + n.tipo) || n.tipo) + ' · ' + (n.rotulo || '');

async function telaGrafo(tipo, id) {
  const r = await api('GET', '/familias/' + FAM.id + '/grafo/' + tipo + '/' + id);
  if (deuErro(r)) return $(colecao(t('grafo.titulo'), falhou(r)));
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('grafo.titulo')) + '</h2>' +
    '<p class="sub">' + esc(r.centro.rotulo) + ' — ' + esc(t('grafo.intro')) + '</p>' +
    ((r.vizinhos || []).length
      ? '<h3>' + esc(t('grafo.vizinhos')) + '</h3>' + r.vizinhos.map(v =>
          '<div class="linha"><span><span class="papel">' +
            esc(t('grafo.' + v.motivo.replace('grafo.', '')) || '') + '</span> ' +
            '<a href="#" onclick="abrirNo(\\'' + v.tipo + '\\',\\'' + v.id + '\\');return false">' +
            esc(v.rotulo) + '</a></span>' +
          '<span class="sub">' + esc(t('grafo.t_' + v.tipo) || v.tipo) + '</span></div>').join('')
      : vazio(t('grafo.sem_vizinhos'), t('grafo.sem_vizinhos_p'))) +
    '<h3 style="margin-top:26px">' + esc(t('grafo.caminho_titulo')) + '</h3>' +
    '<p class="sub">' + esc(t('grafo.caminho_de')) + ': ' + esc(r.centro.rotulo) + '</p>' +
    '<label for="gf_alvo">' + esc(t('grafo.caminho_para')) + '</label><select id="gf_alvo"></select>' +
    '<p><button class="btn" onclick="acharCaminho(\\'' + tipo + '\\',\\'' + id + '\\')">' +
      esc(t('grafo.procurar_caminho')) + '</button></p><div id="gf_res"></div>');
  const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
  const sel = document.getElementById('gf_alvo');
  if (sel) sel.innerHTML = (l.pessoas || []).map(x =>
    '<option value="person:' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
}

const abrirNo = (tipo, id) => tipo === 'person' ? dossie(id)
  : tipo === 'media' ? verMidia(id)
    : tipo === 'tradition' ? verTradicao(id)
      : tipo === 'heirloom' ? verReliquia(id)
        : tipo === 'interview' ? verEntrevista(id)
          : telaGrafo(tipo, id);

async function acharCaminho(tipo, id) {
  const alvo = val('gf_alvo');
  const r = await api('GET', '/familias/' + FAM.id + '/caminho?de=' +
    encodeURIComponent(tipo + ':' + id) + '&para=' + encodeURIComponent(alvo));
  const cx = document.getElementById('gf_res');
  if (deuErro(r)) { cx.innerHTML = aviso(r.erro); return; }
  if (!r.passos || !r.passos.length) {
    cx.innerHTML = vazio(t('grafo.sem_caminho', { n: 4 }), t('grafo.sem_caminho_p'));
    return;
  }
  cx.innerHTML = '<p class="sub">' + esc(t('grafo.saltos', { n: r.saltos })) + '</p>' +
    r.passos.map((p, i) => '<div class="linha"><span>' +
      (i ? '<span class="papel">' + esc(t('grafo.' + p.motivo.replace('grafo.', '')) || '') +
        '</span> ' : '') +
      '<a href="#" onclick="abrirNo(\\'' + p.tipo + '\\',\\'' + p.id + '\\');return false">' +
      esc(p.rotulo) + '</a></span><span class="sub">' +
      esc(t('grafo.t_' + p.tipo) || p.tipo) + '</span></div>').join('');
}

// ---------------------------------------------------------------- mapa
// Sem tile de terceiro (a CSP não deixa, e não precisa): projeção simples
// dos lugares da própria família, com grade e escala. O que interessa é a
// relação entre os pontos — de onde vieram, para onde foram.
async function telaMapa() {
  const r = await api('GET', '/familias/' + FAM.id + '/mapa');
  if (deuErro(r)) return $(colecao(t('mapa.titulo'), falhou(r, 'telaMapa()')));
  const comCoord = (r.lugares || []).filter(l => l.lat != null && l.lon != null);
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('mapa.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('mapa.intro')) + '</p>' +
    (comCoord.length ? desenhoMapa(comCoord, r.migracoes || [])
      : vazio(t('mapa.sem_lugares'), t('mapa.sem_lugares_p'))) +
    (comCoord.length
      ? comCoord.map(l => '<div class="linha"><span><strong>' + esc(l.nome) + '</strong>' +
          (l.uf ? ' <span class="sub">' + esc(l.uf) + '</span>' : '') + '</span>' +
          '<span class="sub">' + esc(t('mapa.no_lugar', { pessoas: l.pessoas.join(', ') || '—',
            eventos: l.eventos, midias: l.midias })) + '</span></div>').join('')
      : '') +
    ((r.migracoes || []).length
      ? '<h3 style="margin-top:26px">' + esc(t('mapa.migracoes')) + '</h3>' +
        r.migracoes.map(m => '<p class="sub" style="margin:4px 0">' +
          esc(t('mapa.migracao_de', { nome: m.nome, caminho: m.passos.map(p =>
            (nomeDoLugar(r.lugares, p.lugar_id)) + (p.quando ? ' (' + p.quando + ')' : ''))
            .join(' → ') })) + '</p>').join('')
      : '') +
    ((r.sem_coordenada || []).length
      ? '<h3 style="margin-top:26px">' + esc(t('mapa.sem_coordenada_titulo')) + '</h3>' +
        '<p class="sub">' + esc(t('mapa.sem_coordenada', { lista: r.sem_coordenada.join(', ') })) + '</p>'
      : '') +
    ((r.nao_reconhecidos || []).length
      ? '<h3 style="margin-top:26px">' + esc(t('mapa.nao_reconhecidos_titulo')) + '</h3>' +
        '<p class="sub">' + esc(t('mapa.nao_reconhecidos')) + '</p>' +
        r.nao_reconhecidos.map(x => '<div class="linha"><span>' + esc(x.texto) + '</span>' +
          '<span class="sub">' + esc(t('mapa.citado', { n: x.n })) + '</span></div>').join('')
      : ''));
}

const nomeDoLugar = (lugares, id) => (lugares.find(l => l.id === id) || {}).nome || '?';

function desenhoMapa(lugares, migracoes) {
  const L = 720, A = 420, M = 40;
  const lats = lugares.map(l => l.lat), lons = lugares.map(l => l.lon);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats);
  const minLo = Math.min(...lons), maxLo = Math.max(...lons);
  // margem mínima para o caso de um lugar só (ou todos na mesma cidade)
  const dLa = Math.max(maxLa - minLa, 0.5), dLo = Math.max(maxLo - minLo, 0.5);
  const x = (lon) => M + ((lon - (minLo + maxLo) / 2) / dLo + 0.5) * (L - 2 * M);
  const y = (lat) => M + (0.5 - (lat - (minLa + maxLa) / 2) / dLa) * (A - 2 * M);
  const posicao = {};
  lugares.forEach(l => { posicao[l.id] = { x: x(l.lon), y: y(l.lat) }; });

  const linhas = migracoes.slice(0, 24).map((m, i) => m.passos.slice(1).map((p, k) => {
    const a = posicao[m.passos[k].lugar_id], b = posicao[p.lugar_id];
    if (!a || !b) return '';
    return '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) +
      '" y2="' + b.y.toFixed(1) + '" stroke="var(--tema)" stroke-width="1.5" opacity="0.45" ' +
      'marker-end="url(#seta)"><title>' + esc(m.nome) + '</title></line>';
  }).join('')).join('');

  const pontos = lugares.map(l => {
    const p = posicao[l.id];
    const peso = Math.min(4 + (l.eventos + l.midias + l.pessoas.length), 14);
    return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + peso +
      '" fill="var(--tema)" opacity="0.75"><title>' + esc(l.nome) + '</title></circle>' +
      '<text x="' + (p.x + peso + 4).toFixed(1) + '" y="' + (p.y + 4).toFixed(1) +
      '" font-size="12" fill="var(--tinta)">' + esc(l.nome) + '</text>';
  }).join('');

  // grade: uma referência honesta de escala, sem fingir cartografia
  const grade = [0.25, 0.5, 0.75].map(f =>
    '<line x1="' + (M + f * (L - 2 * M)) + '" y1="' + M + '" x2="' + (M + f * (L - 2 * M)) +
      '" y2="' + (A - M) + '" stroke="var(--borda)" stroke-width="1"/>' +
    '<line x1="' + M + '" y1="' + (M + f * (A - 2 * M)) + '" x2="' + (L - M) +
      '" y2="' + (M + f * (A - 2 * M)) + '" stroke="var(--borda)" stroke-width="1"/>').join('');

  const kmPorGrau = 111;
  return '<div class="card" style="padding:10px;overflow-x:auto">' +
    '<svg viewBox="0 0 ' + L + ' ' + A + '" width="100%" role="img" aria-label="' +
      esc(t('mapa.titulo')) + '">' +
    '<defs><marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" ' +
      'markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--tema)"/></marker></defs>' +
    grade + linhas + pontos +
    '<text x="' + M + '" y="' + (A - 10) + '" font-size="11" fill="var(--suave)">' +
      esc(t('mapa.escala', { n: Math.round(dLa * kmPorGrau) })) + '</text>' +
    '</svg></div>';
}

// ---------------------------------------------------------- entrevistas
// A tela é um roteiro que anda com quem conta: uma pergunta por vez, o
// botão de gravar do lado, e nada que obrigue a terminar hoje. O ÁUDIO é
// o que importa — a transcrição vem depois, e é corrigível.
let ENTREVISTA = null, GRAVADOR = null, GRAVANDO = null, CRONO = null;

async function telaEntrevistas() {
  aguarde(t('entrevista.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/entrevistas');
  if (deuErro(r)) return $(colecao(t('entrevista.titulo'), falhou(r, 'telaEntrevistas()')));
  const roteiros = r.roteiros || [];
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('entrevista.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('entrevista.intro')) + '</p>' +
    (r.transcricao_disponivel ? '' :
      '<p class="sub">' + esc(t('entrevista.sem_transcricao_provedor')) + '</p>') +
    ((r.entrevistas || []).length
      ? r.entrevistas.map(e => '<div class="linha"><span>' +
          '<a href="#" onclick="verEntrevista(\\'' + e.id + '\\');return false"><strong>' +
            esc(t('entrevista.r_' + e.roteiro) || e.roteiro) + '</strong></a> — ' +
            esc(e.pessoa_nome) + '</span>' +
          '<span class="sub">' + esc(t('entrevista.progresso',
            { n: e.respondidas, total: e.total })) + '</span></div>').join('')
      : vazio(t('entrevista.sem_entrevistas'), t('entrevista.sem_entrevistas_p'))) +
    (pode('contribuir')
      ? '<h3 style="margin-top:26px">' + esc(t('entrevista.nova')) + '</h3>' +
        '<label for="ev_p">' + esc(t('entrevista.escolha_pessoa')) + '</label><select id="ev_p"></select>' +
        '<label for="ev_r">' + esc(t('entrevista.escolha_roteiro')) + '</label><select id="ev_r">' +
          roteiros.map(x => '<option value="' + x.chave + '">' +
            esc(t('entrevista.r_' + x.chave)) + ' — ' + esc(t('entrevista.d_' + x.chave)) +
            '</option>').join('') + '</select>' +
        '<p><button class="btn" onclick="criarEntrevista()">' + esc(t('entrevista.comecar')) +
        '</button></p>'
      : ''));
  if (pode('contribuir')) {
    const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
    const sel = document.getElementById('ev_p');
    if (sel) sel.innerHTML = (l.pessoas || []).map(x =>
      '<option value="' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
  }
}

async function criarEntrevista() {
  const r = await api('POST', '/familias/' + FAM.id + '/entrevistas',
    { pessoa: val('ev_p'), roteiro: val('ev_r') });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verEntrevista(r.entrevista.id);
}

const rotuloPergunta = (x) => x.pergunta_chave === 'livre'
  ? x.pergunta_livre : (t('entrevista.' + x.pergunta_chave) || x.pergunta_chave);

async function verEntrevista(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/entrevistas/' + id);
  if (deuErro(r)) return $(colecao(t('entrevista.titulo'), falhou(r, 'telaEntrevistas()')));
  const e = r.entrevista;
  ENTREVISTA = { id, transcricao: r.transcricao_disponivel };
  const feitas = e.respostas.filter(x => x.status === 'transcrita' || x.status === 'gravada').length;

  $(topo() + '<p class="sub"><a href="#" onclick="telaEntrevistas();return false">← ' +
      esc(t('entrevista.titulo')) + '</a></p>' +
    '<h2>' + esc(t('entrevista.de', { nome: e.pessoa_nome })) + '</h2>' +
    '<p class="sub">' + esc(t('entrevista.r_' + e.roteiro) || e.roteiro) + ' · ' +
      esc(t('entrevista.progresso', { n: feitas, total: e.respostas.length })) +
      (e.status === 'concluida'
        ? ' · ' + esc(t('entrevista.concluida', { data: new Date(e.concluida_em).toLocaleDateString(IDIOMA) }))
        : ' · ' + esc(t('entrevista.em_andamento'))) + '</p>' +
    '<p class="sub">' + esc(t('entrevista.audio_preservado')) + '</p>' +
    e.respostas.map(x => cardResposta(x, id)).join('') +
    (pode('contribuir')
      ? '<h3 style="margin-top:26px">' + esc(t('entrevista.acrescentar')) + '</h3>' +
        '<input id="ev_nova" placeholder="' + esc(t('entrevista.pergunta_nova')) + '">' +
        '<p><button class="btn sec" onclick="novaPergunta(\\'' + id + '\\')">' +
          esc(t('entrevista.acrescentar')) + '</button>' +
        (e.status === 'em_andamento'
          ? ' <button class="btn" onclick="concluirEntrevista(\\'' + id + '\\')">' +
            esc(t('entrevista.concluir')) + '</button>' : '') + '</p>'
      : ''));
  for (const x of e.respostas) if (x.media_id) tocarAudio(x.id, x.media_id);
  await opcoesDePessoa();
}

function cardResposta(x, entrevistaId) {
  const podeEditar = pode('contribuir');
  const selo = x.transcricao_origem === 'ia' ? t('entrevista.transcricao_ia')
    : x.transcricao_origem === 'ia_corrigida' ? t('entrevista.transcricao_ia_corrigida')
      : x.transcricao_origem === 'humana' ? t('entrevista.transcricao_humana') : '';
  return '<div class="card" style="padding:18px;text-align:left" id="rp_' + x.id + '">' +
    '<p style="margin:0 0 10px"><strong>' + esc(rotuloPergunta(x)) + '</strong>' +
      (x.status === 'pulada' ? ' <span class="papel">' + esc(t('entrevista.pulada')) + '</span>' : '') +
    '</p>' +
    '<div id="au_' + x.id + '"></div>' +
    (podeEditar
      ? '<p style="margin:8px 0">' +
        '<button class="btn mini" id="gv_' + x.id + '" onclick="alternarGravacao(\\'' + x.id + '\\')">' +
          esc(x.media_id ? t('entrevista.regravar') : t('entrevista.gravar')) + '</button> ' +
        '<label class="btn mini sec" style="cursor:pointer" for="tx_">' + esc(t('entrevista.enviar_arquivo')) +
          '<input type="file" accept="audio/*" style="display:none" ' +
          'onchange="audioDoArquivo(\\'' + x.id + '\\', this.files[0])"></label> ' +
        (x.status === 'pendente'
          ? '<button class="btn mini sec" onclick="pularPergunta(\\'' + x.id + '\\')">' +
            esc(t('entrevista.pular')) + '</button>' : '') +
        '</p>' : '') +
    (podeEditar
      ? area('tx_' + x.id, x.transcricao, t('entrevista.escrever')) +
        '<p style="margin:8px 0 0">' +
        '<button class="btn mini" onclick="salvarResposta(\\'' + x.id + '\\')">' +
          esc(t('entrevista.salvar_texto')) + '</button>' +
        (x.media_id && ENTREVISTA && ENTREVISTA.transcricao
          ? ' <button class="btn mini sec" onclick="transcreverResposta(\\'' + x.id + '\\')">' +
            esc(t('entrevista.transcrever')) + '</button>' : '') +
        (x.transcricao && pode('ia.usar')
          ? ' <button class="btn mini sec" onclick="entidadesDaResposta(\\'' + x.id + '\\')">' +
            esc(t('entrevista.entidades')) + '</button>' : '') +
        '</p>'
      : (x.transcricao ? '<p>' + esc(x.transcricao) + '</p>' : '')) +
    (selo ? '<p class="sub" style="margin:6px 0 0">' + esc(selo) + '</p>' : '') +
    ((x.achados || []).length
      ? '<div style="margin-top:10px">' + x.achados.map(a => linhaAchado(a, entrevistaId)).join('') + '</div>'
      : '');
}

/** Uma linha de sugestão, igual à do documento — o mesmo fluxo, outra fonte. */
function linhaAchado(a, entrevistaId) {
  if (a.status !== 'sugerido') {
    return '<p class="sub" style="margin:2px 0">' + esc(t('predicado.' + a.predicado) || a.predicado) +
      ': ' + esc(a.valor) + ' — ' + esc(a.status === 'aceito'
        ? t('documento.aceito', { nome: a.pessoa_nome || '' })
        : t('documento.descartado', { nome: a.decidido_por_nome || '' })) + '</p>';
  }
  return '<div class="linha"><span>' + esc(t('predicado.' + a.predicado) || a.predicado) +
    ': <strong>' + esc(a.valor) + '</strong>' +
    (a.pessoa_texto ? ' <span class="sub">— ' + esc(a.pessoa_texto) + '</span>' : '') + '</span>' +
    '<span><select id="ap_' + a.id + '" class="ap-pessoa"></select> ' +
    '<button class="btn mini" onclick="aceitarAchado(\\'' + a.id + '\\',\\'entrevista\\',\\'' + entrevistaId + '\\')">' +
      esc(t('documento.aceitar')) + '</button> ' +
    '<button class="btn mini sec" onclick="descartarAchado(\\'' + a.id + '\\',\\'entrevista\\',\\'' + entrevistaId + '\\')">' +
      esc(t('documento.descartar')) + '</button></span></div>';
}

async function tocarAudio(respostaId, mediaId) {
  const u = await urlDe(mediaId);
  const alvo = document.getElementById('au_' + respostaId);
  if (u && alvo) alvo.innerHTML = '<audio controls preload="none" src="' + u + '" style="width:100%"></audio>';
}

/**
 * Gravação no próprio navegador. O arquivo sai daqui para o R2 pelo mesmo
 * caminho de qualquer mídia (URL assinada), então o áudio da avó tem o
 * mesmo tratamento de uma foto: hash conferido, original imutável.
 */
async function alternarGravacao(respostaId) {
  const b = document.getElementById('gv_' + respostaId);
  if (GRAVANDO === respostaId) {
    GRAVADOR.stop();
    return;
  }
  if (GRAVANDO) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) return alert(t('entrevista.microfone_indisponivel'));
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (_) { return alert(t('entrevista.microfone_negado')); }

  const pedacos = [];
  GRAVADOR = new MediaRecorder(stream);
  GRAVANDO = respostaId;
  const inicio = Date.now();
  CRONO = setInterval(() => {
    b.textContent = t('entrevista.gravando', { seg: Math.round((Date.now() - inicio) / 1000) });
  }, 1000);
  GRAVADOR.ondataavailable = (ev) => { if (ev.data && ev.data.size) pedacos.push(ev.data); };
  GRAVADOR.onstop = async () => {
    clearInterval(CRONO); GRAVANDO = null;
    stream.getTracks().forEach(tr => tr.stop());
    b.textContent = t('entrevista.enviando');
    const blob = new Blob(pedacos, { type: GRAVADOR.mimeType || 'audio/webm' });
    await enviarAudioDaResposta(respostaId, blob, 'resposta.webm',
      Math.round((Date.now() - inicio) / 1000));
  };
  GRAVADOR.start();
  b.textContent = t('entrevista.parar');
}

const audioDoArquivo = (respostaId, file) => file
  && enviarAudioDaResposta(respostaId, file, file.name, null);

async function enviarAudioDaResposta(respostaId, blob, nome, duracao) {
  try {
    const buf = await blob.arrayBuffer();
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))]
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const prep = await api('POST', '/familias/' + FAM.id + '/midias/preparar', {
      nome, bytes: blob.size, sha256: sha, mime: blob.type || 'audio/webm', tipo: 'AUDIO' });
    if (deuErro(prep)) return alert(prep.erro);
    if (!prep.duplicado) {
      const put = await fetch(prep.url_envio, { method: 'PUT', body: blob,
        headers: { 'Content-Type': blob.type || 'application/octet-stream' } });
      if (!put.ok) return alert(t('erro.generico'));
      await api('POST', '/familias/' + FAM.id + '/midias/' + prep.media_id + '/confirmar');
    }
    const r = await api('POST', '/familias/' + FAM.id + '/respostas/' + respostaId + '/audio',
      { midia: prep.media_id, duracao_seg: duracao });
    if (deuErro(r)) return alert(r.erro);
    verEntrevista(ENTREVISTA.id);
  } catch (_) { alert(t('erro.generico')); }
}

async function salvarResposta(respostaId) {
  const r = await api('PATCH', '/familias/' + FAM.id + '/respostas/' + respostaId,
    { transcricao: val('tx_' + respostaId) });
  if (deuErro(r)) return alert(r.erro);
  verEntrevista(ENTREVISTA.id);
}

async function pularPergunta(respostaId) {
  await api('PATCH', '/familias/' + FAM.id + '/respostas/' + respostaId, { pular: true });
  verEntrevista(ENTREVISTA.id);
}

async function transcreverResposta(respostaId, confirmando) {
  const r = await api('POST', '/familias/' + FAM.id + '/respostas/' + respostaId + '/transcrever',
    confirmando ? { confirmar: true } : {});
  if (r.status === 503) return alert(t('ia.indisponivel'));
  if (deuErro(r)) return alert(r.erro);
  if (r.cotacao && !confirmando) {
    if (confirm(t('ia.custara', { n: r.cotacao.creditos }))) return transcreverResposta(respostaId, true);
    return;
  }
  verEntrevista(ENTREVISTA.id);
}

async function entidadesDaResposta(respostaId, confirmando) {
  const r = await api('POST', '/familias/' + FAM.id + '/respostas/' + respostaId + '/entidades',
    confirmando ? { confirmar: true } : {});
  if (r.status === 503) return alert(t('ia.indisponivel'));
  if (deuErro(r)) return alert(r.erro);
  if (r.cotacao && !confirmando) {
    if (confirm(t('ia.custara', { n: r.cotacao.creditos }))) return entidadesDaResposta(respostaId, true);
    return;
  }
  await verEntrevista(ENTREVISTA.id);
  if (!(r.achados || []).length) alert(t('documento.nada_encontrado'));
}

async function novaPergunta(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/entrevistas/' + id + '/perguntas',
    { texto: val('ev_nova') });
  if (deuErro(r)) return alert(r.erro);
  verEntrevista(id);
}

async function concluirEntrevista(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/entrevistas/' + id + '/concluir');
  if (deuErro(r)) return alert(r.erro);
  verEntrevista(id);
}

// ------------------------------------------------------- Estúdio (3.1)
// A tela inteira insiste numa coisa: o que sai daqui é uma VERSÃO NOVA, ao
// lado da original, marcada. Restauração sem selo vira, duas gerações
// adiante, "a foto do bisavô" — e o produto existe para isso não acontecer.
async function carregarEstudio(mediaId) {
  const alvo = document.getElementById('estudio');
  if (!alvo) return;
  const r = await api('GET', '/familias/' + FAM.id + '/midias/' + mediaId + '/estudio');
  if (deuErro(r)) return;
  const caps = r.capacidades || {};
  const ligadas = Object.keys(caps).filter(k => caps[k].disponivel);
  const naFila = (r.jobs || []).filter(j => j.status === 'pendente' || j.status === 'executando');
  const falhou = (r.jobs || []).find(j => j.status === 'falhou');

  alvo.innerHTML = '<h3 style="margin-top:26px">' + esc(t('estudio.titulo')) + '</h3>' +
    '<p class="sub">' + esc(t('estudio.intro')) + '</p>' +
    (!ligadas.length ? '<p class="sub">' + esc(t('estudio.indisponivel')) + '</p>' :
      (pode('ia.usar') ? ligadas.map(op => '<div class="linha"><span><strong>' +
        esc(t('estudio.' + op)) + '</strong><br><span class="sub">' +
        esc(t('estudio.' + op.replace('_foto', '') + '_desc')) + '</span></span>' +
        '<span><button class="btn mini" onclick="estudioFazer(\\'' + mediaId + '\\',\\'' + op + '\\')">' +
        esc(t('estudio.gerar')) + ' · ' + caps[op].creditos + '</button></span></div>').join('') : '')) +
    (naFila.length ? '<p class="sub">' + esc(t('estudio.na_fila')) + '</p>' : '') +
    (falhou ? '<p class="sub">' + esc(t('estudio.falhou', { motivo: falhou.erro || '' })) + '</p>' : '') +
    ((r.derivados || []).length
      ? '<h4 style="margin-top:18px">' + esc(t('estudio.resultados')) + '</h4>' +
        '<div id="est_lista"></div>'
      : vazio(t('estudio.nada_ainda'), t('estudio.nada_ainda_p')));

  const lista = document.getElementById('est_lista');
  if (!lista) return;
  for (const d of r.derivados || []) {
    const u = await urlDe(d.id);
    const selo = d.ai_class === 'AI_ENHANCED' ? t('estudio.selo_cor') : t('estudio.selo');
    lista.innerHTML += '<div class="card" style="padding:12px">' +
      (u ? '<img src="' + u + '" style="max-width:100%;border-radius:10px">' : '') +
      '<p class="sub" style="margin:8px 0 0">' + esc(selo) + ' · ' +
      esc(t('estudio.' + ((d.derivacao || {}).operacao || 'titulo'))) + '</p></div>';
  }
}

async function estudioFazer(mediaId, operacao, confirmando) {
  const r = await api('POST', '/familias/' + FAM.id + '/midias/' + mediaId + '/estudio',
    confirmando ? { operacao, confirmar: true } : { operacao });
  if (r.status === 503) return alert(t('estudio.indisponivel'));
  if (deuErro(r)) return alert(r.erro);
  if (r.cotacao && !confirmando) {
    if (confirm(t('ia.custara', { n: r.cotacao.creditos }))) return estudioFazer(mediaId, operacao, true);
    return;
  }
  alert(t('estudio.na_fila'));
  carregarEstudio(mediaId);
}

// ------------------------------------------- o que a IA leu no documento
// A tela inteira existe para deixar UMA coisa clara: isto é sugestão, não
// fato. Cada achado só vira fato da família quando alguém apontar de quem
// o papel fala — e o trecho citado fica à vista para conferir (§24).
async function carregarAchados(mediaId) {
  const alvo = document.getElementById('doc-ia');
  if (!alvo) return;
  const r = await api('GET', '/familias/' + FAM.id + '/midias/' + mediaId + '/achados');
  const achados = r.achados || [];
  const sugeridos = achados.filter(a => a.status === 'sugerido');
  alvo.innerHTML = '<h3 style="margin-top:26px">' + esc(t('documento.leitura_titulo')) + '</h3>' +
    '<p class="sub">' + esc(t('documento.leitura_intro')) + '</p>' +
    (pode('ia.usar') ? '<p><button class="btn" id="doc-ler" onclick="lerDocumento(\\'' + mediaId + '\\')">' +
      esc(t(achados.length ? 'documento.reler' : 'documento.ler')) + '</button></p>' : '') +
    (achados.length ? achados.map(a => '<div class="card" style="padding:16px;text-align:left">' +
      '<p style="margin:0 0 4px"><strong>' + esc(t('predicado.' + a.predicado) || a.predicado) +
        '</strong>: ' + esc(a.valor) +
        (a.pessoa_texto ? ' <span class="sub">— ' + esc(a.pessoa_texto) + '</span>' : '') + '</p>' +
      (a.trecho ? '<p class="sub" style="margin:0 0 8px">' +
        esc(t('documento.trecho', { trecho: a.trecho })) + '</p>' : '') +
      (a.status === 'sugerido' && pode('claims.criar')
        ? '<div class="linha"><span class="sub">' + esc(t('documento.achado_de')) + '</span>' +
          '<span><select id="ap_' + a.id + '" class="ap-pessoa"></select> ' +
          '<button class="btn mini" onclick="aceitarAchado(\\'' + a.id + '\\',\\'midia\\',\\'' + mediaId + '\\')">' +
            esc(t('documento.aceitar')) + '</button> ' +
          '<button class="btn mini sec" onclick="descartarAchado(\\'' + a.id + '\\',\\'midia\\',\\'' + mediaId + '\\')">' +
            esc(t('documento.descartar')) + '</button></span></div>'
        : '<p class="sub" style="margin:0">' + esc(a.status === 'aceito'
          ? t('documento.aceito', { nome: a.pessoa_nome || '' })
          : t('documento.descartado', { nome: a.decidido_por_nome || '' })) + '</p>') +
      '</div>').join('')
      : vazio(t('documento.sem_achados'), t('documento.sem_achados_p')));

  if (sugeridos.length && pode('claims.criar')) await opcoesDePessoa();
}

async function lerDocumento(mediaId, confirmando) {
  const b = document.getElementById('doc-ler');
  if (b && confirmando) { b.disabled = true; b.textContent = t('documento.lendo'); }
  const r = await api('POST', '/familias/' + FAM.id + '/midias/' + mediaId + '/analisar',
    confirmando ? { confirmar: true } : {});
  if (r.status === 503) return alert(t('ia.indisponivel'));
  if (deuErro(r)) { carregarAchados(mediaId); return alert(r.erro); }
  if (r.cotacao && !confirmando) {
    if (confirm(t('ia.custara', { n: r.cotacao.creditos }))) return lerDocumento(mediaId, true);
    return;
  }
  await carregarAchados(mediaId);
  if (!(r.achados || []).length) alert(t('documento.nada_encontrado'));
}

// O mesmo par de botões serve ao papel e à fala: muda só para onde a tela
// volta depois de decidir.
const recarregarAchados = (alvo, id) => alvo === 'entrevista' ? verEntrevista(id) : carregarAchados(id);

async function aceitarAchado(achadoId, alvo, id) {
  const sel = document.getElementById('ap_' + achadoId);
  if (!sel || !sel.value) return alert(t('documento.escolha_pessoa'));
  const r = await api('POST', '/familias/' + FAM.id + '/achados/' + achadoId + '/aceitar',
    { pessoa: sel.value });
  if (deuErro(r)) return alert(r.erro);
  recarregarAchados(alvo, id);
}

async function descartarAchado(achadoId, alvo, id) {
  const r = await api('POST', '/familias/' + FAM.id + '/achados/' + achadoId + '/descartar');
  if (deuErro(r)) return alert(r.erro);
  recarregarAchados(alvo, id);
}

/** Preenche os seletores de pessoa das sugestões visíveis na tela. */
async function opcoesDePessoa() {
  const campos = document.querySelectorAll('.ap-pessoa');
  if (!campos.length) return;
  const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
  const opcoes = (l.pessoas || []).map(x =>
    '<option value="' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
  campos.forEach(s => { s.innerHTML = '<option value=""></option>' + opcoes; });
}

async function confirmarPessoa(idId, mediaId) {
  const r = await api('POST', '/familias/' + FAM.id + '/identificacoes/' + idId + '/confirmar');
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verMidia(mediaId);
}

// ------------------------------------------------------------------ busca
// Uma caixa para o acervo inteiro (§43). O servidor decide o que aparece;
// esta tela só apresenta.
async function telaBusca(offset) {
  const q = document.getElementById('bq') ? document.getElementById('bq').value : '';
  const tipo = document.getElementById('bt') ? document.getElementById('bt').value : '';
  const r = q !== '' || tipo !== ''
    ? await api('GET', '/familias/' + FAM.id + '/busca?q=' + encodeURIComponent(q) +
        (tipo ? '&tipos=' + tipo : '') + (offset ? '&offset=' + offset : ''))
    : { resultados: null };
  const tipos = ['', 'person', 'media', 'document', 'story', 'contribution',
    'tradition', 'recipe', 'heirloom'];
  const abrirDe = (x) => x.ref_tipo === 'person' ? "dossie('" + x.ref_id + "')"
    : x.ref_tipo === 'story' ? "verHistoria('" + x.ref_id + "')"
    : (x.ref_tipo === 'tradition' || x.ref_tipo === 'recipe') ? "verTradicao('" + x.ref_id + "')"
    : x.ref_tipo === 'heirloom' ? "verReliquia('" + x.ref_id + "')"
    : "verMidia('" + x.ref_id + "')";
  if (deuErro(r)) return $(colecao(t('busca.titulo'), falhou(r, 'telaBusca()')));
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('busca.titulo')) + '</h2>' +
    '<label for="bq">' + esc(t('busca.campo')) + '</label>' +
    '<input id="bq" value="' + esc(q) + '" placeholder="' + esc(t('busca.placeholder')) + '"' +
      ' onkeydown="if(event.key===\\'Enter\\')telaBusca()">' +
    '<label for="bt">' + esc(t('busca.tipo')) + '</label><select id="bt">' +
      tipos.map(x => '<option value="' + x + '"' + (x === tipo ? ' selected' : '') + '>' +
        esc(x ? t('busca.tipo_' + x) : '—') + '</option>').join('') + '</select>' +
    '<p><button class="btn" onclick="telaBusca()">' + esc(t('busca.titulo')) + '</button></p>' +
    (r.resultados === null ? '' :
      (r.resultados.length
        ? '<p class="sub">' + esc(t('busca.resultados', { n: r.resultados.length })) +
          (r.ocultos ? ' · ' + esc(t('busca.ocultos', { n: r.ocultos })) : '') + '</p>' +
          r.resultados.map(x =>
            '<div class="card" style="padding:16px;cursor:pointer" onclick="' + abrirDe(x) + '">' +
            '<p style="margin:0 0 4px"><span class="papel">' + esc(t('busca.tipo_' + x.ref_tipo)) + '</span> ' +
            '<strong>' + esc(x.titulo || '') + '</strong></p>' +
            (x.trecho ? '<p class="sub" style="margin:0">' +
              esc(x.trecho).replace(/«/g, '<mark>').replace(/»/g, '</mark>') + '</p>' : '') +
            '</div>').join('')
        : vazio(t('busca.nada'), t('busca.nada_p')))) +
    // Por SENTIDO: o que a palavra exata não trouxe. Vem separado e
    // rotulado — misturar com o resultado exato esconderia de onde veio.
    ((r.por_sentido || []).length
      ? '<h3 style="margin-top:22px">' + esc(t('busca.por_sentido')) + '</h3>' +
        '<p class="sub">' + esc(t('busca.por_sentido_intro')) + '</p>' +
        r.por_sentido.map(x =>
          '<div class="card" style="padding:16px;cursor:pointer" onclick="' + abrirDe(x) + '">' +
          '<p style="margin:0 0 4px"><span class="papel">' + esc(t('busca.tipo_' + x.ref_tipo)) + '</span> ' +
          '<strong>' + esc(x.titulo || '') + '</strong></p>' +
          '<p class="sub" style="margin:0">' + esc(x.trecho) + '</p></div>').join('')
      : '') +
    '<div id="sem_estado"></div>');
  const campo = document.getElementById('bq');
  if (campo && !offset) campo.focus();
  estadoSemantica();
}

/**
 * Estado da indexação por sentido. Aparece só quando há o que indexar —
 * quem não indexar continua com a busca por palavra inteira, e a tela diz
 * isso em vez de deixar a impressão de que falta alguma coisa.
 */
async function estadoSemantica() {
  const alvo = document.getElementById('sem_estado');
  if (!alvo) return;
  const r = await api('GET', '/familias/' + FAM.id + '/semantica');
  if (deuErro(r) || !r.disponivel || !r.pendentes) return;
  alvo.innerHTML = '<p class="sub" style="margin-top:18px">' +
    esc(t('busca.a_indexar', { n: r.pendentes })) +
    (pode('editar') ? ' <button class="btn mini sec" onclick="indexarSentido()">' +
      esc(t('busca.indexar')) + '</button>' : '') + '</p>';
}

async function indexarSentido() {
  const alvo = document.getElementById('sem_estado');
  if (alvo) alvo.innerHTML = '<p class="sub">' + esc(t('busca.indexando')) + '</p>';
  const r = await api('POST', '/familias/' + FAM.id + '/semantica/indexar', { limite: 25 });
  if (deuErro(r)) { if (alvo) alvo.innerHTML = aviso(r.erro); return; }
  estadoSemantica();
}

// --------------------------------------------------------------- histórias
async function telaHistorias() {
  aguarde(t('historia_mod.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/historias');
  if (deuErro(r)) return $(colecao(t('historia_mod.titulo'), falhou(r, 'telaHistorias()')));
  $(colecao(t('historia_mod.titulo'),
    ((r.historias || []).length
      ? r.historias.map(x =>
          '<div class="card" style="padding:18px;cursor:pointer" onclick="verHistoria(\\'' + x.id + '\\')">' +
          '<p style="margin:0 0 4px"><strong>' + esc(x.titulo) + '</strong>' +
          (x.ocorrido_valor ? ' <span class="sub">· ' + esc(x.ocorrido_valor) + '</span>' : '') + '</p>' +
          '<p class="sub" style="margin:0">' + esc(x.resumo || '') + '</p>' +
          (x.contada_por ? '<p class="sub" style="margin:6px 0 0">' + esc(t('historia_mod.por')) + ' ' +
            esc(x.contada_por) + '</p>' : '') +
          '</div>').join('')
      : vazio(t('historia_mod.sem_historias'), t('historia_mod.sem_historias_p'))) +
    (pode('contribuir') ? formHistoriaNova() : '')));
  if (pode('contribuir')) preencherSelPessoas('hn_quem');
}

function formHistoriaNova() {
  return '<h3 style="margin-top:26px">' + esc(t('historia_mod.nova')) + '</h3>' +
    '<label for="hn_t">' + esc(t('historia_mod.nome')) + '</label><input id="hn_t">' +
    '<label for="hn_c">' + esc(t('historia_mod.corpo')) + '</label>' +
    '<textarea id="hn_c" rows="5" style="width:100%;min-height:120px;padding:12px 14px;' +
      'border:1px solid var(--borda);border-radius:10px;font:16px Inter,system-ui,sans-serif;' +
      'background:var(--card);color:var(--tinta)" placeholder="' + esc(t('historia_mod.placeholder')) + '"></textarea>' +
    '<label for="hn_quem">' + esc(t('historia_mod.contada_por')) + '</label><select id="hn_quem"><option value=""></option></select>' +
    '<label for="hn_q">' + esc(t('historia_mod.ocorrido')) + '</label><input id="hn_q" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
    '<label for="hn_l">' + esc(t('historia_mod.local')) + '</label><input id="hn_l">' +
    '<p><button class="btn" onclick="criarHistoria()">' + esc(t('historia_mod.guardar')) + '</button></p>';
}

async function preencherSelPessoas(idSel) {
  const sel = document.getElementById(idSel);
  if (!sel) return;
  const l = await api('GET', '/familias/' + FAM.id + '/pessoas');
  const opcoes = (l.pessoas || []).map(x =>
    '<option value="' + x.id + '">' + esc(x.nome_exibicao) + '</option>').join('');
  // mantém a opção vazia quando o select a tiver (contada_por é opcional)
  sel.innerHTML = (sel.innerHTML.indexOf('value=""') >= 0 ? '<option value=""></option>' : '') + opcoes;
}

async function criarHistoria() {
  const quem = document.getElementById('hn_quem').value;
  const r = await api('POST', '/familias/' + FAM.id + '/historias', {
    titulo: document.getElementById('hn_t').value,
    corpo: document.getElementById('hn_c').value,
    contada_por: quem || null, pessoas: quem ? [quem] : [],
    ocorrido: document.getElementById('hn_q').value,
    local: document.getElementById('hn_l').value });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verHistoria(r.historia.id);
}

async function verHistoria(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/historias/' + id);
  if (deuErro(r)) return $(colecao(t('historia_mod.titulo'), falhou(r, 'telaHistorias()')));
  const h = r.historia;
  // DETALHE EDITORIAL: história é para LER. Medida de linha curta, corpo
  // maior e o texto sem moldura de cartão — o cartão serve para item de
  // lista, não para a leitura em si.
  $(topo() + '<p class="sub"><a href="#" onclick="telaHistorias();return false">← ' +
      esc(t('historia_mod.titulo')) + '</a></p>' +
    '<div class="editorial">' +
    '<h2>' + esc(h.titulo) + '</h2>' +
    '<p class="sub">' + [h.contada_por ? t('historia_mod.por') + ' ' + h.contada_por : '',
      h.ocorrido_valor, h.local_texto].filter(Boolean).map(esc).join(' · ') + '</p>' +
    '<p style="white-space:pre-wrap">' + esc(r.corpo) + '</p>' +
    ((r.mencoes || []).filter(m => m.person_id).length
      ? '<p class="sub">' + esc(t('historia_mod.menciona')) + ': ' +
        r.mencoes.filter(m => m.person_id).map(m =>
          '<a href="#" onclick="dossie(\\'' + m.person_id + '\\');return false">' +
          esc(m.nome_exibicao) + '</a>').join(', ') + '</p>' : '') +
    (pode('editar')
      ? '<h3>' + esc(t('historia_mod.editar')) + '</h3>' +
        '<textarea id="he_c" rows="5" style="width:100%;min-height:120px;padding:12px 14px;' +
        'border:1px solid var(--borda);border-radius:10px;font:16px Inter,system-ui,sans-serif;' +
        'background:var(--card);color:var(--tinta)">' + esc(r.corpo) + '</textarea>' +
        '<p><button class="btn" onclick="editarHistoria(\\'' + id + '\\')">' +
        esc(t('historia_mod.guardar')) + '</button></p>' : '') +
    ((r.versoes || []).length > 1
      ? '<h3>' + esc(t('historia_mod.versoes')) + '</h3>' +
        r.versoes.slice(1).map(v =>
          '<div class="card" style="padding:14px;opacity:.7">' +
          '<p class="sub" style="margin:0 0 6px">' + esc(t('historia_mod.versao', { n: v.versao })) +
          (v.editado_por_nome ? ' · ' + esc(t('historia_mod.editada_por',
            { nome: v.editado_por_nome, data: new Date(v.created_at).toLocaleDateString(IDIOMA) })) : '') +
          (v.nota_edicao ? ' · ' + esc(v.nota_edicao) : '') + '</p>' +
          '<p style="margin:0;white-space:pre-wrap">' + esc(v.corpo) + '</p></div>').join('') +
        '<p class="sub">' + esc(t('historia_mod.preservadas')) + '</p>'
      : '') + '</div>');
}

async function editarHistoria(id) {
  const r = await api('PATCH', '/familias/' + FAM.id + '/historias/' + id,
    { corpo: document.getElementById('he_c').value });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verHistoria(id);
}

// --------------------------------------------------------------- timeline
// A régua vertical da família (§33). A IMPRECISÃO aparece como foi dita
// ("anos 1940", "c. 1890") — a tela nunca inventa um dia exato. Item sem
// data vai para o fim, rotulado: presença sem afirmação de ordem.
async function telaTimeline(pessoaId) {
  const r = await api('GET', '/familias/' + FAM.id + '/timeline' +
    (pessoaId ? '?pessoa=' + pessoaId : ''));
  if (deuErro(r)) return $(colecao(t('tempo.titulo'), falhou(r, 'telaTimeline()')));
  const abrirDe = (i) => i.ref_tipo === 'person' ? "dossie(\\'" + i.ref_id + "\\')"
    : i.ref_tipo === 'story' ? "verHistoria(\\'" + i.ref_id + "\\')"
    : i.ref_tipo === 'media' ? "verMidia(\\'" + i.ref_id + "\\')"
    : i.ref_tipo === 'tradition' ? "verTradicao(\\'" + i.ref_id + "\\')"
    : i.ref_tipo === 'heirloom' ? "verReliquia(\\'" + i.ref_id + "\\')" : '';
  const ICONES = { nascimento: '🌱', falecimento: '🕯', casamento: '💍',
    evento: '📌', foto: '📷', historia: '📖', tradicao: '🍲', reliquia: '💍' };
  const comData = (r.itens || []).filter(i => i.data_ini);
  const semData = (r.itens || []).filter(i => !i.data_ini);
  let anoAnterior = null;
  const linha = (i) => {
    const ano = i.data_ini ? String(i.data_ini).slice(0, 4) : null;
    const cab = ano && ano !== anoAnterior
      ? '<h3 class="tl-ano">' + esc(ano) + '</h3>' : '';
    anoAnterior = ano;
    const onclick = abrirDe(i);
    return cab + '<div class="tl-item"' + (onclick ? ' style="cursor:pointer" onclick="' + onclick + '"' : '') + '>' +
      '<span class="tl-ico">' + (ICONES[i.tipo] || '·') + '</span>' +
      '<span><strong>' + esc(i.titulo) + '</strong>' +
      '<br><span class="sub">' + esc(t('tempo.tipo_' + i.tipo)) +
      (i.data_valor ? ' · ' + esc(i.data_valor) : '') +
      (i.local_texto ? ' · ' + esc(i.local_texto) : '') + '</span></span></div>';
  };
  $(topo() + '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' + esc(FAM.nome) + '</a></p>' +
    '<h2>' + esc(pessoaId ? t('tempo.titulo') : t('tempo.titulo')) + '</h2>' +
    (r.ocultos ? '<p class="sub">' + esc(t('tempo.ocultos', { n: r.ocultos })) + '</p>' : '') +
    (comData.length || semData.length
      ? '<div class="tl">' + comData.map(linha).join('') +
        (semData.length
          ? '<h3 class="tl-ano">' + esc(t('tempo.sem_data')) + '</h3>' +
            semData.map(i => { anoAnterior = 'x'; return linha(i); }).join('')
          : '') + '</div>'
      : vazio(t('tempo.sem_itens'), t('tempo.sem_itens_p'))) +
    (pode('contribuir') ? formEvento() : ''));
  if (pode('contribuir')) preencherSelPessoas('ev_quem');
}

function formEvento() {
  const tipos = ['reuniao','casamento','mudanca','viagem','formatura','trabalho','outro'];
  return '<h3 style="margin-top:26px">' + esc(t('evento.novo')) + '</h3>' +
    '<label for="ev_t">' + esc(t('evento.nome')) + '</label><input id="ev_t">' +
    '<label for="ev_tipo">' + esc(t('evento.tipo')) + '</label><select id="ev_tipo">' +
      tipos.map(x => '<option value="' + x + '">' + esc(t('evento.' + x)) + '</option>').join('') + '</select>' +
    '<label for="ev_q">' + esc(t('evento.quando')) + '</label><input id="ev_q" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
    '<label for="ev_l">' + esc(t('evento.onde')) + '</label><input id="ev_l">' +
    '<label for="ev_quem">' + esc(t('evento.quem')) + '</label><select id="ev_quem" multiple size="4"></select>' +
    '<label for="ev_d">' + esc(t('evento.descricao')) + '</label><input id="ev_d">' +
    '<p><button class="btn" onclick="criarEvento()">' + esc(t('acao.salvar')) + '</button></p>';
}

async function criarEvento() {
  const sel = document.getElementById('ev_quem');
  const r = await api('POST', '/familias/' + FAM.id + '/eventos', {
    titulo: document.getElementById('ev_t').value,
    tipo: document.getElementById('ev_tipo').value,
    data: document.getElementById('ev_q').value,
    local: document.getElementById('ev_l').value,
    descricao: document.getElementById('ev_d').value,
    participantes: [...sel.selectedOptions].map(o => o.value) });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  telaTimeline();
}

// ----------------------------------------------------------- IA (Fase 7)
// O preço aparece ANTES (§53), o selo de IA aparece SEMPRE (§88), e a
// resposta traz as fontes — sem fonte, não é memória, é ficção.
async function gerarBiografia(pessoaId, confirmando) {
  const r = await api('POST', '/familias/' + FAM.id + '/pessoas/' + pessoaId + '/biografia',
    confirmando ? { confirmar: true } : {});
  if (r.status === 503) return alert(t('ia.indisponivel'));
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  if (r.cotacao && !confirmando) {
    if (confirm(t('ia.custara', { n: r.cotacao.creditos }))) return gerarBiografia(pessoaId, true);
    return;
  }
  dossie(pessoaId);
}

async function telaPerguntar(confirmando, pergunta) {
  const q = pergunta || (document.getElementById('pq') ? document.getElementById('pq').value : '');
  let corpo = '';
  if (q && confirmando) {
    const r = await api('POST', '/familias/' + FAM.id + '/perguntar', { pergunta: q, confirmar: true });
    if (r.status === 503) corpo = aviso(t('ia.indisponivel'));
    else if (deuErro(r)) corpo = aviso(r.erro);
    else {
      corpo = '<div class="card"><p style="margin:0;white-space:pre-wrap">' + esc(r.resposta) + '</p></div>' +
        '<p class="sub">' + esc(t('ia.selo_ia')) + '</p>' +
        ((r.fontes || []).length
          ? '<p class="sub"><strong>' + esc(t('ia.fontes_resposta')) + ':</strong> ' +
            r.fontes.map(f => esc(t('busca.tipo_' + f.tipo) || f.tipo)).join(', ') + '</p>' : '') +
        (r.incerteza ? '<p class="sub"><strong>' + esc(t('ia.incerteza')) + ':</strong> ' +
          esc(r.incerteza) + '</p>' : '');
    }
  } else if (q && !confirmando) {
    const cot = await api('POST', '/familias/' + FAM.id + '/perguntar', { pergunta: q });
    if (cot.status === 503) corpo = aviso(t('ia.indisponivel'));
    else if (cot.cotacao && confirm(t('ia.custara', { n: cot.cotacao.creditos })))
      return telaPerguntar(true, q);
  }
  const cred = await api('GET', '/familias/' + FAM.id + '/creditos');
  $(colecao(t('ia.perguntar_titulo'),
    '<label for="pq">' + esc(t('ia.perguntar_campo')) + '</label>' +
    '<input id="pq" value="' + esc(q || '') + '" placeholder="' + esc(t('ia.perguntar_placeholder')) + '">' +
    '<p><button class="btn" onclick="telaPerguntar()">' + esc(t('ia.perguntar_titulo')) + '</button></p>' +
    corpo,
    { intro: t('ia.perguntar_intro'),
      filtros: '<p class="sub">' + esc(t('ia.saldo', { n: cred.saldo != null ? cred.saldo : '?' })) + '</p>' }));
}

// ------------------------------------------------ tradições (Fase 2.1)
// A receita, a reza, a música e o ofício moram na mesma tela — o que muda
// é a categoria. A receita ganha ingredientes e preparo; e o manuscrito
// da avó continua sendo o original, com a transcrição do lado.
let CAT = '';
const CATS = ['RECEITA','CELEBRACAO','MUSICA','EXPRESSAO','SABER','RELIQUIA','LUGAR','HISTORIA'];
const voltarFamilia = () => '<p class="sub"><a href="#" onclick="abrir(FAM.id);return false">← ' +
  esc(FAM.nome) + '</a></p>';
const area = (id, valor, dica) => '<textarea id="' + id + '" rows="4" style="width:100%;' +
  'min-height:96px;padding:12px 14px;border:1px solid var(--borda);border-radius:10px;' +
  'font:16px Inter,system-ui,sans-serif;background:var(--card);color:var(--tinta)"' +
  (dica ? ' placeholder="' + esc(dica) + '"' : '') + '>' + esc(valor || '') + '</textarea>';

async function telaTradicoes(cat) {
  if (cat !== undefined) CAT = cat;
  aguarde(t('tradicao.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/tradicoes' + (CAT ? '?categoria=' + CAT : ''));
  if (deuErro(r)) return $(colecao(t('tradicao.titulo'), falhou(r, 'telaTradicoes()')));
  const filtro = (c, rot) => '<button class="btn mini ' + (CAT === c ? '' : 'claro') +
    '" onclick="telaTradicoes(\\'' + c + '\\')">' + esc(rot) + '</button> ';
  $(colecao(t('tradicao.titulo'),
    ((r.tradicoes || []).length
      ? r.tradicoes.map(x =>
          '<div class="card" style="padding:18px;cursor:pointer" onclick="verTradicao(\\'' + x.id + '\\')">' +
          '<p style="margin:0 0 4px"><span class="papel">' + esc(t('tradicao.cat_' + x.categoria)) +
            '</span> <strong>' + esc(x.titulo) + '</strong>' +
            (x.desde_valor ? ' <span class="sub">· ' + esc(x.desde_valor) + '</span>' : '') + '</p>' +
          (x.de_quem ? '<p class="sub" style="margin:0">' + esc(t('tradicao.de_quem')) + ': ' +
            esc(x.de_quem) + '</p>' : '') +
          (x.aprendizes ? '<p class="sub" style="margin:4px 0 0">' +
            esc(t('tradicao.aprendizes_n', { n: x.aprendizes })) + '</p>' : '') +
          '</div>').join('')
      : vazio(t('tradicao.sem_tradicoes'), t('tradicao.sem_tradicoes_p'))) +
    (pode('contribuir') ? formTradicao() : ''),
    { intro: t('tradicao.intro'),
      filtros: '<p>' + filtro('', t('tradicao.filtro_todas')) +
        CATS.map(c => filtro(c, t('tradicao.cat_' + c))).join('') + '</p>' }));
  if (pode('contribuir')) { preencherSelPessoas('tr_quem'); alternarReceita(); }
}

function formTradicao() {
  return '<h3 style="margin-top:28px">' + esc(t('tradicao.nova')) + '</h3>' +
    '<label for="tr_cat">' + esc(t('tradicao.categoria')) + '</label>' +
    '<select id="tr_cat" onchange="alternarReceita()">' +
      CATS.map(c => '<option value="' + c + '">' + esc(t('tradicao.cat_' + c)) + '</option>').join('') +
    '</select>' +
    '<label for="tr_t">' + esc(t('tradicao.nome')) + '</label><input id="tr_t">' +
    '<label for="tr_c">' + esc(t('tradicao.corpo')) + '</label>' + area('tr_c', '') +
    '<label for="tr_quem">' + esc(t('tradicao.de_quem')) + '</label>' +
      '<select id="tr_quem"><option value=""></option></select>' +
    '<label for="tr_o">' + esc(t('tradicao.origem')) + '</label><input id="tr_o">' +
    '<label for="tr_oc">' + esc(t('tradicao.ocasioes')) + '</label><input id="tr_oc">' +
    '<label for="tr_d">' + esc(t('tradicao.desde')) + '</label>' +
      '<input id="tr_d" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
    '<label for="tr_l">' + esc(t('tradicao.local')) + '</label><input id="tr_l">' +
    '<div id="tr_receita">' +
      '<label for="tr_i">' + esc(t('tradicao.ingredientes')) + '</label>' + area('tr_i', '') +
      '<label for="tr_p">' + esc(t('tradicao.preparo')) + '</label>' + area('tr_p', '') +
      '<label for="tr_r">' + esc(t('tradicao.rendimento')) + '</label><input id="tr_r">' +
      '<label for="tr_tp">' + esc(t('tradicao.tempo')) + '</label><input id="tr_tp">' +
    '</div>' +
    '<p><button class="btn" onclick="criarTradicao()">' + esc(t('tradicao.guardar')) + '</button></p>';
}

function alternarReceita() {
  const sel = document.getElementById('tr_cat'), bloco = document.getElementById('tr_receita');
  if (sel && bloco) bloco.style.display = sel.value === 'RECEITA' ? 'block' : 'none';
}

const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };

async function criarTradicao() {
  const r = await api('POST', '/familias/' + FAM.id + '/tradicoes', {
    categoria: val('tr_cat'), titulo: val('tr_t'), corpo: val('tr_c'),
    person_id: val('tr_quem') || null, origem: val('tr_o'), ocasioes: val('tr_oc'),
    desde: val('tr_d'), local: val('tr_l'),
    ingredientes: val('tr_i'), preparo: val('tr_p'),
    rendimento: val('tr_r'), tempo: val('tr_tp') });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verTradicao(r.tradicao.id);
}

async function verTradicao(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/tradicoes/' + id);
  if (deuErro(r)) return $(colecao(t('tradicao.titulo'), falhou(r, 'telaTradicoes()')));
  const x = r.tradicao, rec = x.receita;
  $(topo() + '<p class="sub"><a href="#" onclick="telaTradicoes();return false">← ' +
      esc(t('tradicao.titulo')) + '</a></p>' +
    '<h2>' + esc(x.titulo) + '</h2>' +
    '<p class="sub"><span class="papel">' + esc(t('tradicao.cat_' + x.categoria)) + '</span> ' +
      [x.de_quem, x.desde_valor, x.local_texto].filter(Boolean).map(esc).join(' · ') + '</p>' +
    (x.corpo ? '<div class="card"><p style="margin:0;white-space:pre-wrap">' + esc(x.corpo) + '</p></div>' : '') +
    (x.origem ? '<p class="sub"><strong>' + esc(t('tradicao.origem')) + ':</strong> ' + esc(x.origem) + '</p>' : '') +
    ((x.ocasioes || []).length ? '<p class="sub"><strong>' + esc(t('tradicao.ocasioes')) +
      ':</strong> ' + esc(x.ocasioes.join(', ')) + '</p>' : '') +
    (rec
      ? '<h3>' + esc(t('tradicao.ingredientes')) + '</h3><ul>' +
        (rec.ingredientes || []).map(i => '<li>' + esc(i.item) + '</li>').join('') + '</ul>' +
        (rec.preparo ? '<h3>' + esc(t('tradicao.preparo')) + '</h3>' +
          '<p style="white-space:pre-wrap">' + esc(rec.preparo) + '</p>' : '') +
        '<p class="sub">' + [rec.rendimento, rec.tempo].filter(Boolean).map(esc).join(' · ') + '</p>' +
        (rec.manuscrito_media_id
          ? '<p><a href="#" onclick="verMidia(\\'' + rec.manuscrito_media_id + '\\');return false">' +
            esc(t('tradicao.manuscrito')) + '</a><br><span class="sub">' +
            esc(t('tradicao.manuscrito_nota')) + '</span></p>' : '')
      : '') +

    // quem sabe fazer — a lacuna que o Historiador cobra
    (rec ? '<h3>' + esc(t('tradicao.aprendizes')) + '</h3>' +
      ((x.aprendizes || []).length
        ? x.aprendizes.map(a => '<div class="linha"><span><a href="#" onclick="dossie(\\'' +
            a.person_id + '\\');return false">' + esc(a.nome_exibicao) + '</a>' +
            (a.aprendeu_valor ? ' <span class="sub">· ' + esc(a.aprendeu_valor) + '</span>' : '') +
            '</span></div>').join('')
        : vazio(t('tradicao.sem_aprendizes'), t('tradicao.sem_aprendizes_p'))) +
      (pode('contribuir')
        ? '<label for="ap_quem">' + esc(t('tradicao.quem_aprendeu')) + '</label><select id="ap_quem"></select>' +
          '<label for="ap_q">' + esc(t('tradicao.aprendeu_quando')) + '</label><input id="ap_q">' +
          '<p><button class="btn mini" onclick="registrarAprendiz(\\'' + id + '\\')">' +
          esc(t('acao.salvar')) + '</button></p>' : '') : '') +

    // a corrente do saber
    '<h3>' + esc(t('tradicao.transmissoes')) + '</h3>' +
    ((x.transmissoes || []).length
      ? x.transmissoes.map(tr => '<div class="linha"><span>' + esc(tr.de_nome) + ' → ' +
          esc(tr.para_nome) + (tr.quando_valor ? ' <span class="sub">· ' + esc(tr.quando_valor) +
          '</span>' : '') + '</span></div>').join('')
      : vazio(t('tradicao.sem_transmissoes'), t('tradicao.sem_transmissoes_p'))) +
    (pode('contribuir')
      ? '<label for="tm_de">' + esc(t('tradicao.ensinou')) + '</label><select id="tm_de"></select>' +
        '<label for="tm_para">' + esc(t('tradicao.aprendeu')) + '</label><select id="tm_para"></select>' +
        '<label for="tm_q">' + esc(t('tradicao.aprendeu_quando')) + '</label><input id="tm_q">' +
        '<p><button class="btn mini" onclick="registrarTransmissao(\\'' + id + '\\')">' +
        esc(t('tradicao.registrar_transmissao')) + '</button></p>' : ''));
  if (pode('contribuir')) {
    for (const s of ['ap_quem', 'tm_de', 'tm_para']) preencherSelPessoas(s);
  }
}

async function registrarAprendiz(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/tradicoes/' + id + '/aprendizes',
    { person_id: val('ap_quem'), quando: val('ap_q') });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verTradicao(id);
}

async function registrarTransmissao(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/tradicoes/' + id + '/transmissoes',
    { de_person_id: val('tm_de'), para_person_id: val('tm_para'), quando: val('tm_q') });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verTradicao(id);
}

// ------------------------------------------------ relíquias (Fase 2.1)
// O valor do objeto está em por quantas mãos passou. A tela mostra a
// corrente inteira, e transferir NUNCA apaga o dono anterior.
async function telaReliquias() {
  aguarde(t('reliquia.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/reliquias');
  if (deuErro(r)) return $(colecao(t('reliquia.titulo'), falhou(r, 'telaReliquias()')));
  $(colecao(t('reliquia.titulo'),
    ((r.reliquias || []).length
      ? r.reliquias.map(x =>
          '<div class="card" style="padding:18px;cursor:pointer" onclick="verReliquia(\\'' + x.id + '\\')">' +
          '<p style="margin:0 0 4px"><strong>' + esc(x.nome) + '</strong></p>' +
          '<p class="sub" style="margin:0">' +
            (x.com_quem ? esc(t('reliquia.ainda_com', { nome: x.com_quem })) +
              (x.desde ? ' · ' + esc(x.desde) : '')
              : esc(t('reliquia.sem_custodia'))) +
            (x.maos ? ' · ' + esc(t('reliquia.maos', { n: x.maos })) : '') + '</p>' +
          '</div>').join('')
      : vazio(t('reliquia.sem_reliquias'), t('reliquia.sem_reliquias_p'))) +
    (pode('contribuir')
      ? '<h3 style="margin-top:28px">' + esc(t('reliquia.nova')) + '</h3>' +
        '<label for="rl_n">' + esc(t('reliquia.nome')) + '</label><input id="rl_n">' +
        '<label for="rl_d">' + esc(t('reliquia.descricao')) + '</label>' + area('rl_d', '') +
        '<label for="rl_o">' + esc(t('reliquia.origem')) + '</label><input id="rl_o">' +
        '<label for="rl_l">' + esc(t('reliquia.local')) + '</label><input id="rl_l">' +
        '<label for="rl_q">' + esc(t('reliquia.com_quem')) + '</label>' +
    '<select id="rl_q"><option value=""></option></select>' +
        '<label for="rl_s">' + esc(t('reliquia.desde')) + '</label>' +
    '<input id="rl_s" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
        '<p><button class="btn" onclick="criarReliquia()">' + esc(t('reliquia.guardar')) + '</button></p>'
      : ''),
    { intro: t('reliquia.intro') }));
  if (pode('contribuir')) preencherSelPessoas('rl_q');
}

async function criarReliquia() {
  const r = await api('POST', '/familias/' + FAM.id + '/reliquias', {
    nome: val('rl_n'), descricao: val('rl_d'), origem: val('rl_o'), local: val('rl_l'),
    com_quem: val('rl_q') || null, desde: val('rl_s') });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verReliquia(r.reliquia.id);
}

async function verReliquia(id) {
  const r = await api('GET', '/familias/' + FAM.id + '/reliquias/' + id);
  if (deuErro(r)) return $(colecao(t('reliquia.titulo'), falhou(r, 'telaReliquias()')));
  const h = r.reliquia;
  const fontes = ['RELATO','DOCUMENTO','REGISTRO_OFICIAL','MIDIA','PUBLICACAO'];
  $(topo() + '<p class="sub"><a href="#" onclick="telaReliquias();return false">← ' +
      esc(t('reliquia.titulo')) + '</a></p>' +
    '<h2>' + esc(h.nome) + '</h2>' +
    '<p class="sub">' + [h.local_texto, h.origem].filter(Boolean).map(esc).join(' · ') + '</p>' +
    (h.descricao ? '<div class="card"><p style="margin:0;white-space:pre-wrap">' +
      esc(h.descricao) + '</p></div>' : '') +
    '<h3>' + esc(t('reliquia.linha_de_posse')) + '</h3>' +
    ((h.custodia || []).length
      ? '<div class="tl">' + h.custodia.map(c =>
          '<div class="tl-item"><span class="tl-ico">🤲</span><span>' +
          '<a href="#" onclick="dossie(\\'' + c.person_id + '\\');return false"><strong>' +
            esc(c.nome_exibicao) + '</strong></a>' +
          '<br><span class="sub">' + esc(c.de_valor || '?') + ' — ' +
            esc(c.ate_valor || t('reliquia.ainda_com', { nome: c.nome_exibicao })) +
            (c.fonte_tipo ? ' · ' + esc(t('fonte.' + c.fonte_tipo)) +
              (c.fonte_titulo ? ': ' + esc(c.fonte_titulo) : '') : '') +
            (c.nota ? '<br>' + esc(c.nota) : '') + '</span></span></div>').join('') + '</div>'
      : vazio(t('reliquia.sem_custodia'), t('reliquia.sem_custodia_p'))) +
    (pode('contribuir')
      ? '<h3 style="margin-top:26px">' + esc(t('reliquia.transferir')) + '</h3>' +
        '<label for="cu_q">' + esc(t('reliquia.passou_para')) + '</label><select id="cu_q"></select>' +
        '<label for="cu_d">' + esc(t('reliquia.quando')) + '</label>' +
          '<input id="cu_d" placeholder="' + esc(t('pessoa.ajuda_data')) + '">' +
        '<label for="cu_n">' + esc(t('reliquia.nota')) + '</label><input id="cu_n">' +
        '<label for="cu_ft">' + esc(t('reliquia.como_sabe')) + '</label><select id="cu_ft">' +
          fontes.map(f => '<option value="' + f + '">' + esc(t('fonte.' + f)) + '</option>').join('') +
        '</select>' +
        '<label for="cu_fq">' + esc(t('reliquia.fonte_titulo')) + '</label><input id="cu_fq">' +
        '<p><button class="btn" onclick="transferirReliquia(\\'' + id + '\\')">' +
        esc(t('reliquia.guardar')) + '</button></p>' : ''));
  if (pode('contribuir')) preencherSelPessoas('cu_q');
}

async function transferirReliquia(id) {
  const r = await api('POST', '/familias/' + FAM.id + '/reliquias/' + id + '/custodia', {
    person_id: val('cu_q'), de: val('cu_d'), nota: val('cu_n'),
    fonte_tipo: val('cu_ft'), fonte_titulo: val('cu_fq') });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  verReliquia(id);
}

// --------------------------------------- historiador e missões (Fase 2.2)
async function telaHistoriador() {
  aguarde(t('historiador.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/historiador');
  if (deuErro(r)) return $(colecao(t('historiador.titulo'), falhou(r, 'telaHistoriador()')));
  const tipos = Object.keys(r.por_tipo || {});
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('historiador.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('historiador.intro')) + '</p>' +
    (tipos.length
      ? tipos.map(x => '<div class="linha"><span>' + esc(t('historiador.tipo_' + x)) +
          '</span><span class="papel">' + r.por_tipo[x] +
          ((r.alem_do_teto || {})[x] ? ' +' + r.alem_do_teto[x] : '') + '</span></div>').join('')
      : vazio(t('historiador.sem_lacunas'), t('historiador.sem_lacunas_p'))) +
    '<p style="margin-top:22px"><button class="btn" onclick="telaMissoes(null,true)">' +
      esc(t('missao.sincronizar')) + '</button></p>');
}

async function telaMissoes(status, sincronizar) {
  let cab = '';
  if (sincronizar) {
    const s = await api('POST', '/familias/' + FAM.id + '/missoes/sincronizar', {});
    if (s.status < 400) {
      cab = aviso(t('missao.sincronizado', { criadas: s.criadas, resolvidas: s.resolvidas }), 'ok');
    }
  }
  const st = status || 'aberta';
  const r = await api('GET', '/familias/' + FAM.id + '/missoes?status=' + st);
  if (deuErro(r)) return $(colecao(t('missao.titulo'), falhou(r)));
  const c = r.contagem || {};
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('missao.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('missao.intro')) + '</p>' + cab +
    '<p class="sub">' + esc(t('missao.contagem', { abertas: c.abertas || 0,
      respondidas: c.respondidas || 0, resolvidas: c.resolvidas || 0 })) + '</p>' +
    '<p><button class="btn mini" onclick="telaMissoes(null,true)">' + esc(t('missao.sincronizar')) +
      '</button> <button class="btn mini claro" onclick="telaMissoes(\\'' +
      (st === 'aberta' ? 'respondida' : 'aberta') + '\\')">' +
      esc(st === 'aberta' ? t('missao.ver_respondidas') : t('missao.ver_abertas')) + '</button></p>' +
    ((r.missoes || []).length
      ? r.missoes.map(m =>
          '<div class="card" style="padding:18px">' +
          '<p style="margin:0 0 8px"><strong>' + esc(m.pergunta) + '</strong></p>' +
          '<p class="sub" style="margin:0">' + esc(t('historiador.tipo_' + m.tipo)) +
            (m.respondida_por_nome ? ' · ' + esc(t('missao.respondida_por',
              { nome: m.respondida_por_nome })) : '') + '</p>' +
          (m.status === 'aberta'
            ? '<p style="margin:12px 0 0"><button class="btn mini" onclick="responderMissao(\\'' +
              m.id + '\\')">' + esc(t('missao.responder')) + '</button> ' +
              (pode('editar') ? '<button class="btn mini claro" onclick="dispensarMissao(\\'' +
                m.id + '\\')">' + esc(t('missao.dispensar')) + '</button>' : '') + '</p>'
            : '') +
          '</div>').join('')
      : vazio(t('missao.nenhuma'), t('missao.nenhuma_p'))));
}

async function responderMissao(id) {
  const corpo = prompt(t('missao.resposta_placeholder'));
  if (!corpo) return;
  const r = await api('POST', '/familias/' + FAM.id + '/missoes/' + id + '/responder', { corpo });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  telaMissoes();
}

async function dispensarMissao(id) {
  const motivo = prompt(t('missao.motivo'));
  if (motivo === null) return;
  const r = await api('POST', '/familias/' + FAM.id + '/missoes/' + id + '/dispensar', { motivo });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  telaMissoes();
}

// Índice de memória (§31): a lista sai POR NOME. Não existe placar entre
// familiares — o número serve para achar lacuna, não para comparar.
function barra(score) {
  return '<span style="display:inline-block;width:90px;height:8px;border-radius:4px;' +
    'background:var(--borda);vertical-align:middle"><span style="display:block;height:8px;' +
    'border-radius:4px;background:var(--tema);width:' + Math.max(2, score) + '%"></span></span>';
}

async function telaIndice() {
  aguarde(t('indice.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/indice-memoria');
  if (deuErro(r)) return $(colecao(t('indice.titulo'), falhou(r, 'telaIndice()')));
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('indice.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('indice.intro')) + '</p>' +
    '<p class="sub">' + esc(t('indice.sem_ranking')) + '</p>' +
    (r.pessoas || []).map(p =>
      '<div class="linha"><span><a href="#" onclick="dossie(\\'' + p.person_id + '\\');return false">' +
      '<strong>' + esc(p.nome_exibicao) + '</strong></a><br><span class="sub">' +
      ((p.lacunas || []).length
        ? esc(t('indice.falta')) + ': ' + p.lacunas.map(l => esc(t('indice.dim_' + l))).join(', ')
        : esc(t('indice.nada_falta'))) + '</span></span>' +
      '<span>' + barra(p.score) + ' <span class="sub">' +
        esc(t('indice.score', { n: p.score })) + '</span></span></div>').join(''));
}

// ------------------------------------------------- planos e créditos (§50)
// A família vê PREÇO. Custo e margem são do staff e não passam por aqui.
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString(IDIOMA, { minimumFractionDigits: 2 });

async function telaPlanos() {
  aguarde(t('plano.titulo'));
  const r = await api('GET', '/familias/' + FAM.id + '/planos');
  if (deuErro(r)) return $(colecao(t('plano.titulo'), falhou(r, 'telaPlanos()')));
  const podeComprar = r.pagamento === 'mercadopago' && pode('creditos.comprar');
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('plano.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('plano.intro')) + '</p>' +
    '<p class="sub">' + esc(r.assinatura ? t('plano.atual', { nome: r.assinatura.nome })
      : t('plano.sem_assinatura')) + ' · ' + esc(t('plano.saldo', { n: r.saldo })) + '</p>' +
    (r.assinatura && r.assinatura.status === 'ativa'
      ? '<p class="sub">' + esc(t('plano.renova_em', { data: r.assinatura.proximo_ciclo || '—' })) +
        ' · <a href="#" onclick="cancelarAssinatura();return false">' +
        esc(t('plano.cancelar')) + '</a></p>' : '') +

    (r.planos || []).map(p =>
      '<div class="card" style="padding:18px">' +
      '<p style="margin:0 0 6px"><strong style="font-size:18px">' + esc(p.nome) + '</strong> ' +
        (p.preco_centavos ? '<span class="sub">' + esc(brl(p.preco_centavos)) +
          esc(t('plano.por_mes')) + '</span>' : '<span class="papel">' + esc(t('plano.gratis')) + '</span>') +
        '</p>' +
      (p.preco_anual_centavos
        ? '<p class="sub" style="margin:0 0 6px">' +
          esc(t('plano.por_ano', { valor: brl(p.preco_anual_centavos) })) + '</p>' : '') +
      '<p class="sub" style="margin:0">' +
        esc(t('plano.storage', { n: p.storage_gb })) + ' · ' +
        (p.creditos_mes ? esc(t('plano.creditos_mes', { n: p.creditos_mes })) + ' · ' : '') +
        esc(p.familias > 1 ? t('plano.familias_n', { n: p.familias }) : t('plano.familias_1')) +
        ' · ' + esc(t('plano.membros')) + '</p>' +
      // O botão só existe quando há gateway ligado E o plano é pago: sem
      // isso, botão de "assinar" que não cobra é promessa falsa.
      (podeComprar && p.preco_centavos ?
        '<p style="margin:10px 0 0">' +
        '<button class="btn" onclick="assinar(\\'' + esc(p.codigo) + '\\',\\'mensal\\')">' +
          esc(t('plano.assinar_mes')) + '</button>' +
        (p.preco_anual_centavos ? ' <button class="btn sec" onclick="assinar(\\'' + esc(p.codigo) +
          '\\',\\'anual\\')">' + esc(t('plano.assinar_ano')) + '</button>' : '') +
        '</p>' : '') +
      '</div>').join('') +

    '<h3 style="margin-top:26px">' + esc(t('plano.pacotes')) + '</h3>' +
    '<p class="sub">' + esc(t('plano.creditos_explica')) + '</p>' +
    (r.pacotes || []).map(p => '<div class="linha"><span>' +
      esc(t('plano.pacote', { n: p.creditos, valor: brl(p.preco_centavos) })) + '</span>' +
      (podeComprar ? '<span><button class="btn sec" onclick="comprarCreditos(\\'' +
        esc(p.codigo) + '\\')">' + esc(t('plano.comprar')) + '</button></span>' : '') +
      '</div>').join('') +

    (podeComprar ? '' : '<h3 style="margin-top:26px">' + esc(t('plano.manual_titulo')) + '</h3>' +
      '<p class="sub">' + esc(t('plano.manual')) + '</p>') +

    ((r.pedidos || []).length ? '<h3 style="margin-top:26px">' + esc(t('plano.compras')) + '</h3>' +
      r.pedidos.map(p => '<div class="linha"><span>' + esc(p.descricao) +
        ' <span class="sub">' + esc(p.codigo) + '</span></span><span class="sub">' +
        esc(brl(p.total_centavos)) + ' · ' + esc(t('plano.st_' + p.status)) +
        '</span></div>').join('') : ''));
}

/**
 * Comprar leva ao gateway, não credita nada aqui: quem credita é o webhook
 * depois que o Mercado Pago confirmar (billing.js). A aba nova é de
 * propósito — voltar para o acervo não pode custar o pagamento em curso.
 */
async function comprarCreditos(pacote) {
  const r = await api('POST', '/familias/' + FAM.id + '/pedidos', { pacote });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  irPagar(r.pagamento);
}

async function assinar(plano, ciclo) {
  const r = await api('POST', '/familias/' + FAM.id + '/assinatura', { plano, ciclo });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  irPagar(r.pagamento);
}

function irPagar(pag) {
  if (pag && pag.link) {
    window.open(pag.link, '_blank', 'noopener');
    return $(document.getElementById('app').innerHTML + aviso(t('plano.pagando'), 'ok'));
  }
  $(document.getElementById('app').innerHTML + aviso(t('plano.manual'), 'ok'));
}

async function cancelarAssinatura() {
  if (!confirm(t('plano.cancelar_confirma'))) return;
  const r = await api('DELETE', '/familias/' + FAM.id + '/assinatura');
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  telaPlanos();
}

// ------------------------------------------------------ avisos (§87)
async function telaAvisos() {
  const r = await api('GET', '/familias/' + FAM.id + '/notificacoes');
  if (deuErro(r)) return $(colecao(t('notificacao.titulo'), falhou(r, 'telaAvisos()')));
  const atual = (r.preferencias || []).find(p => p.evento === 'missoes');
  const freq = atual ? atual.frequencia : 'nunca';
  $(topo() + voltarFamilia() +
    '<h2>' + esc(t('notificacao.titulo')) + '</h2>' +
    '<p class="sub">' + esc(t('notificacao.intro')) + '</p>' +
    '<label for="nt_f">' + esc(t('notificacao.missoes')) + '</label>' +
    '<select id="nt_f">' +
      ['nunca', 'imediato'].map(f => '<option value="' + f + '"' + (f === freq ? ' selected' : '') +
        '>' + esc(t('notificacao.' + f)) + '</option>').join('') + '</select>' +
    '<p><button class="btn" onclick="salvarAviso()">' + esc(t('acao.salvar')) + '</button></p>');
}

async function salvarAviso() {
  const r = await api('PATCH', '/familias/' + FAM.id + '/notificacoes',
    { evento: 'missoes', frequencia: val('nt_f') });
  if (deuErro(r)) return $(document.getElementById('app').innerHTML + aviso(r.erro));
  $(document.getElementById('app').innerHTML + aviso(t('notificacao.salvo'), 'ok'));
}

// ------------------------------------------------- links vindos do e-mail
async function rotaDoHash() {
  const h = location.hash.slice(1);
  const [qual, q] = h.split('?');
  const token = new URLSearchParams(q || '').get('token');
  if (qual === 'verificar' && token) {
    const r = await api('GET', '/conta/verificar?token=' + encodeURIComponent(token));
    history.replaceState(null, '', '/origena/app');
    return r.status === 200 ? inicio() : telaEntrar(r.erro);
  }
  if (qual === 'convite' && token) {
    const c = await api('GET', '/convites/' + encodeURIComponent(token));
    if (deuErro(c)) { history.replaceState(null, '', '/origena/app'); return telaEntrar(c.erro); }
    const eu = await api('GET', '/conta/eu');
    if (eu.status !== 200) return telaEntrar(t('conta.entre_com_email', { email: c.convite.email }));
    const a = await api('POST', '/convites/' + encodeURIComponent(token) + '/aceitar');
    history.replaceState(null, '', '/origena/app');
    return a.status === 200 ? abrir(a.familyId) : (EU = eu.usuario, $(topo() + aviso(a.erro)));
  }
  if (qual === 'nova-senha' && token) {
    return $(topo() + '<h2>' + esc(t('conta.nova_senha_titulo')) + '</h2><label for="s">' + esc(t('campo.nova_senha')) + '</label>' +
      '<input id="s" type="password" autocomplete="new-password">' +
      '<button class="btn" onclick="salvarSenha(\\'' + esc(token) + '\\')">' + esc(t('acao.salvar')) + '</button>');
  }
  if (qual.charAt(0) === '/') return abrirEndereco(qual);
  inicio();
}

// ------------------------------------------------- cada tela tem endereço
// F5 dentro do acervo caía no começo, e o que a pessoa estava vendo se
// perdia. Agora toda tela escreve o próprio endereço
// (#/<familia>/<tela>/<id>), e o endereço sabe reabrir a tela: atualizar a
// página, voltar no navegador e mandar o link para alguém da família
// passam a funcionar.
//
// A lista abaixo diz quantos argumentos entram no ENDEREÇO — não quantos
// a função aceita. telaMissoes(status, sincronizar) entra com zero de
// propósito: recarregar a página não pode disparar de novo a varredura.
// (Sem crase nestes comentários: o app inteiro mora dentro de um template
// literal, e uma crase solta encerraria o literal no meio do arquivo.)
const TELAS = {
  inicio: ['inicio', 0], conta: ['telaConta', 0], familia: ['abrir', 1],
  pessoas: ['pessoas', 0], pessoa: ['dossie', 1], arvore: ['verArvore', 1],
  divergencias: ['divergencias', 0], auditoria: ['auditoria', 0],
  memorias: ['memorias', 0], midia: ['verMidia', 1], lixeira: ['telaLixeira', 0],
  adicionar: ['telaAdicionar', 0],
  albuns: ['telaAlbuns', 0], album: ['verAlbum', 1],
  historias: ['telaHistorias', 0], historia: ['verHistoria', 1],
  tradicoes: ['telaTradicoes', 1], tradicao: ['verTradicao', 1],
  reliquias: ['telaReliquias', 0], reliquia: ['verReliquia', 1],
  entrevistas: ['telaEntrevistas', 0], entrevista: ['verEntrevista', 1],
  capsulas: ['telaCapsulas', 0], capsula: ['abrirCapsula', 1],
  guardioes: ['telaGuardioes', 0], livros: ['telaLivros', 0],
  timeline: ['telaTimeline', 1], mapa: ['telaMapa', 0], grafo: ['telaGrafo', 2],
  busca: ['telaBusca', 0], perguntar: ['telaPerguntar', 0],
  missoes: ['telaMissoes', 0], historiador: ['telaHistoriador', 0],
  indice: ['telaIndice', 0], planos: ['telaPlanos', 0], avisos: ['telaAvisos', 0],
};
const ORIGINAL = {};

for (const rota in TELAS) {
  const nome = TELAS[rota][0], nArgs = TELAS[rota][1];
  const original = window[nome];
  if (typeof original !== 'function') continue;
  ORIGINAL[rota] = original;
  // Troca a função GLOBAL: todo onclick que já existia passa a anotar o
  // endereço antes de desenhar, sem precisar mexer em nenhuma chamada.
  window[nome] = function () {
    const args = [].slice.call(arguments, 0, nArgs)
      .filter((a) => typeof a === 'string' || typeof a === 'number');
    const familia = rota === 'familia' ? args[0] : (FAM ? FAM.id : '-');
    const endereco = '#/' + [familia || '-', rota]
      .concat(rota === 'familia' ? [] : args.map(encodeURIComponent)).join('/');
    if (location.hash !== endereco) history.pushState(null, '', endereco);
    NAVEGOU = true;   // trocou de tela: o foco vai para o conteúdo
    return original.apply(this, arguments);
  };
}
// Voltar e avançar no navegador redesenham a tela do endereço.
window.addEventListener('popstate', () => { rotaDoHash(); });

async function abrirEndereco(caminho) {
  const partes = caminho.split('/').filter((x) => x !== '');
  const fam = partes[0], alvo = TELAS[partes[1]];
  if (!alvo || !ORIGINAL[partes[1]]) return inicio();
  const eu = await api('GET', '/conta/eu');
  if (eu.status !== 200) return telaEntrar();   // sessão vencida: o endereço espera
  EU = eu.usuario;
  if (fam && fam !== '-' && (!FAM || FAM.id !== fam)) {
    const f = await api('GET', '/familias/' + fam);
    if (deuErro(f)) return inicio();
    FAM = f.familia; PERM = f.permissoes || [];
  }
  const args = partes.slice(2).map(decodeURIComponent).slice(0, alvo[1]);
  // Chama a função ORIGINAL: o endereço já é este, não há o que anotar.
  return ORIGINAL[partes[1]].apply(null, partes[1] === 'familia' ? [fam] : args);
}
async function salvarSenha(token) {
  const r = await api('POST', '/conta/nova-senha', { token, senha: document.getElementById('s').value });
  history.replaceState(null, '', '/origena/app');
  telaEntrar(r.status === 200 ? t('conta.senha_alterada') : r.erro);
}

rotaDoHash();
</script>`;

module.exports = { registrarPaginas, pagina, CSS };
