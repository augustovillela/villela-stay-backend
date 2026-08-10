// =====================================================================
// ORIGENA — Entrevistas (fase 2.4, §27/§28).
//
// É a funcionalidade que o produto existe para ter: alguém senta com a
// avó e pergunta. O sistema só precisa não atrapalhar — dar a pergunta
// certa, guardar a VOZ e devolver texto encontrável.
//
// TRÊS DECISÕES QUE MOLDAM O RESTO:
//
//   1. O ÁUDIO É O ATIVO. A gravação é `media` como qualquer outra:
//      original imutável, hash conferido, guardada no R2. A transcrição é
//      derivada e corrigível — se o modelo ouvir "Anna" onde era "Ana", a
//      família conserta e o áudio continua lá para conferir.
//
//   2. A PERGUNTA VIAJA POR CHAVE, não como texto. Reescrever o roteiro
//      amanhã não reescreve o que já foi respondido, e a tradução para
//      es/en/fr entra sem migração (§86).
//
//   3. ENTREVISTA É RELATO. Cada resposta transcrita vira CONTRIBUIÇÃO da
//      pessoa entrevistada — entra na proveniência com o nome de quem
//      contou, e o que sair dela como fato nasce `FAMILY_REPORTED`. A
//      diferença entre "a certidão registra" e "a vovó contou" é o
//      produto inteiro (§4).
//
// SEM PROVEDOR DE TRANSCRIÇÃO, A ENTREVISTA CONTINUA VALENDO. Grava-se o
// áudio, escreve-se a resposta à mão, e a capability simplesmente não
// aparece (ADR-0004). O que nunca acontece é o sistema fingir que ouviu.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const tenancy = require('./tenancy');
const privacidade = require('./privacidade');
const storage = require('./storage');
const busca = require('./busca');
const prov = require('./proveniencia');
const conhecimento = require('./conhecimento');
const router = require('./ia/router');
const { auditar } = require('./repo');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

// Os 10 roteiros do §27. O texto de cada pergunta mora no catálogo i18n
// (`entrevista.p_<roteiro>_<n>`); aqui fica só a estrutura.
const ROTEIROS = [
  { chave: 'infancia', perguntas: 7 },
  { chave: 'pais', perguntas: 6 },
  { chave: 'juventude', perguntas: 6 },
  { chave: 'profissao', perguntas: 6 },
  { chave: 'casamento', perguntas: 6 },
  { chave: 'filhos', perguntas: 6 },
  { chave: 'historicos', perguntas: 5 },
  { chave: 'viagens', perguntas: 5 },
  { chave: 'tradicoes', perguntas: 6 },
  { chave: 'conselhos', perguntas: 5 },
];
const ROTEIRO = Object.fromEntries(ROTEIROS.map((r) => [r.chave, r]));
const perguntasDe = (chave) => {
  const r = ROTEIRO[chave];
  if (!r) return [];
  return Array.from({ length: r.perguntas }, (_, i) => `p_${chave}_${i + 1}`);
};

const MAX_AUDIO_TRANSCRICAO = 20 * 1024 * 1024;   // teto do que se manda ao provedor

// ---------------------------------------------------------------- sessão
/**
 * Abre a entrevista já com as perguntas do roteiro em fila. Nascer com as
 * perguntas prontas é o que transforma "gravar um áudio" em entrevista:
 * quem conduz não precisa saber o que perguntar.
 */
async function criar(t, { familyId, userId, personId, roteiro, privacidade: priv = 'FAMILY' }) {
  if (!ROTEIRO[roteiro]) throw erro('erro.roteiro_desconhecido', 400);
  const p = await t.uma(
    `SELECT id, nome_exibicao FROM persons WHERE id = $1 AND deleted_at IS NULL`, [personId]);
  if (!p) throw erro('erro.pessoa_nao_encontrada', 404);

  const e = await t.uma(
    `INSERT INTO interviews (family_id, person_id, roteiro, privacidade, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`, [familyId, personId, roteiro, priv, userId]);
  const perguntas = perguntasDe(roteiro);
  for (let i = 0; i < perguntas.length; i++) {
    await t.q(
      `INSERT INTO interview_answers (family_id, interview_id, pergunta_chave, ordem, created_by)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [familyId, e.id, perguntas[i], i + 1, userId]);
  }
  await auditar({ familyId, atorUserId: userId, acao: 'entrevista.criada', alvoTipo: 'interview',
    alvoId: e.id, depois: { roteiro, pessoa: personId } }, t);
  return e;
}

const listar = (t, familyId, { pessoaId = null, limite = 50 } = {}) => t.todas(
  `SELECT e.id, e.roteiro, e.titulo, e.status, e.privacidade, e.created_at, e.concluida_em,
          e.person_id, p.nome_exibicao AS pessoa_nome, e.created_by,
          count(r.id) FILTER (WHERE r.status IN ('gravada','transcrita'))::int AS respondidas,
          count(r.id)::int AS total
     FROM interviews e JOIN persons p ON p.id = e.person_id
     LEFT JOIN interview_answers r ON r.interview_id = e.id
    WHERE e.family_id = $1 AND e.deleted_at IS NULL
      AND ($2::uuid IS NULL OR e.person_id = $2)
    GROUP BY e.id, p.nome_exibicao ORDER BY e.created_at DESC LIMIT $3`,
  [familyId, pessoaId, Math.min(Number(limite) || 50, 200)]);

async function obter(t, id) {
  const e = await t.uma(
    `SELECT e.*, p.nome_exibicao AS pessoa_nome FROM interviews e
       JOIN persons p ON p.id = e.person_id
      WHERE e.id = $1 AND e.deleted_at IS NULL`, [id]);
  if (!e) throw erro('erro.entrevista_nao_encontrada', 404);
  e.respostas = await t.todas(
    `SELECT id, pergunta_chave, pergunta_livre, ordem, media_id, duracao_seg, transcricao,
            transcricao_origem, transcricao_modelo, status, contribution_id
       FROM interview_answers WHERE interview_id = $1 ORDER BY ordem`, [id]);
  return e;
}

/** Pergunta que a família inventou — o roteiro é ponto de partida, não cerca. */
async function acrescentarPergunta(t, { familyId, userId, interviewId, texto }) {
  const p = s(texto, 400);
  if (p.length < 3) throw erro('erro.pergunta_vazia', 400);
  const { max } = await t.uma(
    `SELECT COALESCE(max(ordem), 0) AS max FROM interview_answers WHERE interview_id = $1`,
    [interviewId]);
  return t.uma(
    `INSERT INTO interview_answers (family_id, interview_id, pergunta_chave, pergunta_livre,
       ordem, created_by)
     VALUES ($1,$2,'livre',$3,$4,$5) RETURNING *`,
    [familyId, interviewId, p, Number(max) + 1, userId]);
}

// --------------------------------------------------------------- resposta
/** Liga o áudio já enviado (fluxo normal de mídia) à pergunta. */
async function registrarAudio(t, { familyId, userId, respostaId, mediaId, duracaoSeg = null }) {
  const m = await t.uma(
    `SELECT id, tipo FROM media WHERE id = $1 AND deleted_at IS NULL`, [mediaId]);
  if (!m) throw erro('erro.midia_nao_encontrada', 404);
  if (m.tipo !== 'AUDIO' && m.tipo !== 'VIDEO') throw erro('erro.resposta_precisa_de_audio', 400);
  const r = await t.uma(
    `UPDATE interview_answers SET media_id = $2, duracao_seg = $3, status = 'gravada',
            updated_at = now() WHERE id = $1 RETURNING *`,
    [respostaId, mediaId, duracaoSeg]);
  if (!r) throw erro('erro.resposta_nao_encontrada', 404);
  await auditar({ familyId, atorUserId: userId, acao: 'entrevista.audio_registrado',
    alvoTipo: 'interview', alvoId: r.interview_id, depois: { resposta: respostaId } }, t);
  return r;
}

const pular = (t, respostaId) => t.uma(
  `UPDATE interview_answers SET status = 'pulada', updated_at = now()
    WHERE id = $1 AND status = 'pendente' RETURNING *`, [respostaId]);

/**
 * Guarda o texto da resposta e faz o que importa depois dele: vira
 * CONTRIBUIÇÃO da pessoa entrevistada e entra na busca. Sem isto, a
 * entrevista seria um arquivo bonito que ninguém encontra.
 *
 * A contribuição é criada UMA vez; correções revisam a mesma (§15), então
 * o histórico mostra o que a máquina ouviu e o que a família corrigiu.
 */
async function guardarTranscricao(t, { familyId, userId, resposta, entrevista, texto, origem,
  modelo = '', aiJobId = null }) {
  const corpo = s(texto, 20000);
  let contribId = resposta.contribution_id;
  if (corpo) {
    if (contribId) {
      const nova = await prov.revisarContribuicao(t, { familyId, userId, id: contribId, corpo });
      contribId = nova.id;
    } else {
      const c = await prov.contribuir(t, { familyId, userId, alvoTipo: 'person',
        alvoId: entrevista.person_id, corpo, tipo: 'relato',
        autorPersonId: entrevista.person_id, privacidade: entrevista.privacidade });
      contribId = c.id;
    }
  }
  const r = await t.uma(
    `UPDATE interview_answers SET transcricao = $2, transcricao_origem = $3,
            transcricao_modelo = $4, ai_job_id = COALESCE($5, ai_job_id),
            contribution_id = $6, status = CASE WHEN $2 = '' THEN status ELSE 'transcrita' END,
            updated_at = now()
      WHERE id = $1 RETURNING *`,
    [resposta.id, corpo, origem, s(modelo, 80), aiJobId, contribId]);
  await indexar(t, familyId, entrevista.id);
  return r;
}

/** A entrevista inteira é UM item de busca — é assim que se procura. */
async function indexar(t, familyId, interviewId) {
  const e = await t.uma(
    `SELECT e.*, p.nome_exibicao FROM interviews e JOIN persons p ON p.id = e.person_id
      WHERE e.id = $1`, [interviewId]);
  if (!e || e.deleted_at) return;
  const respostas = await t.todas(
    `SELECT transcricao FROM interview_answers WHERE interview_id = $1 ORDER BY ordem`, [interviewId]);
  await busca.indexar(t, {
    familyId, refTipo: 'interview', refId: interviewId,
    titulo: e.titulo || e.nome_exibicao,
    corpo: respostas.map((r) => r.transcricao).filter(Boolean).join('\n\n'),
    pessoas: [e.person_id], privacidade: e.privacidade, criadoPor: e.created_by,
  });
}

/** Correção humana: o texto muda, o áudio não. */
async function corrigir(t, { familyId, userId, respostaId, texto }) {
  const r = await t.uma(`SELECT * FROM interview_answers WHERE id = $1`, [respostaId]);
  if (!r) throw erro('erro.resposta_nao_encontrada', 404);
  const e = await t.uma(`SELECT * FROM interviews WHERE id = $1`, [r.interview_id]);
  const origem = r.transcricao_origem === 'ia' || r.transcricao_origem === 'ia_corrigida'
    ? 'ia_corrigida' : 'humana';
  const novo = await guardarTranscricao(t, { familyId, userId, resposta: r, entrevista: e,
    texto, origem, modelo: r.transcricao_modelo });
  await auditar({ familyId, atorUserId: userId, acao: 'entrevista.transcricao_corrigida',
    alvoTipo: 'interview', alvoId: e.id, depois: { resposta: respostaId, origem } }, t);
  return novo;
}

// ------------------------------------------------------------ transcrever
/**
 * Manda o áudio ao provedor e guarda o que voltou. Mesmo ciclo de crédito
 * das outras capabilities (cotar → confirmar → reservar → executar →
 * consumir). Sem provedor ativo, devolve 503 e a tela nem mostra o botão.
 */
async function transcrever({ familyId, userId, respostaId, quem, confirmar }) {
  const ctx = await tenancy.comEscopo(familyId, async (t) => {
    const r = await t.uma(`SELECT * FROM interview_answers WHERE id = $1`, [respostaId]);
    if (!r) throw erro('erro.resposta_nao_encontrada', 404);
    if (!r.media_id) throw erro('erro.resposta_sem_audio', 400);
    const e = await t.uma(`SELECT * FROM interviews WHERE id = $1 AND deleted_at IS NULL`,
      [r.interview_id]);
    if (!e) throw erro('erro.entrevista_nao_encontrada', 404);
    if (!privacidade.podeVer(e, quem).pode) throw erro('erro.entrevista_nao_encontrada', 404);
    const m = await t.uma(
      `SELECT id, storage_key, bytes, mime_real, mime_declarado FROM media WHERE id = $1`,
      [r.media_id]);
    return { r, e, m };
  });
  if (Number(ctx.m.bytes) > MAX_AUDIO_TRANSCRICAO) throw erro('erro.audio_grande_demais', 413);

  const buf = await storage.baixar(ctx.m.storage_key);
  const entrada = { arquivo: { mime: ctx.m.mime_real || ctx.m.mime_declarado,
    base64: buf.toString('base64'), nome: 'resposta' }, contexto: [] };

  const saida = await conhecimento.executarComCreditos({ familyId, userId,
    capability: 'transcrever_audio', entrada, confirmar });
  if (saida.cotacao && !saida.resultado) return saida;

  const texto = s((saida.resultado.saida || {}).transcricao, 20000);
  return tenancy.comEscopo(familyId, async (t) => {
    const nova = await guardarTranscricao(t, { familyId, userId, resposta: ctx.r,
      entrevista: ctx.e, texto, origem: 'ia', modelo: saida.resultado.model,
      aiJobId: saida.job.id });
    await auditar({ familyId, atorUserId: userId, acao: 'entrevista.transcrita',
      alvoTipo: 'interview', alvoId: ctx.e.id,
      depois: { resposta: respostaId, modelo: saida.resultado.model, caracteres: texto.length } }, t);
    return { resposta: { id: nova.id, transcricao: nova.transcricao,
      transcricao_origem: nova.transcricao_origem, transcricao_modelo: nova.transcricao_modelo },
    aviso: 'confira: transcrição automática' };
  });
}

const transcricaoDisponivel = (t) => router.disponivel(t, 'transcrever_audio');

/**
 * §28, do quarto elo em diante: pessoas, datas, lugares e eventos saem da
 * transcrição como SUGESTÃO — nunca como fato. Reaproveita inteiro o
 * caminho da 2.3 (mesma fila de achados, mesma confirmação humana); o que
 * muda é a fonte: fala vira `ENTREVISTA`, e o fato que nascer daqui é
 * `FAMILY_REPORTED`. A vovó contando não é a certidão registrando.
 */
async function extrairEntidades({ familyId, userId, respostaId, quem, confirmar }) {
  const ctx = await tenancy.comEscopo(familyId, async (t) => {
    const r = await t.uma(`SELECT * FROM interview_answers WHERE id = $1`, [respostaId]);
    if (!r) throw erro('erro.resposta_nao_encontrada', 404);
    if (!s(r.transcricao, 20000)) throw erro('erro.resposta_sem_transcricao', 400);
    const e = await t.uma(`SELECT * FROM interviews WHERE id = $1 AND deleted_at IS NULL`,
      [r.interview_id]);
    if (!e || !privacidade.podeVer(e, quem).pode) throw erro('erro.entrevista_nao_encontrada', 404);
    return { r, e };
  });

  const saida = await conhecimento.executarComCreditos({ familyId, userId,
    capability: 'analisar_documento',
    entrada: { contexto: [{ id: 'resposta:' + respostaId, tipo: 'entrevista',
      status: 'FAMILY_REPORTED', texto: ctx.r.transcricao }] },
    confirmar });
  if (saida.cotacao && !saida.resultado) return saida;

  const docIA = require('./documentos-ia');
  return tenancy.comEscopo(familyId, async (t) => {
    for (const a of ((saida.resultado.saida || {}).achados || []).slice(0, 40)) {
      await docIA.guardarAchado(t, { familyId, respostaId, aiJobId: saida.job.id, achado: a });
    }
    await auditar({ familyId, atorUserId: userId, acao: 'entrevista.entidades_extraidas',
      alvoTipo: 'interview', alvoId: ctx.e.id, depois: { resposta: respostaId } }, t);
    return { achados: await docIA.achadosDaResposta(t, respostaId) };
  });
}

async function concluir(t, { familyId, userId, interviewId }) {
  const e = await t.uma(
    `UPDATE interviews SET status = 'concluida', concluida_em = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [interviewId]);
  if (!e) throw erro('erro.entrevista_nao_encontrada', 404);
  await auditar({ familyId, atorUserId: userId, acao: 'entrevista.concluida',
    alvoTipo: 'interview', alvoId: interviewId }, t);
  return e;
}

async function arquivar(t, { familyId, userId, interviewId }) {
  const e = await t.uma(
    `UPDATE interviews SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [interviewId]);
  if (!e) throw erro('erro.entrevista_nao_encontrada', 404);
  await busca.remover(t, 'interview', interviewId);
  await auditar({ familyId, atorUserId: userId, acao: 'entrevista.arquivada',
    alvoTipo: 'interview', alvoId: interviewId }, t);
  return e;
}

module.exports = { ROTEIROS, perguntasDe, criar, listar, obter, acrescentarPergunta,
  registrarAudio, pular, corrigir, transcrever, transcricaoDisponivel, extrairEntidades,
  concluir, arquivar, indexar, MAX_AUDIO_TRANSCRICAO };
