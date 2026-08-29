// =====================================================================
// Villela Legal Intelligence — PEÇAS JURÍDICAS (Fase 4, Módulo 10).
//
// Minuta (legal_drafts) com versões (legal_draft_versions: conteúdo +
// fontes JSON + pontos de atenção). Fluxo de estados com travas:
//  rascunho → revisao_pendente → aprovado → protocolado/enviado/arquivado
//  * aprovar/protocolar/enviar são gates de PERMISSÃO nas rotas;
//  * peça gerada por IA (gerado_por_ia=1) NÃO chega a 'aprovado' sem
//    aprovado_por humano — o repo trava aqui.
//
// Geração assistida: modo direto (llm.executar, texto) ou FILA — cria
// ai_query com contexto {finalidade:'gerar-peca', draft_id} e o agente
// local devolve a minuta via POST /pecas/:id/versoes (PUBLISH_KEY).
// Exportação: HTML pronto p/ imprimir (PDF pelo navegador) e .doc
// (HTML com content-type do Word — sem dependência nova no servidor).
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const llm = require('./llm');
const ia = require('./ia');

const TIPOS_PECA = [
  'peticao-inicial', 'contestacao', 'replica', 'impugnacao', 'manifestacao',
  'agravo-instrumento', 'apelacao', 'recurso-inominado', 'recurso-ordinario', 'recurso-revista',
  'recurso-especial', 'recurso-extraordinario', 'agravo-resp', 'agravo-re',
  'embargos-declaracao', 'embargos-execucao', 'habeas-corpus', 'mandado-seguranca', 'acao-rescisoria',
  'contrarrazoes', 'memoriais', 'sustentacao-oral', 'parecer', 'notificacao-extrajudicial',
  'contrato', 'aditivo', 'distrato', 'acordo',
];
const STATUS_PECA = ['rascunho', 'revisao_pendente', 'aprovado', 'protocolado', 'enviado_cliente', 'arquivado'];
const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const fk = (v) => { const x = s(v, 40); return x === '' ? null : x; };

const Pecas = {
  TIPOS_PECA, STATUS_PECA,
  listar({ status = '', tipo = '', case_id = '', limite = 100 } = {}) {
    let sql = `SELECT d.*, c.numero_cnj, cl.nome AS cliente_nome,
      (SELECT MAX(versao) FROM legal_draft_versions v WHERE v.draft_id = d.id) AS versoes
      FROM legal_drafts d LEFT JOIN cases c ON c.id = d.case_id LEFT JOIN clients cl ON cl.id = d.client_id`;
    const where = [], args = [];
    if (status) { where.push('d.status = ?'); args.push(status); }
    if (tipo) { where.push('d.tipo_peca = ?'); args.push(tipo); }
    if (case_id) { where.push('d.case_id = ?'); args.push(case_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY d.atualizado_em DESC LIMIT ?'; args.push(Math.min(Number(limite) || 100, 300));
    return db.prepare(sql).all(...args);
  },
  obter(id) {
    const d = db.prepare(`SELECT d.*, c.numero_cnj, cl.nome AS cliente_nome FROM legal_drafts d
      LEFT JOIN cases c ON c.id = d.case_id LEFT JOIN clients cl ON cl.id = d.client_id WHERE d.id = ?`).get(id);
    if (!d) return null;
    d.versoes = db.prepare('SELECT id, versao, pontos_atencao, criado_por, criado_em FROM legal_draft_versions WHERE draft_id = ? ORDER BY versao DESC').all(id);
    const ultima = db.prepare('SELECT * FROM legal_draft_versions WHERE draft_id = ? ORDER BY versao DESC LIMIT 1').get(id);
    if (ultima) { d.conteudo = ultima.conteudo; d.fontes = j.parse(ultima.fontes, []); d.pontos_atencao = ultima.pontos_atencao; d.versao_atual = ultima.versao; }
    return d;
  },
  // conteúdo de UMA versão (a ficha só devolve a última) — serve para
  // reler uma versão antiga e para comparar duas.
  versao(draftId, numero) {
    const v = db.prepare('SELECT * FROM legal_draft_versions WHERE draft_id = ? AND versao = ?').get(draftId, Number(numero) || 0);
    if (!v) throw new Error('Versão não encontrada.');
    return { ...v, fontes: j.parse(v.fontes, []) };
  },
  criar(d, autor) {
    if (!TIPOS_PECA.includes(d.tipo_peca)) throw new Error('Tipo de peça inválido: ' + d.tipo_peca);
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO legal_drafts (id, case_id, client_id, tipo_peca, objetivo, status, gerado_por_ia, revisor,
      aprovado_por, criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,'rascunho',0,?,'',?,?,?)`)
      .run(id, fk(d.case_id), fk(d.client_id), d.tipo_peca, s(d.objetivo, 2000), s(d.revisor, 40), s(autor, 40), agora, agora);
    return db.prepare('SELECT * FROM legal_drafts WHERE id = ?').get(id);
  },
  novaVersao(draftId, d, autor, { viaIA = false } = {}) {
    const draft = db.prepare('SELECT * FROM legal_drafts WHERE id = ?').get(draftId);
    if (!draft) throw new Error('Peça não encontrada.');
    const conteudo = s(d.conteudo, 300000);
    if (!conteudo) throw new Error('Conteúdo vazio.');
    return transacao(() => {
      const versao = (db.prepare('SELECT MAX(versao) m FROM legal_draft_versions WHERE draft_id = ?').get(draftId).m || 0) + 1;
      const vid = novoId();
      db.prepare(`INSERT INTO legal_draft_versions (id, draft_id, versao, conteudo, fontes, pontos_atencao, criado_por, criado_em)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(vid, draftId, versao, conteudo, j.str(Array.isArray(d.fontes) ? d.fontes : []), s(d.pontos_atencao, 4000), s(autor, 120), nowISO());
      // nova versão volta a exigir revisão; IA marca a peça permanentemente como assistida
      db.prepare('UPDATE legal_drafts SET status = ?, gerado_por_ia = ?, atualizado_em = ? WHERE id = ?')
        .run(draft.status === 'rascunho' ? 'rascunho' : 'revisao_pendente', viaIA ? 1 : draft.gerado_por_ia, nowISO(), draftId);
      ia.indexar('minuta', vid, 'Minuta ' + draft.tipo_peca, conteudo); // entra no RAG
      return { id: vid, versao };
    });
  },
  mudarStatus(id, novo, quem, { aprovador = '' } = {}) {
    const d = db.prepare('SELECT * FROM legal_drafts WHERE id = ?').get(id);
    if (!d) throw new Error('Peça não encontrada.');
    if (!STATUS_PECA.includes(novo)) throw new Error('Status inválido: ' + novo);
    if (['aprovado', 'protocolado', 'enviado_cliente'].includes(novo)) {
      const temVersao = db.prepare('SELECT 1 FROM legal_draft_versions WHERE draft_id = ? LIMIT 1').get(id);
      if (!temVersao) throw new Error('A peça não tem conteúdo (nenhuma versão).');
    }
    let aprovadoPor = d.aprovado_por;
    if (novo === 'aprovado') {
      if (!aprovador) throw new Error('Aprovação exige advogado identificado (sessão humana).');
      aprovadoPor = aprovador; // trava: IA nunca aprova — rota só permite sessão com permissão
    }
    if (['protocolado', 'enviado_cliente'].includes(novo) && d.gerado_por_ia && !aprovadoPor) {
      throw new Error('Peça gerada por IA precisa ser APROVADA por advogado antes de protocolar/enviar.');
    }
    db.prepare('UPDATE legal_drafts SET status = ?, aprovado_por = ?, atualizado_em = ? WHERE id = ?')
      .run(novo, aprovadoPor, nowISO(), id);
    return db.prepare('SELECT * FROM legal_drafts WHERE id = ?').get(id);
  },

  // Geração assistida: modo direto (texto) ou fila p/ o agente local.
  async gerar(draftId, autor) {
    const d = Pecas.obter(draftId);
    if (!d) throw new Error('Peça não encontrada.');
    const tpl = db.prepare('SELECT conteudo FROM prompt_templates WHERE id = ?').get('elaboracao-' + d.tipo_peca)
      || db.prepare('SELECT conteudo FROM prompt_templates WHERE id = ?').get(d.tipo_peca === 'parecer' ? 'parecer-juridico' : 'elaboracao-recurso');
    const ctx = ia.montarContexto(`${d.tipo_peca} ${d.objetivo}`, { case_id: d.case_id });
    const instrucao = `Elabore a MINUTA da peça "${d.tipo_peca}".\nOBJETIVO: ${d.objetivo || '(não informado — use placeholders)'}\n`
      + (tpl ? `ROTEIRO DO ESCRITÓRIO:\n${tpl.conteudo}\n` : '')
      + (ctx.texto ? `\nCONTEXTO (fontes internas):\n${ctx.texto}\n` : '')
      + `\nRegras de saída: texto integral da peça em português forense; placeholders [___] onde faltar informação; `
      + `terminar com a seção "PONTOS DE ATENÇÃO" (lista) e a seção "FONTES" (uma citação por linha). Carimbo MINUTA no topo.`;

    if (!llm.ativo()) {
      const queryId = repo.IA.criarConsulta({
        pergunta: instrucao, agente: 'pecas',
        case_id: d.case_id, client_id: d.client_id,
        contexto: { finalidade: 'gerar-peca', draft_id: draftId, tipo_peca: d.tipo_peca },
      }, autor);
      return { situacao: 'pendente', query_id: queryId, detalhe: 'Sem ANTHROPIC_API_KEY — pedido de minuta na fila; o agente local devolve via POST /pecas/' + draftId + '/versoes.' };
    }
    const r = await llm.executar({ agenteId: 'pecas', queryId: '', systemExtra: '', prompt: instrucao });
    const v = Pecas.novaVersao(draftId, { conteudo: r.texto, fontes: ctx.fontes, pontos_atencao: 'Minuta gerada por IA — revisão integral obrigatória.' }, 'ia:' + r.modelo, { viaIA: true });
    return { situacao: 'gerada', versao: v.versao, modelo: r.modelo };
  },

  // Exportação HTML (imprimível → PDF no navegador) e .doc (HTML + mime do Word)
  exportar(id, formato, quem) {
    const d = Pecas.obter(id);
    if (!d) throw new Error('Peça não encontrada.');
    if (!d.conteudo) throw new Error('A peça não tem conteúdo.');
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const minuta = d.status !== 'aprovado';
    const html = `<html><head><meta charset="utf-8"><title>${esc(d.tipo_peca)}</title><style>
      body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;max-width:19cm;margin:2cm auto;color:#111}
      .carimbo{border:2px solid #b00;color:#b00;padding:4px 14px;font-weight:bold;display:inline-block;margin-bottom:16px}
      .meta{color:#555;font-size:10pt;margin-bottom:20px} pre{white-space:pre-wrap;font:inherit}</style></head><body>
      ${minuta ? '<div class="carimbo">MINUTA — SUJEITA A REVISÃO (validar com advogado OAB)</div>' : ''}
      <div class="meta">${esc(d.tipo_peca)} · ${esc(d.numero_cnj || '')} ${d.cliente_nome ? '· ' + esc(d.cliente_nome) : ''} · v${d.versao_atual} · ${nowISO().slice(0, 10)}${d.gerado_por_ia ? ' · assistida por IA' : ''}</div>
      <pre>${esc(d.conteudo)}</pre></body></html>`;
    db.prepare('INSERT INTO legal_draft_exports (id, draft_id, versao, formato, quem, quando) VALUES (?,?,?,?,?,?)')
      .run(novoId(), id, d.versao_atual || 1, formato === 'doc' ? 'doc' : 'html', s(quem, 120), nowISO());
    return { html, nome: `${d.tipo_peca}-v${d.versao_atual}.${formato === 'doc' ? 'doc' : 'html'}`, doc: formato === 'doc' };
  },
};

module.exports = { Pecas };
