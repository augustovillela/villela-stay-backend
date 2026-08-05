// =====================================================================
// Closet Club — verificação de PRODUÇÃO (onda 3).
//
//   node closet/verificar-producao.js [https://closet.villelastay.com.br]
//
// Confere de fora o que só dá para saber com o site no ar: domínio,
// páginas públicas, SEO, PWA, API, e o que ainda está em modo manual.
// Não escreve nada e não precisa de credencial — é seguro rodar sempre.
//
// Sai com código 1 se algo BLOQUEIA o lançamento; avisos amarelos não
// derrubam o processo (servem para o Augusto decidir).
// =====================================================================
'use strict';

const BASE = (process.argv[2] || process.env.CLOSET_BASE_URL || 'https://closet.villelastay.com.br').replace(/\/+$/, '');
const bloqueios = [];
const avisos = [];
const oks = [];

const ok = (m) => { oks.push(m); console.log('  ✅', m); };
const aviso = (m) => { avisos.push(m); console.log('  ⚠️ ', m); };
const bloqueio = (m) => { bloqueios.push(m); console.log('  ❌', m); };

async function pegar(caminho, { metodo = 'GET', headers = {} } = {}) {
  const r = await fetch(BASE + caminho, { method: metodo, headers, redirect: 'manual' });
  const texto = r.status < 400 || r.status === 404 ? await r.text() : '';
  return { st: r.status, texto, ct: r.headers.get('content-type') || '', headers: r.headers };
}

async function rodar() {
  console.log(`Closet Club — verificação de produção\nAlvo: ${BASE}\n`);

  // ---- 1. páginas públicas ----
  console.log('Páginas públicas');
  const publicas = ['/closet', '/closet/vitrine', '/closet/looks', '/closet/ia', '/closet/anunciar',
    '/closet/blog', '/closet/parceiro', '/closet/como-funciona', '/closet/termos', '/closet/privacidade'];
  for (const p of publicas) {
    try {
      const r = await pegar(p);
      if (r.st === 200) ok(`${p} responde 200`);
      else bloqueio(`${p} devolveu ${r.st}`);
    } catch (e) { bloqueio(`${p} inacessível: ${e.message}`); }
  }

  // ---- 2. HTTPS e domínio ----
  console.log('\nDomínio e transporte');
  if (BASE.startsWith('https://')) ok('servindo por HTTPS');
  else bloqueio('o site não está em HTTPS — pagamento e login não podem ir ao ar assim');
  if (/localhost|127\.0\.0\.1/.test(BASE)) aviso('alvo é local: isto não valida o domínio de produção');

  // ---- 3. SEO ----
  console.log('\nSEO');
  try {
    const home = await pegar('/closet');
    if (/<title>[^<]{20,}/.test(home.texto)) ok('title preenchido na home');
    else bloqueio('home sem <title> adequado');
    if (/name="description" content="[^"]{50,}/.test(home.texto)) ok('meta description na home');
    else aviso('home sem meta description longa o bastante');
    if (home.texto.includes('"@type":"WebSite"')) ok('JSON-LD da home presente');
    else aviso('home sem JSON-LD');
    if (/rel="canonical"/.test(home.texto)) ok('canonical na home');
    else aviso('home sem canonical');

    const robots = await pegar('/closet/robots.txt');
    if (robots.st === 200 && robots.texto.includes('Sitemap:')) ok('robots.txt aponta o sitemap');
    else bloqueio('robots.txt ausente ou sem Sitemap');
    if (robots.texto.includes('Disallow: /closet/app') && robots.texto.includes('Disallow: /closet/api')) {
      ok('robots bloqueia painel e API');
    } else bloqueio('robots NÃO bloqueia /closet/app ou /closet/api');

    const sitemap = await pegar('/closet/sitemap.xml');
    const urls = (sitemap.texto.match(/<url>/g) || []).length;
    if (sitemap.st === 200 && urls > 0) ok(`sitemap com ${urls} URL(s)`);
    else bloqueio('sitemap.xml vazio ou indisponível');
    if (!sitemap.texto.includes('localhost')) ok('sitemap sem URL de localhost');
    else bloqueio('sitemap contém localhost — CLOSET_BASE_URL não está configurada no Render');
  } catch (e) { bloqueio('falha ao checar SEO: ' + e.message); }

  // ---- 4. PWA ----
  console.log('\nPWA');
  try {
    const man = await pegar('/closet/manifest.webmanifest');
    if (man.st === 200) {
      const m = JSON.parse(man.texto);
      ok(`manifest: ${m.name} · tema ${m.theme_color}`);
      for (const icone of (m.icons || [])) {
        const r = await pegar(new URL(icone.src, BASE).pathname);
        if (r.st === 200) ok(`ícone ${icone.sizes} presente`);
        else bloqueio(`ícone ${icone.src} devolveu ${r.st}`);
      }
    } else bloqueio('manifest.webmanifest indisponível');
    const sw = await pegar('/closet/sw.js');
    if (sw.st === 200) ok('service worker servido'); else bloqueio('sw.js indisponível');
  } catch (e) { bloqueio('falha no PWA: ' + e.message); }

  // ---- 5. API pública ----
  console.log('\nAPI pública');
  try {
    const doc = await pegar('/closet/api/v1');
    if (doc.st === 200) ok(`documentação da API aberta (${JSON.parse(doc.texto).endpoints.length} endpoints)`);
    else bloqueio('/closet/api/v1 indisponível');
    const semChave = await pegar('/closet/api/v1/pecas');
    if (semChave.st === 401) ok('API exige chave (401 sem x-api-key)');
    else bloqueio(`API respondeu ${semChave.st} sem chave — deveria ser 401`);
  } catch (e) { bloqueio('falha na API: ' + e.message); }

  // ---- 6. vitrine com acervo ----
  console.log('\nAcervo');
  try {
    const n = await pegar('/closet/api/numeros');
    const d = JSON.parse(n.texto);
    console.log(`     ${d.pecas} peça(s) · ${d.looks} look(s) · ${d.cidades} cidade(s) · ${d.alugueis} locação(ões)`);
    if (d.pecas >= 50) ok(`${d.pecas} peças na vitrine`);
    else if (d.pecas > 0) aviso(`só ${d.pecas} peça(s) publicadas — a meta de lançamento é ~50`);
    else bloqueio('vitrine vazia: a IA e a busca não têm o que devolver');
    if (d.comissao_pct > 0) ok(`comissão configurada em ${d.comissao_pct}%`);
    else bloqueio('comissão está em 0% — receita zerada');
  } catch (e) { bloqueio('falha ao ler /closet/api/numeros: ' + e.message); }

  // ---- 7. o que depende de configuração externa ----
  console.log('\nConfiguração de ambiente (informativo — não dá para checar de fora)');
  const env = [
    ['MP_ACCESS_TOKEN', 'sem ele o Pix não é gerado e o admin confirma pagamento na mão'],
    ['CLOSET_S3_BUCKET', 'sem bucket, as fotos ficam no disco de 1GB compartilhado do Render'],
    ['CLOSET_BASE_URL', 'sem ela, canonical/sitemap/e-mail apontam para o domínio padrão'],
    ['ANTHROPIC_API_KEY', 'sem ela a IA roda no motor de regras'],
    ['CLOSET_PIX_AUTO', 'off = a fila de repasses é enviada manualmente'],
  ];
  for (const [chave, efeito] of env) {
    if (process.env[chave]) ok(`${chave} definida neste ambiente`);
    else aviso(`${chave} ausente aqui — ${efeito}`);
  }

  // ---- fechamento ----
  console.log(`\n${oks.length} OK · ${avisos.length} aviso(s) · ${bloqueios.length} bloqueio(s)`);
  if (bloqueios.length) {
    console.log('\nBLOQUEIA O LANÇAMENTO:');
    bloqueios.forEach((b) => console.log('  ✗', b));
    process.exit(1);
  }
  if (avisos.length) {
    console.log('\nDecisão do Augusto (não bloqueia):');
    avisos.forEach((a) => console.log('  •', a));
  }
  console.log('\nNenhum bloqueio técnico encontrado.');
}

rodar().catch((e) => { console.error('erro fatal:', e.message); process.exit(1); });
