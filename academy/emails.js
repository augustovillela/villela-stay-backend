// =====================================================================
// Villela Academy — COMUNICAÇÕES (FASE 8): e-mails transacionais com
// templates da marca, notificações internas, webhook de saída assinado
// (Make/n8n/CRM) e lembrete de pedido abandonado. Tudo best-effort e
// logado em notification_logs — comunicação nunca derruba o fluxo.
// WhatsApp automático a clientes NÃO entra aqui (regra da casa: business
// só com template aprovado; alertas ao dono já saem por alertaAugusto).
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

let _enviarEmail = null;   // injetado (nodemailer do server.js)
function configurar({ enviarEmail } = {}) {
  if (typeof enviarEmail === 'function') _enviarEmail = enviarEmail;
}
// base p/ links em e-mails disparados fora de um request (webhook/rotina)
const base = () => process.env.ACADEMY_BASE_URL || 'https://villela-stay-backend.onrender.com';
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

function log(canal, destino, template, status, detalhe) {
  db.prepare('INSERT INTO notification_logs (quando, canal, destino, template, status, detalhe) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nowISO(), canal, s(destino, 120), s(template, 60), s(status, 200), s(detalhe, 300));
}

// moldura HTML padrão dos e-mails (marca própria)
function moldura(titulo, corpo, rodape) {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#241f33">
    <div style="background:#1d1440;border-radius:12px 12px 0 0;padding:18px 24px">
      <span style="color:#ffb84d;font-weight:800;font-size:1.1rem">🎓 Villela Academy</span></div>
    <div style="border:1px solid #e8e2f4;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="margin:0 0 12px;color:#1d1440">${titulo}</h2>${corpo}
      <p style="color:#6b6480;font-size:.85rem;margin-top:24px">${rodape || 'Villela Academy — produto da Villela Stay (Augusto Villela Ltda).'}</p>
    </div></div>`;
}
const botao = (url, rotulo) => `<p style="margin:20px 0"><a href="${url}" style="background:#ffb84d;color:#1d1440;font-weight:700;padding:12px 26px;border-radius:24px;text-decoration:none">${rotulo}</a></p>`;

// envio best-effort + log (nunca lança)
async function enviar(para, assunto, html, template) {
  if (!_enviarEmail) return log('email', para, template, 'erro:sem-transporte');
  try { await _enviarEmail(para, assunto, html); log('email', para, template, 'ok'); }
  catch (e) { log('email', para, template, 'erro:' + e.message); }
}

// ---------------- templates transacionais ----------------
const Emails = {
  boasVindas(u, linkVerificacao) {
    return enviar(u.email, 'Bem-vindo à Villela Academy — confirme seu e-mail',
      moldura(`Olá, ${esc(u.nome)}!`,
        `<p>Sua conta na Villela Academy foi criada. Confirme seu e-mail para deixar tudo redondinho:</p>
         ${botao(linkVerificacao, 'Confirmar meu e-mail')}
         <p style="color:#6b6480;font-size:.9rem">Se você não criou esta conta, ignore esta mensagem.</p>`),
      'boas-vindas');
  },
  reenviarVerificacao(u, link) {
    return enviar(u.email, 'Villela Academy — confirme seu e-mail',
      moldura('Confirme seu e-mail', `<p>Olá, ${esc(u.nome)}!</p>${botao(link, 'Confirmar meu e-mail')}`), 'verificacao');
  },
  redefinirSenha(u, link) {
    return enviar(u.email, 'Villela Academy — redefinir senha',
      moldura('Redefinir senha',
        `<p>Recebemos um pedido para redefinir a sua senha. O link vale por 30 minutos:</p>
         ${botao(link, 'Criar nova senha')}
         <p style="color:#6b6480;font-size:.9rem">Se não foi você, ignore — sua senha continua a mesma.</p>`),
      'redefinir-senha');
  },
  compraPaga(u, order, base) {
    return enviar(u.email, `Acesso liberado — ${order.produto_titulo}`,
      moldura('🎉 Acesso liberado!',
        `<p>Seu pagamento de <b>${brl(order.valor_centavos)}</b> foi confirmado e o acesso a
         <b>${esc(order.produto_titulo)}</b> já está na sua biblioteca.</p>
         ${botao(base + '/academy/app', 'Começar agora')}`),
      'compra-paga');
  },
  vendaAoProdutor(prod, order) {
    return enviar(prod.email, `💰 Você vendeu — ${order.produto_titulo}`,
      moldura('Você fez uma venda!',
        `<p><b>${esc(order.produto_titulo)}</b> — ${brl(order.valor_centavos)}.
         Seu líquido: <b>${brl(order.liquido_produtor_centavos)}</b>.</p>`),
      'venda-produtor');
  },
  reembolso(u, order) {
    return enviar(u.email, `Reembolso — ${order.produto_titulo}`,
      moldura('Reembolso processado',
        `<p>O valor de <b>${brl(order.valor_centavos)}</b> de <b>${esc(order.produto_titulo)}</b> foi
         estornado pelo Mercado Pago e o acesso foi encerrado.</p>`),
      'reembolso');
  },
  assinatura(u, sub, estado, base) {
    const tit = { ativa: '🎉 Assinatura ativa!', pausada: '⚠️ Problema na cobrança', cancelada: 'Assinatura cancelada' }[estado];
    const corpo = {
      ativa: `<p>Sua assinatura de <b>${esc(sub.produto_titulo)}</b> (${brl(sub.valor_centavos)}/mês) está ativa.</p>${botao(base + '/academy/app', 'Acessar o clube')}`,
      pausada: `<p>Não conseguimos processar a mensalidade de <b>${esc(sub.produto_titulo)}</b> e o acesso foi pausado. Regularize o pagamento no Mercado Pago para voltar.</p>`,
      cancelada: `<p>Sua assinatura de <b>${esc(sub.produto_titulo)}</b> foi cancelada e o acesso encerrado. Você pode assinar de novo quando quiser.</p>`,
    }[estado];
    return enviar(u.email, `Villela Academy — ${sub.produto_titulo}`, moldura(tit, corpo), 'assinatura-' + estado);
  },
  cortesia(u, produtoTitulo, base) {
    return enviar(u.email, `Você ganhou acesso — ${produtoTitulo}`,
      moldura('🎁 Acesso liberado!',
        `<p>Você recebeu acesso de cortesia a <b>${esc(produtoTitulo)}</b>.</p>${botao(base + '/academy/app', 'Acessar agora')}`),
      'cortesia');
  },
  perfilDecidido(u, tipo, status, motivo) {
    const aprovado = status === 'aprovado';
    return enviar(u.email, `Villela Academy — cadastro de ${tipo} ${aprovado ? 'aprovado' : 'atualizado'}`,
      moldura(aprovado ? `✅ Você agora é ${tipo}!` : `Cadastro de ${tipo}: ${status}`,
        aprovado ? `<p>Seu cadastro foi aprovado — a aba de ${tipo} já está no seu painel.</p>`
          : `<p>Seu cadastro de ${tipo} ficou como <b>${esc(status)}</b>.${motivo ? ' Motivo: ' + esc(motivo) : ''}</p>`),
      'perfil-' + status);
  },
  pedidoAbandonado(u, order, base) {
    return enviar(u.email, `Seu pedido está esperando — ${order.produto_titulo}`,
      moldura('Ficou faltando pouco!',
        `<p>Seu pedido de <b>${esc(order.produto_titulo)}</b> (${brl(order.valor_centavos)}) ainda não foi pago.
         Se algo deu errado no pagamento, é só tentar de novo:</p>
         ${botao(base + '/academy/obrigado?pedido=' + order.id, 'Concluir meu pedido')}
         <p style="color:#6b6480;font-size:.9rem">Se você desistiu, ignore este e-mail — nada foi cobrado.</p>`),
      'pedido-abandonado');
  },
};

// ---------------- notificações internas (sininho) ----------------
const Notificacoes = {
  criar(userId, titulo, texto, url) {
    db.prepare('INSERT INTO notifications (id, user_id, titulo, texto, url, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(novoId(), userId, s(titulo, 160), s(texto, 500), s(url, 200), nowISO());
    log('interna', userId, 'notificacao', 'ok', s(titulo, 80));
  },
  doUsuario(userId) {
    return {
      itens: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY criado_em DESC LIMIT 30').all(userId),
      nao_lidas: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND lida = 0').get(userId).n,
    };
  },
  marcarLidas(userId) { db.prepare('UPDATE notifications SET lida = 1 WHERE user_id = ?').run(userId); },
};

// ---------------- webhook de saída (Make/n8n/CRM) ----------------
// config no staff: POST /staff/api/academy/config {chave:'webhook_saida', valor:{url, secret}}
async function webhookSaida(evento, dados) {
  const cfg = repo.Config.obter('webhook_saida', null);
  if (!cfg || !cfg.url) return;
  const corpo = JSON.stringify({ evento, quando: nowISO(), dados });
  const assinatura = crypto.createHmac('sha256', String(cfg.secret || '')).update(corpo).digest('hex');
  try {
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Academy-Event': evento, 'X-Academy-Signature': assinatura },
      body: corpo,
    });
    log('webhook', cfg.url, evento, r.ok ? 'ok' : 'erro:http-' + r.status);
  } catch (e) { log('webhook', cfg.url, evento, 'erro:' + e.message); }
}

// ---------------- pedido abandonado (lembrete único, pendente 1h–48h) ----------------
async function processarPedidosAbandonados(base) {
  const agora = Date.now();
  const pendentes = db.prepare(`SELECT * FROM orders WHERE status = 'pendente' AND tipo = 'avulsa'
    AND lembrete_em = '' AND valor_centavos > 0`).all()
    .filter(o => {
      const idade = agora - new Date(o.criado_em).getTime();
      return idade > 3600e3 && idade < 48 * 3600e3;
    });
  for (const o of pendentes) {
    const u = repo.Usuarios.porId(o.user_id);
    if (u && u.status === 'ativo') {
      await Emails.pedidoAbandonado(u, o, base);
      Notificacoes.criar(u.id, 'Seu pedido está esperando', `"${o.produto_titulo}" ainda não foi pago — conclua quando quiser.`, '/academy/obrigado?pedido=' + o.id);
    }
    db.prepare('UPDATE orders SET lembrete_em = ? WHERE id = ?').run(nowISO(), o.id);
  }
  return pendentes.length;
}

const Logs = {
  listar(n) { return db.prepare('SELECT * FROM notification_logs ORDER BY id DESC LIMIT ?').all(Math.min(parseInt(n, 10) || 200, 1000)); },
};

module.exports = { configurar, base, Emails, Notificacoes, webhookSaida, processarPedidosAbandonados, Logs };
