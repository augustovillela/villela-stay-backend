'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const LIMITE_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 180000;

function configuracao() {
  const windows = process.platform === 'win32';
  const java = process.env.AUDIVERIS_JAVA || (windows ? 'C:\\Program Files\\Audiveris\\runtime\\bin\\java.exe' : 'java');
  const app = process.env.AUDIVERIS_APP_DIR || (windows ? 'C:\\Program Files\\Audiveris\\app' : '');
  return { java, app, classpath: app ? path.join(app, '*') : 'audiveris.jar' };
}

function disponivel() {
  const c = configuracao();
  return !!c.app && fs.existsSync(c.java) && fs.existsSync(path.join(c.app, 'audiveris.jar'));
}

function erro(mensagem, status = 400) { return Object.assign(new Error(mensagem), { status }); }

async function converterPdf(bytes, nome = 'partitura.pdf') {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!buf.length) throw erro('O PDF está vazio.');
  if (buf.length > LIMITE_BYTES) throw erro('O PDF deve ter no máximo 10 MiB.');
  if (buf.subarray(0, 5).toString('ascii') !== '%PDF-') throw erro('O arquivo não é um PDF válido.');
  if (!disponivel()) throw Object.assign(new Error('O trabalhador OMR não está configurado neste servidor.'), { status: 503 });

  const c = configuracao();
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'musique-omr-'));
  const entrada = path.join(dir, 'entrada.pdf');
  const saida = path.join(dir, 'saida');
  await fsp.mkdir(saida);
  await fsp.writeFile(entrada, buf, { flag: 'wx' });
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(c.java, ['-cp', c.classpath, 'Audiveris', '-batch', '-export', '-output', saida, '--', entrada], { windowsHide: true });
      let stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(Object.assign(new Error('A conversão OMR excedeu 3 minutos.'), { status: 504 })); }, TIMEOUT_MS);
      child.stderr.on('data', (chunk) => { stderr += String(chunk).slice(-4000); });
      child.once('error', (e) => { clearTimeout(timer); reject(Object.assign(new Error('Não foi possível iniciar o Audiveris: ' + e.message), { status: 503 })); });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(Object.assign(new Error('Audiveris não conseguiu transcrever o PDF.'), { status: 422, detalhe: stderr }));
        resolve();
      });
    });
    const arquivos = await fsp.readdir(saida);
    const exportado = arquivos.find((item) => /\.(mxl|xml)$/i.test(item));
    if (!exportado) throw Object.assign(new Error('Audiveris terminou sem exportar MusicXML/MXL.'), { status: 422 });
    const arquivo = path.join(saida, exportado);
    return { nome: String(nome || exportado).slice(0, 160), arquivo: exportado, extensao: path.extname(exportado).toLowerCase(), bytes: await fsp.readFile(arquivo) };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { configuracao, disponivel, converterPdf, LIMITE_BYTES, TIMEOUT_MS };
