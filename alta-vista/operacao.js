// =====================================================================
// Villela Alta Vista 360 — operação e lançamento (Onda 7, a última).
//   · CHECKLISTS por serviço — o de drone trava: a decisão "confirmado"
//     só sai com TODOS os itens de segurança marcados (clima, espaço
//     aéreo, bateria…). Nada aqui automatiza aprovação aeronáutica.
//   · PORTÃO DE PRONTIDÃO (spec §11.2): os 12 itens fixos; "divulgação
//     liberada" só liga com todos ✓ e DESLIGA sozinha se um item cair.
//   · CAPACIDADE semanal: agenda cheia → recomendação de pausar aquisição.
//   · CAMPANHA 90 dias: custos manuais por canal, teto de R$ 1.000/mês
//     vigiado (aviso, não trava — a decisão de gastar é humana).
//   · RELATÓRIOS honestos: tudo calculado do banco, zero número inventado.
// =====================================================================
'use strict';
const { db, nowISO, hojeISO, novoId, j } = require('./db');
const repo = require('./repo');
const { Config, Auditoria, s, n } = repo;

// ---------------------------------------------------------------------
// Checklists por serviço (templates no código; instância no projeto)
// ---------------------------------------------------------------------
const TEMPLATES_CHECKLIST = {
  drone: [
    { id: 'endereco', texto: 'Endereço completo confirmado com o cliente', seguranca: false },
    { id: 'responsavel-local', texto: 'Responsável no local combinado (nome e telefone)', seguranca: false },
    { id: 'autorizacao-imovel', texto: 'Autorização do imóvel/condomínio para o voo', seguranca: true },
    { id: 'equipamento', texto: 'Equipamento conferido (drone, hélices, cartões, filtros)', seguranca: true },
    { id: 'baterias', texto: 'Baterias carregadas (mínimo 2 + controle)', seguranca: true },
    { id: 'clima', texto: 'Previsão do tempo verificada para o horário do voo', seguranca: true },
    { id: 'espaco-aereo', texto: 'Espaço aéreo analisado (DECEA/SARPAS) para o endereço', seguranca: true },
    { id: 'seguro-docs', texto: 'Documentação e seguro do drone em dia (SISANT/ANAC)', seguranca: true },
  ],
  video_ia: [
    { id: 'fotos-recebidas', texto: 'Fotos do cliente recebidas e conferidas (quantidade e qualidade)', seguranca: false },
    { id: 'briefing-lido', texto: 'Briefing lido: objetivo, destaques e restrições anotados', seguranca: false },
    { id: 'formatos', texto: 'Formatos de entrega confirmados (vertical/horizontal/canais)', seguranca: false },
    { id: 'sem-invencao', texto: 'Conferido: a IA não inventou nada que o imóvel não tem; ilustrativo sinalizado', seguranca: false },
  ],
  foto360: [
    { id: 'roteiro-ambientes', texto: 'Roteiro de ambientes combinado com o cliente', seguranca: false },
    { id: 'equipamento-360', texto: 'Câmera 360, tripé e baterias conferidos', seguranca: false },
    { id: 'privacidade', texto: 'Varredura de privacidade: nada pessoal/identificável nos panoramas', seguranca: false },
  ],
  tour: [
    { id: 'panoramas-tratados', texto: 'Panoramas tratados e nomeados por ambiente', seguranca: false },
    { id: 'roteiro-visita', texto: 'Ordem das cenas = roteiro da visita (aprovado internamente)', seguranca: false },
    { id: 'hotspots-testados', texto: 'Hotspots testados na prévia (sem link quebrado)', seguranca: false },
    { id: 'endereco-oculto', texto: 'Conferido: endereço exato NÃO aparece no tour', seguranca: false },
  ],
};

const Checklists = {
  criar(projetoId, categoria, { quem = 'staff' } = {}) {
    const tpl = TEMPLATES_CHECKLIST[categoria];
    if (!tpl) throw new Error('Categoria de checklist inválida. Use: ' + Object.keys(TEMPLATES_CHECKLIST).join(', '));
    if (!db.prepare('SELECT 1 FROM projetos WHERE id = ?').get(s(projetoId, 40))) throw new Error('Projeto não encontrado.');
    if (db.prepare('SELECT 1 FROM projeto_checklists WHERE projeto_id = ? AND categoria = ?').get(s(projetoId, 40), categoria)) {
      throw new Error('Este projeto já tem checklist de ' + categoria + '.');
    }
    const id = novoId();
    const itens = tpl.map((i) => ({ ...i, feito: false, quem: '', em: '' }));
    db.prepare('INSERT INTO projeto_checklists (id, projeto_id, categoria, itens, criado_em) VALUES (?,?,?,?,?)')
      .run(id, s(projetoId, 40), categoria, j.str(itens), nowISO());
    Auditoria.registrar({ quem, acao: 'checklist.criar', entidade: 'projeto_checklists', entidade_id: id, detalhe: categoria });
    return Checklists.obter(id);
  },
  obter(id) {
    const c = db.prepare('SELECT * FROM projeto_checklists WHERE id = ?').get(s(id, 40));
    return c ? { ...c, itens: j.parse(c.itens, []) } : null;
  },
  doProjeto(projetoId) {
    return db.prepare('SELECT * FROM projeto_checklists WHERE projeto_id = ?').all(s(projetoId, 40))
      .map((c) => ({ ...c, itens: j.parse(c.itens, []) }));
  },
  marcarItem(id, itemId, feito, { quem = 'staff' } = {}) {
    const c = Checklists.obter(id);
    if (!c) throw new Error('Checklist não encontrado.');
    const item = c.itens.find((i) => i.id === itemId);
    if (!item) throw new Error('Item não encontrado no checklist.');
    item.feito = !!feito;
    item.quem = feito ? s(quem, 120) : '';
    item.em = feito ? nowISO() : '';
    // desmarcou item de segurança de um voo já confirmado? a confirmação cai junto.
    let decisao = c.decisao;
    if (!feito && item.seguranca && c.decisao === 'confirmado') decisao = '';
    db.prepare('UPDATE projeto_checklists SET itens = ?, decisao = ?, atualizado_em = ? WHERE id = ?')
      .run(j.str(c.itens), decisao, nowISO(), c.id);
    return Checklists.obter(c.id);
  },
  // decisão do drone: confirmar exige TODOS os itens de segurança; reagendar sempre pode
  decidir(id, decisao, { quem = 'staff' } = {}) {
    const c = Checklists.obter(id);
    if (!c) throw new Error('Checklist não encontrado.');
    if (c.categoria !== 'drone') throw new Error('Decisão confirmar/reagendar é do checklist de drone.');
    if (!['confirmado', 'reagendado'].includes(decisao)) throw new Error('Decisão inválida: confirmado ou reagendado.');
    if (decisao === 'confirmado') {
      const pendentes = c.itens.filter((i) => i.seguranca && !i.feito).map((i) => i.texto);
      if (pendentes.length) throw new Error('Não dá para CONFIRMAR o voo com item de segurança pendente: ' + pendentes.join(' · '));
    }
    db.prepare('UPDATE projeto_checklists SET decisao = ?, decisao_quem = ?, decisao_em = ?, atualizado_em = ? WHERE id = ?')
      .run(decisao, s(quem, 120), nowISO(), nowISO(), c.id);
    Auditoria.registrar({ quem, acao: 'checklist.decisao', entidade: 'projeto_checklists', entidade_id: c.id, detalhe: decisao });
    return Checklists.obter(c.id);
  },
};

// ---------------------------------------------------------------------
// Portão de prontidão para mídia paga (spec §11.2 — 12 itens)
// ---------------------------------------------------------------------
const ITENS_PRONTIDAO = [
  { chave: 'equipamentos', texto: 'Equipamentos e autorizações operacionais conferidos' },
  { chave: 'simulacoes', texto: 'Dois serviços completos SIMULADOS do início à entrega' },
  { chave: 'checkout-testado', texto: 'Checkout Pro testado (pagamento de teste real no MP)' },
  { chave: 'documentos', texto: 'Contratos, políticas e consentimentos revisados (advogado OAB)' },
  { chave: 'agenda-limite', texto: 'Agenda e limite semanal de projetos definidos' },
  { chave: 'prazo-medido', texto: 'Prazo REAL de edição medido (não estimado)' },
  { chave: 'responsaveis', texto: 'Responsáveis e substituições definidos' },
  { chave: 'atendimento', texto: 'Atendimento com resposta em até 1 dia útil funcionando' },
  { chave: 'conceituais', texto: 'Projetos conceituais publicados e identificados como tal' },
  { chave: 'formularios', texto: 'Formulário, e-mails e WhatsApp testados de ponta a ponta' },
  { chave: 'cancelamento-clima', texto: 'Processo de cancelamento, clima e restrição aérea pronto' },
  { chave: 'capacidade-minima', texto: 'Capacidade para 2 projetos simultâneos sem atraso comprovada' },
];

const Prontidao = {
  listar() {
    const salvos = new Map(db.prepare('SELECT * FROM prontidao').all().map((r) => [r.chave, r]));
    return ITENS_PRONTIDAO.map((i) => ({ ...i, ...(salvos.get(i.chave) || { feito: 0, quem: '', em: '', nota: '' }) }));
  },
  marcar(chave, { feito, nota = '', quem = 'staff' } = {}) {
    if (!ITENS_PRONTIDAO.some((i) => i.chave === chave)) throw new Error('Item de prontidão desconhecido: ' + chave);
    db.prepare(`INSERT INTO prontidao (chave, feito, quem, em, nota) VALUES (?,?,?,?,?)
      ON CONFLICT(chave) DO UPDATE SET feito = excluded.feito, quem = excluded.quem, em = excluded.em, nota = excluded.nota`)
      .run(chave, feito ? 1 : 0, feito ? s(quem, 120) : '', feito ? nowISO() : '', s(nota, 300));
    // item caiu → a liberação de divulgação cai junto, sozinha (o portão nunca fica verde por inércia)
    if (!feito && Config.num('divulgacao_liberada', 0)) {
      Config.set('divulgacao_liberada', '0');
      Auditoria.registrar({ quem, acao: 'prontidao.revogada', entidade: 'prontidao', entidade_id: chave, detalhe: 'item desmarcado derrubou a liberação' });
    }
    Auditoria.registrar({ quem, acao: 'prontidao.item', entidade: 'prontidao', entidade_id: chave, detalhe: feito ? 'feito' : 'desfeito' });
    return Prontidao.listar();
  },
  apto() { return Prontidao.listar().every((i) => i.feito); },
  pendentes() { return Prontidao.listar().filter((i) => !i.feito).map((i) => i.texto); },
  liberarDivulgacao({ quem = 'staff' } = {}) {
    const pend = Prontidao.pendentes();
    if (pend.length) throw new Error('O portão de prontidão barra a divulgação. Pendências: ' + pend.join(' · '));
    Config.set('divulgacao_liberada', '1');
    Auditoria.registrar({ quem, acao: 'prontidao.liberada', entidade: 'prontidao', entidade_id: '', detalhe: 'mídia paga liberada' });
    return { liberada: true };
  },
};

// ---------------------------------------------------------------------
// Capacidade semanal (agenda cheia → recomendar pausar aquisição)
// ---------------------------------------------------------------------
const STATUS_ATIVOS = ['scheduling', 'production', 'quality_control', 'client_review', 'changes_requested'];
function capacidade() {
  const limite = Config.num('capacidade_semanal', 2);
  const ativos = db.prepare(`SELECT COUNT(*) c FROM projetos WHERE status IN (${STATUS_ATIVOS.map(() => '?').join(',')})`).get(...STATUS_ATIVOS).c;
  return {
    limite, ativos,
    agenda_cheia: ativos >= limite,
    recomendacao: ativos >= limite
      ? 'Agenda no limite: PAUSAR aquisição paga e priorizar Vídeo IA remoto (spec §11.4).'
      : `Folga de ${limite - ativos} projeto(s) na agenda.`,
  };
}

// ---------------------------------------------------------------------
// Campanha de 90 dias (custos manuais; teto vigiado, decisão humana)
// ---------------------------------------------------------------------
const CAMPANHA = {
  nome: 'Primeiros Espaços em Alta',
  mensagem: 'Mostre a experiência da sua hospedagem, não apenas os cômodos.',
  cta: 'Descubra o pacote ideal para o seu espaço.',
  orcamento_mensal_max_centavos: 100000,
  tetos: { google: 60000, meta: 25000, testes: 15000 },
  fases: [
    'Semanas 1–2 — preparação silenciosa: portal no ar, perfis, conceitos, testes internos.',
    'Semanas 3–4 — validação orgânica: contatos selecionados, bastidores, 2 primeiros trabalhos reais.',
    'Semanas 5–8 — aquisição controlada (SÓ com o portão aprovado): até R$ 30/dia (60% Google, 25% Meta, 15% testes).',
    'Semanas 9–12 — otimização: casos autorizados no lugar dos conceitos, parcerias, indicação.',
  ],
};

const CustosMarketing = {
  criar(d, { quem = 'staff' } = {}) {
    const valor = Math.max(0, Math.round(n(d.valor_centavos, 0)));
    if (!valor) throw new Error('Valor do custo é obrigatório (centavos).');
    const canal = ['google', 'meta', 'testes', 'outro'].includes(d.canal) ? d.canal : 'outro';
    const id = novoId();
    db.prepare('INSERT INTO custos_marketing (id, data, canal, valor_centavos, nota, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, s(d.data, 10) || hojeISO(), canal, valor, s(d.nota, 300), nowISO());
    Auditoria.registrar({ quem, acao: 'mkt.custo', entidade: 'custos_marketing', entidade_id: id, detalhe: `${canal} ${valor}` });
    return db.prepare('SELECT * FROM custos_marketing WHERE id = ?').get(id);
  },
  remover(id) { db.prepare('DELETE FROM custos_marketing WHERE id = ?').run(s(id, 40)); },
  painel() {
    const mes = hojeISO().slice(0, 7);
    const porCanal = db.prepare(`SELECT canal, SUM(valor_centavos) v FROM custos_marketing WHERE substr(data,1,7) = ? GROUP BY canal`).all(mes);
    const gastoMes = porCanal.reduce((t, x) => t + x.v, 0);
    const leadsMes = db.prepare("SELECT COUNT(*) c FROM leads WHERE substr(criado_em,1,7) = ?").get(mes).c;
    const ganhosMes = db.prepare("SELECT COUNT(*) c FROM leads WHERE substr(criado_em,1,7) = ? AND status = 'ganho'").get(mes).c;
    return {
      campanha: CAMPANHA,
      divulgacao_liberada: Config.num('divulgacao_liberada', 0) === 1,
      mes, gasto_mes_centavos: gastoMes,
      estourou_teto: gastoMes > CAMPANHA.orcamento_mensal_max_centavos,
      por_canal: porCanal,
      leads_mes: leadsMes, ganhos_mes: ganhosMes,
      custo_por_lead_centavos: leadsMes ? Math.round(gastoMes / leadsMes) : 0,
      lancamentos: db.prepare('SELECT * FROM custos_marketing ORDER BY data DESC LIMIT 200').all(),
    };
  },
};

// ---------------------------------------------------------------------
// Relatórios (spec §9.3) — todos calculados, nenhum inventado
// ---------------------------------------------------------------------
function relatorios() {
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const um = (sql, ...p) => db.prepare(sql).get(...p) || {};

  // tempo de entrega: criado → evento delivered
  const entregues = q(`SELECT p.id, p.criado_em, e.criado_em entregue_em, p.prazo_em
    FROM projetos p JOIN projeto_eventos e ON e.projeto_id = p.id AND e.para = 'delivered'`);
  const dias = entregues.map((x) => (Date.parse(x.entregue_em) - Date.parse(x.criado_em)) / 86400000);
  const tempoMedio = dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length * 10) / 10 : null;
  const atrasados = entregues.filter((x) => x.prazo_em && x.entregue_em.slice(0, 10) > x.prazo_em).length;
  const atrasadosAgora = um(`SELECT COUNT(*) c FROM projetos WHERE prazo_em != '' AND prazo_em < ?
    AND status NOT IN ('delivered','portfolio_consent','completed','archived','cancelled')`, hojeISO()).c;

  const ticket = um("SELECT AVG(total_centavos) v, COUNT(*) c FROM propostas WHERE status = 'aceita'");
  const revisoes = um(`SELECT AVG(n) v FROM (SELECT COUNT(*) n FROM entrega_versoes GROUP BY entrega_id)`);
  const recorrentes = um(`SELECT COUNT(*) c FROM (SELECT cliente_id FROM projetos GROUP BY cliente_id HAVING COUNT(*) > 1)`).c;
  const toursViews = um('SELECT COALESCE(SUM(hits),0) v FROM tour_views').v;

  return {
    aviso: 'Números calculados do banco. Base pequena = leitura com cautela; nada aqui é projeção.',
    entregues_total: entregues.length,
    tempo_medio_entrega_dias: tempoMedio,
    entregues_com_atraso: atrasados,
    atrasados_em_aberto: atrasadosAgora,
    ticket_medio_centavos: ticket.c ? Math.round(ticket.v) : 0,
    propostas_aceitas: ticket.c || 0,
    media_versoes_por_entrega: revisoes.v ? Math.round(revisoes.v * 10) / 10 : null,
    clientes_recorrentes: recorrentes,
    tours_views_total: toursViews,
    capacidade: capacidade(),
    conversao_por_origem: repo.Leads.conversaoPorOrigem(),
  };
}

module.exports = {
  TEMPLATES_CHECKLIST, Checklists, ITENS_PRONTIDAO, Prontidao,
  capacidade, CAMPANHA, CustosMarketing, relatorios, STATUS_ATIVOS,
};
