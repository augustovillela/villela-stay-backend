// =====================================================================
// Invente Arena — registro de MATÉRIAS (fase C: o motor vira multi-matéria).
// Cada matéria pluga um grafo curado + um banco de moldes. Matéria só
// fica `ativa` depois do grafo APROVADO pelo Augusto (regra do
// PROMPT_MASTER_INVENTE_ARENA: currículo revisado antes de criança ver).
// =====================================================================
'use strict';

const MATERIAS = {
  matematica: {
    id: 'matematica',
    nome: 'Arena de Matemática',
    emoji: '🔢',
    ativa: true,
    grafo: () => require('./grafo-matematica'),
    moldes: () => require('./moldes'),
  },
  portugues: {
    id: 'portugues',
    nome: 'Arena de Português',
    emoji: '📖',
    ativa: false, // liga quando o grafo C0 for aprovado pelo Augusto
    grafo: () => null,
    moldes: () => null,
  },
};

function materia(id) {
  const m = MATERIAS[String(id || 'matematica')];
  if (!m || !m.ativa) throw new Error('Matéria indisponível na Arena.');
  return m;
}
const ativas = () => Object.values(MATERIAS).filter((m) => m.ativa).map((m) => ({ id: m.id, nome: m.nome, emoji: m.emoji }));

module.exports = { MATERIAS, materia, ativas };
