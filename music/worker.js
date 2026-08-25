// =====================================================================
// Musique — handlers da fila (ADR-0003 + ADR-0006).
//
// ⚠️ ISTO NÃO É UM SERVIÇO SEPARADO NO RENDER, e a diferença importa.
// A intenção original (ADR-0003) era um `music-worker` como o
// `origena-worker`. Não dá: no Render "o disco de um serviço não é
// acessível por outro serviço", e o banco da Musique é SQLite no disco.
// Um worker separado subiria vivo, mudo e sem enxergar a tabela `jobs`.
// O origena-worker funciona porque a Origena usa PostgreSQL, alcançável
// pela rede. A correção e as duas saídas futuras estão no ADR-0006.
//
// Então: este arquivo é o REGISTRO DOS HANDLERS, consumido hoje pelo
// próprio processo web, limitado à fila `rapida`. A fila `cara` (áudio
// pesado, GPU) está travada em `fila.enfileirar` até existir consumidor
// dedicado — Fase 5.
//
// Os handlers NÃO tocam em pagamento. Veem job, banco e R2.
//
// Rodar como processo à parte (só faz sentido LOCALMENTE, onde o disco
// é o mesmo):  node music/worker.js   (ou npm run music:worker)
// =====================================================================
'use strict';
const fila = require('./fila');
const repo = require('./repo');
const storage = require('./storage');
const direitos = require('./direitos');

const LOTE = Number(process.env.MUSIC_WORKER_LOTE || 5);
const INTERVALO_MS = Number(process.env.MUSIC_WORKER_MS || 3000);
const CLASSE = process.env.MUSIC_WORKER_FILA || null;   // 'rapida' | 'cara' | null = as duas
const DESTRAVAR_A_CADA = 20;

let rodando = false;
let parar = false;

// ---------------------------------------------------------------------
// Handlers.
//
// ⚠️ O nome registrado tem de ser IDÊNTICO ao tipo enfileirado. Em
// muitas filas, divergência aí falha em silêncio; aqui o job vai para a
// DLQ na primeira tentativa e loga alto — porque falha silenciosa é o
// pior desfecho possível.
//
// Todo handler é IDEMPOTENTE: a fila entrega no mínimo uma vez.
// ---------------------------------------------------------------------
function registrarHandlers() {
  // Fumaça: prova ponta a ponta (enfileirar → worker → resultado) sem
  // depender de bucket nem de provedor de IA.
  fila.registrar('smoke', async (payload) => ({ eco: payload, em: new Date().toISOString() }));

  // Ingestão de mídia. Idempotente por construção: sai cedo se a mídia
  // já está pronta.
  fila.registrar('midia.ingerir', async (payload) => {
    const m = repo.Midias.porId(payload.midiaId);
    if (!m) { const e = new Error('Mídia não existe mais.'); e.permanente = true; throw e; }
    if (m.estado === 'pronta') return { jaEstava: true, midiaId: m.id };

    const obj = await storage.existe(m.chave);
    if (!obj) {
      repo.Midias.estado(m.id, 'falhou', { erro: 'O arquivo não está no armazenamento.' });
      const e = new Error('Arquivo ausente no bucket.'); e.permanente = true; throw e;
    }
    // O tamanho declarado na confirmação tem de bater com o que chegou.
    // Divergência aqui é upload truncado — que, se passasse, viraria um
    // áudio que toca pela metade e ninguém sabe por quê.
    if (m.bytes && obj.bytes && Number(m.bytes) !== Number(obj.bytes)) {
      repo.Midias.estado(m.id, 'falhou', { erro: 'O arquivo chegou incompleto. Envie de novo.' });
      const e = new Error('Tamanho divergente no bucket.'); e.permanente = true; throw e;
    }
    repo.Midias.estado(m.id, 'pronta', { bytes: obj.bytes });
    return { midiaId: m.id, bytes: obj.bytes };
  });

  // Revogação de consentimento de voz apaga o que foi derivado dela.
  // Existe como JOB para que a revogação não dependa de alguém lembrar
  // de limpar — e para que a limpeza sobreviva a um processo que cai.
  fila.registrar('voz.purgar_derivados', async (payload) => {
    if (direitos.temConsentimento(payload.usuario, payload.escopo)) {
      // Reconsentiu antes de o job rodar: não apaga. É o caso que a
      // entrega "no mínimo uma vez" torna real.
      return { pulou: true, motivo: 'consentimento voltou a estar ativo' };
    }
    const derivados = repo.Midias.doUsuario(payload.usuario, { limite: 300 })
      .filter((m) => m.derivado_de && m.mime.startsWith('audio/'));
    let apagados = 0;
    for (const d of derivados) {
      if (storage.ativo()) { try { await storage.remover(d.chave); } catch (_) { /* segue: o metadado morre igual */ } }
      repo.Midias.estado(d.id, 'falhou', { erro: 'Removido a pedido do titular (consentimento revogado).' });
      apagados++;
    }
    direitos.registrar({ ator: 'sistema', acao: 'voz.derivados.purgados', alvo: payload.usuario,
      motivo: 'consentimento revogado', detalhe: { escopo: payload.escopo, apagados } });
    return { apagados };
  });
}

async function ciclo() {
  let n = 0;
  try { n = await fila.processarLote(LOTE, CLASSE); }
  catch (e) { console.error('[music-worker] erro no lote:', e.message); }
  return n;
}

async function iniciar() {
  if (rodando) return;
  rodando = true; parar = false;
  registrarHandlers();
  console.log(`[music-worker] de pé. lote=${LOTE} intervalo=${INTERVALO_MS}ms fila=${CLASSE || 'todas'}`
    + ` · handlers: ${fila.tiposRegistrados().join(', ')}`
    + ` · armazenamento: ${storage.ativo() ? 'R2' : 'DESLIGADO (faltam ' + storage.faltando().join(', ') + ')'}`);

  let voltas = 0;
  while (!parar) {
    // Job travado em 'processando' (deploy no meio do trabalho) volta
    // para a fila. Sem isto, trabalho fica parado para sempre — e não
    // aparece como erro, o que é pior.
    if (voltas++ % DESTRAVAR_A_CADA === 0) {
      const d = fila.destravar(15);
      if (d) console.warn(`[music-worker] ${d} job(s) travado(s) devolvido(s) à fila.`);
    }
    const n = await ciclo();
    if (!n) await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
  rodando = false;
}

const encerrar = () => { parar = true; };
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);

if (require.main === module) {
  iniciar().catch((e) => { console.error('[music-worker] morreu:', e); process.exit(1); });
}

module.exports = { registrarHandlers, iniciar, encerrar, ciclo };
