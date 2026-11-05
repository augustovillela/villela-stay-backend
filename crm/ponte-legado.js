// =====================================================================
// Villela CRM — PONTE do CRM legado (Portal Staff) para o CRM novo.
//
// Tudo que o legado recebe (contato novo do site/WhatsApp/Stays, mensagem,
// mudança de estágio ou de próxima ação) é espelhado, no mesmo instante, na
// empresa interna `villela-stay` do CRM novo. É ADITIVA e à prova de falha:
//  • nunca altera nem apaga nada do legado (o legado segue gravando como sempre);
//  • qualquer erro aqui é registrado e engolido — nunca derruba a gravação do legado;
//  • sem a empresa `villela-stay` criada, não faz nada;
//  • CRM_PONTE=off desliga.
//
// Ganchos (server.js): `salvarContatos` -> depois(antes, contatos)
//                      `addAtividade`   -> atividade(contatoLegado, atividade)
// =====================================================================
'use strict';
const { transacao } = require('./db');
const repo = require('./repo');
const imp = require('./importar-legado');

const slug = () => process.env.CRM_PONTE_SLUG || 'villela-stay';
const ligada = () => String(process.env.CRM_PONTE || 'on').toLowerCase() !== 'off';
const tenant = () => { try { return repo.Tenants.porSlug(slug()) || null; } catch (_) { return null; } };

// O que, no legado, importa para o CRM novo. `atualizadoEm` fica de fora de propósito.
const impressao = (c) => [c.estagio, c.nome, c.telefone, c.email, JSON.stringify(c.proximaAcao || {}), c.valorEstimado,
  JSON.stringify(c.periodo || {}), c.motivoPerda, c.imovelInteresse, c.staysReservationId, c.staysClientId, c.dono].join('|');

const util = (l) => !!(l && (l.telefone || l.email || l.nome));

function espelhar(t, l, ativs) {
  const ctx = imp.contexto(t);
  const r = imp.resultadoVazio(1);
  transacao(() => imp.espelharContato(ctx, l, { ativs, acompanhar: true, r }));
  return r;
}

/** Depois de gravar contatos.json: espelha só os contatos que mudaram (ou nasceram). */
function depois(antes, contatos) {
  if (!ligada() || !Array.isArray(contatos)) return 0;
  const t = tenant(); if (!t) return 0;
  const ant = new Map((antes || []).map((c) => [c.id, impressao(c)]));
  let n = 0;
  for (const l of contatos) {
    if (!util(l) || ant.get(l.id) === impressao(l)) continue;
    try { espelhar(t, l, []); n++; } catch (e) { console.error('[ponte crm] contato', l.id, e.message); }
  }
  return n;
}

/** Depois de gravar uma atividade do legado: leva a mesma atividade (mesma data) ao CRM novo. */
function atividade(l, a) {
  if (!ligada() || !util(l) || !a) return false;
  // a nota de criação o CRM novo já faz sozinho ao criar o contato
  if (a.tipo === 'nota' && /^Contato criado/.test(String(a.texto || ''))) return false;
  const t = tenant(); if (!t) return false;
  try { espelhar(t, l, [{ ...a, contatoId: l.id }]); return true; } catch (e) { console.error('[ponte crm] atividade', l.id, e.message); return false; }
}

module.exports = { depois, atividade, impressao };
