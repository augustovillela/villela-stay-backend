// =====================================================================
// Núcleo · Analytics próprio (page views) + captura de leads do site.
// Extraído do server.js (Projeto 2 — modularização). Montado por
// montar(app, deps), o mesmo padrão dos módulos SaaS.
// deps: { DATA_DIR, tokensIguais, limiteTaxa, appendJsonl, upsertContato }
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

module.exports.montar = function montar(app, deps) {
  const { DATA_DIR, tokensIguais, limiteTaxa, appendJsonl, upsertContato } = deps;
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

  // Analytics próprio: registra page views (GET sem preflight de CORS; sem cookies — LGPD ok)
  app.get('/api/hit', (req, res) => {
    if (!limiteTaxa('hit:' + req.ip, 120, 60000)) return res.sendStatus(429); // analytics: generoso, só barra abuso
    const { p, r } = req.query;
    if (p) appendJsonl('hits.jsonl', { pagina: String(p).slice(0, 200), origemRef: String(r || '').slice(0, 300), ua: String(req.headers['user-agent'] || '').slice(0, 200) });
    res.sendStatus(204);
  });

  // Resumo de visitas (protegido): páginas mais vistas e visitas por dia
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

  // Captura de leads do site (formulário de orçamento / chat)
  app.post('/api/leads', (req, res) => {
    if (!limiteTaxa('lead:' + req.ip, 10, 60000)) return res.status(429).json({ erro: 'muitas tentativas, tente novamente em instantes' });
    const { nome, contato, mensagem, origem } = req.body || {};
    if (!nome || !contato) return res.status(400).json({ erro: 'nome e contato são obrigatórios' });
    appendJsonl('leads.jsonl', { nome, contato, mensagem, origem: origem || 'site' }); // mantém log antigo
    try { upsertContato({ nome, contato, mensagem, origem: origem || 'site' }); } // CRM: vira contato (dedupe)
    catch (e) { console.error('[crm] falha ao criar contato do lead:', e.message); }
    res.json({ ok: true });
  });
};
