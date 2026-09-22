// =====================================================================
// Comunicados — o MOTOR: rascunho → público → entregas → envio em ritmo.
//
// Por que o envio é uma FILA e não um laço dentro do request:
//   • O e-mail sai pelo SMTP do Gmail, que tem teto diário (~500/dia na
//     conta comum). Mandar 800 de uma vez queima a conta no meio e o
//     resto falha calado. A fila respeita um ritmo por minuto e um teto
//     por dia, e o que sobrar sai no dia seguinte.
//   • O WhatsApp sai pelo cenário do Make, que custa operação (2 por
//     mensagem) numa cota de 10.000/mês que também atende os hóspedes.
//   • Reinício do Render no meio do envio não pode duplicar nem perder:
//     cada entrega é uma linha com status, e a fila só pega `pendente`.
//
// Os canais reais (enviarEmail, enviarWhatsAppTemplate) são INJETADOS
// pelo server.js; sem eles o canal aparece como indisponível na tela, em
// vez de "enviar" e sumir.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId, j } = require('./db');
const fontes = require('./fontes');

// ---------------- vocabulário ----------------
const CATEGORIAS = {
  novidade:      { rotulo: 'Novidade',        emoji: '✨', operacional: false },
  melhoria:      { rotulo: 'Melhoria',        emoji: '🛠️', operacional: false },
  dica:          { rotulo: 'Dica de uso',     emoji: '💡', operacional: false },
  instabilidade: { rotulo: 'Instabilidade',   emoji: '⚠️', operacional: true },
  manutencao:    { rotulo: 'Manutenção programada', emoji: '🔧', operacional: true },
  resolvido:     { rotulo: 'Resolvido',       emoji: '✅', operacional: true },
  suporte:       { rotulo: 'Suporte',         emoji: '🤝', operacional: true },
};
const CANAIS = ['app', 'email', 'whatsapp'];

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const normEmail = (e) => { const v = String(e || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ''; };
// Telefone BR: só dígitos, com DDI 55. Número curto demais não é número.
function normFone(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 && d.length <= 13 ? d : '';
}

// ---------------- canais injetados ----------------
const _canais = { emailPronto: () => true, whatsappPronto: () => true, enviarEmail: null, enviarWhatsAppTemplate: null, baseUrl: 'https://minha.villelastay.com.br', segredo: '' };
// emailPronto/whatsappPronto: a função de envio sempre existe no server.js;
// o que diz se ela VAI funcionar é a configuração (SMTP, webhook do Make).
function configurar({ enviarEmail, enviarWhatsAppTemplate, baseUrl, segredo, emailPronto, whatsappPronto } = {}) {
  if (typeof emailPronto === 'function') _canais.emailPronto = emailPronto;
  if (typeof whatsappPronto === 'function') _canais.whatsappPronto = whatsappPronto;
  if (typeof enviarEmail === 'function') _canais.enviarEmail = enviarEmail;
  if (typeof enviarWhatsAppTemplate === 'function') _canais.enviarWhatsAppTemplate = enviarWhatsAppTemplate;
  if (baseUrl) _canais.baseUrl = String(baseUrl).replace(/\/+$/, '');
  if (segredo) _canais.segredo = String(segredo);
  return disponibilidade();
}
const templateWA = () => s(process.env.COMUNICADOS_WA_TEMPLATE, 80);

// ---------------- WhatsApp: business (Meta) ou pessoal (ponte local) ----------------
// O canal business exige modelo aprovado pela Meta. Enquanto ele não existe,
// o Augusto autorizou (22/09/2026) usar o número PESSOAL — que é Baileys,
// roda no PC dele e é NÃO-OFICIAL (risco de ban). Por isso:
//   • quem envia é uma ponte local, não o servidor (o Render não alcança o PC);
//   • ritmo humano e teto baixo por dia, definidos na ponte;
//   • o canal só aparece disponível enquanto a ponte dá sinal de vida.
const PONTE_CHAVE = 'ponte-wa-pessoal';
const PONTE_VALIDADE_MIN = Number(process.env.COMUNICADOS_WA_PONTE_MIN || 90);
function registrarPonte(info) {
  db.prepare(`INSERT INTO estado (chave, valor, em) VALUES (?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, em = excluded.em`)
    .run(PONTE_CHAVE, j.str(info || {}), nowISO());
}
function ponte() {
  const r = db.prepare('SELECT valor, em FROM estado WHERE chave = ?').get(PONTE_CHAVE);
  if (!r) return { viva: false };
  const viva = (Date.now() - Date.parse(r.em)) < PONTE_VALIDADE_MIN * 60000;
  return { viva, em: r.em, ...j.parse(r.valor, {}) };
}
// 'business' quando há modelo aprovado; senão 'pessoal' (se a ponte estiver viva).
const modoWA = () => (templateWA() && _canais.whatsappPronto()) ? 'business' : 'pessoal';
// Provedor de e-mail em volume (Resend). Sem as duas variáveis, tudo sai pelo
// Gmail do backend, como antes. Com elas, os COMUNICADOS e as respostas do
// suporte saem pelo Resend, com cabeçalho de descadastro em um clique
// (Gmail e Yahoo exigem isso de quem manda em volume).
const resendPronto = () => !!(process.env.RESEND_API_KEY && process.env.COMUNICADOS_EMAIL_FROM);
async function enviarResend(para, assunto, html, urlSair) {
  const headers = urlSair ? { 'List-Unsubscribe': `<${urlSair}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.COMUNICADOS_EMAIL_FROM, to: [para], subject: assunto, html, headers, reply_to: process.env.COMUNICADOS_EMAIL_REPLY_TO || undefined }),
  });
  if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (_) {} throw new Error(`Resend ${r.status} ${m}`.trim()); }
  return true;
}
// Porta única de e-mail da central (comunicado e suporte).
async function enviarEmailCentral(para, assunto, html, urlSair) {
  if (resendPronto()) return enviarResend(para, assunto, html, urlSair);
  if (!_canais.enviarEmail) return false;
  return _canais.enviarEmail(para, assunto, html);
}
const provedorEmail = () => resendPronto() ? 'resend' : 'gmail';
function disponibilidade() {
  return {
    app: { ok: true },
    email: resendPronto() || (_canais.enviarEmail && _canais.emailPronto())
      ? { ok: true, provedor: provedorEmail(), teto_dia: tetoDia('email'), enviados_hoje: enviadosHoje('email') }
      : { ok: false, motivo: 'SMTP não configurado (GMAIL_USER / GMAIL_APP_PASS no Render).' },
    whatsapp: modoWA() === 'business'
      ? { ok: true, modo: 'business', template: templateWA(), teto_dia: tetoDia('whatsapp'), enviados_hoje: enviadosHoje('whatsapp') }
      : ponte().viva
        ? { ok: true, modo: 'pessoal', numero: ponte().numero || '', teto_dia: ponte().teto_dia || 0, enviados_hoje: enviadosHoje('whatsapp'), aviso: 'Saindo pelo SEU número pessoal (canal não-oficial, em ritmo lento). Aprove o modelo na Meta para usar o número business.' }
        : { ok: false, modo: 'pessoal', motivo: 'Sem modelo aprovado na Meta e a ponte do WhatsApp pessoal não deu sinal de vida (ela roda no PC do Augusto, com o PC ligado). Ver docs/integracoes/comunicados.md.' },
  };
}

// ---------------- ritmo ----------------
const numEnv = (nome, padrao) => { const n = Number(process.env[nome]); return Number.isFinite(n) && n > 0 ? n : padrao; };
// Teto do dia: Gmail comum ~500/dia (400 com folga); Resend grátis = 100/dia —
// no plano pago, suba COMUNICADOS_EMAIL_DIA no Render.
const tetoDia = (canal) => canal === 'email' ? numEnv('COMUNICADOS_EMAIL_DIA', resendPronto() ? 100 : 400) : numEnv('COMUNICADOS_WA_DIA', 250);
const porMinuto = (canal) => canal === 'email' ? numEnv('COMUNICADOS_EMAIL_MIN', 20) : numEnv('COMUNICADOS_WA_MIN', 15);
// "Hoje" no fuso de Brasília — o teto do Gmail zera por janela de 24 h, e
// o dia de quem olha o painel é o de Brasília.
function inicioDoDiaUTC() {
  const agora = new Date();
  const br = new Date(agora.getTime() - 3 * 3600e3);
  const d = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()) + 3 * 3600e3);
  return d.toISOString();
}
function enviadosHoje(canal) {
  const r = db.prepare("SELECT COUNT(*) n FROM entregas WHERE canal = ? AND status = 'enviado' AND atualizado_em >= ?").get(canal, inicioDoDiaUTC());
  return r ? Number(r.n) : 0;
}

// ---------------- descadastro ----------------
// Token = HMAC(contato|canal). Não expira: um link de descadastro que para
// de funcionar é exatamente o que faz alguém marcar como spam.
function tokenDescadastro(contato, canal) {
  const sec = _canais.segredo || process.env.JWT_SECRET || 'comunicados-dev';
  const mac = crypto.createHmac('sha256', sec).update(`${canal}|${contato}`).digest('base64url').slice(0, 24);
  return Buffer.from(`${canal}|${contato}`).toString('base64url') + '.' + mac;
}
function lerTokenDescadastro(tok) {
  const [corpo, mac] = String(tok || '').split('.');
  if (!corpo || !mac) return null;
  let txt; try { txt = Buffer.from(corpo, 'base64url').toString('utf8'); } catch (_) { return null; }
  const [canal, contato] = [txt.slice(0, txt.indexOf('|')), txt.slice(txt.indexOf('|') + 1)];
  if (!canal || !contato) return null;
  const esperado = tokenDescadastro(contato, canal).split('.')[1];
  const a = Buffer.from(mac), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { canal, contato };
}
function descadastrar(contato, canal, escopo = 'avisos', origem = 'link') {
  db.prepare(`INSERT INTO descadastros (contato, canal, escopo, origem, criado_em) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(contato, canal) DO UPDATE SET escopo = excluded.escopo, origem = excluded.origem, criado_em = excluded.criado_em`)
    .run(contato, canal, escopo === 'tudo' ? 'tudo' : 'avisos', s(origem, 40), nowISO());
}
function recadastrar(contato, canal) { db.prepare('DELETE FROM descadastros WHERE contato = ? AND canal = ?').run(contato, canal); }
function bloqueado(contato, canal, categoria) {
  const r = db.prepare('SELECT escopo FROM descadastros WHERE contato = ? AND canal = ?').get(contato, canal);
  if (!r) return false;
  if (r.escopo === 'tudo') return true;
  return !(CATEGORIAS[categoria] && CATEGORIAS[categoria].operacional);
}
// Preferência como o CLIENTE a enxerga: tudo | importantes | nada.
// "importantes" = descadastro de 'avisos'; "nada" = descadastro de 'tudo'.
function preferenciaDe(contato, canal) {
  const r = db.prepare('SELECT escopo FROM descadastros WHERE contato = ? AND canal = ?').get(contato, canal);
  return !r ? 'tudo' : r.escopo === 'tudo' ? 'nada' : 'importantes';
}
function definirPreferencia(contato, canal, valor) {
  if (valor === 'tudo') recadastrar(contato, canal);
  else if (valor === 'importantes') descadastrar(contato, canal, 'avisos', 'app');
  else if (valor === 'nada') descadastrar(contato, canal, 'tudo', 'app');
  else throw Object.assign(new Error('Preferência inválida.'), { status: 400 });
}
async function contatosDe(produto, ref) {
  const p = await fontes.perfil(produto, ref);
  return p ? { email: normEmail(p.email), tel: normFone(p.telefone) } : null;
}
async function preferencias(produto, ref) {
  const k = await contatosDe(produto, ref);
  if (!k) return null;
  return {
    email: k.email ? { contato: mascEmail(k.email), valor: preferenciaDe(k.email, 'email') } : null,
    whatsapp: k.tel ? { contato: mascFone(k.tel), valor: preferenciaDe(k.tel, 'whatsapp') } : null,
  };
}
async function salvarPreferencias(produto, ref, { email, whatsapp } = {}) {
  const k = await contatosDe(produto, ref);
  if (!k) throw Object.assign(new Error('Conta não encontrada.'), { status: 404 });
  if (email && k.email) definirPreferencia(k.email, 'email', email);
  if (whatsapp && k.tel) definirPreferencia(k.tel, 'whatsapp', whatsapp);
  return preferencias(produto, ref);
}
const listarDescadastros = () => db.prepare('SELECT * FROM descadastros ORDER BY criado_em DESC LIMIT 500').all();

// ---------------- comunicados (CRUD) ----------------
function hidratar(r) {
  if (!r) return null;
  return { ...r, alvos: j.parse(r.alvos, []), canais: j.parse(r.canais, []), destaque: !!r.destaque };
}
function validar(d) {
  const titulo = s(d.titulo, 140), corpo = s(d.corpo, 4000);
  if (!titulo) throw Object.assign(new Error('Dê um título ao comunicado.'), { status: 400 });
  if (!corpo) throw Object.assign(new Error('Escreva a mensagem.'), { status: 400 });
  const categoria = CATEGORIAS[d.categoria] ? d.categoria : null;
  if (!categoria) throw Object.assign(new Error('Escolha a categoria.'), { status: 400 });
  const alvos = (Array.isArray(d.alvos) ? d.alvos : [])
    .map((a) => ({ produto: s(a && a.produto, 40), segmento: s(a && a.segmento, 40) || 'todos' }))
    .filter((a) => fontes.obter(a.produto) && fontes.obter(a.produto).segmentos.some((g) => g.id === a.segmento));
  const fora = alvos.filter((a) => fontes.obter(a.produto).indisponivel);
  if (fora.length) throw Object.assign(new Error(fora.map((a) => fontes.obter(a.produto).indisponivel).join(' ')), { status: 400 });
  if (!alvos.length) throw Object.assign(new Error('Escolha ao menos um sistema e o público.'), { status: 400 });
  const canais = [...new Set((Array.isArray(d.canais) ? d.canais : []).filter((c) => CANAIS.includes(c)))];
  if (!canais.length) throw Object.assign(new Error('Escolha ao menos um canal.'), { status: 400 });
  let link_url = s(d.link_url, 400);
  if (link_url && !/^https:\/\//i.test(link_url)) throw Object.assign(new Error('O link precisa começar com https://'), { status: 400 });
  const expira_em = d.expira_em ? new Date(d.expira_em) : null;
  return {
    titulo, corpo, categoria, alvos, canais,
    link_url: link_url || null, link_rotulo: s(d.link_rotulo, 40) || null,
    destaque: d.destaque ? 1 : 0,
    expira_em: expira_em && !isNaN(expira_em) ? expira_em.toISOString() : null,
  };
}
function criar(d, autor) {
  const v = validar(d), id = novoId(), agora = nowISO();
  db.prepare(`INSERT INTO comunicados (id, titulo, corpo, categoria, alvos, canais, link_url, link_rotulo, destaque, expira_em, status, criado_por, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?, ?)`)
    .run(id, v.titulo, v.corpo, v.categoria, j.str(v.alvos), j.str(v.canais), v.link_url, v.link_rotulo, v.destaque, v.expira_em, s(autor, 120), agora, agora);
  return obter(id);
}
function atualizar(id, d) {
  const atual = obter(id);
  if (!atual) throw Object.assign(new Error('Comunicado não encontrado.'), { status: 404 });
  if (!['rascunho', 'agendado'].includes(atual.status)) throw Object.assign(new Error('Comunicado já enviado não se edita — publique um novo (ex.: "Resolvido").'), { status: 409 });
  const v = validar({ ...atual, ...d });
  db.prepare(`UPDATE comunicados SET titulo=?, corpo=?, categoria=?, alvos=?, canais=?, link_url=?, link_rotulo=?, destaque=?, expira_em=?, atualizado_em=? WHERE id=?`)
    .run(v.titulo, v.corpo, v.categoria, j.str(v.alvos), j.str(v.canais), v.link_url, v.link_rotulo, v.destaque, v.expira_em, nowISO(), id);
  return obter(id);
}
const obter = (id) => hidratar(db.prepare('SELECT * FROM comunicados WHERE id = ?').get(String(id || '')));
function listar({ limite = 100 } = {}) {
  const lista = db.prepare('SELECT * FROM comunicados ORDER BY COALESCE(enviado_em, agendado_para, criado_em) DESC LIMIT ?').all(Math.min(Number(limite) || 100, 300)).map(hidratar);
  const cont = db.prepare('SELECT canal, status, COUNT(*) n FROM entregas WHERE comunicado_id = ? GROUP BY canal, status');
  for (const c of lista) c.estatisticas = resumoEntregas(cont.all(c.id), c.id);
  return lista;
}
function resumoEntregas(linhas, id) {
  const out = {};
  for (const l of linhas) { out[l.canal] = out[l.canal] || {}; out[l.canal][l.status] = Number(l.n); }
  if (out.app) out.app.lidos = Number((db.prepare('SELECT COUNT(*) n FROM leituras WHERE comunicado_id = ?').get(id) || {}).n || 0);
  return out;
}
function excluirRascunho(id) {
  const c = obter(id);
  if (!c) return false;
  if (c.status !== 'rascunho') throw Object.assign(new Error('Só rascunho pode ser excluído; enviado se arquiva.'), { status: 409 });
  db.prepare('DELETE FROM comunicados WHERE id = ?').run(id);
  return true;
}
function arquivar(id) {
  const c = obter(id);
  if (!c) throw Object.assign(new Error('Comunicado não encontrado.'), { status: 404 });
  db.prepare("UPDATE entregas SET status = 'pulado', motivo = 'arquivado', atualizado_em = ? WHERE comunicado_id = ? AND status = 'pendente'").run(nowISO(), id);
  db.prepare("UPDATE comunicados SET status = 'arquivado', atualizado_em = ? WHERE id = ?").run(nowISO(), id);
  return obter(id);
}
function cancelar(id) {
  const c = obter(id);
  if (!c) throw Object.assign(new Error('Comunicado não encontrado.'), { status: 404 });
  if (!['agendado', 'enviando'].includes(c.status)) throw Object.assign(new Error('Só dá para cancelar o que está agendado ou saindo.'), { status: 409 });
  const r = db.prepare("UPDATE entregas SET status = 'pulado', motivo = 'cancelado', atualizado_em = ? WHERE comunicado_id = ? AND status = 'pendente'").run(nowISO(), id);
  db.prepare("UPDATE comunicados SET status = 'cancelado', concluido_em = ?, atualizado_em = ? WHERE id = ?").run(nowISO(), nowISO(), id);
  return { ...obter(id), cancelados: Number(r.changes || 0) };
}

// ---------------- público ----------------
// Monta a lista de destinatários por canal, deduplicada, com o motivo de
// quem ficou de fora. É a MESMA função na prévia e no envio — a contagem
// que o Augusto confirma é a contagem que sai.
async function montarPublico(alvos, canais, categoria) {
  const porCanal = { app: new Map(), email: new Map(), whatsapp: new Map() };
  const fora = { sem_email: 0, sem_telefone: 0, descadastrado_email: 0, descadastrado_whatsapp: 0, sem_consentimento: 0, repetido: 0 };
  const operacional = !!(CATEGORIAS[categoria] && CATEGORIAS[categoria].operacional);
  const porProduto = [];
  const erros = [];
  for (const a of alvos) {
    const f = fontes.obter(a.produto);
    let pessoas = [];
    try { pessoas = await f.listar(a.segmento); }
    catch (e) { erros.push({ produto: a.produto, erro: e.message }); continue; }
    porProduto.push({ produto: a.produto, segmento: a.segmento, pessoas: pessoas.length });
    for (const p of pessoas) {
      const ref = s(p.ref, 80);
      if (!ref) continue;
      const base = { produto: a.produto, usuario_ref: ref, nome: s(p.nome, 120) };
      // Aviso no app só onde há app com login (a Livraria não tem).
      if (canais.includes('app') && (f.nativo || (f.caminhoApp && f.sessao))) {
        const k = `${a.produto}:${ref}`;
        if (!porCanal.app.has(k)) porCanal.app.set(k, { ...base, chave: k, destino: '' });
      }
      // Desmarcou "quero receber novidades" no cadastro: fica fora de
      // novidade/dica por e-mail e WhatsApp. Aviso operacional e o sino
      // do app continuam valendo.
      const semMkt = !operacional && p.marketing === false;
      if (semMkt && (canais.includes('email') || canais.includes('whatsapp'))) fora.sem_consentimento++;
      if (canais.includes('email') && !semMkt) {
        const e = normEmail(p.email);
        if (!e) fora.sem_email++;
        else if (bloqueado(e, 'email', categoria)) fora.descadastrado_email++;
        else if (porCanal.email.has(e)) fora.repetido++;
        else porCanal.email.set(e, { ...base, chave: e, destino: e });
      }
      if (canais.includes('whatsapp') && !semMkt) {
        const t = normFone(p.telefone);
        if (!t) fora.sem_telefone++;
        else if (bloqueado(t, 'whatsapp', categoria)) fora.descadastrado_whatsapp++;
        else if (porCanal.whatsapp.has(t)) fora.repetido++;
        else porCanal.whatsapp.set(t, { ...base, chave: t, destino: t });
      }
    }
  }
  const listas = { app: [...porCanal.app.values()], email: [...porCanal.email.values()], whatsapp: [...porCanal.whatsapp.values()] };
  const pessoasUnicas = new Set([...listas.app.map((x) => x.chave), ...listas.email.map((x) => x.produto + ':' + x.usuario_ref), ...listas.whatsapp.map((x) => x.produto + ':' + x.usuario_ref)]).size;
  return { listas, fora, porProduto, erros, total: pessoasUnicas };
}

// Mascara para exibir amostra na prévia sem despejar a base inteira na tela.
const mascEmail = (e) => { const [u, d] = String(e).split('@'); return u ? (u.slice(0, 2) + '•••@' + d) : ''; };
const mascFone = (t) => String(t).replace(/^(\d{4})\d+(\d{2})$/, '$1•••••$2');

async function previa(d) {
  const v = validar({ titulo: d.titulo || 'prévia', corpo: d.corpo || 'prévia', categoria: d.categoria, alvos: d.alvos, canais: d.canais, link_url: d.link_url });
  const p = await montarPublico(v.alvos, v.canais, v.categoria);
  const disp = disponibilidade();
  const amostra = (lista, masc) => lista.slice(0, 8).map((x) => ({ nome: x.nome, produto: x.produto, destino: masc ? masc(x.destino) : '' }));
  const custoWA = p.listas.whatsapp.length * 2;
  // Amostra do que o cliente vai VER, gerada pelas mesmas funções do envio.
  const exemplo = { produto: v.alvos[0].produto, nome: 'Maria Exemplo', destino: 'maria@exemplo.com' };
  const cExemplo = { ...v, titulo: s(d.titulo, 140) || '(sem título)', corpo: s(d.corpo, 4000) || '(sem mensagem)' };
  return {
    exemplo: {
      email_assunto: `${CATEGORIAS[v.categoria].emoji} ${(fontes.obter(exemplo.produto) || {}).nome}: ${cExemplo.titulo}`,
      email_html: v.canais.includes('email') ? emailHtml(cExemplo, exemplo) : null,
      whatsapp: v.canais.includes('whatsapp') ? whatsappParams(cExemplo, exemplo) : null,
    },
    canais: {
      app: v.canais.includes('app') ? { total: p.listas.app.length, amostra: amostra(p.listas.app) } : null,
      email: v.canais.includes('email') ? { total: p.listas.email.length, amostra: amostra(p.listas.email, mascEmail), disponivel: disp.email } : null,
      whatsapp: v.canais.includes('whatsapp') ? { total: p.listas.whatsapp.length, amostra: amostra(p.listas.whatsapp, mascFone), disponivel: disp.whatsapp, operacoes_make: custoWA } : null,
    },
    fora: p.fora, por_produto: p.porProduto, erros: p.erros, pessoas: p.total,
    dias_estimados: {
      email: Math.ceil(p.listas.email.length / Math.max(1, tetoDia('email'))),
      whatsapp: Math.ceil(p.listas.whatsapp.length / Math.max(1, tetoDia('whatsapp'))),
    },
  };
}

// ---------------- envio ----------------
// `disparar` só MATERIALIZA as entregas e muda o status; quem envia é a
// fila (processarLote). Assim o clique responde na hora e o reinício do
// servidor não perde nada.
async function disparar(id, { autor, agendarPara } = {}) {
  const c = obter(id);
  if (!c) throw Object.assign(new Error('Comunicado não encontrado.'), { status: 404 });
  if (!['rascunho', 'agendado'].includes(c.status)) throw Object.assign(new Error(`Este comunicado já está "${c.status}".`), { status: 409 });
  const disp = disponibilidade();
  const indisponiveis = c.canais.filter((k) => k !== 'app' && !(disp[k] && disp[k].ok));
  if (indisponiveis.length) throw Object.assign(new Error(`Canal indisponível: ${indisponiveis.join(', ')} — ${indisponiveis.map((k) => disp[k].motivo).join(' ')}`), { status: 409 });
  if (agendarPara) {
    const quando = new Date(agendarPara);
    if (isNaN(quando) || quando.getTime() < Date.now() + 60e3) throw Object.assign(new Error('Agende para pelo menos 1 minuto à frente.'), { status: 400 });
    db.prepare("UPDATE comunicados SET status = 'agendado', agendado_para = ?, enviado_por = ?, atualizado_em = ? WHERE id = ?").run(quando.toISOString(), s(autor, 120), nowISO(), id);
    return obter(id);
  }
  return materializar(c, autor);
}
async function materializar(c, autor) {
  const p = await montarPublico(c.alvos, c.canais, c.categoria);
  if (p.erros.length && !p.porProduto.length) throw Object.assign(new Error('Nenhum sistema respondeu: ' + p.erros.map((e) => `${e.produto}: ${e.erro}`).join('; ')), { status: 502 });
  const agora = nowISO();
  const ins = db.prepare(`INSERT OR IGNORE INTO entregas (comunicado_id, canal, chave, produto, usuario_ref, nome, destino, status, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.exec('BEGIN');
  try {
    for (const canal of ['app', 'email', 'whatsapp']) {
      for (const x of p.listas[canal]) {
        // App: produto com central própria recebe pela fila (entra no sino dele,
        // com o push dele); os outros ficam disponíveis direto para o widget.
        const fx = fontes.obter(x.produto);
        const st = canal !== 'app' ? 'pendente' : ((fx.nativo || fontes.temPush(fx)) ? 'pendente' : 'disponivel');
        ins.run(c.id, canal, x.chave, x.produto, x.usuario_ref, x.nome, x.destino, st, agora);
      }
    }
    const temFila = p.listas.email.length + p.listas.whatsapp.length
      + p.listas.app.filter((x) => { const fx = fontes.obter(x.produto); return fx.nativo || fontes.temPush(fx); }).length > 0;
    db.prepare(`UPDATE comunicados SET status = ?, enviado_por = COALESCE(enviado_por, ?), enviado_em = ?, publico_total = ?, concluido_em = ?, atualizado_em = ? WHERE id = ?`)
      .run(temFila ? 'enviando' : 'enviado', s(autor, 120), agora, p.total, temFila ? null : agora, agora, c.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ...obter(c.id), erros_fontes: p.erros };
}

// ---------------- mensagens ----------------
function paragrafos(t) {
  return String(t || '').split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}
function urlDescadastro(produto, email) {
  const f = fontes.obter(produto) || {};
  let origem = _canais.baseUrl;
  try { if (f.url && !/cozinhe[.]/.test(f.url)) origem = new URL(f.url).origin; } catch (_) {}
  return `${origem}/comunicados/descadastro?t=${encodeURIComponent(tokenDescadastro(email, 'email'))}`;
}
function emailHtml(c, ent) {
  const f = fontes.obter(ent.produto) || { nome: 'Grupo Villela Stay', emoji: '', cor: '#1B2A4A' };
  const cat = CATEGORIAS[c.categoria];
  const primeiro = String(ent.nome || '').split(' ')[0];
  const link = c.link_url || f.url || '';
  // O link sai no domínio do PRÓPRIO produto (a rota responde em qualquer host
  // do backend): quem é aluno da Academy não estranha um endereço de outro lugar.
  const urlSair = urlDescadastro(ent.produto, ent.destino);
  return `<div style="font-family:Inter,system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1F2933">
    <div style="background:${f.cor || '#1B2A4A'};border-radius:12px 12px 0 0;padding:16px 24px">
      <span style="color:#fff;font-weight:800;font-size:1.05rem">${f.emoji || ''} ${esc(f.nome)}</span></div>
    <div style="border:1px solid #E2E6EC;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <p style="margin:0 0 6px;color:#5B6472;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em">${cat.emoji} ${esc(cat.rotulo)}</p>
      <h2 style="margin:0 0 14px;color:#1B2A4A;font-size:1.25rem">${esc(c.titulo)}</h2>
      ${primeiro ? `<p style="margin:0 0 12px">Olá, ${esc(primeiro)}!</p>` : ''}
      ${paragrafos(c.corpo)}
      ${link ? `<p style="margin:20px 0"><a href="${esc(link)}" style="background:${f.cor || '#1B2A4A'};color:#fff;font-weight:700;padding:11px 24px;border-radius:24px;text-decoration:none">${esc(c.link_rotulo || 'Abrir ' + f.nome)}</a></p>` : ''}
      <p style="color:#6B7280;font-size:.78rem;margin-top:26px;border-top:1px solid #EEF0F3;padding-top:12px">
        Você recebe este aviso porque tem conta no ${esc(f.nome)} — uma empresa do Grupo Villela Stay.
        ${cat.operacional ? 'Avisos sobre o funcionamento do sistema são enviados a todos os usuários.' : ''}
        <a href="${esc(urlSair)}" style="color:#6B7280">Não quero receber ${cat.operacional ? 'estes e-mails' : 'novidades e dicas'}</a>.</p>
    </div></div>`;
}
// Variável de template da Meta: sem quebra de linha, sem tab, sem 4+
// espaços (erro 132018 — já derrubou o canal uma vez) e NUNCA vazia.
const umaLinha = (t, max) => String(t == null ? '' : t).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
function whatsappParams(c, ent) {
  const f = fontes.obter(ent.produto) || { nome: 'Grupo Villela Stay' };
  const cat = CATEGORIAS[c.categoria];
  const primeiro = umaLinha(String(ent.nome || '').split(' ')[0], 40) || 'tudo bem';
  const link = c.link_url || f.url || '';
  const texto = umaLinha(`${cat.emoji} ${c.titulo} — ${c.corpo}`, 700 - link.length) + (link ? ' ' + link : '');
  return [primeiro, umaLinha(f.nome, 60), texto];
}

// Texto do canal PESSOAL: conversa de gente, com quebra de linha e negrito
// (o business não aceita nada disso dentro de variável de modelo).
function textoPessoal(c, ent) {
  const f = fontes.obter(ent.produto) || { nome: 'Grupo Villela Stay' };
  const cat = CATEGORIAS[c.categoria];
  const primeiro = String(ent.nome || '').split(' ')[0];
  const link = c.link_url || f.url || '';
  return [
    `${primeiro ? `Olá, ${primeiro}! ` : ''}${cat.emoji} *${f.nome}*`,
    '', `*${c.titulo}*`, '', c.corpo,
    link ? `\n${link}` : '',
    '', `_Para escolher o que recebe, abra o ${f.nome} e toque no botão de avisos._`,
  ].filter((x) => x !== null).join('\n').trim();
}
// Lote para a ponte local. Marca 'enviando' (com prazo) para duas passadas
// da ponte não mandarem a mesma mensagem duas vezes.
function pendentesWA(limite = 5) {
  const lote = db.prepare(`SELECT e.id, e.destino, e.nome, e.produto, e.comunicado_id FROM entregas e
    JOIN comunicados c ON c.id = e.comunicado_id
    WHERE e.canal = 'whatsapp' AND e.status = 'pendente' AND c.status = 'enviando' ORDER BY e.id LIMIT ?`)
    .all(Math.max(1, Math.min(Number(limite) || 5, 20)));
  const agora = nowISO();
  return lote.map((ent) => {
    db.prepare("UPDATE entregas SET status = 'enviando', atualizado_em = ? WHERE id = ?").run(agora, ent.id);
    const c = obter(ent.comunicado_id);
    return { id: ent.id, para: ent.destino, nome: ent.nome, texto: textoPessoal(c, ent), titulo: c.titulo };
  });
}
function resultadoWA(id, ok, motivo) {
  const ent = db.prepare("SELECT * FROM entregas WHERE id = ? AND canal = 'whatsapp'").get(Number(id) || 0);
  if (!ent) return false;
  const tent = Number(ent.tentativas || 0) + 1;
  const status = ok ? 'enviado' : (tent >= 3 ? 'erro' : 'pendente');
  db.prepare('UPDATE entregas SET status = ?, motivo = ?, tentativas = ?, atualizado_em = ? WHERE id = ?')
    .run(status, ok ? null : s(motivo, 200), tent, nowISO(), ent.id);
  return true;
}

async function enviarUma(c, ent) {
  if (ent.canal === 'email') {
    const f = fontes.obter(ent.produto) || { nome: 'Grupo Villela Stay' };
    const cat = CATEGORIAS[c.categoria];
    return enviarEmailCentral(ent.destino, `${cat.emoji} ${f.nome}: ${c.titulo}`, emailHtml(c, ent), urlDescadastro(ent.produto, ent.destino));
  }
  if (ent.canal === 'whatsapp') {
    if (modoWA() === 'pessoal') throw Object.assign(new Error('No modo pessoal quem envia é a ponte local.'), { status: 409 });
    return _canais.enviarWhatsAppTemplate(ent.destino, templateWA(), whatsappParams(c, ent));
  }
  return false;
}

// Um ciclo da fila: promove agendados vencidos, envia um lote por canal
// dentro do ritmo e do teto do dia, fecha os comunicados sem pendência.
let _rodando = false;
async function processarLote() {
  if (_rodando) return { pulado: true };
  _rodando = true;
  const feito = { agendados: 0, email: 0, whatsapp: 0, erros: 0 };
  try {
    for (const c of db.prepare("SELECT * FROM comunicados WHERE status = 'agendado' AND agendado_para <= ?").all(nowISO()).map(hidratar)) {
      try { await materializar(c, c.enviado_por); feito.agendados++; }
      catch (e) { console.error('[comunicados] agendado falhou', c.id, e.message); }
    }
    // Central própria do produto: sem teto (é escrita local), em lotes.
    const nativos = db.prepare(`SELECT e.* FROM entregas e JOIN comunicados c ON c.id = e.comunicado_id
      WHERE e.canal = 'app' AND e.status = 'pendente' AND c.status = 'enviando' ORDER BY e.id LIMIT 300`).all();
    const cacheN = new Map();
    for (const ent of nativos) {
      if (!cacheN.has(ent.comunicado_id)) cacheN.set(ent.comunicado_id, obter(ent.comunicado_id));
      const f = fontes.obter(ent.produto);
      let status = 'disponivel', motivo = null;
      const c = cacheN.get(ent.comunicado_id);
      try { if (f && f.nativo) await f.nativo(ent.usuario_ref, c); }
      catch (e) { status = 'erro'; motivo = s(e.message, 200); feito.erros++; }
      // Push no celular: best-effort (celular sem inscrição não é erro).
      if (status === 'disponivel' && fontes.temPush(f) && !f.nativoFazPush) {
        const cat = CATEGORIAS[c.categoria];
        try { await fontes.pushUsuario(ent.produto, ent.usuario_ref, { title: `${cat.emoji} ${c.titulo}`, body: c.corpo.slice(0, 180), tag: 'comunicado' }); } catch (_) {}
      }
      db.prepare('UPDATE entregas SET status = ?, motivo = ?, tentativas = tentativas + 1, atualizado_em = ? WHERE id = ?').run(status, motivo, nowISO(), ent.id);
      if (status === 'disponivel') feito.app = (feito.app || 0) + 1;
    }
    const disp = disponibilidade();
    for (const canal of ['email', 'whatsapp']) {
      if (!disp[canal].ok) continue;
      // No modo pessoal quem envia é a ponte local (o Render não alcança o PC).
      if (canal === 'whatsapp' && modoWA() === 'pessoal') continue;
      const cota = Math.min(porMinuto(canal), tetoDia(canal) - enviadosHoje(canal));
      if (cota <= 0) continue;
      const lote = db.prepare(`SELECT e.* FROM entregas e JOIN comunicados c ON c.id = e.comunicado_id
        WHERE e.canal = ? AND e.status = 'pendente' AND c.status = 'enviando' ORDER BY e.id LIMIT ?`).all(canal, cota);
      const cache = new Map();
      for (const ent of lote) {
        if (!cache.has(ent.comunicado_id)) cache.set(ent.comunicado_id, obter(ent.comunicado_id));
        const c = cache.get(ent.comunicado_id);
        let ok = false, motivo = null;
        try { ok = !!(await enviarUma(c, ent)); if (!ok) motivo = 'o canal recusou o envio'; }
        catch (e) { motivo = s(e.message, 200); }
        const tent = Number(ent.tentativas || 0) + 1;
        // Falha volta para a fila até 3 vezes; depois vira `erro` e aparece na tela.
        const status = ok ? 'enviado' : (tent >= 3 ? 'erro' : 'pendente');
        db.prepare('UPDATE entregas SET status = ?, motivo = ?, tentativas = ?, atualizado_em = ? WHERE id = ?').run(status, motivo, tent, nowISO(), ent.id);
        if (ok) feito[canal]++; else feito.erros++;
      }
    }
    db.prepare("UPDATE entregas SET status = 'pendente' WHERE status = 'enviando' AND atualizado_em < ?")
      .run(new Date(Date.now() - 30 * 60000).toISOString());
    for (const r of db.prepare(`SELECT c.id FROM comunicados c WHERE c.status = 'enviando'
      AND NOT EXISTS (SELECT 1 FROM entregas e WHERE e.comunicado_id = c.id AND e.status = 'pendente')`).all()) {
      db.prepare("UPDATE comunicados SET status = 'enviado', concluido_em = ?, atualizado_em = ? WHERE id = ?").run(nowISO(), nowISO(), r.id);
    }
  } finally { _rodando = false; }
  return feito;
}

// Envio de TESTE: só para o próprio admin, fora da fila e sem registro de
// entrega — para ver o e-mail e o WhatsApp como o cliente vai ver.
async function enviarTeste(id, { email, telefone, produto } = {}) {
  const c = obter(id);
  if (!c) throw Object.assign(new Error('Comunicado não encontrado.'), { status: 404 });
  const prod = produto || (c.alvos[0] && c.alvos[0].produto);
  const out = {};
  const disp = disponibilidade();
  if (c.canais.includes('email')) {
    const e = normEmail(email);
    out.email = !e ? 'sem e-mail na sua conta do staff' : !disp.email.ok ? disp.email.motivo
      : (await enviarUma(c, { canal: 'email', destino: e, nome: 'Augusto', produto: prod })) ? 'enviado para ' + e : 'falhou';
  }
  if (c.canais.includes('whatsapp')) {
    const t = normFone(telefone);
    if (!t) out.whatsapp = 'sem telefone';
    else if (!disp.whatsapp.ok) out.whatsapp = disp.whatsapp.motivo;
    else if (modoWA() === 'pessoal') {
      // Modo pessoal: quem envia é a ponte local. O teste entra na fila com UM
      // destinatário (você) e sai na próxima passada da ponte.
      db.prepare(`INSERT OR IGNORE INTO entregas (comunicado_id, canal, chave, produto, usuario_ref, nome, destino, status, atualizado_em)
        VALUES (?, 'whatsapp', ?, ?, 'teste', 'Augusto', ?, 'pendente', ?)`).run(id, 'teste:' + t, prod, t, nowISO());
      db.prepare("UPDATE comunicados SET status = 'enviando', enviado_em = COALESCE(enviado_em, ?), atualizado_em = ? WHERE id = ? AND status = 'rascunho'").run(nowISO(), nowISO(), id);
      out.whatsapp = 'na fila do seu número — a ponte manda na próxima passada (até 15 min)';
    } else out.whatsapp = (await enviarUma(c, { canal: 'whatsapp', destino: t, nome: 'Augusto', produto: prod })) ? 'enviado para ' + t : 'falhou';
  }
  if (c.canais.includes('app')) out.app = 'o aviso no app aparece para os usuários depois do envio';
  return out;
}

function entregas(id, { status, canal, limite = 200 } = {}) {
  const cond = ['comunicado_id = ?'], args = [id];
  if (status) { cond.push('status = ?'); args.push(status); }
  if (canal) { cond.push('canal = ?'); args.push(canal); }
  return db.prepare(`SELECT id, canal, produto, nome, destino, status, motivo, tentativas, atualizado_em FROM entregas WHERE ${cond.join(' AND ')} ORDER BY id LIMIT ?`)
    .all(...args, Math.min(Number(limite) || 200, 1000))
    .map((x) => ({ ...x, destino: x.canal === 'email' ? mascEmail(x.destino) : x.canal === 'whatsapp' ? mascFone(x.destino) : '' }));
}
function reenviarErros(id) {
  const r = db.prepare("UPDATE entregas SET status = 'pendente', tentativas = 0, motivo = NULL, atualizado_em = ? WHERE comunicado_id = ? AND status = 'erro'").run(nowISO(), id);
  if (Number(r.changes)) db.prepare("UPDATE comunicados SET status = 'enviando', concluido_em = NULL, atualizado_em = ? WHERE id = ? AND status IN ('enviado','enviando')").run(nowISO(), id);
  return Number(r.changes || 0);
}

// ---------------- caixa do usuário (aviso no app) ----------------
function caixa(produto, usuarioRef, { limite = 20 } = {}) {
  const agora = nowISO();
  const candidatos = db.prepare(`SELECT * FROM comunicados WHERE status IN ('enviando','enviado')
    AND canais LIKE '%"app"%' AND (expira_em IS NULL OR expira_em > ?) ORDER BY enviado_em DESC LIMIT 200`).all(agora).map(hidratar);
  const temEntrega = db.prepare("SELECT 1 FROM entregas WHERE comunicado_id = ? AND canal = 'app' AND produto = ? AND usuario_ref = ?");
  const lido = db.prepare('SELECT lido_em FROM leituras WHERE comunicado_id = ? AND produto = ? AND usuario_ref = ?');
  const itens = [];
  for (const c of candidatos) {
    const alvos = c.alvos.filter((a) => a.produto === produto);
    if (!alvos.length) continue;
    const paraTodos = alvos.some((a) => a.segmento === 'todos');
    if (!paraTodos && !temEntrega.get(c.id, produto, usuarioRef)) continue;
    const l = lido.get(c.id, produto, usuarioRef);
    const cat = CATEGORIAS[c.categoria];
    itens.push({
      id: c.id, titulo: c.titulo, corpo: c.corpo, categoria: c.categoria, categoria_rotulo: cat.rotulo, emoji: cat.emoji,
      link_url: c.link_url, link_rotulo: c.link_rotulo, destaque: c.destaque, quando: c.enviado_em, lido: !!l,
    });
    if (itens.length >= limite) break;
  }
  return { itens, nao_lidos: itens.filter((x) => !x.lido).length };
}
function marcarLido(produto, usuarioRef, id) {
  const ids = id === 'todos' ? caixa(produto, usuarioRef, { limite: 200 }).itens.map((x) => x.id) : [String(id)];
  const ins = db.prepare('INSERT OR IGNORE INTO leituras (comunicado_id, produto, usuario_ref, lido_em) VALUES (?, ?, ?, ?)');
  for (const c of ids) ins.run(c, produto, usuarioRef, nowISO());
  db.prepare(`UPDATE entregas SET status = 'lido', atualizado_em = ? WHERE canal = 'app' AND produto = ? AND usuario_ref = ? AND comunicado_id IN (${ids.map(() => '?').join(',') || "''"})`)
    .run(nowISO(), produto, usuarioRef, ...ids);
  return ids.length;
}

module.exports = {
  CATEGORIAS, CANAIS, configurar, disponibilidade,
  criar, atualizar, obter, listar, excluirRascunho, arquivar, cancelar,
  previa, disparar, processarLote, enviarTeste, entregas, reenviarErros,
  caixa, marcarLido,
  tokenDescadastro, lerTokenDescadastro, descadastrar, recadastrar, listarDescadastros,
  preferencias, salvarPreferencias, enviarEmailCentral, provedorEmail,
  modoWA, ponte, registrarPonte, pendentesWA, resultadoWA, textoPessoal,
  _int: { normEmail, normFone, emailHtml, whatsappParams, montarPublico, bloqueado },
};
