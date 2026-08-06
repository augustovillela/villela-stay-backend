// =====================================================================
// Villela Growth OS — cofre de credenciais (AES-256-GCM).
//
// Token de plataforma NUNCA aparece em frontend, log, mensagem de erro,
// analytics, prompt de IA ou arquivo versionado (§28 do prompt). Por isso
// este módulo só devolve o valor em claro por uma função explícita, e o
// listar() devolve apenas metadados.
//
// Chave: GROWTH_SECRET_KEY (32 bytes em hex ou base64). Sem ela, gravar
// segredo FALHA — não há modo silencioso "sem criptografia".
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const tenancy = require('./tenancy');
const { nowISO } = require('./db');

const ALGO = 'aes-256-gcm';

/** Converte a variável de ambiente em 32 bytes, ou explica o que está errado. */
function materializar(bruta, nomeVar) {
  const buf = /^[0-9a-f]{64}$/i.test(bruta) ? Buffer.from(bruta, 'hex') : Buffer.from(bruta, 'base64');
  if (buf.length !== 32) {
    const e = new Error(`${nomeVar} precisa ter 32 bytes (64 hex ou 44 base64).`);
    e.status = 500; throw e;
  }
  return buf;
}

function chave() {
  const bruta = process.env.GROWTH_SECRET_KEY || '';
  if (!bruta) {
    const e = new Error('GROWTH_SECRET_KEY não configurada — o cofre não grava sem chave.');
    e.status = 500; e.configuracao = 'GROWTH_SECRET_KEY'; throw e;
  }
  return materializar(bruta, 'GROWTH_SECRET_KEY');
}

/**
 * Chave anterior — existe SÓ para ler durante uma rotação.
 * Trocar GROWTH_SECRET_KEY sem ela deixaria todo segredo ilegível de uma
 * vez, e em silêncio: o pior jeito de descobrir.
 */
function chaveAnterior() {
  const bruta = process.env.GROWTH_SECRET_KEY_ANTERIOR || '';
  if (!bruta) return null;
  try { return materializar(bruta, 'GROWTH_SECRET_KEY_ANTERIOR'); } catch { return null; }
}

/** Impressão digital da chave: identifica sem revelar (8 hex do sha256). */
const impressao = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const chaveAtualId = () => { try { return impressao(chave()); } catch { return ''; } };

const configurado = () => { try { chave(); return true; } catch { return false; } };

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const k = chave();
  const c = crypto.createCipheriv(ALGO, k, iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return {
    cifra: dados.toString('base64'), iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'), chaveId: impressao(k),
  };
}

function decifrarCom(k, { cifra, iv, tag }) {
  const d = crypto.createDecipheriv(ALGO, k, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(cifra, 'base64')), d.final()]).toString('utf8');
}

/** Tenta a chave atual; cai para a anterior enquanto a rotação não terminou. */
function decifrar(linha) {
  try { return decifrarCom(chave(), linha); } catch (e) {
    const antiga = chaveAnterior();
    if (!antiga) throw e;
    return decifrarCom(antiga, linha);
  }
}

/** Grava (ou substitui) um segredo da conta do contexto. */
function guardar({ escopo = 'conexao', refId = '', chave: nome, valor, expiraEm = '' }) {
  if (!nome) throw new Error('Segredo precisa de chave.');
  const tenantId = tenancy.tenantAtual();
  const { cifra, iv, tag, chaveId } = cifrar(valor);
  const existente = repo.um(
    'SELECT * FROM gx_segredos WHERE tenant_id = :tenant AND escopo = :escopo AND ref_id = :ref AND chave = :chave',
    { escopo, ref: refId, chave: nome }
  );
  if (existente) {
    repo.atualizar('gx_segredos', existente.id, { cifra, iv, tag, chave_id: chaveId, expira_em: expiraEm, rotacionado_em: nowISO() });
    repo.auditar({ acao: 'segredo.rotacionado', entidade: 'gx_segredos', entidadeId: existente.id, detalhe: `${escopo}:${nome}` });
    return existente.id;
  }
  const id = repo.inserir('gx_segredos', { escopo, ref_id: refId, chave: nome, cifra, iv, tag, chave_id: chaveId, expira_em: expiraEm });
  repo.auditar({ acao: 'segredo.guardado', entidade: 'gx_segredos', entidadeId: id, detalhe: `${escopo}:${nome}` });
  void tenantId;
  return id;
}

/**
 * Devolve o valor em claro. Uso restrito ao conector que vai chamar a API.
 * Nunca passe o retorno para resposta HTTP, log ou prompt.
 */
function revelar({ escopo = 'conexao', refId = '', chave: nome }) {
  const linha = repo.um(
    'SELECT * FROM gx_segredos WHERE tenant_id = :tenant AND escopo = :escopo AND ref_id = :ref AND chave = :chave',
    { escopo, ref: refId, chave: nome }
  );
  if (!linha) return null;
  return decifrar(linha);
}

/** Metadados apenas — sem cifra, sem iv, sem tag. É o que pode ir para tela. */
function listar({ escopo = null, refId = null } = {}) {
  const cond = [];
  const params = {};
  if (escopo) { cond.push('escopo = :escopo'); params.escopo = escopo; }
  if (refId !== null) { cond.push('ref_id = :ref'); params.ref = refId; }
  const linhas = repo.listar('gx_segredos', { onde: cond.join(' AND '), params, ordem: 'criado_em DESC' });
  return linhas.map(l => ({
    id: l.id, escopo: l.escopo, ref_id: l.ref_id, chave: l.chave,
    expira_em: l.expira_em, criado_em: l.criado_em, rotacionado_em: l.rotacionado_em,
    vencido: !!(l.expira_em && l.expira_em < nowISO()),
    chave_antiga: !!(l.chave_id && chaveAtualId() && l.chave_id !== chaveAtualId()),
  }));
}

function remover(id) {
  const n = repo.remover('gx_segredos', id);
  if (n) repo.auditar({ acao: 'segredo.removido', entidade: 'gx_segredos', entidadeId: id });
  return n;
}

/** Segredos vencendo nos próximos N dias — insumo do agente operacional. */
function vencendo(dias = 7) {
  const limite = new Date(Date.now() + dias * 86400000).toISOString();
  return listar().filter(s => s.expira_em && s.expira_em <= limite);
}

/**
 * Troca a credencial de uma conexão. Difere de `guardar` no que importa:
 * registra que foi ROTAÇÃO e devolve a conexão para verificação —
 * credencial nova que ninguém testou não é integração funcionando.
 */
function rotacionarCredencial({ escopo = 'conexao', refId = '', chave: nome, valor, expiraEm = '' }) {
  if (!String(valor || '').trim()) { const e = new Error('A credencial nova está vazia.'); e.status = 400; throw e; }
  const antes = repo.um(
    'SELECT * FROM gx_segredos WHERE tenant_id = :tenant AND escopo = :escopo AND ref_id = :ref AND chave = :chave',
    { escopo, ref: refId, chave: nome }
  );
  const id = guardar({ escopo, refId, chave: nome, valor, expiraEm });
  repo.auditar({
    acao: antes ? 'segredo.credencial_rotacionada' : 'segredo.credencial_definida',
    entidade: 'gx_segredos', entidadeId: id, detalhe: `${escopo}:${nome}`,
  });
  let saude = null;
  if (escopo === 'conexao' && refId) {
    try { saude = require('./canais').verificarSaude(refId); } catch (e) { saude = { ok: false, motivo: e.message }; }
  }
  return { id, primeira_vez: !antes, saude };
}

/**
 * Diagnóstico da chave-mestra, em escopo de PLATAFORMA. Não decifra nada:
 * só compara impressões digitais. Diz quantos segredos ainda estão na
 * chave antiga — ou seja, quanto falta da rotação.
 */
function diagnosticoChave() {
  const atual = chaveAtualId();
  const linhas = repo.qPlataforma('SELECT chave_id, COUNT(*) AS n FROM gx_segredos GROUP BY chave_id');
  const porChave = linhas.map((l) => ({
    chave_id: l.chave_id || '(desconhecida)', segredos: l.n, atual: !!atual && l.chave_id === atual,
  }));
  const naAntiga = porChave.filter((p) => !p.atual).reduce((s, p) => s + p.segredos, 0);
  return {
    configurada: configurado(),
    chave_atual: atual,
    tem_chave_anterior: !!chaveAnterior(),
    por_chave: porChave,
    pendentes_de_rotacao: naAntiga,
    pronto_para_remover_a_anterior: naAntiga === 0,
  };
}

/**
 * Re-cifra os segredos com a chave ATUAL. Escopo de plataforma, em lotes,
 * retomável: o que já está na chave certa é pulado.
 *
 * Procedimento (docs/growth-os/SECURITY.md):
 *   1. GROWTH_SECRET_KEY_ANTERIOR = chave velha
 *   2. GROWTH_SECRET_KEY = chave nova
 *   3. rodar até `pendentes_de_rotacao` zerar
 *   4. só então apagar GROWTH_SECRET_KEY_ANTERIOR
 *
 * O que sai daqui é contagem — nunca valor.
 */
function rotacionarChave({ limite = 500 } = {}) {
  const atual = chaveAtualId();
  if (!atual) { const e = new Error('Sem GROWTH_SECRET_KEY, não há para onde rotacionar.'); e.status = 500; throw e; }
  const linhas = repo.qPlataforma(
    "SELECT * FROM gx_segredos WHERE chave_id IS NULL OR chave_id = '' OR chave_id != :atual LIMIT :limite",
    { atual, limite: Math.min(Number(limite) || 500, 2000) }
  );
  let rotacionados = 0;
  const ilegiveis = [];
  for (const l of linhas) {
    let claro = null;
    try { claro = decifrar(l); } catch (_) { ilegiveis.push(l.id); continue; }
    const novo = cifrar(claro);
    claro = null;   // não deixa o valor pendurado numa variável viva
    repo.execPlataforma(
      'UPDATE gx_segredos SET cifra = :cifra, iv = :iv, tag = :tag, chave_id = :chaveId, rotacionado_em = :em WHERE id = :id',
      { cifra: novo.cifra, iv: novo.iv, tag: novo.tag, chaveId: novo.chaveId, em: nowISO(), id: l.id }
    );
    rotacionados++;
  }
  repo.auditar({
    acao: 'segredo.chave_rotacionada', entidade: 'gx_segredos', entidadeId: '',
    detalhe: `${rotacionados} re-cifrado(s), ${ilegiveis.length} ilegível(is)`,
  });
  if (ilegiveis.length) {
    // segredo que não abre com nenhuma chave é perda de dado: vira
    // incidente crítico, não uma linha de log que ninguém lê
    try {
      require('./incidentes').abrir({
        natureza: 'cofre', severidade: 'critica', refTipo: 'chave', refId: atual,
        titulo: `${ilegiveis.length} segredo(s) não abrem com nenhuma das chaves`,
        detalhe: 'Provável GROWTH_SECRET_KEY_ANTERIOR ausente ou errada. Estes segredos precisam ser redigitados.',
      });
    } catch (_) { /* incidente é melhor esforço */ }
  }
  return Object.assign({ rotacionados, ilegiveis: ilegiveis.length }, diagnosticoChave());
}

module.exports = {
  configurado, guardar, revelar, listar, remover, vencendo, cifrar, decifrar,
  rotacionarCredencial, rotacionarChave, diagnosticoChave, chaveAtualId,
};
