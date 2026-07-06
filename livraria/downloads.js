// =====================================================================
// Livraria Villela — download seguro do PDF
// - PDFs ficam em DATA_DIR/livraria/pdfs (NUNCA em pasta pública/estática).
// - /download/:token valida expiração + contador + bloqueio, faz stream
//   com headers no-store e registra cada acesso em download_logs.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDF_DIR } = require('./db');

// Salva o buffer do PDF com nome opaco e devolve metadados p/ book_files.
function salvarPDF(buffer, originalName) {
  const filename = crypto.randomBytes(16).toString('hex') + '.pdf';
  fs.writeFileSync(path.join(PDF_DIR, filename), buffer);
  return { filename, original_name: originalName || 'livro.pdf', mime: 'application/pdf', tamanho: buffer.length };
}
function caminhoPDF(filename) { return path.join(PDF_DIR, filename); }
function removerPDF(filename) { try { fs.unlinkSync(caminhoPDF(filename)); } catch (_) {} }

// Handler Express do download. repo = ./repo. Devolve nada (responde direto).
function servirDownload(repo) {
  return function (req, res) {
    const tokenId = String(req.params.token || '');
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const ua = String(req.headers['user-agent'] || '');
    const v = repo.Tokens.validar(tokenId);
    if (!v.ok) {
      if (v.token) repo.Tokens.logar(v.token.id, v.token.order_id, v.token.book_id, { ip, ua, resultado: v.motivo });
      const msg = {
        inexistente: 'Link de download inválido.',
        bloqueado: 'Este acesso foi bloqueado. Fale com o suporte.',
        expirado: 'Este link de download expirou. Peça um novo pelo suporte ou pela sua biblioteca.',
        limite: 'O limite de downloads deste link foi atingido. Peça um novo pelo suporte.',
        sem_arquivo: 'O arquivo ainda não está disponível. Fale com o suporte.',
      }[v.motivo] || 'Não foi possível liberar o download.';
      res.status(v.motivo === 'inexistente' ? 404 : 403);
      return res.send(paginaErro(msg));
    }
    const file = v.file;
    const caminho = caminhoPDF(file.filename);
    if (!fs.existsSync(caminho)) {
      repo.Tokens.logar(v.token.id, v.token.order_id, v.token.book_id, { ip, ua, resultado: 'sem_arquivo' });
      res.status(410); return res.send(paginaErro('O arquivo não foi encontrado no servidor. Fale com o suporte.'));
    }
    // Consome 1 do contador e registra ANTES do stream (conta a tentativa de baixar).
    repo.Tokens.consumir(v.token.id);
    repo.Tokens.logar(v.token.id, v.token.order_id, v.token.book_id, { ip, ua, resultado: 'ok' });
    const livro = repo.Books.obter(v.token.book_id);
    const nomeArq = (livro ? repo.slugify(livro.titulo) : 'livro') + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArq}"`);
    res.setHeader('Content-Length', String(file.tamanho || fs.statSync(caminho).size));
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    fs.createReadStream(caminho).on('error', () => { if (!res.headersSent) res.status(500).end(); }).pipe(res);
  };
}

function paginaErro(msg) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Download — Villela Stay</title>
  <div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#0c3644;text-align:center">
    <div style="font-size:40px">📕</div>
    <h1 style="font-size:20px">Livraria Villela</h1>
    <p style="color:#5a6b72;line-height:1.6">${msg}</p>
    <p><a href="/suporte-livros" style="color:#1c6e8c">Falar com o suporte</a></p>
  </div>`;
}

module.exports = { salvarPDF, caminhoPDF, removerPDF, servirDownload };
