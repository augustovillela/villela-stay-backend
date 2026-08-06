'use strict';
// ============================================================================
// Villela Alta Vista 360 — SPA do painel do CLIENTE (/alta-vista/app).
// Servida por /alta-vista/app.js?v=<mtime>. Sem framework, sem CDN.
// Abas: Projetos (status, agenda, briefing, mensagens) · Imóveis · Conta.
// ============================================================================
/* global bootAltaVista */

const AV_BASE = '/alta-vista';
let AV_ME = null;
let AV_ABA = 'projetos';
let AV_ROTULOS = {};

const $av = (sel) => document.querySelector(sel);
const escAv = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brlAv = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const diaAv = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

async function apiAv(metodo, caminho, corpo) {
  const r = await fetch(AV_BASE + '/api/app' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 401) { location.href = AV_BASE + '/entrar'; throw new Error('sessão expirada'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Erro ' + r.status);
  return d;
}

// eslint-disable-next-line no-unused-vars
async function bootAltaVista() {
  try {
    const d = await apiAv('GET', '/me');
    AV_ME = d.cliente;
    AV_ROTULOS = d.status_rotulos || {};
  } catch (_) { return; }
  $av('#u-nome').textContent = AV_ME.nome.split(' ')[0];
  $av('#sair').onclick = async () => {
    await fetch(AV_BASE + '/api/conta/sair', { method: 'POST' }).catch(() => {});
    location.href = AV_BASE;
  };
  const abas = [['projetos', 'Projetos'], ['tours', 'Tours 360°'], ['imoveis', 'Imóveis'], ['conta', 'Minha conta']];
  $av('#abas').innerHTML = abas.map(([id, rot]) => `<button class="aba" data-aba="${id}">${rot}</button>`).join('');
  document.querySelectorAll('.aba').forEach((b) => { b.onclick = () => { AV_ABA = b.dataset.aba; avTela(); }; });
  avTela();
}

function avAtivarAba() {
  document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('on', b.dataset.aba === AV_ABA));
}

async function avTela() {
  avAtivarAba();
  const t = $av('#tela');
  t.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    if (AV_ABA === 'projetos') return avProjetos(t);
    if (AV_ABA === 'tours') return avToursCliente(t);
    if (AV_ABA === 'imoveis') return avImoveis(t);
    if (AV_ABA === 'conta') return avConta(t);
  } catch (e) { t.innerHTML = `<p class="erro">${escAv(e.message)}</p>`; }
}

// ---------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------
const STATUS_CLASSE = { delivered: 'ouro', completed: 'ouro', approved: 'ouro' };

async function avProjetos(t) {
  const d = await apiAv('GET', '/projetos');
  if (!d.projetos.length) {
    t.innerHTML = `<div class="painel" style="text-align:center">
      <h3>Você ainda não tem projetos</h3>
      <p style="color:var(--texto2)">Quando uma proposta sua for aceita, o projeto aparece aqui com status, agenda e mensagens.</p>
      <a class="btn" href="${AV_BASE}/recomendar-pacote">Descobrir o pacote ideal</a></div>`;
    return;
  }
  t.innerHTML = d.projetos.map((p) => `
    <div class="painel">
      <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center">
        <div><h3 style="margin-bottom:4px">${escAv(p.titulo)}</h3>
          <span class="pill ${STATUS_CLASSE[p.status] || ''}">${escAv(AV_ROTULOS[p.status] || p.status)}</span>
          ${p.prazo_em ? `<span style="font-size:.82rem;color:var(--texto2);margin-left:10px">entrega-alvo ${diaAv(p.prazo_em)}</span>` : ''}
          ${p.agenda_em ? `<span style="font-size:.82rem;color:var(--texto2);margin-left:10px">📅 captação ${escAv(p.agenda_em).replace('T', ' ')}</span>` : ''}
        </div>
        <button class="btn peq av-abrir" data-id="${escAv(p.id)}">Abrir projeto</button>
      </div>
      ${p.status === 'briefing_pending' && !p.briefing ? `<p class="erro" style="margin:10px 0 0;font-size:.88rem">⚠ Falta o seu briefing — abra o projeto e preencha para a produção começar.</p>` : ''}
    </div>`).join('');
  document.querySelectorAll('.av-abrir').forEach((b) => { b.onclick = () => avProjetoDetalhe(b.dataset.id); });
}

async function avProjetoDetalhe(id) {
  const t = $av('#tela');
  t.innerHTML = '<p class="vazio">Carregando…</p>';
  const d = await apiAv('GET', '/projetos/' + id);
  const im = await apiAv('GET', '/imoveis');
  const p = d.projeto;
  const b = p.briefing || {};
  const briefingEditavel = ['awaiting_payment', 'briefing_pending', 'scheduling'].includes(p.status);
  t.innerHTML = `
  <div class="painel">
    <button class="btn peq" id="voltar" style="background:transparent;border:1px solid var(--linha);color:var(--grafite)">← Meus projetos</button>
    <h2 style="margin:12px 0 6px">${escAv(p.titulo)}</h2>
    <p><span class="pill ${STATUS_CLASSE[p.status] || ''}">${escAv(AV_ROTULOS[p.status] || p.status)}</span>
      ${p.total_centavos ? `<span style="margin-left:10px;font-weight:700">${brlAv(p.total_centavos)}</span>` : ''}</p>
    <p style="color:var(--texto2);font-size:.9rem">
      ${p.responsavel ? `Responsável: <b>${escAv(p.responsavel)}</b> · ` : ''}
      ${p.agenda_em ? `Captação: <b>${escAv(p.agenda_em).replace('T', ' ')}</b> · ` : ''}
      ${p.prazo_em ? `Entrega-alvo: <b>${diaAv(p.prazo_em)}</b>` : 'Prazos são confirmados após pagamento e briefing.'}</p>
    ${p.itens.length ? `<p style="font-size:.88rem;color:var(--texto2)">Contratado: ${p.itens.map((i) => escAv(i.nome)).join(' + ')}</p>` : ''}

    <h4 style="margin-top:18px">Andamento</h4>
    <ul class="timeline">${d.eventos.map((e) => `<li><b>${escAv(AV_ROTULOS[e.para] || e.para)}</b> · ${diaAv(e.criado_em)}${e.justificativa ? ' — ' + escAv(e.justificativa) : ''}</li>`).join('')}</ul>
  </div>

  ${d.parcelas && d.parcelas.length ? `<div class="painel">
    <h4>Pagamento ${d.saldo_centavos ? `<span class="pill">saldo em aberto ${brlAv(d.saldo_centavos)}</span>` : '<span class="pill ouro">quitado ✓</span>'}</h4>
    ${d.parcelas.map((pa) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--linha)">
      <div><b>${escAv(pa.rotulo)}</b><br><span style="font-size:.85rem;color:var(--texto2)">${brlAv(pa.valor_centavos)} · ${escAv({ pendente: 'aguardando pagamento', aguardando: 'checkout aberto', aprovado: 'pago' + (pa.pago_em ? ' em ' + diaAv(pa.pago_em) : ''), rejeitado: 'pagamento recusado — tente de novo', cancelado: 'cancelada', reembolsado: 'reembolsada', contestado: 'em contestação' }[pa.status] || pa.status)}</span></div>
      ${['pendente', 'aguardando', 'rejeitado'].includes(pa.status)
        ? (d.pagamento_online ? `<button class="btn peq av-pagar" data-id="${escAv(pa.id)}">Pagar agora</button>`
          : '<span style="font-size:.8rem;color:var(--texto2)">pagamento combinado com a equipe</span>')
        : (pa.status === 'aprovado' ? '<span class="pill ouro">✓</span>' : '')}
    </div>`).join('')}
    <p style="font-size:.78rem;color:var(--texto2);margin:10px 0 0">Pagamento processado pelo Mercado Pago (Pix e cartão). A confirmação chega sozinha — não precisa enviar comprovante.</p>
  </div>` : ''}

  ${d.entregas.length ? `<div class="painel">
    <h4>Entregas para você revisar</h4>
    ${d.entregas.map((en) => {
      const ult = en.versoes[en.versoes.length - 1];
      return `<div style="padding:12px 0;border-bottom:1px solid var(--linha)">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
          <div><b>${escAv(en.titulo)}</b> ${en.status === 'aprovada' ? '<span class="pill ouro">aprovada ✓</span>' : '<span class="pill">em revisão</span>'}
            ${ult ? `<br><span style="font-size:.8rem;color:var(--texto2)">versão ${ult.numero}${ult.nota ? ' — ' + escAv(ult.nota) : ''}</span>` : '<br><span style="font-size:.8rem;color:var(--texto2)">aguardando a primeira versão</span>'}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${ult ? `<button class="btn peq av-ver" data-id="${escAv(ult.id)}" data-tipo="${escAv(en.tipo)}">▶ Ver</button>` : ''}
            ${ult && en.status !== 'aprovada' ? `<button class="btn peq av-aprovar" data-id="${escAv(en.id)}" style="background:#166534;border-color:#166534;color:#fff">Aprovar</button>` : ''}
            ${ult && en.status === 'aprovada' ? `<button class="btn peq av-baixar" data-id="${escAv(ult.id)}">⬇ Baixar final</button>` : ''}
          </div></div>
        ${ult && ult.comentarios.length ? ult.comentarios.map((c) => `<p style="margin:6px 0 0;font-size:.82rem;color:var(--texto2)">💬 <b>${c.autor === 'cliente' ? 'Você' : escAv(c.autor_nome || 'Equipe')}</b>${c.ancora && c.ancora.t != null ? ` <span class="pill" style="font-size:.65rem">${Math.floor(c.ancora.t / 60)}:${String(Math.round(c.ancora.t % 60)).padStart(2, '0')}</span>` : ''} ${escAv(c.texto)}</p>`).join('') : ''}
      </div>`;
    }).join('')}
    ${d.saldo_centavos ? `<p style="font-size:.8rem;color:var(--texto2);margin:10px 0 0">As prévias levam tarja de PRÉVIA e o download final abre após a quitação (${brlAv(d.saldo_centavos)} em aberto).</p>` : ''}
    <div id="av-visor"></div>
  </div>` : ''}

  <div class="painel">
    <h4>Seus arquivos para a produção</h4>
    <p style="font-size:.85rem;color:var(--texto2)">Fotos para o vídeo com IA, panoramas próprios e referências. JPG, PNG, WEBP, MP4 ou MOV.</p>
    ${d.materiais.length ? d.materiais.map((m) => `<p style="margin:4px 0;font-size:.88rem">📎 ${escAv(m.nome)} <span style="color:var(--texto2)">(${(m.tamanho_bytes / 1048576).toFixed(1)} MB)</span>
      <button class="btn peq av-mat-ver" data-id="${escAv(m.id)}" style="padding:4px 10px">ver</button>
      <button class="btn peq av-mat-rm" data-id="${escAv(m.id)}" style="padding:4px 10px;background:transparent;border:1px solid var(--linha);color:var(--grafite)">remover</button></p>`).join('') : ''}
    <div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap">
      <input type="file" id="mat-file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime">
      <button class="btn peq" id="mat-enviar">⬆ Enviar</button>
      <span id="mat-prog" style="font-size:.85rem;color:var(--texto2)"></span>
    </div>
  </div>

  <div class="painel">
    <h4>Imóvel do projeto</h4>
    ${d.imovel ? `<p><b>${escAv(d.imovel.nome)}</b> · ${escAv(d.imovel.tipo || '')} ${d.imovel.cidade ? '· ' + escAv(d.imovel.cidade) : ''}</p>` : '<p style="color:var(--texto2)">Nenhum imóvel vinculado ainda.</p>'}
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <select id="pj-imovel" style="max-width:280px"><option value="">— escolher imóvel —</option>
        ${im.imoveis.map((x) => `<option value="${escAv(x.id)}"${d.imovel && d.imovel.id === x.id ? ' selected' : ''}>${escAv(x.nome)}</option>`).join('')}</select>
      <button class="btn peq" id="pj-vincular">Vincular</button>
    </div>
    <p style="font-size:.8rem;color:var(--texto2);margin-top:8px">Cadastre imóveis na aba “Imóveis”. Endereço e instruções de acesso ficam privados — só a equipe do seu projeto vê.</p>
  </div>

  <div class="painel">
    <h4>Briefing ${p.briefing_em ? `<span class="pill ouro">preenchido em ${diaAv(p.briefing_em)}</span>` : '<span class="pill">pendente</span>'}</h4>
    ${briefingEditavel ? '' : '<p style="font-size:.85rem;color:var(--texto2)">A produção já começou — para ajustes, use as mensagens abaixo.</p>'}
    <label>O que você quer comunicar com esse material?</label><textarea id="bf-objetivo" rows="2" ${briefingEditavel ? '' : 'disabled'}>${escAv(b.objetivo || '')}</textarea>
    <label>Pontos fortes do imóvel que não podem faltar</label><textarea id="bf-destaques" rows="2" ${briefingEditavel ? '' : 'disabled'}>${escAv(b.destaques || '')}</textarea>
    <label>Restrições (áreas que não devem aparecer, vizinhos, horários…)</label><textarea id="bf-restricoes" rows="2" ${briefingEditavel ? '' : 'disabled'}>${escAv(b.restricoes || '')}</textarea>
    <label>Referências (links de vídeos/anúncios que você gosta)</label><textarea id="bf-referencias" rows="2" ${briefingEditavel ? '' : 'disabled'}>${escAv(b.referencias || '')}</textarea>
    <label>Disponibilidade de datas para a captação</label><input id="bf-disponibilidade" ${briefingEditavel ? '' : 'disabled'} value="${escAv(b.disponibilidade || '')}">
    <label>Outras observações</label><textarea id="bf-observacoes" rows="2" ${briefingEditavel ? '' : 'disabled'}>${escAv(b.observacoes || '')}</textarea>
    ${briefingEditavel ? '<button class="btn" id="bf-salvar" style="margin-top:14px">Salvar briefing</button><p id="bf-msg" role="status" style="margin:10px 0 0;font-size:.9rem"></p>' : ''}
  </div>

  <div class="painel">
    <h4>Mensagens com a equipe</h4>
    <div id="msgs">${d.mensagens.map((m) => `<div class="linha-msg ${m.autor}"><b style="font-size:.75rem">${m.autor === 'cliente' ? 'Você' : escAv(m.autor_nome || 'Equipe')}</b><br>${escAv(m.texto)}<br><span style="font-size:.7rem;color:var(--texto2)">${diaAv(m.criado_em)}</span></div>`).join('') || '<p style="color:var(--texto2)">Nenhuma mensagem ainda.</p>'}</div>
    <div style="display:flex;gap:10px;margin-top:12px">
      <input id="msg-texto" placeholder="Escreva para a equipe…" style="flex:1">
      <button class="btn peq" id="msg-enviar">Enviar</button>
    </div>
  </div>`;

  $av('#voltar').onclick = () => avTela();

  // ---- Onda 5: revisão das entregas ----
  document.querySelectorAll('.av-ver').forEach((btn) => {
    btn.onclick = async () => {
      try {
        const r = await apiAv('GET', `/versoes/${btn.dataset.id}/previa`);
        const ehVideo = (r.mime || '').startsWith('video');
        $av('#av-visor').innerHTML = `<div style="position:relative;margin-top:14px;border-radius:12px;overflow:hidden;background:#000">
          ${ehVideo ? `<video id="av-player" src="${r.url}" controls playsinline style="width:100%;display:block;max-height:70vh"></video>`
            : `<img id="av-player" src="${r.url}" alt="prévia" style="width:100%;display:block;max-height:70vh;object-fit:contain">`}
          ${r.previa ? `<div style="position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;
            font-family:'Sora',sans-serif;font-weight:800;font-size:clamp(1.2rem,4vw,2.4rem);color:rgba(255,255,255,.35);
            text-transform:uppercase;letter-spacing:.2em;transform:rotate(-18deg)">Prévia · Villela Alta Vista 360</div>` : ''}
        </div>
        <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;align-items:center">
          <input id="av-coment" placeholder="comentar esta versão…" style="flex:1;min-width:200px">
          ${ehVideo ? '<button class="btn peq" id="av-coment-t">💬 No momento atual</button>' : ''}
          <button class="btn peq" id="av-coment-env" style="background:transparent;border:1px solid var(--linha);color:var(--grafite)">Enviar</button>
        </div>`;
        const enviarComentario = async (ancora) => {
          const texto = $av('#av-coment').value;
          if (!texto.trim()) return;
          try { await apiAv('POST', `/versoes/${btn.dataset.id}/comentarios`, { texto, ancora }); avProjetoDetalhe(id); } catch (e) { alert(e.message); }
        };
        $av('#av-coment-env').onclick = () => enviarComentario(null);
        const bT = $av('#av-coment-t');
        if (bT) bT.onclick = () => { const pl = $av('#av-player'); enviarComentario({ t: pl && pl.currentTime ? pl.currentTime : 0 }); };
      } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-aprovar').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Aprovar formalmente esta entrega? A aprovação fica registrada com seu nome e data.')) return;
      try { await apiAv('POST', `/entregas/${btn.dataset.id}/aprovar`); avProjetoDetalhe(id); } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-baixar').forEach((btn) => {
    btn.onclick = async () => {
      try { const r = await apiAv('GET', `/versoes/${btn.dataset.id}/download`); window.open(r.url, '_blank'); }
      catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-mat-ver').forEach((btn) => {
    btn.onclick = async () => {
      try { const r = await apiAv('GET', `/materiais/${btn.dataset.id}/ver`); window.open(r.url, '_blank'); } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-mat-rm').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Remover este arquivo?')) return;
      try { await apiAv('DELETE', `/materiais/${btn.dataset.id}`); avProjetoDetalhe(id); } catch (e) { alert(e.message); }
    };
  });
  const btnMat = $av('#mat-enviar');
  if (btnMat) btnMat.onclick = async () => {
    const inp = $av('#mat-file');
    const prog = $av('#mat-prog');
    const f = inp.files && inp.files[0];
    if (!f) return alert('Escolha um arquivo.');
    btnMat.disabled = true;
    try {
      const alvo = await apiAv('POST', `/projetos/${id}/materiais/upload-url`, { mime: f.type, tamanho: f.size, nome: f.name });
      await new Promise((res, rej) => {           // XHR para mostrar o progresso do envio
        const x = new XMLHttpRequest();
        x.open('PUT', alvo.url);
        Object.entries(alvo.headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
        x.upload.onprogress = (ev) => { if (ev.lengthComputable) prog.textContent = Math.round(ev.loaded / ev.total * 100) + '%'; };
        x.onload = () => (x.status < 300 ? res() : rej(new Error('Falha no envio (' + x.status + ')')));
        x.onerror = () => rej(new Error('Falha de conexão no envio.'));
        x.send(f);
      });
      await apiAv('POST', `/projetos/${id}/materiais/confirmar`, { upload_id: alvo.upload_id, nome: f.name });
      avProjetoDetalhe(id);
    } catch (e) { alert(e.message); btnMat.disabled = false; prog.textContent = ''; }
  };

  document.querySelectorAll('.av-pagar').forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await apiAv('POST', `/parcelas/${btn.dataset.id}/checkout`);
        location.href = r.init_point; // Checkout Pro hospedado no Mercado Pago
      } catch (e) { alert(e.message); btn.disabled = false; }
    };
  });
  $av('#pj-vincular').onclick = async () => {
    try { await apiAv('POST', `/projetos/${id}/imovel`, { imovel_id: $av('#pj-imovel').value }); avProjetoDetalhe(id); } catch (e) { alert(e.message); }
  };
  if (briefingEditavel) {
    $av('#bf-salvar').onclick = async () => {
      const m = $av('#bf-msg');
      try {
        await apiAv('PUT', `/projetos/${id}/briefing`, {
          objetivo: $av('#bf-objetivo').value, destaques: $av('#bf-destaques').value,
          restricoes: $av('#bf-restricoes').value, referencias: $av('#bf-referencias').value,
          disponibilidade: $av('#bf-disponibilidade').value, observacoes: $av('#bf-observacoes').value,
        });
        m.className = 'ok'; m.textContent = 'Briefing salvo! A equipe já foi avisada.';
      } catch (e) { m.className = 'erro'; m.textContent = e.message; }
    };
  }
  $av('#msg-enviar').onclick = async () => {
    const texto = $av('#msg-texto').value;
    if (!texto.trim()) return;
    try { await apiAv('POST', `/projetos/${id}/mensagens`, { texto }); avProjetoDetalhe(id); } catch (e) { alert(e.message); }
  };
}

// ---------------------------------------------------------------------
// Tours 360° do cliente (Onda 6)
// ---------------------------------------------------------------------
async function avToursCliente(t) {
  const d = await apiAv('GET', '/tours');
  if (!d.tours.length) {
    t.innerHTML = `<div class="painel" style="text-align:center">
      <h3>Você ainda não tem tour 360°</h3>
      <p style="color:var(--texto2)">Quando o seu tour for montado e publicado, o link, o QR Code e as estatísticas aparecem aqui.</p>
      <a class="btn" href="${AV_BASE}/servicos/tour-virtual-360">Conhecer o serviço</a></div>`;
    return;
  }
  t.innerHTML = d.tours.map((tr) => `<div class="painel">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
      <div><h3 style="margin-bottom:4px">${escAv(tr.titulo)}</h3>
        <span class="pill ${tr.status === 'publicado' && !tr.expirado ? 'ouro' : ''}">${tr.expirado ? 'expirado' : tr.status}</span>
        <span style="font-size:.82rem;color:var(--texto2);margin-left:8px">${tr.cenas_total} cena(s) · ${tr.views_total} visualização(ões)${tr.expira_em ? ' · válido até ' + diaAv(tr.expira_em) : ''}</span></div>
      ${tr.status === 'publicado' && !tr.expirado ? `<a class="btn peq" href="${escAv(tr.url)}" target="_blank" rel="noopener">Abrir tour</a>` : ''}
    </div>
    ${tr.status === 'publicado' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn peq av-tr-copiar" data-url="${escAv(tr.url)}" style="background:transparent;border:1px solid var(--linha);color:var(--grafite)">🔗 Copiar link</button>
      <button class="btn peq av-tr-embed" data-embed="${escAv(tr.embed)}" style="background:transparent;border:1px solid var(--linha);color:var(--grafite)">📋 Copiar embed p/ site</button>
      <a class="btn peq" href="${AV_BASE}/api/app/tours/${escAv(tr.id)}/qr" target="_blank" rel="noopener" style="background:transparent;border:1px solid var(--linha);color:var(--grafite)">🔳 QR Code</a>
    </div>` : ''}
    ${tr.expirado || (tr.expira_em && Date.parse(tr.expira_em) - Date.now() < 30 * 86400000) ? `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <span style="font-size:.85rem;color:${tr.expirado ? '#B42318' : 'var(--texto2)'}">${tr.expirado ? 'O tour saiu do ar — renove a hospedagem:' : 'A validade está chegando — renove:'}</span>
      <button class="btn peq av-tr-renovar" data-id="${escAv(tr.id)}" data-plano="mensal">Renovar 1 mês</button>
      <button class="btn peq av-tr-renovar" data-id="${escAv(tr.id)}" data-plano="anual">Renovar 1 ano</button>
    </div>` : ''}
  </div>`).join('');
  document.querySelectorAll('.av-tr-copiar').forEach((b) => {
    b.onclick = () => { navigator.clipboard.writeText(b.dataset.url).then(() => { b.textContent = '✓ Copiado'; }); };
  });
  document.querySelectorAll('.av-tr-embed').forEach((b) => {
    b.onclick = () => { navigator.clipboard.writeText(b.dataset.embed).then(() => { b.textContent = '✓ Copiado'; }); };
  });
  document.querySelectorAll('.av-tr-renovar').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await apiAv('POST', `/tours/${b.dataset.id}/renovar`, { plano: b.dataset.plano });
        if (r.init_point) { location.href = r.init_point; return; }
        alert(r.aviso || 'Renovação registrada — a equipe combina o pagamento com você.');
        avTela();
      } catch (e) { alert(e.message); b.disabled = false; }
    };
  });
}

// ---------------------------------------------------------------------
// Imóveis
// ---------------------------------------------------------------------
async function avImoveis(t) {
  const d = await apiAv('GET', '/imoveis');
  t.innerHTML = `
  ${d.imoveis.map((i) => `<div class="painel">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
      <div><h3 style="margin-bottom:4px">${escAv(i.nome)}</h3>
        <p style="color:var(--texto2);font-size:.88rem;margin:0">${[i.tipo, i.cidade, i.area_m2 ? i.area_m2 + ' m²' : '', i.ambientes ? i.ambientes + ' ambientes' : ''].filter(Boolean).map(escAv).join(' · ') || 'sem detalhes'}</p></div>
      <div><button class="btn peq av-im-editar" data-id="${escAv(i.id)}">Editar</button>
        <button class="btn peq av-im-remover" data-id="${escAv(i.id)}" style="background:transparent;border:1px solid var(--linha);color:var(--grafite)">Remover</button></div>
    </div></div>`).join('') || '<div class="painel"><p style="color:var(--texto2)">Cadastre o seu primeiro imóvel — endereço e instruções de acesso ficam privados.</p></div>'}
  <div class="painel"><button class="btn" id="im-novo">➕ Cadastrar imóvel</button><div id="im-form"></div></div>`;

  const abrirForm = (i) => {
    $av('#im-form').innerHTML = `
      <label>Nome interno (ex.: "Casa do Lago")</label><input id="im-nome" value="${escAv(i ? i.nome : '')}">
      <div class="campos" style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">
        <div><label>Tipo</label><input id="im-tipo" value="${escAv(i ? i.tipo : '')}" placeholder="Casa de temporada"></div>
        <div><label>Finalidade</label><input id="im-fin" value="${escAv(i ? i.finalidade : '')}" placeholder="Aluguel por temporada"></div>
        <div><label>Cidade</label><input id="im-cidade" value="${escAv(i ? i.cidade : '')}"></div>
        <div><label>Área (m²)</label><input id="im-area" value="${escAv(i ? i.area_m2 : '')}" inputmode="numeric"></div>
        <div><label>Nº de ambientes</label><input id="im-amb" type="number" min="0" value="${i ? i.ambientes : ''}"></div>
        <div><label>Contato no local</label><input id="im-contato" value="${escAv(i ? i.contato_local : '')}" placeholder="zelador, co-anfitrião…"></div>
      </div>
      <label>Endereço completo (privado — só a equipe do projeto vê)</label><input id="im-end" value="${escAv(i ? i.endereco : '')}">
      <label>Instruções de acesso (privado)</label><textarea id="im-acesso" rows="2">${escAv(i ? i.acesso : '')}</textarea>
      <label>Link do anúncio principal (opcional)</label><input id="im-link" value="${escAv(i && i.plataformas[0] ? i.plataformas[0].link : '')}" placeholder="https://airbnb.com/...">
      <button class="btn" id="im-salvar" style="margin-top:14px">Salvar imóvel</button>
      <p id="im-msg" role="status" style="margin:10px 0 0;font-size:.9rem"></p>`;
    $av('#im-salvar').onclick = async () => {
      const m = $av('#im-msg');
      try {
        await apiAv('POST', '/imoveis', {
          id: i ? i.id : undefined,
          nome: $av('#im-nome').value, tipo: $av('#im-tipo').value, finalidade: $av('#im-fin').value,
          cidade: $av('#im-cidade').value, area_m2: $av('#im-area').value, ambientes: Number($av('#im-amb').value || 0),
          endereco: $av('#im-end').value, acesso: $av('#im-acesso').value, contato_local: $av('#im-contato').value,
          plataformas: $av('#im-link').value ? [{ nome: 'anúncio', link: $av('#im-link').value }] : [],
        });
        avTela();
      } catch (e) { m.className = 'erro'; m.textContent = e.message; }
    };
  };
  $av('#im-novo').onclick = () => abrirForm(null);
  document.querySelectorAll('.av-im-editar').forEach((b) => { b.onclick = () => { abrirForm(d.imoveis.find((x) => x.id === b.dataset.id)); window.scrollTo(0, document.body.scrollHeight); }; });
  document.querySelectorAll('.av-im-remover').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Remover este imóvel?')) return;
      try { await apiAv('DELETE', '/imoveis/' + b.dataset.id); avTela(); } catch (e) { alert(e.message); }
    };
  });
}

// ---------------------------------------------------------------------
// Conta (perfil + LGPD)
// ---------------------------------------------------------------------
async function avConta(t) {
  t.innerHTML = `
  <div class="painel">
    <h3>Meus dados</h3>
    <label>Nome</label><input id="ct-nome" value="${escAv(AV_ME.nome)}">
    <label>WhatsApp</label><input id="ct-wa" value="${escAv(AV_ME.whatsapp || '')}" inputmode="tel">
    <p style="font-size:.85rem;color:var(--texto2)">E-mail da conta: <b>${escAv(AV_ME.email)}</b></p>
    <button class="btn peq" id="ct-salvar">Salvar</button>
    <p id="ct-msg" role="status" style="margin:10px 0 0;font-size:.9rem"></p>
  </div>
  <div class="painel">
    <h3>Privacidade (LGPD)</h3>
    <p style="color:var(--texto2);font-size:.9rem">Você pode exportar tudo o que temos sobre você, ou excluir a conta (os dados pessoais são anonimizados; projetos concluídos permanecem no histórico sem identificação).</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a class="btn peq" href="${AV_BASE}/api/app/meus-dados" download="meus-dados-alta-vista.json">⬇️ Exportar meus dados</a>
      <button class="btn peq" id="ct-excluir" style="background:transparent;border:1px solid #B42318;color:#B42318">Excluir minha conta</button>
    </div>
    <div id="ct-excluir-box" style="display:none;margin-top:14px">
      <label>Confirme sua senha para excluir</label><input id="ct-senha" type="password">
      <button class="btn peq" id="ct-excluir-conf" style="background:#B42318;border-color:#B42318;color:#fff;margin-top:10px">Confirmar exclusão definitiva</button>
      <p id="ct-exc-msg" role="status" style="margin:8px 0 0;font-size:.9rem"></p>
    </div>
  </div>`;
  $av('#ct-salvar').onclick = async () => {
    const m = $av('#ct-msg');
    try {
      const r = await apiAv('PATCH', '/me', { nome: $av('#ct-nome').value, whatsapp: $av('#ct-wa').value });
      AV_ME = r.cliente; m.className = 'ok'; m.textContent = 'Dados salvos.';
    } catch (e) { m.className = 'erro'; m.textContent = e.message; }
  };
  $av('#ct-excluir').onclick = () => { $av('#ct-excluir-box').style.display = ''; };
  $av('#ct-excluir-conf').onclick = async () => {
    const m = $av('#ct-exc-msg');
    if (!confirm('Tem certeza? Esta ação não pode ser desfeita.')) return;
    try {
      await apiAv('POST', '/excluir-conta', { senha: $av('#ct-senha').value });
      location.href = AV_BASE;
    } catch (e) { m.className = 'erro'; m.textContent = e.message; }
  };
}
