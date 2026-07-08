// =====================================================================
// Villela Projects & Events — Fase 6: motor de automações (gatilho → ação)
// + relatório diário do CEO.
//
// GATILHOS avaliam o estado atual do tenant e devolvem uma lista de itens
// que "acenderam". AÇÕES reagem (notificar o dono da plataforma no WhatsApp,
// e-mail, criar tarefa, registrar no log). Uma automação = 1 gatilho + 1 ação.
// A avaliação é chamada por endpoint (uma Tarefa do Windows/cron dispara em
// produção); tudo fica logado em automation_runs. `testar` = dry-run.
//
// PRINCÍPIO: ações que falam com pessoas reais (WhatsApp/e-mail) usam os
// mesmos hooks injetados no módulo (notificar/enviarEmail) — sem canal novo.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = repo.s;
const hoje = () => nowISO().slice(0, 10);
const emDias = (n) => new Date(Date.now() + (Number(n) || 0) * 86400000).toISOString().slice(0, 10);
const brl = (c) => 'R$ ' + (Math.round(Number(c) || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GATILHOS = {
  tarefa_atrasada: { nome: 'Tarefa atrasada', desc: 'Existem tarefas com prazo vencido não concluídas.' },
  evento_proximo: { nome: 'Evento próximo', desc: 'Evento confirmado/aprovado dentro de N dias.', param: 'dias' },
  deal_parado: { nome: 'Oportunidade parada', desc: 'Deal em aberto sem movimentação há N dias.', param: 'dias' },
  conta_vencendo: { nome: 'Conta a vencer/vencida', desc: 'Receita ou despesa a vencer dentro de N dias (ou já vencida).', param: 'dias' },
  projeto_sem_atividade: { nome: 'Projeto sem atividade', desc: 'Projeto ativo sem atualização há N dias.', param: 'dias' },
};
const ACOES = {
  notificar_augusto: { nome: 'Notificar no WhatsApp (dono da plataforma)', desc: 'Envia alerta ao dono da plataforma.' },
  alerta_email: { nome: 'Enviar e-mail', desc: 'Envia e-mail para o endereço configurado.', param: 'email' },
  criar_tarefa: { nome: 'Criar tarefa', desc: 'Cria uma tarefa no projeto configurado.', param: 'project_id' },
  registrar_log: { nome: 'Só registrar', desc: 'Apenas registra a ocorrência (sem notificar).' },
};

// ------------------------------------------------------------ CRUD
function limparConfig(o) { try { return j.parse(j.str(o || {}), {}); } catch { return {}; } }

function criarAutomacao(tenantId, campos, ator, ip) {
  if (!s(campos.nome, 160)) throw new Error('Dê um nome à automação.');
  if (!GATILHOS[campos.gatilho]) throw new Error('Gatilho inválido.');
  if (!ACOES[campos.acao]) throw new Error('Ação inválida.');
  repo.checarLimite(tenantId, 'automacoes', 1); // limite de automações do plano
  const id = novoId();
  db.prepare(`INSERT INTO automations (id, tenant_id, nome, gatilho, gatilho_config, acao, acao_config, ativo, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(tenantId), s(campos.nome, 160), campos.gatilho, j.str(limparConfig(campos.gatilho_config)),
      campos.acao, j.str(limparConfig(campos.acao_config)), campos.ativo === false ? 0 : 1, nowISO(), s(ator && ator.id, 40));
  repo.registrarUso(tenantId, 'automacoes', 1);
  repo.auditar(tenantId, ator, 'automacao.criar', 'automations', id, { nome: s(campos.nome, 120), gatilho: campos.gatilho, acao: campos.acao }, ip);
  return obterAutomacao(tenantId, id);
}
function obterAutomacao(tenantId, id) {
  const a = db.prepare('SELECT * FROM automations WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!a) throw new Error('Automação não encontrada.');
  a.gatilho_config = j.parse(a.gatilho_config, {});
  a.acao_config = j.parse(a.acao_config, {});
  a.ativo = !!a.ativo;
  return a;
}
function listarAutomacoes(tenantId) {
  return db.prepare('SELECT * FROM automations WHERE tenant_id = ? ORDER BY criado_em DESC').all(String(tenantId))
    .map(a => ({ ...a, gatilho_config: j.parse(a.gatilho_config, {}), acao_config: j.parse(a.acao_config, {}), ativo: !!a.ativo }));
}
function atualizarAutomacao(tenantId, id, campos, ator, ip) {
  const a = obterAutomacao(tenantId, id);
  if (campos.gatilho && !GATILHOS[campos.gatilho]) throw new Error('Gatilho inválido.');
  if (campos.acao && !ACOES[campos.acao]) throw new Error('Ação inválida.');
  db.prepare(`UPDATE automations SET nome = ?, gatilho = ?, gatilho_config = ?, acao = ?, acao_config = ?, ativo = ?, atualizado_em = ?
    WHERE id = ? AND tenant_id = ?`)
    .run(s(campos.nome || a.nome, 160), campos.gatilho || a.gatilho,
      j.str(campos.gatilho_config != null ? limparConfig(campos.gatilho_config) : a.gatilho_config),
      campos.acao || a.acao, j.str(campos.acao_config != null ? limparConfig(campos.acao_config) : a.acao_config),
      campos.ativo != null ? (campos.ativo ? 1 : 0) : (a.ativo ? 1 : 0), nowISO(), a.id, String(tenantId));
  repo.auditar(tenantId, ator, 'automacao.atualizar', 'automations', a.id, {}, ip);
  return obterAutomacao(tenantId, a.id);
}
function excluirAutomacao(tenantId, id, ator, ip) {
  const r = db.prepare('DELETE FROM automations WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Automação não encontrada.');
  db.prepare('DELETE FROM automation_runs WHERE tenant_id = ? AND automation_id = ?').run(String(tenantId), String(id));
  repo.auditar(tenantId, ator, 'automacao.excluir', 'automations', String(id), {}, ip);
}
function historico(tenantId, id, limite = 20) {
  return db.prepare('SELECT id, disparou, itens, detalhe, criado_em FROM automation_runs WHERE tenant_id = ? AND automation_id = ? ORDER BY criado_em DESC LIMIT ?')
    .all(String(tenantId), String(id), Math.min(100, Math.max(1, parseInt(limite, 10) || 20)))
    .map(r => ({ ...r, disparou: !!r.disparou }));
}

// ------------------------------------------------------------ gatilhos
// cada um devolve { itens: [...], resumo: 'texto' }
function avaliarGatilho(tenantId, gatilho, config) {
  const dias = Math.max(0, Math.trunc(Number(config && config.dias) || 0)) || 7;
  if (gatilho === 'tarefa_atrasada') {
    const tarefas = require('./tarefas');
    const itens = tarefas.listarTarefas(tenantId, { so_atrasadas: true }).map(t => ({ ref: t.id, texto: t.titulo, extra: t.prazo }));
    return { itens, resumo: itens.length ? `${itens.length} tarefa(s) atrasada(s)` : 'nenhuma tarefa atrasada' };
  }
  if (gatilho === 'evento_proximo') {
    const lim = emDias(dias);
    const rows = db.prepare("SELECT id, nome, data, status FROM events WHERE tenant_id = ? AND status IN ('aprovado','confirmado','em_preparacao') AND data != '' AND data >= ? AND data <= ? ORDER BY data")
      .all(String(tenantId), hoje(), lim);
    const itens = rows.map(e => ({ ref: e.id, texto: e.nome, extra: e.data }));
    return { itens, resumo: itens.length ? `${itens.length} evento(s) em ${dias} dia(s)` : `nenhum evento em ${dias} dia(s)` };
  }
  if (gatilho === 'deal_parado') {
    const corte = emDias(-dias);
    const rows = db.prepare("SELECT id, titulo, estagio, COALESCE(NULLIF(atualizado_em,''), criado_em) AS mov FROM crm_deals WHERE tenant_id = ? AND status = 'aberto'")
      .all(String(tenantId)).filter(d => String(d.mov).slice(0, 10) <= corte);
    const itens = rows.map(d => ({ ref: d.id, texto: d.titulo, extra: d.estagio }));
    return { itens, resumo: itens.length ? `${itens.length} oportunidade(s) parada(s) há ${dias}+ dia(s)` : 'nenhuma oportunidade parada' };
  }
  if (gatilho === 'conta_vencendo') {
    const lim = emDias(dias);
    const rows = db.prepare("SELECT id, tipo, descricao, valor_centavos, vencimento FROM finance_entries WHERE tenant_id = ? AND status IN ('previsto','pendente') AND vencimento != '' AND vencimento <= ? ORDER BY vencimento")
      .all(String(tenantId), lim);
    const itens = rows.map(f => ({ ref: f.id, texto: `${f.tipo === 'receita' ? '💰' : '💸'} ${f.descricao} (${brl(f.valor_centavos)})`, extra: f.vencimento }));
    return { itens, resumo: itens.length ? `${itens.length} conta(s) a vencer/vencida(s)` : 'nenhuma conta a vencer' };
  }
  if (gatilho === 'projeto_sem_atividade') {
    const corte = emDias(-dias);
    const rows = db.prepare("SELECT id, nome, COALESCE(NULLIF(atualizado_em,''), criado_em) AS mov FROM projects WHERE tenant_id = ? AND status = 'ativo'")
      .all(String(tenantId)).filter(p => String(p.mov).slice(0, 10) <= corte);
    const itens = rows.map(p => ({ ref: p.id, texto: p.nome, extra: String(p.mov).slice(0, 10) }));
    return { itens, resumo: itens.length ? `${itens.length} projeto(s) sem atividade há ${dias}+ dia(s)` : 'nenhum projeto parado' };
  }
  return { itens: [], resumo: 'gatilho desconhecido' };
}

// ------------------------------------------------------------ ações
async function executarAcao(tenantId, autom, disparo, deps) {
  const cfg = autom.acao_config || {};
  const linha = disparo.itens.slice(0, 12).map(i => `• ${i.texto}${i.extra ? ' — ' + i.extra : ''}`).join('\n');
  const empresa = (() => { try { return repo.obterTenant(tenantId).nome; } catch { return ''; } })();
  const cabecalho = `🤖 Automação "${autom.nome}" (${empresa}): ${disparo.resumo}.`;
  if (autom.acao === 'notificar_augusto') {
    if (deps.notificar) await Promise.resolve(deps.notificar(`${cabecalho}\n${linha}`)).catch(() => {});
    return 'notificado';
  }
  if (autom.acao === 'alerta_email') {
    const to = s(cfg.email, 160);
    if (to && deps.enviarEmail) {
      await Promise.resolve(deps.enviarEmail(to, `[Villela Projects] ${autom.nome} — ${disparo.resumo}`,
        `<p>${cabecalho}</p><ul>${disparo.itens.slice(0, 30).map(i => `<li>${s(i.texto, 200)}${i.extra ? ' — ' + s(i.extra, 40) : ''}</li>`).join('')}</ul>`)).catch(() => {});
      return 'e-mail enviado a ' + to;
    }
    return 'e-mail não configurado';
  }
  if (autom.acao === 'criar_tarefa') {
    const pid = s(cfg.project_id, 40);
    if (!pid) return 'projeto não configurado';
    try {
      const tarefas = require('./tarefas');
      const titulo = (s(cfg.titulo, 160) || autom.nome) + ' — ' + disparo.resumo;
      tarefas.criarTarefa(tenantId, pid, { titulo: titulo.slice(0, 200), descricao: linha, prioridade: 'alta' }, { id: 'automacao' }, '');
      return 'tarefa criada';
    } catch (e) { return 'falha ao criar tarefa: ' + e.message; }
  }
  return 'registrado';
}

// avalia UMA automação; grava run. dryRun não executa a ação.
async function rodarUma(tenantId, autom, deps, dryRun) {
  const disparo = avaliarGatilho(tenantId, autom.gatilho, autom.gatilho_config);
  const acendeu = disparo.itens.length > 0;
  let detalhe = disparo.resumo;
  if (acendeu && !dryRun) {
    const res = await executarAcao(tenantId, autom, disparo, deps).catch(e => 'erro: ' + e.message);
    detalhe = `${disparo.resumo} → ${res}`;
    db.prepare('UPDATE automations SET ultima_exec = ?, ultima_msg = ? WHERE id = ? AND tenant_id = ?').run(nowISO(), detalhe.slice(0, 240), autom.id, String(tenantId));
  }
  if (!dryRun) {
    db.prepare('INSERT INTO automation_runs (id, tenant_id, automation_id, disparou, itens, detalhe, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), String(tenantId), autom.id, acendeu ? 1 : 0, disparo.itens.length, detalhe.slice(0, 300), nowISO());
  }
  return { automation_id: autom.id, nome: autom.nome, disparou: acendeu, itens: disparo.itens.length, detalhe, exemplos: disparo.itens.slice(0, 12) };
}

async function testar(tenantId, id) {
  const a = obterAutomacao(tenantId, id);
  return rodarUma(tenantId, a, {}, true);
}
// avalia TODAS as ativas do tenant (chamado por endpoint/cron).
async function avaliarTenant(tenantId, deps = {}) {
  const ativas = listarAutomacoes(tenantId).filter(a => a.ativo);
  const resultados = [];
  for (const a of ativas) resultados.push(await rodarUma(tenantId, a, deps, false));
  return { avaliadas: ativas.length, dispararam: resultados.filter(r => r.disparou).length, resultados };
}

// ------------------------------------------------------------ relatório do CEO
function consolidarCeo(tenantId) {
  const tarefas = require('./tarefas');
  const eventos = require('./eventos');
  const financeiro = require('./financeiro');
  const dash = repo.dashboardTenant(tenantId);
  const exec = tarefas.resumoExecucao(tenantId);
  const ev = eventos.resumoEventos(tenantId);
  const fin = financeiro.consolidado(tenantId, {});
  let funil = null;
  try { funil = require('./comercial').funil(tenantId); } catch (_) {}
  const valorAberto = funil ? Object.values(funil.colunas || {}).reduce((a, c) => a + (c.valor || 0), 0) : 0;
  return {
    projetos_total: dash.projetos_total, projetos_alta_prioridade: (dash.projetos_alta_prioridade || []).length,
    tarefas_abertas: exec.tarefas_abertas || 0, tarefas_atrasadas: exec.tarefas_atrasadas || 0, riscos_criticos: exec.riscos_criticos || 0,
    eventos_confirmados: ev.eventos_confirmados || 0, eventos_proximos_30d: ev.eventos_proximos_30d || 0,
    crm_abertos: funil ? funil.abertos : 0, crm_valor_aberto: valorAberto, crm_taxa_conversao: funil ? funil.taxa_conversao : 0,
    a_receber: fin.a_receber, a_pagar: fin.a_pagar, inadimplencia: fin.inadimplencia, margem_prevista: fin.margem_prevista,
  };
}
function resumoTextoCeo(c) {
  return [
    `Portfólio: ${c.projetos_total} projetos (${c.projetos_alta_prioridade} alta prioridade).`,
    `Execução: ${c.tarefas_abertas} tarefas abertas, ${c.tarefas_atrasadas} atrasadas, ${c.riscos_criticos} riscos críticos.`,
    `Eventos: ${c.eventos_confirmados} confirmados, ${c.eventos_proximos_30d} em 30 dias.`,
    `CRM: ${c.crm_abertos} oportunidades abertas (${brl(c.crm_valor_aberto)}), conversão ${c.crm_taxa_conversao}%.`,
    `Financeiro: a receber ${brl(c.a_receber)}, a pagar ${brl(c.a_pagar)}, inadimplência ${brl(c.inadimplencia)}, margem prevista ${brl(c.margem_prevista)}.`,
  ].join('\n');
}
// gera (ou regenera) o relatório do dia; narrativa por IA se disponível.
async function gerarRelatorioCeo(tenantId, { comIA = true } = {}) {
  const c = consolidarCeo(tenantId);
  let narrativa = '';
  if (comIA) { try { narrativa = await require('./ia').narrar(tenantId, 'ceo', resumoTextoCeo(c)); } catch (_) {} }
  const data = hoje();
  const existente = db.prepare('SELECT id FROM ceo_reports WHERE tenant_id = ? AND data = ?').get(String(tenantId), data);
  if (existente) {
    db.prepare('UPDATE ceo_reports SET conteudo = ?, narrativa = ?, criado_em = ? WHERE id = ?').run(j.str(c), s(narrativa, 8000), nowISO(), existente.id);
    return obterRelatorioCeo(tenantId, existente.id);
  }
  const id = novoId();
  db.prepare('INSERT INTO ceo_reports (id, tenant_id, data, conteudo, narrativa, criado_em) VALUES (?,?,?,?,?,?)')
    .run(id, String(tenantId), data, j.str(c), s(narrativa, 8000), nowISO());
  return obterRelatorioCeo(tenantId, id);
}
function obterRelatorioCeo(tenantId, id) {
  const r = db.prepare('SELECT * FROM ceo_reports WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!r) throw new Error('Relatório não encontrado.');
  return { ...r, conteudo: j.parse(r.conteudo, {}) };
}
function listarRelatoriosCeo(tenantId, limite = 30) {
  return db.prepare('SELECT id, data, narrativa, conteudo, criado_em FROM ceo_reports WHERE tenant_id = ? ORDER BY data DESC LIMIT ?')
    .all(String(tenantId), Math.min(90, Math.max(1, parseInt(limite, 10) || 30)))
    .map(r => ({ ...r, conteudo: j.parse(r.conteudo, {}) }));
}

// ------------------------------------------------------------ rotina diária (todos os tenants)
// Chamada por endpoint key-gated (Tarefa do Windows). Idempotente por dia:
// avalia automações ativas de cada tenant e gera o relatório do CEO 1×/dia.
const temRelatorioHoje = (tenantId) => !!db.prepare('SELECT 1 FROM ceo_reports WHERE tenant_id = ? AND data = ?').get(String(tenantId), hoje());
async function rotinaDiariaTodos(deps = {}) {
  const tenants = repo.listarTenantsPlataforma().filter(t => !['suspensa', 'cancelada'].includes(t.status));
  let automacoesDispararam = 0, relatorios = 0, erros = 0;
  for (const t of tenants) {
    try { const r = await avaliarTenant(t.id, deps); automacoesDispararam += r.dispararam; } catch (_) { erros++; }
    try { if (!temRelatorioHoje(t.id)) { await gerarRelatorioCeo(t.id, { comIA: true }); relatorios++; } } catch (_) { erros++; }
  }
  return { tenants: tenants.length, automacoes_dispararam: automacoesDispararam, relatorios_gerados: relatorios, erros };
}

module.exports = {
  GATILHOS, ACOES,
  criarAutomacao, obterAutomacao, listarAutomacoes, atualizarAutomacao, excluirAutomacao, historico,
  avaliarGatilho, testar, avaliarTenant,
  consolidarCeo, gerarRelatorioCeo, obterRelatorioCeo, listarRelatoriosCeo,
  rotinaDiariaTodos,
};
