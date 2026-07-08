// =====================================================================
// Villela Projects & Events — Fase 7: portal do cliente.
//
// Modelo por TOKEN de compartilhamento (mesma linha do Villela Docs/Legal):
// o tenant compartilha UM item (evento, projeto, proposta ou contrato) com
// um cliente externo → gera link público /vpe/portal/<token>. O cliente vê
// uma visão CURADA e só-leitura; em proposta/contrato pode aprovar/aceitar
// (registro de aceite com nome/IP — não é assinatura avançada).
//
// SEGURANÇA: recurso portal_cliente é gated pelo plano (interno sempre ok);
// criar/gerir share exige a permissão do PRÓPRIO item (checada na rota);
// a resolução pública nunca vaza dados internos (viabilidade, custos,
// auditoria) — só o que faz sentido para o cliente.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const comercial = require('./comercial');

const s = repo.s;
const TIPOS = ['evento', 'projeto', 'proposta', 'contrato'];
const hoje = () => nowISO().slice(0, 10);
const novoToken = () => crypto.randomBytes(18).toString('base64url');

// valida que o item existe no tenant e devolve um título amigável.
function validarRef(tenantId, tipo, refId) {
  if (tipo === 'evento') { const e = require('./eventos').obterEvento(tenantId, refId); return e.nome; }
  if (tipo === 'projeto') { const p = repo.obterProjeto(tenantId, refId); return p.nome; }
  if (tipo === 'proposta') { const p = comercial.obterProposta(tenantId, refId); return p.titulo; }
  if (tipo === 'contrato') { const c = comercial.obterContrato(tenantId, refId); return c.titulo; }
  throw new Error('Tipo de compartilhamento inválido.');
}

function criarShare(tenantId, campos, ator, ip) {
  if (!TIPOS.includes(campos.tipo)) throw new Error('Tipo inválido.');
  if (!s(campos.ref_id, 40)) throw new Error('Escolha o item a compartilhar.');
  repo.exigirRecurso(tenantId, 'portal_cliente', 'Portal do cliente');
  const titulo = validarRef(tenantId, campos.tipo, campos.ref_id); // valida tenant (anti-IDOR)
  const id = novoId();
  const token = novoToken();
  const podeAceitar = (campos.tipo === 'proposta' || campos.tipo === 'contrato') && !!campos.pode_aceitar ? 1 : 0;
  db.prepare(`INSERT INTO client_shares (id, tenant_id, tipo, ref_id, token, titulo, cliente_nome, cliente_email, pode_aceitar, ativo, expira_em, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`)
    .run(id, String(tenantId), campos.tipo, String(campos.ref_id), token, s(titulo, 200),
      s(campos.cliente_nome, 160), s(campos.cliente_email, 160), podeAceitar, s(campos.expira_em, 10), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'portal.compartilhar', 'client_shares', id, { tipo: campos.tipo, ref: String(campos.ref_id) }, ip);
  return obterShare(tenantId, id);
}
function obterShare(tenantId, id) {
  const sh = db.prepare('SELECT * FROM client_shares WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!sh) throw new Error('Compartilhamento não encontrado.');
  return { ...sh, pode_aceitar: !!sh.pode_aceitar, ativo: !!sh.ativo };
}
function listarShares(tenantId) {
  return db.prepare('SELECT * FROM client_shares WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT 500').all(String(tenantId))
    .map(sh => ({ ...sh, pode_aceitar: !!sh.pode_aceitar, ativo: !!sh.ativo }));
}
function atualizarShare(tenantId, id, campos, ator, ip) {
  const sh = obterShare(tenantId, id);
  db.prepare('UPDATE client_shares SET ativo = ?, pode_aceitar = ?, cliente_nome = ?, cliente_email = ?, expira_em = ? WHERE id = ? AND tenant_id = ?')
    .run(campos.ativo != null ? (campos.ativo ? 1 : 0) : (sh.ativo ? 1 : 0),
      campos.pode_aceitar != null ? (campos.pode_aceitar ? 1 : 0) : (sh.pode_aceitar ? 1 : 0),
      s(campos.cliente_nome ?? sh.cliente_nome, 160), s(campos.cliente_email ?? sh.cliente_email, 160),
      s(campos.expira_em ?? sh.expira_em, 10), sh.id, String(tenantId));
  repo.auditar(tenantId, ator, 'portal.atualizar_share', 'client_shares', sh.id, {}, ip);
  return obterShare(tenantId, sh.id);
}
function revogarShare(tenantId, id, ator, ip) {
  const r = db.prepare('DELETE FROM client_shares WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Compartilhamento não encontrado.');
  repo.auditar(tenantId, ator, 'portal.revogar', 'client_shares', String(id), {}, ip);
}

// ------------------------------------------------------------ público (token)
function shareAtivoPorToken(token) {
  const sh = db.prepare('SELECT * FROM client_shares WHERE token = ?').get(String(token || ''));
  if (!sh || !sh.ativo) throw new Error('Este link não está mais disponível.');
  if (sh.expira_em && sh.expira_em < hoje()) throw new Error('Este link expirou.');
  return sh;
}
function registrarAcesso(sh) {
  try { db.prepare('UPDATE client_shares SET acessos = acessos + 1, ultimo_acesso = ? WHERE id = ?').run(nowISO(), sh.id); } catch (_) {}
}

// visão CURADA por tipo — só o que o cliente pode ver.
function visaoPublica(token) {
  const sh = shareAtivoPorToken(token);
  registrarAcesso(sh);
  const tenant = repo.obterTenant(sh.tenant_id) || {};
  const base = { tipo: sh.tipo, titulo: sh.titulo, empresa: tenant.nome || 'Villela', cliente_nome: sh.cliente_nome, pode_aceitar: !!sh.pode_aceitar };
  if (sh.tipo === 'evento') {
    const e = require('./eventos').obterEvento(sh.tenant_id, sh.ref_id);
    base.dados = { nome: e.nome, tipo: e.tipo, data: e.data, local: e.local, status: e.status, convidados_previstos: e.convidados_previstos };
  } else if (sh.tipo === 'projeto') {
    const p = repo.obterProjeto(sh.tenant_id, sh.ref_id);
    base.dados = { nome: p.nome, categoria: p.categoria, estagio: p.estagio, descricao: p.descricao, proximos_passos: p.proximos_passos };
  } else if (sh.tipo === 'proposta') {
    const p = comercial.obterProposta(sh.tenant_id, sh.ref_id);
    base.dados = { titulo: p.titulo, itens: p.itens, total_centavos: p.total_centavos, desconto_centavos: p.desconto_centavos, validade: p.validade, condicoes_pagamento: p.condicoes_pagamento, status: p.status };
    base.aceito = p.status === 'aprovada';
  } else if (sh.tipo === 'contrato') {
    const c = comercial.obterContrato(sh.tenant_id, sh.ref_id);
    base.dados = { titulo: c.titulo, tipo_contrato: c.tipo, conteudo: c.conteudo, status: c.status, minuta: true };
    base.aceito = c.status === 'aceito';
  }
  return base;
}

// aceite pelo cliente (proposta → aprovada; contrato → aceito).
function aceitarPorToken(token, { nome }, ip) {
  const sh = shareAtivoPorToken(token);
  if (!sh.pode_aceitar) throw new Error('Este item não está habilitado para aceite.');
  const nomeC = s(nome, 160);
  if (!nomeC) throw new Error('Informe seu nome para registrar o aceite.');
  const ator = { id: 'portal-cliente:' + nomeC.slice(0, 40) };
  if (sh.tipo === 'contrato') {
    const c = comercial.registrarAceite(sh.tenant_id, sh.ref_id, { nome: nomeC }, ator, ip);
    return { ok: true, status: c.status };
  }
  if (sh.tipo === 'proposta') {
    const p = comercial.atualizarProposta(sh.tenant_id, sh.ref_id, { status: 'aprovada' }, ator, ip);
    return { ok: true, status: p.status };
  }
  throw new Error('Só propostas e contratos podem ser aceitos pelo portal.');
}

module.exports = { TIPOS, criarShare, obterShare, listarShares, atualizarShare, revogarShare, visaoPublica, aceitarPorToken };
