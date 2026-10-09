/* =====================================================================
 * Villela Academy — CARTEIRA DE IA no painel (carteira-ia.js no servidor).
 * Servido em /academy/carteira.js e usado por app-cliente.js em dois pontos:
 *   1. api(): quando o servidor responde 402 com um orçamento, é aqui que o
 *      usuário vê o valor e decide. Vale para TODA função que usa IA — o
 *      Tutor, o mentor, o lapidar e as ferramentas do produtor não têm cada
 *      um a sua pergunta: têm esta.
 *   2. Conta e pagamentos: saldo, recarga e extrato.
 * O valor aceito viaja no cabeçalho X-IA-Aceite; quem confere é o servidor.
 * JS clássico (var/function), sem build.
 * ===================================================================== */
(function () {
  'use strict';
  var api = null, esc = null, estado = null;

  function guardado() { try { return Number(sessionStorage.getItem('ia-aceite')) || 0; } catch (e) { return 0; } }
  function guardar(v) { try { sessionStorage.setItem('ia-aceite', String(v)); } catch (e) { /* sem armazenamento: pergunta toda vez */ } }
  function dataHora(iso) { var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  function ler() {
    return fetch('/academy/api/ia/carteira', { headers: { 'Content-Type': 'application/json' } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d && d.erro || ('erro ' + r.status)); estado = d; return d; }); });
  }

  function estilo() {
    if (document.getElementById('ci-css')) return;
    var s = document.createElement('style');
    s.id = 'ci-css';
    s.textContent =
      '.ci-dlg{border:0;border-radius:16px;padding:0;max-width:440px;width:calc(100% - 32px);box-shadow:0 24px 60px rgba(16,24,40,.28);color:#101828;font-family:Inter,sans-serif}' +
      '.ci-dlg::backdrop{background:rgba(11,17,32,.55)}' +
      '.ci-cx{padding:22px}.ci-cx h3{font:600 1.2rem Lora,Georgia,serif;color:#1B2A4A;margin:0 0 8px}' +
      '.ci-cx p{margin:0 0 10px;line-height:1.5;font-size:.95rem;color:#475467}' +
      '.ci-cx p.ci-valor{font:700 2rem/1.1 Inter,sans-serif;color:#1B2A4A;margin:6px 0 10px}.ci-cx p.ci-valor small{font:400 .85rem Inter,sans-serif;color:#79839A}' +
      '.ci-lembrar{display:flex;gap:8px;align-items:flex-start;font-size:.88rem;color:#475467;margin:12px 0 0;font-weight:400}' +
      '.ci-lembrar input{width:auto;height:auto;min-height:0;padding:0;margin:3px 0 0;display:inline-block;flex:none}' +
      '.ci-bts{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}' +
      '.ci-saldo{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:baseline;margin-bottom:12px}.ci-saldo b{font:700 1.8rem/1 Inter,sans-serif;color:#1B2A4A}' +
      '.ci-ext{width:100%;border-collapse:collapse;font-size:.9rem;margin-top:10px}.ci-ext td{padding:7px 0;border-bottom:1px solid #F0F2F5;vertical-align:top}' +
      '.ci-ext td.q{color:#79839A;white-space:nowrap;padding-right:12px}.ci-ext td.v{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;padding-left:12px}' +
      '.ci-ext td.v.mais{color:#0B5C41}' +
      '.ci-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1B2A4A;color:#fff;border-radius:99px;padding:10px 18px;font:500 .88rem Inter,sans-serif;z-index:9999;box-shadow:0 10px 30px rgba(16,24,40,.3);max-width:calc(100% - 32px);text-align:center}';
    document.head.appendChild(s);
  }
  function toast(texto) {
    estilo();
    var t = document.createElement('div');
    t.className = 'ci-toast'; t.setAttribute('role', 'status'); t.textContent = texto;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 6000);
  }

  // ---------------- o pedido de aceite (402) ----------------
  // Devolve uma promessa: true = aceitou este valor; false = desistiu (nada foi cobrado).
  function pedir(d) {
    estilo();
    return new Promise(function (resolver) {
      var dlg = document.createElement('dialog');
      dlg.className = 'ci-dlg';
      var falta = d.motivo === 'saldo_insuficiente';
      dlg.innerHTML = '<div class="ci-cx">' + (falta
        ? '<h3>Saldo de IA insuficiente</h3><p>Esta ação usa inteligência artificial e custa até</p>' +
          '<p class="ci-valor">' + esc(d.orcamento) + '</p><p>Seu saldo é <b>' + esc(d.saldo) + '</b>. Nada foi gerado nem cobrado.</p>' +
          '<div class="ci-bts"><button class="al-bt" data-a="saldo">Colocar saldo</button><button class="al-bt fan" data-a="nao">Agora não</button></div>'
        : '<h3>Esta ação usa IA</h3><p>Ela custa até</p><p class="ci-valor">' + esc(d.orcamento) + ' <small>· seu saldo: ' + esc(d.saldo) + '</small></p>' +
          '<p>Esse é o valor máximo. Depois de gerar, você paga só o que foi usado e a diferença volta ao saldo. Se não gerar, não paga.</p>' +
          '<label class="ci-lembrar"><input type="checkbox" id="ci-lembrar"> Não perguntar de novo nesta sessão para ações de até ' + esc(d.orcamento) + '</label>' +
          '<div class="ci-bts"><button class="al-bt" data-a="sim">Confirmar e gerar</button><button class="al-bt fan" data-a="nao">Cancelar</button></div>') + '</div>';
      document.body.appendChild(dlg);
      var fim = function (ok) { if (dlg.open) dlg.close(); if (dlg.parentNode) dlg.parentNode.removeChild(dlg); resolver(ok); };
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); fim(false); }); // Esc = desistir
      Array.prototype.forEach.call(dlg.querySelectorAll('[data-a]'), function (b) {
        b.onclick = function () {
          var a = b.getAttribute('data-a');
          if (a === 'sim') { var c = dlg.querySelector('#ci-lembrar'); if (c && c.checked) guardar(d.orcamento_milesimos); fim(true); }
          else if (a === 'saldo') { fim(false); if (window.AcademyCarteiraUI.irParaConta) window.AcademyCarteiraUI.irParaConta(); }
          else fim(false);
        };
      });
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
  }
  // depois de uma chamada paga: diz quanto saiu de verdade
  function depois() {
    if (!api) return;
    ler().then(function (c) {
      var u = (c.extrato || [])[0];
      // só o uso que acabou de acontecer: chamada que saiu pela franquia não repete o aviso da anterior
      if (u && u.tipo === 'uso' && u.milesimos < 0 && Date.now() - Date.parse(u.quando) < 20000) toast('IA: ' + u.valor + ' debitado · saldo ' + c.saldo);
      var alvo = document.getElementById('c-ia');
      if (alvo) pintar(alvo, c);
    }).catch(function () {});
  }
  // o rodapé do Tutor e do mentor: com a carteira ligada, o que importa é o saldo
  function rodape(restantes) {
    if (estado && estado.ativa && !estado.isento) return 'Saldo de IA: ' + estado.saldo + '. Antes de gerar, você vê o valor e confirma.';
    return restantes + ' consulta' + (restantes === 1 ? '' : 's') + ' de IA restante' + (restantes === 1 ? '' : 's') + ' hoje.';
  }

  // ---------------- Conta e pagamentos ----------------
  function pintar(alvo, c) {
    estilo();
    if (!c.ativa) { alvo.innerHTML = '<p class="al-sub">O Tutor e as ferramentas de IA estão incluídos no seu acesso, com limite de ' + c.limite_dia + ' consultas por dia.</p>'; return; }
    var h = '<div class="ci-saldo"><b>' + esc(c.saldo) + '</b><span class="al-sub">' + (c.isento ? 'conta isenta de cobrança' : 'de saldo para o Tutor, o mentor e as ferramentas de IA') + '</span></div>' +
      '<p class="al-sub">Cada ação mostra o valor máximo antes de gerar; depois, você paga só o que foi usado. O saldo é em reais e vale em todos os cursos.</p>';
    if (!c.isento) {
      h += c.pagamento_online
        ? '<div class="ci-bts">' + c.pacotes.map(function (p) { return '<button class="al-bt' + (p === c.pacotes[0] ? '' : ' fan') + '" data-rec="' + p.valor_centavos + '">Colocar ' + esc(p.rotulo) + '</button>'; }).join('') + '</div><span id="ci-msg" class="erro"></span>'
        : '<p class="al-sub">A recarga online está indisponível no momento.</p>';
      if ((c.recargas_pendentes || []).length) {
        h += '<p class="al-sub" style="margin-top:12px">Recarga aguardando confirmação do pagamento. ' +
          c.recargas_pendentes.map(function (r) { return '<button class="al-bt peq fan" data-conf="' + esc(r.id) + '">Já paguei R$ ' + (r.valor_centavos / 100).toFixed(0) + ' — conferir</button>'; }).join(' ') + '</p>';
      }
    }
    h += (c.extrato || []).length
      ? '<table class="ci-ext">' + c.extrato.map(function (x) {
          return '<tr><td class="q">' + dataHora(x.quando) + '</td><td>' + esc(x.descricao) + '</td><td class="v' + (x.milesimos > 0 ? ' mais' : '') + '">' + (x.milesimos > 0 ? '+ ' : x.milesimos < 0 ? '− ' : '') + esc(x.valor) + '</td></tr>';
        }).join('') + '</table>'
      : '<p class="al-sub" style="margin-top:12px">Nenhum movimento ainda.</p>';
    alvo.innerHTML = h;
    Array.prototype.forEach.call(alvo.querySelectorAll('[data-rec]'), function (b) {
      b.onclick = function () {
        b.disabled = true;
        api('POST', '/ia/carteira/recarga', { valor_centavos: Number(b.getAttribute('data-rec')) }).then(function (r) {
          if (r.init_point) location.href = r.init_point; // pagamento no Mercado Pago; o crédito entra pela confirmação dele
        }).catch(function (e) { b.disabled = false; var m = document.getElementById('ci-msg'); if (m) m.textContent = e.message; });
      };
    });
    Array.prototype.forEach.call(alvo.querySelectorAll('[data-conf]'), function (b) {
      b.onclick = function () { b.disabled = true; conferir(b.getAttribute('data-conf'), function () { secao(alvo); }); };
    });
  }
  function secao(alvo) {
    if (!alvo || !api) return;
    ler().then(function (c) { pintar(alvo, c); }).catch(function (e) { alvo.innerHTML = '<p class="erro">' + esc(e.message) + '</p>'; });
  }
  function conferir(id, depoisDe) {
    api('POST', '/ia/carteira/recarga/' + encodeURIComponent(id) + '/conferir').then(function (r) {
      toast(r.status === 'paga' ? 'Recarga confirmada · saldo ' + r.saldo : 'Pagamento ainda não confirmado. Assim que o Mercado Pago avisar, o saldo entra sozinho.');
      if (depoisDe) depoisDe();
    }).catch(function (e) { toast(e.message); if (depoisDe) depoisDe(); });
  }

  function iniciar(D) {
    api = D.api; esc = D.esc;
    window.AcademyCarteiraUI.irParaConta = D.irParaConta;
    ler().catch(function () {});
    // voltou do Mercado Pago: confere a recarga (o retorno do navegador sozinho não credita nada)
    var m = /[?&]recarga=([\w-]+)/.exec(location.search);
    if (m) {
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* sem history: segue */ }
      conferir(m[1]);
    }
  }

  window.AcademyCarteiraUI = { iniciar: iniciar, pedir: pedir, depois: depois, rodape: rodape, secao: secao, aceiteGuardado: guardado };
})();
