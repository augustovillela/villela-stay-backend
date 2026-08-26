'use strict';
// ============================================================================
// Portal Staff — módulo: app-voz (comandos falados).
//
// Esta tela existe por DOIS motivos, e o primeiro foi um defeito meu:
// a página do círculo (/staff/voz) foi para o ar sem nenhum caminho até
// ela — só dava para chegar digitando a URL. Permissão sem porta é
// decorativa; tela sem porta não existe.
//
// O segundo é o painel: os pedidos só apareciam por API. E o que mais
// importa aqui não são os que deram certo — é a lista dos NÃO ENTENDIDOS,
// que é exatamente a lista do que o sistema deveria saber fazer e ainda
// não sabe. Ela só tem valor se alguém a vir.
//
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================

const VOZ_ROTULO_STATUS = {
  recebido: 'Recebido', respondido: 'Respondido', aguardando_aprovacao: 'Aguardando autorização',
  aprovado: 'Autorizado', recusado: 'Recusado', executando: 'Executando', concluido: 'Concluído',
  falhou: 'Falhou', nao_entendido: 'Não entendi', nao_suportado: 'Ainda não sei fazer',
  expirado: 'Vencido',
};
// Verde = deu certo; âmbar = espera alguém; vermelho = precisa de atenção.
const VOZ_COR_STATUS = {
  concluido: '#046c4e', aprovado: '#046c4e', respondido: '#046c4e',
  aguardando_aprovacao: '#92400e', executando: '#92400e', recebido: '#6b7075',
  nao_entendido: '#b42318', nao_suportado: '#b42318', falhou: '#b42318',
  recusado: '#6b7075', expirado: '#6b7075',
};

function vozLinhaSaude(s) {
  const sim = (v) => (v ? '✅' : '⚠️');
  const itens = [
    `${sim(s.tempoReal && s.tempoReal.pronto)} círculo (${(s.tempoReal && s.tempoReal.modelo) || '—'})`,
    `${sim(s.cerebro && s.cerebro.llm)} cérebro`,
    `${sim(s.transcricao && s.transcricao.pronta)} áudio`,
    `${sim(s.whatsapp)} WhatsApp`,
    `${sim(s.executar)} ações ligadas`,
    `${(s.acoes && s.acoes.implementadas ? s.acoes.implementadas.length : 0)}/${(s.acoes && s.acoes.catalogo) || 0} ações`,
  ];
  // A DLQ só aparece quando existe: contador zerado vira ruído, e ruído
  // é o que faz ninguém olhar quando deixa de ser zero.
  if (s.fila && s.fila.dlq) itens.push(`🔴 ${s.fila.dlq} na DLQ`);
  return itens.join(' · ');
}

async function renderVoz() {
  conteudo().innerHTML = cabecalho('🎙️ Voz', 'Falar com o sistema — pelo círculo ou pelo WhatsApp')
    + '<p class="obs">Carregando…</p>';

  let saude = null; let pedidos = []; let resumo = {};
  try {
    const [s, p] = await Promise.all([api('GET', '/voz/saude'), api('GET', '/voz/pedidos?limite=60')]);
    saude = s; pedidos = p.pedidos || []; resumo = p.resumo || {};
  } catch (e) {
    conteudo().innerHTML = cabecalho('🎙️ Voz')
      + `<div class="card"><p>Não consegui ler o módulo de voz: ${esc(e.message)}</p></div>`;
    return;
  }

  const naoEntendidos = pedidos.filter((x) => x.status === 'nao_entendido' || x.status === 'nao_suportado');
  const esperando = pedidos.filter((x) => x.status === 'aguardando_aprovacao');

  const linha = (p) => {
    const cor = VOZ_COR_STATUS[p.status] || '#6b7075';
    const quando = String(p.criado_em || '').replace('T', ' ').slice(0, 16);
    return `<tr>
      <td style="white-space:nowrap;color:#6b7075;font-size:12px">${esc(quando)}</td>
      <td>${esc(p.texto_original || '')}${p.transcrito ? ' <span class="obs">🎤</span>' : ''}</td>
      <td style="white-space:nowrap"><code>${esc(p.acao || '—')}</code></td>
      <td style="white-space:nowrap;color:${cor};font-weight:600">${esc(VOZ_ROTULO_STATUS[p.status] || p.status)}</td>
      <td style="white-space:nowrap"><a href="/staff/voz/pedido/${esc(p.id)}" target="_blank" rel="noopener">ver</a></td>
    </tr>`;
  };

  conteudo().innerHTML = cabecalho('🎙️ Voz', 'Falar com o sistema — pelo círculo ou pelo WhatsApp') + `
    <div class="card">
      <p style="margin:0 0 14px">
        <a class="btn" href="/staff/voz" target="_blank" rel="noopener">🎙️ Abrir o círculo ↗</a>
        <span class="obs" style="margin-left:10px">abre em tela cheia · precisa de microfone</span>
      </p>
      <p class="obs" style="margin:0">${esc(vozLinhaSaude(saude))}</p>
      ${(saude.destinatarios && saude.destinatarios.length)
        ? `<p class="obs" style="margin:6px 0 0">E-mail liberado para: ${saude.destinatarios.map(esc).join(', ')}</p>`
        : '<p class="obs" style="margin:6px 0 0">⚠️ Nenhum destinatário de e-mail cadastrado (VOZ_EMAILS).</p>'}
    </div>

    ${esperando.length ? `<div class="card" style="border-left:4px solid #92400e">
      <h2 style="margin:0 0 8px;font-size:16px">Esperando a sua autorização (${esperando.length})</h2>
      <p class="obs" style="margin:0 0 10px">O link de cada um foi para o seu WhatsApp. Autorizar é lá — abrir aqui não decide nada.</p>
      <table><tbody>${esperando.map(linha).join('')}</tbody></table>
    </div>` : ''}

    ${naoEntendidos.length ? `<div class="card">
      <h2 style="margin:0 0 8px;font-size:16px">O que eu não soube fazer (${naoEntendidos.length})</h2>
      <p class="obs" style="margin:0 0 10px">Esta é a lista mais útil da tela: é o que você pediu e o sistema ainda não faz.</p>
      <table><tbody>${naoEntendidos.slice(0, 15).map(linha).join('')}</tbody></table>
    </div>` : ''}

    <div class="card">
      <h2 style="margin:0 0 8px;font-size:16px">Últimos pedidos</h2>
      <p class="obs" style="margin:0 0 10px">${Object.entries(resumo).map(([k, v]) =>
        `${esc(VOZ_ROTULO_STATUS[k] || k)}: ${v}`).join(' · ') || 'nenhum ainda'}</p>
      ${pedidos.length
        ? `<div style="overflow-x:auto"><table>
             <thead><tr><th>quando</th><th>o que foi dito</th><th>ação</th><th>estado</th><th></th></tr></thead>
             <tbody>${pedidos.map(linha).join('')}</tbody></table></div>`
        : '<p class="vazio">Nenhum pedido ainda. Toque no círculo ou mande um áudio no WhatsApp.</p>'}
    </div>`;
}
