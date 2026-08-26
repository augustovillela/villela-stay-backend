// =====================================================================
// Voz — leitura e escrita de pedidos e auditoria.
//
// Um pedido é criado ANTES de qualquer interpretação e nunca é apagado,
// mesmo quando o cérebro não entende. É o que permite responder, depois,
// à pergunta que mais importa num assistente por voz: "o que eu pedi e o
// que ele achou que eu pedi?".
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId, j } = require('./db');

// ---------------------------------------------------------------------
// Auditoria — append-only. Nunca é reescrita; status muda no pedido.
// ---------------------------------------------------------------------
function auditar(evento, { pedidoId = '', atorTipo = 'voz', ator = '', detalhe = {} } = {}) {
  db.prepare(`INSERT INTO auditoria (id, pedido_id, evento, ator_tipo, ator, detalhe, criado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(novoId(), pedidoId || '', evento, atorTipo, ator || '', j.str(detalhe || {}), nowISO());
}

const auditoriaDo = (pedidoId) =>
  db.prepare('SELECT * FROM auditoria WHERE pedido_id = ? ORDER BY criado_em ASC').all(pedidoId);

// ---------------------------------------------------------------------
// Idempotência (trava 6)
//
// Voz repete pedido o tempo todo: o reconhecimento falha, a pessoa
// repete, o app reenvia. Dois "põe papel higiênico na lista" em 90
// segundos são QUASE CERTAMENTE o mesmo pedido — mas dois no mesmo dia
// não são. Por isso a janela entra na chave: o balde de tempo distingue
// repetição de reincidência sem precisar adivinhar a intenção.
// ---------------------------------------------------------------------
const JANELA_MS = Number(process.env.VOZ_JANELA_IDEM_MS || 90000);

function chaveIdem(texto, canal = '') {
  const normal = String(texto || '').toLowerCase().normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normal) return '';
  const balde = Math.floor(Date.now() / JANELA_MS);
  return crypto.createHash('sha256').update(`${canal}|${balde}|${normal}`).digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------
const hidratar = (p) => (p ? { ...p, parametros: j.parse(p.parametros, {}), resultado: j.parse(p.resultado, null) } : null);

/**
 * Cria o pedido. Devolve `{ pedido, repetido }` — `repetido: true`
 * quando a chave de idempotência já existia, e aí devolve o ORIGINAL.
 *
 * ⚠️ Repetição não é erro: quem falou de novo merece a mesma resposta,
 * não uma recusa nem uma segunda compra.
 */
function criar({ canal = 'whatsapp', ator = '', texto = '', transcrito = false, modo = 'executar', idem = null } = {}) {
  const chave = idem === null ? chaveIdem(texto, canal) : String(idem || '');
  if (chave) {
    const existente = db.prepare('SELECT * FROM pedidos WHERE chave_idem = ?').get(chave);
    if (existente) return { pedido: hidratar(existente), repetido: true };
  }
  const id = novoId();
  try {
    db.prepare(`INSERT INTO pedidos (id, canal, ator, texto_original, transcrito, modo, status, chave_idem, criado_em)
                VALUES (?, ?, ?, ?, ?, ?, 'recebido', ?, ?)`)
      .run(id, canal, ator || '', String(texto || ''), transcrito ? 1 : 0, modo, chave, nowISO());
  } catch (e) {
    // Corrida: outra requisição gravou a mesma chave entre o SELECT e o
    // INSERT. O índice único é a garantia real — aqui só devolvemos o
    // vencedor, que é o comportamento correto para o usuário.
    if (chave && /UNIQUE|constraint/i.test(String(e.message))) {
      const existente = db.prepare('SELECT * FROM pedidos WHERE chave_idem = ?').get(chave);
      if (existente) return { pedido: hidratar(existente), repetido: true };
    }
    throw e;
  }
  auditar('pedido.recebido', { pedidoId: id, ator, detalhe: { canal, transcrito: !!transcrito, modo } });
  return { pedido: hidratar(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)), repetido: false };
}

const porId = (id) => hidratar(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id));

function atualizar(id, campos = {}) {
  const permitidos = ['acao', 'parametros', 'nivel', 'status', 'fala', 'resultado', 'erro',
    'decidido_em', 'concluido_em'];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(campos)) {
    if (!permitidos.includes(k)) continue;
    sets.push(`${k} = ?`);
    vals.push((k === 'parametros' || k === 'resultado') && typeof v !== 'string' ? j.str(v) : (v == null ? '' : v));
  }
  if (!sets.length) return porId(id);
  vals.push(id);
  db.prepare(`UPDATE pedidos SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return porId(id);
}

function listar({ limite = 50, status = null } = {}) {
  const lim = Math.min(Number(limite) || 50, 200);
  const linhas = status
    ? db.prepare('SELECT * FROM pedidos WHERE status = ? ORDER BY criado_em DESC LIMIT ?').all(status, lim)
    : db.prepare('SELECT * FROM pedidos ORDER BY criado_em DESC LIMIT ?').all(lim);
  return linhas.map(hidratar);
}

/** Contagem por status — alimenta o painel e o selftest. */
function resumo() {
  const linhas = db.prepare('SELECT status, COUNT(*) AS n FROM pedidos GROUP BY status').all();
  const r = {};
  for (const l of linhas) r[l.status] = l.n;
  return r;
}

module.exports = { auditar, auditoriaDo, chaveIdem, criar, porId, atualizar, listar, resumo, JANELA_MS };
