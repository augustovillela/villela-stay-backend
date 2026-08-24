// =====================================================================
// FONTE ÚNICA da landing /sistemas.html — "Sistemas do Grupo Villela Stay"
// =====================================================================
// Esta é a página que vende os SaaS do grupo para quem procura um sistema.
// Ela NÃO repete a home: a home apresenta a marca, aqui a pessoa decide.
//
// REGRA DA CASA — SaaS novo entra em DOIS lugares:
//   1. `PRODUTOS_GRUPO` em build.js   → card na home
//   2. `SISTEMAS` aqui                → bloco completo nesta landing
// O build CONFERE isso sozinho (ver `conferirCobertura` no fim do arquivo) e
// QUEBRA se um produto da home não estiver classificado aqui. Não é lembrete
// de documentação: é trava. Produto que não é SaaS de assinatura entra em
// `NAO_SAAS` com o motivo escrito — a exclusão fica explícita, não esquecida.
//
// Cada texto é uma tupla [pt, en, es] consumida com t(...) dentro do laço de
// idiomas do build. Faltando tradução, `t` cai no português (mesmo padrão do
// resto do site) — mas AQUI isso é dívida visível, não solução: a página é
// indexada em três idiomas.
//
// Preços: copiados dos seeds reais de cada produto (repo.js → preco_centavos)
// em 15/08/2026. Ao mexer em preço no produto, mexa aqui — a página cita valor.
// =====================================================================
'use strict';

// Açúcar sintático: T('pt','en','es') → ['pt','en','es']. Deixa o bloco de cada
// sistema legível como texto corrido em vez de uma parede de colchetes.
const T = (pt, en, es) => [pt, en, es];

// ---------------------------------------------------------------------
// Os SaaS. A ordem é a ordem de exibição na página — mais vendável primeiro.
// ---------------------------------------------------------------------
const SISTEMAS = [
  // ------------------------------------------------------------- CRM
  {
    id: 'crm',
    nome: 'Villela CRM',
    pasta: 'villela-crm',
    vertical: 'crm',              // acento do design system .vx (villela-ui.css)
    cor: '#B0185A',
    url: 'https://crm.villelastay.com.br/crm',
    urlTeste: 'https://crm.villelastay.com.br/crm/assinar?plano=trial',
    tela: 'crm',
    demo: T(
      'Um negócio de R$ 24.800 é arrastado de “Proposta” para “Ganho” — e o total do mês, a fila de hoje e a tarefa de pós-venda se atualizam sozinhos.',
      'A R$24,800 deal is dragged from “Proposal” to “Won” — and the month’s total, today’s queue and the after-sales task update by themselves.',
      'Un negocio de R$ 24.800 se arrastra de “Propuesta” a “Ganado” — y el total del mes, la fila de hoy y la tarea de posventa se actualizan solos.'),                  // qual maquete renderizar (sistemas-telas.js)
    destaque: true,               // ganha a demonstração animada do topo
    categoria: T('CRM e vendas', 'CRM & sales', 'CRM y ventas'),
    // Frase de posicionamento — é o <h3> do bloco e o texto do card do índice.
    promessa: T(
      'Pare de perder lead. Comece a fechar mais.',
      'Stop losing leads. Start closing more.',
      'Deja de perder leads. Empieza a cerrar más.'
    ),
    dor: T(
      'O lead chega no WhatsApp, some numa conversa antiga e ninguém sabe se alguém respondeu. No fim do mês a conta não fecha e ninguém consegue dizer por quê.',
      'The lead arrives on WhatsApp, disappears into an old thread and nobody knows whether anyone replied. At month end the numbers do not add up and nobody can say why.',
      'El lead llega por WhatsApp, se pierde en una conversación vieja y nadie sabe si alguien respondió. A fin de mes las cuentas no cierran y nadie sabe por qué.'
    ),
    virada: T(
      'Todo contato entra com origem, campanha e UTM gravados. A caixa "precisa de ação hoje" diz exatamente quem atender, e o follow-up se cobra sozinho.',
      'Every contact arrives with source, campaign and UTM recorded. The "needs action today" box tells you exactly who to call, and the follow-up chases itself.',
      'Cada contacto entra con origen, campaña y UTM registrados. La bandeja "necesita acción hoy" dice a quién atender, y el seguimiento se cobra solo.'
    ),
    // Por que vale a pena — o argumento econômico, não a lista de recursos.
    porque: T(
      'Um lead perdido custa o ticket inteiro. Se o sistema recuperar <b>uma</b> venda por mês, ele se paga muitas vezes.',
      'A lost lead costs the whole ticket. If the system recovers <b>one</b> sale a month, it pays for itself many times over.',
      'Un lead perdido cuesta el ticket entero. Si el sistema recupera <b>una</b> venta al mes, se paga muchas veces.'
    ),
    recursos: [
      ['🎯', T('Nenhum lead esquecido', 'No forgotten leads', 'Ningún lead olvidado'),
        T('Origem, campanha e UTM gravados na entrada. A caixa "precisa de ação hoje" mostra quem atender agora.',
          'Source, campaign and UTM recorded on arrival. The "needs action today" box shows who to contact now.',
          'Origen, campaña y UTM registrados al entrar. La bandeja "necesita acción hoy" muestra a quién atender.')],
      ['📋', T('Kanban de verdade', 'A real Kanban', 'Un Kanban de verdad'),
        T('Funis configuráveis por vertical, arrastar-e-soltar, valor por etapa e alerta de negócio parado.',
          'Pipelines configurable per vertical, drag and drop, value per stage and stalled-deal alerts.',
          'Embudos configurables por vertical, arrastrar y soltar, valor por etapa y alerta de negocio parado.')],
      ['🔥', T('Lead scoring automático', 'Automatic lead scoring', 'Lead scoring automático'),
        T('Nota de 0 a 100 pelo comportamento: respondeu, abriu a proposta, veio de indicação. Atenda o quente primeiro.',
          'A 0–100 score from behaviour: replied, opened the proposal, came from a referral. Work the hot ones first.',
          'Nota de 0 a 100 por comportamiento: respondió, abrió la propuesta, vino por referencia. Atiende primero al caliente.')],
      ['📨', T('Multicanal sem fricção', 'Frictionless multichannel', 'Multicanal sin fricción'),
        T('WhatsApp, e-mail e ligação a um clique da ficha, com modelos e variáveis. Tudo registrado na linha do tempo.',
          'WhatsApp, email and calls one click from the record, with templates and variables. All logged on the timeline.',
          'WhatsApp, correo y llamada a un clic de la ficha, con plantillas y variables. Todo registrado en la línea de tiempo.')],
      ['📄', T('Proposta com link rastreável', 'Proposals with a tracked link', 'Propuesta con enlace rastreable'),
        T('Você sabe a hora em que o cliente abriu. Ele aceita ou recusa pelo próprio link, e o funil anda sozinho.',
          'You know the moment the client opened it. They accept or decline right there, and the pipeline moves itself.',
          'Sabes a qué hora el cliente la abrió. Acepta o rechaza en el propio enlace y el embudo avanza solo.')],
      ['🤖', T('Agentes de IA com você no controle', 'AI agents, with you in control', 'Agentes de IA contigo al mando'),
        T('Qualificação, follow-up, reativação e análise de perdas — sempre como sugestão para você aprovar, nunca no automático cego.',
          'Qualification, follow-up, win-back and loss analysis — always as a suggestion for you to approve, never blind automation.',
          'Cualificación, seguimiento, reactivación y análisis de pérdidas — siempre como sugerencia para aprobar, nunca automático a ciegas.')]
    ],
    paraQuem: [
      T('Times comerciais', 'Sales teams', 'Equipos comerciales'),
      T('Prestadores de serviço', 'Service businesses', 'Prestadores de servicios'),
      T('Agências e consultorias', 'Agencies and consultancies', 'Agencias y consultoras'),
      T('Quem vende por WhatsApp', 'Anyone selling on WhatsApp', 'Quien vende por WhatsApp')
    ],
    prova: T(
      'É o CRM que atende os leads de hospedagem e de eventos do próprio grupo, todos os dias.',
      'It is the CRM handling the group’s own accommodation and event leads, every single day.',
      'Es el CRM que atiende los leads de alojamiento y eventos del propio grupo, todos los días.'
    ),
    preco: { valor: 79, modelo: 'assinatura' },
    faq: [
      [T('O Villela CRM importa meus contatos atuais?', 'Does Villela CRM import my current contacts?', '¿Villela CRM importa mis contactos actuales?'),
       T('Sim. Você sobe uma planilha de contatos e escolhe qual coluna é nome, telefone, e-mail e origem. Os 14 dias de teste servem justamente para migrar sem pressa.',
         'Yes. You upload a contact spreadsheet and map which column is name, phone, email and source. The 14-day trial exists precisely so you can migrate without rushing.',
         'Sí. Subes una hoja de contactos y eliges qué columna es nombre, teléfono, correo y origen. Los 14 días de prueba existen justamente para migrar sin prisa.')],
      [T('Qual a diferença entre o Villela CRM e o Villela Growth OS?', 'What is the difference between Villela CRM and Villela Growth OS?', '¿Cuál es la diferencia entre Villela CRM y Villela Growth OS?'),
       T('O Growth OS é a evolução do CRM, no mesmo sistema e no mesmo login: o CRM cuida do lead até a venda; o Growth OS acrescenta a camada de receita — organizações, metas, previsão e os números que o dono olha.',
         'Growth OS is the CRM’s evolution, in the same system and the same login: the CRM handles the lead up to the sale; Growth OS adds the revenue layer — organisations, targets, forecast and the numbers the owner looks at.',
         'Growth OS es la evolución del CRM, en el mismo sistema y el mismo acceso: el CRM cuida del lead hasta la venta; Growth OS añade la capa de ingresos — organizaciones, metas, previsión y los números que mira el dueño.')]
    ]
  },

  // ----------------------------------------------------- Stay Manager
  {
    id: 'manager',
    nome: 'Villela Stay Manager',
    pasta: 'villela-stay-manager',
    vertical: 'manager',
    cor: '#0E7490',
    url: 'https://manager.villelastay.com.br/gestao',
    urlTeste: 'https://manager.villelastay.com.br/gestao/assinar?plano=trial',
    tela: 'manager',
    demo: T(
      'Uma reserva direta entra no calendário e a ocupação sobe — na mesma régua do Airbnb e do Booking, sem conflito.',
      'A direct booking lands on the calendar and occupancy rises — on the same track as Airbnb and Booking, with no clash.',
      'Una reserva directa entra en el calendario y la ocupación sube — en la misma regla que Airbnb y Booking, sin conflicto.'),
    categoria: T('Gestão de hospedagem', 'Hospitality management', 'Gestión de alojamiento'),
    promessa: T(
      'Toda a sua operação de temporada em um só lugar.',
      'Your entire short-stay operation in one place.',
      'Toda tu operación de temporada en un solo lugar.'
    ),
    dor: T(
      'Calendário do Airbnb numa aba, Booking noutra, a faxineira no WhatsApp e o financeiro numa planilha que só você entende. Um overbooking apaga o lucro do mês.',
      'The Airbnb calendar in one tab, Booking in another, the cleaner on WhatsApp and the finances in a spreadsheet only you understand. One overbooking wipes out the month’s profit.',
      'El calendario de Airbnb en una pestaña, Booking en otra, la limpiadora en WhatsApp y las finanzas en una hoja que solo tú entiendes. Un overbooking borra la ganancia del mes.'
    ),
    virada: T(
      'Um calendário só, alimentado por todos os canais, com bloqueio anti-overbooking. A faxina nasce sozinha do check-out, e o repasse do proprietário sai pronto.',
      'A single calendar fed by every channel, with anti-overbooking locks. Cleaning schedules itself from the check-out, and the owner payout comes out ready.',
      'Un solo calendario alimentado por todos los canales, con bloqueo anti-overbooking. La limpieza nace sola del check-out y la liquidación del propietario sale lista.'
    ),
    porque: T(
      'Um único overbooking evitado costuma custar mais caro que um ano de mensalidade. E a hora que você deixa de gastar copiando data entre abas volta como reserva.',
      'A single avoided overbooking usually costs more than a year of subscription. And the hours you stop spending copying dates between tabs come back as bookings.',
      'Un solo overbooking evitado suele costar más que un año de suscripción. Y las horas que dejas de gastar copiando fechas vuelven como reservas.'
    ),
    recursos: [
      ['📅', T('Calendário unificado', 'Unified calendar', 'Calendario unificado'),
        T('Reservas de todas as OTAs e diretas em uma tela, com regras de bloqueio testadas em casas interligadas.',
          'Bookings from every OTA and direct channel on one screen, with blocking rules tested on interconnected houses.',
          'Reservas de todas las OTAs y directas en una pantalla, con reglas de bloqueo probadas en casas interconectadas.')],
      ['🔗', T('Canais e OTAs', 'Channels and OTAs', 'Canales y OTAs'),
        T('Airbnb, Booking, Vrbo, Decolar e reserva direta sincronizando disponibilidade e preço a partir de um cadastro só.',
          'Airbnb, Booking, Vrbo, Decolar and direct bookings syncing availability and pricing from a single record.',
          'Airbnb, Booking, Vrbo, Decolar y reserva directa sincronizando disponibilidad y precio desde un solo registro.')],
      ['🧹', T('Limpeza que se agenda sozinha', 'Cleaning that schedules itself', 'Limpieza que se agenda sola'),
        T('A agenda da equipe nasce dos check-ins e check-outs, com checklist padrão hotel boutique e confirmação de cada unidade.',
          'The team’s schedule is generated from check-ins and check-outs, with a boutique-hotel checklist and per-unit confirmation.',
          'La agenda del equipo nace de los check-ins y check-outs, con checklist estilo hotel boutique y confirmación por unidad.')],
      ['💰', T('Financeiro e repasse', 'Finance and owner payouts', 'Finanzas y liquidaciones'),
        T('Receita por competência, despesas, comissão de canal e prestação de contas do proprietário — sem refazer planilha.',
          'Accrual revenue, expenses, channel commission and owner statements — no spreadsheet rework.',
          'Ingresos por devengo, gastos, comisión de canal y rendición de cuentas al propietario — sin rehacer hojas.')],
      ['☑️', T('Checklist por reserva e estoque', 'Per-booking checklist and stock', 'Checklist por reserva y stock'),
        T('Cada reserva carrega as etapas da jornada e o sistema lembra o que falta. Estoque com baixa automática e lista de compras.',
          'Every booking carries its journey steps and the system remembers what is missing. Stock deducted automatically, with a shopping list.',
          'Cada reserva lleva las etapas de su recorrido y el sistema recuerda lo que falta. Stock con baja automática y lista de compras.')],
      ['🤖', T('IA, API e webhooks', 'AI, API and webhooks', 'IA, API y webhooks'),
        T('Assistente que responde hóspede e sugere preço, mais API com token e webhooks para plugar seus próprios scripts.',
          'An assistant that answers guests and suggests pricing, plus a token API and webhooks to plug in your own scripts.',
          'Asistente que responde al huésped y sugiere precio, más API con token y webhooks para conectar tus scripts.')]
    ],
    paraQuem: [
      T('Anfitriões independentes', 'Independent hosts', 'Anfitriones independientes'),
      T('Gestores de temporada', 'Short-stay managers', 'Gestores de temporada'),
      T('Pousadas e flats', 'Guesthouses and flats', 'Posadas y flats'),
      T('Quem administra imóvel de terceiro', 'Anyone managing third-party property', 'Quien administra inmueble de terceros')
    ],
    prova: T(
      'As 4 casas e os 20 anúncios da Villela Stay no Lago Sul rodam neste mesmo sistema — inclusive as casas interligadas, onde um furo de calendário custa caro.',
      'Villela Stay’s 4 houses and 20 listings in Lago Sul run on this very system — including the interconnected houses, where a calendar slip is expensive.',
      'Las 4 casas y los 20 anuncios de Villela Stay en Lago Sul funcionan en este mismo sistema — incluidas las casas interconectadas, donde un fallo de calendario sale caro.'
    ),
    preco: { valor: 129, modelo: 'assinatura' },
    faq: [
      [T('O Stay Manager substitui o Airbnb e o Booking?', 'Does Stay Manager replace Airbnb and Booking?', '¿Stay Manager sustituye a Airbnb y Booking?'),
       T('Não — ele organiza os dois. Você continua vendendo nos canais, e o sistema reúne reservas, calendário e financeiro em um lugar só, evitando overbooking entre eles.',
         'No — it organises them. You keep selling on the channels, and the system brings bookings, calendar and finances into one place, preventing overbooking between them.',
         'No — los organiza. Sigues vendiendo en los canales, y el sistema reúne reservas, calendario y finanzas en un solo lugar, evitando overbooking entre ellos.')],
      [T('Serve para quem tem só um ou dois imóveis?', 'Does it work for someone with just one or two properties?', '¿Sirve para quien tiene solo uno o dos inmuebles?'),
       T('Serve. O plano de entrada foi dimensionado para o anfitrião independente — a ideia é justamente dar a máquina de gestão dos grandes operadores a quem não tem consultor nem implantação cara.',
         'It does. The entry plan is sized for the independent host — the whole point is giving the big operators’ management machine to someone with no consultant and no expensive onboarding.',
         'Sí. El plan de entrada está dimensionado para el anfitrión independiente — la idea es dar la máquina de gestión de los grandes operadores a quien no tiene consultor ni implantación cara.')]
    ]
  },

  // ----------------------------------------------------------- Legal
  {
    id: 'legal',
    nome: 'Villela Legal',
    pasta: 'villela-legal',
    vertical: 'legal',
    cor: '#14532D',
    url: 'https://juridico.villelastay.com.br/juridico',
    urlTeste: 'https://juridico.villelastay.com.br/juridico',
    tela: 'legal',
    demo: T(
      'O prazo que aguardava validação é conferido por um humano e passa a valer; a fila de pendências diminui na hora.',
      'The deadline awaiting validation is checked by a human and takes effect; the pending queue drops immediately.',
      'El plazo que esperaba validación lo verifica un humano y pasa a valer; la fila de pendientes baja al instante.'),
    categoria: T('Software jurídico', 'Legal software', 'Software jurídico'),
    promessa: T(
      'O escritório inteiro em um só lugar — com IA que cita as fontes.',
      'The whole firm in one place — with AI that cites its sources.',
      'Todo el despacho en un solo lugar — con IA que cita las fuentes.'
    ),
    dor: T(
      'A publicação sai, ninguém vê, e o prazo corre. O controle de prazo mora na cabeça de uma pessoa, e a IA jurídica da moda inventa precedente que não existe.',
      'The court notice is published, nobody sees it, and the clock runs. Deadline control lives in one person’s head, and the fashionable legal AI invents precedents that do not exist.',
      'Sale la publicación, nadie la ve y el plazo corre. El control de plazos vive en la cabeza de una persona, y la IA jurídica de moda inventa precedentes inexistentes.'
    ),
    virada: T(
      'Coleta automática por OAB no DJEN, prazo calculado pelo CPC com validação humana obrigatória e alerta que escala até alguém confirmar a leitura. A IA entrega minuta com a fonte no lado.',
      'Automatic collection by bar number from the DJEN, deadlines calculated under the Civil Procedure Code with mandatory human validation, and alerts that escalate until someone confirms. The AI delivers a draft with the source alongside.',
      'Recogida automática por número de colegiado en el DJEN, plazo calculado por el CPC con validación humana obligatoria y alerta que escala hasta que alguien confirme. La IA entrega borrador con la fuente al lado.'
    ),
    porque: T(
      'Prazo perdido é dano ao cliente e risco disciplinar. Aqui o sistema não confia em si mesmo: ele exige que um humano valide o cálculo e avisa quando a coleta vem vazia — porque coleta vazia costuma ser falha, não silêncio.',
      'A missed deadline harms the client and creates disciplinary risk. Here the system does not trust itself: it requires a human to validate the calculation and warns when a collection comes back empty — because an empty collection is usually a failure, not silence.',
      'Un plazo perdido daña al cliente y crea riesgo disciplinario. Aquí el sistema no confía en sí mismo: exige que un humano valide el cálculo y avisa cuando la recogida viene vacía — porque una recogida vacía suele ser un fallo, no silencio.'
    ),
    recursos: [
      ['⚖️', T('Processos e prazos', 'Cases and deadlines', 'Procesos y plazos'),
        T('Andamentos do DataJud, calculadora de prazos do CPC com validação humana, alerta escalonado e confirmação de leitura.',
          'DataJud case movements, a Civil Procedure Code deadline calculator with human validation, escalating alerts and read receipts.',
          'Movimientos del DataJud, calculadora de plazos del CPC con validación humana, alerta escalonada y confirmación de lectura.')],
      ['📰', T('Publicações do DJEN', 'DJEN court publications', 'Publicaciones del DJEN'),
        T('Coleta automática por OAB, triagem, vínculo ao processo e alerta quando a captura vem vazia.',
          'Automatic collection by bar number, triage, linking to the case and an alert when the capture comes back empty.',
          'Recogida automática por colegiado, triaje, vínculo al proceso y alerta cuando la captura viene vacía.')],
      ['🤖', T('IA jurídica com fonte', 'Legal AI with sources', 'IA jurídica con fuente'),
        T('Consulta, geração de peça e análise de contrato — sempre carimbadas como MINUTA, com as fontes citadas ao lado.',
          'Research, drafting and contract analysis — always stamped as a DRAFT, with sources cited alongside.',
          'Consulta, generación de escritos y análisis de contrato — siempre marcadas como BORRADOR, con las fuentes citadas al lado.')],
      ['👥', T('Portal do cliente', 'Client portal', 'Portal del cliente'),
        T('Andamento traduzido em linguagem simples — e só publicado depois que um humano aprova. Evento sensível espera a conversa pessoal.',
          'Case updates translated into plain language — and only published after a human approves. Sensitive events wait for the personal conversation.',
          'Novedades traducidas a lenguaje sencillo — y publicadas solo después de que un humano apruebe. El evento sensible espera la conversación personal.')],
      ['💼', T('Financeiro e horas', 'Finance and time tracking', 'Finanzas y horas'),
        T('Honorário fixo, mensal, por hora ou de êxito, apontamento de horas, faturamento, fluxo de caixa e cobrança escalonada.',
          'Fixed, monthly, hourly or success fees, time entries, invoicing, cash flow and escalating collections.',
          'Honorario fijo, mensual, por hora o de éxito, registro de horas, facturación, flujo de caja y cobro escalonado.')],
      ['🎛️', T('Controladoria independente', 'Independent controls', 'Controladuría independiente'),
        T('Conferências diárias que não dependem de quem opera: prazo sem validação, coleta zerada, contrato sem alçada, prazo de LGPD vencido.',
          'Daily checks independent of whoever operates the system: unvalidated deadlines, zeroed collections, contracts without sign-off, expired data-protection deadlines.',
          'Verificaciones diarias independientes de quien opera: plazo sin validar, recogida en cero, contrato sin alzada, plazo de protección de datos vencido.')]
    ],
    paraQuem: [
      T('Escritórios de advocacia', 'Law firms', 'Despachos de abogados'),
      T('Advogado autônomo', 'Solo practitioners', 'Abogado autónomo'),
      T('Departamento jurídico', 'In-house legal teams', 'Departamento jurídico'),
      T('Correspondentes', 'Correspondent lawyers', 'Corresponsales')
    ],
    prova: T(
      'É o sistema que controla a rotina processual do próprio escritório do grupo — a coleta do DJEN e o boletim diário de prazos rodam nele todos os dias úteis.',
      'It is the system running the group’s own litigation routine — DJEN collection and the daily deadline bulletin run on it every business day.',
      'Es el sistema que controla la rutina procesal del propio despacho del grupo — la recogida del DJEN y el boletín diario de plazos funcionan en él cada día hábil.'
    ),
    preco: { valor: 149, modelo: 'assinatura' },
    faq: [
      [T('A IA do Villela Legal pode inventar jurisprudência?', 'Can Villela Legal’s AI invent case law?', '¿La IA de Villela Legal puede inventar jurisprudencia?'),
       T('A pesquisa vem separada em dois blocos: o que foi conferido no inteiro teor e o que ainda é hipótese. Nada sai sem essa separação, e toda peça sai carimbada como MINUTA para revisão de advogado inscrito na OAB.',
         'Research comes split into two blocks: what was verified in the full text and what is still a hypothesis. Nothing ships without that split, and every draft is stamped as a DRAFT for review by a licensed lawyer.',
         'La investigación viene separada en dos bloques: lo verificado en el texto íntegro y lo que aún es hipótesis. Nada sale sin esa separación, y todo escrito sale marcado como BORRADOR para revisión de abogado colegiado.')],
      [T('O sistema calcula prazo processual sozinho?', 'Does the system calculate procedural deadlines on its own?', '¿El sistema calcula el plazo procesal solo?'),
       T('Ele propõe o cálculo pelas regras do CPC, mas o prazo só passa a valer depois que um humano valida — e a controladoria acusa todo prazo que ficou sem validação.',
         'It proposes the calculation under the Civil Procedure Code, but the deadline only becomes effective after a human validates it — and the controls flag every deadline left unvalidated.',
         'Propone el cálculo por las reglas del CPC, pero el plazo solo vale después de que un humano lo valide — y la controladuría señala todo plazo sin validar.')]
    ]
  },

  // ------------------------------------------------------------ Docs
  {
    id: 'docs',
    nome: 'Villela Docs Intelligence',
    pasta: 'villela-docs',
    vertical: 'docs',
    cor: '#1D4ED8',
    url: 'https://docs.villelastay.com.br/vdocs',
    urlTeste: 'https://docs.villelastay.com.br/vdocs/cadastro',
    tela: 'docs',
    demo: T(
      'Uma pergunta em português é respondida — e cada afirmação aparece com o documento e a página de onde saiu.',
      'A plain-language question is answered — and every statement arrives with the document and page it came from.',
      'Una pregunta en lenguaje natural es respondida — y cada afirmación aparece con el documento y la página de donde salió.'),
    categoria: T('Gestão documental', 'Document management', 'Gestión documental'),
    promessa: T(
      'Pergunte ao seu arquivo morto. Ele responde citando a página.',
      'Ask your dead archive. It answers, citing the page.',
      'Pregúntale a tu archivo muerto. Responde citando la página.'
    ),
    dor: T(
      'O contrato importante está no e-mail de alguém. Existem três versões e ninguém sabe qual vale. A renovação venceu semana passada e você descobriu hoje.',
      'The important contract is in someone’s inbox. There are three versions and nobody knows which one counts. The renewal expired last week and you found out today.',
      'El contrato importante está en el correo de alguien. Hay tres versiones y nadie sabe cuál vale. La renovación venció la semana pasada y te enteraste hoy.'
    ),
    virada: T(
      'Um repositório por empresa, com pasta, permissão e versão vigente sempre identificada. Você pergunta em português e a IA responde apontando o documento e o trecho.',
      'One repository per company, with folders, permissions and the current version always identified. You ask in plain language and the AI answers pointing at the document and the passage.',
      'Un repositorio por empresa, con carpetas, permisos y versión vigente siempre identificada. Preguntas en lenguaje natural y la IA responde señalando el documento y el pasaje.'
    ),
    porque: T(
      'A diferença entre uma IA útil e uma perigosa é uma só: a fonte. Aqui cada resposta traz o documento e a página de origem, conferíveis em um clique — nada de resposta solta em que você tem de acreditar.',
      'There is exactly one difference between useful AI and dangerous AI: the source. Here every answer carries the originating document and page, checkable in one click — no free-floating answer you simply have to believe.',
      'La diferencia entre una IA útil y una peligrosa es una sola: la fuente. Aquí cada respuesta trae el documento y la página de origen, verificables en un clic — nada de respuestas sueltas en las que hay que creer.'
    ),
    recursos: [
      ['🔎', T('Busca que entende o conteúdo', 'Search that understands content', 'Búsqueda que entiende el contenido'),
        T('Por nome, conteúdo, metadado ou pergunta em linguagem natural. O OCR lê até documento escaneado.',
          'By name, content, metadata or a natural-language question. OCR reads even scanned documents.',
          'Por nombre, contenido, metadato o pregunta en lenguaje natural. El OCR lee incluso documentos escaneados.')],
      ['📎', T('IA que cita a fonte', 'AI that cites the source', 'IA que cita la fuente'),
        T('Resumo, cláusula, prazo e risco — sempre apontando documento e página. Você confere em um clique.',
          'Summaries, clauses, deadlines and risks — always pointing at document and page. You verify in one click.',
          'Resumen, cláusula, plazo y riesgo — siempre señalando documento y página. Lo verificas en un clic.')],
      ['✅', T('Fluxo de aprovação', 'Approval workflow', 'Flujo de aprobación'),
        T('Contrato e política passam por etapas, prazos e aprovadores definidos por você, com o histórico de cada decisão.',
          'Contracts and policies pass through stages, deadlines and approvers you define, with the history of every decision.',
          'Contrato y política pasan por etapas, plazos y aprobadores definidos por ti, con el histórico de cada decisión.')],
      ['🗂️', T('Versão vigente sem dúvida', 'No doubt about the current version', 'Versión vigente sin dudas'),
        T('Toda alteração vira versão. Compare, restaure e saiba sempre qual documento está valendo agora.',
          'Every change becomes a version. Compare, restore and always know which document is in force.',
          'Todo cambio se vuelve versión. Compara, restaura y sabe siempre qué documento está vigente.')],
      ['🔐', T('Segurança corporativa', 'Corporate security', 'Seguridad corporativa'),
        T('Permissão por papel, pasta e documento. Link de compartilhamento com senha e validade. Nada exposto em URL pública.',
          'Permissions by role, folder and document. Share links with password and expiry. Nothing exposed on a public URL.',
          'Permiso por rol, carpeta y documento. Enlace para compartir con contraseña y caducidad. Nada expuesto en URL pública.')],
      ['📜', T('LGPD e auditoria', 'Data protection and audit trail', 'Protección de datos y auditoría'),
        T('Trilha completa de acesso, retenção e descarte controlados, exportação e relatório de conformidade.',
          'A full access trail, controlled retention and disposal, export and compliance reporting.',
          'Rastro completo de acceso, retención y descarte controlados, exportación e informe de conformidad.')]
    ],
    paraQuem: [
      T('Jurídico e contratos', 'Legal and contracts', 'Jurídico y contratos'),
      T('Financeiro e contábil', 'Finance and accounting', 'Finanzas y contabilidad'),
      T('RH e operações', 'HR and operations', 'RR. HH. y operaciones'),
      T('Empresas com auditoria', 'Audited companies', 'Empresas con auditoría')
    ],
    prova: T(
      'Cada atualização passa por 222 verificações automatizadas antes de chegar ao cliente.',
      'Every update passes 222 automated checks before it reaches a customer.',
      'Cada actualización pasa por 222 verificaciones automatizadas antes de llegar al cliente.'
    ),
    preco: { valor: 99, modelo: 'assinatura' },
    faq: [
      [T('Meus documentos ficam onde?', 'Where are my documents stored?', '¿Dónde quedan mis documentos?'),
       T('Em repositório isolado por empresa, servido por conexão segura e nunca por URL pública adivinhável. O compartilhamento externo é sempre por link com senha e validade, revogável em um clique.',
         'In a repository isolated per company, served over a secure connection and never through a guessable public URL. External sharing is always a password-protected link with an expiry date, revocable in one click.',
         'En un repositorio aislado por empresa, servido por conexión segura y nunca por URL pública adivinable. El compartir externo es siempre enlace con contraseña y caducidad, revocable en un clic.')],
      [T('A IA lê documento escaneado?', 'Does the AI read scanned documents?', '¿La IA lee documentos escaneados?'),
       T('Lê. O OCR converte o escaneado em texto pesquisável antes da indexação, então PDF de scanner entra na busca e na resposta com citação igual aos demais.',
         'It does. OCR converts the scan into searchable text before indexing, so a scanner PDF enters search and cited answers just like any other file.',
         'Sí. El OCR convierte el escaneado en texto buscable antes de indexar, así que un PDF de escáner entra en la búsqueda y en la respuesta citada igual que los demás.')]
    ]
  },

  // -------------------------------------------------------- Projects
  {
    id: 'projects',
    nome: 'Villela Projects & Events',
    pasta: 'villela-projects',
    vertical: 'projects',
    cor: '#6D28D9',
    url: 'https://projetos.villelastay.com.br/vpe',
    urlTeste: 'https://projetos.villelastay.com.br/vpe/cadastro',
    tela: 'projects',
    demo: T(
      'As ideias mostram viabilidade lado a lado — e a que não se paga fica registrada com o motivo, não esquecida.',
      'Ideas show their feasibility side by side — and the one that does not pay off is recorded with the reason, not forgotten.',
      'Las ideas muestran viabilidad lado a lado — y la que no se paga queda registrada con el motivo, no olvidada.'),
    categoria: T('Projetos e eventos', 'Projects and events', 'Proyectos y eventos'),
    promessa: T(
      'Portfólio antes de tarefa. Decida o que executar — depois execute.',
      'Portfolio before tasks. Decide what to execute — then execute it.',
      'Portafolio antes que tarea. Decide qué ejecutar — luego ejecútalo.'
    ),
    dor: T(
      'Doze ideias boas, tempo para três, e nenhum critério para escolher. O gerenciador de tarefas comum sabe organizar o que já foi decidido — mas não ajuda a decidir.',
      'Twelve good ideas, time for three, and no criterion to choose. The usual task manager organises what has already been decided — but does not help you decide.',
      'Doce buenas ideas, tiempo para tres y ningún criterio para elegir. El gestor de tareas común organiza lo ya decidido — pero no ayuda a decidir.'
    ),
    virada: T(
      'Cada ideia entra com estágio, horizonte, viabilidade, investimento e receita potencial. O que passa no filtro vira projeto por fases; o que não passa fica registrado, não esquecido.',
      'Every idea arrives with stage, horizon, feasibility, investment and potential revenue. What clears the filter becomes a phased project; what does not is recorded, not forgotten.',
      'Cada idea entra con etapa, horizonte, viabilidad, inversión e ingreso potencial. Lo que pasa el filtro se vuelve proyecto por fases; lo que no, queda registrado, no olvidado.'
    ),
    porque: T(
      'A conta que dói não é a do projeto atrasado — é a do projeto errado, executado com capricho. Priorizar com número na frente é mais barato que executar bem a coisa errada.',
      'The painful cost is not the late project — it is the wrong project, executed beautifully. Prioritising with numbers in front of you is cheaper than executing the wrong thing well.',
      'El costo que duele no es el del proyecto atrasado — es el del proyecto equivocado, ejecutado con esmero. Priorizar con números delante sale más barato que ejecutar bien lo equivocado.'
    ),
    recursos: [
      ['💡', T('Portfólio de ideias', 'Idea portfolio', 'Portafolio de ideas'),
        T('Estágio, horizonte, prioridade, viabilidade, investimento e receita potencial — para decidir o que fazer agora, depois ou nunca.',
          'Stage, horizon, priority, feasibility, investment and potential revenue — to decide what to do now, later or never.',
          'Etapa, horizonte, prioridad, viabilidad, inversión e ingreso potencial — para decidir qué hacer ahora, después o nunca.')],
      ['📋', T('Projetos por fases', 'Phased projects', 'Proyectos por fases'),
        T('Da incubação ao lançamento e à operação: 15 estágios configuráveis, responsáveis, riscos e próximo passo sempre visível.',
          'From incubation to launch and operation: 15 configurable stages, owners, risks and the next step always visible.',
          'De la incubación al lanzamiento y la operación: 15 etapas configurables, responsables, riesgos y próximo paso siempre visible.')],
      ['🎪', T('Eventos de ponta a ponta', 'End-to-end events', 'Eventos de punta a punta'),
        T('Briefing, proposta, contrato, checklist, equipe, fornecedores e pós-evento — feito por quem recebe casamento e formatura de verdade.',
          'Briefing, proposal, contract, checklist, crew, suppliers and post-event — built by people who actually host weddings and graduations.',
          'Briefing, propuesta, contrato, checklist, equipo, proveedores y post-evento — hecho por quien recibe bodas y graduaciones de verdad.')],
      ['🤖', T('IA como parte do time', 'AI as part of the team', 'IA como parte del equipo'),
        T('Agentes que geram plano de negócio, cronograma, proposta e relatório — sempre registrando premissa e lacuna, sem inventar dado.',
          'Agents that generate business plans, schedules, proposals and reports — always recording assumptions and gaps, never inventing data.',
          'Agentes que generan plan de negocio, cronograma, propuesta e informe — siempre registrando premisa y laguna, sin inventar datos.')],
      ['💰', T('Previsto × realizado', 'Budget vs. actual', 'Previsto × realizado'),
        T('Orçamento previsto contra realizado e margem por projeto ou evento, com o comercial e o financeiro na mesma tela.',
          'Budget against actual and margin per project or event, with sales and finance on the same screen.',
          'Presupuesto contra realizado y margen por proyecto o evento, con lo comercial y lo financiero en la misma pantalla.')],
      ['🔐', T('Multiempresa e auditável', 'Multi-company and auditable', 'Multiempresa y auditable'),
        T('Cada empresa isolada, papéis e permissões, trilha de auditoria completa e adequação à LGPD.',
          'Each company isolated, roles and permissions, a full audit trail and data-protection compliance.',
          'Cada empresa aislada, roles y permisos, rastro de auditoría completo y cumplimiento de protección de datos.')]
    ],
    paraQuem: [
      T('Produtoras de eventos', 'Event producers', 'Productoras de eventos'),
      T('Agências e estúdios', 'Agencies and studios', 'Agencias y estudios'),
      T('Times de novos negócios', 'New-business teams', 'Equipos de nuevos negocios'),
      T('Empreendedor com várias frentes', 'Entrepreneurs with many fronts', 'Emprendedor con varios frentes')
    ],
    prova: T(
      'O portfólio do próprio Grupo Villela Stay — 16 projetos entre hospedagem, eventos e expansões — é gerido neste sistema. Cada atualização passa por 197 verificações automatizadas.',
      'Grupo Villela Stay’s own portfolio — 16 projects across accommodation, events and expansions — is managed in this system. Every update passes 197 automated checks.',
      'El portafolio del propio Grupo Villela Stay — 16 proyectos entre alojamiento, eventos y expansiones — se gestiona en este sistema. Cada actualización pasa por 197 verificaciones automatizadas.'
    ),
    preco: { valor: 149, modelo: 'assinatura' },
    faq: [
      [T('Qual a diferença para um Trello ou Asana?', 'How is this different from Trello or Asana?', '¿En qué se diferencia de Trello o Asana?'),
       T('Aqueles começam na tarefa. Este começa uma camada antes: no portfólio, onde a ideia ganha viabilidade, investimento e receita potencial. Só o que sobrevive a esse filtro vira projeto com tarefa.',
         'Those start at the task. This starts one layer earlier: at the portfolio, where an idea gets feasibility, investment and potential revenue. Only what survives that filter becomes a project with tasks.',
         'Aquellos empiezan en la tarea. Este empieza una capa antes: en el portafolio, donde la idea gana viabilidad, inversión e ingreso potencial. Solo lo que sobrevive a ese filtro se vuelve proyecto con tareas.')]
    ]
  },

  // --------------------------------------------------------- Academy
  {
    id: 'academy',
    nome: 'Villela Academy',
    pasta: 'villela-academy',
    vertical: 'academy',
    cor: '#B45309',
    url: 'https://academia.villelastay.com.br/academy',
    urlTeste: 'https://academia.villelastay.com.br/academy/app#cadastro',
    tela: 'academy',
    demo: T(
      'As vendas do mês entram e a receita do produtor sobe — com a taxa da plataforma sempre à vista.',
      'The month’s sales come in and the creator’s revenue rises — with the platform fee always in sight.',
      'Las ventas del mes entran y los ingresos del productor suben — con la tarifa de la plataforma siempre a la vista.'),
    categoria: T('Cursos e produtos digitais', 'Courses and digital products', 'Cursos y productos digitales'),
    promessa: T(
      'Publicar é grátis. Você só paga quando vende.',
      'Publishing is free. You only pay when you sell.',
      'Publicar es gratis. Solo pagas cuando vendes.'
    ),
    dor: T(
      'Você tem o conteúdo, mas montar página de venda, checkout, área de membros, controle de acesso e programa de afiliado é um projeto inteiro — e as plataformas cobram antes de você vender a primeira vez.',
      'You have the content, but building a sales page, checkout, members area, access control and an affiliate programme is a whole project — and the platforms charge before you have sold once.',
      'Tienes el contenido, pero montar página de venta, checkout, área de miembros, control de acceso y programa de afiliados es un proyecto entero — y las plataformas cobran antes de tu primera venta.'
    ),
    virada: T(
      'Página de venda, checkout com Pix e cartão, área de membros e afiliados já vêm prontos. Sem mensalidade e sem taxa de adesão: 8,9% + R$ 1 por venda aprovada.',
      'Sales page, checkout with Pix and card, members area and affiliates come ready. No monthly fee and no setup fee: 8.9% + R$1 per approved sale.',
      'Página de venta, checkout con Pix y tarjeta, área de miembros y afiliados vienen listos. Sin mensualidad ni tarifa de adhesión: 8,9% + R$ 1 por venta aprobada.'
    ),
    porque: T(
      'É o único sistema desta lista em que o risco é todo nosso: se você não vender, não paga nada. O incentivo fica do lado certo do balcão.',
      'It is the only system on this list where the risk is entirely ours: if you do not sell, you pay nothing. The incentive sits on the right side of the counter.',
      'Es el único sistema de esta lista donde el riesgo es todo nuestro: si no vendes, no pagas nada. El incentivo queda del lado correcto del mostrador.'
    ),
    recursos: [
      ['🎬', T('Para quem ensina', 'For those who teach', 'Para quien enseña'),
        T('Curso, e-book, mentoria e assinatura, com página de venda, checkout e área de membros prontos.',
          'Courses, e-books, mentoring and subscriptions, with sales page, checkout and members area ready to go.',
          'Curso, e-book, mentoría y suscripción, con página de venta, checkout y área de miembros listos.')],
      ['🤝', T('Para quem divulga', 'For those who promote', 'Para quien difunde'),
        T('Programa de afiliados com link rastreável e painel de clique, venda e comissão — transparente dos dois lados.',
          'An affiliate programme with tracked links and a dashboard of clicks, sales and commissions — transparent on both sides.',
          'Programa de afiliados con enlace rastreable y panel de clics, ventas y comisiones — transparente por ambos lados.')],
      ['💳', T('Pagamento nacional', 'Local payments', 'Pago nacional'),
        T('Pix e cartão pelo Mercado Pago, com liberação do acesso só depois da confirmação na fonte.',
          'Pix and card through Mercado Pago, with access released only after confirmation at the source.',
          'Pix y tarjeta por Mercado Pago, con liberación del acceso solo tras la confirmación en la fuente.')],
      ['🔒', T('Conteúdo protegido', 'Protected content', 'Contenido protegido'),
        T('Vídeo com streaming seguro, arquivo privado e link temporário — seu conteúdo não circula por aí.',
          'Secure video streaming, private files and temporary links — your content does not circulate.',
          'Vídeo con streaming seguro, archivo privado y enlace temporal — tu contenido no circula por ahí.')],
      ['📜', T('Certificado verificável', 'Verifiable certificates', 'Certificado verificable'),
        T('Cada certificado tem código que qualquer pessoa confere publicamente — o diploma do seu aluno vale algo.',
          'Every certificate carries a code anyone can verify publicly — your student’s diploma actually means something.',
          'Cada certificado lleva un código que cualquiera verifica públicamente — el diploma de tu alumno vale algo.')],
      ['🤖', T('IA que ajuda a montar', 'AI that helps you build', 'IA que ayuda a montar'),
        T('Assistentes que estruturam o curso, escrevem a página de venda e dão suporte ao aluno.',
          'Assistants that structure the course, write the sales page and support the student.',
          'Asistentes que estructuran el curso, escriben la página de venta y dan soporte al alumno.')]
    ],
    paraQuem: [
      T('Especialistas e autores', 'Experts and authors', 'Especialistas y autores'),
      T('Mentores e consultores', 'Mentors and consultants', 'Mentores y consultores'),
      T('Afiliados', 'Affiliates', 'Afiliados'),
      T('Escolas e cursos livres', 'Schools and short courses', 'Escuelas y cursos libres')
    ],
    prova: T(
      'A taxa é a mesma para todo mundo e está escrita: 8,9% + R$ 1 por venda aprovada, sem mensalidade, sem adesão e sem surpresa no saque.',
      'The fee is the same for everyone and it is written down: 8.9% + R$1 per approved sale, no monthly fee, no setup fee and no surprise at withdrawal.',
      'La tarifa es igual para todos y está escrita: 8,9% + R$ 1 por venta aprobada, sin mensualidad, sin adhesión y sin sorpresas al retirar.'
    ),
    preco: { modelo: 'comissao', texto: T('8,9% + R$ 1 por venda', '8.9% + R$1 per sale', '8,9% + R$ 1 por venta') },
    faq: [
      [T('Quanto custa para publicar um curso?', 'How much does it cost to publish a course?', '¿Cuánto cuesta publicar un curso?'),
       T('Nada. Não há mensalidade nem taxa de adesão: a plataforma cobra 8,9% mais R$ 1 apenas sobre a venda aprovada. Se você não vender, não paga.',
         'Nothing. There is no monthly fee and no setup fee: the platform charges 8.9% plus R$1 only on an approved sale. If you do not sell, you do not pay.',
         'Nada. No hay mensualidad ni tarifa de adhesión: la plataforma cobra 8,9% más R$ 1 solo sobre la venta aprobada. Si no vendes, no pagas.')]
    ]
  },

  // ------------------------------------------------------- Alta Vista
  {
    id: 'altavista',
    nome: 'Villela Alta Vista 360°',
    pasta: 'villela-alta-vista',
    simbolo: 'simbolo.png',       // identidade própria — não usa o símbolo V
    vertical: 'stay',             // acento ciano, o mais próximo do azul da marca
    cor: '#176B87',
    url: 'https://altavista.villelastay.com.br/alta-vista',
    urlTeste: 'https://altavista.villelastay.com.br/alta-vista/orcamento',
    tela: 'altavista',
    demo: T(
      'O pacote anda da captação à edição, e o tour já publicado recebe visita enquanto o resto é produzido.',
      'The package moves from capture to editing, and the already-published tour receives visits while the rest is produced.',
      'El paquete avanza de la captación a la edición, y el tour ya publicado recibe visitas mientras se produce el resto.'),
    categoria: T('Conteúdo visual e tour 360°', 'Visual content and 360° tours', 'Contenido visual y tour 360°'),
    promessa: T(
      'Veja de cima. Explore por inteiro.',
      'See it from above. Explore it fully.',
      'Míralo desde arriba. Explóralo por completo.'
    ),
    dor: T(
      'O imóvel é ótimo e as fotos não mostram. Quem procura anúncio decide em segundos, e um espaço fotografado de qualquer jeito perde para um pior, bem fotografado.',
      'The property is great and the photos do not show it. People browsing listings decide in seconds, and a carelessly photographed space loses to a worse one photographed well.',
      'El inmueble es excelente y las fotos no lo muestran. Quien busca anuncios decide en segundos, y un espacio mal fotografiado pierde ante uno peor, bien fotografiado.'
    ),
    virada: T(
      'Filmagem com drone, vídeo com IA, foto 360° e tour virtual navegável — entregues com hospedagem do tour, QR Code para material impresso e endereço exato oculto por padrão.',
      'Drone footage, AI video, 360° photography and a navigable virtual tour — delivered with tour hosting, a QR code for printed materials and the exact address hidden by default.',
      'Filmación con dron, vídeo con IA, foto 360° y tour virtual navegable — entregados con alojamiento del tour, código QR para material impreso y dirección exacta oculta por defecto.'
    ),
    porque: T(
      'É o único da lista que não é software que você opera: é entrega pronta. Você recebe o material e o tour publicado, medido e no ar.',
      'It is the only one on this list that is not software you operate: it is finished delivery. You receive the material and the tour published, measured and live.',
      'Es el único de la lista que no es software que tú operas: es entrega lista. Recibes el material y el tour publicado, medido y en el aire.'
    ),
    recursos: [
      ['🚁', T('Filmagem com drone', 'Drone footage', 'Filmación con dron'),
        T('O enquadramento que vende o entorno: a rua, a vizinhança, a distância real do que importa.',
          'The framing that sells the surroundings: the street, the neighbourhood, the real distance to what matters.',
          'El encuadre que vende el entorno: la calle, el vecindario, la distancia real a lo que importa.')],
      ['🎞️', T('Vídeo com IA', 'AI video', 'Vídeo con IA'),
        T('Peças curtas para anúncio e redes, produzidas a partir do material captado.',
          'Short pieces for listings and social, produced from the captured material.',
          'Piezas cortas para anuncio y redes, producidas a partir del material captado.')],
      ['🧭', T('Tour virtual navegável', 'Navigable virtual tour', 'Tour virtual navegable'),
        T('O visitante entra e caminha pelo espaço sozinho, de qualquer aparelho, sem instalar nada.',
          'Visitors step in and walk the space themselves, from any device, with nothing to install.',
          'El visitante entra y recorre el espacio solo, desde cualquier dispositivo, sin instalar nada.')],
      ['📱', T('QR Code para o impresso', 'QR code for print', 'Código QR para impreso'),
        T('Placa, folheto e cartão levam direto ao tour — o material impresso deixa de ser beco sem saída.',
          'Signs, flyers and cards lead straight to the tour — printed material stops being a dead end.',
          'Cartel, folleto y tarjeta llevan directo al tour — el material impreso deja de ser un callejón sin salida.')],
      ['🔒', T('Endereço oculto por padrão', 'Address hidden by default', 'Dirección oculta por defecto'),
        T('O endereço exato do imóvel não aparece a menos que você mande aparecer.',
          'The exact address does not appear unless you say so.',
          'La dirección exacta no aparece a menos que tú lo indiques.')],
      ['📈', T('Publicado, medido e no ar', 'Published, measured and live', 'Publicado, medido y en el aire'),
        T('Hospedagem do tour incluída na franquia do pacote, com medição de visita e disponibilidade contínua.',
          'Tour hosting included in the package allowance, with visit measurement and continuous availability.',
          'Alojamiento del tour incluido en la franquicia del paquete, con medición de visitas y disponibilidad continua.')]
    ],
    paraQuem: [
      T('Anfitriões de temporada', 'Short-stay hosts', 'Anfitriones de temporada'),
      T('Imobiliárias e corretores', 'Estate agencies and brokers', 'Inmobiliarias y corredores'),
      T('Hotéis e pousadas', 'Hotels and guesthouses', 'Hoteles y posadas'),
      T('Proprietários', 'Owners', 'Propietarios')
    ],
    prova: T(
      'O tour virtual 360° do site da Villela Stay foi produzido e publicado por este estúdio — você pode percorrê-lo agora, antes de contratar qualquer coisa.',
      'The 360° virtual tour on the Villela Stay website was produced and published by this studio — you can walk through it right now, before hiring anything.',
      'El tour virtual 360° del sitio de Villela Stay fue producido y publicado por este estudio — puedes recorrerlo ahora, antes de contratar nada.'
    ),
    preco: { modelo: 'projeto', texto: T('Por projeto, sob orçamento', 'Per project, on quotation', 'Por proyecto, bajo presupuesto') },
    faq: [
      [T('O tour virtual fica hospedado onde?', 'Where is the virtual tour hosted?', '¿Dónde queda alojado el tour virtual?'),
       T('Conosco. Os pacotes incluem franquia de hospedagem de 6 ou 12 meses conforme o combo; depois dela, a manutenção do tour no ar custa R$ 29 por mês ou R$ 290 por ano.',
         'With us. Packages include a 6- or 12-month hosting allowance depending on the bundle; after that, keeping the tour live costs R$29 a month or R$290 a year.',
         'Con nosotros. Los paquetes incluyen franquicia de alojamiento de 6 o 12 meses según el combo; después, mantener el tour en el aire cuesta R$ 29 al mes o R$ 290 al año.')]
    ]
  }
];

// ---------------------------------------------------------------------
// EM DESENVOLVIMENTO — no ar e funcionando, mas antes do lançamento
// comercial. Entram na página numa seção própria, em cartão, sem preço e
// sem "teste 14 dias": não se vende o que ainda não está à venda.
//
// "Em desenvolvimento" aqui é ESTÁGIO COMERCIAL, não técnico — os três
// respondem 200 em produção e têm suíte de testes. O que falta em cada um
// está escrito no cartão, de propósito: numa página que argumenta com
// prova, dizer o que ainda não está pronto vale mais que esconder.
// Ao lançar um deles, mover para SISTEMAS (com maquete de tela e preço).
// ---------------------------------------------------------------------
const EM_DESENVOLVIMENTO = [
  {
    id: 'finance', nome: 'Villela Finance', pasta: 'villela-finance',
    cor: '#0F4C81', vertical: 'grupo', url: 'https://villela-stay-backend.onrender.com/finance',
    tela: 'finance',
    demo: T(
      'A linha do extrato vira lançamento: a sugestão diz por que sugeriu, e o lançamento fecha em débito = crédito.',
      'A bank line becomes an entry: the suggestion says why it was made, and the entry balances debit = credit.',
      'La línea del extracto se vuelve asiento: la sugerencia dice por qué, y el asiento cuadra débito = crédito.'),
    estado: T('Em produção, antes do lançamento comercial', 'In production, before commercial launch', 'En producción, antes del lanzamiento comercial'),
    categoria: T('ERP financeiro para PMEs', 'Financial ERP for small business', 'ERP financiero para pymes'),
    promessa: T('O número que fecha, e explica de onde veio.', 'Figures that balance — and say where they came from.', 'Números que cuadran y dicen de dónde vienen.'),
    oQueE: T(
      'Razão de partida dobrada como fonte oficial: nenhum painel soma tabela solta. Extrato bancário importado e conciliado com sugestão explicável, contas a pagar e a receber com rateio por imóvel, fechamento com balanço que fecha, previsão de caixa em três cenários e um CFO que só aponta o que os números acionaram — dizendo, em cada constatação, o que a invalidaria. Dinheiro em centavos inteiros, lançamento imutável e ação material com segundo par de olhos.',
      'A double-entry ledger as the single source of truth: no dashboard sums loose tables. Imported and reconciled bank feed with explainable suggestions, payables and receivables split per property, closing with a balance sheet that balances, three-scenario cash forecast, and a CFO that only flags what the figures triggered — stating, for each finding, what would invalidate it. Money as whole cents, entries immutable, material actions requiring a second pair of eyes.',
      'Libro mayor por partida doble como fuente oficial: ningún panel suma tablas sueltas. Extracto importado y conciliado con sugerencia explicable, cuentas por pagar y cobrar con reparto por inmueble, cierre con balance que cuadra, previsión de caja en tres escenarios y un CFO que solo señala lo que los números activaron — diciendo, en cada hallazgo, qué lo invalidaría. Dinero en céntimos enteros, asientos inmutables y acción material con segundo par de ojos.'),
    falta: T(
      'Cobrança recorrente ligada, revisão jurídica dos termos e do contrato de tratamento de dados, e um exercício de restauração do backup antes de aceitar o primeiro assinante pagante. As análises de mercado e de leilões seguem fora do produto até haver parecer sobre o perímetro da CVM.',
      'Recurring billing switched on, legal review of the terms and data-processing agreement, and a real backup-restore drill before accepting the first paying subscriber. Market and auction analysis stay out of the product until there is an opinion on the Brazilian securities regulator’s perimeter.',
      'Cobro recurrente activado, revisión jurídica de los términos y del contrato de tratamiento de datos, y un ejercicio real de restauración de copia antes de aceptar al primer suscriptor de pago. Los análisis de mercado y de subastas siguen fuera del producto hasta que haya dictamen sobre el perímetro del regulador.')
  },
  {
    id: 'kids', nome: 'Villela Kids · Invente', pasta: 'villela-kids', simbolo: 'simbolo.svg',
    cor: '#6C4DFF', vertical: 'kids', url: 'https://kids.villelastay.com.br/kids',
    tela: 'kids',
    demo: T(
      'Uma missão é concluída, o progresso avança e o painel dos pais registra — tudo na conta do responsável.',
      'A mission is completed, progress moves forward and the parents dashboard records it — all under the guardian’s account.',
      'Una misión se completa, el progreso avanza y el panel de los padres lo registra — todo en la cuenta del responsable.'),
    estado: T('Beta fechado por convite', 'Invite-only closed beta', 'Beta cerrada por invitación'),
    categoria: T('Aprendizagem criativa para crianças', 'Creative learning for children', 'Aprendizaje creativo para niños'),
    promessa: T('Aprenda criando.', 'Learn by creating.', 'Aprende creando.'),
    oQueE: T(
      'Plataforma para crianças de 7 a 12 anos: missões criativas que viram projetos de verdade, tutor de IA com segurança em primeiro lugar, Arenas de Matemática, Português e Inglês que se adaptam ao nível da criança, e painel para os pais acompanharem. A conta é sempre do responsável.',
      'A platform for children aged 7 to 12: creative missions that turn into real projects, an AI tutor with safety first, Maths, Portuguese and English Arenas that adapt to the child’s level, and a dashboard for parents. The account always belongs to the guardian.',
      'Plataforma para niños de 7 a 12 años: misiones creativas que se vuelven proyectos reales, tutor de IA con la seguridad ante todo, Arenas de Matemáticas, Portugués e Inglés que se adaptan al nivel del niño, y panel para los padres. La cuenta es siempre del responsable.'),
    falta: T(
      'Parecer do advogado sobre o consentimento dos pais (LGPD, art. 14) e o registro da marca antes de abrir ao público.',
      'A lawyer’s opinion on parental consent (Brazilian data-protection law, art. 14) and trademark registration before opening to the public.',
      'Dictamen del abogado sobre el consentimiento de los padres (ley brasileña de protección de datos, art. 14) y el registro de marca antes de abrir al público.')
  },
  {
    id: 'closet', nome: 'Closet Club', pasta: 'closet-club', simbolo: 'simbolo.svg',
    cor: '#C6A96B', vertical: 'grupo', url: 'https://closet.villelastay.com.br/closet',
    tela: 'closet',
    demo: T(
      'Quatro peças de três proprietárias viram um look só — e uma reserva só, com o pagamento retido até a entrega.',
      'Four items from three owners become a single look — and a single booking, with payment held until delivery.',
      'Cuatro prendas de tres propietarias se vuelven un solo look — y una sola reserva, con el pago retenido hasta la entrega.'),
    estado: T('No ar, montando o acervo', 'Live, building the collection', 'En el aire, formando el acervo'),
    categoria: T('Marketplace de aluguel de roupas', 'Clothing rental marketplace', 'Marketplace de alquiler de ropa'),
    promessa: T('Seu guarda-roupa rende. O dela também.', 'Your wardrobe earns. So does hers.', 'Tu armario rinde. El de ella también.'),
    oQueE: T(
      'Aluguel de roupas e acessórios entre pessoas. O diferencial não é listar peça: é alugar o <b>look inteiro</b> — vestido, bolsa, sapato e joia numa reserva só, mesmo vindo de proprietárias diferentes — com pagamento retido até a entrega, QR Code de posse e mediação de disputa.',
      'Peer-to-peer clothing and accessory rental. The differentiator is not listing items: it is renting the <b>whole look</b> — dress, bag, shoes and jewellery in a single booking, even from different owners — with payment held until delivery, a possession QR code and dispute mediation.',
      'Alquiler de ropa y accesorios entre personas. El diferencial no es listar prendas: es alquilar el <b>look entero</b> — vestido, bolso, zapato y joya en una sola reserva, incluso de propietarias distintas — con pago retenido hasta la entrega, código QR de posesión y mediación de disputas.'),
    falta: T(
      'Revisão jurídica dos termos e cerca de 50 peças no acervo, para a vitrine abrir com escolha de verdade.',
      'Legal review of the terms and around 50 items in the collection, so the storefront opens with a real choice.',
      'Revisión jurídica de los términos y unas 50 prendas en el acervo, para que el escaparate abra con opciones reales.')
  },
  {
    id: 'vitrine', nome: 'Vitrine', pasta: 'vitrine', simbolo: 'simbolo.svg',
    cor: '#0C5A52', vertical: 'grupo', url: 'https://vitrine.villelastay.com.br/vitrine',
    tela: 'vitrine',
    demo: T(
      'O dinheiro anda de “pago e protegido” até o repasse do vendedor, passo a passo, sem ninguém pagar no escuro.',
      'The money moves from “paid and protected” to the seller’s payout, step by step, with nobody paying blind.',
      'El dinero avanza de “pagado y protegido” hasta la liquidación del vendedor, paso a paso, sin que nadie pague a ciegas.'),
    estado: T('No ar, antes do lançamento', 'Live, before launch', 'En el aire, antes del lanzamiento'),
    categoria: T('Marketplace de compra e venda', 'Buy-and-sell marketplace', 'Marketplace de compra y venta'),
    promessa: T('Compre bem. Venda melhor.', 'Buy well. Sell better.', 'Compra bien. Vende mejor.'),
    oQueE: T(
      'Marketplace de produtos novos, seminovos e usados: o pagamento fica protegido até a entrega, o envio é rastreado e o vendedor carrega reputação de verdade, construída nas vendas anteriores. Comissão de 5%.',
      'A marketplace for new, nearly-new and pre-owned goods: payment is protected until delivery, shipping is tracked and the seller carries a real reputation built on past sales. 5% commission.',
      'Marketplace de productos nuevos, seminuevos y usados: el pago queda protegido hasta la entrega, el envío se rastrea y el vendedor lleva una reputación real construida en ventas anteriores. Comisión del 5%.'),
    falta: T(
      'Credenciais de pagamento em produção, revisão jurídica dos termos e a definição do nome definitivo.',
      'Production payment credentials, legal review of the terms and the final name.',
      'Credenciales de pago en producción, revisión jurídica de los términos y la definición del nombre definitivo.')
  },
  {
    // 13º produto (15/08/2026). ⚠️ Único que NÃO roda no backend compartilhado:
    // serviço próprio no Render, então a URL não tem prefixo de caminho.
    id: 'cozinhe', nome: 'Cozinhe', pasta: 'cozinhe',
    cor: '#A64B32', vertical: 'grupo', url: 'https://cozinhe.villelastay.com.br',
    tela: 'cozinhe',
    demo: T(
      'As porções sobem de 8 para 12 e cada ingrediente escala pela própria regra: o ovo vira unidade inteira, a farinha avisa que agora são dois lotes, o resto acompanha proporcionalmente.',
      'Servings go from 8 to 12 and each ingredient scales by its own rule: the egg becomes a whole unit, the flour warns it is now two batches, the rest follows proportionally.',
      'Las porciones suben de 8 a 12 y cada ingrediente escala por su propia regla: el huevo pasa a unidad entera, la harina avisa que ahora son dos tandas, el resto acompaña proporcionalmente.'),
    estado: T('No ar, em validação editorial', 'Live, in editorial validation', 'En el aire, en validación editorial'),
    categoria: T('Receitas e técnica de cozinha', 'Recipes and cooking technique', 'Recetas y técnica de cocina'),
    promessa: T(
      'Aprenda, planeje e cozinhe com precisão e confiança.',
      'Learn, plan and cook with precision and confidence.',
      'Aprende, planifica y cocina con precisión y confianza.'),
    oQueE: T(
      'Site de receita comum multiplica tudo por 1,5 e entrega uma receita que não funciona: 4,5 ovos, uma fôrma que transborda, um tempo de forno que já não vale. O <b>Cozinhe</b> escala cada ingrediente pela regra dele — proporcional, unidade inteira ou por lote —, só dentro de uma faixa de rendimento realmente testada, e mantém os alertas de ponto e de segurança em todas as versões da receita.',
      'The usual recipe site multiplies everything by 1.5 and hands you a recipe that does not work: 4.5 eggs, a tin that overflows, an oven time that no longer applies. <b>Cozinhe</b> scales each ingredient by its own rule — linear, whole units or per batch — only within a genuinely tested yield range, and keeps the doneness and safety warnings across every version of the recipe.',
      'Un sitio de recetas común multiplica todo por 1,5 y entrega una receta que no funciona: 4,5 huevos, un molde que se desborda, un tiempo de horno que ya no vale. <b>Cozinhe</b> escala cada ingrediente por su propia regla — proporcional, unidad entera o por tanda —, solo dentro de un rango de rendimiento realmente probado, y mantiene las alertas de punto y seguridad en todas las versiones de la receta.'),
    falta: T(
      'Revisão culinária humana das receitas antes da publicação — o próprio produto carimba as atuais como demonstrativas — e a definição do modelo comercial.',
      'Human culinary review of the recipes before publication — the product itself stamps the current ones as demonstrations — and the commercial model.',
      'Revisión culinaria humana de las recetas antes de la publicación — el propio producto marca las actuales como demostrativas — y la definición del modelo comercial.')
  }
];

// ---------------------------------------------------------------------
// Produtos da home que NÃO entram nesta landing — com o motivo escrito.
// A trava de cobertura exige que todo produto da home esteja aqui, em
// SISTEMAS ou em EM_DESENVOLVIMENTO. Assim, esquecer de classificar um
// produto novo quebra o build em vez de virar buraco silencioso na página.
// Chave = `pasta` do PRODUTOS_GRUPO (build.js).
// ---------------------------------------------------------------------
const NAO_SAAS = {
  'villela-stay': 'A hospedagem é o assunto do resto do site — esta página vende software.',
  'livraria-villela': 'Livraria é e-commerce de livro, não assinatura de sistema.'
};

// ---------------------------------------------------------------------
// A trava. Chamada pelo build ANTES de gerar a página.
// Recebe a lista de produtos da home e confere que cada um foi classificado.
// Falha ruidosa e instrutiva: quem criar o 14º produto lê o que fazer.
// ---------------------------------------------------------------------
function conferirCobertura(produtosDaHome) {
  const cobertos = new Set(SISTEMAS.map(s => s.pasta).concat(EM_DESENVOLVIMENTO.map(s => s.pasta)));
  const orfaos = produtosDaHome
    .map(p => p.pasta)
    .filter(pasta => !cobertos.has(pasta) && !(pasta in NAO_SAAS));

  if (orfaos.length) {
    throw new Error(
      `[sistemas] Produto na home sem classificação: ${orfaos.join(', ')}.\n` +
      `  Todo produto de PRODUTOS_GRUPO precisa aparecer em UM dos três lugares de\n` +
      `  content/sistemas.js:\n` +
      `    · SISTEMAS          — SaaS já à venda (bloco completo na landing: promessa,\n` +
      `                          dor, 6 recursos, prova, preço, maquete de tela e FAQ\n` +
      `                          nos 3 idiomas);\n` +
      `    · EM_DESENVOLVIMENTO — no ar, mas antes do lançamento comercial (cartão, sem\n` +
      `                          preço, com o que ainda falta escrito);\n` +
      `    · NAO_SAAS          — não é software vendido, com o motivo escrito.\n` +
      `  Entrando em SISTEMAS, acrescente também a maquete em content/sistemas-telas.js\n` +
      `  e revise o SEO/GEO da página (título, descrição, FAQ e llms.txt).`
    );
  }

  // Produto não pode estar em dois baldes: sairia duas vezes na página, e a
  // versão "à venda" e a "em desenvolvimento" se contradiriam na mesma tela.
  const duplicados = SISTEMAS.map(s => s.pasta).filter(p => EM_DESENVOLVIMENTO.some(d => d.pasta === p));
  if (duplicados.length) {
    throw new Error(`[sistemas] Produto em SISTEMAS e em EM_DESENVOLVIMENTO ao mesmo tempo: ${duplicados.join(', ')}. Ao lançar, REMOVA de EM_DESENVOLVIMENTO.`);
  }

  // Maquete faltando derruba o layout do bloco, então também é trava. Vale
  // para os dois baldes visíveis: desde que a demonstração do topo passa por
  // TODOS os sistemas, um sem tela deixaria um buraco no rodízio.
  const telas = require('./sistemas-telas').TELAS;
  const todos = SISTEMAS.concat(EM_DESENVOLVIMENTO);
  const semTela = todos.filter(s => !telas[s.tela]).map(s => s.id);
  if (semTela.length) {
    throw new Error(`[sistemas] Sem maquete de tela em content/sistemas-telas.js: ${semTela.join(', ')}.`);
  }
  // A legenda é o que explica ao visitante o que ele está vendo acontecer.
  // Sem ela, a tela troca sozinha e ninguém entende o que mudou.
  const semDemo = todos.filter(s => !s.demo).map(s => s.id);
  if (semDemo.length) {
    throw new Error(`[sistemas] Sem legenda 'demo' (o que a animação mostra): ${semDemo.join(', ')}.`);
  }
}

module.exports = { SISTEMAS, EM_DESENVOLVIMENTO, NAO_SAAS, conferirCobertura };
