// =====================================================================
// Villela Finance — política de retenção e descarte.
//
// A regra que organiza este arquivo: **o razão nunca é descartado**.
// Lançamento, linha, título e trilha de auditoria ficam. O que se
// descarta é o ACESSÓRIO — o que foi guardado por conveniência
// operacional e não por obrigação contábil.
//
// Descarte é irreversível e o risco de errar é alto demais para ser
// automático por padrão. Por isso:
//
//   • o modo padrão é SIMULAR: conta o que seria apagado e não apaga;
//   • para apagar de verdade é preciso `aplicar: true` explícito;
//   • o worker NUNCA apaga sozinho a menos que `FINANCE_RETENCAO=on`;
//   • tudo o que for apagado entra na auditoria, com a contagem.
//
// Um sistema que apaga dado financeiro sozinho, em silêncio, é pior do
// que um que acumula.
// =====================================================================
'use strict';
const { transacao, nowISO } = require('./db');
const repo = require('./repo');
const auditoria = require('./auditoria');

const DIA = 86400000;
const meses = (n) => n * 30 * DIA;

/**
 * Cada regra diz o que apaga, depois de quanto tempo e POR QUE pode ser
 * apagada. A coluna `porque` não é comentário: é o que um encarregado de
 * dados precisa ler para aprovar a política.
 */
const REGRAS = [
  {
    id: 'interessados-sem-conversao',
    o_que: 'Cadastro de quem pediu para ser avisado da abertura comercial',
    prazo: meses(24),
    base: 'consentimento (LGPD art. 7º, I)',
    porque: 'A finalidade era avisar de um lançamento. Passados dois anos sem conversão, a finalidade se esgotou e o consentimento não sustenta mais a guarda.',
    contar: () => repo.q(
      'SELECT COUNT(*) AS n FROM fin_interessados WHERE criado_em < :corte', { corte: corte(meses(24)) })[0].n,
    apagar: () => repo.exec(
      'DELETE FROM fin_interessados WHERE criado_em < :corte', { corte: corte(meses(24)) }).changes,
    global: true,     // não é por tenant: a landing é da plataforma
  },
  {
    id: 'linha-bruta-do-extrato',
    o_que: 'A linha ORIGINAL do arquivo do banco (`bruto`), depois de conciliada',
    prazo: meses(60),
    base: 'legítimo interesse — proveniência',
    porque: 'Serve para provar de onde veio o lançamento. Passados cinco anos (prazo decadencial tributário), o lançamento e a auditoria já bastam, e o texto bruto pode conter nome de terceiro sem finalidade viva.',
    contar: () => repo.q(
      `SELECT COUNT(*) AS n FROM fin_transacoes_banco
        WHERE tenant_id = :tenant AND status = 'conciliada' AND bruto <> '{}' AND criado_em < :corte`,
      { corte: corte(meses(60)) })[0].n,
    apagar: () => repo.exec(
      `UPDATE fin_transacoes_banco SET bruto = '{}'
        WHERE tenant_id = :tenant AND status = 'conciliada' AND bruto <> '{}' AND criado_em < :corte`,
      { corte: corte(meses(60)) }).changes,
  },
  {
    id: 'eventos-processados',
    o_que: 'Eventos do outbox já processados',
    prazo: meses(6),
    base: 'operacional',
    porque: 'Fila interna. Depois de processado o evento não tem valor probatório — quem guarda o fato é a auditoria.',
    contar: () => repo.q(
      "SELECT COUNT(*) AS n FROM fin_eventos WHERE tenant_id = :tenant AND status = 'processado' AND criado_em < :corte",
      { corte: corte(meses(6)) })[0].n,
    apagar: () => repo.exec(
      "DELETE FROM fin_eventos WHERE tenant_id = :tenant AND status = 'processado' AND criado_em < :corte",
      { corte: corte(meses(6)) }).changes,
  },
  {
    id: 'rejeitos-de-importacao',
    o_que: 'O texto das linhas rejeitadas na importação de extrato',
    prazo: meses(24),
    base: 'operacional',
    porque: 'Existe para o usuário corrigir o arquivo. Passados dois anos, a importação foi refeita ou abandonada; o texto pode conter dado de terceiro.',
    contar: () => repo.q(
      "SELECT COUNT(*) AS n FROM fin_importacoes WHERE tenant_id = :tenant AND rejeitos <> '[]' AND criado_em < :corte",
      { corte: corte(meses(24)) })[0].n,
    apagar: () => repo.exec(
      "UPDATE fin_importacoes SET rejeitos = '[]' WHERE tenant_id = :tenant AND rejeitos <> '[]' AND criado_em < :corte",
      { corte: corte(meses(24)) }).changes,
  },
];

/** O que NUNCA é descartado, e por quê. Vai na resposta, de propósito. */
const NUNCA = [
  { o_que: 'Lançamentos e linhas do razão', porque: 'Obrigação de escrituração (LGPD art. 16, I). Correção é por estorno; eliminação de pessoa é por anonimização.' },
  { o_que: 'Trilha de auditoria', porque: 'Append-only por trigger e encadeada por hash. Apagar destrói a prova de integridade de tudo o que veio depois.' },
  { o_que: 'Títulos, parcelas e liquidações', porque: 'Substância do contas a pagar e receber; prazo prescricional e fiscal.' },
  { o_que: 'Plano de contas e períodos', porque: 'Sem eles o razão histórico deixa de ser interpretável.' },
  { o_que: 'Diário replicado', porque: 'É o backup. Apagar dele é apagar a capacidade de restaurar.' },
];

const corte = (idade) => new Date(Date.now() - idade).toISOString();

/**
 * Roda a política. `aplicar: false` (padrão) apenas CONTA — descarte é
 * irreversível, e o padrão de uma operação irreversível é não fazer.
 */
function executar({ aplicar = false } = {}) {
  const resultado = { quando: nowISO(), aplicado: !!aplicar, regras: [], total: 0, erros: [] };

  for (const regra of REGRAS) {
    try {
      const quantos = regra.contar();
      let apagados = 0;
      if (aplicar && quantos > 0) apagados = transacao(() => regra.apagar());
      resultado.regras.push({
        id: regra.id, o_que: regra.o_que,
        prazoMeses: Math.round(regra.prazo / meses(1)),
        base: regra.base, porque: regra.porque,
        elegiveis: quantos, apagados,
      });
      resultado.total += quantos;
    } catch (e) {
      resultado.erros.push({ regra: regra.id, erro: String(e.message).slice(0, 200) });
    }
  }

  if (aplicar && resultado.regras.some(r => r.apagados > 0)) {
    auditoria.registrar('retencao.aplicar', {
      objetoTipo: 'politica', objetoId: 'retencao',
      motivo: 'execução da política de retenção',
      detalhe: { regras: resultado.regras.map(r => ({ id: r.id, apagados: r.apagados })) },
    });
  }

  resultado.nuncaDescartado = NUNCA;
  resultado.aviso = aplicar
    ? 'Descarte aplicado e auditado. É irreversível.'
    : 'SIMULAÇÃO — nada foi apagado. Descarte é irreversível e não acontece por acidente.';
  return resultado;
}

/** O worker só apaga se alguém tiver dito explicitamente que pode. */
const automaticoLigado = () => String(process.env.FINANCE_RETENCAO || 'off').toLowerCase() === 'on';

module.exports = { REGRAS, NUNCA, executar, automaticoLigado, corte, meses };
