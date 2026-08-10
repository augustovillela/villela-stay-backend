// =====================================================================
// ORIGENA — mapa da família (§34, fase 2.5).
//
// A pergunta: "de onde a gente veio, e para onde foi?" — nascimentos,
// mudanças, viagens, casamentos, fotos, tudo pousado no espaço e ordenado
// no tempo.
//
// O PROBLEMA REAL NÃO É DESENHAR O MAPA, É LIGAR O TEXTO AO LUGAR. Desde
// a Fase 2 o acervo guarda lugar como TEXTO em três colunas
// (`persons.local_nascimento`, `media.local_texto`, `events.local_texto`),
// com um "vira place_id na Fase 6" que nunca veio. Migrar essas colunas
// exigiria decidir, por linha, a qual lugar cada texto se refere — e
// ninguém tem essa informação além da família.
//
// A SAÍDA: RESOLVER POR NOME, sem migração. O lugar cadastrado tem nome e
// nomes HISTÓRICOS; qualquer texto que normalize para um deles se liga a
// ele (município NÃO conta — é continência, não identidade). É derivado (refaz sozinho quando a família corrige
// um lugar), respeita a história ("Vila Rica" encontra Ouro Preto) e não
// inventa vínculo nenhum: texto que não bate com lugar nenhum aparece na
// lista do que falta, não some.
//
// SEM MAPA-BASE. O desenho é dos lugares da própria família, com grade de
// coordenadas e escala — sem tile de terceiro, porque o produto não carrega
// asset externo (CSP estrita) e porque o que interessa aqui é a relação
// entre os lugares, não a geografia do mundo.
// =====================================================================
'use strict';
const privacidade = require('./privacidade');
const datas = require('./datas');

// `anoDe(ini, fim)` recebe DUAS datas, não uma data e um padrão: passar
// 9999 como segundo argumento faria a média com o ano 9999 e embaralharia
// a ordem. Sem data conhecida, a parada vai para o fim da fila.
const anoOu = (d, padrao = 9999) => { const a = datas.anoDe(d, null); return a == null ? padrao : a; };

/** Mesma normalização da busca: sem acento, sem caixa, sem espaço sobrando. */
const norm = (v) => String(v == null ? '' : v).trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

/**
 * Índice nome→lugar: o nome e os nomes HISTÓRICOS, que são o mesmo lugar
 * dito de outro jeito.
 *
 * O município NÃO entra, e isso custou um teste: "Fazenda do Meio", no
 * município de Pirapora, passava a capturar todo texto "Pirapora" do
 * acervo — e a fazenda FICA EM Pirapora, não se CHAMA Pirapora. Município
 * é continência, não identidade; tratar um como o outro faz a família
 * inteira nascer numa fazenda que não é a dela.
 */
function indiceDeLugares(lugares) {
  const ix = new Map();
  for (const l of lugares) {
    for (const nome of [l.nome, ...(l.nomes_historicos || [])]) {
      const k = norm(nome);
      if (k && !ix.has(k)) ix.set(k, l);
    }
  }
  return ix;
}

const resolver = (ix, texto) => ix.get(norm(texto)) || null;

/**
 * O mapa inteiro: lugares com o que aconteceu em cada um, as migrações
 * pessoa a pessoa e — declarado — o que não deu para pousar no mapa.
 */
async function montar(t, familyId, quem) {
  const lugares = await t.todas(
    `SELECT id, nome, nomes_historicos, pais, uf, municipio, lat, lon, nota
       FROM places WHERE family_id = $1 AND deleted_at IS NULL ORDER BY nome`, [familyId]);
  const ix = indiceDeLugares(lugares);
  // `pessoas` é a LISTA de nomes que a tela mostra; `n_pessoas` é a contagem.
  // Já foram o mesmo campo, e somar 1 a um array vira string em silêncio.
  const porId = new Map(lugares.map((l) =>
    [l.id, { ...l, pessoas: [], n_pessoas: 0, eventos: 0, midias: 0 }]));
  const semLugar = new Map();          // texto → contagem (o que não bateu)

  const anota = (texto, placeId, campo) => {
    const l = placeId ? porId.get(placeId) : (resolver(ix, texto) && porId.get(resolver(ix, texto).id));
    if (!l) {
      const k = String(texto || '').trim();
      if (k) semLugar.set(k, (semLugar.get(k) || 0) + 1);
      return null;
    }
    if (campo) l[campo] += 1;
    return l;
  };

  // ------------------------------------------------ o que pousa no mapa
  const pessoas = await t.todas(
    `SELECT id, nome_exibicao, local_nascimento, nascimento_valor, nascimento_ini,
            falecimento_valor, falecimento_ini, privacidade, created_by, eh_menor
       FROM persons WHERE family_id = $1 AND deleted_at IS NULL`, [familyId]);
  const visiveis = pessoas.filter((p) => privacidade.podeVer(p, quem).pode);

  const eventos = await t.todas(
    `SELECT e.id, e.tipo, e.titulo, e.data_valor, e.data_ini, e.place_id, e.local_texto,
            e.privacidade, e.created_by,
            array_remove(array_agg(ep.person_id), NULL) AS pessoas
       FROM events e LEFT JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.family_id = $1 AND e.deleted_at IS NULL
      GROUP BY e.id`, [familyId]);
  const eventosVisiveis = eventos.filter((e) => privacidade.podeVer(e, quem).pode);

  const midias = await t.todas(
    `SELECT local_texto, count(*)::int AS n FROM media
      WHERE family_id = $1 AND deleted_at IS NULL AND local_texto <> ''
        AND privacidade IN ('PUBLIC','FAMILY') AND derivado_de IS NULL
      GROUP BY local_texto`, [familyId]);

  for (const p of visiveis) if (p.local_nascimento) anota(p.local_nascimento, null, 'n_pessoas');
  for (const e of eventosVisiveis) anota(e.local_texto, e.place_id, 'eventos');
  for (const m of midias) {
    const l = anota(m.local_texto, null, null);
    if (l) l.midias += m.n;
  }

  // ------------------------------------------------------- as migrações
  // Um passo por lugar datado da vida da pessoa, em ordem. Duas paradas
  // seguidas no mesmo lugar viram uma só — mudar de casa dentro da mesma
  // cidade não é migração.
  const migracoes = [];
  for (const p of visiveis) {
    const paradas = [];
    const nasc = p.local_nascimento && resolver(ix, p.local_nascimento);
    if (nasc) {
      paradas.push({ lugar_id: nasc.id, quando: p.nascimento_valor || '',
        ordem: anoOu(p.nascimento_ini, -9999), motivo: 'mapa.nasceu' });
    }
    for (const e of eventosVisiveis) {
      if (!(e.pessoas || []).includes(p.id)) continue;
      const l = e.place_id ? porId.get(e.place_id) : resolver(ix, e.local_texto);
      if (!l) continue;
      paradas.push({ lugar_id: l.id, quando: e.data_valor || '',
        ordem: anoOu(e.data_ini), motivo: 'mapa.ev_' + e.tipo, titulo: e.titulo });
    }
    paradas.sort((a, b) => a.ordem - b.ordem);
    const limpo = paradas.filter((x, i) => i === 0 || x.lugar_id !== paradas[i - 1].lugar_id);
    if (limpo.length >= 2) {
      migracoes.push({ person_id: p.id, nome: p.nome_exibicao, passos: limpo });
    }
    for (const x of limpo) {
      const l = porId.get(x.lugar_id);
      if (l && !l.pessoas.includes(p.nome_exibicao)) l.pessoas.push(p.nome_exibicao);
    }
  }

  const comCoordenada = [...porId.values()].filter((l) => l.lat != null && l.lon != null);
  return {
    lugares: [...porId.values()].map((l) => ({ ...l, pessoas: l.pessoas.slice(0, 12) })),
    com_coordenada: comCoordenada.length,
    migracoes: migracoes
      .filter((m) => m.passos.every((x) => porId.get(x.lugar_id).lat != null))
      .slice(0, 60),
    // Declarado, como sempre: o que o mapa NÃO conseguiu mostrar e por quê.
    sem_coordenada: [...porId.values()].filter((l) => l.lat == null).map((l) => l.nome),
    nao_reconhecidos: [...semLugar.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 40).map(([texto, n]) => ({ texto, n })),
  };
}

module.exports = { montar, indiceDeLugares, resolver, norm };
