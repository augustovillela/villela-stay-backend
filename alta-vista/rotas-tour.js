// =====================================================================
// Villela Alta Vista 360 — viewer PÚBLICO dos tours (/alta-vista/t/:slug).
// Reusa o visualizador WebGL da casa (backend/site/src/tour360/) sem fork:
// esta camada injeta window.TOUR360 do banco, serve as texturas com gate de
// acesso e extrai do style.css do site só as regras .t360 (adapter).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Tours } = require('./tours');
const storage = require('./storage');
const { db } = require('./db');
const repo = require('./repo');
const { s } = repo;

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DIR_VIEWER = path.join(__dirname, '..', 'site', 'src', 'tour360');

// CSS do viewer: extrai do style.css do site as regras cujo seletor cita .t360
// (uma vez, em memória). Se o site mudar o visual, o tour herda no próximo boot.
let _cssT360 = '';
function cssT360() {
  if (_cssT360) return _cssT360;
  try {
    const css = fs.readFileSync(path.join(__dirname, '..', 'site', 'src', 'style.css'), 'utf8');
    _cssT360 = (css.match(/[^{}]*\.t360[^{}]*\{[^}]*\}/g) || []).join('\n');
  } catch (_) { _cssT360 = '.t360{position:relative;width:100%;height:70vh;background:#121416}'; }
  return _cssT360;
}

const jsonSeguro = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const TEXTOS = {
  carregando: 'Carregando a vista…', erro: 'Não foi possível carregar esta vista.',
  dica: 'Arraste para olhar em volta', aproximar: 'Aproximar', afastar: 'Afastar',
  girar: 'Girar sozinho', cinema: 'Modo cinema: passear pelo espaço sozinho',
  gravar: 'Gravar o passeio em vídeo', giroscopio: 'Mover o celular para olhar',
  telaCheia: 'Tela cheia', voltarPara: 'Voltar para',
  ariaCanvas: 'Panorama 360 graus. Arraste para olhar em volta; use as setas do teclado e + / − para aproximar.',
  semWebgl: 'Seu navegador não suporta a visualização 360° interativa.',
};

function registrarRotasTour(app, { jwtSecret }) {
  const nomeCookie = (t) => 'avt_' + t.id;
  const temAcessoCookie = (req, t) => {
    const tok = req.cookies && req.cookies[nomeCookie(t)];
    if (!tok) return false;
    try { return jwt.verify(tok, jwtSecret).tid === t.id; } catch (_) { return false; }
  };
  const darAcessoCookie = (res, t) => {
    res.cookie(nomeCookie(t), jwt.sign({ tid: t.id }, jwtSecret, { expiresIn: '2h' }), {
      httpOnly: true, sameSite: 'lax', path: `/alta-vista/t/${t.slug}`,
      secure: process.env.NODE_ENV !== 'development', maxAge: 2 * 3600 * 1000,
    });
  };
  // decide o que este request pode ver deste tour
  const acesso = (req, t) => {
    const preview = req.query && req.query.chave && t.preview_token && req.query.chave === t.preview_token;
    if (preview) return { ok: true, preview: true };
    if (temAcessoCookie(req, t)) return { ok: true, preview: false };
    if (t.status !== 'publicado') return { ok: false, motivo: 'rascunho' };
    if (Tours.expirado(t)) return { ok: false, motivo: 'expirado' };
    if (t.visibilidade === 'senha') return { ok: false, motivo: 'senha' };
    return { ok: true, preview: false };
  };

  const paginaBase = (t, corpo, { noindex = true, extra = '' } = {}) => `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.titulo)} — tour virtual 360°</title>
${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
<meta property="og:title" content="${esc(t.titulo)} — tour virtual 360°">
<style>
:root{--cerrado:${esc(t.marca_cor || '#0E7490')};--areia:#F7F6F2;--tinta:#17242D}
*{box-sizing:border-box}body{margin:0;background:#0B0F14;color:#EDEFF2;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;min-height:100vh;display:flex;flex-direction:column}
header.tp{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px}
header.tp b{font-size:1.02rem}
header.tp .marca-cli{color:${esc(t.marca_cor || '#0E7490')};font-weight:700}
header.tp a.cta{background:${esc(t.marca_cor || '#0E7490')};color:#fff;text-decoration:none;padding:9px 18px;border-radius:999px;font-size:.85rem;font-weight:700}
main.tp{flex:1;display:flex;flex-direction:column;padding:0 14px 8px}
footer.tp{padding:10px 18px;font-size:.72rem;color:#8FA3B0;text-align:center}
footer.tp a{color:#8FA3B0}
.t360{flex:1;min-height:min(78vh,760px);height:auto!important}
.aviso-topo{background:#B45309;color:#fff;text-align:center;font-size:.8rem;padding:6px 12px;font-weight:700}
.caixa-central{max-width:400px;margin:12vh auto;background:#121A22;border:1px solid #24313D;border-radius:14px;padding:28px;text-align:center}
.caixa-central input{width:100%;padding:11px;border-radius:8px;border:1px solid #24313D;background:#0B0F14;color:#EDEFF2;margin:12px 0}
.caixa-central button{width:100%;padding:12px;border-radius:999px;border:0;background:${esc(t.marca_cor || '#0E7490')};color:#fff;font-weight:700;cursor:pointer}
.erro{color:#F87171;font-size:.85rem}
${cssT360()}
</style>${extra}</head><body>${corpo}
<footer class="tp">Tour produzido e hospedado por <a href="/alta-vista" rel="noopener">Villela Alta Vista 360</a> — seu espaço visto por todos os ângulos.</footer>
</body></html>`;

  // ------------------------- página do tour -------------------------
  app.get('/alta-vista/t/:slug', (req, res) => {
    const t = Tours.porSlug(req.params.slug);
    if (!t) return res.status(404).type('html').send('<h1 style="font-family:sans-serif">Tour não encontrado</h1>');
    const a = acesso(req, t);

    if (!a.ok && a.motivo === 'rascunho') return res.status(404).type('html').send('<h1 style="font-family:sans-serif">Tour não encontrado</h1>');
    if (!a.ok && a.motivo === 'expirado') {
      return res.status(200).type('html').send(paginaBase(t, `<main class="tp"><div class="caixa-central">
        <h2>Este tour expirou</h2>
        <p style="color:#8FA3B0">A hospedagem deste tour virtual venceu${t.expira_em ? ' em ' + t.expira_em.split('-').reverse().join('/') : ''}. Se você é o dono, renove pelo seu painel.</p>
        <a href="/alta-vista/app" style="color:${esc(t.marca_cor)}">Renovar no painel →</a></div></main>`));
    }
    if (!a.ok && a.motivo === 'senha') {
      return res.status(200).type('html').send(paginaBase(t, `<main class="tp"><div class="caixa-central">
        <h2>${esc(t.titulo)}</h2>
        <p style="color:#8FA3B0">Este tour é protegido. Digite a senha que você recebeu.</p>
        <form method="POST" action="/alta-vista/t/${esc(t.slug)}/senha">
          <input type="password" name="senha" placeholder="senha" autofocus>
          <button type="submit">Entrar no tour</button>
          ${req.query.erro ? '<p class="erro">Senha incorreta.</p>' : ''}
        </form></div></main>`));
    }

    if (a.preview) darAcessoCookie(res, t); // as texturas do preview passam pelo mesmo gate
    if (!a.preview) Tours.registrarView(t.id);

    const cenas = t.cenas.map((c) => ({
      id: c.id, arquivo: c.id, titulo: c.titulo, casa: '', hub: !!c.hub, imovel: '',
      larguras: [1024],
      vistaInicial: { yaw: c.yaw || 0, pitch: c.pitch || 0, fov: c.fov || 75 },
      hotspots: c.hotspots.map((h) => ({ yaw: h.yaw, pitch: h.pitch, tipo: h.tipo, destino: h.destino_cena_id, texto: h.texto })),
    }));
    const inicial = t.cena_inicial || (cenas[0] && cenas[0].id) || '';
    const editor = a.preview && req.query.editor === '1';

    const corpo = `
${a.preview ? '<div class="aviso-topo">PRÉVIA — este tour ainda não está publicado' + (editor ? ' · MODO EDITOR (clique nas portas e use "Exportar tudo")' : '') + '</div>' : ''}
<header class="tp"><div><b>${esc(t.titulo)}</b>${t.marca_nome ? ` · <span class="marca-cli">${esc(t.marca_nome)}</span>` : ''}</div>
  ${t.contato_url ? `<a class="cta" href="${esc(t.contato_url)}" target="_blank" rel="noopener">Reservar / Falar</a>` : ''}</header>
<main class="tp"><div id="tour360" class="tour-360"></div></main>
<script>window.TOUR360 = ${jsonSeguro({ base: `/alta-vista/t/${t.slug}/img`, ver: String(Date.parse(t.atualizado_em || t.criado_em) || 1), cenas, inicial, textos: TEXTOS })};</script>
<script src="/alta-vista/tour360/visualizador.js?v=${Date.parse(t.atualizado_em || t.criado_em) || 1}" defer></script>
${editor ? `<script src="/alta-vista/tour360/editor.js" defer></script>` : ''}`;
    res.type('html').send(paginaBase(t, corpo, { noindex: t.visibilidade !== 'publico' || a.preview }));
  });

  app.post('/alta-vista/t/:slug/senha', require('express').urlencoded({ extended: false }), (req, res) => {
    const t = Tours.porSlug(req.params.slug);
    if (!t || t.status !== 'publicado') return res.status(404).send('não encontrado');
    const senha = String((req.body || {}).senha || '');
    if (!t.senha_hash || !bcrypt.compareSync(senha, t.senha_hash)) {
      return res.redirect(302, `/alta-vista/t/${t.slug}?erro=1`);
    }
    darAcessoCookie(res, t);
    res.redirect(302, `/alta-vista/t/${t.slug}`);
  });

  // ------------------------- texturas (com o MESMO gate) -------------------------
  // O visualizador pede <cenaId>-1024.jpg e <cenaId>-thumb.jpg — servimos o
  // panorama original nas duas (uma resolução por enquanto; multi-res depois).
  app.get('/alta-vista/t/:slug/img/:nome', async (req, res) => {
    const t = Tours.porSlug(req.params.slug);
    if (!t) return res.status(404).send('x');
    const a = acesso(req, t);
    if (!a.ok) return res.status(403).send('sem acesso');
    const m = String(req.params.nome).match(/^(.+?)-(thumb|\d+)\.jpg$/);
    if (!m) return res.status(400).send('nome inválido');
    const cena = t.cenas.find((c) => c.id === m[1]);
    if (!cena) return res.status(404).send('cena não encontrada');
    if (storage.s3Ativo()) return res.redirect(302, storage.assinarUrl(cena.chave, 600));
    // driver local: reusa a rota assinada interna
    return res.redirect(302, storage.assinarUrl(cena.chave, 600));
  });

  // ------------------------- assets do viewer (reuso, sem fork) -------------------------
  app.get('/alta-vista/tour360/visualizador.js', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type('application/javascript').sendFile(path.join(DIR_VIEWER, 'visualizador.js'));
  });
  app.get('/alta-vista/tour360/editor.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/javascript').sendFile(path.join(DIR_VIEWER, 'editor.js'));
  });
}

module.exports = { registrarRotasTour };
