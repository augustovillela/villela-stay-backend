// =====================================================================
// Closet Club — e-mails transacionais (onda 3).
//
// Só TRANSACIONAL: cada mensagem é consequência direta de um ato da pessoa
// (pagou, confirmou, retirou, devolveu). Não é marketing, não pede opt-in
// e não carrega descadastro de campanha — mas respeita a chave de config
// `emails_transacionais`, para o Augusto poder desligar tudo num lugar só.
//
// O envio é best-effort e nunca bloqueia uma rota: falha de SMTP não pode
// impedir uma reserva de ser confirmada.
// =====================================================================
'use strict';
const repo = require('./repo');
const { db } = require('./db');
const { Config, Users, s, n } = repo;

const SITE = (process.env.CLOSET_BASE_URL || 'https://closet.villelastay.com.br').replace(/\/+$/, '');
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const dia = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

let _enviarEmail = null;
function configurar({ enviarEmail } = {}) { if (enviarEmail) _enviarEmail = enviarEmail; }
const ativo = () => !!_enviarEmail && String(Config.get('emails_transacionais', 'on')).toLowerCase() !== 'off';

// ---------------------------------------------------------------------
// Layout: tabela simples, sem CSS externo — é o que sobrevive a Gmail,
// Outlook e cliente de celular sem virar sopa de letras.
// ---------------------------------------------------------------------
function layout({ titulo, corpo, cta, ctaUrl, rodape = '' }) {
  return `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:0;background:#F4F4F4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F4;padding:28px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF">
    <tr><td style="padding:26px 30px 0;font-family:Georgia,serif;font-size:20px;letter-spacing:.02em;color:#111111">
      CLOSET <i style="color:#C6A96B">Club</i></td></tr>
    <tr><td style="padding:22px 30px 0;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#111111">${esc(titulo)}</td></tr>
    <tr><td style="padding:16px 30px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#333333">${corpo}</td></tr>
    ${cta ? `<tr><td style="padding:26px 30px 0">
      <a href="${esc(ctaUrl)}" style="display:inline-block;background:#111111;color:#FFFFFF;text-decoration:none;
        padding:14px 26px;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">${esc(cta)}</a>
    </td></tr>` : ''}
    <tr><td style="padding:28px 30px 30px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8A8A8A">
      ${rodape ? esc(rodape) + '<br><br>' : ''}
      Este é um aviso automático sobre uma reserva sua no Closet Club.<br>
      Uma marca do Grupo Villela Stay · CNPJ 56.776.526/0001-12
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const linhaItens = (b) => (b.itens || []).map((i) => `• ${esc(i.titulo)}`).join('<br>');
const periodo = (b) => `${dia(b.data_retirada)} a ${dia(b.data_devolucao)}`;

// ---------------------------------------------------------------------
// Modelos. Cada um recebe a reserva já mapeada e devolve {assunto, html}.
// ---------------------------------------------------------------------
const MODELOS = {
  'cliente.pagamento-confirmado': (b) => ({
    assunto: `Pagamento confirmado — reserva ${b.codigo}`,
    html: layout({
      titulo: 'Recebemos seu pagamento.',
      corpo: `<b>Reserva ${esc(b.codigo)}</b> · ${periodo(b)}<br><br>${linhaItens(b)}<br><br>
        O valor de <b>${brl(b.total_centavos)}</b> está <b>bloqueado com a plataforma</b> — a proprietária
        ainda não recebeu nada. Ela tem ${Config.num('prazo_confirmacao_h', 24)} horas para confirmar.
        Se não confirmar, devolvemos tudo automaticamente.`,
      cta: 'Acompanhar reserva', ctaUrl: `${SITE}/closet/app#minhas-reservas`,
    }),
  }),

  'dono.nova-reserva': (b) => ({
    assunto: `Nova reserva paga — ${b.codigo}`,
    html: layout({
      titulo: 'Você tem uma reserva paga.',
      corpo: `<b>Reserva ${esc(b.codigo)}</b> · ${periodo(b)}<br><br>${linhaItens(b)}<br><br>
        O cliente já pagou e o valor está bloqueado. <b>Confirme em até ${Config.num('prazo_confirmacao_h', 24)} horas</b>
        para gerar o QR Code de retirada — passando o prazo, a reserva é cancelada e o cliente reembolsado.`,
      cta: 'Confirmar agora', ctaUrl: `${SITE}/closet/app#reservas`,
    }),
  }),

  'cliente.confirmada': (b) => ({
    assunto: `Reserva confirmada — ${b.codigo}`,
    html: layout({
      titulo: 'Está confirmado.',
      corpo: `<b>Reserva ${esc(b.codigo)}</b> · ${periodo(b)}<br><br>${linhaItens(b)}<br><br>
        Seu <b>QR Code de retirada</b> já está no app. Mostre na hora de pegar a peça: é ele que registra
        a entrega com data, hora e autor.`,
      cta: 'Ver meu QR Code', ctaUrl: `${SITE}/closet/app#minhas-reservas`,
    }),
  }),

  'cliente.encerrada': (b, extra = {}) => ({
    assunto: `Reserva ${b.codigo} — ${esc(extra.rotulo || 'encerrada')}`,
    html: layout({
      titulo: extra.rotulo === 'recusada' ? 'A proprietária não pôde confirmar.' : 'Sua reserva foi cancelada.',
      corpo: `<b>Reserva ${esc(b.codigo)}</b> · ${periodo(b)}<br><br>
        ${esc(b.motivo_status || '')}<br><br>
        ${b.reembolso_centavos ? `Reembolso de <b>${brl(b.reembolso_centavos)}</b> em processamento — o prazo de
        aparecer na sua conta depende do banco.` : 'Não houve valor a reembolsar nesta reserva.'}`,
      cta: 'Ver outras peças', ctaUrl: `${SITE}/closet/vitrine`,
    }),
  }),

  'dono.devolucao': (b) => ({
    assunto: `Devolução registrada — ${b.codigo}`,
    html: layout({
      titulo: 'A peça voltou. Confira.',
      corpo: `<b>Reserva ${esc(b.codigo)}</b><br><br>${linhaItens(b)}<br><br>
        Você tem <b>${Config.num('janela_vistoria_h', 24)} horas</b> para conferir e relatar qualquer dano.
        Sem contestação nesse prazo, o repasse é liberado automaticamente — não precisa fazer nada.`,
      cta: 'Conferir reserva', ctaUrl: `${SITE}/closet/app#reservas`,
    }),
  }),

  'dono.repasse': (b, extra = {}) => ({
    assunto: `Repasse liberado — ${b.codigo}`,
    html: layout({
      titulo: 'Seu repasse foi liberado.',
      corpo: `<b>Reserva ${esc(b.codigo)}</b><br><br>
        Valor a receber: <b>${brl(extra.valor_centavos)}</b> (já com a comissão de ${b.comissao_pct}% descontada).<br><br>
        ${extra.tem_pix ? 'O Pix vai para a chave cadastrada no seu painel.'
        : '<b>Cadastre sua chave Pix no painel</b> para receber — sem ela o valor fica retido.'}`,
      cta: 'Ver financeiro', ctaUrl: `${SITE}/closet/app#financeiro`,
    }),
  }),

  'cliente.avalie': (b) => ({
    assunto: `Como foi? — reserva ${b.codigo}`,
    html: layout({
      titulo: 'Conte como foi.',
      corpo: `<b>Reserva ${esc(b.codigo)}</b> está concluída e sua caução foi devolvida.<br><br>
        Sua avaliação é o que faz a próxima pessoa confiar em alugar — leva menos de um minuto.`,
      cta: 'Avaliar', ctaUrl: `${SITE}/closet/app#minhas-reservas`,
    }),
  }),
};

// ---------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------
async function enviar(userId, chave, reserva, extra = {}) {
  if (!ativo()) return { ok: false, motivo: 'desligado' };
  const modelo = MODELOS[chave];
  if (!modelo) return { ok: false, motivo: 'modelo inexistente: ' + chave };
  const u = db.prepare("SELECT email, status FROM users WHERE id = ?").get(s(userId, 40));
  // conta anonimizada por LGPD não recebe mais nada
  if (!u || !u.email || u.status === 'excluido' || u.email.endsWith('@closet.local')) return { ok: false, motivo: 'sem e-mail' };
  try {
    const { assunto, html } = modelo(reserva, extra);
    await _enviarEmail(u.email, assunto, html);
    repo.evento(userId, 'email.enviado', chave, { reserva: reserva.codigo });
    return { ok: true };
  } catch (e) {
    console.warn('[closet/emails] falha ao enviar', chave, e.message);
    return { ok: false, motivo: e.message };
  }
}

module.exports = { configurar, ativo, enviar, layout, MODELOS };
