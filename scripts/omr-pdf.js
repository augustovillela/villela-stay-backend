'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { converterPdf } = require('../music/tocar/omr');

async function main() {
  const entrada = process.argv[2];
  const destino = process.argv[3] || path.join(process.cwd(), 'music-omr-output');
  if (!entrada) throw new Error('Uso: npm run music:omr -- <partitura.pdf> [pasta-de-saida]');
  const resultado = await converterPdf(await fs.readFile(entrada), path.basename(entrada));
  await fs.mkdir(destino, { recursive: true });
  const arquivo = path.join(destino, resultado.arquivo);
  await fs.writeFile(arquivo, resultado.bytes, { flag: 'wx' });
  console.log(`OMR concluído: ${arquivo}`);
}

main().catch((erro) => { console.error('OMR não concluído:', erro.message); process.exitCode = 1; });
