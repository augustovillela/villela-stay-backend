// =====================================================================
// Musique CIFRAS — montagem. Chamado por `music/index.js`, depois das
// rotas das Fases 0–3, com as MESMAS dependências injetadas (conta da
// Academia, busca de conta, staff). Não tem banco próprio: as tabelas
// estão em `music/schema/050-cifras.sql`, no `music.db` do produto.
//
// Decisões: docs/music/DECISIONS/ADR-0009 (revisão da Q2) e ADR-0010
// (arquitetura das cifras). Estado vivo: docs/music/CIFRAS.md.
// =====================================================================
'use strict';
const flags = require('./flags');
const ia = require('./ia');
const { recuperarPresas } = require('./importar');
const { registrarRotasCifras } = require('./rotas');

function montar(app, deps) {
  flags.semear();
  ia.semear();
  // Importação que estava rodando quando o servidor reiniciou vira falha
  // VISÍVEL ("tente de novo"), em vez de "processando" para sempre.
  recuperarPresas();
  registrarRotasCifras(app, deps);
  return { flags };
}

module.exports = { montar };
