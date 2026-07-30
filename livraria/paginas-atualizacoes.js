// =====================================================================
// Livraria Villela — página de atualizações dos livros (/livros/atualizacoes)
// Endereço impresso na última página dos livros ("confira as atualizações").
// Para publicar uma atualização: acrescente um item em ATUALIZACOES (mais
// recente primeiro) e atualize REVISADO_EM. Lista vazia = aviso de que ainda
// não há atualização. Nada aqui vem do banco — é conteúdo editorial versionado.
// =====================================================================
'use strict';
const { pagina, esc, waLink } = require('./storefront');

const REVISADO_EM = '30/07/2026';
const CONTATO = 'augusto.villela@gmail.com';

// Formato de cada item:
// { data: '29/07/2026', livro: 'Claude AI na Prática Jurídica', slug: 'claude-ai-na-pratica-juridica',
//   edicao: '1ª edição', titulo: 'O que mudou', descricao: 'Detalhe da correção/complemento.' }
// `slug` e `edicao` são opcionais (slug vira link para a página do livro).
const ATUALIZACOES = [
  {
    data: '30/07/2026', livro: 'Claude AI na Prática Jurídica', slug: 'claude-ai-na-pratica-juridica',
    edicao: '1ª edição',
    titulo: 'Resolução CNJ 615/2025 foi alterada pela Resolução CNJ 674/2026',
    descricao: 'Capítulos 6 e 42. A Resolução CNJ nº 615/2025, que estabelece a política de uso de '
      + 'inteligência artificial no Poder Judiciário, continua em vigor (publicada em 14/03/2025, vigente desde '
      + '14/07/2025, tendo revogado a Resolução nº 332/2020). Ela foi alterada pela Resolução CNJ nº 674, de '
      + '25/03/2026, publicada e vigente desde 26/03/2026. A alteração atingiu apenas o art. 15, que trata da '
      + 'composição do Comitê Nacional de Inteligência Artificial do Judiciário — os deveres substantivos '
      + 'discutidos no livro (supervisão humana, transparência e classificação de risco) seguem inalterados. '
      + 'Se você cita a resolução em peça ou parecer, cite-a "com a redação da Resolução CNJ nº 674/2026".',
  },
  {
    data: '30/07/2026', livro: 'Claude AI na Prática Jurídica', slug: 'claude-ai-na-pratica-juridica',
    edicao: '1ª edição',
    titulo: 'A norma da OAB sobre IA é uma RECOMENDAÇÃO, não um provimento — e ela exige avisar o cliente',
    descricao: 'Capítulo 6. Até esta revisão, a OAB não editou provimento sobre inteligência artificial. '
      + 'O documento aplicável é a Recomendação nº 001/2024 do Conselho Federal da OAB, assinada em 11/11/2024, '
      + 'organizada em quatro pilares: legislação aplicável, confidencialidade e privacidade, prática jurídica '
      + 'ética e comunicação sobre o uso de IA generativa. Vale registrar uma obrigação concreta que costuma '
      + 'passar batida e que merece entrar na sua política interna: antes de começar a usar IA na prestação do '
      + 'serviço, o advogado formaliza essa intenção ao cliente, informando a finalidade do uso na defesa dos '
      + 'direitos dele, os benefícios e as limitações da tecnologia naquele caso, os riscos envolvidos '
      + '(imprecisão do conteúdo gerado e exposição de dados) e as medidas de segurança e confidencialidade '
      + 'adotadas. Em junho de 2026 a OAB lançou ainda um plano nacional para orientar o uso de IA na advocacia, '
      + 'que distribui ações e prazos pelas seccionais — acompanhe o que a sua seccional publicar.',
  },
  {
    data: '30/07/2026', livro: 'Claude AI na Prática Jurídica', slug: 'claude-ai-na-pratica-juridica',
    edicao: '1ª edição',
    titulo: 'Correção: a OAB não fixa prazo de guarda de documentos do cliente',
    descricao: 'Capítulos 8.8 e 35.11 (tabela de temporalidade). Ao montar a sua tabela, não procure na OAB um '
      + 'prazo de guarda: ele não existe. O que existe é o dever de DEVOLVER. O art. 12 do Código de Ética e '
      + 'Disciplina (Resolução CFOAB 02/2015) determina que a conclusão ou a desistência da causa obriga o '
      + 'advogado a devolver ao cliente os bens, valores e documentos que lhe foram confiados e a prestar contas '
      + 'pormenorizadamente. E o art. 34, XXII, do Estatuto (Lei 8.906/94) trata como infração disciplinar reter '
      + 'abusivamente ou extraviar autos recebidos com vista ou em confiança — atenção ao inciso: é o XXII, e '
      + 'não o XXI, que cuida de recusa de prestar contas. Consequência prática: todo prazo que você colocar na '
      + 'tabela de temporalidade é uma âncora deduzida da prescrição aplicável (art. 205 do Código Civil para a '
      + 'prestação de contas; arts. 173 e 174 do CTN para documentos fiscais) e deve estar rotulado como tal, '
      + 'com a base escrita ao lado. Não apresente âncora prática como se fosse prazo normativo.',
  },
  {
    data: '30/07/2026', livro: 'Claude AI na Prática Jurídica', slug: 'claude-ai-na-pratica-juridica',
    edicao: '1ª edição',
    titulo: 'Conferência de vigência: Provimento 205/2021 segue em vigor',
    descricao: 'Capítulos 13 e 14 (marketing jurídico). Conferido na fonte oficial nesta data: o Provimento nº '
      + '205/2021 do Conselho Federal da OAB continua em vigor, sem revogação nem alteração posterior, e foi ele '
      + 'que revogou o antigo Provimento 94/2000 (art. 12). Para quem for montar o checklist de conformidade do '
      + 'Capítulo 13.10, estes são os dispositivos que sustentam cada item: art. 3º, I (veda referência a valores '
      + 'de honorários, forma de pagamento, gratuidade ou descontos); art. 3º, IV (veda orações e expressões '
      + 'persuasivas); art. 4º, § 2º (veda menção a decisões judiciais e resultados); art. 4º, § 5º (veda '
      + 'ferramenta que influa de forma fraudulenta no alcance); art. 5º, § 1º (veda pagar por aparição em '
      + 'rankings e premiações); art. 6º e parágrafo único (vedam promessa de resultados e uso de casos '
      + 'concretos). Normas mudam: refaça essa conferência antes de aprovar campanha.',
  },
];

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
