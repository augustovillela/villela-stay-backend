// =====================================================================
// Villela Stay Manager — ONDA LIVRO · catálogos e sementes.
//
// Tudo o que o livro "Claude AI na Prática para Hospedagens" entrega pronto
// e que o assinante recebe DENTRO do sistema: checklists do Apêndice E,
// modelos de mensagem do Apêndice D, a biblioteca de prompts dos capítulos,
// o catálogo de crises do Cap. 39, os gatilhos de escalonamento do Cap. 33,
// a matriz de permissões e as sete decisões humanas do Cap. 8, e o
// dicionário de métricas do Apêndice F.
//
// Regra de projeto: são SEMENTES. O assinante edita tudo; o seed roda uma
// vez por tenant (tabela lv_seed) e nunca sobrescreve o que foi editado.
// =====================================================================
'use strict';

// ---------------------------------------------------------------------
// Cap. 8 · as sete decisões que nunca são automáticas. Curta de propósito:
// quanto mais longa a lista de proibições, menos ela é respeitada.
// ---------------------------------------------------------------------
const DECISOES_HUMANAS = [
  { n: 1, titulo: 'Dinheiro que sai ou deixa de entrar', detalhe: 'Reembolso, desconto, cancelamento de cobrança, repasse, pagamento de fornecedor, compra acima do limite.' },
  { n: 2, titulo: 'Calendário', detalhe: 'Confirmar, alterar, cancelar reserva, bloquear e desbloquear data. Calendário alterado por engano gera overbooking.' },
  { n: 3, titulo: 'Preço publicado', detalhe: 'A recomendação pode ser automática; a publicação no canal, não.' },
  { n: 4, titulo: 'Mensagem enviada a pessoa real', detalhe: 'Preparar sim, enviar com aprovação — exceto mensagem transacional previsível de texto fixo já aprovado.' },
  { n: 5, titulo: 'Documento com efeito jurídico', detalhe: 'Contrato, notificação, rescisão, resposta a reclamação formal.' },
  { n: 6, titulo: 'Compartilhamento de dado pessoal', detalhe: 'Nenhum agente decide sozinho enviar documento, contato ou histórico de alguém.' },
  { n: 7, titulo: 'Ação irreversível sobre acesso', detalhe: 'Trocar senha de fechadura, revogar credencial, desativar integração.' },
];

// o complemento indispensável: a lista do que a máquina PODE fazer sozinha
// precisa existir com a mesma clareza, ou ninguém usa o sistema.
const PODE_SOZINHA = [
  'Ler qualquer dado autorizado', 'Calcular', 'Classificar', 'Resumir',
  'Montar rascunho', 'Cruzar dados de fontes autorizadas', 'Gerar relatório interno',
  'Avisar você', 'Conferir coerência do cadastro', 'Preparar mensagem para conferência',
];

// ---------------------------------------------------------------------
// Cap. 8 · matriz de permissões (o modelo do livro, editável no painel).
// Agente entra na matriz como pessoa — com permissão MAIS ESTREITA.
// ---------------------------------------------------------------------
const PERMISSOES_SEED = [
  { papel: 'gestor', hospede: 'le', operacao: 'le_escreve', financeiro: 'le_escreve', proprietario: 'le_escreve', contratos: 'le_escreve', eh_agente: 0 },
  { papel: 'atendimento', hospede: 'le', operacao: 'le_escreve', financeiro: '', proprietario: '', contratos: '', eh_agente: 0 },
  { papel: 'operacao', hospede: '', operacao: 'le', financeiro: '', proprietario: '', contratos: '', eh_agente: 0 },
  { papel: 'financeiro', hospede: '', operacao: 'le', financeiro: 'le_escreve', proprietario: 'le', contratos: 'le', eh_agente: 0 },
  { papel: 'manutencao', hospede: '', operacao: 'le', financeiro: '', proprietario: '', contratos: '', eh_agente: 0 },
  { papel: 'contador_externo', hospede: '', operacao: '', financeiro: 'le', proprietario: '', contratos: '', eh_agente: 0 },
  // agentes: sempre mais estreitos que a pessoa que auxiliam
  { papel: 'agente_operacao', hospede: '', operacao: 'le', financeiro: '', proprietario: '', contratos: '', eh_agente: 1 },
  { papel: 'agente_comercial', hospede: 'le', operacao: 'le', financeiro: '', proprietario: '', contratos: '', eh_agente: 1 },
  { papel: 'agente_financeiro', hospede: '', operacao: 'le', financeiro: 'le', proprietario: '', contratos: 'le', eh_agente: 1 },
  { papel: 'agente_concierge', hospede: 'le', operacao: 'le', financeiro: '', proprietario: '', contratos: '', eh_agente: 1 },
];

// ---------------------------------------------------------------------
// Apêndice F · dicionário de métricas: uma definição, um lugar.
// ---------------------------------------------------------------------
const DICIONARIO_METRICAS = [
  { chave: 'ocupacao', nome: 'Taxa de ocupação', formula: 'noites ocupadas ÷ noites disponíveis', nota: 'Noites disponíveis EXCLUEM bloqueio de manutenção. Em anúncios interligados o mesmo espaço conta uma vez.' },
  { chave: 'adr', nome: 'ADR — diária média', formula: 'receita de hospedagem ÷ noites ocupadas', nota: 'NÃO inclui taxa de limpeza; incluí-la infla o ADR e esconde a queda real do preço.' },
  { chave: 'revpar', nome: 'RevPAR', formula: 'receita de hospedagem ÷ noites disponíveis = ADR × ocupação', nota: 'É o indicador que resolve a discussão entre encher a casa e cobrar bem.' },
  { chave: 'receita_bruta', nome: 'Receita bruta', formula: 'soma do valor total das reservas com check-in no período', nota: 'Competência por check-in. NUNCA tarifa × noites.' },
  { chave: 'receita_liquida', nome: 'Receita líquida', formula: 'receita bruta − comissão do canal', nota: 'Todo relatório declara qual das duas está usando.' },
  { chave: 'margem_contribuicao', nome: 'Margem de contribuição', formula: 'receita líquida − custos variáveis', nota: 'Se for negativa, cada reserva piora a situação.' },
  { chave: 'margem_operacional', nome: 'Margem operacional', formula: '(receita líquida − custos totais) ÷ receita líquida', nota: 'Custos totais incluem fixos e provisões.' },
  { chave: 'lucro_reserva', nome: 'Lucro por reserva', formula: 'receita líquida da reserva − custos variáveis dela', nota: 'A métrica que mais falta e a que mais muda decisão.' },
  { chave: 'estadia_media', nome: 'Estadia média', formula: 'noites ocupadas ÷ nº de reservas', nota: 'Caindo = mais limpezas e mais atendimento para a mesma receita.' },
  { chave: 'antecedencia_media', nome: 'Antecedência média', formula: 'média dos dias entre reserva e check-in', nota: 'Caindo é sinal de alerta comercial e de aperto operacional.' },
  { chave: 'conversao', nome: 'Taxa de conversão', formula: 'reservas ÷ oportunidades', nota: 'Declare o denominador: consultas, cotações enviadas ou visualizações.' },
  { chave: 'cancelamento', nome: 'Taxa de cancelamento', formula: 'reservas canceladas ÷ reservas confirmadas', nota: 'Calcule por canal e por plano tarifário.' },
  { chave: 'cac', nome: 'CAC por canal', formula: '(comissões + anúncio pago + custo do tempo comercial) ÷ reservas do canal', nota: 'Comissão alta pode ter CAC menor que canal direto caro de operar.' },
  { chave: 'retorno', nome: 'Taxa de retorno de hóspede', formula: 'hóspedes que voltaram ÷ total de hóspedes do período', nota: 'A métrica de maior valor estratégico e a menos medida.' },
  { chave: 'nota_media', nome: 'Nota média', formula: 'média das avaliações do período', nota: 'Mais útil que a nota: o assunto mais citado nas críticas.' },
];

// os SEIS do painel (Apêndice F) — comparados sempre contra o mesmo período do ano anterior
const SEIS_DO_PAINEL = ['ocupacao', 'adr', 'revpar', 'receita_liquida', 'margem_operacional', 'nota_media'];

// ---------------------------------------------------------------------
// Cap. 23 · motivos de perda em CATEGORIA FECHADA (texto livre não ensina).
// ---------------------------------------------------------------------
const MOTIVOS_PERDA = [
  ['preco', 'Preço', 'comercial'],
  ['data_indisponivel', 'Data indisponível', 'produto'],
  ['capacidade', 'Capacidade', 'produto'],
  ['demora_resposta', 'Demora na resposta', 'processo'],
  ['escolheu_outro', 'Escolheu outro', 'comercial'],
  ['sumiu', 'Sumiu', 'processo'],
  ['fora_do_perfil', 'Fora do perfil', 'comercial'],
];
const ESTAGIOS_FUNIL = ['novo', 'qualificado', 'cotado', 'negociacao', 'ganho', 'perdido'];

// ---------------------------------------------------------------------
// Cap. 33 · gatilhos de escalonamento. Por ASSUNTO, nunca por sentimento.
// A verificação roda ANTES de qualquer tentativa de resposta.
// ---------------------------------------------------------------------
const GATILHOS_SEED = [
  ['emergencia', 'emergencia'], ['fogo', 'emergencia'], ['incendio', 'emergencia'], ['gas', 'emergencia'],
  ['cheiro', 'emergencia'], ['vazamento', 'emergencia'], ['alagou', 'emergencia'], ['energia', 'emergencia'],
  ['sem luz', 'emergencia'], ['sem agua', 'emergencia'], ['agua', 'emergencia'],
  ['machucado', 'emergencia'], ['ferido', 'emergencia'], ['febre', 'emergencia'], ['remedio', 'emergencia'],
  ['ambulancia', 'emergencia'], ['socorro', 'emergencia'],
  ['policia', 'seguranca'], ['roubo', 'seguranca'], ['furto', 'seguranca'], ['invasao', 'seguranca'],
  ['ameaca', 'seguranca'],
  ['trancado', 'acesso'], ['nao consigo entrar', 'acesso'], ['fechadura', 'acesso'], ['chave', 'acesso'],
  ['senha', 'acesso'], ['codigo', 'acesso'],
  ['reembolso', 'dinheiro'], ['estorno', 'dinheiro'], ['desconto', 'dinheiro'], ['cobranca', 'dinheiro'],
  ['dano', 'dinheiro'], ['caucao', 'dinheiro'],
  ['cancelar', 'reserva'], ['cancelamento', 'reserva'], ['estender', 'reserva'], ['antecipar', 'reserva'],
  ['trocar de casa', 'reserva'], ['late check', 'reserva'], ['saida tardia', 'reserva'],
  ['reclamacao', 'insatisfacao'], ['insatisfeito', 'insatisfacao'], ['pessimo', 'insatisfacao'],
  ['advogado', 'insatisfacao'], ['procon', 'insatisfacao'],
  ['atendimento', 'pessoa'], ['falar com alguem', 'pessoa'], ['me liga', 'pessoa'],
  ['vizinho', 'pessoa'], ['condominio', 'pessoa'], ['portaria', 'pessoa'],
];

// ---------------------------------------------------------------------
// Cap. 39 · catálogo de crises. Cada uma responde: como se detecta, quem
// decide, o que se faz nas primeiras 2h, o que se diz, e quem paga.
// ---------------------------------------------------------------------
const CRISES_SEED = [
  {
    chave: 'agua_energia', titulo: 'Falta de água ou energia',
    deteccao: 'Aviso do hóspede, alarme de consumo ou comunicado da concessionária.',
    quem_decide: 'Gestor de plantão.',
    primeiras_2h: 'Verificar se é geral ou só da unidade. Geral: informar com honestidade e previsão. Da unidade: acionar técnico. Prolongada: avaliar realocação.',
    o_que_dizer: 'O que aconteceu, se é geral, o que já foi acionado e quando haverá nova informação. Nunca prometer prazo de terceiro.',
    quem_paga: 'Operação — e a realocação, se houver, é decisão do gestor.',
  },
  {
    chave: 'internet', titulo: 'Internet caída',
    deteccao: 'Aviso do hóspede (é mais reclamado do que se imagina, sobretudo com hóspede a trabalho).',
    quem_decide: 'Plantão.',
    primeiras_2h: 'Reiniciar equipamento com o hóspede pelo manual; acionar o provedor; oferecer o plano B (roteador reserva ou modem móvel).',
    o_que_dizer: 'Reconhecer, informar o plano B disponível e o protocolo aberto com o provedor.',
    quem_paga: 'Operação.',
  },
  {
    chave: 'acesso', titulo: 'Fechadura ou acesso — hóspede trancado do lado de fora',
    deteccao: 'Mensagem do hóspede. É emergência em qualquer horário.',
    quem_decide: 'Plantão, imediatamente.',
    primeiras_2h: 'Contato humano em minutos. Chaveiro de plantão do cadastro; chave física de reserva com alguém da equipe.',
    o_que_dizer: 'Alguém está a caminho, com previsão real. Nunca deixar o hóspede esperando sem retorno.',
    quem_paga: 'Operação.',
  },
  {
    chave: 'vazamento', titulo: 'Vazamento ou alagamento',
    deteccao: 'Aviso do hóspede, da equipe ou do vizinho.',
    quem_decide: 'Plantão.',
    primeiras_2h: 'Fechar o registro geral (toda a equipe precisa saber onde ele fica). Acionar hidráulica. Avaliar se a unidade segue habitável.',
    o_que_dizer: 'O que foi feito, o que ainda será, e a alternativa se a casa ficar inutilizável.',
    quem_paga: 'Operação / fundo de manutenção.',
  },
  {
    chave: 'seguranca', titulo: 'Problema de segurança — invasão, furto, ameaça',
    deteccao: 'Aviso do hóspede, da equipe ou da vizinhança.',
    quem_decide: 'Autoridade primeiro; depois o gestor.',
    primeiras_2h: 'Acionar a autoridade. O hóspede é prioridade sobre o patrimônio, sempre. Presença humana.',
    o_que_dizer: 'Nada por automação. Contato humano direto.',
    quem_paga: 'Seguro / operação, apurado depois.',
  },
  {
    chave: 'saude', titulo: 'Acidente ou emergência de saúde',
    deteccao: 'Qualquer menção a machucado, mal-estar, remédio, ambulância.',
    quem_decide: 'Serviço de emergência; presença humana obrigatória.',
    primeiras_2h: 'Acionar o serviço de emergência. Ir até a casa. Nada disso passa por automação em nenhuma circunstância.',
    o_que_dizer: 'Somente pessoa. Nenhuma resposta automática.',
    quem_paga: 'Não se discute na hora.',
  },
  {
    chave: 'overbooking', titulo: 'Overbooking',
    deteccao: 'Auditoria de sincronização, ou o pior caso: o hóspede na porta.',
    quem_decide: 'Gestor. A decisão sobre qual hóspede é realocado é humana, sempre.',
    primeiras_2h: 'Realocar com upgrade e assumir a diferença — quase sempre mais barato que a alternativa. Acionar as unidades de terceiros previamente mapeadas.',
    o_que_dizer: 'Reconhecer o erro, apresentar a solução já resolvida, não a explicação.',
    quem_paga: 'Operação, integralmente.',
  },
  {
    chave: 'pagamento', titulo: 'Falha de pagamento / contestação',
    deteccao: 'Saldo vencido, aviso do provedor, notificação de chargeback.',
    quem_decide: 'Gestor. Nenhuma decisão de reembolso é automática.',
    primeiras_2h: 'Reunir o dossiê: contrato aceito, conversa da reserva, evidência de prestação do serviço, política aceita no ato.',
    o_que_dizer: 'Contato direto, sem acusação, com os fatos documentados.',
    quem_paga: 'Conforme contrato e política.',
  },
  {
    chave: 'reclamacao', titulo: 'Reclamação grave em andamento',
    deteccao: 'Mensagem do hóspede, avaliação abaixo do patamar, menção a advogado.',
    quem_decide: 'Gestor. Contato humano imediato, sem intermediário.',
    primeiras_2h: 'Ligar. Ouvir. Não responder por automação e não responder de improviso se houver acusação grave.',
    o_que_dizer: 'Reconhecimento do fato e o que será feito, com data. Nunca desculpa repetida.',
    quem_paga: 'Decisão de gestão.',
  },
];

// ---------------------------------------------------------------------
// Apêndice E · os onze checklists. Cada item é verificável por outra pessoa
// — essa é a regra que separa checklist de lista de desejos.
// ---------------------------------------------------------------------
const POPS_SEED = [
  {
    chave: 'e1', titulo: 'E1 · Onboarding de propriedade',
    blocos: [
      { titulo: 'Bloqueadores — nada avança sem estes', itens: ['Autorização escrita para anunciar', 'Contrato de administração assinado (se de terceiro)', 'Convenção do condomínio verificada', 'Exigência municipal checada', 'Seguro vigente e compatível com a destinação', 'Contas de consumo e internet no nome de quem opera'] },
      { titulo: 'Vistoria e inventário', itens: ['Registro fotográfico datado de cada cômodo, inclusive dos defeitos', 'Inventário completo', 'Cada tomada testada', 'Cada chuveiro testado, com o tempo real até esquentar', 'Cada ar-condicionado testado', 'Cada queimador e descarga', 'Pressão de água', 'Velocidade de internet em cada quarto', 'Fechaduras e chaves'] },
      { titulo: 'Preparação física', itens: ['Pendências de reforma resolvidas', 'Mobília e eletrodomésticos', 'Enxoval em jogos suficientes para o ciclo de lavagem', 'Cozinha com a dotação mínima', 'Amenidades', 'Sinalização interna', 'Kit de emergência', 'Checklist de emergência afixado'] },
      { titulo: 'Cadastro técnico', itens: ['Capacidade confortável E máxima, separadas', 'Quartos e camas discriminados', 'Comodidades verificadas na vistoria', 'O que a casa NÃO tem', 'Regras específicas', 'Tempo real de preparação', 'Propriedades interligadas declaradas', 'Equipamentos com manutenção periódica', 'Fornecedores por especialidade'] },
      { titulo: 'Publicação', itens: ['Fotos feitas depois da preparação', 'Fotos na ordem de conversão', 'Tarifas, taxas, políticas e estadia mínima', 'Calendários sincronizados e integração testada', 'Noite de teste realizada e pendências resolvidas', 'Plano de lançamento com data de término'] },
    ],
  },
  {
    chave: 'e2', titulo: 'E2 · Fotografia',
    blocos: [{ titulo: 'Antes e durante', itens: ['Casa arrumada no padrão de entrega', 'Luz natural, cortinas abertas', 'Sem objeto pessoal', 'Sem lixeira, produto de limpeza ou fio à vista', 'Portas de armário fechadas', 'Camas arrumadas no padrão', 'Vasos sanitários com tampa fechada', 'Bancadas limpas', 'Foto principal = maior diferencial', 'Cinco primeiras contam a casa inteira', 'Nenhum corredor ou escada entre as cinco primeiras', 'Demais na ordem do percurso', 'Área externa em luz favorável', 'Nenhuma foto que prometa mais que a casa entrega', 'Legendas informativas'] }],
  },
  {
    chave: 'e3', titulo: 'E3 · Publicação de anúncio',
    blocos: [{ titulo: 'Conferência', itens: ['Fatos idênticos ao cadastro mestre', 'Capacidade anunciada = confortável', 'Quartos, camas e banheiros discriminados', 'Todas as comodidades reais marcadas', 'Nenhuma comodidade marcada que exista pela metade', 'Diferenciais nos dois primeiros períodos', 'Expectativa negativa alinhada no próprio anúncio', 'Regras e política visíveis', 'Texto adaptado ao canal, não copiado', 'Todas as taxas informadas antes da reserva', 'Interligações funcionando nas duas direções', 'Data da próxima revisão marcada'] }],
  },
  {
    chave: 'e4', titulo: 'E4 · Limpeza e preparação',
    blocos: [
      { titulo: 'Ordem de trabalho', itens: ['Retirar enxoval, lixo e louça', 'Registrar itens esquecidos', 'VERIFICAR DANOS E FALTAS ANTES DE LIMPAR', 'Limpeza pesada, de cima para baixo e do fundo para a porta', 'Banheiros com tempo de ação do produto', 'Cozinha, incluindo geladeira e armários', 'Enxoval e arrumação no padrão fotografado', 'Reposição de amenidades, papel e produtos'] },
      { titulo: 'Preparação final', itens: ['Climatização ligada com antecedência', 'Luzes conferidas', 'Água disponível', 'Manual à vista', 'Cheiro da casa', 'Área externa'] },
      { titulo: 'Fechamento', itens: ['Fotos: quarto, banheiro, cozinha, área externa', 'Confirmação de conclusão com quem executou e horário', 'Pendências registradas', 'Unidade marcada como liberada'] },
    ],
  },
  {
    chave: 'e5', titulo: 'E5 · Inspeção por amostragem',
    blocos: [
      { titulo: 'Regra', itens: ['Feita por pessoa diferente da que executou', 'Unidade sorteada', 'Sobre o procedimento, nunca sobre a pessoa'] },
      { titulo: 'Itens', itens: ['Banheiros: espelho, box, vaso, ralo, reposição', 'Cozinha: geladeira, fogão, pia, armários, louça', 'Quartos: enxoval no padrão, embaixo das camas, dentro dos armários', 'Áreas comuns: rodapés, atrás de portas, cantos', 'Área externa', 'Todos os equipamentos ligam', 'Amenidades completas', 'Nenhum item pessoal do hóspede anterior', 'Cheiro', 'Manual e sinalização no lugar'] },
      { titulo: 'Ao final', itens: ['Classificar cada desvio: procedimento mal escrito, material, treinamento ou pontual', 'Mesmo item falhando em unidades diferentes = SISTÊMICO — revisar o POP'] },
    ],
  },
  {
    chave: 'e6', titulo: 'E6 · Manutenção preventiva',
    blocos: [
      { titulo: 'Por equipamento, com periodicidade e data da última execução', itens: ['Climatização: filtro e higienização', 'Aquecimento de água: revisão e segurança', 'Piscina: tratamento contínuo', 'Caixa de gordura e esgoto', 'Jardim: poda, irrigação, praga', 'Internet: velocidade em cada ambiente', 'Elétrica: disjuntores, tomadas, chuveiros', 'Hidráulica: vazamentos, pressão, registro geral', 'Fechaduras: bateria e troca de código', 'Extintores na validade', 'Detectores', 'Dedetização', 'Telhado e calhas antes da estação de chuva'] },
      { titulo: 'Regra', itens: ['Janela encontrada sem hóspede E bloqueada no calendário — ou a manutenção será cancelada por uma reserva'] },
    ],
  },
  {
    chave: 'e7', titulo: 'E7 · Check-in (operação)',
    blocos: [{ titulo: 'Antes da chegada', itens: ['Limpeza CONFIRMADA, não apenas escalada', 'Nenhuma pendência de manutenção que impeça o uso', 'Acesso testado hoje', 'Energia e água funcionando', 'Climatização ligada em tempo', 'Água disponível', 'Manual à vista', 'Documentação e identificação do titular completas', 'Saldo recebido', 'Instruções de chegada enviadas', 'DADO DE ACESSO ENVIADO MANUALMENTE, NO DIA', 'Responsável de plantão definido'] }],
  },
  {
    chave: 'e8', titulo: 'E8 · Check-out e vistoria de saída',
    blocos: [{ titulo: 'Saída', itens: ['Lembrete enviado na véspera', 'Saída tardia verificada contra a escala, se pedida', 'Vistoria com checklist', 'Registro fotográfico de saída', 'Comparação com o estado de entrada', 'Danos comunicados no mesmo dia, com foto', 'Itens esquecidos registrados e guardados', 'Leitura de consumo, quando aplicável', 'Unidade liberada para a próxima escala', 'Hóspede registrado no CRM com finalidade e gatilho de reativação', 'Avaliação pedida'] }],
  },
  {
    chave: 'e9', titulo: 'E9 · Inventário',
    blocos: [{ titulo: 'Contagem', itens: ['Enxoval por unidade, com data de entrada de cada lote', 'Louça e talheres, contra a capacidade máxima mais dois', 'Utensílios de cozinha', 'Eletrodomésticos, com nota e garantia', 'Mobília', 'Itens de decoração relevantes', 'Equipamentos de segurança', 'Chaves e controles', 'Itens de público específico (berço, cadeira, itens de pet)', 'Estoque de consumo', 'Data da contagem e quem contou'] }],
  },
  {
    chave: 'e10', titulo: 'E10 · Segurança (imprima e afixe dentro de cada casa)',
    blocos: [{ titulo: 'Itens', itens: ['Extintor na validade e acessível', 'Detector onde aplicável', 'Iluminação de emergência', 'Proteção em piscina', 'Corrimão e antiderrapante em escada', 'Kit de primeiros socorros', 'Checklist de emergência impresso e afixado dentro da casa', 'Registro geral de água identificado e conhecido pela equipe', 'Quadro de disjuntores identificado', 'Instalação de gás revisada', 'Câmeras somente em área externa e declaradas em anúncio, regras e contrato', 'Senha por estadia ou troca periódica', 'Nenhuma senha repetida entre unidades', 'Chave física de reserva acessível', 'Chaveiro de plantão no cadastro', 'Lista de acessos revisada a cada mudança de equipe'] }],
  },
  {
    chave: 'e11', titulo: 'E11 · Fechamento financeiro mensal',
    blocos: [{ titulo: 'Nove passos', itens: ['Todas as reservas do mês registradas', 'Receitas classificadas por tipo e canal', 'Taxa de limpeza tratada como reembolso, não receita', 'Caução em conta separada', 'Despesas lançadas com a unidade correta', 'Conciliação contra extratos, com divergências listadas e NÃO ajustadas', 'Provisões aplicadas (manutenção, reposição, vacância)', 'DRE por unidade montado', 'Rateio pelo critério estável', 'Indicadores calculados', 'Visão declarada em cada relatório (competência, caixa ou fiscal)', 'Prestação de contas de cada proprietário emitida e compartimentada', 'Repasses efetuados por decisão humana', 'Obrigações acessórias no prazo', 'Tudo arquivado'] }],
  },
];

// ---------------------------------------------------------------------
// Apêndice D · modelos de mensagem. O que está entre colchetes é
// substituído no envio. NENHUM modelo contém dado de acesso: onde ele
// entraria há o marcador, e o envio é manual (Cap. 32).
// ---------------------------------------------------------------------
const MARCADOR_ACESSO = '[DADO DE ACESSO — INSERIR NO ENVIO]';

const MODELOS_SEED = [
  {
    chave: 'd1_consulta', gatilho: 'manual', dias: 0, titulo: 'D1 · Resposta a consulta inicial',
    textos: {
      pt: 'Olá, [nome]! Obrigado pelo contato. Para [datas], a [unidade] está disponível para [N] hóspedes. O valor total do período é [R$ X], já incluindo [o que inclui]. Não estão incluídos [o que não inclui]. Para eu montar a proposta certa: quantas pessoas ao todo, e qual o motivo da viagem? Assim consigo indicar a melhor opção.',
      en: 'Hello [name], thanks for reaching out. For [dates], [unit] is available for [N] guests. The total for the stay is [amount], including [what\'s included]. Not included: [what\'s not]. So I can put together the right proposal — how many people in total, and what brings you to [city]? That helps me point you to the best option.',
      es: '¡Hola, [nombre]! Gracias por escribir. Para [fechas], [unidad] está disponible para [N] huéspedes. El valor total del período es [monto], con [qué incluye]. No incluye [qué no incluye]. Para armar la propuesta adecuada: ¿cuántas personas en total y cuál es el motivo del viaje? Así puedo indicarte la mejor opción.',
      fr: 'Bonjour [nom], merci pour votre message. Pour [dates], [logement] est disponible pour [N] personnes. Le montant total du séjour est de [montant], comprenant [ce qui est inclus]. Non inclus : [ce qui ne l\'est pas]. Pour vous proposer l\'option la plus adaptée : combien de personnes au total, et quel est le motif du séjour ?',
    },
  },
  {
    chave: 'd2_cotacao', gatilho: 'manual', dias: 0, titulo: 'D2 · Orçamento / cotação formal',
    textos: {
      pt: '[Nome], segue a proposta para [datas], [unidade], [N] hóspedes, para [finalidade]. Valor total: [R$ X] — [N] noites, taxa de limpeza e [taxas]. Incluso: [lista]. Não incluso: [lista]. Pagamento: [sinal]% na confirmação e o saldo até [prazo]. Cancelamento: [política]. [Uma frase sobre a característica da casa ligada à finalidade.] As datas seguem disponíveis e posso segurá-las até [dia]. Quer que eu confirme?',
      en: '[Name], here\'s the proposal for [dates], [unit], [N] guests, for [purpose]. Total: [amount] — [N] nights, cleaning fee and [fees]. Included: [list]. Not included: [list]. Payment: [X]% deposit on confirmation, balance by [date]. Cancellation: [policy]. [One sentence tying a real feature to the purpose.] The dates are still open and I can hold them until [day]. Shall I confirm?',
      es: '[Nombre], te envío la propuesta para [fechas], [unidad], [N] huéspedes, para [finalidad]. Valor total: [monto] — [N] noches, tarifa de limpieza y [tasas]. Incluye: [lista]. No incluye: [lista]. Pago: [X]% de seña al confirmar y el saldo hasta [fecha]. Cancelación: [política]. [Una frase sobre la casa vinculada a la finalidad.] Las fechas siguen disponibles y puedo reservarlas hasta [día]. ¿Confirmo?',
      fr: '[Nom], voici la proposition pour [dates], [logement], [N] personnes, pour [motif]. Montant total : [montant] — [N] nuits, frais de ménage et [taxes]. Inclus : [liste]. Non inclus : [liste]. Paiement : acompte de [X]% à la confirmation, solde avant le [date]. Annulation : [politique]. [Une phrase liant une caractéristique réelle au motif.] Les dates restent disponibles et je peux les maintenir jusqu\'au [jour]. Je confirme ?',
    },
  },
  {
    chave: 'd3_confirmacao', gatilho: 'confirmacao', dias: 0, titulo: 'D3 · Confirmação de reserva (as oito informações do Cap. 30)',
    textos: {
      pt: 'Reserva confirmada, [nome]! [Unidade] · entrada [data] a partir das [hora] · saída [data] até as [hora] · [N] hóspedes · responsável: [titular]. Valores: total [R$ X]; pago [R$ Y]; a pagar [R$ Z] até [data]. Cancelamento: [política, na formulação exata]. Importante: [visitantes] · [festa] · [silêncio] · [pet] · [fumo]. Qualquer coisa antes ou durante a estadia, fale comigo por aqui. As instruções de chegada chegam [prazo] antes.',
      en: 'Booking confirmed, [name]! [Unit] · check-in [date] from [time] · check-out [date] by [time] · [N] guests · lead guest: [name]. Payment: total [amount]; paid [amount]; due [amount] by [date]. Cancellation: [policy]. Please note: [visitors] · [parties] · [quiet hours] · [pets] · [smoking]. Anything before or during your stay, message me here. Arrival instructions arrive [timeframe] before check-in.',
      es: '¡Reserva confirmada, [nombre]! [Unidad] · entrada [fecha] desde las [hora] · salida [fecha] hasta las [hora] · [N] huéspedes · responsable: [titular]. Valores: total [monto]; pagado [monto]; a pagar [monto] hasta [fecha]. Cancelación: [política]. Importante: [visitantes] · [fiestas] · [horario de silencio] · [mascotas] · [fumar]. Cualquier cosa, escríbeme por aquí. Las instrucciones de llegada llegan [plazo] antes.',
      fr: 'Réservation confirmée, [nom] ! [Logement] · arrivée [date] à partir de [heure] · départ [date] avant [heure] · [N] personnes · responsable : [titulaire]. Montants : total [montant] ; réglé [montant] ; solde [montant] avant le [date]. Annulation : [politique]. À noter : [visiteurs] · [fêtes] · [heures calmes] · [animaux] · [tabac]. Pour toute question, écrivez-moi ici. Les instructions d\'arrivée vous parviendront [délai] avant.',
    },
  },
  {
    chave: 'd4_preparacao', gatilho: 'dias_antes', dias: 7, titulo: 'D4 · Preparação (uma semana antes)',
    textos: {
      pt: '[Nome], está chegando! Sua estadia na [unidade] começa em [data]. Confirmando o combinado: [N] hóspedes, entrada a partir das [hora]. Falta apenas [o que falta: identificação / saldo / horário previsto de chegada]. As instruções completas de chegada chegam três dias antes. Se precisar de [berço / enxoval extra / transfer], me avise agora que organizo com calma.',
      en: '[Name], your stay at [unit] starts on [date]. Confirming: [N] guests, check-in from [time]. Still pending: [what\'s missing]. Full arrival instructions arrive three days before. If you need [crib / extra linen / transfer], let me know now so I can arrange it properly.',
      es: '[Nombre], su estadía en [unidad] comienza el [fecha]. Confirmando: [N] huéspedes, entrada desde las [hora]. Falta solamente [lo que falta]. Las instrucciones completas de llegada llegan tres días antes. Si necesita [cuna / ropa de cama extra / traslado], avíseme ahora.',
      fr: '[Nom], votre séjour au [logement] commence le [date]. Confirmation : [N] personnes, arrivée à partir de [heure]. Il manque seulement [ce qui manque]. Les instructions d\'arrivée complètes arrivent trois jours avant. Si vous avez besoin de [lit bébé / linge supplémentaire / transfert], dites-le-moi maintenant.',
    },
  },
  {
    chave: 'd5_chegada', gatilho: 'dias_antes', dias: 3, titulo: 'D5 · Instruções de chegada (a mensagem mais importante da régua)',
    textos: {
      pt: 'ONDE É — [endereço completo], [ponto de referência], [link do mapa]. [Particularidade de acesso, com destaque.]\nCOMO ENTRAR — [procedimento]. ' + MARCADOR_ACESSO + '\nQUANDO — check-in a partir das [hora]. Se chegar antes: [o que fazer]. Entrada antecipada depende de disponibilidade — me avise que verifico.\nESTACIONAMENTO — [onde, quantas vagas, como funciona].\nA CASA — wi-fi [nome da rede] · ar-condicionado [como funciona] · água quente [como funciona] · [o que mais importa]. O manual completo fica em [link do manual].\nQUEM CHAMAR — [contato], das [horário]. Fora desse horário: [procedimento de emergência].',
      en: 'WHERE — [full address], [landmark], [map link]. [Access particularity, highlighted.]\nHOW TO GET IN — [procedure]. ' + MARCADOR_ACESSO + '\nWHEN — check-in from [time]. If you arrive earlier: [what to do]. Early check-in depends on availability — just ask and I\'ll check.\nPARKING — [where, how many spots, how it works].\nTHE HOUSE — wi-fi [network name] · air conditioning [how it works] · hot water [how it works]. Full manual at [manual link].\nWHO TO CALL — [contact], [hours]. Outside those hours: [emergency procedure].',
      es: 'DÓNDE ES — [dirección completa], [referencia], [enlace del mapa]. [Particularidad de acceso, destacada.]\nCÓMO ENTRAR — [procedimiento]. ' + MARCADOR_ACESSO + '\nCUÁNDO — entrada desde las [hora]. Si llega antes: [qué hacer].\nESTACIONAMIENTO — [dónde, cuántas plazas, cómo funciona].\nLA CASA — wi-fi [nombre de la red] · aire acondicionado [cómo funciona] · agua caliente [cómo funciona]. Manual completo en [enlace].\nA QUIÉN LLAMAR — [contacto], de [horario]. Fuera de ese horario: [procedimiento de emergencia].',
      fr: 'OÙ — [adresse complète], [point de repère], [lien carte]. [Particularité d\'accès, en évidence.]\nCOMMENT ENTRER — [procédure]. ' + MARCADOR_ACESSO + '\nQUAND — arrivée à partir de [heure]. Si vous arrivez avant : [que faire].\nSTATIONNEMENT — [où, combien de places, comment].\nLE LOGEMENT — wi-fi [nom du réseau] · climatisation [fonctionnement] · eau chaude [fonctionnement]. Manuel complet : [lien].\nQUI APPELER — [contact], de [horaires]. En dehors : [procédure d\'urgence].',
    },
  },
  {
    chave: 'd6_vespera', gatilho: 'dias_antes', dias: 1, titulo: 'D6 · Lembrete da véspera (curto, só o essencial)',
    textos: {
      pt: '[Nome], até amanhã! Entrada na [unidade] a partir das [hora], em [endereço]. Meu contato é este mesmo. Boa viagem.',
      en: '[Name], see you tomorrow! Check-in at [unit] from [time], at [address]. This is my contact. Safe travels.',
      es: '[Nombre], ¡hasta mañana! Entrada en [unidad] desde las [hora], en [dirección]. Mi contacto es este. Buen viaje.',
      fr: '[Nom], à demain ! Arrivée au [logement] à partir de [heure], au [adresse]. Voici mon contact. Bon voyage.',
    },
  },
  {
    chave: 'd7_boas_vindas', gatilho: 'manual', dias: 0, titulo: 'D7 · Boas-vindas no check-in',
    textos: {
      pt: 'Bem-vindo(a), [nome]! Espero que a chegada tenha sido tranquila. O manual da casa está em [link] — ele responde ar-condicionado, água quente, wi-fi e saída. Se encontrar qualquer coisa fora do lugar, me avise nas primeiras horas que eu resolvo. Boa estadia.',
      en: 'Welcome, [name]! I hope the arrival went smoothly. The house manual is at [link] — it covers air conditioning, hot water, wi-fi and check-out. If you find anything out of place, tell me in the first few hours and I\'ll sort it. Enjoy your stay.',
      es: '¡Bienvenido(a), [nombre]! El manual de la casa está en [enlace] — cubre aire acondicionado, agua caliente, wi-fi y salida. Si encuentra algo fuera de lugar, avíseme en las primeras horas. Buena estadía.',
      fr: 'Bienvenue, [nom] ! Le manuel du logement est au [lien] — climatisation, eau chaude, wi-fi et départ. Si quelque chose ne va pas, dites-le-moi dans les premières heures. Bon séjour.',
    },
  },
  {
    chave: 'd8_saida', gatilho: 'checkout_vespera', dias: 1, titulo: 'D8 · Lembrete de saída (no máximo quatro pedidos)',
    textos: {
      pt: '[Nome], amanhã é a saída, até as [hora]. Só quatro coisas: louça na pia, lixo na lixeira externa, janelas fechadas e [chave / procedimento de saída]. Saída tardia depende da próxima reserva — se precisar, me avise que eu verifico. Foi um prazer receber vocês.',
      en: '[Name], check-out is tomorrow by [time]. Just four things: dishes in the sink, rubbish in the outside bin, windows closed, and [key / check-out procedure]. Late check-out depends on the next booking — ask me and I\'ll check. It was a pleasure hosting you.',
      es: '[Nombre], mañana es la salida, hasta las [hora]. Solo cuatro cosas: loza en la pileta, basura afuera, ventanas cerradas y [llave / procedimiento]. La salida tardía depende de la próxima reserva — avíseme y verifico.',
      fr: '[Nom], le départ est demain avant [heure]. Quatre choses seulement : vaisselle dans l\'évier, poubelle dehors, fenêtres fermées et [clé / procédure]. Le départ tardif dépend de la réservation suivante — demandez-moi et je vérifie.',
    },
  },
  {
    chave: 'd9_avaliacao', gatilho: 'pos_checkout', dias: 0, titulo: 'D9 · Agradecimento e pedido de avaliação (sem sugerir conteúdo)',
    textos: {
      pt: '[Nome], obrigado por escolher a [unidade]. Se puder deixar sua avaliação em [canal], ajuda muito — escreva o que achou, do jeito que achou. E se quiser voltar, é só me chamar por aqui.',
      en: '[Name], thank you for choosing [unit]. If you can leave a review on [channel], it helps a lot — write whatever you thought, however you thought it. And if you\'d like to come back, just message me here.',
      es: '[Nombre], gracias por elegir [unidad]. Si puede dejar su reseña en [canal], ayuda mucho — escriba lo que le pareció. Y si quiere volver, escríbame por aquí.',
      fr: '[Nom], merci d\'avoir choisi [logement]. Si vous pouvez laisser un avis sur [canal], cela aide beaucoup — écrivez ce que vous avez pensé. Et si vous souhaitez revenir, écrivez-moi ici.',
    },
  },
  {
    chave: 'd10_reativacao', gatilho: 'manual', dias: 0, titulo: 'D10 · Reativação por sazonalidade / finalidade',
    textos: {
      pt: '[Nome], tudo bem? Faz [tempo] que você esteve na [unidade], para [finalidade]. As datas de [período] já abriram e lembrei de vocês. Se fizer sentido, me avise que separo antes de publicar.',
      en: '[Name], it\'s been [time] since your stay at [unit] for [purpose]. Dates for [period] are now open and I thought of you. If it makes sense, let me know and I\'ll hold them before publishing.',
      es: '[Nombre], hace [tiempo] que estuvo en [unidad] para [finalidad]. Las fechas de [período] ya están abiertas y me acordé de ustedes. Si tiene sentido, avíseme y las separo.',
      fr: '[Nom], cela fait [durée] depuis votre séjour au [logement] pour [motif]. Les dates de [période] sont ouvertes et j\'ai pensé à vous. Si cela vous intéresse, dites-le-moi et je les réserve.',
    },
  },
  {
    chave: 'd11_saldo', gatilho: 'manual', dias: 0, titulo: 'D11 · Cobrança de saldo',
    textos: {
      pt: '[Nome], passando para lembrar do saldo de [R$ Z] da reserva da [unidade] ([datas]), com vencimento em [data]. Assim que entrar, envio as instruções de chegada. Qualquer coisa, é só falar.',
      en: '[Name], a reminder about the [amount] balance for your booking at [unit] ([dates]), due on [date]. As soon as it clears I\'ll send the arrival instructions. Any questions, just ask.',
      es: '[Nombre], le recuerdo el saldo de [monto] de la reserva en [unidad] ([fechas]), con vencimiento el [fecha]. En cuanto ingrese, envío las instrucciones de llegada.',
      fr: '[Nom], un rappel concernant le solde de [montant] pour votre réservation au [logement] ([dates]), dû le [date]. Dès réception, je vous envoie les instructions d\'arrivée.',
    },
  },
];

// ---------------------------------------------------------------------
// Biblioteca de prompts do livro. São os prompts publicados nos capítulos,
// prontos para copiar. Cada um traz a trava que o torna seguro.
// ---------------------------------------------------------------------
const PROMPTS_SEED = [
  {
    chave: 'auditoria_sincronizacao', area: 'operacao', capitulo: 'Cap. 20',
    titulo: 'Auditor de sincronização de canais',
    corpo: `FUNÇÃO: auditor de sincronização de canais de uma administradora de hospedagem.
OBJETIVO: comparar os calendários e tarifas entre PMS e canais, e reportar divergências.
Você NÃO corrige nada.

DADOS: [calendário e tarifas do PMS, próximos 90 dias] [mesmo período, por canal]
[mapa de anúncios interligados, com as duas direções] [status das integrações]

REGRAS:
- Compare fonte a fonte. Não presuma que a ausência de dado significa disponibilidade.
- Se algum canal não puder ser lido, reporte FONTE INDISPONÍVEL no topo e NÃO conclua
  que está tudo certo. Relatório parcial deve ser declarado como parcial.
- Para interligados, verifique as DUAS direções separadamente.
- Classifique cada divergência por risco: CRÍTICO (data vendável em dois lugares),
  ALTO (tarifa divergente em data de alto valor), MÉDIO (estadia mínima), BAIXO (conteúdo).
- Não altere nada. A correção é humana.

FORMATO: (1) fontes que não puderam ser lidas; (2) divergências por risco, com unidade,
data, canal e os dois valores conflitantes; (3) integrações com erro e há quanto tempo.`,
  },
  {
    chave: 'painel_do_dia', area: 'operacao', capitulo: 'Cap. 39',
    titulo: 'Controlador de operações — painel do dia',
    corpo: `FUNÇÃO: controlador de operações de uma administradora de hospedagem.
OBJETIVO: produzir o painel do dia e apontar tudo que exige ação agora.

DADOS AUTORIZADOS:
[chegadas e saídas de hoje e amanhã] [status de limpeza e preparação, com confirmações]
[chamados de manutenção abertos] [pendências financeiras vencendo]
[unidades bloqueadas e o motivo] [última execução de cada rotina automática]
[status de cada integração] [resultado da auditoria de sincronização]

REGRAS CRÍTICAS:
- Se alguma fonte não puder ser lida, isso vai no TOPO como FONTE INDISPONÍVEL, e o
  painel é declarado PARCIAL. Nunca conclua "tudo certo" sobre o que não foi verificado.
- Rotina que não reportou execução no horário previsto é ALERTA, não omissão.
- Distinga NÃO CONFIRMADO de NÃO FEITO.
- Não corrija nada. Não contate ninguém. Não reinicie integração.

CLASSIFICAÇÃO:
- CRÍTICO: check-in hoje sem limpeza confirmada; divergência de calendário em data
  vendável; unidade inutilizável com reserva próxima; rotina de sincronização sem execução.
- ALTO: pendência financeira vencida; chamado parado há mais de X dias; integração em erro.
- INFORMATIVO: o restante.

FORMATO: (1) fontes indisponíveis; (2) críticos; (3) altos; (4) painel do dia
(chegadas, saídas, bloqueios); (5) status das rotinas e integrações.`,
  },
  {
    chave: 'escala_limpeza', area: 'operacao', capitulo: 'Cap. 35',
    titulo: 'Encarregado de operações — escala do dia',
    corpo: `FUNÇÃO: encarregado de operações de uma administradora de hospedagem.
OBJETIVO: montar a escala de limpeza e preparação do dia, para minha conferência
antes do envio à equipe.

DADOS AUTORIZADOS:
[check-outs de hoje] [check-ins de hoje e de amanhã] [reservas criadas nas últimas
24 horas] [cadastro: tempo de preparação e janela mínima por unidade]
[escala da equipe: quem trabalha hoje e em quais unidades] [pendências de manutenção]

FLUXO:
1. Cada check-out gera uma FAXINA.
2. Cada check-in gera uma PREPARAÇÃO.
3. Check-out e check-in no mesmo dia e unidade = VIRADA; calcule a janela entre os
   horários reais.
4. Se a janela for menor que o tempo de preparação do cadastro, marque RISCO.
5. Destaque as unidades com reserva criada nas últimas 24 horas.
6. Agrupe por pessoa e ordene por horário-limite.

REGRAS:
- Não envie nada a ninguém. A saída é para minha conferência.
- Não altere reserva, horário nem calendário.
- Unidade sem responsável na escala: marque SEM RESPONSÁVEL. Não distribua por conta própria.
- Se houver pendência de manutenção que impeça o uso da unidade, sinalize no topo.
- Se o calendário não puder ser lido, diga isso e NÃO produza lista parcial.

FORMATO: no topo — RISCO, SEM RESPONSÁVEL e reservas novas. Depois, a lista por pessoa
com unidade, tipo, horário-limite e observações.`,
  },
  {
    chave: 'prontidao_chegada', area: 'operacao', capitulo: 'Cap. 32',
    titulo: 'Coordenador de operações — prontidão das chegadas',
    corpo: `FUNÇÃO: coordenador de operações de uma administradora de hospedagem.
OBJETIVO: verificar se cada check-in de hoje e de amanhã está pronto para acontecer.

DADOS AUTORIZADOS:
[check-ins de hoje e amanhã] [status da limpeza e preparação, com confirmação da equipe]
[status da documentação e identificação de cada reserva] [o que já foi comunicado]
[pendências de manutenção abertas por unidade]

REGRAS:
- NÃO acesse, exiba nem mencione senha, código de acesso ou senha de wi-fi. Use apenas
  "dado de acesso pendente de envio".
- Para cada chegada verifique: limpeza confirmada, preparação concluída, pendência de
  manutenção que afete a estadia, documentação completa, instruções de chegada enviadas,
  dado de acesso pendente de envio manual, e quem é o responsável de plantão.
- Marque como CRÍTICO: limpeza não confirmada, pendência que impeça o uso, e instruções
  não enviadas com menos de 24h para a chegada.
- Não presuma que algo foi feito por ausência de registro: marque NÃO REGISTRADO.
- Se alguma fonte não puder ser lida, diga isso no topo e não conclua que está tudo certo.

FORMATO: lista por horário de chegada, com o status de cada item e as pendências
críticas no topo.`,
  },
  {
    chave: 'cotacao', area: 'comercial', capitulo: 'Cap. 24',
    titulo: 'Consultor comercial — preparar a cotação',
    corpo: `FUNÇÃO: consultor comercial de uma administradora de hospedagem.
OBJETIVO: preparar a cotação desta oportunidade, para minha conferência e envio.

DADOS AUTORIZADOS (única fonte de disponibilidade e valores):
[disponibilidade e tarifas do sistema para as datas] [taxas aplicáveis]
[política de cancelamento] [condições comerciais que EU autorizei, se houver]
QUALIFICAÇÃO: [pessoas e idades] [finalidade declarada] [visitantes] [datas e
flexibilidade] [unidade de interesse]
CADASTRO DA UNIDADE: [colar]

REGRAS:
- Trava anti-invenção: nenhuma data, valor, taxa ou política fora dos dados acima.
- Apresente VALOR TOTAL, com o que está incluído e o que não está. Nunca só a diária.
- Não ofereça desconto. Se eu autorizei alguma condição, ela está nos dados.
- Inclua UMA frase de cena ligada à finalidade declarada, baseada em característica real.
- Proponha um prazo de retorno REAL, compatível com a disponibilidade informada.
- Se a qualificação estiver incompleta, NÃO cote: escreva as perguntas que faltam (máx. 2).
- Se a finalidade indicar EVENTO, ou se houver visitantes que não se hospedam, não cote
  como estadia: escreva ESCALONAR PARA PROPOSTA DE EVENTO e liste o que preciso definir.

ESTILO: cordial, direto, sem adjetivo de corretor. Português brasileiro.
FORMATO: mensagem pronta, até 140 palavras, terminando com a pergunta de fechamento.`,
  },
  {
    chave: 'pauta_comercial', area: 'comercial', capitulo: 'Cap. 23',
    titulo: 'Gerente comercial — pauta da semana a partir do CRM',
    corpo: `FUNÇÃO: gerente comercial de uma administradora de hospedagem.
OBJETIVO: produzir a pauta comercial da semana a partir do CRM.

DADOS AUTORIZADOS: [funil atual com estágio, datas, valores e próxima ação]
[oportunidades perdidas dos últimos 6 meses, com motivo] [datas que ficaram livres por
cancelamento] [base de hóspedes com última estadia e finalidade] [disponibilidade atual]

REGRAS:
- Aplicar a trava anti-invenção: qualquer menção a data ou valor vem dos dados acima.
- Liste as oportunidades ABERTAS SEM PRÓXIMA AÇÃO — é a prioridade número um.
- Para cada data liberada por cancelamento, procure na base quem consultou aquele
  período e não fechou.
- Monte no máximo DUAS listas de reativação, com critério explícito de segmento.
- Não inclua contato sem origem registrada nem quem tenha pedido para não ser contatado.
- Analise os motivos de perda do período: qual predomina e o que ele indica.
- Nada é enviado por você.

FORMATO: (1) oportunidades sem próxima ação; (2) datas livres com contatos compatíveis;
(3) listas de reativação, com o critério; (4) leitura dos motivos de perda em até
cinco linhas.`,
  },
  {
    chave: 'revenue_calendario', area: 'receita', capitulo: 'Cap. 21',
    titulo: 'Revenue manager — calendário de datas especiais',
    corpo: `FUNÇÃO: revenue manager de aluguel por temporada.
OBJETIVO: montar o calendário de datas de tratamento especial dos próximos 12 meses e
propor a regra de preço e estadia mínima de cada uma, para minha aprovação.

DADOS AUTORIZADOS:
- feriados e datas relevantes que EU listo abaixo: [colar — inclua os eventos da sua
  cidade; não peça que ele descubra]
- meu histórico dessas datas nos últimos anos: [ocupação, diária média, antecedência]
- minha tarifa-base por unidade e minha tarifa mínima: [ ]
- minha política atual de estadia mínima: [ ]

REGRAS:
- Não pesquise eventos, não estime demanda por conhecimento geral, não use dados de
  mercado. Só o que está acima.
- Nunca proponha valor abaixo da tarifa mínima.
- Para cada data: tarifa proposta, estadia mínima, data-limite para revisão, e a
  justificativa apoiada no histórico que eu forneci.
- Onde não houver histórico, escreva SEM HISTÓRICO e proponha tratamento conservador.
- A saída é uma proposta. Nenhuma alteração é aplicada por você.

FORMATO: calendário por unidade e data, com tarifa, estadia mínima, data de revisão
e justificativa em uma linha.`,
  },
  {
    chave: 'revenue_semanal', area: 'receita', capitulo: 'Cap. 21',
    titulo: 'Revenue manager — revisão semanal do calendário',
    corpo: `FUNÇÃO: revenue manager.
OBJETIVO: apontar as datas que exigem decisão minha nesta semana.

DADOS: [ocupação confirmada por unidade nos próximos 120 dias] [tarifas vigentes]
[mesmo período do ano anterior] [tarifa mínima por unidade] [datas especiais definidas]

REGRAS:
- Sinalize: (a) datas enchendo mais rápido que o ano anterior — candidatas a alta;
  (b) datas com ritmo abaixo e prazo curto — candidatas a revisão;
  (c) buracos de uma ou duas noites entre reservas — candidatas a estadia mínima menor;
  (d) datas especiais cuja data-limite de revisão está chegando.
- Não recomende desconto abaixo da tarifa mínima em nenhuma hipótese.
- Não sugira ação em data ainda distante e com ritmo normal: silêncio é saída válida.
- Máximo 10 itens, ordenados por receita em risco.

FORMATO: lista com unidade, período, situação, ação proposta e receita em risco.`,
  },
  {
    chave: 'painel_mes', area: 'financeiro', capitulo: 'Cap. 22',
    titulo: 'Controller — painel do mês',
    corpo: `FUNÇÃO: controller de uma administradora de hospedagem.
OBJETIVO: produzir o painel do mês e apontar o que exige decisão.

DADOS AUTORIZADOS: [reservas do período, com valor total e datas] [despesas por unidade]
[bloqueios de manutenção] [avaliações] [mesmo período do ano anterior]

CONVENÇÕES OBRIGATÓRIAS (não altere nenhuma):
- Receita reconhecida por check-in, pelo valor total da reserva. Nunca tarifa × noites.
- Líquida = bruta − comissão do canal. Sempre indique qual das duas está sendo usada.
- Noites disponíveis excluem bloqueio de manutenção.
- ADR exclui taxa de limpeza.
- Em anúncios interligados, o mesmo espaço conta uma vez: [colar o mapa de interligações].

REGRAS:
- Compare com o MESMO período do ano anterior, nunca com o mês anterior.
- Separe rigorosamente DADO de INFERÊNCIA. Toda explicação de variação vem marcada
  como HIPÓTESE e indica que dado a confirmaria.
- Se algum lançamento estiver ambíguo, liste em "a conferir" em vez de classificar.
- Não use referência de mercado.

FORMATO: (1) tabela por unidade: ocupação, ADR, RevPAR, receita líquida, margem, nota,
e a variação contra o ano anterior; (2) três achados em ordem de impacto financeiro;
(3) hipóteses de causa, marcadas como tais; (4) lista "a conferir".`,
  },
  {
    chave: 'fechamento_mensal', area: 'financeiro', capitulo: 'Cap. 40',
    titulo: 'Controller — fechamento do mês',
    corpo: `FUNÇÃO: controller de uma administradora de hospedagem.
OBJETIVO: executar o fechamento do mês e apontar o que exige minha decisão.

DADOS AUTORIZADOS: [reservas do mês com valor total, canal, datas e status]
[despesas com data, valor, unidade e categoria] [extratos bancários do período]
[contratos: remuneração, provisões, rateio] [mesmo mês do ano anterior]

CONVENÇÕES OBRIGATÓRIAS:
- Visão de COMPETÊNCIA: receita reconhecida por check-in, pelo valor total da reserva.
  Nunca tarifa × noites. Declare a visão no cabeçalho.
- Taxa de limpeza é reembolso de custo, não receita de hospedagem.
- Caução não é receita: apresente em conta separada.
- Rateio de custos comuns pelo critério: [colar o critério, que não muda].
- ADR exclui taxa de limpeza; ocupação exclui bloqueio de manutenção.

REGRAS:
- Concilie cada entrada do extrato com a reserva correspondente. Liste as divergências;
  NÃO ajuste nada para fechar.
- Lançamento ambíguo vai para "a conferir", nunca é classificado por suposição.
- Toda despesa deve estar atribuída a uma unidade ou ao rateio.
- Não compare com média de mercado. Compare com o mesmo mês do ano anterior.
- Sinalize despesa que divirja mais de 30% do histórico da unidade — sem corrigir.
- Nenhum pagamento, repasse ou cobrança é executado por você.

FORMATO: (1) DRE por unidade; (2) divergências de conciliação; (3) "a conferir";
(4) despesas atípicas; (5) indicadores com variação anual; (6) valores de repasse
calculados, para minha aprovação.`,
  },
  {
    chave: 'prestacao_contas', area: 'proprietarios', capitulo: 'Cap. 12',
    titulo: 'Gestor de proprietários — relatório mensal do imóvel',
    corpo: `FUNÇÃO: gestor de relacionamento com proprietários de uma administradora.
OBJETIVO: montar o relatório mensal do imóvel [código], no formato padrão da empresa,
para minha conferência antes do envio.

DADOS AUTORIZADOS (exclusivamente desta unidade):
[reservas do mês] [despesas] [manutenções] [avaliações] [mesmo mês do ano anterior]
CONTRATO: remuneração [ ] sobre [bruto/líquido] · fundo de manutenção [ ]% ·
limite de autonomia R$ [ ]

REGRAS:
- Faturamento reconhecido por check-in, pelo valor total da reserva. Nunca tarifa × noites.
- Não use dados de nenhuma outra unidade nem de outro proprietário, em nenhuma
  comparação — nem anonimizada.
- Não compare com "média de mercado". Compare com o histórico desta unidade.
- Apresente o número desfavorável com o mesmo destaque do favorável.
- Se houver desvio maior que 20% contra o mesmo mês do ano anterior, escreva a
  explicação mais provável e marque-a como HIPÓTESE A CONFERIR.
- Não prometa nada sobre os próximos meses.
- Lançamento ambíguo vai para "a conferir".

FORMATO: os quatro blocos do padrão (resultado, operação, imóvel, avaliações), em
uma página, seguidos de: pendências que exigem autorização dele, e sugestão de pauta
para a próxima conversa.`,
  },
  {
    chave: 'pre_estadia', area: 'hospede', capitulo: 'Cap. 31',
    titulo: 'Coordenador de experiência — mensagens de pré-estadia',
    corpo: `FUNÇÃO: coordenador de experiência do hóspede.
OBJETIVO: preparar as mensagens de pré-estadia dos hóspedes que chegam nos próximos
7 dias, para minha conferência.

DADOS AUTORIZADOS:
[reservas com check-in nos próximos 7 dias: unidade, datas, nº de hóspedes, canal,
idioma, finalidade declarada, o que já foi comunicado]
[cadastro da unidade: acesso, estacionamento, equipamentos, wi-fi (SEM senha),
particularidades de chegada] [regras da casa] [catálogo de serviços] [tom de voz]

REGRAS:
- Nenhuma informação fora do cadastro. Não invente referência, distância nem procedimento.
- NÃO inclua senha de fechadura, código de acesso nem senha de wi-fi em nenhuma
  mensagem. Marque o lugar com ${MARCADOR_ACESSO}.
- Verifique o que já foi comunicado a cada hóspede e NÃO repita.
- Se a reserva já tiver check-in feito ou estiver cancelada, não gere mensagem:
  liste em EXCEÇÕES.
- Ofereça serviço adicional apenas quando compatível com a finalidade declarada, uma
  única vez por reserva.
- Escreva no idioma do hóspede.
- Se faltar qualquer informação do cadastro necessária para a chegada, escreva
  FALTA DADO e não gere a mensagem daquela reserva.

FORMATO: por hóspede — qual mensagem da régua, o texto pronto, e o que exige minha
inserção manual. Ao final, EXCEÇÕES e FALTA DADO.`,
  },
  {
    chave: 'concierge', area: 'hospede', capitulo: 'Cap. 33',
    titulo: 'Concierge — responder ou escalar',
    corpo: `FUNÇÃO: concierge de uma hospedagem, atendendo um hóspede que está hospedado agora.
OBJETIVO: responder à mensagem a partir das fontes autorizadas, ou escalar.

FONTES AUTORIZADAS (única base de informação):
[manual da unidade] [regras da casa] [dados da reserva em curso] [catálogo de serviços
adicionais com preços] [lista curada de recomendações locais] [horário do plantão]

MENSAGEM DO HÓSPEDE: [colar]
HISTÓRICO DA CONVERSA: [colar]

REGRAS DE ESCALONAMENTO — verifique ANTES de responder qualquer coisa:
Se a mensagem mencionar emergência, fogo, gás, cheiro forte, vazamento, falta de energia
ou água, alguém machucado, saúde, remédio, polícia, roubo, alguém trancado do lado de
fora, dano, reembolso, cancelamento, insatisfação, reclamação, ou pedir para falar com
alguém — NÃO responda. Escreva ESCALONAR, o motivo, e um resumo em duas linhas.

REGRAS DE RESPOSTA:
- Nenhuma informação fora das fontes acima. Se a resposta não estiver lá, diga que vai
  confirmar e escale.
- NUNCA envie senha, código de acesso nem senha de wi-fi, mesmo que estejam em alguma
  fonte. Escale.
- Não recomende estabelecimento que não esteja na lista curada.
- Não prometa prazo, não ofereça compensação, não altere nada da reserva.
- Para problema com equipamento: ofereça a checagem simples do manual e ofereça abrir
  chamado. Não acione ninguém por conta própria.
- Sempre ofereça, ao final, a opção de falar com uma pessoa.
- Máximo 80 palavras. Idioma do hóspede.

FORMATO: a resposta, ou ESCALONAR + motivo + resumo.`,
  },
  {
    chave: 'pos_estadia', area: 'hospede', capitulo: 'Cap. 34',
    titulo: 'Coordenador de pós-estadia',
    corpo: `FUNÇÃO: coordenador de pós-estadia de uma administradora de hospedagem.
OBJETIVO: preparar as mensagens de pós-estadia dos check-outs de ontem e de hoje.

DADOS AUTORIZADOS:
[check-outs: unidade, hóspede, finalidade declarada, canal, idioma, nº de estadias
anteriores] [ocorrências registradas durante a estadia] [resultado da vistoria de saída]
[itens esquecidos registrados] [tom de voz]

REGRAS:
- Se a estadia teve reclamação, problema não resolvido ou dano, NÃO gere mensagem
  automática: marque CONTATO PESSOAL e resuma o que aconteceu. Essa conversa é humana.
- Se houve problema que foi bem resolvido, a mensagem deve reconhecê-lo antes de
  qualquer outra coisa, e o pedido de avaliação vem depois desse reconhecimento.
- Se for hóspede recorrente, reconheça o retorno.
- Não ofereça nada nesta mensagem. Nenhuma promoção, nenhum serviço, nenhum desconto.
- Não sugira conteúdo para a avaliação nem cite estrelas.
- Se houver item esquecido registrado, inclua a informação de como recuperá-lo.
- Escreva no idioma do hóspede. Máximo 70 palavras.
- Ao final, registre para o CRM: finalidade, unidade, mês, e o gatilho de reativação
  sugerido com a data.

FORMATO: por hóspede — a mensagem, ou CONTATO PESSOAL com o resumo; e o registro
sugerido para o CRM.`,
  },
  {
    chave: 'reputacao_ciclo', area: 'reputacao', capitulo: 'Cap. 29',
    titulo: 'Analista de reputação — o ciclo se fechou?',
    corpo: `FUNÇÃO: analista de reputação de uma administradora de hospedagem.
OBJETIVO: verificar se as correções feitas surtiram efeito nas avaliações.

DADOS: [problemas identificados no diagnóstico anterior, com a data da correção]
[avaliações posteriores a cada correção]

REGRAS:
- Para cada item corrigido, compare a frequência de menções antes e depois da data
  da correção.
- Classifique: RESOLVIDO (parou de aparecer), PERSISTENTE (continua), NOVO (assunto
  que não existia antes).
- Considere o volume: se houve poucas estadias após a correção, escreva AMOSTRA
  INSUFICIENTE em vez de concluir.
- Não conclua causalidade a partir de uma única avaliação.

FORMATO: tabela item / status / menções antes / menções depois / observação.`,
  },
  {
    chave: 'compras_previsao', area: 'operacao', capitulo: 'Cap. 36',
    titulo: 'Encarregado de suprimentos — lista de compras por previsão',
    corpo: `FUNÇÃO: encarregado de suprimentos de uma administradora de hospedagem.
OBJETIVO: montar a lista de compras dos próximos 30 dias, por previsão, para aprovação.

DADOS AUTORIZADOS:
[reservas confirmadas dos próximos 30 dias: unidade, nº de hóspedes, noites]
[consumo médio por reserva e por hóspede, por item] [estoque atual] [estoque mínimo]
[fornecedores por item] [enxoval: lote, data de entrada, vida útil definida]

REGRAS:
- Projete o consumo a partir das reservas confirmadas, não de média de mercado.
- Considere que reservas novas podem entrar: aplique a margem de segurança que eu
  defini, e diga qual usou.
- Não estime preço de nenhum item. Se eu não informei o custo, deixe em branco.
- Sinalize CRÍTICO: item abaixo do mínimo com reserva nos próximos 7 dias.
- Sinalize os lotes de enxoval que atingiram a vida útil.
- Se o consumo real divergir mais de 30% do histórico, sinalize CONSUMO ATÍPICO e NÃO
  ajuste a projeção — isso exige investigação, não correção.
- Agrupe por fornecedor. Não contate ninguém.

FORMATO: (1) itens críticos; (2) lista por fornecedor com quantidade; (3) consumos
atípicos; (4) enxoval a aposentar; (5) custo variável por reserva calculado.`,
  },
  {
    chave: 'manutencao_mes', area: 'operacao', capitulo: 'Cap. 37',
    titulo: 'Encarregado de manutenção — plano do mês',
    corpo: `FUNÇÃO: encarregado de manutenção de uma administradora de hospedagem.
OBJETIVO: montar o plano de manutenção do mês, para minha aprovação.

DADOS AUTORIZADOS:
[plano preventivo: unidade, equipamento, periodicidade, data da última execução]
[chamados corretivos abertos] [calendário de reservas dos próximos 60 dias]
[histórico de chamados por equipamento] [fornecedores] [limite de autonomia para gasto]

REGRAS:
- Liste as preventivas vencidas e as que vencem nos próximos 30 dias.
- Para cada uma, proponha janelas SEM HÓSPEDE, considerando o tempo do serviço.
  Se não houver janela disponível, escreva SEM JANELA e sinalize.
- Não bloqueie calendário. Não acione fornecedor. Não autorize despesa.
- Marque CRÍTICO: chamado que impeça o uso de unidade com check-in nos próximos 7 dias.
- Identifique equipamentos com 3 ou mais chamados em 12 meses e apresente o custo
  acumulado — sem recomendar troca; apresente o número.
- Sinalize itens acima do limite de autonomia.
- Se as datas da última execução estiverem ausentes, liste em SEM REGISTRO.

FORMATO: (1) críticos; (2) preventivas do mês com janelas propostas; (3) SEM JANELA;
(4) equipamentos reincidentes com custo acumulado; (5) itens que exigem autorização.`,
  },
  {
    chave: 'risco_reserva', area: 'comercial', capitulo: 'Cap. 25',
    titulo: 'Analista de risco de reservas',
    corpo: `FUNÇÃO: analista de risco de reservas de uma administradora de hospedagem.
OBJETIVO: conferir a documentação desta reserva e sinalizar pontos que exigem minha
atenção antes da confirmação. Você não toma nenhuma decisão.

DADOS: [dados da reserva: canal, valor, datas, nº de hóspedes, antecedência]
[histórico da conversa] [meios de pagamento propostos] [o que já foi documentado]
POLÍTICA DA EMPRESA: [documentação exigida por faixa de valor] [meios aceitos]
[política de cancelamento] [regra de caução]

REGRAS:
- Liste o que a política exige e ainda não foi obtido.
- Sinalize como PONTO DE ATENÇÃO os padrões atípicos que encontrar, sempre em conjunto
  e nunca isoladamente, citando o trecho da conversa que o sustenta.
- NÃO classifique ninguém como fraudador. NÃO recomende recusar. Apresente os fatos.
- Não faça juízo sobre a pessoa: analise o padrão da transação.
- Se o valor exigir contrato ou caução pela política, diga isso explicitamente.

FORMATO: (1) documentação pendente; (2) pontos de atenção, com o trecho que os
sustenta; (3) o que a política exige para esta faixa de valor.`,
  },
  {
    chave: 'conferencia_reservas', area: 'comercial', capitulo: 'Cap. 30',
    titulo: 'Coordenador de reservas — conferência das confirmadas',
    corpo: `FUNÇÃO: coordenador de reservas de uma administradora de hospedagem.
OBJETIVO: conferir, para cada reserva confirmada nos últimos 7 dias, se o processo
está completo, e listar o que falta.

DADOS AUTORIZADOS: [reservas confirmadas] [o que já foi documentado de cada uma]
[calendário de todos os canais] [tarefas operacionais geradas]
POLÍTICA DA EMPRESA: [documentação por faixa de valor] [prazos] [regras a comunicar]

VERIFIQUE, PARA CADA RESERVA:
- bloqueio propagado em TODOS os canais e nos anúncios interligados;
- confirmação enviada com as oito informações obrigatórias;
- titular responsável identificado;
- documentação exigida pela faixa de valor;
- contrato, quando aplicável;
- sinal recebido; prazo do saldo dentro do combinado;
- registro no CRM com origem e finalidade;
- tarefas de limpeza e preparação geradas.

REGRAS:
- Não presuma cumprimento por ausência de registro: marque NÃO REGISTRADO.
- Se não conseguir ler algum canal, diga isso no topo e não conclua que está tudo certo.
- Ordene por risco: reserva mais próxima do check-in e de maior valor primeiro.

FORMATO: uma linha por reserva, com o que falta; e no topo, as pendências CRÍTICAS.`,
  },
  {
    chave: 'qualidade_inspecoes', area: 'operacao', capitulo: 'Cap. 38',
    titulo: 'Supervisor de qualidade — o desvio é do procedimento?',
    corpo: `FUNÇÃO: supervisor de qualidade de operações de hospedagem.
OBJETIVO: analisar os resultados das inspeções do período e apontar o que é falha de
PROCEDIMENTO, para eu corrigir o sistema.

DADOS: [resultados das inspeções por amostragem, com unidade e data]
[procedimentos vigentes] [desvios registrados no período]

REGRAS:
- Analise por ITEM e por UNIDADE. Não analise por pessoa, não ranqueie e não cite nomes.
- Classifique cada desvio: PROCEDIMENTO MAL ESCRITO, MATERIAL, TREINAMENTO ou PONTUAL.
- Se o mesmo item falha em unidades diferentes, classifique como SISTÊMICO — isso é
  problema do POP, não de execução.
- Distinga NÃO REGISTRADO de NÃO CONFORME.
- Ao final, indique quais POPs precisam de revisão e por quê.

FORMATO: desvios por item, com classificação; itens sistêmicos; POPs a revisar.`,
  },
  {
    chave: 'contrato_conferencia', area: 'juridico', capitulo: 'Cap. 41',
    titulo: 'Assistente jurídico — conferência de contrato (MINUTA)',
    corpo: `FUNÇÃO: assistente jurídico de uma administradora de hospedagem.
OBJETIVO: conferir se este contrato contém todas as cláusulas necessárias e apontar
lacunas e inconsistências. Você NÃO emite parecer.

CONTRATO: [colar]
CHECKLIST DE CLÁUSULAS DA EMPRESA (aprovado pelo advogado): [colar]
ANÚNCIO E REGRAS DA CASA VIGENTES: [colar]

REGRAS:
- Aponte cláusulas ausentes, ambíguas ou contraditórias entre si.
- Aponte DIVERGÊNCIAS entre o contrato, o anúncio e as regras da casa (horário,
  capacidade, cancelamento, taxas, pet, visitantes). É a verificação mais importante.
- NÃO cite lei, artigo, súmula nem decisão de tribunal. Se um ponto exigir
  fundamentação legal, escreva CONSULTAR ADVOGADO e formule a pergunta específica.
- NÃO afirme nada sobre tributo, alíquota ou enquadramento.
- Não redija cláusula nova sem marcá-la como SUGESTÃO A VALIDAR.
- Marque toda a saída como MINUTA.

FORMATO: (1) cláusulas ausentes; (2) ambiguidades; (3) divergências entre documentos;
(4) pontos para consultar advogado, com a pergunta já formulada.`,
  },
  {
    chave: 'arquiteto_sistemas', area: 'estrategia', capitulo: 'Cap. 49',
    titulo: 'Arquiteto — o que construir primeiro, e o que NÃO construir',
    corpo: `FUNÇÃO: arquiteto de sistemas para uma administradora de hospedagem.
OBJETIVO: me ajudar a decidir o que construir primeiro, e o que NÃO construir.

MINHA OPERAÇÃO: [nº de unidades] [canais] [sistema de gestão atual e se tem API]
[tamanho da equipe] [quem consegue manter software, se alguém]

MINHAS DORES, com frequência e custo quando falham:
[liste as dores reais dos últimos 3 meses, não as hipotéticas]

O QUE O MEU SISTEMA ATUAL JÁ FAZ: [colar, ou dizer que não sei]

REGRAS:
- Antes de propor qualquer construção, pergunte se o meu sistema atual já resolve.
- Priorize por frequência × custo do erro × clareza da fonte de dados.
- Para cada item proposto: qual a MENOR versão útil, o que ela lê, o que ela escreve,
  e por que ela é segura.
- Recomende explicitamente o que eu NÃO devo construir, e por quê.
- Considere quem vai manter. Se não houver ninguém além de mim, diga isso.
- Não proponha nada que escreva em calendário, preço ou pagamento na primeira fase.

FORMATO: (1) o que provavelmente já existe no meu sistema — verificar antes;
(2) construir, em ordem, com a menor versão útil de cada; (3) não construir, com
justificativa; (4) o risco de manutenção da lista proposta.`,
  },
];

// ---------------------------------------------------------------------
// Cap. 25/30 · política de documentação por faixa de valor (semente).
// ---------------------------------------------------------------------
const POLITICA_DOC_SEED = [
  { de_centavos: 0, ate_centavos: 300000, exige_identificacao: 0, exige_contrato: 0, exige_caucao: 0, sinal_pct: 30 },
  { de_centavos: 300000, ate_centavos: 1000000, exige_identificacao: 1, exige_contrato: 0, exige_caucao: 0, sinal_pct: 30 },
  { de_centavos: 1000000, ate_centavos: 0, exige_identificacao: 1, exige_contrato: 1, exige_caucao: 1, sinal_pct: 50 },
];

// ---------------------------------------------------------------------
// Cap. 39 · rotinas que reportam sinal de vida (a ausência é alerta).
// ---------------------------------------------------------------------
const ROTINAS_SEED = [
  { nome: 'auditoria_sincronizacao', descricao: 'Compara o calendário do sistema com o do channel manager e confere as interligações nas duas direções.', periodicidade_min: 1440 },
  { nome: 'painel_do_dia', descricao: 'Monta o painel das cinco perguntas da manhã.', periodicidade_min: 1440 },
  { nome: 'regua_mensagens', descricao: 'Prepara as mensagens da régua para conferência humana.', periodicidade_min: 1440 },
  { nome: 'escala_limpeza', descricao: 'Monta a escala do dia com viradas, riscos e unidades sem responsável.', periodicidade_min: 1440 },
  { nome: 'revisao_revenue', descricao: 'Revisão semanal do calendário de preços.', periodicidade_min: 10080 },
];

// ---------------------------------------------------------------------
// Cap. 49 · o catálogo do que construir, em ordem de retorno. Serve de
// roteiro de adoção dentro do painel: cada item aponta para o módulo.
// ---------------------------------------------------------------------
const ROTEIRO_ADOCAO = [
  { nivel: 1, chave: 'painel_do_dia', titulo: 'Painel do dia', capitulo: 'Cap. 39', aba: 'lv_dia', porque: 'Roda todo dia, é somente leitura e muda a operação na primeira semana.' },
  { nivel: 1, chave: 'auditoria', titulo: 'Auditoria de sincronização', capitulo: 'Cap. 20', aba: 'lv_auditoria', porque: 'Impede o erro mais caro do negócio: a mesma noite vendida duas vezes.' },
  { nivel: 1, chave: 'limpeza_confirmacao', titulo: 'Escala de limpeza com confirmação', capitulo: 'Cap. 35', aba: 'lv_escala', porque: 'O ganho está na segunda metade: saber o que foi feito.' },
  { nivel: 1, chave: 'regua', titulo: 'Régua de mensagens transacionais', capitulo: 'Caps. 31 e 34', aba: 'lv_regua', porque: 'Texto fixo, gatilho por evento, com verificação do estado da reserva.' },
  { nivel: 2, chave: 'crm', titulo: 'CRM de leads e hóspedes', capitulo: 'Cap. 23', aba: 'lv_crm', porque: 'É o sistema que mais gera receita nova, porque trabalha sobre demanda já paga.' },
  { nivel: 2, chave: 'metricas', titulo: 'Painel de indicadores (os seis)', capitulo: 'Cap. 22', aba: 'lv_metricas', porque: 'Seis indicadores numa tela — não quarenta.' },
  { nivel: 2, chave: 'dre', titulo: 'DRE por unidade', capitulo: 'Cap. 40', aba: 'lv_dre', porque: 'O relatório de maior impacto estratégico.' },
  { nivel: 2, chave: 'preventiva', titulo: 'Controle de manutenção preventiva', capitulo: 'Cap. 37', aba: 'lv_preventiva', porque: 'Plano com datas, histórico por equipamento e custo acumulado.' },
  { nivel: 2, chave: 'estoque_enxoval', titulo: 'Controle de estoque e enxoval', capitulo: 'Cap. 36', aba: 'lv_suprimentos', porque: 'Previsão por calendário, mínimos, vida útil.' },
  { nivel: 3, chave: 'proprietarios', titulo: 'Portal do proprietário', capitulo: 'Cap. 12', aba: 'lv_proprietarios', porque: 'Diferencial comercial forte na captação — com compartimentação por arquitetura.' },
  { nivel: 3, chave: 'manual', titulo: 'Manual digital do hóspede', capitulo: 'Caps. 31 e 33', aba: 'lv_manual', porque: 'O hóspede não quer falar com você; ele quer resolver.' },
  { nivel: 3, chave: 'concierge', titulo: 'Concierge com gatilhos de escalonamento', capitulo: 'Cap. 33', aba: 'lv_concierge', porque: 'Resolve o que é informação e para no que é situação.' },
  { nivel: 3, chave: 'reputacao', titulo: 'Diagnóstico de reputação', capitulo: 'Cap. 29', aba: 'lv_reputacao', porque: 'Três críticas sobre a mesma coisa são um relatório de manutenção recebido de graça.' },
];

// o que o livro manda NÃO construir — aparece no painel para o assinante
// entender por que o produto para onde para.
const NAO_CONSTRUIR = [
  { item: 'PMS e channel manager', porque: 'São produtos maduros com integrações que levam anos. O Stay Manager se conecta a um (Stays.net) em vez de refazê-lo.' },
  { item: 'Meio de pagamento', porque: 'Provedor certificado, sempre. O sistema nunca guarda dado de cartão.' },
  { item: 'O que o seu sistema já faz', porque: 'Verifique antes de pedir. Muita gente constrói um relatório que existia no menu ao lado.' },
  { item: 'O que você não vai manter', porque: 'Sistema sem dono é sistema que quebra e ninguém conserta.' },
];

module.exports = {
  DECISOES_HUMANAS, PODE_SOZINHA, PERMISSOES_SEED, DICIONARIO_METRICAS, SEIS_DO_PAINEL,
  MOTIVOS_PERDA, ESTAGIOS_FUNIL, GATILHOS_SEED, CRISES_SEED, POPS_SEED, MODELOS_SEED,
  PROMPTS_SEED, POLITICA_DOC_SEED, ROTINAS_SEED, ROTEIRO_ADOCAO, NAO_CONSTRUIR,
  MARCADOR_ACESSO,
};
