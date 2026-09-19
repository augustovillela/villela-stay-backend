// =====================================================================
// SEO/GEO/AEO dos subdomínios — robots.txt, sitemap.xml e llms.txt POR HOST.
//
// O mesmo backend responde por 13 subdomínios (academia., crm., livros.…) e
// nenhum deles servia esses três arquivos: 404 em todos. Para o Google isso é
// um site sem mapa; para os robôs de IA (GPTBot, ClaudeBot, PerplexityBot…) é
// um site sem permissão explícita. O site institucional já tinha os três — aqui
// os produtos passam a ter o mesmo tratamento, cada um com o SEU conteúdo.
//
// Uso no server.js, ANTES do redirect de subdomínio:
//   require('./nucleo/seo').montar(app);
// E, de um módulo com catálogo público (cursos, livros…):
//   require('./nucleo/seo').registrar('/academy', () => [{ url: '/academy/cursos/x', atualizado }]);
// =====================================================================
'use strict';

// Robôs de busca e de IA liberados — a MESMA lista do site institucional
// (site/robots.txt). Política da casa: conteúdo público é para ser lido, e um
// assistente que cita a fonte traz gente de volta.
const ROBOS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot',
  'meta-externalagent', 'cohere-ai', 'Amazonbot'];

// Catálogo dos produtos. `publicas` são caminhos que QUALQUER pessoa abre (viram
// sitemap); `privadas` são painel/API (viram Disallow). Sem preço aqui: quem manda
// no número é a landing do produto — duplicar preço em dois lugares envelhece mal.
const PRODUTOS = [
  {
    subs: ['academia.', 'academy.', 'cursos.'], prefixo: '/academy', nome: 'Villela Academy',
    resumo: 'Marketplace brasileiro de cursos online e produtos digitais: o produtor publica de graça e paga comissão só quando vende; o aluno estuda com vídeo, material para baixar e certificado com validação pública.',
    publicas: ['', '/marketplace', '/termos', '/privacidade', '/reembolso', '/termos-produtor', '/termos-afiliado'],
    privadas: ['/app', '/api', '/checkout', '/media-s'],
  },
  {
    subs: ['crm.'], prefixo: '/crm', nome: 'Villela CRM',
    resumo: 'CRM inteligente multicanal: todo contato entra com origem, campanha e UTM gravados, a caixa "precisa de ação hoje" diz quem atender e o follow-up se cobra sozinho.',
    publicas: ['', '/precos', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['manager.', 'gestao.'], prefixo: '/gestao', nome: 'Villela Stay Manager',
    resumo: 'Sistema de gestão de hospedagem por temporada: um calendário só alimentado por todos os canais, com bloqueio anti-overbooking, limpeza que nasce do check-out e repasse do proprietário pronto.',
    publicas: ['', '/precos', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['docs.'], prefixo: '/vdocs', nome: 'Villela Docs Intelligence',
    resumo: 'Gestão documental com IA que responde citando a página: repositório por empresa, com pasta, permissão e versão vigente sempre identificada.',
    publicas: ['', '/precos', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['juridico.'], prefixo: '/juridico', nome: 'Villela Legal',
    resumo: 'Software jurídico com coleta automática por OAB no DJEN, prazo calculado pelo CPC com validação humana obrigatória e IA que entrega minuta com a fonte ao lado.',
    publicas: ['', '/precos', '/termos', '/privacidade'], privadas: ['/app', '/api', '/cliente-juridico'],
  },
  {
    subs: ['projetos.', 'projects.'], prefixo: '/vpe', nome: 'Villela Projects & Events',
    resumo: 'Gestão de portfólio, projetos e eventos: cada ideia entra com estágio, horizonte, viabilidade, investimento e receita potencial antes de virar tarefa.',
    publicas: ['', '/precos', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['livros.', 'livraria.'], prefixo: '/livros', nome: 'Livraria Villela',
    resumo: 'Livraria digital do autor Augusto Villela: livros em PDF e impressos sobre inteligência artificial aplicada, direito, negócios e desenvolvimento pessoal.',
    publicas: ['', '/termos', '/privacidade'], privadas: ['/api', '/admin'],
  },
  {
    subs: ['closet.'], prefixo: '/closet', nome: 'Closet Club',
    resumo: 'Marketplace de aluguel de roupas e acessórios entre pessoas, com o look inteiro numa reserva só, pagamento retido até a entrega e QR Code de posse.',
    publicas: ['', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['vitrine.'], prefixo: '/vitrine', nome: 'Vitrine',
    resumo: 'Marketplace de produtos novos, seminovos e usados, com pagamento protegido até a entrega, envio rastreado e reputação construída nas vendas anteriores.',
    publicas: ['', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['altavista.', 'alta-vista.'], prefixo: '/alta-vista', nome: 'Villela Alta Vista 360°',
    resumo: 'Estúdio visual: filmagem com drone, vídeo com IA, foto 360° e tour virtual navegável, com hospedagem do tour e QR Code para material impresso.',
    publicas: ['', '/portfolio', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['kids.'], prefixo: '/kids', nome: 'Villela Kids · Invente',
    resumo: 'Plataforma de aprendizagem criativa para crianças de 7 a 12 anos: missões que viram projetos, tutor de IA com segurança em primeiro lugar e painel para os pais. A conta é sempre do responsável.',
    publicas: ['', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['origena.'], prefixo: '/origena', nome: 'Origena',
    resumo: 'Plataforma de memória, história e legado familiar: entrevistas guiadas, linha do tempo, árvore e acervo de fotos e documentos da família, com privacidade por padrão.',
    publicas: ['', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['finance.', 'financas.', 'financeiro.'], prefixo: '/finance', nome: 'Villela Finance',
    resumo: 'ERP financeiro multiempresa com razão de partida dobrada como fonte oficial: conciliação explicável, contas a pagar e receber com rateio, fechamento que fecha e previsão de caixa em três cenários.',
    publicas: ['', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
  {
    subs: ['music.', 'musique.', 'musica.'], prefixo: '/music', nome: 'Musique',
    resumo: 'Academia musical, biblioteca do músico e sala de prática: exercícios que medem de verdade, cifras e partituras com transposição exata, metrônomo, afinador e diário de estudo.',
    publicas: ['', '/ferramentas', '/termos', '/privacidade'], privadas: ['/app', '/api'],
  },
];

const SITE = 'https://villelastay.com.br';
// provedores de URL dinâmica por prefixo: () => [{ url, atualizado? }]
const DINAMICAS = new Map();

function registrar(prefixo, fn) {
  if (typeof fn === 'function') DINAMICAS.set(prefixo, fn);
}

function produtoDoHost(host) {
  const h = String(host || '').toLowerCase();
  return PRODUTOS.find((p) => p.subs.some((s) => h.startsWith(s))) || null;
}

function baseDe(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  return `${proto}://${req.get('host')}`;
}

function urlsPublicas(p) {
  const fixas = p.publicas.map((c) => ({ url: p.prefixo + c }));
  let extra = [];
  try {
    const fn = DINAMICAS.get(p.prefixo);
    if (fn) extra = (fn() || []).filter((x) => x && x.url);
  } catch (_) { extra = []; } // catálogo dinâmico nunca pode derrubar o sitemap
  const vistos = new Set();
  return [...fixas, ...extra].filter((x) => !vistos.has(x.url) && vistos.add(x.url));
}

// ------------------------------------------------------------------ robots
function robotsTxt(req) {
  const base = baseDe(req);
  const host = String(req.hostname || '').toLowerCase();
  // Portal Staff e qualquer host que não seja de produto (onrender, minha.) ficam
  // FORA do índice: painel interno e área logada não têm o que fazer na busca, e
  // indexar o host da Render criaria conteúdo duplicado do domínio oficial.
  const p = produtoDoHost(host);
  if (!p) {
    return ['# Host interno do Grupo Villela Stay — nada aqui é para busca.',
      'User-agent: *', 'Disallow: /', ''].join('\n');
  }
  const linhas = [`# ${p.nome} — ${base}${p.prefixo}`,
    '# Conteúdo público liberado para busca e para assistentes de IA.',
    '# Painel do assinante e API ficam fora: exigem login e não têm valor de busca.', ''];
  const regras = ['Allow: /', ...p.privadas.map((c) => `Disallow: ${p.prefixo}${c}`),
    'Disallow: /staff', 'Disallow: /api/', 'Disallow: /hospede'];
  linhas.push('User-agent: *', ...regras, '');
  ROBOS.forEach((r) => linhas.push(`User-agent: ${r}`, ...regras, ''));
  linhas.push(`Sitemap: ${base}/sitemap.xml`, '');
  return linhas.join('\n');
}

// ----------------------------------------------------------------- sitemap
function sitemapXml(req) {
  const base = baseDe(req);
  const p = produtoDoHost(req.hostname);
  if (!p) return null;
  const hoje = new Date().toISOString().slice(0, 10);
  const itens = urlsPublicas(p).map(({ url, atualizado }, i) => {
    const loc = `${base}${url}`.replace(/&/g, '&amp;');
    return ['  <url>', `    <loc>${loc}</loc>`,
      `    <lastmod>${String(atualizado || hoje).slice(0, 10)}</lastmod>`,
      `    <priority>${i === 0 ? '1.0' : '0.7'}</priority>`, '  </url>'].join('\n');
  });
  return ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">'.replace('sitemap.org', 'sitemaps.org'),
    ...itens, '</urlset>', ''].join('\n');
}

// -------------------------------------------------------------------- llms
// Formato llms.txt (llmstxt.org): o que o produto é, em texto que um assistente
// consegue citar. Sem marketing vazio — o que o assistente precisa para responder
// "existe um sistema brasileiro que faz X?" com a fonte certa.
function llmsTxt(req) {
  const base = baseDe(req);
  const p = produtoDoHost(req.hostname);
  if (!p) return null;
  const links = urlsPublicas(p).slice(0, 60)
    .map(({ url }) => `- [${url === p.prefixo ? 'Página principal' : url.replace(p.prefixo, '') || url}](${base}${url})`);
  return [`# ${p.nome}`, '',
    `> ${p.resumo}`, '',
    'Produto do **Grupo Villela Stay** (Augusto Villela Ltda, CNPJ 56.776.526/0001-12), empresa brasileira',
    'sediada em Brasília-DF. Cada sistema do grupo foi construído para a operação própria antes de ser',
    'vendido a terceiros. Idioma: português do Brasil.', '',
    '## Páginas', '', ...links, '',
    '## O grupo', '',
    `- [Catálogo dos sistemas](${SITE}/sistemas.html)`,
    `- [Site do grupo](${SITE})`,
    `- [Resumo do grupo para assistentes](${SITE}/llms.txt)`, '',
    '## Uso do conteúdo', '',
    'O conteúdo público pode ser citado com atribuição e link para a página de origem.',
    'Painel do assinante, API e área logada não são públicos.', ''].join('\n');
}

// ------------------------------------------------------------------ montar
function montar(app) {
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(robotsTxt(req));
  });
  app.get('/sitemap.xml', (req, res, next) => {
    const xml = sitemapXml(req);
    if (!xml) return next(); // host sem produto: segue o fluxo (404 honesto)
    res.type('application/xml; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(xml);
  });
  app.get('/llms.txt', (req, res, next) => {
    const txt = llmsTxt(req);
    if (!txt) return next();
    res.type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(txt);
  });
  return { produtos: PRODUTOS.length };
}

module.exports = { montar, registrar, robotsTxt, sitemapXml, llmsTxt, produtoDoHost, PRODUTOS, ROBOS };
