/* Cartão de UPGRADE do Grupo Villela Stay (compartilhado por todos os painéis).
 * O servidor responde 402 com corpo estruturado (nucleo/upgrade.js); o painel chama:
 *   VillelaUpgrade.mostrar(corpo, { assinar: async (slug, ciclo) => urlDoCheckout, planos: () => abrirTelaDePlanos() })
 * Sem JS de framework, sem dependência. Cores vêm das variáveis do design system, com padrão seguro. */
(function () {
  'use strict';
  if (window.VillelaUpgrade) return;

  var CSS = '' +
    '.vu-dlg{border:0;border-radius:14px;padding:0;max-width:min(460px,calc(100vw - 32px));width:100%;box-shadow:0 18px 48px rgba(0,0,0,.28);color:var(--vx-ink,#1c2a33);background:var(--vx-surface,#fff)}' +
    '.vu-dlg::backdrop{background:rgba(10,22,30,.55)}' +
    '.vu-in{padding:22px 22px 18px}' +
    '.vu-tag{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--vx-accent,#0f4c81);margin-bottom:6px}' +
    '.vu-t{margin:0 0 8px;font-size:1.15rem;line-height:1.25}' +
    '.vu-p{margin:0 0 12px;font-size:.95rem;line-height:1.5}' +
    '.vu-uso{margin:0 0 14px}.vu-uso small{display:block;margin-bottom:4px;opacity:.8}' +
    '.vu-bar{height:8px;border-radius:99px;background:rgba(127,127,127,.22);overflow:hidden}.vu-bar>i{display:block;height:100%;background:var(--vx-accent,#0f4c81)}' +
    '.vu-ac{display:flex;flex-direction:column;gap:8px;margin-top:6px}' +
    '.vu-b{font:inherit;cursor:pointer;border-radius:10px;padding:11px 14px;border:1px solid var(--vx-accent,#0f4c81);background:transparent;color:var(--vx-accent,#0f4c81);font-weight:600}' +
    '.vu-b--p{background:var(--vx-accent,#0f4c81);color:#fff}' +
    '.vu-b[disabled]{opacity:.6;cursor:progress}' +
    '.vu-b:focus-visible{outline:3px solid rgba(15,76,129,.45);outline-offset:2px}' +
    '.vu-l{background:none;border:0;padding:6px;font:inherit;font-size:.85rem;text-decoration:underline;cursor:pointer;color:inherit;opacity:.85}' +
    '.vu-err{margin:10px 0 0;font-size:.88rem;color:var(--vx-danger,#b3261e)}';

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function reais(c) { var v = Number(c) / 100; return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: Number(c) % 100 ? 2 : 0, maximumFractionDigits: 2 }); }

  var TITULOS = {
    limite: ['Limite do plano', 'Você chegou ao limite do seu plano'],
    modulo: ['Outro plano', 'Este recurso é de outro plano'],
    recurso: ['Outro plano', 'Este recurso é de outro plano'],
    conta: ['Assinatura', 'Sua assinatura precisa de atenção']
  };

  /** true quando a resposta do servidor é um erro de plano estruturado (402 com `codigo`). */
  function ehPlano(status, corpo) { return status === 402 && corpo && typeof corpo.codigo === 'string' && /^(limite|modulo|recurso|conta)$/.test(corpo.codigo); }

  var aberto = null;
  function mostrar(c, opts) {
    opts = opts || {};
    if (aberto) { try { aberto.close(); } catch (_) {} aberto.remove(); aberto = null; }
    if (!document.getElementById('vu-css')) { var st = el('style'); st.id = 'vu-css'; st.textContent = CSS; document.head.appendChild(st); }

    var t = TITULOS[c.codigo] || TITULOS.limite;
    var d = document.createElement('dialog'); d.className = 'vu-dlg'; d.setAttribute('aria-labelledby', 'vu-t');
    var box = el('div', 'vu-in');
    box.appendChild(el('span', 'vu-tag', t[0]));
    var h = el('h2', 'vu-t', t[1]); h.id = 'vu-t'; box.appendChild(h);
    box.appendChild(el('p', 'vu-p', c.erro || ''));

    if (c.codigo === 'limite' && c.limite > 0 && c.usado != null) {
      var u = el('div', 'vu-uso'); u.appendChild(el('small', '', 'Em uso: ' + c.usado + ' de ' + c.limite));
      var bar = el('div', 'vu-bar'); var fill = document.createElement('i');
      fill.style.width = Math.min(100, Math.round((c.usado / c.limite) * 100)) + '%'; bar.appendChild(fill); u.appendChild(bar); box.appendChild(u);
    }

    // fecha e remove na hora (não depende do evento `close`, que pode atrasar em aba em segundo plano)
    function fechar() { try { d.close(); } catch (_) {} d.remove(); if (aberto === d) aberto = null; }
    var ac = el('div', 'vu-ac'); var msg = el('p', 'vu-err'); msg.setAttribute('role', 'alert'); msg.hidden = true;
    var sug = c.plano_sugerido;
    var primeiro = null;
    function ir(slug, ciclo, btn) {
      msg.hidden = true; if (btn) btn.disabled = true;
      Promise.resolve().then(function () { return opts.assinar(slug, ciclo); }).then(function (url) {
        if (url) { window.location.href = url; } else if (btn) { btn.disabled = false; }
      }).catch(function (e) {
        if (btn) btn.disabled = false;
        msg.textContent = (e && e.message) || 'Não foi possível abrir o pagamento agora.'; msg.hidden = false;
      });
    }
    if (sug && typeof opts.assinar === 'function') {
      primeiro = el('button', 'vu-b vu-b--p', 'Fazer upgrade para ' + sug.nome + ' · ' + reais(sug.preco_centavos) + '/mês');
      primeiro.type = 'button'; primeiro.onclick = function () { ir(sug.slug, 'mensal', primeiro); }; ac.appendChild(primeiro);
      if (sug.preco_anual_centavos > 0) {
        var an = el('button', 'vu-l', 'ou ' + reais(sug.preco_anual_centavos) + '/ano (2 meses grátis)'); an.type = 'button';
        an.onclick = function () { ir(sug.slug, 'anual', null); }; ac.appendChild(an);
      }
    }
    if (typeof opts.planos === 'function') {
      var vp = el('button', primeiro ? 'vu-b' : 'vu-b vu-b--p', c.codigo === 'conta' ? 'Ver minha assinatura' : 'Ver planos');
      vp.type = 'button'; vp.onclick = function () { fechar(); opts.planos(); }; ac.appendChild(vp); if (!primeiro) primeiro = vp;
    }
    var fe = el('button', 'vu-l', 'Agora não'); fe.type = 'button'; fe.onclick = fechar; ac.appendChild(fe);
    box.appendChild(ac); box.appendChild(msg); d.appendChild(box);
    d.addEventListener('close', function () { d.remove(); if (aberto === d) aberto = null; });
    document.body.appendChild(d); aberto = d; d.showModal();
    if (primeiro) primeiro.focus();
    return d;
  }

  window.VillelaUpgrade = { mostrar: mostrar, ehPlano: ehPlano };
})();
