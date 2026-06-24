// =====================================================================
// Variante do curador de imagens que MESCLA em src/blog/creditos.json
// (NAO apaga os temas ja curados). Busca no Wikimedia Commons so os
// slugs listados em PLANO. Uso pontual. Rodar: node tools/fetch-blog-images-extra.js
// =====================================================================
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'src', 'blog');
fs.mkdirSync(OUT, { recursive: true });
const CRED = path.join(OUT, 'creditos.json');

const UA = 'VillelaStayBlogImageFetcher/1.0 (https://villelastay.com.br; villelastay@gmail.com)';

// So os temas NOVOS — os demais ficam intactos no creditos.json.
const PLANO = {
  'domo-geodesico': [
    'Geodesic dome', 'Eden Project Cornwall biome', 'Montreal Biosphere dome', 'Geodesic dome glamping',
  ],
  'hospedagem-profissional': [
    'Lago Paranoá Brasília', 'Pontão do Lago Sul Brasília', 'Lago Sul Brasília',
  ],
};

const BLACKLIST = /sisig|signature|assinatura|datacenter|R34|airship|dirig|zeppelin|stamp|selo|banknote|c[ée]dula|map\b|mapa|logo|coat_of_arms|flag\b|bandeira|Petr[óo]polis|MHNT|herbar|diagram|chart|graph|patent|drawing|sketch/i;

function apiGet(params) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const url = `https://commons.wikimedia.org/w/api.php?${qs}&format=json`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function baixar(url, destino) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return baixar(res.headers.location, destino).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const out = fs.createWriteStream(destino);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(fs.statSync(destino).size)));
      out.on('error', reject);
    }).on('error', reject);
  });
}

const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function buscarArquivo(query) {
  const r = await apiGet({ action: 'query', list: 'search', srsearch: query, srnamespace: 6, srlimit: 8 });
  const hits = (r.query && r.query.search) || [];
  for (const hit of hits) {
    const title = hit.title;
    if (BLACKLIST.test(title)) continue;
    const info = await apiGet({
      action: 'query', titles: title, prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata', iiurlwidth: 1600,
    });
    const pages = info.query && info.query.pages;
    const page = pages && Object.values(pages)[0];
    const ii = page && page.imageinfo && page.imageinfo[0];
    if (!ii) continue;
    if (!/^image\/(jpeg|png)$/.test(ii.mime)) continue;
    if ((ii.width || 0) < 1000) continue;
    const meta = ii.extmetadata || {};
    return {
      title,
      thumburl: ii.thumburl || ii.url,
      ext: ii.mime === 'image/png' ? 'png' : 'jpg',
      credito: stripTags(meta.Artist && meta.Artist.value) || 'Wikimedia Commons',
      licenca: stripTags(meta.LicenseShortName && meta.LicenseShortName.value) || 'ver fonte',
      fonte: ii.descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(title)),
      alt: query,
    };
  }
  return null;
}

(async () => {
  let creditos = {};
  try { creditos = JSON.parse(fs.readFileSync(CRED, 'utf8').replace(/^﻿/, '')); } catch (e) { console.warn('creditos.json novo'); }
  for (const [slug, queries] of Object.entries(PLANO)) {
    creditos[slug] = [];
    let n = 0;
    for (const q of queries) {
      try {
        const achado = await buscarArquivo(q);
        if (!achado) { console.log(`  [${slug}] sem resultado livre para "${q}"`); await sleep(300); continue; }
        n++;
        const file = `${slug}-${n}.${achado.ext}`;
        const tam = await baixar(achado.thumburl, path.join(OUT, file));
        if (tam < 15000) { console.log(`  [${slug}] "${q}" muito pequeno (${tam}b), descartado`); n--; fs.unlinkSync(path.join(OUT, file)); continue; }
        creditos[slug].push({ file, alt: achado.alt, credito: achado.credito, licenca: achado.licenca, fonte: achado.fonte });
        console.log(`  [${slug}] ${file}  (${Math.round(tam/1024)} KB)  ${achado.licenca}  — ${achado.credito.slice(0,46)}`);
      } catch (e) {
        console.log(`  [${slug}] erro em "${q}": ${e.message}`);
      }
      await sleep(400);
    }
  }
  fs.writeFileSync(CRED, JSON.stringify(creditos, null, 2), 'utf8');
  const total = Object.values(creditos).reduce((a, v) => a + v.length, 0);
  console.log(`\nOK (merge): ${total} imagens no creditos.json (${Object.keys(PLANO).join(', ')} atualizados)`);
})();
