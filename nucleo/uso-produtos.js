// =====================================================================
// USO DOS PRODUTOS — quem entra e quanto tempo passa, por produto do
// grupo (CRM/Growth, Gestão, Finance, Closet, Vitrine, Kids, Alta Vista,
// Docs, Projetos, Jurídico SaaS). Academy e Musique têm o seu próprio
// (academy/relatorio-visitas-alunos.js, music/relatorio-visitas-alunos.js).
//
// COMO FUNCIONA, sem mexer em nenhum produto
//   • Todo produto emite uma sessão JWT `{ uid }` num cookie com
//     `path=/<prefixo>`. Este módulo lê esse cookie (assinatura conferida)
//     e sabe QUEM está logado em QUAL produto: o cookie só viaja para o
//     prefixo do próprio produto, então não há mistura entre produtos.
//   • Um script de ~1 KB (/uso-produto.js) é injetado nas páginas HTML
//     desses prefixos e manda um PULSO a cada 30 s, com a aba visível e a
//     pessoa mexendo. Quanto somar decide o SERVIDOR: intervalo real até
//     60 s, senão 30 s; rajada < 5 s ignorada; um relógio por pessoa.
//   • As visitas (nucleo/visitas.js) ganham `pprod`/`pid` para quem estava
//     logado. Visitante sem conta segue anônimo.
//
// O QUE GUARDA: produto, pessoa, ÁREA (um trecho do endereço), dia e
// segundos. NUNCA o que a pessoa fez, escreveu ou viu dentro do produto.
//
// Kids: a conta é SEMPRE do responsável (LGPD art. 14). Aqui se mede o
// uso da conta do responsável como um todo — não há perfil de criança.
//
// ⚠️ Relatório NOMINAL: só admin, e o CSV fica na auditoria do staff.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');

const PULSO_SEG = 30;
const PULSO_JANELA_SEG = 60;
const RAJADA_SEG = 5;
const MAX_AREAS_POR_DIA = 40;     // freio contra área inventada pelo cliente

const hoje = () => new Date().toISOString().slice(0, 10);
const recuar = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const periodo = (dias) => { const n = Math.min(Math.max(parseInt(dias, 10) || 30, 1), 365); const ate = hoje(); return { de: recuar(ate, n - 1), ate, dias: n }; };

// Nome e e-mail da pessoa a partir do banco do próprio produto. Qualquer
// falha vira null (pessoa desconhecida), nunca uma exceção na rota.
function leitor(carregarDb, sql) {
  return (id) => {
    try {
      const db = carregarDb();
      const r = db.prepare(sql).get(String(id));
      if (!r) return null;
      if (r.ativo === 0 || ['suspenso', 'inativo', 'bloqueado', 'excluido'].includes(String(r.status || ''))) return null;
      return { id: String(r.id), nome: r.nome || r.name || '', email: r.email || '' };
    } catch (_) { return null; }
  };
}

const PRODUTOS = [
  { id: 'crm',      nome: 'Villela CRM / Growth OS', emoji: '🤝', prefixo: '/crm',        cookie: 'crm_sess',     pessoa: leitor(() => require('../crm/db').db,          'SELECT * FROM tenant_users WHERE id = ?') },
  { id: 'gestao',   nome: 'Stay Manager',            emoji: '🏨', prefixo: '/gestao',     cookie: 'vsm_sess',     pessoa: leitor(() => require('../vsm/db').db,          'SELECT * FROM tenant_users WHERE id = ?') },
  { id: 'finance',  nome: 'Villela Finance',         emoji: '💰', prefixo: '/finance',    cookie: 'fin_sess',     pessoa: leitor(() => require('../financeiro/db').db,   'SELECT * FROM tenant_users WHERE id = ?') },
  { id: 'closet',   nome: 'Closet Club',             emoji: '👗', prefixo: '/closet',     cookie: 'closet_sess',  pessoa: leitor(() => require('../closet/db').db,       'SELECT * FROM users WHERE id = ?') },
  { id: 'vitrine',  nome: 'Vitrine',                 emoji: '🛒', prefixo: '/vitrine',    cookie: 'vitrine_sess', pessoa: leitor(() => require('../vitrine/db').db,      'SELECT * FROM users WHERE id = ?') },
  { id: 'kids',     nome: 'Villela Kids / Invente',  emoji: '🧒', prefixo: '/kids',       cookie: 'kids_sess',    pessoa: leitor(() => require('../kids/db').db,         'SELECT * FROM users WHERE id = ?'), tiposSessao: [undefined, 'sessao'] },
  { id: 'altavista', nome: 'Alta Vista 360',         emoji: '🚁', prefixo: '/alta-vista', cookie: 'av_sess',      pessoa: leitor(() => require('../alta-vista/db').db,   'SELECT * FROM clientes WHERE id = ?') },
  { id: 'docs',     nome: 'Docs Intelligence',       emoji: '📄', prefixo: '/vdocs',      cookie: 'vdocs_sess',   pessoa: leitor(() => require('../vdocs/db').db,        'SELECT * FROM users WHERE id = ?') },
  { id: 'projetos', nome: 'Projects & Events',       emoji: '📋', prefixo: '/vpe',        cookie: 'vpe_sess',     pessoa: leitor(() => require('../vpe/db').db,          'SELECT * FROM users WHERE id = ?') },
  { id: 'juridico', nome: 'Legal SaaS (assinantes)', emoji: '⚖️', prefixo: '/juridico',   cookie: 'jur_saas',     pessoa: leitor(() => require('../legal-saas/db').db,   'SELECT * FROM tenant_users WHERE id = ?') },
];

function criarArmazem(DATA_DIR) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, 'uso-produtos.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 4000;');
  db.exec(`CREATE TABLE IF NOT EXISTS uso_tempo (
    produto TEXT NOT NULL, usuario TEXT NOT NULL, area TEXT NOT NULL, dia TEXT NOT NULL,
    segundos INTEGER NOT NULL DEFAULT 0, pulsos INTEGER NOT NULL DEFAULT 0, ultimo_pulso TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (produto, usuario, area, dia));
    CREATE INDEX IF NOT EXISTS ix_uso_tempo_dia ON uso_tempo(dia);`);

  return {
    db,
    pulso(produto, usuario, area, agora = new Date()) {
      const ult = db.prepare('SELECT MAX(ultimo_pulso) AS u FROM uso_tempo WHERE produto = ? AND usuario = ?').get(produto, usuario).u;
      const gap = ult ? (agora.getTime() - Date.parse(ult)) / 1000 : Infinity;
      if (gap < RAJADA_SEG) return { ok: true, somado: 0 };
      const somar = Math.round(gap <= PULSO_JANELA_SEG ? gap : PULSO_SEG);
      const dia = agora.toISOString().slice(0, 10);
      const a = areaLimpa(area);
      const existe = db.prepare('SELECT 1 FROM uso_tempo WHERE produto = ? AND usuario = ? AND area = ? AND dia = ?').get(produto, usuario, a, dia);
      let areaFinal = a;
      if (!existe) {
        const n = db.prepare('SELECT COUNT(DISTINCT area) AS n FROM uso_tempo WHERE produto = ? AND usuario = ? AND dia = ?').get(produto, usuario, dia).n;
        if (n >= MAX_AREAS_POR_DIA) areaFinal = 'outras';
      }
      db.prepare(`INSERT INTO uso_tempo (produto, usuario, area, dia, segundos, pulsos, ultimo_pulso) VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(produto, usuario, area, dia) DO UPDATE SET segundos = segundos + excluded.segundos, pulsos = pulsos + 1, ultimo_pulso = excluded.ultimo_pulso`)
        .run(produto, usuario, areaFinal, dia, somar, agora.toISOString());
      return { ok: true, somado: somar };
    },
    porUsuarioArea(produto, de, ate) {
      return db.prepare(`SELECT usuario, area, SUM(segundos) AS segundos, COUNT(DISTINCT dia) AS dias, MAX(ultimo_pulso) AS ultimo
        FROM uso_tempo WHERE produto = ? AND dia >= ? AND dia <= ? GROUP BY usuario, area`).all(produto, de, ate);
    },
    porDia(produto, usuario, de, ate) {
      return db.prepare('SELECT dia, area, segundos FROM uso_tempo WHERE produto = ? AND usuario = ? AND dia >= ? AND dia <= ? ORDER BY dia, area').all(produto, usuario, de, ate);
    },
    totais(de, ate) {
      return db.prepare('SELECT produto, COUNT(DISTINCT usuario) AS pessoas, SUM(segundos) AS segundos FROM uso_tempo WHERE dia >= ? AND dia <= ? GROUP BY produto').all(de, ate);
    },
    excluirDe(produto, usuario) { return db.prepare('DELETE FROM uso_tempo WHERE produto = ? AND usuario = ?').run(produto, usuario).changes; },
  };
}

/** Área = rótulo curto vindo do endereço; só [a-z0-9-], até 24 caracteres. */
function areaLimpa(a) {
  const s = String(a == null ? '' : a).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  return s || 'app';
}

/** Quem está logado em `produto` neste pedido (assinatura conferida) ou ''. */
function quemEstaLogado(produto, req, jwtSecret) {
  try {
    const bruto = req.cookies && req.cookies[produto.cookie];
    if (!bruto) return '';
    const d = jwt.verify(bruto, jwtSecret);
    const tipos = produto.tiposSessao || [undefined];
    if (d.tipo !== undefined && !tipos.includes(d.tipo)) return '';   // link de senha/2FA colado no cookie não vale
    const uid = String(d.uid || '');
    return /^[A-Za-z0-9_-]{1,64}$/.test(uid) ? uid : '';
  } catch (_) { return ''; }
}

const produtoDoCaminho = (produtos, caminho) => produtos.find((p) => caminho === p.prefixo || caminho.startsWith(p.prefixo + '/')) || null;

const TAG = '<script src="/uso-produto.js" defer></script>';

/**
 * Monta tudo. deps: { DATA_DIR, jwtSecret (valor ou função), requireAuth,
 * requireAdmin, auditar(req, acao, detalhe), visitasDir, produtos? }.
 * Deve ser montado ANTES das rotas dos produtos.
 */
function montar(app, deps) {
  const produtos = deps.produtos || PRODUTOS;
  const segredo = () => (typeof deps.jwtSecret === 'function' ? deps.jwtSecret() : deps.jwtSecret);
  const armazem = criarArmazem(path.join(deps.DATA_DIR, 'uso-produtos'));
  const visitas = require('./visitas');

  // 1) identifica quem está logado em cada pedido ao prefixo de um produto e
  //    injeta o pulso nas páginas HTML (res.send de string).
  app.use((req, res, next) => {
    const caminho = req.path || '/';
    const p = produtoDoCaminho(produtos, caminho);
    if (!p) return next();
    const uid = quemEstaLogado(p, req, segredo());
    if (uid) req.usoProduto = { produto: p.id, uid };
    if (req.method === 'GET' && !/\.[a-z0-9]{1,5}$/i.test(caminho) && !caminho.includes('/api/')) {
      const enviar = res.send.bind(res);
      res.send = function (corpo) {
        try {
          // res.send(string) sem tipo definido vira text/html DENTRO do send (CRM, Gestão, Jurídico, Vitrine fazem assim).
          const tipo = String(res.getHeader('content-type') || '') || 'text/html';
          if (typeof corpo === 'string' && res.statusCode === 200 && /text\/html/i.test(tipo) && !corpo.includes('/uso-produto.js')) {
            const i = corpo.lastIndexOf('</body>');
            if (i >= 0) corpo = corpo.slice(0, i) + TAG + corpo.slice(i);
          }
        } catch (_) { /* a medição nunca atrapalha a página */ }
        return enviar(corpo);
      };
    }
    next();
  });

  // 2) o pulso, um por prefixo (o cookie só viaja para o prefixo do produto)
  for (const p of produtos) {
    app.post(`${p.prefixo}/api/uso/pulso`, (req, res) => {
      const uid = quemEstaLogado(p, req, segredo());
      if (!uid) return res.status(401).json({ erro: 'sem sessão' });
      if (!p.pessoa(uid)) return res.status(403).json({ erro: 'conta inativa' });
      res.json(armazem.pulso(p.id, uid, (req.body || {}).area));
    });
  }

  // 3) o script do cliente
  app.get('/uso-produto.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8').set('Cache-Control', 'no-cache')
      .sendFile(path.join(__dirname, 'uso-produto-cliente.js'));
  });

  // 4) relatório do staff — NOMINAL, só admin
  const ADM = [deps.requireAuth, deps.requireAdmin];
  const achar = (id) => produtos.find((x) => x.id === id) || null;
  const nomeDe = (p, id) => p.pessoa(id) || { id, nome: '', email: '' };

  function relatorio(p, dias) {
    const per = periodo(dias);
    const vis = visitas.visitasPorCampo(deps.DATA_DIR, per.de, per.ate, 'pid', (h) => h.pprod === p.id);
    const usos = armazem.porUsuarioArea(p.id, per.de, per.ate);
    const pessoas = {};
    const pegar = (id) => pessoas[id] || (pessoas[id] = { ...nomeDe(p, id), visitas: { paginas: 0, sessoes: 0, dias: 0 }, areas: [], tempo_total_seg: 0, ultima_atividade: '' });
    for (const [id, v] of Object.entries(vis)) { const a = pegar(id); a.visitas = { paginas: v.paginas, sessoes: v.sessoes, dias: v.dias }; a.ultima_atividade = v.ultima || a.ultima_atividade; }
    for (const u of usos) { const a = pegar(u.usuario); a.areas.push({ area: u.area, segundos: u.segundos || 0, dias: u.dias || 0 }); a.tempo_total_seg += u.segundos || 0; if ((u.ultimo || '') > a.ultima_atividade) a.ultima_atividade = u.ultimo; }
    const lista = Object.values(pessoas);
    lista.forEach((a) => a.areas.sort((x, y) => y.segundos - x.segundos));
    lista.sort((x, y) => (y.tempo_total_seg - x.tempo_total_seg) || (y.visitas.paginas - x.visitas.paginas));
    const porArea = {};
    lista.forEach((a) => a.areas.forEach((x) => { porArea[x.area] = (porArea[x.area] || 0) + x.segundos; }));
    return {
      produto: { id: p.id, nome: p.nome, emoji: p.emoji, prefixo: p.prefixo }, periodo: per,
      resumo: { pessoas: lista.length, pessoas_usando: lista.filter((a) => a.tempo_total_seg > 0).length, tempo_total_seg: lista.reduce((s, a) => s + a.tempo_total_seg, 0), sessoes: lista.reduce((s, a) => s + a.visitas.sessoes, 0),
        por_area: Object.entries(porArea).map(([area, segundos]) => ({ area, segundos })).sort((x, y) => y.segundos - x.segundos) },
      pessoas: lista, desde: '2026-11-08',
    };
  }
  const hms = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`; };
  const cel = (v) => { let t = String(v == null ? '' : v); if (/^[=+\-@]/.test(t)) t = "'" + t; return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  function csv(rel) {
    const linhas = [['Pessoa', 'E-mail', 'Sessões', 'Última atividade', 'Área', 'Tempo na área (min)', 'Tempo na área', 'Tempo total (min)'].join(';')];
    for (const a of rel.pessoas) {
      const total = Math.round(a.tempo_total_seg / 60);
      for (const x of (a.areas.length ? a.areas : [null])) {
        linhas.push([a.nome, a.email, a.visitas.sessoes, a.ultima_atividade].concat(x ? [x.area, Math.round(x.segundos / 60), hms(x.segundos), total] : ['', '', '', total]).map(cel).join(';'));
      }
    }
    return '﻿' + linhas.join('\r\n') + '\r\n';
  }

  app.get('/staff/api/uso-produtos', ...ADM, (req, res) => {
    const per = periodo(req.query.dias);
    const tot = Object.fromEntries(armazem.totais(per.de, per.ate).map((t) => [t.produto, t]));
    res.set('Cache-Control', 'no-store').json({ periodo: per, desde: '2026-11-08', produtos: produtos.map((p) => ({ id: p.id, nome: p.nome, emoji: p.emoji, prefixo: p.prefixo, pessoas: (tot[p.id] || {}).pessoas || 0, segundos: (tot[p.id] || {}).segundos || 0 })) });
  });
  app.get('/staff/api/uso-produtos/:produto.csv', ...ADM, (req, res) => {
    const p = achar(req.params.produto); if (!p) return res.status(404).json({ erro: 'Produto não medido.' });
    const rel = relatorio(p, req.query.dias);
    if (typeof deps.auditar === 'function') deps.auditar(req, 'relatorio.uso-produto.csv', `${p.id}: ${rel.pessoas.length} pessoas, ${rel.periodo.dias} dias`);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="uso-${p.id}-${rel.periodo.ate}.csv"` }).send(csv(rel));
  });
  app.get('/staff/api/uso-produtos/:produto/:id', ...ADM, (req, res) => {
    const p = achar(req.params.produto); if (!p) return res.status(404).json({ erro: 'Produto não medido.' });
    const per = periodo(req.query.dias);
    const pessoa = p.pessoa(req.params.id); if (!pessoa) return res.status(404).json({ erro: 'Pessoa não encontrada.' });
    res.set('Cache-Control', 'no-store').json({ periodo: per, pessoa, dias_de_uso: armazem.porDia(p.id, pessoa.id, per.de, per.ate) });
  });
  app.get('/staff/api/uso-produtos/:produto', ...ADM, (req, res) => {
    const p = achar(req.params.produto); if (!p) return res.status(404).json({ erro: 'Produto não medido.' });
    res.set('Cache-Control', 'no-store').json(relatorio(p, req.query.dias));
  });

  return { armazem, produtos, relatorio, csv };
}

module.exports = { montar, criarArmazem, quemEstaLogado, produtoDoCaminho, areaLimpa, PRODUTOS, PULSO_SEG };
