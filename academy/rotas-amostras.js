// =====================================================================
// Villela Academy — rotas das AMOSTRAS GRÁTIS.
//
// PÚBLICAS (sem login; CORS liberado para o site do grupo, que toca o
// vídeo de outro domínio):
//   GET /academy/api/cursos/:slug/amostras       lista (JSON) — só curso PUBLICADO
//   GET /academy/api/amostras/:id/video.mp4      o trecho (aceita Range)
//   GET /academy/api/amostras/:id/capa.jpg       a capa
//
// AUTOMAÇÃO (PUBLISH_KEY ou admin do portal), em nome do produtor dono:
//   GET  /staff/api/academy/amostras?produtor_email=&produto_id=
//   POST /staff/api/academy/amostras/importar    cria/substitui em lote
//   POST /staff/api/academy/amostras/remover     apaga uma
//
// Os caminhos públicos ficam sob /academy/api de propósito: o service
// worker do app não intercepta /api (vídeo com Range atrás de cache de SW
// é pedir defeito) e o padrão ali é `no-store` — então o ERRO nunca sai
// cacheável, e o cache longo só é escrito quando os bytes existem.
// =====================================================================
'use strict';
const fs = require('fs');
const { Readable } = require('stream');
const repo = require('./repo');
const ct = require('./repo-conteudo');
const storage = require('./storage');
const am = require('./amostras');
const imp = require('./importacao');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const BASE_URL = () => (process.env.ACADEMY_BASE_URL || 'https://academia.villelastay.com.br').replace(/\/+$/, '');

// quem pode tocar a amostra a partir de outro domínio: o site do grupo (o blog).
// ACADEMY_AMOSTRAS_ORIGENS (lista separada por vírgula) acrescenta origens sem deploy.
const ORIGENS_FIXAS = ['https://villelastay.com.br', 'https://www.villelastay.com.br'];
const origens = () => ORIGENS_FIXAS.concat(String(process.env.ACADEMY_AMOSTRAS_ORIGENS || '').split(',').map(x => x.trim()).filter(Boolean));
function cors(req, res) {
  // Vary SEMPRE: a resposta é cacheável e muda conforme a origem — sem isto um cache
  // entregaria a quem veio do blog a cópia sem o cabeçalho (ou com o de outra origem).
  res.vary('Origin');
  const o = req.headers.origin;
  if (o && origens().includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  }
}

// Range de um pedido: null = arquivo inteiro; false = não dá para atender (416)
function faixaDe(cab, tamanho) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(cab || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;         // ausente, malformado ou múltiplo: inteiro
  let ini, fim;
  if (m[1] === '') {                                            // sufixo: os últimos N bytes
    const n = parseInt(m[2], 10);
    if (!n) return false;
    ini = Math.max(0, tamanho - n); fim = tamanho - 1;
  } else {
    ini = parseInt(m[1], 10);
    fim = m[2] === '' ? tamanho - 1 : Math.min(parseInt(m[2], 10), tamanho - 1);
    if (m[2] !== '' && parseInt(m[2], 10) < ini) return null;   // invertido = malformado: inteiro
  }
  if (ini >= tamanho) return false;
  return { ini, fim };
}

function registrarRotasAmostras(app) {
  const nao = (res) => res.status(404).json({ erro: 'Amostra não encontrada.' });

  // preflight (em produção o CORS global do server.js responde antes; aqui vale o módulo sozinho)
  app.options(['/academy/api/cursos/:slug/amostras', '/academy/api/amostras/:id/:arquivo'], (req, res) => {
    cors(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
  });

  // ---- lista pública das amostras de um curso (pelo slug) ----
  app.get('/academy/api/cursos/:slug/amostras', (req, res) => {
    cors(req, res);
    const p = ct.Marketplace.porSlug(s(req.params.slug, 90)); // só publicado; rascunho = 404
    if (!p) return res.status(404).json({ erro: 'Curso não encontrado.' });
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      curso: { titulo: p.titulo, slug: p.slug, url: `${BASE_URL()}/academy/cursos/${p.slug}` },
      amostras: am.publicasDoProduto(p.id, BASE_URL()),
    });
  });

  // ---- os bytes (vídeo e capa) ----
  // A amostra é procurada SÓ na tabela `amostras`: id de mídia de aula não existe aqui.
  async function entregar(req, res, qual) {
    cors(req, res);
    const a = am.linha(s(req.params.id, 40));
    if (!a) return nao(res);
    const p = ct.Produtos.obter(a.product_id);
    if (!p || p.status !== 'publicado') return nao(res);        // curso fora do ar leva as amostras junto
    const rel = qual === 'video' ? a.video_path : a.capa_path;
    const mime = qual === 'video' ? a.video_mime : a.capa_mime;
    const onde = qual === 'video' ? a.video_storage : a.capa_storage;
    let tamanho = qual === 'video' ? a.video_tamanho : a.capa_tamanho;
    // cinto e suspensório: mesmo que a linha fosse adulterada, só sai o que mora no prefixo das amostras
    if (!rel || !am.relSeguro(rel)) return nao(res);

    let caminho = '';
    if (onde === 's3') { if (!storage.s3Ativo()) return nao(res); }
    else {
      caminho = storage.caminhoLocal(rel);
      let st; try { st = fs.statSync(caminho); } catch (_) { return nao(res); } // sumiu do disco: 404 sem cache
      tamanho = st.size;
    }
    if (!tamanho) return nao(res);

    const etag = `"am-${a.id}-${a.versao}-${qual[0]}"`;
    const faixa = faixaDe(req.headers.range, tamanho);
    if (faixa === false) {                                      // 416 sai com o no-store padrão de /academy/api
      res.setHeader('Content-Range', `bytes */${tamanho}`);
      return res.status(416).json({ erro: 'Trecho fora do arquivo.' });
    }
    // Cabeçalhos de SUCESSO só são escritos quando já se sabe que os bytes existem.
    const cabecalhos = (status, n) => {
      res.status(status);
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', String(n));
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('ETag', etag);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // ?v=<versão atual> identifica o arquivo: pode guardar para sempre. Sem a chave (ou
      // com uma antiga), 1 hora — trocar a amostra não pode deixar a velha um ano no navegador.
      res.setHeader('Cache-Control', String(req.query.v || '') === String(a.versao)
        ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      if (faixa) res.setHeader('Content-Range', `bytes ${faixa.ini}-${faixa.fim}/${tamanho}`);
    };
    if (!faixa && req.headers['if-none-match'] === etag) {
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(304).end();
    }
    const n = faixa ? faixa.fim - faixa.ini + 1 : tamanho;

    if (onde !== 's3') {
      cabecalhos(faixa ? 206 : 200, n);
      if (req.method === 'HEAD') return res.end();
      const fluxo = fs.createReadStream(caminho, faixa ? { start: faixa.ini, end: faixa.fim } : {});
      fluxo.on('error', () => res.destroy());
      return fluxo.pipe(res);
    }
    // No bucket: os bytes PASSAM pelo servidor (a URL precisa ser estável para o blog e
    // para o cache; URL presignada expira). O Range do visitante vai adiante.
    let r;
    try {
      r = await fetch(storage.presignS3(storage.s3cfg(), 'GET', rel, 300),
        faixa ? { headers: { Range: `bytes=${faixa.ini}-${faixa.fim}` } } : undefined);
    } catch (_) { return nao(res); }
    if (!r.ok || !r.body) return nao(res);
    if (faixa && r.status !== 206) {                            // storage ignorou o Range: recorta aqui
      const tudo = Buffer.from(await r.arrayBuffer());
      const pedaco = tudo.subarray(faixa.ini, faixa.fim + 1);
      if (pedaco.length !== n) return nao(res);
      cabecalhos(206, n);
      return res.end(req.method === 'HEAD' ? undefined : pedaco);
    }
    cabecalhos(faixa ? 206 : 200, n);
    if (req.method === 'HEAD') { try { await r.body.cancel(); } catch (_) {} return res.end(); }
    const fluxo = Readable.fromWeb(r.body);
    fluxo.on('error', () => res.destroy());
    fluxo.pipe(res);
  }
  const seguro = (qual) => (req, res) => entregar(req, res, qual).catch(() => { if (!res.headersSent) nao(res); else res.destroy(); });
  app.get('/academy/api/amostras/:id/video.mp4', seguro('video'));
  app.get('/academy/api/amostras/:id/capa.jpg', seguro('capa'));
}

function registrarRotasAmostrasStaff(app, { requirePublishOrAdmin, requireAuth, requireAdmin }) {
  // sem a injeção cai em sessão de admin — nunca afrouxa sozinho
  const PA = requirePublishOrAdmin ? [requirePublishOrAdmin] : [requireAuth, requireAdmin];
  const h = (fn) => (req, res) => {
    try { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); }
    catch (e) { res.status(400).json({ erro: e.message }); }
  };
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || (req.viaChave ? 'chave-de-publicacao' : 'plataforma'));
  const aud = (req, acao, id, det) => repo.Auditoria.registrar({ quem: quem(req), papel: 'staff', acao, entidade: 'amostras', entidade_id: s(id, 40), detalhe: s(det, 300), ip: '' });
  const resposta = (produto) => ({
    produto: { id: produto.id, titulo: produto.titulo, slug: produto.slug, status: produto.status },
    // amostra de curso que não está publicado fica guardada, mas não aparece para ninguém
    visivel_ao_publico: produto.status === 'publicado',
    amostras: am.listarAdmin(produto.id, BASE_URL()), // URLs absolutas: prontas para colar no artigo do blog
  });

  app.get('/staff/api/academy/amostras', ...PA, h((req, res) => {
    const { produto } = imp.produtorDono(req.query || {});
    res.json({ ok: true, ...resposta(produto) });
  }));
  app.post('/staff/api/academy/amostras/importar', ...PA, h(async (req, res) => {
    const b = req.body || {};
    const { produto } = imp.produtorDono(b);
    const resumo = await am.importar(produto, b.amostras);
    aud(req, 'amostras.importar', produto.id, `${resumo.criadas} criada(s), ${resumo.atualizadas} atualizada(s)`);
    res.json({ ok: true, resumo, ...resposta(produto) });
  }));
  app.post('/staff/api/academy/amostras/remover', ...PA, h(async (req, res) => {
    const b = req.body || {};
    const { produto } = imp.produtorDono(b);
    const r = await am.remover(produto, b);
    aud(req, 'amostras.remover', produto.id, r.chave);
    res.json({ ok: true, removida: r, ...resposta(produto) });
  }));
}

module.exports = { registrarRotasAmostras, registrarRotasAmostrasStaff, faixaDe };
