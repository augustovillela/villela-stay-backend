'use strict';
// ============================================================================
// Portal Staff — módulo: app-hospede
// Área do Hóspede (admin), Pedidos de hóspedes, Fidelidade, Conta corrente e Minha conta.
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- Área do Hóspede: conteúdo reservado por imóvel + contas (admin) ---------
async function renderHospedeInfo() {
  const c = conteudo();
  c.innerHTML = cabecalho('Área do Hóspede', 'Preencha as informações reservadas de cada casa (Wi-Fi, acesso, manual, guia). O hóspede só vê a casa que reservou; Wi-Fi e códigos de acesso são liberados de 2 dias antes do check-in até o check-out. Campos vazios usam o padrão.') +
    `<div id="hi-contas" class="aviso">Carregando contas…</div>
     <details class="hi-bloco" open><summary><strong>🏠 Informações por imóvel</strong> (Wi-Fi, acesso, manual, guia)</summary>
       <div class="barra"><label>Imóvel <select id="hi-cod"></select></label></div>
       <div id="hi-form"></div>
     </details>
     <details class="hi-bloco"><summary><strong>📧 Cadastrar e-mail de hóspede</strong> (acesso ao app p/ hóspedes antigos de OTA)</summary><div id="hi-email"><p class="aviso">Carregando…</p></div></details>
     <details class="hi-bloco"><summary><strong>🛎️ Serviços extras</strong> (catálogo e preços)</summary><div id="hi-servicos"><p class="aviso">Carregando…</p></div></details>
     <details class="hi-bloco"><summary><strong>⭐ Programa de fidelidade</strong> (textos exibidos ao hóspede)</summary><div id="hi-fid"><p class="aviso">Carregando…</p></div></details>`;
  let info = {}, imoveis = [];
  try { const r1 = await api('GET', '/hospede/propriedades-info'); info = r1.info || {}; }
  catch (e) { $('#hi-form').innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  try { const r2 = await api('GET', '/stays/imoveis'); imoveis = r2.imoveis || []; } catch (e) { /* títulos são opcionais */ }
  try {
    const { contas } = await api('GET', '/hospede/contas');
    const tot = contas.length, pend = contas.filter(x => x.precisaTrocarSenha).length;
    $('#hi-contas').innerHTML = `<strong>${tot}</strong> conta(s) de hóspede${pend ? ` · ${pend} ainda não trocou a senha` : ''}.` +
      (tot ? `<details style="margin-top:8px"><summary style="cursor:pointer">Ver contas</summary><table style="margin-top:8px"><thead><tr><th>Nome</th><th>Login</th><th>Stays</th><th>Criada</th></tr></thead><tbody>${contas.map(x => `<tr><td>${esc(x.nome || '—')}</td><td>${esc(x.email || x.telefone || '—')}</td><td>${esc(x.staysClientId || '—')}</td><td>${esc((x.criadoEm || '').slice(0, 10))}</td></tr>`).join('')}</tbody></table></details>` : '');
  } catch (e) { $('#hi-contas').innerHTML = `<span class="erro">${esc(e.message)}</span>`; }

  const tituloDe = {}; imoveis.forEach(i => tituloDe[i.codigo] = i.titulo);
  const codigos = Object.keys(info).filter(k => k !== '_padrao').sort();
  const sel = $('#hi-cod');
  sel.innerHTML = codigos.map(cod => `<option value="${cod}">${esc(cod)}${tituloDe[cod] ? ' — ' + esc(tituloDe[cod]) : ''}</option>`).join('');
  const padrao = info._padrao || {};
  const desenhar = (cod) => {
    const d = info[cod] || {}, w = d.wifi || {}, a = d.acesso || {};
    $('#hi-form').innerHTML = `<form class="form form-larga" id="form-hi">
      <h3 style="margin:6px 0">${esc(cod)}${tituloDe[cod] ? ' — ' + esc(tituloDe[cod]) : ''}</h3>
      <div class="hi-grid">
        <label>Wi-Fi — rede <input id="hi-wrede" value="${esc(w.rede || '')}"></label>
        <label>Wi-Fi — senha <input id="hi-wsenha" value="${esc(w.senha || '')}"></label>
        <label>Portão <input id="hi-portao" value="${esc(a.portao || '')}"></label>
        <label>Fechadura <input id="hi-fechadura" value="${esc(a.fechadura || '')}"></label>
        <label>Check-in <input id="hi-cin" value="${esc(d.checkinHora || '')}" placeholder="${esc(padrao.checkinHora || '')}"></label>
        <label>Check-out <input id="hi-cout" value="${esc(d.checkoutHora || '')}" placeholder="${esc(padrao.checkoutHora || '')}"></label>
        <label>Manual (URL) <input id="hi-manual" value="${esc(d.manualUrl || '')}" placeholder="https://…"></label>
        <label>Guia (URL) <input id="hi-guia" value="${esc(d.guiaUrl || '')}" placeholder="${esc(padrao.guiaUrl || '')}"></label>
      </div>
      <label>Instruções de acesso <textarea id="hi-instr" rows="2">${esc(a.instrucoes || '')}</textarea></label>
      <label>Contatos <input id="hi-contatos" value="${esc(d.contatos || '')}" placeholder="${esc(padrao.contatos || '')}"></label>
      <label>Observações <textarea id="hi-obs" rows="2">${esc(d.observacoes || '')}</textarea></label>
      <div class="acoes"><button class="btn" type="submit">Salvar ${esc(cod)}</button></div>
      <p id="hi-msg" class="erro"></p>
    </form>`;
    $('#form-hi').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = $('#hi-msg'); msg.className = 'erro'; msg.textContent = '';
      const corpo = {
        wifi: { rede: $('#hi-wrede').value, senha: $('#hi-wsenha').value },
        acesso: { portao: $('#hi-portao').value, fechadura: $('#hi-fechadura').value, instrucoes: $('#hi-instr').value },
        manualUrl: $('#hi-manual').value, guiaUrl: $('#hi-guia').value, contatos: $('#hi-contatos').value,
        checkinHora: $('#hi-cin').value, checkoutHora: $('#hi-cout').value, observacoes: $('#hi-obs').value,
      };
      try { const r = await api('PUT', '/hospede/propriedade/' + cod, corpo); info[cod] = r.info; msg.className = 'ok-msg'; msg.textContent = 'Salvo!'; }
      catch (e) { msg.textContent = e.message; }
    };
  };
  sel.onchange = () => desenhar(sel.value);
  if (codigos.length) desenhar(codigos[0]); else $('#hi-form').innerHTML = '<p class="aviso">Estrutura de propriedades ainda não inicializada. Faça um deploy e recarregue.</p>';
  renderHiEmail();
  renderHiServicos();
  renderHiFid();
}

// Cadastro de e-mail de acesso para hóspede antigo de OTA (busca na Stays + vincula e-mail).
async function renderHiEmail() {
  const box = $('#hi-email'); if (!box) return;
  box.innerHTML = `<p class="aviso" style="margin:0 0 10px">Para hóspedes antigos (ex.: Airbnb/Booking) cujo e-mail na Stays é mascarado. Busque o hóspede, informe o <strong>e-mail real</strong> dele e salve — depois ele entra sozinho na Área do Hóspede digitando esse e-mail. Marque "enviar link agora" para já mandar o convite.</p>
    <div class="barra"><input id="he-busca" placeholder="Buscar hóspede na Stays (nome)"><button type="button" class="btn secund" id="he-buscar">Buscar</button></div>
    <div id="he-result"></div>
    <div id="he-form" class="hidden" style="margin-top:12px"></div>`;
  const selecionar = (id, nome) => {
    const f = $('#he-form'); f.classList.remove('hidden');
    f.innerHTML = `<form class="form" id="form-he" style="box-shadow:none;padding:0;border:none;max-width:640px">
      <p>Hóspede: <strong>${esc(nome)}</strong> <span class="sub">(${esc(id)})</span></p>
      <label>E-mail de acesso <input type="email" id="he-email" placeholder="email-real@dohospede.com" autocapitalize="off" spellcheck="false"></label>
      <label class="serv-ativo"><input type="checkbox" id="he-enviar" checked> Enviar o link de acesso por e-mail agora</label>
      <div class="acoes"><button class="btn" type="submit">Vincular e-mail</button> <span id="he-msg" class="ok-msg"></span></div>
    </form>`;
    $('#form-he').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = $('#he-msg'); msg.className = 'ok-msg'; msg.textContent = '';
      const email = $('#he-email').value.trim();
      if (!email.includes('@')) { msg.className = 'erro'; msg.textContent = 'Informe um e-mail válido.'; return; }
      try {
        const enviar = $('#he-enviar').checked;
        const r = await api('POST', '/hospede/vincular-email', { staysClientId: id, email, enviarLink: enviar });
        msg.textContent = (r.criada ? 'E-mail vinculado (conta criada).' : 'E-mail vinculado.') + (enviar ? (r.linkEnviado ? ' Link enviado por e-mail.' : ' ⚠️ Não consegui enviar o e-mail — confira o endereço.') : '');
      } catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
    };
  };
  const buscar = async () => {
    const q = $('#he-busca').value.trim();
    if (q.length < 2) { $('#he-result').innerHTML = '<p class="aviso">Digite ao menos 2 letras.</p>'; return; }
    $('#he-result').innerHTML = '<p class="aviso">Buscando…</p>';
    try {
      const r = await api('GET', '/stays/clientes?busca=' + encodeURIComponent(q) + '&limit=15');
      const cs = r.clientes || [];
      if (!cs.length) { $('#he-result').innerHTML = '<p class="aviso">Nenhum hóspede encontrado.</p>'; return; }
      $('#he-result').innerHTML = `<table><tbody>${cs.map(x => `<tr><td>${esc(x.nome)}</td><td class="sub">${esc(x.origem || '')}</td><td><button type="button" class="btn peq he-sel" data-id="${esc(x.id)}" data-nome="${esc(x.nome)}">Selecionar</button></td></tr>`).join('')}</tbody></table>`;
      box.querySelectorAll('.he-sel').forEach(b => b.onclick = () => selecionar(b.dataset.id, b.dataset.nome));
    } catch (e) { $('#he-result').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };
  $('#he-buscar').onclick = buscar;
  $('#he-busca').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); buscar(); } });
}

// Editor do catálogo de serviços extras (admin).
async function renderHiServicos() {
  const box = $('#hi-servicos'); if (!box) return;
  let servicos = [];
  try { const r = await api('GET', '/hospede/servicos'); servicos = r.servicos || []; }
  catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  const linha = (s) => `<div class="serv-edit" data-id="${esc(s.id || '')}">
    <input data-f="emoji" value="${esc(s.emoji || '')}" maxlength="6" title="Emoji" style="width:52px;text-align:center">
    <input data-f="nome" value="${esc(s.nome || '')}" placeholder="Nome do serviço">
    <input data-f="preco" value="${esc(s.preco || '')}" placeholder="Preço (ex.: a partir de R$ 120)">
    <input data-f="desc" value="${esc(s.desc || '')}" placeholder="Descrição">
    <label class="serv-ativo"><input type="checkbox" data-f="ativo" ${s.ativo !== false ? 'checked' : ''}> ativo</label>
    <button type="button" class="btn peq perigo serv-del" title="Remover">×</button>
  </div>`;
  box.innerHTML = `<p class="aviso" style="margin:0 0 10px">Edite nome, preço e descrição. Desmarque "ativo" para ocultar do hóspede. O preço aparece no card do serviço.</p>
    <div id="serv-lista">${servicos.map(linha).join('')}</div>
    <div class="acoes"><button type="button" class="btn secund" id="serv-add">+ Adicionar serviço</button><button type="button" class="btn" id="serv-salvar">Salvar serviços</button> <span id="serv-msg" class="ok-msg"></span></div>`;
  const wireDel = () => box.querySelectorAll('.serv-del').forEach(b => b.onclick = () => b.closest('.serv-edit').remove());
  wireDel();
  $('#serv-add').onclick = () => { const d = document.createElement('div'); d.innerHTML = linha({ emoji: '✨', nome: '', preco: 'Sob consulta', desc: '', ativo: true }); $('#serv-lista').appendChild(d.firstElementChild); wireDel(); };
  $('#serv-salvar').onclick = async () => {
    const lista = [...box.querySelectorAll('.serv-edit')].map(row => ({
      id: row.dataset.id || '',
      emoji: row.querySelector('[data-f="emoji"]').value, nome: row.querySelector('[data-f="nome"]').value,
      preco: row.querySelector('[data-f="preco"]').value, desc: row.querySelector('[data-f="desc"]').value,
      ativo: row.querySelector('[data-f="ativo"]').checked,
    })).filter(s => s.nome.trim());
    const msg = $('#serv-msg'); msg.className = 'ok-msg'; msg.textContent = '';
    try { await api('PUT', '/hospede/servicos', { servicos: lista }); msg.textContent = 'Salvo!'; renderHiServicos(); }
    catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  };
}

// Editor da config de fidelidade (admin).
async function renderHiFid() {
  const box = $('#hi-fid'); if (!box) return;
  let cfg = {};
  try { cfg = await api('GET', '/hospede/fidelidade-config'); } catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  box.innerHTML = `<form class="form" id="form-fid" style="box-shadow:none;padding:0;border:none;max-width:680px">
    <label>Texto para hóspede recorrente (≥ 2 estadias) <textarea id="fid-rec" rows="2">${esc(cfg.recorrenteTexto || '')}</textarea></label>
    <label>Texto para hóspede novo <textarea id="fid-novo" rows="2">${esc(cfg.novoTexto || '')}</textarea></label>
    <label>Texto da indicação (mostrado no "Indicar um amigo") <textarea id="fid-ind" rows="2">${esc(cfg.indicacaoTexto || '')}</textarea></label>
    <div class="acoes"><button class="btn" type="submit">Salvar fidelidade</button> <span id="fid-msg" class="ok-msg"></span></div>
  </form>`;
  $('#form-fid').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#fid-msg'); msg.className = 'ok-msg'; msg.textContent = '';
    try { await api('PUT', '/hospede/fidelidade-config', { recorrenteTexto: $('#fid-rec').value, novoTexto: $('#fid-novo').value, indicacaoTexto: $('#fid-ind').value }); msg.textContent = 'Salvo!'; }
    catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  };
}

// --------- Pedidos de hóspedes (alteração / evento) ---------
const HP_STATUS = { novo: 'Recebido', em_analise: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado', respondido: 'Respondido' };
async function renderHospedePedidos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Pedidos de hóspedes', 'Solicitações de alteração de reserva e de eventos enviadas pelos hóspedes na Área do Hóspede. Defina o status, envie o orçamento e a resposta — o hóspede acompanha pela área dele. Nada é aplicado na Stays automaticamente.') + `<div id="hp-lista"><p class="aviso">Carregando…</p></div>`;
  let pedidos = [];
  try { const r = await api('GET', '/hospede/pedidos'); pedidos = r.pedidos || []; }
  catch (e) { $('#hp-lista').innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  if (!pedidos.length) { $('#hp-lista').innerHTML = '<p class="aviso">Nenhum pedido por enquanto.</p>'; return; }
  const det = (p) => {
    const d = [];
    if (p.tipo === 'evento' && p.evento) {
      if (p.evento.data) d.push('Data: ' + esc(p.evento.data));
      if (p.evento.convidados != null) d.push(esc(p.evento.convidados) + ' convidados');
      if (p.evento.descricao) d.push(esc(p.evento.descricao));
    } else if (p.tipo === 'servico' && p.servico) {
      if (p.servico.data) d.push('Data: ' + esc(p.servico.data));
      if (p.servico.horario) d.push(esc(p.servico.horario));
      if (p.servico.pessoas != null) d.push(esc(p.servico.pessoas) + ' pessoas');
      if (p.servico.observacoes) d.push(esc(p.servico.observacoes));
    } else if (p.tipo === 'manutencao' && p.manutencao) {
      if (p.manutencao.local) d.push('Local: ' + esc(p.manutencao.local));
      if (p.manutencao.urgencia) d.push('Urgência: ' + esc(p.manutencao.urgencia));
      if (p.manutencao.descricao) d.push(esc(p.manutencao.descricao));
    } else if (p.tipo === 'checkin' && p.checkin) {
      if (p.checkin.horarioChegada) d.push('Chegada prevista: ' + esc(p.checkin.horarioChegada));
      if (p.checkin.pessoas != null) d.push(esc(p.checkin.pessoas) + ' hóspedes');
      if (p.checkin.observacoes) d.push(esc(p.checkin.observacoes));
    } else if (p.alteracao) {
      if (p.alteracao.novoCheckin) d.push('Check-in → ' + esc(p.alteracao.novoCheckin));
      if (p.alteracao.novoCheckout) d.push('Check-out → ' + esc(p.alteracao.novoCheckout));
      if (p.alteracao.novoImovel) d.push('Imóvel → ' + esc(p.alteracao.novoImovel));
      if (p.alteracao.novoHospedes != null) d.push(esc(p.alteracao.novoHospedes) + ' hóspedes');
    }
    return d.join(' · ');
  };
  const tituloPed = (p) => p.tipo === 'evento' ? '🎉 Evento' : p.tipo === 'servico' ? '🛎️ Serviço: ' + esc((p.servico && p.servico.nome) || '') : p.tipo === 'manutencao' ? '🔧 Manutenção' : p.tipo === 'checkin' ? '🚪 Check-in' : '✏️ Alteração';
  $('#hp-lista').innerHTML = pedidos.map(p => `
    <div class="form form-larga" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <strong>${tituloPed(p)} — ${esc(p.hospedeNome || '—')}</strong>
        <span class="tag">${esc(HP_STATUS[p.status] || p.status)}</span>
      </div>
      <div class="sub">${p.reservaId ? 'Reserva ' + esc(p.reservaId) + (p.imovel ? ' · ' + esc(p.imovel) : '') + ' · estadia ' + esc(p.checkinAtual || '?') + ' → ' + esc(p.checkoutAtual || '?') + ' · ' : ''}enviado ${esc(String(p.criadoEm).slice(0, 10))}</div>
      ${det(p) ? `<div><strong>Pedido:</strong> ${det(p)}</div>` : ''}
      ${p.mensagem ? `<div><em>“${esc(p.mensagem)}”</em></div>` : ''}
      <div class="hi-grid" style="margin-top:8px">
        <label>Status <select data-f="status" data-id="${p.id}">${Object.keys(HP_STATUS).map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${HP_STATUS[s]}</option>`).join('')}</select></label>
        <label>Orçamento (R$) <input type="number" data-f="valor" data-id="${p.id}" value="${p.orcamento && p.orcamento.valor != null ? p.orcamento.valor : ''}" placeholder="opcional"></label>
      </div>
      <label>Detalhes do orçamento <input type="text" data-f="detalhes" data-id="${p.id}" value="${p.orcamento ? esc(p.orcamento.detalhes || '') : ''}" placeholder="o que está incluído"></label>
      <label>Resposta ao hóspede <textarea data-f="resposta" data-id="${p.id}" rows="2" placeholder="mensagem que o hóspede verá na área dele">${p.respostaAdmin ? esc(p.respostaAdmin) : ''}</textarea></label>
      <div class="acoes"><button class="btn" data-salvar="${p.id}">Salvar e responder</button> <span id="hp-msg-${p.id}" class="ok-msg"></span></div>
    </div>`).join('');
  $('#hp-lista').querySelectorAll('[data-salvar]').forEach(b => b.onclick = async () => {
    const id = b.dataset.salvar;
    const get = (f) => { const el = document.querySelector(`[data-f="${f}"][data-id="${id}"]`); return el ? el.value : ''; };
    const valor = get('valor'), detalhes = get('detalhes');
    const corpo = { status: get('status'), respostaAdmin: get('resposta'), orcamento: (valor !== '' || detalhes !== '') ? { valor, detalhes } : null };
    const msg = $(`#hp-msg-${id}`); msg.className = 'ok-msg'; msg.textContent = '';
    try { await api('PATCH', '/hospede/pedidos/' + id, corpo); msg.textContent = 'Salvo!'; }
    catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  });
}

// --------- Fidelidade: avaliações & indicações (leitura) ---------
async function renderHospedeFidelidade() {
  const c = conteudo();
  c.innerHTML = cabecalho('Avaliações & indicações', 'Avaliações pós-estadia e indicações de amigos enviadas pelos hóspedes na Área do Hóspede.') + `<div id="hf"><p class="aviso">Carregando…</p></div>`;
  try {
    const { avaliacoes, indicacoes } = await api('GET', '/hospede/fidelidade');
    const estrelas = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
    const av = (avaliacoes || []).length
      ? `<table><thead><tr><th>Hóspede</th><th>Imóvel</th><th>Nota</th><th>Comentário</th><th>Data</th></tr></thead><tbody>${avaliacoes.map(a => `<tr><td>${esc(a.hospedeNome || '—')}</td><td>${esc(a.imovel || '')}</td><td title="${esc(a.nota)}/5" style="color:#d9a441;letter-spacing:2px">${estrelas(a.nota)}</td><td>${esc(a.comentario || '')}</td><td>${esc(String(a.criadoEm).slice(0, 10))}</td></tr>`).join('')}</tbody></table>`
      : '<p class="aviso">Nenhuma avaliação ainda.</p>';
    const ind = (indicacoes || []).length
      ? `<table><thead><tr><th>Quem indicou</th><th>Indicado</th><th>Contato</th><th>Mensagem</th><th>Data</th></tr></thead><tbody>${indicacoes.map(i => `<tr><td>${esc(i.hospedeNome || '—')}</td><td>${esc(i.indicadoNome)}</td><td>${esc(i.indicadoContato)}</td><td>${esc(i.mensagem || '')}</td><td>${esc(String(i.criadoEm).slice(0, 10))}</td></tr>`).join('')}</tbody></table>`
      : '<p class="aviso">Nenhuma indicação ainda.</p>';
    $('#hf').innerHTML = `<h2 style="color:#0c3644;font-size:1.1rem;margin:10px 0">⭐ Avaliações pós-estadia</h2>${av}<h2 style="color:#0c3644;font-size:1.1rem;margin:22px 0 10px">🎁 Indicações</h2>${ind}`;
  } catch (e) { $('#hf').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Conta corrente dos hóspedes ---------
const ccMoney = (v) => (v < 0 ? '−' : '') + 'R$ ' + Math.abs(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ccCor = (v) => v < 0 ? 'var(--alerta)' : v > 0 ? 'var(--ok)' : 'inherit';
async function renderHospedeConta() {
  const c = conteudo();
  c.innerHTML = cabecalho('Conta corrente dos hóspedes', 'Extrato de cada hóspede: cash back, bônus de indicação, cobranças e pagamentos. Saldo negativo = a pagar; positivo = crédito a favor.') +
    `<div class="barra"><input id="cc-busca" placeholder="Buscar hóspede..." style="min-width:220px"></div><div id="cc-lista"><p class="aviso">Carregando…</p></div>`;
  let contas = [];
  try { const r = await api('GET', '/hospede/contas-corrente'); contas = r.contas || []; }
  catch (e) { $('#cc-lista').innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  const desenhar = (filtro) => {
    const f = normaliza(filtro || '');
    const lista = contas.filter(x => !f || normaliza((x.nome || '') + ' ' + (x.login || '')).includes(f));
    $('#cc-lista').innerHTML = !lista.length ? '<p class="aviso">Nenhuma conta.</p>' : `<table><thead><tr><th>Hóspede</th><th>Login</th><th class="num">Lanç.</th><th class="num">Saldo</th><th></th></tr></thead><tbody>${
      lista.map(x => `<tr><td>${esc(x.nome || '—')}</td><td>${esc(x.login || '—')}</td><td class="num">${x.lancamentos}</td>
        <td class="num" style="color:${ccCor(x.saldo)};font-weight:700">${ccMoney(x.saldo)}</td>
        <td><button class="btn peq secund" data-conta="${x.id}">Abrir</button></td></tr>`).join('')}</tbody></table>`;
    $('#cc-lista').querySelectorAll('[data-conta]').forEach(b => b.onclick = () => abrirContaHospede(b.dataset.conta));
  };
  desenhar('');
  $('#cc-busca').oninput = (e) => desenhar(e.target.value);
}
async function abrirContaHospede(hospedeId) {
  const c = conteudo();
  c.innerHTML = cabecalho('Conta corrente', '') + '<p class="aviso">Carregando…</p>';
  let data;
  try { data = await api('GET', '/hospede/conta/' + hospedeId); }
  catch (e) { c.innerHTML = cabecalho('Conta corrente', '') + `<p class="erro">${esc(e.message)}</p>`; return; }
  const h = data.hospede;
  c.innerHTML = cabecalho('Conta corrente — ' + (h.nome || '—'), h.email || h.telefone || '') + `
    <div class="barra"><button class="btn secund" id="cc-voltar">← Voltar</button>
      <span>Saldo: <strong id="cc-saldo" style="color:${ccCor(data.conta.saldo)}">${ccMoney(data.conta.saldo)}</strong></span>
      <span class="sub" id="cc-cd">Créditos ${ccMoney(data.conta.creditos)} · Débitos ${ccMoney(data.conta.debitos)}</span></div>
    <form class="form form-larga" id="cc-form">
      <div class="hi-grid">
        <label>Tipo <select id="cc-tipo">
          <option value="venda">Venda de produto/serviço (débito)</option>
          <option value="cashback">Cash back (crédito)</option>
          <option value="bonus">Bônus de indicação (crédito)</option>
          <option value="cobranca">Cobrança (débito)</option>
          <option value="pagamento">Pagamento (crédito)</option>
          <option value="ajuste">Ajuste (use valor negativo p/ débito)</option>
        </select></label>
        <label class="cc-so-venda">Produto/serviço <input type="text" id="cc-item" placeholder="ex.: Café da manhã"></label>
        <label class="cc-so-venda">Qtd <input type="number" step="1" min="1" id="cc-qtd" value="1"></label>
        <label class="cc-so-venda">Valor unitário (R$) <input type="number" step="0.01" id="cc-unit" placeholder="ex.: 30.00"></label>
        <label class="cc-so-outro">Valor (R$) <input type="number" step="0.01" id="cc-valor" placeholder="ex.: 50.00"></label>
        <label>Validade (opcional) <input type="date" id="cc-validade"></label>
        <label>Reserva (opcional) <input type="text" id="cc-reserva" placeholder="localizador"></label>
      </div>
      <label>Descrição (opcional) <input type="text" id="cc-desc" placeholder="ex.: Café da manhã — 2 diárias"></label>
      <div class="acoes"><button class="btn" type="submit">Lançar</button> <span id="cc-msg" class="ok-msg"></span></div>
    </form>
    <div id="cc-extrato"></div>`;
  $('#cc-voltar').onclick = () => navegar('hospede-conta');
  const toggleTipoCC = () => {
    const venda = $('#cc-tipo').value === 'venda';
    c.querySelectorAll('.cc-so-venda').forEach(el => el.style.display = venda ? '' : 'none');
    c.querySelectorAll('.cc-so-outro').forEach(el => el.style.display = venda ? 'none' : '');
  };
  $('#cc-tipo').onchange = toggleTipoCC; toggleTipoCC();
  const atualizaTopo = (conta) => {
    const s = $('#cc-saldo'); if (s) { s.textContent = ccMoney(conta.saldo); s.style.color = ccCor(conta.saldo); }
    const cd = $('#cc-cd'); if (cd) cd.textContent = `Créditos ${ccMoney(conta.creditos)} · Débitos ${ccMoney(conta.debitos)}`;
  };
  const renderExtrato = (conta) => {
    $('#cc-extrato').innerHTML = !conta.lancamentos.length ? '<p class="aviso">Sem lançamentos.</p>' :
      `<table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th><th class="num">Saldo</th><th></th></tr></thead><tbody>${
        conta.lancamentos.map(l => `<tr><td>${esc(String(l.criadoEm).slice(0, 10))}</td><td>${esc(l.rotulo)}</td>
          <td>${esc(l.descricao || '')}${l.validade ? ` <span class="sub">(val. ${esc(l.validade)})</span>` : ''}</td>
          <td class="num" style="color:${ccCor(l.valor)};font-weight:700">${l.valor >= 0 ? '+' : '−'} ${ccMoney(Math.abs(l.valor))}</td>
          <td class="num">${ccMoney(l.saldoApos)}</td>
          <td><button class="btn peq perigo" data-del="${l.id}" title="Remover">×</button></td></tr>`).join('')}</tbody></table>`;
    $('#cc-extrato').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Remover este lançamento?')) return;
      try { const r = await api('DELETE', '/hospede/conta/' + hospedeId + '/lancamento/' + b.dataset.del); renderExtrato(r.conta); atualizaTopo(r.conta); } catch (e) { alert(e.message); }
    });
  };
  renderExtrato(data.conta);
  $('#cc-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#cc-msg'); msg.className = 'ok-msg'; msg.textContent = '';
    const tipo = $('#cc-tipo').value;
    const corpo = { tipo, descricao: $('#cc-desc').value, validade: $('#cc-validade').value, reservaId: $('#cc-reserva').value };
    if (tipo === 'venda') { corpo.item = $('#cc-item').value; corpo.quantidade = $('#cc-qtd').value; corpo.valorUnitario = $('#cc-unit').value; }
    else { corpo.valor = $('#cc-valor').value; }
    try { const r = await api('POST', '/hospede/conta/' + hospedeId + '/lancamento', corpo); msg.textContent = 'Lançado!'; $('#cc-valor').value = ''; $('#cc-item').value = ''; $('#cc-unit').value = ''; $('#cc-qtd').value = '1'; $('#cc-desc').value = ''; renderExtrato(r.conta); atualizaTopo(r.conta); }
    catch (e) { msg.className = 'erro'; msg.textContent = e.message; }
  };
}

// --------- Minha conta ---------
function renderConta() {
  conteudo().innerHTML = cabecalho('Minha conta', ESTADO.me.nome + ' · ' + ESTADO.me.email) + `
  <div class="ficha-bloco" style="max-width:520px;margin-bottom:16px">
    <h3>🔔 Notificações no celular</h3>
    <p class="sub" style="margin:0 0 10px">Receba avisos fixados do mural e alertas da equipe direto no aparelho (instale o portal como app antes).</p>
    <div id="push-area"><button class="btn secund peq" id="push-btn">Ativar notificações</button></div>
  </div>
  <form class="form" id="form-conta">
    <label>Senha atual <input id="c-atual" type="password" required autocomplete="current-password"></label>
    <label>Nova senha (mín. 8) <input id="c-nova" type="password" required minlength="8" autocomplete="new-password"></label>
    <label>Confirme <input id="c-conf" type="password" required minlength="8" autocomplete="new-password"></label>
    <button class="btn" type="submit">Trocar senha</button>
    <p id="c-msg" class="erro"></p>
  </form>`;
  ligarPush();
  $('#form-conta').onsubmit = async (ev) => {
    ev.preventDefault(); const msg = $('#c-msg'); msg.textContent = ''; msg.className = 'erro';
    if ($('#c-nova').value !== $('#c-conf').value) { msg.textContent = 'As senhas não conferem.'; return; }
    try { await api('POST', '/conta/senha', { atual: $('#c-atual').value, nova: $('#c-nova').value }); msg.className = 'ok-msg'; msg.textContent = 'Senha alterada.'; $('#form-conta').reset(); }
    catch (e) { msg.textContent = e.message; }
  };
}

// --------- Conhecimento da Eva (base que alimenta a concierge IA dos hóspedes) ---------
async function renderEvaConhecimento() {
  const c = conteudo();
  c.innerHTML = cabecalho('Conhecimento da Eva', 'A Eva é a concierge virtual dos hóspedes (no app). Aqui você vê o que ela já sabe e alimenta a inteligência dela com o seu material — cole um texto ou anexe um arquivo (.pdf, .txt, .md). Ela usa isso junto do FAQ ao responder.') +
    `<div id="eva-resumo" class="aviso">Carregando…</div>
     <details class="hi-bloco" open><summary><strong>➕ Alimentar a Eva</strong> (texto ou arquivo)</summary>
       <form class="form form-larga" id="eva-form" style="margin-top:10px">
         <label>Título <input id="eva-tit" maxlength="120" placeholder="ex.: Regras da piscina / Parceiros de passeio / Wi-Fi da área comum"></label>
         <label>Texto <textarea id="eva-txt" rows="5" placeholder="Cole aqui a informação que a Eva deve saber…"></textarea></label>
         <label>…ou anexe um arquivo <input type="file" id="eva-arq" accept=".pdf,.txt,.md,.csv"></label>
         <p class="dica">PDF escaneado (imagem) rende pouco texto — nesse caso, copie e cole o conteúdo.</p>
         <div class="modal-acoes"><button class="btn" type="submit">Adicionar ao conhecimento</button></div>
         <p id="eva-msg" class="erro"></p>
       </form>
     </details>
     <h3 style="margin:18px 0 4px">📚 O que a Eva já aprendeu (base do anfitrião)</h3>
     <div id="eva-lista"><p class="aviso">Carregando…</p></div>`;
  await carregarEvaKB();
  $('#eva-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#eva-msg'); msg.className = 'erro'; msg.textContent = '';
    const titulo = $('#eva-tit').value.trim();
    const arq = $('#eva-arq').files[0];
    const texto = $('#eva-txt').value.trim();
    if (!arq && !texto) { msg.textContent = 'Cole um texto ou anexe um arquivo.'; return; }
    try {
      let body;
      if (arq) {
        if (arq.size > 12 * 1024 * 1024) { msg.textContent = 'Arquivo muito grande (máx. 12 MB).'; return; }
        const base64 = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => no(new Error('Falha ao ler o arquivo.')); fr.readAsDataURL(arq); });
        body = { titulo, arquivoBase64: base64, nomeArquivo: arq.name };
      } else { body = { titulo, texto }; }
      await api('POST', '/eva/conhecimento', body);
      $('#eva-form').reset();
      await carregarEvaKB();
    } catch (e) { msg.textContent = e.message; }
  };
}
async function carregarEvaKB() {
  try {
    const d = await api('GET', '/eva/conhecimento');
    const ativos = d.itens.filter(x => x.ativo !== false).length;
    const pct = d.budget ? Math.min(100, Math.round((d.totalCharsAtivos / d.budget) * 100)) : 0;
    $('#eva-resumo').innerHTML =
      `<strong>Resumo do que a Eva já sabe.</strong> Além do material abaixo, ela sempre recebe automaticamente:` +
      `<ul style="margin:6px 0 6px 18px">${d.fontesAutomaticas.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` +
      `Base do anfitrião: <strong>${ativos}</strong> item(ns) ativo(s) · ${(d.totalCharsAtivos || 0).toLocaleString('pt-BR')}/${(d.budget || 0).toLocaleString('pt-BR')} caracteres usados por conversa (${pct}%).` +
      (pct >= 100 ? ` <span class="erro">Limite atingido — desative itens menos importantes para caber.</span>` : '');
    const lista = $('#eva-lista');
    if (!d.itens.length) { lista.innerHTML = '<p class="vazio">Nada ainda. Adicione o primeiro material acima.</p>'; return; }
    lista.innerHTML = d.itens.map(x => `
      <div style="border:1px solid var(--linha);border-radius:10px;padding:10px 12px;margin-bottom:8px;${x.ativo === false ? 'opacity:.55' : ''}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
          <strong>${esc(x.titulo)}</strong>
          <span class="sub">${x.origem === 'arquivo' ? '📎 ' + esc(x.nomeArquivo || 'arquivo') : '✍️ texto'} · ${(x.chars || 0).toLocaleString('pt-BR')} car.</span>
        </div>
        <details style="margin-top:6px"><summary style="cursor:pointer" class="sub">Ver conteúdo</summary><pre style="white-space:pre-wrap;font-family:inherit;font-size:.9rem;margin:6px 0">${esc(String(x.texto || '').slice(0, 4000))}${(x.texto || '').length > 4000 ? '…' : ''}</pre></details>
        <div class="acoes" style="margin-top:8px">
          <button class="btn peq secund" data-eva-toggle="${x.id}">${x.ativo === false ? '☑️ Ativar' : '⬜ Desativar'}</button>
          <button class="btn peq perigo" data-eva-del="${x.id}">🗑️ Excluir</button>
        </div>
      </div>`).join('');
    lista.querySelectorAll('[data-eva-toggle]').forEach(b => b.onclick = async () => { const it = d.itens.find(x => x.id === b.dataset.evaToggle); try { await api('PATCH', '/eva/conhecimento/' + b.dataset.evaToggle, { ativo: it.ativo === false }); carregarEvaKB(); } catch (e) { alert(e.message); } });
    lista.querySelectorAll('[data-eva-del]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este item do conhecimento da Eva?')) return; try { await api('DELETE', '/eva/conhecimento/' + b.dataset.evaDel); carregarEvaKB(); } catch (e) { alert(e.message); } });
  } catch (e) { $('#eva-lista').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
