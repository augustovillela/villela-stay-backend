// =====================================================================
// Villela Alta Vista 360 — API pública (sem sessão).
// Só duas superfícies: catálogo (leitura) e pedido de orçamento (escrita,
// com honeypot + rate limit por IP — spam não vira lead nem alerta).
// =====================================================================
'use strict';
const repo = require('./repo');
const { recomendar } = require('./recomendador');
const { Servicos, Combos, Leads, Propostas, s } = repo;

// rate limit em memória: N pedidos por IP na janela (mesma política dos irmãos)
const _janela = new Map();
const LIMITE = 5;
const JANELA_MS = 15 * 60 * 1000;
function estourou(ip) {
  const agora = Date.now();
  const arr = (_janela.get(ip) || []).filter((t) => agora - t < JANELA_MS);
  if (arr.length >= LIMITE) { _janela.set(ip, arr); return true; }
  arr.push(agora); _janela.set(ip, arr);
  return false;
}
const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function registrarRotasPublicas(app, { notificar = async () => {} } = {}) {
  app.use('/alta-vista/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // catálogo público (alimenta o recomendador da Onda 2 e integrações futuras)
  app.get('/alta-vista/api/catalogo', (req, res) => {
    res.json({
      servicos: Servicos.listar().map((sv) => ({
        slug: sv.slug, nome: sv.nome, categoria: sv.categoria, resumo: sv.resumo, entrega: sv.entrega,
        preco_centavos: sv.preco_centavos, preco_apartir: !!sv.preco_apartir, unidade: sv.unidade,
        prazo: sv.prazo, revisoes: sv.revisoes,
      })),
      combos: Combos.listar().map((c) => ({
        slug: c.slug, nome: c.nome, resumo: c.resumo, itens: c.itens,
        preco_centavos: c.preco_centavos, preco_apartir: !!c.preco_apartir, destaque: !!c.destaque,
      })),
    });
  });

  // pedido de orçamento
  app.post('/alta-vista/api/orcamento', async (req, res) => {
    const d = req.body || {};
    // honeypot: campo invisível preenchido = robô. Responde ok e descarta,
    // para o robô não aprender o que funciona.
    if (s(d.website, 200)) return res.json({ ok: true });
    const ip = ipDe(req);
    if (estourou(ip)) return res.status(429).json({ erro: 'Muitos pedidos em sequência. Aguarde alguns minutos e tente de novo.' });
    try {
      const lead = Leads.criar(d);
      if (!lead.duplicado) {
        const canais = [lead.whatsapp && 'WhatsApp ' + lead.whatsapp, lead.email].filter(Boolean).join(' · ');
        notificar(`📐 Alta Vista 360 — novo pedido de orçamento\n${lead.nome} (${canais})\n` +
          `${[lead.tipo_imovel, lead.finalidade, lead.cidade].filter(Boolean).join(' · ') || 'sem detalhes do imóvel'}` +
          (lead.mensagem ? `\n"${lead.mensagem.slice(0, 300)}"` : '')).catch(() => {});
      }
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });

  // recomendador (Onda 2): calcula TUDO no servidor e cria o lead com as
  // respostas, a recomendação e a pontuação. Mesmas defesas do orçamento.
  app.post('/alta-vista/api/recomendar', async (req, res) => {
    const d = req.body || {};
    if (s(d.website, 200)) return res.json({ ok: true, recomendacao: null }); // honeypot
    const ip = ipDe(req);
    if (estourou(ip)) return res.status(429).json({ erro: 'Muitos pedidos em sequência. Aguarde alguns minutos e tente de novo.' });
    try {
      const rec = recomendar(d);
      const lead = Leads.criar({
        nome: d.nome, email: d.email, whatsapp: d.whatsapp, cidade: d.cidade,
        tipo_imovel: d.tipo_imovel, finalidade: d.finalidade,
        interesses: [rec.pacote.slug, ...(Array.isArray(d.interesses) ? d.interesses : [])],
        mensagem: s(d.mensagem, 2000), origem: s(d.origem, 200) || '/alta-vista/recomendar-pacote',
        utm: d.utm, consentimento: d.consentimento,
        respostas: {
          tipo_imovel: s(d.tipo_imovel, 80), finalidade: s(d.finalidade, 80), cidade: s(d.cidade, 120),
          area_m2: s(d.area_m2, 20), ambientes: s(d.ambientes, 10), fotos_qtd: s(d.fotos_qtd, 10),
          canais: Array.isArray(d.canais) ? d.canais.map((x) => s(x, 40)).slice(0, 10) : [],
          prazo: s(d.prazo, 60), interesses: Array.isArray(d.interesses) ? d.interesses.map((x) => s(x, 80)).slice(0, 12) : [],
        },
        recomendacao: rec, pontuacao: rec.pontuacao,
      });
      if (!lead.duplicado) {
        notificar(`📐 Alta Vista 360 — recomendador concluído\n${lead.nome} (${[lead.whatsapp, lead.email].filter(Boolean).join(' · ')})\n` +
          `Recomendado: ${rec.pacote.nome} · estimado R$ ${(rec.preco_estimado_centavos / 100).toLocaleString('pt-BR')}` +
          `${rec.analise_manual ? ' · ⚠️ análise manual' : ''} · pontuação ${rec.pontuacao}/10`).catch(() => {});
      }
      res.json({ ok: true, recomendacao: rec });
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });

  // aceite formal da proposta (página pública renderiza; o aceite entra aqui)
  app.post('/alta-vista/api/proposta/:token/aceitar', async (req, res) => {
    const ip = ipDe(req);
    if (estourou(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    try {
      const p = Propostas.aceitar(req.params.token, { nome: (req.body || {}).nome, ip });
      notificar(`✅ Alta Vista 360 — proposta ACEITA por ${p.aceite.nome}: R$ ${(p.total_centavos / 100).toLocaleString('pt-BR')} (${p.itens.map((i) => i.nome).join(' + ')})`).catch(() => {});
      res.json({ ok: true, status: p.status, aceite_em: p.aceite.em });
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });
}

module.exports = { registrarRotasPublicas, _janela };
