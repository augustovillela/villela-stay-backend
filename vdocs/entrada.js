// =====================================================================
// Villela Docs Intelligence — ENTRADA AUTOMÁTICA de documentos + TRIAGEM.
//
// O cliente cadastra contas de WhatsApp e Gmail; todo documento que chega
// nelas cai aqui, numa pasta de triagem ("Entrada automática"), e fica
// PENDENTE até uma pessoa decidir: eliminar (vai para a lixeira, que se
// restaura) ou processar (categoriza, move e entra no acervo de verdade).
// Este módulo é o lado SERVIDOR: cadastro das contas, recebimento
// idempotente e triagem. Quem lê a caixa é uma ponte local (WhatsApp
// pessoal / IMAP) que chama POST /vdocs/api/v1/entrada com a chave do tenant.
//
// Regras: (1) só entra conta CADASTRADA e ATIVA; (2) só extensões de
// documento (imagem/áudio/vídeo/zip ficam de fora de propósito); (3) reenvio
// da mesma mensagem não duplica (entradas_log); (4) arquivo idêntico a um
// existente vira "duplicado", não um segundo documento; (5) teto diário
// protege o armazenamento de um loop ou de uma caixa cheia de anexos;
// (6) NADA é apagado de vez aqui: eliminar = lixeira.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const docs = require('./docs');

const s = repo.s;
const TIPOS = ['whatsapp', 'gmail'];
const PASTA_PADRAO = '📥 Entrada automática';
const TAG_BAIXA_STAYS = 'baixa-stays-pendente';
// Imagens entram porque comprovante de Pix e nota fiscal chegam muito como foto/print; quem decide
// QUAIS imagens sobem é a ponte (só as que o nome/legenda apontam como comprovante, nota, contrato...).
const EXT_ACEITAS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'rtf', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'webp']);
// Teto de proteção contra enxurrada (bug/loop). Propaganda NÃO conta (grupo de promoção manda centenas) e o
// padrão é folgado: um teto apertado já barrou contratos de verdade em 05/11/2026.
const MAX_DIA = () => parseInt(process.env.VDOCS_ENTRADA_MAX_DIA, 10) || 1000;

// WhatsApp BR: o servidor às vezes registra o número sem o 9 depois do DDD.
// Guardamos e comparamos sempre na forma de 12 dígitos para casar nos dois.
function canonFone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') d = d.slice(0, 4) + d.slice(5);
  return d;
}
function normalizar(tipo, ident) {
  if (!TIPOS.includes(tipo)) throw new Error('Tipo de canal inválido (use whatsapp ou gmail).');
  if (tipo === 'whatsapp') {
    const d = canonFone(ident);
    if (d.length < 10 || d.length > 15) throw new Error('Número de WhatsApp inválido — informe com DDI e DDD (ex.: 5561999999999).');
    return d;
  }
  const e = String(ident || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('E-mail inválido.');
  return e.slice(0, 160);
}

// ------------------------------------------------------------ cadastro
function listarCanais(tenantId) {
  return db.prepare('SELECT * FROM canais_entrada WHERE tenant_id = ? ORDER BY tipo, criado_em').all(String(tenantId))
    .map(c => ({ ...c, ativo: !!c.ativo }));
}
function obterCanal(tenantId, id) {
  const c = db.prepare('SELECT * FROM canais_entrada WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!c) throw new Error('Canal não encontrado.');
  return c;
}
function criarCanal(tenantId, { tipo, identificador, rotulo, folder_id }, ator, ip) {
  const ident = normalizar(tipo, identificador);
  if (folder_id) docs.obterPasta(tenantId, folder_id); // valida que a pasta é do tenant
  if (db.prepare('SELECT 1 FROM canais_entrada WHERE tenant_id = ? AND tipo = ? AND identificador = ?').get(String(tenantId), tipo, ident)) {
    throw new Error('Esta conta já está cadastrada.');
  }
  const id = novoId();
  db.prepare('INSERT INTO canais_entrada (id, tenant_id, tipo, identificador, rotulo, folder_id, ativo, criado_em, criado_por) VALUES (?,?,?,?,?,?,1,?,?)')
    .run(id, String(tenantId), tipo, ident, s(rotulo, 80), s(folder_id, 40), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'entrada.canal_criado', 'canais_entrada', id, { tipo, identificador: ident }, ip);
  return obterCanal(tenantId, id);
}
function atualizarCanal(tenantId, id, { ativo, rotulo, folder_id }, ator, ip) {
  const c = obterCanal(tenantId, id);
  if (folder_id) docs.obterPasta(tenantId, folder_id);
  db.prepare('UPDATE canais_entrada SET ativo = ?, rotulo = ?, folder_id = ? WHERE id = ? AND tenant_id = ?')
    .run(ativo == null ? c.ativo : (ativo ? 1 : 0), rotulo == null ? c.rotulo : s(rotulo, 80),
      folder_id == null ? c.folder_id : s(folder_id, 40), c.id, String(tenantId));
  repo.auditar(tenantId, ator, 'entrada.canal_atualizado', 'canais_entrada', c.id, { ativo, rotulo, folder_id }, ip);
  return obterCanal(tenantId, id);
}
function excluirCanal(tenantId, id, ator, ip) {
  const c = obterCanal(tenantId, id);
  db.prepare('DELETE FROM canais_entrada WHERE id = ? AND tenant_id = ?').run(c.id, String(tenantId));
  repo.auditar(tenantId, ator, 'entrada.canal_excluido', 'canais_entrada', c.id, { tipo: c.tipo, identificador: c.identificador }, ip);
}

// O que a ponte precisa saber: quais contas estão ligadas.
const canaisAtivos = (tenantId) =>
  listarCanais(tenantId).filter(c => c.ativo).map(c => ({ id: c.id, tipo: c.tipo, identificador: c.identificador }));

// ------------------------------------------------------------ pasta de triagem
function pastaDeEntrada(tenantId, canal, ator) {
  if (canal.folder_id) { try { docs.obterPasta(tenantId, canal.folder_id); return canal.folder_id; } catch (_) { /* pasta apagada: cai na padrão */ } }
  const ja = db.prepare("SELECT id FROM folders WHERE tenant_id = ? AND parent_id = '' AND nome = ?").get(String(tenantId), PASTA_PADRAO);
  return ja ? ja.id : docs.criarPasta(tenantId, { nome: PASTA_PADRAO, parent_id: '' }, ator, 'entrada');
}

// ------------------------------------------------------------ recebimento
function registrar(tenantId, canal, origem, remetente, nome, tamanho, status, motivo, documentId, grupo = '') {
  db.prepare(`INSERT INTO entradas_log (id, tenant_id, canal_id, origem_id, remetente, arquivo_nome, tamanho, status, motivo, document_id, triagem, grupo, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(novoId(), String(tenantId), canal.id, origem, s(remetente, 160), s(nome, 200), tamanho || 0, status, s(motivo, 300), s(documentId, 40),
      status === 'recebido' ? 'pendente' : '', grupo, nowISO());
}

/**
 * Recebe UM anexo vindo de uma ponte. Devolve { status, ... } — nunca lança por
 * desfecho "normal" (duplicado, rejeitado, já processado); lança só para o que vale
 * tentar de novo (limite do plano, disco, banco), para a ponte manter na fila.
 */
// Pontes que não controlam o JSON (o Make monta o corpo por texto): mandam nome, remetente e legenda em base64
// (`*_b64`) para aspas, quebras de linha e emojis nunca quebrarem o envio; e `mime` + `legenda` quando o arquivo
// não tem nome (imagem do WhatsApp) — o nome nasce aqui.
const dec64 = (v) => { try { return Buffer.from(String(v || ''), 'base64').toString('utf8'); } catch (_) { return ''; } };
const EXT_DE_MIME = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
function nomeDeMidia({ legenda, mime, data, origem }) {
  const ext = EXT_DE_MIME[String(mime || '').toLowerCase().split(';')[0].trim()];
  if (!ext) return '';
  const quando = new Date(data || Date.now());
  const base = s(String(legenda || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' '), 80)
    || 'Imagem WhatsApp ' + (isNaN(quando) ? '' : quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/[/]/g, '-').replace(', ', ' ').replace(':', 'h'));
  return `${base.trim()} ${s(origem, 200).replace(/[^A-Za-z0-9]/g, '').slice(-6)}.${ext}`.replace(/\s+/g, ' ');
}
function receber(tenantId, corpo, ator, ip) {
  const c = corpo || {};
  const legenda = s(c.legenda || dec64(c.legenda_b64), 300);
  const nomeIn = s(c.arquivo_nome || dec64(c.arquivo_nome_b64), 200) || nomeDeMidia({ legenda, mime: c.mime, data: c.data, origem: c.origem_id });
  return receberBruto(tenantId, {
    ...c, arquivo_nome: nomeIn, remetente: (c.remetente || (dec64(c.remetente_b64).trim() + (c.telefone ? ' (' + s(c.telefone, 20) + ')' : '')).trim()), assunto: c.assunto || dec64(c.assunto_b64) || legenda,
  }, ator, ip);
}
function receberBruto(tenantId, { tipo, identificador, origem_id, remetente, assunto, arquivo_nome, conteudo_base64, data, em_lista }, ator, ip) {
  const ident = normalizar(tipo, identificador);
  const canal = db.prepare('SELECT * FROM canais_entrada WHERE tenant_id = ? AND tipo = ? AND identificador = ?').get(String(tenantId), tipo, ident);
  if (!canal) return { status: 'ignorado', motivo: 'conta não cadastrada' };
  if (!canal.ativo) return { status: 'ignorado', motivo: 'conta desativada' };
  const origem = s(origem_id, 200);
  if (!origem) throw new Error('origem_id obrigatório (id da mensagem + índice do anexo).');
  const ja = db.prepare('SELECT status, document_id FROM entradas_log WHERE tenant_id = ? AND canal_id = ? AND origem_id = ?').get(String(tenantId), canal.id, origem);
  if (ja) return { status: 'ja_processado', anterior: ja.status, document_id: ja.document_id };

  const nome = s(arquivo_nome, 200);
  const ext = (nome.toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';
  const bytes = Math.floor(String(conteudo_base64 || '').length * 3 / 4);
  if (!EXT_ACEITAS.has(ext)) {
    registrar(tenantId, canal, origem, remetente, nome, bytes, 'rejeitado', `tipo .${ext || '?'} não é documento`);
    return { status: 'rejeitado', motivo: 'tipo de arquivo não aceito na entrada automática' };
  }
  const hoje = db.prepare("SELECT COUNT(*) n FROM entradas_log WHERE tenant_id = ? AND status = 'recebido' AND grupo != 'propaganda' AND criado_em >= ?")
    .get(String(tenantId), new Date().toISOString().slice(0, 10)).n;
  if (hoje >= MAX_DIA()) throw new Error(`Teto diário da entrada automática atingido (${MAX_DIA()} documentos). Tenta de novo amanhã.`);

  const desc = `Entrada automática · ${tipo === 'whatsapp' ? 'WhatsApp' : 'Gmail'} (${canal.rotulo || canal.identificador})`
    + (remetente ? ` · de ${s(remetente, 80)}` : '') + (assunto ? ` · "${s(assunto, 100)}"` : '') + (data ? ` · ${s(data, 40)}` : '');
  const grupo = classificarGrupo({ nome, assunto, remetente, emLista: !!em_lista, listaDoDono: listaDoDono(tenantId) });
  try {
    const doc = docs.criarDocumento(tenantId, {
      nome, arquivo_nome: nome, conteudo_base64, descricao: desc,
      // propaganda fica em pasta própria, longe do que provavelmente será processado
      folder_id: grupo === 'propaganda' ? pastaPorNome(tenantId, PASTA_PROPAGANDA, ator) : pastaDeEntrada(tenantId, canal, ator),
      tags: ['entrada-automatica', tipo].concat(grupo === 'propaganda' ? ['propaganda'] : []),
    }, ator, ip);
    db.prepare('UPDATE canais_entrada SET ultimo_recebimento = ?, total_recebidos = total_recebidos + 1 WHERE id = ?').run(nowISO(), canal.id);
    registrar(tenantId, canal, origem, remetente, nome, bytes, 'recebido', '', doc.id, grupo);
    return { status: 'recebido', document_id: doc.id };
  } catch (e) {
    if (e.duplicado) {
      registrar(tenantId, canal, origem, remetente, nome, bytes, 'duplicado', `idêntico a "${e.duplicado.nome}"`, e.duplicado.id);
      return { status: 'duplicado', document_id: e.duplicado.id };
    }
    // arquivo inválido/grande demais é desfecho definitivo; o resto (limite, disco) a ponte retenta
    if (/não permitido|vazio|maior que/i.test(e.message)) {
      registrar(tenantId, canal, origem, remetente, nome, bytes, 'rejeitado', e.message);
      return { status: 'rejeitado', motivo: e.message };
    }
    throw e;
  }
}

// ------------------------------------------------------------ sugestão de categoria
// Nota fiscal e contrato são o que o cliente já sabe que importa: reconhecidos pelo nome do
// arquivo e pelo texto extraído, sobem para o topo da fila já com a categoria sugerida.
// É SUGESTÃO — quem confirma é a triagem. Texto ainda não extraído = só o nome decide.
const SINAIS = [
  // Societário vem PRIMEIRO: "contrato social" não é contrato comum e "comprovante de inscrição" (cartão CNPJ)
  // não é comprovante de pagamento — os sinais de baixo engoliriam os dois.
  { tipo: 'societario', rotulo: 'Documentos societários',
    forte: /\b(contrato social|estatuto social|ato constitutivo|alteracao contratual|consolidacao contratual|requerimento de empresario|acordo de (socios|quotistas|acionistas)|ata de (assembleia|reuniao de socios|constituicao)|cartao (do )?cnpj|comprovante de inscricao|inscricao (estadual|municipal)|certidao simplificada|junta comercial|quadro (de socios|societario)|qsa)\b/i,
    fraco: /\b(nire|capital social|socio administrador|quotas|objeto social|sede social|natureza juridica|situacao cadastral|data de abertura|nome empresarial)\b/i },
  { tipo: 'financeiro', rotulo: 'Financeiro',
    forte: /\b(recebiveis|resumo diario|conciliacao|repasse|payout)\b/i,
    fraco: /\b(liquidacao|antecipacao|taxa de administracao|valor liquido|adquirente)\b/i },
  { tipo: 'extrato_bancario', rotulo: 'Extrato bancário',
    forte: /\b(extrato|extratos)\b/i,
    fraco: /\b(saldo anterior|saldo final|saldo do dia|lancamentos|movimentacao|movimentacoes|agencia|conta corrente|periodo do extrato)\b/i },
  { tipo: 'nota_fiscal', forte: /\b(nf ?e|nfs ?e|danfe|nota fiscal|chave de acesso)\b|\bnf ?\d|\bnf e\b|\bnfe\b/i,
    fraco: /\b(nota fiscal eletr[oô]nica|documento auxiliar|valor total da nota|cnpj emitente|s[eé]rie)\b/i },
  { tipo: 'financeiro', rotulo: 'Comprovante',
    forte: /\bcomprovante\b|\bcomp (pix|ted|doc)\b|\bpix (enviado|realizado|recebido)\b|\b(ted|doc) (enviad|realizad)|\bdep[oó]sito\b|\btransfer[eê]ncia\b/i,
    fraco: /\b(pix|chave pix|id da transa[cç][aã]o|c[oó]digo de autentica[cç][aã]o|favorecido|pagador|benefici[aá]rio|banco de destino|valor transferido)\b/i },
  { tipo: 'fatura', rotulo: 'Fatura',
    forte: /\b(fatura|faturas|boleto|boletos|cobranca|2a via|segunda via)\b|\bconta de (luz|agua|energia|telefone|internet|gas)\b/i,
    fraco: /\b(vencimento|linha digitavel|codigo de barras|valor do documento|pague ate|total a pagar|data de vencimento|beneficiario)\b/i },
  { tipo: 'recibo', forte: /\b(recibo|ticket|bilhete eletronico)\b/i,
    fraco: /\b(recebi de|recebemos de|referente a|quita[cç][aã]o|valor pago)\b/i },
  { tipo: 'contrato', forte: /\bcontrato|\baditivo\b|\bdistrato\b|\btermo de (ades[aã]o|cess[aã]o|loca[cç][aã]o)\b/i,
    fraco: /\b(contratante|contratada|locador|locat[aá]rio|cl[aá]usula|foro da comarca|partes? contratantes?)\b/i },
];
function sugerirTipo(nome, texto) {
  // "_", "." e "-" viram espaço: \b não separa "NFe_123" nem "comprovante_pix.png"
  const sem = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); // "cobrança" casa com "cobranca"
  const n = sem(nome).replace(/[_.\-]+/g, ' '), t = sem(String(texto || '').slice(0, 6000)).replace(/[_.-]+/g, ' ');
  // Em passes, do mais para o menos confiável: o nome do arquivo vale mais que o texto, e uma
  // palavra solta no texto ("recibo" dentro de um contrato) não pode vencer o tipo real.
  for (const sn of SINAIS) if (sn.forte.test(n)) return { tipo: sn.tipo, rotulo: sn.rotulo || '', confianca: 'alta', motivo: 'pelo nome do arquivo' };
  let melhor = null;
  for (const sn of SINAIS) {
    const fortes = (t.match(new RegExp(sn.forte.source, 'gi')) || []).length;
    const fracos = (t.match(new RegExp(sn.fraco.source, 'gi')) || []).length;
    const pontos = fortes * 2 + fracos;
    if (pontos >= 2 && (!melhor || pontos > melhor.pontos)) melhor = { tipo: sn.tipo, rotulo: sn.rotulo || '', pontos, confianca: fortes ? 'alta' : 'media' };
  }
  return melhor ? { tipo: melhor.tipo, rotulo: melhor.rotulo, confianca: melhor.confianca, motivo: 'pelo conteúdo' } : null;
}

// ------------------------------------------------------------ propaganda
// Material promocional (catálogo, oferta, newsletter) sobe junto com os documentos de verdade e
// atrapalha a triagem. Vai para uma aba/pasta SEPARADA — nunca é apagado sozinho: o Augusto confere
// e elimina em lote. Regra de ouro: o que parece nota fiscal, fatura, contrato, recibo ou
// comprovante PELO NOME nunca vira propaganda (fatura chega por e-mail em massa também).
const sem = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const RE_PROMO = /\b(promocao|promocoes|oferta|ofertas|desconto|descontos|cupom|black ?friday|liquidacao|imperdivel|ultimas unidades|frete gratis|newsletter|aproveite|compre agora|outlet|catalogo|lancamento|novidades?|parabens|voce ganhou|ganhe|sorteio)\b|% ?off|\d+% ?de desconto/;
const RE_REMETENTE_MKT = /(no-?reply|noreply|newsletter|marketing|promo|ofertas|mkt|campanha|comunicacao|novidades|news@)/;
const RE_NOME_PROMO = /(banner|promo|oferta|catalogo|folheto|encarte|tabela de precos|flyer|lamina)/;
// legenda de grupo de achadinhos: "De R$ 449 por R$ 269 no Pix", "cupom", "no pix", "com frete gratis"
const RE_PRECO_PROMO = /(de r\$ ?\d[0-9.,]* por r\$|\bpor r\$ ?\d[0-9.,]* no pix|\bno pix\b|\bcupom\b|\d+% ?off|\d+% de desconto)/;
/** 'propaganda' ou 'normal'. `emLista` = cabeçalhos de lista/bulk do e-mail (List-Unsubscribe, Precedence: bulk). */
function classificarGrupo({ nome, assunto, remetente, emLista, listaDoDono = [] }) {
  if (sugerirTipo(nome, '')) return 'normal';
  // lista do dono: remetente que ele disse que SÓ manda propaganda decide sozinho
  const rem = sem(remetente);
  if (listaDoDono.some(p => p && rem.includes(p))) return 'propaganda';
  let pontos = 0;
  if (emLista) pontos += 2;
  if (RE_PROMO.test(sem(assunto))) pontos += 2;
  if (RE_NOME_PROMO.test(sem(nome)) || RE_PRECO_PROMO.test(sem(nome))) pontos += 2; else if (RE_PROMO.test(sem(nome))) pontos += 1;
  // Imagem vinda de GRUPO de WhatsApp (remetente "Nome (id-do-grupo)") quase nunca é documento; e legenda
  // comprida com emoji virando nome de arquivo é a assinatura de post de achadinho.
  const imagem = /\.(jpe?g|png|webp)$/i.test(String(nome || ''));
  if (imagem && /\((?:\d+-\d+|120363\d+)\)\s*$/.test(String(remetente || ''))) pontos += 3;
  if (imagem && String(nome || '').length > 30 && /\p{Extended_Pictographic}/u.test(String(nome || ''))) pontos += 2;
  if (RE_REMETENTE_MKT.test(sem(remetente))) pontos += /promo|achadinho|ofertas|cupom/.test(sem(remetente)) ? 2 : 1;
  return pontos >= 3 || (pontos >= 2 && !emLista) ? 'propaganda' : 'normal';
}

// ------------------------------------------------------------ lista do dono
const listaDoDono = (tenantId) => db.prepare('SELECT padrao FROM remetentes_propaganda WHERE tenant_id = ?').all(String(tenantId)).map(r => r.padrao);
const listarRemetentesPropaganda = (tenantId) =>
  db.prepare('SELECT id, exibicao, criado_em FROM remetentes_propaganda WHERE tenant_id = ? ORDER BY exibicao').all(String(tenantId));
/** Aceita vários de uma vez, separados por vírgula, ponto e vírgula ou linha. Ignora o que tem menos de 3 letras. */
function adicionarRemetentesPropaganda(tenantId, texto, ator, ip) {
  const nomes = String(texto || '').split(/[,;\n]+/).map(x => s(x, 80)).filter(x => sem(x).trim().length >= 3);
  if (!nomes.length) throw new Error('Informe o nome do remetente (3 letras ou mais). Para vários, separe por vírgula.');
  let novos = 0;
  for (const n of nomes.slice(0, 100)) {
    const r = db.prepare('INSERT OR IGNORE INTO remetentes_propaganda (id, tenant_id, padrao, exibicao, criado_em) VALUES (?,?,?,?,?)')
      .run(novoId(), String(tenantId), sem(n).trim(), n, nowISO());
    novos += Number(r.changes) || 0;
  }
  repo.auditar(tenantId, ator, 'entrada.remetente_propaganda_add', 'remetentes_propaganda', '', { novos }, ip);
  return novos;
}
function removerRemetentePropaganda(tenantId, id, ator, ip) {
  const r = db.prepare('DELETE FROM remetentes_propaganda WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Remetente não encontrado.');
  repo.auditar(tenantId, ator, 'entrada.remetente_propaganda_del', 'remetentes_propaganda', String(id), {}, ip);
}
/** "Leroy Merlin <news@x.com>" -> "Leroy Merlin"; "Promos (5585…)" -> "Promos". */
const nomeDoRemetente = (r) => s(String(r || '').split(/[<(]/)[0].replace(/["']/g, ''), 80);

// Pasta por categoria: processar sem escolher pasta arruma o documento no lugar certo.
const PASTA_PROPAGANDA = '📢 Propaganda (conferir)';
const PASTA_POR_TIPO = {
  nota_fiscal: 'Notas fiscais', fatura: 'Faturas', extrato_bancario: 'Extratos bancários', contrato: 'Contratos', recibo: 'Recibos', financeiro: 'Comprovantes e financeiro',
  societario: 'Documentos societários',
};
// Subpastas de uma categoria: nascem junto com a pasta-mãe; o documento desce para a que o NOME indicar
// e, sem indicação, fica na pasta-mãe (quem decide o resto é a pessoa).
const SUBPASTAS_POR_TIPO = {
  societario: [
    { nome: 'Documentos constitutivos', re: /\b(contrato social|estatuto|ato constitutivo|alteracao contratual|consolidacao|requerimento de empresario|acordo de (socios|quotistas|acionistas)|ata de (assembleia|reuniao|constituicao))\b/i },
    { nome: 'Identificação da sociedade', re: /\b(cnpj|comprovante de inscricao|inscricao (estadual|municipal)|certidao simplificada|junta comercial|nire|quadro (de socios|societario)|qsa|alvara)\b/i },
  ],
};
function pastaPorNome(tenantId, nome, ator, pai = '') {
  const ja = db.prepare('SELECT id FROM folders WHERE tenant_id = ? AND parent_id = ? AND nome = ?').get(String(tenantId), String(pai), nome);
  return ja ? ja.id : docs.criarPasta(tenantId, { nome, parent_id: pai }, ator, 'entrada');
}
/** Pasta de destino da categoria (cria o que faltar, subpastas inclusive). null = categoria sem pasta própria. */
function pastaDoTipo(tenantId, tipo, nomeDoc, ator) {
  // categoria criada pelo assinante: a pasta leva o nome que ele deu à categoria
  const nomePasta = PASTA_POR_TIPO[tipo] || docs.rotulosProprios(tenantId)[tipo];
  if (!nomePasta) return null;
  const mae = pastaPorNome(tenantId, nomePasta, ator);
  const n = sem(nomeDoc).replace(/[_.\-]+/g, ' ');
  let destino = mae;
  for (const sub of SUBPASTAS_POR_TIPO[tipo] || []) {
    const id = pastaPorNome(tenantId, sub.nome, ator, mae);
    if (destino === mae && sub.re.test(n)) destino = id;
  }
  return destino;
}

/**
 * Reavalia o que ainda está na fila e foi classificado automaticamente como 'normal' (ou nunca foi):
 * a régua melhora com o tempo e a fila antiga não deve ficar presa à régua velha. Só mexe em item
 * cuja decisão foi da máquina — 'confirmado' (o Augusto disse "não é propaganda") nunca é reaberto.
 * Sem cabeçalho de lista (não guardado), usa nome, remetente e assunto lido da descrição.
 */
function reclassificarFila(t) {
  const linhas = db.prepare(`SELECT l.id, l.remetente, l.document_id, d.nome, d.descricao, d.tags, d.folder_id
    FROM entradas_log l JOIN documents d ON d.id = l.document_id AND d.tenant_id = l.tenant_id
    WHERE l.tenant_id = ? AND l.triagem = 'pendente' AND l.grupo IN ('', 'normal') AND d.status = 'ativo'`).all(t);
  const lista = listaDoDono(t);
  for (const r of linhas) {
    const assunto = ((String(r.descricao || '').match(/"([^"]*)"/) || [])[1]) || '';
    if (classificarGrupo({ nome: r.nome, assunto, remetente: r.remetente, emLista: false, listaDoDono: lista }) !== 'propaganda') {
      db.prepare("UPDATE entradas_log SET grupo = 'normal' WHERE id = ? AND grupo = ''").run(r.id);
      continue;
    }
    const ator = { id: 'sistema', nome: 'Triagem automática' };
    const tags = j.parse(r.tags, []);
    if (!tags.includes('propaganda')) docs.atualizarDocumento(t, r.document_id, { tags: tags.concat('propaganda') }, ator, 'rotina');
    docs.moverDocumento(t, r.document_id, pastaPorNome(t, PASTA_PROPAGANDA, ator), ator, 'rotina');
    db.prepare("UPDATE entradas_log SET grupo = 'propaganda' WHERE id = ?").run(r.id);
  }
}

// ------------------------------------------------------------ triagem
/** Documentos recebidos que ainda esperam decisão. Quem já saiu do ar por outro caminho some da fila. */
function pendentesTriagem(tenantId, limite = 200) {
  const t = String(tenantId);
  reclassificarFila(t);
  const linhas = db.prepare(`SELECT l.id AS log_id, l.document_id, l.remetente, l.grupo, l.criado_em AS recebido_em, l.canal_id,
      c.tipo AS canal_tipo, c.identificador AS canal_ident, c.rotulo AS canal_rotulo,
      d.nome, d.descricao, d.tipo_documental, d.tags, d.status AS doc_status,
      v.tamanho, v.mime, tx.texto
    FROM entradas_log l
    JOIN documents d ON d.id = l.document_id AND d.tenant_id = l.tenant_id
    LEFT JOIN canais_entrada c ON c.id = l.canal_id
    LEFT JOIN document_versions v ON v.document_id = d.id AND v.numero = d.versao_atual
    LEFT JOIN document_texts tx ON tx.document_id = d.id AND tx.tenant_id = l.tenant_id
    WHERE l.tenant_id = ? AND l.triagem = 'pendente'
    ORDER BY l.criado_em DESC LIMIT ?`).all(t, Math.min(Math.max(1, Number(limite) || 200), 500));
  const itens = [];
  for (const r of linhas) {
    if (r.doc_status !== 'ativo') { // foi para a lixeira por fora da triagem: encerra o pendente
      db.prepare("UPDATE entradas_log SET triagem = 'eliminado' WHERE id = ?").run(r.log_id);
      continue;
    }
    itens.push({
      log_id: r.log_id, document_id: r.document_id, nome: r.nome, descricao: r.descricao, tipo_documental: r.tipo_documental,
      tamanho: r.tamanho || 0, mime: r.mime || '', remetente: r.remetente, recebido_em: r.recebido_em,
      canal: { tipo: r.canal_tipo, identificador: r.canal_ident, rotulo: r.canal_rotulo },
      trecho: s(String(r.texto || '').replace(/\s+/g, ' '), 400), // ajuda a decidir sem abrir o arquivo
      sugestao: sugerirTipo(r.nome, r.texto),
      grupo: r.grupo === 'propaganda' ? 'propaganda' : 'normal',
    });
  }
  // importantes (nota fiscal/contrato/fatura...) primeiro; dentro de cada grupo, o mais novo antes
  return itens.sort((a, b) => (b.sugestao ? 1 : 0) - (a.sugestao ? 1 : 0));
}

/**
 * Aplica decisões em lote. acao 'eliminar' = lixeira (restaurável); 'processar' = categoriza
 * (tipo_documental, tags, validade, nome) e move para a pasta escolhida — o documento sai da
 * fila e passa a ser acervo normal. Cada item é independente: falha de um não perde os outros.
 */
function decidirTriagem(tenantId, itens, ator, ip) {
  if (!Array.isArray(itens) || !itens.length) throw new Error('Nenhum item para decidir.');
  const resultado = [];
  for (const it of itens.slice(0, 200)) {
    const logId = s(it && it.log_id, 40);
    try {
      const l = db.prepare("SELECT * FROM entradas_log WHERE id = ? AND tenant_id = ? AND triagem = 'pendente'").get(logId, String(tenantId));
      if (!l) throw new Error('Item não está mais na fila de triagem.');
      if (it.acao === 'remetente_propaganda') { /* não exige estar pendente de decisão de arquivo */ }
      if (it.acao === 'eliminar') {
        docs.paraLixeira(tenantId, l.document_id, ator, ip);
        db.prepare("UPDATE entradas_log SET triagem = 'eliminado' WHERE id = ?").run(l.id);
      } else if (it.acao === 'processar') {
        const d = docs.obterDocumento(tenantId, l.document_id);
        const tags = (Array.isArray(it.tags) ? it.tags : d.tags).filter(t => t !== 'entrada-automatica');
        // Pagamento de hospedagem: a baixa na Stays usa a data do CHECK-IN (competência), não a do
        // pagamento, e a API da Stays não expõe pagamentos — então só ETIQUETAMOS aqui; quem dá a
        // baixa é a rotina `alterar-status-contas-receber`, com a aprovação do Augusto.
        if (it.baixa_stays && !tags.includes(TAG_BAIXA_STAYS)) tags.push(TAG_BAIXA_STAYS);
        docs.atualizarDocumento(tenantId, l.document_id, {
          nome: it.nome || d.nome, tipo_documental: it.tipo_documental, tags, validade: it.validade,
        }, ator, ip);
        // '__manter' = não mexe; '__auto' = pasta da categoria (cria se faltar); '' = raiz; id = a pasta escolhida
        let destino = it.folder_id == null ? '__auto' : String(it.folder_id);
        if (destino === '__auto') {
          const tipoFinal = it.tipo_documental || d.tipo_documental;
          destino = pastaDoTipo(tenantId, tipoFinal, it.nome || d.nome, ator) || '__manter';
        }
        if (destino !== '__manter' && s(destino, 40) !== d.folder_id) docs.moverDocumento(tenantId, l.document_id, s(destino, 40), ator, ip);
        db.prepare("UPDATE entradas_log SET triagem = 'processado' WHERE id = ?").run(l.id);
      } else if (it.acao === 'remetente_propaganda') { // "sempre propaganda deste remetente": entra na lista e a fila é reavaliada
        adicionarRemetentesPropaganda(tenantId, nomeDoRemetente(l.remetente), ator, ip);
        reclassificarFila(String(tenantId));
      } else if (it.acao === 'nao_propaganda') { // volta para a fila normal e para a pasta de entrada
        const d = docs.obterDocumento(tenantId, l.document_id);
        const canal = db.prepare('SELECT * FROM canais_entrada WHERE id = ?').get(l.canal_id) || {};
        docs.atualizarDocumento(tenantId, l.document_id, { tags: d.tags.filter(t => t !== 'propaganda') }, ator, ip);
        docs.moverDocumento(tenantId, l.document_id, pastaDeEntrada(tenantId, canal, ator), ator, ip);
        db.prepare("UPDATE entradas_log SET grupo = 'confirmado' WHERE id = ?").run(l.id);
      } else {
        throw new Error('Ação inválida (use eliminar, processar ou nao_propaganda).');
      }
      repo.auditar(tenantId, ator, 'entrada.triagem_' + it.acao, 'entradas_log', l.id, { document_id: l.document_id }, ip);
      resultado.push({ log_id: logId, ok: true });
    } catch (e) {
      resultado.push({ log_id: logId, ok: false, erro: e.message });
    }
  }
  return resultado;
}

// ------------------------------------------------------------ aviso diário da triagem
// O aviso sai pelo WhatsApp do Augusto (alertaAugusto). Por isso só vale para conta de CORTESIA
// (interna, da plataforma): cliente pagante não pode ter a fila dele despachada para o número do
// dono da plataforma. Ligado por padrão nessas contas; o dono desliga na aba Entrada automática.
function avisoTriagemDisponivel(tenantId) {
  const t = repo.obterTenant(tenantId);
  return !!(t && t.status === 'cortesia');
}
function avisoTriagemAtivo(tenantId) {
  return avisoTriagemDisponivel(tenantId) && (repo.lerSettings(tenantId).aviso_triagem_whatsapp || 'on') !== 'off';
}
function definirAvisoTriagem(tenantId, ativo, ator, ip) {
  if (!avisoTriagemDisponivel(tenantId)) throw new Error('O aviso por WhatsApp só existe nas contas internas da plataforma.');
  repo.gravarSetting(tenantId, 'aviso_triagem_whatsapp', ativo ? 'on' : 'off', ator, ip);
}
/** Dados do aviso diário, ou null quando não há nada esperando (não se avisa "zero"). */
function dadosAvisoTriagem(tenantId) {
  const todos = pendentesTriagem(tenantId, 500);
  const itens = todos.filter(i => i.grupo !== 'propaganda'); // propaganda não acorda ninguém
  if (!itens.length) return null;
  return {
    propaganda: todos.length - itens.length,
    total: itens.length,
    importantes: itens.filter(i => i.sugestao).length,
    maisAntigo: itens.reduce((m, i) => (i.recebido_em < m ? i.recebido_em : m), itens[0].recebido_em),
    nomes: itens.slice(0, 3).map(i => i.nome),
  };
}

// ------------------------------------------------------------ nome sugerido pela IA
// A pedido (botão na triagem): a IA lê o começo do texto extraído e propõe um nome legível, ex.:
// "Nota fiscal – Zara – 03/11/2026". Vários documentos por chamada (1 consulta do plano por lote).
// Só sugere — o nome vale quando a pessoa processa. Imagem/PDF escaneado sem texto não tem o que ler
// (não há OCR): volta em `sem_texto`. Gasto explícito: só roda quando alguém clica.
const MAX_NOMEAR = 15;
const SCHEMA_NOMES = {
  type: 'object',
  properties: { nomes: { type: 'array', items: { type: 'object', properties: {
    ref: { type: 'string' }, nome: { type: 'string' }, tipo_documental: { type: 'string' } },
    required: ['ref', 'nome', 'tipo_documental'], additionalProperties: false } } },
  required: ['nomes'], additionalProperties: false,
};
const INSTRUCAO_NOMEAR = `TAREFA ATUAL: dar NOME a documentos recém-recebidos. Ignore as regras de citação e de pergunta/resposta.
Formato do nome: "Tipo – Emissor ou parte – Data" (data dd/mm/aaaa; para fatura ou extrato de período, mm/aaaa), no máximo 90 caracteres.
Exemplos: "Nota fiscal – Zara – 03/11/2026", "Fatura – Claro – 10/2026", "Extrato bancário – C6 PJ – 10/2026", "Comprovante de Pix – João Silva – 05/11/2026", "Contrato de locação – Maria Souza – 01/2027", "Contrato social – Empresa Beta Ltda – 03/2024" (este é tipo societario, assim como estatuto, alteração contratual, ata, cartão CNPJ e inscrições).
Regras: use SOMENTE o que está no texto ou no contexto do recebimento (remetente, assunto e data do e-mail); se um elemento (emissor, data) não aparecer, OMITA-O — nunca invente; nunca ponha CPF, CNPJ, número de conta, código de barras ou chave de acesso no nome; se não der para saber o que é o documento, devolva nome vazio. tipo_documental deve ser um destes ou vazio: `;
function sanitizaNome(n) { return s(String(n || '').replace(/[\\*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' '), 120).trim(); }
/** Núcleo: pede à IA o nome de cada item { id, nome, texto }. Devolve [{ id, nome, tipo_documental }]. 1 consulta do plano por chamada. */
async function sugerirNomes(tenantId, itens) {
  const ia = require('./ia');
  const { TIPOS_DOCUMENTAIS } = require('./docs');
  ia.checarCota(tenantId); // plataforma: gasta a cota do plano; chave própria: não
  const prompt = itens.map((r, i) => `[D${i + 1}] (arquivo: ${r.nome})\n` + (r.contexto ? `Contexto do recebimento: ${r.contexto}\n` : '') + (temTexto(r.texto) ? String(r.texto).replace(/\s+/g, ' ').trim().slice(0, 1800) : '(sem texto extraído do arquivo — use o contexto do recebimento)')).join('\n\n---\n\n')
    + `\n\nDevolva um item por documento, com ref igual a D1, D2...`;
  const r = await ia.executar(tenantId, { prompt, schema: SCHEMA_NOMES, systemExtra: INSTRUCAO_NOMEAR + TIPOS_DOCUMENTAIS.join(', ') + '.' });
  ia.registrarCota(tenantId);
  const out = [];
  for (const it of ((r.json && r.json.nomes) || [])) {
    const m = /^D(\d+)$/.exec(String(it.ref || '').trim());
    const item = m && itens[Number(m[1]) - 1];
    const nome = sanitizaNome(it.nome);
    if (!item || !nome) continue;
    out.push({ id: item.id, nome, tipo_documental: TIPOS_DOCUMENTAIS.includes(it.tipo_documental) ? it.tipo_documental : '' });
  }
  return out;
}
// Nome que não diz nada: timestamp/hash na frente ou o arquivo se chama só "documento-1", "scan", "img".
const nomeRuim = (n) => /^[0-9]{8,}[-_ ]/.test(String(n || '')) || /[0-9a-f]{20,}/i.test(String(n || '')) || /^(documento|doc|scan|img|image|file|arquivo)[-_ ]?[0-9]*[.]/i.test(String(n || ''));
const temTexto = (t) => String(t || '').replace(/\s+/g, ' ').trim().length >= 40;

/** A pedido (botão na triagem): sugere, não aplica — o nome vale quando a pessoa processa. */
async function nomearComIA(tenantId, user, logIds, ip) {
  const ia = require('./ia');
  if (!ia.ativo(tenantId)) throw new Error('IA indisponível: o servidor está sem ANTHROPIC_API_KEY. Cadastre a sua chave em Configurações → IA.');
  const ids = [...new Set((Array.isArray(logIds) ? logIds : []).map(x => s(x, 40)).filter(Boolean))].slice(0, MAX_NOMEAR);
  if (!ids.length) throw new Error('Marque ao menos um documento.');
  const marcas = ids.map(() => '?').join(',');
  const linhas = db.prepare(`SELECT l.id AS log_id, d.nome, tx.texto FROM entradas_log l
      JOIN documents d ON d.id = l.document_id AND d.tenant_id = l.tenant_id
      LEFT JOIN document_texts tx ON tx.document_id = d.id AND tx.tenant_id = l.tenant_id
      WHERE l.tenant_id = ? AND l.triagem = 'pendente' AND l.id IN (${marcas})`).all(String(tenantId), ...ids);
  const comTexto = linhas.filter(r => temTexto(r.texto));
  const semTexto = linhas.filter(r => !comTexto.includes(r)).map(r => r.log_id);
  if (!comTexto.length) return { sugestoes: [], sem_texto: semTexto };
  const sug = await sugerirNomes(tenantId, comTexto.map(r => ({ id: r.log_id, nome: r.nome, texto: r.texto })));
  repo.auditar(tenantId, user, 'entrada.nomear_ia', 'entradas_log', '', { documentos: comTexto.length, sugeridos: sug.length }, ip);
  return { sugestoes: sug.map(x => ({ log_id: x.id, nome: x.nome, tipo_documental: x.tipo_documental })), sem_texto: semTexto, sem_sugestao: comTexto.length - sug.length };
}

// ---- nome AUTOMÁTICO: todo documento que chega (e o acervo que veio por aqui) ganha um nome bom ----
// Aplica direto: o arquivo original fica guardado (versão e "Arquivo original:" na descrição) e a pessoa pode
// editar. Tag `nome-ia` = já nomeado (não repete); `nome-ia-sem` = a IA não soube (não insiste). Propaganda não
// gasta IA. Teto diário por empresa (VDOCS_NOME_IA_MAX_DIA, padrão 100). Imagem/escaneado sem texto não tem o que ler.
const MAX_AUTO_DIA = () => parseInt(process.env.VDOCS_NOME_IA_MAX_DIA, 10) || 100;
function nomearAutoAtivo(tenantId) {
  const v = repo.lerSettings(tenantId).nomear_automatico;
  if (v === 'on') return true;
  if (v === 'off') return false;
  // sem escolha: ligado nas contas internas (cortesia) e em quem usa a PRÓPRIA chave de IA (paga o próprio custo); desligado nas demais
  return avisoTriagemDisponivel(tenantId) || require('./ia-fonte').usaChavePropria(tenantId);
}
function definirNomearAuto(tenantId, ativo, ator, ip) {
  repo.gravarSetting(tenantId, 'nomear_automatico', ativo ? 'on' : 'off', ator, ip);
}
// Quem entra na fila de nomes: veio pela Entrada automática, não é propaganda, ainda não foi nomeado, é importante
// (categoria reconhecida) ou tem nome ruim — e há o que a IA ler: o texto extraído OU o contexto do e-mail
// (remetente, assunto e data), que cobre o PDF escaneado/sem texto.
function elegiveisNomeAuto(t) {
  return db.prepare(`SELECT d.id, d.nome, d.descricao, d.tags, tx.texto FROM entradas_log l
      JOIN documents d ON d.id = l.document_id AND d.tenant_id = l.tenant_id
      LEFT JOIN document_texts tx ON tx.document_id = d.id AND tx.tenant_id = l.tenant_id
      WHERE l.tenant_id = ? AND l.status = 'recebido' AND l.triagem IN ('pendente', 'processado') AND l.grupo != 'propaganda'
        AND d.status = 'ativo' AND d.tags NOT LIKE '%"nome-ia%'
      ORDER BY l.criado_em DESC LIMIT 300`).all(String(t))
    .map(c => ({ ...c, contexto: /"/.test(c.descricao || '') ? String(c.descricao).replace(/^Entrada automática · /, '').replace(/^Arquivo original: [^·]*· /, '') : '' }))
    .filter(c => (temTexto(c.texto) || c.contexto) && (sugerirTipo(c.nome, String(c.texto || '') + ' ' + c.contexto) || nomeRuim(c.nome)));
}
/** Estado do nome automático, para a tela e para diagnóstico: por que um documento ainda não foi nomeado. */
function diagnosticoNomes(tenantId) {
  const t = String(tenantId);
  const ult = db.prepare("SELECT detalhes, criado_em FROM audit_logs WHERE tenant_id = ? AND acao = 'entrada.nomear_auto' ORDER BY criado_em DESC LIMIT 1").get(t);
  const el = elegiveisNomeAuto(t);
  const total = (tag) => db.prepare("SELECT COUNT(*) n FROM documents WHERE tenant_id = ? AND status = 'ativo' AND tags LIKE ?").get(t, '%"' + tag + '"%').n;
  return {
    ligado: nomearAutoAtivo(t), ia_ativa: require('./ia').ativo(t),
    aguardando: el.length, aguardando_sem_texto: el.filter(c => !temTexto(c.texto)).length,
    nomeados: total('nome-ia'), sem_sugestao: total('nome-ia-sem'),
    ultima_rodada: ult ? { em: ult.criado_em, ...(j.parse(ult.detalhes, {}) || {}) } : null,
    teto_dia: MAX_AUTO_DIA(),
  };
}
async function rotinaNomesAuto(tenantId) {
  const ia = require('./ia');
  if (!ia.ativo(tenantId) || !nomearAutoAtivo(tenantId)) return 0;
  const t = String(tenantId);
  const hoje = new Date().toISOString().slice(0, 10);
  let usado = db.prepare("SELECT detalhes FROM audit_logs WHERE tenant_id = ? AND acao = 'entrada.nomear_auto' AND criado_em >= ?").all(t, hoje)
    .reduce((n, a) => n + (Number((j.parse(a.detalhes, {}) || {}).documentos) || 0), 0);
  const candidatos = elegiveisNomeAuto(t).slice(0, 60);
  const ator = { id: 'sistema', nome: 'Nome automático (IA)' };
  let nomeados = 0;
  for (let i = 0; i < candidatos.length && usado < MAX_AUTO_DIA(); i += MAX_NOMEAR) {
    const lote = candidatos.slice(i, i + MAX_NOMEAR);
    let sug;
    try { sug = await sugerirNomes(tenantId, lote.map(c => ({ id: c.id, nome: c.nome, texto: c.texto, contexto: c.contexto }))); }
    catch (e) { console.error('[vdocs nome-ia]', e.message); break; } // sem cota/IA fora: tenta no próximo ciclo
    usado += lote.length;
    const porId = new Map(sug.map(x => [x.id, x]));
    for (const c of lote) {
      const tags = j.parse(c.tags, []);
      const x = porId.get(c.id);
      if (x) {
        docs.atualizarDocumento(tenantId, c.id, {
          nome: x.nome, tags: tags.concat('nome-ia'),
          descricao: `Arquivo original: ${c.nome}` + (c.descricao ? ' · ' + c.descricao : ''),
        }, ator, 'rotina');
        nomeados++;
      } else {
        docs.atualizarDocumento(tenantId, c.id, { tags: tags.concat('nome-ia-sem') }, ator, 'rotina');
      }
    }
    repo.auditar(tenantId, ator, 'entrada.nomear_auto', 'documents', '', { documentos: lote.length, nomeados: lote.filter(c => porId.has(c.id)).length }, 'rotina');
  }
  return nomeados;
}

/** Quem cadastrou esta conta? Só vale se for UMA empresa ativa (conta repetida em duas empresas é ambígua e não entra). */
function tenantDoCanal(tipo, identificador) {
  const ident = normalizar(tipo, identificador);
  const linhas = db.prepare(`SELECT DISTINCT c.tenant_id FROM canais_entrada c JOIN tenants t ON t.id = c.tenant_id
    WHERE c.tipo = ? AND c.identificador = ? AND c.ativo = 1 AND t.status IN ('trial', 'ativa', 'cortesia')`).all(tipo, ident);
  return linhas.length === 1 ? linhas[0].tenant_id : null;
}

function resumo(tenantId) {
  const t = String(tenantId);
  const porStatus = db.prepare('SELECT status, COUNT(*) n FROM entradas_log WHERE tenant_id = ? AND criado_em >= ? GROUP BY status')
    .all(t, new Date(Date.now() - 86400000).toISOString());
  return {
    ultimas_24h: Object.fromEntries(porStatus.map(r => [r.status, r.n])),
    pendentes_triagem: db.prepare("SELECT COUNT(*) n FROM entradas_log WHERE tenant_id = ? AND triagem = 'pendente'").get(t).n,
  };
}
const recentes = (tenantId, limite = 50) =>
  db.prepare(`SELECT l.id, l.remetente, l.arquivo_nome, l.tamanho, l.status, l.motivo, l.triagem, l.document_id, l.criado_em,
      c.tipo, c.identificador, c.rotulo
    FROM entradas_log l LEFT JOIN canais_entrada c ON c.id = l.canal_id
    WHERE l.tenant_id = ? ORDER BY l.criado_em DESC LIMIT ?`).all(String(tenantId), Math.min(Math.max(1, Number(limite) || 50), 200));

module.exports = {
  PASTA_PADRAO, PASTA_PROPAGANDA, TAG_BAIXA_STAYS, classificarGrupo, EXT_ACEITAS, canonFone, normalizar, sugerirTipo,
  listarCanais, criarCanal, atualizarCanal, excluirCanal, canaisAtivos, receber,
  pendentesTriagem, decidirTriagem, resumo, recentes,
  tenantDoCanal, nomearComIA, nomearAutoAtivo, definirNomearAuto, rotinaNomesAuto, diagnosticoNomes, listarRemetentesPropaganda, adicionarRemetentesPropaganda, removerRemetentePropaganda, nomeDoRemetente,
  avisoTriagemDisponivel, avisoTriagemAtivo, definirAvisoTriagem, dadosAvisoTriagem,
};
