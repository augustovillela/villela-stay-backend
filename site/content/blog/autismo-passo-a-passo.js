// Artigo de blog — Autismo em Brasília: o passo a passo para a família
// Conteúdo de utilidade pública. Usa `semVenda: true` para NÃO emitir os blocos
// comerciais (cards de casas e formulário de proposta) no fim do artigo.
module.exports = {
  slug: 'autismo-passo-a-passo',
  tema: 'Inclusão',
  emoji: '🧭',
  semVenda: true,
  titulo: 'Autismo em Brasília: o passo a passo dos direitos, da primeira semana em diante | Villela Stay',
  descricao: 'Guia prático para famílias com criança autista no Distrito Federal: 15 passos na ordem certa, o que levar em cada balcão, o que dizer e o que fazer quando negarem. BPC, CIPTEA, terapias, escola e transporte.',
  h1: 'Recebeu o laudo de autismo? Comece por aqui, um passo por vez.',
  dek: 'Você não precisa entender de lei. Precisa de papel, protocolo e insistência — e isso se faz um passo de cada vez, na ordem certa. Este é o roteiro para famílias do Distrito Federal, do que sai em uma semana ao que se prepara para os 18 anos.',
  atualizado: '2026-09-14',
  leituraMin: 14,
  keywords: ['direitos do autista', 'autismo brasília', 'BPC autismo', 'CIPTEA distrito federal', 'terapia ABA plano de saúde', 'escola criança autista', 'passe livre DF', 'benefícios TEA'],
  relacionados: ['autismo-direitos-df'],
  faq: [
    { q: 'Vou ter que largar meu emprego para cuidar do meu filho autista?', a: 'Não necessariamente. Se você é servidora pública, existe direito a jornada reduzida sem corte de salário e sem precisar compensar as horas depois — o Supremo Tribunal Federal já decidiu que vale para as três esferas, no Tema 1.097. Se você é celetista, não há lei expressa garantindo o mesmo, e o caminho é negociar horário com a empresa e o sindicato. Vale lembrar também que, conforme a terapia avança, a rotina costuma exigir menos horas de supervisão.' },
    { q: 'Meu filho autista pode estudar em escola comum?', a: 'Pode, e isso é direito dele, não concessão da escola. Nenhuma escola, pública ou particular, pode recusar a matrícula: a recusa sujeita o gestor a multa de 3 a 20 salários mínimos, pelo artigo 7º da Lei 12.764/2012. Nenhuma escola particular pode cobrar taxa extra por profissional de apoio ou acessibilidade — o Supremo decidiu isso na ADI 5357. Turma reduzida, profissional de apoio e adaptação de material são obrigações da instituição.' },
    { q: 'E se eu não tiver dinheiro para pagar as terapias?', a: 'Há dois caminhos, ambos gratuitos para a família. Se houver plano de saúde, ele é obrigado a cobrir as terapias sem limite de sessões — o STJ consolidou isso no Tema 1.295, em março de 2026, e a reclamação na ANS pelo 0800 701 9656 costuma destravar em dias. Se não houver plano, o SUS tem rede especializada no DF (CAPSi, COMPP, CER II de Taguatinga e CEAL-LP), com entrada pela UBS do seu endereço. Demora acontece, e demora excessiva é caso para a Defensoria Pública do DF.' },
    { q: 'O INSS negou o BPC. E agora?', a: 'Negativa é etapa comum, não é o fim. Você tem 30 dias para recorrer ao Conselho de Recursos da Previdência Social, de graça, pelo próprio aplicativo Meu INSS — muita concessão sai justamente nessa segunda análise. Se cair de novo, cabe ação no Juizado Especial Federal, e a Defensoria Pública do DF entra sem cobrar. Desconfie de quem cobra para "conseguir" o BPC: o pedido é gratuito e a própria família faz pelo celular.' },
    { q: 'Quando eu não estiver mais aqui, quem cuida do meu filho?', a: 'Esse medo tem resposta concreta. Filho com deficiência intelectual ou mental recebe pensão por morte vitalícia quando o pai ou a mãe segurados falecem, sem o corte dos 21 anos que vale para os outros filhos — mas isso só existe se ao menos um dos pais for segurado do INSS. Quem cuida da casa e não tem renda própria pode se filiar pagando 5% do salário mínimo, R$ 81,05 por mês em 2026. O BPC, sozinho, não deixa nada para ninguém: ele acaba junto com quem recebe. Com o tempo, somam-se a isso um seguro de vida com o filho como beneficiário e um testamento que proteja a parte dele.' },
    { q: 'Preciso contratar advogado para conseguir esses benefícios?', a: 'Para começar, não. Quase tudo se resolve em aplicativo, balcão e formulário: o BPC se pede no Meu INSS, a CIPTEA sai online, a reclamação contra o plano de saúde é um telefonema, e a escola se resolve com requerimento protocolado e, se preciso, representação ao Ministério Público. Advogado entra se houver ação judicial — e, se não houver como pagar, a Defensoria Pública do DF faz de graça.' },
  ],
  corpo: (h) => `
<p class="artigo-lead">Este texto é para quem acabou de receber um laudo de Transtorno do Espectro Autista e está olhando para uma montanha de siglas — BPC, CIPTEA, CadÚnico, AEE, ABA — sem saber por onde pegar. A resposta curta é: <strong>pega por uma ponta só</strong>. Existe uma ordem, e ela economiza meses.</p>

<div class="tea-aviso">
  <p><strong>Três verdades para começar mais leve.</strong></p>
  <p><strong>1. Nenhum desses direitos vence.</strong> Não existe prazo que você tenha perdido. Começar hoje, em março ou no ano que vem — tudo continua valendo. Você não está atrasada.</p>
  <p><strong>2. A parte mais difícil já passou.</strong> O diagnóstico existe e está no papel. Era ele que travava tudo. O resto é fila, formulário e carimbo: cansativo, mas não é mais descoberta, é só caminho.</p>
  <p><strong>3. Só duas coisas têm relógio.</strong> O BPC é pago a partir do dia em que você pede, não do dia em que sai — pedir cedo vale dinheiro. E a matrícula escolar segue o calendário da Secretaria de Educação. Todo o resto pode esperar sem prejuízo.</p>
</div>

<p>Uma observação antes dos passos, porque ela evita frustração: <strong>o "grau" do laudo não é o passaporte que parece ser</strong>. Níveis de suporte 1, 2 e 3 vêm do DSM-5, um manual clínico — e nenhuma lei brasileira concede benefício por grau. O que INSS, escola e plano de saúde avaliam é função: o que a criança consegue e o que não consegue fazer sozinha, e que barreiras isso cria. Um laudo que diz apenas "F84.0, nível 2" é um laudo fraco. É por isso que o passo 1 é o que é.</p>

<h2>Esta semana: juntar os papéis</h2>
<p>Nenhum destes passos custa dinheiro e três deles se resolvem pelo celular. Eles existem para que, no mês que vem, você não ouça "falta documento" em nenhum balcão.</p>

<div class="tea-passo">
  <span class="tea-num">01</span>
  <h3>Pedir ao médico um relatório mais completo</h3>
  <p>Este é o passo que decide todos os outros. O INSS, o plano de saúde e a escola não leem o diagnóstico: leem a <strong>descrição do dia a dia</strong>. Relatório que só traz o código da doença é o motivo mais comum de pedido negado.</p>
  <p class="tea-fala">“Doutor(a), vou entrar com pedido no INSS e na escola. O senhor(a) poderia fazer um relatório que diga: que o impedimento é de longo prazo, com efeitos por mais de dois anos; o que ele não consegue fazer sozinho na higiene, na alimentação e na comunicação; quais barreiras isso cria na escola; e quantas horas por semana de cada terapia ele precisa — sem limitar o número de sessões?”</p>
  <p><strong>Se o médico resistir:</strong> explique que não é capricho seu, é o que os formulários exigem. Relatórios da fonoaudióloga, da terapeuta ocupacional e da psicóloga somam como prova.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">02</span>
  <h3>Tirar o CPF dele e o Cartão do SUS</h3>
  <p>Criança precisa de CPF próprio para entrar no Cadastro Único e no INSS, e do Cartão SUS para andar na fila da rede pública. Muita gente descobre que falta justo na hora do atendimento.</p>
  <p><strong>Onde:</strong> CPF no site da Receita Federal ou em cartório; Cartão SUS na UBS mais perto de casa ou pelo aplicativo Meu SUS Digital. Leve a certidão de nascimento e seu documento com foto. Sai na hora.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">03</span>
  <h3>Emitir a carteira do autismo — a CIPTEA</h3>
  <p>É a carteirinha que o Governo do DF reconhece no balcão, instituída pela Lei Distrital 6.642/2020. Vale cinco anos, é gratuita e garante atendimento prioritário em qualquer fila. Mais importante: é ela que dispensa laudo depois, na hora de pedir a credencial de estacionamento.</p>
  <p><strong>Onde:</strong> pelo site da Secretaria da Pessoa com Deficiência, <strong>sepd.df.gov.br</strong>, no Cadastro da Pessoa com Deficiência. A via impressa, com cordão, se pede depois na Central da Estação de Metrô da 112 Sul.</p>
  <p><strong>Aproveite:</strong> peça também o cordão de girassol (Lei 14.624/2023), símbolo nacional de deficiência que não se vê por fora. Em aeroporto, banco e fila de supermercado, ele evita que você tenha que explicar tudo de novo a cada vez.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">04</span>
  <h3>Agendar o Cadastro Único no CRAS</h3>
  <p>Agende <strong>hoje</strong>, mesmo que o atendimento só seja daqui a três semanas — a fila do CRAS é o que atrasa todo o resto. O Cadastro Único não é um benefício: é a chave de quatro deles (o BPC, a conta de luz, a contribuição barata do INSS e o programa de casa própria do GDF).</p>
  <p><strong>Onde:</strong> o CRAS da sua região administrativa, pelo <strong>sedes.df.gov.br</strong>.</p>
</div>

<h2>Este mês: entrar com os pedidos</h2>
<p>Aqui os passos correm <strong>ao mesmo tempo</strong>. Não espere a resposta do INSS para procurar a escola, nem o plano de saúde para ir ao CRAS. Cada um anda no seu ritmo, em guichês diferentes.</p>

<div class="tea-passo">
  <span class="tea-num">05</span>
  <h3>Fazer o Cadastro Único, no dia marcado</h3>
  <p>Uma hora de atendimento que destrava meses de benefício. O detalhe que mais se perde é um campo: a criança precisa ficar registrada <strong>como pessoa com deficiência</strong>. É esse campo que faz a conta de luz cair sozinha, sem você pedir nada.</p>
  <p><strong>Leve:</strong> documento de todas as pessoas que moram na casa, comprovante de residência, o laudo e comprovante de renda de quem trabalha.</p>
  <p class="tea-fala">“Quero fazer o Cadastro Único. Tenho um filho com deficiência e vou pedir o BPC. Por favor, registre a deficiência dele no cadastro e me entregue o comprovante com a Folha Resumo.”</p>
  <p><strong>Não saia sem a Folha Resumo.</strong> É o papel que o INSS vai pedir, e voltar ao CRAS só para buscá-lo custa outra manhã inteira.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">06</span>
  <h3>Pedir o BPC pelo aplicativo Meu INSS</h3>
  <p>É um salário mínimo por mês — <strong>R$ 1.621,00</strong> em 2026 — pago enquanto durarem os requisitos. Existe uma condição de renda, e ela é a única pergunta difícil deste roteiro.</p>
  <p><strong>A conta:</strong> some tudo que entra na casa por mês e divida pelo número de pessoas que moram ali. Se der até <strong>R$ 405,25 por pessoa</strong> (um quarto do salário mínimo), o pedido tem boa chance. Se der um pouco mais, peça mesmo assim: o artigo 20-B da Lei 8.742/93 manda levar em conta o quanto a deficiência custa todos os meses.</p>
  <p><strong>Onde:</strong> aplicativo Meu INSS ou telefone 135, em "Benefício Assistencial à Pessoa com Deficiência". Não precisa ir a agência, não precisa de advogado, não precisa pagar ninguém. Anexe laudo, relatórios, receitas e notas de gasto com fraldas, remédios, transporte e terapias.</p>
  <p><strong>Peça cedo, mesmo na dúvida.</strong> O benefício conta da data do pedido, não da data em que sai. Cada mês de espera para protocolar é um mês que não volta.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">07</span>
  <h3>Abrir o caminho das terapias</h3>
  <p>Em dinheiro, este é o passo mais valioso de todos — um acompanhamento intensivo particular custa de R$ 5 mil a R$ 15 mil por mês. E, diferente do BPC, ele <strong>não depende da sua renda</strong>.</p>
  <p><strong>Com plano de saúde:</strong> o plano não pode limitar o número de sessões. As Resoluções Normativas 469/2021 e 539/2022 da ANS tiraram da operadora o poder de fixar teto, e o STJ consolidou o entendimento no Tema 1.295, em março de 2026. Protocole por escrito, com a prescrição do médico, e guarde o número do protocolo. Os prazos são de 10 dias úteis para fonoaudióloga, psicóloga ou terapeuta ocupacional, e 14 dias úteis para médico especialista.</p>
  <p><strong>Pelo SUS:</strong> comece sempre pela UBS do seu endereço — é ela que encaminha para a regulação, que distribui para os serviços especializados: CAPSi, COMPP, CER II de Taguatinga e CEAL-LP.</p>
  <p class="tea-fala">“Quero abrir o caso do meu filho, que tem autismo, e ser encaminhada para a regulação. Pode me dar o número do encaminhamento, por favor?”</p>
  <p><strong>Se o plano negar, limitar ou passar do prazo:</strong> ligue <strong>0800 701 9656</strong> e abra uma reclamação na ANS. É de graça, leva quinze minutos e resolve a maior parte dos casos sem processo.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">08</span>
  <h3>Levar um pedido por escrito à escola</h3>
  <p>Conversa de corredor com a coordenação não vale nada depois. O que vale é papel protocolado. E a lei aqui é firme: recusar matrícula de criança autista dá multa ao gestor, e negar adaptação sem justa causa é crime (artigo 88 da Lei 13.146/2015).</p>
  <p><strong>Peça:</strong> profissional de apoio em sala durante todo o turno; atendimento especializado na Sala de Recursos, no contraturno; turma com número reduzido de alunos; e plano individual por escrito, feito com você. Na rede pública do DF, o apoio em sala é operacionalizado pelo programa Educador Social Voluntário.</p>
  <p><strong>Escola particular não pode cobrar a mais.</strong> Nenhum centavo por apoio ou acessibilidade — "taxa de mediador" não existe legalmente.</p>
  <p class="tea-fala">“Trouxe um requerimento por escrito, em duas vias. Peço que protocolem e me devolvam uma via com o carimbo, o número e a data.”</p>
  <p><strong>Se recusarem ou enrolarem:</strong> leve o caso ao Ministério Público do DF, pelo <strong>mpdft.mp.br</strong>. É gratuito, não precisa de advogado e costuma ser o caminho mais rápido que existe para escola.</p>
</div>

<h2>Nos próximos três meses: colher e se proteger</h2>

<div class="tea-passo">
  <span class="tea-num">09</span>
  <h3>Passe livre no transporte — e para você junto</h3>
  <p>Gratuidade no transporte público do DF. O detalhe que mais gente perde: quando o médico justifica que ele precisa de acompanhante, o cartão sai com <strong>16 passagens por dia</strong> — oito dele e oito suas. Quem leva a criança à terapia três vezes por semana sente no bolso.</p>
  <p><strong>Onde:</strong> posto do BRB Mobilidade na Estação de Metrô da 112 Sul, telefone (61) 3120-9500. Leve laudo, RG e CPF, comprovante de residência, comprovante de renda e uma foto 3×4. <strong>Atenção ao formulário:</strong> a gratuidade do acompanhante só sai se o médico preencher e justificar esse campo específico.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">10</span>
  <h3>Credencial de estacionamento, pelo celular</h3>
  <p>Parece pequeno até o dia de uma crise no estacionamento de um shopping lotado. Encostar perto da porta muda o passeio inteiro.</p>
  <p><strong>Onde:</strong> aplicativo Detran-DF Digital ou o Portal de Serviços do Detran. Quem já tem a CIPTEA <strong>não precisa apresentar laudo</strong> — por isso o passo 3 vem antes deste. A análise leva até dois dias úteis e você imprime em casa, em papel A4.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">11</span>
  <h3>Ir à perícia do INSS — e contar a verdade inteira</h3>
  <p>São duas avaliações: uma com médico perito e outra com assistente social. E aqui vai o conselho que mais muda resultado: <strong>a gente tende a mostrar o melhor dia do filho</strong>. É orgulho de mãe, é natural — e faz o pedido ser negado. Descreva o dia comum e o dia ruim.</p>
  <p><strong>Conte:</strong> quantas horas por dia ele precisa de alguém junto; o que não faz sozinho (banho, comer, vestir, atravessar a rua); como são as crises e o que as provoca; quem da família deixou de trabalhar por causa disso; quanto sai por mês entre remédio, terapia, fralda e transporte. Leve a pasta cheia — pesa a favor.</p>
  <p><strong>Se negarem, não desanime:</strong> são 30 dias para recorrer, de graça, pelo próprio Meu INSS.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">12</span>
  <h3>Reduzir a jornada no trabalho, se você é servidora</h3>
  <p>Servidora pública com filho com deficiência tem direito a <strong>trabalhar menos horas, sem perder salário e sem precisar compensar depois</strong>. Não é favor da chefia: é o artigo 98, §§ 2º e 3º, da Lei 8.112/90, e o Supremo já decidiu no Tema 1.097 que vale para as três esferas — federal, distrital e municipal. Peça por escrito no setor de gestão de pessoas, com o laudo anexado.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">13</span>
  <h3>Os R$ 81,05 que protegem o futuro dele</h3>
  <p>Se você cuida da casa e não tem renda própria, pode se filiar ao INSS pagando <strong>5% do salário mínimo — R$ 81,05 por mês</strong>, no código 1929. Parece pouca coisa e é, provavelmente, a decisão mais importante desta página inteira.</p>
  <p>Filho com deficiência recebe <strong>pensão por morte para o resto da vida</strong> quando o pai ou a mãe segurados falecem — sem o corte aos 21 anos que vale para os outros filhos. Mas isso só existe se pelo menos um de vocês for segurado do INSS. O BPC, sozinho, não deixa nada para ninguém: ele acaba junto com quem recebe. E os dois convivem — contribuir não atrapalha o BPC dele.</p>
  <p><strong>Guarde os relatórios desde agora.</strong> Essa pensão exige provar, lá na frente, que a deficiência já existia antes dos 21 anos. Quem joga fora o prontuário de hoje descobre o problema daqui a trinta anos, quando não dá mais para refazer.</p>
</div>

<h2>Quando sobrar fôlego</h2>

<div class="tea-passo">
  <span class="tea-num">14</span>
  <h3>Inscrever-se no programa de casa própria do GDF</h3>
  <p>O programa Morar Bem, da Codhab, reserva 8% das unidades para pessoas com deficiência e dá 1.500 pontos no cadastro. Exige cinco anos morando no DF e não ser dono de imóvel aqui. A inscrição é gratuita e fica valendo — fazer cedo só ajuda.</p>
</div>

<div class="tea-passo">
  <span class="tea-num">15</span>
  <h3>Montar a pasta da vida dele</h3>
  <p>Uma pasta física e uma no celular, com tudo fotografado: laudos e relatórios com data, relatórios das terapeutas mesmo os antigos, todos os protocolos, notas fiscais de terapia, remédio, fralda e transporte, e os boletins da escola. Parece burocracia e é carinho — é o que poupa você de recomeçar do zero a cada pedido, a cada troca de escola, a cada revisão do INSS.</p>
</div>

<h2>O que <em>não</em> é urgente</h2>
<p>Metade do desespero vem de achar que tudo é para ontem. Não é. Estas quatro coisas aparecem em toda conversa sobre autismo e nenhuma precisa de você agora:</p>
<ul class="artigo-lista">
  <li><strong>Comprar carro com isenção.</strong> O direito existe (IPI, ICMS e IPVA), vale a pena e não tem pressa — só faz sentido quando houver dinheiro para a compra. E as regras de valor e de prazo mudam, então se confere na semana de comprar, não antes.</li>
  <li><strong>Interdição ou curatela.</strong> Só se discute perto dos 18 anos e hoje é medida excepcional. Antes dela existe a tomada de decisão apoiada, bem menos pesada.</li>
  <li><strong>Testamento e seguro de vida.</strong> Importantes, sim — para um ano em que a poeira tenha baixado.</li>
  <li><strong>Contratar advogado agora.</strong> Quase tudo aqui se resolve em aplicativo, balcão e formulário. Advogado entra se houver ação judicial, e a Defensoria Pública do DF faz de graça.</li>
</ul>

<h2>Telefones para guardar</h2>
<ul class="artigo-lista">
  <li><strong>INSS</strong> — BPC, recurso e a guia dos R$ 81,05: 135 ou app Meu INSS</li>
  <li><strong>ANS</strong> — plano negou ou limitou terapia: 0800 701 9656</li>
  <li><strong>BRB Mobilidade</strong> — passe livre, Estação 112 Sul: (61) 3120-9500</li>
  <li><strong>SEPD-DF</strong> — CIPTEA e Cadastro da Pessoa com Deficiência: sepd.df.gov.br</li>
  <li><strong>Saúde do DF</strong> — UBS, CAPSi, COMPP e ouvidoria: 160 ou saude.df.gov.br</li>
  <li><strong>CRAS</strong> — Cadastro Único: sedes.df.gov.br</li>
  <li><strong>MPDFT</strong> — escola recusou matrícula ou apoio: mpdft.mp.br</li>
  <li><strong>Defensoria Pública do DF</strong> — advogado gratuito: defensoria.df.gov.br</li>
</ul>

<p>Se em algum momento você precisar da base legal de cada um desses passos — os artigos, as tabelas de benefícios e modelos de requerimento prontos para protocolar —, ela está no documento companheiro: <a href="/blog/autismo-direitos-df.html">o mapa completo dos direitos da pessoa com TEA no Distrito Federal →</a></p>

<div class="tea-aviso tea-aviso-fim">
  <p><strong>Sobre este guia.</strong> Escrito em 14 de setembro de 2026, com regras e valores conferidos nessa data (salário mínimo de 2026: R$ 1.621,00). É orientação preliminar de utilidade pública: ajuda a começar, mas não substitui advogado inscrito na OAB nem avaliação médica. Valores, tetos e prazos mudam — confirme na fonte oficial antes de qualquer decisão que envolva dinheiro.</p>
</div>
`,
};
