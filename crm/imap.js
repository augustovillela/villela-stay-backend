// =====================================================================
// Villela CRM — LEITOR IMAP (somente leitura) para a captura "dentro / e-mail" do assinante.
// Sem dependência: só `node:tls`. Porta do leitor local `stays\gmail-imap.mjs`, em módulo.
//
// - SOMENTE LEITURA: usa EXAMINE (nunca SELECT) e BODY.PEEK — não marca nada como lido, não apaga, não move.
// - Hosts em lista FECHADA (Gmail, Outlook/Office 365, Yahoo, iCloud, UOL): o assinante não digita endereço de servidor,
//   então não dá para apontar o servidor para rede interna (SSRF).
// - Senha de aplicativo (Gmail/Outlook/Yahoo exigem 2 fatores + senha de app). A senha vem do cofre, nunca em log ou erro.
// - Lê cabeçalho + o INÍCIO do texto (até 1.500 bytes) de cada mensagem, EM MEMÓRIA; o chamador classifica e descarta.
// =====================================================================
'use strict';
const tls = require('node:tls');

const HOSTS = {
  gmail: { host: 'imap.gmail.com', rotulo: 'Gmail', todos: true },
  outlook: { host: 'outlook.office365.com', rotulo: 'Outlook / Microsoft 365' },
  yahoo: { host: 'imap.mail.yahoo.com', rotulo: 'Yahoo' },
  icloud: { host: 'imap.mail.me.com', rotulo: 'iCloud' },
  uol: { host: 'imap.uol.com.br', rotulo: 'UOL' },
};
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dataImap = (d) => `${String(d.getUTCDate()).padStart(2, '0')}-${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
const aspas = (t) => '"' + String(t).replace(/(["\\])/g, '\\$1') + '"';
const erro = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };

// ---- decodificação mínima ----
function decodeQP(s) { return Buffer.from(s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1'); }
function palavras(s) {
  return String(s || '').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
    try { const b = enc.toLowerCase() === 'b' ? Buffer.from(txt, 'base64') : decodeQP(txt.replace(/_/g, ' ')); return b.toString(/utf-?8/i.test(cs) ? 'utf8' : 'latin1'); } catch (_x) { return txt; }
  }).replace(/\s+/g, ' ').trim();
}
function cab(head, nome) {
  const m = String(head).match(new RegExp('^' + nome + ':[ \\t]*([\\s\\S]*?)(?=\\r?\\n[^ \\t]|$)', 'im'));
  return m ? m[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
}
const enderecos = (h) => [...String(h || '').matchAll(/([^<",;]*?)\s*<?([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})>?/g)].map((m) => ({ nome: m[1].replace(/["']/g, '').trim(), email: m[2].toLowerCase() }));
/** Início do texto: tira fronteiras/cabeçalhos MIME, decodifica QP, ignora base64 e HTML pesado. Só serve para classificar. */
function limpaTexto(raw, head) {
  const ct = cab(head, 'Content-Type'), cte = cab(head, 'Content-Transfer-Encoding');
  let t = String(raw || '');
  if (/base64/i.test(cte)) return '';
  if (/quoted-printable/i.test(cte)) t = decodeQP(t).toString('utf8');
  t = t.split(/\r?\n/).filter((l) => !/^(--|content-|mime-|>)/i.test(l) && !/^[A-Za-z0-9+/=]{60,}$/.test(l)).join(' ');
  if (/html/i.test(ct) || /<(html|body|div|p|br)\b/i.test(t)) t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ');
  return t.replace(/\s+/g, ' ').trim().slice(0, 600);
}

/** Cliente IMAP mínimo: comandos com tag, respostas com literais {N}. */
class Sessao {
  constructor(sock, tempoMs = 45000) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.n = 0; this.espera = null; this.fechada = false;
    sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.tenta(); });
    sock.on('error', (e) => this.falha(erro('Não consegui conectar ao servidor de e-mail.', 502)));
    sock.on('close', () => { if (this.espera) this.falha(erro('O servidor de e-mail encerrou a conexão.', 502)); });
    if (sock.setTimeout) { sock.setTimeout(tempoMs); sock.on('timeout', () => this.falha(erro('O servidor de e-mail demorou demais para responder.', 504))); }
  }
  falha(e) { this.fechada = true; const w = this.espera; this.espera = null; if (w) w.rej(e); else this.erroPendente = e; }
  fimDaResposta(tag) {
    const b = this.buf, tb = Buffer.from(tag + ' '); let i = 0;
    while (i < b.length) {
      const eol = b.indexOf('\r\n', i); if (eol === -1) return -1;
      const linha = b.subarray(i, eol); const m = linha.toString('latin1').match(/\{(\d+)\}$/);
      if (m) { const fim = eol + 2 + Number(m[1]); if (b.length < fim) return -1; i = fim; continue; }
      if (linha.length >= tb.length && linha.subarray(0, tb.length).equals(tb)) return eol + 2;
      i = eol + 2;
    }
    return -1;
  }
  tenta() {
    if (!this.espera) return;
    const fim = this.fimDaResposta(this.espera.tag); if (fim === -1) return;
    const resp = this.buf.subarray(0, fim); this.buf = this.buf.subarray(fim);
    const w = this.espera; this.espera = null; w.res(resp);
  }
  saudacao() {
    return new Promise((res, rej) => {
      const chk = () => { if (this.erroPendente) return rej(this.erroPendente); const e = this.buf.indexOf('\r\n'); if (e !== -1) { this.buf = this.buf.subarray(e + 2); res(); } else setTimeout(chk, 15); };
      chk();
    });
  }
  cmd(linha) {
    return new Promise((res, rej) => {
      if (this.fechada) return rej(this.erroPendente || erro('Conexão encerrada.', 502));
      const tag = 'a' + (++this.n); this.espera = { tag, res, rej };
      this.sock.write(tag + ' ' + linha + '\r\n');
    }).then((r) => ({ tag: 'a' + this.n, r }));
  }
  fechar() { try { this.sock.end(); } catch (_) { /* já fechado */ } }
}
const ok = (x) => new RegExp('(^|\\r\\n)' + x.tag + ' OK', 'i').test(x.r.toString('latin1'));
function literais(resp) { // todos os literais {N}\r\n<N bytes>, em ordem
  const out = []; const s = resp.toString('latin1'); const re = /\{(\d+)\}\r\n/g; let m;
  while ((m = re.exec(s))) { const ini = m.index + m[0].length; out.push(resp.subarray(ini, ini + Number(m[1]))); re.lastIndex = ini + Number(m[1]); }
  return out;
}

/**
 * Lê as mensagens recentes. Devolve [{t, de, deNome, para[], assunto, texto, auto}] — o mesmo formato do leitor de .mbox.
 * `opcoes.conectar(host)` é injetável (testes); o padrão abre TLS na 993 do host da lista fechada.
 */
async function lerCaixa({ provedor, usuario, senha, dias = 90, max = 500, prazoMs = 240000 } = {}, opcoes = {}) {
  const h = HOSTS[provedor]; if (!h) throw erro('Provedor de e-mail não suportado.');
  if (!usuario || !senha || /[\r\n]/.test(usuario + senha)) throw erro('Informe o e-mail e a senha de aplicativo.');
  const conectar = opcoes.conectar || ((host) => tls.connect({ host, port: 993, servername: host }));
  const limite = Date.now() + prazoMs;
  const s = new Sessao(conectar(h.host), 45000);
  try {
    await s.saudacao();
    const lg = await s.cmd(`LOGIN ${aspas(usuario)} ${aspas(senha)}`);
    if (!ok(lg)) throw erro('O servidor recusou o login. Use uma SENHA DE APLICATIVO (com verificação em duas etapas) e confira se o IMAP está ativado na conta.', 401);
    if (opcoes.soTestar) { await s.cmd('LOGOUT').catch(() => {}); return { ok: true }; }
    // pastas: Gmail → "Todos os e-mails" (\All, recebidos e enviados); outros → Entrada + Enviados (\Sent)
    const lista = (await s.cmd('LIST "" "*"')).r.toString('latin1').split('\r\n');
    const nomeDe = (l) => { const m = l && l.match(/"((?:[^"\\]|\\.)*)"\s*$/); return m ? m[1] : ''; };
    const pastas = [];
    if (h.todos) { const t = nomeDe(lista.find((l) => /\\All\b/.test(l))); if (t) pastas.push(t); }
    if (!pastas.length) { pastas.push('INBOX'); const e = nomeDe(lista.find((l) => /\\Sent\b/.test(l))); if (e) pastas.push(e); }
    const desde = dataImap(new Date(Date.now() - Math.max(1, Math.min(365, dias)) * 864e5));
    const msgs = [];
    for (const pasta of pastas) {
      const ex = await s.cmd(`EXAMINE ${aspas(pasta)}`); // somente leitura
      if (!ok(ex)) continue;
      const sr = await s.cmd(`UID SEARCH SINCE ${desde}`);
      const sm = sr.r.toString('latin1').match(/\* SEARCH([0-9 ]*)/i);
      let uids = sm ? sm[1].trim().split(/\s+/).filter(Boolean) : [];
      if (uids.length > max) uids = uids.slice(-max);
      for (const uid of uids) {
        if (Date.now() > limite) break;
        const f = await s.cmd(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE AUTO-SUBMITTED PRECEDENCE LIST-UNSUBSCRIBE CONTENT-TYPE CONTENT-TRANSFER-ENCODING)] BODY.PEEK[TEXT]<0.1500>)`);
        const [head, corpo] = literais(f.r);
        if (!head) continue;
        const hs = head.toString('latin1');
        const de = enderecos(palavras(cab(hs, 'From')))[0]; const t = Date.parse(cab(hs, 'Date'));
        if (!de || !Number.isFinite(t)) continue;
        msgs.push({ t, de: de.email, deNome: de.nome, para: enderecos(palavras(cab(hs, 'To')) + ',' + palavras(cab(hs, 'Cc'))).map((x) => x.email),
          assunto: palavras(cab(hs, 'Subject')), texto: limpaTexto(corpo ? corpo.toString('latin1') : '', hs),
          auto: !!cab(hs, 'List-Unsubscribe') || /auto-/i.test(cab(hs, 'Auto-Submitted')) || /bulk|list|junk/i.test(cab(hs, 'Precedence')) });
      }
    }
    await s.cmd('LOGOUT').catch(() => {});
    return { mensagens: msgs, pastas: pastas.length };
  } finally { s.fechar(); }
}
const testarLogin = (c, o = {}) => lerCaixa(c, { ...o, soTestar: true });

module.exports = { HOSTS, lerCaixa, testarLogin, literais, palavras, limpaTexto };
