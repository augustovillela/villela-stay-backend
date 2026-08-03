// =====================================================================
// Villela Docs Intelligence — REDIGIR documento a partir da base.
//
// Mesma mecânica da guia Peticionar do Villela Legal, trazida para cá:
// o cliente ESCOLHE os documentos, o texto INTEGRAL deles vira o contexto
// e a IA redige o documento pedido.
//
// Por que não usar o chat de IA que já existe: `ia.perguntar` monta o
// contexto por TRECHOS (8 snippets do FTS/BM25). Isso responde pergunta
// muito bem e é insuficiente para REDIGIR — quem escreve um relatório, um
// aditivo ou uma comunicação precisa ler os documentos inteiros. A
// montagem do contexto integral (com orçamento e aviso de truncamento)
// mora em `../contexto-integral.js`, compartilhada com o jurídico.
//
// Guardrails: a minuta nasce como RASCUNHO (ai_drafts) e NUNCA vira
// documento oficial sozinha — quem promove é uma pessoa, pela tela de
// documentos. O texto sai carimbado e as fontes ficam gravadas.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const ia = require('./ia');
const ctxIntegral = require('../contexto-integral');

const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const TETO = parseInt(process.env.VDOCS_REDACAO_CTX_CHARS, 10) || 120000;

const TIPOS = [
  'relatorio', 'resumo-executivo', 'comunicado', 'e-mail', 'parecer-interno',
  'ata', 'procedimento', 'checklist', 'proposta', 'aditivo', 'notificacao', 'outro',
];

const CARIMBO = 'RASCUNHO GERADO POR IA — revisão humana obrigatória antes de qualquer uso oficial.';

// Documentos escolhidos, com o texto extraído que já existe na base.
function fontesDe(tenantId, ids) {
  const out = [];
  for (const id of (ids || []).slice(0, 40)) {
    const d = db.prepare("SELECT id, nome, tipo_documental FROM documents WHERE id = ? AND tenant_id = ? AND status = 'ativo'")
      .get(String(id), String(tenantId));
    if (!d) continue;
    const t = db.prepare('SELECT texto FROM document_texts WHERE tenant_id = ? AND document_id = ?').get(String(tenantId), d.id);
    if (!t || !t.texto) { out.push({ id: d.id, titulo: d.nome, texto: '', semTexto: true }); continue; }
    out.push({ id: d.id, titulo: d.nome + (d.tipo_documental ? ` (${d.tipo_documental})` : ''), texto: t.texto });
  }
  return out;
}

async function redigir(tenantId, user, d, ip) {
  if (!ia.ativo()) throw new Error('IA indisponível: o servidor está sem ANTHROPIC_API_KEY. Fale com o suporte da Villela Docs.');
  const instrucao = s(d.instrucao, 4000);
  if (!instrucao) throw new Error('Diga o que a IA deve redigir.');
  const tipo = TIPOS.includes(d.tipo) ? d.tipo : 'outro';
  const escolhidos = fontesDe(tenantId, d.documentos);
  const comTexto = escolhidos.filter(x => x.texto);
  if (!comTexto.length) {
    throw new Error(escolhidos.length
      ? 'Os documentos escolhidos ainda não têm texto extraído (podem estar em processamento ou serem digitalizações sem OCR).'
      : 'Escolha ao menos um documento da base para servir de contexto.');
  }
  repo.checarLimite(tenantId, 'ia_consultas', 1); // mesma cota do chat: é chamada de IA

  const mont = ctxIntegral.montar({ fontes: comTexto, teto: TETO, rotulo: 'DOCUMENTO DA EMPRESA' });
  const semTexto = escolhidos.filter(x => x.semTexto);
  const prompt = `Redija o documento pedido usando SOMENTE os documentos da empresa reproduzidos abaixo.

TIPO DE DOCUMENTO: ${tipo}
PEDIDO DE QUEM SOLICITOU:
${instrucao}

REGRAS
1. Use apenas o que está nos documentos abaixo. Não complete com conhecimento geral nem suponha número, data, nome ou valor.
2. Onde faltar informação, escreva [___] e liste a lacuna ao final — nunca invente para o texto ficar redondo.
3. Cite a origem entre parênteses quando afirmar algo relevante, pelo nome do documento.
4. Português do Brasil, tom profissional, pronto para uma pessoa revisar e assinar.
${semTexto.length ? `5. Estes documentos foram escolhidos mas estão SEM texto extraído e você NÃO os recebeu: ${semTexto.map(x => x.titulo).join('; ')}. Registre isso nas lacunas.\n` : ''}
DOCUMENTOS DA EMPRESA (íntegra):
${mont.texto}${ctxIntegral.avisoTruncamento(mont.usadas)}

SAÍDA
Comece pela linha "${CARIMBO}".
Depois o documento completo.
Termine com a seção "LACUNAS E PONTOS DE ATENÇÃO" listando o que precisa de conferência humana.`;

  const r = await ia.executar(tenantId, { prompt, schema: null });
  const conteudo = s(r.texto, 200000);
  const id = novoId();
  const fontes = mont.fontes.map(f => ({ document_id: f.id, nome: f.titulo }));
  const truncado = mont.usadas.some(u => u.truncado || u.fora) ? 1 : 0;
  db.prepare(`INSERT INTO ai_drafts (id, tenant_id, titulo, tipo, instrucao, conteudo, fontes, modelo, truncado, criado_por, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(tenantId), s(d.titulo, 200) || instrucao.slice(0, 80), tipo, instrucao, conteudo,
      j.str(fontes), r.modelo || '', truncado, String(user.id || ''), nowISO());
  repo.registrarUso(tenantId, 'ia_consultas', 1);
  repo.auditar(tenantId, user, 'ia.redigir', 'ai_drafts', id,
    { tipo, documentos: comTexto.length, truncado: !!truncado, chars: conteudo.length }, ip);
  return { rascunho: obter(tenantId, id) };
}

function listar(tenantId, { limite = 50 } = {}) {
  return db.prepare(`SELECT id, titulo, tipo, modelo, truncado, criado_por, criado_em,
      LENGTH(conteudo) AS caracteres FROM ai_drafts WHERE tenant_id = ?
    ORDER BY criado_em DESC LIMIT ?`).all(String(tenantId), Math.min(Number(limite) || 50, 200));
}

function obter(tenantId, id) {
  const r = db.prepare('SELECT * FROM ai_drafts WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!r) throw new Error('Rascunho não encontrado.');
  r.fontes = j.parse(r.fontes, []);
  return r;
}

function excluir(tenantId, id) {
  const r = db.prepare('DELETE FROM ai_drafts WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Rascunho não encontrado.');
  return true;
}

module.exports = { redigir, listar, obter, excluir, TIPOS, CARIMBO };
