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
    sondaProfunda: [3, 4], // divisão e frações: o vale nacional
    grafo: () => require('./grafo-matematica'),
    moldes: () => require('./moldes'),
  },
  portugues: {
    id: 'portugues',
    nome: 'Arena de Português',
    emoji: '📖',
    ativa: true, // grafo C0 aprovado pelo Augusto em 07/08/2026
    sondaProfunda: [1, 2, 3], // fluência e leitura: o gargalo da alfabetização
    grafo: () => require('./grafo-portugues'),
    moldes: () => require('./moldes-portugues'),
  },
};

function materia(id) {
  const m = MATERIAS[String(id || 'matematica')];
  if (!m || !m.ativa) throw new Error('Matéria indisponível na Arena.');
  return m;
}
const ativas = () => Object.values(MATERIAS).filter((m) => m.ativa).map((m) => ({ id: m.id, nome: m.nome, emoji: m.emoji }));

module.exports = { MATERIAS, materia, ativas };
