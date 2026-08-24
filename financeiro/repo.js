// =====================================================================
// Villela Finance — repositório. ÚNICO lugar com SQL de domínio.
//
// Sem RLS neste banco (ADR-0003), o isolamento entre clientes é aqui:
//   • toda query que toca tabela com tenant_id exige contexto de tenant;
//   • o tenant é INJETADO do contexto — o chamador não escolhe;
//   • parâmetro posicional é recusado nessas tabelas (evita o clássico
//     "passei o tenant errado na posição errada");
//   • leitura cruzada só via qPlataforma(), que exige papel de plataforma.
//
// O selftest tenta furar cada uma dessas regras e exige falha.
// =====================================================================
'use strict';
const { db, novoId, nowISO, j, TABELAS_TENANT, TABELAS_CATALOGO, TABELAS_MISTAS } = require('./db');
const tenancy = require('./tenancy');
const { ErroDeIsolamento } = tenancy;

// ---------------------------------------------------------------- guarda

// Extrai os nomes de tabela citados no SQL. Grosseiro de propósito: serve
// para pegar o erro real (esquecer o filtro), não para validar SQL.
const RE_TABELAS = /\b(?:from|join|into|update|table)\s+["'`[]?([a-z_][a-z0-9_]*)["'`\]]?/gi;
function tabelasCitadas(sql) {
  const out = new Set();
  let m;
  RE_TABELAS.lastIndex = 0;
  while ((m = RE_TABELAS.exec(sql))) out.add(m[1].toLowerCase());
  return out;
}

function verificarSql(sql, params, { plataforma = false } = {}) {
  const citadas = tabelasCitadas(sql);
  const tabelas = [...citadas].filter(t => TABELAS_TENANT.has(t) && !TABELAS_CATALOGO.has(t) && !TABELAS_MISTAS.has(t));
  const mistas = [...citadas].filter(t => TABELAS_MISTAS.has(t));

  if (mistas.length && !/tenant_id/i.test(sql)) {
    throw new ErroDeIsolamento(
      `Query sem filtro de tenant em ${mistas.join(', ')}. ` +
      "Use tenant_id = '' para linhas de plataforma ou tenant_id = :tenant."
    );
  }
  if (!tabelas.length) {
    if (mistas.length && /:tenant\b/.test(sql) && !Array.isArray(params)) {
      const ctx = tenancy.atual();
      return ctx && ctx.tenantId ? ctx.tenantId : '';
    }
    return null;
  }

  if (plataforma) {
    if (!tenancy.ehPlataforma()) {
      throw new ErroDeIsolamento('Consulta de plataforma exige tenancy.comoPlataforma().');
    }
    return null;
  }
  const tenant = tenancy.tenantAtual();                 // lança se não houver contexto
  if (Array.isArray(params)) {
    throw new ErroDeIsolamento(
      `Parâmetro posicional não é aceito em tabela sob isolamento (${tabelas.join(', ')}). ` +
      'Use parâmetros nomeados — o tenant é injetado do contexto.'
    );
  }
  if (!/tenant_id/i.test(sql)) {
    throw new ErroDeIsolamento(
      `Query sem filtro de tenant em ${tabelas.join(', ')}. ` +
      'Toda leitura/escrita dessas tabelas tem de restringir tenant_id.'
    );
  }
  if (params && Object.prototype.hasOwnProperty.call(params, 'tenant') && params.tenant !== tenant) {
    throw new ErroDeIsolamento('Tenant do parâmetro difere do contexto — o contexto é a fonte da verdade.');
  }
  return tenant;
}

/**
 * Muitas consultas aqui montam o WHERE por pedaço (`${desde ? 'AND ...' : ''}`).
 * O node:sqlite REJEITA parâmetro nomeado que não aparece no SQL final — e o
 * erro ("Unknown named parameter") não diz qual filtro sumiu. Filtrar o bind
 * pelo que o SQL realmente cita resolve na raiz, em vez de espalhar objetos
 * condicionais por trinta funções.
 *
 * O `\b` no fim evita que `:comp` case com `:competencia`.
 */
function somenteUsados(sql, bind) {
  const out = {};
  for (const chave of Object.keys(bind)) {
    if (new RegExp(`:${chave}\\b`).test(sql)) out[chave] = bind[chave];
  }
  return out;
}

function preparar(sql, params, opts) {
  const tenant = verificarSql(sql, params, opts);
  const st = db.prepare(sql);
  let bind = params;
  if (tenant && !Array.isArray(params)) bind = Object.assign({}, params || {}, { tenant });
  if (bind && !Array.isArray(bind)) bind = somenteUsados(sql, bind);
  return { st, bind: bind == null ? {} : bind };
}

const q = (sql, params) => { const { st, bind } = preparar(sql, params); return Array.isArray(bind) ? st.all(...bind) : st.all(bind); };
const um = (sql, params) => { const { st, bind } = preparar(sql, params); return (Array.isArray(bind) ? st.get(...bind) : st.get(bind)) || null; };
const exec = (sql, params) => { const { st, bind } = preparar(sql, params); return Array.isArray(bind) ? st.run(...bind) : st.run(bind); };

/** Leitura atravessando contas. Exige tenancy.comoPlataforma(). */
const qPlataforma = (sql, params) => {
  const { st, bind } = preparar(sql, params, { plataforma: true });
  return Array.isArray(bind) ? st.all(...bind) : st.all(bind);
};
const umPlataforma = (sql, params) => {
  const { st, bind } = preparar(sql, params, { plataforma: true });
  return (Array.isArray(bind) ? st.get(...bind) : st.get(bind)) || null;
};
const execPlataforma = (sql, params) => {
  const { st, bind } = preparar(sql, params, { plataforma: true });
  return Array.isArray(bind) ? st.run(...bind) : st.run(bind);
};

// ------------------------------------------------------------- tenants
// `tenants` tem tenant_id? Não — a chave é o próprio id. Fica fora do
// guarda por natureza; o acesso é sempre de plataforma ou por id conhecido.

const criarTenant = (d) => {
  const id = d.id || novoId();
  db.prepare(`INSERT INTO tenants (id, slug, nome, documento, status, plano_id, overrides,
    trial_ate, contato_email, contato_nome, interno, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, d.slug, d.nome, d.documento || '', d.status || 'trial', d.planoId || '',
    j.str(d.overrides || {}), d.trialAte || '', d.contatoEmail || '', d.contatoNome || '',
    d.interno ? 1 : 0, nowISO(), d.criadoPor || ''
  );
  return tenantPorId(id);
};
const tenantPorId = (id) => db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) || null;
const tenantPorSlug = (slug) => db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug) || null;
const listarTenants = () => db.prepare('SELECT * FROM tenants ORDER BY criado_em DESC').all();
const atualizarTenant = (id, campos) => {
  const permitidos = ['nome', 'documento', 'status', 'plano_id', 'overrides', 'trial_ate', 'contato_email', 'contato_nome', 'cancelado_em'];
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(campos)) if (permitidos.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
  if (!sets.length) return tenantPorId(id);
  sets.push('atualizado_em = ?'); vals.push(nowISO());
  db.prepare(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return tenantPorId(id);
};

// --------------------------------------------------------------- planos
const listarPlanos = () => db.prepare('SELECT * FROM plans ORDER BY ordem, preco_cents').all();
const planoPorSlug = (slug) => db.prepare('SELECT * FROM plans WHERE slug = ?').get(slug) || null;
const planoPorId = (id) => db.prepare('SELECT * FROM plans WHERE id = ?').get(id) || null;
// `plans` é catálogo global (sem tenant_id): o preço é mexido pelo painel
// comercial, e por isso tem função própria em vez de entrar no upsert.
const atualizarPrecoPlano = (id, precoCents) =>
  db.prepare('UPDATE plans SET preco_cents = ?, atualizado_em = ? WHERE id = ?').run(precoCents, nowISO(), id);

const upsertPlano = (d) => {
  const existente = planoPorSlug(d.slug);
  if (existente) {
    db.prepare(`UPDATE plans SET nome=?, modulos=?, limites=?, flags=?, ordem=?, publico=?, atualizado_em=?
      WHERE id=?`).run(d.nome, j.str(d.modulos || []), j.str(d.limites || {}), j.str(d.flags || {}),
      d.ordem || 0, d.publico === false ? 0 : 1, nowISO(), existente.id);
    return planoPorId(existente.id);
  }
  const id = novoId();
  db.prepare(`INSERT INTO plans (id, slug, nome, preco_cents, periodo, modulos, limites, flags, ordem, publico, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, d.slug, d.nome, d.precoCents || 0, d.periodo || 'mensal',
    j.str(d.modulos || []), j.str(d.limites || {}), j.str(d.flags || {}), d.ordem || 0,
    d.publico === false ? 0 : 1, nowISO());
  return planoPorId(id);
};

// ------------------------------------------------------------ usuários
const criarUsuario = (d) => {
  const id = novoId();
  exec(`INSERT INTO tenant_users (id, tenant_id, email, nome, senha_hash, perfil, status, criado_em, criado_por)
        VALUES (:id, :tenant, :email, :nome, :senha, :perfil, 'ativo', :agora, :por)`,
    { id, email: String(d.email || '').toLowerCase().trim(), nome: d.nome || '', senha: d.senhaHash || '', perfil: d.perfil || 'operador', agora: nowISO(), por: d.criadoPor || '' });
  return usuarioPorId(id);
};
const usuarioPorId = (id) => um('SELECT * FROM tenant_users WHERE tenant_id = :tenant AND id = :id', { id });
const usuarioPorEmail = (email) => um('SELECT * FROM tenant_users WHERE tenant_id = :tenant AND email = :email', { email: String(email || '').toLowerCase().trim() });
const trocarSenhaDoUsuario = (id, senhaHash) => exec(
  `UPDATE tenant_users SET senha_hash = :hash, atualizado_em = :agora
     WHERE tenant_id = :tenant AND id = :id`,
  { id, hash: senhaHash, agora: nowISO() });
const listarUsuarios = () => q('SELECT id, tenant_id, email, nome, perfil, status, mfa_ativo, ultimo_acesso, criado_em FROM tenant_users WHERE tenant_id = :tenant ORDER BY nome', {});

// ------------------------------------------------------------ entidades
const criarEntidade = (d) => {
  const id = novoId();
  exec(`INSERT INTO fin_entidades (id, tenant_id, nome, documento, regime, moeda, timezone, status, criado_em, criado_por)
        VALUES (:id, :tenant, :nome, :doc, :regime, :moeda, :tz, 'ativa', :agora, :por)`,
    { id, nome: d.nome, doc: d.documento || '', regime: d.regime || 'simples', moeda: d.moeda || 'BRL', tz: d.timezone || 'America/Sao_Paulo', agora: nowISO(), por: tenancy.userAtual() });
  return entidadePorId(id);
};
const entidadePorId = (id) => um('SELECT * FROM fin_entidades WHERE tenant_id = :tenant AND id = :id', { id });
const listarEntidades = () => q("SELECT * FROM fin_entidades WHERE tenant_id = :tenant AND status = 'ativa' ORDER BY nome", {});

// ------------------------------------------------------- plano de contas
const criarConta = (d) => {
  const id = d.id || novoId();
  exec(`INSERT INTO fin_contas (id, tenant_id, entidade_id, codigo, nome, natureza, saldo_normal,
          pai_id, aceita_lancamento, subledger, conta_bancaria_id, sistema, criado_em, criado_por)
        VALUES (:id, :tenant, :ent, :codigo, :nome, :nat, :sn, :pai, :aceita, :sub, :cb, :sis, :agora, :por)`,
    { id, ent: d.entidadeId, codigo: d.codigo, nome: d.nome, nat: d.natureza, sn: d.saldoNormal,
      pai: d.paiId || '', aceita: d.aceitaLancamento === false ? 0 : 1, sub: d.subledger || '',
      cb: d.contaBancariaId || '', sis: d.sistema ? 1 : 0, agora: nowISO(), por: tenancy.userAtual() });
  return contaPorId(id);
};
const contaPorId = (id) => um('SELECT * FROM fin_contas WHERE tenant_id = :tenant AND id = :id', { id });
const contaPorCodigo = (entidadeId, codigo) => um(
  'SELECT * FROM fin_contas WHERE tenant_id = :tenant AND entidade_id = :ent AND codigo = :codigo',
  { ent: entidadeId, codigo });
const listarContas = (entidadeId, { somenteAnaliticas = false } = {}) => q(
  `SELECT * FROM fin_contas WHERE tenant_id = :tenant AND entidade_id = :ent AND status = 'ativa'
    ${somenteAnaliticas ? 'AND aceita_lancamento = 1' : ''} ORDER BY codigo`,
  { ent: entidadeId });

// ------------------------------------------------------- centros de custo
const criarCentroCusto = (d) => {
  const id = novoId();
  exec(`INSERT INTO fin_centros_custo (id, tenant_id, entidade_id, codigo, nome, tipo, externo_id, criado_em, criado_por)
        VALUES (:id, :tenant, :ent, :codigo, :nome, :tipo, :ext, :agora, :por)`,
    { id, ent: d.entidadeId, codigo: d.codigo, nome: d.nome, tipo: d.tipo || 'centro', ext: d.externoId || '', agora: nowISO(), por: tenancy.userAtual() });
  return centroCustoPorId(id);
};
const centroCustoPorId = (id) => um('SELECT * FROM fin_centros_custo WHERE tenant_id = :tenant AND id = :id', { id });
const centroCustoPorCodigo = (entidadeId, codigo) => um(
  'SELECT * FROM fin_centros_custo WHERE tenant_id = :tenant AND entidade_id = :ent AND codigo = :codigo',
  { ent: entidadeId, codigo });
const listarCentrosCusto = (entidadeId) => q(
  "SELECT * FROM fin_centros_custo WHERE tenant_id = :tenant AND entidade_id = :ent AND status = 'ativo' ORDER BY codigo",
  { ent: entidadeId });

// ------------------------------------------------------------- períodos
const periodo = (entidadeId, competencia) => um(
  'SELECT * FROM fin_periodos WHERE tenant_id = :tenant AND entidade_id = :ent AND competencia = :comp',
  { ent: entidadeId, comp: competencia });
const criarPeriodo = (entidadeId, competencia) => {
  exec(`INSERT INTO fin_periodos (id, tenant_id, entidade_id, competencia, status, criado_em)
        VALUES (:id, :tenant, :ent, :comp, 'aberto', :agora)`,
    { id: novoId(), ent: entidadeId, comp: competencia, agora: nowISO() });
  return periodo(entidadeId, competencia);
};
const fecharPeriodo = (entidadeId, competencia, por) => exec(
  `UPDATE fin_periodos SET status = 'fechado', fechado_em = :agora, fechado_por = :por
    WHERE tenant_id = :tenant AND entidade_id = :ent AND competencia = :comp`,
  { ent: entidadeId, comp: competencia, agora: nowISO(), por });
const reabrirPeriodo = (entidadeId, competencia, por, motivo) => exec(
  `UPDATE fin_periodos SET status = 'aberto', reaberto_em = :agora, reaberto_por = :por, reabertura_motivo = :motivo
    WHERE tenant_id = :tenant AND entidade_id = :ent AND competencia = :comp`,
  { ent: entidadeId, comp: competencia, agora: nowISO(), por, motivo });
const listarPeriodos = (entidadeId) => q(
  'SELECT * FROM fin_periodos WHERE tenant_id = :tenant AND entidade_id = :ent ORDER BY competencia DESC',
  { ent: entidadeId });

// ----------------------------------------------------------------- razão
const proximoNumeroLote = (entidadeId) => {
  const r = um('SELECT MAX(numero) AS n FROM fin_lotes WHERE tenant_id = :tenant AND entidade_id = :ent', { ent: entidadeId });
  return ((r && r.n) || 0) + 1;
};
const inserirLote = (d) => {
  exec(`INSERT INTO fin_lotes (id, tenant_id, entidade_id, numero, data, competencia, memo, origem,
          origem_ref, idempotencia, status, estorno_de, total_cents, criado_em, criado_por, correlation_id)
        VALUES (:id, :tenant, :ent, :numero, :data, :comp, :memo, :origem, :ref, :idem, :status, :estornoDe, :total, :agora, :por, :cid)`,
    { id: d.id, ent: d.entidadeId, numero: d.numero, data: d.data, comp: d.competencia, memo: d.memo || '',
      origem: d.origem || 'manual', ref: d.origemRef || '', idem: d.idempotencia || '',
      status: d.status || 'rascunho', estornoDe: d.estornoDe || '', total: d.totalCents || 0,
      agora: nowISO(), por: tenancy.userAtual(), cid: tenancy.correlationId() });
  return lotePorId(d.id);
};
const inserirLinha = (d) => exec(
  `INSERT INTO fin_linhas (id, tenant_id, lote_id, ordem, conta_id, debito_cents, credito_cents,
     centro_custo_id, contraparte_id, memo, ref_tipo, ref_id, criado_em)
   VALUES (:id, :tenant, :lote, :ordem, :conta, :deb, :cred, :cc, :cp, :memo, :refTipo, :refId, :agora)`,
  { id: d.id || novoId(), lote: d.loteId, ordem: d.ordem || 0, conta: d.contaId,
    deb: d.debitoCents || 0, cred: d.creditoCents || 0, cc: d.centroCustoId || '',
    cp: d.contraparteId || '', memo: d.memo || '', refTipo: d.refTipo || '', refId: d.refId || '', agora: nowISO() });

const contabilizarLote = (id, totalCents) => exec(
  `UPDATE fin_lotes SET status = 'contabilizado', total_cents = :total,
     contabilizado_em = :agora, contabilizado_por = :por
    WHERE tenant_id = :tenant AND id = :id AND status = 'rascunho'`,
  { id, total: totalCents, agora: nowISO(), por: tenancy.userAtual() });

const marcarEstornado = (id, loteEstornoId, motivo) => exec(
  `UPDATE fin_lotes SET status = 'estornado', estornado_por = :estorno, estorno_motivo = :motivo
    WHERE tenant_id = :tenant AND id = :id AND status = 'contabilizado'`,
  { id, estorno: loteEstornoId, motivo });

const lotePorId = (id) => um('SELECT * FROM fin_lotes WHERE tenant_id = :tenant AND id = :id', { id });
const lotePorIdempotencia = (chave) => um(
  'SELECT * FROM fin_lotes WHERE tenant_id = :tenant AND idempotencia = :chave', { chave });
const linhasDoLote = (loteId) => q(
  `SELECT l.*, c.codigo AS conta_codigo, c.nome AS conta_nome, c.natureza
     FROM fin_linhas l JOIN fin_contas c ON c.id = l.conta_id
    WHERE l.tenant_id = :tenant AND l.lote_id = :lote ORDER BY l.ordem`, { lote: loteId });
const listarLotes = (entidadeId, { competencia = '', status = '', limite = 200 } = {}) => q(
  `SELECT * FROM fin_lotes WHERE tenant_id = :tenant AND entidade_id = :ent
     ${competencia ? 'AND competencia = :comp' : ''} ${status ? 'AND status = :status' : ''}
   ORDER BY data DESC, numero DESC LIMIT :limite`,
  { ent: entidadeId, comp: competencia, status, limite });

// Lote ESTORNADO continua valendo no saldo: o estorno é um lançamento
// espelho que o compensa, não uma remoção. Filtrar por 'contabilizado'
// tiraria o original e deixaria só a contrapartida — invertendo o saldo.
// Por isso o critério é "não é rascunho", e não "é contabilizado".
/** Saldo de uma conta pelo razão (nunca por soma de tabela transacional). */
const saldoDaConta = (contaId, { ate = '', desde = '' } = {}) => um(
  `SELECT COALESCE(SUM(l.debito_cents),0) AS debito, COALESCE(SUM(l.credito_cents),0) AS credito
     FROM fin_linhas l JOIN fin_lotes b ON b.id = l.lote_id
    WHERE l.tenant_id = :tenant AND l.conta_id = :conta AND b.status <> 'rascunho'
      ${desde ? 'AND b.data >= :desde' : ''} ${ate ? 'AND b.data <= :ate' : ''}`,
  { conta: contaId, desde, ate });

/** Balancete: saldo de todas as contas analíticas da entidade no período. */
/**
 * Balancete de todas as analíticas, com filtro de período.
 *
 * ⚠️ O `CASE WHEN b.id IS NOT NULL` NÃO é enfeite. A conta parte de
 * `fin_contas` (para trazer também as contas sem movimento), então as duas
 * junções são LEFT. Com o filtro de data só na junção do lote, a LINHA
 * continua na saída quando o lote fica de fora do período — e somar
 * `l.debito_cents` direto incluiria o mês inteiro que se quis excluir.
 *
 * Era exatamente esse o bug: o DRE de agosto mostrava junho + julho +
 * agosto, silenciosamente, porque o filtro de período não tinha efeito
 * nenhum sobre a soma. Só apareceu quando a produção recebeu três meses.
 */
const balancete = (entidadeId, { desde = '', ate = '' } = {}) => q(
  `SELECT c.id, c.codigo, c.nome, c.natureza, c.saldo_normal,
          COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN l.debito_cents  ELSE 0 END), 0) AS debito,
          COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN l.credito_cents ELSE 0 END), 0) AS credito
     FROM fin_contas c
     LEFT JOIN fin_linhas l ON l.conta_id = c.id AND l.tenant_id = c.tenant_id
     LEFT JOIN fin_lotes b ON b.id = l.lote_id AND b.status <> 'rascunho'
          ${desde ? 'AND b.data >= :desde' : ''} ${ate ? 'AND b.data <= :ate' : ''}
    WHERE c.tenant_id = :tenant AND c.entidade_id = :ent AND c.aceita_lancamento = 1
    GROUP BY c.id ORDER BY c.codigo`,
  { ent: entidadeId, desde, ate });

/** Razão de uma conta: cada linha com o lote de origem (drill-down). */
const razaoDaConta = (contaId, { desde = '', ate = '', limite = 500 } = {}) => q(
  `SELECT l.id, l.debito_cents, l.credito_cents, l.memo, l.ref_tipo, l.ref_id,
          b.id AS lote_id, b.numero, b.data, b.competencia, b.memo AS lote_memo,
          b.origem, b.origem_ref, b.status
     FROM fin_linhas l JOIN fin_lotes b ON b.id = l.lote_id
    WHERE l.tenant_id = :tenant AND l.conta_id = :conta AND b.status <> 'rascunho'
      ${desde ? 'AND b.data >= :desde' : ''} ${ate ? 'AND b.data <= :ate' : ''}
    ORDER BY b.data, b.numero LIMIT :limite`,
  { conta: contaId, desde, ate, limite });

/** Resultado por centro de custo (DRE por imóvel/projeto). */
const resultadoPorCentro = (entidadeId, { desde = '', ate = '' } = {}) => q(
  `SELECT COALESCE(NULLIF(l.centro_custo_id,''),'(sem centro)') AS centro_id,
          c.natureza,
          COALESCE(SUM(l.debito_cents),0) AS debito,
          COALESCE(SUM(l.credito_cents),0) AS credito
     FROM fin_linhas l
     JOIN fin_lotes b ON b.id = l.lote_id AND b.status <> 'rascunho'
     JOIN fin_contas c ON c.id = l.conta_id
    WHERE l.tenant_id = :tenant AND b.entidade_id = :ent AND c.natureza IN ('receita','despesa')
      ${desde ? 'AND b.data >= :desde' : ''} ${ate ? 'AND b.data <= :ate' : ''}
    GROUP BY centro_id, c.natureza`,
  { ent: entidadeId, desde, ate });

// ------------------------------------------------------- contrapartes
const criarContraparte = (d) => {
  const id = novoId();
  exec(`INSERT INTO fin_contrapartes (id, tenant_id, entidade_id, tipo, nome, documento, email, telefone, externo_id, criado_em, criado_por)
        VALUES (:id, :tenant, :ent, :tipo, :nome, :doc, :email, :tel, :ext, :agora, :por)`,
    { id, ent: d.entidadeId, tipo: d.tipo || 'fornecedor', nome: d.nome, doc: d.documento || '',
      email: d.email || '', tel: d.telefone || '', ext: d.externoId || '', agora: nowISO(), por: tenancy.userAtual() });
  return contraparte(id);
};
const contraparte = (id) => um('SELECT * FROM fin_contrapartes WHERE tenant_id = :tenant AND id = :id', { id });
const listarContrapartes = (entidadeId, tipo = '') => q(
  `SELECT * FROM fin_contrapartes WHERE tenant_id = :tenant AND entidade_id = :ent AND status = 'ativo'
     ${tipo ? "AND tipo IN (:tipo, 'ambos')" : ''} ORDER BY nome`, { ent: entidadeId, tipo });

// --------------------------------------------------- contas bancárias
const criarContaBancaria = (d) => {
  const id = novoId();
  exec(`INSERT INTO fin_contas_bancarias (id, tenant_id, entidade_id, nome, banco, agencia, numero, tipo,
          conta_id, saldo_inicial_cents, saldo_inicial_data, criado_em, criado_por)
        VALUES (:id, :tenant, :ent, :nome, :banco, :ag, :num, :tipo, :conta, :saldo, :data, :agora, :por)`,
    { id, ent: d.entidadeId, nome: d.nome, banco: d.banco || '', ag: d.agencia || '', num: d.numero || '',
      tipo: d.tipo || 'corrente', conta: d.contaId || '', saldo: d.saldoInicialCents || 0,
      data: d.saldoInicialData || '', agora: nowISO(), por: tenancy.userAtual() });
  return contaBancaria(id);
};
const contaBancaria = (id) => um('SELECT * FROM fin_contas_bancarias WHERE tenant_id = :tenant AND id = :id', { id });
const listarContasBancarias = (entidadeId) => q(
  "SELECT * FROM fin_contas_bancarias WHERE tenant_id = :tenant AND entidade_id = :ent AND status = 'ativa' ORDER BY nome",
  { ent: entidadeId });

// ------------------------------------------------------- importações
const criarImportacao = (d) => {
  const id = novoId();
  exec(`INSERT INTO fin_importacoes (id, tenant_id, entidade_id, conta_bancaria_id, formato, fonte,
          arquivo_hash, linhas_lidas, linhas_novas, linhas_duplicadas, linhas_rejeitadas, rejeitos, criado_em, criado_por)
        VALUES (:id, :tenant, :ent, :cb, :fmt, :fonte, :hash, :lidas, :novas, :dup, :rej, :rejeitos, :agora, :por)`,
    { id, ent: d.entidadeId, cb: d.contaBancariaId || '', fmt: d.formato || 'csv', fonte: d.fonte || '',
      hash: d.arquivoHash || '', lidas: d.linhasLidas || 0, novas: d.linhasNovas || 0,
      dup: d.linhasDuplicadas || 0, rej: d.linhasRejeitadas || 0, rejeitos: j.str(d.rejeitos || []),
      agora: nowISO(), por: tenancy.userAtual() });
  return importacao(id);
};
const importacao = (id) => um('SELECT * FROM fin_importacoes WHERE tenant_id = :tenant AND id = :id', { id });
const importacaoPorHash = (contaBancariaId, hash) => um(
  'SELECT * FROM fin_importacoes WHERE tenant_id = :tenant AND conta_bancaria_id = :cb AND arquivo_hash = :hash',
  { cb: contaBancariaId, hash });
const listarImportacoes = (entidadeId, limite = 50) => q(
  'SELECT * FROM fin_importacoes WHERE tenant_id = :tenant AND entidade_id = :ent ORDER BY criado_em DESC LIMIT :limite',
  { ent: entidadeId, limite });

// -------------------------------------------------- transações do banco
const inserirTransacao = (d) => {
  const id = novoId();
  exec(`INSERT INTO fin_transacoes_banco (id, tenant_id, entidade_id, conta_bancaria_id, importacao_id,
          data, valor_cents, descricao, documento, contraparte_nome, contraparte_doc, fingerprint, bruto, status, criado_em)
        VALUES (:id, :tenant, :ent, :cb, :imp, :data, :valor, :desc, :doc, :cpn, :cpd, :fp, :bruto, 'nova', :agora)`,
    { id, ent: d.entidadeId, cb: d.contaBancariaId, imp: d.importacaoId || '', data: d.data,
      valor: d.valorCents, desc: d.descricao || '', doc: d.documento || '', cpn: d.contraparteNome || '',
      cpd: d.contraparteDoc || '', fp: d.fingerprint, bruto: j.str(d.bruto || {}), agora: nowISO() });
  return transacao(id);
};
const transacao = (id) => um('SELECT * FROM fin_transacoes_banco WHERE tenant_id = :tenant AND id = :id', { id });
const transacaoPorFingerprint = (contaBancariaId, fp) => um(
  'SELECT * FROM fin_transacoes_banco WHERE tenant_id = :tenant AND conta_bancaria_id = :cb AND fingerprint = :fp',
  { cb: contaBancariaId, fp });
const listarTransacoes = (entidadeId, { status = '', contaBancariaId = '', desde = '', ate = '', limite = 200 } = {}) => q(
  `SELECT * FROM fin_transacoes_banco WHERE tenant_id = :tenant AND entidade_id = :ent
     ${status ? 'AND status = :status' : ''} ${contaBancariaId ? 'AND conta_bancaria_id = :cb' : ''}
     ${desde ? 'AND data >= :desde' : ''} ${ate ? 'AND data <= :ate' : ''}
   ORDER BY data DESC, criado_em DESC LIMIT :limite`,
  { ent: entidadeId, status, cb: contaBancariaId, desde, ate, limite });
const atualizarTransacao = (id, campos) => {
  const permitidos = ['status', 'sugestao', 'lote_id', 'ignorada_motivo'];
  const sets = [], params = { id, agora: nowISO() };
  for (const [k, v] of Object.entries(campos)) {
    if (!permitidos.includes(k)) continue;
    sets.push(`${k} = :${k}`); params[k] = typeof v === 'object' ? j.str(v) : v;
  }
  if (!sets.length) return transacao(id);
  exec(`UPDATE fin_transacoes_banco SET ${sets.join(', ')}, atualizado_em = :agora
         WHERE tenant_id = :tenant AND id = :id`, params);
  return transacao(id);
};
const contarTransacoes = (entidadeId) => q(
  `SELECT status, COUNT(*) AS n FROM fin_transacoes_banco
    WHERE tenant_id = :tenant AND entidade_id = :ent GROUP BY status`, { ent: entidadeId });

// ------------------------------------------------------------- regras
const criarRegra = (d) => {
  const id = novoId();
  exec(`INSERT INTO fin_regras_classificacao (id, tenant_id, entidade_id, nome, prioridade, padrao, sentido,
          valor_min_cents, valor_max_cents, conta_id, centro_custo_id, contraparte_id, confianca, origem, criado_em, criado_por)
        VALUES (:id, :tenant, :ent, :nome, :prio, :padrao, :sentido, :min, :max, :conta, :cc, :cp, :conf, :origem, :agora, :por)`,
    { id, ent: d.entidadeId, nome: d.nome, prio: d.prioridade || 100, padrao: d.padrao || '',
      sentido: d.sentido || 'ambos', min: d.valorMinCents || 0, max: d.valorMaxCents || 0,
      conta: d.contaId || '', cc: d.centroCustoId || '', cp: d.contraparteId || '',
      conf: d.confianca == null ? 80 : d.confianca, origem: d.origem || 'manual', agora: nowISO(), por: tenancy.userAtual() });
  return regra(id);
};
const regra = (id) => um('SELECT * FROM fin_regras_classificacao WHERE tenant_id = :tenant AND id = :id', { id });
const listarRegras = (entidadeId) => q(
  `SELECT * FROM fin_regras_classificacao WHERE tenant_id = :tenant AND entidade_id = :ent AND status = 'ativa'
   ORDER BY prioridade, criado_em`, { ent: entidadeId });
const registrarAcertoRegra = (id, acertou) => exec(
  `UPDATE fin_regras_classificacao SET ${acertou ? 'acertos = acertos + 1' : 'erros = erros + 1'}
    WHERE tenant_id = :tenant AND id = :id`, { id });

// --------------------------------------------------------- aprovações
const criarAprovacao = (d) => {
  const id = novoId();
  exec(`INSERT INTO fin_aprovacoes (id, tenant_id, entidade_id, acao, nivel, objeto_tipo, objeto_id,
          payload, previa, valor_cents, solicitante, solicitado_em, motivo, expira_em, correlation_id)
        VALUES (:id, :tenant, :ent, :acao, :nivel, :ot, :oi, :payload, :previa, :valor, :sol, :agora, :motivo, :expira, :cid)`,
    { id, ent: d.entidadeId || '', acao: d.acao, nivel: d.nivel == null ? 2 : d.nivel,
      ot: d.objetoTipo || '', oi: d.objetoId || '', payload: j.str(d.payload || {}), previa: j.str(d.previa || {}),
      valor: d.valorCents || 0, sol: tenancy.userAtual(), agora: nowISO(), motivo: d.motivo || '',
      expira: d.expiraEm || '', cid: tenancy.correlationId() });
  return aprovacao(id);
};
const aprovacao = (id) => um('SELECT * FROM fin_aprovacoes WHERE tenant_id = :tenant AND id = :id', { id });
const listarAprovacoes = (status = 'pendente', limite = 100) => q(
  `SELECT * FROM fin_aprovacoes WHERE tenant_id = :tenant ${status ? 'AND status = :status' : ''}
   ORDER BY solicitado_em DESC LIMIT :limite`, { status, limite });
const decidirAprovacao = (id, { status, decisor, motivo }) => exec(
  `UPDATE fin_aprovacoes SET status = :status, decisor = :decisor, decidido_em = :agora, decisao_motivo = :motivo
    WHERE tenant_id = :tenant AND id = :id AND status = 'pendente'`,
  { id, status, decisor, motivo: motivo || '', agora: nowISO() });
const registrarExecucao = (id, { status, resultado }) => exec(
  `UPDATE fin_aprovacoes SET status = :status, resultado = :resultado, executado_em = :agora
    WHERE tenant_id = :tenant AND id = :id`,
  { id, status, resultado: j.str(resultado || {}), agora: nowISO() });
const expirarAprovacoesVencidas = (agora) => exec(
  `UPDATE fin_aprovacoes SET status = 'expirada'
    WHERE tenant_id = :tenant AND status = 'pendente' AND expira_em <> '' AND expira_em < :agora`,
  { agora });

// --------------------------------------------------------- auditoria
const ultimoAudit = (tenantId) => um(
  'SELECT seq, hash FROM audit_logs WHERE tenant_id = :tenant ORDER BY seq DESC LIMIT 1',
  { tenant: tenantId });
const inserirAudit = (d) => {
  db.prepare(`INSERT INTO audit_logs (id, tenant_id, seq, quando, ator, ator_tipo, acao, objeto_tipo,
      objeto_id, motivo, detalhe, correlation_id, origem_ip, hash_anterior, hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    d.id, d.tenantId, d.seq, d.quando, d.ator, d.atorTipo, d.acao, d.objetoTipo, d.objetoId,
    d.motivo, d.detalhe, d.correlationId, d.origemIp, d.hashAnterior, d.hash);
};
const listarAudit = (filtros = {}) => q(
  `SELECT * FROM audit_logs WHERE tenant_id = :tenant
     ${filtros.objetoTipo ? 'AND objeto_tipo = :ot' : ''} ${filtros.objetoId ? 'AND objeto_id = :oi' : ''}
   ORDER BY seq DESC LIMIT :limite`,
  { ot: filtros.objetoTipo || '', oi: filtros.objetoId || '', limite: filtros.limite || 200 });
const auditEmOrdem = (tenantId) => db.prepare(
  'SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY seq').all(tenantId);

/**
 * Parcelas em aberto com o que o casamento com o extrato precisa: o saldo,
 * o vencimento, o documento e o nome da contraparte. Uma consulta só —
 * casar linha a linha do extrato contra o banco seria N+1.
 */
const parcelasAbertasParaCasamento = (entidadeId, especie) => q(
  `SELECT p.id, p.titulo_id, p.numero, p.vencimento, p.valor_cents, p.pago_cents,
          t.especie, t.documento, t.descricao, t.competencia,
          c.nome AS contraparte_nome, c.id AS contraparte_id
     FROM fin_parcelas p
     JOIN fin_titulos t ON t.id = p.titulo_id AND t.tenant_id = p.tenant_id
     LEFT JOIN fin_contrapartes c ON c.id = t.contraparte_id AND c.tenant_id = t.tenant_id
    WHERE p.tenant_id = :tenant AND t.entidade_id = :ent AND t.especie = :especie
      AND p.status IN ('aberta','parcial') AND t.status <> 'cancelado'
    ORDER BY p.vencimento
    LIMIT 2000`,
  { ent: entidadeId, especie });

// ----------------------------------------------------- assinatura/cobrança
// `subscriptions` e `invoices` têm tenant_id — passam pelo guarda como
// qualquer tabela de domínio. As buscas do WEBHOOK são a exceção: chegam
// sem contexto (quem fala é o Mercado Pago, não o assinante), e por isso
// usam qPlataforma, que exige tenancy.comoPlataforma() com motivo.

const criarAssinatura = (d) => {
  const id = novoId();
  exec(`INSERT INTO subscriptions (id, tenant_id, plano_id, status, externo_ref, inicio, criado_em)
        VALUES (:id, :tenant, :plano, :status, :ref, :inicio, :agora)`,
    { id, plano: d.planoId, status: d.status || 'ativa', ref: d.externoRef || '', inicio: d.inicio || nowISO(), agora: nowISO() });
  return assinatura(id);
};
const assinatura = (id) => um('SELECT * FROM subscriptions WHERE tenant_id = :tenant AND id = :id', { id });
const assinaturaVigente = () => um(
  `SELECT * FROM subscriptions WHERE tenant_id = :tenant
     AND status IN ('pendente','ativa','inadimplente') ORDER BY criado_em DESC LIMIT 1`, {});
const listarAssinaturas = (limite = 24) => q(
  'SELECT * FROM subscriptions WHERE tenant_id = :tenant ORDER BY criado_em DESC LIMIT :limite', { limite });
const atualizarAssinatura = (id, campos) => {
  const permitidos = ['status', 'plano_id', 'externo_ref', 'fim'];
  const sets = Object.keys(campos).filter(k => permitidos.includes(k));
  if (!sets.length) return assinatura(id);
  const bind = { id, agora: nowISO() };
  for (const k of sets) bind[k] = campos[k];
  exec(`UPDATE subscriptions SET ${sets.map(k => `${k} = :${k}`).join(', ')}, atualizado_em = :agora
        WHERE tenant_id = :tenant AND id = :id`, bind);
  return assinatura(id);
};

/** Webhook: descobre de QUEM é o preapproval. Sem contexto, por natureza. */
const assinaturaPorRefExterna = (ref) => umPlataforma(
  "SELECT * FROM subscriptions WHERE externo_ref = :ref AND externo_ref <> '' ORDER BY criado_em DESC LIMIT 1",
  { ref: String(ref || '') });

const criarInvoice = (d) => {
  const id = novoId();
  exec(`INSERT INTO invoices (id, tenant_id, competencia, valor_cents, status, vencimento, pago_em, externo_ref, criado_em)
        VALUES (:id, :tenant, :comp, :valor, :status, :venc, :pago, :ref, :agora)`,
    { id, comp: d.competencia, valor: d.valorCents || 0, status: d.status || 'aberta',
      venc: d.vencimento || '', pago: d.pagoEm || '', ref: d.externoRef || '', agora: nowISO() });
  return invoice(id);
};
const invoice = (id) => um('SELECT * FROM invoices WHERE tenant_id = :tenant AND id = :id', { id });
const listarInvoices = (limite = 12) => q(
  'SELECT * FROM invoices WHERE tenant_id = :tenant ORDER BY criado_em DESC LIMIT :limite', { limite });
const marcarInvoicePaga = (id, ref = '') => {
  exec(`UPDATE invoices SET status = 'paga', pago_em = :agora, externo_ref = CASE WHEN :ref <> '' THEN :ref ELSE externo_ref END
        WHERE tenant_id = :tenant AND id = :id`, { id, ref: String(ref || ''), agora: nowISO() });
  return invoice(id);
};

/**
 * Idempotência do pagamento: o Mercado Pago reenvia o mesmo webhook. A
 * pergunta "já registrei este pagamento?" é feita DENTRO da conta — o
 * webhook já resolveu de quem é antes de chegar aqui, e responder de
 * fora do guarda seria abrir uma leitura cruzada sem necessidade.
 */
const invoicePorRefExterna = (ref) => um(
  `SELECT * FROM invoices WHERE tenant_id = :tenant AND externo_ref = :ref AND externo_ref <> '' LIMIT 1`,
  { ref: String(ref || '') });

/** Faturamento recorrente da plataforma (MRR), conta a conta. */
const assinaturasAtivasDaPlataforma = () => qPlataforma(
  `SELECT s.tenant_id, s.status, s.plano_id, s.externo_ref, s.inicio
     FROM subscriptions s WHERE s.status IN ('ativa','inadimplente')`, {});

// ------------------------------------------------------------- eventos
const publicarEvento = (d) => {
  const id = novoId();
  exec(`INSERT INTO fin_eventos (id, tenant_id, tipo, payload, correlation_id, criado_em)
        VALUES (:id, :tenant, :tipo, :payload, :cid, :agora)`,
    { id, tipo: d.tipo, payload: j.str(d.payload || {}), cid: tenancy.correlationId(), agora: nowISO() });
  return id;
};
/**
 * Evento da PLATAFORMA (tenant_id = ''): régua de cobrança, rotinas. A
 * tabela é mista — o guarda exige o predicado de tenant_id no SQL, não
 * um contexto, porque quem grava aqui não age em nome de conta nenhuma.
 */
const eventoDePlataforma = (tipo, payload = {}) => {
  const id = novoId();
  exec(`INSERT INTO fin_eventos (id, tenant_id, tipo, payload, status, criado_em)
        VALUES (:id, '', :tipo, :payload, 'processado', :agora)`,
    { id, tipo, payload: j.str(payload || {}), agora: nowISO() });
  return id;
};
const ultimoEventoDePlataforma = (tipo) => um(
  `SELECT id, criado_em, payload FROM fin_eventos
     WHERE tenant_id = '' AND tipo = :tipo ORDER BY criado_em DESC LIMIT 1`, { tipo });

const eventosPendentes = (limite = 50) => db.prepare(
  "SELECT * FROM fin_eventos WHERE status = 'pendente' AND (proxima_em = '' OR proxima_em <= ?) ORDER BY criado_em LIMIT ?"
).all(nowISO(), limite);
const marcarEvento = (id, status, erro = '') => db.prepare(
  'UPDATE fin_eventos SET status = ?, erro = ?, tentativas = tentativas + 1, processado_em = ? WHERE id = ?'
).run(status, String(erro).slice(0, 300), nowISO(), id);

module.exports = {
  q, um, exec, qPlataforma, umPlataforma, execPlataforma, verificarSql,
  criarTenant, tenantPorId, tenantPorSlug, listarTenants, atualizarTenant,
  listarPlanos, planoPorSlug, planoPorId, upsertPlano, atualizarPrecoPlano,
  criarUsuario, usuarioPorId, usuarioPorEmail, listarUsuarios, trocarSenhaDoUsuario,
  criarEntidade, entidadePorId, listarEntidades,
  criarConta, contaPorId, contaPorCodigo, listarContas,
  criarCentroCusto, centroCustoPorId, centroCustoPorCodigo, listarCentrosCusto,
  periodo, criarPeriodo, fecharPeriodo, reabrirPeriodo, listarPeriodos,
  proximoNumeroLote, inserirLote, inserirLinha, contabilizarLote, marcarEstornado,
  lotePorId, lotePorIdempotencia, linhasDoLote, listarLotes,
  saldoDaConta, balancete, razaoDaConta, resultadoPorCentro,
  criarContraparte, contraparte, listarContrapartes,
  criarContaBancaria, contaBancaria, listarContasBancarias,
  criarImportacao, importacao, importacaoPorHash, listarImportacoes,
  inserirTransacao, transacao, transacaoPorFingerprint, listarTransacoes, atualizarTransacao, contarTransacoes,
  criarRegra, regra, listarRegras, registrarAcertoRegra,
  parcelasAbertasParaCasamento,
  criarAprovacao, aprovacao, listarAprovacoes, decidirAprovacao, registrarExecucao, expirarAprovacoesVencidas,
  ultimoAudit, inserirAudit, listarAudit, auditEmOrdem,
  publicarEvento, eventosPendentes, marcarEvento, eventoDePlataforma, ultimoEventoDePlataforma,
  criarAssinatura, assinatura, assinaturaVigente, listarAssinaturas, atualizarAssinatura,
  assinaturaPorRefExterna, assinaturasAtivasDaPlataforma,
  criarInvoice, invoice, listarInvoices, marcarInvoicePaga, invoicePorRefExterna,
};
