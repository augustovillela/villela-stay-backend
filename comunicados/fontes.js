// =====================================================================
// Comunicados — FONTES: de onde sai o público de cada sistema do grupo.
//
// A central não copia a base de ninguém. Cada fonte sabe, lendo o banco
// do PRÓPRIO produto na hora do envio:
//   • segmentos  — os públicos que fazem sentido naquele produto;
//   • listar(s)  — [{ ref, nome, email, telefone, marketing }]
//   • sessao(req)— o id do usuário logado no app do produto (ou null);
//   • nativo     — quando o produto JÁ tem central de avisos (Academy,
//                  Closet, Vitrine, Kids), o comunicado entra nela, com o
//                  push que ela já dispara. Um segundo sino na mesma tela
//                  seria pior do que nenhum.
//
// Regras que valem para todas:
//   • Só conta ATIVA recebe. Conta excluída/anonimizada (LGPD) e conta de
//     demonstração (@*.local) nunca entram.
//   • `marketing: false` (a pessoa DESMARCOU no cadastro) tira a pessoa
//     de novidades e dicas por e-mail/WhatsApp. Ausente = não perguntado.
//   • Telefone de SaaS multiempresa mora na EMPRESA (tenants.telefone), não
//     no usuário — por isso só o dono da conta recebe WhatsApp ali.
//   • Kids: o destinatário é SEMPRE o responsável. Criança nunca.
//
// Os requires dos produtos são TARDIOS (dentro das funções): a central
// sobe antes dos módulos, e produto que falhar ao carregar derruba só a
// própria linha da prévia, não a central.
// =====================================================================
'use strict';
const jwt = require('jsonwebtoken');

let _jwtSecret = null;
function configurar({ jwtSecret } = {}) { if (jwtSecret) _jwtSecret = jwtSecret; }

const dbDe = (mod) => require(`../${mod}/db`).db;
// Lê o JWT de um cookie de produto. Só identidade — quem decide se a
// conta está ativa é a consulta de cada fonte.
function uidDoCookie(req, cookie) {
  const bruto = req.cookies && req.cookies[cookie];
  if (!bruto || !_jwtSecret) return null;
  try { return jwt.verify(bruto, _jwtSecret); } catch (_) { return null; }
}
const mkt = (v) => (v === 0 || v === false || v === '0') ? false : (v === 1 || v === true || v === '1') ? true : null;
const linhas = (rows) => rows.map((r) => ({ ref: String(r.ref), nome: r.nome || '', email: r.email || '', telefone: r.telefone || '', marketing: mkt(r.marketing) }));

// ---------------- Academy (conta compartilhada com a Musique) ----------------
let _verificadorAcademy = null;
function sessaoAcademy(req) {
  if (!_verificadorAcademy) {
    const repo = require('../academy/repo');
    _verificadorAcademy = require('../nucleo/sessao-academy').criarVerificador({
      jwtSecret: _jwtSecret, buscarUsuario: (id) => repo.Usuarios.porId(id), sessaoValida: (jti) => repo.Sessoes.valida(jti),
    });
  }
  const s = _verificadorAcademy.resolver(req);
  return s ? s.usuario.id : null;
}
const ACADEMY_BASE = `SELECT u.id ref, u.nome, u.email, u.telefone, json_extract(u.consentimentos, '$.marketing') marketing
  FROM users u WHERE u.status = 'ativo'`;
function usuariosAcademyPorIds(ids) {
  const db = dbDe('academy'), out = [];
  for (let i = 0; i < ids.length; i += 400) {
    const lote = ids.slice(i, i + 400);
    out.push(...db.prepare(`${ACADEMY_BASE} AND u.id IN (${lote.map(() => '?').join(',')})`).all(...lote));
  }
  return linhas(out);
}

// ---------------- SaaS multiempresa (mesmo desenho: VSM, Legal, CRM) ----------------
// tenant_users (id, nome, email, papel, ativo) + tenants (status, telefone).
function saasSimples({ mod, papelDono, statusVivos }) {
  const vivos = statusVivos.map((x) => `'${x}'`).join(',');
  const base = (cond) => `SELECT u.id ref, u.nome, u.email,
      CASE WHEN u.papel = '${papelDono}' THEN t.telefone ELSE '' END telefone, NULL marketing
    FROM tenant_users u JOIN tenants t ON t.id = u.tenant_id WHERE u.ativo = 1 AND ${cond}`;
  const q = {
    todos: base(`t.status IN (${vivos})`),
    donos: base(`t.status IN (${vivos}) AND u.papel = '${papelDono}'`),
    equipe: base(`t.status IN (${vivos}) AND u.papel <> '${papelDono}'`),
    ativos: base(`t.status = 'ativa'`),
    trial: base(`t.status = 'trial'`),
    inadimplentes: base(`t.status IN ('inadimplente','suspensa')`),
    cancelados: base(`t.status = 'cancelada'`),
  };
  return (seg) => linhas(dbDe(mod).prepare(q[seg] || q.todos).all());
}
const SEG_SAAS = [
  { id: 'todos', rotulo: 'Todos os usuários com acesso' },
  { id: 'donos', rotulo: 'Só os donos das contas' },
  { id: 'equipe', rotulo: 'Só os membros da equipe' },
  { id: 'ativos', rotulo: 'Assinantes pagantes (conta ativa)' },
  { id: 'trial', rotulo: 'Em período de teste' },
  { id: 'inadimplentes', rotulo: 'Inadimplentes / suspensos' },
  { id: 'cancelados', rotulo: 'Ex-assinantes (cancelados)' },
];
function sessaoTenantUsers(mod, cookie) {
  return (req) => {
    const d = uidDoCookie(req, cookie);
    if (!d || !d.uid) return null;
    const r = dbDe(mod).prepare('SELECT id FROM tenant_users WHERE id = ? AND ativo = 1').get(String(d.uid));
    return r ? r.id : null;
  };
}

// ---------------- SaaS com identidade global (VDocs, VPE) ----------------
// users (ativo) N:N tenants via tenant_users (status, papel).
function saasGlobal({ mod, papelDono }) {
  const base = (cond) => `SELECT u.id ref, u.nome, u.email,
      MAX(CASE WHEN tu.papel = '${papelDono}' THEN t.telefone ELSE '' END) telefone, NULL marketing
    FROM users u JOIN tenant_users tu ON tu.user_id = u.id AND tu.status = 'ativo'
    JOIN tenants t ON t.id = tu.tenant_id WHERE u.ativo = 1 AND ${cond} GROUP BY u.id`;
  const vivos = `t.status IN ('trial','ativa','cortesia')`;
  const q = {
    todos: base(vivos),
    donos: base(`${vivos} AND tu.papel = '${papelDono}'`),
    equipe: base(`${vivos} AND tu.papel <> '${papelDono}'`),
    ativos: base(`t.status = 'ativa'`),
    trial: base(`t.status = 'trial'`),
    inadimplentes: base(`t.status = 'suspensa'`),
    cancelados: base(`t.status = 'cancelada'`),
  };
  return (seg) => linhas(dbDe(mod).prepare(q[seg] || q.todos).all());
}
function sessaoGlobal(mod, cookie) {
  return (req) => {
    const d = uidDoCookie(req, cookie);
    if (!d || !d.uid) return null;
    const r = dbDe(mod).prepare(`SELECT u.id FROM users u JOIN tenant_users tu ON tu.user_id = u.id
      WHERE u.id = ? AND u.ativo = 1 AND tu.status = 'ativo' ${d.tid ? 'AND tu.tenant_id = ?' : ''}`).get(...[String(d.uid)].concat(d.tid ? [String(d.tid)] : []));
    return r ? r.id : null;
  };
}

// ---------------- marketplaces com conta própria (Closet, Vitrine, Kids, Alta Vista) ----------------
function sessaoUsers(mod, cookie, tabela = 'users', extra = null) {
  return (req) => {
    const d = uidDoCookie(req, cookie);
    if (!d || !d.uid) return null;
    if (extra && !extra(d)) return null;
    const r = dbDe(mod).prepare(`SELECT * FROM ${tabela} WHERE id = ? AND status = 'ativo'`).get(String(d.uid));
    if (!r) return null;
    if (mod === 'kids' && Number(d.v || 0) !== Number(r.sessao_versao || 0)) return null;
    return r.id;
  };
}
const notificarNativo = (mod) => (ref, c) => {
  const url = c.link_url || '';
  require(`../${mod}/repo`).Notificacoes.criar(ref, { titulo: c.titulo, texto: c.corpo.slice(0, 600), url, tipo: 'comunicado' });
  if (mod === 'closet') {
    require('../closet/push').notificarUsuario(ref, { title: c.titulo, body: c.corpo.slice(0, 180), url: '/closet/app', tag: 'comunicado' }).catch(() => {});
  }
};

// ---------------- catálogo ----------------
const FONTES = [
  {
    chave: 'academy', nome: 'Villela Academy', emoji: '🎓', cor: '#1B2A4A',
    url: 'https://academia.villelastay.com.br/academy/app', caminhoApp: '/academy',
    segmentos: [
      { id: 'todos', rotulo: 'Todos os usuários' },
      { id: 'alunos', rotulo: 'Alunos (com curso liberado)' },
      { id: 'compradores', rotulo: 'Quem já comprou' },
      { id: 'assinantes', rotulo: 'Assinantes de clube (ativos)' },
      { id: 'produtores', rotulo: 'Produtores aprovados' },
      { id: 'afiliados', rotulo: 'Afiliados aprovados' },
    ],
    listar(seg) {
      const q = {
        todos: ACADEMY_BASE,
        alunos: `${ACADEMY_BASE} AND EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.status = 'ativa')`,
        compradores: `${ACADEMY_BASE} AND EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'paga')`,
        assinantes: `${ACADEMY_BASE} AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'ativa')`,
        produtores: `${ACADEMY_BASE} AND EXISTS (SELECT 1 FROM producer_profiles p WHERE p.user_id = u.id AND p.status = 'aprovado')`,
        afiliados: `${ACADEMY_BASE} AND EXISTS (SELECT 1 FROM affiliate_profiles p WHERE p.user_id = u.id AND p.status = 'aprovado')`,
      };
      return linhas(dbDe('academy').prepare(q[seg] || q.todos).all());
    },
    sessao: sessaoAcademy,
    // O sino da Academy já existe (e espelha em push): o comunicado entra nele.
    nativo: (ref, c) => require('../academy/emails').Notificacoes.criar(ref, c.titulo, c.corpo.slice(0, 500), c.link_url || '/academy/app'),
  },
  {
    chave: 'music', nome: 'Musique', emoji: '🎵', cor: '#3B2A6B',
    url: 'https://musique.villelastay.com.br/music/app', caminhoApp: '/music',
    aviso: 'A conta é a da Academy: quem estiver nos dois recebe o e-mail uma vez só.',
    segmentos: [
      { id: 'todos', rotulo: 'Todos os usuários' },
      { id: 'docentes', rotulo: 'Professores e gestores de escola' },
      { id: 'alunos', rotulo: 'Alunos matriculados (maiores de idade)' },
      { id: 'responsaveis', rotulo: 'Responsáveis por alunos menores' },
    ],
    listar(seg) {
      const m = dbDe('music');
      const q = {
        todos: 'SELECT academy_user_id id FROM usuarios_music',
        docentes: 'SELECT DISTINCT usuario id FROM org_membros',
        alunos: "SELECT DISTINCT aluno id FROM matriculas WHERE status = 'ativa' AND menor = 0",
        responsaveis: "SELECT DISTINCT responsavel id FROM matriculas WHERE status = 'ativa' AND menor = 1 AND responsavel <> ''",
      };
      return usuariosAcademyPorIds(m.prepare(q[seg] || q.todos).all().map((r) => String(r.id)));
    },
    sessao: sessaoAcademy,
  },
  {
    chave: 'livraria', nome: 'Livraria Villela', emoji: '📚', cor: '#5A3E2B',
    url: 'https://livros.villelastay.com.br/livros',
    aviso: 'Sem conta nem app (só e-mail e WhatsApp). O checkout não pede consentimento de marketing — prefira avisos sobre os livros comprados.',
    segmentos: [
      { id: 'compradores', rotulo: 'Quem já comprou' },
      { id: 'impresso', rotulo: 'Compradores de livro impresso' },
      { id: 'pdf', rotulo: 'Compradores de PDF' },
    ],
    listar(seg) {
      const cond = seg === 'impresso' ? 'AND o.tem_impresso = 1' : seg === 'pdf' ? 'AND o.tem_pdf = 1' : '';
      return linhas(dbDe('livraria').prepare(`SELECT c.id ref, c.nome, c.email, c.whatsapp telefone,
          json_extract(c.consentimentos, '$.marketing') marketing
        FROM customers c WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status = 'pago' AND COALESCE(o.teste, 0) = 0 ${cond})`).all());
    },
  },
  {
    chave: 'vsm', nome: 'Villela Stay Manager', emoji: '🏨', cor: '#0E5A6B',
    url: 'https://manager.villelastay.com.br/gestao/app', caminhoApp: '/gestao',
    aviso: 'WhatsApp só para o dono da conta (o telefone é da empresa).',
    segmentos: SEG_SAAS,
    listar: saasSimples({ mod: 'vsm', papelDono: 'admin', statusVivos: ['trial', 'ativa', 'cortesia', 'inadimplente'] }),
    sessao: sessaoTenantUsers('vsm', 'vsm_sess'),
  },
  {
    chave: 'vdocs', nome: 'Villela Docs', emoji: '🗂️', cor: '#1F3A5F',
    url: 'https://docs.villelastay.com.br/vdocs/app', caminhoApp: '/vdocs',
    aviso: 'WhatsApp só para o dono da conta (o telefone é da empresa).',
    segmentos: SEG_SAAS,
    listar: saasGlobal({ mod: 'vdocs', papelDono: 'dono' }),
    sessao: sessaoGlobal('vdocs', 'vdocs_sess'),
  },
  {
    chave: 'legal-saas', nome: 'Villela Legal', emoji: '⚖️', cor: '#2B2F4A',
    url: 'https://juridico.villelastay.com.br/juridico/app', caminhoApp: '/juridico',
    aviso: 'Assinantes (escritórios). Os clientes finais de cada escritório NÃO entram.',
    segmentos: SEG_SAAS,
    listar: saasSimples({ mod: 'legal-saas', papelDono: 'admin', statusVivos: ['trial', 'ativa', 'cortesia', 'inadimplente'] }),
    sessao: sessaoTenantUsers('legal-saas', 'jur_saas'),
  },
  {
    chave: 'vpe', nome: 'Villela Projects', emoji: '📋', cor: '#3D2E5C',
    url: 'https://projetos.villelastay.com.br/vpe/app', caminhoApp: '/vpe',
    aviso: 'WhatsApp só para o dono da conta (o telefone é da empresa).',
    segmentos: SEG_SAAS,
    listar: saasGlobal({ mod: 'vpe', papelDono: 'dono' }),
    sessao: sessaoGlobal('vpe', 'vpe_sess'),
  },
  {
    chave: 'crm', nome: 'Villela CRM', emoji: '🤝', cor: '#1B4A3A',
    url: 'https://crm.villelastay.com.br/crm/app', caminhoApp: '/crm',
    aviso: 'Assinantes do CRM. Os contatos de cada assinante NÃO entram.',
    segmentos: SEG_SAAS,
    listar: saasSimples({ mod: 'crm', papelDono: 'owner', statusVivos: ['trial', 'ativa', 'inadimplente'] }),
    sessao: sessaoTenantUsers('crm', 'crm_sess'),
  },
  {
    chave: 'finance', nome: 'Villela Finance', emoji: '💰', cor: '#0F5C4A',
    url: 'https://finance.villelastay.com.br/finance/app', caminhoApp: '/finance',
    aviso: 'Sem telefone cadastrado: só aviso no app e e-mail.',
    segmentos: [
      { id: 'todos', rotulo: 'Todos os usuários com acesso' },
      { id: 'donos', rotulo: 'Só os proprietários das contas' },
      { id: 'ativos', rotulo: 'Assinantes pagantes (conta ativa)' },
      { id: 'trial', rotulo: 'Em período de teste' },
      { id: 'inadimplentes', rotulo: 'Inadimplentes / suspensos' },
    ],
    // O Finance proíbe SQL em tabela de conta fora do repo.js: a leitura
    // atravessa as contas uma a uma, no contexto de cada uma.
    listar(seg) {
      const repo = require('../financeiro/repo'), tenancy = require('../financeiro/tenancy');
      const filtroConta = {
        todos: (t) => ['trial', 'ativa', 'inadimplente'].includes(t.status),
        donos: (t) => ['trial', 'ativa', 'inadimplente'].includes(t.status),
        ativos: (t) => t.status === 'ativa', trial: (t) => t.status === 'trial',
        inadimplentes: (t) => ['inadimplente', 'suspensa'].includes(t.status),
      }[seg] || (() => false);
      const out = [];
      for (const t of repo.listarTenants().filter(filtroConta)) {
        tenancy.comTenant({ tenantId: t.id, userId: 'comunicados' }, () => {
          for (const u of repo.listarUsuarios()) {
            if (u.status !== 'ativo') continue;
            if (seg === 'donos' && u.perfil !== 'proprietario') continue;
            out.push({ ref: u.id, nome: u.nome, email: u.email, telefone: '', marketing: null });
          }
        });
      }
      return linhas(out);
    },
    sessao: (req) => {
      const d = uidDoCookie(req, 'fin_sess');
      if (!d || !d.uid) return null;
      const u = require('../financeiro/sessao').porId(String(d.uid));
      return u ? u.id : null;
    },
  },
  {
    chave: 'closet', nome: 'Closet Club', emoji: '👗', cor: '#6B2E4A',
    url: 'https://closet.villelastay.com.br/closet/app', caminhoApp: '/closet',
    segmentos: [
      { id: 'todos', rotulo: 'Todos os usuários' },
      { id: 'proprietarios', rotulo: 'Proprietários (com peça ativa)' },
      { id: 'locatarios', rotulo: 'Quem já alugou' },
      { id: 'premium', rotulo: 'Assinantes premium' },
      { id: 'parceiros', rotulo: 'Parceiros' },
    ],
    listar(seg) {
      const base = `SELECT u.id ref, u.nome, u.email, u.telefone, json_extract(u.consentimento, '$.marketing') marketing
        FROM users u WHERE u.status = 'ativo' AND u.email NOT LIKE '%@closet.local'`;
      const q = {
        todos: base,
        proprietarios: `${base} AND u.id IN (SELECT owner_id FROM items WHERE status = 'ativo')`,
        locatarios: `${base} AND u.id IN (SELECT cliente_id FROM bookings WHERE status IN ('confirmado','retirado','devolvido','concluido'))`,
        premium: `${base} AND (u.plano = 'premium' OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'ativa'))`,
        parceiros: `${base} AND u.papel = 'parceiro'`,
      };
      return linhas(dbDe('closet').prepare(q[seg] || q.todos).all());
    },
    sessao: sessaoUsers('closet', 'closet_sess'),
    nativo: notificarNativo('closet'),
  },
  {
    chave: 'vitrine', nome: 'Vitrine', emoji: '🛒', cor: '#7A4A12',
    url: 'https://vitrine.villelastay.com.br/vitrine/app', caminhoApp: '/vitrine',
    segmentos: [
      { id: 'todos', rotulo: 'Todos os usuários' },
      { id: 'vendedores', rotulo: 'Vendedores (loja ativa)' },
      { id: 'compradores', rotulo: 'Quem já comprou' },
    ],
    listar(seg) {
      const base = `SELECT u.id ref, u.nome, u.email, u.telefone, NULL marketing
        FROM users u WHERE u.status = 'ativo' AND u.email NOT LIKE '%@vitrine.local'`;
      const q = {
        todos: base,
        vendedores: `${base} AND EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.user_id = u.id AND sp.status = 'ativo')`,
        compradores: `${base} AND EXISTS (SELECT 1 FROM orders o WHERE o.buyer_id = u.id)`,
      };
      return linhas(dbDe('vitrine').prepare(q[seg] || q.todos).all());
    },
    sessao: sessaoUsers('vitrine', 'vitrine_sess'),
    nativo: notificarNativo('vitrine'),
  },
  {
    chave: 'alta-vista', nome: 'Villela Alta Vista 360', emoji: '🚁', cor: '#12345A',
    url: 'https://altavista.villelastay.com.br/alta-vista/app', caminhoApp: '/alta-vista',
    segmentos: [
      { id: 'todos', rotulo: 'Todos os clientes' },
      { id: 'em_andamento', rotulo: 'Com projeto em andamento' },
      { id: 'entregues', rotulo: 'Com projeto entregue' },
    ],
    listar(seg) {
      const base = `SELECT c.id ref, c.nome, c.email, c.whatsapp telefone, NULL marketing
        FROM clientes c WHERE c.status = 'ativo' AND c.email NOT LIKE '%.invalid'`;
      const q = {
        todos: base,
        em_andamento: `${base} AND EXISTS (SELECT 1 FROM projetos p WHERE p.cliente_id = c.id AND p.status NOT IN ('completed','archived','cancelled','delivered'))`,
        entregues: `${base} AND EXISTS (SELECT 1 FROM projetos p WHERE p.cliente_id = c.id AND p.status IN ('delivered','completed'))`,
      };
      return linhas(dbDe('alta-vista').prepare(q[seg] || q.todos).all());
    },
    sessao: sessaoUsers('alta-vista', 'av_sess', 'clientes'),
  },
  {
    chave: 'kids', nome: 'Invente (Villela Kids)', emoji: '🧒', cor: '#6C4DFF',
    url: 'https://kids.villelastay.com.br/kids/app', caminhoApp: '/kids',
    aviso: 'Vai SEMPRE para o responsável — nunca para a criança. Sem telefone: app e e-mail.',
    segmentos: [
      { id: 'todos', rotulo: 'Todas as famílias' },
      { id: 'com_crianca', rotulo: 'Famílias com criança cadastrada' },
    ],
    listar(seg) {
      const base = `SELECT u.id ref, u.nome, u.email, '' telefone, NULL marketing
        FROM users u WHERE u.status = 'ativo' AND u.email NOT LIKE '%@kids.local'`;
      const q = { todos: base, com_crianca: `${base} AND EXISTS (SELECT 1 FROM children c WHERE c.user_id = u.id AND c.status = 'ativo')` };
      return linhas(dbDe('kids').prepare(q[seg] || q.todos).all());
    },
    sessao: sessaoUsers('kids', 'kids_sess', 'users', (d) => d.tipo === 'sessao'),
    nativo: notificarNativo('kids'),
  },
  {
    chave: 'cozinhe', nome: 'Cozinhe', emoji: '🍲', cor: '#8A3B12',
    url: 'https://cozinhe.villelastay.com.br',
    indisponivel: 'O Cozinhe roda em serviço separado e ainda não entrega a lista de usuários para a central (o painel só recebe e-mail mascarado). Falta uma rota no próprio Cozinhe — ver docs/integracoes/comunicados.md.',
    segmentos: [{ id: 'todos', rotulo: 'Todos os usuários' }],
    listar() { throw Object.assign(new Error('Cozinhe ainda não conectado à central de comunicados.'), { status: 501 }); },
  },
];

const obter = (chave) => FONTES.find((f) => f.chave === chave) || null;
const todas = () => FONTES;
const catalogo = () => FONTES.map((f) => ({
  chave: f.chave, nome: f.nome, emoji: f.emoji, url: f.url, aviso: f.aviso || '', indisponivel: f.indisponivel || '',
  segmentos: f.segmentos, tem_app: !!(f.caminhoApp && f.sessao), central_propria: !!f.nativo,
}));

module.exports = { configurar, obter, todas, catalogo, _int: { uidDoCookie } };
