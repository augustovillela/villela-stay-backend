// =====================================================================
// ORIGENA — e-mails transacionais.
// Sem provedor configurado, vira no-op com log (o produto funciona e é
// testável antes de plugar SMTP — mesmo padrão do modo manual do billing).
// Nunca põe conteúdo do acervo no corpo do e-mail (PRIVACY.md §7).
//
// O idioma vem de quem RECEBE (users.idioma), não de quem disparou: o
// convite do Augusto para uma prima em Lisboa sai na língua dela.
// =====================================================================
'use strict';
const i18n = require('./i18n');

let _enviar = null;
const configurar = ({ enviarEmail } = {}) => { if (enviarEmail) _enviar = enviarEmail; };
const ativo = () => !!_enviar;

const BASE = (process.env.ORIGENA_URL || 'https://origena.villelastay.com.br').replace(/\/+$/, '');
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const molde = (idioma, titulo, corpo) => `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;color:#1C1A17">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 6px">${esc(i18n.t(idioma, 'produto.nome'))}</h1>
  <p style="color:#6B655C;font-size:14px;margin:0 0 24px">${esc(i18n.t(idioma, 'produto.assinatura'))}</p>
  <h2 style="font-size:18px;font-weight:600;margin:0 0 12px">${esc(titulo)}</h2>
  <div style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.6">${corpo}</div>
  <p style="color:#9A9287;font-size:12px;margin-top:32px;font-family:Inter,system-ui,sans-serif">
    ${esc(i18n.t(idioma, 'email.rodape'))}</p>
</div>`;

const botao = (url, texto) =>
  `<p style="margin:22px 0"><a href="${url}" style="background:#7A5C3E;color:#fff;padding:12px 22px;
   border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">${esc(texto)}</a></p>`;

const link = (rota, token) => `${BASE}/origena/${rota}?token=${encodeURIComponent(token)}`;

async function mandar(para, assunto, html) {
  if (!_enviar) { console.log(`[origena/emails] (desligado) → ${para}: ${assunto}`); return false; }
  try { await _enviar(para, assunto, html); return true; }
  catch (e) { console.error('[origena/emails] falhou:', e.message); return false; }
}

function verificacao(para, nome, token, idioma) {
  const t = (c, v) => i18n.t(idioma, c, v);
  return mandar(para, t('email.verificacao_assunto'),
    molde(idioma, t('email.verificacao_titulo'), `
      <p>${esc(t('email.verificacao_ola', { nome }))}</p>
      <p>${esc(t('email.verificacao_p'))}</p>
      ${botao(link('verificar', token), t('email.verificacao_botao'))}
      <p style="color:#6B655C;font-size:13px">${esc(t('email.verificacao_validade'))}</p>`));
}

function convite(para, { familia, quem, papel, token, mensagem }, idioma) {
  const t = (c, v) => i18n.t(idioma, c, v);
  const papelLegivel = t('papel.' + papel);
  return mandar(para, t('email.convite_assunto', { quem, familia }),
    molde(idioma, t('email.convite_titulo', { quem }), `
      <p>${t('email.convite_p', { familia: esc(familia), papel: esc(papelLegivel) })}</p>
      ${mensagem ? `<p style="border-left:3px solid #E8E2D9;padding-left:14px;color:#6B655C">${esc(mensagem)}</p>` : ''}
      ${botao(link('convite', token), t('email.convite_botao'))}
      <p style="color:#6B655C;font-size:13px">${esc(t('email.convite_validade'))}</p>`));
}

function recuperacao(para, nome, token, idioma) {
  const t = (c, v) => i18n.t(idioma, c, v);
  return mandar(para, t('email.recuperacao_assunto'),
    molde(idioma, t('email.recuperacao_titulo'), `
      <p>${esc(t('email.verificacao_ola', { nome }))}</p>
      <p>${esc(t('email.recuperacao_p'))}</p>
      ${botao(link('nova-senha', token), t('email.recuperacao_botao'))}
      <p style="color:#6B655C;font-size:13px">${esc(t('email.recuperacao_validade'))}</p>`));
}

/**
 * Missões novas (§30/§87). O e-mail diz QUANTAS, nunca QUAIS: a pergunta
 * carrega nome de parente, e nome de parente é dado pessoal de terceiro
 * (PRIVACY.md §7). O conteúdo mora atrás do login.
 */
function missoes(para, { familia, n }, idioma) {
  const t = (c, v) => i18n.t(idioma, c, v);
  return mandar(para, t('email.missoes_assunto'),
    molde(idioma, t('email.missoes_titulo'), `
      <p>${esc(t('email.missoes_p', { familia, n }))}</p>
      ${botao(`${BASE}/origena/app`, t('email.missoes_botao'))}
      <p style="color:#6B655C;font-size:13px">${esc(t('email.missoes_optout'))}</p>`));
}

/** `chaveDoQue` é a CHAVE i18n do que mudou, não o texto pronto. */
function avisoSeguranca(para, nome, chaveDoQue, idioma) {
  const t = (c, v) => i18n.t(idioma, c, v);
  return mandar(para, t('email.seguranca_assunto'),
    molde(idioma, t('email.seguranca_titulo'), `
      <p>${esc(t('email.verificacao_ola', { nome }))}</p>
      <p>${esc(t(chaveDoQue))}</p>
      <p>${esc(t('email.seguranca_p'))}</p>`));
}

module.exports = { configurar, ativo, verificacao, convite, recuperacao, avisoSeguranca, missoes };
