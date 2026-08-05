// =====================================================================
// Villela Growth OS — segmentos (§6.1 do PROMPT_MASTER).
//
// Regra de segmento é DADO, não código: fica em JSON, é auditável e o
// usuário consegue ler o porquê de alguém estar dentro. Nada de SQL vindo
// da interface — campo e operador saem de lista fechada, e o valor vai
// sempre por parâmetro.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const entitlements = require('./entitlements');
const { nowISO, j } = require('./db');

// Campo → como consultar. Só o que está aqui pode ser usado numa regra.
const CAMPOS = {
  tipo: { col: 'tipo', rotulo: 'Tipo de contato' },
  origem: { col: 'origem', rotulo: 'Origem' },
  cidade: { col: 'cidade', rotulo: 'Cidade' },
  estado: { col: 'estado', rotulo: 'Estado' },
  responsavel: { col: 'responsavel', rotulo: 'Responsável' },
  empresa: { col: 'empresa_nome', rotulo: 'Empresa' },
  interesse: { col: 'interesse', rotulo: 'Interesse' },
  produto: { col: 'produto_interesse', rotulo: 'Produto de interesse' },
  campanha: { col: 'campanha', rotulo: 'Campanha' },
  score: { col: 'score', rotulo: 'Score', numerico: true },
  orcamento: { col: 'orcamento_centavos', rotulo: 'Orçamento (centavos)', numerico: true },
  tags: { col: 'tags', rotulo: 'Tags', lista: true },
  email: { col: 'email', rotulo: 'E-mail' },
  telefone: { col: 'telefone', rotulo: 'Telefone' },
  criado_em: { col: 'criado_em', rotulo: 'Data de cadastro', data: true },
  ultima_interacao: { col: 'ultima_interacao', rotulo: 'Última interação', data: true },
};

const OPERADORES = {
  igual: { rotulo: 'é igual a', sql: (c) => `${c} = :v` },
  diferente: { rotulo: 'é diferente de', sql: (c) => `${c} != :v` },
  contem: { rotulo: 'contém', sql: (c) => `${c} LIKE :v`, curinga: true },
  nao_contem: { rotulo: 'não contém', sql: (c) => `${c} NOT LIKE :v`, curinga: true },
  comeca: { rotulo: 'começa com', sql: (c) => `${c} LIKE :v`, curingaFim: true },
  maior: { rotulo: 'é maior que', sql: (c) => `${c} > :v` },
  menor: { rotulo: 'é menor que', sql: (c) => `${c} < :v` },
  preenchido: { rotulo: 'está preenchido', sql: (c) => `${c} != ''`, semValor: true },
  vazio: { rotulo: 'está vazio', sql: (c) => `${c} = ''`, semValor: true },
  ha_mais_de: { rotulo: 'há mais de (dias)', sql: (c) => `(${c} = '' OR ${c} < :v)`, dias: true },
  ha_menos_de: { rotulo: 'há menos de (dias)', sql: (c) => `(${c} != '' AND ${c} >= :v)`, dias: true },
};

/**
 * Traduz as regras para SQL. Devolve {where, params, descricao}.
 * `descricao` é a regra em português — é o que torna o segmento auditável.
 */
function compilar(regras = {}) {
  const juncao = regras.juncao === 'qualquer' ? 'OR' : 'AND';
  const condicoes = Array.isArray(regras.condicoes) ? regras.condicoes : [];
  const partes = [];
  const params = {};
  const descricao = [];

  condicoes.forEach((cond, i) => {
    const campo = CAMPOS[cond.campo];
    const op = OPERADORES[cond.operador];
    if (!campo || !op) return;                       // silenciosamente ignora regra inválida
    const chave = `s${i}`;
    const col = campo.col;
    let sql = op.sql(col).replace(':v', ':' + chave);

    if (!op.semValor) {
      let valor = cond.valor;
      if (op.dias) {
        const d = Number(valor) || 0;
        valor = new Date(Date.now() - d * 86400000).toISOString();
      } else if (campo.numerico) {
        valor = Number(valor) || 0;
      } else if (campo.lista) {
        valor = `%"${String(valor)}"%`;
        sql = `${col} LIKE :${chave}`;
      } else if (op.curinga) {
        valor = `%${String(valor)}%`;
      } else if (op.curingaFim) {
        valor = `${String(valor)}%`;
      } else {
        valor = String(valor);
      }
      params[chave] = valor;
    }
    partes.push(`(${sql})`);
    descricao.push(`${campo.rotulo} ${op.rotulo}${op.semValor ? '' : ' ' + cond.valor}`);
  });

  return {
    where: partes.length ? partes.join(` ${juncao} `) : '1=1',
    params,
    descricao: descricao.length ? descricao.join(juncao === 'AND' ? ' e ' : ' ou ') : 'todos os contatos',
  };
}

function criar({ nome, descricao = '', regras = {} }) {
  if (!nome) throw erro(400, 'O segmento precisa de um nome.');
  entitlements.exigirDentroDoLimite('segmentos', repo.contar('gx_segmentos'));
  compilar(regras);                                  // valida antes de gravar
  const id = repo.inserir('gx_segmentos', { nome, descricao, regras: j.str(regras), dinamico: 1 });
  repo.auditar({ acao: 'segmento.criado', entidade: 'gx_segmentos', entidadeId: id, detalhe: nome });
  return repo.buscar('gx_segmentos', id);
}

function atualizar(id, { nome, descricao, regras }) {
  const s = repo.buscar('gx_segmentos', id);
  if (!s) throw erro(404, 'Segmento não encontrado.');
  const patch = {};
  if (nome) patch.nome = nome;
  if (descricao !== undefined) patch.descricao = descricao;
  if (regras) { compilar(regras); patch.regras = j.str(regras); }
  repo.atualizar('gx_segmentos', id, patch);
  return repo.buscar('gx_segmentos', id);
}

/** Contatos do segmento. `excluirSuprimidos` tira quem pediu para não receber. */
function contatos(id, { limite = 500, excluirSuprimidos = false } = {}) {
  const seg = repo.buscar('gx_segmentos', id);
  if (!seg) throw erro(404, 'Segmento não encontrado.');
  const c = compilar(j.parse(seg.regras, {}));
  const lista = repo.q(
    `SELECT * FROM crm_contatos WHERE tenant_id = :tenant AND status = 'ativo' AND (${c.where}) ` +
    'ORDER BY atualizado_em DESC LIMIT :limite',
    Object.assign({}, c.params, { limite: Math.min(Number(limite) || 500, 2000) })
  );
  if (!excluirSuprimidos) return lista;
  const lgpd = require('./lgpd');
  return lista.filter((ct) => !lgpd.estaSuprimido('email', ct.email) && !lgpd.estaSuprimido('whatsapp', ct.telefone));
}

function contar(id) {
  const seg = repo.buscar('gx_segmentos', id);
  if (!seg) throw erro(404, 'Segmento não encontrado.');
  const c = compilar(j.parse(seg.regras, {}));
  const r = repo.um(
    `SELECT COUNT(*) AS n FROM crm_contatos WHERE tenant_id = :tenant AND status = 'ativo' AND (${c.where})`,
    c.params
  );
  const n = (r && r.n) || 0;
  repo.atualizar('gx_segmentos', id, { ultima_contagem: n, ultima_avaliacao: nowISO() });
  return n;
}

/** Lista com a regra em português e a contagem — é o que a tela mostra. */
function listar(limite = 200) {
  return repo.listar('gx_segmentos', { ordem: 'nome ASC', limite }).map((s) => {
    const c = compilar(j.parse(s.regras, {}));
    return Object.assign({}, s, { regra_legivel: c.descricao, total: contar(s.id) });
  });
}

const remover = (id) => repo.remover('gx_segmentos', id);

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = { CAMPOS, OPERADORES, compilar, criar, atualizar, listar, contatos, contar, remover };
