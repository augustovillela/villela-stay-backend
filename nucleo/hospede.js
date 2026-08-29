// =====================================================================
// Núcleo · Área do Hóspede (app do guest, NÃO-financeiro): login/registro,
// push, reservas, carteira/QR, pedidos, serviços, conteúdo, chat da Eva (IA),
// pré-check-in, recibo, avaliações, indicação e info da propriedade.
// A conta corrente + fidelidade + MP ficam em nucleo/hospede-financeiro.js.
// Extraído do server.js (Projeto 2). Helpers/motores ficam no núcleo, injetados.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports.montar = function montar(app, deps) {
  const { loginBloqueado, registraFalha, limpaFalhas, normFone, lerHospedes, salvarHospedes, setCookieHospede, semSenhaHosp, HOSP_COOKIE, requireHospede, stays, semAcento, novoId, getStaysClientes, JWT_SECRET, AREA_HOSPEDE_URL, enviarEmail, escHtml, reservasDoHospede, lerPropInfo, resumoConta, lerConteudo, lerEvaKB, EVA_KB_BUDGET, registrarUsoEva, lerPedidosHosp, salvarPedidosHosp, lerServicos, lerFidConfig, SECOES_CONTEUDO, lerJSON, salvarJSON, alertaAugusto, appendJsonl, itensBillaveis, reciboHtml, lerAvaliacoes, salvarAvaliacoes, hojeISO, codigoDoHospede, lerIndicacoes, salvarIndicacoes, infoPropriedade, RAIZ } = deps;

app.post('/hospede/api/login', (req, res) => {
  const ip = 'h:' + (req.ip || 'ip');
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
  u.senhaHash = bcrypt.hashSync(nova, 10); u.precisaTrocarSenha = false;
  u.sessaoVersao = Number(u.sessaoVersao || 0) + 1;   // derruba as sessões já emitidas
  salvarHospedes(hospedes);
  setCookieHospede(res, u);                           // quem trocou continua dentro
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
  if (!localizador || !sobrenome || !checkin || senha.length < 8) return res.status(400).json({ erro: 'Informe o localizador, o sobrenome, a data do check-in e uma senha de ao menos 8 caracteres.' });
  // Anti-enumeração: o localizador é curto (ex.: LR03J); sem freio, dá para varrer o espaço e tomar contas.
  const ipReg = 'hr:' + (req.ip || 'ip');
  if (loginBloqueado(ipReg)) return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em 15 minutos.' });
  const generico = 'Não encontramos uma reserva com esses dados. Confira o localizador, o sobrenome e a data de check-in.';
  try {
    const r = await stays(`/booking/reservations/${encodeURIComponent(localizador)}`).catch(() => null);
    if (!r || !r._idclient) { registraFalha(ipReg); return res.status(404).json({ erro: generico }); }
    if (!r.checkInDate || r.checkInDate !== checkin) { registraFalha(ipReg); return res.status(404).json({ erro: generico }); }
    const cli = await stays(`/booking/clients/${r._idclient}`).catch(() => null);
    if (!cli) { registraFalha(ipReg); return res.status(404).json({ erro: generico }); }
    const tokensNome = semAcento(cli.lName || cli.name || '').split(/[^a-z0-9]+/).filter(t => t.length >= 2);
    if (!tokensNome.length || sobrenome.length < 2 || !tokensNome.includes(sobrenome)) { registraFalha(ipReg); return res.status(404).json({ erro: generico }); }
    const hospedes = lerHospedes();
    let h = hospedes.find(x => x.staysClientId === r._idclient);
    const email = ((cli.emails && cli.emails[0] && (cli.emails[0].address || cli.emails[0])) || cli.email || '').trim().toLowerCase();
    const fone = (cli.phones && cli.phones[0] && (cli.phones[0].iso || cli.phones[0].number)) || '';
    const nome = (cli.fName ? (cli.fName + ' ' + (cli.lName || '')).trim() : (cli.name || '')) || '';
    if (h && h.senhaHash && !h.precisaTrocarSenha) return res.status(409).json({ erro: 'Já existe uma conta para essa reserva. Entre com a sua senha, ou peça um link de acesso pelo seu e-mail.', usarLinkEmail: true });
    if (h) { h.senhaHash = bcrypt.hashSync(senha, 10); h.precisaTrocarSenha = false; h.ativo = true; h.ultimoLogin = new Date().toISOString(); }
    else { h = { id: novoId(), nome, email, telefone: normFone(fone), senhaHash: bcrypt.hashSync(senha, 10), staysClientId: r._idclient, precisaTrocarSenha: false, ativo: true, criadoEm: new Date().toISOString(), ultimoLogin: new Date().toISOString() }; hospedes.push(h); }
    const codInd = String((req.body && req.body.codigoIndicacao) || '').trim().toUpperCase();
    if (codInd && !h.indicadoPor) { const ind = hospedes.find(x => x.codigoIndicacao === codInd); if (ind && ind.id !== h.id) h.indicadoPor = codInd; }
    salvarHospedes(hospedes);
    limpaFalhas(ipReg);
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
    <div style="background:#1B2A4A;color:#F8F9FA;padding:18px 22px;border-radius:10px 10px 0 0"><strong style="font-size:18px">Villela Stay</strong><br><span style="font-size:13px;color:#C9A227">Área do Hóspede</span></div>
    <div style="border:1px solid #E2E6EC;border-top:none;padding:22px;border-radius:0 0 10px 10px">
      <p>Olá, <strong>${escHtml(primeiro)}</strong>! 👋</p>
      <p>Recebemos um pedido para ${acao} na <strong>Área do Hóspede</strong> da Villela Stay. É lá que você vê as suas reservas, recebe as informações da casa (Wi-Fi, acesso, guia) e ativa as notificações.</p>
      <p style="margin:18px 0"><a href="${link}" style="background:#0E7490;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Criar minha senha e entrar</a></p>
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
  const ip = 'he:' + (req.ip || 'ip');
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
    const waTxt = `Olá! Sou ${nome1}, cheguei para o check-in. Reserva ${r.id}${r.imovelTitulo ? ' - ' + r.imovelTitulo : ''}.`;
    const link = 'https://wa.me/556191935013?text=' + encodeURIComponent(waTxt);
    let qrSvg = '';
    try { const QRCode = require('qrcode'); qrSvg = await QRCode.toString(link, { type: 'svg', margin: 1, width: 240, color: { dark: '#1B2A4A', light: '#ffffff' } }); }
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
  try { _faqTexto = fs.readFileSync(path.join(RAIZ, 'hospede-faq.md'), 'utf8'); }
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
    // (d) Base de conhecimento alimentada pelo anfitriao no portal (material interno da casa)
    try {
      const kb = lerEvaKB().filter(x => x.ativo !== false);
      if (kb.length) {
        let bloco = '', usado = 0;
        for (const x of kb) {
          if (usado >= EVA_KB_BUDGET) break;
          const restante = EVA_KB_BUDGET - usado;
          const corpo = String(x.texto || '').slice(0, restante);
          bloco += `\n\n[${x.titulo}]\n${corpo}`;
          usado += corpo.length + String(x.titulo || '').length + 4;
        }
        if (bloco) contexto += '\n\n=== BASE DE CONHECIMENTO DA VILLELA (material do anfitriao; fonte INTERNA, priorize junto do FAQ) ===' + bloco;
      }
    } catch (e) { /* sem base */ }

    const system = `Você é a Eva, a concierge virtual da Villela Stay, hospedagem premium por temporada no Lago Sul, Brasília-DF. Atenda como uma anfitriã premiada: acolhedora, cordial, direta e prestativa. Se apresente como Eva quando fizer sentido. Responda SEMPRE no mesmo idioma da pergunta do hóspede (português, inglês ou espanhol).

Use como FONTE DE VERDADE o FAQ oficial e os dados abaixo (reserva, conta, recomendações e base de conhecimento da casa). Regras:
- Preço, contrato, cancelamento, taxas e datas especiais: siga EXATAMENTE o FAQ. Nunca invente e NUNCA use a busca na web para políticas/preços/regras da Villela.
- Dicas de gastronomia, turismo, passeios e pacotes: COMECE SEMPRE pelas RECOMENDAÇÕES CURADAS e pela BASE DE CONHECIMENTO DA VILLELA abaixo (é a seleção e o material da casa) — só depois complemente. Se houver item curado que sirva, ofereça-o primeiro.
- Você TAMBÉM ajuda o hóspede com a logística de viagem: passagens aéreas, aluguel de carro, transporte/traslado, táxi/app, transfer do aeroporto, rotas e deslocamento na cidade. Para esses assuntos e para informação atual (horário de funcionamento, eventos, clima, preços de terceiros), use a busca na web e deixe claro quando a info vier da internet. Ao falar de traslado/transfer, lembre que a Villela oferece esse serviço (veja Serviços extras no app).
- Busca na web: use para informação externa/atual que o FAQ e os dados não cobrem (inclui a logística de viagem acima). Não pesquise assuntos internos da Villela na web.
- Wi-Fi e códigos de acesso (portão/fechadura) NÃO ficam aqui: oriente o hóspede a abrir o ícone "Wi-Fi" no app — liberados a partir de 2 dias antes do check-in.
- Se não tiver certeza, ou for exceção comercial, oriente a falar pelo WhatsApp (wa.me/556191935013). Não invente.
- Seja conciso e responda só o que foi perguntado.

=== FAQ OFICIAL DA VILLELA STAY ===
${faqTexto()}
=== FIM DO FAQ ===${contexto}`;

    // Chamada à API da Claude com BUSCA NA WEB (server tool) + tratamento de pause_turn (loop do server tool)
    const modelo = process.env.CHAT_MODEL || 'claude-haiku-4-5';
    const wsType = /sonnet-5|sonnet-4-6|opus-4-(6|7|8)|fable-5/.test(modelo) ? 'web_search_20260209' : 'web_search_20250305';
    const tools = [{ type: wsType, name: 'web_search', max_uses: 3 }];
    const messages = [...historico, { role: 'user', content: msg }];
    let d = null, usoIn = 0, usoOut = 0;
    for (let i = 0; i < 4; i++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelo, max_tokens: 1000, system, tools, messages }),
      });
      if (!r.ok) { const t = await r.text().catch(() => ''); console.error('[chat] anthropic', r.status, t.slice(0, 300)); return res.status(502).json({ erro: 'Não consegui responder agora. Tente de novo em instantes ou fale pelo WhatsApp: wa.me/556191935013' }); }
      d = await r.json();
      if (d.usage) { usoIn += (d.usage.input_tokens || 0) + (d.usage.cache_read_input_tokens || 0) + (d.usage.cache_creation_input_tokens || 0); usoOut += (d.usage.output_tokens || 0); }
      if (d.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: d.content }); continue; }
      break;
    }
    registrarUsoEva(usoIn, usoOut, modelo);
    const resposta = ((d && d.content) ? d.content : []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      || 'Desculpe, não consegui formular uma resposta. Pode reformular, ou falar com a gente pelo WhatsApp?';
    res.json({ resposta });
  } catch (e) { console.error('[chat]', e.message); res.status(502).json({ erro: 'Falha ao falar com o assistente. Tente novamente em instantes.' }); }
});

// Criar pedido: ALTERAÇÃO de reserva (só direta/WhatsApp), EVENTO ou SERVIÇO extra. Vai p/ aprovação do Augusto.
// 4a: pedido de manutenção do hóspede (site/app) → CHAMADO no hub (origem hospede, dedupe por refId).
// Mantém o pedido do hóspede (p/ "Meus pedidos") e liga os dois por refId 'pedidohosp:<id>'.
function criarChamadoDePedidoHosp(pedido, r) {
  try {
    const refId = 'pedidohosp:' + pedido.id;
    const chamados = lerJSON('manutencao-chamados.json', []);
    const ja = chamados.find(c => c.refId === refId);
    if (ja) return ja;
    const m = pedido.manutencao || {};
    const descPartes = [m.descricao || pedido.mensagem || '', m.local ? ('Local: ' + m.local) : '', m.urgencia ? ('Urgência: ' + m.urgencia) : ''].filter(Boolean);
    const titulo = String(m.descricao || pedido.mensagem || 'Manutenção solicitada pelo hóspede').slice(0, 120);
    const ch = {
      id: novoId(), titulo, casa: (r && r.imovel) || pedido.imovel || '', descricao: descPartes.join(' — '),
      tipo: '', status: 'aberto', tecnico: '', tecnicoTelefone: '', tecnicoId: '',
      comoResolvido: '', dataResolucao: '', despMaterial: 0, despMaoObra: 0, despDeslocamento: 0, custo: null,
      proximaVisita: '', proximaVisitaAgendada: '', periodicoFreqMeses: 0, periodicoRegistrado: false, ativoId: '',
      solicitante: (pedido.hospedeNome || 'Hóspede') + (pedido.reservaId ? ' — reserva ' + pedido.reservaId : ''),
      origem: 'hospede', refId, documentado: false, quem: 'app-hospede',
      criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(), concluidoEm: null,
    };
    chamados.push(ch); salvarJSON('manutencao-chamados.json', chamados);
    return ch;
  } catch (e) { console.error('[hosp->chamado]', e.message); return null; }
}

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
    // Unificação: pedido de manutenção do hóspede também abre um CHAMADO no hub de manutenção.
    if (tipo === 'manutencao') { const ch = criarChamadoDePedidoHosp(pedido, r); if (ch) { pedido.chamadoId = ch.id; salvarPedidosHosp(pedidos); } }
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
// Conta corrente do hóspede (extrato + pagar via Mercado Pago) → extraído para nucleo/hospede-financeiro.js (montado no fim).

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

};
