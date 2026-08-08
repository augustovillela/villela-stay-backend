// =====================================================================
// ORIGENA — páginas públicas server-rendered, sem build.
//
// FASE 0: só a porta de entrada, para o produto EXISTIR no ar (rota
// medida pelo analytics, deploy verificável, subdomínio apontado).
// A landing de verdade e o app da família entram na Fase 1.
//
// IDENTIDADE PROVISÓRIA, DE PROPÓSITO: a marca da Origena depende do
// brand book do grupo, ainda em preparação (memória
// `brand-book-em-preparacao`), e da busca INPI. Até lá isto é um
// esqueleto sóbrio — nada aqui deve ser tratado como decisão de marca.
// =====================================================================
'use strict';

const CSS = `
:root{--fundo:#FBF9F6;--tinta:#1C1A17;--suave:#6B655C;--card:#fff;--borda:#E8E2D9;
--tema:#7A5C3E;--raio:18px}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);
font:16px/1.65 Inter,system-ui,'Segoe UI',Roboto,sans-serif}
h1,h2{font-family:Lora,Georgia,'Times New Roman',serif;font-weight:600;letter-spacing:-.01em}
.wrap{max-width:820px;margin:0 auto;padding:0 22px}
.hero{padding:72px 0 44px;text-align:center}
.hero h1{font-size:clamp(34px,6vw,54px);margin:0 0 10px}
.assinatura{color:var(--suave);font-size:18px;margin:0 0 30px}
.selo{display:inline-block;background:#FDF3D7;border:1px solid #EBD9A6;color:#7A5B12;
border-radius:999px;padding:6px 15px;font-weight:600;font-size:14px;margin-bottom:22px}
.card{background:var(--card);border:1px solid var(--borda);border-radius:var(--raio);
padding:26px;margin:18px 0;text-align:left}
.card h2{font-size:20px;margin:0 0 10px}
.card p{margin:0 0 10px;color:var(--suave)}
.card p:last-child{margin-bottom:0}
footer{color:var(--suave);font-size:14px;text-align:center;padding:34px 0 50px}
@media(prefers-color-scheme:dark){
:root{--fundo:#17150F;--tinta:#F2EDE4;--suave:#A69E90;--card:#221E17;--borda:#332C22;--tema:#C9A87C}
.selo{background:#332A12;border-color:#5A4A20;color:#E8D08A}}
`;

const pagina = (titulo, corpo) => `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${titulo}</title>
<style>${CSS}</style>
</head><body>${corpo}</body></html>`;

function registrarPaginas(app) {
  app.get('/origena', (req, res) => {
    res.type('html').send(pagina('Origena — Suas origens. Suas histórias. Seu legado.', `
<div class="wrap">
  <div class="hero">
    <div class="selo">Em construção · beta fechado</div>
    <h1>Origena</h1>
    <p class="assinatura">Suas origens. Suas histórias. Seu legado.</p>
  </div>
  <div class="card">
    <h2>Um sistema para a memória da sua família</h2>
    <p>Fotografias, documentos, cartas, receitas, gravações e histórias contadas em casa —
       guardados juntos, com <strong>quem contou, quando e de onde veio</strong>.</p>
    <p>A Origena preserva a origem de cada informação. Quando duas pessoas lembram de formas
       diferentes, as duas versões continuam ali.</p>
  </div>
  <div class="card">
    <h2>Ainda não estamos abertos</h2>
    <p>A plataforma está em desenvolvimento e roda hoje em beta fechado, com uma família só.</p>
  </div>
  <footer>Um produto do Grupo Villela Stay.</footer>
</div>`));
  });

  // `noindex` global até o memorial público existir e ser autorizado (§120).
  app.get('/origena/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /origena\n');
  });
}

module.exports = { registrarPaginas, pagina, CSS };
