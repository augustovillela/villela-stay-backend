'use strict';
// ============================================================================
// Portal Staff — Villela Stay Manager · ONDA LIVRO
// Extensão da aba 🏨 (objeto VSM de app-vsm.js) com o que o livro "Claude AI
// na Prática para Hospedagens" acrescentou ao produto:
//
//   · Mapa livro ↔ sistema — capítulo por capítulo, o que o sistema entrega
//     e em que plano. É o roteiro de venda e a resposta à pergunta que todo
//     leitor vai fazer: "o livro ensina isso; o sistema faz isso?"
//   · Cobertura por plano dos módulos novos e adoção entre as operações.
//   · O que o sistema NÃO faz de propósito (Cap. 49) — dizer isso em voz
//     alta é argumento comercial, não fraqueza.
//
// Carregada DEPOIS de app-vsm.js. Não altera o arquivo original: acrescenta
// uma aba em VSM.abas() e uma view no dispatcher VSM.pintar().
// ============================================================================

(function () {
  if (typeof VSM === 'undefined') return; // sem o painel base não há o que estender

  // módulos que a ONDA LIVRO acrescentou ao catálogo (repo.js MODULOS)
  const MODULOS_NOVOS = [
    ['crm', 'CRM de leads, hóspedes e proprietários', 'Cap. 23'],
    ['mensagens', 'Régua de mensagens e manual do hóspede', 'Caps. 31 e 34'],
    ['reputacao', 'Avaliações e diagnóstico de reputação', 'Cap. 29'],
    ['proprietarios', 'Proprietários e prestação de contas', 'Cap. 12'],
    ['governanca', 'Governança, permissões e auditoria', 'Cap. 8'],
  ];

  // Mapa capítulo → entrega. `tela` é a aba do painel do assinante.
  const MAPA = [
    { parte: 'II — Arquitetura da operação', itens: [
      { cap: 'Cap. 6', titulo: 'Cadastro mestre da unidade', tela: '🗂️ Cadastro mestre', modulo: 'imoveis',
        entrega: 'Capacidade confortável × máxima, o que a casa NÃO tem, tempo REAL de preparação, janela mínima, particularidades de acesso, tarifa mínima. A régua, a escala e o manual saem daqui.' },
      { cap: 'Cap. 7 + Apêndice E', titulo: 'POPs e checklists', tela: '📘 Livro e checklists', modulo: '(todos)',
        entrega: 'Os onze checklists do livro já dentro do sistema, editáveis: onboarding, fotografia, anúncio, limpeza, inspeção, preventiva, check-in, check-out, inventário, segurança e fechamento.' },
      { cap: 'Cap. 8', titulo: 'Governança da informação', tela: '🔐 Governança', modulo: 'governanca',
        entrega: 'Matriz de permissões com agentes mais estreitos que pessoas (validado pelo sistema), as sete decisões humanas obrigatórias, a lista do que a máquina PODE fazer sozinha, e trilha de auditoria com antes/depois/quem/quando.' },
    ] },
    { parte: 'III — Imóveis e portfólio', itens: [
      { cap: 'Cap. 12', titulo: 'Proprietários e prestação de contas', tela: '🏛️ Proprietários', modulo: 'proprietarios',
        entrega: 'Contrato (remuneração, base bruto/líquido, fundo de manutenção, limite de autonomia), relatório mensal nos quatro blocos e portal do proprietário por link — compartimentado por arquitetura: cada um só alcança as unidades dele.' },
    ] },
    { parte: 'IV — Distribuição', itens: [
      { cap: 'Caps. 13 e 20', titulo: 'Interligações e anti-overbooking', tela: '🗂️ Cadastro mestre', modulo: 'imoveis',
        entrega: 'Interligação declarada e aplicada nas DUAS direções: ocupar a casa inteira bloqueia os quartos e vice-versa. A trava roda na criação da reserva, não num relatório.' },
      { cap: 'Cap. 20', titulo: 'Auditoria diária de sincronização', tela: '🔎 Auditoria de canais', modulo: 'canais',
        entrega: 'Compara o sistema com o channel manager, confere as interligações nas duas direções, acha reserva não propagada e bloqueio expirado — e FALHA ALTO: fonte ilegível vira relatório PARCIAL, nunca "tudo certo".' },
    ] },
    { parte: 'V — Preços, receitas e vendas', itens: [
      { cap: 'Cap. 21', titulo: 'Datas especiais e revisão semanal', tela: '📈 Datas e revenue', modulo: 'precificacao',
        entrega: 'Calendário de datas especiais com tarifa, estadia mínima e data-limite de revisão; revisão semanal que aponta o que enche cedo demais, o que está lento e os buracos de calendário. Publicação continua humana — e o sistema recusa proposta abaixo da tarifa mínima.' },
      { cap: 'Cap. 22 + Apêndice F', titulo: 'Os seis indicadores', tela: '📊 Indicadores', modulo: 'relatorios',
        entrega: 'Ocupação, ADR, RevPAR, receita líquida, margem e nota — por espaço físico (interligados contam uma vez) e contra o MESMO mês do ano anterior. Toda tela declara a convenção que usa. Dicionário de métricas embutido.' },
      { cap: 'Cap. 23', titulo: 'CRM de verdade', tela: '🤝 CRM', modulo: 'crm',
        entrega: 'Três públicos separados, funil de cinco estágios, próxima ação COM DATA obrigatória, motivo de perda em categoria fechada, e a pauta semanal — incluindo o cruzamento entre data liberada por cancelamento e quem consultou aquele período.' },
      { cap: 'Caps. 24 e 25', titulo: 'Qualificação, documentação e risco', tela: '🛡️ Documentação e risco', modulo: 'reservas',
        entrega: 'Política de documentação por faixa de valor, conferência das nove etapas ("NÃO REGISTRADO" nunca vira "cumprido"), detecção de evento disfarçado de estadia e sinais de risco sempre em conjunto — sem rotular ninguém.' },
    ] },
    { parte: 'VI/VII — Reputação e jornada do hóspede', itens: [
      { cap: 'Cap. 29', titulo: 'Diagnóstico de reputação', tela: '⭐ Reputação', modulo: 'reputacao',
        entrega: 'Agrupa avaliações por assunto, classifica em físico/processo/expectativa, ordena por impacto (menções × queda de nota) e FECHA O CICLO — com "AMOSTRA INSUFICIENTE" quando o volume não permite concluir.' },
      { cap: 'Caps. 31 e 34', titulo: 'Régua de mensagens', tela: '✉️ Régua de mensagens', modulo: 'mensagens',
        entrega: 'Modelos do Apêndice D em quatro idiomas; a régua sabe o estado da reserva, desvia para CONTATO PESSOAL quando a estadia teve problema e para em FALTA DADO quando o cadastro está incompleto. Nada sai sozinho.' },
      { cap: 'Caps. 31 e 33', titulo: 'Manual digital do hóspede', tela: '📖 Manual do hóspede', modulo: 'hospede',
        entrega: 'Página pública por link (sem login), buscável por assunto, saindo do cadastro mestre. O sistema RECUSA gravar senha ou código de acesso no manual e nos modelos.' },
      { cap: 'Cap. 33', titulo: 'Concierge com escalonamento', tela: '🛎️ Concierge', modulo: 'hospede',
        entrega: 'A verificação de escalonamento roda ANTES da tentativa de resposta; gatilhos por assunto; plantão obrigatório; resposta só das fontes autorizadas, sempre com a fonte declarada; toda triagem registrada.' },
    ] },
    { parte: 'VIII — Operação da propriedade', itens: [
      { cap: 'Cap. 35', titulo: 'Escala com confirmação e liberação', tela: '🧭 Escala do dia', modulo: 'limpeza',
        entrega: 'Faxina, preparação e VIRADA com o cálculo da janela contra o tempo real de preparo (RISCO), unidade SEM RESPONSÁVEL sinalizada, confirmação com evidência e a liberação formal da unidade. Distingue "não confirmado" de "não feito".' },
      { cap: 'Cap. 36', titulo: 'Enxoval, estoque e compras', tela: '🧺 Enxoval e compras', modulo: 'estoque',
        entrega: 'Previsão de consumo a partir do calendário, lista de compras por previsão, consumo atípico SINALIZADO e nunca corrigido em silêncio, enxoval por lote com vida útil e destino da peça aposentada.' },
      { cap: 'Cap. 37', titulo: 'Plano preventivo', tela: '🩺 Preventiva', modulo: 'manutencao',
        entrega: 'Periodicidade por equipamento com data da última execução, janelas SEM HÓSPEDE propostas (considerando interligados), SEM JANELA sinalizado, reincidência com o número na mesa. Não bloqueia calendário nem aciona técnico.' },
      { cap: 'Cap. 38', titulo: 'Qualidade por amostragem', tela: '🧭 Escala do dia', modulo: 'limpeza',
        entrega: 'Sorteio da unidade, inspeção por outra pessoa (o sistema recusa autoinspeção) e classificação do desvio — item que falha em unidades diferentes vira SISTÊMICO: o POP é que precisa de revisão. Nunca ranqueia pessoas.' },
      { cap: 'Cap. 39', titulo: 'Painel do dia e sinal de vida', tela: '☀️ Painel do dia', modulo: 'reservas',
        entrega: 'As cinco perguntas da manhã, com o painel declarado PARCIAL quando alguma fonte não pôde ser lida; heartbeat das rotinas (rotina que parou de reportar é alerta); catálogo de crises com quem decide e o que se faz nas duas primeiras horas.' },
    ] },
    { parte: 'IX/X/XI — Números, direito e sistemas', itens: [
      { cap: 'Cap. 40', titulo: 'DRE por unidade', tela: '🧾 DRE por unidade', modulo: 'financeiro',
        entrega: 'A estrutura exata do livro, com provisões (manutenção, reposição, vacância), rateio de critério estável, caução em conta separada, "a conferir" para lançamento ambíguo e alerta de margem de contribuição negativa.' },
      { cap: 'Caps. 46 a 48', titulo: 'API, webhooks e agentes', tela: '🔌 API e integrações', modulo: '(flag api_publica)',
        entrega: 'Token Bearer para qualquer rota do assinante, webhooks de evento assinados por HMAC e endpoint de heartbeat — é o que permite a um agente ou a uma Tarefa do Windows rodar por fora e reportar aqui.' },
      { cap: 'Caps. 47 e 49', titulo: 'Biblioteca de prompts e roteiro de adoção', tela: '📘 Livro e checklists', modulo: '(todos)',
        entrega: 'Os prompts publicados no livro, prontos para copiar, com a trava que os torna seguros; e o roteiro de adoção em três níveis do Cap. 49 — inclusive a lista do que NÃO construir.' },
    ] },
  ];

  const NAO_FAZ = [
    ['PMS e channel manager', 'São produtos maduros com integrações que levam anos. O Stay Manager se conecta à Stays.net em vez de refazê-la — e é por isso que quem contrata precisa ter conta lá.'],
    ['Meio de pagamento', 'Provedor certificado, sempre. O sistema nunca guarda dado de cartão.'],
    ['Publicar preço em canal', 'A recomendação é automática; a publicação é humana. Um preço errado é vendido em minutos e não se desfaz.'],
    ['Enviar mensagem sozinho', 'A régua prepara e a fila espera conferência. A exceção são as transacionais de texto fixo já aprovado — e mesmo elas param quando a estadia teve problema.'],
    ['Enviar dado de acesso', 'Senha de fechadura e código de portão não entram em cadastro, manual nem mensagem. O envio é manual, no dia.'],
    ['Corrigir divergência de calendário', 'A auditoria detecta e classifica. Decidir qual hóspede é realocado é humano, sempre.'],
  ];

  // ------------------------------------------------------- aba nova
  const abasOriginal = VSM.abas.bind(VSM);
  VSM.abas = function () { return abasOriginal().concat([['livro', '📘 Livro & sistema']]); };

  const pintarOriginal = VSM.pintar.bind(VSM);
  VSM.pintar = async function () {
    if (VSM.tab !== 'livro') return pintarOriginal();
    try { await VSM.vLivro(); }
    catch (e) { VSM.body().innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  };

  VSM.vLivro = async function () {
    const [{ planos }, { tenants }] = await Promise.all([VSM.api('GET', '/planos'), VSM.api('GET', '/tenants')]);
    const vivos = (tenants || []).filter(t => ['trial', 'ativa'].includes(t.status));
    // Tenants.listar devolve plano_nome (não o slug) — casamos por nome.
    const planoPorNome = {};
    for (const p of planos) planoPorNome[p.nome] = p;

    // cobertura: em quais planos cada módulo novo está
    const cobertura = MODULOS_NOVOS.map(([chave, nome, cap]) => {
      const nos = planos.filter(p => (p.modulos || []).includes(chave)).map(p => p.nome);
      const ops = vivos.filter(t => {
        const p = planoPorNome[t.plano_nome];
        return p && (p.modulos || []).includes(chave);
      }).length;
      return { chave, nome, cap, planos: nos, operacoes: ops };
    });

    const mapa = MAPA.map(bloco => `
      <div class="card">
        <h3>${esc(bloco.parte)}</h3>
        ${tabela(['Capítulo', 'O que o livro ensina', 'O que o sistema entrega', 'Onde', 'Módulo'],
          bloco.itens.map(i => [
            `<b>${esc(i.cap)}</b>`, esc(i.titulo), `<span class="sub">${esc(i.entrega)}</span>`,
            VSM.chip(i.tela), VSM.chip(i.modulo),
          ]))}
      </div>`).join('');

    VSM.body().innerHTML = `
      <div class="card">
        <h3>📘 O livro e o sistema se explicam um ao outro</h3>
        <p>"Claude AI na Prática para Hospedagens" ensina a operação; o <b>Villela Stay Manager</b> é a operação
        implementada. Cada tela do painel do assinante cita o capítulo que a justifica, e cada capítulo tem
        uma tela correspondente. Quem lê o livro entende por que o sistema é assim; quem assina o sistema
        recebe o livro já executando.</p>
        <p class="sub">Esta aba é o roteiro de venda: use o mapa abaixo para responder, capítulo por capítulo,
        "o livro ensina isso — o sistema faz isso?".</p>
      </div>

      <div class="card">
        <h3>Módulos que a ONDA LIVRO acrescentou</h3>
        ${tabela(['Módulo', 'Capítulo', 'Nos planos', 'Operações vivas com acesso'],
          cobertura.map(c => [VSM.chip(c.chave), esc(c.cap), esc(c.planos.join(' · ') || '—'), String(c.operacoes)]))}
        <p class="sub">A distribuição segue o Cap. 49: o <b>Nível 1</b> (o que roda todo dia — painel do dia,
        auditoria, escala com confirmação, régua) entra já no Starter; o <b>Nível 2</b> (CRM, indicadores,
        DRE, reputação, governança) no Pro; o <b>Nível 3</b> (portal do proprietário) no Business.</p>
      </div>

      ${mapa}

      <div class="card">
        <h3>O que o sistema NÃO faz — de propósito</h3>
        ${tabela(['Não faz', 'Por quê'], NAO_FAZ.map(x => [`<b>${esc(x[0])}</b>`, `<span class="sub">${esc(x[1])}</span>`]))}
        <p class="sub">Dizer isso em voz alta é argumento comercial. A regra do Cap. 49 é: produto maduro para
        o que é padrão de mercado, construção própria para a camada que é sua.</p>
      </div>

      <div class="card">
        <h3>Ganchos comerciais</h3>
        <p><b>Do livro para o sistema:</b> ao fim de cada capítulo o leitor sabe exatamente o que precisa
        montar. O roteiro de adoção do Cap. 49 está dentro do painel, com um botão que leva à tela pronta —
        é a diferença entre "eu deveria construir isso" e "isso já está funcionando".</p>
        <p><b>Do sistema para o livro:</b> cada tela cita o capítulo. O assinante que quer entender a regra
        atrás da trava tem para onde ir — e o livro é o material de treinamento da equipe dele.</p>
        <p class="sub">Livraria: <a href="https://livros.villelastay.com.br" target="_blank" rel="noopener">livros.villelastay.com.br</a>
        · Landing do produto: <a href="/gestao" target="_blank" rel="noopener">/gestao</a></p>
      </div>`;
  };
})();
