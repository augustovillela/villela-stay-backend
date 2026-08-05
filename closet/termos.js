// =====================================================================
// Closet Club — TERMOS DE USO E CONDIÇÕES DE INTERMEDIAÇÃO.
//
// Texto jurídico separado do código da página de propósito: o teor muda
// por decisão do autor (Augusto Villela, OAB/DF 12003), não por refatoração.
// `paginas.js` só renderiza o que sai daqui.
//
// ⚠️ ESTA É UMA MINUTA PROVISÓRIA. Enquanto MINUTA = true, a página exibe
// a tarja de rascunho. Os campos ainda não decididos aparecem como
// [PREENCHER] destacados — é intencional: ninguém pode confundir lacuna
// com cláusula.
//
// O "GUIA INTERNO DE PREENCHIMENTO" que acompanha a minuta NÃO está aqui:
// o próprio documento manda removê-lo antes da publicação. Ele vive em
// docs/integracoes/closet-club-termos-pendencias.md.
//
// Versão do teor: 05/08/2026 (substituiu o texto curto da onda 1).
// =====================================================================
'use strict';
const { Config } = require('./repo');

const MINUTA = true;

// Lacuna visível: nunca renderizar como texto normal.
const F = (t = 'PREENCHER') =>
  `<span style="background:#FEF3C7;color:#92400E;padding:1px 7px;border-radius:4px;` +
  `font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82em;white-space:nowrap">[${t}]</span>`;

const h = (n, t) => `<h3 style="margin:30px 0 10px;font-size:1.05rem">${n}. ${t}</h3>`;
const p = (t) => `<p style="margin:0 0 10px">${t}</p>`;
const li = (itens) => `<ul style="margin:0 0 12px 20px;padding:0">${itens.map((i) => `<li style="margin:4px 0">${i}</li>`).join('')}</ul>`;
const letras = (itens) => `<ol type="a" style="margin:0 0 12px 22px;padding:0">${itens.map((i) => `<li style="margin:4px 0">${i}</li>`).join('')}</ol>`;

function corpo() {
  const comissao = Config.num('comissao_pct', 20);

  return `
<h2>Termos de Uso e Condições de Intermediação do Closet Club</h2>

${MINUTA ? `<div class="aviso"><b>Minuta provisória.</b> Esta versão foi elaborada para revisão e
  ainda contém campos a preencher, destacados em amarelo ao longo do texto. Ela não substitui a
  versão definitiva, que será publicada com número de versão e data de vigência.</div>` : ''}

${p(`<b>Versão:</b> ${F('número da versão')} &nbsp;·&nbsp;
     <b>Última atualização:</b> ${F('data')} &nbsp;·&nbsp;
     <b>Início da vigência:</b> ${F('data')}`)}

${p(`Estes Termos de Uso e Condições de Intermediação, doravante denominados “Termos”, regulam o
  acesso e a utilização do site, aplicativo e demais ambientes digitais do Closet Club, bem como os
  serviços de intermediação de locações de peças de vestuário, acessórios e demais itens admitidos
  pela Plataforma.`)}

${p(`Ao criar uma conta, publicar um anúncio, solicitar uma reserva ou utilizar qualquer
  funcionalidade do Closet Club, o Usuário declara que leu, compreendeu e concordou com estes
  Termos e com a <a href="/closet/privacidade">Política de Privacidade</a>.`)}

${h(1, 'IDENTIFICAÇÃO DA PLATAFORMA')}
${p('O Closet Club é operado por:')}
${li([
    // Alinhado com a Política de Privacidade, que já publica a mesma controladora.
    '<b>Razão social:</b> Augusto Villela Ltda',
    '<b>Nome fantasia:</b> Closet Club',
    '<b>CNPJ:</b> 56.776.526/0001-12',
    `<b>Endereço da sede:</b> ${F()}`,
    '<b>E-mail de atendimento:</b> augusto.villela@gmail.com',
    `<b>Canal de atendimento:</b> ${F('WhatsApp, telefone ou formulário')}`,
    '<b>Site:</b> https://closet.villelastay.com.br',
    `<b>Aplicativo:</b> ${F('se houver')}`,
  ])}
${p('Para assuntos relacionados à proteção de dados pessoais:')}
${li([
    '<b>Canal de privacidade:</b> augusto.villela@gmail.com',
    `<b>Encarregado pelo tratamento de dados:</b> ${F('ou informar “canal de comunicação do controlador”, conforme a estrutura adotada')}`,
  ])}

${h(2, 'DEFINIÇÕES')}
${p('Para a interpretação destes Termos:')}
${li([
    '<b>2.1. Plataforma:</b> o site, aplicativo, sistemas, ferramentas e serviços disponibilizados sob a marca Closet Club.',
    '<b>2.2. Usuário:</b> qualquer pessoa que acesse ou utilize a Plataforma, com ou sem cadastro.',
    '<b>2.3. Anunciante:</b> o Usuário que publica uma peça ou item para locação, declarando ser seu proprietário ou possuir autorização legítima para oferecê-lo.',
    '<b>2.4. Locador:</b> o Anunciante cuja peça seja objeto de uma locação confirmada.',
    '<b>2.5. Locatário:</b> o Usuário que solicita, contrata e utiliza temporariamente uma peça anunciada.',
    '<b>2.6. Peça:</b> roupa, calçado, bolsa, acessório ou outro item admitido para anúncio e locação na Plataforma.',
    '<b>2.7. Reserva:</b> solicitação de locação realizada pelo Locatário, sujeita às condições do anúncio, à disponibilidade, à confirmação do pagamento e, quando aplicável, à aceitação do Locador.',
    '<b>2.8. Período de Locação:</b> intervalo compreendido entre a entrega ou retirada da Peça e o prazo estipulado para sua devolução.',
    '<b>2.9. Comissão:</b> remuneração devida ao Closet Club pelos serviços de intermediação, tecnologia, suporte e gestão da transação.',
    '<b>2.10. Caução:</b> garantia temporária vinculada à locação, destinada a assegurar o cumprimento das obrigações do Locatário, especialmente quanto à devolução, atraso, perda ou dano à Peça.',
    '<b>2.11. Prestador de Pagamentos:</b> instituição financeira, instituição de pagamento, adquirente, subadquirente, banco, fintech ou empresa especializada contratada para processar cobranças, repasses, estornos e garantias.',
    '<b>2.12. Valor de Reposição:</b> valor máximo de referência informado no anúncio para reposição de uma Peça perdida, não devolvida ou irrecuperavelmente danificada, sujeito à comprovação, razoabilidade, depreciação e análise da disputa.',
  ])}

${h(3, 'OBJETO E FUNCIONAMENTO DO CLOSET CLUB')}
${p('3.1. O Closet Club é um marketplace digital destinado a aproximar pessoas interessadas em oferecer Peças para locação e pessoas interessadas em alugá-las.')}
${p('3.2. A Plataforma poderá disponibilizar, entre outras funcionalidades:')}
${letras([
    'criação e gerenciamento de contas;',
    'publicação e moderação de anúncios;',
    'pesquisa e visualização de Peças;',
    'solicitação e confirmação de reservas;',
    'processamento de pagamentos por Prestador de Pagamentos;',
    'administração operacional de cauções;',
    'manutenção de registros eletrônicos de retirada, entrega e devolução;',
    'comunicação entre os Usuários;',
    'avaliação das transações;',
    'atendimento e facilitação da solução de disputas;',
    'medidas de prevenção a fraudes e proteção da comunidade.',
  ])}
${p('3.3. O Closet Club não é proprietário das Peças anunciadas e, salvo quando expressamente informado, não atua como Locador, Locatário, fabricante, lavanderia, transportador, segurador ou representante dos Usuários.')}
${p('3.4. O contrato de locação da Peça é celebrado diretamente entre o Locador e o Locatário, nas condições apresentadas no anúncio, na Reserva e nestes Termos.')}
${p('3.5. Independentemente de não ser parte do contrato de locação da Peça, o Closet Club é responsável pelos serviços de intermediação e pelas atividades que estiverem sob seu efetivo controle, nos limites da legislação aplicável.')}
${p('3.6. A atuação da Plataforma na análise de documentos, moderação de anúncios ou facilitação de disputas não representa garantia absoluta de identidade, autenticidade, solvência, conduta, qualidade ou cumprimento das obrigações pelos Usuários.')}

${h(4, 'CAPACIDADE E ELEGIBILIDADE')}
${p('4.1. Somente poderão criar conta e contratar locações pessoas físicas com 18 anos completos ou mais e plenamente capazes para os atos da vida civil.')}
${p('4.2. Pessoas jurídicas poderão utilizar a Plataforma quando essa modalidade estiver habilitada, por meio de representante com poderes suficientes.')}
${p('4.3. Ao criar uma conta, o Usuário declara que:')}
${letras([
    'possui capacidade jurídica para aceitar estes Termos;',
    'fornecerá informações verdadeiras, completas e atualizadas;',
    'não utilizará identidade falsa ou dados de terceiros sem autorização;',
    'não possui conta anteriormente suspensa ou encerrada por fraude ou violação grave;',
    'utilizará a Plataforma exclusivamente para finalidades lícitas.',
  ])}

${h(5, 'CADASTRO E SEGURANÇA DA CONTA')}
${p('5.1. Para utilizar determinadas funcionalidades, o Usuário deverá criar uma conta e fornecer os dados solicitados.')}
${p('5.2. A Plataforma poderá solicitar, conforme o risco da operação:')}
${letras([
    'nome completo;', 'CPF ou CNPJ;', 'data de nascimento;', 'telefone e e-mail;', 'endereço;',
    'documento de identificação;', 'fotografia ou prova de vida;', 'dados bancários ou de pagamento;',
    'informações adicionais necessárias à prevenção de fraude.',
  ])}
${p('5.3. O Usuário é responsável pela guarda de sua senha, código de acesso e dispositivos autenticados.')}
${p('5.4. Não é permitido ceder, vender, compartilhar ou transferir a conta a terceiros.')}
${p('5.5. O Usuário deverá comunicar imediatamente qualquer suspeita de acesso não autorizado, perda de senha ou utilização indevida da conta.')}
${p('5.6. A Plataforma poderá adotar autenticação em dois fatores, validação documental, biometria, análise de risco e outros mecanismos de segurança.')}
${p('5.7. O fornecimento de documentos ou dados não garante a aprovação do cadastro, da Reserva ou da transação.')}

${h(6, 'ANÚNCIOS E OBRIGAÇÕES DO ANUNCIANTE')}
${p('6.1. O Anunciante declara e garante que:')}
${letras([
    'é proprietário da Peça ou possui autorização válida para alugá-la;',
    'a Peça possui origem lícita;',
    'o anúncio não viola direitos de terceiros;',
    'as informações, fotografias e medidas são verdadeiras;',
    'os defeitos, desgastes, reparos e alterações relevantes foram informados;',
    'a Peça estará disponível no período anunciado;',
    'a Peça será entregue higienizada e em condições adequadas de uso;',
    'cumprirá as obrigações tributárias, comerciais e consumeristas que lhe forem aplicáveis.',
  ])}
${p('6.2. O anúncio deverá informar, no mínimo:')}
${letras([
    'categoria e descrição da Peça;', 'marca, quando aplicável;', 'tamanho indicado pelo fabricante;',
    'medidas relevantes;', 'cor e material;', 'estado de conservação;', 'defeitos ou sinais de uso;',
    'valor da locação;', 'período mínimo ou máximo de locação;', 'Valor de Reposição;',
    'valor ou critério de cálculo da caução;', 'condições de retirada, entrega e devolução;',
    'restrições de uso e cuidados especiais;', 'política de cancelamento aplicável.',
  ])}
${p('6.3. Fotografias meramente ilustrativas somente poderão ser utilizadas quando isso estiver claramente informado e quando não induzirem o Locatário a erro.')}
${p('6.4. O Anunciante deverá utilizar, preferencialmente, fotografias atuais da Peça efetivamente disponibilizada.')}
${p('6.5. O Valor de Reposição deverá ser razoável e compatível com a marca, idade, estado de conservação, preço de aquisição, depreciação e valor de mercado da Peça.')}
${p('6.6. A Plataforma poderá solicitar nota fiscal, comprovante de aquisição, certificado de autenticidade, fotografias adicionais ou outros documentos.')}
${p('6.7. A aprovação ou manutenção de um anúncio não significa certificação definitiva de autenticidade, qualidade, procedência ou adequação da Peça.')}
${p('6.8. A Plataforma poderá remover, suspender ou limitar anúncios que:')}
${letras([
    'apresentem informações insuficientes ou inconsistentes;',
    'aparentem envolver falsificação ou violação de propriedade intelectual;',
    'ofereçam risco à saúde ou segurança;',
    'violem estes Termos ou a legislação;',
    'apresentem histórico elevado de reclamações;',
    'possam prejudicar a reputação ou a segurança da comunidade.',
  ])}

${h(7, 'AUTENTICIDADE E ITENS PROIBIDOS')}
${p('7.1. É proibido anunciar:')}
${letras([
    'Peças falsificadas, réplicas ilícitas ou com marca adulterada;',
    'Peças de origem criminosa ou desconhecida;',
    'Peças cuja locação viole direitos autorais, marcas ou outros direitos;',
    'itens proibidos por lei;',
    'roupas íntimas usadas, salvo quando expressamente admitidas pela política da Plataforma e respeitadas as exigências sanitárias aplicáveis;',
    'produtos perigosos, contaminados ou impróprios para uso;',
    'itens que não estejam nas categorias autorizadas pelo Closet Club.',
  ])}
${p('7.2. Havendo suspeita de falsificação ou origem ilícita, a Plataforma poderá suspender o anúncio, bloquear preventivamente a conta e solicitar documentos.')}
${p('7.3. Quando exigido por lei ou por ordem de autoridade competente, a Plataforma poderá preservar e fornecer os registros relacionados ao anúncio ou à transação.')}

${h(8, 'MODERAÇÃO DOS ANÚNCIOS')}
${p('8.1. Os anúncios poderão ser submetidos a moderação automatizada ou humana antes ou depois da publicação.')}
${p('8.2. A Plataforma poderá corrigir a classificação, solicitar alterações ou impedir a publicação de conteúdo inadequado.')}
${p('8.3. A moderação não transfere ao Closet Club a propriedade da Peça nem elimina a responsabilidade do Anunciante pelas informações prestadas.')}
${p('8.4. O Closet Club não está obrigado a realizar perícia física ou autenticação especializada de todas as Peças, salvo quando esse serviço for expressamente contratado e identificado.')}

${h(9, 'SOLICITAÇÃO E FORMAÇÃO DA RESERVA')}
${p('9.1. O Locatário selecionará a Peça, o período pretendido e as condições disponibilizadas no anúncio.')}
${p('9.2. Antes de concluir a Reserva, serão apresentados, conforme aplicável:')}
${letras([
    'valor da locação;', 'taxas cobradas;', 'caução;', 'política de cancelamento;',
    'Valor de Reposição;', 'forma de retirada ou entrega;', 'data e horário de devolução;',
    'regras específicas da Peça.',
  ])}
${p('9.3. A Reserva somente será considerada confirmada após:')}
${letras([
    'aceitação do Locador, quando necessária;',
    'aprovação do pagamento ou autorização do meio de pagamento;',
    'aprovação das verificações de segurança;',
    'envio da confirmação pela Plataforma.',
  ])}
${p('9.4. A simples solicitação, inclusão no carrinho ou tentativa de pagamento não garante a Reserva.')}
${p('9.5. Após a confirmação, o Locador e o Locatário ficam vinculados às condições da Reserva, do anúncio e destes Termos.')}
${p('9.6. O comprovante eletrônico da Reserva integrará o contrato celebrado entre as partes.')}

${h(10, 'PREÇO, COMISSÃO E OUTRAS TAXAS')}
${p('10.1. O preço da locação será definido pelo Anunciante e apresentado ao Locatário antes da contratação.')}
${p(`10.2. Pela intermediação, o Closet Club cobrará do Locador comissão correspondente a <b>${comissao}%</b> do valor bruto da locação, salvo condição promocional ou comercial diferente informada antes da confirmação.`)}
${p('10.3. A comissão será descontada do valor a ser repassado ao Locador.')}
${p('10.4. A comissão não incidirá sobre a caução, salvo se houver utilização da caução para pagamento de obrigação que, conforme a política comercial aplicável, integre o valor da transação.')}
${p(`${F('CONFIRMAR SE A COMISSÃO INCIDIRÁ SOBRE INDENIZAÇÕES, ATRASOS OU TAXAS ADICIONAIS')}`)}
${p('10.5. Poderão ser cobradas do Locatário as seguintes taxas, desde que apresentadas antes da contratação:')}
${letras([
    `taxa de serviço: ${F('PREENCHER OU EXCLUIR')};`,
    `taxa de processamento: ${F('PREENCHER OU EXCLUIR')};`,
    `taxa de entrega: ${F('PREENCHER OU EXCLUIR')};`,
    `proteção ou seguro opcional: ${F('PREENCHER OU EXCLUIR')};`,
    'outras taxas claramente identificadas.',
  ])}
${p('10.6. Nenhuma cobrança obrigatória será acrescentada após a confirmação, salvo decorrente de atraso, dano, perda, alteração solicitada pelo Usuário ou outra hipótese previamente informada.')}
${p('10.7. Cupons, descontos e créditos promocionais estarão sujeitos a regras próprias, prazo de validade e condições de utilização.')}

${h(11, 'PROCESSAMENTO DO PAGAMENTO')}
${p(`11.1. Os pagamentos serão processados por ${F('NOME DO PRESTADOR DE PAGAMENTOS')}, de acordo com seus próprios termos e políticas.`)}
${p('11.2. O Closet Club poderá compartilhar com o Prestador de Pagamentos os dados necessários ao processamento, prevenção de fraude, estorno e cumprimento de obrigações legais.')}
${p('11.3. O pagamento poderá ser realizado por:')}
${letras(['Pix;', 'cartão de crédito;', 'cartão de débito;', 'saldo ou carteira digital;', `${F('outras modalidades')}.`])}
${p('11.4. O pagamento poderá ser recusado ou submetido a análise adicional por suspeita de fraude, divergência cadastral, falta de limite, erro de autenticação ou decisão do Prestador de Pagamentos.')}
${p('11.5. Quando o pagamento for parcelado, deverão ser informadas previamente as condições, juros e eventuais custos.')}
${p('11.6. A expressão “retenção pela Plataforma”, quando utilizada, significa a manutenção temporária dos recursos no fluxo operacional do Prestador de Pagamentos ou em estrutura juridicamente apropriada, não se confundindo com receita própria do Closet Club.')}

${h(12, 'REPASSE AO LOCADOR')}
${p('12.1. O valor líquido devido ao Locador corresponderá ao valor efetivamente recebido, descontados:')}
${letras([
    'a comissão do Closet Club;', 'estornos e reembolsos;', 'chargebacks;',
    'taxas expressamente atribuídas ao Locador;', 'tributos retidos por determinação legal;',
    'outros valores devidos nos termos da Reserva.',
  ])}
${p(`12.2. O repasse será iniciado em até ${F('número')} dias úteis após:`)}
${letras(['a devolução da Peça; e', 'o encerramento do prazo inicial para comunicação de danos; ou', 'a conclusão de eventual disputa.'])}
${p('12.3. O prazo efetivo de crédito dependerá do Prestador de Pagamentos e da instituição bancária do Locador.')}
${p('12.4. O repasse poderá ser temporariamente suspenso quando houver:')}
${letras([
    'contestação da transação;', 'suspeita de fraude;', 'disputa sobre dano, atraso ou não devolução;',
    'determinação judicial ou administrativa;', 'inconsistência nos dados bancários;',
    'necessidade de verificação de identidade;', 'descumprimento destes Termos.',
  ])}
${p('12.5. A suspensão preventiva deverá se limitar ao valor relacionado ao risco identificado, sempre que tecnicamente possível.')}

${h(13, 'CAUÇÃO')}
${p('13.1. A Reserva poderá exigir caução, cujo valor ou critério de cálculo será informado antes da contratação.')}
${p(`13.2. A caução será constituída por: ${F('escolher e descrever')}`)}
${letras(['pré-autorização no cartão;', 'cobrança efetiva com posterior reembolso;', 'bloqueio em carteira digital;', 'outro mecanismo administrado pelo Prestador de Pagamentos.'])}
${p('13.3. A caução é uma garantia temporária, não integra a receita do Closet Club nem constitui pagamento definitivo ao Locador.')}
${p('13.4. A caução poderá ser utilizada, total ou parcialmente, para cobrir:')}
${letras([
    'atraso na devolução;', 'reparo de dano comprovado;', 'limpeza extraordinária decorrente de uso inadequado;',
    'perda, extravio ou não devolução;',
    'despesas adicionais razoáveis, diretamente relacionadas ao descumprimento e comprovadas;',
    'outros valores expressamente previstos na Reserva.',
  ])}
${p('13.5. A caução não poderá ser apropriada unilateralmente pelo Locador.')}
${p('13.6. Havendo reclamação, será observado o procedimento de disputa previsto nestes Termos.')}
${p('13.7. A parte incontroversa da caução deverá ser liberada assim que tecnicamente possível.')}
${p(`13.8. Não havendo reclamação, a caução será liberada ou reembolsada em até ${F()} dias úteis após a devolução.`)}
${p('13.9. O prazo para o valor aparecer na conta ou na fatura dependerá do meio de pagamento e da instituição emissora.')}
${p('13.10. Caso o prejuízo comprovado exceda a caução, o responsável continuará obrigado ao pagamento da diferença.')}

${h(14, 'RETIRADA, ENTREGA E DEVOLUÇÃO')}
${p('14.1. A Peça será entregue ou retirada conforme a modalidade indicada na Reserva:')}
${letras(['retirada pessoal no endereço ou ponto combinado;', 'entrega pelo Locador;', 'entrega por transportadora ou serviço parceiro;', 'ponto de retirada;', `${F('outra modalidade')}.`])}
${p('14.2. O endereço residencial dos Usuários não deverá ser exibido publicamente e somente será compartilhado quando necessário à execução da Reserva.')}
${p('14.3. O Locatário deverá verificar a Peça no momento do recebimento e registrar imediatamente qualquer divergência.')}
${p('14.4. O Locador poderá solicitar documento de identificação compatível com o cadastro, vedada a retenção física do documento como garantia.')}
${p('14.5. A retirada ou entrega deverá ser registrada por meio de:')}
${letras(['código de confirmação;', 'fotografias;', 'assinatura eletrônica;', 'registro no aplicativo;', `${F('outro procedimento')}.`])}
${p(`14.6. A devolução deverá ocorrer até ${F('horário')} do dia ${F('data ou regra')}, no local e forma indicados na Reserva.`)}
${p('14.7. O Locatário deverá obter comprovante da devolução.')}
${p('14.8. Quando houver transporte por terceiro, a responsabilidade por atraso, perda ou avaria será apurada considerando a modalidade contratada e a responsabilidade legal de cada participante.')}

${h(15, 'INSPEÇÃO E REGISTRO DO ESTADO DA PEÇA')}
${p('15.1. Antes da entrega, o Locador deverá registrar o estado da Peça por fotografias ou vídeos atuais, destacando defeitos existentes.')}
${p(`15.2. O Locatário deverá conferir a Peça tão logo a receba e comunicar divergências no prazo de ${F('número de horas')}.`)}
${p('15.3. A ausência de comunicação no prazo poderá gerar presunção relativa de que a Peça foi recebida conforme os registros, sem impedir a demonstração de vício oculto ou de fato posterior.')}
${p('15.4. Na devolução, as partes deverão produzir novo registro fotográfico ou audiovisual.')}
${p('15.5. Serão considerados na análise de uma disputa:')}
${letras([
    'fotografias e vídeos;', 'mensagens trocadas pela Plataforma;', 'comprovantes de entrega e devolução;',
    'laudos, orçamentos e notas fiscais;', 'descrição do anúncio;', 'registros do sistema;', 'outros documentos pertinentes.',
  ])}

${h(16, 'OBRIGAÇÕES DO LOCADOR')}
${p('Além das demais obrigações previstas nestes Termos, o Locador deverá:')}
${letras([
    'entregar a Peça correta e no prazo;', 'garantir que a Peça esteja limpa e em condições adequadas;',
    'informar defeitos, restrições e cuidados especiais;', 'respeitar a Reserva confirmada;',
    'não exigir pagamentos não informados;', 'não utilizar a caução como fonte de lucro;',
    'agir com boa-fé em reclamações de dano;', 'preservar a privacidade e a segurança do Locatário;',
    'emitir documento fiscal quando legalmente obrigado;',
    'cumprir a legislação aplicável quando atuar de maneira habitual ou profissional.',
  ])}

${h(17, 'OBRIGAÇÕES DO LOCATÁRIO')}
${p('O Locatário deverá:')}
${letras([
    'utilizar a Peça de maneira cuidadosa e adequada;', 'respeitar as instruções do anúncio;',
    'não emprestar, sublocar ou transferir a Peça;',
    'não alterar, cortar, tingir, ajustar ou customizar a Peça sem autorização;',
    'não lavar ou higienizar a Peça quando isso for proibido;',
    'comunicar imediatamente perda, furto, dano ou acidente;',
    'devolver a Peça no prazo e no local combinados;',
    'não remover etiquetas, identificadores ou dispositivos de segurança;',
    'não utilizar a Peça em atividade proibida ou incompatível com suas características;',
    'manter atualizados os dados de contato e pagamento.',
  ])}

${h(18, 'DESGASTE NORMAL, DANO E LIMPEZA EXTRAORDINÁRIA')}
${p('18.1. O Locatário responde por danos que ultrapassem o desgaste normal decorrente do uso adequado.')}
${p('18.2. Não serão considerados danos indenizáveis:')}
${letras([
    'sinais normais e proporcionais ao uso regular;', 'defeitos informados no anúncio;',
    'problemas preexistentes registrados na entrega;',
    'deterioração decorrente exclusivamente de vício próprio, baixa qualidade ou envelhecimento normal da Peça.',
  ])}
${p('18.3. Poderão ser considerados danos indenizáveis:')}
${letras([
    'rasgos, cortes ou perfurações relevantes;', 'manchas permanentes ou de difícil remoção;', 'queimaduras;',
    'perda de botões, pedras ou componentes;', 'alterações não autorizadas;',
    'danos decorrentes de lavagem inadequada;', 'contaminação ou odor que exija tratamento extraordinário;',
    'outros danos comprovadamente causados durante a locação.',
  ])}
${p('18.4. Quando o dano for reparável, a responsabilidade ficará limitada ao custo razoável e comprovado do reparo ou limpeza extraordinária.')}
${p('18.5. O valor do reparo não poderá superar o Valor de Reposição aplicável, salvo situação excepcional devidamente comprovada e aceita pelas partes ou reconhecida por decisão competente.')}
${p('18.6. Não será permitida a cobrança cumulativa do valor integral de reposição com o custo de reparo da mesma Peça.')}

${h(19, 'PERDA, EXTRAVIO, FURTO E NÃO DEVOLUÇÃO')}
${p('19.1. O Locatário deverá comunicar imediatamente qualquer perda, extravio, furto, roubo ou impossibilidade de devolução.')}
${p('19.2. Em caso de não devolução, perda ou dano irrecuperável, o Locatário poderá responder pelo valor necessário à reposição por Peça equivalente.')}
${p('19.3. A indenização considerará:')}
${letras([
    'valor informado e aceito na Reserva;', 'comprovante de aquisição, quando disponível;', 'idade da Peça;',
    'estado de conservação;', 'depreciação;', 'preço de mercado de Peças iguais ou equivalentes;',
    'possibilidade de aquisição de item usado equivalente;', 'autenticidade comprovada;', 'demais circunstâncias relevantes.',
  ])}
${p('19.4. O Valor de Reposição declarado no anúncio será um limite de referência, mas não constituirá reconhecimento automático de dívida nem prevalecerá quando manifestamente excessivo ou incompatível com a realidade.')}
${p('19.5. A indenização não deverá proporcionar enriquecimento indevido ou substituição de Peça usada por outra substancialmente superior.')}
${p('19.6. Caso a Peça seja localizada após o pagamento da indenização, as partes deverão definir a restituição da Peça ou do valor, descontadas as despesas comprovadas e eventuais perdas efetivas.')}

${h(20, 'ATRASO NA DEVOLUÇÃO')}
${p('20.1. O Locatário deverá devolver a Peça até o prazo indicado na Reserva.')}
${p(`20.2. Em caso de atraso, poderá ser cobrado: ${F('definir um único critério claro')}`)}
${letras([
    `valor proporcional a uma diária adicional por período de ${F()}; ou`,
    `multa de ${F()}% do valor da locação; ou`,
    `taxa fixa de R$ ${F()}; ou`,
    'outro critério apresentado antes da contratação.',
  ])}
${p('20.3. A cobrança deverá ser proporcional e não prejudicará a reparação de prejuízo adicional comprovado, como a perda de uma Reserva posterior.')}
${p('20.4. Não haverá cobrança quando o atraso decorrer exclusivamente de falha comprovada da Plataforma ou do serviço de entrega por ela diretamente contratado, sem responsabilidade do Locatário.')}
${p(`20.5. O atraso superior a ${F()} horas ou dias, sem comunicação e justificativa, poderá ser tratado como indício de não devolução.`)}

${h(21, 'PROCEDIMENTO DE RECLAMAÇÃO E DISPUTA')}
${p(`21.1. O Locador deverá comunicar dano, atraso, falta de item ou outra irregularidade no prazo de ${F('SUGESTÃO: 48 horas')} após a devolução.`)}
${p('21.2. A reclamação deverá conter:')}
${letras([
    'descrição do problema;', 'fotografias ou vídeos anteriores e posteriores;',
    'registros da entrega e devolução;', 'orçamento, laudo ou nota fiscal, quando aplicável;',
    'valor pretendido e sua justificativa.',
  ])}
${p(`21.3. O Locatário será notificado e terá ${F('SUGESTÃO: cinco dias úteis')} para apresentar manifestação e documentos.`)}
${p('21.4. Enquanto a reclamação estiver em análise, poderá permanecer bloqueado somente o valor razoavelmente relacionado à disputa, sempre que tecnicamente possível.')}
${p('21.5. O Closet Club poderá:')}
${letras([
    'solicitar documentos adicionais;', 'comparar os registros apresentados;', 'propor acordo;',
    'liberar integralmente a caução;', 'autorizar utilização parcial ou integral da caução;',
    'manter o valor bloqueado por prazo adicional justificado;',
    'recomendar que as partes procurem o Poder Judiciário ou órgão competente.',
  ])}
${p('21.6. A análise interna será realizada com base nos documentos disponíveis e não possui natureza de arbitragem, perícia judicial ou decisão jurisdicional.')}
${p('21.7. A Plataforma poderá adotar decisão operacional para administrar os valores sob seu controle, sem impedir que qualquer parte busque os órgãos de defesa do consumidor ou o Poder Judiciário.')}
${p('21.8. Alegações fraudulentas poderão resultar em suspensão da conta, sem prejuízo das medidas legais cabíveis.')}

${h(22, 'CANCELAMENTO PELO LOCATÁRIO')}
${p('22.1. O cancelamento deverá ser solicitado pelos canais disponibilizados na Plataforma.')}
${p('22.2. Salvo direito legal aplicável ou condição diferente apresentada na Reserva, será adotada a seguinte política:')}
${letras([
    `cancelamento com mais de ${F()} dias de antecedência: reembolso de ${F()}%;`,
    `cancelamento entre ${F()} e ${F()} dias de antecedência: reembolso de ${F()}%;`,
    `cancelamento com menos de ${F()} horas ou dias: reembolso de ${F()}%;`,
    `não comparecimento: ${F('consequência')}.`,
  ])}
${p(`22.3. Deverá ser definido se a taxa de serviço e os custos do meio de pagamento serão ${F('integralmente reembolsados, parcialmente reembolsados ou não reembolsados, observada a legislação')}.`)}
${p('22.4. A política de cancelamento aplicável deverá ser apresentada antes da confirmação.')}

${h(23, 'CANCELAMENTO PELO LOCADOR')}
${p('23.1. O Locador deverá manter a disponibilidade das Peças oferecidas.')}
${p('23.2. Caso o Locador cancele uma Reserva confirmada, o Locatário terá direito, conforme o caso, a:')}
${letras(['reembolso integral;', 'auxílio para localizar Peça semelhante;', 'crédito promocional;', 'outras medidas previstas na política da Plataforma.'])}
${p('23.3. Cancelamentos injustificados ou recorrentes pelo Locador poderão resultar em:')}
${letras(['perda da comissão ou de benefício promocional;', 'redução de visibilidade;', 'suspensão de anúncios;', 'cobrança de taxa previamente informada;', 'suspensão ou encerramento da conta.'])}
${p('23.4. Nenhuma penalidade será aplicada quando o cancelamento decorrer de caso fortuito, força maior, risco à segurança, dano inesperado à Peça ou outra razão devidamente comprovada.')}

${h(24, 'DIREITO DE ARREPENDIMENTO')}
${p('24.1. O Closet Club disponibilizará canal eletrônico para solicitação de cancelamento e exercício do direito de arrependimento, quando legalmente aplicável.')}
${p('24.2. O exercício do direito de arrependimento será analisado conforme a natureza da contratação, o momento da solicitação, o início da execução do serviço e a legislação vigente.')}
${p('24.3. Nenhuma disposição destes Termos limitará direitos irrenunciáveis assegurados ao consumidor.')}
${p('24.4. Quando reconhecido o direito de arrependimento, os valores abrangidos serão restituídos pelos meios legalmente exigidos.')}

${h(25, 'NÃO COMPARECIMENTO E IMPOSSIBILIDADE DE ENTREGA')}
${p('25.1. Considera-se não comparecimento a ausência do Locatário no local e horário combinados, sem comunicação adequada.')}
${p(`25.2. O período de tolerância será de ${F()} minutos ou horas.`)}
${p('25.3. As consequências do não comparecimento deverão ser informadas na Reserva.')}
${p('25.4. Caso a Peça não corresponda substancialmente ao anúncio, apresente defeito não informado ou não seja entregue, o Locatário deverá registrar a ocorrência antes de utilizá-la.')}
${p('25.5. Confirmada falha imputável ao Locador, o Locatário poderá receber reembolso integral ou solução equivalente.')}

${h(26, 'TROCAS E ALTERAÇÕES DA RESERVA')}
${p('26.1. Alterações de datas, Peças, tamanhos ou condições dependerão da disponibilidade e da concordância das partes.')}
${p('26.2. Eventual diferença de preço deverá ser informada e aceita antes da alteração.')}
${p('26.3. A alteração somente será válida após registro e confirmação pela Plataforma.')}

${h(27, 'SEGURO OU PROTEÇÃO OPCIONAL')}
${p(`${F('SEÇÃO CONDICIONAL — hoje NÃO há apólice contratada. Decidir entre remover a seção ou renomeá-la conforme 27.6')}`)}
${p(`27.1. Quando disponibilizado, o seguro opcional será contratado junto à seguradora ${F()}, inscrita no CNPJ sob o nº ${F()}, conforme processo Susep nº ${F()}.`)}
${p('27.2. A contratação será facultativa e dependerá do pagamento do prêmio informado.')}
${p('27.3. As coberturas, exclusões, franquias, limites e procedimentos estarão descritos nas condições do seguro apresentadas antes da contratação.')}
${p('27.4. O Closet Club não poderá ampliar ou alterar as coberturas previstas na apólice.')}
${p('27.5. A contratação de seguro não elimina automaticamente a responsabilidade do Usuário por valores não cobertos, franquias, exclusões ou atos dolosos.')}
${p('27.6. Não havendo seguro emitido por entidade autorizada, qualquer mecanismo interno deverá receber denominação diversa e juridicamente adequada, como programa de proteção, garantia contratual ou assistência, conforme sua estrutura real.')}

${h(28, 'TRIBUTOS E DOCUMENTOS FISCAIS')}
${p('28.1. Cada Usuário será responsável por verificar e cumprir as obrigações fiscais decorrentes de suas atividades.')}
${p('28.2. O Closet Club emitirá documento fiscal referente à sua comissão ou taxa de serviço, conforme a legislação aplicável.')}
${p('28.3. O Locador será responsável pela emissão de documento fiscal ou recibo relacionado à locação quando legalmente obrigado.')}
${p('28.4. A Plataforma poderá realizar retenções tributárias determinadas por lei e solicitar informações fiscais dos Usuários.')}
${p('28.5. O Usuário que atuar de maneira habitual, organizada ou profissional deverá avaliar a necessidade de regularização empresarial e fiscal.')}

${h(29, 'PROIBIÇÃO DE PAGAMENTO FORA DA PLATAFORMA')}
${p('29.1. É proibido utilizar a Plataforma para captar uma negociação e concluir a mesma locação por fora, com a finalidade de evitar a comissão, as taxas ou os mecanismos de segurança.')}
${p('29.2. Também é proibido:')}
${letras([
    'inserir telefone, chave Pix, endereço eletrônico ou link destinado a desviar a transação;',
    'solicitar pagamento direto de Reserva iniciada na Plataforma;',
    'orientar o outro Usuário a cancelar a Reserva para contratar externamente;',
    'utilizar mensagens codificadas para contornar os controles.',
  ])}
${p('29.3. A proibição se limita às negociações e locações iniciadas pela Plataforma e não impede relações independentes que não tenham sido originadas ou intermediadas pelo Closet Club.')}

${h(30, 'OUTRAS CONDUTAS PROIBIDAS')}
${p('É vedado:')}
${letras([
    'praticar fraude;', 'criar contas falsas ou duplicadas para contornar sanções;', 'manipular avaliações;',
    'ameaçar, assediar ou discriminar outros Usuários;', 'enviar vírus, códigos maliciosos ou links fraudulentos;',
    'acessar indevidamente contas ou sistemas;', 'coletar dados de Usuários para finalidade não autorizada;',
    'utilizar robôs ou automações sem autorização;', 'reproduzir ou explorar comercialmente o conteúdo da Plataforma;',
    'utilizar a Plataforma para lavagem de dinheiro ou outra atividade ilícita;',
    'apresentar reclamação falsa ou documento adulterado;', 'utilizar a Peça para finalidade ilegal;',
    'violar direitos de propriedade intelectual;',
    'prejudicar deliberadamente a reputação de outro Usuário ou da Plataforma.',
  ])}

${h(31, 'AVALIAÇÕES E CONTEÚDOS DOS USUÁRIOS')}
${p('31.1. Após uma transação, os Usuários poderão publicar avaliações verdadeiras, respeitosas e relacionadas à experiência.')}
${p('31.2. É proibido publicar conteúdo:')}
${letras([
    'falso ou enganoso;', 'ofensivo, discriminatório ou ameaçador;',
    'que exponha dados pessoais desnecessários;', 'que viole direitos de terceiros;',
    'usado como instrumento de chantagem ou extorsão.',
  ])}
${p('31.3. A Plataforma poderá remover avaliações que violem estes Termos, sem obrigação de remover críticas legítimas.')}
${p('31.4. Ao publicar fotografias, descrições, avaliações ou outros conteúdos, o Usuário concede ao Closet Club licença não exclusiva, gratuita, revogável quando compatível com a finalidade, para hospedar, reproduzir, adaptar tecnicamente e exibir o conteúdo na operação e divulgação da Plataforma.')}
${p('31.5. O Usuário declara possuir os direitos necessários sobre os conteúdos publicados.')}

${h(32, 'PROPRIEDADE INTELECTUAL DA PLATAFORMA')}
${p('32.1. A marca Closet Club, o software, o design, os textos institucionais, bancos de dados, elementos visuais e demais ativos da Plataforma pertencem à operadora ou a seus licenciantes.')}
${p('32.2. O acesso à Plataforma não transfere ao Usuário qualquer direito de propriedade intelectual.')}
${p('32.3. É proibido copiar, modificar, distribuir, vender, realizar engenharia reversa ou explorar os ativos sem autorização.')}

${h(33, 'PRIVACIDADE E PROTEÇÃO DE DADOS')}
${p('33.1. O tratamento de dados pessoais será realizado conforme a <a href="/closet/privacidade">Política de Privacidade</a> do Closet Club e a legislação aplicável.')}
${p('33.2. Poderão ser tratados dados para:')}
${letras([
    'criar e administrar contas;', 'confirmar identidade;', 'processar pagamentos;', 'prevenir fraudes;',
    'executar Reservas;', 'permitir comunicação entre Usuários;', 'administrar cauções e disputas;',
    'cumprir obrigações legais;', 'exercer direitos em processos;', 'melhorar os serviços;',
    'enviar comunicações comerciais, quando permitido.',
  ])}
${p('33.3. Os dados poderão ser compartilhados, quando necessário, com:')}
${letras([
    'Prestadores de Pagamentos;', 'empresas de verificação de identidade;', 'serviços de prevenção a fraude;',
    'hospedagem e tecnologia;', 'transportadores e parceiros de entrega;', 'seguradoras, quando houver seguro;',
    'autoridades públicas, nas hipóteses legais;', 'assessores jurídicos, contábeis e auditores.',
  ])}
${p('33.4. A Plataforma adotará medidas técnicas e administrativas razoáveis para proteger os dados.')}
${p(`33.5. Os direitos dos titulares poderão ser exercidos pelo canal ${F()}.`)}
${p('33.6. A Política de Privacidade integrará estes Termos para os fins aplicáveis.')}

${h(34, 'COMUNICAÇÕES ELETRÔNICAS')}
${p('34.1. O Usuário aceita receber comunicações operacionais por e-mail, aplicativo, SMS, WhatsApp ou outros canais cadastrados.')}
${p('34.2. Comunicações operacionais incluem confirmações, cobranças, alertas de segurança, mensagens sobre Reservas e alterações contratuais.')}
${p('34.3. Comunicações publicitárias poderão ser recusadas pelos mecanismos de descadastramento, sem prejuízo das mensagens necessárias à execução do serviço.')}
${p('34.4. O Usuário deverá manter seus dados atualizados.')}

${h(35, 'REGISTROS ELETRÔNICOS E PROVAS')}
${p('35.1. Os registros eletrônicos da Plataforma, incluindo datas, horários, confirmações, mensagens, fotografias, endereços IP e logs, poderão ser utilizados como meio de prova, observada a legislação.')}
${p('35.2. A aceitação eletrônica destes Termos terá validade contratual.')}
${p('35.3. O Closet Club poderá conservar registros pelo período necessário ao cumprimento de obrigações legais, prevenção de fraude e exercício regular de direitos.')}

${h(36, 'SUSPENSÃO E ENCERRAMENTO DE CONTAS')}
${p('36.1. A Plataforma poderá adotar suspensão preventiva quando houver indícios razoáveis de:')}
${letras(['fraude;', 'risco à segurança;', 'falsificação;', 'não devolução;', 'uso indevido de dados;', 'violação grave destes Termos.'])}
${p('36.2. A suspensão definitiva ou o encerramento poderá ocorrer em caso de:')}
${letras([
    'violação comprovada;', 'reincidência em condutas abusivas;', 'reclamações fraudulentas;',
    'tentativa reiterada de contratar por fora;', 'inadimplemento;', 'determinação legal;',
    'risco relevante à comunidade.',
  ])}
${p('36.3. O simples fato de apresentar reclamação ou disputar uma cobrança de boa-fé não será motivo de penalização.')}
${p('36.4. Sempre que possível e compatível com a segurança, o Usuário será informado sobre a razão da medida e poderá apresentar manifestação pelo canal de atendimento.')}
${p('36.5. A suspensão não eliminará obrigações relacionadas a Reservas, pagamentos, devoluções ou disputas anteriores.')}
${p('36.6. Os valores pendentes terão destinação conforme o resultado das transações e disputas.')}

${h(37, 'RESPONSABILIDADE DO CLOSET CLUB')}
${p('37.1. O Closet Club responderá pelas falhas dos serviços de intermediação, pagamento, tecnologia, atendimento ou segurança que estiverem sob seu controle, nos limites da legislação aplicável.')}
${p('37.2. Salvo quando a legislação determinar de outro modo, o Closet Club não será responsável por:')}
${letras([
    'defeitos da Peça não conhecidos e não controláveis pela Plataforma;',
    'informações falsas fornecidas por Usuário;', 'uso inadequado da Peça;',
    'condutas praticadas fora da Plataforma;', 'perdas decorrentes de dados bancários incorretos;',
    'atrasos de terceiros independentes;', 'indisponibilidade causada por força maior;',
    'negócios realizados por fora da Plataforma.',
  ])}
${p('37.3. Nenhuma cláusula destes Termos excluirá ou limitará responsabilidade que não possa ser afastada por lei.')}
${p('37.4. O Closet Club não garante que toda Peça servirá perfeitamente no Locatário, especialmente quando as medidas e informações do anúncio estiverem corretas.')}
${p('37.5. Recomendações, classificações e resultados de busca não representam garantia de qualidade ou adequação.')}

${h(38, 'RESPONSABILIDADE DOS USUÁRIOS')}
${p('38.1. Cada Usuário responderá pelos danos que causar ao Closet Club, a outro Usuário ou a terceiro por ação ou omissão ilícita.')}
${p('38.2. A responsabilidade dependerá da demonstração do fato, do dano e do nexo aplicável, observadas as regras legais pertinentes.')}
${p('38.3. Não serão exigidas do consumidor despesas genéricas de cobrança ou honorários extrajudiciais sem fundamento jurídico, proporcionalidade e comprovação.')}
${p('38.4. Multas e indenizações previstas nestes Termos poderão ser reduzidas quando manifestamente excessivas ou quando houver cumprimento parcial da obrigação, conforme a legislação.')}

${h(39, 'CHARGEBACK, ESTORNO E FRAUDE DE PAGAMENTO')}
${p('39.1. Caso uma transação seja contestada perante o banco ou emissor, o Closet Club poderá solicitar documentos aos Usuários.')}
${p('39.2. O valor correspondente poderá ser temporariamente bloqueado até a conclusão da contestação.')}
${p('39.3. Se o Locador já tiver recebido valor posteriormente estornado, poderá ser solicitado o ressarcimento, desde que a cobrança seja devidamente fundamentada.')}
${p('39.4. O Usuário não deverá solicitar chargeback de má-fé quando a disputa puder ser resolvida pelos canais regulares.')}
${p('39.5. A utilização fraudulenta do meio de pagamento poderá ser comunicada às autoridades.')}

${h(40, 'DISPONIBILIDADE E MANUTENÇÃO')}
${p('40.1. A Plataforma poderá passar por manutenção, atualização ou interrupção temporária.')}
${p('40.2. O Closet Club buscará preservar a continuidade dos serviços, mas não garante funcionamento ininterrupto.')}
${p('40.3. Manutenções programadas relevantes serão comunicadas quando possível.')}
${p('40.4. Falhas que afetem Reservas confirmadas serão tratadas pelo atendimento.')}

${h(41, 'CASO FORTUITO E FORÇA MAIOR')}
${p('41.1. Nenhuma parte será responsabilizada pelo descumprimento causado exclusivamente por evento inevitável e alheio ao seu controle, observada a legislação.')}
${p('41.2. A parte afetada deverá comunicar o fato e adotar medidas razoáveis para reduzir os prejuízos.')}
${p('41.3. As consequências sobre cancelamento e reembolso serão avaliadas conforme o caso e os direitos legais aplicáveis.')}

${h(42, 'ATENDIMENTO E RECLAMAÇÕES')}
${p('42.1. O atendimento estará disponível pelos seguintes canais:')}
${li([
    `<b>E-mail:</b> ${F()}`,
    `<b>WhatsApp ou telefone:</b> ${F()}`,
    `<b>Formulário:</b> ${F()}`,
    `<b>Horário de atendimento:</b> ${F()}`,
    `<b>Prazo estimado para primeira resposta:</b> ${F()}`,
  ])}
${p('42.2. O atendimento eletrônico deverá confirmar o recebimento das solicitações relevantes.')}
${p('42.3. Os Usuários poderão recorrer aos órgãos de defesa do consumidor e ao Poder Judiciário, quando cabível.')}
${p(`42.4. A Plataforma poderá aderir ao Consumidor.gov.br ou a outra plataforma de resolução de conflitos. ${F('informar se haverá adesão')}`)}

${h(43, 'ALTERAÇÃO DESTES TERMOS')}
${p('43.1. Estes Termos poderão ser atualizados para refletir mudanças legais, operacionais, tecnológicas ou comerciais.')}
${p('43.2. Alterações relevantes serão comunicadas com antecedência razoável.')}
${p('43.3. As Reservas confirmadas permanecerão submetidas às condições vigentes no momento da contratação, salvo mudança legal obrigatória ou alteração mais favorável aceita pelas partes.')}
${p('43.4. Caso o Usuário não concorde com a nova versão, poderá encerrar sua conta, observadas as obrigações pendentes.')}

${h(44, 'ENCERRAMENTO VOLUNTÁRIO DA CONTA')}
${p('44.1. O Usuário poderá solicitar o encerramento da conta pelos canais disponibilizados.')}
${p('44.2. O encerramento poderá ser concluído após:')}
${letras([
    'devolução das Peças;', 'encerramento das Reservas;', 'quitação de valores;',
    'conclusão de disputas;', 'cumprimento de obrigações de conservação de registros.',
  ])}
${p('44.3. Alguns dados poderão ser preservados pelo prazo legal ou para exercício regular de direitos.')}

${h(45, 'LEGISLAÇÃO APLICÁVEL E FORO')}
${p('45.1. Estes Termos serão regidos pelas leis da República Federativa do Brasil.')}
${p('45.2. Nas relações que não sejam caracterizadas como de consumo, fica eleito o foro de Brasília, Distrito Federal, com renúncia a qualquer outro, por mais privilegiado que seja.')}
${p('45.3. Nas relações de consumo, será respeitado o foro competente previsto na legislação, inclusive o foro do domicílio do consumidor, quando aplicável.')}
${p('45.4. Antes de recorrer ao Poder Judiciário, as partes poderão tentar solucionar a controvérsia pelos canais de atendimento, sem que isso constitua condição obrigatória para o exercício de direitos.')}

${h(46, 'DISPOSIÇÕES FINAIS')}
${p('46.1. Estes Termos, a Política de Privacidade, as condições do anúncio e o comprovante da Reserva formam o conjunto contratual aplicável.')}
${p('46.2. Em caso de conflito, prevalecerá:')}
${letras([
    'a legislação obrigatória;',
    'a condição específica da Reserva, quando validamente informada;',
    'estes Termos;', 'políticas complementares.',
  ])}
${p('46.3. A eventual nulidade de uma cláusula não afetará as demais.')}
${p('46.4. A tolerância quanto ao descumprimento não representa renúncia de direito.')}
${p('46.5. O Usuário poderá salvar ou imprimir estes Termos.')}
${p('46.6. A versão vigente permanecerá disponível no site ou aplicativo.')}

${h(47, 'DECLARAÇÃO DE ACEITE')}
${p('Ao selecionar a opção “Li e aceito os Termos de Uso”, criar uma conta, publicar um anúncio ou concluir uma Reserva, o Usuário declara que:')}
${letras([
    'leu estes Termos;', 'compreendeu seu conteúdo;', 'teve acesso prévio às condições da contratação;',
    'concorda em cumprir as obrigações assumidas;',
    'está ciente de que o contrato de locação da Peça é celebrado entre Locador e Locatário;',
    'reconhece a atuação do Closet Club como prestador dos serviços de intermediação.',
  ])}
`;
}

module.exports = { titulo: 'Termos de uso', corpo, MINUTA };
