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
  // Deep-link: ?rel=<id>[&fmt=arquivo] abre um relatório específico (links diretos do Boletim Executivo
  // e de outros painéis). Para arquivos o link aponta direto a /arquivo, mas aceitamos fmt aqui também.
  try {
    const p = new URLSearchParams(location.search);
    const rel = p.get('rel');
    if (rel) {
      const fmt = p.get('fmt') || '';
      p.delete('rel'); p.delete('fmt');
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      ESTADO.secao = 'relatorios';
      abrirRelatorio(rel, fmt);
      return;
    }
  } catch (_) {}
  navegar('visao');
}

// --------- menu ---------
// Menu em grupos por FUNÇÃO (jornada de trabalho): Início → Reservas → Comercial → Hóspedes →
// Operação → Relatórios & Gestão → Administração → Links. Itens aparecem conforme a área do usuário.
function montarMenu() {
  const m = $('#menu'); m.innerHTML = '';
  const ehAdmin = ESTADO.me.papel === 'admin';
  const tem = (a) => ehAdmin || ESTADO.areas.includes('*') || ESTADO.areas.includes(a);
  const itens = [
    { grupo: 'Início' },
    { id: 'visao', rot: '🏠 Visão geral' },
    { id: 'mural', rot: '💬 Mural da equipe', badge: 'mural' },
    { grupo: 'Reservas & Calendário' },
    { id: 'calendario', rot: '📆 Calendário (Stays)' },
    { id: 'stays-reservas', rot: '🗂️ Reservas (Stays)' },
    { id: 'stays-hospedes', rot: '👥 Hóspedes (Stays)' },
  ];
  const com = [];
  if (tem('vendas')) com.push({ id: 'crm', rot: '📈 CRM / Funil' });
  if (ESTADO.painelDisp.leads) com.push({ id: 'leads', rot: '🎯 Leads' });
  if (tem('concierge') || tem('vendas')) com.push({ id: 'hospede-fidelidade', rot: '⭐ Avaliações & indicações' });
  if (com.length) itens.push({ grupo: 'Comercial' }, ...com);
  const hosp = [];
  if (tem('concierge') || tem('vendas')) hosp.push({ id: 'hospede-pedidos', rot: '📨 Pedidos de hóspedes' });
  if (ESTADO.painelDisp.precheckins) hosp.push({ id: 'precheckins', rot: '🛬 Pré-check-ins' });
  if (tem('financeiro') || tem('concierge') || tem('vendas')) hosp.push({ id: 'hospede-conta', rot: '💳 Conta corrente' });
  if (ehAdmin) hosp.push({ id: 'hospede-info', rot: '🔑 Área do Hóspede' });
  if (hosp.length) itens.push({ grupo: 'Hóspedes' }, ...hosp);
  itens.push({ grupo: 'Operação' });
  itens.push({ id: 'compras', rot: '🛒 Lista de compras' });
  itens.push({ id: 'manutencao', rot: '🔧 Lista de manutenção' });
  // Pendências é restrita à área CEO (admin vê tudo); demais não veem o item.
  if (tem('ceo')) itens.push({ id: 'pendencias', rot: '✅ Pendências' });
  itens.push({ id: 'agenda', rot: '📅 Agenda (eventos)' });
  if (ESTADO.painelDisp.chamados) itens.push({ id: 'chamados', rot: '🛎️ Chamados' });
  itens.push({ grupo: 'Relatórios & Gestão' });
  itens.push({ id: 'relatorios', rot: '📄 Relatórios & Entregas' });
  itens.push({ id: 'publicar', rot: '➕ Publicar entrega' });
  if (ESTADO.podeEstat) itens.push({ id: 'estatisticas', rot: '📊 Visitas do site' });
  if (ESTADO.painelDisp.eventos) itens.push({ id: 'eventos', rot: '⚡ Eventos (Stays)' });
  itens.push({ grupo: 'Administração' });
  if (ehAdmin) itens.push({ id: 'usuarios', rot: '👤 Usuários' });
  itens.push({ id: 'conta', rot: '⚙️ Minha conta' });
  itens.push({ grupo: 'Links' });
  itens.push({ rot: '🏨 Painel da Stays ↗', url: 'https://ville.stays.com.br/i/home' });
  itens.push({ rot: '🌐 Site público ↗', url: 'https://villelastay.com.br' });
  itens.push({ rot: '🔑 Área do Hóspede ↗', url: 'https://minha.villelastay.com.br/hospede' });

  for (const it of itens) {
    if (it.grupo) { const g = document.createElement('div'); g.className = 'grupo'; g.textContent = it.grupo; m.appendChild(g); continue; }
    if (it.url) {
      const a = document.createElement('a'); a.textContent = it.rot; a.href = it.url;
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'link-externo';
      m.appendChild(a); continue;
    }
    const b = document.createElement('button'); b.textContent = it.rot; b.dataset.id = it.id;
    if (it.badge) { const s = document.createElement('span'); s.className = 'badge-menu hidden'; s.dataset.badge = it.badge; b.appendChild(s); }
    b.onclick = () => navegar(it.id);
    m.appendChild(b);
  }
  atualizarBadgeMural();
}

// Badge de mensagens novas no mural (desde a última visita deste navegador)
async function atualizarBadgeMural() {
  try {
    const { mensagens } = await api('GET', '/mural');
    const visto = localStorage.getItem('vs_mural_visto') || '';
    const novas = mensagens.filter(x => !visto || x.criadoEm > visto).length;
    const s = document.querySelector('[data-badge="mural"]');
    if (!s) return;
    if (novas > 0 && ESTADO.secao !== 'mural') { s.textContent = novas > 99 ? '99+' : novas; s.classList.remove('hidden'); }
    else s.classList.add('hidden');
  } catch (_) {}
}

function navegar(secao) {
  ESTADO.secao = secao;
  document.querySelectorAll('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.id === secao));
  const rotas = { visao: renderVisao, mural: renderMural, relatorios: renderRelatorios, publicar: renderPublicar, calendario: renderCalendario, 'stays-hospedes': renderStaysHospedes, 'stays-reservas': renderStaysReservas, crm: renderCRM, compras: () => renderLista('compras', 'Lista de compras'), manutencao: () => renderLista('manutencao', 'Lista de manutenção'), pendencias: () => renderLista('pendencias', 'Pendências', { semQtd: true, rotuloNome: 'Pendência *', sub: 'Pendências e tarefas em aberto. Qualquer pessoa da equipe pode incluir e dar baixa.' }), agenda: renderAgenda, leads: () => renderPainel('leads', 'Leads'), precheckins: () => renderPainel('precheckins', 'Pré-check-ins'), chamados: () => renderPainel('chamados', 'Chamados'), eventos: () => renderPainel('eventos', 'Eventos (Stays)'), estatisticas: renderEstatisticas, 'hospede-info': renderHospedeInfo, 'hospede-pedidos': renderHospedePedidos, 'hospede-fidelidade': renderHospedeFidelidade, 'hospede-conta': renderHospedeConta, usuarios: renderUsuarios, conta: renderConta };
  (rotas[secao] || renderVisao)();
}

const conteudo = () => $('#conteudo');
function cabecalho(titulo, sub) { return `<h1 class="titulo">${esc(titulo)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}`; }

// --------- Listas (Compras / Manutenção / Pendências) ---------
async function renderLista(tipo, titulo, opcoes) {
  const o = opcoes || {};
  const semQtd = !!o.semQtd;
  const rotuloNome = o.rotuloNome || 'Produto ou serviço *';
  const sub = o.sub || 'Qualquer pessoa da equipe pode incluir e dar baixa. Itens entram aqui e também pelo WhatsApp.';
  const c = conteudo();
  c.innerHTML = cabecalho(titulo, sub);
  c.innerHTML += `
    <form id="form-item" class="barra" style="flex-wrap:wrap">
      ${semQtd ? '' : '<input id="it-qtd" placeholder="Qtd (ex.: 2)" style="width:120px" aria-label="Quantidade">'}
      <input id="it-nome" placeholder="${esc(rotuloNome)}" style="flex:2;min-width:220px" required aria-label="Nome">
      <input id="it-obs" placeholder="Observação (opcional)" style="flex:1;min-width:160px" aria-label="Observação">
      <button class="btn" type="submit">+ Adicionar</button>
    </form>
    <div id="lista-itens" class="lista-itens"><p class="vazio">Carregando…</p></div>`;
  const f = $('#form-item');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const nome = $('#it-nome').value.trim(); if (!nome) return;
    try {
      const qtd = semQtd ? '' : ($('#it-qtd') ? $('#it-qtd').value : '');
      await api('POST', '/listas/' + tipo, { quantidade: qtd, nome, obs: $('#it-obs').value });
      f.reset(); $('#it-nome').focus(); carregarItens(tipo, { semQtd });
    } catch (e) { alert(e.message); }
  };
  carregarItens(tipo, { semQtd });
}
async function carregarItens(tipo, opcoes) {
  const semQtd = !!(opcoes && opcoes.semQtd);
  const alvo = $('#lista-itens'); if (!alvo) return;
  try {
    const { itens } = await api('GET', '/listas/' + tipo);
    if (!itens.length) { alvo.innerHTML = `<p class="vazio">Lista vazia. Adicione o primeiro item acima.</p>`; return; }
    alvo.innerHTML = `<div class="lista-cab"><span>${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</span><button class="btn peq perigo" id="limpar-lista">Limpar tudo</button></div>` +
      itens.map(i => `
      <div class="linha-item">
        ${semQtd ? '' : `<span class="qtd">${esc(i.quantidade || '—')}</span>`}
        <span class="nome">${esc(i.nome)}${i.obs ? ` <span class="obs">— ${esc(i.obs)}</span>` : ''}</span>
        <span class="quem">${i.origem === 'whatsapp' ? '📱' : '💻'} ${esc(i.quem || '')} · ${dataBr(i.criadoEm)}</span>
        <button class="btn peq" data-baixa="${i.id}" title="Marcar como concluída / remover">✓</button>
      </div>`).join('');
    alvo.querySelectorAll('[data-baixa]').forEach(b => b.onclick = async () => {
      try { await api('DELETE', '/listas/' + tipo + '/' + b.dataset.baixa); carregarItens(tipo, { semQtd }); } catch (e) { alert(e.message); }
    });
    const lb = $('#limpar-lista');
    if (lb) lb.onclick = async () => { if (confirm('Limpar a lista inteira?')) { try { await api('POST', '/listas/' + tipo + '/limpar'); carregarItens(tipo, { semQtd }); } catch (e) { alert(e.message); } } };
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

// --------- Calendário (réplica do calendário da Stays) ---------
const CAL_PLATAFORMAS = { airbnb: 'Airbnb', booking: 'Booking', decolar: 'Decolar', expedia: 'Expedia', vrbo: 'Vrbo', google: 'Google', site: 'Site', direto: 'Direta', outro: 'Outra' };
const calYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const calParse = s => { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); };
const calDiffDias = (a, b) => Math.round((b - a) / 86400000);
const calMesNome = m => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m];
const calMoeda = (v, moeda) => (v == null ? '' : (moeda === 'BRL' ? 'R$ ' : (moeda || '') + ' ') + Number(v).toLocaleString('pt-BR'));
// normaliza para busca: minúsculas e SEM acento (ex.: "otavio" casa "Otávio")
const calNorm = s => String(s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase().trim();

function calEstado() {
  if (!ESTADO.cal) {
    const hoje = new Date();
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    ESTADO.cal = { from: calYmd(ini), to: calYmd(fim), vista: 'timeline', plat: '', status: '', busca: '', ocultas: new Set(), dados: null };
  }
  return ESTADO.cal;
}

async function renderCalendario() {
  const cal = calEstado();
  const c = conteudo();
  c.innerHTML = cabecalho('Calendário (Stays)', 'Réplica do calendário da Stays — ao vivo da mesma API. Somente leitura: para editar, use o painel da Stays.');
  c.innerHTML += `
    <div class="cal-controls">
      <div class="cal-grp">
        <button class="btn peq" id="cal-prev" title="Período anterior">◀</button>
        <button class="btn peq" id="cal-hoje" title="Voltar ao mês atual">Hoje</button>
        <button class="btn peq" id="cal-next" title="Próximo período">▶</button>
      </div>
      <div class="cal-grp">
        <label class="cal-lab">De <input type="date" id="cal-de" value="${cal.from}"></label>
        <label class="cal-lab">Até <input type="date" id="cal-ate" value="${cal.to}"></label>
        <button class="btn peq" id="cal-aplicar">Aplicar</button>
      </div>
      <div class="cal-grp">
        <button class="btn peq ${cal.vista === 'timeline' ? 'ativo' : ''}" id="cal-v-timeline">Linha do tempo</button>
        <button class="btn peq ${cal.vista === 'mes' ? 'ativo' : ''}" id="cal-v-mes">Mês</button>
      </div>
      <div class="cal-grp">
        <input type="search" id="cal-busca" placeholder="🔎 Buscar hóspede" value="${esc(cal.busca)}" style="min-width:150px">
        <select id="cal-plat"><option value="">Todas as plataformas</option></select>
        <select id="cal-status">
          <option value="">Reservas + bloqueios</option>
          <option value="reservas">Só reservas</option>
          <option value="bloqueios">Só bloqueios</option>
        </select>
        <details class="cal-props"><summary id="cal-props-sum">Propriedades</summary><div id="cal-props-lista" class="cal-props-lista"></div></details>
        <button class="btn peq" id="cal-refresh" title="Atualizar da Stays">↻</button>
      </div>
    </div>
    <div class="cal-legenda" id="cal-legenda"></div>
    <div id="cal-area"><p class="vazio">Carregando…</p></div>`;

  const setRange = (de, ate) => { cal.from = de; cal.to = ate; $('#cal-de').value = de; $('#cal-ate').value = ate; carregarCalendario(); };
  const passo = () => { // navega pelo mesmo tamanho de janela (ancorado em meses quando for mês cheio)
    const de = calParse(cal.from), ate = calParse(cal.to);
    return { de, ate, dias: calDiffDias(de, ate) + 1 };
  };
  $('#cal-prev').onclick = () => { const { de, dias } = passo(); const nf = new Date(de); nf.setDate(nf.getDate() - dias); const nt = new Date(de); nt.setDate(nt.getDate() - 1); setRange(calYmd(nf), calYmd(nt)); };
  $('#cal-next').onclick = () => { const { ate, dias } = passo(); const nf = new Date(ate); nf.setDate(nf.getDate() + 1); const nt = new Date(ate); nt.setDate(nt.getDate() + dias); setRange(calYmd(nf), calYmd(nt)); };
  $('#cal-hoje').onclick = () => { const h = new Date(); setRange(calYmd(new Date(h.getFullYear(), h.getMonth(), 1)), calYmd(new Date(h.getFullYear(), h.getMonth() + 1, 0))); };
  $('#cal-aplicar').onclick = () => { const de = $('#cal-de').value, ate = $('#cal-ate').value; if (de && ate && de <= ate) setRange(de, ate); else alert('Escolha um intervalo válido (De ≤ Até).'); };
  $('#cal-refresh').onclick = () => carregarCalendario();
  $('#cal-v-timeline').onclick = () => { cal.vista = 'timeline'; $('#cal-v-timeline').classList.add('ativo'); $('#cal-v-mes').classList.remove('ativo'); calDesenhar(); };
  $('#cal-v-mes').onclick = () => { cal.vista = 'mes'; $('#cal-v-mes').classList.add('ativo'); $('#cal-v-timeline').classList.remove('ativo'); calDesenhar(); };
  $('#cal-busca').oninput = () => { cal.busca = $('#cal-busca').value; calDesenhar(); };
  $('#cal-plat').onchange = () => { cal.plat = $('#cal-plat').value; calDesenhar(); };
  $('#cal-status').onchange = () => { cal.status = $('#cal-status').value; calDesenhar(); };
  carregarCalendario();
}

async function carregarCalendario() {
  const cal = calEstado();
  const area = $('#cal-area'); if (area) area.innerHTML = `<p class="vazio">Carregando da Stays…</p>`;
  try {
    const dados = await api('GET', `/calendario?from=${cal.from}&to=${cal.to}`);
    cal.dados = dados;
    // plataformas presentes -> opções do filtro
    const plats = [...new Set(dados.reservas.filter(r => !r.bloqueio && r.plataforma).map(r => r.plataforma))];
    const sel = $('#cal-plat'); if (sel) { const atual = cal.plat; sel.innerHTML = `<option value="">Todas as plataformas</option>` + plats.map(p => `<option value="${p}">${esc(CAL_PLATAFORMAS[p] || p)}</option>`).join(''); sel.value = atual; }
    // painel de propriedades (mostrar/ocultar)
    const pl = $('#cal-props-lista');
    if (pl) {
      pl.innerHTML = `<div class="cal-props-acoes"><button class="btn peq" id="cal-props-todas">Todas</button><button class="btn peq" id="cal-props-nenhuma">Nenhuma</button></div>` +
        dados.propriedades.map(p => `<label class="cal-prop-it"><input type="checkbox" value="${esc(p.idlisting)}" ${cal.ocultas.has(p.idlisting) ? '' : 'checked'}> <b>${esc(p.codigo)}</b> ${esc(p.titulo)}</label>`).join('');
      pl.querySelectorAll('input[type=checkbox]').forEach(ch => ch.onchange = () => { if (ch.checked) cal.ocultas.delete(ch.value); else cal.ocultas.add(ch.value); calDesenhar(); });
      $('#cal-props-todas').onclick = () => { cal.ocultas.clear(); pl.querySelectorAll('input').forEach(c => c.checked = true); calDesenhar(); };
      $('#cal-props-nenhuma').onclick = () => { dados.propriedades.forEach(p => cal.ocultas.add(p.idlisting)); pl.querySelectorAll('input').forEach(c => c.checked = false); calDesenhar(); };
    }
    calDesenhar();
  } catch (e) {
    if (area) area.innerHTML = `<p class="erro">${esc(e.message)}</p>`;
  }
}

function calReservasFiltradas() {
  const cal = calEstado(); const d = cal.dados; if (!d) return [];
  const termo = calNorm(cal.busca);
  return d.reservas.filter(r => {
    if (cal.ocultas.has(r.idlisting)) return false;
    if (cal.status === 'reservas' && r.bloqueio) return false;
    if (cal.status === 'bloqueios' && !r.bloqueio) return false;
    if (cal.plat && r.plataforma !== cal.plat) return false;
    if (termo && !calNorm(r.hospede).includes(termo)) return false;
    return true;
  });
}

function calLegenda() {
  const usados = [...new Set((calEstado().dados?.reservas || []).filter(r => !r.bloqueio && r.plataforma).map(r => r.plataforma))];
  const itens = usados.map(p => `<span class="cal-leg-it"><span class="cal-dot plat-${p}"></span>${esc(CAL_PLATAFORMAS[p] || p)}</span>`).join('');
  return itens + `<span class="cal-leg-it"><span class="cal-dot cal-dot-bloq"></span>Bloqueio</span>`;
}

function calDesenhar() {
  const cal = calEstado(); const d = cal.dados; const area = $('#cal-area'); if (!area || !d) return;
  const leg = $('#cal-legenda'); if (leg) leg.innerHTML = calLegenda();
  const ps = $('#cal-props-sum'); if (ps) { const vis = d.propriedades.length - cal.ocultas.size; ps.textContent = `Propriedades (${vis}/${d.propriedades.length})`; }
  if (cal.vista === 'mes') return calDesenharMes(area);
  calDesenharTimeline(area);
}

function calDesenharTimeline(area) {
  const cal = calEstado(); const d = cal.dados;
  const from = calParse(cal.from), to = calParse(cal.to);
  const nDias = calDiffDias(from, to) + 1;
  if (nDias < 1 || nDias > 400) { area.innerHTML = `<p class="erro">Intervalo grande demais para a linha do tempo. Reduza o período.</p>`; return; }
  const hojeStr = calYmd(new Date());
  const dias = []; for (let i = 0; i < nDias; i++) { const dt = new Date(from); dt.setDate(dt.getDate() + i); dias.push(dt); }
  // Colunas FLEXÍVEIS (minmax(min, 1fr)): o intervalo se estica para preencher a largura — um mês
  // inteiro cabe na tela sem rolagem; só rola quando há dias demais para a largura mínima.
  const gtc = `var(--cw-label) repeat(${nDias}, minmax(var(--cw), 1fr))`;
  const semana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  // faixa de meses
  let faixaMes = ''; let i = 0;
  while (i < nDias) { const m = dias[i].getMonth(), y = dias[i].getFullYear(); let len = 0; while (i + len < nDias && dias[i + len].getMonth() === m && dias[i + len].getFullYear() === y) len++; faixaMes += `<div class="cal-mes" style="grid-column:${i + 2} / span ${len}">${calMesNome(m)} ${y}</div>`; i += len; }

  // cabeçalho de dias
  let cab = `<div class="cal-rot cal-rot-cab">Propriedade</div>`;
  dias.forEach((dt, idx) => { const fds = dt.getDay() === 0 || dt.getDay() === 6; const hoje = calYmd(dt) === hojeStr; cab += `<div class="cal-cab-dia${fds ? ' fds' : ''}${hoje ? ' hoje' : ''}" style="grid-column:${idx + 2}"><span class="cal-sem">${semana[dt.getDay()]}</span><span class="cal-num">${dt.getDate()}</span></div>`; });

  const reservas = calReservasFiltradas();
  const porListing = {}; reservas.forEach(r => { (porListing[r.idlisting] = porListing[r.idlisting] || []).push(r); });
  const props = d.propriedades.filter(p => !cal.ocultas.has(p.idlisting));
  if (!props.length) { area.innerHTML = `<p class="vazio">Nenhuma propriedade selecionada. Use o filtro “Propriedades”.</p>`; return; }

  const linhas = props.map(p => {
    let celulas = `<div class="cal-rot" title="${esc(p.codigo)} · ${esc(p.titulo)}"><b>${esc(p.codigo)}</b><span>${esc(p.titulo)}</span></div>`;
    dias.forEach((dt, idx) => { const fds = dt.getDay() === 0 || dt.getDay() === 6; const hoje = calYmd(dt) === hojeStr; celulas += `<div class="cal-cell${fds ? ' fds' : ''}${hoje ? ' hoje' : ''}" style="grid-column:${idx + 2};grid-row:1"></div>`; });
    const barras = (porListing[p.idlisting] || []).map(r => {
      const s = calDiffDias(from, calParse(r.checkIn)), e = calDiffDias(from, calParse(r.checkOut));
      const bs = Math.max(0, Math.min(s, nDias)); const be = Math.max(0, Math.min(e, nDias)); const span = be - bs;
      if (span < 1) return '';
      const aberto = (s < 0 ? ' aberta-esq' : '') + (e > nDias ? ' aberta-dir' : '');
      const cls = r.bloqueio ? 'cal-bar-bloq' : 'plat-' + (r.plataforma || 'outro');
      const det = esc(JSON.stringify(r));
      const rotulo = `${esc(r.hospede)}${r.noites ? ` · ${r.noites}n` : ''}`;
      return `<div class="cal-bar ${cls}${aberto}" style="grid-column:${bs + 2} / span ${span};grid-row:1" data-res='${det}' title="${esc(r.hospede)} — ${esc(r.checkIn)} a ${esc(r.checkOut)}">${rotulo}</div>`;
    }).join('');
    return `<div class="cal-row" style="grid-template-columns:${gtc}">${celulas}${barras}</div>`;
  }).join('');

  area.innerHTML = `<div class="cal-scroll"><div class="cal-grade">
    <div class="cal-faixa-mes" style="grid-template-columns:${gtc}"><div class="cal-rot cal-rot-cab"></div>${faixaMes}</div>
    <div class="cal-row cal-cab-row" style="grid-template-columns:${gtc}">${cab}</div>
    ${linhas}
  </div></div>
  <p class="cal-rodape">${reservas.length} reserva(s)/bloqueio(s) no período · atualizado às ${new Date(d.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · fonte: API Stays</p>`;

  area.querySelectorAll('.cal-bar').forEach(b => b.onclick = () => calAbrirDetalhe(JSON.parse(b.dataset.res)));
}

function calDesenharMes(area) {
  const cal = calEstado(); const d = cal.dados;
  const base = calParse(cal.from); const ano = base.getFullYear(), mes = base.getMonth();
  const primeiro = new Date(ano, mes, 1), ultimo = new Date(ano, mes + 1, 0);
  const reservas = calReservasFiltradas();
  const hojeStr = calYmd(new Date());
  const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const propPorId = {}; d.propriedades.forEach(p => propPorId[p.idlisting] = p);
  // células: começa no domingo anterior
  const inicio = new Date(primeiro); inicio.setDate(inicio.getDate() - primeiro.getDay());
  const fim = new Date(ultimo); fim.setDate(fim.getDate() + (6 - ultimo.getDay()));
  let cels = '';
  for (let dt = new Date(inicio); dt <= fim; dt.setDate(dt.getDate() + 1)) {
    const ds = calYmd(dt); const foraMes = dt.getMonth() !== mes; const hoje = ds === hojeStr;
    const ins = reservas.filter(r => r.checkIn === ds);
    const outs = reservas.filter(r => r.checkOut === ds);
    const ocup = reservas.filter(r => r.checkIn <= ds && r.checkOut > ds).length;
    const chip = (r, ico) => `<div class="cal-mes-chip ${r.bloqueio ? 'cal-bar-bloq' : 'plat-' + (r.plataforma || 'outro')}" data-res='${esc(JSON.stringify(r))}' title="${esc(r.hospede)} (${esc((propPorId[r.idlisting] || {}).codigo || '')})">${ico} ${esc((propPorId[r.idlisting] || {}).codigo || '')} ${esc(r.hospede)}</div>`;
    cels += `<div class="cal-mes-cel${foraMes ? ' fora' : ''}${hoje ? ' hoje' : ''}">
      <div class="cal-mes-num">${dt.getDate()}${ocup ? `<span class="cal-mes-ocup" title="${ocup} ocupada(s) nesta noite">${ocup}</span>` : ''}</div>
      ${ins.map(r => chip(r, '▶')).join('')}
      ${outs.map(r => chip(r, '◀')).join('')}
    </div>`;
  }
  area.innerHTML = `<div class="cal-mes-tit">${calMesNome(mes)} ${ano}</div>
    <div class="cal-mes-grade">
      ${semana.map(s => `<div class="cal-mes-dow">${s}</div>`).join('')}
      ${cels}
    </div>
    <p class="cal-rodape">▶ check-in · ◀ check-out · número = noites ocupadas · atualizado às ${new Date(d.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · fonte: API Stays</p>`;
  area.querySelectorAll('.cal-mes-chip').forEach(b => b.onclick = () => calAbrirDetalhe(JSON.parse(b.dataset.res)));
}

function calAbrirDetalhe(r) {
  const linhas = [
    ['Hóspede', r.hospede],
    ['Status', r.statusRotulo],
    !r.bloqueio && ['Plataforma', r.plataformaRotulo],
    ['Check-in', r.checkIn], ['Check-out', r.checkOut],
    r.noites && ['Noites', r.noites],
    r.hospedes && ['Hóspedes', `${r.hospedes}${r.adultos != null ? ` (${r.adultos} ad.${r.criancas ? ' / ' + r.criancas + ' cri.' : ''}${r.bebes ? ' / ' + r.bebes + ' bebê' : ''})` : ''}`],
    !r.bloqueio && r.valorTotal != null && ['Valor total', calMoeda(r.valorTotal, r.moeda)],
    ['Reserva', r.id],
  ].filter(Boolean);
  const corpo = linhas.map(([k, v]) => `<div class="cal-det-l"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('');
  const link = r.reservationUrl ? `<a class="btn peq" href="${esc(r.reservationUrl)}" target="_blank" rel="noopener">Abrir na Stays ↗</a>` : '';
  let ov = $('#cal-modal'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'cal-modal'; ov.className = 'cal-modal';
  ov.innerHTML = `<div class="cal-modal-cx"><button class="cal-modal-x" aria-label="Fechar">✕</button><h3>${esc(r.bloqueio ? 'Bloqueio' : r.hospede)}</h3>${corpo}<div class="cal-det-acoes">${link}</div></div>`;
  ov.onclick = (e) => { if (e.target === ov || e.target.classList.contains('cal-modal-x')) ov.remove(); };
  document.body.appendChild(ov);
}

// --------- Hóspedes (Stays) ---------
async function renderStaysHospedes() {
  const c = conteudo();
  c.innerHTML = cabecalho('Hóspedes (Stays)', 'Central de hóspedes — dados ao vivo da Stays. Somente leitura.');
  c.innerHTML += `<form id="sh-form" class="barra">
    <input id="sh-q" type="search" placeholder="🔎 Buscar hóspede pelo nome (sem acento funciona)" style="flex:1;min-width:220px">
    <button class="btn" type="submit">Buscar</button>
  </form>
  <div id="sh-det"></div>
  <div id="sh-lista"><p class="vazio">Carregando…</p></div>`;
  let skip = 0;
  const carregar = async () => {
    const q = $('#sh-q').value.trim();
    const alvo = $('#sh-lista'); alvo.innerHTML = `<p class="vazio">Carregando…</p>`;
    try {
      const r = await api('GET', `/stays/clientes?busca=${encodeURIComponent(q)}&skip=${skip}&limit=30`);
      if (!r.clientes.length) { alvo.innerHTML = `<p class="vazio">Nenhum hóspede${q ? ' para “' + esc(q) + '”' : ''}.</p>`; return; }
      const fim = Math.min(r.skip + r.limit, r.total);
      alvo.innerHTML = `<p class="sub" style="margin:0 0 8px">${r.total} hóspede(s)${q ? ' para “' + esc(q) + '”' : ''} · mostrando ${r.skip + 1}–${fim}</p>
        <div class="lista">${r.clientes.map(h => `<div class="item sh-item" data-id="${esc(h.id)}" style="cursor:pointer">
          <h3>${esc(h.nome)}</h3><div class="meta"><span>origem: ${esc(h.origem || '—')}</span>${h.criadoEm ? `<span>desde ${dataBr(h.criadoEm)}</span>` : ''}</div></div>`).join('')}</div>
        <div class="barra" style="justify-content:space-between;margin-top:12px">
          <button class="btn peq" id="sh-prev" ${r.skip <= 0 ? 'disabled' : ''}>← Anteriores</button>
          <button class="btn peq" id="sh-next" ${fim >= r.total ? 'disabled' : ''}>Próximos →</button></div>`;
      alvo.querySelectorAll('.sh-item').forEach(el => el.onclick = () => abrirHospede(el.dataset.id));
      const p = $('#sh-prev'), n = $('#sh-next');
      if (p) p.onclick = () => { skip = Math.max(0, skip - 30); carregar(); };
      if (n) n.onclick = () => { skip += 30; carregar(); };
    } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };
  $('#sh-form').onsubmit = (ev) => { ev.preventDefault(); skip = 0; carregar(); };
  carregar();
}

async function abrirHospede(id) {
  const det = $('#sh-det'); if (!det) return;
  det.innerHTML = `<div class="ficha-bloco"><p class="vazio">Carregando ficha…</p></div>`;
  det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const h = await api('GET', `/stays/cliente/${id}`);
    const contatos = [...(h.telefones || []).map(t => '📞 ' + esc(t)), ...(h.emails || []).map(e => '✉️ ' + esc(e))].join(' · ') || '—';
    const resv = h.reservas.length ? `<table><thead><tr><th>Imóvel</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>Valor</th></tr></thead><tbody>${h.reservas.map(r => `<tr><td><b>${esc(r.imovel || '—')}</b> ${esc(r.imovelTitulo || '')}</td><td>${esc(r.checkIn || '')}</td><td>${esc(r.checkOut || '')}</td><td>${esc(r.statusRotulo)}</td><td>${r.valorTotal != null ? esc(calMoeda(r.valorTotal, r.moeda)) : '—'}</td></tr>`).join('')}</tbody></table>` : `<p class="vazio">Sem reservas registradas.</p>`;
    det.innerHTML = `<div class="ficha-bloco">
      <button class="btn peq" id="sh-fechar" style="float:right">✕ Fechar</button>
      <h3>${esc(h.nome)}</h3>
      <div class="stays-totais"><span><b>${h.totalReservas}</b> reserva(s)</span><span>Gasto total: <b>${esc(calMoeda(h.totalGasto, 'BRL'))}</b></span><span>${contatos}</span></div>
      ${resv}</div>`;
    $('#sh-fechar').onclick = () => { det.innerHTML = ''; };
  } catch (e) { det.innerHTML = `<div class="ficha-bloco"><p class="erro">${esc(e.message)}</p></div>`; }
}

// --------- Reservas (Stays): criar + pesquisar ---------
async function renderStaysReservas() {
  const ehAdmin = ESTADO.me.papel === 'admin';
  const c = conteudo();
  c.innerHTML = cabecalho('Reservas (Stays)', 'Pesquise reservas por hóspede e período — e (admin) crie reservas diretas ou bloqueios. Ao vivo da Stays.');

  if (ehAdmin) {
    c.innerHTML += `<details class="cr-box" open><summary class="cr-sum">➕ Criar reserva ou bloqueio</summary>
      <div class="form" style="max-width:680px;margin-top:12px">
        <div class="barra" style="gap:10px">
          <label style="flex:1;min-width:160px">Tipo
            <select id="cr-tipo"><option value="reserva">Reserva direta (com hóspede)</option><option value="bloqueio">Bloqueio de datas</option></select></label>
          <label style="flex:2;min-width:200px">Imóvel <select id="cr-imovel"><option value="">Carregando…</option></select></label>
        </div>
        <div class="barra" style="gap:10px">
          <label style="flex:1;min-width:140px">Check-in <input type="date" id="cr-in"></label>
          <label style="flex:1;min-width:140px">Check-out <input type="date" id="cr-out"></label>
          <label id="cr-guests-l" style="width:130px">Hóspedes <input type="number" id="cr-guests" min="1" value="2"></label>
        </div>
        <div id="cr-hosp">
          <div class="barra" style="gap:14px">
            <label style="flex-direction:row;align-items:center;gap:6px"><input type="radio" name="cr-modo" value="existente" checked style="width:auto"> Hóspede existente</label>
            <label style="flex-direction:row;align-items:center;gap:6px"><input type="radio" name="cr-modo" value="novo" style="width:auto"> Cadastrar novo</label>
          </div>
          <div id="cr-existente">
            <div class="barra"><input id="cr-busca-h" placeholder="Buscar hóspede pelo nome" style="flex:1;min-width:200px"><button type="button" class="btn peq" id="cr-busca-b">Buscar</button></div>
            <div id="cr-h-result"></div>
            <p id="cr-h-sel" class="ok-msg"></p>
          </div>
          <div id="cr-novo" class="hidden">
            <div class="barra" style="gap:10px"><input id="cr-novo-nome" placeholder="Nome completo do hóspede" style="flex:2;min-width:200px"><input id="cr-novo-contato" placeholder="WhatsApp ou e-mail" style="flex:1;min-width:160px"></div>
          </div>
        </div>
        <div class="barra"><button type="button" class="btn secund" id="cr-conferir">Conferir disponibilidade</button></div>
        <div id="cr-resumo"></div>
        <p id="cr-status" class="erro"></p>
      </div></details>`;
  } else {
    c.innerHTML += `<div class="aviso">Apenas administradores criam reservas/bloqueios. Você pode pesquisar as reservas abaixo.</div>`;
  }

  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  c.innerHTML += `<h2 class="titulo" style="font-size:1.1rem;margin-top:24px">Pesquisar reservas</h2>
    <form id="sr-form" class="barra" style="gap:10px">
      <label class="cal-lab">De <input type="date" id="sr-de" value="${calYmd(ini)}"></label>
      <label class="cal-lab">Até <input type="date" id="sr-ate" value="${calYmd(fim)}"></label>
      <input id="sr-q" type="search" placeholder="🔎 Hóspede, imóvel ou nº da reserva" style="flex:1;min-width:200px">
      <button class="btn" type="submit">Buscar</button>
    </form>
    <div id="sr-lista"><p class="vazio">Escolha o período e busque.</p></div>`;

  if (ehAdmin) ligarCriarReserva();
  $('#sr-form').onsubmit = (ev) => { ev.preventDefault(); buscarReservas(); };
  buscarReservas();
}

async function buscarReservas() {
  const de = $('#sr-de').value, ate = $('#sr-ate').value, q = $('#sr-q').value.trim();
  const alvo = $('#sr-lista'); if (!alvo) return;
  if (!de || !ate || de > ate) { alvo.innerHTML = `<p class="erro">Escolha um período válido (De ≤ Até).</p>`; return; }
  alvo.innerHTML = `<p class="vazio">Buscando…</p>`;
  try {
    const r = await api('GET', `/stays/reservas?from=${de}&to=${ate}&busca=${encodeURIComponent(q)}`);
    if (!r.reservas.length) { alvo.innerHTML = `<p class="vazio">Nenhuma reserva no período${q ? ' para “' + esc(q) + '”' : ''}.</p>`; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 8px">${r.reservas.length} resultado(s)</p>
      <table><thead><tr><th>Imóvel</th><th>Hóspede</th><th>Check-in</th><th>Check-out</th><th>Noites</th><th>Plataforma</th><th>Status</th><th>Valor</th><th></th></tr></thead>
      <tbody>${r.reservas.map(x => `<tr>
        <td><b>${esc(x.imovel || '—')}</b></td>
        <td>${esc(x.hospede)}</td>
        <td>${esc(x.checkIn || '')}</td><td>${esc(x.checkOut || '')}</td><td>${x.noites ?? '—'}</td>
        <td>${esc(x.plataformaRotulo || (x.bloqueio ? '—' : ''))}</td>
        <td>${esc(x.statusRotulo)}</td>
        <td>${x.valorTotal != null ? esc(calMoeda(x.valorTotal, x.moeda)) : '—'}</td>
        <td>${x.reservationUrl ? `<a href="${esc(x.reservationUrl)}" target="_blank" rel="noopener">↗</a>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

function ligarCriarReserva() {
  let clienteId = '', conferido = false;
  api('GET', '/stays/imoveis').then(r => {
    const sel = $('#cr-imovel'); if (sel) sel.innerHTML = `<option value="">Escolha o imóvel…</option>` + r.imoveis.map(i => `<option value="${esc(i.idlisting)}">${esc(i.codigo)} · ${esc(i.titulo)}</option>`).join('');
  }).catch(() => { const sel = $('#cr-imovel'); if (sel) sel.innerHTML = `<option value="">(falha ao carregar imóveis)</option>`; });

  const resumo = $('#cr-resumo'), statusP = $('#cr-status');
  const resetConfere = () => { conferido = false; resumo.innerHTML = ''; statusP.textContent = ''; };
  ['cr-tipo', 'cr-imovel', 'cr-in', 'cr-out', 'cr-guests'].forEach(id => { const el = $('#' + id); if (el) el.onchange = resetConfere; });

  const toggleTipo = () => {
    const bloqueio = $('#cr-tipo').value === 'bloqueio';
    $('#cr-hosp').style.display = bloqueio ? 'none' : '';
    $('#cr-guests-l').style.display = bloqueio ? 'none' : '';
    resetConfere();
  };
  $('#cr-tipo').onchange = () => { toggleTipo(); };
  toggleTipo();

  document.querySelectorAll('input[name=cr-modo]').forEach(r => r.onchange = () => {
    const novo = document.querySelector('input[name=cr-modo]:checked').value === 'novo';
    $('#cr-existente').classList.toggle('hidden', novo);
    $('#cr-novo').classList.toggle('hidden', !novo);
    clienteId = ''; $('#cr-h-sel').textContent = '';
  });

  $('#cr-busca-b').onclick = async () => {
    const q = $('#cr-busca-h').value.trim(); const out = $('#cr-h-result');
    if (!q) return; out.innerHTML = `<p class="vazio">Buscando…</p>`;
    try {
      const r = await api('GET', `/stays/clientes?busca=${encodeURIComponent(q)}&limit=8`);
      if (!r.clientes.length) { out.innerHTML = `<p class="vazio">Nenhum hóspede. Use “Cadastrar novo”.</p>`; return; }
      out.innerHTML = r.clientes.map(h => `<button type="button" class="btn peq secund cr-pick" data-id="${esc(h.id)}" data-nome="${esc(h.nome)}" style="margin:3px 4px 0 0">${esc(h.nome)}</button>`).join('');
      out.querySelectorAll('.cr-pick').forEach(b => b.onclick = () => { clienteId = b.dataset.id; $('#cr-h-sel').textContent = '✓ Hóspede selecionado: ' + b.dataset.nome; out.innerHTML = ''; });
    } catch (e) { out.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };

  $('#cr-conferir').onclick = async () => {
    statusP.className = 'erro'; statusP.textContent = '';
    const listingId = $('#cr-imovel').value, ci = $('#cr-in').value, co = $('#cr-out').value;
    if (!listingId || !ci || !co || co <= ci) { statusP.textContent = 'Escolha imóvel e datas válidas (check-out depois do check-in).'; return; }
    resumo.innerHTML = `<p class="vazio">Conferindo disponibilidade…</p>`;
    try {
      const r = await api('GET', `/stays/disponibilidade?listingId=${encodeURIComponent(listingId)}&from=${ci}&to=${co}`);
      const tipo = $('#cr-tipo').value;
      const imovelTxt = $('#cr-imovel').selectedOptions[0].textContent;
      const n = r.noites.length;
      conferido = r.todasLivres;
      resumo.innerHTML = `<div class="cr-resumo ${r.todasLivres ? 'ok' : 'bloq'}">
        <div><b>${tipo === 'bloqueio' ? 'Bloqueio' : 'Reserva direta'}</b> · ${esc(imovelTxt)}</div>
        <div>${esc(ci)} → ${esc(co)} · ${n} noite(s)</div>
        <div>${r.todasLivres ? '✅ Todas as noites livres' : '⛔ Há noite(s) ocupada(s)/fechada(s) no período'}</div>
        ${tipo !== 'bloqueio' && r.totalSugerido ? `<div>Valor sugerido (tarifa): <b>${esc(calMoeda(r.totalSugerido, 'BRL'))}</b> <span class="sub" style="font-size:.8rem">— a Stays calcula o valor final</span></div>` : ''}
        ${r.todasLivres ? `<button type="button" class="btn" id="cr-confirmar" style="margin-top:8px">Confirmar e criar na Stays</button>` : ''}
      </div>`;
      if (r.todasLivres) $('#cr-confirmar').onclick = criar;
    } catch (e) { resumo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };

  const criar = async () => {
    if (!conferido) return;
    const tipo = $('#cr-tipo').value;
    const body = { tipo, listingId: $('#cr-imovel').value, checkInDate: $('#cr-in').value, checkOutDate: $('#cr-out').value };
    if (tipo === 'reserva') {
      body.guests = $('#cr-guests').value;
      const novo = document.querySelector('input[name=cr-modo]:checked').value === 'novo';
      if (novo) {
        const nome = $('#cr-novo-nome').value.trim(); if (!nome) { statusP.textContent = 'Informe o nome do novo hóspede.'; return; }
        body.novoCliente = { nome, contato: $('#cr-novo-contato').value.trim() };
      } else {
        if (!clienteId) { statusP.textContent = 'Selecione um hóspede existente (ou cadastre um novo).'; return; }
        body.clienteId = clienteId;
      }
    }
    const btn = $('#cr-confirmar'); if (btn) { btn.disabled = true; btn.textContent = 'Criando…'; }
    statusP.className = 'erro'; statusP.textContent = '';
    try {
      const r = await api('POST', '/stays/reserva', body);
      const rv = r.reserva || {};
      statusP.className = 'ok-msg';
      statusP.textContent = `✅ ${tipo === 'bloqueio' ? 'Bloqueio' : 'Reserva'} criada na Stays (nº ${rv.id || '—'}) — ${esc(rv.checkIn || '')} a ${esc(rv.checkOut || '')}${rv.valorTotal ? ' · ' + calMoeda(rv.valorTotal, rv.moeda) : ''}. O calendário e os canais são atualizados pela Stays.`;
      resumo.innerHTML = ''; conferido = false; clienteId = '';
      $('#cr-in').value = ''; $('#cr-out').value = ''; $('#cr-busca-h').value = ''; $('#cr-novo-nome').value = ''; $('#cr-novo-contato').value = ''; $('#cr-h-sel').textContent = '';
      buscarReservas();
    } catch (e) {
      statusP.className = 'erro'; statusP.textContent = e.message;
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar e criar na Stays'; }
    }
  };
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

// --------- Mural da equipe (comunicação interna) ---------
async function renderMural() {
  const c = conteudo();
  c.innerHTML = cabecalho('Mural da equipe', 'Avisos, recados e coordenação entre a equipe e os agentes. Todos os logados leem e postam; mensagens fixadas ficam no topo.');
  const opcoesArea = '<option value="">Geral (toda a equipe)</option>' + ESTADO.catalogo.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('');
  const ehAdmin = ESTADO.me.papel === 'admin';
  c.innerHTML += `
    <form id="form-mural" class="mural-form">
      <textarea id="mu-texto" rows="3" placeholder="Escreva um aviso ou recado para a equipe…" required maxlength="4000"></textarea>
      <div class="mural-form-linha">
        <label>Para <select id="mu-area">${opcoesArea}</select></label>
        ${ehAdmin ? '<label class="mural-fixar"><input type="checkbox" id="mu-fixado"> 📌 Fixar no topo</label>' : ''}
        <button class="btn" type="submit">Publicar no mural</button>
      </div>
    </form>
    <div id="mural-lista"><p class="vazio">Carregando…</p></div>`;
  $('#form-mural').onsubmit = async (ev) => {
    ev.preventDefault();
    const texto = $('#mu-texto').value.trim(); if (!texto) return;
    try {
      await api('POST', '/mural', { texto, area: $('#mu-area').value, fixado: ehAdmin && $('#mu-fixado') ? $('#mu-fixado').checked : false });
      $('#form-mural').reset();
      carregarMural();
    } catch (e) { alert(e.message); }
  };
  carregarMural();
}

function muralMsgHtml(x) {
  const ehAdmin = ESTADO.me.papel === 'admin';
  const minha = x.autorEmail && ESTADO.me.email && x.autorEmail === ESTADO.me.email;
  const chips = [
    x.fixado ? '<span class="chip mural-chip-fix">📌 Fixado</span>' : '',
    x.agente ? '<span class="chip mural-chip-agente">🤖 Agente</span>' : '',
    x.area ? `<span class="chip">${esc(nomeArea(x.area))}</span>` : '',
  ].filter(Boolean).join(' ');
  const respostas = (x.respostas || []).map(r => `
    <div class="mural-resp">
      <div class="mural-resp-meta"><b>${esc(r.quem)}</b> · ${dataBr(r.criadoEm)}
        ${(ehAdmin || (r.autorEmail && r.autorEmail === ESTADO.me.email)) ? `<button class="mural-x" data-delresp="${x.id}|${r.id}" title="Excluir resposta">✕</button>` : ''}
      </div>
      <div class="mural-texto">${esc(r.texto).replace(/\n/g, '<br>')}</div>
    </div>`).join('');
  return `<div class="mural-msg${x.fixado ? ' fixada' : ''}" data-msg="${x.id}">
    <div class="mural-cab">
      <b>${esc(x.quem)}</b> ${chips}
      <span class="mural-data">${dataBr(x.criadoEm)}</span>
    </div>
    <div class="mural-texto">${esc(x.texto).replace(/\n/g, '<br>')}</div>
    ${respostas ? `<div class="mural-resps">${respostas}</div>` : ''}
    <div class="mural-acoes">
      <button class="btn peq secund" data-resp="${x.id}">↩ Responder</button>
      ${ehAdmin ? `<button class="btn peq secund" data-fixar="${x.id}" data-val="${x.fixado ? 0 : 1}">${x.fixado ? 'Desafixar' : '📌 Fixar'}</button>` : ''}
      ${(ehAdmin || minha) ? `<button class="btn peq perigo" data-delmsg="${x.id}">Excluir</button>` : ''}
    </div>
    <form class="mural-form-resp hidden" data-formresp="${x.id}">
      <input placeholder="Escreva a resposta…" required maxlength="2000">
      <button class="btn peq" type="submit">Enviar</button>
    </form>
  </div>`;
}

async function carregarMural() {
  const alvo = $('#mural-lista'); if (!alvo) return;
  try {
    const { mensagens } = await api('GET', '/mural');
    alvo.innerHTML = mensagens.length
      ? mensagens.map(muralMsgHtml).join('')
      : '<div class="vazio">Nenhuma mensagem ainda. Publique o primeiro aviso para a equipe!</div>';
    // marcar como visto (badge zera)
    localStorage.setItem('vs_mural_visto', new Date().toISOString());
    atualizarBadgeMural();
    document.querySelectorAll('[data-resp]').forEach(b => b.onclick = () => {
      const f = document.querySelector(`[data-formresp="${b.dataset.resp}"]`);
      f.classList.toggle('hidden'); if (!f.classList.contains('hidden')) f.querySelector('input').focus();
    });
    document.querySelectorAll('[data-formresp]').forEach(f => f.onsubmit = async (ev) => {
      ev.preventDefault();
      const texto = f.querySelector('input').value.trim(); if (!texto) return;
      try { await api('POST', '/mural/' + f.dataset.formresp + '/resposta', { texto }); carregarMural(); } catch (e) { alert(e.message); }
    });
    document.querySelectorAll('[data-fixar]').forEach(b => b.onclick = async () => {
      try { await api('PATCH', '/mural/' + b.dataset.fixar, { fixado: b.dataset.val === '1' }); carregarMural(); } catch (e) { alert(e.message); }
    });
    document.querySelectorAll('[data-delmsg]').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir esta mensagem?')) return;
      try { await api('DELETE', '/mural/' + b.dataset.delmsg); carregarMural(); } catch (e) { alert(e.message); }
    });
    document.querySelectorAll('[data-delresp]').forEach(b => b.onclick = async () => {
      const [msgId, respId] = b.dataset.delresp.split('|');
      try { await api('DELETE', '/mural/' + msgId + '?resposta=' + encodeURIComponent(respId)); carregarMural(); } catch (e) { alert(e.message); }
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
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
