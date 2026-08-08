// =====================================================================
// ORIGENA — proveniência: o coração do produto (§4, §5, §16, §17).
//
// A pergunta que este módulo existe para responder é a do §44:
//   "Quem informou que Antônio nasceu em 1921?"
//
// REGRAS QUE NÃO TÊM EXCEÇÃO:
//   • contribuição, claim e evidência NUNCA são apagadas;
//   • resolver divergência é ACRESCENTAR uma escolha, não remover as
//     versões perdedoras;
//   • a IA só escreve claim com status AI_INFERRED (o banco recusa o
//     resto — `ia_so_infere`);
//   • todo fato exibido carrega o caminho de volta até quem o informou.
//
// A UI NUNCA diz "claim", "evidência" ou "proveniência" (§82). O usuário
// responde "Quando ele nasceu?" e "Como você sabe disso?". Se ele
// perceber o modelo, a implementação falhou.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const datas = require('./datas');
const { auditar } = require('./repo');

const s = (v, max = 2000) => String(v == null ? '' : v).trim().slice(0, max);

// Predicados que a Fase 3 conhece, e onde cada um aparece na pessoa.
// Acrescentar predicado é acrescentar linha aqui — a projeção segue.
const PREDICADOS = {
  nome: { coluna: 'nome_exibicao', tipo: 'texto' },
  data_nascimento: { coluna: 'nascimento', tipo: 'data' },
  data_falecimento: { coluna: 'falecimento', tipo: 'data' },
  local_nascimento: { coluna: 'local_nascimento', tipo: 'texto' },
  profissao: { coluna: 'profissao', tipo: 'texto' },
};

const STATUS = ['DOCUMENTED', 'FAMILY_REPORTED', 'AI_INFERRED', 'PROBABLE', 'DISPUTED', 'UNCONFIRMED'];

// Fonte documental é o que autoriza DOCUMENTED. Relato de família, por
// mais convicto que seja, é FAMILY_REPORTED — e isso não é desprezo pelo
// relato: é o que permite comparar os dois depois.
const FONTES_DOCUMENTAIS = ['DOCUMENTO', 'REGISTRO_OFICIAL'];

/**
 * Normaliza o valor para COMPARAÇÃO. Sem isto, "1921" e "1921 " viram
 * divergência falsa e a família passa a ver conflito onde não há.
 */
function normalizar(valor, tipo) {
  const bruto = s(valor, 300).toLowerCase().replace(/\s+/g, ' ').trim();
  if (tipo === 'data') {
    const d = datas.interpretar(bruto);
    // Datas comparam pelo INTERVALO: "1921" e "ANO 1921" são o mesmo fato.
    return d.erro ? bruto : `${d.ini || ''}..${d.fim || ''}`;
  }
  return bruto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Status derivado da fonte — não é o usuário que escolhe. */
function statusPorFonte(tipoFonte, criadoPorIA) {
  if (criadoPorIA) return 'AI_INFERRED';
  if (FONTES_DOCUMENTAIS.includes(tipoFonte)) return 'DOCUMENTED';
  if (tipoFonte === 'IA') return 'AI_INFERRED';
  return 'FAMILY_REPORTED';
}

// ---------------------------------------------------------------- fontes
async function criarFonte(t, { familyId, userId, tipo, titulo, contributionId = null,
  referenciaExterna = '', confiabilidade = 'media', porIA = false }) {
  if (!['DOCUMENTO', 'RELATO', 'ENTREVISTA', 'MIDIA', 'REGISTRO_OFICIAL',
    'PUBLICACAO', 'IMPORTACAO', 'IA'].includes(tipo)) throw erro('erro.fonte_tipo_invalido', 400);
  return t.uma(
    `INSERT INTO sources (family_id, tipo, titulo, contribution_id, referencia_externa,
       confiabilidade, created_by, created_by_kind)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [familyId, tipo, s(titulo, 200) || tipo, contributionId, s(referenciaExterna, 300),
      confiabilidade, userId, porIA ? 'ai' : 'user']);
}

// ---------------------------------------------------------- contribuições
/**
 * O que uma pessoa contou, cru. Editar NÃO sobrescreve: cria revisão e a
 * original vira `revisada`, continuando consultável (§15).
 */
async function contribuir(t, { familyId, userId, alvoTipo, alvoId, corpo, tipo = 'relato',
  autorPersonId = null, privacidade = 'FAMILY' }) {
  if (s(corpo).length < 2) throw erro('erro.contribuicao_vazia', 400);
  const c = await t.uma(
    `INSERT INTO contributions (family_id, autor_user_id, autor_person_id, alvo_tipo, alvo_id,
       tipo, corpo, privacidade)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [familyId, userId, autorPersonId, alvoTipo, alvoId, tipo, s(corpo, 20000), privacidade]);
  await auditar({ familyId, atorUserId: userId, acao: 'contribuicao.registrada',
    alvoTipo: 'contribution', alvoId: c.id, depois: { alvo: alvoTipo, tipo } }, t);
  return c;
}

async function revisarContribuicao(t, { familyId, userId, id, corpo }) {
  const original = await t.uma(`SELECT * FROM contributions WHERE id = $1`, [id]);
  if (!original) throw erro('erro.contribuicao_nao_encontrada', 404);
  const nova = await t.uma(
    `INSERT INTO contributions (family_id, autor_user_id, autor_person_id, alvo_tipo, alvo_id,
       tipo, corpo, privacidade, revisao_de)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [familyId, userId, original.autor_person_id, original.alvo_tipo, original.alvo_id,
      original.tipo, s(corpo, 20000), original.privacidade, original.id]);
  // A original NÃO é apagada nem alterada no conteúdo: só deixa de ser a
  // versão corrente. É isso que o §15 protege.
  await t.q(`UPDATE contributions SET status = 'revisada' WHERE id = $1`, [id]);
  await auditar({ familyId, atorUserId: userId, acao: 'contribuicao.revisada',
    alvoTipo: 'contribution', alvoId: nova.id, antes: { de: id } }, t);
  return nova;
}

const contribuicoesDe = (t, alvoTipo, alvoId) => t.todas(
  `SELECT c.*, u.nome AS autor_nome
     FROM contributions c LEFT JOIN users u ON u.id = c.autor_user_id
    WHERE c.alvo_tipo = $1 AND c.alvo_id = $2
    ORDER BY c.created_at DESC`, [alvoTipo, alvoId]);

// --------------------------------------------------------------- claims
/**
 * Afirma alguma coisa sobre alguém, COM a fonte. Não existe caminho para
 * criar claim sem fonte — é o que garante que todo fato tenha volta.
 */
async function afirmar(t, { familyId, userId, sujeitoTipo = 'person', sujeitoId, predicado,
  valor, fonte, porIA = false, aiJobId = null, confianca = null, forcaEvidencia = 'media',
  trecho = '' }) {
  const def = PREDICADOS[predicado];
  if (!def) throw erro('erro.predicado_desconhecido', 400);
  if (s(valor, 300).length < 1) throw erro('erro.claim_sem_valor', 400);
  if (!fonte || !fonte.id) throw erro('erro.claim_sem_fonte', 400);

  let precisao = 'EXATO', ini = null, fim = null, valorFinal = s(valor, 300);
  if (def.tipo === 'data') {
    const d = datas.interpretar(valor);
    if (d.erro) throw erro(d.erro, 400);
    precisao = d.precisao; ini = d.ini; fim = d.fim; valorFinal = d.valor;
  }

  const status = statusPorFonte(fonte.tipo, porIA);
  const norm = normalizar(valorFinal, def.tipo);

  let c;
  try {
    c = await t.uma(
      `INSERT INTO claims (family_id, sujeito_tipo, sujeito_id, predicado, valor, valor_tipo,
         precisao, valor_ini, valor_fim, valor_norm, status, confianca,
         created_by, created_by_kind, ai_job_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [familyId, sujeitoTipo, sujeitoId, predicado, valorFinal, def.tipo,
        precisao, ini, fim, norm, status, confianca, userId, porIA ? 'ai' : 'user', aiJobId]);
  } catch (e) {
    if (e.code === '23505') throw erro('erro.claim_repetido', 409);   // mesma pessoa, mesmo valor
    throw e;
  }

  await t.q(
    `INSERT INTO evidence (family_id, claim_id, source_id, posicao, forca, trecho,
       created_by, created_by_kind)
     VALUES ($1,$2,$3,'SUPORTA',$4,$5,$6,$7)`,
    [familyId, c.id, fonte.id, forcaEvidencia, s(trecho, 2000), userId, porIA ? 'ai' : 'user']);

  await auditar({ familyId, atorUserId: userId, atorKind: porIA ? 'ai' : 'user',
    acao: 'claim.afirmado', alvoTipo: 'claim', alvoId: c.id,
    depois: { predicado, valor: valorFinal, status } }, t);

  if (sujeitoTipo === 'person') await projetar(t, sujeitoId);
  return c;
}

/** Acrescenta uma fonte a um claim que já existe — inclusive CONTRADIZENDO. */
async function anexarEvidencia(t, { familyId, userId, claimId, fonte, posicao = 'SUPORTA',
  forca = 'media', trecho = '', nota = '' }) {
  const c = await t.uma(`SELECT * FROM claims WHERE id = $1`, [claimId]);
  if (!c) throw erro('erro.claim_nao_encontrado', 404);
  let ev;
  try {
    ev = await t.uma(
      `INSERT INTO evidence (family_id, claim_id, source_id, posicao, forca, trecho, nota,
         created_by, created_by_kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'user') RETURNING *`,
      [familyId, claimId, fonte.id, posicao, forca, s(trecho, 2000), s(nota, 500), userId]);
  } catch (e) {
    if (e.code === '23505') throw erro('erro.evidencia_repetida', 409);
    throw e;
  }
  // Fonte documental que SUPORTA promove o claim: a evidência mudou, o
  // status acompanha. Nunca o contrário — status não se digita.
  if (posicao === 'SUPORTA' && FONTES_DOCUMENTAIS.includes(fonte.tipo)
      && c.status !== 'DOCUMENTED' && c.created_by_kind !== 'ai') {
    await t.q(`UPDATE claims SET status = 'DOCUMENTED' WHERE id = $1`, [claimId]);
  }
  await auditar({ familyId, atorUserId: userId, acao: 'evidencia.anexada',
    alvoTipo: 'claim', alvoId: claimId, depois: { posicao, fonte: fonte.tipo } }, t);
  if (c.sujeito_tipo === 'person') await projetar(t, c.sujeito_id);
  return ev;
}

/**
 * Promover claim de IA a fato confirmado é ato HUMANO e registrado.
 * Não existe promoção automática (§6) — nem por acúmulo, nem por tempo.
 */
async function confirmarInferencia(t, { familyId, userId, claimId, novoStatus = 'FAMILY_REPORTED' }) {
  if (!['FAMILY_REPORTED', 'DOCUMENTED', 'PROBABLE'].includes(novoStatus)) {
    throw erro('erro.status_invalido', 400);
  }
  const c = await t.uma(`SELECT * FROM claims WHERE id = $1`, [claimId]);
  if (!c) throw erro('erro.claim_nao_encontrado', 404);
  if (c.created_by_kind !== 'ai') throw erro('erro.claim_nao_e_inferencia', 400);
  // O claim da IA continua existindo como AI_INFERRED; a confirmação é um
  // claim NOVO, humano, com a mesma informação. Assim o histórico mostra
  // que a IA sugeriu e QUEM confirmou.
  const fonte = await criarFonte(t, { familyId, userId, tipo: 'RELATO',
    titulo: 'Confirmação humana de sugestão da IA' });
  const novo = await t.uma(
    `INSERT INTO claims (family_id, sujeito_tipo, sujeito_id, predicado, valor, valor_tipo,
       precisao, valor_ini, valor_fim, valor_norm, status, created_by, created_by_kind)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'user') RETURNING *`,
    [familyId, c.sujeito_tipo, c.sujeito_id, c.predicado, c.valor, c.valor_tipo,
      c.precisao, c.valor_ini, c.valor_fim, c.valor_norm, novoStatus, userId]);
  await t.q(
    `INSERT INTO evidence (family_id, claim_id, source_id, posicao, forca, created_by, created_by_kind)
     VALUES ($1,$2,$3,'SUPORTA','media',$4,'user')`, [familyId, novo.id, fonte.id, userId]);
  await auditar({ familyId, atorUserId: userId, acao: 'inferencia.confirmada',
    alvoTipo: 'claim', alvoId: novo.id, antes: { sugerido_por_ia: c.id } }, t);
  if (c.sujeito_tipo === 'person') await projetar(t, c.sujeito_id);
  return novo;
}

// ---------------------------------------------------------- divergência
/** Grupos em divergência de uma pessoa (§17). */
const divergenciasDe = (t, sujeitoId) => t.todas(
  `SELECT predicado, valores_distintos, valores FROM v_divergencias
    WHERE sujeito_id = $1 ORDER BY predicado`, [sujeitoId]);

/**
 * Todas as versões de um campo, com quem informou, quando e de onde.
 * É esta consulta que responde "de onde veio isto?" — e é ela que a tela
 * de comparação de fontes usa.
 */
const versoesDe = (t, sujeitoId, predicado) => t.todas(
  `SELECT c.id, c.valor, c.precisao, c.status, c.confianca, c.created_at,
          c.created_by_kind, u.nome AS informado_por,
          (SELECT r.claim_aceito_id FROM claim_resolutions r
            WHERE r.sujeito_id = c.sujeito_id AND r.predicado = c.predicado
            ORDER BY r.created_at DESC LIMIT 1) = c.id AS aceito,
          COALESCE(json_agg(json_build_object(
            'id', e.id, 'posicao', e.posicao, 'forca', e.forca, 'trecho', e.trecho,
            'fonte_tipo', f.tipo, 'fonte_titulo', f.titulo,
            'fonte_referencia', f.referencia_externa, 'contribuicao_id', f.contribution_id
          ) ORDER BY e.created_at) FILTER (WHERE e.id IS NOT NULL), '[]') AS evidencias
     FROM claims c
     LEFT JOIN users u ON u.id = c.created_by
     LEFT JOIN evidence e ON e.claim_id = c.id
     LEFT JOIN sources f ON f.id = e.source_id
    WHERE c.sujeito_id = $1 AND c.predicado = $2
    GROUP BY c.id, u.nome
    ORDER BY CASE c.status WHEN 'DOCUMENTED' THEN 1 WHEN 'FAMILY_REPORTED' THEN 2
                           WHEN 'PROBABLE' THEN 3 WHEN 'AI_INFERRED' THEN 5 ELSE 4 END,
             c.created_at`, [sujeitoId, predicado]);

/**
 * A família escolhe uma versão. As perdedoras CONTINUAM ali, visíveis e
 * consultáveis — reverter é um INSERT novo, nunca um DELETE (§4, §17).
 */
async function resolver(t, { familyId, userId, sujeitoId, predicado, claimAceitoId, motivo }) {
  const c = await t.uma(
    `SELECT * FROM claims WHERE id = $1 AND sujeito_id = $2 AND predicado = $3`,
    [claimAceitoId, sujeitoId, predicado]);
  if (!c) throw erro('erro.claim_nao_encontrado', 404);
  if (s(motivo).length < 3) throw erro('erro.resolucao_sem_motivo', 400);
  const r = await t.uma(
    `INSERT INTO claim_resolutions (family_id, sujeito_tipo, sujeito_id, predicado,
       claim_aceito_id, motivo, decidido_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [familyId, c.sujeito_tipo, sujeitoId, predicado, claimAceitoId, s(motivo, 500), userId]);
  await auditar({ familyId, atorUserId: userId, acao: 'divergencia.resolvida',
    alvoTipo: 'claim', alvoId: claimAceitoId, depois: { predicado, valor: c.valor, motivo } }, t);
  if (c.sujeito_tipo === 'person') await projetar(t, sujeitoId);
  return r;
}

// ----------------------------------------------------------- projeção
/**
 * Reescreve as colunas de EXIBIÇÃO da pessoa a partir dos fatos aceitos.
 *
 * A coluna não é a verdade — é a vitrine. A verdade são os claims, e
 * `*_claim_id` guarda de qual deles cada valor veio, para a tela oferecer
 * o caminho de volta em um clique.
 */
async function projetar(t, personId) {
  const fatos = await t.todas(
    `SELECT predicado, claim_id, valor, precisao, valor_ini, valor_fim, status, em_divergencia
       FROM v_fatos WHERE sujeito_tipo = 'person' AND sujeito_id = $1`, [personId]);
  if (!fatos.length) return null;

  const campos = [];
  const valores = [personId];
  const por = Object.fromEntries(fatos.map((f) => [f.predicado, f]));

  const pushar = (sql, v) => { valores.push(v); campos.push(sql.replace('$$', `$${valores.length}`)); };

  if (por.nome) { pushar('nome_exibicao = $$', por.nome.valor); pushar('nome_claim_id = $$', por.nome.claim_id); }
  for (const [pred, prefixo] of [['data_nascimento', 'nascimento'], ['data_falecimento', 'falecimento']]) {
    const f = por[pred];
    if (!f) continue;
    pushar(`${prefixo}_valor = $$`, f.valor);
    pushar(`${prefixo}_precisao = $$`, f.precisao);
    pushar(`${prefixo}_ini = $$`, f.valor_ini);
    pushar(`${prefixo}_fim = $$`, f.valor_fim);
    pushar(`${prefixo}_claim_id = $$`, f.claim_id);
  }
  if (por.local_nascimento) pushar('local_nascimento = $$', por.local_nascimento.valor);
  if (por.profissao) pushar('profissao = $$', por.profissao.valor);
  if (!campos.length) return null;

  return t.uma(`UPDATE persons SET ${campos.join(', ')}, updated_at = now()
                 WHERE id = $1 RETURNING *`, valores);
}

/** Os fatos de uma pessoa, prontos para a tela — cada um com o selo. */
const fatosDe = (t, sujeitoId) => t.todas(
  `SELECT predicado, claim_id, valor, precisao, status, resolvido, em_divergencia
     FROM v_fatos WHERE sujeito_tipo = 'person' AND sujeito_id = $1
    ORDER BY predicado`, [sujeitoId]);

module.exports = {
  PREDICADOS, STATUS, FONTES_DOCUMENTAIS, normalizar, statusPorFonte,
  criarFonte, contribuir, revisarContribuicao, contribuicoesDe,
  afirmar, anexarEvidencia, confirmarInferencia,
  divergenciasDe, versoesDe, resolver, projetar, fatosDe,
};
