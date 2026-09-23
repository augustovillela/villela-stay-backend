// =====================================================================
// CSS da landing /tudo.html — "Produtos da Villela Stay"
// =====================================================================
// A página é a vitrine conjunta dos três acervos do grupo: os livros da
// Livraria, os cursos da Academy e os sistemas do /sistemas.html. Serve
// para campanha única, quando faz sentido divulgar tudo de uma vez.
//
// Injetado inline no <head>, como o CSS da /sistemas.html, e pelo mesmo
// motivo: é o único lugar que usa este CSS, inline evita requisição no
// caminho do LCP e não há cache-busting para errar. A página também
// carrega o SISTEMAS_CSS, porque reaproveita as maquetes animadas (.mq)
// e a tira de abas da demonstração — prefixos `sx-` e `mq-` vêm de lá.
//
// Prefixo daqui: `tx-` (de "tudo").
//
// ---------------------------------------------------------------------
// A ESTEIRA (a "fábrica" do topo) — decisão do Augusto, 23/09/2026
// ---------------------------------------------------------------------
// Três linhas que andam sozinhas, uma por acervo: livros em cima, cursos
// no meio, sistemas embaixo. O laço é contínuo — nada some nem pisca no
// fim: a fita é duplicada e desliza -100% da PRÓPRIA largura, de modo que
// a cópia entra no quadro exatamente quando a primeira sai. Por isso a
// duração é proporcional ao número de cartões (`--dur`), senão uma linha
// com 13 capas correria três vezes mais rápido que a de 3 cursos.
//
// A cópia leva `aria-hidden` e `tabindex="-1"`: para o leitor de tela e
// para o teclado existe uma lista só, e ela está inteira nas seções
// abaixo. Passar o mouse (ou dar foco) pausa a linha — quem parou para
// olhar não deve ver o cartão fugir.
// =====================================================================
'use strict';

module.exports = `
.tx { --tx-navy:#1B2A4A; --tx-navy-2:#142138; --tx-tinta:#1F2933; --tx-tinta-2:#4A5560;
  --tx-borda:#E2E6EC; --tx-gelo:#F4F6F9; --tx-ouro:var(--cerrado); }
.tx-wrap { max-width:1180px; margin:0 auto; padding:0 5vw; }
.tx-sec { padding:64px 0; }
.tx-sec.alt { background:var(--tx-gelo); }
.tx-sec.escura { background:var(--tx-navy); color:#E7EDF6; }
.tx-sec.escura h2 { color:#fff; }
.tx-chapeu { font-size:.82rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
  color:var(--lago); margin:0 0 10px; }
.tx-sec.escura .tx-chapeu { color:var(--tx-ouro); }
.tx-sec h2 { font-size:clamp(1.5rem,3vw,2.2rem); line-height:1.18; margin:0 0 12px; }
.tx-sub { max-width:62ch; color:var(--tx-tinta-2); margin:0 0 26px; }
.tx-sec.escura .tx-sub { color:#BFCCE0; }

/* ------------------------------- topo -------------------------------- */
.tx-hero { background:linear-gradient(150deg,#142138 0%,#1B2A4A 46%,#24365C 100%);
  color:#EEF2F8; padding:56px 0 0; position:relative; overflow:hidden; }
.tx-hero::after { content:''; position:absolute; inset:auto -10% 30% 45%; height:380px;
  background:radial-gradient(closest-side,rgba(201,162,39,.20),transparent 70%); pointer-events:none; }
.tx-hero .tx-wrap { position:relative; z-index:1; }
.tx-selo { display:inline-block; background:rgba(201,162,39,.16); color:var(--tx-ouro);
  border:1px solid rgba(201,162,39,.42); border-radius:999px; padding:6px 16px;
  font-size:.82rem; font-weight:700; letter-spacing:.04em; }
.tx-hero h1 { font-size:clamp(2rem,4.6vw,3.3rem); line-height:1.08; margin:18px 0 0; color:#fff; max-width:20ch; }
.tx-hero h1 em { font-style:normal; color:var(--tx-ouro); }
.tx-lead { font-size:clamp(1.02rem,1.6vw,1.2rem); max-width:60ch; margin:18px 0 0; color:#C9D3E4; }
.tx-ctas { display:flex; flex-wrap:wrap; gap:12px; margin:28px 0 0; }
.tx-btn { display:inline-block; border-radius:999px; padding:13px 28px; font-weight:700;
  border:2px solid transparent; text-align:center; }
.tx-btn-ouro { background:var(--tx-ouro); color:#1B2A4A; }
.tx-btn-ouro:hover { background:#B08E1E; }
.tx-btn-fantasma { border-color:rgba(255,255,255,.55); color:#fff; }
.tx-btn-fantasma:hover { background:rgba(255,255,255,.12); }
.tx-btn-lago { background:var(--lago); color:#fff; }
.tx-btn-lago:hover { background:var(--lago-escuro); }
.tx-btn-linha { border-color:var(--tx-borda); color:var(--tx-tinta); background:#fff; }
.tx-btn-linha:hover { border-color:var(--lago); color:var(--lago); }
.tx-numeros { display:flex; flex-wrap:wrap; gap:26px 40px; margin:30px 0 0; }
.tx-numeros div { min-width:96px; }
.tx-numeros b { display:block; font-family:'Lora',Georgia,serif; font-size:2rem; color:var(--tx-ouro); line-height:1; }
.tx-numeros span { font-size:.88rem; color:#BFCCE0; }

/* ----------------------------- a fábrica ----------------------------- */
.tx-fabrica { margin-top:38px; padding-bottom:30px; }
.tx-linha + .tx-linha { margin-top:18px; }
.tx-linha-topo { display:flex; align-items:baseline; gap:8px 14px; flex-wrap:wrap;
  padding:0 5vw; margin:0 auto 9px; max-width:1180px; }
.tx-linha-rotulo { font-weight:700; font-size:.94rem; color:#fff; }
.tx-linha-rotulo b { color:var(--tx-ouro); }
.tx-linha-end { font-size:.85rem; color:#C9D3E4; border-bottom:1px dashed rgba(255,255,255,.45); }
.tx-linha-end:hover { color:#fff; border-bottom-style:solid; }
.tx-linha-end::before { content:'↗ '; }

.tx-trilho { display:flex; overflow:hidden; -webkit-mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent); }
.tx-fita { display:flex; gap:14px; padding-right:14px; flex:0 0 auto;
  animation:tx-correr var(--dur,60s) linear infinite; will-change:transform; }
.tx-linha[data-sentido="esq"] .tx-fita { animation-direction:reverse; }
@keyframes tx-correr { from { transform:translateX(0); } to { transform:translateX(-100%); } }
.tx-trilho:hover .tx-fita, .tx-trilho:focus-within .tx-fita { animation-play-state:paused; }

/* cartão da esteira: capa + faixa que entrega um pedaço do conteúdo */
.tx-item { position:relative; flex:0 0 auto; border-radius:12px; overflow:hidden;
  background:#0F1A2E; border:1px solid rgba(255,255,255,.10); color:#fff;
  transition:transform .25s ease, border-color .25s ease; }
.tx-item:hover, .tx-item:focus-visible { transform:translateY(-6px); border-color:rgba(201,162,39,.6); }
.tx-item img { width:100%; height:100%; object-fit:cover; }
.tx-item-livro { width:132px; aspect-ratio:2/3; }
.tx-item-curso { width:252px; aspect-ratio:16/9; }
.tx-faixa { position:absolute; left:0; right:0; bottom:0; padding:22px 10px 8px;
  background:linear-gradient(transparent,rgba(9,16,29,.92) 42%); }
.tx-faixa b { display:block; font-size:.78rem; line-height:1.25; font-weight:700;
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.tx-faixa span { display:block; font-size:.72rem; color:var(--tx-ouro); margin-top:2px; }
.tx-item-curso .tx-faixa b { font-size:.86rem; }

/* linha dos sistemas: não há capa — o cartão é o próprio símbolo da marca */
.tx-item-sis { width:228px; padding:14px 16px; display:flex; gap:12px; align-items:center;
  background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.14); }
.tx-item-sis img { width:34px; height:34px; flex:0 0 34px; object-fit:contain; }
.tx-item-sis b { display:block; font-size:.9rem; line-height:1.2; }
.tx-item-sis span { display:block; font-size:.74rem; color:#BFCCE0; margin-top:2px; }
.tx-item-sis i { width:7px; height:7px; border-radius:50%; background:var(--acento,#C9A227);
  flex:0 0 7px; animation:tx-pisca 2.6s ease-in-out infinite; }
@keyframes tx-pisca { 0%,100% { opacity:.35; } 50% { opacity:1; } }

@media (prefers-reduced-motion: reduce) {
  .tx-fita { animation:none; }
  .tx-item-sis i { animation:none; opacity:.9; }
  .tx-trilho { overflow-x:auto; -webkit-mask-image:none; mask-image:none; }
}

/* ------------------------------ livros ------------------------------- */
.tx-cat + .tx-cat { margin-top:34px; }
.tx-cat h3 { font-size:1.12rem; margin:0 0 14px; display:flex; align-items:baseline; gap:10px; }
.tx-cat h3 span { font-size:.8rem; font-weight:600; color:var(--tx-tinta-2);
  font-family:'Inter',sans-serif; }
.tx-grade-livros { display:grid; gap:18px;
  grid-template-columns:repeat(auto-fill,minmax(168px,1fr)); }
.tx-livro { display:flex; flex-direction:column; background:#fff; border:1px solid var(--tx-borda);
  border-radius:14px; overflow:hidden; transition:transform .2s ease, box-shadow .2s ease; }
.tx-livro:hover { transform:translateY(-4px); box-shadow:0 12px 28px rgba(27,42,74,.14); }
.tx-livro-capa { background:var(--tx-gelo); aspect-ratio:2/3; }
.tx-livro-corpo { padding:12px 13px 14px; display:flex; flex-direction:column; gap:5px; flex:1; }
.tx-livro-corpo b { font-size:.95rem; line-height:1.24; }
.tx-livro-corpo p { font-size:.8rem; color:var(--tx-tinta-2); line-height:1.35; margin:0;
  overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
.tx-preco { margin-top:auto; font-size:.86rem; font-weight:700; color:var(--lago); }
.tx-preco small { display:block; font-weight:500; font-size:.72rem; color:var(--tx-tinta-2); }

/* ------------------------------ cursos ------------------------------- */
.tx-grade-cursos { display:grid; gap:22px; grid-template-columns:repeat(auto-fit,minmax(288px,1fr)); }
.tx-curso { display:flex; flex-direction:column; background:#fff; border:1px solid var(--tx-borda);
  border-radius:16px; overflow:hidden; transition:transform .2s ease, box-shadow .2s ease; }
.tx-curso:hover { transform:translateY(-4px); box-shadow:0 14px 32px rgba(27,42,74,.16); }
.tx-curso-capa { aspect-ratio:16/9; background:var(--tx-navy); }
.tx-curso-corpo { padding:18px 20px 20px; display:flex; flex-direction:column; gap:9px; flex:1; }
.tx-curso-corpo b { font-size:1.08rem; line-height:1.24; }
.tx-curso-corpo p { font-size:.88rem; color:var(--tx-tinta-2); margin:0; }
.tx-curso-pe { display:flex; align-items:center; justify-content:space-between; gap:12px;
  margin-top:auto; padding-top:6px; }
.tx-curso-pe .tx-preco { margin:0; font-size:1.05rem; }

/* ----------------------------- sistemas ------------------------------ */
.tx-grade-sis { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(252px,1fr)); }
.tx-sis { display:flex; gap:13px; align-items:flex-start; background:#fff;
  border:1px solid var(--tx-borda); border-left:4px solid var(--acento,#1B2A4A);
  border-radius:12px; padding:15px 17px; transition:transform .2s ease, box-shadow .2s ease; }
.tx-sis:hover { transform:translateY(-3px); box-shadow:0 12px 26px rgba(27,42,74,.13); }
.tx-sis img { width:36px; height:36px; flex:0 0 36px; object-fit:contain; }
.tx-sis b { display:block; font-size:.98rem; line-height:1.2; }
.tx-sis span { display:block; font-size:.79rem; color:var(--tx-tinta-2); margin-top:3px; }
.tx-sis-preco { display:inline-block; margin-top:7px; font-size:.78rem; font-weight:700;
  color:var(--lago); }
.tx-sis-estado { display:inline-block; margin-top:7px; font-size:.72rem; font-weight:700;
  background:#FDF6E3; color:#8A5A00; border-radius:999px; padding:3px 10px; }

/* ------------------------------- fecho ------------------------------- */
.tx-portas { display:grid; gap:18px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); margin-top:26px; }
.tx-porta { background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.16);
  border-radius:16px; padding:22px 22px 24px; display:flex; flex-direction:column; gap:10px; }
.tx-porta b { font-size:1.06rem; color:#fff; }
.tx-porta p { font-size:.9rem; color:#C3D0E3; margin:0; flex:1; }
.tx-porta .tx-btn { margin-top:6px; }
.tx-nota { font-size:.82rem; color:#9FB0C9; margin-top:24px; }
.tx-sec.escura .tx-nota a { color:var(--tx-ouro); border-bottom:1px dashed rgba(201,162,39,.5); }

@media (max-width:760px) {
  .tx-sec { padding:48px 0; }
  .tx-item-curso { width:212px; }
  .tx-item-sis { width:200px; }
  .tx-numeros { gap:18px 26px; }
  .tx-numeros b { font-size:1.6rem; }
}
`;
