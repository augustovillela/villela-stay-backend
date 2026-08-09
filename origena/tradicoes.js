// =====================================================================
// ORIGENA — tradições, receitas, saberes e relíquias (Fase 2.1, §35–38).
//
// O QUE ESTE MÓDULO GUARDA é o que a família conta na mesa, não na
// certidão: o bolo de fubá da vovó, a reza do Natal, o jeito de afiar a
// faca, o anel que passou de mão em mão desde 1912.
//
// TRÊS REGRAS QUE O CÓDIGO IMPÕE (não são convenção):
//
//   1. A TRANSCRIÇÃO NÃO SUBSTITUI O MANUSCRITO. O texto digitado do
//      preparo é uma LEITURA da foto do papel; a foto continua sendo o
//      original, e a tela mostra os dois (§36, ADR-0006).
//
//   2. QUEM TEM A RELÍQUIA HOJE É UMA CONSULTA, NÃO UM CAMPO. Transferir
//      FECHA a custódia anterior e ABRE a nova. A linha de posse inteira
//      fica — é ela que dá valor ao objeto (§38).
//
//   3. TRANSMISSÃO DE SABER É ARESTA. "O vô ensinou o pai, que me
//      ensinou" é uma corrente de duas arestas, não dois textos soltos —
//      e é assim que vira grafo na 2.5 (§37).
// =====================================================================
'use strict';
const { erro } = require('./erros');
const datas = require('./datas');
const busca = require('./busca');
const { auditar } = require('./repo');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

const CATEGORIAS = ['RECEITA', 'CELEBRACAO', 'MUSICA', 'EXPRESSAO', 'SABER',
  'RELIQUIA', 'LUGAR', 'HISTORIA'];
const PRIVACIDADES = ['PUBLIC', 'FAMILY', 'GROUP', 'PRIVATE'];

/** Mesmo contrato de `repo-pessoas.campoData`: data imprecisa vira trio. */
function campoData(bruto, prefixo) {
  if (bruto == null || String(bruto).trim() === '') {
    return { [`${prefixo}_valor`]: null, [`${prefixo}_precisao`]: 'ANO',
      [`${prefixo}_ini`]: null, [`${prefixo}_fim`]: null };
  }
  const d = datas.interpretar(bruto);
  if (d.erro) throw erro(d.erro, 400);
  return { [`${prefixo}_valor`]: d.valor, [`${prefixo}_precisao`]: d.precisao,
    [`${prefixo}_ini`]: d.ini, [`${prefixo}_fim`]: d.fim };
}

const priv = (v, padrao = 'FAMILY') => (PRIVACIDADES.includes(v) ? v : padrao);

// =====================================================================
// TRADIÇÕES
// =====================================================================

/**
 * Ingredientes vêm da tela como lista de linhas soltas ("2 xícaras de
 * fubá"). Guardamos como jsonb de `{item}` — estruturar quantidade e
 * unidade seria fingir precisão que a receita da avó não tem.
 */
function normalizarIngredientes(bruto) {
  const lista = Array.isArray(bruto) ? bruto
    : String(bruto || '').split(/\r?\n/);
  return lista
    .map((x) => (typeof x === 'string' ? { item: s(x, 200) } : { item: s(x && x.item, 200) }))
    .filter((x) => x.item)
    .slice(0, 100);
}

/** Índice de busca: a tradição inteira, com o preparo junto quando é receita. */
async function indexar(t, familyId, tradicaoId) {
  const tr = await t.uma(
    `SELECT tr.*, r.preparo, r.ingredientes
       FROM traditions tr LEFT JOIN recipes r ON r.tradition_id = tr.id
      WHERE tr.id = $1`, [tradicaoId]);
  if (!tr || tr.deleted_at) return null;
  const ings = (tr.ingredientes || []).map((i) => i.item).join('\n');
  const pessoas = [tr.person_id].filter(Boolean);
  for (const l of await t.todas(
    `SELECT person_id FROM recipe_learners rl
       JOIN recipes r ON r.id = rl.recipe_id WHERE r.tradition_id = $1`, [tradicaoId])) {
    pessoas.push(l.person_id);
  }
  for (const l of await t.todas(
    `SELECT de_person_id, para_person_id FROM tradition_transmissions WHERE tradition_id = $1`,
    [tradicaoId])) {
    pessoas.push(l.de_person_id, l.para_person_id);
  }
  return busca.indexar(t, {
    familyId, refTipo: tr.categoria === 'RECEITA' ? 'recipe' : 'tradition', refId: tradicaoId,
    titulo: tr.titulo,
    corpo: [tr.corpo, tr.origem, ings, tr.preparo, (tr.ocasioes || []).join(', ')]
      .filter(Boolean).join('\n'),
    pessoas: [...new Set(pessoas)],
    dataIni: tr.desde_ini, dataFim: tr.desde_fim, localTexto: tr.local_texto,
    privacidade: tr.privacidade, criadoPor: tr.created_by,
  });
}

const Tradicoes = {
  CATEGORIAS,

  listar: (t, familyId, { categoria = null, pessoaId = null, limite = 100 } = {}) => t.todas(
    `SELECT tr.id, tr.categoria, tr.titulo, tr.corpo, tr.person_id, tr.ocasioes,
            tr.desde_valor, tr.local_texto, tr.privacidade, tr.created_by, tr.created_at,
            p.nome_exibicao AS de_quem,
            (SELECT count(*)::int FROM recipe_learners rl
               JOIN recipes r ON r.id = rl.recipe_id WHERE r.tradition_id = tr.id) AS aprendizes,
            (SELECT count(*)::int FROM tradition_transmissions x WHERE x.tradition_id = tr.id) AS transmissoes
       FROM traditions tr LEFT JOIN persons p ON p.id = tr.person_id
      WHERE tr.family_id = $1 AND tr.deleted_at IS NULL
        AND ($2::text IS NULL OR tr.categoria = $2)
        AND ($3::uuid IS NULL OR tr.person_id = $3
             OR EXISTS (SELECT 1 FROM recipe_learners rl JOIN recipes r ON r.id = rl.recipe_id
                         WHERE r.tradition_id = tr.id AND rl.person_id = $3)
             OR EXISTS (SELECT 1 FROM tradition_transmissions x WHERE x.tradition_id = tr.id
                         AND (x.de_person_id = $3 OR x.para_person_id = $3)))
      ORDER BY tr.categoria, tr.titulo
      LIMIT $4`, [familyId, categoria, pessoaId, Math.min(limite, 300)]),

  async criar(t, { familyId, userId, dados }) {
    const titulo = s(dados.titulo, 200);
    if (titulo.length < 2) throw erro('erro.tradicao_sem_titulo', 400);
    const categoria = CATEGORIAS.includes(dados.categoria) ? dados.categoria : 'HISTORIA';
    const desde = campoData(dados.desde, 'desde');

    const tr = await t.uma(
      `INSERT INTO traditions (family_id, categoria, titulo, corpo, person_id, origem, ocasioes,
         desde_valor, desde_precisao, desde_ini, desde_fim, local_texto, capa_media_id,
         privacidade, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [familyId, categoria, titulo, s(dados.corpo, 50000), dados.person_id || null,
        s(dados.origem, 1000),
        (Array.isArray(dados.ocasioes) ? dados.ocasioes : String(dados.ocasioes || '')
          .split(',')).map((x) => s(x, 60)).filter(Boolean).slice(0, 20),
        desde.desde_valor, desde.desde_precisao, desde.desde_ini, desde.desde_fim,
        s(dados.local, 200), dados.capa_media_id || null,
        priv(dados.privacidade), userId]);

    // A receita é a MESMA tradição, com o que só ela tem.
    if (categoria === 'RECEITA') {
      await t.q(
        `INSERT INTO recipes (family_id, tradition_id, ingredientes, preparo, rendimento,
           tempo, manuscrito_media_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [familyId, tr.id, JSON.stringify(normalizarIngredientes(dados.ingredientes)),
          s(dados.preparo, 50000), s(dados.rendimento, 120), s(dados.tempo, 120),
          dados.manuscrito_media_id || null]);
    }

    await indexar(t, familyId, tr.id);
    await auditar({ familyId, atorUserId: userId, acao: 'tradicao.criada',
      alvoTipo: 'tradition', alvoId: tr.id, depois: { categoria, titulo } }, t);
    return Tradicoes.obter(t, tr.id);
  },

  async obter(t, id) {
    const tr = await t.uma(
      `SELECT tr.*, p.nome_exibicao AS de_quem, u.nome AS registrada_por
         FROM traditions tr
         LEFT JOIN persons p ON p.id = tr.person_id
         LEFT JOIN users u ON u.id = tr.created_by
        WHERE tr.id = $1 AND tr.deleted_at IS NULL`, [id]);
    if (!tr) return null;
    tr.receita = await t.uma(`SELECT * FROM recipes WHERE tradition_id = $1`, [id]);
    tr.aprendizes = tr.receita ? await t.todas(
      `SELECT rl.id, rl.person_id, rl.aprendeu_valor, rl.nota, p.nome_exibicao
         FROM recipe_learners rl JOIN persons p ON p.id = rl.person_id
        WHERE rl.recipe_id = $1 ORDER BY rl.aprendeu_ini NULLS LAST, p.nome_exibicao`,
      [tr.receita.id]) : [];
    tr.transmissoes = await t.todas(
      `SELECT x.id, x.de_person_id, x.para_person_id, x.quando_valor, x.nota,
              a.nome_exibicao AS de_nome, b.nome_exibicao AS para_nome
         FROM tradition_transmissions x
         JOIN persons a ON a.id = x.de_person_id
         JOIN persons b ON b.id = x.para_person_id
        WHERE x.tradition_id = $1 ORDER BY x.quando_ini NULLS LAST`, [id]);
    return tr;
  },

  async atualizar(t, { familyId, userId, id, dados }) {
    const antes = await t.uma(`SELECT * FROM traditions WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!antes) throw erro('erro.tradicao_nao_encontrada', 404);
    const desde = dados.desde !== undefined ? campoData(dados.desde, 'desde') : null;

    await t.q(
      `UPDATE traditions SET
         titulo = COALESCE($2, titulo), corpo = COALESCE($3, corpo),
         origem = COALESCE($4, origem), local_texto = COALESCE($5, local_texto),
         person_id = COALESCE($6, person_id), privacidade = COALESCE($7, privacidade),
         desde_valor = COALESCE($8, desde_valor), desde_precisao = COALESCE($9, desde_precisao),
         desde_ini = COALESCE($10, desde_ini), desde_fim = COALESCE($11, desde_fim),
         updated_at = now()
       WHERE id = $1`,
      [id, dados.titulo != null ? s(dados.titulo, 200) : null,
        dados.corpo != null ? s(dados.corpo, 50000) : null,
        dados.origem != null ? s(dados.origem, 1000) : null,
        dados.local != null ? s(dados.local, 200) : null,
        dados.person_id || null, PRIVACIDADES.includes(dados.privacidade) ? dados.privacidade : null,
        desde && desde.desde_valor, desde && desde.desde_precisao,
        desde && desde.desde_ini, desde && desde.desde_fim]);

    if (antes.categoria === 'RECEITA'
        && (dados.ingredientes !== undefined || dados.preparo != null
            || dados.rendimento != null || dados.tempo != null || dados.manuscrito_media_id)) {
      await t.q(
        `UPDATE recipes SET
           ingredientes = COALESCE($2, ingredientes), preparo = COALESCE($3, preparo),
           rendimento = COALESCE($4, rendimento), tempo = COALESCE($5, tempo),
           manuscrito_media_id = COALESCE($6, manuscrito_media_id), updated_at = now()
         WHERE tradition_id = $1`,
        [id, dados.ingredientes !== undefined
          ? JSON.stringify(normalizarIngredientes(dados.ingredientes)) : null,
          dados.preparo != null ? s(dados.preparo, 50000) : null,
          dados.rendimento != null ? s(dados.rendimento, 120) : null,
          dados.tempo != null ? s(dados.tempo, 120) : null,
          dados.manuscrito_media_id || null]);
    }

    await indexar(t, familyId, id);
    await auditar({ familyId, atorUserId: userId, acao: 'tradicao.editada',
      alvoTipo: 'tradition', alvoId: id, antes: { titulo: antes.titulo } }, t);
    return Tradicoes.obter(t, id);
  },

  async arquivar(t, { familyId, userId, id }) {
    const r = await t.uma(
      `UPDATE traditions SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id]);
    if (!r) throw erro('erro.tradicao_nao_encontrada', 404);
    await busca.remover(t, 'tradition', id);
    await busca.remover(t, 'recipe', id);
    await auditar({ familyId, atorUserId: userId, acao: 'tradicao.arquivada',
      alvoTipo: 'tradition', alvoId: id }, t);
    return true;
  },

  /** "Quem aprendeu a fazer" — o que mantém a receita viva (§36). */
  async aprendeu(t, { familyId, userId, tradicaoId, personId, quando, nota }) {
    const existe = await t.uma(
      `SELECT id FROM traditions WHERE id = $1 AND deleted_at IS NULL`, [tradicaoId]);
    if (!existe) throw erro('erro.tradicao_nao_encontrada', 404);
    const r = await t.uma(`SELECT * FROM recipes WHERE tradition_id = $1`, [tradicaoId]);
    if (!r) throw erro('erro.tradicao_nao_e_receita', 400);
    if (!personId) throw erro('erro.tradicao_sem_pessoa', 400);
    const d = campoData(quando, 'aprendeu');
    const l = await t.uma(
      `INSERT INTO recipe_learners (family_id, recipe_id, person_id, aprendeu_valor,
         aprendeu_precisao, aprendeu_ini, aprendeu_fim, nota, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (recipe_id, person_id) DO UPDATE SET
         aprendeu_valor = COALESCE(EXCLUDED.aprendeu_valor, recipe_learners.aprendeu_valor),
         nota = CASE WHEN EXCLUDED.nota <> '' THEN EXCLUDED.nota ELSE recipe_learners.nota END
       RETURNING *`,
      [familyId, r.id, personId, d.aprendeu_valor, d.aprendeu_precisao,
        d.aprendeu_ini, d.aprendeu_fim, s(nota, 500), userId]);
    await indexar(t, familyId, tradicaoId);
    await auditar({ familyId, atorUserId: userId, acao: 'tradicao.aprendiz',
      alvoTipo: 'tradition', alvoId: tradicaoId, depois: { person_id: personId } }, t);
    return l;
  },

  /** A corrente do saber: quem ensinou → quem aprendeu (§37). */
  async transmitir(t, { familyId, userId, tradicaoId, dePersonId, paraPersonId, quando, nota }) {
    if (!dePersonId || !paraPersonId) throw erro('erro.transmissao_incompleta', 400);
    if (dePersonId === paraPersonId) throw erro('erro.transmissao_reflexiva', 400);
    const tr = await t.uma(
      `SELECT id FROM traditions WHERE id = $1 AND deleted_at IS NULL`, [tradicaoId]);
    if (!tr) throw erro('erro.tradicao_nao_encontrada', 404);
    const d = campoData(quando, 'quando');
    const x = await t.uma(
      `INSERT INTO tradition_transmissions (family_id, tradition_id, de_person_id, para_person_id,
         quando_valor, quando_precisao, quando_ini, quando_fim, nota, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tradition_id, de_person_id, para_person_id) DO UPDATE
         SET quando_valor = COALESCE(EXCLUDED.quando_valor, tradition_transmissions.quando_valor)
       RETURNING *`,
      [familyId, tradicaoId, dePersonId, paraPersonId, d.quando_valor, d.quando_precisao,
        d.quando_ini, d.quando_fim, s(nota, 500), userId]);
    await indexar(t, familyId, tradicaoId);
    await auditar({ familyId, atorUserId: userId, acao: 'tradicao.transmitida',
      alvoTipo: 'tradition', alvoId: tradicaoId,
      depois: { de: dePersonId, para: paraPersonId } }, t);
    return x;
  },
};

// =====================================================================
// RELÍQUIAS
// =====================================================================

const indexarReliquia = async (t, familyId, id) => {
  const h = await t.uma(`SELECT * FROM heirlooms WHERE id = $1`, [id]);
  if (!h || h.deleted_at) return null;
  const donos = await t.todas(
    `SELECT person_id FROM heirloom_custody WHERE heirloom_id = $1`, [id]);
  const primeira = await t.uma(
    `SELECT de_ini, de_fim FROM heirloom_custody WHERE heirloom_id = $1
      ORDER BY de_ini NULLS LAST LIMIT 1`, [id]);
  return busca.indexar(t, {
    familyId, refTipo: 'heirloom', refId: id, titulo: h.nome,
    corpo: [h.descricao, h.origem].filter(Boolean).join('\n'),
    pessoas: [...new Set(donos.map((d) => d.person_id))],
    dataIni: primeira && primeira.de_ini, dataFim: null,
    localTexto: h.local_texto, privacidade: h.privacidade, criadoPor: h.created_by });
};

const Reliquias = {
  listar: (t, familyId, { pessoaId = null, limite = 100 } = {}) => t.todas(
    `SELECT h.id, h.nome, h.descricao, h.origem, h.local_texto, h.privacidade,
            h.capa_media_id, h.created_by, h.created_at,
            c.person_id AS com_quem_id, p.nome_exibicao AS com_quem, c.de_valor AS desde,
            (SELECT count(*)::int FROM heirloom_custody x WHERE x.heirloom_id = h.id) AS maos
       FROM heirlooms h
       LEFT JOIN heirloom_custody c ON c.heirloom_id = h.id AND c.ate_valor IS NULL
       LEFT JOIN persons p ON p.id = c.person_id
      WHERE h.family_id = $1 AND h.deleted_at IS NULL
        AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM heirloom_custody y
              WHERE y.heirloom_id = h.id AND y.person_id = $2))
      ORDER BY h.nome LIMIT $3`, [familyId, pessoaId, Math.min(limite, 300)]),

  async criar(t, { familyId, userId, dados }) {
    const nome = s(dados.nome, 200);
    if (nome.length < 2) throw erro('erro.reliquia_sem_nome', 400);
    const h = await t.uma(
      `INSERT INTO heirlooms (family_id, nome, descricao, origem, capa_media_id,
         local_texto, privacidade, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [familyId, nome, s(dados.descricao, 20000), s(dados.origem, 2000),
        dados.capa_media_id || null, s(dados.local, 200), priv(dados.privacidade), userId]);

    // Quem está com ela hoje já é a primeira custódia — é a pergunta que
    // a família responde na hora de cadastrar, e sem ela o objeto nasce
    // com uma lacuna que o Historiador vai cobrar (e deve).
    if (dados.com_quem) {
      await Reliquias.transferir(t, { familyId, userId, heirloomId: h.id,
        personId: dados.com_quem, de: dados.desde, nota: s(dados.nota_posse, 500) });
    }
    await indexarReliquia(t, familyId, h.id);
    await auditar({ familyId, atorUserId: userId, acao: 'reliquia.criada',
      alvoTipo: 'heirloom', alvoId: h.id, depois: { nome } }, t);
    return Reliquias.obter(t, h.id);
  },

  async obter(t, id) {
    const h = await t.uma(
      `SELECT h.*, u.nome AS registrada_por FROM heirlooms h
         LEFT JOIN users u ON u.id = h.created_by
        WHERE h.id = $1 AND h.deleted_at IS NULL`, [id]);
    if (!h) return null;
    h.custodia = await Reliquias.custodiaDe(t, id);
    h.com_quem = h.custodia.find((c) => !c.ate_valor) || null;
    return h;
  },

  /** A linha de posse, do mais antigo ao mais recente (§38). */
  custodiaDe: (t, id) => t.todas(
    `SELECT c.id, c.person_id, c.de_valor, c.de_precisao, c.de_ini,
            c.ate_valor, c.ate_precisao, c.nota, c.source_id, c.created_at,
            p.nome_exibicao, f.tipo AS fonte_tipo, f.titulo AS fonte_titulo
       FROM heirloom_custody c
       JOIN persons p ON p.id = c.person_id
       LEFT JOIN sources f ON f.id = c.source_id
      WHERE c.heirloom_id = $1
      ORDER BY c.de_ini NULLS FIRST, c.created_at`, [id]),

  /**
   * Passar o objeto de mão. FECHA a custódia aberta (com a data em que
   * saiu) e ABRE a nova. Nenhuma linha é sobrescrita: a corrente inteira
   * continua legível, que é o valor histórico do objeto.
   */
  async transferir(t, { familyId, userId, heirloomId, personId, de, ate, nota, sourceId }) {
    const h = await t.uma(
      `SELECT id FROM heirlooms WHERE id = $1 AND deleted_at IS NULL`, [heirloomId]);
    if (!h) throw erro('erro.reliquia_nao_encontrada', 404);
    if (!personId) throw erro('erro.custodia_sem_pessoa', 400);
    const dDe = campoData(de, 'de');
    const dAte = campoData(ate, 'ate');

    const aberta = await t.uma(
      `SELECT * FROM heirloom_custody WHERE heirloom_id = $1 AND ate_valor IS NULL`, [heirloomId]);
    if (aberta) {
      if (aberta.person_id === personId) throw erro('erro.custodia_ja_e_dele', 409);
      // A saída do anterior é a entrada do novo. Sem data informada, o
      // registro anterior é fechado com a marca de "até a transferência":
      // fechar sem dizer quando é honesto; inventar um dia não é.
      await t.q(
        `UPDATE heirloom_custody SET ate_valor = COALESCE($2, 'até a transferência'),
                ate_precisao = $3, ate_ini = $4, ate_fim = $5
          WHERE id = $1`,
        [aberta.id, dDe.de_valor, dDe.de_precisao, dDe.de_ini, dDe.de_fim]);
    }

    const c = await t.uma(
      `INSERT INTO heirloom_custody (family_id, heirloom_id, person_id,
         de_valor, de_precisao, de_ini, de_fim, ate_valor, ate_precisao, ate_ini, ate_fim,
         nota, source_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [familyId, heirloomId, personId, dDe.de_valor, dDe.de_precisao, dDe.de_ini, dDe.de_fim,
        dAte.ate_valor, dAte.ate_precisao, dAte.ate_ini, dAte.ate_fim,
        s(nota, 500), sourceId || null, userId]);

    await indexarReliquia(t, familyId, heirloomId);
    await auditar({ familyId, atorUserId: userId, acao: 'reliquia.custodia',
      alvoTipo: 'heirloom', alvoId: heirloomId,
      antes: aberta ? { com: aberta.person_id } : null, depois: { com: personId } }, t);
    return c;
  },

  async arquivar(t, { familyId, userId, id }) {
    const r = await t.uma(
      `UPDATE heirlooms SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id]);
    if (!r) throw erro('erro.reliquia_nao_encontrada', 404);
    await busca.remover(t, 'heirloom', id);
    await auditar({ familyId, atorUserId: userId, acao: 'reliquia.arquivada',
      alvoTipo: 'heirloom', alvoId: id }, t);
    return true;
  },
};

module.exports = { CATEGORIAS, Tradicoes, Reliquias, indexar, indexarReliquia, normalizarIngredientes };
