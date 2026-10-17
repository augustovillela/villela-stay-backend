'use strict';

// Instala o Audiveris somente no ambiente Linux de build (Render). No Windows
// o instalador oficial do usuário continua sendo a fonte do trabalhador OMR.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const VERSION = '5.11.0';
const URL = `https://github.com/Audiveris/audiveris/releases/download/${VERSION}/Audiveris-${VERSION}-ubuntu24.04-x86_64.deb`;
const SHA256 = 'f20113aaa33b3149ec8d6a09b2a7963360e65fafd92d69389987a85bbc3ec7a3';
const DEST = path.resolve('vendor', 'audiveris');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} terminou com código ${code}`)));
  });
}

async function main() {
  if (process.platform !== 'linux') { console.log('[omr] Windows/macOS: Audiveris local não precisa de instalação no build.'); return; }
  const java = path.join(DEST, 'opt', 'audiveris', 'runtime', 'bin', 'java');
  const app = path.join(DEST, 'opt', 'audiveris', 'app');
  if (fs.existsSync(java) && fs.existsSync(path.join(app, 'audiveris.jar'))) { console.log('[omr] Audiveris já está instalado.'); return; }
  await fsp.mkdir(DEST, { recursive: true });
  const deb = path.join(DEST, `Audiveris-${VERSION}.deb`);
  console.log(`[omr] baixando Audiveris ${VERSION}…`);
  const resposta = await fetch(URL);
  if (!resposta.ok || !resposta.body) throw new Error(`download do Audiveris falhou: HTTP ${resposta.status}`);
  const arquivo = fs.createWriteStream(deb, { flags: 'wx' });
  const hash = crypto.createHash('sha256');
  for await (const chunk of resposta.body) { hash.update(chunk); arquivo.write(chunk); }
  await new Promise((resolve, reject) => { arquivo.end((e) => e ? reject(e) : resolve()); });
  if (hash.digest('hex') !== SHA256) throw new Error('hash do Audiveris não confere.');
  await run('dpkg-deb', ['-x', deb, DEST]);
  await fsp.rm(deb, { force: true });
  if (!fs.existsSync(java) || !fs.existsSync(path.join(app, 'audiveris.jar'))) throw new Error('instalação do Audiveris incompleta.');
  console.log(`[omr] Audiveris instalado em ${DEST}`);
}

main().catch((erro) => { console.error('[omr]', erro.message); process.exitCode = 1; });
