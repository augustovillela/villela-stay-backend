// =====================================================================
// ONDA LIVRO · 47.11 PAINEL DE CONTROLADORIA JURÍDICA (Cap. 40)
//
// REGRA ESTRUTURAL do 47.11: "verifica os outros sistemas de forma
// INDEPENDENTE de quem os opera". Por isso as conferências abaixo não
// confiam em campo de status preenchido por quem executou — elas
// recalculam a partir dos dados (prazo sem validação humana, publicação
// sem tratamento, coleta com zero resultado, peça sem revisão, cliente
// sem resposta, contrato assinado sem alçada, agente sem carta...).
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, int, valida, hoje, maisDias, patch, um, todos, novoId, nowISO, db } = B;

// Cada conferência devolve uma lista de achados. Puras: só leem.
const REGRAS = [
  {
    id: 'prazo_sem_validacao', gravidade: 'critica',
    // 40.2 + trava do 19.9: cálculo sugerido por máquina sem validação humana
    rodar: () => todos(`SELECT id, titulo, data_fatal, responsavel FROM deadlines
      WHERE status NOT IN ('cumprido','cancelado') AND calculo_sugerido != '' AND validado_por = ''`)
      .map(d => ({ descricao: `Prazo "${d.titulo}" (fatal ${d.data_fatal || '—'}) com cálculo sugerido e SEM validação humana.`, ref_tipo: 'deadline', ref_id: d.id, responsavel: d.responsavel })),
  },
  {
    id: 'prazo_sem_responsavel', gravidade: 'alta',
    rodar: () => todos(`SELECT id, titulo, data_fatal FROM deadlines
      WHERE status NOT IN ('cumprido','cancelado') AND responsavel = '' AND data_fatal != '' AND data_fatal <= ?`, maisDias(15))
      .map(d => ({ descricao: `Prazo "${d.titulo}" vence em ${d.data_fatal} e não tem responsável designado (Cap. 19.6).`, ref_tipo: 'deadline', ref_id: d.id })),
  },
  {
    id: 'prazo_vencido_aberto', gravidade: 'critica',
    rodar: () => todos(`SELECT id, titulo, data_fatal, responsavel FROM deadlines
      WHERE status NOT IN ('cumprido','cancelado','protocolado') AND data_fatal != '' AND data_fatal < ?`, hoje())
      .map(d => ({ descricao: `Prazo "${d.titulo}" passou do fatal (${d.data_fatal}) sem baixa. Conferir no sistema do tribunal AGORA.`, ref_tipo: 'deadline', ref_id: d.id, responsavel: d.responsavel })),
  },
  {
    id: 'publicacao_sem_tratamento', gravidade: 'alta',
    // 19.4/19.9: publicação parada em "nova" por mais de 2 dias
    rodar: () => todos(`SELECT id, resumo, data_publicacao FROM case_publications
      WHERE status = 'nova' AND data_publicacao != '' AND data_publicacao < ?`, maisDias(-2, hoje()))
      .map(p => ({ descricao: `Publicação de ${p.data_publicacao} ainda "nova" (sem classificação/providência): ${String(p.resumo || '').slice(0, 120)}`, ref_tipo: 'publication', ref_id: p.id })),
  },
  {
    id: 'publicacao_sem_ciencia', gravidade: 'media',
    // 19.8 confirmação de leitura
    rodar: () => todos(`SELECT p.id, p.resumo FROM case_publications p
      WHERE p.status IN ('lida','analisada','prazo_criado') AND NOT EXISTS (SELECT 1 FROM publication_acks a WHERE a.publication_id = p.id)
      ORDER BY p.coletado_em DESC LIMIT 50`)
      .map(p => ({ descricao: `Publicação tratada sem confirmação de leitura registrada (Cap. 19.8): ${String(p.resumo || '').slice(0, 100)}`, ref_tipo: 'publication', ref_id: p.id })),
  },
  {
    id: 'coleta_zero', gravidade: 'critica',
    // ALERTA OBRIGATÓRIO do 47.4: captura com zero resultados pode ser fonte caída
    rodar: () => {
      const ontem = maisDias(-1);
      const houve = um('SELECT COUNT(*) n FROM case_publications WHERE coletado_em >= ?', ontem).n;
      // integration_logs: colunas fonte/operacao/quando (ver schema.sql)
      const rodou = um("SELECT COUNT(*) n FROM integration_logs WHERE fonte LIKE '%djen%' AND quando >= ?", ontem).n;
      if (rodou && !houve) {
        return [{ descricao: 'Coleta de publicações rodou nas últimas 24h e trouxe ZERO resultados — conferir a fonte antes de assumir que não há intimação (alerta obrigatório do Cap. 47.4).', ref_tipo: 'integration', ref_id: '' }];
      }
      if (!rodou) {
        return [{ descricao: 'Nenhuma execução de coleta de publicações registrada nas últimas 24h — a rotina pode estar parada.', ref_tipo: 'integration', ref_id: '' }];
      }
      return [];
    },
  },
  {
    id: 'peca_ia_sem_revisao', gravidade: 'alta',
    // 40.4 + 6.9: minuta de IA parada sem revisão humana
    // legal_drafts: gerado_por_ia + tipo_peca/objetivo (não há coluna titulo)
    rodar: () => todos(`SELECT id, tipo_peca, objetivo FROM legal_drafts WHERE status IN ('rascunho','revisao_pendente')
      AND gerado_por_ia = 1 AND criado_em < ?`, maisDias(-3))
      .map(d => ({ descricao: `Peça gerada por IA sem revisão humana há mais de 3 dias: ${d.tipo_peca} — ${String(d.objetivo || '').slice(0, 80)}`, ref_tipo: 'draft', ref_id: d.id })),
  },
  {
    id: 'ia_resposta_sem_revisao', gravidade: 'media',
    rodar: () => todos("SELECT id, query_id FROM ai_responses WHERE status = 'rascunho' AND criado_em < ?", maisDias(-7))
      .map(r => ({ descricao: 'Resposta de IA em rascunho há mais de 7 dias, sem revisão registrada (Cap. 6.9).', ref_tipo: 'ai_response', ref_id: r.id })),
  },
  {
    id: 'cliente_sem_resposta', gravidade: 'alta',
    // 40.7 tempo de resposta ao cliente: mensagem do cliente sem réplica há 3+ dias
    // mensagem do cliente = client_notes.interna = 0 com autor "cliente: ..."
    // (convenção gravada pelo portal-cliente.js)
    rodar: () => todos(`SELECT n.id, n.client_id, n.criado_em, c.nome FROM client_notes n
      LEFT JOIN clients c ON c.id = n.client_id
      WHERE n.interna = 0 AND n.autor LIKE 'cliente:%' AND n.criado_em < ?
        AND NOT EXISTS (SELECT 1 FROM client_notes r WHERE r.client_id = n.client_id AND r.interna = 0
                        AND r.autor NOT LIKE 'cliente:%' AND r.criado_em > n.criado_em)
      ORDER BY n.criado_em LIMIT 50`, maisDias(-3))
      .map(n => ({ descricao: `Mensagem do cliente ${n.nome || n.client_id} de ${String(n.criado_em).slice(0, 10)} sem resposta do escritório (Cap. 40.7).`, ref_tipo: 'client', ref_id: n.client_id })),
  },
  {
    id: 'lead_sem_resposta', gravidade: 'media',
    rodar: () => todos(`SELECT id, nome, criado_em FROM crm_leads
      WHERE primeira_resposta_em = '' AND estagio IN ('novo','triagem') AND criado_em < ? AND spam_score < 60`, maisDias(-1))
      .map(l => ({ descricao: `Lead "${l.nome}" há mais de 24h sem primeiro contato (Cap. 16.10).`, ref_tipo: 'lead', ref_id: l.id })),
  },
  {
    id: 'conflito_pendente', gravidade: 'alta',
    rodar: () => todos("SELECT id, nome FROM crm_leads WHERE conflito_ok = 0 AND estagio IN ('qualificado','proposta')")
      .map(l => ({ descricao: `Lead "${l.nome}" avançou no funil sem pesquisa de conflito liberada (Cap. 17.1).`, ref_tipo: 'lead', ref_id: l.id })),
  },
  {
    id: 'contrato_sem_alcada', gravidade: 'critica',
    rodar: () => todos(`SELECT id, titulo FROM contract_records WHERE status IN ('assinatura','vigente')
      AND NOT EXISTS (SELECT 1 FROM contract_approvals a WHERE a.contract_id = contract_records.id AND a.decisao IN ('aprovado','com_ressalva'))`)
      .map(c => ({ descricao: `Contrato "${c.titulo}" em assinatura/vigência SEM aprovação de alçada registrada (Cap. 29.9).`, ref_tipo: 'contract', ref_id: c.id })),
  },
  {
    id: 'obrigacao_atrasada', gravidade: 'alta',
    rodar: () => todos(`SELECT o.id, o.descricao, o.data_limite, c.titulo FROM contract_obligations o
      JOIN contract_records c ON c.id = o.contract_id
      WHERE o.status IN ('pendente','atrasada') AND o.data_limite != '' AND o.data_limite < ?`, hoje())
      .map(o => ({ descricao: `Obrigação contratual vencida (${o.data_limite}) em "${o.titulo}": ${String(o.descricao).slice(0, 100)}`, ref_tipo: 'obligation', ref_id: o.id })),
  },
  {
    id: 'renovacao_sem_aviso', gravidade: 'alta',
    rodar: () => todos(`SELECT id, titulo, vigencia_fim, aviso_previo_dias FROM contract_records
      WHERE status = 'vigente' AND renovacao_automatica = 1 AND vigencia_fim != '' AND vigencia_fim <= ?`, maisDias(90))
      .filter(c => maisDias(-Math.abs(c.aviso_previo_dias || 30), c.vigencia_fim) <= maisDias(15))
      .map(c => ({ descricao: `Contrato "${c.titulo}" renova automaticamente em ${c.vigencia_fim}; a janela de denúncia (${c.aviso_previo_dias} dias) está fechando (Cap. 29.11).`, ref_tipo: 'contract', ref_id: c.id })),
  },
  {
    id: 'titular_lgpd_atrasado', gravidade: 'critica',
    rodar: () => todos(`SELECT id, titular, prazo_em FROM data_subject_requests
      WHERE status IN ('recebido','em_analise') AND prazo_em != '' AND prazo_em < ?`, hoje())
      .map(p => ({ descricao: `Pedido de titular (${p.titular}) fora do prazo legal desde ${p.prazo_em} (art. 19 LGPD / Cap. 42.10).`, ref_tipo: 'dsr', ref_id: p.id })),
  },
  {
    id: 'risco_alto_sem_plano', gravidade: 'alta',
    rodar: () => todos("SELECT id, risco FROM risk_register WHERE status IN ('aberto','tratando') AND impacto IN ('critico','alto') AND plano_correcao = ''")
      .map(r => ({ descricao: `Risco de impacto alto/crítico sem plano de correção: ${String(r.risco).slice(0, 120)} (Cap. 41.10).`, ref_tipo: 'risk', ref_id: r.id })),
  },
  {
    id: 'agente_sem_carta', gravidade: 'alta',
    // 47.12 + 10.10: agente de IA ativo sem limites de autonomia escritos
    rodar: () => todos('SELECT id, nome FROM ai_agents WHERE ativo = 1')
      .filter(a => !um('SELECT id FROM agent_charters WHERE agente = ?', a.id))
      .map(a => ({ descricao: `Agente de IA "${a.nome}" ativo sem carta de limites de autonomia (Cap. 10.10 / 47.12).`, ref_tipo: 'agent', ref_id: a.id })),
  },
  {
    id: 'sistema_critico_sem_contingencia', gravidade: 'media',
    rodar: () => todos("SELECT id, nome FROM system_inventory WHERE ativo = 1 AND criticidade = 'critica' AND plano_contingencia = ''")
      .map(x => ({ descricao: `Sistema crítico "${x.nome}" sem plano de contingência (Cap. 12.9).`, ref_tipo: 'system', ref_id: x.id })),
  },
  {
    id: 'politica_sem_ciencia', gravidade: 'media',
    rodar: () => todos(`SELECT p.id, p.titulo, (SELECT COUNT(*) FROM post_acks a WHERE a.ref_tipo = 'policy' AND a.ref_id = p.id) c
      FROM policies p WHERE p.status = 'vigente' AND p.exige_ciencia = 1`)
      .filter(p => !p.c)
      .map(p => ({ descricao: `Política vigente "${p.titulo}" sem nenhuma confirmação de ciência da equipe (Cap. 41.5).`, ref_tipo: 'policy', ref_id: p.id })),
  },
  {
    id: 'conteudo_publicado_sem_etica', gravidade: 'critica',
    rodar: () => todos("SELECT id, titulo FROM content_items WHERE status = 'publicado' AND etica_status != 'aprovado'")
      .map(c => ({ descricao: `Conteúdo publicado sem revisão ética aprovada: "${c.titulo}" (Prov. 205/2021 · Cap. 14.5).`, ref_tipo: 'content', ref_id: c.id })),
  },
  {
    id: 'cobranca_sem_aprovacao', gravidade: 'media',
    rodar: () => todos("SELECT id, invoice_id, nivel FROM collection_actions WHERE status = 'rascunho' AND nivel >= 2")
      .map(c => ({ descricao: `Cobrança de nível ${c.nivel} aguardando aprovação humana para sair (Cap. 38.5 / 47.10).`, ref_tipo: 'collection', ref_id: c.id })),
  },
  {
    id: 'fato_controvertido_sem_prova', gravidade: 'media',
    rodar: () => todos(`SELECT f.id, f.fato, f.case_id FROM fact_matrix f
      WHERE f.situacao = 'controvertido' AND NOT EXISTS (SELECT 1 FROM evidence_matrix e WHERE e.fato_id = f.id) LIMIT 50`)
      .map(f => ({ descricao: `Fato controvertido sem prova vinculada na matriz: ${String(f.fato).slice(0, 120)} (Cap. 24.1).`, ref_tipo: 'case', ref_id: f.case_id })),
  },
  {
    id: 'traducao_pendente_cliente', gravidade: 'baixa',
    rodar: () => todos("SELECT id, case_id FROM movement_translations WHERE status = 'rascunho' AND criado_em < ?", maisDias(-2))
      .map(t => ({ descricao: 'Tradução de andamento em linguagem simples aguardando aprovação humana para ficar visível ao cliente (Cap. 18.3 / 47.2).', ref_tipo: 'translation', ref_id: t.id })),
  },
  {
    id: 'norma_desatualizada', gravidade: 'baixa',
    rodar: () => todos("SELECT id, identificacao FROM norms WHERE vigente = 1 AND (conferida_em = '' OR conferida_em < ?) LIMIT 30", maisDias(-180))
      .map(n => ({ descricao: `Norma "${n.identificacao}" sem conferência de vigência há mais de 180 dias (Cap. 33.4).`, ref_tipo: 'norm', ref_id: n.id })),
  },
];

const Controladoria = {
  regras() { return REGRAS.map(r => ({ id: r.id, gravidade: r.gravidade })); },

  // Roda todas as conferências e grava run + achados. Idempotente por dia:
  // rodar duas vezes cria dois runs (histórico), o que é proposital (40.2).
  rodar({ escopo = 'diaria' } = {}, quem) {
    const achados = [];
    for (const r of REGRAS) {
      let lista = [];
      try { lista = r.rodar() || []; }
      catch (e) { lista = [{ descricao: `Conferência "${r.id}" falhou: ${e.message}`, ref_tipo: 'erro', ref_id: '' }]; }
      for (const a of lista) achados.push({ ...a, regra: r.id, gravidade: r.gravidade });
    }
    const runId = novoId(), agora = nowISO();
    const criticos = achados.filter(a => a.gravidade === 'critica').length;
    db.prepare('INSERT INTO control_runs (id, escopo, achados, criticos, resumo, quem, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(runId, ['diaria', 'semanal', 'manual'].includes(escopo) ? escopo : 'manual', achados.length, criticos,
        achados.length ? `${achados.length} achado(s), ${criticos} crítico(s).` : 'Nenhum achado — conferências sem divergência.',
        s(quem, 120) || 'rotina', agora);
    const ins = db.prepare(`INSERT INTO control_findings (id, run_id, regra, gravidade, descricao, ref_tipo, ref_id,
      responsavel, status, tratado_por, tratado_em, criado_em) VALUES (?,?,?,?,?,?,?,?,'aberto','','',?)`);
    for (const a of achados) {
      ins.run(novoId(), runId, a.regra, a.gravidade, s(a.descricao, 1000), s(a.ref_tipo, 40), s(a.ref_id, 40), s(a.responsavel, 120), agora);
    }
    return { run: um('SELECT * FROM control_runs WHERE id = ?', runId), achados: achados.length, criticos };
  },

  ultimoRun() { return um('SELECT * FROM control_runs ORDER BY criado_em DESC LIMIT 1') || null; },
  runs({ n = 30 } = {}) { return todos('SELECT * FROM control_runs ORDER BY criado_em DESC LIMIT ?', Math.min(int(n, 30), 100)); },
  achados({ run_id = '', status = 'aberto', gravidade = '', n = 300 } = {}) {
    let sql = 'SELECT * FROM control_findings', w = [], a = [];
    if (run_id) { w.push('run_id = ?'); a.push(run_id); }
    else if (status) { w.push('status = ?'); a.push(status); }
    if (gravidade) { w.push('gravidade = ?'); a.push(gravidade); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ` ORDER BY CASE gravidade WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END, criado_em DESC LIMIT ?`;
    a.push(Math.min(int(n, 300), 800));
    return todos(sql, ...a);
  },
  tratar(id, { status, observacao } = {}, quem) {
    const f = um('SELECT * FROM control_findings WHERE id = ?', id);
    if (!f) throw new Error('Achado não encontrado.');
    const st = valida(status, EL.statusAchado, 'status');
    if (st === 'falso_positivo' && !s(observacao)) throw new Error('Falso positivo exige justificativa (a controladoria não apaga achado sem registro).');
    db.prepare('UPDATE control_findings SET status = ?, tratado_por = ?, tratado_em = ?, descricao = ? WHERE id = ?')
      .run(st, s(quem, 120), nowISO(),
        s(observacao) ? f.descricao + ' — [' + st + ': ' + s(observacao, 400) + ']' : f.descricao, id);
    return um('SELECT * FROM control_findings WHERE id = ?', id);
  },

  // 40.5/40.6/40.10 indicadores: produtividade, qualidade e dashboard do sócio
  indicadores({ dias = 30 } = {}) {
    const d0 = maisDias(-Math.abs(int(dias, 30))), h = hoje();
    const prazos = um(`SELECT
        COUNT(*) total,
        SUM(CASE WHEN status = 'cumprido' THEN 1 ELSE 0 END) cumpridos,
        SUM(CASE WHEN status = 'perdido' THEN 1 ELSE 0 END) perdidos
      FROM deadlines WHERE criado_em >= ?`, d0);
    const tarefas = um(`SELECT COUNT(*) total, SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) concluidas
      FROM tasks WHERE criado_em >= ?`, d0);
    const retrabalho = um(`SELECT COUNT(*) n FROM task_status_history
      WHERE para = 'em_andamento' AND de = 'em_revisao' AND quando >= ?`, d0);
    const horas = um('SELECT COALESCE(SUM(minutos),0) m, COALESCE(SUM(CASE WHEN faturavel = 1 THEN minutos ELSE 0 END),0) mf FROM time_entries WHERE data >= ?', d0);
    const nps = um('SELECT COUNT(*) n, COALESCE(AVG(nota),0) media FROM client_satisfaction WHERE respondido_em >= ?', d0);
    const runs = todos('SELECT * FROM control_runs WHERE criado_em >= ? ORDER BY criado_em', d0);
    return {
      periodo: { de: d0, ate: h },
      prazos: {
        ...prazos,
        cumprimento_pct: prazos.total ? Math.round(((prazos.cumpridos || 0) / prazos.total) * 100) : 0,
        perdidos: prazos.perdidos || 0,
      },
      tarefas: { ...tarefas, conclusao_pct: tarefas.total ? Math.round(((tarefas.concluidas || 0) / tarefas.total) * 100) : 0 },
      retrabalho: retrabalho.n,
      horas: { total: Math.round(horas.m / 6) / 10, faturaveis: Math.round(horas.mf / 6) / 10, aproveitamento_pct: horas.m ? Math.round((horas.mf / horas.m) * 100) : 0 },
      satisfacao: { respostas: nps.n, media: Math.round(Number(nps.media) * 10) / 10 },
      conferencias: {
        execucoes: runs.length,
        achados_abertos: um("SELECT COUNT(*) n FROM control_findings WHERE status = 'aberto'").n,
        criticos_abertos: um("SELECT COUNT(*) n FROM control_findings WHERE status = 'aberto' AND gravidade = 'critica'").n,
        ultimo: runs.length ? runs[runs.length - 1].criado_em : '',
      },
      // 40.8 carteira por advogado
      carteira: todos(`SELECT advogado_resp responsavel, COUNT(*) processos,
          SUM(CASE WHEN risco = 'provavel' THEN 1 ELSE 0 END) risco_provavel
        FROM cases WHERE status = 'ativo' GROUP BY advogado_resp ORDER BY processos DESC`),
      // 40.9 resultado por tipo de demanda (classe processual)
      por_classe: todos(`SELECT COALESCE(NULLIF(classe,''),'(sem classe)') classe, COUNT(*) n,
          SUM(CASE WHEN status = 'encerrado' THEN 1 ELSE 0 END) encerrados
        FROM cases GROUP BY classe ORDER BY n DESC LIMIT 15`),
    };
  },
};

module.exports = { Controladoria };
