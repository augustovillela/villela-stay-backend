// =====================================================================
// Villela Finance — adaptador Stays.net (vertical de hospedagem).
//
// Traz a operação real para o razão: reserva → receita, comissão de canal
// e recebível, por imóvel (centro de custo).
//
// A IDEIA CENTRAL é reconciliar para um ESTADO-ALVO, não "importar uma
// vez". Para cada reserva o adaptador calcula quanto DEVERIA estar
// lançado, lê quanto JÁ está, e lança apenas a diferença. Com isso, um só
// caminho de código resolve os quatro casos que normalmente viram quatro
// bugs:
//
//   • reserva nova        → alvo cheio,  atual zero  → lança tudo
//   • reserva reprocessada→ alvo == atual             → não lança nada
//   • valor alterado      → alvo ≠ atual              → lança só o delta
//   • reserva cancelada   → alvo zero,   atual cheio  → lança o inverso
//
// E o lançamento sai balanceado por construção: alvo e atual são ambos
// balanceados, logo a diferença também é.
//
// CONVENÇÕES DA CASA (CLAUDE.md regra 4 e docs\integracoes\stays-api.md) —
// não reinventar:
//   • faturamento = `price._f_total` por CHECK-IN (competência).
//     NUNCA tarifa × noites: infla ~3×.
//   • líquido = total − `partner.commission._mcval.BRL`.
//   • reserva direta tem comissão zero.
//   • excluir `canceled`, `blocked` e `maintenance`.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { j } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const planoContas = require('./plano-contas');
const tenancy = require('./tenancy');

class ErroStays extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroStays'; this.status = 502; this.detalhe = detalhe || null; }
}

/** Tipos que não são receita — a regra da casa. */
const NAO_FATURAM = new Set(['canceled', 'blocked', 'maintenance']);

// O cliente da Stays vive no server.js (credenciais, paginação, cache de
// clientes). Injetamos em vez de duplicar: um só lugar sabe autenticar.
let _paginado = null;
let _resolverClientes = null;

function configurar({ paginado, resolverClientes } = {}) {
  _paginado = typeof paginado === 'function' ? paginado : null;
  _resolverClientes = typeof resolverClientes === 'function' ? resolverClientes : null;
  return { disponivel: !!_paginado, resolveNomes: !!_resolverClientes };
}
const configurado = () => !!_paginado;

async function buscar(caminho, params) {
  if (!_paginado) throw new ErroStays('A integração com a Stays não está configurada neste servidor.');
  try { return await _paginado(caminho, params); }
  catch (e) { throw new ErroStays(`A Stays não respondeu: ${e.message}`); }
}

// ------------------------------------------------------------ competência

const RE_COMP = /^\d{4}-\d{2}$/;
function janela(competencia) {
  if (!RE_COMP.test(competencia)) throw new ErroStays('Competência inválida (use AAAA-MM).');
  const [ano, mes] = competencia.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { de: `${competencia}-01`, ate: `${competencia}-${String(ultimo).padStart(2, '0')}` };
}

// ------------------------------------------------- centros e contrapartes

/**
 * Um centro de custo por imóvel, criado sob demanda. `externo_id` guarda o
 * código da Stays (GG04I, PL02I…), que é o que amarra os dois mundos.
 */
function centroDoImovel(entidadeId, codigo, nome, cache) {
  if (!codigo || codigo === '—') return '';
  if (cache.has(codigo)) return cache.get(codigo);
  let centro = repo.centroCustoPorCodigo(entidadeId, codigo);
  if (!centro) {
    centro = repo.criarCentroCusto({
      entidadeId, codigo, nome: nome || codigo, tipo: 'propriedade', externoId: codigo,
    });
  }
  cache.set(codigo, centro.id);
  return centro.id;
}

/**
 * Contraparte do recebível. Em reserva de canal quem DEVE é o canal
 * (a OTA repassa o líquido), não o hóspede — tratar o hóspede como
 * devedor de uma reserva do Booking produz um aging que não existe.
 */
function contraparteDaReserva(entidadeId, reserva, nomeCliente, cache) {
  const canal = (reserva.partner && String(reserva.partner.name || '').trim()) || '';
  const direta = !canal || /direct|site|website|direta/i.test(canal);

  const externoId = direta ? `cliente:${reserva._idclient || reserva._id}` : `canal:${canal.toLowerCase()}`;
  if (cache.has(externoId)) return cache.get(externoId);

  const existente = repo.q(
    'SELECT * FROM fin_contrapartes WHERE tenant_id = :tenant AND entidade_id = :ent AND externo_id = :ext LIMIT 1',
    { ent: entidadeId, ext: externoId })[0];
  if (existente) { cache.set(externoId, existente.id); return existente.id; }

  const nome = direta
    ? (nomeCliente || `Hóspede ${String(reserva._idclient || '').slice(-6) || 'sem cadastro'}`)
    : canal;
  const criada = repo.criarContraparte({
    entidadeId, tipo: 'cliente', nome: nome.slice(0, 200), externoId,
  });
  cache.set(externoId, criada.id);
  return criada.id;
}

// ------------------------------------------------------------ estado-alvo

/**
 * Quanto DEVERIA estar lançado por causa desta reserva, por conta contábil.
 * Positivo = saldo devedor esperado; negativo = credor. A soma é zero.
 */
function alvoDaReserva(entidadeId, reserva, contas) {
  if (NAO_FATURAM.has(reserva.type)) return {};          // cancelada/bloqueada não fatura

  const bruto = dinheiro.paraCentavos((reserva.price && reserva.price._f_total) || 0, 'total da reserva');
  if (bruto <= 0) return {};

  const comissao = dinheiro.paraCentavos(
    (reserva.partner && reserva.partner.commission && reserva.partner.commission._mcval
      && reserva.partner.commission._mcval.BRL) || 0, 'comissão do canal');
  const comissaoValida = Math.max(0, Math.min(comissao, bruto));   // comissão não passa do total

  const canal = (reserva.partner && String(reserva.partner.name || '').trim()) || '';
  const direta = !canal || /direct|site|website|direta/i.test(canal);
  const contaRecebivel = direta ? contas.clientes : contas.canais;

  const alvo = {};
  const somar = (contaId, cents) => { if (cents) alvo[contaId] = (alvo[contaId] || 0) + cents; };

  somar(contaRecebivel.id, bruto - comissaoValida);   // débito: o que vai entrar
  somar(contas.comissao.id, comissaoValida);          // débito: dedução da receita
  somar(contas.diarias.id, -bruto);                   // crédito: receita bruta
  return alvo;
}

/** Quanto JÁ está lançado por causa desta reserva, por conta contábil. */
function atualDaReserva(reservaId) {
  const linhas = repo.q(
    `SELECT l.conta_id, COALESCE(SUM(l.debito_cents),0) AS deb, COALESCE(SUM(l.credito_cents),0) AS cred
       FROM fin_linhas l
       JOIN fin_lotes b ON b.id = l.lote_id AND b.status <> 'rascunho'
      WHERE l.tenant_id = :tenant AND l.ref_tipo = 'reserva_stays' AND l.ref_id = :ref
      GROUP BY l.conta_id`,
    { ref: reservaId });
  const atual = {};
  for (const l of linhas) { const v = l.deb - l.cred; if (v) atual[l.conta_id] = v; }
  return atual;
}

const diferenca = (alvo, atual) => {
  const saida = {};
  for (const conta of new Set([...Object.keys(alvo), ...Object.keys(atual)])) {
    const d = (alvo[conta] || 0) - (atual[conta] || 0);
    if (d) saida[conta] = d;
  }
  return saida;
};

// ------------------------------------------------------------ sincronização

/**
 * Reconcilia UMA reserva. Devolve `{ acao, loteId, delta }` — `acao` é
 * `nova`, `ajustada`, `cancelada` ou `sem_mudanca`.
 */
function sincronizarReserva({ entidadeId, reserva, contas, centroId, contraparteId, competencia }) {
  const alvo = alvoDaReserva(entidadeId, reserva, contas);
  const atual = atualDaReserva(reserva._id);
  const delta = diferenca(alvo, atual);
  const contasComDelta = Object.keys(delta);

  if (!contasComDelta.length) return { acao: 'sem_mudanca', reservaId: reserva._id };
  if (contasComDelta.length < 2) {
    // Não deveria acontecer: alvo e atual são balanceados, logo o delta
    // também. Se acontecer, é sintoma de lançamento manual na conta da
    // reserva — recusar é melhor do que gravar um lote torto.
    throw new ErroStays(
      `Delta desbalanceado na reserva ${reserva._id} — há lançamento manual nas contas dela.`,
      { delta });
  }

  const houveAntes = Object.keys(atual).length > 0;
  const acao = !houveAntes ? 'nova' : (Object.keys(alvo).length ? 'ajustada' : 'cancelada');

  const codigo = reserva._codigoImovel || '';
  const hospede = reserva._nomeCliente || '';
  const memo = {
    nova: `Reserva ${reserva.id || reserva._id}${codigo ? ' · ' + codigo : ''}${hospede ? ' · ' + hospede : ''}`,
    ajustada: `Ajuste da reserva ${reserva.id || reserva._id} (valor alterado na Stays)`,
    cancelada: `Cancelamento da reserva ${reserva.id || reserva._id}`,
  }[acao];

  const linhas = contasComDelta.map(contaId => ({
    contaId,
    debitoCents: delta[contaId] > 0 ? delta[contaId] : 0,
    creditoCents: delta[contaId] < 0 ? -delta[contaId] : 0,
    centroCustoId: centroId,
    // Só as contas de recebível controlam contraparte; pôr contraparte na
    // conta de receita polui o subledger sem servir a ninguém.
    contraparteId: [contas.clientes.id, contas.canais.id].includes(contaId) ? contraparteId : '',
    refTipo: 'reserva_stays', refId: reserva._id,
    memo: memo.slice(0, 300),
  }));

  // A chave inclui a sequência (quantos lotes esta reserva já tem) e a
  // impressão do delta: reprocessar o mesmo estado não duplica, e uma
  // alteração de verdade não é confundida com repetição.
  const seq = repo.q(
    `SELECT COUNT(*) AS n FROM fin_lotes WHERE tenant_id = :tenant AND origem = 'stays' AND origem_ref = :ref`,
    { ref: reserva._id })[0].n;
  const impressao = crypto.createHash('sha256').update(JSON.stringify(delta)).digest('hex').slice(0, 12);

  const r = ledger.lancar({
    entidadeId,
    data: reserva.checkInDate || `${competencia}-01`,
    competencia,
    memo,
    origem: 'stays',
    origemRef: reserva._id,
    idempotencia: `stays:${reserva._id}:s${seq}:${impressao}`,
    linhas,
  });

  return { acao, reservaId: reserva._id, loteId: r.lote.id, delta, duplicado: r.duplicado };
}

/**
 * Título a receber espelhando a reserva — é o que alimenta aging, régua de
 * cobrança e o "a receber vencido" do cockpit. O lançamento contábil já
 * aconteceu no razão; aqui é o subledger.
 */
function tituloDaReserva({ entidadeId, reserva, contraparteId, centroId, competencia, contas, loteId }) {
  const cancelada = NAO_FATURAM.has(reserva.type);
  const bruto = cancelada ? 0 : dinheiro.paraCentavos((reserva.price && reserva.price._f_total) || 0, 'total');
  const comissao = cancelada ? 0 : Math.max(0, dinheiro.paraCentavos(
    (reserva.partner && reserva.partner.commission && reserva.partner.commission._mcval
      && reserva.partner.commission._mcval.BRL) || 0, 'comissão'));
  const liquido = Math.max(0, bruto - comissao);

  const existente = repo.q(
    "SELECT * FROM fin_titulos WHERE tenant_id = :tenant AND origem = 'stays' AND origem_ref = :ref LIMIT 1",
    { ref: reserva._id })[0];

  if (cancelada) {
    if (existente && existente.status !== 'cancelado') {
      repo.exec(
        `UPDATE fin_titulos SET status = 'cancelado', cancelado_em = :agora,
           cancelado_motivo = 'reserva cancelada na Stays', atualizado_em = :agora
          WHERE tenant_id = :tenant AND id = :id`,
        { id: existente.id, agora: new Date().toISOString() });
      repo.exec(
        "UPDATE fin_parcelas SET status = 'cancelada', atualizado_em = :agora WHERE tenant_id = :tenant AND titulo_id = :t AND status IN ('aberta','parcial')",
        { t: existente.id, agora: new Date().toISOString() });
    }
    return existente ? { tituloId: existente.id, acao: 'cancelado' } : null;
  }
  if (!liquido) return null;

  if (existente) {
    if (existente.valor_cents === liquido && existente.status !== 'cancelado') {
      return { tituloId: existente.id, acao: 'sem_mudanca' };
    }
    repo.exec(
      `UPDATE fin_titulos SET valor_cents = :valor, status = 'aberto', cancelado_em = '',
         cancelado_motivo = '', atualizado_em = :agora
        WHERE tenant_id = :tenant AND id = :id`,
      { id: existente.id, valor: liquido, agora: new Date().toISOString() });
    // Parcela única segue o título; parcelamento real entra na fase 3.
    repo.exec(
      `UPDATE fin_parcelas SET valor_cents = :valor, vencimento = :venc, atualizado_em = :agora
        WHERE tenant_id = :tenant AND titulo_id = :t AND numero = 1`,
      { t: existente.id, valor: liquido, venc: reserva.checkInDate || `${competencia}-01`, agora: new Date().toISOString() });
    return { tituloId: existente.id, acao: 'atualizado' };
  }

  const id = require('./db').novoId();
  repo.exec(
    `INSERT INTO fin_titulos (id, tenant_id, entidade_id, especie, contraparte_id, documento, descricao,
       competencia, valor_cents, conta_id, centro_custo_id, status, origem, origem_ref, lote_id, criado_em, criado_por)
     VALUES (:id, :tenant, :ent, 'receber', :cp, :doc, :desc, :comp, :valor, :conta, :cc, 'aberto', 'stays', :ref, :lote, :agora, :por)`,
    { id, ent: entidadeId, cp: contraparteId, doc: String(reserva.id || '').slice(0, 60),
      desc: `Reserva ${reserva.id || reserva._id}`.slice(0, 200), comp: competencia, valor: liquido,
      conta: contas.diarias.id, cc: centroId, ref: reserva._id, lote: loteId || '',
      agora: new Date().toISOString(), por: tenancy.userAtual() });
  repo.exec(
    `INSERT INTO fin_parcelas (id, tenant_id, titulo_id, numero, vencimento, valor_cents, status, criado_em)
     VALUES (:id, :tenant, :t, 1, :venc, :valor, 'aberta', :agora)`,
    { id: require('./db').novoId(), t: id, venc: reserva.checkInDate || `${competencia}-01`,
      valor: liquido, agora: new Date().toISOString() });
  return { tituloId: id, acao: 'criado' };
}

/**
 * Sincroniza uma competência inteira. Idempotente: rodar duas vezes no
 * mesmo mês não muda nada (todas as reservas voltam `sem_mudanca`).
 */
async function sincronizar({ entidadeId, competencia, dryRun = false }) {
  const { de, ate } = janela(competencia);
  const entidade = repo.entidadePorId(entidadeId);
  if (!entidade) throw new ErroStays('Empresa não encontrada nesta conta.');

  const contas = {
    clientes: planoContas.chave(entidadeId, 'clientes'),
    canais: planoContas.chave(entidadeId, 'canais'),
    diarias: planoContas.chave(entidadeId, 'diarias'),
    comissao: planoContas.chave(entidadeId, 'comissaoCanal'),
  };

  const listings = await buscar('/content/listings', {});
  const porId = {};
  for (const l of listings) porId[l._id] = { codigo: l.id, nome: (l.internalName || l.id || '') };

  // Competência por CHECK-IN: `dateType='arrival'` (regra 4 do CLAUDE.md).
  const reservas = await buscar('/booking/reservations', { from: de, to: ate, dateType: 'arrival' });

  // Nome do hóspede só é necessário para reserva direta — resolver em lote
  // evita uma chamada por reserva.
  let nomes = {};
  if (_resolverClientes) {
    const ids = reservas
      .filter(r => !NAO_FATURAM.has(r.type) && !(r.partner && r.partner.name))
      .map(r => r._idclient).filter(Boolean);
    if (ids.length) { try { nomes = (await _resolverClientes(ids)) || {}; } catch (_) { nomes = {}; } }
  }

  const cacheCentros = new Map();
  const cacheContrapartes = new Map();
  const resumo = { competencia, lidas: reservas.length, nova: 0, ajustada: 0, cancelada: 0, sem_mudanca: 0, ignorada: 0, erro: 0 };
  const detalhes = [];
  const erros = [];

  for (const reserva of reservas) {
    try {
      const imovel = porId[reserva._idlisting] || { codigo: '', nome: '' };
      reserva._codigoImovel = imovel.codigo;
      reserva._nomeCliente = nomes[reserva._idclient] || '';

      const alvo = alvoDaReserva(entidadeId, reserva, contas);
      const atual = atualDaReserva(reserva._id);
      if (!Object.keys(alvo).length && !Object.keys(atual).length) { resumo.ignorada++; continue; }

      if (dryRun) {
        const d = diferenca(alvo, atual);
        if (Object.keys(d).length) { resumo[Object.keys(atual).length ? 'ajustada' : 'nova']++; detalhes.push({ reservaId: reserva._id, codigo: imovel.codigo, delta: d }); }
        else resumo.sem_mudanca++;
        continue;
      }

      const centroId = centroDoImovel(entidadeId, imovel.codigo, imovel.nome, cacheCentros);
      const contraparteId = contraparteDaReserva(entidadeId, reserva, reserva._nomeCliente, cacheContrapartes);
      const r = sincronizarReserva({ entidadeId, reserva, contas, centroId, contraparteId, competencia });
      resumo[r.acao]++;
      if (r.acao !== 'sem_mudanca') {
        detalhes.push({ reservaId: reserva._id, codigo: imovel.codigo, acao: r.acao, loteId: r.loteId });
      }
      tituloDaReserva({ entidadeId, reserva, contraparteId, centroId, competencia, contas, loteId: r.loteId });
    } catch (e) {
      resumo.erro++;
      // Uma reserva ruim não pode derrubar o mês inteiro — mas também não
      // pode sumir. Vai para a lista de erros, com o id.
      erros.push({ reservaId: reserva._id, erro: String(e.message).slice(0, 300) });
    }
  }

  if (!dryRun) {
    auditoria.registrar('stays.sincronizar', {
      objetoTipo: 'competencia', objetoId: `${entidadeId}:${competencia}`,
      motivo: `sincronização da competência ${competencia}`,
      detalhe: resumo,
    });
  }
  return { resumo, detalhes: detalhes.slice(0, 200), erros, dryRun };
}

// ------------------------------------------------------------ conferência

/**
 * Reconciliação exigida pelo plano de migração: compara o que a Stays diz
 * (mesma conta do módulo legado, `price._f_total` por check-in) com o que
 * está no razão, imóvel a imóvel.
 *
 * "Diferença não explicada = zero, ou não passa." Esta função é o que
 * permite afirmar isso com evidência, em vez de com confiança.
 */
async function conferir({ entidadeId, competencia }) {
  const { de, ate } = janela(competencia);
  const listings = await buscar('/content/listings', {});
  const codPorId = {};
  for (const l of listings) codPorId[l._id] = l.id;

  const reservas = (await buscar('/booking/reservations', { from: de, to: ate, dateType: 'arrival' }))
    .filter(r => !NAO_FATURAM.has(r.type));

  // Lado Stays — exatamente a conta do módulo legado.
  const naStays = {};
  for (const r of reservas) {
    const cod = codPorId[r._idlisting] || '(sem imóvel)';
    if (!naStays[cod]) naStays[cod] = { brutoCents: 0, comissaoCents: 0, liquidoCents: 0, reservas: 0 };
    const bruto = dinheiro.paraCentavos((r.price && r.price._f_total) || 0, 'total');
    const com = Math.max(0, dinheiro.paraCentavos(
      (r.partner && r.partner.commission && r.partner.commission._mcval && r.partner.commission._mcval.BRL) || 0, 'comissão'));
    naStays[cod].brutoCents += bruto;
    naStays[cod].comissaoCents += Math.min(com, bruto);
    naStays[cod].liquidoCents += bruto - Math.min(com, bruto);
    naStays[cod].reservas += 1;
  }

  // Lado razão — só o que veio da Stays, para a comparação ser justa.
  const doRazao = {};
  const linhas = repo.q(
    `SELECT cc.codigo AS centro, c.codigo AS conta,
            COALESCE(SUM(l.debito_cents),0) AS deb, COALESCE(SUM(l.credito_cents),0) AS cred
       FROM fin_linhas l
       JOIN fin_lotes b ON b.id = l.lote_id AND b.status <> 'rascunho' AND b.origem = 'stays'
       JOIN fin_contas c ON c.id = l.conta_id
       LEFT JOIN fin_centros_custo cc ON cc.id = l.centro_custo_id AND cc.tenant_id = l.tenant_id
      WHERE l.tenant_id = :tenant AND b.entidade_id = :ent AND b.competencia = :comp
      GROUP BY centro, conta`,
    { ent: entidadeId, comp: competencia });

  const CODIGO = planoContas.CHAVES;
  for (const l of linhas) {
    const cod = l.centro || '(sem imóvel)';
    if (!doRazao[cod]) doRazao[cod] = { brutoCents: 0, comissaoCents: 0, liquidoCents: 0 };
    if (l.conta === CODIGO.diarias) doRazao[cod].brutoCents += l.cred - l.deb;
    if (l.conta === CODIGO.comissaoCanal) doRazao[cod].comissaoCents += l.deb - l.cred;
  }
  for (const cod of Object.keys(doRazao)) {
    doRazao[cod].liquidoCents = doRazao[cod].brutoCents - doRazao[cod].comissaoCents;
  }

  const codigos = [...new Set([...Object.keys(naStays), ...Object.keys(doRazao)])].sort();
  const comparacao = codigos.map(cod => {
    const s = naStays[cod] || { brutoCents: 0, comissaoCents: 0, liquidoCents: 0, reservas: 0 };
    const r = doRazao[cod] || { brutoCents: 0, comissaoCents: 0, liquidoCents: 0 };
    return {
      imovel: cod,
      staysBrutoCents: s.brutoCents, razaoBrutoCents: r.brutoCents, difBrutoCents: s.brutoCents - r.brutoCents,
      staysComissaoCents: s.comissaoCents, razaoComissaoCents: r.comissaoCents, difComissaoCents: s.comissaoCents - r.comissaoCents,
      staysLiquidoCents: s.liquidoCents, razaoLiquidoCents: r.liquidoCents, difLiquidoCents: s.liquidoCents - r.liquidoCents,
      reservas: s.reservas,
      bate: s.brutoCents === r.brutoCents && s.comissaoCents === r.comissaoCents,
    };
  });

  const totalDif = comparacao.reduce((acc, c) => ({
    bruto: acc.bruto + c.difBrutoCents,
    comissao: acc.comissao + c.difComissaoCents,
    liquido: acc.liquido + c.difLiquidoCents,
  }), { bruto: 0, comissao: 0, liquido: 0 });

  const divergentes = comparacao.filter(c => !c.bate);
  return {
    competencia,
    comparacao,
    divergentes,
    totalDiferencaCents: totalDif,
    bate: divergentes.length === 0,
    // A frase que decide se a migração pode avançar.
    veredito: divergentes.length === 0
      ? `Bate integralmente: ${comparacao.length} imóvel(is), diferença zero.`
      : `${divergentes.length} imóvel(is) divergem — diferença de ${dinheiro.formatar(totalDif.bruto)} no bruto. ` +
        `Sincronize a competência antes de comparar de novo.`,
    convencao: 'price._f_total por data de check-in, líquido = total − comissão do canal (CLAUDE.md regra 4).',
  };
}

module.exports = {
  ErroStays, NAO_FATURAM, configurar, configurado, sincronizar, conferir,
  janela, alvoDaReserva, atualDaReserva, diferenca, sincronizarReserva,
  centroDoImovel, contraparteDaReserva, tituloDaReserva,
};
