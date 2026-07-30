// =====================================================================
// ONDA LIVRO · MARKETING JURÍDICO (Cap. 13 ética · 14 sistema de conteúdo)
// Calendário editorial (14.2), pauta a partir das dúvidas do público (14.3),
// produção assistida (14.4), REVISÃO ÉTICA ANTES DA PUBLICAÇÃO (14.5) com o
// checklist do Provimento 205/2021 (13.10), SEO (14.6) e arquivo das
// versões publicadas (14.10).
//
// Trava: nada vai a "publicado" sem revisão ética aprovada por advogado.
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, int, bool, valida, hoje, patch, um, todos, novoId, nowISO, j, db, arr } = B;

// 13.10 checklist de conformidade de campanhas.
// Provimento CFOAB n. 205/2021 CONFERIDO EM VIGOR em 30/07/2026 (revogou o Prov. 94/2000;
// nenhuma revogação/alteração posterior localizada na fonte oficial oab.org.br). Os artigos
// citados abaixo foram lidos no texto oficial. Itens redigidos como PERGUNTA de conferência —
// quem responde é o advogado (a revisão ética não se automatiza).
const CHECKLIST_ETICA = [
  { item: 'Conteúdo é informativo/educativo, sem mercantilização da advocacia (art. 1º e 2º do Prov. 205/2021; arts. 39-47 do CED).', obrigatorio: true },
  { item: 'Sem promessa de resultado e sem utilização de casos concretos (art. 6º e parágrafo único do Prov. 205/2021).', obrigatorio: true },
  { item: 'Sem referência a valores de honorários, forma de pagamento, gratuidade ou descontos (art. 3º, I, do Prov. 205/2021).', obrigatorio: true },
  { item: 'Sem orações ou expressões persuasivas, de autopromoção ou de captação de clientela (art. 3º, IV, do Prov. 205/2021).', obrigatorio: true },
  { item: 'Sem menção a decisões judiciais e resultados obtidos em causas próprias ou de terceiros (art. 4º, §2º, do Prov. 205/2021).', obrigatorio: true },
  { item: 'Sem sigilo profissional exposto e sem dado pessoal de cliente ou de terceiro (art. 34, VII, EAOAB; art. 35 do CED; LGPD).', obrigatorio: true },
  { item: 'Identificação profissional correta (nome e OAB/UF) e sem título, especialidade ou pós-graduação que não possua.', obrigatorio: true },
  { item: 'Sem pagamento por aparição em rankings ou premiações (art. 5º, §1º, do Prov. 205/2021).', obrigatorio: false },
  { item: 'Impulsionamento/anúncio pago mantém caráter informativo, sem ferramenta que influa de forma fraudulenta no alcance (art. 4º, §5º, do Prov. 205/2021).', obrigatorio: false },
  { item: 'Texto informa que a orientação jurídica depende da análise do caso concreto.', obrigatorio: false },
  { item: 'Fontes normativas citadas foram conferidas na fonte oficial e estão vigentes (Cap. 5.3/33.4).', obrigatorio: false },
  { item: 'Se o conteúdo foi produzido com apoio de IA, houve revisão humana significativa antes da publicação (Recomendação CFOAB 001/2024).', obrigatorio: false },
];

const Conteudo = {
  checklistPadrao() { return CHECKLIST_ETICA; },
  listar({ status = '', tipo = '', area = '', n = 200 } = {}) {
    let sql = 'SELECT * FROM content_items', w = [], a = [];
    if (status) { w.push('status = ?'); a.push(status); }
    if (tipo) { w.push('tipo = ?'); a.push(tipo); }
    if (area) { w.push('area = ?'); a.push(area); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += " ORDER BY CASE WHEN data_prevista = '' THEN 1 ELSE 0 END, data_prevista, criado_em DESC LIMIT ?";
    a.push(Math.min(int(n, 200), 400));
    return todos(sql, ...a).map(c => ({ ...c, etica_itens: j.parse(c.etica_itens, []) }));
  },
  obter(id) {
    const c = um('SELECT * FROM content_items WHERE id = ?', id);
    if (!c) return null;
    c.etica_itens = j.parse(c.etica_itens, []);
    c.versoes = todos('SELECT * FROM content_versions WHERE content_id = ? ORDER BY versao DESC', id);
    return c;
  },
  criar(d = {}, quem) {
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO content_items (id, titulo, tipo, area, canal, publico, data_prevista, pauta, texto,
      palavras_chave, status, etica_status, etica_itens, etica_por, etica_em, aprovado_por, url_publicada,
      publicado_em, autor, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'pendente','[]','','','','','',?,?,?)`)
      .run(id, s(d.titulo, 300), valida(d.tipo, EL.tipoConteudo, 'tipo'), s(d.area, 60), s(d.canal, 120),
        s(d.publico, 300), s(d.data_prevista, 20), s(d.pauta, 4000), s(d.texto, 60000),
        s(d.palavras_chave, 500), valida(d.status, EL.statusConteudo, 'status'),
        s(d.autor, 120) || s(quem, 120), agora, agora);
    return Conteudo.obter(id);
  },
  atualizar(id, d = {}) {
    const c0 = um('SELECT * FROM content_items WHERE id = ?', id);
    if (!c0) throw new Error('Conteúdo não encontrado.');
    if (c0.status === 'publicado' && d.texto !== undefined && s(d.texto, 60000) !== c0.texto) {
      throw new Error('Conteúdo publicado: gere uma nova versão (14.10) em vez de reescrever o texto no ar.');
    }
    const c = {};
    for (const [k, max] of [['titulo', 300], ['area', 60], ['canal', 120], ['publico', 300],
      ['data_prevista', 20], ['pauta', 4000], ['texto', 60000], ['palavras_chave', 500], ['url_publicada', 500]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.tipo !== undefined) c.tipo = valida(d.tipo, EL.tipoConteudo, 'tipo');
    if (d.status !== undefined) {
      c.status = valida(d.status, EL.statusConteudo, 'status');
      // 14.5: publicar exige revisão ética aprovada (é a trava do capítulo 13/14)
      if (c.status === 'publicado' && c0.etica_status !== 'aprovado') {
        throw new Error('Publicação bloqueada: revisão ética pendente (Cap. 14.5 / Prov. 205/2021).');
      }
      if (c.status === 'publicado') c.publicado_em = nowISO();
    }
    // texto alterado invalida a revisão ética anterior — revisou-se o texto antigo
    if (c.texto !== undefined && c.texto !== c0.texto && c0.etica_status !== 'pendente') {
      c.etica_status = 'pendente'; c.etica_por = ''; c.etica_em = ''; c.etica_itens = '[]';
    }
    patch('content_items', id, c);
    return Conteudo.obter(id);
  },
  // 14.5 revisão ética: item por item, por pessoa identificada
  revisarEtica(id, d = {}, quem) {
    const c = um('SELECT * FROM content_items WHERE id = ?', id);
    if (!c) throw new Error('Conteúdo não encontrado.');
    if (!s(quem)) throw new Error('Revisão ética exige advogado identificado.');
    const itens = arr(d.itens).map(i => ({ item: s(i.item, 500), ok: bool(i.ok), observacao: s(i.observacao, 500) }));
    if (!itens.length) throw new Error('Marque os itens do checklist de conformidade (Cap. 13.10).');
    const obrigatorios = CHECKLIST_ETICA.filter(x => x.obrigatorio);
    const reprovado = obrigatorios.some(o => {
      const m = itens.find(i => i.item === o.item);
      return !m || !m.ok;
    });
    const status = reprovado ? 'reprovado' : 'aprovado';
    patch('content_items', id, {
      etica_itens: j.str(itens), etica_status: status, etica_por: s(quem, 120), etica_em: nowISO(),
      status: reprovado ? 'reprovado' : (c.status === 'revisao_etica' || c.status === 'producao' ? 'aprovado' : c.status),
      aprovado_por: reprovado ? '' : s(quem, 120),
    });
    return { ...Conteudo.obter(id), reprovado, pendentes: reprovado ? obrigatorios.filter(o => !itens.some(i => i.item === o.item && i.ok)).map(o => o.item) : [] };
  },
  // 14.10 arquivo das versões publicadas
  arquivarVersao(id, d = {}, quem) {
    const c = um('SELECT * FROM content_items WHERE id = ?', id);
    if (!c) throw new Error('Conteúdo não encontrado.');
    const versao = (um('SELECT COALESCE(MAX(versao),0) v FROM content_versions WHERE content_id = ?', id).v || 0) + 1;
    const vid = novoId();
    db.prepare('INSERT INTO content_versions (id, content_id, versao, texto, url, quem, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(vid, id, versao, s(d.texto, 60000) || c.texto, s(d.url, 500) || c.url_publicada, s(quem, 120), nowISO());
    if (d.texto !== undefined) {
      // nova versão de conteúdo já publicado: volta para revisão ética
      patch('content_items', id, { texto: s(d.texto, 60000), etica_status: 'pendente', etica_por: '', etica_em: '', etica_itens: '[]', status: 'revisao_etica' });
    }
    return Conteudo.obter(id);
  },
  remover(id) { return db.prepare('DELETE FROM content_items WHERE id = ?').run(id).changes; },

  // 14.3 dúvidas do público → pauta (alimentado pelo CRM/portal/atendimento)
  perguntas({ n = 200 } = {}) { return todos('SELECT * FROM content_questions ORDER BY frequencia DESC, criado_em DESC LIMIT ?', Math.min(int(n, 200), 400)); },
  addPergunta(d = {}) {
    const texto = s(d.pergunta, 1000);
    if (!texto) throw new Error('Informe a pergunta.');
    const igual = um('SELECT id, frequencia FROM content_questions WHERE pergunta = ?', texto);
    if (igual) {
      db.prepare('UPDATE content_questions SET frequencia = ? WHERE id = ?').run((igual.frequencia || 1) + 1, igual.id);
      return um('SELECT * FROM content_questions WHERE id = ?', igual.id);
    }
    const id = novoId();
    db.prepare('INSERT INTO content_questions (id, pergunta, origem, area, frequencia, content_id, criado_em) VALUES (?,?,?,?,1,?,?)')
      .run(id, texto, s(d.origem, 60), s(d.area, 60), s(d.content_id, 40), nowISO());
    return um('SELECT * FROM content_questions WHERE id = ?', id);
  },
  // 14.2 calendário + 14.9 métricas permitidas (volume/alcance, nunca resultado de caso)
  painel({ dias = 90 } = {}) {
    const desde = B.maisDias(-Math.abs(int(dias, 90)));
    return {
      por_status: todos('SELECT status, COUNT(*) n FROM content_items GROUP BY status'),
      aguardando_etica: um("SELECT COUNT(*) n FROM content_items WHERE etica_status = 'pendente' AND status IN ('producao','revisao_etica','aprovado')").n,
      reprovados: um("SELECT COUNT(*) n FROM content_items WHERE etica_status = 'reprovado'").n,
      publicados_periodo: um('SELECT COUNT(*) n FROM content_items WHERE publicado_em >= ?', desde).n,
      proximos: todos("SELECT id, titulo, tipo, data_prevista, status FROM content_items WHERE data_prevista >= ? AND status NOT IN ('publicado','arquivado') ORDER BY data_prevista LIMIT 20", hoje()),
      pautas_sugeridas: todos('SELECT * FROM content_questions WHERE content_id = \'\' ORDER BY frequencia DESC LIMIT 10'),
    };
  },
};

module.exports = { Conteudo };
