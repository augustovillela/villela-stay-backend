// =====================================================================
// Villela Growth OS — perfis e permissões (§5 do PROMPT_MASTER).
//
// Permissão é sempre "recurso.acao". Curinga só no fim: "crm.*", "*".
// Menor privilégio é o padrão: perfil novo nasce SEM permissão nenhuma.
// Papel de sistema (sistema=1) não é editável pelo assinante.
// =====================================================================
'use strict';
const repo = require('./repo');
const tenancy = require('./tenancy');
const { nowISO, j } = require('./db');

// ------------------------------------------------- catálogo de permissões
const PERMISSOES = {
  // plataforma / agência
  'plataforma.administrar': 'Administrar a plataforma inteira',
  'plataforma.tenant.criar': 'Criar contas cliente',
  'plataforma.tenant.suspender': 'Suspender ou reativar contas',
  'org.ler': 'Ver a organização e suas contas',
  'org.editar': 'Editar dados da organização',
  'org.conta.vincular': 'Vincular ou desvincular contas da organização',

  // conta
  'conta.ler': 'Ver dados da conta',
  'conta.editar': 'Editar dados da conta',
  'conta.usuario.ler': 'Ver usuários',
  'conta.usuario.convidar': 'Convidar usuários',
  'conta.usuario.editar': 'Editar usuários',
  'conta.usuario.remover': 'Remover usuários',
  'conta.papel.gerenciar': 'Criar e alterar perfis e permissões',
  'conta.equipe.gerenciar': 'Criar e alterar equipes',
  'conta.marca.gerenciar': 'Gerenciar marcas e white-label',
  'conta.auditoria.ler': 'Ver a trilha de auditoria',

  // assinatura
  'assinatura.ler': 'Ver plano, limites e consumo',
  'assinatura.alterar': 'Trocar de plano ou cancelar',
  'fatura.ler': 'Ver faturas',

  // CRM
  'crm.contato.ler': 'Ver contatos', 'crm.contato.criar': 'Criar contatos',
  'crm.contato.editar': 'Editar contatos', 'crm.contato.excluir': 'Excluir contatos',
  'crm.contato.exportar': 'Exportar contatos',
  'crm.empresa.ler': 'Ver empresas', 'crm.empresa.editar': 'Editar empresas',
  'crm.funil.gerenciar': 'Criar e alterar funis e etapas',
  'crm.oportunidade.ler': 'Ver oportunidades', 'crm.oportunidade.editar': 'Editar oportunidades',
  'crm.tarefa.ler': 'Ver tarefas', 'crm.tarefa.editar': 'Editar tarefas',
  'crm.proposta.enviar': 'Enviar proposta a cliente',

  // atendimento
  'inbox.ler': 'Ver conversas', 'inbox.responder': 'Responder conversas',
  'inbox.atribuir': 'Atribuir conversas', 'inbox.encerrar': 'Encerrar conversas',

  // marketing
  'campanha.ler': 'Ver campanhas', 'campanha.criar': 'Criar campanhas',
  'campanha.disparar': 'Disparar campanha (envio real)',
  'conteudo.ler': 'Ver conteúdo', 'conteudo.criar': 'Criar conteúdo',
  'conteudo.aprovar': 'Aprovar conteúdo', 'conteudo.publicar': 'Publicar em rede social',
  'template.gerenciar': 'Gerenciar templates de mensagem',

  // mídia paga
  'ads.ler': 'Ver campanhas de anúncio e métricas',
  'ads.editar': 'Editar campanhas de anúncio',
  'ads.orcamento.alterar': 'Alterar orçamento (gasto real)',

  // reputação e agenda
  'reputacao.ler': 'Ver avaliações', 'reputacao.responder': 'Responder avaliações',
  'reuniao.gerenciar': 'Gerenciar agenda e tipos de reunião',

  // automações e agentes
  'automacao.ler': 'Ver automações', 'automacao.editar': 'Criar e editar automações',
  'automacao.publicar': 'Publicar versão de automação',
  'agente.ler': 'Ver agentes e execuções', 'agente.configurar': 'Configurar agentes',
  'aprovacao.ler': 'Ver a central de aprovações', 'aprovacao.decidir': 'Aprovar ou rejeitar ações',

  // integrações e dados
  'integracao.ler': 'Ver integrações', 'integracao.conectar': 'Conectar ou desconectar contas',
  'relatorio.ler': 'Ver relatórios e painéis',
  'lgpd.gerenciar': 'Tratar solicitações de titular e retenção',
  'api.gerenciar': 'Criar e revogar chaves de API',
};

const LEITURA_GERAL = [
  'conta.ler', 'crm.contato.ler', 'crm.empresa.ler', 'crm.oportunidade.ler', 'crm.tarefa.ler',
  'inbox.ler', 'campanha.ler', 'conteudo.ler', 'ads.ler', 'reputacao.ler',
  'automacao.ler', 'agente.ler', 'aprovacao.ler', 'integracao.ler', 'relatorio.ler',
];

// ------------------------------------------------------- perfis de sistema
// Os 19 perfis do §5 do prompt. `nivel` diz em que escopo o perfil vale.
const PERFIS = [
  { slug: 'plataforma-super', nome: 'Superadministrador da plataforma', nivel: 'plataforma', permissoes: ['*'] },
  { slug: 'agencia-admin', nome: 'Administrador de agência', nivel: 'org',
    permissoes: ['org.*', 'conta.*', 'assinatura.ler', 'fatura.ler', 'crm.*', 'inbox.*', 'campanha.*',
                 'conteudo.*', 'ads.*', 'reputacao.*', 'reuniao.*', 'automacao.*', 'agente.*',
                 'aprovacao.*', 'integracao.*', 'relatorio.ler', 'template.gerenciar'] },
  { slug: 'conta-proprietario', nome: 'Proprietário da conta', nivel: 'tenant',
    permissoes: ['conta.*', 'assinatura.*', 'fatura.ler', 'crm.*', 'inbox.*', 'campanha.*', 'conteudo.*',
                 'ads.*', 'reputacao.*', 'reuniao.*', 'automacao.*', 'agente.*', 'aprovacao.*',
                 'integracao.*', 'relatorio.ler', 'template.gerenciar', 'lgpd.gerenciar', 'api.gerenciar'] },
  { slug: 'conta-admin', nome: 'Administrador da conta', nivel: 'tenant',
    permissoes: ['conta.ler', 'conta.editar', 'conta.usuario.*', 'conta.equipe.gerenciar', 'conta.marca.gerenciar',
                 'conta.auditoria.ler', 'assinatura.ler', 'crm.*', 'inbox.*', 'campanha.*', 'conteudo.*',
                 'ads.ler', 'ads.editar', 'reputacao.*', 'reuniao.gerenciar', 'automacao.*', 'agente.*',
                 'aprovacao.*', 'integracao.*', 'relatorio.ler', 'template.gerenciar', 'api.gerenciar'] },
  { slug: 'comercial-diretor', nome: 'Diretor comercial', nivel: 'tenant',
    permissoes: [...LEITURA_GERAL, 'crm.*', 'inbox.responder', 'inbox.atribuir', 'aprovacao.decidir', 'reuniao.gerenciar'] },
  { slug: 'vendas-gerente', nome: 'Gerente de vendas', nivel: 'tenant',
    permissoes: [...LEITURA_GERAL, 'crm.contato.criar', 'crm.contato.editar', 'crm.contato.exportar',
                 'crm.empresa.editar', 'crm.funil.gerenciar', 'crm.oportunidade.editar', 'crm.tarefa.editar',
                 'crm.proposta.enviar', 'inbox.responder', 'inbox.atribuir', 'reuniao.gerenciar'] },
  { slug: 'vendas-vendedor', nome: 'Vendedor', nivel: 'tenant',
    permissoes: ['conta.ler', 'crm.contato.ler', 'crm.contato.criar', 'crm.contato.editar', 'crm.empresa.ler',
                 'crm.oportunidade.ler', 'crm.oportunidade.editar', 'crm.tarefa.ler', 'crm.tarefa.editar',
                 'crm.proposta.enviar', 'inbox.ler', 'inbox.responder', 'reuniao.gerenciar', 'relatorio.ler'] },
  { slug: 'vendas-sdr', nome: 'SDR', nivel: 'tenant',
    permissoes: ['conta.ler', 'crm.contato.ler', 'crm.contato.criar', 'crm.contato.editar', 'crm.empresa.ler',
                 'crm.oportunidade.ler', 'crm.oportunidade.editar', 'crm.tarefa.ler', 'crm.tarefa.editar',
                 'inbox.ler', 'inbox.responder', 'reuniao.gerenciar'] },
  { slug: 'marketing-diretor', nome: 'Diretor de marketing', nivel: 'tenant',
    permissoes: [...LEITURA_GERAL, 'campanha.criar', 'campanha.disparar', 'conteudo.criar', 'conteudo.aprovar',
                 'conteudo.publicar', 'ads.editar', 'template.gerenciar', 'aprovacao.decidir', 'automacao.editar'] },
  { slug: 'marketing-social', nome: 'Social media', nivel: 'tenant',
    permissoes: ['conta.ler', 'conteudo.ler', 'conteudo.criar', 'campanha.ler', 'inbox.ler', 'inbox.responder',
                 'reputacao.ler', 'reputacao.responder', 'relatorio.ler', 'crm.contato.ler'] },
  { slug: 'marketing-trafego', nome: 'Gestor de tráfego', nivel: 'tenant',
    permissoes: ['conta.ler', 'ads.ler', 'ads.editar', 'campanha.ler', 'conteudo.ler', 'relatorio.ler',
                 'integracao.ler', 'crm.contato.ler'] },
  { slug: 'atendimento', nome: 'Atendimento', nivel: 'tenant',
    permissoes: ['conta.ler', 'inbox.ler', 'inbox.responder', 'inbox.encerrar', 'crm.contato.ler',
                 'crm.contato.criar', 'crm.contato.editar', 'crm.tarefa.ler', 'crm.tarefa.editar', 'reuniao.gerenciar'] },
  { slug: 'customer-success', nome: 'Customer Success', nivel: 'tenant',
    permissoes: ['conta.ler', 'crm.contato.ler', 'crm.contato.editar', 'crm.empresa.ler', 'crm.oportunidade.ler',
                 'crm.tarefa.ler', 'crm.tarefa.editar', 'inbox.ler', 'inbox.responder', 'reputacao.ler',
                 'reputacao.responder', 'relatorio.ler', 'reuniao.gerenciar'] },
  { slug: 'analista', nome: 'Analista', nivel: 'tenant', permissoes: [...LEITURA_GERAL, 'crm.contato.exportar'] },
  { slug: 'financeiro', nome: 'Financeiro', nivel: 'tenant',
    permissoes: ['conta.ler', 'assinatura.ler', 'fatura.ler', 'relatorio.ler', 'crm.oportunidade.ler'] },
  { slug: 'auditor', nome: 'Auditor', nivel: 'tenant', permissoes: [...LEITURA_GERAL, 'conta.auditoria.ler', 'fatura.ler'] },
  { slug: 'leitura', nome: 'Leitura apenas', nivel: 'tenant', permissoes: LEITURA_GERAL },
  { slug: 'servico', nome: 'Conta de serviço', nivel: 'tenant',
    permissoes: ['crm.contato.ler', 'crm.contato.criar', 'crm.oportunidade.ler', 'crm.oportunidade.editar', 'relatorio.ler'] },
  // O agente de IA nasce com o MENOR privilégio possível. Tudo que for
  // além disto passa pela central de aprovações (§20 do prompt).
  { slug: 'agente-ia', nome: 'Agente de IA', nivel: 'tenant',
    permissoes: ['conta.ler', 'crm.contato.ler', 'crm.empresa.ler', 'crm.oportunidade.ler', 'crm.tarefa.ler',
                 'inbox.ler', 'conteudo.ler', 'campanha.ler', 'ads.ler', 'reputacao.ler', 'relatorio.ler'] },
];

const PERFIL_PADRAO = 'leitura';

// Papéis do Villela CRM (tenant_users.papel) → perfil do Growth OS.
const MAPA_PAPEL_LEGADO = {
  owner: 'conta-proprietario', admin: 'conta-admin', gestor: 'vendas-gerente',
  vendedor: 'vendas-vendedor', atendente: 'atendimento', financeiro: 'financeiro',
  marketing: 'marketing-diretor', leitura: 'leitura',
};

// ------------------------------------------------------------- semeadura
function semear() {
  for (const p of PERFIS) {
    const atual = repo.um("SELECT * FROM gx_roles WHERE tenant_id = '' AND slug = :slug", { slug: p.slug });
    const permissoes = j.str(p.permissoes);
    if (!atual) {
      repo.semearGlobal('gx_roles', {
        slug: p.slug, nome: p.nome, nivel: p.nivel, permissoes, sistema: 1, criado_em: nowISO(),
      });
    } else if (atual.permissoes !== permissoes || atual.nome !== p.nome) {
      // perfil de sistema acompanha o código — o assinante clona para customizar
      repo.atualizarGlobal('gx_roles', atual.id, { nome: p.nome, nivel: p.nivel, permissoes });
    }
  }
  return PERFIS.length;
}

// ------------------------------------------------------------ verificação
/** Casa "crm.contato.ler" com "crm.contato.ler", "crm.*" ou "*". */
function casa(concedida, exigida) {
  if (concedida === '*' || concedida === exigida) return true;
  if (!concedida.endsWith('.*')) return false;
  return exigida.startsWith(concedida.slice(0, -1));
}

const pode = (permissoes, exigida) => {
  if (!permissoes) return false;
  for (const c of permissoes) if (casa(c, exigida)) return true;
  return false;
};

function papelPorSlug(slug) {
  return repo.um("SELECT * FROM gx_roles WHERE tenant_id = '' AND slug = :slug", { slug });
}

/** Permissões efetivas do membership (perfil + eventuais extras). */
function permissoesDoMembership(membership) {
  if (!membership) return new Set();
  const papel = repo.um("SELECT * FROM gx_roles WHERE id = :id AND tenant_id IN (:tenant, '')", { id: membership.role_id })
    || repo.um("SELECT * FROM gx_roles WHERE id = :id AND tenant_id = ''", { id: membership.role_id });
  const lista = papel ? j.parse(papel.permissoes, []) : [];
  return new Set(lista);
}

/** Exige a permissão no contexto atual. Lança 403 se não tiver. */
function exigir(chave) {
  const ctx = tenancy.atual();
  if (ctx && ctx.plataforma) return true;                     // já validado antes de entrar
  if (!ctx || !ctx.permissoes) {
    const e = new Error('Sem permissões resolvidas no contexto.'); e.status = 403; throw e;
  }
  if (!pode(ctx.permissoes, chave)) {
    const e = new Error(`Sem permissão: ${chave}`); e.status = 403; e.permissao = chave; throw e;
  }
  return true;
}

/** Middleware Express: exige a permissão do contexto já montado pela rota. */
const requerPermissao = (chave) => (req, res, next) => {
  try { exigir(chave); next(); }
  catch (e) { res.status(e.status || 403).json({ erro: e.message, permissao: chave }); }
};

module.exports = {
  PERMISSOES, PERFIS, PERFIL_PADRAO, MAPA_PAPEL_LEGADO,
  semear, pode, casa, exigir, requerPermissao, papelPorSlug, permissoesDoMembership,
};
