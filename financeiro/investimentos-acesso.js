// =====================================================================
// Villela Finance — portão da inteligência de investimentos do CEO.
//
// A fundação nasce fechada em quatro camadas: flag de ambiente, conta
// interna, módulo Enterprise privado e concessão nominal ao proprietário.
// Ela não executa ordem, lance, recomendação nem lançamento contábil.
// =====================================================================
'use strict';
const { j } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');
const entitlements = require('./entitlements');
const auditoria = require('./auditoria');

class ErroDeAcessoInvestimentos extends Error {
  constructor(msg, status = 403, detalhe = null) {
    super(msg);
    this.name = 'ErroDeAcessoInvestimentos';
    this.status = status;
    this.detalhe = detalhe;
  }
}

const ligado = () => String(process.env.FINANCE_INVESTIMENTOS || '').toLowerCase() === 'on';

function estado(tenant, usuario) {
  const flag = ligado();
  const interna = !!tenant && tenant.interno === 1;
  const modulo = !!tenant && entitlements.temModulo(tenant, 'investimentos_ceo');
  const proprietario = !!usuario && usuario.perfil === 'proprietario';
  const acesso = usuario && interna ? repo.acessoInvestimentosPorUsuario(usuario.id) : null;
  const autorizado = !!acesso && acesso.ativo === 1;
  let motivo = '';
  if (!flag) motivo = 'feature_desligada';
  else if (!interna) motivo = 'conta_nao_interna';
  else if (!modulo) motivo = 'modulo_indisponivel';
  else if (!proprietario) motivo = 'perfil_nao_autorizado';
  else if (!autorizado) motivo = 'acesso_nao_concedido';
  return {
    disponivel: flag && interna && modulo && proprietario && autorizado,
    ligado: flag,
    autorizado,
    fase: 'fundacao',
    recomendacoesAtivas: false,
    execucaoAtiva: false,
    motivo,
  };
}

function exigir(tenant, usuario) {
  const e = estado(tenant, usuario);
  if (!e.ligado) throw new ErroDeAcessoInvestimentos('Módulo não disponível.', 404);
  if (!e.disponivel) {
    throw new ErroDeAcessoInvestimentos('Acesso exclusivo do CEO não autorizado para este usuário.', 403, { motivo: e.motivo });
  }
  return e;
}

function exigirContaInterna(tenant) {
  if (!tenant || tenant.interno !== 1) {
    throw new ErroDeAcessoInvestimentos('A inteligência do CEO só pode ser ativada na conta interna do Grupo Villela.');
  }
  if (!entitlements.temModulo(tenant, 'investimentos_ceo')) {
    throw new ErroDeAcessoInvestimentos('A conta interna precisa do módulo privado Enterprise.');
  }
  if (!tenancy.mfaVerificado()) {
    throw new ErroDeAcessoInvestimentos('Confirme a ação com o segundo fator do usuário.', 403, { motivo: 'mfa_obrigatorio' });
  }
}

function conceder(tenant, usuarioId, motivo) {
  exigirContaInterna(tenant);
  const justificativa = String(motivo || '').trim();
  if (!justificativa) throw new ErroDeAcessoInvestimentos('Informe o motivo da concessão.', 400);
  const usuario = repo.usuarioPorId(usuarioId);
  if (!usuario || usuario.status !== 'ativo') throw new ErroDeAcessoInvestimentos('Usuário ativo não encontrado.', 404);
  if (usuario.perfil !== 'proprietario') {
    throw new ErroDeAcessoInvestimentos('O acesso privado só pode ser concedido a um proprietário da conta.');
  }
  const acesso = repo.concederAcessoInvestimentos(usuarioId);
  repo.garantirConfigInvestimentos();
  repo.garantirMandatosInvestimentos();
  auditoria.registrar('investimento.acesso_conceder', {
    objetoTipo: 'usuario', objetoId: usuarioId, motivo: justificativa,
    detalhe: { papel: 'ceo', fase: 'fundacao' },
  });
  return acesso;
}

function revogar(tenant, usuarioId, motivo) {
  exigirContaInterna(tenant);
  const justificativa = String(motivo || '').trim();
  if (!justificativa) throw new ErroDeAcessoInvestimentos('Informe o motivo da revogação.', 400);
  const acesso = repo.revogarAcessoInvestimentos(usuarioId);
  auditoria.registrar('investimento.acesso_revogar', {
    objetoTipo: 'usuario', objetoId: usuarioId, motivo: justificativa,
    detalhe: { papel: 'ceo' },
  });
  return acesso;
}

function mandatos(tenant, usuario) {
  exigir(tenant, usuario);
  return repo.listarMandatosInvestimentos().map(m => ({
    id: m.id,
    chave: m.chave,
    nome: m.nome,
    horizonteDias: m.horizonte_dias,
    liquidezMinimaCents: m.liquidez_minima_cents,
    perdaMaximaPpm: m.perda_maxima_ppm,
    limites: j.parse(m.limites, {}),
    benchmarks: j.parse(m.benchmarks, []),
    versao: m.versao,
  }));
}

function resumo(tenant, usuario) {
  const lista = mandatos(tenant, usuario);
  const configuracao = repo.configInvestimentos();
  return {
    fase: 'fundacao',
    escopo: 'uso interno e exclusivo do CEO',
    configuracaoCompleta: lista.length === 3 && lista.every(m => !m.limites.configuracaoPendente),
    mandatos: lista,
    salvaguardas: {
      recomendacoesIndividualizadas: false,
      ordens: false,
      lances: false,
      escritaNoRazao: false,
    },
    agenda: configuracao ? {
      timezone: configuracao.timezone,
      radarHora: configuracao.radar_hora,
      relatorioDiaSemana: configuracao.relatorio_dia_semana,
      relatorioHora: configuracao.relatorio_hora,
    } : null,
    proximoPasso: 'Definir limites de risco e validar juridicamente as funções analíticas antes de ativá-las.',
  };
}

module.exports = {
  ErroDeAcessoInvestimentos, ligado, estado, exigir, conceder, revogar, mandatos, resumo,
};
