// =====================================================================
// Vitrine — camada de PROVEDORES LOGÍSTICOS (frete e rastreamento).
//
// Contrato: todo provedor implementa
//   cotar({ cepDestino, cepOrigem, pesoGramas, dim, retiradaOk }) → [opções]
//   criarEnvio(order, { servico, codigo })                        → shipment
//   avancar(shipment)                                             → próximo evento
//
// 'simulado' é o provedor do MVP: cotação determinística por CEP, peso e
// cubagem, e uma esteira de eventos de rastreio que avança sozinha (rotina
// horária) ou manualmente. A interface sempre diz que é simulação.
// 'melhor-envio' fica como contrato honesto para a fase 6: sem credencial,
// indisponível — nunca inventa preço nem prazo.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId } = require('./db');
const { s, cent, inteiro } = require('./repo');

// peso cobrável = maior entre o real e o cubado (regra de mercado: 6000 cm³/kg)
function pesoCobravel(pesoGramas, comp, larg, alt) {
  const cubado = Math.round((Math.max(1, comp) * Math.max(1, larg) * Math.max(1, alt)) / 6);
  return Math.max(Math.max(1, pesoGramas), cubado);
}

// "distância" simulada entre regiões: diferença do 1º dígito do CEP (0..8)
function zonaEntre(cepA, cepB) {
  const a = inteiro(String(cepA || '7').replace(/\D/g, '').charAt(0), 7);
  const b = inteiro(String(cepB || '7').replace(/\D/g, '').charAt(0), 7);
  return Math.abs(a - b);
}

const ETAPAS = [
  { status: 'postado', descricao: 'Objeto postado pelo vendedor' },
  { status: 'em_transito', descricao: 'Objeto em trânsito para a sua região' },
  { status: 'saiu_entrega', descricao: 'Objeto saiu para entrega' },
  { status: 'entregue', descricao: 'Objeto entregue ao destinatário' },
];

const Provedores = {
  simulado: {
    nome: 'Frete simulado',
    disponivel: () => true,
    cotar({ cepDestino, cepOrigem, pesoGramas = 500, dim = {}, retiradaOk = false }) {
      const destino = String(cepDestino || '').replace(/\D/g, '');
      if (destino.length !== 8) throw new Error('Informe um CEP de destino válido (8 dígitos).');
      const zona = zonaEntre(destino, cepOrigem);
      const peso = pesoCobravel(pesoGramas, dim.comp_cm || 20, dim.larg_cm || 20, dim.alt_cm || 10);
      const kgFaixas = Math.ceil(peso / 1000);
      const economica = 1490 + zona * 320 + kgFaixas * 260;
      const expressa = Math.round(economica * 18 / 10);
      const opcoes = [
        { tipo: 'economica', nome: 'Entrega econômica (simulada)', valor_centavos: economica, prazo_dias: 4 + zona * 2 },
        { tipo: 'expressa', nome: 'Entrega expressa (simulada)', valor_centavos: expressa, prazo_dias: 1 + Math.ceil(zona / 2) },
      ];
      if (retiradaOk) opcoes.push({ tipo: 'retirada', nome: 'Retirada em mãos (combinar com o vendedor)', valor_centavos: 0, prazo_dias: 0 });
      return opcoes;
    },
    gerarCodigo() { return 'VT' + crypto.randomBytes(4).toString('hex').toUpperCase() + 'BR'; },
    urlRastreio(codigo) { return '/vitrine/rastreio/' + codigo; }, // simulado: a linha do tempo é a nossa
  },
  'melhor-envio': {
    nome: 'Melhor Envio',
    disponivel: () => !!process.env.VITRINE_MELHOR_ENVIO_TOKEN,
    cotar() { throw new Error('Melhor Envio ainda não está configurado nesta instalação (fase 6). Use o frete simulado.'); },
  },
};

function provedorAtivo() {
  const nome = s(process.env.VITRINE_FRETE_PROVEDOR, 40) || 'simulado';
  const p = Provedores[nome];
  if (!p || !p.disponivel()) return { nome: 'simulado', impl: Provedores.simulado };
  return { nome, impl: p };
}

function cotar(params) { return provedorAtivo().impl.cotar(params); }

const Envios = {
  obter(id) { return db.prepare('SELECT * FROM shipments WHERE id = ?').get(s(id, 40)) || null; },
  doPedido(orderId) { return db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(s(orderId, 40)) || null; },
  porCodigo(codigo) { return db.prepare('SELECT * FROM shipments WHERE codigo_rastreio = ?').get(s(codigo, 60)) || null; },
  eventos(shipmentId) { return db.prepare('SELECT status, descricao, local, quando FROM tracking_events WHERE shipment_id = ? ORDER BY quando').all(s(shipmentId, 40)); },

  // criado quando o vendedor informa o envio; código manual (transportadora
  // real) ou gerado pelo provedor simulado
  criar(order, { servico = '', codigo = '', local = '' } = {}) {
    if (Envios.doPedido(order.id)) throw new Error('Este pedido já tem envio registrado.');
    const { nome, impl } = provedorAtivo();
    const cod = s(codigo, 60) || (impl.gerarCodigo ? impl.gerarCodigo() : '');
    const id = novoId();
    const agora = nowISO();
    const previsao = new Date(Date.now() + Math.max(1, order.frete_prazo_dias) * 86400000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO shipments (id, order_id, provedor, servico, codigo_rastreio, url_rastreio, status, postado_em, previsao_entrega, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,'postado',?,?,?,?)`)
      .run(id, order.id, nome, s(servico, 60) || order.frete_tipo, cod,
        impl.urlRastreio ? impl.urlRastreio(cod) : '', agora, previsao, agora, agora);
    db.prepare('INSERT INTO tracking_events (id, shipment_id, status, descricao, local, quando) VALUES (?,?,?,?,?,?)')
      .run(novoId(), id, 'postado', ETAPAS[0].descricao, s(local, 80) || 'Origem', agora);
    return Envios.obter(id);
  },

  // avança UMA etapa da esteira simulada; devolve o evento novo (ou null se
  // já entregue). Quem conclui o PEDIDO é o chamador (pedidos.js).
  avancar(shipmentId, { local = '' } = {}) {
    const sh = Envios.obter(shipmentId);
    if (!sh || sh.status === 'entregue') return null;
    const idx = ETAPAS.findIndex((e) => e.status === sh.status);
    const prox = ETAPAS[idx + 1];
    if (!prox) return null;
    const agora = nowISO();
    db.prepare('INSERT INTO tracking_events (id, shipment_id, status, descricao, local, quando) VALUES (?,?,?,?,?,?)')
      .run(novoId(), shipmentId, prox.status, prox.descricao, s(local, 80) || 'Centro de distribuição (simulado)', agora);
    db.prepare('UPDATE shipments SET status = ?, entregue_em = ?, atualizado_em = ? WHERE id = ?')
      .run(prox.status, prox.status === 'entregue' ? agora : sh.entregue_em, agora, shipmentId);
    return { ...prox, quando: agora };
  },

  // rotina horária: envios simulados avançam sozinhos quando o último evento
  // tem mais de N horas — o rastreio "anda" sem ninguém clicar em nada.
  rotina({ horas = 6 } = {}) {
    const corte = new Date(Date.now() - horas * 3600000).toISOString();
    const pendentes = db.prepare(`SELECT sh.id FROM shipments sh WHERE sh.provedor = 'simulado' AND sh.status NOT IN ('entregue')
      AND (SELECT MAX(quando) FROM tracking_events te WHERE te.shipment_id = sh.id) < ?`).all(corte);
    const avancados = [];
    for (const p of pendentes) {
      const ev = Envios.avancar(p.id);
      if (ev) avancados.push({ shipment_id: p.id, ...ev });
    }
    return avancados;
  },

  registrarManual(shipmentId, { status, descricao, local }) {
    const sh = Envios.obter(shipmentId);
    if (!sh) throw new Error('Envio não encontrado.');
    const agora = nowISO();
    db.prepare('INSERT INTO tracking_events (id, shipment_id, status, descricao, local, quando) VALUES (?,?,?,?,?,?)')
      .run(novoId(), shipmentId, s(status, 40) || sh.status, s(descricao, 200), s(local, 80), agora);
    if (s(status, 40)) db.prepare('UPDATE shipments SET status = ?, atualizado_em = ? WHERE id = ?').run(s(status, 40), agora, shipmentId);
  },
};

module.exports = { Provedores, provedorAtivo, cotar, Envios, ETAPAS, pesoCobravel, zonaEntre };
