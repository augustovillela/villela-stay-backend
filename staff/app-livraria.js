'use strict';
// ============================================================================
// Portal Staff — módulo: Gestão de Livros (Livraria Villela)
// Sub-app autocontido dentro de #conteudo, com abas internas. Reaproveita os
// helpers globais (api, esc, dataBr, conteudo, cabecalho). Permissões vêm de
// /staff/api/livraria/eu (papel funcional: admin/editor/financeiro/suporte/logística).
// ============================================================================

const LV = {
  tab: 'dashboard',
  perm: {}, papel: '',
  brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); },
  reais(c) { return (Number(c || 0) / 100).toFixed(2).replace('.', ','); },
  api(m, c, b) { return api(m, '/livraria' + c, b); },
  async abrir(tab) {
    if (tab) LV.tab = tab;
    try { const eu = await LV.api('GET', '/eu'); LV.perm = eu.permissoes || {}; LV.papel = eu.papel || ''; }
    catch (e) { conteudo().innerHTML = cabecalho('📚 Gestão de Livros') + `<div class="card">Sem acesso à Livraria. Peça ao administrador para liberar a área <b>Livraria</b> e um papel.</div>`; return; }
    LV.render();
  },
  abas() {
    const t = [['dashboard', '📊 Painel']];
    if (LV.perm.livros || LV.perm.precos) t.push(['livros', '📕 Livros']);
    if (LV.perm.pedidos) t.push(['pedidos', '🧾 Pedidos']);
    if (LV.perm.clientes) t.push(['clientes', '👥 Clientes']);
    if (LV.perm.cupons) t.push(['cupons', '🎟️ Cupons']);
    if (LV.perm.impressos) t.push(['impressos', '📦 Impressos']);
    if (LV.perm.relatorios) t.push(['relatorios', '📈 Relatórios']);
    t.push(['logs', '🔔 Webhooks/Logs']);
    if (LV.perm.auditoria) t.push(['auditoria', '📜 Auditoria']);
    if (LV.papel === 'admin') t.push(['equipe', '⚙️ Equipe']);
    return t;
  },
  render() {
    const c = conteudo();
    const abas = LV.abas().map(([id, rot]) => `<button class="btn ${LV.tab === id ? '' : 'secund'} peq" onclick="LV.ir('${id}')">${rot}</button>`).join(' ');
    c.innerHTML = cabecalho('📚 Gestão de Livros', 'Livraria Villela — loja pública em livros.villelastay.com.br')
      + `<div class="card" style="display:flex;flex-wrap:wrap;gap:.4rem">${abas}</div><div id="lv-body"><p class="sub">Carregando…</p></div>`;
    LV.pintar();
  },
  ir(tab) { LV.tab = tab; LV.render(); },
  body() { return document.getElementById('lv-body'); },
  async pintar() {
    try {
      if (LV.tab === 'dashboard') return LV.vDashboard();
      if (LV.tab === 'livros') return LV.vLivros();
      if (LV.tab === 'pedidos') return LV.vPedidos();
      if (LV.tab === 'clientes') return LV.vClientes();
      if (LV.tab === 'cupons') return LV.vCupons();
      if (LV.tab === 'impressos') return LV.vImpressos();
      if (LV.tab === 'relatorios') return LV.vRelatorios();
      if (LV.tab === 'logs') return LV.vLogs();
      if (LV.tab === 'auditoria') return LV.vAuditoria();
      if (LV.tab === 'equipe') return LV.vEquipe();
    } catch (e) { LV.body().innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  },

  // -------------------------------------------------------- DASHBOARD
  async vDashboard() {
    const d = await LV.api('GET', '/dashboard');
    const r = d.resumo;
    const kpi = (rot, val) => `<div class="card" style="min-width:150px;flex:1"><div class="sub">${rot}</div><div style="font-size:1.5rem;font-weight:700">${val}</div></div>`;
    let h = `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('Receita paga', r.receita_fmt)}${kpi('Pedidos pagos', r.pedidos_pagos)}${kpi('Ticket médio', r.ticket_medio_fmt)}
      ${kpi('Pendentes', r.pedidos_pendentes)}${kpi('Downloads', r.downloads)}${kpi('Impressos pendentes', r.impressos_pendentes)}${kpi('Reembolsos', r.reembolsos)}</div>`;
    h += `<div class="card"><h3>🏆 Mais vendidos</h3>${d.mais_vendidos.length ? tabela(['Título', 'Itens', 'Receita'], d.mais_vendidos.map(m => [esc(m.titulo), m.itens, m.receita_fmt])) : '<p class="sub">Sem vendas ainda.</p>'}</div>`;
    if (d.problematicos.length) h += `<div class="card"><h3>⚠️ Pedidos problemáticos</h3>${tabela(['Pedido', 'Cliente', 'Status', 'Entrega', 'Impresso'], d.problematicos.map(p => [`<a href="#" onclick="LV.verPedido('${p.id}');return false">${p.id.slice(0, 8)}</a>`, esc(p.cliente), p.status, p.entrega_digital, p.impressao_status]))}</div>`;
    if (d.cupons.length) h += `<div class="card"><h3>🎟️ Cupons usados</h3>${tabela(['Código', 'Usos', 'Desconto'], d.cupons.map(c => [esc(c.codigo), c.usos, c.desconto_fmt]))}</div>`;
    LV.body().innerHTML = h;
  },

  // -------------------------------------------------------- LIVROS
  async vLivros() {
    const { livros } = await LV.api('GET', '/livros');
    let h = '';
    if (LV.perm.livros) h += `<div class="card"><button class="btn" onclick="LV.editarLivro()">➕ Novo livro</button></div>`;
    h += `<div class="card">${livros.length ? tabela(['Título', 'Slug', 'PDF', 'Impresso', 'Combo', 'Ativo', ''], livros.map(b => [
      esc(b.titulo), esc(b.slug), b.preco_pdf != null ? LV.brl(b.preco_pdf) : '—', b.preco_impresso != null ? LV.brl(b.preco_impresso) : '—',
      b.preco_combo != null ? LV.brl(b.preco_combo) : '—', b.ativo ? '✅' : '⛔',
      `<button class="btn secund peq" onclick="LV.editarLivro('${b.id}')">Editar</button>`])) : '<p class="sub">Nenhum livro. Crie o primeiro.</p>'}</div>`;
    LV.body().innerHTML = h;
  },
  async editarLivro(id) {
    let b = { titulo: '', subtitulo: '', autor: 'Augusto Villela', slug: '', categoria: '', descricao_curta: '', descricao_longa: '', sumario: '', publico_alvo: '', preco_pdf: '', preco_impresso: '', preco_combo: '', ativo: true, destaque: false, capa_url: '', seo_title: '', seo_description: '', beneficios: [], bonus: [], depoimentos: [], faq: [] };
    let arquivos = [];
    if (id) { const d = await LV.api('GET', '/livros/' + id); b = d.livro; arquivos = d.arquivos; }
    const preco = (v) => v == null || v === '' ? '' : LV.reais(v);
    const campo = (id2, rot, val, tipo) => `<div style="margin:.5rem 0"><label class="sub">${rot}</label><input id="lv-${id2}" value="${esc(val)}" ${tipo || ''} style="width:100%;padding:.5rem"></div>`;
    const area = (id2, rot, val) => `<div style="margin:.5rem 0"><label class="sub">${rot}</label><textarea id="lv-${id2}" rows="3" style="width:100%;padding:.5rem">${esc(val)}</textarea></div>`;
    const listaJson = (id2, rot, val) => `<div style="margin:.5rem 0"><label class="sub">${rot} (JSON)</label><textarea id="lv-${id2}" rows="2" style="width:100%;padding:.5rem;font-family:monospace;font-size:.8rem">${esc(JSON.stringify(val || []))}</textarea></div>`;
    let h = `<div class="card"><h3>${id ? 'Editar' : 'Novo'} livro</h3>
      ${campo('titulo', 'Título *', b.titulo)}
      ${campo('subtitulo', 'Subtítulo', b.subtitulo)}
      <div style="display:flex;gap:.6rem">${campo('autor', 'Autor', b.autor)}${campo('slug', 'Slug (vazio = auto)', b.slug)}${campo('categoria', 'Categoria', b.categoria)}</div>
      ${area('descricao_curta', 'Descrição curta (vitrine/SEO)', b.descricao_curta)}
      ${area('descricao_longa', 'Descrição longa (página de venda)', b.descricao_longa)}
      ${area('publico_alvo', 'Para quem é', b.publico_alvo)}
      ${area('sumario', 'Sumário', b.sumario)}
      ${listaJson('beneficios', 'Benefícios ["a","b"]', b.beneficios)}
      ${listaJson('bonus', 'Bônus [{"titulo","descricao"}]', b.bonus)}
      ${listaJson('depoimentos', 'Depoimentos [{"nome","texto"}]', b.depoimentos)}
      ${listaJson('faq', 'FAQ [{"pergunta","resposta"}]', b.faq)}
      <div style="display:flex;gap:.6rem">
        ${LV.perm.precos ? campo('preco_pdf', 'Preço PDF (R$)', preco(b.preco_pdf)) : ''}
        ${LV.perm.precos ? campo('preco_impresso', 'Preço Impresso (R$)', preco(b.preco_impresso)) : ''}
        ${LV.perm.precos ? campo('preco_combo', 'Preço Combo (R$)', preco(b.preco_combo)) : ''}
      </div>
      ${campo('capa_url', 'URL da capa', b.capa_url)}
      <div style="display:flex;gap:.6rem">${campo('seo_title', 'SEO título', b.seo_title)}${campo('seo_description', 'SEO descrição', b.seo_description)}</div>
      <label class="sub"><input type="checkbox" id="lv-ativo" ${b.ativo ? 'checked' : ''}> Ativo</label>
      <label class="sub" style="margin-left:1rem"><input type="checkbox" id="lv-destaque" ${b.destaque ? 'checked' : ''}> Destaque</label>
      <div style="margin-top:.8rem"><button class="btn" onclick="LV.salvarLivro('${id || ''}')">💾 Salvar</button>
      <button class="btn secund" onclick="LV.ir('livros')">Voltar</button>
      ${id && LV.perm.livros ? `<button class="btn perigo peq" onclick="LV.removerLivro('${id}')">🗑️ Excluir</button>` : ''}</div></div>`;
    if (id) {
      h += `<div class="card"><h3>📄 PDF privado</h3>
        ${arquivos.length ? tabela(['Versão', 'Arquivo', 'Tamanho', 'Ativo', ''], arquivos.map(f => [f.versao, esc(f.original_name), Math.round(f.tamanho / 1024) + ' KB', f.ativo ? '✅' : '', f.ativo ? '' : `<button class="btn secund peq" onclick="LV.ativarPdf('${id}','${f.id}')">Tornar ativo</button>`])) : '<p class="sub">Nenhum PDF enviado.</p>'}
        <div style="margin-top:.6rem"><input type="file" id="lv-pdf" accept="application/pdf"> <button class="btn peq" onclick="LV.enviarPdf('${id}')">⬆️ Enviar PDF</button> <span id="lv-pdf-msg" class="sub"></span></div></div>`;
    }
    LV.body().innerHTML = h;
  },
  colher(id2) { const el = document.getElementById('lv-' + id2); return el ? el.value.trim() : ''; },
  colherPreco(id2) { const v = LV.colher(id2); if (v === '') return null; return Math.round(parseFloat(v.replace(',', '.')) * 100); },
  colherJson(id2) { try { return JSON.parse(document.getElementById('lv-' + id2).value || '[]'); } catch { return []; } },
  async salvarLivro(id) {
    const d = {
      titulo: LV.colher('titulo'), subtitulo: LV.colher('subtitulo'), autor: LV.colher('autor'), slug: LV.colher('slug'),
      categoria: LV.colher('categoria'), descricao_curta: LV.colher('descricao_curta'), descricao_longa: LV.colher('descricao_longa'),
      publico_alvo: LV.colher('publico_alvo'), sumario: LV.colher('sumario'),
      beneficios: LV.colherJson('beneficios'), bonus: LV.colherJson('bonus'), depoimentos: LV.colherJson('depoimentos'), faq: LV.colherJson('faq'),
      capa_url: LV.colher('capa_url'), seo_title: LV.colher('seo_title'), seo_description: LV.colher('seo_description'),
      ativo: document.getElementById('lv-ativo').checked, destaque: document.getElementById('lv-destaque').checked,
    };
    if (LV.perm.precos) { d.preco_pdf = LV.colherPreco('preco_pdf'); d.preco_impresso = LV.colherPreco('preco_impresso'); d.preco_combo = LV.colherPreco('preco_combo'); }
    if (!d.titulo) return alert('Informe o título.');
    try { const r = id ? await LV.api('PATCH', '/livros/' + id, d) : await LV.api('POST', '/livros', d); LV.editarLivro(r.livro.id); }
    catch (e) { alert('Erro: ' + e.message); }
  },
  async removerLivro(id) { if (!confirm('Excluir este livro? (não afeta pedidos já feitos)')) return; try { await LV.api('DELETE', '/livros/' + id); LV.ir('livros'); } catch (e) { alert(e.message); } },
  async ativarPdf(id, fid) { try { await LV.api('POST', `/livros/${id}/pdf/${fid}/ativar`); LV.editarLivro(id); } catch (e) { alert(e.message); } },
  async enviarPdf(id) {
    const f = document.getElementById('lv-pdf').files[0]; const msg = document.getElementById('lv-pdf-msg');
    if (!f) return alert('Escolha um PDF.');
    msg.textContent = 'Enviando…';
    try {
      const r = await fetch('/staff/api/livraria/livros/' + id + '/pdf', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/pdf', 'X-Filename': f.name }, body: f });
      const d = await r.json(); if (!r.ok) throw new Error(d.erro || 'falha');
      msg.textContent = '✅ enviado (v' + d.arquivo.versao + ')'; LV.editarLivro(id);
    } catch (e) { msg.textContent = '❌ ' + e.message; }
  },

  // -------------------------------------------------------- PEDIDOS
  async vPedidos(filtro) {
    const q = filtro ? '?status=' + filtro : '';
    const { pedidos } = await LV.api('GET', '/pedidos' + q);
    const f = (v, t) => `<button class="btn ${filtro === v ? '' : 'secund'} peq" onclick="LV.vPedidos('${v}')">${t}</button>`;
    let h = `<div class="card"><button class="btn ${!filtro ? '' : 'secund'} peq" onclick="LV.vPedidos()">Todos</button> ${f('pendente', 'Pendentes')} ${f('pago', 'Pagos')} ${f('reembolsado', 'Reembolsados')}</div>`;
    h += `<div class="card">${pedidos.length ? tabela(['Data', 'Cliente', 'Total', 'Pagto', 'Entrega', 'Impresso', ''], pedidos.map(p => [
      dataBr(p.created_at), esc(p.cliente_nome || ''), LV.brl(p.valor_total), badge(p.status), p.entrega_digital, p.impressao_status,
      `<button class="btn secund peq" onclick="LV.verPedido('${p.id}')">Ver</button>`])) : '<p class="sub">Sem pedidos.</p>'}</div>`;
    LV.body().innerHTML = h;
  },
  async verPedido(id) {
    LV.tab = 'pedidos'; LV.render();
    const d = await LV.api('GET', '/pedidos/' + id);
    const p = d.pedido; const cli = p.cliente || {};
    const e = p.endereco_entrega || {};
    const temEnd = e.cep || e.logradouro || e.numero || e.bairro;
    const linhaEnd = temEnd
      ? `${esc([e.logradouro, e.numero].filter(Boolean).join(', '))}${e.complemento ? ' — ' + esc(e.complemento) : ''}${e.bairro ? '<br>' + esc(e.bairro) : ''}<br>${esc(cli.cidade || '')}/${esc(cli.estado || '')}${e.cep ? ' · CEP ' + esc(e.cep) : ''}`
      : `<span style="color:#b3261e">⚠️ Sem endereço de entrega neste pedido — solicite ao comprador pelo WhatsApp.</span>`;
    let h = `<div class="card"><button class="btn secund peq" onclick="LV.ir('pedidos')">← Voltar</button>
      <h3>Pedido ${p.id.slice(0, 8)} · ${badge(p.status)}</h3>
      <p><b>${esc(cli.nome)}</b> · ${esc(cli.email)} · ${esc(cli.whatsapp)}<br>${esc(cli.doc)} · ${esc(cli.cidade)}/${esc(cli.estado)}</p>
      <p style="background:#f6f8fa;border-radius:8px;padding:.5rem .7rem"><b>📮 Endereço de entrega</b><br>${linhaEnd}</p>
      ${tabela(['Item', 'Tipo', 'Qtd', 'Preço'], p.itens.map(i => [esc(i.titulo_snapshot), i.tipo, i.quantidade, LV.brl(i.preco_unit)]))}
      <p>Subtotal ${LV.brl(p.valor_bruto)} · Desconto ${LV.brl(p.desconto)} ${p.cupom_codigo ? '(' + esc(p.cupom_codigo) + ')' : ''} · <b>Total ${LV.brl(p.valor_total)}</b></p>`;
    // ações
    let acoes = '';
    if (p.status !== 'pago') acoes += `<button class="btn peq" onclick="LV.acaoPedido('${id}','marcar-pago')">✅ Marcar pago (manual)</button> `;
    if (p.status === 'pago' && p.tem_pdf) {
      const livrosPdf = p.itens.filter(i => i.tipo === 'pdf' || i.tipo === 'combo');
      acoes += livrosPdf.map(i => `<button class="btn secund peq" onclick="LV.reenviar('${id}','${i.book_id}')">📧 Reenviar link: ${esc(i.titulo_snapshot).slice(0, 18)}</button>`).join(' ');
      acoes += ` <button class="btn secund peq" onclick="LV.bloquear('${id}',${p.entrega_digital === 'bloqueado'})">${p.entrega_digital === 'bloqueado' ? '🔓 Reativar acesso' : '🔒 Bloquear acesso'}</button>`;
    }
    if (p.status === 'pago') acoes += ` <button class="btn perigo peq" onclick="LV.acaoPedido('${id}','reembolsar')">↩️ Reembolsar</button>`;
    h += `<div style="margin-top:.6rem">${acoes}</div></div>`;
    // downloads
    h += `<div class="card"><h3>⬇️ Downloads</h3>${d.downloads.length ? tabela(['Quando', 'Resultado', 'IP'], d.downloads.map(l => [dataBr(l.created_at), l.resultado, esc(l.ip)])) : '<p class="sub">Nenhum download.</p>'}
      ${d.tokens.length ? '<p class="sub">Tokens: ' + d.tokens.map(t => `${t.download_count}/${t.max_downloads} ${t.ativo ? '' : '(bloqueado)'}`).join(', ') + '</p>' : ''}</div>`;
    if (d.impressos.length) h += `<div class="card"><h3>📦 Impressos</h3>${tabela(['Status', 'Fornecedor', 'Rastreio'], d.impressos.map(j => [j.status, esc(j.fornecedor), esc(j.rastreio)]))}</div>`;
    LV.body().innerHTML = h;
  },
  async acaoPedido(id, acao) { if (acao === 'reembolsar' && !confirm('Confirmar reembolso? Isso bloqueia o acesso ao PDF.')) return; try { await LV.api('POST', `/pedidos/${id}/${acao}`); LV.verPedido(id); } catch (e) { alert(e.message); } },
  async reenviar(id, bookId) { try { const r = await LV.api('POST', `/pedidos/${id}/reenviar-link`, { book_id: bookId }); alert('Novo link gerado e enviado.'); LV.verPedido(id); } catch (e) { alert(e.message); } },
  async bloquear(id, estaBloqueado) { try { await LV.api('POST', `/pedidos/${id}/bloquear`, { ativo: estaBloqueado }); LV.verPedido(id); } catch (e) { alert(e.message); } },

  // -------------------------------------------------------- CLIENTES
  async vClientes(q) {
    const { clientes } = await LV.api('GET', '/clientes' + (q ? '?q=' + encodeURIComponent(q) : ''));
    let h = `<div class="card"><input id="lv-busca-cli" placeholder="Buscar por nome/e-mail/WhatsApp" value="${esc(q || '')}" style="padding:.5rem"><button class="btn peq" onclick="LV.vClientes(document.getElementById('lv-busca-cli').value)">🔍</button></div>`;
    h += `<div class="card">${clientes.length ? tabela(['Nome', 'E-mail', 'WhatsApp', 'Cidade', ''], clientes.map(c => [esc(c.nome), esc(c.email), esc(c.whatsapp), esc(c.cidade), `<button class="btn secund peq" onclick="LV.verCliente('${c.id}')">Ver</button>`])) : '<p class="sub">Nenhum cliente.</p>'}</div>`;
    LV.body().innerHTML = h;
  },
  async verCliente(id) {
    const d = await LV.api('GET', '/clientes/' + id); const c = d.cliente;
    let end = {}; try { end = c.endereco ? JSON.parse(c.endereco) : {}; } catch (_) {}
    const endLinha = (end.cep || end.logradouro) ? `<br>📮 ${esc([end.logradouro, end.numero].filter(Boolean).join(', '))}${end.complemento ? ' — ' + esc(end.complemento) : ''}${end.bairro ? ', ' + esc(end.bairro) : ''}${end.cep ? ' · CEP ' + esc(end.cep) : ''}` : '';
    let h = `<div class="card"><button class="btn secund peq" onclick="LV.ir('clientes')">← Voltar</button>
      <h3>${esc(c.nome)}</h3><p>${esc(c.email)} · ${esc(c.whatsapp)}<br>${esc(c.doc)} · ${esc(c.cidade)}/${esc(c.estado)} · ${esc(c.pais)}${endLinha}</p>
      <div style="margin:.5rem 0"><label class="sub">Observações internas</label><textarea id="lv-cli-obs" rows="2" style="width:100%;padding:.5rem">${esc(c.observacoes)}</textarea>
      <button class="btn peq" onclick="LV.salvarCliente('${id}')">💾 Salvar</button></div></div>`;
    h += `<div class="card"><h3>🛒 Compras</h3>${d.compras.length ? tabela(['Data', 'Total', 'Status', ''], d.compras.map(o => [dataBr(o.created_at), LV.brl(o.valor_total), o.status, `<button class="btn secund peq" onclick="LV.verPedido('${o.id}')">Ver</button>`])) : '<p class="sub">Nenhuma.</p>'}</div>`;
    LV.body().innerHTML = h;
  },
  async salvarCliente(id) { try { await LV.api('PATCH', '/clientes/' + id, { observacoes: document.getElementById('lv-cli-obs').value }); alert('Salvo.'); } catch (e) { alert(e.message); } },

  // -------------------------------------------------------- CUPONS
  async vCupons() {
    const { cupons } = await LV.api('GET', '/cupons');
    let h = `<div class="card"><h3>Novo cupom</h3>
      <input id="lv-cup-cod" placeholder="CÓDIGO" style="padding:.5rem;text-transform:uppercase">
      <select id="lv-cup-tipo" style="padding:.5rem"><option value="percent">%</option><option value="fixo">R$ fixo</option></select>
      <input id="lv-cup-valor" placeholder="valor" style="padding:.5rem;width:80px">
      <input id="lv-cup-lim" placeholder="limite (0=∞)" style="padding:.5rem;width:110px">
      <input id="lv-cup-val" type="date" style="padding:.5rem">
      <button class="btn peq" onclick="LV.criarCupom()">➕ Criar</button></div>`;
    h += `<div class="card">${cupons.length ? tabela(['Código', 'Tipo', 'Valor', 'Usos', 'Limite', 'Validade', 'Ativo', ''], cupons.map(c => [
      esc(c.codigo), c.tipo, c.tipo === 'percent' ? c.valor + '%' : LV.brl(c.valor), c.usos, c.limite_uso || '∞', c.validade || '—', c.ativo ? '✅' : '⛔',
      `<button class="btn secund peq" onclick="LV.toggleCupom('${c.id}',${c.ativo ? 0 : 1})">${c.ativo ? 'Desativar' : 'Ativar'}</button> <button class="btn perigo peq" onclick="LV.removerCupom('${c.id}')">🗑️</button>`])) : '<p class="sub">Nenhum cupom.</p>'}</div>`;
    LV.body().innerHTML = h;
  },
  async criarCupom() {
    const tipo = document.getElementById('lv-cup-tipo').value;
    const valorRaw = document.getElementById('lv-cup-valor').value;
    const valor = tipo === 'fixo' ? Math.round(parseFloat(valorRaw.replace(',', '.')) * 100) : parseInt(valorRaw, 10);
    const d = { codigo: document.getElementById('lv-cup-cod').value, tipo, valor, limite_uso: parseInt(document.getElementById('lv-cup-lim').value || '0', 10), validade: document.getElementById('lv-cup-val').value || null };
    if (!d.codigo || !valor) return alert('Código e valor obrigatórios.');
    try { await LV.api('POST', '/cupons', d); LV.vCupons(); } catch (e) { alert(e.message); }
  },
  async toggleCupom(id, ativo) { try { await LV.api('PATCH', '/cupons/' + id, { ativo: !!ativo }); LV.vCupons(); } catch (e) { alert(e.message); } },
  async removerCupom(id) { if (!confirm('Excluir cupom?')) return; try { await LV.api('DELETE', '/cupons/' + id); LV.vCupons(); } catch (e) { alert(e.message); } },

  // -------------------------------------------------------- IMPRESSOS
  async vImpressos() {
    const { impressos } = await LV.api('GET', '/impressos');
    const STATUS = ['aguardando_producao', 'enviado_grafica', 'em_producao', 'enviado', 'entregue', 'cancelado'];
    let h = `<div class="card"><h3>📦 Fila de impressos</h3>`;
    h += impressos.length ? impressos.map(j => {
      const cli = j.pedido && j.pedido.cliente ? j.pedido.cliente : {};
      const e = (j.pedido && j.pedido.endereco_entrega) || {};
      const temEnd = e.cep || e.logradouro || e.numero || e.bairro;
      const endTxt = temEnd
        ? `📮 ${esc([e.logradouro, e.numero].filter(Boolean).join(', '))}${e.complemento ? ' — ' + esc(e.complemento) : ''}${e.bairro ? ', ' + esc(e.bairro) : ''} · ${esc(cli.cidade || '')}/${esc(cli.estado || '')}${e.cep ? ' · CEP ' + esc(e.cep) : ''}`
        : `<span style="color:#b3261e">⚠️ Sem endereço — solicitar ao comprador</span>`;
      const opts = STATUS.map(s => `<option value="${s}" ${j.status === s ? 'selected' : ''}>${s}</option>`).join('');
      return `<div style="border:1px solid #ddd;border-radius:8px;padding:.6rem;margin:.5rem 0">
        <b>${esc(j.livro ? j.livro.titulo : '')}</b> — ${esc(cli.nome || '')}${cli.whatsapp ? ' · ' + esc(cli.whatsapp) : ''}
        <div class="sub" style="margin:.25rem 0">${endTxt}</div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.4rem;align-items:center">
          <select id="im-st-${j.id}" style="padding:.4rem">${opts}</select>
          <input id="im-forn-${j.id}" placeholder="Fornecedor" value="${esc(j.fornecedor)}" style="padding:.4rem;width:130px">
          <input id="im-rast-${j.id}" placeholder="Rastreio" value="${esc(j.rastreio)}" style="padding:.4rem;width:130px">
          <input id="im-ci-${j.id}" placeholder="Custo impr. R$" value="${j.custo_impressao ? LV.reais(j.custo_impressao) : ''}" style="padding:.4rem;width:110px">
          <input id="im-cf-${j.id}" placeholder="Frete R$" value="${j.custo_frete ? LV.reais(j.custo_frete) : ''}" style="padding:.4rem;width:90px">
          <button class="btn peq" onclick="LV.salvarImpresso('${j.id}')">💾</button>
        </div></div>`;
    }).join('') : '<p class="sub">Nenhum impresso pendente.</p>';
    h += '</div>';
    LV.body().innerHTML = h;
  },
  async salvarImpresso(id) {
    const g = (p) => document.getElementById(p + id).value;
    const rc = (v) => v ? Math.round(parseFloat(v.replace(',', '.')) * 100) : 0;
    try { await LV.api('PATCH', '/impressos/' + id, { status: g('im-st-'), fornecedor: g('im-forn-'), rastreio: g('im-rast-'), custo_impressao: rc(g('im-ci-')), custo_frete: rc(g('im-cf-')) }); LV.vImpressos(); }
    catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- RELATÓRIOS
  async vRelatorios() {
    LV.body().innerHTML = `<div class="card"><h3>📈 Relatórios (CSV)</h3>
      <p class="sub">Exporta vendas, receita, ticket médio e mais vendidos.</p>
      <a class="btn peq" href="/staff/api/livraria/relatorio.csv?tipo=diario" target="_blank">📥 Diário</a>
      <a class="btn peq" href="/staff/api/livraria/relatorio.csv?tipo=semanal" target="_blank">📥 Semanal</a>
      <a class="btn peq" href="/staff/api/livraria/relatorio.csv?tipo=mensal" target="_blank">📥 Mensal</a></div>`;
  },

  // -------------------------------------------------------- LOGS
  async vLogs() {
    const w = await LV.api('GET', '/webhooks'); const n = await LV.api('GET', '/notificacoes');
    let h = `<div class="card"><h3>🔗 Webhooks (Mercado Pago)</h3>${w.webhooks.length ? tabela(['Quando', 'Tipo', 'Processado', 'Resultado'], w.webhooks.map(x => [dataBr(x.created_at), esc(x.tipo), x.processed ? '✅' : '⏳', esc(x.resultado)])) : '<p class="sub">Sem eventos.</p>'}</div>`;
    h += `<div class="card"><h3>📨 Notificações (e-mail/WhatsApp/Make)</h3>${n.notificacoes.length ? tabela(['Quando', 'Tipo', 'Destino', 'Assunto', 'Status'], n.notificacoes.map(x => [dataBr(x.created_at), x.tipo, esc(x.destino), esc(x.assunto), x.status])) : '<p class="sub">Sem notificações.</p>'}</div>`;
    LV.body().innerHTML = h;
  },

  // -------------------------------------------------------- AUDITORIA
  async vAuditoria() {
    const { auditoria } = await LV.api('GET', '/auditoria');
    LV.body().innerHTML = `<div class="card"><h3>📜 Auditoria</h3>${auditoria.length ? tabela(['Quando', 'Quem', 'Ação', 'Entidade', 'Detalhe'], auditoria.map(a => [dataBr(a.created_at), esc(a.staff_nome), esc(a.acao), esc(a.entidade), esc(a.detalhe)])) : '<p class="sub">Sem registros.</p>'}</div>`;
  },

  // -------------------------------------------------------- EQUIPE
  async vEquipe() {
    const d = await LV.api('GET', '/equipe');
    const opts = (sel) => d.papeis.map(p => `<option value="${p}" ${sel === p ? 'selected' : ''}>${p}</option>`).join('');
    LV.body().innerHTML = `<div class="card"><h3>⚙️ Papéis na Livraria</h3><p class="sub">admin vê tudo · editor: livros/preços · financeiro: preços/pedidos/cupons · suporte: pedidos/clientes · logística: pedidos/impressos.</p>
      ${tabela(['Nome', 'E-mail', 'Papel portal', 'Papel livraria'], d.equipe.map(u => [esc(u.nome), esc(u.email), u.papel, u.papel === 'admin' ? '<i>admin</i>' : `<select onchange="LV.setPapel('${u.id}',this.value)" style="padding:.3rem">${opts(u.papelLivraria)}</select>`]))}</div>`;
  },
  async setPapel(id, papel) { try { await LV.api('PATCH', '/equipe/' + id, { papelLivraria: papel }); } catch (e) { alert(e.message); } },
};

// helpers locais de tabela/badge (usam esc global)
function tabela(cols, linhas) {
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.9rem">
    <thead><tr>${cols.map(c => `<th style="text-align:left;border-bottom:2px solid #ddd;padding:.4rem">${c}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map(c => `<td style="border-bottom:1px solid #eee;padding:.4rem">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function badge(status) {
  const cor = { pago: '#0E7490', pendente: '#c8912f', recusado: '#b3261e', cancelado: '#777', reembolsado: '#7a3ca1' }[status] || '#555';
  return `<span style="background:${cor};color:#fff;padding:.1rem .5rem;border-radius:99px;font-size:.75rem">${status}</span>`;
}

// ponto de entrada chamado pelo roteador do app-core (navegar → 'livraria')
function renderLivraria() { LV.abrir(); }
