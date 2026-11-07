'use strict';
// Cursos nativos da Coleção Musique (todos os instrumentos e a teoria), gerados dos livros por
// dados\music\colecao\gerar_curso_instrumento.py. Rotas: /music/curso/<instrumento>[/<capitulo>|.json|.pdf|/fig/<arquivo>].
// Tudo atrás do paywall de assinante (o prefixo /music/curso entra no app.use de paginas.js).
const fs = require('fs');
const path = require('path');

const PASTA = __dirname;
const CURSOS = [
  ['guitarra', 'Guitarra', '#8a5a72', 3, 'livro-guitarra-colecao.pdf', 'Power chords, pentatônica, blues, escalas, timbre e improvisação.'],
  ['contrabaixo', 'Contrabaixo', '#3f7180', 4, null, 'Técnica, groove, leitura, harmonia e performance.'],
  ['piano', 'Piano', '#536f82', 6, null, 'Teclado, leitura nas duas claves, harmonia, acompanhamento e performance.'],
  ['bateria', 'Bateria', '#a66b42', 5, 'livro-bateria-colecao.pdf', 'Kit, grooves, rudimentos, viradas e ritmos brasileiros.'],
  ['cavaquinho', 'Cavaquinho', '#8b6b48', 7, null, 'Acordes, batidas, samba, pagode, choro e performance.'],
  ['bandolim', 'Bandolim', '#7d6374', 8, null, 'Palhetada, tremolo, leitura, harmonia e choro.'],
  ['ukulele', 'Ukulelê', '#6d8060', 9, 'livro-ukulele-colecao.pdf', 'Acordes, batidas, melodias e repertório.'],
  ['teoria', 'Teoria musical', '#5865a8', 1, 'livro-teoria-colecao.pdf', 'Som, ritmo, escalas, intervalos, harmonia, forma e ouvido.'],
];

const CSS = `<style>
.cv-corpo{max-width:46rem;margin:0 auto;line-height:1.62}
.cv-corpo h2{margin:1.8em 0 .5em;font-size:1.35rem}.cv-corpo h3{margin:1.4em 0 .4em}
.cv-corpo table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.92rem;display:block;overflow-x:auto}
.cv-corpo th{background:#1B2A4A;color:#fff;text-align:left;padding:.4em .6em}.cv-corpo td{border-bottom:1px solid #d8deea;padding:.4em .6em;vertical-align:top}
.cv-corpo figure{margin:1.2em 0;text-align:center}.cv-corpo figure svg,.cv-corpo figure img,.cv-corpo img{max-width:100%;height:auto}
.cv-corpo figcaption{font-size:.85rem;color:#5b6783;margin-top:.4em}
.cv-corpo pre{background:#f4f6fa;border:1px solid #dde2ee;padding:.6rem .8rem;overflow-x:auto;font-size:.8rem;line-height:1.3;border-radius:4px}
.cv-corpo .admonition{border-left:4px solid #C9A227;background:#f7f4e8;padding:.7em 1em;margin:1.2em 0;border-radius:4px}
.cv-corpo .admonition-title{font-weight:700;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;margin:0 0 .3em}
.cv-corpo .admonition.atencao{border-color:#b54a3a;background:#fbf0ee}.cv-corpo .admonition.ouca{border-color:#4a8a5a;background:#edf6ef}
.cv-corpo .admonition.pratica{border-color:#2f6db5;background:#eaf1fa}.cv-corpo .admonition.sintese{border-color:#1B2A4A;background:#eef0f6}
.cv-corpo .admonition.exercicio{border-color:#1B2A4A;background:#fff}
.cv-corpo svg{max-width:100%}
.cv-corpo .fila{display:flex;justify-content:center;gap:.9rem;flex-wrap:wrap;margin:.8rem 0 1rem}.cv-corpo .fila svg{width:7.6rem;height:auto}
.cv-corpo .fila.tab svg,.cv-corpo .fila svg.tab{width:auto;max-width:100%}.cv-corpo svg.circ{width:min(26rem,100%)}.cv-corpo svg.tec{width:100%}
.cv-corpo svg.bat,.cv-corpo svg.tab{max-width:100%;height:auto}.cv-corpo figure.pauta{background:#fff;border:1px solid #dde2ee;padding:.5rem .7rem;border-radius:4px}.cv-corpo figure.pauta svg{width:100%;height:auto;max-width:none}
.cv-ferr{display:grid;gap:.7rem;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));margin:1rem 0}
.cv-ferr a{display:block;border:1px solid #cfd6e6;border-left:4px solid #C9A227;border-radius:6px;padding:.7rem .9rem;text-decoration:none;color:inherit}
.cv-ferr a strong{display:block}.cv-ferr a span{font-size:.88rem;opacity:.8}
.cv-nav{display:flex;justify-content:space-between;gap:1rem;margin:2rem 0;flex-wrap:wrap}
.cv-obj{background:#1B2A4A;color:#fff;border-radius:8px;padding:1rem 1.2rem;margin:1.2rem 0}.cv-obj b{color:#C9A227;font-size:.8rem;letter-spacing:.12em}
.cv-obj li{margin:.3rem 0}.cv-epi{font-style:italic;opacity:.85}
.cv-lista{padding-left:1.2rem}.cv-lista li{margin:.5rem 0}
</style>`;

function carregar() {
  const out = {};
  for (const [slug, nome, cor, vol, pdf, desc] of CURSOS) {
    const arq = path.join(PASTA, `curso-colecao-${slug}.json`);
    if (!fs.existsSync(arq)) continue;
    const doc = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const partes = [];
    doc.capitulos.forEach((c) => {
      let p = partes.find((x) => x.nome === c.parte);
      if (!p) { p = { nome: c.parte, capitulos: [] }; partes.push(p); }
      p.capitulos.push(c.numero);
    });
    out[slug] = { slug, nome, cor, vol, pdf, desc, doc, caps: doc.capitulos, partes, figs: path.join(PASTA, 'cursos-fig', slug) };
  }
  return out;
}
const LEGADO = {"teoria": "/music/curso-teoria", "guitarra": "/music/criar/curso-guitarra-aulas", "bateria": "/music/curso-bateria", "piano": "/music/curso-piano", "contrabaixo": "/music/curso-contrabaixo", "cavaquinho": "/music/curso-cavaquinho", "bandolim": "/music/curso-bandolim", "ukulele": "/music/curso-ukulele"};
const COLECAO = carregar();

function registrar(app, { opcional, pagina, esc }) {
  const lista = Object.values(COLECAO);
  lista.forEach((C) => {
    const base = `/music/curso/${C.slug}`;
    const resumoPartes = () => C.partes.map((p) => `<section class="curso-nivel"><div class="curso-nivel-cab"><div><h2>${esc(p.nome)}</h2></div><span>${p.capitulos.length} itens</span></div><ol class="cv-lista">${p.capitulos.map((n) => { const c = C.caps[n - 1]; return `<li><a data-curso-slug="${esc(c.slug)}" href="${base}/${esc(c.slug)}">${c.rotulo && !/^cap/i.test(c.rotulo) ? esc(c.rotulo) + ' — ' : ''}${esc(c.titulo)}</a><br><small>${esc(c.resumo)}</small></li>`; }).join('')}</ol></section>`).join('');
    const chave = `curso-${C.slug}-concluidas`;
    app.get(`${base}.json`, opcional, (req, res) => {
      res.type('application/json').set('Cache-Control', 'no-cache').send(JSON.stringify({ ...C.doc, recursos: { html: base, pdf: C.pdf ? `${base}.pdf` : null }, capitulos: C.caps.map(({ html, ...c }) => c) }));
    });
    if (C.pdf) {
      app.get(`${base}.pdf`, opcional, (req, res) => {
        const pdf = path.join(PASTA, '..', '..', 'output', 'pdf', C.pdf);
        if (!fs.existsSync(pdf)) return res.status(404).send('PDF ainda não foi publicado.');
        res.set('Content-Type', 'application/pdf').set('Content-Disposition', `inline; filename="${C.slug}-colecao-musique.pdf"`).set('Cache-Control', 'no-cache').sendFile(pdf);
      });
    }
    app.get(`${base}/fig/:arq`, opcional, (req, res, next) => {
      const nome = String(req.params.arq || '');
      if (!/^[A-Za-z0-9._-]+\.webp$/.test(nome)) return next();
      const f = path.join(C.figs, nome);
      if (!fs.existsSync(f)) return next();
      res.set('Content-Type', 'image/webp').set('Cache-Control', 'private, max-age=86400').sendFile(f);
    });
    app.get(base, opcional, (req, res) => {
      const corpo = `${CSS}<header class="lab-cab"><p class="lab-cab-tipo">Curso do Musique · Coleção Musique, volume ${C.vol}</p><h1>${esc(C.doc.titulo)}</h1><p class="lab-lead">${esc(C.desc)} ${C.caps.length} itens com as ferramentas do Musique ligadas a cada passo.</p><div id="curso-progresso" class="curso-progresso" aria-live="polite">Progresso: carregando…</div><p>${C.pdf ? `<a class="btn sec" href="${base}.pdf">Abrir o livro em PDF</a> ` : ''}<a class="btn sec" href="${LEGADO[C.slug]}">Registro de prática e acompanhamento (versão anterior do curso)</a></p></header>${resumoPartes()}
<script>(function(){try{var d=JSON.parse(localStorage.getItem('${chave}')||'[]');var el=document.getElementById('curso-progresso');if(el)el.textContent='Concluídos: '+d.length+' de ${C.caps.length}';d.forEach(function(s){var a=document.querySelector('[data-curso-slug="'+s+'"]');if(a)a.textContent='✓ '+a.textContent;});}catch(e){}})();</script>`;
      pagina(res, { titulo: `Curso de ${C.nome.toLowerCase()} — Musique`, descricao: C.desc, caminho: base, corpo, trilha: [['Cursos', '/music/cursos'], [C.nome]] });
    });
    app.get(`${base}/:slug`, opcional, (req, res, next) => {
      const i = C.caps.findIndex((c) => c.slug === req.params.slug);
      if (i < 0) return next();
      const c = C.caps[i], ant = C.caps[i - 1], prox = C.caps[i + 1];
      const obj = c.objetivos.length ? `<div class="cv-obj"><b>NESTE CAPÍTULO VOCÊ VAI</b><ul>${c.objetivos.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : '';
      const ferr = c.ferramentas.length ? `<section><h2>Pratique com as ferramentas do Musique</h2><div class="cv-ferr">${c.ferramentas.map((f) => `<a href="${esc(f.url)}"><strong>${esc(f.rotulo)}</strong><span>${esc(f.porque)}</span></a>`).join('')}</div></section>` : '';
      const nav = `<nav class="cv-nav">${ant ? `<a class="btn sec" href="${base}/${esc(ant.slug)}">← ${esc(ant.titulo)}</a>` : '<span></span>'}${prox ? `<a class="btn" href="${base}/${esc(prox.slug)}">${esc(prox.titulo)} →</a>` : `<a class="btn" href="${base}">Voltar ao curso</a>`}</nav>`;
      const marcar = `<p><button type="button" class="btn" id="cv-concluir" data-slug="${esc(c.slug)}">Marcar como concluído</button> <span id="cv-estado"></span></p>
<script>(function(){var b=document.getElementById('cv-concluir'),e=document.getElementById('cv-estado'),k='${chave}';function ler(){try{return JSON.parse(localStorage.getItem(k)||'[]')}catch(x){return[]}}function mostra(){e.textContent=ler().indexOf(b.dataset.slug)>=0?'✓ concluído':'';}b.onclick=function(){var d=ler(),i=d.indexOf(b.dataset.slug);if(i>=0)d.splice(i,1);else d.push(b.dataset.slug);try{localStorage.setItem(k,JSON.stringify(d))}catch(x){}mostra();};mostra();})();</script>`;
      const corpo = `${CSS}<header class="lab-cab"><p class="lab-cab-tipo">${esc(c.parte)} · item ${c.numero} de ${C.caps.length}</p><h1>${esc(c.titulo)}</h1>${c.epigrafe ? `<p class="cv-epi">${esc(c.epigrafe)}</p>` : ''}</header><article class="cv-corpo">${obj}${c.html}${ferr}${marcar}${nav}</article>`;
      pagina(res, { titulo: `${c.titulo} — Curso de ${C.nome.toLowerCase()} | Musique`, descricao: c.resumo, caminho: `${base}/${c.slug}`, corpo, trilha: [['Cursos', '/music/cursos'], [C.nome, base], [c.titulo]] });
    });
  });
}

module.exports = { registrar, COLECAO, CURSOS };
