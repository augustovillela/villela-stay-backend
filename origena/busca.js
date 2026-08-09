// =====================================================================
// ORIGENA — busca (§43).
//
// UM índice para todos os tipos. A família procura "vovó Pirapora", não
// escolhe antes se quer procurar em fotos ou em documentos.
//
// DUAS TRAVAS QUE NÃO PODEM CAIR:
//   1. o escopo de família vem do RLS + da transação escopada;
//   2. o resultado passa por `podeVer` ANTES de sair — um documento
//      PRIVATE não pode aparecer no resultado de quem não pode abri-lo,
//      nem como título (SECURITY.md T8).
//
// O `tsv` é coluna GERADA no banco: não existe passo manual de
// "reindexar", logo não existe índice fora de sincronia com o texto.
// =====================================================================
'use strict';
const privacidade = require('./privacidade');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

/**
 * Escreve/atualiza a entrada de busca de um registro.
 * Chamado por quem cria o registro, na MESMA transação — o índice nasce
 * com o dado, não depois.
 */
async function indexar(t, { familyId, refTipo, refId, titulo = '', corpo = '',
  pessoas = [], autorId = null, dataIni = null, dataFim = null, localTexto = '',
  privacidade: priv = 'FAMILY', criadoPor = null }) {
  return t.uma(
    `INSERT INTO busca (family_id, ref_tipo, ref_id, titulo, corpo, pessoas, autor_id,
       data_ini, data_fim, local_texto, privacidade, criado_por, atualizado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
     ON CONFLICT (family_id, ref_tipo, ref_id) DO UPDATE SET
       titulo = EXCLUDED.titulo, corpo = EXCLUDED.corpo, pessoas = EXCLUDED.pessoas,
       autor_id = EXCLUDED.autor_id, data_ini = EXCLUDED.data_ini, data_fim = EXCLUDED.data_fim,
       local_texto = EXCLUDED.local_texto, privacidade = EXCLUDED.privacidade,
       atualizado_em = now()
     RETURNING id`,
    [familyId, refTipo, refId, s(titulo, 300), s(corpo, 200000),
      pessoas.filter(Boolean), autorId, dataIni, dataFim, s(localTexto, 200), priv, criadoPor]);
}

const remover = (t, refTipo, refId) =>
  t.q(`DELETE FROM busca WHERE ref_tipo = $1 AND ref_id = $2`, [refTipo, refId]);

/**
 * Expande plurais que o stemmer português NÃO unifica. Medido no banco:
 * `viagem` vira o radical `viag`, mas `viagens` fica `viagens` — quem
 * procura no plural não acha o singular. As regras de plural do português
 * são regulares o bastante para expandir na entrada:
 *   viagens→viagem · aviões→avião · pães→pão · animais→animal · papéis→papel
 * Cada palavra vira (original | variantes), e as palavras se combinam com E.
 */
// Palavras de PERGUNTA não são termo de busca: "quando nasceu o Antônio?"
// procura por "nasceu" e "antônio", não por "quando".
const IGNORAR = new Set(['quando', 'quem', 'onde', 'como', 'qual', 'quais', 'que', 'por',
  'porque', 'foi', 'era', 'sao', 'são', 'uma', 'uns', 'umas', 'com', 'para', 'dos', 'das',
  'the', 'ele', 'ela', 'eles', 'elas', 'meu', 'minha', 'seu', 'sua', 'nos', 'nas']);

function montarTsquery(termo, { ou = false } = {}) {
  let palavras = String(termo).toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((p) => p.length >= 2);
  const uteis = palavras.filter((p) => !IGNORAR.has(p));
  if (uteis.length) palavras = uteis;      // se SÓ há stopwords, usa o que veio
  if (!palavras.length) return '';
  const grupos = palavras.map((p) => {
    const v = new Set([p]);
    if (/ões$/.test(p)) v.add(p.slice(0, -3) + 'ão');
    if (/ães$/.test(p)) v.add(p.slice(0, -3) + 'ão');
    if (/ns$/.test(p)) v.add(p.slice(0, -2) + 'm');
    if (/ais$/.test(p)) v.add(p.slice(0, -2) + 'l');
    if (/éis$/.test(p)) v.add(p.slice(0, -3) + 'el');
    if (/óis$/.test(p)) v.add(p.slice(0, -3) + 'ol');
    if (/s$/.test(p) && p.length > 3) v.add(p.slice(0, -1));
    return '(' + [...v].join(' | ') + ')';
  });
  // E para a caixa de busca (precisão); OU para o RAG (cobertura).
  return grupos.join(ou ? ' | ' : ' & ');
}

/**
 * Procura. `termo` vazio é legítimo: vira navegação por filtros, que é
 * como se acha "tudo o que é de 1940" sem lembrar palavra nenhuma.
 *
 * O CASE é o que permite UMA query para os dois modos: o Postgres avalia
 * CASE preguiçosamente, então `to_tsquery('')` nunca roda quando não há
 * termo — e todos os parâmetros existem sempre, com tipo definido.
 */
async function procurar(t, familyId, { termo = '', tipos = null, pessoaId = null,
  autorId = null, de = null, ate = null, local = '', limite = 40, offset = 0,
  modoOu = false } = {}) {
  const tsq = montarTsquery(s(termo, 200), { ou: modoOu });

  const linhas = await t.todas(
    `SELECT b.ref_tipo, b.ref_id, b.titulo, b.local_texto, b.privacidade, b.criado_por,
            b.data_ini, b.pessoas,
            CASE WHEN $2 = '' THEN 0
                 ELSE ts_rank(b.tsv, to_tsquery('portuguese', $2)) END AS peso,
            CASE WHEN $2 = '' THEN left(b.corpo, 180)
                 ELSE ts_headline('portuguese', left(b.corpo, 4000),
                        to_tsquery('portuguese', $2),
                        'MaxWords=22, MinWords=8, ShortWord=3, MaxFragments=1, StartSel=«, StopSel=»')
            END AS trecho
       FROM busca b
      WHERE b.family_id = $1
        AND ($2 = '' OR b.tsv @@ to_tsquery('portuguese', $2))
        AND ($3::text[] IS NULL OR b.ref_tipo = ANY($3))
        AND ($4::uuid IS NULL OR $4 = ANY(b.pessoas))
        AND ($5::uuid IS NULL OR b.autor_id = $5 OR b.criado_por = $5)
        AND ($6::date IS NULL OR b.data_fim IS NULL OR b.data_fim >= $6)
        AND ($7::date IS NULL OR b.data_ini IS NULL OR b.data_ini <= $7)
        AND ($8 = '' OR b.local_texto ILIKE '%' || $8 || '%')
      ORDER BY peso DESC, b.data_ini DESC NULLS LAST, b.atualizado_em DESC
      LIMIT $9 OFFSET $10`,
    [familyId, tsq, tipos && tipos.length ? tipos : null, pessoaId, autorId,
      de, ate, s(local, 100), Math.min(limite, 100), Math.max(0, offset)]);

  return linhas;
}

/**
 * Filtra o resultado pelas permissões de QUEM perguntou.
 *
 * Roda depois da consulta, e não como `WHERE`, porque a regra de
 * privacidade é uma só (privacidade.js) e duplicá-la em SQL é o caminho
 * conhecido para as duas saírem de sincronia.
 */
function filtrar(linhas, quem) {
  return linhas.filter((l) => {
    const ativo = { privacidade: l.privacidade, created_by: l.criado_por };
    if (l.ref_tipo === 'document') return privacidade.podeVerDocumento(ativo, quem).pode;
    return privacidade.podeVer(ativo, quem).pode;
  });
}

module.exports = { indexar, remover, procurar, filtrar };
