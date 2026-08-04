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

// Nome do snapshot a partir do caminho RELATIVO ao DATA_DIR, não só do basename:
// escritórios/tenants diferentes têm bancos com o MESMO nome de arquivo
// (legal/legal.db e legal-esc-fulano/legal.db) e um anularia o outro. Quando a
// pasta já tem o nome do banco (academy/academy.db) o slug continua "academy",
// para não renomear os snapshots que já existem.
function slugDoBanco(dataDir, dbPath) {
  const rel = path.relative(dataDir, dbPath);
  const base = path.basename(rel, '.db');
  const dir = path.dirname(rel);
  if (dir === '.' || dir === base) return base;
  return dir.split(/[\\/]/).concat(base).join('__');
}

function snapshotUmBanco(dbPath, destDir, carimbo, manter, nomeSlug) {
  const nome = nomeSlug || path.basename(dbPath, '.db');
  const destino = path.join(destDir, `${nome}-${carimbo}.db`);
  if (fs.existsSync(destino)) return destino; // já há snapshot de hoje → idempotente
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  } finally {
    try { db.close(); } catch {}
  }
  // retenção: mantém os N snapshots mais recentes DESTE banco (nome-AAAA-MM-DD.db ordena por data).
  // O filtro exige a data no fim: com `startsWith(nome + '-')`, o banco "legal" adotava também os
  // snapshots de "legal-saas" e apagava os próprios ao podar (era por isso que legal-*.db sumia).
  const reDoBanco = new RegExp('^' + nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d{4}-\\d{2}-\\d{2}\\.db$');
  const antigos = fs.readdirSync(destDir)
    .filter(f => reDoBanco.test(f))
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
    try { feitos.push(snapshotUmBanco(db, destDir, carimbo, manter, slugDoBanco(dataDir, db))); }
    catch (e) { console.error('[snapshots] falha em', db, e.message); }
  }
  return feitos;
}

module.exports = { snapshotTodos, encontrarDbs, snapshotUmBanco, slugDoBanco };
