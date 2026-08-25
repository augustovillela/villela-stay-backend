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

/**
 * ANONIMIZAÇÃO (LGPD art. 18, V) — a resposta possível a um pedido de
 * eliminação quando o dado está preso numa obrigação de escrituração.
 *
 * O que sai: nome, documento, e-mail, telefone, dados bancários, e o nome
 * repetido em título, memo de lote, memo de linha e transação bancária.
 * O que FICA: valor, data, conta e centro de custo — a substância
 * contábil, que o art. 16, I manda preservar.
 *
 * Duas sutilezas que decidem se isto é anonimização de verdade:
 *
 *   1. A AUDITORIA NÃO REGISTRA O NOME ANTIGO. O log é append-only e
 *      imutável: escrever ali o nome que se está apagando o preservaria
 *      para sempre — seria o oposto de anonimizar. Registra-se o id, o
 *      motivo e QUANTOS campos foram limpos.
 *   2. A operação devolve o que NÃO conseguiu limpar. Anonimização que se
 *      declara completa sem ser é pior do que anonimização parcial
 *      declarada.
 *
 * É ação de nível 3: irreversível e afeta histórico.
 */
function anonimizar(id, { motivo }) {
  if (!String(motivo || '').trim()) throw new ErroDeContraparte('Anonimizar exige motivo — vai para a auditoria.');
  const c = repo.contraparte(id);
  if (!c) throw new ErroDeContraparte('Contraparte não encontrada.');
  if (c.anonimizado_em) throw new ErroDeContraparte('Esta contraparte já foi anonimizada.');

  const apelido = `Titular anonimizado ${String(id).slice(-6)}`;
  const nomeAntigo = c.nome;
  const limpos = [];

  return transacao(() => {
    repo.exec(
      `UPDATE fin_contrapartes SET nome = :apelido, documento = '', email = '', telefone = '',
         dados_bancarios = '{}', externo_id = '', anonimizado_em = :agora, atualizado_em = :agora
        WHERE tenant_id = :tenant AND id = :id`,
      { id, apelido, agora: nowISO() });
    limpos.push('cadastro');

    // O nome também mora, repetido, no texto de outros registros. Trocar
    // só o cadastro deixaria a pessoa identificável no histórico.
    const troca = (sql, params) => {
      const r = repo.exec(sql, Object.assign({ id, apelido, nome: nomeAntigo }, params));
      return (r && r.changes) || 0;
    };
    const emTitulos = troca(
      `UPDATE fin_titulos SET descricao = replace(descricao, :nome, :apelido)
        WHERE tenant_id = :tenant AND contraparte_id = :id AND instr(descricao, :nome) > 0`);
    const emLotes = troca(
      `UPDATE fin_lotes SET memo = replace(memo, :nome, :apelido)
        WHERE tenant_id = :tenant AND instr(memo, :nome) > 0
          AND id IN (SELECT lote_id FROM fin_linhas WHERE tenant_id = :tenant AND contraparte_id = :id)`);
    // Atenção ao alcance: só a linha do subledger carrega `contraparte_id`.
    // A linha de despesa do mesmo lote não carrega — e é justamente nela
    // que o nome costuma aparecer no histórico. O critério certo é "linha
    // de um lote que envolve esta contraparte", não "linha desta contraparte".
    const emLinhas = troca(
      `UPDATE fin_linhas SET memo = replace(memo, :nome, :apelido)
        WHERE tenant_id = :tenant AND instr(memo, :nome) > 0
          AND lote_id IN (SELECT lote_id FROM fin_linhas
                           WHERE tenant_id = :tenant AND contraparte_id = :id)`);
    const emTransacoes = troca(
      `UPDATE fin_transacoes_banco SET contraparte_nome = :apelido, bruto = '{}'
        WHERE tenant_id = :tenant AND contraparte_nome = :nome`);

    if (emTitulos) limpos.push(`${emTitulos} título(s)`);
    if (emLotes) limpos.push(`${emLotes} histórico(s) de lote`);
    if (emLinhas) limpos.push(`${emLinhas} histórico(s) de linha`);
    if (emTransacoes) limpos.push(`${emTransacoes} transação(ões) de extrato`);

    // O que NÃO dá para limpar, dito em voz alta.
    const restante = [];
    const noDiario = 'O diário replicado (arquivos JSONL e cópia no R2) é append-only por natureza: ' +
      'o nome antigo permanece nos registros já gravados e nas cópias de backup até o fim da retenção.';
    restante.push(noDiario);
    const emAuditoriaAntiga = repo.q(
      `SELECT COUNT(*) AS n FROM audit_logs WHERE tenant_id = :tenant AND instr(detalhe, :nome) > 0`,
      { nome: nomeAntigo })[0].n;
    if (emAuditoriaAntiga) {
      restante.push(`${emAuditoriaAntiga} registro(s) de auditoria anteriores citam o nome. ` +
        'A trilha é imutável por trigger e por cadeia de hash: apagá-la destruiria a prova contábil.');
    }

    auditoria.registrar('contraparte.anonimizar', {
      objetoTipo: 'contraparte', objetoId: id, motivo,
      // NUNCA o nome antigo: o log é imutável e o preservaria para sempre.
      detalhe: { camposLimpos: limpos, naoLimpos: restante.length, apelido },
    });

    return {
      contraparteId: id, apelido,
      limpos,
      naoLimpos: restante,
      completa: false,
      aviso: 'Anonimização PARCIAL por desenho: o valor, a data e a conta dos lançamentos são ' +
        'preservados por obrigação de escrituração (LGPD art. 16, I). Os pontos acima também não ' +
        'foram limpos — informe o titular do que permanece e por quê.',
    };
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

/**
 * Marca (ou desmarca) a contraparte como sendo OUTRA EMPRESA desta conta.
 * É o que autoriza o consolidado a eliminar a operação — e é explícito de
 * propósito: adivinhar por nome ou CNPJ apagaria operação com terceiro
 * homônimo, e receita sumida por engano é pior que consolidado sem
 * eliminação.
 */
function marcarDoGrupo(contraparteId, entidadeGrupoId) {
  const cp = repo.contraparte(contraparteId);
  if (!cp) throw new ErroDeContraparte('Contraparte não encontrada.');
  const alvo = String(entidadeGrupoId || '');
  if (alvo) {
    const e = repo.entidadePorId(alvo);
    if (!e) throw new ErroDeContraparte('Empresa do grupo não encontrada nesta conta.');
    if (alvo === cp.entidade_id) {
      throw new ErroDeContraparte('A contraparte não pode apontar para a própria empresa dela.');
    }
  }
  repo.marcarContraparteDoGrupo(contraparteId, alvo);
  auditoria.registrar('contraparte.grupo', {
    objetoTipo: 'contraparte', objetoId: contraparteId,
    motivo: alvo ? 'marcada como empresa do grupo' : 'desmarcada como empresa do grupo',
    detalhe: { entidadeGrupoId: alvo },
  });
  return repo.contraparte(contraparteId);
}

module.exports = {
  marcarDoGrupo,
  ErroDeContraparte, TIPOS, criar, atualizar, listar, buscar,
  procurarDuplicata, solicitarDadosBancarios, aplicarDadosBancarios, anonimizar, mascarar, normalizar,
};
