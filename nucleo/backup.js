// =====================================================================
// Núcleo · Backup do DATA_DIR (lista + download de arquivo). Consumido
// pelo stays\backup-portal.ps1 (Render → PC → OneDrive). Extraído do
// server.js (Projeto 2). Montado por montar(app, deps).
// deps: { DATA_DIR, requireAdminOuChave }
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

function backupWalk(dir, base, out) {
  for (const nome of fs.readdirSync(dir)) {
    const cheio = path.join(dir, nome);
    const st = fs.statSync(cheio);
    if (st.isDirectory()) backupWalk(cheio, base, out);
    else out.push({ caminho: path.relative(base, cheio).split(path.sep).join('/'), tamanho: st.size, mtime: st.mtime.toISOString() });
  }
  return out;
}

module.exports.montar = function montar(app, deps) {
  const { DATA_DIR, requireAdminOuChave } = deps;

  app.get('/staff/api/backup/lista', requireAdminOuChave, (req, res) => {
    try { res.json({ dataDir: true, arquivos: backupWalk(DATA_DIR, DATA_DIR, []) }); }
    catch (e) { res.status(500).json({ erro: 'Falha ao listar: ' + e.message }); }
  });

  app.get('/staff/api/backup/arquivo', requireAdminOuChave, (req, res) => {
    const rel = String(req.query.caminho || '');
    const alvo = path.resolve(DATA_DIR, rel);
    if (!alvo.startsWith(path.resolve(DATA_DIR) + path.sep)) return res.status(400).json({ erro: 'Caminho inválido.' });
    if (!fs.existsSync(alvo) || !fs.statSync(alvo).isFile()) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    res.sendFile(alvo);
  });
};
