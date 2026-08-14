// =====================================================================
// ORIGENA — Cápsula do Tempo (fase 3.3, §39).
//
// POR QUE ISTO EXISTE. Quase tudo na Origena é sobre o passado. A cápsula
// é a única coisa que anda para o outro lado: alguém escreve hoje para
// ser lido daqui a quinze anos, quando talvez já não esteja aqui para
// explicar. É a carta que o produto entrega no lugar da pessoa.
//
// LACRADA É LACRADA. O corpo vive cifrado (chave fora do banco) e não
// existe caminho de leitura antes da hora — nem para o OWNER, nem para
// quem escreveu, nem por engano de uma tela nova: `podeVer` trata
// TIME_LOCKED como o único nível que vence o OWNER, e é ele que decide.
// Uma cápsula que o dono da conta consegue espiar não é uma cápsula.
//
// A EXISTÊNCIA É PÚBLICA, O CONTEÚDO NÃO. Título, autor e data de
// abertura ficam em claro. Cápsula secreta é cápsula que ninguém abre —
// e ser aberta é o ponto inteiro dela.
//
// FOTO DENTRO DA CÁPSULA TAMBÉM SOME. Anexar uma foto e deixá-la na
// galeria seria entregar o conteúdo pela porta dos fundos. Ao lacrar, a
// mídia vira TIME_LOCKED e o índice de busca é REFEITO — mudar
// privacidade sem reindexar deixa o item invisível na galeria e visível
// na busca, que é o pior dos dois mundos.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const { auditar } = require('./repo');
const privacidade = require('./privacidade');
const sessao = require('./sessao');
const midia = require('./midia');
const cofre = require('./cofre');

const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Quando esta cápsula abre — ou por que ainda não dá para saber.
 * IDADE depende da data de nascimento da pessoa. Sem ela, a cápsula não
 * abre e diz o motivo; chutar uma data aqui seria abrir cedo a carta de
 * alguém.
 */
function quandoAbre(c, pessoa) {
  if (c.condicao === 'DATA') return { em: c.abre_em ? new Date(c.abre_em) : null };
  const nasc = pessoa && pessoa.nascimento_ini;
  if (!nasc) return { em: null, motivo: 'capsula_sem_nascimento' };
  const d = new Date(nasc);
  return { em: new Date(Date.UTC(d.getUTCFullYear() + Number(c.abre_na_idade),
    d.getUTCMonth(), d.getUTCDate())) };
}

const pessoaDe = (t, id) => (id
  ? t.uma(`SELECT id, nome_exibicao, nascimento_ini, nascimento_valor, privacidade, created_by
             FROM persons WHERE id = $1 AND deleted_at IS NULL`, [id])
  : Promise.resolve(null));

// ------------------------------------------------------------------ criar
async function criar(t, { familyId, userId, papel, dados }) {
  const titulo = s(dados.titulo, 160);
  if (titulo.length < 2) throw erro('erro.capsula_sem_titulo', 400);
  const corpo = s(dados.corpo, 40000);
  const midias = (Array.isArray(dados.midias) ? dados.midias : [])
    .filter((x) => UUID.test(String(x))).slice(0, 30);
  if (!corpo && !midias.length) throw erro('erro.capsula_vazia', 400);

  const condicao = dados.condicao === 'IDADE' ? 'IDADE' : 'DATA';
  const destino = dados.destino === 'PESSOA' ? 'PESSOA' : 'FAMILIA';
  const personId = UUID.test(String(dados.pessoa || '')) ? dados.pessoa : null;
  if (destino === 'PESSOA' && !personId) throw erro('erro.capsula_sem_pessoa', 400);

  let abreEm = null;
  let idade = null;
  if (condicao === 'DATA') {
    abreEm = new Date(s(dados.abre_em, 40));
    if (isNaN(abreEm.getTime())) throw erro('erro.capsula_data_invalida', 400);
    // Cápsula que já nasce aberta não é cápsula — e o erro mais provável
    // de quem escreve com pressa é digitar o ano corrente.
    if (abreEm <= new Date()) throw erro('erro.capsula_data_passada', 400);
  } else {
    idade = Number(dados.abre_na_idade);
    if (!Number.isInteger(idade) || idade < 1 || idade > 120) {
      throw erro('erro.capsula_idade_invalida', 400);
    }
    if (!personId) throw erro('erro.capsula_sem_pessoa', 400);
  }

  const quem = { userId, papel };
  if (personId) {
    const p = await pessoaDe(t, personId);
    if (!p || !privacidade.podeVer(p, quem).pode) throw erro('erro.pessoa_nao_encontrada', 404);
  }

  // Cifrar ANTES de inserir: se não há chave, nada é gravado. Não existe
  // modo silencioso que guarde a carta em texto puro.
  const cifrado = corpo ? sessao.cifrar(corpo) : '';

  const c = await t.uma(
    `INSERT INTO time_capsules (family_id, titulo, recado, destino, person_id, condicao,
        abre_em, abre_na_idade, corpo_cifrado, midias, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [familyId, titulo, s(dados.recado, 400), destino, personId, condicao,
      abreEm, idade, cifrado, midias, userId]);

  await lacrarMidias(t, { familyId, capsula: c, midias, quem });
  await auditar({ familyId, atorUserId: userId, acao: 'capsula.criada',
    alvoTipo: 'time_capsule', alvoId: c.id,
    depois: { titulo, condicao, destino, midias: midias.length } }, t);
  return semCorpo(c);
}

/**
 * Lacra as mídias junto com a cápsula. Guarda a privacidade anterior de
 * cada uma: na abertura ela VOLTA ao que era. Abrir uma cápsula não pode
 * tornar pública uma foto que já era privada antes de entrar nela.
 */
async function lacrarMidias(t, { familyId, capsula, midias, quem }) {
  if (!midias.length) return;
  const antes = {};
  for (const id of midias) {
    const m = await t.uma(
      `SELECT id, privacidade, created_by FROM media
        WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!m || !privacidade.podeVer(m, quem).pode) throw erro('erro.midia_nao_encontrada', 404);
    // SÓ A PRÓPRIA MÍDIA ENTRA NA CÁPSULA. Lacrar é o único jeito de
    // sumir com uma coisa aos olhos da família inteira — inclusive do
    // OWNER. Se valesse para o que os outros enviaram, a cápsula viraria
    // a ferramenta perfeita para esconder o acervo alheio por 80 anos,
    // com a aparência de recurso legítimo. Conflito familiar é cenário
    // esperado aqui (§89), não excepcional.
    if (m.created_by !== quem.userId) throw erro('erro.capsula_midia_de_outro', 403);
    antes[id] = m.privacidade;
    // liberada_em fica NULO de propósito: a mídia não se solta sozinha
    // quando a data chega. Quem solta é a ABERTURA da cápsula — senão a
    // foto aparece na galeria antes de alguém ler a carta.
    await t.q(`UPDATE media SET privacidade = 'TIME_LOCKED', updated_at = now() WHERE id = $1`, [id]);
    await midia.reindexar(t, familyId, id);
  }
  await t.q(`UPDATE time_capsules SET privacidade_anterior = $2 WHERE id = $1`,
    [capsula.id, JSON.stringify(antes)]);
}

// ----------------------------------------------------------------- listar
/**
 * A lista NUNCA carrega o corpo cifrado — nem para depois filtrar. O que
 * não sai do banco não vaza por descuido de uma tela nova.
 */
async function listar(t, familyId, quem) {
  const linhas = await t.todas(
    `SELECT c.id, c.titulo, c.recado, c.destino, c.person_id, c.condicao, c.abre_em,
            c.abre_na_idade, c.status, c.aberta_em, c.created_at, c.created_by,
            array_length(c.midias, 1) AS n_midias,
            u.nome AS autor, p.nome_exibicao AS para, p.nascimento_ini
       FROM time_capsules c
       LEFT JOIN users   u ON u.id = c.created_by
       LEFT JOIN persons p ON p.id = c.person_id
      WHERE c.family_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC`, [familyId]);

  const agora = new Date();
  return linhas.map((c) => {
    const q = quandoAbre(c, { nascimento_ini: c.nascimento_ini });
    return {
      id: c.id, titulo: c.titulo, recado: c.recado, destino: c.destino, para: c.para,
      condicao: c.condicao, abre_na_idade: c.abre_na_idade, status: c.status,
      autor: c.autor, criada_em: c.created_at, aberta_em: c.aberta_em,
      midias: c.n_midias || 0,
      abre_em: q.em, motivo: q.motivo || null,
      pode_abrir: c.status === 'lacrada' && !!q.em && q.em <= agora,
    };
  });
}

// ------------------------------------------------------------------ abrir
/**
 * Abrir é um ATO, não um efeito colateral do calendário. A cápsula só
 * decifra aqui, e a abertura vai para o audit_log com quem abriu.
 */
async function abrir(t, { familyId, capsulaId, quem }) {
  const c = await t.uma(
    `SELECT * FROM time_capsules WHERE id = $1 AND deleted_at IS NULL`, [capsulaId]);
  if (!c) throw erro('erro.capsula_nao_encontrada', 404);
  if (c.status === 'cancelada') throw erro('erro.capsula_cancelada', 409);

  if (c.status === 'lacrada') {
    const pessoa = await pessoaDe(t, c.person_id);
    const q = quandoAbre(c, pessoa);
    if (!q.em) throw erro('erro.' + (q.motivo || 'capsula_sem_data').replace('capsula.', 'capsula_'), 409);
    if (q.em > new Date()) throw erro('erro.capsula_ainda_lacrada', 409);

    // devolve cada mídia à privacidade que ela tinha ANTES de ser lacrada
    const antes = c.privacidade_anterior || {};
    for (const id of c.midias || []) {
      const nivel = antes[id] || 'FAMILY';
      await t.q(`UPDATE media SET privacidade = $2, updated_at = now() WHERE id = $1`, [id, nivel]);
      await midia.reindexar(t, familyId, id);
    }
    await t.q(`UPDATE time_capsules SET status = 'aberta', aberta_em = now(), aberta_por = $2
                WHERE id = $1`, [capsulaId, quem.userId]);
    await auditar({ familyId, atorUserId: quem.userId, acao: 'capsula.aberta',
      alvoTipo: 'time_capsule', alvoId: capsulaId, depois: { titulo: c.titulo } }, t);
  }

  return {
    id: c.id, titulo: c.titulo, recado: c.recado, status: 'aberta',
    corpo: c.corpo_cifrado ? sessao.decifrar(c.corpo_cifrado) : '',
    midias: c.midias || [],
  };
}

// --------------------------------------------------------------- cancelar
/**
 * Só quem escreveu cancela, e só enquanto está lacrada. A carta é da
 * pessoa: nem o OWNER da família decide destruir o que outro escreveu —
 * e depois de aberta ela já virou parte do acervo.
 */
async function cancelar(t, { familyId, capsulaId, quem }) {
  const c = await t.uma(
    `SELECT * FROM time_capsules WHERE id = $1 AND deleted_at IS NULL`, [capsulaId]);
  if (!c) throw erro('erro.capsula_nao_encontrada', 404);
  if (c.created_by !== quem.userId) throw erro('erro.capsula_nao_e_sua', 403);
  if (c.status !== 'lacrada') throw erro('erro.capsula_ja_aberta', 409);

  const antes = c.privacidade_anterior || {};
  for (const id of c.midias || []) {
    await t.q(`UPDATE media SET privacidade = $2, updated_at = now() WHERE id = $1`,
      [id, antes[id] || 'FAMILY']);
    await midia.reindexar(t, familyId, id);
  }
  await t.q(`UPDATE time_capsules SET status = 'cancelada', deleted_at = now() WHERE id = $1`,
    [capsulaId]);
  await auditar({ familyId, atorUserId: quem.userId, acao: 'capsula.cancelada',
    alvoTipo: 'time_capsule', alvoId: capsulaId, antes: { titulo: c.titulo } }, t);
  return { cancelada: true };
}

const semCorpo = (c) => ({ id: c.id, titulo: c.titulo, status: c.status,
  condicao: c.condicao, abre_em: c.abre_em, abre_na_idade: c.abre_na_idade });


// ==================== COFRE (§39, decisão do Augusto 12/08/2026) ====================
// Cápsula do cofre é cifrada com chave de PESSOAS: o servidor não
// consegue ler. Cápsula do servidor (o modo antigo) continua existindo —
// e as duas prometem coisas DIFERENTES, o que a tela precisa dizer.

/**
 * A pessoa define a senha do próprio cofre. Só ela digita.
 *
 * ⚠️ Perder esta senha é perder as cartas, sem recuperação. O produto não
 * pode oferecer "esqueci minha senha" aqui: se pudesse redefinir, o
 * servidor teria como abrir, e o cofre seria teatro.
 */
async function definirSenhaDoCofre(t, { userId, senha }) {
  const s = String(senha || '');
  if (s.length < 12) throw erro('erro.cofre_senha_curta', 400);
  const jaTem = await t.uma(`SELECT user_id FROM capsule_keys WHERE user_id = $1`, [userId]);
  // Trocar a senha exigiria REEMBRULHAR todo envelope da pessoa — e isso
  // só é possível com a senha ANTIGA em mãos. Enquanto essa troca não
  // existir, recusar é mais honesto que sobrescrever e perder as cartas.
  if (jaTem) throw erro('erro.cofre_ja_tem_senha', 409);
  const m = cofre.criarChaveDePessoa(s);
  await t.q(
    `INSERT INTO capsule_keys (user_id, sal, publica, privada_cifrada, verificador)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, m.sal, m.publica, m.privada_cifrada, m.verificador]);
  return { pronto: true };
}

const materialDe = (t, userId) => t.uma(
  `SELECT user_id, sal, publica, privada_cifrada, verificador
     FROM capsule_keys WHERE user_id = $1`, [userId]);

/**
 * Quem, nesta família, já tem cofre — logo, pode receber um envelope.
 * A parte pública basta: ninguém precisa estar presente nem digitar
 * senha para receber uma cápsula endereçada a si.
 */
const podemReceber = (t, familyId) => t.todas(
  `SELECT u.id, u.nome FROM capsule_keys k
     JOIN users u ON u.id = k.user_id
     JOIN family_memberships m ON m.user_id = u.id
       AND m.family_id = $1 AND m.status = 'ativo'
    ORDER BY u.nome`, [familyId]);

/**
 * Lacra no cofre e escreve um envelope por pessoa.
 *
 * O AUTOR ENTRA SEMPRE. Uma cápsula que o próprio autor não consegue
 * reabrir seria uma carta jogada num poço — e o erro seria descoberto
 * anos depois, por quem não pode mais consertar.
 */
async function lacrarNoCofre(t, { familyId, capsulaId, autorUserId, texto, paraUserIds }) {
  const alvos = [...new Set([autorUserId, ...(paraUserIds || [])])];
  const materiais = [];
  for (const id of alvos) {
    const m = await materialDe(t, id);
    // Sem cofre configurado não dá para embrulhar: recusar é melhor que
    // lacrar deixando alguém de fora em silêncio.
    if (!m) throw erro('erro.cofre_sem_chave_de_alguem', 409);
    materiais.push(m);
  }

  const chave = cofre.novaChaveDeCapsula();
  const corpo = cofre.lacrar(chave, texto);
  await t.q(`UPDATE time_capsules SET corpo_cifrado = $2, chave_modo = 'cofre' WHERE id = $1`,
    [capsulaId, corpo]);
  for (const m of materiais) {
    const env = cofre.embrulhar(chave, m);
    await t.q(
      `INSERT INTO capsule_envelopes (family_id, capsule_id, user_id, efemera, pacote)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (capsule_id, user_id) DO UPDATE SET efemera = $4, pacote = $5`,
      [familyId, capsulaId, m.user_id, env.efemera, env.pacote]);
  }
  chave.fill(0);            // some da memória assim que os envelopes existem
  return { envelopes: materiais.length };
}

/** Abre uma cápsula do cofre com a senha de QUEM está pedindo. */
async function abrirDoCofre(t, { capsulaId, userId, senha }) {
  const c = await t.uma(
    `SELECT corpo_cifrado FROM time_capsules WHERE id = $1 AND deleted_at IS NULL`, [capsulaId]);
  if (!c) throw erro('erro.capsula_nao_encontrada', 404);
  const env = await t.uma(
    `SELECT efemera, pacote FROM capsule_envelopes WHERE capsule_id = $1 AND user_id = $2`,
    [capsulaId, userId]);
  // Sem envelope, esta pessoa não é destinatária. 404 e não 403: dizer
  // "existe, mas não é para você" já entrega informação sobre a carta.
  if (!env) throw erro('erro.capsula_nao_encontrada', 404);
  const m = await materialDe(t, userId);
  if (!m) throw erro('erro.cofre_sem_chave', 409);
  if (!cofre.senhaConfere(m, senha)) throw erro('erro.cofre_senha_errada', 401);

  const chave = cofre.desembrulhar(env, m, senha);
  try { return cofre.abrir(chave, c.corpo_cifrado); }
  finally { chave.fill(0); }
}

/** Quem pode abrir esta cápsula — a tela PRECISA mostrar isto (§39). */
const quemAbre = (t, capsulaId) => t.todas(
  `SELECT u.id, u.nome FROM capsule_envelopes e JOIN users u ON u.id = e.user_id
    WHERE e.capsule_id = $1 ORDER BY u.nome`, [capsulaId]);

module.exports = { criar, listar, abrir, cancelar, quandoAbre,
  definirSenhaDoCofre, podemReceber, lacrarNoCofre, abrirDoCofre, quemAbre };
