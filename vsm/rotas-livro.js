// =====================================================================
// Villela Stay Manager — ONDA LIVRO · rotas da API do assinante.
//
// Prefixo /gestao/api/app/livro/*. Registradas por rotas-app.js, logo
// herdam as três camadas de proteção do produto: requireAssinante (cookie
// vsm_sess ou Bearer da API pública) → requireAcesso (bloqueia conta
// suspensa/inadimplente) → gateModulo (respeita os módulos do plano).
//
// Duas páginas públicas ficam FORA dessa proteção, por serem esse o ponto:
//   /gestao/manual/:token        — manual do hóspede (sem dado de acesso)
//   /gestao/proprietario/:token  — portal do proprietário (compartimentado)
// =====================================================================
'use strict';
const L = require('./repo-livro');

function registrarRotasLivro(server, { G, B, tid, h, quem }) {
  const P = '/gestao/api/app/livro';
  const corpo = (req) => req.body || {};
  const q = (req, k, d) => (req.query && req.query[k] !== undefined ? req.query[k] : d);

  // garante as sementes do livro na primeira visita de cada tenant
  const semear = (req, res, next) => { try { L.semearTenant(req.assinante.tenant_id); } catch (_) {} next(); };
  const GS = (mod) => [...G(mod), semear];
  const BS = [...B, semear];

  // ---------------------------------------------------- catálogos do livro
  server.get(`${P}/catalogos`, ...BS, h((req, res) => res.json({ catalogos: L.catalogos })));

  // ------------------------------------------- Cap. 39 · painel do dia
  server.get(`${P}/painel-do-dia`, ...BS, h((req, res) => res.json({ painel: L.painelDoDia(tid(req), q(req, 'data', '')) })));

  // ------------------------------------------- Cap. 6 · cadastro mestre
  server.get(`${P}/ficha`, ...GS('imoveis'), h((req, res) => res.json({ panorama: L.Ficha.panorama(tid(req)) })));
  server.get(`${P}/ficha/:imovelId`, ...GS('imoveis'), h((req, res) => res.json({ ficha: L.Ficha.obter(tid(req), req.params.imovelId) })));
  server.put(`${P}/ficha/:imovelId`, ...GS('imoveis'), h((req, res) => res.json({ ok: true, ficha: L.Ficha.salvar(tid(req), req.params.imovelId, corpo(req), quem(req)) })));

  // -------------------------------- Cap. 13/20 · interligações e bloqueios
  server.get(`${P}/interligacoes`, ...GS('imoveis'), h((req, res) => res.json({ interligacoes: L.Interligacoes.listar(tid(req)) })));
  server.post(`${P}/interligacoes`, ...GS('imoveis'), h((req, res) => res.json({ ok: true, ...L.Interligacoes.criar(tid(req), corpo(req), quem(req)) })));
  server.delete(`${P}/interligacoes/:id`, ...GS('imoveis'), h((req, res) => res.json({ ok: true, ...L.Interligacoes.remover(tid(req), req.params.id, quem(req)) })));
  server.post(`${P}/conflito`, ...GS('reservas'), h((req, res) => res.json({ resultado: L.Interligacoes.conflito(tid(req), corpo(req)) })));

  server.get(`${P}/bloqueios`, ...GS('reservas'), h((req, res) => res.json({ bloqueios: L.Bloqueios.listar(tid(req), { imovel_id: q(req, 'imovel_id', ''), desde: q(req, 'desde', '') }), vencidos: L.Bloqueios.vencidos(tid(req)) })));
  server.post(`${P}/bloqueios`, ...GS('reservas'), h((req, res) => res.json({ ok: true, bloqueio: L.Bloqueios.criar(tid(req), corpo(req), quem(req)) })));
  server.delete(`${P}/bloqueios/:id`, ...GS('reservas'), h((req, res) => res.json({ ok: true, ...L.Bloqueios.remover(tid(req), req.params.id, quem(req)) })));

  // ---------------------------- Cap. 20 · auditoria de sincronização
  server.get(`${P}/auditoria`, ...GS('canais'), h((req, res) => res.json({ ultima: L.Auditorias.ultima(tid(req)), historico: L.Auditorias.listar(tid(req)) })));
  server.post(`${P}/auditoria/rodar`, ...GS('canais'), h(async (req, res) => res.json({ ok: true, auditoria: await L.rodarAuditoria(tid(req), corpo(req)) })));

  // ---------------------------- Cap. 39 · rotinas e sinal de vida
  server.get(`${P}/rotinas`, ...BS, h((req, res) => res.json({ rotinas: L.Rotinas.listar(tid(req)) })));
  server.post(`${P}/rotinas`, ...BS, h((req, res) => res.json({ ok: true, rotina: L.Rotinas.registrar(tid(req), corpo(req), quem(req)) })));
  // heartbeat: a rotina externa (Tarefa do Windows, cron, Claude Code) reporta aqui
  server.post(`${P}/rotinas/:nome/heartbeat`, ...BS, h((req, res) => res.json({ ok: true, ...L.Rotinas.heartbeat(tid(req), req.params.nome, corpo(req)) })));

  // ---------------------------- Cap. 35 · escala, evidência e liberação
  server.get(`${P}/escala`, ...GS('limpeza'), h((req, res) => res.json({ escala: L.Escala.doDia(tid(req), q(req, 'data', '')) })));
  server.get(`${P}/limpezas/:id/execucao`, ...GS('limpeza'), h((req, res) => res.json({ execucao: L.Execucao.obter(tid(req), req.params.id) })));
  server.post(`${P}/limpezas/:id/confirmar`, ...GS('limpeza'), h((req, res) => res.json({ ok: true, execucao: L.Execucao.confirmar(tid(req), req.params.id, corpo(req), quem(req)) })));
  server.post(`${P}/limpezas/:id/liberar`, ...GS('limpeza'), h((req, res) => res.json({ ok: true, execucao: L.Execucao.liberar(tid(req), req.params.id, quem(req)) })));

  // ---------------------------- Cap. 35/38 · inspeção por amostragem
  server.get(`${P}/inspecoes`, ...GS('limpeza'), h((req, res) => res.json({ inspecoes: L.Inspecoes.listar(tid(req)), qualidade: L.Inspecoes.qualidade(tid(req)) })));
  server.post(`${P}/inspecoes/sortear`, ...GS('limpeza'), h((req, res) => res.json({ sorteio: L.Inspecoes.sortear(tid(req)) })));
  server.post(`${P}/inspecoes`, ...GS('limpeza'), h((req, res) => res.json({ ok: true, inspecao: L.Inspecoes.registrar(tid(req), corpo(req), quem(req)) })));

  // ---------------------------- Cap. 37 · plano preventivo e fornecedores
  server.get(`${P}/preventiva`, ...GS('manutencao'), h((req, res) => res.json({ itens: L.Preventiva.listar(tid(req)), plano: L.Preventiva.plano(tid(req)) })));
  server.post(`${P}/preventiva`, ...GS('manutencao'), h((req, res) => res.json({ ok: true, item: L.Preventiva.salvar(tid(req), corpo(req), quem(req)) })));
  server.post(`${P}/preventiva/:id/executada`, ...GS('manutencao'), h((req, res) => res.json({ ok: true, item: L.Preventiva.executada(tid(req), req.params.id, corpo(req).data, quem(req)) })));
  server.delete(`${P}/preventiva/:id`, ...GS('manutencao'), h((req, res) => res.json({ ok: true, ...L.Preventiva.remover(tid(req), req.params.id, quem(req)) })));

  server.get(`${P}/fornecedores`, ...GS('manutencao'), h((req, res) => res.json({ fornecedores: L.Fornecedores.listar(tid(req)), cobertura: L.Fornecedores.cobertura(tid(req)) })));
  server.post(`${P}/fornecedores`, ...GS('manutencao'), h((req, res) => res.json({ ok: true, fornecedor: L.Fornecedores.salvar(tid(req), corpo(req), quem(req)) })));
  server.delete(`${P}/fornecedores/:id`, ...GS('manutencao'), h((req, res) => res.json({ ok: true, ...L.Fornecedores.remover(tid(req), req.params.id, quem(req)) })));

  // ---------------------------- Cap. 36 · suprimentos e enxoval
  server.get(`${P}/suprimentos`, ...GS('estoque'), h((req, res) => res.json({
    previsao: L.Suprimentos.previsao(tid(req), { dias: Number(q(req, 'dias', 30)), margemPct: Number(q(req, 'margem', 15)) }),
    enxoval: L.Suprimentos.enxoval(tid(req)),
  })));
  server.post(`${P}/enxoval`, ...GS('estoque'), h((req, res) => res.json({ ok: true, lote: L.Suprimentos.salvarEnxoval(tid(req), corpo(req), quem(req)) })));
  server.post(`${P}/enxoval/:id/aposentar`, ...GS('estoque'), h((req, res) => res.json({ ok: true, ...L.Suprimentos.aposentarEnxoval(tid(req), req.params.id, corpo(req).destino, quem(req)) })));

  // ---------------------------- Cap. 23 · CRM
  server.get(`${P}/crm/contatos`, ...GS('crm'), h((req, res) => res.json({ contatos: L.Contatos.listar(tid(req), { tipo: q(req, 'tipo', ''), busca: q(req, 'busca', '') }) })));
  server.post(`${P}/crm/contatos`, ...GS('crm'), h((req, res) => res.json({ ok: true, contato: L.Contatos.salvar(tid(req), corpo(req), quem(req)) })));
  server.post(`${P}/crm/contatos/:id/opt-out`, ...GS('crm'), h((req, res) => res.json({ ok: true, ...L.Contatos.optOut(tid(req), req.params.id, quem(req)) })));
  server.get(`${P}/crm/oportunidades`, ...GS('crm'), h((req, res) => res.json({ oportunidades: L.Oportunidades.listar(tid(req), { estagio: q(req, 'estagio', ''), contato_id: q(req, 'contato_id', '') }), funil: L.Oportunidades.funil(tid(req)) })));
  server.post(`${P}/crm/oportunidades`, ...GS('crm'), h((req, res) => res.json({ ok: true, oportunidade: L.Oportunidades.salvar(tid(req), corpo(req), quem(req)) })));
  server.post(`${P}/crm/oportunidades/:id/perder`, ...GS('crm'), h((req, res) => res.json({ ok: true, oportunidade: L.Oportunidades.perder(tid(req), req.params.id, corpo(req).motivo, quem(req)) })));
  server.post(`${P}/crm/oportunidades/:id/converter`, ...GS('crm'), h((req, res) => res.json({ ok: true, ...L.Oportunidades.converter(tid(req), req.params.id, corpo(req), quem(req)) })));
  server.get(`${P}/crm/pauta`, ...GS('crm'), h((req, res) => res.json({ pauta: L.Oportunidades.pauta(tid(req)) })));

  // ---------------------------- Cap. 21 · datas especiais e revisão semanal
  server.get(`${P}/revenue`, ...GS('precificacao'), h((req, res) => res.json({ datas: L.DatasEspeciais.listar(tid(req)), revisao: L.revisaoSemanal(tid(req)) })));
  server.post(`${P}/revenue/datas`, ...GS('precificacao'), h((req, res) => res.json({ ok: true, data: L.DatasEspeciais.salvar(tid(req), corpo(req), quem(req)) })));
  server.post(`${P}/revenue/datas/:id/aplicada`, ...GS('precificacao'), h((req, res) => res.json({ ok: true, ...L.DatasEspeciais.marcarAplicada(tid(req), req.params.id, quem(req)) })));
  server.delete(`${P}/revenue/datas/:id`, ...GS('precificacao'), h((req, res) => res.json({ ok: true, ...L.DatasEspeciais.remover(tid(req), req.params.id, quem(req)) })));

  // ---------------------------- Cap. 25/30 · documentação, conferência, risco
  server.get(`${P}/documentacao/politica`, ...GS('reservas'), h((req, res) => res.json({ politica: L.PoliticaDoc.listar(tid(req)) })));
  server.post(`${P}/documentacao/politica`, ...GS('reservas'), h((req, res) => res.json({ ok: true, faixa: L.PoliticaDoc.salvar(tid(req), corpo(req), quem(req)) })));
  server.delete(`${P}/documentacao/politica/:id`, ...GS('reservas'), h((req, res) => res.json({ ok: true, ...L.PoliticaDoc.remover(tid(req), req.params.id, quem(req)) })));
  server.get(`${P}/documentacao/conferencia`, ...GS('reservas'), h((req, res) => res.json({ conferencia: L.Documentacao.conferir(tid(req)) })));
  server.get(`${P}/documentacao/:reservaId`, ...GS('reservas'), h((req, res) => res.json({ documentacao: L.Documentacao.obter(tid(req), req.params.reservaId), risco: L.Documentacao.risco(tid(req), req.params.reservaId) })));
  server.put(`${P}/documentacao/:reservaId`, ...GS('reservas'), h((req, res) => res.json({ ok: true, documentacao: L.Documentacao.salvar(tid(req), req.params.reservaId, corpo(req), quem(req)) })));

  // ---------------------------- Cap. 31/34 · régua de mensagens
  server.get(`${P}/regua`, ...GS('mensagens'), h((req, res) => res.json({ modelos: L.Modelos.listar(tid(req), q(req, 'idioma', '')), fila: L.Regua.fila(tid(req), { situacao: q(req, 'situacao', '') }) })));
  server.post(`${P}/regua/modelos`, ...GS('mensagens'), h((req, res) => res.json({ ok: true, modelo: L.Modelos.salvar(tid(req), corpo(req), quem(req)) })));
  server.post(`${P}/regua/preparar`, ...GS('mensagens'), h((req, res) => res.json({ ok: true, resultado: L.Regua.preparar(tid(req), corpo(req)) })));
  server.post(`${P}/regua/fila/:id`, ...GS('mensagens'), h((req, res) => res.json({ ok: true, mensagem: L.Regua.resolver(tid(req), req.params.id, corpo(req).situacao, quem(req)) })));

  // ---------------------------- Cap. 31/33 · manual do hóspede
  server.get(`${P}/manual/:imovelId`, ...GS('hospede'), h((req, res) => res.json({ secoes: L.Manual.listar(tid(req), req.params.imovelId), link: L.Manual.link(tid(req), req.params.imovelId) })));
  server.post(`${P}/manual`, ...GS('hospede'), h((req, res) => res.json({ ok: true, secao: L.Manual.salvar(tid(req), corpo(req), quem(req)) })));
  server.delete(`${P}/manual/:id`, ...GS('hospede'), h((req, res) => res.json({ ok: true, ...L.Manual.remover(tid(req), req.params.id, quem(req)) })));
  server.post(`${P}/manual/:imovelId/regerar-link`, ...GS('hospede'), h((req, res) => res.json({ ok: true, link: L.Manual.regerarLink(tid(req), req.params.imovelId, quem(req)) })));

  // ---------------------------- Cap. 33 · concierge
  server.get(`${P}/concierge`, ...GS('hospede'), h((req, res) => res.json({
    gatilhos: L.Concierge.gatilhos(tid(req)), plantao: L.Concierge.plantao(tid(req)),
    triagens: L.Concierge.triagens(tid(req), 50), assuntos: L.Concierge.assuntosMaisPerguntados(tid(req)),
  })));
  server.post(`${P}/concierge/gatilhos`, ...GS('hospede'), h((req, res) => res.json({ ok: true, ...L.Concierge.adicionarGatilho(tid(req), corpo(req).termo, corpo(req).categoria, quem(req)) })));
  server.delete(`${P}/concierge/gatilhos/:id`, ...GS('hospede'), h((req, res) => res.json({ ok: true, ...L.Concierge.removerGatilho(tid(req), req.params.id, quem(req)) })));
  server.post(`${P}/concierge/plantao`, ...GS('hospede'), h((req, res) => res.json({ ok: true, plantao: L.Concierge.salvarPlantao(tid(req), corpo(req), quem(req)) })));
  server.delete(`${P}/concierge/plantao/:id`, ...GS('hospede'), h((req, res) => res.json({ ok: true, ...L.Concierge.removerPlantao(tid(req), req.params.id, quem(req)) })));
  server.post(`${P}/concierge/triar`, ...GS('hospede'), h((req, res) => res.json({ triagem: L.Concierge.triar(tid(req), corpo(req)) })));

  // ---------------------------- Cap. 29 · reputação
  server.get(`${P}/reputacao`, ...GS('reputacao'), h((req, res) => res.json({
    avaliacoes: L.Reputacao.listar(tid(req), { imovel_id: q(req, 'imovel_id', '') }),
    diagnostico: L.Reputacao.diagnostico(tid(req)), correcoes: L.Reputacao.correcoes(tid(req)), ciclo: L.Reputacao.ciclo(tid(req)),
  })));
  server.post(`${P}/reputacao/avaliacoes`, ...GS('reputacao'), h((req, res) => res.json({ ok: true, avaliacao: L.Reputacao.registrar(tid(req), corpo(req), quem(req)) })));
  server.post(`${P}/reputacao/avaliacoes/:id/responder`, ...GS('reputacao'), h((req, res) => res.json({ ok: true, avaliacao: L.Reputacao.responder(tid(req), req.params.id, corpo(req).resposta, quem(req)) })));
  server.post(`${P}/reputacao/correcoes`, ...GS('reputacao'), h((req, res) => res.json({ ok: true, correcao: L.Reputacao.registrarCorrecao(tid(req), corpo(req), quem(req)) })));

  // ---------------------------- Cap. 22/40 + Apêndice F · números
  server.get(`${P}/metricas`, ...GS('relatorios'), h((req, res) => res.json({
    metricas: L.metricas(tid(req), Number(q(req, 'ano', 0)), Number(q(req, 'mes', 0))), alertas: L.alertas(tid(req)),
  })));
  server.get(`${P}/dre`, ...GS('financeiro'), h((req, res) => res.json({ dre: L.dre(tid(req), Number(q(req, 'ano', 0)), Number(q(req, 'mes', 0)), q(req, 'imovel_id', '')) })));
  server.get(`${P}/financeiro/config`, ...GS('financeiro'), h((req, res) => res.json({ config: L.ConfigFinanceira.obter(tid(req)) })));
  server.put(`${P}/financeiro/config`, ...GS('financeiro'), h((req, res) => res.json({ ok: true, config: L.ConfigFinanceira.salvar(tid(req), corpo(req), quem(req)) })));

  // ---------------------------- Cap. 12 · proprietários
  server.get(`${P}/proprietarios`, ...GS('proprietarios'), h((req, res) => res.json({ proprietarios: L.Proprietarios.listar(tid(req)) })));
  server.post(`${P}/proprietarios`, ...GS('proprietarios'), h((req, res) => res.json({ ok: true, proprietario: L.Proprietarios.salvar(tid(req), corpo(req), quem(req)) })));
  server.post(`${P}/proprietarios/vincular`, ...GS('proprietarios'), h((req, res) => res.json({ ok: true, ...L.Proprietarios.vincular(tid(req), corpo(req).imovel_id, corpo(req).proprietario_id, quem(req)) })));
  server.post(`${P}/proprietarios/:id/portal`, ...GS('proprietarios'), h((req, res) => res.json({ ok: true, ...L.Proprietarios.portal(tid(req), req.params.id, quem(req)) })));
  server.delete(`${P}/proprietarios/:id/portal`, ...GS('proprietarios'), h((req, res) => res.json({ ok: true, ...L.Proprietarios.revogarPortal(tid(req), req.params.id, quem(req)) })));
  server.post(`${P}/proprietarios/:id/contato`, ...GS('proprietarios'), h((req, res) => res.json({ ok: true, ...L.Proprietarios.registrarContato(tid(req), req.params.id, quem(req)) })));
  server.get(`${P}/proprietarios/:id/relatorio`, ...GS('proprietarios'), h((req, res) => res.json({
    relatorio: L.Proprietarios.relatorio(tid(req), req.params.id, Number(q(req, 'ano', 0)), Number(q(req, 'mes', 0))),
  })));

  // ---------------------------- Cap. 8 · governança
  server.get(`${P}/governanca`, ...GS('governanca'), h((req, res) => res.json({
    revisao: L.Permissoes.revisao(tid(req)), auditoria: L.Auditoria.listar(tid(req), { limite: 100 }),
    dicionario: L.catalogos.dicionario_metricas,
  })));
  server.post(`${P}/governanca/permissoes`, ...GS('governanca'), h((req, res) => res.json({ ok: true, papel: L.Permissoes.salvar(tid(req), corpo(req), quem(req)) })));
  server.delete(`${P}/governanca/permissoes/:papel`, ...GS('governanca'), h((req, res) => res.json({ ok: true, ...L.Permissoes.remover(tid(req), req.params.papel, quem(req)) })));

  // ---------------------------- Apêndice E + Cap. 39/47 · POPs, crises, prompts
  server.get(`${P}/pops`, ...BS, h((req, res) => res.json({ pops: L.Pops.listar(tid(req)), crises: L.Crises.listar(tid(req)) })));
  server.post(`${P}/pops`, ...BS, h((req, res) => res.json({ ok: true, pop: L.Pops.salvar(tid(req), corpo(req), quem(req)) })));
  server.post(`${P}/crises`, ...BS, h((req, res) => res.json({ ok: true, crise: L.Crises.salvar(tid(req), corpo(req), quem(req)) })));
  server.get(`${P}/prompts`, ...BS, h((req, res) => res.json({ prompts: L.Prompts.listar(tid(req), q(req, 'area', '')) })));
  server.post(`${P}/prompts`, ...BS, h((req, res) => res.json({ ok: true, prompt: L.Prompts.salvar(tid(req), corpo(req), quem(req)) })));
  server.delete(`${P}/prompts/:chave`, ...BS, h((req, res) => res.json({ ok: true, ...L.Prompts.remover(tid(req), req.params.chave, quem(req)) })));
}

// =====================================================================
// Páginas públicas: manual do hóspede e portal do proprietário.
// São HTML servidos direto (sem SPA, sem login) — o hóspede pode estar sem
// internet boa e o proprietário não deveria precisar de conta.
// =====================================================================
function registrarPaginasLivro(server, { css, marca }) {
  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const pagina = (titulo, corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(titulo)}</title><link rel="stylesheet" href="/assets/brand/villela-ui.css?v=7"><style>${css || ''}
.lv-doc{max-width:760px;margin:0 auto;padding:24px 16px}.lv-doc h1{margin:0 0 4px}.lv-sec{margin:18px 0;padding:14px 16px;border:1px solid var(--vx-borda,#e5e5e5);border-radius:12px}
.lv-sec h3{margin:0 0 8px}.lv-grid{display:grid;gap:10px}@media(min-width:640px){.lv-grid--2{grid-template-columns:1fr 1fr}}
.lv-num{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px dashed var(--vx-borda,#eee)}
.lv-num b{white-space:nowrap}</style></head><body class="vx" data-vertical="manager"><div class="lv-doc">${corpo}</div></body></html>`;

  // manual do hóspede — sem senha, sem código, sem dado pessoal (Cap. 32)
  server.get('/gestao/manual/:token', (req, res) => {
    const m = L.Manual.publico(req.params.token);
    if (!m) return res.status(404).type('html').send(pagina('Manual não encontrado', '<h1>Manual não encontrado</h1><p>Confira o link com o anfitrião.</p>'));
    const secoes = m.secoes.map(x => `<div class="lv-sec"><h3>${esc(x.assunto)}</h3><p style="white-space:pre-wrap">${esc(x.corpo)}</p></div>`).join('');
    res.type('html').send(pagina(`Manual · ${m.imovel}`, `
      <h1>${esc(m.imovel)}</h1>
      <p class="vx-hint">Entrada a partir das ${esc(m.checkin_hora)} · saída até as ${esc(m.checkout_hora)}</p>
      <div class="lv-sec lv-grid lv-grid--2">
        ${m.wifi_rede ? `<div><b>Wi-fi</b><br>Rede: ${esc(m.wifi_rede)}<br><span class="vx-hint">A senha é enviada pelo anfitrião.</span></div>` : ''}
        ${m.estacionamento ? `<div><b>Estacionamento</b><br>${esc(m.estacionamento)}</div>` : ''}
      </div>
      ${m.regras ? `<div class="lv-sec"><h3>Regras da casa</h3><p style="white-space:pre-wrap">${esc(m.regras)}</p></div>` : ''}
      ${(m.nao_tem || []).length ? `<div class="lv-sec"><h3>O que a casa não tem</h3><p>${m.nao_tem.map(esc).join(' · ')}</p></div>` : ''}
      ${secoes || '<p class="vx-hint">O anfitrião ainda está montando este manual.</p>'}
      <p class="vx-hint" style="margin-top:24px">${marca || 'Villela Stay Manager'}</p>`));
  });

  // portal do proprietário — compartimentado por arquitetura (Cap. 12)
  server.get('/gestao/proprietario/:token', (req, res) => {
    const ano = Number(req.query.ano) || 0, mes = Number(req.query.mes) || 0;
    const r = L.Proprietarios.publico(req.params.token, ano, mes);
    if (!r) return res.status(404).type('html').send(pagina('Portal não encontrado', '<h1>Portal não encontrado</h1><p>Peça um novo link à administradora.</p>'));
    const linha = (rot, v) => `<div class="lv-num"><span>${esc(rot)}</span><b>${brl(v)}</b></div>`;
    const blocos = r.blocos.map(b => `
      <div class="lv-sec">
        <h3>${esc(b.imovel)}</h3>
        ${b.resultado ? `<h4>Resultado</h4>
          ${linha('Receita bruta', b.resultado.receita_bruta_centavos)}
          ${linha('− Comissões de canal', -b.resultado.comissoes_centavos)}
          ${linha('= Receita líquida', b.resultado.receita_liquida_centavos)}
          ${linha('− Custos variáveis', -b.resultado.custos_variaveis_centavos)}
          ${linha('− Custos fixos', -b.resultado.custos_fixos_centavos)}
          ${linha('− Provisões', -b.resultado.provisoes_centavos)}
          ${b.resultado.fundo_manutencao_centavos ? linha('− Fundo de manutenção', -b.resultado.fundo_manutencao_centavos) : ''}
          ${linha('− Remuneração da administradora', -b.resultado.remuneracao_administradora_centavos)}
          ${linha('= Repasse', b.resultado.repasse_centavos)}` : ''}
        <h4 style="margin-top:14px">Operação</h4>
        <div class="lv-num"><span>Ocupação</span><b>${b.operacao.ocupacao}% <span class="vx-hint">(ano anterior: ${b.operacao.ocupacao_ano_anterior}%)</span></b></div>
        <div class="lv-num"><span>Diária média</span><b>${brl(b.operacao.adr_centavos)}</b></div>
        <div class="lv-num"><span>Reservas</span><b>${b.operacao.reservas} <span class="vx-hint">(ano anterior: ${b.operacao.reservas_ano_anterior})</span></b></div>
        <div class="lv-num"><span>Estadia média</span><b>${b.operacao.estadia_media} noites</b></div>
        <h4 style="margin-top:14px">O imóvel</h4>
        ${b.imovel_estado.manutencoes.length ? `<ul>${b.imovel_estado.manutencoes.slice(0, 10).map(x => `<li>${esc(x.em)} — ${esc(x.titulo)} <span class="vx-badge">${esc(x.status)}</span></li>`).join('')}</ul>` : '<p class="vx-hint">Sem manutenções no período.</p>'}
        <h4 style="margin-top:14px">Avaliações</h4>
        ${b.avaliacoes.nota_media != null ? `<p>Nota média: <b>${b.avaliacoes.nota_media}</b></p>` : '<p class="vx-hint">Sem avaliações no período.</p>'}
        ${b.avaliacoes.itens.map(x => `<p>${esc(String(x.data))} · ${x.nota} — ${esc(x.texto || '')}</p>`).join('')}
        ${b.hipoteses.length ? `<div class="vx-alerta vx-alerta--warn"><div>${b.hipoteses.map(h2 => `<p class="vx-mb0">${esc(h2)}</p>`).join('')}</div></div>` : ''}
      </div>`).join('');
    res.type('html').send(pagina(`Prestação de contas · ${r.nome}`, `
      <h1>${esc(r.nome)}</h1>
      <p class="vx-hint">${r.periodo.mes}/${r.periodo.ano} · remuneração ${r.proprietario.remuneracao_pct}% sobre o ${esc(r.proprietario.base_calculo)} · repasse no dia ${r.proprietario.repasse_dia}</p>
      <div class="lv-sec"><b>Convenção deste relatório:</b><p class="vx-mb0">${esc(r.convencoes.receita)} ${esc(r.convencoes.bruto_liquido)}</p></div>
      ${blocos}
      ${r.exigem_autorizacao.length ? `<div class="lv-sec"><h3>Precisa da sua autorização</h3><ul>${r.exigem_autorizacao.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <p class="vx-hint" style="margin-top:24px">${esc(r.compartimentacao)}</p>`));
  });
}

module.exports = { registrarRotasLivro, registrarPaginasLivro };
