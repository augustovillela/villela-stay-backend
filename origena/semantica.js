// =====================================================================
// ORIGENA — busca semântica (fim da fase 2.5, §43).
//
// O QUE ELA RESOLVE, E SÓ ELA: a família não lembra a palavra. Procura
// "aquela história do carro velho na estrada de terra" e o acervo guarda
// "a caminhonete atolada no caminho da fazenda". O `tsvector` não acha —
// não há termo em comum —, e é para isso que existe o vetor.
//
// COMPLEMENTA, NUNCA SUBSTITUI. A busca por palavra continua sendo a
// primeira: é exata, instantânea e de graça. A semântica entra ao lado, e
// o resultado diz de onde cada achado veio ("por palavra" / "por
// sentido"). Trocar uma pela outra pioraria o caso mais comum — procurar
// um nome — para melhorar o caso raro.
//
// NÃO COBRA CRÉDITO. Embutir o acervo inteiro de uma família custa
// centavos, e cobrar por isso seria vender a régua junto com o quadro. É
// recurso do plano; a linha do registry tem tarifa zero de propósito.
//
// PRIVACIDADE ANTES DE SAIR DAQUI (§45), com o MESMO filtro da busca
// textual — `busca.filtrar`, não uma cópia. A primeira versão deste
// módulo duplicou a regra com `podeVer` puro e vazou documento para quem
// não tem `ver.documentos`: documento exige verificação própria, e a
// cópia não sabia disso. Regra de permissão tem implementação única; toda
// duplicata é um vazamento esperando a data.
// =====================================================================
'use strict';
const router = require('./ia/router');
const busca = require('./busca');

const TRECHO_PADRAO = 1200;

const configNum = async (t, chave, padrao) => {
  const r = await t.uma(`SELECT valor FROM config WHERE chave = $1`, [chave]);
  const n = Number((r || {}).valor);
  return Number.isFinite(n) && n > 0 ? n : padrao;
};

/**
 * Corta o texto em trechos que cabem no modelo — quebrando em parágrafo,
 * depois em frase, e só então no meio da palavra. Trecho picado no lugar
 * errado embaralha o sentido, que é justamente o que estamos indexando.
 */
function trechos(texto, max = TRECHO_PADRAO) {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!limpo) return [];
  if (limpo.length <= max) return [limpo];
  const saida = [];
  let resto = limpo;
  while (resto.length > max) {
    const janela = resto.slice(0, max);
    const corte = Math.max(janela.lastIndexOf('. '), janela.lastIndexOf('! '),
      janela.lastIndexOf('? '), janela.lastIndexOf('; '));
    const fim = corte > max * 0.5 ? corte + 1 : (janela.lastIndexOf(' ') > 0 ? janela.lastIndexOf(' ') : max);
    saida.push(resto.slice(0, fim).trim());
    resto = resto.slice(fim).trim();
  }
  if (resto) saida.push(resto);
  return saida.slice(0, 40);           // teto por item: acervo não vira fatura
}

const disponivel = (t) => router.disponivel(t, 'embedding');

/** Pede o vetor ao provedor. `consulta` muda o tipo de tarefa (e o vetor). */
async function vetorDe(t, texto, { consulta = false, dimensoes } = {}) {
  const dim = dimensoes || await configNum(t, 'embedding_dimensoes', 768);
  const r = await router.executar(t, { capability: 'embedding',
    entrada: { texto, consulta, dimensoes: dim } });
  return { vetor: r.saida.vetor, modelo: r.model };
}

const paraSql = (v) => '[' + v.map((x) => Number(x).toFixed(6)).join(',') + ']';

/**
 * Indexa UM item do acervo (o que já está em `busca`). Idempotente:
 * reindexar substitui os trechos daquele item e apaga o que sobrou de uma
 * versão maior — senão o texto antigo continuaria sendo encontrado.
 */
async function indexarItem(t, { familyId, refTipo, refId }) {
  const b = await t.uma(
    `SELECT titulo, corpo, privacidade, criado_por FROM busca
      WHERE family_id = $1 AND ref_tipo = $2 AND ref_id = $3`, [familyId, refTipo, refId]);
  if (!b) return { ignorado: 'não está na busca' };
  const max = await configNum(t, 'embedding_trecho_max', TRECHO_PADRAO);
  const partes = trechos([b.titulo, b.corpo].filter(Boolean).join('. '), max);
  if (!partes.length) return { ignorado: 'sem texto' };

  let n = 0;
  for (let i = 0; i < partes.length; i++) {
    const { vetor, modelo } = await vetorDe(t, partes[i]);
    await t.q(
      `INSERT INTO search_chunks (family_id, ref_tipo, ref_id, ordem, texto, embedding,
         modelo, privacidade, criado_por, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6::vector,$7,$8,$9, now())
       ON CONFLICT (ref_tipo, ref_id, ordem) DO UPDATE SET texto = EXCLUDED.texto,
         embedding = EXCLUDED.embedding, modelo = EXCLUDED.modelo,
         privacidade = EXCLUDED.privacidade, criado_por = EXCLUDED.criado_por,
         atualizado_em = now()`,
      [familyId, refTipo, refId, i, partes[i], paraSql(vetor), modelo,
        b.privacidade, b.criado_por]);
    n++;
  }
  // sobra de uma indexação anterior mais longa
  await t.q(`DELETE FROM search_chunks WHERE ref_tipo = $1 AND ref_id = $2 AND ordem >= $3`,
    [refTipo, refId, partes.length]);
  return { trechos: n };
}

/**
 * Fila de quem ainda não tem vetor (ou está desatualizado). O worker
 * consome aos poucos: acervo grande não pode virar uma chamada só.
 */
const pendentes = (t, familyId, limite = 25) => t.todas(
  `SELECT b.ref_tipo, b.ref_id FROM busca b
     LEFT JOIN search_chunks c
       ON c.ref_tipo = b.ref_tipo AND c.ref_id = b.ref_id AND c.ordem = 0
    WHERE b.family_id = $1
      AND (c.id IS NULL OR c.atualizado_em < b.atualizado_em)
    ORDER BY b.atualizado_em DESC LIMIT $2`, [familyId, Math.min(Number(limite) || 25, 200)]);

async function indexarPendentes(t, familyId, limite = 25) {
  const fila = await pendentes(t, familyId, limite);
  let itens = 0, trechosN = 0;
  for (const x of fila) {
    const r = await indexarItem(t, { familyId, refTipo: x.ref_tipo, refId: x.ref_id });
    if (r.trechos) { itens++; trechosN += r.trechos; }
  }
  return { itens, trechos: trechosN, restam: Math.max(0, fila.length - itens) };
}

/**
 * Procura por SENTIDO. Devolve os itens (não os trechos) com a melhor
 * distância e o pedaço que casou — mostrar o trecho é o que faz o
 * resultado ser conferível em vez de mágico.
 */
async function procurar(t, familyId, { termo, quem, limite = 12 }) {
  const texto = String(termo || '').trim();
  if (texto.length < 3) return [];
  if (!(await disponivel(t))) return [];
  const { vetor } = await vetorDe(t, texto, { consulta: true });

  const linhas = await t.todas(
    `SELECT c.ref_tipo, c.ref_id, c.texto, c.privacidade, c.criado_por,
            (c.embedding <=> $2::vector) AS distancia,
            b.titulo
       FROM search_chunks c
       LEFT JOIN busca b ON b.ref_tipo = c.ref_tipo AND b.ref_id = c.ref_id
      WHERE c.family_id = $1 AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $2::vector
      LIMIT $3`, [familyId, paraSql(vetor), Math.min(Number(limite) * 4, 80)]);

  // O MESMO filtro da busca textual — inclusive a regra extra de documento.
  const vistos = new Set();
  const saida = [];
  for (const l of busca.filtrar(linhas, quem)) {
    const chave = l.ref_tipo + ':' + l.ref_id;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ ref_tipo: l.ref_tipo, ref_id: l.ref_id, titulo: l.titulo || '',
      trecho: l.texto.slice(0, 400), distancia: Number(l.distancia), origem: 'sentido' });
    if (saida.length >= limite) break;
  }
  return saida;
}

module.exports = { trechos, indexarItem, indexarPendentes, pendentes, procurar,
  disponivel, vetorDe, TRECHO_PADRAO };
