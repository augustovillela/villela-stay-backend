'use strict';
// ============================================================================
// Portal Staff — módulo: app-music-telemetria (aba 📡 Telemetria da 🎵 Musique).
// Mostra o que o app do músico reporta em POST /music/api/telemetria: falhas
// técnicas anônimas (evento, rota, navegador, código), nunca IP, e-mail, áudio
// ou conteúdo musical. Lê só GET /staff/api/music/telemetria, com a sessão do
// staff que o resto do portal já usa.
//
// Duas regras que a tela garante, não só sugere:
//   · real e demonstração NUNCA se misturam: cada consulta tem número de
//     sequência (resposta atrasada de um modo não pinta a tela do outro) e a
//     resposta cujo `demonstracao` não bate com o modo pedido é recusada;
//   · erro de API não vira número: 401/403/404/429/5xx e rede caída têm cada
//     um a sua mensagem, e nenhum deles mostra dado algum.
// Compartilha o escopo global com app-core.js e app-music.js (scripts clássicos).
// ============================================================================
const MTEL_PERIODOS = [1, 7, 14, 30];
const MTEL = { dias: 7, demo: false, seq: 0 };

const MTEL_EVENTO = {
  js_error: 'Erro de JavaScript',
  audio_load_error: 'Falha ao carregar áudio',
  audio_decode_error: 'Falha ao decodificar áudio',
  microphone_denied: 'Microfone recusado',
  browser_unsupported: 'Navegador sem suporte',
  upload_error: 'Falha no envio',
  worker_error: 'Falha no worker',
  route_error: 'Erro de rota',
};
// Severidade com ícone E texto: a cor sozinha não diz nada a quem não a vê.
const MTEL_SEV = {
  alta: { rot: 'Alta', ico: '▲▲', ordem: 0 },
  media: { rot: 'Média', ico: '▲', ordem: 1 },
  baixa: { rot: 'Baixa', ico: '●', ordem: 2 },
};

const mtelNum = (n) => Number(n || 0).toLocaleString('pt-BR');
const mtelEvento = (k) => MTEL_EVENTO[k] || k || '(sem tipo)';
const mtelDia = (iso) => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : String(iso || ''); };
function mtelData(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function mtelHa(iso, agora = Date.now()) {
  const ms = agora - Date.parse(iso);
  if (!(ms >= 0)) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

// ---- erro → mensagem. `status` ausente = o fetch nem chegou ao servidor —
// exceto a recusa da própria tela (`recusada`), que chegou e veio errada. ----
function mtelErroDe(e) {
  if (e && e.recusada) return { tipo: 'erro', titulo: 'Resposta recusada', texto: e.message };
  const st = e && e.status;
  if (!st) return { tipo: 'rede', titulo: 'Sem conexão com o servidor', texto: 'A consulta não chegou ao backend. Confira a internet e tente de novo.' };
  if (st === 401) return { tipo: 'auth', titulo: 'Sessão expirada', texto: 'Sua sessão do Portal Staff não vale mais. Entre de novo para ver a telemetria.', entrar: true };
  if (st === 403) return { tipo: 'auth', titulo: 'Sem permissão', texto: 'Seu usuário não tem acesso ao painel do Musique. Peça acesso a um administrador.' };
  if (st === 404) return { tipo: 'indisponivel', titulo: 'Telemetria não encontrada', texto: 'O backend publicado não tem a rota de telemetria — pode estar numa versão anterior. Tente de novo depois do próximo deploy.' };
  if (st === 429) return { tipo: 'limite', titulo: 'Muitas consultas seguidas', texto: 'O servidor pediu uma pausa. Aguarde um minuto e tente de novo.' };
  if (st >= 500) return { tipo: 'indisponivel', titulo: 'Serviço indisponível', texto: `O Musique não respondeu (HTTP ${st}). Na troca de instância do Render isso dura até um minuto — tente de novo em instantes.` };
  return { tipo: 'erro', titulo: 'Não deu para carregar', texto: (e && e.message) || `Erro ${st}` };
}

// Recusa o que não é telemetria ou não é do modo pedido. Melhor tela de erro
// do que um painel real com número de demonstração dentro.
function mtelValidar(t, demoPedido) {
  const recusa = (m) => Object.assign(new Error(m), { recusada: true });
  if (!t || typeof t !== 'object' || !Array.isArray(t.eventos)) throw recusa('A resposta veio sem telemetria.');
  if (Boolean(t.demonstracao) !== Boolean(demoPedido)) {
    throw recusa('A resposta não corresponde ao modo pedido. Nada foi exibido, para não misturar dados reais e de demonstração.');
  }
  const lista = (x) => (Array.isArray(x) ? x.filter((i) => i && Number(i.n) > 0) : []);
  return {
    demonstracao: Boolean(t.demonstracao),
    dias: Number(t.dias) || 0,
    total: Number(t.total) || 0,
    ultimo_evento: t.ultimo_evento || null,
    por_dia: lista(t.por_dia),
    eventos: lista(t.eventos), rotas: lista(t.rotas), navegadores: lista(t.navegadores), codigos: lista(t.codigos),
    alertas: Array.isArray(t.alertas) ? t.alertas : [],
  };
}

// Dia sem evento é zero, não buraco: sem preencher, 3 dias com evento em 30
// pareceriam um gráfico de 3 dias. Na demonstração as datas são as do
// conjunto fictício, sem completar com "hoje".
function mtelSerie(t, agora = Date.now()) {
  if (t.demonstracao) return t.por_dia.map((x) => ({ dia: x.dia, n: Number(x.n) }));
  const mapa = new Map(t.por_dia.map((x) => [x.dia, Number(x.n)]));
  const serie = [];
  const ini = new Date(agora - t.dias * 86400000);
  const d = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), ini.getUTCDate()));
  const fim = new Date(agora).toISOString().slice(0, 10);
  for (let i = 0; i < 40; i++) {
    const k = d.toISOString().slice(0, 10);
    serie.push({ dia: k, n: mapa.get(k) || 0 });
    if (k >= fim) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return serie;
}

function mtelGraficoDias(serie, demo) {
  const max = Math.max(1, ...serie.map((x) => x.n));
  const total = serie.reduce((s, x) => s + x.n, 0);
  const pico = serie.reduce((a, x) => (x.n > a.n ? x : a), { n: -1 });
  const W = 640, H = 220, base = 180, topo = 24, larg = W / Math.max(1, serie.length);
  const rotular = serie.length <= 16;
  const barras = serie.map((x, i) => {
    const h = x.n ? Math.max(2, Math.round((x.n / max) * (base - topo))) : 0;
    const xb = i * larg + larg * 0.18, wb = larg * 0.64;
    const valor = x.n && (rotular || x.n === max) ? `<text x="${(xb + wb / 2).toFixed(1)}" y="${base - h - 6}" text-anchor="middle" class="mtel-val">${x.n}</text>` : '';
    // No máximo ~8 rótulos de data: no celular o SVG encolhe e mais que isso encavala.
    const eixo = i % Math.ceil(serie.length / 8) === 0 || i === serie.length - 1 ? `<text x="${(xb + wb / 2).toFixed(1)}" y="${base + 18}" text-anchor="middle" class="mtel-eixo">${esc(mtelDia(x.dia))}</text>` : '';
    return `<rect x="${xb.toFixed(1)}" y="${base - h}" width="${wb.toFixed(1)}" height="${h}" rx="3" class="mtel-barra"${demo ? ' style="fill:url(#mtel-hachura)"' : ''}><title>${esc(mtelDia(x.dia))}: ${x.n} evento(s)</title></rect>${valor}${eixo}`;
  }).join('');
  const resumo = `Eventos por dia${demo ? ' (demonstração, dados artificiais)' : ''}: ${total} em ${serie.length} dia(s)` +
    (pico.n > 0 ? `; pico de ${pico.n} em ${mtelDia(pico.dia)}.` : '; nenhum evento.');
  const linhas = serie.map((x) => `<tr><th scope="row">${esc(mtelDia(x.dia))}</th><td>${x.n}</td></tr>`).join('');
  return `<figure class="mtel-fig mtel-fig-larga">
      <h3 id="mtel-h-dias">Eventos por dia</h3>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="mtel-h-dias mtel-d-dias" preserveAspectRatio="xMidYMid meet">
        <desc id="mtel-d-dias">${esc(resumo)}</desc>
        ${demo ? '<defs><pattern id="mtel-hachura" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#F3E3B5"/><rect width="4" height="8" fill="#8A6A10"/></pattern></defs>' : ''}
        <line x1="0" y1="${base}" x2="${W}" y2="${base}" class="mtel-linha"/>
        ${barras}
        ${demo ? `<text x="${W - 8}" y="16" text-anchor="end" class="mtel-marca">DEMONSTRAÇÃO</text>` : ''}
      </svg>
      <details class="mtel-det"><summary>Ver os números em tabela</summary>
        <table class="tab"><caption class="mtel-sr">Eventos por dia</caption>
          <thead><tr><th scope="col">Dia (UTC)</th><th scope="col">Eventos</th></tr></thead><tbody>${linhas}</tbody></table>
      </details>
    </figure>`;
}

// Ranking: tabela de verdade (lida por leitor de tela) com a barra como
// enfeite aria-hidden; o número e o percentual estão sempre escritos.
function mtelRanking(id, titulo, itens, rotulo, demo) {
  const soma = itens.reduce((s, x) => s + Number(x.n), 0) || 1;
  const max = Math.max(1, ...itens.map((x) => Number(x.n)));
  const corpo = itens.length
    ? `<div class="mtel-rolagem"><table class="tab mtel-rank" aria-describedby="mtel-d-${id}">
        <caption class="mtel-sr">${esc(titulo)}${demo ? ' — demonstração, dados artificiais' : ''}</caption>
        <thead><tr><th scope="col">Item</th><th scope="col">Ocorrências</th><th scope="col">%</th></tr></thead>
        <tbody>${itens.map((x) => {
          const n = Number(x.n), pct = Math.round((n / soma) * 100);
          return `<tr><th scope="row"><span class="mtel-item">${esc(rotulo(x.chave))}</span>
              <span class="mtel-trilho" aria-hidden="true"><span class="mtel-fio${demo ? ' mtel-fio-demo' : ''}" style="width:${Math.round((n / max) * 100)}%"></span></span></th>
            <td>${mtelNum(n)}</td><td>${pct}%</td></tr>`;
        }).join('')}</tbody></table></div>`
    : '<p class="vazio">Nenhum registro no período.</p>';
  const primeiro = itens[0];
  const desc = primeiro ? `${itens.length} item(ns); o mais frequente é ${rotulo(primeiro.chave)} com ${primeiro.n}.` : 'Sem registros.';
  return `<figure class="mtel-fig" aria-labelledby="mtel-h-${id}">
      <h3 id="mtel-h-${id}">${esc(titulo)}</h3>
      <p id="mtel-d-${id}" class="mtel-sr">${esc(desc)}</p>
      ${corpo}
    </figure>`;
}

function mtelAlertas(t) {
  const qtd = new Map(t.eventos.map((x) => [x.chave, Number(x.n)]));
  const periodo = t.demonstracao ? `${t.dias} dias (fixo da demonstração)` : `Últimos ${t.dias} dia(s)`;
  const lista = t.alertas.slice().sort((a, b) => ((MTEL_SEV[a.severidade] || {}).ordem ?? 9) - ((MTEL_SEV[b.severidade] || {}).ordem ?? 9));
  const titulo = `<h3 id="mtel-h-alertas">Alertas${t.demonstracao ? ' de demonstração' : ''}</h3>`;
  if (!lista.length) {
    return `<section class="mtel-bloco" aria-labelledby="mtel-h-alertas">${titulo}
      <p class="vazio">Nenhum alerta ativo: nenhum tipo de evento chegou a 10 ocorrências no período.</p></section>`;
  }
  const linhas = lista.map((a) => {
    const s = MTEL_SEV[a.severidade] || { rot: a.severidade || '—', ico: '•' };
    const n = qtd.get(a.tipo);
    return `<tr class="mtel-sev-${esc(a.severidade || 'x')}">
        <td><span class="mtel-sev"><span aria-hidden="true">${s.ico}</span> ${esc(s.rot)}</span></td>
        <th scope="row">${esc(mtelEvento(a.tipo))}<div class="obs"><code>${esc(a.tipo)}</code></div></th>
        <td>${esc(a.mensagem)}</td>
        <td>${n == null ? '—' : mtelNum(n)}</td>
        <td>${esc(periodo)}</td>
      </tr>`;
  }).join('');
  return `<section class="mtel-bloco" aria-labelledby="mtel-h-alertas">${titulo}
      <div class="mtel-rolagem" tabindex="0" role="region" aria-label="Tabela de alertas (rolável)">
        <table class="tab mtel-alertas">
          <caption class="mtel-sr">Alertas${t.demonstracao ? ' de demonstração, dados artificiais' : ' reais'}, do mais grave ao menos grave</caption>
          <thead><tr><th scope="col">Severidade</th><th scope="col">Tipo</th><th scope="col">Mensagem</th><th scope="col">Quantidade</th><th scope="col">Período</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div></section>`;
}

function mtelCards(t, agora = Date.now()) {
  const card = (rot, n, sub) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(rot)}</div>${sub ? `<div class="obs">${esc(sub)}</div>` : ''}</div>`;
  const altas = t.alertas.filter((a) => a.severidade === 'alta').length;
  const ult = mtelData(t.ultimo_evento);
  return `<div class="cards mtel-cards">
      ${card('Total de eventos', mtelNum(t.total), t.demonstracao ? 'fictício' : `nos últimos ${t.dias} dia(s)`)}
      ${card('Alertas ativos', mtelNum(t.alertas.length), t.alertas.length ? `${altas} de severidade alta` : 'nenhum acima do limiar')}
      ${card('Período', t.demonstracao ? `${t.dias} dias` : `${t.dias} dia${t.dias > 1 ? 's' : ''}`, t.demonstracao ? 'fixo da demonstração' : 'janela consultada')}
      ${card('Último evento recebido', ult ? esc(ult.slice(0, 5)) : '—',
        !ult ? 'nenhum nos últimos 30 dias'
          : [`${ult.slice(0, 10)} às ${ult.slice(-5)} (Brasília)`, t.demonstracao ? 'fictício' : mtelHa(t.ultimo_evento, agora)].filter(Boolean).join(' · '))}
    </div>`;
}

// Corpo completo de um resultado já validado.
function mtelHtml(t, agora = Date.now()) {
  const demo = t.demonstracao;
  const faixa = demo
    ? `<div class="mtel-faixa-demo" role="note">
        <b>⚠ MODO DEMONSTRAÇÃO — DADOS ARTIFICIAIS.</b>
        Nada aqui veio de músicos reais e nada foi gravado no banco. Serve para ver como a tela se comporta com alertas.
        Para voltar aos dados reais, desligue o modo demonstração.
      </div>`
    : `<p class="mtel-selo-real"><span aria-hidden="true">●</span> Dados reais do Musique · retenção de 30 dias · sem IP, e-mail, áudio ou conteúdo musical</p>`;
  const vazio = !demo && t.total === 0;
  return `<div class="mtel-resultado ${demo ? 'mtel-demo' : 'mtel-real'}" data-modo="${demo ? 'demo' : 'real'}">
      ${faixa}
      ${mtelCards(t, agora)}
      ${vazio
        ? `<div class="mtel-vazio" role="status"><h3>Sem eventos no período</h3>
            <p>O app do músico não reportou nenhuma falha nos últimos ${t.dias} dia(s).${t.ultimo_evento ? '' : ' Também não há nenhum evento nos últimos 30 dias — se isso surpreender, vale conferir se o envio de telemetria do app está funcionando.'}</p></div>`
        : `${mtelAlertas(t)}
          <div class="mtel-graficos">
            ${mtelGraficoDias(mtelSerie(t, agora), demo)}
            ${mtelRanking('tipo', 'Eventos por tipo', t.eventos, mtelEvento, demo)}
            ${mtelRanking('rota', 'Eventos por rota', t.rotas, (k) => k || '(sem rota)', demo)}
            ${mtelRanking('nav', 'Eventos por navegador', t.navegadores, (k) => k || '(não informado)', demo)}
          </div>
          ${t.codigos.length ? mtelRanking('cod', 'Códigos de erro', t.codigos, (k) => k || '(sem código)', demo) : ''}`}
    </div>`;
}

function mtelErroHtml(e) {
  const m = mtelErroDe(e);
  return `<div class="mtel-erro mtel-erro-${m.tipo}" role="alert">
      <h3>${esc(m.titulo)}</h3>
      <p>${esc(m.texto)}</p>
      <p class="mtel-acoes">
        ${m.entrar ? '<a class="btn" href="/staff/">Entrar de novo</a>' : ''}
        ${m.tipo === 'auth' ? '' : '<button type="button" class="btn secund" data-mtel="repetir">Tentar de novo</button>'}
      </p>
    </div>`;
}

function mtelControles() {
  const radios = MTEL_PERIODOS.map((d) => `<label class="mtel-per">
      <input type="radio" name="mtel-dias" value="${d}"${d === MTEL.dias ? ' checked' : ''}${MTEL.demo ? ' disabled' : ''}>
      <span>${d === 1 ? '1 dia' : `${d} dias`}</span></label>`).join('');
  return `<section class="mtel" aria-labelledby="mtel-h">
      <h2 id="mtel-h" class="mtel-titulo">Telemetria do Musique${MTEL.demo ? ' <span class="mtel-tag-demo">demonstração</span>' : ''}</h2>
      <div class="mtel-controles">
        <fieldset class="mtel-periodos"${MTEL.demo ? ' aria-describedby="mtel-per-obs"' : ''}>
          <legend>Período</legend>${radios}
          ${MTEL.demo ? '<span id="mtel-per-obs" class="obs">A demonstração tem período fixo de 7 dias.</span>' : ''}
        </fieldset>
        <div class="mtel-botoes">
          <button type="button" class="btn ${MTEL.demo ? '' : 'secund'} mtel-btn-demo" data-mtel="demo" aria-pressed="${MTEL.demo}">
            ${MTEL.demo ? '✕ Sair do modo demonstração' : '🧪 Modo demonstração'}</button>
          <button type="button" class="btn secund" data-mtel="repetir">↻ Atualizar</button>
        </div>
      </div>
      <p id="mtel-anuncio" class="mtel-sr" aria-live="polite"></p>
      <div id="mtel-corpo" aria-busy="true"><p class="vazio">Carregando a telemetria…</p></div>
    </section>`;
}

async function muTelemetria(alvo) {
  alvo.innerHTML = mtelControles();
  alvo.querySelectorAll('input[name="mtel-dias"]').forEach((r) => {
    r.onchange = () => { MTEL.dias = Number(r.value); mtelBuscar(); };
  });
  alvo.onclick = (ev) => {
    const b = ev.target.closest('[data-mtel]');
    if (!b || !alvo.contains(b)) return;
    if (b.dataset.mtel === 'demo') {
      MTEL.demo = !MTEL.demo;
      muTelemetria(alvo);
      const nb = alvo.querySelector('[data-mtel="demo"]');
      if (nb) nb.focus();
      return;
    }
    if (b.dataset.mtel === 'repetir') mtelBuscar();
  };
  return mtelBuscar();
}

async function mtelBuscar() {
  const seq = ++MTEL.seq;
  const demo = MTEL.demo, dias = MTEL.dias;
  const corpo = $('#mtel-corpo'), anuncio = $('#mtel-anuncio');
  if (!corpo) return;
  corpo.setAttribute('aria-busy', 'true');
  corpo.innerHTML = '<p class="vazio">Carregando a telemetria…</p>';
  try {
    const r = await api('GET', `/music/telemetria?dias=${dias}${demo ? '&demonstracao=1' : ''}`);
    if (seq !== MTEL.seq || !document.body.contains(corpo)) return;
    const t = mtelValidar(r && r.telemetria, demo);
    corpo.innerHTML = mtelHtml(t);
    if (anuncio) anuncio.textContent = demo
      ? 'Demonstração carregada: dados artificiais.'
      : `Telemetria real carregada: ${t.total} evento(s) em ${t.dias} dia(s), ${t.alertas.length} alerta(s).`;
  } catch (e) {
    if (seq !== MTEL.seq || !document.body.contains(corpo)) return;
    corpo.innerHTML = mtelErroHtml(e);
    if (anuncio) anuncio.textContent = mtelErroDe(e).titulo;
  } finally {
    if (seq === MTEL.seq) corpo.setAttribute('aria-busy', 'false');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MTEL, mtelErroDe, mtelValidar, mtelSerie, mtelHtml, mtelErroHtml, mtelControles, mtelAlertas, mtelCards };
}
