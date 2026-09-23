// =====================================================================
// gerar-og-produtos.js — o cartão social (1200×630) da /tudo.html
// =====================================================================
// A /tudo.html existe para ser COMPARTILHADA: é o link único das campanhas
// conjuntas. O que a pessoa vê no WhatsApp e no Instagram antes de clicar é
// o og:image — então ele precisa ser um cartão, com promessa legível em
// miniatura, e não uma prancha de manual de marca.
//
// (Foi o que se descobriu ao montar a página: o `grupo-villela/og-image.png`
// referenciado pela /sistemas.html é uma prancha do brand book, em espanhol,
// e nem sequer é servida pelo site estático — dava 404 em produção.)
//
// O cartão é HTML renderizado pelo Chrome, como os slides dos cursos: texto
// vetorial nítido, números vindos do catálogo (nunca digitados à mão) e capas
// de verdade — as mesmas miniaturas locais que a página usa.
//
// Rodar depois de atualizar o catálogo:
//   node tools/gerar-og-produtos.js
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('./node_modules/puppeteer-core');

const RAIZ = path.join(__dirname, '..');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].find(p => fs.existsSync(p));
const SAIDA = path.join(RAIZ, 'src', 'og-produtos.jpg');
const L = 1200, A = 630;

const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'catalogo.json'), 'utf8'));
const { SISTEMAS, EM_DESENVOLVIMENTO } = require('../content/sistemas');
const nSis = SISTEMAS.length + EM_DESENVOLVIMENTO.length;

// Embutida em base64: o Chrome recusa subrecurso file:// dentro de um documento
// carregado por setContent, e as capas entravam como moldura vazia.
const arquivo = p => 'data:image/webp;base64,' + fs.readFileSync(p).toString('base64');
// Quatro capas em leque: as que o leitor reconhece primeiro (as de IA) e uma de fora
// do tema, para o cartão não parecer de um assunto só.
const escolhidas = ['claude-ai-na-pratica', 'chatgpt-ai-na-pratica', 'o-homem-essencial', 'o-locador-inteligente']
  .map(slug => path.join(RAIZ, 'src', 'capas', `livro-${slug}.webp`))
  .filter(p => fs.existsSync(p));

const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Inter:wght@400;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${L}px;height:${A}px;overflow:hidden}
  body{background:linear-gradient(140deg,#0F1A2E 0%,#1B2A4A 48%,#27395F 100%);
       color:#fff;font-family:Inter,Helvetica,sans-serif;position:relative;display:flex}
  .brilho{position:absolute;right:-8%;top:-30%;width:620px;height:620px;border-radius:50%;
          background:radial-gradient(closest-side,rgba(201,162,39,.30),transparent 72%)}
  .texto{position:relative;z-index:2;padding:62px 0 56px 68px;width:660px;display:flex;
         flex-direction:column;justify-content:center}
  .selo{display:inline-block;align-self:flex-start;border:1px solid rgba(201,162,39,.55);
        color:#C9A227;border-radius:999px;padding:7px 18px;font-size:17px;font-weight:700;
        letter-spacing:.04em}
  h1{font-family:Lora,Georgia,serif;font-size:66px;line-height:1.05;margin:26px 0 0;letter-spacing:-.5px}
  h1 em{font-style:normal;color:#C9A227}
  p{font-size:23px;line-height:1.4;color:#C9D3E4;margin:20px 0 0;max-width:19em}
  .nums{display:flex;gap:34px;margin-top:34px}
  .nums div b{display:block;font-family:Lora,Georgia,serif;font-size:40px;color:#C9A227;line-height:1}
  .nums div span{font-size:15px;color:#AFC0D8}
  .end{margin-top:34px;font-size:19px;font-weight:600;color:#fff;opacity:.92}
  .capas{position:absolute;right:52px;top:0;height:100%;width:490px;z-index:2;
         display:flex;align-items:center;justify-content:center}
  .capas img{position:absolute;width:196px;border-radius:10px;
             box-shadow:0 26px 54px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12)}
  .capas img:nth-child(1){transform:translate(-156px,-28px) rotate(-10deg)}
  .capas img:nth-child(2){transform:translate(-53px,18px) rotate(-3deg)}
  .capas img:nth-child(3){transform:translate(53px,-12px) rotate(4deg)}
  .capas img:nth-child(4){transform:translate(156px,26px) rotate(11deg)}
</style>
<div class="brilho"></div>
<div class="texto">
  <span class="selo">Grupo Villela Stay · Brasília-DF</span>
  <h1>Produtos da<br><em>Villela Stay</em></h1>
  <p>Livros, cursos em vídeo e sistemas de gestão — tudo em uma página.</p>
  <div class="nums">
    <div><b>${catalogo.livros.length}</b><span>livros</span></div>
    <div><b>${catalogo.cursos.length}</b><span>cursos</span></div>
    <div><b>${nSis}</b><span>sistemas</span></div>
  </div>
  <div class="end">villelastay.com.br/tudo.html</div>
</div>
<div class="capas">${escolhidas.map(p => `<img src="${arquivo(p)}" alt="">`).join('')}</div>
</html>`;

(async () => {
  if (!CHROME) throw new Error('Chrome não encontrado');
  if (escolhidas.length < 4) console.warn(`! só ${escolhidas.length} capa(s) encontrada(s) — rode tools/preparar-capas.py`);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: L, height: A, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  // O texto do cartão é lido em miniatura: se transbordar, ele mente sobre o que
  // a página oferece. Melhor falhar aqui que publicar um cartão cortado.
  // Medir o BODY não serve: as capas são decoração posicionada de propósito para
  // sangrar fora do quadro, e o scrollHeight as conta. O que precisa caber é a
  // coluna de texto — e ela não pode invadir a área das capas.
  const medida = await page.evaluate(() => {
    const t = document.querySelector('.texto');
    const c = document.querySelector('.capas');
    const r = t.getBoundingClientRect();
    return { alturaTexto: t.scrollHeight, caixaTexto: Math.round(r.height),
      direitaTexto: Math.round(r.right), esquerdaCapas: Math.round(c.getBoundingClientRect().left) };
  });
  // Capa que não carrega vira moldura vazia — e o cartão publicado fica com
  // quatro riscos no lugar dos livros. 200 OK não prova que a imagem apareceu.
  const quebradas = await page.evaluate(() =>
    [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length);
  const problemas = [];
  if (quebradas) problemas.push(`${quebradas} capa(s) não carregaram`);
  if (medida.alturaTexto > medida.caixaTexto + 2) problemas.push(`o texto tem ${medida.alturaTexto}px em ${medida.caixaTexto}px`);
  if (medida.direitaTexto > medida.esquerdaCapas + 2) problemas.push('o texto invade a área das capas');
  if (problemas.length) throw new Error('cartão não fecha: ' + problemas.join('; '));
  await page.screenshot({ path: SAIDA, type: 'jpeg', quality: 88 });
  await browser.close();
  console.log(`${path.relative(process.cwd(), SAIDA)} · ${Math.round(fs.statSync(SAIDA).size / 1024)} KB`);
})();
