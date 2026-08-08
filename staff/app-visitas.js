'use strict';
// ============================================================================
// Portal Staff — módulo: app-visitas. Tela "Visitas do site".
// Mostra a audiência de TODOS os sites do Grupo Villela Stay: volume por data,
// origem (canal e campanha), localidade, comportamento e o funil até a reserva.
// Consome /staff/api/visitas, /staff/api/visitas-funil e /staff/api/visitas-casas.
// Gráficos em SVG escrito à mão — o portal não carrega biblioteca de terceiros.
// ============================================================================

const VIS = { dias: 30, produto: '', bots: false, dados: null, aba: 'origem' };

const visNum = (n) => Number(n || 0).toLocaleString('pt-BR');

/** Selo de variação. `bomSubir=false` inverte as cores (rejeição que cai é boa notícia). */
function visDelta(d, bomSubir = true) {
  if (d == null) return '<span class="vs-delta neutro">novo</span>';
  if (d === 0) return '<span class="vs-delta neutro">estável</span>';
  const positivo = bomSubir ? d > 0 : d < 0;
  return `<span class="vs-delta ${positivo ? 'sobe' : 'desce'}">${d > 0 ? '▲ +' : '▼ '}${d}%</span>`;
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------

/** Linha de visitas + visitantes únicos por dia, com eixo e marcação do maior dia. */
function visGraficoLinha(serie) {
  if (!serie.length) return '<p class="vazio">Sem dados no período.</p>';
  const L = 44, R = 12, T = 14, B = 26, W = 760, H = 240;
  const max = Math.max(1, ...serie.map(p => Math.max(p.visitas, p.unicos)));
  const passo = serie.length > 1 ? (W - L - R) / (serie.length - 1) : 0;
  const x = (i) => L + i * passo;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const caminho = (campo) => serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(' ');
  const area = `${caminho('visitas')} L${x(serie.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

  // Grade horizontal em 4 níveis, com o valor de cada um.
  const grade = [0, .25, .5, .75, 1].map(f => {
    const v = Math.round(max * f);
    return `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" class="vs-grade"/>
            <text x="${L - 6}" y="${y(v) + 4}" class="vs-eixo" text-anchor="end">${visNum(v)}</text>`;
  }).join('');

  // No eixo do tempo cabem ~6 datas: mostra as extremidades e alguns marcos.
  const salto = Math.max(1, Math.round(serie.length / 6));
  const datas = serie.map((p, i) => (i % salto === 0 || i === serie.length - 1)
    ? `<text x="${x(i)}" y="${H - 8}" class="vs-eixo" text-anchor="middle">${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}</text>` : '').join('');

  const pico = serie.reduce((a, p, i) => p.visitas > serie[a].visitas ? i : a, 0);
  return `<svg class="vs-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitas por dia">
    ${grade}${datas}
    <path d="${area}" class="vs-area"/>
    <path d="${caminho('visitas')}" class="vs-linha"/>
    <path d="${caminho('unicos')}" class="vs-linha2"/>
    <circle cx="${x(pico)}" cy="${y(serie[pico].visitas)}" r="4" class="vs-pico"/>
    <text x="${x(pico)}" y="${y(serie[pico].visitas) - 9}" class="vs-eixo forte" text-anchor="middle">${visNum(serie[pico].visitas)}</text>
  </svg>
  <div class="vs-legenda"><span class="vs-key vs-k1"></span> Visitas <span class="vs-key vs-k2"></span> Visitantes únicos</div>`;
}

/** Traço miúdo do site, para caber dentro da linha da tabela. */
function visSparkline(vals) {
  if (!vals || vals.length < 2) return '';
  const max = Math.max(1, ...vals), W = 90, H = 24;
  const p = vals.map((v, i) => `${i ? 'L' : 'M'}${(i * W / (vals.length - 1)).toFixed(1)},${(H - 2 - (H - 4) * (v / max)).toFixed(1)}`).join(' ');
  return `<svg class="vs-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${p}"/></svg>`;
}

/** Ranking em barras. `itens` = [{k, n}]. */
function visBarras(itens, vazio) {
  if (!itens || !itens.length) return `<p class="vazio">${esc(vazio || 'Sem dados no período.')}</p>`;
  const max = Math.max(...itens.map(i => i.n));
  const total = itens.reduce((s, i) => s + i.n, 0);
  return `<div class="vs-barras">${itens.map(i => `
    <div class="vs-barra">
      <span class="vs-barra-rot" title="${esc(i.k)}">${esc(i.k)}</span>
      <span class="vs-barra-trilho"><span class="vs-barra-preenche" style="width:${Math.max(2, Math.round(i.n / max * 100))}%"></span></span>
      <span class="vs-barra-n">${visNum(i.n)} <em>${total ? Math.round(i.n / total * 100) : 0}%</em></span>
    </div>`).join('')}</div>`;
}

/** Mapa de calor hora × dia da semana: onde está o público quando ele aparece. */
function visHeatmap(heat) {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const max = Math.max(1, ...heat.flat());
  const horas = [0, 3, 6, 9, 12, 15, 18, 21];
  return `<div class="vs-heat">
    <div class="vs-heat-horas"><span></span>${horas.map(h => `<span style="grid-column:${h + 2}/span 3">${String(h).padStart(2, '0')}h</span>`).join('')}</div>
    ${heat.map((linha, d) => `<div class="vs-heat-linha"><span class="vs-heat-dia">${dias[d]}</span>${linha.map((v, h) => `<i style="opacity:${v ? (0.15 + 0.85 * v / max).toFixed(2) : 0}" title="${dias[d]} ${String(h).padStart(2, '0')}h — ${visNum(v)} visita(s)"></i>`).join('')}</div>`).join('')}
    <p class="vs-nota">Horário do servidor (UTC). Quanto mais escuro, mais gente naquele momento.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------
async function renderEstatisticas() {
  conteudo().innerHTML = cabecalho('Visitas dos sites', 'Audiência de todos os sites do Grupo Villela Stay — analytics próprio, sem cookie e sem gravar IP.') +
    `<div class="vs-controles">
       <label>Período <select id="vs-dias">
         <option value="7">7 dias</option><option value="30" selected>30 dias</option>
         <option value="90">90 dias</option><option value="365">12 meses</option>
       </select></label>
       <label>Site <select id="vs-produto"><option value="">Todos os sites</option></select></label>
       <label class="vs-check"><input type="checkbox" id="vs-bots"> Contar robôs</label>
       <button class="btn peq secund" id="vs-csv">⬇ Exportar CSV</button>
     </div>
     <div id="vs-corpo"><p class="vazio">Carregando…</p></div>`;

  $('#vs-dias').value = String(VIS.dias);
  $('#vs-bots').checked = VIS.bots;
  $('#vs-dias').onchange = (e) => { VIS.dias = +e.target.value; carregarVisitas(); };
  $('#vs-produto').onchange = (e) => { VIS.produto = e.target.value; carregarVisitas(); };
  $('#vs-bots').onchange = (e) => { VIS.bots = e.target.checked; carregarVisitas(); };
  $('#vs-csv').onclick = () => window.open(`/staff/api/visitas.csv?dias=${VIS.dias}&bots=${VIS.bots ? 1 : 0}`, '_blank');
  carregarVisitas();
}

async function carregarVisitas() {
  const alvo = $('#vs-corpo');
  if (!alvo) return;
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const d = await api('GET', `/visitas?dias=${VIS.dias}&produto=${encodeURIComponent(VIS.produto)}&bots=${VIS.bots ? 1 : 0}`);
    VIS.dados = d;
    // O seletor de site sai do próprio catálogo, então produto novo aparece sozinho.
    const sel = $('#vs-produto');
    if (sel && sel.options.length <= 1) {
      sel.innerHTML = '<option value="">Todos os sites</option>' +
        d.catalogo.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
      sel.value = VIS.produto;
    }
    alvo.innerHTML = visitasHtml(d);
    ligarAbasVisitas();
  } catch (e) {
    alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`;
  }
}

function visitasHtml(d) {
  const r = d.resumo;
  const cartao = (n, rot, delta, dica) => `<div class="card"><div class="n">${n}</div><div class="rot">${rot}${dica ? ` <abbr title="${esc(dica)}">?</abbr>` : ''}</div>${delta || ''}</div>`;

  const quedas = d.sites.filter(s => s.delta != null && s.delta <= -30 && s.anterior >= 5);
  const alerta = quedas.length
    ? `<div class="aviso">⚠️ Queda relevante contra o período anterior: ${quedas.map(s => `<b>${esc(s.nome)}</b> (${s.delta}%)`).join(', ')}.</div>` : '';

  const semGeo = d.semLocalidade
    ? '<p class="vs-nota">Nenhuma localidade ainda: a base resolve a rede na segunda visita dela. Volte depois do primeiro acesso real.</p>' : '';

  return `
  ${alerta}
  <div class="cards">
    ${cartao(visNum(r.visitas), 'Visitas', visDelta(r.delta.visitas))}
    ${cartao(visNum(r.unicos), 'Visitantes únicos', visDelta(r.delta.unicos), 'Contagem anônima por dia: o identificador troca à meia-noite, então quem volta amanhã conta de novo.')}
    ${cartao(visNum(r.sessoes), 'Sessões', visDelta(r.delta.sessoes), 'Visitas do mesmo visitante com menos de 30 minutos entre elas.')}
    ${cartao(r.paginasPorSessao, 'Páginas por sessão', '')}
    ${cartao(r.rejeicaoPct + '%', 'Taxa de rejeição', visDelta(r.delta.rejeicaoPct, false), 'Sessões em que a pessoa viu uma página só e foi embora.')}
    ${cartao(visNum(r.bots), 'Robôs barrados', '', 'Rastreadores de busca e de IA. Ficam fora da conta a menos que você marque "Contar robôs".')}
  </div>

  <h2 class="titulo vs-h2">Visitas por data</h2>
  <div class="vs-caixa">${visGraficoLinha(d.serie)}</div>

  <h2 class="titulo vs-h2">Cada site do grupo</h2>
  <div class="vs-caixa">
    <div class="vs-rolagem"><table class="vs-tabela">
      <thead><tr><th>Site</th><th>Tendência</th><th class="num">Visitas</th><th class="num">Período anterior</th><th class="num">Variação</th></tr></thead>
      <tbody>${d.sites.length ? d.sites.map(s => `
        <tr class="vs-linha-site" data-produto="${esc(s.id)}">
          <td><b>${s.emoji} ${esc(s.nome)}</b></td>
          <td>${visSparkline(s.serie)}</td>
          <td class="num">${visNum(s.visitas)}</td>
          <td class="num suave">${visNum(s.anterior)}</td>
          <td class="num">${visDelta(s.delta)}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="vazio">Nenhuma visita registrada ainda.</td></tr>'}
      </tbody>
    </table></div>
    <p class="vs-nota">Clique em um site para filtrar a página inteira por ele.</p>
  </div>

  <div class="vs-abas">
    ${[['origem', '🧭 Origem'], ['local', '📍 Localidade'], ['publico', '📱 Público'], ['paginas', '📄 Páginas'], ['funil', '🎯 Funil'], ['casas', '🏡 Casas']]
      .map(([id, rot]) => `<button data-aba="${id}" class="${VIS.aba === id ? 'ativa' : ''}">${rot}</button>`).join('')}
  </div>
  <div id="vs-aba" class="vs-caixa">${visitasAbaHtml(VIS.aba, d)}</div>
  <p class="vs-nota rodape">Período de ${esc(d.periodo.de)} a ${esc(d.periodo.ate)}. Sem cookie, sem IP gravado: a localidade vem de base offline no servidor e o visitante é um código anônimo que troca todo dia (LGPD, art. 6º, III).</p>
  ${semGeo}`;
}

function visitasAbaHtml(aba, d) {
  if (aba === 'origem') return `
    <div class="vs-duas">
      <div><h3 class="vs-h3">De onde vieram</h3>${visBarras(d.canais)}</div>
      <div><h3 class="vs-h3">Campanhas (UTM)</h3>${visBarras(d.campanhas, 'Nenhuma visita com utm_campaign. Marque os links das campanhas com ?utm_source=instagram&utm_campaign=nome para elas aparecerem aqui.')}</div>
    </div>`;
  if (aba === 'local') {
    const L = d.localidade || { total: 0, comPais: 0, comCidade: 0 };
    const pct = (n) => L.total ? Math.round(n / L.total * 100) : 0;
    return `
    <div class="vs-tres">
      <div><h3 class="vs-h3">Países</h3>${visBarras(d.paises)}</div>
      <div><h3 class="vs-h3">Estados (Brasil)</h3>${visBarras(d.estados)}</div>
      <div><h3 class="vs-h3">Cidades</h3>${visBarras(d.cidades)}</div>
    </div>
    <p class="vs-nota">Cobertura: país identificado em ${pct(L.comPais)}% das visitas, cidade em ${pct(L.comCidade)}%.
    A base offline não tem cidade para toda faixa de IP — os rankings acima são desse recorte, não do total.</p>`;
  }
  if (aba === 'publico') return `
    <div class="vs-duas">
      <div><h3 class="vs-h3">Dispositivo</h3>${visBarras(d.dispositivos)}
           <h3 class="vs-h3">Idioma do visitante</h3>${visBarras(d.idiomas)}</div>
      <div><h3 class="vs-h3">Navegador</h3>${visBarras(d.navegadores)}
           <h3 class="vs-h3">Sistema</h3>${visBarras(d.sistemas)}</div>
    </div>
    <h3 class="vs-h3">Quando o público aparece</h3>${visHeatmap(d.heat)}`;
  if (aba === 'paginas') return `
    <div class="vs-tres">
      <div><h3 class="vs-h3">Mais vistas</h3>${visBarras(d.paginas)}</div>
      <div><h3 class="vs-h3">Por onde entram</h3>${visBarras(d.entradas)}</div>
      <div><h3 class="vs-h3">Onde abandonam</h3>${visBarras(d.saidas)}</div>
    </div>`;
  if (aba === 'funil') return '<p class="vazio">Carregando funil…</p>';
  if (aba === 'casas') return '<p class="vazio">Carregando casas…</p>';
  return '';
}

function ligarAbasVisitas() {
  document.querySelectorAll('.vs-abas button').forEach(b => b.onclick = () => {
    VIS.aba = b.dataset.aba;
    document.querySelectorAll('.vs-abas button').forEach(x => x.classList.toggle('ativa', x === b));
    $('#vs-aba').innerHTML = visitasAbaHtml(VIS.aba, VIS.dados);
    if (VIS.aba === 'funil') carregarFunilVisitas();
    if (VIS.aba === 'casas') carregarCasasVisitas();
  });
  document.querySelectorAll('.vs-linha-site').forEach(tr => tr.onclick = () => {
    VIS.produto = tr.dataset.produto;
    const sel = $('#vs-produto'); if (sel) sel.value = VIS.produto;
    carregarVisitas();
  });
  if (VIS.aba === 'funil') carregarFunilVisitas();
  if (VIS.aba === 'casas') carregarCasasVisitas();
}

/** Funil por canal: visita → lead → reserva. É o que diz qual origem dá dinheiro. */
async function carregarFunilVisitas() {
  const alvo = $('#vs-aba'); if (!alvo) return;
  try {
    const f = await api('GET', `/visitas-funil?dias=${VIS.dias}`);
    alvo.innerHTML = `
      <h3 class="vs-h3">Visita → lead → reserva, por origem</h3>
      <div class="vs-rolagem"><table class="vs-tabela">
        <thead><tr><th>Origem</th><th class="num">Visitas</th><th class="num">Leads</th><th class="num">Reservas</th><th class="num">Visita→lead</th></tr></thead>
        <tbody>${f.linhas.length ? f.linhas.map(l => `<tr>
          <td>${esc(l.canal)}</td><td class="num">${visNum(l.visitas)}</td>
          <td class="num">${visNum(l.leads)}</td><td class="num">${visNum(l.reservas)}</td>
          <td class="num">${l.conversaoPct == null ? '—' : l.conversaoPct + '%'}</td></tr>`).join('')
          : '<tr><td colspan="5" class="vazio">Sem leads no período.</td></tr>'}
        </tbody>
      </table></div>
      <p class="vs-nota">${esc(f.aviso)}</p>`;
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

/** Casas mais vistas × ocupação real: mostra anúncio muito olhado e pouco reservado. */
async function carregarCasasVisitas() {
  const alvo = $('#vs-aba'); if (!alvo) return;
  try {
    const c = await api('GET', `/visitas-casas?dias=${VIS.dias}`);
    alvo.innerHTML = `
      <h3 class="vs-h3">Casas mais vistas no site × ocupação</h3>
      <div class="vs-rolagem"><table class="vs-tabela">
        <thead><tr><th>Anúncio</th><th class="num">Visitas à página</th><th class="num">Ocupação no período</th><th>Leitura</th></tr></thead>
        <tbody>${c.linhas.length ? c.linhas.map(l => `<tr>
          <td><b>${esc(l.codigo)}</b> ${esc(l.nome)}</td>
          <td class="num">${visNum(l.visitas)}</td>
          <td class="num">${l.ocupacaoPct == null ? '—' : l.ocupacaoPct + '%'}</td>
          <td class="suave">${esc(l.leitura || '')}</td></tr>`).join('')
          : '<tr><td colspan="4" class="vazio">Nenhuma página de hospedagem visitada no período.</td></tr>'}
        </tbody>
      </table></div>
      ${c.aviso ? `<p class="vs-nota">${esc(c.aviso)}</p>` : ''}`;
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
