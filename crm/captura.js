// =====================================================================
// Villela CRM — "AUMENTAR MEUS LEADS" para ASSINANTES.
//
// O assinante escolhe a ÁREA (WhatsApp, e-mail, Instagram, Facebook, TikTok, LinkedIn) e a ORIGEM:
//   FORA   redes públicas (Google Maps + site público da empresa — a busca ativa de buscas.js);
//   DENTRO as conversas dele, por UPLOAD do export (o arquivo é lido em memória, classificado por
//          regras e DESCARTADO: só ficam canal, identificador, assunto, temperatura e contagens).
//
// Este módulo concentra o que é honesto dizer por área (`opcoes`), a COBRANÇA da busca externa
// (créditos, token Apify do assinante ou conta interna) e os leitores dos exports.
// Regras que valem aqui: nada vira contato/campanha sem aprovação humana; lead capturado nunca
// nasce com consentimento; envio em redes sociais é ASSISTIDO; a plataforma não absorve custo.
// =====================================================================
'use strict';
const { db, nowISO } = require('./db');
const Cofre = require('./cofre');
const Carteira = require('./carteira');
const fontes = require('./busca-fontes');
const { classificarConversa, montarAssuntos } = require('./conversas-classificador');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const erro = (msg, status = 400, extra) => { const e = new Error(msg); e.status = status; if (extra) Object.assign(e, extra); return e; };

const AREAS = ['whatsapp', 'email', 'instagram', 'facebook', 'tiktok', 'linkedin'];

// O que dá para fazer de verdade em cada área. É texto de TELA: o que é automático, o que é assistido e o que é inviável.
const OPCOES = {
  email: {
    rotulo: 'E-mail',
    fora: { automatico: 'Busca empresas no Google Maps e lê o site público delas; só viram lead as que publicam um e-mail.', assistido: '', inviavel: 'Comprar ou raspar listas de e-mail de pessoas.' },
    dentro: { automatico: 'Duas vias: (1) o CRM lê a sua caixa por IMAP, SOMENTE LEITURA, com uma senha de aplicativo (Gmail, Outlook, Yahoo, iCloud, UOL); (2) você envia o arquivo .mbox do Google Takeout. Em ambas acha quem já conversou com você sobre compra e descarta o texto.', assistido: '', inviavel: 'Entrar na caixa com o login do Google (OAuth): exige verificação de segurança do Google; por isso usamos senha de aplicativo.' },
    formatos: ['mbox'],
  },
  whatsapp: {
    rotulo: 'WhatsApp',
    fora: { automatico: 'Busca empresas no Google Maps e no site público; só viram lead as que publicam um celular/WhatsApp.', assistido: 'O envio é por você, ou pelo WhatsApp Business oficial com modelo aprovado e consentimento — a plataforma não dispara mensagem sozinha.', inviavel: 'Disparo em massa por WhatsApp pessoal: viola os termos do WhatsApp e arrisca banir o seu número.' },
    dentro: { automatico: 'Duas vias: (1) WhatsApp Business oficial do seu número — cada mensagem recebida vira sinal de lead, sem guardar o texto; (2) você envia as conversas exportadas ("Exportar conversa", .txt).', assistido: 'O export de contato salvo não traz o telefone — o lead entra pelo nome e você vincula o número. A Business oficial só RECEBE; o envio é assistido.', inviavel: 'Ler o seu WhatsApp pessoal pelo servidor: não oficial, risco de banimento.' },
    formatos: ['txt'],
  },
  instagram: {
    rotulo: 'Instagram',
    fora: { automatico: 'Só o perfil que o site ou o Google Maps da empresa já publica.', assistido: 'Envio ASSISTIDO: o CRM monta a fila e você abre cada perfil e envia.', inviavel: 'Buscar pessoas dentro do Instagram ou enviar DM em massa: não há API para isso e raspar viola os termos.' },
    dentro: { automatico: 'Você envia o export oficial ("Baixar suas informações", JSON); o sistema classifica as conversas.', assistido: 'O export traz o nome de exibição, não o @usuário: você vincula o perfil.', inviavel: 'Ler as suas DMs ao vivo: sem API para conta pessoal.' },
    formatos: ['json'],
  },
  facebook: {
    rotulo: 'Facebook',
    fora: { automatico: 'Só a página que o site ou o Google Maps da empresa já publica.', assistido: 'Envio ASSISTIDO pela própria página.', inviavel: 'Buscar pessoas dentro do Facebook ou enviar mensagem em massa.' },
    dentro: { automatico: 'Você envia o export oficial ("Baixar suas informações", JSON).', assistido: 'O export traz o nome de exibição: você vincula o perfil.', inviavel: 'Ler o Messenger ao vivo: só a Página comercial, com revisão da Meta (fase futura).' },
    formatos: ['json'],
  },
  tiktok: {
    rotulo: 'TikTok',
    fora: { automatico: 'Só o perfil que o site da empresa já publica.', assistido: 'Envio ASSISTIDO: você abre o perfil e envia.', inviavel: 'Buscar pessoas no TikTok ou enviar DM em massa.' },
    dentro: { automatico: 'Você envia o export do TikTok (JSON). ⚠️ A estrutura do arquivo não foi verificada com um export real: se não for reconhecida, nada é gravado.', assistido: '', inviavel: 'Ler as DMs ao vivo: sem API.' },
    formatos: ['json'],
  },
  linkedin: {
    rotulo: 'LinkedIn',
    fora: { automatico: 'Só o perfil/página que o site da empresa já publica.', assistido: 'Envio ASSISTIDO: você abre o perfil e envia.', inviavel: 'Buscar pessoas no LinkedIn ou automatizar mensagens: viola os termos e a conta é suspensa.' },
    dentro: { automatico: 'Você envia o messages.csv do export oficial do LinkedIn.', assistido: '', inviavel: 'Ler as suas mensagens ao vivo: sem API.' },
    formatos: ['csv'],
  },
};

// padrão por variável de ambiente (CRM_CAPTURA_EXTERNA=on); o que o staff gravar no painel SEMPRE vence (liga ou desliga)
const ligadoExterna = () => { const c = Carteira.Plataforma.obter('captura', {}); return c.externa_ativa !== undefined ? !!c.externa_ativa : String(process.env.CRM_CAPTURA_EXTERNA || 'off').toLowerCase() === 'on'; };
const configurarPlataforma = (novo = {}) => { const c = Carteira.Plataforma.obter('captura', {}); if ('externa_ativa' in novo) c.externa_ativa = !!novo.externa_ativa; Carteira.Plataforma.salvar('captura', c); return { externa_ativa: ligadoExterna() }; };

/** O que este assinante pode fazer agora na captura externa, e por quê. */
function situacaoExterna(tid) {
  const interno = Carteira.interno(tid);
  const proprio = Cofre.tem(tid, 'apify');
  const cfg = Carteira.cfg();
  const tokenPlataforma = !!process.env.APIFY_TOKEN;
  let modo = '', motivo = '';
  if (interno) { modo = tokenPlataforma ? 'interno' : ''; motivo = tokenPlataforma ? '' : 'Falta o APIFY_TOKEN do servidor.'; }
  else if (!ligadoExterna()) motivo = 'A busca externa ainda não foi liberada pela plataforma (em breve).';
  else if (proprio) modo = 'propria';
  else if (cfg.ativa && tokenPlataforma) modo = 'creditos';
  else motivo = cfg.ativa ? 'A busca com créditos ainda não está disponível. Cadastre o seu token do Apify.' : 'Cadastre o seu token do Apify para buscar (os créditos ainda não foram liberados).';
  return { liberada: ligadoExterna() || interno, modo, motivo, pode: !!modo, token_proprio: proprio, creditos: cfg.ativa && tokenPlataforma && !interno };
}

/** Escopo do que o assinante vê ao abrir "Aumentar leads". */
function visao(tid) {
  const IA = require('./ia-provedor');
  return {
    areas: AREAS.map((a) => ({ id: a, ...OPCOES[a] })),
    externa: situacaoExterna(tid),
    ia: IA.modos(tid), uso_ia_mes: IA.usoDoMes(tid),
    cofre: { disponivel: Cofre.configurado(), chaves: Cofre.meta(tid), tipos: Object.entries(Cofre.NOMES).filter(([id]) => ['ia_anthropic', 'ia_openai', 'apify'].includes(id)).map(([id, v]) => ({ id, rotulo: v.rotulo })) },
    carteira: Carteira.estado(tid),
    assuntos: assuntosDoTenant(tid),
    imap: require('./captura-imap').estado(tid),
    whatsapp: require('./whatsapp-business').estado(tid),
    cnpj: require('./cnpj').estado(tid),
  };
}

// ---------------------------------------------------------------------
// COBRANÇA da varredura externa (chamada por buscas.executar)
// ---------------------------------------------------------------------
/**
 * Decide quem paga ANTES de gastar. Devolve { modo, token, fechar(lugares), cancelar() }.
 * `estUsd` = pior caso da varredura em US$. Lança erro (sem gastar nada) se ninguém puder pagar.
 */
function abrirCobranca(tid, b, estUsd) {
  const sit = situacaoExterna(tid);
  if (!sit.pode) throw erro(sit.motivo || 'Sem forma de pagamento para esta busca.', sit.liberada ? 402 : 403);
  if (sit.modo === 'interno') return { modo: 'interno', token: undefined, fechar: () => ({ cobrado_milesimos: 0 }), cancelar() {} };
  if (sit.modo === 'propria') return { modo: 'propria', token: Cofre.revelar(tid, 'apify'), fechar: () => ({ cobrado_milesimos: 0 }), cancelar() {} };
  const cfg = Carteira.cfg();
  const teto = Math.max(1, Carteira.usdParaMilesimos(estUsd, cfg));
  const r = Carteira.reservar(tid, teto, { detalhe: `Busca de leads — ${s(b.nome, 80)}` });
  let fechada = false;
  return {
    modo: 'creditos', token: undefined, teto_milesimos: teto,
    // cobra só os lugares que a fonte DEVOLVEU (o actor cobra por resultado)
    fechar(lugares) { if (fechada) return { cobrado_milesimos: 0 }; fechada = true; const real = Carteira.usdParaMilesimos((Math.max(0, lugares) * fontes.USD_POR_LUGAR), cfg); const a = Carteira.acertar(tid, r.ref, teto, lugares > 0 ? real : 0); return { cobrado_milesimos: a.cobrado_milesimos || 0 }; },
    cancelar() { if (!fechada) { fechada = true; Carteira.estornar(tid, r.ref, teto); } },
  };
}

/** Estimativa EXIBIDA antes de aprovar: o teto que seria cobrado, no modo do assinante. */
function orcamentoExterno(tid, custo) {
  const sit = situacaoExterna(tid);
  const cfg = Carteira.cfg();
  const base = { modo: sit.modo, pode: sit.pode, motivo: sit.motivo, lugares_max: custo.lugares_max };
  if (sit.modo === 'creditos') { const m = Carteira.usdParaMilesimos(custo.usd_exato != null ? custo.usd_exato : custo.usd, cfg); return { ...base, teto_milesimos: m, teto: Carteira.brl(m), cobrado_de: 'créditos', saldo: Carteira.brl(Carteira.saldo(tid)), cobre: Carteira.saldo(tid) >= m }; }
  if (sit.modo === 'propria') return { ...base, teto_milesimos: 0, teto: 'R$ 0,00 na plataforma', cobrado_de: `seu token do Apify (até ~US$ ${custo.usd.toFixed(2)} lá)` };
  if (sit.modo === 'interno') return { ...base, teto_milesimos: 0, teto: 'conta interna', cobrado_de: 'plataforma (conta interna)' };
  return base;
}

// ---------------------------------------------------------------------
// ASSUNTOS do assinante (para classificar conversas)
// ---------------------------------------------------------------------
function assuntosDoTenant(tid) {
  const c = db.prepare('SELECT config FROM crm_config WHERE tenant_id = ?').get(tid);
  let cfg = {}; try { cfg = JSON.parse((c && c.config) || '{}'); } catch (_) { cfg = {}; }
  return (Array.isArray(cfg.assuntos_conversa) ? cfg.assuntos_conversa : []);
}
const slugAssunto = (t) => 'c-' + s(t, 40).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 22).replace(/-+$/, '');
function salvarAssuntos(tid, lista) {
  const app = require('./app-repo');
  const ok = (Array.isArray(lista) ? lista : []).slice(0, 8).map((a) => ({
    id: slugAssunto(a.rotulo || a.id), rotulo: s(a.rotulo, 60),
    palavras: (Array.isArray(a.palavras) ? a.palavras : String(a.palavras || '').split(/[,;\n]/)).map((x) => s(x, 40)).filter((x) => x.length >= 3).slice(0, 30),
  })).filter((a) => a.rotulo && a.id.length > 2 && a.palavras.length);
  if ((Array.isArray(lista) ? lista : []).length && !ok.length) throw erro('Cada assunto precisa de um nome e de ao menos uma palavra com 3 letras ou mais.');
  app.Config.salvar(tid, { assuntos_conversa: ok });
  return ok;
}

// ---------------------------------------------------------------------
// LEITORES DE EXPORT — em memória; nada do texto é guardado
// ---------------------------------------------------------------------
const MAX_MSGS_POR_CONVERSA = 200;
const guarda = (lista, m) => { lista.push(m); if (lista.length > MAX_MSGS_POR_CONVERSA) lista.splice(0, lista.length - 120); };
const maisFrequente = (arr) => { const c = {}; for (const a of arr) if (a) c[a] = (c[a] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0] ? Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] : ''; };
const conserta = (t) => { try { return Buffer.from(String(t || ''), 'latin1').toString('utf8'); } catch (_) { return String(t || ''); } }; // a Meta grava UTF-8 como latin1

function item(canal, ident, nome, msgs, totais, tab) {
  const r = classificarConversa({ canal, mensagens: msgs, assuntos: tab });
  if (!r || !r.comercial) return null;
  if (totais) Object.assign(r, totais);
  return { canal, identificador: ident, nome: nome || '', ...r };
}

function csv(texto) { // RFC 4180
  const linhas = []; let campo = '', lin = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) { if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === ',') { lin.push(campo); campo = ''; }
    else if (ch === '\n') { lin.push(campo.replace(/\r$/, '')); linhas.push(lin); lin = []; campo = ''; }
    else campo += ch;
  }
  if (campo || lin.length) { lin.push(campo); linhas.push(lin); }
  return linhas;
}

// ---- WhatsApp: "Exportar conversa" (.txt). Cada arquivo = uma conversa 1:1 ----
const RE_WA = /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?(?:\s?([AaPp])\.?[Mm]\.?)?\]?\s*(?:-\s*)?([^:\n]{1,80}?):\s?([\s\S]*)$/;
function lerWhatsApp(conteudo) {
  const msgs = []; let atual = null;
  for (const linha of String(conteudo).replace(/^﻿/, '').split(/\r?\n/)) {
    const m = linha.replace(/[‎‏]/g, '').match(RE_WA);
    if (m) {
      let [, d, mes, a, h, mi, ap, autor, texto] = m;
      a = Number(a); if (a < 100) a += 2000; h = Number(h);
      if (ap) { const pm = /p/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
      const t = Date.UTC(a, Number(mes) - 1, Number(d), h + 3, Number(mi)); // horário de Brasília → UTC (aproximado; só ordena)
      if (!Number.isFinite(t)) continue;
      atual = { t, autor: autor.trim(), texto: texto.slice(0, 600) };
      guarda(msgs, atual);
    } else if (atual && linha.trim()) atual.texto = (atual.texto + ' ' + linha).slice(0, 600);
  }
  return msgs;
}
function importarWhatsApp(arquivos, { eu, tab }) {
  const conversas = arquivos.map((a) => ({ nome: a.nome, msgs: lerWhatsApp(a.conteudo) })).filter((c) => c.msgs.length);
  const autoresPor = conversas.map((c) => [...new Set(c.msgs.map((m) => m.autor))]);
  if (!conversas.length) throw erro('Nenhuma mensagem reconhecida. Use "Exportar conversa → sem mídia" do WhatsApp (arquivo .txt).');
  const meu = s(eu, 80) || maisFrequente(autoresPor.flat());
  if (!s(eu, 80)) {
    // sem "eu" informado: numa conversa só não há como saber quem é o dono; com várias, só segue se o MESMO nome
    // aparece em todas (o dono é o único presente em todos os arquivos). Senão a tela pergunta — nunca chuta.
    const dono = conversas.length >= 2 && autoresPor.every((a) => a.includes(meu));
    if (!dono) return { precisa_eu: true, candidatos: [...new Set(autoresPor.flat())].slice(0, 12), itens: [] };
  }
  const itens = []; let grupos = 0;
  for (const c of conversas) {
    const autores = [...new Set(c.msgs.map((m) => m.autor))];
    const outros = autores.filter((x) => x !== meu);
    if (outros.length !== 1) { grupos++; continue; } // grupo, ou "eu" errado
    const nome = outros[0];
    const tel = nome.replace(/[^\d+]/g, '');
    const ident = tel.length >= 10 && /^\+?[\d\s\-()]+$/.test(nome) ? tel : '';
    const total = c.msgs.length, minhas = c.msgs.filter((m) => m.autor === meu).length;
    const x = item('whatsapp', ident, nome, c.msgs.map((m) => ({ t: m.t, deMim: m.autor === meu, texto: m.texto })), { total, minhas, deles: total - minhas }, tab);
    if (x) itens.push(x);
  }
  return { itens, lidas: conversas.length, ignoradas_grupo: grupos, eu: meu };
}

// ---- E-mail: .mbox ----
const AUTOMATICO = /(no-?reply|nao-?responda|do-?not-?reply|mailer-daemon|notificac|notification|newsletter|marketing@|news@|bounce)/i;
const enderecos = (h) => [...String(h || '').matchAll(/([^<",;]*?)\s*<?([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})>?/g)].map((m) => ({ nome: m[1].replace(/["']/g, '').trim(), email: m[2].toLowerCase() }));
function decodificarCabecalho(v) {
  return String(v || '').replace(/=\?([\w-]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
    try { return enc.toUpperCase() === 'B' ? Buffer.from(txt, 'base64').toString(/utf/i.test(cs) ? 'utf8' : 'latin1') : Buffer.from(txt.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString(/utf/i.test(cs) ? 'utf8' : 'latin1'); } catch (_x) { return txt; }
  });
}
function lerMbox(conteudo) {
  const msgs = [];
  for (const bloco of String(conteudo).split(/^From \S+.*\r?\n/m)) {
    if (!bloco.trim()) continue;
    const i = bloco.search(/\r?\n\r?\n/);
    const cab = (i < 0 ? bloco : bloco.slice(0, i)).replace(/\r?\n[ \t]+/g, ' ');
    let corpo = i < 0 ? '' : bloco.slice(i).trim();
    const h = (nome) => { const m = cab.match(new RegExp('^' + nome + ':\\s*(.*)$', 'im')); return m ? m[1].trim() : ''; };
    const de = enderecos(h('From'))[0]; if (!de) continue;
    const t = Date.parse(h('Date')); if (!Number.isFinite(t)) continue;
    if (/^content-transfer-encoding:\s*base64/im.test(cab)) corpo = '';
    corpo = corpo.split(/\r?\n/).filter((l) => !/^(--|content-|mime-|>)/i.test(l) && !/^[A-Za-z0-9+/=]{60,}$/.test(l)).join(' ').slice(0, 500);
    msgs.push({ t, de: de.email, deNome: de.nome, para: enderecos(h('To')).map((x) => x.email), assunto: decodificarCabecalho(h('Subject')), texto: corpo, auto: AUTOMATICO.test(cab.slice(0, 600)) });
  }
  return msgs;
}
function importarEmail(arquivos, { eu, tab }) {
  const todas = arquivos.flatMap((a) => lerMbox(a.conteudo));
  if (!todas.length) throw erro('Nenhum e-mail reconhecido. Envie o arquivo .mbox do Google Takeout (Gmail).');
  return classificarEmails(todas, eu, tab);
}
// núcleo comum ao .mbox e ao IMAP: agrupa por interlocutor, ignora automáticos, classifica
function classificarEmails(todas, eu, tab) {
  const meus = new Set(String(eu || '').toLowerCase().split(/[\s,;]+/).filter((x) => x.includes('@')));
  if (!meus.size) {
    const dono = maisFrequente(todas.map((m) => m.de));
    return { precisa_eu: true, candidatos: [...new Set(todas.map((m) => m.de))].sort((a, b) => todas.filter((m) => m.de === b).length - todas.filter((m) => m.de === a).length).slice(0, 8), sugestao: dono, itens: [] };
  }
  const por = new Map(); let automaticos = 0;
  for (const m of todas) {
    const deMim = meus.has(m.de);
    const outro = deMim ? m.para.find((e) => !meus.has(e)) : m.de;
    if (!outro) continue;
    if (m.auto || AUTOMATICO.test(outro)) { automaticos++; continue; }
    let c = por.get(outro); if (!c) { c = { nome: '', msgs: [], total: 0, minhas: 0, primeira: m.t }; por.set(outro, c); }
    c.total++; if (deMim) c.minhas++; if (m.t < c.primeira) c.primeira = m.t;
    if (!deMim && m.deNome) c.nome = m.deNome;
    guarda(c.msgs, { t: m.t, deMim, texto: m.assunto + ' ' + m.texto });
  }
  const itens = [];
  for (const [email, c] of por) {
    const x = item('email', email, c.nome, c.msgs, { total: c.total, minhas: c.minhas, deles: c.total - c.minhas, primeira_em: new Date(c.primeira).toISOString() }, tab);
    if (x) itens.push(x);
  }
  return { itens, lidas: todas.length, ignoradas_automaticos: automaticos, eu: [...meus].join(', ') };
}

// ---- Instagram / Facebook: message_N.json agrupados pela pasta da conversa ----
function importarMeta(canal, arquivos, { eu, tab }) {
  const fios = new Map();
  for (const a of arquivos) {
    if (!/message_\d+\.json$/i.test(a.nome)) continue;
    let j; try { j = JSON.parse(a.conteudo); } catch (_) { continue; }
    const k = String(a.nome).replace(/[\\/][^\\/]*$/, '');
    const f = fios.get(k) || { part: (j.participants || []).map((p) => conserta(p.name)), msgs: [] };
    for (const m of j.messages || []) guarda(f.msgs, { de: conserta(m.sender_name), t: m.timestamp_ms, texto: conserta(m.content || '').slice(0, 600) });
    fios.set(k, f);
  }
  if (!fios.size) throw erro('Nenhum message_N.json reconhecido. Envie os arquivos message_1.json do export em formato JSON.');
  const meu = s(eu, 80) || maisFrequente([...fios.values()].flatMap((f) => f.part));
  const itens = [];
  for (const f of fios.values()) {
    const outros = f.part.filter((p) => p !== meu);
    if (outros.length !== 1) continue; // grupo ou fio estranho
    const msgs = f.msgs.map((m) => ({ t: m.t, deMim: m.de === meu, texto: m.texto }));
    const x = item(canal, '', outros[0], msgs, null, tab);
    if (x) itens.push(x);
  }
  return { itens, lidas: fios.size, eu: meu, aviso: 'O export da Meta traz o nome de exibição, não o @usuário: o lead entra pelo nome e você vincula o perfil.' };
}

// ---- LinkedIn: messages.csv ----
function importarLinkedin(arquivos, { eu, tab }) {
  const a = arquivos[0]; if (!a) throw erro('Envie o messages.csv.');
  const [cab, ...linhas] = csv(String(a.conteudo).replace(/^﻿/, ''));
  const ix = Object.fromEntries((cab || []).map((c, i) => [c.trim().toUpperCase(), i]));
  for (const c of ['CONVERSATION ID', 'FROM', 'SENDER PROFILE URL', 'RECIPIENT PROFILE URLS', 'DATE', 'CONTENT']) if (!(c in ix)) throw erro('Coluna ausente no messages.csv: ' + c + '. Use o arquivo messages.csv do export oficial.');
  const meu = s(eu, 80) || maisFrequente(linhas.map((l) => l[ix['FROM']]));
  const fios = new Map();
  for (const l of linhas) {
    const id = l[ix['CONVERSATION ID']]; if (!id) continue;
    const deMim = l[ix['FROM']] === meu;
    const f = fios.get(id) || { nome: '', url: '', pessoas: new Set(), msgs: [] };
    if (!deMim) { f.nome = l[ix['FROM']]; f.url = l[ix['SENDER PROFILE URL']]; }
    else if (!f.url) { const urls = String(l[ix['RECIPIENT PROFILE URLS']] || '').split(/[,\s]+/).filter(Boolean); if (urls.length === 1) { f.url = urls[0]; f.nome = f.nome || l[ix['TO']] || ''; } }
    f.pessoas.add(l[ix['FROM']]);
    guarda(f.msgs, { t: Date.parse(String(l[ix['DATE']]).replace(' UTC', 'Z').replace(' ', 'T')), deMim, texto: ((l[ix['SUBJECT']] || '') + ' ' + (l[ix['CONTENT']] || '')).slice(0, 600) });
    fios.set(id, f);
  }
  const itens = [];
  for (const f of fios.values()) {
    if (f.pessoas.size > 2 || !f.url) continue;
    const x = item('linkedin', f.url, f.nome, f.msgs.filter((m) => Number.isFinite(m.t)), null, tab);
    if (x) itens.push(x);
  }
  return { itens, lidas: fios.size, eu: meu };
}

// ---- TikTok (estrutura NÃO verificada com export real) ----
function importarTiktok(arquivos, { eu, tab }) {
  const a = arquivos[0]; if (!a) throw erro('Envie o arquivo JSON do TikTok.');
  let j; try { j = JSON.parse(a.conteudo); } catch (_) { throw erro('JSON inválido.'); }
  const hist = (((j || {})['Direct Message'] || {})['Direct Messages'] || {}).ChatHistory || ((j || {})['Direct Messages'] || {}).ChatHistory || null;
  if (!hist) throw erro('Estrutura do export do TikTok não reconhecida (esperado Direct Message > Direct Messages > ChatHistory). Nada foi gravado.');
  const meu = s(eu, 80) || maisFrequente(Object.values(hist).flatMap((l) => (l || []).map((m) => m.From)));
  const itens = [];
  for (const [titulo, lista] of Object.entries(hist)) {
    const nome = titulo.replace(/^Chat History with\s*/i, '').replace(/:$/, '').trim();
    const msgs = (lista || []).slice(-MAX_MSGS_POR_CONVERSA).map((m) => ({ t: Date.parse(String(m.Date).replace(' ', 'T') + 'Z'), deMim: m.From === meu, texto: String(m.Content || '').slice(0, 600) })).filter((m) => Number.isFinite(m.t));
    const x = item('tiktok', '', nome, msgs, null, tab);
    if (x) itens.push(x);
  }
  return { itens, lidas: Object.keys(hist).length, eu: meu, aviso: 'Estrutura do export do TikTok não verificada com arquivo real.' };
}

const MAX_ARQUIVOS = 400;
const MAX_BYTES = 40 * 1024 * 1024;
/**
 * Importa o export de UMA área. `arquivos`: [{nome, conteudo}] (texto). Devolve o resultado da ingestão
 * (ou { precisa_eu } para a tela perguntar quem é você). O conteúdo bruto não é guardado em lugar nenhum.
 */
function importarExport(tid, { area, arquivos, eu } = {}, fonte = 'upload') {
  if (!AREAS.includes(area)) throw erro('Escolha a área do arquivo.');
  if (!Array.isArray(arquivos) || !arquivos.length) throw erro('Envie ao menos um arquivo.');
  if (arquivos.length > MAX_ARQUIVOS) throw erro(`Máximo de ${MAX_ARQUIVOS} arquivos por envio.`);
  let bytes = 0;
  const arqs = arquivos.map((a) => { const conteudo = String((a && a.conteudo) || ''); bytes += conteudo.length; return { nome: s(a && a.nome, 300), conteudo }; });
  if (bytes > MAX_BYTES) throw erro('Arquivos grandes demais (limite de 40 MB por envio). Envie em partes.');
  const tab = montarAssuntos(assuntosDoTenant(tid));
  const ctx = { eu, tab };
  let r;
  try {
    r = area === 'whatsapp' ? importarWhatsApp(arqs, ctx) : area === 'email' ? importarEmail(arqs, ctx)
      : (area === 'instagram' || area === 'facebook') ? importarMeta(area, arqs, ctx) : area === 'linkedin' ? importarLinkedin(arqs, ctx) : importarTiktok(arqs, ctx);
  } finally { arqs.length = 0; arquivos.length = 0; } // solta o texto o quanto antes
  if (r.precisa_eu) return { ok: true, precisa_eu: true, candidatos: r.candidatos, sugestao: r.sugestao || '' };
  const Conversas = require('./conversas');
  const ing = Conversas.ingerir(tid, r.itens, fonte + ':' + area);
  const { itens, ...resto } = r;
  return { ok: true, ...resto, conversas_com_assunto: itens.length, ingestao: ing };
}

module.exports = {
  AREAS, OPCOES, visao, situacaoExterna, orcamentoExterno, abrirCobranca, ligadoExterna, configurarPlataforma,
  assuntosDoTenant, salvarAssuntos, importarExport, classificarEmails, lerWhatsApp, lerMbox, csv,
};
