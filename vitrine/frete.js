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

// fetch injetável: o selftest troca por um mock sem tocar na rede
let _fetch = (...a) => globalThis.fetch(...a);
function setFetch(fn) { _fetch = fn || ((...a) => globalThis.fetch(...a)); }

// decimal "12.34" (string da API) → 1234 centavos, sem float
function decimalParaCentavos(v) {
  const [int, dec] = String(v == null ? '0' : v).replace(',', '.').split('.');
  return Math.max(0, (parseInt(int, 10) || 0) * 100 + parseInt(String(dec || '0').padEnd(2, '0').slice(0, 2), 10));
}

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
  // FASE 6 — cotação REAL pela API do Melhor Envio. Sem token
  // (VITRINE_MELHOR_ENVIO_TOKEN) fica indisponível; com VITRINE_MELHOR_ENVIO_SANDBOX=on
  // usa o ambiente de testes (sandbox.melhorenvio.com.br). A compra de etiqueta
  // e o rastreio automático ficam para depois da homologação — postagem e
  // código continuam manuais, e a interface diz isso.
  'melhor-envio': {
    nome: 'Melhor Envio' + (String(process.env.VITRINE_MELHOR_ENVIO_SANDBOX || 'on') === 'on' ? ' (sandbox)' : ''),
    disponivel: () => !!process.env.VITRINE_MELHOR_ENVIO_TOKEN,
    base() {
      return String(process.env.VITRINE_MELHOR_ENVIO_SANDBOX || 'on') === 'on'
        ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
    },
    async cotar({ cepDestino, cepOrigem, pesoGramas = 500, dim = {} }) {
      const destino = String(cepDestino || '').replace(/\D/g, '');
      if (destino.length !== 8) throw new Error('Informe um CEP de destino válido (8 dígitos).');
      const r = await _fetch(this.base() + '/api/v2/me/shipment/calculate', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.VITRINE_MELHOR_ENVIO_TOKEN,
          'Content-Type': 'application/json', Accept: 'application/json',
          'User-Agent': 'Vitrine (villelastay.com.br)',
        },
        body: JSON.stringify({
          from: { postal_code: String(cepOrigem || '').replace(/\D/g, '') },
          to: { postal_code: destino },
          package: {
            weight: Math.max(0.05, Math.max(1, pesoGramas) / 1000), // kg
            width: Math.max(1, dim.larg_cm || 20), height: Math.max(1, dim.alt_cm || 10), length: Math.max(1, dim.comp_cm || 20),
          },
        }),
      });
      const texto = await r.text();
      let lista = null; try { lista = JSON.parse(texto); } catch (_) {}
      if (!r.ok || !Array.isArray(lista)) throw new Error(`Melhor Envio: HTTP ${r.status} ${String(texto).slice(0, 150)}`);
      return lista
        .filter((sv) => sv && sv.price && !sv.error)
        .map((sv) => ({
          tipo: 'me-' + sv.id,
          nome: `${(sv.company && sv.company.name) || ''} ${sv.name} (Melhor Envio)`.trim(),
          valor_centavos: decimalParaCentavos(sv.price),
          prazo_dias: inteiro(sv.delivery_time && sv.delivery_time.days != null ? sv.delivery_time.days : sv.delivery_time, 5),
        }));
    },
  },
};

function provedorAtivo() {
  const nome = s(process.env.VITRINE_FRETE_PROVEDOR, 40) || 'simulado';
  const p = Provedores[nome];
  if (!p || !p.disponivel()) return { nome: 'simulado', impl: Provedores.simulado };
  return { nome, impl: p };
}

// Cotação SEMPRE assíncrona. Melhor Envio fora do ar não pode derrubar o
// checkout: cai no simulado com o rótulo dizendo que a cotação é simulada.
async function cotar(params) {
  const { nome, impl } = provedorAtivo();
  if (nome === 'melhor-envio') {
    try {
      const opcoes = await impl.cotar(params);
      if (opcoes.length) {
        if (params.retiradaOk) opcoes.push({ tipo: 'retirada', nome: 'Retirada em mãos (combinar com o vendedor)', valor_centavos: 0, prazo_dias: 0 });
        return opcoes;
      }
    } catch (e) { console.error('[vitrine] Melhor Envio indisponível, usando cotação simulada:', e.message); }
  }
  return Provedores.simulado.cotar(params);
}

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

module.exports = { Provedores, provedorAtivo, cotar, Envios, ETAPAS, pesoCobravel, zonaEntre, setFetch, decimalParaCentavos };
