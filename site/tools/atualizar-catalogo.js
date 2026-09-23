// =====================================================================
// atualizar-catalogo.js — cache do catálogo do grupo para a /tudo.html
// =====================================================================
// A landing conjunta lista TODOS os livros da Livraria e TODOS os cursos
// da Academy. Esses dois acervos vivem no backend, não aqui — e o build
// do site precisa ser offline e determinístico (roda em máquina sem rede
// e não pode quebrar porque a Render dormiu). Então o catálogo entra no
// repositório como dado: este script busca e grava `data/catalogo.json`,
// e o build apenas lê o arquivo.
//
// Rodar quando publicar livro ou curso novo:
//   PUBLISH_KEY=... node tools/atualizar-catalogo.js
//   node tools/atualizar-catalogo.js --key <chave>
//
// De onde vem cada coisa:
//   livros  → /staff/api/livraria/livros (precisa da PUBLISH_KEY; traz
//             capa, categoria, subtítulo e os três preços em centavos)
//   cursos  → páginas públicas da Academy (sem chave): o marketplace dá
//             a lista e o JSON-LD de cada curso dá nome, descrição, capa
//             e preço. Não existe API pública de catálogo, e a rota staff
//             de produtos exige sessão de admin — a chave não basta.
//
// O arquivo gravado guarda a data da coleta. O build avisa quando o
// catálogo está velho, mas não quebra: site no ar vale mais que preço
// atualizado, e a fonte da verdade continua sendo cada loja.
'use strict';
const fs = require('fs');
const path = require('path');

const BACKEND = 'https://villela-stay-backend.onrender.com';
const LOJA = 'https://livros.villelastay.com.br';
const ACADEMY = 'https://academia.villelastay.com.br';
const SAIDA = path.join(__dirname, '..', 'data', 'catalogo.json');
const UA = { 'User-Agent': 'villela-site-build/1.0 (+https://villelastay.com.br)' };

const arg = (nome) => {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : null;
};
const CHAVE = arg('--key') || process.env.PUBLISH_KEY || '';

async function pegar(url, headers = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers } });
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return r;
}

// ------------------------------------------------------------- livros
async function livros() {
  if (!CHAVE) throw new Error('sem PUBLISH_KEY: exporte a variável ou passe --key <chave>');
  const r = await pegar(`${BACKEND}/staff/api/livraria/livros`, { 'x-publish-key': CHAVE });
  const { livros: todos = [] } = await r.json();
  return todos
    .filter(b => b.ativo)
    .map(b => ({
      slug: b.slug,
      titulo: b.titulo,
      subtitulo: b.subtitulo || '',
      resumo: (b.descricao_curta || '').trim(),
      categoria: b.categoria || 'Outros',
      capa: b.capa_url ? (b.capa_url.startsWith('http') ? b.capa_url : LOJA + b.capa_url) : '',
      // centavos, como no banco; a página formata
      precoPdf: b.preco_pdf ?? null,
      precoImpresso: b.preco_impresso ?? null,
      precoCombo: b.preco_combo ?? null,
      destaque: !!b.destaque,
      url: `${LOJA}/livros/${b.slug}`
    }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

// ------------------------------------------------------------- cursos
const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
function blocosLd(html) {
  const fora = [];
  for (const m of html.matchAll(LD)) {
    try {
      const o = JSON.parse(m[1]);
      fora.push(...(Array.isArray(o) ? o : [o]));
    } catch { /* bloco quebrado no HTML não derruba a coleta */ }
  }
  return fora;
}

async function cursos() {
  const lista = await (await pegar(`${ACADEMY}/academy/marketplace`)).text();
  const colecao = blocosLd(lista).find(o => o.mainEntity && o.mainEntity['@type'] === 'ItemList');
  const urls = ((colecao && colecao.mainEntity.itemListElement) || [])
    .map(it => (it.item && it.item.url) || it.url).filter(Boolean);
  if (!urls.length) throw new Error('o marketplace da Academy não devolveu nenhum curso');

  const fora = [];
  for (const url of urls) {
    const html = await (await pegar(url)).text();
    const c = blocosLd(html).find(o => o['@type'] === 'Course' || o['@type'] === 'Product');
    if (!c) { console.warn(`  ! ${url}: sem JSON-LD de curso — pulado`); continue; }
    const oferta = Array.isArray(c.offers) ? c.offers[0] : c.offers;
    fora.push({
      slug: url.split('/').pop(),
      titulo: c.name,
      resumo: (c.description || '').trim(),
      capa: c.image || '',
      preco: oferta && oferta.price ? Math.round(parseFloat(oferta.price) * 100) : null,
      url
    });
  }
  return fora;
}

// --------------------------------------------------------------- main
(async () => {
  const antes = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')) : null;
  const dado = { coletadoEm: new Date().toISOString(), livros: [], cursos: [] };
  const falhas = [];

  for (const [nome, fn] of [['livros', livros], ['cursos', cursos]]) {
    try {
      dado[nome] = await fn();
      console.log(`${nome}: ${dado[nome].length}`);
    } catch (e) {
      falhas.push(`${nome}: ${e.message}`);
      // manter o que já havia é melhor que publicar uma seção vazia
      dado[nome] = (antes && antes[nome]) || [];
      console.error(`${nome}: FALHOU (${e.message}) — mantendo ${dado[nome].length} do cache`);
    }
  }

  if (!dado.livros.length && !dado.cursos.length) {
    console.error('nada coletado e nada em cache — o arquivo NÃO foi reescrito');
    process.exit(1);
  }
  fs.writeFileSync(SAIDA, JSON.stringify(dado, null, 2) + '\n', 'utf8');
  console.log(`\ngravado em ${path.relative(process.cwd(), SAIDA)}`);
  if (falhas.length) {
    console.error('\nfalhas:');
    falhas.forEach(f => console.error('  - ' + f));
    process.exit(2);
  }
})();
