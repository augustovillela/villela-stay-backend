// =====================================================================
// Villela Finance — exportação integral e portabilidade.
//
// A landing promete, com estas palavras: "não retém o seu dado se você
// sair". Este arquivo é o que faz a frase ser verdade — e por isso ele
// existe ANTES do primeiro assinante pagante, não depois.
//
// Duas decisões que importam:
//
//   1. A exportação é LEITURA. Conta suspensa por inadimplência continua
//      exportando o próprio razão. Reter dado contábil de quem deve é
//      problema jurídico, não alavanca comercial — e o `entitlements`
//      nunca é consultado aqui.
//   2. O formato é aberto e AUTOSSUFICIENTE: o CSV do razão traz o código
//      e o nome da conta em cada linha, não só o id. Um export que só o
//      próprio sistema consegue reler não é portabilidade.
// =====================================================================
'use strict';
const { nowISO, j } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const tenancy = require('./tenancy');

/** Uma célula CSV segura: aspas duplicadas, campo sempre entre aspas. */
const celula = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
const linhaCsv = (campos) => campos.map(celula).join(';');

/**
 * Valor monetário no CSV: em CENTAVOS e também em reais com vírgula.
 * As duas colunas de propósito — a de centavos é a que reimporta sem
 * ambiguidade, a de reais é a que a pessoa lê no Excel.
 */
const dinheiroCsv = (cents) => [cents, (cents / 100).toFixed(2).replace('.', ',')];

/**
 * Razão completo em CSV, uma linha por LANÇAMENTO (não por lote): é o
 * grão que qualquer outro sistema contábil sabe importar.
 */
function razaoCsv(entidadeId, { desde = '', ate = '' } = {}) {
  const entidade = repo.entidadePorId(entidadeId);
  if (!entidade) throw Object.assign(new Error('Empresa não encontrada.'), { status: 404 });

  const linhas = repo.q(
    `SELECT b.numero, b.data, b.competencia, b.memo AS lote_memo, b.origem, b.origem_ref, b.status,
            b.estorno_de, b.estornado_por, b.contabilizado_em,
            c.codigo AS conta_codigo, c.nome AS conta_nome, c.natureza,
            l.debito_cents, l.credito_cents, l.memo, l.ref_tipo, l.ref_id,
            cc.codigo AS centro_codigo, cc.nome AS centro_nome,
            cp.nome AS contraparte_nome, cp.documento AS contraparte_doc
       FROM fin_linhas l
       JOIN fin_lotes b ON b.id = l.lote_id AND b.status <> 'rascunho'
       JOIN fin_contas c ON c.id = l.conta_id
       LEFT JOIN fin_centros_custo cc ON cc.id = l.centro_custo_id AND cc.tenant_id = l.tenant_id
       LEFT JOIN fin_contrapartes cp ON cp.id = l.contraparte_id AND cp.tenant_id = l.tenant_id
      WHERE l.tenant_id = :tenant AND b.entidade_id = :ent
        ${desde ? 'AND b.data >= :desde' : ''} ${ate ? 'AND b.data <= :ate' : ''}
      ORDER BY b.data, b.numero, l.ordem`,
    { ent: entidadeId, desde, ate });

  const cabecalho = [
    'lancamento', 'data', 'competencia', 'historico_do_lote', 'origem', 'origem_ref', 'status',
    'estorno_de', 'estornado_por', 'contabilizado_em',
    'conta_codigo', 'conta_nome', 'natureza',
    'debito_centavos', 'debito_reais', 'credito_centavos', 'credito_reais',
    'historico_da_linha', 'centro_codigo', 'centro_nome',
    'contraparte', 'contraparte_documento', 'referencia_tipo', 'referencia_id',
  ];

  const corpo = linhas.map(l => linhaCsv([
    l.numero, l.data, l.competencia, l.lote_memo, l.origem, l.origem_ref, l.status,
    l.estorno_de, l.estornado_por, l.contabilizado_em,
    l.conta_codigo, l.conta_nome, l.natureza,
    ...dinheiroCsv(l.debito_cents), ...dinheiroCsv(l.credito_cents),
    l.memo, l.centro_codigo || '', l.centro_nome || '',
    l.contraparte_nome || '', l.contraparte_doc || '', l.ref_tipo, l.ref_id,
  ]));

  const totalDeb = linhas.reduce((s, l) => s + l.debito_cents, 0);
  const totalCred = linhas.reduce((s, l) => s + l.credito_cents, 0);

  return {
    // BOM: sem ele o Excel em português abre o arquivo com acento quebrado,
    // e um export ilegível não é portabilidade.
    csv: '﻿' + [linhaCsv(cabecalho), ...corpo].join('\r\n') + '\r\n',
    linhas: linhas.length,
    totalDebitoCents: totalDeb,
    totalCreditoCents: totalCred,
    fecha: totalDeb === totalCred,
    empresa: entidade.nome,
  };
}

/**
 * Pacote completo, em JSON: tudo o que a conta tem, com o suficiente para
 * reconstruir em outro sistema. Inclui a CONFERÊNCIA do próprio export —
 * quem recebe não deveria ter de confiar, deveria poder verificar.
 */
function pacoteCompleto(entidadeId, { desde = '', ate = '' } = {}) {
  const entidade = repo.entidadePorId(entidadeId);
  if (!entidade) throw Object.assign(new Error('Empresa não encontrada.'), { status: 404 });
  const tenantId = tenancy.tenantAtual();
  const tenant = repo.tenantPorId(tenantId);

  const lotes = repo.listarLotes(entidadeId, { limite: 100000 })
    .filter(l => l.status !== 'rascunho')
    .filter(l => (!desde || l.data >= desde) && (!ate || l.data <= ate));

  const razao = lotes.map(lote => ({
    numero: lote.numero, id: lote.id, data: lote.data, competencia: lote.competencia,
    memo: lote.memo, origem: lote.origem, origemRef: lote.origem_ref, status: lote.status,
    estornoDe: lote.estorno_de, estornadoPor: lote.estornado_por, estornoMotivo: lote.estorno_motivo,
    totalCents: lote.total_cents,
    contabilizadoEm: lote.contabilizado_em, contabilizadoPor: lote.contabilizado_por,
    linhas: repo.linhasDoLote(lote.id).map(l => ({
      contaCodigo: l.conta_codigo, contaNome: l.conta_nome,
      debitoCents: l.debito_cents, creditoCents: l.credito_cents,
      centroCustoId: l.centro_custo_id, contraparteId: l.contraparte_id,
      memo: l.memo, refTipo: l.ref_tipo, refId: l.ref_id,
    })),
  }));

  const balanco = ledger.conferirBalanceamento(entidadeId);
  const cadeia = auditoria.verificarCadeia(tenantId);

  return {
    exportadoEm: nowISO(),
    conta: { slug: tenant.slug, nome: tenant.nome, documento: tenant.documento },
    empresa: {
      id: entidade.id, nome: entidade.nome, documento: entidade.documento,
      regime: entidade.regime, moeda: entidade.moeda, timezone: entidade.timezone,
    },
    intervalo: { desde: desde || '(desde o início)', ate: ate || '(até hoje)' },
    planoDeContas: repo.listarContas(entidadeId).map(c => ({
      codigo: c.codigo, nome: c.nome, natureza: c.natureza, saldoNormal: c.saldo_normal,
      aceitaLancamento: c.aceita_lancamento === 1, subledger: c.subledger, status: c.status,
    })),
    centrosDeCusto: repo.listarCentrosCusto(entidadeId).map(c => ({
      codigo: c.codigo, nome: c.nome, tipo: c.tipo, externoId: c.externo_id,
    })),
    // Dado bancário do favorecido NÃO vai no export: é dado sensível de
    // terceiro, e o dono do export é o assinante, não o fornecedor dele.
    contrapartes: repo.listarContrapartes(entidadeId).map(c => ({
      id: c.id, tipo: c.tipo, nome: c.nome, documento: c.documento,
      email: c.email, telefone: c.telefone, externoId: c.externo_id,
    })),
    periodos: repo.listarPeriodos(entidadeId).map(p => ({
      competencia: p.competencia, status: p.status,
      fechadoEm: p.fechado_em, fechadoPor: p.fechado_por,
      reabertoEm: p.reaberto_em, reaberturaMotivo: p.reabertura_motivo,
    })),
    contasBancarias: repo.listarContasBancarias(entidadeId).map(b => ({
      nome: b.nome, banco: b.banco, tipo: b.tipo,
      saldoInicialCents: b.saldo_inicial_cents, saldoInicialData: b.saldo_inicial_data,
    })),
    titulos: repo.q(
      `SELECT t.*, c.nome AS contraparte_nome FROM fin_titulos t
         LEFT JOIN fin_contrapartes c ON c.id = t.contraparte_id AND c.tenant_id = t.tenant_id
        WHERE t.tenant_id = :tenant AND t.entidade_id = :ent`, { ent: entidadeId })
      .map(t => ({
        id: t.id, especie: t.especie, contraparte: t.contraparte_nome || '',
        documento: t.documento, descricao: t.descricao, competencia: t.competencia,
        valorCents: t.valor_cents, status: t.status, origem: t.origem, origemRef: t.origem_ref,
        parcelas: repo.q(
          'SELECT numero, vencimento, valor_cents, pago_cents, status FROM fin_parcelas WHERE tenant_id = :tenant AND titulo_id = :t ORDER BY numero',
          { t: t.id }),
      })),
    extratoImportado: repo.listarTransacoes(entidadeId, { limite: 100000 }).map(t => ({
      data: t.data, valorCents: t.valor_cents, descricao: t.descricao, documento: t.documento,
      contraparte: t.contraparte_nome, status: t.status, loteId: t.lote_id,
      // A linha ORIGINAL do arquivo do banco vai junto: é a prova de
      // proveniência, e sem ela o export perde o rastro até a fonte.
      bruto: j.parse(t.bruto, null),
    })),
    razao,
    conferencia: {
      lotes: razao.length,
      linhas: razao.reduce((s, l) => s + l.linhas.length, 0),
      totalDebitoCents: balanco.debitoCents,
      totalCreditoCents: balanco.creditoCents,
      razaoFecha: balanco.ok,
      cadeiaDeAuditoriaIntegra: cadeia.ok,
      // Quem recebe pode conferir sem confiar: soma os débitos, soma os
      // créditos, compara com estes números.
      comoVerificar: 'Some debitoCents e creditoCents de todas as linhas de `razao`. Os dois totais têm de ser iguais entre si e iguais aos declarados aqui.',
    },
    formato: {
      versao: 1,
      dinheiro: 'inteiro em CENTAVOS (nunca ponto flutuante)',
      datas: 'ISO-8601',
      observacao: 'Dados bancários de favorecidos não são exportados: são dado sensível de terceiros.',
    },
  };
}

/** Resumo do que existe, para a tela dizer o tamanho antes de baixar. */
function inventario(entidadeId) {
  const conta = (sql, params) => repo.q(sql, params)[0].n;
  return {
    lotes: conta('SELECT COUNT(*) AS n FROM fin_lotes WHERE tenant_id = :tenant AND entidade_id = :ent', { ent: entidadeId }),
    linhas: conta(`SELECT COUNT(*) AS n FROM fin_linhas l JOIN fin_lotes b ON b.id = l.lote_id
                    WHERE l.tenant_id = :tenant AND b.entidade_id = :ent`, { ent: entidadeId }),
    contas: repo.listarContas(entidadeId).length,
    contrapartes: repo.listarContrapartes(entidadeId).length,
    titulos: conta('SELECT COUNT(*) AS n FROM fin_titulos WHERE tenant_id = :tenant AND entidade_id = :ent', { ent: entidadeId }),
    transacoesBanco: conta('SELECT COUNT(*) AS n FROM fin_transacoes_banco WHERE tenant_id = :tenant AND entidade_id = :ent', { ent: entidadeId }),
    periodos: repo.listarPeriodos(entidadeId).length,
    aviso: 'A exportação é leitura e está sempre disponível — inclusive com a assinatura suspensa.',
  };
}

module.exports = { razaoCsv, pacoteCompleto, inventario, celula, linhaCsv };
