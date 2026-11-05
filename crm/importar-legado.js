// =====================================================================
// Villela CRM — espelho do CRM LEGADO do Portal Staff numa empresa (tenant).
// Fonte: DATA_DIR/contatos.json + DATA_DIR/atividades.jsonl. NUNCA altera nem
// apaga nada do legado: só lê. Usado em dois modos:
//
//  1) importar()  — carga única/repetível (botão no staff). Idempotente: só
//     acrescenta o que falta, e nunca mexe no que já existe no CRM novo.
//  2) espelharContato(..., { acompanhar: true }) — a "ponte" ao vivo
//     (crm/ponte-legado.js): cada contato/mensagem nova do legado chega
//     também ao CRM novo; avanço de estágio e troca de próxima ação também.
//
// O que leva: contatos (dedupe por telefone/e-mail) com a data ORIGINAL, canal
// de entrada, responsável e vínculo com a Stays no "obs"; oportunidades
// (abertas e PERDIDAS); histórico com as datas originais; e a "próxima ação"
// do legado como TAREFA (origem 'automacao', obs "Importado do CRM legado").
//
// `simular: true` executa o caminho INTEIRO numa transação e a desfaz no fim:
// os números são exatamente os de uma importação real.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { db, transacao, hojeISO, novoId, DATA_DIR } = require('./db');
const appRepo = require('./app-repo');

const MARCA = 'Importado do CRM legado';
const mapaOrigem = { 'whatsapp-business': 'whatsapp', 'whatsapp-pessoal': 'whatsapp', manual: 'importacao' };
const mapaEstagio = { novo: 0, contato: 1, orcamento: 3, negociacao: 4, reserva: 5 };
const TIPOS_ATIV = ['nota', 'mensagem-enviada', 'mensagem-recebida', 'email', 'whatsapp', 'ligacao', 'proposta', 'tarefa', 'mudanca-estagio', 'mudanca-responsavel', 'campanha', 'automacao', 'reserva', 'pagamento', 'documento', 'criacao', 'ganho', 'perda', 'ia'];
const CANAIS = ['whatsapp', 'email', 'telefone', 'sms', 'messenger', 'instagram', 'tiktok', 'linkedin', 'site', 'chat', 'manual'];
const INTERACAO = ['mensagem-enviada', 'mensagem-recebida', 'email', 'whatsapp', 'ligacao'];

class Simulacao extends Error { constructor(resultado) { super('simulacao'); this.resultado = resultado; } }

const lerJSON = (arq, padrao) => {
  const f = path.join(DATA_DIR, arq);
  if (!fs.existsSync(f)) return padrao;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
};
const lerJSONL = (arq) => {
  const f = path.join(DATA_DIR, arq);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
};
const iso = (v) => (v && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : '');
const maior = (a, b) => (String(a) >= String(b) ? a : b);

// Contexto reutilizável: funil da hospedagem, estágios e comandos preparados.
function contexto(tenant) {
  const tid = tenant.id;
  const funil = appRepo.Funis.listar(tid).find((f) => f.slug === 'hospedagem') || appRepo.Funis.padrao(tid);
  return {
    tid, funil, hoje: hojeISO(),
    abertos: funil.estagios.filter((e) => e.tipo === 'aberto'),
    estPerdido: funil.estagios.find((e) => e.tipo === 'perdido'),
    estGanho: funil.estagios.find((e) => e.tipo === 'ganho'),
    jaTemAtiv: db.prepare('SELECT 1 FROM crm_atividades WHERE tenant_id = ? AND contato_id = ? AND tipo = ? AND data = ? AND texto = ?'),
    insAtiv: db.prepare('INSERT INTO crm_atividades (id, tenant_id, contato_id, oportunidade_id, tipo, canal, texto, autor, data) VALUES (?,?,?,?,?,?,?,?,?)'),
    jaTemTarefa: db.prepare('SELECT 1 FROM crm_tarefas WHERE tenant_id = ? AND contato_id = ? AND titulo = ? AND vence_em = ?'),
    ultimaOpp: db.prepare('SELECT * FROM crm_oportunidades WHERE tenant_id = ? AND contato_id = ? ORDER BY criado_em DESC LIMIT 1'),
    tarefasDoEspelho: db.prepare("SELECT id FROM crm_tarefas WHERE tenant_id = ? AND contato_id = ? AND status = 'aberta' AND origem = 'automacao' AND obs = ?"),
    ajustaContato: db.prepare('UPDATE crm_contatos SET criado_em = ?, atualizado_em = ? WHERE tenant_id = ? AND id = ?'),
    ajustaOpp: db.prepare('UPDATE crm_oportunidades SET criado_em = ? WHERE tenant_id = ? AND id = ?'),
    porIdLegado: db.prepare("SELECT id FROM crm_contatos WHERE tenant_id = ? AND obs LIKE ? LIMIT 1"),
    fixaUltima: db.prepare('UPDATE crm_contatos SET ultima_interacao = ? WHERE tenant_id = ? AND id = ?'),
  };
}

// Mesma regra na importação e na ponte: é o que faz o dedupe (data+texto) funcionar entre as duas.
const normAtividade = (a, padraoData) => ({
  tipo: TIPOS_ATIV.includes(a.tipo) ? a.tipo : 'nota',
  canal: CANAIS.includes(a.canal) ? a.canal : '',
  texto: String(a.texto || '').slice(0, 4000),
  autor: String(a.autor || 'legado').slice(0, 120),
  data: iso(a.data) || padraoData || new Date().toISOString(),
});

// Grava a atividade se ainda não existir. true = gravou.
function gravarAtividade(ctx, cid, a) {
  if (ctx.jaTemAtiv.get(ctx.tid, cid, a.tipo, a.data, a.texto)) return false;
  ctx.insAtiv.run(novoId(), ctx.tid, cid, '', a.tipo, a.canal, a.texto, a.autor, a.data);
  return true;
}

// Espelha UM contato do legado. `acompanhar: true` (ponte ao vivo) também empurra avanço de
// estágio e troca de próxima ação de quem já existia; a importação NÃO mexe no que já existe.
function espelharContato(ctx, l, { ativs = [], acompanhar = false, r }) {
  const { tid } = ctx;
  const stays = [l.staysClientId && `cliente ${l.staysClientId}`, l.staysReservationId && `reserva ${l.staysReservationId}`].filter(Boolean).join(' · ');
  const periodo = l.periodo && (l.periodo.checkin || l.periodo.checkout) ? `${l.periodo.checkin || '?'} a ${l.periodo.checkout || '?'}` : '';
  const obs = [l.preferencias, `[${MARCA} {legado:${l.id}}${l.origem ? ' · origem ' + l.origem : ''}${stays ? ' · Stays ' + stays : ''}${periodo ? ' · período ' + periodo : ''}]`].filter(Boolean).join('\n');
  const criadoEm = iso(l.criadoEm);
  const pa = l.proximaAcao || {};

  // sem telefone nem e-mail não há chave de dedupe: acha pelo id do legado gravado no obs
  const semChave = !appRepo.normTelefone(l.telefone) && !String(l.email || '').trim();
  const jaImportado = semChave && l.id ? ctx.porIdLegado.get(tid, `%{legado:${l.id}}%`) : null;
  const c = jaImportado ? { contato: appRepo.Contatos.obter(tid, jaImportado.id), existente: true } : appRepo.Contatos.criar(tid, {
    nome: l.nome, telefone: l.telefone, email: l.email,
    tipo: ['hospedado', 'posvenda'].includes(l.estagio) ? 'hospede' : 'lead-hospedagem',
    origem: mapaOrigem[l.origem] || (appRepo.ORIGENS.includes(l.origem) ? l.origem : 'outro'),
    canal_entrada: l.origem || l.canal || '',
    produto_interesse: l.imovelInteresse, ticket_centavos: Math.round((Number(l.valorEstimado) || 0) * 100),
    responsavel: l.dono || '', tags: ['legado'], obs,
    proxima_acao: pa.descricao || '', proxima_acao_em: pa.data || '',
    motivo_perda: l.motivoPerda || '', consentimento: l.consentimento || {},
  }, acompanhar ? 'ponte-legado' : 'importacao-legado');
  const cid = c.contato.id;
  const ultimaAntes = c.existente ? (c.contato.ultima_interacao || '') : '';
  if (c.existente) r.existentes++; else {
    r.criados++;
    if (criadoEm) ctx.ajustaContato.run(criadoEm, iso(l.atualizadoEm) || criadoEm, tid, cid);
  }

  // oportunidade
  const opp = ctx.ultimaOpp.get(tid, cid);
  const alvoAberto = mapaEstagio[l.estagio] != null ? ctx.abertos[Math.min(mapaEstagio[l.estagio], ctx.abertos.length - 1)] : null;
  if (!opp) {
    if (alvoAberto) {
      const o = appRepo.Oportunidades.criar(tid, {
        contato_id: cid, funil_id: ctx.funil.id, estagio_id: alvoAberto.id,
        titulo: `Hospedagem — ${l.nome || l.telefone || 'lead'}`, produto: l.imovelInteresse || '',
        valor_centavos: Math.round((Number(l.valorEstimado) || 0) * 100), previsao: (l.periodo || {}).checkin || '',
      }, 'importacao-legado');
      if (criadoEm) ctx.ajustaOpp.run(criadoEm, tid, o.id);
      r.oportunidades++;
    } else if (l.estagio === 'perdido' && ctx.estPerdido) {
      const o = appRepo.Oportunidades.criar(tid, {
        contato_id: cid, funil_id: ctx.funil.id, estagio_id: ctx.abertos[0].id,
        titulo: `Hospedagem — ${l.nome || l.telefone || 'lead'}`, produto: l.imovelInteresse || '',
        valor_centavos: Math.round((Number(l.valorEstimado) || 0) * 100),
      }, 'importacao-legado');
      appRepo.Oportunidades.mover(tid, o.id, ctx.estPerdido.id, 'importacao-legado', l.motivoPerda || 'Perdido no CRM legado');
      if (criadoEm) ctx.ajustaOpp.run(criadoEm, tid, o.id);
      r.perdidas++;
    }
  } else if (acompanhar && opp.status === 'aberta') {
    // ponte ao vivo: o legado só AVANÇA o funil por evento automático; 'perdido' sempre vale
    const idxAtual = ctx.abertos.findIndex((e) => e.id === opp.estagio_id);
    if (l.estagio === 'perdido' && ctx.estPerdido) { appRepo.Oportunidades.mover(tid, opp.id, ctx.estPerdido.id, 'ponte-legado', l.motivoPerda || 'Perdido'); r.movidas++; }
    else if (['hospedado', 'posvenda'].includes(l.estagio) && ctx.estGanho) { appRepo.Oportunidades.mover(tid, opp.id, ctx.estGanho.id, 'ponte-legado', 'Hospedagem concluída'); r.movidas++; }
    else if (alvoAberto && ctx.abertos.indexOf(alvoAberto) > idxAtual) { appRepo.Oportunidades.mover(tid, opp.id, alvoAberto.id, 'ponte-legado'); r.movidas++; }
  }

  // histórico com as datas originais
  let ultima = ultimaAntes;
  for (const a0 of ativs) {
    const a = normAtividade(a0, criadoEm);
    if (!gravarAtividade(ctx, cid, a)) continue;
    if (INTERACAO.includes(a.tipo)) ultima = maior(ultima, a.data);
    r.atividades++;
  }

  // próxima ação -> tarefa (contato perdido não gera)
  if (pa.data && l.estagio !== 'perdido') {
    const titulo = String(pa.descricao || 'Follow-up').slice(0, 200);
    if (acompanhar && c.existente && (c.contato.proxima_acao !== (pa.descricao || '') || c.contato.proxima_acao_em !== pa.data)) {
      // a ação mudou no legado: conclui a(s) tarefa(s) espelhada(s) anterior(es) e grava a nova
      for (const t of ctx.tarefasDoEspelho.all(tid, cid, MARCA)) appRepo.Tarefas.concluir(tid, t.id, 'ponte-legado');
      appRepo.Contatos.atualizar(tid, cid, { proxima_acao: pa.descricao || '', proxima_acao_em: pa.data }, 'ponte-legado');
    }
    if (!ctx.jaTemTarefa.get(tid, cid, titulo, pa.data)) {
      appRepo.Tarefas.criar(tid, { contato_id: cid, titulo, vence_em: pa.data, origem: 'automacao', obs: MARCA, responsavel: l.dono || '' }, acompanhar ? 'ponte-legado' : 'importacao-legado');
      r.tarefas++;
      if (pa.data < ctx.hoje) r.tarefas_atrasadas++;
    }
  }
  // criar contato/tarefa marca "interação agora"; a única interação real é a do histórico
  ctx.fixaUltima.run(ultima, tid, cid);
  return cid;
}

const resultadoVazio = (total) => ({
  total_legado: total, criados: 0, existentes: 0, oportunidades: 0, perdidas: 0,
  atividades: 0, tarefas: 0, tarefas_atrasadas: 0, sem_contato: 0, movidas: 0,
});

function importar(tenant, { simular = false } = {}) {
  const legado = lerJSON('contatos.json', null);
  if (!Array.isArray(legado)) throw new Error('contatos.json não encontrado ou inválido em DATA_DIR.');
  const porContato = new Map();
  for (const a of lerJSONL('atividades.jsonl')) {
    if (!porContato.has(a.contatoId)) porContato.set(a.contatoId, []);
    porContato.get(a.contatoId).push(a);
  }
  const ctx = contexto(tenant);
  const r = resultadoVazio(legado.length);
  const executar = () => {
    for (const l of legado) {
      if (!l.telefone && !l.email && !l.nome) { r.sem_contato++; continue; }
      espelharContato(ctx, l, { ativs: porContato.get(l.id) || [], r });
    }
    if (simular) throw new Simulacao({ ...r });
  };
  try { transacao(executar); } catch (e) {
    if (e instanceof Simulacao) return { ...e.resultado, simulacao: true };
    throw e;
  }
  return { ...r, simulacao: false };
}

module.exports = { importar, contexto, espelharContato, gravarAtividade, normAtividade, resultadoVazio, INTERACAO, MARCA };
