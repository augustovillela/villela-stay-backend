'use strict';
// ============================================================================
// Portal Staff — módulo: app-core (shell). Shell do SPA: helpers ($, api, esc, mdParaHtml), bootstrap (init/login/abrirApp), menu, lançador, navegação, polling e push (PWA).
// Módulos clássicos: TODOS compartilham o escopo global. Ordem de carga no index.html;
// app-boot.js é sempre o último (chama init()).
// ============================================================================
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
  const numerada = (l) => /^\s*\d+[.)]\s+/.test(l);
  const quote = (l) => /^\s*>\s?/.test(l);
  const novoBloco = (l) => branco(l) || head(l) || tab(l) || lista(l) || numerada(l) || quote(l);
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
    if (numerada(l)) {
      const it = [];
      while (i < linhas.length && !branco(linhas[i]) && !head(linhas[i]) && !tab(linhas[i]) && !quote(linhas[i]) && !lista(linhas[i])) {
        if (numerada(linhas[i])) it.push(linhas[i].replace(/^\s*\d+[.)]\s+/, ''));
        else if (it.length) it[it.length - 1] += ' ' + linhas[i].trim();
        else break;
        i++;
      }
      out += `<ol>${it.map(t => `<li>${inline(t)}</li>`).join('')}</ol>`;
      continue;
    }
    if (lista(l)) {
      const it = [];
      while (i < linhas.length && !branco(linhas[i]) && !head(linhas[i]) && !tab(linhas[i]) && !quote(linhas[i]) && !numerada(linhas[i])) {
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
  $('#quem').title = $('#quem').textContent; // no celular o nome pode vir cortado com reticências
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
  // F5 / link com #secao: reabre o painel que estava aberto; sem hash (ou sem acesso a ele), home.
  const alvo = secaoDaUrl();
  navegar(secaoPermitida(alvo) ? alvo : 'visao');
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
    { id: 'manuais', rot: '📖 Manuais & FAQ' },
    ...(tem('ti') ? [{ id: 'faq-claude', rot: '🤖 FAQ do Claude' }] : []),
    { id: 'instalar', rot: '📲 Baixar o app' },
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
  if (ehAdmin || tem('concierge') || tem('marketing')) hosp.push({ id: 'eva-conhecimento', rot: '🧠 Conhecimento da Eva' });
  if (hosp.length) itens.push({ grupo: 'Hóspedes' }, ...hosp);
  const gestao = [];
  if (ehAdmin || tem('ceo')) gestao.push({ id: 'metas', rot: '🎯 Metas (OKR)' });
  if (tem('financeiro') || tem('vendas') || tem('ceo')) gestao.push({ id: 'recebimentos', rot: '💵 Recebimentos' });
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
  if (tem('contador') || tem('financeiro') || tem('ceo')) gestao.push({ id: 'fechamento', rot: '📁 Fechamento contábil' });
  if (tem('compras') || tem('financeiro') || tem('ceo')) gestao.push({ id: 'compras-precos', rot: '🛍️ Histórico de preços' });
  if (gestao.length) itens.push({ grupo: 'Gestão' }, ...gestao);
  if (tem('ti') || tem('ceo')) itens.push({ grupo: 'Academy' }, { id: 'academy', rot: '🎓 Villela Academy' });
  if (tem('livros')) itens.push({ grupo: 'Livraria' }, { id: 'livraria', rot: '📚 Gestão de Livros' });
  if (tem('juridico') || tem('ceo')) itens.push({ grupo: 'Legal Intelligence' }, { id: 'legal', rot: '⚖️ Villela Legal' });
  if (tem('ceo') || tem('ti')) itens.push({ id: 'legal-saas', rot: '⚖️💼 Legal SaaS' });
  if (tem('ti') || tem('ceo')) itens.push({ grupo: 'Docs Intelligence' }, { id: 'vdocs', rot: '🗂️ Villela Docs' });
  if (tem('ti') || tem('ceo')) itens.push({ grupo: 'Projects & Events' }, { id: 'vpe', rot: '📋 Villela Projects' });
  if (tem('ti') || tem('ceo')) itens.push({ grupo: 'Stay Manager' }, { id: 'vsm', rot: '🏨 Stay Manager' });
  if (tem('ti') || tem('ceo') || tem('vendas')) itens.push({ grupo: 'Villela CRM (SaaS)' }, { id: 'vcrm', rot: '🤝 Villela CRM' });
  if (tem('ti') || tem('ceo') || tem('vendas')) itens.push({ grupo: 'Closet Club (marketplace)' }, { id: 'closet', rot: '👗 Closet Club' });
  if (tem('ti') || tem('ceo') || tem('vendas')) itens.push({ grupo: 'Vitrine (marketplace de usados)' }, { id: 'vitrine', rot: '🛒 Vitrine' });
  if (tem('ti') || tem('ceo') || tem('vendas') || tem('marketing')) itens.push({ grupo: 'Alta Vista 360 (estúdio visual)' }, { id: 'alta-vista', rot: '🚁 Alta Vista 360' });
  if (tem('ti') || tem('ceo')) itens.push({ grupo: 'Invente (Villela Kids)' }, { id: 'kids', rot: '🧒 Invente' });
  itens.push({ grupo: 'Operação' });
  itens.push({ id: 'limpezas', rot: '🧹 Limpezas de hoje' });
  itens.push({ id: 'compras', rot: '🛒 Lista de compras' });
  itens.push({ id: 'manutencao-chamados', rot: '🛠️ Manutenção' });
  if (tem('manutencao') || tem('operacoes') || tem('obras') || tem('ceo')) itens.push({ id: 'tecnicos', rot: '👷 Técnicos' });
  if (tem('manutencao') || tem('operacoes') || tem('obras') || tem('ceo')) itens.push({ id: 'ativos', rot: '🧰 Equipamentos' });
  if (tem('operacoes') || tem('compras') || tem('ceo')) itens.push({ id: 'estoque', rot: '🧴 Estoque & enxoval' });
  // Pendências é restrita à área CEO (admin vê tudo); demais não veem o item.
  if (tem('ceo')) itens.push({ id: 'pendencias', rot: '✅ Pendências' });
  // Bloco de Notas: anotações livres do Augusto — mesma restrição das pendências (área CEO).
  if (tem('ceo')) itens.push({ id: 'notas', rot: '🗒️ Bloco de Notas' });
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
  if (ehAdmin) itens.push({ id: 'cortesia', rot: '🎟️ Acessos de Teste' });
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

// --------- Instalar o app (PWA) ---------
// Guarda o evento beforeinstallprompt (Chrome/Edge Android e desktop) para oferecer a
// instalação nativa com 1 clique. Em navegadores sem esse evento (ex.: iPhone/Safari),
// a tela mostra o passo a passo manual.
let _promptInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); _promptInstalar = e; });
window.addEventListener('appinstalled', () => { _promptInstalar = null; if (ESTADO.secao === 'instalar') renderInstalar(); });
const appInstalado = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function renderInstalar() {
  const c = conteudo();
  c.innerHTML = cabecalho('📲 Baixar o app', 'Instale o Portal Staff como aplicativo no celular ou no computador — abre em tela cheia, com ícone próprio, e fica a um toque de distância.');
  if (appInstalado()) {
    c.innerHTML += `<div class="card"><p style="margin:0">✅ <b>Você já está usando o app instalado.</b> Ele abre direto pelo ícone na tela inicial / na área de trabalho.</p></div>`;
    return;
  }
  const temPrompt = !!_promptInstalar;
  c.innerHTML += `
    <div class="card">
      ${temPrompt
        ? `<p style="margin:0 0 .8rem">Seu navegador permite instalar em 1 clique:</p>
           <button class="btn" id="btn-instalar">📲 Instalar agora</button>
           <p id="instalar-msg" class="sub" style="margin:.6rem 0 0"></p>`
        : `<p style="margin:0">Use o passo a passo do seu aparelho abaixo. (No computador, o ícone de instalar costuma aparecer na barra de endereço do Chrome/Edge.)</p>`}
    </div>
    <div class="card">
      <h3 style="margin:.2rem 0 .6rem">📱 Android (Chrome)</h3>
      <p style="margin:0">Toque no menu <b>⋮</b> (canto superior direito) → <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>) → <b>Instalar</b>.</p>
    </div>
    <div class="card">
      <h3 style="margin:.2rem 0 .6rem">🍎 iPhone / iPad (Safari)</h3>
      <p style="margin:0">Toque em <b>Compartilhar</b> (ícone de caixa com uma seta para cima ⬆️) → <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.</p>
    </div>
    <div class="card">
      <h3 style="margin:.2rem 0 .6rem">💻 Computador (Chrome / Edge)</h3>
      <p style="margin:0">Clique no ícone de <b>instalar</b> (⊕ / monitor com seta) na barra de endereço, ou menu <b>⋮</b> → <b>Instalar Portal Staff</b>.</p>
    </div>
    <p class="cal-rodape">O app é o próprio portal (mesmo login). Precisa de internet para atualizar os dados; instalar só deixa o acesso mais rápido e em tela cheia.</p>`;
  const b = $('#btn-instalar');
  if (b) b.onclick = async () => {
    if (!_promptInstalar) { renderInstalar(); return; }
    b.disabled = true;
    try {
      _promptInstalar.prompt();
      const { outcome } = await _promptInstalar.userChoice;
      const msg = $('#instalar-msg');
      if (outcome === 'accepted') { if (msg) msg.textContent = '✅ Instalando… o ícone vai aparecer na sua tela inicial.'; _promptInstalar = null; }
      else { if (msg) msg.textContent = 'Instalação cancelada. Você pode instalar quando quiser por aqui.'; b.disabled = false; }
    } catch (_) { b.disabled = false; }
  };
}

// Vertical de cada modulo: alimenta o token --vx-accent do design system
// (assets/brand/villela-ui.css). So a COR DE ACENTO muda; o resto e igual em
// todo o portal. Modulo que nao esta no mapa herda 'stay', que e o acento
// historico do portal (--lago) — assim nada muda de cor sem intencao.
const VERTICAL_DA_SECAO = {
  legal: 'legal', 'legal-saas': 'legal',
  livraria: 'livraria', vdocs: 'docs', vpe: 'projects', vsm: 'manager',
  vcrm: 'crm', academy: 'academy', closet: 'closet', vitrine: 'stay', kids: 'kids',
  'alta-vista': 'docs', // acento azul/ciano do design system — combina com a paleta da marca (Azul Altitude/Ciano)
  visao: 'grupo', mural: 'grupo', manuais: 'grupo', faq: 'grupo', 'faq-claude': 'grupo',
  instalar: 'grupo', usuarios: 'grupo', conta: 'grupo', auditoria: 'grupo', automacoes: 'grupo',
};

// --------- rota na URL (#secao): F5 recarrega o painel aberto, não a Visão geral ---------
// SPA sem rota volta para a home a cada F5. O hash é a rota mais barata aqui: não exige nada do
// servidor (qualquer #x cai no mesmo index.html), não mexe no menu e sobrevive ao recarregar.
// `replaceState` de propósito, e não `pushState`: o Voltar do navegador continua saindo do portal
// como sempre saiu — se cada clique de menu virasse uma entrada no histórico, sair daqui passaria
// a exigir dezenas de Voltar.
function secaoDaUrl() {
  const h = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
  return /^[a-z0-9-]{1,40}$/i.test(h) ? h : '';
}
// Só aceita seção que o usuário REALMENTE vê no menu: um #hash digitado à mão não abre painel de
// outra área (a API já barraria, mas a tela ficaria com cara de quebrada em vez de simplesmente
// não existir). Toda seção do roteador está no menu, então a lista do menu basta como whitelist.
function secaoPermitida(secao) {
  if (!secao || !ESTADO.me) return false;
  try { return construirItensMenu().some(i => i.id === secao); } catch (_) { return false; }
}
// Hash trocado por fora (usuário editou a URL, abriu um link com #, ou usou Voltar/Avançar).
window.addEventListener('hashchange', () => {
  const app = $('#app');
  if (!app || app.classList.contains('hidden')) return;   // sem sessão aberta, ignora
  const s = secaoDaUrl();
  if (!s || s === ESTADO.secao) return;
  if (secaoPermitida(s)) navegar(s);
});

function navegar(secao) {
  ESTADO.secao = secao;
  // grava a seção na URL para o F5 voltar aqui (sem criar entrada no histórico)
  try {
    if (secaoDaUrl() !== secao) history.replaceState(null, '', location.pathname + location.search + '#' + secao);
  } catch (_) {}
  // escopo do design system no container: uma linha cobre TODOS os modulos
  const cont = $('#conteudo');
  if (cont) {
    cont.classList.add('vx');
    cont.setAttribute('data-vertical', VERTICAL_DA_SECAO[secao] || 'stay');
  }
  document.querySelectorAll('#menu button').forEach(b => b.classList.toggle('ativo', b.dataset.id === secao));
  const menu = $('#menu'); if (menu) menu.classList.remove('aberto'); // fecha a gaveta no mobile ao navegar
  window.scrollTo(0, 0);
  const rotas = { visao: renderVisao, mural: renderMural, faq: renderFAQ, manuais: (typeof renderManuais === 'function' ? renderManuais : renderVisao), 'faq-claude': renderFaqClaude, concierge: renderConcierge, 'pos-estadia': renderPosEstadia, 'contas-pagar': renderContasPagar, dre: renderDRE, revenue: renderRevenue, 'mkt-conversao': renderMktConversao, obras: renderObras, ativos: renderAtivos, estoque: renderEstoque, materiais: renderMateriais, editorial: renderEditorial, depoimentos: renderDepoimentos, redes: renderRedes, contratos: renderContratos, lgpd: renderLGPD, fiscal: renderFiscal, 'compras-precos': renderComprasPrecos, recebimentos: renderRecebimentos, fechamento: renderFechamento, metas: renderMetas, 'datas-quentes': renderDatasQuentes, automacoes: renderAutomacoes, auditoria: renderAuditoria, 'acessos-hospede': renderAcessosHospede, 'prazos-juridicos': renderPrazosJuridicos, limpezas: renderLimpezas, 'manutencao-chamados': renderChamadosManutencao, tecnicos: renderTecnicos, relatorios: renderRelatorios, publicar: renderPublicar, calendario: renderCalendario, 'stays-hospedes': renderStaysHospedes, 'stays-reservas': renderStaysReservas, crm: renderCRM, compras: () => renderLista('compras', 'Lista de compras'), pendencias: renderPendencias, notas: renderNotas, agenda: renderAgenda, leads: () => renderPainel('leads', 'Leads'), precheckins: () => renderPainel('precheckins', 'Pré-check-ins'), chamados: () => renderPainel('chamados', 'Chamados'), eventos: () => renderPainel('eventos', 'Eventos (Stays)'), estatisticas: renderEstatisticas, 'hospede-info': renderHospedeInfo, 'eva-conhecimento': renderEvaConhecimento, 'hospede-pedidos': renderHospedePedidos, 'hospede-fidelidade': renderHospedeFidelidade, 'hospede-conta': renderHospedeConta, usuarios: renderUsuarios, conta: renderConta, instalar: renderInstalar, livraria: (typeof renderLivraria === 'function' ? renderLivraria : renderVisao), legal: (typeof renderLegal === 'function' ? renderLegal : renderVisao), 'legal-saas': (typeof renderLegalSaas === 'function' ? renderLegalSaas : renderVisao), vdocs: (typeof renderVdocs === 'function' ? renderVdocs : renderVisao), vpe: (typeof renderVpe === 'function' ? renderVpe : renderVisao), vsm: (typeof renderVsm === 'function' ? renderVsm : renderVisao), academy: (typeof renderAcademy === 'function' ? renderAcademy : renderVisao), vcrm: (typeof renderVcrm === 'function' ? renderVcrm : renderVisao), closet: (typeof renderCloset === 'function' ? renderCloset : renderVisao), vitrine: (typeof renderVitrine === 'function' ? renderVitrine : renderVisao), 'alta-vista': (typeof renderAltaVista === 'function' ? renderAltaVista : renderVisao), kids: (typeof renderKids === 'function' ? renderKids : renderVisao), cortesia: (typeof renderCortesia === 'function' ? renderCortesia : renderVisao) };
  (rotas[secao] || renderVisao)();
}

const conteudo = () => $('#conteudo');
function cabecalho(titulo, sub) { return `<h1 class="titulo">${esc(titulo)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}`; }

// Tabela do design system, usada por TODOS os modulos (antes cada um levava
// estilo inline). Entrega: wrapper com rolagem controlada, cabecalho fixo,
// th[scope=col] para leitor de tela e data-rot em cada celula — no celular a
// classe .vx-tabela--cards transforma a linha em card rotulado.
// Estava definida em app-livraria.js por acidente de ordem de script; o lugar
// certo e aqui, junto dos outros helpers compartilhados.
function tabela(cols, linhas) {
  const rot = (c) => String(c == null ? '' : c).replace(/<[^>]*>/g, '').trim();
  const cabeca = (cols || []).map(c => `<th scope="col">${c}</th>`).join('');
  const corpo = (linhas || []).map(l => `<tr>${(l || []).map((c, i) =>
    `<td data-rot="${esc(rot((cols || [])[i]))}">${c == null ? '' : c}</td>`).join('')}</tr>`).join('');
  return `<div class="vx-tabela-wrap"><table class="vx-tabela--cards">
    <thead><tr>${cabeca}</tr></thead><tbody>${corpo}</tbody></table></div>`;
}
