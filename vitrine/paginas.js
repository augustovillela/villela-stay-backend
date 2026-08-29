// =====================================================================
// Vitrine — páginas públicas server-rendered (SEO) + casca do painel.
// Identidade própria do produto: azul-petróleo (#0C5A52) sobre fundo
// claro, acento quente (#E8641B) para oferta e ação. NÃO usa o V-Portal:
// marketplace tem cara de marketplace (mesma decisão do Closet Club).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const repo = require('./repo');
const frete = require('./frete');
const { Products, Categorias, Vendedores, Config, s, n } = repo;

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const CONDICAO_ROTULO = { novo: 'Novo', seminovo: 'Seminovo', usado: 'Usado' };

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------
const CSS = `
:root{--tinta:#1C2321;--petro:#0C5A52;--petro-esc:#07403A;--acao:#E8641B;--fundo:#F7F5F0;--card:#FFFFFF;--borda:#E4E0D6;--suave:#5C6662;--ok:#1F7A33;}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;background:var(--fundo);color:var(--tinta);line-height:1.55;font-size:16px}
a{color:var(--petro);text-decoration:none}
a:hover{text-decoration:underline}
:focus-visible{outline:3px solid var(--acao);outline-offset:2px;border-radius:4px}
.container{max-width:1180px;margin:0 auto;padding:0 16px}
header.topo{background:var(--petro);color:#fff;padding:10px 0}
.topo-linha{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.logo{font-size:1.5rem;font-weight:800;letter-spacing:-.5px;color:#fff;display:flex;align-items:center;gap:10px}
.logo:hover{text-decoration:none}
.logo svg{display:block}
.busca{flex:1;min-width:220px;display:flex}
.busca input{flex:1;border:none;border-radius:10px 0 0 10px;padding:11px 14px;font-size:1rem}
.busca button{border:none;background:var(--acao);color:#fff;border-radius:0 10px 10px 0;padding:0 18px;font-size:1rem;cursor:pointer}
.topo-links{display:flex;gap:16px;align-items:center}
.topo-links a{color:#EAF2F0;font-size:.95rem}
nav.cats{background:var(--petro-esc);padding:7px 0}
nav.cats .container{display:flex;gap:18px;overflow-x:auto;white-space:nowrap}
nav.cats a{color:#CFE3DF;font-size:.92rem;padding:3px 0}
main{padding:26px 0 60px;min-height:55vh}
h1{font-size:1.7rem;margin-bottom:14px}
h2{font-size:1.25rem;margin:26px 0 12px}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}
.cartao{background:var(--card);border:1px solid var(--borda);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .15s}
.cartao:hover{box-shadow:0 6px 18px rgba(12,90,82,.14);text-decoration:none}
.cartao img{width:100%;aspect-ratio:1;object-fit:cover;background:#EDEAE2}
.cartao .info{padding:12px 14px 14px;display:flex;flex-direction:column;gap:4px;flex:1}
.cartao .titulo{font-size:.95rem;color:var(--tinta);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.6em}
.preco{font-size:1.2rem;font-weight:700;color:var(--tinta)}
.preco-antigo{color:var(--suave);text-decoration:line-through;font-size:.85rem;margin-right:6px}
.selo{display:inline-block;font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:99px;width:fit-content}
.selo.usado{background:#FDEBDD;color:#9A4206}.selo.seminovo{background:#FFF5D6;color:#7A5B00}.selo.novo{background:#E1F1E4;color:var(--ok)}
.meta{color:var(--suave);font-size:.82rem}
.btn{display:inline-block;border:none;cursor:pointer;border-radius:10px;padding:12px 22px;font-size:1rem;font-weight:600;text-align:center}
.btn.acao{background:var(--acao);color:#fff}
.btn.acao:hover{background:#C95212;text-decoration:none}
.btn.secund{background:#fff;color:var(--petro);border:2px solid var(--petro)}
.btn.secund:hover{background:#EDF4F3;text-decoration:none}
.hero{background:linear-gradient(120deg,var(--petro) 0%,#0E6E60 70%);color:#fff;border-radius:18px;padding:44px 36px;margin-bottom:30px}
.hero h1{font-size:2.1rem;max-width:640px;margin-bottom:10px}
.hero p{max-width:560px;color:#DCEAE7;margin-bottom:22px}
.faixa-cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}
.faixa-cats a{background:var(--card);border:1px solid var(--borda);border-radius:14px;padding:16px 8px;text-align:center;color:var(--tinta);font-size:.9rem}
.faixa-cats .emoji{font-size:1.7rem;display:block;margin-bottom:6px}
.bloco-seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin-top:8px}
.bloco-seg .item{background:var(--card);border:1px solid var(--borda);border-radius:14px;padding:18px}
.bloco-seg h3{font-size:1rem;margin-bottom:6px}
.bloco-seg p{font-size:.9rem;color:var(--suave)}
footer{background:var(--petro-esc);color:#BFD6D2;padding:36px 0;font-size:.9rem}
footer .colunas{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:22px;margin-bottom:22px}
footer a{color:#DCEAE7;display:block;margin:4px 0}
footer .legal{border-top:1px solid #14554C;padding-top:14px;color:#8FB3AD}
.aviso{background:#FFF6E8;border:1px solid #F0D9B0;border-radius:12px;padding:14px 18px;margin:14px 0;font-size:.92rem}
.aviso.minuta{background:#FDECEC;border-color:#E8B9B9}
.filtros{background:var(--card);border:1px solid var(--borda);border-radius:14px;padding:18px}
.filtros label{display:block;font-size:.85rem;font-weight:600;margin:10px 0 4px}
.filtros input,.filtros select{width:100%;padding:9px 10px;border:1px solid var(--borda);border-radius:8px;font-size:.95rem;background:#fff}
.busca-layout{display:grid;grid-template-columns:250px 1fr;gap:22px}
@media(max-width:820px){.busca-layout{grid-template-columns:1fr}}
.pagina-prod{display:grid;grid-template-columns:1.1fr .9fr;gap:28px}
@media(max-width:900px){.pagina-prod{grid-template-columns:1fr}}
.fotos img{width:100%;border-radius:14px;border:1px solid var(--borda);background:#EDEAE2}
.fotos .minis{display:flex;gap:8px;margin-top:8px}
.fotos .minis img{width:72px;height:72px;object-fit:cover;cursor:pointer}
.caixa{background:var(--card);border:1px solid var(--borda);border-radius:14px;padding:22px}
.estado-uso{background:#FDF3E7;border:1px solid #EBCFA9;border-radius:12px;padding:14px;margin:14px 0}
.estado-uso h3{font-size:.95rem;margin-bottom:6px;color:#9A4206}
.linha-vend{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--borda);margin-top:16px;padding-top:14px}
.estrelas{color:#D99A06;font-weight:700}
.pergunta{border-top:1px solid var(--borda);padding:12px 0}
.pergunta .resp{color:var(--petro);margin-top:4px;padding-left:14px;border-left:3px solid var(--borda)}
.vazio{color:var(--suave);padding:30px 0;text-align:center}
.paginacao{display:flex;gap:8px;justify-content:center;margin-top:26px}
.paginacao a,.paginacao span{padding:8px 14px;border:1px solid var(--borda);border-radius:8px;background:#fff}
.paginacao .atual{background:var(--petro);color:#fff;border-color:var(--petro)}
.form-auth{max-width:430px;margin:0 auto;background:var(--card);border:1px solid var(--borda);border-radius:16px;padding:28px}
.form-auth label{display:block;font-weight:600;font-size:.9rem;margin:12px 0 4px}
.form-auth input{width:100%;padding:11px 12px;border:1px solid var(--borda);border-radius:8px;font-size:1rem}
.form-auth .erro{color:#B3261E;margin-top:10px;font-size:.9rem}
.prosa{max-width:820px}
.prosa p,.prosa li{margin-bottom:10px}
.prosa ul,.prosa ol{padding-left:22px;margin-bottom:14px}
.prosa h2{margin-top:28px}
.skip{position:absolute;left:-9999px;top:0;background:#fff;color:var(--petro);padding:10px;z-index:99}
.skip:focus{left:8px}
`;

// Símbolo da marca em variante CLARA (o cabeçalho é azul-petróleo): loja com
// toldo, corpo branco e porta laranja. A variante oficial sobre fundo claro
// vive em /assets/brand/vitrine/simbolo.svg (usada no card da home do grupo
// e como favicon).
const LOGO_CLARO = `<svg viewBox="0 0 120 120" width="30" height="30" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path fill="#FFFFFF" d="M28 52h64v34a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V52z"/>
<rect fill="#E8641B" x="50" y="62" width="20" height="30" rx="3"/>
<rect fill="#0C5A52" x="35" y="62" width="10" height="14" rx="2"/>
<rect fill="#0C5A52" x="75" y="62" width="10" height="14" rx="2"/>
<path fill="#FFFFFF" d="M24 30h72a4 4 0 0 1 4 4v10H20V34a4 4 0 0 1 4-4z"/>
<path fill="#E8641B" d="M20 44h20a10 10 0 0 1-20 0z"/>
<path fill="#9FC3BD" d="M40 44h20a10 10 0 0 1-20 0z"/>
<path fill="#E8641B" d="M60 44h20a10 10 0 0 1-20 0z"/>
<path fill="#9FC3BD" d="M80 44h20a10 10 0 0 1-20 0z"/>
</svg>`;

function layout({ titulo, descricao = '', conteudo, jsonld = null, semIndex = false, canonico = '' }) {
  const cats = Categorias.listar({ arvore: true });
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · Vitrine</title>
<meta name="description" content="${esc(descricao || 'Vitrine: marketplace brasileiro para comprar e vender produtos novos e usados com pagamento protegido e rastreamento.')}">
${semIndex ? '<meta name="robots" content="noindex,nofollow">' : ''}
${canonico ? `<link rel="canonical" href="${esc(canonico)}">` : ''}
<link rel="icon" type="image/svg+xml" href="/assets/brand/vitrine/simbolo.svg">
<meta name="theme-color" content="#0C5A52">
${jsonld ? `<script type="application/ld+json">${jsonLd(jsonld)}</script>` : ''}
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="topo">
  <div class="container topo-linha">
    <a class="logo" href="/vitrine" aria-label="Vitrine — página inicial">${LOGO_CLARO}Vitrine</a>
    <form class="busca" action="/vitrine/busca" method="get" role="search">
      <input type="search" name="q" placeholder="Buscar produtos novos e usados…" aria-label="Buscar produtos">
      <button type="submit" aria-label="Buscar">🔍</button>
    </form>
    <nav class="topo-links" aria-label="Conta">
      <a href="/vitrine/app#favoritos">♡ Favoritos</a>
      <a href="/vitrine/app#carrinho">🛒 Carrinho</a>
      <a href="/vitrine/app">Minha conta</a>
    </nav>
  </div>
</header>
<nav class="cats" aria-label="Categorias">
  <div class="container">
    ${cats.map((c) => `<a href="/vitrine/c/${esc(c.slug)}">${esc(c.emoji)} ${esc(c.nome)}</a>`).join('')}
    <a href="/vitrine/venda-conosco"><b>Venda conosco</b></a>
  </div>
</nav>
<main id="conteudo"><div class="container">${conteudo}</div></main>
<footer>
  <div class="container">
    <div class="colunas">
      <div><b>Vitrine</b>
        <a href="/vitrine/como-funciona">Como funciona</a>
        <a href="/vitrine/venda-conosco">Venda conosco</a>
        <a href="/vitrine/seguranca">Compra segura</a>
      </div>
      <div><b>Políticas</b>
        <a href="/vitrine/termos">Termos de uso</a>
        <a href="/vitrine/privacidade">Privacidade</a>
        <a href="/vitrine/proibidos">Produtos proibidos</a>
        <a href="/vitrine/devolucao">Devolução e disputas</a>
      </div>
      <div><b>Conta</b>
        <a href="/vitrine/entrar">Entrar ou criar conta</a>
        <a href="/vitrine/app">Meu painel</a>
        <a href="/vitrine/app#vender">Painel do vendedor</a>
      </div>
    </div>
    <div class="legal">Vitrine é um marketplace em demonstração do Grupo Villela Stay. Pagamentos e fretes operam em modo simulado — nenhum valor real é cobrado. Comissão da plataforma: ${Config.num('marketplace_commission_percent', 5)}% por venda.</div>
  </div>
</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------
// Cartão de produto (compartilhado por home, busca, categoria, vendedor)
// ---------------------------------------------------------------------
function cartaoProduto(p) {
  const foto = p.foto || `/vitrine/placeholder/${encodeURIComponent(p.slug)}.svg`;
  return `<a class="cartao" href="/vitrine/p/${esc(p.slug)}">
    <img src="${esc(foto)}" alt="${esc(p.titulo)}" loading="lazy">
    <div class="info">
      <span class="selo ${esc(p.condicao)}">${esc(CONDICAO_ROTULO[p.condicao] || p.condicao)}</span>
      <span class="titulo">${esc(p.titulo)}</span>
      <span class="preco">${p.preco_anterior_centavos > p.preco_centavos ? `<span class="preco-antigo">${brl(p.preco_anterior_centavos)}</span>` : ''}${brl(p.preco_centavos)}</span>
      <span class="meta">${esc(p.cidade || '')}${p.uf ? ' · ' + esc(p.uf) : ''}${p.loja_nome ? ' · ' + esc(p.loja_nome) : ''}</span>
    </div>
  </a>`;
}
const grade = (itens) => itens.length ? `<div class="grade">${itens.map(cartaoProduto).join('')}</div>` : '<p class="vazio">Nenhum produto por aqui ainda.</p>';

// ---------------------------------------------------------------------
// Registro das páginas
// ---------------------------------------------------------------------
function registrarPaginas(app) {
  const g = (rota, fn) => app.get(rota, (req, res) => {
    Promise.resolve(fn(req, res)).catch((e) => res.status(500).send(layout({ titulo: 'Erro', semIndex: true, conteudo: `<h1>Algo deu errado</h1><p>${esc(e.message)}</p>` })));
  });

  // ---- home ----
  g('/vitrine', (req, res) => {
    const recomendados = Products.buscar({ ordem: 'relevancia', porPagina: 8 }).itens;
    const usados = Products.buscar({ condicao: 'usado', ordem: 'recentes', porPagina: 8 }).itens;
    const novos = Products.buscar({ condicao: 'novo', ordem: 'recentes', porPagina: 8 }).itens;
    const cats = Categorias.listar({ arvore: true });
    res.send(layout({
      titulo: 'Compre e venda produtos novos e usados',
      descricao: 'Na Vitrine você compra e vende com pagamento protegido, rastreamento do envio e comissão justa de ' + Config.num('marketplace_commission_percent', 5) + '%. Produtos novos, seminovos e usados com descrição honesta.',
      conteudo: `
      <section class="hero">
        <h1>Dê uma nova vida ao que está parado. Compre bem, venda melhor.</h1>
        <p>Marketplace brasileiro para produtos novos e usados: pagamento protegido até a entrega, rastreamento do envio e vendedores com reputação de verdade.</p>
        <a class="btn acao" href="/vitrine/busca">Explorar ofertas</a>
        <a class="btn secund" style="margin-left:10px;background:transparent;color:#fff;border-color:#fff" href="/vitrine/venda-conosco">Começar a vender</a>
      </section>
      <h2>Categorias em destaque</h2>
      <div class="faixa-cats">${cats.map((c) => `<a href="/vitrine/c/${esc(c.slug)}"><span class="emoji">${esc(c.emoji)}</span>${esc(c.nome)}</a>`).join('')}</div>
      <h2>Recomendados para você</h2>
      ${grade(recomendados)}
      <h2>Ofertas de usados — bom para o bolso e para o planeta</h2>
      ${grade(usados)}
      <h2>Chegando novos</h2>
      ${grade(novos)}
      <h2>Comprar na Vitrine é seguro</h2>
      <div class="bloco-seg">
        <div class="item"><h3>💳 Pagamento protegido</h3><p>O valor só é repassado ao vendedor depois que o pedido é entregue e o prazo de devolução passa. Em caso de problema, a mediação devolve seu dinheiro.</p></div>
        <div class="item"><h3>📦 Rastreamento do envio</h3><p>Acompanhe cada etapa do pedido, da postagem à entrega, direto no seu painel — com linha do tempo completa.</p></div>
        <div class="item"><h3>⭐ Reputação de verdade</h3><p>Só quem comprou e recebeu pode avaliar. Notas de produto, descrição, embalagem, envio e atendimento.</p></div>
        <div class="item"><h3>🤝 Dentro da plataforma</h3><p>Negociar e pagar fora da Vitrine cancela toda a proteção. Desconfie de quem pedir Pix por fora.</p></div>
      </div>
      <section class="hero" style="margin-top:34px;padding:32px 36px">
        <h1 style="font-size:1.6rem">Tem coisa boa parada em casa? Anuncie em minutos.</h1>
        <p>Cadastro gratuito, comissão de só ${Config.num('marketplace_commission_percent', 5)}% por venda concluída e repasse direto na sua chave Pix.</p>
        <a class="btn acao" href="/vitrine/venda-conosco">Quero vender</a>
      </section>`,
    }));
  });

  // ---- busca (filtros na URL) e categoria ----
  const paginaBusca = (req, res, catSlug = '') => {
    const q = req.query || {};
    const categoria = catSlug || s(q.categoria, 90);
    const params = {
      q: s(q.q, 120), categoria, condicao: s(q.condicao, 20),
      precoMin: q.preco_min ? Math.round(n(q.preco_min) * 100) : null,
      precoMax: q.preco_max ? Math.round(n(q.preco_max) * 100) : null,
      uf: s(q.uf, 2), cidade: s(q.cidade, 80), entrega: s(q.entrega, 20),
      notaMin: q.nota_min ? n(q.nota_min) : null, ordem: s(q.ordem, 20), pagina: q.pagina,
    };
    const r = Products.buscar(params);
    const cat = categoria ? Categorias.porSlug(categoria) : null;
    const titulo = cat ? cat.nome : (params.q ? `Busca por "${params.q}"` : 'Todos os produtos');
    const qs = (pg) => {
      const u = new URLSearchParams();
      if (params.q) u.set('q', params.q);
      if (!catSlug && categoria) u.set('categoria', categoria);
      for (const [k, v] of [['condicao', q.condicao], ['preco_min', q.preco_min], ['preco_max', q.preco_max], ['uf', q.uf], ['cidade', q.cidade], ['entrega', q.entrega], ['nota_min', q.nota_min], ['ordem', q.ordem]]) if (v) u.set(k, v);
      if (pg > 1) u.set('pagina', pg);
      const t = u.toString();
      return (catSlug ? `/vitrine/c/${catSlug}` : '/vitrine/busca') + (t ? '?' + t : '');
    };
    const opt = (val, rot, atual) => `<option value="${esc(val)}"${String(atual) === String(val) ? ' selected' : ''}>${esc(rot)}</option>`;
    const cats = Categorias.listar({ arvore: true });
    const pag = [];
    for (let i = 1; i <= r.paginas; i++) pag.push(i === r.pagina ? `<span class="atual">${i}</span>` : `<a href="${esc(qs(i))}">${i}</a>`);
    res.send(layout({
      titulo, descricao: `${titulo}: ${r.total} produto(s) na Vitrine.`, canonico: qs(r.pagina),
      conteudo: `
      <h1>${esc(titulo)} <small style="font-size:.9rem;color:var(--suave)">${r.total} resultado(s)</small></h1>
      <div class="busca-layout">
        <form class="filtros" method="get" action="${catSlug ? '/vitrine/c/' + esc(catSlug) : '/vitrine/busca'}" aria-label="Filtros de busca">
          ${params.q ? `<input type="hidden" name="q" value="${esc(params.q)}">` : ''}
          ${!catSlug ? `<label for="f-cat">Categoria</label><select id="f-cat" name="categoria"><option value="">Todas</option>${cats.map((c) => opt(c.slug, c.emoji + ' ' + c.nome, categoria) + c.filhos.map((f) => opt(f.slug, '— ' + f.nome, categoria)).join('')).join('')}</select>` : ''}
          <label for="f-cond">Condição</label>
          <select id="f-cond" name="condicao">${opt('', 'Todas', q.condicao)}${opt('novo', 'Novo', q.condicao)}${opt('seminovo', 'Seminovo', q.condicao)}${opt('usado', 'Usado', q.condicao)}</select>
          <label for="f-min">Preço mínimo (R$)</label><input id="f-min" type="number" name="preco_min" min="0" step="1" value="${esc(q.preco_min || '')}">
          <label for="f-max">Preço máximo (R$)</label><input id="f-max" type="number" name="preco_max" min="0" step="1" value="${esc(q.preco_max || '')}">
          <label for="f-uf">Estado (UF)</label><input id="f-uf" name="uf" maxlength="2" value="${esc(q.uf || '')}" placeholder="DF">
          <label for="f-cid">Cidade</label><input id="f-cid" name="cidade" value="${esc(q.cidade || '')}" placeholder="Brasília">
          <label for="f-ent">Entrega</label>
          <select id="f-ent" name="entrega">${opt('', 'Qualquer', q.entrega)}${opt('envio', 'Com envio', q.entrega)}${opt('retirada', 'Retirada em mãos', q.entrega)}</select>
          <label for="f-nota">Avaliação mínima do vendedor</label>
          <select id="f-nota" name="nota_min">${opt('', 'Qualquer', q.nota_min)}${opt('4', '4+ estrelas', q.nota_min)}${opt('4.5', '4,5+ estrelas', q.nota_min)}</select>
          <label for="f-ord">Ordenar por</label>
          <select id="f-ord" name="ordem">${opt('relevancia', 'Relevância', q.ordem)}${opt('menor_preco', 'Menor preço', q.ordem)}${opt('maior_preco', 'Maior preço', q.ordem)}${opt('recentes', 'Mais recentes', q.ordem)}${opt('populares', 'Mais populares', q.ordem)}</select>
          <button class="btn acao" style="width:100%;margin-top:14px" type="submit">Filtrar</button>
        </form>
        <div>${grade(r.itens)}${r.paginas > 1 ? `<nav class="paginacao" aria-label="Paginação">${pag.join('')}</nav>` : ''}</div>
      </div>`,
    }));
  };
  g('/vitrine/busca', (req, res) => paginaBusca(req, res));
  g('/vitrine/c/:slug', (req, res) => {
    if (!Categorias.porSlug(req.params.slug)) return res.status(404).send(layout({ titulo: 'Categoria não encontrada', semIndex: true, conteudo: '<h1>Categoria não encontrada</h1>' }));
    paginaBusca(req, res, s(req.params.slug, 90));
  });

  // ---- página do produto ----
  g('/vitrine/p/:slug', (req, res) => {
    const f = Products.fichaPublica(req.params.slug);
    if (!f || f.status !== 'ativo') return res.status(404).send(layout({ titulo: 'Produto não encontrado', semIndex: true, conteudo: '<h1>Produto não encontrado</h1><p>Pode ter sido vendido ou pausado. <a href="/vitrine/busca">Ver outros produtos</a>.</p>' }));
    Products.registrarVisita(f.id);
    const fotos = f.fotos.length ? f.fotos : [{ url: `/vitrine/placeholder/${encodeURIComponent(f.slug)}.svg` }];
    const v = f.vendedor;
    const estrelas = (nota) => nota ? '★'.repeat(Math.round(nota)) + '☆'.repeat(5 - Math.round(nota)) : '';
    res.send(layout({
      titulo: f.titulo,
      descricao: f.descricao.slice(0, 155),
      canonico: '/vitrine/p/' + f.slug,
      jsonld: {
        '@context': 'https://schema.org', '@type': 'Product', name: f.titulo, description: f.descricao.slice(0, 300),
        image: fotos.map((x) => x.url),
        itemCondition: f.condicao === 'novo' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
        offers: { '@type': 'Offer', priceCurrency: 'BRL', price: (f.preco_centavos / 100).toFixed(2), availability: f.quantidade > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
        ...(f.nota_media ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: f.nota_media, reviewCount: f.num_avaliacoes } } : {}),
      },
      conteudo: `
      <div class="pagina-prod">
        <div class="fotos">
          <img id="foto-principal" src="${esc(fotos[0].url)}" alt="${esc(f.titulo)}">
          ${fotos.length > 1 ? `<div class="minis">${fotos.map((x, i) => `<img src="${esc(x.url)}" alt="Foto ${i + 1} de ${esc(f.titulo)}" onclick="document.getElementById('foto-principal').src=this.src" tabindex="0">`).join('')}</div>` : ''}
        </div>
        <div class="caixa">
          <span class="selo ${esc(f.condicao)}">${esc(CONDICAO_ROTULO[f.condicao])}</span>
          <h1 style="font-size:1.4rem;margin:8px 0">${esc(f.titulo)}</h1>
          ${f.nota_media ? `<p class="estrelas" aria-label="Nota ${f.nota_media} de 5">${estrelas(f.nota_media)} ${f.nota_media} (${f.num_avaliacoes})</p>` : ''}
          <p class="preco" style="font-size:1.8rem;margin:10px 0">${f.preco_anterior_centavos > f.preco_centavos ? `<span class="preco-antigo">${brl(f.preco_anterior_centavos)}</span>` : ''}${brl(f.preco_centavos)}</p>
          <p class="meta">${f.quantidade > 0 ? f.quantidade + ' disponível(is)' : 'Esgotado'} · ${esc(f.cidade)}${f.uf ? '/' + esc(f.uf) : ''}
            ${f.marca ? ' · ' + esc(f.marca) : ''}${f.modelo ? ' ' + esc(f.modelo) : ''}</p>
          <p class="meta">Entrega: ${[f.entrega_envio ? 'envio com rastreio' : '', f.entrega_retirada ? 'retirada em mãos' : ''].filter(Boolean).join(' · ') || '—'}${f.garantia ? ' · Garantia: ' + esc(f.garantia) : ''}</p>
          <div style="display:flex;gap:10px;margin:18px 0;flex-wrap:wrap">
            <button class="btn acao" onclick="vtComprar('${esc(f.id)}')" ${f.quantidade < 1 ? 'disabled' : ''}>Adicionar ao carrinho</button>
            <button class="btn secund" onclick="vtFavoritar('${esc(f.id)}')" id="btn-fav">♡ Favoritar</button>
          </div>
          <p class="meta" id="msg-acao" role="status"></p>
          ${f.condicao !== 'novo' ? `<div class="estado-uso"><h3>Estado do produto — sinais de uso e defeitos declarados</h3><p>${esc(f.defeitos)}</p></div>` : ''}
          <div class="linha-vend">
            <div>
              <b><a href="/vitrine/vendedor/${esc(v ? v.loja_slug : '')}">${esc(v ? v.loja_nome : 'Vendedor')}</a></b><br>
              <span class="meta">${v && v.nota_media ? `<span class="estrelas">${estrelas(v.nota_media)}</span> ${v.nota_media} · ` : ''}${v ? v.vendas_concluidas : 0} venda(s) concluída(s)${v && v.indice_prazo != null ? ` · ${v.indice_prazo}% no prazo` : ''}</span>
            </div>
            <a class="btn secund" style="padding:8px 14px" href="/vitrine/vendedor/${esc(v ? v.loja_slug : '')}">Ver loja</a>
          </div>
          <p class="meta" style="margin-top:12px"><a href="#" onclick="vtDenunciar('${esc(f.id)}');return false">🚩 Denunciar este anúncio</a></p>
        </div>
      </div>
      <div class="caixa" style="margin-top:24px">
        <h2 style="margin-top:0">Descrição</h2>
        <p style="white-space:pre-wrap">${esc(f.descricao)}</p>
        <p class="meta" style="margin-top:10px">Peso: ${f.peso_gramas} g · Dimensões: ${f.comp_cm}×${f.larg_cm}×${f.alt_cm} cm · Publicado em ${esc(String(f.criado_em).slice(0, 10))}</p>
      </div>
      <div class="caixa" style="margin-top:24px">
        <h2 style="margin-top:0">Perguntas e respostas</h2>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <input id="nova-pergunta" style="flex:1;padding:10px;border:1px solid var(--borda);border-radius:8px" placeholder="Pergunte ao vendedor" aria-label="Sua pergunta">
          <button class="btn secund" onclick="vtPerguntar('${esc(f.id)}')">Perguntar</button>
        </div>
        ${f.perguntas.length ? f.perguntas.map((p) => `<div class="pergunta"><b>${esc(p.autor)}:</b> ${esc(p.pergunta)}${p.resposta ? `<div class="resp">↳ ${esc(p.resposta)}</div>` : '<div class="resp meta">Aguardando resposta do vendedor.</div>'}</div>`).join('') : '<p class="vazio">Nenhuma pergunta ainda. Seja o primeiro!</p>'}
      </div>
      <div class="caixa" style="margin-top:24px">
        <h2 style="margin-top:0">Avaliações de quem comprou</h2>
        ${f.avaliacoes.length ? f.avaliacoes.map((a) => `<div class="pergunta"><span class="estrelas">${estrelas(a.nota_produto)}</span> <b>${esc(a.comprador)}</b> · <span class="meta">${esc(String(a.criado_em).slice(0, 10))}</span><br>${esc(a.comentario || 'Sem comentário.')}</div>`).join('') : '<p class="vazio">Este produto ainda não tem avaliações. Só quem comprou e recebeu pode avaliar.</p>'}
      </div>
      <script>
      async function vtApi(metodo, caminho, corpo) {
        const r = await fetch(caminho, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
        if (r.status === 401) { location.href = '/vitrine/entrar?voltar=' + encodeURIComponent(location.pathname); throw new Error('login'); }
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || 'Erro');
        return j;
      }
      const vtMsg = (t) => { document.getElementById('msg-acao').textContent = t; };
      async function vtComprar(id) { try { await vtApi('POST', '/vitrine/api/carrinho', { product_id: id, quantidade: 1 }); location.href = '/vitrine/app#carrinho'; } catch (e) { if (e.message !== 'login') vtMsg(e.message); } }
      async function vtFavoritar(id) { try { const r = await vtApi('POST', '/vitrine/api/favoritos/' + id); document.getElementById('btn-fav').textContent = r.favoritado ? '❤ Favoritado' : '♡ Favoritar'; } catch (e) { if (e.message !== 'login') vtMsg(e.message); } }
      async function vtPerguntar(id) {
        const t = document.getElementById('nova-pergunta').value.trim();
        if (!t) return;
        try { await vtApi('POST', '/vitrine/api/produto/' + id + '/perguntar', { pergunta: t }); location.reload(); } catch (e) { if (e.message !== 'login') vtMsg(e.message); }
      }
      async function vtDenunciar(id) {
        const motivo = prompt('Qual o problema com este anúncio? (ex.: produto proibido, golpe, descrição enganosa)');
        if (!motivo) return;
        try { await vtApi('POST', '/vitrine/api/denunciar', { tipo: 'produto', alvo_id: id, motivo }); vtMsg('Denúncia registrada. Obrigado por ajudar a manter a Vitrine segura.'); } catch (e) { vtMsg(e.message); }
      }
      </script>`,
    }));
  });

  // ---- página pública do vendedor ----
  g('/vitrine/vendedor/:slug', (req, res) => {
    const v = Vendedores.porSlug(req.params.slug);
    if (!v || v.user_status !== 'ativo') return res.status(404).send(layout({ titulo: 'Vendedor não encontrado', semIndex: true, conteudo: '<h1>Vendedor não encontrado</h1>' }));
    const pub = Vendedores.publico(v.user_id);
    const produtos = Products.buscar({ sellerId: v.user_id, porPagina: 48 });
    res.send(layout({
      titulo: pub.loja_nome, descricao: `Loja ${pub.loja_nome} na Vitrine: ${pub.vendas_concluidas} venda(s) concluída(s).`,
      canonico: '/vitrine/vendedor/' + pub.loja_slug,
      conteudo: `
      <div class="caixa">
        <h1 style="margin-bottom:4px">${esc(pub.loja_nome)}</h1>
        <p class="meta">${esc(pub.cidade)}${pub.uf ? '/' + esc(pub.uf) : ''} · na Vitrine desde ${esc(String(pub.desde).slice(0, 10))}</p>
        <p style="margin:10px 0">${esc(pub.descricao || '')}</p>
        <p><span class="estrelas">${pub.nota_media ? '★ ' + pub.nota_media : 'Sem avaliações ainda'}</span>
          · ${pub.num_avaliacoes} avaliação(ões) · ${pub.vendas_concluidas} venda(s) concluída(s)
          ${pub.indice_prazo != null ? ` · ${pub.indice_prazo}% das entregas no prazo` : ''}</p>
      </div>
      <h2>Produtos desta loja (${produtos.total})</h2>
      ${grade(produtos.itens)}`,
    }));
  });

  // ---- rastreio público (linha do tempo simulada) ----
  g('/vitrine/rastreio/:codigo', (req, res) => {
    const sh = frete.Envios.porCodigo(req.params.codigo);
    if (!sh) return res.status(404).send(layout({ titulo: 'Rastreio não encontrado', semIndex: true, conteudo: '<h1>Código de rastreio não encontrado</h1>' }));
    const eventos = frete.Envios.eventos(sh.id);
    res.send(layout({
      titulo: 'Rastreamento ' + sh.codigo_rastreio, semIndex: true,
      conteudo: `
      <h1>📦 Rastreamento ${esc(sh.codigo_rastreio)}</h1>
      <div class="aviso">Rastreamento <b>simulado</b> para demonstração — este envio não circula por uma transportadora real.</div>
      <div class="caixa">
        <p class="meta">Previsão de entrega: ${esc(sh.previsao_entrega || '—')}</p>
        ${eventos.slice().reverse().map((e) => `<div class="pergunta"><b>${esc(e.descricao)}</b><br><span class="meta">${esc(e.local)} · ${esc(String(e.quando).replace('T', ' ').slice(0, 16))}</span></div>`).join('')}
      </div>`,
    }));
  });

  // ---- institucionais ----
  const MINUTA = `<div class="aviso minuta"><b>⚠️ MINUTA:</b> este texto é um modelo provisório e ainda precisa de revisão por advogado(a) inscrito(a) na OAB antes do lançamento comercial. Não use como versão final.</div>`;
  const pct = () => Config.num('marketplace_commission_percent', 5);

  g('/vitrine/como-funciona', (req, res) => res.send(layout({
    titulo: 'Como funciona', descricao: 'Entenda como comprar e vender na Vitrine com pagamento protegido.',
    conteudo: `<div class="prosa"><h1>Como a Vitrine funciona</h1>
    <h2>Para quem compra</h2>
    <ol><li>Encontre o produto pela busca, categorias ou filtros — cada anúncio usado traz um bloco obrigatório com o estado real do produto.</li>
    <li>Pague online. O dinheiro fica <b>protegido pela plataforma</b>: o vendedor só recebe depois da entrega e do prazo de devolução.</li>
    <li>Acompanhe o envio com rastreamento e linha do tempo no seu painel.</li>
    <li>Recebeu? Confirme a entrega e avalie o produto e o vendedor. Algo errado? Abra uma solicitação de devolução — nossa equipe media a disputa.</li></ol>
    <h2>Para quem vende</h2>
    <ol><li>Crie sua conta, verifique o e-mail e complete o cadastro de vendedor (nome da loja + CEP de origem).</li>
    <li>Anuncie com fotos, preço, estoque e descrição honesta. Anúncios passam por moderação.</li>
    <li>Venda: prepare o envio, informe o rastreio e acompanhe tudo pelo painel.</li>
    <li>Após a conclusão, o repasse é liberado: valor do produto + frete − comissão de ${pct()}%.</li></ol>
    <h2>Quanto custa</h2>
    <p>Anunciar é grátis. A plataforma cobra <b>${pct()}% de comissão</b> sobre o subtotal dos produtos em cada venda concluída (o frete não entra no cálculo da comissão). A tarifa do processador de pagamento é um custo da plataforma e aparece discriminada — transparência total no extrato de cada pedido.</p>
    </div>`,
  })));

  g('/vitrine/venda-conosco', (req, res) => res.send(layout({
    titulo: 'Venda conosco', descricao: 'Anuncie grátis na Vitrine e pague só ' + pct() + '% por venda concluída.',
    conteudo: `<div class="prosa"><h1>Transforme o que está parado em dinheiro</h1>
    <p>Aquele notebook na gaveta, a bicicleta na garagem, o berço que o bebê não usa mais: tem gente procurando exatamente isso. Na Vitrine você anuncia grátis e só paga quando vende.</p>
    <div class="bloco-seg">
      <div class="item"><h3>0 mensalidade</h3><p>Cadastro e anúncios gratuitos. Sem plano, sem pegadinha.</p></div>
      <div class="item"><h3>${pct()}% por venda</h3><p>Comissão única sobre o valor do produto, cobrada só quando a venda conclui.</p></div>
      <div class="item"><h3>Pix direto</h3><p>Repasse na sua chave Pix após a conclusão do pedido.</p></div>
      <div class="item"><h3>Você no controle</h3><p>Pause, edite e encerre anúncios quando quiser. Responda perguntas e acompanhe sua reputação.</p></div>
    </div>
    <p style="margin-top:22px"><a class="btn acao" href="/vitrine/entrar?voltar=${encodeURIComponent('/vitrine/app#vender')}">Criar minha conta de vendedor</a></p>
    <h2>Regras de ouro</h2>
    <ul><li><b>Descrição honesta</b>: produto usado exige o bloco de sinais de uso e defeitos. Anúncio enganoso é rejeitado e reincidência bloqueia a conta.</li>
    <li><b>Só produtos permitidos</b>: veja a <a href="/vitrine/proibidos">política de produtos proibidos</a>.</li>
    <li><b>Tudo dentro da plataforma</b>: combinar pagamento por fora cancela a proteção e pode suspender a conta.</li></ul>
    </div>`,
  })));

  g('/vitrine/seguranca', (req, res) => res.send(layout({
    titulo: 'Compra segura', descricao: 'Como a Vitrine protege compradores e vendedores.',
    conteudo: `<div class="prosa"><h1>Segurança na Vitrine</h1>
    <ul>
    <li><b>Pagamento protegido:</b> o valor fica retido pela plataforma e só é repassado ao vendedor após a entrega e o prazo de devolução de ${Config.num('janela_devolucao_dias', 7)} dias.</li>
    <li><b>Nunca pague por fora.</b> Nenhum vendedor legítimo pede Pix direto, boleto por WhatsApp ou depósito "para reservar". Se pedir, denuncie.</li>
    <li><b>Não compartilhamos seus dados</b> com outros usuários: vendedor vê apenas o necessário para o envio.</li>
    <li><b>Cartão nunca fica salvo aqui:</b> dados de pagamento são tratados pelo processador — a Vitrine não armazena números de cartão.</li>
    <li><b>Denuncie:</b> todo anúncio tem o botão 🚩. Nossa moderação analisa e pode remover anúncios e bloquear contas.</li>
    <li><b>Conta protegida:</b> verificação de e-mail, limite de tentativas de login e recuperação segura de senha.</li>
    </ul></div>`,
  })));

  g('/vitrine/termos', (req, res) => res.send(layout({
    titulo: 'Termos de uso', semIndex: false,
    conteudo: `<div class="prosa">${MINUTA}<h1>Termos de Uso — Vitrine</h1>
    <p><b>1. A plataforma.</b> A Vitrine é um marketplace operado por Augusto Villela Ltda (CNPJ 56.776.526/0001-12) que aproxima compradores e vendedores de produtos novos e usados. A Vitrine não é dona, fabricante nem depositária dos produtos anunciados.</p>
    <p><b>2. Conta.</b> O cadastro exige dados verdadeiros, e-mail verificado e aceitação destes termos. A conta é pessoal e intransferível.</p>
    <p><b>3. Anúncios.</b> O vendedor é o único responsável pela veracidade do anúncio. Produtos usados exigem descrição do estado real, incluindo defeitos. É proibido anunciar itens da <a href="/vitrine/proibidos">lista de produtos proibidos</a>.</p>
    <p><b>4. Comissão.</b> A plataforma cobra ${pct()}% sobre o subtotal dos produtos por venda concluída, percentual registrado em cada pedido no momento da compra. Alterações valem apenas para vendas futuras.</p>
    <p><b>5. Pagamento e repasse.</b> O pagamento fica retido até a conclusão do pedido (entrega + prazo de devolução). O repasse ao vendedor corresponde a subtotal + frete − comissão.</p>
    <p><b>6. Cancelamento, devolução e disputa.</b> Regras na <a href="/vitrine/devolucao">política de devolução e disputas</a>. A decisão da mediação da plataforma encerra a disputa administrativamente.</p>
    <p><b>7. Condutas vedadas.</b> Negociar fora da plataforma, fraudar avaliações, criar contas falsas ou anunciar produto proibido pode gerar suspensão ou bloqueio.</p>
    <p><b>8. Privacidade.</b> O tratamento de dados pessoais segue a <a href="/vitrine/privacidade">Política de Privacidade</a> e a LGPD (Lei nº 13.709/2018).</p>
    <p><b>9. Foro.</b> Fica eleito o foro de Brasília/DF.</p>
    </div>`,
  })));

  g('/vitrine/privacidade', (req, res) => res.send(layout({
    titulo: 'Política de privacidade',
    conteudo: `<div class="prosa">${MINUTA}<h1>Política de Privacidade — Vitrine</h1>
    <p><b>Controladora:</b> Augusto Villela Ltda, CNPJ 56.776.526/0001-12.</p>
    <p><b>O que coletamos:</b> dados de cadastro (nome, e-mail, telefone), endereços de entrega, anúncios e transações, registros de acesso. <b>Não armazenamos dados de cartão</b> — pagamentos são processados por provedor especializado.</p>
    <p><b>Para que usamos:</b> operar as compras e vendas (execução de contrato), segurança e prevenção a fraude (legítimo interesse), obrigações legais e fiscais.</p>
    <p><b>Com quem compartilhamos:</b> com o vendedor/comprador da transação (apenas o necessário para entrega), com o processador de pagamentos e com autoridades quando exigido por lei. Nunca vendemos dados.</p>
    <p><b>Seus direitos (LGPD):</b> acesso, correção, portabilidade (baixe seus dados no painel), e exclusão da conta com anonimização — o histórico financeiro é preservado por obrigação legal.</p>
    <p><b>Contato do encarregado:</b> definir antes do lançamento.</p>
    </div>`,
  })));

  g('/vitrine/proibidos', (req, res) => res.send(layout({
    titulo: 'Produtos proibidos',
    conteudo: `<div class="prosa">${MINUTA}<h1>Política de Produtos Proibidos</h1>
    <p>É vedado anunciar na Vitrine, entre outros:</p>
    <ul><li>Armas de fogo, munições, explosivos e simulacros;</li>
    <li>Drogas, medicamentos controlados e produtos de tabaco/vape;</li>
    <li>Produtos falsificados, réplicas ou que violem propriedade intelectual;</li>
    <li>Animais vivos e produtos de fauna/flora protegidas;</li>
    <li>Produtos roubados, de origem ilícita ou sem nota quando exigida por lei;</li>
    <li>Documentos, dados pessoais e contas de serviços;</li>
    <li>Alimentos perecíveis sem registro sanitário e cosméticos vencidos;</li>
    <li>Recall ativo sem o conserto do fabricante;</li>
    <li>Serviços financeiros, apostas e criptoativos.</li></ul>
    <p>Anúncio proibido é removido e a conta pode ser bloqueada. Denúncias pelo botão 🚩 em qualquer anúncio.</p></div>`,
  })));

  g('/vitrine/devolucao', (req, res) => res.send(layout({
    titulo: 'Devolução e disputas',
    conteudo: `<div class="prosa">${MINUTA}<h1>Política de Devolução e Disputas</h1>
    <p><b>Prazo:</b> o comprador pode solicitar devolução em até ${Config.num('janela_devolucao_dias', 7)} dias corridos após a entrega (art. 49 do CDC para compras a distância), ou a qualquer momento dentro do prazo se o produto chegar diferente do anunciado.</p>
    <p><b>Fluxo:</b> 1) o comprador abre a solicitação no painel com o motivo; 2) o vendedor pode aceitar (reembolso integral automático) ou contestar; 3) contestada, a disputa vai para a mediação da plataforma, que decide por reembolso total, parcial ou liberação do valor ao vendedor.</p>
    <p><b>Proteção:</b> enquanto houver disputa aberta, o repasse ao vendedor fica congelado.</p>
    <p><b>Cancelamento:</b> pedidos ainda não enviados podem ser cancelados por qualquer parte com reembolso integral.</p></div>`,
  })));

  // ---- entrar / criar conta ----
  g('/vitrine/entrar', (req, res) => {
    const voltar = s(req.query.voltar, 200);
    res.send(layout({
      titulo: 'Entrar ou criar conta', semIndex: true,
      conteudo: `
      <div class="form-auth">
        <h1 style="font-size:1.3rem">Entrar na Vitrine</h1>
        <div id="aba-login">
          <label for="l-email">E-mail</label><input id="l-email" type="email" autocomplete="email">
          <label for="l-senha">Senha</label><input id="l-senha" type="password" autocomplete="current-password">
          <button class="btn acao" style="width:100%;margin-top:16px" onclick="vtLogin()">Entrar</button>
          <p class="erro" id="l-erro" role="alert"></p>
          <p style="margin-top:12px;font-size:.9rem"><a href="#" onclick="vtEsqueci();return false">Esqueci minha senha</a> · <a href="#" onclick="vtAba('cad');return false">Criar conta grátis</a></p>
        </div>
        <div id="aba-cad" hidden>
          <label for="c-nome">Nome completo</label><input id="c-nome" autocomplete="name">
          <label for="c-email">E-mail</label><input id="c-email" type="email" autocomplete="email">
          <label for="c-senha">Senha (8+ caracteres)</label><input id="c-senha" type="password" autocomplete="new-password">
          <label style="font-weight:400;margin-top:14px"><input type="checkbox" id="c-termos" style="width:auto"> Li e aceito os <a href="/vitrine/termos" target="_blank">termos de uso</a> e a <a href="/vitrine/privacidade" target="_blank">política de privacidade</a>.</label>
          <button class="btn acao" style="width:100%;margin-top:16px" onclick="vtCadastrar()">Criar conta</button>
          <p class="erro" id="c-erro" role="alert"></p>
          <p style="margin-top:12px;font-size:.9rem"><a href="#" onclick="vtAba('login');return false">Já tenho conta</a></p>
        </div>
        <div id="aba-def" hidden>
          <label for="d-senha">Nova senha (8+ caracteres)</label><input id="d-senha" type="password" autocomplete="new-password">
          <button class="btn acao" style="width:100%;margin-top:16px" onclick="vtDefinir()">Salvar nova senha</button>
          <p class="erro" id="d-erro" role="alert"></p>
        </div>
      </div>
      <script>
      const VOLTAR = ${JSON.stringify(voltar || '/vitrine/app')};
      const TOKEN_DEF = new URLSearchParams(location.search).get('definir') || '';
      function vtAba(a){ for (const x of ['login','cad','def']) document.getElementById('aba-'+x).hidden = x !== a; }
      if (TOKEN_DEF) vtAba('def');
      async function post(caminho, corpo, erroEl) {
        document.getElementById(erroEl).textContent = '';
        const r = await fetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const j = await r.json();
        if (!r.ok) { document.getElementById(erroEl).textContent = j.erro || 'Erro.'; throw new Error('x'); }
        return j;
      }
      async function vtLogin(){ try { await post('/vitrine/api/login', { email: document.getElementById('l-email').value, senha: document.getElementById('l-senha').value }, 'l-erro'); location.href = VOLTAR; } catch(_){} }
      async function vtCadastrar(){
        try {
          const j = await post('/vitrine/api/cadastrar', { nome: document.getElementById('c-nome').value, email: document.getElementById('c-email').value, senha: document.getElementById('c-senha').value, aceite_termos: document.getElementById('c-termos').checked, origem: 'site' }, 'c-erro');
          if (j.link_verificacao) alert('MODO DEMONSTRAÇÃO — link de verificação do e-mail:\\n' + j.link_verificacao);
          location.href = VOLTAR;
        } catch(_){}
      }
      async function vtEsqueci(){
        const email = document.getElementById('l-email').value || prompt('Qual o e-mail da sua conta?');
        if (!email) return;
        const j = await post('/vitrine/api/esqueci-senha', { email }, 'l-erro');
        alert(j.link ? 'MODO DEMONSTRAÇÃO — link de redefinição:\\n' + j.link : 'Se o e-mail existir, enviamos o link de redefinição.');
      }
      async function vtDefinir(){ try { await post('/vitrine/api/definir-senha', { token: TOKEN_DEF, senha: document.getElementById('d-senha').value }, 'd-erro'); location.href = VOLTAR; } catch(_){} }
      </script>`,
    }));
  });

  // ---- casca do painel (SPA) ----
  g('/vitrine/app', (req, res) => {
    res.send(layout({
      titulo: 'Meu painel', semIndex: true,
      conteudo: `<div id="vt-app"><p class="vazio">Carregando seu painel…</p></div><script src="/vitrine/app.js?v=${APP_V}"></script>`,
    }));
  });
  const APP_JS = path.join(__dirname, 'app-cliente.js');
  let APP_V = '1';
  try { APP_V = String(Math.trunc(fs.statSync(APP_JS).mtimeMs)); } catch (_) {}
  app.get('/vitrine/app.js', (req, res) => {
    // ?v=<mtime> + cache imutável: lição do Closet — sem isso o navegador serve painel velho pós-deploy
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.send(fs.readFileSync(APP_JS, 'utf8'));
  });

  // ---- imagens placeholder (demonstração honesta: geradas localmente) ----
  app.get('/vitrine/placeholder/:seed.svg', (req, res) => {
    const seed = s(req.params.seed, 60) || 'produto';
    const hash = crypto.createHash('sha1').update(seed).digest();
    const h = hash[0] % 360;
    const rotulo = decodeURIComponent(seed).replace(/-/g, ' ').slice(0, 26);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${esc(rotulo)}">
<rect width="400" height="400" fill="hsl(${h},38%,88%)"/>
<rect x="70" y="90" width="260" height="180" rx="18" fill="hsl(${h},42%,72%)"/>
<circle cx="130" cy="150" r="26" fill="hsl(${h},45%,90%)"/>
<path d="M90 250 L170 180 L230 235 L285 190 L330 250 Z" fill="hsl(${h},40%,58%)"/>
<text x="200" y="330" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="22" fill="hsl(${h},30%,30%)">${esc(rotulo)}</text>
<text x="200" y="358" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="13" fill="hsl(${h},20%,45%)">imagem de demonstração</text>
</svg>`);
  });

  // ---- SEO ----
  app.get('/vitrine/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /vitrine/app\nDisallow: /vitrine/api\nDisallow: /vitrine/entrar\nDisallow: /vitrine/rastreio\nSitemap: https://vitrine.villelastay.com.br/vitrine/sitemap.xml\n');
  });
  app.get('/vitrine/sitemap.xml', (req, res) => {
    const base = 'https://vitrine.villelastay.com.br';
    const urls = ['/vitrine', '/vitrine/busca', '/vitrine/como-funciona', '/vitrine/venda-conosco', '/vitrine/seguranca',
      ...Categorias.listar().map((c) => '/vitrine/c/' + c.slug),
      ...require('./db').db.prepare("SELECT slug FROM products WHERE status = 'ativo' AND excluido = 0 LIMIT 2000").all().map((p) => '/vitrine/p/' + p.slug)];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('\n')}\n</urlset>`);
  });
}

module.exports = { registrarPaginas, layout, esc, brl };
