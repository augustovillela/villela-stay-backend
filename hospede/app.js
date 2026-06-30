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
      card.innerHTML = `
        <div class="cr-topo">
          <strong>${esc(r.imovelTitulo || r.imovel || 'Hospedagem')}</strong>
          <span class="badge badge-${esc(r.status)}">${esc(r.statusRotulo || r.status)}</span>
        </div>
        <div class="cr-datas">📅 ${fmtData(r.checkin)} → ${fmtData(r.checkout)}</div>
        <div class="cr-linha">👥 ${r.hospedes || '—'} hóspede(s) · 🏷️ ${esc(r.id || '')}</div>
        <div class="cr-valor">${fmtMoeda(r.valor, r.moeda)}</div>
        ${r.imovel && !cancel ? `<button type="button" class="btn secund btn-info" data-cod="${esc(r.imovel)}">Informações da casa</button>` : ''}
        ${r.reservationUrl ? `<a class="cr-link" href="${esc(r.reservationUrl)}" target="_blank" rel="noopener">Ver detalhes na Stays ↗</a>` : ''}`;
      cont.appendChild(card);
    });
    cont.querySelectorAll('.btn-info').forEach(b => b.addEventListener('click', () => carregarPropriedade(b.dataset.cod)));
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
