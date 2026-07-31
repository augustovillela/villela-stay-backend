// =====================================================================
// Villela Stay Manager — ONDA LIVRO · índice das regras de negócio.
//
// Reúne os módulos de livro/ num só ponto de entrada, do mesmo jeito que
// repo-livro.js faz no Villela Legal. NÃO altera app-repo.js: a única
// interferência no núcleo é a guarda de interligação, que ENVOLVE
// Reservas.criar (instalarGuardaInterligacao) em vez de reescrevê-lo.
//
// Mapa livro → módulo:
//   base.js       Cap. 8 (governança, permissões, auditoria) + sementes
//   operacao.js   Caps. 6, 13, 20, 30, 37, 39 (ficha, interligações,
//                 bloqueios, auditoria de sincronização, rotinas)
//   campo.js      Caps. 35, 36, 37, 38, 39 (escala, evidência, inspeção,
//                 preventiva, suprimentos, painel do dia)
//   comercial.js  Caps. 21, 23, 24, 25, 30 (CRM, revenue, documentação/risco)
//   hospede.js    Caps. 29, 31, 33, 34 (régua, manual, concierge, reputação)
//   financeiro.js Caps. 12, 22, 40 + Apêndice F (métricas, DRE, proprietários)
// =====================================================================
'use strict';
const base = require('./livro/base');
const operacao = require('./livro/operacao');
const campo = require('./livro/campo');
const comercial = require('./livro/comercial');
const hospede = require('./livro/hospede');
const financeiro = require('./livro/financeiro');
const S = require('./seed-livro');

// a guarda anti-overbooking dos interligados é instalada na montagem
operacao.instalarGuardaInterligacao();

module.exports = {
  // governança e catálogos (Cap. 8, Apêndices A/E)
  Auditoria: base.Auditoria,
  Permissoes: base.Permissoes,
  Pops: base.Pops,
  Crises: base.Crises,
  Prompts: base.Prompts,
  ConfigFinanceira: base.ConfigFinanceira,
  semearTenant: base.semearTenant,

  // operação
  Ficha: operacao.Ficha,
  Interligacoes: operacao.Interligacoes,
  Bloqueios: operacao.Bloqueios,
  Rotinas: operacao.Rotinas,
  Auditorias: operacao.Auditorias,
  rodarAuditoria: operacao.rodarAuditoria,
  setFabricaStays: operacao.setFabricaStays,

  // campo
  Escala: campo.Escala,
  Execucao: campo.Execucao,
  Inspecoes: campo.Inspecoes,
  Preventiva: campo.Preventiva,
  Fornecedores: campo.Fornecedores,
  Suprimentos: campo.Suprimentos,
  painelDoDia: campo.painelDoDia,

  // comercial
  Contatos: comercial.Contatos,
  Oportunidades: comercial.Oportunidades,
  DatasEspeciais: comercial.DatasEspeciais,
  revisaoSemanal: comercial.revisaoSemanal,
  PoliticaDoc: comercial.PoliticaDoc,
  Documentacao: comercial.Documentacao,

  // hóspede
  Modelos: hospede.Modelos,
  Regua: hospede.Regua,
  Manual: hospede.Manual,
  Concierge: hospede.Concierge,
  Reputacao: hospede.Reputacao,

  // números
  metricas: financeiro.metricas,
  alertas: financeiro.alertas,
  dre: financeiro.dre,
  Proprietarios: financeiro.Proprietarios,
  convencoes: financeiro.convencoes,

  // catálogos estáticos do livro (servidos ao painel)
  catalogos: {
    decisoes_humanas: S.DECISOES_HUMANAS,
    pode_sozinha: S.PODE_SOZINHA,
    dicionario_metricas: S.DICIONARIO_METRICAS,
    seis_do_painel: S.SEIS_DO_PAINEL,
    motivos_perda: S.MOTIVOS_PERDA.map(m => ({ chave: m[0], rotulo: m[1], familia: m[2] })),
    estagios_funil: S.ESTAGIOS_FUNIL,
    roteiro_adocao: S.ROTEIRO_ADOCAO,
    nao_construir: S.NAO_CONSTRUIR,
    marcador_acesso: S.MARCADOR_ACESSO,
    idiomas: hospede.IDIOMAS,
    classes_avaliacao: hospede.CLASSES_AVAL,
    classes_desvio: campo.CLASSES_DESVIO,
    especialidades_criticas: campo.ESPECIALIDADES_CRITICAS,
  },
};
