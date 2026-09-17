// Artigo de blog — o custo humano de coordenação (constrangimento, cansaço, rotatividade) e onde a IA entra.
// `semVenda: true` suprime os blocos comerciais de hospedagem: o funil deste texto é a série/livro/curso.
// ⚠️ Numeros conferidos na fonte em 17/09/2026. A Parte III existe para a peca nao virar
// "demita todo mundo" — nao a encurte: e ela que torna o resto defensavel.
module.exports = {
  slug: 'quantas-vezes-pedir-para-refazer',
  tema: 'Gestão',
  emoji: '🧮',
  semVenda: true,
  titulo: 'Quantas vezes você pode pedir para refazer? O custo que nenhuma planilha mostra | Villela Stay',
  descricao: 'O teto social da refação, o imposto do tato, a hora do dia que muda a decisão de um médico, e o que tudo isso custa de verdade — com os números de rotatividade, presenteísmo e encargos, e onde a inteligência artificial resolve e onde não resolve.',
  h1: 'Quantas vezes você pode pedir para refazer?',
  dek: 'A terceira vez já é constrangimento; a quarta, risco. Esse teto invisível rebaixa a qualidade de tudo o que você contrata — e é só uma parte do que custa coordenar seres humanos. Este é o cálculo completo, com o que a IA muda e o que ela não muda.',
  atualizado: '2026-09-17',
  leituraMin: 20,
  keywords: [
    'custo de contratar funcionário CLT',
    'custo de rotatividade de pessoal',
    'presenteísmo no trabalho',
    'riscos psicossociais NR-1',
    'produtividade com inteligência artificial',
    'gestão de equipe e feedback',
    'quanto custa um funcionário para a empresa',
    'IA reduz custos empresa',
  ],
  faq: [
    { q: 'Quanto custa de verdade manter um funcionário no Brasil?', a: 'O salário é a menor parte da conta. Somados INSS patronal, FGTS, provisões de férias e décimo terceiro, multa rescisória e benefícios, o custo total costuma ficar entre 70% e 100% acima do salário bruto. E isso é só a folha: fora dela ficam RH, medicina e segurança do trabalho, canal de denúncias, treinamento, confraternização, bônus, prêmios e o tempo de gestão — que ninguém lança em lugar nenhum, mas é pago em horas do gestor.' },
    { q: 'Quanto custa perder um funcionário?', a: 'Segundo o Gallup, substituir alguém custa entre 50% e 200% do salário anual da posição, dependendo do cargo e da senioridade — e a rotatividade voluntária consome cerca de um trilhão de dólares por ano só nos Estados Unidos. O grosso não é o recrutamento: é a vaga aberta, os seis a doze meses até o substituto render igual, o conhecimento que foi embora com a pessoa e o tempo do gestor desviado para contratar.' },
    { q: 'O que é presenteísmo e por que ele custa mais que a falta?', a: 'Presenteísmo é estar presente e não render — doente, exausto, preocupado, desmotivado. Estimativas reunidas pela Harvard Business Review colocam o custo em torno de 150 bilhões de dólares por ano nos Estados Unidos. Por dia, a falta custa mais, porque a entrega é zero. No agregado, o presenteísmo custa mais, porque acontece muito mais vezes e ninguém o mede: não aparece em nenhum relatório, já que a pessoa bateu ponto.' },
    { q: 'A hora do dia realmente muda a qualidade de uma decisão profissional?', a: 'Muda, e está medido em profissionais de alto nível decidindo coisas graves. Um estudo publicado no JAMA Network Open em 2019 mostrou que médicos de atenção primária pediam mamografia em 63,7% das consultas das 8h e em 47,8% das consultas das 17h; para rastreamento de câncer colorretal, a taxa caía de 36,5% para 23,4%. Outro estudo, no JAMA Internal Medicine em 2014, encontrou aumento da prescrição inadequada de antibióticos conforme o turno avançava. Não é preguiça: é fadiga de decisão, e atinge todo mundo.' },
    { q: 'Quantas vezes se pode pedir para refazer um trabalho sem ofender?', a: 'Não há número legal, e é justamente esse o problema: o limite é social e cada um sente o seu. Na prática, a primeira refação é normal, a segunda é aceita com esforço, a terceira já carrega constrangimento e a quarta costuma ser lida como perseguição — independentemente de o trabalho estar bom ou não. O efeito é que muita coisa é entregue e aceita no nível "suficiente", não porque alguém se conformou com a qualidade, mas porque insistir custava caro na relação.' },
    { q: 'A inteligência artificial substitui o empregado, então?', a: 'Não, e tratá-la assim é caro. Ela não assina, não responde por erro, não tem registro em conselho profissional, não tem relação com o seu cliente e não sabe o que ninguém lhe contou. O que ela substitui é a ITERAÇÃO — a quinta versão, a revisão às 23h, a instrução direta sem rodeio. Quem troca pessoas por IA onde a IA não alcança não economiza: transfere o custo para o passivo, que aparece depois e maior.' },
    { q: 'Existe evidência real de que a IA melhora a qualidade, e não só a velocidade?', a: 'Existe, medida em experimento. No estudo de Noy e Zhang publicado na Science em 2023, com 453 profissionais formados, o tempo das tarefas caiu 40% e a qualidade avaliada por terceiros subiu 18%. No estudo de Brynjolfsson, Li e Raymond, com 5.179 atendentes de suporte, a produtividade subiu 14% na média — e 34% entre os menos experientes. O padrão dos dois é o mesmo: o ganho é maior para quem sabe menos, o que muda a conta de quem você precisa contratar.' },
  ],
  corpo: (h) => `
<p class="artigo-lead">Peça a um fotógrafo para refazer o ensaio. Ele refaz. Peça de novo: ele refaz, com um silêncio diferente. Peça uma terceira vez e alguma coisa muda na relação — mesmo que você esteja certo, mesmo que esteja pagando. Na quarta, você já não está pedindo qualidade: está, aos olhos dele, implicando. <strong>Existe um teto para quantas vezes se pode pedir para refazer, e esse teto não tem nada a ver com o trabalho estar bom.</strong> Ele é social. E é caríssimo.</p>

${h.fig(1, { legenda: 'A mesma peça, refeita quantas vezes for preciso — e ninguém se cansa.' })}

<h2>Parte I — O custo que nenhuma planilha mostra</h2>

<h3>1. O teto da refação</h3>
<p>Nenhum contrato diz quantas revisões cabem. Nenhum código de obra estabelece o número de vezes que o pintor pode ser chamado de volta. O limite existe assim mesmo, e todo mundo o conhece de intuição: a primeira refação é normal, a segunda é aceita com algum esforço, a terceira carrega constrangimento, a quarta vira perseguição.</p>
<p>Repare no que isso produz, porque é sutil e é o ponto do artigo. <strong>Não é que o trabalho ruim seja aceito.</strong> É que existe uma faixa larga — entre &ldquo;bom&rdquo; e &ldquo;ótimo&rdquo; — em que você <em>desiste</em>. O arquiteto entregou uma planta que resolve, mas não encanta; o contador fez o que se pede, não o que se poderia; o advogado escreveu a peça correta, não a melhor possível. Você olha, pensa em pedir mais uma volta, calcula o custo social daquilo, e assina embaixo.</p>
<p>O resultado agregado dessa desistência é invisível justamente porque ela nunca é registrada. Não há linha contábil chamada &ldquo;qualidade que deixei de exigir para não constranger&rdquo;. Mas ela está no produto final de quase tudo o que você já contratou.</p>
<p>E o efeito é de mão dupla, o que piora tudo. Quem executa também sabe onde fica o teto — e, sabendo, calibra a entrega no ponto em que o cliente provavelmente não vai pedir de novo. Não é desonestidade: é economia de esforço num sistema em que exigir sai caro para os dois lados. <strong>O &ldquo;suficiente&rdquo; não é o que as pessoas sabem fazer. É o equilíbrio de um jogo em que insistir tem preço.</strong></p>

<h3>2. O imposto do tato</h3>
<p>Agora o segundo custo, que o gestor paga em horas da própria vida: dizer as coisas.</p>
<p>Um erro que se explicaria em uma frase — &ldquo;está errado aqui, refaça assim&rdquo; — não é dito em uma frase. É embrulhado. Começa-se elogiando, ameniza-se no meio, termina-se com estímulo. Escolhe-se a hora, escolhe-se o canal, evita-se na frente dos outros, adia-se para segunda-feira porque na sexta a pessoa estava mal. Existe até um método com nome para isso, o <em>feedback</em> em sanduíche, ensinado como técnica — o que confirma que embrulhar é obrigatório.</p>
<p>Some o tempo. Um gestor com dez subordinados gasta, por semana, algumas horas apenas na <strong>embalagem</strong> daquilo que precisava dizer. Não na decisão, não na análise: na embalagem. Multiplique por um ano e você tem semanas inteiras de trabalho qualificado consumidas na tarefa de comunicar sem ferir.</p>
<p>E aqui, no Brasil, o custo deixou de ser só de tempo. Passou a ser jurídico e obrigatório:</p>
<ul class="artigo-lista">
  <li>A <strong>Lei 14.457/2022</strong> obriga empresas com CIPA a manter <strong>canal de denúncias</strong> para assédio moral e sexual, com garantia de anonimato, e a incluir o tema no treinamento da comissão.</li>
  <li>A <strong>NR-1 atualizada</strong> (Portaria MTE 1.419/2024) incorporou os <strong>riscos psicossociais</strong> ao Gerenciamento de Riscos Ocupacionais. Depois de uma prorrogação de doze meses, a exigência ficou <strong>fiscalizável a partir de maio de 2026</strong> — e não distingue por tamanho de empresa: o que varia é a complexidade da avaliação, não a obrigação de fazê-la.</li>
  <li>E há o passivo. Assédio moral reconhecido gera indenização, e o STF já decidiu que o tabelamento de dano moral da CLT <strong>não é teto</strong> — as condenações vão de poucos milhares a centenas de milhares de reais, conforme a gravidade e a capacidade econômica do réu.</li>
</ul>
<p>Nada disso é injusto. Cobrar respeito no ambiente de trabalho é civilização, e quem viveu chefe gritando sabe do que a lei está protegendo. Mas é preciso ser honesto sobre a aritmética: <strong>o direito de não ser destratado tem um preço operacional, e esse preço é pago em rodeio, em tempo e em qualidade não exigida.</strong></p>

<h3>3. O que o cansaço faz com a decisão</h3>
<p>Você levantou a questão do empregado doente, mal-humorado, no fim do expediente ou às vésperas das férias. Ela tem resposta medida — e a resposta é mais grave do que a intuição sugere, porque foi medida em <strong>médicos</strong>, decidindo sobre <strong>câncer</strong>.</p>
<p>Um estudo publicado no <em>JAMA Network Open</em> em 2019 acompanhou pedidos de rastreamento em atenção primária conforme o horário da consulta:</p>
<div class="artigo-nota">
  <p><strong>Mamografia:</strong> pedida em <strong>63,7%</strong> das consultas das 8h — e em <strong>47,8%</strong> das consultas das 17h.<br>
  <strong>Rastreamento de câncer colorretal:</strong> <strong>36,5%</strong> às 8h — e <strong>23,4%</strong> às 17h.</p>
</div>
<p>Mesma doença. Mesmo médico. Mesmo paciente elegível. A diferença é o relógio. Um estudo anterior, no <em>JAMA Internal Medicine</em> em 2014, achou o espelho disso: a prescrição <em>inadequada</em> de antibiótico para infecção respiratória <strong>aumentava</strong> conforme a sessão avançava — quando cansa, é mais fácil ceder do que explicar por que não.</p>
<p>Chama-se fadiga de decisão, e o essencial é que <strong>não é falha de caráter</strong>. Não é preguiça, não é má vontade, não se resolve com bônus nem com palestra motivacional. É biologia, e atinge o profissional mais dedicado da sua equipe exatamente como atinge o mais desleixado. O que você contrata não é uma capacidade constante: é uma curva que sobe, desce, cai na sexta, some na véspera das férias e volta devagar depois delas.</p>

<h2>Parte II — A planilha aberta</h2>
<p>Feita a parte que se sente, vamos à parte que se soma. Suas perguntas foram: quanto custa manter, quanto custa agradar, quanto custa perder. Os números existem.</p>

<h3>4. O que custa manter</h3>
<p>No Brasil, o salário bruto é a menor parte da conta. INSS patronal com RAT e terceiros (na faixa de 28,8% para empresas do Lucro Real ou Presumido), FGTS de 8%, provisão de férias com o terço constitucional (11,11%), provisão de décimo terceiro (8,33%), provisão de multa rescisória — somados a benefícios como vale-transporte, alimentação e plano de saúde, o <strong>custo total costuma ficar entre 70% e 100% acima do salário bruto</strong>.</p>
<p>E isso é só a folha. Fora dela, sem entrar em nenhuma planilha de custo por empregado, ficam:</p>
<ul class="artigo-lista">
  <li><strong>RH</strong> — recrutamento, seleção, integração, avaliação, clima, desligamento.</li>
  <li><strong>Compliance e jurídico trabalhista</strong> — política interna, canal de denúncias, treinamento obrigatório, defesa em reclamação.</li>
  <li><strong>Saúde e segurança</strong> — exames, PGR, inventário de riscos e, desde 2026, o mapeamento dos riscos psicossociais.</li>
  <li><strong>Engajamento</strong> — confraternização, premiação, brinde, campanha interna, pesquisa de clima, benefício flexível.</li>
  <li><strong>Tempo de gestão</strong> — a linha mais cara e a única que nunca é lançada: as horas do gestor gastas em conversar, mediar, motivar, cobrar com cuidado e refazer o pedido de outro jeito.</li>
</ul>

<h3>5. O que custa perder</h3>
<p>Segundo o Gallup, substituir um empregado custa <strong>entre 50% e 200% do salário anual</strong> da posição, conforme o cargo e a senioridade — e a rotatividade voluntária consome, só nos Estados Unidos, algo perto de <strong>um trilhão de dólares por ano</strong>.</p>
<p>O erro comum é imaginar que isso é o custo do anúncio de vaga. Não é. É a vaga aberta produzindo zero, o substituto levando de seis a doze meses até render como o anterior, o conhecimento acumulado saindo pela porta, o resto do time absorvendo a sobrecarga — e, com frequência, pedindo as contas na sequência.</p>

<h3>6. O que custa estar presente sem render</h3>
<p>Aqui está o número mais subestimado da gestão. O <strong>absenteísmo</strong> — a falta — é medido por todo mundo, porque aparece. O <strong>presenteísmo</strong> — estar lá sem render — não é medido por quase ninguém, porque a pessoa bateu ponto.</p>
<p>Estimativas reunidas pela <em>Harvard Business Review</em> colocam o custo do presenteísmo em torno de <strong>150 bilhões de dólares por ano</strong> nos Estados Unidos. Por dia, faltar custa mais, porque a entrega é zero. No agregado, o presenteísmo custa mais — porque acontece muito mais vezes, e porque ninguém o enxerga para corrigir.</p>
<p>E note a armadilha: as políticas feitas para reduzir a falta (pressão por presença, desconto, controle) tendem a <strong>aumentar</strong> o presenteísmo. Você troca um custo visível por um custo invisível e maior, e comemora o indicador.</p>

<h2>Parte III — Onde a inteligência artificial entra</h2>

<h3>7. O que ela de fato remove</h3>
<p>Sua observação central está correta, e ela vale ser dita com precisão: <strong>a IA não remove o trabalho. Ela remove o atrito social do trabalho.</strong></p>
<ul class="artigo-lista">
  <li><strong>A refação deixa de ter teto.</strong> A quinta versão custa o mesmo que a primeira: tokens. Não custa constrangimento, não custa relação, não gera ressentimento na sexta tentativa. Pela primeira vez, o número de iterações é decidido pela <em>qualidade desejada</em>, e não pelo limite do que dá para pedir.</li>
  <li><strong>A instrução volta a ser direta.</strong> &ldquo;Isto está errado, refaça assim&rdquo; é uma frase inteira e suficiente. Sem preâmbulo, sem sanduíche, sem escolher a hora. O tempo do rodeio volta para o bolso.</li>
  <li><strong>Não há hora do dia.</strong> Não há véspera de férias, retorno de férias, segunda-feira, sexta às 17h, dor de cabeça, discussão em casa nem fadiga de decisão. A curva de desempenho é plana — o que, depois dos números da seção 3, deixa de ser detalhe e vira diferença de qualidade.</li>
  <li><strong>Não há teto de disponibilidade.</strong> Às 23h de domingo o custo marginal é o mesmo das 10h de terça.</li>
</ul>
<p>E o ganho não é promessa: foi medido em experimento controlado. No estudo de <strong>Noy e Zhang</strong>, publicado na <em>Science</em> em 2023 com 453 profissionais formados, o tempo das tarefas caiu <strong>40%</strong> e a qualidade avaliada por terceiros subiu <strong>18%</strong> — as duas coisas ao mesmo tempo, que é justamente o que raramente acontece. No estudo de <strong>Brynjolfsson, Li e Raymond</strong>, com <strong>5.179</strong> atendentes de suporte, a produtividade subiu <strong>14%</strong> na média e <strong>34%</strong> entre os menos experientes.</p>
<p>Guarde esse último recorte, porque é o que muda a conta do empresário: <strong>o ganho é maior para quem sabe menos</strong>. Não é que a IA dispense o profissional excelente — ela quase não move o ponteiro dele. É que ela aproxima o iniciante do padrão do experiente, e isso altera quem você precisa contratar para entregar um determinado nível.</p>
<p>Você mesmo listou as dependências, e elas são reais: internet no ar, máquina funcionando, conta paga, créditos disponíveis. A ironia que você apontou é boa e verdadeira — são exatamente as mesmas condições que, faltando, também atrasariam o empregado. A diferença é que essas falham de vez em quando, e a condição humana falha todo dia um pouco.</p>

<h3>8. Onde ela não entra — e esta parte não é ressalva de cortesia</h3>
<p>Um artigo que parasse na seção anterior estaria vendendo uma ilusão cara. A fronteira importa mais que a promessa:</p>
<ul class="artigo-lista">
  <li><strong>Ela não assina e não responde.</strong> Não tem OAB, CREA, CRM nem CRC; não é ré, não indeniza, não perde registro. Em tudo que exige responsabilidade profissional, o nome no documento continua sendo de uma pessoa — e quem assina precisa ter capacidade de conferir o que assina.</li>
  <li><strong>Ela não tem relação com o seu cliente.</strong> Confiança construída em quinze anos não é um serviço que se contrate por token.</li>
  <li><strong>Ela não sabe o que ninguém contou.</strong> Metade do bom trabalho de um profissional veterano vem de contexto tácito — o que o chefe não disse, o que aquele cliente detesta, o que deu errado da última vez. Isso não está no pedido.</li>
  <li><strong>Ela erra de um jeito pior de detectar.</strong> Erra com confiança, em formato plausível, inclusive inventando fonte. Quem revisa precisa entender do assunto — e é por isso que ela eleva quem sabe, mas não salva quem não sabe.</li>
  <li><strong>RH e compliance não são desperdício.</strong> A NR-1 e a Lei 14.457/2022 existem por razões que qualquer um que já trabalhou sob um chefe abusivo reconhece. O argumento deste texto é que esse custo seja <em>contado</em>, não que seja eliminado — e nenhuma ferramenta dispensa obrigação legal.</li>
  <li><strong>O tato também produz coisa boa.</strong> Equipe que se respeita discorda em voz alta, avisa do erro antes de ele custar caro e fica. O custo do cuidado compra algo real; o problema é quando ele vira medo, e o medo vira silêncio.</li>
</ul>
<p>A regra prática que sai daí é curta: <strong>trocar pessoas por IA onde a IA não alcança não economiza — transfere o custo para o passivo</strong>, que chega depois, maior e com juros.</p>

<h3>9. O que muda de verdade</h3>
<p>A conclusão não é demitir. É <strong>mudar a fronteira de onde o esforço humano é gasto</strong>.</p>
<p>A iteração migra para a máquina: rascunhar, reescrever, comparar versões, refazer a quinta vez, checar consistência, traduzir, resumir, testar o argumento contrário. O que fica com a pessoa é o que sempre foi caro e agora fica visível: <strong>julgamento, responsabilidade, relação e decisão</strong>.</p>
<p>E há um efeito colateral que quase ninguém antecipa, e que talvez seja o mais valioso: <strong>com a iteração barata, o padrão sobe</strong>. Você deixa de aceitar o &ldquo;suficiente&rdquo; porque pedir de novo parou de custar constrangimento. Pede a quinta versão, e a quinta versão é a que o cliente recebe. O ganho que se anuncia é de custo; o que fica é de qualidade.</p>
<p>No fim, a pergunta do título tem duas respostas, e é a distância entre elas que explica o artigo inteiro. Com uma pessoa: três vezes, talvez quatro, e depois o preço não é mais em dinheiro. Com a máquina: quantas você precisar — e a conta vem em tokens, que é o tipo de conta que se paga sem ninguém sair magoado.</p>

<div class="artigo-nota">
  <p><strong>Síntese.</strong> Coordenar pessoas custa três coisas que nenhuma planilha mostra: o teto social da refação, que rebaixa silenciosamente a qualidade de tudo; o imposto do tato, pago em horas de gestão e, hoje no Brasil, em obrigação legal; e a variação humana de desempenho, que muda até a decisão de um médico conforme a hora da consulta. Somados aos números que a planilha mostra — 70% a 100% de encargos sobre o salário, 50% a 200% do salário anual para substituir alguém, e um presenteísmo que custa mais que a falta —, isso é o preço real de uma equipe. A inteligência artificial não remove o trabalho nem substitui o profissional: ela remove o <em>atrito</em>, e com isso torna barata a iteração que antes era socialmente cara. O que ela não faz é assinar, responder, conhecer seu cliente ou dispensar a lei. Quem entende essa fronteira reduz custo e sobe padrão ao mesmo tempo; quem a ignora só troca despesa por passivo.</p>
</div>

<div class="artigo-cta">
  <span class="artigo-cta-tag">Como aplicar isso na sua operação</span>
  <h2>Claude AI na Prática</h2>
  <p>Os 22 capítulos da série estão publicados de graça aqui no site — inclusive como montar fluxos que absorvem a iteração, onde colocar a conferência humana e como um time de agentes cobre as funções de uma empresa pequena. O livro e o curso aprofundam o mesmo caminho.</p>
  <p class="artigo-cta-links">
    <a href="/claude/">Ler a série completa (grátis)</a>
    <a href="https://livros.villelastay.com.br/livros?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=quantas-vezes-pedir-para-refazer" target="_blank" rel="noopener">Conhecer o livro</a>
    <a href="https://academia.villelastay.com.br/academy/marketplace?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=quantas-vezes-pedir-para-refazer" target="_blank" rel="noopener">Ver o curso on-line</a>
  </p>
</div>

<div class="tea-aviso tea-aviso-fim">
  <p><strong>Fontes.</strong> Hsiang et al., <em>JAMA Network Open</em> (2019), sobre horário da consulta e pedido de rastreamento · Linder et al., <em>JAMA Internal Medicine</em> (2014), sobre fadiga de decisão e prescrição de antibiótico · Gallup, sobre custo de substituição e rotatividade voluntária · <em>Harvard Business Review</em>, sobre presenteísmo · Noy e Zhang, <em>Science</em> (2023) · Brynjolfsson, Li e Raymond, <em>Generative AI at Work</em> · Lei 14.457/2022 · NR-1, Portaria MTE 1.419/2024, com exigência de riscos psicossociais fiscalizável desde maio de 2026 · decisão do STF sobre o tabelamento de dano moral da CLT.</p>
  <p>Texto de <strong>Augusto Villela</strong>, advogado (OAB/DF 12.003) e autor da série <em>Claude AI na Prática</em>. É análise de custos e de método, escrita da perspectiva de quem contrata e de quem gere — não é orientação trabalhista para caso concreto, e nada aqui dispensa o cumprimento das obrigações legais com empregados e prestadores.</p>
</div>
`,
};
