// =====================================================================
// ONDA LIVRO · SEEDS — o escritório nasce com os artefatos do livro.
//
// Roda 1× por banco de tenant (inicializador do db.js). É o que faz o
// leitor abrir o sistema e reconhecer o livro: a política de uso de IA
// (Cap. 6.10/42.12), as cartas de autonomia dos agentes (10.10), os POPs
// do que o livro manda automatizar primeiro (7.8), a tabela de
// temporalidade (35.11) e a biblioteca de cláusulas em três níveis (29.3).
//
// Tudo entra como RASCUNHO/modelo: nada aqui vale como decisão do
// escritório antes de um humano aprovar (é a regra do próprio livro).
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('../db');

const jaTem = (tabela, coluna, valor) => !!db.prepare(`SELECT 1 FROM ${tabela} WHERE ${coluna} = ?`).get(valor);

// ---- 6.10 / 42.12 política institucional de uso de IA (rascunho a aprovar)
// Normas conferidas em 30/07/2026 nas fontes oficiais:
//  · Recomendação CFOAB n. 001/2024 (11/11/2024) — 4 pilares: legislação aplicável,
//    confidencialidade e privacidade, prática jurídica ética e COMUNICAÇÃO AO CLIENTE
//    sobre o uso de IA generativa (oab.org.br/noticia/62711).
//  · Resolução CNJ n. 615/2025 (public. 14/03/2025, vigente 14/07/2025) — revogou a
//    Res. 332/2020; alterada pela Res. CNJ n. 674/2026, que mexeu só no art. 15
//    (composição do comitê), sem alterar os deveres substantivos.
//  · Provimento CFOAB n. 205/2021 — EM VIGOR (revogou o Prov. 94/2000).
//  · Lei 13.709/2018 (LGPD), Lei 8.906/94 (EAOAB) e CED (Res. CFOAB 02/2015).
const POLITICA_IA = `MINUTA — Política institucional de uso de Inteligência Artificial
(baseada no Cap. 6.10 e 42.12 de "Claude AI na Prática Jurídica"; normas conferidas em 30/07/2026.
Revisar, adaptar à realidade do escritório e aprovar com advogado responsável.)

BASE NORMATIVA. Recomendação CFOAB n. 001/2024 (uso de IA generativa na advocacia, quatro pilares:
legislação aplicável, confidencialidade e privacidade, prática jurídica ética e comunicação ao
cliente); Resolução CNJ n. 615/2025 (Política de Uso de IA no Judiciário, vigente desde 14/07/2025,
que revogou a Res. 332/2020, com a alteração da Res. CNJ n. 674/2026); Provimento CFOAB n. 205/2021
(publicidade); Código de Ética e Disciplina (Res. CFOAB 02/2015); Lei 8.906/94 (EAOAB);
Lei 13.709/2018 (LGPD).

1. FINALIDADE. Disciplinar o uso de ferramentas de IA na atividade do escritório, preservando
sigilo profissional, proteção de dados e responsabilidade técnica do advogado.

2. RESPONSABILIDADE. Toda entrega assinada pelo escritório é de responsabilidade do advogado
que a subscreve. A IA é instrumento de apoio: não substitui análise, não decide e não responde
por erro. Resposta de IA é HIPÓTESE até conferência humana. A supervisão é dever de quem coordena
a equipe, e não se delega à ferramenta.

3. O QUE PODE SER ENVIADO. É permitido enviar: teses, questões jurídicas abstratas, textos
públicos (leis, jurisprudência publicada) e documentos anonimizados. É VEDADO enviar, sem
autorização expressa: nome completo de cliente ou de terceiro, CPF/RG/CNH, endereço, dados
bancários, dados sensíveis (saúde, biometria, convicção), processo em segredo de justiça e
estratégia sigilosa de caso.

4. ANONIMIZAÇÃO. Antes de submeter peça ou documento, substituir identificadores por rótulos
(CLIENTE, PARTE CONTRÁRIA, TESTEMUNHA 1). Minimização é regra: só o necessário à pergunta.

5. CONFERÊNCIA OBRIGATÓRIA. Nenhuma citação de lei, súmula ou precedente vai para peça, parecer
ou mensagem a cliente sem que a fonte OFICIAL tenha sido aberta e o inteiro teor conferido. A
conferência é registrada no sistema, com nome e data.

6. REVISÃO HUMANA SIGNIFICATIVA. Revisar é ler, comparar com as fontes e decidir — não é aprovar
no botão. Peça, parecer, minuta de contrato e mensagem a cliente exigem revisão nominal antes de
sair. Conteúdo gerado por IA circula carimbado como MINUTA.

7. COMUNICAÇÃO AO CLIENTE (Recomendação CFOAB 001/2024). Antes de iniciar o uso de IA na prestação
do serviço, o escritório formaliza ao cliente essa intenção, informando: a finalidade do uso na
defesa dos direitos dele, os benefícios e as limitações da tecnologia naquele caso, os riscos
envolvidos (imprecisão do conteúdo gerado e exposição de dados) e as medidas de segurança e
confidencialidade adotadas. O registro fica no dossiê do cliente. Se o cliente recusar, o caso é
conduzido sem IA.

8. TRANSPARÊNCIA PERANTE O JUÍZO. Quando o juízo solicitar, informa-se o uso de IA na elaboração da
peça (Res. CNJ 615/2025). Não se atribui à ferramenta autoria de manifestação processual.

9. LIMITES DOS AGENTES. Todo agente automatizado tem carta de autonomia escrita, com três blocos:
o que faz sozinho, o que só faz com aprovação humana e o que é proibido. Agente não protocola,
não envia mensagem a cliente, não confirma prazo e não movimenta dinheiro.

10. FORNECEDORES. Contratar IA exige verificar: onde os dados ficam, se são usados para treino,
prazo de retenção, subcontratados e plano de saída. O inventário de sistemas registra cada um.

11. REGISTRO E AUDITORIA. Consulta relevante, fonte usada e revisão feita ficam registradas.
Sem trilha, não há como demonstrar diligência.

12. VIGÊNCIA E TREINAMENTO. Esta política é revisada ao menos anualmente e sempre que houver
mudança normativa relevante (OAB, ANPD, CNJ). Todos os integrantes confirmam ciência.`;

const POLITICA_PRIVACIDADE = `MINUTA — Política de privacidade e proteção de dados do escritório
(Cap. 42. Revisar com o encarregado/DPO antes de aprovar.)

1. O escritório atua como CONTROLADOR dos dados de seus clientes e colaboradores e, em regra,
como controlador (não operador) no tratamento necessário ao exercício do direito de defesa.
2. Base legal predominante: exercício regular de direitos em processo (art. 7º, VI, LGPD) e
cumprimento de obrigação legal (art. 7º, II). Consentimento é exceção, não regra.
3. Dados sensíveis (art. 11 LGPD) em processo judicial recebem acesso restrito e trilha de acesso.
4. Compartilhamento com terceiros (correspondentes, peritos, plataformas de IA) só com base
legal, contrato e registro no inventário. O sigilo profissional (art. 34, VII, EAOAB e art. 35 do
CED) prevalece sobre conveniência operacional.
5. Titular é atendido em até 15 dias, em declaração clara e completa (art. 19, II, LGPD). Pedidos
são registrados no módulo de LGPD, com o prazo calculado pelo sistema.
6. Incidente de segurança segue o plano de resposta: contenção, avaliação de risco, comunicação
à ANPD e aos titulares quando houver risco ou dano relevante (art. 48 LGPD), e registro das medidas.
7. Encerrado o caso, documentos e valores confiados pelo cliente são devolvidos, com prestação de
contas pormenorizada (art. 12 do CED — Res. CFOAB 02/2015). O que fica retido obedece à tabela de
temporalidade do escritório.`;

// ---- 10.10 / 47.12 cartas de autonomia dos agentes do Cap. 10
const CARTAS = [
  {
    agente: 'publicacoes', nome: 'Agente de publicações e prazos (Cap. 10.5)',
    escopo: 'Captura publicações oficiais, identifica processo e cliente, elimina duplicidade e sugere a providência e a contagem do prazo.',
    pode_sozinho: ['coletar publicações e andamentos das fontes oficiais', 'eliminar duplicidade por hash', 'sugerir classificação da providência', 'sugerir a contagem preliminar do prazo', 'abrir tarefa de triagem'],
    exige_aprovacao: ['confirmar prazo (data fatal)', 'distribuir prazo a responsável', 'avisar o cliente sobre a publicação'],
    proibido: ['protocolar peça', 'dar baixa em prazo', 'responder ao cliente', 'alterar data fatal já validada'],
    dados_acessa: 'Publicações, andamentos, processos e cadastro de OAB da equipe.',
  },
  {
    agente: 'pesquisa', nome: 'Agente de pesquisa jurídica (Cap. 10.6)',
    escopo: 'Monta plano de busca, coleta candidatos de jurisprudência/legislação e devolve tudo como HIPÓTESE a verificar.',
    pode_sozinho: ['propor plano de busca', 'registrar achados como hipótese', 'resumir ementa', 'apontar possível distinguishing'],
    exige_aprovacao: ['marcar achado como conferido', 'incluir precedente em peça', 'concluir a pesquisa'],
    proibido: ['citar precedente sem inteiro teor conferido', 'afirmar vigência de norma sem conferência', 'usar blog ou repositório não oficial como fonte'],
    dados_acessa: 'Base normativa interna, pesquisas, conhecimento curado.',
  },
  {
    agente: 'atendimento', nome: 'Agente de atendimento ao cliente (Cap. 10.7)',
    escopo: 'Recebe o contato inicial, coleta fatos sem antecipar parecer, classifica área e urgência e encaminha ao advogado.',
    pode_sozinho: ['registrar lead com o relato', 'classificar área e urgência', 'sinalizar suspeita de spam', 'agendar retorno'],
    exige_aprovacao: ['enviar proposta de honorários', 'qualquer mensagem com conteúdo jurídico', 'marcar lead como contratado'],
    proibido: ['emitir opinião jurídica', 'informar chance de êxito', 'prometer resultado ou prazo de decisão', 'aceitar caso'],
    dados_acessa: 'Leads, interações, agenda de atendimento.',
  },
  {
    agente: 'financeiro', nome: 'Agente financeiro e de cobrança (Cap. 10.8)',
    escopo: 'Acompanha faturamento, recebimento e inadimplência; prepara o lembrete de vencimento e a minuta de cobrança.',
    pode_sozinho: ['marcar fatura vencida como inadimplente', 'preparar o 1º lembrete de vencimento', 'consolidar prestação de contas'],
    exige_aprovacao: ['enviar cobrança do 2º aviso em diante', 'negociar prazo ou desconto', 'encaminhar caso à cobrança judicial'],
    proibido: ['movimentar dinheiro', 'emitir nota fiscal', 'alterar contrato de honorários', 'comunicar-se com o cliente sobre mérito'],
    dados_acessa: 'Faturas, honorários, apontamentos de hora, despesas.',
  },
  {
    agente: 'supervisor', nome: 'Agente supervisor / controladoria (Cap. 10.9 · 47.11)',
    escopo: 'Confere o trabalho dos outros de forma independente e registra o que está fora do padrão.',
    pode_sozinho: ['rodar as conferências diárias', 'registrar achados', 'alertar a coordenação'],
    exige_aprovacao: ['encerrar achado como resolvido', 'classificar achado como falso positivo'],
    proibido: ['corrigir sozinho o dado de outro módulo', 'apagar achado', 'validar prazo em nome de humano'],
    dados_acessa: 'Leitura de todos os módulos; escrita apenas em conferências e achados.',
  },
];

// ---- 7.8 "o que automatizar primeiro" → POPs iniciais (rascunho)
const POPS = [
  {
    codigo: 'POP-01', titulo: 'Tratamento de publicação e abertura de prazo', area: 'contencioso',
    objetivo: 'Garantir que toda publicação capturada resulte em prazo confirmado por humano, sem exceção (Cap. 19).',
    gatilho: 'Publicação nova capturada pela coleta ou recebida por e-mail/diário.',
    passos: [
      { ordem: 1, acao: 'Conferir a publicação no sistema OFICIAL do tribunal (não confiar só na captura)', responsavel: 'paralegal', evidencia: 'print/protocolo da consulta' },
      { ordem: 2, acao: 'Identificar processo, cliente e parte; corrigir vínculo se necessário', responsavel: 'paralegal', evidencia: 'vínculo no sistema' },
      { ordem: 3, acao: 'Classificar a providência necessária', responsavel: 'paralegal', evidencia: 'campo classificação' },
      { ordem: 4, acao: 'Calcular o prazo (dias úteis, feriados locais, prazo em dobro) e conferir o termo inicial', responsavel: 'advogado', evidencia: 'memória de cálculo' },
      { ordem: 5, acao: 'VALIDAR o prazo com nome e data; distribuir ao responsável', responsavel: 'advogado', evidencia: 'validado_por preenchido' },
      { ordem: 6, acao: 'Registrar ciência da publicação', responsavel: 'responsável designado', evidencia: 'confirmação de leitura' },
    ],
    checklist: [
      { item: 'Publicação conferida no sistema oficial do tribunal', obrigatorio: true },
      { item: 'Processo e cliente identificados corretamente', obrigatorio: true },
      { item: 'Termo inicial e contagem conferidos por advogado', obrigatorio: true },
      { item: 'Prazo validado com nome e data', obrigatorio: true },
      { item: 'Feriado local e suspensão de prazo verificados', obrigatorio: true },
      { item: 'Responsável designado e ciente', obrigatorio: false },
      { item: 'Cliente informado quando cabível', obrigatorio: false },
    ],
  },
  {
    codigo: 'POP-02', titulo: 'Uso de IA em peça, parecer ou minuta', area: 'consultivo',
    objetivo: 'Aplicar o protocolo antialucinação do Cap. 5.10 antes de qualquer entrega assistida por IA.',
    gatilho: 'Qualquer peça, parecer ou contrato produzido com apoio de IA.',
    passos: [
      { ordem: 0, acao: 'Conferir se o cliente já foi comunicado do uso de IA no caso (Recomendação CFOAB 001/2024); se não, formalizar antes de começar', responsavel: 'advogado responsável', evidencia: 'registro no dossiê do cliente' },
      { ordem: 1, acao: 'Anonimizar dados pessoais antes de submeter o material', responsavel: 'quem redige', evidencia: 'versão anonimizada' },
      { ordem: 2, acao: 'Separar fatos comprovados, alegados e controvertidos na matriz do caso', responsavel: 'quem redige', evidencia: 'matriz de fatos' },
      { ordem: 3, acao: 'Conferir cada norma citada (vigência e redação atual) na fonte oficial', responsavel: 'quem redige', evidencia: 'link oficial no registro' },
      { ordem: 4, acao: 'Conferir cada precedente no INTEIRO TEOR e registrar a conferência', responsavel: 'quem redige', evidencia: 'achado marcado como conferido' },
      { ordem: 5, acao: 'Revisão humana significativa por advogado diverso de quem redigiu', responsavel: 'revisor', evidencia: 'revisor no registro da peça' },
      { ordem: 6, acao: 'Aprovar e liberar; a minuta perde o carimbo MINUTA só nesta etapa', responsavel: 'advogado responsável', evidencia: 'aprovado_por' },
    ],
    checklist: [
      { item: 'Cliente comunicado do uso de IA no caso (Recomendação CFOAB 001/2024)', obrigatorio: true },
      { item: 'Dados pessoais anonimizados antes de qualquer submissão a IA', obrigatorio: true },
      { item: 'Todas as normas citadas conferidas na fonte oficial', obrigatorio: true },
      { item: 'Todos os precedentes conferidos no inteiro teor', obrigatorio: true },
      { item: 'Nenhuma afirmação de fato sem prova nos autos', obrigatorio: true },
      { item: 'Revisão por advogado diverso de quem redigiu', obrigatorio: false },
      { item: 'Pedidos conferidos um a um contra a fundamentação', obrigatorio: true },
    ],
  },
  {
    codigo: 'POP-03', titulo: 'Entrada de cliente: conflito, KYC e abertura do caso', area: 'consultivo',
    objetivo: 'Impedir abertura de caso sem conflito pesquisado, identificação conferida e escopo escrito (Cap. 17).',
    gatilho: 'Lead qualificado que pretende contratar.',
    passos: [
      { ordem: 1, acao: 'Pesquisar conflito de interesses (cliente, partes relacionadas, leads)', responsavel: 'atendimento', evidencia: 'registro do veredito' },
      { ordem: 2, acao: 'Decidir o veredito do conflito (livre/atenção/impedido)', responsavel: 'advogado', evidencia: 'decidido_por' },
      { ordem: 3, acao: 'Conferir documento de identificação e poderes de representação', responsavel: 'atendimento', evidencia: 'KYC preenchido' },
      { ordem: 4, acao: 'Escrever o escopo — e o que NÃO está incluído', responsavel: 'advogado', evidencia: 'proposta' },
      { ordem: 5, acao: 'Aprovar e enviar a proposta de honorários', responsavel: 'sócio', evidencia: 'aprovada_por' },
      { ordem: 6, acao: 'Assinar procuração e contrato; abrir o caso no sistema', responsavel: 'atendimento', evidencia: 'caso vinculado ao lead' },
    ],
    checklist: [
      { item: 'Conflito de interesses pesquisado e veredito registrado', obrigatorio: true },
      { item: 'Identificação e poderes de representação conferidos', obrigatorio: true },
      { item: 'Escopo e exclusões por escrito', obrigatorio: true },
      { item: 'Proposta aprovada antes do envio', obrigatorio: true },
      { item: 'Procuração assinada e arquivada', obrigatorio: true },
      { item: 'Aviso de privacidade entregue ao cliente', obrigatorio: false },
    ],
  },
];

// ---- 35.11 tabela de temporalidade (modelo a validar com o escritório)
// ATENÇÃO (conferido em 30/07/2026): a OAB NÃO fixa prazo de guarda de documentos do
// cliente. O que existe é o DEVER DE DEVOLUÇÃO e de prestação de contas ao fim da causa
// (art. 12 do CED — Res. CFOAB 02/2015) e a vedação de retenção abusiva de autos
// (art. 34, XXII, da Lei 8.906/94). Por isso os prazos abaixo são ÂNCORAS PRÁTICAS,
// deduzidas da prescrição aplicável — cada escritório precisa validá-los.
const TEMPORALIDADE = [
  { tipo_documental: 'Autos digitalizados de processo encerrado', prazo_guarda: '5 anos após o trânsito em julgado', contagem_desde: 'trânsito em julgado', destinacao: 'eliminacao', base_legal: 'Âncora prática (sem prazo normativo próprio da OAB): risco de ação de reparação/prestação de contas — validar com o responsável' },
  { tipo_documental: 'Procuração, contrato de honorários e prestação de contas', prazo_guarda: '10 anos após o encerramento', contagem_desde: 'encerramento do caso', destinacao: 'guarda_permanente', base_legal: 'Prescrição decenal do art. 205 do Código Civil (prestação de contas ao cliente — art. 12 do CED)' },
  { tipo_documental: 'Documentos ORIGINAIS entregues pelo cliente', prazo_guarda: 'Devolver ao encerramento, com recibo', contagem_desde: 'conclusão ou desistência da causa', destinacao: 'devolucao_cliente', base_legal: 'Art. 12 do CED (Res. CFOAB 02/2015): a conclusão ou desistência obriga a devolver bens, valores e documentos confiados e a prestar contas pormenorizadas' },
  { tipo_documental: 'Autos recebidos com vista ou em confiança', prazo_guarda: 'Devolver no prazo do juízo', contagem_desde: 'carga dos autos', destinacao: 'devolucao_cliente', base_legal: 'Art. 34, XXII, da Lei 8.906/94: retenção abusiva ou extravio é infração disciplinar' },
  { tipo_documental: 'Comprovantes fiscais e financeiros do escritório', prazo_guarda: '5 anos', contagem_desde: 'exercício fiscal seguinte ao do lançamento', destinacao: 'eliminacao', base_legal: 'Arts. 173 e 174 do CTN (decadência e prescrição tributárias)' },
  { tipo_documental: 'Comunicações com o cliente (portal, e-mail, WhatsApp)', prazo_guarda: '5 anos após o encerramento', contagem_desde: 'encerramento do caso', destinacao: 'eliminacao', base_legal: 'Âncora prática: prova de diligência e de orientação prestada — validar' },
  { tipo_documental: 'Dados pessoais sem finalidade remanescente', prazo_guarda: 'Eliminar quando cessar a finalidade', contagem_desde: 'fim da finalidade do tratamento', destinacao: 'eliminacao', base_legal: 'Arts. 15 e 16 da LGPD (término do tratamento e eliminação), ressalvada a guarda para exercício de direitos' },
];

// ---- 29.3 biblioteca de cláusulas em três níveis (exemplos para partir de algo)
const CLAUSULAS = [
  {
    tema: 'Limitação de responsabilidade', nivel: 'preferencial', risco: 'baixo',
    texto: 'A responsabilidade das partes por perdas e danos, comprovadamente decorrentes de descumprimento deste contrato, limita-se ao valor efetivamente pago nos 12 (doze) meses anteriores ao evento, excluídos lucros cessantes e danos indiretos.',
    justificativa: 'Teto previsível, simétrico e vinculado à contraprestação.',
    fallback: 'Ampliar o teto para 24 meses mantendo a exclusão de danos indiretos.',
  },
  {
    tema: 'Limitação de responsabilidade', nivel: 'aceitavel', risco: 'medio',
    texto: 'A responsabilidade limita-se ao valor total do contrato, excluídos lucros cessantes.',
    justificativa: 'Teto maior, mas ainda determinado e simétrico.',
    fallback: 'Exigir reciprocidade expressa e exclusão de danos indiretos.',
  },
  {
    tema: 'Limitação de responsabilidade', nivel: 'inaceitavel', risco: 'alto',
    texto: 'Responsabilidade ilimitada de uma das partes, ou renúncia unilateral a qualquer indenização.',
    justificativa: 'Assimetria sem contrapartida econômica; expõe o cliente a risco indeterminado e pode ser abusiva.',
    fallback: 'Recusar. Se houver pressão comercial, propor teto alto com seguro contratado.',
  },
  {
    tema: 'Foro e solução de conflitos', nivel: 'preferencial', risco: 'baixo',
    texto: 'Fica eleito o foro da comarca de [CIDADE/UF] para dirimir controvérsias, com tentativa prévia de composição amigável em 30 (trinta) dias.',
    justificativa: 'Foro conhecido, com janela de composição que reduz custo.',
    fallback: 'Arbitragem em câmara nacional, com sede na mesma comarca.',
  },
  {
    tema: 'Foro e solução de conflitos', nivel: 'inaceitavel', risco: 'alto',
    texto: 'Foro ou arbitragem no exterior, em idioma estrangeiro, com custos integralmente suportados pelo cliente.',
    justificativa: 'Inviabiliza economicamente o acesso à jurisdição; risco de ineficácia prática do contrato.',
    fallback: 'Recusar.',
  },
  {
    tema: 'Proteção de dados (LGPD)', nivel: 'preferencial', risco: 'baixo',
    texto: 'As partes tratarão dados pessoais apenas para as finalidades deste contrato, adotarão medidas técnicas e administrativas adequadas, comunicarão incidente de segurança em até 24 (vinte e quatro) horas e eliminarão os dados ao término, salvo obrigação legal de guarda.',
    justificativa: 'Cobre finalidade, segurança, incidente e descarte — o mínimo do Cap. 42.6.',
    fallback: 'Ampliar o prazo de comunicação de incidente para 48h, mantendo o restante.',
  },
  {
    tema: 'Proteção de dados (LGPD)', nivel: 'inaceitavel', risco: 'alto',
    texto: 'Autorização genérica para uso de dados pessoais em finalidades não especificadas, inclusive treinamento de modelos, sem possibilidade de oposição.',
    justificativa: 'Finalidade indeterminada viola o art. 6º da LGPD e o dever de sigilo profissional.',
    fallback: 'Recusar; se houver uso em IA, exigir anonimização e finalidade descrita.',
  },
  {
    tema: 'Rescisão e denúncia', nivel: 'preferencial', risco: 'baixo',
    texto: 'Qualquer das partes poderá denunciar o contrato mediante aviso escrito com 30 (trinta) dias de antecedência, sem multa, respondendo apenas pelas obrigações já vencidas.',
    justificativa: 'Saída previsível e simétrica; evita renovação automática indesejada.',
    fallback: 'Aviso de 60 dias, mantendo a ausência de multa.',
  },
];

// ---- 44.9 planos de continuidade (cenários que o livro trata como certos)
const CONTINUIDADE = [
  {
    cenario: 'Fonte de publicações (diário/DJEN) indisponível ou bloqueando acesso',
    impacto: 'Risco de perda de prazo por intimação não capturada.',
    rto: 'Mesmo dia',
    procedimento: 'Conferir manualmente o diário/portal do tribunal para as OABs cadastradas; registrar a conferência manual; abrir achado na controladoria e monitorar até a fonte voltar.',
    alternativa: 'Consulta processo a processo nos sistemas dos tribunais em que há caso ativo.',
  },
  {
    cenario: 'Sistema de gestão indisponível',
    impacto: 'Equipe sem acesso a prazos, documentos e agenda.',
    rto: '4 horas',
    procedimento: 'Acionar o responsável técnico; usar a última exportação de prazos e a agenda espelhada; registrar manualmente o que for feito e reconciliar depois.',
    alternativa: 'Planilha de prazos críticos dos próximos 15 dias, mantida atualizada por exportação semanal.',
  },
  {
    cenario: 'Incidente de segurança com dados de cliente',
    impacto: 'Sigilo profissional e obrigações da LGPD.',
    rto: 'Imediato',
    procedimento: 'Conter o acesso; registrar o incidente no módulo; avaliar risco aos titulares; comunicar ANPD e titulares quando houver risco relevante; registrar as medidas.',
    alternativa: 'Acionar o encarregado/DPO e, se necessário, apoio externo de resposta a incidente.',
  },
];

// ---- 33.9 base normativa interna: as normas que sustentam as minutas acima.
// TODAS conferidas na fonte OFICIAL em 30/07/2026 — a data entra em `conferida_em`
// para que a regra do Cap. 33.4 (conferência datada e nominal) já nasça cumprida.
const DATA_CONFERENCIA = '2026-07-30';
const NORMAS = [
  {
    tipo: 'lei', identificacao: 'Lei 8.906/1994 — Estatuto da Advocacia e da OAB (EAOAB)', ambito: 'federal', area: 'etica-profissional',
    ementa: 'Estatuto da Advocacia e da Ordem dos Advogados do Brasil.',
    artigos_chave: 'Art. 7º (direitos do advogado) · art. 34, VII (violação de sigilo é infração) · art. 34, XXI (recusa de prestar contas) · art. 34, XXII (retenção abusiva ou extravio de autos)',
    fonte_url: 'https://www.planalto.gov.br/ccivil_03/leis/l8906.htm',
  },
  {
    tipo: 'resolucao', identificacao: 'Código de Ética e Disciplina da OAB (Res. CFOAB 02/2015)', ambito: 'federal', area: 'etica-profissional',
    ementa: 'Código de Ética e Disciplina da Ordem dos Advogados do Brasil.',
    artigos_chave: 'Art. 12 (conclusão/desistência obriga a devolver bens, valores e documentos e a prestar contas pormenorizadas) · art. 35 e ss. (sigilo profissional) · arts. 39-47 (publicidade)',
    fonte_url: 'https://www.oab.org.br/arquivos/pdf/legislacaoOab/codigodeetica.pdf',
  },
  {
    tipo: 'provimento', identificacao: 'Provimento CFOAB nº 205/2021 — publicidade e informação na advocacia', ambito: 'federal', area: 'marketing-juridico',
    ementa: 'Disciplina a publicidade e a informação da advocacia. Revogou o Provimento 94/2000 (art. 12).',
    artigos_chave: 'Art. 3º, I (veda valores de honorários, forma de pagamento, gratuidade e descontos) · art. 3º, IV (veda expressões persuasivas) · art. 4º, §2º (veda menção a decisões e resultados) · art. 4º, §5º (impulsionamento fraudulento) · art. 5º, §1º (veda pagar por rankings/prêmios) · art. 6º e parágrafo único (veda promessa de resultado e uso de casos concretos)',
    fonte_url: 'https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021',
  },
  {
    tipo: 'outro', identificacao: 'Recomendação CFOAB nº 001/2024 — uso de IA generativa na advocacia', ambito: 'federal', area: 'inteligencia-artificial',
    ementa: 'Recomendações do Conselho Federal da OAB para o uso de inteligência artificial generativa na prática jurídica (assinada em 11/11/2024). Quatro pilares: legislação aplicável, confidencialidade e privacidade, prática jurídica ética e comunicação sobre o uso de IA generativa. NÃO é provimento: é recomendação — a OAB ainda não editou provimento sobre IA.',
    artigos_chave: 'Comunicação prévia ao cliente sobre o uso de IA (finalidade, benefícios, limitações, riscos e medidas de segurança) · proteção dos dados do cliente contra compartilhamento indevido com plataformas · responsabilidade do advogado pela análise crítica do conteúdo gerado',
    fonte_url: 'https://www.oab.org.br/noticia/62711/confira-versao-final-da-recomendacao-do-cfoab-sobre-o-uso-de-ia-na-pratica-juridica',
  },
  {
    tipo: 'resolucao', identificacao: 'Resolução CNJ nº 615/2025 — Política de Uso de IA no Poder Judiciário', ambito: 'federal', area: 'inteligencia-artificial',
    ementa: 'Estabelece diretrizes para desenvolvimento, governança, auditoria, monitoramento e uso responsável de IA no Poder Judiciário. Publicada em 14/03/2025, vigente desde 14/07/2025 (120 dias). REVOGOU a Resolução CNJ 332/2020. Alterada pela Resolução CNJ nº 674/2026 (art. 15 — composição do Comitê Nacional de IA do Judiciário; sem mudança nos deveres substantivos).',
    artigos_chave: 'Supervisão humana obrigatória · transparência sobre o uso de IA · classificação de risco das soluções · art. 15 (CNIAJ, redação da Res. 674/2026)',
    fonte_url: 'https://atos.cnj.jus.br/atos/detalhar/6001',
  },
  {
    tipo: 'lei', identificacao: 'Lei 13.709/2018 — LGPD', ambito: 'federal', area: 'protecao-de-dados',
    ementa: 'Lei Geral de Proteção de Dados Pessoais.',
    artigos_chave: 'Art. 7º, II e VI (obrigação legal; exercício regular de direitos em processo) · art. 11 (dados sensíveis) · arts. 15-16 (término do tratamento e eliminação) · art. 19, II (resposta ao titular em até 15 dias) · art. 48 (comunicação de incidente à ANPD e aos titulares)',
    fonte_url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm',
  },
  {
    tipo: 'lei', identificacao: 'Lei 13.105/2015 — Código de Processo Civil', ambito: 'federal', area: 'processual-civil',
    ementa: 'Código de Processo Civil.',
    artigos_chave: 'Art. 219 (contagem em dias úteis) · art. 224 (exclusão do dia do início) · art. 220 (suspensão de 20/12 a 20/01)',
    fonte_url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm',
  },
  {
    tipo: 'lei', identificacao: 'Lei 10.406/2002 — Código Civil', ambito: 'federal', area: 'civel',
    ementa: 'Código Civil.',
    artigos_chave: 'Art. 205 (prescrição decenal — âncora da guarda de contratos e prestação de contas)',
    fonte_url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm',
  },
  {
    tipo: 'lei', identificacao: 'Lei 5.172/1966 — Código Tributário Nacional', ambito: 'federal', area: 'tributario',
    ementa: 'Código Tributário Nacional.',
    artigos_chave: 'Arts. 173 e 174 (decadência e prescrição — âncora da guarda de documentos fiscais por 5 anos)',
    fonte_url: 'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm',
  },
];

// =====================================================================
function semearLivro() {
  const agora = nowISO();

  // base normativa conferida (33.9 + 33.4): entra já com a data da conferência
  const insNorma = db.prepare(`INSERT INTO norms (id, tipo, identificacao, ambito, area, ementa, artigos_chave,
    vigente, vigencia_desde, revogada_por, fonte_url, conferida_em, conferida_por, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,?,?,1,'','',?,?,?,?,?)`);
  for (const n of NORMAS) {
    if (jaTem('norms', 'identificacao', n.identificacao)) continue;
    insNorma.run(novoId(), n.tipo, n.identificacao, n.ambito, n.area, n.ementa, n.artigos_chave,
      n.fonte_url, DATA_CONFERENCIA, 'conferência de implantação (fonte oficial)', agora, agora);
  }

  // políticas (rascunho — quem aprova é humano)
  const insPol = db.prepare(`INSERT INTO policies (id, tipo, titulo, texto, versao, vigente_desde, aprovado_por,
    exige_ciencia, status, revisar_em, criado_em, atualizado_em) VALUES (?,?,?,?,1,'','',1,'rascunho','',?,?)`);
  for (const [tipo, titulo, texto] of [
    ['politica_ia', 'Política institucional de uso de IA (MINUTA)', POLITICA_IA],
    ['privacidade', 'Política de privacidade e proteção de dados (MINUTA)', POLITICA_PRIVACIDADE],
  ]) {
    if (!jaTem('policies', 'titulo', titulo)) insPol.run(novoId(), tipo, titulo, texto, agora, agora);
  }

  // cartas de autonomia dos agentes (10.10)
  const insCarta = db.prepare(`INSERT INTO agent_charters (id, agente, nome, escopo, pode_sozinho, exige_aprovacao,
    proibido, dados_acessa, responsavel, ativo, ultima_revisao, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,'',1,?,?,?)`);
  for (const c of CARTAS) {
    if (jaTem('agent_charters', 'agente', c.agente)) continue;
    insCarta.run(novoId(), c.agente, c.nome, c.escopo, j.str(c.pode_sozinho), j.str(c.exige_aprovacao),
      j.str(c.proibido), c.dados_acessa, agora.slice(0, 10), agora, agora);
  }

  // POPs (rascunho — publicar é ato humano)
  const insPop = db.prepare(`INSERT INTO pops (id, codigo, titulo, area, objetivo, gatilho, responsavel, passos,
    checklist, versao, vigente_desde, aprovado_por, status, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,?,'',?,?,1,'','','rascunho',?,?)`);
  for (const p of POPS) {
    if (jaTem('pops', 'codigo', p.codigo)) continue;
    insPop.run(novoId(), p.codigo, p.titulo, p.area, p.objetivo, p.gatilho, j.str(p.passos), j.str(p.checklist), agora, agora);
  }

  // tabela de temporalidade
  const insTemp = db.prepare(`INSERT INTO retention_schedule (id, tipo_documental, prazo_guarda, contagem_desde,
    destinacao, base_legal, observacao, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,'',?,?)`);
  for (const t of TEMPORALIDADE) {
    if (jaTem('retention_schedule', 'tipo_documental', t.tipo_documental)) continue;
    insTemp.run(novoId(), t.tipo_documental, t.prazo_guarda, t.contagem_desde, t.destinacao, t.base_legal, agora, agora);
  }

  // biblioteca de cláusulas em três níveis
  const insCl = db.prepare(`INSERT INTO clause_library (id, area, tema, nivel, texto, justificativa, risco,
    fallback, criado_por, criado_em, atualizado_em) VALUES (?,'',?,?,?,?,?,?,'seed',?,?)`);
  for (const c of CLAUSULAS) {
    const existe = db.prepare('SELECT 1 FROM clause_library WHERE tema = ? AND nivel = ?').get(c.tema, c.nivel);
    if (existe) continue;
    insCl.run(novoId(), c.tema, c.nivel, c.texto, c.justificativa, c.risco, c.fallback || '', agora, agora);
  }

  // planos de continuidade
  const insCont = db.prepare(`INSERT INTO continuity_plans (id, cenario, impacto, rto, procedimento, alternativa,
    responsavel, ultimo_teste, resultado_teste, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,'','','',?,?)`);
  for (const p of CONTINUIDADE) {
    if (jaTem('continuity_plans', 'cenario', p.cenario)) continue;
    insCont.run(novoId(), p.cenario, p.impacto, p.rto, p.procedimento, p.alternativa, agora, agora);
  }
}

module.exports = { semearLivro, POLITICA_IA, CARTAS, POPS, TEMPORALIDADE, CLAUSULAS, CONTINUIDADE, NORMAS, DATA_CONFERENCIA };
