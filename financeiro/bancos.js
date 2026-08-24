// =====================================================================
// Villela Finance — extrato bancário: importar, deduplicar, conciliar.
//
// A transação importada NÃO é lançamento contábil. Ela é o extrato: um
// fato do banco, guardado com a linha original intacta (`bruto`). Só vira
// lote no razão quando alguém — ou uma regra confiável — diz a que conta
// pertence. Essa separação é o que permite reimportar sem medo.
//
// DEDUPLICAÇÃO. A impressão digital combina data + valor + descrição +
// documento + a POSIÇÃO daquela combinação dentro do arquivo. Duas
// compras idênticas de R$ 50 no mesmo dia são duas transações legítimas
// (posições 1 e 2); reimportar o mesmo arquivo devolve as mesmas posições
// e portanto as mesmas impressões — e o índice único recusa. É a
// diferença entre "deduplicar" e "esconder movimento repetido de verdade".
// =====================================================================
'use strict';
const crypto = require('crypto');
const { transacao, j, hojeISO } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const tenancy = require('./tenancy');
const planoContas = require('./plano-contas');
const classificacao = require('./classificacao');

class ErroDeImportacao extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDeImportacao'; this.status = 400; this.detalhe = detalhe || null; }
}

// ------------------------------------------------------------- leitura

/** CSV com aspas, delimitador automático (`;` `,` ou tab) e CRLF. */
function lerCsv(texto) {
  const limpo = String(texto).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const primeira = limpo.split('\n').find(l => l.trim()) || '';
  const contar = (d) => (primeira.match(new RegExp(`\\${d}`, 'g')) || []).length;
  const delimitador = [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0];

  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === delimitador) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return { linhas: linhas.filter(l => l.some(c => String(c).trim())), delimitador };
}

/**
 * OFX — o formato que todo banco brasileiro exporta e que resolve, de
 * graça, as três ambiguidades do CSV: separador decimal, ordem das colunas
 * e sinal do valor. Aqui o valor vem com ponto decimal e com o sinal
 * explícito, e cada lançamento traz o `FITID`, que é o identificador único
 * do banco.
 *
 * O arquivo é SGML (OFX 1.x) na prática — tag sem fechamento, valor até o
 * fim da linha. Também aceita o XML do OFX 2.x, que fecha as tags: ler até
 * `<` ou fim de linha cobre os dois sem precisar de parser de XML.
 *
 * Não é um parser de OFX completo, e não pretende ser: extrai
 * `<STMTTRN>` e ignora saldos, cabeçalhos e blocos de investimento. É o
 * que um extrato precisa.
 */
function lerOfx(texto) {
  const bruto = String(texto).replace(/\r\n?/g, '\n');
  const blocos = bruto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>|<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>)/gi) || [];

  const campo = (bloco, tag) => {
    const m = new RegExp(`<${tag}>\\s*([^<\\n]*)`, 'i').exec(bloco);
    return m ? m[1].trim() : '';
  };

  const registros = [];
  for (const b of blocos) {
    // DTPOSTED vem como AAAAMMDD, às vezes com hora e fuso colados
    // (20260801120000[-3:BRT]) — os oito primeiros dígitos bastam.
    const dt = campo(b, 'DTPOSTED').replace(/[^0-9]/g, '').slice(0, 8);
    if (dt.length !== 8) continue;
    const data = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;

    const valor = campo(b, 'TRNAMT').replace(/\s/g, '').replace(',', '.');
    const n = Number(valor);
    if (!Number.isFinite(n) || n === 0) continue;

    const memo = campo(b, 'MEMO');
    const nome = campo(b, 'NAME');
    registros.push({
      data,
      // Sinal do OFX é a fonte da verdade: negativo é saída, e não há
      // coluna de débito/crédito para interpretar errado.
      valorCents: n < 0 ? -Math.round(Math.abs(n) * 100) : Math.round(n * 100),
      descricao: (memo || nome || campo(b, 'TRNTYPE') || 'Lançamento').slice(0, 300),
      documento: (campo(b, 'FITID') || campo(b, 'CHECKNUM') || '').slice(0, 100),
      contraparteNome: (memo && nome ? nome : '').slice(0, 200),
      // `idBanco` é o que torna a reimportação EXATA: é o identificador do
      // próprio banco, não uma impressão digital que nós calculamos.
      idBanco: campo(b, 'FITID').slice(0, 100),
      bruto: b.trim().slice(0, 1000),
    });
  }
  return registros;
}

/** OFX se reconhece pelo conteúdo, não pela extensão nem pelo que o cliente diz. */
const pareceOfx = (texto) => /<STMTTRN>/i.test(String(texto).slice(0, 200000));

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const SINONIMOS = {
  data: ['data', 'data lancamento', 'data do lancamento', 'data mov', 'dt', 'date', 'data movimento', 'data da compra'],
  valor: ['valor', 'valor r$', 'amount', 'montante', 'vlr', 'valor (r$)'],
  descricao: ['descricao', 'historico', 'lancamento', 'detalhe', 'memo', 'description', 'titulo', 'estabelecimento'],
  documento: ['documento', 'doc', 'nr documento', 'numero documento', 'id', 'identificador'],
  debito: ['debito', 'saida', 'saidas', 'debit'],
  credito: ['credito', 'entrada', 'entradas', 'credit'],
  contraparte: ['contraparte', 'favorecido', 'beneficiario', 'pagador', 'nome', 'remetente', 'destinatario'],
};

/** Descobre a coluna de cada campo pelo cabeçalho. Mapa explícito vence. */
function mapearColunas(cabecalho, mapaExplicito = {}) {
  const norm = cabecalho.map(semAcento);
  // Duas coisas que parecem detalhe e não são, medidas contra o CSV real do
  // C6 (`Data Lançamento,Data Contábil,Título,Descrição,Entrada,Saída,...`):
  //
  //  1. A busca percorre os SINÔNIMOS em ordem, não as COLUNAS. Percorrendo as
  //     colunas, "Título" (sinônimo fraco, vem antes) vencia "Descrição"
  //     (sinônimo forte, vem depois) — e a descrição do lançamento virava
  //     "Pix recebido"/"Pagamento", sem o nome do fornecedor. As regras de
  //     classificação casam em "neoenergia", "caesb": elas parariam de casar,
  //     em silêncio, e ninguém ligaria uma coisa à outra.
  //  2. O casamento por PEDAÇO exige limite de palavra. Sem isso, o sinônimo
  //     "id" (de documento) casava dentro de "saída" — a coluna de documento
  //     apontava para o valor de saída.
  const contem = (cabecalho, alvo) => new RegExp(`(^|[^a-z0-9])${alvo}([^a-z0-9]|$)`).test(cabecalho);
  const achar = (campo) => {
    if (mapaExplicito[campo] != null) return Number(mapaExplicito[campo]);
    const alvos = SINONIMOS[campo] || [];
    for (const a of alvos) {
      const i = norm.indexOf(a);
      if (i !== -1) return i;
    }
    for (const a of alvos) {
      const i = norm.findIndex(c => contem(c, a));
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    data: achar('data'), valor: achar('valor'), descricao: achar('descricao'),
    documento: achar('documento'), debito: achar('debito'), credito: achar('credito'),
    contraparte: achar('contraparte'),
  };
}

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const RE_BR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/;

/**
 * Normaliza data para AAAA-MM-DD. Ano de 2 dígitos vira 20xx.
 *
 * Valida o calendário de verdade: "31/02" e "99/99/9999" casam com a
 * expressão regular mas não existem. Deixar passar transformaria um
 * arquivo corrompido em lançamento com data impossível.
 */
function normalizarData(v) {
  const s = String(v || '').trim();
  let ano, mes, dia;
  let m = s.match(RE_ISO);
  if (m) { [, ano, mes, dia] = m; }
  else {
    m = s.match(RE_BR);
    if (!m) return '';
    ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    mes = String(m[2]).padStart(2, '0');
    dia = String(m[1]).padStart(2, '0');
  }
  const a = Number(ano), mm = Number(mes), dd = Number(dia);
  if (a < 1900 || a > 2200 || mm < 1 || mm > 12 || dd < 1) return '';
  if (dd > new Date(Date.UTC(a, mm, 0)).getUTCDate()) return '';
  return `${ano}-${mes}-${dia}`;
}

/** Uma linha do arquivo → transação normalizada, ou `{ erro }`. */
function normalizarLinha(colunas, mapa, numero) {
  const pegar = (i) => (i >= 0 && i < colunas.length ? String(colunas[i]).trim() : '');
  const data = normalizarData(pegar(mapa.data));
  if (!data) return { erro: `linha ${numero}: data ilegível (${JSON.stringify(pegar(mapa.data))})` };

  // Débito/crédito em COLUNAS SEPARADAS vence a coluna única de valor. Um
  // extrato que traz as duas colunas é inequívoco sobre o sinal; a coluna
  // única depende de o banco trazer o menos — e há banco que não traz. Além
  // disso, cabeçalho como `NET_CREDIT_AMOUNT` casa com "valor" (por "amount")
  // e com "crédito" ao mesmo tempo: dando preferência ao par, o sinal sai
  // certo em vez de todo lançamento virar entrada.
  let valorCents = null;
  try {
    const temPar = (mapa.credito >= 0 && pegar(mapa.credito)) || (mapa.debito >= 0 && pegar(mapa.debito));
    if (!temPar && mapa.valor >= 0 && pegar(mapa.valor)) {
      valorCents = dinheiro.paraCentavos(pegar(mapa.valor), 'valor');
    } else if (mapa.credito >= 0 || mapa.debito >= 0) {
      const cred = pegar(mapa.credito) ? dinheiro.paraCentavos(pegar(mapa.credito), 'crédito') : 0;
      const deb = pegar(mapa.debito) ? dinheiro.paraCentavos(pegar(mapa.debito), 'débito') : 0;
      valorCents = Math.abs(cred) - Math.abs(deb);
    }
  } catch (e) {
    return { erro: `linha ${numero}: ${e.message}` };
  }
  if (valorCents == null) return { erro: `linha ${numero}: sem coluna de valor reconhecida` };
  if (valorCents === 0) return { erro: `linha ${numero}: valor zero` };

  return {
    data, valorCents,
    descricao: pegar(mapa.descricao).slice(0, 300),
    documento: pegar(mapa.documento).slice(0, 100),
    contraparteNome: pegar(mapa.contraparte).slice(0, 200),
    bruto: colunas,
  };
}

/**
 * Impressão digital. `posicao` é a ordem daquela combinação idêntica
 * DENTRO do lote importado — ver o cabeçalho do arquivo.
 */
const impressaoDigital = (t, posicao) => crypto.createHash('sha256')
  .update([t.data, t.valorCents, semAcento(t.descricao), semAcento(t.documento), posicao].join('|'))
  .digest('hex').slice(0, 32);

// ----------------------------------------------------------- importação

/**
 * Importa um extrato. Idempotente em dois níveis: o arquivo inteiro (pelo
 * sha256 do conteúdo) e cada transação (pela impressão digital).
 *
 * Devolve sempre o relatório completo — quantas entraram, quantas já
 * existiam e quantas foram REJEITADAS COM MOTIVO. Importação que engole
 * linha ruim em silêncio é pior do que importação que falha.
 */
function importar({ entidadeId, contaBancariaId, conteudo, fonte = '', formato = 'csv', mapa = {} }) {
  const entidade = repo.entidadePorId(entidadeId);
  if (!entidade) throw new ErroDeImportacao('Empresa não encontrada.');
  const cb = repo.contaBancaria(contaBancariaId);
  if (!cb) throw new ErroDeImportacao('Conta bancária não encontrada.');
  if (cb.entidade_id !== entidadeId) throw new ErroDeImportacao('A conta bancária é de outra empresa.');

  const texto = String(conteudo || '');
  if (!texto.trim()) throw new ErroDeImportacao('Arquivo vazio.');
  const arquivoHash = crypto.createHash('sha256').update(texto).digest('hex');

  const jaImportado = repo.importacaoPorHash(contaBancariaId, arquivoHash);
  if (jaImportado) {
    return {
      importacao: jaImportado, reimportacao: true,
      resumo: { lidas: jaImportado.linhas_lidas, novas: 0, duplicadas: jaImportado.linhas_lidas, rejeitadas: jaImportado.linhas_rejeitadas },
      aviso: 'Este arquivo já foi importado — nada foi duplicado.',
    };
  }

  let registros;
  // O formato declarado pelo cliente é palpite: `.ofx` chega como "csv"
  // quando o usuário só escolhe o arquivo. O conteúdo decide.
  if (pareceOfx(texto)) {
    registros = lerOfx(texto);
    if (!registros.length) throw new ErroDeImportacao('Arquivo OFX sem lançamentos (`<STMTTRN>`).');
  } else if (formato === 'json') {
    const dados = j.parse(texto, null);
    if (!Array.isArray(dados)) throw new ErroDeImportacao('JSON precisa ser uma lista de transações.');
    registros = dados.map((d, i) => {
      const data = normalizarData(d.data);
      if (!data) return { erro: `item ${i + 1}: data ilegível` };
      try {
        const valorCents = typeof d.valorCents === 'number' ? dinheiro.centavos(d.valorCents, 'valorCents') : dinheiro.paraCentavos(d.valor, 'valor');
        if (valorCents === 0) return { erro: `item ${i + 1}: valor zero` };
        return {
          data, valorCents,
          descricao: String(d.descricao || '').slice(0, 300),
          documento: String(d.documento || '').slice(0, 100),
          contraparteNome: String(d.contraparte || '').slice(0, 200),
          bruto: d,
        };
      } catch (e) { return { erro: `item ${i + 1}: ${e.message}` }; }
    });
  } else {
    const { linhas } = lerCsv(texto);
    if (linhas.length < 2) throw new ErroDeImportacao('O arquivo não tem cabeçalho e ao menos uma linha.');
    const colunas = mapearColunas(linhas[0], mapa);
    if (colunas.data < 0) throw new ErroDeImportacao('Não encontrei a coluna de data. Informe o mapa de colunas.');
    if (colunas.valor < 0 && colunas.debito < 0 && colunas.credito < 0) {
      throw new ErroDeImportacao('Não encontrei coluna de valor (nem de débito/crédito). Informe o mapa de colunas.');
    }
    registros = linhas.slice(1).map((l, i) => normalizarLinha(l, colunas, i + 2));
  }

  const rejeitos = registros.filter(r => r.erro).map(r => r.erro).slice(0, 200);
  const validos = registros.filter(r => !r.erro);

  // Posição da combinação idêntica dentro deste lote — a chave da dedupe.
  const ocorrencias = new Map();
  for (const t of validos) {
    // Quando o banco dá um identificador próprio (FITID do OFX), ele vence:
    // a dedupe passa a ser EXATA, e não depende da posição da linha. Isso
    // torna a reimportação de um arquivo maior — ou fora de ordem —
    // idempotente de verdade. Sem FITID, vale a posição da linha idêntica
    // dentro do lote, que é o que permite duas compras iguais no mesmo dia.
    if (t.idBanco) {
      t.fingerprint = crypto.createHash('sha256')
        .update(['fitid', contaBancariaId, t.idBanco].join('|')).digest('hex').slice(0, 32);
      continue;
    }
    const chave = [t.data, t.valorCents, semAcento(t.descricao), semAcento(t.documento)].join('|');
    const n = (ocorrencias.get(chave) || 0) + 1;
    ocorrencias.set(chave, n);
    t.fingerprint = impressaoDigital(t, n);
  }

  return transacao(() => {
    const imp = repo.criarImportacao({
      entidadeId, contaBancariaId, formato, fonte: String(fonte || '').slice(0, 200),
      arquivoHash, linhasLidas: registros.length, linhasRejeitadas: rejeitos.length, rejeitos,
    });

    let novas = 0, duplicadas = 0;
    const criadas = [];
    for (const t of validos) {
      if (repo.transacaoPorFingerprint(contaBancariaId, t.fingerprint)) { duplicadas++; continue; }
      const criada = repo.inserirTransacao({
        entidadeId, contaBancariaId, importacaoId: imp.id,
        data: t.data, valorCents: t.valorCents, descricao: t.descricao,
        documento: t.documento, contraparteNome: t.contraparteNome,
        fingerprint: t.fingerprint, bruto: t.bruto,
      });
      criadas.push(criada);
      novas++;
    }

    repo.exec(`UPDATE fin_importacoes SET linhas_novas = :novas, linhas_duplicadas = :dup
                WHERE tenant_id = :tenant AND id = :id`, { id: imp.id, novas, dup: duplicadas });

    auditoria.registrar('transacao.importar', {
      objetoTipo: 'importacao', objetoId: imp.id,
      motivo: fonte || 'importação de extrato',
      detalhe: { conta_bancaria: contaBancariaId, lidas: registros.length, novas, duplicadas, rejeitadas: rejeitos.length, arquivo_hash: arquivoHash },
    });

    // Sugestão automática é nível 1 (reversível, não contabiliza nada).
    for (const t of criadas) {
      try { classificacao.sugerirPara(t); } catch (_) { /* sugerir é melhor esforço */ }
    }

    return {
      importacao: repo.importacao(imp.id),
      reimportacao: false,
      resumo: { lidas: registros.length, novas, duplicadas, rejeitadas: rejeitos.length },
      rejeitos,
    };
  });
}

/**
 * Desfaz uma importação (nível 3). Só remove transação que ainda NÃO
 * virou lançamento — o que já está no razão se corrige por estorno, nunca
 * apagando. Devolve o que não pôde ser removido, com o motivo.
 */
function desfazerImportacao(importacaoId, { motivo }) {
  if (!String(motivo || '').trim()) throw new ErroDeImportacao('Desfazer importação exige motivo.');
  const imp = repo.importacao(importacaoId);
  if (!imp) throw new ErroDeImportacao('Importação não encontrada.');

  return transacao(() => {
    const ligadas = repo.q(
      'SELECT * FROM fin_transacoes_banco WHERE tenant_id = :tenant AND importacao_id = :imp',
      { imp: importacaoId });
    const contabilizadas = ligadas.filter(t => t.lote_id);
    const removiveis = ligadas.filter(t => !t.lote_id);
    for (const t of removiveis) {
      repo.exec('DELETE FROM fin_transacoes_banco WHERE tenant_id = :tenant AND id = :id', { id: t.id });
    }
    auditoria.registrar('importacao.desfazer', {
      objetoTipo: 'importacao', objetoId: importacaoId, motivo,
      detalhe: { removidas: removiveis.length, mantidas_por_estarem_no_razao: contabilizadas.length },
    });
    return {
      removidas: removiveis.length,
      mantidas: contabilizadas.map(t => ({ id: t.id, data: t.data, valor_cents: t.valor_cents, lote_id: t.lote_id })),
      aviso: contabilizadas.length
        ? `${contabilizadas.length} transação(ões) já estão no razão e foram mantidas — corrija por estorno do lote.`
        : '',
    };
  });
}

// ---------------------------------------------------------- conciliação

/**
 * Concilia uma transação: gera o lote balanceado no razão e amarra os
 * dois lados. Débito e crédito saem do SINAL da transação — entrada
 * credita a receita e debita o banco; saída faz o inverso.
 *
 * Idempotente pela impressão digital: conciliar duas vezes devolve o
 * mesmo lote.
 */
function conciliar(transacaoId, { contaId, centroCustoId = '', contraparteId = '', memo = '' } = {}) {
  const t = repo.transacao(transacaoId);
  if (!t) throw new ErroDeImportacao('Transação não encontrada.');
  if (t.lote_id) {
    return { lote: repo.lotePorId(t.lote_id), transacao: t, duplicado: true };
  }
  if (t.status === 'ignorada') throw new ErroDeImportacao('Esta transação foi marcada como ignorada. Reative antes de conciliar.');

  const cb = repo.contaBancaria(t.conta_bancaria_id);
  if (!cb) throw new ErroDeImportacao('Conta bancária da transação não existe mais.');
  if (!cb.conta_id) throw new ErroDeImportacao(`A conta bancária "${cb.nome}" não está ligada a uma conta contábil.`);

  const entrada = t.valor_cents > 0;
  const valor = Math.abs(t.valor_cents);
  const destino = contaId
    ? repo.contaPorId(contaId)
    : planoContas.chave(t.entidade_id, entrada ? 'entradaAClassificar' : 'saidaAClassificar');
  if (!destino) throw new ErroDeImportacao('Conta de destino não encontrada.');

  const contaBanco = repo.contaPorId(cb.conta_id);
  if (!contaBanco) throw new ErroDeImportacao('A conta contábil da conta bancária não existe.');

  const linhaBanco = { contaId: contaBanco.id, refTipo: 'transacao_banco', refId: t.id, memo: t.descricao };
  const linhaDestino = { contaId: destino.id, centroCustoId, contraparteId, refTipo: 'transacao_banco', refId: t.id, memo: memo || t.descricao };
  if (entrada) { linhaBanco.debitoCents = valor; linhaDestino.creditoCents = valor; }
  else { linhaBanco.creditoCents = valor; linhaDestino.debitoCents = valor; }

  const r = ledger.lancar({
    entidadeId: t.entidade_id,
    data: t.data,
    memo: (memo || t.descricao || 'Conciliação bancária').slice(0, 300),
    origem: 'banco',
    origemRef: t.id,
    idempotencia: `banco:${t.conta_bancaria_id}:${t.fingerprint}`,
    linhas: [linhaBanco, linhaDestino],
  });

  const atualizada = repo.atualizarTransacao(t.id, { status: 'conciliada', lote_id: r.lote.id });

  // Aprendizado: a regra que sugeriu acertou (ou não) — é o que faz a
  // taxa de conciliação automática subir com o uso.
  const sugestao = j.parse(t.sugestao, {});
  if (sugestao.regraId) {
    repo.registrarAcertoRegra(sugestao.regraId, sugestao.contaId === destino.id);
  }

  auditoria.registrar('transacao.conciliar', {
    objetoTipo: 'transacao_banco', objetoId: t.id,
    motivo: memo || '',
    detalhe: { lote_id: r.lote.id, conta: destino.codigo, valor_cents: t.valor_cents, sugerida: !!sugestao.contaId, aceitou_sugestao: sugestao.contaId === destino.id },
  });

  return { lote: r.lote, linhas: r.linhas, transacao: atualizada, duplicado: r.duplicado };
}

/** Marca como ignorada (tarifa já lançada por outra via, estorno espelho). */
function ignorar(transacaoId, { motivo }) {
  if (!String(motivo || '').trim()) throw new ErroDeImportacao('Ignorar uma transação exige motivo.');
  const t = repo.transacao(transacaoId);
  if (!t) throw new ErroDeImportacao('Transação não encontrada.');
  if (t.lote_id) throw new ErroDeImportacao('Transação já conciliada — corrija por estorno do lote.');
  const atualizada = repo.atualizarTransacao(transacaoId, { status: 'ignorada', ignorada_motivo: String(motivo).slice(0, 300) });
  auditoria.registrar('transacao.ignorar', {
    objetoTipo: 'transacao_banco', objetoId: transacaoId, motivo,
    detalhe: { data: t.data, valor_cents: t.valor_cents, descricao: t.descricao },
  });
  return atualizada;
}

/**
 * Painel de conciliação: saldo do extrato × saldo do razão para a conta
 * bancária, e a diferença explicada pelo que ainda não foi conciliado.
 */
function painel(entidadeId, contaBancariaId, { ate = hojeISO() } = {}) {
  const cb = repo.contaBancaria(contaBancariaId);
  if (!cb) throw new ErroDeImportacao('Conta bancária não encontrada.');

  const extrato = repo.um(
    `SELECT COALESCE(SUM(valor_cents),0) AS total, COUNT(*) AS n
       FROM fin_transacoes_banco
      WHERE tenant_id = :tenant AND conta_bancaria_id = :cb AND data <= :ate AND status <> 'ignorada'`,
    { cb: contaBancariaId, ate }) || { total: 0, n: 0 };

  const pendentes = repo.um(
    `SELECT COALESCE(SUM(valor_cents),0) AS total, COUNT(*) AS n
       FROM fin_transacoes_banco
      WHERE tenant_id = :tenant AND conta_bancaria_id = :cb AND data <= :ate
        AND status IN ('nova','sugerida','aguardando_aprovacao')`,
    { cb: contaBancariaId, ate }) || { total: 0, n: 0 };

  const saldoRazao = cb.conta_id ? ledger.saldo(cb.conta_id, { ate }).saldoCents : 0;
  const saldoExtrato = cb.saldo_inicial_cents + extrato.total;
  const esperado = saldoExtrato - pendentes.total;
  const diferenca = saldoRazao - esperado;

  return {
    contaBancaria: { id: cb.id, nome: cb.nome, banco: cb.banco },
    ate,
    saldoExtratoCents: saldoExtrato,
    saldoRazaoCents: saldoRazao,
    pendentesCents: pendentes.total,
    pendentesQtd: pendentes.n,
    transacoesQtd: extrato.n,
    diferencaCents: diferenca,
    conciliado: diferenca === 0,
    // A frase que o usuário lê. Diferença zero com pendências é normal —
    // significa "tudo o que foi conciliado bate; falta conciliar o resto".
    explicacao: diferenca === 0
      ? (pendentes.n ? `Bate. Faltam ${pendentes.n} transação(ões) por conciliar (${dinheiro.formatar(pendentes.total)}).` : 'Bate integralmente.')
      : `Divergência de ${dinheiro.formatar(diferenca)} entre o razão e o extrato — investigue lançamentos manuais na conta do banco.`,
  };
}

module.exports = {
  ErroDeImportacao, importar, desfazerImportacao, conciliar, ignorar, painel,
  lerCsv, lerOfx, pareceOfx, mapearColunas, normalizarData, normalizarLinha, impressaoDigital, semAcento,
};
