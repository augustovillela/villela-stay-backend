// Área do Hóspede — SPA mínima (vanilla JS). Conversa só com /hospede/api/*.
'use strict';
const API = '/hospede/api';
const $ = (s) => document.querySelector(s);

async function api(caminho, opcoes) {
  const r = await fetch(API + caminho, Object.assign({
    headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
  }, opcoes || {}));
  let dados = {};
  try { dados = await r.json(); } catch (e) { /* corpo vazio */ }
  if (!r.ok) throw new Error(dados.erro || ('Erro ' + r.status));
  return dados;
}

function mostrar(idTela) {
  ['tela-login', 'tela-registrar', 'tela-trocar', 'app'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== idTela);
  });
}

const fmtData = (iso) => { if (!iso) return '—'; const [a, m, d] = String(iso).split('-'); return `${d}/${m}/${a}`; };
const fmtMoeda = (v, moeda) => (v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(v));
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

// ---------------- boot ----------------
async function boot() {
  try {
    const { usuario } = await api('/me');
    if (usuario.precisaTrocarSenha) { mostrar('tela-trocar'); return; }
    abrirApp(usuario);
  } catch (e) {
    mostrar('tela-login');
  }
}

// ---------------- login ----------------
$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#login-erro').textContent = '';
  try {
    const { usuario } = await api('/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value.trim(), senha: $('#login-senha').value }) });
    if (usuario.precisaTrocarSenha) { mostrar('tela-trocar'); return; }
    abrirApp(usuario);
  } catch (e) { $('#login-erro').textContent = e.message; }
});

$('#ir-registrar').addEventListener('click', (ev) => { ev.preventDefault(); $('#rg-erro').textContent = ''; mostrar('tela-registrar'); });
$('#voltar-login').addEventListener('click', (ev) => { ev.preventDefault(); $('#login-erro').textContent = ''; mostrar('tela-login'); });

// ---------------- cadastro por código (OTA) ----------------
$('#form-registrar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#rg-erro').textContent = '';
  try {
    const { usuario } = await api('/registrar', {
      method: 'POST', body: JSON.stringify({
        localizador: $('#rg-localizador').value.trim(),
        sobrenome: $('#rg-sobrenome').value.trim(),
        checkin: $('#rg-checkin').value,
        senha: $('#rg-senha').value,
      }),
    });
    abrirApp(usuario);
  } catch (e) { $('#rg-erro').textContent = e.message; }
});

// ---------------- trocar senha (1º acesso) ----------------
$('#form-trocar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#tr-erro').textContent = '';
  try {
    await api('/senha', { method: 'POST', body: JSON.stringify({ atual: $('#tr-atual').value, nova: $('#tr-nova').value }) });
    const { usuario } = await api('/me');
    abrirApp(usuario);
  } catch (e) { $('#tr-erro').textContent = e.message; }
});

// ---------------- app ----------------
function abrirApp(usuario) {
  mostrar('app');
  $('#ola').textContent = usuario.nome ? ('Olá, ' + usuario.nome.split(' ')[0]) : 'Olá';
  carregarReservas();
  carregarPedidos();
  carregarServicos();
}

$('#btn-sair').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch (e) { /* ignora */ }
  location.reload();
});

let RESERVAS = [];
async function carregarReservas() {
  const cont = $('#reservas');
  cont.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const { reservas } = await api('/minhas-reservas');
    RESERVAS = (reservas || []).filter(r => r.status !== 'blocked');
    if (!RESERVAS.length) { cont.innerHTML = '<p class="vazio">Nenhuma reserva encontrada na sua conta.</p>'; return; }
    cont.innerHTML = '';
    RESERVAS.forEach((r, i) => {
      const cancel = r.status === 'canceled';
      const card = document.createElement('div');
      card.className = 'card-reserva' + (cancel ? ' cancelada' : '');
      const tituloR = esc(r.imovelTitulo || r.imovel || 'Hospedagem');
      const acoes = [];
      if (r.imovel && !cancel) acoes.push(`<button type="button" class="btn secund btn-acao btn-info" data-cod="${esc(r.imovel)}">Informações da casa</button>`);
      if (!cancel && r.podeAlterar) acoes.push(`<button type="button" class="btn secund btn-acao btn-pedido" data-tipo="alteracao" data-reserva="${esc(r.id)}" data-titulo="${tituloR}">Solicitar alteração</button>`);
      if (!cancel) acoes.push(`<button type="button" class="btn secund btn-acao btn-pedido" data-tipo="evento" data-reserva="${esc(r.id)}" data-titulo="${tituloR}">Solicitar evento</button>`);
      card.innerHTML = `
        <div class="cr-topo">
          <strong>${tituloR}</strong>
          <span class="badge badge-${esc(r.status)}">${esc(r.statusRotulo || r.status)}</span>
        </div>
        <div class="cr-datas">📅 ${fmtData(r.checkin)} → ${fmtData(r.checkout)}</div>
        <div class="cr-linha">👥 ${r.hospedes || '—'} hóspede(s) · 🏷️ ${esc(r.id || '')}${r.plataforma ? ' · ' + esc(r.plataforma) : ''}</div>
        <div class="cr-valor">${fmtMoeda(r.valor, r.moeda)}</div>
        ${acoes.length ? `<div class="cr-acoes">${acoes.join('')}</div>` : ''}
        ${r.reservationUrl ? `<a class="cr-link" href="${esc(r.reservationUrl)}" target="_blank" rel="noopener">Ver detalhes na Stays ↗</a>` : ''}`;
      cont.appendChild(card);
    });
    cont.querySelectorAll('.btn-info').forEach(b => b.addEventListener('click', () => carregarPropriedade(b.dataset.cod)));
    cont.querySelectorAll('.btn-pedido').forEach(b => b.addEventListener('click', () => abrirPedido(b.dataset.tipo, b.dataset.reserva, b.dataset.titulo)));
    // abre automaticamente a 1ª propriedade ativa
    const primeira = RESERVAS.find(r => r.imovel && r.status !== 'canceled');
    if (primeira) carregarPropriedade(primeira.imovel);
  } catch (e) {
    cont.innerHTML = '<p class="erro">' + esc(e.message) + '</p>';
  }
}

async function carregarPropriedade(codigo) {
  const box = $('#prop');
  $('#prop-dica').classList.add('hidden');
  box.classList.remove('hidden');
  box.innerHTML = '<p class="vazio">Carregando informações…</p>';
  try {
    const p = await api('/propriedade/' + encodeURIComponent(codigo));
    let html = `<h3>${esc(p.titulo || codigo)}</h3>`;
    const linhas = [];
    if (p.checkinHora) linhas.push(`<li>🕒 <strong>Check-in:</strong> ${esc(p.checkinHora)}</li>`);
    if (p.checkoutHora) linhas.push(`<li>🕙 <strong>Check-out:</strong> ${esc(p.checkoutHora)}</li>`);
    if (linhas.length) html += `<ul class="prop-lista">${linhas.join('')}</ul>`;

    if (p.naJanela && (p.wifi || p.acesso)) {
      html += '<div class="prop-sensivel"><h4>🔐 Acesso (liberado para a sua estadia)</h4><ul class="prop-lista">';
      if (p.wifi && (p.wifi.rede || p.wifi.senha)) html += `<li>📶 <strong>Wi-Fi:</strong> ${esc(p.wifi.rede || '—')}${p.wifi.senha ? ' · senha <code>' + esc(p.wifi.senha) + '</code>' : ''}</li>`;
      if (p.acesso && p.acesso.portao) html += `<li>🚪 <strong>Portão:</strong> ${esc(p.acesso.portao)}</li>`;
      if (p.acesso && p.acesso.fechadura) html += `<li>🔑 <strong>Fechadura:</strong> ${esc(p.acesso.fechadura)}</li>`;
      if (p.acesso && p.acesso.instrucoes) html += `<li>ℹ️ ${esc(p.acesso.instrucoes)}</li>`;
      html += '</ul></div>';
    } else {
      html += '<p class="dica">📌 Os dados de Wi-Fi e acesso (portão/fechadura) ficam disponíveis aqui a partir de 2 dias antes do seu check-in.</p>';
    }

    const links = [];
    if (p.manualUrl) links.push(`<a class="btn secund" href="${esc(p.manualUrl)}" target="_blank" rel="noopener">📖 Manual da casa</a>`);
    if (p.guiaUrl) links.push(`<a class="btn secund" href="${esc(p.guiaUrl)}" target="_blank" rel="noopener">🗺️ Guia do hóspede</a>`);
    if (links.length) html += `<div class="prop-links">${links.join('')}</div>`;

    if (p.observacoes) html += `<p class="prop-obs">${esc(p.observacoes)}</p>`;
    if (p.contatos) html += `<p class="prop-contatos">📞 ${esc(p.contatos)}</p>`;
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = '<p class="erro">' + esc(e.message) + '</p>';
  }
}

// ---------------- serviços extras (catálogo) ----------------
let SERVICOS_CAT = [];
async function carregarServicos() {
  const cont = $('#servicos');
  try {
    const { servicos } = await api('/servicos');
    SERVICOS_CAT = servicos || [];
    cont.innerHTML = SERVICOS_CAT.map(s => `
      <div class="serv-card">
        <div class="serv-emoji">${s.emoji || '✨'}</div>
        <strong>${esc(s.nome)}</strong>
        <p class="serv-desc">${esc(s.desc || '')}</p>
        <div class="serv-preco">${esc(s.preco || 'Sob consulta')}</div>
        <button type="button" class="btn secund btn-serv" data-serv="${esc(s.id)}">Solicitar</button>
      </div>`).join('');
    cont.querySelectorAll('.btn-serv').forEach(b => b.addEventListener('click', () => abrirServico(b.dataset.serv)));
  } catch (e) { cont.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}
function abrirServico(servicoId) {
  const s = SERVICOS_CAT.find(x => x.id === servicoId) || { nome: 'Serviço', emoji: '✨', desc: '' };
  $('#mp-titulo').textContent = (s.emoji || '✨') + ' Solicitar: ' + s.nome;
  $('#mp-sub').textContent = s.desc || '';
  $('#mp-msgfeedback').className = 'erro'; $('#mp-msgfeedback').textContent = '';
  $('#mp-msg').value = '';
  const ativas = (RESERVAS || []).filter(r => r.status !== 'canceled' && r.status !== 'blocked');
  const opts = ['<option value="">— não vincular a uma reserva —</option>']
    .concat(ativas.map(r => `<option value="${esc(r.id)}">${esc(r.imovelTitulo || r.imovel || 'Reserva')} · ${fmtData(r.checkin)}</option>`)).join('');
  $('#mp-campos').innerHTML = `
    <label>Para qual reserva? <select id="mp-reserva">${opts}</select></label>
    <div class="mp-grid">
      <label>Data <input type="date" id="mp-data"></label>
      <label>Horário <input type="time" id="mp-hora"></label>
      <label>Nº de pessoas <input type="number" min="1" id="mp-pessoas"></label>
    </div>
    <label>Detalhes / preferências <textarea id="mp-obs" rows="2" placeholder="Ex.: restrições alimentares, endereço do aeroporto, lista de compras…"></textarea></label>
    <p class="dica">Vamos analisar e te enviar o orçamento por aqui. O pagamento é combinado por Pix/WhatsApp.</p>`;
  const m = $('#modal-pedido');
  m.dataset.tipo = 'servico'; m.dataset.servico = servicoId; m.dataset.reserva = '';
  m.classList.remove('hidden');
}

// ---------------- pedidos: modal (alteração / evento) ----------------
function abrirPedido(tipo, reservaId, titulo) {
  const ev = tipo === 'evento';
  $('#mp-titulo').textContent = ev ? '🎉 Solicitar autorização de evento' : '✏️ Solicitar alteração da reserva';
  $('#mp-sub').textContent = (titulo ? titulo + ' · ' : '') + 'Reserva ' + reservaId;
  $('#mp-msgfeedback').className = 'erro'; $('#mp-msgfeedback').textContent = '';
  $('#mp-msg').value = '';
  $('#mp-campos').innerHTML = ev ? `
    <label>Data do evento <input type="date" id="mp-data"></label>
    <label>Número de convidados <input type="number" min="1" id="mp-conv"></label>
    <label>Descrição do evento <textarea id="mp-desc" rows="2" placeholder="Tipo de evento, horário previsto, necessidades…"></textarea></label>
    <p class="dica">Vamos analisar e, se houver valores adicionais, te enviamos o orçamento por aqui.</p>`
  : `
    <div class="mp-grid">
      <label>Novo check-in <input type="date" id="mp-cin"></label>
      <label>Novo check-out <input type="date" id="mp-cout"></label>
      <label>Imóvel desejado <input type="text" id="mp-imovel" placeholder="Se quiser trocar de casa"></label>
      <label>Nº de hóspedes <input type="number" min="1" id="mp-hosp"></label>
    </div>
    <p class="dica">Preencha só o que deseja mudar. A alteração depende de disponibilidade e da nossa confirmação.</p>`;
  const m = $('#modal-pedido');
  m.dataset.tipo = tipo; m.dataset.reserva = reservaId;
  m.classList.remove('hidden');
}
$('#mp-cancelar').addEventListener('click', () => $('#modal-pedido').classList.add('hidden'));
$('#form-pedido').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const m = $('#modal-pedido');
  const tipo = m.dataset.tipo, reservaId = m.dataset.reserva;
  const fb = $('#mp-msgfeedback'); fb.className = 'erro'; fb.textContent = '';
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const corpo = { tipo, mensagem: $('#mp-msg').value };
  if (tipo === 'servico') {
    corpo.servicoId = m.dataset.servico; corpo.reservaId = val('mp-reserva');
    corpo.data = val('mp-data'); corpo.horario = val('mp-hora'); corpo.pessoas = val('mp-pessoas'); corpo.observacoes = val('mp-obs');
  } else if (tipo === 'evento') {
    corpo.reservaId = reservaId;
    corpo.dataEvento = val('mp-data'); corpo.convidados = val('mp-conv'); corpo.descricaoEvento = val('mp-desc');
  } else {
    corpo.reservaId = reservaId;
    corpo.novoCheckin = val('mp-cin'); corpo.novoCheckout = val('mp-cout'); corpo.novoImovel = val('mp-imovel'); corpo.novoHospedes = val('mp-hosp');
  }
  try {
    await api('/pedido', { method: 'POST', body: JSON.stringify(corpo) });
    m.classList.add('hidden');
    carregarPedidos();
  } catch (e) { fb.textContent = e.message; }
});

// ---------------- pedidos: lista "Meus pedidos" ----------------
const STATUS_PED = { novo: 'Recebido', em_analise: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado', respondido: 'Respondido' };
async function carregarPedidos() {
  const cont = $('#pedidos');
  cont.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const { pedidos } = await api('/meus-pedidos');
    if (!pedidos.length) { cont.innerHTML = '<p class="vazio">Você ainda não tem pedidos. Use os botões nas suas reservas acima para solicitar uma alteração ou um evento.</p>'; return; }
    cont.innerHTML = pedidos.map(p => {
      const det = [];
      if (p.tipo === 'evento' && p.evento) {
        if (p.evento.data) det.push('Data: ' + fmtData(p.evento.data));
        if (p.evento.convidados != null) det.push(p.evento.convidados + ' convidado(s)');
        if (p.evento.descricao) det.push(esc(p.evento.descricao));
      } else if (p.tipo === 'servico' && p.servico) {
        if (p.servico.data) det.push('Data: ' + fmtData(p.servico.data));
        if (p.servico.horario) det.push(esc(p.servico.horario));
        if (p.servico.pessoas != null) det.push(p.servico.pessoas + ' pessoa(s)');
        if (p.servico.observacoes) det.push(esc(p.servico.observacoes));
      } else if (p.alteracao) {
        if (p.alteracao.novoCheckin) det.push('Novo check-in: ' + fmtData(p.alteracao.novoCheckin));
        if (p.alteracao.novoCheckout) det.push('Novo check-out: ' + fmtData(p.alteracao.novoCheckout));
        if (p.alteracao.novoImovel) det.push('Imóvel: ' + esc(p.alteracao.novoImovel));
        if (p.alteracao.novoHospedes != null) det.push(p.alteracao.novoHospedes + ' hóspede(s)');
      }
      const titulo = p.tipo === 'evento' ? '🎉 Evento' : p.tipo === 'servico' ? '🛎️ ' + esc((p.servico && p.servico.nome) || 'Serviço') : '✏️ Alteração';
      const ctx = (p.tipo !== 'servico' && (p.imovelTitulo || p.imovel)) ? ' · ' + esc(p.imovelTitulo || p.imovel) : '';
      const orc = p.orcamento ? `<div class="ped-orc">💰 Orçamento: ${p.orcamento.valor != null ? fmtMoeda(p.orcamento.valor, 'BRL') : 'a combinar'}${p.orcamento.detalhes ? ' — ' + esc(p.orcamento.detalhes) : ''}</div>` : '';
      const resp = p.respostaAdmin ? `<div class="ped-resp">💬 ${esc(p.respostaAdmin)}</div>` : '';
      const podePagar = p.orcamento || p.status === 'aprovado';
      const waTxt = 'Ola! Quero confirmar e combinar o pagamento do meu pedido' + (p.tipo === 'servico' && p.servico ? ' de ' + p.servico.nome : p.tipo === 'evento' ? ' de evento' : '') + (p.reservaId ? ' (reserva ' + p.reservaId + ')' : '') + '.';
      const wa = podePagar ? `<a class="btn btn-wa-pag" target="_blank" rel="noopener" href="https://wa.me/556191935013?text=${encodeURIComponent(waTxt)}">💬 Confirmar e pagar pelo WhatsApp</a>` : '';
      return `<div class="ped-card">
        <div class="cr-topo"><strong>${titulo}${ctx}</strong>
          <span class="badge badge-st-${esc(p.status)}">${esc(STATUS_PED[p.status] || p.status)}</span></div>
        <div class="cr-linha">${p.reservaId ? 'Reserva ' + esc(p.reservaId) + ' · ' : ''}${fmtData(String(p.criadoEm).slice(0, 10))}</div>
        ${det.length ? `<div class="ped-det">${det.join(' · ')}</div>` : ''}
        ${p.mensagem ? `<div class="ped-msg">“${esc(p.mensagem)}”</div>` : ''}
        ${orc}${resp}${wa}
      </div>`;
    }).join('');
  } catch (e) { cont.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}

// ---------------- modal trocar senha (logado) ----------------
$('#btn-senha').addEventListener('click', () => { $('#ms-msg').textContent = ''; $('#ms-atual').value = ''; $('#ms-nova').value = ''; $('#modal-senha').classList.remove('hidden'); });
$('#ms-cancelar').addEventListener('click', () => $('#modal-senha').classList.add('hidden'));
$('#form-senha-modal').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('#ms-msg').textContent = '';
  try {
    await api('/senha', { method: 'POST', body: JSON.stringify({ atual: $('#ms-atual').value, nova: $('#ms-nova').value }) });
    $('#ms-msg').className = 'ok-msg'; $('#ms-msg').textContent = 'Senha alterada com sucesso.';
    setTimeout(() => $('#modal-senha').classList.add('hidden'), 1200);
  } catch (e) { $('#ms-msg').className = 'erro'; $('#ms-msg').textContent = e.message; }
});

boot();
