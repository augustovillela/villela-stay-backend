// =====================================================================
// Villela Projects & Events — Fase 2: portfólio avançado.
// * Plano de negócio estruturado por seções (catálogo abaixo), com
//   completude calculada e SNAPSHOT de versão a cada salvamento.
// * Score de viabilidade guiado: 11 critérios 0-10 (todos "quanto maior,
//   melhor" — os de risco/custo são enunciados invertidos p/ manter a
//   escala única) → média ×10 = score 0-100, espelhado em
//   projects.viabilidade.
// * Decisões formais (governança): pausar/descartar/retomar APLICAM o
//   status no projeto; avançar/amadurecer registram a direção (o estágio
//   é mudado pelo gestor). Histórico imutável.
// * Ranking/matriz do portfólio para comparar ideias.
// A geração assistida por IA chega na Fase 6 (agentes) — decisão no README.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = repo.s;

// ---- catálogo das seções do plano de negócio (a UI itera nesta ordem) ----
const SECOES_PLANO = [
  ['resumo', 'Resumo executivo'],
  ['problema_publico', 'Problema que resolve e público-alvo'],
  ['proposta_valor', 'Proposta de valor e diferencial competitivo'],
  ['analise_mercado', 'Análise de mercado'],
  ['concorrencia', 'Concorrência'],
  ['modelo_receita', 'Modelo de receita e precificação'],
  ['canais_venda', 'Canais de venda e aquisição'],
  ['swot', 'Análise SWOT (forças, fraquezas, oportunidades, ameaças)'],
  ['custos', 'Custos fixos e variáveis'],
  ['investimento', 'Investimento inicial e fontes'],
  ['projecoes', 'Projeção de receita, margem e ponto de equilíbrio'],
  ['licencas_juridico', 'Licenças e necessidades jurídicas'],
  ['operacional_tecnico', 'Necessidades operacionais e técnicas'],
  ['equipe', 'Equipe necessária (humana e agentes de IA)'],
  ['marketing_lancamento', 'Plano de marketing e lançamento'],
  ['riscos_barreiras', 'Riscos e barreiras de entrada'],
  ['plano_validacao', 'Plano de validação / MVP sugerido'],
  ['conclusao', 'Conclusão e recomendação'],
];
const CHAVES_SECOES = SECOES_PLANO.map(([k]) => k);

// ---- catálogo dos 11 critérios de viabilidade (0-10, maior = melhor) ----
const CRITERIOS_VIABILIDADE = [
  ['potencial_mercado', 'Potencial de mercado (10 = mercado grande e acessível)'],
  ['sinergia', 'Sinergia com os negócios atuais (10 = altíssima)'],
  ['investimento', 'Investimento necessário (10 = muito baixo)'],
  ['tempo_retorno', 'Tempo de retorno (10 = muito rápido)'],
  ['margem', 'Margem potencial (10 = muito alta)'],
  ['complexidade', 'Complexidade operacional (10 = muito simples)'],
  ['risco_regulatorio', 'Risco regulatório (10 = nenhum)'],
  ['risco_financeiro', 'Risco financeiro (10 = muito baixo)'],
  ['capacidade_execucao', 'Capacidade de execução da equipe hoje (10 = total)'],
  ['urgencia', 'Urgência / janela de oportunidade (10 = agora ou nunca)'],
  ['diferencial', 'Diferencial competitivo (10 = único no mercado)'],
];
const CHAVES_CRITERIOS = CRITERIOS_VIABILIDADE.map(([k]) => k);

// ------------------------------------------------------------ plano de negócio
function obterPlano(tenantId, projectId) {
  repo.obterProjeto(tenantId, projectId); // valida tenant+projeto (anti-IDOR)
  const p = db.prepare('SELECT * FROM business_plans WHERE tenant_id = ? AND project_id = ?').get(String(tenantId), String(projectId));
  const secoes = p ? j.parse(p.secoes, {}) : {};
  const preenchidas = CHAVES_SECOES.filter(k => String(secoes[k] || '').trim()).length;
  return {
    existe: !!p,
    plano: p ? { id: p.id, versao: p.versao, status: p.status, atualizado_em: p.atualizado_em } : null,
    secoes, catalogo: SECOES_PLANO,
    completude: Math.round(100 * preenchidas / CHAVES_SECOES.length),
  };
}
function salvarPlano(tenantId, projectId, { secoes, status }, ator, ip) {
  repo.obterProjeto(tenantId, projectId);
  const limpas = {};
  for (const k of CHAVES_SECOES) if (secoes && secoes[k] != null) limpas[k] = s(secoes[k], 8000);
  const st = ['rascunho', 'em_analise', 'aprovado'].includes(status) ? status : undefined;
  return transacao(() => {
    let p = db.prepare('SELECT * FROM business_plans WHERE tenant_id = ? AND project_id = ?').get(String(tenantId), String(projectId));
    if (!p) {
      const id = novoId();
      db.prepare('INSERT INTO business_plans (id, tenant_id, project_id, secoes, versao, status, criado_em) VALUES (?,?,?,?,0,?,?)')
        .run(id, String(tenantId), String(projectId), '{}', 'rascunho', nowISO());
      p = db.prepare('SELECT * FROM business_plans WHERE id = ?').get(id);
    }
    const atuais = j.parse(p.secoes, {});
    const novas = { ...atuais, ...limpas };
    const versao = p.versao + 1;
    db.prepare('UPDATE business_plans SET secoes = ?, versao = ?, status = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?')
      .run(j.str(novas), versao, st || p.status, nowISO(), s(ator && ator.id, 40), p.id);
    db.prepare('INSERT INTO business_plan_versions (id, tenant_id, plan_id, numero, secoes, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), String(tenantId), p.id, versao, j.str(novas), nowISO(), s(ator && ator.id, 40));
    repo.auditar(tenantId, ator, 'plano.salvar', 'business_plans', p.id, { projeto: String(projectId), versao, status: st || p.status }, ip);
    // projeto em 'ideia'/'incubacao' com plano iniciado sobe naturalmente p/ plano_negocio? NÃO automático — governança é humana.
    return obterPlano(tenantId, projectId);
  });
}
function versoesDoPlano(tenantId, projectId) {
  const p = db.prepare('SELECT id FROM business_plans WHERE tenant_id = ? AND project_id = ?').get(String(tenantId), String(projectId));
  if (!p) return [];
  return db.prepare('SELECT numero, criado_em, criado_por FROM business_plan_versions WHERE tenant_id = ? AND plan_id = ? ORDER BY numero DESC LIMIT 50')
    .all(String(tenantId), p.id);
}
function versaoDoPlano(tenantId, projectId, numero) {
  const p = db.prepare('SELECT id FROM business_plans WHERE tenant_id = ? AND project_id = ?').get(String(tenantId), String(projectId));
  if (!p) throw new Error('Plano não encontrado.');
  const v = db.prepare('SELECT * FROM business_plan_versions WHERE tenant_id = ? AND plan_id = ? AND numero = ?')
    .get(String(tenantId), p.id, Math.trunc(Number(numero)));
  if (!v) throw new Error('Versão não encontrada.');
  return { numero: v.numero, criado_em: v.criado_em, secoes: j.parse(v.secoes, {}), catalogo: SECOES_PLANO };
}

// ------------------------------------------------------------ viabilidade
function obterViabilidade(tenantId, projectId) {
  repo.obterProjeto(tenantId, projectId);
  const v = db.prepare('SELECT * FROM viability_scores WHERE tenant_id = ? AND project_id = ?').get(String(tenantId), String(projectId));
  return {
    existe: !!v,
    criterios: v ? j.parse(v.criterios, {}) : {},
    score: v ? v.score : 0,
    observacoes: v ? v.observacoes : '',
    catalogo: CRITERIOS_VIABILIDADE,
  };
}
function salvarViabilidade(tenantId, projectId, { criterios, observacoes }, ator, ip) {
  repo.obterProjeto(tenantId, projectId);
  const limpos = {};
  for (const k of CHAVES_CRITERIOS) {
    if (criterios && criterios[k] != null) limpos[k] = Math.min(Math.max(0, Math.round(Number(criterios[k]) || 0)), 10);
  }
  const atual = db.prepare('SELECT criterios FROM viability_scores WHERE tenant_id = ? AND project_id = ?').get(String(tenantId), String(projectId));
  const todos = { ...(atual ? j.parse(atual.criterios, {}) : {}), ...limpos };
  const preenchidos = CHAVES_CRITERIOS.filter(k => todos[k] != null);
  const score = preenchidos.length ? Math.round(preenchidos.reduce((a, k) => a + Number(todos[k] || 0), 0) / preenchidos.length * 10) : 0;
  db.prepare(`INSERT INTO viability_scores (tenant_id, project_id, criterios, score, observacoes, atualizado_em, atualizado_por) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT (tenant_id, project_id) DO UPDATE SET criterios = excluded.criterios, score = excluded.score,
      observacoes = excluded.observacoes, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`)
    .run(String(tenantId), String(projectId), j.str(todos), score, s(observacoes, 1000), nowISO(), s(ator && ator.id, 40));
  // espelha no projeto (campo usado pelo ranking/dashboard)
  db.prepare('UPDATE projects SET viabilidade = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?')
    .run(score, nowISO(), String(projectId), String(tenantId));
  repo.auditar(tenantId, ator, 'viabilidade.salvar', 'viability_scores', String(projectId), { score, criterios_preenchidos: preenchidos.length }, ip);
  return obterViabilidade(tenantId, projectId);
}

// ------------------------------------------------------------ decisões (governança)
const DECISOES = ['avancar', 'amadurecer', 'pausar', 'descartar', 'retomar'];
function registrarDecisao(tenantId, projectId, { decisao, justificativa }, ator, ip) {
  const p = repo.obterProjeto(tenantId, projectId);
  if (!DECISOES.includes(decisao)) throw new Error(`Decisão inválida (${DECISOES.join(', ')}).`);
  if (!s(justificativa, 1000)) throw new Error('A decisão exige justificativa (governança).');
  db.prepare('INSERT INTO project_decisions (tenant_id, project_id, decisao, justificativa, decidido_por, decidido_nome, criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(String(tenantId), p.id, decisao, s(justificativa, 1000), s(ator && ator.id, 40), s(ator && ator.nome, 120), nowISO());
  // efeitos automáticos no projeto
  if (decisao === 'pausar') db.prepare("UPDATE projects SET status = 'pausado', atualizado_em = ? WHERE id = ?").run(nowISO(), p.id);
  if (decisao === 'descartar') db.prepare("UPDATE projects SET status = 'cancelado', atualizado_em = ? WHERE id = ?").run(nowISO(), p.id);
  if (decisao === 'retomar') db.prepare("UPDATE projects SET status = 'ativo', atualizado_em = ? WHERE id = ?").run(nowISO(), p.id);
  repo.auditar(tenantId, ator, 'projeto.decisao', 'project_decisions', p.id, { decisao, justificativa: s(justificativa, 200) }, ip);
  return listarDecisoes(tenantId, projectId);
}
function listarDecisoes(tenantId, projectId) {
  repo.obterProjeto(tenantId, projectId);
  return db.prepare('SELECT decisao, justificativa, decidido_nome, criado_em FROM project_decisions WHERE tenant_id = ? AND project_id = ? ORDER BY criado_em DESC LIMIT 100')
    .all(String(tenantId), String(projectId));
}

// ------------------------------------------------------------ ranking / matriz
// Score composto p/ ordenar oportunidades: viabilidade (peso 3) + retorno
// relativo receita/investimento (peso 2) + prioridade (peso 1), 0-100.
function ranking(tenantId) {
  const projs = repo.listarProjetos(tenantId, {}).filter(p => p.status === 'ativo');
  const linhas = projs.map(p => {
    const retorno = p.investimento_estimado > 0 ? Math.min(p.receita_potencial / p.investimento_estimado, 5) / 5 * 100 : (p.receita_potencial > 0 ? 100 : 0);
    const pri = { alta: 100, media: 50, baixa: 0 }[p.prioridade] || 50;
    const composto = Math.round((p.viabilidade * 3 + retorno * 2 + pri * 1) / 6);
    // matriz: impacto = média(viabilidade, retorno); esforço = investimento normalizado
    const impacto = Math.round((p.viabilidade + retorno) / 2);
    const quadrante = impacto >= 50
      ? (p.investimento_estimado <= 10000000 ? 'ganho_rapido' : 'aposta_grande')   // ≤ R$100k = esforço baixo
      : (p.investimento_estimado <= 10000000 ? 'tarefa_menor' : 'reavaliar');
    return {
      id: p.id, nome: p.nome, categoria: p.categoria, estagio: p.estagio, horizonte: p.horizonte,
      prioridade: p.prioridade, viabilidade: p.viabilidade,
      investimento_estimado: p.investimento_estimado, receita_potencial: p.receita_potencial,
      retorno_relativo: Math.round(retorno), score_composto: composto, impacto, quadrante,
      tem_plano: !!db.prepare('SELECT 1 FROM business_plans WHERE tenant_id = ? AND project_id = ?').get(String(tenantId), p.id),
    };
  }).sort((a, b) => b.score_composto - a.score_composto);
  return { ranking: linhas, quadrantes: { ganho_rapido: 'Ganho rápido (alto impacto, baixo esforço)', aposta_grande: 'Aposta grande (alto impacto, alto esforço)', tarefa_menor: 'Tarefa menor (baixo impacto, baixo esforço)', reavaliar: 'Reavaliar (baixo impacto, alto esforço)' } };
}

module.exports = {
  SECOES_PLANO, CRITERIOS_VIABILIDADE, DECISOES,
  obterPlano, salvarPlano, versoesDoPlano, versaoDoPlano,
  obterViabilidade, salvarViabilidade,
  registrarDecisao, listarDecisoes,
  ranking,
};
