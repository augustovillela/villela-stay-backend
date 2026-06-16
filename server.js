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

// Pré-check-in do hóspede (formulário do site)
app.post('/api/precheckin', (req, res) => {
  const d = req.body || {};
  if (!d.nome || !d.contato) return res.status(400).json({ erro: 'nome e contato são obrigatórios' });
  appendJsonl('precheckins.jsonl', {
    nome: d.nome, contato: d.contato, email: d.email || '', reserva: d.reserva || '',
    hospedagem: d.hospedagem || '', chegada: d.chegada || '', horario: d.horario || '',
    adultos: d.adultos || '', criancas: d.criancas || '', convidados: d.convidados || '', pets: d.pets || '', observacoes: d.observacoes || ''
  });
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

// Nunca cachear respostas da API do portal — o navegador pode guardar GETs sem
// Cache-Control e mostrar conteúdo antigo (ex.: texto desatualizado de um relatório).
app.use('/staff/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// =========================== sessão ===========================
app.post('/staff/api/login', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip';
  if (loginBloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const senha = String((req.body && req.body.senha) || '');
  const user = lerUsuarios().find(u => u.email === email && u.ativo);
  if (!user || !bcrypt.compareSync(senha, user.senhaHash)) {
    registraFalha(ip);
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }
  limpaFalhas(ip);
  const usuarios = lerUsuarios();
  const u = usuarios.find(x => x.id === user.id);
  u.ultimoLogin = new Date().toISOString();
  salvarUsuarios(usuarios);
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '8h' });
  res.cookie('staff_token', token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', maxAge: 8 * 3600 * 1000, path: '/staff' });
  res.json({ ok: true, usuario: semSenha(u), areas: areasDoUsuario(u), catalogoAreas: AREAS });
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
// Publicar (sessão com a área, ou script local com x-publish-key)
app.post('/staff/api/relatorios', requirePublishOrSession, (req, res) => {
  const d = req.body || {};
  const area = String(d.area || '').trim();
  if (!AREA_IDS.has(area)) return res.status(400).json({ erro: 'Área inválida.' });
  if (!req.viaChave && !podeArea(req.user, area)) return res.status(403).json({ erro: 'Sem acesso a essa área.' });
  const titulo = String(d.titulo || '').trim();
  if (!titulo) return res.status(400).json({ erro: 'Título é obrigatório.' });
  const tipo = ['relatorio', 'produto', 'servico'].includes(d.tipo) ? d.tipo : 'relatorio';

  const rel = {
    id: novoId(), area, tipo, titulo,
    resumo: String(d.resumo || '').slice(0, 1000),
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
    const q = String(busca).toLowerCase();
    lista = lista.filter(c => [c.nome, c.telefone, c.email].some(v => String(v || '').toLowerCase().includes(q)));
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

// Estáticos do portal (login + app). Registrado DEPOIS das rotas /staff/api/*.
app.use('/staff', express.static(path.join(__dirname, 'staff')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Villela Stay rodando na porta ${PORT}`));
