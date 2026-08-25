// =====================================================================
// Livraria Villela — FOLLOW-UP pós-compra (pedido de avaliação)
//
// Alguns dias depois da entrega, o comprador recebe uma mensagem curta
// pedindo a opinião dele sobre o livro. Decisões do Augusto (23/08/2026):
// e-mail, 7 dias, automático.
//
// Por que e-mail e não WhatsApp: fora da janela de 24h a Meta só entrega
// TEMPLATE APROVADO, e não existe template de avaliação de livro. Além
// disso o WhatsApp é opcional no checkout — e-mail cobre todo comprador.
// Quando o template for aprovado, basta ligar LIVRARIA_FOLLOWUP_CANAL=whatsapp
// (o texto está em dados\ti\templates-whatsapp-livraria.md).
//
// Idempotência: cada envio grava `followup_enviado_em` no pedido. A varredura
// só pega pedido pago, não reembolsado, com PDF entregue e sem essa marca —
// reiniciar o servidor ou rodar duas vezes no mesmo dia não duplica.
// =====================================================================
'use strict';

function criarFollowup({ repo, emails, enviarEmail, enviarWhatsApp, urls, alertaAugusto }) {
  const DIAS = Number(process.env.LIVRARIA_FOLLOWUP_DIAS || 7);
  // Janela máxima: passado disto a mensagem fica fora de contexto ("faz alguns
  // dias" um mês depois soa mal) e provavelmente é pedido antigo reprocessado.
  const JANELA = Number(process.env.LIVRARIA_FOLLOWUP_JANELA || 30);
  const CANAL = String(process.env.LIVRARIA_FOLLOWUP_CANAL || 'email').toLowerCase();
  const LIGADO = String(process.env.LIVRARIA_FOLLOWUP || 'on').toLowerCase() !== 'off';
  const HORA = Number(process.env.LIVRARIA_FOLLOWUP_HORA || 10);   // 10h de Brasília
  const TETO = Number(process.env.LIVRARIA_FOLLOWUP_MAX || 50);    // por passada

  // Pedidos que já passaram do prazo e ainda não receberam follow-up.
  // `listar` traz a linha crua (sem itens/cliente completos) — por isso o
  // `obter` depois, que hidrata itens, cliente e pagamentos.
  function pendentes(agora = new Date()) {
    const limite = new Date(agora.getTime() - DIAS * 24 * 3600 * 1000).toISOString();
    const piso = new Date(agora.getTime() - (DIAS + JANELA) * 24 * 3600 * 1000).toISOString();
    // `listar` já exclui pedido de teste por padrão; o `!o.teste` fica explícito
    // porque este é um envio automático, dias depois — a segunda trava custa uma linha.
    return repo.Orders.listar({ status: 'pago', limite: 500 })
      .filter(o => !o.teste && o.pago_em && o.pago_em <= limite && o.pago_em >= piso && !o.followup_enviado_em)
      .slice(0, TETO)
      .map(o => repo.Orders.obter(o.id))
      .filter(o => o && (o.cliente || {}).email);
  }

  async function enviarUm(order) {
    const cli = order.cliente || {};
    const titulos = (order.itens || []).map(i => i.titulo_snapshot);
    const tmpl = emails.pedidoAvaliacao(order, {
      titulos,
      suporte: `${require('./storefront').SITE}/suporte-livros`,
      biblioteca: urls.biblioteca(order.id),
    });
    let ok = false;
    if (CANAL === 'whatsapp' && cli.whatsapp) {
      ok = await enviarWhatsApp(cli.whatsapp, tmpl.texto);
      repo.Notif.log('whatsapp', { destino: cli.whatsapp, assunto: tmpl.assunto, order_id: order.id, status: ok ? 'enviado' : 'falha' });
    }
    if (!ok) {   // e-mail é o canal padrão e o fallback do WhatsApp
      ok = await enviarEmail(cli.email, tmpl.assunto, tmpl.html);
      repo.Notif.log('email', { destino: cli.email, assunto: tmpl.assunto, order_id: order.id, status: ok ? 'enviado' : 'falha' });
    }
    // Marca mesmo em caso de falha de entrega: sem isso, um e-mail inválido
    // faria a rotina tentar de novo todo dia, para sempre.
    repo.Orders.atualizarCampos(order.id, { followup_enviado_em: new Date().toISOString() });
    return ok;
  }

  async function rodar() {
    if (!LIGADO) return { enviados: 0, desligado: true };
    const fila = pendentes();
    let enviados = 0;
    for (const o of fila) {
      try { if (await enviarUm(o)) enviados++; } catch (e) { console.error('[livraria followup]', o.id, e.message); }
    }
    if (enviados) console.log(`[livraria] follow-up enviado para ${enviados} comprador(es).`);
    return { enviados, fila: fila.length };
  }

  let _timer = null;
  function agendar() {
    if (!LIGADO || _timer) return;
    // Mesmo padrão do legal-saas: acorda a cada 15 min e só age na hora certa.
    // O servidor do Render reinicia a qualquer momento; a marca no pedido é o
    // que garante que ninguém receba duas vezes.
    _timer = setInterval(() => {
      const hb = (new Date().getUTCHours() + 24 - 3) % 24;   // Brasília = UTC-3
      if (hb === HORA) rodar().catch(() => {});
    }, 15 * 60 * 1000);
    if (_timer.unref) _timer.unref();
  }

  return { agendar, rodar, pendentes, DIAS, CANAL };
}

module.exports = { criarFollowup };
