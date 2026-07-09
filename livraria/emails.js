// =====================================================================
// Livraria Villela — templates transacionais (e-mail HTML + texto WhatsApp)
// Funções puras: recebem dados, devolvem { assunto, html, texto }.
// O envio em si é feito pelos helpers injetados (enviarEmail/enviarWhatsApp).
// Paleta Grupo Villela Stay: navy #1B2A4A, bordô editorial #7F1D1D, dourado #C9A227.
// =====================================================================
'use strict';
const { brl } = require('./repo');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const primeiroNome = (n) => String(n || 'leitor(a)').trim().split(' ')[0];

function wrap(subtitulo, corpo, cta) {
  const botao = cta ? `<p style="margin:22px 0"><a href="${cta.url}" style="background:#7F1D1D;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${esc(cta.texto)}</a></p>` : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:auto;color:#1F2933">
    <div style="background:#1B2A4A;color:#F8F9FA;padding:18px 24px;border-radius:10px 10px 0 0">
      <strong style="font-size:19px">Livraria Villela</strong><br><span style="font-size:13px;color:#C9A227">Livros, ideias e conhecimento aplicado</span></div>
    <div style="border:1px solid #E2E6EC;border-top:none;padding:24px;border-radius:0 0 10px 10px;line-height:1.6">
      <p style="font-size:12px;letter-spacing:.5px;color:#8a9296;text-transform:uppercase;margin:0 0 10px">${esc(subtitulo)}</p>
      ${corpo}${botao}
      <p style="font-size:12px;color:#8a9296;margin-top:22px;border-top:1px solid #eee;padding-top:12px">
        Livraria Villela · Uma empresa do Grupo Villela Stay · Brasília-DF · <a href="/suporte-livros" style="color:#7F1D1D">Suporte</a></p>
    </div></div>`;
}
function itensHtml(order) {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
    ${(order.itens || []).map(it => `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #eee">${esc(it.titulo_snapshot)} <span style="color:#8a9296">(${it.tipo})</span> ×${it.quantidade}</td>
      <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${brl(it.preco_unit * it.quantidade)}</td></tr>`).join('')}
    ${order.desconto > 0 ? `<tr><td style="padding:6px 0;color:#2e7d32">Cupom ${esc(order.cupom_codigo)}</td><td style="padding:6px 0;text-align:right;color:#2e7d32">− ${brl(order.desconto)}</td></tr>` : ''}
    <tr><td style="padding:8px 0;font-weight:bold">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold">${brl(order.valor_total)}</td></tr>
  </table>`;
}

// ------------------------------------------------------------- templates
const T = {
  // 1) Confirmação de compra (pagamento aprovado)
  compraConfirmada(order, { biblioteca }) {
    const nome = primeiroNome(order.cliente && order.cliente.nome);
    const corpo = `<p>Olá, <strong>${esc(nome)}</strong>! Recebemos o seu pagamento — obrigado pela compra. 🎉</p>
      ${itensHtml(order)}
      ${order.tem_pdf ? '<p>O seu PDF já está liberado. Você recebeu (ou vai receber em instantes) um e-mail com o link de download seguro.</p>' : ''}
      ${order.tem_impresso ? '<p>O seu exemplar <strong>impresso</strong> entrou na fila de produção. Avisaremos assim que for enviado, com o código de rastreio.</p>' : ''}`;
    return {
      assunto: 'Compra confirmada — Livraria Villela',
      html: wrap('Pedido confirmado', corpo, biblioteca ? { url: biblioteca, texto: 'Acessar minha biblioteca' } : null),
      texto: `Olá, ${nome}! Pagamento confirmado ✅. ${order.tem_pdf ? 'Seu PDF já está liberado — enviamos o link de download. ' : ''}${order.tem_impresso ? 'Seu exemplar impresso entrou em produção. ' : ''}Obrigado! — Villela Stay`,
    };
  },
  // 2) Entrega do PDF (com link seguro)
  pdfEntregue(order, { downloadUrl, titulo, validadeHoras, maxDownloads }) {
    const nome = primeiroNome(order.cliente && order.cliente.nome);
    const corpo = `<p>Olá, <strong>${esc(nome)}</strong>! Aqui está o seu download de <strong>${esc(titulo)}</strong>. 📕</p>
      <p style="font-size:13px;color:#5a6b72">O link é pessoal e expira em ${validadeHoras}h, com até ${maxDownloads} downloads. Salve o arquivo no seu dispositivo.</p>`;
    return {
      assunto: `Seu download: ${titulo} — Livraria Villela`,
      html: wrap('Download liberado', corpo, { url: downloadUrl, texto: 'Baixar o PDF' }),
      texto: `Olá, ${nome}! 📕 Seu download de "${titulo}" está pronto: ${downloadUrl} (link pessoal, expira em ${validadeHoras}h). — Villela Stay`,
    };
  },
  // 3) Reenvio de link
  linkReenviado(order, { downloadUrl, titulo, validadeHoras }) {
    const nome = primeiroNome(order.cliente && order.cliente.nome);
    const corpo = `<p>Olá, <strong>${esc(nome)}</strong>! Geramos um novo link de download para <strong>${esc(titulo)}</strong>, conforme solicitado.</p>
      <p style="font-size:13px;color:#5a6b72">Este novo link expira em ${validadeHoras}h. Os links anteriores foram desativados.</p>`;
    return {
      assunto: `Novo link de download: ${titulo}`,
      html: wrap('Link reenviado', corpo, { url: downloadUrl, texto: 'Baixar o PDF' }),
      texto: `Olá, ${nome}! Aqui está o novo link para baixar "${titulo}": ${downloadUrl} (expira em ${validadeHoras}h). — Villela Stay`,
    };
  },
  // 4) Pedido impresso recebido
  impressoRecebido(order, { titulo }) {
    const nome = primeiroNome(order.cliente && order.cliente.nome);
    const corpo = `<p>Olá, <strong>${esc(nome)}</strong>! O seu pedido do livro impresso <strong>${esc(titulo)}</strong> foi confirmado e entrou na fila de produção. 📦</p>
      <p>Assim que for despachado, você recebe o código de rastreio por aqui.</p>`;
    return { assunto: `Pedido impresso recebido: ${titulo}`, html: wrap('Impresso em produção', corpo), texto: `Olá, ${nome}! Seu exemplar impresso de "${titulo}" entrou em produção. Avisamos quando enviar. — Villela Stay` };
  },
  // 5) Pedido impresso enviado (com rastreio)
  impressoEnviado(order, { titulo, rastreio, transportadora }) {
    const nome = primeiroNome(order.cliente && order.cliente.nome);
    const corpo = `<p>Olá, <strong>${esc(nome)}</strong>! O seu exemplar de <strong>${esc(titulo)}</strong> foi enviado. 🚚</p>
      ${rastreio ? `<p><strong>Rastreio:</strong> ${esc(rastreio)}${transportadora ? ' (' + esc(transportadora) + ')' : ''}</p>` : ''}`;
    return { assunto: `Seu livro foi enviado: ${titulo}`, html: wrap('Pedido enviado', corpo), texto: `Olá, ${nome}! 🚚 Seu livro "${titulo}" foi enviado.${rastreio ? ' Rastreio: ' + rastreio : ''} — Villela Stay` };
  },
  // 6) Falha de pagamento
  pagamentoFalhou(order, { checkoutUrl }) {
    const nome = primeiroNome(order.cliente && order.cliente.nome);
    const corpo = `<p>Olá, <strong>${esc(nome)}</strong>. Não conseguimos confirmar o pagamento do seu pedido.</p>
      <p>Sem problemas — você pode tentar novamente. Se preferir, fale com a gente pelo WhatsApp que ajudamos.</p>`;
    return { assunto: 'Não conseguimos confirmar seu pagamento', html: wrap('Pagamento não confirmado', corpo, checkoutUrl ? { url: checkoutUrl, texto: 'Tentar novamente' } : null), texto: `Olá, ${nome}. Não conseguimos confirmar seu pagamento. Você pode tentar de novo${checkoutUrl ? ': ' + checkoutUrl : ''}. Precisa de ajuda? Chame aqui. — Villela Stay` };
  },
  // 7) Reembolso
  reembolso(order, { titulo }) {
    const nome = primeiroNome(order.cliente && order.cliente.nome);
    const corpo = `<p>Olá, <strong>${esc(nome)}</strong>. Confirmamos o reembolso do seu pedido${titulo ? ` de <strong>${esc(titulo)}</strong>` : ''} no valor de <strong>${brl(order.valor_total)}</strong>.</p>
      <p style="font-size:13px;color:#5a6b72">O prazo de estorno depende do meio de pagamento. Qualquer dúvida, é só chamar.</p>`;
    return { assunto: 'Reembolso confirmado — Livraria Villela', html: wrap('Reembolso', corpo), texto: `Olá, ${nome}. Seu reembolso de ${brl(order.valor_total)} foi confirmado. — Villela Stay` };
  },
  // 8) Suporte (genérico)
  suporte({ nome, mensagem }) {
    const corpo = `<p>Olá, <strong>${esc(primeiroNome(nome))}</strong>!</p><p>${esc(mensagem)}</p>`;
    return { assunto: 'Villela Stay — Suporte', html: wrap('Suporte', corpo), texto: `Olá, ${primeiroNome(nome)}! ${mensagem} — Villela Stay` };
  },
};

module.exports = T;
