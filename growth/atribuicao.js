// =====================================================================
// Villela Growth OS — atribuição (§22 do PROMPT_MASTER).
//
// Esta é a parte da Etapa 7 que funciona HOJE, porque não depende de
// plataforma nenhuma: usa o que já temos — a trilha de `gx_tracking`
// (visita anônima ligada à pessoa quando ela se identifica), a
// procedência gravada no contato e a oportunidade ganha no CRM.
//
// Quatro modelos são calculados de verdade sobre os toques de primeira
// parte. O que NÃO existe está dito em `limitacoes()`: sem visão
// cross-device, sem view-through, e sem os toques que aconteceram DENTRO
// das plataformas de anúncio enquanto elas não estiverem conectadas.
// Atribuição que não declara o que não vê é atribuição que engana.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const { nowISO, j } = require('./db');

const MODELOS = ['first_touch', 'last_touch', 'linear', 'posicional'];

/** O que este cálculo NÃO enxerga. Vai junto de todo relatório. */
const limitacoes = () => [
  'só toques de primeira parte: visitas ao site e formulários nossos',
  'sem cross-device — a mesma pessoa em dois aparelhos conta como duas trilhas até se identificar',
  'sem view-through: impressão de anúncio que não gerou clique não aparece',
  'toques dentro das plataformas de anúncio dependem da conexão, que ainda não existe',
];

/**
 * Reconstrói a jornada da pessoa: cada toque com origem conhecida, em
 * ordem. O primeiro toque vem do tracking anônimo quando existe; se não
 * existir, cai para a procedência gravada no contato.
 */
function jornada(contatoId) {
  const toques = repo.listar('gx_tracking', {
    onde: 'contato_id = :c', params: { c: contatoId }, ordem: 'criado_em ASC', limite: 500,
  }).map((t) => {
    const utm = j.parse(t.utm, {});
    return {
      em: t.criado_em, url: t.url, referrer: t.referrer,
      origem: utm.source || canalDoReferrer(t.referrer) || '',
      campanha: utm.campaign || '', anuncio: utm.content || '', canal: utm.medium || '',
    };
  }).filter((t) => t.origem || t.campanha);

  // sem trilha: a procedência do próprio contato é o único toque conhecido
  if (!toques.length) {
    const c = require('../crm/app-repo').Contatos.obter(tenancy.tenantAtual(), contatoId);
    if (c && (c.origem || c.campanha)) {
      const utm = typeof c.utm === 'string' ? j.parse(c.utm, {}) : (c.utm || {});
      toques.push({
        em: c.criado_em, url: c.pagina_entrada || '', referrer: '',
        origem: c.origem || utm.source || '', campanha: c.campanha || utm.campaign || '',
        anuncio: c.anuncio || '', canal: c.canal_entrada || utm.medium || '',
      });
    }
  }
  return toques;
}

function canalDoReferrer(ref) {
  if (!ref) return '';
  const r = String(ref).toLowerCase();
  if (r.includes('google')) return 'google';
  if (r.includes('instagram')) return 'instagram';
  if (r.includes('facebook')) return 'facebook';
  if (r.includes('linkedin')) return 'linkedin';
  if (r.includes('tiktok')) return 'tiktok';
  if (r.includes('youtube')) return 'youtube';
  return 'referencia';
}

/**
 * Distribui o valor da conversão entre os toques, conforme o modelo.
 * Devolve [{toque, peso, valorCent}].
 */
function distribuir(toques, valorCent, modelo) {
  if (!toques.length) return [];
  const n = toques.length;
  let pesos;
  switch (modelo) {
    case 'first_touch': pesos = toques.map((_, i) => (i === 0 ? 1 : 0)); break;
    case 'last_touch': pesos = toques.map((_, i) => (i === n - 1 ? 1 : 0)); break;
    case 'linear': pesos = toques.map(() => 1 / n); break;
    case 'posicional':
      // 40% no primeiro, 40% no último, 20% dividido no meio
      if (n === 1) pesos = [1];
      else if (n === 2) pesos = [0.5, 0.5];
      else pesos = toques.map((_, i) => (i === 0 || i === n - 1 ? 0.4 : 0.2 / (n - 2)));
      break;
    default: pesos = toques.map((_, i) => (i === n - 1 ? 1 : 0));
  }
  return toques.map((t, i) => ({ toque: t, peso: pesos[i], valorCent: Math.round(valorCent * pesos[i]) }));
}

/**
 * Calcula a atribuição de UMA oportunidade ganha e grava o resultado
 * por modelo. Idempotente: recalcular substitui.
 */
function calcular(oportunidadeId, { modelos = MODELOS } = {}) {
  const op = repo.um('SELECT * FROM crm_oportunidades WHERE tenant_id = :tenant AND id = :id', { id: oportunidadeId });
  if (!op) throw erro(404, 'Oportunidade não encontrada.');
  if (op.status !== 'ganha') return { ok: false, motivo: 'oportunidade não está ganha' };

  const toques = jornada(op.contato_id);
  const valor = Number(op.valor_centavos) || 0;
  const saida = {};

  for (const modelo of modelos) {
    const partes = distribuir(toques, valor, modelo);
    // grava o toque dominante do modelo (o que ficou com mais valor)
    const dominante = partes.slice().sort((a, b) => b.valorCent - a.valorCent)[0];
    const dados = {
      contato_id: op.contato_id, oportunidade_id: oportunidadeId, valor_cent: valor, modelo,
      origem: dominante ? dominante.toque.origem : 'desconhecida',
      campanha: dominante ? dominante.toque.campanha : '',
      anuncio: dominante ? dominante.toque.anuncio : '',
      canal: dominante ? dominante.toque.canal : '',
      toques: toques.length, calculado_em: nowISO(),
    };
    const ja = repo.um('SELECT * FROM gx_atribuicoes_conversao WHERE tenant_id = :tenant AND oportunidade_id = :o AND modelo = :m',
      { o: oportunidadeId, m: modelo });
    if (ja) repo.atualizar('gx_atribuicoes_conversao', ja.id, dados);
    else repo.inserir('gx_atribuicoes_conversao', dados);
    saida[modelo] = dados;
  }
  return { ok: true, toques: toques.length, modelos: saida };
}

/** Recalcula todas as oportunidades ganhas do período. */
function recalcular({ de = '', ate = '' } = {}) {
  const cond = ["status = 'ganha'"];
  const params = {};
  if (de) { cond.push('fechada_em >= :de'); params.de = de; }
  if (ate) { cond.push('fechada_em <= :ate'); params.ate = ate; }
  const ganhas = repo.q(
    `SELECT id FROM crm_oportunidades WHERE tenant_id = :tenant AND ${cond.join(' AND ')} LIMIT 2000`, params
  );
  let n = 0;
  for (const o of ganhas) { try { if (calcular(o.id).ok) n++; } catch (_) { /* uma falha não para o lote */ } }
  return { oportunidades: ganhas.length, atribuidas: n };
}

// -------------------------------------------------------- relatórios

/** Receita por campanha. É o que o painel de anúncios usa para o ROAS. */
function receitaPorCampanha({ de = '', ate = '', modelo = 'last_touch' } = {}) {
  const cond = ['modelo = :m'];
  const params = { m: modelo };
  if (de) { cond.push('calculado_em >= :de'); params.de = de; }
  if (ate) { cond.push('calculado_em <= :ate'); params.ate = ate + 'T23:59:59Z'; }
  const linhas = repo.q(
    `SELECT campanha, SUM(valor_cent) AS receita FROM gx_atribuicoes_conversao
     WHERE tenant_id = :tenant AND ${cond.join(' AND ')} GROUP BY campanha`, params
  );
  return linhas.reduce((acc, l) => { acc[l.campanha || '(sem campanha)'] = l.receita; return acc; }, {});
}

/** Painel: receita e conversões por origem, com os modelos lado a lado. */
function porOrigem({ de = '', ate = '' } = {}) {
  const out = {};
  for (const modelo of MODELOS) {
    const cond = ['modelo = :m'];
    const params = { m: modelo };
    if (de) { cond.push('calculado_em >= :de'); params.de = de; }
    if (ate) { cond.push('calculado_em <= :ate'); params.ate = ate + 'T23:59:59Z'; }
    out[modelo] = repo.q(
      `SELECT origem, COUNT(*) AS conversoes, SUM(valor_cent) AS receita, AVG(toques) AS toques_medio
       FROM gx_atribuicoes_conversao WHERE tenant_id = :tenant AND ${cond.join(' AND ')}
       GROUP BY origem ORDER BY receita DESC`, params
    );
  }
  return { modelos: out, limitacoes: limitacoes() };
}

/**
 * Funil por origem: quantos leads entraram, quantas oportunidades e
 * quantas foram ganhas. Roda sobre o CRM, sem depender de anúncio.
 */
function funil({ de = '', ate = '' } = {}) {
  const params = {};
  const condC = [];
  if (de) { condC.push('c.criado_em >= :de'); params.de = de; }
  if (ate) { condC.push('c.criado_em <= :ate'); params.ate = ate + 'T23:59:59Z'; }
  const where = condC.length ? ' AND ' + condC.join(' AND ') : '';

  const linhas = repo.q(
    `SELECT c.origem,
            COUNT(DISTINCT c.id) AS leads,
            COUNT(DISTINCT o.id) AS oportunidades,
            COUNT(DISTINCT CASE WHEN o.status = 'ganha' THEN o.id END) AS ganhas,
            COALESCE(SUM(CASE WHEN o.status = 'ganha' THEN o.valor_centavos ELSE 0 END),0) AS receita
     FROM crm_contatos c
     LEFT JOIN crm_oportunidades o ON o.contato_id = c.id AND o.tenant_id = c.tenant_id
     WHERE c.tenant_id = :tenant${where}
     GROUP BY c.origem ORDER BY receita DESC, leads DESC`, params
  );
  return linhas.map((l) => Object.assign({}, l, {
    origem: l.origem || '(sem origem)',
    conversao_pct: l.leads ? +((l.ganhas / l.leads) * 100).toFixed(1) : 0,
    ticket_medio_cent: l.ganhas ? Math.round(l.receita / l.ganhas) : 0,
  }));
}

/** A jornada de um contato, legível — é o que se mostra na ficha dele. */
function jornadaDoContato(contatoId) {
  const toques = jornada(contatoId);
  return {
    toques,
    primeiro: toques[0] || null,
    ultimo: toques[toques.length - 1] || null,
    total: toques.length,
    limitacoes: limitacoes(),
  };
}

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  MODELOS, limitacoes, jornada, jornadaDoContato, distribuir,
  calcular, recalcular, receitaPorCampanha, porOrigem, funil,
};
