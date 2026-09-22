// =====================================================================
// Comunicados — LGPD: esquecer quem saiu e não guardar para sempre.
//
// Duas rotinas, uma vez por dia:
//
//   1. ESQUECER (art. 18, VI — eliminação): a central não sabe quando
//      alguém exclui a conta num produto, porque a exclusão acontece lá.
//      Então ela CONFERE: para cada pessoa que aparece nas conversas, nas
//      entregas ou nas leituras, pergunta ao produto se a conta ainda
//      existe. Sumiu (ou virou 'excluido'), some aqui também — conversas,
//      mensagens, anexos, leituras — e a entrega perde nome e destino,
//      preservando só o número (quantos receberam aquele comunicado).
//
//      O que NÃO se apaga: a linha de descadastro. Quem pediu para não
//      receber tem de continuar não recebendo; apagar isso faria a pessoa
//      voltar a ser contatada no dia em que recriasse a conta. É o mínimo
//      necessário para cumprir o próprio pedido dela.
//
//   2. RETENÇÃO (2 anos, decisão do Augusto em 22/09/2026): conversa
//      encerrada e parada há mais de 2 anos é apagada com os anexos; a
//      entrega mais velha que isso perde nome e destino.
// =====================================================================
'use strict';
const { db, nowISO } = require('./db');
const fontes = require('./fontes');
const anexos = require('./anexos');

const DIAS_RETENCAO = Number(process.env.COMUNICADOS_RETENCAO_DIAS || 730);
const anonimo = (produto, ref) => `removido:${produto}:${String(ref).slice(0, 12)}`;

/** Apaga tudo o que identifica uma pessoa. Idempotente. */
async function esquecer(produto, ref) {
  const out = { conversas: 0, entregas: 0, leituras: 0, anexos: 0 };
  for (const c of db.prepare('SELECT id FROM conversas WHERE produto = ? AND usuario_ref = ?').all(produto, ref)) {
    out.anexos += anexos.porConversa(c.id).length;
    await anexos.apagarDaConversa(c.id);
    db.prepare('DELETE FROM mensagens WHERE conversa_id = ?').run(c.id);
    db.prepare('DELETE FROM conversas WHERE id = ?').run(c.id);
    out.conversas++;
  }
  out.leituras = Number(db.prepare('DELETE FROM leituras WHERE produto = ? AND usuario_ref = ?').run(produto, ref).changes || 0);
  // A entrega continua existindo (o número de quem recebeu é registro do
  // envio), mas sem nada que identifique a pessoa. `chave` também sai: ela
  // guarda o e-mail/telefone que deduplicou o envio.
  out.entregas = Number(db.prepare(`UPDATE entregas SET nome = NULL, destino = '', usuario_ref = ?, chave = ? || '|' || id
    WHERE produto = ? AND usuario_ref = ?`).run(anonimo(produto, ref), anonimo(produto, ref), produto, ref).changes || 0);
  return out;
}

/** Quem aparece na central, por produto. */
function pessoasNaCentral() {
  return db.prepare(`SELECT produto, usuario_ref FROM conversas
    UNION SELECT produto, usuario_ref FROM entregas
    UNION SELECT produto, usuario_ref FROM leituras`).all()
    .filter((p) => p.usuario_ref && !String(p.usuario_ref).startsWith('removido:'));
}

/** Passa em todo mundo e esquece quem não existe mais no produto. */
async function reconciliar() {
  const out = { conferidas: 0, esquecidas: 0, produtos_sem_resposta: [] };
  const porProduto = new Map();
  for (const p of pessoasNaCentral()) {
    if (!porProduto.has(p.produto)) porProduto.set(p.produto, []);
    porProduto.get(p.produto).push(String(p.usuario_ref));
  }
  for (const [produto, refs] of porProduto) {
    let situacao;
    try { situacao = await fontes.situacaoDeVarios(produto, refs); }
    catch (e) { out.produtos_sem_resposta.push({ produto, erro: e.message }); continue; }
    for (const ref of refs) {
      out.conferidas++;
      // Só esquece com resposta EXPLÍCITA de "não existe mais". Produto que
      // falhou ao responder não apaga nada — erro de leitura não é exclusão.
      if (situacao.get(ref) === 'excluida') { await esquecer(produto, ref); out.esquecidas++; }
    }
  }
  return out;
}

/** Retenção: 2 anos para conversa encerrada; idem para a entrega. */
async function aplicarRetencao() {
  const limite = new Date(Date.now() - DIAS_RETENCAO * 864e5).toISOString();
  const out = { conversas: 0, entregas: 0 };
  for (const c of db.prepare("SELECT id FROM conversas WHERE status <> 'aberta' AND atualizado_em < ?").all(limite)) {
    await anexos.apagarDaConversa(c.id);
    db.prepare('DELETE FROM mensagens WHERE conversa_id = ?').run(c.id);
    db.prepare('DELETE FROM conversas WHERE id = ?').run(c.id);
    out.conversas++;
  }
  out.entregas = Number(db.prepare(`UPDATE entregas SET nome = NULL, destino = '', chave = 'antigo|' || id
    WHERE atualizado_em < ? AND destino <> ''`).run(limite).changes || 0);
  return out;
}

let _ultima = null;
async function rodar() {
  const t0 = Date.now();
  const r = { quando: nowISO(), retencao_dias: DIAS_RETENCAO };
  try { r.exclusoes = await reconciliar(); } catch (e) { r.erro_exclusoes = e.message; }
  try { r.retencao = await aplicarRetencao(); } catch (e) { r.erro_retencao = e.message; }
  r.ms = Date.now() - t0;
  _ultima = r;
  const n = (r.exclusoes && r.exclusoes.esquecidas) || 0, v = (r.retencao && r.retencao.conversas) || 0;
  if (n || v) console.log(`[comunicados/lgpd] ${n} conta(s) esquecida(s), ${v} conversa(s) vencida(s)`);
  return r;
}
const ultima = () => _ultima;

module.exports = { esquecer, reconciliar, aplicarRetencao, rodar, ultima, DIAS_RETENCAO };
