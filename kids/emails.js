// =====================================================================
// Villela Kids — e-mail transacional ao RESPONSÁVEL (best-effort: falha
// de SMTP nunca derruba o uso). Nenhum e-mail vai para criança — criança
// não tem e-mail no sistema (minimização LGPD).
// =====================================================================
'use strict';
const repo = require('./repo');

let _enviar = null;
function configurar({ enviarEmail } = {}) { _enviar = enviarEmail || null; }
const ativo = () => !!_enviar;

async function enviar(userId, assunto, html) {
  if (!_enviar) return false;
  const u = repo.Users.obter(userId);
  if (!u || u.status !== 'ativo' || !u.email || u.email.endsWith('@kids.local')) return false;
  try { await _enviar(u.email, assunto, html); return true; } catch (_) { return false; }
}

const Emails = {
  configurar, ativo, enviar,
  boasVindas(u, linkVerificacao) {
    if (!_enviar) return;
    _enviar(u.email, 'Villela Kids — confirme seu e-mail',
      `<p>Olá, ${u.nome}!</p><p>Bem-vindo(a) ao <b>Villela Kids</b> — o clube de missões onde as crianças aprendem criando.</p>
       <p>Confirme seu e-mail: <a href="${linkVerificacao}">${linkVerificacao}</a></p>
       <p>Se você não criou esta conta, ignore esta mensagem.</p>`).catch(() => {});
  },
};

module.exports = Emails;
