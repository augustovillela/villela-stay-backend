// =====================================================================
// Villela Projects & Events — RBAC (Fase 1).
// Catálogo único de permissões + papéis embutidos + papéis custom por
// tenant. Fases futuras só ACRESCENTAM chaves ao catálogo.
// =====================================================================
'use strict';
const { db, j } = require('./db');

const PERMISSOES = {
  ver_projetos: 'Ver portfólio e projetos',
  criar_projeto: 'Criar ideias/projetos',
  editar_projeto: 'Editar projetos (estágio, prioridade, dados)',
  decidir_projeto: 'Decidir (avançar/pausar/cancelar/arquivar)',
  gerir_tarefas: 'Gerenciar tarefas e checklists',
  ver_eventos: 'Ver eventos',
  gerir_eventos: 'Criar/editar eventos e briefings',
  gerir_crm: 'CRM: leads, oportunidades, follow-up',
  gerir_propostas: 'Propostas comerciais',
  gerir_contratos: 'Contratos (minutas exigem revisão humana)',
  ver_financeiro: 'Ver financeiro',
  lancar_financeiro: 'Lançar receitas/despesas/pagamentos',
  gerir_fornecedores: 'Fornecedores e cotações',
  gerir_equipe: 'Equipe, funções e escalas',
  ver_documentos: 'Ver documentos',
  gerir_documentos: 'Enviar/organizar documentos',
  usar_ia: 'Usar agentes de IA',
  ver_relatorios: 'Ver relatórios e dashboards',
  exportar_dados: 'Exportar dados/relatórios',
  ver_auditoria: 'Ver trilha de auditoria',
  ver_uso: 'Ver uso e limites do plano',
  gerir_usuarios: 'Gerenciar usuários e convites',
  gerir_papeis: 'Gerenciar papéis personalizados',
  gerir_configuracoes: 'Configurações da empresa',
  administrar_cobranca: 'Plano e cobrança',
  configurar_integracoes: 'Integrações/API/automações',
};
const TODAS = Object.keys(PERMISSOES);
const so = (...ks) => ks;

const PAPEIS = {
  dono: { nome: 'Dono da conta', permissoes: TODAS },
  admin: { nome: 'Administrador', permissoes: TODAS.filter(p => p !== 'administrar_cobranca') },
  gerente_projetos: {
    nome: 'Gerente de projetos',
    permissoes: so('ver_projetos', 'criar_projeto', 'editar_projeto', 'decidir_projeto', 'gerir_tarefas',
      'ver_eventos', 'gerir_fornecedores', 'gerir_equipe', 'ver_documentos', 'gerir_documentos',
      'usar_ia', 'ver_relatorios', 'exportar_dados', 'ver_financeiro', 'ver_uso'),
  },
  produtor_eventos: {
    nome: 'Produtor de eventos',
    permissoes: so('ver_projetos', 'ver_eventos', 'gerir_eventos', 'gerir_tarefas', 'gerir_fornecedores',
      'gerir_equipe', 'ver_documentos', 'gerir_documentos', 'usar_ia', 'ver_relatorios'),
  },
  comercial: {
    nome: 'Comercial',
    permissoes: so('ver_projetos', 'ver_eventos', 'gerir_crm', 'gerir_propostas', 'gerir_contratos',
      'ver_documentos', 'usar_ia', 'ver_relatorios'),
  },
  financeiro: {
    nome: 'Financeiro',
    permissoes: so('ver_projetos', 'ver_eventos', 'ver_financeiro', 'lancar_financeiro',
      'ver_documentos', 'ver_relatorios', 'exportar_dados', 'ver_uso'),
  },
  colaborador: {
    nome: 'Colaborador',
    permissoes: so('ver_projetos', 'gerir_tarefas', 'ver_eventos', 'ver_documentos', 'gerir_documentos', 'usar_ia'),
  },
  auditor: { nome: 'Auditor', permissoes: so('ver_projetos', 'ver_eventos', 'ver_financeiro', 'ver_auditoria', 'ver_relatorios', 'exportar_dados', 'ver_uso') },
  leitor: { nome: 'Leitor', permissoes: so('ver_projetos', 'ver_eventos', 'ver_documentos', 'ver_relatorios') },
  cliente_externo: { nome: 'Cliente externo (portal)', permissoes: so('ver_projetos', 'ver_eventos', 'ver_documentos') }, // portal dedicado na Fase 7
};

function permissoesDe(tenantUser) {
  if (!tenantUser || tenantUser.status !== 'ativo') return {};
  let lista = [];
  const papel = String(tenantUser.papel || 'colaborador');
  if (papel.startsWith('custom:')) {
    const r = db.prepare('SELECT permissoes FROM roles WHERE id = ? AND tenant_id = ?').get(papel.slice(7), tenantUser.tenant_id);
    lista = r ? j.parse(r.permissoes, []) : [];
  } else {
    lista = (PAPEIS[papel] || PAPEIS.colaborador).permissoes;
  }
  const out = {};
  for (const p of lista) if (PERMISSOES[p]) out[p] = true;
  return out;
}

function nomePapel(papel, tenantId) {
  const p = String(papel || '');
  if (p.startsWith('custom:')) {
    const r = db.prepare('SELECT nome FROM roles WHERE id = ? AND tenant_id = ?').get(p.slice(7), tenantId);
    return r ? r.nome : 'Papel removido';
  }
  return (PAPEIS[p] || PAPEIS.colaborador).nome;
}

function papelValido(papel, tenantId) {
  const p = String(papel || '');
  if (PAPEIS[p]) return true;
  if (!p.startsWith('custom:')) return false;
  return !!db.prepare('SELECT 1 FROM roles WHERE id = ? AND tenant_id = ?').get(p.slice(7), tenantId);
}

module.exports = { PERMISSOES, PAPEIS, permissoesDe, nomePapel, papelValido };
