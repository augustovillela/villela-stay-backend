// =====================================================================
// Musique Cifras — O PORTÃO DE ACESSO da banda e da cifra.
//
// Mesma lição do `organizacoes.js` (ADR-0007): regra de permissão
// duplicada vaza pelo caminho novo. Por isso quem precisa saber "esta
// pessoa pode editar este arranjo?" pergunta AQUI, e nenhuma rota monta
// a comparação de papel na mão. O selftest varre os arquivos do módulo e
// falha se achar `banda_membros` consultado fora deste portão (e dos
// dois lugares legados que já existiam: repertorio.js e direitos.js).
//
// O que é da OBRA (titularidade, público, banda, IA) continua sendo do
// `direitos.js`. Aqui mora o que é da BANDA: papéis e poderes.
// =====================================================================
'use strict';
const { db } = require('../db');
const direitos = require('../direitos');

// Papéis, do mais ao menos poderoso. Os dois nomes da Fase 2 ("dono" e
// "integrante") continuam válidos no banco e são lidos como os novos.
const PAPEIS = ['proprietario', 'admin', 'maestro', 'editor', 'musico', 'convidado'];
const LEGADO = { dono: 'proprietario', integrante: 'musico' };
const ROTULO = {
  proprietario: 'Proprietário', admin: 'Administrador', maestro: 'Diretor musical / maestro',
  editor: 'Editor', musico: 'Músico', convidado: 'Convidado (só leitura)',
};

// O que cada papel pode. Uma tabela só, lida por `pode()`.
const PODERES = {
  ver: PAPEIS,
  comentar: ['proprietario', 'admin', 'maestro', 'editor', 'musico'],
  editar_cifra: ['proprietario', 'admin', 'maestro', 'editor'],
  editar_arranjo: ['proprietario', 'admin', 'maestro', 'editor'],
  aprovar: ['proprietario', 'admin', 'maestro'],
  // o músico edita o setlist da banda (comportamento da Fase 2: travar em
  // "só o dono" deixaria a banda refém de uma pessoa na passagem de som)
  editar_setlist: ['proprietario', 'admin', 'maestro', 'editor', 'musico'],
  conduzir_sessao: ['proprietario', 'admin', 'maestro'],
  compartilhar_obra: ['proprietario', 'admin', 'maestro', 'editor', 'musico'],
  gerir_membros: ['proprietario', 'admin'],
  criar_tarefa: ['proprietario', 'admin', 'maestro', 'editor'],
  transferir: ['proprietario'],
  excluir_banda: ['proprietario'],
};

const normalizarPapel = (p) => LEGADO[p] || (PAPEIS.includes(p) ? p : null);

function papel(bandaId, usuario) {
  if (!bandaId || !usuario) return null;
  const l = db.prepare('SELECT papel FROM banda_membros WHERE banda_id = ? AND usuario = ?').get(bandaId, usuario);
  return l ? normalizarPapel(l.papel) : null;
}

function pode(bandaId, usuario, poder) {
  const p = papel(bandaId, usuario);
  if (!p) return false;
  return (PODERES[poder] || []).includes(p);
}

/** Lança 403 quando não pode — o formato que as rotas já tratam. */
function exigir(bandaId, usuario, poder, msg) {
  if (!pode(bandaId, usuario, poder)) {
    const e = new Error(msg || 'Seu papel nesta banda não permite isto.');
    e.status = 403; e.bloqueioDeDireitos = true;
    throw e;
  }
}

const bandasDe = (usuario) => db.prepare(
  `SELECT b.*, m.papel FROM bandas b JOIN banda_membros m ON m.banda_id = b.id WHERE m.usuario = ? ORDER BY b.nome`)
  .all(usuario).map((b) => ({ ...b, papel: normalizarPapel(b.papel) }));

const membros = (bandaId) => db.prepare('SELECT * FROM banda_membros WHERE banda_id = ? ORDER BY entrou_em')
  .all(bandaId).map((m) => ({ ...m, papel: normalizarPapel(m.papel) }));

/** Bandas com as quais a obra está compartilhada E das quais a pessoa faz parte. */
const bandasDaObraPara = (obraId, usuario) => db.prepare(
  `SELECT bo.banda_id, m.papel FROM banda_obras bo JOIN banda_membros m ON m.banda_id = bo.banda_id
   WHERE bo.obra_id = ? AND m.usuario = ?`).all(obraId, usuario).map((x) => ({ banda_id: x.banda_id, papel: normalizarPapel(x.papel) }));

// ---------------------------------------------------------------------
// Cifra e arranjo
// ---------------------------------------------------------------------
function obraDe(cifra) {
  return cifra ? db.prepare('SELECT * FROM obras WHERE id = ?').get(cifra.obra_id) : null;
}

/** Ver a cifra = ver a obra (dono, banda, público — regra do direitos). */
function podeVerCifra(cifra, usuario) {
  if (!cifra) return { pode: false, motivo: 'Cifra não encontrada.' };
  if (cifra.removido_em && cifra.criado_por !== usuario) return { pode: false, motivo: 'Esta cifra foi removida.' };
  return direitos.podeVer(obraDe(cifra), usuario);
}

/** Editar a cifra (criar revisão): o dono da obra, ou quem tem papel de
 *  editor numa banda com a qual a obra foi compartilhada. */
function podeEditarCifra(cifra, usuario) {
  const obra = obraDe(cifra);
  if (!obra) return false;
  if (obra.dono === usuario) return true;
  return bandasDaObraPara(obra.id, usuario).some((b) => PODERES.editar_cifra.includes(b.papel));
}

function podeEditarArranjo(arranjo, usuario) {
  if (!arranjo) return false;
  if (!arranjo.banda_id) return arranjo.criado_por === usuario;
  return pode(arranjo.banda_id, usuario, 'editar_arranjo');
}

function podeVerArranjo(arranjo, usuario) {
  if (!arranjo) return false;
  if (!arranjo.banda_id) return arranjo.criado_por === usuario;
  return pode(arranjo.banda_id, usuario, 'ver');
}

module.exports = {
  PAPEIS, ROTULO, PODERES, normalizarPapel, papel, pode, exigir, bandasDe, membros, bandasDaObraPara,
  podeVerCifra, podeEditarCifra, podeEditarArranjo, podeVerArranjo, obraDe,
};
