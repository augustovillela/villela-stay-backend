// =====================================================================
// Villela Finance — régua de cobrança.
//
// O aging e a lista de inadimplentes já existiam; o que faltava era a
// régua: dado o atraso, QUAL passo cabe hoje, para QUEM, com que texto.
//
// **Este módulo não envia nada.** Ele monta a fila e para. Enviar mensagem
// a cliente real é ação com consequência fora do sistema — a decisão do
// canal (WhatsApp oficial, e-mail), do tom e do momento é do dono, e um
// disparo automático que erra o destinatário ou cobra quem já pagou custa
// mais que todo o valor cobrado. Quem envia registra o envio aqui, e é
// esse registro que impede o mesmo passo de sair duas vezes.
//
// Duas coisas que a régua se recusa a fazer:
//   • **não cobra o que não é dela**: parcela liquidada, título cancelado
//     e conta de espécie "pagar" nunca entram;
//   • **não repete passo já registrado** para a mesma parcela — a lista
//     de hoje é o que falta, não o histórico inteiro.
// =====================================================================
'use strict';
const { novoId, nowISO, hojeISO } = require('./db');
const repo = require('./repo');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const tenancy = require('./tenancy');

class ErroDeCobranca extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDeCobranca'; this.status = 400; }
}

/**
 * Os passos, do mais gentil ao mais firme. `dias` é o atraso mínimo:
 * negativo é antes do vencimento (lembrete), zero é no dia.
 *
 * O texto é MODELO, não mensagem pronta para disparar: quem envia lê,
 * ajusta e assume. Sem `{{}}` mágico que ninguém revisa.
 */
const PASSOS = [
  { chave: 'lembrete', dias: -3, rotulo: 'Lembrete (3 dias antes)', tom: 'informativo',
    modelo: 'Olá, {nome}. Passando para lembrar que {documento} vence em {vencimento}, no valor de {saldo}. Qualquer dúvida, é só responder.' },
  { chave: 'vencimento', dias: 0, rotulo: 'No dia do vencimento', tom: 'informativo',
    modelo: 'Olá, {nome}. {documento} vence hoje, no valor de {saldo}. Se já tiver pago, desconsidere e me avise para eu dar baixa.' },
  { chave: 'atraso_3', dias: 3, rotulo: '3 dias de atraso', tom: 'cordial',
    modelo: 'Olá, {nome}. {documento} venceu em {vencimento} e consta em aberto ({saldo}). Pode ter sido só a baixa que não chegou até nós — pode conferir?' },
  { chave: 'atraso_10', dias: 10, rotulo: '10 dias de atraso', tom: 'firme',
    modelo: 'Olá, {nome}. {documento} está com {dias} dias de atraso, no valor de {saldo}. Consegue me dizer uma data para o pagamento?' },
  { chave: 'atraso_30', dias: 30, rotulo: '30 dias de atraso', tom: 'firme',
    modelo: 'Olá, {nome}. {documento} está vencido há {dias} dias ({saldo}). Preciso combinar com você uma solução antes de encaminhar para as medidas de cobrança.' },
  { chave: 'atraso_60', dias: 60, rotulo: '60 dias — decisão', tom: 'decisão',
    modelo: 'DECISÃO INTERNA: {nome} está com {saldo} vencidos há {dias} dias. Avaliar protesto, negativação ou acordo — e registrar a escolha.' },
];

const passoPorChave = (c) => PASSOS.find(p => p.chave === c) || null;
const diasEntre = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/** O passo mais avançado que o atraso já alcançou. */
function passoDe(diasAtraso) {
  let achado = null;
  for (const p of PASSOS) if (diasAtraso >= p.dias) achado = p;
  return achado;
}

const preencher = (modelo, d) => modelo
  .replace(/\{nome\}/g, d.nome || 'cliente')
  .replace(/\{documento\}/g, d.documento || 'a cobrança')
  .replace(/\{vencimento\}/g, d.vencimento.split('-').reverse().join('/'))
  .replace(/\{saldo\}/g, d.saldo)
  .replace(/\{dias\}/g, String(Math.max(0, d.diasAtraso)));

/**
 * A fila de hoje: uma linha por parcela que alcançou um passo ainda não
 * registrado. Exige contexto de tenant e entidade.
 */
function regua(entidadeId, { referencia = hojeISO(), limite = 200 } = {}) {
  const hoje = referencia;
  const abertas = repo.parcelasAbertasParaCasamento(entidadeId, 'receber');
  const jaFeitos = repo.passosDeCobranca(entidadeId);
  const feito = new Set(jaFeitos.map(x => `${x.parcela_id}|${x.passo}`));

  const fila = [];
  for (const p of abertas) {
    const saldo = p.valor_cents - p.pago_cents;
    if (saldo <= 0) continue;
    const atraso = diasEntre(hoje, p.vencimento);
    const passo = passoDe(atraso);
    if (!passo) continue;                                  // ainda cedo demais
    if (feito.has(`${p.id}|${passo.chave}`)) continue;      // já saiu

    const cp = p.contraparte_id ? repo.contraparte(p.contraparte_id) : null;
    const dados = {
      nome: p.contraparte_nome || '', documento: p.documento || p.descricao || '',
      vencimento: p.vencimento, saldo: dinheiro.formatar(saldo), diasAtraso: atraso,
    };
    fila.push({
      parcelaId: p.id, tituloId: p.titulo_id, numero: p.numero,
      contraparteId: p.contraparte_id || '', contraparte: p.contraparte_nome || '(sem cadastro)',
      // Sem contato, a linha aparece assim mesmo — sumir dela é o que faz
      // uma dívida ficar anos sem ninguém perceber que ninguém cobrou.
      email: (cp && cp.email) || '', telefone: (cp && cp.telefone) || '',
      semContato: !(cp && (cp.email || cp.telefone)),
      documento: p.documento || '', descricao: p.descricao || '',
      vencimento: p.vencimento, diasAtraso: atraso,
      saldoCents: saldo, saldo: dinheiro.formatar(saldo),
      passo: passo.chave, passoRotulo: passo.rotulo, tom: passo.tom,
      mensagem: preencher(passo.modelo, dados),
    });
    if (fila.length >= limite) break;
  }

  fila.sort((a, b) => b.diasAtraso - a.diasAtraso || b.saldoCents - a.saldoCents);
  const somar = (f) => fila.filter(f).reduce((s, x) => s + x.saldoCents, 0);
  return {
    referencia: hoje,
    fila,
    resumo: {
      itens: fila.length,
      totalCents: somar(() => true), total: dinheiro.formatar(somar(() => true)),
      semContato: fila.filter(x => x.semContato).length,
      porPasso: PASSOS.map(p => ({ passo: p.chave, rotulo: p.rotulo, itens: fila.filter(x => x.passo === p.chave).length })),
    },
    passos: PASSOS.map(p => ({ chave: p.chave, rotulo: p.rotulo, dias: p.dias, tom: p.tom })),
    // O contrato do módulo, na resposta: quem integrar não pode alegar que
    // achou que enviava.
    envio: 'ESTE MÓDULO NÃO ENVIA. A fila é para uma pessoa revisar e enviar pelo canal que escolher; ' +
      'depois, registre o envio para o passo não sair de novo.',
    origem: {
      formula: 'parcelas a receber em aberto cujo atraso alcançou um passo ainda não registrado',
      fonte: 'contas a receber + histórico de cobrança',
    },
  };
}

/**
 * Registra que o passo foi enviado (por uma pessoa, pelo canal que ela
 * escolheu). É isto que tira a linha da fila de amanhã.
 */
function registrarEnvio(parcelaId, passoChave, { canal = '', observacao = '' } = {}) {
  const passo = passoPorChave(passoChave);
  if (!passo) throw new ErroDeCobranca(`Passo desconhecido: ${passoChave}.`);
  if (!String(canal).trim()) throw new ErroDeCobranca('Informe o canal usado (whatsapp, e-mail, telefone, presencial).');
  const p = repo.parcela(parcelaId);
  if (!p) throw new ErroDeCobranca('Parcela não encontrada.');

  const id = novoId();
  repo.registrarPassoDeCobranca({
    id, entidadeId: p.entidade_id, parcelaId, passo: passoChave,
    canal: String(canal).slice(0, 40), observacao: String(observacao).slice(0, 300),
  });
  auditoria.registrar('cobranca.registrar_envio', {
    objetoTipo: 'parcela', objetoId: parcelaId,
    motivo: observacao || `cobrança ${passo.rotulo} por ${canal}`,
    detalhe: { passo: passoChave, canal },
  });
  return { ok: true, id, parcelaId, passo: passoChave, quando: nowISO() };
}

/** Histórico de cobrança de uma parcela — o que já se tentou, e quando. */
const historico = (parcelaId) => repo.passosDaParcela(parcelaId).map(x => ({
  id: x.id, passo: x.passo, rotulo: (passoPorChave(x.passo) || {}).rotulo || x.passo,
  canal: x.canal, observacao: x.observacao, quando: x.criado_em, por: x.criado_por,
}));

module.exports = { ErroDeCobranca, PASSOS, regua, registrarEnvio, historico, passoDe, preencher, diasEntre };
