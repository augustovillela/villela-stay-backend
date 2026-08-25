'use strict';
// ============================================================================
// Portal Staff — módulo: app-music (Musique, por Villela Music).
// Administração do 15º produto: painel, fila e DLQ, registry de IA, acervo por
// titularidade e auditoria de direitos.
//
// A aba existe já na Fase 0 por um motivo prático: fila e IA precisam ser
// OBSERVÁVEIS desde o primeiro job. DLQ que ninguém vê é falha silenciosa com
// outro nome — e falha silenciosa é o pior desfecho possível.
//
// Duas coisas aqui são política virando tela, não enfeite:
//   · o acervo aparece separado POR TITULARIDADE, para dar para ver num relance
//     quanto do acervo é obra de terceiro (decisão Q2 — biblioteca privada);
//   · a lista de IA mostra as capabilities SEM provedor, inclusive `musica.gerar`,
//     que é o vazio que a decisão Q6 criou de propósito. Esconder o vazio faria
//     parecer esquecimento.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const MU_SITE = '/music';
let MU_VISAO = 'fila';

const muCard = (rot, n, sub) => `<div class="card"><div class="n">${n == null ? '—' : n}</div><div class="rot">${esc(rot)}</div>${sub ? `<div class="obs">${esc(sub)}</div>` : ''}</div>`;
const muQuando = (d) => (d ? String(d).slice(0, 16).replace('T', ' ') : '—');

const MU_TITULARIDADE = {
  propria: 'Própria do usuário',
  dominio_publico: 'Domínio público',
  licenciada: 'Licenciada',
  terceiro_privado: 'De terceiro (acervo privado)',
};

async function renderMusic() {
  conteudo().innerHTML = cabecalho('🎵 Musique · por Villela Music',
    'Academia musical, biblioteca do músico e sala de prática. Aqui: saúde da fila, fornecedores de IA com o custo por usuário, acervo por titularidade e auditoria de direitos.')
    + `<div class="barra">
        <a class="btn secund" href="${MU_SITE}" target="_blank" rel="noopener">🌐 Landing</a>
        <a class="btn secund" href="${MU_SITE}/app" target="_blank" rel="noopener">🎼 App do músico</a>
       </div>
       <div id="mu-cards" class="cards"></div>
       <div class="barra" style="margin-top:12px">
         ${['fila', 'ia', 'acervo', 'auditoria'].map((v) => `<button class="btn secund mu-nav" data-v="${v}">${{
           fila: '⚙️ Fila e DLQ', ia: '🤖 Fornecedores de IA', acervo: '🎼 Acervo', auditoria: '📜 Auditoria',
         }[v]}</button>`).join('')}
       </div>
       <div id="mu-corpo"><p class="vazio">Carregando…</p></div>`;
  document.querySelectorAll('.mu-nav').forEach((b) => { b.onclick = () => { MU_VISAO = b.dataset.v; muCorpo(); }; });
  muCarregar();
}

function muErro(e) {
  return `<div class="aviso" style="padding:14px 16px;border:1px solid #E2E6EC;border-left:3px solid #B3261E;border-radius:10px;background:#FCEEED">
      <b>Não deu para carregar</b><p style="margin:6px 0 0">${esc((e && e.message) || 'erro desconhecido')}</p>
    </div>`;
}

async function muCarregar() {
  try {
    const d = await api('GET', '/music/painel');
    window._mu = d;
    const n = d.numeros || {}, f = d.fila || {}, arm = d.armazenamento || {};
    // Cartão de armazenamento diz o que FALTA, não só "off": falta de env é a
    // causa mais provável de o envio não funcionar, e a mais fácil de
    // diagnosticar errado.
    $('#mu-cards').innerHTML = [
      muCard('Músicos', n.usuarios, `${n.obras ?? '—'} obra(s) no acervo`),
      muCard('Partituras', n.partituras, `${n.arranjos ?? '—'} arranjo(s)`),
      muCard('Na fila', f.pendente, f.dlq ? `⚠️ ${f.dlq} na DLQ` : 'DLQ vazia'),
      muCard('IA disponível', (d.ia && d.ia.capacidades_disponiveis || []).length,
        `de ${(d.ia && d.ia.capacidades_conhecidas || []).length} capabilities`),
      muCard('Armazenamento', arm.pronto ? 'R2' : '—',
        arm.pronto ? 'upload direto ativo' : `falta: ${(arm.faltando || []).join(', ')}`),
    ].join('');
    muCorpo();
  } catch (e) { $('#mu-cards').innerHTML = ''; $('#mu-corpo').innerHTML = muErro(e); }
}

async function muCorpo() {
  const alvo = $('#mu-corpo');
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    if (MU_VISAO === 'fila') return muFila(alvo);
    if (MU_VISAO === 'ia') return muIA(alvo);
    if (MU_VISAO === 'acervo') return muAcervo(alvo);
    return muAuditoria(alvo);
  } catch (e) { alvo.innerHTML = muErro(e); }
}

async function muFila(alvo) {
  const d = await api('GET', '/music/fila?n=50');
  const r = d.resumo || {};
  const linhas = (d.dlq || []).map((j) => `<tr>
      <td><b>${esc(j.tipo)}</b><div class="obs">${esc(j.id)}</div></td>
      <td>${esc(j.fila)}</td>
      <td>${j.tentativas}/${j.max_tentativas}</td>
      <td>${esc(muQuando(j.concluido_em))}</td>
      <td style="color:#B3261E">${esc(j.ultimo_erro || '—')}</td>
    </tr>`).join('');
  alvo.innerHTML = `
    <p class="obs">Pendentes ${r.pendente || 0} · processando ${r.processando || 0} ·
       concluídos ${r.concluido || 0} · <b>DLQ ${r.dlq || 0}</b>.
       Handlers registrados: ${esc((d.handlers || []).join(', ') || 'nenhum')}.</p>
    <div class="aviso obs" style="padding:10px 14px;border-left:3px solid #C9A227;background:#FDF6E3;border-radius:8px;margin:10px 0">
      A fila é consumida pelo próprio backend e só na classe <code>rapida</code>.
      A classe <code>cara</code> (áudio pesado) está travada até existir um consumidor
      dedicado — no Render, o disco de um serviço não é acessível por outro, e o banco da
      Musique é SQLite no disco (ADR-0006).
    </div>
    <div class="barra"><button class="btn secund" id="mu-destravar">🔓 Devolver jobs travados à fila</button></div>
    ${linhas
      ? `<table class="tab"><thead><tr><th>Job</th><th>Classe</th><th>Tentativas</th><th>Morreu em</th><th>Motivo</th></tr></thead><tbody>${linhas}</tbody></table>`
      : '<p class="vazio">DLQ vazia — nenhum job morreu.</p>'}`;
  const b = $('#mu-destravar');
  if (b) b.onclick = async () => {
    try { const r2 = await api('POST', '/music/fila/destravar', { minutos: 15 }); toast(`${r2.destravados} job(s) devolvido(s).`); muCarregar(); }
    catch (e) { toast(e.message, true); }
  };
}

async function muIA(alvo) {
  const d = await api('GET', '/music/ia');
  const disp = new Set(d.disponiveis || []);
  const linhas = (d.registry || []).map((l) => `<tr>
      <td><b>${esc(l.capability)}</b>${disp.has(l.capability) ? ' <span class="chip ok">na tela</span>' : ' <span class="chip">oculta</span>'}</td>
      <td>${esc(l.provider)}${l.model ? `<div class="obs">${esc(l.model)}</div>` : ''}</td>
      <td>${l.ativo ? 'ligado' : '<span class="obs">desligado</span>'}</td>
      <td>${l.creditos} cr · ${(l.custo_estimado_centavos / 100).toFixed(2).replace('.', ',')}</td>
      <td class="obs">${esc(l.observacao || '')}</td>
    </tr>`).join('');
  const custo = (d.custo_por_usuario || []).slice(0, 10).map((c) => `<tr>
      <td>${esc(c.usuario)}</td><td>${c.chamadas}</td><td>${c.creditos}</td>
      <td><b>R$ ${(c.centavos / 100).toFixed(2).replace('.', ',')}</b></td></tr>`).join('');
  alvo.innerHTML = `
    <div class="aviso obs" style="padding:10px 14px;border-left:3px solid #1B2A4A;background:#F1F5F9;border-radius:8px;margin:0 0 10px">
      Capability sem provedor ligado <b>não aparece na tela do usuário</b> — o produto nunca oferece
      botão que não funciona. <code>musica.gerar</code> está aqui de propósito e sem fornecedor:
      não existe API pública de geração de música, e a decisão foi não anunciar.
    </div>
    <table class="tab"><thead><tr><th>Capability</th><th>Fornecedor</th><th>Estado</th><th>Custo</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table>
    <h3 style="margin-top:18px">Custo de IA por usuário</h3>
    <p class="obs">É este número que impede vender com margem negativa por meses sem ninguém perceber.</p>
    ${custo ? `<table class="tab"><thead><tr><th>Usuário</th><th>Chamadas</th><th>Créditos</th><th>Custo</th></tr></thead><tbody>${custo}</tbody></table>`
             : '<p class="vazio">Nenhum uso de IA registrado ainda.</p>'}`;
}

async function muAcervo(alvo) {
  const d = window._mu || await api('GET', '/music/painel');
  const linhas = (d.acervo_por_titularidade || []).map((l) => `<tr>
      <td><b>${esc(MU_TITULARIDADE[l.titularidade] || l.titularidade)}</b></td>
      <td>${l.n}</td>
      <td class="obs">${l.titularidade === 'terceiro_privado'
        ? 'Nunca publicada, nunca sugerida a outro usuário, nunca enviada a IA.'
        : 'Pode ser publicada pelo dono.'}</td>
    </tr>`).join('');
  alvo.innerHTML = `
    <div class="aviso obs" style="padding:10px 14px;border-left:3px solid #C9A227;background:#FDF6E3;border-radius:8px;margin:0 0 10px">
      A Musique <b>não tem acervo público de obra de terceiro</b>, e isso é decisão, não pendência:
      reproduzir cifra, letra ou partitura de terceiro exige autorização, e a licença do ECAD é de
      execução pública, não de reprodução. Catálogo público só existiria com licenciamento junto às
      editoras — projeto à parte.
    </div>
    ${linhas ? `<table class="tab"><thead><tr><th>Titularidade</th><th>Obras</th><th>O que isso permite</th></tr></thead><tbody>${linhas}</tbody></table>`
             : '<p class="vazio">Nenhuma obra no acervo ainda.</p>'}`;
}

async function muAuditoria(alvo) {
  const d = await api('GET', '/music/auditoria?n=100');
  const linhas = (d.eventos || []).map((e) => `<tr>
      <td>${esc(muQuando(e.criado_em))}</td>
      <td><b>${esc(e.acao)}</b></td>
      <td>${esc(e.ator || '—')}</td>
      <td class="obs">${esc(e.alvo || '')}${e.motivo ? ` · ${esc(e.motivo)}` : ''}</td>
    </tr>`).join('');
  alvo.innerHTML = linhas
    ? `<table class="tab"><thead><tr><th>Quando</th><th>Ação</th><th>Quem</th><th>Alvo</th></tr></thead><tbody>${linhas}</tbody></table>`
    : '<p class="vazio">Nenhum evento ainda.</p>';
}
