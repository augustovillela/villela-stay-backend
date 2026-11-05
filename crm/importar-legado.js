// =====================================================================
// Villela CRM — importação do CRM LEGADO do Portal Staff para uma empresa
// (tenant). Fonte: DATA_DIR/contatos.json + DATA_DIR/atividades.jsonl.
//
// O que leva (tudo idempotente — pode rodar de novo, só acrescenta o que falta):
//  • contatos (dedupe por telefone/e-mail), com a data ORIGINAL de criação,
//    canal de entrada, responsável e os vínculos com a Stays no campo "obs";
//  • oportunidades: estágio aberto vira oportunidade no funil de hospedagem;
//    "perdido" vira oportunidade PERDIDA (com o motivo) — para o histórico
//    inteiro aparecer nos relatórios; também cria a que faltou numa
//    importação antiga que só leu contatos novos;
//  • histórico (timeline) com as datas originais;
//  • a "próxima ação" do legado vira TAREFA (origem 'automacao', obs
//    "Importado do CRM legado") — é o que a aba Tarefas e a caixa de trabalho lêem.
//
// `simular: true` executa o caminho INTEIRO dentro de uma transação e a
// desfaz no fim: os números devolvidos são exatamente os de uma importação real.
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

function importar(tenant, { simular = false } = {}) {
  const legado = lerJSON('contatos.json', null);
  if (!Array.isArray(legado)) throw new Error('contatos.json não encontrado ou inválido em DATA_DIR.');
  const porContato = new Map();
  for (const a of lerJSONL('atividades.jsonl')) {
    if (!porContato.has(a.contatoId)) porContato.set(a.contatoId, []);
    porContato.get(a.contatoId).push(a);
  }

  const tid = tenant.id;
  const funil = appRepo.Funis.listar(tid).find((f) => f.slug === 'hospedagem') || appRepo.Funis.padrao(tid);
  const abertos = funil.estagios.filter((e) => e.tipo === 'aberto');
  const estPerdido = funil.estagios.find((e) => e.tipo === 'perdido');
  const hoje = hojeISO();

  const r = {
    total_legado: legado.length, criados: 0, existentes: 0, oportunidades: 0, perdidas: 0,
    atividades: 0, tarefas: 0, tarefas_atrasadas: 0, sem_contato: 0,
  };

  const jaTemAtiv = db.prepare('SELECT 1 FROM crm_atividades WHERE tenant_id = ? AND contato_id = ? AND tipo = ? AND data = ? AND texto = ?');
  const insAtiv = db.prepare('INSERT INTO crm_atividades (id, tenant_id, contato_id, oportunidade_id, tipo, canal, texto, autor, data) VALUES (?,?,?,?,?,?,?,?,?)');
  const jaTemTarefa = db.prepare('SELECT 1 FROM crm_tarefas WHERE tenant_id = ? AND contato_id = ? AND titulo = ? AND vence_em = ?');
  const temOpp = db.prepare('SELECT 1 FROM crm_oportunidades WHERE tenant_id = ? AND contato_id = ?');
  const ajustaContato = db.prepare('UPDATE crm_contatos SET criado_em = ?, atualizado_em = ? WHERE tenant_id = ? AND id = ?');
  const ajustaOpp = db.prepare('UPDATE crm_oportunidades SET criado_em = ? WHERE tenant_id = ? AND id = ?');
  const fixaUltima = db.prepare('UPDATE crm_contatos SET ultima_interacao = ? WHERE tenant_id = ? AND id = ?');

  const executar = () => {
    for (const l of legado) {
      if (!l.telefone && !l.email && !l.nome) { r.sem_contato++; continue; }
      const stays = [l.staysClientId && `cliente ${l.staysClientId}`, l.staysReservationId && `reserva ${l.staysReservationId}`].filter(Boolean).join(' · ');
      const periodo = l.periodo && (l.periodo.checkin || l.periodo.checkout) ? `${l.periodo.checkin || '?'} a ${l.periodo.checkout || '?'}` : '';
      const obs = [l.preferencias, `[${MARCA}${l.origem ? ' · origem ' + l.origem : ''}${stays ? ' · Stays ' + stays : ''}${periodo ? ' · período ' + periodo : ''}]`].filter(Boolean).join('\n');
      const criadoEm = iso(l.criadoEm);

      const c = appRepo.Contatos.criar(tid, {
        nome: l.nome, telefone: l.telefone, email: l.email,
        tipo: ['hospedado', 'posvenda'].includes(l.estagio) ? 'hospede' : 'lead-hospedagem',
        origem: mapaOrigem[l.origem] || (appRepo.ORIGENS.includes(l.origem) ? l.origem : 'outro'),
        canal_entrada: l.origem || l.canal || '',
        produto_interesse: l.imovelInteresse, ticket_centavos: Math.round((Number(l.valorEstimado) || 0) * 100),
        responsavel: l.dono || '', tags: ['legado'], obs,
        proxima_acao: (l.proximaAcao || {}).descricao || '', proxima_acao_em: (l.proximaAcao || {}).data || '',
        motivo_perda: l.motivoPerda || '', consentimento: l.consentimento || {},
      }, 'importacao-legado');
      const cid = c.contato.id;
      const ultimaAntes = c.existente ? (c.contato.ultima_interacao || '') : '';
      if (c.existente) r.existentes++; else {
        r.criados++;
        if (criadoEm) ajustaContato.run(criadoEm, iso(l.atualizadoEm) || criadoEm, tid, cid);
      }

      // oportunidade (a que faltar)
      if (!temOpp.get(tid, cid)) {
        if (mapaEstagio[l.estagio] != null) {
          const o = appRepo.Oportunidades.criar(tid, {
            contato_id: cid, funil_id: funil.id, estagio_id: abertos[Math.min(mapaEstagio[l.estagio], abertos.length - 1)].id,
            titulo: `Hospedagem — ${l.nome || l.telefone || 'lead'}`, produto: l.imovelInteresse || '',
            valor_centavos: Math.round((Number(l.valorEstimado) || 0) * 100), previsao: (l.periodo || {}).checkin || '',
          }, 'importacao-legado');
          if (criadoEm) ajustaOpp.run(criadoEm, tid, o.id);
          r.oportunidades++;
        } else if (l.estagio === 'perdido' && estPerdido) {
          const o = appRepo.Oportunidades.criar(tid, {
            contato_id: cid, funil_id: funil.id, estagio_id: abertos[0].id,
            titulo: `Hospedagem — ${l.nome || l.telefone || 'lead'}`, produto: l.imovelInteresse || '',
            valor_centavos: Math.round((Number(l.valorEstimado) || 0) * 100),
          }, 'importacao-legado');
          appRepo.Oportunidades.mover(tid, o.id, estPerdido.id, 'importacao-legado', l.motivoPerda || 'Perdido no CRM legado');
          if (criadoEm) ajustaOpp.run(criadoEm, tid, o.id);
          r.perdidas++;
        }
      }

      // histórico com as datas originais
      let ultima = ultimaAntes;
      for (const a of porContato.get(l.id) || []) {
        const tipo = TIPOS_ATIV.includes(a.tipo) ? a.tipo : 'nota';
        const data = iso(a.data) || criadoEm || new Date().toISOString();
        const texto = String(a.texto || '').slice(0, 4000);
        if (jaTemAtiv.get(tid, cid, tipo, data, texto)) continue;
        insAtiv.run(novoId(), tid, cid, '', tipo, CANAIS.includes(a.canal) ? a.canal : '', texto, String(a.autor || 'legado').slice(0, 120), data);
        if (['mensagem-enviada', 'mensagem-recebida', 'email', 'whatsapp', 'ligacao'].includes(tipo)) ultima = maior(ultima, data);
        r.atividades++;
      }

      // próxima ação -> tarefa (se o contato não está perdido)
      const pa = l.proximaAcao || {};
      if (pa.data && l.estagio !== 'perdido') {
        const titulo = String(pa.descricao || 'Follow-up').slice(0, 200);
        if (!jaTemTarefa.get(tid, cid, titulo, pa.data)) {
          appRepo.Tarefas.criar(tid, { contato_id: cid, titulo, vence_em: pa.data, origem: 'automacao', obs: MARCA, responsavel: l.dono || '' }, 'importacao-legado');
          r.tarefas++;
          if (pa.data < hoje) r.tarefas_atrasadas++;
        }
      }
      // criar contato/tarefa marca "interação agora"; aqui a única interação real é a do histórico
      fixaUltima.run(ultima, tid, cid);
    }
    if (simular) throw new Simulacao({ ...r });
  };

  try { transacao(executar); } catch (e) {
    if (e instanceof Simulacao) return { ...e.resultado, simulacao: true };
    throw e;
  }
  return { ...r, simulacao: false };
}

module.exports = { importar };
