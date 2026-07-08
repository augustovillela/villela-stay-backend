// =====================================================================
// Villela Projects & Events — Fase 5 (parte comercial): CRM, propostas
// e contratos.
// * CRM: funil de vendas (deals) com histórico de follow-up; conversão
//   em projeto ou evento (registra o vínculo, marca deal ganho).
// * Propostas: itens × quantidade − desconto = total; status até
//   convertida; geradas de deal/evento/projeto.
// * Contratos: SEMPRE minuta (exigem revisão de advogado — carimbo na
//   exportação); versões; aceite simples (data/IP/nome).
// Assinatura eletrônica avançada e geração por IA: fases futuras.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = repo.s;
const ESTAGIOS_FUNIL = ['novo', 'contato', 'briefing', 'reuniao', 'proposta_elaboracao', 'proposta_enviada', 'negociacao', 'contrato_enviado', 'fechado', 'perdido'];
const STATUS_PROPOSTA = ['rascunho', 'enviada', 'visualizada', 'em_negociacao', 'aprovada', 'recusada', 'vencida', 'convertida'];
const STATUS_CONTRATO = ['rascunho', 'em_revisao', 'enviado', 'aceito', 'distrato'];
const TIPOS_CONTRATO = ['evento', 'servico', 'locacao', 'fornecedor', 'parceria', 'projeto'];

// ------------------------------------------------------------ CRM: deals
function criarDeal(tenantId, campos, ator, ip) {
  if (!s(campos.titulo, 200)) throw new Error('Dê um título à oportunidade.');
  const id = novoId();
  db.prepare(`INSERT INTO crm_deals (id, tenant_id, titulo, cliente_nome, empresa, contato, origem,
      valor_estimado_centavos, probabilidade, estagio, status, proximo_contato, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,'aberto',?,?,?)`)
    .run(id, String(tenantId), s(campos.titulo, 200), s(campos.cliente_nome, 160), s(campos.empresa, 160), s(campos.contato, 120),
      s(campos.origem, 40), Math.max(0, Math.trunc(Number(campos.valor_estimado_centavos) || 0)),
      Math.min(Math.max(0, Math.trunc(Number(campos.probabilidade) || 0)), 100),
      ESTAGIOS_FUNIL.includes(campos.estagio) ? campos.estagio : 'novo', s(campos.proximo_contato, 10), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'crm.deal_criar', 'crm_deals', id, { titulo: s(campos.titulo, 120) }, ip);
  return obterDeal(tenantId, id);
}
function obterDeal(tenantId, id) {
  const d = db.prepare('SELECT * FROM crm_deals WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!d) throw new Error('Oportunidade não encontrada.');
  d.notas = db.prepare('SELECT texto, autor_nome, criado_em FROM crm_notes WHERE tenant_id = ? AND deal_id = ? ORDER BY criado_em DESC LIMIT 100').all(String(tenantId), d.id);
  d.propostas = db.prepare('SELECT id, titulo, status, criado_em FROM proposals WHERE tenant_id = ? AND deal_id = ? ORDER BY criado_em DESC').all(String(tenantId), d.id);
  return d;
}
function listarDeals(tenantId, { status = '', estagio = '', busca = '' } = {}) {
  let sql = 'SELECT * FROM crm_deals WHERE tenant_id = ?';
  const args = [String(tenantId)];
  if (status) { sql += ' AND status = ?'; args.push(s(status, 20)); }
  if (estagio) { sql += ' AND estagio = ?'; args.push(s(estagio, 30)); }
  if (busca) { sql += ' AND (titulo LIKE ? OR cliente_nome LIKE ? OR empresa LIKE ?)'; const t = '%' + s(busca, 80) + '%'; args.push(t, t, t); }
  sql += ' ORDER BY CASE status WHEN \'aberto\' THEN 0 ELSE 1 END, atualizado_em DESC, criado_em DESC LIMIT 500';
  return db.prepare(sql).all(...args);
}
function atualizarDeal(tenantId, id, campos, ator, ip) {
  const d = obterDeal(tenantId, id);
  if (campos.estagio && !ESTAGIOS_FUNIL.includes(campos.estagio)) throw new Error('Estágio inválido.');
  // fechar/perder ajusta status
  let status = d.status;
  if (campos.estagio === 'fechado') status = 'ganho';
  else if (campos.estagio === 'perdido') status = 'perdido';
  else if (campos.status && ['aberto', 'ganho', 'perdido'].includes(campos.status)) status = campos.status;
  db.prepare(`UPDATE crm_deals SET titulo = ?, cliente_nome = ?, empresa = ?, contato = ?, origem = ?,
      valor_estimado_centavos = ?, probabilidade = ?, estagio = ?, status = ?, motivo_perda = ?, proximo_contato = ?, atualizado_em = ?
    WHERE id = ? AND tenant_id = ?`)
    .run(s(campos.titulo || d.titulo, 200), s(campos.cliente_nome ?? d.cliente_nome, 160), s(campos.empresa ?? d.empresa, 160),
      s(campos.contato ?? d.contato, 120), s(campos.origem ?? d.origem, 40),
      campos.valor_estimado_centavos != null ? Math.max(0, Math.trunc(Number(campos.valor_estimado_centavos) || 0)) : d.valor_estimado_centavos,
      campos.probabilidade != null ? Math.min(Math.max(0, Math.trunc(Number(campos.probabilidade) || 0)), 100) : d.probabilidade,
      campos.estagio || d.estagio, status, s(campos.motivo_perda ?? d.motivo_perda, 500), s(campos.proximo_contato ?? d.proximo_contato, 10),
      nowISO(), d.id, String(tenantId));
  repo.auditar(tenantId, ator, campos.estagio && campos.estagio !== d.estagio ? 'crm.deal_mover' : 'crm.deal_atualizar', 'crm_deals', d.id,
    campos.estagio ? { de: d.estagio, para: campos.estagio } : {}, ip);
  return obterDeal(tenantId, d.id);
}
function adicionarNota(tenantId, dealId, texto, ator, ip) {
  obterDeal(tenantId, dealId);
  if (!s(texto, 2000)) throw new Error('Escreva a anotação.');
  db.prepare('INSERT INTO crm_notes (tenant_id, deal_id, texto, autor_nome, criado_em) VALUES (?,?,?,?,?)')
    .run(String(tenantId), String(dealId), s(texto, 2000), s(ator && ator.nome, 120), nowISO());
  repo.auditar(tenantId, ator, 'crm.deal_nota', 'crm_deals', String(dealId), {}, ip);
  return obterDeal(tenantId, dealId);
}
// Converte o deal em projeto OU evento (marca ganho e guarda o vínculo).
function converterDeal(tenantId, dealId, alvo, ator, ip) {
  const d = obterDeal(tenantId, dealId);
  const repoMod = require('./repo');
  const eventosMod = require('./eventos');
  const res = transacao(() => {
    let vinculo = {};
    if (alvo === 'projeto') {
      const p = repoMod.criarProjeto(tenantId, { nome: d.titulo, categoria: 'eventos', responsavel: s(ator && ator.nome, 120), receita_potencial: d.valor_estimado_centavos }, ator, ip);
      db.prepare('UPDATE crm_deals SET project_id = ? WHERE id = ?').run(p.id, d.id);
      vinculo = { project_id: p.id };
    } else if (alvo === 'evento') {
      const e = eventosMod.criarEvento(tenantId, { nome: d.titulo, cliente_nome: d.cliente_nome, cliente_contato: d.contato, receita_centavos: d.valor_estimado_centavos }, ator, ip);
      db.prepare('UPDATE crm_deals SET event_id = ? WHERE id = ?').run(e.id, d.id);
      vinculo = { event_id: e.id };
    } else throw new Error('Alvo inválido (projeto ou evento).');
    db.prepare("UPDATE crm_deals SET status = 'ganho', estagio = 'fechado', atualizado_em = ? WHERE id = ?").run(nowISO(), d.id);
    repo.auditar(tenantId, ator, 'crm.deal_converter', 'crm_deals', d.id, { alvo, ...vinculo }, ip);
    return { ...vinculo };
  });
  try { require('./api-publica').emitir(tenantId, 'deal.ganho', { deal_id: d.id, titulo: d.titulo, alvo, ...res }); } catch (_) {}
  return res;
}
function funil(tenantId) {
  const deals = listarDeals(tenantId, { status: 'aberto' });
  const colunas = {};
  for (const e of ESTAGIOS_FUNIL) colunas[e] = { deals: [], valor: 0 };
  for (const d of deals) { const c = colunas[d.estagio] || colunas.novo; c.deals.push(d); c.valor += d.valor_estimado_centavos; }
  const ganhos = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(valor_estimado_centavos),0) v FROM crm_deals WHERE tenant_id = ? AND status = 'ganho'").get(String(tenantId));
  const perdidos = db.prepare("SELECT COUNT(*) n FROM crm_deals WHERE tenant_id = ? AND status = 'perdido'").get(String(tenantId)).n;
  const abertos = deals.length;
  return { colunas, ordem: ESTAGIOS_FUNIL, ganhos: ganhos.n, valor_ganho: ganhos.v, perdidos, abertos, taxa_conversao: (ganhos.n + perdidos) ? Math.round(100 * ganhos.n / (ganhos.n + perdidos)) : 0 };
}

// ------------------------------------------------------------ propostas
function totalProposta(itens, desconto) {
  const bruto = (Array.isArray(itens) ? itens : []).reduce((a, it) => a + Math.max(0, Math.trunc(Number(it.qtd) || 0)) * Math.max(0, Math.trunc(Number(it.preco_unit_centavos) || 0)), 0);
  return Math.max(0, bruto - Math.max(0, Math.trunc(Number(desconto) || 0)));
}
function limparItens(itens) {
  return (Array.isArray(itens) ? itens : []).slice(0, 60).map(it => ({
    descricao: s(it && it.descricao, 300), qtd: Math.max(0, Math.trunc(Number(it && it.qtd) || 0)), preco_unit_centavos: Math.max(0, Math.trunc(Number(it && it.preco_unit_centavos) || 0)),
  })).filter(it => it.descricao);
}
function criarProposta(tenantId, campos, ator, ip) {
  if (!s(campos.titulo, 200)) throw new Error('Dê um título à proposta.');
  if (campos.deal_id) obterDeal(tenantId, campos.deal_id);
  if (campos.event_id) require('./eventos').obterEvento(tenantId, campos.event_id);
  if (campos.project_id) repo.obterProjeto(tenantId, campos.project_id);
  const id = novoId();
  db.prepare(`INSERT INTO proposals (id, tenant_id, deal_id, event_id, project_id, titulo, cliente_nome, itens, desconto_centavos, validade, condicoes_pagamento, status, observacoes, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'rascunho',?,?,?)`)
    .run(id, String(tenantId), s(campos.deal_id, 40), s(campos.event_id, 40), s(campos.project_id, 40), s(campos.titulo, 200), s(campos.cliente_nome, 160),
      j.str(limparItens(campos.itens)), Math.max(0, Math.trunc(Number(campos.desconto_centavos) || 0)), s(campos.validade, 10),
      s(campos.condicoes_pagamento, 500), s(campos.observacoes, 1000), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'proposta.criar', 'proposals', id, { titulo: s(campos.titulo, 120) }, ip);
  return obterProposta(tenantId, id);
}
function obterProposta(tenantId, id) {
  const p = db.prepare('SELECT * FROM proposals WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!p) throw new Error('Proposta não encontrada.');
  p.itens = j.parse(p.itens, []);
  p.total_centavos = totalProposta(p.itens, p.desconto_centavos);
  return p;
}
function listarPropostas(tenantId, { status = '' } = {}) {
  let sql = 'SELECT id, deal_id, event_id, project_id, titulo, cliente_nome, itens, desconto_centavos, status, validade, criado_em FROM proposals WHERE tenant_id = ?';
  const args = [String(tenantId)];
  if (status) { sql += ' AND status = ?'; args.push(s(status, 20)); }
  sql += ' ORDER BY criado_em DESC LIMIT 500';
  return db.prepare(sql).all(...args).map(p => { const itens = j.parse(p.itens, []); return { ...p, itens, total_centavos: totalProposta(itens, p.desconto_centavos) }; });
}
function atualizarProposta(tenantId, id, campos, ator, ip) {
  const p = obterProposta(tenantId, id);
  if (campos.status && !STATUS_PROPOSTA.includes(campos.status)) throw new Error('Status inválido.');
  db.prepare(`UPDATE proposals SET titulo = ?, cliente_nome = ?, itens = ?, desconto_centavos = ?, validade = ?, condicoes_pagamento = ?, status = ?, observacoes = ?, atualizado_em = ?
    WHERE id = ? AND tenant_id = ?`)
    .run(s(campos.titulo || p.titulo, 200), s(campos.cliente_nome ?? p.cliente_nome, 160),
      campos.itens != null ? j.str(limparItens(campos.itens)) : j.str(p.itens),
      campos.desconto_centavos != null ? Math.max(0, Math.trunc(Number(campos.desconto_centavos) || 0)) : p.desconto_centavos,
      s(campos.validade ?? p.validade, 10), s(campos.condicoes_pagamento ?? p.condicoes_pagamento, 500),
      campos.status || p.status, s(campos.observacoes ?? p.observacoes, 1000), nowISO(), p.id, String(tenantId));
  repo.auditar(tenantId, ator, campos.status && campos.status !== p.status ? 'proposta.mudar_status' : 'proposta.atualizar', 'proposals', p.id, { status: campos.status }, ip);
  if (campos.status === 'aprovada' && p.status !== 'aprovada') { try { require('./api-publica').emitir(tenantId, 'proposta.aprovada', { proposta_id: p.id, titulo: p.titulo }); } catch (_) {} }
  return obterProposta(tenantId, p.id);
}

// ------------------------------------------------------------ contratos (minuta)
function criarContrato(tenantId, campos, ator, ip) {
  if (!s(campos.titulo, 200)) throw new Error('Dê um título ao contrato.');
  const id = novoId();
  db.prepare(`INSERT INTO contracts (id, tenant_id, deal_id, event_id, project_id, proposal_id, tipo, titulo, conteudo, versao, status, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,0,'rascunho',?,?)`)
    .run(id, String(tenantId), s(campos.deal_id, 40), s(campos.event_id, 40), s(campos.project_id, 40), s(campos.proposal_id, 40),
      TIPOS_CONTRATO.includes(campos.tipo) ? campos.tipo : 'servico', s(campos.titulo, 200), s(campos.conteudo, 40000), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'contrato.criar', 'contracts', id, { titulo: s(campos.titulo, 120), tipo: campos.tipo }, ip);
  return obterContrato(tenantId, id);
}
function obterContrato(tenantId, id) {
  const c = db.prepare('SELECT * FROM contracts WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!c) throw new Error('Contrato não encontrado.');
  c.aceite = j.parse(c.aceite, {});
  c.versoes = db.prepare('SELECT numero, criado_em FROM contract_versions WHERE tenant_id = ? AND contract_id = ? ORDER BY numero DESC LIMIT 50').all(String(tenantId), c.id);
  c.minuta = true; // sempre MINUTA — validação humana obrigatória
  return c;
}
function listarContratos(tenantId, { status = '' } = {}) {
  let sql = 'SELECT id, tipo, titulo, status, versao, criado_em FROM contracts WHERE tenant_id = ?';
  const args = [String(tenantId)];
  if (status) { sql += ' AND status = ?'; args.push(s(status, 20)); }
  sql += ' ORDER BY criado_em DESC LIMIT 500';
  return db.prepare(sql).all(...args);
}
function salvarContrato(tenantId, id, campos, ator, ip) {
  const c = obterContrato(tenantId, id);
  if (campos.status && !STATUS_CONTRATO.includes(campos.status)) throw new Error('Status inválido.');
  return transacao(() => {
    let versao = c.versao;
    if (campos.conteudo != null && s(campos.conteudo, 40000) !== c.conteudo) {
      versao = c.versao + 1;
      db.prepare('INSERT INTO contract_versions (id, tenant_id, contract_id, numero, conteudo, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)')
        .run(novoId(), String(tenantId), c.id, versao, s(campos.conteudo, 40000), nowISO(), s(ator && ator.id, 40));
    }
    db.prepare('UPDATE contracts SET titulo = ?, tipo = ?, conteudo = ?, versao = ?, status = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?')
      .run(s(campos.titulo || c.titulo, 200), TIPOS_CONTRATO.includes(campos.tipo) ? campos.tipo : c.tipo,
        campos.conteudo != null ? s(campos.conteudo, 40000) : c.conteudo, versao, campos.status || c.status, nowISO(), c.id, String(tenantId));
    repo.auditar(tenantId, ator, 'contrato.salvar', 'contracts', c.id, { versao, status: campos.status || c.status }, ip);
    return obterContrato(tenantId, c.id);
  });
}
// Aceite simples (registro de aceite — não é assinatura avançada).
function registrarAceite(tenantId, id, { nome }, ator, ip) {
  const c = obterContrato(tenantId, id);
  db.prepare("UPDATE contracts SET status = 'aceito', aceite = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?")
    .run(j.str({ aceito_em: nowISO(), ip: s(ip, 60), nome: s(nome, 160) }), nowISO(), c.id, String(tenantId));
  repo.auditar(tenantId, ator, 'contrato.aceite', 'contracts', c.id, { nome: s(nome, 120) }, ip);
  try { require('./api-publica').emitir(tenantId, 'contrato.aceito', { contrato_id: c.id, titulo: c.titulo, nome: s(nome, 160) }); } catch (_) {}
  return obterContrato(tenantId, c.id);
}

module.exports = {
  ESTAGIOS_FUNIL, STATUS_PROPOSTA, STATUS_CONTRATO, TIPOS_CONTRATO,
  criarDeal, obterDeal, listarDeals, atualizarDeal, adicionarNota, converterDeal, funil,
  criarProposta, obterProposta, listarPropostas, atualizarProposta, totalProposta,
  criarContrato, obterContrato, listarContratos, salvarContrato, registrarAceite,
};
