// =====================================================================
// Conectores oficiais de PROTÓTIPO da inteligência de investimentos.
//
// Sondagem não ativa fonte e não gera evidência decisória. Ela somente
// prova acesso, contrato de resposta e rastreabilidade. Redirecionamento é
// recusado para a allowlist não ser contornada.
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const acesso = require('./investimentos-acesso');

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 5 * 1024 * 1024;

const CONECTORES = Object.freeze({
  bcb_dados_abertos: {
    host: 'api.bcb.gov.br',
    url: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json',
    interpretar(j) {
      if (!Array.isArray(j) || !j.length || !j[0].data || j[0].valor == null) {
        throw new Error('Resposta do BCB fora do contrato esperado.');
      }
      return { registros: j.length, referencia: String(j[0].data), conjunto: 'SGS 432' };
    },
  },
  cvm_dados_abertos: {
    host: 'dados.cvm.gov.br',
    url: 'https://dados.cvm.gov.br/api/3/action/package_search?q=companhias&rows=1',
    interpretar(j) {
      if (!j || j.success !== true || !j.result || !Number.isInteger(j.result.count)) {
        throw new Error('Resposta da CVM fora do contrato CKAN esperado.');
      }
      return {
        registros: j.result.count,
        referencia: 'catálogo CKAN',
        conjunto: j.result.results && j.result.results[0] ? String(j.result.results[0].name || '') : '',
      };
    },
  },
  sec_edgar: {
    host: 'data.sec.gov',
    url: 'https://data.sec.gov/submissions/CIK0000320193.json',
    userAgentObrigatorio: true,
    interpretar(j) {
      const recentes = j && j.filings && j.filings.recent;
      if (!j || !j.cik || !j.name || !recentes || !Array.isArray(recentes.accessionNumber)) {
        throw new Error('Resposta da SEC fora do contrato submissions esperado.');
      }
      return {
        registros: recentes.accessionNumber.length,
        referencia: `CIK ${String(j.cik).padStart(10, '0')}`,
        conjunto: String(j.name),
      };
    },
  },
});

class ErroFonteInvestimentos extends Error {
  constructor(msg, status = 502) {
    super(msg);
    this.name = 'ErroFonteInvestimentos';
    this.status = status;
  }
}

function userAgent(conector) {
  if (!conector.userAgentObrigatorio) return 'VillelaFinance/0.1';
  const ua = String(process.env.FINANCE_INV_SEC_USER_AGENT || '').trim();
  if (!ua || !/@/.test(ua)) {
    throw new ErroFonteInvestimentos(
      'SEC indisponível: configure FINANCE_INV_SEC_USER_AGENT com nome do sistema e e-mail de contato.', 503);
  }
  return ua;
}

async function buscarJson(conector, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') throw new ErroFonteInvestimentos('Cliente HTTP indisponível.', 503);
  const url = new URL(conector.url);
  if (url.protocol !== 'https:' || url.hostname !== conector.host) {
    throw new ErroFonteInvestimentos('Destino fora da allowlist da fonte.', 500);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': userAgent(conector) },
    });
    if (res.status >= 300 && res.status < 400) {
      throw new ErroFonteInvestimentos('A fonte tentou redirecionar para outro endereço.');
    }
    if (!res.ok) throw new ErroFonteInvestimentos(`A fonte respondeu HTTP ${res.status}.`);
    const tamanho = Number(res.headers && res.headers.get && res.headers.get('content-length'));
    if (Number.isFinite(tamanho) && tamanho > MAX_BYTES) {
      throw new ErroFonteInvestimentos('Resposta maior que o limite permitido.');
    }
    const texto = await res.text();
    if (Buffer.byteLength(texto, 'utf8') > MAX_BYTES) {
      throw new ErroFonteInvestimentos('Resposta maior que o limite permitido.');
    }
    let dados;
    try { dados = JSON.parse(texto); }
    catch (_) { throw new ErroFonteInvestimentos('A fonte não devolveu JSON válido.'); }
    return { dados, hash: crypto.createHash('sha256').update(texto).digest('hex') };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new ErroFonteInvestimentos('Tempo limite da fonte excedido.');
    if (e instanceof ErroFonteInvestimentos) throw e;
    throw new ErroFonteInvestimentos('Falha de comunicação com a fonte oficial.');
  } finally {
    clearTimeout(timer);
  }
}

async function sondar(tenant, usuario, chave, { fetchImpl } = {}) {
  acesso.exigir(tenant, usuario);
  repo.garantirFontesInvestimentos();
  const fonte = repo.fonteInvestimentosPorChave(String(chave || ''));
  if (!fonte) throw new ErroFonteInvestimentos('Fonte não cadastrada.', 404);
  const conector = CONECTORES[fonte.chave];
  if (!conector) throw new ErroFonteInvestimentos('Esta fonte ainda não possui conector.', 409);
  if (fonte.status !== 'aprovada_prototipo') {
    throw new ErroFonteInvestimentos('A fonte não está aprovada nem mesmo para protótipo.', 409);
  }

  const inicio = new Date().toISOString();
  try {
    const recebido = await buscarJson(conector, fetchImpl || global.fetch);
    let resumo;
    try { resumo = conector.interpretar(recebido.dados); }
    catch (e) { throw new ErroFonteInvestimentos(e.message || 'Contrato da fonte inválido.'); }
    const coleta = repo.registrarColetaInvestimentos({
      fonteId: fonte.id, status: 'sucesso', iniciadaEm: inicio,
      concluidaEm: new Date().toISOString(), registros: resumo.registros,
      datasetHash: recebido.hash, resumo,
    });
    return { fonte: fonte.chave, status: 'sucesso', ...resumo, datasetHash: recebido.hash, coletaId: coleta.id };
  } catch (e) {
    repo.registrarColetaInvestimentos({
      fonteId: fonte.id, status: 'falhou', iniciadaEm: inicio,
      concluidaEm: new Date().toISOString(), erro: e.message,
    });
    throw e;
  }
}

module.exports = {
  CONECTORES, TIMEOUT_MS, MAX_BYTES, ErroFonteInvestimentos,
  buscarJson, sondar,
};
