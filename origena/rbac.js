// =====================================================================
// ORIGENA — papéis e permissões (§10).
//
// Este arquivo é DECISÃO PURA: nada de banco, nada de Express, nada de
// IA. Recebe papel + permissão e devolve sim ou não. É assim de propósito
// — RBAC mal desenhado contamina todas as fases seguintes, e função pura
// se testa exaustivamente em milissegundos.
//
// §102: a IA NUNCA decide autorização. `ia/` não pode importar este
// módulo, e o selftest verifica isso.
// =====================================================================
'use strict';

const PAPEIS = ['OWNER', 'ADMIN', 'HISTORIAN', 'EDITOR', 'CONTRIBUTOR', 'FAMILY_MEMBER', 'GUEST'];

// Permissões granulares. Nome no infinitivo, recurso no plural.
const PERMISSOES = [
  // acervo
  'ver.publico', 'ver.familia', 'ver.privado', 'ver.documentos',
  'contribuir', 'editar', 'excluir', 'restaurar',
  // proveniência (Fase 3)
  'claims.criar', 'claims.resolver', 'fontes.gerenciar',
  // pessoas e árvore (Fase 2)
  'pessoas.criar', 'pessoas.editar', 'parentesco.editar',
  // administração da família
  'membros.convidar', 'membros.gerenciar', 'papeis.alterar',
  'familia.editar', 'familia.excluir', 'privacidade.alterar',
  'auditoria.ver', 'exportar',
  // dinheiro e IA (Fase 7)
  'creditos.comprar', 'ia.usar', 'produtos.gerar',
  // legado (Fase 3.0)
  'capsulas.ver', 'capsulas.criar', 'guardioes.gerenciar',
];

// Matriz. Uma linha por papel; `*` só para OWNER.
//
// Princípio de desenho: conflito familiar é cenário ESPERADO, não
// excepcional (§89). Por isso CONTRIBUTOR acrescenta mas não apaga, e
// só ADMIN/OWNER mexem em papel e privacidade.
const MATRIZ = {
  OWNER: ['*'],

  ADMIN: [
    'ver.publico', 'ver.familia', 'ver.privado', 'ver.documentos',
    'contribuir', 'editar', 'excluir', 'restaurar',
    'claims.criar', 'claims.resolver', 'fontes.gerenciar',
    'pessoas.criar', 'pessoas.editar', 'parentesco.editar',
    'membros.convidar', 'membros.gerenciar', 'papeis.alterar',
    'familia.editar', 'privacidade.alterar', 'auditoria.ver', 'exportar',
    'ia.usar', 'produtos.gerar', 'capsulas.ver', 'capsulas.criar',
  ],

  // O historiador é quem cuida da VERDADE do acervo: resolve divergência,
  // gerencia fontes, corrige parentesco. Não administra pessoas nem dinheiro.
  HISTORIAN: [
    'ver.publico', 'ver.familia', 'ver.privado', 'ver.documentos',
    'contribuir', 'editar', 'restaurar',
    'claims.criar', 'claims.resolver', 'fontes.gerenciar',
    'pessoas.criar', 'pessoas.editar', 'parentesco.editar',
    'auditoria.ver', 'exportar', 'ia.usar', 'capsulas.ver',
  ],

  EDITOR: [
    'ver.publico', 'ver.familia', 'ver.documentos',
    'contribuir', 'editar',
    'claims.criar', 'pessoas.criar', 'pessoas.editar', 'parentesco.editar',
    'exportar', 'ia.usar', 'capsulas.ver',
  ],

  // Acrescenta, não apaga. É o papel do parente que manda fotos e histórias.
  CONTRIBUTOR: [
    'ver.publico', 'ver.familia',
    'contribuir', 'claims.criar', 'pessoas.criar', 'capsulas.ver',
  ],

  FAMILY_MEMBER: ['ver.publico', 'ver.familia', 'contribuir', 'capsulas.ver'],

  // Convidado enxerga o que é público da família. Nada de documento,
  // nada de privado, nada de cápsula.
  GUEST: ['ver.publico'],
};

const PERMISSOES_SET = new Set(PERMISSOES);
const MAPA = Object.fromEntries(Object.entries(MATRIZ).map(([p, l]) => [p, new Set(l)]));

/** Papel conhecido? */
const papelValido = (papel) => PAPEIS.includes(papel);

/**
 * A pergunta central do módulo.
 * `extras` são permissões avulsas concedidas na membership (granularidade
 * futura, §10) — só ACRESCENTAM, nunca tiram.
 */
function pode(papel, permissao, extras = null) {
  if (!PERMISSOES_SET.has(permissao)) {
    throw new Error(`Permissão desconhecida: ${permissao}`);   // erro de programação, falha alto
  }
  const set = MAPA[papel];
  if (!set) return false;
  if (set.has('*') || set.has(permissao)) return true;
  if (extras && Array.isArray(extras.conceder)) return extras.conceder.includes(permissao);
  return false;
}

/** Todas as permissões efetivas de um papel — a UI usa para esconder botão. */
function permissoesDe(papel, extras = null) {
  const set = MAPA[papel];
  if (!set) return [];
  const base = set.has('*') ? [...PERMISSOES] : [...set];
  const mais = (extras && Array.isArray(extras.conceder)) ? extras.conceder.filter((p) => PERMISSOES_SET.has(p)) : [];
  return [...new Set([...base, ...mais])].sort();
}

/** Middleware. Usar SEMPRE depois de `tenancy.requireFamilia`. */
function exigir(permissao) {
  return (req, res, next) => {
    if (!req.papel) return res.status(401).json({ erro: 'Faça login para continuar.' });
    if (!pode(req.papel, permissao, req.permissoesExtra)) {
      return res.status(403).json({ erro: 'Seu papel nesta família não permite esta ação.' });
    }
    next();
  };
}

/** Hierarquia só para comparar quem pode mexer em quem. */
const NIVEL = { OWNER: 70, ADMIN: 60, HISTORIAN: 50, EDITOR: 40, CONTRIBUTOR: 30, FAMILY_MEMBER: 20, GUEST: 10 };

/**
 * Ninguém promove alguém acima de si, nem rebaixa quem está acima.
 * Sem isto, um ADMIN se promoveria a OWNER e tomaria o acervo.
 */
function podeAlterarPapel(papelDeQuemAge, papelAtualDoAlvo, papelNovo) {
  if (!papelValido(papelNovo) || !papelValido(papelAtualDoAlvo)) return false;
  if (!pode(papelDeQuemAge, 'papeis.alterar')) return false;
  const meu = NIVEL[papelDeQuemAge] || 0;
  return meu >= (NIVEL[papelAtualDoAlvo] || 0) && meu >= (NIVEL[papelNovo] || 0);
}

module.exports = { PAPEIS, PERMISSOES, MATRIZ, NIVEL, pode, permissoesDe, exigir, papelValido, podeAlterarPapel };
