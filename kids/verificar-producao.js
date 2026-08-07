// =====================================================================
// Villela Kids — verificação de PRODUÇÃO (onda 5).
//
//   node kids/verificar-producao.js [https://kids.villelastay.com.br]
//   npm run verificar:kids
//
// Confere de fora o que só dá para saber com o site no ar: domínio,
// páginas, SEO, PWA, API protegida, push e a tarja MINUTA. Não escreve
// nada e não precisa de credencial — é seguro rodar sempre.
// Sai com código 1 se algo BLOQUEIA; avisos amarelos são decisão do Augusto.
// =====================================================================
'use strict';

const BASE = (process.argv[2] || process.env.KIDS_BASE_URL || 'https://kids.villelastay.com.br').replace(/\/+$/, '');
const bloqueios = [];
const avisos = [];
const oks = [];

const ok = (m) => { oks.push(m); console.log('  ✅', m); };
const aviso = (m) => { avisos.push(m); console.log('  ⚠️ ', m); };
const bloqueio = (m) => { bloqueios.push(m); console.log('  ❌', m); };

async function pegar(caminho, { metodo = 'GET' } = {}) {
  const r = await fetch(BASE + caminho, { method: metodo, redirect: 'manual' });
  const texto = r.status < 400 || r.status === 404 ? await r.text() : '';
  return { st: r.status, texto, headers: r.headers };
}

async function rodar() {
  console.log(`Villela Kids — verificação de produção\nAlvo: ${BASE}\n`);

  // ---- 1. páginas públicas ----
  console.log('Páginas públicas');
  for (const p of ['/kids', '/kids/entrar', '/kids/termos', '/kids/privacidade', '/kids/app',
    '/kids/ajuda', '/kids/ajuda/manual', '/kids/ajuda/faq']) {
    try {
      const r = await pegar(p);
      if (r.st === 200) ok(`${p} responde 200`);
      else bloqueio(`${p} devolveu ${r.st}`);
    } catch (e) { bloqueio(`${p} inacessível: ${e.message}`); }
  }

  // ---- 2. domínio e transporte ----
  console.log('\nDomínio e transporte');
  if (BASE.startsWith('https://')) ok('servindo por HTTPS');
  else bloqueio('sem HTTPS — dados de família não podem trafegar assim');
  if (/localhost|127\.0\.0\.1/.test(BASE)) aviso('alvo é local: isto não valida o domínio de produção');
  try {
    const raiz = await fetch(BASE + '/', { redirect: 'manual' });
    const alvo = raiz.headers.get('location') || '';
    if (raiz.status === 302 && alvo.includes('/kids')) ok('raiz do subdomínio redireciona para /kids');
    else aviso(`raiz respondeu ${raiz.status} → ${alvo || '(sem location)'} — esperado 302 para /kids`);
  } catch (e) { aviso('não deu para checar o redirect da raiz: ' + e.message); }

  // ---- 3. SEO ----
  console.log('\nSEO');
  try {
    const home = await pegar('/kids');
    if (/<title>[^<]{10,}/.test(home.texto)) ok('title preenchido na home');
    else bloqueio('home sem <title> adequado');
    if (/name="description" content="[^"]{50,}/.test(home.texto)) ok('meta description na home');
    else aviso('home sem meta description longa o bastante');
    if (/rel="canonical"/.test(home.texto)) ok('canonical na home');
    else aviso('home sem canonical');

    const robots = await pegar('/kids/robots.txt');
    if (robots.st === 200 && robots.texto.includes('Sitemap:')) ok('robots.txt aponta o sitemap');
    else bloqueio('robots.txt ausente ou sem Sitemap');
    if (robots.texto.includes('Disallow: /kids/app') && robots.texto.includes('Disallow: /kids/api')) {
      ok('robots bloqueia app e API');
    } else bloqueio('robots NÃO bloqueia /kids/app ou /kids/api');

    const sitemap = await pegar('/kids/sitemap.xml');
    const urls = (sitemap.texto.match(/<url>/g) || []).length;
    if (sitemap.st === 200 && urls > 0) ok(`sitemap com ${urls} URL(s)`);
    else bloqueio('sitemap.xml vazio ou indisponível');
  } catch (e) { bloqueio('falha ao checar SEO: ' + e.message); }

  // ---- 4. jurídico (fase beta = tarja MINUTA presente) ----
  console.log('\nJurídico');
  try {
    const termos = await pegar('/kids/termos');
    const priv = await pegar('/kids/privacidade');
    if (termos.texto.includes('MINUTA') && priv.texto.includes('MINUTA')) {
      ok('tarja MINUTA presente (correto na fase beta, antes do advogado)');
    } else {
      aviso('tarja MINUTA ausente — só remova depois do parecer do advogado (LGPD art. 14)');
    }
    if (priv.texto.includes('art. 14')) ok('política cita o art. 14 (dados de criança)');
    else aviso('política sem citação ao art. 14 da LGPD');
  } catch (e) { bloqueio('falha ao checar jurídico: ' + e.message); }

  // ---- 5. PWA ----
  console.log('\nPWA');
  try {
    const man = await pegar('/kids/manifest.webmanifest');
    if (man.st === 200) {
      const m = JSON.parse(man.texto);
      ok(`manifest: ${m.name} · tema ${m.theme_color}`);
      for (const icone of (m.icons || [])) {
        const r = await pegar(new URL(icone.src, BASE).pathname);
        if (r.st === 200) ok(`ícone ${icone.sizes} presente`);
        else bloqueio(`ícone ${icone.src} devolveu ${r.st}`);
      }
    } else bloqueio('manifest.webmanifest indisponível');
    const sw = await pegar('/kids/sw.js');
    if (sw.st === 200 && sw.texto.includes("addEventListener('push'")) ok('service worker com push servido');
    else bloqueio('sw.js indisponível ou sem handler de push');
  } catch (e) { bloqueio('falha no PWA: ' + e.message); }

  // ---- 6. API protegida e push ----
  console.log('\nAPI e push');
  try {
    for (const p of ['/kids/api/me', '/kids/api/criancas', '/kids/api/painel']) {
      const r = await pegar(p);
      if (r.st === 401) ok(`${p} exige sessão (401)`);
      else bloqueio(`${p} respondeu ${r.st} sem sessão — deveria ser 401`);
    }
    const ch = await pegar('/kids/api/push/chave');
    const d = JSON.parse(ch.texto || '{}');
    if (d.disponivel) ok('push configurado (VAPID presente)');
    else aviso('push indisponível — VAPID_PUBLIC/PRIVATE_KEY ausentes no ambiente do servidor');
    const est = JSON.parse((await pegar('/kids/api/estudio/estado')).texto || '{}');
    if (est.disponivel) ok('Estúdio de Ilustração com IA ligado no servidor');
    else aviso('Estúdio de Ilustração em modo papel — KIDS_IMAGENS_CHAVE ausente no servidor');
  } catch (e) { bloqueio('falha na API: ' + e.message); }

  // ---- 7. configuração de ambiente (informativo) ----
  console.log('\nConfiguração de ambiente (informativo — não dá para checar de fora)');
  const env = [
    ['ANTHROPIC_API_KEY', 'sem ela o tutor roda no modo simples (fallbacks do roteiro)'],
    ['VAPID_PUBLIC_KEY', 'sem ela não há push para os responsáveis'],
    ['KIDS_IMAGENS_CHAVE', 'sem ela o Estúdio de Ilustração fica no modo papel (desenho à mão)'],
    ['KIDS_SEED', 'se estiver "on" em produção, a família demo será criada no banco vazio — normalmente indesejado'],
  ];
  for (const [chave, efeito] of env) {
    if (process.env[chave]) ok(`${chave} definida neste ambiente`);
    else aviso(`${chave} ausente aqui — ${efeito}`);
  }

  // ---- fechamento ----
  console.log(`\n${oks.length} OK · ${avisos.length} aviso(s) · ${bloqueios.length} bloqueio(s)`);
  if (bloqueios.length) {
    console.log('\nBLOQUEIA:');
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
