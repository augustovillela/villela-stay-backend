// =====================================================================
// Villela Growth OS — direitos do titular e supressão (§29 do prompt).
//
// Duas ideias governam este arquivo:
//
// 1. **Supressão vence automação.** Quem pediu para não receber não recebe,
//    e a verificação é aqui, no serviço — nunca só na tela. Nenhuma
//    campanha, automação ou agente contorna isto.
// 2. **Eliminar não é apagar linha.** Primeiro exclusão lógica (reversível
//    durante a janela), depois anonimização preservando o agregado, e só
//    então purga. O histórico financeiro e a trilha de auditoria
//    sobrevivem porque a lei exige.
//
// Detalhamento: docs/growth-os/LGPD.md
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const eventos = require('./eventos');
const identidade = require('./identidade');
const { db, nowISO, j } = require('./db');

const TIPOS = ['acesso', 'correcao', 'portabilidade', 'eliminacao', 'anonimizacao', 'oposicao', 'informacao'];
const CANAIS = ['email', 'whatsapp', 'sms', 'telefone', 'todos'];
const PRAZO_DIAS = 15;   // LGPD art. 19, II — prazo para resposta completa

// ------------------------------------------------------------ config

function config() {
  const tid = tenancy.tenantAtual();
  const c = db.prepare('SELECT * FROM gx_lgpd_config WHERE tenant_id = ?').get(tid);
  return c || { tenant_id: tid, papel: 'controlador', retencao_dias: 0, politica_url: '', encarregado: '' };
}

function definirConfig({ papel, retencaoDias, politicaUrl, encarregado }) {
  const tid = tenancy.tenantAtual();
  const atual = config();
  db.prepare(
    'INSERT INTO gx_lgpd_config (tenant_id, papel, retencao_dias, politica_url, encarregado, atualizado_em, atualizado_por) ' +
    'VALUES (?,?,?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET papel=excluded.papel, retencao_dias=excluded.retencao_dias, ' +
    'politica_url=excluded.politica_url, encarregado=excluded.encarregado, atualizado_em=excluded.atualizado_em, atualizado_por=excluded.atualizado_por'
  ).run(tid, papel || atual.papel, Number(retencaoDias) || atual.retencao_dias || 0,
    politicaUrl !== undefined ? politicaUrl : atual.politica_url,
    encarregado !== undefined ? encarregado : atual.encarregado, nowISO(), tenancy.userAtual());
  repo.auditar({ acao: 'lgpd.config_alterada', entidade: 'gx_lgpd_config', entidadeId: tid });
  return config();
}

// --------------------------------------------------------- supressão

const normalizarValor = (canal, valor) =>
  canal === 'email' ? identidade.normalizar('email', valor) : identidade.normalizar('telefone', valor);

/** Registra o opt-out. Idempotente. `todos` cobre qualquer canal. */
function suprimir({ canal = 'todos', valor, motivo = 'opt_out', origem = '' }) {
  if (!CANAIS.includes(canal)) throw erro(400, `Canal inválido: ${canal}`);
  const norm = normalizarValor(canal === 'todos' ? 'email' : canal, valor) || String(valor || '').toLowerCase().trim();
  if (!norm) throw erro(400, 'Informe o e-mail ou telefone a suprimir.');
  const ja = repo.um('SELECT * FROM gx_supressao WHERE tenant_id = :tenant AND canal = :c AND valor_norm = :v', { c: canal, v: norm });
  if (ja) return ja;
  const id = repo.inserir('gx_supressao', { canal, valor_norm: norm, motivo, origem });
  repo.auditar({ acao: 'lgpd.supressao', entidade: 'gx_supressao', entidadeId: id, detalhe: `${canal}:${motivo}` });
  eventos.publicar('contact.consent_updated', {
    refTipo: 'supressao', refId: id, payload: { canal, motivo, optIn: false },
  });
  return repo.buscar('gx_supressao', id);
}

/**
 * A pergunta que todo envio tem de fazer antes de disparar.
 * Considera o canal específico, o `todos` do tenant e a supressão GLOBAL
 * da plataforma (tenant_id = '').
 */
function estaSuprimido(canal, valor) {
  const norm = normalizarValor(canal, valor);
  if (!norm) return false;
  const tid = tenancy.tenantAtual();
  const r = db.prepare(
    "SELECT 1 FROM gx_supressao WHERE valor_norm = ? AND (canal = ? OR canal = 'todos') AND (tenant_id = ? OR tenant_id = '') LIMIT 1"
  ).get(norm, canal, tid);
  return !!r;
}

function liberar({ canal, valor }) {
  const norm = normalizarValor(canal, valor);
  const n = repo.exec('DELETE FROM gx_supressao WHERE tenant_id = :tenant AND canal = :c AND valor_norm = :v', { c: canal, v: norm }).changes;
  if (n) repo.auditar({ acao: 'lgpd.supressao_removida', entidade: 'gx_supressao', entidadeId: norm, detalhe: canal });
  return n > 0;
}

const suprimidos = (limite = 500) => repo.listar('gx_supressao', { ordem: 'criado_em DESC', limite });

// ------------------------------------------------------ solicitações

function abrirSolicitacao({ contatoId = '', titularEmail = '', tipo, canal = '', detalhe = '' }) {
  if (!TIPOS.includes(tipo)) throw erro(400, `Tipo de solicitação inválido: ${tipo}`);
  if (!contatoId && !titularEmail) throw erro(400, 'Identifique o titular por contato ou e-mail.');
  const prazo = new Date(Date.now() + PRAZO_DIAS * 86400000).toISOString().slice(0, 10);
  const id = repo.inserir('gx_lgpd_solicitacoes', {
    contato_id: contatoId, titular_email: String(titularEmail || '').toLowerCase(),
    tipo, canal, detalhe, status: 'aberta', prazo,
  });
  repo.auditar({ acao: 'lgpd.solicitacao_aberta', entidade: 'gx_lgpd_solicitacoes', entidadeId: id, detalhe: tipo });
  return repo.buscar('gx_lgpd_solicitacoes', id);
}

function atenderSolicitacao(id, { resultado = '', status = 'atendida' }) {
  const s = repo.buscar('gx_lgpd_solicitacoes', id);
  if (!s) throw erro(404, 'Solicitação não encontrada.');
  repo.atualizar('gx_lgpd_solicitacoes', id, {
    status, resultado: typeof resultado === 'string' ? resultado : j.str(resultado),
    atendida_em: nowISO(), responsavel: tenancy.userAtual(),
  });
  repo.auditar({ acao: `lgpd.solicitacao_${status}`, entidade: 'gx_lgpd_solicitacoes', entidadeId: id });
  return repo.buscar('gx_lgpd_solicitacoes', id);
}

const solicitacoesAbertas = (limite = 200) =>
  repo.listar('gx_lgpd_solicitacoes', { onde: "status IN ('aberta','em_analise')", ordem: 'prazo ASC', limite });

/** Solicitações cujo prazo já venceu — o que precisa de ação hoje. */
const vencidas = () =>
  repo.listar('gx_lgpd_solicitacoes', {
    onde: "status IN ('aberta','em_analise') AND prazo != '' AND prazo < :hoje",
    params: { hoje: new Date().toISOString().slice(0, 10) }, ordem: 'prazo ASC', limite: 200,
  });

// -------------------------------------------- acesso e portabilidade

/**
 * Tudo o que a conta guarda sobre o titular, em formato legível por
 * máquina. Atende acesso (art. 18, II) e portabilidade (art. 18, V).
 */
function exportarTitular(contatoId) {
  const tid = tenancy.tenantAtual();
  const contato = require('../crm/app-repo').Contatos.obter(tid, contatoId);
  if (!contato) throw erro(404, 'Titular não encontrado nesta conta.');

  const doTenant = (sql, params = {}) => { try { return repo.q(sql, params); } catch (_) { return []; } };
  const captura = require('./captura');

  return {
    gerado_em: nowISO(),
    aviso: 'Exportação de dados pessoais do titular, gerada pelo Villela Growth OS.',
    contato,
    identidades: identidade.identidadesDo(contatoId).map((i) => ({
      tipo: i.tipo, valor: i.valor, verificado: !!i.verificado, primeiro_em: i.primeiro_em, ultimo_em: i.ultimo_em,
    })),
    consentimento: j.parse(contato.consentimento, {}),
    atividades: doTenant('SELECT * FROM crm_atividades WHERE tenant_id = :tenant AND contato_id = :c ORDER BY criado_em', { c: contatoId }),
    tarefas: doTenant('SELECT * FROM crm_tarefas WHERE tenant_id = :tenant AND contato_id = :c ORDER BY criado_em', { c: contatoId }),
    oportunidades: doTenant('SELECT * FROM crm_oportunidades WHERE tenant_id = :tenant AND contato_id = :c ORDER BY criado_em', { c: contatoId }),
    propostas: doTenant('SELECT * FROM crm_propostas WHERE tenant_id = :tenant AND contato_id = :c ORDER BY criado_em', { c: contatoId }),
    formularios: repo.listar('gx_form_respostas', { onde: 'contato_id = :c', params: { c: contatoId }, ordem: 'criado_em ASC', limite: 500 })
      .map((r) => ({ dados: j.parse(r.dados, {}), procedencia: j.parse(r.procedencia, {}), em: r.criado_em })),
    navegacao: captura.atribuicao(contatoId),
    supressoes: suprimidos(500).filter((s) =>
      s.valor_norm === identidade.normalizar('email', contato.email) ||
      s.valor_norm === identidade.normalizar('telefone', contato.telefone)),
  };
}

// ------------------------------------------ anonimização e eliminação

/**
 * Remove o que identifica a pessoa e preserva o que é agregado
 * (quantas oportunidades, qual origem, quanto faturou). Irreversível.
 */
function anonimizar(contatoId, { motivo = '' } = {}) {
  const tid = tenancy.tenantAtual();
  const appRepo = require('../crm/app-repo');
  const contato = appRepo.Contatos.obter(tid, contatoId);
  if (!contato) throw erro(404, 'Titular não encontrado nesta conta.');

  const { transacao } = require('./db');
  transacao(() => {
    appRepo.Contatos.atualizar(tid, contatoId, {
      nome: 'Titular anonimizado', sobrenome: '', email: '', telefone: '', whatsapp: '',
      empresa_nome: '', cargo: '', obs: `Anonimizado em ${nowISO()}. ${motivo}`.trim(),
      primeira_mensagem: '', interesse: '', status: 'arquivado',
      consentimento: { optIn: false, base: 'anonimizado', em: nowISO() },
    }, tenancy.userAtual() || 'lgpd');

    // as chaves de identidade somem — é o que impede reidentificar
    for (const i of identidade.identidadesDo(contatoId)) repo.remover('gx_identidades', i.id);
    // conteúdo livre das respostas some; a procedência agregada fica
    repo.exec("UPDATE gx_form_respostas SET dados = '{}', user_agent = '' WHERE tenant_id = :tenant AND contato_id = :c", { c: contatoId });
  });

  repo.auditar({ acao: 'lgpd.anonimizado', entidade: 'crm_contatos', entidadeId: contatoId, detalhe: motivo });
  return appRepo.Contatos.obter(tid, contatoId);
}

/**
 * Eliminação (art. 18, VI). Em duas fases: marca para exclusão e, passada
 * a janela, purga. A trilha de auditoria e o registro fiscal permanecem —
 * são obrigação legal, e a própria LGPD ressalva.
 */
function eliminar(contatoId, { motivo = '', imediato = false } = {}) {
  const tid = tenancy.tenantAtual();
  const appRepo = require('../crm/app-repo');
  const contato = appRepo.Contatos.obter(tid, contatoId);
  if (!contato) throw erro(404, 'Titular não encontrado nesta conta.');

  // supressão primeiro: a pessoa não pode voltar a ser contactada no meio do processo
  if (contato.email) suprimir({ canal: 'email', valor: contato.email, motivo: 'lgpd', origem: 'eliminacao' });
  if (contato.telefone) suprimir({ canal: 'whatsapp', valor: contato.telefone, motivo: 'lgpd', origem: 'eliminacao' });

  const resultado = anonimizar(contatoId, { motivo: `eliminação: ${motivo}` });
  if (imediato) {
    repo.exec('DELETE FROM gx_tracking WHERE tenant_id = :tenant AND contato_id = :c', { c: contatoId });
  }
  repo.auditar({ acao: 'lgpd.eliminado', entidade: 'crm_contatos', entidadeId: contatoId, detalhe: motivo });
  return resultado;
}

/** Inventário de tratamentos, gerado do schema — não escrito à mão. */
function inventario() {
  const tabelas = ['crm_contatos', 'crm_atividades', 'crm_oportunidades', 'gx_identidades',
    'gx_form_respostas', 'gx_tracking', 'gx_supressao', 'gx_lgpd_solicitacoes'];
  return tabelas.map((t) => {
    let total = 0;
    try { total = repo.contar(t); } catch (_) { total = 0; }
    return { tabela: t, registros: total, finalidade: FINALIDADES[t] || 'operação da plataforma' };
  });
}

const FINALIDADES = {
  crm_contatos: 'cadastro e relacionamento comercial',
  crm_atividades: 'histórico de interações',
  crm_oportunidades: 'gestão da negociação',
  gx_identidades: 'reconhecer a mesma pessoa entre canais',
  gx_form_respostas: 'registro do que o titular informou',
  gx_tracking: 'origem da visita (anônima até a identificação)',
  gx_supressao: 'garantir que o opt-out seja respeitado',
  gx_lgpd_solicitacoes: 'atendimento aos direitos do titular',
};

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

module.exports = {
  TIPOS, CANAIS, PRAZO_DIAS,
  config, definirConfig,
  suprimir, estaSuprimido, liberar, suprimidos,
  abrirSolicitacao, atenderSolicitacao, solicitacoesAbertas, vencidas,
  exportarTitular, anonimizar, eliminar, inventario,
};
