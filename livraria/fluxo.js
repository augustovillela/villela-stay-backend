// =====================================================================
// Livraria Villela — fluxos de negócio (usados pelo webhook e pelo staff)
// Centraliza a "Rotina 1 (PDF)" e a "Rotina 2 (impresso)": ao confirmar
// pagamento → libera PDF, gera token, e-mail, WhatsApp, print job, eventos.
// Tudo IDEMPOTENTE: reprocessar o mesmo pagamento não duplica nada.
// =====================================================================
'use strict';

function criarFluxo({ repo, eventos, emails, enviarEmail, enviarWhatsApp, alertaAugusto, urls }) {
  const TOKEN_HORAS = Number(process.env.LIVRARIA_TOKEN_HORAS || 72);
  const TOKEN_MAX = Number(process.env.LIVRARIA_TOKEN_MAX || 5);

  async function notificar(order, tmpl, { assunto, order_id } = {}) {
    const cli = order.cliente || {};
    if (cli.email) {
      const ok = await enviarEmail(cli.email, tmpl.assunto, tmpl.html);
      repo.Notif.log('email', { destino: cli.email, assunto: tmpl.assunto, order_id: order.id, status: ok ? 'enviado' : 'falha' });
    }
    if (cli.whatsapp && tmpl.texto) {
      const ok = await enviarWhatsApp(cli.whatsapp, tmpl.texto);
      repo.Notif.log('whatsapp', { destino: cli.whatsapp, assunto: tmpl.assunto || assunto || '', order_id: order.id, status: ok ? 'enviado' : 'falha' });
    }
  }

  // Gera tokens de download para todos os livros PDF/combo do pedido e envia e-mails.
  async function entregarPDFs(order) {
    const livrosPdf = (order.itens || []).filter(it => it.tipo === 'pdf' || it.tipo === 'combo');
    for (const it of livrosPdf) {
      const tk = repo.Tokens.gerar(order.id, it.book_id, { horas: TOKEN_HORAS, max: TOKEN_MAX });
      const url = urls.download(tk.id);
      const tmpl = emails.pdfEntregue(order, { downloadUrl: url, titulo: it.titulo_snapshot, validadeHoras: TOKEN_HORAS, maxDownloads: TOKEN_MAX });
      await notificar(order, tmpl);
      await eventos.emitirPedido(eventos.EVENTOS.PDF_ENTREGUE, repo.Orders.obter(order.id), { book_id: it.book_id, download_url: url });
    }
  }

  // Cria print jobs para itens impressos/combo e notifica logística + comprador.
  async function abrirImpressos(order) {
    const impressos = (order.itens || []).filter(it => it.tipo === 'impresso' || it.tipo === 'combo');
    for (const it of impressos) {
      // idempotência: não duplica print job por (order, book)
      const jaExiste = repo.Print.daOrder(order.id).some(p => p.book_id === it.book_id);
      if (jaExiste) continue;
      repo.Print.criar(order.id, it.book_id);
      const tmpl = emails.impressoRecebido(order, { titulo: it.titulo_snapshot });
      await notificar(order, tmpl);
      await eventos.emitirPedido(eventos.EVENTOS.IMPRESSO_CRIADO, repo.Orders.obter(order.id), { book_id: it.book_id });
    }
    if (impressos.length) alertaAugusto(`📦 Novo pedido impresso na Livraria: ${(order.cliente || {}).nome || 'cliente'} — ${impressos.map(i => i.titulo_snapshot).join(', ')}.`).catch(() => {});
  }

  return {
    TOKEN_HORAS, TOKEN_MAX,

    // Confirma pagamento aprovado (idempotente). pag = {provider_payment_id, valor, metodo, raw}.
    async confirmarPagamento(orderId, pag) {
      let order = repo.Orders.obter(orderId);
      if (!order) return null;
      if (order.status === 'pago') return order; // já processado — idempotente
      repo.Payments.atualizarPorOrder(orderId, { status: 'aprovado', provider_payment_id: pag.provider_payment_id || '', metodo: pag.metodo || '', raw: JSON.stringify(pag.raw || {}) });
      order = repo.Orders.atualizarCampos(orderId, {
        status: 'pago', pago_em: new Date().toISOString(),
        entrega_digital: order.tem_pdf ? 'liberado' : 'pendente',
        impressao_status: order.tem_impresso ? 'aguardando' : 'nenhum',
      });
      if (order.cupom_codigo) repo.Coupons.consumir(order.cupom_codigo);
      // Confirmação de compra (visão geral)
      await notificar(order, emails.compraConfirmada(order, { biblioteca: urls.biblioteca(order.id) }));
      await eventos.emitirPedido(eventos.EVENTOS.VENDA_APROVADA, order);
      // Rotina 1 (PDF) + Rotina 2 (impresso)
      if (order.tem_pdf) await entregarPDFs(order);
      if (order.tem_impresso) await abrirImpressos(order);
      alertaAugusto(`💰 Venda na Livraria: ${(order.cliente || {}).nome || 'cliente'} — ${repo.brl(order.valor_total)} (${(order.itens || []).map(i => i.titulo_snapshot + '/' + i.tipo).join(', ')}).`).catch(() => {});
      return repo.Orders.obter(orderId);
    },

    // Pagamento recusado.
    async registrarRecusa(orderId, pag) {
      let order = repo.Orders.obter(orderId);
      if (!order || order.status === 'pago') return order;
      repo.Payments.atualizarPorOrder(orderId, { status: 'recusado', provider_payment_id: pag.provider_payment_id || '', raw: JSON.stringify(pag.raw || {}) });
      order = repo.Orders.atualizarCampos(orderId, { status: 'recusado' });
      await notificar(order, emails.pagamentoFalhou(order, { checkoutUrl: urls.checkoutRetry(order) }));
      await eventos.emitirPedido(eventos.EVENTOS.PAGAMENTO_RECUSADO, order);
      return order;
    },

    // Reenvia link do PDF (staff). Invalida tokens antigos do livro e gera novos.
    async reenviarLink(orderId, bookId, staffUser, ip) {
      const order = repo.Orders.obter(orderId);
      if (!order || order.status !== 'pago') return { erro: 'Pedido não está pago.' };
      const item = (order.itens || []).find(it => it.book_id === bookId && (it.tipo === 'pdf' || it.tipo === 'combo'));
      if (!item) return { erro: 'Este pedido não tem PDF deste livro.' };
      // invalida tokens antigos desse livro nesse pedido
      repo.Tokens.daOrder(orderId).filter(t => t.book_id === bookId).forEach(t => repo.Tokens.bloquear(t.id, false));
      const tk = repo.Tokens.gerar(orderId, bookId, { horas: TOKEN_HORAS, max: TOKEN_MAX });
      const url = urls.download(tk.id);
      const tmpl = emails.linkReenviado(order, { downloadUrl: url, titulo: item.titulo_snapshot, validadeHoras: TOKEN_HORAS });
      await notificar(order, tmpl);
      repo.Audit.log(staffUser, 'link.reenviar', { entidade: 'order', entidade_id: orderId, detalhe: item.titulo_snapshot, ip });
      return { ok: true, url };
    },

    // Bloqueia/reativa acesso ao PDF (fraude/chargeback).
    async bloquearAcesso(orderId, ativo, staffUser, ip) {
      const order = repo.Orders.obter(orderId);
      if (!order) return { erro: 'Pedido não encontrado.' };
      repo.Tokens.bloquearOrder(orderId, ativo);
      repo.Orders.atualizarCampos(orderId, { entrega_digital: ativo ? 'liberado' : 'bloqueado' });
      repo.Audit.log(staffUser, ativo ? 'acesso.liberar' : 'acesso.bloquear', { entidade: 'order', entidade_id: orderId, ip });
      return { ok: true };
    },

    // Reembolso (staff). Marca reembolsado + bloqueia acesso + notifica.
    async reembolsar(orderId, staffUser, ip) {
      const order = repo.Orders.obter(orderId);
      if (!order) return { erro: 'Pedido não encontrado.' };
      repo.Tokens.bloquearOrder(orderId, false);
      repo.Payments.atualizarPorOrder(orderId, { status: 'reembolsado' });
      const upd = repo.Orders.atualizarCampos(orderId, { status: 'reembolsado', entrega_digital: 'bloqueado' });
      await notificar(upd, emails.reembolso(upd, { titulo: (upd.itens[0] || {}).titulo_snapshot }));
      await eventos.emitirPedido(eventos.EVENTOS.REEMBOLSO, upd);
      repo.Audit.log(staffUser, 'pedido.reembolsar', { entidade: 'order', entidade_id: orderId, ip });
      return { ok: true };
    },

    // Atualiza print job; se virou "enviado", notifica o comprador com rastreio.
    async atualizarImpresso(printId, dados, staffUser, ip) {
      const antes = repo.Print.obter(printId);
      if (!antes) return { erro: 'Pedido impresso não encontrado.' };
      const pj = repo.Print.atualizar(printId, dados);
      const order = repo.Orders.obter(pj.order_id);
      // sincroniza status agregado no pedido
      const jobs = repo.Print.daOrder(pj.order_id);
      const todosEntregues = jobs.every(j => j.status === 'entregue');
      const algumEnviado = jobs.some(j => j.status === 'enviado');
      repo.Orders.atualizarCampos(pj.order_id, { impressao_status: todosEntregues ? 'entregue' : (algumEnviado ? 'enviado' : pj.status) });
      repo.Audit.log(staffUser, 'impresso.status', { entidade: 'print_job', entidade_id: printId, detalhe: `${antes.status}→${pj.status}`, ip });
      if (antes.status !== 'enviado' && pj.status === 'enviado' && order) {
        const book = repo.Books.obter(pj.book_id);
        const tmpl = emails.impressoEnviado(order, { titulo: book ? book.titulo : 'seu livro', rastreio: pj.rastreio, transportadora: pj.fornecedor });
        await notificar(order, tmpl);
        await eventos.emitirPedido(eventos.EVENTOS.IMPRESSO_ENVIADO, repo.Orders.obter(pj.order_id), { rastreio: pj.rastreio });
      }
      return { ok: true, print: pj };
    },
  };
}

module.exports = { criarFluxo };
