// =====================================================================
// Conector do WHATSAPP BUSINESS PLATFORM — CONTRATO, não implementação.
//
// ⚠️ LEIA ANTES DE MEXER
//
// Em 05/08/2026 nenhuma documentação oficial da Meta foi consultada para
// este projeto, e a conta não tem verificação de negócio nem App Review.
// O §2.1 do PROMPT_MASTER é explícito: não simular integração como se
// funcionasse, e não inventar endpoint, escopo ou capacidade.
//
// Então este arquivo entrega o que PODE ser entregue com honestidade:
//   • o contrato que o domínio consome (mesma interface dos outros);
//   • a normalização do payload PARA O NOSSO FORMATO — que é decisão
//     nossa e não depende da doc deles;
//   • um mock explícito, ligado só por WHATSAPP_MOCK=1, para a suíte
//     exercitar o caminho de ponta a ponta;
//   • a lista exata do que falta verificar.
//
// Tudo que dependeria de conhecer a API real LANÇA 501 com a pendência.
// Nenhuma URL de API aparece aqui de propósito: a primeira coisa a fazer
// quando a conta for aprovada é LER A DOC e preencher esta classe.
// =====================================================================
'use strict';
const { MessagingConnector } = require('./base');

const MOCK = () => process.env.WHATSAPP_MOCK === '1';

// O que precisa ser confirmado na documentação oficial antes de promover
// o status. Aparece no painel de integrações e no health check.
const A_VERIFICAR = [
  'endpoint e versão da API de envio de mensagens',
  'formato exato do payload de webhook de mensagem recebida',
  'algoritmo e cabeçalho da assinatura do webhook',
  'escopos/permissões exigidos e quais dependem de App Review',
  'regras vigentes da janela de atendimento e categorias de template',
  'limites de taxa por número e por conta',
  'como o status de entrega (enviada/entregue/lida) é reportado',
];

class WhatsAppCloud extends MessagingConnector {
  constructor() {
    super({
      chave: 'whatsapp_cloud',
      nome: 'WhatsApp Business Platform',
      categoria: 'messaging',
      status: 'aguardando_aprovacao',
      versaoApi: '',            // vazio de propósito: não sei, e não vou inventar
      verificadoEm: '',         // vazio = documentação oficial NÃO consultada
      docUrl: '',
      escopos: [],              // idem
      capacidades: {},          // tudo false: nada foi confirmado
      limitacoes: A_VERIFICAR,
      bloqueio: 'verificação de negócio da Meta, App Review, número dedicado e templates aprovados por categoria',
    });
  }

  get emMock() { return MOCK(); }

  /**
   * Normalizar é decisão NOSSA: define o que o domínio recebe. Aceita a
   * forma que o mock produz e ignora o que não reconhecer, em vez de
   * assumir um formato oficial que não conferi.
   */
  async normalizeInbound(payload = {}) {
    const msgs = Array.isArray(payload.mensagens) ? payload.mensagens : [];
    return msgs.map((m) => ({
      canal: 'whatsapp',
      chaveExterna: String(m.de || '').replace(/\D/g, '').slice(0, 20),
      externaId: String(m.id || ''),
      texto: String(m.texto || '').slice(0, 4000),
      tipo: m.tipo || 'texto',
      identidades: m.de ? [{ tipo: 'whatsapp', valor: m.de }] : [],
      dadosContato: { nome: String(m.nome || '').slice(0, 120), origem: 'whatsapp' },
      em: m.em || new Date().toISOString(),
    })).filter((m) => m.chaveExterna);
  }

  /**
   * Sem a doc não sei o algoritmo real da assinatura. Em vez de fingir que
   * validei, RECUSO — webhook não verificável não entra no domínio.
   */
  async verifyWebhook() {
    if (this.emMock) return true;
    throw this.naoImplementado('verifyWebhook');
  }

  async authorize() { throw this.naoImplementado('authorize'); }
  async refreshCredentials() { throw this.naoImplementado('refreshCredentials'); }
  async subscribeWebhooks() { throw this.naoImplementado('subscribeWebhooks'); }

  async getCapabilities() {
    if (this.emMock) {
      return Object.assign({}, this.capacidadesPadrao, { canReadMessages: true, canReplyMessages: true });
    }
    return Object.assign({}, this.capacidadesPadrao);   // tudo false
  }

  async healthCheck() {
    return {
      ok: false,
      status: this.status,
      verificadoEm: this.verificadoEm || null,
      documentacaoConferida: false,
      bloqueio: this.bloqueio,
      aVerificar: A_VERIFICAR,
    };
  }

  async enviarMensagem({ mensagemId, texto, para }) {
    if (this.emMock) return { ok: true, externaId: `wamock:${mensagemId}`, status: 'enviada', para, texto };
    throw this.naoImplementado('enviarMensagem');
  }

  async statusMensagem() {
    if (this.emMock) return { status: 'entregue' };
    throw this.naoImplementado('statusMensagem');
  }
}

module.exports = new WhatsAppCloud();
module.exports.A_VERIFICAR = A_VERIFICAR;
