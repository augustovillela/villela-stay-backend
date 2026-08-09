// =====================================================================
// ORIGENA — exportação e importação (§68, §69, §70).
//
// O QUE SAI: um ZIP com `dados.json` (o acervo INTEIRO, com proveniência
// — claims, fontes, evidências, contribuições, resoluções), `familia.ged`
// (GEDCOM para qualquer software de genealogia) e `manifesto.json`.
// Formatos abertos, legíveis daqui a 30 anos (§77).
//
// O QUE (AINDA) NÃO SAI: os BINÁRIOS das mídias dentro do zip — numa
// família real são dezenas de GB. O dados.json leva os metadados e os
// sha256; os arquivos continuam baixáveis um a um. Zip com originais é
// evolução declarada, não esquecida.
//
// GEDCOM (§70): o padrão não tem onde guardar proveniência — quem
// informou, evidências, divergências. Elas vão COMPLETAS no dados.json;
// o .ged leva o que o padrão comporta (datas imprecisas viram ABT/BEF/
// AFT/BET, que o padrão suporta bem).
//
// NA IMPORTAÇÃO os ids são REMAPEADOS (uuid novo para cada linha, com as
// referências reescritas) — importar o mesmo arquivo duas vezes não
// colide. A AUTORIA de quem não existe no novo banco vira TEXTO na fonte
// ("informado originalmente por Ana em 2026") — o nome sobrevive à conta.
// =====================================================================
'use strict';
const crypto = require('crypto');
const zlib = require('zlib');
const { erro } = require('./erros');
const storage = require('./storage');
const { auditar } = require('./repo');

// ------------------------------------------------------------- zip (store)
// Escritor mínimo, método STORE (sem compressão — deflate do zlib para o
// dados.json compensaria pouco e o zip precisa ser trivial de abrir).
function crc32(buf) {
  let c; const tab = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = tab[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipar(arquivos) {                    // [{nome, dados(Buffer)}]
  const locais = [], centrais = [];
  let offset = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, 'utf8');
    const crc = crc32(a.dados);
    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(0x0800, 6);
    cab.writeUInt16LE(0, 8);                                    // store
    cab.writeUInt32LE(crc, 14);
    cab.writeUInt32LE(a.dados.length, 18); cab.writeUInt32LE(a.dados.length, 22);
    cab.writeUInt16LE(nome.length, 26);
    locais.push(cab, nome, a.dados);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(a.dados.length, 20); c.writeUInt32LE(a.dados.length, 24);
    c.writeUInt16LE(nome.length, 28); c.writeUInt32LE(offset, 42);
    centrais.push(c, nome);
    offset += 30 + nome.length + a.dados.length;
  }
  const dirTam = centrais.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(dirTam, 12); fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, ...centrais, fim]);
}

// ------------------------------------------------------------ dados.json
// `memory_index` e `timeline_entries` NÃO entram: são projeções que se
// refazem sozinhas. `missions` entra — dispensar uma pergunta é decisão da
// família, e decisão da família viaja com o acervo.
const TABELAS = ['persons', 'relationships', 'contributions', 'sources', 'claims', 'evidence',
  'claim_resolutions', 'stories', 'story_versions', 'story_mentions', 'places', 'events',
  'event_participants', 'albums', 'album_items', 'media', 'media_persons', 'document_texts',
  'biographies', 'biography_versions', 'traditions', 'recipes', 'recipe_learners',
  'tradition_transmissions', 'heirlooms', 'heirloom_custody', 'missions'];

async function dadosDaFamilia(t, familyId) {
  const dados = { formato: 'origena/v1', exportado_em: new Date().toISOString(), tabelas: {} };
  for (const tabela of TABELAS) {
    dados.tabelas[tabela] = await t.todas(`SELECT * FROM ${tabela} WHERE family_id = $1`, [familyId]);
  }
  // A autoria vira TEXTO: o novo banco pode não ter essas contas.
  const nomes = await t.todas(
    `SELECT DISTINCT u.id, u.nome FROM users u
      WHERE u.id IN (SELECT created_by FROM claims WHERE family_id = $1 AND created_by IS NOT NULL
                     UNION SELECT autor_user_id FROM contributions WHERE family_id = $1 AND autor_user_id IS NOT NULL)`,
    [familyId]);
  dados.autores = Object.fromEntries(nomes.map((n) => [n.id, n.nome]));
  return dados;
}

// ---------------------------------------------------------------- GEDCOM
function dataGed(valor, precisao, ini, fim) {
  const MES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  // O driver pg devolve coluna `date` como OBJETO Date — String().slice(0,4)
  // daria "Wed". Mesmo bug já pego na Fase 2 (datas.anoDeUm); reusar.
  const datas = require('./datas');
  const ano = (d) => { const a = datas.anoDe(d, null); return a == null ? '' : String(a); };
  const diaMes = (v) => {                       // '15/03/1921' → '15 MAR 1921'
    const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[1]} ${MES[Number(m[2]) - 1]} ${m[3]}` : null;
  };
  switch (precisao) {
    case 'DIA': case 'EXATO': return diaMes(valor) || ano(ini);
    case 'MES': { const m = String(valor || '').match(/^(\d{2})\/(\d{4})$/);
      return m ? `${MES[Number(m[1]) - 1]} ${m[2]}` : ano(ini); }
    case 'ANO': return ano(ini);
    case 'CIRCA': { const m = String(valor || '').match(/(\d{4})/); return 'ABT ' + (m ? m[1] : ano(ini)); }
    case 'DECADA': case 'ENTRE': return `BET ${ano(ini)} AND ${ano(fim)}`;
    case 'ANTES_DE': return 'BEF ' + ano(fim);
    case 'DEPOIS_DE': return 'AFT ' + ano(ini);
    default: return ano(ini);
  }
}

async function gedcomDe(t, familyId, nomeFamilia) {
  const pessoas = await t.todas(
    `SELECT * FROM persons WHERE family_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [familyId]);
  const rels = await t.todas(
    `SELECT * FROM relationships WHERE family_id = $1 AND deleted_at IS NULL`, [familyId]);

  const num = new Map(pessoas.map((p, i) => [p.id, i + 1]));
  const L = ['0 HEAD', '1 SOUR ORIGENA', '2 NAME Origena — Grupo Villela Stay',
    '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8',
    `1 NOTE Exportado de ${nomeFamilia}. A proveniência completa (fontes, evidências, divergências) está em dados.json.`];

  // Famílias GEDCOM: uma por casal (e uma por pai solteiro com filhos).
  const casais = new Map();                     // 'a|b' ordenado → {marido?, esposa?, filhos[]}
  const chaveCasal = (a, b) => [a, b].sort().join('|');
  for (const r of rels.filter((x) => ['SPOUSE_OF', 'PARTNER_OF'].includes(x.tipo))) {
    casais.set(chaveCasal(r.person_a, r.person_b), { par: [r.person_a, r.person_b], filhos: new Set() });
  }
  const paisDe = new Map();                     // filho → [pais]
  for (const r of rels.filter((x) => x.tipo === 'PARENT_OF')) {
    if (!paisDe.has(r.person_b)) paisDe.set(r.person_b, []);
    paisDe.get(r.person_b).push(r.person_a);
  }
  for (const [filho, pais] of paisDe) {
    const k = pais.length >= 2 ? chaveCasal(pais[0], pais[1]) : pais[0] + '|';
    if (!casais.has(k)) casais.set(k, { par: pais.slice(0, 2), filhos: new Set() });
    casais.get(k).filhos.add(filho);
  }
  const numFam = new Map([...casais.keys()].map((k, i) => [k, i + 1]));

  for (const p of pessoas) {
    L.push(`0 @I${num.get(p.id)}@ INDI`);
    L.push(`1 NAME ${p.nome_exibicao}${p.sobrenome ? ' /' + p.sobrenome + '/' : ''}`);
    const g = String(p.genero || '').toLowerCase();
    if (/^m/.test(g)) L.push('1 SEX M'); else if (/^f/.test(g)) L.push('1 SEX F');
    if (p.nascimento_valor) {
      L.push('1 BIRT', `2 DATE ${dataGed(p.nascimento_valor, p.nascimento_precisao, p.nascimento_ini, p.nascimento_fim)}`);
      if (p.local_nascimento) L.push(`2 PLAC ${p.local_nascimento}`);
    }
    if (p.falecimento_valor) {
      L.push('1 DEAT', `2 DATE ${dataGed(p.falecimento_valor, p.falecimento_precisao, p.falecimento_ini, p.falecimento_fim)}`);
    }
    for (const [k, fam] of casais) {
      if (fam.par.includes(p.id)) L.push(`1 FAMS @F${numFam.get(k)}@`);
      if (fam.filhos.has(p.id)) L.push(`1 FAMC @F${numFam.get(k)}@`);
    }
  }
  for (const [k, fam] of casais) {
    L.push(`0 @F${numFam.get(k)}@ FAM`);
    // sem inferir papel por gênero quando não declarado: HUSB/WIFE só é
    // usado quando o gênero está dito; senão os dois saem como HUSB/WIFE
    // na ordem — softwares aceitam, e não inventamos nada.
    const [a, b] = fam.par;
    if (a) L.push(`1 HUSB @I${num.get(a)}@`);
    if (b && num.get(b)) L.push(`1 WIFE @I${num.get(b)}@`);
    for (const f of fam.filhos) L.push(`1 CHIL @I${num.get(f)}@`);
  }
  L.push('0 TRLR');
  return L.join('\n') + '\n';
}

// ------------------------------------------------------------- exportação
/** Roda no WORKER: monta o zip e o guarda no R2 com validade curta. */
async function gerar(t, { exportId, familyId }) {
  const exp = await t.uma(`SELECT * FROM exports WHERE id = $1`, [exportId]);
  if (!exp) return { ignorado: 'export sumiu' };
  if (exp.status === 'pronto') return { ignorado: 'já gerado' };
  await t.q(`UPDATE exports SET status = 'gerando' WHERE id = $1`, [exportId]);

  const familia = await t.uma(`SELECT nome FROM families WHERE id = $1`, [familyId]);
  const dados = await dadosDaFamilia(t, familyId);
  const ged = await gedcomDe(t, familyId, familia.nome);
  const manifesto = {
    origena: 'export/v1', familia: familia.nome, gerado_em: new Date().toISOString(),
    conteudo: Object.fromEntries(Object.entries(dados.tabelas).map(([k, v]) => [k, v.length])),
    nota_midias: 'Os binários das mídias não vão no zip (tamanho); os metadados e sha256 estão em dados.json.',
    nota_gedcom: 'GEDCOM não comporta proveniência; ela está completa em dados.json.',
  };
  const zip = zipar([
    { nome: 'manifesto.json', dados: Buffer.from(JSON.stringify(manifesto, null, 2)) },
    { nome: 'dados.json', dados: Buffer.from(JSON.stringify(dados)) },
    { nome: 'familia.ged', dados: Buffer.from(ged, 'utf8') },
  ]);
  const chave = storage.chaveExport(familyId, exportId);
  await storage.enviar(chave, zip, 'application/zip');
  await t.q(`UPDATE exports SET status = 'pronto', storage_key = $2, bytes = $3, itens = $4 WHERE id = $1`,
    [exportId, chave, zip.length, JSON.stringify(manifesto.conteudo)]);
  return { ok: true, bytes: zip.length };
}

// ------------------------------------------------------------- importação
/** Importa um dados.json REMAPEANDO todos os ids. Autoria vira texto. */
async function importarDados(t, { familyId, userId, dados }) {
  if (!dados || dados.formato !== 'origena/v1' || !dados.tabelas) throw erro('erro.import_formato', 400);
  const mapa = new Map();
  const novo = (antigo) => {
    if (!antigo) return null;
    if (!mapa.has(antigo)) mapa.set(antigo, crypto.randomUUID());
    return mapa.get(antigo);
  };
  const autores = dados.autores || {};
  const contagem = {};

  // Ordem respeita as FKs. Colunas de usuário NÃO migram (a conta pode
  // não existir aqui): created_by vira o importador; o nome original
  // sobrevive como texto na fonte/nota.
  const inserir = async (tabela, linhas, transformar, { ignorarConflito = false } = {}) => {
    contagem[tabela] = contagem[tabela] || 0;   // a mesma tabela pode entrar em duas passadas
    for (const l of linhas || []) {
      const v = transformar(l);
      if (!v) continue;
      // valor  = "tire esta coluna" (ex.: campo que não migra)
      const cols = Object.keys(v).filter((c) => v[c] !== undefined);
      const r = await t.q(`INSERT INTO ${tabela} (${cols.join(',')})
                 VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')})`
                 + (ignorarConflito ? ' ON CONFLICT DO NOTHING' : ''),
      cols.map((c) => v[c]));
      contagem[tabela] += r.rowCount || 0;
    }
  };
  const base = (l, extra = {}) => ({ id: novo(l.id), family_id: familyId, ...extra });
  const j = (x) => x == null ? null : JSON.stringify(x);

  const T = dados.tabelas;
  await inserir('persons', T.persons, (l) => ({ ...l, ...base(l),
    nome_claim_id: novo(l.nome_claim_id), nascimento_claim_id: novo(l.nascimento_claim_id),
    falecimento_claim_id: novo(l.falecimento_claim_id), capa_media_id: null,
    created_by: userId, exif: undefined }));
  await inserir('places', T.places, (l) => ({ ...l, ...base(l), created_by: userId }));
  // MÍDIA EM DUAS PASSADAS: a miniatura aponta o original (`derivado_de`),
  // e `SELECT *` não garante que o pai venha antes do filho — importar na
  // ordem crua estourava a FK em qualquer acervo com foto.
  //
  // `media` também não tem place_id (o lugar da foto ainda é `local_texto`);
  // mandar a coluna aqui quebrava a mesma importação por outro motivo.
  const midia = (l) => ({ ...l, ...base(l),
    derivado_de: novo(l.derivado_de), capturada_claim_id: novo(l.capturada_claim_id),
    ai_job_id: null, created_by: userId,
    exif: j(l.exif), derivacao: j(l.derivacao),
    // o binário não veio no zip: o registro fica AGUARDANDO reenvio, e a
    // tela diz isso — nunca um "pronta" mentiroso.
    status: l.derivado_de ? l.status : 'aguardando' });
  await inserir('media', (T.media || []).filter((l) => !l.derivado_de), midia);
  await inserir('media', (T.media || []).filter((l) => l.derivado_de), midia);
  await inserir('relationships', T.relationships, (l) => ({ ...l, ...base(l),
    person_a: novo(l.person_a), person_b: novo(l.person_b), claim_id: novo(l.claim_id),
    created_by: userId }));
  // Contribuição também aponta para si mesma (`revisao_de`): duas
  // passadas, original antes da revisão. Só `contributions` e `media` têm
  // auto-referência no schema — tabela nova com FK para si mesma precisa
  // entrar aqui do mesmo jeito.
  const contribuicao = (l) => ({ ...l, ...base(l),
    autor_user_id: null, autor_person_id: novo(l.autor_person_id),
    alvo_id: novo(l.alvo_id), revisao_de: novo(l.revisao_de),
    corpo: l.corpo + (autores[l.autor_user_id]
      ? `\n\n[importado — contado originalmente por ${autores[l.autor_user_id]}]` : '') });
  await inserir('contributions', (T.contributions || []).filter((l) => !l.revisao_de), contribuicao);
  await inserir('contributions', (T.contributions || []).filter((l) => l.revisao_de), contribuicao);
  await inserir('sources', T.sources, (l) => ({ ...l, ...base(l),
    contribution_id: novo(l.contribution_id), media_id: novo(l.media_id),
    interview_id: null, created_by: userId }));
  await inserir('claims', T.claims, (l) => ({ ...l, ...base(l),
    sujeito_id: novo(l.sujeito_id), ai_job_id: null, created_by: null,
    created_by_kind: l.created_by_kind === 'ai' ? 'ai' : 'import' }));
  await inserir('evidence', T.evidence, (l) => ({ ...l, ...base(l),
    claim_id: novo(l.claim_id), source_id: novo(l.source_id), created_by: userId,
    nota: (l.nota || '') + (autores[l.created_by] ? ` [originalmente por ${autores[l.created_by]}]` : '') }));
  await inserir('claim_resolutions', T.claim_resolutions, (l) => ({ ...l, ...base(l),
    sujeito_id: novo(l.sujeito_id), claim_aceito_id: novo(l.claim_aceito_id), decidido_por: userId }));
  await inserir('stories', T.stories, (l) => ({ ...l, ...base(l),
    contada_por_person_id: novo(l.contada_por_person_id), autor_user_id: null, created_by: userId }));
  await inserir('story_versions', T.story_versions, (l) => ({ ...l, ...base(l),
    story_id: novo(l.story_id), editado_por: null }));
  await inserir('story_mentions', T.story_mentions, (l) => ({ ...l, ...base(l),
    story_id: novo(l.story_id), person_id: novo(l.person_id), media_id: novo(l.media_id) }));
  await inserir('events', T.events, (l) => ({ ...l, ...base(l),
    place_id: novo(l.place_id), created_by: userId }));
  await inserir('event_participants', T.event_participants, (l) => ({ ...l, ...base(l),
    event_id: novo(l.event_id), person_id: novo(l.person_id) }));
  await inserir('media_persons', T.media_persons, (l) => ({ ...l, ...base(l),
    media_id: novo(l.media_id), person_id: novo(l.person_id),
    bbox: j(l.bbox), confirmado_por: l.confirmado_por ? userId : null }));

  // Tradições, receitas, saberes e relíquias (Fase 2.1). A LINHA DE
  // CUSTÓDIA viaja inteira: sem ela, a relíquia importada vira um objeto
  // sem história, que é o mesmo que um objeto qualquer.
  await inserir('traditions', T.traditions, (l) => ({ ...l, ...base(l),
    person_id: novo(l.person_id), capa_media_id: novo(l.capa_media_id), created_by: userId }));
  await inserir('recipes', T.recipes, (l) => ({ ...l, ...base(l),
    tradition_id: novo(l.tradition_id), manuscrito_media_id: novo(l.manuscrito_media_id),
    ingredientes: j(l.ingredientes) }));
  await inserir('recipe_learners', T.recipe_learners, (l) => ({ ...l, ...base(l),
    recipe_id: novo(l.recipe_id), person_id: novo(l.person_id), created_by: userId }));
  await inserir('tradition_transmissions', T.tradition_transmissions, (l) => ({ ...l, ...base(l),
    tradition_id: novo(l.tradition_id), de_person_id: novo(l.de_person_id),
    para_person_id: novo(l.para_person_id), created_by: userId }));
  await inserir('heirlooms', T.heirlooms, (l) => ({ ...l, ...base(l),
    capa_media_id: novo(l.capa_media_id), created_by: userId }));
  await inserir('heirloom_custody', T.heirloom_custody, (l) => ({ ...l, ...base(l),
    heirloom_id: novo(l.heirloom_id), person_id: novo(l.person_id),
    source_id: novo(l.source_id), created_by: userId }));
  // A missão aponta para o alvo REMAPEADO, e a chave de idempotência
  // acompanha — senão a mesma pergunta nasceria de novo na primeira
  // sincronização, inclusive as que a família já tinha dispensado.
  // Chave que já exista na família de destino é a MESMA pergunta: pular.
  const chaveRemapeada = (l) => {
    const p = String(l.chave || '').split(':');
    if (l.alvo_id && p.length > 1) p[1] = novo(l.alvo_id);
    return p.join(':');
  };
  await inserir('missions', T.missions, (l) => ({ ...l, ...base(l),
    alvo_id: novo(l.alvo_id), resposta_id: novo(l.resposta_id), chave: chaveRemapeada(l),
    sugerido_para_user_id: null, respondida_por: l.respondida_por ? userId : null,
    pergunta_vars: j(l.pergunta_vars) }), { ignorarConflito: true });

  // Reindexa a busca do que chegou (pessoas, tradições e relíquias).
  const buscaMod = require('./busca');
  for (const p of await t.todas(`SELECT * FROM persons WHERE family_id = $1`, [familyId])) {
    await buscaMod.indexar(t, { familyId, refTipo: 'person', refId: p.id,
      titulo: p.nome_exibicao, corpo: [p.resumo, p.profissao].filter(Boolean).join('\n'),
      pessoas: [p.id], privacidade: p.privacidade, criadoPor: userId });
  }
  const trad = require('./tradicoes');
  for (const x of await t.todas(
    `SELECT id FROM traditions WHERE family_id = $1 AND deleted_at IS NULL`, [familyId])) {
    await trad.indexar(t, familyId, x.id);
  }
  for (const x of await t.todas(
    `SELECT id FROM heirlooms WHERE family_id = $1 AND deleted_at IS NULL`, [familyId])) {
    await trad.indexarReliquia(t, familyId, x.id);
  }
  await auditar({ familyId, atorUserId: userId, acao: 'acervo.importado',
    depois: contagem }, t);
  return contagem;
}

// GEDCOM de fora (§70): o mínimo que preserva proveniência — cada dado
// importado vira claim com fonte IMPORTACAO.
async function importarGedcom(t, { familyId, userId, texto }) {
  const prov = require('./proveniencia');
  const { Persons, Relationships } = require('./repo-pessoas');
  const linhas = String(texto || '').split(/\r?\n/);
  const indis = new Map(); const fams = [];
  let atual = null;
  for (const l of linhas) {
    const m = l.match(/^(\d+)\s+(@[^@]+@)?\s*(\S+)\s*(.*)$/);
    if (!m) continue;
    const [, nivel, id, tag, resto] = m;
    if (nivel === '0' && tag === 'INDI') { atual = { ged: id, nome: '', nasc: '' }; indis.set(id, atual); }
    else if (nivel === '0' && tag === 'FAM') { atual = { fam: true, husb: null, wife: null, chil: [] }; fams.push(atual); }
    else if (nivel === '0') atual = null;
    else if (atual && !atual.fam && tag === 'NAME') atual.nome = resto.replace(/\//g, '').trim();
    else if (atual && !atual.fam && tag === 'DATE' && !atual.nasc) atual.nasc = (resto.match(/\d{4}/) || [''])[0];
    else if (atual && atual.fam && tag === 'HUSB') atual.husb = resto.trim();
    else if (atual && atual.fam && tag === 'WIFE') atual.wife = resto.trim();
    else if (atual && atual.fam && tag === 'CHIL') atual.chil.push(resto.trim());
  }
  if (!indis.size) throw erro('erro.import_gedcom_vazio', 400);

  const fonte = await prov.criarFonte(t, { familyId, userId, tipo: 'IMPORTACAO',
    titulo: 'Importação GEDCOM' });
  const idPor = new Map();
  for (const [ged, i] of indis) {
    if (!i.nome) continue;
    const p = await Persons.criar(t, { familyId, userId,
      dados: { nome: i.nome, nascimento: i.nasc || '' } });
    idPor.set(ged, p.id);
    await prov.afirmar(t, { familyId, userId, sujeitoId: p.id, predicado: 'nome',
      valor: i.nome, fonte });
  }
  let casamentos = 0, filiacoes = 0;
  for (const f of fams) {
    const h = idPor.get(f.husb), w = idPor.get(f.wife);
    if (h && w) { await Relationships.criar(t, { familyId, userId,
      dados: { person_a: h, person_b: w, tipo: 'SPOUSE_OF' } }).catch(() => {}); casamentos++; }
    for (const c of f.chil) {
      const filho = idPor.get(c);
      for (const pai of [h, w]) {
        if (pai && filho) { await Relationships.criar(t, { familyId, userId,
          dados: { person_a: pai, person_b: filho, tipo: 'PARENT_OF', confirmo_mesmo_assim: true } })
          .catch(() => {}); filiacoes++; }
      }
    }
  }
  await auditar({ familyId, atorUserId: userId, acao: 'acervo.importado_gedcom',
    depois: { pessoas: idPor.size, casamentos, filiacoes } }, t);
  return { pessoas: idPor.size, casamentos, filiacoes };
}

module.exports = { zipar, crc32, dadosDaFamilia, gedcomDe, gerar, importarDados, importarGedcom };
