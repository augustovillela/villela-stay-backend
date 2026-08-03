// =====================================================================
// Villela Legal Intelligence — PETICIONAR (guia própria, grupo Contencioso).
//
// O fluxo que o advogado faz na prática, numa tela só:
//   1. abre um peticionamento (processo do sistema é OPCIONAL);
//   2. sobe as CÓPIAS dos autos → viram contexto de verdade (texto extraído
//      do PDF/DOCX, não só arquivo guardado);
//   3. informa órgão / número do processo / nome da parte / tipo de petição;
//   4. manda o agente jurídico ESPECIALISTA redigir a minuta.
//
// Por que não reusar `pecas.gerar`: aquele monta o prompt a partir do RAG
// (8 trechos por BM25), o que serve para consulta mas é pouco para REDIGIR
// — peça se escreve lendo os autos. Aqui o contexto primário são as cópias
// anexadas, na íntegra até o teto, e o system prompt é o do advogado sênior
// da especialidade (ai_agents), que `pecas.gerar` nem chega a injetar.
//
// Extração de texto: reusa `vdocs/extrair.js` (pdfjs-dist + leitor ZIP
// próprio, já em produção) — sem dependência nova.
//
// TRAVAS mantidas (não afrouxar): a minuta nasce `gerado_por_ia=1`, logo
// não vira 'aprovado' sem advogado identificado nem 'protocolado'/
// 'enviado_cliente' sem aprovação — quem trava é `Pecas.mudarStatus`.
// Nada é protocolado nem enviado a ninguém por aqui.
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');
const ia = require('./ia');
const llm = require('./llm');
const { Pecas } = require('./pecas');
const { extrairTexto } = require('../vdocs/extrair');
const ctxIntegral = require('../contexto-integral');

const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const fk = (v) => { const x = s(v, 40); return x === '' ? null : x; };
// Teto do contexto enviado ao modelo. Alto o bastante para caber a cópia de
// um processo comum e baixo o bastante para o custo não escapar.
const TETO_CTX = parseInt(process.env.LEGAL_PETICAO_CTX_CHARS, 10) || 180000;
const TIPO_DOC_COPIA = 'copia-processo';
const STATUS = ['rascunho', 'gerado', 'erro'];

// Núcleo do processo → agente especialista sênior (prompts-seed.js).
const POR_NUCLEO = {
  civel: 'civel', penal: 'penal', trabalhista: 'trabalhista', empresarial: 'empresarial',
  contratual: 'contratual', contencioso: 'processo-civil', consultivo: 'pareceres', audiencias: 'audiencias',
};
// Tipo de peça manda mais que o núcleo quando é recurso (admissibilidade é a parte difícil).
const POR_TIPO = {
  'recurso-especial': 'tribunais-superiores', 'recurso-extraordinario': 'tribunais-superiores',
  'agravo-resp': 'tribunais-superiores', 'agravo-re': 'tribunais-superiores',
  apelacao: 'recursos-estaduais', 'agravo-instrumento': 'recursos-estaduais',
  'recurso-inominado': 'recursos-estaduais', 'embargos-declaracao': 'recursos-estaduais',
  'recurso-ordinario': 'trabalhista', 'recurso-revista': 'trabalhista',
  'habeas-corpus': 'processo-penal', parecer: 'pareceres',
  contrato: 'contratual', aditivo: 'contratual', distrato: 'contratual', acordo: 'contratual',
};
function especialistaDe({ nucleo, tipo_peca, agente } = {}) {
  const escolhido = agente || POR_TIPO[tipo_peca] || POR_NUCLEO[nucleo] || 'processo-civil';
  return ia.agente(escolhido) || ia.agente('processo-civil') || null;
}

// ------------------------------------------------------ PETICIONAMENTO
// Resolve a ORIGEM do peticionamento: publicação, prazo ou andamento. O ato
// que gerou a necessidade da peça já traz o processo, o órgão e — o mais
// importante — o TEXTO do ato, que vira a primeira cópia de contexto.
// É o caminho real: chega a intimação, você peticiona a partir dela.
function daOrigem(tipo, refId) {
  if (!tipo || !refId) return null;
  if (tipo === 'publicacao') {
    const p = repo.Publicacoes.obter(refId);
    return {
      case_id: p.case_id || '', orgao: p.orgao || '', numero_processo: p.numero_cnj || p.cnj_detectado || '',
      objetivo: p.tem_prazo ? 'Cumprir a intimação publicada (conferir o prazo no sistema do tribunal).' : '',
      fonte: { titulo: `Publicação de ${p.data_publicacao || 's/ data'}${p.orgao ? ' — ' + p.orgao : ''}`, texto: p.texto },
    };
  }
  if (tipo === 'prazo') {
    const z = db.prepare(`SELECT d.*, c.numero_cnj, c.orgao_julgador FROM deadlines d
      LEFT JOIN cases c ON c.id = d.case_id WHERE d.id = ?`).get(refId);
    if (!z) throw new Error('Prazo não encontrado.');
    const pub = z.publication_id ? db.prepare('SELECT texto, orgao, data_publicacao FROM case_publications WHERE id = ?').get(z.publication_id) : null;
    return {
      case_id: z.case_id || '', orgao: z.orgao_julgador || (pub && pub.orgao) || '', numero_processo: z.numero_cnj || '',
      objetivo: `Cumprir o prazo "${z.titulo}"${z.data_fatal ? ` (fatal em ${z.data_fatal})` : ''}.`,
      fonte: pub ? { titulo: `Publicação que originou o prazo (${pub.data_publicacao || 's/ data'})`, texto: pub.texto } : null,
    };
  }
  if (tipo === 'andamento') {
    const m = db.prepare(`SELECT m.*, c.numero_cnj, c.orgao_julgador FROM case_movements m
      LEFT JOIN cases c ON c.id = m.case_id WHERE m.id = ?`).get(refId);
    if (!m) throw new Error('Andamento não encontrado.');
    return {
      case_id: m.case_id || '', orgao: m.orgao_julgador || '', numero_processo: m.numero_cnj || '',
      objetivo: `Responder ao andamento de ${m.data}${m.classificacao ? ` (${m.classificacao})` : ''}.`,
      fonte: { titulo: `Andamento de ${m.data}`, texto: m.descricao },
    };
  }
  throw new Error('Origem inválida: ' + tipo);
}

// Abre o pedido. `case_id` é opcional: dá para peticionar em processo que
// ainda não está cadastrado — os campos digitados bastam. `origem` ({tipo,id})
// puxa publicação/prazo/andamento e já deixa o ato como contexto.
function abrir(d, autor) {
  const org = d.origem && d.origem.tipo ? daOrigem(d.origem.tipo, d.origem.id) : null;
  const caseId = fk(d.case_id) || fk(org && org.case_id);
  let base = {};
  if (caseId) {
    const p = repo.Processos.obter(caseId, { comSigilo: false });
    if (!p) throw new Error('Processo não encontrado.');
    base = { orgao: p.orgao_julgador || '', numero_processo: p.numero_cnj || '', parte: p.cliente_nome || '', polo: p.polo_cliente || '' };
  }
  const pega = (campo, max) => s(d[campo], max) || (org && s(org[campo], max)) || base[campo] || '';
  const id = novoId(); const agora = nowISO();
  db.prepare(`INSERT INTO petition_requests (id, case_id, orgao, numero_processo, parte, polo, tipo_peca, objetivo,
    agente, draft_id, status, detalhe, criado_por, criado_em, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,'','rascunho',?,?,?,?)`)
    .run(id, caseId, pega('orgao', 200), pega('numero_processo', 60), s(d.parte, 200) || base.parte || '',
      s(d.polo, 20) || base.polo || '', s(d.tipo_peca, 60), pega('objetivo', 4000), s(d.agente, 60),
      org ? `Aberto a partir de ${d.origem.tipo}.` : '', s(autor, 40), agora, agora);
  // o texto do ato de origem entra como primeira cópia de contexto
  if (org && org.fonte && org.fonte.texto) {
    try { anexarTexto(id, { titulo: org.fonte.titulo, texto: org.fonte.texto }, autor); } catch (_) { /* contexto é best-effort */ }
  }
  return obter(id);
}

function atualizar(id, d) {
  const p = db.prepare('SELECT * FROM petition_requests WHERE id = ?').get(id);
  if (!p) throw new Error('Peticionamento não encontrado.');
  const campos = { orgao: 200, numero_processo: 60, parte: 200, polo: 20, tipo_peca: 60, objetivo: 4000, agente: 60 };
  for (const [c, max] of Object.entries(campos)) if (d[c] != null) p[c] = s(d[c], max);
  if (d.case_id != null) p.case_id = fk(d.case_id);
  if (d.status != null && STATUS.includes(d.status)) p.status = d.status;
  db.prepare(`UPDATE petition_requests SET case_id=?, orgao=?, numero_processo=?, parte=?, polo=?, tipo_peca=?,
    objetivo=?, agente=?, status=?, atualizado_em=? WHERE id=?`)
    .run(p.case_id, p.orgao, p.numero_processo, p.parte, p.polo, p.tipo_peca, p.objetivo, p.agente, p.status, nowISO(), id);
  return obter(id);
}

function obter(id) {
  const p = db.prepare(`SELECT r.*, c.numero_cnj, c.assunto AS case_assunto, c.nucleo, c.tribunal
    FROM petition_requests r LEFT JOIN cases c ON c.id = r.case_id WHERE r.id = ?`).get(id);
  if (!p) throw new Error('Peticionamento não encontrado.');
  p.copias = copias(id);
  p.contexto_caracteres = p.copias.reduce((n, c) => n + (c.caracteres || 0), 0);
  p.especialista_sugerido = (especialistaDe({ nucleo: p.nucleo, tipo_peca: p.tipo_peca, agente: p.agente }) || {}).id || '';
  p.peca = p.draft_id ? Pecas.obter(p.draft_id) : null;
  return p;
}

// Estado da guia: lista dos peticionamentos + catálogos que a tela precisa.
function estado({ limite = 50 } = {}) {
  const lista = db.prepare(`SELECT r.id, r.orgao, r.numero_processo, r.parte, r.tipo_peca, r.status, r.draft_id,
      r.criado_em, r.criado_por, c.numero_cnj,
      (SELECT COUNT(*) FROM petition_sources f WHERE f.petition_id = r.id) AS copias
    FROM petition_requests r LEFT JOIN cases c ON c.id = r.case_id
    ORDER BY r.criado_em DESC LIMIT ?`).all(Math.min(Number(limite) || 50, 200));
  return {
    peticionamentos: lista,
    tipos: Pecas.TIPOS_PECA,
    especialistas: ia.agentes(),
    processos: repo.Processos.listar({ limite: 300 }).map(p => ({
      id: p.id, numero_cnj: p.numero_cnj, assunto: p.assunto, nucleo: p.nucleo, cliente_nome: p.cliente_nome,
    })),
    ia_direta: llm.ativo(),
  };
}

// ---------------------------------------------------------------- CÓPIAS
function copias(petitionId) {
  return db.prepare(`SELECT d.id, d.titulo, d.criado_em, f.ordem,
      COALESCE(LENGTH(e.texto), 0) AS caracteres, COALESCE(e.metodo, '') AS metodo
    FROM petition_sources f
    JOIN documents d ON d.id = f.document_id
    LEFT JOIN document_text_extractions e ON e.document_id = d.id
    WHERE f.petition_id = ? ORDER BY f.ordem, d.criado_em`).all(petitionId);
}

function vincular(petitionId, documentId) {
  const n = db.prepare('SELECT COUNT(*) n FROM petition_sources WHERE petition_id = ?').get(petitionId).n;
  db.prepare('INSERT OR IGNORE INTO petition_sources (petition_id, document_id, ordem) VALUES (?,?,?)')
    .run(petitionId, documentId, n);
}

// Anexa uma cópia (PDF/DOCX/TXT...) e extrai o texto NA HORA. Documento sem
// camada de texto (escaneado) é guardado do mesmo jeito e devolvido com
// ocr_pendente:true — a tela então oferece colar o texto.
async function anexarCopia(petitionId, d, autor) {
  const p = db.prepare('SELECT * FROM petition_requests WHERE id = ?').get(petitionId);
  if (!p) throw new Error('Peticionamento não encontrado.');
  const nome = s(d.nome_original, 200) || 'copia.pdf';
  const docId = repo.Documentos.criar({
    case_id: p.case_id || '', titulo: s(d.titulo, 300) || nome, tipo: TIPO_DOC_COPIA,
    pasta: 'copias-do-processo', sigilo: 'interno', status: 'arquivado',
    nome_original: nome, base64: d.base64, mime: d.mime,
  }, autor);
  vincular(petitionId, docId);
  const titulo = s(d.titulo, 300) || nome;
  try {
    const r = await extrairTexto(nome, Buffer.from(String(d.base64 || ''), 'base64'));
    const texto = s(r.texto, 2000000);
    if (!texto) throw Object.assign(new Error('Arquivo sem texto aproveitável.'), { ocrPendente: true });
    ia.registrarExtracao(docId, texto, r.metodo, autor);
    return { document_id: docId, titulo, paginas: r.paginas || 0, caracteres: texto.length, metodo: r.metodo };
  } catch (e) {
    repo.Integracoes.log('peticionar', 'extrair:' + nome, e.ocrPendente ? 'ok' : 'erro', e.message, 0);
    return {
      document_id: docId, titulo, caracteres: 0, ocr_pendente: !!e.ocrPendente,
      detalhe: e.ocrPendente
        ? 'Arquivo guardado, mas sem camada de texto (PDF escaneado). Cole o texto da cópia para ele virar contexto.'
        : 'Arquivo guardado, mas a extração falhou: ' + e.message,
    };
  }
}

// Texto colado à mão (cópia escaneada, trecho dos autos, peça da outra parte).
function anexarTexto(petitionId, d, autor) {
  const p = db.prepare('SELECT * FROM petition_requests WHERE id = ?').get(petitionId);
  if (!p) throw new Error('Peticionamento não encontrado.');
  const texto = s(d.texto, 2000000);
  if (texto.length < 20) throw new Error('Cole o texto da cópia (mínimo 20 caracteres).');
  const titulo = s(d.titulo, 300) || 'Trecho colado em ' + nowISO().slice(0, 10);
  const docId = repo.Documentos.criar({
    case_id: p.case_id || '', titulo, tipo: TIPO_DOC_COPIA, pasta: 'copias-do-processo',
    sigilo: 'interno', status: 'arquivado', nome_original: 'copia-colada.txt', mime: 'text/plain',
    base64: Buffer.from(texto, 'utf8').toString('base64'),
  }, autor);
  vincular(petitionId, docId);
  ia.registrarExtracao(docId, texto, 'colado', autor);
  return { document_id: docId, titulo, caracteres: texto.length, metodo: 'colado' };
}

// Tira do contexto (o documento continua arquivado no processo — não apaga prova).
function removerCopia(petitionId, documentId) {
  db.prepare('DELETE FROM petition_sources WHERE petition_id = ? AND document_id = ?').run(petitionId, documentId);
}

// -------------------------------------------------------------- CONTEXTO
// Monta o contexto de REDAÇÃO: dados informados + cópias na íntegra (até o
// teto) + andamentos/publicações quando há processo no sistema. Devolve as
// fontes, que ficam gravadas na versão da peça — rastreabilidade.
function contextoPeticao(petitionId, { teto = TETO_CTX } = {}) {
  const p = db.prepare('SELECT * FROM petition_requests WHERE id = ?').get(petitionId);
  if (!p) throw new Error('Peticionamento não encontrado.');
  const partes = [], fontes = [], usadas = [];

  let kase = null;
  if (p.case_id) kase = repo.Processos.obter(p.case_id, { comSigilo: false });
  const cabeca = kase
    ? `[PROCESSO NO SISTEMA] ${kase.numero_cnj || '(sem número)'} · ${kase.tribunal || ''} ${kase.classe || ''}`
      + `\nÓrgão julgador: ${kase.orgao_julgador || '(não informado)'}\nAssunto: ${kase.assunto || ''}`
      + `\nCliente: ${kase.cliente_nome || '(não informado)'} · polo ${kase.polo_cliente || '(não informado)'}`
      + `\nFase: ${kase.fase || '(não informada)'} · status ${kase.status} · valor da causa: R$ ${(kase.valor_causa / 100).toFixed(2)}`
    : '[PROCESSO NO SISTEMA] nenhum — peticionamento avulso; use apenas os dados informados e as cópias abaixo.';
  partes.push(cabeca);
  if (kase) fontes.push({ tipo: 'processo', ref_id: p.case_id, citacao: kase.numero_cnj || 'processo' });

  // montagem do contexto integral (peça compartilhada — ver contexto-integral.js)
  const bruto = copias(petitionId).map(c => {
    const row = c.caracteres ? db.prepare('SELECT texto FROM document_text_extractions WHERE document_id = ?').get(c.id) : null;
    return { id: c.id, titulo: c.titulo, texto: (row && row.texto) || '' };
  }).filter(x => x.texto);
  const mont = ctxIntegral.montar({ fontes: bruto, teto: teto - cabeca.length, rotulo: 'CÓPIA DOS AUTOS' });
  if (mont.texto) partes.push(mont.texto);
  for (const u of mont.usadas.filter(x => !x.fora)) usadas.push(u);
  for (const f of mont.fontes) fontes.push({ tipo: 'documento', ref_id: f.id, citacao: f.titulo });
  const aviso = ctxIntegral.avisoTruncamento(mont.usadas);
  if (aviso) partes.push(aviso.trim());

  if (kase) {
    const movs = (kase.movimentos || []).slice(0, 15);
    if (movs.length) partes.push('[ANDAMENTOS RECENTES]\n' + movs.map(m => `${m.data}: ${s(m.descricao, 400)}`).join('\n'));
    const pubs = db.prepare(`SELECT data_publicacao, orgao, texto FROM case_publications
      WHERE case_id = ? ORDER BY data_publicacao DESC LIMIT 5`).all(p.case_id);
    if (pubs.length) partes.push('[PUBLICAÇÕES]\n' + pubs.map(x => `${x.data_publicacao} (${x.orgao}): ${s(x.texto, 800)}`).join('\n'));
  }

  // ---- fontes jurídicas CONFERIDAS do próprio escritório ----------------
  const j = jurisprudenciaConferida(p);
  if (j.texto) { partes.push(j.texto); fontes.push(...j.fontes); }

  const texto = partes.join('\n\n---\n\n');
  return { texto, fontes, copias: usadas, caracteres: texto.length, juridicas: j.fontes.length };
}

// Só entra o que FOI CONFERIDO no inteiro teor oficial (research_findings
// verificado=1) e norma marcada como vigente. Hipótese NUNCA entra — é a
// trava 47.7 do livro: citar hipótese como precedente é o erro que destrói
// a credibilidade da peça. Doutrina/enunciado não vinculante vem rotulado.
function jurisprudenciaConferida(p) {
  const termos = [p.objetivo, p.tipo_peca, p.case_assunto].filter(Boolean).join(' ');
  const fontes = [], blocos = [];
  let achados = [], normas = [];
  try {
    achados = db.prepare(`SELECT identificacao, orgao, hierarquia, posicao, ementa, ratio_decidendi,
        distinguishing, fonte_url, data_julgamento, tipo
      FROM research_findings WHERE verificado = 1
      ORDER BY CASE hierarquia WHEN 'vinculante' THEN 0 WHEN 'persuasivo' THEN 1 ELSE 2 END,
        data_julgamento DESC LIMIT 12`).all();
    normas = db.prepare(`SELECT identificacao, tipo, ambito, artigos_chave, ementa, fonte_url
      FROM norms WHERE vigente = 1 ORDER BY conferida_em DESC LIMIT 12`).all();
  } catch (_) { return { texto: '', fontes: [] }; } // banco antigo sem as tabelas do livro
  if (!achados.length && !normas.length) return { texto: '', fontes: [] };

  if (achados.length) {
    blocos.push('[JURISPRUDÊNCIA CONFERIDA NO INTEIRO TEOR — pode citar]\n'
      + achados.map(a => {
        fontes.push({ tipo: 'jurisprudencia', ref_id: '', citacao: a.identificacao, url: a.fonte_url || '' });
        return `- ${a.identificacao}${a.orgao ? ' (' + a.orgao + ')' : ''} · ${a.hierarquia} · ${a.posicao} para nós`
          + (a.ratio_decidendi ? `\n  ratio: ${s(a.ratio_decidendi, 600)}` : (a.ementa ? `\n  ementa: ${s(a.ementa, 600)}` : ''))
          + (a.distinguishing ? `\n  distinguishing: ${s(a.distinguishing, 400)}` : '')
          + (a.fonte_url ? `\n  fonte: ${a.fonte_url}` : '');
      }).join('\n'));
  }
  if (normas.length) {
    blocos.push('[LEGISLAÇÃO COM VIGÊNCIA CONFERIDA — pode citar]\n'
      + normas.map(n => {
        fontes.push({ tipo: 'legislacao', ref_id: '', citacao: n.identificacao, url: n.fonte_url || '' });
        return `- ${n.identificacao} (${n.tipo}, ${n.ambito})${n.artigos_chave ? ` · artigos-chave: ${s(n.artigos_chave, 300)}` : ''}`
          + (n.fonte_url ? ` · ${n.fonte_url}` : '');
      }).join('\n'));
  }
  blocos.push('REGRA DE CITAÇÃO: os itens acima foram conferidos na fonte oficial por pessoa identificada — '
    + 'pode citar. Precedente ou norma que NÃO esteja nesta lista, você só cita se tiver certeza do teor; '
    + 'na dúvida, escreva "não localizado em fonte confiável" e registre em PONTOS DE ATENÇÃO. '
    + 'Confira sempre se o precedente citado é FAVORÁVEL ao polo que representamos'
    + (termos ? ` (tema: ${s(termos, 300)})` : '') + '.');
  return { texto: blocos.join('\n\n'), fontes };
}

// --------------------------------------------------------------- REDAÇÃO
function instrucao(p, ctxTexto, roteiro) {
  return `Redija a MINUTA de "${p.tipo_peca}" como faria um ADVOGADO SÊNIOR brasileiro: peça pronta para revisão do sócio, não um esboço.

DADOS DO PETICIONAMENTO
- Órgão / juízo endereçado: ${p.orgao || '[___]'}
- Número do processo: ${p.numero_processo || '[___]'}
- Parte representada: ${p.parte || '[___]'}${p.polo ? ` (polo ${p.polo})` : ''}
- Tipo de petição: ${p.tipo_peca}
- Objetivo / pedido do advogado: ${p.objetivo || '(não informado — extraia dos autos e declare o que assumiu)'}

COMO ESCREVER
1. Endereçamento correto ao órgão indicado, qualificação das partes e referência ao número do processo.
2. DOS FATOS: narre a partir das CÓPIAS DOS AUTOS abaixo, em ordem cronológica, citando folha/documento quando a cópia permitir. Não invente fato que não esteja nos autos.
3. DO DIREITO: fundamente com dispositivo legal EXATO (diploma, artigo, parágrafo/inciso). Jurisprudência só se você tiver certeza da existência e do teor — na dúvida escreva "não localizado em fonte confiável" e registre em PONTOS DE ATENÇÃO.
4. Enfrente as teses contrárias que os autos revelam, e não só a sua — peça sênior antecipa a resposta do adversário.
5. DOS PEDIDOS: numerados, específicos e executáveis (inclusive citação/intimação, produção de provas, custas e honorários quando cabíveis). Valor da causa quando o tipo de peça exigir.
6. Fecho com local, data, nome do advogado e OAB como placeholders [___]. NUNCA invente número de OAB, nome de advogado ou de magistrado.
7. Onde faltar informação, use [___] em vez de suposição — e liste cada lacuna em PONTOS DE ATENÇÃO.

${roteiro ? `ROTEIRO DO ESCRITÓRIO PARA ESTE TIPO DE PEÇA:\n${roteiro}\n\n` : ''}AUTOS E CONTEXTO INTERNO (a base factual: use isto, não a memória):
${ctxTexto || '(nenhuma cópia anexada — trabalhe só com os dados informados e marque as lacunas)'}

SAÍDA
Texto integral da peça em português forense, começando pelo carimbo "MINUTA — SUJEITA A REVISÃO DE ADVOGADO (OAB)".
Terminar com duas seções:
PONTOS DE ATENÇÃO: lista do que precisa de conferência humana, lacunas, riscos da tese e prazos a confirmar no sistema do tribunal.
FONTES: uma por linha, só o que foi efetivamente usado (dispositivo legal, documento dos autos, andamento).`;
}

// Cria a peça e manda redigir. Modo direto (ANTHROPIC_API_KEY) devolve a
// minuta na hora; sem chave, entra na fila do agente jurídico local pelo
// contrato que já existe (contexto.finalidade='gerar-peca').
async function gerar(petitionId, d, autor) {
  if (d && Object.keys(d).length) atualizar(petitionId, d); // salva o formulário antes de gerar
  const p = obter(petitionId);
  if (!Pecas.TIPOS_PECA.includes(p.tipo_peca)) throw new Error('Escolha o tipo de petição.');
  if (!p.orgao) throw new Error('Informe o órgão/juízo a que a petição é endereçada.');
  if (!p.parte) throw new Error('Informe o nome da parte representada.');
  if (!p.numero_processo && !p.case_id) throw new Error('Informe o número do processo (ou vincule um processo do sistema).');

  const ctx = contextoPeticao(petitionId);
  const esp = especialistaDe({ nucleo: p.nucleo, tipo_peca: p.tipo_peca, agente: p.agente });
  const roteiro = (db.prepare('SELECT conteudo FROM prompt_templates WHERE id = ?').get('elaboracao-' + p.tipo_peca)
    || db.prepare('SELECT conteudo FROM prompt_templates WHERE id = ?').get('peticao-senior') || {}).conteudo || '';

  const objetivo = [p.objetivo, `Órgão: ${p.orgao}`, `Processo: ${p.numero_processo || '—'}`,
    `Parte: ${p.parte}${p.polo ? ' (polo ' + p.polo + ')' : ''}`].filter(Boolean).join(' · ');
  const peca = Pecas.criar({ case_id: p.case_id, client_id: (p.case_id && (repo.Processos.obter(p.case_id, {}) || {}).client_id) || '', tipo_peca: p.tipo_peca, objetivo }, autor);
  db.prepare('UPDATE petition_requests SET draft_id=?, atualizado_em=? WHERE id=?').run(peca.id, nowISO(), petitionId);

  const marcar = (status, detalhe) => db.prepare('UPDATE petition_requests SET status=?, detalhe=?, atualizado_em=? WHERE id=?')
    .run(status, s(detalhe, 500), nowISO(), petitionId);

  if (!llm.ativo()) {
    const queryId = repo.IA.criarConsulta({
      // a instrução cabe nos 8000 do campo; as cópias vão pela rota de
      // pendentes (contexto_peticao), montadas na hora para o agente local.
      pergunta: instrucao(p, '(as cópias dos autos vêm no campo contexto_peticao desta consulta)', roteiro),
      agente: esp ? esp.id : 'processo-civil', case_id: p.case_id || '', client_id: '',
      contexto: { finalidade: 'gerar-peca', draft_id: peca.id, tipo_peca: p.tipo_peca, peticionar: true, petition_id: petitionId },
    }, autor);
    marcar('rascunho', 'Na fila do agente jurídico local (sem ANTHROPIC_API_KEY no servidor).');
    return {
      peticionamento_id: petitionId, draft_id: peca.id, situacao: 'pendente', query_id: queryId,
      tipo_peca: p.tipo_peca, especialista: esp ? esp.nome : '', copias_usadas: ctx.copias.length,
      detalhe: 'Sem ANTHROPIC_API_KEY no servidor: o pedido entrou na fila e o agente jurídico local devolve a minuta.',
    };
  }
  try {
    const r = await llm.executar({
      agenteId: esp ? esp.id : 'peticionar', queryId: '',
      systemExtra: esp ? esp.system_prompt : '', prompt: instrucao(p, ctx.texto, roteiro),
    });
    const v = Pecas.novaVersao(peca.id, {
      conteudo: r.texto, fontes: ctx.fontes,
      pontos_atencao: `Minuta redigida por IA (${esp ? esp.nome : 'geral'}, ${r.modelo}) a partir de ${ctx.copias.length} cópia(s) dos autos. `
        + 'Revisão integral por advogado é obrigatória: conferir os fatos contra os autos, os dispositivos citados e o prazo no sistema do tribunal.',
    }, 'ia:' + r.modelo, { viaIA: true });
    marcar('gerado', `${esp ? esp.nome : 'geral'} · ${r.modelo} · v${v.versao}`);
    return {
      peticionamento_id: petitionId, draft_id: peca.id, situacao: 'gerada', versao: v.versao, modelo: r.modelo,
      tipo_peca: p.tipo_peca, especialista: esp ? esp.nome : '', copias_usadas: ctx.copias.length,
    };
  } catch (e) {
    marcar('erro', e.message);
    throw e;
  }
}

// ---------------------------------------------------- CICLO DA PEÇA
// Refina a minuta existente com uma instrução do advogado ("reforce a
// preliminar de prescrição", "encurte os fatos"). Gera VERSÃO NOVA — nunca
// sobrescreve: o histórico da peça é rastreabilidade, não rascunho.
async function refinar(petitionId, d, autor) {
  const p = obter(petitionId);
  if (!p.draft_id) throw new Error('Ainda não há minuta para refinar — gere a peça primeiro.');
  const atual = Pecas.obter(p.draft_id);
  if (!atual || !atual.conteudo) throw new Error('A minuta ainda não tem conteúdo (pode estar na fila do agente local).');
  const pedido = s(d.instrucao, 4000);
  if (!pedido) throw new Error('Diga o que deve mudar na peça.');

  const esp = especialistaDe({ nucleo: p.nucleo, tipo_peca: p.tipo_peca, agente: p.agente });
  const ctx = contextoPeticao(petitionId);
  const prompt = `Você já redigiu a peça abaixo. O advogado responsável pediu um AJUSTE.

PEDIDO DO ADVOGADO:
${pedido}

REGRAS DO AJUSTE
1. Devolva a peça INTEIRA revisada, não só o trecho alterado.
2. Mude só o que o pedido exige — preserve o resto do texto, a estrutura e as citações que já estavam corretas.
3. Continue valendo tudo da redação original: fato só dos autos, dispositivo legal exato, nada de OAB/nome inventado, [___] onde faltar informação.
4. Se o pedido conflitar com os autos ou com a técnica processual, ATENDA o que for possível e registre a ressalva em PONTOS DE ATENÇÃO — não invente para agradar.

PEÇA ATUAL (v${atual.versao_atual}):
${atual.conteudo}

AUTOS E CONTEXTO INTERNO (a base factual continua sendo esta):
${ctx.texto}

SAÍDA: mesma forma de antes — carimbo MINUTA no topo, e ao final PONTOS DE ATENÇÃO e FONTES.`;

  if (!llm.ativo()) {
    const queryId = repo.IA.criarConsulta({
      pergunta: `AJUSTE da peça ${p.tipo_peca} (v${atual.versao_atual}). Pedido: ${pedido}\n(a peça atual e os autos vêm em contexto_peticao)`,
      agente: esp ? esp.id : 'processo-civil', case_id: p.case_id || '', client_id: '',
      contexto: { finalidade: 'gerar-peca', draft_id: p.draft_id, tipo_peca: p.tipo_peca, peticionar: true, petition_id: petitionId, refino: pedido },
    }, autor);
    return { situacao: 'pendente', query_id: queryId, draft_id: p.draft_id };
  }
  const r = await llm.executar({
    agenteId: esp ? esp.id : 'peticionar', queryId: '',
    systemExtra: esp ? esp.system_prompt : '', prompt,
  });
  const v = Pecas.novaVersao(p.draft_id, {
    conteudo: r.texto, fontes: ctx.fontes,
    pontos_atencao: `Versão ${atual.versao_atual + 1}: ajuste pedido pelo advogado — "${pedido.slice(0, 200)}". Revisão integral continua obrigatória.`,
  }, 'ia:' + r.modelo, { viaIA: true });
  db.prepare('UPDATE petition_requests SET detalhe=?, atualizado_em=? WHERE id=?')
    .run(`refinada para v${v.versao} (${r.modelo})`, nowISO(), petitionId);
  return { situacao: 'gerada', versao: v.versao, modelo: r.modelo, draft_id: p.draft_id };
}

// Arquiva a minuta como DOCUMENTO do processo (a peça continua em
// legal_drafts; isto é a cópia que fica na pasta do caso).
function anexarAoProcesso(petitionId, autor) {
  const p = obter(petitionId);
  if (!p.case_id) throw new Error('Peticionamento sem processo vinculado — vincule antes de arquivar no caso.');
  if (!p.draft_id) throw new Error('Ainda não há minuta para arquivar.');
  const peca = Pecas.obter(p.draft_id);
  if (!peca || !peca.conteudo) throw new Error('A minuta ainda não tem conteúdo.');
  const titulo = `${p.tipo_peca} — v${peca.versao_atual}${peca.status === 'aprovado' ? '' : ' (MINUTA)'}`;
  const docId = repo.Documentos.criar({
    case_id: p.case_id, titulo, tipo: 'peca', pasta: 'pecas', sigilo: 'interno',
    status: peca.status === 'aprovado' ? 'aprovado' : 'rascunho',
    nome_original: `${p.tipo_peca}-v${peca.versao_atual}.txt`, mime: 'text/plain',
    base64: Buffer.from(
      (peca.status === 'aprovado' ? '' : 'MINUTA — SUJEITA A REVISÃO DE ADVOGADO (OAB)\n\n') + peca.conteudo, 'utf8').toString('base64'),
  }, autor);
  return { document_id: docId, titulo };
}

// Abre o prazo de PROTOCOLO da peça. Nasce SEM validado_por de propósito:
// data de protocolo é prazo, e prazo neste sistema exige validação humana
// antes de avançar (mesma trava da calculadora).
function abrirPrazoProtocolo(petitionId, d, autor) {
  const p = obter(petitionId);
  if (!p.case_id) throw new Error('Peticionamento sem processo vinculado — o prazo precisa de um processo.');
  const dataFatal = s(d.data_fatal, 30);
  if (!dataFatal) throw new Error('Informe a data fatal do protocolo.');
  const z = repo.Prazos.criar({
    case_id: p.case_id, titulo: s(d.titulo, 300) || `Protocolar ${p.tipo_peca}`,
    tipo: 'fatal', data_fatal: dataFatal, data_interna: s(d.data_interna, 30),
    prioridade: d.prioridade || 'alta', responsavel: s(d.responsavel, 40),
    calculo_sugerido: `Prazo aberto pela guia Peticionar (peça ${p.draft_id || '—'}). Data informada pelo usuário: CONFERIR no sistema do tribunal.`,
    obs: `Peticionamento ${petitionId}${p.orgao ? ' · ' + p.orgao : ''}`,
  }, autor);
  return { prazo_id: z.id, data_fatal: z.data_fatal, validado_por: z.validado_por };
}

module.exports = {
  abrir, atualizar, obter, estado, anexarCopia, anexarTexto, removerCopia, copias,
  contextoPeticao, gerar, refinar, anexarAoProcesso, abrirPrazoProtocolo, especialistaDe, TIPO_DOC_COPIA,
};
