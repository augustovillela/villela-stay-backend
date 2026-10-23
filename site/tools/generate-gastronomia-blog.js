const fs = require('fs');
const path = require('path');

const base = process.env.VILLELA_ACADEMY_URL;
const token = process.env.VILLELA_ACADEMY_ACESSO;
const productId = 'BJsDv7yX63dM';
if (!base || !token) throw new Error('Variáveis da Academy ausentes.');

const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mdInline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const markdownToHtml = text => String(text).trim().split(/\n\s*\n/).map(block => {
  const b = block.trim();
  if (!b) return '';
  if (/^### /.test(b)) return `<h3>${mdInline(b.replace(/^### /, ''))}</h3>`;
  if (/^## /.test(b)) return `<h2>${mdInline(b.replace(/^## /, ''))}</h2>`;
  if (/^\d+\. /.test(b)) return `<ol>${b.split(/\n/).map(line => `<li>${mdInline(line.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
  return `<p>${mdInline(b.replace(/\n/g, ' '))}</p>`;
}).join('');
const officialLessons = () => {
  const dir = path.join(__dirname, '..', 'content', 'gastronomia-villela-table');
  const map = new Map();
  for (const file of fs.readdirSync(dir).filter(name => /^volume-.*\.md$/.test(name))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const marker = source.indexOf('## Aulas oficiais');
    if (marker < 0) continue;
    const section = source.slice(marker);
    const matches = [...section.matchAll(/### Aula (\d+) — ([^\n]+)\n([\s\S]*?)(?=\n### Aula |\n## |$)/g)];
    for (const m of matches) map.set(Number(m[1]), { title: m[2].trim(), html: markdownToHtml(m[3]) });
  }
  return map;
};
const html = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Gastronomia Villela Table</title><meta name="description" content="Aula da Formação Completa em Gastronomia Villela Table, de Augusto Villela."><style>.cap{--accent:#c8623c;--accent2:#1f5f6b;--navy:#0f1a2b;--paper:#faf7f1;--line:#e6dfd3;background:var(--paper);color:#1c1a17;font:18px/1.65 Inter,"Segoe UI",system-ui,sans-serif}.cap-hero,.cap-hub-hero{background:var(--navy);color:#f3ede3;padding:64px 24px 48px;text-align:center}.cap-hub-hero h1,.cap-hero h1{font:700 44px/1.1 Georgia,serif;margin:0 0 14px}.cap-hub-hero p{max-width:720px;margin:0 auto;font-size:19px;color:#d9d2c5}.in,.cap-corpo,.cap-nav,.cap-faq,.cap-grade,.cap-sumario-hub{max-width:1100px;margin:auto}.cap-corpo,.cap-faq{padding:34px 20px;background:#fff}.cap-corpo h2,.cap-sumario-hub h2{color:var(--navy)}.cap-nav{display:flex;justify-content:space-between;gap:12px;padding:24px 20px}.cap-nav a,.cap-faixa a{color:var(--accent);font-weight:bold}.cap-faixa{max-width:1100px;margin:24px auto;padding:18px 20px;background:#fff;border:1px solid var(--line);border-radius:14px}.breadcrumb{font-size:14px}.breadcrumb a{color:#e8a184}.cap-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;padding:24px 20px}.cap-card{display:block;background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px 22px 18px;text-decoration:none;color:#1c1a17;transition:transform .15s,box-shadow .15s}.cap-card:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(15,26,43,.12)}.cap-card .n{display:inline-block;font:700 12px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}.cap-card h3{font:700 20px/1.25 Georgia,serif;margin:0 0 8px}.cap-card p{font-size:15px;line-height:1.45;color:#4a4640;margin:0 0 10px}.cap-card .min{font-size:13px;color:#7a746b}.cap-sumario-hub{padding:28px 20px 4px}</style></head><body><div class="cap"><header class="cap-hero"><div class="in"><nav class="breadcrumb"><a href="/blog.html">Blog</a> › <a href="/gastronomia-villela-table/">Gastronomia Villela Table</a> › Aula</nav><h1>${esc(title)}</h1><p>Formação Completa em Gastronomia — Villela Table, por Augusto Villela.</p></div></header>${body}</div></body></html>`;

(async () => {
  const response = await fetch(`${base}/staff/api/academy/importar-curso/estrutura?produtor_email=villelastay@gmail.com&produto_id=${productId}`, { headers: { Authorization: `Bearer ${token}` } });
  let lessons;
  if (response.ok) {
    const data = await response.json();
    lessons = data.estrutura.flatMap((module, mi) => module.aulas.map((lesson, li) => ({ module, lesson, number: mi * 4 + li + 1 })));
  } else {
    const localRoot = path.join(__dirname, '..', 'content', 'gastronomia-villela-table', 'aulas');
    const files = fs.existsSync(localRoot) ? fs.readdirSync(localRoot).filter(n => /^\d+-.*\.html$/.test(n)) : [];
    lessons = files.map(name => { const number = Number(name.match(/^\d+/)[0]); const title = name.replace(/^\d+-/, '').replace(/\.html$/, '').replace(/-/g, ' '); return { number, lesson: { titulo: title }, module: { titulo: `Volume ${Math.ceil(number / 20)} da Formação em Gastronomia` } }; });
    console.warn(`Academy respondeu ${response.status}; usando a estrutura local das aulas.`);
  }
  const official = officialLessons();
  const root = path.join(__dirname, '..', 'content', 'gastronomia-villela-table', 'aulas');
  fs.mkdirSync(root, { recursive: true });
  const cards = lessons.map(x => `<a class="cap-card" href="${x.number}-${slugify(x.lesson.titulo)}.html"><span class="n">Aula ${x.number}</span><h3>${esc(x.lesson.titulo)}</h3><p>${esc(x.module.titulo)}</p><span class="min">Abrir aula →</span></a>`).join('');
  fs.writeFileSync(path.join(root, 'index.html'), html('Gastronomia Villela Table — índice completo', `<main><section class="cap-hub-hero"><h1>Gastronomia Villela Table <span style="display:block;font-size:.5em;font-weight:500;margin-top:8px">Formação Completa em Gastronomia</span></h1><p>As 100 aulas do curso de Augusto Villela, organizadas em 25 módulos.</p></section><section class="cap-sumario-hub"><h2>Índice da série</h2><p>Cada card abre uma aula HTML completa, com navegação sequencial e materiais complementares.</p><div class="cap-faixa"><a href="https://academia.villelastay.com.br/academy/marketplace">Conheça o curso no Villela Academy →</a> · <a href="https://livros.villelastay.com.br/livros">Conheça os livros e PDFs →</a></div></section><div class="cap-grade">${cards}</div></main>`));
  for (const [i, x] of lessons.entries()) {
    const previous = lessons[i - 1]; const next = lessons[i + 1];
    const filename = `${x.number}-${slugify(x.lesson.titulo)}.html`;
    const nav = `<nav class="cap-nav">${previous ? `<a href="${previous.number}-${slugify(previous.lesson.titulo)}.html">← Aula anterior</a>` : '<span></span>'}<a href="/blog/formacao-completa-gastronomia-villela-table.html">☰ Índice do curso</a>${next ? `<a href="${next.number}-${slugify(next.lesson.titulo)}.html">Próxima aula →</a>` : '<span></span>'}</nav>`;
    const baseContent = official.get(x.number)?.html || markdownToHtml(x.lesson.conteudo || '');
    const illustration = x.number === 5 ? '<figure class="aula-fig"><img src="../ilustracoes/controle-temperatura.svg" alt="Diagrama de controle de temperatura na cozinha"><figcaption>Controle de temperatura: medir, registrar, decidir e servir.</figcaption></figure>' : x.number === 85 ? '<figure class="aula-fig"><img src="../ilustracoes/ciclo-fermentacao.svg" alt="Diagrama do ciclo de fermentação da massa"><figcaption>Ciclo de fermentação: mistura, fermentação, modelagem e forno.</figcaption></figure>' : '';
    const development = official.has(x.number) ? '' : `<h2>Desenvolvimento da aula</h2><p>Nesta aula, o estudante trabalha <strong>${esc(x.lesson.titulo)}</strong> dentro do módulo <strong>${esc(x.module.titulo)}</strong>. O foco é compreender o princípio técnico, executar o procedimento com organização e avaliar o resultado com critérios profissionais.</p><h3>Roteiro de estudo e prática</h3><ol><li>Leia o objetivo e organize a mise en place, os utensílios e os ingredientes necessários.</li><li>Observe a sequência de execução, registrando medidas, tempos, temperaturas, texturas e rendimento.</li><li>Repita a prática em pequena escala e compare o resultado com o padrão esperado.</li><li>Registre o que funcionou, o que precisa ser corrigido e quais adaptações são necessárias para sua cozinha.</li></ol><h3>Critérios de qualidade</h3><p>Avalie segurança, organização, aproveitamento, precisão, textura, aroma, sabor, apresentação e capacidade de repetir o resultado. Uma boa execução é aquela que pode ser explicada, registrada e reproduzida.</p><h3>Exercício de portfólio</h3><p>Prepare uma ficha técnica simples, fotografe o resultado final e escreva uma breve análise com dificuldades, ajustes e próximos passos. Esse registro fará parte do portfólio da formação Villela Table.</p>`;
    const roteiroOficial = official.has(x.number) ? `<section class="aula-aprofundamento"><h2>Como estudar esta aula</h2><p>Leia o conteúdo completo, identifique o princípio técnico central e transforme a explicação em uma sequência de trabalho. Antes de cozinhar, prepare a bancada, confira os utensílios, pese os ingredientes e registre as condições da sua cozinha.</p><h3>Procedimento de prática</h3><ol><li>Faça a mise en place e anote pesos, medidas, rendimento e tempo previsto.</li><li>Execute a técnica em pequena escala, observando textura, temperatura, aroma e ponto.</li><li>Registre cada alteração feita em relação ao método apresentado e explique por que a fez.</li><li>Repita a execução corrigindo um único fator por vez para identificar sua influência no resultado.</li></ol><h3>Segurança e controle de qualidade</h3><p>Trabalhe com mãos, superfícies e utensílios higienizados; separe alimentos crus e prontos; controle tempo e temperatura; e descarte preparações que apresentem risco. Qualidade profissional significa produzir um resultado seguro, saboroso, reproduzível e documentado.</p><h3>Exercício de portfólio</h3><p>Produza uma ficha técnica da prática, fotografe a mise en place e o resultado, descreva dois problemas encontrados e proponha uma correção para cada um. Avalie organização, precisão, segurança, textura, sabor, apresentação e capacidade de repetir o resultado.</p><h3>Critérios de avaliação</h3><ul><li>Compreensão do princípio técnico;</li><li>sequência de trabalho e mise en place;</li><li>controle de medidas, tempo e temperatura;</li><li>segurança alimentar e limpeza;</li><li>qualidade sensorial e apresentação;</li><li>registro claro das decisões e correções.</li></ul></section>` : '';
    const body = `<main class="cap-corpo"><p><strong>Módulo:</strong> ${esc(x.module.titulo)}</p>${illustration}${baseContent}${development}${roteiroOficial}<div class="cap-faixa"><a href="https://academia.villelastay.com.br/academy/marketplace">Ver o curso e os vídeos no Villela Academy →</a><br><a href="https://livros.villelastay.com.br/livros">Ver os PDFs e livros complementares →</a></div></main>${nav}`;
    fs.writeFileSync(path.join(root, filename), html(`Aula ${x.number}: ${x.lesson.titulo}`, body));
  }
  console.log(`Gastronomia Villela Table: ${lessons.length} aulas HTML geradas em ${root}`);
})();
