// Artigo de blog — Gastronomia de Brasília
module.exports = {
  slug: 'gastronomia',
  tema: 'Gastronomia',
  emoji: '🍽️',
  titulo: 'Gastronomia de Brasília: onde comer e os sabores do Cerrado | Villela Stay',
  descricao: 'Da alta gastronomia da Asa Sul aos sabores do Cerrado — pequi, baru, buriti. O guia do anfitrião para comer bem em Brasília, com dicas de restaurantes e da cozinha candanga.',
  h1: 'Brasília se come com o Brasil inteiro no prato',
  dek: 'Uma cidade feita de migrantes de todos os estados criou uma cena gastronômica plural — e plantou raízes no Cerrado, o bioma mais saboroso e menos conhecido do país.',
  atualizado: '2026-06-17',
  leituraMin: 7,
  keywords: ['gastronomia brasília', 'onde comer em brasília', 'restaurantes brasília', 'culinária do cerrado', 'pequi baru buriti'],
  casas: ['GD03H', 'GG04I', 'GD01H'],
  casasTitulo: 'Cozinha gourmet para receber — ou só relaxar',
  casasTexto: 'Nossas casas têm cozinha completa e espaço para reunir gente à mesa. Receba um chef em casa, faça um jantar para o grupo ou simplesmente cozinhe com calma depois de um dia de feira. Hospitalidade também é sobre a mesa.',
  isca: {
    titulo: 'Guia de restaurantes do anfitrião (PDF)',
    texto: 'As mesas que indicamos para nossos hóspedes — do boteco lendário ao restaurante de ocasião, por bairro e por tipo de noite. Direto no seu e-mail.',
    botao: 'Quero o guia de restaurantes',
  },
  faq: [
    { q: 'Qual é a comida típica de Brasília?', a: 'Brasília não tem uma "comida típica" única — foi formada por migrantes de todo o Brasil, então reúne a culinária goiana (galinhada, pamonha, pequi), a mineira, a nordestina e a do próprio Cerrado. O pequi, o baru e o buriti são os ingredientes-assinatura da região.' },
    { q: 'O que é o pequi e como se come?', a: 'O pequi é um fruto do Cerrado de aroma intenso e sabor único, muito usado no arroz com pequi e na galinhada. Atenção famosa: nunca morda — o caroço tem espinhos finíssimos. Come-se raspando a polpa com os dentes, de leve. É uma experiência que todo visitante deveria provar ao menos uma vez.' },
    { q: 'Onde comer bem em Brasília?', a: 'A Asa Sul (especialmente as quadras 400 e a 200) concentra a alta gastronomia; o Pontão do Lago Sul tem restaurantes à beira d\'água; e a Asa Norte guarda botecos e casas autorais. Pedimos um guia atualizado por estação — solicite o PDF do anfitrião nesta página.' },
  ],
  relacionados: ['roteiros', 'arquitetura', 'paisagismo'],
  corpo: (h) => `
<p class="artigo-lead">Brasília é a única capital brasileira sem cozinha "nativa" — e é justamente isso que a torna deliciosa. Construída por gente que veio de Minas, de Goiás, do Nordeste, do Sul e do mundo, a cidade colocou tudo na mesma mesa. Aqui você janta um peixe amazônico, almoça uma galinhada goiana e fecha a noite num bistrô de inspiração francesa — às vezes na mesma quadra.</p>

${h.fig(1, { legenda: 'Arroz com pequi — o sabor-assinatura do Cerrado, intenso e inconfundível.' })}

<h2>Os sabores do Cerrado</h2>
<p>O bioma que cerca Brasília é uma despensa pouco explorada — e os chefs da cidade redescobriram isso. Vale provar:</p>
<ul class="artigo-lista">
  <li><strong>Pequi:</strong> aroma forte, sabor marcante, estrela do arroz com pequi e da galinhada. (Nunca morda o caroço!)</li>
  <li><strong>Baru:</strong> a castanha do Cerrado, crocante e nutritiva, que virou queridinha da alta gastronomia e da confeitaria.</li>
  <li><strong>Buriti:</strong> o fruto alaranjado que vira doce, sorvete e licor — o "ouro" das veredas.</li>
  <li><strong>Cagaita, mangaba e cajuzinho-do-cerrado:</strong> frutas nativas que aparecem em sobremesas autorais e sucos.</li>
</ul>

${h.fig(2, { legenda: 'O baru, castanha nativa do Cerrado, hoje cobiçada pela alta gastronomia.' })}

<h2>Onde comer, por ocasião</h2>
<h3>Para uma noite especial</h3>
<p>A <strong>Asa Sul</strong> reúne a alta gastronomia da cidade — cozinha autoral, carta de vinhos, serviço afinado. É a região das comemorações.</p>
<h3>Com vista para a água</h3>
<p>O <strong>Pontão do Lago Sul</strong> alinha restaurantes à beira do Paranoá: ideal para o fim de tarde, a 10 minutos das nossas casas. Combina perfeitamente com o <a href="/blog/roteiros.html">roteiro de 3 dias</a>.</p>
<h3>Comida de raiz</h3>
<p>Para sentir a alma candanga, procure as casas de comida goiana e mineira e os botecos da Asa Norte — galinhada, pamonha, empadão goiano e o tradicional happy hour brasiliense.</p>

${h.fig(3, { legenda: 'Feijoada: o Brasil migrante que formou a mesa de Brasília.' })}

<h2>A melhor mesa pode ser a sua</h2>
<p>Há algo que restaurante nenhum oferece: cozinhar (ou ser servido) na privacidade de uma casa, com os seus, sem hora para acabar. Por isso nossas hospedagens têm <strong>cozinha gourmet completa e espaço para receber</strong> — dá para chamar um chef particular, montar um jantar harmonizado para o grupo ou simplesmente preparar um café da manhã com as frutas da feira. Em Brasília, a hospitalidade também se faz à mesa — e a sua mesa pode ser a melhor da viagem.</p>
`,
};
