// =====================================================================
// ORIGENA — quem pode ver o quê (§11).
//
// UMA implementação, sem exceção. A regra da casa é explícita sobre isto:
// regra duplicada em três lugares sai de sincronia e vira vazamento. Toda
// listagem, busca, download, RAG e página pública chama `podeVer()`.
//
// Ela NÃO substitui o RLS: o RLS garante que a linha é da família certa;
// isto decide se a pessoa certa daquela família pode vê-la.
// =====================================================================
'use strict';
const rbac = require('./rbac');

const NIVEIS = ['PUBLIC', 'FAMILY', 'GROUP', 'PRIVATE', 'TIME_LOCKED'];

/**
 * @param ativo  { privacidade, created_by, grupo_ids?, liberada_em? }
 * @param quem   { userId, papel, permissoesExtra?, grupos?, ehStaff? }
 * @returns { pode: boolean, motivo: string }
 */
function podeVer(ativo, quem) {
  if (!ativo) return { pode: false, motivo: 'inexistente' };
  const nivel = ativo.privacidade || 'FAMILY';
  if (!NIVEIS.includes(nivel)) return { pode: false, motivo: 'privacidade desconhecida' };

  // TIME_LOCKED vence tudo, inclusive OWNER: cápsula fechada é fechada
  // (§39). O conteúdo está cifrado — nem o vazamento do banco a abre.
  if (nivel === 'TIME_LOCKED') {
    const liberada = ativo.liberada_em && new Date(ativo.liberada_em) <= new Date();
    return liberada ? { pode: true, motivo: 'cápsula liberada' } : { pode: false, motivo: 'cápsula ainda lacrada' };
  }

  if (nivel === 'PUBLIC') return { pode: true, motivo: 'público' };

  // Sem papel = visitante. Só PUBLIC, e nada mais.
  if (!quem || !quem.papel) return { pode: false, motivo: 'não é membro desta família' };

  // O staff da plataforma NÃO é dono do conteúdo das famílias (SECURITY.md
  // T12). Acesso existe, mas é excepcional, exige motivo e vai para o
  // audit_log — quem trata disso é a rota, não esta função.
  if (quem.ehStaff && !quem.motivoStaff) return { pode: false, motivo: 'staff sem motivo registrado' };

  const p = (perm) => rbac.pode(quem.papel, perm, quem.permissoesExtra);

  if (nivel === 'FAMILY') {
    return p('ver.familia')
      ? { pode: true, motivo: 'membro da família' }
      : { pode: false, motivo: 'convidado não vê conteúdo da família' };
  }

  if (nivel === 'GROUP') {
    const doGrupo = Array.isArray(quem.grupos) && Array.isArray(ativo.grupo_ids)
      && ativo.grupo_ids.some((g) => quem.grupos.includes(g));
    if (doGrupo && p('ver.familia')) return { pode: true, motivo: 'membro do grupo' };
    // Quem administra a família enxerga o que é de grupo — senão ninguém
    // consegue moderar nem responder por aquilo.
    return p('ver.privado') ? { pode: true, motivo: 'administra a família' } : { pode: false, motivo: 'fora do grupo' };
  }

  // PRIVATE: o autor sempre; e quem tem `ver.privado` (OWNER/ADMIN/
  // HISTORIAN). ESCOLHA CONSCIENTE: sem isto, o material privado de um
  // membro que falece ou some fica inacessível para sempre — o oposto do
  // que um sistema de legado deve fazer. Todo acesso de terceiro a item
  // PRIVATE é auditado.
  if (nivel === 'PRIVATE') {
    if (quem.userId && ativo.created_by && quem.userId === ativo.created_by) {
      return { pode: true, motivo: 'autor' };
    }
    return p('ver.privado')
      ? { pode: true, motivo: 'administra a família (acesso auditado)', auditar: true }
      : { pode: false, motivo: 'privado de outro membro' };
  }

  return { pode: false, motivo: 'negado por padrão' };
}

/** Filtra uma lista. Usar SEMPRE antes de devolver coleção ao cliente. */
const filtrar = (itens, quem) => (itens || []).filter((i) => podeVer(i, quem).pode);

/**
 * Documento é sensível por natureza (certidão, RG, carta): exige a
 * permissão própria além do nível de privacidade.
 */
function podeVerDocumento(ativo, quem) {
  const base = podeVer(ativo, quem);
  if (!base.pode) return base;
  if (!quem || !rbac.pode(quem.papel, 'ver.documentos', quem.permissoesExtra)) {
    return { pode: false, motivo: 'seu papel não abre documentos' };
  }
  return base;
}

/** Menor de idade nunca aparece em página pública (§73, PRIVACY.md §4). */
function podeExporPublicamente(ativo) {
  if (ativo && ativo.eh_menor) return { pode: false, motivo: 'perfil de menor não vai a público' };
  return (ativo && ativo.privacidade === 'PUBLIC')
    ? { pode: true, motivo: 'público' }
    : { pode: false, motivo: 'não é público' };
}

module.exports = { NIVEIS, podeVer, podeVerDocumento, podeExporPublicamente, filtrar };
