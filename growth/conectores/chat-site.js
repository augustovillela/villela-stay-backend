// =====================================================================
// Conector do CHAT DO SITE — o único canal que é nosso.
//
// Não depende de aprovação de plataforma nenhuma: o transporte é a nossa
// própria API. Por isso ele nasce em `producao` com capacidades
// verdadeiras, enquanto os conectores de terceiros ficam em `planejada`
// até a documentação oficial ser lida e a conta aprovada.
//
// É também a prova viva de que a inbox funciona ponta a ponta antes de
// qualquer integração externa existir.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { MessagingConnector } = require('./base');

class ChatSite extends MessagingConnector {
  constructor() {
    super({
      chave: 'chat_site',
      nome: 'Chat do site',
      categoria: 'messaging',
      status: 'producao',
      versaoApi: 'interna-1',
      verificadoEm: '2026-08-05',
      docUrl: 'docs/growth-os/ARCHITECTURE.md',
      capacidades: {
        canReadMessages: true,
        canReplyMessages: true,
        canFetchInsights: true,
      },
      limitacoes: [
        'a conversa só existe enquanto o visitante mantiver o identificador local',
        'sem entrega garantida se o visitante fechar a aba antes de a resposta chegar',
      ],
    });
  }

  /** Não há OAuth: conectar é só ligar o canal para a conta. */
  async authorize({ tenantId }) {
    return { ok: true, contaExternaId: `site:${tenantId}`, escopos: [] };
  }

  async disconnect() { return { ok: true }; }

  async getCapabilities() { return Object.assign({}, this.capacidadesPadrao); }

  async healthCheck() {
    return { ok: true, status: this.status, verificadoEm: this.verificadoEm, detalhe: 'transporte próprio' };
  }

  /** O visitante não tem webhook: quem chama somos nós, do nosso endpoint. */
  async verifyWebhook() { return true; }

  /** Normaliza o que o widget mandou para o formato do domínio. */
  async normalizeInbound(payload = {}) {
    const sessao = String(payload.sessao || '').slice(0, 60);
    if (!sessao) return [];
    return [{
      canal: 'chat_site',
      chaveExterna: sessao,
      externaId: String(payload.id || crypto.randomBytes(8).toString('base64url')),
      texto: String(payload.texto || '').slice(0, 4000),
      tipo: 'texto',
      identidades: [{ tipo: 'visitante', valor: sessao }]
        .concat(payload.email ? [{ tipo: 'email', valor: payload.email }] : [])
        .concat(payload.telefone ? [{ tipo: 'telefone', valor: payload.telefone }] : []),
      dadosContato: {
        nome: String(payload.nome || '').slice(0, 120),
        origem: 'chat',
        pagina_entrada: String(payload.url || '').slice(0, 300),
      },
      em: new Date().toISOString(),
    }];
  }

  /**
   * "Enviar" no chat do site é só marcar como entregue: a mensagem já está
   * no banco e o visitante busca por polling/SSE. Sem API externa, sem
   * possibilidade de falha de rede — e é honesto dizer isso.
   */
  async enviarMensagem({ mensagemId }) {
    return { ok: true, externaId: `site:${mensagemId}`, status: 'entregue' };
  }

  async statusMensagem() { return { status: 'entregue' }; }
}

module.exports = new ChatSite();
