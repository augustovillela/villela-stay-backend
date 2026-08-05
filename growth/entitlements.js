// =====================================================================
// Villela Growth OS — limites, módulos e flags por conta (§23 do prompt).
//
// Ordem de resolução (o de baixo vence):
//   1. padrão do código   2. plano da conta   3. override do tenant_settings
//   4. gx_entitlements / gx_tenant_flags (ajuste manual por conta)
//
// Preço NUNCA fica fixo no código — planos vivem em `plans`, editáveis.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const { db, nowISO, j } = require('./db');

// Limite -1 = ilimitado. 0 = recurso indisponível no plano.
const LIMITES_PADRAO = {
  contatos: 1000, usuarios: 3, equipes: 1, marcas: 1, funis: 1,
  campanhas_mes: 2, templates: 10, ia_mes: 0,
  conexoes: 1, mensagens_mes: 1000, publicacoes_mes: 0,
  contas_anuncio: 0, workflows: 3, agentes: 0,
  // Etapa 2 — captura. Chave sem limite declarado resolveria para 0, e 0
  // bloqueia na primeira tentativa: todo recurso novo precisa nascer aqui.
  formularios: 3, formularios_respostas: 500, paginas: 3, segmentos: 5,
};

const FLAGS_PADRAO = {
  crm: true, inbox: false, automacoes: false, ia: false, api_publica: false,
  whatsapp_api: false, redes_sociais: false, anuncios: false, reputacao: false,
  reunioes: false, landing_pages: false, white_label: false, agencia: false,
};

/** Snapshot resolvido da conta do contexto. */
function resolver(tenantId = null) {
  const tid = tenantId || tenancy.tenantAtual();
  const tenant = tenantId
    ? db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId)
    : repo.tenantRow();
  if (!tenant) return { limites: { ...LIMITES_PADRAO }, flags: { ...FLAGS_PADRAO }, modulos: [], plano: null };

  const plano = tenant.plan_id ? db.prepare('SELECT * FROM plans WHERE id = ?').get(tenant.plan_id) : null;
  const settings = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id = ?').get(tid);

  const limites = Object.assign({}, LIMITES_PADRAO, plano ? j.parse(plano.limites, {}) : {},
    settings ? j.parse(settings.limites_over, {}) : {});
  const flags = Object.assign({}, FLAGS_PADRAO, plano ? j.parse(plano.flags, {}) : {},
    settings ? j.parse(settings.flags_over, {}) : {});
  const modulos = [].concat(plano ? j.parse(plano.modulos, []) : [], settings ? j.parse(settings.modulos_extra, []) : []);

  // ajustes manuais por conta (a última palavra)
  for (const e of db.prepare('SELECT chave, valor FROM gx_entitlements WHERE tenant_id = ?').all(tid)) {
    limites[e.chave] = j.parse(e.valor, e.valor);
  }
  for (const f of db.prepare('SELECT chave, ligada FROM gx_tenant_flags WHERE tenant_id = ?').all(tid)) {
    flags[f.chave] = !!f.ligada;
  }
  return { limites, flags, modulos, plano, tenant };
}

const limite = (chave, tenantId = null) => {
  const v = resolver(tenantId).limites[chave];
  return v === undefined ? 0 : Number(v);
};
const flagLigada = (chave, tenantId = null) => !!resolver(tenantId).flags[chave];

/** Define um limite específico da conta (override manual, auditado). */
function definirLimite(chave, valor) {
  const tid = tenancy.tenantAtual();
  db.prepare(
    'INSERT INTO gx_entitlements (tenant_id, chave, valor, origem, atualizado_em, atualizado_por) VALUES (?,?,?,?,?,?) ' +
    'ON CONFLICT(tenant_id, chave) DO UPDATE SET valor = excluded.valor, origem = excluded.origem, ' +
    'atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por'
  ).run(tid, chave, j.str(valor), 'override', nowISO(), tenancy.userAtual());
  repo.auditar({ acao: 'entitlement.definido', entidade: 'gx_entitlements', entidadeId: chave, detalhe: String(valor) });
  return true;
}

function definirFlag(chave, ligada) {
  const tid = tenancy.tenantAtual();
  db.prepare(
    'INSERT INTO gx_tenant_flags (tenant_id, chave, ligada, atualizado_em, atualizado_por) VALUES (?,?,?,?,?) ' +
    'ON CONFLICT(tenant_id, chave) DO UPDATE SET ligada = excluded.ligada, atualizado_em = excluded.atualizado_em, ' +
    'atualizado_por = excluded.atualizado_por'
  ).run(tid, chave, ligada ? 1 : 0, nowISO(), tenancy.userAtual());
  repo.auditar({ acao: 'flag.definida', entidade: 'gx_tenant_flags', entidadeId: chave, detalhe: ligada ? 'on' : 'off' });
  return true;
}

// ------------------------------------------------------------------- uso
const periodo = () => new Date().toISOString().slice(0, 7);

const consumoAtual = (metrica, per = periodo()) => {
  const r = repo.um('SELECT quantidade FROM usage_records WHERE tenant_id = :tenant AND periodo = :per AND metrica = :m',
    { per, m: metrica });
  return r ? Number(r.quantidade) || 0 : 0;
};

/**
 * Registra consumo e devolve o estado do limite. Emite `usage.limit_reached`
 * quando cruza o teto — uma vez por período, não a cada chamada.
 */
function consumir(metrica, n = 1, { chaveLimite = null } = {}) {
  const tid = tenancy.tenantAtual();
  const per = periodo();
  db.prepare(
    'INSERT INTO usage_records (tenant_id, periodo, metrica, quantidade, atualizado_em) VALUES (?,?,?,?,?) ' +
    'ON CONFLICT(tenant_id, periodo, metrica) DO UPDATE SET quantidade = quantidade + excluded.quantidade, ' +
    'atualizado_em = excluded.atualizado_em'
  ).run(tid, per, metrica, Number(n) || 0, nowISO());

  const chave = chaveLimite || metrica;
  const teto = limite(chave);
  const usado = consumoAtual(metrica, per);
  const estourou = teto >= 0 && usado > teto;
  const cruzouAgora = estourou && (usado - (Number(n) || 0)) <= teto;

  if (cruzouAgora) {
    // require tardio: eventos.js também usa entitlements
    require('./eventos').publicar('usage.limit_reached', {
      refTipo: 'metrica', refId: metrica,
      payload: { metrica, periodo: per, usado, limite: teto },
      chaveIdem: `limite:${tid}:${per}:${metrica}`,
    });
  }
  return { usado, limite: teto, estourou, ilimitado: teto < 0 };
}

/** Barreira de plano: lança 402 quando o recurso não cabe no plano. */
function exigirDentroDoLimite(chaveLimite, quantidadeAtual) {
  const teto = limite(chaveLimite);
  if (teto < 0) return true;
  if (Number(quantidadeAtual) >= teto) {
    const e = new Error(`O plano desta conta permite ${teto} de "${chaveLimite}". Aumente o plano para continuar.`);
    e.status = 402; e.limite = chaveLimite; throw e;
  }
  return true;
}

/** Barreira de módulo: lança 402 quando a flag está desligada. */
function exigirFlag(chave) {
  if (flagLigada(chave)) return true;
  const e = new Error(`O recurso "${chave}" não está incluído no plano desta conta.`);
  e.status = 402; e.flag = chave; throw e;
}

module.exports = {
  LIMITES_PADRAO, FLAGS_PADRAO,
  resolver, limite, flagLigada, definirLimite, definirFlag,
  consumir, consumoAtual, exigirDentroDoLimite, exigirFlag, periodo,
};
