const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '..', 'dist');
const ok = (b) => b ? 'OK ' : 'FALHA';
let falhas = 0;
const must = (cond, msg) => { if (!cond) falhas++; console.log(ok(cond) + ' ' + msg); };

// 1) Arquivos existem
const files = [
  'manifest.webmanifest', 'sw.js', 'offline.html',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon-180.png'
];
for (const f of files) {
  const p = path.join(D, f);
  const e = fs.existsSync(p);
  must(e, `arquivo ${f}` + (e ? ` (${fs.statSync(p).size} b)` : ''));
}

// 2) manifest parseável + campos obrigatórios
const m = JSON.parse(fs.readFileSync(path.join(D, 'manifest.webmanifest'), 'utf8'));
must(m.name === 'Villela Stay', 'manifest.name = "Villela Stay"');
must(m.short_name === 'Villela', 'manifest.short_name = "Villela"');
must(!!m.description, 'manifest.description presente');
must(m.start_url === '/?source=pwa', 'manifest.start_url = /?source=pwa');
must(m.scope === '/', 'manifest.scope = /');
must(m.display === 'standalone', 'manifest.display = standalone');
must(m.theme_color === '#5a3e2b', 'manifest.theme_color = #5a3e2b');
must(m.background_color === '#fbf6ee', 'manifest.background_color = #fbf6ee');
must(m.lang === 'pt-BR', 'manifest.lang = pt-BR');
must(m.orientation === 'portrait', 'manifest.orientation = portrait');
must(Array.isArray(m.categories) && m.categories.length > 0, 'manifest.categories presente');
const sizes = (m.icons || []).map(i => i.sizes);
must(sizes.includes('192x192'), 'icone 192x192 declarado');
must(sizes.includes('512x512'), 'icone 512x512 declarado');
must((m.icons || []).some(i => /maskable/.test(i.purpose || '')), 'icone maskable declarado');
must(Array.isArray(m.shortcuts) && m.shortcuts.length >= 2, `shortcuts (${(m.shortcuts||[]).length})`);

// 3) sw.js tem install/activate/fetch e não cacheia API
const swt = fs.readFileSync(path.join(D, 'sw.js'), 'utf8');
must(/addEventListener\(['"]install/.test(swt), 'sw: handler install');
must(/addEventListener\(['"]activate/.test(swt), 'sw: handler activate + limpeza de cache');
must(/addEventListener\(['"]fetch/.test(swt), 'sw: handler fetch');
must(/offline\.html/.test(swt), 'sw: fallback offline.html');
must(/\/api\//.test(swt), 'sw: ignora /api/ (sem cache de API)');
must(/caches\.delete/.test(swt), 'sw: deleta caches antigos no activate');

// 4) páginas referenciam manifest + apple-touch + registram o sw
const checkPage = (rel) => {
  const html = fs.readFileSync(path.join(D, rel), 'utf8');
  must(/<link rel="manifest" href="\/manifest\.webmanifest">/.test(html), `${rel}: <link manifest>`);
  must(/rel="apple-touch-icon"/.test(html), `${rel}: apple-touch-icon`);
  must(/name="theme-color"/.test(html), `${rel}: theme-color`);
  must(/apple-mobile-web-app-capable/.test(html), `${rel}: apple-mobile-web-app-capable`);
  must(/serviceWorker\.register\('\/sw\.js'/.test(html), `${rel}: registra sw.js`);
  must(/beforeinstallprompt/.test(html), `${rel}: prompt de instalacao`);
};
checkPage('index.html');
checkPage('hospedagem/GD03H.html');
checkPage('eventos.html');

// 5) dimensões reais dos PNG (lê o header IHDR do PNG)
function pngSize(p) {
  const b = fs.readFileSync(p);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const dims = {
  'assets/icons/icon-192.png': [192, 192],
  'assets/icons/icon-512.png': [512, 512],
  'assets/icons/icon-maskable-512.png': [512, 512],
  'assets/icons/apple-touch-icon-180.png': [180, 180]
};
for (const [f, [w, h]] of Object.entries(dims)) {
  const s = pngSize(path.join(D, f));
  must(s.w === w && s.h === h, `${f} = ${s.w}x${s.h} (esperado ${w}x${h})`);
}

console.log('\n' + (falhas === 0 ? 'TODAS AS VERIFICACOES PASSARAM' : falhas + ' FALHA(S)'));
process.exit(falhas === 0 ? 0 : 1);
