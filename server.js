// =====================================================================
// Backend Villela Stay — v0.1
// Funções:
//   1. Proxy SEGURO da API Stays.net: o site villelastay.com.br consulta
//      disponibilidade/preço aqui, sem nunca expor as credenciais da API.
//   2. Receptor de webhooks da Stays (nova reserva, cancelamento...) —
//      grava eventos em data/eventos.jsonl para os agentes processarem.
//   3. Captura de leads do site (formulário/chat) — grava em data/leads.jsonl.
// Rodar: npm install && npm start  (porta padrão 3000)
// =====================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const compression = require('compression');

// Credenciais via variáveis de ambiente — NUNCA no código.
const STAYS_BASE = process.env.STAYS_BASE || 'https://ville.stays.com.br/external/v1';
const STAYS_ID = process.env.STAYS_CLIENT_ID;
const STAYS_SECRET = process.env.STAYS_SECRET;

if (!STAYS_ID || !STAYS_SECRET) {
  console.error('Defina STAYS_CLIENT_ID e STAYS_SECRET no ambiente (veja .env.example).');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`${STAYS_ID}:${STAYS_SECRET}`).toString('base64');
// DATA_DIR aponta para o disco persistente do Render (/var/data) quando definido;
// localmente cai em ./data. Isso mantém usuários e relatórios mesmo após cada deploy.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.set('trust proxy', 1); // Render põe 1 proxy na frente → req.ip = IP real do cliente (não o X-Forwarded-For forjável)
app.use(express.json({ limit: '15mb' })); // 15mb p/ aceitar PDFs em base64 no upload de relatórios
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // form-urlencoded (ex.: ingestão do Make → CRM)
app.use(cookieParser());

// HTML dos produtos e do Portal Staff: SEMPRE revalidar antes de reusar.
// Sem isto o navegador guardava a pagina por heuristica (nao havia
// Cache-Control nem Last-Modified, so ETag) e um redesign so aparecia depois
// de o usuario limpar o cache. Com `no-cache` o navegador ainda reusa a copia
// local, mas so depois de perguntar ao servidor — e o ETag faz a resposta ser
// um 304 barato quando nada mudou. NAO afeta /assets (versionado, cache longo)
// nem /api (que ja mandam no-store).
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const p = req.path;
  if (p.startsWith('/assets') || p.includes('/api/')) return next();
  const deProduto = ['/gestao', '/crm', '/academy', '/vdocs', '/vpe', '/juridico', '/livros',
    '/cliente-juridico', '/staff'].some(x => p === x || p.startsWith(x + '/'));
  if (deProduto) res.set('Cache-Control', 'no-cache');
  next();
});
app.use(compression()); // gzip nas respostas (JSON/HTML/JS) — o web service do Render não comprime por você

// Visitas: conta TODA página pública que este backend renderiza (Kids, Closet,
// Vitrine, Alta Vista, Academy, CRM, Jurídico, Docs, Projetos, Gestão, Livraria,
// Área do Hóspede). Montado aqui, antes das rotas dos produtos, para que produto
// novo já nasça medido sem precisar de pixel. Portal Staff e APIs ficam de fora.
// Nunca grava IP — ver nucleo/visitas.js. Falha aqui não pode derrubar o site.
let visitasColetor = { registrar: () => {} };
try {
  visitasColetor = require('./nucleo/visitas').criarColetor(DATA_DIR);
  app.use(visitasColetor.middleware);
} catch (e) { console.error('[visitas] coletor não montado:', e.message); }
// Cabeçalhos de segurança (equivalente leve ao helmet, sem dependência nova)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
// Comparação de segredos em tempo constante (evita timing attack em chaves/tokens)
function tokensIguais(a, b) {
  const ba = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
// Rate-limit simples em memória (processo único). Retorna false quando estourou a cota.
const _taxaMap = new Map();
function limiteTaxa(chave, max, janelaMs) {
  const agora = Date.now();
  let e = _taxaMap.get(chave);
  if (!e || agora > e.reset) { e = { count: 0, reset: agora + janelaMs }; _taxaMap.set(chave, e); }
  e.count++;
  return e.count <= max;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of _taxaMap) if (t > v.reset) _taxaMap.delete(k); }, 300000).unref();

// CORS restrito ao site público
app.use((req, res, next) => {
  const allowed = ['https://villelastay.com.br', 'https://www.villelastay.com.br', 'https://villela-stay-site.onrender.com', 'http://localhost:3000'];
  const origin = req.headers.origin;
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

async function stays(pathname, params) {
  const url = new URL(STAYS_BASE + pathname);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  if (!r.ok) throw new Error(`Stays ${r.status}: ${await r.text()}`);
  return r.json();
}

function appendJsonl(file, obj) {
  fs.appendFileSync(path.join(DATA_DIR, file), JSON.stringify({ ...obj, _recebido: new Date().toISOString() }) + '\n');
}

// Normaliza para busca tolerante: minúsculas e SEM acento (ex.: "otavio" acha "Otávio").
function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase(); }
// Palavras de uma busca livre (sem acento, minúsculas) — casamento multi-palavra AND.
function tokensBusca(q) { return semAcento(q || '').trim().split(/\s+/).filter(Boolean); }

app.get('/health', (req, res) => res.json({ ok: true, servico: 'villela-stay-backend' }));

// Disponibilidade e preços de um anúncio (o site consome este endpoint)
app.get('/api/disponibilidade/:listingId', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ erro: 'Parâmetros from e to (yyyy-MM-dd) são obrigatórios' });
    const cal = await stays(`/calendar/listing/${req.params.listingId}`, { from, to });
    // Devolve só o necessário ao site — nada de dados internos
    res.json(cal.map(d => ({
      data: d.date,
      disponivel: d.avail > 0,
      precoBRL: d.prices && d.prices[0] ? d.prices[0]._mcval.BRL : null,
      estadiaMinima: d.prices && d.prices[0] ? d.prices[0].minStay : null,
    })));
  } catch (e) {
    console.error(e);
    res.status(502).json({ erro: 'Falha ao consultar disponibilidade' });
  }
});

// Lista pública de anúncios (nome, capacidade) para montar as páginas do site
app.get('/api/anuncios', async (req, res) => {
  try {
    const listings = await stays('/content/listings', { limit: 20 });
    res.json(listings.map(l => ({
      id: l.id,
      _id: l._id,
      titulo: l._mstitle && l._mstitle.pt_BR,
      tipo: l.subtype,
      status: l.status,
    })));
  } catch (e) {
    console.error(e);
    res.status(502).json({ erro: 'Falha ao listar anúncios' });
  }
});

// Confirmação automática de reserva por WhatsApp.
// LIGA/DESLIGA pela env CONFIRMACAO_AUTO=on (manter "off" até o template confirmacao_reserva ser aprovado pela Meta).
async function confirmarReservaWhatsApp(evento) {
  try {
    if (process.env.CONFIRMACAO_AUTO !== 'on' || !process.env.MAKE_WA_WEBHOOK) return;
    const acao = String(evento.action || '');
    // tolerante a variações de nome do evento (reservation.created, booking.created etc.)
    if (!/(reservation|booking)[._-]?(created|new)/i.test(acao)) return;
    const p = evento.payload || {};
    if (p.type && !['booked', 'reserved', 'contract'].includes(p.type)) return;
    const cli = await stays(`/booking/clients/${p._idclient}`);
    const foneBruto = cli && cli.phones && cli.phones[0] && (cli.phones[0].iso || cli.phones[0].number);
    if (!foneBruto) return console.log('[confirmacao] reserva sem telefone:', p.id);
    const listing = await stays(`/content/listings/${p._idlisting}`);
    const titulo = (listing && listing._mstitle && listing._mstitle.pt_BR) || 'sua hospedagem na Villela Stay';
    const fmt = d => { const [a, m, dia] = String(d).split('-'); return `${dia}/${m}/${a}`; };
    // Valor total (variável {{5}} do template). NUNCA pode ir vazio — a Meta rejeita variável vazia.
    let valorNum = p.price && (p.price._f_total != null ? p.price._f_total : p.price.total);
    let moeda = (p.price && p.price.currency) || 'BRL';
    if (valorNum == null) {
      try {
        const rsv = await stays(`/booking/reservations/${p.id || p._id}`);
        valorNum = rsv && rsv.price && rsv.price._f_total;
        moeda = (rsv && rsv.price && rsv.price.currency) || moeda;
      } catch (e) { console.error('[confirmacao] valor total indisponível:', e.message); }
    }
    const valorTotal = valorNum != null
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(Number(valorNum))
      : 'sob consulta';
    const corpo = {
      to: String(foneBruto).replace(/\D/g, ''),
      template: 'confirmacao_reserva::pt_BR',
      p1: cli.fName || cli.name || 'hóspede', p2: titulo,
      p3: fmt(p.checkInDate), p4: fmt(p.checkOutDate),
      p5: valorTotal
    };
    await fetch(process.env.MAKE_WA_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    console.log('[confirmacao] template enviado para', corpo.to, '— reserva', p.id);
  } catch (e) { console.error('[confirmacao] erro:', e.message); }
}

// Webhook da Stays (configurar na Stays apontando para https://SEU-DOMINIO/webhooks/stays?s=<STAYS_WEBHOOK_SECRET>)
app.post('/webhooks/stays', (req, res) => {
  // Autenticação por segredo (query ?s= ou header x-webhook-secret). Enquanto o segredo não
  // estiver configurado, mantém o comportamento antigo mas avisa — assim a integração viva não
  // quebra antes de o Augusto setar STAYS_WEBHOOK_SECRET e ajustar a URL na Stays.
  const seg = process.env.STAYS_WEBHOOK_SECRET;
  if (seg) {
    if (!tokensIguais(req.query.s || req.headers['x-webhook-secret'], seg)) return res.sendStatus(401);
  } else {
    console.warn('[webhook stays] STAYS_WEBHOOK_SECRET não configurado — endpoint aberto; configure a env e atualize a URL na Stays.');
  }
  console.log('[webhook stays]', JSON.stringify(req.body).slice(0, 500));
  appendJsonl('eventos.jsonl', { origem: 'stays', evento: req.body });
  confirmarReservaWhatsApp(req.body); // assíncrono, não bloqueia a resposta
  ingestStaysEvent(req.body);         // CRM: cliente/reserva vira contato (Fase 2)
  res.sendStatus(200);
});

// Analytics (page views) + captura de leads → extraídos para nucleo/analytics.js (montado no fim).

// Ofertas de última hora: janelas livres nos próximos 15 dias (cache de 6h)
let cacheUltimaHora = { quando: 0, dados: [] };
app.get('/api/ultima-hora', async (req, res) => {
  try {
    if (Date.now() - cacheUltimaHora.quando < 6 * 3600 * 1000) return res.json(cacheUltimaHora.dados);
    const listings = await stays('/content/listings', { limit: 20 });
    const de = new Date(), ate = new Date(Date.now() + 15 * 86400000);
    const fmt = d => d.toISOString().slice(0, 10);
    const ofertas = [];
    for (const l of listings) {
      if (l.status !== 'active') continue;
      try {
        const cal = await stays(`/calendar/listing/${l._id}`, { from: fmt(de), to: fmt(ate) });
        // primeira janela livre de pelo menos 2 noites consecutivas
        let inicio = null, noites = 0;
        for (const dia of cal) {
          if (dia.avail > 0) {
            if (!inicio) { inicio = dia.date; noites = 0; }
            noites++;
          } else if (inicio) {
            if (noites >= 2) break;
            inicio = null; noites = 0;
          }
        }
        if (inicio && noites >= 2) {
          const preco = cal.find(d => d.date === inicio);
          ofertas.push({
            id: l.id,
            titulo: l._mstitle && l._mstitle.pt_BR,
            de: inicio, noites: Math.min(noites, 7),
            precoBRL: preco && preco.prices && preco.prices[0] ? preco.prices[0]._mcval.BRL : null
          });
        }
      } catch (e) { /* segue para o próximo anúncio */ }
    }
    ofertas.sort((a, b) => a.de.localeCompare(b.de));
    cacheUltimaHora = { quando: Date.now(), dados: ofertas.slice(0, 8) };
    res.json(cacheUltimaHora.dados);
  } catch (e) {
    console.error(e);
    res.status(502).json({ erro: 'Falha ao montar ofertas' });
  }
});

// Itens do check-in que costumam gerar cobrança extra (hóspede/convidado extra, pet, evento na casa).
// Usado tanto pelo pré-check-in público (site) quanto pelo check-in do app do hóspede (logado).
function itensBillaveis(d) {
  const convidados = d.convidados != null && d.convidados !== '' ? Number(d.convidados) : 0;
  const petsTxt = String(d.pets || '').trim();
  const temPet = !!petsTxt && !/^(n[aã]o|nenhum|sem|n\/?a)$/i.test(petsTxt);
  const evento = String(d.motivo || '') === 'Evento na cidade';
  const partes = [];
  if (convidados > 0) partes.push(`${convidados} convidado(s) extra p/ evento/day use`);
  if (temPet) partes.push('Pet: ' + petsTxt);
  if (evento && d.evento) partes.push('Evento: ' + String(d.evento).slice(0, 300));
  return { convidados, temPet, petsTxt, evento, resumo: partes.join(' · ') };
}

// Pré-check-in do hóspede (formulário público do site — mesmo destino do check-in do app: precheckins.jsonl).
app.post('/api/precheckin', async (req, res) => {
  const d = req.body || {};
  if (!d.nome || !d.contato) return res.status(400).json({ erro: 'nome e contato são obrigatórios' });
  appendJsonl('precheckins.jsonl', {
    nome: d.nome, contato: d.contato, email: d.email || '', reserva: d.reserva || '',
    hospedagem: d.hospedagem || '', chegada: d.chegada || '', saida: d.saida || '', horario: d.horario || '',
    adultos: d.adultos || '', criancas: d.criancas || '', convidados: d.convidados || '', pets: d.pets || '',
    motivo: d.motivo || '', evento: d.evento || '', origem: d.origem || '', destino: d.destino || '',
    estacionamento: d.estacionamento || '', veiculo: d.veiculo || '',
    observacoes: d.observacoes || '', origemCanal: 'site',
  });
  // Itens com custo: tenta vincular a uma conta de hóspede (pelo telefone) + reserva real p/ abrir um
  // pedido com orçamento; sem vínculo confiável, só alerta o Augusto (o dado já está no Pré-check-ins).
  try {
    const itens = itensBillaveis(d);
    if (itens.resumo) {
      const fone = normFone(d.contato);
      const hospedes = lerHospedes();
      const h = fone && hospedes.find(x => x.ativo && x.telefone === fone);
      let r = null;
      if (h) {
        const reservas = await reservasDoHospede(h, false).catch(() => []);
        const ativas = reservas.filter(x => x.status !== 'canceled' && x.status !== 'blocked');
        const codigo = semAcento(d.reserva || '').trim();
        r = (codigo && ativas.find(x => semAcento(x.id).includes(codigo))) || ativas.find(x => x.checkin === d.chegada) || null;
      }
      if (h && r) {
        const pedidos = lerPedidosHosp();
        const pedido = {
          id: novoId(), hospedeId: h.id, hospedeNome: h.nome || d.nome, staysClientId: h.staysClientId || '',
          tipo: itens.evento ? 'evento' : 'checkin', reservaId: r.id, imovel: r.imovel, imovelTitulo: r.imovelTitulo,
          checkinAtual: r.checkin, checkoutAtual: r.checkout, alteracao: null,
          evento: itens.evento ? { data: d.chegada || '', convidados: itens.convidados || null, descricao: itens.resumo } : null,
          servico: null, manutencao: null,
          checkin: !itens.evento ? { horarioChegada: d.horario || '', pessoas: itens.convidados || null, observacoes: itens.resumo } : null,
          mensagem: '', status: 'novo', orcamento: null, respostaAdmin: '',
          criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
        };
        pedidos.unshift(pedido); salvarPedidosHosp(pedidos);
        alertaAugusto(`Check-in on-line (site) de ${pedido.hospedeNome} tem itens com custo (${itens.resumo}) - reserva ${r.id}${r.imovel ? ' (' + r.imovel + ')' : ''}. Veja em Pedidos de hospedes.`).catch(() => { });
      } else {
        alertaAugusto(`Check-in on-line (site) de ${d.nome} tem itens com custo (${itens.resumo}) mas nao foi possivel vincular a conta/reserva automaticamente - confira em Pre-check-ins.`).catch(() => { });
      }
    }
  } catch (e) { console.error('[precheckin billable]', e.message); }
  res.json({ ok: true });
});

// Chamado do hóspede durante a estadia (problema/manutenção)
app.post('/api/chamados', (req, res) => {
  const d = req.body || {};
  if (!d.nome || !d.descricao) return res.status(400).json({ erro: 'nome e descricao são obrigatórios' });
  console.log('[chamado]', d.nome, '-', String(d.descricao).slice(0, 100));
  appendJsonl('chamados.jsonl', { nome: d.nome, contato: d.contato || '', hospedagem: d.hospedagem || '', descricao: d.descricao });
  res.json({ ok: true });
});

// Leitura protegida dos registros (para os agentes)
function leitorJsonl(arquivo) {
  return (req, res) => {
    if (!process.env.ADMIN_KEY || !tokensIguais(req.headers['x-admin-key'], process.env.ADMIN_KEY)) return res.sendStatus(401);
    const file = path.join(DATA_DIR, arquivo);
    if (!fs.existsSync(file)) return res.json([]);
    const linhas = fs.readFileSync(file, 'utf8').trim().split('\n').slice(-100);
    res.json(linhas.map(l => { try { return JSON.parse(l); } catch { return { bruto: l }; } }));
  };
}
app.get('/api/precheckins', leitorJsonl('precheckins.jsonl'));
app.get('/api/chamados', leitorJsonl('chamados.jsonl'));
app.get('/api/leads-recebidos', leitorJsonl('leads.jsonl'));

// =====================================================================
// PORTAL STAFF — área administrativa logada (/staff)
// Acesso só com login. Augusto = admin; cria os demais usuários e define,
// por usuário, quais ÁREAS (agentes) ele enxerga. Tudo servido pelo backend
// (site estático é sempre público — não dá para proteger conteúdo lá).
// Segredos: só por variável de ambiente (este repositório é público).
// =====================================================================

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('[staff] JWT_SECRET não definido — usando segredo temporário (sessões caem a cada reinício). Defina JWT_SECRET no Render.');
}
const COOKIE_SECURE = process.env.NODE_ENV !== 'development'; // Secure em produção (https)

// Catálogo de áreas = um por agente da operação. O admin enxerga tudo ('*').
const AREAS = [
  { id: 'ceo', nome: 'CEO / Executivo' },
  { id: 'financeiro', nome: 'Financeiro' },
  { id: 'revenue', nome: 'Revenue Management' },
  { id: 'vendas', nome: 'Vendas' },
  { id: 'marketing', nome: 'Marketing' },
  { id: 'concierge', nome: 'Concierge / Hóspedes' },
  { id: 'operacoes', nome: 'Operações / Limpeza' },
  { id: 'manutencao', nome: 'Manutenção' },
  { id: 'compras', nome: 'Compras' },
  { id: 'obras', nome: 'Obras & Decoração' },
  { id: 'juridico', nome: 'Jurídico' },
  { id: 'contador', nome: 'Contábil / Fiscal' },
  { id: 'ti', nome: 'TI / Site' },
  { id: 'livros', nome: 'Livraria' },
  { id: 'origena', nome: 'Origena / Memória Familiar' },
];
const AREA_IDS = new Set(AREAS.map(a => a.id));

// ---- armazenamento simples em arquivo JSON (no disco persistente) ----
function lerJSON(arquivo, padrao) {
  try {
    const f = path.join(DATA_DIR, arquivo);
    if (!fs.existsSync(f)) return padrao;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) { console.error('[staff] erro lendo', arquivo, e.message); return padrao; }
}
function salvarJSON(arquivo, obj) {
  // Escrita atômica: grava num temporário e renomeia (rename é atômico no mesmo filesystem).
  // Evita deixar o JSON truncado se o processo cair no meio do write (dados financeiros/usuários).
  const destino = path.join(DATA_DIR, arquivo);
  const tmp = destino + '.tmp-' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, destino);
}
// Mutação serializada por arquivo (lock por coleção): evita lost-update quando um fluxo async lê,
// dá await e só então grava. fn(atual) roda em fila por `arquivo`; se retornar valor, é gravado.
const _jsonLocks = new Map();
function atualizarJSON(arquivo, fn, padrao) {
  const anterior = _jsonLocks.get(arquivo) || Promise.resolve();
  const proximo = anterior.then(async () => {
    const atual = lerJSON(arquivo, padrao);
    const novo = await fn(atual);
    if (novo !== undefined) salvarJSON(arquivo, novo);
    return novo;
  });
  _jsonLocks.set(arquivo, proximo.then(() => {}, () => {})); // a fila continua viva mesmo após erro
  return proximo;
}
const lerUsuarios = () => lerJSON('usuarios.json', []);
const salvarUsuarios = (u) => salvarJSON('usuarios.json', u);
const lerRelatorios = () => lerJSON('relatorios.json', []);
const salvarRelatorios = (r) => salvarJSON('relatorios.json', r);
const ARQ_DIR = path.join(DATA_DIR, 'relatorios-arquivos');
fs.mkdirSync(ARQ_DIR, { recursive: true });

function novoId() { return crypto.randomBytes(9).toString('base64url'); }
function semSenha(u) { const { senhaHash, ...resto } = u; return resto; }
function podeArea(user, area) { return user.papel === 'admin' || (user.areas || []).includes('*') || (user.areas || []).includes(area); }
function areasDoUsuario(user) { return user.papel === 'admin' || (user.areas || []).includes('*') ? AREAS.map(a => a.id) : (user.areas || []); }

// ============================================================
// CRM (Fase 0) — contatos + atividades. Stays = sistema de reservas;
// aqui mora o FUNIL e o relacionamento. Dedupe por telefone (E.164).
// ============================================================
const ESTAGIOS = ['novo', 'contato', 'orcamento', 'negociacao', 'reserva', 'hospedado', 'posvenda', 'perdido'];
const lerContatos = () => lerJSON('contatos.json', []);
const salvarContatos = (c) => salvarJSON('contatos.json', c);
const hojeISO = () => new Date().toISOString().slice(0, 10);

// Normaliza telefone para dígitos com DDI (chave de dedupe). Best-effort p/ Brasil.
function normFone(s) {
  let d = String(s || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) return d; // já tem DDI
  if (d.length === 10 || d.length === 11) return '55' + d;              // DDD + número, sem DDI
  return d;                                                             // internacional/atípico: mantém
}

function lerAtividades(contatoId) {
  const f = path.join(DATA_DIR, 'atividades.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(a => a && a.contatoId === contatoId)
    .sort((a, b) => String(b.data).localeCompare(String(a.data))); // mais recente primeiro
}
function addAtividade(contatoId, tipo, texto, canal, autor) {
  appendJsonl('atividades.jsonl', {
    id: novoId(), contatoId, tipo, texto: String(texto || ''),
    canal: canal || '', autor: autor || 'sistema', data: new Date().toISOString(),
  });
}

// Cria ou enriquece um contato (dedupe por telefone, depois e-mail). Retorna { contato, novo }.
function upsertContato(dados) {
  const contatos = lerContatos();
  const tel = normFone(dados.telefone || dados.contato || '');
  const email = String(dados.email || '').trim().toLowerCase();
  const agora = new Date().toISOString();
  let c = null;
  if (dados.staysClientId) c = contatos.find(x => x.staysClientId && x.staysClientId === dados.staysClientId);
  if (!c && tel) c = contatos.find(x => x.telefone && x.telefone === tel);
  if (!c && email) c = contatos.find(x => x.email && x.email.toLowerCase() === email);

  if (c) { // enriquece campos vazios; não sobrescreve o que já existe
    if (!c.nome && dados.nome) c.nome = dados.nome;
    if (!c.telefone && tel) c.telefone = tel;
    if (!c.email && email) c.email = email;
    if (!c.staysClientId && dados.staysClientId) c.staysClientId = dados.staysClientId;
    if (!c.imovelInteresse && dados.imovelInteresse) c.imovelInteresse = dados.imovelInteresse;
    if (!c.canal && dados.canal) c.canal = dados.canal; // origem real (Google, Instagram...) p/ o funil de visitas
    c.atualizadoEm = agora;
    salvarContatos(contatos);
    if (dados.mensagem) addAtividade(c.id, 'mensagem-recebida', dados.mensagem, dados.origem || '', 'sistema');
    return { contato: c, novo: false };
  }

  c = {
    id: novoId(), nome: dados.nome || '', telefone: tel, email,
    origem: dados.origem || 'manual', canal: dados.canal || '', estagio: 'novo', dono: 'Augusto',
    proximaAcao: { descricao: 'Responder primeiro contato', data: hojeISO() },
    valorEstimado: dados.valorEstimado != null ? Number(dados.valorEstimado) : null,
    imovelInteresse: dados.imovelInteresse || '',
    periodo: dados.periodo || { checkin: '', checkout: '', hospedes: '' },
    preferencias: '', staysClientId: dados.staysClientId || '', staysReservationId: '', motivoPerda: '',
    consentimento: { optIn: !!dados.mensagem, base: dados.mensagem ? 'mensagem-do-cliente' : '', em: agora },
    criadoEm: dados.criadoEm || agora, atualizadoEm: agora,
  };
  contatos.unshift(c);
  salvarContatos(contatos);
  addAtividade(c.id, 'nota', 'Contato criado (origem: ' + c.origem + ')', c.origem, 'sistema');
  if (dados.mensagem) addAtividade(c.id, 'mensagem-recebida', dados.mensagem, c.origem, 'sistema');
  return { contato: c, novo: true };
}

// Aplica campos a um contato existente (read-modify-write). Devolve o contato ou null.
function patchContatoInterno(id, campos) {
  const contatos = lerContatos();
  const c = contatos.find(x => x.id === id);
  if (!c) return null;
  Object.assign(c, campos);
  c.atualizadoEm = new Date().toISOString();
  salvarContatos(contatos);
  return c;
}
// Só avança no funil (nunca regride por evento automático); 'perdido' sempre vale.
function avancaEstagio(atual, alvo) {
  if (alvo === 'perdido') return 'perdido';
  const i = ESTAGIOS.indexOf(atual), j = ESTAGIOS.indexOf(alvo);
  return (j >= 0 && j > i) ? alvo : atual;
}

// INGESTÃO Fase 2 — evento da Stays (cliente/reserva) vira/atualiza um contato no CRM.
// Não bloqueia a resposta do webhook. Dedupe por staysClientId/telefone/e-mail.
async function ingestStaysEvent(evento) {
  try {
    const acao = String((evento && (evento.action || evento.type)) || '');
    const p = (evento && (evento.payload || evento.data)) || {};
    const ehCliente = /client|cliente/i.test(acao);
    const ehReserva = /(reservation|booking|reserva)/i.test(acao) && !ehCliente;
    if (!ehCliente && !ehReserva) return;

    const clientId = p._idclient || (ehCliente ? (p._id || p.id) : null);
    if (!clientId) return;
    const cli = await stays(`/booking/clients/${clientId}`).catch(() => null);
    if (!cli) return;
    const fone = (cli.phones && cli.phones[0] && (cli.phones[0].iso || cli.phones[0].number)) || '';
    const email = (cli.emails && cli.emails[0] && (cli.emails[0].address || cli.emails[0])) || cli.email || '';
    const nome = (cli.fName ? (cli.fName + ' ' + (cli.lName || '')).trim() : (cli.name || '')) || '';
    if (!fone && !email && !nome) return; // nada para identificar

    const { contato } = upsertContato({ nome, telefone: fone, email, origem: 'stays', staysClientId: clientId });
    const campos = { staysClientId: clientId };
    let atividade = null; // só registra atividade quando o estágio muda (evita ruído dos "modified")

    if (ehReserva) {
      const tipo = String(p.type || '');
      const canal = String(p.partner || p.partnerName || p.channel || '').toLowerCase();
      if (/airbnb/.test(canal)) campos.origem = 'airbnb';
      else if (/booking/.test(canal)) campos.origem = 'booking';
      else if (/decolar|despegar/.test(canal)) campos.origem = 'decolar';
      if (p.checkInDate || p.checkOutDate) campos.periodo = { checkin: p.checkInDate || '', checkout: p.checkOutDate || '', hospedes: p.guests || p._i_adults || '' };
      if (p.price && p.price._f_total != null) campos.valorEstimado = Number(p.price._f_total);
      if (p.id || p._id) campos.staysReservationId = p.id || p._id;
      if (p._idlisting) { const lst = await stays(`/content/listings/${p._idlisting}`).catch(() => null); if (lst) campos.imovelInteresse = lst.id || (lst._mstitle && lst._mstitle.pt_BR) || ''; }
      const alvo = (tipo === 'canceled') ? 'perdido' : 'reserva';
      const novoEstagio = avancaEstagio(contato.estagio, alvo);
      campos.estagio = novoEstagio;
      if (tipo === 'canceled') campos.motivoPerda = 'Reserva cancelada na Stays';
      if (novoEstagio !== contato.estagio) {
        atividade = { tipo: 'reserva', texto: (tipo === 'canceled' ? 'Reserva cancelada na Stays' : 'Reserva confirmada na Stays') + (campos.imovelInteresse ? ' (' + campos.imovelInteresse + ')' : '') };
      }
      // Área do Hóspede: cria conta automática só para reserva DIRETA/WhatsApp (não-OTA) e não-cancelada.
      // Gate HOSPEDE_AUTO=on (default OFF): enquanto desligado, o deploy NÃO envia credenciais a hóspedes
      // reais — o login, o auto-cadastro por código (OTA) e o onboarding manual pelo admin seguem ativos.
      const ehOTA = /airbnb|booking|decolar|despegar|expedia|vrbo|homeaway|google/.test(canal);
      if (process.env.HOSPEDE_AUTO === 'on' && tipo !== 'canceled' && !ehOTA) {
        criarContaHospede(cli, clientId).catch(e => console.error('[hospede auto]', e.message));
      }
    }

    const atual = patchContatoInterno(contato.id, campos);
    if (atual && atividade) addAtividade(atual.id, atividade.tipo, atividade.texto, 'stays', 'sistema');
    console.log('[crm ingest] contato', contato.id, ehReserva ? '(reserva)' : '(cliente)', '->', campos.estagio || contato.estagio);
  } catch (e) { console.error('[crm ingest stays]', e.message); }
}

// ---- seed do admin no boot ----
(function seedAdmin() {
  const usuarios = lerUsuarios();
  if (usuarios.length > 0) return;
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const senha = process.env.ADMIN_INITIAL_PASSWORD || '';
  if (!email || !senha) {
    console.warn('[staff] sem usuários e sem ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD — defina-os no Render para criar o admin inicial.');
    return;
  }
  usuarios.push({
    id: novoId(), nome: 'Augusto Villela', email,
    senhaHash: bcrypt.hashSync(senha, 10),
    papel: 'admin', areas: ['*'], ativo: true,
    precisaTrocarSenha: true, criadoEm: new Date().toISOString(), ultimoLogin: null,
  });
  salvarUsuarios(usuarios);
  console.log('[staff] admin inicial criado:', email);
})();

// ---- throttle simples de login (anti força-bruta), em memória ----
const tentativas = new Map(); // ip -> { n, ate }
function loginBloqueado(ip) {
  const t = tentativas.get(ip);
  return t && t.ate > Date.now();
}
function registraFalha(ip) {
  const t = tentativas.get(ip) || { n: 0, ate: 0 };
  t.n++;
  if (t.n >= 5) { t.ate = Date.now() + 15 * 60 * 1000; t.n = 0; } // 15 min após 5 erros
  tentativas.set(ip, t);
}
function limpaFalhas(ip) { tentativas.delete(ip); }

// ---- middlewares de autenticação ----
function requireAuth(req, res, next) {
  try {
    const tok = req.cookies && req.cookies.staff_token;
    if (!tok) return res.status(401).json({ erro: 'não autenticado' });
    const { uid } = jwt.verify(tok, JWT_SECRET);
    const user = lerUsuarios().find(u => u.id === uid);
    if (!user || !user.ativo) return res.status(401).json({ erro: 'sessão inválida' });
    req.user = user;
    next();
  } catch (e) { return res.status(401).json({ erro: 'sessão inválida' }); }
}
function requireAdmin(req, res, next) {
  if (req.user && req.user.papel === 'admin') return next();
  return res.status(403).json({ erro: 'apenas administrador' });
}
// Publicação por agentes: aceita a PUBLISH_KEY (scripts locais) OU uma sessão válida.
function requirePublishOrSession(req, res, next) {
  const key = req.headers['x-publish-key'];
  if (process.env.PUBLISH_KEY && key && tokensIguais(key, process.env.PUBLISH_KEY)) { req.viaChave = true; return next(); }
  return requireAuth(req, res, next);
}
// Como requirePublishOrSession, mas a sessão precisa ser admin (a PUBLISH_KEY sempre passa).
// Usado na config da Área do Hóspede (imóveis, serviços, fidelidade) p/ permitir manutenção via chave.
function requirePublishOrAdmin(req, res, next) {
  const key = req.headers['x-publish-key'];
  if (process.env.PUBLISH_KEY && key && tokensIguais(key, process.env.PUBLISH_KEY)) { req.viaChave = true; return next(); }
  return requireAuth(req, res, () => requireAdmin(req, res, next));
}

// Nunca cachear respostas da API do portal — o navegador pode guardar GETs sem
// Cache-Control e mostrar conteúdo antigo (ex.: texto desatualizado de um relatório).
app.use('/staff/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// =========================== sessão ===========================
// staff-core: login/logout/me/troca-senha/usuários (CRUD) → nucleo/staff-core.js (montado no fim).
// ===================== relatórios / entregas =====================
// Reacentuação automática de título/resumo: muitos scripts/agentes publicam
// em ASCII (para evitar corrupção de acento no Agendador do Windows). Aqui, no
// servidor (Node, UTF-8 seguro), restauramos os acentos. SÓ age se a string
// estiver 100% sem acento (assim nunca estraga textos já acentuados) e troca
// apenas palavras inteiras conhecidas (o resto fica como está).
const ACENTOS = {
  acustica:'acústica', alem:'além', animacao:'animação', aniversario:'aniversário', anuncio:'anúncio',
  aprovacao:'aprovação', area:'área', atencao:'atenção', ate:'até', automacoes:'automações',
  avaliacoes:'avaliações', brasilia:'brasília', cafe:'café', calendario:'calendário', cartao:'cartão',
  comodos:'cômodos', concorrencia:'concorrência', conteudo:'conteúdo', cotacao:'cotação',
  decisoes:'decisões', decoracao:'decoração', dedetizacao:'dedetização', descricao:'descrição',
  descricoes:'descrições', diaria:'diária', diario:'diário', duvidas:'dúvidas', endereco:'endereço',
  estagios:'estágios', estrategia:'estratégia', evolucao:'evolução', excecoes:'exceções',
  ferias:'férias', governanca:'governança', grafica:'gráfica', graficos:'gráficos', historica:'histórica',
  historico:'histórico', horario:'horário', hospede:'hóspede', hospedes:'hóspedes', impressao:'impressão',
  indice:'índice', informacoes:'informações', inicio:'início', inventario:'inventário', juridico:'jurídico',
  legislacao:'legislação', liquido:'líquido', manutencao:'manutenção', manutencoes:'manutenções',
  medio:'médio', mes:'mês', metodo:'método', movel:'móvel', nao:'não', ocupacao:'ocupação',
  opcoes:'opções', operacao:'operação', operacoes:'operações', otimizacao:'otimização', padrao:'padrão',
  pagina:'página', parametros:'parâmetros', periodo:'período', porem:'porém', pos:'pós',
  possivel:'possível', pre:'pré', preco:'preço', precos:'preços', proxima:'próxima', proximas:'próximas',
  proximo:'próximo', publicacao:'publicação', publicacoes:'publicações', reclassificacao:'reclassificação',
  recorrencias:'recorrências', regiao:'região', regua:'régua', relatorio:'relatório', reuniao:'reunião',
  responsavel:'responsável', romantico:'romântico', sao:'são', saida:'saída', servico:'serviço',
  servicos:'serviços', sinalizacao:'sinalização', situacao:'situação', solicitacoes:'solicitações',
  tambem:'também', tecnicas:'técnicas', tecnico:'técnico', tendencias:'tendências', titulo:'título',
  titulos:'títulos', tributario:'tributário', ultimos:'últimos', versoes:'versões', videos:'vídeos',
  voce:'você',
};
function reacentua(s) {
  if (!s) return s;
  if (/[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/.test(s)) return s; // já tem acento: respeita
  return s.replace(/[A-Za-z]+/g, (w) => {
    const acc = ACENTOS[w.toLowerCase()];
    if (!acc) return w;
    if (w[0] === w[0].toUpperCase()) return acc.charAt(0).toUpperCase() + acc.slice(1);
    return acc;
  });
}

// Publicar (sessão com a área, ou script local com x-publish-key)
app.post('/staff/api/relatorios', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const area = String(d.area || '').trim();
  if (!AREA_IDS.has(area)) return res.status(400).json({ erro: 'Área inválida.' });
  if (!req.viaChave && !podeArea(req.user, area)) return res.status(403).json({ erro: 'Sem acesso a essa área.' });
  const titulo = reacentua(String(d.titulo || '').trim());
  if (!titulo) return res.status(400).json({ erro: 'Título é obrigatório.' });
  const tipo = ['relatorio', 'produto', 'servico'].includes(d.tipo) ? d.tipo : 'relatorio';

  const rel = {
    id: novoId(), area, tipo, titulo,
    resumo: reacentua(String(d.resumo || '').slice(0, 1000)),
    periodo: String(d.periodo || '').slice(0, 50),
    autor: req.viaChave ? (String(d.autor || 'agente').slice(0, 60)) : req.user.nome,
    publicadoEm: new Date().toISOString(),
    formato: 'texto',
  };

  if (d.url) {
    rel.formato = 'url'; rel.url = String(d.url).slice(0, 1000);
  } else if (d.arquivoBase64 && d.nomeArquivo) {
    const ext = path.extname(String(d.nomeArquivo)).slice(0, 10).replace(/[^.\w]/g, '') || '.bin';
    const nome = rel.id + ext;
    try {
      fs.writeFileSync(path.join(ARQ_DIR, nome), Buffer.from(d.arquivoBase64, 'base64'));
    } catch (e) { return res.status(400).json({ erro: 'Arquivo inválido.' }); }
    rel.formato = 'arquivo'; rel.arquivo = nome; rel.nomeArquivo = String(d.nomeArquivo).slice(0, 200);
  } else {
    rel.formato = 'texto'; rel.texto = String(d.texto || '');
    if (!rel.texto.trim()) return res.status(400).json({ erro: 'Informe texto, url ou arquivo.' });
  }

  const relatorios = lerRelatorios();
  relatorios.unshift(rel);
  salvarRelatorios(relatorios);
  res.json({ ok: true, relatorio: { ...rel, texto: undefined } });
});

// Migração única: reacentua título/resumo das entregas já publicadas (em ASCII).
app.post('/staff/api/relatorios/reacentuar', requirePublishOrSession, (req, res) => {
  const rs = lerRelatorios();
  let n = 0;
  for (const r of rs) {
    const t = reacentua(r.titulo || '');
    const rsm = reacentua(r.resumo || '');
    if (t !== r.titulo || rsm !== r.resumo) { r.titulo = t; r.resumo = rsm; n++; }
  }
  salvarRelatorios(rs);
  res.json({ ok: true, alterados: n, total: rs.length });
});

// Listar (sessão filtra pelas áreas do usuário; a PUBLISH_KEY vê tudo — ferramenta de manutenção)
app.get('/staff/api/relatorios', requirePublishOrSession, (req, res) => {
  const todas = lerRelatorios();
  const lista = (req.viaChave ? todas : todas.filter(r => areasDoUsuario(req.user).includes(r.area)))
    .filter(r => !req.query.area || r.area === req.query.area)
    .map(({ texto, ...meta }) => meta); // não manda o corpo na listagem
  res.json({ relatorios: lista });
});

// Detalhe (texto/url) — para arquivo use /arquivo
app.get('/staff/api/relatorios/:id', requirePublishOrSession, (req, res) => {
  const rel = lerRelatorios().find(r => r.id === req.params.id);
  if (!rel) return res.status(404).json({ erro: 'Não encontrado.' });
  if (!req.viaChave && !podeArea(req.user, rel.area)) return res.status(403).json({ erro: 'Sem acesso.' });
  res.json({ relatorio: rel });
});

// Baixar/abrir o arquivo de um relatório
app.get('/staff/api/relatorios/:id/arquivo', requireAuth, (req, res) => {
  const rel = lerRelatorios().find(r => r.id === req.params.id);
  if (!rel || rel.formato !== 'arquivo') return res.sendStatus(404);
  if (!podeArea(req.user, rel.area)) return res.sendStatus(403);
  const f = path.join(ARQ_DIR, rel.arquivo);
  if (!fs.existsSync(f)) return res.sendStatus(404);
  res.setHeader('Content-Disposition', `inline; filename="${(rel.nomeArquivo || rel.arquivo).replace(/[^ -~]/g, '_')}"`);
  res.sendFile(f);
});

app.delete('/staff/api/relatorios/:id', requirePublishOrSession, (req, res) => {
  const relatorios = lerRelatorios();
  const rel = relatorios.find(r => r.id === req.params.id);
  if (!rel) return res.status(404).json({ erro: 'Não encontrado.' });
  if (!req.viaChave && req.user.papel !== 'admin' && !podeArea(req.user, rel.area)) return res.status(403).json({ erro: 'Sem acesso.' });
  if (rel.formato === 'arquivo') { try { fs.unlinkSync(path.join(ARQ_DIR, rel.arquivo)); } catch {} }
  salvarRelatorios(relatorios.filter(r => r.id !== rel.id));
  res.json({ ok: true });
});

// ===================== CRM — contatos / funil (área "vendas") =====================
// Acesso: PUBLISH_KEY (scripts internos) OU sessão com acesso à área vendas/admin.
function podeCRM(req, res, next) {
  if (req.viaChave) return next();
  if (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'vendas'))) return next();
  return res.status(403).json({ erro: 'Sem acesso ao CRM (área vendas).' });
}

// Listar contatos (filtros: estagio, origem, busca por nome/telefone/email)
// CRM legado (contatos/funil/métricas/followups + POST/GET contato) → nucleo/crm-legado.js (montado no fim).
// Histórico do cliente na Stays (Fase 4): reservas e gasto, para contatos vinculados (staysClientId).
// O objeto do cliente da Stays já traz `reservations` completas — sem chamadas extras por reserva.
let _crmListingMap = { quando: 0, mapa: {} };
async function getListingMap() {
  if (Date.now() - _crmListingMap.quando < 6 * 3600 * 1000 && Object.keys(_crmListingMap.mapa).length) return _crmListingMap.mapa;
  try {
    const listings = await stays('/content/listings', { limit: 20 });
    const mapa = {};
    for (const l of listings) mapa[l._id] = { codigo: l.id, titulo: (l._mstitle && l._mstitle.pt_BR) || l.id };
    _crmListingMap = { quando: Date.now(), mapa };
  } catch (e) { console.error('[crm stays] listingMap:', e.message); }
  return _crmListingMap.mapa;
}
// CRM legado: /contatos/:id/stays .. migrar-leads → nucleo/crm-legado.js.
// ===================== dados operacionais (por área, via sessão) =====================
const PAINEIS = {
  leads:       { arquivo: 'leads.jsonl',       areas: ['vendas', 'marketing'] },
  precheckins: { arquivo: 'precheckins.jsonl', areas: ['concierge', 'operacoes'] },
  chamados:    { arquivo: 'chamados.jsonl',    areas: ['concierge', 'manutencao', 'operacoes'] },
  eventos:     { arquivo: 'eventos.jsonl',     areas: ['ti', 'ceo'] },
};
function leUltimasLinhas(arquivo, n) {
  const f = path.join(DATA_DIR, arquivo);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).slice(-n)
    .map(l => { try { return JSON.parse(l); } catch { return { bruto: l }; } }).reverse();
}
app.get('/staff/api/dados/:painel', requireAuth, (req, res) => {
  const cfg = PAINEIS[req.params.painel];
  if (!cfg) return res.status(404).json({ erro: 'Painel inexistente.' });
  if (!cfg.areas.some(a => podeArea(req.user, a))) return res.status(403).json({ erro: 'Sem acesso a este painel.' });
  res.json({ itens: leUltimasLinhas(cfg.arquivo, 100) });
});
// Estatísticas de visita (marketing/ti/ceo)
app.get('/staff/api/estatisticas-portal', requireAuth, (req, res) => {
  if (!['marketing', 'ti', 'ceo'].some(a => podeArea(req.user, a))) return res.status(403).json({ erro: 'Sem acesso.' });
  const f = path.join(DATA_DIR, 'hits.jsonl');
  if (!fs.existsSync(f)) return res.json({ totalVisitas: 0, porPagina: {}, porDia: {} });
  const linhas = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  const porPagina = {}, porDia = {};
  for (const l of linhas) { try { const h = JSON.parse(l); porPagina[h.pagina] = (porPagina[h.pagina] || 0) + 1; const dia = (h._recebido || '').slice(0, 10); porDia[dia] = (porDia[dia] || 0) + 1; } catch {} }
  res.json({ totalVisitas: linhas.length, porPagina, porDia });
});
// Casas mais vistas no site × ocupação real do MESMO período (marketing/ti/ceo).
// Mora aqui, e não em nucleo/visitas.js, porque a ocupação depende do espelhamento
// das interligações (FILHOS_OCUP / expandirBloqueados) — que é definido neste arquivo
// e precisa continuar tendo UMA implementação só (regra 5 do CLAUDE.md).
app.get('/staff/api/visitas-casas', requireAuth, async (req, res) => {
  if (!['marketing', 'ti', 'ceo'].some(a => podeArea(req.user, a))) return res.status(403).json({ erro: 'Sem acesso.' });
  const dias = Math.min(400, Math.max(1, parseInt(req.query.dias, 10) || 30));
  const hoje = new Date().toISOString().slice(0, 10);
  const de = new Date(Date.parse(hoje) - (dias - 1) * 86400000).toISOString().slice(0, 10);
  try {
    // 1) Visitas às páginas de anúncio, em qualquer idioma: /hospedagem/GD03H.html, /en/hospedagem/...
    const visitas = {};
    const f = path.join(DATA_DIR, 'hits.jsonl');
    if (fs.existsSync(f)) {
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
        if (!l.trim()) continue;
        try {
          const h = JSON.parse(l);
          if (h.bot) continue;
          if (String(h._recebido || '').slice(0, 10) < de) continue;
          const m = /\/hospedagem\/([A-Z0-9]+)/i.exec(h.pagina || '');
          if (m) visitas[m[1].toUpperCase()] = (visitas[m[1].toUpperCase()] || 0) + 1;
        } catch {}
      }
    }

    // 2) Ocupação por anúncio no mesmo período, noite a noite, com o espelhamento aplicado.
    const listings = await staysPaginado('/content/listings', {});
    const ativos = listings.filter(l => l.status === 'active');
    const universo = new Set(ativos.map(l => l.id));
    const codPorId = {}; const nomePorCod = {};
    for (const l of ativos) { codPorId[l._id] = l.id; nomePorCod[l.id] = l.internalName || (l._mstitle && l._mstitle.pt_BR) || l.id; }

    const reservas = (await staysPaginado('/booking/reservations', { from: de, to: hoje, dateType: 'included' }))
      .filter(r => r.type !== 'canceled');
    const noitesOcup = {};
    for (let i = 0; i < dias; i++) {
      const noite = new Date(Date.parse(de) + i * 86400000).toISOString().slice(0, 10);
      const ocupados = new Set();
      for (const r of reservas) {
        if (r.checkInDate <= noite && noite < r.checkOutDate) { const c = codPorId[r._idlisting]; if (c) ocupados.add(c); }
      }
      expandirBloqueados(ocupados, universo);
      for (const c of ocupados) noitesOcup[c] = (noitesOcup[c] || 0) + 1;
    }

    // 3) Leitura de negócio: o cruzamento só serve se disser o que fazer com ele.
    const codigos = Array.from(new Set([...Object.keys(visitas), ...Object.keys(noitesOcup)])).filter(c => universo.has(c));
    const vals = codigos.map(c => visitas[c] || 0);
    const mediaVis = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const linhas = codigos.map(c => {
      const v = visitas[c] || 0;
      const ocup = Math.round(1000 * (noitesOcup[c] || 0) / dias) / 10;
      let leitura = '';
      if (v >= mediaVis * 1.3 && ocup < 40) leitura = 'Muito vista e pouco ocupada — olhar preço, fotos e disponibilidade.';
      else if (v > 0 && v <= mediaVis * 0.5 && ocup >= 70) leitura = 'Ocupada mesmo com pouca visita — candidata a subir preço.';
      else if (v === 0) leitura = 'Sem visita à página no período.';
      return { codigo: c, nome: nomePorCod[c] || '', visitas: v, ocupacaoPct: ocup, leitura };
    }).sort((a, b) => b.visitas - a.visitas || b.ocupacaoPct - a.ocupacaoPct);

    res.set('Cache-Control', 'no-store');
    res.json({ de, ate: hoje, linhas, aviso: 'Ocupação calculada noite a noite no mesmo período, já com o espelhamento das interligações (espaço inteiro ocupa seus componentes e vice-versa).' });
  } catch (e) {
    console.error('[visitas-casas]', e.message);
    res.status(502).json({ erro: 'Falha ao consultar a Stays para cruzar com a ocupação.' });
  }
});

// Resumo para a tela inicial
app.get('/staff/api/visao-geral', requireAuth, (req, res) => {
  const minhas = areasDoUsuario(req.user);
  const relatorios = lerRelatorios().filter(r => minhas.includes(r.area));
  const porArea = {};
  for (const r of relatorios) porArea[r.area] = (porArea[r.area] || 0) + 1;
  const ultimos = relatorios.slice(0, 6).map(({ texto, ...m }) => m);
  res.json({
    totalRelatorios: relatorios.length, porArea, ultimos,
    areas: minhas, catalogoAreas: AREAS,
    painelDisponivel: Object.fromEntries(Object.entries(PAINEIS).map(([k, v]) => [k, v.areas.some(a => podeArea(req.user, a))])),
  });
});

// ============================ Listas: Compras, Manutenção e Pendências ============================
// Fonte ÚNICA das listas. Itens entram pelo portal (qualquer usuário logado) OU pela captura do
// WhatsApp (script local, via PUBLISH_KEY, com refId p/ dedupe). Excluíveis por qualquer logado.
const LISTA_ARQ = { compras: 'lista-compras.json', manutencao: 'lista-manutencao.json', pendencias: 'lista-pendencias.json' };
// Categorias (áreas) das pendências — lista editável, semeada com as áreas iniciais do Augusto.
const PEND_CAT_PADRAO = ['PC Windows', 'Site', 'Automação', 'Financeiro', 'Marketing', 'CEO', 'Negociações', 'Estudo', 'Sites novos'];
const lerPendCats = () => { const a = lerJSON('categorias-pendencias.json', null); return Array.isArray(a) && a.length ? a : PEND_CAT_PADRAO.slice(); };
const salvarPendCats = (a) => salvarJSON('categorias-pendencias.json', a);
// Arquivo das pendências CONCLUÍDAS (baixa via portal ✓ ou comando de WhatsApp).
const lerPendArquivo = () => { const a = lerJSON('pendencias-arquivo.json', []); return Array.isArray(a) ? a : []; };
const salvarPendArquivo = (a) => salvarJSON('pendencias-arquivo.json', a);
function arquivarPendencias(itens, quem) {
  if (!itens || !itens.length) return;
  const arq = lerPendArquivo();
  const when = new Date().toISOString();
  for (const it of itens) arq.unshift(Object.assign({}, it, { concluidoEm: when, concluidoPor: quem }));
  if (arq.length > 2000) arq.length = 2000;
  salvarPendArquivo(arq);
}
// Itens CONCLUÍDOS da lista de compras (✓ no portal ou "já comprei X" no WhatsApp): em vez de sumir,
// caem numa lista de concluídos logo abaixo, de onde podem VOLTAR para a lista ativa. O botão ✕ da
// linha exclui sem concluir (?arquivar=nao) — é a diferença entre "comprei" e "não quero mais".
const COMPRAS_CONCLUIDOS = 'lista-compras-concluidos.json';
const COMPRAS_CONCLUIDOS_MAX = 500;
const lerComprasConcluidos = () => { const a = lerJSON(COMPRAS_CONCLUIDOS, []); return Array.isArray(a) ? a : []; };
const salvarComprasConcluidos = (a) => salvarJSON(COMPRAS_CONCLUIDOS, a);
function concluirCompras(itens, quem) {
  if (!itens || !itens.length) return;
  const arq = lerComprasConcluidos();
  const when = new Date().toISOString();
  for (const it of itens) arq.unshift(Object.assign({}, it, { concluidoEm: when, concluidoPor: quem }));
  if (arq.length > COMPRAS_CONCLUIDOS_MAX) arq.length = COMPRAS_CONCLUIDOS_MAX;
  salvarComprasConcluidos(arq);
}

// 'pendencias' é restrita: só admin ou usuário com a área 'ceo' (acesso por sessão).
// O bypass por PUBLISH_KEY (req.viaChave) continua liberado (seed/automação).
// 'compras' e 'manutencao' seguem abertas a qualquer logado.
function podeLista(req, res) {
  if (req.viaChave) return true;
  if (req.params.tipo === 'pendencias' && !podeArea(req.user, 'ceo')) {
    res.status(403).json({ erro: 'Acesso negado: lista restrita à área CEO.' });
    return false;
  }
  return true;
}

app.get('/staff/api/listas/:tipo', requirePublishOrSession, (req, res) => {
  const arq = LISTA_ARQ[req.params.tipo];
  if (!arq) return res.status(400).json({ erro: 'Tipo inválido (compras, manutencao ou pendencias).' });
  if (!podeLista(req, res)) return;
  res.json({ itens: lerJSON(arq, []) });
});

app.post('/staff/api/listas/:tipo', requirePublishOrSession, (req, res) => {
  const arq = LISTA_ARQ[req.params.tipo];
  if (!arq) return res.status(400).json({ erro: 'Tipo inválido.' });
  if (!podeLista(req, res)) return;
  const d = req.body || {};
  const nome = String(d.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do produto/serviço.' });
  const itens = lerJSON(arq, []);
  const refId = d.refId ? String(d.refId) : '';
  if (refId && itens.some(i => i.refId === refId)) return res.json({ ok: true, duplicado: true });
  const item = {
    id: novoId(),
    quantidade: String(d.quantidade || '').trim(),
    nome,
    obs: String(d.obs || '').trim(),
    categoria: String(d.categoria || '').trim().slice(0, 40),  // "área" da pendência (opcional)
    // Via PUBLISH_KEY o padrão é 'whatsapp' (captura da equipe); um seeder pode informar
    // origem explícita no corpo (ex.: 'portal' p/ pendências do CEO). Sessão = sempre 'portal'.
    origem: req.viaChave ? (['portal', 'whatsapp'].includes(String(d.origem || '').trim()) ? String(d.origem).trim() : 'whatsapp') : 'portal',
    quem: req.viaChave ? (String(d.quem || '').trim() || 'WhatsApp') : (req.user.nome || req.user.email || 'staff'),
    refId,
    criadoEm: new Date().toISOString(),
  };
  itens.push(item);
  salvarJSON(arq, itens);
  res.json({ ok: true, item });
});

app.delete('/staff/api/listas/:tipo/:id', requirePublishOrSession, (req, res) => {
  const arq = LISTA_ARQ[req.params.tipo];
  if (!arq) return res.status(400).json({ erro: 'Tipo inválido.' });
  if (!podeLista(req, res)) return;
  const itens = lerJSON(arq, []);
  // remove por id do item OU por refId (id da mensagem do WhatsApp) — facilita a baixa pelo script
  const restantes = itens.filter(i => i.id !== req.params.id && i.refId !== req.params.id);
  // Pendência concluída (portal ✓ ou comando de WhatsApp) vai para o ARQUIVO em vez de sumir.
  // Exclusão SEM concluir (?arquivar=nao) apaga de vez, sem arquivar.
  if (req.params.tipo === 'pendencias' && req.query.arquivar !== 'nao') {
    const baixados = itens.filter(i => i.id === req.params.id || i.refId === req.params.id);
    arquivarPendencias(baixados, req.viaChave ? 'WhatsApp/sistema' : (req.user.nome || req.user.email || 'staff'));
  }
  // Compras: ✓ (concluído) manda para a lista de concluídos; ✕ (?arquivar=nao) exclui sem guardar.
  if (req.params.tipo === 'compras' && req.query.arquivar !== 'nao') {
    const baixados = itens.filter(i => i.id === req.params.id || i.refId === req.params.id);
    concluirCompras(baixados, req.viaChave ? 'WhatsApp/sistema' : (req.user.nome || req.user.email || 'staff'));
  }
  salvarJSON(arq, restantes);
  res.json({ ok: true, removidos: itens.length - restantes.length });
});

// ---- Lista de concluídos das COMPRAS: listar, voltar para a lista ativa e excluir de vez ----
app.get('/staff/api/listas/compras/concluidos', requirePublishOrSession, (req, res) => {
  const todos = lerComprasConcluidos();
  res.json({ itens: todos.slice(0, 200), total: todos.length });
});
// Voltar para a lista de compras. Entra como item NOVO de origem 'portal' (id novo, sem refId):
// é o que faz a captura do WhatsApp puxá-lo de volta para a lista local em vez de apagá-lo de novo.
app.post('/staff/api/listas/compras/concluidos/:id/restaurar', requirePublishOrSession, (req, res) => {
  const todos = lerComprasConcluidos();
  const it = todos.find(i => i.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado nos concluídos.' });
  salvarComprasConcluidos(todos.filter(i => i.id !== req.params.id));
  const ativos = lerJSON(LISTA_ARQ.compras, []);
  const volta = {
    id: novoId(),
    quantidade: String(it.quantidade || ''),
    nome: String(it.nome || ''),
    obs: String(it.obs || ''),
    categoria: String(it.categoria || ''),
    origem: 'portal',
    quem: req.viaChave ? (it.quem || 'WhatsApp') : (req.user.nome || req.user.email || 'staff'),
    refId: '',
    criadoEm: new Date().toISOString(),
  };
  ativos.push(volta);
  salvarJSON(LISTA_ARQ.compras, ativos);
  res.json({ ok: true, item: volta });
});
app.delete('/staff/api/listas/compras/concluidos/:id', requirePublishOrSession, (req, res) => {
  const todos = lerComprasConcluidos();
  const out = todos.filter(i => i.id !== req.params.id);
  salvarComprasConcluidos(out);
  res.json({ ok: true, removidos: todos.length - out.length });
});
app.post('/staff/api/listas/compras/concluidos/limpar', requirePublishOrSession, (req, res) => {
  salvarComprasConcluidos([]);
  res.json({ ok: true });
});

// Editar um item (hoje usado p/ trocar a categoria/área da pendência; também nome/obs).
app.patch('/staff/api/listas/:tipo/:id', requirePublishOrSession, (req, res) => {
  const arq = LISTA_ARQ[req.params.tipo];
  if (!arq) return res.status(400).json({ erro: 'Tipo inválido.' });
  if (!podeLista(req, res)) return;
  const itens = lerJSON(arq, []);
  const it = itens.find(i => i.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  const d = req.body || {};
  if (d.categoria !== undefined) it.categoria = String(d.categoria || '').trim().slice(0, 40);
  if (typeof d.nome === 'string' && d.nome.trim()) it.nome = d.nome.trim();
  if (d.obs !== undefined) it.obs = String(d.obs || '').trim();
  salvarJSON(arq, itens);
  res.json({ ok: true, item: it });
});

// Categorias das pendências — listar (store + as usadas nos itens) e criar nova (admin/CEO ou chave).
function podePend(req, res) {
  if (req.viaChave) return true;
  if (!podeArea(req.user, 'ceo')) { res.status(403).json({ erro: 'Acesso negado: área CEO.' }); return false; }
  return true;
}
app.get('/staff/api/pendencias/categorias', requirePublishOrSession, (req, res) => {
  if (!podePend(req, res)) return;
  const store = lerPendCats();
  const usadas = [...new Set(lerJSON('lista-pendencias.json', []).map(i => i.categoria).filter(Boolean))];
  const extras = usadas.filter(c => !store.some(s => s.toLowerCase() === c.toLowerCase()));
  res.json({ categorias: store.concat(extras) });
});
app.post('/staff/api/pendencias/categorias', requirePublishOrSession, (req, res) => {
  if (!podePend(req, res)) return;
  const nome = String((req.body && req.body.categoria) || '').trim().slice(0, 40);
  if (!nome) return res.status(400).json({ erro: 'Informe a categoria.' });
  const store = lerPendCats();
  if (!store.some(s => s.toLowerCase() === nome.toLowerCase())) { store.push(nome); salvarPendCats(store); }
  res.json({ ok: true, categorias: store });
});
// Arquivo de pendências concluídas — buscar (com filtro), restaurar e excluir.
app.get('/staff/api/pendencias/arquivo', requirePublishOrSession, (req, res) => {
  if (!podePend(req, res)) return;
  const todos = lerPendArquivo();
  const q = semAcento(String(req.query.busca || '')).trim();
  const termos = q ? q.split(/\s+/) : [];
  const filtrados = termos.length
    ? todos.filter(i => { const alvo = semAcento([i.nome, i.categoria, i.obs, i.quem, i.concluidoPor].join(' ')); return termos.every(t => alvo.includes(t)); })
    : todos;
  const cont = {};
  for (const i of filtrados) { const k = (i.categoria || '').trim() || 'Sem área'; cont[k] = (cont[k] || 0) + 1; }
  const porCategoria = Object.entries(cont).sort((a, b) => a[0].localeCompare(b[0], 'pt', { sensitivity: 'base' })).map(([cat, n]) => ({ cat, n }));
  res.json({ itens: filtrados.slice(0, 300), total: todos.length, mostrando: Math.min(filtrados.length, 300), filtrados: filtrados.length, porCategoria });
});
app.delete('/staff/api/pendencias/arquivo/:id', requirePublishOrSession, (req, res) => {
  if (!podePend(req, res)) return;
  const todos = lerPendArquivo();
  const out = todos.filter(i => i.id !== req.params.id);
  salvarPendArquivo(out);
  res.json({ ok: true, removidos: todos.length - out.length });
});
app.post('/staff/api/pendencias/arquivo/:id/restaurar', requirePublishOrSession, (req, res) => {
  if (!podePend(req, res)) return;
  const todos = lerPendArquivo();
  const it = todos.find(i => i.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Não encontrado no arquivo.' });
  salvarPendArquivo(todos.filter(i => i.id !== req.params.id));
  const ativos = lerJSON('lista-pendencias.json', []);
  const limpo = Object.assign({}, it); delete limpo.concluidoEm; delete limpo.concluidoPor;
  ativos.push(limpo);
  salvarJSON('lista-pendencias.json', ativos);
  res.json({ ok: true, item: limpo });
});

// Substituir a lista inteira de categorias (reordenar / corrigir). Admin/CEO ou chave.
app.put('/staff/api/pendencias/categorias', requirePublishOrSession, (req, res) => {
  if (!podePend(req, res)) return;
  const arr = Array.isArray(req.body && req.body.categorias) ? req.body.categorias : null;
  if (!arr) return res.status(400).json({ erro: 'Envie { categorias: [...] }.' });
  const out = []; const vistos = new Set();
  for (const c of arr) {
    const nome = String(c || '').trim().slice(0, 40);
    if (nome && !vistos.has(nome.toLowerCase())) { vistos.add(nome.toLowerCase()); out.push(nome); }
    if (out.length >= 100) break;
  }
  salvarPendCats(out);
  res.json({ ok: true, categorias: out });
});

app.post('/staff/api/listas/:tipo/limpar', requirePublishOrSession, (req, res) => {
  const arq = LISTA_ARQ[req.params.tipo];
  if (!arq) return res.status(400).json({ erro: 'Tipo inválido.' });
  if (!podeLista(req, res)) return;
  if (req.params.tipo === 'pendencias') {
    arquivarPendencias(lerJSON(arq, []), req.viaChave ? 'WhatsApp/sistema' : (req.user.nome || req.user.email || 'staff'));
  }
  salvarJSON(arq, []);
  res.json({ ok: true });
});

// ============================ Bloco de Notas (anotações livres do CEO) ============================
// Post-its de texto livre — o "bloco de notas do celular" dentro do portal. Mesma restrição das
// pendências (área CEO ou admin; PUBLISH_KEY liberado p/ automação). Nota excluída vai para o
// arquivo (?arquivar=nao apaga de vez), como nas pendências.
const NOTAS_ARQ = 'bloco-notas.json';
const NOTAS_ARQUIVO = 'bloco-notas-arquivo.json';
const NOTA_CORES = ['#ffe08a', '#ffd0a6', '#bff0c3', '#a6e6e6', '#c8bdf0', '#f7c0e6', '#f3f0a6', '#a6d8ff', '#ffb3b3', '#c9f0d8', '#e6c9a0', '#d4c5f9'];
const NOTAS_MAX = 500, NOTAS_ARQ_MAX = 500;
const lerNotas = () => { const a = lerJSON(NOTAS_ARQ, []); return Array.isArray(a) ? a : []; };
const lerNotasArquivo = () => { const a = lerJSON(NOTAS_ARQUIVO, []); return Array.isArray(a) ? a : []; };
const corNota = (c) => { const v = String(c || '').trim().toLowerCase(); return NOTA_CORES.find(x => x === v) || NOTA_CORES[0]; };
// fixadas primeiro; depois a mais recentemente mexida
const ordenarNotas = (n) => n.sort((a, b) => (Number(b.fixado) - Number(a.fixado)) ||
  String(b.atualizadoEm || b.criadoEm).localeCompare(String(a.atualizadoEm || a.criadoEm)));
function filtrarNotas(notas, busca) {
  const q = semAcento(String(busca || '')).trim();
  if (!q) return notas;
  const termos = q.split(/\s+/);
  return notas.filter(n => { const alvo = semAcento([n.titulo, n.texto, n.quem].join(' ')); return termos.every(t => alvo.includes(t)); });
}
function podeNota(req, res) {
  if (req.viaChave) return true;
  if (!podeArea(req.user, 'ceo')) { res.status(403).json({ erro: 'Acesso negado: área CEO.' }); return false; }
  return true;
}

// ATENÇÃO: as rotas de /notas/arquivo vêm ANTES das de /notas/:id (o Express casa por ordem).
app.get('/staff/api/notas/arquivo', requirePublishOrSession, (req, res) => {
  if (!podeNota(req, res)) return;
  const todas = lerNotasArquivo();
  const filtradas = filtrarNotas(todas, req.query.busca);
  res.json({ notas: filtradas.slice(0, 200), total: todas.length, filtradas: filtradas.length });
});
app.post('/staff/api/notas/arquivo/:id/restaurar', requirePublishOrSession, (req, res) => {
  if (!podeNota(req, res)) return;
  const todas = lerNotasArquivo();
  const it = todas.find(n => n.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Nota não encontrada no arquivo.' });
  salvarJSON(NOTAS_ARQUIVO, todas.filter(n => n.id !== req.params.id));
  const nota = Object.assign({}, it); delete nota.arquivadoEm; delete nota.arquivadoPor;
  const notas = lerNotas(); notas.push(nota);
  salvarJSON(NOTAS_ARQ, notas);
  res.json({ ok: true, nota });
});
app.delete('/staff/api/notas/arquivo/:id', requirePublishOrSession, (req, res) => {
  if (!podeNota(req, res)) return;
  const todas = lerNotasArquivo();
  const out = todas.filter(n => n.id !== req.params.id);
  salvarJSON(NOTAS_ARQUIVO, out);
  res.json({ ok: true, removidas: todas.length - out.length });
});

app.get('/staff/api/notas', requirePublishOrSession, (req, res) => {
  if (!podeNota(req, res)) return;
  const notas = ordenarNotas(lerNotas());
  const filtradas = filtrarNotas(notas, req.query.busca);
  res.json({ notas: filtradas, total: notas.length, cores: NOTA_CORES });
});

app.post('/staff/api/notas', requirePublishOrSession, (req, res) => {
  if (!podeNota(req, res)) return;
  const d = req.body || {};
  const titulo = String(d.titulo || '').trim().slice(0, 120);
  const texto = String(d.texto || '').trim().slice(0, 8000);
  if (!titulo && !texto) return res.status(400).json({ erro: 'Escreva um título ou o texto da nota.' });
  const notas = lerNotas();
  if (notas.length >= NOTAS_MAX) return res.status(400).json({ erro: `Limite de ${NOTAS_MAX} notas ativas. Arquive alguma antes.` });
  const agora = new Date().toISOString();
  const nota = {
    id: novoId(), titulo, texto,
    cor: corNota(d.cor),
    fixado: !!d.fixado,
    quem: req.viaChave ? (String(d.quem || '').trim() || 'Sistema') : (req.user.nome || req.user.email || 'staff'),
    criadoEm: agora, atualizadoEm: agora,
  };
  notas.push(nota);
  salvarJSON(NOTAS_ARQ, notas);
  res.json({ ok: true, nota });
});

app.patch('/staff/api/notas/:id', requirePublishOrSession, (req, res) => {
  if (!podeNota(req, res)) return;
  const notas = lerNotas();
  const n = notas.find(x => x.id === req.params.id);
  if (!n) return res.status(404).json({ erro: 'Nota não encontrada.' });
  const d = req.body || {};
  if (d.titulo !== undefined) n.titulo = String(d.titulo || '').trim().slice(0, 120);
  if (d.texto !== undefined) n.texto = String(d.texto || '').trim().slice(0, 8000);
  if (d.cor !== undefined) n.cor = corNota(d.cor);
  if (d.fixado !== undefined) n.fixado = !!d.fixado;
  if (!n.titulo && !n.texto) return res.status(400).json({ erro: 'A nota não pode ficar vazia.' });
  n.atualizadoEm = new Date().toISOString();
  salvarJSON(NOTAS_ARQ, notas);
  res.json({ ok: true, nota: n });
});

app.delete('/staff/api/notas/:id', requirePublishOrSession, (req, res) => {
  if (!podeNota(req, res)) return;
  const notas = lerNotas();
  const restantes = notas.filter(n => n.id !== req.params.id);
  if (req.query.arquivar !== 'nao') {
    const saindo = notas.filter(n => n.id === req.params.id);
    if (saindo.length) {
      const arq = lerNotasArquivo();
      const quando = new Date().toISOString();
      const quem = req.viaChave ? 'Sistema' : (req.user.nome || req.user.email || 'staff');
      for (const n of saindo) arq.unshift(Object.assign({}, n, { arquivadoEm: quando, arquivadoPor: quem }));
      if (arq.length > NOTAS_ARQ_MAX) arq.length = NOTAS_ARQ_MAX;
      salvarJSON(NOTAS_ARQUIVO, arq);
    }
  }
  salvarJSON(NOTAS_ARQ, restantes);
  res.json({ ok: true, removidas: notas.length - restantes.length });
});

// ============================ Mural da equipe (comunicação interna) ============================
// Canal de comunicação entre membros da equipe e agentes: avisos, recados e coordenação.
// Qualquer usuário logado lê e posta; agentes (Claude) postam via PUBLISH_KEY. Mensagens podem
// ser marcadas para uma área (chip) e FIXADAS (só admin/agente) para avisos importantes.
// Dados em mural.json (DATA_DIR); mantém as últimas 500 mensagens.
const MURAL_MAX = 500;

app.get('/staff/api/mural', requirePublishOrSession, (req, res) => {
  const msgs = lerJSON('mural.json', []);
  // fixadas primeiro, depois mais recentes
  const orden = [...msgs].sort((a, b) => (b.fixado - a.fixado) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
  res.json({ mensagens: orden });
});

app.post('/staff/api/mural', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const texto = String(d.texto || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Escreva a mensagem.' });
  if (texto.length > 4000) return res.status(400).json({ erro: 'Mensagem acima de 4000 caracteres.' });
  const area = String(d.area || '').trim();
  if (area && !AREAS.some(a => a.id === area)) return res.status(400).json({ erro: 'Área inválida.' });
  const ehAdmin = req.viaChave || (req.user && req.user.papel === 'admin');
  const msgs = lerJSON('mural.json', []);
  const msg = {
    id: novoId(),
    texto,
    area,                                        // '' = geral
    fixado: ehAdmin ? !!d.fixado : false,        // fixar: só admin ou agente (via chave)
    quem: req.viaChave ? (String(d.quem || '').trim() || 'Agente Claude') : (req.user.nome || req.user.email || 'staff'),
    autorEmail: req.viaChave ? '' : (req.user.email || ''),
    agente: !!req.viaChave,
    criadoEm: new Date().toISOString(),
    respostas: [],
  };
  msgs.push(msg);
  while (msgs.length > MURAL_MAX) msgs.shift();
  salvarJSON('mural.json', msgs);
  // Aviso FIXADO notifica a equipe por push (best-effort; só se o VAPID estiver configurado).
  if (msg.fixado) enviarPushStaff({ title: 'Villela Stay — aviso da equipe', body: (msg.quem + ': ' + msg.texto).slice(0, 160), url: '/staff/' }, msg.area || null).catch(() => {});
  res.json({ ok: true, mensagem: msg });
});

app.post('/staff/api/mural/:id/resposta', requirePublishOrSession, (req, res) => {
  const texto = String((req.body || {}).texto || '').trim();
  if (!texto) return res.status(400).json({ erro: 'Escreva a resposta.' });
  if (texto.length > 2000) return res.status(400).json({ erro: 'Resposta acima de 2000 caracteres.' });
  const msgs = lerJSON('mural.json', []);
  const m = msgs.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ erro: 'Mensagem não encontrada.' });
  m.respostas = m.respostas || [];
  m.respostas.push({
    id: novoId(), texto,
    quem: req.viaChave ? (String((req.body || {}).quem || '').trim() || 'Agente Claude') : (req.user.nome || req.user.email || 'staff'),
    autorEmail: req.viaChave ? '' : (req.user.email || ''),
    criadoEm: new Date().toISOString(),
  });
  salvarJSON('mural.json', msgs);
  res.json({ ok: true, mensagem: m });
});

app.patch('/staff/api/mural/:id', requirePublishOrSession, (req, res) => {
  const ehAdmin = req.viaChave || (req.user && req.user.papel === 'admin');
  if (!ehAdmin) return res.status(403).json({ erro: 'Só admin pode fixar/desafixar.' });
  const msgs = lerJSON('mural.json', []);
  const m = msgs.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ erro: 'Mensagem não encontrada.' });
  if ((req.body || {}).fixado != null) m.fixado = !!req.body.fixado;
  salvarJSON('mural.json', msgs);
  res.json({ ok: true, mensagem: m });
});

app.delete('/staff/api/mural/:id', requirePublishOrSession, (req, res) => {
  const msgs = lerJSON('mural.json', []);
  const ehAdmin = req.viaChave || (req.user && req.user.papel === 'admin');
  const dono = (x) => ehAdmin || (req.user && x.autorEmail && x.autorEmail === req.user.email);
  const respostaId = String(req.query.resposta || '');
  if (respostaId) {
    const m = msgs.find(x => x.id === req.params.id);
    if (!m) return res.status(404).json({ erro: 'Mensagem não encontrada.' });
    const r = (m.respostas || []).find(x => x.id === respostaId);
    if (!r) return res.status(404).json({ erro: 'Resposta não encontrada.' });
    if (!dono(r)) return res.status(403).json({ erro: 'Só o autor ou admin pode excluir.' });
    m.respostas = m.respostas.filter(x => x.id !== respostaId);
    salvarJSON('mural.json', msgs);
    return res.json({ ok: true });
  }
  const m = msgs.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ erro: 'Mensagem não encontrada.' });
  if (!dono(m)) return res.status(403).json({ erro: 'Só o autor ou admin pode excluir.' });
  salvarJSON('mural.json', msgs.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ============================ ONDA 2: Cockpit, Limpezas de hoje, Chamados e Backup ============================

// Data de HOJE no fuso de Brasília (hojeISO() é UTC e viraria o dia às 21h locais).
function hojeBrasil() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }

// Espelhamento de ocupação: alugar um espaço INTEIRO bloqueia (ocupa) os componentes que o compõem,
// recursivamente. Mesma hierarquia dos relatórios (stays/dashboard-visual.ps1 e boletim-ops.ps1) —
// MANTER EM SINCRONIA. Pai -> códigos de anúncio que ele bloqueia quando alugado.
const FILHOS_OCUP = {
  GD01H: ['UH01H', 'UH05H', 'UH06H', 'UH04H', 'UH03H'], // Casa Modernista -> Felipe, Master, Pedro, Sofia, Família
  GD03H: ['GG04I', 'PL02I'],                            // Gran Villela -> Villa Kubitschek, Villa Catetinho
  GG04I: ['VH01H', 'VH02H'],                            // Villa Kubitschek -> Flat da Família, Flat dos Amigos
  VH01H: ['UF06H', 'UD03H'],                            // Flat da Família -> Suíte do Amor, Flat dos Solteiros
  VH02H: ['UF05H', 'UD09H'],                            // Flat dos Amigos -> Suíte do Chef, Suíte do Renato Russo
  PL02I: ['UF07H', 'UF01H', 'UF08H'],                   // Villa Catetinho -> Oscar, Burle Marx, Cássia Eller
};
const DESC_OCUP = {}; // pai -> Set de descendentes transitivos (bloqueados)
for (const pai of Object.keys(FILHOS_OCUP)) {
  const seen = new Set(), fila = [...FILHOS_OCUP[pai]];
  while (fila.length) { const c = fila.shift(); if (!seen.has(c)) { seen.add(c); if (FILHOS_OCUP[c]) fila.push(...FILHOS_OCUP[c]); } }
  DESC_OCUP[pai] = seen;
}
const N_DESC_OCUP = {}; for (const p of Object.keys(DESC_OCUP)) N_DESC_OCUP[p] = DESC_OCUP[p].size;
// Espelhamento PARA CIMA: alugar um componente (filho) bloqueia os espaços que o contêm (ancestrais),
// pois eles não podem mais ser vendidos inteiros. Ex.: alugar Villa Kubitschek (GG04I) ou Villa Catetinho
// (PL02I) bloqueia a Gran Villela (GD03H). NÃO bloqueia irmãos (a outra casa do compound segue à venda).
const PAI_OCUP = {}; // filho -> pai direto
for (const pai of Object.keys(FILHOS_OCUP)) for (const f of FILHOS_OCUP[pai]) PAI_OCUP[f] = pai;
const ANC_OCUP = {}; // código -> Set de ancestrais transitivos (bloqueados quando ele é alugado)
for (const cod of Object.keys(PAI_OCUP)) {
  const anc = new Set(); let p = PAI_OCUP[cod];
  while (p) { anc.add(p); p = PAI_OCUP[p]; }
  ANC_OCUP[cod] = anc;
}
const N_ANC_OCUP = {}; for (const c of Object.keys(ANC_OCUP)) N_ANC_OCUP[c] = ANC_OCUP[c].size;
// Espelho MÚTUO: anúncios que são o MESMO imóvel físico (Casa 4 = YV01I e GI01I, 2 anúncios do mesmo
// espaço). Alugar um bloqueia o outro. Sem essa relação, a ocupação da rede travava em ~90% (18/20).
const ESPELHO_OCUP = { YV01I: ['GI01I'], GI01I: ['YV01I'] };
const N_ESP_OCUP = {}; for (const c of Object.keys(ESPELHO_OCUP)) N_ESP_OCUP[c] = ESPELHO_OCUP[c].length;
// Acrescenta ao conjunto de códigos ocupados os anúncios bloqueados pelo espelhamento — nas DUAS direções
// (pai alugado ocupa os componentes/descendentes E componente alugado ocupa os espaços que o contêm/ancestrais)
// mais o espelho mútuo do mesmo imóvel. Itera sobre o SNAPSHOT inicial: os códigos acrescidos não são
// reprocessados, então bloquear o pai NÃO cascateia de volta para os irmãos. (Restrito ao universo ativo.)
function expandirBloqueados(ocupCodes, universo) {
  for (const cod of [...ocupCodes]) {
    const desc = DESC_OCUP[cod]; if (desc) for (const d of desc) if (!universo || universo.has(d)) ocupCodes.add(d);
    const anc = ANC_OCUP[cod]; if (anc) for (const a of anc) if (!universo || universo.has(a)) ocupCodes.add(a);
    const esp = ESPELHO_OCUP[cod]; if (esp) for (const e of esp) if (!universo || universo.has(e)) ocupCodes.add(e);
  }
}

// ---- Cockpit (home): KPIs vivos do dia, agregados no servidor (1 chamada do front) ----
// Ocupação de hoje considera o espelhamento: espaço inteiro alugado ocupa seus componentes (ver FILHOS_OCUP).
let _cacheCockpit = { quando: 0, dia: '', stays: null };
async function cockpitStays() {
  const dia = hojeBrasil();
  if (_cacheCockpit.stays && _cacheCockpit.dia === dia && Date.now() - _cacheCockpit.quando < 5 * 60 * 1000)
    return _cacheCockpit.stays;
  const listings = await staysPaginado('/content/listings', {});
  const ativos = listings.filter(l => l.status === 'active');
  const mapa = {}; ativos.forEach(l => { mapa[l._id] = { codigo: l.id, titulo: l.internalName || (l._mstitle && l._mstitle.pt_BR) || l.id }; });
  // 'included' pega estadias que OCUPAM a noite de hoje (p/ ocupação e chegadas). As SAÍDAS de hoje
  // NÃO estão aí (o dia do check-out não é noite ocupada) → consulta 'departure' à parte (ver stays-api.md).
  const [incluidas, partidas] = await Promise.all([
    staysPaginado('/booking/reservations', { from: dia, to: dia, dateType: 'included' }),
    staysPaginado('/booking/reservations', { from: dia, to: dia, dateType: 'departure' }),
  ]);
  const doDia = incluidas.filter(r => r.type !== 'canceled');
  const estadias = doDia.filter(r => r.type !== 'blocked' && r.type !== 'maintenance');
  const chegadas = estadias.filter(r => r.checkInDate === dia);
  const saidas = partidas.filter(r => r.type !== 'canceled' && r.type !== 'blocked' && r.type !== 'maintenance' && r.checkOutDate === dia);
  // Ocupação REAL: converte para código e um espaço inteiro alugado ocupa seus componentes (espelhamento).
  const universo = new Set(ativos.map(l => l.id));
  const ocupadas = new Set();
  for (const r of estadias) if (r.checkInDate <= dia && r.checkOutDate > dia) {
    const cod = (mapa[r._idlisting] || {}).codigo;
    if (cod && universo.has(cod)) ocupadas.add(cod);
  }
  expandirBloqueados(ocupadas, universo);
  const cache = await resolverClientes([...chegadas, ...saidas].map(r => r._idclient));
  const resumo = (r) => ({
    imovel: (mapa[r._idlisting] || {}).codigo || '—',
    imovelTitulo: (mapa[r._idlisting] || {}).titulo || '—',
    hospede: (r._idclient && cache[r._idclient]) || '—',
    hospedes: r.guests || null, checkIn: r.checkInDate, checkOut: r.checkOutDate,
  });
  // Receita do mês corrente (competência por check-in, mesma convenção do briefing do CEO)
  const [ano, mes] = dia.split('-').map(Number);
  const ini = `${dia.slice(0, 7)}-01`;
  const fim = `${dia.slice(0, 7)}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
  const doMes = (await staysPaginado('/booking/reservations', { from: ini, to: fim, dateType: 'arrival' }))
    .filter(r => r.type !== 'canceled' && r.type !== 'blocked' && r.type !== 'maintenance');
  let receita = 0, comissao = 0;
  for (const r of doMes) {
    receita += (r.price && r.price._f_total) || 0;
    comissao += (r.partner && r.partner.commission && r.partner.commission._mcval && r.partner.commission._mcval.BRL) || 0;
  }
  const stays = {
    dia, totalUnidades: ativos.length,
    chegadas: chegadas.map(resumo), saidas: saidas.map(resumo),
    ocupadas: ocupadas.size,
    ocupacaoPct: ativos.length ? Math.round(100 * ocupadas.size / ativos.length) : 0,
    mes: { receita: Math.round(receita), receitaLiquida: Math.round(receita - comissao), reservas: doMes.length },
  };
  _cacheCockpit = { quando: Date.now(), dia, stays };
  return stays;
}

app.get('/staff/api/cockpit', requireAuth, async (req, res) => {
  const dia = hojeBrasil();
  const out = { dia, geradoEm: new Date().toISOString() };
  try {
    const s = await cockpitStays();
    out.hoje = { chegadas: s.chegadas, saidas: s.saidas, ocupadas: s.ocupadas, totalUnidades: s.totalUnidades, ocupacaoPct: s.ocupacaoPct };
    // Receita: só para quem enxerga finanças (ceo/financeiro/revenue; admin vê tudo)
    if (['ceo', 'financeiro', 'revenue'].some(a => podeArea(req.user, a))) out.mes = s.mes;
  } catch (e) { console.error('[cockpit stays]', e.message); out.staysIndisponivel = true; }
  try {
    out.listas = {
      compras: lerJSON('lista-compras.json', []).length,
      manutencao: lerJSON('lista-manutencao.json', []).length,
    };
    if (podeArea(req.user, 'ceo')) {
      out.listas.pendencias = lerJSON('lista-pendencias.json', []).length;
      out.listas.notas = lerJSON('bloco-notas.json', []).length;
    }
    out.chamadosAbertos = lerJSON('manutencao-chamados.json', []).filter(c => c.status !== 'concluido').length;
    if (podeArea(req.user, 'vendas'))
      out.followupsVencidos = lerContatos().filter(c =>
        c.estagio !== 'perdido' && c.proximaAcao && c.proximaAcao.data && c.proximaAcao.data <= dia).length;
    const conf = (lerJSON('limpezas-confirmadas.json', {})[dia]) || {};
    out.limpezasConfirmadas = Object.keys(conf).length;
    out.muralFixadas = lerJSON('mural.json', []).filter(m => m.fixado).slice(-3).reverse()
      .map(m => ({ id: m.id, texto: m.texto.slice(0, 200), quem: m.quem, criadoEm: m.criadoEm }));
    const pedidos = lerJSON('pedidos-hospede.json', []);
    out.pedidosHospedeAbertos = pedidos.filter(p => !['concluido', 'recusado', 'cancelado'].includes(p.status)).length;
  } catch (e) { console.error('[cockpit locais]', e.message); }
  res.json(out);
});

// ---- Limpezas de hoje: espelho do painel de limpeza com confirmação pelo portal ----
// Tarefas do dia = saídas (faxina pós-checkout) + chegadas (preparação pré-checkin), da Stays.
// Confirmações em limpezas-confirmadas.json: { 'yyyy-mm-dd': { 'CODIGO|tipo': {quem, quando} } }.
app.get('/staff/api/limpezas', requirePublishOrSession, async (req, res) => {
  try {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dia || '') ? req.query.dia : hojeBrasil();
    const listings = await staysPaginado('/content/listings', {});
    const mapa = {}; listings.forEach(l => { mapa[l._id] = { codigo: l.id, titulo: l.internalName || (l._mstitle && l._mstitle.pt_BR) || l.id }; });
    // Duas consultas: chegadas (arrival) e saídas (departure) do dia. NÃO usar 'included' aqui —
    // o dia do check-out não é noite ocupada, então 'included' [dia,dia] PERDE as faxinas pós-saída.
    const [chegadas, saidas] = await Promise.all([
      staysPaginado('/booking/reservations', { from: dia, to: dia, dateType: 'arrival' }),
      staysPaginado('/booking/reservations', { from: dia, to: dia, dateType: 'departure' }),
    ]);
    const porId = {};
    for (const r of [...chegadas, ...saidas]) { if (!['canceled', 'blocked', 'maintenance'].includes(r.type)) porId[r._id] = r; }
    const doDia = Object.values(porId);
    const cache = await resolverClientes(doDia.filter(r => r.checkInDate === dia || r.checkOutDate === dia).map(r => r._idclient));
    const conf = (lerJSON('limpezas-confirmadas.json', {})[dia]) || {};
    const tarefas = [];
    for (const r of doDia) {
      const im = mapa[r._idlisting] || { codigo: '—', titulo: '—' };
      const hospede = (r._idclient && cache[r._idclient]) || '—';
      if (r.checkOutDate === dia) tarefas.push({ tipo: 'faxina', rotulo: 'Faxina pós-checkout', codigo: im.codigo, titulo: im.titulo, hospede, hospedes: r.guests || null });
      if (r.checkInDate === dia) tarefas.push({ tipo: 'preparacao', rotulo: 'Preparação pré-checkin', codigo: im.codigo, titulo: im.titulo, hospede, hospedes: r.guests || null });
    }
    // faxinas primeiro (a saída libera a preparação), depois por código
    tarefas.sort((a, b) => (a.tipo === b.tipo ? a.codigo.localeCompare(b.codigo) : (a.tipo === 'faxina' ? -1 : 1)));
    for (const t of tarefas) { const c = conf[`${t.codigo}|${t.tipo}`]; t.concluida = !!c; t.quem = c ? c.quem : ''; t.quando = c ? c.quando : ''; }
    res.set('Cache-Control', 'no-store');
    res.json({ dia, tarefas, concluidas: tarefas.filter(t => t.concluida).length });
  } catch (e) { console.error('[limpezas]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});

app.post('/staff/api/limpezas/confirmar', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(d.dia || '') ? d.dia : hojeBrasil();
  const codigo = String(d.codigo || '').trim();
  const tipo = d.tipo === 'preparacao' ? 'preparacao' : 'faxina';
  if (!codigo) return res.status(400).json({ erro: 'Informe o código do imóvel.' });
  const tudo = lerJSON('limpezas-confirmadas.json', {});
  const doDia = tudo[dia] || {};
  const chave = `${codigo}|${tipo}`;
  if (d.desfazer) delete doDia[chave];
  else doDia[chave] = { quem: req.viaChave ? (String(d.quem || '').trim() || 'WhatsApp') : (req.user.nome || req.user.email || 'staff'), quando: new Date().toISOString() };
  tudo[dia] = doDia;
  // poda registros com mais de 60 dias
  const limite = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(tudo)) if (k < limite) delete tudo[k];
  salvarJSON('limpezas-confirmadas.json', tudo);
  res.json({ ok: true, dia, confirmadas: Object.keys(doDia).length });
});

// Limpezas da SEMANA (domingo→domingo, mesma janela da agenda semanal do WhatsApp). Uma consulta
// arrival + uma departure para a semana toda; agrupa por dia. Mesmo shape de tarefa do endpoint diário.
const _isoAddDias = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const _isoDow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay(); // 0=domingo
app.get('/staff/api/limpezas/semana', requirePublishOrSession, async (req, res) => {
  try {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dia || '') ? req.query.dia : hojeBrasil();
    const inicio = _isoAddDias(base, -_isoDow(base));   // domingo desta semana
    const fim = _isoAddDias(inicio, 7);                 // domingo seguinte (fim da janela)
    const listings = await staysPaginado('/content/listings', {});
    const mapa = {}; listings.forEach(l => { mapa[l._id] = { codigo: l.id, titulo: l.internalName || (l._mstitle && l._mstitle.pt_BR) || l.id }; });
    const ativa = r => !['canceled', 'blocked', 'maintenance'].includes(r.type);
    const [chegadas, saidas] = await Promise.all([
      staysPaginado('/booking/reservations', { from: inicio, to: fim, dateType: 'arrival' }),
      staysPaginado('/booking/reservations', { from: inicio, to: fim, dateType: 'departure' }),
    ]);
    const relevantes = [...chegadas, ...saidas].filter(ativa);
    const cache = await resolverClientes(relevantes.map(r => r._idclient));
    const conf = lerJSON('limpezas-confirmadas.json', {});
    const dias = [];
    let totalTarefas = 0, totalConcluidas = 0;
    for (let i = 0; i < 7; i++) {
      const ds = _isoAddDias(inicio, i);
      const confDia = conf[ds] || {};
      const tarefas = [];
      for (const r of saidas) if (ativa(r) && r.checkOutDate === ds) {
        const im = mapa[r._idlisting] || { codigo: '—', titulo: '—' };
        tarefas.push({ tipo: 'faxina', rotulo: 'Faxina pós-checkout', codigo: im.codigo, titulo: im.titulo, hospede: (r._idclient && cache[r._idclient]) || '—', hospedes: r.guests || null });
      }
      for (const r of chegadas) if (ativa(r) && r.checkInDate === ds) {
        const im = mapa[r._idlisting] || { codigo: '—', titulo: '—' };
        tarefas.push({ tipo: 'preparacao', rotulo: 'Preparação pré-checkin', codigo: im.codigo, titulo: im.titulo, hospede: (r._idclient && cache[r._idclient]) || '—', hospedes: r.guests || null });
      }
      tarefas.sort((a, b) => (a.tipo === b.tipo ? a.codigo.localeCompare(b.codigo) : (a.tipo === 'faxina' ? -1 : 1)));
      for (const t of tarefas) { const c = confDia[`${t.codigo}|${t.tipo}`]; t.concluida = !!c; t.quem = c ? c.quem : ''; t.quando = c ? c.quando : ''; }
      totalTarefas += tarefas.length; totalConcluidas += tarefas.filter(t => t.concluida).length;
      dias.push({ dia: ds, dow: i, tarefas });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ inicio, fim: _isoAddDias(fim, -1), dias, totalTarefas, totalConcluidas });
  } catch (e) { console.error('[limpezas/semana]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});

// ---- Manutenção: HUB ÚNICO (chamados) — portal/app staff + WhatsApp + hóspede ----
// Fluxo: aberto → agendado → em_execucao → concluido. WhatsApp/atalho pode CONCLUIR com campos
// incompletos (documentado=false, completa depois); ARQUIVAR de vez (documentado=true) exige os
// campos de baixa. Concluídos ficam no arquivo (ordem cronológica, busca em qualquer campo).
const CHAMADO_STATUS = ['aberto', 'agendado', 'em_execucao', 'concluido'];
const CHAMADO_TIPOS = ['hidraulico', 'eletrico', 'marcenaria', 'pintura', 'reparo', 'ar_condicionado', 'concessionaria_agua', 'concessionaria_luz'];
const soDig = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const numBR = (v) => (v != null && v !== '' ? Number(String(v).replace(',', '.')) || 0 : 0);

// Campos que faltam para ARQUIVAR (documentar) um chamado. Despesas aceitam 0 (não exigidas).
function faltamBaixaChamado(ch) {
  const f = [];
  if (!CHAMADO_TIPOS.includes(ch.tipo)) f.push('tipo');
  if (!String(ch.tecnico || '').trim()) f.push('tecnico');
  if (!String(ch.tecnicoTelefone || '').trim()) f.push('tecnicoTelefone');
  if (!String(ch.comoResolvido || '').trim()) f.push('comoResolvido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ch.dataResolucao || '')) f.push('dataResolucao');
  return f;
}

// Normaliza um chamado (defaults dos campos novos p/ registros antigos) — leitura tolerante.
function normChamado(ch) {
  return {
    id: ch.id, titulo: ch.titulo || '', casa: ch.casa || '', descricao: ch.descricao || '',
    tipo: CHAMADO_TIPOS.includes(ch.tipo) ? ch.tipo : '',
    status: CHAMADO_STATUS.includes(ch.status) ? ch.status : 'aberto',
    tecnico: ch.tecnico || '', tecnicoTelefone: ch.tecnicoTelefone || '', tecnicoId: ch.tecnicoId || '',
    comoResolvido: ch.comoResolvido || '', dataResolucao: ch.dataResolucao || '',
    despMaterial: ch.despMaterial != null ? Number(ch.despMaterial) || 0 : 0,
    despMaoObra: ch.despMaoObra != null ? Number(ch.despMaoObra) || 0 : 0,
    despDeslocamento: ch.despDeslocamento != null ? Number(ch.despDeslocamento) || 0 : 0,
    custo: ch.custo != null && ch.custo !== '' ? Number(ch.custo) || 0 : null,
    proximaVisita: ch.proximaVisita || '', proximaVisitaAgendada: ch.proximaVisitaAgendada || '',
    periodicoFreqMeses: ch.periodicoFreqMeses != null ? Number(ch.periodicoFreqMeses) || 0 : 0, periodicoRegistrado: !!ch.periodicoRegistrado,
    ativoId: ch.ativoId || '', solicitante: ch.solicitante || '', origem: ch.origem || 'portal',
    refId: ch.refId || '', documentado: !!ch.documentado,
    quem: ch.quem || '', criadoEm: ch.criadoEm || '', atualizadoEm: ch.atualizadoEm || '', concluidoEm: ch.concluidoEm || null,
  };
}
function custoTotalChamado(ch) { return numBR(ch.despMaterial) + numBR(ch.despMaoObra) + numBR(ch.despDeslocamento); }

// Lança a despesa do chamado no DRE/custos por imóvel (categoria manutenção). Dedupe por refId
// 'chamado:<id>' (re-editar atualiza, não duplica). Só lança com total>0, mês e imóvel válidos.
function lancarCustoManutencao(ch) {
  try {
    const total = custoTotalChamado(ch);
    const mes = String(ch.dataResolucao || '').slice(0, 7);
    const imovel = String(ch.casa || '').trim();
    const refId = 'chamado:' + ch.id;
    const custos = lerJSON('custos-imovel.json', []);
    const idx = custos.findIndex(c => c.refId === refId);
    if (!(total > 0) || !/^\d{4}-\d{2}$/.test(mes) || !imovel) {
      if (idx >= 0) { custos.splice(idx, 1); salvarJSON('custos-imovel.json', custos); }  // deixou de ter despesa
      return;
    }
    const item = {
      id: idx >= 0 ? custos[idx].id : novoId(), mes, imovel, categoria: 'manutencao', valor: total,
      obs: ('Manut.: ' + (ch.titulo || '') + (ch.tecnico ? ' — ' + ch.tecnico : '') +
            ' (mat ' + numBR(ch.despMaterial) + ' + mão ' + numBR(ch.despMaoObra) + ' + desl ' + numBR(ch.despDeslocamento) + ')').slice(0, 200),
      refId, quem: 'manutencao', criadoEm: idx >= 0 ? custos[idx].criadoEm : new Date().toISOString(),
    };
    if (idx >= 0) custos[idx] = item; else custos.push(item);
    salvarJSON('custos-imovel.json', custos);
  } catch (e) { console.error('[manut->custo]', e.message); }
}

// Registra/atualiza o técnico no cadastro do portal (dedupe por telefone). Best-effort.
function upsertTecnico(nome, telefone, especialidade) {
  try {
    nome = String(nome || '').trim(); const tel = soDig(telefone);
    if (!nome && !tel) return null;
    const tecs = lerJSON('tecnicos-manutencao.json', []);
    let t = tel ? tecs.find(x => soDig(x.telefone) === tel) : tecs.find(x => x.nome === nome);
    if (t) {
      if (nome) t.nome = nome;
      if (telefone) t.telefone = String(telefone).trim();
      if (especialidade && !(t.especialidades || []).includes(especialidade)) t.especialidades = [...(t.especialidades || []), especialidade];
      t.atualizadoEm = new Date().toISOString();
    } else {
      t = { id: novoId(), nome, telefone: String(telefone || '').trim(), especialidades: especialidade ? [especialidade] : [], obs: '', criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
      tecs.push(t);
    }
    salvarJSON('tecnicos-manutencao.json', tecs);
    return t;
  } catch (e) { console.error('[upsertTecnico]', e.message); return null; }
}

// 4b: "próxima visita" do chamado → pedido de evento no Google Calendar (a rotina Claude
// agenda-processar-pedidos efetiva). Dedupe por data já agendada (proximaVisitaAgendada).
function agendarVisitaChamado(ch) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ch.proximaVisita || '')) return;
    if (ch.proximaVisitaAgendada === ch.proximaVisita) return;
    const pedidos = lerJSON('agenda-pedidos.json', []);
    pedidos.push({
      id: novoId(), acao: 'criar',
      titulo: '🛠️ Manutenção: ' + (ch.titulo || 'visita técnica') + (ch.tecnico ? ' — ' + ch.tecnico : ''),
      data: ch.proximaVisita, hora: '', duracaoMin: 60,
      descricao: [ch.casa ? 'Casa: ' + ch.casa : '', ch.tecnico ? 'Técnico: ' + ch.tecnico + (ch.tecnicoTelefone ? ' (' + ch.tecnicoTelefone + ')' : '') : '', ch.comoResolvido ? 'Serviço: ' + ch.comoResolvido : ''].filter(Boolean).join(' · '),
      local: ch.casa || '', eventoId: '', refPedidoId: 'chamado:' + ch.id,
      status: 'pendente', quem: 'manutencao', criadoEm: new Date().toISOString(), processadoEm: null, resultado: '',
    });
    salvarJSON('agenda-pedidos.json', pedidos);
    ch.proximaVisitaAgendada = ch.proximaVisita;
  } catch (e) { console.error('[chamado->agenda]', e.message); }
}

// GET: ?busca= (palavra em qualquer campo) ?status= ?arquivo=1 (só concluídos). Devolve abertos e
// arquivados (concluídos, mais recentes primeiro) já separados p/ a tela.
app.get('/staff/api/manutencao/chamados', requirePublishOrSession, (req, res) => {
  let lista = lerJSON('manutencao-chamados.json', []).map(normChamado);
  const busca = tokensBusca(req.query.busca);
  if (busca.length) {
    lista = lista.filter(ch => {
      const alvo = semAcento([ch.titulo, ch.casa, ch.descricao, ch.tipo, ch.tecnico, ch.tecnicoTelefone, ch.comoResolvido, ch.solicitante, ch.origem, ch.quem].join(' ').toLowerCase());
      return busca.every(t => alvo.includes(t));
    });
  }
  if (CHAMADO_STATUS.includes(req.query.status)) lista = lista.filter(ch => ch.status === req.query.status);
  const abertos = lista.filter(ch => ch.status !== 'concluido');
  const arquivados = lista.filter(ch => ch.status === 'concluido')
    .sort((a, b) => String(b.concluidoEm || b.dataResolucao || b.criadoEm).localeCompare(String(a.concluidoEm || a.dataResolucao || a.criadoEm)));
  // 'chamados' (compat) = tudo; abertos/arquivados = separados para a tela nova.
  res.json({ chamados: lista, abertos, arquivados, tipos: CHAMADO_TIPOS });
});

app.post('/staff/api/manutencao/chamados', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const titulo = String(d.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'Informe o título do chamado.' });
  const chamados = lerJSON('manutencao-chamados.json', []);
  // dedupe por refId (WhatsApp/hóspede reenviando o mesmo pedido)
  const refId = d.refId ? String(d.refId).trim() : '';
  if (refId) { const ex = chamados.find(c => c.refId === refId); if (ex) return res.json({ ok: true, duplicado: true, chamado: normChamado(ex) }); }
  const ch = {
    id: novoId(), titulo,
    casa: String(d.casa || '').trim(),
    descricao: String(d.descricao || '').trim(),
    tipo: CHAMADO_TIPOS.includes(d.tipo) ? d.tipo : '',
    status: CHAMADO_STATUS.includes(d.status) ? d.status : 'aberto',
    tecnico: String(d.tecnico || '').trim(),
    tecnicoTelefone: String(d.tecnicoTelefone || '').trim(),
    tecnicoId: String(d.tecnicoId || '').trim(),
    comoResolvido: String(d.comoResolvido || '').trim(),
    dataResolucao: /^\d{4}-\d{2}-\d{2}$/.test(d.dataResolucao || '') ? d.dataResolucao : '',
    despMaterial: numBR(d.despMaterial), despMaoObra: numBR(d.despMaoObra), despDeslocamento: numBR(d.despDeslocamento),
    custo: d.custo != null && d.custo !== '' ? Number(d.custo) || 0 : null,
    proximaVisita: /^\d{4}-\d{2}-\d{2}$/.test(d.proximaVisita || '') ? d.proximaVisita : '',
    proximaVisitaAgendada: '',
    periodicoFreqMeses: numBR(d.periodicoFreqMeses), periodicoRegistrado: false,
    ativoId: String(d.ativoId || '').trim(),
    solicitante: String(d.solicitante || '').trim(),
    origem: req.viaChave ? (String(d.origem || '').trim() || 'agente') : 'portal',
    refId,
    documentado: false,
    quem: req.viaChave ? (String(d.quem || '').trim() || 'Agente Claude') : (req.user.nome || req.user.email || 'staff'),
    criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(), concluidoEm: null,
  };
  ch.custo = custoTotalChamado(ch) || ch.custo;
  chamados.push(ch);
  salvarJSON('manutencao-chamados.json', chamados);
  res.json({ ok: true, chamado: normChamado(ch) });
});

app.patch('/staff/api/manutencao/chamados/:id', requirePublishOrSession, (req, res) => {
  const chamados = lerJSON('manutencao-chamados.json', []);
  const ch = chamados.find(x => x.id === req.params.id);
  if (!ch) return res.status(404).json({ erro: 'Chamado não encontrado.' });
  const d = req.body || {};
  // campos texto
  for (const campo of ['titulo', 'casa', 'descricao', 'tecnico', 'tecnicoTelefone', 'tecnicoId', 'comoResolvido', 'ativoId', 'solicitante']) if (d[campo] != null) ch[campo] = String(d[campo]).trim();
  if (d.tipo != null) ch.tipo = CHAMADO_TIPOS.includes(d.tipo) ? d.tipo : '';
  if (d.dataResolucao != null) ch.dataResolucao = /^\d{4}-\d{2}-\d{2}$/.test(d.dataResolucao) ? d.dataResolucao : '';
  if (d.proximaVisita != null) ch.proximaVisita = /^\d{4}-\d{2}-\d{2}$/.test(d.proximaVisita) ? d.proximaVisita : '';
  for (const campo of ['despMaterial', 'despMaoObra', 'despDeslocamento', 'periodicoFreqMeses']) if (d[campo] !== undefined) ch[campo] = numBR(d[campo]);
  if (d.periodicoRegistrado != null) ch.periodicoRegistrado = !!d.periodicoRegistrado;
  if (d.custo !== undefined) ch.custo = d.custo === '' || d.custo == null ? null : Number(d.custo) || 0;
  if (d.status && CHAMADO_STATUS.includes(d.status)) {
    ch.status = d.status;
    if (d.status === 'concluido') { if (!ch.concluidoEm) ch.concluidoEm = new Date().toISOString(); }
    else { ch.concluidoEm = null; ch.documentado = false; }  // reabriu
  }
  // custo total = soma das despesas (quando houver); senão mantém o custo manual
  const totalDesp = custoTotalChamado(ch);
  if (totalDesp > 0) ch.custo = totalDesp;
  // ARQUIVAR (documentar): exige os campos de baixa
  if (d.documentado === true) {
    const faltam = faltamBaixaChamado(ch);
    if (faltam.length) return res.status(400).json({ erro: 'Para arquivar, preencha: ' + faltam.join(', ') + '.', faltam });
    ch.status = 'concluido'; if (!ch.concluidoEm) ch.concluidoEm = new Date().toISOString();
    ch.documentado = true;
    upsertTecnico(ch.tecnico, ch.tecnicoTelefone, ch.tipo);
    lancarCustoManutencao(ch);
  } else if (d.documentado === false) {
    ch.documentado = false;
  } else if (ch.documentado) {
    // já documentado e editaram despesas/técnico → mantém DRE e cadastro em dia
    lancarCustoManutencao(ch);
    if (ch.tecnico || ch.tecnicoTelefone) upsertTecnico(ch.tecnico, ch.tecnicoTelefone, ch.tipo);
  }
  // 4b: próxima visita → Google Calendar (via agenda-pedidos; dedupe por data já agendada)
  agendarVisitaChamado(ch);
  // 4a (loop): chamado vindo de pedido de hóspede e agora concluído → fecha o pedido do hóspede
  if (ch.status === 'concluido' && String(ch.refId || '').startsWith('pedidohosp:')) {
    try {
      const pid = ch.refId.slice('pedidohosp:'.length);
      const peds = lerPedidosHosp(); const p = peds.find(x => x.id === pid);
      if (p && p.status !== 'concluido') { p.status = 'concluido'; p.atualizadoEm = new Date().toISOString(); if (!p.respostaAdmin) p.respostaAdmin = 'Manutenção concluída. Obrigado por avisar!'; salvarPedidosHosp(peds); }
    } catch (e) { console.error('[chamado->pedidohosp]', e.message); }
  }
  ch.atualizadoEm = new Date().toISOString();
  salvarJSON('manutencao-chamados.json', chamados);
  res.json({ ok: true, chamado: normChamado(ch) });
});

app.delete('/staff/api/manutencao/chamados/:id', requirePublishOrSession, (req, res) => {
  const chamados = lerJSON('manutencao-chamados.json', []);
  const rest = chamados.filter(x => x.id !== req.params.id);
  salvarJSON('manutencao-chamados.json', rest);
  res.json({ ok: true, removidos: chamados.length - rest.length });
});

// ---- Cadastro de Técnicos (manutenção) — usado pelo hub e reaproveitável na preventiva ----
app.get('/staff/api/manutencao/tecnicos', requirePublishOrSession, (req, res) => {
  let tecs = lerJSON('tecnicos-manutencao.json', []);
  const busca = tokensBusca(req.query.busca);
  if (busca.length) tecs = tecs.filter(t => { const alvo = semAcento([t.nome, t.telefone, (t.especialidades || []).join(' '), t.obs].join(' ').toLowerCase()); return busca.every(x => alvo.includes(x)); });
  res.json({ tecnicos: tecs.sort((a, b) => String(a.nome).localeCompare(String(b.nome))) });
});
app.post('/staff/api/manutencao/tecnicos', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const nome = String(d.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do técnico.' });
  const espec = Array.isArray(d.especialidades) ? d.especialidades : (d.especialidade ? [d.especialidade] : []);
  const tecs = lerJSON('tecnicos-manutencao.json', []);
  const tel = soDig(d.telefone);
  let t = tel ? tecs.find(x => soDig(x.telefone) === tel) : null;
  if (t) { t.nome = nome; if (d.telefone) t.telefone = String(d.telefone).trim(); if (espec.length) t.especialidades = [...new Set([...(t.especialidades || []), ...espec])]; if (d.obs != null) t.obs = String(d.obs).trim(); t.atualizadoEm = new Date().toISOString(); }
  else { t = { id: novoId(), nome, telefone: String(d.telefone || '').trim(), especialidades: espec, obs: String(d.obs || '').trim(), criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() }; tecs.push(t); }
  salvarJSON('tecnicos-manutencao.json', tecs);
  res.json({ ok: true, tecnico: t });
});
app.patch('/staff/api/manutencao/tecnicos/:id', requirePublishOrSession, (req, res) => {
  const tecs = lerJSON('tecnicos-manutencao.json', []);
  const t = tecs.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ erro: 'Técnico não encontrado.' });
  const d = req.body || {};
  if (d.nome != null) t.nome = String(d.nome).trim();
  if (d.telefone != null) t.telefone = String(d.telefone).trim();
  if (d.obs != null) t.obs = String(d.obs).trim();
  if (Array.isArray(d.especialidades)) t.especialidades = d.especialidades;
  t.atualizadoEm = new Date().toISOString();
  salvarJSON('tecnicos-manutencao.json', tecs);
  res.json({ ok: true, tecnico: t });
});
app.delete('/staff/api/manutencao/tecnicos/:id', requirePublishOrSession, (req, res) => {
  const tecs = lerJSON('tecnicos-manutencao.json', []);
  const rest = tecs.filter(x => x.id !== req.params.id);
  salvarJSON('tecnicos-manutencao.json', rest);
  res.json({ ok: true, removidos: tecs.length - rest.length });
});

// ---- Backup do DATA_DIR (espelho para máquina local) ----
// O disco do Render é o único lugar com usuários/CRM/listas/conta corrente; estes endpoints
// permitem que um script local (stays\backup-portal.ps1, tarefa diária) espelhe tudo.
// Auth: ADMIN_KEY (header x-admin-key) OU sessão de admin.
function requireAdminOuChave(req, res, next) {
  if (process.env.ADMIN_KEY && tokensIguais(req.headers['x-admin-key'], process.env.ADMIN_KEY)) return next();
  return requireAuth(req, res, () => requireAdmin(req, res, next));
}

// Backup do DATA_DIR (lista + arquivo) → extraído para nucleo/backup.js (montado no fim).

// ============================ ONDA 3: Concierge, Contas a pagar, Prazos jurídicos, Push equipe ============================

// ---- Push para a EQUIPE (staff) — reaproveita o VAPID da Área do Hóspede ----
// Assinaturas guardadas por usuário (usuarios.json → pushSubs[]). enviarPushStaff filtra por área.
app.get('/staff/api/push/chave', requireAuth, (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' }));

app.post('/staff/api/push/subscribe', requireAuth, (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ erro: 'Assinatura inválida.' });
  const usuarios = lerUsuarios();
  const u = usuarios.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  u.pushSubs = (u.pushSubs || []).filter(s => s.endpoint !== sub.endpoint);
  u.pushSubs.push(sub);
  salvarUsuarios(usuarios);
  res.json({ ok: true });
});

app.post('/staff/api/push/unsubscribe', requireAuth, (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  const usuarios = lerUsuarios();
  const u = usuarios.find(x => x.id === req.user.id);
  if (u && endpoint) { u.pushSubs = (u.pushSubs || []).filter(s => s.endpoint !== endpoint); salvarUsuarios(usuarios); }
  res.json({ ok: true });
});

// Envia push a todos os usuários com assinatura; se `area` for dada, só quem tem acesso à área.
async function enviarPushStaff(payload, area) {
  const wp = webpushPronto();
  if (!wp) return 0;
  const usuarios = lerUsuarios();
  const corpo = JSON.stringify(payload || {});
  let enviados = 0, mudou = false;
  for (const u of usuarios) {
    if (!u.ativo || !Array.isArray(u.pushSubs) || !u.pushSubs.length) continue;
    if (area && !podeArea(u, area)) continue;
    await Promise.all(u.pushSubs.map(async (sub) => {
      try { await wp.sendNotification(sub, corpo); enviados++; }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { u.pushSubs = u.pushSubs.filter(s => s.endpoint !== sub.endpoint); mudou = true; } }
    }));
  }
  if (mudou) salvarUsuarios(usuarios);
  return enviados;
}

// ---- Concierge: fila única (pedidos + pré-check-ins + avaliações/indicações) ----
app.get('/staff/api/concierge/fila', requireAuth, (req, res) => {
  if (!['concierge', 'vendas'].some(a => podeArea(req.user, a)) && req.user.papel !== 'admin')
    return res.status(403).json({ erro: 'Acesso restrito ao Concierge/Vendas.' });
  const itens = [];
  const abertoPedido = (s) => !['aprovado', 'recusado', 'respondido', 'concluido'].includes(s);
  for (const p of lerPedidosHosp()) {
    const rot = p.tipo === 'evento' ? 'Evento' : p.tipo === 'servico' ? (p.servico && p.servico.nome || 'Serviço') : p.tipo === 'manutencao' ? 'Manutenção' : p.tipo === 'checkin' ? 'Check-in' : 'Alteração de reserva';
    itens.push({ fila: 'pedido', id: p.id, titulo: rot + ' — ' + (p.hospedeNome || '—'), sub: (p.imovel || '') + (p.mensagem ? ' · ' + p.mensagem.slice(0, 80) : ''), status: p.status, aberto: abertoPedido(p.status), quando: p.criadoEm });
  }
  for (const pc of leUltimasLinhas('precheckins.jsonl', 40)) {
    itens.push({ fila: 'precheckin', id: pc.reserva || pc.criadoEm || '', titulo: 'Pré-check-in — ' + (pc.nome || '—'), sub: (pc.hospedagem || '') + (pc.chegada ? ' · chega ' + pc.chegada : '') + (pc.horario ? ' às ' + pc.horario : ''), status: 'recebido', aberto: false, quando: pc.recebidoEm || pc.criadoEm || '' });
  }
  for (const a of lerAvaliacoes()) {
    itens.push({ fila: 'avaliacao', id: a.id, titulo: '★'.repeat(Number(a.nota) || 0) + ' Avaliação — ' + (a.hospedeNome || '—'), sub: (a.comentario || '').slice(0, 120), status: (Number(a.nota) || 0) >= 4 ? 'positiva' : 'atencao', aberto: (Number(a.nota) || 0) <= 3, quando: a.criadoEm });
  }
  for (const i of lerIndicacoes()) {
    itens.push({ fila: 'indicacao', id: i.id, titulo: 'Indicação — ' + (i.hospedeNome || i.indicadoNome || '—'), sub: i.indicadoNome ? 'indicou ' + i.indicadoNome : '', status: 'nova', aberto: false, quando: i.criadoEm });
  }
  itens.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  res.json({ itens, abertos: itens.filter(x => x.aberto).length });
});

// ---- Concierge: dossiê de chegadas (próximos N dias) ----
app.get('/staff/api/concierge/chegadas', requireAuth, async (req, res) => {
  if (!['concierge', 'vendas', 'operacoes'].some(a => podeArea(req.user, a)) && req.user.papel !== 'admin')
    return res.status(403).json({ erro: 'Acesso restrito.' });
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias) || 3, 1), 14);
    const de = hojeBrasil();
    const ate = new Date(Date.parse(de) + dias * 86400000).toISOString().slice(0, 10);
    const listings = await staysPaginado('/content/listings', {});
    const mapa = {}; listings.forEach(l => { mapa[l._id] = { codigo: l.id, titulo: l.internalName || (l._mstitle && l._mstitle.pt_BR) || l.id }; });
    const brutas = (await staysPaginado('/booking/reservations', { from: de, to: ate, dateType: 'arrival' }))
      .filter(r => !['canceled', 'blocked', 'maintenance'].includes(r.type) && r.checkInDate >= de && r.checkInDate <= ate);
    const cache = await resolverClientes(brutas.map(r => r._idclient));
    const hospedes = lerHospedes();
    const porStays = {}; hospedes.forEach(h => { if (h.staysClientId) porStays[h.staysClientId] = h; });
    const precheckins = leUltimasLinhas('precheckins.jsonl', 200);
    const pedidos = lerPedidosHosp();
    const chegadas = brutas.map(r => {
      const im = mapa[r._idlisting] || { codigo: '—', titulo: '—' };
      const conta = porStays[r._idclient];
      const preOk = precheckins.some(pc => pc.reserva && (pc.reserva === r.id || pc.reserva === r._id));
      const resumoC = conta ? resumoConta(conta.id) : null;
      const pedAbertos = conta ? pedidos.filter(p => p.hospedeId === conta.id && !['aprovado', 'recusado', 'respondido', 'concluido'].includes(p.status)).length : 0;
      return {
        reserva: r.id, imovel: im.codigo, imovelTitulo: im.titulo,
        hospede: (r._idclient && cache[r._idclient]) || '—', hospedes: r.guests || null,
        checkIn: r.checkInDate, checkOut: r.checkOutDate,
        plataforma: normalizarPlataforma(r.partner).rotulo,
        preCheckin: preOk, temConta: !!conta,
        aPagar: resumoC ? resumoC.aPagar : 0, credito: resumoC ? resumoC.credito : 0,
        pedidosAbertos: pedAbertos,
      };
    }).sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));
    res.set('Cache-Control', 'no-store');
    res.json({ de, ate, dias, chegadas });
  } catch (e) { console.error('[concierge chegadas]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});

// ---- Financeiro: contas a pagar (storage próprio no portal) ----
// Áreas financeiro/ceo (admin vê tudo). Agentes lançam via PUBLISH_KEY (seed do CSV). Storage: contas-pagar.json.
const STATUS_CONTA = ['previsto', 'pago', 'atrasado'];
function podeFinanceiro(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'financeiro') || podeArea(req.user, 'ceo'))); }

app.get('/staff/api/financeiro/contas', requirePublishOrSession, (req, res) => {
  if (!podeFinanceiro(req)) return res.status(403).json({ erro: 'Acesso restrito (Financeiro/CEO).' });
  const hoje = hojeBrasil();
  const contas = lerJSON('contas-pagar.json', []).map(c => {
    const atrasado = c.status === 'previsto' && c.vencimento && c.vencimento < hoje;
    return { ...c, statusEfetivo: atrasado ? 'atrasado' : c.status };
  }).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  res.json({ contas, hoje });
});

app.post('/staff/api/financeiro/contas', requirePublishOrSession, (req, res) => {
  if (!podeFinanceiro(req)) return res.status(403).json({ erro: 'Acesso restrito (Financeiro/CEO).' });
  const d = req.body || {};
  const fornecedor = String(d.fornecedor || '').trim();
  if (!fornecedor) return res.status(400).json({ erro: 'Informe o fornecedor.' });
  const contas = lerJSON('contas-pagar.json', []);
  const refId = d.refId ? String(d.refId) : '';
  if (refId && contas.some(c => c.refId === refId)) return res.json({ ok: true, duplicado: true });
  const conta = {
    id: novoId(), fornecedor,
    categoria: String(d.categoria || '').trim(),
    valor: d.valor != null && d.valor !== '' ? Number(String(d.valor).replace(',', '.')) || 0 : 0,
    vencimento: String(d.vencimento || '').trim(),
    status: STATUS_CONTA.includes(d.status) ? d.status : 'previsto',
    periodicidade: String(d.periodicidade || '').trim(),
    obs: String(d.obs || '').trim(),
    refId, pagoEm: null,
    quem: req.viaChave ? (String(d.quem || '').trim() || 'agente') : (req.user.nome || req.user.email || 'staff'),
    criadoEm: new Date().toISOString(),
  };
  contas.push(conta);
  salvarJSON('contas-pagar.json', contas);
  res.json({ ok: true, conta });
});

app.patch('/staff/api/financeiro/contas/:id', requirePublishOrSession, (req, res) => {
  if (!podeFinanceiro(req)) return res.status(403).json({ erro: 'Acesso restrito (Financeiro/CEO).' });
  const contas = lerJSON('contas-pagar.json', []);
  const c = contas.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: 'Conta não encontrada.' });
  const d = req.body || {};
  if (d.status && STATUS_CONTA.includes(d.status)) { c.status = d.status; c.pagoEm = d.status === 'pago' ? new Date().toISOString() : null; }
  for (const campo of ['fornecedor', 'categoria', 'periodicidade', 'obs', 'vencimento']) if (d[campo] != null) c[campo] = String(d[campo]).trim();
  if (d.valor !== undefined) c.valor = d.valor === '' || d.valor == null ? 0 : Number(String(d.valor).replace(',', '.')) || 0;
  salvarJSON('contas-pagar.json', contas);
  res.json({ ok: true, conta: c });
});

app.delete('/staff/api/financeiro/contas/:id', requirePublishOrSession, (req, res) => {
  if (!podeFinanceiro(req)) return res.status(403).json({ erro: 'Acesso restrito (Financeiro/CEO).' });
  const contas = lerJSON('contas-pagar.json', []);
  const rest = contas.filter(x => x.id !== req.params.id && x.refId !== req.params.id);
  salvarJSON('contas-pagar.json', rest);
  res.json({ ok: true, removidos: contas.length - rest.length });
});

// ---- Jurídico: quadro de prazos (preliminares — validar no sistema oficial) ----
// Áreas juridico/ceo (admin). Agentes jurídicos publicam via PUBLISH_KEY. Storage: prazos-juridicos.json.
const STATUS_PRAZO = ['aberto', 'cumprido', 'cancelado'];
function podeJuridico(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'juridico') || podeArea(req.user, 'ceo'))); }

app.get('/staff/api/juridico/prazos', requirePublishOrSession, (req, res) => {
  if (!podeJuridico(req)) return res.status(403).json({ erro: 'Acesso restrito (Jurídico/CEO).' });
  const prazos = lerJSON('prazos-juridicos.json', []).sort((a, b) => String(a.dataLimite).localeCompare(String(b.dataLimite)));
  res.json({ prazos, hoje: hojeBrasil() });
});

app.post('/staff/api/juridico/prazos', requirePublishOrSession, (req, res) => {
  if (!podeJuridico(req)) return res.status(403).json({ erro: 'Acesso restrito (Jurídico/CEO).' });
  const d = req.body || {};
  const descricao = String(d.descricao || '').trim();
  if (!descricao) return res.status(400).json({ erro: 'Descreva o prazo/ato.' });
  const prazos = lerJSON('prazos-juridicos.json', []);
  const refId = d.refId ? String(d.refId) : '';
  if (refId && prazos.some(p => p.refId === refId)) return res.json({ ok: true, duplicado: true });
  const prazo = {
    id: novoId(), descricao,
    processo: String(d.processo || '').trim(),
    tribunal: String(d.tribunal || '').trim(),
    dataLimite: String(d.dataLimite || '').trim(),
    prioridade: ['alta', 'media', 'baixa'].includes(d.prioridade) ? d.prioridade : 'media',
    status: STATUS_PRAZO.includes(d.status) ? d.status : 'aberto',
    fonte: String(d.fonte || '').trim(), link: String(d.link || '').trim(),
    obs: String(d.obs || '').trim(), refId,
    quem: req.viaChave ? (String(d.quem || '').trim() || 'agente jurídico') : (req.user.nome || req.user.email || 'staff'),
    criadoEm: new Date().toISOString(),
  };
  prazos.push(prazo);
  salvarJSON('prazos-juridicos.json', prazos);
  res.json({ ok: true, prazo });
});

app.patch('/staff/api/juridico/prazos/:id', requirePublishOrSession, (req, res) => {
  if (!podeJuridico(req)) return res.status(403).json({ erro: 'Acesso restrito (Jurídico/CEO).' });
  const prazos = lerJSON('prazos-juridicos.json', []);
  const p = prazos.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ erro: 'Prazo não encontrado.' });
  const d = req.body || {};
  if (d.status && STATUS_PRAZO.includes(d.status)) p.status = d.status;
  if (d.prioridade && ['alta', 'media', 'baixa'].includes(d.prioridade)) p.prioridade = d.prioridade;
  for (const campo of ['descricao', 'processo', 'tribunal', 'dataLimite', 'fonte', 'link', 'obs']) if (d[campo] != null) p[campo] = String(d[campo]).trim();
  salvarJSON('prazos-juridicos.json', prazos);
  res.json({ ok: true, prazo: p });
});

app.delete('/staff/api/juridico/prazos/:id', requirePublishOrSession, (req, res) => {
  if (!podeJuridico(req)) return res.status(403).json({ erro: 'Acesso restrito (Jurídico/CEO).' });
  const prazos = lerJSON('prazos-juridicos.json', []);
  const rest = prazos.filter(x => x.id !== req.params.id && x.refId !== req.params.id);
  salvarJSON('prazos-juridicos.json', rest);
  res.json({ ok: true, removidos: prazos.length - rest.length });
});

// ============================ ONDA 4: DRE por imóvel, Revenue, Obras, Marketing, Automações, Auditoria ============================

// ---- Auditoria: log de ações sensíveis (usuários, reservas, conta corrente) ----
function registrarAuditoria(req, acao, detalhe) {
  try {
    appendJsonl('auditoria.jsonl', {
      quando: new Date().toISOString(),
      quem: req.viaChave ? 'agente/chave' : (req.user && (req.user.nome || req.user.email)) || 'desconhecido',
      email: (req.user && req.user.email) || '',
      acao, detalhe: String(detalhe || '').slice(0, 300),
      ip: (req.ip || '').toString(),
    });
  } catch (_) {}
}
app.get('/staff/api/auditoria', requireAuth, requireAdmin, (req, res) => {
  res.json({ eventos: leUltimasLinhas('auditoria.jsonl', Math.min(parseInt(req.query.n) || 200, 500)) });
});

// ---- Semáforo de automações (heartbeat): cada rotina registra sua última execução OK ----
// verde = executou dentro da validade; âmbar = atrasada até 2×; vermelho = muito atrasada ou com erro.
app.post('/staff/api/automacoes/heartbeat', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const tarefa = String(d.tarefa || '').trim();
  if (!tarefa) return res.status(400).json({ erro: 'Informe a tarefa.' });
  const mapa = lerJSON('automacoes.json', {});
  mapa[tarefa] = {
    tarefa,
    status: d.status === 'erro' ? 'erro' : 'ok',
    detalhe: String(d.detalhe || '').slice(0, 200),
    validadeHoras: Number(d.validadeHoras) || mapa[tarefa]?.validadeHoras || 26,
    grupo: String(d.grupo || mapa[tarefa]?.grupo || '').slice(0, 40),
    ultima: new Date().toISOString(),
  };
  salvarJSON('automacoes.json', mapa);
  res.json({ ok: true });
});
// Diagnóstico do monitor local: anota o PORQUÊ de uma rotina estar atrasada/erro (última execução,
// código de resultado e estado da Tarefa do Windows) e a AÇÃO de correção aplicada — SEM tocar em
// 'ultima'/'status' (não maquia o semáforo). Alimenta o painel com a causa. Via PUBLISH_KEY (monitor).
app.post('/staff/api/automacoes/diagnostico', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const tarefa = String(d.tarefa || '').trim();
  if (!tarefa) return res.status(400).json({ erro: 'Informe a tarefa.' });
  const mapa = lerJSON('automacoes.json', {});
  if (!mapa[tarefa]) return res.json({ ok: true, inexistente: true });
  if (d.diagnostico !== undefined) mapa[tarefa].diagnostico = String(d.diagnostico || '').slice(0, 300);
  if (d.correcao !== undefined) mapa[tarefa].correcao = String(d.correcao || '').slice(0, 200);
  mapa[tarefa].diagnosticoEm = new Date().toISOString();
  salvarJSON('automacoes.json', mapa);
  res.json({ ok: true });
});
app.get('/staff/api/automacoes', requireAdminOuChave, (req, res) => {
  const mapa = lerJSON('automacoes.json', {});
  const agora = Date.now();
  const itens = Object.values(mapa).map(a => {
    const idadeH = (agora - Date.parse(a.ultima)) / 3600000;
    let semaforo = 'verde';
    if (a.status === 'erro') semaforo = 'vermelho';
    else if (idadeH > 2 * (a.validadeHoras || 26)) semaforo = 'vermelho';
    else if (idadeH > (a.validadeHoras || 26)) semaforo = 'ambar';
    return { ...a, idadeHoras: Math.round(idadeH * 10) / 10, semaforo };
  }).sort((a, b) => ({ vermelho: 0, ambar: 1, verde: 2 }[a.semaforo] - { vermelho: 0, ambar: 1, verde: 2 }[b.semaforo]) || String(a.grupo).localeCompare(String(b.grupo)));
  res.json({ itens });
});
app.delete('/staff/api/automacoes/:tarefa', requireAuth, requireAdmin, (req, res) => {
  const mapa = lerJSON('automacoes.json', {});
  delete mapa[req.params.tarefa];
  salvarJSON('automacoes.json', mapa);
  res.json({ ok: true });
});

// ---- Receita por imóvel (mês, competência por check-in) — base do DRE ----
// Retorna { CODIGO: { receitaBruta, comissao, receitaLiquida, reservas, noites } } para o mês yyyy-MM.
async function receitaPorImovelMes(mes) {
  const ini = mes + '-01';
  const [a, m] = mes.split('-').map(Number);
  const fim = `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
  const listings = await staysPaginado('/content/listings', {});
  const codPorId = {}; listings.forEach(l => { codPorId[l._id] = l.id; });
  const reservas = (await staysPaginado('/booking/reservations', { from: ini, to: fim, dateType: 'arrival' }))
    .filter(r => !['canceled', 'blocked', 'maintenance'].includes(r.type));
  const out = {};
  for (const r of reservas) {
    const cod = codPorId[r._idlisting] || '—';
    if (!out[cod]) out[cod] = { receitaBruta: 0, comissao: 0, receitaLiquida: 0, reservas: 0, noites: 0 };
    const bruto = (r.price && r.price._f_total) || 0;
    const com = (r.partner && r.partner.commission && r.partner.commission._mcval && r.partner.commission._mcval.BRL) || 0;
    const noites = (r.checkInDate && r.checkOutDate) ? Math.max(0, Math.round((Date.parse(r.checkOutDate) - Date.parse(r.checkInDate)) / 86400000)) : 0;
    out[cod].receitaBruta += bruto; out[cod].comissao += com; out[cod].receitaLiquida += bruto - com;
    out[cod].reservas += 1; out[cod].noites += noites;
  }
  return out;
}

// ---- Custos por imóvel (lançamento mensal) ----
const CAT_CUSTO = ['energia', 'agua', 'internet', 'limpeza', 'piscina', 'jardim', 'condominio', 'iptu', 'manutencao', 'suprimentos', 'outros'];
app.get('/staff/api/financeiro/custos', requirePublishOrSession, (req, res) => {
  if (!podeFinanceiro(req)) return res.status(403).json({ erro: 'Acesso restrito (Financeiro/CEO).' });
  let custos = lerJSON('custos-imovel.json', []);
  if (req.query.mes) custos = custos.filter(c => c.mes === req.query.mes);
  res.json({ custos, categorias: CAT_CUSTO });
});
app.post('/staff/api/financeiro/custos', requirePublishOrSession, (req, res) => {
  if (!podeFinanceiro(req)) return res.status(403).json({ erro: 'Acesso restrito (Financeiro/CEO).' });
  const d = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(d.mes || '')) return res.status(400).json({ erro: 'Informe o mês (yyyy-MM).' });
  const imovel = String(d.imovel || '').trim();
  if (!imovel) return res.status(400).json({ erro: 'Informe o imóvel.' });
  const custos = lerJSON('custos-imovel.json', []);
  const item = {
    id: novoId(), mes: d.mes, imovel,
    categoria: CAT_CUSTO.includes(d.categoria) ? d.categoria : 'outros',
    valor: d.valor != null && d.valor !== '' ? Number(String(d.valor).replace(',', '.')) || 0 : 0,
    obs: String(d.obs || '').trim(),
    quem: req.viaChave ? 'agente' : (req.user.nome || req.user.email || 'staff'),
    criadoEm: new Date().toISOString(),
  };
  custos.push(item);
  salvarJSON('custos-imovel.json', custos);
  res.json({ ok: true, item });
});
app.delete('/staff/api/financeiro/custos/:id', requirePublishOrSession, (req, res) => {
  if (!podeFinanceiro(req)) return res.status(403).json({ erro: 'Acesso restrito (Financeiro/CEO).' });
  const custos = lerJSON('custos-imovel.json', []);
  const rest = custos.filter(c => c.id !== req.params.id);
  salvarJSON('custos-imovel.json', rest);
  res.json({ ok: true, removidos: custos.length - rest.length });
});

// ---- DRE por imóvel (mês): receita líquida da Stays − custos lançados ----
app.get('/staff/api/financeiro/dre', requirePublishOrSession, async (req, res) => {
  if (!podeFinanceiro(req)) return res.status(403).json({ erro: 'Acesso restrito (Financeiro/CEO).' });
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : hojeBrasil().slice(0, 7);
  try {
    const receita = await receitaPorImovelMes(mes);
    const custos = lerJSON('custos-imovel.json', []).filter(c => c.mes === mes);
    const custoPorImovel = {}; for (const c of custos) custoPorImovel[c.imovel] = (custoPorImovel[c.imovel] || 0) + (Number(c.valor) || 0);
    const codigos = [...new Set([...Object.keys(receita), ...Object.keys(custoPorImovel)])].filter(c => c && c !== '—').sort();
    const linhas = codigos.map(cod => {
      const r = receita[cod] || { receitaBruta: 0, comissao: 0, receitaLiquida: 0, reservas: 0, noites: 0 };
      const custo = custoPorImovel[cod] || 0;
      const resultado = r.receitaLiquida - custo;
      return { imovel: cod, receitaBruta: Math.round(r.receitaBruta), comissao: Math.round(r.comissao), receitaLiquida: Math.round(r.receitaLiquida), custos: Math.round(custo), resultado: Math.round(resultado), margem: r.receitaLiquida ? Math.round(1000 * resultado / r.receitaLiquida) / 10 : null, reservas: r.reservas, noites: r.noites, temCusto: cod in custoPorImovel };
    });
    const tot = linhas.reduce((s, l) => ({ receitaBruta: s.receitaBruta + l.receitaBruta, comissao: s.comissao + l.comissao, receitaLiquida: s.receitaLiquida + l.receitaLiquida, custos: s.custos + l.custos, resultado: s.resultado + l.resultado }), { receitaBruta: 0, comissao: 0, receitaLiquida: 0, custos: 0, resultado: 0 });
    res.json({ mes, linhas, total: tot });
  } catch (e) { console.error('[dre]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});

// ---- Cockpit de revenue: pickup, ocupação futura, ADR/RevPAR, mix por canal ----
app.get('/staff/api/revenue/cockpit', requireAuth, async (req, res) => {
  if (!['revenue', 'ceo', 'financeiro'].some(a => podeArea(req.user, a)) && req.user.papel !== 'admin')
    return res.status(403).json({ erro: 'Acesso restrito (Revenue/CEO).' });
  try {
    const hoje = hojeBrasil();
    const listings = await staysPaginado('/content/listings', {});
    const ativos = listings.filter(l => l.status === 'active');
    const nUnid = ativos.length;
    const codPorId = {}; ativos.forEach(l => { codPorId[l._id] = l.id; });
    // Pickup: reservas criadas nos últimos 30 dias
    const de30 = new Date(Date.parse(hoje) - 30 * 86400000).toISOString().slice(0, 10);
    const criadas = (await staysPaginado('/booking/reservations', { from: de30, to: hoje, dateType: 'creation' }))
      .filter(r => !['canceled', 'blocked', 'maintenance'].includes(r.type));
    const de7 = new Date(Date.parse(hoje) - 7 * 86400000).toISOString().slice(0, 10);
    const pickup30 = { reservas: criadas.length, valor: Math.round(criadas.reduce((s, r) => s + ((r.price && r.price._f_total) || 0), 0)) };
    const c7 = criadas.filter(r => (r.creationDate || r.createdAt || '').slice(0, 10) >= de7);
    const pickup7 = { reservas: c7.length, valor: Math.round(c7.reduce((s, r) => s + ((r.price && r.price._f_total) || 0), 0)) };
    // Janela futura 90 dias (uma leitura), recorta 30/60/90
    const ate90 = new Date(Date.parse(hoje) + 90 * 86400000).toISOString().slice(0, 10);
    const futuras = (await staysPaginado('/booking/reservations', { from: hoje, to: ate90, dateType: 'included' }))
      .filter(r => !['canceled'].includes(r.type));
    const estadias = futuras.filter(r => r.type !== 'blocked' && r.type !== 'maintenance');
    const noitesNaJanela = (r, ini, fim) => {
      const ci = r.checkInDate > ini ? r.checkInDate : ini, co = r.checkOutDate < fim ? r.checkOutDate : fim;
      return Math.max(0, Math.round((Date.parse(co) - Date.parse(ci)) / 86400000));
    };
    const bloco = (dias) => {
      const fim = new Date(Date.parse(hoje) + dias * 86400000).toISOString().slice(0, 10);
      let noitesVend = 0, noitesBloq = 0, receita = 0;
      for (const r of estadias) {
        const n = noitesNaJanela(r, hoje, fim);
        if (n > 0) {
          noitesVend += n;
          // espelhamento nas DUAS direções: alugar um anúncio bloqueia (ocupa) as noites dos componentes
          // que ele contém (descendentes) E dos espaços que o contêm (ancestrais). Não conta irmãos.
          const codR = codPorId[r._idlisting];
          const nBloq = (N_DESC_OCUP[codR] || 0) + (N_ANC_OCUP[codR] || 0) + (N_ESP_OCUP[codR] || 0);
          if (nBloq) noitesBloq += n * nBloq;
          const noitesTot = Math.max(1, Math.round((Date.parse(r.checkOutDate) - Date.parse(r.checkInDate)) / 86400000));
          receita += ((r.price && r.price._f_total) || 0) * n / noitesTot;
        }
      }
      const noitesDisp = nUnid * dias;
      // Ocupação inclui as noites bloqueadas (cap no disponível); ADR/RevPAR usam só as noites efetivamente vendidas.
      const noitesOcup = Math.min(noitesDisp, noitesVend + noitesBloq);
      return { dias, ocupacaoPct: noitesDisp ? Math.round(1000 * noitesOcup / noitesDisp) / 10 : 0, noitesVendidas: noitesVend, receitaPrevista: Math.round(receita), adr: noitesVend ? Math.round(receita / noitesVend) : 0, revpar: noitesDisp ? Math.round(receita / noitesDisp) : 0 };
    };
    // Mix por canal (estadias futuras)
    const mix = {};
    for (const r of estadias) { const p = normalizarPlataforma(r.partner).rotulo; mix[p] = (mix[p] || 0) + 1; }
    res.set('Cache-Control', 'no-store');
    res.json({ hoje, unidades: nUnid, pickup7, pickup30, futuro: [bloco(30), bloco(60), bloco(90)], mixCanal: Object.entries(mix).map(([k, v]) => ({ canal: k, n: v })).sort((a, b) => b.n - a.n) });
  } catch (e) { console.error('[revenue]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});

// ---- Obras e Decoração: quadro com ROI ----
const OBRA_STATUS = ['ideia', 'orcamento', 'aprovado', 'em_obra', 'concluido'];
function podeObras(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'obras') || podeArea(req.user, 'ceo'))); }
app.get('/staff/api/obras', requirePublishOrSession, (req, res) => {
  if (!podeObras(req)) return res.status(403).json({ erro: 'Acesso restrito (Obras/CEO).' });
  res.json({ obras: lerJSON('obras.json', []) });
});
app.post('/staff/api/obras', requirePublishOrSession, (req, res) => {
  if (!podeObras(req)) return res.status(403).json({ erro: 'Acesso restrito (Obras/CEO).' });
  const d = req.body || {};
  const titulo = String(d.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'Informe o título da obra/melhoria.' });
  const obras = lerJSON('obras.json', []);
  const num = (v) => v != null && v !== '' ? Number(String(v).replace(',', '.')) || 0 : 0;
  const o = {
    id: novoId(), titulo, imovel: String(d.imovel || '').trim(), descricao: String(d.descricao || '').trim(),
    status: OBRA_STATUS.includes(d.status) ? d.status : 'ideia',
    custoPrevisto: num(d.custoPrevisto), custoReal: num(d.custoReal),
    diariaExtra: num(d.diariaExtra), ocupacaoMes: d.ocupacaoMes != null && d.ocupacaoMes !== '' ? num(d.ocupacaoMes) : 12,
    quem: req.viaChave ? 'agente' : (req.user.nome || req.user.email || 'staff'),
    criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
  };
  obras.push(o);
  salvarJSON('obras.json', obras);
  res.json({ ok: true, obra: o });
});
app.patch('/staff/api/obras/:id', requirePublishOrSession, (req, res) => {
  if (!podeObras(req)) return res.status(403).json({ erro: 'Acesso restrito (Obras/CEO).' });
  const obras = lerJSON('obras.json', []);
  const o = obras.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ erro: 'Obra não encontrada.' });
  const d = req.body || {};
  const num = (v) => v === '' || v == null ? 0 : Number(String(v).replace(',', '.')) || 0;
  if (d.status && OBRA_STATUS.includes(d.status)) o.status = d.status;
  for (const campo of ['titulo', 'imovel', 'descricao']) if (d[campo] != null) o[campo] = String(d[campo]).trim();
  for (const campo of ['custoPrevisto', 'custoReal', 'diariaExtra', 'ocupacaoMes']) if (d[campo] !== undefined) o[campo] = num(d[campo]);
  o.atualizadoEm = new Date().toISOString();
  salvarJSON('obras.json', obras);
  res.json({ ok: true, obra: o });
});
app.delete('/staff/api/obras/:id', requirePublishOrSession, (req, res) => {
  if (!podeObras(req)) return res.status(403).json({ erro: 'Acesso restrito (Obras/CEO).' });
  const obras = lerJSON('obras.json', []);
  const rest = obras.filter(x => x.id !== req.params.id);
  salvarJSON('obras.json', rest);
  res.json({ ok: true, removidos: obras.length - rest.length });
});

// ---- Marketing: conversão por origem (a partir do CRM) ----
app.get('/staff/api/marketing/conversao', requireAuth, (req, res) => {
  if (!['marketing', 'vendas', 'ceo'].some(a => podeArea(req.user, a)) && req.user.papel !== 'admin')
    return res.status(403).json({ erro: 'Acesso restrito (Marketing/Vendas/CEO).' });
  const ganhosEst = ['reserva', 'hospedado', 'posvenda'];
  const porOrigem = {};
  for (const c of lerContatos()) {
    const o = (c.origem || 'manual').trim() || 'manual';
    if (!porOrigem[o]) porOrigem[o] = { origem: o, leads: 0, ganhos: 0, perdidos: 0, valorGanho: 0 };
    porOrigem[o].leads++;
    if (ganhosEst.includes(c.estagio)) { porOrigem[o].ganhos++; porOrigem[o].valorGanho += Number(c.valorEstimado) || 0; }
    else if (c.estagio === 'perdido') porOrigem[o].perdidos++;
  }
  const linhas = Object.values(porOrigem).map(o => ({ ...o, valorGanho: Math.round(o.valorGanho), conversao: o.leads ? Math.round(1000 * o.ganhos / o.leads) / 10 : 0 }))
    .sort((a, b) => b.leads - a.leads);
  res.json({ linhas, totalLeads: linhas.reduce((s, l) => s + l.leads, 0), totalGanhos: linhas.reduce((s, l) => s + l.ganhos, 0) });
});

// ============================ ONDA 5: Metas (OKR), SLA de vendas, Receita prevista, Datas quentes ============================

// ---- Metas por área (OKR) com termômetro ----
// Indicadores AUTO (valor atual calculado) ou manuais. metas.json: {id, area, mes, indicadorKey,
// titulo, alvo, unidade, atualManual, obs}. Admin/CEO gerencia.
const META_AUTO = {
  receita_liquida_mes: { titulo: 'Receita líquida do mês', unidade: 'R$' },
  reservas_mes: { titulo: 'Reservas do mês', unidade: 'nº' },
  leads_mes: { titulo: 'Leads no mês', unidade: 'nº' },
  avaliacoes_mes: { titulo: 'Avaliações no mês', unidade: 'nº' },
};
function podeMetas(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'ceo'))); }
async function valorAutoMeta(key, mes, cacheStays) {
  if (key === 'leads_mes') return lerContatos().filter(c => (c.criadoEm || '').slice(0, 7) === mes).length;
  if (key === 'avaliacoes_mes') return lerAvaliacoes().filter(a => (a.criadoEm || '').slice(0, 7) === mes).length;
  if (key === 'receita_liquida_mes' || key === 'reservas_mes') {
    if (!cacheStays[mes]) {
      const rec = await receitaPorImovelMes(mes);
      let receita = 0, reservas = 0;
      for (const v of Object.values(rec)) { receita += v.receitaLiquida; reservas += v.reservas; }
      cacheStays[mes] = { receita: Math.round(receita), reservas };
    }
    return key === 'receita_liquida_mes' ? cacheStays[mes].receita : cacheStays[mes].reservas;
  }
  return null;
}
app.get('/staff/api/metas', requireAuth, async (req, res) => {
  // Ver: admin/ceo veem tudo; demais veem as metas da sua área.
  const metas = lerJSON('metas.json', []);
  const visiveis = (req.user.papel === 'admin' || podeArea(req.user, 'ceo'))
    ? metas : metas.filter(m => podeArea(req.user, m.area));
  const cache = {};
  const out = [];
  for (const m of visiveis) {
    let atual = m.atualManual;
    if (m.indicadorKey && META_AUTO[m.indicadorKey]) {
      try { const v = await valorAutoMeta(m.indicadorKey, m.mes, cache); if (v != null) atual = v; } catch (_) {}
    }
    const pct = m.alvo ? Math.round(1000 * (Number(atual) || 0) / m.alvo) / 10 : null;
    out.push({ ...m, atual: Number(atual) || 0, pct });
  }
  out.sort((a, b) => String(b.mes).localeCompare(String(a.mes)) || String(a.area).localeCompare(String(b.area)));
  res.json({ metas: out, indicadoresAuto: META_AUTO, areas: AREAS });
});
app.post('/staff/api/metas', requireAuth, (req, res) => {
  if (!podeMetas(req)) return res.status(403).json({ erro: 'Só admin/CEO define metas.' });
  const d = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(d.mes || '')) return res.status(400).json({ erro: 'Informe o mês (yyyy-MM).' });
  const key = META_AUTO[d.indicadorKey] ? d.indicadorKey : '';
  const titulo = (key ? META_AUTO[key].titulo : String(d.titulo || '').trim());
  if (!titulo) return res.status(400).json({ erro: 'Informe o indicador da meta.' });
  const metas = lerJSON('metas.json', []);
  const meta = {
    id: novoId(), area: AREAS.some(a => a.id === d.area) ? d.area : 'ceo', mes: d.mes,
    indicadorKey: key, titulo,
    alvo: Number(String(d.alvo).replace(',', '.')) || 0,
    unidade: key ? META_AUTO[key].unidade : (['R$', '%', 'nº'].includes(d.unidade) ? d.unidade : 'nº'),
    atualManual: d.atualManual != null && d.atualManual !== '' ? Number(String(d.atualManual).replace(',', '.')) || 0 : 0,
    obs: String(d.obs || '').trim(),
    quem: req.user.nome || req.user.email || 'staff', criadoEm: new Date().toISOString(),
  };
  metas.push(meta);
  salvarJSON('metas.json', metas);
  res.json({ ok: true, meta });
});
app.patch('/staff/api/metas/:id', requireAuth, (req, res) => {
  if (!podeMetas(req)) return res.status(403).json({ erro: 'Só admin/CEO define metas.' });
  const metas = lerJSON('metas.json', []);
  const m = metas.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ erro: 'Meta não encontrada.' });
  const d = req.body || {};
  if (d.alvo !== undefined) m.alvo = Number(String(d.alvo).replace(',', '.')) || 0;
  if (d.atualManual !== undefined) m.atualManual = d.atualManual === '' || d.atualManual == null ? 0 : Number(String(d.atualManual).replace(',', '.')) || 0;
  if (d.obs != null) m.obs = String(d.obs).trim();
  if (!m.indicadorKey && d.titulo) m.titulo = String(d.titulo).trim();
  salvarJSON('metas.json', metas);
  res.json({ ok: true, meta: m });
});
app.delete('/staff/api/metas/:id', requireAuth, (req, res) => {
  if (!podeMetas(req)) return res.status(403).json({ erro: 'Só admin/CEO define metas.' });
  const metas = lerJSON('metas.json', []);
  salvarJSON('metas.json', metas.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// CRM legado: SLA + receita prevista → nucleo/crm-legado.js.
// ---- Revenue: datas quentes (alta demanda) ----
function podeRevenue(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'revenue') || podeArea(req.user, 'ceo'))); }
app.get('/staff/api/revenue/datas-quentes', requireAuth, (req, res) => {
  if (!podeRevenue(req) && !podeArea(req.user, 'vendas')) return res.status(403).json({ erro: 'Acesso restrito.' });
  const hoje = hojeBrasil();
  const datas = lerJSON('datas-quentes.json', []).map(d => ({ ...d, passada: d.ate && d.ate < hoje }))
    .sort((a, b) => String(a.de).localeCompare(String(b.de)));
  res.json({ datas, hoje });
});
app.post('/staff/api/revenue/datas-quentes', requirePublishOrSession, (req, res) => {
  if (!podeRevenue(req)) return res.status(403).json({ erro: 'Acesso restrito (Revenue/CEO).' });
  const d = req.body || {};
  const nome = String(d.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do evento/período.' });
  const datas = lerJSON('datas-quentes.json', []);
  const item = {
    id: novoId(), nome, de: String(d.de || '').trim(), ate: String(d.ate || '').trim(),
    minStay: d.minStay != null && d.minStay !== '' ? parseInt(d.minStay) || 0 : 0,
    precoAjustado: !!d.precoAjustado, obs: String(d.obs || '').trim(),
    quem: req.viaChave ? 'agente' : (req.user.nome || req.user.email || 'staff'), criadoEm: new Date().toISOString(),
  };
  datas.push(item);
  salvarJSON('datas-quentes.json', datas);
  res.json({ ok: true, item });
});
app.patch('/staff/api/revenue/datas-quentes/:id', requirePublishOrSession, (req, res) => {
  if (!podeRevenue(req)) return res.status(403).json({ erro: 'Acesso restrito (Revenue/CEO).' });
  const datas = lerJSON('datas-quentes.json', []);
  const it = datas.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Data não encontrada.' });
  const d = req.body || {};
  if (d.precoAjustado != null) it.precoAjustado = !!d.precoAjustado;
  for (const campo of ['nome', 'de', 'ate', 'obs']) if (d[campo] != null) it[campo] = String(d[campo]).trim();
  if (d.minStay !== undefined) it.minStay = d.minStay === '' || d.minStay == null ? 0 : parseInt(d.minStay) || 0;
  salvarJSON('datas-quentes.json', datas);
  res.json({ ok: true, item: it });
});
app.delete('/staff/api/revenue/datas-quentes/:id', requirePublishOrSession, (req, res) => {
  if (!podeRevenue(req)) return res.status(403).json({ erro: 'Acesso restrito (Revenue/CEO).' });
  const datas = lerJSON('datas-quentes.json', []);
  salvarJSON('datas-quentes.json', datas.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ============================ ONDA 6: Fotos, Ativos (equipamentos), Estoque (enxoval/amenities) ============================

// ---- Fotos genéricas por entidade (chamado, obra, limpeza) ----
const FOTOS_DIR = path.join(DATA_DIR, 'fotos');
fs.mkdirSync(FOTOS_DIR, { recursive: true });
const EXT_IMG = { '.jpg': 1, '.jpeg': 1, '.png': 1, '.webp': 1, '.gif': 1, '.heic': 1 };

app.get('/staff/api/fotos', requirePublishOrSession, (req, res) => {
  let fotos = lerJSON('fotos.json', []);
  if (req.query.entidade) fotos = fotos.filter(f => f.entidade === req.query.entidade);
  if (req.query.entidadeId) fotos = fotos.filter(f => f.entidadeId === req.query.entidadeId);
  res.json({ fotos: fotos.map(({ arquivo, ...m }) => m).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))) });
});

app.post('/staff/api/fotos', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const entidade = String(d.entidade || '').trim();
  const entidadeId = String(d.entidadeId || '').trim();
  if (!entidade || !entidadeId) return res.status(400).json({ erro: 'Informe a entidade e o id.' });
  if (!d.base64 || !d.nomeArquivo) return res.status(400).json({ erro: 'Envie a imagem.' });
  const ext = path.extname(String(d.nomeArquivo)).toLowerCase().slice(0, 8);
  if (!EXT_IMG[ext]) return res.status(400).json({ erro: 'Formato inválido (use JPG, PNG, WEBP…).' });
  const buf = Buffer.from(String(d.base64), 'base64');
  if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ erro: 'Imagem acima de 6 MB.' });
  const fotos = lerJSON('fotos.json', []);
  const id = novoId();
  const arquivo = id + ext;
  try { fs.writeFileSync(path.join(FOTOS_DIR, arquivo), buf); } catch (e) { return res.status(400).json({ erro: 'Imagem inválida.' }); }
  const foto = {
    id, entidade, entidadeId, arquivo, ext,
    legenda: String(d.legenda || '').slice(0, 200),
    quem: req.viaChave ? 'agente' : (req.user.nome || req.user.email || 'staff'),
    criadoEm: new Date().toISOString(),
  };
  fotos.push(foto);
  salvarJSON('fotos.json', fotos);
  res.json({ ok: true, foto: { ...foto, arquivo: undefined } });
});

app.get('/staff/api/fotos/:id/arquivo', requireAuth, (req, res) => {
  const f = lerJSON('fotos.json', []).find(x => x.id === req.params.id);
  if (!f) return res.sendStatus(404);
  const alvo = path.join(FOTOS_DIR, f.arquivo);
  if (!fs.existsSync(alvo)) return res.sendStatus(404);
  res.sendFile(alvo);
});

app.delete('/staff/api/fotos/:id', requirePublishOrSession, (req, res) => {
  const fotos = lerJSON('fotos.json', []);
  const f = fotos.find(x => x.id === req.params.id);
  if (f) { try { fs.unlinkSync(path.join(FOTOS_DIR, f.arquivo)); } catch {} }
  salvarJSON('fotos.json', fotos.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ---- Ativos (equipamentos): ficha por equipamento com histórico e gasto ----
const CAT_ATIVO = ['ar-condicionado', 'aquecedor', 'piscina', 'eletrodomestico', 'mobiliario', 'hidraulica', 'eletrica', 'outro'];
function podeManut(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'manutencao') || podeArea(req.user, 'operacoes') || podeArea(req.user, 'obras') || podeArea(req.user, 'ceo'))); }
app.get('/staff/api/ativos', requirePublishOrSession, (req, res) => {
  if (!podeManut(req)) return res.status(403).json({ erro: 'Acesso restrito (Manutenção/Operações).' });
  const ativos = lerJSON('ativos.json', []);
  const chamados = lerJSON('manutencao-chamados.json', []);
  const out = ativos.map(a => {
    const chs = chamados.filter(c => c.ativoId === a.id);
    const gasto = chs.reduce((s, c) => s + (Number(c.custo) || 0), 0);
    return { ...a, chamados: chs.length, gastoAcumulado: Math.round(gasto * 100) / 100 };
  }).sort((a, b) => String(a.casa).localeCompare(String(b.casa)) || String(a.nome).localeCompare(String(b.nome)));
  res.json({ ativos: out, categorias: CAT_ATIVO });
});
app.get('/staff/api/ativos/:id', requirePublishOrSession, (req, res) => {
  if (!podeManut(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const a = lerJSON('ativos.json', []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ erro: 'Ativo não encontrado.' });
  const chamados = lerJSON('manutencao-chamados.json', []).filter(c => c.ativoId === a.id)
    .sort((x, y) => String(y.criadoEm).localeCompare(String(x.criadoEm)));
  const gasto = chamados.reduce((s, c) => s + (Number(c.custo) || 0), 0);
  res.json({ ativo: a, chamados, gastoAcumulado: Math.round(gasto * 100) / 100 });
});
app.post('/staff/api/ativos', requirePublishOrSession, (req, res) => {
  if (!podeManut(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const d = req.body || {};
  const nome = String(d.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do equipamento.' });
  const ativos = lerJSON('ativos.json', []);
  const a = {
    id: novoId(), nome, casa: String(d.casa || '').trim(),
    categoria: CAT_ATIVO.includes(d.categoria) ? d.categoria : 'outro',
    marca: String(d.marca || '').trim(), modelo: String(d.modelo || '').trim(),
    dataInstalacao: String(d.dataInstalacao || '').trim(), obs: String(d.obs || '').trim(),
    quem: req.viaChave ? 'agente' : (req.user.nome || req.user.email || 'staff'), criadoEm: new Date().toISOString(),
  };
  ativos.push(a);
  salvarJSON('ativos.json', ativos);
  res.json({ ok: true, ativo: a });
});
app.patch('/staff/api/ativos/:id', requirePublishOrSession, (req, res) => {
  if (!podeManut(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const ativos = lerJSON('ativos.json', []);
  const a = ativos.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ erro: 'Ativo não encontrado.' });
  const d = req.body || {};
  for (const c of ['nome', 'casa', 'marca', 'modelo', 'dataInstalacao', 'obs']) if (d[c] != null) a[c] = String(d[c]).trim();
  if (d.categoria && CAT_ATIVO.includes(d.categoria)) a.categoria = d.categoria;
  salvarJSON('ativos.json', ativos);
  res.json({ ok: true, ativo: a });
});
app.delete('/staff/api/ativos/:id', requirePublishOrSession, (req, res) => {
  if (!podeManut(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const ativos = lerJSON('ativos.json', []);
  salvarJSON('ativos.json', ativos.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ---- Estoque (enxoval / amenities) com alerta de mínimo e "repor" na lista de compras ----
function podeEstoque(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'operacoes') || podeArea(req.user, 'compras') || podeArea(req.user, 'ceo'))); }
app.get('/staff/api/estoque', requirePublishOrSession, (req, res) => {
  if (!podeEstoque(req)) return res.status(403).json({ erro: 'Acesso restrito (Operações/Compras).' });
  const itens = lerJSON('estoque.json', []).map(i => ({ ...i, baixo: Number(i.quantidade) <= Number(i.minimo) }))
    .sort((a, b) => (b.baixo - a.baixo) || String(a.casa).localeCompare(String(b.casa)) || String(a.item).localeCompare(String(b.item)));
  res.json({ itens });
});
app.post('/staff/api/estoque', requirePublishOrSession, (req, res) => {
  if (!podeEstoque(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const d = req.body || {};
  const item = String(d.item || '').trim();
  if (!item) return res.status(400).json({ erro: 'Informe o item.' });
  const itens = lerJSON('estoque.json', []);
  const novo = {
    id: novoId(), item, casa: String(d.casa || '').trim(),
    categoria: String(d.categoria || '').trim(), unidade: String(d.unidade || 'un').trim().slice(0, 12),
    quantidade: Number(d.quantidade) || 0, minimo: Number(d.minimo) || 0,
    obs: String(d.obs || '').trim(),
    quem: req.viaChave ? 'agente' : (req.user.nome || req.user.email || 'staff'), criadoEm: new Date().toISOString(),
  };
  itens.push(novo);
  salvarJSON('estoque.json', itens);
  res.json({ ok: true, item: novo });
});
app.patch('/staff/api/estoque/:id', requirePublishOrSession, (req, res) => {
  if (!podeEstoque(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const itens = lerJSON('estoque.json', []);
  const it = itens.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  const d = req.body || {};
  for (const c of ['item', 'casa', 'categoria', 'unidade', 'obs']) if (d[c] != null) it[c] = String(d[c]).trim();
  if (d.quantidade !== undefined) it.quantidade = Number(d.quantidade) || 0;
  if (d.minimo !== undefined) it.minimo = Number(d.minimo) || 0;
  salvarJSON('estoque.json', itens);
  res.json({ ok: true, item: it });
});
app.delete('/staff/api/estoque/:id', requirePublishOrSession, (req, res) => {
  if (!podeEstoque(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const itens = lerJSON('estoque.json', []);
  salvarJSON('estoque.json', itens.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});
// Repor: joga o item na lista de compras (dedupe por refId 'estoque:<id>')
app.post('/staff/api/estoque/:id/repor', requirePublishOrSession, (req, res) => {
  if (!podeEstoque(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const it = lerJSON('estoque.json', []).find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  const compras = lerJSON('lista-compras.json', []);
  const refId = 'estoque:' + it.id;
  if (compras.some(c => c.refId === refId)) return res.json({ ok: true, duplicado: true });
  const qtd = (req.body && req.body.quantidade) || '';
  compras.push({
    id: novoId(), quantidade: String(qtd).trim(),
    nome: it.item + (it.casa ? ' (' + it.casa + ')' : ''),
    obs: 'Reposição de estoque' + (it.minimo ? ' · mínimo ' + it.minimo + ' ' + it.unidade : ''),
    origem: 'portal', quem: req.viaChave ? 'Estoque' : (req.user.nome || 'staff'), refId,
    criadoEm: new Date().toISOString(),
  });
  salvarJSON('lista-compras.json', compras);
  res.json({ ok: true });
});

// ============================ ONDA 7: Materiais de marca, Calendário editorial, Depoimentos, Redes ============================
function podeMkt(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'marketing') || podeArea(req.user, 'ceo'))); }

// ---- Galeria de materiais de marca (placas, QR, iscas, artes, logos, documentos) ----
const MATERIAIS_DIR = path.join(DATA_DIR, 'materiais');
fs.mkdirSync(MATERIAIS_DIR, { recursive: true });
const CAT_MATERIAL = ['placa', 'qr', 'isca', 'arte', 'logo', 'cartao', 'documento', 'video', 'outro'];
const EXT_MAT_OK = { '.jpg': 1, '.jpeg': 1, '.png': 1, '.webp': 1, '.gif': 1, '.svg': 1, '.pdf': 1, '.mp4': 1, '.zip': 1, '.docx': 1, '.pptx': 1 };
app.get('/staff/api/materiais', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req) && !(req.user && (podeArea(req.user, 'vendas') || podeArea(req.user, 'concierge')))) return res.status(403).json({ erro: 'Acesso restrito.' });
  let mats = lerJSON('materiais.json', []);
  if (req.query.categoria) mats = mats.filter(m => m.categoria === req.query.categoria);
  res.json({ materiais: mats.map(({ arquivo, ...m }) => m).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))), categorias: CAT_MATERIAL });
});
app.post('/staff/api/materiais', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req)) return res.status(403).json({ erro: 'Acesso restrito (Marketing/CEO).' });
  const d = req.body || {};
  const titulo = String(d.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'Informe o título do material.' });
  const mats = lerJSON('materiais.json', []);
  const base = {
    id: novoId(), titulo,
    categoria: CAT_MATERIAL.includes(d.categoria) ? d.categoria : 'outro',
    tags: String(d.tags || '').slice(0, 200), tipo: 'link', url: '',
    quem: req.viaChave ? 'agente' : (req.user.nome || req.user.email || 'staff'), criadoEm: new Date().toISOString(),
  };
  if (d.base64 && d.nomeArquivo) {
    const ext = path.extname(String(d.nomeArquivo)).toLowerCase().slice(0, 8);
    if (!EXT_MAT_OK[ext]) return res.status(400).json({ erro: 'Formato não suportado.' });
    const buf = Buffer.from(String(d.base64), 'base64');
    if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ erro: 'Arquivo acima de 20 MB.' });
    const arquivo = base.id + ext;
    try { fs.writeFileSync(path.join(MATERIAIS_DIR, arquivo), buf); } catch (e) { return res.status(400).json({ erro: 'Arquivo inválido.' }); }
    base.tipo = EXT_IMG[ext] ? 'imagem' : 'arquivo'; base.arquivo = arquivo; base.ext = ext; base.nomeArquivo = String(d.nomeArquivo).slice(0, 200);
  } else if (d.url) {
    base.tipo = 'link'; base.url = String(d.url).slice(0, 1000);
  } else return res.status(400).json({ erro: 'Envie um arquivo ou um link.' });
  mats.push(base);
  salvarJSON('materiais.json', mats);
  res.json({ ok: true, material: { ...base, arquivo: undefined } });
});
app.get('/staff/api/materiais/:id/arquivo', requireAuth, (req, res) => {
  const m = lerJSON('materiais.json', []).find(x => x.id === req.params.id);
  if (!m || !m.arquivo) return res.sendStatus(404);
  const alvo = path.join(MATERIAIS_DIR, m.arquivo);
  if (!fs.existsSync(alvo)) return res.sendStatus(404);
  res.sendFile(alvo);
});
app.delete('/staff/api/materiais/:id', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const mats = lerJSON('materiais.json', []);
  const m = mats.find(x => x.id === req.params.id);
  if (m && m.arquivo) { try { fs.unlinkSync(path.join(MATERIAIS_DIR, m.arquivo)); } catch {} }
  salvarJSON('materiais.json', mats.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ---- Calendário editorial (posts, artigos, campanhas B2B) ----
const EDIT_CANAIS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'blog', 'email', 'whatsapp', 'b2b', 'outro'];
const EDIT_STATUS = ['ideia', 'producao', 'agendado', 'publicado'];
app.get('/staff/api/marketing/editorial', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req) && !(req.user && podeArea(req.user, 'vendas'))) return res.status(403).json({ erro: 'Acesso restrito.' });
  const itens = lerJSON('editorial.json', []).sort((a, b) => String(a.data || '9999').localeCompare(String(b.data || '9999')));
  res.json({ itens, canais: EDIT_CANAIS, status: EDIT_STATUS });
});
app.post('/staff/api/marketing/editorial', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req)) return res.status(403).json({ erro: 'Acesso restrito (Marketing/CEO).' });
  const d = req.body || {};
  const titulo = String(d.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'Informe o título/pauta.' });
  const itens = lerJSON('editorial.json', []);
  const it = {
    id: novoId(), titulo,
    canal: EDIT_CANAIS.includes(d.canal) ? d.canal : 'instagram',
    data: String(d.data || '').trim(),
    status: EDIT_STATUS.includes(d.status) ? d.status : 'ideia',
    responsavel: String(d.responsavel || '').trim(), link: String(d.link || '').trim(), obs: String(d.obs || '').trim(),
    quem: req.viaChave ? 'agente' : (req.user.nome || req.user.email || 'staff'), criadoEm: new Date().toISOString(),
  };
  itens.push(it);
  salvarJSON('editorial.json', itens);
  res.json({ ok: true, item: it });
});
app.patch('/staff/api/marketing/editorial/:id', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const itens = lerJSON('editorial.json', []);
  const it = itens.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  const d = req.body || {};
  if (d.status && EDIT_STATUS.includes(d.status)) it.status = d.status;
  if (d.canal && EDIT_CANAIS.includes(d.canal)) it.canal = d.canal;
  for (const c of ['titulo', 'data', 'responsavel', 'link', 'obs']) if (d[c] != null) it[c] = String(d[c]).trim();
  salvarJSON('editorial.json', itens);
  res.json({ ok: true, item: it });
});
app.delete('/staff/api/marketing/editorial/:id', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const itens = lerJSON('editorial.json', []);
  salvarJSON('editorial.json', itens.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ---- Depoimentos: avaliações 5★ prontas para virar prova social (com consentimento) ----
app.get('/staff/api/marketing/depoimentos', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req) && !(req.user && (podeArea(req.user, 'vendas') || podeArea(req.user, 'concierge')))) return res.status(403).json({ erro: 'Acesso restrito.' });
  const estado = lerJSON('depoimentos-estado.json', {}); // { avaliacaoId: { publicado, aprovadoEm } }
  const min = Math.max(1, parseInt(req.query.min) || 4);
  const deps = lerAvaliacoes().filter(a => (Number(a.nota) || 0) >= min && String(a.comentario || '').trim())
    .map(a => ({ id: a.id, hospedeNome: a.hospedeNome || '—', nota: a.nota, comentario: a.comentario, imovel: a.imovel || '', imovelTitulo: a.imovelTitulo || '', criadoEm: a.criadoEm, publicado: !!(estado[a.id] && estado[a.id].publicado) }))
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  res.json({ depoimentos: deps, publicados: deps.filter(d => d.publicado).length });
});
app.post('/staff/api/marketing/depoimentos/:id', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req)) return res.status(403).json({ erro: 'Acesso restrito (Marketing/CEO).' });
  const estado = lerJSON('depoimentos-estado.json', {});
  const pub = !!(req.body && req.body.publicado);
  estado[req.params.id] = { publicado: pub, aprovadoEm: pub ? new Date().toISOString() : null };
  salvarJSON('depoimentos-estado.json', estado);
  res.json({ ok: true, publicado: pub });
});

// ---- Métricas de redes sociais (manual ou auto via rotina Metricool) ----
const REDES = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'google'];
app.get('/staff/api/marketing/redes', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req)) return res.status(403).json({ erro: 'Acesso restrito (Marketing/CEO).' });
  const itens = lerJSON('redes-metricas.json', []).sort((a, b) => String(b.mes).localeCompare(String(a.mes)) || String(a.rede).localeCompare(String(b.rede)));
  res.json({ itens, redes: REDES });
});
app.post('/staff/api/marketing/redes', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req)) return res.status(403).json({ erro: 'Acesso restrito (Marketing/CEO).' });
  const d = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(d.mes || '')) return res.status(400).json({ erro: 'Informe o mês (yyyy-MM).' });
  const rede = String(d.rede || '').trim();
  if (!rede) return res.status(400).json({ erro: 'Informe a rede.' });
  const itens = lerJSON('redes-metricas.json', []);
  const refId = d.mes + '|' + rede;
  let it = itens.find(x => x.refId === refId);
  const num = (v) => v != null && v !== '' ? Number(String(v).replace(/\D/g, '')) || 0 : 0;
  const dados = { seguidores: num(d.seguidores), alcance: num(d.alcance), engajamento: num(d.engajamento), posts: num(d.posts), obs: String(d.obs || '').trim() };
  if (it) { Object.assign(it, dados); it.atualizadoEm = new Date().toISOString(); }
  else { it = { id: novoId(), rede, mes: d.mes, refId, ...dados, quem: req.viaChave ? 'agente' : (req.user.nome || 'staff'), criadoEm: new Date().toISOString() }; itens.push(it); }
  salvarJSON('redes-metricas.json', itens);
  res.json({ ok: true, item: it });
});
app.delete('/staff/api/marketing/redes/:id', requirePublishOrSession, (req, res) => {
  if (!podeMkt(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const itens = lerJSON('redes-metricas.json', []);
  salvarJSON('redes-metricas.json', itens.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ============================ ONDA 8: Contratos, Fiscal, Consentimentos LGPD, Histórico de compras ============================

// ---- Arquivo de contratos (admin/jurídico) — com busca e alerta de reserva direta sem contrato ----
// LGPD: contratos podem conter CPF/RG → acesso só admin ou área jurídico; nunca exposto fora daqui.
const CONTRATOS_DIR = path.join(DATA_DIR, 'contratos');
fs.mkdirSync(CONTRATOS_DIR, { recursive: true });
const EXT_DOC = { '.pdf': 1, '.doc': 1, '.docx': 1, '.jpg': 1, '.jpeg': 1, '.png': 1 };
app.get('/staff/api/juridico/contratos', requireAuth, (req, res) => {
  if (!podeJuridico(req)) return res.status(403).json({ erro: 'Acesso restrito (Jurídico/admin).' });
  let cts = lerJSON('contratos.json', []);
  const q = semAcento(req.query.busca || '').trim();
  if (q) cts = cts.filter(c => semAcento([c.hospede, c.imovel, c.reservaId, c.tags, c.tipo].join(' ')).includes(q));
  res.json({ contratos: cts.map(({ arquivo, ...m }) => m).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))) });
});
app.post('/staff/api/juridico/contratos', requireAuth, (req, res) => {
  if (!podeJuridico(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const d = req.body || {};
  const hospede = String(d.hospede || '').trim();
  if (!hospede) return res.status(400).json({ erro: 'Informe o hóspede.' });
  const cts = lerJSON('contratos.json', []);
  const ct = {
    id: novoId(), hospede,
    imovel: String(d.imovel || '').trim(), reservaId: String(d.reservaId || '').trim(),
    tipo: ['hospedagem', 'evento', 'ambos'].includes(d.tipo) ? d.tipo : 'hospedagem',
    dataInicio: String(d.dataInicio || '').trim(), dataFim: String(d.dataFim || '').trim(),
    valor: d.valor != null && d.valor !== '' ? Number(String(d.valor).replace(',', '.')) || 0 : 0,
    assinado: !!d.assinado, tags: String(d.tags || '').slice(0, 200), obs: String(d.obs || '').trim(),
    quem: req.user.nome || req.user.email || 'staff', criadoEm: new Date().toISOString(),
  };
  if (d.base64 && d.nomeArquivo) {
    const ext = path.extname(String(d.nomeArquivo)).toLowerCase().slice(0, 8);
    if (!EXT_DOC[ext]) return res.status(400).json({ erro: 'Formato inválido (PDF, DOCX, imagem).' });
    const buf = Buffer.from(String(d.base64), 'base64');
    if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ erro: 'Arquivo acima de 20 MB.' });
    const arquivo = ct.id + ext;
    try { fs.writeFileSync(path.join(CONTRATOS_DIR, arquivo), buf); } catch (e) { return res.status(400).json({ erro: 'Arquivo inválido.' }); }
    ct.arquivo = arquivo; ct.nomeArquivo = String(d.nomeArquivo).slice(0, 200);
  }
  cts.push(ct);
  salvarJSON('contratos.json', cts);
  registrarAuditoria(req, 'contrato.arquivar', `${hospede}${ct.imovel ? ' · ' + ct.imovel : ''}`);
  res.json({ ok: true, contrato: { ...ct, arquivo: undefined } });
});
app.get('/staff/api/juridico/contratos/:id/arquivo', requireAuth, (req, res) => {
  if (!podeJuridico(req)) return res.sendStatus(403);
  const c = lerJSON('contratos.json', []).find(x => x.id === req.params.id);
  if (!c || !c.arquivo) return res.sendStatus(404);
  const alvo = path.join(CONTRATOS_DIR, c.arquivo);
  if (!fs.existsSync(alvo)) return res.sendStatus(404);
  res.sendFile(alvo);
});
app.delete('/staff/api/juridico/contratos/:id', requireAuth, (req, res) => {
  if (!podeJuridico(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const cts = lerJSON('contratos.json', []);
  const c = cts.find(x => x.id === req.params.id);
  if (c && c.arquivo) { try { fs.unlinkSync(path.join(CONTRATOS_DIR, c.arquivo)); } catch {} }
  salvarJSON('contratos.json', cts.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});
// Reservas DIRETAS recentes sem contrato arquivado (cruza Stays por criação × contratos.json).
app.get('/staff/api/juridico/contratos/pendentes', requireAuth, async (req, res) => {
  if (!podeJuridico(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias) || 30, 1), 90);
    const hoje = hojeBrasil();
    const de = new Date(Date.parse(hoje) - dias * 86400000).toISOString().slice(0, 10);
    const listings = await staysPaginado('/content/listings', {});
    const mapa = {}; listings.forEach(l => { mapa[l._id] = l.id; });
    const criadas = (await staysPaginado('/booking/reservations', { from: de, to: hoje, dateType: 'creation' }))
      .filter(r => !['canceled', 'blocked', 'maintenance'].includes(r.type) && normalizarPlataforma(r.partner).chave === 'direto');
    const cache = await resolverClientes(criadas.map(r => r._idclient));
    const cts = lerJSON('contratos.json', []);
    const temContrato = (r) => cts.some(c => (c.reservaId && c.reservaId === r.id) || (c.hospede && r._idclient && cache[r._idclient] && semAcento(c.hospede) === semAcento(cache[r._idclient])));
    const agora = Date.now();
    const pendentes = criadas.filter(r => !temContrato(r)).map(r => {
      const criadoIso = r.creationDate || r.createdAt || '';
      const horas = criadoIso ? Math.floor((agora - Date.parse(criadoIso)) / 3600000) : null;
      return {
        reserva: r.id, hospede: (r._idclient && cache[r._idclient]) || '—', imovel: mapa[r._idlisting] || '—',
        checkIn: r.checkInDate, checkOut: r.checkOutDate, criadoEm: criadoIso.slice(0, 10),
        horasDesde: horas, atrasado48h: horas != null && horas > 48,
      };
    }).sort((a, b) => (b.atrasado48h - a.atrasado48h) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
    res.json({ dias, pendentes, atrasados48h: pendentes.filter(p => p.atrasado48h).length });
  } catch (e) { console.error('[contratos pendentes]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});

// ---- Calendário fiscal (tributos e obrigações) ----
const STATUS_FISCAL = ['previsto', 'pago', 'dispensado'];
function podeFiscal(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'contador') || podeArea(req.user, 'financeiro') || podeArea(req.user, 'ceo'))); }
app.get('/staff/api/fiscal', requirePublishOrSession, (req, res) => {
  if (!podeFiscal(req)) return res.status(403).json({ erro: 'Acesso restrito (Contador/Financeiro).' });
  const hoje = hojeBrasil();
  const itens = lerJSON('fiscal.json', []).map(f => ({ ...f, atrasado: f.status === 'previsto' && f.vencimento && f.vencimento < hoje }))
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  res.json({ itens, hoje });
});
app.post('/staff/api/fiscal', requirePublishOrSession, (req, res) => {
  if (!podeFiscal(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const d = req.body || {};
  const tributo = String(d.tributo || '').trim();
  if (!tributo) return res.status(400).json({ erro: 'Informe o tributo/obrigação.' });
  const itens = lerJSON('fiscal.json', []);
  const refId = d.refId ? String(d.refId) : '';
  if (refId && itens.some(x => x.refId === refId)) return res.json({ ok: true, duplicado: true });
  const it = {
    id: novoId(), tributo, competencia: String(d.competencia || '').trim(),
    vencimento: String(d.vencimento || '').trim(),
    valor: d.valor != null && d.valor !== '' ? Number(String(d.valor).replace(',', '.')) || 0 : 0,
    status: STATUS_FISCAL.includes(d.status) ? d.status : 'previsto',
    periodicidade: String(d.periodicidade || '').trim(), obs: String(d.obs || '').trim(), refId,
    quem: req.viaChave ? 'agente' : (req.user.nome || 'staff'), criadoEm: new Date().toISOString(),
  };
  itens.push(it);
  salvarJSON('fiscal.json', itens);
  res.json({ ok: true, item: it });
});
app.patch('/staff/api/fiscal/:id', requirePublishOrSession, (req, res) => {
  if (!podeFiscal(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const itens = lerJSON('fiscal.json', []);
  const it = itens.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Item não encontrado.' });
  const d = req.body || {};
  if (d.status && STATUS_FISCAL.includes(d.status)) { it.status = d.status; it.pagoEm = d.status === 'pago' ? new Date().toISOString() : null; }
  for (const c of ['tributo', 'competencia', 'vencimento', 'periodicidade', 'obs']) if (d[c] != null) it[c] = String(d[c]).trim();
  if (d.valor !== undefined) it.valor = d.valor === '' || d.valor == null ? 0 : Number(String(d.valor).replace(',', '.')) || 0;
  salvarJSON('fiscal.json', itens);
  res.json({ ok: true, item: it });
});
app.delete('/staff/api/fiscal/:id', requirePublishOrSession, (req, res) => {
  if (!podeFiscal(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const itens = lerJSON('fiscal.json', []);
  salvarJSON('fiscal.json', itens.filter(x => x.id !== req.params.id && x.refId !== req.params.id));
  res.json({ ok: true });
});

// ---- Consentimentos LGPD (opt-in / opt-out por contato) ----
const STATUS_LGPD = ['opt-in', 'opt-out'];
function podeLGPD(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'juridico') || podeArea(req.user, 'ceo'))); }
app.get('/staff/api/lgpd/consentimentos', requirePublishOrSession, (req, res) => {
  if (!podeLGPD(req)) return res.status(403).json({ erro: 'Acesso restrito (Jurídico/admin).' });
  let itens = lerJSON('consentimentos.json', []);
  const q = semAcento(req.query.busca || '').trim();
  if (q) itens = itens.filter(c => semAcento([c.contato, c.canal, c.origem].join(' ')).includes(q));
  itens.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const optout = lerJSON('consentimentos.json', []).filter(c => c.status === 'opt-out').length;
  res.json({ itens, optout });
});
app.post('/staff/api/lgpd/consentimentos', requirePublishOrSession, (req, res) => {
  if (!podeLGPD(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const d = req.body || {};
  const contato = String(d.contato || '').trim();
  if (!contato) return res.status(400).json({ erro: 'Informe o contato (telefone/e-mail).' });
  const itens = lerJSON('consentimentos.json', []);
  const it = {
    id: novoId(), contato,
    canal: String(d.canal || '').trim(), origem: String(d.origem || '').trim(),
    status: STATUS_LGPD.includes(d.status) ? d.status : 'opt-in',
    data: String(d.data || '').trim() || new Date().toISOString().slice(0, 10),
    obs: String(d.obs || '').trim(),
    quem: req.viaChave ? 'agente' : (req.user.nome || 'staff'), criadoEm: new Date().toISOString(),
  };
  itens.push(it);
  salvarJSON('consentimentos.json', itens);
  res.json({ ok: true, item: it });
});
app.delete('/staff/api/lgpd/consentimentos/:id', requirePublishOrSession, (req, res) => {
  if (!podeLGPD(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const itens = lerJSON('consentimentos.json', []);
  salvarJSON('consentimentos.json', itens.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ---- Compras: registro de compras + histórico de preços (por item e fornecedor) ----
function podeCompras(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'compras') || podeArea(req.user, 'financeiro') || podeArea(req.user, 'ceo'))); }
app.get('/staff/api/compras/registro', requirePublishOrSession, (req, res) => {
  if (!podeCompras(req)) return res.status(403).json({ erro: 'Acesso restrito (Compras/Financeiro).' });
  const regs = lerJSON('compras-registro.json', []);
  // histórico de preços por item (nome normalizado)
  const porItem = {}; const porFornecedor = {};
  for (const r of regs) {
    const chave = semAcento(r.item);
    const pu = Number(r.valorUnitario) || 0;
    if (!porItem[chave]) porItem[chave] = { item: r.item, compras: 0, min: pu, max: pu, soma: 0, ultimo: null, ultimoData: '' };
    const p = porItem[chave]; p.compras++; p.soma += pu; if (pu < p.min || p.min === 0) p.min = pu; if (pu > p.max) p.max = pu;
    if (!p.ultimoData || r.data > p.ultimoData) { p.ultimoData = r.data; p.ultimo = pu; }
    const f = (r.fornecedor || '—').trim() || '—';
    porFornecedor[f] = (porFornecedor[f] || 0) + (Number(r.valorTotal) || 0);
  }
  const historico = Object.values(porItem).map(p => ({ item: p.item, compras: p.compras, min: p.min, medio: Math.round(p.soma / p.compras * 100) / 100, max: p.max, ultimo: p.ultimo, ultimoData: p.ultimoData })).sort((a, b) => a.item.localeCompare(b.item));
  const fornecedores = Object.entries(porFornecedor).map(([f, v]) => ({ fornecedor: f, total: Math.round(v * 100) / 100 })).sort((a, b) => b.total - a.total);
  res.json({ registros: regs.sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 200), historico, fornecedores });
});
app.post('/staff/api/compras/registro', requirePublishOrSession, (req, res) => {
  if (!podeCompras(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const d = req.body || {};
  const item = String(d.item || '').trim();
  if (!item) return res.status(400).json({ erro: 'Informe o item.' });
  const regs = lerJSON('compras-registro.json', []);
  const qtd = Number(d.quantidade) || 1;
  const vu = d.valorUnitario != null && d.valorUnitario !== '' ? Number(String(d.valorUnitario).replace(',', '.')) || 0 : 0;
  const reg = {
    id: novoId(), item, categoria: String(d.categoria || '').trim(),
    fornecedor: String(d.fornecedor || '').trim(), casa: String(d.casa || '').trim(),
    quantidade: qtd, valorUnitario: vu, valorTotal: Math.round(qtd * vu * 100) / 100,
    data: String(d.data || '').trim() || hojeBrasil(),
    quem: req.viaChave ? 'agente' : (req.user.nome || 'staff'), criadoEm: new Date().toISOString(),
  };
  regs.push(reg);
  salvarJSON('compras-registro.json', regs);
  res.json({ ok: true, registro: reg });
});
app.delete('/staff/api/compras/registro/:id', requirePublishOrSession, (req, res) => {
  if (!podeCompras(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const regs = lerJSON('compras-registro.json', []);
  salvarJSON('compras-registro.json', regs.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ============================ ONDA 9: FAQ, Pós-estadia, Revenue por casa, Login mágico ============================

// ---- FAQ oficial pesquisável (todos os logados leem; admin/marketing edita) ----
app.get('/staff/api/faq', requireAuth, (req, res) => {
  res.json({ itens: lerJSON('faq.json', []) });
});
app.put('/staff/api/faq', requirePublishOrSession, (req, res) => {
  if (!req.viaChave && !(req.user && (req.user.papel === 'admin' || podeArea(req.user, 'marketing')))) return res.status(403).json({ erro: 'Acesso restrito (Marketing/admin).' });
  const itens = Array.isArray(req.body && req.body.itens) ? req.body.itens : null;
  if (!itens) return res.status(400).json({ erro: 'Envie a lista de perguntas (itens).' });
  const limpos = itens.map(x => ({
    id: String(x.id || novoId()), categoria: String(x.categoria || '').slice(0, 80),
    pergunta: String(x.pergunta || '').slice(0, 400), resposta: String(x.resposta || '').slice(0, 4000),
  })).filter(x => x.pergunta && x.resposta);
  salvarJSON('faq.json', limpos);
  res.json({ ok: true, total: limpos.length });
});

// ---- Pós-estadia: check-outs recentes e quem já avaliou (concierge cobra a avaliação) ----
app.get('/staff/api/concierge/pos-estadia', requireAuth, async (req, res) => {
  if (!['concierge', 'vendas', 'marketing'].some(a => podeArea(req.user, a)) && req.user.papel !== 'admin')
    return res.status(403).json({ erro: 'Acesso restrito.' });
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias) || 14, 1), 60);
    const hoje = hojeBrasil();
    const de = new Date(Date.parse(hoje) - dias * 86400000).toISOString().slice(0, 10);
    const listings = await staysPaginado('/content/listings', {});
    const mapa = {}; listings.forEach(l => { mapa[l._id] = l.id; });
    const saidas = (await staysPaginado('/booking/reservations', { from: de, to: hoje, dateType: 'departure' }))
      .filter(r => !['canceled', 'blocked', 'maintenance'].includes(r.type) && r.checkOutDate <= hoje);
    const cache = await resolverClientes(saidas.map(r => r._idclient));
    const avaliacoes = lerAvaliacoes();
    const lista = saidas.map(r => {
      const avaliou = avaliacoes.some(a => a.reservaId === r.id || (a.staysClientId && a.staysClientId === r._idclient && a.imovel === (mapa[r._idlisting] || '')));
      return { reserva: r.id, hospede: (r._idclient && cache[r._idclient]) || '—', imovel: mapa[r._idlisting] || '—', checkOut: r.checkOutDate, avaliou };
    }).sort((a, b) => String(b.checkOut).localeCompare(String(a.checkOut)));
    res.set('Cache-Control', 'no-store');
    res.json({ dias, saidas: lista, semAvaliacao: lista.filter(x => !x.avaliou).length });
  } catch (e) { console.error('[pos-estadia]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});

// ---- Revenue por casa (mês vs mês anterior, receita líquida) ----
function mesAnterior(mes) { const [a, m] = mes.split('-').map(Number); const d = new Date(a, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
app.get('/staff/api/revenue/por-casa', requireAuth, async (req, res) => {
  if (!['revenue', 'ceo', 'financeiro'].some(a => podeArea(req.user, a)) && req.user.papel !== 'admin')
    return res.status(403).json({ erro: 'Acesso restrito.' });
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : hojeBrasil().slice(0, 7);
  const ant = mesAnterior(mes);
  try {
    const [atual, anterior] = await Promise.all([receitaPorImovelMes(mes), receitaPorImovelMes(ant)]);
    const codigos = [...new Set([...Object.keys(atual), ...Object.keys(anterior)])].filter(c => c && c !== '—').sort();
    const linhas = codigos.map(cod => {
      const a = atual[cod] || { receitaLiquida: 0, reservas: 0, noites: 0 };
      const b = anterior[cod] || { receitaLiquida: 0 };
      const va = Math.round(a.receitaLiquida), vb = Math.round(b.receitaLiquida);
      return { imovel: cod, atual: va, anterior: vb, variacao: vb ? Math.round(1000 * (va - vb) / vb) / 10 : null, reservas: a.reservas, noites: a.noites };
    }).sort((x, y) => y.atual - x.atual);
    res.json({ mes, mesAnterior: ant, linhas, totalAtual: linhas.reduce((s, l) => s + l.atual, 0), totalAnterior: linhas.reduce((s, l) => s + l.anterior, 0) });
  } catch (e) { console.error('[revenue por-casa]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});

// ---- Login mágico: admin gera um link de acesso curto p/ um usuário (enviado por WhatsApp) ----
// staff-core: link-acesso + login-mágico → nucleo/staff-core.js.
// ============================ ONDA 10: Recebimentos, Fechamento contábil + guias ============================
// (contratos-48h é um enriquecimento do endpoint /juridico/contratos/pendentes, feito lá em cima.)

// ---- Controle de recebimento de reservas (a API Stays NÃO expõe pagamento → controle manual) ----
// Marca sinal/saldo por reserva; painel destaca reservas diretas com check-in próximo sem sinal.
function podeReceb(req) { return req.viaChave || (req.user && (req.user.papel === 'admin' || podeArea(req.user, 'financeiro') || podeArea(req.user, 'vendas') || podeArea(req.user, 'ceo'))); }
app.get('/staff/api/financeiro/recebimentos', requireAuth, async (req, res) => {
  if (!podeReceb(req)) return res.status(403).json({ erro: 'Acesso restrito (Financeiro/Vendas).' });
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias) || 21, 1), 90);
    const hoje = hojeBrasil();
    const ate = new Date(Date.parse(hoje) + dias * 86400000).toISOString().slice(0, 10);
    const listings = await staysPaginado('/content/listings', {});
    const mapa = {}; listings.forEach(l => { mapa[l._id] = l.id; });
    // reservas diretas com chegada de hoje até +N dias
    const arr = (await staysPaginado('/booking/reservations', { from: hoje, to: ate, dateType: 'arrival' }))
      .filter(r => !['canceled', 'blocked', 'maintenance'].includes(r.type) && normalizarPlataforma(r.partner).chave === 'direto');
    const cache = await resolverClientes(arr.map(r => r._idclient));
    const rec = lerJSON('recebimentos.json', {});
    const lista = arr.map(r => {
      const e = rec[r.id] || {};
      const diasAte = Math.round((Date.parse(r.checkInDate) - Date.parse(hoje)) / 86400000);
      return {
        reserva: r.id, hospede: (r._idclient && cache[r._idclient]) || '—', imovel: mapa[r._idlisting] || '—',
        checkIn: r.checkInDate, checkOut: r.checkOutDate, diasAte,
        valorTotal: (r.price && r.price._f_total) || 0,
        sinalRecebido: !!e.sinalRecebido, saldoRecebido: !!e.saldoRecebido, obs: e.obs || '',
        alerta: !e.sinalRecebido && diasAte <= 7,
      };
    }).sort((a, b) => (b.alerta - a.alerta) || String(a.checkIn).localeCompare(String(b.checkIn)));
    res.set('Cache-Control', 'no-store');
    res.json({ dias, reservas: lista, alertas: lista.filter(x => x.alerta).length });
  } catch (e) { console.error('[recebimentos]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});
app.post('/staff/api/financeiro/recebimentos/:reservaId', requireAuth, (req, res) => {
  if (!podeReceb(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const rec = lerJSON('recebimentos.json', {});
  const d = req.body || {};
  const e = rec[req.params.reservaId] || {};
  if (d.sinalRecebido != null) e.sinalRecebido = !!d.sinalRecebido;
  if (d.saldoRecebido != null) e.saldoRecebido = !!d.saldoRecebido;
  if (d.obs != null) e.obs = String(d.obs).slice(0, 200);
  e.atualizadoEm = new Date().toISOString(); e.quem = req.user.nome || req.user.email || 'staff';
  rec[req.params.reservaId] = e;
  salvarJSON('recebimentos.json', rec);
  res.json({ ok: true });
});

// ---- Fechamento contábil: checklist mensal + guias/comprovantes ----
const FISCAL_DOCS_DIR = path.join(DATA_DIR, 'fiscal-docs');
fs.mkdirSync(FISCAL_DOCS_DIR, { recursive: true });
const CHECKLIST_FECHAMENTO = [
  { chave: 'extrato', rot: 'Extrato bancário lançado (C6)' },
  { chave: 'recebiveis', rot: 'Contas a receber baixadas' },
  { chave: 'despesas', rot: 'Despesas categorizadas' },
  { chave: 'guias', rot: 'Guias/tributos pagos' },
  { chave: 'dre', rot: 'DRE conferido' },
  { chave: 'relatorio', rot: 'Relatório enviado ao contador' },
];
app.get('/staff/api/contabil/fechamento', requirePublishOrSession, (req, res) => {
  if (!podeFiscal(req)) return res.status(403).json({ erro: 'Acesso restrito (Contador/Financeiro).' });
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : hojeBrasil().slice(0, 7);
  const todos = lerJSON('fechamento.json', {});
  const estado = todos[mes] || { itens: {}, obs: '' };
  const docs = lerJSON('fiscal-docs.json', []).filter(d => d.mes === mes).map(({ arquivo, ...m }) => m);
  res.json({ mes, checklist: CHECKLIST_FECHAMENTO, estado, docs });
});
app.post('/staff/api/contabil/fechamento', requirePublishOrSession, (req, res) => {
  if (!podeFiscal(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const d = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(d.mes || '')) return res.status(400).json({ erro: 'Informe o mês (yyyy-MM).' });
  const todos = lerJSON('fechamento.json', {});
  const estado = todos[d.mes] || { itens: {}, obs: '' };
  if (d.chave && CHECKLIST_FECHAMENTO.some(x => x.chave === d.chave)) estado.itens[d.chave] = !!d.valor;
  if (d.obs != null) estado.obs = String(d.obs).slice(0, 500);
  estado.atualizadoEm = new Date().toISOString();
  todos[d.mes] = estado;
  salvarJSON('fechamento.json', todos);
  res.json({ ok: true, estado });
});
app.post('/staff/api/contabil/documentos', requirePublishOrSession, (req, res) => {
  if (!podeFiscal(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const d = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(d.mes || '')) return res.status(400).json({ erro: 'Informe o mês.' });
  if (!d.base64 || !d.nomeArquivo) return res.status(400).json({ erro: 'Envie o arquivo.' });
  const ext = path.extname(String(d.nomeArquivo)).toLowerCase().slice(0, 8);
  if (!EXT_DOC[ext]) return res.status(400).json({ erro: 'Formato inválido (PDF, imagem…).' });
  const buf = Buffer.from(String(d.base64), 'base64');
  if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ erro: 'Arquivo acima de 20 MB.' });
  const docs = lerJSON('fiscal-docs.json', []);
  const id = novoId(), arquivo = id + ext;
  try { fs.writeFileSync(path.join(FISCAL_DOCS_DIR, arquivo), buf); } catch (e) { return res.status(400).json({ erro: 'Arquivo inválido.' }); }
  const doc = { id, mes: d.mes, titulo: String(d.titulo || d.nomeArquivo).slice(0, 120), arquivo, ext, nomeArquivo: String(d.nomeArquivo).slice(0, 200), quem: req.viaChave ? 'agente' : (req.user.nome || 'staff'), criadoEm: new Date().toISOString() };
  docs.push(doc);
  salvarJSON('fiscal-docs.json', docs);
  res.json({ ok: true, doc: { ...doc, arquivo: undefined } });
});
app.get('/staff/api/contabil/documentos/:id/arquivo', requireAuth, (req, res) => {
  if (!podeFiscal(req)) return res.sendStatus(403);
  const doc = lerJSON('fiscal-docs.json', []).find(x => x.id === req.params.id);
  if (!doc) return res.sendStatus(404);
  const alvo = path.join(FISCAL_DOCS_DIR, doc.arquivo);
  if (!fs.existsSync(alvo)) return res.sendStatus(404);
  res.sendFile(alvo);
});
app.delete('/staff/api/contabil/documentos/:id', requirePublishOrSession, (req, res) => {
  if (!podeFiscal(req)) return res.status(403).json({ erro: 'Acesso restrito.' });
  const docs = lerJSON('fiscal-docs.json', []);
  const doc = docs.find(x => x.id === req.params.id);
  if (doc) { try { fs.unlinkSync(path.join(FISCAL_DOCS_DIR, doc.arquivo)); } catch {} }
  salvarJSON('fiscal-docs.json', docs.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ============================ Agenda: pedidos de evento (portal → Claude executa) ============================
// O portal registra pedidos de CRIAR/EXCLUIR evento; uma rotina do Claude (com acesso ao Google
// Calendar) lê os pendentes, efetiva e marca como feito (PATCH).
app.get('/staff/api/agenda/pedidos', requirePublishOrSession, (req, res) => {
  let lista = lerJSON('agenda-pedidos.json', []);
  if (req.query.status) lista = lista.filter(p => p.status === req.query.status);
  res.json({ pedidos: lista });
});

app.post('/staff/api/agenda/pedidos', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const acao = d.acao === 'excluir' ? 'excluir' : 'criar';
  const titulo = String(d.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'Informe o título do evento.' });
  const pedidos = lerJSON('agenda-pedidos.json', []);
  const pedido = {
    id: novoId(), acao, titulo,
    data: String(d.data || '').trim(),            // yyyy-MM-dd
    hora: String(d.hora || '').trim(),             // HH:mm (vazio = dia inteiro)
    duracaoMin: Number(d.duracaoMin) || 60,
    descricao: String(d.descricao || '').trim(),
    local: String(d.local || '').trim(),
    eventoId: String(d.eventoId || '').trim(),       // p/ excluir direto pelo id do evento (Google)
    refPedidoId: String(d.refPedidoId || '').trim(), // pedido de criação que originou esta exclusão
    status: 'pendente',
    quem: req.viaChave ? (String(d.quem || '').trim() || 'portal') : (req.user.nome || req.user.email || 'staff'),
    criadoEm: new Date().toISOString(), processadoEm: null, resultado: '',
  };
  pedidos.push(pedido);
  salvarJSON('agenda-pedidos.json', pedidos);
  res.json({ ok: true, pedido });
});

app.delete('/staff/api/agenda/pedidos/:id', requirePublishOrSession, (req, res) => {
  const pedidos = lerJSON('agenda-pedidos.json', []);
  const rest = pedidos.filter(p => p.id !== req.params.id);
  salvarJSON('agenda-pedidos.json', rest);
  res.json({ ok: true, removidos: pedidos.length - rest.length });
});

app.patch('/staff/api/agenda/pedidos/:id', requirePublishOrSession, (req, res) => {
  const pedidos = lerJSON('agenda-pedidos.json', []);
  const p = pedidos.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const d = req.body || {};
  if (['feito', 'erro', 'pendente'].includes(d.status)) p.status = d.status;
  if (d.resultado != null) p.resultado = String(d.resultado);
  if (d.eventoId != null) p.eventoId = String(d.eventoId);
  p.processadoEm = new Date().toISOString();
  salvarJSON('agenda-pedidos.json', pedidos);
  res.json({ ok: true, pedido: p });
});

// ============================ CALENDÁRIO (réplica do calendário da Stays) ============================
// Lê propriedades + reservas AO VIVO da API Stays (mesma fonte do painel oficial) e devolve em
// formato pronto para a linha do tempo do Portal Staff. SOMENTE LEITURA. Auth: qualquer logado (equipe).

// Paginação genérica (a API Stays devolve no máximo 20 por página via limit/skip).
async function staysPaginado(pathname, params) {
  const limit = 20; let skip = 0; const out = [];
  for (let i = 0; i < 500; i++) {
    const page = await stays(pathname, { ...(params || {}), limit, skip });
    const arr = Array.isArray(page) ? page : (page && Array.isArray(page.results) ? page.results : []);
    out.push(...arr);
    if (arr.length < limit) break;
    skip += limit;
  }
  return out;
}

// Cache persistente de nome de cliente (id -> nome): a reserva só traz _idclient, não o nome.
let _cacheClientes = null;
function clientesCache() { if (!_cacheClientes) _cacheClientes = lerJSON('clientes-cache.json', {}); return _cacheClientes; }
async function resolverClientes(ids) {
  const cache = clientesCache();
  const faltam = [...new Set(ids.filter(id => id && !cache[id]))];
  const CONC = 6;
  for (let i = 0; i < faltam.length; i += CONC) {
    await Promise.all(faltam.slice(i, i + CONC).map(async id => {
      try {
        const cli = await stays(`/booking/clients/${id}`);
        cache[id] = (cli && (cli.name || [cli.fName, cli.lName].filter(Boolean).join(' '))) || '—';
      } catch (e) { cache[id] = '—'; }
    }));
  }
  if (faltam.length) salvarJSON('clientes-cache.json', cache);
  return cache;
}

function normalizarPlataforma(partner) {
  const raw = (partner && partner.name ? String(partner.name) : '').toLowerCase();
  if (!raw) return { chave: 'direto', rotulo: 'Direta' };
  if (raw.includes('airbnb')) return { chave: 'airbnb', rotulo: 'Airbnb' };
  if (raw.includes('booking')) return { chave: 'booking', rotulo: 'Booking' };
  if (raw.includes('decolar') || raw.includes('despegar')) return { chave: 'decolar', rotulo: 'Decolar' };
  if (raw.includes('expedia')) return { chave: 'expedia', rotulo: 'Expedia' };
  if (raw.includes('vrbo') || raw.includes('homeaway')) return { chave: 'vrbo', rotulo: 'Vrbo' };
  if (raw.includes('google')) return { chave: 'google', rotulo: 'Google' };
  if (raw.includes('website') || raw.includes('site')) return { chave: 'site', rotulo: 'Site' };
  // Reservas criadas pela API externa (inclusive as feitas por este portal) e diretas -> "Direta"
  if (raw.includes('external') || raw.includes('api') || raw.includes('direct') || raw.includes('manual')) return { chave: 'direto', rotulo: 'Direta' };
  return { chave: 'outro', rotulo: partner.name };
}
const CAL_STATUS = { booked: 'Reservado', reserved: 'Pré-reserva', contract: 'Contrato', blocked: 'Bloqueio', maintenance: 'Manutenção', canceled: 'Cancelada' };

app.get('/staff/api/calendario', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || ''))
      return res.status(400).json({ erro: 'Parâmetros from e to (yyyy-MM-dd) são obrigatórios.' });

    // Propriedades (linhas) — só anúncios ativos; inteiros primeiro, depois quartos, por nome.
    const listings = await staysPaginado('/content/listings', {});
    const ordemSub = { entire_home: 0, private_room: 1 };
    const propriedades = listings.filter(l => l.status === 'active').map(l => ({
      idlisting: l._id, codigo: l.id,
      titulo: (l.internalName || (l._mstitle && l._mstitle.pt_BR) || l.id),
      subtype: l.subtype || ''
    })).sort((a, b) => (ordemSub[a.subtype] ?? 9) - (ordemSub[b.subtype] ?? 9) || a.titulo.localeCompare(b.titulo, 'pt-BR'));

    // Reservas (barras) — interseção com a janela; ignora canceladas.
    const brutas = await staysPaginado('/booking/reservations', { from, to, dateType: 'included' });
    const validas = brutas.filter(r => r.type !== 'canceled');
    const cache = await resolverClientes(validas.map(r => r._idclient));

    const reservas = validas.map(r => {
      const ehBloqueio = r.type === 'blocked' || r.type === 'maintenance';
      const plat = normalizarPlataforma(r.partner);
      const gd = r.guestsDetails || {};
      const noites = (r.checkInDate && r.checkOutDate)
        ? Math.max(0, Math.round((Date.parse(r.checkOutDate) - Date.parse(r.checkInDate)) / 86400000)) : null;
      return {
        id: r.id || r._id, idlisting: r._idlisting,
        hospede: ehBloqueio ? (CAL_STATUS[r.type] || 'Bloqueio') : ((r._idclient && cache[r._idclient]) || '—'),
        bloqueio: ehBloqueio,
        plataforma: ehBloqueio ? '' : plat.chave, plataformaRotulo: ehBloqueio ? '' : plat.rotulo,
        status: r.type, statusRotulo: CAL_STATUS[r.type] || r.type,
        checkIn: r.checkInDate, checkOut: r.checkOutDate, noites,
        hospedes: r.guests || ((gd.adults || 0) + (gd.children || 0)) || null,
        adultos: gd.adults ?? null, criancas: gd.children ?? null, bebes: gd.infants ?? null,
        valorTotal: (r.price && r.price._f_total != null) ? r.price._f_total : null,
        moeda: (r.price && r.price.currency) || 'BRL',
        reservationUrl: r.reservationUrl || ''
      };
    });

    res.set('Cache-Control', 'no-store');
    res.json({ from, to, geradoEm: new Date().toISOString(), propriedades, reservas });
  } catch (e) {
    console.error('[calendario]', e.message);
    res.status(502).json({ erro: 'Falha ao consultar a Stays.' });
  }
});

// ============================ MÓDULOS STAYS: Hóspedes e Reservas ============================
// Hóspedes e busca de reservas = SOMENTE LEITURA (qualquer logado). Criar reserva/bloqueio = ADMIN.
// Tudo ao vivo da mesma API da Stays.

// Envia (POST/PATCH/DELETE) para a Stays — o helper stays() só faz GET.
async function staysPost(pathname, body, method = 'POST') {
  const r = await fetch(STAYS_BASE + pathname, {
    method, headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Stays ${r.status}: ${await r.text()}`);
  return r.json().catch(() => ({}));
}

// Lista de clientes (hóspedes) em cache (5 min) — a busca filtra/pagina a partir daqui.
let _staysClientes = { quando: 0, lista: [] };
async function getStaysClientes() {
  if (Date.now() - _staysClientes.quando < 5 * 60 * 1000 && _staysClientes.lista.length) return _staysClientes.lista;
  const todos = await staysPaginado('/booking/clients', {});
  _staysClientes = { quando: Date.now(), lista: todos };
  return todos;
}
function invalidarStaysClientes() { _staysClientes = { quando: 0, lista: [] }; } // invalida o cache ao criar cliente/reserva
const nomeCliente = c => c.name || [c.fName, c.lName].filter(Boolean).join(' ') || '—';

// Proxy da API Stays (imóveis/hóspedes/reservas/disponibilidade/criar) → extraído para nucleo/stays-proxy.js (montado no fim).

// =====================================================================
// ÁREA DO HÓSPEDE — área logada e exclusiva para hóspedes/ex-hóspedes (/hospede)
// Irmã do /staff, porém ISOLADA: cookie próprio (hospede_token), claim tipo:'hospede',
// NUNCA cruza com as permissões do staff. Fase 1 (MVP): cadastro automático na reserva
// direta/WhatsApp + login/troca de senha + ver minha reserva + info reservada da propriedade.
// Segredos só por env (repositório público). bcrypt+JWT reaproveitados do staff.
// =====================================================================
const HOSP_COOKIE = 'hospede_token';
const AREA_HOSPEDE_URL = process.env.AREA_HOSPEDE_URL || 'https://villela-stay-backend.onrender.com/hospede';

const lerHospedes = () => lerJSON('hospedes.json', []);
const salvarHospedes = (h) => salvarJSON('hospedes.json', h);
const lerPropInfo = () => lerJSON('propriedades-info.json', {});
function semSenhaHosp(h) { const { senhaHash, pushSubs, ...resto } = h; return resto; }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function addDias(iso, n) { const d = new Date(String(iso) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function gerarSenhaTemp() { return (crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'Aa1').slice(0, 10); }

// ---- envio de credenciais (e-mail por SMTP do Gmail + WhatsApp pelo webhook do Make) ----
let _transporteEmail = null; // null = ainda não resolvido; false = indisponível
function transporteEmail() {
  if (_transporteEmail !== null) return _transporteEmail;
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASS;
  if (!user || !pass) { console.warn('[email] defina GMAIL_USER/GMAIL_APP_PASS no Render para enviar e-mails.'); return (_transporteEmail = false); }
  try {
    const nodemailer = require('nodemailer');
    _transporteEmail = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user, pass } });
  } catch (e) { console.warn('[email] nodemailer indisponível:', e.message); _transporteEmail = false; }
  return _transporteEmail;
}
async function enviarEmail(to, assunto, html) {
  const t = transporteEmail();
  if (!t || !to) return false;
  try { await t.sendMail({ from: `"Villela Stay" <${process.env.GMAIL_USER}>`, to, subject: assunto, html }); return true; }
  catch (e) { console.error('[email]', e.message); return false; }
}
async function enviarWhatsApp(to, text) {
  if (!process.env.MAKE_WA_WEBHOOK) return false;
  const num = String(to || '').replace(/\D/g, '');
  if (!num) return false;
  try { await fetch(process.env.MAKE_WA_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: num, text }) }); return true; }
  catch (e) { console.error('[wa]', e.message); return false; }
}
async function enviarCredenciais(conta, senha) {
  const login = conta.email || conta.telefone;
  const nome = (conta.nome || 'hóspede').split(' ')[0];
  const txt = `Olá, ${nome}! 👋\n\nSua Área do Hóspede da Villela Stay já está pronta. Nela você consulta a sua reserva e recebe as informações da casa (Wi-Fi, acesso, guia local).\n\n🔗 Acesse: ${AREA_HOSPEDE_URL}\n👤 Login: ${login}\n🔑 Senha temporária: ${senha}\n\nNo primeiro acesso você define uma nova senha. Qualquer dúvida, é só chamar por aqui!`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#2b2d2f">
    <div style="background:#1B2A4A;color:#F8F9FA;padding:18px 22px;border-radius:10px 10px 0 0"><strong style="font-size:18px">Villela Stay</strong><br><span style="font-size:13px;color:#C9A227">Área do Hóspede</span></div>
    <div style="border:1px solid #E2E6EC;border-top:none;padding:22px;border-radius:0 0 10px 10px">
      <p>Olá, <strong>${escHtml(nome)}</strong>! 👋</p>
      <p>Sua <strong>Área do Hóspede</strong> já está pronta. Nela você consulta a sua reserva e recebe as informações da casa (Wi-Fi, acesso, guia local).</p>
      <p style="margin:18px 0"><a href="${AREA_HOSPEDE_URL}" style="background:#0E7490;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Entrar na Área do Hóspede</a></p>
      <table style="font-size:14px;border-collapse:collapse"><tr><td style="padding:3px 12px 3px 0">👤 Login:</td><td><strong>${escHtml(login)}</strong></td></tr>
      <tr><td style="padding:3px 12px 3px 0">🔑 Senha temporária:</td><td><strong>${escHtml(senha)}</strong></td></tr></table>
      <p style="font-size:13px;color:#6b7075;margin-top:16px">No primeiro acesso você define uma nova senha. Se você não reconhece esta mensagem, basta ignorá-la.</p>
    </div></div>`;
  const r = { email: false, whatsapp: false };
  if (conta.email) r.email = await enviarEmail(conta.email, 'Sua Área do Hóspede — Villela Stay', html);
  if (conta.telefone) r.whatsapp = await enviarWhatsApp(conta.telefone, txt);
  console.log('[hospede cred]', login, '— email:', r.email, 'whatsapp:', r.whatsapp);
  return r;
}

// Cria a conta do hóspede a partir do cliente da Stays e dispara as credenciais. Idempotente.
async function criarContaHospede(cli, clientId) {
  if (!cli || !clientId) return;
  const hospedes = lerHospedes();
  if (hospedes.some(h => h.staysClientId === clientId)) return; // já existe
  const email = ((cli.emails && cli.emails[0] && (cli.emails[0].address || cli.emails[0])) || cli.email || '').trim().toLowerCase();
  const fone = (cli.phones && cli.phones[0] && (cli.phones[0].iso || cli.phones[0].number)) || '';
  const nome = (cli.fName ? (cli.fName + ' ' + (cli.lName || '')).trim() : (cli.name || '')) || '';
  if (!email && !fone) { console.log('[hospede auto] cliente sem e-mail/telefone — conta não criada:', clientId); return; }
  if (email && hospedes.some(h => h.email === email)) return; // não duplica por e-mail
  const senha = gerarSenhaTemp();
  const conta = {
    id: novoId(), nome, email, telefone: normFone(fone),
    senhaHash: bcrypt.hashSync(senha, 10), staysClientId: clientId,
    precisaTrocarSenha: true, ativo: true, criadoEm: new Date().toISOString(), ultimoLogin: null,
  };
  hospedes.push(conta);
  salvarHospedes(hospedes);
  await enviarCredenciais(conta, senha).catch(e => console.error('[hospede cred]', e.message));
  console.log('[hospede auto] conta criada', conta.id, email || fone);
}

// Info reservada da propriedade: mescla _padrao com o registro específico do código.
function infoPropriedade(codigo) {
  const all = lerPropInfo();
  const padrao = all._padrao || {};
  const esp = all[codigo] || {};
  return {
    ...padrao, ...esp,
    wifi: esp.wifi || padrao.wifi || null,
    acesso: esp.acesso || padrao.acesso || null,
    contatos: esp.contatos || padrao.contatos || '',
    checkinHora: esp.checkinHora || padrao.checkinHora || '',
    checkoutHora: esp.checkoutHora || padrao.checkoutHora || '',
    guiaUrl: esp.guiaUrl || padrao.guiaUrl || '',
  };
}

// Reservas do hóspede (do objeto do cliente na Stays, que já traz reservations).
// Com `enriquecer`, busca o partner de cada reserva ativa (o objeto do cliente NÃO traz partner;
// só o GET individual traz) para classificar direta vs OTA → `podeAlterar` (só direta/WhatsApp).
const RE_OTA = /airbnb|booking|decolar|despegar|expedia|vrbo|homeaway|google/i;
async function reservasDoHospede(h, enriquecer) {
  if (!h.staysClientId) return [];
  const cli = await stays(`/booking/clients/${h.staysClientId}`);
  const mapa = await getListingMap();
  const lista = (Array.isArray(cli.reservations) ? cli.reservations : []).map(r => ({
    id: r.id || r._id, status: r.type, statusRotulo: CAL_STATUS[r.type] || r.type,
    checkin: r.checkInDate, checkout: r.checkOutDate,
    imovel: (mapa[r._idlisting] && mapa[r._idlisting].codigo) || '',
    imovelTitulo: (mapa[r._idlisting] && mapa[r._idlisting].titulo) || '',
    valor: (r.price && r.price._f_total) || 0, moeda: (r.price && r.price.currency) || 'BRL',
    hospedes: r.guests || (r.guestsDetails && r.guestsDetails.adults) || null,
    plataforma: '', podeAlterar: false, // NÃO expor reservationUrl ao hóspede (aponta p/ o painel admin da Stays)
  })).sort((a, b) => String(b.checkin).localeCompare(String(a.checkin)));
  if (enriquecer) {
    const ativas = lista.filter(r => r.status !== 'canceled' && r.status !== 'blocked');
    await Promise.all(ativas.map(async r => {
      try {
        const full = await stays(`/booking/reservations/${r.id}`);
        const nome = (full.partner && full.partner.name) || '';
        r.plataforma = nome ? normalizarPlataforma(full.partner).rotulo : 'Direta';
        r.podeAlterar = !RE_OTA.test(nome); // sem partner ou partner direto = pode pedir alteração
      } catch (e) { r.plataforma = ''; r.podeAlterar = false; } // na dúvida, não habilita
    }));
  }
  return lista;
}

// ---- pedidos do hóspede (Fase 2): alteração de reserva e autorização de evento ----
const lerPedidosHosp = () => lerJSON('pedidos-hospede.json', []);
const salvarPedidosHosp = (p) => salvarJSON('pedidos-hospede.json', p);
const STATUS_PEDIDO = ['novo', 'em_analise', 'aprovado', 'recusado', 'respondido'];
const AUGUSTO_WA = process.env.AUGUSTO_WA || '556192113000';
// Catálogo de serviços extras (Fase 3) — editável pelo admin (servicos.json); estes são os PADRÕES.
const SERVICOS_PADRAO = [
  { id: 'cafe', emoji: '☕', nome: 'Café da manhã', desc: 'Café da manhã completo servido na sua hospedagem.', preco: 'Sob consulta', ativo: true },
  { id: 'chef', emoji: '🍷', nome: 'Jantar com personal chef', desc: 'Menu personalizado preparado por um chef na sua casa — ótimo para um jantar romântico.', preco: 'Sob consulta', ativo: true },
  { id: 'buffet', emoji: '🎉', nome: 'Buffet para evento', desc: 'Buffet completo para a sua comemoração na hospedagem.', preco: 'Sob orçamento', ativo: true },
  { id: 'traslado', emoji: '🚐', nome: 'Traslado de aeroporto', desc: 'Transporte entre o aeroporto e a hospedagem, na ida e/ou na volta.', preco: 'Sob consulta', ativo: true },
  { id: 'delivery', emoji: '🛒', nome: 'Delivery de compras e bebidas', desc: 'Fazemos as compras de mercado e bebidas e entregamos na casa antes/durante a estadia.', preco: 'Compras + taxa de serviço', ativo: true },
];
const lerServicos = () => lerJSON('servicos.json', SERVICOS_PADRAO);
const salvarServicos = (s) => salvarJSON('servicos.json', s);
// Config do programa de fidelidade — editável pelo admin (fidelidade-config.json).
const FID_PADRAO = {
  recorrenteTexto: 'Como hóspede recorrente da Villela Stay, você tem condições especiais para voltar. Fale com a gente!',
  novoTexto: 'Volte a se hospedar com a gente e aproveite condições especiais de cliente.',
  indicacaoTexto: 'Indique alguém que vai amar se hospedar com a gente. Ao se hospedar, você ganha um crédito — combinamos com você pelo WhatsApp.',
};
const lerFidConfig = () => Object.assign({}, FID_PADRAO, lerJSON('fidelidade-config.json', {}));
const salvarFidConfig = (c) => salvarJSON('fidelidade-config.json', c);

// ---- Vitrines de conteúdo da Área do Hóspede (Gastronomia, Turismo, Pacotes) ----
// Editável pelo admin OU PUBLISH_KEY (conteudo-hospede.json). Itens: { id, titulo, desc, emoji, link, ativo }.
const mapa = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q + ', Brasília');
const wapp = (t) => 'https://wa.me/556191935013?text=' + encodeURIComponent(t);
const SECOES_CONTEUDO = ['gastronomia', 'turismo', 'pacotes'];
const CONTEUDO_PADRAO = {
  gastronomia: {
    intro: 'Nossas sugestões para comer bem em Brasília. Quer reserva ou recomendação sob medida? Fale com o concierge.',
    itens: [
      { id: 'pontao', emoji: '🌅', titulo: 'Pontão do Lago Sul', desc: 'Polo gastronômico à beira do Lago Paranoá, com bares e restaurantes — ótimo para o pôr do sol.', link: mapa('Pontão do Lago Sul'), ativo: true },
      { id: 'universal', emoji: '🍽️', titulo: 'Universal Diner', desc: 'Cozinha autoral premiada, uma das referências da cidade.', link: mapa('Universal Diner'), ativo: true },
      { id: 'mangai', emoji: '🌵', titulo: 'Mangai', desc: 'Comida nordestina farta, em buffet — clássico para conhecer a culinária regional.', link: mapa('Mangai Brasília'), ativo: true },
      { id: 'fogodechao', emoji: '🥩', titulo: 'Fogo de Chão', desc: 'Churrascaria de rodízio premium, tradição brasiliense.', link: mapa('Fogo de Chão Brasília'), ativo: true },
      { id: 'domfrancisco', emoji: '🍷', titulo: 'Dom Francisco', desc: 'Restaurante tradicional, ideal para um jantar especial.', link: mapa('Dom Francisco Brasília'), ativo: true },
    ],
  },
  turismo: {
    intro: 'Roteiros e pontos imperdíveis de Brasília — patrimônio da humanidade pela UNESCO. Toque para abrir no mapa.',
    itens: [
      { id: 'congresso', emoji: '🏛️', titulo: 'Congresso Nacional', desc: 'Ícone de Niemeyer, com visitas guiadas gratuitas.', link: mapa('Congresso Nacional'), ativo: true },
      { id: 'catedral', emoji: '⛪', titulo: 'Catedral Metropolitana', desc: 'Obra-prima de Niemeyer, com vitrais de Marianne Peretti.', link: mapa('Catedral Metropolitana de Brasília'), ativo: true },
      { id: 'pracatrespoderes', emoji: '🗽', titulo: 'Praça dos Três Poderes', desc: 'Coração cívico da capital, com museus e esculturas.', link: mapa('Praça dos Três Poderes'), ativo: true },
      { id: 'pontejk', emoji: '🌉', titulo: 'Ponte JK', desc: 'Arquitetura premiada sobre o lago — lindíssima ao entardecer.', link: mapa('Ponte JK Brasília'), ativo: true },
      { id: 'dombosco', emoji: '🔷', titulo: 'Santuário Dom Bosco', desc: 'Interior tomado por vitrais azuis — uma das vistas mais bonitas da cidade.', link: mapa('Santuário Dom Bosco'), ativo: true },
      { id: 'parquecidade', emoji: '🌳', titulo: 'Parque da Cidade', desc: 'Maior parque urbano da América Latina, perfeito para caminhar e pedalar.', link: mapa('Parque da Cidade Sarah Kubitschek'), ativo: true },
    ],
  },
  pacotes: {
    intro: 'Experiências e pacotes da Villela Stay. Cada um é montado sob medida — fale com a gente para um orçamento.',
    itens: [
      { id: 'romantico', emoji: '💞', titulo: 'Pacote Romântico', desc: 'Estadia + jantar com personal chef e um toque especial de decoração.', link: wapp('Olá! Tenho interesse no Pacote Romântico da Villela Stay.'), ativo: true },
      { id: 'evento', emoji: '🎉', titulo: 'Pacote Eventos', desc: 'Casa completa + buffet e estrutura para a sua comemoração.', link: wapp('Olá! Quero um orçamento do Pacote Eventos.'), ativo: true },
      { id: 'longa', emoji: '🗓️', titulo: 'Estadia Longa', desc: 'Condições especiais para quem fica mais tempo conosco.', link: wapp('Olá! Quero saber das condições para estadia longa.'), ativo: true },
      { id: 'dayuse', emoji: '☀️', titulo: 'Day Use', desc: 'Aproveite a casa e a piscina por um dia, sem pernoite (sujeito à disponibilidade).', link: wapp('Olá! Quero saber sobre o Day Use.'), ativo: true },
    ],
  },
};
function lerConteudo() {
  const salvo = lerJSON('conteudo-hospede.json', null);
  if (!salvo || typeof salvo !== 'object') return JSON.parse(JSON.stringify(CONTEUDO_PADRAO));
  const out = {};
  for (const s of SECOES_CONTEUDO) out[s] = salvo[s] && Array.isArray(salvo[s].itens) ? salvo[s] : CONTEUDO_PADRAO[s];
  return out;
}
const salvarConteudo = (c) => salvarJSON('conteudo-hospede.json', c);

// ---- Base de conhecimento da Eva (concierge IA) — material que o anfitrião alimenta pelo portal ----
// Texto livre e/ou arquivos (.txt/.md/.csv nativo; .pdf best-effort). Entradas:
// { id, titulo, texto, origem:'texto'|'arquivo', nomeArquivo, chars, ativo, criadoEm, quem }.
const EVA_KB_MAX = 40000;    // teto de caracteres por entrada
const EVA_KB_BUDGET = 12000; // teto total injetado na Eva por conversa (controla custo/contexto)
const lerEvaKB = () => { const a = lerJSON('eva-conhecimento.json', []); return Array.isArray(a) ? a : []; };
const salvarEvaKB = (a) => salvarJSON('eva-conhecimento.json', a);
// Consumo de tokens da Eva (para o Augusto acompanhar o impacto/custo no portal).
// Preços por 1M de tokens (US$) — aproximados; atualizar se a Anthropic mudar a tabela.
const EVA_PRECO = {
  'claude-sonnet-5': { in: 3, out: 15 }, 'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-8': { in: 5, out: 25 }, 'claude-haiku-4-5': { in: 1, out: 5 },
};
const evaCustoUSD = (modelo, inp, out) => { const p = EVA_PRECO[modelo] || EVA_PRECO['claude-haiku-4-5']; return (inp / 1e6) * p.in + (out / 1e6) * p.out; };
function registrarUsoEva(inp, out, modelo) {
  try {
    const u = lerJSON('eva-uso.json', null) || { totalIn: 0, totalOut: 0, totalMsgs: 0, custoUSD: 0, porDia: {} };
    const dia = hojeBrasil();
    u.totalIn += inp; u.totalOut += out; u.totalMsgs += 1; u.custoUSD = (u.custoUSD || 0) + evaCustoUSD(modelo, inp, out);
    const d = u.porDia[dia] || { in: 0, out: 0, msgs: 0, custoUSD: 0 };
    d.in += inp; d.out += out; d.msgs += 1; d.custoUSD += evaCustoUSD(modelo, inp, out);
    u.porDia[dia] = d;
    const dias = Object.keys(u.porDia).sort(); while (dias.length > 90) delete u.porDia[dias.shift()];
    u.modelo = modelo;
    salvarJSON('eva-uso.json', u);
  } catch (_) { /* nao quebra o chat por causa da metrica */ }
}
// Extrai texto de PDF sem dependência externa (best-effort): infla streams FlateDecode (zlib) e
// junta as strings dos operadores de texto Tj/TJ. Cobre PDFs de texto comuns; PDF escaneado (imagem)
// rende pouco — nesse caso o endpoint orienta a colar o texto.
function extrairTextoPdf(buf) {
  const zlib = require('zlib');
  const partes = [];
  const sMark = Buffer.from('stream'), eMark = Buffer.from('endstream');
  let i = 0;
  while (true) {
    const s = buf.indexOf(sMark, i); if (s < 0) break;
    let p = s + sMark.length;
    if (buf[p] === 0x0d) p++; if (buf[p] === 0x0a) p++;
    const e = buf.indexOf(eMark, p); if (e < 0) break;
    const chunk = buf.slice(p, e);
    let dec = null;
    try { dec = zlib.inflateSync(chunk); } catch (_) { try { dec = zlib.inflateRawSync(chunk); } catch (_2) { dec = chunk; } }
    partes.push(dec.toString('latin1'));
    i = e + eMark.length;
  }
  const raw = partes.join('\n');
  let txt = '';
  const re = /\(((?:[^()\\]|\\[\s\S])*)\)/g; let m;
  while ((m = re.exec(raw)) !== null) {
    txt += m[1]
      .replace(/\\([nrtbf])/g, (x, c) => ({ n: '\n', r: '', t: '\t', b: '', f: '' }[c] || ''))
      .replace(/\\([0-7]{1,3})/g, (x, o) => String.fromCharCode(parseInt(o, 8)))
      .replace(/\\(.)/g, '$1') + ' ';
  }
  return txt.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
function extrairTextoArquivo(base64, nome) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  const ext = (nome && nome.indexOf('.') >= 0) ? nome.slice(nome.lastIndexOf('.')).toLowerCase() : '';
  if (ext === '.pdf') return extrairTextoPdf(buf);
  return buf.toString('utf8'); // .txt/.md/.csv e afins
}

// ---- Conta corrente do hóspede (extrato de lançamentos + saldo) + pagamento (Mercado Pago) ----
const lerLancamentos = () => lerJSON('lancamentos.json', []);
const salvarLancamentos = (l) => salvarJSON('lancamentos.json', l);
const TIPOS_LANC = ['cashback', 'recorrencia', 'bonus', 'venda', 'cobranca', 'pagamento', 'ajuste'];
const ROTULO_LANC = { cashback: 'Cash back', recorrencia: 'Recorrência', bonus: 'Bônus de indicação', venda: 'Venda', cobranca: 'Cobrança', pagamento: 'Pagamento', ajuste: 'Ajuste', expiracao: 'Expiração de crédito' };
// Extrato com saldo corrente. valor é SINALIZADO (créditos +, débitos −). saldo<0 = a pagar; saldo>0 = crédito a favor.
function resumoConta(hospedeId) {
  const ls = lerLancamentos().filter(l => l.hospedeId === hospedeId).sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  let creditos = 0, debitos = 0, saldo = 0;
  const lancamentos = ls.map(l => {
    const v = Number(l.valor) || 0; saldo += v;
    if (v >= 0) creditos += v; else debitos += -v;
    return { id: l.id, tipo: l.tipo, rotulo: ROTULO_LANC[l.tipo] || l.tipo, descricao: l.descricao || '', item: l.item || '', quantidade: l.quantidade || null, valorUnitario: l.valorUnitario != null ? l.valorUnitario : null, valor: v, reservaId: l.reservaId || '', validade: l.validade || '', criadoEm: l.criadoEm, saldoApos: saldo };
  }).reverse(); // mais recente primeiro
  return { saldo, creditos, debitos, aPagar: saldo < 0 ? -saldo : 0, credito: saldo > 0 ? saldo : 0, lancamentos };
}
// Mercado Pago (gateway) — usa MP_ACCESS_TOKEN (env). Checkout Pro hospedado (Pix + cartão); sem dado de cartão no nosso lado.
const MP_BASE = 'https://api.mercadopago.com';
async function mpFetch(pathname, opts) {
  const tok = process.env.MP_ACCESS_TOKEN;
  if (!tok) throw new Error('MP_ACCESS_TOKEN não configurado');
  const r = await fetch(MP_BASE + pathname, Object.assign({ headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' } }, opts || {}));
  if (!r.ok) throw new Error('Mercado Pago ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

// ---- Motor de fidelidade: cash back (5%) + recorrência (5%) — gated FIDELIDADE_AUTO ----
// Regras: 5% sobre o líquido (total − taxa de limpeza), só estadias DIRETAS/WhatsApp, 5 dias após o check-out,
// validade 3 meses. Recorrência: +5% se o hóspede já teve estadia anterior. Idempotente (fidelidade-creditado.json).
const FID = { cashbackPct: 0.05, recorrenciaPct: 0.05, diasAposCheckout: 5, validadeMeses: 3, bonusIndicacao: 100, welcomePct: 0.05, bonusValidadeMeses: 6, cleaningFeeId: '57a31968b9b1fb291f3bcc1b' };
// Código de indicação por hóspede (gerado sob demanda, único, sem caracteres ambíguos).
function gerarCodigoUnico(hospedes) {
  const usados = new Set(hospedes.map(h => h.codigoIndicacao).filter(Boolean));
  const alf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let t = 0; t < 80; t++) { let c = ''; const b = crypto.randomBytes(6); for (let i = 0; i < 6; i++) c += alf[b[i] % alf.length]; if (!usados.has(c)) return c; }
  return 'VS' + crypto.randomBytes(3).toString('hex').toUpperCase();
}
function codigoDoHospede(hospedeId) {
  const hospedes = lerHospedes();
  const h = hospedes.find(x => x.id === hospedeId);
  if (!h) return null;
  if (!h.codigoIndicacao) { h.codigoIndicacao = gerarCodigoUnico(hospedes); salvarHospedes(hospedes); }
  return h.codigoIndicacao;
}
function addMeses(iso, n) { const d = new Date(String(iso) + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }
function taxaLimpeza(price) {
  const fees = (price && price.hostingDetails && price.hostingDetails.fees) || [];
  return fees.filter(f => f._idfee === FID.cleaningFeeId || /limpeza|cleaning/i.test(f.name || '')).reduce((s, f) => s + (Number(f._f_val) || 0), 0);
}
async function temEstadiaAnterior(clientId, checkin) {
  const cli = await stays(`/booking/clients/${clientId}`).catch(() => null);
  if (!cli || !checkin) return false;
  return (cli.reservations || []).some(x => ['booked', 'reserved', 'contract'].includes(x.type) && x.checkOutDate && x.checkOutDate < checkin);
}
let _motorRodando = false;
async function motorFidelidade(opts) {
  opts = opts || {}; const force = opts.force, simular = opts.simular;
  if (!simular && !force && process.env.FIDELIDADE_AUTO !== 'on') return { rodou: false, motivo: 'desligado (FIDELIDADE_AUTO != on)' };
  if (_motorRodando) return { rodou: false, motivo: 'já em execução' };
  _motorRodando = true;
  try {
    const hoje = hojeISO();
    const ate = addDias(hoje, -FID.diasAposCheckout); // check-out <= hoje-5
    const de = addDias(hoje, -45);                     // janela de captura (idempotente cobre re-execuções)
    const reservas = await staysPaginado('/booking/reservations', { from: de, to: ate, dateType: 'departure' });
    const hospedesTodos = lerHospedes();
    const porCliente = {}; const nomeP = {}; hospedesTodos.forEach(h => { if (h.staysClientId) porCliente[h.staysClientId] = h; nomeP[h.id] = h.nome || h.email || h.telefone || h.id; });
    const creditado = lerJSON('fidelidade-creditado.json', {});
    const novos = []; // acumula os novos lançamentos; anexados a uma leitura FRESCA sob lock no fim
    const preview = [];
    const push = (l) => { if (simular) preview.push({ hospedeNome: nomeP[l.hospedeId] || l.hospedeId, tipo: l.tipo, rotulo: ROTULO_LANC[l.tipo] || l.tipo, valor: l.valor, descricao: l.descricao, validade: l.validade }); else novos.push(l); };
    let n = 0;
    for (const r of reservas) {
      if (!['booked', 'reserved', 'contract'].includes(r.type)) continue;
      if (!r.checkOutDate || r.checkOutDate > ate) continue;   // ainda não venceu os 5 dias
      if (creditado[r.id]) continue;                            // idempotente
      if (RE_OTA.test((r.partner && r.partner.name) || '')) { creditado[r.id] = { skip: 'ota', em: hoje }; continue; }
      const h = porCliente[r._idclient];
      if (!h) continue;                                         // hóspede sem conta — reprocessa no próximo ciclo
      // a LISTA traz price placeholder (_f_total=1); o preço real só vem no GET individual da reserva.
      const full = await stays(`/booking/reservations/${r.id}`).catch(() => null);
      const price = (full && full.price) || r.price;
      const net = Math.max(0, (Number(price && price._f_total) || 0) - taxaLimpeza(price));
      if (net <= 0) { creditado[r.id] = { skip: 'net0', em: hoje }; continue; }
      const validade = addMeses(hoje, FID.validadeMeses);
      const cb = Math.round(net * FID.cashbackPct * 100) / 100;
      push({ id: novoId(), hospedeId: h.id, staysClientId: h.staysClientId, tipo: 'cashback', descricao: `Cash back 5% — estadia ${r.id}`, valor: cb, reservaId: r.id, validade, criadoEm: new Date().toISOString(), criadoPor: 'motor-fidelidade' });
      const ehRetorno = await temEstadiaAnterior(h.staysClientId, r.checkInDate);
      let rec = 0, bonusInd = 0;
      if (ehRetorno) {
        rec = Math.round(net * FID.recorrenciaPct * 100) / 100;
        push({ id: novoId(), hospedeId: h.id, staysClientId: h.staysClientId, tipo: 'recorrencia', descricao: `Recorrência 5% — estadia ${r.id}`, valor: rec, reservaId: r.id, validade, criadoEm: new Date().toISOString(), criadoPor: 'motor-fidelidade' });
      } else if (h.indicadoPor && !h.indicacaoRecompensada) {
        // 1ª estadia de um hóspede indicado: bônus ao indicador + boas-vindas ao indicado
        const indicador = hospedesTodos.find(x => x.codigoIndicacao === h.indicadoPor);
        if (indicador && indicador.id !== h.id) {
          const valBonus = addMeses(hoje, FID.bonusValidadeMeses);
          push({ id: novoId(), hospedeId: indicador.id, staysClientId: indicador.staysClientId || '', tipo: 'bonus', descricao: `Bônus de indicação — ${h.nome || 'hóspede indicado'}`, valor: FID.bonusIndicacao, reservaId: r.id, validade: valBonus, criadoEm: new Date().toISOString(), criadoPor: 'motor-fidelidade' });
          const welcome = Math.round(net * FID.welcomePct * 100) / 100;
          push({ id: novoId(), hospedeId: h.id, staysClientId: h.staysClientId, tipo: 'bonus', descricao: `Desconto de boas-vindas (indicação) — estadia ${r.id}`, valor: welcome, reservaId: r.id, validade: valBonus, criadoEm: new Date().toISOString(), criadoPor: 'motor-fidelidade' });
          bonusInd = FID.bonusIndicacao;
          if (!simular) { const hospedes2 = lerHospedes(); const hh = hospedes2.find(x => x.id === h.id); if (hh) { hh.indicacaoRecompensada = true; salvarHospedes(hospedes2); } }
        }
      }
      creditado[r.id] = { hospedeId: h.id, cashback: cb, recorrencia: rec, bonusIndicacao: bonusInd, net, em: hoje };
      n++;
    }
    if (simular) { return { simulado: true, estadias: n, lancamentos: preview, totalCredito: Math.round(preview.reduce((s, l) => s + l.valor, 0) * 100) / 100 }; }
    // lock por coleção: relê lancamentos FRESCO e anexa só os novos (não sobrescreve com snapshot velho)
    if (novos.length) await atualizarJSON('lancamentos.json', prev => prev.concat(novos), []);
    salvarJSON('fidelidade-creditado.json', creditado);
    const exp = expirarCreditos();
    if (n || exp.expirados) console.log('[motor fidelidade] creditou', n, 'estadia(s); expirou', exp.expirados, 'crédito(s)');
    return { rodou: true, creditadas: n, expirados: exp.expirados };
  } catch (e) { console.error('[motor fidelidade]', e.message); return { rodou: false, erro: e.message }; }
  finally { _motorRodando = false; }
}
// Etapa B — expiração FIFO: créditos promocionais (cashback/recorrencia/bonus) vencidos e NÃO consumidos por
// cobranças são baixados. Simula o extrato em ordem cronológica: créditos viram lotes, cobranças consomem os
// mais antigos primeiro, e no vencimento de cada lote o restante não usado expira.
const TIPOS_PROMO = new Set(['cashback', 'recorrencia', 'bonus']);
function calcularExpiracoes(lancamentos, hoje) {
  const evs = [];
  for (const l of lancamentos) {
    const d = String(l.criadoEm).slice(0, 10);
    if (TIPOS_PROMO.has(l.tipo) && Number(l.valor) > 0) {
      evs.push({ data: d, ord: 0, tipo: 'credito', id: l.id, valor: Number(l.valor) });
      if (l.validade) evs.push({ data: l.validade, ord: 2, tipo: 'expiry', id: l.id });
    } else if (l.tipo === 'cobranca' || (l.tipo === 'ajuste' && Number(l.valor) < 0)) {
      evs.push({ data: d, ord: 1, tipo: 'debito', valor: -Number(l.valor) }); // cobranças consomem promo (FIFO)
    } // pagamento, expiracao e ajuste(+) não consomem promo nem expiram
  }
  evs.sort((a, b) => a.data.localeCompare(b.data) || a.ord - b.ord);
  const lots = []; const expirados = [];
  for (const e of evs) {
    if (e.data > hoje) break; // só processa vencimentos até hoje
    if (e.tipo === 'credito') lots.push({ id: e.id, rem: e.valor });
    else if (e.tipo === 'debito') { let need = e.valor; for (const lot of lots) { if (need <= 0.005) break; const t = Math.min(lot.rem, need); lot.rem -= t; need -= t; } }
    else if (e.tipo === 'expiry') { const lot = lots.find(x => x.id === e.id); if (lot && lot.rem > 0.005) { expirados.push({ id: e.id, valor: Math.round(lot.rem * 100) / 100 }); lot.rem = 0; } }
  }
  return expirados;
}
function expirarCreditos() {
  const hoje = hojeISO();
  const ls = lerLancamentos();
  const porH = {};
  for (const l of ls) { (porH[l.hospedeId] = porH[l.hospedeId] || []).push(l); }
  const jaExpirado = new Set(ls.filter(l => l.expiraDe).map(l => l.expiraDe));
  let novos = 0;
  for (const hid in porH) {
    for (const e of calcularExpiracoes(porH[hid], hoje)) {
      if (jaExpirado.has(e.id)) continue; // idempotente (1 expiração por crédito)
      ls.push({ id: novoId(), hospedeId: hid, staysClientId: (porH[hid][0] && porH[hid][0].staysClientId) || '', tipo: 'expiracao', descricao: 'Expiração de crédito (validade)', valor: -e.valor, expiraDe: e.id, criadoEm: new Date().toISOString(), criadoPor: 'motor-fidelidade' });
      jaExpirado.add(e.id); novos++;
    }
  }
  if (novos) salvarLancamentos(ls);
  return { expirados: novos };
}

setInterval(() => { motorFidelidade().catch(() => { }); }, 6 * 3600 * 1000);   // periódico (idempotente)
setTimeout(() => { motorFidelidade().catch(() => { }); }, 60 * 1000);           // pouco após o boot
// Sanitiza parâmetro de template da Meta (sem quebra de linha/tab/4+ espaços — evita erro 132018).
function sanitizaParam(s) { return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s{4,}/g, '   ').trim().slice(0, 600); }
// Alerta interno ao Augusto (template alerta_crm, notifica a qualquer hora). Best-effort.
async function alertaAugusto(resumo) {
  if (!process.env.MAKE_WA_WEBHOOK) return false;
  try {
    await fetch(process.env.MAKE_WA_WEBHOOK, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: AUGUSTO_WA, template: 'alerta_crm::pt_BR', p1: 'Augusto', p2: sanitizaParam(resumo) }),
    });
    return true;
  } catch (e) { console.error('[alerta augusto]', e.message); return false; }
}

// ---- Fase 4: recibos, avaliações e indicações ----
const lerAvaliacoes = () => lerJSON('avaliacoes.json', []);
const salvarAvaliacoes = (a) => salvarJSON('avaliacoes.json', a);
const lerIndicacoes = () => lerJSON('indicacoes.json', []);
const salvarIndicacoes = (i) => salvarJSON('indicacoes.json', i);
function fmtDataBR(iso) { if (!iso) return '—'; const [a, m, d] = String(iso).split('-'); return (d && m && a) ? `${d}/${m}/${a}` : String(iso); }
function reciboHtml(h, r, conta) {
  const noites = (r.checkin && r.checkout) ? Math.max(0, Math.round((Date.parse(r.checkout) - Date.parse(r.checkin)) / 86400000)) : '';
  const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  const valor = r.valor != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: r.moeda || 'BRL' }).format(r.valor) : '—';
  const linha = (k, v) => `<tr><td class="k">${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`;
  // Extrato da conta corrente (produtos/serviços vendidos, cash back, cobranças, pagamentos) + saldo.
  conta = conta || { lancamentos: [], saldo: 0, aPagar: 0, credito: 0 };
  const lancs = conta.lancamentos || [];
  const extratoRows = lancs.map(l => {
    const desc = escHtml(l.descricao || l.item || l.rotulo) + (l.reservaId ? ` <span class="tag">${escHtml(l.reservaId)}</span>` : '');
    const sinal = l.valor >= 0 ? '+' : '−';
    return `<tr><td>${escHtml(String(l.criadoEm).slice(0, 10))}</td><td>${escHtml(l.rotulo)}</td><td>${desc}</td>
      <td class="num ${l.valor >= 0 ? 'cred' : 'deb'}">${sinal} ${brl(Math.abs(l.valor))}</td><td class="num">${brl(l.saldoApos)}</td></tr>`;
  }).join('');
  const saldoTxt = conta.saldo > 0 ? `Crédito a favor: ${brl(conta.saldo)}` : conta.saldo < 0 ? `Saldo a pagar: ${brl(-conta.saldo)}` : 'Conta em dia';
  const extratoBloco = lancs.length ? `
    <h1 style="margin-top:24px">Extrato da conta</h1>
    <table class="extrato">
      <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th><th class="num">Saldo</th></tr></thead>
      <tbody>${extratoRows}</tbody>
    </table>
    <p class="saldo ${conta.saldo < 0 ? 'neg' : conta.saldo > 0 ? 'pos' : ''}">${escHtml(saldoTxt)}</p>` : '';
  const pagarBloco = conta.aPagar > 0 ? `
    <div class="acao">
      <button class="btn" id="btn-pagar">💳 Pagar ${brl(conta.aPagar)} (Pix / cartão)</button>
      <div id="pagar-msg" class="rod" style="margin-top:8px"></div>
    </div>
    <script>
      document.getElementById('btn-pagar').addEventListener('click', function(){
        var b=this, m=document.getElementById('pagar-msg'); b.disabled=true; b.textContent='Abrindo pagamento…';
        fetch('/hospede/api/conta/pagar',{method:'POST',credentials:'same-origin'})
          .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
          .then(function(x){ if(x.ok&&x.j.url){ window.location.href=x.j.url; } else { b.disabled=false; b.textContent='💳 Tentar pagar novamente'; m.textContent=(x.j&&x.j.erro)||'Falha ao iniciar o pagamento.'; } })
          .catch(function(){ b.disabled=false; b.textContent='💳 Tentar pagar novamente'; m.textContent='Falha de conexão. Tente novamente.'; });
      });
    <\/script>` : '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comprovante de Reserva — Villela Stay</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#2b2d2f;background:#f7f4ee;margin:0;padding:24px}
  .doc{max-width:620px;margin:auto;background:#fff;border:1px solid #e3ddd0;border-radius:12px;overflow:hidden}
  .cab{background:#1B2A4A;color:#F8F9FA;padding:22px 26px}
  .cab .marca{font-size:20px;font-weight:800}.cab .sub{color:#C9A227;font-size:13px}
  .corpo{padding:24px 26px}
  h1{font-size:18px;color:#1B2A4A;margin:0 0 14px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  td{padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top}
  td.k{color:#6b7075;width:42%}
  .num{text-align:right;white-space:nowrap}
  .cred{color:#1c7a4b;font-weight:700}.deb{color:#b23b3b;font-weight:700}
  .extrato th{color:#6b7075;font-size:12px;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid #e3ddd0;padding:8px 6px;text-align:left}
  .extrato th.num{text-align:right}
  .tag{display:inline-block;background:#f0ece0;color:#6b7075;border-radius:4px;padding:0 5px;font-size:11px}
  .saldo{font-size:15px;font-weight:800;margin:10px 0 0}
  .saldo.neg{color:#b23b3b}.saldo.pos{color:#1c7a4b}
  .rod{font-size:12px;color:#6b7075;margin-top:16px}
  .acao{margin:18px 26px;text-align:center}
  .btn{background:#0E7490;color:#fff;border:none;padding:11px 20px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px}
  .btn:disabled{opacity:.6;cursor:default}
  @media print{.acao{display:none}body{background:#fff;padding:0}.doc{border:none}}
</style></head><body>
<div class="doc">
  <div class="cab"><div class="marca">Villela Stay</div><div class="sub">Comprovante de Reserva</div></div>
  <div class="corpo">
    <h1>Comprovante de Reserva</h1>
    <table>
      ${linha('Hóspede', h.nome || '—')}
      ${linha('Propriedade', r.imovelTitulo || r.imovel || '—')}
      ${linha('Localizador', r.id || '—')}
      ${linha('Check-in', fmtDataBR(r.checkin))}
      ${linha('Check-out', fmtDataBR(r.checkout))}
      ${noites !== '' ? linha('Noites', noites) : ''}
      ${r.hospedes ? linha('Hóspedes', r.hospedes) : ''}
      ${r.plataforma ? linha('Canal', r.plataforma) : ''}
      ${linha('Status', r.statusRotulo || r.status || '—')}
      ${linha('Valor total', valor)}
    </table>
    ${extratoBloco}
    <p class="rod">Documento gerado pela Área do Hóspede da Villela Stay em ${fmtDataBR(hojeISO())}. Comprovante de reserva — não é documento fiscal.</p>
  </div>
  ${pagarBloco}
  <div class="acao"><button class="btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
</div></body></html>`;
}

// ---- seed da estrutura de propriedades-info (uma vez), p/ o Augusto preencher WiFi/acesso ----
(function seedPropInfo() {
  const f = path.join(DATA_DIR, 'propriedades-info.json');
  if (fs.existsSync(f)) return;
  const codigos = ['GD01H', 'GD03H', 'GG04I', 'PL02I', 'YV01I', 'GI01I', 'VH01H', 'VH02H', 'UF07H', 'UD03H', 'UF01H', 'UF08H', 'UD09H', 'UF05H', 'UF06H', 'UH01H', 'UH03H', 'UH04H', 'UH05H', 'UH06H'];
  const base = {
    _padrao: {
      checkinHora: 'A partir das 15h', checkoutHora: 'Até as 11h',
      contatos: 'Anfitrião (WhatsApp): +55 61 9193-5013 · E-mail: contato@villelastay.com.br',
      guiaUrl: 'https://villelastay.com.br/guia.html', manualUrl: '', observacoes: '',
      wifi: null, acesso: null,
    },
  };
  for (const c of codigos) base[c] = { wifi: { rede: '', senha: '' }, acesso: { portao: '', fechadura: '', instrucoes: '' }, manualUrl: '', guiaUrl: '', contatos: '', checkinHora: '', checkoutHora: '', observacoes: '' };
  try { fs.writeFileSync(f, JSON.stringify(base, null, 2)); console.log('[hospede] propriedades-info.json semeado (preencher WiFi/acesso por imóvel).'); }
  catch (e) { console.error('[hospede] seed propriedades-info:', e.message); }
})();

// ---- Web Push (notificações do app PWA) — VAPID por env, opcional ----
let _webpush = null; // null = não resolvido; false = indisponível (sem VAPID)
function webpushPronto() {
  if (_webpush !== null) return _webpush;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { return (_webpush = false); }
  try {
    const wp = require('web-push');
    wp.setVapidDetails('mailto:augusto.villela@gmail.com', pub, priv);
    _webpush = wp;
  } catch (e) { console.warn('[push] web-push indisponível:', e.message); _webpush = false; }
  return _webpush;
}
async function enviarPush(hospedeId, payload) {
  const wp = webpushPronto();
  if (!wp) return false;
  const hospedes = lerHospedes();
  const h = hospedes.find(x => x.id === hospedeId);
  if (!h || !Array.isArray(h.pushSubs) || !h.pushSubs.length) return false;
  const corpo = JSON.stringify(payload || {});
  let mudou = false;
  await Promise.all(h.pushSubs.map(async (sub) => {
    try { await wp.sendNotification(sub, corpo); }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { h.pushSubs = h.pushSubs.filter(s => s.endpoint !== sub.endpoint); mudou = true; } }
  }));
  if (mudou) salvarHospedes(hospedes);
  return true;
}

// ---- middleware de autenticação do hóspede (isolado do staff) ----
function requireHospede(req, res, next) {
  try {
    const auth = String(req.headers.authorization || '');
    const tok = (req.cookies && req.cookies[HOSP_COOKIE]) || (auth.startsWith('Bearer ') ? auth.slice(7).trim() : null);
    if (!tok) return res.status(401).json({ erro: 'não autenticado' });
    const dec = jwt.verify(tok, JWT_SECRET);
    if (!dec || dec.tipo !== 'hospede') return res.status(401).json({ erro: 'sessão inválida' });
    const h = lerHospedes().find(x => x.id === dec.hid);
    if (!h || !h.ativo) return res.status(401).json({ erro: 'sessão inválida' });
    req.hospede = h;
    next();
  } catch (e) { return res.status(401).json({ erro: 'sessão inválida' }); }
}
function setCookieHospede(res, h) {
  const token = jwt.sign({ hid: h.id, tipo: 'hospede' }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(HOSP_COOKIE, token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/hospede' });
  return token; // também devolvido no corpo do login/registro p/ clientes Bearer (app nativo futuro)
}

// Dicionário de mensagens (erro/sucesso) das rotas do hóspede — EN/ES (chave = texto PT).
// O front envia o idioma no header `x-lang`; o interceptor abaixo traduz o campo erro/mensagem.
const MSG_HOSPEDE = {
  en: {
    'não autenticado': 'not authenticated', 'sessão inválida': 'invalid session',
    'Muitas tentativas. Tente de novo em 15 minutos.': 'Too many attempts. Try again in 15 minutes.',
    'Login ou senha incorretos.': 'Incorrect login or password.',
    'A nova senha deve ter ao menos 8 caracteres.': 'The new password must be at least 8 characters.',
    'Senha atual incorreta.': 'Current password is incorrect.', 'Assinatura inválida.': 'Invalid subscription.',
    'Conta não encontrada.': 'Account not found.',
    'Informe o localizador, o sobrenome e uma senha de ao menos 8 caracteres.': 'Enter the locator, the last name and a password of at least 8 characters.',
    'Não encontramos uma reserva com esses dados. Confira o localizador, o sobrenome e a data de check-in.': 'We could not find a booking with those details. Check the locator, the last name and the check-in date.',
    'Falha ao validar a reserva. Tente novamente em instantes.': 'Failed to validate the booking. Please try again shortly.',
    'Informe um e-mail válido.': 'Enter a valid email.',
    'Se houver uma reserva com esse e-mail, enviamos um link para você criar a sua senha e entrar. Confira a sua caixa de entrada (e o spam).': 'If there is a booking with that email, we have sent you a link to create your password and sign in. Check your inbox (and spam).',
    'A senha deve ter ao menos 8 caracteres.': 'The password must be at least 8 characters.',
    'Link inválido ou expirado. Solicite um novo pela tela de acesso.': 'Invalid or expired link. Request a new one from the access screen.',
    'Link inválido. Solicite um novo pela tela de acesso.': 'Invalid link. Request a new one from the access screen.',
    'Falha ao concluir o cadastro. Tente novamente.': 'Failed to complete registration. Please try again.',
    'Falha ao consultar suas reservas.': 'Failed to load your bookings.',
    'Reserva não encontrada na sua conta.': 'Booking not found in your account.',
    'Falha ao gerar a carteira.': 'Failed to generate the wallet.', 'Seção não encontrada.': 'Section not found.',
    'O assistente está em ativação. Por enquanto, fale com a gente pelo WhatsApp que ajudamos na hora: wa.me/556191935013': 'The assistant is being activated. For now, message us on WhatsApp and we will help right away: wa.me/556191935013',
    'Você enviou muitas mensagens seguidas. Aguarde um minutinho e tente de novo.': 'You have sent too many messages in a row. Please wait a moment and try again.',
    'Escreva a sua dúvida.': 'Type your question.',
    'Não consegui responder agora. Tente de novo em instantes ou fale pelo WhatsApp: wa.me/556191935013': 'I could not answer right now. Try again shortly or message us on WhatsApp: wa.me/556191935013',
    'Falha ao falar com o assistente. Tente novamente em instantes.': 'Failed to reach the assistant. Please try again shortly.',
    'Informe a reserva.': 'Select the booking.',
    'Alterações desta reserva devem ser solicitadas na plataforma onde você reservou (ex.: Airbnb/Booking).': 'Changes to this booking must be requested on the platform where you booked (e.g., Airbnb/Booking).',
    'Serviço inválido.': 'Invalid service.',
    'Diga o que deseja alterar (datas, imóvel, nº de hóspedes ou uma mensagem).': 'Tell us what you want to change (dates, property, number of guests or a message).',
    'Informe a data do evento, o número de convidados ou uma descrição.': 'Provide the event date, the number of guests or a description.',
    'Descreva o problema de manutenção.': 'Describe the maintenance issue.',
    'Informe o horário previsto de chegada ou uma observação.': 'Provide your estimated arrival time or a note.',
    'Falha ao registrar o pedido. Tente novamente.': 'Failed to submit the request. Please try again.',
    'Informe a reserva e uma nota de 1 a 5.': 'Provide the booking and a rating from 1 to 5.',
    'A avaliação fica disponível após o check-out.': 'The review becomes available after check-out.',
    'Você já avaliou esta estadia.': 'You have already reviewed this stay.',
    'Falha ao registrar a avaliação.': 'Failed to submit the review.',
    'Informe o código de indicação.': 'Enter the referral code.',
    'Você já registrou um código de indicação.': 'You have already registered a referral code.',
    'Você não pode usar o seu próprio código.': 'You cannot use your own code.',
    'Código de indicação não encontrado.': 'Referral code not found.',
    'Informe o nome e o contato (WhatsApp/e-mail) de quem você quer indicar.': 'Provide the name and contact (WhatsApp/email) of the person you want to refer.',
    'Você não tem valor pendente para pagar.': 'You have no outstanding amount to pay.',
    'O pagamento online ainda está sendo configurado. Combine o pagamento pelo WhatsApp por enquanto.': 'Online payment is still being set up. For now, arrange payment via WhatsApp.',
    'Falha ao iniciar o pagamento. Tente novamente.': 'Failed to start the payment. Please try again.',
    'Você não tem reserva nesta propriedade.': 'You have no booking at this property.',
  },
  es: {
    'não autenticado': 'no autenticado', 'sessão inválida': 'sesión inválida',
    'Muitas tentativas. Tente de novo em 15 minutos.': 'Demasiados intentos. Inténtelo de nuevo en 15 minutos.',
    'Login ou senha incorretos.': 'Usuario o contraseña incorrectos.',
    'A nova senha deve ter ao menos 8 caracteres.': 'La nueva contraseña debe tener al menos 8 caracteres.',
    'Senha atual incorreta.': 'La contraseña actual es incorrecta.', 'Assinatura inválida.': 'Suscripción inválida.',
    'Conta não encontrada.': 'Cuenta no encontrada.',
    'Informe o localizador, o sobrenome e uma senha de ao menos 8 caracteres.': 'Ingrese el localizador, el apellido y una contraseña de al menos 8 caracteres.',
    'Não encontramos uma reserva com esses dados. Confira o localizador, o sobrenome e a data de check-in.': 'No encontramos una reserva con esos datos. Verifique el localizador, el apellido y la fecha de check-in.',
    'Falha ao validar a reserva. Tente novamente em instantes.': 'No se pudo validar la reserva. Inténtelo de nuevo en unos instantes.',
    'Informe um e-mail válido.': 'Ingrese un correo válido.',
    'Se houver uma reserva com esse e-mail, enviamos um link para você criar a sua senha e entrar. Confira a sua caixa de entrada (e o spam).': 'Si hay una reserva con ese correo, le enviamos un enlace para crear su contraseña e ingresar. Revise su bandeja de entrada (y el spam).',
    'A senha deve ter ao menos 8 caracteres.': 'La contraseña debe tener al menos 8 caracteres.',
    'Link inválido ou expirado. Solicite um novo pela tela de acesso.': 'Enlace inválido o vencido. Solicite uno nuevo en la pantalla de acceso.',
    'Link inválido. Solicite um novo pela tela de acesso.': 'Enlace inválido. Solicite uno nuevo en la pantalla de acceso.',
    'Falha ao concluir o cadastro. Tente novamente.': 'No se pudo completar el registro. Inténtelo de nuevo.',
    'Falha ao consultar suas reservas.': 'No se pudieron consultar sus reservas.',
    'Reserva não encontrada na sua conta.': 'Reserva no encontrada en su cuenta.',
    'Falha ao gerar a carteira.': 'No se pudo generar la cartera.', 'Seção não encontrada.': 'Sección no encontrada.',
    'O assistente está em ativação. Por enquanto, fale com a gente pelo WhatsApp que ajudamos na hora: wa.me/556191935013': 'El asistente se está activando. Por ahora, escríbanos por WhatsApp y le ayudamos enseguida: wa.me/556191935013',
    'Você enviou muitas mensagens seguidas. Aguarde um minutinho e tente de novo.': 'Envió demasiados mensajes seguidos. Espere un momento e inténtelo de nuevo.',
    'Escreva a sua dúvida.': 'Escriba su duda.',
    'Não consegui responder agora. Tente de novo em instantes ou fale pelo WhatsApp: wa.me/556191935013': 'No pude responder ahora. Inténtelo de nuevo en unos instantes o escríbanos por WhatsApp: wa.me/556191935013',
    'Falha ao falar com o assistente. Tente novamente em instantes.': 'No se pudo hablar con el asistente. Inténtelo de nuevo en unos instantes.',
    'Informe a reserva.': 'Indique la reserva.',
    'Alterações desta reserva devem ser solicitadas na plataforma onde você reservou (ex.: Airbnb/Booking).': 'Los cambios de esta reserva deben solicitarse en la plataforma donde reservó (ej.: Airbnb/Booking).',
    'Serviço inválido.': 'Servicio inválido.',
    'Diga o que deseja alterar (datas, imóvel, nº de hóspedes ou uma mensagem).': 'Diga qué desea cambiar (fechas, propiedad, n.º de huéspedes o un mensaje).',
    'Informe a data do evento, o número de convidados ou uma descrição.': 'Indique la fecha del evento, el número de invitados o una descripción.',
    'Descreva o problema de manutenção.': 'Describa el problema de mantenimiento.',
    'Informe o horário previsto de chegada ou uma observação.': 'Indique la hora estimada de llegada o una observación.',
    'Falha ao registrar o pedido. Tente novamente.': 'No se pudo registrar la solicitud. Inténtelo de nuevo.',
    'Informe a reserva e uma nota de 1 a 5.': 'Indique la reserva y una nota de 1 a 5.',
    'A avaliação fica disponível após o check-out.': 'La reseña estará disponible después del check-out.',
    'Você já avaliou esta estadia.': 'Ya reseñó esta estadía.',
    'Falha ao registrar a avaliação.': 'No se pudo registrar la reseña.',
    'Informe o código de indicação.': 'Ingrese el código de referido.',
    'Você já registrou um código de indicação.': 'Ya registró un código de referido.',
    'Você não pode usar o seu próprio código.': 'No puede usar su propio código.',
    'Código de indicação não encontrado.': 'Código de referido no encontrado.',
    'Informe o nome e o contato (WhatsApp/e-mail) de quem você quer indicar.': 'Indique el nombre y el contacto (WhatsApp/correo) de quien desea recomendar.',
    'Você não tem valor pendente para pagar.': 'No tiene un importe pendiente de pago.',
    'O pagamento online ainda está sendo configurado. Combine o pagamento pelo WhatsApp por enquanto.': 'El pago en línea aún se está configurando. Por ahora, acuerde el pago por WhatsApp.',
    'Falha ao iniciar o pagamento. Tente novamente.': 'No se pudo iniciar el pago. Inténtelo de nuevo.',
    'Você não tem reserva nesta propriedade.': 'No tiene reserva en esta propiedad.',
  },
};
// Nunca cachear respostas da API do hóspede + traduzir erro/mensagem conforme o idioma do app (header x-lang).
app.use('/hospede/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const l = String(req.headers['x-lang'] || '').slice(0, 2).toLowerCase();
  req.lang = ['pt', 'en', 'es'].includes(l) ? l : 'pt';
  if (req.lang !== 'pt') {
    const dict = MSG_HOSPEDE[req.lang] || {};
    const orig = res.json.bind(res);
    res.json = (body) => {
      if (body && typeof body === 'object') {
        if (typeof body.erro === 'string' && dict[body.erro]) body.erro = dict[body.erro];
        if (typeof body.mensagem === 'string' && dict[body.mensagem]) body.mensagem = dict[body.mensagem];
      }
      return orig(body);
    };
  }
  next();
});

// =========================== sessão do hóspede ===========================
// Área do Hóspede (app do guest, não-financeiro: login/registro/reservas/carteira/pedidos/serviços/conteúdo/chat-Eva/precheckin/recibo/avaliações/indicação/propriedade) → extraído para nucleo/hospede.js (montado no fim).

// =========================== admin (staff) — gestão da Área do Hóspede ===========================
app.get('/staff/api/hospede/contas', requireAuth, requireAdmin, (req, res) => {
  res.json({ contas: lerHospedes().map(semSenhaHosp) });
});

// Estatísticas de ACESSO à Área do Hóspede / app (agregado, sem dados pessoais) — admin ou CEO.
app.get('/staff/api/hospede/acessos-stats', requireAuth, (req, res) => {
  if (req.user.papel !== 'admin' && !podeArea(req.user, 'ceo')) return res.status(403).json({ erro: 'Acesso restrito (admin/CEO).' });
  const hospedes = lerHospedes();
  const agora = Date.now();
  const dias = (iso) => iso ? (agora - Date.parse(iso)) / 86400000 : Infinity;
  let total = 0, ativas = 0, comApp = 0, jaAcessaram = 0, pendentes1oAcesso = 0, comVinculoStays = 0, novos30 = 0, ativos30 = 0, ativos7 = 0;
  const porMes = {};
  for (const h of hospedes) {
    total++;
    if (h.ativo) ativas++;
    if (Array.isArray(h.pushSubs) && h.pushSubs.length) comApp++;
    if (h.ultimoLogin) jaAcessaram++;
    if (h.precisaTrocarSenha && !h.ultimoLogin) pendentes1oAcesso++;
    if (h.staysClientId) comVinculoStays++;
    if (dias(h.criadoEm) <= 30) novos30++;
    if (dias(h.ultimoLogin) <= 30) ativos30++;
    if (dias(h.ultimoLogin) <= 7) ativos7++;
    const m = (h.criadoEm || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m)) porMes[m] = (porMes[m] || 0) + 1;
  }
  // últimos 6 meses de cadastro (crescimento) + últimos cadastros (só 1º nome + data, sem PII sensível)
  const meses = Object.keys(porMes).sort().slice(-6).map(m => ({ mes: m, n: porMes[m] }));
  const recentes = [...hospedes].sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))).slice(0, 8)
    .map(h => ({ nome: String(h.nome || '—').split(' ')[0], criadoEm: h.criadoEm || '', acessou: !!h.ultimoLogin, app: Array.isArray(h.pushSubs) && h.pushSubs.length > 0 }));
  res.json({
    geradoEm: new Date().toISOString(),
    total, ativas, inativas: total - ativas, comApp, jaAcessaram,
    nuncaAcessaram: total - jaAcessaram, pendentes1oAcesso, comVinculoStays,
    novos30, ativos30, ativos7, meses, recentes,
  });
});
app.get('/staff/api/hospede/propriedades-info', requirePublishOrAdmin, (req, res) => {
  res.json({ info: lerPropInfo() });
});
app.put('/staff/api/hospede/propriedade/:codigo', requirePublishOrAdmin, (req, res) => {
  const codigo = String(req.params.codigo || '').toUpperCase();
  const all = lerPropInfo(); const d = req.body || {};
  const wifis = Array.isArray(d.wifis) ? d.wifis.filter(w => w && (w.rede || w.senha || w.nome)).map(w => ({ nome: String(w.nome || ''), rede: String(w.rede || ''), senha: String(w.senha || '') })) : [];
  const manuais = Array.isArray(d.manuais) ? d.manuais.filter(m => m && (m.url || m.nome)).map(m => ({ nome: String(m.nome || ''), url: String(m.url || '') })) : [];
  const guias = Array.isArray(d.guias) ? d.guias.filter(g => g && (g.url || g.nome)).map(g => ({ nome: String(g.nome || ''), url: String(g.url || '') })) : [];
  all[codigo] = {
    wifi: { rede: String((d.wifi && d.wifi.rede) || ''), senha: String((d.wifi && d.wifi.senha) || '') }, wifis,
    acesso: { portao: String((d.acesso && d.acesso.portao) || ''), fechadura: String((d.acesso && d.acesso.fechadura) || ''), instrucoes: String((d.acesso && d.acesso.instrucoes) || '') },
    manualUrl: String(d.manualUrl || ''), guiaUrl: String(d.guiaUrl || ''), manuais, guias, contatos: String(d.contatos || ''),
    checkinHora: String(d.checkinHora || ''), checkoutHora: String(d.checkoutHora || ''), observacoes: String(d.observacoes || ''),
  };
  salvarJSON('propriedades-info.json', all);
  res.json({ ok: true, info: all[codigo] });
});
// Criar conta + (re)enviar credenciais manualmente por staysClientId (testes / onboarding de OTA).
app.post('/staff/api/hospede/criar', requireAuth, requireAdmin, async (req, res) => {
  const clientId = String((req.body && req.body.staysClientId) || '').trim();
  if (!clientId) return res.status(400).json({ erro: 'Informe o staysClientId.' });
  try {
    const cli = await stays(`/booking/clients/${clientId}`).catch(() => null);
    if (!cli) return res.status(404).json({ erro: 'Cliente não encontrado na Stays.' });
    await criarContaHospede(cli, clientId);
    const conta = lerHospedes().find(h => h.staysClientId === clientId);
    res.json({ ok: true, conta: conta ? semSenhaHosp(conta) : null });
  } catch (e) { console.error('[hospede criar]', e.message); res.status(502).json({ erro: 'Falha ao criar a conta.' }); }
});

// Vincular e-mail de acesso a um hóspede da Stays (p/ antigos de OTA com e-mail mascarado). Admin.
// Cria/atualiza a conta local (inativa até o hóspede definir a senha pelo link) e, opcional, envia o link agora.
app.post('/staff/api/hospede/vincular-email', requireAuth, requireAdmin, async (req, res) => {
  const d = req.body || {};
  const clientId = String(d.staysClientId || '').trim();
  const email = String(d.email || '').trim().toLowerCase();
  const enviarLink = !!d.enviarLink;
  if (!clientId) return res.status(400).json({ erro: 'Informe o hóspede da Stays.' });
  if (!email.includes('@') || email.length > 200) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  try {
    const cli = await stays(`/booking/clients/${clientId}`).catch(() => null);
    if (!cli) return res.status(404).json({ erro: 'Hóspede não encontrado na Stays.' });
    const hospedes = lerHospedes();
    const outro = hospedes.find(h => h.email === email && h.staysClientId !== clientId);
    if (outro) return res.status(409).json({ erro: 'Esse e-mail já está vinculado a outro hóspede.' });
    const nome = cli.fName ? (cli.fName + ' ' + (cli.lName || '')).trim() : (cli.name || '');
    const fone = (cli.phones && cli.phones[0] && (cli.phones[0].iso || cli.phones[0].number)) || '';
    let h = hospedes.find(x => x.staysClientId === clientId);
    let criada = false;
    if (h) {
      h.email = email; if (!h.nome && nome) h.nome = nome; if (!h.telefone && fone) h.telefone = normFone(fone);
    } else {
      h = { id: novoId(), nome, email, telefone: normFone(fone), senhaHash: '', staysClientId: clientId, precisaTrocarSenha: false, ativo: false, criadoEm: new Date().toISOString(), ultimoLogin: null, emailVinculadoPor: (req.user && req.user.nome) || 'admin' };
      hospedes.push(h); criada = true;
    }
    salvarHospedes(hospedes);
    let linkEnviado = false;
    if (enviarLink) {
      const token = jwt.sign({ tipo: 'hospede-setup', email, cid: clientId }, JWT_SECRET, { expiresIn: '45m' });
      const link = AREA_HOSPEDE_URL + '?definir=' + encodeURIComponent(token);
      linkEnviado = await enviarEmailAcesso(email, nome, link, false).catch(() => false);
    }
    console.log('[hospede vincular-email]', email, '->', clientId, '(criada:', criada, 'link:', linkEnviado, ')');
    res.json({ ok: true, criada, ativo: !!h.ativo, linkEnviado, hospede: semSenhaHosp(h) });
  } catch (e) { console.error('[hospede vincular-email]', e.message); res.status(502).json({ erro: 'Falha ao vincular o e-mail.' }); }
});

// Pedidos de hóspedes (alteração/evento) — equipe vê; admin/concierge/vendas respondem e orçam.
app.get('/staff/api/hospede/pedidos', requireAuth, (req, res) => {
  res.json({ pedidos: lerPedidosHosp().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))) });
});
app.patch('/staff/api/hospede/pedidos/:id', requireAuth, (req, res) => {
  const podeResponder = req.user.papel === 'admin' || podeArea(req.user, 'concierge') || podeArea(req.user, 'vendas');
  if (!podeResponder) return res.status(403).json({ erro: 'Sem permissão para responder pedidos (áreas Concierge/Vendas ou admin).' });
  const pedidos = lerPedidosHosp();
  const p = pedidos.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const d = req.body || {};
  if (d.status && STATUS_PEDIDO.includes(d.status)) p.status = d.status;
  if (d.respostaAdmin != null) p.respostaAdmin = String(d.respostaAdmin).slice(0, 2000);
  if (d.orcamento !== undefined) {
    p.orcamento = d.orcamento == null ? null
      : { valor: (d.orcamento.valor != null && d.orcamento.valor !== '') ? Number(d.orcamento.valor) : null, detalhes: String(d.orcamento.detalhes || '').slice(0, 1000) };
  }
  p.atualizadoEm = new Date().toISOString();
  salvarPedidosHosp(pedidos);
  const rotuloP = p.tipo === 'evento' ? 'evento' : p.tipo === 'servico' ? (p.servico && p.servico.nome ? p.servico.nome : 'serviço') : p.tipo === 'manutencao' ? 'manutenção' : p.tipo === 'checkin' ? 'check-in' : 'alteração';
  const rotuloStatus = { novo: 'Recebido', em_analise: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado', respondido: 'Respondido' }[p.status] || p.status;
  enviarPush(p.hospedeId, {
    title: 'Villela Stay — atualização no seu pedido',
    body: `Seu pedido de ${rotuloP} agora está: ${rotuloStatus}.` + (p.orcamento ? ' Há um orçamento para você ver.' : ''),
    url: '/hospede/#/pedidos',
  }).catch(() => {});
  res.json({ ok: true, pedido: p });
});

// Fidelidade: avaliações pós-estadia e indicações (leitura — equipe).
// Fidelidade (visão staff: avaliações/indicações) → nucleo/hospede-financeiro.js.

// Vitrines de conteúdo (Gastronomia/Turismo/Pacotes) — editar (admin OU PUBLISH_KEY).
app.get('/staff/api/hospede/conteudo', requirePublishOrAdmin, (req, res) => res.json({ conteudo: lerConteudo(), secoes: SECOES_CONTEUDO }));
app.put('/staff/api/hospede/conteudo', requirePublishOrAdmin, (req, res) => {
  const body = req.body && req.body.conteudo;
  if (!body || typeof body !== 'object') return res.status(400).json({ erro: 'Envie o conteúdo.' });
  const slug = (s) => semAcento(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || ('it-' + crypto.randomBytes(3).toString('hex'));
  const atual = lerConteudo();
  const out = {};
  for (const s of SECOES_CONTEUDO) {
    const sec = body[s] || atual[s] || { intro: '', itens: [] };
    const vistos = new Set();
    const itens = (Array.isArray(sec.itens) ? sec.itens : []).filter(i => i && String(i.titulo || '').trim()).map(i => {
      let id = String(i.id || '').trim() || slug(String(i.titulo));
      while (vistos.has(id)) id += '-2'; vistos.add(id);
      return { id, emoji: String(i.emoji || '✨').slice(0, 6), titulo: String(i.titulo).trim().slice(0, 80), desc: String(i.desc || '').slice(0, 400), link: String(i.link || '').slice(0, 500), ativo: i.ativo !== false };
    });
    out[s] = { intro: String(sec.intro || '').slice(0, 400), itens };
  }
  salvarConteudo(out);
  res.json({ ok: true, conteudo: out });
});

// Base de conhecimento da Eva — listar / adicionar (texto ou arquivo) / editar / remover (admin OU PUBLISH_KEY).
app.get('/staff/api/eva/conhecimento', requirePublishOrAdmin, (req, res) => {
  const itens = lerEvaKB();
  const ativos = itens.filter(x => x.ativo !== false);
  const totalCharsAtivos = ativos.reduce((s, x) => s + (x.chars || String(x.texto || '').length), 0);
  res.json({
    itens, budget: EVA_KB_BUDGET, totalCharsAtivos,
    // "Resumo do que a Eva já sabe" — as fontes automáticas que ela sempre recebe, além da base abaixo.
    fontesAutomaticas: [
      'FAQ oficial da Villela Stay (regras, preços, políticas)',
      'Reserva do próprio hóspede + infos da casa (horários, contatos, manual, guia)',
      'Conta corrente / cash back / fidelidade do hóspede',
      'Vitrines curadas: Gastronomia, Turismo e Pacotes',
      'Busca na web para info externa/atual (voos, aluguel de carro, transporte, clima, horários)',
    ],
  });
});
app.get('/staff/api/eva/uso', requirePublishOrAdmin, (req, res) => {
  const u = lerJSON('eva-uso.json', null) || { totalIn: 0, totalOut: 0, totalMsgs: 0, custoUSD: 0, porDia: {} };
  const dia = hojeBrasil(), mes = dia.slice(0, 7);
  let hoje = { in: 0, out: 0, msgs: 0, custoUSD: 0 }, mesAcc = { in: 0, out: 0, msgs: 0, custoUSD: 0 };
  for (const [d, v] of Object.entries(u.porDia || {})) {
    if (d === dia) hoje = v;
    if (d.startsWith(mes)) { mesAcc.in += v.in; mesAcc.out += v.out; mesAcc.msgs += v.msgs; mesAcc.custoUSD += (v.custoUSD || 0); }
  }
  const ultimos = Object.entries(u.porDia || {}).sort().slice(-14).map(([d, v]) => ({ dia: d, ...v }));
  res.json({
    modelo: process.env.CHAT_MODEL || 'claude-haiku-4-5',
    total: { in: u.totalIn || 0, out: u.totalOut || 0, msgs: u.totalMsgs || 0, custoUSD: u.custoUSD || 0 },
    mes: mesAcc, hoje, ultimos,
  });
});
app.post('/staff/api/eva/conhecimento', requirePublishOrAdmin, (req, res) => {
  const d = req.body || {};
  let texto = String(d.texto || '').trim();
  let origem = 'texto', nomeArquivo = '';
  if (d.arquivoBase64) {
    try { texto = String(extrairTextoArquivo(d.arquivoBase64, d.nomeArquivo) || '').trim(); }
    catch (e) { return res.status(400).json({ erro: 'Não consegui ler o arquivo.' }); }
    origem = 'arquivo'; nomeArquivo = String(d.nomeArquivo || 'arquivo').slice(0, 120);
    if (texto.length < 20) return res.status(422).json({ erro: 'Extraí pouco texto desse arquivo (pode ser um PDF escaneado/imagem). Copie e cole o texto no campo de texto.' });
  }
  if (!texto) return res.status(400).json({ erro: 'Envie um texto ou um arquivo com conteúdo.' });
  texto = texto.slice(0, EVA_KB_MAX);
  const titulo = (String(d.titulo || '').trim() || nomeArquivo || 'Sem título').slice(0, 120);
  const itens = lerEvaKB();
  const item = { id: crypto.randomBytes(6).toString('hex'), titulo, texto, origem, nomeArquivo, chars: texto.length, ativo: true, criadoEm: new Date().toISOString(), quem: (req.user && req.user.email) || (req.viaChave ? 'chave' : 'admin') };
  itens.unshift(item);
  salvarEvaKB(itens);
  res.json({ ok: true, item });
});
app.patch('/staff/api/eva/conhecimento/:id', requirePublishOrAdmin, (req, res) => {
  const itens = lerEvaKB(); const it = itens.find(x => x.id === req.params.id);
  if (!it) return res.status(404).json({ erro: 'Não encontrado.' });
  const d = req.body || {};
  if (d.ativo != null) it.ativo = !!d.ativo;
  if (typeof d.titulo === 'string' && d.titulo.trim()) it.titulo = d.titulo.trim().slice(0, 120);
  if (typeof d.texto === 'string') { it.texto = d.texto.slice(0, EVA_KB_MAX); it.chars = it.texto.length; }
  salvarEvaKB(itens);
  res.json({ ok: true, item: it });
});
app.delete('/staff/api/eva/conhecimento/:id', requirePublishOrAdmin, (req, res) => {
  const itens = lerEvaKB(); const n = itens.length;
  const out = itens.filter(x => x.id !== req.params.id);
  if (out.length === n) return res.status(404).json({ erro: 'Não encontrado.' });
  salvarEvaKB(out);
  res.json({ ok: true });
});

// Catálogo de serviços extras — editar (admin OU PUBLISH_KEY): preços, textos, ativar/desativar.
app.get('/staff/api/hospede/servicos', requirePublishOrAdmin, (req, res) => res.json({ servicos: lerServicos() }));
app.put('/staff/api/hospede/servicos', requirePublishOrAdmin, (req, res) => {
  const arr = Array.isArray(req.body && req.body.servicos) ? req.body.servicos : null;
  if (!arr) return res.status(400).json({ erro: 'Envie a lista de serviços.' });
  const slug = (s) => semAcento(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || ('serv-' + crypto.randomBytes(3).toString('hex'));
  const limpos = arr.filter(s => s && String(s.nome || '').trim()).map(s => ({
    id: String(s.id || '').trim() || slug(String(s.nome)),
    emoji: String(s.emoji || '✨').slice(0, 6), nome: String(s.nome).trim().slice(0, 80),
    desc: String(s.desc || '').slice(0, 300), preco: String(s.preco || 'Sob consulta').slice(0, 60),
    ativo: s.ativo !== false,
  }));
  const vistos = new Set();
  for (const s of limpos) { let id = s.id, n = 1; while (vistos.has(id)) id = s.id + '-' + (++n); s.id = id; vistos.add(id); }
  salvarServicos(limpos);
  res.json({ ok: true, servicos: limpos });
});

// Config do programa de fidelidade — editar (admin OU PUBLISH_KEY).
// Fidelidade-config → nucleo/hospede-financeiro.js.
app.put('/staff/api/hospede/fidelidade-config', requirePublishOrAdmin, (req, res) => {
  const d = req.body || {};
  const cfg = {
    recorrenteTexto: String(d.recorrenteTexto || FID_PADRAO.recorrenteTexto).slice(0, 500),
    novoTexto: String(d.novoTexto || FID_PADRAO.novoTexto).slice(0, 500),
    indicacaoTexto: String(d.indicacaoTexto || FID_PADRAO.indicacaoTexto).slice(0, 500),
  };
  salvarFidConfig(cfg);
  res.json({ ok: true, config: cfg });
});

// Conta corrente — admin (ou PUBLISH_KEY): lista de contas, extrato e lançamentos.
app.get('/staff/api/hospede/contas-corrente', requirePublishOrAdmin, (req, res) => {
  const hospedes = lerHospedes(); const ls = lerLancamentos();
  const saldo = {}, cnt = {};
  for (const l of ls) { saldo[l.hospedeId] = (saldo[l.hospedeId] || 0) + (Number(l.valor) || 0); cnt[l.hospedeId] = (cnt[l.hospedeId] || 0) + 1; }
  const contas = hospedes.map(h => ({ id: h.id, nome: h.nome || '', login: h.email || h.telefone || '', staysClientId: h.staysClientId || '', saldo: saldo[h.id] || 0, lancamentos: cnt[h.id] || 0 }))
    .sort((a, b) => a.saldo - b.saldo); // devedores (saldo negativo) primeiro
  res.json({ contas });
});
app.get('/staff/api/hospede/conta/:hospedeId', requirePublishOrAdmin, (req, res) => {
  const h = lerHospedes().find(x => x.id === req.params.hospedeId);
  if (!h) return res.status(404).json({ erro: 'Hóspede não encontrado.' });
  res.json({ hospede: semSenhaHosp(h), conta: resumoConta(h.id) });
});
app.post('/staff/api/hospede/conta/:hospedeId/lancamento', requirePublishOrAdmin, (req, res) => {
  const h = lerHospedes().find(x => x.id === req.params.hospedeId);
  if (!h) return res.status(404).json({ erro: 'Hóspede não encontrado.' });
  const d = req.body || {};
  if (!TIPOS_LANC.includes(d.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  // Venda de produto/serviço: item + quantidade × valor unitário → débito (a pagar).
  let item = '', quantidade = null, valorUnitario = null, descricao = String(d.descricao || '').slice(0, 300);
  let valor;
  if (d.tipo === 'venda') {
    item = String(d.item || '').slice(0, 200).trim();
    quantidade = Math.max(1, Math.round(Number(d.quantidade) || 1));
    valorUnitario = Number(d.valorUnitario);
    if (!item) return res.status(400).json({ erro: 'Informe o produto/serviço vendido.' });
    if (!isFinite(valorUnitario) || valorUnitario <= 0) return res.status(400).json({ erro: 'Informe o valor unitário (maior que zero).' });
    valorUnitario = Math.round(valorUnitario * 100) / 100;
    valor = -Math.round(quantidade * valorUnitario * 100) / 100; // débito
    if (!descricao) descricao = quantidade > 1 ? `${item} (${quantidade}× ${valorUnitario.toFixed(2)})` : item;
  } else {
    valor = Number(d.valor);
    if (!isFinite(valor) || valor === 0) return res.status(400).json({ erro: 'Informe um valor diferente de zero.' });
    if (d.tipo === 'cobranca') valor = -Math.abs(valor);
    else if (d.tipo !== 'ajuste') valor = Math.abs(valor); // cashback/bonus/pagamento = crédito (+)
  }
  const lanc = {
    id: novoId(), hospedeId: h.id, staysClientId: h.staysClientId || '', tipo: d.tipo,
    descricao, item, quantidade, valorUnitario, valor,
    reservaId: String(d.reservaId || ''), validade: String(d.validade || ''),
    criadoEm: new Date().toISOString(), criadoPor: req.viaChave ? 'sistema' : ((req.user && req.user.nome) || 'admin'),
  };
  const ls = lerLancamentos(); ls.push(lanc); salvarLancamentos(ls);
  registrarAuditoria(req, 'conta.lancamento', `${h.nome || h.id}: ${d.tipo} ${valor} — ${descricao}`);
  res.json({ ok: true, conta: resumoConta(h.id) });
});
app.delete('/staff/api/hospede/conta/:hospedeId/lancamento/:id', requirePublishOrAdmin, (req, res) => {
  const ls = lerLancamentos();
  const rest = ls.filter(l => !(l.hospedeId === req.params.hospedeId && l.id === req.params.id));
  if (rest.length === ls.length) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  salvarLancamentos(rest);
  res.json({ ok: true, conta: resumoConta(req.params.hospedeId) });
});

// Roda o motor de fidelidade sob demanda (force=true ignora o gate FIDELIDADE_AUTO). Admin/PUBLISH_KEY.
// Fidelidade/rodar (motor sob demanda) → nucleo/hospede-financeiro.js.

// Webhook do Mercado Pago (pagamento aprovado → lançamento, idempotente) → nucleo/hospede-financeiro.js.

// ===== Grupo Villela Stay — assets estáticos: marca (/assets/brand) + capas de livros (/assets/livros) =====
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '7d' }));


// ===== PWA dos produtos SaaS (app instalável no celular do assinante) =====
// Manifest + service worker por produto (pwa.js). Registrado ANTES dos módulos
// para que /livros/manifest.webmanifest vença a rota /livros/:slug da Livraria.
// Núcleo modularizado (Projeto 2): analytics + captura de leads; backup do DATA_DIR; proxy da Stays
try { require('./nucleo/analytics').montar(app, { DATA_DIR, tokensIguais, limiteTaxa, appendJsonl, upsertContato, registrarVisita: (d) => visitasColetor.registrar(d) }); } catch (e) { console.error('[nucleo/analytics] falha ao montar:', e.message); }
try { require('./nucleo/backup').montar(app, { DATA_DIR, requireAdminOuChave }); } catch (e) { console.error('[nucleo/backup] falha ao montar:', e.message); }
try { require('./nucleo/visitas').montarRotas(app, { DATA_DIR, requireAuth, podeArea, requirePublishOrAdmin, lerContatos }); } catch (e) { console.error('[nucleo/visitas] falha ao montar rotas:', e.message); }
try { require('./nucleo/stays-proxy').montar(app, { stays, staysPaginado, staysPost, getStaysClientes, getListingMap, resolverClientes, invalidarStaysClientes, nomeCliente, normalizarPlataforma, semAcento, CAL_STATUS, registrarAuditoria, requireAuth, requireAdmin }); } catch (e) { console.error('[nucleo/stays-proxy] falha ao montar:', e.message); }
try { require('./nucleo/crm-legado').montar(app, { requirePublishOrSession, podeCRM, lerContatos, salvarContatos, semAcento, ESTAGIOS, hojeISO, upsertContato, lerAtividades, addAtividade, stays, getListingMap, DATA_DIR }); } catch (e) { console.error('[nucleo/crm-legado] falha ao montar:', e.message); }
try { require('./nucleo/hospede-financeiro').montar(app, { requireHospede, requireAuth, requirePublishOrAdmin, resumoConta, mpFetch, AREA_HOSPEDE_URL, lerAvaliacoes, lerIndicacoes, lerFidConfig, motorFidelidade, lerLancamentos, salvarLancamentos, lerHospedes, novoId, alertaAugusto }); } catch (e) { console.error('[nucleo/hospede-financeiro] falha ao montar:', e.message); }
try { require('./nucleo/staff-core').montar(app, { requireAuth, requireAdmin, loginBloqueado, registraFalha, limpaFalhas, lerUsuarios, salvarUsuarios, JWT_SECRET, COOKIE_SECURE, semSenha, areasDoUsuario, AREAS, AREA_IDS, novoId, registrarAuditoria }); } catch (e) { console.error('[nucleo/staff-core] falha ao montar:', e.message); }
try { require('./nucleo/hospede').montar(app, { loginBloqueado, registraFalha, limpaFalhas, normFone, lerHospedes, salvarHospedes, setCookieHospede, semSenhaHosp, HOSP_COOKIE, requireHospede, stays, semAcento, novoId, getStaysClientes, JWT_SECRET, AREA_HOSPEDE_URL, enviarEmail, escHtml, reservasDoHospede, lerPropInfo, resumoConta, lerConteudo, lerEvaKB, EVA_KB_BUDGET, registrarUsoEva, lerPedidosHosp, salvarPedidosHosp, lerServicos, lerFidConfig, SECOES_CONTEUDO, lerJSON, salvarJSON, alertaAugusto, appendJsonl, itensBillaveis, reciboHtml, lerAvaliacoes, salvarAvaliacoes, hojeISO, codigoDoHospede, lerIndicacoes, salvarIndicacoes, infoPropriedade, RAIZ: __dirname }); } catch (e) { console.error('[nucleo/hospede] falha ao montar:', e.message); }

try { require('./pwa').montar(app); } catch (e) { console.error('[pwa] falha ao montar módulo:', e.message); }

// Raiz → destino conforme o subdomínio: staff.villelastay.com.br abre o Portal Staff;
// os demais (minha.villelastay.com.br / onrender) vão para a Área do Hóspede.
app.get('/', (req, res) => {
  const host = (req.hostname || '').toLowerCase();
  if (host.startsWith('staff.')) return res.redirect(302, '/staff/');
  if (host.startsWith('livros.') || host.startsWith('livraria.')) return res.redirect(302, '/livros');
  if (host.startsWith('docs.')) return res.redirect(302, '/vdocs');
  if (host.startsWith('juridico.')) return res.redirect(302, '/juridico'); // landing de vendas do Legal SaaS (assinantes); portal do cliente final = /cliente-juridico
  if (host.startsWith('projetos.') || host.startsWith('projects.')) return res.redirect(302, '/vpe');
  if (host.startsWith('manager.') || host.startsWith('gestao.')) return res.redirect(302, '/gestao'); // landing de vendas do Villela Stay Manager
  if (host.startsWith('academia.') || host.startsWith('academy.') || host.startsWith('cursos.')) return res.redirect(302, '/academy'); // Villela Academy Marketplace (domínio oficial: academia.)
  if (host.startsWith('crm.')) return res.redirect(302, '/crm'); // landing de vendas do Villela CRM
  if (host.startsWith('closet.')) return res.redirect(302, '/closet'); // vitrine do Closet Club
  if (host.startsWith('vitrine.')) return res.redirect(302, '/vitrine'); // Vitrine (marketplace de novos e usados)
  if (host.startsWith('altavista.') || host.startsWith('alta-vista.')) return res.redirect(302, '/alta-vista'); // Villela Alta Vista 360 (estúdio visual)
  if (host.startsWith('kids.')) return res.redirect(302, '/kids'); // Villela Kids (clube de missões)
  if (host.startsWith('origena.')) return res.redirect(302, '/origena'); // Origena (memória e legado familiar)
  return res.redirect(302, '/hospede');
});

// =========================== Central de Ajuda dos produtos (manual + FAQ) ===========================
// Páginas públicas <base>/ajuda, /ajuda/manual e /ajuda/faq de cada produto SaaS, renderizadas
// do markdown em ajuda/conteudo/. Registrado ANTES dos módulos para ter prioridade de rota.
try { require('./ajuda').montar(app); } catch (e) { console.error('[ajuda] falha ao montar módulo:', e.message); }

// =========================== Livraria Villela (loja de livros) ===========================
// Loja pública server-rendered (SEO) + Portal Staff (Gestão de Livros) + webhook próprio.
// Reaproveita auth/e-mail/WhatsApp/Mercado Pago já existentes (injeção de deps).
try {
  require('./livraria').montar(app, {
    express, requireAuth, requireAdmin, lerUsuarios, salvarUsuarios,
    enviarEmail, enviarWhatsApp,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    mpFetch: (typeof mpFetch === 'function') ? mpFetch : undefined,
  });
} catch (e) { console.error('[livraria] falha ao montar módulo:', e.message); }

// =========================== Villela Legal Intelligence (módulo jurídico) ===========================
// Fase 1 (fundação): clientes, processos, andamentos, publicações, prazos, tarefas,
// documentos, registro de IA, financeiro jurídico, auditoria. SQLite próprio em
// DATA_DIR/legal/. Autenticação = sessão do portal; ingestão por agentes = PUBLISH_KEY.
try {
  require('./legal').montar(app, {
    express, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios,
    enviarEmail, enviarWhatsApp,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[legal] falha ao montar módulo:', e.message); }

// =========================== Villela Legal SaaS (venda do jurídico a outros escritórios) ===========================
// Plano comercial multi-tenant do produto jurídico: landing/preços em /juridico, painel do
// assinante em /juridico/app (sessão 'jur_saas'), administração na aba ⚖️💼 do Portal Staff.
// SQLite próprio em DATA_DIR/legal-saas/. Cobrança recorrente via Mercado Pago (mpFetch).
try {
  const legalSaas = require('./legal-saas');
  legalSaas.montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    mpFetch: (typeof mpFetch === 'function') ? mpFetch : undefined,
    jwtSecret: JWT_SECRET,
  });

  // ---- PONTE: assinante logado (jur_saas) acessa o núcleo jurídico sob /juridico/api/legal ----
  // Resolve o escritório a partir do cookie jur_saas e escopa o núcleo no banco
  // dele (chave 'esc-<slug>', sem colisão com o tenant interno 'villela'),
  // gateando módulos pelos entitlements do plano.
  const jwtLib = require('jsonwebtoken');
  const assinanteDeReq = (req) => {
    const tok = req.cookies && req.cookies['jur_saas'];
    if (!tok) return null;
    let uid; try { ({ uid } = jwtLib.verify(tok, JWT_SECRET)); } catch (_) { return null; }
    const u = legalSaas.repo.Tenants.usuarioAssinante(uid);
    if (!u) return null;
    const ent = legalSaas.repo.entitlements(u.tenant_id);
    return {
      uid, tenantId: u.tenant_id, tenantSlug: 'esc-' + u.tenant_slug,
      papel: u.papel, nome: u.nome, email: u.email,
      acessoLiberado: !!(ent && ent.acesso_liberado),
      podeModulo: (mod) => legalSaas.repo.podeModulo(u.tenant_id, mod),
    };
  };
  require('./legal').montarAssinante(app, { express, assinanteDeReq, jwtSecret: JWT_SECRET });
} catch (e) { console.error('[legal-saas] falha ao montar módulo:', e.message); }

// =========================== Villela Docs Intelligence (SaaS de gestão documental) ===========================
// Produto multi-tenant vendido a OUTRAS empresas: landing/preços em /vdocs, painel do
// cliente em /vdocs/app (sessão própria 'vdocs_sess', isolada do staff), administração
// da plataforma na aba 🗂️ do Portal Staff. SQLite próprio em DATA_DIR/vdocs/.
try {
  require('./vdocs').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    mpFetch: (typeof mpFetch === 'function') ? mpFetch : undefined,
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[vdocs] falha ao montar módulo:', e.message); }

// =========================== Villela Projects & Events (SaaS de gestão de projetos/eventos) ===========================
// Produto multi-tenant (uso interno Villela = tenant 'villela-interno' com os 16 projetos +
// venda a terceiros): landing em /vpe, painel em /vpe/app (sessão própria 'vpe_sess'),
// administração na aba 📋 do Portal Staff. SQLite próprio em DATA_DIR/vpe/.
try {
  require('./vpe').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    mpFetch: (typeof mpFetch === 'function') ? mpFetch : undefined,
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[vpe] falha ao montar módulo:', e.message); }

// =========================== Villela Stay Manager (SaaS de gestão de hospedagem) ===========================
// Control plane comercial que vende o sistema de gestão de hospedagem por temporada a outros
// anfitriões/gestores: landing/preços em /gestao, painel do assinante em /gestao/app
// (sessão própria 'vsm_sess', isolada do staff), administração na aba 🏨 do Portal Staff.
// SQLite próprio em DATA_DIR/vsm/. Cobrança recorrente via Mercado Pago (mpFetch).
try {
  require('./vsm').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    mpFetch: (typeof mpFetch === 'function') ? mpFetch : undefined,
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[vsm] falha ao montar módulo:', e.message); }

// =========================== Villela Academy Marketplace (cursos online e produtos digitais) ===========================
// Marketplace multi-produtor de cursos/infoprodutos: landing em /academy, painel
// (aluno/produtor/afiliado/admin) em /academy/app (sessão própria 'academy_sess'),
// administração da plataforma em /staff/api/academy/*. SQLite próprio em
// DATA_DIR/academy/. FASE 1 = fundação; roadmap em academy/ROADMAP.md.
try {
  require('./academy').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    mpFetch: (typeof mpFetch === 'function') ? mpFetch : undefined,
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[academy] falha ao montar módulo:', e.message); }

// =========================== Villela CRM (SaaS de CRM inteligente multicanal) ===========================
// CRM multi-tenant vendido a outras empresas (e usado pelo grupo como tenant interno):
// landing/preços em /crm, painel do assinante em /crm/app (sessão própria 'crm_sess'),
// administração da plataforma em /staff/api/vcrm/* (vcrm ≠ CRM legado do staff em
// /staff/api/crm/*). SQLite próprio em DATA_DIR/crm/. Cobrança recorrente via MP.
let crmMontado = null;   // expõe requireAssinante ao Growth OS (ADR-0002)
try {
  crmMontado = require('./crm').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    mpFetch: (typeof mpFetch === 'function') ? mpFetch : undefined,
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[crm] falha ao montar módulo:', e.message); }

// =========================== Closet Club (marketplace de aluguel de roupas) ===========================
// "O Airbnb dos guarda-roupas": vitrine pública em /closet, painel do usuário em
// /closet/app (sessão própria 'closet_sess'), administração na aba 👗 do Portal
// Staff (/staff/api/closet/*). NÃO é multi-tenant: é uma plataforma só, com N
// proprietários e N clientes. Pagamento em escrow (Pix) e repasse por dono.
try {
  require('./closet').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    mpFetch: (typeof mpFetch === 'function') ? mpFetch : undefined,
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[closet] falha ao montar módulo:', e.message); }

// =========================== Vitrine (marketplace de produtos novos e usados) ===========================
// 10º produto do grupo: marketplace de VENDA (não aluguel — Closet Club é outro
// produto) entre pessoas. Loja pública em /vitrine, painel do usuário em
// /vitrine/app (sessão própria 'vitrine_sess'), administração na aba 🛒 do
// Portal Staff (/staff/api/vitrine/*). SQLite próprio em DATA_DIR/vitrine/.
// Pagamento e frete SIMULADOS no MVP (MP Split e Melhor Envio entram na fase 6
// pela mesma camada de provedores). Comissão configurável (padrão 5%).
try {
  require('./vitrine').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[vitrine] falha ao montar módulo:', e.message); }

// =========================== Villela Growth OS (plataforma de receita) ===========================
// Evolução do Villela CRM (ADR-0002): MESMO banco DATA_DIR/crm/crm.db, tabelas
// novas com prefixo gx_. Etapa 1 = fundação SaaS: organizações/agências,
// identidade global, RBAC granular, entitlements, eventos com outbox, fila
// durável, aprovações, incidentes, cofre de segredos e catálogo de conectores.
// Administração em /staff/api/growth/*. GROWTH_WORKER=off desliga o worker.
// Escopo: docs/PROMPT_MASTER_VILLELA_GROWTH_OS.md · estado: docs/growth-os/PROJECT_STATE.md
try {
  require('./growth').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    jwtSecret: JWT_SECRET,
    // painel do assinante: as abas do Growth entram em /crm/app usando a
    // sessao do CRM. Se o CRM nao montou, o Growth sobe so com o admin.
    requireAssinante: crmMontado && crmMontado.requireAssinante,
  });
} catch (e) { console.error('[growth] falha ao montar módulo:', e.message); }

// =========================== Villela Alta Vista 360 (estúdio visual) ===========================
// Drone, vídeos com IA, fotografia 360° e tours virtuais para hospedagens e
// imóveis: site público em /alta-vista, administração na aba 🚁 do Portal
// Staff (/staff/api/alta-vista/*). SQLite próprio em DATA_DIR/alta-vista/.
// Onda 1 = vitrine + catálogo + leads; plano completo em
// docs/integracoes/villela-alta-vista-360.md.
try {
  require('./alta-vista').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    mpFetch: (typeof mpFetch === 'function') ? mpFetch : undefined,
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[alta-vista] falha ao montar módulo:', e.message); }

// =========================== Villela Kids (clube de missões) ===========================
// 11º produto do grupo: desenvolvimento humano para crianças de 7–11 anos —
// missões semanais com produto final, portfólio de criações e (onda 2) tutor
// por IA. Landing em /kids, app da família em /kids/app (sessão própria
// 'kids_sess'; a conta é SEMPRE do responsável — LGPD art. 14), administração
// na aba 🧒 do Portal Staff (/staff/api/kids/*). SQLite próprio em
// DATA_DIR/kids/. Escopo: docs/PROMPT_MASTER_VILLELA_KIDS.md (repo-pai).
try {
  require('./kids').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    jwtSecret: JWT_SECRET,
  });
} catch (e) { console.error('[kids] falha ao montar módulo:', e.message); }

// ORIGENA — plataforma de memória, história e legado familiar (12º produto).
// Landing /origena, app da família /origena/app, staff em /staff/api/origena/*.
// Difere dos outros 11 de propósito: PostgreSQL próprio (ORIGENA_DATABASE_URL),
// todo binário no R2 (ORIGENA_S3_*) e worker SEPARADO para mídia — os porquês
// estão em docs/origena/DECISIONS/ (repo-pai). Sem as envs, só a landing sobe.
// `montar` é async (roda migração): as rotas são registradas de forma síncrona
// ANTES do await, então nenhuma requisição chega a uma rota inexistente.
try {
  require('./origena').montar(app, {
    express, requireAuth, requireAdmin, enviarEmail,
    alertaAugusto: (typeof alertaAugusto === 'function') ? alertaAugusto : async () => {},
    jwtSecret: JWT_SECRET,
  }).catch((e) => console.error('[origena] falha ao montar módulo:', e.message));
} catch (e) { console.error('[origena] falha ao montar módulo:', e.message); }

// Estáticos do portal (login + app). Registrado DEPOIS das rotas /staff/api/*.
app.use('/staff', express.static(path.join(__dirname, 'staff')));
// Estáticos da Área do Hóspede. Registrado DEPOIS das rotas /hospede/api/*.
app.use('/hospede', express.static(path.join(__dirname, 'hospede')));

// Manutenção diária do DATA_DIR: snapshots consistentes (backup restaurável off-site) +
// purga de eventos antigos (>90d nas tabelas de log de alto volume) + alarme de disco.
// MANUTENCAO_OFF=1 desliga tudo; SNAPSHOTS_OFF/SNAPSHOTS_MANTER/PURGA_DIAS/DISK_LIMIT_MB ajustam.
if (process.env.MANUTENCAO_OFF !== '1') {
  const { snapshotTodos } = require('./snapshots');
  const { purgarEventosAntigos, tamanhoDir } = require('./manutencao');
  const LIMITE_MB = Number(process.env.DISK_LIMIT_MB) || 1024; // disco do Render = 1GB
  const rodarManutencao = async () => {
    try {
      if (process.env.SNAPSHOTS_OFF !== '1') {
        const feitos = snapshotTodos(DATA_DIR, { manter: Number(process.env.SNAPSHOTS_MANTER) || 7 });
        if (feitos.length) console.log('[manutencao] snapshots:', feitos.length, 'banco(s) SQLite');
      }
      const purga = purgarEventosAntigos(DATA_DIR, { dias: Number(process.env.PURGA_DIAS) || 90 });
      if (purga.totalApagado) console.log('[manutencao] purga:', purga.totalApagado, 'evento(s) antigos', JSON.stringify(purga.detalhe));
      const usadoMB = Math.round(tamanhoDir(DATA_DIR) / 1048576);
      const pct = Math.round((usadoMB / LIMITE_MB) * 100);
      console.log(`[manutencao] disco: ${usadoMB}MB / ${LIMITE_MB}MB (${pct}%)`);
      if (pct >= 80) {
        try { await alertaAugusto(`Disco do backend em ${pct}% (${usadoMB}MB de ${LIMITE_MB}MB). Os 7 SaaS compartilham este volume — verifique/limpe antes de encher.`); } catch {}
      }
    } catch (e) { console.error('[manutencao] erro:', e.message); }
  };
  setTimeout(rodarManutencao, 60000).unref();             // ~1 min após subir (idempotente por dia)
  setInterval(rodarManutencao, 24 * 3600 * 1000).unref(); // e a cada 24h
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Villela Stay rodando na porta ${PORT}`));
