// =====================================================================
// Villela Finance — apuração do resultado e balanço patrimonial.
//
// O problema que este arquivo resolve: contas de resultado (3 e 4) só
// zeram contra o patrimônio líquido quando ALGUÉM as transfere. Enquanto
// isso não acontece, um "balanço" que some só ativo, passivo e PL NÃO
// fecha — falta exatamente o lucro do período.
//
// Há duas maneiras honestas de lidar com isso, e o sistema faz as duas:
//
//   1. O BALANÇO mostra "Resultado do exercício" como linha calculada do
//      PL. Fecha sempre, sem exigir ritual, e é o que o gestor quer ver
//      no meio do ano.
//   2. A APURAÇÃO posta o lançamento de encerramento de verdade, zerando
//      as contas de resultado contra Lucros acumulados. É ação material
//      (nível 3) porque reescreve a leitura de um exercício inteiro.
//
// Sem a nº 1, o painel mentiria onze meses por ano. Sem a nº 2, o
// exercício nunca fecharia de verdade.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { transacao, nowISO } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const planoContas = require('./plano-contas');
const tenancy = require('./tenancy');

class ErroDeApuracao extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDeApuracao'; this.status = 400; this.detalhe = detalhe || null; }
}

const RE_COMP = /^\d{4}-\d{2}$/;
const ultimoDia = (competencia) => {
  const [a, m] = competencia.split('-').map(Number);
  return `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/**
 * Balanço patrimonial. `ate` é a data de corte.
 *
 * O "Resultado do exercício" é calculado (receitas − despesas do período
 * ainda não apurado) e entra no PL. Por construção, o balanço fecha: é a
 * mesma identidade do balancete, só reorganizada.
 */
function balanco(entidadeId, { ate, desdeExercicio } = {}) {
  const corte = ate || nowISO().slice(0, 10);
  const inicioExercicio = desdeExercicio || `${corte.slice(0, 4)}-01-01`;

  const todas = ledger.balancete(entidadeId, { ate: corte }).linhas;
  const patrimoniais = todas.filter(l => ['ativo', 'passivo', 'patrimonio'].includes(l.natureza));

  // Resultado do exercício corrente: só o que ainda não foi apurado.
  const doExercicio = ledger.balancete(entidadeId, { desde: inicioExercicio, ate: corte }).linhas
    .filter(l => ['receita', 'despesa'].includes(l.natureza));
  const receitas = doExercicio.filter(l => l.natureza === 'receita').reduce((s, l) => s + l.saldoCents, 0);
  const despesas = doExercicio.filter(l => l.natureza === 'despesa').reduce((s, l) => s + l.saldoCents, 0);
  const resultado = receitas - despesas;

  const grupo = (prefixos, natureza) => {
    const contas = patrimoniais.filter(l => l.natureza === natureza && prefixos.some(p => l.codigo.startsWith(p)));
    return {
      totalCents: contas.reduce((s, l) => s + l.saldoCents, 0),
      contas: contas.filter(l => l.saldoCents !== 0)
        .map(l => ({ contaId: l.contaId, codigo: l.codigo, nome: l.nome, valorCents: l.saldoCents })),
    };
  };

  const circulante = grupo(['1.1'], 'ativo');
  const naoCirculante = grupo(['1.2'], 'ativo');
  const passivoCirculante = grupo(['2.1'], 'passivo');
  const passivoNaoCirculante = grupo(['2.2'], 'passivo');
  const plContas = grupo(['2.3'], 'patrimonio');

  const ativo = circulante.totalCents + naoCirculante.totalCents;
  const passivo = passivoCirculante.totalCents + passivoNaoCirculante.totalCents;
  const pl = plContas.totalCents + resultado;

  return {
    ate: corte, exercicioDesde: inicioExercicio,
    ativo: {
      circulante, naoCirculante,
      totalCents: ativo, total: dinheiro.formatar(ativo),
    },
    passivo: {
      circulante: passivoCirculante, naoCirculante: passivoNaoCirculante,
      totalCents: passivo, total: dinheiro.formatar(passivo),
    },
    patrimonioLiquido: {
      contas: plContas.contas,
      resultadoDoExercicioCents: resultado,
      resultadoDoExercicio: dinheiro.formatar(resultado),
      totalCents: pl, total: dinheiro.formatar(pl),
    },
    // A prova: ativo = passivo + PL. Se der diferente, é bug — e aparece.
    diferencaCents: ativo - (passivo + pl),
    fecha: ativo === passivo + pl,
    origem: {
      formula: 'saldo das contas 1 (ativo), 2.1/2.2 (passivo) e 2.3 (PL), mais o resultado do exercício ainda não apurado',
      fonte: 'razão (lotes contabilizados)',
      observacao: resultado !== 0
        ? 'O resultado do exercício aparece no PL como linha calculada — ele só vira lançamento quando o exercício for apurado.'
        : '',
    },
  };
}

/**
 * Prévia da apuração: quais contas de resultado seriam zeradas e qual o
 * lucro (ou prejuízo) transferido. Não grava nada.
 */
function previaApuracao(entidadeId, { competencia, desde }) {
  if (!RE_COMP.test(String(competencia || ''))) throw new ErroDeApuracao('Competência inválida (use AAAA-MM).');
  const ate = ultimoDia(competencia);
  const inicio = desde || `${competencia.slice(0, 4)}-01-01`;

  const linhas = ledger.balancete(entidadeId, { desde: inicio, ate }).linhas
    .filter(l => ['receita', 'despesa'].includes(l.natureza) && l.saldoCents !== 0);
  const receitas = linhas.filter(l => l.natureza === 'receita').reduce((s, l) => s + l.saldoCents, 0);
  const despesas = linhas.filter(l => l.natureza === 'despesa').reduce((s, l) => s + l.saldoCents, 0);
  const resultado = receitas - despesas;

  return {
    competencia, desde: inicio, ate,
    contas: linhas.map(l => ({
      contaId: l.contaId, codigo: l.codigo, nome: l.nome,
      natureza: l.natureza, saldoCents: l.saldoCents, saldo: dinheiro.formatar(l.saldoCents),
    })),
    receitasCents: receitas, despesasCents: despesas,
    resultadoCents: resultado, resultado: dinheiro.formatar(resultado),
    tipo: resultado >= 0 ? 'lucro' : 'prejuízo',
    // Depois de apurar, o DRE do período volta a zero — é o efeito que
    // mais surpreende quem nunca fechou exercício.
    aviso: 'Depois de apurada, as contas de resultado do período ficam zeradas e o DRE deste intervalo passa a mostrar R$ 0,00. O histórico continua no razão.',
  };
}

/**
 * Executa a apuração: zera cada conta de resultado e joga a diferença em
 * Lucros ou prejuízos acumulados. Um único lote, balanceado.
 *
 * Chamar de novo com o período já apurado e nada novo lançado RECUSA, com
 * a mensagem de que não há saldo a apurar — que é mais útil do que um
 * "ok" silencioso. Se chegou lançamento novo depois da primeira apuração,
 * a segunda chamada apura só o incremento (ver a chave de idempotência
 * mais abaixo).
 */
function apurar(entidadeId, { competencia, desde, motivo }) {
  if (!String(motivo || '').trim()) throw new ErroDeApuracao('Apuração de resultado exige motivo.');
  const previa = previaApuracao(entidadeId, { competencia, desde });
  if (!previa.contas.length) {
    throw new ErroDeApuracao(`Não há saldo em conta de resultado entre ${previa.desde} e ${previa.ate} para apurar.`);
  }

  const acumulados = planoContas.chave(entidadeId, 'lucrosAcumulados');
  const linhas = previa.contas.map(c => {
    // Zerar = lançar do lado oposto ao saldo. Receita tem saldo credor →
    // debita; despesa tem saldo devedor → credita.
    const conta = repo.contaPorId(c.contaId);
    const devedora = conta.saldo_normal === 'devedora';
    const positivo = c.saldoCents > 0;
    const valor = Math.abs(c.saldoCents);
    // Saldo positivo numa conta devedora significa débito acumulado → credita.
    const creditar = devedora ? positivo : !positivo;
    return {
      contaId: c.contaId,
      debitoCents: creditar ? 0 : valor,
      creditoCents: creditar ? valor : 0,
      refTipo: 'apuracao', refId: `${entidadeId}:${competencia}`,
      memo: `Encerramento de ${c.codigo}`,
    };
  });
  linhas.push({
    contaId: acumulados.id,
    debitoCents: previa.resultadoCents < 0 ? -previa.resultadoCents : 0,
    creditoCents: previa.resultadoCents > 0 ? previa.resultadoCents : 0,
    refTipo: 'apuracao', refId: `${entidadeId}:${competencia}`,
    memo: `Resultado apurado (${previa.tipo})`,
  });

  // A chave inclui a IMPRESSÃO do que está sendo zerado, não só o período.
  //
  // Com uma chave só de período, uma segunda apuração legítima — quando
  // chegam lançamentos novos no mesmo intervalo depois de já ter apurado —
  // seria deduplicada: a função devolveria o lote antigo e diria que deu
  // certo, sem zerar coisa nenhuma. O saldo ficaria vivo nas contas de
  // resultado com o sistema afirmando o contrário.
  //
  // Com a impressão, o clique duplo (estado idêntico) dedupe, e a apuração
  // do incremento passa.
  const impressao = crypto.createHash('sha256')
    .update(previa.contas.map(c => `${c.contaId}:${c.saldoCents}`).sort().join('|'))
    .digest('hex').slice(0, 12);

  return transacao(() => {
    const r = ledger.lancar({
      entidadeId, data: previa.ate, competencia,
      memo: `Apuração do resultado ${previa.desde} a ${previa.ate} — ${previa.tipo} de ${previa.resultado}`.slice(0, 300),
      origem: 'fechamento', origemRef: `${entidadeId}:${competencia}`,
      idempotencia: `apuracao:${entidadeId}:${previa.desde}:${previa.ate}:${impressao}`,
      linhas,
    });
    if (!r.duplicado) {
      auditoria.registrar('resultado.apurar', {
        objetoTipo: 'apuracao', objetoId: `${entidadeId}:${competencia}`, motivo,
        detalhe: {
          desde: previa.desde, ate: previa.ate, contas_zeradas: previa.contas.length,
          resultado_cents: previa.resultadoCents, tipo: previa.tipo, lote_id: r.lote.id,
        },
      });
    }
    return { lote: r.lote, duplicado: r.duplicado, resultadoCents: previa.resultadoCents, tipo: previa.tipo, contasZeradas: previa.contas.length };
  });
}

/**
 * Consolidação multiempresa: soma o balanço e o resultado de várias
 * entidades da MESMA conta.
 *
 * ⚠️ Consolidação de verdade exige ELIMINAR as operações entre as
 * empresas do grupo (o que uma deve à outra não é dívida do grupo). Isso
 * depende de marcar contrapartes como intragrupo, o que ainda não existe
 * — por isso a resposta traz `eliminacoes: false` e diz o que falta, em
 * vez de apresentar uma soma simples como se fosse consolidado contábil.
 */
function consolidar({ entidadeIds, ate } = {}) {
  const ids = (entidadeIds && entidadeIds.length) ? entidadeIds : repo.listarEntidades().map(e => e.id);
  const empresas = ids.map(id => {
    const e = repo.entidadePorId(id);
    if (!e) throw new ErroDeApuracao(`Empresa ${id} não encontrada nesta conta.`);
    const b = balanco(id, { ate });
    return {
      entidadeId: id, nome: e.nome, documento: e.documento,
      ativoCents: b.ativo.totalCents, passivoCents: b.passivo.totalCents,
      plCents: b.patrimonioLiquido.totalCents,
      resultadoCents: b.patrimonioLiquido.resultadoDoExercicioCents,
      fecha: b.fecha,
    };
  });

  const soma = (campo) => empresas.reduce((s, e) => s + e[campo], 0);

  // ---- eliminações intragrupo -------------------------------------------
  // Só elimina o que ESTÁ MARCADO: contraparte apontando para outra empresa
  // desta conta. Adivinhar por nome ou CNPJ eliminaria operação com
  // terceiro homônimo, e um consolidado com receita apagada por engano é
  // pior do que um consolidado que declara não eliminar nada.
  const porPar = new Map();
  for (const id of ids) {
    for (const r of repo.saldosIntragrupo(id, { ate })) {
      // Só interessa o par que também está no escopo consolidado: operação
      // com empresa de fora do recorte não é intragrupo AQUI.
      if (!ids.includes(r.par)) continue;
      const chave = [id, r.par].join('>');
      const alvo = porPar.get(chave) || { de: id, para: r.par, ativoCents: 0, passivoCents: 0, receitaCents: 0, despesaCents: 0 };
      if (r.natureza === 'ativo') alvo.ativoCents += r.debito - r.credito;
      else if (r.natureza === 'passivo') alvo.passivoCents += r.credito - r.debito;
      else if (r.natureza === 'receita') alvo.receitaCents += r.credito - r.debito;
      else if (r.natureza === 'despesa') alvo.despesaCents += r.debito - r.credito;
      porPar.set(chave, alvo);
    }
  }

  const pares = [...porPar.values()];
  const positivo = (n) => Math.max(0, n);
  // O recebível de A contra B tem de espelhar a obrigação de B com A. O
  // que casa, elimina; a diferença NÃO é escondida — vira descasamento
  // declarado, porque é problema de conciliação entre as empresas.
  const somaPar = (campo) => pares.reduce((s, p) => s + positivo(p[campo]), 0);
  const ativoIntra = somaPar('ativoCents');
  const passivoIntra = somaPar('passivoCents');
  const receitaIntra = somaPar('receitaCents');
  const despesaIntra = somaPar('despesaCents');

  const elimSaldos = Math.min(ativoIntra, passivoIntra);
  const elimResultado = Math.min(receitaIntra, despesaIntra);
  const descasamentos = [];
  if (ativoIntra !== passivoIntra) {
    descasamentos.push({
      tipo: 'saldos_reciprocos',
      ativoCents: ativoIntra, passivoCents: passivoIntra, diferencaCents: ativoIntra - passivoIntra,
      texto: `O que uma empresa tem a receber da outra (${dinheiro.formatar(ativoIntra)}) não bate com o que a outra reconhece dever (${dinheiro.formatar(passivoIntra)}).`,
    });
  }
  if (receitaIntra !== despesaIntra) {
    descasamentos.push({
      tipo: 'resultado_reciproco',
      receitaCents: receitaIntra, despesaCents: despesaIntra, diferencaCents: receitaIntra - despesaIntra,
      texto: `A receita entre empresas (${dinheiro.formatar(receitaIntra)}) não bate com a despesa correspondente (${dinheiro.formatar(despesaIntra)}).`,
    });
  }

  const bruto = {
    ativoCents: soma('ativoCents'), passivoCents: soma('passivoCents'),
    plCents: soma('plCents'), resultadoCents: soma('resultadoCents'),
  };
  const consolidado = {
    ativoCents: bruto.ativoCents - elimSaldos,
    passivoCents: bruto.passivoCents - elimSaldos,
    plCents: bruto.plCents,
    resultadoCents: bruto.resultadoCents,     // receita e despesa iguais se anulam no resultado
  };

  return {
    ate: ate || nowISO().slice(0, 10),
    empresas,
    // `total` continua sendo a SOMA ARITMÉTICA, para não quebrar quem já lia.
    total: Object.assign({}, bruto, {
      ativo: dinheiro.formatar(bruto.ativoCents),
      resultado: dinheiro.formatar(bruto.resultadoCents),
    }),
    consolidado: Object.assign({}, consolidado, {
      ativo: dinheiro.formatar(consolidado.ativoCents),
      resultado: dinheiro.formatar(consolidado.resultadoCents),
    }),
    eliminacoes: {
      aplicadas: elimSaldos > 0 || elimResultado > 0,
      saldosReciprocosCents: elimSaldos,
      resultadoReciprocoCents: elimResultado,
      pares: pares.map(p => ({
        de: p.de, para: p.para,
        ativoCents: positivo(p.ativoCents), passivoCents: positivo(p.passivoCents),
        receitaCents: positivo(p.receitaCents), despesaCents: positivo(p.despesaCents),
      })),
      descasamentos,
    },
    origem: {
      formula: 'soma das empresas menos os saldos recíprocos marcados como intragrupo',
      fonte: 'razão + contrapartes com empresa do grupo indicada',
    },
    // O que este consolidado NÃO faz. Um consolidado que se apresenta como
    // completo sem sê-lo é pior do que um que declara o próprio limite.
    naoElimina: [
      'lucro não realizado em estoque ou em ativo transferido entre as empresas',
      'investimento de uma empresa no capital da outra contra o PL dela',
      'operação com empresa do grupo que NÃO esteja marcada na contraparte',
      'participação de não controladores',
    ],
    aviso: empresas.length > 1 && !pares.length
      ? 'Nenhuma contraparte está marcada como empresa do grupo — o consolidado é soma aritmética. Marque as contrapartes intragrupo para que a eliminação aconteça.'
      : '',
  };
}

module.exports = { ErroDeApuracao, balanco, previaApuracao, apurar, consolidar, ultimoDia };
