// =====================================================================
// Voz — as páginas que exigem sessão do staff: AUTORIZAR um pedido e
// VER o detalhe de um pedido.
//
// A página de autorização é o lugar onde a decisão do Augusto vira
// mecanismo: o WhatsApp leva só uma linha e um link; quem autoriza é a
// SESSÃO, não o link. Um link vazado sem sessão não autoriza nada — cai
// na tela de login.
//
// É também o único lugar onde o dado pessoal aparece por extenso: aqui
// há sessão autenticada e o Augusto precisa ver exatamente o que vai
// acontecer antes de clicar. No WhatsApp, não (voz/notificar.js).
// =====================================================================
'use strict';
const repo = require('./repo');
const acoes = require('./acoes');
const aprovacoesLib = require('./aprovacoes');

/**
 * Resolvedor de destino, injetado por quem monta.
 *
 * A promessa da pagina e "voce ve exatamente o que vai acontecer antes de
 * clicar". Sem isto, o pedido de e-mail mostraria `para: contador` e o
 * endereco real so apareceria DEPOIS do envio — ou seja, voce autorizaria
 * no escuro, confiando numa configuracao que talvez tenha um erro de
 * digitacao. Aqui e o unico lugar onde o endereco aparece: a pagina exige
 * sessao de admin, e a mensagem do WhatsApp continua sem ele.
 */
let _resolverDestino = null;
const configurar = ({ resolverDestino } = {}) => {
  if (typeof resolverDestino === 'function') _resolverDestino = resolverDestino;
  return { temResolvedor: !!_resolverDestino };
};

/** Nunca deixa a pagina cair por causa de um resolvedor que lancou. */
function destinoDe(pedido) {
  if (!_resolverDestino || !pedido || !pedido.acao) return null;
  try { return _resolverDestino(pedido.acao, pedido.parametros || {}) || null; }
  catch (_) { return null; }
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CSS = `
:root{--tinta:#1B2A4A;--ouro:#C9A227;--fundo:#f6f7f9;--cartao:#fff;--borda:#e2e6ec;--fraco:#6b7075;--perigo:#b42318;--ok:#0e7490}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:#2b2d2f;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:24px 16px 48px}
.topo{background:var(--tinta);color:#f8f9fa;padding:16px 20px;border-radius:12px 12px 0 0}
.topo b{font-size:18px}.topo span{display:block;font-size:13px;color:var(--ouro)}
.cartao{background:var(--cartao);border:1px solid var(--borda);border-top:none;border-radius:0 0 12px 12px;padding:20px}
h1{font-size:20px;margin:0 0 4px}
.resumo{font-size:19px;font-weight:600;line-height:1.4;margin:8px 0 18px}
.rot{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--fraco);margin:16px 0 4px}
.cita{background:#f2f4f7;border-left:3px solid var(--borda);padding:10px 12px;border-radius:0 6px 6px 0;font-style:italic}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:4px}
td{padding:6px 8px;border-bottom:1px solid var(--borda);vertical-align:top}
td:first-child{color:var(--fraco);width:34%;white-space:nowrap}
.nivel{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700}
.n1,.n2{background:#e7f5ef;color:#046c4e}.n3{background:#fef3c7;color:#92400e}.n4{background:#fee2e2;color:var(--perigo)}
.acoes{display:flex;gap:10px;margin-top:24px;flex-wrap:wrap}
button{font:inherit;font-weight:700;padding:13px 22px;border-radius:9px;border:0;cursor:pointer;flex:1;min-width:150px}
.sim{background:var(--ok);color:#fff}.nao{background:#fff;color:var(--perigo);border:1px solid var(--perigo)}
button[disabled]{opacity:.5;cursor:progress}
.aviso{margin-top:18px;padding:12px 14px;border-radius:8px;font-size:14px}
.aviso.alerta{background:#fef3c7;color:#92400e}.aviso.erro{background:#fee2e2;color:var(--perigo)}
.aviso.ok{background:#e7f5ef;color:#046c4e}
.pe{margin-top:18px;font-size:13px;color:var(--fraco)}
a{color:var(--ok)}
`;

const moldura = (titulo, corpo) => `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titulo)} — Villela Stay</title>
<style>${CSS}</style></head><body><div class="wrap">
<div class="topo"><b>Villela Stay</b><span>Comandos por voz</span></div>
<div class="cartao">${corpo}</div></div></body></html>`;

const NIVEIS_TXT = {
  1: 'Leitura', 2: 'Escrita interna', 3: 'Toca pessoa real ou dado externo', 4: 'Código e deploy',
};

/**
 * requireAuth do núcleo responde 401 em JSON — que numa PÁGINA vira um
 * blob ilegível na tela. Interceptamos só a RECUSA para mostrar HTML.
 * A verificação de sessão continua sendo a do núcleo: duplicá-la aqui
 * seria criar um segundo caminho de permissão, que é como um deles
 * acaba ficando para trás.
 */
function paginaAutenticada(requireAuth, handler) {
  return (req, res) => {
    const proxy = {
      status() { return proxy; },
      json() {
        res.status(401).type('html').send(moldura('Entrar', `
          <h1>Faça login para continuar</h1>
          <p>Esta página exige a sua sessão do Portal Staff. O link sozinho não autoriza nada.</p>
          <p><a href="/staff/">Entrar no Portal Staff</a> e abrir o link de novo.</p>`));
        return proxy;
      },
      setHeader: (...a) => res.setHeader(...a),
    };
    requireAuth(req, proxy, () => handler(req, res));
  };
}

function linhasParametros(parametros = {}) {
  const ent = Object.entries(parametros || {});
  if (!ent.length) return '<tr><td>parâmetros</td><td>—</td></tr>';
  return ent.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
}

function blocoPedido(pedido) {
  const nivel = pedido.nivel || acoes.nivelDe(pedido.acao);
  const destino = destinoDe(pedido);
  return `
    <p class="rot">O que foi dito</p>
    <p class="cita">“${esc(pedido.texto_original)}”${pedido.transcrito ? ' <small>(transcrito de áudio)</small>' : ''}</p>
    <p class="rot">O que o sistema entendeu</p>
    <table>
      <tr><td>ação</td><td><code>${esc(pedido.acao || '—')}</code></td></tr>
      ${linhasParametros(pedido.parametros)}
      ${destino ? `<tr><td>destino real</td><td><strong>${esc(destino)}</strong></td></tr>` : ''}
      <tr><td>nível</td><td><span class="nivel n${nivel}">${nivel} — ${esc(NIVEIS_TXT[nivel] || '?')}</span></td></tr>
      <tr><td>canal</td><td>${esc(pedido.canal)}${pedido.ator ? ` · ${esc(pedido.ator)}` : ''}</td></tr>
      <tr><td>recebido em</td><td>${esc(pedido.criado_em)}</td></tr>
    </table>`;
}

/** Página de AUTORIZAÇÃO. */
function paginaAprovacao(token) {
  const estado = aprovacoesLib.consultar(token);
  if (!estado.ok) {
    const msg = {
      inexistente: 'Este link não existe. Pode ter sido digitado errado.',
      usado: 'Este pedido já foi decidido. Cada autorização vale uma vez só.',
      expirado: 'Este link venceu. Peça de novo por voz para gerar um novo.',
    }[estado.motivo] || 'Link inválido.';
    return moldura('Autorização', `<h1>Não dá para autorizar</h1>
      <div class="aviso alerta">${esc(msg)}</div>
      <p class="pe"><a href="/staff/">Ir para o Portal Staff</a></p>`);
  }

  const { pedido, aprovacao } = estado;
  const nivel = pedido.nivel || acoes.nivelDe(pedido.acao);
  return moldura('Autorização', `
    <h1>Autorizar?</h1>
    <p class="resumo">${esc(acoes.resumir(pedido.acao, pedido.parametros))}</p>
    ${nivel >= 4 ? '<div class="aviso erro">Nível 4: mexe no próprio sistema. Autorizar abre um PR — nada vai ao ar sem um segundo passo.</div>' : ''}
    ${blocoPedido(pedido)}
    <div class="acoes">
      <button class="sim" id="sim">Autorizar</button>
      <button class="nao" id="nao">Recusar</button>
    </div>
    <div id="saida"></div>
    <p class="pe">Vence em ${esc(aprovacao.expira_em)}. Uma autorização vale uma vez só.</p>
    <script>
      const saida = document.getElementById('saida');
      async function decidir(decisao) {
        for (const b of document.querySelectorAll('button')) b.disabled = true;
        try {
          const r = await fetch(location.pathname, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decisao }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.erro || ('Falha ' + r.status));
          saida.innerHTML = '<div class="aviso ok">' +
            (decisao === 'aprovar' ? 'Autorizado. Vou executar e te aviso no WhatsApp.' : 'Recusado. Nada foi feito.') +
            '</div>';
          document.querySelector('.acoes').style.display = 'none';
        } catch (e) {
          saida.innerHTML = '<div class="aviso erro">' + e.message + '</div>';
          for (const b of document.querySelectorAll('button')) b.disabled = false;
        }
      }
      document.getElementById('sim').onclick = () => decidir('aprovar');
      document.getElementById('nao').onclick = () => decidir('recusar');
    </script>`);
}

const STATUS_TXT = {
  recebido: 'Recebido', respondido: 'Respondido', aguardando_aprovacao: 'Aguardando autorização',
  aprovado: 'Autorizado', recusado: 'Recusado', executando: 'Executando', concluido: 'Concluído',
  falhou: 'Falhou', nao_entendido: 'Não entendido', nao_suportado: 'Ainda não sei fazer', expirado: 'Vencido',
};

/** Página de DETALHE — é o "documento" para onde o link do WhatsApp leva. */
function paginaPedido(id) {
  const pedido = repo.porId(id);
  if (!pedido) {
    return moldura('Pedido', `<h1>Pedido não encontrado</h1>
      <div class="aviso alerta">Este pedido não existe.</div>
      <p class="pe"><a href="/staff/">Ir para o Portal Staff</a></p>`);
  }
  const trilha = repo.auditoriaDo(id)
    .map((a) => `<tr><td>${esc(a.criado_em)}</td><td>${esc(a.evento)}</td></tr>`).join('');
  const resultado = pedido.resultado == null ? '' :
    `<p class="rot">Resultado</p><pre class="cita" style="white-space:pre-wrap;font-style:normal">${esc(
      typeof pedido.resultado === 'string' ? pedido.resultado : JSON.stringify(pedido.resultado, null, 2)).slice(0, 8000)}</pre>`;

  return moldura('Pedido', `
    <h1>${esc(STATUS_TXT[pedido.status] || pedido.status)}</h1>
    <p class="resumo">${esc(pedido.acao ? acoes.resumir(pedido.acao, pedido.parametros) : pedido.texto_original)}</p>
    ${pedido.erro ? `<div class="aviso erro">${esc(pedido.erro)}</div>` : ''}
    ${blocoPedido(pedido)}
    ${pedido.fala ? `<p class="rot">O que respondi por voz</p><p class="cita">“${esc(pedido.fala)}”</p>` : ''}
    ${resultado}
    <p class="rot">Trilha</p>
    <table>${trilha || '<tr><td colspan="2">—</td></tr>'}</table>
    <p class="pe"><a href="/staff/">Portal Staff</a></p>`);
}

module.exports = { configurar, paginaAutenticada, paginaAprovacao, paginaPedido, moldura, esc };
