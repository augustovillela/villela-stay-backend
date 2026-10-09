// =====================================================================
// Villela Academy — ESTUDO · dados e IMPORTAÇÃO do escopo.
//
// Como no interativo e na jornada, o conteúdo entra pela chave de
// publicação, validado, e nasce em RASCUNHO: só o dono do curso e o admin
// veem. Nada aqui gera conteúdo ao vivo nem publica sozinho.
//
// A importação é idempotente: o escopo pelo slug, o item pelo código, a
// competência/unidade/card pelo código e a questão pelo HASH do conteúdo —
// reenviar a mesma prova não infla o banco.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('../db');
const edital = require('./edital');
const banco = require('./banco');
const { ordenar } = require('./plano');
const { normalizarRegra } = require('./pontuacao');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const slug = (v) => s(v, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const erro = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };
const lista = (v, max = 40, tam = 300) => (Array.isArray(v) ? v : []).map(x => s(x, tam)).filter(Boolean).slice(0, max);

const TIPOS = ['assunto', 'edital'];
const EXTENSOES = ['micro', 'modulo', 'curso', 'preparacao'];
const STATUS = ['rascunho', 'publicado'];
const REVISAO = ['sugerido', 'revisado'];
// A aula ativa (prompt mestre, 6.1). Unidade sem explicação não ensina;
// sem prática ou aplicação, o aluno só lê — as duas faltas são recusadas.
const BLOCOS = ['desafio', 'explicacao', 'exemplo', 'recordacao', 'pratica', 'aplicacao', 'sintese'];
const BLOCOS_DE_ACAO = ['pratica', 'aplicacao'];
const MIDIAS = ['texto', 'audio', 'video', 'animacao', 'slides', 'imagem', 'diagrama', 'pdf'];
const ESTADOS_MIDIA = ['planejado', 'roteirizado', 'gerado', 'revisado', 'publicado'];

// ---------------------------------------------------------------------
// leitura
// ---------------------------------------------------------------------
const abrir = (r) => r && { ...r, perfil: j.parse(r.perfil, {}), regra_pontuacao: j.parse(r.regra_pontuacao, {}) };
const Escopos = {
  obter: (id) => abrir(db.prepare('SELECT * FROM est_escopos WHERE id = ?').get(id)),
  porSlug: (productId, sl) => abrir(db.prepare('SELECT * FROM est_escopos WHERE product_id = ? AND slug = ?').get(productId, sl)),
  doProduto: (productId, vis) => db.prepare(`SELECT * FROM est_escopos WHERE product_id = ? AND status IN (${vis.map(() => '?').join(',')}) ORDER BY criado_em`).all(productId, ...vis).map(abrir),
};
function itens(escopo, versao = escopo.versao) {
  return db.prepare('SELECT * FROM est_itens WHERE escopo_id = ? AND versao = ? ORDER BY ordem').all(escopo.id, versao)
    .map(i => ({ ...i, folha: !!i.folha, esforco_min: j.parse(i.esforco, null) }));
}
function competencias(escopoId) {
  return db.prepare('SELECT * FROM est_competencias WHERE escopo_id = ? ORDER BY ordem').all(escopoId)
    .map(c => ({ ...c, essencial: !!c.essencial, criterios: j.parse(c.criterios, []), depende_de: j.parse(c.depende_de, []), erros_comuns: j.parse(c.erros_comuns, []) }));
}
const vinculos = (escopoId) => db.prepare('SELECT * FROM est_vinculos WHERE escopo_id = ?').all(escopoId);
function unidades(escopoId, vis) {
  return db.prepare(`SELECT * FROM est_unidades WHERE escopo_id = ? AND status IN (${vis.map(() => '?').join(',')}) ORDER BY ordem`).all(escopoId, ...vis)
    .map(u => ({ ...u, competencias: j.parse(u.competencias, []), itens: j.parse(u.itens, []), blocos: j.parse(u.blocos, []), fontes: j.parse(u.fontes, []), midias: j.parse(u.midias, []) }));
}
const abrirQuestao = (r) => r && { ...j.parse(r.dados, {}), id: r.id, versao: r.versao, situacao: r.situacao, uso: r.uso, corrigivel: !!r.corrigivel, producer_id: r.producer_id };
const Questoes = {
  obter: (id) => abrirQuestao(db.prepare('SELECT * FROM est_questoes WHERE id = ?').get(id)),
  // questões ligadas ao escopo; `competencia` restringe (direto ou pelo item que a competência cobre)
  doEscopo(escopoId, { situacoes = ['disponivel'], competencia = '' } = {}) {
    const linhas = db.prepare(`SELECT DISTINCT q.* FROM est_questoes q JOIN est_questao_vinculos v ON v.questao_id = q.id
        WHERE v.escopo_id = ? AND q.situacao IN (${situacoes.map(() => '?').join(',')}) ORDER BY q.criado_em, q.id`).all(escopoId, ...situacoes).map(abrirQuestao);
    return competencia ? linhas.filter(q => competenciasDaQuestao(q.id, escopoId).includes(competencia)) : linhas;
  },
};
// A competência que a questão avalia: a declarada + a dos itens a que ela se liga.
function competenciasDaQuestao(questaoId, escopoId) {
  const v = db.prepare('SELECT alvo, codigo FROM est_questao_vinculos WHERE questao_id = ? AND escopo_id = ?').all(questaoId, escopoId);
  const diretas = v.filter(x => x.alvo === 'competencia').map(x => x.codigo);
  const pelosItens = v.filter(x => x.alvo === 'item').flatMap(x =>
    db.prepare('SELECT competencia_codigo c FROM est_vinculos WHERE escopo_id = ? AND item_codigo = ?').all(escopoId, x.codigo).map(r => r.c));
  return [...new Set([...diretas, ...pelosItens])];
}
function cards(escopoId, vis) {
  return db.prepare(`SELECT * FROM est_cards WHERE escopo_id = ? AND status IN (${vis.map(() => '?').join(',')}) ORDER BY ordem`).all(escopoId, ...vis);
}

// ---------------------------------------------------------------------
// validação do que entra
// ---------------------------------------------------------------------
function validarUnidade(u, i, codComp, codItem) {
  const onde = `unidade ${i + 1}`;
  const codigo = slug(u.codigo || u.titulo), titulo = s(u.titulo, 160);
  if (!codigo || !titulo) throw erro(`${onde}: código e título são obrigatórios.`);
  const comps = lista(u.competencias, 12, 60);
  if (!comps.length) throw erro(`${onde}: ligue a ao menos uma competência — unidade sem objetivo não se avalia.`);
  comps.forEach(c => { if (!codComp.has(c)) throw erro(`${onde}: competência "${c}" não existe.`); });
  const its = lista(u.itens, 60, 40);
  its.forEach(c => { if (!codItem.has(c)) throw erro(`${onde}: item "${c}" não existe no programa vigente.`); });
  const blocos = (Array.isArray(u.blocos) ? u.blocos : []).map((b, k) => {
    const tipo = s(b && b.tipo, 20);
    if (!BLOCOS.includes(tipo)) throw erro(`${onde}, bloco ${k + 1}: tipo deve ser ${BLOCOS.join('|')}.`);
    const texto = s(b.texto, 20000);
    if (texto.length < 20) throw erro(`${onde}, bloco ${k + 1} (${tipo}): texto muito curto.`);
    return { tipo, titulo: s(b.titulo, 160), texto, pistas: lista(b.pistas, 5, 600), solucao: s(b.solucao, 8000), criterio: s(b.criterio, 600) };
  });
  if (!blocos.some(b => b.tipo === 'explicacao')) throw erro(`${onde}: falta o bloco de explicação.`);
  if (!blocos.some(b => BLOCOS_DE_ACAO.includes(b.tipo))) throw erro(`${onde}: falta prática ou aplicação — aula ativa exige ação do aluno.`);
  const midias = (Array.isArray(u.midias) ? u.midias : []).map((m, k) => {
    const tipo = s(m && m.tipo, 20), estado = s(m && m.estado, 20);
    if (!MIDIAS.includes(tipo) || !ESTADOS_MIDIA.includes(estado)) throw erro(`${onde}, mídia ${k + 1}: tipo (${MIDIAS.join('|')}) e estado (${ESTADOS_MIDIA.join('|')}) são obrigatórios.`);
    // roteiro não é arquivo: só "gerado" em diante pode apontar para mídia de verdade
    const url = s(m.url, 400);
    if (url && ['planejado', 'roteirizado'].includes(estado)) throw erro(`${onde}, mídia ${k + 1}: ${estado} não tem arquivo — tire a url ou corrija o estado.`);
    return { tipo, estado, url, nota: s(m.nota, 300) };
  });
  const fontes = (Array.isArray(u.fontes) ? u.fontes : []).map(f => ({ titulo: s(f && f.titulo, 300), url: s(f && f.url, 400), consultado_em: s(f && f.consultado_em, 10), sustenta: s(f && f.sustenta, 400) })).filter(f => f.titulo);
  return { codigo, titulo, competencias: comps, itens: its, blocos, midias, fontes, tempo_min: Math.max(0, Math.round(Number(u.tempo_min) || 0)) };
}

// ---------------------------------------------------------------------
// IMPORTAÇÃO
// ---------------------------------------------------------------------
function importar(produto, dados = {}) {
  const e = dados.escopo || {};
  const sl = slug(e.slug || e.titulo);
  if (!sl) throw erro('Informe "escopo.slug" (ou o título).');
  const rel = { escopo: sl, criado: false };
  transacao(() => {
    let escopo = Escopos.porSlug(produto.id, sl);
    const agora = nowISO();
    if (!escopo) {
      const tipo = s(e.tipo, 12), titulo = s(e.titulo, 200);
      if (!TIPOS.includes(tipo)) throw erro(`escopo.tipo deve ser ${TIPOS.join('|')}.`);
      if (!titulo) throw erro('escopo.titulo é obrigatório.');
      db.prepare(`INSERT INTO est_escopos (id, product_id, slug, tipo, titulo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(novoId(), produto.id, sl, tipo, titulo, agora, agora);
      escopo = Escopos.porSlug(produto.id, sl);
      rel.criado = true;
    }
    // só mexe no campo que veio — reimportar as questões não apaga a regra de pontuação
    const set = (col, val) => db.prepare(`UPDATE est_escopos SET ${col} = ?, atualizado_em = ? WHERE id = ?`).run(val, agora, escopo.id);
    if (e.titulo != null && !rel.criado) set('titulo', s(e.titulo, 200));
    if (e.nivel != null) set('nivel', s(e.nivel, 60));
    if (e.extensao != null) { if (!EXTENSOES.includes(e.extensao)) throw erro(`escopo.extensao deve ser ${EXTENSOES.join('|')}.`); set('extensao', e.extensao); }
    if (e.resumo != null) set('resumo', s(e.resumo, 2000));
    if (e.perfil != null) set('perfil', j.str(e.perfil));
    if (e.data_alvo != null) { if (e.data_alvo && !/^\d{4}-\d{2}-\d{2}$/.test(e.data_alvo)) throw erro('escopo.data_alvo deve ser AAAA-MM-DD.'); set('data_alvo', s(e.data_alvo, 10)); }
    if (e.regra_pontuacao != null) {
      const regra = normalizarRegra(e.regra_pontuacao);
      // desconto por erro sem dizer de onde veio a regra é palpite — e palpite muda nota
      if ((regra.desconto || regra.aprovacao || regra.minimos.length) && !regra.fonte) throw erro('escopo.regra_pontuacao: informe a "fonte" (edital/regulamento e artigo) da regra.');
      set('regra_pontuacao', j.str(e.regra_pontuacao));
    }

    // PROGRAMA: versão nova só quando o conteúdo muda (retificação)
    if (dados.programa) {
      const p = dados.programa;
      let crus = p.itens, sobras = [];
      if (!Array.isArray(crus)) ({ itens: crus, sobras } = edital.extrairDoTexto(p.texto));
      const novos = edital.normalizarItens(crus);
      const diff = edital.comparar(escopo.versao ? itens(escopo) : [], novos);
      if (!escopo.versao || diff.mudou) {
        const v = escopo.versao + 1;
        const ins = db.prepare(`INSERT INTO est_itens (escopo_id, versao, codigo, pai, ordem, texto, hash, localizacao, pendente, peso, esforco, folha)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        novos.forEach(i => ins.run(escopo.id, v, i.codigo, i.pai, i.ordem, i.texto, i.hash, i.localizacao, i.pendente, i.peso, i.esforco_min ? j.str(i.esforco_min) : '', i.folha ? 1 : 0));
        const doc = p.documento || {};
        db.prepare('INSERT INTO est_versoes (escopo_id, versao, documento, diff, criado_em) VALUES (?, ?, ?, ?, ?)')
          .run(escopo.id, v, j.str({ nome: s(doc.nome, 200), url: s(doc.url, 400), data: s(doc.data, 10), tipo: s(doc.tipo, 20) }), j.str(diff), agora);
        set('versao', v);
        escopo = Escopos.obter(escopo.id);
        rel.programa = { versao: v, itens: novos.length, pendentes_de_leitura: novos.filter(i => i.pendente).length, sobras,
          adicionados: diff.adicionados.length, removidos: diff.removidos.length, alterados: diff.alterados.length };
      } else {
        // o TEXTO não mudou: não é retificação. Peso, estimativa, origem e pendência
        // de leitura são anotações nossas sobre o item e se atualizam na versão vigente.
        const up = db.prepare('UPDATE est_itens SET localizacao = ?, pendente = ?, peso = ?, esforco = ? WHERE escopo_id = ? AND versao = ? AND codigo = ?');
        novos.forEach(i => up.run(i.localizacao, i.pendente, i.peso, i.esforco_min ? j.str(i.esforco_min) : '', escopo.id, escopo.versao, i.codigo));
        rel.programa = { versao: escopo.versao, sem_mudanca: true, sobras };
      }
    }
    const codItem = new Set(escopo.versao ? itens(escopo).map(i => i.codigo) : []);

    if (dados.competencias) {
      const lst = Array.isArray(dados.competencias) ? dados.competencias : [];
      const prontas = lst.map((c, i) => {
        const codigo = slug(c.codigo || c.nome), resultado = s(c.resultado, 1000);
        if (!codigo) throw erro(`competência ${i + 1}: sem código.`);
        if (resultado.length < 20) throw erro(`competência ${codigo}: descreva o resultado observável ("Diante de…, o aluno…").`);
        return { codigo, ordem: i, resultado, criterios: lista(c.criterios, 12, 400), depende_de: lista(c.depende_de, 12, 60).map(slug), erros_comuns: lista(c.erros_comuns, 12, 400), essencial: c.essencial === false ? 0 : 1 };
      });
      const todos = new Set([...competencias(escopo.id).map(c => c.codigo), ...prontas.map(c => c.codigo)]);
      prontas.forEach(c => c.depende_de.forEach(d => { if (!todos.has(d)) throw erro(`competência ${c.codigo}: depende de "${d}", que não existe.`); }));
      ordenar(prontas); // recusa dependência circular
      rel.competencias = { novas: 0, atualizadas: 0 };
      for (const c of prontas) {
        const atual = db.prepare('SELECT * FROM est_competencias WHERE escopo_id = ? AND codigo = ?').get(escopo.id, c.codigo);
        if (!atual) {
          db.prepare(`INSERT INTO est_competencias (escopo_id, codigo, ordem, resultado, criterios, depende_de, erros_comuns, essencial) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(escopo.id, c.codigo, c.ordem, c.resultado, j.str(c.criterios), j.str(c.depende_de), j.str(c.erros_comuns), c.essencial);
          rel.competencias.novas++;
        } else {
          // mudou o que se exige → versão nova: a evidência antiga fica presa à versão em que foi obtida
          const mudou = atual.resultado !== c.resultado || atual.criterios !== j.str(c.criterios);
          db.prepare(`UPDATE est_competencias SET ordem = ?, resultado = ?, criterios = ?, depende_de = ?, erros_comuns = ?, essencial = ?, versao = versao + ? WHERE escopo_id = ? AND codigo = ?`)
            .run(c.ordem, c.resultado, j.str(c.criterios), j.str(c.depende_de), j.str(c.erros_comuns), c.essencial, mudou ? 1 : 0, escopo.id, c.codigo);
          rel.competencias.atualizadas++;
        }
      }
    }
    const codComp = new Set(competencias(escopo.id).map(c => c.codigo));

    if (dados.vinculos) {
      rel.vinculos = 0;
      for (const [i, v] of (Array.isArray(dados.vinculos) ? dados.vinculos : []).entries()) {
        const item = s(v.item, 40), comp = slug(v.competencia), just = s(v.justificativa, 600);
        if (!codItem.has(item)) throw erro(`vínculo ${i + 1}: item "${item}" não existe no programa vigente.`);
        if (!codComp.has(comp)) throw erro(`vínculo ${i + 1}: competência "${comp}" não existe.`);
        if (!just) throw erro(`vínculo ${i + 1}: justifique por que a competência cobre o item — nome parecido não é cobertura.`);
        db.prepare(`INSERT INTO est_vinculos (escopo_id, item_codigo, competencia_codigo, justificativa, estado_revisao) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (escopo_id, item_codigo, competencia_codigo) DO UPDATE SET justificativa = excluded.justificativa, estado_revisao = excluded.estado_revisao`)
          .run(escopo.id, item, comp, just, REVISAO.includes(v.estado_revisao) ? v.estado_revisao : 'sugerido');
        rel.vinculos++;
      }
    }

    if (dados.unidades) {
      rel.unidades = { novas: 0, atualizadas: 0 };
      for (const [i, cru] of (Array.isArray(dados.unidades) ? dados.unidades : []).entries()) {
        const u = validarUnidade(cru, i, codComp, codItem);
        const atual = db.prepare('SELECT id, blocos FROM est_unidades WHERE escopo_id = ? AND codigo = ?').get(escopo.id, u.codigo);
        const campos = [u.titulo, j.str(u.competencias), j.str(u.itens), j.str(u.blocos), j.str(u.fontes), j.str(u.midias), u.tempo_min];
        if (!atual) {
          db.prepare(`INSERT INTO est_unidades (id, escopo_id, codigo, ordem, titulo, competencias, itens, blocos, fontes, midias, tempo_min, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(novoId(), escopo.id, u.codigo, i, ...campos, agora);
          rel.unidades.novas++;
        } else {
          db.prepare(`UPDATE est_unidades SET ordem = ?, titulo = ?, competencias = ?, itens = ?, blocos = ?, fontes = ?, midias = ?, tempo_min = ?, versao = versao + ?, atualizado_em = ? WHERE id = ?`)
            .run(i, ...campos, atual.blocos !== j.str(u.blocos) ? 1 : 0, agora, atual.id);
          rel.unidades.atualizadas++;
        }
      }
    }

    if (dados.questoes) {
      rel.questoes = { novas: 0, duplicadas: 0, atualizadas: 0, sem_vinculo: 0, fora_da_correcao: 0 };
      for (const [i, cru] of (Array.isArray(dados.questoes) ? dados.questoes : []).entries()) {
        const q = banco.validarQuestao(cru, i);
        const comps = lista(cru.competencias, 12, 60).map(slug);
        comps.forEach(c => { if (!codComp.has(c)) throw erro(`questão ${i + 1}: competência "${c}" não existe.`); });
        const its = (Array.isArray(cru.itens) ? cru.itens : []).map(x => ({ codigo: s(x && x.codigo, 40), justificativa: s(x && x.justificativa, 600), estado: REVISAO.includes(x && x.estado_revisao) ? x.estado_revisao : 'sugerido' }));
        its.forEach(x => {
          if (!codItem.has(x.codigo)) throw erro(`questão ${i + 1}: item "${x.codigo}" não existe no programa vigente.`);
          if (!x.justificativa) throw erro(`questão ${i + 1}: justifique o vínculo com o item ${x.codigo}.`);
        });
        const { hash, uso, corrigivel, tipo, origem, ...resto } = q;
        let atual = db.prepare('SELECT id, dados FROM est_questoes WHERE producer_id = ? AND hash = ?').get(produto.producer_id, hash);
        if (atual) {
          // A mesma questão vinda de outro caderno traz as alternativas em outra
          // ordem. A letra de cada alternativa é a da PRIMEIRA importação e não
          // muda mais: resposta já dada e prova já congelada apontam para ela.
          const letra = new Map(j.parse(atual.dados, {}).alternativas.map(a => [edital.normal(a.texto), a.id]));
          resto.alternativas = resto.alternativas.map(a => ({ ...a, id: letra.get(edital.normal(a.texto)) || a.id })).sort((a, b) => a.id.localeCompare(b.id));
        }
        const dadosQ = j.str({ ...resto, tipo, origem });
        if (!atual) {
          const id = novoId();
          db.prepare(`INSERT INTO est_questoes (id, producer_id, hash, tipo, origem, uso, corrigivel, dados, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, produto.producer_id, hash, tipo, origem, uso, corrigivel ? 1 : 0, dadosQ, agora, agora);
          atual = { id };
          rel.questoes.novas++;
        } else if (atual.dados !== dadosQ) {
          // gabarito ou comentário mudou: versão nova; a tentativa já feita guarda a versão que usou
          db.prepare('UPDATE est_questoes SET dados = ?, uso = ?, corrigivel = ?, versao = versao + 1, atualizado_em = ? WHERE id = ?').run(dadosQ, uso, corrigivel ? 1 : 0, agora, atual.id);
          rel.questoes.atualizadas++;
        } else rel.questoes.duplicadas++;
        if (!corrigivel) rel.questoes.fora_da_correcao++;
        if (!comps.length && !its.length) rel.questoes.sem_vinculo++; // fica no banco geral, sem contar cobertura
        const vin = db.prepare(`INSERT INTO est_questao_vinculos (questao_id, escopo_id, alvo, codigo, justificativa, estado_revisao) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (questao_id, escopo_id, alvo, codigo) DO UPDATE SET justificativa = excluded.justificativa, estado_revisao = excluded.estado_revisao`);
        comps.forEach(c => vin.run(atual.id, escopo.id, 'competencia', c, '', 'sugerido'));
        its.forEach(x => vin.run(atual.id, escopo.id, 'item', x.codigo, x.justificativa, x.estado));
      }
    }

    if (dados.cards) {
      rel.cards = { novos: 0, atualizados: 0 };
      for (const [i, c] of (Array.isArray(dados.cards) ? dados.cards : []).entries()) {
        const codigo = slug(c.codigo) || `card-${i + 1}`, comp = slug(c.competencia), frente = s(c.frente, 1000), verso = s(c.verso, 2000);
        if (!codComp.has(comp)) throw erro(`card ${i + 1}: competência "${comp}" não existe.`);
        if (frente.length < 8 || verso.length < 2) throw erro(`card ${i + 1}: frente e verso são obrigatórios.`);
        // card enorme vira releitura; a pergunta tem de caber numa recordação
        if (verso.length > 600) throw erro(`card ${i + 1}: verso com mais de 600 caracteres — divida em cards menores.`);
        const atual = db.prepare('SELECT id FROM est_cards WHERE escopo_id = ? AND codigo = ?').get(escopo.id, codigo);
        if (!atual) {
          db.prepare(`INSERT INTO est_cards (id, escopo_id, codigo, ordem, competencia_codigo, frente, verso, explicacao, fonte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(novoId(), escopo.id, codigo, i, comp, frente, verso, s(c.explicacao, 2000), s(c.fonte, 400));
          rel.cards.novos++;
        } else {
          db.prepare('UPDATE est_cards SET ordem = ?, competencia_codigo = ?, frente = ?, verso = ?, explicacao = ?, fonte = ? WHERE id = ?')
            .run(i, comp, frente, verso, s(c.explicacao, 2000), s(c.fonte, 400), atual.id);
          rel.cards.atualizados++;
        }
      }
    }
    rel.escopo_id = escopo.id;
  });
  return rel;
}

// Publicar é ato separado da importação. Questão sem vínculo com o escopo não muda.
function definirStatus(produto, dados = {}) {
  const escopo = Escopos.porSlug(produto.id, slug(dados.escopo));
  if (!escopo) throw erro('Escopo não encontrado.', 404);
  const r = {};
  const st = (v) => (STATUS.includes(v) ? v : null);
  if (st(dados.status)) {
    if (dados.status === 'publicado' && !escopo.versao) throw erro('Escopo sem programa não pode ser publicado.');
    r.escopo = db.prepare('UPDATE est_escopos SET status = ?, atualizado_em = ? WHERE id = ?').run(dados.status, nowISO(), escopo.id).changes;
    // Publicar com furo na mão dupla não é proibido (o conteúdo entra em etapas),
    // mas o furo volta na resposta — quem publica vê o que ainda falta.
    if (dados.status === 'publicado') {
      const md = cobertura({ ...escopo, status: 'publicado' }, { vis: ['publicado'], situacoes: ['disponivel'] }).mao_dupla;
      if (!md.ok) r.aviso_mao_dupla = { folhas_sem_questao: md.folhas_sem_questao.length, questoes_sem_folha: md.questoes_sem_folha, folhas_com_questao_sem_material: md.folhas_com_questao_sem_material.length };
    }
  }
  if (st(dados.unidades)) r.unidades = db.prepare('UPDATE est_unidades SET status = ?, atualizado_em = ? WHERE escopo_id = ?').run(dados.unidades, nowISO(), escopo.id).changes;
  if (st(dados.cards)) r.cards = db.prepare('UPDATE est_cards SET status = ? WHERE escopo_id = ?').run(dados.cards, escopo.id).changes;
  if (banco.SITUACOES.includes(dados.questoes)) {
    r.questoes = db.prepare(`UPDATE est_questoes SET situacao = ?, atualizado_em = ? WHERE producer_id = ? AND id IN (SELECT questao_id FROM est_questao_vinculos WHERE escopo_id = ?)`)
      .run(dados.questoes, nowISO(), produto.producer_id, escopo.id).changes;
  }
  if (REVISAO.includes(dados.vinculos)) {
    r.vinculos = db.prepare('UPDATE est_vinculos SET estado_revisao = ? WHERE escopo_id = ?').run(dados.vinculos, escopo.id).changes
      + db.prepare('UPDATE est_questao_vinculos SET estado_revisao = ? WHERE escopo_id = ?').run(dados.vinculos, escopo.id).changes;
  }
  return r;
}

// ---------------------------------------------------------------------
// COBERTURA do programa — o eixo do MATERIAL e o da AVALIAÇÃO.
// (O eixo do aluno — estudou, demonstrou — é somado em aluno.js.)
// Só folha conta: o título "1. Direito Constitucional" não se estuda, se
// estudam os subitens. Item com leitura pendente não conta como coberto.
// ---------------------------------------------------------------------
function cobertura(escopo, { vis = ['publicado'], situacoes = ['disponivel'] } = {}) {
  const its = itens(escopo);
  const vins = vinculos(escopo.id);
  const uns = unidades(escopo.id, vis);
  const qv = db.prepare(`SELECT v.codigo, v.estado_revisao, q.id FROM est_questao_vinculos v JOIN est_questoes q ON q.id = v.questao_id
      WHERE v.escopo_id = ? AND v.alvo = 'item' AND q.situacao IN (${situacoes.map(() => '?').join(',')})`).all(escopo.id, ...situacoes);
  const porItem = its.map(i => {
    const q = qv.filter(x => x.codigo === i.codigo);
    return {
      codigo: i.codigo, pai: i.pai, texto: i.texto, folha: i.folha, pendente: i.pendente, localizacao: i.localizacao,
      competencias: vins.filter(v => v.item_codigo === i.codigo).map(v => ({ codigo: v.competencia_codigo, estado_revisao: v.estado_revisao })),
      unidades: uns.filter(u => u.itens.includes(i.codigo)).map(u => u.codigo),
      questoes_revisadas: q.filter(x => x.estado_revisao === 'revisado').length,
      questoes_sugeridas: q.filter(x => x.estado_revisao !== 'revisado').length,
    };
  });
  const folhas = porItem.filter(i => i.folha);
  const cod = (f) => folhas.filter(f).map(i => i.codigo);
  // MÃO DUPLA (regra do Augusto, 09/10/2026): perguntas para todos os pontos e
  // pontos para todas as perguntas — e o material cobre todo ponto que tem
  // pergunta. Questão presa só à disciplina ("1.1") ou só a competência não
  // aponta ponto nenhum que o aluno possa estudar: conta como sem folha.
  const ehFolha = new Set(folhas.map(i => i.codigo));
  const comFolha = new Set(qv.filter(x => ehFolha.has(x.codigo)).map(x => x.id));
  const todasQ = db.prepare(`SELECT DISTINCT v.questao_id id FROM est_questao_vinculos v JOIN est_questoes q ON q.id = v.questao_id
      WHERE v.escopo_id = ? AND q.situacao IN (${situacoes.map(() => '?').join(',')})`).all(escopo.id, ...situacoes).map(x => x.id);
  const maoDupla = {
    folhas_sem_questao: cod(i => !i.questoes_revisadas && !i.questoes_sugeridas),
    questoes_sem_folha: todasQ.filter(id => !comFolha.has(id)).length,
    folhas_com_questao_sem_material: cod(i => (i.questoes_revisadas || i.questoes_sugeridas) && !i.unidades.length),
  };
  maoDupla.ok = !maoDupla.folhas_sem_questao.length && !maoDupla.questoes_sem_folha && !maoDupla.folhas_com_questao_sem_material.length;
  return {
    versao: escopo.versao, itens: its.length, folhas: folhas.length,
    pendentes_de_leitura: cod(i => i.pendente),
    material: { com: cod(i => i.unidades.length && !i.pendente).length, sem: cod(i => !i.unidades.length) },
    avaliacao: { com_questao_revisada: cod(i => i.questoes_revisadas).length, so_sugerida: cod(i => !i.questoes_revisadas && i.questoes_sugeridas), sem: cod(i => !i.questoes_revisadas && !i.questoes_sugeridas) },
    sem_competencia: cod(i => !i.competencias.length),
    mao_dupla: maoDupla,
    por_item: porItem,
  };
}

function resumo(productId) {
  return Escopos.doProduto(productId, STATUS).map(e => {
    const c = e.versao ? cobertura(e, { vis: STATUS, situacoes: banco.SITUACOES }) : null;
    const n = (sql) => db.prepare(sql).all(e.id);
    return {
      slug: e.slug, tipo: e.tipo, titulo: e.titulo, status: e.status, versao: e.versao, data_alvo: e.data_alvo,
      versoes: n('SELECT versao, documento, criado_em FROM est_versoes WHERE escopo_id = ? ORDER BY versao').map(v => ({ ...v, documento: j.parse(v.documento, {}) })),
      competencias: competencias(e.id).length,
      unidades: n('SELECT status, COUNT(*) n FROM est_unidades WHERE escopo_id = ? GROUP BY status'),
      questoes: n(`SELECT q.situacao, q.origem, COUNT(DISTINCT q.id) n FROM est_questoes q JOIN est_questao_vinculos v ON v.questao_id = q.id WHERE v.escopo_id = ? GROUP BY q.situacao, q.origem`),
      cards: n('SELECT status, COUNT(*) n FROM est_cards WHERE escopo_id = ? GROUP BY status'),
      cobertura: c && { folhas: c.folhas, pendentes_de_leitura: c.pendentes_de_leitura.length, material_com: c.material.com, material_sem: c.material.sem,
        avaliacao_com_revisada: c.avaliacao.com_questao_revisada, avaliacao_so_sugerida: c.avaliacao.so_sugerida.length, avaliacao_sem: c.avaliacao.sem, sem_competencia: c.sem_competencia,
        mao_dupla: { ok: c.mao_dupla.ok, folhas_sem_questao: c.mao_dupla.folhas_sem_questao.length, questoes_sem_folha: c.mao_dupla.questoes_sem_folha, folhas_com_questao_sem_material: c.mao_dupla.folhas_com_questao_sem_material.length } },
    };
  });
}

module.exports = {
  Escopos, Questoes, itens, competencias, vinculos, unidades, cards, competenciasDaQuestao,
  importar, definirStatus, cobertura, resumo, slug, erro, STATUS, TIPOS, EXTENSOES, BLOCOS,
};
