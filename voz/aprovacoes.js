// =====================================================================
// Voz — AUTORIZAÇÃO (trava 3 do plano).
//
// A decisão do Augusto (25/08/2026), e o porquê dela:
//   autorização é CLIQUE EM SESSÃO AUTENTICADA, nunca segredo digitado
//   num chat. Senha falada ou digitada no WhatsApp fica gravada no
//   histórico da conversa, no log do Make e na transcrição — três
//   lugares que não são cofre — e ainda por cima vazaria justamente
//   pelo canal que autoriza.
//
// Então o WhatsApp carrega só duas coisas: o resumo de uma linha e um
// LINK. O link não autoriza nada sozinho: ele abre uma página do Portal
// Staff que exige a sessão do staff. Quem autoriza é a sessão; o token
// só diz DE QUAL PEDIDO se trata.
//
// Três propriedades que o desenho precisa ter:
//   1. o banco guarda o HASH do token, nunca o token — quem lê o banco
//      não consegue aprovar nada;
//   2. uso ÚNICO, marcado ANTES de executar (dois cliques simultâneos
//      não podem gastar a mesma aprovação duas vezes);
//   3. validade curta — uma autorização esquecida no WhatsApp de ontem
//      não pode valer amanhã.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');

const TTL_MIN = Number(process.env.VOZ_APROVACAO_TTL_MIN || 15);

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * Comparação em tempo constante. Aqui a busca é por hash (índice único),
 * então o vazamento por tempo é pequeno — mas o custo de fazer certo
 * também é, e este é o arquivo em que a disciplina importa.
 */
function tokensIguais(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Cria a aprovação pendente de um pedido. Devolve `{ id, token, expiraEm }`
 * — o token em claro sai daqui UMA vez, para virar link; depois só existe
 * o hash.
 */
function criar(pedidoId, { ttlMin = TTL_MIN } = {}) {
  const pedido = repo.porId(pedidoId);
  if (!pedido) throw new Error('aprovacoes.criar: pedido inexistente.');
  const token = crypto.randomBytes(24).toString('base64url');
  const expiraEm = new Date(Date.now() + Math.max(1, Number(ttlMin) || TTL_MIN) * 60000).toISOString();
  const id = novoId();
  db.prepare(`INSERT INTO aprovacoes (id, pedido_id, token_hash, expira_em, criado_em)
              VALUES (?, ?, ?, ?, ?)`)
    .run(id, pedidoId, hash(token), expiraEm, nowISO());
  repo.atualizar(pedidoId, { status: 'aguardando_aprovacao' });
  repo.auditar('aprovacao.solicitada', {
    pedidoId, atorTipo: 'sistema', detalhe: { expiraEm, nivel: pedido.nivel },
  });
  return { id, token, expiraEm };
}

/** Estado de um token, sem consumi-lo — é o que a PÁGINA usa para
 *  desenhar o que vai acontecer antes de haver clique. */
function consultar(token) {
  const linha = db.prepare('SELECT * FROM aprovacoes WHERE token_hash = ?').get(hash(token || ''));
  if (!linha) return { ok: false, motivo: 'inexistente' };
  if (!tokensIguais(hash(token), linha.token_hash)) return { ok: false, motivo: 'inexistente' };
  if (linha.usado_em) return { ok: false, motivo: 'usado', aprovacao: linha, decisao: linha.decisao };
  if (linha.expira_em <= nowISO()) return { ok: false, motivo: 'expirado', aprovacao: linha };
  const pedido = repo.porId(linha.pedido_id);
  if (!pedido) return { ok: false, motivo: 'inexistente' };
  return { ok: true, aprovacao: linha, pedido };
}

/**
 * Consome a aprovação e registra a decisão. Só depois disto o executor
 * pode agir.
 *
 * ⚠️ O UPDATE tem `usado_em = ''` na cláusula WHERE e é ele — não o
 * SELECT anterior — que garante o uso único: dois cliques simultâneos
 * passariam os dois pelo `consultar`, mas só um encontra a linha ainda
 * livre para atualizar. `changes === 0` significa que o outro venceu.
 */
function decidir(token, { decisao, por = '' } = {}) {
  if (decisao !== 'aprovar' && decisao !== 'recusar') {
    throw new Error('aprovacoes.decidir: decisão tem que ser "aprovar" ou "recusar".');
  }
  const estado = consultar(token);
  if (!estado.ok) return estado;

  const r = db.prepare(`UPDATE aprovacoes SET usado_em = ?, decisao = ?, decidido_por = ?
                        WHERE id = ? AND usado_em = '' AND expira_em > ?`)
    .run(nowISO(), decisao, por || '', estado.aprovacao.id, nowISO());
  if (!r.changes) return { ok: false, motivo: 'usado' };

  const pedido = repo.atualizar(estado.pedido.id, {
    status: decisao === 'aprovar' ? 'aprovado' : 'recusado',
    decidido_em: nowISO(),
  });
  repo.auditar(decisao === 'aprovar' ? 'aprovacao.concedida' : 'aprovacao.recusada', {
    pedidoId: pedido.id, atorTipo: 'usuario', ator: por,
    detalhe: { acao: pedido.acao, nivel: pedido.nivel },
  });
  return { ok: true, pedido, decisao };
}

/**
 * Marca como expiradas as aprovações vencidas e derruba o pedido junto.
 *
 * Sem isto, um pedido de nível 3 fica "aguardando aprovação" para
 * sempre no painel — e aguardando-para-sempre não parece erro, que é o
 * pior jeito de falhar. Devolve quantos pedidos caíram.
 */
function expirarVencidas() {
  const vencidas = db.prepare(`SELECT * FROM aprovacoes WHERE usado_em = '' AND expira_em <= ?`).all(nowISO());
  let n = 0;
  for (const a of vencidas) {
    const p = repo.porId(a.pedido_id);
    if (!p || p.status !== 'aguardando_aprovacao') continue;
    repo.atualizar(p.id, { status: 'expirado', concluido_em: nowISO() });
    repo.auditar('aprovacao.expirada', { pedidoId: p.id, atorTipo: 'sistema', detalhe: { acao: p.acao } });
    n += 1;
  }
  return n;
}

const pendentesDo = (pedidoId) =>
  db.prepare(`SELECT * FROM aprovacoes WHERE pedido_id = ? AND usado_em = '' AND expira_em > ?
              ORDER BY criado_em DESC`).all(pedidoId, nowISO());

/**
 * Já existe uma autorização pendente para EXATAMENTE este pedido?
 *
 * Existe porque o primeiro uso real mostrou o gesto óbvio: o Augusto
 * RESPONDEU à mensagem de autorização, por áudio, repetindo o resumo. O
 * sistema tratou como pedido novo, criou uma segunda aprovação e mandou
 * outro par de mensagens. Não autorizou, e ainda encheu o celular.
 *
 * Responder a uma mensagem é o gesto natural de quem recebe uma
 * mensagem. Quem tem de se adaptar é o sistema.
 */
function pendenteEquivalente(acao, parametros) {
  if (!acao) return null;
  const alvo = JSON.stringify(parametros || {});
  const linhas = db.prepare(
    `SELECT a.*, p.acao AS p_acao, p.parametros AS p_parametros
       FROM aprovacoes a JOIN pedidos p ON p.id = a.pedido_id
      WHERE a.usado_em = '' AND a.expira_em > ? AND p.acao = ? AND p.status = 'aguardando_aprovacao'
      ORDER BY a.criado_em DESC`).all(nowISO(), acao);
  for (const l of linhas) {
    // Compara o CONTEÚDO, não o texto falado: "cadastra o cliente X" e
    // "cadastrar o cliente X na Stays" são o mesmo pedido.
    try { if (JSON.stringify(JSON.parse(l.p_parametros || '{}')) === alvo) return l; }
    catch (_) { /* linha corrompida não bloqueia o pedido novo */ }
  }
  return null;
}

/** Existe QUALQUER autorização esperando? Usado para reconhecer uma
 *  tentativa de autorizar por mensagem e responder o que fazer. */
const algumaPendente = () =>
  db.prepare(`SELECT a.*, p.acao AS p_acao FROM aprovacoes a JOIN pedidos p ON p.id = a.pedido_id
              WHERE a.usado_em = '' AND a.expira_em > ? AND p.status = 'aguardando_aprovacao'
              ORDER BY a.criado_em DESC LIMIT 1`).get(nowISO()) || null;

module.exports = {
  criar, consultar, decidir, expirarVencidas,
  pendentesDo, pendenteEquivalente, algumaPendente, TTL_MIN,
};
