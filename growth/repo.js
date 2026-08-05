// =====================================================================
// Villela Growth OS — repositório. ÚNICO lugar com SQL de domínio.
//
// Sem RLS neste banco (ADR-0001), o isolamento entre clientes é aqui:
//   • toda query que toca tabela com tenant_id exige contexto de tenant;
//   • o tenant é INJETADO do contexto — o chamador não escolhe;
//   • parâmetro posicional é recusado nessas tabelas (evita o clássico
//     "passei o tenant errado na posição errada");
//   • leitura cruzada só via qPlataforma(), que exige papel de plataforma
//     e grava auditoria.
//
// O selftest tenta furar cada uma dessas regras e exige falha.
// =====================================================================
'use strict';
const { db, novoId, nowISO, j, TABELAS_TENANT, TABELAS_CATALOGO, TABELAS_MISTAS, temColuna } = require('./db');
const tenancy = require('./tenancy');
const { ErroDeIsolamento } = tenancy;

// ---------------------------------------------------------------- guarda

// Extrai os nomes de tabela citados no SQL. Grosseiro de propósito: serve
// para pegar o erro real (esquecer o filtro), não para validar SQL.
const RE_TABELAS = /\b(?:from|join|into|update|table)\s+["'`\[]?([a-z_][a-z0-9_]*)["'`\]]?/gi;
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

  // Mistas (globais + por tenant na mesma tabela): predicado obrigatório,
  // contexto opcional. Sem isto, um perfil personalizado de um cliente
  // apareceria para outro.
  if (mistas.length && !/tenant_id/i.test(sql)) {
    throw new ErroDeIsolamento(
      `Query sem filtro de tenant em ${mistas.join(', ')}. ` +
      "Use tenant_id = '' para linhas de sistema ou tenant_id IN (:tenant, '')."
    );
  }
  if (!tabelas.length) {
    // Só mistas: injeta o tenant se houver contexto, para o :tenant do SQL.
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
  const tenant = tenancy.tenantAtual();                // lança se não houver contexto
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

function preparar(sql, params, opts) {
  const tenant = verificarSql(sql, params, opts);
  const st = db.prepare(sql);
  let bind = params;
  if (tenant && !Array.isArray(params)) bind = Object.assign({}, params || {}, { tenant });
  return { st, bind: bind == null ? {} : bind };
}

const q = (sql, params) => { const { st, bind } = preparar(sql, params); return Array.isArray(bind) ? st.all(...bind) : st.all(bind); };
const um = (sql, params) => { const { st, bind } = preparar(sql, params); return (Array.isArray(bind) ? st.get(...bind) : st.get(bind)) || null; };
const exec = (sql, params) => { const { st, bind } = preparar(sql, params); return Array.isArray(bind) ? st.run(...bind) : st.run(bind); };

/** Leitura/escrita atravessando contas. Exige comoPlataforma() e audita. */
function qPlataforma(sql, params = {}, { motivo = '' } = {}) {
  const { st, bind } = preparar(sql, params, { plataforma: true });
  const linhas = Array.isArray(bind) ? st.all(...bind) : st.all(bind);
  auditar({ acao: 'plataforma.consulta', entidade: 'sql', detalhe: motivo || (tenancy.atual() || {}).motivo || '', tenantId: '' });
  return linhas;
}
function execPlataforma(sql, params = {}) {
  const { st, bind } = preparar(sql, params, { plataforma: true });
  return Array.isArray(bind) ? st.run(...bind) : st.run(bind);
}

// -------------------------------------------------------- construtores

// Predicado de tenant da tabela: mista enxerga as linhas de sistema também.
function predicado(tabela) {
  if (TABELAS_MISTAS.has(tabela)) {
    const ctx = tenancy.atual();
    return (ctx && ctx.tenantId) ? "tenant_id IN (:tenant, '')" : "tenant_id = ''";
  }
  if (TABELAS_TENANT.has(tabela) && !TABELAS_CATALOGO.has(tabela)) return 'tenant_id = :tenant';
  return '';
}
const precisaTenant = (tabela) => TABELAS_TENANT.has(tabela) && !TABELAS_CATALOGO.has(tabela) && !TABELAS_MISTAS.has(tabela);

/**
 * Semeadura de linha GLOBAL (tenant_id = '') em tabela mista — perfis de
 * sistema, por exemplo. Só roda no boot do módulo, e por isso é explícita:
 * não existe caminho acidental que grave uma linha sem dono.
 */
function semearGlobal(tabela, linha) {
  if (!TABELAS_MISTAS.has(tabela)) throw new Error(`semearGlobal só vale para tabela mista (${tabela}).`);
  const dados = Object.assign({}, linha, { tenant_id: '' });
  if (!dados.id) dados.id = novoId();
  if (temColuna(tabela, 'criado_em') && !dados.criado_em) dados.criado_em = nowISO();
  const cols = Object.keys(dados).filter(c => temColuna(tabela, c));
  const bind = {};
  for (const c of cols) bind[c] = normalizar(dados[c]);
  db.prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(c => ':' + c).join(', ')})`).run(bind);
  return dados.id;
}

/** Atualiza linha GLOBAL de tabela mista (par de semearGlobal). */
function atualizarGlobal(tabela, id, dados = {}) {
  if (!TABELAS_MISTAS.has(tabela)) throw new Error(`atualizarGlobal só vale para tabela mista (${tabela}).`);
  const linha = Object.assign({}, dados);
  delete linha.id; delete linha.tenant_id;
  if (temColuna(tabela, 'atualizado_em')) linha.atualizado_em = nowISO();
  const cols = Object.keys(linha).filter(c => temColuna(tabela, c));
  if (!cols.length) return 0;
  const bind = { id };
  for (const c of cols) bind[c] = normalizar(linha[c]);
  const sets = cols.map(c => `${c} = :${c}`).join(', ');
  return db.prepare(`UPDATE ${tabela} SET ${sets} WHERE id = :id AND tenant_id = ''`).run(bind).changes;
}

function inserir(tabela, dados = {}) {
  const tenant = precisaTenant(tabela) || TABELAS_MISTAS.has(tabela) ? tenancy.tenantAtual() : null;
  const agora = nowISO();
  const autor = tenancy.userAtual();
  const linha = Object.assign({}, dados);

  if (!linha.id && temColuna(tabela, 'id')) linha.id = novoId();
  if (tenant) linha.tenant_id = tenant;                 // sempre o do contexto
  if (temColuna(tabela, 'criado_em') && !linha.criado_em) linha.criado_em = agora;
  if (temColuna(tabela, 'criado_por') && !linha.criado_por) linha.criado_por = autor;
  if (temColuna(tabela, 'atualizado_em') && !linha.atualizado_em) linha.atualizado_em = agora;
  if (temColuna(tabela, 'atualizado_por') && !linha.atualizado_por) linha.atualizado_por = autor;

  const cols = Object.keys(linha).filter(c => temColuna(tabela, c));
  const sql = `INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(c => ':' + c).join(', ')})`;
  const bind = {};
  for (const c of cols) bind[c] = normalizar(linha[c]);
  db.prepare(sql).run(bind);
  return linha.id || null;
}

/**
 * Insere linha de escopo de PLATAFORMA (tenant_id = '') em tabela sob
 * isolamento — evento e job que não pertencem a nenhuma conta. Exige
 * tenancy.comoPlataforma(), então não há caminho acidental.
 */
function inserirPlataforma(tabela, dados = {}) {
  if (!tenancy.ehPlataforma()) {
    throw new ErroDeIsolamento('inserirPlataforma exige tenancy.comoPlataforma().');
  }
  const linha = Object.assign({}, dados, { tenant_id: '' });
  if (!linha.id && temColuna(tabela, 'id')) linha.id = novoId();
  if (temColuna(tabela, 'criado_em') && !linha.criado_em) linha.criado_em = nowISO();
  const cols = Object.keys(linha).filter(c => temColuna(tabela, c));
  const bind = {};
  for (const c of cols) bind[c] = normalizar(linha[c]);
  db.prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(c => ':' + c).join(', ')})`).run(bind);
  return linha.id || null;
}

function atualizar(tabela, id, dados = {}) {
  const linha = Object.assign({}, dados);
  delete linha.id; delete linha.tenant_id;              // não se muda a dona da linha
  if (temColuna(tabela, 'atualizado_em')) linha.atualizado_em = nowISO();
  if (temColuna(tabela, 'atualizado_por')) linha.atualizado_por = tenancy.userAtual();

  const cols = Object.keys(linha).filter(c => temColuna(tabela, c));
  if (!cols.length) return 0;
  const bind = { id };
  for (const c of cols) bind[c] = normalizar(linha[c]);

  const sets = cols.map(c => `${c} = :${c}`).join(', ');
  const pred = predicado(tabela);
  const sql = `UPDATE ${tabela} SET ${sets} WHERE id = :id${pred ? ` AND ${pred}` : ''}`;
  return pred ? exec(sql, bind).changes : db.prepare(sql).run(bind).changes;
}

function buscar(tabela, id) {
  const pred = predicado(tabela);
  const sql = `SELECT * FROM ${tabela} WHERE id = :id${pred ? ` AND ${pred}` : ''}`;
  return pred ? um(sql, { id }) : (db.prepare(sql).get({ id }) || null);
}

function montarWhere(tabela, onde, incluirExcluidos) {
  const cond = [];
  const pred = predicado(tabela);
  if (pred) cond.push(pred);
  if (!incluirExcluidos && temColuna(tabela, 'excluido_em')) cond.push("excluido_em = ''");
  if (onde) cond.push(`(${onde})`);
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', pred };
}

function listar(tabela, { onde = '', params = {}, ordem = 'criado_em DESC', limite = 200, offset = 0, incluirExcluidos = false } = {}) {
  const { where, pred } = montarWhere(tabela, onde, incluirExcluidos);
  const sql = `SELECT * FROM ${tabela} ${where} ORDER BY ${ordem} LIMIT :limite OFFSET :offset`;
  const bind = Object.assign({}, params, { limite: Math.min(Number(limite) || 200, 1000), offset: Number(offset) || 0 });
  return pred ? q(sql, bind) : db.prepare(sql).all(bind);
}

function contar(tabela, { onde = '', params = {}, incluirExcluidos = false } = {}) {
  const { where, pred } = montarWhere(tabela, onde, incluirExcluidos);
  const sql = `SELECT COUNT(*) AS n FROM ${tabela} ${where}`;
  const r = pred ? um(sql, params) : db.prepare(sql).get(params);
  return (r && r.n) || 0;
}

/** Exclusão lógica quando a tabela suporta; física quando não. */
function remover(tabela, id) {
  if (temColuna(tabela, 'excluido_em')) return atualizar(tabela, id, { excluido_em: nowISO() });
  const pred = predicado(tabela);
  const sql = `DELETE FROM ${tabela} WHERE id = :id${pred ? ` AND ${pred}` : ''}`;
  return pred ? exec(sql, { id }).changes : db.prepare(sql).run({ id }).changes;
}

// SQLite só aceita null/number/string/bigint/Buffer: objeto vira JSON, boolean vira 0/1.
function normalizar(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object' && !Buffer.isBuffer(v)) return j.str(v);
  return v;
}

/**
 * A linha do PRÓPRIO tenant em `tenants`. Essa tabela não tem coluna
 * `tenant_id` (o `id` é o tenant), então o guarda não a cobre — por isso
 * o acesso a ela passa só por aqui e por qPlataforma().
 */
function tenantRow() {
  const t = tenancy.tenantAtual();
  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(t) || null;
}

// ------------------------------------------------------------ auditoria

function auditar({ acao, entidade = '', entidadeId = '', detalhe = '', ip = '', quem = null, tenantId = null }) {
  const ctx = tenancy.atual() || {};
  db.prepare(
    'INSERT INTO audit_logs (id, quando, tenant_id, quem, acao, entidade, entidade_id, detalhe, ip, correlation_id) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(
    novoId(), nowISO(),
    tenantId !== null ? tenantId : (ctx.tenantId || ''),
    quem !== null ? quem : (ctx.userId || ''),
    acao, entidade, entidadeId,
    typeof detalhe === 'string' ? detalhe : j.str(detalhe),
    ip, ctx.correlationId || ''
  );
}

const auditoria = {
  listar: (n = 200) => db.prepare('SELECT * FROM audit_logs ORDER BY quando DESC LIMIT ?').all(Math.min(Number(n) || 200, 500)),
  doTenant: (n = 200) => q('SELECT * FROM audit_logs WHERE tenant_id = :tenant ORDER BY quando DESC LIMIT :limite', { limite: Math.min(Number(n) || 200, 500) }),
};

module.exports = {
  q, um, exec, qPlataforma, execPlataforma,
  inserir, atualizar, buscar, listar, contar, remover, semearGlobal, atualizarGlobal, inserirPlataforma,
  tenantRow, auditar, auditoria, tabelasCitadas, verificarSql, predicado, precisaTenant,
};
