// =====================================================================
// ORIGENA — o Historiador da família (Fase 2.2, §29, §31, §32).
//
// O QUE ELE FAZ: olha o acervo inteiro e diz o que FALTA. Não é IA — é
// SQL. Detectar que "a Maria não tem nenhuma foto" e que "esta fotografia
// não tem ninguém identificado" é consulta, não inferência, e por isso
// custa zero crédito, não depende de provedor nenhum e nunca alucina.
// A IA entra depois, para redigir a pergunta bonita (2.4), não para
// descobrir a lacuna.
//
// TRÊS COISAS QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO:
//
//   1. NÃO RANQUEIA FAMILIARES (§31). O índice de memória é de uma PESSOA
//      DO ACERVO — que provavelmente já morreu —, nunca um placar de
//      quem contribuiu mais. Gamificar luto é o jeito mais rápido de
//      transformar um sistema de legado numa competição constrangedora.
//      A listagem sai em ordem de NOME; o teste garante que não sai por
//      score.
//
//   2. NÃO ESCONDE O QUE CORTOU. Cada varredura tem teto, e o retorno diz
//      quantas lacunas ficaram de fora — silêncio aqui viraria "está tudo
//      preenchido" quando não está.
//
//   3. NÃO DECIDE PRIVACIDADE. Devolve linhas com `privacidade` e
//      `criado_por`; quem filtra é a rota, com `podeVer` — implementação
//      única (§11).
// =====================================================================
'use strict';

const TETO = 25;            // por tipo de lacuna: a fila serve para agir, não para assustar
const PESOS = {
  foto_sem_pessoa: 9,        // quem sabe hoje pode não saber amanhã — é a lacuna mais urgente
  pessoa_sem_historia: 8,
  divergencia_aberta: 8,
  pessoa_sem_foto: 7,
  receita_sem_aprendiz: 7,
  reliquia_sem_custodia: 7,
  pessoa_sem_nascimento: 6,
  documento_sem_contexto: 5,
  foto_sem_data: 5,
  pessoa_sem_parentesco: 5,
  periodo_pouco_documentado: 3,
};

/**
 * Uma lacuna. `chave` é o que torna a missão idempotente (§30): a mesma
 * lacuna gera sempre a mesma chave, então sincronizar dez vezes não cria
 * dez perguntas.
 */
const lacuna = (tipo, alvoTipo, alvoId, vars = {}) => ({
  tipo, alvo_tipo: alvoTipo, alvo_id: alvoId, vars,
  chave: `${tipo}:${alvoId || 'familia'}`,
  peso: PESOS[tipo] || 5,
});

/**
 * Varre o acervo e devolve as lacunas. Cada consulta é independente:
 * acrescentar um tipo novo é acrescentar um bloco, sem tocar nos outros.
 */
async function lacunas(t, familyId, { teto = TETO } = {}) {
  const achados = [];
  const cortados = {};
  const varrer = async (tipo, alvoTipo, sql, params, vars) => {
    const linhas = await t.todas(sql, params);
    if (linhas.length > teto) cortados[tipo] = linhas.length - teto;
    for (const l of linhas.slice(0, teto)) {
      achados.push({ ...lacuna(tipo, alvoTipo, l.id, vars(l)), privacidade: l.privacidade,
        criado_por: l.criado_por });
    }
  };

  // --- pessoas -------------------------------------------------------
  await varrer('pessoa_sem_nascimento', 'person',
    `SELECT id, nome_exibicao, privacidade, created_by AS criado_por FROM persons
      WHERE family_id = $1 AND deleted_at IS NULL AND nascimento_valor IS NULL
      ORDER BY created_at`, [familyId], (l) => ({ nome: l.nome_exibicao }));

  await varrer('pessoa_sem_parentesco', 'person',
    `SELECT p.id, p.nome_exibicao, p.privacidade, p.created_by AS criado_por FROM persons p
      WHERE p.family_id = $1 AND p.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM relationships r
                         WHERE r.deleted_at IS NULL AND (r.person_a = p.id OR r.person_b = p.id))
      ORDER BY p.created_at`, [familyId], (l) => ({ nome: l.nome_exibicao }));

  await varrer('pessoa_sem_foto', 'person',
    `SELECT p.id, p.nome_exibicao, p.privacidade, p.created_by AS criado_por FROM persons p
      WHERE p.family_id = $1 AND p.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM media_persons mp JOIN media m ON m.id = mp.media_id
                         WHERE mp.person_id = p.id AND m.deleted_at IS NULL
                           AND mp.origem IN ('MANUAL','CONFIRMADA'))
      ORDER BY p.created_at`, [familyId], (l) => ({ nome: l.nome_exibicao }));

  // "Sem história" conta narrativa de qualquer forma: história, o que a
  // família contou, ou uma tradição que é dela. Cobrar história de quem
  // já tem três receitas registradas seria ruído.
  await varrer('pessoa_sem_historia', 'person',
    `SELECT p.id, p.nome_exibicao, p.privacidade, p.created_by AS criado_por FROM persons p
      WHERE p.family_id = $1 AND p.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM story_mentions sm JOIN stories st ON st.id = sm.story_id
                         WHERE sm.person_id = p.id AND st.deleted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM stories st2
                         WHERE st2.contada_por_person_id = p.id AND st2.deleted_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM contributions c
                         WHERE c.alvo_tipo = 'person' AND c.alvo_id = p.id AND c.status = 'ativa')
        AND NOT EXISTS (SELECT 1 FROM traditions tr
                         WHERE tr.person_id = p.id AND tr.deleted_at IS NULL)
      ORDER BY p.created_at`, [familyId], (l) => ({ nome: l.nome_exibicao }));

  // --- acervo --------------------------------------------------------
  await varrer('foto_sem_pessoa', 'media',
    `SELECT m.id, COALESCE(NULLIF(m.titulo,''), m.nome_original) AS titulo,
            m.privacidade, m.created_by AS criado_por FROM media m
      WHERE m.family_id = $1 AND m.deleted_at IS NULL AND m.derivado_de IS NULL
        AND m.tipo = 'FOTO' AND m.status = 'pronta'
        AND NOT EXISTS (SELECT 1 FROM media_persons mp WHERE mp.media_id = m.id
                         AND mp.origem IN ('MANUAL','CONFIRMADA'))
      ORDER BY m.created_at`, [familyId], (l) => ({ titulo: l.titulo }));

  await varrer('foto_sem_data', 'media',
    `SELECT m.id, COALESCE(NULLIF(m.titulo,''), m.nome_original) AS titulo,
            m.privacidade, m.created_by AS criado_por FROM media m
      WHERE m.family_id = $1 AND m.deleted_at IS NULL AND m.derivado_de IS NULL
        AND m.tipo = 'FOTO' AND m.status = 'pronta' AND m.capturada_valor IS NULL
      ORDER BY m.created_at`, [familyId], (l) => ({ titulo: l.titulo }));

  await varrer('documento_sem_contexto', 'media',
    `SELECT m.id, COALESCE(NULLIF(m.titulo,''), m.nome_original) AS titulo,
            m.privacidade, m.created_by AS criado_por FROM media m
      WHERE m.family_id = $1 AND m.deleted_at IS NULL AND m.derivado_de IS NULL
        AND m.tipo = 'DOCUMENTO'
        AND NOT EXISTS (SELECT 1 FROM media_persons mp WHERE mp.media_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM contributions c
                         WHERE c.alvo_tipo = 'media' AND c.alvo_id = m.id AND c.status = 'ativa')
      ORDER BY m.created_at`, [familyId], (l) => ({ titulo: l.titulo }));

  // --- tradições e relíquias (Fase 2.1) -------------------------------
  await varrer('receita_sem_aprendiz', 'tradition',
    `SELECT tr.id, tr.titulo, tr.privacidade, tr.created_by AS criado_por
       FROM traditions tr JOIN recipes r ON r.tradition_id = tr.id
      WHERE tr.family_id = $1 AND tr.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM recipe_learners rl WHERE rl.recipe_id = r.id)
      ORDER BY tr.created_at`, [familyId], (l) => ({ titulo: l.titulo }));

  await varrer('reliquia_sem_custodia', 'heirloom',
    `SELECT h.id, h.nome, h.privacidade, h.created_by AS criado_por FROM heirlooms h
      WHERE h.family_id = $1 AND h.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM heirloom_custody c WHERE c.heirloom_id = h.id)
      ORDER BY h.created_at`, [familyId], (l) => ({ titulo: l.nome }));

  // --- onde a família ainda não concorda ------------------------------
  // O corte vale aqui também, e precisa ser CONTABILIZADO: quem fecha
  // missão automaticamente usa `cortados` para não dar como resolvida uma
  // lacuna que apenas não coube na lista.
  const divs = await t.todas(
    `SELECT d.sujeito_id, d.predicado, p.nome_exibicao, p.privacidade, p.created_by AS criado_por
       FROM v_divergencias d JOIN persons p ON p.id = d.sujeito_id
      WHERE d.sujeito_tipo = 'person' AND p.deleted_at IS NULL
      ORDER BY p.nome_exibicao LIMIT 500`);
  if (divs.length > teto) cortados.divergencia_aberta = divs.length - teto;
  for (const d of divs.slice(0, teto)) {
    achados.push({
      ...lacuna('divergencia_aberta', 'person', d.sujeito_id,
        { nome: d.nome_exibicao, campo: d.predicado }),
      chave: `divergencia_aberta:${d.sujeito_id}:${d.predicado}`,
      privacidade: d.privacidade, criado_por: d.criado_por,
    });
  }

  // --- períodos pouco documentados (§29) ------------------------------
  // Décadas entre o nascimento mais antigo e hoje com menos de dois itens
  // no acervo. É a lacuna que ninguém percebe olhando item a item.
  const faixa = await t.uma(
    `SELECT min(extract(year from nascimento_ini))::int AS de,
            max(extract(year from COALESCE(falecimento_ini, now())))::int AS ate
       FROM persons WHERE family_id = $1 AND deleted_at IS NULL AND nascimento_ini IS NOT NULL`,
    [familyId]);
  if (faixa && faixa.de) {
    const porDecada = await t.todas(
      `SELECT (floor(extract(year from data_ini) / 10) * 10)::int AS decada, count(*)::int n
         FROM busca WHERE family_id = $1 AND data_ini IS NOT NULL GROUP BY 1`, [familyId]);
    const mapa = new Map(porDecada.map((d) => [d.decada, d.n]));
    const inicio = Math.floor(faixa.de / 10) * 10;
    const fim = Math.floor((faixa.ate || inicio) / 10) * 10;
    const vazias = [];
    for (let d = inicio; d <= fim; d += 10) {
      if ((mapa.get(d) || 0) < 2) vazias.push(d);
    }
    if (vazias.length > teto) cortados.periodo_pouco_documentado = vazias.length - teto;
    for (const d of vazias.slice(0, teto)) {
      achados.push({ ...lacuna('periodo_pouco_documentado', 'family', null, { decada: d }),
        chave: `periodo_pouco_documentado:${d}`, privacidade: 'FAMILY', criado_por: null });
    }
  }

  return { lacunas: achados, cortados };
}

// =====================================================================
// ÍNDICE DE MEMÓRIA (§31)
// =====================================================================

// As dez dimensões do §31. Ordem fixa: é ela que a tela mostra e o teste
// confere. "historias" aceita história, contribuição OU tradição — as três
// são narrativa sobre a pessoa.
const DIMENSOES = ['nascimento', 'parentes', 'fotos', 'historias', 'documentos',
  'voz', 'lugares', 'infancia', 'profissao', 'eventos'];

/**
 * As dez dimensões, para a família inteira, em UMA consulta.
 *
 * Uma consulta por dimensão por pessoa seria dez vezes mais legível e cem
 * vezes mais lenta — com o banco a um oceano de distância, cada ida custa
 * mais que a conta toda. `EXISTS` para em cada primeira linha encontrada.
 */
const SQL_DIMENSOES = `
  SELECT p.id AS person_id, p.nome_exibicao,
    (p.nascimento_valor IS NOT NULL)                       AS nascimento,
    (btrim(COALESCE(p.profissao, '')) <> '')               AS profissao,
    (btrim(COALESCE(p.local_nascimento, '')) <> '')        AS lugares,
    EXISTS (SELECT 1 FROM relationships r
             WHERE r.deleted_at IS NULL AND (r.person_a = p.id OR r.person_b = p.id)) AS parentes,
    EXISTS (SELECT 1 FROM media_persons mp JOIN media m ON m.id = mp.media_id
             WHERE mp.person_id = p.id AND m.deleted_at IS NULL AND m.tipo = 'FOTO'
               AND mp.origem IN ('MANUAL','CONFIRMADA'))   AS fotos,
    EXISTS (SELECT 1 FROM media_persons mp JOIN media m ON m.id = mp.media_id
             WHERE mp.person_id = p.id AND m.deleted_at IS NULL AND m.tipo = 'DOCUMENTO') AS documentos,
    EXISTS (SELECT 1 FROM media_persons mp JOIN media m ON m.id = mp.media_id
             WHERE mp.person_id = p.id AND m.deleted_at IS NULL
               AND m.tipo IN ('AUDIO','VIDEO'))            AS voz,
    EXISTS (SELECT 1 FROM event_participants ep JOIN events e ON e.id = ep.event_id
             WHERE ep.person_id = p.id AND e.deleted_at IS NULL) AS eventos,
    (EXISTS (SELECT 1 FROM story_mentions sm JOIN stories st ON st.id = sm.story_id
              WHERE sm.person_id = p.id AND st.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM stories st2
                 WHERE st2.contada_por_person_id = p.id AND st2.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM contributions c
                 WHERE c.alvo_tipo = 'person' AND c.alvo_id = p.id AND c.status = 'ativa')
     OR EXISTS (SELECT 1 FROM traditions tr
                 WHERE tr.person_id = p.id AND tr.deleted_at IS NULL)) AS historias,
    -- INFÂNCIA: alguma coisa datada dentro dos 18 primeiros anos de vida.
    -- É a lacuna mais comum e a mais dolorosa: quase todo acervo começa
    -- quando a pessoa já era adulta.
    (p.nascimento_ini IS NOT NULL AND EXISTS (
       SELECT 1 FROM busca b
        WHERE p.id = ANY(b.pessoas) AND b.data_ini IS NOT NULL
          AND b.data_ini >= p.nascimento_ini
          AND b.data_ini < (p.nascimento_ini + interval '18 years'))) AS infancia
   FROM persons p
  WHERE p.family_id = $1 AND p.deleted_at IS NULL
    AND ($2::uuid IS NULL OR p.id = $2)
  ORDER BY p.nome_exibicao`;

/** Uma linha crua do SQL acima vira score + dimensões + lacunas nomeadas. */
function montarIndice(linha) {
  const d = {};
  for (const k of DIMENSOES) d[k] = !!linha[k];
  const atendidas = DIMENSOES.filter((k) => d[k]);
  return {
    person_id: linha.person_id,
    nome_exibicao: linha.nome_exibicao,
    score: Math.round((100 * atendidas.length) / DIMENSOES.length),
    dimensoes: d,
    lacunas: DIMENSOES.filter((k) => !d[k]),
  };
}

/**
 * O índice de UMA pessoa: a porcentagem e, o que importa de verdade, o
 * que FALTA — por nome.
 */
async function indiceDaPessoa(t, personId) {
  const p = await t.uma(
    `SELECT family_id FROM persons WHERE id = $1 AND deleted_at IS NULL`, [personId]);
  if (!p) return null;
  const linha = await t.uma(SQL_DIMENSOES, [p.family_id, personId]);
  return linha ? montarIndice(linha) : null;
}

/**
 * Projeção da família inteira. Como a timeline: apaga e refaz. Nunca é
 * fonte de verdade — se a tabela sumir, recalcular dá o mesmo resultado.
 */
async function recalcular(t, familyId) {
  const linhas = await t.todas(SQL_DIMENSOES, [familyId, null]);
  await t.q(`DELETE FROM memory_index WHERE family_id = $1`, [familyId]);
  if (!linhas.length) return 0;

  // Um INSERT só: com o banco remoto, trinta idas custam mais que a conta.
  const valores = [];
  const params = [familyId];
  for (const l of linhas) {
    const i = montarIndice(l);
    const b = params.length;
    valores.push(`($1, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, now())`);
    params.push(i.person_id, i.score, JSON.stringify(i.dimensoes), JSON.stringify(i.lacunas));
  }
  await t.q(
    `INSERT INTO memory_index (family_id, person_id, score, dimensoes, lacunas, calculado_em)
     VALUES ${valores.join(',')}`, params);
  return linhas.length;
}

/**
 * A lista da família. ORDENADA POR NOME, nunca por score (§31): o índice
 * existe para achar lacuna, não para comparar avô com avó.
 */
async function indiceDaFamilia(t, familyId) {
  await recalcular(t, familyId);
  return t.todas(
    `SELECT m.person_id, m.score, m.lacunas, m.dimensoes, p.nome_exibicao,
            p.privacidade, p.created_by AS criado_por
       FROM memory_index m JOIN persons p ON p.id = m.person_id
      WHERE m.family_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.nome_exibicao`, [familyId]);
}

/**
 * "Quem sabe sobre esta pessoa?" (§32) — sinais, não adivinhação: quem
 * contribuiu sobre ela, quem a identificou em fotos, quem escreveu
 * histórias em que ela aparece. Serve para SUGERIR a quem endereçar a
 * pergunta; não é placar (só sai dentro do dossiê de uma pessoa, com no
 * máximo três nomes).
 */
async function quemSabe(t, personId) {
  return t.todas(
    `SELECT u.id AS user_id, u.nome,
            sum(x.contribuicoes)::int AS contribuicoes,
            sum(x.identificacoes)::int AS identificacoes,
            sum(x.historias)::int AS historias,
            (sum(x.contribuicoes) * 3 + sum(x.identificacoes) * 2 + sum(x.historias) * 2)::int AS sinal
       FROM (
         SELECT c.autor_user_id AS uid, count(*) AS contribuicoes, 0 AS identificacoes, 0 AS historias
           FROM contributions c
          WHERE c.alvo_tipo = 'person' AND c.alvo_id = $1 AND c.autor_user_id IS NOT NULL
          GROUP BY 1
         UNION ALL
         SELECT mp.confirmado_por, 0, count(*), 0 FROM media_persons mp
          WHERE mp.person_id = $1 AND mp.confirmado_por IS NOT NULL GROUP BY 1
         UNION ALL
         SELECT st.autor_user_id, 0, 0, count(*)
           FROM story_mentions sm JOIN stories st ON st.id = sm.story_id
          WHERE sm.person_id = $1 AND st.autor_user_id IS NOT NULL AND st.deleted_at IS NULL
          GROUP BY 1
       ) x JOIN users u ON u.id = x.uid
      GROUP BY u.id, u.nome
      ORDER BY sinal DESC, u.nome
      LIMIT 3`, [personId]);
}

module.exports = { DIMENSOES, PESOS, TETO, lacunas, indiceDaPessoa, indiceDaFamilia,
  recalcular, quemSabe };
