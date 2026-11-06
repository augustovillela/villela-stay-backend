// =====================================================================
// Villela CRM — CONVERSAS (leads que já conversaram com a gente).
// Recebe de `stays\conversas-leads.mjs` (local) só o RESULTADO da classificação:
// assunto principal, razão da última conversa, temperatura e contagens. NUNCA texto de
// mensagem — qualquer campo de texto no payload é descartado (ver LIMPOS).
// Quem decide é o Augusto: conversa de número/e-mail desconhecido nasce `sugerido`;
// só vira contato (`lead`) quando ele aprova. Quem já é contato entra como `lead` direto
// (é enriquecimento, não cadastro novo).
// =====================================================================
'use strict';
const { db, nowISO, novoId, j, transacao } = require('./db');
const Canais = require('./canais');
const { ASSUNTOS_LISTA, rotuloAssunto } = require('./conversas-classificador');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const T = (v) => s(v, 40);
const QUALIFICACOES = ['quente', 'morno', 'frio', 'cliente', 'perdido'];
const ORIGEM_DO_CANAL = { whatsapp: 'whatsapp', email: 'email', instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok', linkedin: 'outro' };

// identificador por canal; em redes sociais o export às vezes só traz o nome
function identificar(canal, valor, nome) {
  const ident = Canais.normalizar(canal, valor);
  if (ident) return ident;
  // WhatsApp também: o "Exportar conversa" de contato salvo traz só o nome, sem telefone
  if (['whatsapp', 'instagram', 'facebook', 'tiktok', 'linkedin'].includes(canal) && s(nome)) return 'nome:' + s(nome, 80).toLowerCase();
  return '';
}

// assuntos de assinante (captura.js): ids "c-…" definidos por ele em crm_config, mais o assunto GERAL
function assuntosValidos(tid) {
  const ok = new Set([...ASSUNTOS_LISTA, 'geral']);
  try { for (const a of require('./captura').assuntosDoTenant(T(tid))) ok.add(a.id); } catch (_) { /* sem config */ }
  return ok;
}
function rotulos(tid) {
  const m = {};
  try { for (const a of require('./captura').assuntosDoTenant(T(tid))) m[a.id] = a.rotulo; } catch (_) { /* sem config */ }
  return (id) => m[id] || rotuloAssunto(id);
}

const Conversas = {
  ASSUNTOS_LISTA, QUALIFICACOES,

  /** itens: [{canal, identificador, nome, assunto, razao, razao_rotulo, situacao, qualificacao, confianca, evidencias, total, minhas, deles, primeira_em, ultima_em, ultima_de_mim}] */
  ingerir(tid, itens, fonte = 'local') {
    if (!Array.isArray(itens)) throw new Error('Envie uma lista de conversas em "itens".');
    if (itens.length > 2000) throw new Error('Máximo de 2000 conversas por envio — divida o arquivo.');
    let novas = 0, atualizadas = 0, ignoradas = 0, vinculadas = 0;
    const validos = assuntosValidos(tid);
    transacao(() => {
      for (const it of itens) {
        const canal = s(it.canal, 20);
        const ident = Canais.CANAIS[canal] ? identificar(canal, it.identificador, it.nome) : '';
        if (!ident || !it.ultima_em) { ignoradas++; continue; }
        const assunto = validos.has(it.assunto) ? it.assunto : '';
        if (!assunto) { ignoradas++; continue; } // só vira lista o que tem assunto comercial
        const dono = ident.startsWith('nome:') ? null : Canais.contatoPorCanal(tid, canal, ident);
        const vals = {
          nome: s(it.nome, 120), assunto, assuntos: j.str((Array.isArray(it.assuntos) ? it.assuntos : []).slice(0, 3).map(a => ({ assunto: s(a.assunto, 20), pontos: Number(a.pontos) || 0 }))),
          razao: s(it.razao, 30), razao_rotulo: s(it.razao_rotulo, 80), situacao: s(it.situacao, 20),
          qualificacao: QUALIFICACOES.includes(it.qualificacao) ? it.qualificacao : 'frio',
          confianca: Math.max(0, Math.min(1, Number(it.confianca) || 0)),
          evidencias: j.str((Array.isArray(it.evidencias) ? it.evidencias : []).slice(0, 6).map(e => s(e, 30))),
          total: Math.max(0, Number(it.total) | 0), minhas: Math.max(0, Number(it.minhas) | 0), deles: Math.max(0, Number(it.deles) | 0),
          primeira_em: s(it.primeira_em, 30), ultima_em: s(it.ultima_em, 30), ultima_de_mim: it.ultima_de_mim ? 1 : 0,
        };
        const ex = db.prepare('SELECT id, status, contato_id FROM crm_conversas WHERE tenant_id = ? AND canal = ? AND identificador = ?').get(T(tid), canal, ident);
        if (ex) {
          db.prepare(`UPDATE crm_conversas SET nome=?, assunto=?, assuntos=?, razao=?, razao_rotulo=?, situacao=?, qualificacao=?, confianca=?, evidencias=?, total=?, minhas=?, deles=?, primeira_em=?, ultima_em=?, ultima_de_mim=?, contato_id=?, fonte=?, atualizado_em=? WHERE id=?`)
            .run(vals.nome || '', vals.assunto, vals.assuntos, vals.razao, vals.razao_rotulo, vals.situacao, vals.qualificacao, vals.confianca, vals.evidencias, vals.total, vals.minhas, vals.deles, vals.primeira_em, vals.ultima_em, vals.ultima_de_mim, ex.contato_id || dono || '', s(fonte, 40), nowISO(), ex.id);
          atualizadas++;
        } else {
          const status = dono ? 'lead' : 'sugerido'; // quem já é contato não precisa de aprovação
          db.prepare(`INSERT INTO crm_conversas (id, tenant_id, canal, identificador, contato_id, nome, assunto, assuntos, razao, razao_rotulo, situacao, qualificacao, confianca, evidencias, total, minhas, deles, primeira_em, ultima_em, ultima_de_mim, status, fonte, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(novoId(), T(tid), canal, ident, dono || '', vals.nome, vals.assunto, vals.assuntos, vals.razao, vals.razao_rotulo, vals.situacao, vals.qualificacao, vals.confianca, vals.evidencias, vals.total, vals.minhas, vals.deles, vals.primeira_em, vals.ultima_em, vals.ultima_de_mim, status, s(fonte, 40), nowISO(), nowISO());
          novas++; if (dono) vinculadas++;
        }
      }
    });
    return { novas, atualizadas, ignoradas, vinculadas, recebidas: itens.length };
  },

  listar(tid, q = {}) {
    let sql = `SELECT v.*, c.nome AS contato_nome FROM crm_conversas v LEFT JOIN crm_contatos c ON c.id = v.contato_id WHERE v.tenant_id = ?`;
    const args = [T(tid)];
    const status = ['sugerido', 'lead', 'descartado'].includes(q.status) ? q.status : '';
    if (status) { sql += ' AND v.status = ?'; args.push(status); } else if (q.status !== 'todos') sql += " AND v.status != 'descartado'";
    if (q.assunto) { sql += ' AND v.assunto = ?'; args.push(s(q.assunto, 20)); }
    if (q.canal) { sql += ' AND v.canal = ?'; args.push(s(q.canal, 20)); }
    if (q.qualificacao) { sql += ' AND v.qualificacao = ?'; args.push(s(q.qualificacao, 20)); }
    if (q.razao) { sql += ' AND v.razao = ?'; args.push(s(q.razao, 30)); }
    if (q.dias_min) { sql += ' AND v.ultima_em <= ?'; args.push(new Date(Date.now() - Number(q.dias_min) * 86400000).toISOString()); }
    if (q.dias_max) { sql += ' AND v.ultima_em >= ?'; args.push(new Date(Date.now() - Number(q.dias_max) * 86400000).toISOString()); }
    if (q.busca) { sql += ' AND (v.nome LIKE ? OR v.identificador LIKE ?)'; const b = `%${s(q.busca, 80)}%`; args.push(b, b); }
    sql += ' ORDER BY v.ultima_em DESC LIMIT ?'; args.push(Math.min(Number(q.limite) || 300, 1000));
    const rot = rotulos(tid);
    return db.prepare(sql).all(...args).map(r => ({
      ...r, assuntos: j.parse(r.assuntos, []), evidencias: j.parse(r.evidencias, []), assunto_rotulo: rot(r.assunto),
      dias_parado: r.ultima_em ? Math.max(0, Math.floor((Date.now() - Date.parse(r.ultima_em)) / 86400000)) : null,
    }));
  },

  /** contagem por assunto × qualificação (conversas não descartadas) — base para decidir o que entra em campanha */
  resumo(tid) {
    const rows = db.prepare(`SELECT assunto, qualificacao, status, COUNT(*) n FROM crm_conversas WHERE tenant_id = ? AND status != 'descartado' GROUP BY assunto, qualificacao, status`).all(T(tid));
    const por = {}; const rot = rotulos(tid);
    for (const r of rows) {
      const a = por[r.assunto] || (por[r.assunto] = { assunto: r.assunto, rotulo: rot(r.assunto), total: 0, sugeridas: 0, leads: 0, por_qualificacao: {} });
      a.total += r.n; if (r.status === 'sugerido') a.sugeridas += r.n; else a.leads += r.n;
      a.por_qualificacao[r.qualificacao] = (a.por_qualificacao[r.qualificacao] || 0) + r.n;
    }
    return Object.values(por).sort((x, y) => y.total - x.total);
  },

  /** acao: 'lead' (aprova e cria/vincula o contato) | 'descartar' | 'sugerir' (volta para a fila) */
  decidir(tid, id, acao, autor) {
    const v = db.prepare('SELECT * FROM crm_conversas WHERE tenant_id = ? AND id = ?').get(T(tid), T(id));
    if (!v) throw new Error('Conversa não encontrada.');
    if (acao === 'descartar') { db.prepare("UPDATE crm_conversas SET status = 'descartado', atualizado_em = ? WHERE id = ?").run(nowISO(), v.id); return { ok: true, status: 'descartado' }; }
    if (acao === 'sugerir') { db.prepare("UPDATE crm_conversas SET status = 'sugerido', atualizado_em = ? WHERE id = ?").run(nowISO(), v.id); return { ok: true, status: 'sugerido' }; }
    if (acao !== 'lead') throw new Error('Ação inválida.');
    const app = require('./app-repo'); // carregado aqui para evitar dependência circular
    let contatoId = v.contato_id;
    if (!contatoId) {
      const base = { nome: v.nome || (v.identificador.startsWith('nome:') ? v.identificador.slice(5) : v.identificador), origem: ORIGEM_DO_CANAL[v.canal] || 'outro',
        tags: ['conversa-' + v.assunto], interesse: rotulos(tid)(v.assunto), primeira_mensagem: v.razao_rotulo, fonte_canal: 'conversa' };
      if (v.identificador.startsWith('nome:')) { /* sem número/perfil: o lead entra só pelo nome */ }
      else if (v.canal === 'whatsapp') base.telefone = v.identificador;
      else if (v.canal === 'email') base.email = v.identificador;
      else base[v.canal] = v.identificador;
      contatoId = app.Contatos.criar(T(tid), base, autor || 'conversas').contato.id;
    }
    db.prepare("UPDATE crm_conversas SET status = 'lead', contato_id = ?, atualizado_em = ? WHERE id = ?").run(contatoId, nowISO(), v.id);
    app.Atividades.registrar(T(tid), { contato_id: contatoId, tipo: 'nota', canal: v.canal, texto: `Conversa classificada: ${rotulos(tid)(v.assunto)} · ${v.razao_rotulo} (${v.qualificacao}) · última em ${String(v.ultima_em).slice(0, 10)}`, autor: autor || 'conversas' });
    return { ok: true, status: 'lead', contato_id: contatoId };
  },
};

module.exports = Conversas;
