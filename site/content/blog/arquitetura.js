// Artigo de blog — Arquitetura de Brasília
// Para criar um novo artigo: copie este arquivo, troque os campos e registre em index.js.
module.exports = {
  slug: 'arquitetura',
  tema: 'Arquitetura',
  emoji: '🏛️',
  titulo: 'Arquitetura de Brasília: o guia para ver a cidade com outros olhos | Villela Stay',
  descricao: 'Niemeyer, Lúcio Costa, Burle Marx e Athos Bulcão: o guia da arquitetura modernista de Brasília — o que ver, por que importa e onde se hospedar dentro dessa história.',
  h1: 'Brasília não foi construída. Foi desenhada.',
  dek: 'Em mil dias, no meio do cerrado, nasceu a maior obra de arte urbana do século XX. Este é o guia para entender — e viver — a arquitetura que fez de uma cidade inteira Patrimônio da Humanidade.',
  atualizado: '2026-06-17',
  leituraMin: 9,
  keywords: ['arquitetura de brasília', 'oscar niemeyer', 'lúcio costa', 'modernismo brasileiro', 'patrimônio da humanidade', 'o que ver em brasília'],
  casas: ['GD01H', 'GG04I', 'PL02I'],
  casasTitulo: 'Durma dentro da arquitetura que você veio admirar',
  casasTexto: 'Nossas casas no Lago Sul são da mesma família estética que você vê na Esplanada: linhas limpas, integração com o jardim, luz e concreto. Não é hotel — é morar, por alguns dias, na Brasília que o mundo veio conhecer.',
  isca: {
    titulo: 'Roteiro Modernista de 1 dia (PDF do anfitrião)',
    texto: 'A ordem certa para ver as obras de Niemeyer sem perder tempo no trânsito — com os melhores horários de luz para fotografar cada uma. Baixe agora.',
    botao: 'Quero o roteiro',
    arquivo: '/iscas/roteiro-modernista-1-dia.pdf',
  },
  faq: [
    { q: 'Por que Brasília é Patrimônio Cultural da Humanidade?', a: 'A UNESCO inscreveu Brasília na lista em 1987 — foi a primeira cidade do século XX a receber o título. O reconhecimento é pelo conjunto urbanístico do Plano Piloto de Lúcio Costa e pela arquitetura de Oscar Niemeyer, um exemplo único e íntegro dos princípios do urbanismo moderno aplicados a uma capital inteira, do zero.' },
    { q: 'Quais obras de Niemeyer ver em um dia?', a: 'Catedral Metropolitana, Congresso Nacional, Praça dos Três Poderes (com o Palácio do Planalto e o STF), Palácio do Itamaraty e, no fim da tarde, a Ermida Dom Bosco para o pôr do sol sobre o lago. Todas a poucos minutos umas das outras pelo Eixo Monumental.' },
    { q: 'Dá para visitar os palácios por dentro?', a: 'Sim, alguns. O Palácio do Planalto e o Itamaraty abrem para visitação guiada gratuita em dias e horários específicos (geralmente com agendamento). O Congresso Nacional também recebe visitas. Confirme as agendas oficiais antes de ir — elas mudam conforme a agenda institucional.' },
    { q: 'Qual a melhor época para fotografar a arquitetura?', a: 'A estação seca (maio a setembro) dá o céu azul mais limpo e profundo do Brasil — o contraste perfeito para o concreto branco de Niemeyer. Para a luz, o início da manhã e o fim da tarde (a "hora dourada") são imbatíveis, especialmente na Catedral e na Ermida Dom Bosco.' },
  ],
  relacionados: ['personalidades', 'roteiros', 'paisagismo'],
  corpo: (h) => `
<p class="artigo-lead">Há cidades que crescem. Brasília foi <strong>pensada</strong> — cada eixo, cada palácio, cada curva de concreto saiu de uma prancheta antes de existir no cerrado. Quando você caminha pela Esplanada dos Ministérios, não está num centro histórico que se acumulou por séculos: está dentro de uma ideia, executada inteira, em três anos e dez meses. É por isso que olhar para Brasília com calma muda quem olha.</p>

${h.fig(1, { legenda: 'O concreto branco de Niemeyer contra o céu seco do Planalto Central.' })}

<h2>Os quatro nomes que você precisa conhecer</h2>
<p>Brasília é obra coletiva, mas quatro nomes a explicam quase inteira — e, não por acaso, são os mesmos que batizam as casas da Villela Stay.</p>

<h3>Lúcio Costa — o homem que desenhou a cidade</h3>
<p>Em 1957, Lúcio Costa venceu o concurso do Plano Piloto com um gesto quase simples: um cruzamento de dois eixos, como quem faz o sinal da cruz ou abre os braços para tomar posse de um lugar. Desse traço nasceram o Eixo Monumental e o Eixo Rodoviário, as superquadras, a escala monumental dos poderes e a escala humana de quem mora. Costa não desenhou prédios — desenhou <em>como se vive</em>. Entender Brasília começa por entender que tudo ali tem intenção.</p>

<h3>Oscar Niemeyer — a curva que virou símbolo</h3>
<p>Se Lúcio Costa deu a lógica, Niemeyer deu a poesia. "Não é o ângulo reto que me atrai, nem a linha reta, dura, inflexível. O que me atrai é a curva livre e sensual", escreveu. Suas curvas estão na Catedral que parece mãos erguidas ao céu, nas colunas do Alvorada, na cúpula e na bacia do Congresso. Niemeyer provou que concreto armado podia ser leve, lírico, brasileiro. Projetou os principais monumentos da capital — e seguiu criando até morrer, aos 104 anos.</p>

${h.fig(2, { legenda: 'As 16 colunas da Catedral Metropolitana, que se erguem como mãos em prece.' })}

<h3>Roberto Burle Marx — o jardim como obra de arte</h3>
<p>A Brasília que você vê não é só concreto e céu: é também verde desenhado. Burle Marx tratou o paisagismo como pintura — massas de plantas tropicais compondo formas orgânicas que conversam com a arquitetura. Foi ele quem ensinou o mundo a olhar a flora brasileira como patrimônio, não como mato. Os jardins do Itamaraty são uma de suas obras-primas. <a href="/blog/paisagismo.html">Falamos só dele no guia de paisagismo →</a></p>

<h3>Athos Bulcão — a arte que cobre a cidade</h3>
<p>Olhe as paredes. Os azulejos brancos e azuis da Igrejinha Nossa Senhora de Fátima, os painéis do aeroporto, os relevos espalhados por dezenas de edifícios: são de Athos Bulcão, o artista que vestiu Brasília. Seu trabalho com padrões modulares — repetição com variação, nunca idêntica — é a prova de que o modernismo brasileiro tinha calor, cor e mão de obra de artista.</p>

<h2>O roteiro essencial da arquitetura</h2>
<p>Se você tem um dia, faça nesta ordem — é como a luz e o trânsito ajudam:</p>
<ul class="artigo-lista">
  <li><strong>Manhã — Praça dos Três Poderes.</strong> O coração simbólico da República: Planalto, STF e Congresso ao redor de uma praça que é, ela mesma, um museu a céu aberto. Comece cedo, antes do sol forte.</li>
  <li><strong>Meio da manhã — Catedral Metropolitana.</strong> Por fora, as 16 colunas hiperboloides; por dentro, a luz que desce pelos vitrais de Marianne Peretti e os anjos de Alfredo Ceschiatti suspensos. Pode ser a coisa mais bonita da cidade.</li>
  <li><strong>Almoço — Itamaraty ou Asa Sul.</strong> O Palácio do Itamaraty, com seus arcos sobre o espelho d'água e os jardins de Burle Marx, é parada obrigatória. <a href="/blog/gastronomia.html">Onde comer está no guia de gastronomia →</a></li>
  <li><strong>Tarde — Memorial JK e Eixo Monumental.</strong> O mausoléu de Juscelino, com a estátua sob a foice estilizada, fecha o sentido de tudo: aqui descansa quem teve a coragem de construir isto.</li>
  <li><strong>Pôr do sol — Ermida Dom Bosco.</strong> Pequena capela de Niemeyer (1957) debruçada sobre o Lago Paranoá. O melhor fim de tarde de Brasília, e a 10 minutos das nossas casas.</li>
</ul>

${h.fig(3, { legenda: 'O Congresso Nacional: a cúpula, a bacia e as torres gêmeas no eixo da Esplanada.' })}

<h2>Por que isso importa para a sua viagem</h2>
<p>Porque Brasília não se entrega a quem passa correndo. Ela se revela a quem sabe o que está vendo — e a quem fica perto o suficiente para voltar à Catedral ao entardecer, ou pegar a Ermida na hora certa. Foi com esse olhar que nasceu a Villela Stay: casas no Lago Sul que pertencem à mesma linhagem estética da cidade — integradas ao jardim, abertas para a luz, sem excesso. Você não visita a arquitetura de Brasília. Você acorda dentro dela.</p>
`,
};
