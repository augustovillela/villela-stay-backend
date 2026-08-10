// =====================================================================
// ORIGENA — worker de mídia e IA (ADR-0005).
//
// Roda como serviço SEPARADO no Render (`origena-worker`), com memória
// própria. Motivo: o web tem 2 GB para 12 produtos, e transcodificar um
// vídeo ou gerar thumbnails lá derruba o grupo inteiro. O precedente da
// casa é o `nucleo\visitas-geo-worker.js` — uma base de 110 MB já
// obrigou processo separado uma vez.
//
// O worker NÃO é caminho crítico de leitura: se ele cair, a família
// continua navegando o acervo; só o processamento novo fica em espera,
// com estado visível PROCESSANDO (§118).
//
// O worker NÃO tem segredo de pagamento. Ele vê job, R2 e provedores de
// IA — nada de Mercado Pago.
//
// Rodar:  node origena/worker.js        (ou npm run origena:worker)
// =====================================================================
'use strict';
const db = require('./db');
const fila = require('./fila');

const LOTE = Number(process.env.ORIGENA_WORKER_LOTE || 5);
const INTERVALO_MS = Number(process.env.ORIGENA_WORKER_MS || 3000);
const CLASSE = process.env.ORIGENA_WORKER_FILA || null;   // 'rapida' | 'cara' | null = as duas
const DESTRAVAR_A_CADA = 20;                              // ciclos

let rodando = false;
let parar = false;

// ---------------------------------------------------------------------
// Handlers. Fase 0 registra só o de fumaça — os de verdade (ingerir
// mídia, OCR, transcrever, IA) entram nas fases seguintes.
//
// ⚠️ Handler com nome diferente do tipo enfileirado falha em SILÊNCIO em
// muitas filas. Aqui não: `processarLote` manda para a DLQ e loga alto.
// ---------------------------------------------------------------------
function registrarHandlers() {
  fila.registrar('smoke', async (payload) => ({ eco: payload, em: db.nowISO() }));

  // Ingestão de mídia (Fase 4). Roda DENTRO do escopo da família: as
  // tabelas têm RLS, e sem `app.family_id` posto o worker não enxerga
  // linha nenhuma — nem a que ele mesmo veio processar.
  //
  // Idempotente por construção: `ingerir` sai cedo se a mídia já está
  // `pronta`. A fila entrega no mínimo uma vez, então isso não é zelo,
  // é requisito.
  fila.registrar('midia.ingerir', async (payload) => {
    const tenancy = require('./tenancy');
    const midia = require('./midia');
    return tenancy.comEscopo(payload.familyId, async (t) => {
      const r = await midia.ingerir(t, payload);
      // Documento vira texto num job SEPARADO: extrair um PDF de 300
      // páginas não pode segurar a ingestão das outras fotos do lote.
      if (r && r.documento) {
        await fila.enfileirar({ tipo: 'documento.extrair', fila: 'rapida',
          familyId: payload.familyId, payload,
          chaveIdem: 'extrair:' + payload.mediaId }, t);
      }
      return r;
    });
  });

  // Extração de texto (Fase 5). Reaproveita o extrator do Villela Docs.
  fila.registrar('documento.extrair', async (payload) => {
    const tenancy = require('./tenancy');
    const documentos = require('./documentos');
    return tenancy.comEscopo(payload.familyId, (t) => documentos.extrair(t, payload));
  });

  // Exportação (Fase 8): zip com dados.json + GEDCOM, no R2 com validade.
  fila.registrar('export.gerar', async (payload) => {
    const tenancy = require('./tenancy');
    const exportar = require('./exportar');
    return tenancy.comEscopo(payload.familyId, (t) => exportar.gerar(t, payload));
  });

  // Busca semântica (2.5): embutir o que entrou ou mudou. Vai em LOTE
  // porque acervo grande não cabe numa chamada — e o job se reagenda
  // sozinho enquanto sobrar coisa, em vez de fingir que terminou.
  fila.registrar('semantica.indexar', async (payload) => {
    const tenancy = require('./tenancy');
    const semantica = require('./semantica');
    const r = await tenancy.comEscopo(payload.familyId,
      (t) => semantica.indexarPendentes(t, payload.familyId, payload.limite || 25));
    if (r.itens > 0) {
      await fila.enfileirar({ tipo: 'semantica.indexar', fila: 'cara',
        familyId: payload.familyId,
        payload: { familyId: payload.familyId, limite: payload.limite || 25 } });
    }
    return r;
  });

  // Integridade (ADR-0008): amostra de originais reconferida por rodízio.
  fila.registrar('integridade.verificar', async (payload) => {
    const tenancy = require('./tenancy');
    const integridade = require('./integridade');
    return tenancy.comEscopo(payload.familyId, (t) => integridade.verificar(t, payload));
  });
}

/**
 * Batida do worker no banco.
 *
 * O `/origena/health` respondia "ok" sabendo do banco e do storage e NADA
 * do worker — e em 08/08/2026 o worker passou horas rodando um commit
 * velho, sem o handler de mídia, com a saúde verde o tempo todo. É
 * exatamente a armadilha do `heartbeat-verde-fonte-caida`: rotina verde
 * com a fonte caída é pior que rotina vermelha.
 *
 * Agora ele registra QUEM é (commit) e O QUE sabe fazer (handlers), e o
 * health denuncia batida velha ou handler faltando.
 */
async function bater() {
  const estado = {
    em: db.nowISO(),
    commit: (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7),
    handlers: fila.tiposRegistrados(),
    fila: CLASSE || 'rapida+cara',
    pid: process.pid,
  };
  await db.q(
    `INSERT INTO config (chave, valor, descricao, atualizado_em)
     VALUES ('worker_heartbeat', $1, 'Última batida do origena-worker', now())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
    [JSON.stringify(estado)]);
}

async function ciclo(n) {
  if (n % 10 === 0) await bater().catch((e) => console.error('[origena/worker] batida falhou:', e.message));
  if (n % DESTRAVAR_A_CADA === 0) await fila.destravarPresos(15);
  const r = await fila.processarLote(LOTE, CLASSE);
  if (r.pegos) {
    console.log(`[origena/worker] lote: ${r.pegos} pegos · ${r.ok} ok · ${r.falhas} falhas`
      + (r.semHandler ? ` · ${r.semHandler} SEM HANDLER` : ''));
  }
  return r;
}

async function principal() {
  if (!db.configurado()) {
    console.error('[origena/worker] ORIGENA_DATABASE_URL não definida. Nada a fazer.');
    process.exit(1);
  }
  await db.migrar({ silencioso: true });
  registrarHandlers();
  await bater().catch(() => {});
  rodando = true;
  console.log(`[origena/worker] no ar · schema ${db.SCHEMA} · fila ${CLASSE || 'rapida+cara'}`
    + ` · lote ${LOTE} a cada ${INTERVALO_MS}ms · handlers: ${fila.tiposRegistrados().join(', ') || 'nenhum'}`);

  let n = 0;
  while (!parar) {
    try {
      await ciclo(n++);
    } catch (e) {
      // Erro no ciclo (banco caiu, rede) não pode matar o worker: ele
      // espera e tenta de novo. Job em `processando` é destravado depois.
      console.error('[origena/worker] ciclo falhou:', e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (!parar) await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }

  console.log('[origena/worker] encerrando…');
  await db.fechar();
  rodando = false;
}

// Encerramento limpo: o Render manda SIGTERM no deploy. Terminar o lote
// em andamento evita job preso (que só voltaria com o destravador).
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => { console.log(`[origena/worker] ${sinal} recebido.`); parar = true; });
}

if (require.main === module) {
  principal().catch((e) => { console.error('[origena/worker] morreu:', e); process.exit(1); });
}

module.exports = { registrarHandlers, ciclo, principal, rodando: () => rodando };
