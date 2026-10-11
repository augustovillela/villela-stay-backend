// =====================================================================
// Villela Academy — ESTUDO · LEITOR DE PDF (ADR-0010, fase 3). Sem provedor:
// nada aqui custa — é o que permite ORÇAR antes de cobrar.
//
//   ler(bytes)                 texto por página (com as quebras de linha) e quais páginas vieram
//                              SEM camada de texto (escaneadas: só o modelo as lê, como bloco `document`)
//   recortar(bytes, paginas)   um PDF menor só com aquelas páginas, em base64, para mandar ao modelo
//
// O PDF é do usuário: dado NÃO confiável. Lê-se sem avaliar script, sem fonte do sistema e com teto
// de páginas; protegido por senha ou corrompido vira erro claro (status 422), antes de qualquer cobrança.
//
// PDF MONTADO PARA EXPLODIR (auditoria de 11/10/2026, item 16): o tamanho do arquivo e o número de páginas
// eram conferidos, o conteúdo DESCOMPRIMIDO de cada página não — e a leitura rodava no processo web, que é de
// todos os produtos. Agora `ler` roda num PROCESSO FILHO (este mesmo arquivo, em modo filho), com:
//   · prazo (PRAZO_MS): passou, o filho é morto — laço que não devolve o controle também morre;
//   · memória: teto do heap do filho (HEAP_MB) e, no Linux, da memória residente dele (MEMORIA_MB, lida de
//     /proc a cada 250 ms — é o que pega o que o heap não conta: os buffers descomprimidos);
//   · teto de TEXTO por página (PAGINA_TEXTO_MAX_CHARS), lido em fluxo: a leitura para no excesso;
//   · ambiente limpo: o filho não recebe as chaves do servidor;
//   · no máximo LEITURAS_SIMULTANEAS filhos de uma vez (as demais esperam a vez).
// O que estoura qualquer um deles vira erro 422, claro, antes de qualquer cobrança. `ACADEMY_PDF_ISOLADO=off`
// volta à leitura no próprio processo (com o teto por página e o prazo conferido entre páginas).
// =====================================================================
'use strict';
const path = require('path');
const fs = require('fs');

const MAX_PAGINAS_LIDAS = 300;       // acima disso não é caderno de prova: nem se abre página por página
const MINIMO_DE_TEXTO = 40;          // caracteres (sem espaço) para a página contar como "tem texto"
const erro = (msg, status = 422) => { const e = new Error(msg); e.status = status; return e; };
const ILEGIVEL = 'Não foi possível ler este PDF: o arquivo está corrompido ou não é um PDF. Nada foi cobrado.';
const PROTEGIDO = 'Este PDF está protegido por senha. Envie uma cópia sem proteção. Nada foi cobrado.';
const PESADO = 'Este PDF não pôde ser lido com segurança: o conteúdo dele, depois de aberto, é grande demais ou demora demais para ler. Envie o arquivo original da banca (ou uma cópia mais simples). Nada foi cobrado.';
const PRAZO_MS = Number(process.env.ACADEMY_PDF_PRAZO_MS) || 60000;      // um caderno real de 47 páginas / 30 MB lê em 1,5 s
const HEAP_MB = Number(process.env.ACADEMY_PDF_HEAP_MB) || 512;          // heap do processo filho
const MEMORIA_MB = Number(process.env.ACADEMY_PDF_MEM_MB) || 700;        // memória residente do filho (o pico real medido foi ~280 MB, no processo inteiro)
const PAGINA_TEXTO_MAX_CHARS = 300000;                                   // página de diário oficial em três colunas tem ~17 mil
const LEITURAS_SIMULTANEAS = 2;

let _pdfjs = null;
const pdfjs = async () => _pdfjs || (_pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'));
const FONTES = () => path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').split(path.sep).join('/') + '/';
const pareceSenha = (e) => /password|encrypt/i.test(`${e && e.name} ${e && e.message}`);

// As linhas da página, na ordem de leitura do arquivo. O pdfjs entrega pedaços; `hasEOL` marca o fim
// da linha. Onde ele não marca, a troca de altura (y) entre dois pedaços vale como quebra.
function textoDaPagina(itens) {
  const linhas = [];
  let atual = '', y = null;
  for (const it of itens) {
    if (typeof it.str !== 'string') continue;
    const yi = Array.isArray(it.transform) ? it.transform[5] : null;
    if (atual && y != null && yi != null && Math.abs(yi - y) > 2 && it.str.trim()) { linhas.push(atual); atual = ''; }
    atual += it.str;
    if (yi != null && it.str.trim()) y = yi;
    if (it.hasEOL) { linhas.push(atual); atual = ''; y = null; }
  }
  if (atual) linhas.push(atual);
  return linhas.map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}

// O texto de UMA página, lido em fluxo e com teto: passou de PAGINA_TEXTO_MAX_CHARS, a leitura é cancelada
// (o `getTextContent` montava a página inteira na memória antes de devolver qualquer coisa).
async function itensDaPagina(page, maxChars) {
  const leitor = page.streamTextContent().getReader(), itens = [];
  let chars = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    for (const it of (value && value.items) || []) { itens.push(it); if (typeof it.str === 'string') chars += it.str.length; }
    // (sem esperar o cancelamento: com a página ainda sendo interpretada, a promessa dele pode não resolver nunca)
    if (chars > maxChars) { try { Promise.resolve(leitor.cancel()).catch(() => {}); } catch (_) { /* já fechado */ } throw erro(PESADO); }
  }
  return itens;
}

// A leitura em si, NESTE processo. → { paginas, textos: [{ n, texto, sem_texto }] } — `n` a partir de 1.
async function lerAqui(bytes, { maxPaginas = MAX_PAGINAS_LIDAS, nome = 'Este PDF', prazo_ms = PRAZO_MS, pagina_max_chars = PAGINA_TEXTO_MAX_CHARS } = {}) {
  if (!bytes || bytes.length < 8 || bytes.subarray(0, 1024).indexOf('%PDF-') < 0) throw erro(ILEGIVEL);
  const limite = Date.now() + prazo_ms;
  const lib = await pdfjs();
  // cópia: o pdfjs fica com o buffer que recebe (quem chamou ainda vai recortar o original)
  const task = lib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false, disableFontFace: true, standardFontDataUrl: FONTES(), verbosity: 0 });
  try {
    let doc;
    try { doc = await task.promise; } catch (e) { throw erro(pareceSenha(e) ? PROTEGIDO : ILEGIVEL); }
    if (!doc.numPages) throw erro(ILEGIVEL);
    if (doc.numPages > maxPaginas) throw erro(`${nome} tem ${doc.numPages} páginas — o limite é de ${maxPaginas}. Nada foi cobrado.`);
    const textos = [];
    for (let n = 1; n <= doc.numPages; n++) {
      let texto = '';
      if (Date.now() > limite) throw erro(PESADO);
      try {
        const page = await doc.getPage(n);
        texto = textoDaPagina(await itensDaPagina(page, pagina_max_chars));
        page.cleanup();
      } catch (e) { if (e && e.message === PESADO) throw e; texto = ''; } // página que não abre é tratada como sem texto: o modelo a lê (ou a revisão a aponta)
      textos.push({ n, texto, sem_texto: texto.replace(/\s/g, '').length < MINIMO_DE_TEXTO });
    }
    return { paginas: doc.numPages, textos };
  } finally {
    // fechar o documento não pode segurar a resposta (nem o erro): espera-se pouco, e o resto fecha por conta própria
    await Promise.race([task.destroy().catch(() => {}), new Promise((ok) => { const r = setTimeout(ok, 2000); if (r.unref) r.unref(); })]);
  }
}

// A leitura ISOLADA: um processo filho por PDF, morto no prazo ou no teto de memória. Nunca rejeita com erro
// do sistema (caminho do servidor, pilha): o que não for erro de leitura conhecido vira PESADO ou ILEGIVEL.
let _lendo = 0;
const _fila = [];
const vez = () => new Promise((ok) => { if (_lendo < LEITURAS_SIMULTANEAS) { _lendo++; ok(); } else _fila.push(ok); });
const passarAVez = () => { const prox = _fila.shift(); if (prox) prox(); else _lendo--; };
// memória residente de um processo, em MB (só no Linux — é onde o serviço roda; fora dele, 0: vale o teto do heap)
function residenteMB(pid) {
  try { return (Number(fs.readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1]) * 4096) / 1048576; } catch (_) { return 0; }
}
function lerIsolado(bytes, opcoes = {}) {
  const prazo = opcoes.prazo_ms > 0 ? opcoes.prazo_ms : PRAZO_MS, memoria = opcoes.memoria_mb > 0 ? opcoes.memoria_mb : MEMORIA_MB;
  return new Promise((resolve, reject) => {
    const { fork } = require('child_process');
    // ambiente LIMPO: quem abre arquivo de usuário não carrega as chaves do servidor
    const env = {};
    for (const k of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'NODE_PATH']) if (process.env[k] != null) env[k] = process.env[k];
    let filho, fim = false, relogio = null, vigia = null;
    const encerrar = (fn) => {
      if (fim) return;
      fim = true;
      clearTimeout(relogio); clearInterval(vigia);
      try { if (filho && filho.exitCode == null) filho.kill('SIGKILL'); } catch (_) { /* já saiu */ }
      fn();
    };
    try {
      filho = fork(__filename, [], { execArgv: [`--max-old-space-size=${opcoes.heap_mb > 0 ? opcoes.heap_mb : HEAP_MB}`], serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env });
    } catch (_) { return reject(erro(ILEGIVEL)); }
    relogio = setTimeout(() => encerrar(() => reject(erro(PESADO))), prazo + 5000); // (o filho tem o próprio prazo; este é o do laço que não devolve)
    vigia = setInterval(() => { if (residenteMB(filho.pid) > memoria) encerrar(() => reject(erro(PESADO))); }, 250);
    if (vigia.unref) vigia.unref();
    filho.on('message', (m) => encerrar(() => {
      if (m && m.ok) return resolve(m.ok);
      const x = (m && m.erro) || {};
      reject(x.status ? erro(String(x.message || ILEGIVEL), x.status) : erro(ILEGIVEL));
    }));
    filho.on('error', () => encerrar(() => reject(erro(ILEGIVEL))));
    // saiu sem responder: estourou a memória (o Node aborta) ou foi morto pelo sistema
    filho.on('exit', () => encerrar(() => reject(erro(PESADO))));
    try { filho.send({ bytes, opcoes: { maxPaginas: opcoes.maxPaginas, nome: opcoes.nome, prazo_ms: prazo, pagina_max_chars: opcoes.pagina_max_chars } }, (e) => { if (e) encerrar(() => reject(erro(ILEGIVEL))); }); }
    catch (_) { encerrar(() => reject(erro(ILEGIVEL))); }
  });
}
// → { paginas, textos: [{ n, texto, sem_texto }] }. A porta de quem lê PDF de usuário.
async function ler(bytes, opcoes = {}) {
  // o que nem é PDF não merece um processo
  if (!bytes || bytes.length < 8 || bytes.subarray(0, 1024).indexOf('%PDF-') < 0) throw erro(ILEGIVEL);
  if (String(process.env.ACADEMY_PDF_ISOLADO || 'on').toLowerCase() === 'off') return lerAqui(bytes, opcoes);
  await vez();
  try { return await lerIsolado(bytes, opcoes); } finally { passarAVez(); }
}

// Um PDF só com as páginas pedidas (números a partir de 1, na ordem dada) → { base64, bytes, paginas }.
async function recortar(bytes, paginas) {
  const { PDFDocument } = require('pdf-lib');
  let origem, total;
  try { origem = await PDFDocument.load(bytes, { updateMetadata: false }); total = origem.getPageCount(); }
  catch (e) { throw erro(pareceSenha(e) ? PROTEGIDO : ILEGIVEL); }
  const lista = (Array.isArray(paginas) ? paginas : []).map(n => Math.round(Number(n))).filter(n => n >= 1 && n <= total);
  if (!lista.length) throw erro('Página fora do PDF.', 400);
  try {
    const novo = await PDFDocument.create();
    (await novo.copyPages(origem, lista.map(n => n - 1))).forEach(p => novo.addPage(p));
    const saida = Buffer.from(await novo.save());
    return { base64: saida.toString('base64'), bytes: saida.length, paginas: lista };
  } catch (_) { throw erro(ILEGIVEL); }
}

// Os lotes de uma faixa de páginas: [de, ate] em grupos de `porLote` → [[1,2,3,4],[5,6,7,8],…]
function lotes(de, ate, porLote) {
  const r = [];
  for (let i = de; i <= ate; i += porLote) r.push(Array.from({ length: Math.min(porLote, ate - i + 1) }, (_, k) => i + k));
  return r;
}

module.exports = { ler, lerAqui, recortar, lotes, textoDaPagina, MAX_PAGINAS_LIDAS, MINIMO_DE_TEXTO, PRAZO_MS, HEAP_MB, MEMORIA_MB, PAGINA_TEXTO_MAX_CHARS, LEITURAS_SIMULTANEAS, PESADO };

// MODO FILHO: este arquivo, executado por `lerIsolado`. Recebe UM pedido, responde e sai.
if (require.main === module && typeof process.send === 'function') {
  process.once('message', async (m) => {
    let resposta;
    try { resposta = { ok: await lerAqui(Buffer.from(m.bytes), m.opcoes || {}) }; }
    catch (e) { resposta = { erro: { message: e && e.status ? e.message : '', status: (e && e.status) || 0 } }; }
    process.send(resposta, () => process.exit(0));
  });
}
