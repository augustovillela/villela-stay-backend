// =====================================================================
// Closet Club — API pública v1 (`/closet/api/v1/*`).
//
// SOMENTE LEITURA e somente dado que já é público na vitrine. Nenhum
// endpoint devolve e-mail, telefone, CPF, chave Pix, reserva ou mensagem
// — chave vazada não pode virar vazamento de gente.
//
// Autenticação: header `x-api-key` com a chave `cc_...`. A chave é
// mostrada UMA vez na criação; o banco guarda só o sha256 e o prefixo.
// Limite: 120 chamadas por minuto por chave (janela deslizante em memória).
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');
const { Items, Looks, Agenda, Users, OCASIOES, CATEGORIAS, ESTILOS, TAMANHOS, s, n } = repo;

const PREFIXO = 'cc_';
const LIMITE_MIN = Number(process.env.CLOSET_API_RPM) || 120;

const hashDe = (chave) => crypto.createHash('sha256').update(String(chave)).digest('hex');

const Chaves = {
  criar(userId, { nome = '' } = {}) {
    const segredo = crypto.randomBytes(24).toString('base64url');
    const chave = PREFIXO + segredo;
    const id = novoId();
    db.prepare(`INSERT INTO api_keys (id, user_id, nome, prefixo, chave_hash, escopos, ativa, criado_em)
      VALUES (?,?,?,?,?,'["leitura"]',1,?)`)
      .run(id, s(userId, 40), s(nome, 120) || 'Chave sem nome', chave.slice(0, 11), hashDe(chave), nowISO());
    repo.evento(userId, 'api.chave_criada', id, {});
    // única vez que a chave completa existe fora do cliente
    return { id, chave, prefixo: chave.slice(0, 11) };
  },
  listar(userId) {
    return db.prepare('SELECT id, nome, prefixo, ativa, chamadas, ultimo_uso, criado_em FROM api_keys WHERE user_id = ? ORDER BY criado_em DESC')
      .all(s(userId, 40)).map((k) => ({ ...k, ativa: !!k.ativa }));
  },
  revogar(id, userId) {
    const k = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(s(id, 40));
    if (!k) throw new Error('Chave não encontrada.');
    if (userId && k.user_id !== userId) throw new Error('Esta chave não é sua.');
    db.prepare('UPDATE api_keys SET ativa = 0 WHERE id = ?').run(k.id);
    return { ok: true };
  },
  resolver(chave) {
    const c = String(chave || '');
    if (!c.startsWith(PREFIXO)) return null;
    const k = db.prepare('SELECT * FROM api_keys WHERE chave_hash = ? AND ativa = 1').get(hashDe(c));
    if (!k) return null;
    db.prepare('UPDATE api_keys SET chamadas = chamadas + 1, ultimo_uso = ? WHERE id = ?').run(nowISO(), k.id);
    return k;
  },
};

// ---- limite de uso: janela deslizante de 60s por chave ----
const janelas = new Map();
function dentroDoLimite(keyId) {
  const agora = Date.now();
  const arr = (janelas.get(keyId) || []).filter((t) => agora - t < 60000);
  if (arr.length >= LIMITE_MIN) { janelas.set(keyId, arr); return false; }
  arr.push(agora);
  janelas.set(keyId, arr);
  return true;
}

// ---- projeções públicas (o que pode sair) ----
const pecaPublica = (i) => ({
  id: i.id, slug: i.slug, titulo: i.titulo, descricao: i.descricao,
  categoria: i.categoria, subcategoria: i.subcategoria, ocasioes: i.ocasioes,
  cor: i.cor, cores: i.cores, tamanho: i.tamanho, marca: i.marca, estilo: i.estilo,
  estacao: i.estacao, condicao: i.condicao, medidas: i.medidas, modelo: i.modelo,
  preco_diaria_centavos: i.preco_diaria_centavos, preco_3dias_centavos: i.preco_3dias_centavos,
  caucao_centavos: i.caucao_centavos, min_dias: i.min_dias,
  cidade: i.cidade, uf: i.uf, entrega: i.entrega,
  fotos: (i.fotos || []).map((f) => ({ url: f.url, alt: f.alt || '' })),
  nota_media: i.nota_media, num_avaliacoes: i.num_avaliacoes, alugueis: i.alugueis,
  url: `/closet/peca/${i.slug || i.id}`,
  proprietario: { id: i.owner_id, nome: (Users.publico(i.owner_id) || {}).nome || '', verificado: !!(Users.publico(i.owner_id) || {}).verificado },
});

const lookPublico = (l) => ({
  id: l.id, slug: l.slug, titulo: l.titulo, descricao: l.descricao, ocasiao: l.ocasiao, estilo: l.estilo,
  cidade: l.cidade, uf: l.uf, desconto_pct: l.desconto_pct,
  preco_diaria_soma_centavos: l.preco_diaria_soma_centavos, preco_diaria_look_centavos: l.preco_diaria_look_centavos,
  pecas: (l.itens || []).map((i) => ({ id: i.id, titulo: i.titulo, categoria: i.categoria, preco_diaria_centavos: i.preco_diaria_centavos })),
  url: `/closet/look/${l.slug || l.id}`,
});

function registrarApiPublica(app) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ erro: e.message }));

  function exigeChave(req, res, next) {
    const k = Chaves.resolver(req.headers['x-api-key']);
    if (!k) return res.status(401).json({ erro: 'Chave de API inválida ou ausente. Envie o header x-api-key.' });
    if (!dentroDoLimite(k.id)) return res.status(429).json({ erro: `Limite de ${LIMITE_MIN} chamadas por minuto atingido.` });
    req.apiKey = k;
    next();
  }

  app.use('/closet/api/v1', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Closet-Api', 'v1');
    next();
  });

  // documentação aberta (sem chave) — é a porta de entrada de quem vai integrar
  app.get('/closet/api/v1', (req, res) => res.json({
    api: 'Closet Club', versao: '1.0', autenticacao: 'header x-api-key (chave cc_...)',
    limite: `${LIMITE_MIN} chamadas/minuto por chave`,
    aviso: 'Somente leitura de dados públicos da vitrine. Nenhum dado pessoal é exposto.',
    endpoints: [
      { metodo: 'GET', caminho: '/closet/api/v1/catalogo', descricao: 'Ocasiões, categorias, estilos e tamanhos aceitos nos filtros.' },
      { metodo: 'GET', caminho: '/closet/api/v1/pecas', descricao: 'Busca de peças.', filtros: ['q', 'ocasiao', 'categoria', 'cor', 'tamanho', 'marca', 'estilo', 'cidade', 'uf', 'preco_min', 'preco_max', 'de', 'ate', 'ordem', 'limite', 'offset'] },
      { metodo: 'GET', caminho: '/closet/api/v1/pecas/:id', descricao: 'Ficha completa de uma peça (id ou slug).' },
      { metodo: 'GET', caminho: '/closet/api/v1/pecas/:id/disponibilidade', descricao: 'Dias ocupados e checagem de um período (de, ate).' },
      { metodo: 'GET', caminho: '/closet/api/v1/looks', descricao: 'Looks completos publicados.' },
      { metodo: 'GET', caminho: '/closet/api/v1/looks/:id', descricao: 'Um look e suas peças.' },
    ],
  }));

  app.get('/closet/api/v1/catalogo', exigeChave, h((req, res) => res.json({
    ocasioes: OCASIOES, categorias: CATEGORIAS, estilos: ESTILOS, tamanhos: TAMANHOS,
  })));

  app.get('/closet/api/v1/pecas', exigeChave, h((req, res) => {
    const r = Items.buscar({ ...(req.query || {}), limite: Math.min(n(req.query.limite, 24), 60) });
    res.json({ total_na_pagina: r.itens.length, limite: r.limite, offset: r.offset, pecas: r.itens.map(pecaPublica) });
  }));

  app.get('/closet/api/v1/pecas/:id', exigeChave, h((req, res) => {
    const i = Items.obter(req.params.id);
    if (!i || i.status !== 'ativo' || i.moderacao !== 'aprovado') return res.status(404).json({ erro: 'Peça não encontrada.' });
    res.json({ peca: pecaPublica(i) });
  }));

  app.get('/closet/api/v1/pecas/:id/disponibilidade', exigeChave, h((req, res) => {
    const i = Items.obter(req.params.id);
    if (!i || i.status !== 'ativo' || i.moderacao !== 'aprovado') return res.status(404).json({ erro: 'Peça não encontrada.' });
    const { de, ate } = req.query || {};
    res.json({
      calendario: Agenda.calendario(i.id, s(de, 10) || undefined, s(ate, 10) || undefined),
      ...(de && ate ? { periodo: Agenda.disponivel(i.id, s(de, 10), s(ate, 10)) } : {}),
    });
  }));

  app.get('/closet/api/v1/looks', exigeChave, h((req, res) => {
    res.json({ looks: Looks.buscar({ ...(req.query || {}), limite: Math.min(n(req.query.limite, 24), 60) }).map(lookPublico) });
  }));

  app.get('/closet/api/v1/looks/:id', exigeChave, h((req, res) => {
    const l = Looks.obter(req.params.id);
    if (!l || l.status !== 'ativo' || l.moderacao !== 'aprovado') return res.status(404).json({ erro: 'Look não encontrado.' });
    res.json({ look: lookPublico(l) });
  }));
}

module.exports = { Chaves, registrarApiPublica, pecaPublica, lookPublico, PREFIXO, LIMITE_MIN };
