// =====================================================================
// Villela Finance — fornecedores e clientes (contrapartes).
//
// Duas coisas que este arquivo existe para impedir:
//
//   1. o MESMO fornecedor cadastrado duas vezes (com e sem pontuação no
//      CNPJ, ou com nome levemente diferente). Fornecedor duplicado
//      espalha o saldo em dois lugares e a conciliação nunca fecha;
//   2. mudança de DADO BANCÁRIO passando despercebida. É o vetor de
//      fraude mais banal que existe: alguém troca a conta do favorecido
//      e o pagamento seguinte vai para outro lugar. Por isso é nível 3 —
//      maker-checker, com o valor antigo e o novo na prévia.
// =====================================================================
'use strict';
const { transacao, nowISO, j } = require('./db');
const repo = require('./repo');
const doc = require('./documento');
const auditoria = require('./auditoria');
const aprovacoes = require('./aprovacoes');
const tenancy = require('./tenancy');

class ErroDeContraparte extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDeContraparte'; this.status = 400; this.detalhe = detalhe || null; }
}

const TIPOS = ['fornecedor', 'cliente', 'ambos', 'socio', 'banco'];

// Formas societárias e conectivos: não distinguem empresa nenhuma, e é
// justamente a diferença entre "Neoenergia S.A." e "Neoenergia Ltda" que
// faz o mesmo fornecedor entrar duas vezes.
const RUIDO_RAZAO_SOCIAL = new Set([
  'ltda', 'ltd', 'me', 'epp', 'eireli', 'sa', 'cia', 'companhia', 'sociedade',
  'comercio', 'servicos', 'do', 'da', 'de', 'dos', 'das', 'e',
]);

/**
 * Reduz a razão social ao que identifica a empresa.
 *
 * Tokeniza ANTES de remover as formas societárias: "S.A." só vira o par
 * ["s","a"] depois que a pontuação some, e uma expressão aplicada ao
 * texto cru não pega esse caso (foi o que deixou "Neoenergia S.A." e
 * "Neoenergia Ltda" passarem como empresas diferentes).
 *
 * Descarta letra solta, mas mantém número: "Casa 4" e "Casa 5" continuam
 * sendo coisas diferentes.
 */
const normalizar = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .split(' ')
  .filter(t => t && !RUIDO_RAZAO_SOCIAL.has(t) && !(t.length === 1 && /[a-z]/.test(t)))
  .join(' ')
  .trim();

/**
 * Procura possível duplicata ANTES de criar. Documento igual é certeza;
 * nome normalizado igual é suspeita — e suspeita se mostra, não se
 * bloqueia (dois "João Silva" diferentes existem).
 */
function procurarDuplicata(entidadeId, { nome, documento }) {
  const d = doc.analisar(documento);
  if (!d.vazio && d.normalizado) {
    const porDoc = repo.q(
      `SELECT * FROM fin_contrapartes WHERE tenant_id = :tenant AND entidade_id = :ent
         AND replace(replace(replace(documento, '.', ''), '-', ''), '/', '') = :doc
         AND status = 'ativo' LIMIT 1`,
      { ent: entidadeId, doc: d.normalizado })[0];
    if (porDoc) return { tipo: 'documento', contraparte: porDoc, certeza: true };
  }
  const alvo = normalizar(nome);
  if (alvo.length >= 4) {
    const semelhante = repo.listarContrapartes(entidadeId).find(c => normalizar(c.nome) === alvo);
    if (semelhante) return { tipo: 'nome', contraparte: semelhante, certeza: false };
  }
  return null;
}

/**
 * Cria uma contraparte. `forcar` só é aceito quando a duplicata é por
 * NOME — documento repetido é sempre a mesma pessoa jurídica.
 */
function criar({ entidadeId, tipo = 'fornecedor', nome, documento = '', email = '', telefone = '', externoId = '', forcar = false }) {
  if (!String(nome || '').trim()) throw new ErroDeContraparte('Informe o nome.');
  if (!TIPOS.includes(tipo)) throw new ErroDeContraparte(`Tipo inválido: ${tipo}. Use ${TIPOS.join(', ')}.`);
  const d = doc.exigir(documento, 'documento');

  const dup = procurarDuplicata(entidadeId, { nome, documento });
  if (dup && (dup.certeza || !forcar)) {
    throw new ErroDeContraparte(
      dup.certeza
        ? `Já existe "${dup.contraparte.nome}" com este ${d.tipo.toUpperCase()}.`
        : `Já existe "${dup.contraparte.nome}" com nome equivalente. Confirme se é outra pessoa.`,
      { duplicata: { id: dup.contraparte.id, nome: dup.contraparte.nome, documento: dup.contraparte.documento }, por: dup.tipo, podeForcar: !dup.certeza });
  }

  return transacao(() => {
    const c = repo.criarContraparte({
      entidadeId, tipo, nome: String(nome).trim().slice(0, 200),
      documento: d.normalizado, email, telefone, externoId,
    });
    auditoria.registrar('contraparte.criar', {
      objetoTipo: 'contraparte', objetoId: c.id,
      detalhe: { nome: c.nome, tipo, documento: d.formatado || '' },
    });
    return c;
  });
}

/** Campos comuns. Dados bancários NÃO passam por aqui — ver abaixo. */
function atualizar(id, campos = {}) {
  const c = repo.contraparte(id);
  if (!c) throw new ErroDeContraparte('Contraparte não encontrada.');
  const permitidos = ['nome', 'email', 'telefone', 'tipo', 'status'];
  const sets = [], params = { id, agora: nowISO() };
  const antes = {};
  for (const [k, v] of Object.entries(campos)) {
    if (!permitidos.includes(k)) continue;
    if (k === 'tipo' && !TIPOS.includes(v)) throw new ErroDeContraparte(`Tipo inválido: ${v}.`);
    antes[k] = c[k];
    sets.push(`${k} = :${k}`); params[k] = String(v).slice(0, 200);
  }
  if (campos.documento !== undefined) {
    const d = doc.exigir(campos.documento, 'documento');
    antes.documento = c.documento;
    sets.push('documento = :documento'); params.documento = d.normalizado;
  }
  if (!sets.length) return c;

  return transacao(() => {
    repo.exec(`UPDATE fin_contrapartes SET ${sets.join(', ')}, atualizado_em = :agora
                WHERE tenant_id = :tenant AND id = :id`, params);
    auditoria.registrar('contraparte.atualizar', {
      objetoTipo: 'contraparte', objetoId: id,
      detalhe: { antes, depois: campos },
    });
    return repo.contraparte(id);
  });
}

/**
 * Alterar dado bancário é NÍVEL 3: vira solicitação com o antes e o
 * depois na prévia, para quem aprova comparar. Nunca executa direto —
 * nem para quem tem alçada, porque a proteção aqui é o segundo par de
 * olhos, não o poder de quem pede.
 */
function solicitarDadosBancarios(id, { banco = '', agencia = '', conta = '', tipoConta = '', chavePix = '', titular = '', documentoTitular = '', motivo }) {
  const c = repo.contraparte(id);
  if (!c) throw new ErroDeContraparte('Contraparte não encontrada.');
  if (!String(motivo || '').trim()) throw new ErroDeContraparte('Mudança de dado bancário exige motivo.');
  if (documentoTitular) doc.exigir(documentoTitular, 'documento do titular');

  const atual = j.parse(c.dados_bancarios, {}) || {};
  const novo = { banco, agencia, conta, tipoConta, chavePix, titular, documentoTitular };
  const mudou = Object.keys(novo).filter(k => String(atual[k] || '') !== String(novo[k] || ''));
  if (!mudou.length) throw new ErroDeContraparte('Os dados bancários informados são iguais aos atuais.');

  return aprovacoes.solicitar({
    acao: 'contraparte.dados_bancarios',
    entidadeId: c.entidade_id,
    objetoTipo: 'contraparte', objetoId: id,
    payload: { contraparteId: id, dados: novo },
    // A prévia mostra os dois lados campo a campo: é o que permite ao
    // aprovador ver que a conta mudou, não só que "houve alteração".
    previa: {
      contraparte: c.nome,
      documento: doc.analisar(c.documento).formatado,
      camposAlterados: mudou,
      antes: mascarar(atual),
      depois: mascarar(novo),
      primeiroCadastro: !Object.keys(atual).length,
    },
    motivo,
  });
}

/** Executado só depois de aprovado (registrado em index.js). */
function aplicarDadosBancarios({ contraparteId, dados }) {
  const c = repo.contraparte(contraparteId);
  if (!c) throw new ErroDeContraparte('Contraparte não encontrada.');
  return transacao(() => {
    repo.exec(`UPDATE fin_contrapartes SET dados_bancarios = :dados, atualizado_em = :agora
                WHERE tenant_id = :tenant AND id = :id`,
      { id: contraparteId, dados: j.str(dados), agora: nowISO() });
    auditoria.registrar('contraparte.dados_bancarios', {
      objetoTipo: 'contraparte', objetoId: contraparteId,
      motivo: 'alteração aprovada',
      // O log guarda o MASCARADO: auditoria não é lugar de conta bancária
      // em claro, e quem precisa do valor real consulta o cadastro.
      detalhe: { contraparte: c.nome, dados: mascarar(dados) },
    });
    return { contraparteId, aplicado: true };
  });
}

/** Só os últimos dígitos — o resto não precisa aparecer em tela nem log. */
function mascarar(d = {}) {
  const fim = (v) => { const s = String(v || ''); return s ? '•••' + s.slice(-3) : ''; };
  return {
    banco: d.banco || '', agencia: d.agencia || '', tipoConta: d.tipoConta || '',
    conta: fim(d.conta), chavePix: fim(d.chavePix),
    titular: d.titular || '', documentoTitular: fim(d.documentoTitular),
  };
}

const listar = (entidadeId, tipo = '') => repo.listarContrapartes(entidadeId, tipo).map(c => ({
  id: c.id, tipo: c.tipo, nome: c.nome,
  documento: doc.analisar(c.documento).formatado,
  email: c.email, telefone: c.telefone, externoId: c.externo_id, status: c.status,
  dadosBancarios: mascarar(j.parse(c.dados_bancarios, {})),
  temDadosBancarios: Object.keys(j.parse(c.dados_bancarios, {}) || {}).length > 0,
}));

const buscar = (id) => {
  const c = repo.contraparte(id);
  if (!c) return null;
  return Object.assign({}, c, {
    documentoFormatado: doc.analisar(c.documento).formatado,
    dados_bancarios: mascarar(j.parse(c.dados_bancarios, {})),
  });
};

module.exports = {
  ErroDeContraparte, TIPOS, criar, atualizar, listar, buscar,
  procurarDuplicata, solicitarDadosBancarios, aplicarDadosBancarios, mascarar, normalizar,
};
