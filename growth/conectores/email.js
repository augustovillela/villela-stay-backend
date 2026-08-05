// =====================================================================
// Conector de E-MAIL — saída real, entrada declarada pendente.
//
// A saída usa o SMTP que o backend já tem configurado (nodemailer), então
// é honesto marcar como `producao` QUANDO houver transporte injetado.
// Sem transporte, o status cai para `aguardando_credenciais` — não existe
// modo "finge que enviou".
//
// A ENTRADA (responder por e-mail e a resposta voltar para a conversa)
// exige IMAP dedicado com pareamento por Message-ID/References. Isso não
// está implementado, e `canReadMessages` continua false até estar.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { EmailConnector } = require('./base');

let _enviarEmail = null;   // injetado pelo servidor (nodemailer já configurado)

class Email extends EmailConnector {
  constructor() {
    super({
      chave: 'email',
      nome: 'E-mail',
      categoria: 'email',
      status: 'aguardando_credenciais',
      versaoApi: 'smtp',
      verificadoEm: '2026-08-05',
      capacidades: {},          // preenchido em configurar(), conforme o transporte
      limitacoes: [
        'entrada (resposta do cliente voltando para a conversa) exige IMAP dedicado — NÃO implementado',
        'sem autenticação de domínio (SPF/DKIM/DMARC) a entrega fica sujeita a spam',
      ],
      bloqueio: 'transporte SMTP injetado e domínio autenticado',
    });
  }

  /** O servidor injeta o enviador real no boot. */
  configurar({ enviarEmail }) {
    _enviarEmail = typeof enviarEmail === 'function' ? enviarEmail : null;
    this.status = _enviarEmail ? 'producao' : 'aguardando_credenciais';
    this.capacidadesPadrao = Object.assign({}, this.capacidadesPadrao, {
      canReplyMessages: !!_enviarEmail,
      canReadMessages: false,     // sem IMAP, não lê. E dizer o contrário seria mentira.
    });
    return this.status;
  }

  get ativo() { return !!_enviarEmail; }

  async authorize() { return { ok: this.ativo, contaExternaId: 'smtp', escopos: [] }; }
  async disconnect() { return { ok: true }; }
  async getCapabilities() { return Object.assign({}, this.capacidadesPadrao); }

  async healthCheck() {
    return {
      ok: this.ativo, status: this.status, verificadoEm: this.verificadoEm,
      detalhe: this.ativo ? 'SMTP injetado; entrada por IMAP pendente' : 'sem transporte SMTP configurado',
    };
  }

  /**
   * Entrada por IMAP: a arquitetura está pronta (normalizeInbound abaixo),
   * falta o coletor. Enquanto não existir, o método é explícito sobre isso.
   */
  async normalizeInbound(payload = {}) {
    const de = String(payload.de || '').trim();
    if (!de) return [];
    // a thread é o Message-ID raiz: é o que amarra a resposta à conversa
    const thread = String(payload.thread || payload.messageId || crypto.randomBytes(8).toString('base64url'));
    return [{
      canal: 'email',
      chaveExterna: thread.slice(0, 200),
      externaId: String(payload.messageId || '').slice(0, 200),
      texto: String(payload.texto || '').slice(0, 8000),
      tipo: 'texto',
      assunto: String(payload.assunto || '').slice(0, 200),
      identidades: [{ tipo: 'email', valor: de }],
      dadosContato: { nome: String(payload.nome || '').slice(0, 120), origem: 'email' },
      em: payload.em || new Date().toISOString(),
    }];
  }

  async enviar({ para, assunto, html, texto }) {
    if (!_enviarEmail) throw this.naoImplementado('enviar');
    if (!para) { const e = new Error('E-mail de destino ausente.'); e.status = 400; throw e; }
    const ok = await _enviarEmail(para, assunto || '(sem assunto)', html || `<p>${String(texto || '')}</p>`);
    if (!ok) { const e = new Error('O provedor de e-mail recusou o envio.'); e.status = 502; throw e; }
    return { ok: true, externaId: `smtp:${crypto.randomBytes(6).toString('base64url')}`, status: 'enviada' };
  }

  async enviarMensagem({ para, texto, assunto }) {
    return this.enviar({ para, assunto: assunto || 'Sobre o seu contato', texto });
  }

  /** Sem IMAP não há como saber se abriu ou respondeu. */
  async eventosDeEntrega() { throw this.naoImplementado('eventosDeEntrega'); }
}

module.exports = new Email();
