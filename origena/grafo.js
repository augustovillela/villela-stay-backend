// =====================================================================
// ORIGENA — o grafo da família (§20, fase 2.5).
//
// "COMO ANA SE LIGA A ESTA FOTOGRAFIA?" é a pergunta que este módulo
// existe para responder — e responder MOSTRANDO O CAMINHO, não com um
// número de similaridade.
//
// O GRAFO É DERIVADO, NÃO GUARDADO. O `DATABASE.md` esboçava uma tabela
// `knowledge_relations`; aqui ela não existe, pelo mesmo motivo da linha
// do tempo: as arestas JÁ existem nas tabelas relacionais (parentesco,
// quem aparece na foto, quem participou do evento, quem aprendeu a
// receita, quem teve a relíquia na mão). Materializar criaria uma segunda
// verdade para manter em sincronia, e grafo desatualizado mente com cara
// de precisão. Em escala de família — centenas de pessoas, milhares de
// mídias — derivar custa uma consulta por salto, e vale o preço.
//
// TODA ARESTA TEM MOTIVO. Nenhuma ligação aparece sem dizer POR QUE
// existe ("aparece na mesma foto", "aprendeu a receita com"). Ligação sem
// motivo é a definição de grafo que não se pode auditar — o oposto do
// produto.
//
// PRIVACIDADE NA ARESTA, NÃO SÓ NO NÓ. É aqui que um acervo vaza sem
// querer: a foto privada não aparece na galeria, mas apareceria como
// vizinha de alguém. Todo nó passa por `podeVer` antes de virar aresta.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const privacidade = require('./privacidade');

const TIPOS = ['person', 'media', 'story', 'event', 'place', 'tradition', 'heirloom', 'interview'];

/**
 * Vizinhos de um nó. Cada consulta devolve o mesmo formato:
 *   { tipo, id, rotulo, motivo (chave i18n), privacidade, created_by }
 * — e o chamador filtra por permissão antes de mostrar.
 */
const CONSULTAS = {
  person: [
    // parentesco nos dois sentidos: a aresta é a mesma, o motivo muda
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_parente' AS motivo, r.tipo AS detalhe
              FROM relationships r JOIN persons p ON p.id = r.person_b
             WHERE r.person_a = $1 AND r.deleted_at IS NULL AND p.deleted_at IS NULL` },
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_parente' AS motivo, r.tipo AS detalhe
              FROM relationships r JOIN persons p ON p.id = r.person_a
             WHERE r.person_b = $1 AND r.deleted_at IS NULL AND p.deleted_at IS NULL` },
    { sql: `SELECT m.id, COALESCE(NULLIF(m.titulo,''), m.nome_original) AS rotulo, m.privacidade,
                   m.created_by, false AS eh_menor, 'media' AS tipo,
                   'grafo.m_aparece' AS motivo, mp.origem AS detalhe
              FROM media_persons mp JOIN media m ON m.id = mp.media_id
             WHERE mp.person_id = $1 AND m.deleted_at IS NULL` },
    { sql: `SELECT s.id, s.titulo AS rotulo, s.privacidade, s.created_by, false AS eh_menor,
                   'story' AS tipo, 'grafo.m_citado' AS motivo, '' AS detalhe
              FROM story_mentions sm JOIN stories s ON s.id = sm.story_id
             WHERE sm.person_id = $1 AND s.deleted_at IS NULL` },
    { sql: `SELECT e.id, e.titulo AS rotulo, e.privacidade, e.created_by, false AS eh_menor,
                   'event' AS tipo, 'grafo.m_participou' AS motivo, ep.papel AS detalhe
              FROM event_participants ep JOIN events e ON e.id = ep.event_id
             WHERE ep.person_id = $1 AND e.deleted_at IS NULL` },
    { sql: `SELECT tr.id, tr.titulo AS rotulo, tr.privacidade, tr.created_by, false AS eh_menor,
                   'tradition' AS tipo, 'grafo.m_tradicao_de' AS motivo, tr.categoria AS detalhe
              FROM traditions tr WHERE tr.person_id = $1 AND tr.deleted_at IS NULL` },
    { sql: `SELECT tr.id, tr.titulo AS rotulo, tr.privacidade, tr.created_by, false AS eh_menor,
                   'tradition' AS tipo, 'grafo.m_aprendeu' AS motivo, '' AS detalhe
              FROM recipe_learners rl JOIN recipes rc ON rc.id = rl.recipe_id
              JOIN traditions tr ON tr.id = rc.tradition_id
             WHERE rl.person_id = $1 AND tr.deleted_at IS NULL` },
    { sql: `SELECT h.id, h.nome AS rotulo, h.privacidade, h.created_by, false AS eh_menor,
                   'heirloom' AS tipo, 'grafo.m_teve' AS motivo,
                   CASE WHEN hc.ate_valor IS NULL THEN 'hoje' ELSE '' END AS detalhe
              FROM heirloom_custody hc JOIN heirlooms h ON h.id = hc.heirloom_id
             WHERE hc.person_id = $1 AND h.deleted_at IS NULL` },
    { sql: `SELECT i.id, COALESCE(NULLIF(i.titulo,''), i.roteiro) AS rotulo, i.privacidade,
                   i.created_by, false AS eh_menor, 'interview' AS tipo,
                   'grafo.m_entrevistado' AS motivo, i.roteiro AS detalhe
              FROM interviews i WHERE i.person_id = $1 AND i.deleted_at IS NULL` },
  ],
  media: [
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_mostra' AS motivo, mp.origem AS detalhe
              FROM media_persons mp JOIN persons p ON p.id = mp.person_id
             WHERE mp.media_id = $1 AND p.deleted_at IS NULL` },
    { sql: `SELECT s.id, s.titulo AS rotulo, s.privacidade, s.created_by, false AS eh_menor,
                   'story' AS tipo, 'grafo.m_ilustra' AS motivo, '' AS detalhe
              FROM story_mentions sm JOIN stories s ON s.id = sm.story_id
             WHERE sm.media_id = $1 AND s.deleted_at IS NULL` },
  ],
  story: [
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_citado' AS motivo, '' AS detalhe
              FROM story_mentions sm JOIN persons p ON p.id = sm.person_id
             WHERE sm.story_id = $1 AND p.deleted_at IS NULL` },
    { sql: `SELECT m.id, COALESCE(NULLIF(m.titulo,''), m.nome_original) AS rotulo, m.privacidade,
                   m.created_by, false AS eh_menor, 'media' AS tipo,
                   'grafo.m_ilustra' AS motivo, '' AS detalhe
              FROM story_mentions sm JOIN media m ON m.id = sm.media_id
             WHERE sm.story_id = $1 AND m.deleted_at IS NULL` },
  ],
  event: [
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_participou' AS motivo, ep.papel AS detalhe
              FROM event_participants ep JOIN persons p ON p.id = ep.person_id
             WHERE ep.event_id = $1 AND p.deleted_at IS NULL` },
    { sql: `SELECT pl.id, pl.nome AS rotulo, 'FAMILY' AS privacidade, pl.created_by,
                   false AS eh_menor, 'place' AS tipo, 'grafo.m_aconteceu_em' AS motivo, '' AS detalhe
              FROM events e JOIN places pl ON pl.id = e.place_id
             WHERE e.id = $1 AND pl.deleted_at IS NULL` },
  ],
  place: [
    { sql: `SELECT e.id, e.titulo AS rotulo, e.privacidade, e.created_by, false AS eh_menor,
                   'event' AS tipo, 'grafo.m_aconteceu_aqui' AS motivo, e.tipo AS detalhe
              FROM events e WHERE e.place_id = $1 AND e.deleted_at IS NULL` },
  ],
  tradition: [
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_tradicao_de' AS motivo, '' AS detalhe
              FROM traditions tr JOIN persons p ON p.id = tr.person_id
             WHERE tr.id = $1 AND p.deleted_at IS NULL` },
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_aprendeu' AS motivo, '' AS detalhe
              FROM recipes rc JOIN recipe_learners rl ON rl.recipe_id = rc.id
              JOIN persons p ON p.id = rl.person_id
             WHERE rc.tradition_id = $1 AND p.deleted_at IS NULL` },
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_transmitiu' AS motivo, '' AS detalhe
              FROM tradition_transmissions tt JOIN persons p ON p.id = tt.de_person_id
             WHERE tt.tradition_id = $1 AND p.deleted_at IS NULL` },
  ],
  heirloom: [
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_teve' AS motivo,
                   CASE WHEN hc.ate_valor IS NULL THEN 'hoje' ELSE '' END AS detalhe
              FROM heirloom_custody hc JOIN persons p ON p.id = hc.person_id
             WHERE hc.heirloom_id = $1 AND p.deleted_at IS NULL` },
  ],
  interview: [
    { sql: `SELECT p.id, p.nome_exibicao AS rotulo, p.privacidade, p.created_by, p.eh_menor,
                   'person' AS tipo, 'grafo.m_entrevistado' AS motivo, '' AS detalhe
              FROM interviews i JOIN persons p ON p.id = i.person_id
             WHERE i.id = $1 AND p.deleted_at IS NULL` },
  ],
};

/** Rótulo de um nó — o suficiente para a tela mostrar o caminho. */
const ROTULO = {
  person: `SELECT nome_exibicao AS rotulo, privacidade, created_by, eh_menor FROM persons WHERE id = $1 AND deleted_at IS NULL`,
  media: `SELECT COALESCE(NULLIF(titulo,''), nome_original) AS rotulo, privacidade, created_by, false AS eh_menor FROM media WHERE id = $1 AND deleted_at IS NULL`,
  story: `SELECT titulo AS rotulo, privacidade, created_by, false AS eh_menor FROM stories WHERE id = $1 AND deleted_at IS NULL`,
  event: `SELECT titulo AS rotulo, privacidade, created_by, false AS eh_menor FROM events WHERE id = $1 AND deleted_at IS NULL`,
  place: `SELECT nome AS rotulo, 'FAMILY' AS privacidade, created_by, false AS eh_menor FROM places WHERE id = $1 AND deleted_at IS NULL`,
  tradition: `SELECT titulo AS rotulo, privacidade, created_by, false AS eh_menor FROM traditions WHERE id = $1 AND deleted_at IS NULL`,
  heirloom: `SELECT nome AS rotulo, privacidade, created_by, false AS eh_menor FROM heirlooms WHERE id = $1 AND deleted_at IS NULL`,
  interview: `SELECT COALESCE(NULLIF(titulo,''), roteiro) AS rotulo, privacidade, created_by, false AS eh_menor FROM interviews WHERE id = $1 AND deleted_at IS NULL`,
};

async function no(t, tipo, id) {
  if (!ROTULO[tipo]) throw erro('erro.grafo_tipo_invalido', 400);
  const n = await t.uma(ROTULO[tipo], [id]);
  return n ? { tipo, id, ...n } : null;
}

/** Vizinhos VISÍVEIS de um nó, já sem duplicatas. */
async function vizinhos(t, { tipo, id, quem, limite = 80 }) {
  const consultas = CONSULTAS[tipo];
  if (!consultas) throw erro('erro.grafo_tipo_invalido', 400);
  const vistos = new Set([tipo + ':' + id]);
  const saida = [];
  for (const c of consultas) {
    for (const l of await t.todas(c.sql, [id])) {
      const chave = l.tipo + ':' + l.id;
      if (vistos.has(chave)) continue;
      // a aresta some junto com o nó: privacidade se aplica ao vizinho,
      // não só à página que se está olhando
      if (!privacidade.podeVer(l, quem).pode) continue;
      vistos.add(chave);
      saida.push({ tipo: l.tipo, id: l.id, rotulo: l.rotulo || '',
        motivo: l.motivo, detalhe: l.detalhe || '' });
      if (saida.length >= limite) return saida;
    }
  }
  return saida;
}

/**
 * O caminho entre dois nós — largura primeiro, com teto de saltos.
 *
 * Devolve a SEQUÊNCIA com o motivo de cada elo ("Ana → aparece na foto do
 * casamento → que mostra → Antônio"). Sem caminho, devolve null: é
 * resposta legítima, e melhor que inventar proximidade.
 */
async function caminho(t, { de, para, quem, maxSaltos = 4, tetoNos = 600 }) {
  if (!ROTULO[de.tipo] || !ROTULO[para.tipo]) throw erro('erro.grafo_tipo_invalido', 400);
  const origem = await no(t, de.tipo, de.id);
  const destino = await no(t, para.tipo, para.id);
  if (!origem || !privacidade.podeVer(origem, quem).pode) throw erro('erro.grafo_no_nao_encontrado', 404);
  if (!destino || !privacidade.podeVer(destino, quem).pode) throw erro('erro.grafo_no_nao_encontrado', 404);

  const chave = (n) => n.tipo + ':' + n.id;
  const alvo = chave(destino);
  if (chave(origem) === alvo) return { passos: [], saltos: 0 };

  const anterior = new Map([[chave(origem), null]]);
  let fronteira = [{ tipo: origem.tipo, id: origem.id, rotulo: origem.rotulo }];
  let visitados = 1;

  for (let salto = 0; salto < maxSaltos && fronteira.length; salto++) {
    const proxima = [];
    for (const atual of fronteira) {
      for (const v of await vizinhos(t, { tipo: atual.tipo, id: atual.id, quem })) {
        const k = chave(v);
        if (anterior.has(k)) continue;
        anterior.set(k, { de: atual, aresta: v });
        if (k === alvo) return montarCaminho(anterior, v);
        proxima.push(v);
        if (++visitados >= tetoNos) return { passos: null, saltos: null, teto: true };
      }
    }
    fronteira = proxima;
  }
  return null;                       // não existe caminho até `maxSaltos`
}

/** Reconstrói a sequência do fim para o começo. O primeiro passo é a
 *  origem e não tem motivo — motivo é do ELO, e a origem não veio de lugar
 *  nenhum. */
function montarCaminho(anterior, ultimo) {
  const passos = [];
  let atual = ultimo;
  while (atual) {
    passos.unshift({ tipo: atual.tipo, id: atual.id, rotulo: atual.rotulo || '',
      motivo: atual.motivo || '', detalhe: atual.detalhe || '' });
    const veio = anterior.get(atual.tipo + ':' + atual.id);
    atual = veio ? veio.de : null;
  }
  return { passos, saltos: passos.length - 1 };
}

module.exports = { TIPOS, vizinhos, caminho, no };
