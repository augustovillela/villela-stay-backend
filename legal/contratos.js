// =====================================================================
// Villela Legal Intelligence — CONTRATOS (Fase 4, Módulos 12+13).
//
// Módulo 13 (elaborador): biblioteca de modelos + cláusulas (obrigatórias
// e opcionais) com placeholders {{campo}}; o wizard responde os campos,
// escolhe cláusulas opcionais e gera uma MINUTA (legal_drafts, tipo
// 'contrato') — que segue o fluxo de revisão/aprovação das peças.
//
// Módulo 12 (análise): contract_reviews sobre um documento (tipo contrato)
// já com texto extraído; modo direto = llm com schema JSON; modo fila =
// o agente local devolve via PATCH /contratos/analises/:id.
//
// Migração do legado: contratos.json + DATA_DIR/contratos/* do portal
// antigo viram documents (tipo 'contrato') com o arquivo como v1 —
// idempotente via documents.legado_id.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { db, transacao, nowISO, novoId, sha256, j, DATA_DIR, DOCS_DIR } = require('./db');
const repo = require('./repo');
const llm = require('./llm');
const ia = require('./ia');
const { Pecas } = require('./pecas');

const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const fk = (v) => { const x = s(v, 40); return x === '' ? null : x; };

// ---------------------------------------------------------------------
// SEED de modelos (versionado no código; upsert no boot). Placeholders
// {{campo}} casam com template.campos. Cláusulas opcionais = checkbox.
// ---------------------------------------------------------------------
const CAMPOS_PARTES = [
  { id: 'contratante', rotulo: 'Contratante (nome/razão social)', tipo: 'text', obrigatorio: true },
  { id: 'contratante_doc', rotulo: 'CPF/CNPJ do contratante', tipo: 'text', obrigatorio: true },
  { id: 'contratado', rotulo: 'Contratado (nome/razão social)', tipo: 'text', obrigatorio: true },
  { id: 'contratado_doc', rotulo: 'CPF/CNPJ do contratado', tipo: 'text', obrigatorio: true },
];
const TEMPLATES = [
  {
    id: 'prestacao-servicos', nome: 'Prestação de serviços', descricao: 'Contrato de prestação de serviços entre PF/PJ.',
    campos: [...CAMPOS_PARTES,
      { id: 'objeto', rotulo: 'Objeto (descrição do serviço)', tipo: 'text', obrigatorio: true },
      { id: 'valor', rotulo: 'Valor (R$)', tipo: 'text', obrigatorio: true },
      { id: 'forma_pagamento', rotulo: 'Forma de pagamento', tipo: 'text', obrigatorio: true },
      { id: 'prazo', rotulo: 'Prazo de execução/vigência', tipo: 'text', obrigatorio: true },
      { id: 'foro', rotulo: 'Foro (comarca)', tipo: 'text', obrigatorio: true }],
    clausulas: [
      ['Qualificação e objeto', 'CONTRATANTE: {{contratante}}, CPF/CNPJ {{contratante_doc}}. CONTRATADO: {{contratado}}, CPF/CNPJ {{contratado_doc}}.\nCLÁUSULA 1ª — DO OBJETO. O presente contrato tem por objeto {{objeto}}, a ser executado pelo CONTRATADO com autonomia técnica, sem vínculo empregatício (art. 593 e ss. do CC).', 1],
      ['Preço e pagamento', 'CLÁUSULA 2ª — DO PREÇO. Pelos serviços, o CONTRATANTE pagará R$ {{valor}}, na forma: {{forma_pagamento}}. O atraso sujeita o devedor a multa de 2%, juros de 1% a.m. e correção monetária.', 1],
      ['Prazo e vigência', 'CLÁUSULA 3ª — DO PRAZO. Os serviços serão prestados no prazo/vigência de {{prazo}}, prorrogável por acordo escrito entre as partes.', 1],
      ['Obrigações das partes', 'CLÁUSULA 4ª — DAS OBRIGAÇÕES. Incumbe ao CONTRATADO executar os serviços com diligência e informar impedimentos; ao CONTRATANTE, fornecer as informações necessárias e efetuar os pagamentos no vencimento.', 1],
      ['Rescisão', 'CLÁUSULA 5ª — DA RESCISÃO. O contrato pode ser resilido por qualquer parte mediante aviso prévio de 30 (trinta) dias, sem prejuízo das parcelas vencidas; o inadimplemento autoriza a resolução com multa de 10% sobre o saldo.', 1],
      ['Confidencialidade', 'CLÁUSULA — CONFIDENCIALIDADE. As partes manterão sigilo sobre informações não públicas conhecidas em razão deste contrato, por sua vigência e por 2 (dois) anos após o término.', 0],
      ['Proteção de dados (LGPD)', 'CLÁUSULA — LGPD. As partes tratarão dados pessoais na estrita medida necessária à execução deste contrato, em conformidade com a Lei 13.709/2018, respondendo cada qual pelos incidentes a que der causa.', 0],
      ['Foro', 'CLÁUSULA FINAL — DO FORO. Fica eleito o foro da comarca de {{foro}} para dirimir controvérsias oriundas deste contrato.\n\nE por estarem justas e contratadas, firmam o presente em 2 (duas) vias.\n\n[LOCAL], [DATA].\n\n_______________________\n{{contratante}}\n\n_______________________\n{{contratado}}', 1],
    ],
  },
  {
    id: 'nda', nome: 'Confidencialidade (NDA)', descricao: 'Acordo de confidencialidade bilateral.',
    campos: [...CAMPOS_PARTES,
      { id: 'finalidade', rotulo: 'Finalidade da troca de informações', tipo: 'text', obrigatorio: true },
      { id: 'vigencia_anos', rotulo: 'Vigência do sigilo (anos)', tipo: 'text', obrigatorio: true },
      { id: 'foro', rotulo: 'Foro (comarca)', tipo: 'text', obrigatorio: true }],
    clausulas: [
      ['Partes e finalidade', 'PARTES: {{contratante}} ({{contratante_doc}}) e {{contratado}} ({{contratado_doc}}).\nCLÁUSULA 1ª — As partes trocarão informações confidenciais com a finalidade de {{finalidade}}.', 1],
      ['Definição e sigilo', 'CLÁUSULA 2ª — Considera-se confidencial toda informação não pública, técnica ou comercial, revelada por qualquer meio. A parte receptora obriga-se a não divulgar, reproduzir ou usar a informação fora da finalidade, respondendo por perdas e danos.', 1],
      ['Exceções', 'CLÁUSULA 3ª — Não são confidenciais informações: (i) públicas sem culpa da receptora; (ii) já conhecidas licitamente; (iii) desenvolvidas de forma independente; (iv) cuja revelação decorra de ordem judicial — hipótese em que a reveladora será avisada de imediato.', 1],
      ['Vigência', 'CLÁUSULA 4ª — O dever de sigilo vigora por {{vigencia_anos}} ano(s) contado(s) da assinatura, subsistindo ao término de eventual relação principal.', 1],
      ['Foro', 'CLÁUSULA 5ª — Fica eleito o foro da comarca de {{foro}}.\n\n[LOCAL], [DATA].\n\n_______________________\n{{contratante}}\n\n_______________________\n{{contratado}}', 1],
    ],
  },
  {
    id: 'honorarios', nome: 'Honorários advocatícios', descricao: 'Contrato de honorários entre advogado/escritório e cliente.',
    campos: [
      { id: 'cliente', rotulo: 'Cliente (nome)', tipo: 'text', obrigatorio: true },
      { id: 'cliente_doc', rotulo: 'CPF/CNPJ do cliente', tipo: 'text', obrigatorio: true },
      { id: 'advogado', rotulo: 'Advogado/escritório', tipo: 'text', obrigatorio: true },
      { id: 'oab', rotulo: 'OAB', tipo: 'text', obrigatorio: true },
      { id: 'objeto', rotulo: 'Objeto (causa/serviço jurídico)', tipo: 'text', obrigatorio: true },
      { id: 'honorarios_fixos', rotulo: 'Honorários fixos (R$)', tipo: 'text', obrigatorio: true },
      { id: 'exito_percentual', rotulo: 'Êxito (%) sobre proveito econômico', tipo: 'text', obrigatorio: false },
      { id: 'foro', rotulo: 'Foro (comarca)', tipo: 'text', obrigatorio: true }],
    clausulas: [
      ['Partes e objeto', 'CONTRATANTE: {{cliente}}, CPF/CNPJ {{cliente_doc}}. CONTRATADO: {{advogado}}, OAB {{oab}}.\nCLÁUSULA 1ª — O CONTRATADO prestará os serviços jurídicos de {{objeto}}, com zelo e observância do Código de Ética e Disciplina da OAB.', 1],
      ['Honorários', 'CLÁUSULA 2ª — Honorários contratuais de R$ {{honorarios_fixos}}. Os honorários de sucumbência pertencem ao advogado (art. 23 da Lei 8.906/94) e não se compensam com os contratuais.', 1],
      ['Honorários de êxito', 'CLÁUSULA — ÊXITO. Além dos fixos, o CONTRATANTE pagará {{exito_percentual}}% sobre o proveito econômico obtido, exigíveis quando do efetivo recebimento.', 0],
      ['Despesas', 'CLÁUSULA 3ª — Custas, emolumentos, perícias e despesas de deslocamento correm por conta do CONTRATANTE, mediante prestação de contas.', 1],
      ['Revogação e rescisão', 'CLÁUSULA 4ª — Revogado o mandato sem justa causa, serão devidos os honorários proporcionais ao trabalho realizado; a renúncia do CONTRATADO observará o art. 5º, §3º, do EAOAB.', 1],
      ['Foro', 'CLÁUSULA 5ª — Foro da comarca de {{foro}}.\n\n[LOCAL], [DATA].\n\n_______________________\nCONTRATANTE\n\n_______________________\nCONTRATADO', 1],
    ],
  },
  {
    id: 'hospedagem-temporada', nome: 'Hospedagem / locação por temporada', descricao: 'Locação por temporada (Lei 8.245/91, arts. 48-50) — padrão Villela Stay.',
    campos: [
      { id: 'locador', rotulo: 'Locador', tipo: 'text', obrigatorio: true },
      { id: 'locatario', rotulo: 'Locatário (hóspede)', tipo: 'text', obrigatorio: true },
      { id: 'locatario_doc', rotulo: 'CPF do locatário', tipo: 'text', obrigatorio: true },
      { id: 'imovel', rotulo: 'Imóvel (endereço/identificação)', tipo: 'text', obrigatorio: true },
      { id: 'checkin', rotulo: 'Check-in (data)', tipo: 'date', obrigatorio: true },
      { id: 'checkout', rotulo: 'Check-out (data)', tipo: 'date', obrigatorio: true },
      { id: 'valor_total', rotulo: 'Valor total (R$)', tipo: 'text', obrigatorio: true },
      { id: 'ocupantes', rotulo: 'Nº máximo de ocupantes', tipo: 'text', obrigatorio: true }],
    clausulas: [
      ['Partes e objeto', 'LOCADOR: {{locador}}. LOCATÁRIO: {{locatario}}, CPF {{locatario_doc}}.\nCLÁUSULA 1ª — Locação POR TEMPORADA (arts. 48 a 50 da Lei 8.245/91) do imóvel {{imovel}}, para residência temporária, de {{checkin}} a {{checkout}} (prazo inferior a 90 dias).', 1],
      ['Valor e pagamento antecipado', 'CLÁUSULA 2ª — Aluguel e encargos de R$ {{valor_total}}, pagos ANTECIPADAMENTE (art. 49 da Lei 8.245/91), de uma só vez.', 1],
      ['Ocupação e uso', 'CLÁUSULA 3ª — Ocupação máxima de {{ocupantes}} pessoa(s). É vedado sublocar, ceder, realizar eventos não contratados ou alterar a destinação residencial temporária.', 1],
      ['Devolução', 'CLÁUSULA 4ª — Findo o prazo, o LOCATÁRIO restituirá o imóvel no estado em que o recebeu. Não desocupado o imóvel em 30 dias após o término, cabe despejo liminar (art. 59, §1º, da Lei 8.245/91).', 1],
      ['Danos e inventário', 'CLÁUSULA — DANOS. O imóvel é entregue conforme inventário/fotos anexos; danos apurados no check-out serão indenizados pelo LOCATÁRIO.', 0],
      ['Foro', 'CLÁUSULA FINAL — Foro de Brasília-DF.\n\n[LOCAL], [DATA].\n\n_______________________\nLOCADOR\n\n_______________________\nLOCATÁRIO', 1],
    ],
  },
];

function semearTemplates() {
  const agora = nowISO();
  const upT = db.prepare(`INSERT INTO contract_templates (id, nome, descricao, campos, versao, ativo, atualizado_em)
    VALUES (?,?,?,?,1,1,?) ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao,
    campos=excluded.campos, atualizado_em=excluded.atualizado_em`);
  const delC = db.prepare('DELETE FROM contract_template_clauses WHERE template_id = ?');
  const insC = db.prepare('INSERT INTO contract_template_clauses (id, template_id, ordem, titulo, texto, obrigatoria, alternativa_de) VALUES (?,?,?,?,?,?,?)');
  for (const t of TEMPLATES) {
    upT.run(t.id, t.nome, t.descricao, j.str(t.campos), agora);
    delC.run(t.id); // o código é a fonte da verdade das cláusulas seed
    t.clausulas.forEach(([titulo, texto, obrig], i) => insC.run(t.id + ':' + i, t.id, i, titulo, texto, obrig ? 1 : 0, ''));
  }
}

const Templates = {
  listar() {
    return db.prepare('SELECT * FROM contract_templates WHERE ativo = 1 ORDER BY nome').all()
      .map(t => ({ ...t, campos: j.parse(t.campos, []), clausulas: db.prepare('SELECT * FROM contract_template_clauses WHERE template_id = ? ORDER BY ordem').all(t.id) }));
  },
  obter(id) {
    const t = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND ativo = 1').get(String(id || ''));
    if (!t) return null;
    t.campos = j.parse(t.campos, []);
    t.clausulas = db.prepare('SELECT * FROM contract_template_clauses WHERE template_id = ? ORDER BY ordem').all(t.id);
    return t;
  },
};

// ---------------------------------------------------------------------
// WIZARD (Módulo 13): respostas + cláusulas escolhidas → minuta (draft)
// ---------------------------------------------------------------------
function gerarContrato({ template_id, respostas = {}, clausulas_opcionais = [], case_id, client_id }, autor) {
  const t = Templates.obter(template_id);
  if (!t) throw new Error('Modelo de contrato não encontrado.');
  const faltando = t.campos.filter(c => c.obrigatorio && !s(respostas[c.id], 300)).map(c => c.rotulo);
  const escolhidas = t.clausulas.filter(c => c.obrigatoria || clausulas_opcionais.includes(c.id));
  const corpo = escolhidas.map(c => {
    let x = c.texto;
    for (const campo of t.campos) {
      const valor = s(respostas[campo.id], 300);
      x = x.split('{{' + campo.id + '}}').join(valor || '[___]'); // faltante vira placeholder
    }
    return x;
  }).join('\n\n');
  const texto = `MINUTA — ${t.nome.toUpperCase()}\n\n${corpo}`
    + (faltando.length ? `\n\nPONTOS DE ATENÇÃO:\n- Preencher: ${faltando.join('; ')}\n- Revisar valores, datas e qualificação completa das partes.` : '\n\nPONTOS DE ATENÇÃO:\n- Revisar valores, datas e qualificação completa das partes.');

  return transacao(() => {
    const draft = Pecas.criar({ tipo_peca: 'contrato', objetivo: t.nome, case_id, client_id }, autor);
    const v = Pecas.novaVersao(draft.id, { conteudo: texto, fontes: [], pontos_atencao: faltando.length ? 'Campos pendentes: ' + faltando.join('; ') : '' }, autor);
    db.prepare('INSERT INTO contract_generation_sessions (id, template_id, respostas, clausulas, draft_id, criado_por, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), t.id, j.str(respostas), j.str(escolhidas.map(c => c.id)), draft.id, s(autor, 40), nowISO());
    return { draft_id: draft.id, versao: v.versao, campos_pendentes: faltando };
  });
}

// ---------------------------------------------------------------------
// ANÁLISE (Módulo 12): contract_reviews sobre documento com texto extraído
// ---------------------------------------------------------------------
const SCHEMA_ANALISE = {
  type: 'object',
  properties: {
    partes: { type: 'array', items: { type: 'string' } },
    objeto: { type: 'string' },
    vigencia: { type: 'string' },
    valores: { type: 'string' },
    clausulas_criticas: {
      type: 'array',
      items: { type: 'object', properties: { clausula: { type: 'string' }, risco: { type: 'string' }, sugestao: { type: 'string' } }, required: ['clausula', 'risco', 'sugestao'], additionalProperties: false },
    },
    clausulas_faltantes: { type: 'array', items: { type: 'string' } },
    riscos_gerais: { type: 'string' },
    nota_risco: { type: 'string', enum: ['baixo', 'medio', 'alto'] },
  },
  required: ['partes', 'objeto', 'vigencia', 'valores', 'clausulas_criticas', 'clausulas_faltantes', 'riscos_gerais', 'nota_risco'],
  additionalProperties: false,
};

const Analises = {
  listar({ limite = 100 } = {}) {
    return db.prepare(`SELECT r.*, d.titulo AS documento_titulo FROM contract_reviews r
      LEFT JOIN documents d ON d.id = r.document_id ORDER BY r.atualizado_em DESC LIMIT ?`)
      .all(Math.min(Number(limite) || 100, 300))
      .map(r => ({ ...r, analise: j.parse(r.analise_json, null) }));
  },
  obter(id) {
    const r = db.prepare(`SELECT r.*, d.titulo AS documento_titulo FROM contract_reviews r
      LEFT JOIN documents d ON d.id = r.document_id WHERE r.id = ?`).get(id);
    if (r) r.analise = j.parse(r.analise_json, null);
    return r;
  },
  // cria a análise; modo direto roda a IA na hora, senão fica pendente p/ o agente local
  async criar({ document_id, tipo_contrato = '' }, autor) {
    const doc = db.prepare('SELECT id, titulo, client_id FROM documents WHERE id = ?').get(String(document_id || ''));
    if (!doc) throw new Error('Documento não encontrado.');
    const ext = db.prepare('SELECT texto FROM document_text_extractions WHERE document_id = ?').get(doc.id);
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO contract_reviews (id, document_id, client_id, tipo_contrato, partes, resumo, riscos, lacunas,
      sugestoes, status, revisado_por, criado_por, criado_em, atualizado_em, analise_json)
      VALUES (?,?,?,?,?,'','','','','rascunho','',?,?,?,'')`)
      .run(id, doc.id, doc.client_id, s(tipo_contrato, 60), '', s(autor, 40), agora, agora);

    if (!ext || !ext.texto) {
      return { review_id: id, situacao: 'pendente', detalhe: 'Documento sem texto extraído — o agente local deve extrair (POST /ia/extracao) e devolver a análise (PATCH /contratos/analises/' + id + ').' };
    }
    if (!llm.ativo()) {
      repo.IA.criarConsulta({
        pergunta: 'Analisar o contrato conforme o prompt analise-contrato.', agente: 'contratual',
        client_id: doc.client_id, contexto: { finalidade: 'analise-contrato', review_id: id, document_id: doc.id },
      }, autor);
      return { review_id: id, situacao: 'pendente', detalhe: 'Sem ANTHROPIC_API_KEY — análise na fila; o agente local devolve via PATCH /contratos/analises/' + id + '.' };
    }
    const tpl = db.prepare('SELECT conteudo FROM prompt_templates WHERE id = ?').get('analise-contrato');
    const r = await llm.executar({
      agenteId: 'contratual', queryId: '',
      systemExtra: (db.prepare('SELECT system_prompt FROM ai_agents WHERE id = ?').get('contratual') || {}).system_prompt || '',
      prompt: `${tpl ? tpl.conteudo + '\n\n' : ''}CONTRATO A ANALISAR:\n${ext.texto.slice(0, 150000)}`,
      schema: SCHEMA_ANALISE,
    });
    Analises.registrarResultado(id, r.json, 'ia:' + r.modelo);
    return { review_id: id, situacao: 'analisada', modelo: r.modelo };
  },
  // grava o resultado estruturado (vindo da IA direta OU do agente local)
  registrarResultado(id, analise, quem) {
    const r = db.prepare('SELECT id FROM contract_reviews WHERE id = ?').get(id);
    if (!r) throw new Error('Análise não encontrada.');
    const a = analise || {};
    db.prepare(`UPDATE contract_reviews SET partes=?, resumo=?, riscos=?, lacunas=?, sugestoes=?, analise_json=?,
      status='revisao_pendente', atualizado_em=? WHERE id=?`)
      .run(s((a.partes || []).join('; '), 500), s(a.objeto, 2000), s(a.riscos_gerais, 4000),
        s((a.clausulas_faltantes || []).join('; '), 2000),
        s((a.clausulas_criticas || []).map(c => `${c.clausula}: ${c.sugestao}`).join(' | '), 4000),
        j.str(a), nowISO(), id);
    return Analises.obter(id);
  },
  revisar(id, { status }, revisor) {
    const ok = ['rascunho', 'revisao_pendente', 'aprovado', 'arquivado'];
    if (!ok.includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE contract_reviews SET status=?, revisado_por=?, atualizado_em=? WHERE id=?')
      .run(status, status === 'aprovado' ? s(revisor, 120) : '', nowISO(), id);
    return Analises.obter(id);
  },
};

// ---------------------------------------------------------------------
// MIGRAÇÃO DO LEGADO: contratos.json (+ arquivos) → documents tipo contrato
// ---------------------------------------------------------------------
function importarContratosLegado(autor) {
  const f = path.join(DATA_DIR, 'contratos.json');
  if (!fs.existsSync(f)) return { encontrados: 0, importados: 0, pulados: 0, detalhe: 'contratos.json não existe neste DATA_DIR.' };
  let legado = [];
  try { legado = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error('contratos.json inválido: ' + e.message); }
  if (!Array.isArray(legado)) legado = [];
  const dirLegado = path.join(DATA_DIR, 'contratos');
  let importados = 0, pulados = 0, semArquivo = 0;
  for (const c of legado) {
    if (db.prepare('SELECT id FROM documents WHERE legado_id = ?').get('contrato:' + c.id)) { pulados++; continue; }
    const titulo = `Contrato ${c.tipo || 'hospedagem'} — ${c.hospede || 'sem nome'}${c.imovel ? ' (' + c.imovel + ')' : ''}`;
    transacao(() => {
      const id = novoId(); const agora = nowISO();
      db.prepare(`INSERT INTO documents (id, client_id, case_id, task_id, titulo, tipo, pasta, sigilo, status, versao_atual,
        criado_por, criado_em, atualizado_em, legado_id) VALUES (?,NULL,NULL,'',?,?,?,?,?,1,?,?,?,?)`)
        .run(id, titulo, 'contrato', 'legado-contratos', 'restrito', c.assinado ? 'aprovado' : 'rascunho',
          s(autor, 40), c.criadoEm || agora, agora, 'contrato:' + c.id);
      if (c.arquivo && fs.existsSync(path.join(dirLegado, path.basename(c.arquivo)))) {
        const buf = fs.readFileSync(path.join(dirLegado, path.basename(c.arquivo)));
        const ext = path.extname(c.arquivo).toLowerCase() || '.pdf';
        const arquivo = id + '-v1' + ext;
        fs.writeFileSync(path.join(DOCS_DIR, arquivo), buf);
        db.prepare(`INSERT INTO document_versions (id, document_id, versao, arquivo, nome_original, mime, tamanho, sha256, motivo, criado_por, criado_em)
          VALUES (?,?,1,?,?,?,?,?,?,?,?)`)
          .run(novoId(), id, arquivo, c.nomeArquivo || c.arquivo, '', buf.length, sha256(buf), 'importado do portal antigo', s(autor, 40), nowISO());
      } else if (c.arquivo) { semArquivo++; }
    });
    importados++;
  }
  return { encontrados: legado.length, importados, pulados, arquivos_ausentes: semArquivo };
}

module.exports = { semearTemplates, Templates, gerarContrato, Analises, importarContratosLegado, SCHEMA_ANALISE };
