// =====================================================================
// ORIGENA — Studio (fase 3.1, §21): restaurar, colorizar, ampliar.
//
// A REGRA QUE MANDA EM TUDO: O ORIGINAL NÃO SE TOCA. Cada resultado nasce
// como mídia DERIVADA, com `derivado_de` apontando o pai, `papel` e
// `ai_class` dizendo o que é, e a `derivacao` guardando provedor, modelo e
// job. A foto que a família enviou continua exatamente como chegou — e o
// banco recusa o contrário (`original_sem_ia`, `derivado_tem_papel`).
//
// POR QUE O TRABALHO VAI PARA O WORKER. Editar imagem leva dezenas de
// segundos e move megabytes; fazer isso no processo web seria segurar uma
// conexão e a memória de 12 produtos (ADR-0005). O ciclo fica: a rota
// COTA e RESERVA o crédito (§53) e enfileira; o worker baixa, chama o
// modelo, sobe o derivado e CONSUME — ou estorna, se falhar.
//
// A RESERVA É O QUE TORNA ISSO HONESTO. O crédito sai da carteira antes
// de a fila andar: a família vê o preço, confirma, e o valor fica travado.
// Se o modelo recusar (acontece, e é resposta legítima), o estorno é
// automático e o motivo fica no job.
//
// O SELO NÃO É ENFEITE (§88). Toda saída de IA é marcada no banco, e a
// tela mostra. Uma restauração que ninguém sabe que é restauração vira,
// duas gerações adiante, "a foto do bisavô" — e o produto inteiro existe
// para que isso não aconteça.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { erro } = require('./erros');
const tenancy = require('./tenancy');
const privacidade = require('./privacidade');
const storage = require('./storage');
const midia = require('./midia');
const creditos = require('./creditos');
const router = require('./ia/router');
const fila = require('./fila');
const { auditar } = require('./repo');

// Cada operação e o que ela produz. `AI_RESTORED` é para o que recupera o
// que está lá; `AI_ENHANCED` para o que INTERPRETA — colorir é palpite.
const OPERACOES = {
  restaurar_foto: { aiClass: 'AI_RESTORED' },
  colorizar_foto: { aiClass: 'AI_ENHANCED' },
  ampliar_foto: { aiClass: 'AI_RESTORED' },
};

const MAX_BYTES = 8 * 1024 * 1024;

const capacidades = async (t) => {
  const saida = {};
  for (const cap of Object.keys(OPERACOES)) {
    const cot = await router.cotar(t, cap);
    saida[cap] = cot ? { disponivel: true, creditos: cot.creditos } : { disponivel: false };
  }
  return saida;
};

/**
 * Cota, reserva e enfileira. Sem `confirmar`, devolve só o preço — a
 * família decide antes de qualquer crédito sair da carteira (§53).
 */
async function pedir({ familyId, userId, mediaId, operacao, quem, confirmar }) {
  if (!OPERACOES[operacao]) throw erro('erro.estudio_operacao_invalida', 400);

  const m = await tenancy.comEscopo(familyId, (t) => t.uma(
    `SELECT * FROM media WHERE id = $1 AND deleted_at IS NULL`, [mediaId]));
  if (!m) throw erro('erro.midia_nao_encontrada', 404);
  if (!privacidade.podeVer(m, quem).pode) throw erro('erro.midia_nao_encontrada', 404);
  if (m.tipo !== 'FOTO') throw erro('erro.estudio_so_foto', 400);
  if (m.derivado_de) throw erro('erro.derivado_de_derivado', 400);
  if (Number(m.bytes) > MAX_BYTES) throw erro('erro.midia_grande_demais', 413);

  const cotacao = await tenancy.comEscopo(familyId, (t) => router.cotar(t, operacao));
  if (!cotacao) throw erro('erro.ia_indisponivel', 503);
  if (!confirmar) return { cotacao };

  const job = await tenancy.comEscopo(familyId, async (t) => {
    await creditos.carteira(t, familyId);
    const j = await creditos.reservar(t, { familyId, userId, capability: operacao,
      creditos: cotacao.creditos, provider: cotacao.provider, model: cotacao.model,
      entrada: { media_id: mediaId } });      // referência, nunca o conteúdo
    await auditar({ familyId, atorUserId: userId, acao: 'estudio.pedido',
      alvoTipo: 'media', alvoId: mediaId, depois: { operacao, ai_job: j.id } }, t);
    return j;
  });

  await fila.enfileirar({ tipo: 'estudio.gerar', fila: 'cara', familyId,
    payload: { familyId, userId, mediaId, operacao, aiJobId: job.id },
    chaveIdem: `estudio:${job.id}` });

  return { job: { id: job.id, operacao, creditos: cotacao.creditos, status: 'na_fila' } };
}

/**
 * Roda no WORKER: baixa o original, manda ao modelo, sobe o derivado.
 * Falhou? Estorna e deixa o motivo no job — a família não paga por um
 * resultado que não recebeu.
 */
async function gerar({ familyId, userId, mediaId, operacao, aiJobId }) {
  const op = OPERACOES[operacao];
  if (!op) throw new Error('operação desconhecida: ' + operacao);

  const m = await tenancy.comEscopo(familyId, (t) => t.uma(
    `SELECT id, storage_key, mime_real, mime_declarado, bytes, titulo, nome_original
       FROM media WHERE id = $1 AND deleted_at IS NULL`, [mediaId]));
  if (!m) throw new Error('a mídia sumiu antes de o Studio rodar');

  try {
    const buf = await storage.baixar(m.storage_key);
    const r = await tenancy.comEscopo(familyId, (t) => router.executar(t, {
      capability: operacao,
      entrada: { arquivo: { mime: m.mime_real || m.mime_declarado, base64: buf.toString('base64') } },
    }));

    const saida = Buffer.from(r.saida.base64, 'base64');
    const sha = crypto.createHash('sha256').update(saida).digest('hex');

    const { derivado, chave } = await tenancy.comEscopo(familyId, (t) =>
      midia.registrarDerivado(t, { familyId, userId, originalId: mediaId,
        papel: 'DERIVADO', aiClass: op.aiClass, sha256: sha, bytes: saida.length,
        mime: r.saida.mime || 'image/png',
        derivacao: { operacao, provider: r.provider, model: r.model, ai_job_id: aiJobId,
          em: new Date().toISOString() } }));

    // o byte vai do worker direto para o R2 — nunca pelo processo web
    await storage.enviar(chave, saida, r.saida.mime || 'image/png');

    await tenancy.comEscopo(familyId, async (t) => {
      await creditos.consumir(t, { familyId, jobId: aiJobId,
        tokensIn: r.tokens_in || 0, tokensOut: r.tokens_out || 0, custoCentavos: r.custo_centavos || 0 });
      await t.q(`UPDATE ai_jobs SET resultado_media_id = $2 WHERE id = $1`, [aiJobId, derivado.id]);
      await auditar({ familyId, atorUserId: userId, atorKind: 'system', acao: 'estudio.gerado',
        alvoTipo: 'media', alvoId: derivado.id,
        depois: { operacao, original: mediaId, modelo: r.model, bytes: saida.length } }, t);
    });

    return { derivado: derivado.id, bytes: saida.length, modelo: r.model };
  } catch (e) {
    await tenancy.comEscopo(familyId, (t) => creditos.estornar(t, {
      familyId, jobId: aiJobId, motivo: String(e.message || e).slice(0, 300) })).catch(() => {});
    throw e;                              // a fila registra e reagenda/DLQ
  }
}

/** O que o Studio já produziu a partir de uma foto. */
const derivadosDe = (t, mediaId) => t.todas(
  `SELECT id, papel, ai_class, derivacao, bytes, largura, altura, created_at
     FROM media WHERE derivado_de = $1 AND ai_class <> 'ORIGINAL' AND deleted_at IS NULL
    ORDER BY created_at DESC`, [mediaId]);

module.exports = { OPERACOES, capacidades, pedir, gerar, derivadosDe, MAX_BYTES };
