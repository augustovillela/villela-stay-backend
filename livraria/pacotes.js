// Pacotes (combos de vários livros) da Livraria Villela.
//
// Um pacote NÃO é um produto no banco: é uma composição declarada aqui que, no
// checkout, se expande nos livros que a compõem. Isso reaproveita tudo o que já
// existe — entrega de PDF por item, fluxo de impressão por item, e o campo
// `desconto` do pedido — sem tabela nova e sem mexer no schema.
//
// O PREÇO É DERIVADO, não fixo: `desconto_pct` incide sobre a soma dos preços
// atuais dos livros. Se um livro mudar de preço, o pacote acompanha sozinho, em
// vez de ficar desatualizado em silêncio.
//
// DEDUPLICAÇÃO (decisão do Augusto, 24/08/2026): comprando dois pacotes que
// compartilham um título, o carrinho resolve para a UNIÃO dos livros distintos e
// o desconto incide sobre essa união. Ninguém paga duas vezes pelo mesmo livro
// nem recebe dois exemplares.
//
//   Combo Claude   430,00 −15% = 365,50
//   Combo ChatGPT  344,00 −15% = 292,40
//   os dois juntos: união 625,00 −15% = 531,25  (e não 657,90)

'use strict';

const PACOTES = [
  {
    slug: 'combo-claude',
    titulo: 'Combo Claude AI',
    chamada: 'Os quatro livros de Claude, impressos, com o PDF de cada um.',
    desconto_pct: 15,
    capa_url: '/assets/livros/claude-ai-na-pratica.jpg',
    livros: [
      'claude-ai-na-pratica',
      'claude-ai-na-pratica-juridica',
      'claude-ai-para-advogados-guia-visual',
      'como-ser-superprodutivo-com-ia',
    ],
    // Os guias visuais aqui vão IMPRESSOS. Quem compra o Jurídico avulso ganha o
    // guia visual só em PDF, como bônus (BONUS_LIVROS em fluxo.js) — no pacote
    // ele vem em papel, colorido. Decisão do Augusto de 24/08/2026: manter os
    // guias no pacote e explicar a diferença na página.
    nota: 'Os guias visuais deste pacote vão <strong>impressos</strong>, coloridos. '
        + 'Quem compra o Jurídico avulso recebe o guia visual apenas em PDF, como bônus.',
  },
  {
    slug: 'combo-chatgpt',
    titulo: 'Combo ChatGPT AI',
    chamada: 'Os três livros de ChatGPT e produtividade, impressos, com o PDF de cada um.',
    desconto_pct: 15,
    capa_url: '/assets/livros/chatgpt-ai-na-pratica.jpg',
    livros: [
      'chatgpt-ai-na-pratica',
      'chatgpt-ai-na-pratica-guia-visual',
      'como-ser-superprodutivo-com-ia',
    ],
    nota: 'Os guias visuais deste pacote vão <strong>impressos</strong>, coloridos. '
        + 'Quem compra o ChatGPT AI na Prática avulso recebe o guia visual apenas em PDF, como bônus.',
  },
];

const porSlug = (slug) => PACOTES.find(p => p.slug === String(slug || '').trim()) || null;

// Preço de compra de cada livro dentro de um pacote. Hoje todo título vende como
// "combo PDF + impresso"; se um livro não tiver esse preço, cai para o impresso e
// depois para o PDF, para o pacote nunca quebrar por causa de um preço ausente.
function precoDe(b) {
  return b.preco_combo != null ? b.preco_combo
    : b.preco_impresso != null ? b.preco_impresso
    : b.preco_pdf;
}

function tipoDe(b) {
  return b.preco_combo != null ? 'combo' : b.preco_impresso != null ? 'impresso' : 'pdf';
}

/** Resolve um pacote em livros do banco. Ignora título inativo ou inexistente. */
function livrosDe(repo, pacote) {
  return (pacote.livros || [])
    .map(s => repo.Books.porSlug(s))
    .filter(b => b && b.ativo && precoDe(b) != null);
}

/** Resumo para exibir na vitrine e na página do pacote. */
function resumo(repo, pacote) {
  const livros = livrosDe(repo, pacote);
  const soma = livros.reduce((t, b) => t + precoDe(b), 0);
  const desconto = Math.round(soma * pacote.desconto_pct / 100);
  return { ...pacote, livros, soma, desconto, preco: soma - desconto, completo: livros.length === (pacote.livros || []).length };
}

function listar(repo) {
  return PACOTES.map(p => resumo(repo, p)).filter(p => p.livros.length > 1);
}

/**
 * Expande os pacotes escolhidos em itens de pedido, unindo com os itens avulsos.
 *
 * A união é por book_id: um título que apareça em dois pacotes (ou num pacote e
 * também avulso) entra UMA vez só. O desconto incide sobre a soma dos livros que
 * vieram de pacote — nunca sobre os avulsos.
 *
 * Devolve { items, desconto, rotulo } prontos para Orders.criar.
 */
function expandir(repo, { pacotes = [], items = [] } = {}) {
  const escolhidos = (pacotes || []).map(porSlug).filter(Boolean);
  if (!escolhidos.length) return { items, desconto: 0, rotulo: '' };

  const vistos = new Set();
  const doPacote = [];
  let somaPacote = 0;
  let pct = 0;

  for (const p of escolhidos) {
    pct = Math.max(pct, p.desconto_pct);
    for (const b of livrosDe(repo, p)) {
      if (vistos.has(b.id)) continue;            // <- deduplicação
      vistos.add(b.id);
      somaPacote += precoDe(b);
      doPacote.push({ book_id: b.id, tipo: tipoDe(b), quantidade: 1 });
    }
  }

  // avulsos que já vieram no pacote não são cobrados de novo
  const avulsos = (items || []).filter(it => it && it.book_id && !vistos.has(it.book_id));

  return {
    items: doPacote.concat(avulsos),
    desconto: Math.round(somaPacote * pct / 100),
    rotulo: escolhidos.map(p => p.titulo).join(' + '),
  };
}

module.exports = { PACOTES, porSlug, listar, resumo, expandir, precoDe, tipoDe, livrosDe };
