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
  // Login mágico: ?acesso=<token> (link enviado pelo admin via WhatsApp) autentica e entra direto.
  try {
    const p = new URLSearchParams(location.search);
    const acesso = p.get('acesso');
    if (acesso) {
      p.delete('acesso');
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p.toString() : ''));
      try { const r = await api('POST', '/login-magico', { token: acesso }); aposLogin(r); return; } catch (_) {}
    }
  } catch (_) {}
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
  iniciarPolling();
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
// Constrói a lista de itens do menu (grupos + itens) conforme as áreas do usuário.
// Usada pelo menu lateral E pela home-lançador (grade de ícones no estilo do app do hóspede).
function construirItensMenu() {
  const ehAdmin = ESTADO.me.papel === 'admin';
  const tem = (a) => ehAdmin || ESTADO.areas.includes('*') || ESTADO.areas.includes(a);
  const itens = [
    { grupo: 'Início' },
    { id: 'visao', rot: '🏠 Visão geral' },
    { id: 'mural', rot: '💬 Mural da equipe', badge: 'mural' },
    { id: 'faq', rot: '❓ FAQ oficial' },
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
  if (tem('concierge') || tem('vendas')) hosp.push({ id: 'concierge', rot: '🛎️ Central do concierge' });
  if (tem('concierge') || tem('vendas') || tem('marketing')) hosp.push({ id: 'pos-estadia', rot: '👋 Pós-estadia' });
  if (tem('concierge') || tem('vendas')) hosp.push({ id: 'hospede-pedidos', rot: '📨 Pedidos de hóspedes' });
  if (ESTADO.painelDisp.precheckins) hosp.push({ id: 'precheckins', rot: '🛬 Pré-check-ins' });
  if (tem('financeiro') || tem('concierge') || tem('vendas')) hosp.push({ id: 'hospede-conta', rot: '💳 Conta corrente' });
  if (ehAdmin) hosp.push({ id: 'hospede-info', rot: '🔑 Área do Hóspede' });
  if (hosp.length) itens.push({ grupo: 'Hóspedes' }, ...hosp);
  const gestao = [];
  if (ehAdmin || tem('ceo')) gestao.push({ id: 'metas', rot: '🎯 Metas (OKR)' });
  if (tem('financeiro') || tem('ceo')) gestao.push({ id: 'contas-pagar', rot: '💰 Contas a pagar' });
  if (tem('financeiro') || tem('ceo')) gestao.push({ id: 'dre', rot: '📊 DRE por imóvel' });
  if (tem('revenue') || tem('ceo') || tem('financeiro')) gestao.push({ id: 'revenue', rot: '📈 Revenue' });
  if (tem('revenue') || tem('ceo') || tem('vendas')) gestao.push({ id: 'datas-quentes', rot: '🔥 Datas quentes' });
  if (tem('marketing') || tem('vendas') || tem('ceo')) gestao.push({ id: 'mkt-conversao', rot: '🎯 Conversão (marketing)' });
  if (tem('marketing') || tem('vendas') || tem('concierge') || tem('ceo')) gestao.push({ id: 'materiais', rot: '🎨 Materiais de marca' });
  if (tem('marketing') || tem('vendas') || tem('ceo')) gestao.push({ id: 'editorial', rot: '🗓️ Calendário editorial' });
  if (tem('marketing') || tem('vendas') || tem('concierge') || tem('ceo')) gestao.push({ id: 'depoimentos', rot: '💬 Depoimentos' });
  if (tem('marketing') || tem('ceo')) gestao.push({ id: 'redes', rot: '📱 Redes sociais' });
  if (tem('obras') || tem('ceo')) gestao.push({ id: 'obras', rot: '🏗️ Obras & Decoração' });
  if (tem('juridico') || tem('ceo')) gestao.push({ id: 'prazos-juridicos', rot: '⚖️ Prazos jurídicos' });
  if (tem('juridico') || tem('ceo')) gestao.push({ id: 'contratos', rot: '📑 Contratos' });
  if (tem('juridico') || tem('ceo')) gestao.push({ id: 'lgpd', rot: '🔒 Consentimentos LGPD' });
  if (tem('contador') || tem('financeiro') || tem('ceo')) gestao.push({ id: 'fiscal', rot: '🧾 Calendário fiscal' });
  if (tem('compras') || tem('financeiro') || tem('ceo')) gestao.push({ id: 'compras-precos', rot: '🛍️ Histórico de preços' });
  if (gestao.length) itens.push({ grupo: 'Gestão' }, ...gestao);
  itens.push({ grupo: 'Operação' });
  itens.push({ id: 'limpezas', rot: '🧹 Limpezas de hoje' });
  itens.push({ id: 'compras', rot: '🛒 Lista de compras' });
  itens.push({ id: 'manutencao', rot: '🔧 Lista de manutenção' });
  itens.push({ id: 'manutencao-chamados', rot: '🛠️ Chamados de manutenção' });
  if (tem('manutencao') || tem('operacoes') || tem('obras') || tem('ceo')) itens.push({ id: 'ativos', rot: '🧰 Equipamentos' });
  if (tem('operacoes') || tem('compras') || tem('ceo')) itens.push({ id: 'estoque', rot: '🧴 Estoque & enxoval' });
  // Pendências é restrita à área CEO (admin vê tudo); demais não veem o item.
  if (tem('ceo')) itens.push({ id: 'pendencias', rot: '✅ Pendências' });
  itens.push({ id: 'agenda', rot: '📅 Agenda (eventos)' });
  if (ESTADO.painelDisp.chamados) itens.push({ id: 'chamados', rot: '🛎️ Chamados do site' });
  itens.push({ grupo: 'Relatórios & Gestão' });
  itens.push({ id: 'relatorios', rot: '📄 Relatórios & Entregas' });
  if (ehAdmin || tem('ceo')) itens.push({ id: 'acessos-hospede', rot: '🔑 Acessos do Hóspede' });
  itens.push({ id: 'publicar', rot: '➕ Publicar entrega' });
  if (ESTADO.podeEstat) itens.push({ id: 'estatisticas', rot: '📊 Visitas do site' });
  if (ESTADO.painelDisp.eventos) itens.push({ id: 'eventos', rot: '⚡ Eventos (Stays)' });
  itens.push({ grupo: 'Administração' });
  if (ehAdmin) itens.push({ id: 'usuarios', rot: '👤 Usuários' });
  if (ehAdmin) itens.push({ id: 'automacoes', rot: '🚦 Automações' });
  if (ehAdmin) itens.push({ id: 'auditoria', rot: '📜 Auditoria' });
  itens.push({ id: 'conta', rot: '⚙️ Minha conta' });
  itens.push({ grupo: 'Links' });
  itens.push({ rot: '🏨 Painel da Stays ↗', url: 'https://ville.stays.com.br/i/home' });
  itens.push({ rot: '🌐 Site público ↗', url: 'https://villelastay.com.br' });
  itens.push({ rot: '🔑 Área do Hóspede ↗', url: 'https://minha.villelastay.com.br/hospede' });
  return itens;
}

// Separa o emoji (ícone) do rótulo de texto: "📆 Calendário" → { ico: '📆', txt: 'Calendário' }.
function separarIcone(rot) {
  const m = String(rot || '').match(/^(\S+)\s+(.*)$/);
  return m ? { ico: m[1], txt: m[2] } : { ico: '•', txt: String(rot || '') };
}

// Home-lançador: grade de ícones no estilo do app do hóspede (painel escuro da marca).
function montarLauncher(alvoSel) {
  const alvo = $(alvoSel); if (!alvo) return;
  const itens = construirItensMenu();
  let html = '', grupoAberto = false, temItem = false;
  const fechaGrupo = () => { if (grupoAberto) { html += '</div></div>'; grupoAberto = false; } };
  for (const it of itens) {
    if (it.grupo) {
      fechaGrupo();
      // pula o grupo "Início" na grade (já estamos na home)
      if (it.grupo === 'Início') { grupoAberto = false; continue; }
      html += `<div class="lc-grupo"><div class="lc-titulo">${esc(it.grupo)}</div><div class="lc-itens">`;
      grupoAberto = true; continue;
    }
    if (it.grupo === undefined && !grupoAberto && it.id) continue; // itens do "Início" pulados
    const { ico, txt } = separarIcone(it.rot);
    if (it.url) {
      html += `<a class="lc-tile" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer"><span class="lc-ico">${ico}</span><span class="lc-rot">${esc(txt)}</span></a>`;
    } else {
      html += `<button type="button" class="lc-tile" data-nav="${esc(it.id)}"><span class="lc-ico">${ico}${it.badge ? '<span class="lc-badge hidden" data-badge="mural-lc"></span>' : ''}</span><span class="lc-rot">${esc(txt)}</span></button>`;
    }
    temItem = true;
  }
  fechaGrupo();
  alvo.innerHTML = temItem ? html : '';
  alvo.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => navegar(b.dataset.nav));
}

function montarMenu() {
  const m = $('#menu'); m.innerHTML = '';
  const itens = construirItensMenu();
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

// Atualização ao vivo (leve): a cada 30s atualiza o badge do mural e, se a tela do mural
// estiver aberta, recarrega as mensagens. Pausa quando a aba está em segundo plano.
let _pollTimer = null;
function iniciarPolling() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(() => {
    if (document.hidden || !ESTADO.me) return;
    if (ESTADO.secao === 'mural') carregarMural();
    else atualizarBadgeMural();
  }, 30000);
}

// Badge de mensagens novas no mural (menu lateral + tile do lançador)
async function atualizarBadgeMural() {
  try {
    const { mensagens } = await api('GET', '/mural');
    const visto = localStorage.getItem('vs_mural_visto') || '';
    const novas = mensagens.filter(x => !visto || x.criadoEm > visto).length;
    const alvos = document.querySelectorAll('[data-badge="mural"], [data-badge="mural-lc"]');
    if (!alvos.length) return;
    alvos.forEach(s => {
      if (novas > 0 && ESTADO.secao !== 'mural') { s.textContent = novas > 99 ? '99+' : novas; s.classList.remove('hidden'); }
      else s.classList.add('hidden');
    });
  } catch (_) {}
}

// --------- Notificações push da equipe (PWA) ---------
function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function ligarPush() {
  const area = $('#push-area'); if (!area) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { area.innerHTML = '<p class="sub" style="margin:0">Este dispositivo/navegador não suporta notificações.</p>'; return; }
  let chave = '';
  try { chave = (await api('GET', '/push/chave')).publicKey; } catch (_) {}
  if (!chave) { area.innerHTML = '<p class="sub" style="margin:0">Notificações ainda não configuradas no servidor (falta a chave VAPID).</p>'; return; }
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  const btn = $('#push-btn');
  if (sub) { btn.textContent = '🔕 Desativar notificações'; btn.className = 'btn perigo peq'; }
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      if (sub || (reg && await reg.pushManager.getSubscription())) {
        const s = await reg.pushManager.getSubscription();
        if (s) { await api('POST', '/push/unsubscribe', { endpoint: s.endpoint }); await s.unsubscribe(); }
        area.innerHTML = '<button class="btn secund peq" id="push-btn">Ativar notificações</button>'; ligarPush();
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { alert('Permissão de notificação negada.'); btn.disabled = false; return; }
        const nova = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(chave) });
        await api('POST', '/push/subscribe', { subscription: nova });
        btn.textContent = '🔕 Desativar notificações'; btn.className = 'btn perigo peq'; btn.disabled = false;
      }
    } catch (e) { alert('Falha: ' + e.message); btn.disabled = false; }
  };
}

function navegar(secao) {
  ESTADO.secao = secao;
  document.querySelectorAll('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.id === secao));
  const menu = $('#menu'); if (menu) menu.classList.remove('aberto'); // fecha a gaveta no mobile ao navegar
  window.scrollTo(0, 0);
  const rotas = { visao: renderVisao, mural: renderMural, faq: renderFAQ, concierge: renderConcierge, 'pos-estadia': renderPosEstadia, 'contas-pagar': renderContasPagar, dre: renderDRE, revenue: renderRevenue, 'mkt-conversao': renderMktConversao, obras: renderObras, ativos: renderAtivos, estoque: renderEstoque, materiais: renderMateriais, editorial: renderEditorial, depoimentos: renderDepoimentos, redes: renderRedes, contratos: renderContratos, lgpd: renderLGPD, fiscal: renderFiscal, 'compras-precos': renderComprasPrecos, metas: renderMetas, 'datas-quentes': renderDatasQuentes, automacoes: renderAutomacoes, auditoria: renderAuditoria, 'acessos-hospede': renderAcessosHospede, 'prazos-juridicos': renderPrazosJuridicos, limpezas: renderLimpezas, 'manutencao-chamados': renderChamadosManutencao, relatorios: renderRelatorios, publicar: renderPublicar, calendario: renderCalendario, 'stays-hospedes': renderStaysHospedes, 'stays-reservas': renderStaysReservas, crm: renderCRM, compras: () => renderLista('compras', 'Lista de compras'), manutencao: () => renderLista('manutencao', 'Lista de manutenção'), pendencias: () => renderLista('pendencias', 'Pendências', { semQtd: true, rotuloNome: 'Pendência *', sub: 'Pendências e tarefas em aberto. Qualquer pessoa da equipe pode incluir e dar baixa.' }), agenda: renderAgenda, leads: () => renderPainel('leads', 'Leads'), precheckins: () => renderPainel('precheckins', 'Pré-check-ins'), chamados: () => renderPainel('chamados', 'Chamados'), eventos: () => renderPainel('eventos', 'Eventos (Stays)'), estatisticas: renderEstatisticas, 'hospede-info': renderHospedeInfo, 'hospede-pedidos': renderHospedePedidos, 'hospede-fidelidade': renderHospedeFidelidade, 'hospede-conta': renderHospedeConta, usuarios: renderUsuarios, conta: renderConta };
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
// Visão geral = COCKPIT do dia: KPIs vivos (Stays + CRM + listas) com cartões clicáveis.
async function renderVisao() {
  const c = conteudo();
  const h = new Date().getHours();
  const sauda = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = String(ESTADO.me.nome || '').split(' ')[0];
  c.innerHTML = cabecalho(`${sauda}, ${nome}!`, 'Cockpit do dia — números ao vivo da operação.');
  c.innerHTML += `<form id="busca-home" class="barra">
    <input id="busca-home-input" type="search" placeholder="🔎 Buscar em todos os relatórios e entregas…" style="flex:1;min-width:220px">
    <button class="btn" type="submit">Buscar</button>
  </form>
  <div id="ck-launcher" class="launcher"></div>
  <div id="ck-cards" class="cards"><div class="card"><div class="n">…</div><div class="rot">Carregando o dia</div></div></div>
  <div id="ck-detalhe"></div>
  <div id="ck-mural"></div>
  <h2 class="titulo" style="font-size:1.15rem">Últimas entregas</h2><div id="ck-entregas" class="vazio">Carregando…</div>`;
  $('#busca-home').onsubmit = (ev) => { ev.preventDefault(); ESTADO.buscaPrefill = $('#busca-home-input').value; navegar('relatorios'); };
  montarLauncher('#ck-launcher');
  atualizarBadgeMural();

  // Entregas (rápido) e cockpit (Stays, pode demorar) carregam em paralelo.
  api('GET', '/visao-geral').then(vg => {
    const alvo = $('#ck-entregas'); if (!alvo) return;
    if (!vg.ultimos.length) { alvo.innerHTML = 'Ainda não há entregas publicadas.'; return; }
    alvo.className = 'lista';
    alvo.innerHTML = vg.ultimos.map(itemRelatorioHtml).join('');
    ligarAcoesRelatorio();
  }).catch(() => {});

  try {
    const ck = await api('GET', '/cockpit');
    const cards = [];
    const card = (n, rot, nav, cor) => cards.push(`<div class="card card-nav" data-nav="${nav}"><div class="n"${cor ? ` style="color:${cor}"` : ''}>${n}</div><div class="rot">${rot}</div></div>`);
    if (ck.hoje) {
      card(ck.hoje.chegadas.length, '🛬 Chegadas hoje', 'calendario');
      card(ck.hoje.saidas.length, '🧳 Saídas hoje', 'calendario');
      card(ck.hoje.ocupacaoPct + '%', `🛏️ Ocupação (${ck.hoje.ocupadas}/${ck.hoje.totalUnidades})`, 'calendario');
      const nLimp = ck.hoje.chegadas.length + ck.hoje.saidas.length;
      card(`${ck.limpezasConfirmadas || 0}/${nLimp}`, '🧹 Limpezas de hoje', 'limpezas', (ck.limpezasConfirmadas || 0) >= nLimp && nLimp > 0 ? 'var(--ok)' : undefined);
    }
    if (ck.mes) card('R$ ' + Number(ck.mes.receitaLiquida).toLocaleString('pt-BR'), `💰 Líquido do mês (${ck.mes.reservas} reservas, por check-in)`, 'relatorios');
    if (ck.followupsVencidos != null) card(ck.followupsVencidos, '⏰ Follow-ups vencidos (CRM)', 'crm', ck.followupsVencidos > 0 ? 'var(--alerta)' : 'var(--ok)');
    if (ck.pedidosHospedeAbertos != null && (ESTADO.me.papel === 'admin' || ESTADO.areas.includes('concierge') || ESTADO.areas.includes('vendas') || ESTADO.areas.includes('*')))
      card(ck.pedidosHospedeAbertos, '📨 Pedidos de hóspedes abertos', 'hospede-pedidos', ck.pedidosHospedeAbertos > 0 ? 'var(--cerrado)' : undefined);
    if (ck.listas) {
      card(ck.listas.compras, '🛒 Itens na lista de compras', 'compras');
      card(ck.listas.manutencao, '🔧 Itens de manutenção', 'manutencao');
      if (ck.listas.pendencias != null) card(ck.listas.pendencias, '✅ Pendências (CEO)', 'pendencias');
    }
    if (ck.chamadosAbertos != null) card(ck.chamadosAbertos, '🛠️ Chamados de manutenção abertos', 'manutencao-chamados', ck.chamadosAbertos > 0 ? 'var(--cerrado)' : 'var(--ok)');
    $('#ck-cards').innerHTML = cards.join('') || '<div class="vazio">Sem dados no momento.</div>';
    document.querySelectorAll('.card-nav').forEach(el => el.onclick = () => navegar(el.dataset.nav));

    // Detalhe de chegadas e saídas do dia
    if (ck.hoje && (ck.hoje.chegadas.length || ck.hoje.saidas.length)) {
      const li = (r) => `<div class="kv"><span>${esc(r.imovel)} · ${esc(r.imovelTitulo)}</span><b>${esc(r.hospede)}${r.hospedes ? ' · ' + r.hospedes + ' hósp.' : ''}</b></div>`;
      $('#ck-detalhe').innerHTML = `<div class="ficha" style="margin-bottom:20px">
        <div class="ficha-col"><div class="ficha-bloco"><h3>🛬 Chegadas de hoje (${ck.hoje.chegadas.length})</h3>${ck.hoje.chegadas.map(li).join('') || '<p class="sub" style="margin:0">Nenhuma chegada hoje.</p>'}</div></div>
        <div class="ficha-col"><div class="ficha-bloco"><h3>🧳 Saídas de hoje (${ck.hoje.saidas.length})</h3>${ck.hoje.saidas.map(li).join('') || '<p class="sub" style="margin:0">Nenhuma saída hoje.</p>'}</div></div>
      </div>`;
    }
    // Avisos fixados do mural
    if (ck.muralFixadas && ck.muralFixadas.length) {
      $('#ck-mural').innerHTML = ck.muralFixadas.map(m => `<div class="mural-msg fixada" style="cursor:pointer" data-nav="mural">
        <div class="mural-cab"><b>${esc(m.quem)}</b> <span class="chip mural-chip-fix">📌 Aviso</span> <span class="mural-data">${dataBr(m.criadoEm)}</span></div>
        <div class="mural-texto">${esc(m.texto)}</div></div>`).join('');
      $('#ck-mural').querySelectorAll('[data-nav]').forEach(el => el.onclick = () => navegar('mural'));
    }
    if (ck.staysIndisponivel) $('#ck-cards').innerHTML += '<div class="vazio">⚠️ Stays indisponível agora — os números do dia voltam sozinhos.</div>';
  } catch (e) { $('#ck-cards').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Limpezas de hoje (espelho do painel de limpeza, com confirmação) ---------
async function renderLimpezas() {
  const c = conteudo();
  c.innerHTML = cabecalho('Limpezas de hoje', 'Faxinas pós-checkout e preparações pré-checkin do dia (ao vivo da Stays). Toque em Concluído ao terminar cada unidade.') + `
    <div class="barra">
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Dia
        <input type="date" id="lp-dia" value="${hojeInput()}"></label>
      <button class="btn secund peq" id="lp-atualizar">Atualizar</button>
    </div>
    <div id="lp-lista"><p class="vazio">Carregando…</p></div>`;
  $('#lp-dia').onchange = carregarLimpezas;
  $('#lp-atualizar').onclick = carregarLimpezas;
  carregarLimpezas();
}
function hojeInput() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
async function carregarLimpezas() {
  const alvo = $('#lp-lista'); if (!alvo) return;
  const dia = $('#lp-dia').value || hojeInput();
  try {
    const { tarefas, concluidas } = await api('GET', '/limpezas?dia=' + dia);
    if (!tarefas.length) { alvo.innerHTML = '<div class="vazio">Sem limpezas neste dia — nenhuma chegada ou saída. 🎉</div>'; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${concluidas}/${tarefas.length} concluída(s)</p>` + tarefas.map(t => `
      <div class="linha-item" style="${t.concluida ? 'opacity:.65' : ''}">
        <span class="qtd">${t.tipo === 'faxina' ? '🧹 Faxina' : '🛏️ Preparação'}</span>
        <span class="nome">${esc(t.codigo)} · ${esc(t.titulo)} <span class="obs">${t.tipo === 'faxina' ? 'saída' : 'chegada'} de ${esc(t.hospede)}${t.hospedes ? ' (' + t.hospedes + ' hósp.)' : ''}</span></span>
        <span class="quem">${t.concluida ? '✅ ' + esc(t.quem) + ' · ' + dataBr(t.quando) : 'pendente'}</span>
        <div class="acoes" style="grid-column:2;grid-row:1/span 3">
          <button class="btn peq secund" data-fotos="limpeza:${dia}|${esc(t.codigo)}|${t.tipo}" data-tit="${esc(t.codigo)} · ${t.tipo === 'faxina' ? 'faxina' : 'preparação'}">📷</button>
          <button class="btn peq ${t.concluida ? 'secund' : ''}" data-cod="${esc(t.codigo)}" data-tipo="${t.tipo}" data-desfazer="${t.concluida ? 1 : 0}">${t.concluida ? 'Desfazer' : 'Concluído ✓'}</button>
        </div>
      </div>`).join('');
    alvo.querySelectorAll('button[data-cod]').forEach(b => b.onclick = async () => {
      try {
        await api('POST', '/limpezas/confirmar', { dia, codigo: b.dataset.cod, tipo: b.dataset.tipo, desfazer: b.dataset.desfazer === '1' });
        carregarLimpezas();
      } catch (e) { alert(e.message); }
    });
    alvo.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => { const i = b.dataset.fotos.indexOf(':'); abrirFotosModal(b.dataset.fotos.slice(0, i), b.dataset.fotos.slice(i + 1), b.dataset.tit); });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Fotos (reaproveitável: chamados, obras, limpeza) ---------
// Lê e converte um arquivo de imagem em base64 (sem o prefixo data:).
function arquivoParaBase64(file) {
  return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(file); });
}
async function abrirFotosModal(entidade, entidadeId, titulo) {
  const antigo = document.querySelector('.cal-modal'); if (antigo) antigo.remove();
  const modal = document.createElement('div'); modal.className = 'cal-modal';
  modal.innerHTML = `<div class="cal-modal-cx" style="max-width:560px">
    <button class="cal-modal-x" id="ft-x">✕</button>
    <h3>📷 Fotos — ${esc(titulo || '')}</h3>
    <label class="btn peq" style="display:inline-block;cursor:pointer">➕ Adicionar foto<input type="file" id="ft-input" accept="image/*" capture="environment" style="display:none"></label>
    <p id="ft-msg" class="sub" style="margin:8px 0 0"></p>
    <div id="ft-grade" class="ft-grade" style="margin-top:12px"><p class="vazio">Carregando…</p></div>
  </div>`;
  document.body.appendChild(modal);
  const fechar = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) fechar(); };
  $('#ft-x').onclick = fechar;
  const carregar = async () => {
    try {
      const { fotos } = await api('GET', `/fotos?entidade=${encodeURIComponent(entidade)}&entidadeId=${encodeURIComponent(entidadeId)}`);
      const g = $('#ft-grade'); if (!g) return;
      g.innerHTML = fotos.length ? fotos.map(f => `<div class="ft-item">
        <a href="/staff/api/fotos/${f.id}/arquivo" target="_blank" rel="noopener"><img src="/staff/api/fotos/${f.id}/arquivo" alt="${esc(f.legenda || '')}" loading="lazy"></a>
        <button class="ft-del" data-del-ft="${f.id}" title="Excluir">✕</button>
      </div>`).join('') : '<p class="vazio">Sem fotos ainda. Toque em “Adicionar foto”.</p>';
      g.querySelectorAll('[data-del-ft]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta foto?')) return; try { await api('DELETE', '/fotos/' + b.dataset.delFt); carregar(); atualizarContadorFotos(entidade, entidadeId); } catch (e) { alert(e.message); } });
    } catch (e) { $('#ft-grade').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };
  $('#ft-input').onchange = async (ev) => {
    const file = ev.target.files[0]; if (!file) return;
    const msg = $('#ft-msg'); msg.textContent = 'Enviando…';
    try {
      if (file.size > 6 * 1024 * 1024) throw new Error('Imagem acima de 6 MB.');
      const base64 = await arquivoParaBase64(file);
      await api('POST', '/fotos', { entidade, entidadeId, nomeArquivo: file.name, base64 });
      msg.textContent = ''; ev.target.value = ''; carregar(); atualizarContadorFotos(entidade, entidadeId);
    } catch (e) { msg.textContent = e.message; }
  };
  carregar();
}
// Atualiza o rótulo "📷 N" do botão da entidade após adicionar/remover foto.
async function atualizarContadorFotos(entidade, entidadeId) {
  try {
    const { fotos } = await api('GET', `/fotos?entidade=${encodeURIComponent(entidade)}&entidadeId=${encodeURIComponent(entidadeId)}`);
    const b = document.querySelector(`[data-fotos="${entidade}:${entidadeId}"]`);
    if (b) b.textContent = '📷 ' + fotos.length;
  } catch (_) {}
}

// --------- Chamados de manutenção (quadro por status, com técnico e custo) ---------
const CH_COLS = [
  { id: 'aberto', rot: '🔴 Aberto' }, { id: 'agendado', rot: '📅 Agendado' },
  { id: 'em_execucao', rot: '🛠️ Em execução' }, { id: 'concluido', rot: '✅ Concluído' },
];
async function renderChamadosManutencao() {
  const c = conteudo();
  c.innerHTML = cabecalho('Chamados de manutenção', 'Do problema ao conserto: aberto → agendado → em execução → concluído, com técnico e custo.') + `
    <details class="cr-box" id="ch-box"><summary class="cr-sum">➕ Novo chamado</summary>
      <form class="form" id="ch-form" style="max-width:640px;margin-top:12px">
        <input type="hidden" id="ch-id">
        <label>Título * <input id="ch-titulo" required maxlength="160" placeholder="ex.: Chuveiro da Suíte Master pingando"></label>
        <label>Casa / unidade <input id="ch-casa" maxlength="80" placeholder="ex.: Casa Modernista, Villa Kubitschek…"></label>
        <label>Descrição <textarea id="ch-desc" rows="2" maxlength="1000"></textarea></label>
        <label>Técnico / responsável <input id="ch-tecnico" maxlength="80" placeholder="ex.: Rosivaldo, Julio, Antônio…"></label>
        <div class="hi-grid">
          <label>Custo (R$) <input id="ch-custo" type="number" min="0" step="0.01" placeholder="deixe vazio se ainda não sabe"></label>
          <label>Equipamento (opcional) <select id="ch-ativo"><option value="">— nenhum —</option></select></label>
        </div>
        <button class="btn" type="submit" id="ch-salvar">Abrir chamado</button>
      </form>
    </details>
    <div id="ch-board" class="kanban"><p class="vazio">Carregando…</p></div>`;
  try { const { ativos } = await api('GET', '/ativos'); $('#ch-ativo').innerHTML = '<option value="">— nenhum —</option>' + ativos.map(a => `<option value="${a.id}">${esc(a.nome)}${a.casa ? ' · ' + esc(a.casa) : ''}</option>`).join(''); } catch (_) {}
  $('#ch-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { titulo: $('#ch-titulo').value.trim(), casa: $('#ch-casa').value.trim(), descricao: $('#ch-desc').value.trim(), tecnico: $('#ch-tecnico').value.trim(), custo: $('#ch-custo').value, ativoId: $('#ch-ativo').value };
    try {
      const id = $('#ch-id').value;
      if (id) await api('PATCH', '/manutencao/chamados/' + id, corpo);
      else await api('POST', '/manutencao/chamados', corpo);
      $('#ch-form').reset(); $('#ch-id').value = ''; $('#ch-salvar').textContent = 'Abrir chamado'; $('#ch-box').open = false;
      carregarChamados();
    } catch (e) { alert(e.message); }
  };
  carregarChamados();
}
async function carregarChamados() {
  const board = $('#ch-board'); if (!board) return;
  try {
    const { chamados } = await api('GET', '/manutencao/chamados');
    const porCol = {}; CH_COLS.forEach(col => porCol[col.id] = []);
    chamados.forEach(ch => (porCol[ch.status] || porCol.aberto).push(ch));
    const opcoesStatus = (atual) => CH_COLS.map(col => `<option value="${col.id}" ${col.id === atual ? 'selected' : ''}>${col.rot}</option>`).join('');
    board.innerHTML = CH_COLS.map(col => {
      const lista = porCol[col.id];
      const custo = lista.reduce((s, ch) => s + (Number(ch.custo) || 0), 0);
      return `<div class="col">
        <div class="col-head"><span>${col.rot}</span><span class="col-n">${lista.length}</span></div>
        ${custo ? `<div class="col-valor">R$ ${custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>` : ''}
        <div class="col-cards">${lista.map(ch => `
          <div class="kard" style="cursor:default">
            <div class="kard-nome">${esc(ch.titulo)}</div>
            <div class="kard-meta">${ch.casa ? `<span class="chip">${esc(ch.casa)}</span>` : ''}${ch.custo != null ? `<span class="chip">R$ ${Number(ch.custo).toLocaleString('pt-BR')}</span>` : ''}</div>
            ${ch.tecnico ? `<div class="kard-acao">👷 ${esc(ch.tecnico)}</div>` : ''}
            <div class="kard-origem">${esc(ch.quem)} · ${dataBr(ch.criadoEm)}</div>
            <div class="acoes" style="margin-top:8px">
              <select data-mover="${ch.id}" style="font-size:.78rem;padding:4px 6px">${opcoesStatus(ch.status)}</select>
              <button class="btn peq secund" data-fotos="chamado:${ch.id}" data-tit="${esc(ch.titulo)}">📷</button>
              <button class="btn peq secund" data-editar="${ch.id}">Editar</button>
              <button class="btn peq perigo" data-remover="${ch.id}">✕</button>
            </div>
          </div>`).join('') || '<div class="col-vazio">—</div>'}</div>
      </div>`;
    }).join('');
    board.querySelectorAll('[data-mover]').forEach(s => s.onchange = async () => {
      try { await api('PATCH', '/manutencao/chamados/' + s.dataset.mover, { status: s.value }); carregarChamados(); } catch (e) { alert(e.message); }
    });
    board.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => {
      const ch = chamados.find(x => x.id === b.dataset.editar); if (!ch) return;
      $('#ch-id').value = ch.id; $('#ch-titulo').value = ch.titulo; $('#ch-casa').value = ch.casa || '';
      $('#ch-desc').value = ch.descricao || ''; $('#ch-tecnico').value = ch.tecnico || ''; $('#ch-custo').value = ch.custo != null ? ch.custo : '';
      if ($('#ch-ativo')) $('#ch-ativo').value = ch.ativoId || '';
      $('#ch-salvar').textContent = 'Salvar alterações'; $('#ch-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    board.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => { const [ent, eid] = b.dataset.fotos.split(':'); abrirFotosModal(ent, eid, b.dataset.tit); });
    board.querySelectorAll('[data-remover]').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir este chamado?')) return;
      try { await api('DELETE', '/manutencao/chamados/' + b.dataset.remover); carregarChamados(); } catch (e) { alert(e.message); }
    });
  } catch (e) { board.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
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

// --------- FAQ oficial pesquisável ---------
async function renderFAQ() {
  const c = conteudo();
  c.innerHTML = cabecalho('FAQ oficial', 'Respostas padrão da Villela Stay para dúvidas de hóspedes e leads. Busque e copie a resposta para usar em qualquer canal.') + `
    <div class="barra"><input id="fq-busca" type="search" placeholder="🔎 Buscar pergunta ou resposta…" style="flex:1;min-width:220px" autofocus></div>
    <div id="fq-lista"><p class="vazio">Carregando…</p></div>`;
  let itens = [];
  try { itens = (await api('GET', '/faq')).itens; } catch (e) { $('#fq-lista').innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  const render = () => {
    const q = normaliza($('#fq-busca').value).trim();
    const termos = q ? q.split(/\s+/) : [];
    const filtrados = itens.filter(x => { if (!termos.length) return true; const alvo = normaliza(x.pergunta + ' ' + x.resposta + ' ' + x.categoria); return termos.every(t => alvo.includes(t)); });
    if (!filtrados.length) { $('#fq-lista').innerHTML = `<div class="vazio">${itens.length ? 'Nada encontrado.' : 'FAQ ainda não carregado. Peça ao marketing para publicar o FAQ oficial.'}</div>`; return; }
    // agrupa por categoria
    const cats = {}; filtrados.forEach(x => { (cats[x.categoria || 'Geral'] = cats[x.categoria || 'Geral'] || []).push(x); });
    $('#fq-lista').innerHTML = `<p class="sub" style="margin:0 0 10px">${filtrados.length} pergunta(s)</p>` + Object.entries(cats).map(([cat, arr]) => `
      <h3 style="color:var(--petroleo);margin:16px 0 8px">${esc(cat)}</h3>
      ${arr.map(x => `<details class="fq-item"><summary>${esc(x.pergunta)}</summary>
        <div class="fq-resp">${mdParaHtml(x.resposta)}</div>
        <button class="btn peq secund" data-copy-fq="${x.id}">📋 Copiar resposta</button></details>`).join('')}`).join('');
    $('#fq-lista').querySelectorAll('[data-copy-fq]').forEach(b => b.onclick = () => { const x = itens.find(i => i.id === b.dataset.copyFq); navigator.clipboard.writeText(x.resposta).then(() => { b.textContent = '✓ Copiado'; setTimeout(() => b.textContent = '📋 Copiar resposta', 1500); }); });
  };
  $('#fq-busca').oninput = render;
  render();
}

// --------- Pós-estadia (check-outs recentes + status de avaliação) ---------
async function renderPosEstadia() {
  const c = conteudo();
  c.innerHTML = cabecalho('Pós-estadia', 'Check-outs recentes e quem ainda não avaliou — para o concierge pedir a avaliação e estimular o retorno.') + `
    <div class="barra"><label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Últimos
      <select id="pe-dias"><option value="7">7 dias</option><option value="14" selected>14 dias</option><option value="30">30 dias</option></select></label>
      <button class="btn secund peq" id="pe-atualizar">Atualizar</button></div>
    <div id="pe-lista"><p class="vazio">Carregando…</p></div>`;
  $('#pe-dias').onchange = carregarPosEstadia;
  $('#pe-atualizar').onclick = carregarPosEstadia;
  carregarPosEstadia();
}
async function carregarPosEstadia() {
  const alvo = $('#pe-lista'); if (!alvo) return;
  try {
    const { saidas, semAvaliacao } = await api('GET', '/concierge/pos-estadia?dias=' + ($('#pe-dias').value || 14));
    if (!saidas.length) { alvo.innerHTML = '<div class="vazio">Nenhum check-out no período.</div>'; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${saidas.length} check-out(s) · ${semAvaliacao} sem avaliação</p>` + saidas.map(s => `
      <div class="linha-item" style="${s.avaliou ? '' : 'border-left:3px solid var(--cerrado)'}">
        <span class="qtd">${esc((s.checkOut || '').slice(8, 10) + '/' + (s.checkOut || '').slice(5, 7))}</span>
        <span class="nome">${esc(s.imovel)} · ${esc(s.hospede)} <span class="obs">saída ${esc(s.checkOut || '')}${s.reserva ? ' · ' + esc(s.reserva) : ''}</span></span>
        <span class="quem">${s.avaliou ? '⭐ avaliou' : '⏳ sem avaliação'}</span>
      </div>`).join('');
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Central do concierge (fila única + dossiê de chegadas) ---------
async function renderConcierge() {
  const c = conteudo();
  c.innerHTML = cabecalho('Central do concierge', 'O que precisa de atenção com os hóspedes, num só lugar: chegadas do período e a fila de pedidos, pré-check-ins e avaliações.') + `
    <div class="barra">
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Chegadas nos próximos
        <select id="cg-dias"><option value="1">1 dia</option><option value="3" selected>3 dias</option><option value="7">7 dias</option><option value="14">14 dias</option></select></label>
      <button class="btn secund peq" id="cg-atualizar">Atualizar</button>
    </div>
    <h2 class="titulo" style="font-size:1.15rem">🛬 Chegadas</h2>
    <div id="cg-chegadas"><p class="vazio">Carregando…</p></div>
    <h2 class="titulo" style="font-size:1.15rem;margin-top:24px">📋 Fila de atendimento</h2>
    <div id="cg-fila"><p class="vazio">Carregando…</p></div>`;
  $('#cg-dias').onchange = carregarChegadas;
  $('#cg-atualizar').onclick = () => { carregarChegadas(); carregarFilaConcierge(); };
  carregarChegadas();
  carregarFilaConcierge();
}
async function carregarChegadas() {
  const alvo = $('#cg-chegadas'); if (!alvo) return;
  try {
    const { chegadas } = await api('GET', '/concierge/chegadas?dias=' + ($('#cg-dias').value || 3));
    if (!chegadas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma chegada no período. 🌴</div>'; return; }
    alvo.innerHTML = chegadas.map(a => {
      const sinais = [
        a.preCheckin ? '<span class="chip" style="background:#e6f4ea;border-color:#bfe3c8">✅ pré-check-in</span>' : '<span class="chip" style="background:#fdf3e3;border-color:#f0dca6">⏳ sem pré-check-in</span>',
        a.pedidosAbertos ? `<span class="chip" style="background:#fff4e0;border-color:#f0dca6">📨 ${a.pedidosAbertos} pedido(s)</span>` : '',
        a.aPagar ? `<span class="chip" style="background:#fdecea;border-color:#f3c9c6">💳 a pagar R$ ${Number(a.aPagar).toLocaleString('pt-BR')}</span>` : '',
        a.credito ? `<span class="chip" style="background:#e6f4ea;border-color:#bfe3c8">🎁 crédito R$ ${Number(a.credito).toLocaleString('pt-BR')}</span>` : '',
        a.temConta ? '' : '<span class="chip">sem conta no app</span>',
      ].filter(Boolean).join(' ');
      return `<div class="item">
        <h3>${esc(a.imovel)} · ${esc(a.hospede)}</h3>
        <div class="meta"><span class="chip">${esc(a.imovelTitulo)}</span><span class="chip">${esc(a.plataforma)}</span>
          <span>check-in ${esc(a.checkIn)} → ${esc(a.checkOut)}${a.hospedes ? ' · ' + a.hospedes + ' hósp.' : ''}</span></div>
        <div class="kard-meta" style="margin-top:8px">${sinais}</div>
      </div>`;
    }).join('');
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
async function carregarFilaConcierge() {
  const alvo = $('#cg-fila'); if (!alvo) return;
  try {
    const { itens, abertos } = await api('GET', '/concierge/fila');
    if (!itens.length) { alvo.innerHTML = '<div class="vazio">Nada na fila agora.</div>'; return; }
    const icone = { pedido: '📨', precheckin: '🛬', avaliacao: '⭐', indicacao: '🤝' };
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${abertos} item(ns) aberto(s) de ${itens.length}</p>` + itens.slice(0, 60).map(x => `
      <div class="linha-item" style="${x.aberto ? 'border-left:3px solid var(--cerrado)' : ''}">
        <span class="qtd">${icone[x.fila] || '•'}</span>
        <span class="nome">${esc(x.titulo)} ${x.sub ? `<span class="obs">${esc(x.sub)}</span>` : ''}</span>
        <span class="quem">${esc(x.status)} · ${x.quando ? dataBr(x.quando) : ''}</span>
        ${x.fila === 'pedido' ? '<button class="btn peq secund" data-verpedidos="1">Ver pedidos</button>' : ''}
      </div>`).join('');
    alvo.querySelectorAll('[data-verpedidos]').forEach(b => b.onclick = () => navegar('hospede-pedidos'));
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Contas a pagar (área financeiro/ceo) ---------
async function renderContasPagar() {
  const c = conteudo();
  c.innerHTML = cabecalho('Contas a pagar', 'Vencimentos, status e alertas de atraso. Marque como pago ao quitar.') + `
    <details class="cr-box" id="cp-box"><summary class="cr-sum">➕ Nova conta</summary>
      <form class="form" id="cp-form" style="max-width:640px;margin-top:12px">
        <input type="hidden" id="cp-id">
        <label>Fornecedor * <input id="cp-fornecedor" required maxlength="120"></label>
        <div class="hi-grid">
          <label>Vencimento <input id="cp-venc" type="date"></label>
          <label>Valor (R$) <input id="cp-valor" type="number" min="0" step="0.01"></label>
          <label>Categoria <input id="cp-cat" maxlength="60" placeholder="ex.: utilidades, marketing…"></label>
          <label>Periodicidade <input id="cp-per" maxlength="30" placeholder="mensal / avulso"></label>
        </div>
        <label>Observação <input id="cp-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="cp-salvar">Adicionar conta</button>
      </form>
    </details>
    <div id="cp-cards" class="cards"></div>
    <div id="cp-lista"><p class="vazio">Carregando…</p></div>`;
  $('#cp-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { fornecedor: $('#cp-fornecedor').value.trim(), vencimento: $('#cp-venc').value, valor: $('#cp-valor').value, categoria: $('#cp-cat').value.trim(), periodicidade: $('#cp-per').value.trim(), obs: $('#cp-obs').value.trim() };
    try {
      const id = $('#cp-id').value;
      if (id) await api('PATCH', '/financeiro/contas/' + id, corpo); else await api('POST', '/financeiro/contas', corpo);
      $('#cp-form').reset(); $('#cp-id').value = ''; $('#cp-salvar').textContent = 'Adicionar conta'; $('#cp-box').open = false;
      carregarContasPagar();
    } catch (e) { alert(e.message); }
  };
  carregarContasPagar();
}
async function carregarContasPagar() {
  const alvo = $('#cp-lista'); if (!alvo) return;
  try {
    const { contas, hoje } = await api('GET', '/financeiro/contas');
    const abertas = contas.filter(c => c.status !== 'pago');
    const em7 = new Date(Date.parse(hoje) + 7 * 86400000).toISOString().slice(0, 10);
    const atrasadas = abertas.filter(c => c.statusEfetivo === 'atrasado');
    const vencendo = abertas.filter(c => c.statusEfetivo !== 'atrasado' && c.vencimento && c.vencimento <= em7);
    const totalAberto = abertas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    $('#cp-cards').innerHTML = `
      <div class="card"><div class="n" style="color:var(--alerta)">${atrasadas.length}</div><div class="rot">Atrasadas</div></div>
      <div class="card"><div class="n" style="color:var(--cerrado)">${vencendo.length}</div><div class="rot">Vencendo em 7 dias</div></div>
      <div class="card"><div class="n">R$ ${totalAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div class="rot">Total em aberto</div></div>`;
    if (!contas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma conta cadastrada. Adicione acima ou o agente financeiro sincroniza a lista.</div>'; return; }
    const cor = { atrasado: 'var(--alerta)', previsto: 'var(--concreto)', pago: 'var(--ok)' };
    const badge = { atrasado: 'st-erro', previsto: 'st-pendente', pago: 'st-feito' };
    const rot = { atrasado: 'ATRASADO', previsto: 'PREVISTO', pago: 'PAGO' };
    alvo.innerHTML = contas.map(c => `
      <div class="linha-item" style="border-left:3px solid ${cor[c.statusEfetivo] || 'var(--borda)'}">
        <span class="qtd">${c.vencimento ? esc(c.vencimento.slice(8, 10) + '/' + c.vencimento.slice(5, 7)) : '—'}</span>
        <span class="nome"><span class="badge ${badge[c.statusEfetivo]}">${rot[c.statusEfetivo]}</span> ${esc(c.fornecedor)}
          <span class="obs">${c.categoria ? esc(c.categoria) : ''}${c.periodicidade ? ' · ' + esc(c.periodicidade) : ''}${c.obs ? ' · ' + esc(c.obs) : ''}</span></span>
        <span class="quem">R$ ${Number(c.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        <div class="acoes" style="grid-column:2;grid-row:1/span 3">
          ${c.status !== 'pago' ? `<button class="btn peq" data-pago="${c.id}">Pago ✓</button>` : `<button class="btn peq secund" data-reabrir="${c.id}">Reabrir</button>`}
          <button class="btn peq secund" data-editar-cp="${c.id}">✎</button>
          <button class="btn peq perigo" data-del-cp="${c.id}">✕</button>
        </div>
      </div>`).join('');
    alvo.querySelectorAll('[data-pago]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/financeiro/contas/' + b.dataset.pago, { status: 'pago' }); carregarContasPagar(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-reabrir]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/financeiro/contas/' + b.dataset.reabrir, { status: 'previsto' }); carregarContasPagar(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-del-cp]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta conta?')) return; try { await api('DELETE', '/financeiro/contas/' + b.dataset.delCp); carregarContasPagar(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-editar-cp]').forEach(b => b.onclick = () => {
      const c = contas.find(x => x.id === b.dataset.editarCp); if (!c) return;
      $('#cp-id').value = c.id; $('#cp-fornecedor').value = c.fornecedor; $('#cp-venc').value = c.vencimento || ''; $('#cp-valor').value = c.valor || '';
      $('#cp-cat').value = c.categoria || ''; $('#cp-per').value = c.periodicidade || ''; $('#cp-obs').value = c.obs || '';
      $('#cp-salvar').textContent = 'Salvar alterações'; $('#cp-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Prazos jurídicos (área jurídico/ceo) ---------
async function renderPrazosJuridicos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Prazos jurídicos', 'Controle preliminar de prazos e atos processuais.') + `
    <div class="aviso">⚠️ <strong>Preliminar</strong> — sempre confira cada prazo no sistema oficial do tribunal (e-SAJ/PJe/eproc). Este quadro é apoio, não substitui o advogado responsável.</div>
    <details class="cr-box" id="pj-box"><summary class="cr-sum">➕ Novo prazo</summary>
      <form class="form" id="pj-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="pj-id">
        <label>Descrição do ato/prazo * <input id="pj-desc" required maxlength="200" placeholder="ex.: Contestação, Réplica, Recurso…"></label>
        <div class="hi-grid">
          <label>Data limite <input id="pj-data" type="date"></label>
          <label>Prioridade <select id="pj-prio"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></label>
          <label>Processo <input id="pj-proc" maxlength="60" placeholder="nº CNJ"></label>
          <label>Tribunal <input id="pj-trib" maxlength="30"></label>
        </div>
        <label>Link de consulta <input id="pj-link" maxlength="300" placeholder="https://…"></label>
        <label>Observação <input id="pj-obs" maxlength="300"></label>
        <button class="btn" type="submit" id="pj-salvar">Adicionar prazo</button>
      </form>
    </details>
    <div id="pj-lista"><p class="vazio">Carregando…</p></div>`;
  $('#pj-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { descricao: $('#pj-desc').value.trim(), dataLimite: $('#pj-data').value, prioridade: $('#pj-prio').value, processo: $('#pj-proc').value.trim(), tribunal: $('#pj-trib').value.trim(), link: $('#pj-link').value.trim(), obs: $('#pj-obs').value.trim() };
    try {
      const id = $('#pj-id').value;
      if (id) await api('PATCH', '/juridico/prazos/' + id, corpo); else await api('POST', '/juridico/prazos', corpo);
      $('#pj-form').reset(); $('#pj-id').value = ''; $('#pj-salvar').textContent = 'Adicionar prazo'; $('#pj-box').open = false;
      carregarPrazos();
    } catch (e) { alert(e.message); }
  };
  carregarPrazos();
}
async function carregarPrazos() {
  const alvo = $('#pj-lista'); if (!alvo) return;
  try {
    const { prazos, hoje } = await api('GET', '/juridico/prazos');
    const abertos = prazos.filter(p => p.status === 'aberto');
    if (!prazos.length) { alvo.innerHTML = '<div class="vazio">Nenhum prazo cadastrado. Adicione acima ou os agentes jurídicos publicam automaticamente.</div>'; return; }
    const diasAte = (d) => d ? Math.round((Date.parse(d) - Date.parse(hoje)) / 86400000) : null;
    const semaforo = (n) => n == null ? { cor: 'var(--concreto-claro)', txt: 'sem data' } : n < 0 ? { cor: 'var(--alerta)', txt: 'venceu há ' + (-n) + 'd' } : n === 0 ? { cor: 'var(--alerta)', txt: 'vence HOJE' } : n <= 3 ? { cor: 'var(--alerta)', txt: 'em ' + n + 'd' } : n <= 7 ? { cor: 'var(--cerrado)', txt: 'em ' + n + 'd' } : { cor: 'var(--ok)', txt: 'em ' + n + 'd' };
    const prioBadge = { alta: 'st-erro', media: 'st-pendente', baixa: 'st-feito' };
    const ordenados = [...abertos].sort((a, b) => String(a.dataLimite || '9999').localeCompare(String(b.dataLimite || '9999')));
    const cumpridos = prazos.filter(p => p.status !== 'aberto');
    const linha = (p) => {
      const n = diasAte(p.dataLimite); const s = semaforo(n);
      return `<div class="linha-item" style="border-left:4px solid ${s.cor};${p.status !== 'aberto' ? 'opacity:.6' : ''}">
        <span class="qtd" style="color:${s.cor};background:none">${p.dataLimite ? esc(p.dataLimite.slice(8, 10) + '/' + p.dataLimite.slice(5, 7)) : '—'}</span>
        <span class="nome"><span class="badge ${prioBadge[p.prioridade]}">${(p.prioridade || '').toUpperCase()}</span> ${esc(p.descricao)}
          <span class="obs">${p.processo ? esc(p.processo) : ''}${p.tribunal ? ' · ' + esc(p.tribunal) : ''}${p.link ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">consultar ↗</a>` : ''}${p.obs ? ' · ' + esc(p.obs) : ''}
          <br><b style="color:${s.cor}">${s.txt}</b> · por ${esc(p.quem || '—')}</span></span>
        <div class="acoes" style="grid-column:2;grid-row:1/span 3">
          ${p.status === 'aberto' ? `<button class="btn peq" data-cumprir="${p.id}">Cumprido ✓</button>` : `<button class="btn peq secund" data-reabrir-pj="${p.id}">Reabrir</button>`}
          <button class="btn peq perigo" data-del-pj="${p.id}">✕</button>
        </div></div>`;
    };
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${abertos.length} prazo(s) em aberto</p>` + ordenados.map(linha).join('') +
      (cumpridos.length ? `<h3 style="margin:20px 0 8px;color:var(--concreto-claro)">Concluídos/cancelados (${cumpridos.length})</h3>` + cumpridos.map(linha).join('') : '');
    alvo.querySelectorAll('[data-cumprir]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/juridico/prazos/' + b.dataset.cumprir, { status: 'cumprido' }); carregarPrazos(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-reabrir-pj]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/juridico/prazos/' + b.dataset.reabrirPj, { status: 'aberto' }); carregarPrazos(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-del-pj]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este prazo?')) return; try { await api('DELETE', '/juridico/prazos/' + b.dataset.delPj); carregarPrazos(); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- DRE por imóvel (receita líquida Stays − custos lançados) ---------
const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const rMoney = (v) => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
const rMoney2 = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function renderDRE() {
  const c = conteudo();
  c.innerHTML = cabecalho('DRE por imóvel', 'Resultado por casa no mês: receita líquida da Stays (por check-in) menos os custos lançados. Lance os custos abaixo para ver a margem real.') + `
    <div class="barra">
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Mês <input type="month" id="dre-mes" value="${mesAtual()}"></label>
      <button class="btn secund peq" id="dre-atualizar">Atualizar</button>
    </div>
    <div id="dre-tabela"><p class="vazio">Consultando a Stays…</p></div>
    <details class="cr-box" style="margin-top:16px"><summary class="cr-sum">➕ Lançar custo do mês</summary>
      <form class="form" id="dre-form" style="max-width:640px;margin-top:12px">
        <div class="hi-grid">
          <label>Imóvel <select id="dre-imovel"><option value="">Carregando…</option></select></label>
          <label>Categoria <select id="dre-cat"></select></label>
          <label>Valor (R$) <input id="dre-valor" type="number" min="0" step="0.01"></label>
          <label>Observação <input id="dre-obs" maxlength="120"></label>
        </div>
        <button class="btn" type="submit">Lançar custo</button>
      </form>
      <div id="dre-custos" style="margin-top:12px"></div>
    </details>`;
  $('#dre-mes').onchange = carregarDRE;
  $('#dre-atualizar').onclick = carregarDRE;
  // popular selects
  try { if (!_cotImoveis) _cotImoveis = (await api('GET', '/stays/imoveis')).imoveis; } catch (_) { _cotImoveis = []; }
  $('#dre-imovel').innerHTML = '<option value="">— imóvel —</option>' + (_cotImoveis || []).map(im => `<option value="${esc(im.codigo)}">${esc(im.codigo)} · ${esc(im.titulo)}</option>`).join('');
  try {
    const { categorias } = await api('GET', '/financeiro/custos?mes=' + $('#dre-mes').value);
    $('#dre-cat').innerHTML = categorias.map(x => `<option value="${x}">${x}</option>`).join('');
  } catch (_) {}
  $('#dre-form').onsubmit = async (ev) => {
    ev.preventDefault();
    if (!$('#dre-imovel').value) { alert('Escolha o imóvel.'); return; }
    try {
      await api('POST', '/financeiro/custos', { mes: $('#dre-mes').value, imovel: $('#dre-imovel').value, categoria: $('#dre-cat').value, valor: $('#dre-valor').value, obs: $('#dre-obs').value.trim() });
      $('#dre-valor').value = ''; $('#dre-obs').value = '';
      carregarDRE();
    } catch (e) { alert(e.message); }
  };
  carregarDRE();
}
async function carregarDRE() {
  const alvo = $('#dre-tabela'); if (!alvo) return;
  const mes = $('#dre-mes').value || mesAtual();
  alvo.innerHTML = '<p class="vazio">Consultando a Stays…</p>';
  try {
    const { linhas, total } = await api('GET', '/financeiro/dre?mes=' + mes);
    if (!linhas.length) { alvo.innerHTML = '<div class="vazio">Sem reservas nem custos neste mês.</div>'; }
    else {
      const cor = (v) => v > 0 ? 'var(--ok)' : v < 0 ? 'var(--alerta)' : 'inherit';
      alvo.innerHTML = `<table><thead><tr><th>Imóvel</th><th>Receita líq.</th><th>Custos</th><th>Resultado</th><th>Margem</th><th>Reservas</th></tr></thead><tbody>
        ${linhas.map(l => `<tr>
          <td><b>${esc(l.imovel)}</b></td>
          <td>${rMoney(l.receitaLiquida)}</td>
          <td>${l.temCusto ? rMoney(l.custos) : '<span style="color:var(--concreto-claro)">— lançar —</span>'}</td>
          <td style="color:${cor(l.resultado)};font-weight:700">${rMoney(l.resultado)}</td>
          <td>${l.margem == null ? '—' : l.margem + '%'}</td>
          <td>${l.reservas} · ${l.noites}n</td></tr>`).join('')}
        <tr style="background:var(--areia);font-weight:800"><td>TOTAL</td><td>${rMoney(total.receitaLiquida)}</td><td>${rMoney(total.custos)}</td><td style="color:${cor(total.resultado)}">${rMoney(total.resultado)}</td><td>${total.receitaLiquida ? Math.round(1000 * total.resultado / total.receitaLiquida) / 10 + '%' : '—'}</td><td></td></tr>
      </tbody></table>
      <p class="cal-rodape">Receita líquida = total das reservas (por check-in) − comissão da plataforma. "— lançar —" indica imóvel sem custo lançado no mês (resultado ainda sem despesas).</p>`;
    }
    // lista de custos lançados no mês (para remover)
    const box = $('#dre-custos'); if (box) {
      const { custos } = await api('GET', '/financeiro/custos?mes=' + mes);
      box.innerHTML = custos.length ? custos.map(cu => `<div class="linha-item"><span class="qtd">${esc(cu.imovel)}</span><span class="nome">${esc(cu.categoria)} <span class="obs">${cu.obs ? esc(cu.obs) : ''}</span></span><span class="quem">${rMoney(cu.valor)}</span><button class="btn peq perigo" data-del-custo="${cu.id}" style="grid-column:2;grid-row:1/span 3">✕</button></div>`).join('') : '<p class="sub" style="margin:0">Nenhum custo lançado neste mês.</p>';
      box.querySelectorAll('[data-del-custo]').forEach(b => b.onclick = async () => { try { await api('DELETE', '/financeiro/custos/' + b.dataset.delCusto); carregarDRE(); } catch (e) { alert(e.message); } });
    }
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Cockpit de revenue ---------
async function renderRevenue() {
  const c = conteudo();
  c.innerHTML = cabecalho('Revenue', 'Ritmo de vendas (pickup), ocupação futura e diária média — ao vivo da Stays.') + '<div id="rv-corpo"><p class="vazio">Consultando a Stays…</p></div>';
  try {
    const d = await api('GET', '/revenue/cockpit');
    const cards = `<div class="cards">
      <div class="card"><div class="n">${d.pickup7.reservas}</div><div class="rot">🆕 Reservas (7 dias) · ${rMoney(d.pickup7.valor)}</div></div>
      <div class="card"><div class="n">${d.pickup30.reservas}</div><div class="rot">🆕 Reservas (30 dias) · ${rMoney(d.pickup30.valor)}</div></div>
      <div class="card"><div class="n">${d.unidades}</div><div class="rot">🏠 Unidades ativas</div></div>
    </div>`;
    const tabela = `<h2 class="titulo" style="font-size:1.15rem">Ocupação futura e diária média</h2>
      <table><thead><tr><th>Janela</th><th>Ocupação</th><th>Noites vendidas</th><th>Receita prevista</th><th>Diária média (ADR)</th><th>RevPAR</th></tr></thead><tbody>
      ${d.futuro.map(b => `<tr><td><b>${b.dias} dias</b></td><td>${b.ocupacaoPct}%</td><td>${b.noitesVendidas}</td><td>${rMoney(b.receitaPrevista)}</td><td>${rMoney(b.adr)}</td><td>${rMoney(b.revpar)}</td></tr>`).join('')}
      </tbody></table>
      <p class="cal-rodape">Ocupação e ADR aproximados (por anúncio ativo; imóveis interligados têm 2 anúncios). RevPAR = receita ÷ (unidades × dias).</p>`;
    const mix = d.mixCanal.length ? `<h2 class="titulo" style="font-size:1.15rem">Mix de canais (estadias futuras — 90 dias)</h2>
      <div class="lista-itens">${d.mixCanal.map(m => `<div class="linha-item"><span class="nome">${esc(m.canal)}</span><span class="quem">${m.n} reserva(s)</span></div>`).join('')}</div>` : '';
    $('#rv-corpo').innerHTML = cards + tabela + mix + '<div id="rv-porcasa" style="margin-top:24px"><p class="sub">Carregando receita por casa…</p></div>';
    carregarRevenuePorCasa();
  } catch (e) { $('#rv-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
async function carregarRevenuePorCasa() {
  const box = $('#rv-porcasa'); if (!box) return;
  try {
    const { mes, mesAnterior, linhas, totalAtual, totalAnterior } = await api('GET', '/revenue/por-casa');
    if (!linhas.length) { box.innerHTML = ''; return; }
    const seta = (v) => v == null ? '' : v > 0 ? `<span style="color:var(--ok)">▲ ${v}%</span>` : v < 0 ? `<span style="color:var(--alerta)">▼ ${Math.abs(v)}%</span>` : '0%';
    box.innerHTML = `<h2 class="titulo" style="font-size:1.15rem">Receita líquida por casa — ${esc(mes)} vs ${esc(mesAnterior)}</h2>
      <table><thead><tr><th>Imóvel</th><th>${esc(mes)}</th><th>${esc(mesAnterior)}</th><th>Variação</th><th>Reservas</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td><b>${esc(l.imovel)}</b></td><td>${rMoney(l.atual)}</td><td>${rMoney(l.anterior)}</td><td>${seta(l.variacao)}</td><td>${l.reservas} · ${l.noites}n</td></tr>`).join('')}
      <tr style="background:var(--areia);font-weight:800"><td>TOTAL</td><td>${rMoney(totalAtual)}</td><td>${rMoney(totalAnterior)}</td><td>${seta(totalAnterior ? Math.round(1000 * (totalAtual - totalAnterior) / totalAnterior) / 10 : null)}</td><td></td></tr>
      </tbody></table><p class="cal-rodape">Receita líquida (total − comissão) por mês de check-in. Compara com o mês anterior.</p>`;
  } catch (e) { box.innerHTML = `<p class="sub">Receita por casa indisponível: ${esc(e.message)}</p>`; }
}

// --------- Conversão por origem (marketing) ---------
async function renderMktConversao() {
  const c = conteudo();
  c.innerHTML = cabecalho('Conversão por origem', 'De onde vêm os leads e qual origem mais converte em reserva (dados do CRM).') + '<div id="mk-corpo"><p class="vazio">Carregando…</p></div>';
  try {
    const { linhas, totalLeads, totalGanhos } = await api('GET', '/marketing/conversao');
    if (!linhas.length) { $('#mk-corpo').innerHTML = '<div class="vazio">Ainda não há contatos no CRM.</div>'; return; }
    const cards = `<div class="cards">
      <div class="card"><div class="n">${totalLeads}</div><div class="rot">Leads no CRM</div></div>
      <div class="card"><div class="n">${totalGanhos}</div><div class="rot">Convertidos em reserva</div></div>
      <div class="card"><div class="n">${totalLeads ? Math.round(1000 * totalGanhos / totalLeads) / 10 : 0}%</div><div class="rot">Conversão geral</div></div>
    </div>`;
    $('#mk-corpo').innerHTML = cards + `<table><thead><tr><th>Origem</th><th>Leads</th><th>Ganhos</th><th>Perdidos</th><th>Conversão</th><th>Valor ganho</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td><b>${esc(l.origem)}</b></td><td>${l.leads}</td><td style="color:var(--ok)">${l.ganhos}</td><td style="color:var(--concreto-claro)">${l.perdidos}</td><td>${l.conversao}%</td><td>${rMoney(l.valorGanho)}</td></tr>`).join('')}
    </tbody></table>`;
  } catch (e) { $('#mk-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Obras & Decoração (quadro com ROI) ---------
const OBRA_COLS = [{ id: 'ideia', rot: '💡 Ideia' }, { id: 'orcamento', rot: '📄 Orçamento' }, { id: 'aprovado', rot: '✅ Aprovado' }, { id: 'em_obra', rot: '🏗️ Em obra' }, { id: 'concluido', rot: '🎉 Concluído' }];
async function renderObras() {
  const c = conteudo();
  c.innerHTML = cabecalho('Obras & Decoração', 'Da ideia à entrega, com custo e retorno estimado (payback pela diária extra que a melhoria gera).') + `
    <details class="cr-box" id="ob-box"><summary class="cr-sum">➕ Nova obra/melhoria</summary>
      <form class="form" id="ob-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="ob-id">
        <label>Título * <input id="ob-titulo" required maxlength="160" placeholder="ex.: Deck e ofurô na Villa Kubitschek"></label>
        <div class="hi-grid">
          <label>Imóvel <input id="ob-imovel" maxlength="80"></label>
          <label>Custo previsto (R$) <input id="ob-cp" type="number" min="0" step="0.01"></label>
          <label>Custo real (R$) <input id="ob-cr" type="number" min="0" step="0.01"></label>
          <label>Diária extra gerada (R$) <input id="ob-de" type="number" min="0" step="0.01" placeholder="quanto a mais por noite"></label>
          <label>Noites extras/mês <input id="ob-om" type="number" min="0" step="1" placeholder="ex.: 12"></label>
        </div>
        <label>Descrição <textarea id="ob-desc" rows="2" maxlength="1000"></textarea></label>
        <button class="btn" type="submit" id="ob-salvar">Adicionar</button>
      </form>
    </details>
    <div id="ob-board" class="kanban"><p class="vazio">Carregando…</p></div>`;
  $('#ob-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { titulo: $('#ob-titulo').value.trim(), imovel: $('#ob-imovel').value.trim(), descricao: $('#ob-desc').value.trim(), custoPrevisto: $('#ob-cp').value, custoReal: $('#ob-cr').value, diariaExtra: $('#ob-de').value, ocupacaoMes: $('#ob-om').value };
    try {
      const id = $('#ob-id').value;
      if (id) await api('PATCH', '/obras/' + id, corpo); else await api('POST', '/obras', corpo);
      $('#ob-form').reset(); $('#ob-id').value = ''; $('#ob-salvar').textContent = 'Adicionar'; $('#ob-box').open = false;
      carregarObras();
    } catch (e) { alert(e.message); }
  };
  carregarObras();
}
function obraPayback(o) {
  const custo = Number(o.custoReal) || Number(o.custoPrevisto) || 0;
  const ganhoMes = (Number(o.diariaExtra) || 0) * (Number(o.ocupacaoMes) || 0);
  if (!custo || !ganhoMes) return null;
  return Math.round(10 * custo / ganhoMes) / 10; // meses
}
async function carregarObras() {
  const board = $('#ob-board'); if (!board) return;
  try {
    const { obras } = await api('GET', '/obras');
    const porCol = {}; OBRA_COLS.forEach(col => porCol[col.id] = []);
    obras.forEach(o => (porCol[o.status] || porCol.ideia).push(o));
    const opc = (atual) => OBRA_COLS.map(col => `<option value="${col.id}" ${col.id === atual ? 'selected' : ''}>${col.rot}</option>`).join('');
    board.innerHTML = OBRA_COLS.map(col => {
      const lista = porCol[col.id];
      return `<div class="col">
        <div class="col-head"><span>${col.rot}</span><span class="col-n">${lista.length}</span></div>
        <div class="col-cards">${lista.map(o => {
          const pb = obraPayback(o);
          const custo = Number(o.custoReal) || Number(o.custoPrevisto) || 0;
          return `<div class="kard" style="cursor:default">
            <div class="kard-nome">${esc(o.titulo)}</div>
            <div class="kard-meta">${o.imovel ? `<span class="chip">${esc(o.imovel)}</span>` : ''}${custo ? `<span class="chip">${rMoney(custo)}</span>` : ''}</div>
            ${pb != null ? `<div class="kard-acao ${pb <= 12 ? 'futuro' : ''}">📈 payback ~${pb} ${pb === 1 ? 'mês' : 'meses'}</div>` : (o.diariaExtra ? '<div class="kard-acao">preencha custo + noites p/ ROI</div>' : '')}
            ${o.descricao ? `<div class="kard-origem">${esc(o.descricao.slice(0, 80))}</div>` : ''}
            <div class="acoes" style="margin-top:8px">
              <select data-mover-ob="${o.id}" style="font-size:.78rem;padding:4px 6px">${opc(o.status)}</select>
              <button class="btn peq secund" data-fotos="obra:${o.id}" data-tit="${esc(o.titulo)}">📷</button>
              <button class="btn peq secund" data-editar-ob="${o.id}">✎</button>
              <button class="btn peq perigo" data-del-ob="${o.id}">✕</button>
            </div></div>`;
        }).join('') || '<div class="col-vazio">—</div>'}</div>
      </div>`;
    }).join('');
    board.querySelectorAll('[data-mover-ob]').forEach(s => s.onchange = async () => { try { await api('PATCH', '/obras/' + s.dataset.moverOb, { status: s.value }); carregarObras(); } catch (e) { alert(e.message); } });
    board.querySelectorAll('[data-del-ob]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta obra?')) return; try { await api('DELETE', '/obras/' + b.dataset.delOb); carregarObras(); } catch (e) { alert(e.message); } });
    board.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => { const [ent, eid] = b.dataset.fotos.split(':'); abrirFotosModal(ent, eid, b.dataset.tit); });
    board.querySelectorAll('[data-editar-ob]').forEach(b => b.onclick = () => {
      const o = obras.find(x => x.id === b.dataset.editarOb); if (!o) return;
      $('#ob-id').value = o.id; $('#ob-titulo').value = o.titulo; $('#ob-imovel').value = o.imovel || ''; $('#ob-desc').value = o.descricao || '';
      $('#ob-cp').value = o.custoPrevisto || ''; $('#ob-cr').value = o.custoReal || ''; $('#ob-de').value = o.diariaExtra || ''; $('#ob-om').value = o.ocupacaoMes || '';
      $('#ob-salvar').textContent = 'Salvar alterações'; $('#ob-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (e) { board.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Semáforo de automações (admin) ---------
async function renderAutomacoes() {
  const c = conteudo();
  c.innerHTML = cabecalho('Automações', 'Cada rotina registra sua última execução. Verde = em dia; âmbar = atrasada; vermelho = muito atrasada ou com erro.') + '<div id="au-lista"><p class="vazio">Carregando…</p></div>';
  try {
    const { itens } = await api('GET', '/automacoes');
    if (!itens.length) { $('#au-lista').innerHTML = '<div class="vazio">Nenhuma automação registrou heartbeat ainda. As rotinas passam a aparecer aqui quando reportarem execução.</div>'; return; }
    const dot = { verde: 'var(--ok)', ambar: 'var(--cerrado)', vermelho: 'var(--alerta)' };
    $('#au-lista').innerHTML = itens.map(a => `<div class="linha-item" style="border-left:4px solid ${dot[a.semaforo]}">
      <span class="qtd" style="background:${dot[a.semaforo]};color:#fff">●</span>
      <span class="nome">${esc(a.tarefa)} ${a.detalhe ? `<span class="obs">${esc(a.detalhe)}</span>` : ''}
        <br><span class="obs">${a.grupo ? esc(a.grupo) + ' · ' : ''}última há ${a.idadeHoras}h${a.status === 'erro' ? ' · ⚠️ reportou ERRO' : ''} · validade ${a.validadeHoras}h</span></span>
      <span class="quem">${dataBr(a.ultima)}</span>
      <button class="btn peq perigo" data-del-au="${encodeURIComponent(a.tarefa)}" style="grid-column:2;grid-row:1/span 3">✕</button>
    </div>`).join('');
    $('#au-lista').querySelectorAll('[data-del-au]').forEach(b => b.onclick = async () => { if (!confirm('Remover esta automação do painel?')) return; try { await api('DELETE', '/automacoes/' + b.dataset.delAu); renderAutomacoes(); } catch (e) { alert(e.message); } });
  } catch (e) { $('#au-lista').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Auditoria (admin) ---------
async function renderAuditoria() {
  const c = conteudo();
  c.innerHTML = cabecalho('Auditoria', 'Registro das ações sensíveis (usuários, reservas/bloqueios na Stays, lançamentos em conta corrente).') + '<div id="ad-lista"><p class="vazio">Carregando…</p></div>';
  try {
    const { eventos } = await api('GET', '/auditoria?n=200');
    if (!eventos.length) { $('#ad-lista').innerHTML = '<div class="vazio">Nenhum evento registrado ainda.</div>'; return; }
    $('#ad-lista').innerHTML = `<table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
      ${eventos.map(e => `<tr><td>${dataBr(e.quando)}</td><td>${esc(e.quem || '—')}</td><td><span class="chip">${esc(e.acao || '')}</span></td><td>${esc(e.detalhe || '')}</td></tr>`).join('')}
    </tbody></table>`;
  } catch (e) { $('#ad-lista').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Equipamentos (ativos): ficha com histórico e gasto ---------
async function renderAtivos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Equipamentos', 'Ficha de cada ativo (ar-condicionado, aquecedor, piscina…) com histórico de chamados e gasto acumulado. Vincule os chamados ao equipamento para decidir troca × conserto com dado.') + `
    <details class="cr-box" id="at-box"><summary class="cr-sum">➕ Novo equipamento</summary>
      <form class="form" id="at-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="at-id">
        <label>Nome * <input id="at-nome" required maxlength="120" placeholder="ex.: Ar-condicionado Sala"></label>
        <div class="hi-grid">
          <label>Casa / unidade <input id="at-casa" maxlength="80"></label>
          <label>Categoria <select id="at-cat"></select></label>
          <label>Marca <input id="at-marca" maxlength="60"></label>
          <label>Modelo <input id="at-modelo" maxlength="60"></label>
          <label>Instalado em <input id="at-data" type="date"></label>
        </div>
        <label>Observação <input id="at-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="at-salvar">Adicionar</button>
      </form>
    </details>
    <div id="at-lista"><p class="vazio">Carregando…</p></div>`;
  try { const { categorias } = await api('GET', '/ativos'); $('#at-cat').innerHTML = categorias.map(x => `<option value="${x}">${x}</option>`).join(''); } catch (_) {}
  $('#at-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { nome: $('#at-nome').value.trim(), casa: $('#at-casa').value.trim(), categoria: $('#at-cat').value, marca: $('#at-marca').value.trim(), modelo: $('#at-modelo').value.trim(), dataInstalacao: $('#at-data').value, obs: $('#at-obs').value.trim() };
    try { const id = $('#at-id').value; if (id) await api('PATCH', '/ativos/' + id, corpo); else await api('POST', '/ativos', corpo); $('#at-form').reset(); $('#at-id').value = ''; $('#at-salvar').textContent = 'Adicionar'; $('#at-box').open = false; carregarAtivos(); }
    catch (e) { alert(e.message); }
  };
  carregarAtivos();
}
async function carregarAtivos() {
  const alvo = $('#at-lista'); if (!alvo) return;
  try {
    const { ativos } = await api('GET', '/ativos');
    if (!ativos.length) { alvo.innerHTML = '<div class="vazio">Nenhum equipamento cadastrado. Adicione os ativos das casas (ar-condicionado, aquecedor, bomba da piscina…).</div>'; return; }
    alvo.innerHTML = ativos.map(a => `<div class="item">
      <h3 style="margin:0 0 4px">${esc(a.nome)}</h3>
      <div class="meta"><span class="chip">${esc(a.categoria)}</span>${a.casa ? `<span class="chip">${esc(a.casa)}</span>` : ''}${a.marca || a.modelo ? `<span>${esc([a.marca, a.modelo].filter(Boolean).join(' '))}</span>` : ''}${a.dataInstalacao ? `<span>instalado ${esc(a.dataInstalacao)}</span>` : ''}</div>
      <div class="meta" style="margin-top:6px"><span>🛠️ ${a.chamados} chamado(s)</span><span>💸 gasto acumulado <b>${rMoney(a.gastoAcumulado)}</b></span></div>
      ${a.obs ? `<p style="margin:6px 0 0;font-size:.9rem">${esc(a.obs)}</p>` : ''}
      <div class="acoes"><button class="btn peq" data-hist="${a.id}" data-n="${esc(a.nome)}">Ver histórico</button><button class="btn peq secund" data-edit-at="${a.id}">Editar</button><button class="btn peq perigo" data-del-at="${a.id}">Excluir</button></div>
    </div>`).join('');
    alvo.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => abrirAtivo(b.dataset.hist, b.dataset.n));
    alvo.querySelectorAll('[data-del-at]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este equipamento? (os chamados não são apagados)')) return; try { await api('DELETE', '/ativos/' + b.dataset.delAt); carregarAtivos(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-edit-at]').forEach(b => b.onclick = async () => {
      const { ativo: a } = await api('GET', '/ativos/' + b.dataset.editAt);
      $('#at-id').value = a.id; $('#at-nome').value = a.nome; $('#at-casa').value = a.casa || ''; $('#at-cat').value = a.categoria; $('#at-marca').value = a.marca || ''; $('#at-modelo').value = a.modelo || ''; $('#at-data').value = a.dataInstalacao || ''; $('#at-obs').value = a.obs || '';
      $('#at-salvar').textContent = 'Salvar alterações'; $('#at-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
async function abrirAtivo(id, nome) {
  try {
    const { ativo: a, chamados, gastoAcumulado } = await api('GET', '/ativos/' + id);
    const rot = { aberto: 'Aberto', agendado: 'Agendado', em_execucao: 'Em execução', concluido: 'Concluído' };
    conteudo().innerHTML = `<button class="btn secund peq" id="at-voltar">← Voltar aos equipamentos</button>
      ${cabecalho(a.nome, [a.categoria, a.casa].filter(Boolean).join(' · '))}
      <div class="cards"><div class="card"><div class="n">${chamados.length}</div><div class="rot">Chamados</div></div>
        <div class="card"><div class="n">${rMoney(gastoAcumulado)}</div><div class="rot">Gasto acumulado</div></div></div>
      <h2 class="titulo" style="font-size:1.15rem">Histórico de chamados</h2>
      ${chamados.length ? chamados.map(ch => `<div class="linha-item"><span class="qtd">${dataBr(ch.criadoEm).slice(0, 5)}</span><span class="nome">${esc(ch.titulo)} <span class="obs">${rot[ch.status] || ch.status}${ch.tecnico ? ' · ' + esc(ch.tecnico) : ''}</span></span><span class="quem">${ch.custo != null ? rMoney(ch.custo) : '—'}</span></div>`).join('') : '<div class="vazio">Sem chamados vinculados. Ao abrir um chamado, escolha este equipamento no campo “Equipamento”.</div>'}`;
    $('#at-voltar').onclick = () => navegar('ativos');
  } catch (e) { alert(e.message); }
}

// --------- Estoque (enxoval / amenities) com mínimo e reposição ---------
async function renderEstoque() {
  const c = conteudo();
  c.innerHTML = cabecalho('Estoque & enxoval', 'Controle de enxoval e amenities por casa. Itens abaixo do mínimo ficam em destaque; toque em “Repor” para jogar na lista de compras.') + `
    <details class="cr-box" id="es-box"><summary class="cr-sum">➕ Novo item</summary>
      <form class="form" id="es-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="es-id">
        <label>Item * <input id="es-item" required maxlength="120" placeholder="ex.: Jogo de toalhas, Shampoo, Papel higiênico"></label>
        <div class="hi-grid">
          <label>Casa <input id="es-casa" maxlength="80"></label>
          <label>Categoria <input id="es-cat" maxlength="60" placeholder="enxoval / amenities / limpeza"></label>
          <label>Quantidade <input id="es-qtd" type="number" min="0" step="1"></label>
          <label>Mínimo <input id="es-min" type="number" min="0" step="1"></label>
          <label>Unidade <input id="es-un" maxlength="12" placeholder="un / jogo / pct"></label>
        </div>
        <label>Observação <input id="es-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="es-salvar">Adicionar</button>
      </form>
    </details>
    <div id="es-lista"><p class="vazio">Carregando…</p></div>`;
  $('#es-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { item: $('#es-item').value.trim(), casa: $('#es-casa').value.trim(), categoria: $('#es-cat').value.trim(), quantidade: $('#es-qtd').value, minimo: $('#es-min').value, unidade: $('#es-un').value.trim(), obs: $('#es-obs').value.trim() };
    try { const id = $('#es-id').value; if (id) await api('PATCH', '/estoque/' + id, corpo); else await api('POST', '/estoque', corpo); $('#es-form').reset(); $('#es-id').value = ''; $('#es-salvar').textContent = 'Adicionar'; $('#es-box').open = false; carregarEstoque(); }
    catch (e) { alert(e.message); }
  };
  carregarEstoque();
}
async function carregarEstoque() {
  const alvo = $('#es-lista'); if (!alvo) return;
  try {
    const { itens } = await api('GET', '/estoque');
    const baixos = itens.filter(i => i.baixo).length;
    if (!itens.length) { alvo.innerHTML = '<div class="vazio">Nenhum item no estoque. Cadastre o enxoval e os amenities por casa.</div>'; return; }
    alvo.innerHTML = (baixos ? `<div class="aviso">⚠️ ${baixos} item(ns) no mínimo ou abaixo — considere repor.</div>` : '') + itens.map(i => `
      <div class="linha-item" style="${i.baixo ? 'border-left:4px solid var(--alerta)' : ''}">
        <span class="qtd" style="${i.baixo ? 'color:var(--alerta)' : ''}">${i.quantidade}${i.unidade ? ' ' + esc(i.unidade) : ''}</span>
        <span class="nome">${esc(i.item)} ${i.casa ? `<span class="obs">${esc(i.casa)}</span>` : ''}${i.categoria ? ` <span class="chip">${esc(i.categoria)}</span>` : ''}
          <br><span class="obs">mínimo ${i.minimo}${i.unidade ? ' ' + esc(i.unidade) : ''}${i.baixo ? ' · ⚠️ repor' : ''}${i.obs ? ' · ' + esc(i.obs) : ''}</span></span>
        <div class="acoes" style="grid-column:2;grid-row:1/span 3">
          <button class="btn peq secund" data-mais="${i.id}">＋</button>
          <button class="btn peq secund" data-menos="${i.id}">－</button>
          <button class="btn peq" data-repor="${i.id}">Repor</button>
          <button class="btn peq perigo" data-del-es="${i.id}">✕</button>
        </div></div>`).join('');
    const ajusta = async (id, delta) => { const it = itens.find(x => x.id === id); if (!it) return; try { await api('PATCH', '/estoque/' + id, { quantidade: Math.max(0, Number(it.quantidade) + delta) }); carregarEstoque(); } catch (e) { alert(e.message); } };
    alvo.querySelectorAll('[data-mais]').forEach(b => b.onclick = () => ajusta(b.dataset.mais, 1));
    alvo.querySelectorAll('[data-menos]').forEach(b => b.onclick = () => ajusta(b.dataset.menos, -1));
    alvo.querySelectorAll('[data-repor]').forEach(b => b.onclick = async () => { try { const r = await api('POST', '/estoque/' + b.dataset.repor + '/repor', {}); alert(r.duplicado ? 'Este item já está na lista de compras.' : 'Adicionado à lista de compras.'); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-del-es]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este item do estoque?')) return; try { await api('DELETE', '/estoque/' + b.dataset.delEs); carregarEstoque(); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Galeria de materiais de marca ---------
const podeMktFront = () => ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('marketing') || ESTADO.areas.includes('ceo');
async function renderMateriais() {
  const c = conteudo();
  c.innerHTML = cabecalho('Materiais de marca', 'Biblioteca de placas, QR codes, iscas, artes, logos e documentos da empresa. Baixe e reutilize.') + `
    ${podeMktFront() ? `<details class="cr-box" id="ma-box"><summary class="cr-sum">➕ Novo material</summary>
      <form class="form" id="ma-form" style="max-width:660px;margin-top:12px">
        <label>Título * <input id="ma-titulo" required maxlength="120"></label>
        <div class="hi-grid">
          <label>Categoria <select id="ma-cat"></select></label>
          <label>Tags <input id="ma-tags" maxlength="120" placeholder="ex.: lago sul, evento"></label>
        </div>
        <label>Arquivo (imagem, PDF, vídeo…) <input id="ma-arq" type="file"></label>
        <label>…ou link externo <input id="ma-url" placeholder="https://…"></label>
        <button class="btn" type="submit" id="ma-salvar">Adicionar</button>
        <p id="ma-msg" class="erro"></p>
      </form>
    </details>` : ''}
    <div class="barra"><label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Filtrar <select id="ma-filtro"><option value="">Todas as categorias</option></select></label></div>
    <div id="ma-grade" class="cards"><p class="vazio">Carregando…</p></div>`;
  let categorias = [];
  try { categorias = (await api('GET', '/materiais')).categorias; } catch (_) {}
  const optsCat = categorias.map(x => `<option value="${x}">${x}</option>`).join('');
  if ($('#ma-cat')) $('#ma-cat').innerHTML = optsCat;
  $('#ma-filtro').innerHTML = '<option value="">Todas as categorias</option>' + optsCat;
  $('#ma-filtro').onchange = () => carregarMateriais($('#ma-filtro').value);
  if (podeMktFront()) $('#ma-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#ma-msg'); msg.textContent = '';
    const corpo = { titulo: $('#ma-titulo').value.trim(), categoria: $('#ma-cat').value, tags: $('#ma-tags').value.trim() };
    const arq = $('#ma-arq').files[0];
    try {
      if (arq) { if (arq.size > 20 * 1024 * 1024) throw new Error('Arquivo acima de 20 MB.'); corpo.nomeArquivo = arq.name; corpo.base64 = await arquivoParaBase64(arq); }
      else if ($('#ma-url').value.trim()) corpo.url = $('#ma-url').value.trim();
      else throw new Error('Envie um arquivo ou um link.');
      await api('POST', '/materiais', corpo);
      $('#ma-form').reset(); $('#ma-box').open = false; carregarMateriais($('#ma-filtro').value);
    } catch (e) { msg.textContent = e.message; }
  };
  carregarMateriais('');
}
async function carregarMateriais(cat) {
  const alvo = $('#ma-grade'); if (!alvo) return;
  try {
    const { materiais } = await api('GET', '/materiais' + (cat ? '?categoria=' + encodeURIComponent(cat) : ''));
    if (!materiais.length) { alvo.className = ''; alvo.innerHTML = '<div class="vazio">Nenhum material ainda. Adicione as artes, placas e QR codes da marca.</div>'; return; }
    alvo.className = 'ma-grade';
    alvo.innerHTML = materiais.map(m => {
      const href = m.tipo === 'link' ? m.url : '/staff/api/materiais/' + m.id + '/arquivo';
      const thumb = m.tipo === 'imagem' ? `<img src="/staff/api/materiais/${m.id}/arquivo" alt="${esc(m.titulo)}" loading="lazy">` : `<div class="ma-ico">${m.tipo === 'link' ? '🔗' : (m.ext === '.pdf' ? '📄' : m.ext === '.mp4' ? '🎬' : '📎')}</div>`;
      return `<div class="ma-card">
        <a href="${esc(href)}" target="_blank" rel="noopener" class="ma-thumb">${thumb}</a>
        <div class="ma-info"><b>${esc(m.titulo)}</b><span class="chip">${esc(m.categoria)}</span>${m.tags ? `<span class="ma-tags">${esc(m.tags)}</span>` : ''}
          <div class="acoes"><a class="btn peq" href="${esc(href)}" target="_blank" rel="noopener" download>${m.tipo === 'link' ? 'Abrir' : 'Baixar'}</a>${podeMktFront() ? `<button class="btn peq perigo" data-del-ma="${m.id}">✕</button>` : ''}</div></div>
      </div>`;
    }).join('');
    alvo.querySelectorAll('[data-del-ma]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este material?')) return; try { await api('DELETE', '/materiais/' + b.dataset.delMa); carregarMateriais(cat); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.className = ''; alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Calendário editorial (quadro por status) ---------
const ED_COLS = [{ id: 'ideia', rot: '💡 Ideia' }, { id: 'producao', rot: '✏️ Produção' }, { id: 'agendado', rot: '📅 Agendado' }, { id: 'publicado', rot: '✅ Publicado' }];
const ED_ICON = { instagram: '📷', facebook: '👍', tiktok: '🎵', linkedin: '💼', blog: '📝', email: '✉️', whatsapp: '💬', b2b: '🤝', outro: '•' };
async function renderEditorial() {
  const c = conteudo();
  let canais = EDIT_CANAIS_FALLBACK;
  c.innerHTML = cabecalho('Calendário editorial', 'Pautas de posts, artigos e campanhas — da ideia à publicação.') + `
    ${podeMktFront() ? `<details class="cr-box" id="ed-box"><summary class="cr-sum">➕ Nova pauta</summary>
      <form class="form" id="ed-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="ed-id">
        <label>Título / pauta * <input id="ed-titulo" required maxlength="160"></label>
        <div class="hi-grid">
          <label>Canal <select id="ed-canal"></select></label>
          <label>Data <input id="ed-data" type="date"></label>
          <label>Responsável <input id="ed-resp" maxlength="60"></label>
          <label>Link <input id="ed-link" maxlength="300" placeholder="https://…"></label>
        </div>
        <label>Observação <input id="ed-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="ed-salvar">Adicionar</button>
      </form>
    </details>` : ''}
    <div id="ed-board" class="kanban"><p class="vazio">Carregando…</p></div>`;
  try { canais = (await api('GET', '/marketing/editorial')).canais; } catch (_) {}
  if ($('#ed-canal')) $('#ed-canal').innerHTML = canais.map(x => `<option value="${x}">${x}</option>`).join('');
  if (podeMktFront()) $('#ed-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { titulo: $('#ed-titulo').value.trim(), canal: $('#ed-canal').value, data: $('#ed-data').value, responsavel: $('#ed-resp').value.trim(), link: $('#ed-link').value.trim(), obs: $('#ed-obs').value.trim() };
    try { const id = $('#ed-id').value; if (id) await api('PATCH', '/marketing/editorial/' + id, corpo); else await api('POST', '/marketing/editorial', corpo); $('#ed-form').reset(); $('#ed-id').value = ''; $('#ed-salvar').textContent = 'Adicionar'; $('#ed-box').open = false; carregarEditorial(); }
    catch (e) { alert(e.message); }
  };
  carregarEditorial();
}
async function carregarEditorial() {
  const board = $('#ed-board'); if (!board) return;
  try {
    const { itens } = await api('GET', '/marketing/editorial');
    const porCol = {}; ED_COLS.forEach(col => porCol[col.id] = []);
    itens.forEach(it => (porCol[it.status] || porCol.ideia).push(it));
    const opc = (a) => ED_COLS.map(col => `<option value="${col.id}" ${col.id === a ? 'selected' : ''}>${col.rot}</option>`).join('');
    board.innerHTML = ED_COLS.map(col => `<div class="col">
      <div class="col-head"><span>${col.rot}</span><span class="col-n">${porCol[col.id].length}</span></div>
      <div class="col-cards">${porCol[col.id].map(it => `<div class="kard" style="cursor:default">
        <div class="kard-nome">${ED_ICON[it.canal] || '•'} ${esc(it.titulo)}</div>
        <div class="kard-meta"><span class="chip">${esc(it.canal)}</span>${it.data ? `<span class="chip">${esc(it.data.slice(8, 10) + '/' + it.data.slice(5, 7))}</span>` : ''}</div>
        ${it.responsavel ? `<div class="kard-acao">👤 ${esc(it.responsavel)}</div>` : ''}${it.link ? `<div class="kard-origem"><a href="${esc(it.link)}" target="_blank" rel="noopener">abrir ↗</a></div>` : ''}
        ${podeMktFront() ? `<div class="acoes" style="margin-top:8px"><select data-mover-ed="${it.id}" style="font-size:.78rem;padding:4px 6px">${opc(it.status)}</select><button class="btn peq secund" data-edit-ed="${it.id}">✎</button><button class="btn peq perigo" data-del-ed="${it.id}">✕</button></div>` : ''}
      </div>`).join('') || '<div class="col-vazio">—</div>'}</div></div>`).join('');
    if (podeMktFront()) {
      board.querySelectorAll('[data-mover-ed]').forEach(s => s.onchange = async () => { try { await api('PATCH', '/marketing/editorial/' + s.dataset.moverEd, { status: s.value }); carregarEditorial(); } catch (e) { alert(e.message); } });
      board.querySelectorAll('[data-del-ed]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta pauta?')) return; try { await api('DELETE', '/marketing/editorial/' + b.dataset.delEd); carregarEditorial(); } catch (e) { alert(e.message); } });
      board.querySelectorAll('[data-edit-ed]').forEach(b => b.onclick = () => { const it = itens.find(x => x.id === b.dataset.editEd); if (!it) return; $('#ed-id').value = it.id; $('#ed-titulo').value = it.titulo; $('#ed-canal').value = it.canal; $('#ed-data').value = it.data || ''; $('#ed-resp').value = it.responsavel || ''; $('#ed-link').value = it.link || ''; $('#ed-obs').value = it.obs || ''; $('#ed-salvar').textContent = 'Salvar alterações'; $('#ed-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' }); });
    }
  } catch (e) { board.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
const EDIT_CANAIS_FALLBACK = ['instagram', 'facebook', 'tiktok', 'linkedin', 'blog', 'email', 'whatsapp', 'b2b', 'outro'];

// --------- Depoimentos (avaliações 5★ → prova social) ---------
async function renderDepoimentos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Depoimentos', 'Avaliações positivas dos hóspedes prontas para virar prova social no site e nas redes. Marque as aprovadas para publicar (com consentimento).') + `
    <div class="barra"><label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Nota mínima
      <select id="dp-min"><option value="5">5★</option><option value="4" selected>4★+</option><option value="1">Todas</option></select></label></div>
    <div id="dp-lista"><p class="vazio">Carregando…</p></div>`;
  $('#dp-min').onchange = carregarDepoimentos;
  carregarDepoimentos();
}
async function carregarDepoimentos() {
  const alvo = $('#dp-lista'); if (!alvo) return;
  try {
    const { depoimentos, publicados } = await api('GET', '/marketing/depoimentos?min=' + ($('#dp-min').value || 4));
    if (!depoimentos.length) { alvo.innerHTML = '<div class="vazio">Ainda não há avaliações com comentário nessa faixa. As avaliações 5★ da Área do Hóspede aparecem aqui.</div>'; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${depoimentos.length} depoimento(s) · ${publicados} aprovado(s) para publicar</p>` + depoimentos.map(d => `
      <div class="item" style="${d.publicado ? 'border-left:4px solid var(--ok)' : ''}">
        <div class="meta"><span>${'★'.repeat(Number(d.nota) || 0)}${'☆'.repeat(5 - (Number(d.nota) || 0))}</span>${d.imovel ? `<span class="chip">${esc(d.imovel)}</span>` : ''}<span>· ${esc(d.hospedeNome)} · ${dataBr(d.criadoEm)}</span>${d.publicado ? '<span class="chip" style="background:#e6f4ea;border-color:#bfe3c8">✅ publicar</span>' : ''}</div>
        <p style="margin:8px 0;font-size:.98rem">“${esc(d.comentario)}”</p>
        ${podeMktFront() ? `<div class="acoes">
          <button class="btn peq ${d.publicado ? 'secund' : ''}" data-pub="${d.id}" data-v="${d.publicado ? 0 : 1}">${d.publicado ? 'Remover da vitrine' : '✅ Aprovar p/ publicar'}</button>
          <button class="btn peq secund" data-copy-dp="${d.id}">📋 Copiar</button></div>` : ''}
      </div>`).join('');
    alvo.querySelectorAll('[data-pub]').forEach(b => b.onclick = async () => { try { await api('POST', '/marketing/depoimentos/' + b.dataset.pub, { publicado: b.dataset.v === '1' }); carregarDepoimentos(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-copy-dp]').forEach(b => b.onclick = () => { const d = depoimentos.find(x => x.id === b.dataset.copyDp); const txt = `"${d.comentario}" — ${d.hospedeNome}${d.imovel ? ', ' + d.imovel : ''} (${d.nota}★)`; navigator.clipboard.writeText(txt).then(() => { b.textContent = '✓ Copiado'; }); });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Redes sociais (métricas mensais) ---------
async function renderRedes() {
  const c = conteudo();
  let redes = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'google'];
  c.innerHTML = cabecalho('Redes sociais', 'Métricas mensais por rede (seguidores, alcance, engajamento, posts). Lance à mão ou uma rotina do Metricool preenche.') + `
    <details class="cr-box" id="rd-box"><summary class="cr-sum">➕ Lançar métricas do mês</summary>
      <form class="form" id="rd-form" style="max-width:660px;margin-top:12px">
        <div class="hi-grid">
          <label>Rede <select id="rd-rede"></select></label>
          <label>Mês <input id="rd-mes" type="month" value="${mesAtual()}"></label>
          <label>Seguidores <input id="rd-seg" type="number" min="0"></label>
          <label>Alcance <input id="rd-alc" type="number" min="0"></label>
          <label>Engajamento <input id="rd-eng" type="number" min="0"></label>
          <label>Posts <input id="rd-pos" type="number" min="0"></label>
        </div>
        <button class="btn" type="submit">Salvar</button>
      </form>
    </details>
    <div id="rd-lista"><p class="vazio">Carregando…</p></div>`;
  try { redes = (await api('GET', '/marketing/redes')).redes; } catch (_) {}
  $('#rd-rede').innerHTML = redes.map(x => `<option value="${x}">${x}</option>`).join('');
  $('#rd-form').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('POST', '/marketing/redes', { rede: $('#rd-rede').value, mes: $('#rd-mes').value, seguidores: $('#rd-seg').value, alcance: $('#rd-alc').value, engajamento: $('#rd-eng').value, posts: $('#rd-pos').value }); $('#rd-form').reset(); $('#rd-mes').value = mesAtual(); $('#rd-box').open = false; carregarRedes(); }
    catch (e) { alert(e.message); }
  };
  carregarRedes();
}
async function carregarRedes() {
  const alvo = $('#rd-lista'); if (!alvo) return;
  try {
    const { itens } = await api('GET', '/marketing/redes');
    if (!itens.length) { alvo.innerHTML = '<div class="vazio">Sem métricas lançadas. Registre o resumo mensal de cada rede.</div>'; return; }
    const ico = { instagram: '📷', facebook: '👍', tiktok: '🎵', linkedin: '💼', youtube: '▶️', google: '🔎' };
    const num = (v) => Number(v || 0).toLocaleString('pt-BR');
    alvo.innerHTML = `<table><thead><tr><th>Mês</th><th>Rede</th><th>Seguidores</th><th>Alcance</th><th>Engajamento</th><th>Posts</th><th></th></tr></thead><tbody>
      ${itens.map(i => `<tr><td>${esc(i.mes)}</td><td>${ico[i.rede] || ''} ${esc(i.rede)}</td><td>${num(i.seguidores)}</td><td>${num(i.alcance)}</td><td>${num(i.engajamento)}</td><td>${num(i.posts)}</td><td>${podeMktFront() ? `<button class="btn peq perigo" data-del-rd="${i.id}">✕</button>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
    alvo.querySelectorAll('[data-del-rd]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este lançamento?')) return; try { await api('DELETE', '/marketing/redes/' + b.dataset.delRd); carregarRedes(); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

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
    const { pendentes } = await api('GET', '/juridico/contratos/pendentes?dias=30');
    if (!pendentes.length) { box.innerHTML = '<div class="aviso" style="background:#f3faf4;border-color:#bfe3c8">✅ Todas as reservas diretas recentes têm contrato arquivado.</div>'; return; }
    box.innerHTML = `<div class="followups" style="border-left-color:var(--alerta);background:#fdf4f3">
      <strong style="color:var(--alerta)">⚠️ ${pendentes.length} reserva(s) direta(s) sem contrato (últimos 30 dias)</strong>
      ${pendentes.slice(0, 12).map(p => `<span class="chip">${esc(p.hospede)} · ${esc(p.imovel)} · ${esc(p.checkIn || '')}${p.reserva ? ' · ' + esc(p.reserva) : ''}</span>`).join('')}</div>`;
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

// --------- Metas (OKR) por área, com termômetro ---------
async function renderMetas() {
  const c = conteudo();
  const podeDef = ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('ceo');
  c.innerHTML = cabecalho('Metas (OKR)', 'Alvos por área e mês, com termômetro de progresso. Indicadores automáticos puxam o valor atual da operação; os demais você atualiza à mão.') + `
    ${podeDef ? `<details class="cr-box" id="mt-box"><summary class="cr-sum">➕ Nova meta</summary>
      <form class="form" id="mt-form" style="max-width:660px;margin-top:12px">
        <div class="hi-grid">
          <label>Área <select id="mt-area"></select></label>
          <label>Mês <input id="mt-mes" type="month" value="${mesAtual()}"></label>
          <label>Indicador <select id="mt-ind"></select></label>
          <label>Alvo <input id="mt-alvo" type="number" step="0.01" min="0"></label>
        </div>
        <label id="mt-wrap-titulo" class="hidden">Nome do indicador (livre) <input id="mt-titulo" maxlength="80" placeholder="ex.: Taxa de ocupação"></label>
        <label id="mt-wrap-unidade" class="hidden">Unidade <select id="mt-unidade"><option value="nº">nº</option><option value="%">%</option><option value="R$">R$</option></select></label>
        <label id="mt-wrap-atual" class="hidden">Valor atual (manual) <input id="mt-atual" type="number" step="0.01"></label>
        <button class="btn" type="submit">Criar meta</button>
      </form>
    </details>` : ''}
    <div id="mt-lista"><p class="vazio">Carregando…</p></div>`;
  if (podeDef) {
    const { indicadoresAuto, areas } = await api('GET', '/metas');
    $('#mt-area').innerHTML = areas.map(a => `<option value="${a.id}" ${a.id === 'ceo' ? 'selected' : ''}>${esc(a.nome)}</option>`).join('');
    const auto = Object.entries(indicadoresAuto).map(([k, v]) => `<option value="${k}">${esc(v.titulo)} (auto)</option>`).join('');
    $('#mt-ind').innerHTML = auto + '<option value="">Outro (manual)…</option>';
    const ajusta = () => {
      const manual = $('#mt-ind').value === '';
      $('#mt-wrap-titulo').classList.toggle('hidden', !manual);
      $('#mt-wrap-unidade').classList.toggle('hidden', !manual);
      $('#mt-wrap-atual').classList.toggle('hidden', !manual);
    };
    $('#mt-ind').onchange = ajusta; ajusta();
    $('#mt-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const key = $('#mt-ind').value;
      const corpo = { area: $('#mt-area').value, mes: $('#mt-mes').value, alvo: $('#mt-alvo').value };
      if (key) corpo.indicadorKey = key;
      else { corpo.titulo = $('#mt-titulo').value.trim(); corpo.unidade = $('#mt-unidade').value; corpo.atualManual = $('#mt-atual').value; if (!corpo.titulo) { alert('Dê um nome ao indicador.'); return; } }
      try { await api('POST', '/metas', corpo); $('#mt-form').reset(); $('#mt-mes').value = mesAtual(); ajusta(); $('#mt-box').open = false; carregarMetas(); }
      catch (e) { alert(e.message); }
    };
  }
  carregarMetas();
}
function fmtMeta(v, u) { return u === 'R$' ? rMoney(v) : (Number(v).toLocaleString('pt-BR') + (u === '%' ? '%' : '')); }
async function carregarMetas() {
  const alvo = $('#mt-lista'); if (!alvo) return;
  const podeDef = ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('ceo');
  try {
    const { metas } = await api('GET', '/metas');
    if (!metas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma meta definida. Crie a primeira acima.</div>'; return; }
    alvo.innerHTML = metas.map(m => {
      const pct = m.pct == null ? 0 : Math.max(0, Math.min(100, m.pct));
      const cor = pct >= 100 ? 'var(--ok)' : pct >= 60 ? 'var(--lago)' : pct >= 30 ? 'var(--cerrado)' : 'var(--alerta)';
      return `<div class="item">
        <div class="meta"><span class="chip">${esc(nomeArea(m.area))}</span><span class="chip">${esc(m.mes)}</span>${m.indicadorKey ? '<span class="chip">auto</span>' : ''}</div>
        <h3 style="margin:6px 0 2px">${esc(m.titulo)}</h3>
        <div style="display:flex;align-items:center;gap:10px;margin:6px 0">
          <div style="flex:1;background:var(--areia);border-radius:20px;height:14px;overflow:hidden;border:1px solid var(--borda)">
            <div style="height:100%;width:${pct}%;background:${cor};transition:width .3s"></div></div>
          <b style="color:${cor};white-space:nowrap">${m.pct == null ? '—' : m.pct + '%'}</b>
        </div>
        <div class="meta"><span>${fmtMeta(m.atual, m.unidade)} de ${fmtMeta(m.alvo, m.unidade)}</span>${m.obs ? `<span>· ${esc(m.obs)}</span>` : ''}</div>
        ${podeDef ? `<div class="acoes">
          ${m.indicadorKey ? '' : `<button class="btn peq secund" data-atual="${m.id}" data-u="${esc(m.unidade)}">Atualizar valor</button>`}
          <button class="btn peq secund" data-alvo="${m.id}" data-u="${esc(m.unidade)}">Editar alvo</button>
          <button class="btn peq perigo" data-del-mt="${m.id}">Excluir</button></div>` : ''}
      </div>`;
    }).join('');
    if (podeDef) {
      alvo.querySelectorAll('[data-atual]').forEach(b => b.onclick = async () => { const v = prompt('Valor atual (' + b.dataset.u + '):'); if (v == null) return; try { await api('PATCH', '/metas/' + b.dataset.atual, { atualManual: v }); carregarMetas(); } catch (e) { alert(e.message); } });
      alvo.querySelectorAll('[data-alvo]').forEach(b => b.onclick = async () => { const v = prompt('Novo alvo (' + b.dataset.u + '):'); if (v == null) return; try { await api('PATCH', '/metas/' + b.dataset.alvo, { alvo: v }); carregarMetas(); } catch (e) { alert(e.message); } });
      alvo.querySelectorAll('[data-del-mt]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta meta?')) return; try { await api('DELETE', '/metas/' + b.dataset.delMt); carregarMetas(); } catch (e) { alert(e.message); } });
    }
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Datas quentes (alta demanda) ---------
async function renderDatasQuentes() {
  const c = conteudo();
  const podeDef = ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('ceo') || ESTADO.areas.includes('revenue');
  c.innerHTML = cabecalho('Datas quentes', 'Períodos de alta demanda em Brasília. Marque "preço ajustado?" para não vender barato nas datas nobres.') + `
    ${podeDef ? `<details class="cr-box" id="dq-box"><summary class="cr-sum">➕ Nova data quente</summary>
      <form class="form" id="dq-form" style="max-width:660px;margin-top:12px">
        <label>Evento / período * <input id="dq-nome" required maxlength="120" placeholder="ex.: Réveillon 2026/2027"></label>
        <div class="hi-grid">
          <label>De <input id="dq-de" type="date"></label>
          <label>Até <input id="dq-ate" type="date"></label>
          <label>Estadia mínima (noites) <input id="dq-minstay" type="number" min="0" step="1"></label>
          <label class="serv-ativo" style="align-self:end"><input type="checkbox" id="dq-preco"> Preço já ajustado</label>
        </div>
        <label>Observação <input id="dq-obs" maxlength="200"></label>
        <button class="btn" type="submit">Adicionar</button>
      </form>
    </details>` : ''}
    <div id="dq-lista"><p class="vazio">Carregando…</p></div>`;
  if (podeDef) {
    $('#dq-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const corpo = { nome: $('#dq-nome').value.trim(), de: $('#dq-de').value, ate: $('#dq-ate').value, minStay: $('#dq-minstay').value, precoAjustado: $('#dq-preco').checked, obs: $('#dq-obs').value.trim() };
      try { await api('POST', '/revenue/datas-quentes', corpo); $('#dq-form').reset(); $('#dq-box').open = false; carregarDatasQuentes(); }
      catch (e) { alert(e.message); }
    };
  }
  carregarDatasQuentes();
}
async function carregarDatasQuentes() {
  const alvo = $('#dq-lista'); if (!alvo) return;
  const podeDef = ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('ceo') || ESTADO.areas.includes('revenue');
  try {
    const { datas } = await api('GET', '/revenue/datas-quentes');
    if (!datas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma data quente cadastrada. Adicione as datas nobres (Réveillon, Carnaval, Marcha dos Prefeitos…).</div>'; return; }
    alvo.innerHTML = datas.map(d => {
      const cor = d.precoAjustado ? 'var(--ok)' : 'var(--alerta)';
      const per = [d.de, d.ate].filter(Boolean).map(x => x.slice(8, 10) + '/' + x.slice(5, 7)).join(' a ');
      return `<div class="linha-item" style="border-left:4px solid ${cor};${d.passada ? 'opacity:.55' : ''}">
        <span class="qtd" style="background:${cor};color:#fff">${d.precoAjustado ? '✓' : '!'}</span>
        <span class="nome">${esc(d.nome)} <span class="obs">${per ? per : ''}${d.minStay ? ' · mín. ' + d.minStay + ' noites' : ''}${d.obs ? ' · ' + esc(d.obs) : ''}${d.passada ? ' · (passada)' : ''}</span>
          <br><b style="color:${cor}">${d.precoAjustado ? 'Preço ajustado' : '⚠️ Preço NÃO ajustado'}</b></span>
        ${podeDef ? `<div class="acoes" style="grid-column:2;grid-row:1/span 3">
          <button class="btn peq ${d.precoAjustado ? 'secund' : ''}" data-toggle-dq="${d.id}" data-v="${d.precoAjustado ? 0 : 1}">${d.precoAjustado ? 'Desmarcar' : 'Marcar ajustado'}</button>
          <button class="btn peq perigo" data-del-dq="${d.id}">✕</button></div>` : ''}
      </div>`;
    }).join('');
    if (podeDef) {
      alvo.querySelectorAll('[data-toggle-dq]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/revenue/datas-quentes/' + b.dataset.toggleDq, { precoAjustado: b.dataset.v === '1' }); carregarDatasQuentes(); } catch (e) { alert(e.message); } });
      alvo.querySelectorAll('[data-del-dq]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta data?')) return; try { await api('DELETE', '/revenue/datas-quentes/' + b.dataset.delDq); carregarDatasQuentes(); } catch (e) { alert(e.message); } });
    }
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Acessos do Hóspede (contas da Área do Hóspede / app) ---------
async function renderAcessosHospede() {
  const c = conteudo();
  c.innerHTML = cabecalho('Acessos do Hóspede', 'Quantas pessoas têm cadastro (login e senha) para acessar a Área do Hóspede e o app — sempre atualizado.') + '<div id="ah-corpo"><p class="vazio">Carregando…</p></div>';
  try {
    const d = await api('GET', '/hospede/acessos-stats');
    const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;
    const cards = `<div class="cards">
      <div class="card"><div class="n">${d.total}</div><div class="rot">👤 Contas cadastradas (login e senha)</div></div>
      <div class="card"><div class="n" style="color:var(--ok)">${d.ativas}</div><div class="rot">✅ Ativas</div></div>
      <div class="card"><div class="n">${d.jaAcessaram}</div><div class="rot">🔓 Já acessaram (${pct(d.jaAcessaram, d.total)}%)</div></div>
      <div class="card"><div class="n" style="color:${d.pendentes1oAcesso ? 'var(--cerrado)' : 'var(--ok)'}">${d.pendentes1oAcesso}</div><div class="rot">⏳ Pendentes de 1º acesso</div></div>
      <div class="card"><div class="n" style="color:var(--lago)">${d.comApp}</div><div class="rot">📱 Com app/notificações ativas</div></div>
      <div class="card"><div class="n">${d.ativos30}</div><div class="rot">🔁 Ativos nos últimos 30 dias</div></div>
      <div class="card"><div class="n">${d.novos30}</div><div class="rot">🆕 Novos nos últimos 30 dias</div></div>
      <div class="card"><div class="n">${d.comVinculoStays}</div><div class="rot">🔗 Vinculadas a cliente da Stays</div></div>
    </div>`;
    const trend = d.meses && d.meses.length ? `<h2 class="titulo" style="font-size:1.15rem">Novos cadastros por mês</h2>
      <div class="lista-itens">${d.meses.map(m => {
        const max = Math.max(...d.meses.map(x => x.n)) || 1;
        return `<div class="linha-item"><span class="nome">${esc(m.mes)}</span><span class="quem" style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;height:10px;width:${Math.round(160 * m.n / max)}px;background:var(--lago);border-radius:5px"></span> ${m.n}</span></div>`;
      }).join('')}</div>` : '';
    const rec = d.recentes && d.recentes.length ? `<h2 class="titulo" style="font-size:1.15rem">Últimos cadastros</h2>
      <div class="lista-itens">${d.recentes.map(r => `<div class="linha-item"><span class="nome">${esc(r.nome)} ${r.app ? '<span class="chip">📱 app</span>' : ''} ${r.acessou ? '<span class="chip">🔓 acessou</span>' : '<span class="chip">⏳ 1º acesso</span>'}</span><span class="quem">${r.criadoEm ? dataBr(r.criadoEm) : ''}</span></div>`).join('')}</div>` : '';
    $('#ah-corpo').innerHTML = cards + trend + rec + `<p class="cal-rodape">Atualizado em ${dataBr(d.geradoEm)}. "Pendentes de 1º acesso" = receberam a senha temporária e ainda não entraram. "Com app" = instalaram o app (PWA) e ativaram notificações. Sem dados pessoais nesta tela (LGPD); a lista completa fica em Área do Hóspede, só admin.</p>`;
  } catch (e) { $('#ah-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
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
      ${ed ? `<button class="btn secund" type="button" id="u-link">🔗 Link de acesso</button>` : ''}
      ${ed && u.id !== ESTADO.me.id ? `<button class="btn perigo" type="button" id="u-del">Remover</button>` : ''}
      <button class="btn secund" type="button" id="u-cancel">Cancelar</button>
    </div>
    <div id="u-link-box" class="hidden aviso" style="margin-top:10px"></div>
    <p id="u-msg" class="erro"></p>
  </form>`;
  const togglAreas = () => { $('#bloco-areas').style.display = $('#u-papel').value === 'admin' ? 'none' : ''; };
  $('#u-papel').onchange = togglAreas; togglAreas();
  $('#u-cancel').onclick = () => navegar('usuarios');
  if ($('#u-del')) $('#u-del').onclick = async () => { if (!confirm('Remover este usuário?')) return; try { await api('DELETE', '/usuarios/' + u.id); navegar('usuarios'); } catch (e) { $('#u-msg').textContent = e.message; } };
  if ($('#u-link')) $('#u-link').onclick = async () => {
    try {
      const r = await api('POST', '/usuarios/' + u.id + '/link-acesso');
      const url = location.origin + '/staff/?acesso=' + r.token;
      const box = $('#u-link-box'); box.classList.remove('hidden');
      box.innerHTML = `Link de acesso (válido ${r.expiraMin} min) — envie por WhatsApp para <b>${esc(u.nome)}</b>:<br>
        <input value="${esc(url)}" readonly style="width:100%;margin:6px 0" onclick="this.select()">
        <button class="btn peq" id="u-link-copy">📋 Copiar</button>`;
      $('#u-link-copy').onclick = () => navigator.clipboard.writeText(url).then(() => { $('#u-link-copy').textContent = '✓ Copiado'; });
    } catch (e) { $('#u-msg').textContent = e.message; }
  };
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
       <div id="crm-sla"></div>
       <div id="crm-receita"></div>
       <div id="crm-followups"></div>
       <div id="crm-board" class="kanban"><div class="vazio">Carregando…</div></div>`;
  $('#crm-novo').onclick = () => crmFormContato();
  $('#crm-metricas').onclick = () => renderCRMMetricas();
  let t; $('#crm-busca').oninput = () => { clearTimeout(t); t = setTimeout(crmCarregar, 250); };
  crmCarregar();
  crmCarregarSla();
  crmCarregarReceita();
}

// SLA de 1ª resposta: banner com leads novos parados há mais de 2h sem resposta humana.
async function crmCarregarSla() {
  const box = $('#crm-sla'); if (!box) return;
  try {
    const { atrasados } = await api('GET', '/crm/sla?horas=2');
    if (!atrasados.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="followups" style="border-left-color:var(--alerta);background:#fdf4f3">
      <strong style="color:var(--alerta)">⏱ ${atrasados.length} lead(s) sem 1ª resposta há +2h</strong>
      ${atrasados.slice(0, 12).map(a => `<button class="fu-chip atrasado" data-id="${esc(a.id)}">${esc(a.nome)} · ${a.esperaHoras}h${a.origem ? ' · ' + esc(a.origem) : ''}</button>`).join('')}
    </div>`;
    box.querySelectorAll('.fu-chip').forEach(b => b.onclick = () => crmAbrirContato(b.dataset.id));
  } catch (_) { box.innerHTML = ''; }
}

// Receita prevista por mês (soma de valorEstimado dos negócios em aberto, por mês de check-in).
async function crmCarregarReceita() {
  const box = $('#crm-receita'); if (!box) return;
  try {
    const { meses, semData, total } = await api('GET', '/crm/receita-prevista');
    if (!total) { box.innerHTML = ''; return; }
    const chips = meses.map(m => `<span class="chip">${esc(m.mes)}: <b>${rMoney(m.valor)}</b></span>`).join(' ');
    box.innerHTML = `<div class="followups" style="border-left-color:var(--lago)">
      <strong>💰 Receita prevista no funil: ${rMoney(total)}</strong> ${chips}
      ${semData ? `<span class="chip">sem data: ${rMoney(semData)}</span>` : ''}</div>`;
  } catch (_) { box.innerHTML = ''; }
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

// Link wa.me a partir do telefone salvo (só dígitos); stopPropagation p/ não abrir a ficha junto.
const waLink = (tel) => 'https://wa.me/' + String(tel).replace(/\D/g, '');
function crmCardHtml(c) {
  const pa = c.proximaAcao || {};
  return `<div class="kard" draggable="true" data-id="${esc(c.id)}">
    <div class="kard-nome">${esc(c.nome || c.telefone || 'sem nome')}${c.telefone ? ` <a class="kard-wa" href="${waLink(c.telefone)}" target="_blank" rel="noopener" title="Chamar no WhatsApp" onclick="event.stopPropagation()">💬</a>` : ''}</div>
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
            ${c.telefone ? `<a class="btn peq" style="margin-top:10px" href="${waLink(c.telefone)}" target="_blank" rel="noopener">💬 Chamar no WhatsApp</a>` : ''}
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
          <div class="ficha-bloco"><h3>💬 Cotação rápida</h3>
            <label>Imóvel <select id="cot-imovel"><option value="">Carregando…</option></select></label>
            <div class="hi-grid">
              <label>Check-in <input id="cot-in" type="date" value="${esc((per.checkin || ''))}"></label>
              <label>Check-out <input id="cot-out" type="date" value="${esc((per.checkout || ''))}"></label>
            </div>
            <label>Nº de hóspedes <input id="cot-hosp" type="number" min="1" value="${esc(per.hospedes || '')}"></label>
            <button class="btn peq" id="cot-consultar">Consultar preço e gerar cotação</button>
            <div id="cot-saida"></div>
          </div>
          <div class="ficha-bloco"><h3>Histórico Stays</h3><div id="stays-hist" class="vazio">Carregando…</div></div>
          <div class="ficha-bloco"><h3>Linha do tempo</h3><div class="timeline">${tl}</div></div>
        </div>
      </div>`;
    $('#crm-voltar').onclick = () => navegar('crm');
    crmCotacaoInit(c);
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

// Cotação rápida na ficha do CRM: escolhe imóvel + datas, consulta disponibilidade/tarifa (Stays)
// e gera um texto de cotação pronto para colar no WhatsApp (padrão FAQ: sinal 50% + 50%).
let _cotImoveis = null;
async function crmCotacaoInit(contato) {
  const sel = $('#cot-imovel'); if (!sel) return;
  try {
    if (!_cotImoveis) _cotImoveis = (await api('GET', '/stays/imoveis')).imoveis;
    const alvo = normaliza(contato.imovelInteresse || '');
    sel.innerHTML = '<option value="">— escolha o imóvel —</option>' + _cotImoveis.map(im =>
      `<option value="${im.idlisting}" data-cod="${esc(im.codigo)}" data-tit="${esc(im.titulo)}" ${alvo && (normaliza(im.codigo) === alvo || normaliza(im.titulo).includes(alvo) || alvo.includes(normaliza(im.codigo))) ? 'selected' : ''}>${esc(im.codigo)} · ${esc(im.titulo)}</option>`).join('');
  } catch (e) { sel.innerHTML = '<option value="">falha ao carregar imóveis</option>'; }
  $('#cot-consultar').onclick = () => crmCotacaoConsultar(contato);
}
async function crmCotacaoConsultar(contato) {
  const sel = $('#cot-imovel'), saida = $('#cot-saida');
  const idlisting = sel.value, from = $('#cot-in').value, to = $('#cot-out').value;
  const hosp = $('#cot-hosp').value;
  if (!idlisting || !from || !to || to <= from) { saida.innerHTML = '<p class="erro">Escolha o imóvel e datas válidas (check-out após o check-in).</p>'; return; }
  saida.innerHTML = '<p class="sub">Consultando a Stays…</p>';
  try {
    const d = await api('GET', `/stays/disponibilidade?listingId=${encodeURIComponent(idlisting)}&from=${from}&to=${to}`);
    const opt = sel.options[sel.selectedIndex];
    const cod = opt.dataset.cod, tit = opt.dataset.tit;
    const noites = d.noites.length;
    const total = d.totalSugerido || 0;
    const brl = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const fmtData = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
    const disp = d.todasLivres ? '<span style="color:var(--ok);font-weight:700">✅ Disponível</span>' : '<span style="color:var(--alerta);font-weight:700">⚠️ Há noites ocupadas no período</span>';
    const sinal = total / 2;
    const texto = `Olá${contato.nome ? ', ' + contato.nome.split(' ')[0] : ''}! Segue a cotação da ${tit}:\n\n`
      + `📅 ${fmtData(from)} a ${fmtData(to)} (${noites} ${noites === 1 ? 'noite' : 'noites'})\n`
      + `👥 ${hosp || '—'} hóspede(s)\n`
      + `💰 Total: ${brl(total)}\n\n`
      + `Para reservar: sinal de 50% (${brl(sinal)}) e os outros 50% (${brl(sinal)}) até 1 semana antes do check-in.\n\n`
      + `Posso segurar essas datas para você? 😊`;
    saida.innerHTML = `<div class="cr-resumo ${d.todasLivres ? 'ok' : 'bloq'}" style="margin-top:12px">
      <div>${cod} · ${esc(tit)} — ${disp}</div>
      <div>${noites} noite(s) · Total sugerido <b>${brl(total)}</b> · Sinal 50% <b>${brl(sinal)}</b></div>
    </div>
    <textarea id="cot-texto" rows="9" style="margin-top:10px;width:100%">${esc(texto)}</textarea>
    <div class="acoes">
      <button class="btn peq" id="cot-copiar">📋 Copiar texto</button>
      ${contato.telefone ? `<a class="btn peq secund" target="_blank" rel="noopener" href="https://wa.me/${String(contato.telefone).replace(/\D/g, '')}?text=${encodeURIComponent(texto)}">💬 Abrir no WhatsApp</a>` : ''}
      <button class="btn peq secund" id="cot-registrar">Registrar na timeline</button>
    </div>`;
    $('#cot-copiar').onclick = () => { navigator.clipboard.writeText($('#cot-texto').value).then(() => { $('#cot-copiar').textContent = '✓ Copiado'; }); };
    $('#cot-registrar').onclick = async () => {
      try { await api('POST', '/crm/contatos/' + contato.id + '/atividade', { tipo: 'cotacao', texto: `Cotação ${cod} ${fmtData(from)}–${fmtData(to)}: ${brl(total)}` }); alert('Registrado na timeline.'); }
      catch (e) { alert(e.message); }
    };
  } catch (e) { saida.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
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
// Botão ☰ (mobile): abre/fecha a gaveta do menu
if ($('#btn-menu')) $('#btn-menu').onclick = () => { const m = $('#menu'); if (m) m.classList.toggle('aberto'); };

init();
