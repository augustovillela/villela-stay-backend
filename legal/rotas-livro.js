// =====================================================================
// Villela Legal Intelligence — ONDA LIVRO: rotas da API.
// Registradas por rotas-staff.js sob /staff/api/legal/* — logo a PONTE do
// assinante (index.js montarAssinante) as remonta automaticamente em
// /juridico/api/legal/*, e o mesmo código serve o escritório do Augusto e
// os assinantes do SaaS, cada um no seu banco.
//
// Convenções herdadas: `pode(perm)` autoriza, `h()` padroniza erro,
// `auditar()` registra toda escrita. Rotas de APROVAÇÃO usam requireAuth
// (nunca PUBLISH_KEY) — é o que garante que a máquina não se autoaprova.
// =====================================================================
'use strict';

function registrarRotasLivro(app, ctx) {
  const { repo, L, pode, h, auditar, quemFez, requireAuth, requirePublishOrSession } = ctx;
  const P = '/staff/api/legal';
  const corpo = (req) => req.body || {};

  // =============================================================== 47.1 CRM
  app.get(`${P}/crm/painel`, requireAuth, pode('gerir_crm'), h((req, res) => {
    res.json({ painel: L.Funil.painel(req.query) });
  }));
  app.get(`${P}/crm/leads`, requireAuth, pode('gerir_crm'), h((req, res) => {
    const leads = L.Leads.listar(req.query);
    if (!req.legal.permissoes.ver_dados_sensiveis) for (const l of leads) l.documento = l.documento ? '***' : '';
    res.json({ leads });
  }));
  app.get(`${P}/crm/leads/:id`, requireAuth, pode('gerir_crm'), h((req, res) => {
    const lead = L.Leads.obter(req.params.id);
    if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });
    if (!req.legal.permissoes.ver_dados_sensiveis) lead.documento = lead.documento ? '***' : '';
    res.json({ lead });
  }));
  // aceita PUBLISH_KEY: o agente de atendimento (Cap. 10.7) registra o lead que chegou
  app.post(`${P}/crm/leads`, requirePublishOrSession, pode('gerir_crm'), h((req, res) => {
    const lead = L.Leads.criar(corpo(req), quemFez(req));
    auditar(req, 'crm.lead.criar', 'crm_leads', lead.id, lead.nome);
    res.json({ ok: true, lead });
  }));
  app.patch(`${P}/crm/leads/:id`, requireAuth, pode('gerir_crm'), h((req, res) => {
    const lead = L.Leads.atualizar(req.params.id, corpo(req));
    auditar(req, 'crm.lead.editar', 'crm_leads', lead.id, lead.estagio);
    res.json({ ok: true, lead });
  }));
  app.post(`${P}/crm/leads/:id/interacoes`, requirePublishOrSession, pode('gerir_crm'), h((req, res) => {
    const id = L.Leads.interagir(req.params.id, corpo(req), quemFez(req));
    res.json({ ok: true, id });
  }));
  app.post(`${P}/crm/leads/:id/vincular`, requireAuth, pode('gerir_crm'), h((req, res) => {
    const lead = L.Leads.vincular(req.params.id, corpo(req));
    auditar(req, 'crm.lead.vincular', 'crm_leads', lead.id, `cliente ${lead.client_id} · caso ${lead.case_id}`);
    res.json({ ok: true, lead });
  }));
  // propostas (envio exige aprovação humana — 47.1)
  app.post(`${P}/crm/leads/:id/propostas`, requireAuth, pode('gerir_crm'), h((req, res) => {
    const proposta = L.Propostas.criar(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'crm.proposta.criar', 'crm_proposals', proposta.id, '');
    res.json({ ok: true, proposta });
  }));
  app.patch(`${P}/crm/propostas/:id`, requireAuth, pode('gerir_crm'), h((req, res) => {
    res.json({ ok: true, proposta: L.Propostas.atualizar(req.params.id, corpo(req)) });
  }));
  app.post(`${P}/crm/propostas/:id/aprovar`, requireAuth, pode('enviar_cliente'), h((req, res) => {
    const proposta = L.Propostas.aprovar(req.params.id, quemFez(req));
    auditar(req, 'crm.proposta.aprovar', 'crm_proposals', proposta.id, 'aprovada por ' + quemFez(req));
    res.json({ ok: true, proposta });
  }));
  app.post(`${P}/crm/propostas/:id/enviada`, requireAuth, pode('enviar_cliente'), h((req, res) => {
    const proposta = L.Propostas.marcarEnviada(req.params.id, quemFez(req));
    auditar(req, 'crm.proposta.enviada', 'crm_proposals', proposta.id, '');
    res.json({ ok: true, proposta });
  }));
  app.post(`${P}/crm/propostas/:id/desfecho`, requireAuth, pode('gerir_crm'), h((req, res) => {
    const proposta = L.Propostas.desfecho(req.params.id, corpo(req));
    auditar(req, 'crm.proposta.desfecho', 'crm_proposals', proposta.id, proposta.status);
    res.json({ ok: true, proposta });
  }));
  // conflito de interesses (17.1) + KYC (17.4)
  app.get(`${P}/crm/conflitos`, requireAuth, pode('gerir_crm'), h((req, res) => {
    if (req.query.termo) return res.json({ pesquisa: L.Conflitos.pesquisar(req.query.termo) });
    res.json({ registros: L.Conflitos.listar(req.query) });
  }));
  app.post(`${P}/crm/conflitos`, requireAuth, pode('gerir_crm'), h((req, res) => {
    const registro = L.Conflitos.registrar(corpo(req), quemFez(req));
    auditar(req, 'crm.conflito', 'conflict_checks', registro.id, `${registro.termo} → ${registro.veredito}`);
    res.json({ ok: true, registro });
  }));
  app.get(`${P}/crm/kyc`, requireAuth, pode('gerir_crm'), h((req, res) => res.json({ registros: L.KYC.de(req.query) })));
  app.post(`${P}/crm/kyc`, requireAuth, pode('gerir_crm'), h((req, res) => {
    const registro = L.KYC.salvar(corpo(req), quemFez(req));
    auditar(req, 'crm.kyc', 'kyc_checks', registro.id, '');
    res.json({ ok: true, registro });
  }));

  // ================================================ 47.7/47.8 PESQUISA
  app.get(`${P}/pesquisa/projetos`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ projetos: L.Pesquisas.listar(req.query) });
  }));
  app.get(`${P}/pesquisa/projetos/:id`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    const projeto = L.Pesquisas.obter(req.params.id);
    if (!projeto) return res.status(404).json({ erro: 'Pesquisa não encontrada.' });
    res.json({ projeto });
  }));
  app.post(`${P}/pesquisa/projetos`, requirePublishOrSession, pode('gerir_pesquisa'), h((req, res) => {
    const projeto = L.Pesquisas.criar(corpo(req), quemFez(req));
    auditar(req, 'pesquisa.criar', 'research_projects', projeto.id, projeto.titulo);
    res.json({ ok: true, projeto });
  }));
  app.patch(`${P}/pesquisa/projetos/:id`, requirePublishOrSession, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ ok: true, projeto: L.Pesquisas.atualizar(req.params.id, corpo(req)) });
  }));
  // achado nasce SEMPRE como hipótese; o agente de pesquisa (10.6) pode alimentar
  app.post(`${P}/pesquisa/projetos/:id/achados`, requirePublishOrSession, pode('gerir_pesquisa'), h((req, res) => {
    const achado = L.Achados.criar(req.params.id, corpo(req));
    auditar(req, 'pesquisa.achado', 'research_findings', achado.id, achado.identificacao);
    res.json({ ok: true, achado });
  }));
  app.patch(`${P}/pesquisa/achados/:id`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ ok: true, achado: L.Achados.atualizar(req.params.id, corpo(req)) });
  }));
  // CONFERIR é ato humano (move do bloco "hipótese" para "conferido")
  app.post(`${P}/pesquisa/achados/:id/conferir`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    const achado = L.Achados.conferir(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'pesquisa.conferir', 'research_findings', achado.id, achado.identificacao);
    res.json({ ok: true, achado });
  }));
  app.delete(`${P}/pesquisa/achados/:id`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ ok: true, removidos: L.Achados.remover(req.params.id) });
  }));
  app.get(`${P}/pesquisa/projetos/:id/relatorio`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    const html = L.Achados.relatorio(req.params.id);
    auditar(req, 'pesquisa.relatorio', 'research_projects', req.params.id, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }));
  // base normativa (33)
  app.get(`${P}/pesquisa/normas`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ normas: L.Normas.listar(req.query), desatualizadas: L.Normas.desatualizadas() });
  }));
  app.get(`${P}/pesquisa/normas/:id`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    const norma = L.Normas.obter(req.params.id);
    if (!norma) return res.status(404).json({ erro: 'Norma não encontrada.' });
    res.json({ norma });
  }));
  app.post(`${P}/pesquisa/normas`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    const norma = L.Normas.criar(corpo(req), quemFez(req));
    auditar(req, 'norma.criar', 'norms', norma.id, norma.identificacao);
    res.json({ ok: true, norma });
  }));
  app.patch(`${P}/pesquisa/normas/:id`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ ok: true, norma: L.Normas.atualizar(req.params.id, corpo(req)) });
  }));
  app.post(`${P}/pesquisa/normas/:id/conferir`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    const norma = L.Normas.conferir(req.params.id, quemFez(req));
    auditar(req, 'norma.conferir', 'norms', norma.id, norma.identificacao);
    res.json({ ok: true, norma });
  }));
  app.post(`${P}/pesquisa/normas/:id/versoes`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ ok: true, id: L.Normas.addVersao(req.params.id, corpo(req)) });
  }));
  // monitoramento normativo (33.7 / 31.3 / 31.4)
  app.get(`${P}/pesquisa/monitores`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ monitores: L.Monitores.listar(req.query), alertas: L.Monitores.alertas({ status: 'novo' }) });
  }));
  app.post(`${P}/pesquisa/monitores`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    const monitor = L.Monitores.criar(corpo(req), quemFez(req));
    auditar(req, 'monitor.criar', 'norm_watches', monitor.id, monitor.titulo);
    res.json({ ok: true, monitor });
  }));
  app.patch(`${P}/pesquisa/monitores/:id`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ ok: true, monitor: L.Monitores.atualizar(req.params.id, corpo(req)) });
  }));
  app.get(`${P}/pesquisa/alertas`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    res.json({ alertas: L.Monitores.alertas(req.query) });
  }));
  // rotina/agente alimenta os alertas do monitor
  app.post(`${P}/pesquisa/monitores/:id/alertas`, requirePublishOrSession, pode('gerir_pesquisa'), h((req, res) => {
    const alerta = L.Monitores.addAlerta(req.params.id, corpo(req));
    res.json({ ok: true, alerta });
  }));
  app.patch(`${P}/pesquisa/alertas/:id`, requireAuth, pode('gerir_pesquisa'), h((req, res) => {
    const alerta = L.Monitores.analisarAlerta(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'monitor.alerta', 'norm_alerts', alerta.id, alerta.status);
    res.json({ ok: true, alerta });
  }));

  // ============================ ESTRATÉGIA E MATRIZES (23/24/5.6/26/30)
  // Conteúdo sigiloso: exige ver_dados_sensiveis, como a estratégia do processo.
  const podeSigilo = (req, res, next) => {
    if (!req.legal.permissoes.ver_dados_sensiveis && !req.legal.permissoes.gerir_estrategia) {
      return res.status(403).json({ erro: 'Estratégia e matrizes são sigilosas — sem permissão.' });
    }
    next();
  };
  app.get(`${P}/estrategia/:caseId`, requireAuth, pode('ver_processos'), podeSigilo, h((req, res) => {
    res.json(L.Estrategia.obter(req.params.caseId));
  }));
  app.post(`${P}/estrategia/:caseId`, requireAuth, pode('gerir_estrategia'), h((req, res) => {
    const r = L.Estrategia.salvar(req.params.caseId, corpo(req), quemFez(req));
    auditar(req, 'estrategia.salvar', 'case_strategies', req.params.caseId, '');
    res.json({ ok: true, ...r });
  }));
  app.post(`${P}/estrategia/:caseId/cenarios`, requireAuth, pode('gerir_estrategia'), h((req, res) => {
    res.json({ ok: true, cenario: L.Estrategia.addCenario(req.params.caseId, corpo(req)) });
  }));
  app.delete(`${P}/estrategia/cenarios/:id`, requireAuth, pode('gerir_estrategia'), h((req, res) => {
    res.json({ ok: true, removidos: L.Estrategia.removerCenario(req.params.id) });
  }));
  app.post(`${P}/estrategia/:caseId/decisoes`, requireAuth, pode('gerir_estrategia'), h((req, res) => {
    const decisao = L.Estrategia.addDecisao(req.params.caseId, corpo(req), quemFez(req));
    auditar(req, 'estrategia.decisao', 'strategy_decisions', decisao.id, '');
    res.json({ ok: true, decisao });
  }));
  app.post(`${P}/estrategia/:caseId/recursos`, requireAuth, pode('gerir_estrategia'), h((req, res) => {
    res.json({ ok: true, recurso: L.Estrategia.addRecurso(req.params.caseId, corpo(req)) });
  }));
  app.post(`${P}/estrategia/recursos/:id/decidir`, requireAuth, pode('gerir_estrategia'), h((req, res) => {
    const recurso = L.Estrategia.decidirRecurso(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'estrategia.recurso', 'appeal_options', recurso.id, recurso.recomendacao);
    res.json({ ok: true, recurso });
  }));
  app.post(`${P}/estrategia/negociacao`, requireAuth, pode('gerir_estrategia'), h((req, res) => {
    res.json({ ok: true, rodada: L.Estrategia.addNegociacao(corpo(req), quemFez(req)) });
  }));
  app.get(`${P}/estrategia/negociacao/listar`, requireAuth, pode('gerir_estrategia'), h((req, res) => {
    res.json({ rodadas: L.Estrategia.negociacoes(req.query) });
  }));
  // matriz de fatos (5.6)
  app.get(`${P}/matrizes/:caseId/fatos`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ fatos: L.Fatos.listar(req.params.caseId) });
  }));
  app.post(`${P}/matrizes/:caseId/fatos`, requireAuth, pode('editar_processos'), h((req, res) => {
    res.json({ ok: true, fato: L.Fatos.criar(req.params.caseId, corpo(req)) });
  }));
  app.patch(`${P}/matrizes/fatos/:id`, requireAuth, pode('editar_processos'), h((req, res) => {
    res.json({ ok: true, fato: L.Fatos.atualizar(req.params.id, corpo(req)) });
  }));
  app.delete(`${P}/matrizes/fatos/:id`, requireAuth, pode('editar_processos'), h((req, res) => {
    res.json({ ok: true, removidos: L.Fatos.remover(req.params.id) });
  }));
  // matriz de provas (24.1)
  app.get(`${P}/matrizes/:caseId/provas`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ provas: L.Provas.listar(req.params.caseId), lacunas: L.Provas.lacunas(req.params.caseId) });
  }));
  app.post(`${P}/matrizes/:caseId/provas`, requireAuth, pode('editar_processos'), h((req, res) => {
    res.json({ ok: true, prova: L.Provas.criar(req.params.caseId, corpo(req)) });
  }));
  app.patch(`${P}/matrizes/provas/:id`, requireAuth, pode('editar_processos'), h((req, res) => {
    res.json({ ok: true, prova: L.Provas.atualizar(req.params.id, corpo(req)) });
  }));
  app.delete(`${P}/matrizes/provas/:id`, requireAuth, pode('editar_processos'), h((req, res) => {
    res.json({ ok: true, removidos: L.Provas.remover(req.params.id) });
  }));
  // diagnóstico do processo (21.9) — IA pode gerar via chave; validar é humano
  app.get(`${P}/matrizes/:caseId/diagnosticos`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ diagnosticos: L.Diagnostico.listar(req.params.caseId) });
  }));
  app.post(`${P}/matrizes/:caseId/diagnosticos`, requirePublishOrSession, pode('editar_processos'), h((req, res) => {
    const diagnostico = L.Diagnostico.criar(req.params.caseId, corpo(req), quemFez(req));
    auditar(req, 'diagnostico.criar', 'case_diagnostics', diagnostico.id, diagnostico.origem);
    res.json({ ok: true, diagnostico });
  }));
  app.patch(`${P}/matrizes/diagnosticos/:id`, requireAuth, pode('editar_processos'), h((req, res) => {
    res.json({ ok: true, diagnostico: L.Diagnostico.atualizar(req.params.id, corpo(req)) });
  }));
  app.post(`${P}/matrizes/diagnosticos/:id/validar`, requireAuth, pode('aprovar_documentos'), h((req, res) => {
    const diagnostico = L.Diagnostico.validar(req.params.id, quemFez(req));
    auditar(req, 'diagnostico.validar', 'case_diagnostics', diagnostico.id, '');
    res.json({ ok: true, diagnostico });
  }));

  // ==================================== 47.9 CONTRATOS: CICLO DE VIDA
  app.get(`${P}/contratos-ciclo`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    res.json({ contratos: L.ContratosCiclo.listar(req.query), alertas: L.ContratosCiclo.alertas(req.query) });
  }));
  app.get(`${P}/contratos-ciclo/:id`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    const contrato = L.ContratosCiclo.obter(req.params.id);
    if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });
    res.json({ contrato });
  }));
  app.post(`${P}/contratos-ciclo`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    const contrato = L.ContratosCiclo.criar(corpo(req), quemFez(req));
    auditar(req, 'contrato.criar', 'contract_records', contrato.id, contrato.titulo);
    res.json({ ok: true, contrato });
  }));
  app.patch(`${P}/contratos-ciclo/:id`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    res.json({ ok: true, contrato: L.ContratosCiclo.atualizar(req.params.id, corpo(req)) });
  }));
  app.post(`${P}/contratos-ciclo/:id/mover`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    const contrato = L.ContratosCiclo.mover(req.params.id, corpo(req).status, quemFez(req));
    auditar(req, 'contrato.mover', 'contract_records', contrato.id, contrato.status);
    res.json({ ok: true, contrato });
  }));
  app.post(`${P}/contratos-ciclo/:id/aprovacao`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    res.json({ ok: true, contrato: L.ContratosCiclo.pedirAprovacao(req.params.id, corpo(req)) });
  }));
  // decidir alçada exige a permissão de aprovar (sócio/coordenador)
  app.post(`${P}/contratos-ciclo/aprovacoes/:id`, requireAuth, pode('aprovar_documentos'), h((req, res) => {
    const contrato = L.ContratosCiclo.decidirAprovacao(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'contrato.alcada', 'contract_approvals', req.params.id, corpo(req).decisao || '');
    res.json({ ok: true, contrato });
  }));
  app.post(`${P}/contratos-ciclo/:id/obrigacoes`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    res.json({ ok: true, obrigacao: L.ContratosCiclo.addObrigacao(req.params.id, corpo(req)) });
  }));
  app.patch(`${P}/contratos-ciclo/obrigacoes/:id`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    res.json({ ok: true, obrigacao: L.ContratosCiclo.atualizarObrigacao(req.params.id, corpo(req)) });
  }));
  // biblioteca de cláusulas em três níveis (29.3)
  app.get(`${P}/clausulas`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    if (req.query.tema && req.query.agrupar) return res.json({ tema: L.Clausulas.porTema(req.query.tema) });
    res.json({ clausulas: L.Clausulas.listar(req.query) });
  }));
  app.post(`${P}/clausulas`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    const clausula = L.Clausulas.criar(corpo(req), quemFez(req));
    auditar(req, 'clausula.criar', 'clause_library', clausula.id, `${clausula.tema} (${clausula.nivel})`);
    res.json({ ok: true, clausula });
  }));
  app.patch(`${P}/clausulas/:id`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    res.json({ ok: true, clausula: L.Clausulas.atualizar(req.params.id, corpo(req)) });
  }));
  app.delete(`${P}/clausulas/:id`, requireAuth, pode('gerir_contratos'), h((req, res) => {
    res.json({ ok: true, removidos: L.Clausulas.remover(req.params.id) });
  }));

  // ================================= 47.10 FINANCEIRO + 37.5 HORAS
  app.get(`${P}/fin/painel`, requireAuth, pode('ver_financeiro'), h((req, res) => {
    res.json({ resumo: L.PainelFin.resumo(), fluxo: L.PainelFin.fluxo(req.query) });
  }));
  app.get(`${P}/fin/rentabilidade`, requireAuth, pode('ver_financeiro'), h((req, res) => {
    res.json(L.PainelFin.rentabilidade(req.query));
  }));
  app.get(`${P}/fin/honorarios`, requireAuth, pode('ver_financeiro'), h((req, res) => {
    res.json({ honorarios: L.Honorarios.listar(req.query) });
  }));
  app.post(`${P}/fin/honorarios`, requireAuth, pode('gerir_financeiro'), h((req, res) => {
    const honorario = L.Honorarios.criar(corpo(req), quemFez(req));
    auditar(req, 'fin.honorario.criar', 'fee_agreements', honorario.id, honorario.modalidade);
    res.json({ ok: true, honorario });
  }));
  app.patch(`${P}/fin/honorarios/:id`, requireAuth, pode('gerir_financeiro'), h((req, res) => {
    res.json({ ok: true, honorario: L.Honorarios.atualizar(req.params.id, corpo(req)) });
  }));
  // horas: cada um aponta as suas
  app.get(`${P}/fin/horas`, requireAuth, pode('apontar_horas'), h((req, res) => {
    res.json({ horas: L.Horas.listar(req.query) });
  }));
  app.post(`${P}/fin/horas`, requireAuth, pode('apontar_horas'), h((req, res) => {
    const hora = L.Horas.criar(corpo(req), req.user);
    res.json({ ok: true, hora });
  }));
  app.delete(`${P}/fin/horas/:id`, requireAuth, pode('apontar_horas'), h((req, res) => {
    res.json({ ok: true, removidos: L.Horas.remover(req.params.id) });
  }));
  app.get(`${P}/fin/capacidade`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json(L.Horas.capacidade(req.query));
  }));
  // faturas
  app.get(`${P}/fin/faturas`, requireAuth, pode('ver_financeiro'), h((req, res) => {
    res.json({ faturas: L.Faturas.listar(req.query) });
  }));
  app.get(`${P}/fin/faturas/:id`, requireAuth, pode('ver_financeiro'), h((req, res) => {
    const fatura = L.Faturas.obter(req.params.id);
    if (!fatura) return res.status(404).json({ erro: 'Fatura não encontrada.' });
    res.json({ fatura });
  }));
  app.post(`${P}/fin/faturas`, requireAuth, pode('gerir_financeiro'), h((req, res) => {
    const fatura = L.Faturas.criar(corpo(req), quemFez(req));
    auditar(req, 'fin.fatura.criar', 'invoices', fatura.id, String(fatura.valor_centavos));
    res.json({ ok: true, fatura });
  }));
  app.post(`${P}/fin/faturas/de-horas`, requireAuth, pode('gerir_financeiro'), h((req, res) => {
    const fatura = L.Faturas.deHoras(corpo(req));
    auditar(req, 'fin.fatura.horas', 'invoices', fatura.id, String(fatura.valor_centavos));
    res.json({ ok: true, fatura });
  }));
  app.patch(`${P}/fin/faturas/:id`, requireAuth, pode('gerir_financeiro'), h((req, res) => {
    const fatura = L.Faturas.atualizar(req.params.id, corpo(req));
    auditar(req, 'fin.fatura.editar', 'invoices', fatura.id, fatura.status);
    res.json({ ok: true, fatura });
  }));
  // cobrança escalonada (2º aviso exige aprovação)
  app.get(`${P}/fin/cobrancas`, requireAuth, pode('ver_financeiro'), h((req, res) => {
    res.json({ fila: L.Cobranca.fila() });
  }));
  app.post(`${P}/fin/faturas/:id/cobrancas`, requireAuth, pode('gerir_financeiro'), h((req, res) => {
    res.json({ ok: true, cobranca: L.Cobranca.criar(req.params.id, corpo(req), quemFez(req)) });
  }));
  app.post(`${P}/fin/cobrancas/:id/aprovar`, requireAuth, pode('enviar_cliente'), h((req, res) => {
    const cobranca = L.Cobranca.aprovar(req.params.id, quemFez(req));
    auditar(req, 'fin.cobranca.aprovar', 'collection_actions', cobranca.id, 'nível ' + cobranca.nivel);
    res.json({ ok: true, cobranca });
  }));
  app.post(`${P}/fin/cobrancas/:id/enviada`, requireAuth, pode('enviar_cliente'), h((req, res) => {
    const cobranca = L.Cobranca.marcarEnviada(req.params.id, quemFez(req));
    auditar(req, 'fin.cobranca.enviada', 'collection_actions', cobranca.id, 'nível ' + cobranca.nivel);
    res.json({ ok: true, cobranca });
  }));
  app.patch(`${P}/fin/cobrancas/:id`, requireAuth, pode('gerir_financeiro'), h((req, res) => {
    res.json({ ok: true, cobranca: L.Cobranca.registrarResultado(req.params.id, corpo(req).resultado) });
  }));
  // orçamento
  app.get(`${P}/fin/orcamento`, requireAuth, pode('ver_financeiro'), h((req, res) => {
    res.json({ linhas: L.Orcamento.listar(req.query) });
  }));
  app.post(`${P}/fin/orcamento`, requireAuth, pode('gerir_financeiro'), h((req, res) => {
    res.json({ ok: true, linha: L.Orcamento.salvar(corpo(req)) });
  }));
  app.delete(`${P}/fin/orcamento/:id`, requireAuth, pode('gerir_financeiro'), h((req, res) => {
    res.json({ ok: true, removidos: L.Orcamento.remover(req.params.id) });
  }));

  // ============================== 47.3 PORTAL INTERNO + POPs + 47.12
  app.get(`${P}/interno/mural`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ posts: L.Mural.listar(req.query), pendencias_ciencia: L.Mural.pendencias(req.user) });
  }));
  app.post(`${P}/interno/mural`, requireAuth, pode('gerir_pops'), h((req, res) => {
    const post = L.Mural.criar(corpo(req), quemFez(req));
    auditar(req, 'interno.post', 'internal_posts', post.id, post.titulo);
    res.json({ ok: true, post });
  }));
  app.delete(`${P}/interno/mural/:id`, requireAuth, pode('gerir_pops'), h((req, res) => {
    res.json({ ok: true, removidos: L.Mural.remover(req.params.id) });
  }));
  app.post(`${P}/interno/ciencia`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ ok: true, id: L.Mural.darCiencia(corpo(req), req.user) });
  }));
  app.get(`${P}/interno/ciencias`, requireAuth, pode('gerir_pops'), h((req, res) => {
    res.json({ ciencias: L.Mural.ciencias(req.query) });
  }));
  // POPs
  app.get(`${P}/interno/pops`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ pops: L.POPs.listar(req.query) });
  }));
  app.get(`${P}/interno/pops/:id`, requireAuth, pode('ver_processos'), h((req, res) => {
    const pop = L.POPs.obter(req.params.id);
    if (!pop) return res.status(404).json({ erro: 'POP não encontrado.' });
    res.json({ pop });
  }));
  app.post(`${P}/interno/pops`, requireAuth, pode('gerir_pops'), h((req, res) => {
    const pop = L.POPs.criar(corpo(req), quemFez(req));
    auditar(req, 'pop.criar', 'pops', pop.id, pop.titulo);
    res.json({ ok: true, pop });
  }));
  app.patch(`${P}/interno/pops/:id`, requireAuth, pode('gerir_pops'), h((req, res) => {
    res.json({ ok: true, pop: L.POPs.atualizar(req.params.id, corpo(req)) });
  }));
  app.post(`${P}/interno/pops/:id/publicar`, requireAuth, pode('gerir_pops'), h((req, res) => {
    const pop = L.POPs.publicar(req.params.id, quemFez(req));
    auditar(req, 'pop.publicar', 'pops', pop.id, 'v' + pop.versao);
    res.json({ ok: true, pop });
  }));
  app.post(`${P}/interno/pops/:id/executar`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ ok: true, execucao: L.POPs.executar(req.params.id, corpo(req), quemFez(req)) });
  }));
  // decisões internas e solicitações entre áreas
  app.get(`${P}/interno/decisoes`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ decisoes: L.Interno.decisoes(req.query) });
  }));
  app.post(`${P}/interno/decisoes`, requireAuth, pode('gerir_pops'), h((req, res) => {
    const decisao = L.Interno.addDecisao(corpo(req), quemFez(req));
    auditar(req, 'interno.decisao', 'internal_decisions', decisao.id, decisao.assunto);
    res.json({ ok: true, decisao });
  }));
  app.get(`${P}/interno/pedidos`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ pedidos: L.Interno.pedidos(req.query) });
  }));
  app.post(`${P}/interno/pedidos`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ ok: true, pedido: L.Interno.addPedido(corpo(req), quemFez(req)) });
  }));
  app.patch(`${P}/interno/pedidos/:id`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ ok: true, pedido: L.Interno.atualizarPedido(req.params.id, corpo(req)) });
  }));
  // inventário de sistemas/automações (12.8/12.9)
  app.get(`${P}/interno/inventario`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ itens: L.Inventario.listar(req.query) });
  }));
  app.post(`${P}/interno/inventario`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const item = L.Inventario.salvar(corpo(req), quemFez(req));
    auditar(req, 'inventario.salvar', 'system_inventory', item.id, item.nome);
    res.json({ ok: true, item });
  }));
  app.delete(`${P}/interno/inventario/:id`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ ok: true, removidos: L.Inventario.remover(req.params.id) });
  }));
  // 47.12 central de agentes + limites de autonomia (10.10)
  app.get(`${P}/agentes/central`, requireAuth, pode('usar_ia'), h((req, res) => {
    res.json(L.Agentes.central(req.query));
  }));
  app.post(`${P}/agentes/cartas`, requireAuth, pode('gerir_usuarios'), h((req, res) => {
    const carta = L.Agentes.salvar(corpo(req), quemFez(req));
    auditar(req, 'agente.carta', 'agent_charters', carta.id, carta.agente);
    res.json({ ok: true, carta });
  }));
  app.delete(`${P}/agentes/cartas/:id`, requireAuth, pode('gerir_usuarios'), h((req, res) => {
    res.json({ ok: true, removidos: L.Agentes.remover(req.params.id) });
  }));

  // ============================ PARTE VIII — COMPLIANCE / LGPD / CRISES
  app.get(`${P}/compliance/painel`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ resumo: L.PainelCompliance.resumo() });
  }));
  // políticas (inclui a política de uso de IA — 6.10/42.12)
  app.get(`${P}/compliance/politicas`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ politicas: L.Politicas.listar(req.query) });
  }));
  app.get(`${P}/compliance/politicas/:id`, requireAuth, pode('ver_processos'), h((req, res) => {
    const politica = L.Politicas.obter(req.params.id);
    if (!politica) return res.status(404).json({ erro: 'Política não encontrada.' });
    res.json({ politica });
  }));
  app.post(`${P}/compliance/politicas`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const politica = L.Politicas.criar(corpo(req), quemFez(req));
    auditar(req, 'politica.criar', 'policies', politica.id, politica.titulo);
    res.json({ ok: true, politica });
  }));
  app.patch(`${P}/compliance/politicas/:id`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ ok: true, politica: L.Politicas.atualizar(req.params.id, corpo(req)) });
  }));
  app.post(`${P}/compliance/politicas/:id/publicar`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const politica = L.Politicas.publicar(req.params.id, quemFez(req));
    auditar(req, 'politica.publicar', 'policies', politica.id, 'v' + politica.versao);
    res.json({ ok: true, politica });
  }));
  // riscos
  app.get(`${P}/compliance/riscos`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ riscos: L.Riscos.listar(req.query), matriz: L.Riscos.matriz() });
  }));
  app.post(`${P}/compliance/riscos`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const risco = L.Riscos.criar(corpo(req), quemFez(req));
    auditar(req, 'risco.criar', 'risk_register', risco.id, risco.categoria);
    res.json({ ok: true, risco });
  }));
  app.patch(`${P}/compliance/riscos/:id`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ ok: true, risco: L.Riscos.atualizar(req.params.id, corpo(req)) });
  }));
  app.delete(`${P}/compliance/riscos/:id`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ ok: true, removidos: L.Riscos.remover(req.params.id) });
  }));
  // canal de denúncias (só quem tem compliance lê o conteúdo)
  app.get(`${P}/compliance/denuncias`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ denuncias: L.Denuncias.listar(req.query) });
  }));
  app.post(`${P}/compliance/denuncias`, requirePublishOrSession, pode('ver_processos'), h((req, res) => {
    const r = L.Denuncias.registrar(corpo(req));
    res.json({ ok: true, protocolo: r.protocolo });
  }));
  app.patch(`${P}/compliance/denuncias/:id`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const denuncia = L.Denuncias.atualizar(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'denuncia.atualizar', 'whistleblower_reports', denuncia.id, denuncia.status);
    res.json({ ok: true, denuncia });
  }));
  // due diligence de terceiros
  app.get(`${P}/compliance/dd`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ registros: L.DueDiligence.listar(req.query) });
  }));
  app.post(`${P}/compliance/dd`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const registro = L.DueDiligence.salvar(corpo(req), quemFez(req));
    auditar(req, 'dd.salvar', 'third_party_dd', registro.id, registro.terceiro);
    res.json({ ok: true, registro });
  }));
  // LGPD: inventário, titulares, incidentes
  app.get(`${P}/lgpd/inventario`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ tratamentos: L.LGPD.inventario(req.query) });
  }));
  app.post(`${P}/lgpd/inventario`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const tratamento = L.LGPD.salvarTratamento(corpo(req), quemFez(req));
    auditar(req, 'lgpd.inventario', 'data_inventory', tratamento.id, tratamento.tratamento);
    res.json({ ok: true, tratamento });
  }));
  app.delete(`${P}/lgpd/inventario/:id`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ ok: true, removidos: L.LGPD.removerTratamento(req.params.id) });
  }));
  app.get(`${P}/lgpd/titulares`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ pedidos: L.LGPD.pedidos(req.query) });
  }));
  app.post(`${P}/lgpd/titulares`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const pedido = L.LGPD.criarPedido(corpo(req), quemFez(req));
    auditar(req, 'lgpd.titular.criar', 'data_subject_requests', pedido.id, pedido.tipo);
    res.json({ ok: true, pedido });
  }));
  app.patch(`${P}/lgpd/titulares/:id`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const pedido = L.LGPD.responderPedido(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'lgpd.titular.responder', 'data_subject_requests', pedido.id, pedido.status);
    res.json({ ok: true, pedido });
  }));
  app.get(`${P}/lgpd/incidentes`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ incidentes: L.LGPD.incidentes(req.query) });
  }));
  app.post(`${P}/lgpd/incidentes`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const incidente = L.LGPD.salvarIncidente(corpo(req), quemFez(req));
    auditar(req, 'lgpd.incidente', 'security_incidents', incidente.id, incidente.gravidade);
    res.json({ ok: true, incidente });
  }));
  // temporalidade e eliminação (8.8 / 35.11 / 35.12)
  app.get(`${P}/lgpd/temporalidade`, requireAuth, pode('ver_documentos'), h((req, res) => {
    res.json({ tabela: L.Temporalidade.tabela(), eliminacoes: L.Temporalidade.eliminacoes(req.query) });
  }));
  app.post(`${P}/lgpd/temporalidade`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ ok: true, linha: L.Temporalidade.salvar(corpo(req)) });
  }));
  app.delete(`${P}/lgpd/temporalidade/:id`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ ok: true, removidos: L.Temporalidade.remover(req.params.id) });
  }));
  app.post(`${P}/lgpd/eliminacoes`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const registro = L.Temporalidade.registrarEliminacao(corpo(req), quemFez(req));
    auditar(req, 'lgpd.eliminacao', 'disposal_records', registro.id, registro.descricao);
    res.json({ ok: true, registro });
  }));
  // investigações e continuidade (44)
  app.get(`${P}/crises/investigacoes`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ investigacoes: L.Crises.investigacoes(req.query) });
  }));
  app.post(`${P}/crises/investigacoes`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const investigacao = L.Crises.salvarInvestigacao(corpo(req), quemFez(req));
    auditar(req, 'crise.investigacao', 'investigations', investigacao.id, investigacao.status);
    res.json({ ok: true, investigacao });
  }));
  app.get(`${P}/crises/planos`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ planos: L.Crises.planos() });
  }));
  app.post(`${P}/crises/planos`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const plano = L.Crises.salvarPlano(corpo(req), quemFez(req));
    auditar(req, 'crise.plano', 'continuity_plans', plano.id, plano.cenario);
    res.json({ ok: true, plano });
  }));
  // matriz de obrigações legais do cliente (31.2)
  app.get(`${P}/compliance/obrigacoes`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ obrigacoes: L.Obrigacoes.listar(req.query) });
  }));
  app.post(`${P}/compliance/obrigacoes`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    const obrigacao = L.Obrigacoes.salvar(corpo(req));
    auditar(req, 'obrigacao.salvar', 'obligation_matrix', obrigacao.id, obrigacao.obrigacao);
    res.json({ ok: true, obrigacao });
  }));
  app.delete(`${P}/compliance/obrigacoes/:id`, requireAuth, pode('gerir_compliance'), h((req, res) => {
    res.json({ ok: true, removidos: L.Obrigacoes.remover(req.params.id) });
  }));

  // =============================== MARKETING JURÍDICO (Cap. 13/14)
  app.get(`${P}/conteudo`, requireAuth, pode('gerir_conteudo'), h((req, res) => {
    res.json({ itens: L.Conteudo.listar(req.query), painel: L.Conteudo.painel(req.query), checklist: L.Conteudo.checklistPadrao() });
  }));
  app.get(`${P}/conteudo/:id`, requireAuth, pode('gerir_conteudo'), h((req, res) => {
    const item = L.Conteudo.obter(req.params.id);
    if (!item) return res.status(404).json({ erro: 'Conteúdo não encontrado.' });
    res.json({ item, checklist: L.Conteudo.checklistPadrao() });
  }));
  app.post(`${P}/conteudo`, requirePublishOrSession, pode('gerir_conteudo'), h((req, res) => {
    const item = L.Conteudo.criar(corpo(req), quemFez(req));
    auditar(req, 'conteudo.criar', 'content_items', item.id, item.titulo);
    res.json({ ok: true, item });
  }));
  app.patch(`${P}/conteudo/:id`, requireAuth, pode('gerir_conteudo'), h((req, res) => {
    const item = L.Conteudo.atualizar(req.params.id, corpo(req));
    auditar(req, 'conteudo.editar', 'content_items', item.id, item.status);
    res.json({ ok: true, item });
  }));
  // revisão ética: sempre humana e nominal (14.5 / Prov. 205/2021)
  app.post(`${P}/conteudo/:id/etica`, requireAuth, pode('gerir_conteudo'), h((req, res) => {
    const r = L.Conteudo.revisarEtica(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'conteudo.etica', 'content_items', req.params.id, r.etica_status);
    res.json({ ok: true, ...r });
  }));
  app.post(`${P}/conteudo/:id/versoes`, requireAuth, pode('gerir_conteudo'), h((req, res) => {
    res.json({ ok: true, item: L.Conteudo.arquivarVersao(req.params.id, corpo(req), quemFez(req)) });
  }));
  app.delete(`${P}/conteudo/:id`, requireAuth, pode('gerir_conteudo'), h((req, res) => {
    res.json({ ok: true, removidos: L.Conteudo.remover(req.params.id) });
  }));
  app.get(`${P}/conteudo-perguntas`, requireAuth, pode('gerir_conteudo'), h((req, res) => {
    res.json({ perguntas: L.Conteudo.perguntas(req.query) });
  }));
  app.post(`${P}/conteudo-perguntas`, requirePublishOrSession, pode('gerir_conteudo'), h((req, res) => {
    res.json({ ok: true, pergunta: L.Conteudo.addPergunta(corpo(req)) });
  }));

  // ============================= 47.11 CONTROLADORIA JURÍDICA
  app.get(`${P}/controladoria`, requireAuth, pode('ver_controladoria'), h((req, res) => {
    res.json({
      ultimo: L.Controladoria.ultimoRun(), runs: L.Controladoria.runs(req.query),
      achados: L.Controladoria.achados(req.query), regras: L.Controladoria.regras(),
    });
  }));
  app.post(`${P}/controladoria/rodar`, requirePublishOrSession, pode('ver_controladoria'), h((req, res) => {
    const r = L.Controladoria.rodar(corpo(req), quemFez(req));
    auditar(req, 'controladoria.rodar', 'control_runs', r.run.id, `${r.achados} achados`);
    res.json({ ok: true, ...r });
  }));
  app.get(`${P}/controladoria/indicadores`, requireAuth, pode('ver_controladoria'), h((req, res) => {
    res.json({ indicadores: L.Controladoria.indicadores(req.query) });
  }));
  app.patch(`${P}/controladoria/achados/:id`, requireAuth, pode('ver_controladoria'), h((req, res) => {
    const achado = L.Controladoria.tratar(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'controladoria.tratar', 'control_findings', achado.id, achado.status);
    res.json({ ok: true, achado });
  }));

  // ================== 47.2 PORTAL DO CLIENTE: traduções, pendências, NPS
  app.get(`${P}/portal/traducoes`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ traducoes: L.Traducoes.listar(req.query) });
  }));
  // a IA propõe (via chave); a aprovação e a publicação são humanas
  app.post(`${P}/portal/andamentos/:id/traducao`, requirePublishOrSession, pode('editar_processos'), h((req, res) => {
    const traducao = L.Traducoes.criar(req.params.id, corpo(req), quemFez(req));
    res.json({ ok: true, traducao });
  }));
  app.post(`${P}/portal/traducoes/:id/aprovar`, requireAuth, pode('aprovar_documentos'), h((req, res) => {
    const traducao = L.Traducoes.aprovar(req.params.id, quemFez(req));
    auditar(req, 'portal.traducao.aprovar', 'movement_translations', traducao.id, '');
    res.json({ ok: true, traducao });
  }));
  app.post(`${P}/portal/traducoes/:id/reprovar`, requireAuth, pode('aprovar_documentos'), h((req, res) => {
    res.json({ ok: true, traducao: L.Traducoes.reprovar(req.params.id, quemFez(req)) });
  }));
  app.post(`${P}/portal/traducoes/:id/publicar`, requireAuth, pode('enviar_cliente'), h((req, res) => {
    const traducao = L.Traducoes.publicar(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'portal.traducao.publicar', 'movement_translations', traducao.id, '');
    res.json({ ok: true, traducao });
  }));
  app.get(`${P}/portal/pendencias`, requireAuth, pode('gerir_clientes'), h((req, res) => {
    res.json({ pendencias: L.Pendencias.listar(req.query) });
  }));
  app.post(`${P}/portal/pendencias`, requireAuth, pode('gerir_clientes'), h((req, res) => {
    const pendencia = L.Pendencias.criar(corpo(req), quemFez(req));
    auditar(req, 'portal.pendencia', 'client_pendencies', pendencia.id, pendencia.titulo);
    res.json({ ok: true, pendencia });
  }));
  app.patch(`${P}/portal/pendencias/:id`, requireAuth, pode('gerir_clientes'), h((req, res) => {
    res.json({ ok: true, pendencia: L.Pendencias.atualizar(req.params.id, corpo(req)) });
  }));
  app.delete(`${P}/portal/pendencias/:id`, requireAuth, pode('gerir_clientes'), h((req, res) => {
    res.json({ ok: true, removidos: L.Pendencias.remover(req.params.id) });
  }));
  app.get(`${P}/portal/satisfacao`, requireAuth, pode('ver_processos'), h((req, res) => {
    res.json({ respostas: L.Satisfacao.listar(req.query), resumo: L.Satisfacao.resumo(req.query) });
  }));
  app.post(`${P}/portal/satisfacao`, requirePublishOrSession, pode('gerir_clientes'), h((req, res) => {
    res.json({ ok: true, resposta: L.Satisfacao.registrar(corpo(req)) });
  }));

  // ================== 47.4 PRAZOS: escalonamento e ciência de publicação
  app.get(`${P}/prazos-escalonamento`, requireAuth, pode('gerir_prazos'), h((req, res) => {
    res.json({ pendentes: L.Escalonamento.pendentes(), nao_lidos: L.Escalonamento.naoLidos(req.query) });
  }));
  app.post(`${P}/prazos-escalonamento`, requirePublishOrSession, pode('gerir_prazos'), h((req, res) => {
    res.json({ ok: true, alerta: L.Escalonamento.registrar(corpo(req)) });
  }));
  app.post(`${P}/prazos-escalonamento/:id/lido`, requireAuth, pode('gerir_prazos'), h((req, res) => {
    res.json({ ok: true, alerta: L.Escalonamento.confirmarLeitura(req.params.id, req.user) });
  }));
  app.post(`${P}/publicacoes/:id/ciencia`, requireAuth, pode('gerir_publicacoes'), h((req, res) => {
    res.json({ ok: true, id: L.CienciaPublicacao.registrar(req.params.id, req.user) });
  }));
  app.get(`${P}/publicacoes/:id/ciencias`, requireAuth, pode('gerir_publicacoes'), h((req, res) => {
    res.json({ ciencias: L.CienciaPublicacao.de(req.params.id) });
  }));

  // ============ 47.6 DOCUMENTOS: fila de classificação de baixa confiança
  app.get(`${P}/documentos-fila`, requireAuth, pode('ver_documentos'), h((req, res) => {
    res.json({ fila: L.FilaDocs.fila(req.query), limiar: L.FilaDocs.LIMIAR });
  }));
  app.post(`${P}/documentos-fila`, requirePublishOrSession, pode('criar_documentos'), h((req, res) => {
    res.json({ ok: true, item: L.FilaDocs.enfileirar(corpo(req)) });
  }));
  app.patch(`${P}/documentos-fila/:id`, requireAuth, pode('editar_documentos'), h((req, res) => {
    const item = L.FilaDocs.decidir(req.params.id, corpo(req), quemFez(req));
    auditar(req, 'documento.classificar', 'doc_classification_queue', item.id, item.status);
    res.json({ ok: true, item });
  }));
}

module.exports = { registrarRotasLivro };
