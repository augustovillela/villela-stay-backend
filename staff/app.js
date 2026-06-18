'use strict';
// Portal Staff — Villela Stay. SPA sem dependências; conversa com /staff/api/*.

const $ = (sel) => document.querySelector(sel);
const ESTADO = { me: null, areas: [], catalogo: [], painelDisp: {}, podeEstat: false, secao: 'visao' };

// --------- helpers ---------
async function api(metodo, caminho, corpo) {
  const opt = { method: metodo, credentials: 'same-origin', headers: {} };
  if (corpo !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(corpo); }
  const r = await fetch('/staff/api' + caminho, opt);
  let dados = null; try { dados = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error((dados && dados.erro) || ('Erro ' + r.status)), { status: r.status, dados });
  return dados;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Remove marcação markdown para exibir resumos curtos como texto limpo (sem **, >, `, links).
const limparMd = (s) => String(s == null ? '' : s)
  .replace(/^\s*>\s?/, '')
  .replace(/\*\*([^*]+?)\*\*/g, '$1')
  .replace(/\*([^*]+?)\*/g, '$1')
  .replace(/`([^`]+?)`/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/^#+\s*/, '')
  .trim();
const nomeArea = (id) => { const a = ESTADO.catalogo.find(x => x.id === id); return a ? a.nome : id; };
// minúsculas + sem acento, para busca tolerante (ex.: "metricas" acha "Métricas")
const normaliza = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dataBr = (iso) => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

// markdown simples → html (títulos, negrito, itálico, código, listas, tabelas, citações, links).
// Junta linhas "quebradas" do mesmo parágrafo antes de aplicar negrito/itálico — assim **negrito
// que atravessa quebra de linha** funciona (era o que deixava ** literais aparecendo).
function mdParaHtml(md) {
  const linhas = String(md).replace(/\r/g, '').split('\n');
  const inline = (s) => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const branco = (l) => /^\s*$/.test(l);
  const head = (l) => /^#{1,6}\s/.test(l);
  const tab = (l) => /^\s*\|.*\|\s*$/.test(l);
  const lista = (l) => /^\s*[-*]\s+/.test(l);
  const quote = (l) => /^\s*>\s?/.test(l);
  const novoBloco = (l) => branco(l) || head(l) || tab(l) || lista(l) || quote(l);
  let out = '', i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (branco(l)) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { const n = Math.min(m[1].length, 3); out += `<h${n}>${inline(m[2])}</h${n}>`; i++; continue; }
    if (tab(l) && i + 1 < linhas.length && /^\s*\|[-:\s|]+\|\s*$/.test(linhas[i + 1])) {
      const cels = (linha) => linha.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const cab = cels(l); i += 2; let corpo = '';
      while (i < linhas.length && tab(linhas[i])) { corpo += '<tr>' + cels(linhas[i]).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'; i++; }
      out += `<table><thead><tr>${cab.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table>`;
      continue;
    }
    if (quote(l)) { const buf = []; while (i < linhas.length && quote(linhas[i])) { buf.push(linhas[i].replace(/^\s*>\s?/, '')); i++; } out += `<blockquote>${inline(buf.join(' '))}</blockquote>`; continue; }
    if (lista(l)) {
      const it = [];
      while (i < linhas.length && !branco(linhas[i]) && !head(linhas[i]) && !tab(linhas[i]) && !quote(linhas[i])) {
        if (lista(linhas[i])) it.push(linhas[i].replace(/^\s*[-*]\s+/, ''));
        else if (it.length) it[it.length - 1] += ' ' + linhas[i].trim();
        else it.push(linhas[i].trim());
        i++;
      }
      out += `<ul>${it.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`;
      continue;
    }
    const buf = []; while (i < linhas.length && !novoBloco(linhas[i])) { buf.push(linhas[i]); i++; }
    out += `<p>${inline(buf.join(' '))}</p>`;
  }
  return out;
}

// --------- bootstrap ---------
async function init() {
  try {
    const r = await api('GET', '/me');
    aposLogin(r);
  } catch (e) { mostrarLogin(); }
}

function mostrarLogin() {
  $('#app').classList.add('hidden');
  $('#tela-trocar').classList.add('hidden');
  $('#tela-login').classList.remove('hidden');
  // Login por formulario nativo: falha volta com ?login_erro na URL. Mostra o aviso e limpa a URL.
  try {
    const p = new URLSearchParams(location.search);
    const cod = p.get('login_erro');
    if (cod) {
      const erro = $('#login-erro');
      if (erro) erro.textContent = cod === '2'
        ? 'Muitas tentativas. Tente de novo em 15 minutos.'
        : 'E-mail ou senha incorretos.';
      p.delete('login_erro');
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
  } catch (_) {}
}

function aposLogin(r) {
  ESTADO.me = r.usuario; ESTADO.areas = r.areas; ESTADO.catalogo = r.catalogoAreas;
  $('#tela-login').classList.add('hidden');
  if (ESTADO.me.precisaTrocarSenha) { $('#tela-trocar').classList.remove('hidden'); $('#app').classList.add('hidden'); return; }
  abrirApp();
}

async function abrirApp() {
  $('#tela-login').classList.add('hidden');
  $('#tela-trocar').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#quem').textContent = ESTADO.me.nome + (ESTADO.me.papel === 'admin' ? ' (admin)' : '');
  // visão geral traz quais painéis o usuário pode ver
  try { const vg = await api('GET', '/visao-geral'); ESTADO.painelDisp = vg.painelDisponivel || {}; } catch {}
  ESTADO.podeEstat = ['marketing', 'ti', 'ceo'].some(a => ESTADO.areas.includes(a));
  montarMenu();
  navegar('visao');
}

// --------- menu ---------
function montarMenu() {
  const m = $('#menu'); m.innerHTML = '';
  const itens = [
    { grupo: 'Principal' },
    { id: 'visao', rot: 'Visão geral' },
    { id: 'relatorios', rot: 'Relatórios & Entregas' },
    { id: 'publicar', rot: '+ Publicar entrega' },
  ];
  const op = [];
  if (ESTADO.areas.includes('vendas')) op.push({ id: 'crm', rot: 'CRM / Funil' });
  if (ESTADO.painelDisp.leads) op.push({ id: 'leads', rot: 'Leads' });
  if (ESTADO.painelDisp.precheckins) op.push({ id: 'precheckins', rot: 'Pré-check-ins' });
  if (ESTADO.painelDisp.chamados) op.push({ id: 'chamados', rot: 'Chamados' });
  if (ESTADO.painelDisp.eventos) op.push({ id: 'eventos', rot: 'Eventos (Stays)' });
  if (ESTADO.podeEstat) op.push({ id: 'estatisticas', rot: 'Visitas do site' });
  if (op.length) { itens.push({ grupo: 'Operação' }); itens.push(...op); }
  // Listas e agenda: disponíveis para TODOS os usuários logados
  itens.push({ grupo: 'Listas & Agenda' });
  itens.push({ id: 'compras', rot: '🛒 Lista de compras' });
  itens.push({ id: 'manutencao', rot: '🔧 Lista de manutenção' });
  itens.push({ id: 'agenda', rot: '📅 Agenda (eventos)' });
  itens.push({ grupo: 'Stays' });
  itens.push({ rot: 'Site público ↗', url: 'https://ville.stays.com.br/' });
  itens.push({ rot: 'Painel administrativo ↗', url: 'https://ville.stays.com.br/i/home' });
  itens.push({ grupo: 'Conta' });
  if (ESTADO.me.papel === 'admin') itens.push({ id: 'usuarios', rot: 'Usuários' });
  itens.push({ id: 'conta', rot: 'Minha conta' });

  for (const it of itens) {
    if (it.grupo) { const g = document.createElement('div'); g.className = 'grupo'; g.textContent = it.grupo; m.appendChild(g); continue; }
    if (it.url) {
      const a = document.createElement('a'); a.textContent = it.rot; a.href = it.url;
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'link-externo';
      m.appendChild(a); continue;
    }
    const b = document.createElement('button'); b.textContent = it.rot; b.dataset.id = it.id;
    b.onclick = () => navegar(it.id);
    m.appendChild(b);
  }
}

function navegar(secao) {
  ESTADO.secao = secao;
  document.querySelectorAll('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.id === secao));
  const rotas = { visao: renderVisao, relatorios: renderRelatorios, publicar: renderPublicar, crm: renderCRM, compras: () => renderLista('compras', 'Lista de compras'), manutencao: () => renderLista('manutencao', 'Lista de manutenção'), agenda: renderAgenda, leads: () => renderPainel('leads', 'Leads'), precheckins: () => renderPainel('precheckins', 'Pré-check-ins'), chamados: () => renderPainel('chamados', 'Chamados'), eventos: () => renderPainel('eventos', 'Eventos (Stays)'), estatisticas: renderEstatisticas, usuarios: renderUsuarios, conta: renderConta };
  (rotas[secao] || renderVisao)();
}

const conteudo = () => $('#conteudo');
function cabecalho(titulo, sub) { return `<h1 class="titulo">${esc(titulo)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}`; }

// --------- Listas (Compras / Manutenção) ---------
async function renderLista(tipo, titulo) {
  const c = conteudo();
  c.innerHTML = cabecalho(titulo, 'Qualquer pessoa da equipe pode incluir e dar baixa. Itens entram aqui e também pelo WhatsApp.');
  c.innerHTML += `
    <form id="form-item" class="barra" style="flex-wrap:wrap">
      <input id="it-qtd" placeholder="Qtd (ex.: 2)" style="width:120px" aria-label="Quantidade">
      <input id="it-nome" placeholder="Produto ou serviço *" style="flex:2;min-width:220px" required aria-label="Nome">
      <input id="it-obs" placeholder="Observação (opcional)" style="flex:1;min-width:160px" aria-label="Observação">
      <button class="btn" type="submit">+ Adicionar</button>
    </form>
    <div id="lista-itens" class="lista-itens"><p class="vazio">Carregando…</p></div>`;
  const f = $('#form-item');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const nome = $('#it-nome').value.trim(); if (!nome) return;
    try {
      await api('POST', '/listas/' + tipo, { quantidade: $('#it-qtd').value, nome, obs: $('#it-obs').value });
      f.reset(); $('#it-nome').focus(); carregarItens(tipo);
    } catch (e) { alert(e.message); }
  };
  carregarItens(tipo);
}
async function carregarItens(tipo) {
  const alvo = $('#lista-itens'); if (!alvo) return;
  try {
    const { itens } = await api('GET', '/listas/' + tipo);
    if (!itens.length) { alvo.innerHTML = `<p class="vazio">Lista vazia. Adicione o primeiro item acima.</p>`; return; }
    alvo.innerHTML = `<div class="lista-cab"><span>${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</span><button class="btn peq perigo" id="limpar-lista">Limpar tudo</button></div>` +
      itens.map(i => `
      <div class="linha-item">
        <span class="qtd">${esc(i.quantidade || '—')}</span>
        <span class="nome">${esc(i.nome)}${i.obs ? ` <span class="obs">— ${esc(i.obs)}</span>` : ''}</span>
        <span class="quem">${i.origem === 'whatsapp' ? '📱' : '💻'} ${esc(i.quem || '')} · ${dataBr(i.criadoEm)}</span>
        <button class="btn peq" data-baixa="${i.id}" title="Dar baixa / remover">✓</button>
      </div>`).join('');
    alvo.querySelectorAll('[data-baixa]').forEach(b => b.onclick = async () => {
      try { await api('DELETE', '/listas/' + tipo + '/' + b.dataset.baixa); carregarItens(tipo); } catch (e) { alert(e.message); }
    });
    const lb = $('#limpar-lista');
    if (lb) lb.onclick = async () => { if (confirm('Limpar a lista inteira?')) { try { await api('POST', '/listas/' + tipo + '/limpar'); carregarItens(tipo); } catch (e) { alert(e.message); } } };
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Agenda (pedidos de evento → Claude executa) ---------
async function renderAgenda() {
  const c = conteudo();
  c.innerHTML = cabecalho('Agenda — eventos', 'Crie ou peça exclusão de eventos no Google Calendar. A rotina do Claude efetiva no próximo ciclo e marca como feito.');
  c.innerHTML += `
    <form id="form-ev" class="form" style="max-width:580px">
      <label>Ação
        <select id="ev-acao"><option value="criar">➕ Criar evento</option><option value="excluir">🗑️ Excluir evento</option></select>
      </label>
      <label>Título do evento *<input id="ev-titulo" required></label>
      <div class="barra" style="gap:10px;flex-wrap:wrap">
        <label style="flex:1;min-width:150px">Data<input id="ev-data" type="date"></label>
        <label style="width:120px">Hora<input id="ev-hora" type="time"></label>
        <label style="width:130px">Duração (min)<input id="ev-dur" type="number" value="60" min="15" step="15"></label>
      </div>
      <label>Local (opcional)<input id="ev-local"></label>
      <label>Descrição (opcional)<textarea id="ev-desc" rows="2"></textarea></label>
      <button class="btn" type="submit">Enviar pedido</button>
    </form>
    <h2 class="titulo" style="font-size:1.1rem;margin-top:22px">Pedidos e eventos</h2>
    <p class="sub" style="margin-top:-6px">Para <b>excluir um evento já criado</b>, use o botão <b>🗑️ Excluir</b> na linha dele. Para <b>cancelar um pedido</b> que ainda não rodou, use <b>✕ Cancelar</b>.</p>
    <div id="ev-lista" class="lista-itens"><p class="vazio">Carregando…</p></div>`;
  $('#form-ev').onsubmit = async (ev) => {
    ev.preventDefault();
    const titulo = $('#ev-titulo').value.trim(); if (!titulo) return;
    try {
      await api('POST', '/agenda/pedidos', { acao: $('#ev-acao').value, titulo, data: $('#ev-data').value, hora: $('#ev-hora').value, duracaoMin: $('#ev-dur').value, local: $('#ev-local').value, descricao: $('#ev-desc').value });
      $('#form-ev').reset(); $('#ev-dur').value = 60; carregarPedidos();
    } catch (e) { alert(e.message); }
  };
  carregarPedidos();
}
async function carregarPedidos() {
  const alvo = $('#ev-lista'); if (!alvo) return;
  try {
    const { pedidos } = await api('GET', '/agenda/pedidos');
    if (!pedidos.length) { alvo.innerHTML = `<p class="vazio">Nenhum pedido ainda.</p>`; return; }
    // eventos que já têm uma exclusão pedida (não oferecer o botão de excluir de novo)
    const jaExcluir = new Set(pedidos.filter(p => p.acao === 'excluir' && p.eventoId).map(p => p.eventoId));
    alvo.innerHTML = pedidos.slice().reverse().map(p => {
      let acao = '<span></span>';
      if (p.status === 'pendente') {
        acao = `<button class="btn peq" data-cancelar="${p.id}" title="Cancelar este pedido (ainda não executado)">✕ Cancelar</button>`;
      } else if (p.acao === 'criar' && p.status === 'feito' && p.eventoId && !jaExcluir.has(p.eventoId)) {
        const dados = esc(JSON.stringify({ id: p.id, eventoId: p.eventoId, titulo: p.titulo, data: p.data, hora: p.hora }));
        acao = `<button class="btn peq perigo" data-excluir-ev="${dados}" title="Excluir este evento do Google Calendar">🗑️ Excluir</button>`;
      }
      return `<div class="linha-item">
        <span class="qtd">${p.acao === 'excluir' ? '🗑️' : '➕'}</span>
        <span class="nome">${esc(p.titulo)}${p.data ? ` <span class="obs">— ${esc(p.data)}${p.hora ? ' ' + esc(p.hora) : ''}</span>` : ''}</span>
        <span class="quem"><span class="badge st-${esc(p.status)}">${esc(p.status)}</span> ${esc(p.quem || '')} · ${dataBr(p.criadoEm)}${p.resultado ? ' · ' + esc(p.resultado) : ''}</span>
        ${acao}
      </div>`;
    }).join('');
    alvo.querySelectorAll('[data-cancelar]').forEach(b => b.onclick = async () => {
      try { await api('DELETE', '/agenda/pedidos/' + b.dataset.cancelar); carregarPedidos(); } catch (e) { alert(e.message); }
    });
    alvo.querySelectorAll('[data-excluir-ev]').forEach(b => b.onclick = async () => {
      const ev = JSON.parse(b.dataset.excluirEv);
      if (!confirm('Pedir a exclusão do evento "' + ev.titulo + '" do Google Calendar?')) return;
      try {
        await api('POST', '/agenda/pedidos', { acao: 'excluir', titulo: ev.titulo, data: ev.data, hora: ev.hora, eventoId: ev.eventoId, refPedidoId: ev.id });
        carregarPedidos();
      } catch (e) { alert(e.message); }
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Visão geral ---------
async function renderVisao() {
  conteudo().innerHTML = cabecalho('Visão geral', 'Resumo do que os agentes vêm produzindo.');
  // Busca rápida: leva para Relatórios & Entregas já filtrado pelo termo digitado.
  conteudo().innerHTML += `<form id="busca-home" class="barra">
    <input id="busca-home-input" type="search" placeholder="🔎 Buscar em todos os relatórios e entregas…" style="flex:1;min-width:220px">
    <button class="btn" type="submit">Buscar</button>
  </form>`;
  $('#busca-home').onsubmit = (ev) => { ev.preventDefault(); ESTADO.buscaPrefill = $('#busca-home-input').value; navegar('relatorios'); };
  try {
    const vg = await api('GET', '/visao-geral');
    const cards = `<div class="cards">
      <div class="card"><div class="n">${vg.totalRelatorios}</div><div class="rot">Relatórios e entregas</div></div>
      ${Object.entries(vg.porArea).map(([a, n]) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(nomeArea(a))}</div></div>`).join('')}
    </div>`;
    const ult = vg.ultimos.length
      ? `<div class="lista">${vg.ultimos.map(itemRelatorioHtml).join('')}</div>`
      : `<div class="vazio">Ainda não há entregas publicadas. Use “+ Publicar entrega” ou os agentes publicam pela ferramenta local.</div>`;
    conteudo().innerHTML += cards + `<h2 class="titulo" style="font-size:1.15rem">Últimas entregas</h2>` + ult;
    ligarAcoesRelatorio();
  } catch (e) { conteudo().innerHTML += `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Relatórios ---------
function itemRelatorioHtml(r) {
  const tipo = r.tipo === 'produto' ? 'Produto' : r.tipo === 'servico' ? 'Serviço' : 'Relatório';
  return `<div class="item">
    <h3>${esc(r.titulo)}</h3>
    <div class="meta">
      <span class="chip">${esc(nomeArea(r.area))}</span>
      <span class="chip tipo-${esc(r.tipo)}">${tipo}</span>
      ${r.periodo ? `<span class="chip">${esc(r.periodo)}</span>` : ''}
      <span>por ${esc(r.autor || '—')} · ${dataBr(r.publicadoEm)}</span>
    </div>
    ${r.resumo ? `<p style="margin:8px 0 0;font-size:.92rem">${esc(limparMd(r.resumo))}</p>` : ''}
    <div class="acoes">
      <button class="btn peq" data-abrir="${r.id}" data-fmt="${esc(r.formato)}">Abrir</button>
      <button class="btn peq perigo" data-excluir="${r.id}">Excluir</button>
    </div>
  </div>`;
}
async function renderRelatorios() {
  conteudo().innerHTML = cabecalho('Relatórios & Entregas', 'Tudo o que os agentes produziram, por área. Use a busca para encontrar rápido.');
  const opcoes = ESTADO.areas.map(a => `<option value="${a}">${esc(nomeArea(a))}</option>`).join('');
  conteudo().innerHTML += `<div class="barra">
    <input id="busca" type="search" placeholder="🔎 Buscar por título, resumo, autor, período…" style="flex:1;min-width:220px" autofocus>
    <label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Área
      <select id="filtro-area"><option value="">Todas</option>${opcoes}</select></label>
    <select id="filtro-tipo"><option value="">Todos os tipos</option><option value="relatorio">Relatórios</option><option value="produto">Produtos</option><option value="servico">Serviços</option></select>
  </div><div id="lista-rel"></div>`;
  // termo vindo da busca da Visão geral
  if (ESTADO.buscaPrefill) { $('#busca').value = ESTADO.buscaPrefill; ESTADO.buscaPrefill = ''; }
  let cache = [];
  const aplicar = () => {
    const q = normaliza($('#busca').value).trim();
    const tipo = $('#filtro-tipo').value;
    const termos = q ? q.split(/\s+/) : [];
    const filtrados = cache.filter(r => {
      if (tipo && r.tipo !== tipo) return false;
      if (!termos.length) return true;
      const alvo = normaliza([r.titulo, r.resumo, r.autor, nomeArea(r.area), r.periodo].join(' '));
      return termos.every(t => alvo.includes(t));
    });
    $('#lista-rel').innerHTML = filtrados.length
      ? `<p class="sub" style="margin:0 0 10px">${filtrados.length} resultado(s)${q ? ' para “' + esc($('#busca').value) + '”' : ''}</p><div class="lista">${filtrados.map(itemRelatorioHtml).join('')}</div>`
      : `<div class="vazio">Nada encontrado${q ? ' para “' + esc($('#busca').value) + '”' : ''}. Tente outra palavra ou troque a área.</div>`;
    ligarAcoesRelatorio();
  };
  const carregar = async () => {
    const area = $('#filtro-area').value;
    const r = await api('GET', '/relatorios' + (area ? '?area=' + encodeURIComponent(area) : ''));
    cache = r.relatorios;
    aplicar();
  };
  $('#filtro-area').onchange = carregar;
  $('#filtro-tipo').onchange = aplicar;
  $('#busca').oninput = aplicar;
  carregar();
}
function ligarAcoesRelatorio() {
  document.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => abrirRelatorio(b.dataset.abrir, b.dataset.fmt));
  document.querySelectorAll('[data-excluir]').forEach(b => b.onclick = async () => {
    if (!confirm('Excluir esta entrega?')) return;
    try { await api('DELETE', '/relatorios/' + b.dataset.excluir); navegar(ESTADO.secao); } catch (e) { alert(e.message); }
  });
}
async function abrirRelatorio(id, fmt) {
  if (fmt === 'arquivo') { window.open('/staff/api/relatorios/' + id + '/arquivo', '_blank'); return; }
  try {
    const { relatorio: r } = await api('GET', '/relatorios/' + id);
    let corpo = '';
    if (r.formato === 'url') corpo = `<p><a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir link externo →</a></p>`;
    else corpo = mdParaHtml(r.texto || '');
    conteudo().innerHTML = `<button class="btn secund peq" id="voltar">← Voltar</button>
      ${cabecalho(r.titulo, nomeArea(r.area) + ' · ' + dataBr(r.publicadoEm) + (r.periodo ? ' · ' + r.periodo : ''))}
      <div class="doc">${corpo}</div>`;
    $('#voltar').onclick = () => navegar('relatorios');
  } catch (e) { alert(e.message); }
}

// --------- Publicar entrega ---------
function renderPublicar() {
  const opcoes = ESTADO.areas.map(a => `<option value="${a}">${esc(nomeArea(a))}</option>`).join('');
  conteudo().innerHTML = cabecalho('Publicar entrega', 'Adicione um relatório, produto ou serviço ao portal.') + `
  <form class="form" id="form-pub">
    <label>Área / agente <select id="p-area" required>${opcoes}</select></label>
    <label>Tipo <select id="p-tipo"><option value="relatorio">Relatório</option><option value="produto">Produto</option><option value="servico">Serviço</option></select></label>
    <label>Título <input id="p-titulo" required maxlength="160"></label>
    <label>Período (opcional) <input id="p-periodo" placeholder="ex.: maio/2026" maxlength="50"></label>
    <label>Resumo (opcional) <textarea id="p-resumo" rows="2" maxlength="1000"></textarea></label>
    <label>Conteúdo em texto (Markdown) <textarea id="p-texto" rows="8" placeholder="# Título&#10;Use **negrito**, listas, tabelas…"></textarea></label>
    <label>…ou link externo (opcional) <input id="p-url" placeholder="https://…"></label>
    <label>…ou anexar arquivo (PDF, etc.) <input id="p-arq" type="file"></label>
    <button class="btn" type="submit">Publicar</button>
    <p id="p-msg" class="erro"></p>
  </form>`;
  $('#form-pub').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#p-msg'); msg.textContent = ''; msg.className = 'erro';
    const corpo = { area: $('#p-area').value, tipo: $('#p-tipo').value, titulo: $('#p-titulo').value.trim(), periodo: $('#p-periodo').value.trim(), resumo: $('#p-resumo').value.trim() };
    const arq = $('#p-arq').files[0];
    try {
      if (arq) {
        if (arq.size > 12 * 1024 * 1024) throw new Error('Arquivo acima de 12 MB.');
        corpo.nomeArquivo = arq.name;
        corpo.arquivoBase64 = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(arq); });
      } else if ($('#p-url').value.trim()) { corpo.url = $('#p-url').value.trim(); }
      else { corpo.texto = $('#p-texto').value; if (!corpo.texto.trim()) throw new Error('Informe texto, link ou arquivo.'); }
      if (!corpo.titulo) throw new Error('Título é obrigatório.');
      await api('POST', '/relatorios', corpo);
      msg.className = 'ok-msg'; msg.textContent = 'Publicado! Veja em Relatórios & Entregas.';
      $('#form-pub').reset();
    } catch (e) { msg.textContent = e.message; }
  };
}

// --------- Painéis operacionais ---------
async function renderPainel(painel, titulo) {
  conteudo().innerHTML = cabecalho(titulo, 'Dados coletados pelo site/backend (mais recentes primeiro).');
  try {
    const { itens } = await api('GET', '/dados/' + painel);
    if (!itens.length) { conteudo().innerHTML += `<div class="vazio">Nada registrado ainda.</div>`; return; }
    if (painel === 'eventos') {
      conteudo().innerHTML += `<div class="lista">${itens.map(e => `<div class="item"><div class="meta"><span class="chip">${esc((e.evento && (e.evento.action || e.evento.type)) || 'evento')}</span><span>${dataBr(e._recebido)}</span></div><pre style="white-space:pre-wrap;font-size:.8rem;margin:8px 0 0">${esc(JSON.stringify(e.evento || e, null, 2)).slice(0, 1200)}</pre></div>`).join('')}</div>`;
      return;
    }
    const cols = Array.from(itens.reduce((s, it) => { Object.keys(it).forEach(k => { if (k !== '_recebido') s.add(k); }); return s; }, new Set())).slice(0, 7);
    conteudo().innerHTML += `<table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Recebido</th></tr></thead><tbody>${itens.map(it => `<tr>${cols.map(c => `<td>${esc(String(it[c] == null ? '' : it[c])).slice(0, 200)}</td>`).join('')}<td>${dataBr(it._recebido)}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { conteudo().innerHTML += `<p class="erro">${esc(e.message)}</p>`; }
}

async function renderEstatisticas() {
  conteudo().innerHTML = cabecalho('Visitas do site', 'Acessos às páginas públicas (analytics próprio, sem cookies).');
  try {
    const s = await api('GET', '/estatisticas-portal');
    const topo = Object.entries(s.porPagina).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const dias = Object.entries(s.porDia).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
    conteudo().innerHTML += `<div class="cards"><div class="card"><div class="n">${s.totalVisitas}</div><div class="rot">Visitas totais</div></div></div>
      <h2 class="titulo" style="font-size:1.1rem">Páginas mais vistas</h2>
      <table><thead><tr><th>Página</th><th>Visitas</th></tr></thead><tbody>${topo.map(([p, n]) => `<tr><td>${esc(p)}</td><td>${n}</td></tr>`).join('')}</tbody></table>
      <h2 class="titulo" style="font-size:1.1rem;margin-top:22px">Últimos dias</h2>
      <table><thead><tr><th>Dia</th><th>Visitas</th></tr></thead><tbody>${dias.map(([d, n]) => `<tr><td>${esc(d)}</td><td>${n}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { conteudo().innerHTML += `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Usuários (admin) ---------
async function renderUsuarios() {
  conteudo().innerHTML = cabecalho('Usuários', 'Crie acessos e defina quais áreas cada um enxerga.') +
    `<div class="barra"><button class="btn" id="novo-user">+ Novo usuário</button></div><div id="lista-users"></div>`;
  $('#novo-user').onclick = () => formUsuario(null);
  try {
    const { usuarios } = await api('GET', '/usuarios');
    $('#lista-users').innerHTML = `<table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Áreas</th><th>Status</th><th></th></tr></thead><tbody>${usuarios.map(u => `
      <tr>
        <td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
        <td>${u.papel === 'admin' ? 'Admin' : 'Staff'}</td>
        <td>${u.papel === 'admin' ? 'Todas' : (u.areas.map(nomeArea).join(', ') || '—')}</td>
        <td>${u.ativo ? 'Ativo' : 'Inativo'}${u.precisaTrocarSenha ? ' · trocar senha' : ''}</td>
        <td><button class="btn peq secund" data-edit="${u.id}">Editar</button></td>
      </tr>`).join('')}</tbody></table>`;
    const mapa = Object.fromEntries(usuarios.map(u => [u.id, u]));
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formUsuario(mapa[b.dataset.edit]));
  } catch (e) { $('#lista-users').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

function formUsuario(u) {
  const ed = !!u;
  const checks = ESTADO.catalogo.map(a => `<label><input type="checkbox" value="${a.id}" ${u && u.areas.includes(a.id) ? 'checked' : ''}> ${esc(a.nome)}</label>`).join('');
  conteudo().innerHTML = cabecalho(ed ? 'Editar usuário' : 'Novo usuário', '') + `
  <form class="form" id="form-user">
    <label>Nome <input id="u-nome" value="${ed ? esc(u.nome) : ''}" required></label>
    <label>E-mail <input id="u-email" type="email" value="${ed ? esc(u.email) : ''}" ${ed ? 'disabled' : 'required'}></label>
    <label>Papel <select id="u-papel">
      <option value="staff" ${ed && u.papel === 'staff' ? 'selected' : ''}>Staff (acesso limitado)</option>
      <option value="admin" ${ed && u.papel === 'admin' ? 'selected' : ''}>Admin (acesso total)</option>
    </select></label>
    <div id="bloco-areas"><label>Áreas liberadas</label><div class="areas-grid">${checks}</div></div>
    <label>${ed ? 'Definir nova senha (opcional)' : 'Senha inicial (mín. 8)'} <input id="u-senha" type="password" ${ed ? '' : 'required minlength=8'} autocomplete="new-password"></label>
    ${ed ? `<label><input type="checkbox" id="u-ativo" ${u.ativo ? 'checked' : ''}> Usuário ativo</label>` : ''}
    <div class="acoes">
      <button class="btn" type="submit">${ed ? 'Salvar' : 'Criar usuário'}</button>
      ${ed && u.id !== ESTADO.me.id ? `<button class="btn perigo" type="button" id="u-del">Remover</button>` : ''}
      <button class="btn secund" type="button" id="u-cancel">Cancelar</button>
    </div>
    <p id="u-msg" class="erro"></p>
  </form>`;
  const togglAreas = () => { $('#bloco-areas').style.display = $('#u-papel').value === 'admin' ? 'none' : ''; };
  $('#u-papel').onchange = togglAreas; togglAreas();
  $('#u-cancel').onclick = () => navegar('usuarios');
  if ($('#u-del')) $('#u-del').onclick = async () => { if (!confirm('Remover este usuário?')) return; try { await api('DELETE', '/usuarios/' + u.id); navegar('usuarios'); } catch (e) { $('#u-msg').textContent = e.message; } };
  $('#form-user').onsubmit = async (ev) => {
    ev.preventDefault();
    const areas = Array.from(document.querySelectorAll('#bloco-areas input:checked')).map(c => c.value);
    const msg = $('#u-msg'); msg.textContent = '';
    try {
      if (!ed) {
        await api('POST', '/usuarios', { nome: $('#u-nome').value, email: $('#u-email').value, papel: $('#u-papel').value, areas, senha: $('#u-senha').value });
      } else {
        const corpo = { nome: $('#u-nome').value, papel: $('#u-papel').value, areas, ativo: $('#u-ativo').checked };
        if ($('#u-senha').value) corpo.novaSenha = $('#u-senha').value;
        await api('PATCH', '/usuarios/' + u.id, corpo);
      }
      navegar('usuarios');
    } catch (e) { msg.textContent = e.message; }
  };
}

// --------- Minha conta ---------
function renderConta() {
  conteudo().innerHTML = cabecalho('Minha conta', ESTADO.me.nome + ' · ' + ESTADO.me.email) + `
  <form class="form" id="form-conta">
    <label>Senha atual <input id="c-atual" type="password" required autocomplete="current-password"></label>
    <label>Nova senha (mín. 8) <input id="c-nova" type="password" required minlength="8" autocomplete="new-password"></label>
    <label>Confirme <input id="c-conf" type="password" required minlength="8" autocomplete="new-password"></label>
    <button class="btn" type="submit">Trocar senha</button>
    <p id="c-msg" class="erro"></p>
  </form>`;
  $('#form-conta').onsubmit = async (ev) => {
    ev.preventDefault(); const msg = $('#c-msg'); msg.textContent = ''; msg.className = 'erro';
    if ($('#c-nova').value !== $('#c-conf').value) { msg.textContent = 'As senhas não conferem.'; return; }
    try { await api('POST', '/conta/senha', { atual: $('#c-atual').value, nova: $('#c-nova').value }); msg.className = 'ok-msg'; msg.textContent = 'Senha alterada.'; $('#form-conta').reset(); }
    catch (e) { msg.textContent = e.message; }
  };
}

// --------- CRM / Funil (Fase 1) ---------
const CRM = {
  estagios: [
    { id: 'novo', rot: 'Novo' }, { id: 'contato', rot: 'Contato' }, { id: 'orcamento', rot: 'Orçamento' },
    { id: 'negociacao', rot: 'Negociação' }, { id: 'reserva', rot: 'Reserva' }, { id: 'hospedado', rot: 'Hospedado' },
    { id: 'posvenda', rot: 'Pós-venda' }, { id: 'perdido', rot: 'Perdido' },
  ],
  origens: ['site', 'whatsapp-business', 'whatsapp-pessoal', 'airbnb', 'booking', 'decolar', 'instagram', 'indicacao', 'manual'],
  cache: [],
};
const moedaBr = (v) => (v == null || v === '') ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const crmDataCurta = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
function crmPrazoClasse(data) {
  if (!data) return '';
  const hoje = new Date().toISOString().slice(0, 10);
  return data < hoje ? 'atrasado' : (data === hoje ? 'hoje' : 'futuro');
}

async function renderCRM() {
  conteudo().innerHTML = cabecalho('CRM / Funil', 'Do primeiro contato ao pós-venda. Arraste os cartões para mudar de etapa.')
    + `<div class="barra">
        <button class="btn" id="crm-novo">+ Novo contato</button>
        <button class="btn secund" id="crm-metricas">📊 Métricas</button>
        <input id="crm-busca" placeholder="Buscar nome, telefone ou e-mail…" style="flex:1;min-width:200px">
       </div>
       <div id="crm-followups"></div>
       <div id="crm-board" class="kanban"><div class="vazio">Carregando…</div></div>`;
  $('#crm-novo').onclick = () => crmFormContato();
  $('#crm-metricas').onclick = () => renderCRMMetricas();
  let t; $('#crm-busca').oninput = () => { clearTimeout(t); t = setTimeout(crmCarregar, 250); };
  crmCarregar();
}

async function renderCRMMetricas() {
  conteudo().innerHTML = `<button class="btn secund peq" id="m-voltar">← Voltar ao funil</button>`
    + cabecalho('CRM — Métricas', 'Visão do funil de vendas.')
    + `<div id="m-corpo"><div class="vazio">Carregando…</div></div>`;
  $('#m-voltar').onclick = () => navegar('crm');
  try {
    const m = await api('GET', '/crm/metricas');
    const card = (n, rot) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(rot)}</div></div>`;
    const cards = `<div class="cards">
      ${card(m.total, 'Contatos no total')}
      ${card(m.emNegociacao, 'Em negociação')}
      ${card(m.ganhos, 'Ganhos (reserva+)')}
      ${card(m.perdidos, 'Perdidos')}
      ${card(m.taxaConversao + '%', 'Conversão (ganhos / total)')}
      ${card(m.taxaFechamento + '%', 'Fechamento (ganhos / decididos)')}
      ${card(esc(moedaBr(m.pipelineValor) || 'R$ 0'), 'Valor no pipeline')}
      ${card(esc(moedaBr(m.ganhosValor) || 'R$ 0'), 'Valor ganho')}
    </div>`;
    const estagiosTab = `<h2 class="titulo" style="font-size:1.1rem">Por estágio</h2>
      <table><thead><tr><th>Estágio</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>${CRM.estagios.map(e =>
        `<tr><td>${esc(e.rot)}</td><td>${m.porEstagio[e.id].n}</td><td>${esc(moedaBr(m.porEstagio[e.id].valor) || '—')}</td></tr>`).join('')}</tbody></table>`;
    const tabela = (titulo, obj) => {
      const ent = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
      if (!ent.length) return '';
      return `<h2 class="titulo" style="font-size:1.1rem">${esc(titulo)}</h2><table><tbody>${ent.map(([k, v]) =>
        `<tr><td>${esc(k)}</td><td style="text-align:right;width:70px">${v}</td></tr>`).join('')}</tbody></table>`;
    };
    $('#m-corpo').innerHTML = cards + estagiosTab
      + tabela('Por origem', m.porOrigem)
      + tabela('Imóveis mais procurados', Object.fromEntries((m.topImoveis || []).map(x => [x.imovel, x.n])))
      + tabela('Motivos de perda', m.motivosPerda);
  } catch (e) { $('#m-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

async function crmCarregar() {
  try {
    const busca = ($('#crm-busca') && $('#crm-busca').value.trim()) || '';
    const [c1, c2] = await Promise.all([
      api('GET', '/crm/contatos' + (busca ? '?busca=' + encodeURIComponent(busca) : '')),
      api('GET', '/crm/followups'),
    ]);
    CRM.cache = c1.contatos;
    crmRenderFollowups(c2.followups);
    crmRenderBoard(c1.contatos);
  } catch (e) { if ($('#crm-board')) $('#crm-board').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

function crmRenderFollowups(fu) {
  const box = $('#crm-followups'); if (!box) return;
  if (!fu || !fu.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="followups"><strong>⏰ Follow-ups (${fu.length})</strong>${fu.map(c =>
    `<button class="fu-chip ${crmPrazoClasse(c.proximaAcao && c.proximaAcao.data)}" data-id="${esc(c.id)}">${esc(c.nome || c.telefone || 'sem nome')}: ${esc((c.proximaAcao && c.proximaAcao.descricao) || 'ação')} (${esc(crmDataCurta(c.proximaAcao && c.proximaAcao.data))})</button>`
  ).join('')}</div>`;
  box.querySelectorAll('.fu-chip').forEach(b => b.onclick = () => crmAbrirContato(b.dataset.id));
}

function crmCardHtml(c) {
  const pa = c.proximaAcao || {};
  return `<div class="kard" draggable="true" data-id="${esc(c.id)}">
    <div class="kard-nome">${esc(c.nome || c.telefone || 'sem nome')}</div>
    <div class="kard-meta">
      ${c.imovelInteresse ? `<span class="chip">${esc(c.imovelInteresse)}</span>` : ''}
      ${c.valorEstimado ? `<span class="chip">${esc(moedaBr(c.valorEstimado))}</span>` : ''}
    </div>
    ${pa.data ? `<div class="kard-acao ${crmPrazoClasse(pa.data)}">⏱ ${esc(pa.descricao || 'ação')} · ${esc(crmDataCurta(pa.data))}</div>` : ''}
    ${c.origem ? `<div class="kard-origem">${esc(c.origem)}</div>` : ''}
  </div>`;
}

function crmRenderBoard(contatos) {
  const board = $('#crm-board'); if (!board) return;
  const porEst = {}; CRM.estagios.forEach(e => porEst[e.id] = []);
  contatos.forEach(c => { (porEst[c.estagio] || porEst['novo']).push(c); });
  board.innerHTML = CRM.estagios.map(e => {
    const lista = porEst[e.id];
    const valor = lista.reduce((s, c) => s + (Number(c.valorEstimado) || 0), 0);
    return `<div class="col">
      <div class="col-head"><span>${esc(e.rot)}</span><span class="col-n">${lista.length}</span></div>
      ${valor ? `<div class="col-valor">${esc(moedaBr(valor))}</div>` : ''}
      <div class="col-cards" data-drop="${e.id}">${lista.map(crmCardHtml).join('') || '<div class="col-vazio">—</div>'}</div>
    </div>`;
  }).join('');
  board.querySelectorAll('.kard').forEach(k => {
    k.onclick = () => crmAbrirContato(k.dataset.id);
    k.ondragstart = (ev) => { ev.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('arrastando'); };
    k.ondragend = () => k.classList.remove('arrastando');
  });
  board.querySelectorAll('.col-cards').forEach(col => {
    col.ondragover = (ev) => { ev.preventDefault(); col.classList.add('sobre'); };
    col.ondragleave = () => col.classList.remove('sobre');
    col.ondrop = async (ev) => {
      ev.preventDefault(); col.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain'), estagio = col.dataset.drop;
      const c = CRM.cache.find(x => x.id === id);
      if (!c || c.estagio === estagio) return;
      try { await api('PATCH', '/crm/contatos/' + id, { estagio }); crmCarregar(); }
      catch (e) { alert(e.message); }
    };
  });
}

async function crmAbrirContato(id) {
  try {
    const { contato: c, atividades } = await api('GET', '/crm/contatos/' + id);
    const estOpts = CRM.estagios.map(e => `<option value="${e.id}" ${e.id === c.estagio ? 'selected' : ''}>${esc(e.rot)}</option>`).join('');
    const per = c.periodo || {};
    const periodoTxt = (per.checkin || per.checkout) ? `${esc(per.checkin || '?')} → ${esc(per.checkout || '?')} (${esc(per.hospedes || '?')} hósp.)` : '—';
    const tl = (atividades && atividades.length)
      ? atividades.map(a => `<div class="tl-item"><span class="tl-tipo">${esc(a.tipo)}</span>${esc(a.texto)}<div class="tl-data">${dataBr(a.data)} · ${esc(a.autor || '')}</div></div>`).join('')
      : '<div class="vazio">Sem atividades ainda.</div>';
    conteudo().innerHTML = `<button class="btn secund peq" id="crm-voltar">← Voltar ao funil</button>
      ${cabecalho(c.nome || c.telefone || 'Contato', (c.origem || '') + ' · criado em ' + dataBr(c.criadoEm))}
      <div class="ficha">
        <div class="ficha-col">
          <div class="ficha-bloco"><h3>Dados</h3>
            <div class="kv"><span>Telefone</span><b>${esc(c.telefone || '—')}</b></div>
            <div class="kv"><span>E-mail</span><b>${esc(c.email || '—')}</b></div>
            <div class="kv"><span>Imóvel</span><b>${esc(c.imovelInteresse || '—')}</b></div>
            <div class="kv"><span>Valor estimado</span><b>${esc(moedaBr(c.valorEstimado) || '—')}</b></div>
            <div class="kv"><span>Período</span><b>${periodoTxt}</b></div>
            <div class="kv"><span>Preferências</span><b>${esc(c.preferencias || '—')}</b></div>
            ${c.estagio === 'perdido' && c.motivoPerda ? `<div class="kv"><span>Motivo da perda</span><b>${esc(c.motivoPerda)}</b></div>` : ''}
          </div>
          <div class="ficha-bloco"><h3>Ações</h3>
            <label>Etapa <select id="f-estagio">${estOpts}</select></label>
            <label>Próxima ação <input id="f-acao-desc" value="${esc((c.proximaAcao && c.proximaAcao.descricao) || '')}" placeholder="o que fazer"></label>
            <label>Prazo <input id="f-acao-data" type="date" value="${esc((c.proximaAcao && c.proximaAcao.data) || '')}"></label>
            <button class="btn peq" id="f-salvar">Salvar alterações</button>
            <hr>
            <label>Registrar nota / mensagem <textarea id="f-nota" rows="2" placeholder="ex.: liguei, cliente vai pensar"></textarea></label>
            <button class="btn peq secund" id="f-add-nota">Adicionar à timeline</button>
            <hr>
            <button class="btn peq perigo" id="f-perder">Marcar como perdido</button>
            ${ESTADO.me.papel === 'admin' ? `<button class="btn peq perigo" id="f-excluir" style="margin-left:8px">Excluir contato</button>` : ''}
          </div>
        </div>
        <div class="ficha-col">
          <div class="ficha-bloco"><h3>Histórico Stays</h3><div id="stays-hist" class="vazio">Carregando…</div></div>
          <div class="ficha-bloco"><h3>Linha do tempo</h3><div class="timeline">${tl}</div></div>
        </div>
      </div>`;
    $('#crm-voltar').onclick = () => navegar('crm');
    $('#f-salvar').onclick = async () => {
      try {
        await api('PATCH', '/crm/contatos/' + id, { estagio: $('#f-estagio').value, proximaAcao: { descricao: $('#f-acao-desc').value.trim(), data: $('#f-acao-data').value } });
        crmAbrirContato(id);
      } catch (e) { alert(e.message); }
    };
    $('#f-add-nota').onclick = async () => {
      const texto = $('#f-nota').value.trim(); if (!texto) return;
      try { await api('POST', '/crm/contatos/' + id + '/atividade', { tipo: 'nota', texto }); crmAbrirContato(id); }
      catch (e) { alert(e.message); }
    };
    $('#f-perder').onclick = async () => {
      const motivo = prompt('Motivo da perda (opcional):');
      if (motivo === null) return; // cancelou
      try { await api('POST', '/crm/contatos/' + id + '/perder', { motivo }); crmAbrirContato(id); }
      catch (e) { alert(e.message); }
    };
    if ($('#f-excluir')) $('#f-excluir').onclick = async () => {
      if (!confirm('Excluir este contato permanentemente? Esta ação não pode ser desfeita.')) return;
      try { await api('DELETE', '/crm/contatos/' + id); navegar('crm'); }
      catch (e) { alert(e.message); }
    };
    crmCarregarStays(id); // Histórico Stays (assíncrono)
  } catch (e) { alert(e.message); }
}

// Carrega o histórico do cliente na Stays (reservas + gasto) para a ficha.
async function crmCarregarStays(id) {
  const box = document.querySelector('#stays-hist'); if (!box) return;
  try {
    const d = await api('GET', '/crm/contatos/' + id + '/stays');
    if (!d.vinculado) { box.innerHTML = 'Contato ainda não vinculado a um cliente da Stays.'; return; }
    if (!d.reservas || !d.reservas.length) { box.innerHTML = 'Cliente da Stays sem reservas registradas.'; return; }
    const rotuloTipo = { booked: 'Confirmada', reserved: 'Reservada', contract: 'Contrato', canceled: 'Cancelada', blocked: 'Bloqueio' };
    const totais = `<div class="stays-totais"><span><b>${d.totalReservas}</b> reserva(s) efetiva(s)</span><span>Total: <b>${esc(moedaBr(d.totalGasto) || 'R$ 0')}</b></span></div>`;
    const linhas = d.reservas.map(r => `<div class="stays-res">
        <div class="stays-res-top"><b>${esc(r.imovel || r.imovelTitulo || '—')}</b><span class="chip">${esc(rotuloTipo[r.type] || r.type)}</span></div>
        <div class="stays-res-meta">${esc(r.checkin || '?')} → ${esc(r.checkout || '?')}${r.hospedes ? ' · ' + esc(r.hospedes) + ' hósp.' : ''} · ${esc(moedaBr(r.valor) || '—')}</div>
      </div>`).join('');
    box.classList.remove('vazio');
    box.innerHTML = totais + linhas;
  } catch (e) { box.innerHTML = 'Não foi possível carregar o histórico da Stays agora.'; }
}

function crmFormContato() {
  const ori = CRM.origens.map(o => `<option value="${o}">${o}</option>`).join('');
  conteudo().innerHTML = `<button class="btn secund peq" id="crm-voltar">← Voltar ao funil</button>
    ${cabecalho('Novo contato', '')}
    <form class="form" id="crm-form">
      <label>Nome <input id="n-nome" required></label>
      <label>Telefone (WhatsApp) <input id="n-tel" placeholder="61 9xxxx-xxxx"></label>
      <label>E-mail <input id="n-email" type="email"></label>
      <label>Origem <select id="n-origem">${ori}</select></label>
      <label>Imóvel de interesse <input id="n-imovel" placeholder="ex.: GD01H / Casa Modernista"></label>
      <label>Valor estimado (R$) <input id="n-valor" type="number" min="0" step="50"></label>
      <button class="btn" type="submit">Criar contato</button>
      <p id="n-msg" class="erro"></p>
    </form>`;
  $('#crm-voltar').onclick = () => navegar('crm');
  $('#crm-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#n-msg'); msg.textContent = '';
    try {
      if (!$('#n-nome').value.trim() && !$('#n-tel').value.trim()) throw new Error('Informe ao menos nome e telefone.');
      const { contato } = await api('POST', '/crm/contatos', {
        nome: $('#n-nome').value.trim(), telefone: $('#n-tel').value.trim(), email: $('#n-email').value.trim(),
        origem: $('#n-origem').value, imovelInteresse: $('#n-imovel').value.trim(),
        valorEstimado: $('#n-valor').value ? Number($('#n-valor').value) : null,
      });
      crmAbrirContato(contato.id);
    } catch (e) { msg.textContent = e.message; }
  };
}

// --------- eventos globais ---------
// O #form-login NAO usa fetch/preventDefault: faz POST NATIVO para /staff/api/login
// (method/action no HTML). Isso faz o gerenciador de senhas do navegador (Edge/Chrome)
// oferecer salvar e autopreencher. Em sucesso o servidor responde 303 -> /staff/, e o
// boot abaixo (init -> /me) abre o app. Em falha volta para /staff/?login_erro=1.
$('#form-trocar').onsubmit = async (ev) => {
  ev.preventDefault();
  const erro = $('#tr-erro'); erro.textContent = '';
  if ($('#tr-nova').value !== $('#tr-conf').value) { erro.textContent = 'As senhas não conferem.'; return; }
  try {
    await api('POST', '/conta/senha', { atual: $('#tr-atual').value, nova: $('#tr-nova').value });
    ESTADO.me.precisaTrocarSenha = false;
    abrirApp();
  } catch (e) { erro.textContent = e.message; }
};
$('#btn-sair').onclick = async () => { try { await api('POST', '/logout'); } catch {} ESTADO.me = null; mostrarLogin(); };

init();
