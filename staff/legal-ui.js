'use strict';
// ============================================================================
// Villela Legal — runtime do design system (companheiro do villela-ui.css)
//
// Objetivo: substituir alert()/confirm()/prompt() do navegador — que bloqueiam a
// página, não são estilizáveis nem acessíveis — por toast e diálogo próprios,
// com foco gerenciado, Esc, clique fora e devolução do foco ao elemento de
// origem. Também centraliza o "botão em carregamento", que evita duplo envio.
//
// Sem dependência externa. Escopo global mínimo: um único objeto `LGUI`.
// Carregado no Portal Staff, no workspace do assinante e no portal do cliente.
// ============================================================================

const LGUI = (function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------------ TOAST
  let caixaToasts = null;
  function areaToasts() {
    if (caixaToasts && document.body.contains(caixaToasts)) return caixaToasts;
    caixaToasts = document.createElement('div');
    caixaToasts.className = 'vx vx-toasts';
    // aria-live: leitor de tela anuncia sem roubar o foco de quem está digitando
    caixaToasts.setAttribute('role', 'status');
    caixaToasts.setAttribute('aria-live', 'polite');
    document.body.appendChild(caixaToasts);
    return caixaToasts;
  }
  function toast(mensagem, tipo, detalhe) {
    const el = document.createElement('div');
    el.className = 'vx-toast' + (tipo === 'erro' ? ' vx-toast--erro' : (tipo === 'ok' ? ' vx-toast--ok' : ''));
    const ico = tipo === 'erro' ? '⚠️' : (tipo === 'ok' ? '✓' : 'ℹ️');
    el.innerHTML = `<span aria-hidden="true">${ico}</span><span><b>${esc(mensagem)}</b>${detalhe ? esc(detalhe) : ''}</span>`;
    areaToasts().appendChild(el);
    // erro fica mais tempo na tela: quem errou precisa ler o motivo
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, tipo === 'erro' ? 7000 : 3500);
    return el;
  }

  // ------------------------------------------------- DIÁLOGO (base comum)
  // Devolve uma Promise; resolve com o valor confirmado ou null se cancelado.
  function dialogo({ titulo, corpo, rotuloOk = 'Confirmar', rotuloCancelar = 'Cancelar', perigo = false, valor = null }) {
    return new Promise((resolve) => {
      const origem = document.activeElement;
      const back = document.createElement('div');
      back.className = 'vx vx-backdrop';
      back.innerHTML = `
        <div class="vx-modal${perigo ? ' vx-modal--perigo' : ''}" role="dialog" aria-modal="true" aria-labelledby="lgui-tit">
          <div class="vx-modal-head">
            <h2 id="lgui-tit">${esc(titulo)}</h2>
            <button type="button" class="vx-btn vx-btn--ico" data-lgui="x" aria-label="Fechar">✕</button>
          </div>
          <div class="vx-modal-corpo">${corpo}</div>
          <div class="vx-modal-foot">
            <button type="button" class="vx-btn vx-btn--sec" data-lgui="cancelar">${esc(rotuloCancelar)}</button>
            <button type="button" class="vx-btn${perigo ? ' vx-btn--danger' : ''}" data-lgui="ok">${esc(rotuloOk)}</button>
          </div>
        </div>`;
      document.body.appendChild(back);

      const modal = back.querySelector('.vx-modal');
      const campo = back.querySelector('[data-lgui-campo]');
      const btnOk = back.querySelector('[data-lgui="ok"]');
      const foco = campo || (perigo ? back.querySelector('[data-lgui="cancelar"]') : btnOk);
      if (foco) foco.focus();

      function fechar(resultado) {
        document.removeEventListener('keydown', onTecla, true);
        back.remove();
        if (origem && origem.focus) origem.focus();   // devolve o foco de onde veio
        resolve(resultado);
      }
      function confirmar() {
        if (!campo) return fechar(true);
        const v = campo.value.trim();
        if (campo.required && !v) {
          campo.setAttribute('aria-invalid', 'true');
          let err = modal.querySelector('.vx-erro');
          if (!err) { err = document.createElement('p'); err.className = 'vx-erro'; campo.insertAdjacentElement('afterend', err); }
          err.textContent = 'Este campo é obrigatório.';
          campo.focus();
          return;
        }
        fechar(v);
      }
      function onTecla(e) {
        if (e.key === 'Escape') { e.preventDefault(); fechar(null); return; }
        if (e.key === 'Enter' && campo && campo.tagName !== 'TEXTAREA') { e.preventDefault(); confirmar(); return; }
        if (e.key !== 'Tab') return;
        // armadilha de foco: Tab circula só dentro do diálogo (a11y 2.4.3)
        const alvos = [...modal.querySelectorAll('button, input, select, textarea, a[href]')].filter(x => !x.disabled);
        if (!alvos.length) return;
        const primeiro = alvos[0], ultimo = alvos[alvos.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
      document.addEventListener('keydown', onTecla, true);
      back.addEventListener('click', (e) => { if (e.target === back) fechar(null); });
      back.querySelector('[data-lgui="x"]').addEventListener('click', () => fechar(null));
      back.querySelector('[data-lgui="cancelar"]').addEventListener('click', () => fechar(null));
      btnOk.addEventListener('click', confirmar);
    });
  }

  // Confirmação de ação crítica: o padrão é CANCELAR (o foco nasce lá).
  function confirmar({ titulo = 'Confirmar ação', texto = '', rotuloOk = 'Confirmar', perigo = true } = {}) {
    return dialogo({
      titulo, perigo, rotuloOk,
      corpo: `<p>${esc(texto)}</p>`,
    }).then(r => r === true);
  }

  // Substituto do prompt(): rótulo de verdade (não placeholder), obrigatório opcional.
  function pedirTexto({ titulo, rotulo, ajuda = '', valor = '', obrigatorio = true, linhas = 1, rotuloOk = 'Salvar' } = {}) {
    const campo = linhas > 1
      ? `<textarea data-lgui-campo id="lgui-campo" rows="${linhas}"${obrigatorio ? ' required' : ''}>${esc(valor)}</textarea>`
      : `<input data-lgui-campo id="lgui-campo" type="text" value="${esc(valor)}"${obrigatorio ? ' required' : ''}>`;
    return dialogo({
      titulo, rotuloOk,
      corpo: `<div class="vx-campo">
        <label for="lgui-campo">${esc(rotulo)}${obrigatorio ? '<span class="vx-req" aria-hidden="true">*</span>' : ''}</label>
        ${campo}${ajuda ? `<span class="vx-ajuda">${esc(ajuda)}</span>` : ''}</div>`,
    }).then(r => (r === null || r === true ? null : r));
  }

  // Escolha entre opções fixas (substitui prompt() de status/enum).
  function escolher({ titulo, rotulo, opcoes = [], valor = '', rotuloOk = 'Aplicar' } = {}) {
    const ops = opcoes.map(o => {
      const [v, r] = Array.isArray(o) ? o : [o, String(o).replace(/_/g, ' ')];
      return `<option value="${esc(v)}"${v === valor ? ' selected' : ''}>${esc(r)}</option>`;
    }).join('');
    return dialogo({
      titulo, rotuloOk,
      corpo: `<div class="vx-campo"><label for="lgui-campo">${esc(rotulo)}</label>
        <select data-lgui-campo id="lgui-campo" required>${ops}</select></div>`,
    }).then(r => (r === null || r === true ? null : r));
  }

  // ------------------------------------------------ BOTÃO EM CARREGAMENTO
  // Trava o botão enquanto a promessa não resolve — remédio contra duplo envio.
  async function comCarregando(botao, fn) {
    if (botao) { botao.setAttribute('data-carregando', '1'); botao.setAttribute('aria-busy', 'true'); }
    try { return await fn(); }
    finally { if (botao) { botao.removeAttribute('data-carregando'); botao.removeAttribute('aria-busy'); } }
  }

  // ------------------------------------------------------------ ESQUELETOS
  function skeleton(tipo = 'linha', n = 3) {
    if (tipo === 'kpis') return `<div class="vx-kpis">${'<div class="vx-skel vx-skel--kpi"></div>'.repeat(n)}</div>`;
    if (tipo === 'bloco') return `<div class="vx-skel vx-skel--bloco"></div>`;
    return `<div>${'<div class="vx-skel vx-skel--linha"></div>'.repeat(n)}</div>`;
  }
  function carregando(texto = 'Carregando…') {
    return `<p class="vx-muted" role="status"><span class="vx-spinner" aria-hidden="true"></span> ${esc(texto)}</p>`;
  }
  // Estado vazio que explica o que houve e o que fazer (item 16 do briefing).
  function vazio({ ico = '📄', titulo = 'Nada por aqui ainda', texto = '', acao = '' } = {}) {
    return `<div class="vx-vazio">
      <div class="vx-vazio-ico" aria-hidden="true">${ico}</div>
      <div class="vx-vazio-tit">${esc(titulo)}</div>
      ${texto ? `<p>${esc(texto)}</p>` : ''}${acao || ''}</div>`;
  }
  // Erro com causa e saída — nunca só "Erro: ..."
  function erro({ titulo = 'Não foi possível carregar', texto = '', acao = '' } = {}) {
    return `<div class="vx-alerta vx-alerta--danger" role="alert">
      <span class="vx-alerta-ico" aria-hidden="true">⚠️</span>
      <div><b>${esc(titulo)}</b><p class="vx-mb0">${esc(texto)}</p>${acao || ''}</div></div>`;
  }

  return { toast, confirmar, pedirTexto, escolher, comCarregando, skeleton, carregando, vazio, erro, dialogo, esc };
})();

if (typeof window !== 'undefined') window.LGUI = LGUI;
