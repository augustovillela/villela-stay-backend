// =====================================================================
// Villela Finance — casar a linha do extrato com a PARCELA do título.
//
// É a metade que faltava do problema do aging. A importação do extrato
// resolve o saldo (o dinheiro aparece no razão); o "vencido" só cai
// quando alguém liquida a parcela. Sem esta ponte, o sistema mostrava
// 97,8% a receber vencido tendo o dinheiro na conta.
//
// Três regras que valem mais que a precisão do casamento:
//
//   1. **Nada é liquidado sozinho.** Isto sugere; quem decide é gente.
//      Baixar título de terceiro por heurística é o tipo de automação de
//      que se arrepende — e o estrago (parcela errada baixada) só aparece
//      na cobrança, semanas depois.
//   2. **Todo candidato diz POR QUE apareceu**, com os fatos: valor, dias
//      de diferença, nome que bateu, documento encontrado. Score sem
//      motivo é palpite com número.
//   3. **O que o banco moveu é o que a contabilidade registra.** A soma
//      valor + juros + multa − desconto tem de bater EXATAMENTE com o
//      valor da transação. Se não bater, o extrato e o razão passam a
//      contar histórias diferentes, e a conciliação para de significar
//      alguma coisa.
// =====================================================================
'use strict';
const repo = require('./repo');
const liquidacoes = require('./liquidacoes');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');

class ErroDeCasamento extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDeCasamento'; this.status = 400; this.detalhe = detalhe || null; }
}

const PONTOS_MINIMOS = 30;      // abaixo disso não vale mostrar
const ALTA_CONFIANCA = 80;      // acima disso a tela destaca

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const retidoTotalDe = (r) => Object.values(r || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const dias = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/** Palavras com 4+ letras, sem os ruídos que aparecem em todo extrato. */
const RUIDO = new Set(['pagamento', 'recebido', 'recebida', 'enviado', 'transferencia', 'pix', 'ted', 'doc',
  'boleto', 'cobranca', 'credito', 'debito', 'conta', 'banco', 'ltda', 'mei', 'eireli', 'sociedade', 'anonima']);
const palavras = (s) => semAcento(s).split(/[^a-z0-9]+/).filter(p => p.length >= 4 && !RUIDO.has(p));

/** Quantas palavras distintivas do nome aparecem no texto do extrato. */
function nomeBate(nomeContraparte, textoExtrato) {
  const alvo = palavras(nomeContraparte);
  if (!alvo.length) return { bate: false, palavras: [] };
  const texto = semAcento(textoExtrato);
  const achadas = alvo.filter(p => texto.includes(p));
  return { bate: achadas.length > 0, palavras: achadas, proporcao: achadas.length / alvo.length };
}

/**
 * Candidatos para uma transação bancária, com pontuação e o porquê.
 * Exige contexto de tenant e entidade (chamado de dentro da rota).
 */
function candidatos(transacao, { limite = 5 } = {}) {
  if (!transacao) throw new ErroDeCasamento('Transação não encontrada.');
  const valor = Number(transacao.valor_cents) || 0;
  if (!valor) return { candidatos: [], motivo: 'transação de valor zero' };

  // Entrada procura recebível; saída procura conta a pagar. Nunca o inverso.
  const especie = valor > 0 ? 'receber' : 'pagar';
  const alvo = Math.abs(valor);
  const texto = `${transacao.descricao || ''} ${transacao.contraparte_nome || ''} ${transacao.documento || ''}`;

  const abertas = repo.parcelasAbertasParaCasamento(transacao.entidade_id, especie);
  const achados = [];

  for (const p of abertas) {
    const saldo = p.valor_cents - p.pago_cents;
    if (saldo <= 0) continue;

    let pontos = 0;
    const motivos = [];

    // ---- valor: o sinal mais forte, e o único que sozinho já vale muito
    if (saldo === alvo) { pontos += 55; motivos.push(`valor idêntico ao saldo da parcela (${dinheiro.formatar(saldo)})`); }
    else if (p.valor_cents === alvo) { pontos += 45; motivos.push(`valor idêntico ao da parcela (${dinheiro.formatar(p.valor_cents)})`); }
    else if (alvo > saldo && alvo - saldo <= Math.max(500, Math.round(saldo * 0.1))) {
      pontos += 30; motivos.push(`valor ${dinheiro.formatar(alvo - saldo)} acima do saldo — compatível com juros ou multa`);
    } else if (alvo < saldo) {
      pontos += 12; motivos.push(`valor menor que o saldo — seria baixa parcial de ${dinheiro.formatar(alvo)}`);
    } else {
      continue;                       // muito acima do saldo: não é esta parcela
    }

    // ---- data: quanto mais perto do vencimento, melhor
    const d = Math.abs(dias(transacao.data, p.vencimento));
    if (d === 0) { pontos += 20; motivos.push('mesmo dia do vencimento'); }
    else if (d <= 3) { pontos += 15; motivos.push(`${d} dia(s) do vencimento`); }
    else if (d <= 10) { pontos += 8; motivos.push(`${d} dias do vencimento`); }
    else if (d <= 45) { pontos += 2; motivos.push(`${d} dias do vencimento`); }
    else { pontos -= 10; motivos.push(`${d} dias do vencimento — distante`); }

    // ---- nome da contraparte no texto do extrato
    const n = nomeBate(p.contraparte_nome, texto);
    if (n.bate) {
      const ganho = n.proporcao >= 0.6 ? 25 : 15;
      pontos += ganho;
      motivos.push(`o extrato cita "${n.palavras.join(' ')}" — ${p.contraparte_nome}`);
    }

    // ---- documento do título dentro do texto
    const doc = semAcento(p.documento);
    if (doc && doc.length >= 4 && semAcento(texto).includes(doc)) {
      pontos += 30; motivos.push(`o extrato traz o documento ${p.documento}`);
    }

    if (pontos < PONTOS_MINIMOS) continue;
    achados.push({
      parcelaId: p.id, tituloId: p.titulo_id, numero: p.numero,
      especie, vencimento: p.vencimento, documento: p.documento || '',
      descricao: p.descricao || '', contraparte: p.contraparte_nome || '',
      saldoCents: saldo, saldo: dinheiro.formatar(saldo),
      pontos: Math.min(100, pontos),
      alta: pontos >= ALTA_CONFIANCA,
      motivos,
    });
  }

  achados.sort((a, b) => b.pontos - a.pontos || Math.abs(dias(transacao.data, a.vencimento)) - Math.abs(dias(transacao.data, b.vencimento)));

  // Empate no topo é informação, não detalhe: duas parcelas igualmente
  // prováveis significam que NINGUÉM deveria baixar no automático.
  const topo = achados.slice(0, limite);
  const empatado = topo.length > 1 && topo[0].pontos === topo[1].pontos;
  return {
    especie, valorCents: valor,
    candidatos: topo,
    empatado,
    aviso: empatado ? 'Dois candidatos com a mesma pontuação — confira antes de baixar.' : '',
    natureza: 'Sugestão determinística por valor, data, nome e documento. Nenhuma baixa acontece sozinha.',
  };
}

/**
 * Liquida a parcela USANDO esta transação e amarra as duas: a transação
 * fica conciliada apontando para o mesmo lote da liquidação. Um lote só —
 * criar um segundo lançamento pela conciliação duplicaria o dinheiro.
 */
function liquidarPelaTransacao(transacao, { parcelaId, valorCents, jurosCents, multaCents, descontoCents, retencoes: retencoesInformadas, meio, observacao } = {}) {
  if (!transacao) throw new ErroDeCasamento('Transação não encontrada.');
  if (transacao.status === 'conciliada') throw new ErroDeCasamento('Esta transação já está conciliada.');
  if (!parcelaId) throw new ErroDeCasamento('Escolha a parcela a baixar.');

  const movimentoBanco = Math.abs(Number(transacao.valor_cents) || 0);
  if (!movimentoBanco) throw new ErroDeCasamento('Transação de valor zero.');

  const alvo = repo.parcelasAbertasParaCasamento(transacao.entidade_id, transacao.valor_cents > 0 ? 'receber' : 'pagar')
    .find(p => p.id === parcelaId);
  if (!alvo) {
    throw new ErroDeCasamento(
      'A parcela não está em aberto nesta empresa, ou é de espécie diferente da do movimento ' +
      '(entrada do extrato só baixa contas a receber; saída, só contas a pagar).');
  }
  const saldo = alvo.valor_cents - alvo.pago_cents;

  // Padrões que já satisfazem a invariante: sobra vira juros, falta vira
  // baixa parcial. Quem quiser outro arranjo informa os campos.
  let valor = valorCents == null ? Math.min(movimentoBanco, saldo) : Number(valorCents);
  let juros = jurosCents == null ? (movimentoBanco > saldo ? movimentoBanco - saldo : 0) : Number(jurosCents);
  // Com retenção informada, o padrão do valor muda: o banco moveu menos
  // justamente porque parte virou imposto retido.
  if (valorCents == null && retencoesInformadas) valor = Math.min(movimentoBanco + retidoTotalDe(retencoesInformadas), saldo);
  const multa = Number(multaCents || 0);
  const desconto = Number(descontoCents || 0);
  // Retenção reduz o que o banco move, sem reduzir o que a parcela quita.
  // Fora da invariante, um recebimento com IRRF retido seria recusado por
  // "não fecha" — sendo que ele fecha, só que com uma perna a mais.
  const retencoes = retencoesInformadas || {};
  const retidoTotal = Object.values(retencoes).reduce((s, v) => s + (Number(v) || 0), 0);

  const movimentado = valor + juros + multa - desconto - retidoTotal;
  if (movimentado !== movimentoBanco) {
    throw new ErroDeCasamento(
      `A baixa movimenta ${dinheiro.formatar(movimentado)}, mas o extrato movimentou ${dinheiro.formatar(movimentoBanco)}. ` +
      'Ajuste valor, juros, multa ou desconto até fechar — se não fechar, o extrato e o razão passam a contar histórias diferentes.',
      { movimentadoCents: movimentado, extratoCents: movimentoBanco, diferencaCents: movimentado - movimentoBanco });
  }

  const r = liquidacoes.liquidar({
    parcelaId, data: transacao.data,
    valorCents: valor, jurosCents: juros, multaCents: multa, descontoCents: desconto, retencoes,
    contaBancariaId: transacao.conta_bancaria_id, meio: meio || '',
    observacao: observacao || 'baixa a partir do extrato',
    idempotencia: `extrato:${transacao.id}:${parcelaId}`,
  });

  repo.atualizarTransacao(transacao.id, { status: 'conciliada', lote_id: r.lote.id });
  auditoria.registrar('transacao.liquidar_titulo', {
    objetoTipo: 'transacao', objetoId: transacao.id,
    motivo: observacao || 'baixa de título a partir do extrato',
    detalhe: { parcelaId, loteId: r.lote.id, valorCents: valor, jurosCents: juros, extratoCents: movimentoBanco },
  });

  return {
    ok: true, liquidacaoId: r.liquidacaoId, loteId: r.lote.id,
    aplicado: { valorCents: valor, jurosCents: juros, multaCents: multa, descontoCents: desconto, retencoes },
    movimentadoCents: movimentado,
    parcela: { id: parcelaId, saldoAnteriorCents: saldo, saldoNovoCents: saldo - valor },
  };
}

module.exports = {
  ErroDeCasamento, PONTOS_MINIMOS, ALTA_CONFIANCA,
  candidatos, liquidarPelaTransacao, nomeBate, palavras,
};
