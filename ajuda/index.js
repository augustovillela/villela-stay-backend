// ============================ Central de Ajuda dos produtos ============================
// Serve, para cada produto SaaS do Grupo Villela Stay, as páginas públicas:
//   GET <base>/ajuda          → hub (links para manual e FAQ)
//   GET <base>/ajuda/manual   → Manual do Usuário
//   GET <base>/ajuda/faq      → Perguntas Frequentes
// O conteúdo vive em markdown em ajuda/conteudo/<slug>-manual.md e <slug>-faq.md,
// renderizado aqui no servidor (parser próprio, mesmo dialeto do mdParaHtml do staff).
// Registrar ANTES dos módulos no server.js para ter prioridade sobre catch-alls.
'use strict';

const fs = require('fs');
const path = require('path');

const CONTEUDO_DIR = path.join(__dirname, 'conteudo');

// slug → produto. `base` é o prefixo público do módulo; `landing` é o link "voltar ao site".
const PRODUTOS = [
  { slug: 'academy', base: '/academy', nome: 'Villela Academy', landing: '/academy' },
  { slug: 'crm', base: '/crm', nome: 'Villela CRM', landing: '/crm' },
  { slug: 'vdocs', base: '/vdocs', nome: 'Villela Docs Intelligence', landing: '/vdocs' },
  { slug: 'vpe', base: '/vpe', nome: 'Villela Projects & Events', landing: '/vpe' },
  { slug: 'vsm', base: '/gestao', nome: 'Villela Stay Manager', landing: '/gestao' },
  { slug: 'legal-saas', base: '/juridico', nome: 'Villela Legal', landing: '/juridico' },
  { slug: 'livraria', base: '/livros', nome: 'Livraria Villela', landing: '/livros' },
  { slug: 'kids', base: '/kids', nome: 'Villela Kids', landing: '/kids' },
];

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// markdown simples → html (títulos, negrito, itálico, código, listas, tabelas, citações, links).
// Mesmo dialeto do mdParaHtml de staff/app-core.js, portado para o servidor.
function mdParaHtml(md) {
  const linhas = String(md).replace(/\r/g, '').split('\n');
  const inline = (s) => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const branco = (l) => /^\s*$/.test(l);
  const head = (l) => /^#{1,6}\s/.test(l);
  const tab = (l) => /^\s*\|.*\|\s*$/.test(l);
  const lista = (l) => /^\s*[-*]\s+/.test(l);
  const numerada = (l) => /^\s*\d+[.)]\s+/.test(l);
  const quote = (l) => /^\s*>\s?/.test(l);
  const novoBloco = (l) => branco(l) || head(l) || tab(l) || lista(l) || numerada(l) || quote(l);
  let out = '', i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (branco(l)) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { const n = Math.min(m[1].length, 4); out += `<h${n}>${inline(m[2])}</h${n}>`; i++; continue; }
    if (tab(l) && i + 1 < linhas.length && /^\s*\|[-:\s|]+\|\s*$/.test(linhas[i + 1])) {
      const cels = (linha) => linha.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const cab = cels(l); i += 2; let corpo = '';
      while (i < linhas.length && tab(linhas[i])) { corpo += '<tr>' + cels(linhas[i]).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'; i++; }
      out += `<table><thead><tr>${cab.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table>`;
      continue;
    }
    if (quote(l)) { const buf = []; while (i < linhas.length && quote(linhas[i])) { buf.push(linhas[i].replace(/^\s*>\s?/, '')); i++; } out += `<blockquote>${inline(buf.join(' '))}</blockquote>`; continue; }
    if (numerada(l)) {
      const it = [];
      while (i < linhas.length && !branco(linhas[i]) && !head(linhas[i]) && !tab(linhas[i]) && !quote(linhas[i]) && !lista(linhas[i])) {
        if (numerada(linhas[i])) it.push(linhas[i].replace(/^\s*\d+[.)]\s+/, ''));
        else if (it.length) it[it.length - 1] += ' ' + linhas[i].trim();
        else break;
        i++;
      }
      out += `<ol>${it.map(t => `<li>${inline(t)}</li>`).join('')}</ol>`;
      continue;
    }
    if (lista(l)) {
      const it = [];
      while (i < linhas.length && !branco(linhas[i]) && !head(linhas[i]) && !tab(linhas[i]) && !quote(linhas[i]) && !numerada(linhas[i])) {
        if (lista(linhas[i])) it.push(linhas[i].replace(/^\s*[-*]\s+/, ''));
        else if (it.length) it[it.length - 1] += ' ' + linhas[i].trim();
        else it.push(linhas[i].trim());
        i++;
      }
      out += `<ul>${it.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`;
      continue;
    }
    const buf = []; while (i < linhas.length && !novoBloco(linhas[i])) { buf.push(linhas[i]); i++; }
    out += `<p>${inline(buf.join(' '))}</p>`;
  }
  return out;
}

// Cache simples por mtime: relê o markdown só quando o arquivo muda.
const _cache = new Map();
function lerMarkdown(slug, tipo) {
  const arq = path.join(CONTEUDO_DIR, `${slug}-${tipo}.md`);
  let st; try { st = fs.statSync(arq); } catch (_) { return null; }
  const k = `${slug}:${tipo}`;
  const c = _cache.get(k);
  if (c && c.mtime === st.mtimeMs) return c.html;
  const html = mdParaHtml(fs.readFileSync(arq, 'utf8'));
  _cache.set(k, { mtime: st.mtimeMs, html });
  return html;
}

function pagina(produto, titulo, corpoHtml, ativo) {
  const nav = (rota, rot, id) =>
    `<a href="${produto.base}/ajuda${rota}"${ativo === id ? ' class="ativo"' : ''}>${rot}</a>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} — ${esc(produto.nome)}</title>
<meta name="description" content="${esc(titulo)} do ${esc(produto.nome)} — Grupo Villela Stay.">
<style>
:root{--tinta:#1c2430;--sub:#5b6675;--ouro:#b08d3e;--fundo:#f7f5f0;--card:#fff;--borda:#e5e0d5}
*{box-sizing:border-box}body{margin:0;font-family:Georgia,'Times New Roman',serif;background:var(--fundo);color:var(--tinta);line-height:1.65}
header{background:#141a22;color:#f3efe6;padding:1.1rem 1.4rem;display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;align-items:baseline}
header .marca{font-size:1.05rem;font-weight:700;letter-spacing:.02em}
header .marca a{color:inherit;text-decoration:none}
header nav{margin-left:auto;display:flex;gap:1rem;font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:.92rem}
header nav a{color:#cfc6b4;text-decoration:none}header nav a.ativo,header nav a:hover{color:#fff;border-bottom:2px solid var(--ouro)}
main{max-width:860px;margin:2rem auto 3rem;padding:0 1.2rem}
.doc{background:var(--card);border:1px solid var(--borda);border-radius:14px;padding:2rem 2.2rem;box-shadow:0 8px 30px rgba(20,26,34,.06)}
.doc h1{font-size:1.7rem;margin:.2rem 0 1rem;color:#141a22}
.doc h2{font-size:1.25rem;margin:1.8rem 0 .6rem;padding-top:.6rem;border-top:1px solid var(--borda);color:#141a22}
.doc h3{font-size:1.05rem;margin:1.3rem 0 .4rem;color:#2a3442}
.doc p{margin:.55rem 0}.doc ul,.doc ol{margin:.5rem 0 .8rem;padding-left:1.4rem}.doc li{margin:.25rem 0}
.doc code{font-family:Consolas,Menlo,monospace;font-size:.9em;background:#f1ede3;border-radius:4px;padding:.08em .35em}
.doc table{border-collapse:collapse;width:100%;margin:.8rem 0;font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:.92rem}
.doc th,.doc td{border:1px solid var(--borda);padding:.45rem .6rem;text-align:left}.doc th{background:#f4f0e6}
.doc blockquote{margin:.8rem 0;padding:.6rem 1rem;border-left:4px solid var(--ouro);background:#faf7ef;color:var(--sub)}
.doc a{color:#8a6b25}
.hub{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:1.2rem}
.hub a{display:block;background:var(--card);border:1px solid var(--borda);border-radius:14px;padding:1.4rem;text-decoration:none;color:var(--tinta);box-shadow:0 8px 30px rgba(20,26,34,.06)}
.hub a:hover{border-color:var(--ouro)}
.hub .ico{font-size:1.6rem}.hub .tit{font-weight:700;margin:.4rem 0 .2rem}.hub .sub{color:var(--sub);font-size:.92rem;font-family:system-ui,Segoe UI,Arial,sans-serif}
footer{max-width:860px;margin:0 auto 2.5rem;padding:0 1.2rem;color:var(--sub);font-size:.85rem;font-family:system-ui,Segoe UI,Arial,sans-serif}
footer a{color:var(--sub)}
@media(max-width:640px){.doc{padding:1.3rem 1.1rem}}
</style></head><body>
<header>
  <div class="marca"><a href="${produto.landing}">${esc(produto.nome)}</a> <span style="color:#8d97a5;font-size:.85rem;font-family:system-ui,sans-serif">· Central de Ajuda</span></div>
  <nav>${nav('', 'Ajuda', 'hub')}${nav('/manual', 'Manual do usuário', 'manual')}${nav('/faq', 'FAQ', 'faq')}<a href="${produto.landing}">Voltar ao site</a></nav>
</header>
<main>${corpoHtml}</main>
<footer>© ${new Date().getFullYear()} Grupo Villela Stay · <a href="${produto.landing}">${esc(produto.nome)}</a></footer>
</body></html>`;
}

function montar(app) {
  for (const p of PRODUTOS) {
    app.get(`${p.base}/ajuda`, (req, res) => {
      const corpo = `<div class="doc"><h1>Central de Ajuda — ${esc(p.nome)}</h1>
<p>Bem-vindo(a)! Aqui você encontra tudo para aproveitar o ${esc(p.nome)} ao máximo.</p></div>
<div class="hub">
  <a href="${p.base}/ajuda/manual"><span class="ico">📖</span><div class="tit">Manual do usuário</div><div class="sub">Passo a passo completo: primeiros passos, funcionalidades, planos e segurança.</div></a>
  <a href="${p.base}/ajuda/faq"><span class="ico">❓</span><div class="tit">Perguntas frequentes</div><div class="sub">Respostas rápidas para as dúvidas mais comuns.</div></a>
</div>`;
      res.send(pagina(p, 'Central de Ajuda', corpo, 'hub'));
    });
    for (const [rota, tipo, titulo] of [['/ajuda/manual', 'manual', 'Manual do Usuário'], ['/ajuda/faq', 'faq', 'Perguntas Frequentes']]) {
      app.get(`${p.base}${rota}`, (req, res) => {
        const html = lerMarkdown(p.slug, tipo);
        if (!html) return res.status(404).send(pagina(p, titulo, `<div class="doc"><h1>${titulo}</h1><p>Conteúdo em preparação. Volte em breve!</p></div>`, tipo));
        res.send(pagina(p, titulo, `<div class="doc">${html}</div>`, tipo));
      });
    }
  }
}

module.exports = { montar, mdParaHtml, PRODUTOS };
