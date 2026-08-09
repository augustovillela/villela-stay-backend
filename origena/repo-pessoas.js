// =====================================================================
// ORIGENA — pessoas e parentesco: acesso a dados (Fase 2).
//
// TODA função recebe `t` — o cliente da transação já escopada pela
// família (tenancy.comEscopo). Não existe aqui nenhuma consulta que
// use o pool solto: o RLS barraria, e mesmo que não barrasse, o desenho
// é este.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const datas = require('./datas');
const arvore = require('./arvore');
const busca = require('./busca');
const { auditar } = require('./repo');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

/** Aplica o trio (valor, precisão, intervalo) a partir do que foi digitado. */
function campoData(bruto, prefixo) {
  if (bruto == null || String(bruto).trim() === '') {
    return { [`${prefixo}_valor`]: null, [`${prefixo}_precisao`]: 'ANO',
      [`${prefixo}_ini`]: null, [`${prefixo}_fim`]: null };
  }
  const d = datas.interpretar(bruto);
  if (d.erro) throw erro(d.erro, 400);
  return { [`${prefixo}_valor`]: d.valor, [`${prefixo}_precisao`]: d.precisao,
    [`${prefixo}_ini`]: d.ini, [`${prefixo}_fim`]: d.fim };
}

/** A pessoa entra na busca com o que se sabe dela — nome, apelido, ofício, lugar. */
const indexar = (t, familyId, p) => busca.indexar(t, {
  familyId, refTipo: 'person', refId: p.id,
  titulo: [p.nome_exibicao, p.apelido].filter(Boolean).join(' · '),
  corpo: [p.resumo, p.profissao, p.local_nascimento].filter(Boolean).join('\n'),
  pessoas: [p.id], dataIni: p.nascimento_ini, dataFim: p.falecimento_fim || p.nascimento_fim,
  localTexto: p.local_nascimento, privacidade: p.privacidade, criadoPor: p.created_by,
});

const Persons = {
  listar: (t, familyId, { busca = '', limite = 200, offset = 0 } = {}) => t.todas(
    `SELECT ${arvore.CAMPOS},
            (SELECT count(*)::int FROM relationships r
              WHERE r.person_a = p.id AND r.tipo='PARENT_OF' AND r.deleted_at IS NULL) AS filhos
       FROM persons p
      WHERE p.family_id = $1 AND p.deleted_at IS NULL
        AND ($2 = '' OR p.nome_exibicao ILIKE '%' || $2 || '%' OR p.apelido ILIKE '%' || $2 || '%')
      ORDER BY p.nascimento_ini NULLS LAST, p.nome_exibicao
      LIMIT $3 OFFSET $4`, [familyId, s(busca, 80), Math.min(limite, 500), offset]),

  obter: (t, id) => t.uma(
    `SELECT * FROM persons WHERE id = $1 AND deleted_at IS NULL`, [id]),

  async criar(t, { familyId, userId, dados }) {
    const nome = s(dados.nome_exibicao || dados.nome, 120);
    if (nome.length < 2) throw erro('erro.pessoa_sem_nome', 400);
    const nasc = campoData(dados.nascimento, 'nascimento');
    const falec = campoData(dados.falecimento, 'falecimento');
    // Vitalidade se deduz do que foi informado, mas o usuário pode dizer.
    const vitalidade = ['viva', 'falecida', 'desconhecido'].includes(dados.vitalidade)
      ? dados.vitalidade : (falec.falecimento_valor ? 'falecida' : 'desconhecido');

    const p = await t.uma(
      `INSERT INTO persons (family_id, nome_exibicao, sobrenome, apelido,
         nascimento_valor, nascimento_precisao, nascimento_ini, nascimento_fim,
         falecimento_valor, falecimento_precisao, falecimento_ini, falecimento_fim,
         vitalidade, genero, local_nascimento, profissao, resumo, privacidade, eh_menor, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [familyId, nome, s(dados.sobrenome, 80), s(dados.apelido, 60),
        nasc.nascimento_valor, nasc.nascimento_precisao, nasc.nascimento_ini, nasc.nascimento_fim,
        falec.falecimento_valor, falec.falecimento_precisao, falec.falecimento_ini, falec.falecimento_fim,
        vitalidade, s(dados.genero, 40), s(dados.local_nascimento, 160), s(dados.profissao, 120),
        s(dados.resumo, 2000),
        // §73: menor nasce PRIVATE, sem discussão.
        dados.eh_menor ? 'PRIVATE' : (['PUBLIC', 'FAMILY', 'GROUP', 'PRIVATE'].includes(dados.privacidade) ? dados.privacidade : 'FAMILY'),
        !!dados.eh_menor, userId]);

    await indexar(t, familyId, p);
    await auditar({ familyId, atorUserId: userId, acao: 'pessoa.criada',
      alvoTipo: 'person', alvoId: p.id, depois: { nome } }, t);
    return p;
  },

  async atualizar(t, { familyId, userId, id, dados }) {
    const antes = await Persons.obter(t, id);
    if (!antes) throw erro('erro.pessoa_nao_encontrada', 404);
    const nasc = dados.nascimento !== undefined ? campoData(dados.nascimento, 'nascimento') : null;
    const falec = dados.falecimento !== undefined ? campoData(dados.falecimento, 'falecimento') : null;

    const p = await t.uma(
      `UPDATE persons SET
         nome_exibicao = COALESCE($2, nome_exibicao),
         sobrenome = COALESCE($3, sobrenome), apelido = COALESCE($4, apelido),
         nascimento_valor = COALESCE($5, nascimento_valor),
         nascimento_precisao = COALESCE($6, nascimento_precisao),
         nascimento_ini = COALESCE($7, nascimento_ini), nascimento_fim = COALESCE($8, nascimento_fim),
         falecimento_valor = COALESCE($9, falecimento_valor),
         falecimento_precisao = COALESCE($10, falecimento_precisao),
         falecimento_ini = COALESCE($11, falecimento_ini), falecimento_fim = COALESCE($12, falecimento_fim),
         vitalidade = COALESCE($13, vitalidade), genero = COALESCE($14, genero),
         local_nascimento = COALESCE($15, local_nascimento), profissao = COALESCE($16, profissao),
         resumo = COALESCE($17, resumo), privacidade = COALESCE($18, privacidade),
         updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, dados.nome_exibicao ? s(dados.nome_exibicao, 120) : null,
        dados.sobrenome !== undefined ? s(dados.sobrenome, 80) : null,
        dados.apelido !== undefined ? s(dados.apelido, 60) : null,
        nasc && nasc.nascimento_valor, nasc && nasc.nascimento_precisao, nasc && nasc.nascimento_ini, nasc && nasc.nascimento_fim,
        falec && falec.falecimento_valor, falec && falec.falecimento_precisao, falec && falec.falecimento_ini, falec && falec.falecimento_fim,
        dados.vitalidade || null, dados.genero !== undefined ? s(dados.genero, 40) : null,
        dados.local_nascimento !== undefined ? s(dados.local_nascimento, 160) : null,
        dados.profissao !== undefined ? s(dados.profissao, 120) : null,
        dados.resumo !== undefined ? s(dados.resumo, 2000) : null,
        dados.privacidade && ['PUBLIC', 'FAMILY', 'GROUP', 'PRIVATE'].includes(dados.privacidade) ? dados.privacidade : null]);

    await indexar(t, familyId, p);
    await auditar({ familyId, atorUserId: userId, acao: 'pessoa.editada',
      alvoTipo: 'person', alvoId: id,
      antes: { nome: antes.nome_exibicao, nascimento: antes.nascimento_valor },
      depois: { nome: p.nome_exibicao, nascimento: p.nascimento_valor } }, t);
    return p;
  },

  /** Soft delete: dado histórico não desaparece por um clique (§66). */
  async arquivar(t, { familyId, userId, id }) {
    const p = await Persons.obter(t, id);
    if (!p) throw erro('erro.pessoa_nao_encontrada', 404);
    await t.q(`UPDATE persons SET deleted_at = now() WHERE id = $1`, [id]);
    await t.q(`UPDATE relationships SET deleted_at = now()
                WHERE deleted_at IS NULL AND (person_a = $1 OR person_b = $1)`, [id]);
    await busca.remover(t, 'person', id);
    await auditar({ familyId, atorUserId: userId, acao: 'pessoa.arquivada',
      alvoTipo: 'person', alvoId: id, antes: { nome: p.nome_exibicao } }, t);
    return true;
  },
};

const TIPOS = ['PARENT_OF', 'SPOUSE_OF', 'PARTNER_OF', 'SIBLING_OF', 'GUARDIAN_OF'];
const NATUREZAS = ['biologico', 'adotivo', 'socioafetivo', 'enteado', 'desconhecido'];

const Relationships = {
  async criar(t, { familyId, userId, dados }) {
    const { person_a, person_b } = dados;
    const tipo = s(dados.tipo, 20);
    const natureza = NATUREZAS.includes(dados.natureza) ? dados.natureza : 'biologico';
    if (!TIPOS.includes(tipo)) throw erro('erro.parentesco_tipo_invalido', 400);
    if (person_a === person_b) throw erro('erro.parentesco_consigo', 400);

    // Sequencial: um cliente `pg` não executa duas consultas ao mesmo tempo.
    const a = await Persons.obter(t, person_a);
    const b = await Persons.obter(t, person_b);
    if (!a || !b) throw erro('erro.pessoa_nao_encontrada', 404);

    if (tipo === 'PARENT_OF') {
      // Ciclo: sem esta checagem, "A é pai de B" + "B é pai de A" corrompe
      // a genealogia em silêncio e derruba a renderização.
      if (await arvore.criariaCiclo(t, person_a, person_b)) throw erro('erro.parentesco_ciclo', 409);
      // Sanidade de idade — só reclama quando os dados permitem reclamar.
      const problema = datas.checarFiliacao(a, b);
      if (problema && !dados.confirmo_mesmo_assim) {
        throw erro(problema, 422);
      }
    }

    const ini = dados.inicio ? datas.interpretar(dados.inicio) : null;
    if (ini && ini.erro) throw erro(ini.erro, 400);
    const fim = dados.fim ? datas.interpretar(dados.fim) : null;
    if (fim && fim.erro) throw erro(fim.erro, 400);

    const r = await t.uma(
      `INSERT INTO relationships (family_id, person_a, person_b, tipo, natureza,
         inicio_valor, inicio_precisao, inicio_ini, inicio_fim,
         fim_valor, fim_precisao, fim_ini, fim_fim, nota, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT DO NOTHING RETURNING *`,
      [familyId, person_a, person_b, tipo, natureza,
        ini && ini.valor, (ini && ini.precisao) || 'ANO', ini && ini.ini, ini && ini.fim,
        fim && fim.valor, (fim && fim.precisao) || 'ANO', fim && fim.ini, fim && fim.fim,
        s(dados.nota, 300), userId]);
    if (!r) throw erro('erro.parentesco_ja_existe', 409);

    await auditar({ familyId, atorUserId: userId, acao: 'parentesco.criado',
      alvoTipo: 'relationship', alvoId: r.id,
      depois: { tipo, natureza, a: a.nome_exibicao, b: b.nome_exibicao } }, t);
    return r;
  },

  async remover(t, { familyId, userId, id }) {
    const r = await t.uma(
      `UPDATE relationships SET deleted_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [id]);
    if (!r) throw erro('erro.parentesco_nao_encontrado', 404);
    await auditar({ familyId, atorUserId: userId, acao: 'parentesco.removido',
      alvoTipo: 'relationship', alvoId: id, antes: { tipo: r.tipo, natureza: r.natureza } }, t);
    return true;
  },
};

module.exports = { Persons, Relationships, campoData, TIPOS, NATUREZAS };
