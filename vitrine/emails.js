// =====================================================================
// Vitrine — e-mail transacional (best-effort: falha de SMTP nunca
// derruba uma compra). Só consequência direta de ato da pessoa.
// =====================================================================
'use strict';
const repo = require('./repo');

let _enviar = null;
function configurar({ enviarEmail } = {}) { _enviar = enviarEmail || null; }
const ativo = () => !!_enviar;

const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

async function enviar(userId, assunto, html) {
  if (!_enviar) return false;
  const u = repo.Users.obter(userId);
  if (!u || u.status !== 'ativo' || !u.email || u.email.endsWith('@vitrine.local')) return false;
  try { await _enviar(u.email, assunto, html); return true; } catch (_) { return false; }
}

const Emails = {
  configurar, ativo, enviar, brl,
  boasVindas(u, linkVerificacao) {
    if (!_enviar) return;
    _enviar(u.email, 'Vitrine — confirme seu e-mail',
      `<p>Olá, ${u.nome}!</p><p>Bem-vindo(a) à <b>Vitrine</b>. Confirme seu e-mail para comprar e vender:</p>
       <p><a href="${linkVerificacao}">${linkVerificacao}</a></p>
       <p>Se você não criou esta conta, ignore esta mensagem.</p>`).catch(() => {});
  },
  pedidoPago(o) {
    enviar(o.buyer_id, `Vitrine — pedido ${o.codigo} confirmado`,
      `<p>Seu pagamento de <b>${brl(o.total_centavos)}</b> foi aprovado. O vendedor já vai preparar o envio.</p>`);
    enviar(o.seller_id, `Vitrine — você vendeu! Pedido ${o.codigo}`,
      `<p>Pagamento confirmado (${brl(o.total_centavos)}). Prepare o envio pelo seu painel.</p>`);
  },
};

module.exports = Emails;
