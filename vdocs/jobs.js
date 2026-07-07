// =====================================================================
// Villela Docs Intelligence — Fase 3: fila de processamento + rotinas.
//
// Worker in-process (mesmo padrão das rotinas do legal): timer que puxa
// 1 job por vez — extração NUNCA roda na request do upload. Retentativa
// até 3x; depois marca 'erro' (ou 'ocr_pendente' quando é PDF escaneado/
// imagem — o OCR real pluga aqui no futuro sem mudar o fluxo).
// Indexação: FTS5/BM25 (docs_fts) — mesma técnica provada no RAG do legal.
// Rotina diária: alerta de vencimentos (documents.validade ≤ 30 dias) por
// e-mail ao contato da empresa. VDOCS_ROTINAS=off desliga timers (testes).
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');
const { extrairTexto } = require('./extrair');

let _canais = { enviarEmail: null, notificar: async () => {} };
function configurar(canais) { Object.assign(_canais, canais || {}); }

// ------------------------------------------------------------ fila
function enfileirarExtracao(tenantId, documentId, versao) {
  // 1 job pendente por documento basta (a extração pega sempre a versão vigente)
  const aberto = db.prepare("SELECT id FROM processing_jobs WHERE tenant_id = ? AND document_id = ? AND tipo = 'extrair_texto' AND status IN ('aguardando','processando')")
    .get(String(tenantId), String(documentId));
  if (aberto) { db.prepare('UPDATE processing_jobs SET versao = ?, atualizado_em = ? WHERE id = ?').run(Number(versao) || 0, nowISO(), aberto.id); return aberto.id; }
  const id = novoId();
  db.prepare("INSERT INTO processing_jobs (id, tenant_id, document_id, versao, tipo, status, criado_em) VALUES (?,?,?,?,'extrair_texto','aguardando',?)")
    .run(id, String(tenantId), String(documentId), Number(versao) || 0, nowISO());
  return id;
}

function statusProcessamento(tenantId, documentId) {
  const job = db.prepare("SELECT status, tentativas, erro, atualizado_em FROM processing_jobs WHERE tenant_id = ? AND document_id = ? AND tipo = 'extrair_texto' ORDER BY criado_em DESC LIMIT 1")
    .get(String(tenantId), String(documentId));
  const texto = db.prepare('SELECT versao, metodo, paginas, chars, extraido_em FROM document_texts WHERE tenant_id = ? AND document_id = ?')
    .get(String(tenantId), String(documentId));
  return { job: job || null, texto: texto || null };
}

// Reprocessar (botão da tela / correção de erro): reabre o job.
function reprocessar(tenantId, documentId, ator, ip) {
  const d = db.prepare('SELECT id, versao_atual FROM documents WHERE id = ? AND tenant_id = ?').get(String(documentId), String(tenantId));
  if (!d) throw new Error('Documento não encontrado.');
  db.prepare("UPDATE processing_jobs SET status = 'aguardando', tentativas = 0, erro = '', atualizado_em = ? WHERE tenant_id = ? AND document_id = ? AND tipo = 'extrair_texto'")
    .run(nowISO(), String(tenantId), String(documentId));
  const id = enfileirarExtracao(tenantId, documentId, d.versao_atual);
  repo.auditar(tenantId, ator, 'documento.reprocessar', 'processing_jobs', id, {}, ip);
  return id;
}

// ------------------------------------------------------------ worker
let _rodando = false;
async function processarPendentes(maxJobs = 5) {
  if (_rodando) return 0;
  _rodando = true;
  let feitos = 0;
  try {
    for (let n = 0; n < maxJobs; n++) {
      const job = db.prepare("SELECT * FROM processing_jobs WHERE status = 'aguardando' ORDER BY criado_em LIMIT 1").get();
      if (!job) break;
      db.prepare("UPDATE processing_jobs SET status = 'processando', tentativas = tentativas + 1, atualizado_em = ? WHERE id = ?").run(nowISO(), job.id);
      try {
        await executarExtracao(job);
        db.prepare("UPDATE processing_jobs SET status = 'concluido', erro = '', atualizado_em = ? WHERE id = ?").run(nowISO(), job.id);
      } catch (e) {
        const finalizou = e.ocrPendente || job.tentativas + 1 >= 3;
        db.prepare('UPDATE processing_jobs SET status = ?, erro = ?, atualizado_em = ? WHERE id = ?')
          .run(e.ocrPendente ? 'ocr_pendente' : (finalizou ? 'erro' : 'aguardando'), String(e.message).slice(0, 300), nowISO(), job.id);
        if (finalizou && !e.ocrPendente) console.error('[vdocs jobs] extração falhou', job.document_id, e.message);
      }
      feitos++;
    }
  } finally { _rodando = false; }
  return feitos;
}

async function executarExtracao(job) {
  const docs = require('./docs'); // require tardio (docs.js também enfileira)
  const d = db.prepare('SELECT * FROM documents WHERE id = ? AND tenant_id = ?').get(job.document_id, job.tenant_id);
  if (!d) throw new Error('Documento não existe mais.');
  const v = db.prepare('SELECT * FROM document_versions WHERE tenant_id = ? AND document_id = ? AND numero = ?')
    .get(job.tenant_id, d.id, d.versao_atual);
  if (!v) throw new Error('Versão vigente não encontrada.');
  const buffer = docs.lerArquivoInterno(v.file_path);
  const r = await extrairTexto(v.nome_arquivo, buffer);
  const texto = String(r.texto || '').slice(0, 2_000_000); // teto de 2M chars por doc
  db.prepare(`INSERT INTO document_texts (tenant_id, document_id, versao, texto, metodo, paginas, chars, extraido_em) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT (tenant_id, document_id) DO UPDATE SET versao = excluded.versao, texto = excluded.texto, metodo = excluded.metodo,
      paginas = excluded.paginas, chars = excluded.chars, extraido_em = excluded.extraido_em`)
    .run(job.tenant_id, d.id, d.versao_atual, texto, r.metodo, r.paginas || 0, texto.length, nowISO());
  // contabiliza páginas processadas no uso do mês (métrica do plano p/ OCR futuro)
  if (r.paginas) repo.registrarUso(job.tenant_id, 'ocr_paginas', r.paginas);
  indexar(job.tenant_id, d.id, d.nome, texto);
}

// ------------------------------------------------------------ índice FTS
function indexar(tenantId, documentId, nome, texto) {
  db.prepare('DELETE FROM docs_fts WHERE tenant_id = ? AND document_id = ?').run(String(tenantId), String(documentId));
  db.prepare('INSERT INTO docs_fts (tenant_id, document_id, nome, texto) VALUES (?,?,?,?)')
    .run(String(tenantId), String(documentId), String(nome || ''), String(texto || '').slice(0, 500_000));
}
function removerDoIndice(tenantId, documentId) {
  db.prepare('DELETE FROM docs_fts WHERE tenant_id = ? AND document_id = ?').run(String(tenantId), String(documentId));
  db.prepare('DELETE FROM document_texts WHERE tenant_id = ? AND document_id = ?').run(String(tenantId), String(documentId));
}
// Busca por conteúdo (BM25) — SEMPRE filtrada pelo tenant. Sanitiza o termo
// (aspas duplas) p/ não vazar sintaxe FTS5.
function buscarPorConteudo(tenantId, termo, limite = 30) {
  const t = String(termo || '').trim().slice(0, 120).replace(/"/g, '""');
  if (!t) return [];
  try {
    return db.prepare(`SELECT document_id, snippet(docs_fts, 3, '«', '»', '…', 12) AS trecho, bm25(docs_fts) AS rank
      FROM docs_fts WHERE docs_fts MATCH ? AND tenant_id = ? ORDER BY rank LIMIT ?`)
      .all(`"${t}"`, String(tenantId), Math.min(Number(limite) || 30, 100));
  } catch (_) { return []; }
}

// ------------------------------------------------------------ rotina de vencimentos
function documentosVencendo(tenantId, dias = 30) {
  const hoje = nowISO().slice(0, 10);
  const ate = new Date(Date.now() + dias * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return db.prepare(`SELECT id, nome, tipo_documental, validade FROM documents
    WHERE tenant_id = ? AND status = 'ativo' AND validade != '' AND validade <= ? ORDER BY validade`)
    .all(String(tenantId), ate)
    .map(d => ({ ...d, vencido: d.validade < hoje }));
}

async function rotinaVencimentos() {
  const tenants = db.prepare("SELECT id, nome, email_contato FROM tenants WHERE status IN ('trial','ativa')").all();
  let alertas = 0;
  for (const t of tenants) {
    const docs = documentosVencendo(t.id, 30);
    if (!docs.length) continue;
    alertas++;
    repo.auditar(t.id, { id: 'sistema', nome: 'Rotina de vencimentos' }, 'rotina.vencimentos', 'documents', '', { total: docs.length, vencidos: docs.filter(d => d.vencido).length }, 'rotina');
    if (typeof _canais.enviarEmail === 'function' && t.email_contato) {
      const linhas = docs.slice(0, 30).map(d => `<li>${d.vencido ? '🔴 VENCIDO' : '🟡 vence'} ${d.validade.split('-').reverse().join('/')} — ${String(d.nome).replace(/</g, '&lt;')}</li>`).join('');
      await Promise.resolve(_canais.enviarEmail(t.email_contato,
        `Villela Docs — ${docs.length} documento(s) vencendo em ${t.nome}`,
        `<p>Estes documentos têm validade nos próximos 30 dias:</p><ul>${linhas}</ul><p><a href="https://villela-stay-backend.onrender.com/vdocs/app">Abrir o painel</a></p>`)).catch(() => {});
    }
  }
  return alertas;
}

// ------------------------------------------------------------ timers
let _timers = [];
function iniciar() {
  if (String(process.env.VDOCS_ROTINAS || '').toLowerCase() === 'off') { console.log('[vdocs jobs] rotinas desligadas (VDOCS_ROTINAS=off)'); return; }
  _timers.push(setInterval(() => { processarPendentes().catch(e => console.error('[vdocs jobs]', e.message)); }, 7000));
  // vencimentos: 1x/dia ~08h Brasília (11h UTC)
  let ultimaData = '';
  _timers.push(setInterval(() => {
    const agora = new Date();
    const hojeUTC = agora.toISOString().slice(0, 10);
    if (agora.getUTCHours() === 11 && ultimaData !== hojeUTC) {
      ultimaData = hojeUTC;
      rotinaVencimentos().then(n => n && console.log(`[vdocs jobs] rotina de vencimentos: ${n} empresa(s) alertada(s)`)).catch(e => console.error('[vdocs jobs]', e.message));
      require('./workflows').lembrarAtrasadas().then(n => n && console.log(`[vdocs jobs] ${n} aprovação(ões) atrasada(s) lembrada(s)`)).catch(e => console.error('[vdocs jobs]', e.message));
    }
  }, 5 * 60 * 1000));
  for (const t of _timers) t.unref && t.unref();
  console.log('[vdocs jobs] worker de extração + rotina de vencimentos ativos');
}

module.exports = {
  configurar, iniciar,
  enfileirarExtracao, processarPendentes, statusProcessamento, reprocessar,
  indexar, removerDoIndice, buscarPorConteudo,
  documentosVencendo, rotinaVencimentos,
};
