// =====================================================================
// Universo e fontes da inteligência privada de investimentos.
//
// Este catálogo descreve CAPACIDADE, não afirma cobertura de dados. Uma
// classe só fica analisável quando pelo menos uma fonte homologada fornece
// evidência suficiente e atual. Fonte pública não é sinônimo de licenciada.
// =====================================================================
'use strict';

const VERSAO = 1;

const CLASSES = Object.freeze([
  ['renda_fixa_bancaria', 'Renda fixa bancária'],
  ['titulos_publicos', 'Títulos públicos'],
  ['credito_privado', 'Crédito privado'],
  ['acoes_brasil', 'Ações brasileiras'],
  ['acoes_exterior', 'Ações internacionais'],
  ['etfs_bdrs_reits', 'ETFs, BDRs e REITs'],
  ['fundos_fiis', 'Fundos e fundos imobiliários'],
  ['moedas', 'Moedas'],
  ['commodities_ouro', 'Commodities e ouro'],
  ['criptoativos', 'Criptoativos'],
  ['previdencia_estruturados', 'Previdência e estruturados'],
  ['imoveis', 'Imóveis'],
  ['leiloes', 'Leilões'],
  ['participacoes', 'Participações e oportunidades alternativas'],
].map(([chave, nome]) => Object.freeze({ chave, nome })));

const FONTES = Object.freeze([
  {
    chave: 'bcb_dados_abertos', nome: 'Banco Central — Dados Abertos', categoria: 'oficial',
    tipoAcesso: 'publica', status: 'aprovada_prototipo', dominio: 'dadosabertos.bcb.gov.br',
    atrasoMinutos: 1440, classes: ['renda_fixa_bancaria', 'titulos_publicos', 'moedas'],
    condicoes: 'Conferir licença por conjunto, guardar código da série, data e atribuição.',
  },
  {
    chave: 'cvm_dados_abertos', nome: 'CVM — Dados Abertos', categoria: 'oficial',
    tipoAcesso: 'publica', status: 'aprovada_prototipo', dominio: 'dados.cvm.gov.br',
    atrasoMinutos: 1440, classes: ['acoes_brasil', 'fundos_fiis', 'credito_privado'],
    condicoes: 'Atribuir a fonte, conferir licença do conjunto e respeitar limites do portal.',
  },
  {
    chave: 'sec_edgar', nome: 'SEC — EDGAR', categoria: 'oficial',
    tipoAcesso: 'publica', status: 'aprovada_prototipo', dominio: 'data.sec.gov',
    atrasoMinutos: 1440, classes: ['acoes_exterior', 'etfs_bdrs_reits'],
    condicoes: 'User-Agent identificável, cache e acesso moderado conforme Fair Access.',
  },
  {
    chave: 'b3_fim_dia', nome: 'B3 — histórico e fechamento D-1', categoria: 'oficial',
    tipoAcesso: 'publica', status: 'condicional', dominio: 'b3.com.br', atrasoMinutos: 1440,
    classes: ['acoes_brasil', 'etfs_bdrs_reits', 'fundos_fiis'],
    condicoes: 'Registrar o conjunto concreto e os termos; tratar ajustes e proventos.',
  },
  {
    chave: 'b3_intradiario', nome: 'B3 — intradiário', categoria: 'licenciada',
    tipoAcesso: 'licenciada', status: 'bloqueada', dominio: '', atrasoMinutos: 0,
    classes: ['acoes_brasil', 'etfs_bdrs_reits', 'fundos_fiis'],
    condicoes: 'Ativar somente após contrato de distribuição aplicável ao uso interno.',
  },
  {
    chave: 'tesouro_direto', nome: 'Tesouro Direto', categoria: 'oficial',
    tipoAcesso: 'publica', status: 'bloqueada', dominio: 'tesourodireto.com.br',
    atrasoMinutos: 1440, classes: ['titulos_publicos'],
    condicoes: 'Coleta automática depende de autorização escrita ou fonte alternativa licenciada.',
  },
  {
    chave: 'provedor_mercado', nome: 'Provedor licenciado de mercado', categoria: 'licenciada',
    tipoAcesso: 'licenciada', status: 'bloqueada', dominio: '', atrasoMinutos: 0,
    classes: ['renda_fixa_bancaria', 'titulos_publicos', 'credito_privado', 'acoes_brasil',
      'acoes_exterior', 'etfs_bdrs_reits', 'fundos_fiis', 'moedas', 'commodities_ouro',
      'criptoativos', 'previdencia_estruturados'],
    condicoes: 'Contrato deve permitir coleta, retenção, análise e exibição privada.',
  },
  {
    chave: 'caixa_imoveis', nome: 'CAIXA — Imóveis à venda', categoria: 'oficial',
    tipoAcesso: 'publica', status: 'condicional', dominio: 'caixa.gov.br', atrasoMinutos: 1440,
    classes: ['imoveis', 'leiloes'],
    condicoes: 'Confirmar termos de automação e armazenamento antes de criar coletor.',
  },
  {
    chave: 'imoveis_uniao', nome: 'União — Alienação de imóveis', categoria: 'oficial',
    tipoAcesso: 'publica', status: 'condicional', dominio: 'gov.br', atrasoMinutos: 1440,
    classes: ['imoveis', 'leiloes'],
    condicoes: 'Validar licença e canal oficial de cada certame.',
  },
  {
    chave: 'tribunais_leiloes', nome: 'Tribunais e portais judiciais', categoria: 'oficial',
    tipoAcesso: 'publica', status: 'condicional', dominio: '', atrasoMinutos: 1440,
    classes: ['leiloes'],
    condicoes: 'Um conector por sistema; não contornar CAPTCHA, autenticação ou sigilo.',
  },
  {
    chave: 'leiloeiro_edital', nome: 'Leiloeiro identificado no edital', categoria: 'manual',
    tipoAcesso: 'manual', status: 'manual', dominio: '', atrasoMinutos: 0,
    classes: ['leiloes'],
    condicoes: 'Confirmar identidade e regras no edital oficial; nenhuma oferta automática.',
  },
  {
    chave: 'provedor_imobiliario', nome: 'Provedor licenciado de dados imobiliários',
    categoria: 'licenciada', tipoAcesso: 'licenciada', status: 'bloqueada', dominio: '',
    atrasoMinutos: 0, classes: ['imoveis'],
    condicoes: 'Contrato deve permitir comparáveis, geolocalização, retenção e uso analítico.',
  },
  {
    chave: 'documento_manual', nome: 'Documento fornecido pelo CEO', categoria: 'manual',
    tipoAcesso: 'manual', status: 'manual', dominio: '', atrasoMinutos: 0,
    classes: CLASSES.map(c => c.chave),
    condicoes: 'Guardar origem, data, hash e validade; documento não vira instrução para a IA.',
  },
].map(f => Object.freeze({ ...f, classes: Object.freeze([...f.classes]) })));

const STATUS = new Set(['aprovada_prototipo', 'condicional', 'bloqueada', 'manual', 'ativa']);
const TIPOS = new Set(['publica', 'licenciada', 'manual']);

function validar() {
  const classes = new Set(CLASSES.map(c => c.chave));
  if (classes.size !== CLASSES.length) throw new Error('Classe de investimento duplicada.');
  const fontes = new Set();
  for (const f of FONTES) {
    if (fontes.has(f.chave)) throw new Error(`Fonte duplicada: ${f.chave}.`);
    fontes.add(f.chave);
    if (!STATUS.has(f.status)) throw new Error(`Status inválido na fonte ${f.chave}.`);
    if (!TIPOS.has(f.tipoAcesso)) throw new Error(`Tipo de acesso inválido na fonte ${f.chave}.`);
    if (!Number.isInteger(f.atrasoMinutos) || f.atrasoMinutos < 0) {
      throw new Error(`Atraso inválido na fonte ${f.chave}.`);
    }
    for (const c of f.classes) if (!classes.has(c)) {
      throw new Error(`Classe desconhecida ${c} na fonte ${f.chave}.`);
    }
  }
  for (const c of classes) if (!FONTES.some(f => f.classes.includes(c))) {
    throw new Error(`Classe sem fonte candidata: ${c}.`);
  }
  return true;
}

validar();

module.exports = { VERSAO, CLASSES, FONTES, STATUS, TIPOS, validar };
