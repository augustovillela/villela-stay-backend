// =====================================================================
// Villela Finance — portão da inteligência de investimentos do CEO.
//
// A fundação nasce fechada em quatro camadas: flag de ambiente, conta
// interna, módulo Enterprise privado e concessão nominal ao proprietário.
// Ela não executa ordem, lance, alavancagem nem lançamento contábil.
// Pareceres privados do CEO têm um portão próprio, independente da flag
// geral, e só abrem depois do registro da validação jurídica.
// =====================================================================
'use strict';
const { j } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');
const entitlements = require('./entitlements');
const auditoria = require('./auditoria');
const politica = require('./investimentos-politica');
const catalogo = require('./investimentos-catalogo');

class ErroDeAcessoInvestimentos extends Error {
  constructor(msg, status = 403, detalhe = null) {
    super(msg);
    this.name = 'ErroDeAcessoInvestimentos';
    this.status = status;
    this.detalhe = detalhe;
  }
}

const ligado = () => String(process.env.FINANCE_INVESTIMENTOS || '').toLowerCase() === 'on';
const pareceresSolicitados = () =>
  String(process.env.FINANCE_INV_RECOMENDACOES || '').toLowerCase() === 'on';
const parecerJuridicoAprovado = () =>
  String(process.env.FINANCE_INV_PARECER_JURIDICO || '').toLowerCase() === 'aprovado';

function estadoPareceres(disponivel) {
  const solicitados = pareceresSolicitados();
  const juridico = parecerJuridicoAprovado();
  let motivo = '';
  if (!disponivel) motivo = 'acesso_ceo_indisponivel';
  else if (!solicitados) motivo = 'pareceres_desligados';
  else if (!juridico) motivo = 'parecer_juridico_pendente';
  return {
    habilitados: disponivel && solicitados && juridico,
    solicitados,
    parecerJuridicoAprovado: juridico,
    motivo,
  };
}

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
  const disponivel = flag && interna && modulo && proprietario && autorizado;
  const pareceres = estadoPareceres(disponivel);
  return {
    disponivel,
    ligado: flag,
    autorizado,
    fase: pareceres.habilitados ? 'pareceres_privados' : 'fundacao',
    recomendacoesAtivas: pareceres.habilitados,
    pareceres,
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
  repo.garantirFontesInvestimentos();
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
  const linhas = repo.listarMandatosInvestimentos();
  const persistidos = linhas.map(m => ({
    chave: m.chave,
    nome: m.nome,
    horizonte: m.horizonte_dias,
    liquidezMinimaCents: m.liquidez_minima_cents,
    perdaMaximaPpm: m.perda_maxima_ppm,
    limites: j.parse(m.limites, {}),
    benchmarks: j.parse(m.benchmarks, []),
  }));
  politica.validar(persistidos);
  return linhas.map(m => ({
    id: m.id,
    chave: m.chave,
    nome: m.nome,
    horizonteDias: m.horizonte_dias,
    liquidezMinimaCents: null,
    perdaMaximaPpm: j.parse(m.limites, {}).perdaMaximaDefinida ? m.perda_maxima_ppm : null,
    limites: j.parse(m.limites, {}),
    benchmarks: j.parse(m.benchmarks, []),
    versao: m.versao,
  }));
}

function resumo(tenant, usuario) {
  const acesso = exigir(tenant, usuario);
  const lista = mandatos(tenant, usuario);
  const configuracao = repo.configInvestimentos();
  const mapaCobertura = cobertura(tenant, usuario);
  return {
    fase: acesso.fase,
    escopo: 'uso interno e exclusivo do CEO',
    politicaVersao: politica.VERSAO,
    politicaMinimaConfigurada: lista.length === 3 && lista.every(m => !m.limites.configuracaoPendente),
    configuracaoCompleta: lista.length === 3 && lista.every(m => !m.limites.limitesAdicionaisPendentes),
    mandatos: lista,
    cobertura: mapaCobertura,
    salvaguardas: {
      recomendacoesIndividualizadas: acesso.recomendacoesAtivas,
      recomendacoesSomenteCeo: true,
      ordens: false,
      lances: false,
      alavancagem: false,
      escritaNoRazao: false,
    },
    pareceres: acesso.pareceres,
    agenda: configuracao ? {
      timezone: configuracao.timezone,
      radarHora: configuracao.radar_hora,
      relatorioDiaSemana: configuracao.relatorio_dia_semana,
      relatorioHora: configuracao.relatorio_hora,
    } : null,
    proximoPasso: acesso.recomendacoesAtivas
      ? 'Homologar fontes e motores antes de publicar o primeiro parecer privado.'
      : 'Registrar a validação jurídica e manter cada fonte desativada até a respectiva homologação.',
  };
}

function fontes(tenant, usuario) {
  exigir(tenant, usuario);
  return repo.garantirFontesInvestimentos().map(f => ({
    id: f.id,
    chave: f.chave,
    nome: f.nome,
    categoria: f.categoria,
    tipoAcesso: f.tipo_acesso,
    status: f.status,
    dominio: f.dominio,
    atrasoMinutos: f.atraso_minutos,
    licencaRegistrada: !!f.licenca_ref,
    classes: j.parse(f.classes, []),
    condicoes: f.condicoes,
    versaoCatalogo: f.versao_catalogo,
  }));
}

function cobertura(tenant, usuario) {
  const lista = fontes(tenant, usuario);
  return catalogo.CLASSES.map(c => {
    const candidatas = lista.filter(f => f.classes.includes(c.chave));
    const ativas = candidatas.filter(f => f.status === 'ativa');
    const prototipo = candidatas.filter(f => f.status === 'aprovada_prototipo');
    const manuais = candidatas.filter(f => f.status === 'manual');
    let status = 'indisponivel';
    if (ativas.length) status = 'ativa';
    else if (prototipo.length) status = 'prototipo';
    else if (manuais.length) status = 'manual';
    return {
      chave: c.chave,
      nome: c.nome,
      status,
      fontesCandidatas: candidatas.length,
      fontesAtivas: ativas.length,
      fontesPrototipo: prototipo.length,
    };
  });
}

module.exports = {
  ErroDeAcessoInvestimentos, ligado, pareceresSolicitados, parecerJuridicoAprovado,
  estadoPareceres, estado, exigir, conceder, revogar, mandatos, fontes, cobertura, resumo,
};
