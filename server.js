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
app.use(express.json({ limit: '15mb' })); // 15mb p/ aceitar PDFs em base64 no upload de relatórios
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // form-urlencoded (ex.: ingestão do Make → CRM)
app.use(cookieParser());

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
    const corpo = {
      to: String(foneBruto).replace(/\D/g, ''),
      template: 'confirmacao_reserva::pt_BR',
      p1: cli.fName || cli.name || 'hóspede', p2: titulo,
      p3: fmt(p.checkInDate), p4: fmt(p.checkOutDate)
    };
    await fetch(process.env.MAKE_WA_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    console.log('[confirmacao] template enviado para', corpo.to, '— reserva', p.id);
  } catch (e) { console.error('[confirmacao] erro:', e.message); }
}

// Webhook da Stays (configurar na Stays apontando para https://SEU-DOMINIO/webhooks/stays)
app.post('/webhooks/stays', (req, res) => {
  console.log('[webhook stays]', JSON.stringify(req.body).slice(0, 500));
  appendJsonl('eventos.jsonl', { origem: 'stays', evento: req.body });
  confirmarReservaWhatsApp(req.body); // assíncrono, não bloqueia a resposta
  ingestStaysEvent(req.body);         // CRM: cliente/reserva vira contato (Fase 2)
  res.sendStatus(200);
});

// Consulta dos últimos eventos recebidos (protegido por chave de admin)
app.get('/api/eventos', (req, res) => {
  if (!process.env.ADMIN_KEY || req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.sendStatus(401);
  }
  const file = path.join(DATA_DIR, 'eventos.jsonl');
  if (!fs.existsSync(file)) return res.json([]);
  const linhas = fs.readFileSync(file, 'utf8').trim().split('\n').slice(-50);
  res.json(linhas.map(l => { try { return JSON.parse(l); } catch { return { bruto: l }; } }));
});

// Analytics próprio: registra page views (GET sem preflight de CORS; sem cookies — LGPD ok)
app.get('/api/hit', (req, res) => {
  const { p, r } = req.query;
  if (p) appendJsonl('hits.jsonl', { pagina: String(p).slice(0, 200), origemRef: String(r || '').slice(0, 300), ua: String(req.headers['user-agent'] || '').slice(0, 200) });
  res.sendStatus(204);
});

// Resumo de visitas (protegido): páginas mais vistas e visitas por dia
app.get('/api/estatisticas', (req, res) => {
  if (!process.env.ADMIN_KEY || req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.sendStatus(401);
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
  const { nome, contato, mensagem, origem } = req.body || {};
  if (!nome || !contato) return res.status(400).json({ erro: 'nome e contato são obrigatórios' });
  appendJsonl('leads.jsonl', { nome, contato, mensagem, origem: origem || 'site' }); // mantém log antigo
  try { upsertContato({ nome, contato, mensagem, origem: origem || 'site' }); } // CRM: vira contato (dedupe)
  catch (e) { console.error('[crm] falha ao criar contato do lead:', e.message); }
  res.json({ ok: true });
});

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
    if (!process.env.ADMIN_KEY || req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.sendStatus(401);
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
  fs.writeFileSync(path.join(DATA_DIR, arquivo), JSON.stringify(obj, null, 2));
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
    c.atualizadoEm = agora;
    salvarContatos(contatos);
    if (dados.mensagem) addAtividade(c.id, 'mensagem-recebida', dados.mensagem, dados.origem || '', 'sistema');
    return { contato: c, novo: false };
  }

  c = {
    id: novoId(), nome: dados.nome || '', telefone: tel, email,
    origem: dados.origem || 'manual', estagio: 'novo', dono: 'Augusto',
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
  if (process.env.PUBLISH_KEY && key && key === process.env.PUBLISH_KEY) { req.viaChave = true; return next(); }
  return requireAuth(req, res, next);
}
// Como requirePublishOrSession, mas a sessão precisa ser admin (a PUBLISH_KEY sempre passa).
// Usado na config da Área do Hóspede (imóveis, serviços, fidelidade) p/ permitir manutenção via chave.
function requirePublishOrAdmin(req, res, next) {
  const key = req.headers['x-publish-key'];
  if (process.env.PUBLISH_KEY && key && key === process.env.PUBLISH_KEY) { req.viaChave = true; return next(); }
  return requireAuth(req, res, () => requireAdmin(req, res, next));
}

// Nunca cachear respostas da API do portal — o navegador pode guardar GETs sem
// Cache-Control e mostrar conteúdo antigo (ex.: texto desatualizado de um relatório).
app.use('/staff/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// =========================== sessão ===========================
app.post('/staff/api/login', (req, res) => {
  // Submissao por FORMULARIO NATIVO (POST + redirect) faz o gerenciador de senhas do
  // navegador (Edge/Chrome) oferecer salvar e autopreencher — o fetch/AJAX nao dispara
  // o prompt de forma confiavel. Detecta o modo pela negociacao de conteudo: pedido JSON
  // (fetch antigo) -> mantem a resposta JSON; pedido de pagina (form nativo) -> redirect 303.
  const querJson = req.is('application/json') || req.accepts(['html', 'json']) === 'json';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip';
  if (loginBloqueado(ip)) {
    if (querJson) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
    return res.redirect(303, '/staff/?login_erro=2');
  }
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  // Form nativo envia "password" (name do input); fetch antigo envia "senha". Aceita os dois.
  const senha = String((req.body && (req.body.senha != null ? req.body.senha : req.body.password)) || '');
  const user = lerUsuarios().find(u => u.email === email && u.ativo);
  if (!user || !bcrypt.compareSync(senha, user.senhaHash)) {
    registraFalha(ip);
    if (querJson) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    return res.redirect(303, '/staff/?login_erro=1');
  }
  limpaFalhas(ip);
  const usuarios = lerUsuarios();
  const u = usuarios.find(x => x.id === user.id);
  u.ultimoLogin = new Date().toISOString();
  salvarUsuarios(usuarios);
  // Sessao longa (30 dias) para nao precisar redigitar a cada uso; cookie persistente no dispositivo.
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('staff_token', token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, path: '/staff' });
  if (querJson) return res.json({ ok: true, usuario: semSenha(u), areas: areasDoUsuario(u), catalogoAreas: AREAS });
  // Form nativo: redireciona para o portal; o boot chama /staff/api/me e abre o app.
  return res.redirect(303, '/staff/');
});

app.post('/staff/api/logout', (req, res) => {
  res.clearCookie('staff_token', { path: '/staff' });
  res.json({ ok: true });
});

app.get('/staff/api/me', requireAuth, (req, res) => {
  res.json({ usuario: semSenha(req.user), areas: areasDoUsuario(req.user), catalogoAreas: AREAS });
});

app.post('/staff/api/conta/senha', requireAuth, (req, res) => {
  const atual = String((req.body && req.body.atual) || '');
  const nova = String((req.body && req.body.nova) || '');
  if (nova.length < 8) return res.status(400).json({ erro: 'A nova senha deve ter ao menos 8 caracteres.' });
  if (!bcrypt.compareSync(atual, req.user.senhaHash)) return res.status(400).json({ erro: 'Senha atual incorreta.' });
  const usuarios = lerUsuarios();
  const u = usuarios.find(x => x.id === req.user.id);
  u.senhaHash = bcrypt.hashSync(nova, 10);
  u.precisaTrocarSenha = false;
  salvarUsuarios(usuarios);
  res.json({ ok: true });
});

// ===================== usuários (admin) =====================
app.get('/staff/api/usuarios', requireAuth, requireAdmin, (req, res) => {
  res.json({ usuarios: lerUsuarios().map(semSenha), catalogoAreas: AREAS });
});

app.post('/staff/api/usuarios', requireAuth, requireAdmin, (req, res) => {
  const d = req.body || {};
  const email = String(d.email || '').trim().toLowerCase();
  const senha = String(d.senha || '');
  const nome = String(d.nome || '').trim();
  if (!nome || !email || !/.+@.+\..+/.test(email)) return res.status(400).json({ erro: 'Nome e e-mail válidos são obrigatórios.' });
  if (senha.length < 8) return res.status(400).json({ erro: 'Senha inicial com ao menos 8 caracteres.' });
  const usuarios = lerUsuarios();
  if (usuarios.some(u => u.email === email)) return res.status(409).json({ erro: 'Já existe usuário com esse e-mail.' });
  const papel = d.papel === 'admin' ? 'admin' : 'staff';
  const areas = papel === 'admin' ? ['*'] : (Array.isArray(d.areas) ? d.areas.filter(a => AREA_IDS.has(a)) : []);
  const novo = {
    id: novoId(), nome, email, senhaHash: bcrypt.hashSync(senha, 10),
    papel, areas, ativo: true, precisaTrocarSenha: true,
    criadoEm: new Date().toISOString(), ultimoLogin: null,
  };
  usuarios.push(novo);
  salvarUsuarios(usuarios);
  res.json({ ok: true, usuario: semSenha(novo) });
});

app.patch('/staff/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const usuarios = lerUsuarios();
  const u = usuarios.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const d = req.body || {};
  if (typeof d.nome === 'string' && d.nome.trim()) u.nome = d.nome.trim();
  if (d.papel === 'admin' || d.papel === 'staff') { u.papel = d.papel; if (d.papel === 'admin') u.areas = ['*']; }
  if (Array.isArray(d.areas) && u.papel !== 'admin') u.areas = d.areas.filter(a => AREA_IDS.has(a));
  if (typeof d.ativo === 'boolean') {
    // não permitir desativar o último admin ativo
    if (!d.ativo && u.papel === 'admin' && usuarios.filter(x => x.papel === 'admin' && x.ativo).length <= 1)
      return res.status(400).json({ erro: 'Não é possível desativar o único administrador.' });
    u.ativo = d.ativo;
  }
  if (typeof d.novaSenha === 'string' && d.novaSenha) {
    if (d.novaSenha.length < 8) return res.status(400).json({ erro: 'Senha com ao menos 8 caracteres.' });
    u.senhaHash = bcrypt.hashSync(d.novaSenha, 10);
    u.precisaTrocarSenha = true;
  }
  salvarUsuarios(usuarios);
  res.json({ ok: true, usuario: semSenha(u) });
});

app.delete('/staff/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const usuarios = lerUsuarios();
  const u = usuarios.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (u.id === req.user.id) return res.status(400).json({ erro: 'Você não pode remover a si mesmo.' });
  if (u.papel === 'admin' && usuarios.filter(x => x.papel === 'admin' && x.ativo).length <= 1)
    return res.status(400).json({ erro: 'Não é possível remover o único administrador.' });
  salvarUsuarios(usuarios.filter(x => x.id !== u.id));
  res.json({ ok: true });
});

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
app.get('/staff/api/crm/contatos', requirePublishOrSession, podeCRM, (req, res) => {
  const { estagio, origem, busca } = req.query;
  let lista = lerContatos();
  if (estagio) lista = lista.filter(c => c.estagio === estagio);
  if (origem) lista = lista.filter(c => c.origem === origem);
  if (busca) {
    const q = semAcento(busca).trim();
    lista = lista.filter(c => [c.nome, c.telefone, c.email].some(v => semAcento(v).includes(q)));
  }
  res.json({ contatos: lista });
});

// Métricas do funil (contagem e valor por estágio)
app.get('/staff/api/crm/funil', requirePublishOrSession, podeCRM, (req, res) => {
  const contatos = lerContatos();
  const porEstagio = {};
  for (const e of ESTAGIOS) porEstagio[e] = { n: 0, valor: 0 };
  let total = { n: 0, valor: 0 };
  for (const c of contatos) {
    const e = ESTAGIOS.includes(c.estagio) ? c.estagio : 'novo';
    porEstagio[e].n++; porEstagio[e].valor += Number(c.valorEstimado) || 0;
    if (e !== 'perdido') { total.n++; total.valor += Number(c.valorEstimado) || 0; }
  }
  res.json({ porEstagio, total }); // total exclui "perdido"
});

// Métricas do funil (Fase 5): conversão, valor no pipeline, por origem, motivos de perda, imóveis.
app.get('/staff/api/crm/metricas', requirePublishOrSession, podeCRM, (req, res) => {
  const contatos = lerContatos();
  const porEstagio = {}; ESTAGIOS.forEach(e => porEstagio[e] = { n: 0, valor: 0 });
  const porOrigem = {}, motivosPerda = {}, porImovel = {};
  for (const c of contatos) {
    const e = ESTAGIOS.includes(c.estagio) ? c.estagio : 'novo';
    porEstagio[e].n++; porEstagio[e].valor += Number(c.valorEstimado) || 0;
    const o = c.origem || 'manual'; porOrigem[o] = (porOrigem[o] || 0) + 1;
    if (e === 'perdido') { const m = (c.motivoPerda || '').trim() || 'Sem motivo'; motivosPerda[m] = (motivosPerda[m] || 0) + 1; }
    if (c.imovelInteresse) porImovel[c.imovelInteresse] = (porImovel[c.imovelInteresse] || 0) + 1;
  }
  const ganhosEst = ['reserva', 'hospedado', 'posvenda'];
  const ganhos = ganhosEst.reduce((s, e) => s + porEstagio[e].n, 0);
  const perdidos = porEstagio['perdido'].n;
  const total = contatos.length;
  const pct = (a, b) => b ? Math.round((a / b) * 1000) / 10 : 0;
  res.json({
    total, ganhos, perdidos, emNegociacao: total - ganhos - perdidos,
    taxaConversao: pct(ganhos, total),
    taxaFechamento: pct(ganhos, ganhos + perdidos),
    pipelineValor: ['novo', 'contato', 'orcamento', 'negociacao'].reduce((s, e) => s + porEstagio[e].valor, 0),
    ganhosValor: ganhosEst.reduce((s, e) => s + porEstagio[e].valor, 0),
    porEstagio, porOrigem, motivosPerda,
    topImoveis: Object.entries(porImovel).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ imovel: k, n: v })),
  });
});

// Caixa de follow-ups: próximas ações vencidas ou para hoje
app.get('/staff/api/crm/followups', requirePublishOrSession, podeCRM, (req, res) => {
  const hoje = hojeISO();
  const lista = lerContatos()
    .filter(c => c.estagio !== 'perdido' && c.proximaAcao && c.proximaAcao.data && c.proximaAcao.data <= hoje)
    .sort((a, b) => String(a.proximaAcao.data).localeCompare(String(b.proximaAcao.data)));
  res.json({ followups: lista });
});

// Criar contato (dedupe por telefone/e-mail)
app.post('/staff/api/crm/contatos', requirePublishOrSession, podeCRM, (req, res) => {
  const d = req.body || {};
  if (!d.nome && !d.telefone && !d.contato && !d.email) return res.status(400).json({ erro: 'Informe ao menos nome e telefone/e-mail.' });
  const { contato, novo } = upsertContato(d);
  res.json({ ok: true, novo, contato });
});

// Detalhe do contato + linha do tempo
app.get('/staff/api/crm/contatos/:id', requirePublishOrSession, podeCRM, (req, res) => {
  const c = lerContatos().find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
  res.json({ contato: c, atividades: lerAtividades(c.id) });
});

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
app.get('/staff/api/crm/contatos/:id/stays', requirePublishOrSession, podeCRM, async (req, res) => {
  const c = lerContatos().find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
  if (!c.staysClientId) return res.json({ vinculado: false });
  try {
    const cli = await stays(`/booking/clients/${c.staysClientId}`);
    const mapa = await getListingMap();
    const reservas = (Array.isArray(cli.reservations) ? cli.reservations : []).map(r => ({
      id: r.id, type: r.type, checkin: r.checkInDate, checkout: r.checkOutDate,
      imovel: (mapa[r._idlisting] && mapa[r._idlisting].codigo) || '',
      imovelTitulo: (mapa[r._idlisting] && mapa[r._idlisting].titulo) || '',
      valor: (r.price && r.price._f_total) || 0,
      hospedes: r.guests || (r.guestsDetails && r.guestsDetails.adults) || null,
    })).sort((a, b) => String(b.checkin).localeCompare(String(a.checkin)));
    const efetivas = reservas.filter(r => ['booked', 'reserved', 'contract'].includes(r.type));
    const totalGasto = efetivas.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    res.json({ vinculado: true, totalReservas: efetivas.length, totalGasto, reservas });
  } catch (e) { console.error('[crm stays]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
});

// Atualizar contato (estágio, próxima ação, valor, imóvel, período, preferências, nome, e-mail)
app.patch('/staff/api/crm/contatos/:id', requirePublishOrSession, podeCRM, (req, res) => {
  const contatos = lerContatos();
  const c = contatos.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
  const d = req.body || {};
  if (d.estagio !== undefined) {
    if (!ESTAGIOS.includes(d.estagio)) return res.status(400).json({ erro: 'Estágio inválido.' });
    if (d.estagio !== c.estagio) { addAtividade(c.id, 'mudanca-estagio', `${c.estagio} → ${d.estagio}`, '', req.viaChave ? 'sistema' : req.user.nome); c.estagio = d.estagio; }
  }
  if (d.proximaAcao !== undefined) c.proximaAcao = { descricao: String(d.proximaAcao.descricao || ''), data: String(d.proximaAcao.data || '') };
  if (d.valorEstimado !== undefined) c.valorEstimado = d.valorEstimado === null ? null : Number(d.valorEstimado);
  if (d.imovelInteresse !== undefined) c.imovelInteresse = String(d.imovelInteresse);
  if (d.periodo !== undefined) c.periodo = { checkin: d.periodo.checkin || '', checkout: d.periodo.checkout || '', hospedes: d.periodo.hospedes || '' };
  if (d.preferencias !== undefined) c.preferencias = String(d.preferencias);
  if (d.nome !== undefined) c.nome = String(d.nome);
  if (d.email !== undefined) c.email = String(d.email).trim().toLowerCase();
  c.atualizadoEm = new Date().toISOString();
  salvarContatos(contatos);
  res.json({ ok: true, contato: c });
});

// Registrar atividade manual (nota/mensagem)
app.post('/staff/api/crm/contatos/:id/atividade', requirePublishOrSession, podeCRM, (req, res) => {
  const c = lerContatos().find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
  const d = req.body || {};
  if (!d.texto) return res.status(400).json({ erro: 'texto é obrigatório.' });
  const tipo = ['mensagem-recebida', 'mensagem-enviada', 'nota', 'tarefa', 'cotacao', 'contrato', 'pos-venda'].includes(d.tipo) ? d.tipo : 'nota';
  addAtividade(c.id, tipo, d.texto, d.canal || '', req.viaChave ? 'sistema' : req.user.nome);
  res.json({ ok: true });
});

// Marcar como perdido (com motivo)
app.post('/staff/api/crm/contatos/:id/perder', requirePublishOrSession, podeCRM, (req, res) => {
  const contatos = lerContatos();
  const c = contatos.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
  c.estagio = 'perdido'; c.motivoPerda = String((req.body && req.body.motivo) || ''); c.atualizadoEm = new Date().toISOString();
  salvarContatos(contatos);
  addAtividade(c.id, 'mudanca-estagio', 'Perdido' + (c.motivoPerda ? ` (${c.motivoPerda})` : ''), '', req.viaChave ? 'sistema' : req.user.nome);
  res.json({ ok: true, contato: c });
});

// Excluir contato (somente admin ou PUBLISH_KEY) — remove o contato e suas atividades.
app.delete('/staff/api/crm/contatos/:id', requirePublishOrSession, (req, res) => {
  if (!req.viaChave && (!req.user || req.user.papel !== 'admin')) return res.status(403).json({ erro: 'Apenas admin pode excluir contato.' });
  const contatos = lerContatos();
  if (!contatos.find(x => x.id === req.params.id)) return res.status(404).json({ erro: 'Contato não encontrado.' });
  salvarContatos(contatos.filter(x => x.id !== req.params.id));
  try { // remove as atividades órfãs do contato
    const f = path.join(DATA_DIR, 'atividades.jsonl');
    if (fs.existsSync(f)) {
      const linhas = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).filter(l => { try { return JSON.parse(l).contatoId !== req.params.id; } catch { return true; } });
      fs.writeFileSync(f, linhas.length ? linhas.join('\n') + '\n' : '');
    }
  } catch (e) { console.error('[crm delete] limpeza atividades:', e.message); }
  res.json({ ok: true });
});

// Migração única: leads.jsonl (formato antigo) -> contatos (dedupe). Admin ou PUBLISH_KEY.
app.post('/staff/api/crm/migrar-leads', requirePublishOrSession, (req, res) => {
  if (!req.viaChave && (!req.user || req.user.papel !== 'admin')) return res.status(403).json({ erro: 'Apenas admin.' });
  const f = path.join(DATA_DIR, 'leads.jsonl');
  if (!fs.existsSync(f)) return res.json({ ok: true, importados: 0, total: 0 });
  const linhas = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  let importados = 0;
  for (const l of linhas) {
    let o; try { o = JSON.parse(l); } catch { continue; }
    const { novo } = upsertContato({
      nome: o.nome, contato: o.contato, mensagem: o.mensagem,
      origem: o.origem || 'site', criadoEm: o._recebido,
    });
    if (novo) importados++;
  }
  res.json({ ok: true, importados, total: linhas.length });
});

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
  salvarJSON(arq, restantes);
  res.json({ ok: true, removidos: itens.length - restantes.length });
});

app.post('/staff/api/listas/:tipo/limpar', requirePublishOrSession, (req, res) => {
  const arq = LISTA_ARQ[req.params.tipo];
  if (!arq) return res.status(400).json({ erro: 'Tipo inválido.' });
  if (!podeLista(req, res)) return;
  salvarJSON(arq, []);
  res.json({ ok: true });
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
const nomeCliente = c => c.name || [c.fName, c.lName].filter(Boolean).join(' ') || '—';

// Imóveis (para os selects do formulário de criação)
app.get('/staff/api/stays/imoveis', requireAuth, async (req, res) => {
  try {
    const listings = await staysPaginado('/content/listings', {});
    const ordemSub = { entire_home: 0, private_room: 1 };
    const imoveis = listings.filter(l => l.status === 'active').map(l => ({
      idlisting: l._id, codigo: l.id, titulo: (l.internalName || (l._mstitle && l._mstitle.pt_BR) || l.id), subtype: l.subtype || ''
    })).sort((a, b) => (ordemSub[a.subtype] ?? 9) - (ordemSub[b.subtype] ?? 9) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
    res.json({ imoveis });
  } catch (e) { console.error('[stays imoveis]', e.message); res.status(502).json({ erro: 'Falha ao listar imóveis.' }); }
});

// Central de hóspedes (lista + busca, paginada)
app.get('/staff/api/stays/clientes', requireAuth, async (req, res) => {
  try {
    let lista = await getStaysClientes();
    const q = semAcento(req.query.busca || '').trim();
    if (q) lista = lista.filter(c => semAcento(nomeCliente(c)).includes(q));
    // ordem alfabética por nome (sem acento/caixa); nomes vazios/"—" vão para o fim
    const chaveOrd = (c) => { const n = semAcento(nomeCliente(c)).trim(); return (!n || !/[a-z0-9]/.test(n[0])) ? '￿' + n : n; };
    lista = lista.slice().sort((a, b) => chaveOrd(a).localeCompare(chaveOrd(b), 'pt-BR'));
    const total = lista.length;
    const skip = Math.max(0, parseInt(req.query.skip) || 0);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 30), 100);
    const clientes = lista.slice(skip, skip + limit).map(c => ({
      id: c._id, nome: nomeCliente(c), origem: c.clientSource || '', criadoEm: c.creationDate || ''
    }));
    res.json({ total, skip, limit, clientes });
  } catch (e) { console.error('[stays clientes]', e.message); res.status(502).json({ erro: 'Falha ao listar hóspedes.' }); }
});

// Ficha do hóspede (contato + reservas + gasto) — o objeto do cliente já traz reservations.
app.get('/staff/api/stays/cliente/:id', requireAuth, async (req, res) => {
  try {
    const cli = await stays(`/booking/clients/${req.params.id}`);
    const mapa = await getListingMap();
    const reservas = (cli.reservations || []).map(r => ({
      id: r.id || r._id, imovel: (mapa[r._idlisting] && mapa[r._idlisting].codigo) || '',
      imovelTitulo: (mapa[r._idlisting] && mapa[r._idlisting].titulo) || '',
      checkIn: r.checkInDate, checkOut: r.checkOutDate, status: r.type, statusRotulo: CAL_STATUS[r.type] || r.type,
      valorTotal: (r.price && r.price._f_total != null) ? r.price._f_total : null, moeda: (r.price && r.price.currency) || 'BRL', hospedes: r.guests
    })).sort((a, b) => (b.checkIn || '').localeCompare(a.checkIn || ''));
    const telefones = (cli.phones || []).map(p => p.iso || p.number || p).filter(v => typeof v === 'string' && v);
    const emails = (cli.emails || []).map(e => (e && (e.address || e.email)) || (typeof e === 'string' ? e : '')).filter(Boolean);
    if (!emails.length && cli.email) emails.push(cli.email);
    const totalGasto = reservas.filter(r => r.status !== 'canceled' && r.status !== 'blocked').reduce((s, r) => s + (r.valorTotal || 0), 0);
    res.json({ id: cli._id, nome: nomeCliente(cli), telefones, emails, origem: cli.clientSource || '', criadoEm: cli.creationDate || '', totalReservas: reservas.length, totalGasto, reservas });
  } catch (e) { console.error('[stays cliente]', e.message); res.status(502).json({ erro: 'Falha ao carregar o hóspede.' }); }
});

// Buscar reservas por hóspede/imóvel num período
app.get('/staff/api/stays/reservas', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || ''))
      return res.status(400).json({ erro: 'Parâmetros from e to (yyyy-MM-dd) são obrigatórios.' });
    const mapa = await getListingMap();
    const brutas = await staysPaginado('/booking/reservations', { from, to, dateType: 'included' });
    const validas = brutas.filter(r => r.type !== 'canceled');
    const cache = await resolverClientes(validas.map(r => r._idclient));
    const q = semAcento(req.query.busca || '').trim();
    let reservas = validas.map(r => {
      const ehBloqueio = r.type === 'blocked' || r.type === 'maintenance';
      const plat = normalizarPlataforma(r.partner);
      return {
        id: r.id || r._id, idInterno: r._id, idclient: r._idclient || '',
        imovel: (mapa[r._idlisting] && mapa[r._idlisting].codigo) || '', imovelTitulo: (mapa[r._idlisting] && mapa[r._idlisting].titulo) || '',
        hospede: ehBloqueio ? (CAL_STATUS[r.type] || 'Bloqueio') : ((r._idclient && cache[r._idclient]) || '—'), bloqueio: ehBloqueio,
        plataformaRotulo: ehBloqueio ? '' : plat.rotulo, status: r.type, statusRotulo: CAL_STATUS[r.type] || r.type,
        checkIn: r.checkInDate, checkOut: r.checkOutDate,
        noites: (r.checkInDate && r.checkOutDate) ? Math.max(0, Math.round((Date.parse(r.checkOutDate) - Date.parse(r.checkInDate)) / 86400000)) : null,
        hospedes: r.guests, valorTotal: (r.price && r.price._f_total != null) ? r.price._f_total : null, moeda: (r.price && r.price.currency) || 'BRL', reservationUrl: r.reservationUrl || ''
      };
    });
    if (q) reservas = reservas.filter(r => semAcento(r.hospede).includes(q) || semAcento(r.imovel).includes(q) || semAcento(r.id).includes(q));
    reservas.sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));
    res.json({ from, to, reservas });
  } catch (e) { console.error('[stays reservas]', e.message); res.status(502).json({ erro: 'Falha ao buscar reservas.' }); }
});

// Disponibilidade + preço sugerido de um imóvel no período (para o formulário de criação)
app.get('/staff/api/stays/disponibilidade', requireAuth, async (req, res) => {
  try {
    const { listingId, from, to } = req.query;
    if (!listingId || !/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || to <= from)
      return res.status(400).json({ erro: 'Informe imóvel e datas válidas (check-out depois do check-in).' });
    const cal = await stays(`/calendar/listing/${listingId}`, { from, to });
    const noites = cal.filter(d => d.date >= from && d.date < to).map(d => ({
      date: d.date, avail: d.avail > 0, precoBRL: d.prices && d.prices[0] ? d.prices[0]._mcval.BRL : null
    }));
    res.json({ listingId, from, to, todasLivres: noites.length > 0 && noites.every(n => n.avail), noites, totalSugerido: noites.reduce((s, n) => s + (n.precoBRL || 0), 0) });
  } catch (e) { console.error('[stays disp]', e.message); res.status(502).json({ erro: 'Falha ao consultar disponibilidade.' }); }
});

// Criar reserva (direta) ou bloqueio — SOMENTE ADMIN. Cria na Stays, que espelha o
// bloqueio nos canais conectados (Airbnb/Booking/Decolar...) automaticamente.
app.post('/staff/api/stays/reserva', requireAuth, requireAdmin, async (req, res) => {
  try {
    const d = req.body || {};
    const tipo = d.tipo === 'bloqueio' ? 'bloqueio' : 'reserva';
    const { listingId, checkInDate, checkOutDate } = d;
    if (!listingId || !/^\d{4}-\d{2}-\d{2}$/.test(checkInDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDate || '') || checkOutDate <= checkInDate)
      return res.status(400).json({ erro: 'Informe imóvel e datas válidas (check-out depois do check-in).' });
    // Confere disponibilidade (todas as noites livres) antes de criar
    const cal = await stays(`/calendar/listing/${listingId}`, { from: checkInDate, to: checkOutDate });
    const noites = cal.filter(x => x.date >= checkInDate && x.date < checkOutDate);
    if (!(noites.length > 0 && noites.every(x => x.avail > 0)))
      return res.status(409).json({ erro: 'As datas escolhidas não estão totalmente livres na Stays. Atualize a disponibilidade e tente outro período.' });

    if (tipo === 'bloqueio') {
      const r = await staysPost('/booking/reservations', { type: 'blocked', listingId, checkInDate, checkOutDate });
      return res.json({ ok: true, tipo: 'bloqueio', reserva: { id: r.id, idInterno: r._id, checkIn: r.checkInDate, checkOut: r.checkOutDate } });
    }
    // Reserva: garante o cliente (existente ou cadastra novo)
    let clienteId = d.clienteId;
    if (!clienteId && d.novoCliente && String(d.novoCliente.nome || '').trim()) {
      const partes = String(d.novoCliente.nome).trim().split(/\s+/);
      const fName = partes.shift() || 'Hóspede'; const lName = partes.join(' ') || '-';
      const corpoCli = { fName, lName };
      const contato = String(d.novoCliente.contato || '').trim();
      if (contato.includes('@')) corpoCli.email = contato; else if (contato) corpoCli.phones = [{ iso: contato }];
      const novo = await staysPost('/booking/clients', corpoCli);
      clienteId = novo._id;
      _staysClientes = { quando: 0, lista: [] }; // invalida o cache de hóspedes
    }
    if (!clienteId) return res.status(400).json({ erro: 'Informe um hóspede (escolha um existente ou cadastre um novo).' });
    const guests = Math.max(1, parseInt(d.guests) || 1);
    const r = await staysPost('/booking/reservations', { type: 'booked', listingId, checkInDate, checkOutDate, _idclient: clienteId, guests });
    res.json({ ok: true, tipo: 'reserva', reserva: { id: r.id, idInterno: r._id, checkIn: r.checkInDate, checkOut: r.checkOutDate, valorTotal: (r.price && r.price._f_total) || null, moeda: (r.price && r.price.currency) || 'BRL', hospedes: r.guests } });
  } catch (e) {
    console.error('[stays criar]', e.message);
    res.status(502).json({ erro: 'Falha ao criar na Stays. ' + (e.message || '') });
  }
});

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
  const txt = `Ola, ${nome}! 👋\n\nSua Area do Hospede da Villela Stay ja esta pronta. Nela voce consulta a sua reserva e recebe as informacoes da casa (Wi-Fi, acesso, guia local).\n\n🔗 Acesse: ${AREA_HOSPEDE_URL}\n👤 Login: ${login}\n🔑 Senha temporaria: ${senha}\n\nNo primeiro acesso voce define uma nova senha. Qualquer duvida, e so chamar por aqui!`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#2b2d2f">
    <div style="background:#0c3644;color:#f2ecd8;padding:18px 22px;border-radius:10px 10px 0 0"><strong style="font-size:18px">Villela Stay</strong><br><span style="font-size:13px;color:#d9a441">Área do Hóspede</span></div>
    <div style="border:1px solid #e3ddd0;border-top:none;padding:22px;border-radius:0 0 10px 10px">
      <p>Olá, <strong>${escHtml(nome)}</strong>! 👋</p>
      <p>Sua <strong>Área do Hóspede</strong> já está pronta. Nela você consulta a sua reserva e recebe as informações da casa (Wi-Fi, acesso, guia local).</p>
      <p style="margin:18px 0"><a href="${AREA_HOSPEDE_URL}" style="background:#1c6e8c;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Entrar na Área do Hóspede</a></p>
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
    const ls = lerLancamentos();
    const preview = [];
    const push = (l) => { if (simular) preview.push({ hospedeNome: nomeP[l.hospedeId] || l.hospedeId, tipo: l.tipo, rotulo: ROTULO_LANC[l.tipo] || l.tipo, valor: l.valor, descricao: l.descricao, validade: l.validade }); else ls.push(l); };
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
    salvarLancamentos(ls);
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
  .cab{background:#0c3644;color:#f2ecd8;padding:22px 26px}
  .cab .marca{font-size:20px;font-weight:800}.cab .sub{color:#d9a441;font-size:13px}
  .corpo{padding:24px 26px}
  h1{font-size:18px;color:#0c3644;margin:0 0 14px}
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
  .btn{background:#1c6e8c;color:#fff;border:none;padding:11px 20px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px}
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
app.post('/hospede/api/login', (req, res) => {
  const ip = 'h:' + (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip');
  if (loginBloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
  const idRaw = String((req.body && (req.body.email != null ? req.body.email : req.body.identificador)) || '').trim();
  const senha = String((req.body && (req.body.senha != null ? req.body.senha : req.body.password)) || '');
  const ehEmail = idRaw.includes('@');
  const id = idRaw.toLowerCase();
  const fone = ehEmail ? '' : normFone(idRaw);
  const h = lerHospedes().find(x => x.ativo && (ehEmail ? x.email === id : (x.telefone && x.telefone === fone)));
  if (!h || !bcrypt.compareSync(senha, h.senhaHash)) { registraFalha(ip); return res.status(401).json({ erro: 'Login ou senha incorretos.' }); }
  limpaFalhas(ip);
  const hospedes = lerHospedes(); const u = hospedes.find(x => x.id === h.id);
  u.ultimoLogin = new Date().toISOString(); salvarHospedes(hospedes);
  const token = setCookieHospede(res, u);
  res.json({ ok: true, usuario: semSenhaHosp(u), token });
});

app.post('/hospede/api/logout', (req, res) => { res.clearCookie(HOSP_COOKIE, { path: '/hospede' }); res.json({ ok: true }); });

app.get('/hospede/api/me', requireHospede, (req, res) => res.json({ usuario: semSenhaHosp(req.hospede) }));

app.post('/hospede/api/senha', requireHospede, (req, res) => {
  const atual = String((req.body && req.body.atual) || '');
  const nova = String((req.body && req.body.nova) || '');
  if (nova.length < 8) return res.status(400).json({ erro: 'A nova senha deve ter ao menos 8 caracteres.' });
  if (!bcrypt.compareSync(atual, req.hospede.senhaHash)) return res.status(400).json({ erro: 'Senha atual incorreta.' });
  const hospedes = lerHospedes(); const u = hospedes.find(x => x.id === req.hospede.id);
  u.senhaHash = bcrypt.hashSync(nova, 10); u.precisaTrocarSenha = false; salvarHospedes(hospedes);
  res.json({ ok: true });
});

// ---- notificações push (Web Push) ----
app.get('/hospede/api/push/chave', requireHospede, (req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' }));
app.post('/hospede/api/push/subscribe', requireHospede, (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ erro: 'Assinatura inválida.' });
  const hospedes = lerHospedes(); const h = hospedes.find(x => x.id === req.hospede.id);
  if (!h) return res.status(404).json({ erro: 'Conta não encontrada.' });
  h.pushSubs = (h.pushSubs || []).filter(s => s.endpoint !== sub.endpoint);
  h.pushSubs.push(sub); salvarHospedes(hospedes);
  res.json({ ok: true });
});
app.post('/hospede/api/push/unsubscribe', requireHospede, (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  const hospedes = lerHospedes(); const h = hospedes.find(x => x.id === req.hospede.id);
  if (h && Array.isArray(h.pushSubs)) { h.pushSubs = h.pushSubs.filter(s => s.endpoint !== endpoint); salvarHospedes(hospedes); }
  res.json({ ok: true });
});

// Auto-cadastro de hóspede de OTA pelo localizador da reserva + sobrenome (+ check-in).
// Valida contra a Stays; mensagens genéricas para evitar enumeração.
app.post('/hospede/api/registrar', async (req, res) => {
  const localizador = String((req.body && req.body.localizador) || '').trim();
  const sobrenome = semAcento((req.body && req.body.sobrenome) || '').trim();
  const checkin = String((req.body && req.body.checkin) || '').trim();
  const senha = String((req.body && req.body.senha) || '');
  if (!localizador || !sobrenome || senha.length < 8) return res.status(400).json({ erro: 'Informe o localizador, o sobrenome e uma senha de ao menos 8 caracteres.' });
  const generico = 'Não encontramos uma reserva com esses dados. Confira o localizador, o sobrenome e a data de check-in.';
  try {
    const r = await stays(`/booking/reservations/${encodeURIComponent(localizador)}`).catch(() => null);
    if (!r || !r._idclient) return res.status(404).json({ erro: generico });
    if (checkin && r.checkInDate && r.checkInDate !== checkin) return res.status(404).json({ erro: generico });
    const cli = await stays(`/booking/clients/${r._idclient}`).catch(() => null);
    if (!cli) return res.status(404).json({ erro: generico });
    const ln = semAcento(cli.lName || cli.name || '');
    if (!ln || (!ln.includes(sobrenome) && !sobrenome.includes(ln))) return res.status(404).json({ erro: generico });
    const hospedes = lerHospedes();
    let h = hospedes.find(x => x.staysClientId === r._idclient);
    const email = ((cli.emails && cli.emails[0] && (cli.emails[0].address || cli.emails[0])) || cli.email || '').trim().toLowerCase();
    const fone = (cli.phones && cli.phones[0] && (cli.phones[0].iso || cli.phones[0].number)) || '';
    const nome = (cli.fName ? (cli.fName + ' ' + (cli.lName || '')).trim() : (cli.name || '')) || '';
    if (h) { h.senhaHash = bcrypt.hashSync(senha, 10); h.precisaTrocarSenha = false; h.ativo = true; h.ultimoLogin = new Date().toISOString(); }
    else { h = { id: novoId(), nome, email, telefone: normFone(fone), senhaHash: bcrypt.hashSync(senha, 10), staysClientId: r._idclient, precisaTrocarSenha: false, ativo: true, criadoEm: new Date().toISOString(), ultimoLogin: new Date().toISOString() }; hospedes.push(h); }
    const codInd = String((req.body && req.body.codigoIndicacao) || '').trim().toUpperCase();
    if (codInd && !h.indicadoPor) { const ind = hospedes.find(x => x.codigoIndicacao === codInd); if (ind && ind.id !== h.id) h.indicadoPor = codInd; }
    salvarHospedes(hospedes);
    const token = setCookieHospede(res, h);
    res.json({ ok: true, usuario: semSenhaHosp(h), token });
  } catch (e) { console.error('[hospede registrar]', e.message); res.status(502).json({ erro: 'Falha ao validar a reserva. Tente novamente em instantes.' }); }
});

// ---- Auto-cadastro / redefinição por E-MAIL (verificado por link) ----
// Acha o cliente da Stays pelo e-mail (lista cacheada; casa email OU contactEmails, sem acento/caixa).
async function acharClienteStaysPorEmail(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo || !alvo.includes('@')) return null;
  const lista = await getStaysClientes();
  return lista.find(c => {
    const e1 = String(c.email || '').trim().toLowerCase();
    const ces = Array.isArray(c.contactEmails) ? c.contactEmails.map(x => String(x || '').trim().toLowerCase()) : [];
    return (e1 && e1 === alvo) || ces.includes(alvo);
  }) || null;
}
// E-mail com o link de acesso (criar/redefinir senha). O token é um JWT curto (45 min).
async function enviarEmailAcesso(to, nome, link, jaTinha) {
  const primeiro = (nome || 'hóspede').split(' ')[0];
  const acao = jaTinha ? 'redefinir a sua senha' : 'criar a sua senha e ativar o seu acesso';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#2b2d2f">
    <div style="background:#0c3644;color:#f2ecd8;padding:18px 22px;border-radius:10px 10px 0 0"><strong style="font-size:18px">Villela Stay</strong><br><span style="font-size:13px;color:#d9a441">Área do Hóspede</span></div>
    <div style="border:1px solid #e3ddd0;border-top:none;padding:22px;border-radius:0 0 10px 10px">
      <p>Olá, <strong>${escHtml(primeiro)}</strong>! 👋</p>
      <p>Recebemos um pedido para ${acao} na <strong>Área do Hóspede</strong> da Villela Stay. É lá que você vê as suas reservas, recebe as informações da casa (Wi-Fi, acesso, guia) e ativa as notificações.</p>
      <p style="margin:18px 0"><a href="${link}" style="background:#1c6e8c;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Criar minha senha e entrar</a></p>
      <p style="font-size:13px;color:#6b7075">Este link vale por <strong>45 minutos</strong>. Se você não fez este pedido, é só ignorar este e-mail — nada muda na sua conta.</p>
    </div></div>`;
  return enviarEmail(to, 'Seu acesso à Área do Hóspede — Villela Stay', html);
}
// Throttle simples por IP (5 pedidos / 15 min) para o disparo de link.
const _linkHits = new Map();
function linkThrottle(ip) {
  const agora = Date.now(), janela = 15 * 60 * 1000, max = 5;
  const arr = (_linkHits.get(ip) || []).filter(t => agora - t < janela);
  if (arr.length >= max) return false;
  arr.push(agora); _linkHits.set(ip, arr); return true;
}
// Passo 1: hóspede informa o e-mail → se houver reserva/conta, enviamos um link. Resposta SEMPRE genérica (anti-enumeração).
app.post('/hospede/api/registrar-email', async (req, res) => {
  const ip = 'he:' + (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip');
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email.includes('@') || email.length > 200) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  const generico = { ok: true, mensagem: 'Se houver uma reserva com esse e-mail, enviamos um link para você criar a sua senha e entrar. Confira a sua caixa de entrada (e o spam).' };
  if (!linkThrottle(ip)) return res.json(generico); // não revela nada; só corta abuso
  try {
    const hospedes = lerHospedes();
    const existente = hospedes.find(h => h.email === email);
    let clientId = existente ? existente.staysClientId : null;
    let nome = existente ? existente.nome : '';
    if (!clientId) {
      const cli = await acharClienteStaysPorEmail(email);
      if (cli) { clientId = cli._id; nome = cli.name || [cli.fName, cli.lName].filter(Boolean).join(' '); }
    }
    if (!clientId) return res.json(generico); // sem match: mesma resposta
    const token = jwt.sign({ tipo: 'hospede-setup', email, cid: clientId }, JWT_SECRET, { expiresIn: '45m' });
    const link = AREA_HOSPEDE_URL + '?definir=' + encodeURIComponent(token);
    await enviarEmailAcesso(email, nome, link, !!existente).catch(e => console.error('[hospede link email]', e.message));
    console.log('[hospede registrar-email] link enviado p/', email, '(conta existente:', !!existente, ')');
    return res.json(generico);
  } catch (e) { console.error('[hospede registrar-email]', e.message); return res.json(generico); }
});
// Passo 2: hóspede define a senha usando o token do link → cria/ativa a conta e já entra.
app.post('/hospede/api/definir-senha', async (req, res) => {
  const token = String((req.body && req.body.token) || '');
  const senha = String((req.body && req.body.senha) || '');
  if (senha.length < 8) return res.status(400).json({ erro: 'A senha deve ter ao menos 8 caracteres.' });
  let dec;
  try { dec = jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite um novo pela tela de acesso.' }); }
  if (!dec || dec.tipo !== 'hospede-setup' || !dec.cid) return res.status(400).json({ erro: 'Link inválido. Solicite um novo pela tela de acesso.' });
  try {
    const cli = await stays(`/booking/clients/${dec.cid}`).catch(() => null);
    const hospedes = lerHospedes();
    let h = hospedes.find(x => x.staysClientId === dec.cid) || hospedes.find(x => x.email === dec.email);
    const fone = cli ? ((cli.phones && cli.phones[0] && (cli.phones[0].iso || cli.phones[0].number)) || '') : '';
    const nome = cli ? (cli.fName ? (cli.fName + ' ' + (cli.lName || '')).trim() : (cli.name || '')) : ((h && h.nome) || '');
    if (h) {
      h.senhaHash = bcrypt.hashSync(senha, 10); h.precisaTrocarSenha = false; h.ativo = true;
      if (!h.email) h.email = dec.email; if (!h.staysClientId) h.staysClientId = dec.cid;
      if (!h.nome && nome) h.nome = nome; if (!h.telefone && fone) h.telefone = normFone(fone);
      h.ultimoLogin = new Date().toISOString();
    } else {
      h = { id: novoId(), nome, email: dec.email, telefone: normFone(fone), senhaHash: bcrypt.hashSync(senha, 10), staysClientId: dec.cid, precisaTrocarSenha: false, ativo: true, criadoEm: new Date().toISOString(), ultimoLogin: new Date().toISOString() };
      hospedes.push(h);
    }
    salvarHospedes(hospedes);
    const token2 = setCookieHospede(res, h);
    res.json({ ok: true, usuario: semSenhaHosp(h), token: token2 });
  } catch (e) { console.error('[hospede definir-senha]', e.message); res.status(502).json({ erro: 'Falha ao concluir o cadastro. Tente novamente.' }); }
});

// Minhas reservas (só as do próprio staysClientId).
app.get('/hospede/api/minhas-reservas', requireHospede, async (req, res) => {
  try { res.json({ reservas: await reservasDoHospede(req.hospede, true) }); }
  catch (e) { console.error('[hospede reservas]', e.message); res.status(502).json({ erro: 'Falha ao consultar suas reservas.' }); }
});

// Carteira / passe de hospedagem: QR (avisar chegada no WhatsApp) + resumo da reserva.
app.get('/hospede/api/carteira/:reservaId', requireHospede, async (req, res) => {
  try {
    const reservas = await reservasDoHospede(req.hospede, false);
    const r = (reservas || []).find(x => x.id === req.params.reservaId && x.status !== 'canceled' && x.status !== 'blocked');
    if (!r) return res.status(404).json({ erro: 'Reserva não encontrada na sua conta.' });
    const nome1 = (req.hospede.nome || '').split(' ')[0] || 'hóspede';
    const waTxt = `Ola! Sou ${nome1}, cheguei para o check-in. Reserva ${r.id}${r.imovelTitulo ? ' - ' + r.imovelTitulo : ''}.`;
    const link = 'https://wa.me/556191935013?text=' + encodeURIComponent(waTxt);
    let qrSvg = '';
    try { const QRCode = require('qrcode'); qrSvg = await QRCode.toString(link, { type: 'svg', margin: 1, width: 240, color: { dark: '#0c3644', light: '#ffffff' } }); }
    catch (e) { console.error('[carteira qr]', e.message); }
    res.json({
      nome: req.hospede.nome || '',
      reserva: { id: r.id, imovel: r.imovel, imovelTitulo: r.imovelTitulo, checkin: r.checkin, checkout: r.checkout, hospedes: r.hospedes, status: r.status, statusRotulo: r.statusRotulo, plataforma: r.plataforma },
      qrSvg, waLink: link,
    });
  } catch (e) { console.error('[carteira]', e.message); res.status(502).json({ erro: 'Falha ao gerar a carteira.' }); }
});

// Meus pedidos (alteração/evento) do próprio hóspede.
app.get('/hospede/api/meus-pedidos', requireHospede, (req, res) => {
  const pedidos = lerPedidosHosp().filter(p => p.hospedeId === req.hospede.id)
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  res.json({ pedidos });
});

// Catálogo de serviços extras (Fase 3) — só os ativos.
app.get('/hospede/api/servicos', requireHospede, (req, res) => res.json({ servicos: lerServicos().filter(s => s.ativo !== false) }));
// Config do programa de fidelidade (textos exibidos ao hóspede).
app.get('/hospede/api/fidelidade-config', requireHospede, (req, res) => res.json(lerFidConfig()));
app.get('/hospede/api/conteudo/:secao', requireHospede, (req, res) => {
  const s = String(req.params.secao || '');
  if (!SECOES_CONTEUDO.includes(s)) return res.status(404).json({ erro: 'Seção não encontrada.' });
  const sec = lerConteudo()[s] || { intro: '', itens: [] };
  res.json({ intro: sec.intro || '', itens: (sec.itens || []).filter(i => i && i.ativo !== false) });
});

// ---- Ajuda IA: chat do hóspede com a base da Villela (FAQ + reserva), via API da Claude ----
let _faqTexto = null;
function faqTexto() {
  if (_faqTexto !== null) return _faqTexto;
  try { _faqTexto = fs.readFileSync(path.join(__dirname, 'hospede-faq.md'), 'utf8'); }
  catch (e) { console.warn('[chat] hospede-faq.md não encontrado'); _faqTexto = ''; }
  return _faqTexto;
}
const _chatHits = new Map();
function chatThrottle(id) {
  const agora = Date.now(), janela = 60000, max = 12;
  const arr = (_chatHits.get(id) || []).filter(t => agora - t < janela);
  if (arr.length >= max) return false;
  arr.push(agora); _chatHits.set(id, arr); return true;
}
app.post('/hospede/api/chat', requireHospede, async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ erro: 'O assistente está em ativação. Por enquanto, fale com a gente pelo WhatsApp que ajudamos na hora: wa.me/556191935013' });
  if (!chatThrottle(req.hospede.id)) return res.status(429).json({ erro: 'Você enviou muitas mensagens seguidas. Aguarde um minutinho e tente de novo.' });
  const msg = String((req.body && req.body.mensagem) || '').trim().slice(0, 1500);
  if (!msg) return res.status(400).json({ erro: 'Escreva a sua dúvida.' });
  const histIn = Array.isArray(req.body && req.body.historico) ? req.body.historico : [];
  const historico = histIn
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-8).map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  try {
    let contexto = '';
    // (a) Reservas + info NAO-sensivel da casa do proprio hospede (Wi-Fi/acesso ficam de fora)
    try {
      const reservas = await reservasDoHospede(req.hospede, false);
      const ativas = (reservas || []).filter(r => r.status !== 'canceled' && r.status !== 'blocked');
      if (ativas.length) {
        contexto += '\n\n=== RESERVAS DESTE HOSPEDE (' + (req.hospede.nome || 'hospede') + ') ===\n' + ativas.map(r =>
          `- ${r.imovelTitulo || r.imovel || 'Hospedagem'} (${r.imovel || ''}): ${r.checkin} a ${r.checkout}, ${r.hospedes || '?'} hospede(s), status ${r.statusRotulo || r.status}.`).join('\n');
        const info = lerPropInfo();
        for (const c of [...new Set(ativas.map(r => r.imovel).filter(Boolean))]) {
          const p = info[c]; if (!p) continue;
          const partes = [`check-in ${p.checkinHora || '15h'}, check-out ${p.checkoutHora || '11h'}`];
          if (p.contatos) partes.push('contatos: ' + p.contatos);
          if (p.manualUrl) partes.push('manual: ' + p.manualUrl);
          if (p.guiaUrl) partes.push('guia: ' + p.guiaUrl);
          if (p.observacoes) partes.push('observacoes: ' + p.observacoes);
          contexto += `\nCasa ${c}: ${partes.join(' | ')}.`;
        }
      }
    } catch (e) { /* sem contexto de reserva */ }
    // (b) Conta corrente / cash back / fidelidade
    try {
      const cc = resumoConta(req.hospede.id);
      const cbTot = (cc.lancamentos || []).filter(l => ['cashback', 'recorrencia', 'bonus'].includes(l.tipo) && Number(l.valor) > 0).reduce((s, l) => s + Number(l.valor), 0);
      contexto += `\n\n=== CONTA DO HOSPEDE ===\nSaldo: R$ ${Number(cc.saldo || 0).toFixed(2)} (positivo = credito a favor; negativo = a pagar). A pagar agora: R$ ${Number(cc.aPagar || 0).toFixed(2)}. Cash back/bonus ja creditado: R$ ${cbTot.toFixed(2)}. Codigo de indicacao do hospede: ${req.hospede.codigoIndicacao || '-'}.`;
    } catch (e) { /* sem conta */ }
    // (c) Recomendacoes curadas (vitrines Gastronomia/Turismo/Pacotes)
    try {
      const cont = lerConteudo();
      let bloco = '';
      for (const [k, rot] of [['gastronomia', 'GASTRONOMIA'], ['turismo', 'TURISMO EM BRASILIA'], ['pacotes', 'PACOTES E EXPERIENCIAS']]) {
        const s = cont[k]; if (!s || !Array.isArray(s.itens)) continue;
        const itens = s.itens.filter(i => i && i.ativo !== false);
        if (itens.length) bloco += `\n${rot}:` + itens.map(i => `\n- ${i.titulo}: ${i.desc}`).join('');
      }
      if (bloco) contexto += '\n\n=== RECOMENDACOES CURADAS DA VILLELA STAY (use quando o hospede pedir dicas de comer/passear/pacotes) ===' + bloco;
    } catch (e) { /* sem conteudo */ }

    const system = `Você é a Eva, a concierge virtual da Villela Stay, hospedagem premium por temporada no Lago Sul, Brasília-DF. Atenda como uma anfitriã premiada: acolhedora, cordial, direta e prestativa. Se apresente como Eva quando fizer sentido. Responda SEMPRE no mesmo idioma da pergunta do hóspede (português, inglês ou espanhol).

Use como FONTE DE VERDADE o FAQ oficial e os dados abaixo (reserva, conta e recomendações da casa). Regras:
- Preço, contrato, cancelamento, taxas e datas especiais: siga EXATAMENTE o FAQ. Nunca invente e NUNCA use a busca na web para políticas/preços/regras da Villela.
- Dicas de gastronomia, turismo e pacotes: priorize as RECOMENDAÇÕES CURADAS abaixo (é a seleção da casa). Pode complementar com a web para informação atual (horário de funcionamento, eventos, clima), deixando claro quando a info vier da internet.
- Busca na web: use SÓ para informação externa/atual que o FAQ e os dados não cobrem. Não pesquise assuntos internos da Villela na web.
- Wi-Fi e códigos de acesso (portão/fechadura) NÃO ficam aqui: oriente o hóspede a abrir o ícone "Wi-Fi" no app — liberados a partir de 2 dias antes do check-in.
- Se não tiver certeza, ou for exceção comercial, oriente a falar pelo WhatsApp (wa.me/556191935013). Não invente.
- Seja conciso e responda só o que foi perguntado.

=== FAQ OFICIAL DA VILLELA STAY ===
${faqTexto()}
=== FIM DO FAQ ===${contexto}`;

    // Chamada à API da Claude com BUSCA NA WEB (server tool) + tratamento de pause_turn (loop do server tool)
    const modelo = process.env.CHAT_MODEL || 'claude-haiku-4-5';
    const wsType = /sonnet-4-6|opus-4-(6|7|8)|fable-5/.test(modelo) ? 'web_search_20260209' : 'web_search_20250305';
    const tools = [{ type: wsType, name: 'web_search', max_uses: 3 }];
    const messages = [...historico, { role: 'user', content: msg }];
    let d = null;
    for (let i = 0; i < 4; i++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelo, max_tokens: 1000, system, tools, messages }),
      });
      if (!r.ok) { const t = await r.text().catch(() => ''); console.error('[chat] anthropic', r.status, t.slice(0, 300)); return res.status(502).json({ erro: 'Não consegui responder agora. Tente de novo em instantes ou fale pelo WhatsApp: wa.me/556191935013' }); }
      d = await r.json();
      if (d.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: d.content }); continue; }
      break;
    }
    const resposta = ((d && d.content) ? d.content : []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      || 'Desculpe, não consegui formular uma resposta. Pode reformular, ou falar com a gente pelo WhatsApp?';
    res.json({ resposta });
  } catch (e) { console.error('[chat]', e.message); res.status(502).json({ erro: 'Falha ao falar com o assistente. Tente novamente em instantes.' }); }
});

// Criar pedido: ALTERAÇÃO de reserva (só direta/WhatsApp), EVENTO ou SERVIÇO extra. Vai p/ aprovação do Augusto.
app.post('/hospede/api/pedido', requireHospede, async (req, res) => {
  const d = req.body || {};
  const tipo = ['evento', 'servico', 'manutencao'].includes(d.tipo) ? d.tipo : 'alteracao';
  const reservaId = String(d.reservaId || '').trim();
  if (!['servico', 'manutencao'].includes(tipo) && !reservaId) return res.status(400).json({ erro: 'Informe a reserva.' });
  try {
    let r = null;
    if (reservaId) {
      const reservas = await reservasDoHospede(req.hospede, tipo === 'alteracao');
      r = reservas.find(x => x.id === reservaId && x.status !== 'canceled' && x.status !== 'blocked');
      if (!r) return res.status(404).json({ erro: 'Reserva não encontrada na sua conta.' });
      if (tipo === 'alteracao' && !r.podeAlterar)
        return res.status(400).json({ erro: 'Alterações desta reserva devem ser solicitadas na plataforma onde você reservou (ex.: Airbnb/Booking).' });
    }

    const alteracao = tipo === 'alteracao' ? {
      novoCheckin: String(d.novoCheckin || ''), novoCheckout: String(d.novoCheckout || ''),
      novoImovel: String(d.novoImovel || ''), novoHospedes: d.novoHospedes != null && d.novoHospedes !== '' ? Number(d.novoHospedes) : null,
    } : null;
    const evento = tipo === 'evento' ? {
      data: String(d.dataEvento || ''), convidados: d.convidados != null && d.convidados !== '' ? Number(d.convidados) : null,
      descricao: String(d.descricaoEvento || '').slice(0, 1000),
    } : null;
    let servico = null;
    if (tipo === 'servico') {
      const cat = lerServicos().find(s => s.id === String(d.servicoId || '') && s.ativo !== false);
      if (!cat) return res.status(400).json({ erro: 'Serviço inválido.' });
      servico = { servicoId: cat.id, nome: cat.nome, data: String(d.data || ''), horario: String(d.horario || ''), pessoas: d.pessoas != null && d.pessoas !== '' ? Number(d.pessoas) : null, observacoes: String(d.observacoes || '').slice(0, 1000) };
    }
    const manutencao = tipo === 'manutencao' ? {
      local: String(d.local || '').slice(0, 200), urgencia: String(d.urgencia || '').slice(0, 40),
      descricao: String(d.descricaoManutencao || d.descricao || '').slice(0, 1000),
    } : null;
    if (tipo === 'alteracao' && alteracao && !alteracao.novoCheckin && !alteracao.novoCheckout && !alteracao.novoImovel && alteracao.novoHospedes == null && !String(d.mensagem || '').trim())
      return res.status(400).json({ erro: 'Diga o que deseja alterar (datas, imóvel, nº de hóspedes ou uma mensagem).' });
    if (tipo === 'evento' && !evento.data && evento.convidados == null && !evento.descricao)
      return res.status(400).json({ erro: 'Informe a data do evento, o número de convidados ou uma descrição.' });
    if (tipo === 'manutencao' && !manutencao.descricao && !String(d.mensagem || '').trim())
      return res.status(400).json({ erro: 'Descreva o problema de manutenção.' });

    const pedidos = lerPedidosHosp();
    const pedido = {
      id: novoId(), hospedeId: req.hospede.id, hospedeNome: req.hospede.nome || '', staysClientId: req.hospede.staysClientId || '',
      tipo, reservaId, imovel: r ? r.imovel : '', imovelTitulo: r ? r.imovelTitulo : '', checkinAtual: r ? r.checkin : '', checkoutAtual: r ? r.checkout : '',
      alteracao, evento, servico, manutencao, checkin: null, mensagem: String(d.mensagem || '').slice(0, 1000),
      status: 'novo', orcamento: null, respostaAdmin: '',
      criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
    };
    pedidos.unshift(pedido);
    salvarPedidosHosp(pedidos);
    const rotuloTipo = tipo === 'evento' ? 'EVENTO' : tipo === 'servico' ? 'SERVICO (' + servico.nome + ')' : tipo === 'manutencao' ? 'MANUTENCAO' : 'alteracao de reserva';
    alertaAugusto(`Novo pedido de ${rotuloTipo} de ${pedido.hospedeNome || 'hospede'}${reservaId ? ' - reserva ' + reservaId : ''}${r && r.imovel ? ' (' + r.imovel + ')' : ''}. Veja no Portal Staff > Pedidos de hospedes.`).catch(() => { });
    res.json({ ok: true, pedido });
  } catch (e) { console.error('[hospede pedido]', e.message); res.status(502).json({ erro: 'Falha ao registrar o pedido. Tente novamente.' }); }
});

// Check-in on-line do hóspede LOGADO (mesmo formulário completo do site) — grava em precheckins.jsonl
// (mesmo destino/painel do formulário público) com dados JÁ CONFIRMADOS da conta/reserva (nome, e-mail,
// telefone, imóvel, datas). Se houver item com custo (convidados extra, pet, evento na casa), cria também
// um pedido (evento/checkin) para entrar no fluxo de orçamento de "Pedidos de hóspedes".
app.post('/hospede/api/precheckin', requireHospede, async (req, res) => {
  const d = req.body || {};
  const reservaId = String(d.reservaId || '').trim();
  if (!reservaId) return res.status(400).json({ erro: 'Informe a reserva.' });
  try {
    const reservas = await reservasDoHospede(req.hospede, false);
    const r = reservas.find(x => x.id === reservaId && x.status !== 'canceled' && x.status !== 'blocked');
    if (!r) return res.status(404).json({ erro: 'Reserva não encontrada na sua conta.' });
    const horario = String(d.horario || '').slice(0, 20);
    appendJsonl('precheckins.jsonl', {
      nome: req.hospede.nome || '', contato: req.hospede.telefone || '', email: req.hospede.email || '',
      reserva: r.id, hospedagem: r.imovelTitulo || r.imovel || '', chegada: r.checkin || '', saida: r.checkout || '',
      horario,
      adultos: d.adultos != null ? String(d.adultos) : '', criancas: d.criancas != null ? String(d.criancas) : '',
      convidados: d.convidados != null ? String(d.convidados) : '', pets: String(d.pets || '').slice(0, 200),
      motivo: String(d.motivo || '').slice(0, 60), evento: String(d.evento || '').slice(0, 300),
      origem: String(d.origem || '').slice(0, 120), destino: String(d.destino || '').slice(0, 120),
      estacionamento: String(d.estacionamento || '').slice(0, 10), veiculo: String(d.veiculo || '').slice(0, 120),
      observacoes: String(d.observacoes || '').slice(0, 1000), origemCanal: 'app',
    });
    const itens = itensBillaveis(d);
    if (itens.resumo) {
      const pedidos = lerPedidosHosp();
      const pedido = {
        id: novoId(), hospedeId: req.hospede.id, hospedeNome: req.hospede.nome || '', staysClientId: req.hospede.staysClientId || '',
        tipo: itens.evento ? 'evento' : 'checkin', reservaId: r.id, imovel: r.imovel, imovelTitulo: r.imovelTitulo,
        checkinAtual: r.checkin, checkoutAtual: r.checkout, alteracao: null,
        evento: itens.evento ? { data: r.checkin || '', convidados: itens.convidados || null, descricao: itens.resumo } : null,
        servico: null, manutencao: null,
        checkin: !itens.evento ? { horarioChegada: horario, pessoas: itens.convidados || null, observacoes: itens.resumo } : null,
        mensagem: '', status: 'novo', orcamento: null, respostaAdmin: '',
        criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
      };
      pedidos.unshift(pedido); salvarPedidosHosp(pedidos);
      alertaAugusto(`Check-in online de ${pedido.hospedeNome} tem itens com custo (${itens.resumo}) - reserva ${r.id}${r.imovel ? ' (' + r.imovel + ')' : ''}. Veja em Pedidos de hospedes.`).catch(() => { });
    }
    res.json({ ok: true, temItemCobravel: !!itens.resumo });
  } catch (e) { console.error('[hospede precheckin]', e.message); res.status(502).json({ erro: 'Falha ao registrar o check-in. Tente novamente.' }); }
});

// Recibo/comprovante da reserva (HTML imprimível → salvar em PDF) — só do próprio hóspede.
app.get('/hospede/api/recibo/:reservaId', requireHospede, async (req, res) => {
  try {
    const reservas = await reservasDoHospede(req.hospede);
    const r = reservas.find(x => x.id === req.params.reservaId);
    if (!r) return res.status(404).send('Reserva não encontrada.');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(reciboHtml(req.hospede, r, resumoConta(req.hospede.id)));
  } catch (e) { console.error('[hospede recibo]', e.message); res.status(502).send('Falha ao gerar o recibo.'); }
});

// Avaliação pós-estadia (só reservas já encerradas; 1 por reserva).
app.get('/hospede/api/minhas-avaliacoes', requireHospede, (req, res) => {
  res.json({ avaliacoes: lerAvaliacoes().filter(a => a.hospedeId === req.hospede.id) });
});
app.post('/hospede/api/avaliacao', requireHospede, async (req, res) => {
  const d = req.body || {};
  const reservaId = String(d.reservaId || '').trim();
  const nota = Math.max(0, Math.min(5, parseInt(d.nota) || 0));
  if (!reservaId || !nota) return res.status(400).json({ erro: 'Informe a reserva e uma nota de 1 a 5.' });
  try {
    const reservas = await reservasDoHospede(req.hospede);
    const r = reservas.find(x => x.id === reservaId && x.status !== 'canceled' && x.status !== 'blocked');
    if (!r) return res.status(404).json({ erro: 'Reserva não encontrada na sua conta.' });
    if (!(r.checkout && r.checkout <= hojeISO())) return res.status(400).json({ erro: 'A avaliação fica disponível após o check-out.' });
    const avaliacoes = lerAvaliacoes();
    if (avaliacoes.some(a => a.hospedeId === req.hospede.id && a.reservaId === reservaId)) return res.status(409).json({ erro: 'Você já avaliou esta estadia.' });
    const av = { id: novoId(), hospedeId: req.hospede.id, hospedeNome: req.hospede.nome || '', staysClientId: req.hospede.staysClientId || '', reservaId, imovel: r.imovel, imovelTitulo: r.imovelTitulo, nota, comentario: String(d.comentario || '').slice(0, 1500), criadoEm: new Date().toISOString() };
    avaliacoes.unshift(av);
    salvarAvaliacoes(avaliacoes);
    alertaAugusto(`Nova AVALIACAO de ${av.hospedeNome || 'hospede'}: ${nota}/5${r.imovel ? ' (' + r.imovel + ')' : ''}${av.comentario ? ' - "' + av.comentario.slice(0, 120) + '"' : ''}.`).catch(() => { });
    res.json({ ok: true, avaliacao: av });
  } catch (e) { console.error('[hospede avaliacao]', e.message); res.status(502).json({ erro: 'Falha ao registrar a avaliação.' }); }
});

// Meu código de indicação (para compartilhar) + se já usei um.
app.get('/hospede/api/indicacao', requireHospede, (req, res) => {
  res.json({ codigo: codigoDoHospede(req.hospede.id), indicadoPor: req.hospede.indicadoPor || '', recompensada: !!req.hospede.indicacaoRecompensada });
});
// Usar o código de quem me indicou (vincula automaticamente; o bônus sai na minha 1ª estadia).
app.post('/hospede/api/indicacao/usar', requireHospede, (req, res) => {
  const codigo = String((req.body && req.body.codigo) || '').trim().toUpperCase();
  if (!codigo) return res.status(400).json({ erro: 'Informe o código de indicação.' });
  const hospedes = lerHospedes();
  const eu = hospedes.find(x => x.id === req.hospede.id);
  if (!eu) return res.status(404).json({ erro: 'Conta não encontrada.' });
  if (eu.indicadoPor) return res.status(409).json({ erro: 'Você já registrou um código de indicação.' });
  if (eu.codigoIndicacao && eu.codigoIndicacao === codigo) return res.status(400).json({ erro: 'Você não pode usar o seu próprio código.' });
  const indicador = hospedes.find(x => x.codigoIndicacao === codigo);
  if (!indicador || indicador.id === eu.id) return res.status(404).json({ erro: 'Código de indicação não encontrado.' });
  eu.indicadoPor = codigo;
  salvarHospedes(hospedes);
  res.json({ ok: true });
});

// Indicação de amigo (programa de indicação) → registra e avisa o Augusto p/ combinar o crédito.
app.post('/hospede/api/indicacao', requireHospede, (req, res) => {
  const d = req.body || {};
  const nome = String(d.nome || '').trim();
  const contato = String(d.contato || '').trim();
  if (!nome || !contato) return res.status(400).json({ erro: 'Informe o nome e o contato (WhatsApp/e-mail) de quem você quer indicar.' });
  const indicacoes = lerIndicacoes();
  const ind = { id: novoId(), hospedeId: req.hospede.id, hospedeNome: req.hospede.nome || '', indicadoNome: nome, indicadoContato: contato.slice(0, 200), mensagem: String(d.mensagem || '').slice(0, 1000), criadoEm: new Date().toISOString() };
  indicacoes.unshift(ind);
  salvarIndicacoes(indicacoes);
  alertaAugusto(`Nova INDICACAO de ${ind.hospedeNome || 'hospede'}: ${nome} (${ind.indicadoContato}). Combinar o credito de indicacao.`).catch(() => { });
  res.json({ ok: true });
});

// Conta corrente do hóspede: extrato + saldo (cash back, bônus, cobranças, pagamentos).
app.get('/hospede/api/conta', requireHospede, (req, res) => res.json(resumoConta(req.hospede.id)));
// Iniciar pagamento do valor pendente (líquido, já abatidos os créditos) via Mercado Pago.
app.post('/hospede/api/conta/pagar', requireHospede, async (req, res) => {
  const r = resumoConta(req.hospede.id);
  if (r.aPagar <= 0) return res.status(400).json({ erro: 'Você não tem valor pendente para pagar.' });
  if (!process.env.MP_ACCESS_TOKEN) return res.status(503).json({ erro: 'O pagamento online ainda está sendo configurado. Combine o pagamento pelo WhatsApp por enquanto.' });
  try {
    const base = AREA_HOSPEDE_URL.replace(/\/hospede\/?$/, '');
    const pref = await mpFetch('/checkout/preferences', {
      method: 'POST', body: JSON.stringify({
        items: [{ title: 'Conta Villela Stay', quantity: 1, currency_id: 'BRL', unit_price: Number(r.aPagar.toFixed(2)) }],
        external_reference: 'conta:' + req.hospede.id,
        payer: { name: req.hospede.nome || undefined, email: req.hospede.email || undefined },
        back_urls: { success: AREA_HOSPEDE_URL, pending: AREA_HOSPEDE_URL, failure: AREA_HOSPEDE_URL },
        notification_url: base + '/webhooks/mercadopago',
        statement_descriptor: 'VILLELASTAY',
      }),
    });
    res.json({ ok: true, url: pref.init_point || pref.sandbox_init_point, valor: r.aPagar });
  } catch (e) { console.error('[conta pagar]', e.message); res.status(502).json({ erro: 'Falha ao iniciar o pagamento. Tente novamente.' }); }
});

// Info reservada da propriedade — só se o hóspede tem reserva nela. WiFi/acesso só na janela da estadia.
app.get('/hospede/api/propriedade/:codigo', requireHospede, async (req, res) => {
  const codigo = String(req.params.codigo || '').toUpperCase();
  try {
    const reservas = await reservasDoHospede(req.hospede);
    const ativas = reservas.filter(r => r.imovel === codigo && r.status !== 'canceled' && r.status !== 'blocked');
    if (!ativas.length) return res.status(403).json({ erro: 'Você não tem reserva nesta propriedade.' });
    const info = infoPropriedade(codigo);
    // Hóspede com reserva nesta casa vê o Wi-Fi/acesso (a pedido do Augusto, removida a trava de "2 dias antes").
    const naJanela = ativas.length > 0;
    const out = {
      codigo, titulo: ativas[0].imovelTitulo || codigo,
      manualUrl: info.manualUrl || '', guiaUrl: info.guiaUrl || '',
      manuais: Array.isArray(info.manuais) ? info.manuais : [],
      guias: Array.isArray(info.guias) ? info.guias : [],
      contatos: info.contatos || '',
      checkinHora: info.checkinHora || '', checkoutHora: info.checkoutHora || '', observacoes: info.observacoes || '',
      naJanela,
    };
    if (naJanela) { out.wifi = info.wifi || null; out.wifis = Array.isArray(info.wifis) ? info.wifis : []; out.acesso = info.acesso || null; }
    res.json(out);
  } catch (e) { console.error('[hospede prop]', e.message); res.status(502).json({ erro: 'Falha ao carregar a propriedade.' }); }
});

// =========================== admin (staff) — gestão da Área do Hóspede ===========================
app.get('/staff/api/hospede/contas', requireAuth, requireAdmin, (req, res) => {
  res.json({ contas: lerHospedes().map(semSenhaHosp) });
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
app.get('/staff/api/hospede/fidelidade', requireAuth, (req, res) => {
  res.json({
    avaliacoes: lerAvaliacoes().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))),
    indicacoes: lerIndicacoes().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))),
  });
});

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
app.get('/staff/api/hospede/fidelidade-config', requirePublishOrAdmin, (req, res) => res.json(lerFidConfig()));
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
app.post('/staff/api/hospede/fidelidade/rodar', requirePublishOrAdmin, async (req, res) => {
  const d = req.body || {};
  res.json(await motorFidelidade({ force: !!d.force, simular: !!d.simular }));
});

// Webhook do Mercado Pago — pagamento aprovado vira lançamento "pagamento" na conta corrente (idempotente).
app.post('/webhooks/mercadopago', async (req, res) => {
  res.sendStatus(200); // responde rápido; processa em seguida
  try {
    const q = req.query || {}, b = req.body || {};
    const tipo = b.type || q.type || q.topic || '';
    const payId = (b.data && b.data.id) || q['data.id'] || (tipo === 'payment' ? q.id : null);
    if (!payId || (tipo && !/payment/i.test(String(tipo)))) return;
    const pay = await mpFetch('/v1/payments/' + payId).catch(() => null);
    if (!pay || pay.status !== 'approved') return;
    const ref = String(pay.external_reference || '');
    if (!ref.startsWith('conta:')) return;
    const hospedeId = ref.slice('conta:'.length);
    const ls = lerLancamentos();
    if (ls.some(l => l.pagamentoRef === String(payId))) return; // idempotente
    const h = lerHospedes().find(x => x.id === hospedeId);
    if (!h) return;
    ls.push({ id: novoId(), hospedeId, staysClientId: h.staysClientId || '', tipo: 'pagamento', descricao: 'Pagamento online (Mercado Pago)', valor: Math.abs(Number(pay.transaction_amount) || 0), reservaId: '', validade: '', criadoEm: new Date().toISOString(), criadoPor: 'mercadopago', pagamentoRef: String(payId) });
    salvarLancamentos(ls);
    console.log('[mp webhook] pagamento baixado p/ hospede', hospedeId, 'R$', pay.transaction_amount);
    alertaAugusto(`Pagamento recebido (Mercado Pago) de ${h.nome || 'hospede'}: R$ ${Number(pay.transaction_amount || 0).toFixed(2)}.`).catch(() => { });
  } catch (e) { console.error('[mp webhook]', e.message); }
});

// Raiz → Área do Hóspede (o domínio minha.villelastay.com.br é dedicado ao app do hóspede).
app.get('/', (req, res) => res.redirect(302, '/hospede'));
// Estáticos do portal (login + app). Registrado DEPOIS das rotas /staff/api/*.
app.use('/staff', express.static(path.join(__dirname, 'staff')));
// Estáticos da Área do Hóspede. Registrado DEPOIS das rotas /hospede/api/*.
app.use('/hospede', express.static(path.join(__dirname, 'hospede')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Villela Stay rodando na porta ${PORT}`));
