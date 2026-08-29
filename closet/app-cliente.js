'use strict';
/* ============================================================================
 * Closet Club — painel do usuário (/closet/app).
 * Script clássico, sem build e sem framework, no padrão dos outros produtos
 * do grupo. A MESMA pessoa é proprietária e cliente: as abas "Peças/Reservas"
 * são a vida de anunciante e "Meus aluguéis" a de cliente.
 * ==========================================================================*/

var EU = null, ENT = null, ABA = 'inicio';

/* ---------------------------------- utilitários --------------------------- */
function $(sel) { return document.querySelector(sel); }
function el(id) { return document.getElementById(id); }
function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
function brl0(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }
function dia(d) { return d ? String(d).slice(0, 10).split('-').reverse().join('/') : ''; }
function hoje() { return new Date().toISOString().slice(0, 10); }

async function api(metodo, caminho, corpo) {
  const r = await fetch('/closet/api' + caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const t = await r.text();
  let d = null; try { d = JSON.parse(t); } catch (_) {}
  if (r.status === 401) { location.href = '/closet/entrar?voltar=/closet/app'; throw new Error('sessão'); }
  if (!r.ok) throw new Error((d && d.erro) || ('Erro ' + r.status));
  return d;
}

function tela(html) { el('tela').innerHTML = html; }
function carregando() { tela('<p class="vazio">Carregando…</p>'); }
function erroNaTela(e) {
  tela('<div class="painel"><h3>Não consegui carregar</h3><p style="color:var(--cinza-txt);margin:10px 0 18px">' + esc(e.message) + '</p>'
    + '<button class="btn linha peq" onclick="irPara(ABA)">Tentar de novo</button></div>');
}
function modal(html) { const m = el('modal'); m.innerHTML = html + '<div style="margin-top:22px;text-align:right"><button class="btn linha peq" onclick="document.getElementById(\'modal\').close()">Fechar</button></div>'; m.showModal(); }
function fecharModal() { el('modal').close(); }

const EST = {
  aguardando_pagamento: 'aten', pago_bloqueado: 'aten', confirmado: 'ok', retirado: 'ok',
  devolvido: 'aten', concluido: 'ok', recusado: 'ruim', cancelado: 'ruim', expirado: 'ruim',
  em_disputa: 'ruim', reembolsado: 'ruim',
};
function badge(b) { return '<span class="est ' + (EST[b.status] || '') + '">' + esc(b.status_rotulo || b.status) + '</span>'; }

/* ---------------------------------- boot ---------------------------------- */
async function bootCloset() {
  try {
    const me = await api('GET', '/me');
    EU = me.usuario; ENT = me.entitlements;
    el('u-nome').textContent = EU.nome + (EU.plano === 'premium' ? ' · Premium' : '');
    el('sair').onclick = async () => { await api('POST', '/logout'); location.href = '/closet'; };
    montarAbas();
    window.addEventListener('hashchange', roteador);
    roteador();
  } catch (e) {
    if (e.message !== 'sessão') tela('<div class="painel"><h3>Erro ao abrir o painel</h3><p>' + esc(e.message) + '</p></div>');
  }
}

const ABAS = [
  ['inicio', 'Início'], ['pecas', 'Minhas peças'], ['looks', 'Meus looks'], ['reservas', 'Reservas recebidas'],
  ['minhas-reservas', 'Meus aluguéis'], ['financeiro', 'Financeiro'], ['campanhas', 'Patrocinar'],
  ['mensagens', 'Mensagens'], ['favoritos', 'Favoritos'], ['indicar', 'Indicar e ganhar'], ['conta', 'Conta'],
];
function montarAbas() {
  const abas = ABAS.slice();
  // a aba do parceiro só existe para quem é parceiro aprovado
  if (EU && EU.papel === 'parceiro') abas.splice(6, 0, ['parceiro', 'Meus serviços']);
  el('abas').innerHTML = abas.map((a) => '<button class="aba" data-id="' + a[0] + '" onclick="location.hash=\'' + a[0] + '\'">' + a[1] + '</button>').join('');
}
function roteador() {
  const h = (location.hash || '#inicio').slice(1);
  if (h.indexOf('reserva/') === 0) { ABA = 'minhas-reservas'; marcarAba(); return verReserva(h.split('/')[1]); }
  ABA = (ABAS.some((a) => a[0] === h) || h === 'parceiro') ? h : 'inicio';
  marcarAba();
  irPara(ABA);
}
function marcarAba() {
  document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('on', b.dataset.id === ABA));
}
function irPara(aba) {
  const mapa = {
    inicio: telaInicio, pecas: telaPecas, looks: telaLooks, reservas: telaReservas,
    'minhas-reservas': telaMinhasReservas, financeiro: telaFinanceiro, mensagens: telaMensagens,
    favoritos: telaFavoritos, indicar: telaIndicar, parceiro: telaParceiro,
    campanhas: telaCampanhas, conta: telaConta,
  };
  carregando();
  (mapa[aba] || telaInicio)().catch(erroNaTela);
}

/* ---------------------------------- INÍCIO -------------------------------- */
async function telaInicio() {
  const d = await api('GET', '/app/dashboard');
  const s = d.saldo;
  let html = '<div class="kpis">'
    + kpi(brl0(s.em_andamento_centavos), 'a receber (em curso)')
    + kpi(brl0(s.liberado_centavos), 'liberado p/ Pix')
    + kpi(brl0(s.pago_centavos), 'já recebido')
    + kpi(d.pecas.ativas + '/' + d.pecas.total, 'peças ativas')
    + '</div>';

  if (d.precisa_confirmar.length) {
    html += '<div class="painel"><h3>Precisa da sua confirmação</h3>'
      + '<p style="color:var(--cinza-txt);margin:8px 0 18px">O cliente já pagou e o valor está bloqueado. Confirme para gerar o QR Code de retirada.</p>'
      + '<table><thead><tr><th>Reserva</th><th>Retirada</th><th>Valor</th><th>Prazo</th><th></th></tr></thead><tbody>'
      + d.precisa_confirmar.map((b) => '<tr><td><b>' + esc(b.codigo) + '</b></td><td>' + dia(b.data_retirada) + '</td>'
        + '<td>' + brl(b.total_centavos) + '</td><td>' + (b.prazo_confirmacao ? dia(b.prazo_confirmacao) + ' ' + String(b.prazo_confirmacao).slice(11, 16) : '—') + '</td>'
        + '<td style="text-align:right;white-space:nowrap">'
        + '<button class="btn peq" onclick="confirmarReserva(\'' + b.id + '\')">Confirmar</button> '
        + '<button class="btn linha peq" onclick="recusarReserva(\'' + b.id + '\')">Recusar</button></td></tr>').join('')
      + '</tbody></table></div>';
  }

  if (d.minhas_reservas_em_curso.length) {
    html += '<div class="painel"><h3>Meus aluguéis em curso</h3><table><tbody>'
      + d.minhas_reservas_em_curso.map((b) => '<tr><td><b>' + esc(b.codigo) + '</b><br><span style="color:var(--cinza-txt)">'
        + esc(b.itens.map((i) => i.titulo).join(', ')) + '</span></td><td>' + dia(b.data_retirada) + ' → ' + dia(b.data_devolucao) + '</td>'
        + '<td>' + badge(b) + '</td><td style="text-align:right"><button class="btn linha peq" onclick="verReserva(\'' + b.id + '\')">Abrir</button></td></tr>').join('')
      + '</tbody></table></div>';
  }

  if (d.proximas_entregas.length) {
    html += '<div class="painel"><h3>Próximas entregas</h3><table><tbody>'
      + d.proximas_entregas.map((b) => '<tr><td><b>' + esc(b.codigo) + '</b></td><td>' + dia(b.data_retirada) + ' → ' + dia(b.data_devolucao) + '</td>'
        + '<td>' + badge(b) + '</td><td style="text-align:right"><button class="btn linha peq" onclick="verReserva(\'' + b.id + '\')">Abrir</button></td></tr>').join('')
      + '</tbody></table></div>';
  }

  if (!d.pecas.total) {
    html += '<div class="painel" style="text-align:center"><h3>Seu closet está vazio</h3>'
      + '<p style="color:var(--cinza-txt);margin:12px 0 20px">Cadastre a primeira peça — a IA sugere o preço e escreve a descrição.</p>'
      + '<button class="btn" onclick="location.hash=\'pecas\'">Anunciar minha primeira peça</button></div>';
  }
  if (d.notificacoes.length) {
    html += '<div class="painel"><h3>Novidades</h3>' + d.notificacoes.map((no) => '<div style="padding:10px 0;border-bottom:1px solid var(--cinza2)">'
      + '<b>' + esc(no.titulo) + '</b><br><span style="color:var(--cinza-txt);font-size:.9rem">' + esc(no.texto) + '</span></div>').join('')
      + '<button class="btn linha peq" style="margin-top:16px" onclick="api(\'POST\',\'/notificacoes/lidas\').then(()=>irPara(\'inicio\'))">Marcar como lidas</button></div>';
  }
  tela(html);
}
function kpi(n, r) { return '<div class="kpi"><div class="n">' + n + '</div><div class="r">' + r + '</div></div>'; }

/* ---------------------------------- PEÇAS --------------------------------- */
async function telaPecas() {
  const d = await api('GET', '/app/pecas');
  const limite = ENT.limites.pecas;
  tela('<div class="painel"><div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">'
    + '<h3>Minhas peças <span style="color:var(--cinza-txt);font-weight:400">(' + d.pecas.length + (limite ? ' de ' + limite : '') + ')</span></h3>'
    + '<button class="btn peq" onclick="formPeca()">+ Nova peça</button></div>'
    + (d.pecas.length ? '<table style="margin-top:20px"><thead><tr><th>Peça</th><th>Preço/dia</th><th>Situação</th><th>Desempenho</th><th></th></tr></thead><tbody>'
      + d.pecas.map(linhaPeca).join('') + '</tbody></table>'
      : '<p class="vazio">Nenhuma peça ainda. Comece pela que você usou uma vez só.</p>') + '</div>');
}
function linhaPeca(i) {
  const mod = i.moderacao === 'aprovado' ? '<span class="est ok">na vitrine</span>'
    : i.moderacao === 'pendente' ? '<span class="est aten">em análise</span>' : '<span class="est ruim">ajustar</span>';
  const st = i.status === 'ativo' ? '' : ' <span class="est">' + esc(i.status) + '</span>';
  return '<tr><td><b>' + esc(i.titulo) + '</b><br><span style="color:var(--cinza-txt);font-size:.85rem">'
    + esc(i.categoria) + (i.tamanho ? ' · ' + esc(i.tamanho) : '') + (i.marca ? ' · ' + esc(i.marca) : '') + '</span>'
    + (i.moderacao_nota ? '<br><span style="color:#A3232B;font-size:.82rem">' + esc(i.moderacao_nota) + '</span>' : '') + '</td>'
    + '<td>' + brl(i.preco_diaria_centavos) + '</td><td>' + mod + st + '</td>'
    + '<td style="font-size:.85rem;color:var(--cinza-txt)">' + i.visualizacoes + ' visitas · ' + i.alugueis + ' locações'
    + (i.nota_media ? '<br>★ ' + i.nota_media.toFixed(1) : '') + '</td>'
    + '<td style="text-align:right;white-space:nowrap"><button class="btn linha peq" onclick="formPeca(\'' + i.id + '\')">Editar</button> '
    + '<button class="btn linha peq" onclick="agendaPeca(\'' + i.id + '\')">Agenda</button></td></tr>';
}

const OCASIOES_UI = [['casamento', 'Casamento'], ['formatura', 'Formatura'], ['executivo', 'Executivo'], ['noite', 'Noite'],
  ['jantar', 'Jantar'], ['praia', 'Praia'], ['festival', 'Festival'], ['reveillon', 'Réveillon'], ['natal', 'Natal'], ['sessao-fotos', 'Sessão de fotos']];
const CATEGORIAS_UI = ['vestido', 'terno', 'saia', 'blazer', 'bolsa', 'sapato', 'joia', 'acessorio', 'infantil', 'fantasia', 'gestante', 'plus'];
const TAMANHOS_UI = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'unico', '36', '38', '40', '42', '44', '46'];

async function formPeca(id) {
  let p = { ocasioes: [], fotos: [], medidas: {}, modelo: {}, entrega: ['retirada'], min_dias: 1, prep_dias: 1, condicao: 'seminovo', estacao: 'todas', categoria: 'vestido' };
  if (id) { const d = await api('GET', '/app/pecas/' + id); p = d.peca; }
  const campo = (rot, nome, tipo, valor, extra) => '<div><label>' + rot + '</label><input id="p-' + nome + '" type="' + (tipo || 'text') + '" value="' + esc(valor == null ? '' : valor) + '" ' + (extra || '') + '></div>';
  modal('<h3>' + (id ? 'Editar peça' : 'Nova peça') + '</h3>'
    + '<div class="campos" style="margin-top:10px">'
    + campo('Título', 'titulo', 'text', p.titulo)
    + '<div><label>Categoria</label><select id="p-categoria">' + CATEGORIAS_UI.map((c) => '<option' + (p.categoria === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>'
    + campo('Marca', 'marca', 'text', p.marca)
    + '<div><label>Tamanho</label><select id="p-tamanho"><option value=""></option>' + TAMANHOS_UI.map((t) => '<option' + (p.tamanho === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>'
    + campo('Cor', 'cor', 'text', p.cor)
    + '<div><label>Condição</label><select id="p-condicao">' + ['novo', 'seminovo', 'usado'].map((c) => '<option' + (p.condicao === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>'
    + campo('Valor da peça nova (R$)', 'reposicao', 'number', p.valor_reposicao_centavos ? p.valor_reposicao_centavos / 100 : '', 'step="10" min="0"')
    + campo('Preço da diária (R$)', 'diaria', 'number', p.preco_diaria_centavos ? p.preco_diaria_centavos / 100 : '', 'step="5" min="0"')
    + campo('Pacote 3 diárias (R$)', 'p3', 'number', p.preco_3dias_centavos ? p.preco_3dias_centavos / 100 : '', 'step="5" min="0"')
    + campo('Caução (R$)', 'caucao', 'number', p.caucao_centavos ? p.caucao_centavos / 100 : '', 'step="10" min="0"')
    + campo('Mínimo de diárias', 'min', 'number', p.min_dias, 'min="1"')
    + campo('Dias de higienização', 'prep', 'number', p.prep_dias, 'min="0"')
    + campo('Cidade', 'cidade', 'text', p.cidade || EU.cidade)
    + campo('Bairro', 'bairro', 'text', p.bairro || EU.bairro)
    + '</div>'
    + '<label>Ocasiões</label><div id="p-ocasioes">' + OCASIOES_UI.map((o) => '<span class="chip' + ((p.ocasioes || []).indexOf(o[0]) >= 0 ? ' on' : '') + '" data-o="' + o[0] + '" onclick="this.classList.toggle(\'on\')">' + o[1] + '</span>').join('') + '</div>'
    + '<label>Descrição</label><textarea id="p-descricao" rows="5">' + esc(p.descricao || '') + '</textarea>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 4px">'
    + '<button class="btn linha peq" type="button" onclick="iaPreco()">✦ Sugerir preço</button>'
    + '<button class="btn linha peq" type="button" onclick="iaDescricao()">✦ Escrever descrição</button></div>'
    + '<div id="p-ia" style="font-size:.86rem;color:var(--cinza-txt)"></div>'
    + '<label>Fotos</label>'
    + '<div id="p-galeria" class="galeria"></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0">'
    + '<input type="file" id="p-arquivo" accept="image/*" multiple style="width:auto;flex:1;min-width:200px">'
    + (ENT.flags.sem_fundo ? '<label style="text-transform:none;letter-spacing:0;margin:0;color:var(--preto);font-size:.85rem">'
      + '<input type="checkbox" id="p-fundo" style="width:auto;margin-right:6px">Remover fundo liso</label>' : '')
    + '</div>'
    + '<p id="p-upmsg" class="mono" style="margin:0 0 10px"></p>'
    + '<textarea id="p-fotos" rows="2" placeholder="Ou cole URLs, uma por linha" style="font-size:.82rem">' + esc((p.fotos || []).map((f) => f.url).join('\n')) + '</textarea>'
    + '<div class="campos">'
    + campo('Altura da modelo (cm)', 'malt', 'number', (p.modelo || {}).altura_cm)
    + campo('Peso da modelo (kg)', 'mpeso', 'number', (p.modelo || {}).peso_kg)
    + campo('A modelo vestiu (tam.)', 'mvest', 'text', (p.modelo || {}).vestiu)
    + campo('Busto (cm)', 'mbusto', 'number', (p.medidas || {}).busto)
    + campo('Cintura (cm)', 'mcintura', 'number', (p.medidas || {}).cintura)
    + campo('Quadril (cm)', 'mquadril', 'number', (p.medidas || {}).quadril)
    + '</div>'
    + '<label>Situação</label><select id="p-status">'
    + ['rascunho', 'ativo', 'pausado'].map((st) => '<option value="' + st + '"' + ((p.status || 'rascunho') === st ? ' selected' : '') + '>' + st + '</option>').join('') + '</select>'
    + '<p id="p-msg" class="erro" style="margin-top:10px"></p>'
    + '<button class="btn" style="width:100%;margin-top:14px" onclick="salvarPeca(' + (id ? '\'' + id + '\'' : 'null') + ')">Salvar</button>');
  // galeria começa com as fotos que a peça já tem
  FOTOS_PECA = (p.fotos || []).map((f) => ({ url: f.url }));
  pintarGaleria();
  el('p-fotos').value = '';
  el('p-arquivo').onchange = (e) => enviarFotos(e.target.files);
}

/* ------------------------- fotos: enviar do celular ----------------------- */
/* O navegador redimensiona ANTES de enviar: foto de celular tem 4–8MB e nada
 * disso serve numa vitrine. Sobe 1600px de lado maior, JPEG 82% (~250KB). */
const FOTO_LADO = 1600;

function lerArquivo(file) {
  return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = erro; r.readAsDataURL(file); });
}
function carregarImagem(dataUrl) {
  return new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = dataUrl; });
}

/* Remoção de fundo LISO por preenchimento a partir das bordas.
 * Não é segmentação por IA — é um algoritmo determinístico que funciona bem
 * com fundo uniforme (parede, lençol) e mal com fundo cheio. Está rotulado
 * assim na interface: prometer recorte perfeito seria mentira. */
function removerFundoLiso(canvas, tolerancia) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const idx = (x, y) => (y * w + x) * 4;
  // cor de referência = média dos quatro cantos
  let r0 = 0, g0 = 0, b0 = 0;
  const cantos = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  cantos.forEach(([x, y]) => { const i = idx(x, y); r0 += d[i]; g0 += d[i + 1]; b0 += d[i + 2]; });
  r0 /= 4; g0 /= 4; b0 /= 4;
  const tol = (tolerancia || 42) * (tolerancia || 42) * 3;
  const visitado = new Uint8Array(w * h);
  const fila = [];
  for (let x = 0; x < w; x++) { fila.push([x, 0], [x, h - 1]); }
  for (let y = 0; y < h; y++) { fila.push([0, y], [w - 1, y]); }
  while (fila.length) {
    const [x, y] = fila.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (visitado[p]) continue;
    const i = p * 4;
    const dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0;
    if (dr * dr + dg * dg + db * db > tol) continue; // saiu do fundo: para aqui
    visitado[p] = 1;
    d[i + 3] = 0; // transparente
    fila.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

async function prepararFoto(file, semFundo) {
  const dataUrl = await lerArquivo(file);
  const img = await carregarImagem(dataUrl);
  const escala = Math.min(1, FOTO_LADO / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (semFundo) { removerFundoLiso(canvas, 42); return canvas.toDataURL('image/png'); }
  return canvas.toDataURL('image/jpeg', 0.82);
}

let FOTOS_PECA = [];
function pintarGaleria() {
  const g = el('p-galeria');
  if (!g) return;
  g.innerHTML = FOTOS_PECA.length
    ? FOTOS_PECA.map((f, k) => '<div class="foto' + (k === 0 ? ' capa' : '') + '">'
      + '<img src="' + esc(f.url) + '" alt="">'
      + '<button type="button" title="Remover" onclick="removerFoto(' + k + ')">×</button>'
      + (k === 0 ? '<span class="tag">capa</span>' : '<button type="button" class="promover" onclick="virarCapa(' + k + ')">capa</button>')
      + '</div>').join('')
    : '<p class="mono" style="margin:0">Nenhuma foto ainda. Anúncios com 5+ fotos alugam bem mais.</p>';
}
function removerFoto(k) { FOTOS_PECA.splice(k, 1); pintarGaleria(); }
function virarCapa(k) { const [f] = FOTOS_PECA.splice(k, 1); FOTOS_PECA.unshift(f); pintarGaleria(); }

async function enviarFotos(files) {
  const msg = el('p-upmsg');
  const semFundo = el('p-fundo') && el('p-fundo').checked;
  const max = ENT.limites.fotos_por_peca || 5;
  const lista = Array.from(files).slice(0, Math.max(0, max - FOTOS_PECA.length));
  if (!lista.length) { msg.textContent = 'Limite de ' + max + ' fotos nesta peça (o Premium aumenta).'; return; }
  msg.textContent = 'Preparando ' + lista.length + ' foto(s)…';
  try {
    const prontas = [];
    for (const f of lista) prontas.push(await prepararFoto(f, semFundo));
    msg.textContent = 'Enviando…';
    const r = await api('POST', '/app/fotos', { fotos: prontas, origem: 'peca' });
    r.fotos.forEach((f) => FOTOS_PECA.push({ url: f.url }));
    pintarGaleria();
    msg.textContent = r.fotos.length + ' foto(s) enviada(s).' + (semFundo ? ' Fundo removido — confira o recorte.' : '');
  } catch (e) { msg.textContent = e.message; }
}

function coletarPeca() {
  const v = (n2) => (el('p-' + n2) ? el('p-' + n2).value.trim() : '');
  const num = (n2) => (v(n2) ? Math.round(Number(v(n2)) * 100) : 0);
  const int = (n2) => (v(n2) ? Number(v(n2)) : 0);
  return {
    titulo: v('titulo'), categoria: v('categoria'), marca: v('marca'), tamanho: v('tamanho'), cor: v('cor'),
    condicao: v('condicao'), descricao: v('descricao'), cidade: v('cidade'), bairro: v('bairro'), status: v('status'),
    valor_reposicao_centavos: num('reposicao'), preco_diaria_centavos: num('diaria'), preco_3dias_centavos: num('p3'),
    caucao_centavos: num('caucao'), min_dias: int('min') || 1, prep_dias: int('prep'),
    ocasioes: Array.from(document.querySelectorAll('#p-ocasioes .chip.on')).map((c) => c.dataset.o),
    // galeria (upload) + URLs coladas à mão, sem duplicar
    fotos: FOTOS_PECA.map((f) => f.url)
      .concat(v('fotos').split('\n').map((u) => u.trim()).filter(Boolean))
      .filter((u, k, arr) => arr.indexOf(u) === k)
      .map((u, k) => ({ url: u, capa: k === 0 })),
    modelo: { altura_cm: int('malt'), peso_kg: int('mpeso'), vestiu: v('mvest') },
    medidas: { busto: int('mbusto'), cintura: int('mcintura'), quadril: int('mquadril') },
  };
}

async function iaPreco() {
  const d = await api('POST', '/app/ia/preco', coletarPeca());
  el('p-diaria').value = (d.sugerido_centavos / 100).toFixed(0);
  if (!el('p-caucao').value) el('p-caucao').value = (d.caucao_sugerida_centavos / 100).toFixed(0);
  if (!el('p-p3').value) el('p-p3').value = (d.pacote_3dias_centavos / 100).toFixed(0);
  el('p-ia').innerHTML = '<b>Sugestão:</b> ' + brl0(d.sugerido_centavos) + '/dia (faixa ' + brl0(d.min_centavos) + '–' + brl0(d.max_centavos) + ')<br>'
    + d.porques.map(esc).join('<br>');
}
async function iaDescricao() {
  const d = await api('POST', '/app/ia/descricao', coletarPeca());
  el('p-descricao').value = d.descricao;
  el('p-ia').innerHTML = '<b>Descrição gerada.</b> Palavras-chave: ' + (d.palavras || []).map(esc).join(' · ')
    + (d.estilo && d.estilo.estilo ? '<br>Estilo detectado: <b>' + esc(d.estilo.estilo) + '</b>' : '');
}

async function salvarPeca(id) {
  const msg = el('p-msg'); msg.textContent = '';
  try {
    const corpo = coletarPeca();
    if (id) await api('PATCH', '/app/pecas/' + id, corpo);
    else {
      const r = await api('POST', '/app/pecas', corpo);
      if (r.qualidade_fotos && r.qualidade_fotos.problemas.length) {
        alert('Peça criada!\n\nPara alugar mais rápido:\n• ' + r.qualidade_fotos.problemas.join('\n• '));
      }
    }
    fecharModal(); irPara('pecas');
  } catch (e) { msg.textContent = e.message; }
}

async function agendaPeca(id) {
  const d = await api('GET', '/app/pecas/' + id);
  modal('<h3>Agenda — ' + esc(d.peca.titulo) + '</h3>'
    + '<p style="color:var(--cinza-txt);margin:8px 0 16px">Bloqueie as datas em que a peça não pode sair (viagem, uso próprio, conserto).</p>'
    + (d.agenda.length ? '<table><thead><tr><th>De</th><th>Até</th><th>Motivo</th><th></th></tr></thead><tbody>'
      + d.agenda.map((b) => '<tr><td>' + dia(b.inicio) + '</td><td>' + dia(b.fim) + '</td><td>' + esc(b.motivo) + '</td>'
        + '<td style="text-align:right">' + (b.motivo === 'manual' ? '<button class="btn linha peq" onclick="removerBloqueio(\'' + b.id + '\',\'' + id + '\')">Remover</button>' : '—') + '</td></tr>').join('')
      + '</tbody></table>' : '<p style="color:var(--cinza-txt)">Nenhum bloqueio — a peça está livre.</p>')
    + '<div class="campos" style="margin-top:20px"><div><label>De</label><input id="bl-de" type="date" min="' + hoje() + '"></div>'
    + '<div><label>Até</label><input id="bl-ate" type="date" min="' + hoje() + '"></div></div>'
    + '<p id="bl-msg" class="erro"></p>'
    + '<button class="btn peq" onclick="bloquear(\'' + id + '\')">Bloquear período</button>');
}
async function bloquear(id) {
  try {
    await api('POST', '/app/pecas/' + id + '/bloqueios', { inicio: el('bl-de').value, fim: el('bl-ate').value });
    agendaPeca(id);
  } catch (e) { el('bl-msg').textContent = e.message; }
}
async function removerBloqueio(bid, id) { await api('DELETE', '/app/bloqueios/' + bid); agendaPeca(id); }

/* ---------------------------------- LOOKS --------------------------------- */
async function telaLooks() {
  const d = await api('GET', '/app/looks');
  const minhas = await api('GET', '/app/pecas');
  window._minhasPecas = minhas.pecas;
  tela('<div class="painel"><div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">'
    + '<div><h3>Meus looks</h3><p style="color:var(--cinza-txt);margin-top:6px">Junte peças num conjunto: aluga mais e com desconto para o cliente.</p></div>'
    + '<button class="btn peq" onclick="formLook()">+ Novo look</button></div>'
    + (d.looks.length ? '<table style="margin-top:20px"><thead><tr><th>Look</th><th>Peças</th><th>Preço/dia</th><th>Situação</th><th></th></tr></thead><tbody>'
      + d.looks.map((l) => '<tr><td><b>' + esc(l.titulo) + '</b><br><span style="color:var(--cinza-txt);font-size:.85rem">' + esc(l.ocasiao || '') + '</span></td>'
        + '<td>' + l.itens.length + '</td><td>' + brl(l.preco_diaria_look_centavos) + ' <span style="color:var(--cinza-txt);text-decoration:line-through">' + brl0(l.preco_diaria_soma_centavos) + '</span></td>'
        + '<td>' + (l.moderacao === 'aprovado' ? '<span class="est ok">na vitrine</span>' : '<span class="est aten">' + esc(l.moderacao) + '</span>') + '</td>'
        + '<td style="text-align:right"><button class="btn linha peq" onclick="formLook(\'' + l.id + '\')">Editar</button></td></tr>').join('')
      + '</tbody></table>' : '<p class="vazio">Nenhum look ainda. Um look precisa de 2+ peças.</p>') + '</div>');
}

async function formLook(id) {
  let l = { itens: [], desconto_pct: 10, status: 'rascunho' };
  if (id) { const d = await api('GET', '/app/looks/' + id); l = d.look; }
  const sel = new Set((l.itens || []).map((i) => i.id));
  const pecas = window._minhasPecas || (await api('GET', '/app/pecas')).pecas;
  modal('<h3>' + (id ? 'Editar look' : 'Novo look') + '</h3>'
    + '<label>Nome do look</label><input id="l-titulo" value="' + esc(l.titulo || '') + '" placeholder="Look Casamento no Campo">'
    + '<div class="campos"><div><label>Ocasião</label><select id="l-ocasiao"><option value=""></option>'
    + OCASIOES_UI.map((o) => '<option value="' + o[0] + '"' + (l.ocasiao === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>'
    + '<div><label>Desconto do conjunto (%)</label><input id="l-desc" type="number" min="0" max="60" value="' + (l.desconto_pct || 10) + '"></div></div>'
    + '<label>Descrição</label><textarea id="l-descricao" rows="3">' + esc(l.descricao || '') + '</textarea>'
    + '<label>Peças do look (mín. 2)</label><div id="l-itens" style="max-height:230px;overflow:auto;border:1px solid var(--cinza2);padding:10px">'
    + (pecas.length ? pecas.map((p) => '<label style="text-transform:none;letter-spacing:0;color:var(--preto);font-size:.9rem;margin:6px 0">'
      + '<input type="checkbox" value="' + p.id + '" style="width:auto;margin-right:8px"' + (sel.has(p.id) ? ' checked' : '') + '>'
      + esc(p.titulo) + ' <span style="color:var(--cinza-txt)">· ' + brl0(p.preco_diaria_centavos) + '/dia</span></label>').join('')
      : '<p style="color:var(--cinza-txt)">Cadastre peças primeiro.</p>') + '</div>'
    + '<label>Situação</label><select id="l-status">' + ['rascunho', 'ativo', 'pausado'].map((st) => '<option' + ((l.status || 'rascunho') === st ? ' selected' : '') + '>' + st + '</option>').join('') + '</select>'
    + '<p id="l-msg" class="erro" style="margin-top:10px"></p>'
    + '<button class="btn" style="width:100%;margin-top:12px" onclick="salvarLook(' + (id ? '\'' + id + '\'' : 'null') + ')">Salvar</button>');
}
async function salvarLook(id) {
  const msg = el('l-msg'); msg.textContent = '';
  const corpo = {
    titulo: el('l-titulo').value, ocasiao: el('l-ocasiao').value, desconto_pct: Number(el('l-desc').value || 10),
    descricao: el('l-descricao').value, status: el('l-status').value,
    itens: Array.from(document.querySelectorAll('#l-itens input:checked')).map((c) => c.value),
  };
  try {
    if (id) await api('PATCH', '/app/looks/' + id, corpo); else await api('POST', '/app/looks', corpo);
    fecharModal(); irPara('looks');
  } catch (e) { msg.textContent = e.message; }
}

/* ------------------------- RESERVAS (proprietário) ------------------------ */
async function telaReservas() {
  const d = await api('GET', '/app/reservas');
  tela('<div class="painel"><h3>Reservas das minhas peças</h3>'
    + (d.reservas.length ? '<table style="margin-top:18px"><thead><tr><th>Reserva</th><th>Período</th><th>Meu repasse</th><th>Situação</th><th></th></tr></thead><tbody>'
      + d.reservas.map((b) => {
        const meu = b.itens.filter((i) => i.owner_id === EU.id).reduce((t, i) => t + i.repasse_centavos, 0);
        return '<tr><td><b>' + esc(b.codigo) + '</b><br><span style="color:var(--cinza-txt);font-size:.85rem">'
          + esc(b.itens.filter((i) => i.owner_id === EU.id).map((i) => i.titulo).join(', ')) + '</span></td>'
          + '<td>' + dia(b.data_retirada) + ' → ' + dia(b.data_devolucao) + '</td><td>' + brl(meu) + '</td>'
          + '<td>' + badge(b) + '</td><td style="text-align:right"><button class="btn linha peq" onclick="verReserva(\'' + b.id + '\')">Abrir</button></td></tr>';
      }).join('') + '</tbody></table>'
      : '<p class="vazio">Nenhuma reserva ainda. Peças com 5+ fotos e ocasiões preenchidas aparecem mais na vitrine.</p>') + '</div>');
}

/* --------------------------- ALUGUÉIS (cliente) --------------------------- */
async function telaMinhasReservas() {
  const d = await api('GET', '/app/minhas-reservas');
  tela('<div class="painel"><h3>Meus aluguéis</h3>'
    + (d.reservas.length ? '<table style="margin-top:18px"><thead><tr><th>Reserva</th><th>Período</th><th>Total</th><th>Situação</th><th></th></tr></thead><tbody>'
      + d.reservas.map((b) => '<tr><td><b>' + esc(b.codigo) + '</b><br><span style="color:var(--cinza-txt);font-size:.85rem">'
        + esc(b.itens.map((i) => i.titulo).join(', ')) + '</span></td>'
        + '<td>' + dia(b.data_retirada) + ' → ' + dia(b.data_devolucao) + '</td><td>' + brl(b.total_centavos) + '</td>'
        + '<td>' + badge(b) + '</td><td style="text-align:right"><button class="btn linha peq" onclick="verReserva(\'' + b.id + '\')">Abrir</button></td></tr>').join('')
      + '</tbody></table>'
      : '<p class="vazio">Você ainda não alugou nada. <a href="/closet/ia" style="text-decoration:underline">Descubra seu look ideal</a>.</p>') + '</div>');
}

/* ---------------------------- DETALHE DA RESERVA -------------------------- */
async function verReserva(id) {
  try {
    const d = await api('GET', '/app/reservas/' + id);
    const b = d.reserva;
    const meuRepasse = b.itens.filter((i) => i.owner_id === EU.id).reduce((t, i) => t + i.repasse_centavos, 0);
    let acoes = '';
    if (d.sou_proprietario && b.status === 'pago_bloqueado' && b.itens.some((i) => i.owner_id === EU.id && i.status === 'pendente')) {
      acoes += '<button class="btn" onclick="confirmarReserva(\'' + b.id + '\')">Confirmar reserva</button> '
        + '<button class="btn linha" onclick="recusarReserva(\'' + b.id + '\')">Recusar</button>';
    }
    if (d.sou_cliente && b.status === 'aguardando_pagamento') acoes += '<button class="btn" onclick="pagarPix(\'' + b.id + '\')">Pagar por Pix</button> ';
    if (d.sou_cliente && ['aguardando_pagamento', 'pago_bloqueado', 'confirmado'].indexOf(b.status) >= 0) {
      acoes += '<button class="btn linha" onclick="cancelarReserva(\'' + b.id + '\')">Cancelar</button> ';
    }
    if (b.status === 'confirmado' && b.token_retirada) acoes += '<a class="btn" href="/closet/r/' + esc(b.token_retirada) + '">QR de retirada</a> ';
    if (b.status === 'retirado' && b.token_devolucao) acoes += '<a class="btn" href="/closet/r/' + esc(b.token_devolucao) + '">QR de devolução</a> ';
    if (d.sou_proprietario && b.status === 'devolvido') {
      acoes += '<button class="btn" onclick="liberarRepasse(\'' + b.id + '\')">Conferi — liberar repasse</button> '
        + '<button class="btn linha" onclick="abrirDisputa(\'' + b.id + '\')">Relatar problema</button>';
    }
    if (b.status === 'concluido') acoes += '<button class="btn" onclick="avaliar(\'' + b.id + '\',' + (d.sou_cliente ? 'true' : 'false') + ')">Avaliar</button>';

    modal('<span class="mono">' + esc(b.codigo) + '</span><h3 style="margin:8px 0 4px">' + badge(b) + '</h3>'
      + '<p style="color:var(--cinza-txt)">' + dia(b.data_retirada) + ' → ' + dia(b.data_devolucao) + ' · ' + b.dias + ' diária(s)</p>'
      + (b.motivo_status ? '<div class="aviso">' + esc(b.motivo_status) + '</div>' : '')
      + '<table style="margin-top:16px"><tbody>'
      + b.itens.map((i) => '<tr><td>' + esc(i.titulo) + (i.owner_id === EU.id ? ' <span class="mono">sua peça</span>' : '') + '</td>'
        + '<td style="text-align:right">' + brl(i.subtotal_centavos) + '</td></tr>').join('')
      + (b.desconto_centavos ? '<tr><td>Desconto</td><td style="text-align:right;color:var(--oliva)">−' + brl(b.desconto_centavos) + '</td></tr>' : '')
      + (b.seguro_centavos ? '<tr><td>Seguro</td><td style="text-align:right">' + brl(b.seguro_centavos) + '</td></tr>' : '')
      + (b.caucao_centavos ? '<tr><td>Caução (reembolsável)</td><td style="text-align:right">' + brl(b.caucao_centavos) + '</td></tr>' : '')
      + '<tr><td><b>Total pago pelo cliente</b></td><td style="text-align:right"><b>' + brl(b.total_centavos) + '</b></td></tr>'
      + (d.sou_proprietario ? '<tr><td><b>Meu repasse</b> (após comissão)</td><td style="text-align:right"><b>' + brl(meuRepasse) + '</b></td></tr>' : '')
      + '</tbody></table>'
      + (b.status === 'pago_bloqueado' ? '<div class="aviso">O valor está bloqueado com a plataforma. Ninguém recebe antes da devolução.</div>' : '')
      + (acoes ? '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">' + acoes + '</div>' : ''));
  } catch (e) { alert(e.message); }
}

async function confirmarReserva(id) {
  try {
    const r = await api('POST', '/app/reservas/' + id + '/confirmar');
    fecharModal();
    alert(r.aguardando_outros_donos ? 'Sua peça foi confirmada. Faltam ' + r.aguardando_outros_donos + ' peça(s) de outros proprietários.' : 'Reserva confirmada! O QR Code de retirada já está disponível.');
    irPara(ABA);
  } catch (e) { alert(e.message); }
}
async function recusarReserva(id) {
  const motivo = prompt('Por que está recusando? (o cliente é reembolsado integralmente)');
  if (motivo === null) return;
  try { await api('POST', '/app/reservas/' + id + '/recusar', { motivo }); fecharModal(); irPara(ABA); } catch (e) { alert(e.message); }
}
async function cancelarReserva(id) {
  if (!confirm('Cancelar esta reserva? O reembolso segue a política de antecedência.')) return;
  try { const r = await api('POST', '/app/minhas-reservas/' + id + '/cancelar', {}); fecharModal(); alert('Cancelada. Reembolso: ' + brl(r.reembolso_centavos)); irPara(ABA); } catch (e) { alert(e.message); }
}
async function liberarRepasse(id) {
  if (!confirm('Confirmar que a peça voltou em ordem? Isso libera o repasse e devolve a caução ao cliente.')) return;
  try { await api('POST', '/app/reservas/' + id + '/liberar'); fecharModal(); irPara(ABA); } catch (e) { alert(e.message); }
}
async function abrirDisputa(id) {
  const descricao = prompt('Descreva o problema (dano, peça não devolvida, etc.):');
  if (!descricao) return;
  const valor = prompt('Valor pretendido de indenização (R$), se houver:', '0');
  try {
    await api('POST', '/app/reservas/' + id + '/disputa', { motivo: 'dano', descricao, valor_pedido_centavos: Math.round(Number(valor || 0) * 100) });
    fecharModal(); alert('Disputa aberta. O valor segue bloqueado e a plataforma vai mediar.'); irPara(ABA);
  } catch (e) { alert(e.message); }
}
async function pagarPix(id) {
  try {
    const d = await api('POST', '/reservas/' + id + '/pix');
    if (d.modo === 'manual') { modal('<h3>Pagamento</h3><div class="aviso">' + esc(d.aviso) + '</div><p>Total: <b>' + brl(d.total_centavos) + '</b> · Reserva <b>' + esc(d.codigo) + '</b></p>'); return; }
    modal('<h3>Pague com Pix</h3><p style="color:var(--cinza-txt)">Total <b>' + brl(d.total_centavos) + '</b> · vale por ' + d.expira_em_min + ' min</p>'
      + (d.qr_base64 ? '<img src="data:image/png;base64,' + d.qr_base64 + '" alt="QR Code Pix" style="width:220px;margin:18px auto">' : '')
      + '<label>Pix copia e cola</label><textarea rows="3" readonly onclick="this.select()">' + esc(d.copia_cola) + '</textarea>'
      + '<div class="aviso">Assim que o pagamento cair, a reserva vai para <b>aguardando confirmação</b> do proprietário — e o valor fica bloqueado até a devolução.</div>');
  } catch (e) { alert(e.message); }
}
async function avaliar(id, souCliente) {
  const b = (await api('GET', '/app/reservas/' + id)).reserva;
  const alvos = souCliente
    ? b.itens.map((i) => ({ tipo: 'item', id: i.item_id, nome: i.titulo })).concat([{ tipo: 'proprietario', id: b.donos[0], nome: 'A proprietária' }])
    : [{ tipo: 'cliente', id: b.cliente_id, nome: 'O cliente' }];
  modal('<h3>Avaliar</h3>' + alvos.map((a, k) => '<div style="border-bottom:1px solid var(--cinza2);padding:12px 0">'
    + '<b>' + esc(a.nome) + '</b><div class="campos"><div><label>Nota (1-5)</label><input id="av-n' + k + '" type="number" min="1" max="5" value="5"></div></div>'
    + '<label>Comentário</label><textarea id="av-t' + k + '" rows="2"></textarea>'
    + '<button class="btn peq" onclick="enviarAvaliacao(\'' + b.id + '\',\'' + a.tipo + '\',\'' + a.id + '\',' + k + ')">Enviar</button></div>').join('')
    + '<p id="av-msg" class="ok" style="margin-top:10px"></p>');
}
async function enviarAvaliacao(bookingId, tipo, alvoId, k) {
  try {
    await api('POST', '/app/avaliacoes', { booking_id: bookingId, alvo_tipo: tipo, alvo_id: alvoId, nota: Number(el('av-n' + k).value), texto: el('av-t' + k).value });
    el('av-msg').textContent = 'Avaliação enviada. Obrigado!';
  } catch (e) { el('av-msg').className = 'erro'; el('av-msg').textContent = e.message; }
}

/* -------------------------------- FINANCEIRO ------------------------------ */
async function telaFinanceiro() {
  const d = await api('GET', '/app/financeiro');
  tela('<div class="kpis">'
    + kpi(brl0(d.saldo.em_andamento_centavos), 'em curso')
    + kpi(brl0(d.saldo.liberado_centavos), 'liberado')
    + kpi(brl0(d.saldo.pago_centavos), 'recebido')
    + kpi(d.comissao_pct + '%', 'comissão')
    + '</div>'
    + '<div class="painel"><h3>Minha chave Pix</h3>'
    + (d.pix.configurado ? '<p style="margin:10px 0">Recebendo em <b>' + esc(d.pix.chave) + '</b> (' + esc(d.pix.tipo || 'chave') + ')</p>'
      : '<div class="aviso">Cadastre sua chave Pix para receber os repasses.</div>')
    + '<div class="campos" style="margin-top:12px"><div><label>Tipo</label><select id="pix-tipo">'
    + ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'].map((t) => '<option' + (d.pix.tipo === t ? ' selected' : '') + '>' + t + '</option>').join('')
    + '</select></div><div><label>Chave</label><input id="pix-chave" value="' + esc(d.pix.chave || '') + '"></div></div>'
    + '<button class="btn peq" onclick="salvarPix()">Salvar chave</button><span id="pix-msg" class="ok" style="margin-left:12px"></span></div>'
    + '<div class="painel"><h3>Repasses</h3>'
    + (d.repasses.length ? '<table style="margin-top:14px"><thead><tr><th>Reserva</th><th>Valor</th><th>Situação</th><th>Pago em</th></tr></thead><tbody>'
      + d.repasses.map((p) => '<tr><td>' + esc(p.codigo) + '</td><td>' + brl(p.valor_centavos) + '</td>'
        + '<td><span class="est ' + (p.status === 'pago' ? 'ok' : p.status === 'retido' ? 'ruim' : 'aten') + '">' + esc(p.status) + '</span></td>'
        + '<td>' + (p.pago_em ? dia(p.pago_em) : '—') + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="vazio">Nenhum repasse ainda.</p>') + '</div>'
    + (d.por_mes.length ? '<div class="painel"><h3>Por mês</h3><table style="margin-top:14px"><thead><tr><th>Mês</th><th>Locações</th><th>Recebido</th></tr></thead><tbody>'
      + d.por_mes.map((m) => '<tr><td>' + esc(m.mes) + '</td><td>' + m.n + '</td><td>' + brl(m.v) + '</td></tr>').join('') + '</tbody></table></div>' : '')
    + (ENT.flags.analytics ? '<div class="painel"><h3>Analytics das peças <span class="mono">Premium</span></h3><div id="ana">carregando…</div></div>'
      : '<div class="painel"><h3>Analytics <span class="mono">Premium</span></h3><p style="color:var(--cinza-txt);margin:10px 0 16px">'
        + 'Veja visitas, conversão e receita por peça — e o que ajustar em cada anúncio.</p>'
        + '<button class="btn peq" onclick="location.hash=\'conta\'">Conhecer o Premium</button></div>'));
  if (ENT.flags.analytics) carregarAnalytics();
}
async function salvarPix() {
  try { await api('PATCH', '/me', { pix_tipo: el('pix-tipo').value, pix_chave: el('pix-chave').value }); el('pix-msg').textContent = 'Salvo!'; }
  catch (e) { el('pix-msg').className = 'erro'; el('pix-msg').textContent = e.message; }
}
async function carregarAnalytics() {
  try {
    const a = await api('GET', '/app/ia/analytics?dias=30');
    el('ana').innerHTML = '<p style="color:var(--cinza-txt);margin-bottom:12px">Últimos 30 dias: ' + a.totais.visualizacoes + ' visitas · '
      + a.totais.reservas + ' reservas · ' + brl(a.totais.receita_centavos) + '</p>'
      + '<table><thead><tr><th>Peça</th><th>Visitas</th><th>Reservas</th><th>Conversão</th><th>Receita</th></tr></thead><tbody>'
      + a.itens.map((i) => '<tr><td>' + esc(i.titulo) + '</td><td>' + i.visualizacoes + '</td><td>' + i.reservas + '</td>'
        + '<td>' + i.conversao_pct + '%</td><td>' + brl(i.receita_centavos) + '</td></tr>').join('') + '</tbody></table>'
      + (a.sugestoes.length ? '<div class="aviso" style="margin-top:16px"><b>O que ajustar:</b><br>' + a.sugestoes.map(esc).join('<br>') + '</div>' : '');
  } catch (e) { el('ana').textContent = e.message; }
}

/* --------------------------------- MENSAGENS ------------------------------ */
async function telaMensagens() {
  const d = await api('GET', '/app/conversas');
  tela('<div class="painel"><h3>Mensagens</h3>'
    + (d.conversas.length ? '<table style="margin-top:16px"><tbody>' + d.conversas.map((c) => '<tr><td><b>' + esc((c.outro || {}).nome || '—') + '</b>'
      + (c.nao_lidas ? ' <span class="est aten">' + c.nao_lidas + ' nova(s)</span>' : '')
      + '<br><span style="color:var(--cinza-txt);font-size:.85rem">' + esc(c.assunto || '') + ' — ' + esc(String(c.ultima || '').slice(0, 70)) + '</span></td>'
      + '<td style="text-align:right"><button class="btn linha peq" onclick="verConversa(\'' + c.id + '\')">Abrir</button></td></tr>').join('') + '</tbody></table>'
      : '<p class="vazio">Nenhuma conversa ainda.</p>') + '</div>');
}
async function verConversa(id) {
  const d = await api('GET', '/app/conversas/' + id);
  modal('<h3>' + esc((d.thread.outro || {}).nome || 'Conversa') + '</h3>'
    + '<div style="max-height:320px;overflow:auto;border:1px solid var(--cinza2);padding:14px;margin:14px 0">'
    + d.mensagens.map((m) => '<div style="margin-bottom:12px;text-align:' + (m.autor_id === EU.id ? 'right' : 'left') + '">'
      + '<div style="display:inline-block;max-width:80%;padding:9px 13px;background:' + (m.sistema ? 'var(--cinza)' : m.autor_id === EU.id ? 'var(--preto)' : 'var(--cinza)') + ';'
      + 'color:' + (m.autor_id === EU.id && !m.sistema ? 'var(--branco)' : 'var(--preto)') + ';font-size:.9rem;text-align:left">' + esc(m.texto) + '</div></div>').join('')
    + '</div><textarea id="msg-txt" rows="2" placeholder="Escreva…"></textarea>'
    + '<button class="btn peq" onclick="enviarMsg(\'' + id + '\')">Enviar</button>');
}
async function enviarMsg(id) {
  try { await api('POST', '/app/conversas/' + id + '/mensagens', { texto: el('msg-txt').value }); verConversa(id); } catch (e) { alert(e.message); }
}

/* -------------------------------- FAVORITOS ------------------------------- */
async function telaFavoritos() {
  const d = await api('GET', '/app/favoritos');
  const card = (i, url) => '<a class="card" href="' + url + '"><div class="capa">'
    + ((i.fotos || [])[0] && i.fotos[0].url ? '<img src="' + esc(i.fotos[0].url) + '" alt="">' : '<div class="vazia">' + esc(i.titulo) + '</div>')
    + '</div><h4>' + esc(i.titulo) + '</h4></a>';
  tela('<div class="painel"><h3>Favoritos</h3>'
    + (d.itens.length || d.looks.length
      ? '<div class="grade" style="margin-top:18px">' + d.itens.map((i) => card(i, '/closet/peca/' + (i.slug || i.id))).join('')
        + d.looks.map((l) => card(l, '/closet/look/' + (l.slug || l.id))).join('') + '</div>'
      : '<p class="vazio">Nada salvo ainda. Toque no coração das peças que você gostar.</p>') + '</div>');
}

/* ------------------------------ INDICAR E GANHAR -------------------------- */
async function telaIndicar() {
  const d = await api('GET', '/app/indicacoes');
  tela('<div class="kpis">'
    + kpi(brl0(d.saldo_centavos), 'crédito disponível')
    + kpi(d.premiados, 'indicações premiadas')
    + kpi(brl0(d.premio_por_indicacao_centavos), 'por indicação')
    + '</div>'
    + '<div class="painel"><h3>Seu link de convite</h3>'
    + '<p style="color:var(--cinza-txt);margin:8px 0 16px">Quem entrar por ele ganha crédito — e você também, quando essa pessoa concluir o primeiro aluguel.</p>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<input id="ind-link" readonly value="' + esc(d.link) + '" onclick="this.select()" style="flex:1;min-width:240px">'
    + '<button class="btn peq" onclick="copiarLink()">Copiar</button>'
    + '<button class="btn linha peq" onclick="compartilharLink()">Compartilhar</button></div>'
    + '<p class="mono" style="margin-top:12px">Seu código: <b>' + esc(d.codigo) + '</b></p></div>'
    + '<div class="painel"><h3>Quem entrou pelo seu convite</h3>'
    + (d.convites.length ? '<table style="margin-top:14px"><thead><tr><th>Pessoa</th><th>Situação</th><th>Prêmio</th><th>Quando</th></tr></thead><tbody>'
      + d.convites.map((c) => '<tr><td>' + esc(c.nome) + '</td>'
        + '<td><span class="est ' + (c.status === 'premiado' ? 'ok' : 'aten') + '">' + (c.status === 'premiado' ? 'premiada' : 'aguardando 1º aluguel') + '</span></td>'
        + '<td>' + (c.premio_centavos ? brl(c.premio_centavos) : '—') + '</td><td>' + dia(c.criado_em) + '</td></tr>').join('')
      + '</tbody></table>' : '<p class="vazio">Ninguém ainda. Mande seu link para quem tem evento chegando.</p>') + '</div>'
    + '<div class="painel"><h3>Meus créditos</h3>'
    + (d.extrato.length ? '<table style="margin-top:14px"><thead><tr><th>Quando</th><th>O quê</th><th>Valor</th><th>Vale até</th></tr></thead><tbody>'
      + d.extrato.map((c) => '<tr><td>' + dia(c.criado_em) + '</td><td>' + esc(c.descricao || c.tipo) + '</td>'
        + '<td style="color:' + (c.valor_centavos < 0 ? 'var(--cinza-txt)' : 'var(--oliva)') + '">' + (c.valor_centavos < 0 ? '−' : '+') + brl(Math.abs(c.valor_centavos)) + '</td>'
        + '<td>' + (c.expira_em ? dia(c.expira_em) : '—') + '</td></tr>').join('')
      + '</tbody></table>' : '<p class="vazio">Nenhum crédito ainda.</p>')
    + '<p class="mono" style="margin-top:14px">O crédito é aplicado no checkout, marcando "usar meu crédito". O que não couber na reserva continua aqui.</p></div>');
}
function copiarLink() {
  const i = el('ind-link'); i.select();
  navigator.clipboard ? navigator.clipboard.writeText(i.value).then(() => alert('Link copiado!')) : document.execCommand('copy');
}
function compartilharLink() {
  const url = el('ind-link').value;
  if (navigator.share) navigator.share({ title: 'Closet Club', text: 'Alugue o look inteiro — ganhe crédito no primeiro aluguel:', url }).catch(() => {});
  else copiarLink();
}

/* -------------------------------- CAMPANHAS ------------------------------- */
async function telaCampanhas() {
  const [d, pecas] = await Promise.all([api('GET', '/app/campanhas'), api('GET', '/app/pecas')]);
  window._pecasAtivas = pecas.pecas.filter((p) => p.status === 'ativo' && p.moderacao === 'aprovado');
  tela('<div class="painel"><h3>Patrocinar uma peça</h3>'
    + '<p style="color:var(--cinza-txt);margin:8px 0 16px">Sua peça sobe ao topo da vitrine pelo período contratado, '
    + 'marcada como <b>Destaque</b> para quem vê. Destaque muda a ordem, não a peça — moderação, disponibilidade e '
    + 'avaliação continuam valendo igual.</p>'
    + '<div class="campos"><div><label>Peça</label><select id="cp-item">'
    + (window._pecasAtivas.length ? window._pecasAtivas.map((p) => '<option value="' + p.id + '">' + esc(p.titulo) + '</option>').join('')
      : '<option value="">Nenhuma peça aprovada</option>') + '</select></div>'
    + '<div><label>Dias</label><input id="cp-dias" type="number" min="1" max="30" value="7" oninput="cotarCampanha()"></div></div>'
    + '<p id="cp-preco" class="mono" style="margin:10px 0"></p>'
    + '<button class="btn peq" onclick="criarCampanha()"' + (window._pecasAtivas.length ? '' : ' disabled') + '>Contratar destaque</button>'
    + '<p id="cp-msg" style="margin-top:10px;font-size:.9rem"></p></div>'
    + '<div class="painel"><h3>Minhas campanhas</h3>'
    + (d.campanhas.length ? '<table style="margin-top:14px"><thead><tr><th>Peça</th><th>Período</th><th>Valor</th>'
      + '<th>Situação</th><th>Desempenho</th><th></th></tr></thead><tbody>'
      + d.campanhas.map((c) => '<tr><td>' + esc((c.peca || {}).titulo || '—') + '</td>'
        + '<td>' + c.dias + ' dia(s)' + (c.fim ? '<br><span style="color:var(--cinza-txt);font-size:.85rem">até ' + dia(c.fim) + '</span>' : '') + '</td>'
        + '<td>' + brl(c.preco_centavos) + '</td>'
        + '<td><span class="est ' + (c.status === 'ativa' ? 'ok' : c.status === 'aguardando_pagamento' ? 'aten' : '') + '">'
        + (c.status === 'aguardando_pagamento' ? 'aguardando Pix' : esc(c.status)) + '</span></td>'
        + '<td style="font-size:.85rem;color:var(--cinza-txt)">' + c.impressoes + ' exibições · ' + c.cliques + ' cliques'
        + (c.impressoes ? '<br>' + (Math.round((c.cliques / c.impressoes) * 1000) / 10) + '% de clique' : '') + '</td>'
        + '<td style="text-align:right">' + (c.status === 'aguardando_pagamento'
        ? '<button class="btn peq" onclick="pagarCampanha(\'' + c.id + '\')">Pagar</button> '
          + '<button class="btn linha peq" onclick="cancelarCampanha(\'' + c.id + '\')">Cancelar</button>' : '') + '</td></tr>').join('')
      + '</tbody></table>' : '<p class="vazio">Nenhuma campanha ainda.</p>') + '</div>');
  cotarCampanha();
}
async function cotarCampanha() {
  try {
    const c = await api('POST', '/app/campanhas/cotar', { dias: Number(el('cp-dias').value || 7) });
    el('cp-preco').textContent = c.dias + ' dia(s) × ' + brl0(c.preco_dia_centavos) + ' = ' + brl(c.preco_centavos);
  } catch (e) { el('cp-preco').textContent = e.message; }
}
async function criarCampanha() {
  const m = el('cp-msg'); m.textContent = '';
  try {
    await api('POST', '/app/campanhas', { item_id: el('cp-item').value, dias: Number(el('cp-dias').value || 7) });
    irPara('campanhas');
  } catch (e) { m.className = 'erro'; m.textContent = e.message; }
}
async function pagarCampanha(id) {
  try {
    const d = await api('POST', '/app/campanhas/' + id + '/pix');
    if (d.modo === 'manual') { modal('<h3>Pagamento</h3><div class="aviso">' + esc(d.aviso) + '</div><p>Total: <b>' + brl(d.total_centavos) + '</b></p>'); return; }
    modal('<h3>Pague com Pix</h3><p style="color:var(--cinza-txt)">Total <b>' + brl(d.total_centavos) + '</b></p>'
      + (d.qr_base64 ? '<img src="data:image/png;base64,' + d.qr_base64 + '" alt="QR Code Pix" style="width:220px;margin:18px auto">' : '')
      + '<label>Pix copia e cola</label><textarea rows="3" readonly onclick="this.select()">' + esc(d.copia_cola) + '</textarea>'
      + '<div class="aviso">Assim que o pagamento cair, a peça sobe para o topo da vitrine.</div>');
  } catch (e) { alert(e.message); }
}
async function cancelarCampanha(id) {
  if (!confirm('Cancelar esta campanha?')) return;
  try { await api('DELETE', '/app/campanhas/' + id); irPara('campanhas'); } catch (e) { alert(e.message); }
}

/* --------------------------------- PARCEIRO ------------------------------- */
async function telaParceiro() {
  const d = await api('GET', '/app/parceiro');
  if (!d.parceiro) {
    tela('<div class="painel"><h3>Você ainda não é parceiro</h3>'
      + '<p style="color:var(--cinza-txt);margin:10px 0 18px">Lavanderia, fotografia, ajustes, styling, beleza ou entrega: cadastre-se para aparecer no checkout das reservas.</p>'
      + '<a class="btn" href="/closet/parceiro">Quero me candidatar</a></div>');
    return;
  }
  const p = d.parceiro;
  tela('<div class="painel"><h3>' + esc(p.nome) + ' <span class="est ' + (p.status === 'ativo' ? 'ok' : 'aten') + '">' + esc(p.status) + '</span></h3>'
    + '<p style="color:var(--cinza-txt);margin-top:6px">' + esc(p.tipo) + ' · ' + esc(p.cidade || '') + ' · comissão da plataforma ' + p.comissao_pct + '%</p></div>'
    + '<div class="painel"><div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">'
    + '<h3>Meus serviços</h3><button class="btn peq" onclick="formServico()">+ Novo serviço</button></div>'
    + (p.servicos.length ? '<table style="margin-top:16px"><thead><tr><th>Serviço</th><th>Preço</th><th>Situação</th><th></th></tr></thead><tbody>'
      + p.servicos.map((sv) => '<tr><td><b>' + esc(sv.nome) + '</b><br><span style="color:var(--cinza-txt);font-size:.85rem">' + esc(sv.descricao || '') + '</span></td>'
        + '<td>' + brl(sv.preco_centavos) + '</td><td>' + (sv.ativo ? '<span class="est ok">ativo</span>' : '<span class="est">pausado</span>') + '</td>'
        + '<td style="text-align:right"><button class="btn linha peq" onclick="formServico(\'' + sv.id + '\')">Editar</button></td></tr>').join('')
      + '</tbody></table>' : '<p class="vazio">Nenhum serviço cadastrado.</p>') + '</div>'
    + '<div class="painel"><h3>Agenda — serviços contratados</h3>'
    + (d.agenda.length ? '<table style="margin-top:14px"><thead><tr><th>Reserva</th><th>Serviço</th><th>Período</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>'
      + d.agenda.map((a) => '<tr><td>' + esc(a.codigo) + '</td><td>' + esc(a.nome) + '</td>'
        + '<td>' + dia(a.data_retirada) + ' → ' + dia(a.data_devolucao) + '</td><td>' + brl(a.preco_centavos) + '</td>'
        + '<td>' + esc(a.status) + '</td><td style="text-align:right">'
        + (a.status !== 'concluido' ? '<button class="btn peq" onclick="concluirServico(\'' + a.id + '\')">Concluí</button>' : '✓') + '</td></tr>').join('')
      + '</tbody></table>' : '<p class="vazio">Nenhum serviço contratado ainda.</p>') + '</div>');
  window._parceiro = p;
}
function formServico(id) {
  const p = window._parceiro || { servicos: [] };
  const sv = (p.servicos || []).find((x) => x.id === id) || { nome: '', preco_centavos: 0, descricao: '', ativo: 1 };
  modal('<h3>' + (id ? 'Editar serviço' : 'Novo serviço') + '</h3>'
    + '<label>Nome</label><input id="sv-nome" value="' + esc(sv.nome) + '">'
    + '<label>Preço (R$)</label><input id="sv-preco" type="number" min="0" step="5" value="' + (sv.preco_centavos / 100 || '') + '">'
    + '<label>Descrição</label><textarea id="sv-desc" rows="2">' + esc(sv.descricao || '') + '</textarea>'
    + '<label style="text-transform:none;letter-spacing:0;color:var(--preto)"><input type="checkbox" id="sv-ativo" style="width:auto;margin-right:8px"'
    + (sv.ativo ? ' checked' : '') + '>Disponível no checkout</label>'
    + '<p id="sv-msg" class="erro"></p>'
    + '<button class="btn" style="width:100%;margin-top:12px" onclick="salvarServico(' + (id ? '\'' + id + '\'' : 'null') + ')">Salvar</button>');
}
async function salvarServico(id) {
  const corpo = {
    nome: el('sv-nome').value, preco_centavos: Math.round(Number(el('sv-preco').value || 0) * 100),
    descricao: el('sv-desc').value, ativo: el('sv-ativo').checked,
    tipo: (window._parceiro || {}).tipo,
  };
  try {
    if (id) await api('PATCH', '/app/parceiro/servicos/' + id, corpo);
    else await api('POST', '/app/parceiro/servicos', corpo);
    fecharModal(); irPara('parceiro');
  } catch (e) { el('sv-msg').textContent = e.message; }
}
async function concluirServico(id) {
  if (!confirm('Confirmar que este serviço foi executado?')) return;
  try { await api('POST', '/app/parceiro/agenda/' + id + '/concluir'); irPara('parceiro'); } catch (e) { alert(e.message); }
}

/* ---------------------------------- CONTA --------------------------------- */
async function telaConta() {
  const plano = await api('GET', '/plano');
  const c = EU.perfil_corpo || {};
  tela('<div class="painel"><h3>Meu perfil</h3>'
    + '<div class="campos"><div><label>Nome</label><input id="c-nome" value="' + esc(EU.nome) + '"></div>'
    + '<div><label>Telefone</label><input id="c-tel" value="' + esc(EU.telefone || '') + '"></div>'
    + '<div><label>Cidade</label><input id="c-cidade" value="' + esc(EU.cidade || '') + '"></div>'
    + '<div><label>Bairro</label><input id="c-bairro" value="' + esc(EU.bairro || '') + '"></div></div>'
    + '<label>Sobre mim</label><textarea id="c-bio" rows="3">' + esc(EU.bio || '') + '</textarea>'
    + '<button class="btn peq" onclick="salvarPerfil()">Salvar</button><span id="c-msg" class="ok" style="margin-left:12px"></span></div>'

    + '<div class="painel"><h3>Meu corpo <span class="mono">opcional</span></h3>'
    + '<p style="color:var(--cinza-txt);margin:8px 0 4px">Usado só para a IA sugerir peças que sirvam em você. Pode deixar em branco.</p>'
    + '<div class="campos"><div><label>Altura (cm)</label><input id="c-alt" type="number" value="' + (c.altura_cm || '') + '"></div>'
    + '<div><label>Peso (kg)</label><input id="c-peso" type="number" value="' + (c.peso_kg || '') + '"></div>'
    + '<div><label>Manequim</label><input id="c-man" type="number" value="' + (c.manequim || '') + '"></div>'
    + '<div><label>Calçado</label><input id="c-calc" type="number" value="' + (c.calcado || '') + '"></div>'
    + '<div><label>Tom de pele</label><select id="c-tom"><option value=""></option>'
    + ['clara', 'media', 'morena', 'negra'].map((t) => '<option' + (c.tom_pele === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div></div>'
    + '<button class="btn peq" onclick="salvarCorpo()">Salvar</button><span id="c-msg2" class="ok" style="margin-left:12px"></span></div>'

    + '<div class="painel"><h3>Meu plano</h3>'
    + '<p style="margin:10px 0"><b>' + esc(plano.entitlements.nome) + '</b>'
    + (plano.premium_ate ? ' · válido até ' + dia(plano.premium_ate) : '') + '</p>'
    + (EU.plano === 'premium'
      ? '<button class="btn linha peq" onclick="cancelarPremium()">Cancelar assinatura</button>'
      : '<div class="aviso"><b>Premium — ' + brl0((plano.planos.find((p) => p.slug === 'premium') || {}).preco_centavos) + '/mês.</b><br>'
        + 'Peças ilimitadas · destaque na vitrine · vídeo · analytics · IA de preço e descrição.</div>'
        + '<button class="btn" onclick="assinarPremium()">Assinar Premium</button>')
    + '<p id="pl-msg" style="margin-top:12px"></p></div>'

    + '<div class="painel"><h3>Segurança</h3>'
    + '<div class="campos"><div><label>Senha atual</label><input id="s-atual" type="password"></div>'
    + '<div><label>Nova senha</label><input id="s-nova" type="password"></div></div>'
    + '<button class="btn peq" onclick="trocarSenha()">Trocar senha</button><span id="s-msg" class="ok" style="margin-left:12px"></span></div>'

    + '<div class="painel"><h3>API pública ' + (ENT.flags.api ? '' : '<span class="mono">Premium</span>') + '</h3>'
    + '<p style="color:var(--cinza-txt);margin:8px 0 14px">Leia seu acervo de fora da plataforma (site próprio, planilha, integração). '
    + 'Somente leitura de dados públicos — <a href="/closet/api/v1" target="_blank" style="text-decoration:underline">ver documentação</a>.</p>'
    + '<div id="ch-lista"></div>'
    + (ENT.flags.api ? '<button class="btn peq" style="margin-top:12px" onclick="criarChave()">+ Nova chave</button>'
      : '<button class="btn peq" onclick="assinarPremium()">Assinar o Premium</button>')
    + '<p id="ch-msg" style="margin-top:10px;font-size:.9rem"></p></div>'

    + '<div class="painel"><h3>Seus dados (LGPD)</h3>'
    + '<p style="color:var(--cinza-txt);margin:8px 0 16px">Você pode baixar tudo o que guardamos sobre você ou excluir sua conta a qualquer momento.</p>'
    + '<a class="btn linha peq" href="/closet/api/meus-dados">Baixar meus dados</a> '
    + '<button class="btn linha peq" onclick="excluirConta()">Excluir minha conta</button></div>');
  pintarChaves();
}
async function pintarChaves() {
  try {
    const { chaves } = await api('GET', '/app/chaves');
    el('ch-lista').innerHTML = chaves.length
      ? '<table><thead><tr><th>Nome</th><th>Chave</th><th>Chamadas</th><th></th></tr></thead><tbody>'
        + chaves.map((k) => '<tr><td>' + esc(k.nome) + '</td><td><code>' + esc(k.prefixo) + '…</code></td>'
          + '<td>' + k.chamadas + '</td><td style="text-align:right">'
          + (k.ativa ? '<button class="btn linha peq" onclick="revogarChave(\'' + k.id + '\')">Revogar</button>' : '<span class="est">revogada</span>')
          + '</td></tr>').join('') + '</tbody></table>'
      : '<p style="color:var(--cinza-txt);font-size:.9rem">Nenhuma chave criada.</p>';
  } catch (e) { el('ch-lista').innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; }
}
async function criarChave() {
  const nome = prompt('Nome da chave (para você saber onde ela é usada):', 'Meu site');
  if (nome === null) return;
  try {
    const r = await api('POST', '/app/chaves', { nome });
    // a chave completa aparece uma única vez
    modal('<h3>Chave criada</h3><p style="color:var(--cinza-txt)">Copie agora: por segurança, ela não será mostrada de novo.</p>'
      + '<textarea rows="2" readonly onclick="this.select()" style="margin-top:12px">' + esc(r.chave) + '</textarea>'
      + '<p class="mono">Use no header <code>x-api-key</code>.</p>');
    pintarChaves();
  } catch (e) { el('ch-msg').className = 'erro'; el('ch-msg').textContent = e.message; }
}
async function revogarChave(id) {
  if (!confirm('Revogar esta chave? Integrações que a usam param de funcionar.')) return;
  try { await api('DELETE', '/app/chaves/' + id); pintarChaves(); } catch (e) { alert(e.message); }
}
async function salvarPerfil() {
  try {
    await api('PATCH', '/me', { nome: el('c-nome').value, telefone: el('c-tel').value, cidade: el('c-cidade').value, bairro: el('c-bairro').value, bio: el('c-bio').value });
    el('c-msg').textContent = 'Salvo!';
  } catch (e) { el('c-msg').className = 'erro'; el('c-msg').textContent = e.message; }
}
async function salvarCorpo() {
  try {
    await api('PATCH', '/me', {
      perfil_corpo: {
        altura_cm: Number(el('c-alt').value || 0), peso_kg: Number(el('c-peso').value || 0),
        manequim: Number(el('c-man').value || 0), calcado: Number(el('c-calc').value || 0), tom_pele: el('c-tom').value,
      },
    });
    el('c-msg2').textContent = 'Salvo!';
  } catch (e) { el('c-msg2').className = 'erro'; el('c-msg2').textContent = e.message; }
}
async function trocarSenha() {
  try { await api('POST', '/me/senha', { atual: el('s-atual').value, nova: el('s-nova').value }); el('s-msg').textContent = 'Senha trocada!'; }
  catch (e) { el('s-msg').className = 'erro'; el('s-msg').textContent = e.message; }
}
async function assinarPremium() {
  try { const r = await api('POST', '/plano/assinar'); location.href = r.link; }
  catch (e) { el('pl-msg').className = 'erro'; el('pl-msg').textContent = e.message; }
}
async function cancelarPremium() {
  if (!confirm('Cancelar o Premium? Ele continua valendo até o fim do período já pago.')) return;
  try { const r = await api('POST', '/plano/cancelar'); alert('Cancelado. Premium vale até ' + dia(r.vale_ate)); irPara('conta'); } catch (e) { alert(e.message); }
}
async function excluirConta() {
  if (!confirm('Excluir sua conta? Seus dados pessoais serão anonimizados e seus anúncios saem do ar. Isso não pode ser desfeito.')) return;
  try { await api('POST', '/excluir-conta'); location.href = '/closet'; } catch (e) { alert(e.message); }
}
