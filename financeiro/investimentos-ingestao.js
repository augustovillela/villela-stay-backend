// =====================================================================
// Fundação do pipeline integral de mercado (CVM + SEC).
//
// Esta fase inventaria os arquivos e valida contratos. Não existe função
// de download integral exposta por HTTP: arquivos grandes serão tratados
// por worker dedicado e armazenamento de objetos em etapa posterior.
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const acesso = require('./investimentos-acesso');

const TIMEOUT_MS = 12_000;
const LIMITE_WEB_BYTES = 64 * 1024 * 1024;
const LIMITES_ZIP = Object.freeze({
  maxEntradas: 2_000_000,
  maxDescompactadoBytes: 200 * 1024 * 1024 * 1024,
  maxEntradaBytes: 20 * 1024 * 1024 * 1024,
  maxRazaoCompressao: 250,
});

class ErroIngestaoMercado extends Error {
  constructor(msg, status = 422) {
    super(msg);
    this.name = 'ErroIngestaoMercado';
    this.status = status;
  }
}

function plano(anoAtual = new Date().getUTCFullYear()) {
  if (!Number.isInteger(anoAtual) || anoAtual < 2011 || anoAtual > 2200) {
    throw new ErroIngestaoMercado('Ano de referência inválido.', 400);
  }
  const itens = [{
    chave: 'cvm_cadastro_companhias', fonte: 'cvm_dados_abertos', jurisdicao: 'BR', formato: 'csv',
    url: 'https://dados.cvm.gov.br/dados/cia_aberta/CAD/DADOS/cad_cia_aberta.csv',
    periodicidade: 'diaria', conteudo: 'identidades de companhias abertas',
  }];
  for (let ano = 2010; ano <= anoAtual; ano++) itens.push({
    chave: `cvm_dfp_${ano}`, fonte: 'cvm_dados_abertos', jurisdicao: 'BR', formato: 'zip',
    url: `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${ano}.zip`,
    periodicidade: ano === anoAtual ? 'semanal' : 'historico', conteudo: 'demonstrações anuais DFP',
  });
  for (let ano = 2011; ano <= anoAtual; ano++) itens.push({
    chave: `cvm_itr_${ano}`, fonte: 'cvm_dados_abertos', jurisdicao: 'BR', formato: 'zip',
    url: `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${ano}.zip`,
    periodicidade: ano === anoAtual ? 'semanal' : 'historico', conteudo: 'demonstrações trimestrais ITR',
  });
  itens.push({
    chave: 'sec_submissions_integral', fonte: 'sec_edgar', jurisdicao: 'US', formato: 'zip',
    url: 'https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip',
    periodicidade: 'noturna', conteudo: 'cadastro e histórico de submissões EDGAR',
  }, {
    chave: 'sec_companyfacts_integral', fonte: 'sec_edgar', jurisdicao: 'US', formato: 'zip',
    url: 'https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip',
    periodicidade: 'noturna', conteudo: 'todos os fatos XBRL por companhia',
  });
  return itens;
}

function destinoPermitido(item) {
  const u = new URL(item.url);
  if (u.protocol !== 'https:') return false;
  if (item.fonte === 'cvm_dados_abertos') {
    if (u.hostname !== 'dados.cvm.gov.br') return false;
    return u.pathname === '/dados/cia_aberta/CAD/DADOS/cad_cia_aberta.csv'
      || /^\/dados\/CIA_ABERTA\/DOC\/(DFP|ITR)\/DADOS\/(dfp|itr)_cia_aberta_\d{4}\.zip$/.test(u.pathname);
  }
  return item.fonte === 'sec_edgar' && u.hostname === 'www.sec.gov'
    && ['/Archives/edgar/daily-index/bulkdata/submissions.zip',
      '/Archives/edgar/daily-index/xbrl/companyfacts.zip'].includes(u.pathname);
}

function userAgent(item) {
  if (item.fonte !== 'sec_edgar') return 'VillelaFinance/0.1';
  const ua = String(process.env.FINANCE_INV_SEC_USER_AGENT || '').trim();
  if (!ua || !ua.includes('@')) {
    throw new ErroIngestaoMercado(
      'SEC indisponível: configure FINANCE_INV_SEC_USER_AGENT com sistema e contato.', 503);
  }
  return ua;
}

async function cabecalhoRemoto(item, fetchImpl = global.fetch) {
  if (!destinoPermitido(item)) throw new ErroIngestaoMercado('Destino fora da allowlist de ingestão.', 500);
  if (typeof fetchImpl !== 'function') throw new ErroIngestaoMercado('Cliente HTTP indisponível.', 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(new URL(item.url), {
      method: 'HEAD', redirect: 'manual', signal: controller.signal,
      headers: { accept: item.formato === 'zip' ? 'application/zip' : 'text/csv', 'user-agent': userAgent(item) },
    });
    if (r.status >= 300 && r.status < 400) throw new ErroIngestaoMercado('A fonte tentou redirecionar a carga.');
    if (!r.ok) throw new ErroIngestaoMercado(`A fonte respondeu HTTP ${r.status}.`);
    const tamanho = Number(r.headers.get('content-length'));
    if (!Number.isSafeInteger(tamanho) || tamanho <= 0) {
      throw new ErroIngestaoMercado('A fonte não informou tamanho confiável para a carga.');
    }
    return {
      tamanhoBytes: tamanho,
      etag: String(r.headers.get('etag') || ''),
      ultimaModificacao: String(r.headers.get('last-modified') || ''),
      contentType: String(r.headers.get('content-type') || ''),
      requerWorker: tamanho > LIMITE_WEB_BYTES,
    };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new ErroIngestaoMercado('Tempo limite do inventário excedido.');
    if (e instanceof ErroIngestaoMercado) throw e;
    throw new ErroIngestaoMercado('Falha ao inventariar a fonte oficial.', 502);
  } finally {
    clearTimeout(timer);
  }
}

const chaveCarga = (item, meta) => crypto.createHash('sha256').update([
  item.fonte, item.chave, meta.etag, meta.ultimaModificacao, meta.tamanhoBytes,
].join('|')).digest('hex');

async function inventariar(tenant, usuario, { conjuntos, fetchImpl, anoAtual } = {}) {
  acesso.exigir(tenant, usuario);
  repo.garantirFontesInvestimentos();
  if (!Array.isArray(conjuntos) || !conjuntos.length) {
    throw new ErroIngestaoMercado('Informe explicitamente os conjuntos a inventariar.', 400);
  }
  if (conjuntos.length > 5) {
    throw new ErroIngestaoMercado('Inventário web limitado a cinco conjuntos por chamada; use lotes.', 400);
  }
  const filtro = new Set(conjuntos.map(String));
  const itens = plano(anoAtual).filter(x => filtro.has(x.chave));
  if (itens.length !== filtro.size) throw new ErroIngestaoMercado('Conjunto de mercado desconhecido.', 404);
  const saida = [];
  for (const item of itens) {
    const fonte = repo.fonteInvestimentosPorChave(item.fonte);
    if (!fonte || !['aprovada_prototipo', 'ativa'].includes(fonte.status)) {
      throw new ErroIngestaoMercado(`Fonte ${item.fonte} não aprovada para inventário.`, 409);
    }
    const inicio = new Date().toISOString();
    const meta = await cabecalhoRemoto(item, fetchImpl || global.fetch);
    const status = meta.requerWorker ? 'aguardando_capacidade' : 'pronta';
    const carga = repo.registrarCargaMercado({
      fonteId: fonte.id, conjunto: item.chave, jurisdicao: item.jurisdicao,
      formato: item.formato, modo: 'inventario', status, url: item.url,
      chaveIdempotencia: chaveCarga(item, meta), etag: meta.etag,
      ultimaModificacao: meta.ultimaModificacao, tamanhoBytes: meta.tamanhoBytes,
      limites: { limiteWebBytes: LIMITE_WEB_BYTES, zip: LIMITES_ZIP },
      resumo: { ...meta, periodicidade: item.periodicidade, conteudo: item.conteudo },
      iniciadaEm: inicio, concluidaEm: new Date().toISOString(),
    });
    saida.push({
      id: carga.id, conjunto: item.chave, fonte: item.fonte, status,
      tamanhoBytes: meta.tamanhoBytes, requerWorker: meta.requerWorker,
      etag: meta.etag, ultimaModificacao: meta.ultimaModificacao,
    });
  }
  return saida;
}

function validarEntradasZip(entradas, limites = LIMITES_ZIP) {
  if (!Array.isArray(entradas) || !entradas.length) throw new ErroIngestaoMercado('ZIP sem entradas.');
  if (entradas.length > limites.maxEntradas) throw new ErroIngestaoMercado('ZIP excede o limite de entradas.');
  const nomes = new Set();
  let totalCompactado = 0;
  let totalDescompactado = 0;
  for (const e of entradas) {
    const nome = String(e.nome || '');
    const partes = nome.replace(/\\/g, '/').split('/');
    if (!nome || nome.includes('\0') || nome.startsWith('/') || /^[A-Za-z]:/.test(nome)
        || partes.includes('..') || nomes.has(nome)) {
      throw new ErroIngestaoMercado('ZIP contém caminho inseguro ou duplicado.');
    }
    nomes.add(nome);
    if (e.diretorio) continue;
    if (!/\.(csv|json|txt)$/i.test(nome)) throw new ErroIngestaoMercado('ZIP contém tipo de arquivo não permitido.');
    const c = Number(e.tamanhoCompactado);
    const d = Number(e.tamanhoDescompactado);
    if (!Number.isSafeInteger(c) || !Number.isSafeInteger(d) || c < 0 || d < 0) {
      throw new ErroIngestaoMercado('ZIP contém tamanho inválido.');
    }
    if (d > limites.maxEntradaBytes) throw new ErroIngestaoMercado('Entrada do ZIP excede o limite.');
    if (d > 0 && (c === 0 || d / c > limites.maxRazaoCompressao)) {
      throw new ErroIngestaoMercado('ZIP apresenta taxa de compressão suspeita.');
    }
    totalCompactado += c;
    totalDescompactado += d;
    if (!Number.isSafeInteger(totalDescompactado) || totalDescompactado > limites.maxDescompactadoBytes) {
      throw new ErroIngestaoMercado('ZIP excede o tamanho descompactado permitido.');
    }
  }
  return { entradas: entradas.length, totalCompactado, totalDescompactado };
}

function parseCsvLinha(linha, separador = ';') {
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < String(linha).length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else aspas = !aspas;
    } else if (c === separador && !aspas) {
      campos.push(atual); atual = '';
    } else atual += c;
  }
  if (aspas) throw new ErroIngestaoMercado('Linha CSV com aspas não encerradas.');
  campos.push(atual.replace(/\r$/, ''));
  return campos;
}

function objetoCsv(cabecalho, linha) {
  const chaves = Array.isArray(cabecalho) ? cabecalho : parseCsvLinha(cabecalho);
  const valores = Array.isArray(linha) ? linha : parseCsvLinha(linha);
  if (chaves.length !== valores.length) throw new ErroIngestaoMercado('Linha CSV fora do contrato de colunas.');
  return Object.fromEntries(chaves.map((x, i) => [String(x).replace(/^\uFEFF/, ''), valores[i]]));
}

function identidadeCvm(linha) {
  const cnpj = String(linha.CNPJ_CIA || '').replace(/\D/g, '');
  const codigo = String(linha.CD_CVM || '').trim();
  const nome = String(linha.DENOM_SOCIAL || '').trim();
  if (cnpj.length !== 14 || !/^\d+$/.test(codigo) || !nome) {
    throw new ErroIngestaoMercado('Cadastro CVM sem identidade oficial completa.');
  }
  return {
    classe: 'acoes_brasil', subclasse: 'companhia_aberta', nome, emissor: nome,
    pais: 'BR', identificadores: [
      { sistema: 'cnpj', valor: cnpj, principal: true },
      { sistema: 'cvm_codigo', valor: codigo },
    ],
    metadados: {
      nomeComercial: String(linha.DENOM_COMERC || '').trim(),
      situacaoRegistro: String(linha.SIT || '').trim(),
      situacaoEmissor: String(linha.SIT_EMISSOR || '').trim(),
      setorAtividade: String(linha.SETOR_ATIV || '').trim(),
      categoriaRegistro: String(linha.CATEG_REG || '').trim(),
    },
  };
}

function identidadeSec(doc) {
  const cikNumero = String(doc.cik || doc.cik_str || '').replace(/\D/g, '');
  const nome = String(doc.entityName || doc.name || '').trim();
  if (!cikNumero || !nome) throw new ErroIngestaoMercado('Documento SEC sem CIK e nome do emissor.');
  const cik = cikNumero.padStart(10, '0');
  const tickers = Array.isArray(doc.tickers) ? doc.tickers.map(String).filter(Boolean) : [];
  const bolsas = Array.isArray(doc.exchanges) ? doc.exchanges.map(String).filter(Boolean) : [];
  return {
    classe: 'acoes_exterior', subclasse: 'emissor_sec', nome, emissor: nome,
    ticker: tickers[0] || '', pais: 'US', bolsa: bolsas[0] || '', moeda: 'USD',
    identificadores: [{ sistema: 'sec_cik', valor: cik, principal: true }],
    metadados: { tickers, bolsas },
  };
}

function* fatosSec(doc) {
  const identidade = identidadeSec(doc);
  const fatos = doc && doc.facts;
  if (!fatos || typeof fatos !== 'object') throw new ErroIngestaoMercado('Company facts sem mapa de fatos.');
  for (const [taxonomia, conceitos] of Object.entries(fatos)) {
    for (const [conceito, definicao] of Object.entries(conceitos || {})) {
      for (const [unidade, registros] of Object.entries((definicao && definicao.units) || {})) {
        if (!Array.isArray(registros)) throw new ErroIngestaoMercado('Unidade XBRL fora do contrato.');
        for (const f of registros) yield {
          identidade, taxonomia, conceito, rotulo: String(definicao.label || ''),
          descricao: String(definicao.description || ''), unidade,
          valorTexto: String(f.val == null ? '' : f.val), periodoInicio: String(f.start || ''),
          periodoFim: String(f.end || ''), formulario: String(f.form || ''),
          protocolo: String(f.accn || ''), entregueEm: String(f.filed || ''),
          contexto: { anoFiscal: f.fy || null, periodoFiscal: f.fp || '', frame: f.frame || '' },
        };
      }
    }
  }
}

function fatoCvm(linha) {
  const identidade = identidadeCvm(linha);
  const conceito = String(linha.CD_CONTA || '').trim();
  const protocolo = String(linha.VERSAO || '').trim();
  if (!conceito || !String(linha.DT_REFER || '').trim() || !protocolo) {
    throw new ErroIngestaoMercado('Linha DFP/ITR sem conta, referência ou versão.');
  }
  return {
    identidade, taxonomia: 'cvm_plano_contas', conceito,
    rotulo: String(linha.DS_CONTA || '').trim(), unidade: String(linha.MOEDA || '').trim(),
    valorTexto: String(linha.VL_CONTA == null ? '' : linha.VL_CONTA).trim(),
    periodoInicio: String(linha.DT_INI_EXERC || '').trim(),
    periodoFim: String(linha.DT_FIM_EXERC || linha.DT_REFER || '').trim(),
    formulario: String(linha.GRUPO_DFP || '').trim(), protocolo,
    entregueEm: String(linha.DT_RECEB || '').trim(),
    escopo: String(linha.ORDEM_EXERC || '').trim(),
    contexto: { escalaMoeda: String(linha.ESCALA_MOEDA || '').trim(), contaFixa: String(linha.ST_CONTA_FIXA || '').trim() },
  };
}

function registrarIdentidade(tenant, usuario, identidade) {
  acesso.exigir(tenant, usuario);
  return repo.registrarInstrumentoMercado(identidade);
}

function estado(tenant, usuario, anoAtual) {
  acesso.exigir(tenant, usuario);
  return {
    modo: 'inventario',
    downloadIntegralHabilitado: false,
    conjuntos: plano(anoAtual),
    cargas: repo.listarCargasMercado(),
    limitesZip: LIMITES_ZIP,
    limiteWebBytes: LIMITE_WEB_BYTES,
  };
}

module.exports = {
  TIMEOUT_MS, LIMITE_WEB_BYTES, LIMITES_ZIP, ErroIngestaoMercado,
  plano, destinoPermitido, cabecalhoRemoto, inventariar, validarEntradasZip,
  parseCsvLinha, objetoCsv, identidadeCvm, identidadeSec, fatosSec, fatoCvm,
  registrarIdentidade, estado,
};
