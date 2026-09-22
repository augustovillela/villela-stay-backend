// =====================================================================
// Comunicados — ANEXOS do suporte (print, foto, PDF).
//
// Privado por decisão: um print de suporte costuma ter dado pessoal na
// tela. Nada é servido por URL pública — o arquivo sai por uma rota que
// confere a sessão do dono da conversa (ou a sessão de admin do staff).
//
// Dois drivers:
//   • 'local' (padrão): DATA_DIR/comunicados/anexos/. O disco do Render é
//     de 1 GB e é compartilhado por todos os produtos — por isso há teto
//     por arquivo E teto da pasta inteira; passou do teto, recusa com uma
//     frase clara em vez de encher o disco de todo mundo.
//   • 's3'  (COMUNICADOS_S3_*): R2/S3 privado, sem URL pública; a leitura
//     usa URL assinada de 5 minutos.
//
// O tipo vem dos BYTES, nunca do que o navegador disse: quem manda o
// arquivo escolhe o `Content-Type`, e nome de arquivo mente.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, MOD_DIR, nowISO, novoId } = require('./db');
const s3 = require('../storage-s3');

const DIR = path.join(MOD_DIR, 'anexos');
fs.mkdirSync(DIR, { recursive: true });

const MAX_BYTES = Number(process.env.COMUNICADOS_ANEXO_MAX_BYTES) || 5 * 1024 * 1024;   // 5 MB por arquivo
const MAX_POR_MENSAGEM = 3;
const TETO_PASTA_MB = Number(process.env.COMUNICADOS_ANEXOS_TETO_MB) || 400;            // disco do Render = 1 GB

const cfgS3 = () => ({
  endpoint: process.env.COMUNICADOS_S3_ENDPOINT || '',
  bucket: process.env.COMUNICADOS_S3_BUCKET || '',
  key: process.env.COMUNICADOS_S3_KEY || '',
  secret: process.env.COMUNICADOS_S3_SECRET || '',
  region: process.env.COMUNICADOS_S3_REGION || 'auto',
});
const s3Ativo = () => { const c = cfgS3(); return !!(c.endpoint && c.bucket && c.key && c.secret); };

const ASSINATURAS = [
  { ext: 'jpg', mime: 'image/jpeg', testa: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: 'png', mime: 'image/png', testa: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: 'webp', mime: 'image/webp', testa: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  { ext: 'pdf', mime: 'application/pdf', testa: (b) => b.slice(0, 5).toString('ascii') === '%PDF-' },
];
const identificar = (buf) => (buf && buf.length > 16) ? (ASSINATURAS.find((a) => a.testa(buf)) || null) : null;
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
const limpaNome = (n) => String(n || 'arquivo').replace(/[^\w .()\-À-ſ]/g, '_').slice(0, 80);

function tamanhoPasta() {
  let t = 0;
  try { for (const f of fs.readdirSync(DIR)) { try { t += fs.statSync(path.join(DIR, f)).size; } catch (_) {} } } catch (_) {}
  return t;
}

/** anexos = [{ nome, dados }] com `dados` em base64 (data-url ou puro). */
async function guardar(conversaId, mensagemId, autor, lista) {
  const arquivos = (Array.isArray(lista) ? lista : []).filter(Boolean);
  if (!arquivos.length) return [];
  if (arquivos.length > MAX_POR_MENSAGEM) throw erro(`No máximo ${MAX_POR_MENSAGEM} arquivos por mensagem.`);
  const salvos = [];
  for (const a of arquivos) {
    const base64 = String(a.dados || '').replace(/^data:[^;]*;base64,/, '');
    let buf;
    try { buf = Buffer.from(base64, 'base64'); } catch (_) { throw erro('Arquivo inválido.'); }
    if (!buf.length) throw erro('Arquivo vazio.');
    if (buf.length > MAX_BYTES) throw erro(`Cada arquivo pode ter no máximo ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
    const tipo = identificar(buf);
    if (!tipo) throw erro('Só aceitamos imagem (JPG, PNG, WEBP) ou PDF.');
    const id = novoId();
    const chave = `${conversaId}/${id}.${tipo.ext}`;
    let driver = 'local';
    if (s3Ativo()) { await s3.s3Put(cfgS3(), chave, buf, tipo.mime); driver = 's3'; }
    else {
      if (tamanhoPasta() + buf.length > TETO_PASTA_MB * 1024 * 1024) {
        throw erro('O espaço de anexos está cheio. Descreva o problema por texto que a equipe responde igual.', 507);
      }
      fs.mkdirSync(path.join(DIR, conversaId), { recursive: true });
      fs.writeFileSync(path.join(DIR, chave), buf);
    }
    db.prepare(`INSERT INTO anexos (id, conversa_id, mensagem_id, autor, nome, mime, bytes, driver, chave, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, conversaId, mensagemId || null, autor, limpaNome(a.nome), tipo.mime, buf.length, driver, chave, nowISO());
    salvos.push({ id, nome: limpaNome(a.nome), mime: tipo.mime, bytes: buf.length });
  }
  return salvos;
}

const daMensagem = (mensagemId) => db.prepare('SELECT id, nome, mime, bytes FROM anexos WHERE mensagem_id = ? ORDER BY rowid').all(mensagemId);
const porConversa = (conversaId) => db.prepare('SELECT * FROM anexos WHERE conversa_id = ?').all(conversaId);
const obter = (id) => db.prepare('SELECT * FROM anexos WHERE id = ?').get(String(id || '')) || null;

/** Devolve { buffer, mime, nome } (local) ou { url, mime, nome } (S3, 5 min). */
async function ler(anexo) {
  if (!anexo) throw erro('Anexo não encontrado.', 404);
  if (anexo.driver === 's3') return { url: s3.presignS3(cfgS3(), 'GET', anexo.chave, 300), mime: anexo.mime, nome: anexo.nome };
  const p = path.join(DIR, anexo.chave);
  if (!fs.existsSync(p)) throw erro('Anexo não encontrado.', 404);
  return { buffer: fs.readFileSync(p), mime: anexo.mime, nome: anexo.nome };
}

/** Apaga o binário e a linha. Usado pela LGPD (exclusão e retenção). */
async function apagar(anexo) {
  if (!anexo) return false;
  try {
    if (anexo.driver === 's3') {
      const url = s3.presignS3(cfgS3(), 'DELETE', anexo.chave, 120);
      await fetch(url, { method: 'DELETE' });
    } else {
      const p = path.join(DIR, anexo.chave);
      if (fs.existsSync(p)) fs.unlinkSync(p);
      const pasta = path.dirname(p);
      try { if (fs.readdirSync(pasta).length === 0) fs.rmdirSync(pasta); } catch (_) {}
    }
  } catch (e) { console.error('[comunicados/anexos] falha ao apagar', anexo.id, e.message); }
  db.prepare('DELETE FROM anexos WHERE id = ?').run(anexo.id);
  return true;
}
const apagarDaConversa = async (conversaId) => { for (const a of porConversa(conversaId)) await apagar(a); };

module.exports = {
  guardar, daMensagem, porConversa, obter, ler, apagar, apagarDaConversa,
  LIMITES: { MAX_BYTES, MAX_POR_MENSAGEM, TETO_PASTA_MB }, s3Ativo, tamanhoPasta, DIR,
};
