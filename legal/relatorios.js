// =====================================================================
// Villela Legal Intelligence — RELATÓRIOS GERENCIAIS (Fase 6, Módulo 20).
//
// Todas as métricas são calculadas AO VIVO no SQLite (rápido no volume de
// um escritório). Exportações (HTML imprimível / CSV) ficam arquivadas em
// generated_reports — trilha de auditoria do que foi gerado e por quem.
// Visões: sócio (consolidada), núcleo, financeiro e prestação de contas
// por cliente. A visão do CLIENTE mora no portal (Fase 5).
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');

const hojeISO = () => nowISO().slice(0, 10);
const emDias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const atras = (n) => new Date(Date.now() - n * 86400000).toISOString();
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// ---------------------------------------------------------------------
// VISÃO DO SÓCIO (consolidada)
// ---------------------------------------------------------------------
function visaoSocio() {
  const um = (sql, ...a) => db.prepare(sql).get(...a);
  const todos = (sql, ...a) => db.prepare(sql).all(...a);
  const hoje = hojeISO();

  return {
    gerado_em: nowISO(),
    processos: {
      ativos: um("SELECT COUNT(*) n FROM cases WHERE status = 'ativo'").n,
      por_nucleo: todos(`SELECT COALESCE(NULLIF(nucleo,''),'(sem núcleo)') nucleo, COUNT(*) n FROM cases WHERE status = 'ativo' GROUP BY 1 ORDER BY n DESC`),
      por_fase: todos(`SELECT COALESCE(NULLIF(fase,''),'(sem fase)') fase, COUNT(*) n FROM cases WHERE status = 'ativo' GROUP BY 1 ORDER BY n DESC`),
      risco_carteira: todos(`SELECT COALESCE(NULLIF(risco,''),'(sem classificação)') risco, COUNT(*) n,
        SUM(valor_causa) valor FROM cases WHERE status = 'ativo' GROUP BY 1 ORDER BY valor DESC`),
      sem_atualizacao_30d: um("SELECT COUNT(*) n FROM cases WHERE status = 'ativo' AND atualizado_em < ?", atras(30)).n,
    },
    prazos: {
      vencidos: um(`SELECT COUNT(*) n FROM deadlines WHERE status NOT IN ('cumprido','cancelado','perdido')
        AND data_fatal != '' AND data_fatal < ?`, hoje).n,
      proximos_7d: um(`SELECT COUNT(*) n FROM deadlines WHERE status NOT IN ('cumprido','cancelado','perdido')
        AND data_fatal != '' AND data_fatal >= ? AND data_fatal <= ?`, hoje, emDias(7)).n,
      sem_validacao: um(`SELECT COUNT(*) n FROM deadlines WHERE status NOT IN ('cumprido','cancelado')
        AND calculo_sugerido != '' AND validado_por = ''`).n,
      criticos: todos(`SELECT d.titulo, d.data_fatal, d.prioridade, d.status, c.numero_cnj FROM deadlines d
        LEFT JOIN cases c ON c.id = d.case_id WHERE d.status NOT IN ('cumprido','cancelado','perdido')
        AND d.data_fatal != '' AND d.data_fatal <= ? ORDER BY d.data_fatal LIMIT 15`, emDias(7)),
    },
    pendencias: {
      publicacoes_novas: um("SELECT COUNT(*) n FROM case_publications WHERE status = 'nova'").n,
      pecas_em_revisao: um("SELECT COUNT(*) n FROM legal_drafts WHERE status = 'revisao_pendente'").n,
      ia_fila: um('SELECT COUNT(*) n FROM ai_queries q LEFT JOIN ai_responses r ON r.query_id = q.id WHERE r.id IS NULL').n,
      ia_sem_revisao: um("SELECT COUNT(*) n FROM ai_responses WHERE status = 'rascunho'").n,
      tarefas_atrasadas: um("SELECT COUNT(*) n FROM tasks WHERE status IN ('aberta','em_andamento') AND prazo != '' AND prazo < ?", hoje).n,
      audiencias_7d: um("SELECT COUNT(*) n FROM hearings WHERE status = 'agendada' AND data_hora >= ? AND data_hora <= ?", hoje, emDias(7) + 'T23:59').n,
    },
    financeiro: resumoFinanceiro(),
    clientes_estrategicos: todos(`SELECT c.nome, COUNT(k.id) processos,
      COALESCE((SELECT SUM(f.valor) FROM financial_accounts f WHERE f.client_id = c.id AND f.status IN ('previsto','faturado')), 0) em_aberto
      FROM clients c LEFT JOIN cases k ON k.client_id = c.id AND k.status = 'ativo'
      WHERE c.tipo_cliente = 'estrategico' GROUP BY c.id ORDER BY em_aberto DESC LIMIT 10`),
    produtividade_30d: {
      tarefas_concluidas: todos(`SELECT COALESCE(NULLIF(quem,''),'(sem registro)') quem, COUNT(*) n FROM task_status_history
        WHERE para = 'concluida' AND quando >= ? GROUP BY 1 ORDER BY n DESC LIMIT 10`, atras(30)),
      andamentos_registrados: um('SELECT COUNT(*) n FROM case_movements WHERE coletado_em >= ?', atras(30)).n,
      pecas_criadas: um('SELECT COUNT(*) n FROM legal_draft_versions WHERE criado_em >= ?', atras(30)).n,
      consultas_ia: um('SELECT COUNT(*) n FROM ai_queries WHERE criado_em >= ?', atras(30)).n,
    },
    gargalos: todos(`SELECT COALESCE(NULLIF(t.responsavel,''),'(sem responsável)') responsavel, COUNT(*) atrasadas
      FROM tasks t WHERE t.status IN ('aberta','em_andamento') AND t.prazo != '' AND t.prazo < ?
      GROUP BY 1 ORDER BY atrasadas DESC LIMIT 8`, hoje),
  };
}

// ---------------------------------------------------------------------
// VISÃO POR NÚCLEO
// ---------------------------------------------------------------------
function visaoNucleo(nucleo) {
  const n = String(nucleo || '').trim();
  const todos = (sql, ...a) => db.prepare(sql).all(...a);
  const um = (sql, ...a) => db.prepare(sql).get(...a);
  const hoje = hojeISO();
  return {
    nucleo: n, gerado_em: nowISO(),
    processos_por_fase: todos(`SELECT COALESCE(NULLIF(fase,''),'(sem fase)') fase, COUNT(*) qtd FROM cases
      WHERE status = 'ativo' AND nucleo = ? GROUP BY 1 ORDER BY qtd DESC`, n),
    tarefas_abertas: todos(`SELECT t.titulo, t.responsavel, t.prazo, t.prioridade, t.status, c.numero_cnj FROM tasks t
      LEFT JOIN cases c ON c.id = t.case_id WHERE t.status IN ('aberta','em_andamento','em_revisao') AND t.nucleo = ?
      ORDER BY CASE WHEN t.prazo = '' THEN 1 ELSE 0 END, t.prazo LIMIT 30`, n),
    prazos: todos(`SELECT d.titulo, d.data_fatal, d.status, d.prioridade, c.numero_cnj FROM deadlines d
      JOIN cases c ON c.id = d.case_id WHERE c.nucleo = ? AND d.status NOT IN ('cumprido','cancelado','perdido')
      ORDER BY CASE WHEN d.data_fatal = '' THEN 1 ELSE 0 END, d.data_fatal LIMIT 20`, n),
    audiencias_30d: todos(`SELECT h.data_hora, h.tipo, h.juizo, c.numero_cnj FROM hearings h
      LEFT JOIN cases c ON c.id = h.case_id WHERE h.status = 'agendada' AND c.nucleo = ?
      AND h.data_hora <= ? ORDER BY h.data_hora LIMIT 20`, n, emDias(30) + 'T23:59'),
    atrasos: um(`SELECT COUNT(*) n FROM tasks WHERE nucleo = ? AND status IN ('aberta','em_andamento')
      AND prazo != '' AND prazo < ?`, n, hoje).n,
  };
}

// ---------------------------------------------------------------------
// FINANCEIRO (honorários, despesas, inadimplência, repasses, margem)
// ---------------------------------------------------------------------
const TIPOS_RECEITA = ['honorario_contratual', 'honorario_exito'];
const TIPOS_DESPESA = ['custas', 'diligencia', 'despesa'];
function resumoFinanceiro() {
  const um = (sql, ...a) => db.prepare(sql).get(...a);
  const hoje = hojeISO();
  const inTipos = (t) => t.map(x => `'${x}'`).join(',');
  const receitaRecebida = um(`SELECT COALESCE(SUM(valor),0) v FROM financial_accounts WHERE tipo IN (${inTipos(TIPOS_RECEITA)}) AND status = 'pago'`).v;
  const despesasPagas = um(`SELECT COALESCE(SUM(valor),0) v FROM financial_accounts WHERE tipo IN (${inTipos(TIPOS_DESPESA)}) AND status = 'pago'`).v;
  return {
    a_receber: um(`SELECT COALESCE(SUM(valor),0) v FROM financial_accounts WHERE tipo IN (${inTipos(TIPOS_RECEITA)}) AND status IN ('previsto','faturado')`).v,
    inadimplencia: um(`SELECT COALESCE(SUM(valor),0) v FROM financial_accounts WHERE status = 'faturado' AND vencimento != '' AND vencimento < ?`, hoje).v,
    receita_recebida: receitaRecebida,
    despesas_pagas: despesasPagas,
    margem: receitaRecebida - despesasPagas,
    repasses_pendentes: um(`SELECT COALESCE(SUM(valor),0) v FROM financial_accounts WHERE tipo IN ('repasse','recebimento_judicial','alvara') AND status IN ('previsto','faturado')`).v,
  };
}
function visaoFinanceiro() {
  const todos = (sql, ...a) => db.prepare(sql).all(...a);
  return {
    gerado_em: nowISO(),
    resumo: resumoFinanceiro(),
    por_tipo: todos(`SELECT tipo, status, COUNT(*) qtd, SUM(valor) total FROM financial_accounts
      WHERE status != 'cancelado' GROUP BY tipo, status ORDER BY tipo`),
    inadimplentes: todos(`SELECT cl.nome, f.descricao, f.valor, f.vencimento FROM financial_accounts f
      LEFT JOIN clients cl ON cl.id = f.client_id
      WHERE f.status = 'faturado' AND f.vencimento != '' AND f.vencimento < ? ORDER BY f.vencimento LIMIT 20`, hojeISO()),
    top_clientes: todos(`SELECT cl.nome, SUM(CASE WHEN f.status = 'pago' AND f.tipo IN (${TIPOS_RECEITA.map(x => `'${x}'`).join(',')}) THEN f.valor ELSE 0 END) recebido,
      SUM(CASE WHEN f.status IN ('previsto','faturado') THEN f.valor ELSE 0 END) em_aberto
      FROM financial_accounts f JOIN clients cl ON cl.id = f.client_id GROUP BY cl.id ORDER BY recebido DESC LIMIT 10`),
  };
}

// ---------------------------------------------------------------------
// PRESTAÇÃO DE CONTAS por cliente (staff — visão completa)
// ---------------------------------------------------------------------
function prestacaoContas(clientId) {
  const c = db.prepare('SELECT id, nome, cpf_cnpj FROM clients WHERE id = ?').get(String(clientId || ''));
  if (!c) throw new Error('Cliente não encontrado.');
  const lanc = db.prepare(`SELECT f.*, k.numero_cnj FROM financial_accounts f LEFT JOIN cases k ON k.id = f.case_id
    WHERE f.client_id = ? AND f.status != 'cancelado' ORDER BY COALESCE(NULLIF(f.vencimento,''), f.criado_em)`).all(c.id);
  const soma = (fn) => lanc.filter(fn).reduce((t, l) => t + l.valor, 0);
  return {
    cliente: { id: c.id, nome: c.nome }, gerado_em: nowISO(), lancamentos: lanc,
    totais: {
      recebido: soma(l => l.status === 'pago'),
      em_aberto: soma(l => ['previsto', 'faturado'].includes(l.status)),
      repassado: soma(l => l.status === 'repassado'),
    },
  };
}

// ---------------------------------------------------------------------
// EXPORTAÇÕES (HTML imprimível / CSV) — arquivadas em generated_reports
// ---------------------------------------------------------------------
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function salvarGerado({ tipo, titulo, parametros, conteudo, formato, quem }) {
  const id = novoId();
  db.prepare('INSERT INTO generated_reports (id, tipo, titulo, parametros, conteudo, formato, criado_por, criado_em) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, tipo, titulo, j.str(parametros || {}), conteudo, formato, String(quem || ''), nowISO());
  return id;
}
const listarGerados = (n = 30) => db.prepare('SELECT id, tipo, titulo, formato, criado_por, criado_em FROM generated_reports ORDER BY criado_em DESC LIMIT ?').all(Math.min(Number(n) || 30, 100));
const obterGerado = (id) => db.prepare('SELECT * FROM generated_reports WHERE id = ?').get(String(id));

const CSS_REL = `body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;max-width:21cm;margin:1.5cm auto;color:#222}
  h1{font-size:16pt;color:#1B2A4A}h2{font-size:12pt;color:#1B2A4A;border-bottom:1px solid #ccc;padding-bottom:3px;margin-top:22px}
  table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #ddd;padding:5px 8px;text-align:left;font-size:10pt}
  th{background:#f0efe9}.kpis{display:flex;flex-wrap:wrap;gap:10px}.kpi{border:1px solid #ddd;border-radius:8px;padding:8px 14px;min-width:130px}
  .kpi b{font-size:14pt;display:block}.sub{color:#777;font-size:9pt}.alerta{color:#b00020}`;
const tabelaHTML = (cab, linhas) => `<table><thead><tr>${cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${linhas.map(l => `<tr>${l.map(x => `<td>${x}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cab.length}" class="sub">—</td></tr>`}</tbody></table>`;

function relatorioSocioHTML(quem) {
  const v = visaoSocio();
  const kpi = (rot, val, alerta) => `<div class="kpi"><span class="sub">${esc(rot)}</span><b class="${alerta ? 'alerta' : ''}">${val}</b></div>`;
  const html = `<html><head><meta charset="utf-8"><title>Relatório do sócio</title><style>${CSS_REL}</style></head><body>
    <h1>⚖️ Villela Legal — Relatório do sócio</h1><p class="sub">Gerado em ${v.gerado_em.slice(0, 16).replace('T', ' ')} (dados ao vivo)</p>
    <div class="kpis">${kpi('Processos ativos', v.processos.ativos)}${kpi('Prazos vencidos', v.prazos.vencidos, v.prazos.vencidos > 0)}
      ${kpi('Prazos 7 dias', v.prazos.proximos_7d)}${kpi('Sem validação', v.prazos.sem_validacao, v.prazos.sem_validacao > 0)}
      ${kpi('Publicações novas', v.pendencias.publicacoes_novas, v.pendencias.publicacoes_novas > 0)}${kpi('Peças em revisão', v.pendencias.pecas_em_revisao)}
      ${kpi('Tarefas atrasadas', v.pendencias.tarefas_atrasadas, v.pendencias.tarefas_atrasadas > 0)}${kpi('Audiências 7d', v.pendencias.audiencias_7d)}
      ${kpi('A receber', brl(v.financeiro.a_receber))}${kpi('Inadimplência', brl(v.financeiro.inadimplencia), v.financeiro.inadimplencia > 0)}
      ${kpi('Margem (recebido − pago)', brl(v.financeiro.margem))}</div>
    <h2>Prazos críticos (até 7 dias)</h2>${tabelaHTML(['Data fatal', 'Título', 'CNJ', 'Prioridade', 'Status'],
      v.prazos.criticos.map(z => [esc(z.data_fatal), esc(z.titulo), esc(z.numero_cnj || '—'), esc(z.prioridade), esc(z.status)]))}
    <h2>Risco da carteira (processos ativos)</h2>${tabelaHTML(['Risco', 'Qtd', 'Valor em causa'],
      v.processos.risco_carteira.map(r => [esc(r.risco), r.n, brl(r.valor)]))}
    <h2>Processos por núcleo</h2>${tabelaHTML(['Núcleo', 'Ativos'], v.processos.por_nucleo.map(x => [esc(x.nucleo), x.n]))}
    <h2>Clientes estratégicos</h2>${tabelaHTML(['Cliente', 'Processos ativos', 'Em aberto'],
      v.clientes_estrategicos.map(c => [esc(c.nome), c.processos, brl(c.em_aberto)]))}
    <h2>Produtividade (30 dias)</h2>
    <p>Andamentos registrados: <b>${v.produtividade_30d.andamentos_registrados}</b> · Versões de peça: <b>${v.produtividade_30d.pecas_criadas}</b> · Consultas de IA: <b>${v.produtividade_30d.consultas_ia}</b></p>
    ${tabelaHTML(['Quem', 'Tarefas concluídas'], v.produtividade_30d.tarefas_concluidas.map(t => [esc(t.quem), t.n]))}
    <h2>Gargalos (tarefas atrasadas por responsável)</h2>${tabelaHTML(['Responsável', 'Atrasadas'], v.gargalos.map(g => [esc(g.responsavel), g.atrasadas]))}
    <p class="sub">Processos ativos sem atualização há 30+ dias: ${v.processos.sem_atualizacao_30d}. Consultas de IA na fila: ${v.pendencias.ia_fila}; respostas sem revisão: ${v.pendencias.ia_sem_revisao}.</p>
  </body></html>`;
  const id = salvarGerado({ tipo: 'socio', titulo: 'Relatório do sócio — ' + hojeISO(), conteudo: html, formato: 'html', quem });
  return { id, html };
}

function prestacaoContasExport(clientId, formato, quem) {
  const p = prestacaoContas(clientId);
  if (formato === 'csv') {
    // célula iniciada por = + - @ vira fórmula no Excel (CSV injection) → prefixa com apóstrofo
    const csvSafe = (v) => { const t = String(v == null ? '' : v).replace(/[;\r\n]/g, ' '); return /^[=+\-@]/.test(t) ? "'" + t : t; };
    const linhas = [['data_vencimento', 'tipo', 'descricao', 'processo', 'valor_reais', 'status']];
    for (const l of p.lancamentos) linhas.push([l.vencimento || l.criado_em.slice(0, 10), l.tipo, csvSafe(l.descricao), csvSafe(l.numero_cnj || ''), (l.valor / 100).toFixed(2).replace('.', ','), l.status]);
    linhas.push([], ['TOTAIS', '', 'recebido: ' + (p.totais.recebido / 100).toFixed(2), 'em aberto: ' + (p.totais.em_aberto / 100).toFixed(2), 'repassado: ' + (p.totais.repassado / 100).toFixed(2), '']);
    const csv = '﻿' + linhas.map(l => l.join(';')).join('\r\n'); // BOM p/ Excel abrir acentos
    const id = salvarGerado({ tipo: 'prestacao-contas', titulo: 'Prestação de contas — ' + p.cliente.nome, parametros: { client_id: clientId }, conteudo: csv, formato: 'csv', quem });
    return { id, conteudo: csv, formato: 'csv', nome: `prestacao-contas-${p.cliente.nome.replace(/\W+/g, '-').toLowerCase()}.csv` };
  }
  const html = `<html><head><meta charset="utf-8"><title>Prestação de contas</title><style>${CSS_REL}</style></head><body>
    <h1>⚖️ Villela Legal — Prestação de contas</h1>
    <p><b>${esc(p.cliente.nome)}</b> · gerado em ${p.gerado_em.slice(0, 16).replace('T', ' ')}</p>
    <div class="kpis"><div class="kpi"><span class="sub">Recebido</span><b>${brl(p.totais.recebido)}</b></div>
      <div class="kpi"><span class="sub">Em aberto</span><b>${brl(p.totais.em_aberto)}</b></div>
      <div class="kpi"><span class="sub">Repassado ao cliente</span><b>${brl(p.totais.repassado)}</b></div></div>
    ${tabelaHTML(['Vencimento', 'Tipo', 'Descrição', 'Processo', 'Valor', 'Status'],
      p.lancamentos.map(l => [esc(l.vencimento || l.criado_em.slice(0, 10)), esc(l.tipo), esc(l.descricao), esc(l.numero_cnj || '—'), brl(l.valor), esc(l.status)]))}
  </body></html>`;
  const id = salvarGerado({ tipo: 'prestacao-contas', titulo: 'Prestação de contas — ' + p.cliente.nome, parametros: { client_id: clientId }, conteudo: html, formato: 'html', quem });
  return { id, conteudo: html, formato: 'html', nome: 'prestacao-contas.html' };
}

module.exports = {
  visaoSocio, visaoNucleo, visaoFinanceiro, prestacaoContas,
  relatorioSocioHTML, prestacaoContasExport, listarGerados, obterGerado,
};
