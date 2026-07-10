// =====================================================================
// Snapshots consistentes dos bancos SQLite dos SaaS (durabilidade).
// Percorre o DATA_DIR, e para cada *.db roda `VACUUM INTO` — uma cópia
// transacionalmente consistente em UM arquivo, mesmo com o banco em uso
// (WAL). Os snapshots ficam em DATA_DIR/_snapshots/ e são levados pelo
// backup diário (backup-portal.ps1 → PC → OneDrive), garantindo uma cópia
// RESTAURÁVEL off-site (a cópia raw de .db/.db-wal/.db-shm pode sair
// inconsistente). Idempotente por dia; retém os N mais recentes por banco.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function encontrarDbs(dir, out = []) {
  let entradas;
  try { entradas = fs.readdirSync(dir); } catch { return out; }
  for (const nome of entradas) {
    const cheio = path.join(dir, nome);
    let st; try { st = fs.statSync(cheio); } catch { continue; }
    if (st.isDirectory()) {
      if (nome === '_snapshots') continue; // não snapshotar os próprios snapshots
      encontrarDbs(cheio, out);
    } else if (nome.endsWith('.db')) {
      out.push(cheio);
    }
  }
  return out;
}

function snapshotUmBanco(dbPath, destDir, carimbo, manter) {
  const nome = path.basename(dbPath, '.db');
  const destino = path.join(destDir, `${nome}-${carimbo}.db`);
  if (fs.existsSync(destino)) return destino; // já há snapshot de hoje → idempotente
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  } finally {
    try { db.close(); } catch {}
  }
  // retenção: mantém os N snapshots mais recentes DESTE banco (nome-AAAA-MM-DD.db ordena por data)
  const antigos = fs.readdirSync(destDir)
    .filter(f => f.startsWith(nome + '-') && f.endsWith('.db'))
    .sort();
  for (const f of antigos.slice(0, Math.max(0, antigos.length - manter))) {
    try { fs.rmSync(path.join(destDir, f)); } catch {}
  }
  return destino;
}

// Roda o snapshot de todos os bancos. `hoje` é injetável para teste (evita Date no core).
function snapshotTodos(dataDir, { manter = 7, hoje } = {}) {
  const destDir = path.join(dataDir, '_snapshots');
  fs.mkdirSync(destDir, { recursive: true });
  const carimbo = hoje || new Date().toISOString().slice(0, 10);
  const feitos = [];
  for (const db of encontrarDbs(dataDir)) {
    try { feitos.push(snapshotUmBanco(db, destDir, carimbo, manter)); }
    catch (e) { console.error('[snapshots] falha em', db, e.message); }
  }
  return feitos;
}

module.exports = { snapshotTodos, encontrarDbs, snapshotUmBanco };
