// =====================================================================
// Núcleo · CRM legado do Portal Staff (read/write sobre contatos.json):
// funil/contatos/atividades/followups/métricas/SLA/receita prevista.
// ⚠️ É o CRM LEGADO do staff (/staff/api/crm/*), distinto do SaaS Villela
// CRM (/staff/api/vcrm/*). Extraído do server.js (Projeto 2). Os helpers
// (upsertContato, ingestStaysEvent, getListingMap) ficam no server.js e são
// injetados — o webhook da Stays e o analytics continuam usando os mesmos.
// deps: { requirePublishOrSession, podeCRM, lerContatos, salvarContatos, semAcento,
//   ESTAGIOS, hojeISO, upsertContato, lerAtividades, addAtividade, stays, getListingMap, DATA_DIR }
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

module.exports.montar = function montar(app, deps) {
  const { requirePublishOrSession, podeCRM, lerContatos, salvarContatos, semAcento, ESTAGIOS,
    hojeISO, upsertContato, lerAtividades, addAtividade, stays, getListingMap, DATA_DIR } = deps;

  app.get('/staff/api/crm/contatos', requirePublishOrSession, podeCRM, (req, res) => {
    const { estagio, origem, busca } = req.query;
    let lista = lerContatos();
    if (estagio) lista = lista.filter(c => c.estagio === estagio);
    if (origem) lista = lista.filter(c => c.origem === origem);
    if (busca) {
      const q = semAcento(busca).trim();
      lista = lista.filter(c => [c.nome, c.telefone, c.email].some(v => semAcento(v).includes(q)));
    }
    res.json({ contatos: lista });
  });

  // Métricas do funil (contagem e valor por estágio)
  app.get('/staff/api/crm/funil', requirePublishOrSession, podeCRM, (req, res) => {
    const contatos = lerContatos();
    const porEstagio = {};
    for (const e of ESTAGIOS) porEstagio[e] = { n: 0, valor: 0 };
    let total = { n: 0, valor: 0 };
    for (const c of contatos) {
      const e = ESTAGIOS.includes(c.estagio) ? c.estagio : 'novo';
      porEstagio[e].n++; porEstagio[e].valor += Number(c.valorEstimado) || 0;
      if (e !== 'perdido') { total.n++; total.valor += Number(c.valorEstimado) || 0; }
    }
    res.json({ porEstagio, total }); // total exclui "perdido"
  });

  // Métricas do funil (Fase 5): conversão, valor no pipeline, por origem, motivos de perda, imóveis.
  app.get('/staff/api/crm/metricas', requirePublishOrSession, podeCRM, (req, res) => {
    const contatos = lerContatos();
    const porEstagio = {}; ESTAGIOS.forEach(e => porEstagio[e] = { n: 0, valor: 0 });
    const porOrigem = {}, motivosPerda = {}, porImovel = {};
    for (const c of contatos) {
      const e = ESTAGIOS.includes(c.estagio) ? c.estagio : 'novo';
      porEstagio[e].n++; porEstagio[e].valor += Number(c.valorEstimado) || 0;
      const o = c.origem || 'manual'; porOrigem[o] = (porOrigem[o] || 0) + 1;
      if (e === 'perdido') { const m = (c.motivoPerda || '').trim() || 'Sem motivo'; motivosPerda[m] = (motivosPerda[m] || 0) + 1; }
      if (c.imovelInteresse) porImovel[c.imovelInteresse] = (porImovel[c.imovelInteresse] || 0) + 1;
    }
    const ganhosEst = ['reserva', 'hospedado', 'posvenda'];
    const ganhos = ganhosEst.reduce((s, e) => s + porEstagio[e].n, 0);
    const perdidos = porEstagio['perdido'].n;
    const total = contatos.length;
    const pct = (a, b) => b ? Math.round((a / b) * 1000) / 10 : 0;
    res.json({
      total, ganhos, perdidos, emNegociacao: total - ganhos - perdidos,
      taxaConversao: pct(ganhos, total),
      taxaFechamento: pct(ganhos, ganhos + perdidos),
      pipelineValor: ['novo', 'contato', 'orcamento', 'negociacao'].reduce((s, e) => s + porEstagio[e].valor, 0),
      ganhosValor: ganhosEst.reduce((s, e) => s + porEstagio[e].valor, 0),
      porEstagio, porOrigem, motivosPerda,
      topImoveis: Object.entries(porImovel).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ imovel: k, n: v })),
    });
  });

  // Caixa de follow-ups: próximas ações vencidas ou para hoje
  app.get('/staff/api/crm/followups', requirePublishOrSession, podeCRM, (req, res) => {
    const hoje = hojeISO();
    const lista = lerContatos()
      .filter(c => c.estagio !== 'perdido' && c.proximaAcao && c.proximaAcao.data && c.proximaAcao.data <= hoje)
      .sort((a, b) => String(a.proximaAcao.data).localeCompare(String(b.proximaAcao.data)));
    res.json({ followups: lista });
  });

  // Criar contato (dedupe por telefone/e-mail)
  app.post('/staff/api/crm/contatos', requirePublishOrSession, podeCRM, (req, res) => {
    const d = req.body || {};
    if (!d.nome && !d.telefone && !d.contato && !d.email) return res.status(400).json({ erro: 'Informe ao menos nome e telefone/e-mail.' });
    const { contato, novo } = upsertContato(d);
    res.json({ ok: true, novo, contato });
  });

  // Detalhe do contato + linha do tempo
  app.get('/staff/api/crm/contatos/:id', requirePublishOrSession, podeCRM, (req, res) => {
    const c = lerContatos().find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
    res.json({ contato: c, atividades: lerAtividades(c.id) });
  });

  // Histórico do cliente na Stays (Fase 4): reservas e gasto, para contatos vinculados (staysClientId).
  app.get('/staff/api/crm/contatos/:id/stays', requirePublishOrSession, podeCRM, async (req, res) => {
    const c = lerContatos().find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
    if (!c.staysClientId) return res.json({ vinculado: false });
    try {
      const cli = await stays(`/booking/clients/${c.staysClientId}`);
      const mapa = await getListingMap();
      const reservas = (Array.isArray(cli.reservations) ? cli.reservations : []).map(r => ({
        id: r.id, type: r.type, checkin: r.checkInDate, checkout: r.checkOutDate,
        imovel: (mapa[r._idlisting] && mapa[r._idlisting].codigo) || '',
        imovelTitulo: (mapa[r._idlisting] && mapa[r._idlisting].titulo) || '',
        valor: (r.price && r.price._f_total) || 0,
        hospedes: r.guests || (r.guestsDetails && r.guestsDetails.adults) || null,
      })).sort((a, b) => String(b.checkin).localeCompare(String(a.checkin)));
      const efetivas = reservas.filter(r => ['booked', 'reserved', 'contract'].includes(r.type));
      const totalGasto = efetivas.reduce((s, r) => s + (Number(r.valor) || 0), 0);
      res.json({ vinculado: true, totalReservas: efetivas.length, totalGasto, reservas });
    } catch (e) { console.error('[crm stays]', e.message); res.status(502).json({ erro: 'Falha ao consultar a Stays.' }); }
  });

  // Atualizar contato (estágio, próxima ação, valor, imóvel, período, preferências, nome, e-mail)
  app.patch('/staff/api/crm/contatos/:id', requirePublishOrSession, podeCRM, (req, res) => {
    const contatos = lerContatos();
    const c = contatos.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
    const d = req.body || {};
    if (d.estagio !== undefined) {
      if (!ESTAGIOS.includes(d.estagio)) return res.status(400).json({ erro: 'Estágio inválido.' });
      if (d.estagio !== c.estagio) { addAtividade(c.id, 'mudanca-estagio', `${c.estagio} → ${d.estagio}`, '', req.viaChave ? 'sistema' : req.user.nome); c.estagio = d.estagio; }
    }
    if (d.proximaAcao !== undefined) c.proximaAcao = { descricao: String(d.proximaAcao.descricao || ''), data: String(d.proximaAcao.data || '') };
    if (d.valorEstimado !== undefined) c.valorEstimado = d.valorEstimado === null ? null : Number(d.valorEstimado);
    if (d.imovelInteresse !== undefined) c.imovelInteresse = String(d.imovelInteresse);
    if (d.periodo !== undefined) c.periodo = { checkin: d.periodo.checkin || '', checkout: d.periodo.checkout || '', hospedes: d.periodo.hospedes || '' };
    if (d.preferencias !== undefined) c.preferencias = String(d.preferencias);
    if (d.nome !== undefined) c.nome = String(d.nome);
    if (d.email !== undefined) c.email = String(d.email).trim().toLowerCase();
    c.atualizadoEm = new Date().toISOString();
    salvarContatos(contatos);
    res.json({ ok: true, contato: c });
  });

  // Registrar atividade manual (nota/mensagem)
  app.post('/staff/api/crm/contatos/:id/atividade', requirePublishOrSession, podeCRM, (req, res) => {
    const c = lerContatos().find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
    const d = req.body || {};
    if (!d.texto) return res.status(400).json({ erro: 'texto é obrigatório.' });
    const tipo = ['mensagem-recebida', 'mensagem-enviada', 'nota', 'tarefa', 'cotacao', 'contrato', 'pos-venda'].includes(d.tipo) ? d.tipo : 'nota';
    addAtividade(c.id, tipo, d.texto, d.canal || '', req.viaChave ? 'sistema' : req.user.nome);
    res.json({ ok: true });
  });

  // Marcar como perdido (com motivo)
  app.post('/staff/api/crm/contatos/:id/perder', requirePublishOrSession, podeCRM, (req, res) => {
    const contatos = lerContatos();
    const c = contatos.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ erro: 'Contato não encontrado.' });
    c.estagio = 'perdido'; c.motivoPerda = String((req.body && req.body.motivo) || ''); c.atualizadoEm = new Date().toISOString();
    salvarContatos(contatos);
    addAtividade(c.id, 'mudanca-estagio', 'Perdido' + (c.motivoPerda ? ` (${c.motivoPerda})` : ''), '', req.viaChave ? 'sistema' : req.user.nome);
    res.json({ ok: true, contato: c });
  });

  // Excluir contato (somente admin ou PUBLISH_KEY) — remove o contato e suas atividades.
  app.delete('/staff/api/crm/contatos/:id', requirePublishOrSession, (req, res) => {
    if (!req.viaChave && (!req.user || req.user.papel !== 'admin')) return res.status(403).json({ erro: 'Apenas admin pode excluir contato.' });
    const contatos = lerContatos();
    if (!contatos.find(x => x.id === req.params.id)) return res.status(404).json({ erro: 'Contato não encontrado.' });
    salvarContatos(contatos.filter(x => x.id !== req.params.id));
    try { // remove as atividades órfãs do contato
      const f = path.join(DATA_DIR, 'atividades.jsonl');
      if (fs.existsSync(f)) {
        const linhas = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).filter(l => { try { return JSON.parse(l).contatoId !== req.params.id; } catch { return true; } });
        fs.writeFileSync(f, linhas.length ? linhas.join('\n') + '\n' : '');
      }
    } catch (e) { console.error('[crm delete] limpeza atividades:', e.message); }
    res.json({ ok: true });
  });

  // Migração única: leads.jsonl (formato antigo) -> contatos (dedupe). Admin ou PUBLISH_KEY.
  app.post('/staff/api/crm/migrar-leads', requirePublishOrSession, (req, res) => {
    if (!req.viaChave && (!req.user || req.user.papel !== 'admin')) return res.status(403).json({ erro: 'Apenas admin.' });
    const f = path.join(DATA_DIR, 'leads.jsonl');
    if (!fs.existsSync(f)) return res.json({ ok: true, importados: 0, total: 0 });
    const linhas = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
    let importados = 0;
    for (const l of linhas) {
      let o; try { o = JSON.parse(l); } catch { continue; }
      const { novo } = upsertContato({
        nome: o.nome, contato: o.contato, mensagem: o.mensagem,
        origem: o.origem || 'site', criadoEm: o._recebido,
      });
      if (novo) importados++;
    }
    res.json({ ok: true, importados, total: linhas.length });
  });

  // CRM: SLA de 1ª resposta (leads novos sem resposta humana)
  app.get('/staff/api/crm/sla', requirePublishOrSession, podeCRM, (req, res) => {
    const horas = Math.max(1, parseInt(req.query.horas) || 2);
    const limite = Date.now() - horas * 3600000;
    const f = path.join(DATA_DIR, 'atividades.jsonl');
    const humanas = {};
    if (fs.existsSync(f)) {
      for (const l of fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean)) {
        let a; try { a = JSON.parse(l); } catch { continue; }
        if (!a || !a.contatoId) continue;
        const ehCriacao = a.autor === 'sistema' && /contato criado/i.test(a.texto || '');
        if (!ehCriacao) humanas[a.contatoId] = true;
      }
    }
    const atrasados = lerContatos()
      .filter(c => c.estagio === 'novo' && !humanas[c.id] && Date.parse(c.criadoEm || 0) < limite)
      .map(c => ({ id: c.id, nome: c.nome || c.telefone || 'sem nome', telefone: c.telefone || '', origem: c.origem || '', imovelInteresse: c.imovelInteresse || '', esperaHoras: Math.round((Date.now() - Date.parse(c.criadoEm || Date.now())) / 3600000) }))
      .sort((a, b) => b.esperaHoras - a.esperaHoras);
    res.json({ horas, atrasados });
  });

  // CRM: receita prevista por mês (funil)
  app.get('/staff/api/crm/receita-prevista', requirePublishOrSession, podeCRM, (req, res) => {
    const abertos = ['novo', 'contato', 'orcamento', 'negociacao', 'reserva'];
    const porMes = {};
    let semData = 0, total = 0;
    for (const c of lerContatos()) {
      if (!abertos.includes(c.estagio)) continue;
      const v = Number(c.valorEstimado) || 0;
      if (!v) continue;
      total += v;
      const ci = c.periodo && c.periodo.checkin ? String(c.periodo.checkin).slice(0, 7) : '';
      if (/^\d{4}-\d{2}$/.test(ci)) porMes[ci] = (porMes[ci] || 0) + v; else semData += v;
    }
    const meses = Object.keys(porMes).sort().map(m => ({ mes: m, valor: Math.round(porMes[m]) }));
    res.json({ meses, semData: Math.round(semData), total: Math.round(total) });
  });
};
