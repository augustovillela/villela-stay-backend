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
let MU_VISAO = 'cifras';

const muCard = (rot, n, sub) => `<div class="card"><div class="n">${n == null ? '—' : n}</div><div class="rot">${esc(rot)}</div>${sub ? `<div class="obs">${esc(sub)}</div>` : ''}</div>`;
const muQuando = (d) => (d ? String(d).slice(0, 16).replace('T', ' ') : '—');
// O staff não tem `toast` global (só o painel jurídico define um): o aviso cai
// no alert, que é o que os outros painéis usam.
const muAvisar = (m) => (typeof window.toast === 'function' ? window.toast(m) : alert(m));

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
         ${['cifras', 'assinaturas', 'contas', 'fila', 'ia', 'acervo', 'auditoria'].map((v) => `<button class="btn secund mu-nav" data-v="${v}">${{
           cifras: '🎸 Cifras', assinaturas: '💳 Assinaturas', contas: '👤 Contas e cursos', fila: '⚙️ Fila e DLQ', ia: '🤖 Fornecedores de IA', acervo: '🎼 Acervo', auditoria: '📜 Auditoria',
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
    if (MU_VISAO === 'cifras') return muCifras(alvo);
    if (MU_VISAO === 'contas') return muContas(alvo);
    if (MU_VISAO === 'assinaturas') return muAssinaturas(alvo);
    if (MU_VISAO === 'fila') return muFila(alvo);
    if (MU_VISAO === 'ia') return muIA(alvo);
    if (MU_VISAO === 'acervo') return muAcervo(alvo);
    return muAuditoria(alvo);
  } catch (e) { alvo.innerHTML = muErro(e); }
}

// Assinatura (28/09/2026): R$ 250,00/mês no Mercado Pago, cortesia dos cursos
// de música da Academia pelo mesmo e-mail enquanto ativa. Preço editável aqui
// (vale para assinaturas NOVAS: o MP fixa o valor de cada preapproval).
async function muAssinaturas(alvo) {
  const d = await api('GET', '/music/assinaturas');
  const reais = (c) => 'R$ ' + (Number(c || 0) / 100).toFixed(2).replace('.', ',');
  const ST = { ativa: '✅ ativa', pendente: '⏳ aguardando pagamento', inadimplente: '⚠️ pagamento não confirmado', cancelada: 'cancelada', cortesia: '🎁 cortesia' };
  const linhas = (d.assinaturas || []).map((a) => `<tr>
      <td><b>${esc(a.nome || '')}</b><div class="obs">${esc(a.email || '')}${a.email_verificado ? '' : ' · e-mail NÃO confirmado'}</div></td>
      <td>${ST[a.status] || esc(a.status)}${a.origem === 'dono' ? ' <span class="chip">dono</span>' : ''}${a.motivo ? `<div class="obs">${esc(a.motivo)}</div>` : ''}</td>
      <td>${a.status === 'cortesia' ? '—' : reais(a.preco_cents)}</td>
      <td>${esc(muQuando(a.ultimo_pagamento_em))}</td>
      <td>${a.cursos != null && !a.revogada_em ? a.cursos + ' curso(s)' : '—'}</td>
      <td>${a.status === 'cortesia' && a.origem !== 'dono' ? `<button class="btn secund mu-enc" data-id="${esc(a.conta_id)}">Encerrar</button>` : ''}</td></tr>`).join('');
  alvo.innerHTML = `
    <div class="cards">
      ${muCard('Assinantes pagantes', d.ativas, 'status ativa')}
      ${muCard('Receita mensal', reais(d.receita_mensal_cents), 'soma das ativas')}
      ${muCard('Preço atual', reais(d.plano.preco_cents), 'tolerância de ' + d.plano.carencia_dias + ' dia(s)')}
      ${muCard('Cobrança', d.cobranca_ligada ? 'ligada' : 'desligada', d.cobranca_ligada ? 'Mercado Pago' : 'falta MP_ACCESS_TOKEN')}
    </div>
    <div class="aviso obs" style="padding:10px 14px;border-left:3px solid #C9A227;background:#FDF6E3;border-radius:8px;margin:10px 0">
      O app é grátis; a assinatura dá <b>cortesia dos cursos de música da Academia</b> pelo mesmo e-mail (confirmado no Musique),
      enquanto estiver ativa. Mudar o preço vale para assinaturas <b>novas</b>: o Mercado Pago fixa o valor de cada uma.
    </div>
    <h3>Preço e tolerância</h3>
    <div class="barra">
      <label>Preço mensal (R$) <input id="mu-preco" type="number" step="0.01" min="1" value="${(d.plano.preco_cents / 100).toFixed(2)}" style="max-width:120px"></label>
      <label>Tolerância (dias) <input id="mu-car" type="number" min="0" max="60" value="${d.plano.carencia_dias}" style="max-width:80px"></label>
      <button class="btn" id="mu-plano">Salvar</button>
    </div>
    <h3 style="margin-top:14px">Dar cortesia</h3>
    <div class="barra">
      <input id="mu-cort-email" type="email" placeholder="e-mail da conta no Musique" style="max-width:260px">
      <input id="mu-cort-motivo" type="text" placeholder="motivo (ex.: professor parceiro)" style="max-width:260px">
      <button class="btn secund" id="mu-cort">Dar cortesia</button>
      <button class="btn secund" id="mu-sync" title="Confere todas as assinaturas e a Academia agora">🔄 Sincronizar com a Academia</button>
    </div>
    <h3 style="margin-top:14px">Assinaturas</h3>
    ${linhas ? `<table class="tab"><thead><tr><th>Pessoa</th><th>Situação</th><th>Valor</th><th>Último pagamento</th><th>Cursos na Academia</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`
             : '<p class="vazio">Nenhuma assinatura ainda.</p>'}`;
  $('#mu-plano').onclick = async () => {
    try {
      await api('PUT', '/music/assinaturas/plano', { preco_cents: Math.round(Number($('#mu-preco').value) * 100), carencia_dias: Number($('#mu-car').value) });
      muAvisar('Plano salvo. Vale para assinaturas novas.'); muAssinaturas(alvo);
    } catch (e) { muAvisar(e.message); }
  };
  $('#mu-cort').onclick = async () => {
    try {
      const r = await api('POST', '/music/assinaturas/cortesia', { email: $('#mu-cort-email').value, motivo: $('#mu-cort-motivo').value });
      muAvisar('Cortesia dada. Academia: ' + (r.academia && r.academia.resultado)); muAssinaturas(alvo);
    } catch (e) { muAvisar(e.message); }
  };
  $('#mu-sync').onclick = async () => {
    try { const r = await api('POST', '/music/assinaturas/sincronizar', {}); muAvisar(r.sincronizadas + ' conta(s) ajustada(s) na Academia.'); muAssinaturas(alvo); }
    catch (e) { muAvisar(e.message); }
  };
  alvo.querySelectorAll('.mu-enc').forEach((b) => { b.onclick = async () => {
    if (!confirm('Encerrar esta cortesia? Os cursos de música saem da conta dela na Academia.')) return;
    try { await api('POST', '/music/assinaturas/cortesia/' + encodeURIComponent(b.dataset.id) + '/encerrar', {}); muAssinaturas(alvo); }
    catch (e) { muAvisar(e.message); }
  }; });
}

// Contas PRÓPRIAS do Musique (ADR-0011, 28/09/2026) e o único elo com a
// Academia: o curso recomendado em cada trilha. Os cursos listados são os
// publicados na Academia na categoria "Música".
async function muContas(alvo) {
  const [c, tc] = await Promise.all([api('GET', '/music/contas?n=200'), api('GET', '/music/trilhas-cursos')]);
  const lig = new Map((tc.ligacoes || []).map((l) => [l.trilha_id, l.curso_slug]));
  const opcoes = (sel) => ['<option value="">— nenhum —</option>'].concat((tc.cursos || []).map((k) =>
    `<option value="${esc(k.slug)}"${k.slug === sel ? ' selected' : ''}>${esc(k.titulo)}</option>`)).join('');
  const trilhas = (tc.trilhas || []).map((t) => `<tr>
      <td><b>${esc(t.titulo)}</b><div class="obs">${esc(t.instrumento)}</div></td>
      <td><select class="mu-tc" data-t="${esc(t.id)}">${opcoes(lig.get(t.id) || '')}</select></td></tr>`).join('');
  const contas = (c.contas || []).map((x) => `<tr>
      <td><b>${esc(x.nome)}</b><div class="obs">${esc(x.email)}</div></td>
      <td>${x.origem === 'dono' ? 'dono' : 'cadastro'}${x.vinculada ? ' · <span class="chip ok">professor (Academia)</span>' : ''}
        <div class="obs">${x.email_verificado ? 'e-mail confirmado' : 'e-mail NÃO confirmado'}${x.totp_ativo ? ' · 2 etapas ligada <button class="btn secund mu-2fa" data-id="' + esc(x.id) + '">desligar</button>' : ''}</div></td>
      <td>${esc(muQuando(x.criado_em))}</td><td>${esc(muQuando(x.ultimo_login))}</td>
      <td>${x.status === 'ativo' ? 'ativa' : '<span style="color:#B3261E">' + esc(x.status) + '</span>'}
        <button class="btn secund mu-st" data-id="${esc(x.id)}" data-s="${x.status === 'ativo' ? 'suspenso' : 'ativo'}">${x.status === 'ativo' ? 'Suspender' : 'Reativar'}</button></td></tr>`).join('');
  alvo.innerHTML = `
    <div class="aviso obs" style="padding:10px 14px;border-left:3px solid #1B2A4A;background:#F1F5F9;border-radius:8px;margin:0 0 10px">
      Desde 28/09/2026 o Musique tem <b>conta própria</b>, independente da Academia. Só a conta do dono nasceu
      com a mesma senha. O elo com a Academia são os <b>cursos</b>: os publicados na categoria <i>Música</i>
      aparecem no app, e cada trilha pode recomendar um curso.
    </div>
    <h3>Trilha → curso da Academia</h3>
    ${(tc.cursos || []).length ? '' : '<p class="obs">Nenhum curso publicado na categoria Música da Academia ainda — quando houver, ele aparece na lista.</p>'}
    <table class="tab"><thead><tr><th>Trilha</th><th>Curso recomendado</th></tr></thead><tbody>${trilhas}</tbody></table>
    <h3 style="margin-top:18px">Contas (${c.total || 0})</h3>
    ${contas ? `<table class="tab"><thead><tr><th>Pessoa</th><th>Origem</th><th>Criada</th><th>Último acesso</th><th>Situação</th></tr></thead><tbody>${contas}</tbody></table>`
             : '<p class="vazio">Nenhuma conta ainda.</p>'}`;
  alvo.querySelectorAll('.mu-tc').forEach((s) => { s.onchange = async () => {
    try { await api('PUT', '/music/trilhas-cursos/' + encodeURIComponent(s.dataset.t), { curso_slug: s.value }); muAvisar('Trilha atualizada.'); }
    catch (e) { muAvisar(e.message, true); muContas(alvo); }
  }; });
  alvo.querySelectorAll('.mu-2fa').forEach((b) => { b.onclick = async () => {
    if (!confirm('Desligar as duas etapas desta conta? Faça isso só depois de confirmar, por outro canal, que é a própria pessoa que perdeu o celular e os códigos.')) return;
    try { await api('POST', '/music/contas/' + encodeURIComponent(b.dataset.id) + '/2fa-desligar', {}); muContas(alvo); }
    catch (e) { muAvisar(e.message); }
  }; });
  alvo.querySelectorAll('.mu-st').forEach((b) => { b.onclick = async () => {
    if (!confirm(b.dataset.s === 'suspenso' ? 'Suspender esta conta? A pessoa sai na hora.' : 'Reativar esta conta?')) return;
    try { await api('POST', '/music/contas/' + encodeURIComponent(b.dataset.id) + '/status', { status: b.dataset.s }); muContas(alvo); }
    catch (e) { muAvisar(e.message, true); }
  }; });
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
    try { const r2 = await api('POST', '/music/fila/destravar', { minutos: 15 }); muAvisar(`${r2.destravados} job(s) devolvido(s).`); muCarregar(); }
    catch (e) { muAvisar(e.message, true); }
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
        ? 'Circula só na BANDA fechada; link aberto e público dependem da política (aba Cifras); IA liberada (ADR-0009).'
        : 'Pode ser publicada pelo dono.'}</td>
    </tr>`).join('');
  alvo.innerHTML = `
    <div class="aviso obs" style="padding:10px 14px;border-left:3px solid #C9A227;background:#FDF6E3;border-radius:8px;margin:0 0 10px">
      Obra de terceiro <b>não é pública por padrão</b>. Desde 28/09/2026 (ADR-0009, ordem do Augusto)
      ela circula dentro de banda fechada, pode ir à IA, e o acervo completo existe — mas link aberto e
      público de obra de terceiro são POLÍTICAS desligadas na aba Cifras. Ligar exige motivo, fica na
      auditoria, e o recomendado é parecer jurídico antes (reprodução de cifra/letra de terceiro exige
      autorização; a licença do ECAD é de execução pública).
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

// ---------------------------------------------------------------------------
// 🎸 CIFRAS (28/09/2026): políticas e flags, cota de IA, importações e falhas,
// fontes externas e disjuntores, moderação e sessões ao vivo.
// ---------------------------------------------------------------------------
async function muCifras(alvo) {
  const [r, fl, mod, ses] = await Promise.all([api('GET', '/music/cifras/resumo'), api('GET', '/music/cifras/flags'),
    api('GET', '/music/cifras/moderacao'), api('GET', '/music/cifras/sessoes')]);
  const imp = r.importacoes || {};
  const reais = (c) => 'R$ ' + ((c || 0) / 100).toFixed(2).replace('.', ',');
  const cards = [
    muCard('Músicas', r.musicas, `${r.cifras} cifra(s) · ${r.revisoes} revisão(ões)`),
    muCard('Arranjos', r.arranjos, `${r.bandas} banda(s) · ${r.setlists} setlist(s)`),
    muCard('Ativos 7 dias', r.usuarios_ativos_7d, `${r.links_ativos} link(s) ativo(s)`),
    muCard('Ao vivo agora', (r.vivo || {}).ativas, `${(r.vivo || {}).conexoes || 0} aparelho(s) conectado(s)`),
    muCard('Busca', r.busca_fts ? 'FTS5' : 'varredura', r.busca_fts ? 'trigramas (tolera erro de digitação)' : 'sem FTS5 neste SQLite'),
  ].join('');
  const flags = (fl.flags || []).map((f) => `<tr>
      <td><b>${esc(f.chave)}</b>${f.politica ? ' <span class="chip">POLÍTICA</span>' : ''}<div class="obs">${esc(f.descricao)}</div></td>
      <td>${f.ligado ? '<b style="color:#0B6B3A">ligado</b>' : '<span class="obs">desligado</span>'}</td>
      <td class="obs">${esc(f.atualizado_por || '')}<br>${esc(muQuando(f.atualizado_em))}</td>
      <td><button class="btn secund mu-flag" data-k="${esc(f.chave)}" data-v="${f.ligado ? 0 : 1}" data-p="${f.politica ? 1 : 0}">${f.ligado ? 'Desligar' : 'Ligar'}</button></td>
    </tr>`).join('');
  const porTipo = (imp.por_tipo || []).map((x) => `${esc(x.tipo_entrada)}: ${x.n}${x.falhas ? ` (<span style="color:#B3261E">${x.falhas} falha(s)</span>)` : ''}`).join(' · ');
  const falhas = (imp.falhas || []).slice(0, 20).map((x) => `<tr><td>${esc(muQuando(x.atualizado_em))}</td><td>${esc(x.tipo_entrada)}</td>
      <td class="obs">${esc(x.entrada_resumo)}</td><td style="color:#B3261E">${esc(x.erro)}</td>
      <td>${x.tipo_entrada === 'url' ? `<button class="btn secund mu-reproc" data-id="${esc(x.id)}">Reprocessar</button>` : ''}</td></tr>`).join('');
  const fontes = (imp.por_fonte || []).map((x) => `${esc(x.adaptador || x.tipo)}: ${x.n} (confiança média ${Math.round((x.conf || 0) * 100)}%)`).join(' · ');
  const disj = ((imp.rede || {}).disjuntores || []).map((x) => `${esc(x.host)}: ${x.aberto ? '<b style="color:#B3261E">em pausa</b>' : 'ok'} (${x.falhas} falha(s))`).join(' · ');
  const den = (mod.denuncias || []).map((x) => `<tr><td>${esc(muQuando(x.criado_em))}</td><td>${esc(x.alvo_tipo)} <span class="obs">${esc(x.alvo_id)}</span></td>
      <td>${esc(x.motivo)}${x.trecho ? `<div class="obs">"${esc(x.trecho)}"</div>` : ''}</td>
      <td><button class="btn secund mu-den" data-id="${esc(x.id)}" data-p="1">Procedente</button> <button class="btn secund mu-den" data-id="${esc(x.id)}" data-p="0">Improcedente</button></td></tr>`).join('');
  const custo = ((r.ia || {}).custo_30d || []).map((x) => `<tr><td>${esc(x.capability)}</td><td>${esc(x.provider)}</td><td>${x.chamadas}</td><td>${x.falhas}</td><td><b>${reais(x.centavos)}</b></td></tr>`).join('');
  const sess = (ses.ativas || []).map((x) => `<tr><td><b>${esc(x.codigo)}</b></td><td class="obs">${esc(x.repertorio_id)}</td><td>${esc(muQuando(x.iniciada_em))}</td><td>${x.seq} comando(s)</td></tr>`).join('');
  alvo.innerHTML = `
    <div class="cards">${cards}</div>
    <h3>Flags e políticas</h3>
    <div class="aviso obs" style="padding:10px 14px;border-left:3px solid #C9A227;background:#FDF6E3;border-radius:8px;margin:0 0 10px">
      As duas <b>POLÍTICAS</b> são a decisão do Augusto sobre obra de terceiro (ADR-0009): nascem desligadas, e ligar
      exige motivo (fica na auditoria). Recomendado: parecer do jurídico antes de ligar <code>terceiro_publico</code>.
    </div>
    <table class="tab"><thead><tr><th>Chave</th><th>Estado</th><th>Última mudança</th><th></th></tr></thead><tbody>${flags}</tbody></table>
    <div class="barra"><span class="obs">Cota de IA por pessoa/dia: <b>${(r.ia || {}).cota_dia}</b></span>
      <button class="btn secund" id="mu-cota">Mudar cota</button></div>
    <h3 style="margin-top:18px">Importações</h3>
    <p class="obs">${porTipo || 'Nenhuma ainda.'} · rodando agora: ${imp.rodando || 0}</p>
    <p class="obs">Fontes: ${fontes || '—'}</p>
    <p class="obs">Disjuntores: ${disj || 'nenhuma fonte com falha'}</p>
    ${falhas ? `<table class="tab"><thead><tr><th>Quando</th><th>Tipo</th><th>Entrada</th><th>Erro</th><th></th></tr></thead><tbody>${falhas}</tbody></table>` : '<p class="vazio">Nenhuma importação falhou.</p>'}
    <h3 style="margin-top:18px">Moderação</h3>
    ${den ? `<table class="tab"><thead><tr><th>Quando</th><th>Alvo</th><th>Motivo</th><th>Decisão</th></tr></thead><tbody>${den}</tbody></table>` : '<p class="vazio">Nenhuma denúncia aberta.</p>'}
    ${(mod.propostas_antigas || []).length ? `<p class="obs">${mod.propostas_antigas.length} proposta(s) de correção esperando há mais de 14 dias.</p>` : ''}
    <h3 style="margin-top:18px">Sessões ao vivo ativas</h3>
    ${sess ? `<table class="tab"><thead><tr><th>Código</th><th>Setlist</th><th>Início</th><th>Comandos</th></tr></thead><tbody>${sess}</tbody></table>` : '<p class="vazio">Nenhuma agora.</p>'}
    <h3 style="margin-top:18px">IA das cifras — últimos 30 dias</h3>
    ${custo ? `<table class="tab"><thead><tr><th>Capability</th><th>Fornecedor</th><th>Chamadas</th><th>Falhas</th><th>Custo</th></tr></thead><tbody>${custo}</tbody></table>`
             : '<p class="vazio">Nenhuma chamada. As capabilities <code>cifra.*</code> nascem desligadas (ligar é na aba Fornecedores de IA).</p>'}`;
  alvo.querySelectorAll('.mu-flag').forEach((b) => { b.onclick = async () => {
    let motivo = '';
    if (b.dataset.p === '1') { motivo = prompt('Motivo (obrigatório para política; fica na auditoria):') || ''; if (!motivo.trim()) return; }
    try { await api('PUT', '/music/cifras/flags/' + encodeURIComponent(b.dataset.k), { ligado: b.dataset.v === '1', motivo }); muAvisar('Flag atualizada.'); muCorpo(); }
    catch (e) { muAvisar(e.message, true); }
  }; });
  const bc = $('#mu-cota');
  if (bc) bc.onclick = async () => {
    const v = prompt('Chamadas de IA por pessoa por dia (0 desliga):', String((r.ia || {}).cota_dia || 40));
    if (v === null) return;
    try { await api('PUT', '/music/cifras/cota-ia', { cota: Number(v) }); muAvisar('Cota atualizada.'); muCorpo(); } catch (e) { muAvisar(e.message, true); }
  };
  alvo.querySelectorAll('.mu-reproc').forEach((b) => { b.onclick = async () => {
    try { await api('POST', '/music/cifras/importacoes/' + b.dataset.id + '/reprocessar', {}); muAvisar('Reprocessando.'); setTimeout(muCorpo, 1500); } catch (e) { muAvisar(e.message, true); }
  }; });
  alvo.querySelectorAll('.mu-den').forEach((b) => { b.onclick = async () => {
    const motivo = prompt('Motivo da decisão (fica na auditoria):') || '';
    try { await api('POST', '/music/cifras/denuncias/' + b.dataset.id, { procedente: b.dataset.p === '1', motivo }); muAvisar('Denúncia resolvida.'); muCorpo(); } catch (e) { muAvisar(e.message, true); }
  }; });
}
