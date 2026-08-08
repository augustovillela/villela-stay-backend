// =====================================================================
// ORIGENA — parentesco e árvore (§12).
//
// Tudo aqui roda DENTRO do escopo da família (tenancy.comEscopo): as
// consultas recebem o cliente da transação, nunca o pool solto. O RLS é
// a rede de segurança; o escopo explícito é o desenho.
//
// DECISÕES DE DOMÍNIO QUE NÃO SÃO ÓBVIAS:
//
// 1. IRMÃO É DERIVADO. Dois filhos do mesmo pai são irmãos por consulta,
//    não por aresta. Declarar SIBLING_OF em toda família dobraria o
//    trabalho e sairia de sincronia na primeira correção de filiação.
//    A aresta explícita existe só para quem não tem ascendente conhecido.
//
// 2. ADOÇÃO NÃO SUBSTITUI. As duas filiações coexistem, com `natureza`
//    diferente, e a árvore mostra as duas. Escolher uma seria apagar
//    história (§4).
//
// 3. CICLO É IMPOSSÍVEL. Postgres não tem constraint de grafo, então a
//    verificação é feita antes do INSERT, com CTE recursiva. Sem isso,
//    "A é pai de B" + "B é pai de A" derruba qualquer renderização — e
//    corrompe a genealogia em silêncio.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const datas = require('./datas');

const COLUNAS = ['id', 'nome_exibicao', 'apelido', 'sobrenome', 'vitalidade', 'genero',
  'nascimento_valor', 'nascimento_precisao', 'nascimento_ini', 'nascimento_fim',
  'falecimento_valor', 'falecimento_precisao', 'falecimento_ini', 'falecimento_fim',
  'local_nascimento', 'profissao', 'capa_media_id', 'privacidade', 'eh_menor'];

// `p.${CAMPOS}` prefixaria só a primeira coluna da lista — um erro que o
// Postgres aceita e que faz a consulta trazer coluna do JOIN errado.
const cols = (alias) => COLUNAS.map((c) => `${alias}.${c}`).join(', ');
const CAMPOS = COLUNAS.join(', ');

// ------------------------------------------------------------ vizinhança
const paisDe = (t, id) => t.todas(
  `SELECT ${cols('p')}, r.natureza, r.id AS rel_id
     FROM relationships r JOIN persons p ON p.id = r.person_a
    WHERE r.tipo = 'PARENT_OF' AND r.person_b = $1 AND r.deleted_at IS NULL AND p.deleted_at IS NULL
    ORDER BY p.nascimento_ini NULLS LAST`, [id]);

const filhosDe = (t, id) => t.todas(
  `SELECT ${cols('p')}, r.natureza, r.id AS rel_id
     FROM relationships r JOIN persons p ON p.id = r.person_b
    WHERE r.tipo = 'PARENT_OF' AND r.person_a = $1 AND r.deleted_at IS NULL AND p.deleted_at IS NULL
    ORDER BY p.nascimento_ini NULLS LAST`, [id]);

const unioesDe = (t, id) => t.todas(
  `SELECT ${cols('p')}, r.tipo, r.natureza, r.id AS rel_id,
          r.inicio_valor, r.fim_valor
     FROM relationships r
     JOIN persons p ON p.id = CASE WHEN r.person_a = $1 THEN r.person_b ELSE r.person_a END
    WHERE r.tipo IN ('SPOUSE_OF','PARTNER_OF') AND $1 IN (r.person_a, r.person_b)
      AND r.deleted_at IS NULL AND p.deleted_at IS NULL
    ORDER BY r.inicio_ini NULLS LAST`, [id]);

/**
 * Irmãos: os DERIVADOS (mesmo pai ou mãe) mais os declarados.
 * `meio` marca quem compartilha só um ascendente — a família costuma
 * fazer questão dessa distinção.
 */
async function irmaosDe(t, id) {
  const derivados = await t.todas(
    // DISTINCT nos dois lugares: a mesma pessoa pode ser ascendente por
    // DUAS naturezas (biológica E adotiva, §4 — as duas coexistem). Sem
    // isso, um ascendente comum é contado duas vezes e um meio-irmão
    // passa por irmão inteiro.
    `WITH meus_pais AS (
       SELECT DISTINCT person_a AS pai FROM relationships
        WHERE tipo='PARENT_OF' AND person_b=$1 AND deleted_at IS NULL)
     SELECT ${cols('p')}, count(DISTINCT r.person_a)::int AS pais_em_comum, false AS declarado
       FROM relationships r
       JOIN meus_pais mp ON mp.pai = r.person_a
       JOIN persons p ON p.id = r.person_b
      WHERE r.tipo='PARENT_OF' AND r.person_b <> $1 AND r.deleted_at IS NULL AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.nascimento_ini NULLS LAST`, [id]);

  const declarados = await t.todas(
    `SELECT ${cols('p')}, 0::int AS pais_em_comum, true AS declarado
       FROM relationships r
       JOIN persons p ON p.id = CASE WHEN r.person_a=$1 THEN r.person_b ELSE r.person_a END
      WHERE r.tipo='SIBLING_OF' AND $1 IN (r.person_a, r.person_b)
        AND r.deleted_at IS NULL AND p.deleted_at IS NULL`, [id]);

  const vistos = new Set(derivados.map((x) => x.id));
  return [...derivados, ...declarados.filter((x) => !vistos.has(x.id))]
    .map((x) => ({ ...x, meio: !x.declarado && x.pais_em_comum < 2 }));
}

// ------------------------------------------------------------- ancestrais
/** CTE recursiva com corte de profundidade — família grande não trava a tela. */
const ancestraisDe = (t, id, geracoes = 6) => t.todas(
  `WITH RECURSIVE sobe(id, geracao, via) AS (
     SELECT $1::uuid, 0, NULL::text
     UNION ALL
     SELECT r.person_a, s.geracao + 1, r.natureza
       FROM sobe s JOIN relationships r ON r.person_b = s.id
      WHERE r.tipo='PARENT_OF' AND r.deleted_at IS NULL AND s.geracao < $2)
   SELECT ${cols('p')}, s.geracao, s.via AS natureza
     FROM sobe s JOIN persons p ON p.id = s.id
    WHERE s.geracao > 0 AND p.deleted_at IS NULL
    ORDER BY s.geracao, p.nascimento_ini NULLS LAST`, [id, geracoes]);

const descendentesDe = (t, id, geracoes = 6) => t.todas(
  `WITH RECURSIVE desce(id, geracao, via) AS (
     SELECT $1::uuid, 0, NULL::text
     UNION ALL
     SELECT r.person_b, d.geracao + 1, r.natureza
       FROM desce d JOIN relationships r ON r.person_a = d.id
      WHERE r.tipo='PARENT_OF' AND r.deleted_at IS NULL AND d.geracao < $2)
   SELECT ${cols('p')}, d.geracao, d.via AS natureza
     FROM desce d JOIN persons p ON p.id = d.id
    WHERE d.geracao > 0 AND p.deleted_at IS NULL
    ORDER BY d.geracao, p.nascimento_ini NULLS LAST`, [id, geracoes]);

/**
 * `descendente` já é ancestral de `ascendente`? Se for, criar a aresta
 * fecharia um ciclo. Roda ANTES do INSERT.
 */
async function criariaCiclo(t, ascendenteId, descendenteId) {
  if (ascendenteId === descendenteId) return true;
  const r = await t.uma(
    `WITH RECURSIVE sobe(id, n) AS (
       SELECT $1::uuid, 0
       UNION ALL
       SELECT rel.person_a, s.n + 1 FROM sobe s
         JOIN relationships rel ON rel.person_b = s.id
        WHERE rel.tipo='PARENT_OF' AND rel.deleted_at IS NULL AND s.n < 60)
     SELECT 1 AS achou FROM sobe WHERE id = $2 LIMIT 1`, [ascendenteId, descendenteId]);
  return !!r;
}

// ------------------------------------------------------------ a árvore
/**
 * Dados para desenhar. `modo`:
 *   'ancestral'   — sobe (pais, avós…)
 *   'descendentes'— desce (filhos, netos…)
 *   'ambos'       — a pessoa no meio
 *
 * Devolve nós com `geracao` (negativa acima, positiva abaixo) e as
 * arestas. O layout (x, y) fica no navegador: é lá que se sabe o tamanho
 * da tela.
 */
async function montar(t, raizId, { modo = 'ambos', geracoes = 4 } = {}) {
  const raiz = await t.uma(`SELECT ${CAMPOS} FROM persons WHERE id = $1 AND deleted_at IS NULL`, [raizId]);
  if (!raiz) throw erro('erro.pessoa_nao_encontrada', 404);

  const nos = new Map([[raiz.id, { ...raiz, geracao: 0, raiz: true }]]);
  const por = (lista, sinal) => lista.forEach((p) => {
    if (!nos.has(p.id)) nos.set(p.id, { ...p, geracao: sinal * p.geracao });
  });

  if (modo !== 'descendentes') por(await ancestraisDe(t, raizId, geracoes), -1);
  if (modo !== 'ancestral') por(await descendentesDe(t, raizId, geracoes), +1);

  // Cônjuges dos nós já presentes entram na MESMA geração — sem eles a
  // árvore mostra filhos que parecem ter só um ascendente.
  for (const id of [...nos.keys()]) {
    for (const c of await unioesDe(t, id)) {
      if (!nos.has(c.id)) nos.set(c.id, { ...c, geracao: nos.get(id).geracao, por_uniao: true });
    }
  }

  const ids = [...nos.keys()];
  const arestas = ids.length ? await t.todas(
    `SELECT id, person_a, person_b, tipo, natureza, inicio_valor, fim_valor
       FROM relationships
      WHERE deleted_at IS NULL AND person_a = ANY($1::uuid[]) AND person_b = ANY($1::uuid[])`,
    [ids]) : [];

  return {
    raiz: raiz.id,
    modo,
    nos: [...nos.values()].map((p) => ({
      ...p,
      ano_nascimento: datas.anoDe(p.nascimento_ini, p.nascimento_fim),
      ano_falecimento: datas.anoDe(p.falecimento_ini, p.falecimento_fim),
    })),
    arestas,
  };
}

/** Vizinhança completa de uma pessoa — alimenta a aba "Família" do dossiê. */
async function familiaDe(t, id) {
  // Sequencial, e não Promise.all: um cliente `pg` não executa duas
  // consultas ao mesmo tempo — em paralelo ele avisa (deprecação) hoje e
  // quebra no pg 9. Dentro de uma transação, sequencial é o correto.
  const pais = await paisDe(t, id);
  const filhos = await filhosDe(t, id);
  const unioes = await unioesDe(t, id);
  const irmaos = await irmaosDe(t, id);
  return { pais, filhos, unioes, irmaos };
}

module.exports = {
  CAMPOS, paisDe, filhosDe, unioesDe, irmaosDe,
  ancestraisDe, descendentesDe, criariaCiclo, montar, familiaDe,
};
