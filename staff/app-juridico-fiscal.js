'use strict';
// ============================================================================
// Portal Staff — módulo: app-juridico-fiscal
// Contratos, Consentimentos LGPD, Calendário fiscal, Histórico de preços, Recebimentos e Fechamento contábil.
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- Contratos (arquivo com busca + alerta 48h) ---------
async function renderContratos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Contratos', 'Arquivo dos contratos de hospedagem e evento, com busca. Abaixo, as reservas diretas recentes que ainda não têm contrato arquivado.') + `
    <div class="aviso">🔒 Área restrita (Jurídico/admin). Contratos podem conter dados pessoais (CPF/RG) — não compartilhe fora daqui.</div>
    <div id="ct-pendentes"></div>
    <details class="cr-box" id="ct-box"><summary class="cr-sum">➕ Arquivar contrato</summary>
      <form class="form" id="ct-form" style="max-width:660px;margin-top:12px">
        <label>Hóspede * <input id="ct-hospede" required maxlength="120"></label>
        <div class="hi-grid">
          <label>Imóvel <input id="ct-imovel" maxlength="60"></label>
          <label>Localizador da reserva <input id="ct-reserva" maxlength="40"></label>
          <label>Tipo <select id="ct-tipo"><option value="hospedagem">Hospedagem</option><option value="evento">Evento</option><option value="ambos">Ambos</option></select></label>
          <label>Início <input id="ct-ini" type="date"></label>
          <label>Fim <input id="ct-fim" type="date"></label>
          <label>Valor (R$) <input id="ct-valor" type="number" min="0" step="0.01"></label>
        </div>
        <label class="serv-ativo"><input type="checkbox" id="ct-assinado"> Assinado</label>
        <label>Arquivo (PDF/DOCX/imagem) <input id="ct-arq" type="file"></label>
        <label>Observação <input id="ct-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="ct-salvar">Arquivar</button>
        <p id="ct-msg" class="erro"></p>
      </form>
    </details>
    <div class="barra"><input id="ct-busca" type="search" placeholder="🔎 Buscar por hóspede, imóvel, localizador…" style="flex:1;min-width:220px"></div>
    <div id="ct-lista"><p class="vazio">Carregando…</p></div>`;
  let tb; $('#ct-busca').oninput = () => { clearTimeout(tb); tb = setTimeout(() => carregarContratos($('#ct-busca').value), 250); };
  $('#ct-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#ct-msg'); msg.textContent = '';
    const corpo = { hospede: $('#ct-hospede').value.trim(), imovel: $('#ct-imovel').value.trim(), reservaId: $('#ct-reserva').value.trim(), tipo: $('#ct-tipo').value, dataInicio: $('#ct-ini').value, dataFim: $('#ct-fim').value, valor: $('#ct-valor').value, assinado: $('#ct-assinado').checked, obs: $('#ct-obs').value.trim() };
    const arq = $('#ct-arq').files[0];
    try {
      if (arq) { if (arq.size > 20 * 1024 * 1024) throw new Error('Arquivo acima de 20 MB.'); corpo.nomeArquivo = arq.name; corpo.base64 = await arquivoParaBase64(arq); }
      await api('POST', '/juridico/contratos', corpo);
      $('#ct-form').reset(); $('#ct-box').open = false; carregarContratos($('#ct-busca').value); carregarContratosPendentes();
    } catch (e) { msg.textContent = e.message; }
  };
  carregarContratos('');
  carregarContratosPendentes();
}
async function carregarContratosPendentes() {
  const box = $('#ct-pendentes'); if (!box) return;
  try {
    const { pendentes, atrasados48h } = await api('GET', '/juridico/contratos/pendentes?dias=30');
    if (!pendentes.length) { box.innerHTML = '<div class="aviso" style="background:#f3faf4;border-color:#bfe3c8">✅ Todas as reservas diretas recentes têm contrato arquivado.</div>'; return; }
    box.innerHTML = `<div class="followups" style="border-left-color:var(--alerta);background:#fdf4f3">
      <strong style="color:var(--alerta)">⚠️ ${pendentes.length} reserva(s) direta(s) sem contrato${atrasados48h ? ` · ${atrasados48h} há mais de 48h` : ''}</strong>
      ${pendentes.slice(0, 15).map(p => `<span class="chip"${p.atrasado48h ? ' style="background:#fde7e6;border-color:#f3c9c6;color:var(--alerta);font-weight:600"' : ''}>${p.atrasado48h ? '⏰ ' : ''}${esc(p.hospede)} · ${esc(p.imovel)}${p.horasDesde != null ? ' · ' + (p.horasDesde < 48 ? p.horasDesde + 'h' : Math.floor(p.horasDesde / 24) + 'd') : ''}${p.reserva ? ' · ' + esc(p.reserva) : ''}</span>`).join('')}</div>`;
  } catch (_) { box.innerHTML = ''; }
}
async function carregarContratos(busca) {
  const alvo = $('#ct-lista'); if (!alvo) return;
  try {
    const { contratos } = await api('GET', '/juridico/contratos' + (busca ? '?busca=' + encodeURIComponent(busca) : ''));
    if (!contratos.length) { alvo.innerHTML = `<div class="vazio">Nenhum contrato${busca ? ' para “' + esc(busca) + '”' : ' arquivado'}.</div>`; return; }
    alvo.innerHTML = contratos.map(c => `<div class="item">
      <h3 style="margin:0 0 4px">${esc(c.hospede)} ${c.assinado ? '<span class="chip" style="background:#e6f4ea;border-color:#bfe3c8">✅ assinado</span>' : '<span class="chip" style="background:#fdf3e3;border-color:#f0dca6">pendente</span>'}</h3>
      <div class="meta"><span class="chip">${esc(c.tipo)}</span>${c.imovel ? `<span class="chip">${esc(c.imovel)}</span>` : ''}${c.reservaId ? `<span class="chip">${esc(c.reservaId)}</span>` : ''}${(c.dataInicio || c.dataFim) ? `<span>${esc(c.dataInicio || '?')} → ${esc(c.dataFim || '?')}</span>` : ''}${c.valor ? `<span>${rMoney(c.valor)}</span>` : ''}</div>
      ${c.obs ? `<p style="margin:6px 0 0;font-size:.9rem">${esc(c.obs)}</p>` : ''}
      <div class="acoes">${c.nomeArquivo ? `<a class="btn peq" href="/staff/api/juridico/contratos/${c.id}/arquivo" target="_blank" rel="noopener">📄 Abrir arquivo</a>` : ''}<button class="btn peq perigo" data-del-ct="${c.id}">Excluir</button></div>
    </div>`).join('');
    alvo.querySelectorAll('[data-del-ct]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este contrato do arquivo?')) return; try { await api('DELETE', '/juridico/contratos/' + b.dataset.delCt); carregarContratos(busca); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Consentimentos LGPD ---------
async function renderLGPD() {
  const c = conteudo();
  c.innerHTML = cabecalho('Consentimentos LGPD', 'Registro de opt-in/opt-out de comunicação por contato — base para respeitar a vontade do titular.') + `
    <details class="cr-box" id="lg-box"><summary class="cr-sum">➕ Registrar consentimento</summary>
      <form class="form" id="lg-form" style="max-width:640px;margin-top:12px">
        <label>Contato (telefone/e-mail) * <input id="lg-contato" required maxlength="120"></label>
        <div class="hi-grid">
          <label>Status <select id="lg-status"><option value="opt-in">Opt-in (aceita)</option><option value="opt-out">Opt-out (recusa)</option></select></label>
          <label>Canal <input id="lg-canal" maxlength="40" placeholder="whatsapp / e-mail"></label>
          <label>Origem <input id="lg-origem" maxlength="60" placeholder="site / campanha"></label>
          <label>Data <input id="lg-data" type="date"></label>
        </div>
        <label>Observação <input id="lg-obs" maxlength="200"></label>
        <button class="btn" type="submit">Registrar</button>
      </form>
    </details>
    <div class="barra"><input id="lg-busca" type="search" placeholder="🔎 Buscar contato…" style="flex:1;min-width:220px"></div>
    <div id="lg-lista"><p class="vazio">Carregando…</p></div>`;
  $('#lg-form').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('POST', '/lgpd/consentimentos', { contato: $('#lg-contato').value.trim(), status: $('#lg-status').value, canal: $('#lg-canal').value.trim(), origem: $('#lg-origem').value.trim(), data: $('#lg-data').value, obs: $('#lg-obs').value.trim() }); $('#lg-form').reset(); $('#lg-box').open = false; carregarLGPD(''); }
    catch (e) { alert(e.message); }
  };
  let tb; $('#lg-busca').oninput = () => { clearTimeout(tb); tb = setTimeout(() => carregarLGPD($('#lg-busca').value), 250); };
  carregarLGPD('');
}
async function carregarLGPD(busca) {
  const alvo = $('#lg-lista'); if (!alvo) return;
  try {
    const { itens, optout } = await api('GET', '/lgpd/consentimentos' + (busca ? '?busca=' + encodeURIComponent(busca) : ''));
    if (!itens.length) { alvo.innerHTML = `<div class="vazio">Nenhum registro${busca ? ' para “' + esc(busca) + '”' : ''}.</div>`; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${itens.length} registro(s) · ${optout} opt-out</p>` + itens.map(c => `
      <div class="linha-item" style="border-left:4px solid ${c.status === 'opt-out' ? 'var(--alerta)' : 'var(--ok)'}">
        <span class="qtd" style="background:${c.status === 'opt-out' ? 'var(--alerta)' : 'var(--ok)'};color:#fff;font-size:.72rem">${c.status === 'opt-out' ? 'OUT' : 'IN'}</span>
        <span class="nome">${esc(c.contato)} <span class="obs">${[c.canal, c.origem].filter(Boolean).map(esc).join(' · ')}${c.data ? ' · ' + esc(c.data) : ''}${c.obs ? ' · ' + esc(c.obs) : ''}</span></span>
        <button class="btn peq perigo" data-del-lg="${c.id}" style="grid-column:2;grid-row:1/span 3">✕</button>
      </div>`).join('');
    alvo.querySelectorAll('[data-del-lg]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este registro?')) return; try { await api('DELETE', '/lgpd/consentimentos/' + b.dataset.delLg); carregarLGPD(busca); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Calendário fiscal ---------
async function renderFiscal() {
  const c = conteudo();
  c.innerHTML = cabecalho('Calendário fiscal', 'Tributos e obrigações com vencimento e status. Vermelho = atrasado; âmbar = vence em 7 dias.') + `
    <details class="cr-box" id="fi-box"><summary class="cr-sum">➕ Novo tributo/obrigação</summary>
      <form class="form" id="fi-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="fi-id">
        <label>Tributo / obrigação * <input id="fi-tributo" required maxlength="120" placeholder="ex.: DAS Simples, DEFIS, ISS…"></label>
        <div class="hi-grid">
          <label>Competência <input id="fi-comp" maxlength="20" placeholder="ex.: 06/2026"></label>
          <label>Vencimento <input id="fi-venc" type="date"></label>
          <label>Valor (R$) <input id="fi-valor" type="number" min="0" step="0.01"></label>
          <label>Periodicidade <input id="fi-per" maxlength="30" placeholder="mensal / anual"></label>
        </div>
        <label>Observação <input id="fi-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="fi-salvar">Adicionar</button>
      </form>
    </details>
    <div id="fi-cards" class="cards"></div>
    <div id="fi-lista"><p class="vazio">Carregando…</p></div>`;
  $('#fi-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { tributo: $('#fi-tributo').value.trim(), competencia: $('#fi-comp').value.trim(), vencimento: $('#fi-venc').value, valor: $('#fi-valor').value, periodicidade: $('#fi-per').value.trim(), obs: $('#fi-obs').value.trim() };
    try { const id = $('#fi-id').value; if (id) await api('PATCH', '/fiscal/' + id, corpo); else await api('POST', '/fiscal', corpo); $('#fi-form').reset(); $('#fi-id').value = ''; $('#fi-salvar').textContent = 'Adicionar'; $('#fi-box').open = false; carregarFiscal(); }
    catch (e) { alert(e.message); }
  };
  carregarFiscal();
}
async function carregarFiscal() {
  const alvo = $('#fi-lista'); if (!alvo) return;
  try {
    const { itens, hoje } = await api('GET', '/fiscal');
    const abertos = itens.filter(i => i.status !== 'pago' && i.status !== 'dispensado');
    const em7 = new Date(Date.parse(hoje) + 7 * 86400000).toISOString().slice(0, 10);
    const atrasados = abertos.filter(i => i.atrasado);
    const vencendo = abertos.filter(i => !i.atrasado && i.vencimento && i.vencimento <= em7);
    const totalAberto = abertos.reduce((s, i) => s + (Number(i.valor) || 0), 0);
    $('#fi-cards').innerHTML = `<div class="card"><div class="n" style="color:var(--alerta)">${atrasados.length}</div><div class="rot">Atrasados</div></div>
      <div class="card"><div class="n" style="color:var(--cerrado)">${vencendo.length}</div><div class="rot">Vencendo em 7 dias</div></div>
      <div class="card"><div class="n">${rMoney(totalAberto)}</div><div class="rot">Total em aberto</div></div>`;
    if (!itens.length) { alvo.innerHTML = '<div class="vazio">Nenhuma obrigação cadastrada. Adicione o calendário fiscal (DAS, DEFIS, ISS, IR…).</div>'; return; }
    const diasAte = (d) => d ? Math.round((Date.parse(d) - Date.parse(hoje)) / 86400000) : null;
    alvo.innerHTML = itens.map(i => {
      const pago = i.status === 'pago' || i.status === 'dispensado';
      const n = diasAte(i.vencimento);
      const cor = pago ? 'var(--ok)' : i.atrasado ? 'var(--alerta)' : (n != null && n <= 7 ? 'var(--cerrado)' : 'var(--concreto)');
      const badge = pago ? 'st-feito' : i.atrasado ? 'st-erro' : 'st-pendente';
      const rot = i.status === 'pago' ? 'PAGO' : i.status === 'dispensado' ? 'DISPENSADO' : i.atrasado ? 'ATRASADO' : 'PREVISTO';
      return `<div class="linha-item" style="border-left:4px solid ${cor};${pago ? 'opacity:.7' : ''}">
        <span class="qtd">${i.vencimento ? esc(i.vencimento.slice(8, 10) + '/' + i.vencimento.slice(5, 7)) : '—'}</span>
        <span class="nome"><span class="badge ${badge}">${rot}</span> ${esc(i.tributo)} <span class="obs">${i.competencia ? 'comp. ' + esc(i.competencia) : ''}${i.periodicidade ? ' · ' + esc(i.periodicidade) : ''}${i.obs ? ' · ' + esc(i.obs) : ''}</span></span>
        <span class="quem">${i.valor ? rMoney(i.valor) : ''}</span>
        <div class="acoes" style="grid-column:2;grid-row:1/span 3">
          ${i.status !== 'pago' ? `<button class="btn peq" data-fpago="${i.id}">Pago ✓</button>` : `<button class="btn peq secund" data-freabrir="${i.id}">Reabrir</button>`}
          <button class="btn peq secund" data-fedit="${i.id}">✎</button>
          <button class="btn peq perigo" data-fdel="${i.id}">✕</button>
        </div></div>`;
    }).join('');
    alvo.querySelectorAll('[data-fpago]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/fiscal/' + b.dataset.fpago, { status: 'pago' }); carregarFiscal(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-freabrir]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/fiscal/' + b.dataset.freabrir, { status: 'previsto' }); carregarFiscal(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-fdel]').forEach(b => b.onclick = async () => { if (!confirm('Excluir?')) return; try { await api('DELETE', '/fiscal/' + b.dataset.fdel); carregarFiscal(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-fedit]').forEach(b => b.onclick = () => { const i = itens.find(x => x.id === b.dataset.fedit); if (!i) return; $('#fi-id').value = i.id; $('#fi-tributo').value = i.tributo; $('#fi-comp').value = i.competencia || ''; $('#fi-venc').value = i.vencimento || ''; $('#fi-valor').value = i.valor || ''; $('#fi-per').value = i.periodicidade || ''; $('#fi-obs').value = i.obs || ''; $('#fi-salvar').textContent = 'Salvar alterações'; $('#fi-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' }); });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Compras: histórico de preços ---------
async function renderComprasPrecos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Histórico de preços', 'Registre cada compra para acompanhar a evolução dos preços por item e o total por fornecedor.') + `
    <details class="cr-box" id="cp2-box"><summary class="cr-sum">➕ Registrar compra</summary>
      <form class="form" id="cp2-form" style="max-width:680px;margin-top:12px">
        <label>Item * <input id="cp2-item" required maxlength="120"></label>
        <div class="hi-grid">
          <label>Fornecedor <input id="cp2-forn" maxlength="80"></label>
          <label>Categoria <input id="cp2-cat" maxlength="60"></label>
          <label>Casa <input id="cp2-casa" maxlength="60"></label>
          <label>Quantidade <input id="cp2-qtd" type="number" min="1" step="1" value="1"></label>
          <label>Valor unitário (R$) <input id="cp2-vu" type="number" min="0" step="0.01"></label>
          <label>Data <input id="cp2-data" type="date"></label>
        </div>
        <button class="btn" type="submit">Registrar</button>
      </form>
    </details>
    <h2 class="titulo" style="font-size:1.15rem">Preço por item</h2>
    <div id="cp2-hist"><p class="vazio">Carregando…</p></div>
    <h2 class="titulo" style="font-size:1.15rem;margin-top:20px">Total por fornecedor</h2>
    <div id="cp2-forn"></div>
    <h2 class="titulo" style="font-size:1.15rem;margin-top:20px">Últimas compras</h2>
    <div id="cp2-regs"></div>`;
  $('#cp2-form').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('POST', '/compras/registro', { item: $('#cp2-item').value.trim(), fornecedor: $('#cp2-forn').value.trim(), categoria: $('#cp2-cat').value.trim(), casa: $('#cp2-casa').value.trim(), quantidade: $('#cp2-qtd').value, valorUnitario: $('#cp2-vu').value, data: $('#cp2-data').value }); $('#cp2-form').reset(); $('#cp2-qtd').value = 1; $('#cp2-box').open = false; carregarComprasPrecos(); }
    catch (e) { alert(e.message); }
  };
  carregarComprasPrecos();
}
async function carregarComprasPrecos() {
  const H = $('#cp2-hist'); if (!H) return;
  try {
    const { registros, historico, fornecedores } = await api('GET', '/compras/registro');
    H.innerHTML = historico.length ? `<table><thead><tr><th>Item</th><th>Compras</th><th>Menor</th><th>Médio</th><th>Maior</th><th>Último</th></tr></thead><tbody>
      ${historico.map(h => `<tr><td><b>${esc(h.item)}</b></td><td>${h.compras}</td><td>${rMoney2(h.min)}</td><td>${rMoney2(h.medio)}</td><td>${rMoney2(h.max)}</td><td>${rMoney2(h.ultimo)} <span class="obs">${esc(h.ultimoData || '')}</span></td></tr>`).join('')}
    </tbody></table>` : '<div class="vazio">Registre compras para ver o histórico de preços.</div>';
    $('#cp2-forn').innerHTML = fornecedores.length ? `<div class="lista-itens">${fornecedores.map(f => `<div class="linha-item"><span class="nome">${esc(f.fornecedor)}</span><span class="quem">${rMoney2(f.total)}</span></div>`).join('')}</div>` : '';
    $('#cp2-regs').innerHTML = registros.length ? registros.slice(0, 40).map(r => `<div class="linha-item">
      <span class="qtd">${esc((r.data || '').slice(8, 10) + '/' + (r.data || '').slice(5, 7))}</span>
      <span class="nome">${r.quantidade}× ${esc(r.item)} <span class="obs">${[r.fornecedor, r.casa].filter(Boolean).map(esc).join(' · ')}</span></span>
      <span class="quem">${rMoney2(r.valorTotal)}</span>
      <button class="btn peq perigo" data-del-cp2="${r.id}" style="grid-column:2;grid-row:1/span 3">✕</button></div>`).join('') : '';
    $('#cp2-regs').querySelectorAll('[data-del-cp2]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este registro?')) return; try { await api('DELETE', '/compras/registro/' + b.dataset.delCp2); carregarComprasPrecos(); } catch (e) { alert(e.message); } });
  } catch (e) { H.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Recebimentos (controle manual de sinal/saldo das reservas diretas) ---------
async function renderRecebimentos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Recebimentos', 'Reservas diretas com check-in próximo. A Stays não informa o pagamento, então marque aqui o sinal e o saldo recebidos. Fica em vermelho quando o check-in está a ≤7 dias e o sinal ainda não entrou.') + `
    <div class="barra"><label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Próximos
      <select id="rc-dias"><option value="14">14 dias</option><option value="21" selected>21 dias</option><option value="45">45 dias</option></select></label>
      <button class="btn secund peq" id="rc-atualizar">Atualizar</button></div>
    <div id="rc-lista"><p class="vazio">Carregando…</p></div>`;
  $('#rc-dias').onchange = carregarRecebimentos;
  $('#rc-atualizar').onclick = carregarRecebimentos;
  carregarRecebimentos();
}
async function carregarRecebimentos() {
  const alvo = $('#rc-lista'); if (!alvo) return;
  try {
    const { reservas, alertas } = await api('GET', '/financeiro/recebimentos?dias=' + ($('#rc-dias').value || 21));
    if (!reservas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma reserva direta com check-in no período.</div>'; return; }
    alvo.innerHTML = (alertas ? `<div class="aviso">⚠️ ${alertas} reserva(s) com check-in em ≤7 dias e sinal ainda não recebido.</div>` : '') + reservas.map(r => `
      <div class="item" style="${r.alerta ? 'border-left:4px solid var(--alerta)' : (r.sinalRecebido && r.saldoRecebido ? 'border-left:4px solid var(--ok)' : '')}">
        <h3 style="margin:0 0 4px">${esc(r.imovel)} · ${esc(r.hospede)}</h3>
        <div class="meta"><span>check-in ${esc(r.checkIn)} (${r.diasAte === 0 ? 'hoje' : 'em ' + r.diasAte + 'd'})</span>${r.valorTotal ? `<span class="chip">${rMoney(r.valorTotal)}</span>` : ''}${r.reserva ? `<span class="chip">${esc(r.reserva)}</span>` : ''}</div>
        <div class="acoes" style="margin-top:8px">
          <button class="btn peq ${r.sinalRecebido ? '' : 'secund'}" data-sinal="${r.reserva}" data-v="${r.sinalRecebido ? 0 : 1}">${r.sinalRecebido ? '✅ Sinal recebido' : 'Marcar sinal'}</button>
          <button class="btn peq ${r.saldoRecebido ? '' : 'secund'}" data-saldo="${r.reserva}" data-v="${r.saldoRecebido ? 0 : 1}">${r.saldoRecebido ? '✅ Saldo recebido' : 'Marcar saldo'}</button>
        </div>
      </div>`).join('');
    const flip = async (el, attr, campo) => { try { await api('POST', '/financeiro/recebimentos/' + el.dataset[attr], { [campo]: el.dataset.v === '1' }); carregarRecebimentos(); } catch (e) { alert(e.message); } };
    alvo.querySelectorAll('[data-sinal]').forEach(b => b.onclick = () => flip(b, 'sinal', 'sinalRecebido'));
    alvo.querySelectorAll('[data-saldo]').forEach(b => b.onclick = () => flip(b, 'saldo', 'saldoRecebido'));
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Fechamento contábil (checklist mensal + guias) ---------
async function renderFechamento() {
  const c = conteudo();
  c.innerHTML = cabecalho('Fechamento contábil', 'Checklist do fechamento de cada mês e a pasta de guias/comprovantes.') + `
    <div class="barra"><label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Mês <input type="month" id="fc-mes" value="${mesAtual()}"></label></div>
    <div class="ficha">
      <div class="ficha-col"><div class="ficha-bloco"><h3>✅ Checklist</h3><div id="fc-check"><p class="vazio">Carregando…</p></div>
        <label style="margin-top:10px">Observações <textarea id="fc-obs" rows="2" maxlength="500"></textarea></label>
        <button class="btn peq secund" id="fc-obs-salvar">Salvar observações</button></div></div>
      <div class="ficha-col"><div class="ficha-bloco"><h3>📎 Guias e comprovantes</h3>
        <label class="btn peq" style="display:inline-block;cursor:pointer">➕ Anexar documento<input type="file" id="fc-arq" accept=".pdf,image/*" style="display:none"></label>
        <p id="fc-msg" class="sub" style="margin:8px 0 0"></p>
        <div id="fc-docs" style="margin-top:10px"></div></div></div>
    </div>`;
  $('#fc-mes').onchange = carregarFechamento;
  $('#fc-obs-salvar').onclick = async () => { try { await api('POST', '/contabil/fechamento', { mes: $('#fc-mes').value, obs: $('#fc-obs').value }); $('#fc-obs-salvar').textContent = '✓ Salvo'; setTimeout(() => $('#fc-obs-salvar').textContent = 'Salvar observações', 1500); } catch (e) { alert(e.message); } };
  $('#fc-arq').onchange = async (ev) => {
    const file = ev.target.files[0]; if (!file) return;
    const msg = $('#fc-msg'); msg.textContent = 'Enviando…';
    try { if (file.size > 20 * 1024 * 1024) throw new Error('Arquivo acima de 20 MB.'); const base64 = await arquivoParaBase64(file); await api('POST', '/contabil/documentos', { mes: $('#fc-mes').value, nomeArquivo: file.name, titulo: file.name, base64 }); msg.textContent = ''; ev.target.value = ''; carregarFechamento(); }
    catch (e) { msg.textContent = e.message; }
  };
  carregarFechamento();
}
async function carregarFechamento() {
  const mes = $('#fc-mes').value || mesAtual();
  try {
    const { checklist, estado, docs } = await api('GET', '/contabil/fechamento?mes=' + mes);
    const feitos = checklist.filter(x => estado.itens && estado.itens[x.chave]).length;
    $('#fc-check').innerHTML = `<p class="sub" style="margin:0 0 8px">${feitos}/${checklist.length} concluído(s)</p>` + checklist.map(x => `
      <label style="display:flex;flex-direction:row;align-items:center;gap:8px;padding:6px 0;font-weight:500;cursor:pointer">
        <input type="checkbox" data-chk="${x.chave}" ${estado.itens && estado.itens[x.chave] ? 'checked' : ''} style="width:auto;flex:none"> <span>${esc(x.rot)}</span></label>`).join('');
    if ($('#fc-obs')) $('#fc-obs').value = estado.obs || '';
    $('#fc-check').querySelectorAll('[data-chk]').forEach(cb => cb.onchange = async () => { try { await api('POST', '/contabil/fechamento', { mes, chave: cb.dataset.chk, valor: cb.checked }); carregarFechamento(); } catch (e) { alert(e.message); } });
    $('#fc-docs').innerHTML = docs.length ? docs.map(d => `<div class="linha-item"><span class="nome">📄 <a href="/staff/api/contabil/documentos/${d.id}/arquivo" target="_blank" rel="noopener">${esc(d.titulo)}</a></span><button class="btn peq perigo" data-del-doc="${d.id}" style="grid-column:2;grid-row:1/span 3">✕</button></div>`).join('') : '<p class="sub" style="margin:0">Nenhum documento anexado neste mês.</p>';
    $('#fc-docs').querySelectorAll('[data-del-doc]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este documento?')) return; try { await api('DELETE', '/contabil/documentos/' + b.dataset.delDoc); carregarFechamento(); } catch (e) { alert(e.message); } });
  } catch (e) { $('#fc-check').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
