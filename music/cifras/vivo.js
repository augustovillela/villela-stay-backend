// =====================================================================
// Musique Cifras — SESSÃO AO VIVO / MODO MAESTRO.
//
// O maestro conduz; cada integrante recebe a mesma POSIÇÃO musical e
// mantém a própria visão (instrumento, fonte, transposição pessoal).
//
// Por que SSE (Server-Sent Events) e não WebSocket: o fluxo é de mão
// única (maestro → banda); comando sobe por POST comum, com a mesma
// autenticação e o mesmo rate limit do resto da API. SSE reconecta
// sozinho no navegador e manda `Last-Event-ID` — o servidor devolve
// exatamente os eventos perdidos, em ordem. Sem dependência nova.
//
// TRÊS REGRAS DE PALCO:
//   1. COMANDO É IDEMPOTENTE: o botão do maestro pode ser apertado duas
//      vezes com rede ruim; a `chave_idem` garante um efeito só.
//   2. ESTADO É REPRODUZÍVEL: o estado atual = estado inicial + eventos
//      em ordem de `seq`. Quem chega tarde recebe o estado; quem caiu
//      recebe a diferença.
//   3. DESCONEXÃO NUNCA BLOQUEIA A CIFRA LOCAL: o cliente toca pelo
//      pacote offline; a sessão só diz ONDE a banda está.
//
// ⚠️ LIMITE REAL: os assinantes vivem na memória do processo. O
// villela-stay-backend roda UMA instância no Render, então funciona. Com
// mais de uma, o broadcast precisa de pub/sub (Redis) — registrado no
// ADR-0010. O estado e os eventos estão no banco, então nada se perde:
// só a entrega em tempo real ficaria restrita à instância.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, transacao, nowISO, novoId, j } = require('../db');
const repertorio = require('../repertorio');
const acesso = require('./acesso');
const { erro } = require('./acervo');

const assinantes = new Map();          // sessaoId → Set<{ res, usuario }>
const VALIDADE_H = 8;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O e 1/I: é lido em voz alta

function codigoNovo() {
  for (let k = 0; k < 20; k++) {
    let c = '';
    const b = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) c += ALFABETO[b[i] % ALFABETO.length];
    if (!db.prepare('SELECT 1 FROM sessoes_vivo WHERE codigo = ?').get(c)) return c;
  }
  throw erro('Não consegui gerar um código de sessão. Tente de novo.', 503);
}

const porId = (id) => db.prepare('SELECT * FROM sessoes_vivo WHERE id = ?').get(id) || null;
const ativa = (s) => s && !s.encerrada_em && s.expira_em > nowISO();

function itensDo(repId) {
  return db.prepare('SELECT id, obra_id, titulo_livre, intervalo FROM repertorio_itens WHERE repertorio_id = ? ORDER BY ordem').all(repId);
}

function podeConduzir(rep, usuario) {
  if (!rep) return false;
  if (rep.banda_id) return acesso.pode(rep.banda_id, usuario, 'conduzir_sessao');
  return rep.dono === usuario;
}

// ---------------------------------------------------------------------
// Estado: aplicar um evento é uma função PURA de (estado, evento).
// ---------------------------------------------------------------------
const TIPOS = ['ir_item', 'proximo', 'anterior', 'secao', 'repetir_secao', 'contagem', 'cue', 'rolagem', 'tom_emergencia',
  'concluir_item', 'pausar', 'retomar'];

function aplicar(estado, ev, itens) {
  const e = JSON.parse(JSON.stringify(estado));
  const p = ev.payload || {};
  const irPara = (idx) => {
    const i = Math.max(0, Math.min(itens.length - 1, idx));
    e.item_idx = i; e.item_id = itens[i] ? itens[i].id : ''; e.secao_id = ''; e.rolagem = { ...e.rolagem, ativa: false, posicao: 0 };
    e.cue = null; e.contagem = null;
  };
  switch (ev.tipo) {
    case 'ir_item': {
      const idx = p.item_id ? itens.findIndex((x) => x.id === p.item_id) : Number(p.idx);
      if (idx >= 0 && Number.isFinite(idx)) irPara(idx);
      break;
    }
    case 'proximo': irPara(e.item_idx + 1); break;
    case 'anterior': irPara(e.item_idx - 1); break;
    case 'secao': e.secao_id = String(p.secao_id || '').slice(0, 20); e.repetir = null; break;
    case 'repetir_secao': e.secao_id = String(p.secao_id || '').slice(0, 20); e.repetir = { secao_id: e.secao_id, vezes: Math.max(1, Math.min(8, Number(p.vezes) || 1)) }; break;
    case 'contagem': e.contagem = { tempos: Math.max(1, Math.min(8, Number(p.tempos) || 4)), bpm: Math.max(20, Math.min(300, Number(p.bpm) || 90)), inicio: ev.criado_em }; break;
    case 'cue': e.cue = p.texto ? { texto: String(p.texto).slice(0, 80), em: ev.criado_em } : null; break;
    case 'rolagem':
      e.rolagem = { ativa: !!p.ativa, velocidade: Math.max(1, Math.min(300, Number(p.velocidade) || (e.rolagem && e.rolagem.velocidade) || 30)),
        posicao: Math.max(0, Number(p.posicao) || 0), desde: ev.criado_em };
      break;
    case 'tom_emergencia':
      e.tom = { item_id: String(p.item_id || e.item_id), semitons: Math.max(-11, Math.min(11, Math.round(Number(p.semitons) || 0))), em: ev.criado_em };
      break;
    case 'concluir_item':
      if (e.item_id && e.concluidas.indexOf(e.item_id) < 0) e.concluidas.push(e.item_id);
      break;
    case 'pausar': e.pausado = true; e.rolagem = { ...e.rolagem, ativa: false }; break;
    case 'retomar': e.pausado = false; break;
    default: break;
  }
  return e;
}

const Vivo = {
  iniciar(usuario, repId) {
    const rep = repertorio.Repertorios.porId(repId);
    if (!rep) throw erro('Setlist não encontrado.', 404);
    if (!podeConduzir(rep, usuario)) throw erro('Só o maestro (ou a administração da banda) inicia a sessão ao vivo.', 403, { bloqueioDeDireitos: true });
    const existente = db.prepare("SELECT * FROM sessoes_vivo WHERE repertorio_id = ? AND encerrada_em = '' AND expira_em > ? ORDER BY iniciada_em DESC LIMIT 1").get(repId, nowISO());
    if (existente) return Vivo.snapshot(usuario, existente.id);
    const itens = itensDo(repId);
    const estado = { item_idx: 0, item_id: itens[0] ? itens[0].id : '', secao_id: '', repetir: null, contagem: null, cue: null,
      rolagem: { ativa: false, velocidade: 30, posicao: 0 }, tom: null, concluidas: [], pausado: false };
    const id = novoId();
    db.prepare(`INSERT INTO sessoes_vivo (id, repertorio_id, banda_id, maestro, codigo, estado, seq, iniciada_em, expira_em)
      VALUES (?,?,?,?,?,?,0,?,?)`).run(id, repId, rep.banda_id, usuario, codigoNovo(), JSON.stringify(estado), nowISO(),
      new Date(Date.now() + VALIDADE_H * 36e5).toISOString());
    Vivo._participar(id, usuario, '');
    return Vivo.snapshot(usuario, id);
  },

  /** Entrar pelo código (digitado ou lido do QR). */
  entrar(usuario, codigo, { instrumento = '' } = {}) {
    const s = db.prepare('SELECT * FROM sessoes_vivo WHERE codigo = ?').get(String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (!ativa(s)) throw erro('Sessão não encontrada ou encerrada.', 404);
    const rep = repertorio.Repertorios.porId(s.repertorio_id);
    const v = repertorio.Repertorios.podeVer(rep, usuario);
    if (!v.pode) throw erro('Esta sessão é de uma banda da qual você não faz parte.', 403, { bloqueioDeDireitos: true });
    Vivo._participar(s.id, usuario, instrumento);
    Vivo._emitirPresenca(s.id);
    return Vivo.snapshot(usuario, s.id);
  },

  _participar(sessaoId, usuario, instrumento) {
    db.prepare(`INSERT INTO sessao_participantes (sessao_id, usuario, instrumento, entrou_em, visto_em) VALUES (?,?,?,?,?)
      ON CONFLICT(sessao_id, usuario) DO UPDATE SET visto_em = excluded.visto_em, instrumento = CASE WHEN excluded.instrumento <> '' THEN excluded.instrumento ELSE instrumento END`)
      .run(sessaoId, usuario, String(instrumento || '').slice(0, 30), nowISO(), nowISO());
  },

  _exigirParticipante(usuario, s) {
    if (!s) throw erro('Sessão não encontrada.', 404);
    const rep = repertorio.Repertorios.porId(s.repertorio_id);
    if (!repertorio.Repertorios.podeVer(rep, usuario).pode) throw erro('Sem acesso a esta sessão.', 403, { bloqueioDeDireitos: true });
    return rep;
  },

  snapshot(usuario, sessaoId) {
    const s = porId(sessaoId);
    const rep = Vivo._exigirParticipante(usuario, s);
    return {
      sessao: { id: s.id, codigo: s.codigo, repertorio_id: s.repertorio_id, banda_id: s.banda_id, maestro: s.maestro,
        iniciada_em: s.iniciada_em, encerrada_em: s.encerrada_em, expira_em: s.expira_em, ativa: ativa(s) },
      sou_maestro: s.maestro === usuario || podeConduzir(rep, usuario),
      estado: j.parse(s.estado, {}), seq: s.seq,
      participantes: Vivo.presenca(s.id),
      servidor_em: Date.now(),
    };
  },

  presenca(sessaoId) {
    const limite = new Date(Date.now() - 45000).toISOString();
    return db.prepare('SELECT usuario, instrumento, entrou_em, visto_em FROM sessao_participantes WHERE sessao_id = ? ORDER BY entrou_em')
      .all(sessaoId).map((p) => ({ ...p, online: p.visto_em >= limite || conectado(sessaoId, p.usuario) }));
  },

  /**
   * Comando do maestro. `chave_idem` obrigatória: o mesmo comando
   * reenviado não se repete (devolve o seq já gravado).
   */
  comando(usuario, sessaoId, { tipo, payload = {}, chave_idem }) {
    const s = porId(sessaoId);
    const rep = Vivo._exigirParticipante(usuario, s);
    if (!ativa(s)) throw erro('A sessão já foi encerrada.', 409);
    if (!(s.maestro === usuario || podeConduzir(rep, usuario))) throw erro('Só o maestro conduz a sessão.', 403, { bloqueioDeDireitos: true });
    if (!TIPOS.includes(tipo)) throw erro('Comando desconhecido: ' + tipo);
    const chave = String(chave_idem || '').slice(0, 80);
    if (!chave) throw erro('Comando sem chave de idempotência.');
    const ja = db.prepare('SELECT seq FROM sessao_eventos WHERE sessao_id = ? AND chave_idem = ?').get(sessaoId, chave);
    if (ja) return { seq: ja.seq, repetido: true };
    let ev;
    transacao(() => {
      const atual = porId(sessaoId);
      const seq = atual.seq + 1;
      ev = { id: novoId(), sessao_id: sessaoId, seq, tipo, payload: payload || {}, autor: usuario, criado_em: nowISO() };
      const novo = aplicar(j.parse(atual.estado, {}), ev, itensDo(atual.repertorio_id));
      db.prepare(`INSERT INTO sessao_eventos (id, sessao_id, seq, tipo, payload, autor, chave_idem, criado_em) VALUES (?,?,?,?,?,?,?,?)`)
        .run(ev.id, sessaoId, seq, tipo, JSON.stringify(payload || {}), usuario, chave, ev.criado_em);
      db.prepare('UPDATE sessoes_vivo SET estado = ?, seq = ? WHERE id = ?').run(JSON.stringify(novo), seq, sessaoId);
      ev.estado = novo;
    });
    Vivo._emitir(sessaoId, { id: ev.seq, evento: 'comando', dados: { seq: ev.seq, tipo, payload: ev.payload, estado: ev.estado, em: ev.criado_em } });
    return { seq: ev.seq, estado: ev.estado };
  },

  encerrar(usuario, sessaoId) {
    const s = porId(sessaoId);
    const rep = Vivo._exigirParticipante(usuario, s);
    if (!(s.maestro === usuario || podeConduzir(rep, usuario))) throw erro('Só o maestro encerra a sessão.', 403);
    db.prepare('UPDATE sessoes_vivo SET encerrada_em = ? WHERE id = ?').run(nowISO(), sessaoId);
    Vivo._emitir(sessaoId, { id: s.seq, evento: 'encerrada', dados: { em: nowISO() } });
    const subs = assinantes.get(sessaoId);
    if (subs) { subs.forEach((a) => { try { a.res.end(); } catch (_) { /* já fechado */ } }); assinantes.delete(sessaoId); }
    return true;
  },

  /** Eventos depois de `seq` — o que o aparelho perdeu enquanto caiu. */
  eventosDesde(usuario, sessaoId, seq) {
    const s = porId(sessaoId);
    Vivo._exigirParticipante(usuario, s);
    return db.prepare('SELECT seq, tipo, payload, criado_em FROM sessao_eventos WHERE sessao_id = ? AND seq > ? ORDER BY seq LIMIT 500')
      .all(sessaoId, Math.max(0, Number(seq) || 0)).map((e) => ({ ...e, payload: j.parse(e.payload, {}) }));
  },

  // -------------------------- SSE --------------------------
  /** Abre o fluxo. Primeiro manda o que faltou (ou o estado inteiro). */
  assinar(usuario, sessaoId, req, res) {
    const s = porId(sessaoId);
    Vivo._exigirParticipante(usuario, s);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // no-transform: o middleware de compressão NÃO pode segurar o fluxo.
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();
    const escrever = (t) => { try { res.write(t); if (res.flush) res.flush(); } catch (_) { /* conexão caiu */ } };
    res.write('retry: 2000\n\n');
    const ultimo = Number(req.headers['last-event-id'] || req.query.desde || 0);
    if (ultimo && ultimo < s.seq && s.seq - ultimo <= 500) {
      Vivo.eventosDesde(usuario, sessaoId, ultimo).forEach((e) => {
        escrever(`id: ${e.seq}\nevent: comando\ndata: ${JSON.stringify({ seq: e.seq, tipo: e.tipo, payload: e.payload, em: e.criado_em, replay: true })}\n\n`);
      });
    }
    escrever(`id: ${s.seq}\nevent: estado\ndata: ${JSON.stringify(Vivo.snapshot(usuario, sessaoId))}\n\n`);
    const assinante = { res, usuario, escrever };
    if (!assinantes.has(sessaoId)) assinantes.set(sessaoId, new Set());
    assinantes.get(sessaoId).add(assinante);
    Vivo._participar(sessaoId, usuario, '');
    Vivo._emitirPresenca(sessaoId);
    const batida = setInterval(() => {
      escrever(`: batida ${Date.now()}\n\n`);
      try { db.prepare('UPDATE sessao_participantes SET visto_em = ? WHERE sessao_id = ? AND usuario = ?').run(nowISO(), sessaoId, usuario); } catch (_) { /* banco ocupado: a próxima batida grava */ }
    }, 15000);
    if (batida.unref) batida.unref();
    const fechar = () => {
      clearInterval(batida);
      const set = assinantes.get(sessaoId);
      if (set) { set.delete(assinante); if (!set.size) assinantes.delete(sessaoId); }
      Vivo._emitirPresenca(sessaoId);
    };
    req.on('close', fechar);
    return assinante;
  },

  _emitir(sessaoId, { id, evento, dados }) {
    const set = assinantes.get(sessaoId);
    if (!set) return 0;
    const txt = `id: ${id}\nevent: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
    set.forEach((a) => a.escrever(txt));
    return set.size;
  },

  _emitirPresenca(sessaoId) {
    const s = porId(sessaoId);
    if (!s) return;
    Vivo._emitir(sessaoId, { id: s.seq, evento: 'presenca', dados: { participantes: Vivo.presenca(sessaoId) } });
  },

  ativasDe(usuario) {
    const bandas = acesso.bandasDe(usuario).map((b) => b.id);
    const linhas = db.prepare(`SELECT sv.*, r.nome AS setlist FROM sessoes_vivo sv JOIN repertorios r ON r.id = sv.repertorio_id
      WHERE sv.encerrada_em = '' AND sv.expira_em > ? ORDER BY sv.iniciada_em DESC LIMIT 50`).all(nowISO());
    return linhas.filter((l) => l.maestro === usuario || (l.banda_id && bandas.includes(l.banda_id)))
      .map((l) => ({ id: l.id, codigo: l.codigo, setlist: l.setlist, repertorio_id: l.repertorio_id, iniciada_em: l.iniciada_em, sou_maestro: l.maestro === usuario }));
  },

  metricas() {
    let conexoes = 0; assinantes.forEach((s) => { conexoes += s.size; });
    return { sessoes_com_assinantes: assinantes.size, conexoes,
      ativas: db.prepare("SELECT COUNT(*) n FROM sessoes_vivo WHERE encerrada_em = '' AND expira_em > ?").get(nowISO()).n };
  },
};

function conectado(sessaoId, usuario) {
  const set = assinantes.get(sessaoId);
  if (!set) return false;
  for (const a of set) if (a.usuario === usuario) return true;
  return false;
}

module.exports = { Vivo, aplicar, TIPOS };
