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

// Pré-check-in do hóspede (formulário do site)
app.post('/api/precheckin', (req, res) => {
  const d = req.body || {};
  if (!d.nome || !d.contato) return res.status(400).json({ erro: 'nome e contato são obrigatórios' });
  appendJsonl('precheckins.jsonl', {
    nome: d.nome, contato: d.contato, email: d.email || '', reserva: d.reserva || '',
    hospedagem: d.hospedagem || '', chegada: d.chegada || '', saida: d.saida || '', horario: d.horario || '',
    adultos: d.adultos || '', criancas: d.criancas || '', convidados: d.convidados || '', pets: d.pets || '',
    motivo: d.motivo || '', evento: d.evento || '', origem: d.origem || '', destino: d.destino || '',
    estacionamento: d.estacionamento || '', veiculo: d.veiculo || '',
    observacoes: d.observacoes || ''
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
function semSenhaHosp(h) { const { senhaHash, ...resto } = h; return resto; }
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
    reservationUrl: r.reservationUrl || '', plataforma: '', podeAlterar: false,
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

// ---- Conta corrente do hóspede (extrato de lançamentos + saldo) + pagamento (Mercado Pago) ----
const lerLancamentos = () => lerJSON('lancamentos.json', []);
const salvarLancamentos = (l) => salvarJSON('lancamentos.json', l);
const TIPOS_LANC = ['cashback', 'recorrencia', 'bonus', 'cobranca', 'pagamento', 'ajuste'];
const ROTULO_LANC = { cashback: 'Cash back', recorrencia: 'Recorrência', bonus: 'Bônus de indicação', cobranca: 'Cobrança', pagamento: 'Pagamento', ajuste: 'Ajuste', expiracao: 'Expiração de crédito' };
// Extrato com saldo corrente. valor é SINALIZADO (créditos +, débitos −). saldo<0 = a pagar; saldo>0 = crédito a favor.
function resumoConta(hospedeId) {
  const ls = lerLancamentos().filter(l => l.hospedeId === hospedeId).sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
  let creditos = 0, debitos = 0, saldo = 0;
  const lancamentos = ls.map(l => {
    const v = Number(l.valor) || 0; saldo += v;
    if (v >= 0) creditos += v; else debitos += -v;
    return { id: l.id, tipo: l.tipo, rotulo: ROTULO_LANC[l.tipo] || l.tipo, descricao: l.descricao || '', valor: v, reservaId: l.reservaId || '', validade: l.validade || '', criadoEm: l.criadoEm, saldoApos: saldo };
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
function reciboHtml(h, r) {
  const noites = (r.checkin && r.checkout) ? Math.max(0, Math.round((Date.parse(r.checkout) - Date.parse(r.checkin)) / 86400000)) : '';
  const valor = r.valor != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: r.moeda || 'BRL' }).format(r.valor) : '—';
  const linha = (k, v) => `<tr><td class="k">${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`;
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
  .rod{font-size:12px;color:#6b7075;margin-top:16px}
  .acao{margin:18px 26px;text-align:center}
  .btn{background:#1c6e8c;color:#fff;border:none;padding:11px 20px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px}
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
    <p class="rod">Documento gerado pela Área do Hóspede da Villela Stay em ${fmtDataBR(hojeISO())}. Comprovante de reserva — não é documento fiscal.</p>
  </div>
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

// ---- middleware de autenticação do hóspede (isolado do staff) ----
function requireHospede(req, res, next) {
  try {
    const tok = req.cookies && req.cookies[HOSP_COOKIE];
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
}

// Nunca cachear respostas da API do hóspede.
app.use('/hospede/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

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
  setCookieHospede(res, u);
  res.json({ ok: true, usuario: semSenhaHosp(u) });
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
    setCookieHospede(res, h);
    res.json({ ok: true, usuario: semSenhaHosp(h) });
  } catch (e) { console.error('[hospede registrar]', e.message); res.status(502).json({ erro: 'Falha ao validar a reserva. Tente novamente em instantes.' }); }
});

// Minhas reservas (só as do próprio staysClientId).
app.get('/hospede/api/minhas-reservas', requireHospede, async (req, res) => {
  try { res.json({ reservas: await reservasDoHospede(req.hospede, true) }); }
  catch (e) { console.error('[hospede reservas]', e.message); res.status(502).json({ erro: 'Falha ao consultar suas reservas.' }); }
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

// Criar pedido: ALTERAÇÃO de reserva (só direta/WhatsApp), EVENTO ou SERVIÇO extra. Vai p/ aprovação do Augusto.
app.post('/hospede/api/pedido', requireHospede, async (req, res) => {
  const d = req.body || {};
  const tipo = ['evento', 'servico'].includes(d.tipo) ? d.tipo : 'alteracao';
  const reservaId = String(d.reservaId || '').trim();
  if (tipo !== 'servico' && !reservaId) return res.status(400).json({ erro: 'Informe a reserva.' });
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
    if (tipo === 'alteracao' && alteracao && !alteracao.novoCheckin && !alteracao.novoCheckout && !alteracao.novoImovel && alteracao.novoHospedes == null && !String(d.mensagem || '').trim())
      return res.status(400).json({ erro: 'Diga o que deseja alterar (datas, imóvel, nº de hóspedes ou uma mensagem).' });
    if (tipo === 'evento' && !evento.data && evento.convidados == null && !evento.descricao)
      return res.status(400).json({ erro: 'Informe a data do evento, o número de convidados ou uma descrição.' });

    const pedidos = lerPedidosHosp();
    const pedido = {
      id: novoId(), hospedeId: req.hospede.id, hospedeNome: req.hospede.nome || '', staysClientId: req.hospede.staysClientId || '',
      tipo, reservaId, imovel: r ? r.imovel : '', imovelTitulo: r ? r.imovelTitulo : '', checkinAtual: r ? r.checkin : '', checkoutAtual: r ? r.checkout : '',
      alteracao, evento, servico, mensagem: String(d.mensagem || '').slice(0, 1000),
      status: 'novo', orcamento: null, respostaAdmin: '',
      criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
    };
    pedidos.unshift(pedido);
    salvarPedidosHosp(pedidos);
    const rotuloTipo = tipo === 'evento' ? 'EVENTO' : tipo === 'servico' ? 'SERVICO (' + servico.nome + ')' : 'alteracao de reserva';
    alertaAugusto(`Novo pedido de ${rotuloTipo} de ${pedido.hospedeNome || 'hospede'}${reservaId ? ' - reserva ' + reservaId : ''}${r && r.imovel ? ' (' + r.imovel + ')' : ''}. Veja no Portal Staff > Pedidos de hospedes.`).catch(() => { });
    res.json({ ok: true, pedido });
  } catch (e) { console.error('[hospede pedido]', e.message); res.status(502).json({ erro: 'Falha ao registrar o pedido. Tente novamente.' }); }
});

// Recibo/comprovante da reserva (HTML imprimível → salvar em PDF) — só do próprio hóspede.
app.get('/hospede/api/recibo/:reservaId', requireHospede, async (req, res) => {
  try {
    const reservas = await reservasDoHospede(req.hospede);
    const r = reservas.find(x => x.id === req.params.reservaId);
    if (!r) return res.status(404).send('Reserva não encontrada.');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(reciboHtml(req.hospede, r));
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
    const hoje = hojeISO();
    const naJanela = ativas.some(r => r.checkin && r.checkout && addDias(r.checkin, -2) <= hoje && hoje <= r.checkout);
    const out = {
      codigo, titulo: ativas[0].imovelTitulo || codigo,
      manualUrl: info.manualUrl || '', guiaUrl: info.guiaUrl || '', contatos: info.contatos || '',
      checkinHora: info.checkinHora || '', checkoutHora: info.checkoutHora || '', observacoes: info.observacoes || '',
      naJanela,
    };
    if (naJanela) { out.wifi = info.wifi || null; out.acesso = info.acesso || null; }
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
  all[codigo] = {
    wifi: { rede: String((d.wifi && d.wifi.rede) || ''), senha: String((d.wifi && d.wifi.senha) || '') },
    acesso: { portao: String((d.acesso && d.acesso.portao) || ''), fechadura: String((d.acesso && d.acesso.fechadura) || ''), instrucoes: String((d.acesso && d.acesso.instrucoes) || '') },
    manualUrl: String(d.manualUrl || ''), guiaUrl: String(d.guiaUrl || ''), contatos: String(d.contatos || ''),
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
  res.json({ ok: true, pedido: p });
});

// Fidelidade: avaliações pós-estadia e indicações (leitura — equipe).
app.get('/staff/api/hospede/fidelidade', requireAuth, (req, res) => {
  res.json({
    avaliacoes: lerAvaliacoes().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))),
    indicacoes: lerIndicacoes().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))),
  });
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
  let valor = Number(d.valor);
  if (!isFinite(valor) || valor === 0) return res.status(400).json({ erro: 'Informe um valor diferente de zero.' });
  if (d.tipo === 'cobranca') valor = -Math.abs(valor);
  else if (d.tipo !== 'ajuste') valor = Math.abs(valor); // cashback/bonus/pagamento = crédito (+)
  const lanc = {
    id: novoId(), hospedeId: h.id, staysClientId: h.staysClientId || '', tipo: d.tipo,
    descricao: String(d.descricao || '').slice(0, 300), valor,
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

// Estáticos do portal (login + app). Registrado DEPOIS das rotas /staff/api/*.
app.use('/staff', express.static(path.join(__dirname, 'staff')));
// Estáticos da Área do Hóspede. Registrado DEPOIS das rotas /hospede/api/*.
app.use('/hospede', express.static(path.join(__dirname, 'hospede')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Villela Stay rodando na porta ${PORT}`));
