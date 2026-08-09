// =====================================================================
// ORIGENA — lugares, eventos e linha do tempo (Fase 6, §33/§34).
//
// A TIMELINE NÃO É UMA TABELA QUE SE MANTÉM — É UMA CONTA QUE SE REFAZ.
// `reconstruir()` apaga a projeção da família e a remonta a partir das
// fontes reais: nascimentos, falecimentos, casamentos, eventos, fotos e
// histórias. A rota chama a reconstrução ao consultar; assim não existe
// estado velho para manter em sincronia — o custo é uma remontagem por
// consulta, barato na escala de uma família e ZERO chance de mentir.
//
// ORDEM DEFENSÁVEL COM DATA IMPRECISA: ordena por `data_ini`, e o item
// mostra a PRECISÃO ("anos 40", "c. 1890"). Item sem data nenhuma vai
// para o fim, rotulado — a timeline nunca afirma ordem que os dados não
// sustentam (datas.comparar existe para isso).
// =====================================================================
'use strict';
const { erro } = require('./erros');
const datas = require('./datas');
const busca = require('./busca');
const { auditar } = require('./repo');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

// ------------------------------------------------------------------ lugares
const Places = {
  listar: (t, familyId) => t.todas(
    `SELECT * FROM places WHERE family_id = $1 AND deleted_at IS NULL ORDER BY nome`, [familyId]),

  async criar(t, { familyId, userId, dados }) {
    const nome = s(dados.nome, 160);
    if (nome.length < 2) throw erro('erro.lugar_sem_nome', 400);
    const p = await t.uma(
      `INSERT INTO places (family_id, nome, pais, uf, municipio, lat, lon, nota, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [familyId, nome, s(dados.pais, 60) || 'Brasil', s(dados.uf, 40), s(dados.municipio, 120),
        Number.isFinite(+dados.lat) ? +dados.lat : null,
        Number.isFinite(+dados.lon) ? +dados.lon : null, s(dados.nota, 500), userId]);
    await auditar({ familyId, atorUserId: userId, acao: 'lugar.criado',
      alvoTipo: 'place', alvoId: p.id, depois: { nome } }, t);
    return p;
  },

  /**
   * Renomear PRESERVA o nome antigo. "Fazenda do Meio" que virou
   * "Sítio Santa Rita" continua encontrável pelos dois nomes — o nome
   * antigo é o que está escrito no verso das fotos.
   */
  async renomear(t, { familyId, userId, id, nome }) {
    const novo = s(nome, 160);
    if (novo.length < 2) throw erro('erro.lugar_sem_nome', 400);
    const p = await t.uma(
      `UPDATE places SET nomes_historicos = array_append(
              array_remove(nomes_historicos, $2), nome),
              nome = $2
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [id, novo]);
    if (!p) throw erro('erro.lugar_nao_encontrado', 404);
    await auditar({ familyId, atorUserId: userId, acao: 'lugar.renomeado',
      alvoTipo: 'place', alvoId: id, depois: { nome: novo, anteriores: p.nomes_historicos } }, t);
    return p;
  },
};

// ------------------------------------------------------------------ eventos
const TIPOS_EVENTO = ['nascimento', 'casamento', 'mudanca', 'viagem', 'formatura',
  'trabalho', 'reuniao', 'falecimento', 'outro'];

const Events = {
  async criar(t, { familyId, userId, dados }) {
    const titulo = s(dados.titulo, 200);
    if (titulo.length < 2) throw erro('erro.evento_sem_titulo', 400);
    let d = { valor: null, precisao: 'ANO', ini: null, fim: null };
    if (dados.data) {
      d = datas.interpretar(dados.data);
      if (d.erro) throw erro(d.erro, 400);
    }
    const ev = await t.uma(
      `INSERT INTO events (family_id, tipo, titulo, descricao, data_valor, data_precisao,
         data_ini, data_fim, place_id, local_texto, privacidade, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [familyId, TIPOS_EVENTO.includes(dados.tipo) ? dados.tipo : 'outro', titulo,
        s(dados.descricao, 5000), d.valor, d.precisao, d.ini, d.fim,
        dados.place_id || null, s(dados.local, 200),
        ['PUBLIC', 'FAMILY', 'GROUP', 'PRIVATE'].includes(dados.privacidade) ? dados.privacidade : 'FAMILY',
        userId]);

    for (const part of (dados.participantes || []).slice(0, 100)) {
      const personId = typeof part === 'string' ? part : part.person_id;
      if (!personId) continue;
      await t.q(
        `INSERT INTO event_participants (family_id, event_id, person_id, papel)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [familyId, ev.id, personId, s(typeof part === 'object' ? part.papel : '', 60)]);
    }

    await busca.indexar(t, {
      familyId, refTipo: 'event', refId: ev.id, titulo,
      corpo: ev.descricao, pessoas: (dados.participantes || [])
        .map((p) => typeof p === 'string' ? p : p.person_id).filter(Boolean),
      dataIni: d.ini, dataFim: d.fim, localTexto: ev.local_texto,
      privacidade: ev.privacidade, criadoPor: userId });
    await auditar({ familyId, atorUserId: userId, acao: 'evento.criado',
      alvoTipo: 'event', alvoId: ev.id, depois: { titulo, tipo: ev.tipo } }, t);
    return ev;
  },

  async obter(t, id) {
    const ev = await t.uma(
      `SELECT e.*, pl.nome AS lugar_nome FROM events e
         LEFT JOIN places pl ON pl.id = e.place_id
        WHERE e.id = $1 AND e.deleted_at IS NULL`, [id]);
    if (!ev) return null;
    ev.participantes = await t.todas(
      `SELECT ep.person_id, ep.papel, p.nome_exibicao
         FROM event_participants ep JOIN persons p ON p.id = ep.person_id
        WHERE ep.event_id = $1 ORDER BY p.nome_exibicao`, [id]);
    return ev;
  },
};

// ------------------------------------------------------------------ timeline
/**
 * Apaga e remonta a projeção da família. Idempotente por construção:
 * rodar duas vezes dá exatamente o mesmo conjunto.
 */
async function reconstruir(t, familyId) {
  await t.q(`DELETE FROM timeline_entries WHERE family_id = $1`, [familyId]);

  // 1. nascimentos e falecimentos
  await t.q(
    `INSERT INTO timeline_entries (family_id, tipo, titulo, data_valor, precisao, data_ini,
       data_fim, pessoas, ref_tipo, ref_id, local_texto, privacidade, criado_por)
     SELECT family_id, 'nascimento', nome_exibicao, nascimento_valor, nascimento_precisao,
            nascimento_ini, nascimento_fim, ARRAY[id], 'person', id,
            local_nascimento, privacidade, created_by
       FROM persons WHERE family_id = $1 AND deleted_at IS NULL AND nascimento_valor IS NOT NULL
     UNION ALL
     SELECT family_id, 'falecimento', nome_exibicao, falecimento_valor, falecimento_precisao,
            falecimento_ini, falecimento_fim, ARRAY[id], 'person', id,
            '', privacidade, created_by
       FROM persons WHERE family_id = $1 AND deleted_at IS NULL AND falecimento_valor IS NOT NULL`,
    [familyId]);

  // 2. casamentos e uniões (com o par nas `pessoas`)
  await t.q(
    `INSERT INTO timeline_entries (family_id, tipo, titulo, data_valor, precisao, data_ini,
       data_fim, pessoas, ref_tipo, ref_id, local_texto, privacidade, criado_por)
     SELECT r.family_id, 'casamento',
            pa.nome_exibicao || ' & ' || pb.nome_exibicao,
            r.inicio_valor, r.inicio_precisao, r.inicio_ini, r.inicio_fim,
            ARRAY[r.person_a, r.person_b], 'relationship', r.id, '', 'FAMILY', r.created_by
       FROM relationships r
       JOIN persons pa ON pa.id = r.person_a JOIN persons pb ON pb.id = r.person_b
      WHERE r.family_id = $1 AND r.deleted_at IS NULL
        AND r.tipo IN ('SPOUSE_OF','PARTNER_OF') AND r.inicio_valor IS NOT NULL
        AND pa.deleted_at IS NULL AND pb.deleted_at IS NULL`, [familyId]);

  // 3. eventos declarados
  await t.q(
    `INSERT INTO timeline_entries (family_id, tipo, titulo, data_valor, precisao, data_ini,
       data_fim, pessoas, ref_tipo, ref_id, local_texto, privacidade, criado_por)
     SELECT e.family_id, 'evento', e.titulo, e.data_valor, e.data_precisao, e.data_ini,
            e.data_fim,
            COALESCE((SELECT array_agg(ep.person_id) FROM event_participants ep
                       WHERE ep.event_id = e.id), '{}'),
            'event', e.id, COALESCE(pl.nome, e.local_texto), e.privacidade, e.created_by
       FROM events e LEFT JOIN places pl ON pl.id = e.place_id
      WHERE e.family_id = $1 AND e.deleted_at IS NULL`, [familyId]);

  // 4. fotos com data (só originais prontos)
  await t.q(
    `INSERT INTO timeline_entries (family_id, tipo, titulo, data_valor, precisao, data_ini,
       data_fim, pessoas, ref_tipo, ref_id, local_texto, privacidade, criado_por)
     SELECT m.family_id, 'foto', COALESCE(NULLIF(m.titulo,''), m.nome_original),
            m.capturada_valor, m.capturada_precisao, m.capturada_ini, m.capturada_fim,
            COALESCE((SELECT array_agg(mp.person_id) FROM media_persons mp
                       WHERE mp.media_id = m.id AND mp.person_id IS NOT NULL
                         AND mp.origem IN ('MANUAL','CONFIRMADA')), '{}'),
            'media', m.id, m.local_texto, m.privacidade, m.created_by
       FROM media m
      WHERE m.family_id = $1 AND m.deleted_at IS NULL AND m.derivado_de IS NULL
        AND m.status = 'pronta' AND m.capturada_valor IS NOT NULL`, [familyId]);

  // 5. histórias com "quando aconteceu"
  await t.q(
    `INSERT INTO timeline_entries (family_id, tipo, titulo, data_valor, precisao, data_ini,
       data_fim, pessoas, ref_tipo, ref_id, local_texto, privacidade, criado_por)
     SELECT st.family_id, 'historia', st.titulo, st.ocorrido_valor, st.ocorrido_precisao,
            st.ocorrido_ini, st.ocorrido_fim,
            COALESCE((SELECT array_agg(DISTINCT x) FROM (
              SELECT sm.person_id AS x FROM story_mentions sm
               WHERE sm.story_id = st.id AND sm.person_id IS NOT NULL
              UNION SELECT st.contada_por_person_id WHERE st.contada_por_person_id IS NOT NULL
            ) q), '{}'),
            'story', st.id, st.local_texto, st.privacidade, st.created_by
       FROM stories st
      WHERE st.family_id = $1 AND st.deleted_at IS NULL AND st.ocorrido_valor IS NOT NULL`,
    [familyId]);

  const n = await t.uma(`SELECT count(*)::int c FROM timeline_entries WHERE family_id = $1`, [familyId]);
  return n.c;
}

/**
 * A linha do tempo, pronta para a tela. Sempre reconstruída antes de ler
 * (ver cabeçalho). Itens SEM data vêm por último, rotulados — presença
 * sem afirmação de ordem.
 */
async function listar(t, familyId, { pessoaId = null, de = null, ate = null, limite = 300 } = {}) {
  await reconstruir(t, familyId);
  return t.todas(
    `SELECT tipo, titulo, data_valor, precisao, data_ini, data_fim, pessoas,
            ref_tipo, ref_id, local_texto, privacidade, criado_por
       FROM timeline_entries
      WHERE family_id = $1
        AND ($2::uuid IS NULL OR $2 = ANY(pessoas))
        AND ($3::date IS NULL OR data_fim IS NULL OR data_fim >= $3)
        AND ($4::date IS NULL OR data_ini IS NULL OR data_ini <= $4)
      ORDER BY data_ini ASC NULLS LAST, tipo, titulo
      LIMIT $5`, [familyId, pessoaId, de, ate, Math.min(limite, 1000)]);
}

module.exports = { Places, Events, TIPOS_EVENTO, reconstruir, listar };
