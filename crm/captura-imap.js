// =====================================================================
// Villela CRM — captura "dentro / e-mail" por IMAP (Fase B). O assinante guarda a caixa dele (provedor + e-mail +
// SENHA DE APLICATIVO) no cofre e pede a leitura; o servidor lê em modo SOMENTE LEITURA (imap.js), classifica por
// regras e descarta o texto — o mesmo caminho do .mbox (`classificarEmails`). Só ficam metadados, tudo "sugerido".
// A leitura roda em segundo plano (pode levar minutos); a tela acompanha por `status`.
// =====================================================================
'use strict';
const Cofre = require('./cofre');
const imap = require('./imap');
const Captura = require('./captura');
const { montarAssuntos } = require('./conversas-classificador');

const erro = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };
const _jobs = new Map(); // tenant → último trabalho

function caixa(tid) {
  const bruto = Cofre.revelar(tid, 'imap'); if (!bruto) return null;
  try { const j = JSON.parse(Buffer.from(bruto, 'base64').toString('utf8')); return j && j.p && j.u && j.s ? { provedor: j.p, usuario: j.u, senha: j.s } : null; } catch (_) { return null; }
}
function estado(tid) {
  const c = caixa(tid); const j = _jobs.get(tid);
  return { cadastrada: !!c, provedor: c ? c.provedor : '', usuario: c ? c.usuario : '', provedores: Object.entries(imap.HOSTS).map(([id, h]) => ({ id, rotulo: h.rotulo })), trabalho: j ? { estado: j.estado, iniciado_em: j.iniciado_em, resultado: j.resultado || null, erro: j.erro || '' } : null };
}
function guardar(tid, { provedor, usuario, senha }, quem = '') {
  if (!imap.HOSTS[provedor]) throw erro('Escolha o provedor de e-mail.');
  const u = String(usuario || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(u)) throw erro('Informe o endereço de e-mail completo.');
  const p = String(senha || '').replace(/\s/g, ''); // senhas de app do Google vêm com espaços
  if (p.length < 8 || /[\r\n]/.test(p)) throw erro('Informe a senha de aplicativo (não a senha normal da conta).');
  Cofre.guardar(tid, 'imap', Buffer.from(JSON.stringify({ p: provedor, u, s: p })).toString('base64'), quem);
  return estado(tid);
}
async function testar(tid, opcoes = {}) {
  const c = caixa(tid); if (!c) throw erro('Cadastre a caixa de e-mail primeiro.');
  try { await imap.testarLogin(c, opcoes); Cofre.marcarTestada(tid, 'imap'); return { ok: true }; }
  catch (e) { return { ok: false, motivo: e.message }; } // mensagens do imap.js são fixas: nunca ecoam a senha
}
/** Inicia a leitura em segundo plano. Devolve na hora; `status` mostra o andamento. */
function iniciar(tid, { dias = 90, max = 500 } = {}, opcoes = {}) {
  const c = caixa(tid); if (!c) throw erro('Cadastre a caixa de e-mail primeiro.');
  const atual = _jobs.get(tid);
  if (atual && atual.estado === 'lendo' && Date.now() - Date.parse(atual.iniciado_em) < 10 * 60000) throw erro('Já há uma leitura em andamento.');
  const job = { estado: 'lendo', iniciado_em: new Date().toISOString() };
  _jobs.set(tid, job);
  const concluir = (async () => {
    try {
      const { mensagens, pastas } = await imap.lerCaixa({ ...c, dias: Math.max(1, Math.min(365, Number(dias) || 90)), max: Math.max(1, Math.min(1500, Number(max) || 500)) }, opcoes);
      job.estado = 'classificando';
      const tab = montarAssuntos(Captura.assuntosDoTenant(tid));
      const r = Captura.classificarEmails(mensagens, c.usuario, tab);
      const ing = require('./conversas').ingerir(tid, r.itens, 'imap:email');
      job.resultado = { lidas: mensagens.length, pastas, ignoradas_automaticos: r.ignoradas_automaticos, conversas_com_assunto: r.itens.length, ingestao: ing };
      job.estado = 'pronto';
    } catch (e) { job.estado = 'erro'; job.erro = e.message; }
    mensagensLiberadas(job);
  })();
  job.promessa = concluir; // os testes aguardam por aqui
  return { ok: true, iniciada: true };
}
function mensagensLiberadas(job) { /* o texto das mensagens só existiu dentro da função acima; nada fica no job */ void job; }
const aguardar = (tid) => { const j = _jobs.get(tid); return j && j.promessa ? j.promessa : Promise.resolve(); };

module.exports = { estado, guardar, testar, iniciar, aguardar, caixa };
