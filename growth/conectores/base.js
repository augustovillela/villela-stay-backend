// =====================================================================
// Villela Growth OS — contrato dos conectores (§27 do PROMPT_MASTER).
//
// Duas regras que valem para todos:
//   1. objeto de plataforma NUNCA entra no domínio — normalizeInbound()
//      traduz, e o payload original fica guardado só para auditoria;
//   2. a interface não oferece o que getCapabilities() não confirmar.
//      Capacidade false não aparece desabilitada: NÃO APARECE.
//
// Nenhum método aqui inventa comportamento. Conector sem documentação
// oficial lida fica com status 'planejada' e os métodos lançam.
// =====================================================================
'use strict';

/** Todas as capacidades nascem false. Quem pode, prova que pode. */
const CAPACIDADES_ZERO = Object.freeze({
  canPublishImage: false, canPublishVideo: false, canPublishCarousel: false,
  canPublishStory: false, canPublishShortVideo: false, canSchedule: false,
  canReadComments: false, canReplyComments: false,
  canReadMessages: false, canReplyMessages: false,
  canFetchInsights: false, canManageAds: false,
});

const STATUS = Object.freeze([
  'planejada', 'arquitetura', 'mock', 'aguardando_credenciais',
  'aguardando_aprovacao', 'sandbox', 'producao', 'limitada', 'indisponivel',
]);

class Conector {
  /**
   * @param {object} meta chave, nome, categoria, status, versaoApi,
   *   verificadoEm (vazio = doc oficial NÃO consultada), docUrl, escopos,
   *   limitacoes, bloqueio.
   */
  constructor(meta = {}) {
    this.chave = meta.chave;
    this.nome = meta.nome || meta.chave;
    this.categoria = meta.categoria || 'interno';
    this.status = STATUS.includes(meta.status) ? meta.status : 'planejada';
    this.versaoApi = meta.versaoApi || '';
    this.verificadoEm = meta.verificadoEm || '';
    this.docUrl = meta.docUrl || '';
    this.escopos = meta.escopos || [];
    this.limitacoes = meta.limitacoes || [];
    this.bloqueio = meta.bloqueio || '';
    this.capacidadesPadrao = Object.assign({}, CAPACIDADES_ZERO, meta.capacidades || {});
  }

  /** true quando dá para chamar a API de verdade. */
  get operacional() { return this.status === 'sandbox' || this.status === 'producao' || this.status === 'limitada'; }

  naoImplementado(metodo) {
    const e = new Error(
      `${this.nome}: "${metodo}" ainda não existe (status: ${this.status}). ` +
      (this.bloqueio ? `Pendência: ${this.bloqueio}.` : 'Consulte docs/growth-os/INTEGRATIONS.md.')
    );
    e.status = 501; e.conector = this.chave; e.statusConector = this.status;
    return e;
  }

  async authorize() { throw this.naoImplementado('authorize'); }
  async refreshCredentials() { throw this.naoImplementado('refreshCredentials'); }
  async disconnect() { throw this.naoImplementado('disconnect'); }
  async subscribeWebhooks() { throw this.naoImplementado('subscribeWebhooks'); }
  async verifyWebhook() { throw this.naoImplementado('verifyWebhook'); }
  async normalizeInbound() { throw this.naoImplementado('normalizeInbound'); }

  /**
   * Capacidades DA CONTA. A implementação real consulta a API; enquanto
   * não existe, devolve o padrão declarado — que é tudo false.
   */
  async getCapabilities() { return Object.assign({}, this.capacidadesPadrao); }

  async healthCheck() {
    return { ok: this.operacional, status: this.status, verificadoEm: this.verificadoEm, bloqueio: this.bloqueio };
  }

  /** Linha do catálogo `gx_integracoes`. */
  paraCatalogo() {
    return {
      chave: this.chave, nome: this.nome, categoria: this.categoria, status: this.status,
      versao_api: this.versaoApi, verificado_em: this.verificadoEm, doc_url: this.docUrl,
      escopos: this.escopos, capacidades: this.capacidadesPadrao,
      limitacoes: this.limitacoes, bloqueio: this.bloqueio,
    };
  }
}

// Especializações: existem para o domínio depender do papel, não da rede.
class MessagingConnector extends Conector {
  async enviarMensagem() { throw this.naoImplementado('enviarMensagem'); }
  async statusMensagem() { throw this.naoImplementado('statusMensagem'); }
}
class SocialPublishingConnector extends Conector {
  async publicar() { throw this.naoImplementado('publicar'); }
  async comentarios() { throw this.naoImplementado('comentarios'); }
  async insights() { throw this.naoImplementado('insights'); }
}
class AdsConnector extends Conector {
  async importarCampanhas() { throw this.naoImplementado('importarCampanhas'); }
  async importarMetricas() { throw this.naoImplementado('importarMetricas'); }
  async alterarOrcamento() { throw this.naoImplementado('alterarOrcamento'); }
}
class EmailConnector extends Conector {
  async enviar() { throw this.naoImplementado('enviar'); }
  async eventosDeEntrega() { throw this.naoImplementado('eventosDeEntrega'); }
}
class CalendarConnector extends Conector {
  async disponibilidade() { throw this.naoImplementado('disponibilidade'); }
  async agendar() { throw this.naoImplementado('agendar'); }
}
class ReviewConnector extends Conector {
  async importarAvaliacoes() { throw this.naoImplementado('importarAvaliacoes'); }
  async responder() { throw this.naoImplementado('responder'); }
}
class BillingConnector extends Conector {
  async criarAssinatura() { throw this.naoImplementado('criarAssinatura'); }
  async processarWebhook() { throw this.naoImplementado('processarWebhook'); }
}

module.exports = {
  Conector, MessagingConnector, SocialPublishingConnector, AdsConnector,
  EmailConnector, CalendarConnector, ReviewConnector, BillingConnector,
  CAPACIDADES_ZERO, STATUS,
};
