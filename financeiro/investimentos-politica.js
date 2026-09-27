// =====================================================================
// Política mínima aprovada para os três mandatos privados do CEO.
// Percentuais em partes por milhão: 1% = 10.000; 100% = 1.000.000.
// Não contém recomendação, carteira, ordem, lance nem valor patrimonial.
// =====================================================================
'use strict';

const PPM_TOTAL = 1_000_000;
const VERSAO = 2;
const METODOLOGIA = 'politica-minima-v2';

const PROIBICOES = Object.freeze([
  'alavancagem',
  'derivativos_especulativos',
  'recomendacao_individualizada',
  'ordem',
  'lance',
  'escrita_no_razao',
]);

const comum = () => ({
  politica: METODOLOGIA,
  basePercentual: 'patrimonio_acompanhado',
  valoresAbsolutos: false,
  configuracaoPendente: false,
  limitesAdicionaisPendentes: true,
  ativoExclusivoDeUmMandato: true,
  reservaOperacionalExterna: true,
  proibicoes: [...PROIBICOES],
});

function sementes() {
  return [
    {
      chave: 'caixa', nome: 'Caixa e liquidez', horizonte: 365,
      liquidezMinimaCents: 0, perdaMaximaPpm: 0,
      benchmarks: ['CDI', 'SELIC'],
      limites: {
        ...comum(),
        alocacaoMinimaPpm: 10_000,
        prazoLiquidezMaxDiasUteis: 1,
        perdaMaximaDefinida: false,
      },
    },
    {
      chave: 'longo_prazo', nome: 'Patrimônio de longo prazo', horizonte: 3650,
      liquidezMinimaCents: 0, perdaMaximaPpm: 100_000,
      benchmarks: ['IPCA', 'IBOV'],
      limites: {
        ...comum(),
        quedaMaximaToleradaPpm: 100_000,
        perdaMaximaDefinida: true,
        liquidezDefinida: false,
      },
    },
    {
      chave: 'oportunidades', nome: 'Oportunidades especiais', horizonte: 1095,
      liquidezMinimaCents: 0, perdaMaximaPpm: 0,
      benchmarks: ['IPCA'],
      limites: {
        ...comum(),
        exposicaoMaximaPpm: 100_000,
        perdaMaximaDefinida: false,
        exigePerdaMaximaEstimavel: true,
        exigeDocumentacao: true,
        exigeSaidaViavel: true,
      },
    },
  ];
}

const ppmValido = (v) => Number.isInteger(v) && v >= 0 && v <= PPM_TOTAL;

function validar(mandatos) {
  if (!Array.isArray(mandatos) || mandatos.length !== 3) {
    throw new Error('A política de investimentos precisa conter exatamente três mandatos.');
  }
  const porChave = new Map(mandatos.map(m => [m.chave, m]));
  if (porChave.size !== 3 || !['caixa', 'longo_prazo', 'oportunidades'].every(k => porChave.has(k))) {
    throw new Error('A política precisa dos mandatos caixa, longo_prazo e oportunidades, sem duplicidade.');
  }
  for (const m of mandatos) {
    if (!m.limites || typeof m.limites !== 'object' || Array.isArray(m.limites)) {
      throw new Error(`Limites inválidos em ${m.chave}.`);
    }
    if (!Number.isInteger(m.horizonte) || m.horizonte <= 0) throw new Error(`Horizonte inválido em ${m.chave}.`);
    if (!ppmValido(m.perdaMaximaPpm)) throw new Error(`Perda máxima inválida em ${m.chave}.`);
    if (m.liquidezMinimaCents !== 0 || m.limites.valoresAbsolutos !== false) {
      throw new Error(`A política percentual não aceita valor absoluto em ${m.chave}.`);
    }
    if (m.limites.configuracaoPendente !== false || m.limites.limitesAdicionaisPendentes !== true) {
      throw new Error(`Estado da política mínima inválido em ${m.chave}.`);
    }
    if (!Array.isArray(m.limites.proibicoes) || !PROIBICOES.every(p => m.limites.proibicoes.includes(p))) {
      throw new Error(`Salvaguardas incompletas em ${m.chave}.`);
    }
  }
  const caixa = porChave.get('caixa').limites;
  const longo = porChave.get('longo_prazo');
  const oportunidades = porChave.get('oportunidades').limites;
  if (caixa.alocacaoMinimaPpm !== 10_000 || caixa.prazoLiquidezMaxDiasUteis !== 1) {
    throw new Error('O mandato de caixa diverge do limite aprovado.');
  }
  if (longo.perdaMaximaPpm !== 100_000 || longo.limites.quedaMaximaToleradaPpm !== 100_000) {
    throw new Error('O mandato de longo prazo diverge do limite aprovado.');
  }
  if (oportunidades.exposicaoMaximaPpm !== 100_000) {
    throw new Error('O mandato de oportunidades diverge do limite aprovado.');
  }
  return true;
}

module.exports = { PPM_TOTAL, VERSAO, METODOLOGIA, PROIBICOES, sementes, validar, ppmValido };
