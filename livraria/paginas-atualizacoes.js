// =====================================================================
// Livraria Villela — página de atualizações dos livros (/livros/atualizacoes)
// Endereço impresso na última página dos livros ("confira as atualizações").
// Para publicar uma atualização: acrescente um item em ATUALIZACOES (mais
// recente primeiro) e atualize REVISADO_EM. Lista vazia = aviso de que ainda
// não há atualização. Nada aqui vem do banco — é conteúdo editorial versionado.
// =====================================================================
'use strict';
const { pagina, esc, waLink } = require('./storefront');

const REVISADO_EM = '29/07/2026';
const CONTATO = 'augusto.villela@gmail.com';

// Formato de cada item:
// { data: '29/07/2026', livro: 'Claude AI na Prática Jurídica', slug: 'claude-ai-na-pratica-juridica',
//   edicao: '1ª edição', titulo: 'O que mudou', descricao: 'Detalhe da correção/complemento.' }
// `slug` e `edicao` são opcionais (slug vira link para a página do livro).
const ATUALIZACOES = [];

function item(a, i) {
  const id = 'atualizacao-' + (i + 1);
  const nomeLivro = a.slug ? `<a href="/livros/${esc(a.slug)}">${esc(a.livro)}</a>` : esc(a.livro);
  return `<article class="dep" id="${id}" style="margin-bottom:16px">
    <p class="eyebrow" style="color:var(--suave)">${esc(a.data)}${a.edicao ? ' · ' + esc(a.edicao) : ''}</p>
    <h3 style="margin:.1em 0 .3em">${esc(a.titulo)}</h3>
    <p class="muted" style="margin:0 0 8px">${nomeLivro}</p>
    <p style="margin:0">${esc(a.descricao)}</p>
  </article>`;
}

function atualizacoes() {
  const lista = ATUALIZACOES.length
    ? ATUALIZACOES.map(item).join('')
    : `<div class="aviso" style="font-size:16px"><strong>Nenhuma atualização disponível até o momento.</strong></div>
       <p class="muted">Assim que houver correção, complemento ou material novo de algum livro, a
       informação aparece nesta página com a data e o título a que se refere.</p>`;

  const body = `
  <section class="hero"><div class="wrap-sm">
    <p class="eyebrow">Livraria Villela</p>
    <h1>Atualizações dos livros</h1>
    <p class="sub">Correções, complementos e materiais novos publicados depois da impressão. Esta é a
    página indicada nos livros para você conferir se há algo novo para o seu exemplar.</p>
  </div></section>
  <section><div class="wrap-sm">
    ${lista}
    <p class="muted" style="margin-top:28px">Última verificação desta página: ${REVISADO_EM}.</p>
    <p class="muted">Encontrou um erro no livro ou quer sugerir um complemento? Escreva para
      <a href="mailto:${CONTATO}">${CONTATO}</a>, fale no
      <a href="${waLink('Olá! Quero falar sobre uma atualização de um livro da Livraria Villela.')}">WhatsApp</a>
      ou use o <a href="/suporte-livros">suporte</a>.</p>
    <p style="margin-top:22px"><a class="btn btn-ghost" href="/livros">Ver todos os livros</a></p>
  </div></section>`;

  return pagina({
    title: 'Atualizações dos livros — Livraria Villela',
    description: 'Correções, complementos e materiais novos dos livros publicados pela Livraria Villela.',
    path: '/livros/atualizacoes', body,
  });
}

module.exports = { atualizacoes, ATUALIZACOES };
