// Contratos puros compartilhados pelo processo web e pelo worker separado.
// IMPORTANTE: este arquivo não pode importar repo.js/db.js/tenancy.js.
'use strict';

const LIMITES_ZIP = Object.freeze({
  maxEntradas: 2_000_000,
  maxDescompactadoBytes: 200 * 1024 * 1024 * 1024,
  maxEntradaBytes: 20 * 1024 * 1024 * 1024,
  maxRazaoCompressao: 250,
});

class ErroContratoMercado extends Error {
  constructor(msg) { super(msg); this.name = 'ErroContratoMercado'; }
}

function criarValidadorZip(limites = LIMITES_ZIP, registrarNome) {
  const nomes = registrarNome ? null : new Set();
  let quantidade = 0, totalCompactado = 0, totalDescompactado = 0;
  const adicionar = e => {
    quantidade++;
    if (quantidade > limites.maxEntradas) throw new ErroContratoMercado('ZIP excede o limite de entradas.');
    const nome = String(e.nome || '');
    const partes = nome.replace(/\\/g, '/').split('/');
    if (!nome || nome.includes('\0') || nome.startsWith('/') || /^[A-Za-z]:/.test(nome) || partes.includes('..')) {
      throw new ErroContratoMercado('ZIP contém caminho inseguro ou duplicado.');
    }
    const novo = registrarNome ? registrarNome(nome) : !nomes.has(nome);
    if (!novo) throw new ErroContratoMercado('ZIP contém caminho inseguro ou duplicado.');
    if (nomes) nomes.add(nome);
    if (e.diretorio) return;
    if (!/\.(csv|json|txt)$/i.test(nome)) throw new ErroContratoMercado('ZIP contém tipo de arquivo não permitido.');
    const c = Number(e.tamanhoCompactado), d = Number(e.tamanhoDescompactado);
    if (!Number.isSafeInteger(c) || !Number.isSafeInteger(d) || c < 0 || d < 0) {
      throw new ErroContratoMercado('ZIP contém tamanho inválido.');
    }
    if (d > limites.maxEntradaBytes) throw new ErroContratoMercado('Entrada do ZIP excede o limite.');
    if (d > 0 && (c === 0 || d / c > limites.maxRazaoCompressao)) {
      throw new ErroContratoMercado('ZIP apresenta taxa de compressão suspeita.');
    }
    totalCompactado += c; totalDescompactado += d;
    if (!Number.isSafeInteger(totalDescompactado) || totalDescompactado > limites.maxDescompactadoBytes) {
      throw new ErroContratoMercado('ZIP excede o tamanho descompactado permitido.');
    }
  };
  return { adicionar, resultado() {
    if (!quantidade) throw new ErroContratoMercado('ZIP sem entradas.');
    return { entradas: quantidade, totalCompactado, totalDescompactado };
  } };
}

function validarEntradasZip(entradas, limites = LIMITES_ZIP) {
  if (!Array.isArray(entradas)) throw new ErroContratoMercado('ZIP sem entradas.');
  const v = criarValidadorZip(limites);
  for (const e of entradas) v.adicionar(e);
  return v.resultado();
}

function parseCsvLinha(linha, separador = ';') {
  const campos = []; let atual = '', aspas = false;
  for (let i = 0; i < String(linha).length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas;
    } else if (c === separador && !aspas) { campos.push(atual); atual = ''; }
    else atual += c;
  }
  if (aspas) throw new ErroContratoMercado('Linha CSV com aspas não encerradas.');
  campos.push(atual.replace(/\r$/, ''));
  return campos;
}

function objetoCsv(cabecalho, linha) {
  const chaves = Array.isArray(cabecalho) ? cabecalho : parseCsvLinha(cabecalho);
  const valores = Array.isArray(linha) ? linha : parseCsvLinha(linha);
  if (chaves.length !== valores.length) throw new ErroContratoMercado('Linha CSV fora do contrato de colunas.');
  return Object.fromEntries(chaves.map((x, i) => [String(x).replace(/^\uFEFF/, ''), valores[i]]));
}

function identidadeCvm(linha) {
  const cnpj = String(linha.CNPJ_CIA || '').replace(/\D/g, '');
  const codigo = String(linha.CD_CVM || '').trim();
  // O cadastro diário usa DENOM_SOCIAL; DFP/ITR usam DENOM_CIA.
  // São nomes oficiais de layouts distintos da própria CVM.
  const nome = String(linha.DENOM_SOCIAL || linha.DENOM_CIA || '').trim();
  if (cnpj.length !== 14 || !/^\d+$/.test(codigo) || !nome) throw new ErroContratoMercado('Cadastro CVM sem identidade oficial completa.');
  return {
    classe: 'acoes_brasil', subclasse: 'companhia_aberta', nome, emissor: nome, pais: 'BR',
    identificadores: [{ sistema: 'cnpj', valor: cnpj, principal: true }, { sistema: 'cvm_codigo', valor: codigo }],
    metadados: {
      nomeComercial: String(linha.DENOM_COMERC || '').trim(), situacaoRegistro: String(linha.SIT || '').trim(),
      situacaoEmissor: String(linha.SIT_EMISSOR || '').trim(), setorAtividade: String(linha.SETOR_ATIV || '').trim(),
      categoriaRegistro: String(linha.CATEG_REG || '').trim(),
    },
  };
}

function identidadeSec(doc) {
  const cikNumero = String(doc.cik || doc.cik_str || '').replace(/\D/g, '');
  const nome = String(doc.entityName || doc.name || '').trim();
  if (!cikNumero || !nome) throw new ErroContratoMercado('Documento SEC sem CIK e nome do emissor.');
  const tickers = Array.isArray(doc.tickers) ? doc.tickers.map(String).filter(Boolean) : [];
  const bolsas = Array.isArray(doc.exchanges) ? doc.exchanges.map(String).filter(Boolean) : [];
  return {
    classe: 'acoes_exterior', subclasse: 'emissor_sec', nome, emissor: nome,
    ticker: tickers[0] || '', pais: 'US', bolsa: bolsas[0] || '', moeda: 'USD',
    identificadores: [{ sistema: 'sec_cik', valor: cikNumero.padStart(10, '0'), principal: true }],
    metadados: { tickers, bolsas },
  };
}

function* fatosSec(doc) {
  const identidade = identidadeSec(doc);
  if (!doc || !doc.facts || typeof doc.facts !== 'object') throw new ErroContratoMercado('Company facts sem mapa de fatos.');
  for (const [taxonomia, conceitos] of Object.entries(doc.facts)) {
    for (const [conceito, definicao] of Object.entries(conceitos || {})) {
      for (const [unidade, registros] of Object.entries((definicao && definicao.units) || {})) {
        if (!Array.isArray(registros)) throw new ErroContratoMercado('Unidade XBRL fora do contrato.');
        for (const f of registros) yield {
          identidade, taxonomia, conceito, rotulo: String(definicao.label || ''),
          descricao: String(definicao.description || ''), unidade,
          valorTexto: String(f.val == null ? '' : f.val), periodoInicio: String(f.start || ''),
          periodoFim: String(f.end || ''), formulario: String(f.form || ''), protocolo: String(f.accn || ''),
          entregueEm: String(f.filed || ''), contexto: { anoFiscal: f.fy || null, periodoFiscal: f.fp || '', frame: f.frame || '' },
        };
      }
    }
  }
}

function fatoCvm(linha) {
  const identidade = identidadeCvm(linha);
  const conceito = String(linha.CD_CONTA || '').trim(), protocolo = String(linha.VERSAO || '').trim();
  if (!conceito || !String(linha.DT_REFER || '').trim() || !protocolo) {
    throw new ErroContratoMercado('Linha DFP/ITR sem conta, referência ou versão.');
  }
  return {
    identidade, taxonomia: 'cvm_plano_contas', conceito, rotulo: String(linha.DS_CONTA || '').trim(),
    unidade: String(linha.MOEDA || '').trim(), valorTexto: String(linha.VL_CONTA == null ? '' : linha.VL_CONTA).trim(),
    periodoInicio: String(linha.DT_INI_EXERC || '').trim(), periodoFim: String(linha.DT_FIM_EXERC || linha.DT_REFER || '').trim(),
    formulario: String(linha.GRUPO_DFP || '').trim(), protocolo, entregueEm: String(linha.DT_RECEB || '').trim(),
    escopo: String(linha.ORDEM_EXERC || '').trim(),
    contexto: {
      escalaMoeda: String(linha.ESCALA_MOEDA || '').trim(),
      contaFixa: String(linha.ST_CONTA_FIXA || '').trim(),
      colunaDf: String(linha.COLUNA_DF || '').trim(),
    },
  };
}

module.exports = {
  LIMITES_ZIP, ErroContratoMercado, criarValidadorZip, validarEntradasZip,
  parseCsvLinha, objetoCsv, identidadeCvm, identidadeSec, fatosSec, fatoCvm,
};
