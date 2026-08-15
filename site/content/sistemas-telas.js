// =====================================================================
// Maquetes das telas dos sistemas — a "prova visual" da /sistemas.html
// =====================================================================
// Cada função devolve o HTML de uma tela do painel do produto, desenhada
// com os MESMOS tokens do design system real dos painéis
// (backend/assets/brand/villela-ui.css): navy #1B2A4A, borda #E2E6EC,
// gelo #F4F6F9, Inter na interface e Lora nos títulos, e o acento vindo
// da vertical (crm #B0185A, legal #14532D, docs #1D4ED8...).
//
// POR QUE MAQUETE E NÃO CAPTURA DE TELA (decisão do Augusto, 15/08/2026):
//   1. Painel real tem nome de hóspede e de cliente — captura publicada
//      seria vazamento de dado pessoal (LGPD). Aqui todo dado é inventado.
//   2. Captura vira imagem borrada em tela retina e pesa centenas de KB;
//      isto é HTML e fica nítido em qualquer densidade, por alguns KB.
//   3. Captura envelhece calada quando o produto muda de cara. Isto é
//      código, e mora ao lado do produto.
//   4. E, principalmente: dá para ANIMAR. A demonstração do topo da
//      página é esta mesma maquete, operada por um cursor de mentira.
//
// TODO dado aqui é FICTÍCIO. Empresa, valor, processo e documento são
// inventados de propósito. Nunca substituir por dado real de cliente.
//
// Cada função recebe `t(pt, en, es)` do build (o site é gerado 3×).
// =====================================================================
'use strict';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --------------------------------------------------------------- peças
// Barra do navegador. Não é enfeite: ancora a maquete como "isto é uma
// tela de sistema no navegador", e mostra o endereço real do produto.
const chrome = (endereco, rotulo) => `
<div class="mq-chrome" aria-hidden="true">
  <span class="mq-bolas"><i></i><i></i><i></i></span>
  <span class="mq-url">🔒 ${esc(endereco)}</span>
  <span class="mq-chrome-tag">${esc(rotulo)}</span>
</div>`;

// Barra lateral do painel. Os rótulos são os módulos REAIS de cada
// produto (catálogo MODULOS em cada repo.js) — não invento de marketing.
const nav = (marca, itens) => `
<nav class="mq-nav" aria-hidden="true">
  <div class="mq-marca"><span class="mq-marca-v">V</span>${esc(marca)}</div>
  ${itens.map(([ico, rot, on]) =>
    `<span class="mq-nav-item${on ? ' on' : ''}"><i>${ico}</i>${esc(rot)}</span>`).join('')}
</nav>`;

// Faixa de indicadores no topo da área de conteúdo.
// ATENÇÃO ao `val`: ele é inserido como HTML, sem escapar, porque a
// demonstração do CRM precisa envolver o número num <span> com os ganchos
// da animação (data-para). Escapando, a tela mostrava a marcação como
// texto — o indicador aparecia literalmente como `<span class="js-mrr"...`.
// Todo valor aqui é escrito neste arquivo; nada vem de fora. Se um dia
// vier, escape na origem.
const kpis = lista => `
<div class="mq-kpis">${lista.map(([rot, val, delta, dir]) => `
  <div class="mq-kpi"><span class="mq-kpi-rot">${esc(rot)}</span>
    <b class="mq-kpi-val">${val}</b>
    ${delta ? `<span class="mq-delta ${dir || 'up'}">${esc(delta)}</span>` : ''}</div>`).join('')}
</div>`;

const cabeca = (titulo, acao) => `
<div class="mq-cabeca"><h4>${esc(titulo)}</h4>${acao ? `<span class="mq-btn">${esc(acao)}</span>` : ''}</div>`;

// =====================================================================
// CRM — Kanban do funil. É a maquete que a demonstração do topo anima:
// o cursor de mentira arrasta o negócio de "Proposta" para "Ganho".
// Os ids/classes marcados com "js-" são os ganchos da animação — mexer
// neles sem mexer no CSS quebra a demonstração, não a maquete.
// =====================================================================
function crm(t) {
  // `valor` (o contador da coluna) entra como HTML pelo mesmo motivo do
  // helper kpis(): "Proposta" e "Ganho" precisam do <span data-para> que a
  // animação usa para trocar o número quando o cartão pousa.
  const col = (titulo, valor, cartoes, extraClasse) => `
  <div class="mq-col ${extraClasse || ''}">
    <div class="mq-col-topo"><b>${esc(titulo)}</b><span>${valor}</span></div>
    ${cartoes}
  </div>`;

  const cartao = (empresa, valor, nota, etiqueta, classe) => `
  <div class="mq-cartao ${classe || ''}">
    <b>${esc(empresa)}</b>
    <div class="mq-cartao-linha"><span class="mq-valor">${esc(valor)}</span>
      <span class="mq-score s${nota >= 80 ? '3' : nota >= 50 ? '2' : '1'}">${nota}</span></div>
    <span class="mq-etiqueta">${esc(etiqueta)}</span>
  </div>`;

  return chrome('crm.villelastay.com.br/crm/app', t('Painel do assinante', 'Subscriber panel', 'Panel del suscriptor')) + `
<div class="mq-corpo">
  ${nav('CRM', [
    ['📊', t('Dashboard', 'Dashboard', 'Panel')],
    ['📋', t('Kanban', 'Kanban', 'Kanban'), true],
    ['👥', t('Contatos', 'Contacts', 'Contactos')],
    ['📄', t('Propostas', 'Proposals', 'Propuestas')],
    ['⏰', t('Tarefas', 'Tasks', 'Tareas')],
    ['💬', t('Templates', 'Templates', 'Plantillas')],
    ['📣', t('Campanhas', 'Campaigns', 'Campañas')],
    ['🤖', t('Agentes de IA', 'AI agents', 'Agentes de IA')]
  ])}
  <div class="mq-tela">
    ${cabeca(t('Funil comercial', 'Sales pipeline', 'Embudo comercial'), t('+ Novo negócio', '+ New deal', '+ Nuevo negocio'))}
    ${kpis([
      [t('Em aberto', 'Open', 'Abierto'), 'R$ 96.400', '', ''],
      [t('Ganho no mês', 'Won this month', 'Ganado en el mes'), '<span class="js-mrr" data-de="R$ 31.600" data-para="R$ 56.400">R$ 31.600</span>', '+18%', 'up'],
      [t('Precisa de ação hoje', 'Needs action today', 'Necesita acción hoy'), '<span class="js-acao" data-de="7" data-para="6">7</span>', '', '']
    ])}
    <div class="mq-kanban">
      ${col(t('Novo', 'New', 'Nuevo'), '4',
        cartao('Padaria Bourbon', 'R$ 4.900', 41, t('Instagram', 'Instagram', 'Instagram')) +
        cartao('Instituto Aurora', 'R$ 12.300', 55, t('Indicação', 'Referral', 'Referencia')))}
      ${col(t('Contato feito', 'Contacted', 'Contactado'), '3',
        cartao('Atelier Pinheiro', 'R$ 8.700', 62, t('WhatsApp', 'WhatsApp', 'WhatsApp')))}
      ${col(t('Proposta', 'Proposal', 'Propuesta'), '<span class="js-cont-prop" data-para="1">2</span>',
        `<div class="js-arrasta">${cartao('Construtora Meridiano', 'R$ 24.800', 88, t('Proposta aberta há 2 h', 'Proposal opened 2 h ago', 'Propuesta abierta hace 2 h'), 'destaque')}</div>` +
        cartao('Café Ateliê', 'R$ 6.150', 71, t('Aguardando retorno', 'Awaiting reply', 'Esperando respuesta')), 'js-col-origem')}
      ${col(t('Ganho', 'Won', 'Ganado'), '<span class="js-cont-ganho" data-para="6">5</span>',
        `<div class="js-alvo"></div>` + cartao('Ótica Vitral', 'R$ 9.400', 94, t('Fechado ontem', 'Closed yesterday', 'Cerrado ayer')), 'js-col-destino ganho')}
    </div>
    <div class="mq-toast js-toast" role="status">✅ ${esc(t('Proposta aceita pelo cliente · tarefa de pós-venda criada', 'Proposal accepted by the client · after-sales task created', 'Propuesta aceptada por el cliente · tarea de posventa creada'))}</div>
    <span class="mq-cursor js-cursor" aria-hidden="true"></span>
  </div>
</div>`;
}

// =====================================================================
// Stay Manager — calendário unificado. A tela que responde à pergunta
// "e o overbooking?": as barras de canais diferentes na mesma régua.
// =====================================================================
function manager(t) {
  const dias = 14;
  const regua = Array.from({ length: dias }, (_, i) => `<span>${i + 12}</span>`).join('');
  // [unidade, [inicio, duração, canal, hóspede]...]
  const linhas = [
    [t('Casa do Jardim', 'Garden House', 'Casa del Jardín'), [[0, 4, 'ab', 'Airbnb'], [6, 5, 'dir', t('Direto', 'Direct', 'Directo')]]],
    [t('Casa da Piscina', 'Pool House', 'Casa de la Piscina'), [[2, 6, 'bk', 'Booking'], [9, 4, 'ab', 'Airbnb']]],
    [t('Flat 1', 'Flat 1', 'Flat 1'), [[0, 3, 'dir', t('Direto', 'Direct', 'Directo')], [4, 3, 'bk', 'Booking'], [8, 5, 'ab', 'Airbnb']]],
    [t('Flat 2', 'Flat 2', 'Flat 2'), [[1, 8, 'ab', 'Airbnb']]],
    [t('Suíte Master', 'Master Suite', 'Suite Máster'), [[3, 2, 'bk', 'Booking'], [7, 6, 'dir', t('Direto', 'Direct', 'Directo')]]]
  ];
  const barras = ocupacoes => ocupacoes.map(([ini, dur, canal, rot]) =>
    `<span class="mq-barra ${canal}" style="left:${(ini / dias * 100).toFixed(2)}%;width:${(dur / dias * 100).toFixed(2)}%">${esc(rot)}</span>`).join('');

  return chrome('manager.villelastay.com.br/gestao/app', t('Painel do assinante', 'Subscriber panel', 'Panel del suscriptor')) + `
<div class="mq-corpo">
  ${nav('STAY', [
    ['🏠', t('Imóveis', 'Properties', 'Inmuebles')],
    ['📅', t('Reservas', 'Bookings', 'Reservas'), true],
    ['🔗', t('Canais / OTAs', 'Channels / OTAs', 'Canales / OTAs')],
    ['🧹', t('Limpeza', 'Cleaning', 'Limpieza')],
    ['🔧', t('Manutenção', 'Maintenance', 'Mantenimiento')],
    ['💰', t('Financeiro', 'Finance', 'Finanzas')],
    ['📈', t('Precificação', 'Pricing', 'Precios')],
    ['📊', t('Relatórios', 'Reports', 'Informes')]
  ])}
  <div class="mq-tela">
    ${cabeca(t('Calendário unificado', 'Unified calendar', 'Calendario unificado'), t('Agosto', 'August', 'Agosto'))}
    ${kpis([
      [t('Ocupação', 'Occupancy', 'Ocupación'), '87%', '+9 p.p.', 'up'],
      [t('Diária média', 'Average nightly rate', 'Tarifa media'), 'R$ 742', '+4%', 'up'],
      [t('Conflitos de calendário', 'Calendar conflicts', 'Conflictos de calendario'), '0', '', '']
    ])}
    <div class="mq-cal">
      <div class="mq-cal-regua"><span class="mq-cal-rot"></span><div class="mq-cal-dias">${regua}</div></div>
      ${linhas.map(([unidade, oc]) => `
      <div class="mq-cal-linha"><span class="mq-cal-rot">${esc(unidade)}</span>
        <div class="mq-cal-faixa">${barras(oc)}</div></div>`).join('')}
    </div>
    <div class="mq-legenda">
      <span><i class="p ab"></i>Airbnb</span><span><i class="p bk"></i>Booking</span>
      <span><i class="p dir"></i>${esc(t('Reserva direta', 'Direct booking', 'Reserva directa'))}</span>
      <span class="mq-nota">🛡️ ${esc(t('Casas interligadas bloqueiam-se entre si automaticamente', 'Interconnected houses block each other automatically', 'Las casas interconectadas se bloquean entre sí automáticamente'))}</span>
    </div>
  </div>
</div>`;
}

// =====================================================================
// Legal — painel de prazos. O argumento do produto é a validação humana
// obrigatória, então a maquete mostra o prazo AGUARDANDO validação.
// =====================================================================
function legal(t) {
  const linha = (processo, tribunal, ato, prazo, dias, estado) => `
  <tr class="${estado}">
    <td><b>${esc(processo)}</b><span class="mq-sub">${esc(tribunal)}</span></td>
    <td>${esc(ato)}</td>
    <td><b>${esc(prazo)}</b><span class="mq-sub">${esc(dias)}</span></td>
    <td>${estado === 'urgente'
      ? `<span class="mq-chip alerta">⚠ ${esc(t('Aguarda validação', 'Awaiting validation', 'Espera validación'))}</span>`
      : `<span class="mq-chip ok">✓ ${esc(t('Validado', 'Validated', 'Validado'))}</span>`}</td>
  </tr>`;

  return chrome('juridico.villelastay.com.br/juridico/app', t('Painel do escritório', 'Firm panel', 'Panel del despacho')) + `
<div class="mq-corpo">
  ${nav('LEGAL', [
    ['⚖️', t('Processos', 'Cases', 'Procesos')],
    ['⏳', t('Prazos', 'Deadlines', 'Plazos'), true],
    ['📰', t('Publicações', 'Publications', 'Publicaciones')],
    ['🏛️', t('Audiências', 'Hearings', 'Audiencias')],
    ['🤖', t('IA jurídica', 'Legal AI', 'IA jurídica')],
    ['📑', t('Peças', 'Filings', 'Escritos')],
    ['👥', t('Portal do cliente', 'Client portal', 'Portal del cliente')],
    ['🎛️', t('Controladoria', 'Controls', 'Controladuría')]
  ])}
  <div class="mq-tela">
    ${cabeca(t('Prazos em curso', 'Deadlines in progress', 'Plazos en curso'), t('Coleta DJEN: hoje 06:00', 'DJEN collection: today 6 AM', 'Recogida DJEN: hoy 06:00'))}
    ${kpis([
      [t('Prazos nos próximos 7 dias', 'Deadlines in the next 7 days', 'Plazos en los próximos 7 días'), '11', '', ''],
      [t('Sem validação humana', 'Without human validation', 'Sin validación humana'), '2', t('agir', 'act', 'actuar'), 'alerta'],
      [t('Publicações captadas hoje', 'Publications captured today', 'Publicaciones captadas hoy'), '9', '', '']
    ])}
    <table class="mq-tabela">
      <thead><tr>
        <th>${esc(t('Processo', 'Case', 'Proceso'))}</th><th>${esc(t('Ato', 'Act', 'Acto'))}</th>
        <th>${esc(t('Prazo (CPC)', 'Deadline (Civil Procedure Code)', 'Plazo (CPC)'))}</th><th>${esc(t('Situação', 'Status', 'Situación'))}</th>
      </tr></thead>
      <tbody>
        ${linha('0708xxx-21.2026.8.07.0001', 'TJDFT · 3ª Vara Cível', t('Contestação', 'Defence', 'Contestación'), '02/09', t('15 dias úteis', '15 business days', '15 días hábiles'), 'urgente')}
        ${linha('1002xxx-45.2026.4.01.3400', 'TRF1 · 9ª Vara', t('Réplica', 'Reply', 'Réplica'), '28/08', t('10 dias úteis', '10 business days', '10 días hábiles'), '')}
        ${linha('0711xxx-08.2026.8.07.0007', 'TJDFT · Juizado', t('Recurso inominado', 'Appeal', 'Recurso'), '25/08', t('10 dias úteis', '10 business days', '10 días hábiles'), '')}
      </tbody>
    </table>
    <div class="mq-aviso">
      <b>🛡️ ${esc(t('Controladoria independente', 'Independent controls', 'Controladuría independiente'))}</b>
      ${esc(t('O prazo só passa a valer depois que um humano valida o cálculo. Coleta que volta vazia gera alerta — coleta vazia costuma ser falha, não silêncio.', 'A deadline only takes effect after a human validates the calculation. An empty collection raises an alert — an empty collection is usually a failure, not silence.', 'El plazo solo vale después de que un humano valide el cálculo. Una recogida vacía genera alerta — suele ser un fallo, no silencio.'))}
    </div>
  </div>
</div>`;
}

// =====================================================================
// Docs — pergunta em linguagem natural e resposta COM as fontes.
// A tela inteira existe para mostrar os chips de fonte embaixo da
// resposta: é o que separa esta IA de uma em que você só pode acreditar.
// =====================================================================
function docs(t) {
  return chrome('docs.villelastay.com.br/vdocs/app', t('Painel da empresa', 'Company panel', 'Panel de la empresa')) + `
<div class="mq-corpo">
  ${nav('DOCS', [
    ['🗂️', t('Documentos', 'Documents', 'Documentos')],
    ['🔎', t('Busca', 'Search', 'Búsqueda')],
    ['🤖', t('Perguntar à IA', 'Ask the AI', 'Preguntar a la IA'), true],
    ['✅', t('Aprovações', 'Approvals', 'Aprobaciones')],
    ['🕘', t('Versões', 'Versions', 'Versiones')],
    ['📜', t('Auditoria', 'Audit trail', 'Auditoría')],
    ['⏱️', t('Retenção', 'Retention', 'Retención')]
  ])}
  <div class="mq-tela">
    ${cabeca(t('Perguntar aos documentos', 'Ask your documents', 'Preguntar a los documentos'), '')}
    <div class="mq-busca">💬 ${esc(t('Quais contratos vencem nos próximos 60 dias e quais têm renovação automática?', 'Which contracts expire in the next 60 days and which renew automatically?', '¿Qué contratos vencen en los próximos 60 días y cuáles se renuevan automáticamente?'))}</div>
    <div class="mq-resposta">
      <p><b>${esc(t('Três contratos vencem até 14/10.', 'Three contracts expire by 14 October.', 'Tres contratos vencen hasta el 14/10.'))}</b>
      ${esc(t('Dois deles têm renovação automática por mais 12 meses se não houver denúncia com 30 dias de antecedência — ou seja, a decisão de renovar precisa sair até 14/09. O terceiro exige assinatura de aditivo.', 'Two of them renew automatically for another 12 months unless notice is given 30 days in advance — meaning the renewal decision must be made by 14 September. The third requires a signed amendment.', 'Dos de ellos se renuevan automáticamente por 12 meses más si no hay denuncia con 30 días de antelación — es decir, la decisión de renovar debe salir hasta el 14/09. El tercero exige firma de adenda.'))}</p>
      <div class="mq-fontes">
        <span class="mq-fonte">[1] 📄 ${esc(t('Contrato de Fornecimento — Cláusula 12.2, p. 7', 'Supply Agreement — Clause 12.2, p. 7', 'Contrato de Suministro — Cláusula 12.2, p. 7'))}</span>
        <span class="mq-fonte">[2] 📄 ${esc(t('Contrato de Manutenção — Cláusula 9.1, p. 4', 'Maintenance Agreement — Clause 9.1, p. 4', 'Contrato de Mantenimiento — Cláusula 9.1, p. 4'))}</span>
        <span class="mq-fonte">[3] 📄 ${esc(t('Aditivo 02 — p. 2', 'Amendment 02 — p. 2', 'Adenda 02 — p. 2'))}</span>
      </div>
      <span class="mq-nota">↑ ${esc(t('Toda resposta aponta documento e página. Um clique abre o trecho.', 'Every answer points at document and page. One click opens the passage.', 'Cada respuesta señala documento y página. Un clic abre el pasaje.'))}</span>
    </div>
    <table class="mq-tabela compacta">
      <tbody>
        <tr><td>📄 <b>${esc(t('Contrato de Fornecimento', 'Supply Agreement', 'Contrato de Suministro'))}</b></td>
            <td><span class="mq-chip">v4 ${esc(t('vigente', 'in force', 'vigente'))}</span></td>
            <td><span class="mq-chip alerta">${esc(t('Vence em 27 dias', 'Expires in 27 days', 'Vence en 27 días'))}</span></td></tr>
        <tr><td>📄 <b>${esc(t('Contrato de Manutenção', 'Maintenance Agreement', 'Contrato de Mantenimiento'))}</b></td>
            <td><span class="mq-chip">v2 ${esc(t('vigente', 'in force', 'vigente'))}</span></td>
            <td><span class="mq-chip alerta">${esc(t('Vence em 51 dias', 'Expires in 51 days', 'Vence en 51 días'))}</span></td></tr>
        <tr><td>📄 <b>${esc(t('Política de Privacidade interna', 'Internal Privacy Policy', 'Política de Privacidad interna'))}</b></td>
            <td><span class="mq-chip">v7 ${esc(t('vigente', 'in force', 'vigente'))}</span></td>
            <td><span class="mq-chip ok">${esc(t('Aprovada', 'Approved', 'Aprobada'))}</span></td></tr>
      </tbody>
    </table>
  </div>
</div>`;
}

// =====================================================================
// Projects — o portfólio, que é a tese do produto: decidir antes de fazer.
// =====================================================================
function projects(t) {
  const ideia = (nome, estagio, viab, inv, rec, classe) => `
  <div class="mq-ideia ${classe || ''}">
    <div class="mq-ideia-topo"><b>${esc(nome)}</b><span class="mq-chip">${esc(estagio)}</span></div>
    <div class="mq-medidor"><span style="width:${viab}%"></span></div>
    <span class="mq-sub">${esc(t('Viabilidade', 'Feasibility', 'Viabilidad'))} ${viab}% · ${esc(t('Investimento', 'Investment', 'Inversión'))} ${esc(inv)} · ${esc(t('Receita potencial', 'Potential revenue', 'Ingreso potencial'))} ${esc(rec)}</span>
  </div>`;

  return chrome('projetos.villelastay.com.br/vpe/app', t('Painel da empresa', 'Company panel', 'Panel de la empresa')) + `
<div class="mq-corpo">
  ${nav('PROJ', [
    ['💡', t('Portfólio', 'Portfolio', 'Portafolio'), true],
    ['📋', t('Projetos', 'Projects', 'Proyectos')],
    ['🎪', t('Eventos', 'Events', 'Eventos')],
    ['🤝', t('Comercial', 'Sales', 'Comercial')],
    ['💰', t('Financeiro', 'Finance', 'Finanzas')],
    ['⚙️', t('Automações', 'Automations', 'Automatizaciones')],
    ['📊', t('Relatórios', 'Reports', 'Informes')]
  ])}
  <div class="mq-tela">
    ${cabeca(t('Portfólio — o que executar agora', 'Portfolio — what to execute now', 'Portafolio — qué ejecutar ahora'), t('+ Nova ideia', '+ New idea', '+ Nueva idea'))}
    ${kpis([
      [t('Ideias no funil', 'Ideas in the funnel', 'Ideas en el embudo'), '18', '', ''],
      [t('Em execução', 'In execution', 'En ejecución'), '5', '', ''],
      [t('Margem média', 'Average margin', 'Margen medio'), '34%', '+6 p.p.', 'up']
    ])}
    <div class="mq-portfolio">
      ${ideia(t('Expansão — 2 casas no Lago Norte', 'Expansion — 2 houses in Lago Norte', 'Expansión — 2 casas en Lago Norte'), t('Viabilidade', 'Feasibility', 'Viabilidad'), 82, 'R$ 180 mil', 'R$ 46 mil/' + t('mês', 'mo', 'mes'), 'boa')}
      ${ideia(t('Pacote corporativo de fim de ano', 'Year-end corporate package', 'Paquete corporativo de fin de año'), t('Plano', 'Plan', 'Plan'), 74, 'R$ 12 mil', 'R$ 88 mil', 'boa')}
      ${ideia(t('Cozinha industrial para eventos', 'Industrial kitchen for events', 'Cocina industrial para eventos'), t('Ideia', 'Idea', 'Idea'), 38, 'R$ 240 mil', t('a estimar', 'to be estimated', 'a estimar'), 'fraca')}
    </div>
    <div class="mq-aviso">
      <b>💡 ${esc(t('Portfólio antes de tarefa', 'Portfolio before tasks', 'Portafolio antes que tarea'))}</b>
      ${esc(t('A terceira ideia é boa e mesmo assim não entra: investimento alto e receita ainda por estimar. Fica registrada com o motivo — para ser revista, não esquecida.', 'The third idea is good and still does not make the cut: high investment and revenue yet to be estimated. It stays on record with the reason — to be revisited, not forgotten.', 'La tercera idea es buena y aun así no entra: inversión alta e ingreso por estimar. Queda registrada con el motivo — para revisarse, no para olvidarse.'))}
    </div>
  </div>
</div>`;
}

// =====================================================================
// Academy — painel do produtor. O que ele quer ver é venda e comissão.
// =====================================================================
function academy(t) {
  const barras = [38, 52, 44, 67, 71, 59, 84, 92, 78, 96, 88, 100];
  const produto = (nome, tipo, vendas, receita) => `
  <tr><td><b>${esc(nome)}</b><span class="mq-sub">${esc(tipo)}</span></td>
      <td>${esc(vendas)}</td><td><b>${esc(receita)}</b></td></tr>`;

  return chrome('academia.villelastay.com.br/academy/app', t('Painel do produtor', 'Creator panel', 'Panel del productor')) + `
<div class="mq-corpo">
  ${nav('ACAD', [
    ['🎬', t('Meus produtos', 'My products', 'Mis productos'), true],
    ['🎓', t('Alunos', 'Students', 'Alumnos')],
    ['💳', t('Vendas', 'Sales', 'Ventas')],
    ['🤝', t('Afiliados', 'Affiliates', 'Afiliados')],
    ['📜', t('Certificados', 'Certificates', 'Certificados')],
    ['💰', t('Financeiro', 'Finance', 'Finanzas')]
  ])}
  <div class="mq-tela">
    ${cabeca(t('Suas vendas', 'Your sales', 'Tus ventas'), t('Últimos 12 meses', 'Last 12 months', 'Últimos 12 meses'))}
    ${kpis([
      [t('Receita no mês', 'Revenue this month', 'Ingresos del mes'), 'R$ 18.740', '+23%', 'up'],
      [t('Taxa da plataforma', 'Platform fee', 'Tarifa de la plataforma'), '8,9% + R$ 1', '', ''],
      [t('Alunos ativos', 'Active students', 'Alumnos activos'), '412', '+37', 'up']
    ])}
    <div class="mq-grafico">${barras.map(h => `<span style="height:${h}%"></span>`).join('')}</div>
    <table class="mq-tabela compacta">
      <thead><tr><th>${esc(t('Produto', 'Product', 'Producto'))}</th><th>${esc(t('Vendas', 'Sales', 'Ventas'))}</th><th>${esc(t('Receita', 'Revenue', 'Ingresos'))}</th></tr></thead>
      <tbody>
        ${produto(t('Curso — Gestão de temporada na prática', 'Course — Short-stay management in practice', 'Curso — Gestión de temporada en la práctica'), t('Curso em vídeo', 'Video course', 'Curso en vídeo'), '128', 'R$ 11.520')}
        ${produto(t('E-book — Precificação para anfitriões', 'E-book — Pricing for hosts', 'E-book — Precios para anfitriones'), 'E-book', '96', 'R$ 3.744')}
        ${produto(t('Mentoria individual', 'One-to-one mentoring', 'Mentoría individual'), t('Mentoria', 'Mentoring', 'Mentoría'), '9', 'R$ 3.476')}
      </tbody>
    </table>
  </div>
</div>`;
}

// =====================================================================
// Alta Vista — não é painel de gestão: é entrega. A tela mostra o
// pacote sendo produzido e o tour já publicado.
// =====================================================================
function altavista(t) {
  const etapa = (nome, estado, rot) => `
  <div class="mq-etapa ${estado}"><span class="mq-etapa-ponto"></span>
    <b>${esc(nome)}</b><span class="mq-sub">${esc(rot)}</span></div>`;

  return chrome('altavista.villelastay.com.br/alta-vista', t('Acompanhamento do projeto', 'Project tracking', 'Seguimiento del proyecto')) + `
<div class="mq-corpo">
  ${nav('AV360', [
    ['🚁', t('Captação', 'Capture', 'Captación'), true],
    ['🎞️', t('Edição', 'Editing', 'Edición')],
    ['🧭', t('Tours', 'Tours', 'Tours')],
    ['📦', t('Entregas', 'Deliveries', 'Entregas')],
    ['📈', t('Visitas do tour', 'Tour visits', 'Visitas del tour')]
  ])}
  <div class="mq-tela">
    ${cabeca(t('Pacote Imóvel Completo — Casa do Jardim', 'Complete Property Package — Garden House', 'Paquete Inmueble Completo — Casa del Jardín'), t('Entrega: 22/08', 'Delivery: 22 Aug', 'Entrega: 22/08'))}
    <div class="mq-etapas">
      ${etapa(t('Filmagem com drone', 'Drone footage', 'Filmación con dron'), 'feita', t('12 tomadas · concluído', '12 shots · done', '12 tomas · concluido'))}
      ${etapa(t('Fotografia 360°', '360° photography', 'Fotografía 360°'), 'feita', t('9 ambientes · concluído', '9 rooms · done', '9 ambientes · concluido'))}
      ${etapa(t('Vídeo com IA', 'AI video', 'Vídeo con IA'), 'fazendo', t('2 peças em produção', '2 pieces in production', '2 piezas en producción'))}
      ${etapa(t('Tour virtual', 'Virtual tour', 'Tour virtual'), 'fila', t('Aguardando o 360°', 'Waiting on the 360°', 'Esperando el 360°'))}
    </div>
    <div class="mq-tour">
      <div class="mq-tour-vista">
        <span class="mq-tour-ponto" style="left:24%;top:58%"></span>
        <span class="mq-tour-ponto" style="left:62%;top:44%"></span>
        <span class="mq-tour-ponto" style="left:81%;top:66%"></span>
        <span class="mq-tour-rot">${esc(t('Sala · arraste para olhar em volta', 'Living room · drag to look around', 'Sala · arrastra para mirar alrededor'))}</span>
      </div>
      <div class="mq-tour-lado">
        <b>${esc(t('Tour publicado', 'Tour published', 'Tour publicado'))}</b>
        <span class="mq-chip ok">✓ ${esc(t('No ar', 'Live', 'En el aire'))}</span>
        <span class="mq-sub">${esc(t('QR Code gerado para placa e folheto', 'QR code generated for signage and flyers', 'Código QR generado para cartel y folleto'))}</span>
        <span class="mq-sub">🔒 ${esc(t('Endereço exato oculto', 'Exact address hidden', 'Dirección exacta oculta'))}</span>
        <span class="mq-sub">📈 ${esc(t('1.284 visitas em 30 dias', '1,284 visits in 30 days', '1.284 visitas en 30 días'))}</span>
      </div>
    </div>
  </div>
</div>`;
}

const TELAS = { crm, manager, legal, docs, projects, academy, altavista };

module.exports = { TELAS };
