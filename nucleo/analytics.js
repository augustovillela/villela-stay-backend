// =====================================================================
// Núcleo · Analytics (page views do site estático) + captura de leads.
//
// O site villelastay.com.br é servido como site estático em OUTRO serviço do
// Render, então ele não passa pelo middleware de visitas deste backend — ele
// avisa a visita por este pixel /api/hit. Os demais sites do grupo são
// renderizados aqui e já são contados pelo middleware (nucleo/visitas.js).
//
// deps: { DATA_DIR, tokensIguais, limiteTaxa, appendJsonl, upsertContato,
//         registrarVisita }
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const visitas = require('./visitas');

module.exports.montar = function montar(app, deps) {
  const { DATA_DIR, tokensIguais, limiteTaxa, appendJsonl, upsertContato, registrarVisita } = deps;
  // Gate por ADMIN_KEY (chave de admin em header). Responde 401 e retorna false quando falha.
  const exigeAdminKey = (req, res) => {
    if (!process.env.ADMIN_KEY || !tokensIguais(req.headers['x-admin-key'], process.env.ADMIN_KEY)) { res.sendStatus(401); return false; }
    return true;
  };

  // Consulta dos últimos eventos recebidos (protegido por chave de admin)
  app.get('/api/eventos', (req, res) => {
    if (!exigeAdminKey(req, res)) return;
    const file = path.join(DATA_DIR, 'eventos.jsonl');
    if (!fs.existsSync(file)) return res.json([]);
    const linhas = fs.readFileSync(file, 'utf8').trim().split('\n').slice(-50);
    res.json(linhas.map(l => { try { return JSON.parse(l); } catch { return { bruto: l }; } }));
  });

  // Analytics próprio: registra page views (GET sem preflight de CORS; sem cookies — LGPD ok).
  // Parâmetros: p = caminho, r = referrer, q = query da página (traz os utm_*), l = idioma.
  app.get('/api/hit', (req, res) => {
    if (!limiteTaxa('hit:' + req.ip, 120, 60000)) return res.sendStatus(429); // analytics: generoso, só barra abuso
    const { p, r, q, l } = req.query;
    if (p) {
      // A query vem da URL da página visitada, não desta chamada — é dela que
      // saem os utm_* da campanha que trouxe a pessoa.
      let daPagina = {};
      try { daPagina = Object.fromEntries(new URLSearchParams(String(q || '').replace(/^\?/, ''))); } catch {}
      registrarVisita({
        produto: 'site',
        caminho: String(p).slice(0, 200),
        ref: String(r || '').slice(0, 300),
        utm: visitas.utmDe(daPagina),
        ua: req.headers['user-agent'] || '',
        ip: req.ip,
        aceitaIdioma: String(l || '') || req.headers['accept-language'] || '',
      });
    }
    res.sendStatus(204);
  });

  // Resumo de visitas (protegido): páginas mais vistas e visitas por dia.
  // Mantido para compatibilidade — a tela nova consome /staff/api/visitas.
  app.get('/api/estatisticas', (req, res) => {
    if (!exigeAdminKey(req, res)) return;
    const file = path.join(DATA_DIR, 'hits.jsonl');
    if (!fs.existsSync(file)) return res.json({ totalVisitas: 0, porPagina: {}, porDia: {} });
    const linhas = fs.readFileSync(file, 'utf8').trim().split('\n');
    const porPagina = {}, porDia = {};
    for (const l of linhas) {
      try {
        const h = JSON.parse(l);
        porPagina[h.pagina] = (porPagina[h.pagina] || 0) + 1;
        const dia = (h._recebido || '').slice(0, 10);
        porDia[dia] = (porDia[dia] || 0) + 1;
      } catch {}
    }
    res.json({ totalVisitas: linhas.length, porPagina, porDia });
  });

  // Captura de leads do site (formulário de orçamento / chat).
  // Grava também o CANAL de origem: sem isso não dá para dizer qual origem
  // gera lead, só qual gera clique — que é a pergunta que interessa.
  app.post('/api/leads', (req, res) => {
    if (!limiteTaxa('lead:' + req.ip, 10, 60000)) return res.status(429).json({ erro: 'muitas tentativas, tente novamente em instantes' });
    const { nome, contato, mensagem, origem, ref, utm } = req.body || {};
    if (!nome || !contato) return res.status(400).json({ erro: 'nome e contato são obrigatórios' });
    const refUsado = String(ref || req.headers.referer || '').slice(0, 300);
    const utmUsado = visitas.utmDe(utm || {});
    const canal = visitas.canalDe(refUsado, utmUsado);
    appendJsonl('leads.jsonl', { nome, contato, mensagem, origem: origem || 'site', canal, utm: utmUsado }); // mantém log antigo
    try { upsertContato({ nome, contato, mensagem, origem: origem || 'site', canal }); } // CRM: vira contato (dedupe)
    catch (e) { console.error('[crm] falha ao criar contato do lead:', e.message); }
    res.json({ ok: true });
  });
};
