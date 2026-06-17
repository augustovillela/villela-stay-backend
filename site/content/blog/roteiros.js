// Artigo de blog — Roteiros turísticos de Brasília
module.exports = {
  slug: 'roteiros',
  tema: 'Roteiros',
  emoji: '🧭',
  titulo: 'Roteiros de Brasília: o que fazer em 1, 3 e 5 dias na capital | Villela Stay',
  descricao: 'Roteiros prontos para Brasília — cívico, cultural, gastronômico e ao ar livre. O que ver, em que ordem e onde ficar para aproveitar a cidade sem perder tempo no trânsito.',
  h1: 'Brasília em 1, 3 ou 5 dias — sem perder o melhor',
  dek: 'A capital é grande, planejada e espalhada. Com o roteiro certo (e ficando no lugar certo), você vê o essencial com calma — e ainda sobra tempo para o pôr do sol no lago.',
  atualizado: '2026-06-17',
  leituraMin: 8,
  keywords: ['o que fazer em brasília', 'roteiro brasília', 'pontos turísticos brasília', 'brasília em 3 dias', 'turismo brasília'],
  casas: ['GD01H', 'GG04I', 'VH01H'],
  casasTitulo: 'Fique no Lago Sul — perto de tudo, longe do corre-corre',
  casasTexto: 'A 10 minutos do Aeroporto JK e da Esplanada, o Lago Sul é a base ideal para o seu roteiro: você volta para casa entre um passeio e outro, descansa de verdade e pega a Ermida Dom Bosco na hora do pôr do sol.',
  isca: {
    titulo: 'Roteiro de 3 dias em Brasília (PDF do anfitrião)',
    texto: 'O passo a passo que montamos para nossos hóspedes: o que ver de manhã, de tarde e à noite, com dicas de horário e trânsito. Receba no seu e-mail.',
    botao: 'Quero o roteiro de 3 dias',
  },
  faq: [
    { q: 'Quantos dias são ideais para conhecer Brasília?', a: 'Três dias dão conta do essencial com tranquilidade: um dia para o roteiro cívico (Esplanada, Três Poderes, Catedral), um para a cultura e a gastronomia (museus, Pontão, restaurantes) e um para o ar livre (Jardim Botânico, Lago Paranoá, Ermida Dom Bosco). Cinco dias permitem incluir o entorno — Cidade Ocidental, Chapada Imperial e cachoeiras.' },
    { q: 'Precisa de carro para passear em Brasília?', a: 'Ajuda muito. A cidade foi desenhada para o automóvel e os pontos turísticos são distantes entre si. Aplicativos de transporte funcionam bem, mas um carro dá liberdade — e, ficando no Lago Sul, você está a poucos minutos das principais atrações.' },
    { q: 'Qual a melhor época para visitar?', a: 'A estação seca (maio a setembro) tem o céu mais azul e dias ensolarados — ótimo para fotos e passeios ao ar livre. A estação das chuvas (outubro a abril) deixa a cidade mais verde e os jardins exuberantes. Evite só os feriados de pico (Réveillon, Carnaval) se quiser menos movimento.' },
  ],
  relacionados: ['arquitetura', 'gastronomia', 'paisagismo'],
  corpo: (h) => `
<p class="artigo-lead">Brasília não cabe num passeio de tarde. Ela foi desenhada em escala monumental — distâncias largas, eixos longos, horizontes abertos. Quem chega sem roteiro perde tempo no trânsito e energia no sol. Quem chega com um plano (e fica no bairro certo) descobre uma das cidades mais surpreendentes do Brasil. Aqui estão os roteiros que montamos para os nossos hóspedes.</p>

${h.fig(1, { legenda: 'A Praça dos Três Poderes e o Palácio do Planalto — o coração cívico da capital.' })}

<h2>1 dia: o essencial cívico</h2>
<p>Se você só tem um dia, dedique-o ao eixo que fez Brasília virar Patrimônio da Humanidade:</p>
<ul class="artigo-lista">
  <li><strong>Manhã:</strong> Praça dos Três Poderes — Palácio do Planalto, Supremo e Congresso Nacional. Comece cedo, antes do calor.</li>
  <li><strong>Meio-dia:</strong> Catedral Metropolitana e a Esplanada dos Ministérios, com seus museus de Niemeyer (o Museu Nacional e a Biblioteca).</li>
  <li><strong>Tarde:</strong> Memorial JK e Torre de TV (vista panorâmica de 360°).</li>
  <li><strong>Fim de tarde:</strong> Ermida Dom Bosco, para o pôr do sol sobre o Lago Paranoá.</li>
</ul>
<p>Quer entender o que está vendo? O <a href="/blog/arquitetura.html">guia de arquitetura</a> explica cada obra e quem a projetou.</p>

${h.fig(2, { legenda: 'A cúpula do Museu Nacional, de Niemeyer, na Esplanada dos Ministérios.' })}

<h2>3 dias: cidade, cultura e natureza</h2>
<p>Com três dias, você respira a cidade em vez de só fotografá-la.</p>
<h3>Dia 1 — Cívico</h3>
<p>O roteiro acima, sem pressa, com almoço na Asa Sul.</p>
<h3>Dia 2 — Cultura e lazer</h3>
<p>Manhã no Santuário Dom Bosco (os vitrais azuis são de tirar o fôlego), tarde no <strong>Pontão do Lago Sul</strong> — o point à beira d'água com restaurantes, caminhada e barcos — e noite de boa gastronomia. As melhores mesas estão no <a href="/blog/gastronomia.html">guia de gastronomia</a>.</p>
<h3>Dia 3 — Ar livre</h3>
<p>Jardim Botânico de Brasília ou Parque da Cidade pela manhã, e à tarde o <strong>Catetinho</strong> — a primeira residência de Juscelino na cidade, erguida em dez dias, hoje um museu encantador a caminho do Lago Sul.</p>

${h.fig(3, { legenda: 'O calçadão do Pontão do Lago Sul, à beira do Paranoá — pôr do sol e gastronomia.' })}

<h2>5 dias: Brasília + entorno</h2>
<p>Cinco dias abrem espaço para o que poucos turistas veem: a <strong>Chapada Imperial</strong> e suas cachoeiras a uma hora da cidade, o <strong>Vale do Amanhecer</strong> em Planaltina, os mirantes do Lago Norte e um dia inteiro só de lago — stand-up, lancha, pôr do sol. É quando Brasília deixa de ser "a cidade dos prédios do governo" e vira destino de verdade.</p>

${h.fig(4, { legenda: 'O Catetinho, primeira morada de JK em Brasília — erguido em dez dias.' })}

<h2>O segredo de um bom roteiro: onde você dorme</h2>
<p>O maior erro do turista em Brasília é se hospedar longe e gastar o dia no trânsito. Ficar no <strong>Lago Sul</strong> muda a viagem: você está a minutos da Esplanada, do Pontão e da Ermida, num bairro arborizado e seguro, e volta para uma casa de verdade — com piscina, cozinha e espaço — entre um passeio e outro. É o roteiro funcionando a seu favor, não contra.</p>
`,
};
