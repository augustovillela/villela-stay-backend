// =====================================================================
// ORIGENA — biografia fundamentada (§18/§19) e "Pergunte à Origena"
// (§44/§45). FORA de ia/ de propósito: é AQUI que a autorização acontece.
//
// A DIVISÃO DE TRABALHO (a mesma do closet, que provou o desenho):
//   • o DOMÍNIO monta o contexto — só itens que QUEM PEDIU pode ver,
//     cada um com id, status e proveniência;
//   • a IA recebe o catálogo pronto e devolve texto + IDS DAS FONTES;
//   • os ids voltam VALIDADOS contra o catálogo enviado — id inventado
//     é descartado. A verificação de citação (§45) é literal: fonte que
//     não estava no contexto não pode ser citada.
//
// O fluxo de créditos envolve tudo: cotar → confirmar → reservar (na
// mesma transação do job) → executar → consumir/estornar (§53).
// =====================================================================
'use strict';
const { erro } = require('./erros');
const tenancy = require('./tenancy');
const privacidade = require('./privacidade');
const router = require('./ia/router');
const creditos = require('./creditos');
const prov = require('./proveniencia');
const historias = require('./historias');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

/**
 * Contexto de UMA pessoa, filtrado pelas permissões de quem pediu.
 * Cada item carrega a proveniência — é ela que deixa a biografia dizer
 * "a certidão registra" versus "a família conta".
 */
async function contextoDaPessoa(t, { personId, quem }) {
  const itens = [];
  const p = await t.uma(`SELECT * FROM persons WHERE id = $1 AND deleted_at IS NULL`, [personId]);
  if (!p) throw erro('erro.pessoa_nao_encontrada', 404);
  if (!privacidade.podeVer(p, quem).pode) throw erro('erro.pessoa_nao_encontrada', 404);

  for (const pred of Object.keys(prov.PREDICADOS)) {
    for (const v of await prov.versoesDe(t, personId, pred)) {
      itens.push({ id: 'claim:' + v.id, tipo: 'fato:' + pred, status: v.status,
        texto: `${pred} = ${v.valor} (informado por ${v.informado_por || 'sistema'})` });
    }
  }
  for (const c of await prov.contribuicoesDe(t, 'person', personId)) {
    if (c.status === 'retirada') continue;
    if (!privacidade.podeVer({ privacidade: c.privacidade, created_by: c.autor_user_id }, quem).pode) continue;
    itens.push({ id: 'contribuicao:' + c.id, tipo: 'relato', status: 'FAMILY_REPORTED',
      texto: `${c.autor_nome || 'alguém da família'} contou: ${c.corpo.slice(0, 3000)}` });
  }
  for (const h of await historias.listar(t, p.family_id, { pessoaId: personId, limite: 30 })) {
    if (!privacidade.podeVer({ privacidade: h.privacidade, created_by: h.created_by }, quem).pode) continue;
    itens.push({ id: 'historia:' + h.id, tipo: 'historia', status: 'FAMILY_REPORTED',
      texto: `"${h.titulo}"${h.contada_por ? ' (contada por ' + h.contada_por + ')' : ''}: ${h.resumo || ''}` });
  }
  return { pessoa: p, itens };
}

/** Só ids que ESTAVAM no catálogo sobrevivem — id inventado morre aqui. */
const validarFontes = (devolvidos, catalogo) => {
  const validos = new Set(catalogo.map((i) => i.id));
  return (devolvidos || []).filter((id) => validos.has(id));
};

/**
 * Executa uma capability com o ciclo de créditos completo. A reserva
 * commita ANTES da chamada (LLM é lento; segurar a transação seguraria o
 * pool); consumo/estorno vêm em transação nova. Se o processo morrer no
 * meio, o job fica `executando` e o painel de staff o denuncia.
 */
async function executarComCreditos({ familyId, userId, capability, entrada, confirmar }) {
  const cotacao = await tenancy.comEscopo(familyId, (t) => router.cotar(t, capability));
  if (!cotacao) throw erro('erro.ia_indisponivel', 503);
  if (!confirmar) return { cotacao };                 // "esta operação custará X" (§53)

  const job = await tenancy.comEscopo(familyId, async (t) => {
    await creditos.carteira(t, familyId);
    return creditos.reservar(t, { familyId, userId, capability,
      creditos: cotacao.creditos, provider: cotacao.provider, model: cotacao.model,
      entrada: { itens: (entrada.contexto || []).length } });   // referências, nunca conteúdo
  });

  try {
    const r = await tenancy.comEscopo(familyId, (t) => router.executar(t, { capability, entrada }));
    const custo = await tenancy.comEscopo(familyId, async (t) => {
      const linhaRegistry = await t.uma(
        `SELECT custo_estimado_centavos FROM provider_registry
          WHERE provider = $1 AND model = $2 AND capability = $3`,
        [r.provider, r.model, capability]);
      await creditos.consumir(t, { familyId, jobId: job.id,
        tokensIn: r.tokens_in || 0, tokensOut: r.tokens_out || 0,
        custoCentavos: r.custo_centavos || (linhaRegistry || {}).custo_estimado_centavos || 0 });
      return true;
    });
    return { job, resultado: r, custo };
  } catch (e) {
    await tenancy.comEscopo(familyId, (t) =>
      creditos.estornar(t, { familyId, jobId: job.id, motivo: e.message })).catch(() => {});
    // o router lança Error cru com {chave, status}; o tratador central só
    // traduz ErroApp — converter aqui é o que faz o cliente ver 502/503
    // com mensagem, e não um 500 genérico.
    throw erro(e.chave || 'erro.ia_falhou', e.status || 502);
  }
}

// ------------------------------------------------------------- biografia
/**
 * Biografia viva (§18): cada geração é uma VERSÃO nova; a anterior fica.
 * A versão guarda AS FONTES — biografia sem fontes é ficção com nome real.
 */
async function gerarBiografia({ familyId, userId, personId, quem, confirmar }) {
  const { pessoa, itens } = await tenancy.comEscopo(familyId, (t) =>
    contextoDaPessoa(t, { personId, quem }));
  if (!itens.length) throw erro('erro.biografia_sem_material', 422);

  const r = await executarComCreditos({ familyId, userId, capability: 'gerar_biografia',
    entrada: { contexto: itens }, confirmar });
  if (r.cotacao && !r.resultado) return r;            // só a cotação

  const fontes = validarFontes(r.resultado.saida.fontes_usadas, itens);
  return tenancy.comEscopo(familyId, async (t) => {
    const bio = await t.uma(
      `INSERT INTO biographies (family_id, person_id) VALUES ($1,$2)
       ON CONFLICT (person_id) DO UPDATE SET versao_atual = biographies.versao_atual
       RETURNING *`, [familyId, personId]);
    const versao = bio.versao_atual + 1;
    const v = await t.uma(
      `INSERT INTO biography_versions (family_id, biography_id, versao, corpo, fontes,
         provider, model, ai_job_id, gerada_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [familyId, bio.id, versao, s(r.resultado.saida.texto, 100000) || r.resultado.saida.texto,
        JSON.stringify(fontes), r.resultado.provider, r.resultado.model, r.job.id, userId]);
    await t.q(`UPDATE biographies SET versao_atual = $2 WHERE id = $1`, [bio.id, versao]);
    return { biografia: v, pessoa: pessoa.nome_exibicao, fontes_validas: fontes.length,
      fontes_descartadas: (r.resultado.saida.fontes_usadas || []).length - fontes.length };
  });
}

const biografiaDe = (t, personId) => t.uma(
  `SELECT b.versao_atual, v.corpo, v.fontes, v.provider, v.model, v.created_at,
          u.nome AS gerada_por_nome,
          (SELECT count(*)::int FROM contributions c
            WHERE c.alvo_tipo='person' AND c.alvo_id = b.person_id
              AND c.created_at > v.created_at) AS contribuicoes_desde
     FROM biographies b
     JOIN biography_versions v ON v.biography_id = b.id AND v.versao = b.versao_atual
     LEFT JOIN users u ON u.id = v.gerada_por
    WHERE b.person_id = $1`, [personId]);

// ------------------------------------------------------------- perguntar
/**
 * "Pergunte à Origena" (§44). RAG lexical + grafo: a recuperação é a
 * BUSCA da Fase 5 (já filtrada por família e permissão), e cada trecho
 * vai com a proveniência. A resposta volta com fontes VALIDADAS.
 */
async function perguntar({ familyId, userId, pergunta, quem, confirmar }) {
  const texto = s(pergunta, 300);
  if (texto.length < 3) throw erro('erro.pergunta_vazia', 400);

  const itens = await tenancy.comEscopo(familyId, async (t) => {
    const busca = require('./busca');
    // Pergunta não é caixa de busca: "quando nasceu o Antônio?" não pode
    // exigir as três palavras no MESMO registro. Recupera com OU e sem as
    // palavras de pergunta; o LLM decide o que usar — e cita com id.
    const linhas = await busca.procurar(t, familyId, { termo: texto, modoOu: true, limite: 24 });
    return busca.filtrar(linhas, quem).map((l) => ({
      id: l.ref_tipo + ':' + l.ref_id, tipo: l.ref_tipo,
      status: 'FAMILY_REPORTED',
      texto: `${l.titulo || ''} — ${String(l.trecho || '').replace(/[«»]/g, '')}`.slice(0, 1500),
    }));
  });

  const r = await executarComCreditos({ familyId, userId, capability: 'responder_familia',
    entrada: { contexto: itens, pergunta: texto }, confirmar });
  if (r.cotacao && !r.resultado) return r;

  const fontes = validarFontes(r.resultado.saida.fontes, itens);
  return {
    resposta: r.resultado.saida.resposta,
    incerteza: r.resultado.saida.incerteza || '',
    fontes: fontes.map((id) => { const [tipo, ref] = id.split(':'); return { tipo, ref_id: ref }; }),
    fontes_descartadas: (r.resultado.saida.fontes || []).length - fontes.length,
  };
}

module.exports = { contextoDaPessoa, gerarBiografia, biografiaDe, perguntar,
  executarComCreditos, validarFontes };
