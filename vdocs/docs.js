// =====================================================================
// Villela Docs Intelligence — Fase 2: pastas, documentos, versões,
// metadados, lixeira e download seguro.
//
// SEGURANÇA DO STORAGE: arquivos ficam em STORAGE_DIR/<tenant>/<doc>/
// com nome interno gerado (nunca o nome do upload); o caminho gravado é
// relativo e validado antes de ler; download SEMPRE por rota autenticada
// com Content-Disposition: attachment + nosniff (nunca URL pública).
// Toda visualização/baixa vira linha em document_access_logs (LGPD).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { db, transacao, nowISO, novoId, sha256, j, STORAGE_DIR } = require('./db');
const repo = require('./repo');
const jobs = require('./jobs');

const s = repo.s;
const MB = 1024 * 1024;
const MAX_ARQUIVO_MB = 20;

// Extensões aceitas (lista fechada — o resto é recusado) e MIME de saída seguro.
const EXTENSOES = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain', csv: 'text/csv', md: 'text/plain', rtf: 'application/rtf', json: 'application/json', xml: 'text/xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', mov: 'video/quicktime',
  zip: 'application/zip',
};
// Estes tipos podem executar script se abertos inline — força download octet-stream.
const SEM_INLINE = new Set(['svg', 'html', 'htm', 'xml', 'json', 'zip']);

const TIPOS_DOCUMENTAIS = ['contrato', 'nota_fiscal', 'recibo', 'proposta', 'politica_interna', 'rh', 'juridico', 'financeiro', 'administrativo', 'projeto', 'outro'];

function extDe(nome) {
  const m = String(nome || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1] : '';
}

// ------------------------------------------------------------ pastas
function listarPastas(tenantId) {
  return db.prepare('SELECT * FROM folders WHERE tenant_id = ? ORDER BY nome').all(String(tenantId));
}
function obterPasta(tenantId, id) {
  if (!id) return null; // raiz
  const p = db.prepare('SELECT * FROM folders WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!p) throw new Error('Pasta não encontrada.');
  return p;
}
function criarPasta(tenantId, { nome, parent_id }, ator, ip) {
  if (!s(nome, 120)) throw new Error('Informe o nome da pasta.');
  if (parent_id) obterPasta(tenantId, parent_id); // valida que o pai é do tenant
  const id = novoId();
  db.prepare('INSERT INTO folders (id, tenant_id, parent_id, nome, criado_em, criado_por) VALUES (?,?,?,?,?,?)')
    .run(id, String(tenantId), s(parent_id, 40), s(nome, 120), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'pasta.criar', 'folders', id, { nome: s(nome, 120) }, ip);
  return id;
}
function renomearPasta(tenantId, id, nome, ator, ip) {
  obterPasta(tenantId, id);
  if (!s(nome, 120)) throw new Error('Informe o nome.');
  db.prepare('UPDATE folders SET nome = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?')
    .run(s(nome, 120), nowISO(), String(id), String(tenantId));
  repo.auditar(tenantId, ator, 'pasta.renomear', 'folders', String(id), { nome: s(nome, 120) }, ip);
}
function moverPasta(tenantId, id, novoPaiId, ator, ip) {
  obterPasta(tenantId, id);
  if (novoPaiId) {
    obterPasta(tenantId, novoPaiId);
    // anti-ciclo: sobe a cadeia do novo pai; se encontrar a própria pasta, recusa
    let cursor = String(novoPaiId);
    while (cursor) {
      if (cursor === String(id)) throw new Error('Não dá para mover uma pasta para dentro dela mesma.');
      const p = db.prepare('SELECT parent_id FROM folders WHERE id = ? AND tenant_id = ?').get(cursor, String(tenantId));
      cursor = p ? p.parent_id : '';
    }
  }
  db.prepare('UPDATE folders SET parent_id = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?')
    .run(s(novoPaiId, 40), nowISO(), String(id), String(tenantId));
  repo.auditar(tenantId, ator, 'pasta.mover', 'folders', String(id), { para: s(novoPaiId, 40) }, ip);
}
function excluirPasta(tenantId, id, ator, ip) {
  obterPasta(tenantId, id);
  const filhos = db.prepare('SELECT COUNT(*) n FROM folders WHERE tenant_id = ? AND parent_id = ?').get(String(tenantId), String(id)).n;
  const docs = db.prepare("SELECT COUNT(*) n FROM documents WHERE tenant_id = ? AND folder_id = ? AND status = 'ativo'").get(String(tenantId), String(id)).n;
  if (filhos || docs) throw new Error('A pasta precisa estar vazia (mova ou exclua o conteúdo antes).');
  db.prepare('DELETE FROM folders WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  repo.auditar(tenantId, ator, 'pasta.excluir', 'folders', String(id), {}, ip);
}

// ------------------------------------------------------------ storage interno
function gravarArquivo(tenantId, docId, numero, buffer, ext) {
  const dir = path.join(STORAGE_DIR, String(tenantId), String(docId));
  fs.mkdirSync(dir, { recursive: true });
  const rel = path.join(String(tenantId), String(docId), `v${numero}_${novoId()}${ext ? '.' + ext : ''}`);
  fs.writeFileSync(path.join(STORAGE_DIR, rel), buffer);
  return rel.split(path.sep).join('/'); // normaliza p/ portátil
}
function lerArquivo(relPath) {
  const abs = path.resolve(STORAGE_DIR, String(relPath || ''));
  if (!abs.startsWith(path.resolve(STORAGE_DIR) + path.sep)) throw new Error('Caminho inválido.'); // anti path-traversal
  return fs.readFileSync(abs);
}

function validarUpload(nomeArquivo, buffer) {
  const ext = extDe(nomeArquivo);
  if (!ext || !EXTENSOES[ext]) throw new Error(`Tipo de arquivo não permitido${ext ? ` (.${ext})` : ''}. Aceitos: ${Object.keys(EXTENSOES).join(', ')}.`);
  if (!buffer || !buffer.length) throw new Error('Arquivo vazio.');
  if (buffer.length > MAX_ARQUIVO_MB * MB) throw new Error(`Arquivo maior que ${MAX_ARQUIVO_MB} MB.`);
  return ext;
}

// ------------------------------------------------------------ documentos
function criarDocumento(tenantId, { nome, folder_id, descricao, tipo_documental, tags, validade, arquivo_nome, conteudo_base64, forcar_duplicado }, ator, ip) {
  const buffer = Buffer.from(String(conteudo_base64 || ''), 'base64');
  const ext = validarUpload(arquivo_nome, buffer);
  if (folder_id) obterPasta(tenantId, folder_id);
  const hash = sha256(buffer);
  // dedupe por conteúdo dentro do tenant (a menos que o usuário insista)
  if (!forcar_duplicado) {
    const dup = db.prepare(`SELECT d.id, d.nome FROM document_versions v JOIN documents d ON d.id = v.document_id
      WHERE v.tenant_id = ? AND v.sha256 = ? AND d.status = 'ativo' LIMIT 1`).get(String(tenantId), hash);
    if (dup) { const e = new Error(`Arquivo idêntico já existe: "${dup.nome}". Envie de novo com "forçar" para duplicar.`); e.duplicado = dup; throw e; }
  }
  repo.checarLimite(tenantId, 'documentos', 1);
  repo.checarLimite(tenantId, 'armazenamento_mb', Math.ceil(buffer.length / MB));
  return transacao(() => {
    const id = novoId();
    const agora = nowISO();
    const rel = gravarArquivo(tenantId, id, 1, buffer, ext);
    db.prepare(`INSERT INTO documents (id, tenant_id, folder_id, nome, descricao, tipo_documental, tags, status, versao_atual, validade, criado_em, criado_por)
      VALUES (?,?,?,?,?,?,?,'ativo',1,?,?,?)`)
      .run(id, String(tenantId), s(folder_id, 40), s(nome || arquivo_nome, 200), s(descricao, 500),
        TIPOS_DOCUMENTAIS.includes(tipo_documental) ? tipo_documental : 'outro',
        j.str(Array.isArray(tags) ? tags.map(t => s(t, 40)).filter(Boolean).slice(0, 20) : []),
        s(validade, 10), agora, s(ator && ator.id, 40));
    db.prepare(`INSERT INTO document_versions (id, tenant_id, document_id, numero, nome_arquivo, mime, tamanho, sha256, file_path, criado_em, criado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(novoId(), String(tenantId), id, 1, s(arquivo_nome, 200), EXTENSOES[ext], buffer.length, hash, rel, agora, s(ator && ator.id, 40));
    repo.auditar(tenantId, ator, 'documento.criar', 'documents', id, { nome: s(nome || arquivo_nome, 200), tamanho: buffer.length }, ip);
    jobs.enfileirarExtracao(tenantId, id, 1); // extração/indexação em background (Fase 3)
    require('./api-publica').emitir(tenantId, 'documento.criado', { document_id: id, nome: s(nome || arquivo_nome, 200), folder_id: s(folder_id, 40) });
    return obterDocumento(tenantId, id);
  });
}

function obterDocumento(tenantId, id, { comVersoes = false } = {}) {
  const d = db.prepare('SELECT * FROM documents WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!d) throw new Error('Documento não encontrado.');
  d.tags = j.parse(d.tags, []);
  d.metadados = {};
  for (const m of db.prepare('SELECT chave, valor FROM document_metadata WHERE tenant_id = ? AND document_id = ?').all(String(tenantId), d.id)) d.metadados[m.chave] = m.valor;
  if (comVersoes) {
    d.versoes = db.prepare('SELECT id, numero, nome_arquivo, mime, tamanho, sha256, comentario, criado_em, criado_por FROM document_versions WHERE tenant_id = ? AND document_id = ? ORDER BY numero DESC')
      .all(String(tenantId), d.id);
  }
  return d;
}

function listarDocumentos(tenantId, { folder_id = '', status = 'ativo', busca = '', tipo = '', tag = '', limite = 200 } = {}) {
  let sql = 'SELECT id, folder_id, nome, tipo_documental, tags, status, versao_atual, validade, criado_em, atualizado_em FROM documents WHERE tenant_id = ? AND status = ?';
  const args = [String(tenantId), status === 'lixeira' ? 'lixeira' : 'ativo'];
  if (status !== 'lixeira') { sql += ' AND folder_id = ?'; args.push(s(folder_id, 40)); }
  if (busca) { sql += ' AND (nome LIKE ? OR descricao LIKE ?)'; const t = `%${s(busca, 80)}%`; args.push(t, t); }
  if (tipo) { sql += ' AND tipo_documental = ?'; args.push(s(tipo, 40)); }
  sql += ' ORDER BY nome LIMIT ?'; args.push(Math.min(Math.max(1, Number(limite) || 200), 500));
  let docs = db.prepare(sql).all(...args).map(d => ({ ...d, tags: j.parse(d.tags, []) }));
  if (tag) docs = docs.filter(d => d.tags.includes(tag));
  return docs;
}

function atualizarDocumento(tenantId, id, campos, ator, ip) {
  const d = obterDocumento(tenantId, id);
  const tags = campos.tags != null ? j.str((Array.isArray(campos.tags) ? campos.tags : []).map(t => s(t, 40)).filter(Boolean).slice(0, 20)) : j.str(d.tags);
  db.prepare('UPDATE documents SET nome = ?, descricao = ?, tipo_documental = ?, tags = ?, validade = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?')
    .run(s(campos.nome || d.nome, 200), s(campos.descricao ?? d.descricao, 500),
      TIPOS_DOCUMENTAIS.includes(campos.tipo_documental) ? campos.tipo_documental : d.tipo_documental,
      tags, s(campos.validade ?? d.validade, 10), nowISO(), d.id, String(tenantId));
  if (campos.metadados && typeof campos.metadados === 'object') {
    for (const [k, v] of Object.entries(campos.metadados).slice(0, 40)) {
      const chave = s(k, 60);
      if (!chave) continue;
      if (v === null || v === '') db.prepare('DELETE FROM document_metadata WHERE tenant_id = ? AND document_id = ? AND chave = ?').run(String(tenantId), d.id, chave);
      else db.prepare('INSERT INTO document_metadata (tenant_id, document_id, chave, valor) VALUES (?,?,?,?) ON CONFLICT (tenant_id, document_id, chave) DO UPDATE SET valor = excluded.valor')
        .run(String(tenantId), d.id, chave, s(v, 500));
    }
  }
  repo.auditar(tenantId, ator, 'documento.editar_metadados', 'documents', d.id, { campos: Object.keys(campos) }, ip);
  if (campos.nome && campos.nome !== d.nome) { // mantém o índice de busca coerente com o novo nome
    const txt = db.prepare('SELECT texto FROM document_texts WHERE tenant_id = ? AND document_id = ?').get(String(tenantId), d.id);
    jobs.indexar(tenantId, d.id, s(campos.nome, 200), txt ? txt.texto : '');
  }
  return obterDocumento(tenantId, d.id);
}

function moverDocumento(tenantId, id, folderId, ator, ip) {
  obterDocumento(tenantId, id);
  if (folderId) obterPasta(tenantId, folderId);
  db.prepare('UPDATE documents SET folder_id = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?')
    .run(s(folderId, 40), nowISO(), String(id), String(tenantId));
  repo.auditar(tenantId, ator, 'documento.mover', 'documents', String(id), { para: s(folderId, 40) }, ip);
}

function novaVersao(tenantId, id, { arquivo_nome, conteudo_base64, comentario }, ator, ip) {
  const d = obterDocumento(tenantId, id);
  if (d.status !== 'ativo') throw new Error('Documento na lixeira — restaure antes.');
  const buffer = Buffer.from(String(conteudo_base64 || ''), 'base64');
  const ext = validarUpload(arquivo_nome, buffer);
  repo.checarLimite(tenantId, 'armazenamento_mb', Math.ceil(buffer.length / MB));
  return transacao(() => {
    const numero = d.versao_atual + 1;
    const rel = gravarArquivo(tenantId, d.id, numero, buffer, ext);
    db.prepare(`INSERT INTO document_versions (id, tenant_id, document_id, numero, nome_arquivo, mime, tamanho, sha256, file_path, comentario, criado_em, criado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(novoId(), String(tenantId), d.id, numero, s(arquivo_nome, 200), EXTENSOES[ext], buffer.length, sha256(buffer), rel, s(comentario, 300), nowISO(), s(ator && ator.id, 40));
    db.prepare('UPDATE documents SET versao_atual = ?, atualizado_em = ? WHERE id = ?').run(numero, nowISO(), d.id);
    repo.auditar(tenantId, ator, 'documento.nova_versao', 'documents', d.id, { versao: numero, comentario: s(comentario, 300) }, ip);
    jobs.enfileirarExtracao(tenantId, d.id, numero); // re-extrai a nova vigente
    return numero;
  });
}

// Restaurar versão antiga = criar NOVA versão com o conteúdo da antiga (histórico intacto).
function restaurarVersao(tenantId, id, numero, ator, ip) {
  const d = obterDocumento(tenantId, id);
  const v = db.prepare('SELECT * FROM document_versions WHERE tenant_id = ? AND document_id = ? AND numero = ?')
    .get(String(tenantId), d.id, Math.trunc(Number(numero)));
  if (!v) throw new Error('Versão não encontrada.');
  if (v.numero === d.versao_atual) throw new Error('Essa já é a versão vigente.');
  const buffer = lerArquivo(v.file_path);
  return transacao(() => {
    const novoNum = d.versao_atual + 1;
    const rel = gravarArquivo(tenantId, d.id, novoNum, buffer, extDe(v.nome_arquivo));
    db.prepare(`INSERT INTO document_versions (id, tenant_id, document_id, numero, nome_arquivo, mime, tamanho, sha256, file_path, comentario, criado_em, criado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(novoId(), String(tenantId), d.id, novoNum, v.nome_arquivo, v.mime, v.tamanho, v.sha256, rel, `Restauração da v${v.numero}`, nowISO(), s(ator && ator.id, 40));
    db.prepare('UPDATE documents SET versao_atual = ?, atualizado_em = ? WHERE id = ?').run(novoNum, nowISO(), d.id);
    repo.auditar(tenantId, ator, 'documento.restaurar_versao', 'documents', d.id, { de: v.numero, para: novoNum }, ip);
    jobs.enfileirarExtracao(tenantId, d.id, novoNum);
    return novoNum;
  });
}

// ------------------------------------------------------------ lixeira
function paraLixeira(tenantId, id, ator, ip) {
  const d = obterDocumento(tenantId, id);
  if (d.legal_hold) throw new Error('Documento sob retenção legal — remova a trava antes de excluir.');
  if (d.status !== 'ativo') throw new Error('Documento já está na lixeira.');
  db.prepare("UPDATE documents SET status = 'lixeira', excluido_em = ?, excluido_por = ?, atualizado_em = ? WHERE id = ?")
    .run(nowISO(), s(ator && ator.id, 40), nowISO(), d.id);
  db.prepare('DELETE FROM docs_fts WHERE tenant_id = ? AND document_id = ?').run(String(tenantId), d.id); // some da busca (texto extraído fica p/ restauração)
  repo.auditar(tenantId, ator, 'documento.excluir', 'documents', d.id, { nome: d.nome }, ip);
  require('./api-publica').emitir(tenantId, 'documento.excluido', { document_id: d.id, nome: d.nome });
}
function restaurarDaLixeira(tenantId, id, ator, ip) {
  const d = obterDocumento(tenantId, id);
  if (d.status !== 'lixeira') throw new Error('Documento não está na lixeira.');
  db.prepare("UPDATE documents SET status = 'ativo', excluido_em = '', excluido_por = '', atualizado_em = ? WHERE id = ?").run(nowISO(), d.id);
  const txt = db.prepare('SELECT texto FROM document_texts WHERE tenant_id = ? AND document_id = ?').get(String(tenantId), d.id);
  if (txt) jobs.indexar(tenantId, d.id, d.nome, txt.texto); // volta ao índice de busca
  repo.auditar(tenantId, ator, 'documento.restaurar', 'documents', d.id, { nome: d.nome }, ip);
}
function excluirDefinitivo(tenantId, id, ator, ip) {
  const d = obterDocumento(tenantId, id);
  if (d.legal_hold) throw new Error('Documento sob retenção legal — exclusão bloqueada.');
  if (d.status !== 'lixeira') throw new Error('Só documentos na lixeira podem ser excluídos definitivamente.');
  const versoes = db.prepare('SELECT file_path FROM document_versions WHERE tenant_id = ? AND document_id = ?').all(String(tenantId), d.id);
  transacao(() => {
    db.prepare('DELETE FROM document_versions WHERE tenant_id = ? AND document_id = ?').run(String(tenantId), d.id);
    db.prepare('DELETE FROM document_metadata WHERE tenant_id = ? AND document_id = ?').run(String(tenantId), d.id);
    db.prepare('DELETE FROM documents WHERE id = ? AND tenant_id = ?').run(d.id, String(tenantId));
    db.prepare('DELETE FROM processing_jobs WHERE tenant_id = ? AND document_id = ?').run(String(tenantId), d.id);
  });
  jobs.removerDoIndice(tenantId, d.id);
  for (const v of versoes) { try { fs.unlinkSync(path.resolve(STORAGE_DIR, v.file_path)); } catch (_) {} }
  try { fs.rmdirSync(path.join(STORAGE_DIR, String(tenantId), d.id)); } catch (_) {}
  repo.auditar(tenantId, ator, 'documento.excluir_definitivo', 'documents', d.id, { nome: d.nome }, ip);
}

// Retenção legal: trava exclusão (lógica e definitiva) até ser removida.
function alternarLegalHold(tenantId, id, valor, ator, ip) {
  const d = obterDocumento(tenantId, id);
  db.prepare('UPDATE documents SET legal_hold = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?')
    .run(valor ? 1 : 0, nowISO(), d.id, String(tenantId));
  repo.auditar(tenantId, ator, valor ? 'documento.retencao_legal_ativada' : 'documento.retencao_legal_removida', 'documents', d.id, { nome: d.nome }, ip);
}

// ------------------------------------------------------------ download seguro
function baixar(tenantId, id, numero, ator, ip) {
  const d = obterDocumento(tenantId, id);
  const num = Math.trunc(Number(numero)) || d.versao_atual;
  const v = db.prepare('SELECT * FROM document_versions WHERE tenant_id = ? AND document_id = ? AND numero = ?')
    .get(String(tenantId), d.id, num);
  if (!v) throw new Error('Versão não encontrada.');
  const buffer = lerArquivo(v.file_path);
  db.prepare('INSERT INTO document_access_logs (tenant_id, document_id, user_id, acao, versao, ip, criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(String(tenantId), d.id, s(ator && ator.id, 40), 'baixar', num, s(ip, 60), nowISO());
  const ext = extDe(v.nome_arquivo);
  const mime = SEM_INLINE.has(ext) ? 'application/octet-stream' : (v.mime || 'application/octet-stream');
  return { buffer, nome: v.nome_arquivo, mime };
}
function logVisualizacao(tenantId, id, ator, ip) {
  db.prepare('INSERT INTO document_access_logs (tenant_id, document_id, user_id, acao, versao, ip, criado_em) VALUES (?,?,?,?,0,?,?)')
    .run(String(tenantId), String(id), s(ator && ator.id, 40), 'visualizar', s(ip, 60), nowISO());
}
function acessosDoDocumento(tenantId, id, limite = 100) {
  return db.prepare('SELECT * FROM document_access_logs WHERE tenant_id = ? AND document_id = ? ORDER BY criado_em DESC LIMIT ?')
    .all(String(tenantId), String(id), Math.min(Number(limite) || 100, 500));
}

// ------------------------------------------------------------ uso vivo (p/ repo.usoDoMes)
function usoVivo(tenantId) {
  const docs = db.prepare("SELECT COUNT(*) n FROM documents WHERE tenant_id = ? AND status = 'ativo'").get(String(tenantId)).n;
  const bytes = db.prepare('SELECT COALESCE(SUM(tamanho),0) t FROM document_versions WHERE tenant_id = ?').get(String(tenantId)).t;
  return { documentos: docs, armazenamento_mb: Math.ceil(bytes / MB) };
}

module.exports = {
  EXTENSOES, TIPOS_DOCUMENTAIS, MAX_ARQUIVO_MB,
  listarPastas, criarPasta, renomearPasta, moverPasta, excluirPasta,
  criarDocumento, obterDocumento, listarDocumentos, atualizarDocumento, moverDocumento,
  novaVersao, restaurarVersao, paraLixeira, restaurarDaLixeira, excluirDefinitivo, alternarLegalHold,
  baixar, logVisualizacao, acessosDoDocumento, usoVivo,
  lerArquivoInterno: lerArquivo, // uso interno do worker de extração (jobs.js)
};
