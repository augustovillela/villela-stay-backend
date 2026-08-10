// =====================================================================
// ORIGENA — Guardiões do Legado (fase 3.3b, §40): sucessão digital.
//
// O PIOR ERRO POSSÍVEL DESTE PRODUTO seria transferir o acervo de uma
// família porque um sistema "concluiu" que alguém morreu. O jeito de
// nunca cometê-lo é não existir esse caminho: aqui não há rotina, cron
// nem gatilho que efetive sucessão sozinho. Cada etapa é um ato de
// gente, com nome no audit_log.
//
// QUATRO BARREIRAS EM SÉRIE, cada uma capaz de parar tudo sozinha:
//   1. QUÓRUM de guardiões confirmando;
//   2. UM ÚNICO "contesta" derruba — não é maioria. Se um guardião diz
//      "ela está viva", nenhuma contagem vence isso. Maioria é regra boa
//      para decidir gosto, péssima para decidir se alguém morreu;
//   3. REVISÃO HUMANA da plataforma, com motivo registrado;
//   4. JANELA DE CONTESTAÇÃO, com e-mail PARA A PRÓPRIA PESSOA. Essa é a
//      barreira que protege contra o cenário que mais importa — alguém
//      falsificar a morte de quem está vivo. Quem está vivo lê e-mail.
//
// O EFEITO É ADITIVO. Os guardiões viram OWNER; ninguém é removido, nada
// é apagado. Sucessão errada precisa ser reversível, e sucessão que
// apaga o titular não é.
//
// O QUE NÃO É MEU PARA DECIDIR: o que serve de prova de óbito no Brasil
// e qual prazo de contestação é razoável. São PARÂMETROS em `config`
// (migração 024), à espera do advogado — não números escondidos aqui.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const { auditar } = require('./repo');
const emails = require('./emails');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

async function parametros(t) {
  const linhas = await t.todas(`SELECT chave, valor FROM config WHERE chave LIKE 'sucessao.%'`);
  const m = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  return {
    diasContestacao: Number(m['sucessao.dias_contestacao'] || 30),
    quorumMinimo: Math.max(1, Number(m['sucessao.quorum_minimo'] || 2)),
    exigeDocumento: (m['sucessao.exige_documento'] || 'sim') === 'sim',
  };
}

// ------------------------------------------------------------ guardiões
const listar = (t, familyId) => t.todas(
  `SELECT g.id, g.email, g.nome, g.status, g.aceito_em, g.created_at, u.nome AS nome_conta
     FROM legacy_guardians g LEFT JOIN users u ON u.id = g.user_id
    WHERE g.family_id = $1 AND g.deleted_at IS NULL
    ORDER BY g.created_at`, [familyId]);

const ativosDe = (t, familyId) => t.todas(
  `SELECT id, user_id, email, nome FROM legacy_guardians
    WHERE family_id = $1 AND status = 'ativo' AND deleted_at IS NULL`, [familyId]);

async function indicar(t, { familyId, userId, dados }) {
  const email = s(dados.email, 200).toLowerCase();
  if (!EMAIL.test(email)) throw erro('erro.email_invalido', 400);
  const g = await t.uma(
    `INSERT INTO legacy_guardians (family_id, email, nome, indicado_por)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (family_id, lower(email)) WHERE deleted_at IS NULL DO NOTHING
     RETURNING *`, [familyId, email, s(dados.nome, 160), userId]);
  if (!g) throw erro('erro.guardiao_ja_indicado', 409);
  await auditar({ familyId, atorUserId: userId, acao: 'guardiao.indicado',
    alvoTipo: 'legacy_guardian', alvoId: g.id, depois: { email } }, t);
  return g;
}

/**
 * Aceitar é do CONVIDADO, e a conta tem de ser a do e-mail indicado.
 * Guardião indicado por e-mail e aceito por outra conta é o furo que
 * transforma a sucessão inteira em teatro.
 */
async function aceitar(t, { familyId, guardianId, usuario }) {
  const g = await t.uma(
    `SELECT * FROM legacy_guardians WHERE id = $1 AND deleted_at IS NULL`, [guardianId]);
  if (!g) throw erro('erro.guardiao_nao_encontrado', 404);
  if (String(g.email).toLowerCase() !== String(usuario.email).toLowerCase()) {
    throw erro('erro.guardiao_nao_e_voce', 403);
  }
  if (g.status === 'ativo') return g;
  const at = await t.uma(
    `UPDATE legacy_guardians SET status = 'ativo', user_id = $2, aceito_em = now()
      WHERE id = $1 RETURNING *`, [guardianId, usuario.id]);
  await auditar({ familyId, atorUserId: usuario.id, acao: 'guardiao.aceitou',
    alvoTipo: 'legacy_guardian', alvoId: guardianId }, t);
  return at;
}

async function remover(t, { familyId, userId, guardianId }) {
  const g = await t.uma(
    `UPDATE legacy_guardians SET status = 'removido', deleted_at = now()
      WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [guardianId]);
  if (!g) throw erro('erro.guardiao_nao_encontrado', 404);
  await auditar({ familyId, atorUserId: userId, acao: 'guardiao.removido',
    alvoTipo: 'legacy_guardian', alvoId: guardianId, antes: { email: g.email } }, t);
  return { removido: true };
}

// -------------------------------------------------------------- pedidos
const guardiaoDe = (t, familyId, userId) => t.uma(
  `SELECT * FROM legacy_guardians
    WHERE family_id = $1 AND user_id = $2 AND status = 'ativo' AND deleted_at IS NULL`,
  [familyId, userId]);

/**
 * Abrir o pedido. Só guardião ativo abre, e ninguém abre sobre si mesmo.
 * Quem abre já está afirmando o fato: o voto dele fica registrado como
 * voto, não como privilégio de quem chegou primeiro.
 */
async function abrirPedido(t, { familyId, usuario, dados }) {
  const g = await guardiaoDe(t, familyId, usuario.id);
  if (!g) throw erro('erro.sucessao_so_guardiao', 403);

  const sobre = s(dados.sobre, 60);
  if (!sobre) throw erro('erro.sucessao_sem_pessoa', 400);
  if (sobre === usuario.id) throw erro('erro.sucessao_sobre_voce', 400);

  const alvo = await t.uma(
    `SELECT u.id, u.nome, u.email, u.idioma FROM users u
       JOIN family_memberships m ON m.user_id = u.id AND m.family_id = $1 AND m.status = 'ativo'
      WHERE u.id = $2`, [familyId, sobre]);
  if (!alvo) throw erro('erro.sucessao_sem_pessoa', 404);

  const motivo = dados.motivo === 'INCAPACIDADE' ? 'INCAPACIDADE' : 'FALECIMENTO';
  const p = await parametros(t);
  const doc = s(dados.documento, 60) || null;
  if (p.exigeDocumento && !doc) throw erro('erro.sucessao_sem_documento', 400);

  let pedido;
  try {
    pedido = await t.uma(
      `INSERT INTO succession_requests (family_id, sobre_user_id, motivo, documento_media_id,
          aberta_por, quorum_necessario)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [familyId, sobre, motivo, doc, usuario.id, p.quorumMinimo]);
  } catch (e) {
    // ux_sucessao_em_curso: dois pedidos paralelos sobre a mesma pessoa
    // dividiriam o quórum e cada um pareceria legítimo sozinho.
    if (e.code === '23505') throw erro('erro.sucessao_ja_em_curso', 409);
    throw e;
  }

  await t.q(`INSERT INTO succession_votes (family_id, request_id, guardian_id, voto, nota)
             VALUES ($1,$2,$3,'confirma',$4)`,
  [familyId, pedido.id, g.id, s(dados.nota, 500)]);

  await auditar({ familyId, atorUserId: usuario.id, acao: 'sucessao.aberta',
    alvoTipo: 'succession_request', alvoId: pedido.id,
    depois: { motivo, sobre: alvo.nome, quorum: p.quorumMinimo } }, t);

  // A PESSOA SOBRE QUEM É O PEDIDO SABE NA HORA. Não no fim: se o pedido
  // for falso, cada dia de silêncio é um dia a menos para reagir.
  await avisarAlvo(t, { familyId, pedido, alvo, quando: 'aberto' });
  return await avaliar(t, { familyId, pedidoId: pedido.id });
}

/**
 * Votar. Um "contesta" derruba na hora — a contagem não continua, porque
 * não existe placar que responda "essa pessoa está viva?".
 */
async function votar(t, { familyId, usuario, pedidoId, voto, nota }) {
  const g = await guardiaoDe(t, familyId, usuario.id);
  if (!g) throw erro('erro.sucessao_so_guardiao', 403);
  const pedido = await t.uma(`SELECT * FROM succession_requests WHERE id = $1`, [pedidoId]);
  if (!pedido) throw erro('erro.sucessao_nao_encontrada', 404);
  if (pedido.status !== 'aguardando_quorum') throw erro('erro.sucessao_fase_errada', 409);
  if (pedido.sobre_user_id === usuario.id) throw erro('erro.sucessao_sobre_voce', 400);

  const v = voto === 'contesta' ? 'contesta' : 'confirma';
  await t.q(
    `INSERT INTO succession_votes (family_id, request_id, guardian_id, voto, nota)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (request_id, guardian_id) DO UPDATE SET voto = $4, nota = $5`,
    [familyId, pedidoId, g.id, v, s(nota, 500)]);
  await auditar({ familyId, atorUserId: usuario.id, acao: 'sucessao.voto',
    alvoTipo: 'succession_request', alvoId: pedidoId, depois: { voto: v } }, t);
  return avaliar(t, { familyId, pedidoId });
}

/** Conta os votos e move (ou derruba) o pedido. Nunca efetiva nada. */
async function avaliar(t, { familyId, pedidoId }) {
  const pedido = await t.uma(`SELECT * FROM succession_requests WHERE id = $1`, [pedidoId]);
  const votos = await t.todas(
    `SELECT voto FROM succession_votes WHERE request_id = $1`, [pedidoId]);
  const confirma = votos.filter((x) => x.voto === 'confirma').length;
  const contesta = votos.filter((x) => x.voto === 'contesta').length;

  if (pedido.status === 'aguardando_quorum') {
    if (contesta > 0) {
      await t.q(`UPDATE succession_requests SET status = 'contestada' WHERE id = $1`, [pedidoId]);
      await auditar({ familyId, atorKind: 'system', acao: 'sucessao.contestada',
        alvoTipo: 'succession_request', alvoId: pedidoId, depois: { por: 'guardiao' } }, t);
      return { status: 'contestada', confirma, contesta };
    }
    if (confirma >= pedido.quorum_necessario) {
      // Quórum NÃO aprova nada: só faz o pedido chegar a um humano da
      // plataforma. É a diferença entre "a família concorda" e "está feito".
      await t.q(`UPDATE succession_requests SET status = 'aguardando_revisao' WHERE id = $1`,
        [pedidoId]);
      return { status: 'aguardando_revisao', confirma, contesta };
    }
  }
  return { status: pedido.status, confirma, contesta,
    faltam: Math.max(0, pedido.quorum_necessario - confirma) };
}

/**
 * Revisão humana da plataforma (§40). Aprovar aqui NÃO transfere nada:
 * abre a janela de contestação e avisa a pessoa outra vez. É o segundo
 * e-mail que ela recebe — o primeiro foi quando o pedido nasceu.
 */
async function revisar(t, { familyId, staffUserId, pedidoId, aprovar, nota }) {
  const pedido = await t.uma(`SELECT * FROM succession_requests WHERE id = $1`, [pedidoId]);
  if (!pedido) throw erro('erro.sucessao_nao_encontrada', 404);
  if (pedido.status !== 'aguardando_revisao') throw erro('erro.sucessao_fase_errada', 409);
  if (!s(nota, 500)) throw erro('erro.sucessao_revisao_sem_motivo', 400);

  if (!aprovar) {
    await t.q(`UPDATE succession_requests SET status = 'recusada', revisada_por = $2,
                 revisada_em = now(), nota_revisao = $3 WHERE id = $1`,
    [pedidoId, staffUserId, s(nota, 500)]);
    await auditar({ familyId, atorUserId: staffUserId, atorKind: 'staff',
      acao: 'sucessao.recusada', alvoTipo: 'succession_request', alvoId: pedidoId,
      depois: { nota: s(nota, 500) } }, t);
    return { status: 'recusada' };
  }

  const p = await parametros(t);
  const at = await t.uma(
    `UPDATE succession_requests SET status = 'em_contestacao', revisada_por = $2,
        revisada_em = now(), nota_revisao = $3,
        contesta_ate = now() + ($4 || ' days')::interval
      WHERE id = $1 RETURNING *`,
    [pedidoId, staffUserId, s(nota, 500), String(p.diasContestacao)]);
  await auditar({ familyId, atorUserId: staffUserId, atorKind: 'staff',
    acao: 'sucessao.aprovada', alvoTipo: 'succession_request', alvoId: pedidoId,
    depois: { contesta_ate: at.contesta_ate, nota: s(nota, 500) } }, t);

  const alvo = await t.uma(`SELECT id, nome, email, idioma FROM users WHERE id = $1`,
    [pedido.sobre_user_id]);
  await avisarAlvo(t, { familyId, pedido: at, alvo, quando: 'aprovado' });
  return { status: 'em_contestacao', contesta_ate: at.contesta_ate };
}

/**
 * Derrubar. Quem pode: a PRÓPRIA pessoa (o caso que importa — está viva
 * e recebeu o e-mail) e qualquer guardião ativo. Vale em qualquer fase
 * antes de efetivada, inclusive já aprovada pela plataforma: a revisão
 * humana não vale mais que a pessoa dizendo "estou aqui".
 */
async function contestar(t, { familyId, usuario, pedidoId, nota }) {
  const pedido = await t.uma(`SELECT * FROM succession_requests WHERE id = $1`, [pedidoId]);
  if (!pedido) throw erro('erro.sucessao_nao_encontrada', 404);
  if (!['aguardando_quorum', 'aguardando_revisao', 'em_contestacao'].includes(pedido.status)) {
    throw erro('erro.sucessao_fase_errada', 409);
  }
  const ehAlvo = pedido.sobre_user_id === usuario.id;
  const g = ehAlvo ? null : await guardiaoDe(t, familyId, usuario.id);
  if (!ehAlvo && !g) throw erro('erro.sucessao_nao_pode_contestar', 403);

  await t.q(`UPDATE succession_requests SET status = 'contestada', contestada_por = $2
              WHERE id = $1`, [pedidoId, usuario.id]);
  await auditar({ familyId, atorUserId: usuario.id, acao: 'sucessao.contestada',
    alvoTipo: 'succession_request', alvoId: pedidoId,
    depois: { por: ehAlvo ? 'a propria pessoa' : 'guardiao', nota: s(nota, 500) } }, t);
  return { status: 'contestada' };
}

/**
 * Efetivar. É um ATO — não existe rotina que faça isto quando o prazo
 * vence. O efeito é ADITIVO: os guardiões viram OWNER e ninguém perde
 * nada. Sucessão errada tem de ser reversível.
 */
async function efetivar(t, { familyId, usuario, pedidoId }) {
  const pedido = await t.uma(`SELECT * FROM succession_requests WHERE id = $1`, [pedidoId]);
  if (!pedido) throw erro('erro.sucessao_nao_encontrada', 404);
  if (pedido.status !== 'em_contestacao') throw erro('erro.sucessao_fase_errada', 409);
  if (!pedido.contesta_ate || new Date(pedido.contesta_ate) > new Date()) {
    throw erro('erro.sucessao_prazo_aberto', 409);
  }
  const g = await guardiaoDe(t, familyId, usuario.id);
  if (!g) throw erro('erro.sucessao_so_guardiao', 403);

  const guardioes = await ativosDe(t, familyId);
  const promovidos = [];
  for (const x of guardioes) {
    if (!x.user_id) continue;
    // `ux_membership` é PARCIAL (`WHERE status <> 'removido'`): sem repetir
    // o predicado, o ON CONFLICT não infere o índice e estoura — e só
    // estouraria no caso mais comum de todos, o guardião que também é da
    // família (o filho que contribui e também herda).
    await t.q(
      `INSERT INTO family_memberships (family_id, user_id, papel, status)
       VALUES ($1,$2,'OWNER','ativo')
       ON CONFLICT (family_id, user_id) WHERE status <> 'removido'
       DO UPDATE SET papel = 'OWNER', status = 'ativo', updated_at = now()`,
      [familyId, x.user_id]);
    promovidos.push(x.user_id);
  }
  await t.q(`UPDATE succession_requests SET status = 'efetivada', efetivada_em = now()
              WHERE id = $1`, [pedidoId]);
  await auditar({ familyId, atorUserId: usuario.id, acao: 'sucessao.efetivada',
    alvoTipo: 'succession_request', alvoId: pedidoId,
    depois: { promovidos, titular_mantido: pedido.sobre_user_id } }, t);
  return { status: 'efetivada', promovidos: promovidos.length };
}

// ------------------------------------------------------------- avisos
/**
 * O e-mail para a pessoa sobre quem é o pedido. Não leva conteúdo do
 * acervo (PRIVACY §7) — leva o fato e o caminho para derrubar. É a
 * barreira contra o cenário que mais importa: alguém declarar morto
 * quem está vivo. Quem está vivo lê e-mail.
 */
async function avisarAlvo(t, { familyId, pedido, alvo, quando }) {
  if (!alvo || !alvo.email) return;
  const f = await t.uma(`SELECT nome FROM families WHERE id = $1`, [familyId]);
  await emails.sucessao(alvo.email, alvo.nome, {
    familia: f ? f.nome : '', quando,
    prazo: pedido.contesta_ate ? new Date(pedido.contesta_ate).toLocaleDateString('pt-BR') : '',
  }, alvo.idioma);
}

const listarPedidos = (t, familyId) => t.todas(
  `SELECT r.*, u.nome AS sobre_nome, a.nome AS aberta_por_nome,
          (SELECT count(*)::int FROM succession_votes v
            WHERE v.request_id = r.id AND v.voto = 'confirma') AS confirmam
     FROM succession_requests r
     LEFT JOIN users u ON u.id = r.sobre_user_id
     LEFT JOIN users a ON a.id = r.aberta_por
    WHERE r.family_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [familyId]);

module.exports = { parametros, listar, ativosDe, indicar, aceitar, remover,
  abrirPedido, votar, avaliar, revisar, contestar, efetivar, listarPedidos };
