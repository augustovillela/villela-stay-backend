'use strict';
// Curso nativo de Violão (Coleção Musique, vol. 2). Conteúdo gerado do livro novo por
// dados\music\colecao\gerar_curso_instrumento.py (capítulos com figuras já em SVG).
const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, 'curso-violao-conteudo.json');
const PDF = path.join(__dirname, '..', '..', 'output', 'pdf', 'livro-violao-colecao.pdf');
const DOC = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
const CAPS = DOC.capitulos;
const partes = [];
CAPS.forEach((c) => {
  let p = partes.find((x) => x.nome === c.parte);
  if (!p) { p = { nome: c.parte, capitulos: [] }; partes.push(p); }
  p.capitulos.push(c.numero);
});

const CSS = `<style>
.cv-corpo{max-width:46rem;margin:0 auto;line-height:1.62}
.cv-corpo h2{margin:1.8em 0 .5em;font-size:1.35rem}.cv-corpo h3{margin:1.4em 0 .4em}
.cv-corpo table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.92rem;display:block;overflow-x:auto}
.cv-corpo th{background:#1B2A4A;color:#fff;text-align:left;padding:.4em .6em}.cv-corpo td{border-bottom:1px solid #d8deea;padding:.4em .6em;vertical-align:top}
.cv-corpo figure{margin:1.2em 0;text-align:center}.cv-corpo figure svg,.cv-corpo figure img{max-width:100%;height:auto}
.cv-corpo figcaption{font-size:.85rem;color:#5b6783;margin-top:.4em}
.cv-corpo .admonition{border-left:4px solid #C9A227;background:#f7f4e8;padding:.7em 1em;margin:1.2em 0;border-radius:4px}
.cv-corpo .admonition-title{font-weight:700;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;margin:0 0 .3em}
.cv-corpo .admonition.atencao{border-color:#b54a3a;background:#fbf0ee}.cv-corpo .admonition.ouca{border-color:#4a8a5a;background:#edf6ef}
.cv-corpo .admonition.pratica{border-color:#2f6db5;background:#eaf1fa}.cv-corpo .admonition.sintese{border-color:#1B2A4A;background:#eef0f6}
.cv-corpo .admonition.exercicio{border-color:#1B2A4A;background:#fff}
.cv-corpo svg{max-width:100%}
.cv-ferr{display:grid;gap:.7rem;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));margin:1rem 0}
.cv-ferr a{display:block;border:1px solid #cfd6e6;border-left:4px solid #C9A227;border-radius:6px;padding:.7rem .9rem;text-decoration:none;color:inherit}
.cv-ferr a strong{display:block}.cv-ferr a span{font-size:.88rem;opacity:.8}
.cv-nav{display:flex;justify-content:space-between;gap:1rem;margin:2rem 0;flex-wrap:wrap}
.cv-obj{background:#1B2A4A;color:#fff;border-radius:8px;padding:1rem 1.2rem;margin:1.2rem 0}.cv-obj b{color:#C9A227;font-size:.8rem;letter-spacing:.12em}
.cv-obj li{margin:.3rem 0}.cv-epi{font-style:italic;opacity:.85}
</style>`;

function registrar(app, { opcional, pagina, esc }) {
  const base = '/music/curso-violao';
  const resumoPartes = () => partes.map((p) => `<section class="curso-nivel"><div class="curso-nivel-cab"><div><h2>${esc(p.nome)}</h2></div><span>${p.capitulos.length} capítulos</span></div><ol class="cv-lista">${p.capitulos.map((n) => { const c = CAPS[n - 1]; return `<li><a data-curso-slug="${esc(c.slug)}" href="${base}/${esc(c.slug)}">${c.numero}. ${esc(c.titulo)}</a><br><small>${esc(c.resumo)}</small></li>`; }).join('')}</ol></section>`).join('');

  app.get(`${base}.json`, opcional, (req, res) => {
    res.type('application/json').set('Cache-Control', 'no-cache').send(JSON.stringify({ ...DOC, recursos: { html: base, pdf: `${base}.pdf` }, capitulos: CAPS.map(({ html, ...c }) => c) }));
  });
  app.get(`${base}.pdf`, opcional, (req, res) => {
    if (!fs.existsSync(PDF)) return res.status(404).send('PDF ainda não foi publicado.');
    res.set('Content-Type', 'application/pdf').set('Content-Disposition', 'inline; filename="violao-colecao-musique.pdf"').set('Cache-Control', 'no-cache').sendFile(PDF);
  });
  app.get(base, opcional, (req, res) => {
    const corpo = `${CSS}<header class="lab-cab"><p class="lab-cab-tipo">Curso do Musique · Coleção Musique, volume 2</p><h1>Violão: do zero ao avançado</h1><p class="lab-lead">Do primeiro acorde à bossa nova: ${CAPS.length} capítulos com diagramas, tablaturas e partituras, e as ferramentas do Musique ligadas a cada passo.</p><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso: carregando…</div><p><a class="btn sec" href="${base}.pdf">Abrir o livro em PDF</a></p></header>${resumoPartes()}
<script>(function(){try{var d=JSON.parse(localStorage.getItem('curso-violao-concluidas')||'[]');var el=document.getElementById('curso-progresso');if(el)el.textContent='Concluídos: '+d.length+' de ${CAPS.length}';d.forEach(function(s){var a=document.querySelector('[data-curso-slug="'+s+'"]');if(a)a.textContent='✓ '+a.textContent;});}catch(e){}})();</script>`;
    pagina(res, { titulo: 'Curso de violão — Musique', descricao: 'Curso de violão do Musique: acordes, batidas, dedilhado, bossa nova, técnicas e repertório.', caminho: base, corpo, trilha: [['Cursos', '/music/cursos'], ['Violão']] });
  });
  app.get(`${base}/:slug`, opcional, (req, res, next) => {
    const i = CAPS.findIndex((c) => c.slug === req.params.slug);
    if (i < 0) return next();
    const c = CAPS[i], ant = CAPS[i - 1], prox = CAPS[i + 1];
    const obj = c.objetivos.length ? `<div class="cv-obj"><b>NESTE CAPÍTULO VOCÊ VAI</b><ul>${c.objetivos.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : '';
    const ferr = c.ferramentas.length ? `<section><h2>Pratique com as ferramentas do Musique</h2><div class="cv-ferr">${c.ferramentas.map((f) => `<a href="${esc(f.url)}"><strong>${esc(f.rotulo)}</strong><span>${esc(f.porque)}</span></a>`).join('')}</div></section>` : '';
    const nav = `<nav class="cv-nav">${ant ? `<a class="btn sec" href="${base}/${esc(ant.slug)}">← ${esc(ant.titulo)}</a>` : '<span></span>'}${prox ? `<a class="btn" href="${base}/${esc(prox.slug)}">${esc(prox.titulo)} →</a>` : `<a class="btn" href="${base}">Voltar ao curso</a>`}</nav>`;
    const marcar = `<p><button type="button" class="btn" id="cv-concluir" data-slug="${esc(c.slug)}">Marcar capítulo como concluído</button> <span id="cv-estado"></span></p>
<script>(function(){var b=document.getElementById('cv-concluir'),e=document.getElementById('cv-estado'),k='curso-violao-concluidas';function ler(){try{return JSON.parse(localStorage.getItem(k)||'[]')}catch(x){return[]}}function mostra(){e.textContent=ler().indexOf(b.dataset.slug)>=0?'✓ concluído':'';}b.onclick=function(){var d=ler(),i=d.indexOf(b.dataset.slug);if(i>=0)d.splice(i,1);else d.push(b.dataset.slug);try{localStorage.setItem(k,JSON.stringify(d))}catch(x){}mostra();};mostra();})();</script>`;
    const corpo = `${CSS}<header class="lab-cab"><p class="lab-cab-tipo">${esc(c.parte)} · capítulo ${c.numero} de ${CAPS.length}</p><h1>${esc(c.titulo)}</h1>${c.epigrafe ? `<p class="cv-epi">${esc(c.epigrafe)}</p>` : ''}</header><article class="cv-corpo">${obj}${c.html}${ferr}${marcar}${nav}</article>`;
    pagina(res, { titulo: `${c.titulo} — Curso de violão | Musique`, descricao: c.resumo, caminho: `${base}/${c.slug}`, corpo, trilha: [['Cursos', '/music/cursos'], ['Violão', base], [c.titulo]] });
  });
}

module.exports = { registrar, CAPS, partes, DOC };
