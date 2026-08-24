// =====================================================================
// Villela Finance — Conselho dos Mestres.
//
// Base estruturada de princípios extraídos do manuscrito do Augusto,
// "De Repente Rico!" (dados\livros\revisados\de-repente-rico\
// de-repente-rico-revisado.md). Cada princípio aponta o CAPÍTULO e as
// LINHAS de onde saiu, para que qualquer afirmação possa ser conferida na
// fonte.
//
// Quatro regras que este arquivo não quebra:
//
//   1. NÃO se simula personalidade. Nada de "Buffett diria". O que existe
//      é um princípio atribuído a um autor, com onde ele está no texto.
//   2. NÃO se inventa citação. Os resumos são em linguagem própria; não
//      há aspas atribuídas a ninguém.
//   3. O livro é fonte de PRINCÍPIO, nunca de autoridade contábil,
//      jurídica ou regulatória. Norma vigente e dado verificável sempre
//      prevalecem — e quando conflitam, o conselho é suprimido.
//   4. Quase todo princípio foi escrito para FINANÇAS PESSOAIS. Aplicar a
//      uma empresa exige tradução, e a tradução tem limite. Por isso cada
//      princípio carrega `limitacoes` — e a interface tem de mostrá-las
//      junto do conselho, não num rodapé.
//
// O acionamento é determinístico: cada princípio declara de que FATO do
// razão ele depende. Sem o fato, o princípio não aparece — em vez de
// aparecer sempre, como frase motivacional.
// =====================================================================
'use strict';
const dinheiro = require('./dinheiro');

const OBRA = 'De Repente Rico! (manuscrito do autor)';
const ARQUIVO = 'dados/livros/revisados/de-repente-rico/de-repente-rico-revisado.md';

/**
 * Domínio de ORIGEM do princípio. Importa porque marca a distância entre
 * onde ele foi escrito e onde estamos aplicando.
 */
const DOMINIOS = ['financas_pessoais', 'investimento', 'comportamento', 'negocios'];

const PRINCIPIOS = [
  {
    id: 'clason-pague-se-primeiro',
    autor: 'George S. Clason',
    obraOriginal: 'O Homem Mais Rico da Babilônia',
    capitulo: '3. Seleção das Melhores Ideias: O Homem Mais Rico da Babilônia',
    secao: '3.1. Pague a Si Mesmo Primeiro',
    linhas: [623, 626],
    dominio: 'financas_pessoais',
    resumo: 'Separar uma parcela fixa do que entra ANTES de pagar as despesas, tratando a reserva como a primeira obrigação e não como o que sobra.',
    aplicabilidade: 'A empresa tem resultado positivo recorrente e nenhuma reserva formada.',
    limitacoes: 'Foi escrito para renda pessoal, que é previsível. Empresa de temporada tem receita sazonal: reservar percentual fixo do mês fraco pode faltar caixa no mês seguinte. A tradução honesta é reservar sobre o resultado do período, não sobre a receita.',
    dadosNecessarios: ['resultado do período', 'saldo de caixa', 'previsão de caixa'],
    conselho: 'Tratar a reserva como despesa fixa do mês, não como sobra.',
    contraArgumento: 'Reservar caixa enquanto há dívida cara é matematicamente pior do que amortizar a dívida.',
    acaoSugerida: 'Definir um percentual do resultado mensal e lançá-lo como transferência para uma conta separada, no fechamento.',
    conflitaCom: ['kiyosaki-ativo-gera-caixa'],
  },
  {
    id: 'clason-proteja-do-prejuizo',
    autor: 'George S. Clason',
    obraOriginal: 'O Homem Mais Rico da Babilônia',
    capitulo: '3',
    secao: '3.4. Proteja Seu Dinheiro Contra Perdas (l. 647) · 3.11. Os Muros de Babilônia (l. 765)',
    linhas: [647, 650],
    dominio: 'financas_pessoais',
    resumo: 'Preservar o principal vem antes de buscar retorno; e proteção se constrói antes de precisar dela, não durante a crise.',
    aplicabilidade: 'Há concentração de receita, caixa curto ou ausência de reserva.',
    limitacoes: 'O texto trata de proteção patrimonial pessoal. Numa empresa, "proteção" inclui seguro, contrato e diversificação de canal — coisas que o princípio não detalha.',
    dadosNecessarios: ['concentração de receita por centro de custo', 'previsão de caixa'],
    conselho: 'Reduzir a exposição antes de aumentar o retorno.',
    contraArgumento: 'Proteção excessiva imobiliza capital que renderia mais aplicado; o custo do seguro pode superar o risco coberto.',
    acaoSugerida: 'Listar as três maiores fontes de receita e o que aconteceria com o caixa se a maior parasse por 60 dias.',
    conflitaCom: [],
  },
  {
    id: 'graham-margem-de-seguranca',
    autor: 'Benjamin Graham',
    obraOriginal: 'O Investidor Inteligente',
    capitulo: '4. O Investidor Inteligente de Benjamin Graham',
    secao: '4.2. A Importância da Margem de Segurança',
    linhas: [961, 965],
    dominio: 'investimento',
    resumo: 'Decidir com folga em relação ao valor estimado, de modo que um erro de cálculo ou um imprevisto não destrua a decisão.',
    aplicabilidade: 'Há decisão de investimento, obra ou compromisso de longo prazo em avaliação.',
    limitacoes: 'Foi formulado para compra de ações com valor intrínseco calculável. Numa decisão operacional (uma reforma, um contrato), "valor intrínseco" não existe do mesmo jeito — o que se transporta é a ideia de folga, não a fórmula.',
    dadosNecessarios: ['previsão de caixa', 'orçado × realizado'],
    conselho: 'Dimensionar o compromisso pelo cenário pessimista, não pelo esperado.',
    contraArgumento: 'Margem excessiva faz perder oportunidade; em mercado competitivo, quem só compra com desconto grande não compra.',
    acaoSugerida: 'Antes de assumir a despesa, verificar se o cenário pessimista da previsão de caixa ainda a suporta.',
    conflitaCom: ['hill-decisao-rapida'],
  },
  {
    id: 'graham-investir-nao-especular',
    autor: 'Benjamin Graham',
    obraOriginal: 'O Investidor Inteligente',
    capitulo: '4',
    secao: '4.1. Investimento vs. Especulação',
    linhas: [943, 949],
    dominio: 'investimento',
    resumo: 'Investimento é decisão apoiada em análise, com preservação do principal; o que depende de prever o movimento de curto prazo é outra coisa.',
    aplicabilidade: 'Sempre que houver decisão de alocar capital.',
    limitacoes: 'A distinção é do mercado de capitais. Aplicada a negócio próprio, quase toda decisão tem componente especulativo — o valor do princípio é obrigar a nomear qual é qual.',
    dadosNecessarios: [],
    conselho: 'Nomear, antes de decidir, se a decisão se apoia em análise ou em expectativa de curto prazo.',
    contraArgumento: 'A fronteira é menos nítida do que o texto sugere; empreender é, em parte, apostar.',
    acaoSugerida: 'Escrever a tese e a condição que a invalidaria ANTES de comprometer o capital.',
    conflitaCom: [],
  },
  {
    id: 'kiyosaki-ativo-gera-caixa',
    autor: 'Robert T. Kiyosaki',
    obraOriginal: 'Pai Rico, Pai Pobre',
    capitulo: '5. Pai Rico, Pai Pobre de Robert T. Kiyosaki',
    secao: '5.3. A Diferença entre Ativos e Passivos · 5.6. Controle de Fluxo de Caixa',
    linhas: [1181, 1221],
    dominio: 'negocios',
    resumo: 'Classificar o que se possui pelo efeito no fluxo de caixa: o que traz dinheiro para dentro e o que leva dinheiro para fora, independentemente de como o balanço o chame.',
    aplicabilidade: 'Há imóvel, equipamento ou contrato consumindo caixa sem receita correspondente.',
    limitacoes: 'A definição do autor NÃO é a definição contábil de ativo, e confundir as duas atrapalha na hora de fechar o balanço. Aqui ela vale como lente de gestão, não como critério de classificação no plano de contas.',
    dadosNecessarios: ['resultado por centro de custo', 'fluxo de caixa'],
    conselho: 'Medir cada imóvel pelo caixa que gera, não pelo valor que tem.',
    contraArgumento: 'Ativo que hoje consome caixa pode estar em maturação (imóvel novo, reforma recente); julgar só pelo mês penaliza o investimento recente.',
    acaoSugerida: 'Abrir o resultado por centro de custo e listar os que ficaram negativos em três meses seguidos.',
    conflitaCom: ['clason-pague-se-primeiro'],
  },
  {
    id: 'hill-decisao-rapida',
    autor: 'Napoleon Hill',
    obraOriginal: 'Quem Pensa Enriquece',
    capitulo: '6. Quem Pensa Enriquece de Napoleon Hill',
    secao: '6.7. Decisão',
    linhas: [1335, 1341],
    dominio: 'comportamento',
    resumo: 'Decidir com firmeza e demorar a mudar de ideia é apontado como traço comum entre pessoas bem-sucedidas; a indecisão prolongada tem custo próprio.',
    aplicabilidade: 'Há decisão parada há semanas com dado suficiente para decidir.',
    limitacoes: 'Baseia-se em observação biográfica, não em evidência controlada — há viés de sobrevivência óbvio (não se entrevista quem decidiu rápido e quebrou). Em decisão financeira material, o sistema exige o contrário: segunda pessoa e alçada.',
    dadosNecessarios: ['aprovações pendentes'],
    conselho: 'Não deixar decisão madura envelhecer na caixa de aprovações.',
    contraArgumento: 'Justamente onde o dinheiro é material, decidir devagar e a quatro olhos é o controle que evita fraude e erro.',
    acaoSugerida: 'Revisar as solicitações pendentes há mais de uma semana e decidir ou recusar com motivo.',
    conflitaCom: ['graham-margem-de-seguranca', 'housel-paciencia'],
  },
  {
    id: 'housel-paciencia',
    autor: 'Morgan Housel',
    obraOriginal: 'Psicologia Financeira',
    capitulo: '7. Psicologia Financeira de Morgan Housel',
    secao: '7.5. Ganhe com Paciência e Consistência (l. 1499) · 7.11. Efeito Composto (l. 1581)',
    linhas: [1499, 1505],
    dominio: 'comportamento',
    resumo: 'O resultado vem menos de acertos brilhantes e mais de consistência mantida por muito tempo sem interrupção.',
    aplicabilidade: 'Há série histórica suficiente para comparar meses.',
    limitacoes: 'Consistência só compõe quando a base é positiva; manter por muito tempo uma operação que perde dinheiro compõe prejuízo. O princípio pressupõe que a coisa mantida funciona.',
    dadosNecessarios: ['série mensal de resultado'],
    conselho: 'Preferir a melhoria pequena e sustentada à mudança grande e episódica.',
    contraArgumento: 'Há situações em que persistir é o erro — o próprio autor trata de risco e cauda longa.',
    acaoSugerida: 'Comparar o resultado dos últimos seis meses antes de mudar a estratégia por causa de um mês ruim.',
    conflitaCom: ['hill-decisao-rapida'],
  },
  {
    id: 'housel-sorte-e-risco',
    autor: 'Morgan Housel',
    obraOriginal: 'Psicologia Financeira',
    capitulo: '7',
    secao: '7.2. Sorte e Risco',
    linhas: [1473, 1479],
    dominio: 'comportamento',
    resumo: 'Resultado não é prova de decisão: sorte e risco produzem desfechos que se parecem com mérito e com erro.',
    aplicabilidade: 'Um mês veio muito acima ou muito abaixo do padrão.',
    limitacoes: 'Nenhuma para o uso aqui — é um alerta epistêmico, não uma regra operacional. O risco é usá-lo como desculpa para não investigar nada.',
    dadosNecessarios: ['série mensal de resultado', 'anomalias detectadas'],
    conselho: 'Antes de creditar um mês excepcional à estratégia, procurar a causa concreta.',
    contraArgumento: 'Levado ao extremo, impede aprender com o que deu certo.',
    acaoSugerida: 'Para o mês fora da curva, identificar no razão o lançamento que o explica.',
    conflitaCom: [],
  },
  {
    id: 'stanley-frugalidade',
    autor: 'Thomas J. Stanley e William D. Danko',
    obraOriginal: 'O Milionário Mora ao Lado',
    capitulo: '10. O Milionário Mora ao Lado',
    secao: '10.3. Frugalidade · 10.5. Orçamento e Planejamento',
    linhas: [2145, 2170],
    dominio: 'financas_pessoais',
    resumo: 'Acumulação de patrimônio associa-se mais a gasto contido e planejamento do que a renda alta; quem acumula tende a orçar.',
    aplicabilidade: 'A empresa não tem orçamento aprovado, ou o realizado supera o orçado com frequência.',
    limitacoes: 'É estatística descritiva de famílias americanas dos anos 90, não regra causal — e não se transporta direto para custo de empresa, onde cortar às vezes destrói receita.',
    dadosNecessarios: ['orçado × realizado'],
    conselho: 'Orçar é o hábito, não o corte.',
    contraArgumento: 'Em hospedagem, reduzir gasto com manutenção e enxoval derruba avaliação e diária — nem toda economia é economia.',
    acaoSugerida: 'Manter um orçamento aprovado por exercício e revisar mensalmente os cinco maiores desvios.',
    conflitaCom: [],
  },
  {
    id: 'hammond-aversao-a-perda',
    autor: 'Claudia Hammond',
    obraOriginal: 'A Mente Acima do Dinheiro',
    capitulo: '11. A Mente Acima do Dinheiro',
    secao: '11.5. Aversão à Perda · 11.6. Contabilidade Mental',
    linhas: [2325, 2338],
    dominio: 'comportamento',
    resumo: 'A perda pesa psicologicamente mais que o ganho equivalente, e as pessoas separam o dinheiro em compartimentos mentais e tratam cada um como se não fosse o mesmo dinheiro.',
    aplicabilidade: 'Há decisão de cortar, encerrar ou renegociar algo já em curso.',
    limitacoes: 'É descrição de viés, não prescrição. Saber do viés não o elimina — o que ajuda é o procedimento (comparar contra o orçado, decidir a dois), não a consciência.',
    dadosNecessarios: ['resultado por centro de custo'],
    conselho: 'O que já foi gasto não deve pesar na decisão sobre continuar.',
    contraArgumento: 'Nem todo custo passado é irrecuperável: há investimento em maturação cuja interrupção destrói valor real.',
    acaoSugerida: 'Ao avaliar um imóvel ou contrato deficitário, olhar só o fluxo futuro esperado.',
    conflitaCom: [],
  },
  {
    id: 'arcuri-reserva-e-dividas',
    autor: 'Nathalia Arcuri',
    obraOriginal: 'Me Poupe!',
    capitulo: '12. Me Poupe! de Nathalia Arcuri',
    secao: '12.4. Elimine Dívidas · 12.5. Monte Sua Reserva de Emergência',
    linhas: [2437, 2450],
    dominio: 'financas_pessoais',
    resumo: 'A ordem importa: conhecer a própria situação, eliminar dívida cara e montar reserva vêm antes de buscar rendimento.',
    aplicabilidade: 'Há dívida com juros, inadimplência relevante ou ausência de reserva.',
    limitacoes: 'Escrito para pessoa física. Empresa opera com capital de giro e dívida barata pode ser saudável — a leitura direta ("toda dívida é ruim") não se sustenta em negócio.',
    dadosNecessarios: ['aging a pagar', 'juros e multas pagos', 'previsão de caixa'],
    conselho: 'Quitar o que cobra juros antes de aplicar o que sobra.',
    contraArgumento: 'Dívida com custo abaixo do retorno da operação é alavancagem, não problema.',
    acaoSugerida: 'Somar juros e multas pagos nos últimos meses; se for material, priorizar os títulos que os geram.',
    conflitaCom: ['clason-pague-se-primeiro'],
  },
  {
    id: 'barsi-caixa-e-solidez',
    autor: 'Luiz Barsi Filho',
    obraOriginal: 'O Rei dos Dividendos',
    capitulo: '13. O Rei dos Dividendos de Luiz Barsi Filho',
    secao: '13.3. Escolha de Empresas Sólidas · 13.5. Análise de Fundamentos · 13.6. Paciência e Disciplina',
    linhas: [2543, 2575],
    dominio: 'investimento',
    resumo: 'Preferir negócio que gera caixa recorrente e sustentável, avaliado pelos fundamentos, mantido por muito tempo.',
    aplicabilidade: 'Há decisão sobre onde reinvestir o resultado.',
    limitacoes: 'É critério para escolher empresa listada em bolsa. Aplicado ao próprio negócio, vira uma pergunta ("esta operação gera caixa recorrente?"), não um método de seleção.',
    dadosNecessarios: ['fluxo de caixa', 'resultado por centro de custo'],
    conselho: 'Julgar cada operação pela recorrência do caixa que ela produz.',
    contraArgumento: 'Foco em recorrência pode fazer recusar oportunidade de retorno alto e não recorrente (um evento, uma venda).',
    acaoSugerida: 'Separar, no resultado por centro, o que é receita recorrente do que é pontual.',
    conflitaCom: [],
  },
];

// =====================================================================
// Acionamento
// =====================================================================

/**
 * Cada gatilho é uma FUNÇÃO PURA sobre fatos já calculados por outros
 * módulos (DRE, aging, previsão, briefing do CFO). Nenhum princípio se
 * aciona por si: é o número que o chama, e o número aparece junto.
 */
const GATILHOS = {
  'clason-pague-se-primeiro': (f) =>
    f.resultadoCents > 0 && f.caixaCents < f.despesaMensalMediaCents
      ? { porque: `O mês deu resultado positivo (${dinheiro.formatar(f.resultadoCents)}), mas o caixa (${dinheiro.formatar(f.caixaCents)}) é menor que um mês de despesa (${dinheiro.formatar(f.despesaMensalMediaCents)}).`, confianca: 75 }
      : null,

  'clason-proteja-do-prejuizo': (f) =>
    f.concentracaoMaior >= 0.5
      ? { porque: `${Math.round(f.concentracaoMaior * 100)}% da receita do mês veio de uma única propriedade.`, confianca: 70 }
      : null,

  'graham-margem-de-seguranca': (f) =>
    f.caixaFicaNegativo
      ? { porque: `A previsão de caixa fica negativa em ${f.caixaNegativoEm} em pelo menos um cenário.`, confianca: 70 }
      : null,

  'kiyosaki-ativo-gera-caixa': (f) =>
    (f.centrosNegativos || []).length
      ? { porque: `${f.centrosNegativos.length} centro(s) de custo com resultado negativo no mês: ${f.centrosNegativos.join(', ')}.`, confianca: 80 }
      : null,

  'hill-decisao-rapida': (f) =>
    f.aprovacoesPendentes > 0
      ? { porque: `${f.aprovacoesPendentes} solicitação(ões) aguardando decisão.`, confianca: 60 }
      : null,

  'housel-paciencia': (f) =>
    f.mesesDeHistorico >= 3
      ? { porque: `Há ${f.mesesDeHistorico} meses de histórico — base suficiente para comparar antes de mudar de rumo.`, confianca: 55 }
      : null,

  'housel-sorte-e-risco': (f) =>
    f.mesForaDaCurva
      ? { porque: `O resultado do mês está fora do padrão dos meses anteriores.`, confianca: 65 }
      : null,

  // `=== false` e não `!f.x`: com o fato AUSENTE (undefined), `!undefined`
  // é true e o princípio apareceria dizendo que não há orçamento sem que
  // ninguém tenha olhado. Ausência de informação não é informação negativa.
  'stanley-frugalidade': (f) =>
    f.temOrcamentoAprovado === false
      ? { porque: 'Não há orçamento aprovado para o exercício — não há contra o que comparar o realizado.', confianca: 85 }
      : null,

  'hammond-aversao-a-perda': (f) =>
    (f.centrosNegativos || []).length
      ? { porque: 'Há operação deficitária em avaliação, situação em que o custo já gasto costuma pesar indevidamente.', confianca: 50 }
      : null,

  'arcuri-reserva-e-dividas': (f) =>
    f.jurosPagosCents > 0 || f.percentualVencidoPagar > 0
      ? { porque: f.jurosPagosCents > 0
        ? `Foram pagos ${dinheiro.formatar(f.jurosPagosCents)} em juros e multas no período.`
        : `Há ${f.percentualVencidoPagar}% das contas a pagar vencidas.`, confianca: 80 }
      : null,

  'barsi-caixa-e-solidez': (f) =>
    f.resultadoCents > 0
      ? { porque: `Há resultado positivo (${dinheiro.formatar(f.resultadoCents)}) e, portanto, decisão de reinvestimento a tomar.`, confianca: 50 }
      : null,
};

const porId = (id) => PRINCIPIOS.find(p => p.id === id) || null;

/**
 * Monta os conselhos a partir dos fatos. Devolve, para cada um, TUDO o que
 * a interface precisa mostrar junto: contexto, fatos, fonte, premissas,
 * confiança, limitações e a divergência com outros mestres.
 */
function avaliar(fatos = {}) {
  const acionados = [];
  for (const p of PRINCIPIOS) {
    const gatilho = GATILHOS[p.id];
    if (!gatilho) continue;
    let r;
    try { r = gatilho(fatos); } catch (_) { r = null; }
    if (!r) continue;

    const divergentes = (p.conflitaCom || []).map(porId).filter(Boolean);
    acionados.push({
      id: p.id,
      autor: p.autor,
      obraOriginal: p.obraOriginal,
      fonte: {
        obra: OBRA,
        arquivo: ARQUIVO,
        capitulo: p.capitulo,
        secao: p.secao,
        linhas: p.linhas,
        // Quem duvidar abre o arquivo nessas linhas e confere.
        comoConferir: `${ARQUIVO}, linhas ${p.linhas[0]}–${p.linhas[1]}`,
      },
      principio: p.resumo,
      dominioDeOrigem: p.dominio,
      contexto: r.porque,
      premissa: p.aplicabilidade,
      confianca: r.confianca,
      limitacoes: p.limitacoes,
      conselho: p.conselho,
      contraArgumento: p.contraArgumento,
      acaoSugerida: p.acaoSugerida,
      divergencia: divergentes.map(d => ({
        id: d.id, autor: d.autor, principio: d.resumo,
        tensao: `${p.autor} e ${d.autor} apontam para lados diferentes aqui — a escolha é do gestor, não do sistema.`,
      })),
    });
  }

  acionados.sort((a, b) => b.confianca - a.confianca);
  return {
    conselhos: acionados,
    avaliados: PRINCIPIOS.length,
    aviso: 'Princípios de um livro de finanças, em sua maioria escritos para finanças PESSOAIS. ' +
      'São lente de leitura, não norma: nenhum substitui contador, advogado ou regra vigente. ' +
      'Cada conselho traz onde conferir no texto e o que o limita.',
    naoFaz: 'Não simula os autores nem os faz falar. Não há citação atribuída — os resumos são ' +
      'em linguagem própria, com a localização no manuscrito para conferência.',
  };
}

/**
 * Reúne os fatos de que os gatilhos dependem, a partir dos módulos que já
 * calculam cada um. Nenhum número é recalculado aqui.
 */
function coletarFatos(entidadeId, competencia, { dre, aging, agingPagar, previsao, porCentro, cfo, orcamentoAprovado, aprovacoesPendentes, caixaCents, jurosPagosCents, serieResultado }) {
  const centrosNegativos = (porCentro && porCentro.linhas || [])
    .filter(l => l.resultadoCents < 0).map(l => l.codigo || l.nome);
  const totalReceita = (porCentro && porCentro.linhas || []).reduce((s, l) => s + l.receitaCents, 0);
  const maior = (porCentro && porCentro.linhas || []).slice().sort((a, b) => b.receitaCents - a.receitaCents)[0];
  const pior = (previsao && previsao.cenarios || []).find(c => c.faltaCaixa);
  const serie = (serieResultado || []).filter(v => v !== 0);
  const media = serie.length ? serie.reduce((s, v) => s + v, 0) / serie.length : 0;
  const atual = dre ? dre.resumo.resultadoCents : 0;

  return {
    resultadoCents: atual,
    despesaMensalMediaCents: dre ? dre.resumo.despesaTotalCents : 0,
    caixaCents: caixaCents || 0,
    concentracaoMaior: totalReceita > 0 && maior ? maior.receitaCents / totalReceita : 0,
    centrosNegativos,
    caixaFicaNegativo: !!pior,
    caixaNegativoEm: pior ? pior.menorSaldoEm : '',
    aprovacoesPendentes: aprovacoesPendentes || 0,
    temOrcamentoAprovado: !!orcamentoAprovado,
    jurosPagosCents: jurosPagosCents || 0,
    percentualVencidoPagar: agingPagar ? agingPagar.percentualVencido : 0,
    percentualVencidoReceber: aging ? aging.percentualVencido : 0,
    mesesDeHistorico: serie.length,
    // Fora da curva: mais de 50% distante da média dos meses anteriores.
    mesForaDaCurva: serie.length >= 3 && media !== 0 && Math.abs(atual - media) > Math.abs(media) * 0.5,
    anomalias: (cfo && cfo.constatacoes || []).length,
  };
}

/**
 * Monta o conselho de uma entidade a partir dos módulos que calculam cada
 * número. Fica aqui (e não na rota) porque duas portas usam — a do
 * assinante e a do agente —, e a montagem tem de ser a MESMA nas duas.
 *
 * `seguro()` degrada por parte: se a previsão de caixa falhar, os
 * princípios que não dependem dela continuam valendo.
 */
function montarPara(entidadeId, competencia) {
  const relatorios = require('./relatorios');
  const caixa = require('./caixa');
  const titulos = require('./titulos');
  const orcamento = require('./orcamento');
  const aprovacoes = require('./aprovacoes');
  const ledger = require('./ledger');
  const planoContas = require('./plano-contas');
  const cfo = require('./cfo');
  const seguro = (fn, padrao) => { try { return fn(); } catch (_) { return padrao; } };

  const dre = relatorios.dre(entidadeId, competencia);
  const jurosPagos = seguro(() => ledger.saldo(planoContas.chave(entidadeId, 'jurosPagos').id, {
    desde: `${competencia.slice(0, 4)}-01-01`, ate: relatorios.intervalo(competencia).ate,
  }).saldoCents, 0);
  const serieResultado = seguro(() => {
    const out = [];
    for (let i = 6; i >= 1; i--) out.push(relatorios.dre(entidadeId, cfo.mesAntes(competencia, i)).resumo.resultadoCents);
    return out;
  }, []);

  const fatos = coletarFatos(entidadeId, competencia, {
    dre,
    porCentro: seguro(() => relatorios.porCentroCusto(entidadeId, competencia), { linhas: [] }),
    previsao: seguro(() => caixa.previsao(entidadeId, { dias: 90 }), null),
    aging: seguro(() => titulos.aging(entidadeId, { especie: 'receber' }), null),
    agingPagar: seguro(() => titulos.aging(entidadeId, { especie: 'pagar' }), null),
    cfo: seguro(() => cfo.briefing(entidadeId, competencia), { constatacoes: [] }),
    // `|| false` de propósito: aqui SABEMOS se há orçamento (consultamos).
    // Ausência de consulta seria `undefined`, e o gatilho ignora undefined.
    orcamentoAprovado: seguro(
      () => orcamento.listar(entidadeId, { exercicio: competencia.slice(0, 4), status: 'aprovado' })[0] || false, false),
    aprovacoesPendentes: seguro(() => aprovacoes.pendentes(50).length, 0),
    caixaCents: seguro(() => relatorios.posicaoDeCaixa(entidadeId, {}).totalCents, 0),
    jurosPagosCents: jurosPagos,
    serieResultado,
  });
  return Object.assign({ competencia, fatos }, avaliar(fatos));
}

module.exports = { PRINCIPIOS, DOMINIOS, GATILHOS, OBRA, ARQUIVO, avaliar, coletarFatos, porId, montarPara };
