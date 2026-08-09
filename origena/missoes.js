// =====================================================================
// ORIGENA — missões da família (Fase 2.2, §30, §87).
//
// A LACUNA VIRA PERGUNTA ENDEREÇADA. "A Maria não tem nenhuma foto" é um
// diagnóstico; "Você tem alguma fotografia da Maria?" é uma coisa que
// alguém consegue responder no celular, no domingo, em trinta segundos.
//
// QUATRO REGRAS:
//
//   1. IDEMPOTÊNCIA PELA CHAVE. Sincronizar dez vezes não cria dez
//      perguntas iguais — o índice único (family_id, chave) é a garantia
//      real, não uma checagem prévia.
//
//   2. DISPENSAR É DECISÃO DA FAMÍLIA, E DECISÃO NÃO SE APAGA SOZINHA. A
//      missão dispensada mantém a chave ocupada; a mesma pergunta não
//      renasce na próxima varredura. Sem isto, o sistema insistiria para
//      sempre em perguntar de um parente de quem ninguém quer falar.
//
//   3. LACUNA FECHADA FECHA A MISSÃO. Quem manda a foto não precisa vir
//      marcar a tarefa como feita — a próxima sincronização percebe que a
//      lacuna sumiu e resolve a missão.
//
//   4. NOTIFICAÇÃO É OPT-IN E NÃO LEVA ACERVO (§87, PRIVACY §7). O e-mail
//      diz "há 4 perguntas novas na sua família" e um link. Não diz de
//      quem, nem qual — nome de parente é dado pessoal, e caixa de e-mail
//      é território de terceiros.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const historiador = require('./historiador');
const prov = require('./proveniencia');
const { auditar } = require('./repo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

// Cada tipo de lacuna tem a SUA pergunta, por chave de catálogo (§86).
// O texto em português mora no i18n; aqui fica só o vínculo.
const PERGUNTA = {
  pessoa_sem_nascimento: 'missao.pergunta_pessoa_sem_nascimento',
  pessoa_sem_parentesco: 'missao.pergunta_pessoa_sem_parentesco',
  pessoa_sem_foto: 'missao.pergunta_pessoa_sem_foto',
  pessoa_sem_historia: 'missao.pergunta_pessoa_sem_historia',
  foto_sem_pessoa: 'missao.pergunta_foto_sem_pessoa',
  foto_sem_data: 'missao.pergunta_foto_sem_data',
  documento_sem_contexto: 'missao.pergunta_documento_sem_contexto',
  divergencia_aberta: 'missao.pergunta_divergencia_aberta',
  receita_sem_aprendiz: 'missao.pergunta_receita_sem_aprendiz',
  reliquia_sem_custodia: 'missao.pergunta_reliquia_sem_custodia',
  periodo_pouco_documentado: 'missao.pergunta_periodo_pouco_documentado',
};

/** Contribuição precisa de um alvo que a proveniência conheça. */
const ALVO_CONTRIBUIVEL = ['person', 'media', 'story', 'tradition', 'heirloom'];

/**
 * Varre as lacunas e acerta a fila de missões:
 *   • lacuna nova            → missão nova (idempotente pela chave)
 *   • lacuna que sumiu       → missão `resolvida`
 *   • missão dispensada      → fica como está, e a chave impede o renascimento
 *
 * Devolve também `avisar`: quem optou por receber e-mail. O envio fica com
 * a rota, FORA da transação — I/O de rede dentro de transação de banco é
 * como se prende uma conexão do pool esperando um servidor SMTP.
 */
async function sincronizar(t, { familyId, userId, teto }) {
  const { lacunas, cortados } = await historiador.lacunas(t, familyId, teto ? { teto } : {});
  const vistas = new Set(lacunas.map((l) => l.chave));

  let criadas = 0;
  for (const l of lacunas) {
    const r = await t.uma(
      `INSERT INTO missions (family_id, tipo, alvo_tipo, alvo_id, pergunta_chave,
         pergunta_vars, chave, peso)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (family_id, chave) DO NOTHING
       RETURNING id`,
      [familyId, l.tipo, l.alvo_tipo, l.alvo_id, PERGUNTA[l.tipo] || 'missao.pergunta_generica',
        JSON.stringify(l.vars || {}), l.chave, l.peso]);
    if (r) criadas++;
  }

  // O que não apareceu mais na varredura está resolvido: alguém mandou a
  // foto, alguém contou a história, a divergência foi decidida.
  //
  // MENOS o que ficou além do TETO. A varredura mostra no máximo N lacunas
  // por tipo; sem esta ressalva, a lacuna 26 — que continua existindo —
  // seria dada como resolvida só por não ter cabido na lista. Silêncio
  // virando "está tudo certo" é exatamente o que a casa não aceita.
  const truncados = new Set(Object.keys(cortados));
  const abertas = await t.todas(
    `SELECT id, chave, tipo FROM missions WHERE family_id = $1 AND status = 'aberta'`, [familyId]);
  const sumiram = abertas
    .filter((m) => !vistas.has(m.chave) && !truncados.has(m.tipo))
    .map((m) => m.id);
  if (sumiram.length) {
    await t.q(
      `UPDATE missions SET status = 'resolvida', updated_at = now()
        WHERE id = ANY($1::uuid[])`, [sumiram]);
  }

  if (criadas) {
    await auditar({ familyId, atorUserId: userId, acao: 'missoes.sincronizadas',
      depois: { criadas, resolvidas: sumiram.length } }, t);
  }

  return {
    criadas, resolvidas: sumiram.length, lacunas: lacunas.length, cortados,
    avisar: criadas ? await destinatarios(t, familyId, 'missoes') : [],
  };
}

/** Quem PEDIU para ser avisado. Sem linha na tabela, não recebe nada. */
const destinatarios = (t, familyId, evento) => t.todas(
  `SELECT u.id, u.nome, u.email, u.idioma
     FROM notification_prefs np
     JOIN users u ON u.id = np.user_id
     JOIN family_memberships fm ON fm.user_id = u.id AND fm.family_id = np.family_id
    WHERE np.family_id = $1 AND np.evento = $2 AND np.frequencia = 'imediato'
      AND fm.status = 'ativo' AND u.deleted_at IS NULL AND u.email_verificado`,
  [familyId, evento]);

const listar = (t, familyId, { status = 'aberta', limite = 60 } = {}) => t.todas(
  `SELECT m.id, m.tipo, m.alvo_tipo, m.alvo_id, m.pergunta_chave, m.pergunta_vars,
          m.peso, m.status, m.motivo, m.created_at, m.respondida_em,
          u.nome AS respondida_por_nome
     FROM missions m LEFT JOIN users u ON u.id = m.respondida_por
    WHERE m.family_id = $1 AND ($2::text = 'todas' OR m.status = $2)
    ORDER BY m.peso DESC, m.created_at
    LIMIT $3`, [familyId, status, Math.min(limite, 200)]);

const contar = (t, familyId) => t.uma(
  `SELECT count(*) FILTER (WHERE status = 'aberta')::int abertas,
          count(*) FILTER (WHERE status = 'respondida')::int respondidas,
          count(*) FILTER (WHERE status = 'resolvida')::int resolvidas,
          count(*) FILTER (WHERE status = 'dispensada')::int dispensadas
     FROM missions WHERE family_id = $1`, [familyId]);

/**
 * Responder é CONTRIBUIR: o texto vira contribuição no alvo, com autor e
 * data, exatamente como o resto do acervo (§15). A missão não guarda a
 * resposta — ela aponta para onde a resposta virou memória.
 */
async function responder(t, { familyId, userId, missionId, corpo }) {
  const m = await t.uma(
    `SELECT * FROM missions WHERE id = $1 AND status IN ('aberta','resolvida')`, [missionId]);
  if (!m) throw erro('erro.missao_nao_encontrada', 404);
  const texto = s(corpo, 20000);
  if (texto.length < 2) throw erro('erro.missao_resposta_vazia', 400);
  if (!m.alvo_id || !ALVO_CONTRIBUIVEL.includes(m.alvo_tipo)) {
    throw erro('erro.missao_sem_alvo', 400);
  }

  const c = await prov.contribuir(t, {
    familyId, userId, alvoTipo: m.alvo_tipo, alvoId: m.alvo_id,
    corpo: texto, tipo: 'relato', privacidade: 'FAMILY' });

  const atualizada = await t.uma(
    `UPDATE missions SET status = 'respondida', respondida_por = $2, respondida_em = now(),
            resposta_tipo = 'contribution', resposta_id = $3, updated_at = now()
      WHERE id = $1 RETURNING *`, [missionId, userId, c.id]);
  await auditar({ familyId, atorUserId: userId, acao: 'missao.respondida',
    alvoTipo: 'mission', alvoId: missionId, depois: { contribuicao: c.id } }, t);
  return { missao: atualizada, contribuicao: c };
}

/** "Não queremos essa pergunta." Fica registrado e não volta. */
async function dispensar(t, { familyId, userId, missionId, motivo }) {
  const m = await t.uma(
    `UPDATE missions SET status = 'dispensada', motivo = $2, respondida_por = $3,
            respondida_em = now(), updated_at = now()
      WHERE id = $1 AND status <> 'dispensada' RETURNING *`,
    [missionId, s(motivo, 300), userId]);
  if (!m) throw erro('erro.missao_nao_encontrada', 404);
  await auditar({ familyId, atorUserId: userId, acao: 'missao.dispensada',
    alvoTipo: 'mission', alvoId: missionId, depois: { motivo: m.motivo } }, t);
  return m;
}

// ------------------------------------------------------- preferências
const EVENTOS = ['missoes'];
const FREQUENCIAS = ['nunca', 'imediato'];

const prefsDe = (t, familyId, userId) => t.todas(
  `SELECT evento, canal, frequencia FROM notification_prefs
    WHERE family_id = $1 AND user_id = $2`, [familyId, userId]);

/**
 * OPT-IN: `nunca` é o padrão, e é o que vale quando não existe linha.
 * Escolher `nunca` grava a linha assim mesmo — a escolha explícita de não
 * receber é informação, e evita que um padrão futuro mude por baixo.
 */
async function definirPref(t, { familyId, userId, evento, frequencia }) {
  if (!EVENTOS.includes(evento)) throw erro('erro.notificacao_evento', 400);
  if (!FREQUENCIAS.includes(frequencia)) throw erro('erro.notificacao_frequencia', 400);
  return t.uma(
    `INSERT INTO notification_prefs (family_id, user_id, evento, canal, frequencia)
     VALUES ($1,$2,$3,'email',$4)
     ON CONFLICT (family_id, user_id, evento, canal)
       DO UPDATE SET frequencia = EXCLUDED.frequencia, atualizado_em = now()
     RETURNING *`, [familyId, userId, evento, frequencia]);
}

module.exports = { PERGUNTA, EVENTOS, FREQUENCIAS, sincronizar, listar, contar,
  responder, dispensar, prefsDe, definirPref, destinatarios };
