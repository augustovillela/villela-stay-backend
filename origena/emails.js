// =====================================================================
// ORIGENA — e-mails transacionais.
// Sem provedor configurado, vira no-op com log (o produto funciona e é
// testável antes de plugar SMTP — mesmo padrão do modo manual do billing).
// Nunca põe conteúdo do acervo no corpo do e-mail (PRIVACY.md §7).
// =====================================================================
'use strict';

let _enviar = null;
const configurar = ({ enviarEmail } = {}) => { if (enviarEmail) _enviar = enviarEmail; };
const ativo = () => !!_enviar;

const BASE = (process.env.ORIGENA_URL || 'https://origena.villelastay.com.br').replace(/\/+$/, '');
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const molde = (titulo, corpo) => `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;color:#1C1A17">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 6px">Origena</h1>
  <p style="color:#6B655C;font-size:14px;margin:0 0 24px">Suas origens. Suas histórias. Seu legado.</p>
  <h2 style="font-size:18px;font-weight:600;margin:0 0 12px">${esc(titulo)}</h2>
  <div style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.6">${corpo}</div>
  <p style="color:#9A9287;font-size:12px;margin-top:32px;font-family:Inter,system-ui,sans-serif">
    Se você não esperava esta mensagem, pode ignorá-la com segurança.</p>
</div>`;

const botao = (url, texto) =>
  `<p style="margin:22px 0"><a href="${url}" style="background:#7A5C3E;color:#fff;padding:12px 22px;
   border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">${esc(texto)}</a></p>`;

async function mandar(para, assunto, html) {
  if (!_enviar) { console.log(`[origena/emails] (desligado) → ${para}: ${assunto}`); return false; }
  try { await _enviar(para, assunto, html); return true; }
  catch (e) { console.error('[origena/emails] falhou:', e.message); return false; }
}

const verificacao = (para, nome, token) => mandar(para, 'Confirme seu e-mail — Origena',
  molde('Falta um passo', `<p>Olá, ${esc(nome)}.</p>
   <p>Confirme seu e-mail para começar a guardar a memória da sua família.</p>
   ${botao(`${BASE}/origena/verificar?token=${encodeURIComponent(token)}`, 'Confirmar meu e-mail')}
   <p style="color:#6B655C;font-size:13px">O link vale por 3 dias.</p>`));

const convite = (para, { familia, quem, papel, token, mensagem }) => mandar(para,
  `${quem} convidou você para a família ${familia} — Origena`,
  molde(`${esc(quem)} convidou você`, `
   <p>Você foi convidado para participar da memória da família <strong>${esc(familia)}</strong>
      na Origena, como <strong>${esc(papel)}</strong>.</p>
   ${mensagem ? `<p style="border-left:3px solid #E8E2D9;padding-left:14px;color:#6B655C">${esc(mensagem)}</p>` : ''}
   ${botao(`${BASE}/origena/convite?token=${encodeURIComponent(token)}`, 'Aceitar o convite')}
   <p style="color:#6B655C;font-size:13px">O convite vale por 14 dias e só funciona para este e-mail.</p>`));

const recuperacao = (para, nome, token) => mandar(para, 'Recuperar acesso — Origena',
  molde('Recuperar acesso', `<p>Olá, ${esc(nome)}.</p>
   <p>Recebemos um pedido para redefinir sua senha.</p>
   ${botao(`${BASE}/origena/nova-senha?token=${encodeURIComponent(token)}`, 'Escolher nova senha')}
   <p style="color:#6B655C;font-size:13px">O link vale por 1 hora. Sua senha atual continua valendo até você trocá-la.</p>`));

const avisoSeguranca = (para, nome, oque) => mandar(para, 'Aviso de segurança — Origena',
  molde('Algo mudou na sua conta', `<p>Olá, ${esc(nome)}.</p>
   <p>${esc(oque)}</p>
   <p>Se não foi você, troque sua senha agora e fale com a gente.</p>`));

module.exports = { configurar, ativo, verificacao, convite, recuperacao, avisoSeguranca };
