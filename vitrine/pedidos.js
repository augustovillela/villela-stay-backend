// =====================================================================
// Vitrine — PEDIDOS: máquina de estados, composição financeira e o que
// deriva dela (repasse, avaliação, disputa).
//
// As três regras que sustentam o negócio:
//   1. DINHEIRO — calculado UMA vez no checkout, em centavos (INTEGER) e
//      basis points; gravado no pedido e nunca recalculado. Comissão
//      incide sobre o SUBTOTAL (não sobre o frete). Repasse do vendedor =
//      subtotal + frete − comissão. Tarifa do processador é custo da
//      PLATAFORMA e aparece separada: margem real = comissão − tarifa.
//   2. STATUS — transição só pelo mapa TRANSICOES, com ator conferido, e
//      cada mudança INSERE em order_status_history (append-only).
//   3. ESTOQUE — reservado na criação do pedido, devolvido no cancelamento
//      ou expiração. Ninguém paga por produto que outro já levou.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, novoCodigo, j } = require('./db');
const repo = require('./repo');
const { s, cent, inteiro, Config, Users, Vendedores, Enderecos, Carrinho, Products, Notificacoes, Auditoria, evento } = repo;
const pagamentos = require('./pagamentos');
const frete = require('./frete');

const STATUS_PEDIDO = {
  aguardando_pagamento: 'Aguardando pagamento',
  pagamento_em_analise: 'Pagamento em análise',
  pago: 'Pago',
  preparando_envio: 'Preparando envio',
  enviado: 'Enviado',
  em_transito: 'Em trânsito',
  entregue: 'Entregue',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  devolucao_solicitada: 'Devolução solicitada',
  em_disputa: 'Em disputa',
  reembolsado: 'Reembolsado',
};

// para → { de: [origens], atores: [quem pode] }
const TRANSICOES = {
  pagamento_em_analise: { de: ['aguardando_pagamento'], atores: ['webhook', 'sistema'] },
  pago: { de: ['aguardando_pagamento', 'pagamento_em_analise'], atores: ['webhook', 'sistema'] },
  preparando_envio: { de: ['pago'], atores: ['vendedor', 'admin'] },
  enviado: { de: ['pago', 'preparando_envio'], atores: ['vendedor', 'admin'] },
  em_transito: { de: ['enviado'], atores: ['sistema', 'admin'] },
  entregue: { de: ['enviado', 'em_transito'], atores: ['comprador', 'sistema', 'admin'] },
  concluido: { de: ['entregue', 'devolucao_solicitada', 'em_disputa'], atores: ['comprador', 'sistema', 'admin'] },
  cancelado: { de: ['aguardando_pagamento', 'pagamento_em_analise', 'pago', 'preparando_envio'], atores: ['comprador', 'vendedor', 'admin', 'sistema'] },
  devolucao_solicitada: { de: ['entregue'], atores: ['comprador'] },
  em_disputa: { de: ['devolucao_solicitada'], atores: ['vendedor', 'admin'] },
  reembolsado: { de: ['pago', 'preparando_envio', 'devolucao_solicitada', 'em_disputa', 'cancelado'], atores: ['admin', 'sistema', 'vendedor'] },
};

const Pedidos = {
  obter(id) { return db.prepare('SELECT * FROM orders WHERE id = ?').get(s(id, 40)) || null; },
  porCodigo(codigo) { return db.prepare('SELECT * FROM orders WHERE codigo = ?').get(s(codigo, 20)) || null; },
  itens(orderId) { return db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(s(orderId, 40)); },
  historico(orderId) { return db.prepare('SELECT de, para, quem, papel, detalhe, quando FROM order_status_history WHERE order_id = ? ORDER BY quando').all(s(orderId, 40)); },

  // ---- a ÚNICA porta de mudança de status ----
  mudarStatus(orderId, para, { quem = '', papel = 'sistema', detalhe = '' } = {}) {
    const o = Pedidos.obter(orderId);
    if (!o) throw new Error('Pedido não encontrado.');
    const regra = TRANSICOES[para];
    if (!regra) throw new Error('Status desconhecido: ' + s(para, 40));
    if (!regra.de.includes(o.status)) throw new Error(`Transição inválida: ${STATUS_PEDIDO[o.status] || o.status} → ${STATUS_PEDIDO[para] || para}.`);
    if (!regra.atores.includes(papel)) throw new Error(`${papel} não pode executar esta ação.`);
    const agora = nowISO();
    transacao(() => {
      const extra = para === 'pago' ? ', pago_em = ?' : para === 'entregue' ? ', entregue_em = ?' : para === 'concluido' ? ', concluido_em = ?' : '';
      const args = [para, agora];
      if (extra) args.push(agora);
      args.push(o.id);
      db.prepare(`UPDATE orders SET status = ?, atualizado_em = ?${extra} WHERE id = ?`).run(...args);
      db.prepare('INSERT INTO order_status_history (id, order_id, de, para, quem, papel, detalhe, quando) VALUES (?,?,?,?,?,?,?,?)')
        .run(novoId(), o.id, o.status, para, s(quem, 120), s(papel, 20), s(detalhe, 300), agora);
    });
    return Pedidos.obter(orderId);
  },

  // -------------------------------------------------------------------
  // CHECKOUT: transforma o grupo de UM vendedor do carrinho em pedido.
  // -------------------------------------------------------------------
  async checkout(buyerId, { sellerId, addressId = '', freteTipo = 'economica' } = {}) {
    const buyer = Users.obter(buyerId);
    if (!buyer || buyer.status !== 'ativo') throw new Error('Conta inválida.');
    if (!buyer.email_verificado) throw new Error('Verifique seu e-mail antes de comprar.');
    if (buyerId === sellerId) throw new Error('Você não pode comprar de si mesmo.');
    const vendedor = Vendedores.obter(sellerId);
    if (!vendedor || vendedor.status !== 'ativo') throw new Error('Vendedor indisponível.');

    const carrinho = Carrinho.ver(buyerId);
    const grupo = carrinho.grupos.find((g) => g.seller_id === sellerId);
    if (!grupo || !grupo.itens.length) throw new Error('Não há itens deste vendedor no seu carrinho.');
    const indisponivel = grupo.itens.find((i) => !i.disponivel);
    if (indisponivel) throw new Error(`"${indisponivel.titulo}" ficou indisponível. Remova do carrinho para continuar.`);

    // frete: cotação pela soma de peso/cubagem do grupo (regra simples do MVP)
    const tipo = s(freteTipo, 20) || 'economica';
    let freteCentavos = 0, prazoDias = 0, enderecoJson = '';
    if (tipo === 'retirada') {
      if (!grupo.itens.every((i) => i.entrega_retirada)) throw new Error('Nem todos os itens deste vendedor aceitam retirada em mãos.');
    } else {
      if (!grupo.itens.every((i) => i.entrega_envio)) throw new Error('Há item que só aceita retirada em mãos.');
      const end = Enderecos.obter(buyerId, addressId);
      if (!end) throw new Error('Escolha um endereço de entrega.');
      const peso = grupo.itens.reduce((t, i) => t + i.peso_gramas * i.quantidade, 0);
      const maior = grupo.itens.reduce((m, i) => (i.comp_cm * i.larg_cm * i.alt_cm > m.comp_cm * m.larg_cm * m.alt_cm ? i : m), grupo.itens[0]);
      const opcoes = await frete.cotar({
        cepDestino: end.cep, cepOrigem: grupo.itens[0].cep_origem || vendedor.cep_origem,
        pesoGramas: peso, dim: maior, retiradaOk: false,
      });
      const opcao = opcoes.find((op) => op.tipo === tipo);
      if (!opcao) throw new Error('Opção de frete inválida.');
      freteCentavos = cent(opcao.valor_centavos);
      prazoDias = opcao.prazo_dias;
      enderecoJson = j.str({ destinatario: end.destinatario || buyer.nome, cep: end.cep, logradouro: end.logradouro, numero: end.numero, complemento: end.complemento, bairro: end.bairro, cidade: end.cidade, uf: end.uf });
    }

    // ---- composição financeira (só inteiros) ----
    const subtotal = grupo.itens.reduce((t, i) => t + cent(i.preco_centavos) * i.quantidade, 0);
    const desconto = 0; // cupons ficam para depois; a coluna já existe
    const comissaoBp = Config.comissaoBp();                       // ex.: 500 = 5%
    const comissao = Math.round(subtotal * comissaoBp / 10000);   // sobre o subtotal, nunca sobre o frete
    const total = subtotal + freteCentavos - desconto;
    const repasse = subtotal + freteCentavos - comissao;          // frete pertence a quem envia

    const id = novoId();
    const agora = nowISO();
    let pagamento = null;
    transacao(() => {
      db.prepare(`INSERT INTO orders (id, codigo, buyer_id, seller_id, status, comissao_pct_bp, subtotal_centavos, frete_centavos,
          desconto_centavos, comissao_centavos, total_centavos, repasse_vendedor_centavos, frete_tipo, frete_prazo_dias,
          endereco_json, criado_em, atualizado_em)
        VALUES (?,?,?,?,'aguardando_pagamento',?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, novoCodigo(), buyerId, sellerId, comissaoBp, subtotal, freteCentavos, desconto, comissao, total, repasse,
          tipo, prazoDias, enderecoJson, agora, agora);
      for (const i of grupo.itens) {
        // reserva o estoque com guarda de concorrência: só decrementa se ainda houver
        const r = db.prepare('UPDATE products SET quantidade = quantidade - ? WHERE id = ? AND quantidade >= ?')
          .run(i.quantidade, i.product_id, i.quantidade);
        if (!r.changes) throw new Error(`Estoque insuficiente de "${i.titulo}".`);
        db.prepare('INSERT INTO order_items (id, order_id, product_id, titulo, condicao, preco_centavos, quantidade, criado_em) VALUES (?,?,?,?,?,?,?,?)')
          .run(novoId(), id, i.product_id, i.titulo, i.condicao, cent(i.preco_centavos), i.quantidade, agora);
      }
      db.prepare('INSERT INTO order_status_history (id, order_id, de, para, quem, papel, detalhe, quando) VALUES (?,?,?,?,?,?,?,?)')
        .run(novoId(), id, '', 'aguardando_pagamento', buyer.email, 'comprador', 'Pedido criado', agora);
      Carrinho.limparVendedor(buyerId, sellerId);
      pagamento = pagamentos.criarPagamento({ id, seller_id: sellerId, total_centavos: total });
    });
    Notificacoes.criar(sellerId, { titulo: 'Novo pedido recebido', texto: `Pedido de ${grupo.itens.length} item(ns) aguardando pagamento.`, url: '/vitrine/app#vendas' });
    evento(buyerId, 'pedido.criar', id, { total_centavos: total });
    return { pedido: Pedidos.obter(id), pagamento };
  },

  // ---- callbacks do provedor de pagamento (via pagamentos.processarEvento) ----
  aoPagamentoAprovado(orderId, { tarifa_centavos = 0 } = {}) {
    const o = Pedidos.obter(orderId);
    if (!o || o.status === 'pago') return;
    if (!['aguardando_pagamento', 'pagamento_em_analise'].includes(o.status)) return; // pedido já saiu do fluxo (ex.: expirou) — o estorno é tratado na disputa
    transacao(() => {
      db.prepare('UPDATE orders SET tarifa_processador_centavos = ? WHERE id = ?').run(cent(tarifa_centavos), orderId);
      Pedidos.mudarStatus(orderId, 'pago', { quem: 'provedor de pagamento', papel: 'webhook', detalhe: 'Pagamento aprovado' });
      db.prepare('INSERT INTO seller_payouts (id, order_id, seller_id, valor_centavos, status, criado_em) VALUES (?,?,?,?,?,?)')
        .run(novoId(), orderId, o.seller_id, o.repasse_vendedor_centavos, 'previsto', nowISO());
    });
    Notificacoes.criar(o.seller_id, { titulo: 'Pagamento confirmado', texto: `Pedido ${o.codigo} pago. Prepare o envio!`, url: '/vitrine/app#vendas' });
    Notificacoes.criar(o.buyer_id, { titulo: 'Pagamento aprovado', texto: `Pedido ${o.codigo} confirmado. O vendedor já vai preparar o envio.`, url: '/vitrine/app#pedidos' });
  },
  aoPagamentoEmAnalise(orderId) {
    const o = Pedidos.obter(orderId);
    if (o && o.status === 'aguardando_pagamento') {
      Pedidos.mudarStatus(orderId, 'pagamento_em_analise', { quem: 'provedor de pagamento', papel: 'webhook' });
    }
  },
  aoPagamentoRecusado(orderId) {
    const o = Pedidos.obter(orderId);
    if (!o || !['aguardando_pagamento', 'pagamento_em_analise'].includes(o.status)) return;
    Pedidos.cancelarInterno(o, { quem: 'provedor de pagamento', papel: 'sistema', detalhe: 'Pagamento recusado' });
    Notificacoes.criar(o.buyer_id, { titulo: 'Pagamento recusado', texto: `O pagamento do pedido ${o.codigo} foi recusado. Tente novamente.`, url: '/vitrine/app#pedidos' });
  },

  // devolve estoque + cancela (interno; validações de ator já feitas)
  cancelarInterno(o, { quem, papel, detalhe }) {
    transacao(() => {
      for (const i of Pedidos.itens(o.id)) {
        db.prepare('UPDATE products SET quantidade = quantidade + ? WHERE id = ?').run(i.quantidade, i.product_id);
      }
      Pedidos.mudarStatus(o.id, 'cancelado', { quem, papel, detalhe });
      db.prepare("UPDATE seller_payouts SET status = 'cancelado' WHERE order_id = ? AND status = 'previsto'").run(o.id);
    });
  },

  async cancelar(orderId, { userId, papel, motivo = '' }) {
    const o = Pedidos.obter(orderId);
    if (!o) throw new Error('Pedido não encontrado.');
    if (papel === 'comprador' && o.buyer_id !== userId) throw new Error('Este pedido não é seu.');
    if (papel === 'vendedor' && o.seller_id !== userId) throw new Error('Este pedido não é seu.');
    if (!TRANSICOES.cancelado.de.includes(o.status)) throw new Error('Este pedido não pode mais ser cancelado — abra uma solicitação de devolução.');
    const quem = (Users.obter(userId) || {}).email || papel;
    const pago = ['pago', 'preparando_envio'].includes(o.status);
    Pedidos.cancelarInterno(o, { quem, papel, detalhe: s(motivo, 200) || 'Cancelado' });
    if (pago) {
      await pagamentos.Pagamentos.reembolsar(o.id, o.total_centavos);
      Pedidos.mudarStatus(o.id, 'reembolsado', { quem: 'plataforma', papel: 'sistema', detalhe: 'Reembolso integral após cancelamento' });
    }
    const outro = papel === 'comprador' ? o.seller_id : o.buyer_id;
    Notificacoes.criar(outro, { titulo: 'Pedido cancelado', texto: `O pedido ${o.codigo} foi cancelado.`, url: '/vitrine/app' });
    return Pedidos.obter(orderId);
  },

  // rotina: pedidos não pagos expiram e devolvem o estoque
  expirarNaoPagos() {
    const horas = Config.num('pagamento_expira_h', 24);
    const corte = new Date(Date.now() - horas * 3600000).toISOString();
    const velhos = db.prepare("SELECT * FROM orders WHERE status = 'aguardando_pagamento' AND criado_em < ?").all(corte);
    for (const o of velhos) {
      Pedidos.cancelarInterno(o, { quem: 'plataforma', papel: 'sistema', detalhe: `Pagamento não realizado em ${horas}h` });
      Notificacoes.criar(o.buyer_id, { titulo: 'Pedido expirado', texto: `O pedido ${o.codigo} expirou sem pagamento.`, url: '/vitrine/app#pedidos' });
    }
    return velhos.length;
  },

  // ---- fluxo do vendedor ----
  prepararEnvio(sellerId, orderId) {
    const o = Pedidos.obter(orderId);
    if (!o || o.seller_id !== sellerId) throw new Error('Pedido não encontrado.');
    return Pedidos.mudarStatus(orderId, 'preparando_envio', { quem: (Users.obter(sellerId) || {}).email, papel: 'vendedor' });
  },
  informarEnvio(sellerId, orderId, { codigo = '', servico = '' } = {}) {
    const o = Pedidos.obter(orderId);
    if (!o || o.seller_id !== sellerId) throw new Error('Pedido não encontrado.');
    if (o.frete_tipo === 'retirada') throw new Error('Pedido de retirada em mãos não tem envio — combine a entrega e peça ao comprador para confirmar o recebimento.');
    let envio = null;
    transacao(() => {
      Pedidos.mudarStatus(orderId, 'enviado', { quem: (Users.obter(sellerId) || {}).email, papel: 'vendedor', detalhe: codigo ? 'Rastreio ' + s(codigo, 60) : 'Postado' });
      envio = frete.Envios.criar(Pedidos.obter(orderId), { codigo, servico });
    });
    Notificacoes.criar(o.buyer_id, { titulo: 'Pedido enviado 📦', texto: `Pedido ${o.codigo} a caminho. Rastreio: ${envio.codigo_rastreio}`, url: '/vitrine/app#pedido-' + o.id });
    return envio;
  },

  // esteira de rastreio simulada tocou "entregue" (ou rotina/admin avançou)
  aoRastreioAvancar(orderId, statusRastreio) {
    const o = Pedidos.obter(orderId);
    if (!o) return;
    if (statusRastreio === 'em_transito' && o.status === 'enviado') {
      Pedidos.mudarStatus(orderId, 'em_transito', { quem: 'rastreio simulado', papel: 'sistema' });
    }
    if (statusRastreio === 'entregue' && ['enviado', 'em_transito'].includes(o.status)) {
      Pedidos.marcarEntregue(o, { quem: 'rastreio simulado', papel: 'sistema' });
    }
  },
  marcarEntregue(o, { quem, papel }) {
    transacao(() => {
      Pedidos.mudarStatus(o.id, 'entregue', { quem, papel, detalhe: 'Entrega confirmada' });
      const sh = frete.Envios.doPedido(o.id);
      const noPrazo = !sh || !sh.previsao_entrega || nowISO().slice(0, 10) <= sh.previsao_entrega;
      db.prepare('UPDATE seller_profiles SET entregas_total = entregas_total + 1, entregas_no_prazo = entregas_no_prazo + ? WHERE user_id = ?')
        .run(noPrazo ? 1 : 0, o.seller_id);
      if (sh && sh.status !== 'entregue') frete.Envios.registrarManual(sh.id, { status: 'entregue', descricao: 'Recebimento confirmado pelo comprador', local: '' });
    });
    Notificacoes.criar(o.buyer_id, { titulo: 'Pedido entregue 🎉', texto: `Chegou! Avalie sua compra do pedido ${o.codigo}.`, url: '/vitrine/app#pedido-' + o.id });
  },
  confirmarRecebimento(buyerId, orderId) {
    const o = Pedidos.obter(orderId);
    if (!o || o.buyer_id !== buyerId) throw new Error('Pedido não encontrado.');
    const quem = (Users.obter(buyerId) || {}).email;
    if (o.frete_tipo === 'retirada' && ['pago', 'preparando_envio'].includes(o.status)) {
      // retirada em mãos não passa por 'enviado': o aceite do comprador é a entrega
      transacao(() => {
        Pedidos.mudarStatus(orderId, 'enviado', { quem, papel: 'comprador', detalhe: 'Retirada em mãos combinada' });
        Pedidos.marcarEntregue(Pedidos.obter(orderId), { quem, papel: 'comprador' });
      });
      return Pedidos.obter(orderId);
    }
    Pedidos.marcarEntregue(o, { quem, papel: 'comprador' });
    return Pedidos.obter(orderId);
  },

  // conclusão: libera o repasse. Comprador conclui na hora; a rotina conclui
  // sozinha depois da janela de devolução.
  concluir(orderId, { quem = 'plataforma', papel = 'sistema' } = {}) {
    const o = Pedidos.obter(orderId);
    if (!o) throw new Error('Pedido não encontrado.');
    transacao(() => {
      Pedidos.mudarStatus(orderId, 'concluido', { quem, papel, detalhe: 'Repasse liberado ao vendedor' });
      db.prepare("UPDATE seller_payouts SET status = 'liberado', liberado_em = ? WHERE order_id = ? AND status = 'previsto'").run(nowISO(), orderId);
      db.prepare('UPDATE seller_profiles SET vendas_concluidas = vendas_concluidas + 1 WHERE user_id = ?').run(o.seller_id);
      for (const i of Pedidos.itens(orderId)) {
        db.prepare('UPDATE products SET vendidos = vendidos + ? WHERE id = ?').run(i.quantidade, i.product_id);
        db.prepare("UPDATE products SET status = 'vendido', atualizado_em = ? WHERE id = ? AND quantidade <= 0 AND status = 'ativo'").run(nowISO(), i.product_id);
      }
    });
    Notificacoes.criar(o.seller_id, { titulo: 'Venda concluída 💰', texto: `Pedido ${o.codigo}: repasse liberado.`, url: '/vitrine/app#vendas' });
    return Pedidos.obter(orderId);
  },
  concluirVencidos() {
    const dias = Config.num('janela_devolucao_dias', 7);
    const corte = new Date(Date.now() - dias * 86400000).toISOString();
    const prontos = db.prepare("SELECT id FROM orders WHERE status = 'entregue' AND entregue_em != '' AND entregue_em < ?").all(corte);
    for (const p of prontos) Pedidos.concluir(p.id);
    return prontos.length;
  },

  // ---- devolução e disputa ----
  solicitarDevolucao(buyerId, orderId, { motivo, detalhe = '' } = {}) {
    const o = Pedidos.obter(orderId);
    if (!o || o.buyer_id !== buyerId) throw new Error('Pedido não encontrado.');
    if (!s(motivo, 80)) throw new Error('Informe o motivo da devolução.');
    transacao(() => {
      Pedidos.mudarStatus(orderId, 'devolucao_solicitada', { quem: (Users.obter(buyerId) || {}).email, papel: 'comprador', detalhe: s(motivo, 200) });
      db.prepare('INSERT INTO disputes (id, order_id, aberto_por, motivo, detalhe, criado_em) VALUES (?,?,?,?,?,?)')
        .run(novoId(), orderId, buyerId, s(motivo, 80), s(detalhe, 1000), nowISO());
    });
    Notificacoes.criar(o.seller_id, { titulo: 'Devolução solicitada', texto: `Pedido ${o.codigo}: ${s(motivo, 100)}`, url: '/vitrine/app#vendas' });
    return Pedidos.obter(orderId);
  },
  async responderDevolucao(sellerId, orderId, { aceitar = false, justificativa = '' } = {}) {
    const o = Pedidos.obter(orderId);
    if (!o || o.seller_id !== sellerId) throw new Error('Pedido não encontrado.');
    if (o.status !== 'devolucao_solicitada') throw new Error('Não há devolução aberta neste pedido.');
    const quem = (Users.obter(sellerId) || {}).email;
    if (aceitar) {
      await pagamentos.Pagamentos.reembolsar(o.id, o.total_centavos);
      transacao(() => {
        Pedidos.mudarStatus(orderId, 'reembolsado', { quem, papel: 'vendedor', detalhe: 'Devolução aceita — reembolso integral' });
        db.prepare("UPDATE disputes SET status = 'resolvida', resolucao = 'reembolso_total', valor_reembolso_centavos = ?, resolvido_em = ? WHERE order_id = ?")
          .run(o.total_centavos, nowISO(), orderId);
        db.prepare("UPDATE seller_payouts SET status = 'cancelado' WHERE order_id = ? AND status IN ('previsto','liberado')").run(orderId);
      });
      Notificacoes.criar(o.buyer_id, { titulo: 'Devolução aceita', texto: `Pedido ${o.codigo}: reembolso integral a caminho.`, url: '/vitrine/app#pedidos' });
    } else {
      Pedidos.mudarStatus(orderId, 'em_disputa', { quem, papel: 'vendedor', detalhe: s(justificativa, 200) || 'Vendedor contestou a devolução' });
      Notificacoes.criar(o.buyer_id, { titulo: 'Devolução contestada', texto: `Pedido ${o.codigo} entrou em disputa. Nossa equipe vai mediar.`, url: '/vitrine/app#pedidos' });
    }
    return Pedidos.obter(orderId);
  },
  async resolverDisputa(orderId, { resolucao, valorCentavos = 0, quem = '' } = {}) {
    const o = Pedidos.obter(orderId);
    if (!o) throw new Error('Pedido não encontrado.');
    if (!['devolucao_solicitada', 'em_disputa'].includes(o.status)) throw new Error('Não há disputa aberta neste pedido.');
    const agora = nowISO();
    if (resolucao === 'reembolso_total' || resolucao === 'reembolso_parcial') {
      const valor = resolucao === 'reembolso_total' ? o.total_centavos : Math.min(cent(valorCentavos), o.total_centavos);
      if (valor < 1) throw new Error('Informe o valor do reembolso parcial.');
      await pagamentos.Pagamentos.reembolsar(o.id, valor);
      transacao(() => {
        Pedidos.mudarStatus(orderId, 'reembolsado', { quem, papel: 'admin', detalhe: `Disputa: ${resolucao} de ${valor} centavos` });
        db.prepare("UPDATE disputes SET status = 'resolvida', resolucao = ?, valor_reembolso_centavos = ?, resolvido_em = ? WHERE order_id = ?")
          .run(resolucao, valor, agora, orderId);
        db.prepare("UPDATE seller_payouts SET status = 'cancelado' WHERE order_id = ? AND status IN ('previsto','liberado')").run(orderId);
      });
    } else if (resolucao === 'liberar_vendedor') {
      transacao(() => {
        db.prepare("UPDATE disputes SET status = 'resolvida', resolucao = 'liberar_vendedor', resolvido_em = ? WHERE order_id = ?").run(agora, orderId);
        Pedidos.concluir(orderId, { quem, papel: 'admin' });
      });
    } else throw new Error('Resolução inválida.');
    Auditoria.registrar({ quem, acao: 'disputa.resolver', entidade: 'orders', entidade_id: orderId, detalhe: resolucao });
    return Pedidos.obter(orderId);
  },

  // ---- listagens ----
  doComprador(buyerId) {
    return db.prepare(`SELECT o.*, sp.loja_nome, sp.loja_slug,
        (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS num_itens
      FROM orders o JOIN seller_profiles sp ON sp.user_id = o.seller_id
      WHERE o.buyer_id = ? ORDER BY o.criado_em DESC LIMIT 100`).all(s(buyerId, 40));
  },
  doVendedor(sellerId) {
    return db.prepare(`SELECT o.*, u.nome AS comprador_nome,
        (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS num_itens
      FROM orders o JOIN users u ON u.id = o.buyer_id
      WHERE o.seller_id = ? ORDER BY o.criado_em DESC LIMIT 100`).all(s(sellerId, 40));
  },
  completo(orderId, userId, { admin = false } = {}) {
    const o = Pedidos.obter(orderId);
    if (!o) return null;
    if (!admin && o.buyer_id !== userId && o.seller_id !== userId) return null; // isolamento entre contas
    const sh = frete.Envios.doPedido(orderId);
    const pay = pagamentos.Pagamentos.doPedido(orderId);
    return {
      pedido: { ...o, endereco: j.parse(o.endereco_json, null), status_rotulo: STATUS_PEDIDO[o.status] || o.status },
      itens: Pedidos.itens(orderId),
      historico: Pedidos.historico(orderId),
      pagamento: pay ? { id: pay.id, provedor: pay.provedor, ref: pay.provedor_ref, status: pay.status, valor_centavos: pay.valor_centavos, checkout_url: pay.checkout_url || '' } : null,
      envio: sh ? { ...sh, eventos: frete.Envios.eventos(sh.id) } : null,
      disputa: db.prepare('SELECT * FROM disputes WHERE order_id = ?').get(orderId) || null,
      avaliacoes: db.prepare('SELECT order_item_id FROM reviews WHERE order_id = ?').all(orderId).map((r) => r.order_item_id),
      loja: Vendedores.publico(o.seller_id),
      papel: admin ? 'admin' : (o.buyer_id === userId ? 'comprador' : 'vendedor'),
    };
  },

  // resumo financeiro do vendedor (painel)
  resumoVendedor(sellerId) {
    const abertos = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE seller_id = ? AND status IN ('pago','preparando_envio')`).get(sellerId).c;
    const fin = db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN status = 'concluido' THEN subtotal_centavos + frete_centavos ELSE 0 END), 0) AS bruto,
        COALESCE(SUM(CASE WHEN status = 'concluido' THEN comissao_centavos ELSE 0 END), 0) AS comissoes,
        COUNT(CASE WHEN status = 'concluido' THEN 1 END) AS concluidos
      FROM orders WHERE seller_id = ?`).get(sellerId, sellerId);
    const payouts = db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN status = 'previsto' THEN valor_centavos ELSE 0 END), 0) AS previsto,
        COALESCE(SUM(CASE WHEN status = 'liberado' THEN valor_centavos ELSE 0 END), 0) AS liberado,
        COALESCE(SUM(CASE WHEN status = 'pago' THEN valor_centavos ELSE 0 END), 0) AS pago
      FROM seller_payouts WHERE seller_id = ?`).get(sellerId);
    return {
      pedidos_exigindo_acao: abertos,
      receita_bruta_centavos: fin.bruto, comissoes_centavos: fin.comissoes, vendas_concluidas: fin.concluidos,
      saldo_previsto_centavos: payouts.previsto, saldo_liberado_centavos: payouts.liberado, ja_recebido_centavos: payouts.pago,
    };
  },

  rotina() {
    const expirados = Pedidos.expirarNaoPagos();
    const avancos = frete.Envios.rotina();
    for (const a of avancos) {
      const sh = frete.Envios.obter(a.shipment_id);
      if (sh) Pedidos.aoRastreioAvancar(sh.order_id, a.status);
    }
    const concluidos = Pedidos.concluirVencidos();
    return { expirados, rastreios_avancados: avancos.length, concluidos };
  },
};

// ---------------------------------------------------------------------
// Avaliações — só de comprador com pedido ENTREGUE/CONCLUÍDO, 1 por item.
// ---------------------------------------------------------------------
const NOTAS = ['nota_produto', 'nota_descricao', 'nota_embalagem', 'nota_envio', 'nota_atendimento'];
const Avaliacoes = {
  criar(buyerId, { order_item_id, comentario = '', ...notas }) {
    const item = db.prepare('SELECT oi.*, o.buyer_id, o.seller_id, o.status FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.id = ?')
      .get(s(order_item_id, 40));
    if (!item || item.buyer_id !== buyerId) throw new Error('Item de pedido não encontrado.');
    if (!['entregue', 'concluido'].includes(item.status)) throw new Error('Você só pode avaliar depois da entrega.');
    if (db.prepare('SELECT 1 FROM reviews WHERE order_item_id = ?').get(item.id)) throw new Error('Este item já foi avaliado.');
    const valores = {};
    for (const nc of NOTAS) {
      const v = inteiro(notas[nc], 0);
      if (v < 1 || v > 5) throw new Error('Cada nota vai de 1 a 5.');
      valores[nc] = v;
    }
    const id = novoId();
    db.prepare(`INSERT INTO reviews (id, order_id, order_item_id, product_id, seller_id, buyer_id,
        nota_produto, nota_descricao, nota_embalagem, nota_envio, nota_atendimento, comentario, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, item.order_id, item.id, item.product_id, item.seller_id, buyerId,
        valores.nota_produto, valores.nota_descricao, valores.nota_embalagem, valores.nota_envio, valores.nota_atendimento,
        s(comentario, 1000), nowISO());
    Vendedores.recalcularReputacao(item.seller_id);
    Notificacoes.criar(item.seller_id, { titulo: 'Você recebeu uma avaliação ⭐', texto: `"${item.titulo}" foi avaliado pelo comprador.`, url: '/vitrine/app#avaliacoes' });
    return db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  },
  doVendedor(sellerId) {
    return db.prepare(`SELECT r.*, u.nome AS comprador, oi.titulo AS produto
      FROM reviews r JOIN users u ON u.id = r.buyer_id JOIN order_items oi ON oi.id = r.order_item_id
      WHERE r.seller_id = ? AND r.status = 'publicada' ORDER BY r.criado_em DESC LIMIT 100`).all(s(sellerId, 40));
  },
  moderar(id, status, quem) {
    if (!['publicada', 'oculta'].includes(status)) throw new Error('Status inválido.');
    const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(s(id, 40));
    if (!r) throw new Error('Avaliação não encontrada.');
    db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, r.id);
    Vendedores.recalcularReputacao(r.seller_id);
    Auditoria.registrar({ quem, acao: 'avaliacao.moderar', entidade: 'reviews', entidade_id: id, detalhe: status });
  },
};

// ---------------------------------------------------------------------
// Repasses (fila manual, padrão Closet: sem payout automático no MVP)
// ---------------------------------------------------------------------
const Repasses = {
  fila() {
    return db.prepare(`SELECT p.*, o.codigo, sp.loja_nome, sp.pix_tipo, sp.pix_chave
      FROM seller_payouts p JOIN orders o ON o.id = p.order_id JOIN seller_profiles sp ON sp.user_id = p.seller_id
      WHERE p.status = 'liberado' ORDER BY p.liberado_em`).all();
  },
  marcarPago(id, quem) {
    const p = db.prepare('SELECT * FROM seller_payouts WHERE id = ?').get(s(id, 40));
    if (!p || p.status !== 'liberado') throw new Error('Repasse não está liberado.');
    db.prepare("UPDATE seller_payouts SET status = 'pago', pago_em = ? WHERE id = ?").run(nowISO(), p.id);
    Auditoria.registrar({ quem, acao: 'repasse.pagar', entidade: 'seller_payouts', entidade_id: id, detalhe: p.valor_centavos + ' centavos' });
    Notificacoes.criar(p.seller_id, { titulo: 'Repasse pago 💸', texto: 'O valor da sua venda foi transferido.', url: '/vitrine/app#vender' });
    return { ok: true };
  },
};

module.exports = { STATUS_PEDIDO, TRANSICOES, Pedidos, Avaliacoes, Repasses };
