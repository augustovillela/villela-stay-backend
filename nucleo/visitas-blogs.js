// =====================================================================
// Núcleo · Visitas por blog — responde "os blogs estão trazendo leitor?".
//
// Conta, a partir das mesmas linhas de nucleo/visitas.js, cada série do blog
// do site (hub /<serie>/ + aulas em /blog/<serie>-NN-...), os artigos avulsos
// e a página /blog.html. EN e ES somam no mesmo item do português.
//
// Série nova aparece sozinha pelo endereço das aulas; SERIES só dá o nome
// bonito e garante que série SEM visita apareça com zero.
// =====================================================================
'use strict';

const SERIES = {
  'claude': 'Claude AI na Prática',
  'claude-juridico': 'Claude AI na Prática Jurídica',
  'chatgpt': 'ChatGPT AI na Prática',
  'locador': 'O Locador Inteligente',
  'conexoes-de-sucesso': 'Conexões de Sucesso',
  'segunda-onda-da-ia': 'A Segunda Onda da IA',
  'google-ai': 'Google AI na Prática',
  'homem-contemporaneo': 'O Homem Contemporâneo',
  'homem-essencial': 'O Homem Essencial',
  'piscineiro-na-pratica': 'Piscineiro na Prática',
  'paisagismo-na-pratica': 'Paisagismo na Prática',
  'pedreiro-completo-na-pratica': 'Pedreiro Completo na Prática',
  'construcao-com-conteineres-na-pratica': 'Construção com Contêineres na Prática',
  'decoracao-de-interiores-na-pratica': 'Decoração de Interiores na Prática',
  'horta-na-pratica': 'Horta na Prática',
};

const INTERNO = 'Interno (nosso site)';
const SEMANAS = 8;

const RE_AULA = /^\/blog\/([a-z0-9-]+?)-\d{2}-[a-z0-9-]+(\.html)?$/;
const RE_AVULSO = /^\/blog\/([a-z0-9-]+)(\.html)?$/;

/** Caminho sem idioma, sem "index.html" e em minúsculas. */
function limpar(pagina) {
  return String(pagina || '').toLowerCase()
    .replace(/^\/(en|es)(?=\/)/, '')
    .replace(/\/index\.html$/, '/');
}

/** De qual blog é a página? null = não é página de blog. */
function blogDe(pagina, series = SERIES) {
  const c = limpar(pagina);
  if (c === '/blog.html' || c === '/blog' || c === '/blog/') return { id: '_hub', tipo: 'hub' };
  const aula = c.match(RE_AULA);
  if (aula) return { id: aula[1], tipo: 'serie' };
  const raiz = c.split('/')[1] || '';
  if (Object.prototype.hasOwnProperty.call(series, raiz) && (c === '/' + raiz || c.startsWith('/' + raiz + '/'))) return { id: raiz, tipo: 'serie' };
  const avulso = c.match(RE_AVULSO);
  if (avulso) return { id: avulso[1], tipo: 'artigo' };
  return null;
}

const recuar = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const ordenar = (obj, limite) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limite).map(([k, n]) => ({ k, n }));
const delta = (agora, antes) => !antes ? (agora ? null : 0) : Math.round(((agora - antes) / antes) * 100);

/** Nomes dos artigos avulsos; sem o conteúdo do site no servidor, fica o slug. */
function nomesDosArtigos() {
  try { return Object.fromEntries(require('../site/content/blog').map(a => [a.slug, a.h1])); } catch { return {}; }
}

/**
 * hits: linhas já normalizadas e já filtradas de robô (se for o caso).
 * "De fora" = visita que não veio de outra página nossa: é a medida de
 * quanto o blog ATRAI, separada de quem só navega de uma aula para a outra.
 */
function resumoBlogs(hits, { dias, hoje }) {
  const de = recuar(hoje, dias - 1);
  const deAnterior = recuar(de, dias);
  const deSemanas = recuar(hoje, SEMANAS * 7 - 1);
  const nomes = nomesDosArtigos();

  const itens = {};
  const item = (id, tipo) => itens[tipo + ':' + id] = itens[tipo + ':' + id] || {
    id, tipo,
    nome: tipo === 'hub' ? 'Página do blog (/blog.html)' : (tipo === 'serie' ? SERIES[id] : nomes[id]) || id,
    visitas: 0, anterior: 0, deFora: 0, leitores: new Set(),
    semanas: new Array(SEMANAS).fill(0), origens: {}, paginas: {},
  };
  for (const id of Object.keys(SERIES)) item(id, 'serie');
  item('_hub', 'hub');

  const totalLeitores = new Set();
  for (const h of hits) {
    if ((h.produto || 'outro') !== 'site') continue;
    const dia = String(h._recebido || '').slice(0, 10);
    if (!dia || dia > hoje) continue;
    const b = blogDe(h.pagina);
    if (!b) continue;
    const x = item(b.id, b.tipo);

    if (dia >= deSemanas) {
      const atras = Math.floor((Date.parse(hoje) - Date.parse(dia)) / 86400000 / 7);
      x.semanas[SEMANAS - 1 - atras]++;
    }
    if (dia >= de) {
      x.visitas++;
      somar(x.paginas, limpar(h.pagina));
      if (h.vid) { x.leitores.add(dia + '|' + h.vid); totalLeitores.add(dia + '|' + h.vid); }
      if (h.canal !== INTERNO) { x.deFora++; somar(x.origens, h.canal || 'Direto'); }
    } else if (dia >= deAnterior) x.anterior++;
  }

  const blogs = Object.values(itens).map(x => ({
    id: x.id, tipo: x.tipo, nome: x.nome,
    visitas: x.visitas, anterior: x.anterior, delta: delta(x.visitas, x.anterior),
    leitores: x.leitores.size, deFora: x.deFora, semanas: x.semanas,
    origens: ordenar(x.origens, 8), paginas: ordenar(x.paginas, 10),
  })).sort((a, b) => (b.deFora - a.deFora) || (b.visitas - a.visitas) || a.nome.localeCompare(b.nome, 'pt-BR'));

  const soma = (campo) => blogs.reduce((s, x) => s + x[campo], 0);
  const visitas = soma('visitas'), anterior = soma('anterior');
  const origens = {};
  for (const x of Object.values(itens)) for (const [k, n] of Object.entries(x.origens)) somar(origens, k, n);

  return {
    periodo: { de, ate: hoje, dias },
    total: { visitas, anterior, delta: delta(visitas, anterior), leitores: totalLeitores.size, deFora: soma('deFora') },
    origens: ordenar(origens, 10),
    blogs,
  };
}

function somar(obj, chave, n = 1) { obj[chave] = (obj[chave] || 0) + n; }

module.exports = { SERIES, blogDe, resumoBlogs };
