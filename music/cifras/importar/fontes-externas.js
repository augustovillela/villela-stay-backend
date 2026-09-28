// =====================================================================
// Musique Cifras — ADAPTADORES de fontes externas (busca ativa).
//
// Decisão ADR-0009 (resposta 2 do Augusto): buscar cifra em sites de
// terceiros. Cada site é um ADAPTADOR com a mesma interface:
//
//   { id, nome, dominio, confiabilidade,
//     candidatos({ titulo, artista }) → [{ url, titulo, artista }],
//     extrair(html, url) → { texto, titulo, artista, tom } }
//
// Regras que valem para TODOS (e moram fora deles, em rede.js):
// robots.txt, limite de taxa, tempo máximo, disjuntor e proteção SSRF.
// E a regra do pipeline: nenhuma fonte que falha derruba a busca — o
// erro volta NOMEADO por fonte, e a tela diz qual falhou.
//
// Os adaptadores montam a URL pelo padrão do site (slug de artista e
// música) em vez de raspar a página de busca: é uma requisição por
// fonte, não dezenas, e é o jeito menos invasivo de perguntar.
// Site que muda o HTML quebra o adaptador SEM derrubar os outros; o
// painel do staff mostra a taxa de falha por fonte.
// =====================================================================
'use strict';
const N = require('../motor/nota');
const { deHtml, tirarTags } = require('./extratores');

function slug(v) {
  return N.semAcento(String(v || '')).toLowerCase().replace(/&/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const cifraclub = {
  id: 'cifraclub', nome: 'Cifra Club', dominio: 'www.cifraclub.com.br', confiabilidade: 0.8,
  candidatos({ titulo, artista }) {
    if (!titulo || !artista) return [];
    return [{ url: `https://www.cifraclub.com.br/${slug(artista)}/${slug(titulo)}/`, titulo, artista }];
  },
  extrair(html) {
    const base = deHtml(html);
    const h1 = (String(html).match(/<h1[^>]*class=["'][^"']*t1[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
    const h2 = (String(html).match(/<h2[^>]*class=["'][^"']*t3[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i) || [])[1];
    const tom = (String(html).match(/id=["']cifra_tom["'][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) || [])[1];
    return { texto: base.texto, titulo: h1 ? tirarTags(h1).trim() : base.titulo, artista: h2 ? tirarTags(h2).trim() : '',
      tom: tom ? tom.trim() : '', metodo: base.metodo, confianca: base.confianca };
  },
};

const cifrascombr = {
  id: 'cifras.com.br', nome: 'Cifras.com.br', dominio: 'www.cifras.com.br', confiabilidade: 0.7,
  candidatos({ titulo, artista }) {
    if (!titulo || !artista) return [];
    return [{ url: `https://www.cifras.com.br/cifra/${slug(artista)}/${slug(titulo)}`, titulo, artista }];
  },
  extrair(html) {
    const base = deHtml(html);
    return { texto: base.texto, titulo: base.titulo.replace(/\s*[-|–]\s*Cifras.*$/i, ''), artista: '', tom: '', metodo: base.metodo, confianca: base.confianca };
  },
};

/** Genérico: qualquer URL pública colada pelo usuário. */
const generico = {
  id: 'url', nome: 'Página informada', dominio: '*', confiabilidade: 0.6,
  candidatos() { return []; },
  extrair(html) {
    const base = deHtml(html);
    const partes = String(base.titulo || '').split(/\s+[-|–—]\s+/);
    return { texto: base.texto, titulo: partes[0] || '', artista: partes[1] || '', tom: '', metodo: base.metodo, confianca: base.confianca };
  },
};

const ADAPTADORES = [cifraclub, cifrascombr];

/** Adaptador para uma URL: o do site, ou o genérico. */
function paraUrl(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return generico; }
  const semWww = host.replace(/^www\./, '');
  return ADAPTADORES.find((a) => a.dominio.replace(/^www\./, '') === semWww) || generico;
}

module.exports = { ADAPTADORES, generico, paraUrl, slug };
