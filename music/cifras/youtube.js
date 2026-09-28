// =====================================================================
// Musique Cifras — o vídeo da música no YouTube, achado sozinho.
//
// Pedido do Augusto (28/09/2026): ao importar ou salvar uma cifra, procurar
// o link do YouTube pelo nome da música e da banda e guardá-lo na música.
// Usa a YouTube Data API v3 (env `YOUTUBE_API_KEY`). Sem a chave, nada
// quebra: a tela oferece "Procurar no YouTube" com a busca pronta.
//
// A cota gratuita é de ~100 buscas/dia (cada busca custa 100 de 10.000),
// por isso: UMA tentativa por música, registrada em `youtube_buscas`, e o
// lote do acervo anda devagar e para no primeiro sinal de cota esgotada.
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('../db');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const ligado = () => !!process.env.YOUTUBE_API_KEY;
const idDoLink = (url) => {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(String(url || ''));
  return m ? m[1] : '';
};
const temVideo = (obraId) => db.prepare('SELECT url FROM obra_midias WHERE obra_id = ?').all(obraId).some((m) => idDoLink(m.url));

let _fetch = (...a) => fetch(...a);
function _transporte(fn) { _fetch = fn; }        // testes

/** Busca na API. Devolve { id, titulo, canal } ou null. Lança em cota/erro. */
async function buscarVideo(titulo, artista) {
  if (!ligado()) return null;
  const q = [s(titulo, 150), s(artista, 120)].filter(Boolean).join(' ');
  const u = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=5'
    + '&regionCode=BR&relevanceLanguage=pt&q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(process.env.YOUTUBE_API_KEY);
  const r = await _fetch(u);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const motivo = (d.error && d.error.errors && d.error.errors[0] && d.error.errors[0].reason) || ('http ' + r.status);
    const e = new Error('YouTube: ' + motivo); e.cota = /quota|rateLimit/i.test(motivo); throw e;
  }
  const itens = (d.items || []).filter((x) => x.id && x.id.videoId);
  if (!itens.length) return null;
  // Preferência: título que contém o nome da música (e não "aula"/"cover" quando há opção).
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const alvo = norm(titulo);
  const nota = (x) => (norm(x.snippet.title).includes(alvo) ? 2 : 0) + (norm(x.snippet.channelTitle + ' ' + x.snippet.title).includes(norm(artista)) ? 1 : 0)
    - (/aula|como tocar|tutorial|karaoke|cover|cifra/.test(norm(x.snippet.title)) ? 1 : 0);
  itens.sort((a, b) => nota(b) - nota(a));
  const v = itens[0];
  return { id: v.id.videoId, titulo: v.snippet.title, canal: v.snippet.channelTitle };
}

/**
 * Garante um vídeo do YouTube na música. `forcar` refaz mesmo se já tentou.
 * Devolve { resultado: 'adicionado'|'ja-tem'|'ja-tentou'|'sem-chave'|'nao-achou', video? }.
 */
async function garantirParaObra(obraId, usuario, { forcar = false } = {}) {
  const o = db.prepare('SELECT id, titulo, artista FROM obras WHERE id = ?').get(obraId);
  if (!o) return { resultado: 'sem-obra' };
  if (temVideo(obraId)) return { resultado: 'ja-tem' };
  if (!ligado()) return { resultado: 'sem-chave', busca: 'https://www.youtube.com/results?search_query=' + encodeURIComponent([o.titulo, o.artista].filter(Boolean).join(' ')) };
  const antes = db.prepare('SELECT * FROM youtube_buscas WHERE obra_id = ?').get(obraId);
  if (antes && !forcar) return { resultado: 'ja-tentou', em: antes.buscado_em };
  const v = await buscarVideo(o.titulo, o.artista);
  db.prepare(`INSERT INTO youtube_buscas (obra_id, buscado_em, resultado, consulta) VALUES (?, ?, ?, ?)
    ON CONFLICT(obra_id) DO UPDATE SET buscado_em = excluded.buscado_em, resultado = excluded.resultado, consulta = excluded.consulta`)
    .run(obraId, nowISO(), v ? v.id : 'nao-achou', s([o.titulo, o.artista].join(' '), 300));
  if (!v) return { resultado: 'nao-achou' };
  db.prepare(`INSERT INTO obra_midias (id, obra_id, tipo, titulo, url, media_id, marcadores, offset_ms, criado_por, criado_em)
    VALUES (?, ?, 'video', ?, ?, '', '[]', 0, ?, ?)`).run(novoId(), obraId, s('YouTube: ' + v.titulo, 160), 'https://www.youtube.com/watch?v=' + v.id, s(usuario || 'musique', 80), nowISO());
  return { resultado: 'adicionado', video: v };
}

/** Em segundo plano, sem nunca derrubar quem chamou (import, salvar). */
function emSegundoPlano(obraId, usuario) {
  if (!ligado()) return;
  setImmediate(() => garantirParaObra(obraId, usuario).catch((e) => console.error('[music/youtube]', e.message)));
}

/** Lote: as músicas da pessoa que ainda não têm vídeo. Para na cota. */
async function acervoSemVideo(usuario, { limite = 40 } = {}) {
  if (!ligado()) return { ligado: false, feitas: 0 };
  const obras = db.prepare(`SELECT o.id FROM obras o WHERE o.dono = ? AND COALESCE(o.removido_em, '') = ''
    AND o.id NOT IN (SELECT obra_id FROM youtube_buscas) ORDER BY o.criado_em DESC LIMIT ?`).all(usuario, Math.min(100, limite));
  const r = { ligado: true, feitas: 0, adicionados: 0, cota: false };
  for (const o of obras) {
    if (temVideo(o.id)) continue;
    try { const x = await garantirParaObra(o.id, usuario); r.feitas++; if (x.resultado === 'adicionado') r.adicionados++; }
    catch (e) { if (e.cota) { r.cota = true; break; } }
    await new Promise((ok) => setTimeout(ok, 150));
  }
  return r;
}

module.exports = { ligado, idDoLink, buscarVideo, garantirParaObra, emSegundoPlano, acervoSemVideo, _transporte };
