// =====================================================================
// Villela Growth OS — registro de conectores e catálogo de capacidades.
//
// TODOS nascem em 'planejada' com verificadoEm vazio: em 05/08/2026
// nenhuma documentação oficial foi consultada para este projeto, e §2.1
// do PROMPT_MASTER proíbe inventar endpoint, escopo ou capacidade.
//
// Para promover um conector: ler a documentação OFICIAL, preencher
// versaoApi + verificadoEm + docUrl + escopos + capacidades + limitações,
// implementar os métodos e só então mudar o status.
// =====================================================================
'use strict';
const base = require('./base');
const { Conector, MessagingConnector, SocialPublishingConnector, AdsConnector,
  EmailConnector, CalendarConnector, ReviewConnector, BillingConnector } = base;
const { db, nowISO, j } = require('../db');

// ------------------------------------------------------------- catálogo
const CONECTORES = [
  new MessagingConnector({
    chave: 'whatsapp_cloud', nome: 'WhatsApp Business Platform', categoria: 'messaging',
    bloqueio: 'conta empresarial verificada, número dedicado e templates aprovados por categoria',
  }),
  new MessagingConnector({
    chave: 'instagram_dm', nome: 'Instagram — mensagens', categoria: 'messaging',
    bloqueio: 'App Review da Meta e conta profissional vinculada a uma página',
  }),
  new MessagingConnector({
    chave: 'facebook_messenger', nome: 'Facebook — mensagens', categoria: 'messaging',
    bloqueio: 'App Review da Meta',
  }),
  new SocialPublishingConnector({
    chave: 'instagram_publicacao', nome: 'Instagram — publicação', categoria: 'social',
    bloqueio: 'App Review da Meta para publicação de conteúdo',
  }),
  new SocialPublishingConnector({
    chave: 'facebook_paginas', nome: 'Facebook Pages', categoria: 'social',
    bloqueio: 'App Review da Meta',
  }),
  new SocialPublishingConnector({
    chave: 'tiktok', nome: 'TikTok', categoria: 'social', bloqueio: 'aprovação de app do TikTok',
  }),
  new SocialPublishingConnector({
    chave: 'linkedin', nome: 'LinkedIn — páginas', categoria: 'social', bloqueio: 'programa de parceiros do LinkedIn',
  }),
  new SocialPublishingConnector({
    chave: 'youtube', nome: 'YouTube', categoria: 'social', bloqueio: 'quota de API e canal vinculado',
  }),
  new AdsConnector({ chave: 'meta_ads', nome: 'Meta Ads', categoria: 'ads', bloqueio: 'App Review e acesso à conta de anúncios' }),
  new AdsConnector({ chave: 'google_ads', nome: 'Google Ads', categoria: 'ads', bloqueio: 'developer token aprovado' }),
  new AdsConnector({ chave: 'tiktok_ads', nome: 'TikTok Ads', categoria: 'ads', bloqueio: 'aprovação de app' }),
  new AdsConnector({ chave: 'linkedin_ads', nome: 'LinkedIn Ads', categoria: 'ads', bloqueio: 'programa de parceiros' }),
  new EmailConnector({ chave: 'email', nome: 'E-mail (provedor abstrato)', categoria: 'email', bloqueio: 'domínio autenticado (SPF/DKIM/DMARC) e provedor contratado' }),
  new CalendarConnector({ chave: 'google_calendar', nome: 'Google Calendar', categoria: 'calendar', bloqueio: 'OAuth com tela de consentimento publicada' }),
  new CalendarConnector({ chave: 'microsoft_calendar', nome: 'Microsoft Calendar', categoria: 'calendar', bloqueio: 'registro de aplicativo' }),
  new ReviewConnector({ chave: 'google_business', nome: 'Google Business Profile', categoria: 'review', bloqueio: 'perfil verificado' }),
  // Já operacionais no ecossistema — mas ainda não com este contrato.
  new BillingConnector({ chave: 'mercado_pago', nome: 'Mercado Pago', categoria: 'billing', status: 'arquitetura',
    bloqueio: 'em produção no Villela CRM; falta migrar para este contrato' }),
  new Conector({ chave: 'stays', nome: 'Stays.net', categoria: 'interno', status: 'arquitetura',
    bloqueio: 'em produção no ecossistema Villela; falta migrar para este contrato' }),
];

const porChave = new Map(CONECTORES.map(c => [c.chave, c]));
const obter = (chave) => porChave.get(chave) || null;
const listar = () => CONECTORES.map(c => c.paraCatalogo());

/** Sincroniza o catálogo com o banco. Idempotente: roda em todo boot. */
function semear() {
  for (const c of CONECTORES) {
    const linha = c.paraCatalogo();
    db.prepare(
      'INSERT INTO gx_integracoes (chave, nome, categoria, status, versao_api, verificado_em, doc_url, escopos, capacidades, limitacoes, bloqueio, atualizado_em) ' +
      'VALUES (:chave,:nome,:categoria,:status,:versao_api,:verificado_em,:doc_url,:escopos,:capacidades,:limitacoes,:bloqueio,:em) ' +
      'ON CONFLICT(chave) DO UPDATE SET nome=excluded.nome, categoria=excluded.categoria, status=excluded.status, ' +
      'versao_api=excluded.versao_api, verificado_em=excluded.verificado_em, doc_url=excluded.doc_url, ' +
      'escopos=excluded.escopos, capacidades=excluded.capacidades, limitacoes=excluded.limitacoes, ' +
      'bloqueio=excluded.bloqueio, atualizado_em=excluded.atualizado_em'
    ).run({
      chave: linha.chave, nome: linha.nome, categoria: linha.categoria, status: linha.status,
      versao_api: linha.versao_api, verificado_em: linha.verificado_em, doc_url: linha.doc_url,
      escopos: j.str(linha.escopos), capacidades: j.str(linha.capacidades),
      limitacoes: j.str(linha.limitacoes), bloqueio: linha.bloqueio, em: nowISO(),
    });
  }
  return CONECTORES.length;
}

/**
 * Resumo honesto para a interface: o que dá para usar hoje e o que falta.
 * A tela mostra "planejada" como planejada — não como botão cinza.
 */
function panorama() {
  const linhas = db.prepare('SELECT * FROM gx_integracoes ORDER BY categoria, nome').all();
  return linhas.map(l => ({
    chave: l.chave, nome: l.nome, categoria: l.categoria, status: l.status,
    operacional: ['sandbox', 'producao', 'limitada'].includes(l.status),
    versao_api: l.versao_api || null,
    verificado_em: l.verificado_em || null,
    documentacao_conferida: !!l.verificado_em,
    capacidades: j.parse(l.capacidades, {}),
    bloqueio: l.bloqueio || '',
  }));
}

module.exports = Object.assign({}, base, { CONECTORES, obter, listar, semear, panorama });
