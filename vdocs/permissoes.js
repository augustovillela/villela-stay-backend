// =====================================================================
// Villela Docs Intelligence — RBAC (Fase 1).
// Catálogo único de permissões + papéis embutidos + papéis personalizados
// por tenant (tabela roles; papel = 'custom:<role_id>').
// ABAC (atributos por documento/pasta) fica p/ fase enterprise — a
// autorização já passa toda por permissoesDe(), então o ponto de troca é um só.
// =====================================================================
'use strict';
const { db, j } = require('./db');

// Catálogo (chave -> rótulo). Fases futuras só ACRESCENTAM chaves.
const PERMISSOES = {
  ver_documentos: 'Ver documentos',
  criar_documento: 'Enviar/criar documentos',
  editar_metadados: 'Editar metadados',
  baixar_documento: 'Baixar documentos',
  compartilhar_documento: 'Compartilhar documentos',
  mover_documento: 'Mover documentos',
  excluir_documento: 'Excluir documentos (lixeira)',
  restaurar_documento: 'Restaurar da lixeira',
  aprovar_documento: 'Aprovar/rejeitar documentos',
  assinar_documento: 'Assinar/aceitar documentos',
  criar_pasta: 'Criar pastas',
  criar_workflow: 'Criar workflows de aprovação',
  usar_ia: 'Usar a IA documental',
  exportar_dados: 'Exportar dados/relatórios',
  ver_auditoria: 'Ver trilha de auditoria',
  ver_uso: 'Ver uso e limites do plano',
  gerir_usuarios: 'Gerenciar usuários e convites',
  gerir_grupos: 'Gerenciar grupos/departamentos',
  gerir_papeis: 'Gerenciar papéis personalizados',
  gerir_configuracoes: 'Configurações da empresa',
  administrar_cobranca: 'Administrar plano e cobrança',
  configurar_integracoes: 'Configurar integrações/API',
};
const TODAS = Object.keys(PERMISSOES);
const so = (...ks) => ks;

// Papéis embutidos (iguais em todos os tenants; não editáveis).
const PAPEIS = {
  dono: { nome: 'Dono da conta', permissoes: TODAS },
  admin: { nome: 'Administrador', permissoes: TODAS.filter(p => p !== 'administrar_cobranca') },
  gestor_documentos: {
    nome: 'Gestor de documentos',
    permissoes: so('ver_documentos', 'criar_documento', 'editar_metadados', 'baixar_documento',
      'compartilhar_documento', 'mover_documento', 'excluir_documento', 'restaurar_documento',
      'aprovar_documento', 'criar_pasta', 'criar_workflow', 'usar_ia', 'exportar_dados', 'ver_uso'),
  },
  gestor_departamento: {
    nome: 'Gestor de departamento',
    permissoes: so('ver_documentos', 'criar_documento', 'editar_metadados', 'baixar_documento',
      'compartilhar_documento', 'mover_documento', 'aprovar_documento', 'criar_pasta',
      'criar_workflow', 'usar_ia', 'gerir_grupos'),
  },
  aprovador: { nome: 'Aprovador', permissoes: so('ver_documentos', 'baixar_documento', 'aprovar_documento', 'usar_ia') },
  usuario: {
    nome: 'Usuário interno',
    permissoes: so('ver_documentos', 'criar_documento', 'editar_metadados', 'baixar_documento',
      'compartilhar_documento', 'mover_documento', 'criar_pasta', 'usar_ia'),
  },
  auditor: { nome: 'Auditor', permissoes: so('ver_documentos', 'ver_auditoria', 'ver_uso', 'exportar_dados') },
  leitor: { nome: 'Leitor', permissoes: so('ver_documentos', 'baixar_documento') },
  colaborador_temporario: { nome: 'Colaborador temporário', permissoes: so('ver_documentos', 'criar_documento', 'baixar_documento') },
  externo: { nome: 'Usuário externo/convidado', permissoes: so('ver_documentos') },
};

// Permissões efetivas de um vínculo tenant_user (objeto {chave:true}).
function permissoesDe(tenantUser) {
  if (!tenantUser || tenantUser.status !== 'ativo') return {};
  let lista = [];
  const papel = String(tenantUser.papel || 'usuario');
  if (papel.startsWith('custom:')) {
    const r = db.prepare('SELECT permissoes FROM roles WHERE id = ? AND tenant_id = ?')
      .get(papel.slice(7), tenantUser.tenant_id);
    lista = r ? j.parse(r.permissoes, []) : [];
  } else {
    lista = (PAPEIS[papel] || PAPEIS.usuario).permissoes;
  }
  const out = {};
  for (const p of lista) if (PERMISSOES[p]) out[p] = true;
  return out;
}

// Nome legível do papel (embutido ou custom) p/ telas e auditoria.
function nomePapel(papel, tenantId) {
  const p = String(papel || '');
  if (p.startsWith('custom:')) {
    const r = db.prepare('SELECT nome FROM roles WHERE id = ? AND tenant_id = ?').get(p.slice(7), tenantId);
    return r ? r.nome : 'Papel removido';
  }
  return (PAPEIS[p] || PAPEIS.usuario).nome;
}

function papelValido(papel, tenantId) {
  const p = String(papel || '');
  if (PAPEIS[p]) return true;
  if (!p.startsWith('custom:')) return false;
  return !!db.prepare('SELECT 1 FROM roles WHERE id = ? AND tenant_id = ?').get(p.slice(7), tenantId);
}

module.exports = { PERMISSOES, PAPEIS, permissoesDe, nomePapel, papelValido };
