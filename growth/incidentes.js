// =====================================================================
// Villela Growth OS — incidentes operacionais.
//
// Falha silenciosa é o pior desfecho: integração caída, fila entupida,
// token vencido e job morto viram registro com dono e prazo, não uma
// linha de console que ninguém lê.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const { db, nowISO } = require('./db');

const SEVERIDADES = ['baixa', 'media', 'alta', 'critica'];

/**
 * Abre (ou reaproveita) um incidente. `chave` evita enxurrada: se já há um
 * incidente aberto para a mesma referência, só atualiza o detalhe.
 */
function abrir({ natureza, titulo, detalhe = '', severidade = 'media', refTipo = '', refId = '' }) {
  if (!natureza || !titulo) throw new Error('Incidente precisa de natureza e título.');
  const sev = SEVERIDADES.includes(severidade) ? severidade : 'media';
  const plataforma = tenancy.ehPlataforma() && !(tenancy.atual() || {}).tenantId;

  const aberto = plataforma
    ? db.prepare("SELECT * FROM gx_incidentes WHERE tenant_id = '' AND status = 'aberto' AND ref_tipo = ? AND ref_id = ? LIMIT 1").get(refTipo, refId)
    : repo.um("SELECT * FROM gx_incidentes WHERE tenant_id = :tenant AND status = 'aberto' AND ref_tipo = :rt AND ref_id = :ri LIMIT 1", { rt: refTipo, ri: refId });

  if (aberto) {
    db.prepare('UPDATE gx_incidentes SET detalhe = ?, severidade = ?, atualizado_em = ? WHERE id = ?')
      .run(detalhe, sev, nowISO(), aberto.id);
    return db.prepare('SELECT * FROM gx_incidentes WHERE id = ?').get(aberto.id);
  }

  const dados = {
    natureza, severidade: sev, titulo, detalhe, ref_tipo: refTipo, ref_id: refId,
    status: 'aberto', correlation_id: tenancy.correlationId(), criado_em: nowISO(),
  };
  const id = plataforma ? repo.inserirPlataforma('gx_incidentes', dados) : repo.inserir('gx_incidentes', dados);
  repo.auditar({ acao: 'incidente.aberto', entidade: 'gx_incidentes', entidadeId: id, detalhe: `${natureza}: ${titulo}` });
  try {
    require('./eventos').publicar('incident.opened', {
      refTipo: 'incidente', refId: id,
      payload: { natureza, severidade: sev, titulo }, chaveIdem: `inc:${id}`, origem: 'worker',
    });
  } catch (_) { /* melhor esforço */ }
  return db.prepare('SELECT * FROM gx_incidentes WHERE id = ?').get(id);
}

function fechar(id, { obs = '' } = {}) {
  const inc = db.prepare('SELECT * FROM gx_incidentes WHERE id = ?').get(id);
  if (!inc || inc.status === 'fechado') return null;
  db.prepare("UPDATE gx_incidentes SET status = 'fechado', fechado_em = ?, atualizado_em = ?, detalhe = ? WHERE id = ?")
    .run(nowISO(), nowISO(), obs ? `${inc.detalhe} | ${obs}` : inc.detalhe, id);
  repo.auditar({ acao: 'incidente.fechado', entidade: 'gx_incidentes', entidadeId: id, detalhe: obs, tenantId: inc.tenant_id || '' });
  try {
    require('./eventos').publicar('incident.closed', {
      refTipo: 'incidente', refId: id, payload: { titulo: inc.titulo }, chaveIdem: `inc-fim:${id}`, origem: 'api',
    });
  } catch (_) { /* melhor esforço */ }
  return db.prepare('SELECT * FROM gx_incidentes WHERE id = ?').get(id);
}

/** Abertos de TODAS as contas — visão de plataforma, exige o escopo. */
function abertos(limite = 100) {
  if (!tenancy.ehPlataforma()) {
    const e = new Error('Panorama de incidentes é operação de plataforma.'); e.status = 403; throw e;
  }
  return db.prepare("SELECT * FROM gx_incidentes WHERE status = 'aberto' ORDER BY CASE severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, criado_em DESC LIMIT ?")
    .all(Math.min(Number(limite) || 100, 500));
}

const doTenant = (limite = 100) =>
  repo.listar('gx_incidentes', { onde: "status != 'fechado'", ordem: 'criado_em DESC', limite });

module.exports = { SEVERIDADES, abrir, fechar, abertos, doTenant };
