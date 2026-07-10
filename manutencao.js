// =====================================================================
// Manutenção do DATA_DIR: purga de eventos antigos + medição de disco.
// - purgarEventosAntigos: em cada *.db, apaga linhas > N dias das tabelas
//   de LOG operacional de alto volume (webhooks/pagamentos/notificações/IA/
//   acessos). NÃO toca em audit_logs (compliance, baixo volume, retenção longa).
// - tamanhoDir: bytes usados no DATA_DIR (para o alarme de disco).
// Genérico: só apaga onde a tabela E a coluna de data existem (introspecção).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// tabela → coluna de timestamp (ISO). Descobertas dos schemas dos módulos.
const PURGAS = [
  { tabela: 'payment_events', col: 'quando' },
  { tabela: 'webhook_events', col: 'quando' },
  { tabela: 'notification_logs', col: 'quando' },
  { tabela: 'ai_usage_logs', col: 'quando' },
  { tabela: 'download_logs', col: 'quando' },
  { tabela: 'platform_events', col: 'quando' },
  { tabela: 'crm_ia_logs', col: 'criado_em' },
  { tabela: 'billing_events', col: 'criado_em' },
  { tabela: 'document_access_logs', col: 'criado_em' },
  { tabela: 'share_access_logs', col: 'criado_em' },
];

function encontrarDbs(dir, out = []) {
  let entradas;
  try { entradas = fs.readdirSync(dir); } catch { return out; }
  for (const nome of entradas) {
    const cheio = path.join(dir, nome);
    let st; try { st = fs.statSync(cheio); } catch { continue; }
    if (st.isDirectory()) { if (nome !== '_snapshots') encontrarDbs(cheio, out); }
    else if (nome.endsWith('.db')) out.push(cheio);
  }
  return out;
}

function temColuna(db, tabela, col) {
  try {
    const info = db.prepare(`PRAGMA table_info(${tabela})`).all();
    return info.some(c => c.name === col);
  } catch { return false; }
}

// Apaga linhas com timestamp < corte nas tabelas de log. `corteISO` injetável p/ teste.
function purgarEventosAntigos(dataDir, { dias = 90, corteISO } = {}) {
  const corte = corteISO || new Date(Date.now() - dias * 86400000).toISOString();
  let totalApagado = 0;
  const detalhe = {};
  for (const dbPath of encontrarDbs(dataDir)) {
    const db = new DatabaseSync(dbPath);
    try {
      for (const { tabela, col } of PURGAS) {
        if (!temColuna(db, tabela, col)) continue;
        const r = db.prepare(`DELETE FROM ${tabela} WHERE ${col} < ?`).run(corte);
        const apagou = Number(r.changes) || 0;
        if (apagou > 0) { totalApagado += apagou; detalhe[`${path.basename(dbPath)}:${tabela}`] = apagou; }
      }
    } catch (e) { console.error('[manutencao] purga falhou em', dbPath, e.message); }
    finally { try { db.close(); } catch {} }
  }
  return { totalApagado, detalhe, corte };
}

function tamanhoDir(dir) {
  let total = 0;
  let entradas;
  try { entradas = fs.readdirSync(dir); } catch { return 0; }
  for (const nome of entradas) {
    const cheio = path.join(dir, nome);
    let st; try { st = fs.statSync(cheio); } catch { continue; }
    if (st.isDirectory()) total += tamanhoDir(cheio);
    else total += st.size;
  }
  return total;
}

module.exports = { purgarEventosAntigos, tamanhoDir, encontrarDbs, PURGAS };
