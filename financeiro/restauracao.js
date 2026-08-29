// =====================================================================
// Villela Finance — restauração: snapshot + replay do diário.
//
// Este arquivo existe para transformar uma PROMESSA em FATO. O ADR-0004
// diz "restauração = último snapshot + replay do diário". Enquanto isso
// fosse só uma frase, o RPO de minutos era projeto, não garantia —
// réplica que nunca foi restaurada não é backup, é esperança.
//
// Aqui está o procedimento executável, e o selftest o roda de verdade:
// cria lançamentos, tira um snapshot no meio, cria mais lançamentos,
// restaura a partir do snapshot + diário e exige que o razão volte
// inteiro e balanceado.
//
// SOBRE OS TRIGGERS. O banco recusa lançar em período fechado e alterar
// lote contabilizado — travas corretas na operação normal e impossíveis
// durante uma restauração, que por definição reescreve o passado. O
// procedimento derruba os gatilhos, repõe os lotes e os RECRIA, e só
// então verifica. Se a verificação falhar, o banco restaurado é
// descartado: melhor não ter restauração do que ter uma silenciosamente
// incompleta.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const diario = require('./diario');

class ErroDeRestauracao extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDeRestauracao'; this.status = 500; this.detalhe = detalhe || null; }
}

/** Gatilhos que impedem reescrever o passado — derrubados só na restauração. */
const GATILHOS = [
  'trg_fin_lote_imutavel', 'trg_fin_lote_sem_delete',
  'trg_fin_linha_imutavel', 'trg_fin_linha_sem_delete',
  'trg_fin_periodo_fechado', 'trg_fin_linha_conta_analitica',
  'trg_fin_lote_transicao', 'trg_fin_linha_sem_insert',
];

/**
 * Snapshot consistente do banco em uso, via `VACUUM INTO` — a mesma
 * técnica do `snapshots.js` do repositório. Funciona com o banco aberto
 * em WAL; copiar o `.db` a frio sairia inconsistente.
 */
function snapshot(dbOrigem, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (fs.existsSync(destino)) fs.unlinkSync(destino);
  dbOrigem.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  return { arquivo: destino, bytes: fs.statSync(destino).size };
}

/**
 * Restaura para `destino` a partir de um snapshot e do diário.
 *
 * Devolve o relatório com quantos lotes vieram do snapshot, quantos do
 * replay e a verificação final. Não devolve "ok" sem conferir.
 */
function restaurar({ snapshotArquivo, destino, diarioDir = diario.DIR, competencias = null }) {
  if (!fs.existsSync(snapshotArquivo)) throw new ErroDeRestauracao(`Snapshot não encontrado: ${snapshotArquivo}`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  for (const sufixo of ['', '-wal', '-shm']) {
    const f = destino + sufixo;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  fs.copyFileSync(snapshotArquivo, destino);

  const db = new DatabaseSync(destino);
  db.exec('PRAGMA foreign_keys = OFF;');   // a ordem do replay não é a de criação

  const relatorio = {
    snapshot: { arquivo: snapshotArquivo, bytes: fs.statSync(snapshotArquivo).size },
    destino,
    lotesNoSnapshot: 0,
    lotesRepostos: 0,
    linhasRepostas: 0,
    jaExistiam: 0,
    periodosReabertos: [],
    ignorados: [],
  };

  try {
    relatorio.lotesNoSnapshot = db.prepare("SELECT COUNT(*) AS n FROM fin_lotes WHERE status <> 'rascunho'").get().n;

    // 1. derruba os gatilhos que impedem reescrever o passado
    const gatilhosPresentes = db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN (" +
      GATILHOS.map(() => '?').join(',') + ')').all(...GATILHOS);
    for (const g of gatilhosPresentes) db.exec(`DROP TRIGGER IF EXISTS ${g.name}`);

    // 2. replay: só o que o snapshot não tem
    const meses = competencias && competencias.length ? competencias : diario.meses();
    const temLote = db.prepare('SELECT 1 FROM fin_lotes WHERE id = ?');
    const insLote = db.prepare(
      `INSERT INTO fin_lotes (id, tenant_id, entidade_id, numero, data, competencia, memo, origem,
         origem_ref, idempotencia, status, estorno_de, estornado_por, estorno_motivo, total_cents,
         contabilizado_em, contabilizado_por, criado_em, criado_por, correlation_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insLinha = db.prepare(
      `INSERT INTO fin_linhas (id, tenant_id, lote_id, ordem, conta_id, debito_cents, credito_cents,
         centro_custo_id, contraparte_id, memo, ref_tipo, ref_id, criado_em)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    db.exec('BEGIN IMMEDIATE');
    for (const mes of meses) {
      for (const r of diario.ler(mes)) {
        if (r.erro) { relatorio.ignorados.push({ mes, motivo: r.erro }); continue; }
        if (temLote.get(r.lote.id)) { relatorio.jaExistiam++; continue; }
        const l = r.lote;
        insLote.run(
          l.id, r.tenant_id, r.entidade_id, l.numero, l.data, l.competencia, l.memo || '',
          l.origem || 'manual', l.origem_ref || '', l.idempotencia || '', l.status,
          l.estorno_de || '', '', '', l.total_cents,
          l.contabilizado_em || '', l.contabilizado_por || '', l.contabilizado_em || '',
          l.criado_por || '', '');
        r.linhas.forEach((li, i) => {
          insLinha.run(li.id, r.tenant_id, l.id, i, li.conta_id, li.debito_cents, li.credito_cents,
            li.centro_custo_id || '', li.contraparte_id || '', li.memo || '',
            li.ref_tipo || '', li.ref_id || '', l.contabilizado_em || '');
          relatorio.linhasRepostas++;
        });
        relatorio.lotesRepostos++;
      }
    }

    // 3. o vínculo do estorno é bidirecional: o lado `estornado_por` do
    //    lote original pode ter sido gravado DEPOIS do diário do original.
    //    Reconstrói a partir do `estorno_de` dos lotes de estorno.
    db.exec(`UPDATE fin_lotes SET estornado_por = COALESCE(
               (SELECT e.id FROM fin_lotes e WHERE e.estorno_de = fin_lotes.id LIMIT 1), estornado_por)
             WHERE status = 'estornado' AND estornado_por = ''`);
    db.exec('COMMIT');

    // 4. repõe os gatilhos com o SQL original — sem eles o banco
    //    restaurado ficaria sem as travas que o tornam confiável.
    for (const g of gatilhosPresentes) if (g.sql) db.exec(g.sql);
    const reposto = db.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name IN (" +
      GATILHOS.map(() => '?').join(',') + ')').all(...GATILHOS)[0];
    if (reposto.n !== gatilhosPresentes.length) {
      throw new ErroDeRestauracao(
        `Os gatilhos não foram repostos (${reposto.n} de ${gatilhosPresentes.length}). ` +
        'O banco restaurado ficaria sem as travas — descartando.');
    }
    relatorio.gatilhosRepostos = reposto.n;

    // 5. verificação. Sem ela, "restaurado" é palavra.
    relatorio.verificacao = verificar(db);
    if (!relatorio.verificacao.ok) {
      throw new ErroDeRestauracao('O banco restaurado NÃO passou na verificação.', relatorio.verificacao);
    }
    return relatorio;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* já pode ter commitado */ }
    try { db.close(); } catch (_) {}
    // Restauração incompleta é pior do que restauração nenhuma: quem
    // encontrasse o arquivo confiaria nele.
    for (const sufixo of ['', '-wal', '-shm']) {
      const f = destino + sufixo;
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
    }
    throw e;
  } finally {
    try { db.close(); } catch (_) {}
  }
}

/**
 * As três provas que um razão restaurado tem de passar. Rodam sobre a
 * conexão do banco RESTAURADO, não sobre o de produção.
 */
function verificar(db) {
  const problemas = [];

  // 1. débitos == créditos, globalmente
  const soma = db.prepare(
    `SELECT COALESCE(SUM(l.debito_cents),0) AS deb, COALESCE(SUM(l.credito_cents),0) AS cred
       FROM fin_linhas l JOIN fin_lotes b ON b.id = l.lote_id AND b.status <> 'rascunho'`).get();
  if (soma.deb !== soma.cred) {
    problemas.push({ tipo: 'razao_desbalanceado', debito: soma.deb, credito: soma.cred, diferenca: soma.deb - soma.cred });
  }

  // 2. cada lote fecha por si
  const tortos = db.prepare(
    `SELECT b.id, b.numero, SUM(l.debito_cents) AS deb, SUM(l.credito_cents) AS cred, b.total_cents
       FROM fin_lotes b JOIN fin_linhas l ON l.lote_id = b.id
      WHERE b.status <> 'rascunho'
      GROUP BY b.id
     HAVING deb <> cred OR deb <> b.total_cents`).all();
  for (const t of tortos) problemas.push({ tipo: 'lote_torto', lote: t.id, numero: t.numero, debito: t.deb, credito: t.cred, total: t.total_cents });

  // 3. nenhum lote sem linha, nenhuma linha órfã
  const semLinha = db.prepare(
    `SELECT COUNT(*) AS n FROM fin_lotes b WHERE b.status <> 'rascunho'
       AND NOT EXISTS (SELECT 1 FROM fin_linhas l WHERE l.lote_id = b.id)`).get().n;
  if (semLinha) problemas.push({ tipo: 'lote_sem_linha', quantidade: semLinha });
  const orfas = db.prepare(
    'SELECT COUNT(*) AS n FROM fin_linhas l WHERE NOT EXISTS (SELECT 1 FROM fin_lotes b WHERE b.id = l.lote_id)').get().n;
  if (orfas) problemas.push({ tipo: 'linha_orfa', quantidade: orfas });

  return {
    ok: problemas.length === 0,
    lotes: db.prepare("SELECT COUNT(*) AS n FROM fin_lotes WHERE status <> 'rascunho'").get().n,
    linhas: db.prepare('SELECT COUNT(*) AS n FROM fin_linhas').get().n,
    totalDebitoCents: soma.deb,
    totalCreditoCents: soma.cred,
    problemas,
  };
}

/**
 * Exercício de restauração: faz tudo num diretório temporário, verifica e
 * APAGA. É o que se roda periodicamente para provar que o RPO vale — e o
 * que a fase 10 exigia que existisse.
 *
 * Não toca no banco de produção em momento nenhum: só lê.
 */
function exercicio({ dbProducao, dirTemporario, competencias = null }) {
  const dir = dirTemporario || path.join(require('os').tmpdir(), 'finance-restauracao-' + process.pid);
  fs.mkdirSync(dir, { recursive: true });
  const snap = path.join(dir, 'snapshot.db');
  const destino = path.join(dir, 'restaurado.db');
  const comecou = Date.now();

  try {
    const s = snapshot(dbProducao, snap);
    const r = restaurar({ snapshotArquivo: snap, destino, competencias });
    return {
      ok: true,
      duracaoMs: Date.now() - comecou,
      snapshotBytes: s.bytes,
      lotesNoSnapshot: r.lotesNoSnapshot,
      lotesRepostosPeloDiario: r.lotesRepostos,
      verificacao: r.verificacao,
      veredito: `Restauração conferida: ${r.verificacao.lotes} lote(s), razão fecha em ` +
        `${(r.verificacao.totalDebitoCents / 100).toFixed(2)}. O RPO do ADR-0004 é verificável.`,
    };
  } catch (e) {
    return {
      ok: false,
      duracaoMs: Date.now() - comecou,
      erro: e.message,
      detalhe: e.detalhe || null,
      veredito: 'O exercício de restauração FALHOU — o RPO não está garantido. Investigar antes de confiar no backup.',
    };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { ErroDeRestauracao, GATILHOS, snapshot, restaurar, verificar, exercicio };
