// =====================================================================
// ORIGENA — backup lógico do banco inteiro (§76, ADR-0008).
//
// "BACKUP NÃO EXISTE ATÉ SER TESTADO." O Render tem backup do
// `origena-db`, mas nenhum restore dele foi executado — então,
// rigorosamente, não se sabe se funciona. Isto aqui é o backup que a
// casa controla, e que se prova sozinho a cada execução da suíte.
//
// POR QUE NÃO `pg_dump`. Ele exigiria o binário do cliente Postgres no
// worker, e a disciplina da casa não admite dependência nativa. O dump
// aqui é LÓGICO e escrito em JS: lê linha a linha e grava JSON. Perde
// funções, índices e triggers — que estão nas MIGRAÇÕES, versionadas no
// git — e guarda o que as migrações não sabem recriar: os DADOS.
//
// O PERIGO DESTE ARQUIVO É ELE MESMO. Um dump escrito à mão erra por
// OMISSÃO: alguém cria uma tabela, esquece de listá-la aqui, e o backup
// segue verde por meses até o dia do desastre. Por isso a lista de
// tabelas NÃO é escrita: sai do `information_schema`, e existe teste que
// falha se uma tabela com linhas ficar de fora. Mesma trava da purga.
//
// CIFRADO SEMPRE. O dump é o acervo inteiro de todas as famílias num
// arquivo só — o objeto mais sensível que este produto produz. Sem chave
// configurada ele RECUSA gravar, em vez de deixar um claro no R2.
// =====================================================================
'use strict';
const crypto = require('crypto');
const zlib = require('zlib');
const db = require('./db');
const storage = require('./storage');
const sessao = require('./sessao');
const tenancy = require('./tenancy');

// Tabelas que NÃO entram, com o motivo escrito. Toda exceção precisa de
// justificativa — é o que impede a lista de virar um esconderijo.
const FORA = {
  jobs: 'fila de trabalho: restaurar jobs velhos reexecutaria efeito já aplicado',
  jobs_dlq: 'idem, e o valor dela é diagnóstico do momento',
  login_falhas: 'contador anti-força-bruta; restaurar é pior que zerar',
  busca: 'projeção que se refaz do conteúdo',
  memory_index: 'projeção que se refaz',
  search_chunks: 'projeção que se refaz (e o embedding se recalcula)',
  timeline_entries: 'projeção que se refaz a cada consulta',
};

/** A lista sai do BANCO, não daqui. Tabela nova entra sozinha. */
async function tabelas() {
  const linhas = await db.todas(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name`, [db.SCHEMA]);
  return linhas.map((l) => l.table_name).filter((t) => !FORA[t] && t !== 'schema_migrations');
}

/**
 * Gera o dump. Devolve o buffer CIFRADO e o resumo do que entrou.
 * O resumo (tabela → nº de linhas) é o que permite conferir a volta sem
 * abrir o arquivo — e é o que um backup silenciosamente vazio nunca teria.
 */
async function gerar() {
  const lista = await tabelas();
  // QUAIS TABELAS TÊM RLS. Não é detalhe: `SELECT * FROM persons` fora de
  // escopo devolve ZERO linhas — é a garantia do §94 funcionando. Um dump
  // ingênuo sairia VAZIO para todo o conteúdo e ninguém notaria, porque
  // um arquivo cifrado de tamanho plausível parece um backup. Por isso o
  // conteúdo é lido família a família, dentro do escopo de cada uma.
  const comFamilia = new Set((await db.todas(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = $1 AND column_name = 'family_id'`, [db.SCHEMA]))
    .map((l) => l.table_name));
  const familias = await db.todas(`SELECT id FROM families ORDER BY created_at`);

  const conteudo = { origena: 'backup/v1', schema: db.SCHEMA,
    em: new Date().toISOString(), familias: familias.length, tabelas: {} };
  const resumo = {};
  for (const t of lista) {
    let linhas;
    if (comFamilia.has(t)) {
      linhas = [];
      for (const f of familias) {
        linhas.push(...await tenancy.comEscopo(f.id, (tx) =>
          tx.todas(`SELECT * FROM "${t}" WHERE family_id = $1`, [f.id])));
      }
    } else {
      linhas = await db.todas(`SELECT * FROM "${t}"`);
    }
    conteudo.tabelas[t] = linhas;
    resumo[t] = linhas.length;
  }

  const cru = Buffer.from(JSON.stringify(conteudo));
  const comprimido = zlib.gzipSync(cru);
  // Sem chave, RECUSA. Um dump do acervo inteiro em claro no R2 seria o
  // pior artefato que este produto poderia produzir.
  const cifrado = Buffer.from(sessao.cifrar(comprimido.toString('base64')), 'utf8');
  return { cifrado, resumo, bytes_crus: cru.length, bytes: cifrado.length,
    sha256: crypto.createHash('sha256').update(cifrado).digest('hex') };
}

/** Abre um dump cifrado e devolve o conteúdo. */
function abrir(cifrado) {
  const b64 = sessao.decifrar(cifrado.toString('utf8'));
  return JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
}

/**
 * Guarda no R2 com data no nome e apaga o que passou da validade.
 * Backup que ninguém apaga vira conta que ninguém entende — e um acervo
 * de 2026 restaurado em 2030 seria pior que nenhum.
 */
async function guardar({ dias = 30, hoje } = {}) {
  const d = await gerar();
  const dia = (hoje || new Date().toISOString().slice(0, 10));
  const chave = `backups/origena-${dia}.dump`;
  await storage.enviar(chave, d.cifrado, 'application/octet-stream');

  // VALIDADE POR NOME, não por listagem. O R2 aqui não expõe listar, e a
  // chave é determinística (`origena-AAAA-MM-DD`): dá para apagar a de
  // N dias atrás sem precisar enumerar nada. Se a rotina pular dias, o
  // arquivo daquele dia fica para trás — preço aceitável por não manter
  // um índice paralelo que também poderia mentir.
  const velho = new Date(new Date(dia + 'T00:00:00Z').getTime() - dias * 86400000)
    .toISOString().slice(0, 10);
  await storage.apagar(`backups/origena-${velho}.dump`).catch(() => {});
  await db.q(
    `INSERT INTO config (chave, valor, descricao, atualizado_em)
     VALUES ('backup_ultimo', $1, 'Último backup lógico gerado', now())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
    [JSON.stringify({ dia, chave, bytes: d.bytes, sha256: d.sha256, resumo: d.resumo })]);
  return { chave, dia, bytes: d.bytes, sha256: d.sha256, resumo: d.resumo, validade_dias: dias };
}

/**
 * RESTAURA num schema de DESTINO — nunca no de produção.
 *
 * A trava é a mesma do `derrubarSchema`: só aceita schema de teste. Um
 * restore que pode escrever em produção é um botão de apagar o acervo
 * com nome de botão de salvar.
 */
async function restaurar(conteudo, { schemaDestino }) {
  if (!/^t_/.test(String(schemaDestino || ''))) {
    throw new Error('restaurar só aceita schema de teste (prefixo t_)');
  }
  // ORDEM POR CONVERGÊNCIA, não por adivinhação. São ~40 tabelas com
  // referências cruzadas e algumas que apontam para si mesmas (mídia
  // derivada, contribuição revisada). Calcular a ordem topológica exata
  // seria reinventar mal o que uma repetição resolve: insere tudo, o que
  // falhou por FK volta na próxima passada, e para quando uma passada
  // inteira não entra mais nada. Converge ou DIZ o que ficou de fora.
  //
  // Cada INSERT vai fora de transação de propósito: erro de FK esperado
  // dentro de uma transação a ABORTA, e as instruções seguintes morreriam
  // longe da causa (lição de 10/08/2026).
  const pendentes = [];
  for (const [tabela, linhas] of Object.entries(conteudo.tabelas || {})) {
    for (const l of linhas) pendentes.push({ tabela, linha: l });
  }

  // O TIPO DA COLUNA VEM DO SCHEMA, NÃO DO VALOR. Decidir pelo tipo em
  // JavaScript é impossível: `[]` pode ser uma coluna `text[]` (que quer
  // `{}`) ou uma coluna `jsonb` (que quer `[]`), e errar em qualquer
  // direção derruba a linha. `{item: ...}` numa receita e `pessoas uuid[]`
  // numa entrada de timeline são o mesmo `typeof` e tipos opostos.
  const tipos = {};
  for (const l of await db.todas(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = $1`, [schemaDestino])) {
    (tipos[l.table_name] = tipos[l.table_name] || {})[l.column_name] = l.data_type;
  }

  const feito = {};
  let restantes = pendentes;
  for (;;) {
    const falharam = [];
    for (const p of restantes) {
      const cols = Object.keys(p.linha);
      const lista = cols.map((c) => `"${c}"`).join(',');
      const ph = cols.map((_, i) => `$${i + 1}`).join(',');
      const vals = cols.map((c) => {
        const v = p.linha[c];
        if (v === null || typeof v !== 'object' || v instanceof Date || Buffer.isBuffer(v)) return v;
        // `json`/`jsonb` querem TEXTO — inclusive quando o valor é array
        // (os ingredientes de uma receita). Coluna `ARRAY` quer o array
        // em si, que o driver converte. Fora esses dois, texto.
        const tipo = (tipos[p.tabela] || {})[c];
        if (tipo === 'ARRAY') return v;
        return JSON.stringify(v);
      });
      const sql = `INSERT INTO "${schemaDestino}"."${p.tabela}" (${lista}) VALUES (${ph})
                   ON CONFLICT DO NOTHING`;
      try {
        // O RLS vale no INSERT também, e no schema de destino ele está
        // igualmente FORÇADO: sem escopo, a política recusa a linha. O
        // `app.family_id` é da SESSÃO, não do schema — por isso funciona
        // apontando para as tabelas do destino.
        if (p.linha.family_id) {
          await tenancy.comEscopo(p.linha.family_id, (tx) => tx.q(sql, vals));
        } else {
          await db.q(sql, vals);
        }
        feito[p.tabela] = (feito[p.tabela] || 0) + 1;
      } catch (e) { p.erro = String(e.message || e).slice(0, 200); falharam.push(p); }
    }
    if (!falharam.length) break;
    if (falharam.length === restantes.length) {
      // Nenhuma linha entrou nesta passada: insistir é laço infinito.
      // Devolver o que sobrou — COM O MOTIVO — é o que separa um relatório
      // útil de um "não deu certo". Engolir a exceção aqui foi o que me
      // fez perder uma rodada inteira sem saber a causa.
      return Object.assign(feito, { _nao_entraram: falharam.length,
        _tabelas_presas: [...new Set(falharam.map((f) => f.tabela))],
        _motivos: [...new Set(falharam.map((f) => f.erro).filter(Boolean))].slice(0, 5) });
    }
    restantes = falharam;
  }
  for (const t of Object.keys(conteudo.tabelas || {})) feito[t] = feito[t] || 0;
  return feito;
}

/** Confere o restore contando linha a linha — não "parece que deu certo". */
async function conferir(conteudo, { schemaDestino }) {
  const diferencas = [];
  for (const [tabela, linhas] of Object.entries(conteudo.tabelas || {})) {
    // Contar FORA de escopo devolveria zero em toda tabela com RLS, e a
    // conferência acusaria falha onde não há — ou, pior, passaria a
    // acreditar que zero é o certo. A contagem segue o mesmo caminho da
    // leitura: por família, quando a tabela tem dono.
    const familias = [...new Set(linhas.map((l) => l.family_id).filter(Boolean))];
    let n = 0;
    if (familias.length) {
      for (const f of familias) {
        const r = await tenancy.comEscopo(f, (tx) => tx.uma(
          `SELECT count(*)::int n FROM "${schemaDestino}"."${tabela}" WHERE family_id = $1`, [f]));
        n += r.n;
      }
    } else {
      const r = await db.uma(`SELECT count(*)::int n FROM "${schemaDestino}"."${tabela}"`);
      n = r.n;
    }
    if (n !== linhas.length) diferencas.push({ tabela, esperado: linhas.length, veio: n });
  }
  return { ok: diferencas.length === 0, diferencas };
}

module.exports = { FORA, tabelas, gerar, abrir, guardar, restaurar, conferir };
