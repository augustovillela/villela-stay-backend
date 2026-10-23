// =====================================================================
// Villela Academy — AMOSTRAS GRÁTIS.
// Trechos curtos de vídeo (30 a 60 s), um por aula, PÚBLICOS: aparecem na
// página de venda do curso, no card do marketplace (selo) e nos artigos
// do blog de villelastay.com.br.
//
// O que impede esta porta pública de servir aula paga é o DESENHO, não uma
// checagem de permissão:
//   1. tabela própria (`amostras`) — a rota pública nunca lê `media_files`,
//      então o id de um vídeo de aula simplesmente não existe para ela;
//   2. prefixo próprio no storage (`amostras/<produto>/...`), conferido de
//      novo na hora de entregar: linha adulterada apontando para outro
//      arquivo responde 404;
//   3. só curso PUBLICADO: rascunho, pausado e suspenso respondem 404.
//
// Identidade = (produto, chave). `aula: 3` vira a chave `aula-3`; reenviar
// a mesma chave SUBSTITUI (arquivo novo, versão +1), nunca duplica.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, nowISO, novoId } = require('./db');
const storage = require('./storage');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const PREFIXO = 'amostras/';
const VIDEO_MAX_BYTES = 12 * 1024 * 1024;   // ~1 MB é o esperado; 12 MB é o teto do que cabe num envio
const CAPA_MAX_BYTES = 2 * 1024 * 1024;
const DURACAO_MAX_SEG = 180;                // amostra é trecho, não aula
const MAX_POR_PRODUTO = 60;
const MAX_POR_ENVIO = 30;
const EXT_VIDEO = { 'video/mp4': '.mp4' };
const EXT_CAPA = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// ---------------- validação pura (nada é gravado antes de TUDO passar) ----------------
function lerVideo(v) {
  const mime = s(v && v.mime, 60).toLowerCase() || 'video/mp4';
  if (!EXT_VIDEO[mime]) throw new Error('O vídeo da amostra precisa ser MP4 (video/mp4).');
  const buffer = Buffer.from(String((v && v.conteudo_base64) || ''), 'base64');
  if (!buffer.length) throw new Error('Vídeo da amostra vazio.');
  if (buffer.length > VIDEO_MAX_BYTES) throw new Error('Vídeo da amostra acima de 12 MB — amostra é trecho curto (30 a 60 s, ~1 MB).');
  // MP4 de verdade traz a caixa "ftyp" logo no começo: evita publicar outro arquivo com rótulo de vídeo
  if (buffer.length < 12 || buffer.toString('latin1', 4, 8) !== 'ftyp') throw new Error('O arquivo enviado como vídeo não é um MP4 válido.');
  return { mime, buffer };
}
function lerCapa(c) {
  const mime = s(c && c.mime, 60).toLowerCase() || 'image/jpeg';
  if (!EXT_CAPA[mime]) throw new Error('A capa da amostra precisa ser JPG, PNG ou WebP.');
  const buffer = Buffer.from(String((c && c.conteudo_base64) || ''), 'base64');
  if (!buffer.length) throw new Error('Capa da amostra vazia.');
  if (buffer.length > CAPA_MAX_BYTES) throw new Error('Capa da amostra acima de 2 MB.');
  const jpg = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const png = buffer.toString('latin1', 1, 4) === 'PNG';
  const webp = buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP';
  if (!((mime === 'image/jpeg' && jpg) || (mime === 'image/png' && png) || (mime === 'image/webp' && webp))) {
    throw new Error('A capa enviada não é uma imagem válida do tipo informado.');
  }
  return { mime, buffer };
}
// `aula: 3` → 'aula-3'; sem aula, a `chave` informada (ou 'curso')
function chaveDe(item) {
  const n = parseInt(item.aula, 10);
  if (Number.isFinite(n) && n > 0) {
    if (n > 999) throw new Error('Número de aula inválido.');
    return { chave: 'aula-' + n, aula_num: n };
  }
  const livre = s(item.chave, 40).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (/^aula-\d+$/.test(livre)) return { chave: livre, aula_num: parseInt(livre.slice(5), 10) };
  return { chave: livre || 'curso', aula_num: 0 };
}
function duracaoDe(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) throw new Error('Informe a duração da amostra em segundos.');
  if (n > DURACAO_MAX_SEG) throw new Error(`Amostra com ${n} s: o limite é ${DURACAO_MAX_SEG} s (amostra é trecho curto, não a aula).`);
  return n;
}

// ---------------- storage (sempre sob o prefixo amostras/) ----------------
const relSeguro = (rel) => typeof rel === 'string' && rel.startsWith(PREFIXO) && !rel.includes('..') && !rel.includes('\\');
async function guardar(rel, buffer, mime) {
  if (!storage.s3Ativo()) fs.mkdirSync(path.dirname(storage.caminhoLocal(rel)), { recursive: true });
  return storage.salvar(rel, buffer, mime);
}
// tira do storage o arquivo que a amostra deixou de usar (melhor esforço: falha aqui
// deixa um órfão no bucket, nunca um erro para quem enviou)
async function descartar(rel, onde) {
  if (!relSeguro(rel)) return;
  try {
    if (onde === 's3') {
      if (storage.s3Ativo()) await fetch(storage.presignS3(storage.s3cfg(), 'DELETE', rel, 300), { method: 'DELETE' });
    } else {
      fs.rmSync(storage.caminhoLocal(rel), { force: true });
    }
  } catch (_) { /* órfão no storage; a amostra em si já foi trocada */ }
}

// ---------------- leitura ----------------
const linha = (id) => db.prepare('SELECT * FROM amostras WHERE id = ?').get(String(id || ''));
const linhasDe = (productId) => db.prepare('SELECT * FROM amostras WHERE product_id = ? ORDER BY ordem, aula_num, criado_em').all(productId);
const tem = (productId) => !!db.prepare('SELECT 1 FROM amostras WHERE product_id = ? LIMIT 1').get(productId);

// título da aula N: o módulo "Aula NN — ..." da grade (nos cursos da casa o módulo É a aula).
// Resolvido na leitura, e não gravado: renomear o módulo não deixa a amostra com título velho.
function titulosDasAulas(productId) {
  const mapa = new Map();
  for (const m of db.prepare('SELECT titulo FROM course_modules WHERE product_id = ? ORDER BY ordem, criado_em').all(productId)) {
    const x = /^\s*aula\s+0*(\d{1,3})\b/i.exec(m.titulo || '');
    if (x && !mapa.has(Number(x[1]))) mapa.set(Number(x[1]), m.titulo);
  }
  return mapa;
}
// forma pública de uma amostra. `base` = '' para URL relativa (página da Academy) ou o
// domínio público para URL absoluta (API que o blog consome de outro domínio).
function publica(a, titulos, base = '') {
  const v = `?v=${a.versao}`;
  return {
    id: a.id,
    aula: a.aula_num || null,
    aula_titulo: (a.aula_num && titulos && titulos.get(a.aula_num)) || '',
    titulo: a.chamada,
    ponte: a.ponte || '',
    duracao_seg: a.duracao_seg || 0,
    ordem: a.ordem || 0,
    video_url: `${base}/academy/api/amostras/${a.id}/video.mp4${v}`,
    video_mime: a.video_mime,
    capa_url: a.capa_path ? `${base}/academy/api/amostras/${a.id}/capa.jpg${v}` : '',
  };
}
function publicasDoProduto(productId, base = '') {
  const linhas = linhasDe(productId);
  if (!linhas.length) return [];
  const titulos = titulosDasAulas(productId);
  return linhas.map(a => publica(a, titulos, base));
}
// visão de quem administra (rota staff): a pública + o que ajuda a conferir o envio
function listarAdmin(productId, base = '') {
  const titulos = titulosDasAulas(productId);
  return linhasDe(productId).map(a => ({
    ...publica(a, titulos, base), chave: a.chave, versao: a.versao,
    video_tamanho: a.video_tamanho, capa_tamanho: a.capa_tamanho,
    storage: a.video_storage, atualizado_em: a.atualizado_em,
  }));
}

// ---------------- escrita (PUBLISH_KEY / admin) ----------------
// Cria ou atualiza em lote. Só toca no que veio: reenviar só o texto não exige o vídeo
// de novo; reenviar o vídeo troca o arquivo e sobe a versão. Amostra NOVA exige vídeo,
// chamada e duração.
async function importar(produto, lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error('Informe "amostras": [ ... ].');
  if (lista.length > MAX_POR_ENVIO) throw new Error(`Envie no máximo ${MAX_POR_ENVIO} amostras por requisição.`);

  // 1) valida o envio INTEIRO antes da primeira escrita — erro no fim não deixa arquivo órfão
  const vistos = new Set();
  const plano = lista.map((bruto, i) => {
    const item = bruto || {};
    const onde = `amostra ${i + 1}`;
    try {
      const { chave, aula_num } = chaveDe(item);
      if (vistos.has(chave)) throw new Error(`a chave "${chave}" aparece duas vezes no envio.`);
      vistos.add(chave);
      const atual = db.prepare('SELECT * FROM amostras WHERE product_id = ? AND chave = ?').get(produto.id, chave);
      const chamada = item.chamada != null ? s(item.chamada, 200) : (item.titulo != null ? s(item.titulo, 200) : null);
      let video = item.video ? lerVideo(item.video) : null;
      let capa = item.capa ? lerCapa(item.capa) : null;
      if (video) video.sha = sha(video.buffer);
      if (capa) capa.sha = sha(capa.buffer);
      // o MESMO arquivo de novo não é troca: fica o que está, a versão (chave de cache) não sobe
      if (atual && video && video.sha === atual.video_sha256) video = null;
      if (atual && capa && atual.capa_path && capa.sha === atual.capa_sha256) capa = null;
      const duracao = item.duracao != null ? duracaoDe(item.duracao) : (item.duracao_seg != null ? duracaoDe(item.duracao_seg) : null);
      if (!atual) {
        if (!video) throw new Error('amostra nova precisa do vídeo.');
        if (!chamada) throw new Error('amostra nova precisa da "chamada" (título curto).');
        if (duracao == null) throw new Error('amostra nova precisa da "duracao" em segundos.');
      } else if (chamada === '') throw new Error('a "chamada" não pode ficar vazia.');
      return {
        atual, chave, aula_num, chamada, video, capa, duracao,
        ponte: item.ponte != null ? s(item.ponte, 300) : null,
        ordem: item.ordem != null ? (parseInt(item.ordem, 10) || 0) : null,
        tirarCapa: item.capa === null || item.remover_capa === true,
      };
    } catch (e) { throw new Error(`${onde}: ${e.message}`); }
  });
  const novas = plano.filter(x => !x.atual).length;
  const jaTem = db.prepare('SELECT COUNT(*) AS n FROM amostras WHERE product_id = ?').get(produto.id).n;
  if (jaTem + novas > MAX_POR_PRODUTO) throw new Error(`Limite de ${MAX_POR_PRODUTO} amostras por curso.`);

  // 2) grava
  const resumo = { criadas: 0, atualizadas: 0, arquivos_trocados: 0 };
  for (const x of plano) {
    const id = x.atual ? x.atual.id : novoId();
    const agora = nowISO();
    const sufixo = () => novoId().slice(0, 6);
    let v = null, c = null;
    if (x.video) {
      const rel = `${PREFIXO}${produto.id}/${id}-${sufixo()}${EXT_VIDEO[x.video.mime]}`;
      v = { rel, mime: x.video.mime, tamanho: x.video.buffer.length, sha: x.video.sha, onde: await guardar(rel, x.video.buffer, x.video.mime) };
    }
    if (x.capa) {
      const rel = `${PREFIXO}${produto.id}/${id}-${sufixo()}-capa${EXT_CAPA[x.capa.mime]}`;
      c = { rel, mime: x.capa.mime, tamanho: x.capa.buffer.length, sha: x.capa.sha, onde: await guardar(rel, x.capa.buffer, x.capa.mime) };
    }
    if (!x.atual) {
      db.prepare(`INSERT INTO amostras (id, product_id, chave, aula_num, chamada, ponte, duracao_seg, ordem,
          video_path, video_mime, video_tamanho, video_storage, video_sha256,
          capa_path, capa_mime, capa_tamanho, capa_storage, capa_sha256, versao, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(id, produto.id, x.chave, x.aula_num, x.chamada, x.ponte || '', x.duracao, x.ordem != null ? x.ordem : x.aula_num,
          v.rel, v.mime, v.tamanho, v.onde, v.sha,
          c ? c.rel : '', c ? c.mime : '', c ? c.tamanho : 0, c ? c.onde : 'local', c ? c.sha : '', agora, agora);
      resumo.criadas++;
      continue;
    }
    const a = x.atual;
    const trocouArquivo = !!(v || c || (x.tirarCapa && a.capa_path));
    db.prepare(`UPDATE amostras SET chamada = ?, ponte = ?, duracao_seg = ?, ordem = ?,
        video_path = ?, video_mime = ?, video_tamanho = ?, video_storage = ?, video_sha256 = ?,
        capa_path = ?, capa_mime = ?, capa_tamanho = ?, capa_storage = ?, capa_sha256 = ?, versao = ?, atualizado_em = ? WHERE id = ?`)
      .run(x.chamada != null ? x.chamada : a.chamada, x.ponte != null ? x.ponte : a.ponte,
        x.duracao != null ? x.duracao : a.duracao_seg, x.ordem != null ? x.ordem : a.ordem,
        v ? v.rel : a.video_path, v ? v.mime : a.video_mime, v ? v.tamanho : a.video_tamanho, v ? v.onde : a.video_storage, v ? v.sha : a.video_sha256,
        c ? c.rel : (x.tirarCapa ? '' : a.capa_path), c ? c.mime : (x.tirarCapa ? '' : a.capa_mime),
        c ? c.tamanho : (x.tirarCapa ? 0 : a.capa_tamanho), c ? c.onde : a.capa_storage, c ? c.sha : (x.tirarCapa ? '' : a.capa_sha256),
        a.versao + (trocouArquivo ? 1 : 0), agora, id);
    // o arquivo antigo só sai DEPOIS de a linha apontar para o novo
    if (v) await descartar(a.video_path, a.video_storage);
    if ((c || x.tirarCapa) && a.capa_path) await descartar(a.capa_path, a.capa_storage);
    resumo.atualizadas++;
    if (trocouArquivo) resumo.arquivos_trocados++;
  }
  return resumo;
}

// apaga uma amostra do produto: por id, por aula ou por chave
async function remover(produto, dados = {}) {
  let a = null;
  if (dados.id) a = db.prepare('SELECT * FROM amostras WHERE id = ? AND product_id = ?').get(s(dados.id, 40), produto.id);
  else if (dados.aula != null || dados.chave != null) {
    a = db.prepare('SELECT * FROM amostras WHERE product_id = ? AND chave = ?').get(produto.id, chaveDe(dados).chave);
  } else throw new Error('Informe qual amostra remover: "aula", "chave" ou "id".');
  if (!a) throw new Error('Amostra não encontrada neste curso.');
  db.prepare('DELETE FROM amostras WHERE id = ?').run(a.id);
  await descartar(a.video_path, a.video_storage);
  if (a.capa_path) await descartar(a.capa_path, a.capa_storage);
  return { id: a.id, chave: a.chave };
}

module.exports = {
  PREFIXO, VIDEO_MAX_BYTES, CAPA_MAX_BYTES, DURACAO_MAX_SEG,
  linha, tem, relSeguro, publicasDoProduto, listarAdmin, importar, remover,
};
