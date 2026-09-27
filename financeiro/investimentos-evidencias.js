// =====================================================================
// Evidências normalizadas da inteligência privada de investimentos.
//
// Normalizar não significa homologar. Uma evidência só é apta para os
// motores quando a integridade é válida E a fonte foi ativada por uma
// decisão humana. Nesta fase nenhuma fonte está ativa.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { j } = require('./db');
const repo = require('./repo');
const acesso = require('./investimentos-acesso');

const POLITICAS = Object.freeze({
  bcb_selic_meta: Object.freeze({ atualAteDias: 7, venceAposDias: 14 }),
});

class ErroEvidenciaInvestimentos extends Error {
  constructor(msg, status = 422) {
    super(msg);
    this.name = 'ErroEvidenciaInvestimentos';
    this.status = status;
  }
}

function dataUtcEstritaBr(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || ''));
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d;
}

function decimalExato(texto, escala = 2) {
  const m = /^(-?)(\d+)(?:[.,](\d+))?$/.exec(String(texto == null ? '' : texto).trim());
  if (!m) return null;
  const frac = String(m[3] || '');
  if (frac.length > escala) return null;
  const base = 10 ** escala;
  const inteiro = Number(m[2]);
  const parte = Number(frac.padEnd(escala, '0') || 0);
  if (!Number.isSafeInteger(inteiro) || !Number.isSafeInteger(inteiro * base + parte)) return null;
  return (m[1] ? -1 : 1) * (inteiro * base + parte);
}

const inicioDiaUtc = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const somarDiasUtc = (d, dias) => new Date(inicioDiaUtc(d) + dias * 86_400_000);

function diaCivilBrasilia(instante) {
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)));
}

function qualidadeTemporal(dataReferencia, capturadoEm, politica) {
  if (!(dataReferencia instanceof Date) || Number.isNaN(dataReferencia.getTime())) {
    return { integridade: 'incompleta', idadeDias: null, motivo: 'data_referencia_invalida' };
  }
  const captura = diaCivilBrasilia(capturadoEm);
  if (!captura) throw new ErroEvidenciaInvestimentos('Instante de captura inválido.', 500);
  const idadeDias = Math.floor((inicioDiaUtc(captura) - inicioDiaUtc(dataReferencia)) / 86_400_000);
  if (idadeDias < 0) return { integridade: 'conflitante', idadeDias, motivo: 'data_referencia_futura' };
  if (idadeDias > politica.venceAposDias) return { integridade: 'vencida', idadeDias, motivo: 'prazo_maximo_excedido' };
  if (idadeDias > politica.atualAteDias) return { integridade: 'atrasada', idadeDias, motivo: 'fora_da_janela_atual' };
  return { integridade: 'valida', idadeDias, motivo: '' };
}

function hashCanonico(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function normalizarBcbSelic(dados, contexto) {
  if (!Array.isArray(dados) || dados.length !== 1) {
    throw new ErroEvidenciaInvestimentos('A coleta da Selic precisa conter exatamente uma observação.');
  }
  const item = dados[0] || {};
  const ref = dataUtcEstritaBr(item.data);
  const valorMinor = decimalExato(item.valor, 2);
  const politica = POLITICAS.bcb_selic_meta;
  let qualidade = qualidadeTemporal(ref, contexto.capturadoEm, politica);
  if (valorMinor == null || valorMinor < 0 || valorMinor > 100_000) {
    qualidade = { integridade: 'incompleta', idadeDias: qualidade.idadeDias, motivo: 'valor_invalido' };
  }
  const periodoRef = ref ? ref.toISOString().slice(0, 10) : String(item.data || '');
  const canonico = {
    fonte: 'bcb_dados_abertos', conjunto: 'SGS 432', tipo: 'taxa_meta_selic',
    periodoRef, valorMinor, escala: 2, unidade: 'percentual_ao_ano', moeda: '',
  };
  return {
    tipo: canonico.tipo,
    periodoRef,
    capturadoEm: contexto.capturadoEm,
    valorMinor,
    escala: 2,
    unidade: canonico.unidade,
    moeda: '',
    integridade: qualidade.integridade,
    expiraEm: ref ? somarDiasUtc(ref, politica.venceAposDias + 1).toISOString() : '',
    url: contexto.url,
    sha256: hashCanonico(canonico),
    dados: {
      conjunto: canonico.conjunto,
      coletaId: contexto.coletaId,
      datasetHash: contexto.datasetHash,
      idadeDias: qualidade.idadeDias,
      motivoIntegridade: qualidade.motivo,
      politicaAtualidade: politica,
    },
  };
}

function normalizar(fonte, dados, contexto) {
  if (!fonte || fonte.chave !== 'bcb_dados_abertos') {
    throw new ErroEvidenciaInvestimentos('Esta fonte ainda não possui contrato de evidência normalizada.', 409);
  }
  return [normalizarBcbSelic(dados, contexto)];
}

function registrar(fonte, observacoes) {
  return observacoes.map(o => {
    const linha = repo.registrarEvidenciaInvestimentos({ ...o, fonteId: fonte.id });
    return apresentar(linha, fonte);
  });
}

function apresentar(linha, fonte, agora = new Date().toISOString()) {
  const dados = j.parse(linha.dados, {});
  const fonteAtiva = fonte.status === 'ativa';
  let integridade = linha.integridade;
  let idadeDias = dados.idadeDias == null ? null : dados.idadeDias;
  let motivoIntegridade = dados.motivoIntegridade || '';
  if (!['conflitante', 'incompleta'].includes(integridade)
      && /^\d{4}-\d{2}-\d{2}$/.test(linha.periodo_ref)
      && dados.politicaAtualidade) {
    const reavaliada = qualidadeTemporal(
      new Date(`${linha.periodo_ref}T00:00:00.000Z`), agora, dados.politicaAtualidade);
    integridade = reavaliada.integridade;
    idadeDias = reavaliada.idadeDias;
    motivoIntegridade = reavaliada.motivo;
  }
  const integridadeValida = integridade === 'valida';
  return {
    id: linha.id,
    fonte: fonte.chave,
    fonteNome: fonte.nome,
    fonteStatus: fonte.status,
    tipo: linha.tipo,
    periodoReferencia: linha.periodo_ref,
    capturadoEm: linha.capturado_em,
    valorMinor: linha.valor_minor,
    escala: linha.escala,
    unidade: linha.unidade,
    moeda: linha.moeda,
    integridade,
    motivoIntegridade,
    idadeDias,
    expiraEm: linha.expira_em,
    sha256: linha.sha256,
    aptaParaAnalise: fonteAtiva && integridadeValida,
    bloqueios: [
      ...(!fonteAtiva ? ['fonte_nao_ativa'] : []),
      ...(!integridadeValida ? [`integridade_${integridade}`] : []),
    ],
  };
}

function listar(tenant, usuario) {
  acesso.exigir(tenant, usuario);
  return repo.listarEvidenciasInvestimentos().map(linha => apresentar(linha, {
    chave: linha.fonte_chave,
    nome: linha.fonte_nome,
    status: linha.fonte_status,
  }));
}

module.exports = {
  POLITICAS, ErroEvidenciaInvestimentos, dataUtcEstritaBr, decimalExato,
  diaCivilBrasilia, qualidadeTemporal, normalizarBcbSelic, normalizar, registrar, apresentar, listar,
};
